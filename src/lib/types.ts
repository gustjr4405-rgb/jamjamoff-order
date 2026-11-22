import type { VatMode } from "@/lib/pricing";

export type UserRole = "admin" | "partner";
export type OrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "in_production"
  | "produced"
  | "shipped"
  | "install_scheduled"
  | "installed"
  | "cancelled";
export type ColorOption = "white" | "black";

export interface Profile {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  partner_id: string | null;
  is_active: boolean;
}

export interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  region: string;
  phone: string | null;
  status: "active" | "suspended";
}

export interface PricePolicy {
  id: string;
  name: string;
  unit_price_retail: number;
  unit_price_partner: number;
  min_area_m2: number;
  default_install_fee: number;
  default_travel_fee: number;
  discount_presets: number[];
  max_discount_rate: number;
  vat_rate_bp: number;
  default_vat_mode: VatMode;
  settle_install_share: number;
  settle_travel_share: number;
}

export interface OrderRow {
  id: string;
  order_no: string;
  partner_id: string;
  customer_id: string;
  status: OrderStatus;
  region: string | null;
  order_date: string;
  desired_ship_date: string | null;
  desired_install_date: string | null;
  desired_install_time: string | null;
  request_note: string;
  unit_price: number;
  unit_price_partner: number;
  min_area_m2: number;
  vat_rate_bp: number;
  vat_mode: VatMode;
  discount_rate: number;
  install_fee: number;
  travel_fee: number;
  item_count: number;
  total_actual_area: number;
  total_applied_area: number;
  product_amount: number;
  discount_amount: number;
  product_net_amount: number;
  supply_amount: number;
  subtotal_amount: number;
  supply_value: number;
  vat_amount: number;
  total_amount: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderViewRow extends OrderRow {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_address_detail: string;
  partner_name: string;
  partner_company: string | null;
  partner_region: string;
  shipped_at: string | null;
  carrier: string | null;
  tracking_no: string | null;
  install_scheduled_date: string | null;
  install_completed_date: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  sort_order: number;
  space_name: string;
  width_mm: number;
  height_mm: number;
  frame_color: ColorOption;
  fabric_color: ColorOption;
  note: string;
  actual_area: number;
  applied_area: number;
  line_amount: number;
  line_supply: number;
}

export interface CustomerRow {
  id: string;
  partner_id: string;
  name: string;
  phone: string;
  address: string;
  address_detail: string;
  postal_code: string | null;
  region: string | null;
}

export interface StatusHistoryRow {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}
