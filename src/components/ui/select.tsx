import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** 모바일에서 OS 기본 선택창을 쓰기 위해 네이티브 select 를 사용 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-12 w-full appearance-none rounded-xl border border-neutral-300 bg-white pl-4 pr-10 text-base text-neutral-950 focus-visible:border-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:bg-neutral-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-neutral-500" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
export { NativeSelect };
