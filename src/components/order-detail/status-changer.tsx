"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { changeOrderStatus } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/constants";
import type { OrderStatus } from "@/lib/types";

/** 관리자 상태 변경 */
export function StatusChanger({ orderId, current }: { orderId: string; current: OrderStatus }) {
  const router = useRouter();
  const idx = ORDER_STATUSES.indexOf(current);
  const nextDefault = current === "cancelled" || current === "installed" ? current : ORDER_STATUSES[Math.min(idx + 1, 7)];
  const [status, setStatus] = useState<OrderStatus>(nextDefault);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (status === current) return void toast.info("현재 상태와 같습니다.");
      if (status === "cancelled" && !confirm("이 발주를 취소 처리할까요?")) return;
      const res = await changeOrderStatus(orderId, status, note);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`'${STATUS_LABEL[status]}'(으)로 변경했습니다.`);
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {ORDER_STATUSES.filter((s) => s !== "draft").map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={`h-11 rounded-xl border text-sm font-semibold ${status === s ? "border-neutral-950 bg-neutral-950 text-white" : s === current ? "border-neutral-400 bg-neutral-100" : "border-neutral-200 bg-white text-neutral-600"}`}>
            {STATUS_LABEL[s]}{s === current && " ✓"}
          </button>
        ))}
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="변경 메모 (선택)" />
      <Button className="w-full" onClick={submit} disabled={pending || status === current}>
        {pending && <Loader2 className="animate-spin" />}상태 변경
      </Button>
    </div>
  );
}
