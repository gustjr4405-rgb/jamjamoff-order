import type { ColorOption, OrderStatus } from "@/lib/types";

export const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "submitted",
  "confirmed",
  "in_production",
  "produced",
  "shipped",
  "install_scheduled",
  "installed",
  "cancelled",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "임시저장",
  submitted: "발주 접수",
  confirmed: "본사 확인",
  in_production: "제작 중",
  produced: "제작 완료",
  shipped: "발송 완료",
  install_scheduled: "시공 예정",
  installed: "시공 완료",
  cancelled: "취소",
};

/** 색상 배지 (Tailwind 클래스) */
export const STATUS_STYLE: Record<OrderStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  submitted: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-sky-50 text-sky-800 ring-sky-200",
  in_production: "bg-violet-50 text-violet-800 ring-violet-200",
  produced: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  shipped: "bg-teal-50 text-teal-800 ring-teal-200",
  install_scheduled: "bg-orange-50 text-orange-800 ring-orange-200",
  installed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

export const COLOR_LABEL: Record<ColorOption, string> = { white: "화이트", black: "블랙" };

export const SPACE_PRESETS = ["안방", "거실", "작은방", "아이방", "주방", "드레스룸", "베란다", "서재"];

export const INSTALL_TIME_PRESETS = ["오전 9시", "오전 10시", "오전 11시", "오후 1시", "오후 2시", "오후 3시", "오후 4시", "시간 협의"];

export const REGIONS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];
