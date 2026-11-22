import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">계정 승인 대기 중</h1>
      <p className="mt-3 text-neutral-600">본사 관리자가 계정을 파트너와 연결하고 활성화하면 사용할 수 있습니다.</p>
      <form action={signOut} className="mt-8">
        <Button variant="outline" className="w-full">로그아웃</Button>
      </form>
    </main>
  );
}
