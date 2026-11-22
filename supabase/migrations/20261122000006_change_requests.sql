-- =====================================================================
-- JAMJAMOFF ORDER — 0006 수정 요청 (본사 확인 이후 파트너의 고객/발주 정보 변경 요청)
-- =====================================================================
create table public.order_change_requests (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  requested_by  uuid not null references public.users (id) default auth.uid(),
  content       text not null check (length(trim(content)) between 1 and 2000),
  status        text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolved_by   uuid references public.users (id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.order_change_requests (order_id);
create index on public.order_change_requests (status) where status = 'open';

alter table public.order_change_requests enable row level security;
revoke all on public.order_change_requests from anon;

create policy ocr_select on public.order_change_requests for select to authenticated
  using (public.can_view_order(order_id));
create policy ocr_insert on public.order_change_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'open' and public.can_view_order(order_id));
create policy ocr_admin_update on public.order_change_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
