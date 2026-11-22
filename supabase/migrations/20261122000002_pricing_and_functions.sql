-- =====================================================================
-- JAMJAMOFF ORDER — 0002 권한 헬퍼 · 가격 계산 · 트리거 · RPC
--
-- 가격 계산 규칙 (src/lib/pricing.ts 와 반드시 동일해야 함. 테스트로 검증)
--   실제면적(mm²)  = 가로 × 세로
--   적용면적(mm²)  = max(실제면적, 최소면적㎡ × 1,000,000)
--   품목금액       = round(적용면적 × 단가 / 1,000,000)
--   제품금액       = Σ 품목금액
--   할인금액       = round(제품금액 × 할인율(bp) / 10,000)     ※ 제품 금액에만 적용
--   소계           = 제품금액 − 할인금액 + 시공비 + 출장비
--   부가세 별도    : 공급가액 = 소계, 부가세 = round(소계 × 세율bp / 10,000), 합계 = 소계 + 부가세
--   부가세 포함    : 합계 = 소계, 공급가액 = round(소계 × 10,000 / (10,000 + 세율bp)), 부가세 = 합계 − 공급가액
-- =====================================================================

-- ---------------------------------------------------------------------
-- 권한 헬퍼
-- ---------------------------------------------------------------------
create or replace function public.jwt_role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active
  )
$$;

-- 로그인한 파트너 사용자의 파트너 ID (비활성 계정/정지 파트너는 null)
create or replace function public.current_partner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.partner_id
  from public.users u
  join public.partners p on p.id = u.partner_id
  where u.id = auth.uid() and u.is_active and u.role = 'partner'
    and p.status = 'active' and p.deleted_at is null
$$;

-- 관리자, service_role, 또는 DB 직접 접속(마이그레이션/시드)
create or replace function public.is_privileged() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.jwt_role() = 'service_role'
      or (public.jwt_role() = '' and auth.uid() is null)
$$;

-- ---------------------------------------------------------------------
-- 가격 계산 (순수 함수)
-- ---------------------------------------------------------------------
create or replace function public.calc_discount(p_amount bigint, p_rate numeric) returns integer
language sql immutable as $$
  select round(p_amount::numeric * round(p_rate * 100) / 10000)::integer
$$;

create or replace function public.calc_line(
  p_width integer, p_height integer, p_min_area_m2 numeric, p_unit_price integer,
  out actual_area numeric, out applied_area numeric, out line_amount integer
)
language plpgsql immutable as $$
declare
  actual_mm2  bigint := p_width::bigint * p_height::bigint;
  applied_mm2 bigint := greatest(actual_mm2, round(p_min_area_m2 * 1000000)::bigint);
begin
  actual_area  := actual_mm2::numeric / 1000000;
  applied_area := applied_mm2::numeric / 1000000;
  line_amount  := round(applied_mm2::numeric * p_unit_price / 1000000)::integer;
end $$;

-- ---------------------------------------------------------------------
-- order_items : 품목 금액 계산 (BEFORE)
-- ---------------------------------------------------------------------
create or replace function public.trg_order_items_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  c record;
begin
  select * into o from public.orders where id = new.order_id;
  select * into c from public.calc_line(new.width_mm, new.height_mm, o.min_area_m2, o.unit_price);
  new.actual_area  := c.actual_area;
  new.applied_area := c.applied_area;
  new.line_amount  := c.line_amount;
  new.line_supply  := (public.calc_line(new.width_mm, new.height_mm, o.min_area_m2, o.unit_price_partner)).line_amount;
  return new;
end $$;

create trigger trg_order_items_calc before insert or update on public.order_items
  for each row execute function public.trg_order_items_calc();

-- 품목 변경 후 주문 합계 재계산 (AFTER) → orders BEFORE 트리거가 실제 계산
create or replace function public.trg_order_items_recalc_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set item_count = item_count
  where id = coalesce(new.order_id, old.order_id);
  return null;
end $$;

create trigger trg_order_items_recalc after insert or update or delete on public.order_items
  for each row execute function public.trg_order_items_recalc_parent();

-- ---------------------------------------------------------------------
-- orders : 보호 컬럼 강제 + 합계 계산 (BEFORE)
-- ---------------------------------------------------------------------
create or replace function public.trg_orders_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pol public.price_policies;
  priv boolean := public.is_privileged();
  agg record;
begin
  -- 1) 권한별 보호 컬럼
  if tg_op = 'INSERT' then
    select * into pol from public.price_policies where is_active limit 1;
    if pol.id is null then
      raise exception '활성화된 가격 정책이 없습니다.' using errcode = 'P0001';
    end if;
    if not priv then
      new.partner_id := public.current_partner_id();
      if new.partner_id is null then
        raise exception '발주 권한이 없습니다.' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
      new.order_no := public.next_order_no();
      -- 파트너는 단가/정책을 지정할 수 없음 → 현재 활성 정책 강제
      new.price_policy_id := pol.id;
      new.unit_price := pol.unit_price_retail;
      new.unit_price_partner := pol.unit_price_partner;
      new.min_area_m2 := pol.min_area_m2;
      new.vat_rate_bp := pol.vat_rate_bp;
      new.settle_install_share := pol.settle_install_share;
      new.settle_travel_share := pol.settle_travel_share;
      if new.status not in ('draft', 'submitted') then
        raise exception '허용되지 않은 상태입니다.' using errcode = '42501';
      end if;
      new.deleted_at := null;
    else
      new.order_no := coalesce(new.order_no, public.next_order_no());
      new.price_policy_id := coalesce(new.price_policy_id, pol.id);
      new.unit_price := coalesce(new.unit_price, pol.unit_price_retail);
      new.unit_price_partner := coalesce(new.unit_price_partner, pol.unit_price_partner);
      new.min_area_m2 := coalesce(new.min_area_m2, pol.min_area_m2);
      new.vat_rate_bp := coalesce(new.vat_rate_bp, pol.vat_rate_bp);
      new.vat_mode := coalesce(new.vat_mode, pol.default_vat_mode);
    end if;
    if not priv and new.discount_rate > pol.max_discount_rate then
      raise exception '할인율은 최대 %까지 가능합니다.', pol.max_discount_rate::text || '%' using errcode = '22023';
    end if;
  else
    -- UPDATE
    if not priv then
      -- 파트너가 변경할 수 없는 컬럼은 기존 값 유지
      new.id := old.id;
      new.order_no := old.order_no;
      new.partner_id := old.partner_id;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.price_policy_id := old.price_policy_id;
      new.unit_price := old.unit_price;
      new.unit_price_partner := old.unit_price_partner;
      new.min_area_m2 := old.min_area_m2;
      new.vat_rate_bp := old.vat_rate_bp;
      new.settle_install_share := old.settle_install_share;
      new.settle_travel_share := old.settle_travel_share;
      new.deleted_at := old.deleted_at;
      new.deleted_by := old.deleted_by;
      if old.status not in ('draft', 'submitted') and new is distinct from old then
        raise exception '본사 확인 이후에는 수정할 수 없습니다. 본사에 수정 요청해 주세요.' using errcode = '42501';
      end if;
      if new.status not in ('draft', 'submitted', 'cancelled') then
        raise exception '허용되지 않은 상태 변경입니다.' using errcode = '42501';
      end if;
      if new.discount_rate <> old.discount_rate then
        select * into pol from public.price_policies where is_active limit 1;
        if new.discount_rate > coalesce(pol.max_discount_rate, 100) then
          raise exception '할인율은 최대 %까지 가능합니다.', pol.max_discount_rate::text || '%' using errcode = '22023';
        end if;
      end if;
    end if;
  end if;

  -- 고객은 같은 파트너 소유여야 함
  if not exists (select 1 from public.customers c where c.id = new.customer_id and c.partner_id = new.partner_id) then
    raise exception '고객 정보가 담당 파트너와 일치하지 않습니다.' using errcode = '23514';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := now();
  end if;

  -- 2) 합계 계산
  select count(*)::int as cnt,
         coalesce(sum(actual_area), 0) as actual,
         coalesce(sum(applied_area), 0) as applied,
         coalesce(sum(line_amount), 0)::bigint as product,
         coalesce(sum(line_supply), 0)::bigint as supply
    into agg
    from public.order_items where order_id = new.id;

  new.item_count         := agg.cnt;
  new.total_actual_area  := agg.actual;
  new.total_applied_area := agg.applied;
  new.product_amount     := agg.product;
  new.discount_amount    := public.calc_discount(agg.product, new.discount_rate);
  new.product_net_amount := new.product_amount - new.discount_amount;
  new.supply_amount      := agg.supply;
  new.subtotal_amount    := new.product_net_amount + new.install_fee + new.travel_fee;
  if new.vat_mode = 'excluded' then
    new.supply_value := new.subtotal_amount;
    new.vat_amount   := round(new.subtotal_amount::numeric * new.vat_rate_bp / 10000)::integer;
    new.total_amount := new.subtotal_amount + new.vat_amount;
  else
    new.total_amount := new.subtotal_amount;
    new.supply_value := round(new.subtotal_amount::numeric * 10000 / (10000 + new.vat_rate_bp))::integer;
    new.vat_amount   := new.total_amount - new.supply_value;
  end if;
  return new;
end $$;

create trigger trg_orders_before before insert or update on public.orders
  for each row execute function public.trg_orders_before();

-- 단가 스냅샷이 바뀌면(관리자) 품목 재계산
create or replace function public.trg_orders_reprice_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.order_items set width_mm = width_mm where order_id = new.id;
  return null;
end $$;

create trigger trg_orders_reprice_items after update of unit_price, unit_price_partner, min_area_m2
  on public.orders for each row
  when (old.unit_price is distinct from new.unit_price
     or old.unit_price_partner is distinct from new.unit_price_partner
     or old.min_area_m2 is distinct from new.min_area_m2)
  execute function public.trg_orders_reprice_items();

-- ---------------------------------------------------------------------
-- 상태 변경 이력 (변경 일시 · 변경자 기록)
-- ---------------------------------------------------------------------
create or replace function public.trg_orders_status_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(),
            nullif(current_setting('jj.status_note', true), ''));
  end if;
  return null;
end $$;

create trigger trg_orders_status_history after insert or update of status on public.orders
  for each row execute function public.trg_orders_status_history();

-- ---------------------------------------------------------------------
-- 정산 자동 동기화 (확정 전까지 발주 금액과 동기화)
-- ---------------------------------------------------------------------
create or replace function public.trg_orders_sync_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  payable integer;
begin
  if new.status in ('draft', 'cancelled') or new.deleted_at is not null then
    delete from public.settlements where order_id = new.id and paid_amount = 0;
    update public.settlements set payable_amount = 0 where order_id = new.id;
    return null;
  end if;
  payable := round(new.install_fee::numeric * new.settle_install_share / 100)::integer
           + round(new.travel_fee::numeric * new.settle_travel_share / 100)::integer;
  insert into public.settlements as s (order_id, partner_id, product_sales_amount, product_supply_amount,
                                       discount_amount, install_fee, travel_fee, payable_amount)
  values (new.id, new.partner_id, new.product_net_amount, new.supply_amount,
          new.discount_amount, new.install_fee, new.travel_fee, payable)
  on conflict (order_id) do update set
    partner_id = excluded.partner_id,
    product_sales_amount = excluded.product_sales_amount,
    product_supply_amount = excluded.product_supply_amount,
    discount_amount = excluded.discount_amount,
    install_fee = excluded.install_fee,
    travel_fee = excluded.travel_fee,
    payable_amount = excluded.payable_amount
  where s.status <> 'completed';
  return null;
end $$;

create trigger trg_orders_sync_settlement after insert or update on public.orders
  for each row execute function public.trg_orders_sync_settlement();

-- ---------------------------------------------------------------------
-- 감사 로그
-- ---------------------------------------------------------------------
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb;
  rid uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      into diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'item_count', 'total_actual_area', 'total_applied_area',
                         'product_amount', 'discount_amount', 'product_net_amount', 'supply_amount',
                         'subtotal_amount', 'supply_value', 'vat_amount', 'total_amount');
    if diff is null then return null; end if;
    rid := (to_jsonb(new) ->> 'id')::uuid;
  elsif tg_op = 'INSERT' then
    rid := (to_jsonb(new) ->> 'id')::uuid;
  else
    rid := (to_jsonb(old) ->> 'id')::uuid;
    diff := to_jsonb(old);
  end if;
  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (auth.uid(), tg_op, tg_table_name, rid, diff);
  return null;
end $$;

create trigger trg_audit_orders after insert or update or delete on public.orders
  for each row execute function public.trg_audit();
create trigger trg_audit_customers after insert or update or delete on public.customers
  for each row execute function public.trg_audit();
create trigger trg_audit_partners after insert or update or delete on public.partners
  for each row execute function public.trg_audit();
create trigger trg_audit_price_policies after insert or update on public.price_policies
  for each row execute function public.trg_audit();
create trigger trg_audit_settlements after update on public.settlements
  for each row execute function public.trg_audit();

-- =====================================================================
-- RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- save_order : 고객 + 발주 + 품목을 하나의 트랜잭션으로 저장
--   SECURITY INVOKER → 호출자의 RLS 가 그대로 적용됨
-- ---------------------------------------------------------------------
create or replace function public.save_order(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_order_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_customer_id uuid;
  v_partner_id  uuid;
  v_status      public.order_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.order_status;
  v_cust        jsonb := coalesce(p -> 'customer', '{}'::jsonb);
  v_items       jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_admin       boolean := public.is_admin();
  v_existing    public.orders;
  v_item        jsonb;
  v_idx         integer := 0;
  v_order_no    text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'submitted') and not v_admin then
    raise exception '허용되지 않은 상태입니다.' using errcode = '42501';
  end if;

  -- 검증
  if length(trim(coalesce(v_cust ->> 'name', ''))) = 0 then
    raise exception '고객 성함을 입력해 주세요.' using errcode = '22023';
  end if;
  if v_status <> 'draft' then
    if length(regexp_replace(coalesce(v_cust ->> 'phone', ''), '\D', '', 'g')) < 9 then
      raise exception '연락처를 정확히 입력해 주세요.' using errcode = '22023';
    end if;
    if length(trim(coalesce(v_cust ->> 'address', ''))) = 0 then
      raise exception '시공 주소를 입력해 주세요.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_items) = 0 then
      raise exception '창문을 1개 이상 입력해 주세요.' using errcode = '22023';
    end if;
  end if;

  if v_order_id is not null then
    select * into v_existing from public.orders where id = v_order_id and deleted_at is null;
    if v_existing.id is null then
      raise exception '발주를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    v_partner_id := v_existing.partner_id;
    v_customer_id := v_existing.customer_id;
    if v_admin and nullif(p ->> 'partner_id', '') is not null
       and (p ->> 'partner_id')::uuid <> v_existing.partner_id then
      raise exception '담당 파트너는 발주 생성 후 변경할 수 없습니다.' using errcode = '22023';
    end if;
  else
    if v_admin then
      v_partner_id := nullif(p ->> 'partner_id', '')::uuid;
      if v_partner_id is null then
        raise exception '담당 파트너를 선택해 주세요.' using errcode = '22023';
      end if;
    else
      v_partner_id := public.current_partner_id();
      if v_partner_id is null then
        raise exception '승인된 파트너 계정이 아닙니다. 본사에 문의해 주세요.' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 고객
  if v_customer_id is null then
    insert into public.customers (partner_id, name, phone, address, address_detail, postal_code, region, created_by)
    values (v_partner_id, trim(v_cust ->> 'name'), coalesce(v_cust ->> 'phone', ''),
            coalesce(v_cust ->> 'address', ''), coalesce(v_cust ->> 'address_detail', ''),
            nullif(v_cust ->> 'postal_code', ''), nullif(v_cust ->> 'region', ''), auth.uid())
    returning id into v_customer_id;
  else
    update public.customers set
      name = trim(v_cust ->> 'name'),
      phone = coalesce(v_cust ->> 'phone', ''),
      address = coalesce(v_cust ->> 'address', ''),
      address_detail = coalesce(v_cust ->> 'address_detail', ''),
      postal_code = nullif(v_cust ->> 'postal_code', ''),
      region = nullif(v_cust ->> 'region', '')
    where id = v_customer_id;
    if not found then
      raise exception '고객 정보를 수정할 권한이 없습니다.' using errcode = '42501';
    end if;
  end if;

  -- 발주
  if v_order_id is null then
    insert into public.orders (
      partner_id, customer_id, created_by, status, region,
      order_date, desired_ship_date, desired_install_date, desired_install_time, request_note,
      unit_price, vat_mode, discount_rate, install_fee, travel_fee
    ) values (
      v_partner_id, v_customer_id, auth.uid(), v_status, nullif(v_cust ->> 'region', ''),
      coalesce(nullif(p ->> 'order_date', '')::date, public.kst_today()),
      nullif(p ->> 'desired_ship_date', '')::date,
      nullif(p ->> 'desired_install_date', '')::date,
      nullif(p ->> 'desired_install_time', ''),
      coalesce(p ->> 'request_note', ''),
      case when v_admin then nullif(p ->> 'unit_price', '')::integer end,
      coalesce(nullif(p ->> 'vat_mode', ''), (select default_vat_mode::text from public.price_policies where is_active limit 1), 'excluded')::public.vat_mode,
      coalesce(nullif(p ->> 'discount_rate', '')::numeric, 0),
      coalesce(nullif(p ->> 'install_fee', '')::integer, 0),
      coalesce(nullif(p ->> 'travel_fee', '')::integer, 0)
    )
    returning id into v_order_id;
  else
    update public.orders set
      status = case when v_admin then status else v_status end,
      region = nullif(v_cust ->> 'region', ''),
      order_date = coalesce(nullif(p ->> 'order_date', '')::date, order_date),
      desired_ship_date = nullif(p ->> 'desired_ship_date', '')::date,
      desired_install_date = nullif(p ->> 'desired_install_date', '')::date,
      desired_install_time = nullif(p ->> 'desired_install_time', ''),
      request_note = coalesce(p ->> 'request_note', ''),
      unit_price = case when v_admin then coalesce(nullif(p ->> 'unit_price', '')::integer, unit_price) else unit_price end,
      vat_mode = coalesce(nullif(p ->> 'vat_mode', '')::public.vat_mode, vat_mode),
      discount_rate = coalesce(nullif(p ->> 'discount_rate', '')::numeric, 0),
      install_fee = coalesce(nullif(p ->> 'install_fee', '')::integer, 0),
      travel_fee = coalesce(nullif(p ->> 'travel_fee', '')::integer, 0)
    where id = v_order_id;
    if not found then
      raise exception '발주를 수정할 권한이 없습니다.' using errcode = '42501';
    end if;
    -- 관리자가 임시저장 건을 접수로 저장하는 경우
    if v_admin and v_existing.status = 'draft' and v_status = 'submitted' then
      update public.orders set status = 'submitted' where id = v_order_id;
    end if;
    delete from public.order_items where order_id = v_order_id;
  end if;

  -- 품목 (전체 교체)
  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.order_items (order_id, sort_order, space_name, width_mm, height_mm, frame_color, fabric_color, note)
    values (
      v_order_id, v_idx,
      coalesce(nullif(trim(v_item ->> 'space_name'), ''), '창문 ' || (v_idx + 1)),
      (v_item ->> 'width_mm')::integer,
      (v_item ->> 'height_mm')::integer,
      coalesce(nullif(v_item ->> 'frame_color', ''), 'white')::public.color_option,
      coalesce(nullif(v_item ->> 'fabric_color', ''), 'white')::public.color_option,
      coalesce(v_item ->> 'note', '')
    );
    v_idx := v_idx + 1;
  end loop;

  select order_no into v_order_no from public.orders where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'order_no', v_order_no);
end $$;

-- ---------------------------------------------------------------------
-- change_order_status : 상태 변경 (권한은 RLS + 트리거가 검증)
-- ---------------------------------------------------------------------
create or replace function public.change_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('jj.status_note', coalesce(p_note, ''), true);
  update public.orders set status = p_status where id = p_order_id and deleted_at is null;
  if not found then
    raise exception '상태를 변경할 권한이 없거나 발주가 없습니다.' using errcode = '42501';
  end if;
  perform set_config('jj.status_note', '', true);
end $$;

-- ---------------------------------------------------------------------
-- soft_delete_order : 관리자 전용 소프트 삭제
-- ---------------------------------------------------------------------
create or replace function public.soft_delete_order(p_order_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  update public.orders set deleted_at = now(), deleted_by = auth.uid()
  where id = p_order_id and deleted_at is null;
end $$;

-- ---------------------------------------------------------------------
-- check_duplicate_order : 중복 발주 경고 (최근 90일, 같은 연락처)
--   다른 파트너의 개인정보는 노출하지 않고 건수만 반환
-- ---------------------------------------------------------------------
create or replace function public.check_duplicate_order(p_phone text, p_exclude_order_id uuid default null)
returns table (total_count integer, mine_count integer, last_order_date date)
language sql stable security definer set search_path = public as $$
  select count(*)::int,
         count(*) filter (where o.partner_id = public.current_partner_id() or public.is_admin())::int,
         max(o.order_date)
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where auth.uid() is not null
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 9
    and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and o.deleted_at is null
    and o.status <> 'cancelled'
    and o.order_date >= public.kst_today() - 90
    and (p_exclude_order_id is null or o.id <> p_exclude_order_id)
$$;

