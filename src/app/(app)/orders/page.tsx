import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { requireSession } from "@/lib/auth";
import { ORDER_STATUSES, REGIONS, STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { formatKRW } from "@/lib/pricing";
import { getActivePartners } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, OrderViewRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "발주 목록" };

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  status?: string;
  partner?: string;
  region?: string;
  df?: "order_date" | "desired_ship_date" | "shipped_at";
  from?: string;
  to?: string;
  page?: string;
};

/** PostgREST or() 구문을 깨뜨리는 문자 제거 */
const sanitize = (s: string) => s.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 50);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { isAdmin } = await requireSession();
  const supabase = await createClient();

  const page = Math.max(1, Number(sp.page) || 1);
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const dateField = sp.df === "desired_ship_date" || sp.df === "shipped_at" ? sp.df : "order_date";

  let query = supabase
    .from("orders_view")
    .select(
      "id, order_no, status, order_date, desired_ship_date, desired_install_date, item_count, total_amount, region, customer_name, customer_phone, customer_address, partner_name, partner_company, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const q = sanitize(sp.q ?? "");
  if (q) {
    const digits = q.replace(/\D/g, "");
    const ors = [`order_no.ilike.*${q}*`, `customer_name.ilike.*${q}*`];
    if (isAdmin) ors.push(`partner_name.ilike.*${q}*`, `partner_company.ilike.*${q}*`);
    if (digits.length >= 3) ors.push(`customer_phone_digits.like.*${digits}*`);
    query = query.or(ors.join(","));
  }
  if (status) query = query.eq("status", status);
  else query = query.neq("status", "cancelled");
  if (isAdmin && sp.partner) query = query.eq("partner_id", sp.partner);
  if (sp.region) query = query.eq("region", sp.region);
  if (sp.from) query = query.gte(dateField, sp.from);
  if (sp.to) query = query.lte(dateField, sp.to);

  const [{ data, count, error }, partners] = await Promise.all([query, isAdmin ? getActivePartners() : Promise.resolve([])]);
  const rows = (data ?? []) as OrderViewRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, String(v)));
    const s = p.toString();
    return s ? `/orders?${s}` : "/orders";
  };
  const advancedOpen = !!(sp.partner || sp.region || sp.from || sp.to);

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">발주 목록</h1>
          <p className="mt-1 text-sm text-neutral-500">총 {total.toLocaleString()}건</p>
        </div>
        <Button asChild className="hidden lg:inline-flex"><Link href="/orders/new"><Plus />신규 발주</Link></Button>
      </div>

      {/* 검색 */}
      <form className="mb-3 space-y-3" action="/orders">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-neutral-400" />
            <Input name="q" defaultValue={sp.q} placeholder={isAdmin ? "고객명 · 전화번호 · 주문번호 · 파트너" : "고객명 · 전화번호 · 주문번호"} className="pl-11" />
          </div>
          <Button type="submit">검색</Button>
        </div>
        <details open={advancedOpen} className="group rounded-2xl border border-neutral-200 bg-white">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-neutral-600">
            <SlidersHorizontal className="size-4" />상세 필터
            {advancedOpen && <span className="rounded-full bg-neutral-900 px-2 text-[11px] text-white">적용 중</span>}
          </summary>
          <div className="grid gap-3 border-t border-neutral-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {isAdmin && (
              <NativeSelect name="partner" defaultValue={sp.partner ?? ""} aria-label="파트너">
                <option value="">전체 파트너</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.company_name ?? p.name}</option>)}
              </NativeSelect>
            )}
            <NativeSelect name="region" defaultValue={sp.region ?? ""} aria-label="지역">
              <option value="">전체 지역</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
            <NativeSelect name="df" defaultValue={dateField} aria-label="기간 기준">
              <option value="order_date">발주일 기준</option>
              <option value="desired_ship_date">희망 발송일 기준</option>
              <option value="shipped_at">발송일 기준</option>
            </NativeSelect>
            <div className="flex items-center gap-2">
              <Input type="date" name="from" defaultValue={sp.from} aria-label="시작일" />
              <span className="text-neutral-400">~</span>
              <Input type="date" name="to" defaultValue={sp.to} aria-label="종료일" />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="sm">필터 적용</Button>
              <Button asChild variant="ghost" size="sm"><Link href="/orders">초기화</Link></Button>
            </div>
          </div>
        </details>
      </form>

      {/* 상태 필터 */}
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <Chip href={href({ status: undefined, page: undefined })} active={!status}>전체</Chip>
        {ORDER_STATUSES.map((s) => (
          <Chip key={s} href={href({ status: s, page: undefined })} active={status === s}>{STATUS_LABEL[s]}</Chip>
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">목록을 불러오지 못했습니다: {error.message}</p>}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <p className="font-semibold">발주가 없습니다.</p>
          <p className="mt-1 text-sm text-neutral-500">검색 조건을 바꾸거나 새 발주를 등록해 보세요.</p>
        </div>
      ) : (
        <>
          {/* 모바일 카드 */}
          <ul className="space-y-2.5 lg:hidden">
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="block rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-neutral-400">{o.order_no}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <p className="truncate text-[17px] font-bold">{o.customer_name}<span className="ml-2 text-sm font-normal text-neutral-500">{o.customer_phone}</span></p>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">{o.customer_address}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-neutral-500">
                      {formatDate(o.order_date)} · 창문 {o.item_count}개{isAdmin && ` · ${o.partner_company ?? o.partner_name}`}
                    </span>
                    <span className="font-bold tabular-nums">{formatKRW(o.total_amount)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* PC 테이블 */}
          <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold text-neutral-500">
                <tr>
                  <th className="px-4 py-3">주문번호</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">고객</th>
                  <th className="px-4 py-3">지역</th>
                  {isAdmin && <th className="px-4 py-3">파트너</th>}
                  <th className="px-4 py-3">발주일</th>
                  <th className="px-4 py-3">희망 발송</th>
                  <th className="px-4 py-3 text-right">창문</th>
                  <th className="px-4 py-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((o) => (
                  <tr key={o.id} className="group hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium"><Link href={`/orders/${o.id}`} className="group-hover:underline">{o.order_no}</Link></td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3"><Link href={`/orders/${o.id}`}><b>{o.customer_name}</b><span className="ml-2 text-neutral-500">{o.customer_phone}</span></Link></td>
                    <td className="px-4 py-3 text-neutral-600">{o.region ?? "-"}</td>
                    {isAdmin && <td className="px-4 py-3 text-neutral-600">{o.partner_company ?? o.partner_name}</td>}
                    <td className="px-4 py-3 tabular-nums text-neutral-600">{formatDate(o.order_date)}</td>
                    <td className="px-4 py-3 tabular-nums text-neutral-600">{formatDate(o.desired_ship_date)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{o.item_count}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKRW(o.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지 이동 */}
          <nav className="mt-6 flex items-center justify-center gap-2">
            <PageLink href={href({ page: String(page - 1) })} disabled={page <= 1} label="이전"><ChevronLeft /></PageLink>
            <span className="min-w-20 text-center text-sm tabular-nums text-neutral-600">{page} / {pages}</span>
            <PageLink href={href({ page: String(page + 1) })} disabled={page >= pages} label="다음"><ChevronRight /></PageLink>
          </nav>
        </>
      )}
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium", active ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-600")}>
      {children}
    </Link>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) return <span className="grid size-11 place-items-center rounded-xl border border-neutral-200 text-neutral-300 [&_svg]:size-5" aria-label={label}>{children}</span>;
  return <Link href={href} aria-label={label} className="grid size-11 place-items-center rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 [&_svg]:size-5">{children}</Link>;
}
