import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Partner, Profile } from "@/lib/types";

export interface SessionInfo {
  profile: Profile;
  partner: Partner | null;
  isAdmin: boolean;
}

/** 현재 로그인 사용자 + 프로필 (요청당 1회 조회) */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, name, role, partner_id, is_active")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) return null;

  let partner: Partner | null = null;
  if (profile.partner_id) {
    const { data } = await supabase
      .from("partners")
      .select("id, name, company_name, region, phone, status")
      .eq("id", profile.partner_id)
      .maybeSingle<Partner>();
    partner = data;
  }
  return { profile, partner, isAdmin: profile.role === "admin" && profile.is_active };
});

/** 활성 사용자만 접근 허용 */
export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile.is_active || (!s.isAdmin && (!s.partner || s.partner.status !== "active"))) {
    redirect("/pending");
  }
  return s;
}

export async function requireAdmin(): Promise<SessionInfo> {
  const s = await requireSession();
  if (!s.isAdmin) redirect("/orders");
  return s;
}
