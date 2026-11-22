-- =====================================================================
-- JAMJAMOFF ORDER — 0003 Row Level Security
--   * 관리자(is_admin) : 전체 접근
--   * 파트너 : 본인 파트너 ID 의 데이터만 접근 (다른 파트너 데이터는 DB 레벨에서 차단)
--   * anon : 접근 불가
-- =====================================================================

alter table public.partners              enable row level security;
alter table public.users                 enable row level security;
alter table public.price_policies        enable row level security;
alter table public.customers             enable row level security;
alter table public.order_counters        enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.shipments             enable row level security;
alter table public.installations         enable row level security;
alter table public.settlements           enable row level security;
alter table public.attachments           enable row level security;
alter table public.audit_logs            enable row level security;


-- 발주 가능 상태(파트너 수정 가능 상태)
create or replace function public.order_editable_by_partner(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.partner_id = public.current_partner_id()
      and o.status in ('draft', 'submitted')
      and o.deleted_at is null
  )
$$;

-- 발주 조회 가능 여부 (하위 테이블 정책에서 사용)
create or replace function public.can_view_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.partner_id = public.current_partner_id()
      and o.deleted_at is null
  )
$$;

-- ---------------------------------------------------------------- users
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy users_admin_write on public.users for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------- partners
create policy partners_select on public.partners for select to authenticated
  using (public.is_admin() or id = public.current_partner_id());
create policy partners_admin_insert on public.partners for insert to authenticated
  with check (public.is_admin());
create policy partners_admin_update on public.partners for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------- price_policies
create policy price_policies_select on public.price_policies for select to authenticated
  using (public.is_admin() or (is_active and public.current_partner_id() is not null));
create policy price_policies_admin_insert on public.price_policies for insert to authenticated
  with check (public.is_admin());
create policy price_policies_admin_update on public.price_policies for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ customers
create policy customers_select on public.customers for select to authenticated
  using (public.is_admin() or (partner_id = public.current_partner_id() and deleted_at is null));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_admin() or partner_id = public.current_partner_id());
-- 파트너는 본사 확인 전(임시저장/접수) 발주만 있는 고객만 직접 수정 가능.
-- 그 이후는 '수정 요청'으로 처리
create policy customers_update on public.customers for update to authenticated
  using (
    public.is_admin() or (
      partner_id = public.current_partner_id() and deleted_at is null
      and not exists (
        select 1 from public.orders o
        where o.customer_id = customers.id and o.deleted_at is null
          and o.status not in ('draft', 'submitted', 'cancelled')
      )
    )
  )
  with check (public.is_admin() or partner_id = public.current_partner_id());

-- --------------------------------------------------------------- orders
create policy orders_select on public.orders for select to authenticated
  using (public.is_admin() or (partner_id = public.current_partner_id() and deleted_at is null));
create policy orders_insert on public.orders for insert to authenticated
  with check (
    public.is_admin()
    or (partner_id = public.current_partner_id() and status in ('draft', 'submitted'))
  );
create policy orders_update on public.orders for update to authenticated
  using (
    public.is_admin()
    or (partner_id = public.current_partner_id() and status in ('draft', 'submitted') and deleted_at is null)
  )
  with check (
    public.is_admin()
    or (partner_id = public.current_partner_id() and status in ('draft', 'submitted', 'cancelled') and deleted_at is null)
  );
-- 물리 삭제 정책 없음 (soft_delete_order RPC 사용)

-- ---------------------------------------------------------- order_items
create policy order_items_select on public.order_items for select to authenticated
  using (public.can_view_order(order_id));
create policy order_items_insert on public.order_items for insert to authenticated
  with check (public.is_admin() or public.order_editable_by_partner(order_id));
create policy order_items_update on public.order_items for update to authenticated
  using (public.is_admin() or public.order_editable_by_partner(order_id))
  with check (public.is_admin() or public.order_editable_by_partner(order_id));
create policy order_items_delete on public.order_items for delete to authenticated
  using (public.is_admin() or public.order_editable_by_partner(order_id));

-- ------------------------------------------------- order_status_history
create policy osh_select on public.order_status_history for select to authenticated
  using (public.can_view_order(order_id));

-- ---------------------------------------------------- shipments (관리자 관리)
create policy shipments_select on public.shipments for select to authenticated
  using (public.can_view_order(order_id));
create policy shipments_admin_insert on public.shipments for insert to authenticated
  with check (public.is_admin());
create policy shipments_admin_update on public.shipments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------- installations (관리자 + 담당 파트너)
create policy installations_select on public.installations for select to authenticated
  using (public.can_view_order(order_id));
create policy installations_insert on public.installations for insert to authenticated
  with check (public.can_view_order(order_id));
create policy installations_update on public.installations for update to authenticated
  using (public.can_view_order(order_id)) with check (public.can_view_order(order_id));

-- ---------------------------------------------------------- settlements
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_admin() or partner_id = public.current_partner_id());
create policy settlements_admin_update on public.settlements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------- attachments
create policy attachments_select on public.attachments for select to authenticated
  using (deleted_at is null and public.can_view_order(order_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_view_order(order_id));
create policy attachments_update on public.attachments for update to authenticated
  using (public.is_admin() or uploaded_by = auth.uid())
  with check (public.is_admin() or uploaded_by = auth.uid());

-- ----------------------------------------------------------- audit_logs
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- order_counters : 정책 없음 → next_order_no() (security definer) 로만 접근

-- ---------------------------------------------------------------------
-- 권한(GRANT) 정리 : anon 은 어떤 테이블/함수에도 접근하지 않음
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.next_order_no() from authenticated;
