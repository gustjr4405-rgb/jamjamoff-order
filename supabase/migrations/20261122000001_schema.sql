-- =====================================================================
-- JAMJAMOFF ORDER — 0001 스키마
--   * 모든 금액은 원(KRW) 정수, 사이즈는 mm 정수
--   * 날짜 기본값은 한국 시간(Asia/Seoul) 기준
--   * 삭제는 deleted_at 을 이용한 소프트 삭제
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'partner');

create type public.order_status as enum (
  'draft',             -- 임시저장
  'submitted',         -- 발주 접수
  'confirmed',         -- 본사 확인
  'in_production',     -- 제작 중
  'produced',          -- 제작 완료
  'shipped',           -- 발송 완료
  'install_scheduled', -- 시공 예정
  'installed',         -- 시공 완료
  'cancelled'          -- 취소
);

-- included: 입력 금액이 부가세 포함가 / excluded: 부가세 별도(추가 청구)
create type public.vat_mode as enum ('included', 'excluded');
create type public.color_option as enum ('white', 'black');
create type public.settlement_status as enum ('pending', 'partial', 'completed');
create type public.delivery_status as enum ('ready', 'in_transit', 'delivered', 'returned');
create type public.attachment_kind as enum ('site_photo', 'install_photo', 'document', 'other');

-- KST 오늘 날짜
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- partners : 지역 시공 파트너
-- ---------------------------------------------------------------------
create table public.partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                 -- 파트너(담당자)명
  company_name  text,                          -- 업체명
  region        text not null,                 -- 담당 지역
  phone         text,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger trg_partners_touch before update on public.partners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- users : auth.users 와 1:1 프로필 (권한 정보)
-- ---------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  name        text not null default '',
  role        public.user_role not null default 'partner',
  partner_id  uuid references public.partners (id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint partner_user_needs_partner check (role = 'admin' or partner_id is not null or is_active = false)
);
create index on public.users (partner_id);
create trigger trg_users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- 신규 auth 사용자 → 비활성 파트너 프로필 생성.
-- (user_metadata 는 사용자가 조작할 수 있으므로 권한 정보로 사용하지 않음.
--  관리자가 파트너를 연결/활성화해야 사용 가능)
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name, role, partner_id, is_active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''), 'partner', null, false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- price_policies : 가격/세금/정산 정책 (활성 정책은 1개)
-- ---------------------------------------------------------------------
create table public.price_policies (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  unit_price_retail       integer not null check (unit_price_retail >= 0),   -- 일반가 (원/㎡)
  unit_price_partner      integer not null check (unit_price_partner >= 0),  -- 파트너 공급가 (원/㎡)
  min_area_m2             numeric(6,2) not null check (min_area_m2 >= 0),    -- 창문당 최소 적용 면적
  default_install_fee     integer not null default 100000 check (default_install_fee >= 0),
  default_travel_fee      integer not null default 0 check (default_travel_fee >= 0),
  discount_presets        numeric(5,2)[] not null default '{0,10,12,15,20}',
  max_discount_rate       numeric(5,2) not null default 50 check (max_discount_rate between 0 and 100),
  vat_rate_bp             integer not null default 1000 check (vat_rate_bp between 0 and 10000), -- 1000bp = 10%
  default_vat_mode        public.vat_mode not null default 'excluded',
  -- 정산 정책 (파트너 귀속 비율, %)
  settle_install_share    numeric(5,2) not null default 100 check (settle_install_share between 0 and 100),
  settle_travel_share     numeric(5,2) not null default 100 check (settle_travel_share between 0 and 100),
  is_active               boolean not null default false,
  created_by              uuid references public.users (id),
  created_at              timestamptz not null default now()
);
create unique index price_policies_one_active on public.price_policies (is_active) where is_active;

-- ---------------------------------------------------------------------
-- customers : 고객 (파트너 소유)
-- ---------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners (id),
  name            text not null check (length(trim(name)) > 0),
  phone           text not null,
  address         text not null default '',
  address_detail  text not null default '',
  postal_code     text,
  region          text,
  created_by      uuid references public.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index on public.customers (partner_id);
create index on public.customers (phone);
create trigger trg_customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 주문번호 생성 : JJ-YYMMDD-0001 (KST, 일자별 순번, 동시성 안전)
-- ---------------------------------------------------------------------
create table public.order_counters (
  day   date primary key,
  last  integer not null
);

create or replace function public.next_order_no() returns text
language plpgsql security definer set search_path = public as $$
declare
  d date := public.kst_today();
  n integer;
begin
  insert into public.order_counters (day, last) values (d, 1)
  on conflict (day) do update set last = public.order_counters.last + 1
  returning last into n;
  return 'JJ-' || to_char(d, 'YYMMDD') || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- orders : 발주 (금액은 저장 시점 정책 스냅샷으로 고정)
-- ---------------------------------------------------------------------
create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  order_no              text not null unique,   -- 트리거에서 자동 생성
  partner_id            uuid not null references public.partners (id),
  customer_id           uuid not null references public.customers (id),
  created_by            uuid references public.users (id),
  status                public.order_status not null default 'draft',
  region                text,

  -- 일정
  order_date            date not null default public.kst_today(),
  desired_ship_date     date,
  desired_install_date  date,
  desired_install_time  text,
  request_note          text not null default '',

  -- 가격 정책 스냅샷
  price_policy_id       uuid references public.price_policies (id),
  unit_price            integer not null check (unit_price >= 0),          -- 고객 판매 단가 (원/㎡)
  unit_price_partner    integer not null check (unit_price_partner >= 0),  -- 파트너 공급 단가 (원/㎡)
  min_area_m2           numeric(6,2) not null,
  vat_rate_bp           integer not null,
  vat_mode              public.vat_mode not null,
  settle_install_share  numeric(5,2) not null default 100,
  settle_travel_share   numeric(5,2) not null default 100,

  -- 입력값
  discount_rate         numeric(5,2) not null default 0 check (discount_rate between 0 and 100),
  install_fee           integer not null default 0 check (install_fee >= 0),
  travel_fee            integer not null default 0 check (travel_fee >= 0),

  -- 계산값 (트리거가 서버에서 다시 계산)
  item_count            integer not null default 0,
  total_actual_area     numeric(12,6) not null default 0,
  total_applied_area    numeric(12,6) not null default 0,
  product_amount        integer not null default 0,   -- 할인 전 제품 금액
  discount_amount       integer not null default 0,
  product_net_amount    integer not null default 0,   -- 할인 후 제품 금액
  supply_amount         integer not null default 0,   -- 파트너 공급가 합계
  subtotal_amount       integer not null default 0,   -- 제품(할인후)+시공비+출장비
  supply_value          integer not null default 0,   -- 공급가액(부가세 제외)
  vat_amount            integer not null default 0,
  total_amount          integer not null default 0,   -- 최종 합계(부가세 포함)

  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  deleted_by            uuid references public.users (id)
);
create index on public.orders (partner_id, created_at desc);
create index on public.orders (status);
create index on public.orders (order_date);
create index on public.orders (customer_id);
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- order_items : 창문(설치 공간)별 품목  (orders 1 : N order_items)
-- ---------------------------------------------------------------------
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  sort_order    integer not null default 0,
  space_name    text not null check (length(trim(space_name)) > 0),
  width_mm      integer not null check (width_mm between 1 and 20000),
  height_mm     integer not null check (height_mm between 1 and 20000),
  frame_color   public.color_option not null default 'white',
  fabric_color  public.color_option not null default 'white',
  note          text not null default '',
  -- 계산값
  actual_area   numeric(12,6) not null default 0,
  applied_area  numeric(12,6) not null default 0,
  line_amount   integer not null default 0,
  line_supply   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index on public.order_items (order_id, sort_order);

-- ---------------------------------------------------------------------
-- order_status_history : 상태 변경 이력
-- ---------------------------------------------------------------------
create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references public.users (id),
  changed_at   timestamptz not null default now(),
  note         text
);
create index on public.order_status_history (order_id, changed_at);

-- ---------------------------------------------------------------------
-- shipments / installations : 배송 · 시공 (발주당 1건)
-- ---------------------------------------------------------------------
create table public.shipments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders (id) on delete cascade,
  carrier          text,
  tracking_no      text,
  shipped_at       date,
  delivery_status  public.delivery_status not null default 'ready',
  note             text not null default '',
  updated_by       uuid references public.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

create table public.installations (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders (id) on delete cascade,
  scheduled_date   date,
  scheduled_time   text,
  completed_date   date,
  note             text not null default '',   -- 특이사항
  updated_by       uuid references public.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_installations_touch before update on public.installations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- settlements : 발주별 정산
-- ---------------------------------------------------------------------
create table public.settlements (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null unique references public.orders (id) on delete cascade,
  partner_id             uuid not null references public.partners (id),
  product_sales_amount   integer not null default 0,  -- 제품 판매 금액(할인 후)
  product_supply_amount  integer not null default 0,  -- 제품 공급 금액
  discount_amount        integer not null default 0,
  install_fee            integer not null default 0,
  travel_fee             integer not null default 0,
  payable_amount         integer not null default 0,  -- 파트너 정산 예정 금액
  paid_amount            integer not null default 0,  -- 파트너 정산 완료 금액
  status                 public.settlement_status not null default 'pending',
  paid_at                date,
  note                   text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.settlements (partner_id);
create trigger trg_settlements_touch before update on public.settlements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- attachments : 현장/시공 사진 (Supabase Storage 경로)
-- ---------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  kind          public.attachment_kind not null default 'site_photo',
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    integer,
  uploaded_by   uuid references public.users (id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on public.attachments (order_id);

-- ---------------------------------------------------------------------
-- audit_logs : 감사 로그 (개인정보 접근/변경 추적)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,          -- INSERT / UPDATE / DELETE / SOFT_DELETE ...
  table_name  text not null,
  record_id   uuid,
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (table_name, record_id);
