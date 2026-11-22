import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FormPolicy } from "@/components/order-form/order-form";
import type { CustomerRow, OrderItemRow, OrderRow, Partner, PricePolicy } from "@/lib/types";
import type { OrderFormInput } from "@/lib/order-schema";

export async function getActivePolicy(): Promise<PricePolicy | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("price_policies").select("*").eq("is_active", true).maybeSingle<PricePolicy>();
  return data;
}

export function toFormPolicy(p: PricePolicy): FormPolicy {
  return {
    unitPrice: p.unit_price_retail,
    unitPricePartner: p.unit_price_partner,
    minAreaM2: Number(p.min_area_m2),
    vatRateBp: p.vat_rate_bp,
    discountPresets: (p.discount_presets ?? []).map(Number),
    maxDiscountRate: Number(p.max_discount_rate),
    defaultInstallFee: p.default_install_fee,
    defaultTravelFee: p.default_travel_fee,
    defaultVatMode: p.default_vat_mode,
  };
}

/** 저장된 발주의 정책 스냅샷으로 폼 정책 구성 (기본 가격이 바뀌어도 기존 금액 유지) */
export function orderSnapshotPolicy(o: OrderRow, active: PricePolicy | null): FormPolicy {
  return {
    unitPrice: o.unit_price,
    unitPricePartner: o.unit_price_partner,
    minAreaM2: Number(o.min_area_m2),
    vatRateBp: o.vat_rate_bp,
    discountPresets: (active?.discount_presets ?? [0, 10, 12, 15, 20]).map(Number),
    maxDiscountRate: Number(active?.max_discount_rate ?? 100),
    defaultInstallFee: o.install_fee,
    defaultTravelFee: o.travel_fee,
    defaultVatMode: o.vat_mode,
  };
}

export async function getActivePartners(): Promise<Partner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company_name, region, phone, status")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("region")
    .order("name");
  return (data as Partner[]) ?? [];
}

export async function getOrderBundle(id: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle<OrderRow>();
  if (!order) return null;
  const [{ data: customer }, { data: items }, { data: partner }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", order.customer_id).maybeSingle<CustomerRow>(),
    supabase.from("order_items").select("*").eq("order_id", id).order("sort_order"),
    supabase.from("partners").select("id, name, company_name, region, phone, status").eq("id", order.partner_id).maybeSingle<Partner>(),
  ]);
  return { order, customer: customer!, items: (items as OrderItemRow[]) ?? [], partner };
}

export function toFormInput(b: NonNullable<Awaited<ReturnType<typeof getOrderBundle>>>): OrderFormInput {
  const { order: o, customer: c, items } = b;
  return {
    id: o.id,
    status: o.status === "draft" ? "draft" : "submitted",
    partner_id: o.partner_id,
    customer: {
      name: c.name,
      phone: c.phone,
      address: c.address,
      address_detail: c.address_detail,
      postal_code: c.postal_code ?? "",
      region: c.region ?? o.region ?? "",
    },
    order_date: o.order_date,
    desired_ship_date: o.desired_ship_date ?? "",
    desired_install_date: o.desired_install_date ?? "",
    desired_install_time: o.desired_install_time ?? "",
    request_note: o.request_note,
    items: items.map((i) => ({
      space_name: i.space_name,
      width_mm: i.width_mm,
      height_mm: i.height_mm,
      frame_color: i.frame_color,
      fabric_color: i.fabric_color,
      note: i.note,
    })),
    discount_rate: Number(o.discount_rate),
    install_fee: o.install_fee,
    travel_fee: o.travel_fee,
    vat_mode: o.vat_mode,
    unit_price: o.unit_price,
  };
}
