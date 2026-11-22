-- =====================================================================
-- JAMJAMOFF ORDER — 샘플 데이터 (테스트 전용, 모두 가상의 인물/주소)
--   * 사용자 계정은 scripts/create-users.mjs 로 생성 (Supabase Auth 필요)
--   * DB 직접 접속(관리자 권한)으로 실행
-- =====================================================================

-- 기본 가격 정책
insert into public.price_policies
  (id, name, unit_price_retail, unit_price_partner, min_area_m2, default_install_fee, default_travel_fee,
   discount_presets, max_discount_rate, vat_rate_bp, default_vat_mode, settle_install_share, settle_travel_share, is_active)
values
  ('00000000-0000-4000-a000-000000000001', '2026 기본 정책', 140000, 95000, 2, 100000, 0,
   '{0,10,12,15,20}', 30, 1000, 'excluded', 100, 100, true)
on conflict (id) do nothing;

-- 파트너
insert into public.partners (id, name, company_name, region, phone, status) values
  ('00000000-0000-4000-b000-000000000001', '테스트파트너A', '잼잼시공 서울점', '서울', '010-0000-1001', 'active'),
  ('00000000-0000-4000-b000-000000000002', '테스트파트너B', '잼잼시공 경기남부점', '경기', '010-0000-1002', 'active'),
  ('00000000-0000-4000-b000-000000000003', '테스트파트너C', '잼잼시공 부산점', '부산', '010-0000-1003', 'active')
on conflict (id) do nothing;

-- 고객 (가상 인물, 010-0000-xxxx 번호)
insert into public.customers (id, partner_id, name, phone, address, address_detail, region) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '테스트고객01', '010-0000-0001', '서울특별시 테스트구 샘플로 1', '101동 101호', '서울'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '테스트고객02', '010-0000-0002', '서울특별시 테스트구 샘플로 2', '202동 1502호', '서울'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000002', '테스트고객03', '010-0000-0003', '경기도 테스트시 예시로 3', '3층', '경기'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000002', '테스트고객04', '010-0000-0004', '경기도 테스트시 예시로 4', '', '경기'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000003', '테스트고객05', '010-0000-0005', '부산광역시 테스트구 해변로 5', '501호', '부산')
on conflict (id) do nothing;

-- 발주 (금액은 트리거가 자동 계산)
insert into public.orders (id, partner_id, customer_id, status, region, order_date, desired_ship_date,
                           desired_install_date, desired_install_time, request_note,
                           vat_mode, discount_rate, install_fee, travel_fee) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001',
   'submitted', '서울', public.kst_today(), public.kst_today() + 5, public.kst_today() + 8, '오전 10시', '엘리베이터 없음 (3층)', 'excluded', 10, 100000, 0),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000002',
   'in_production', '서울', public.kst_today() - 3, public.kst_today() + 2, public.kst_today() + 4, '오후 2시', '', 'excluded', 0, 100000, 20000),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000003',
   'confirmed', '경기', public.kst_today() - 1, public.kst_today() + 6, public.kst_today() + 9, '오전', '주차 가능', 'included', 15, 100000, 30000),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000004',
   'draft', '경기', public.kst_today(), null, null, null, '', 'excluded', 0, 100000, 0),
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000005',
   'install_scheduled', '부산', public.kst_today() - 10, public.kst_today() - 4, public.kst_today() + 1, '오후 3시', '바다 쪽 창 바람 강함', 'excluded', 12, 120000, 50000)
on conflict (id) do nothing;

insert into public.order_items (order_id, sort_order, space_name, width_mm, height_mm, frame_color, fabric_color)
select v.order_id::uuid, v.sort_order, v.space_name, v.w, v.h, v.fc::public.color_option, v.fb::public.color_option
from (values
  ('00000000-0000-4000-d000-000000000001', 0, '안방',   1800, 1500, 'white', 'white'),
  ('00000000-0000-4000-d000-000000000001', 1, '작은방', 1500, 1200, 'black', 'black'),
  ('00000000-0000-4000-d000-000000000002', 0, '거실',   2400, 2200, 'white', 'white'),
  ('00000000-0000-4000-d000-000000000003', 0, '안방',   1700, 1400, 'white', 'black'),
  ('00000000-0000-4000-d000-000000000003', 1, '거실',   3000, 2300, 'black', 'black'),
  ('00000000-0000-4000-d000-000000000003', 2, '주방',    900,  600, 'white', 'white'),
  ('00000000-0000-4000-d000-000000000004', 0, '아이방', 1200, 1100, 'white', 'white'),
  ('00000000-0000-4000-d000-000000000005', 0, '거실',   2800, 2100, 'black', 'white'),
  ('00000000-0000-4000-d000-000000000005', 1, '안방',   1600, 1300, 'white', 'white')
) as v(order_id, sort_order, space_name, w, h, fc, fb)
where not exists (select 1 from public.order_items oi where oi.order_id = v.order_id::uuid);
