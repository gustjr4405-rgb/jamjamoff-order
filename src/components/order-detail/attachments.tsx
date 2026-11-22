"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2 } from "lucide-react";
import { uploadOrderFiles } from "@/lib/upload";

export interface AttachmentView {
  id: string;
  file_name: string;
  mime_type: string | null;
  kind: string;
  url: string | null;
}

const KIND_LABEL: Record<string, string> = { site_photo: "현장", install_photo: "시공 완료", document: "문서", other: "기타" };

export function Attachments({ orderId, items, canUpload }: { orderId: string; items: AttachmentView[]; canUpload: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"site_photo" | "install_photo">("site_photo");

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const failed = await uploadOrderFiles(orderId, Array.from(list), kind);
    setBusy(false);
    if (failed.length) toast.error(`업로드 실패: ${failed.join(", ")}`);
    else toast.success("업로드했습니다.");
    router.refresh();
  }

  return (
    <div>
      {items.length === 0 && <p className="mb-3 text-sm text-neutral-500">첨부된 사진이 없습니다.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((a) => (
          <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-xl border bg-neutral-100">
            {a.mime_type?.startsWith("image/") && a.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.file_name} className="size-full object-cover" loading="lazy" />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-neutral-600"><FileText className="size-6" />{a.file_name}</span>
            )}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{KIND_LABEL[a.kind] ?? a.kind}</span>
          </a>
        ))}
        {canUpload && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500 hover:bg-neutral-50">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            사진 추가
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={busy} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {canUpload && (
        <div className="mt-3 flex gap-1.5 text-sm">
          {(["site_photo", "install_photo"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`h-8 rounded-full border px-3 ${kind === k ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200"}`}>
              {KIND_LABEL[k]} 사진
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
