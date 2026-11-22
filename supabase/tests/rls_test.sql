-- =====================================================================
-- RLS / 권한 / 가격 위변조 방지 테스트 (로컬 Postgres + auth 스텁)
--   실행: scripts/test-db.sh
--   실패 시 예외 발생 → ON_ERROR_STOP 으로 중단
-- =====================================================================
\set ON_ERROR_STOP 1

-- 테스트 계정
insert into auth.users (id, email) values
  ('00000000-0000-4000-e000-00000000000a', 'admin@test.local'),
  ('00000000-0000-4000-e000-00000000000b', 'pa@test.local'),
  ('00000000-0000-4000-e000-00000000000c', 'pb@test.local'),
  ('00000000-0000-4000-e000-00000000000d', 'signup@test.local')
on conflict do nothing;
update public.users set role = 'admin', name = '본사관리자', is_active = true where id = '00000000-0000-4000-e000-00000000000a';
update public.users set partner_id = '00000000-0000-4000-b000-000000000001', name = '파트너A', is_active = true where id = '00000000-0000-4000-e000-00000000000b';
update public.users set partner_id = '00000000-0000-4000-b000-000000000002', name = '파트너B', is_active = true where id = '00000000-0000-4000-e000-00000000000c';

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

-- ===================================================== 파트너 A
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);

select pg_temp.assert((select count(*) from orders) = 2, '파트너A는 본인 발주 2건만 조회');
select pg_temp.assert((select count(*) from customers) = 2, '파트너A는 본인 고객 2명만 조회');
select pg_temp.assert((select count(*) from order_items oi join orders o on o.id = oi.order_id) = 3, '파트너A 품목만 조회');
select pg_temp.assert((select count(*) from customers where id = '00000000-0000-4000-c000-000000000003') = 0, '다른 파트너 고객 직접 조회 차단');
select pg_temp.assert((select count(*) from partners) = 1, '파트너 목록은 본인만');
select pg_temp.assert((select count(*) from settlements) = 2, '정산은 본인 것만');
select pg_temp.assert((select count(*) from audit_logs) = 0, '감사로그 조회 불가');

-- 다른 파트너 발주 수정 시도 → 0행
with u as (update orders set request_note = 'hack' where id = '00000000-0000-4000-d000-000000000003' returning 1)
select pg_temp.assert((select count(*) from u) = 0, '다른 파트너 발주 수정 차단');

-- RPC 로 발주 생성 (단가 위조 시도 포함)
select pg_temp.assert(
  (save_order('{"status":"submitted","unit_price":1,"partner_id":"00000000-0000-4000-b000-000000000002",
     "customer":{"name":"테스트고객99","phone":"010-0000-0099","address":"서울 테스트로 99","region":"서울"},
     "discount_rate":12,"install_fee":100000,"travel_fee":0,"vat_mode":"excluded",
     "items":[{"space_name":"안방","width_mm":1800,"height_mm":1500,"frame_color":"white","fabric_color":"white"},
              {"space_name":"작은방","width_mm":1000,"height_mm":1000,"frame_color":"black","fabric_color":"black"}]}'::jsonb) ->> 'order_no') like 'JJ-%',
  'save_order 로 발주 생성');
select pg_temp.assert(
  (select o.unit_price = 140000 and o.partner_id = '00000000-0000-4000-b000-000000000001' from orders o
     join customers c on c.id = o.customer_id where c.name = '테스트고객99'),
  '파트너는 단가/담당파트너 위조 불가 (정책 단가 강제)');
-- 2.7㎡ → 378,000 / 1㎡ → 최소 2㎡ 280,000 → 658,000, 12% 할인 78,960 → 579,040 + 100,000 = 679,040, VAT 67,904 → 746,944
select pg_temp.assert(
  (select total_amount = 746944 and discount_amount = 78960 and vat_amount = 67904 and total_applied_area = 4.7
     from orders o join customers c on c.id = o.customer_id where c.name = '테스트고객99'),
  '서버 금액 계산 정확');

-- 계산 금액 직접 위조 시도 → 트리거가 재계산
update orders set total_amount = 1, product_amount = 1, unit_price = 1
 where customer_id = (select id from customers where name = '테스트고객99');
select pg_temp.assert(
  (select total_amount = 746944 and unit_price = 140000 from orders o join customers c on c.id = o.customer_id where c.name = '테스트고객99'),
  '금액/단가 직접 UPDATE 위조 무효화');

-- 파트너가 상태를 '제작 중'으로 변경 시도 → 실패
do $$ begin
  perform change_order_status('00000000-0000-4000-d000-000000000001', 'in_production');
  raise exception 'should fail';
exception when others then
  if sqlerrm = 'should fail' then raise; end if;
  raise notice 'PASS: 파트너 상태 임의 변경 차단 (%)', sqlerrm;
end $$;

-- 본사 확인 이후 발주(제작 중) 수정 시도 → 0행
with u as (update orders set request_note = 'x' where id = '00000000-0000-4000-d000-000000000002' returning 1)
select pg_temp.assert((select count(*) from u) = 0, '제작 중 발주는 파트너 수정 불가');

-- 최대 할인율 초과
do $$ begin
  perform save_order('{"status":"draft","customer":{"name":"할인초과"},"discount_rate":90,"items":[]}'::jsonb);
  raise exception 'should fail';
exception when others then
  if sqlerrm = 'should fail' then raise; end if;
  raise notice 'PASS: 최대 할인율 초과 차단 (%)', sqlerrm;
end $$;

-- 소프트 삭제 시도 → 실패
do $$ begin
  perform soft_delete_order('00000000-0000-4000-d000-000000000001');
  raise exception 'should fail';
exception when others then
  if sqlerrm = 'should fail' then raise; end if;
  raise notice 'PASS: 파트너 삭제 차단';
end $$;

-- 중복 발주 확인 (다른 파트너 고객 번호 → 건수만, 내 건수 0)
select pg_temp.assert((select total_count = 1 and mine_count = 0 from check_duplicate_order('010-0000-0003')), '중복 발주 경고 (타 파트너 개인정보 비노출)');
commit;

-- ===================================================== 파트너 B
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
select pg_temp.assert((select count(*) from orders) = 2, '파트너B는 본인 발주 2건만 조회');
select pg_temp.assert((select count(*) from customers where name = '테스트고객99') = 0, '파트너B는 파트너A의 신규 고객 조회 불가');
commit;

-- ===================================================== 미승인(신규 가입) 계정
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
select pg_temp.assert((select count(*) from orders) = 0, '미승인 계정은 발주 조회 불가');
do $$ begin
  perform save_order('{"status":"draft","customer":{"name":"x"},"items":[]}'::jsonb);
  raise exception 'should fail';
exception when others then
  if sqlerrm = 'should fail' then raise; end if;
  raise notice 'PASS: 미승인 계정 발주 등록 차단 (%)', sqlerrm;
end $$;
commit;

-- ===================================================== anon
begin;
set local role anon;
do $$ begin
  perform count(*) from public.orders;
  raise exception 'should fail';
exception when insufficient_privilege then
  raise notice 'PASS: anon 테이블 접근 차단';
end $$;
commit;

-- ===================================================== 관리자
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select pg_temp.assert((select count(*) from orders) = 6, '관리자는 전체 발주 조회');
select change_order_status('00000000-0000-4000-d000-000000000001', 'confirmed', '확인 완료');
select pg_temp.assert(
  (select changed_by = '00000000-0000-4000-e000-00000000000a' and note = '확인 완료' and from_status = 'submitted'
     from order_status_history where order_id = '00000000-0000-4000-d000-000000000001' order by id desc limit 1),
  '상태 변경 이력에 변경자/메모 기록');
-- 관리자 단가 변경 → 품목 재계산
update orders set unit_price = 150000 where id = '00000000-0000-4000-d000-000000000004';
select pg_temp.assert((select product_amount = 300000 from orders where id = '00000000-0000-4000-d000-000000000004'), '관리자 단가 변경 시 품목 재계산');
-- 활성 정책 변경 → 기존 발주 금액 불변
update price_policies set unit_price_retail = 200000 where is_active;
select pg_temp.assert((select total_amount = 761420 - 0 from orders where id = '00000000-0000-4000-d000-000000000001'), '정책 변경 후 기존 발주 금액 유지');
select soft_delete_order('00000000-0000-4000-d000-000000000004');
select pg_temp.assert((select deleted_by is not null from orders where id = '00000000-0000-4000-d000-000000000004'), '관리자 소프트 삭제');
select pg_temp.assert((select count(*) from audit_logs where table_name = 'orders') > 0, '감사 로그 기록');
rollback;

-- 파트너A: 소프트 삭제된 건/확인된 건 확인
select 'ALL RLS TESTS PASSED' as result;

-- ===================================================== 뷰 RLS
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
select pg_temp.assert((select count(*) from orders_view) = 2 and (select bool_and(partner_name = '테스트파트너B') from orders_view), 'orders_view 도 RLS 적용 (파트너B 2건)');
commit;

-- ===================================================== 대시보드 / 수정요청
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
select pg_temp.assert((dashboard_stats() ->> 'month_count')::int >= 4 and jsonb_array_length(dashboard_stats() -> 'partners') = 3, '관리자 대시보드 전체 집계');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
select pg_temp.assert(jsonb_array_length(dashboard_stats() -> 'partners') = 1, '파트너 대시보드는 본인만 집계');
insert into order_change_requests (order_id, content) values ('00000000-0000-4000-d000-000000000003', '연락처 변경 요청');
select pg_temp.assert((select count(*) from order_change_requests) = 1, '파트너 수정 요청 등록');
do $$ begin
  insert into order_change_requests (order_id, content) values ('00000000-0000-4000-d000-000000000001', '남의 발주');
  raise exception 'should fail';
exception when insufficient_privilege then raise notice 'PASS: 다른 파트너 발주에 수정 요청 차단';
end $$;
commit;
