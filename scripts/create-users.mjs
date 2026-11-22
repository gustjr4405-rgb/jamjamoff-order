// 테스트/초기 계정 생성 (Supabase Auth Admin API, service_role 키 필요)
//   node --env-file=.env.local scripts/create-users.mjs
// seed.sql 실행 후 사용. 이메일/비밀번호는 환경변수로 바꿀 수 있습니다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const PW = process.env.SEED_PASSWORD ?? "ChangeMe!2026";

const accounts = [
  { email: "admin@jamjamoff.test", name: "본사관리자", role: "admin", partner_id: null },
  { email: "partner-a@jamjamoff.test", name: "테스트파트너A", role: "partner", partner_id: "00000000-0000-4000-b000-000000000001" },
  { email: "partner-b@jamjamoff.test", name: "테스트파트너B", role: "partner", partner_id: "00000000-0000-4000-b000-000000000002" },
];

for (const a of accounts) {
  let id;
  const { data, error } = await supabase.auth.admin.createUser({ email: a.email, password: PW, email_confirm: true, user_metadata: { name: a.name } });
  if (error) {
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    id = list?.users.find((u) => u.email === a.email)?.id;
    if (!id) { console.error(a.email, error.message); continue; }
  } else id = data.user.id;
  const { error: e2 } = await supabase.from("users").update({ name: a.name, role: a.role, partner_id: a.partner_id, is_active: true }).eq("id", id);
  console.log(e2 ? `✗ ${a.email}: ${e2.message}` : `✓ ${a.email} (${a.role})`);
}
console.log(`비밀번호: ${PW === "ChangeMe!2026" ? "ChangeMe!2026 (SEED_PASSWORD 로 변경 가능)" : "(SEED_PASSWORD)"}`);
