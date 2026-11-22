// 환경변수는 코드에 직접 쓰지 않고 .env.local / Vercel 환경변수로 주입합니다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요.",
    );
  }
}

export const hasSupabaseEnv = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
