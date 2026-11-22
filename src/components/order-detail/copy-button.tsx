"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export function CopyButton({ text, label = "복사", ...rest }: { text: string; label?: string } & ButtonProps) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 구형 브라우저 대체
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    toast.success(`${label} 완료`);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <Button type="button" variant="outline" onClick={copy} {...rest}>
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
