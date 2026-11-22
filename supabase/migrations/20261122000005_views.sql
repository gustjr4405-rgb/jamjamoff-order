-- =====================================================================
-- JAMJAMOFF ORDER — 0005 조회용 뷰
--   security_invoker = true → 조회하는 사용자의 RLS 가 그대로 적용됨
-- =====================================================================
create or replace view public.orders_view
with (security_invoker = true) as
select
  o.*,
  c.name            as customer_name,
  c.phone           as customer_phone,
  regexp_replace(c.phone, '\D', '', 'g') as customer_phone_digits,
  c.address         as customer_address,
  c.address_detail  as customer_address_detail,
  p.name            as partner_name,
  p.company_name    as partner_company,
  p.region          as partner_region,
  s.shipped_at,
  s.carrier,
  s.tracking_no,
  i.scheduled_date  as install_scheduled_date,
  i.completed_date  as install_completed_date
from public.orders o
join public.customers c on c.id = o.customer_id
join public.partners  p on p.id = o.partner_id
left join public.shipments s on s.order_id = o.id
left join public.installations i on i.order_id = o.id
where o.deleted_at is null;

revoke all on public.orders_view from anon;
grant select on public.orders_view to authenticated;
