import { z } from "zod";
import { isValidPhone } from "@/lib/format";

const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다.")
  .or(z.literal(""))
  .nullish()
  .transform((v) => v || "");

export const orderItemSchema = z.object({
  key: z.string().optional(),
  space_name: z.string().trim().max(30, "설치 공간 이름은 30자 이하").default(""),
  width_mm: z.coerce.number().int("가로는 mm 정수").min(100, "가로는 100mm 이상").max(10000, "가로는 10,000mm 이하"),
  height_mm: z.coerce.number().int("세로는 mm 정수").min(100, "세로는 100mm 이상").max(10000, "세로는 10,000mm 이하"),
  frame_color: z.enum(["white", "black"]),
  fabric_color: z.enum(["white", "black"]),
  note: z.string().max(200).default(""),
});

export const orderFormSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["draft", "submitted"]),
  partner_id: z.string().optional().default(""),
  customer: z.object({
    name: z.string().trim().min(1, "고객 성함을 입력해 주세요.").max(30),
    phone: z.string().trim().max(20).default(""),
    address: z.string().trim().max(200).default(""),
    address_detail: z.string().trim().max(100).default(""),
    postal_code: z.string().trim().max(10).default(""),
    region: z.string().trim().max(20).default(""),
  }),
  order_date: optDate,
  desired_ship_date: optDate,
  desired_install_date: optDate,
  desired_install_time: z.string().max(30).default(""),
  request_note: z.string().max(2000).default(""),
  items: z.array(orderItemSchema).max(50, "창문은 최대 50개까지 입력할 수 있습니다."),
  discount_rate: z.coerce.number().min(0, "할인율은 0% 이상").max(100, "할인율은 100% 이하"),
  install_fee: z.coerce.number().int().min(0, "시공비는 0원 이상").max(100_000_000),
  travel_fee: z.coerce.number().int().min(0, "출장비는 0원 이상").max(100_000_000),
  vat_mode: z.enum(["included", "excluded"]),
  unit_price: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

/** 발주 접수 시에만 필요한 추가 검증 */
export const submittedOrderSchema = orderFormSchema.superRefine((v, ctx) => {
  if (v.status !== "submitted") return;
  if (!isValidPhone(v.customer.phone))
    ctx.addIssue({ code: "custom", path: ["customer", "phone"], message: "연락처를 정확히 입력해 주세요." });
  if (!v.customer.address)
    ctx.addIssue({ code: "custom", path: ["customer", "address"], message: "시공 주소를 입력해 주세요." });
  if (v.items.length === 0)
    ctx.addIssue({ code: "custom", path: ["items"], message: "창문을 1개 이상 입력해 주세요." });
});

export type OrderFormInput = z.input<typeof orderFormSchema>;
export type OrderFormValues = z.output<typeof orderFormSchema>;

/** 첫 번째 오류 메시지 */
export function firstError(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return "입력값을 확인해 주세요.";
  if (i.path[0] === "items" && typeof i.path[1] === "number") return `창문 ${i.path[1] + 1}: ${i.message}`;
  return i.message;
}
