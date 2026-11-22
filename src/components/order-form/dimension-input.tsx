"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SizeUnit = "mm" | "cm";

const toText = (mm: number | "", unit: SizeUnit) => (mm === "" ? "" : unit === "mm" ? String(mm) : String(mm / 10));

/** mm 로 저장하되 cm 로도 입력할 수 있는 사이즈 입력창 */
export function DimensionInput({
  value,
  unit,
  onChange,
  invalid,
  ...rest
}: {
  value: number | "";
  unit: SizeUnit;
  onChange: (mm: number | "") => void;
  invalid?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(() => toText(value, unit));

  // 단위 변경 또는 외부 값 변경 시 표시값 동기화
  useEffect(() => {
    const parsed = parse(text, unit);
    if (parsed !== value) setText(toText(value, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit]);

  return (
    <div className="relative">
      <Input
        {...rest}
        inputMode={unit === "mm" ? "numeric" : "decimal"}
        value={text}
        aria-invalid={invalid || undefined}
        className={cn("pr-12 text-right text-lg font-semibold tabular-nums", rest.className)}
        onChange={(e) => {
          const t = e.target.value.replace(unit === "mm" ? /[^\d]/g : /[^\d.]/g, "");
          setText(t);
          onChange(parse(t, unit));
        }}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">{unit}</span>
    </div>
  );
}

function parse(t: string, unit: SizeUnit): number | "" {
  if (t === "" || t === ".") return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "";
  return unit === "mm" ? Math.round(n) : Math.round(n * 10);
}
