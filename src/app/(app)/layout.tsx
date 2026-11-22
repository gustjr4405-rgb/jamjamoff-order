import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { AppNav, MobileTabBar } from "@/components/app-nav";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, partner, isAdmin } = await requireSession();
  const who = isAdmin ? "본사 관리자" : partner?.company_name || partner?.name || "파트너";

  return (
    <div className="min-h-dvh bg-neutral-50/60 lg:flex">
      {/* PC 사이드바 */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-6 lg:flex">
        <Link href="/" className="px-2 text-lg font-extrabold tracking-tight">JAMJAMOFF<span className="ml-1 font-medium text-neutral-400">ORDER</span></Link>
        <nav className="mt-8 flex-1">
          <AppNav isAdmin={isAdmin} />
        </nav>
        <div className="border-t border-neutral-100 px-2 pt-4 text-sm">
          <p className="font-semibold">{profile.name || profile.email}</p>
          <p className="text-neutral-500">{who}</p>
          <form action={signOut} className="mt-3">
            <button className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900"><LogOut className="size-4" />로그아웃</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 모바일 헤더 */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="text-[17px] font-extrabold tracking-tight">JAMJAMOFF<span className="ml-1 font-medium text-neutral-400">ORDER</span></Link>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="max-w-32 truncate">{who}</span>
            <form action={signOut}>
              <button aria-label="로그아웃" className="grid size-9 place-items-center rounded-lg hover:bg-neutral-100"><LogOut className="size-[18px]" /></button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      <MobileTabBar isAdmin={isAdmin} />
    </div>
  );
}
