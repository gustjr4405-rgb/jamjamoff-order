import { OrderForm } from "@/components/order-form/order-form";
import { requireSession } from "@/lib/auth";
import { getActivePartners, getActivePolicy, toFormPolicy } from "@/lib/queries";

export const metadata = { title: "신규 발주" };

export default async function NewOrderPage() {
  const { isAdmin, partner } = await requireSession();
  const [policy, partners] = await Promise.all([getActivePolicy(), isAdmin ? getActivePartners() : Promise.resolve([])]);

  if (!policy) {
    return <p className="rounded-2xl bg-red-50 p-6 text-red-700">활성화된 가격 정책이 없습니다. 본사 관리자에게 문의해 주세요.</p>;
  }
  return (
    <>
      <PageTitle title="신규 발주" sub={isAdmin ? "본사에서 파트너 발주를 대신 등록합니다." : `${partner?.company_name ?? partner?.name ?? ""} · ${partner?.region ?? ""}`} />
      <OrderForm isAdmin={isAdmin} partners={partners} policy={toFormPolicy(policy)} defaultPartnerId={partner?.id} />
    </>
  );
}

function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-neutral-500">{sub}</p>}
    </div>
  );
}
