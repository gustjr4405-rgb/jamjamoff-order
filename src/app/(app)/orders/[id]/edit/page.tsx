import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OrderForm } from "@/components/order-form/order-form";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/auth";
import { getActivePartners, getActivePolicy, getOrderBundle, orderSnapshotPolicy, toFormInput } from "@/lib/queries";

export const metadata = { title: "발주 수정" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin } = await requireSession();
  const bundle = await getOrderBundle(id);
  if (!bundle) notFound();
  const { order } = bundle;

  const editable = isAdmin || ["draft", "submitted"].includes(order.status);
  const [active, partners] = await Promise.all([getActivePolicy(), isAdmin ? getActivePartners() : Promise.resolve([])]);

  return (
    <>
      <Link href={`/orders/${id}`} className="mb-3 inline-flex items-center text-sm text-neutral-500"><ChevronLeft className="size-4" />발주 상세</Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">발주 수정</h1>
        <span className="text-neutral-400">{order.order_no}</span>
        <StatusBadge status={order.status} />
      </div>
      {editable ? (
        <OrderForm
          isAdmin={isAdmin}
          partners={partners}
          policy={orderSnapshotPolicy(order, active)}
          initial={{ id: order.id, order_no: order.order_no, status: order.status, values: toFormInput(bundle) }}
        />
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="font-semibold">본사 확인 이후의 발주는 직접 수정할 수 없습니다.</p>
          <p className="mt-1 text-sm text-neutral-500">발주 상세 화면의 &lsquo;수정 요청&rsquo;으로 본사에 변경 내용을 전달해 주세요.</p>
        </div>
      )}
    </>
  );
}
