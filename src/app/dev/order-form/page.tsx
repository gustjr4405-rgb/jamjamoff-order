import { notFound } from "next/navigation";
import { OrderForm } from "@/components/order-form/order-form";

/** 개발 전용: Supabase 없이 발주 폼 UI 확인 (프로덕션에서는 404) */
export default function DevOrderFormPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 pt-5 lg:px-8">
      <h1 className="mb-5 text-2xl font-extrabold">신규 발주 (미리보기)</h1>
      <OrderForm
        isAdmin={false}
        partners={[]}
        policy={{ unitPrice: 140000, unitPricePartner: 95000, minAreaM2: 2, vatRateBp: 1000, discountPresets: [0, 10, 12, 15, 20], maxDiscountRate: 30, defaultInstallFee: 100000, defaultTravelFee: 0, defaultVatMode: "excluded" }}
      />
    </main>
  );
}
