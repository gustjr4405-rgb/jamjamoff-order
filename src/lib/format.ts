/** 휴대폰/전화번호 자동 형식: 01012345678 → 010-1234-5678 */
export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export function isValidPhone(input: string): boolean {
  return /^(01[016789]\d{7,8}|0\d{8,10})$/.test(input.replace(/\D/g, ""));
}

const KST = "Asia/Seoul";

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
export function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(new Date());
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → 2026.11.22 (일) */
export function formatDate(ymd: string | null | undefined, withWeekday = false): string {
  if (!ymd) return "-";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const base = `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  if (!withWeekday) return base;
  const wd = "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${base} (${wd})`;
}

/** timestamptz → 한국 시간 2026.11.22 14:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}.${g("month")}.${g("day")} ${g("hour")}:${g("minute")}`;
}

/** cm ↔ mm */
export const cmToMm = (cm: number) => Math.round(cm * 10);
export const mmToCm = (mm: number) => mm / 10;
