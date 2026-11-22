import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-neutral-500">삭제되었거나 접근 권한이 없는 발주일 수 있습니다.</p>
      <Button asChild className="mt-6"><Link href="/">처음으로</Link></Button>
    </main>
  );
}
