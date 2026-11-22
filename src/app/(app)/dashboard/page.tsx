import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatKRW } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { OrderViewRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "대시보드" };

interface Stats {
  today: string;
  today_count: number;
  week_count: number;
  month_count: number;
  month_product_sales: number;
  month_supply_sales: number;
  month_install_fees: number;
  unconfirmed: number;
  in_production: number;
  ship_waiting: number;
  install_scheduled: number;
  drafts: number;
  open_requests: number;
  partners: { id: string; name: string; company_name: string | null; region: string; month_count: number; month_sales: number; month_install: number; total_count: number }[];
}

export default async function DashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, { data: pending }] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase
      .from("orders_view")
      .select("id, order_no, status, order_date, desired_ship_date, customer_name, partner_name, partner_company, total_amount, item_count")
      .eq("status", "submitted")
      .order("created_at", { ascending: true })
      .limit(8),
  ]);
  if (error || !data) return <p className="rounded-xl bg-red-50 p-4 text-red-700">대시보드를 불러오지 못했습니다. {error?.message}</p>;
  const s = data as Stats;
  const maxSales = Math.max(1, ...s.partners.map((p) => Number(p.month_sales)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">{formatDate(s.today, true)} 기준 · 임시저장·취소 제외</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="오늘 신규 발주" value={`${s.today_count}건`} />
        <Stat label="이번 주 발주" value={`${s.week_count}건`} />
        <Stat label="이번 달 발주" value={`${s.month_count}건`} />
        <Stat label="이번 달 제품 매출" value={formatKRW(s.month_product_sales)} sub={`시공·출장비 ${formatKRW(s.month_install_fees)}`} dark />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Pipeline href="/orders?status=submitted" label="미확인 발주" value={s.unconfirmed} alert={s.unconfirmed > 0} />
        <Pipeline href="/orders?status=in_production" label="제작 중" value={s.in_production} />
        <Pipeline href="/orders?status=produced" label="발송 대기" value={s.ship_waiting} />
        <Pipeline href="/orders?status=install_scheduled" label="시공 예정" value={s.install_scheduled} />
      </div>
      {s.open_requests > 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">파트너 수정 요청 <b>{s.open_requests}건</b>이 처리 대기 중입니다. 발주 상세 화면에서 확인해 주세요.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>확인 대기 발주</CardTitle>
            <Link href="/orders?status=submitted" className="flex items-center text-sm text-neutral-500">전체 <ArrowRight className="size-4" /></Link>
          </CardHeader>
          <CardContent>
            {(pending as OrderViewRow[] | null)?.length ? (
              <ul className="divide-y divide-neutral-100">
                {(pending as OrderViewRow[]).map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{o.customer_name} <span className="text-sm font-normal text-neutral-500">· {o.partner_company ?? o.partner_name}</span></p>
                        <p className="text-xs text-neutral-500">{o.order_no} · 창문 {o.item_count}개 · 희망발송 {formatDate(o.desired_ship_date)}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-neutral-500">확인 대기 중인 발주가 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>파트너별 이번 달 실적</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {s.partners.map((p) => (
                <li key={p.id}>
                  <Link href={`/orders?partner=${p.id}`} className="block">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{p.company_name ?? p.name} <span className="font-normal text-neutral-400">{p.region}</span></span>
                      <span className="shrink-0 tabular-nums"><b>{formatKRW(p.month_sales)}</b> <span className="text-neutral-500">· {p.month_count}건</span></span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full rounded-full bg-neutral-900" style={{ width: `${(Number(p.month_sales) / maxSales) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
              {s.partners.length === 0 && <p className="text-sm text-neutral-500">등록된 파트너가 없습니다.</p>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, dark }: { label: string; value: string; sub?: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", dark ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white")}>
      <p className={cn("text-xs font-medium", dark ? "text-neutral-400" : "text-neutral-500")}>{label}</p>
      <p className="mt-1 truncate text-xl font-extrabold tabular-nums lg:text-2xl">{value}</p>
      {sub && <p className={cn("mt-0.5 truncate text-xs", dark ? "text-neutral-400" : "text-neutral-500")}>{sub}</p>}
    </div>
  );
}

function Pipeline({ href, label, value, alert }: { href: string; label: string; value: number; alert?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center justify-between rounded-2xl border bg-white p-4 hover:bg-neutral-50", alert ? "border-amber-300" : "border-neutral-200")}>
      <span className="text-sm font-medium text-neutral-600">{label}</span>
      <span className={cn("text-2xl font-extrabold tabular-nums", alert && "text-amber-600")}>{value}</span>
    </Link>
  );
}
