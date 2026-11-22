# JAMJAMOFF ORDER

잼잼오프 맞춤형 슬립필터 발주 관리 시스템 (Next.js 15 + Supabase).

## 빠른 시작

1. Supabase 프로젝트 생성 → **Authentication → Sign In / Providers → "Allow new users to sign up" 끄기** (계정은 본사가 발급)
2. SQL Editor 에서 `supabase/migrations/*.sql` 을 파일명 순서대로 실행 (또는 `supabase db push`)
3. 테스트 데이터: `supabase/seed.sql` 실행 (가상 인물만 포함)
4. `.env.example` → `.env.local` 복사 후 값 입력
5. 테스트 계정 생성: `node --env-file=.env.local scripts/create-users.mjs`
6. `npm install && npm run dev` → http://localhost:3000

## 구조

```
supabase/migrations/  0001 스키마 · 0002 가격계산/트리거/RPC · 0003 RLS · 0004 Storage
                      0005 검색 뷰 · 0006 수정요청 · 0007 대시보드 집계
supabase/seed.sql     샘플 데이터
supabase/tests/       RLS·위변조 테스트 (로컬 Postgres)
src/lib/pricing.ts    가격 계산 (프론트·서버 공용, DB 트리거와 동일 규칙)
src/app/(app)/        dashboard · orders · orders/new · orders/[id] · orders/[id]/edit
src/app/print/        제작 발주서 / 견적서 인쇄·PDF
```

## 보안 설계

- 모든 조회는 로그인 사용자 JWT 로 수행 → **RLS 가 DB 에서 파트너 간 데이터를 차단**
- 저장은 `save_order` RPC (security invoker, 트랜잭션) → RLS 적용
- 금액은 DB 트리거가 항상 재계산 → 클라이언트가 금액·단가를 위조해도 무효
- 파트너는 단가·담당 파트너·정책 스냅샷 변경 불가, 본사 확인 이후 수정 불가(수정 요청)
- 발주 저장 시 단가/최소면적/세율을 스냅샷 → 정책이 바뀌어도 기존 금액 불변
- 삭제는 소프트 삭제(관리자), 주요 테이블 변경은 `audit_logs` 기록

## 테스트

```bash
npm test                 # 가격 계산 단위 테스트
npm run test:db          # 로컬 Postgres: 마이그레이션 + RLS 테스트 + TS↔DB 패리티(랜덤 300건)
```
`test:db` 는 `psql -h /tmp -p 54329 -U postgres` 로 접속 가능한 로컬 Postgres 가 필요합니다 (`TEST_PG` 로 변경).
