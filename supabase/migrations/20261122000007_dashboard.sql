-- =====================================================================
-- JAMJAMOFF ORDER — 0007 대시보드 집계 (KST 기준)
--   SECURITY INVOKER → 관리자는 전체, 파트너는 본인 데이터만 집계
-- =====================================================================
create or replace function public.dashboard_stats() returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (
    select public.kst_today() as today,
           date_trunc('week', public.kst_today())::date as week_start,
           date_trunc('month', public.kst_today())::date as month_start
  ),
  o as (
    select * from public.orders
    where deleted_at is null and status not in ('draft', 'cancelled')
  )
  select jsonb_build_object(
    'today', (select today from d),
    'today_count',   (select count(*) from o, d where o.order_date = d.today),
    'week_count',    (select count(*) from o, d where o.order_date >= d.week_start),
    'month_count',   (select count(*) from o, d where o.order_date >= d.month_start),
    'month_product_sales', (select coalesce(sum(product_net_amount), 0) from o, d where o.order_date >= d.month_start),
    'month_supply_sales',  (select coalesce(sum(supply_amount), 0) from o, d where o.order_date >= d.month_start),
    'month_install_fees',  (select coalesce(sum(install_fee + travel_fee), 0) from o, d where o.order_date >= d.month_start),
    'unconfirmed',         (select count(*) from o where status = 'submitted'),
    'in_production',       (select count(*) from o where status = 'in_production'),
    'ship_waiting',        (select count(*) from o where status = 'produced'),
    'install_scheduled',   (select count(*) from o where status in ('shipped', 'install_scheduled')),
    'drafts',              (select count(*) from public.orders where deleted_at is null and status = 'draft'),
    'open_requests',       (select count(*) from public.order_change_requests where status = 'open'),
    'partners', coalesce((
      select jsonb_agg(x order by x.month_sales desc, x.name)
      from (
        select p.id, p.name, p.company_name, p.region,
               count(o.id) filter (where o.order_date >= d.month_start) as month_count,
               coalesce(sum(o.product_net_amount) filter (where o.order_date >= d.month_start), 0) as month_sales,
               coalesce(sum(o.install_fee + o.travel_fee) filter (where o.order_date >= d.month_start), 0) as month_install,
               count(o.id) as total_count
        from public.partners p
        cross join d
        left join o on o.partner_id = p.id
        where p.deleted_at is null
        group by p.id, p.name, p.company_name, p.region
      ) x
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
