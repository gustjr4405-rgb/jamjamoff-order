import { COLOR_LABEL, STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { formatArea, formatKRW } from "@/lib/pricing";
import type { CustomerRow, OrderItemRow, OrderRow, Partner } from "@/lib/types";

export interface SheetData {
  order: OrderRow;
  customer: CustomerRow;
  items: OrderItemRow[];
  partner: Pick<Partner, "name" | "company_name"> | null;
}

const partnerLabel = (p: SheetData["partner"]) => (p ? (p.company_name ? `${p.company_name} (${p.name})` : p.name) : "-");
const fullAddress = (c: CustomerRow) => [c.address, c.address_detail].filter(Boolean).join(" ");

/** 카카오톡 등에 붙여넣는 기본 발주서 (금액 정보 없음) */
export function buildOrderSheetText({ order: o, customer: c, items, partner }: SheetData): string {
  const lines = [
    "[JAMJAMOFF 발주서]",
    `발주번호: ${o.order_no}`,
    `발주일: ${formatDate(o.order_date)}`,
    `희망 발송일: ${formatDate(o.desired_ship_date)}`,
    `고객명: ${c.name}`,
    `연락처: ${c.phone}`,
    `주소: ${fullAddress(c)}`,
    "",
    ...items.flatMap((i) => [
      `설치 공간: ${i.space_name}`,
      `가로: ${i.width_mm}mm`,
      `세로: ${i.height_mm}mm`,
      `프레임: ${COLOR_LABEL[i.frame_color]}`,
      `원단: ${COLOR_LABEL[i.fabric_color]}`,
      "",
    ]),
    `요청사항: ${o.request_note || "-"}`,
    `담당 파트너: ${partnerLabel(partner)}`,
    `진행 상태: ${STATUS_LABEL[o.status]}`,
  ];
  return lines.join("\n");
}

/** 공장 전달용 제작 발주서 — 고객 판매가·할인율 등 금액 정보 제외, 고객 연락처 최소화 */
export function buildFactorySheetText({ order: o, items, partner }: SheetData): string {
  return [
    "[JAMJAMOFF 제작 발주서]",
    `발주번호: ${o.order_no}`,
    `발주일: ${formatDate(o.order_date)}`,
    `희망 발송일: ${formatDate(o.desired_ship_date)}`,
    `담당 파트너: ${partnerLabel(partner)}`,
    `수량: ${items.length}개`,
    "",
    ...items.flatMap((i, n) => [
      `${n + 1}. ${i.space_name}  ${i.width_mm} × ${i.height_mm} mm  /  프레임 ${COLOR_LABEL[i.frame_color]} · 원단 ${COLOR_LABEL[i.fabric_color]}${i.note ? `  (${i.note})` : ""}`,
    ]),
    "",
    `요청사항: ${o.request_note || "-"}`,
  ].join("\n");
}

/** 고객 견적서 */
export function buildQuoteText({ order: o, customer: c, items }: SheetData): string {
  return [
    "[JAMJAMOFF 견적서]",
    `견적번호: ${o.order_no}`,
    `견적일: ${formatDate(o.order_date)}`,
    `고객명: ${c.name} 님`,
    "",
    ...items.map(
      (i) =>
        `· ${i.space_name} ${i.width_mm}×${i.height_mm}mm (${formatArea(Number(i.applied_area))}) ${formatKRW(i.line_amount)}`,
    ),
    "",
    `제품 금액: ${formatKRW(o.product_amount)}`,
    ...(o.discount_amount ? [`할인(${Number(o.discount_rate)}%): -${formatKRW(o.discount_amount)}`] : []),
    `시공비: ${formatKRW(o.install_fee)}`,
    ...(o.travel_fee ? [`출장비: ${formatKRW(o.travel_fee)}`] : []),
    `부가세${o.vat_mode === "included" ? "(포함)" : "(별도)"}: ${formatKRW(o.vat_amount)}`,
    `최종 합계: ${formatKRW(o.total_amount)} (부가세 포함)`,
  ].join("\n");
}
