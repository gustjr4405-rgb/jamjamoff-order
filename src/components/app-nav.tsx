"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const items = (isAdmin: boolean) => [
  ...(isAdmin ? [{ href: "/dashboard", label: "대시보드", icon: LayoutDashboard }] : []),
  { href: "/orders", label: "발주 목록", icon: ClipboardList },
];

const isActive = (path: string, href: string) =>
  href === "/orders" ? path === "/orders" || (path.startsWith("/orders/") && !path.startsWith("/orders/new")) : path.startsWith(href);

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      <li className="mb-4">
        <Link href="/orders/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-950 text-[15px] font-semibold text-white hover:bg-neutral-800">
          <Plus className="size-[18px]" />신규 발주
        </Link>
      </li>
      {items(isAdmin).map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            className={cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-neutral-600 hover:bg-neutral-100",
              isActive(path, href) && "bg-neutral-100 font-semibold text-neutral-950",
            )}
          >
            <Icon className="size-[18px]" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MobileTabBar({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const tabs = items(isAdmin);
  return (
    <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {tabs.slice(0, 1).map((t) => <Tab key={t.href} {...t} active={isActive(path, t.href)} />)}
        <Link href="/orders/new" className="flex flex-1 flex-col items-center justify-center" aria-label="신규 발주">
          <span className={cn("grid size-12 -translate-y-3 place-items-center rounded-2xl bg-neutral-950 text-white shadow-lg shadow-neutral-950/20", path.startsWith("/orders/new") && "ring-4 ring-neutral-200")}>
            <Plus className="size-6" />
          </span>
          <span className="-mt-2.5 text-[11px] font-semibold">신규 발주</span>
        </Link>
        {tabs.slice(1).map((t) => <Tab key={t.href} {...t} active={isActive(path, t.href)} />)}
      </div>
    </nav>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Plus; active: boolean }) {
  return (
    <Link href={href} className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-neutral-400", active && "text-neutral-950")}>
      <Icon className="size-[22px]" />
      {label}
    </Link>
  );
}
