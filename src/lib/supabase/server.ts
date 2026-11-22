import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/** 로그인한 사용자 권한으로 동작하는 서버 클라이언트 (RLS 적용) */
export async function createClient() {
  assertSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없음 — middleware 가 세션을 갱신함
        }
      },
    },
  });
}
