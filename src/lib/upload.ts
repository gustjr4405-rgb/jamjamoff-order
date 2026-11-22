"use client";
import { recordAttachment } from "@/app/actions/orders";
import { createClient } from "@/lib/supabase/client";

export const ATTACHMENT_BUCKET = "order-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 발주 첨부파일 업로드: Storage(RLS) → attachments 기록. 실패한 파일명 목록 반환 */
export async function uploadOrderFiles(
  orderId: string,
  files: File[],
  kind: "site_photo" | "install_photo" = "site_photo",
): Promise<string[]> {
  const supabase = createClient();
  const failed: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      failed.push(`${file.name} (10MB 초과)`);
      continue;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${orderId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) {
      failed.push(file.name);
      continue;
    }
    const res = await recordAttachment({ orderId, path, fileName: file.name, mimeType: file.type, size: file.size, kind });
    if (!res.ok) failed.push(file.name);
  }
  return failed;
}
