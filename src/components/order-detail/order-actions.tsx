"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, XCircle } from "lucide-react";
import { changeOrderStatus, createChangeRequest, deleteOrder, resolveChangeRequest } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function DeleteOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" className="text-red-600" disabled={pending}
      onClick={() => start(async () => {
        if (!confirm("이 발주를 삭제할까요?\n(소프트 삭제: 목록에서 숨겨지며 데이터는 보존됩니다)")) return;
        const r = await deleteOrder(orderId);
        if (!r.ok) return void toast.error(r.error);
        toast.success("삭제했습니다.");
        router.replace("/orders");
      })}>
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}삭제
    </Button>
  );
}

export function PartnerCancelButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" className="text-red-600" disabled={pending}
      onClick={() => start(async () => {
        if (!confirm("이 발주를 취소할까요? 취소 후에는 수정할 수 없습니다.")) return;
        const r = await changeOrderStatus(orderId, "cancelled", "파트너 취소");
        if (!r.ok) return void toast.error(r.error);
        toast.success("발주를 취소했습니다.");
        router.refresh();
      })}>
      {pending ? <Loader2 className="animate-spin" /> : <XCircle />}발주 취소
    </Button>
  );
}

export function ChangeRequestForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="예) 고객 연락처 변경: 010-0000-0000 / 작은방 세로 1200 → 1250mm" />
      <Button className="w-full" variant="outline" disabled={pending || !text.trim()}
        onClick={() => start(async () => {
          const r = await createChangeRequest(orderId, text);
          if (!r.ok) return void toast.error(r.error);
          toast.success("본사에 수정 요청을 보냈습니다.");
          setText("");
          router.refresh();
        })}>
        {pending && <Loader2 className="animate-spin" />}수정 요청 보내기
      </Button>
    </div>
  );
}

export function ResolveRequestButtons({ requestId, orderId }: { requestId: string; orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (s: "resolved" | "rejected") =>
    start(async () => {
      const r = await resolveChangeRequest(requestId, orderId, s);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => act("resolved")}>처리 완료</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("rejected")}>반려</Button>
    </div>
  );
}
