import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base placeholder:text-neutral-400 focus-visible:border-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
export { Textarea };
