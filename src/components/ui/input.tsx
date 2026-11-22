import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 placeholder:text-neutral-400 focus-visible:border-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:bg-neutral-50 disabled:text-neutral-500 aria-[invalid=true]:border-red-500",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
export { Input };
