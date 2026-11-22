import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { COLOR_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatArea, formatKRW } from "@/lib/pricing";
import { getOrderBundle } from "@/lib/queries";
import { PrintToolbar } from "./print-toolbar";

export const metadata = { title: "인쇄" };

/**
 * type=factory : 공장 전달용 제작 발주서 (금액·할인·고객 연락처 제외)
 * type=quote   : 고객 전달용 견적서 (판매가 기준, 파트너 공급가 제외)
 */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const [{ id }, { type }] = await Promise.all([params, searchParams]);
  await requireSession();
  const bundle = await getOrderBundle(id);
  if (!bundle) notFound();
  const { order: o, customer: c, items, partner } = bundle;
  const isQuote = type === "quote";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <PrintToolbar />
      <article className="mx-auto my-6 max-w-[210mm] bg-white p-[14mm] text-[13px] leading-relaxed text-neutral-900 shadow-sm print:my-0 print:p-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-neutral-900 pb-4">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] text-neutral-500">JAMJAMOFF</p>
            <h1 className="text-2xl font-extrabold">{isQuote ? "견 적 서" : "제 작 발 주 서"}</h1>
          </div>
          <div className="text-right text-xs">
            <p>{isQuote ? "견적번호" : "발주번호"} <b className="text-sm">{o.order_no}</b></p>
            <p>{isQuote ? "견적일" : "발주일"} {formatDate(o.order_date)}</p>
            {!isQuote && <p>진행 상태 {STATUS_LABEL[o.status]}</p>}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5">
          {isQuote ? (
            <>
              <Info label="고객명" value={`${c.name} 님`} />
              <Info label="연락처" value={c.phone} />
              <Info label="시공 주소" value={`${c.address} ${c.address_detail}`} wide />
              <Info label="시공 예정" value={`${formatDate(o.desired_install_date)} ${o.desired_install_time ?? ""}`} />
              <Info label="담당" value={partner?.company_name ?? partner?.name ?? "-"} />
            </>
          ) : (
            <>
              <Info label="담당 파트너" value={partner ? `${partner.company_name ?? ""} ${partner.name}` : "-"} />
              <Info label="희망 발송일" value={formatDate(o.desired_ship_date, true)} />
              <Info label="고객명" value={c.name} />
              <Info label="지역" value={o.region ?? "-"} />
              <Info label="수량" value={`${items.length}개`} />
            </>
          )}
        </section>

        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-neutral-900 bg-neutral-50 text-xs">
              <th className="px-2 py-2">No</th>
              <th className="px-2 py-2">설치 공간</th>
              <th className="px-2 py-2 text-right">가로(mm)</th>
              <th className="px-2 py-2 text-right">세로(mm)</th>
              <th className="px-2 py-2">프레임</th>
              <th className="px-2 py-2">원단</th>
              {isQuote ? <><th className="px-2 py-2 text-right">적용 면적</th><th className="px-2 py-2 text-right">금액</th></> : <th className="px-2 py-2">비고</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id} className="border-b border-neutral-200">
                <td className="px-2 py-2.5">{n + 1}</td>
                <td className="px-2 py-2.5 font-semibold">{i.space_name}</td>
                <td className="px-2 py-2.5 text-right text-base font-bold tabular-nums">{i.width_mm.toLocaleString()}</td>
                <td className="px-2 py-2.5 text-right text-base font-bold tabular-nums">{i.height_mm.toLocaleString()}</td>
                <td className="px-2 py-2.5">{COLOR_LABEL[i.frame_color]}</td>
                <td className="px-2 py-2.5">{COLOR_LABEL[i.fabric_color]}</td>
                {isQuote ? (
                  <>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatArea(Number(i.applied_area))}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatKRW(i.line_amount)}</td>
                  </>
                ) : (
                  <td className="px-2 py-2.5">{i.note}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isQuote && (
          <section className="ml-auto mt-5 w-72 space-y-1">
            <Sum label={`제품 금액 (${formatKRW(o.unit_price)}/㎡)`} value={formatKRW(o.product_amount)} />
            {o.discount_amount > 0 && <Sum label={`할인 (${Number(o.discount_rate)}%)`} value={`−${formatKRW(o.discount_amount)}`} />}
            <Sum label="시공비" value={formatKRW(o.install_fee)} />
            {o.travel_fee > 0 && <Sum label="출장비" value={formatKRW(o.travel_fee)} />}
            <Sum label="공급가액" value={formatKRW(o.supply_value)} />
            <Sum label={`부가세 (${o.vat_mode === "included" ? "포함" : "별도"})`} value={formatKRW(o.vat_amount)} />
            <div className="flex justify-between border-t-2 border-neutral-900 pt-2 text-base font-extrabold">
              <span>합계 (VAT 포함)</span>
              <span className="tabular-nums">{formatKRW(o.total_amount)}</span>
            </div>
            <p className="pt-1 text-[11px] text-neutral-500">※ 창문당 최소 {Number(o.min_area_m2)}㎡ 기준으로 산정됩니다.</p>
          </section>
        )}

        <section className="mt-6 rounded border border-neutral-300 p-3">
          <p className="text-xs font-bold text-neutral-500">요청 사항</p>
          <p className="mt-1 min-h-10 whitespace-pre-wrap">{o.request_note || "-"}</p>
        </section>

        <footer className="mt-8 flex justify-between border-t border-neutral-200 pt-3 text-[11px] text-neutral-400">
          <span>JAMJAMOFF 맞춤형 슬립필터</span>
          <span>출력 {formatDateTime(new Date().toISOString())}</span>
        </footer>
      </article>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 flex gap-3" : "flex gap-3"}>
      <span className="w-20 shrink-0 text-neutral-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
