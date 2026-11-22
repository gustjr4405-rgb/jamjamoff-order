import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-bold">초기 설정이 필요합니다</h1>
        <p className="mt-3 text-neutral-600">.env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정한 뒤 서버를 다시 시작해 주세요. (README 참고)</p>
      </main>
    );
  }
  if (await getSession()) redirect(next && next.startsWith("/") ? next : "/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <p className="text-[13px] font-semibold tracking-[0.2em] text-neutral-500">SLEEP FILTER</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">JAMJAMOFF<br />ORDER</h1>
        <p className="mt-3 text-sm text-neutral-500">본사·파트너 발주 관리 시스템</p>
      </div>
      <LoginForm next={next} />
      <p className="mt-10 text-center text-xs text-neutral-400">계정 발급은 본사 관리자에게 문의해 주세요.</p>
    </main>
  );
}
