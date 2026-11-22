"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { firstError, submittedOrderSchema, type OrderFormInput } from "@/lib/order-schema";
import { calculateOrder } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function dbError(e: { message?: string; code?: string } | null): string {
  if (!e) return "알 수 없는 오류가 발생했습니다.";
  // P0001/22023/42501 등 DB 함수에서 던진 한국어 메시지는 그대로 노출
  if (e.message && /[가-힣]/.test(e.message)) return e.message;
  if (e.code === "42501") return "권한이 없습니다.";
  console.error("[db]", e);
  return "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 발주 저장 (신규/수정, 임시저장/접수) */
export async function saveOrder(input: OrderFormInput): Promise<Result<{ id: string; order_no: string }>> {
  const session = await getSession();
  if (!session?.profile.is_active) return { ok: false, error: "로그인이 필요합니다." };

  const parsed = submittedOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  if (session.isAdmin && !v.id && !v.partner_id) return { ok: false, error: "담당 파트너를 선택해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_order", {
    p: {
      id: v.id || null,
      status: v.status,
      partner_id: session.isAdmin ? v.partner_id || null : null,
      customer: v.customer,
      order_date: v.order_date,
      desired_ship_date: v.desired_ship_date,
      desired_install_date: v.desired_install_date,
      desired_install_time: v.desired_install_time,
      request_note: v.request_note,
      discount_rate: v.discount_rate,
      install_fee: v.install_fee,
      travel_fee: v.travel_fee,
      vat_mode: v.vat_mode,
      unit_price: session.isAdmin ? v.unit_price : undefined,
      items: v.items.map((it) => ({
        space_name: it.space_name,
        width_mm: it.width_mm,
        height_mm: it.height_mm,
        frame_color: it.frame_color,
        fabric_color: it.fabric_color,
        note: it.note,
      })),
    },
  });
  if (error) return { ok: false, error: dbError(error) };
  const saved = data as { id: string; order_no: string };

  // 서버 측 무결성 점검: DB 트리거 계산값 == 공용 TS 계산값
  const { data: o } = await supabase
    .from("orders")
    .select("unit_price, unit_price_partner, min_area_m2, vat_rate_bp, total_amount, product_amount")
    .eq("id", saved.id)
    .single();
  if (o) {
    const ts = calculateOrder(
      {
        items: v.items.map((i) => ({ widthMm: i.width_mm, heightMm: i.height_mm })),
        discountRate: v.discount_rate,
        installFee: v.install_fee,
        travelFee: v.travel_fee,
        vatMode: v.vat_mode,
      },
      { unitPrice: o.unit_price, unitPricePartner: o.unit_price_partner, minAreaM2: Number(o.min_area_m2), vatRateBp: o.vat_rate_bp },
    );
    if (ts.totalAmount !== o.total_amount) {
      console.error("[pricing-mismatch]", saved.order_no, { ts: ts.totalAmount, db: o.total_amount });
    }
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${saved.id}`);
  revalidatePath("/dashboard");
  return { ok: true, ...saved };
}

/** 상태 변경 (관리자: 모든 상태, 파트너: 임시저장/접수/취소 — DB 에서 강제) */
export async function changeOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_note: note?.slice(0, 500) || null,
  });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** 관리자 소프트 삭제 */
export async function deleteOrder(orderId: string): Promise<Result> {
  const session = await getSession();
  if (!session?.isAdmin) return { ok: false, error: "관리자만 삭제할 수 있습니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("soft_delete_order", { p_order_id: orderId });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** 중복 발주 확인 (최근 90일 동일 연락처) */
export async function checkDuplicate(phone: string, excludeOrderId?: string) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("check_duplicate_order", {
    p_phone: phone,
    p_exclude_order_id: excludeOrderId || null,
  });
  const row = (data as { total_count: number; mine_count: number; last_order_date: string | null }[] | null)?.[0];
  return row && row.total_count > 0 ? row : null;
}

/** 첨부파일 메타데이터 기록 (파일은 브라우저에서 Storage 로 직접 업로드, RLS 로 검증) */
export async function recordAttachment(input: {
  orderId: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind?: "site_photo" | "install_photo" | "document" | "other";
}): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };
  if (!input.path.startsWith(`${input.orderId}/`)) return { ok: false, error: "잘못된 경로입니다." };
  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({
    order_id: input.orderId,
    kind: input.kind ?? "site_photo",
    storage_path: input.path,
    file_name: input.fileName.slice(0, 200),
    mime_type: input.mimeType,
    size_bytes: input.size,
    uploaded_by: session.profile.id,
  });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true };
}

/** 파트너 수정 요청 등록 */
export async function createChangeRequest(orderId: string, content: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };
  const text = content.trim();
  if (!text) return { ok: false, error: "요청 내용을 입력해 주세요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("order_change_requests")
    .insert({ order_id: orderId, content: text.slice(0, 2000), requested_by: session.profile.id });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/** 관리자: 수정 요청 처리 */
export async function resolveChangeRequest(requestId: string, orderId: string, status: "resolved" | "rejected"): Promise<Result> {
  const session = await getSession();
  if (!session?.isAdmin) return { ok: false, error: "관리자만 처리할 수 있습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("order_change_requests")
    .update({ status, resolved_by: session.profile.id, resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
