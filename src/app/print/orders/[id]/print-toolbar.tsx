"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur">
      <p className="text-sm text-neutral-500">인쇄 창에서 &lsquo;PDF로 저장&rsquo;을 선택하면 PDF 파일로 저장됩니다.</p>
      <Button onClick={() => window.print()}><Printer />인쇄 · PDF 저장</Button>
    </div>
  );
}
