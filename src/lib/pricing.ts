/**
 * JAMJAMOFF 가격 계산 — 프론트(실시간 표시)와 서버(저장 전 검증)에서 공용으로 사용.
 * DB 트리거(supabase/migrations/*_pricing_and_functions.sql)와 동일한 규칙이며
 * tests/pricing.test.ts 의 패리티 테스트로 일치 여부를 검증한다.
 *
 * 부동소수 오차를 피하기 위해 면적은 mm² 정수, 비율은 basis point(1/10000) 정수로 계산한다.
 */

export type VatMode = "included" | "excluded";

export interface PricingPolicy {
  unitPrice: number; // 고객 판매 단가 (원/㎡)
  unitPricePartner: number; // 파트너 공급 단가 (원/㎡)
  minAreaM2: number; // 창문당 최소 적용 면적
  vatRateBp: number; // 1000 = 10%
}

export interface PricingItemInput {
  widthMm: number;
  heightMm: number;
}

export interface PricingInput {
  items: PricingItemInput[];
  discountRate: number; // % (소수 2자리까지)
  installFee: number;
  travelFee: number;
  vatMode: VatMode;
}

export interface LineResult {
  actualAreaM2: number;
  appliedAreaM2: number;
  minApplied: boolean; // 최소 면적이 적용되었는지
  lineAmount: number;
  lineSupply: number;
}

export interface PricingResult {
  lines: LineResult[];
  itemCount: number;
  totalActualAreaM2: number;
  totalAppliedAreaM2: number;
  productAmount: number;
  discountAmount: number;
  productNetAmount: number;
  supplyAmount: number;
  subtotalAmount: number;
  supplyValue: number;
  vatAmount: number;
  totalAmount: number;
}

const MM2_PER_M2 = 1_000_000;

/** Postgres round(numeric) 과 동일: 0.5 는 0 에서 멀어지는 방향 */
export function roundHalfAway(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

const toInt = (n: unknown): number => {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function calcLine(item: PricingItemInput, policy: PricingPolicy): LineResult {
  const w = toInt(item.widthMm);
  const h = toInt(item.heightMm);
  const actualMm2 = w * h;
  const minMm2 = roundHalfAway(policy.minAreaM2 * MM2_PER_M2);
  const appliedMm2 = Math.max(actualMm2, minMm2);
  return {
    actualAreaM2: actualMm2 / MM2_PER_M2,
    appliedAreaM2: appliedMm2 / MM2_PER_M2,
    minApplied: appliedMm2 > actualMm2,
    lineAmount: roundHalfAway((appliedMm2 * policy.unitPrice) / MM2_PER_M2),
    lineSupply: roundHalfAway((appliedMm2 * policy.unitPricePartner) / MM2_PER_M2),
  };
}

export function calcDiscount(amount: number, ratePercent: number): number {
  const bp = roundHalfAway((Number(ratePercent) || 0) * 100);
  return roundHalfAway((amount * bp) / 10_000);
}

export function calculateOrder(input: PricingInput, policy: PricingPolicy): PricingResult {
  const lines = input.items.map((it) => calcLine(it, policy));
  // 면적 합계는 mm² 정수로 더한 뒤 변환해 소수 오차 방지
  const sumMm2 = (k: "actualAreaM2" | "appliedAreaM2") =>
    lines.reduce((s, l) => s + Math.round(l[k] * MM2_PER_M2), 0) / MM2_PER_M2;

  const productAmount = lines.reduce((s, l) => s + l.lineAmount, 0);
  const supplyAmount = lines.reduce((s, l) => s + l.lineSupply, 0);
  const discountAmount = calcDiscount(productAmount, input.discountRate);
  const productNetAmount = productAmount - discountAmount;
  const installFee = toInt(input.installFee);
  const travelFee = toInt(input.travelFee);
  const subtotalAmount = productNetAmount + installFee + travelFee;

  let supplyValue: number;
  let vatAmount: number;
  let totalAmount: number;
  if (input.vatMode === "excluded") {
    supplyValue = subtotalAmount;
    vatAmount = roundHalfAway((subtotalAmount * policy.vatRateBp) / 10_000);
    totalAmount = subtotalAmount + vatAmount;
  } else {
    totalAmount = subtotalAmount;
    supplyValue = roundHalfAway((subtotalAmount * 10_000) / (10_000 + policy.vatRateBp));
    vatAmount = totalAmount - supplyValue;
  }

  return {
    lines,
    itemCount: lines.length,
    totalActualAreaM2: sumMm2("actualAreaM2"),
    totalAppliedAreaM2: sumMm2("appliedAreaM2"),
    productAmount,
    discountAmount,
    productNetAmount,
    supplyAmount,
    subtotalAmount,
    supplyValue,
    vatAmount,
    totalAmount,
  };
}

/** 정산: 파트너 정산 예정 금액 (시공비·출장비 × 귀속 비율) */
export function calcPartnerPayable(
  installFee: number,
  travelFee: number,
  installSharePct: number,
  travelSharePct: number,
): number {
  return (
    roundHalfAway((installFee * installSharePct) / 100) +
    roundHalfAway((travelFee * travelSharePct) / 100)
  );
}

// ---------------------------------------------------------------- 표시용
export const formatKRW = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const formatArea = (m2: number) =>
  `${m2.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}㎡`;
