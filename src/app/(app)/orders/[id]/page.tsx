import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Printer } from "lucide-react";
import { Attachments, type AttachmentView } from "@/components/order-detail/attachments";
import { CopyButton } from "@/components/order-detail/copy-button";
import { ChangeRequestForm, DeleteOrderButton, PartnerCancelButton, ResolveRequestButtons } from "@/components/order-detail/order-actions";
import { StatusChanger } from "@/components/order-detail/status-changer";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { COLOR_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildFactorySheetText, buildOrderSheetText, buildQuoteText } from "@/lib/order-sheet";
import { formatArea, formatKRW } from "@/lib/pricing";
import { getOrderBundle } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { StatusHistoryRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "발주 상세" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin } = await requireSession();
  const bundle = await getOrderBundle(id);
  if (!bundle) notFound();
  const { order: o, customer: c, items, partner } = bundle;

  const supabase = await createClient();
  const [{ data: history }, { data: atts }, { data: requests }] = await Promise.all([
    supabase.from("order_status_history").select("*").eq("order_id", id).order("changed_at", { ascending: false }),
    supabase.from("attachments").select("id, file_name, mime_type, kind, storage_path").eq("order_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("order_change_requests").select("id, content, status, created_at").eq("order_id", id).order("created_at", { ascending: false }),
  ]);

  // 변경자 이름 (관리자는 전체 사용자 조회 가능, 파트너는 본인만 → 나머지는 '본사')
  const userIds = [...new Set((history ?? []).map((h) => h.changed_by).filter(Boolean))] as string[];
  const { data: users } = userIds.length ? await supabase.from("users").select("id, name, role").in("id", userIds) : { data: [] };
  const userName = (uid: string | null) => {
    const u = users?.find((x) => x.id === uid);
    return u ? u.name || (u.role === "admin" ? "본사" : "파트너") : uid ? "본사" : "시스템";
  };

  // 비공개 버킷 → 1시간 signed URL
  let attachments: AttachmentView[] = [];
  if (atts?.length) {
    const { data: signed } = await supabase.storage.from("order-files").createSignedUrls(atts.map((a) => a.storage_path), 3600);
    attachments = atts.map((a, i) => ({ id: a.id, file_name: a.file_name, mime_type: a.mime_type, kind: a.kind, url: signed?.[i]?.signedUrl ?? null }));
  }

  const editableByPartner = ["draft", "submitted"].includes(o.status);
  const canEdit = isAdmin || editableByPartner;
  const sheet = { order: o, customer: c, items, partner };

  return (
    <div className="space-y-4">
      <Link href="/orders" className="inline-flex items-center text-sm text-neutral-500"><ChevronLeft className="size-4" />발주 목록</Link>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={o.status} className="text-sm" />
            <span className="text-sm text-neutral-500">{o.order_no}</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">{c.name} <span className="text-lg font-semibold text-neutral-400">고객님</span></h1>
          <p className="text-sm text-neutral-500">발주일 {formatDate(o.order_date, true)} · {partner?.company_name ?? partner?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button asChild variant="outline"><Link href={`/orders/${o.id}/edit`}><Pencil />수정</Link></Button>}
          {isAdmin && <DeleteOrderButton orderId={o.id} />}
          {!isAdmin && editableByPartner && <PartnerCancelButton orderId={o.id} />}
        </div>
      </div>

      {/* 발주서 / 견적서 */}
      <Card>
        <CardHeader><CardTitle>발주서 · 견적서</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CopyButton text={buildOrderSheetText(sheet)} label="발주서 복사" className="col-span-2 sm:col-span-1" />
          <CopyButton text={buildFactorySheetText(sheet)} label="제작 발주서 복사" />
          <CopyButton text={buildQuoteText(sheet)} label="견적서 복사" />
          <Button asChild variant="secondary"><Link href={`/print/orders/${o.id}?type=factory`} target="_blank"><Printer />제작 발주서 PDF·인쇄</Link></Button>
          <Button asChild variant="secondary"><Link href={`/print/orders/${o.id}?type=quote`} target="_blank"><Printer />견적서 PDF·인쇄</Link></Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {/* 고객 정보 */}
          <Card>
            <CardHeader><CardTitle>고객 정보</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
                <Field label="고객 성함" value={c.name} />
                <Field label="연락처" value={<a href={`tel:${c.phone}`} className="underline underline-offset-2">{c.phone || "-"}</a>} />
                <Field label="시공 주소" value={[c.postal_code && `(${c.postal_code})`, c.address, c.address_detail].filter(Boolean).join(" ") || "-"} className="sm:col-span-2" />
                <Field label="지역" value={o.region ?? c.region ?? "-"} />
                <Field label="담당 파트너" value={partner ? `${partner.company_name ?? ""} ${partner.name}`.trim() : "-"} />
              </dl>
            </CardContent>
          </Card>

          {/* 제품 */}
          <Card>
            <CardHeader><CardTitle>제품 정보 <span className="ml-1 text-sm font-medium text-neutral-400">{items.length}개</span></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.map((i, n) => (
                <div key={i.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-950 text-sm font-bold text-white">{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{i.space_name} <span className="ml-1 font-semibold tabular-nums">{i.width_mm} × {i.height_mm}mm</span></p>
                    <p className="text-sm text-neutral-500">
                      프레임 {COLOR_LABEL[i.frame_color]} · 원단 {COLOR_LABEL[i.fabric_color]} · 실제 {formatArea(Number(i.actual_area))}
                      {Number(i.applied_area) > Number(i.actual_area) && ` → 최소 ${formatArea(Number(i.applied_area))}`}
                    </p>
                  </div>
                  <span className="text-right font-semibold tabular-nums">{formatKRW(i.line_amount)}</span>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-neutral-500">등록된 창문이 없습니다.</p>}
            </CardContent>
          </Card>

          {/* 일정 */}
          <Card>
            <CardHeader><CardTitle>일정 정보</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-[15px]">
                <Field label="발주일" value={formatDate(o.order_date, true)} />
                <Field label="희망 발송일" value={formatDate(o.desired_ship_date, true)} />
                <Field label="희망 시공일" value={formatDate(o.desired_install_date, true)} />
                <Field label="희망 시공 시간" value={o.desired_install_time || "-"} />
                <Field label="요청 사항" value={<span className="whitespace-pre-wrap">{o.request_note || "-"}</span>} className="col-span-2" />
              </dl>
            </CardContent>
          </Card>

          {/* 사진 */}
          <Card>
            <CardHeader><CardTitle>현장 · 시공 사진</CardTitle></CardHeader>
            <CardContent><Attachments orderId={o.id} items={attachments} canUpload={o.status !== "cancelled"} /></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* 금액 */}
          <Card>
            <CardHeader>
              <CardTitle>금액 정보</CardTitle>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold">부가세 {o.vat_mode === "included" ? "포함" : "별도"}</span>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-[15px]">
                <Money label="제품 단가" value={`${formatKRW(o.unit_price)}/㎡`} />
                <Money label="총 면적" value={`${formatArea(Number(o.total_actual_area))} → ${formatArea(Number(o.total_applied_area))}`} />
                <Money label="제품 금액" value={formatKRW(o.product_amount)} />
                <Money label={`할인 (${Number(o.discount_rate)}%)`} value={o.discount_amount ? `−${formatKRW(o.discount_amount)}` : "0원"} className="text-red-600" />
                <Money label="시공비" value={formatKRW(o.install_fee)} />
                <Money label="출장비" value={formatKRW(o.travel_fee)} />
                <div className="border-t border-neutral-200 pt-2" />
                <Money label="공급가액" value={formatKRW(o.supply_value)} />
                <Money label={`부가세 ${o.vat_mode === "included" ? "(포함분)" : "(별도)"}`} value={formatKRW(o.vat_amount)} />
                <div className="flex items-baseline justify-between border-t border-neutral-900 pt-3">
                  <dt className="font-bold">최종 합계</dt>
                  <dd className="text-2xl font-extrabold tabular-nums">{formatKRW(o.total_amount)}</dd>
                </div>
                <p className="pt-1 text-xs text-neutral-500">파트너 공급가 {formatKRW(o.unit_price_partner)}/㎡ · 공급가 합계 {formatKRW(o.supply_amount)}</p>
              </dl>
            </CardContent>
          </Card>

          {/* 상태 변경 (관리자) */}
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle>진행 상태 변경</CardTitle></CardHeader>
              <CardContent><StatusChanger orderId={o.id} current={o.status} /></CardContent>
            </Card>
          )}

          {/* 수정 요청 */}
          {(isAdmin ? (requests?.length ?? 0) > 0 : true) && (
            <Card>
              <CardHeader><CardTitle>수정 요청</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {requests?.map((r) => (
                  <div key={r.id} className={cn("rounded-xl border p-3 text-sm", r.status === "open" ? "border-amber-200 bg-amber-50" : "border-neutral-200 text-neutral-500")}>
                    <p className="whitespace-pre-wrap">{r.content}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span>{formatDateTime(r.created_at)} · {r.status === "open" ? "처리 대기" : r.status === "resolved" ? "처리 완료" : "반려"}</span>
                      {isAdmin && r.status === "open" && <ResolveRequestButtons requestId={r.id} orderId={o.id} />}
                    </div>
                  </div>
                ))}
                {!isAdmin && o.status !== "cancelled" && (
                  editableByPartner
                    ? <p className="text-sm text-neutral-500">본사 확인 전에는 &lsquo;수정&rsquo; 버튼으로 직접 수정할 수 있습니다.</p>
                    : <ChangeRequestForm orderId={o.id} />
                )}
              </CardContent>
            </Card>
          )}

          {/* 상태 이력 */}
          <Card>
            <CardHeader><CardTitle>진행 이력</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-neutral-200 pl-5">
                {(history as StatusHistoryRow[] | null)?.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-neutral-900 ring-4 ring-white" />
                    <p className="text-sm font-semibold">
                      {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ""}{STATUS_LABEL[h.to_status]}
                    </p>
                    <p className="text-xs text-neutral-500">{formatDateTime(h.changed_at)} · {userName(h.changed_by)}</p>
                    {h.note && <p className="mt-0.5 text-sm text-neutral-600">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Money({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={cn("text-right font-semibold tabular-nums", className)}>{value}</dd>
    </div>
  );
}
