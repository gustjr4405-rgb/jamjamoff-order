import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { calcDiscount, calcLine, calcPartnerPayable, calculateOrder, type PricingPolicy } from "@/lib/pricing";

const RETAIL: PricingPolicy = { unitPrice: 140_000, unitPricePartner: 95_000, minAreaM2: 2, vatRateBp: 1000 };

describe("calcLine — 면적/최소면적", () => {
  it("1800×1500 = 2.7㎡ → 378,000원", () => {
    const l = calcLine({ widthMm: 1800, heightMm: 1500 }, RETAIL);
    expect(l.actualAreaM2).toBe(2.7);
    expect(l.appliedAreaM2).toBe(2.7);
    expect(l.minApplied).toBe(false);
    expect(l.lineAmount).toBe(378_000);
    expect(l.lineSupply).toBe(256_500);
  });
  it("2㎡ 미만은 2㎡로 계산하되 실제 면적은 별도로 표시", () => {
    const l = calcLine({ widthMm: 1000, heightMm: 1000 }, RETAIL);
    expect(l.actualAreaM2).toBe(1);
    expect(l.appliedAreaM2).toBe(2);
    expect(l.minApplied).toBe(true);
    expect(l.lineAmount).toBe(280_000);
  });
  it("정확히 2㎡ 는 최소면적 미적용", () => {
    const l = calcLine({ widthMm: 2000, heightMm: 1000 }, RETAIL);
    expect(l.minApplied).toBe(false);
    expect(l.lineAmount).toBe(280_000);
  });
  it("소수 면적은 원 단위 반올림", () => {
    // 1234×1789 = 2.207626㎡ × 140,000 = 309,067.64 → 309,068
    expect(calcLine({ widthMm: 1234, heightMm: 1789 }, RETAIL).lineAmount).toBe(309_068);
  });
  it("잘못된 값(음수/NaN)은 0 으로 처리 → 최소면적", () => {
    const l = calcLine({ widthMm: -5, heightMm: Number.NaN }, RETAIL);
    expect(l.actualAreaM2).toBe(0);
    expect(l.appliedAreaM2).toBe(2);
  });
});

describe("calcDiscount", () => {
  it.each([
    [658_000, 0, 0],
    [658_000, 10, 65_800],
    [658_000, 12, 78_960],
    [658_000, 15, 98_700],
    [658_000, 20, 131_600],
    [1_000_005, 12.5, 125_001], // 125,000.625 → 125,001
    [333_333, 10, 33_333],
  ])("%i원 × %f%% = %i원", (amount, rate, expected) => {
    expect(calcDiscount(amount, rate)).toBe(expected);
  });
});

describe("calculateOrder — 할인/시공비/부가세", () => {
  const items = [
    { widthMm: 1800, heightMm: 1500 },
    { widthMm: 1500, heightMm: 1200 },
  ];

  it("부가세 별도: 할인은 제품 금액에만 적용", () => {
    const r = calculateOrder({ items, discountRate: 10, installFee: 100_000, travelFee: 30_000, vatMode: "excluded" }, RETAIL);
    expect(r.totalActualAreaM2).toBe(4.5);
    expect(r.totalAppliedAreaM2).toBe(4.7);
    expect(r.productAmount).toBe(658_000);
    expect(r.discountAmount).toBe(65_800); // 시공비/출장비에는 할인 미적용
    expect(r.subtotalAmount).toBe(592_200 + 100_000 + 30_000);
    expect(r.vatAmount).toBe(72_220);
    expect(r.totalAmount).toBe(794_420);
    expect(r.supplyAmount).toBe(256_500 + 190_000);
  });

  it("부가세 포함: 합계에 부가세를 다시 더하지 않음 (중복 과세 방지)", () => {
    const r = calculateOrder({ items, discountRate: 0, installFee: 100_000, travelFee: 0, vatMode: "included" }, RETAIL);
    expect(r.totalAmount).toBe(758_000);
    expect(r.supplyValue + r.vatAmount).toBe(r.totalAmount);
    expect(r.supplyValue).toBe(689_091); // 758,000 / 1.1 = 689,090.9
    expect(r.vatAmount).toBe(68_909);
  });

  it("파트너 공급가 정책", () => {
    const partner: PricingPolicy = { ...RETAIL, unitPrice: 95_000 };
    const r = calculateOrder({ items: [{ widthMm: 1800, heightMm: 1500 }], discountRate: 0, installFee: 0, travelFee: 0, vatMode: "excluded" }, partner);
    expect(r.productAmount).toBe(256_500);
  });

  it("창문이 없으면 0원 (시공비만)", () => {
    const r = calculateOrder({ items: [], discountRate: 20, installFee: 100_000, travelFee: 0, vatMode: "excluded" }, RETAIL);
    expect(r.productAmount).toBe(0);
    expect(r.totalAmount).toBe(110_000);
  });

  it("부동소수 오차 없이 면적 합산 (0.1+0.2 문제)", () => {
    const r = calculateOrder({ items: [{ widthMm: 100, heightMm: 1000 }, { widthMm: 200, heightMm: 1000 }], discountRate: 0, installFee: 0, travelFee: 0, vatMode: "excluded" }, { ...RETAIL, minAreaM2: 0 });
    expect(r.totalActualAreaM2).toBe(0.3);
  });

  it("정산 예정 금액", () => {
    expect(calcPartnerPayable(100_000, 30_000, 100, 100)).toBe(130_000);
    expect(calcPartnerPayable(100_000, 30_000, 70, 50)).toBe(85_000);
  });
});

// ---------------------------------------------------------------------
// 프론트(TS) ↔ 서버(DB 트리거) 패리티 테스트
//   로컬 Postgres 가 있을 때만 실행:  TEST_PG_DB=jj_test npm test
// ---------------------------------------------------------------------
const PG_DB = process.env.TEST_PG_DB;
describe.skipIf(!PG_DB)("TS ↔ DB 가격 계산 일치 (랜덤 300건)", () => {
  it("모든 금액이 동일", () => {
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const cases = Array.from({ length: 300 }, () => ({
      policy: {
        unitPrice: 50_000 + rnd(200_000),
        unitPricePartner: 30_000 + rnd(100_000),
        minAreaM2: [0, 1.5, 2, 2.25][rnd(4)],
        vatRateBp: [0, 1000, 1000, 800][rnd(4)],
      },
      input: {
        items: Array.from({ length: rnd(6) }, () => ({ widthMm: 1 + rnd(4000), heightMm: 1 + rnd(3000) })),
        discountRate: [0, 10, 12, 15, 20, 7.5, 12.35, 33.33][rnd(8)],
        installFee: rnd(3) * 50_000 + rnd(7) * 1_111,
        travelFee: rnd(4) * 10_000 + rnd(3),
        vatMode: (rnd(2) ? "included" : "excluded") as "included" | "excluded",
      },
    }));

    const sql = [
      "begin;",
      "create temp table parity(idx int, r jsonb);",
      ...cases.map((c, i) => {
        const id = `00000000-0000-4000-f000-${String(i).padStart(12, "0")}`;
        const p = c.policy;
        const it = c.input;
        const items = it.items
          .map((x, k) => `('${id}', ${k}, '창${k}', ${x.widthMm}, ${x.heightMm})`)
          .join(",");
        return [
          `insert into orders (id, partner_id, customer_id, status, unit_price, unit_price_partner, min_area_m2, vat_rate_bp, vat_mode, discount_rate, install_fee, travel_fee)
           values ('${id}', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'draft',
                   ${p.unitPrice}, ${p.unitPricePartner}, ${p.minAreaM2}, ${p.vatRateBp}, '${it.vatMode}', ${it.discountRate}, ${it.installFee}, ${it.travelFee});`,
          items ? `insert into order_items (order_id, sort_order, space_name, width_mm, height_mm) values ${items};` : "",
          `insert into parity select ${i}, to_jsonb(o) from orders o where id = '${id}';`,
        ].join("\n");
      }),
      "select json_agg(json_build_object('i', idx, 'r', r) order by idx) from parity;",
      "rollback;",
    ].join("\n");

    const out = execFileSync("psql", ["-h", process.env.TEST_PG_HOST ?? "/tmp", "-p", process.env.TEST_PG_PORT ?? "54329", "-U", "postgres", "-d", PG_DB!, "-At", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const rows: { i: number; r: Record<string, string | number> }[] = JSON.parse(out.trim().split("\n").find((l) => l.startsWith("["))!);
    expect(rows).toHaveLength(cases.length);
    for (const { i, r } of rows) {
      const ts = calculateOrder(cases[i].input, cases[i].policy);
      expect({
        product: Number(r.product_amount), discount: Number(r.discount_amount), supply: Number(r.supply_amount),
        subtotal: Number(r.subtotal_amount), supplyValue: Number(r.supply_value), vat: Number(r.vat_amount),
        total: Number(r.total_amount), actual: Number(r.total_actual_area), applied: Number(r.total_applied_area),
      }, `case #${i}`).toEqual({
        product: ts.productAmount, discount: ts.discountAmount, supply: ts.supplyAmount,
        subtotal: ts.subtotalAmount, supplyValue: ts.supplyValue, vat: ts.vatAmount,
        total: ts.totalAmount, actual: ts.totalActualAreaM2, applied: ts.totalAppliedAreaM2,
      });
    }
  });
});
