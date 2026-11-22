"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Camera, Copy, ImagePlus, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { checkDuplicate, saveOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AddressSearch } from "@/components/order-form/address-search";
import { DimensionInput, type SizeUnit } from "@/components/order-form/dimension-input";
import { COLOR_LABEL, INSTALL_TIME_PRESETS, REGIONS, SPACE_PRESETS } from "@/lib/constants";
import { formatDate, formatPhone, isValidPhone, kstToday } from "@/lib/format";
import { firstError, submittedOrderSchema, type OrderFormInput } from "@/lib/order-schema";
import { calculateOrder, formatArea, formatKRW, type VatMode } from "@/lib/pricing";
import type { ColorOption, Partner } from "@/lib/types";
import { MAX_FILE_BYTES, uploadOrderFiles } from "@/lib/upload";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ types
export interface FormPolicy {
  unitPrice: number;
  unitPricePartner: number;
  minAreaM2: number;
  vatRateBp: number;
  discountPresets: number[];
  maxDiscountRate: number;
  defaultInstallFee: number;
  defaultTravelFee: number;
  defaultVatMode: VatMode;
}

interface ItemState {
  key: string;
  space_name: string;
  width_mm: number | "";
  height_mm: number | "";
  frame_color: ColorOption;
  fabric_color: ColorOption;
  note: string;
}

interface FormState {
  partner_id: string;
  customer: { name: string; phone: string; address: string; address_detail: string; postal_code: string; region: string };
  order_date: string;
  desired_ship_date: string;
  desired_install_date: string;
  desired_install_time: string;
  request_note: string;
  items: ItemState[];
  discount_rate: string;
  install_fee: number | "";
  travel_fee: number | "";
  vat_mode: VatMode;
  unit_price: number;
}

export interface OrderFormProps {
  isAdmin: boolean;
  partners: Partner[];
  defaultPartnerId?: string;
  policy: FormPolicy;
  /** 수정 모드일 때 기존 발주 */
  initial?: { id: string; order_no: string; status: string; values: OrderFormInput };
}

const newKey = () => Math.random().toString(36).slice(2, 10);
const newItem = (prev?: ItemState): ItemState => ({
  key: newKey(),
  space_name: "",
  width_mm: "",
  height_mm: "",
  frame_color: prev?.frame_color ?? "white",
  fabric_color: prev?.fabric_color ?? "white",
  note: "",
});

function initialState(p: OrderFormProps): FormState {
  const v = p.initial?.values;
  if (v) {
    return {
      partner_id: v.partner_id ?? "",
      customer: {
        name: v.customer.name ?? "",
        phone: v.customer.phone ?? "",
        address: v.customer.address ?? "",
        address_detail: v.customer.address_detail ?? "",
        postal_code: v.customer.postal_code ?? "",
        region: v.customer.region ?? "",
      },
      order_date: v.order_date || kstToday(),
      desired_ship_date: v.desired_ship_date ?? "",
      desired_install_date: v.desired_install_date ?? "",
      desired_install_time: v.desired_install_time ?? "",
      request_note: v.request_note ?? "",
      items: v.items.map((i) => ({
        key: newKey(),
        space_name: i.space_name ?? "",
        width_mm: Number(i.width_mm),
        height_mm: Number(i.height_mm),
        frame_color: i.frame_color,
        fabric_color: i.fabric_color,
        note: i.note ?? "",
      })),
      discount_rate: String(v.discount_rate ?? 0),
      install_fee: Number(v.install_fee ?? 0),
      travel_fee: Number(v.travel_fee ?? 0),
      vat_mode: v.vat_mode,
      unit_price: Number(v.unit_price ?? p.policy.unitPrice),
    };
  }
  return {
    partner_id: p.defaultPartnerId ?? "",
    customer: { name: "", phone: "", address: "", address_detail: "", postal_code: "", region: "" },
    order_date: kstToday(),
    desired_ship_date: "",
    desired_install_date: "",
    desired_install_time: "",
    request_note: "",
    items: [newItem()],
    discount_rate: "0",
    install_fee: p.policy.defaultInstallFee,
    travel_fee: p.policy.defaultTravelFee,
    vat_mode: p.policy.defaultVatMode,
    unit_price: p.policy.unitPrice,
  };
}

// ================================================================== form
export function OrderForm(props: OrderFormProps) {
  const { isAdmin, partners, policy, initial } = props;
  const router = useRouter();
  const storageKey = `jjoff:order-form:${initial?.id ?? "new"}`;

  const [state, setState] = useState<FormState>(() => initialState(props));
  const [unit, setUnit] = useState<SizeUnit>("mm");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState<null | "draft" | "submitted">(null);
  const [restore, setRestore] = useState<{ state: FormState; savedAt: number } | null>(null);
  const [dup, setDup] = useState<{ total_count: number; mine_count: number; last_order_date: string | null } | null>(null);
  const dirty = useRef(false);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    dirty.current = true;
    setState((s) => ({ ...s, [k]: v }));
  }, []);
  const setCustomer = (patch: Partial<FormState["customer"]>) => {
    dirty.current = true;
    setState((s) => ({ ...s, customer: { ...s.customer, ...patch } }));
  };
  const setItem = (key: string, patch: Partial<ItemState>) => {
    dirty.current = true;
    setState((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  };

  const onAddress = useCallback((a: { address: string; postalCode: string; region: string }) => {
    dirty.current = true;
    setState((s) => ({ ...s, customer: { ...s.customer, address: a.address, postal_code: a.postalCode, region: a.region || s.customer.region } }));
    setTimeout(() => document.getElementById("addr2")?.focus(), 50);
  }, []);

  // ---------------------------------------------------------- 자동 임시저장 (기기 내)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { state: FormState; savedAt: number };
        if (saved?.state && JSON.stringify(saved.state) !== JSON.stringify(state)) setRestore(saved);
      }
    } catch {
      /* 저장소 사용 불가 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ state, savedAt: Date.now() }));
      } catch {
        /* noop */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [state, storageKey]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // ---------------------------------------------------------- 실시간 계산
  const discountRate = Number(state.discount_rate) || 0;
  const calc = useMemo(() => {
    const complete = state.items.map((i) => i.width_mm !== "" && i.height_mm !== "" && i.width_mm > 0 && i.height_mm > 0);
    const result = calculateOrder(
      {
        items: state.items.filter((_, idx) => complete[idx]).map((i) => ({ widthMm: Number(i.width_mm), heightMm: Number(i.height_mm) })),
        discountRate,
        installFee: Number(state.install_fee) || 0,
        travelFee: Number(state.travel_fee) || 0,
        vatMode: state.vat_mode,
      },
      { ...policy, unitPrice: state.unit_price },
    );
    // 품목별 결과를 원래 인덱스에 매핑
    let j = 0;
    const perItem = complete.map((c) => (c ? result.lines[j++] : null));
    return { ...result, perItem };
  }, [state.items, state.install_fee, state.travel_fee, state.vat_mode, state.unit_price, discountRate, policy]);

  // ---------------------------------------------------------- 중복 발주 확인
  async function onPhoneBlur() {
    if (!isValidPhone(state.customer.phone)) return setDup(null);
    setDup(await checkDuplicate(state.customer.phone, initial?.id));
  }

  // ---------------------------------------------------------- 저장
  async function onSave(status: "draft" | "submitted") {
    const payload: OrderFormInput = {
      id: initial?.id ?? "",
      status,
      partner_id: state.partner_id,
      customer: state.customer,
      order_date: state.order_date,
      desired_ship_date: state.desired_ship_date,
      desired_install_date: state.desired_install_date,
      desired_install_time: state.desired_install_time,
      request_note: state.request_note,
      items: state.items.map((i, idx) => ({
        space_name: i.space_name.trim() || `창문 ${idx + 1}`,
        width_mm: i.width_mm === "" ? 0 : i.width_mm,
        height_mm: i.height_mm === "" ? 0 : i.height_mm,
        frame_color: i.frame_color,
        fabric_color: i.fabric_color,
        note: i.note,
      })),
      discount_rate: discountRate,
      install_fee: Number(state.install_fee) || 0,
      travel_fee: Number(state.travel_fee) || 0,
      vat_mode: state.vat_mode,
      unit_price: isAdmin ? state.unit_price : undefined,
    };
    // 임시저장은 빈 창문 행을 제외
    if (status === "draft") payload.items = payload.items.filter((i) => Number(i.width_mm) > 0 && Number(i.height_mm) > 0);

    const check = submittedOrderSchema.safeParse(payload);
    if (!check.success) return toast.error(firstError(check.error));
    if (isAdmin && !initial && !state.partner_id) return toast.error("담당 파트너를 선택해 주세요.");
    if (!isAdmin && discountRate > policy.maxDiscountRate) return toast.error(`할인율은 최대 ${policy.maxDiscountRate}%까지 가능합니다.`);
    if (status === "submitted" && dup && !initial && !confirm(`최근 90일 내 같은 연락처로 ${dup.total_count}건의 발주가 있습니다.\n그래도 접수할까요?`)) return;

    setSaving(status);
    const res = await saveOrder(payload);
    if (!res.ok) {
      setSaving(null);
      return toast.error(res.error);
    }
    if (files.length) {
      const failed = await uploadOrderFiles(res.id, files);
      if (failed.length) toast.warning(`사진 ${failed.length}개 업로드 실패: ${failed.join(", ")}`);
    }
    dirty.current = false;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
    toast.success(status === "draft" ? `임시저장 완료 (${res.order_no})` : `발주 접수 완료 (${res.order_no})`);
    router.push(`/orders/${res.id}`);
    router.refresh();
  }

  const isEditingSubmitted = initial && initial.status !== "draft";
  const busy = saving !== null;

  // ================================================================ render
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="space-y-4">
        {restore && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <RotateCcw className="size-5 text-amber-700" />
            <p className="flex-1 text-amber-900">
              {new Date(restore.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}에 자동 저장된 작성 내용이 있습니다.
            </p>
            <Button size="sm" onClick={() => { setState(restore.state); dirty.current = true; setRestore(null); }}>불러오기</Button>
            <Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem(storageKey); setRestore(null); }}>삭제</Button>
          </div>
        )}

        {/* ------------------------------------------------ 고객 정보 */}
        <Card>
          <CardHeader><CardTitle>고객 정보</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {isAdmin && (
              <div className="sm:col-span-2">
                <Label htmlFor="partner" required>담당 파트너</Label>
                <NativeSelect
                  id="partner"
                  value={state.partner_id}
                  disabled={!!initial}
                  onChange={(e) => {
                    const p = partners.find((x) => x.id === e.target.value);
                    set("partner_id", e.target.value);
                    if (p && !state.customer.region) setCustomer({ region: p.region });
                  }}
                >
                  <option value="">파트너 선택</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.company_name ? `${p.company_name} (${p.name})` : p.name} · {p.region}</option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div>
              <Label htmlFor="cname" required>고객 성함</Label>
              <Input id="cname" autoComplete="off" value={state.customer.name} onChange={(e) => setCustomer({ name: e.target.value })} placeholder="홍길동" />
            </div>
            <div>
              <Label htmlFor="cphone" required>연락처</Label>
              <Input
                id="cphone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={state.customer.phone}
                onChange={(e) => setCustomer({ phone: formatPhone(e.target.value) })}
                onBlur={onPhoneBlur}
                placeholder="010-0000-0000"
              />
            </div>
            {dup && (
              <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  중복 발주 확인: 최근 90일 내 같은 연락처로 <b>{dup.total_count}건</b>
                  {dup.mine_count > 0 && ` (내 발주 ${dup.mine_count}건)`}의 발주가 있습니다. 최근 발주일 {formatDate(dup.last_order_date)}
                </span>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="addr" required>시공 주소</Label>
              <div className="flex gap-2">
                <Input id="addr" value={state.customer.address} onChange={(e) => setCustomer({ address: e.target.value })} placeholder="도로명 주소" />
                <AddressSearch onSelect={onAddress} />
              </div>
            </div>
            <div>
              <Label htmlFor="addr2">상세 주소</Label>
              <Input id="addr2" value={state.customer.address_detail} onChange={(e) => setCustomer({ address_detail: e.target.value })} placeholder="동 · 호수" />
            </div>
            <div>
              <Label htmlFor="region">지역</Label>
              <NativeSelect id="region" value={state.customer.region} onChange={(e) => setCustomer({ region: e.target.value })}>
                <option value="">지역 선택</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ 제품 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>제품 정보 <span className="ml-1 text-sm font-medium text-neutral-400">{state.items.length}개 창문</span></CardTitle>
            <Segmented value={unit} onChange={setUnit} options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }]} />
          </CardHeader>
          <CardContent className="space-y-3">
            {state.items.map((item, idx) => {
              const line = calc.perItem[idx];
              return (
                <div key={item.key} className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-950 text-sm font-bold text-white">{idx + 1}</span>
                    <Input
                      aria-label="설치 공간 이름"
                      value={item.space_name}
                      onChange={(e) => setItem(item.key, { space_name: e.target.value })}
                      placeholder="설치 공간 (예: 안방)"
                      className="h-11 font-semibold"
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label="창문 복제"
                      onClick={() => { dirty.current = true; setState((s) => { const items = [...s.items]; items.splice(idx + 1, 0, { ...item, key: newKey(), space_name: "" }); return { ...s, items }; }); }}>
                      <Copy />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="창문 삭제" disabled={state.items.length <= 1}
                      onClick={() => { dirty.current = true; setState((s) => ({ ...s, items: s.items.filter((i) => i.key !== item.key) })); }}>
                      <Trash2 className="text-red-500" />
                    </Button>
                  </div>
                  <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {SPACE_PRESETS.map((sp) => (
                      <button key={sp} type="button" onClick={() => setItem(item.key, { space_name: sp })}
                        className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px]", item.space_name === sp ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-600")}>
                        {sp}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>가로</Label>
                      <DimensionInput value={item.width_mm} unit={unit} onChange={(v) => setItem(item.key, { width_mm: v })} placeholder={unit === "mm" ? "1800" : "180"} />
                    </div>
                    <div>
                      <Label>세로</Label>
                      <DimensionInput value={item.height_mm} unit={unit} onChange={(v) => setItem(item.key, { height_mm: v })} placeholder={unit === "mm" ? "1500" : "150"} />
                    </div>
                    <div>
                      <Label>프레임</Label>
                      <ColorPicker value={item.frame_color} onChange={(c) => setItem(item.key, { frame_color: c })} />
                    </div>
                    <div>
                      <Label>원단</Label>
                      <ColorPicker value={item.fabric_color} onChange={(c) => setItem(item.key, { fabric_color: c })} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-dashed border-neutral-200 pt-3 text-sm">
                    {line ? (
                      <>
                        <div className="text-neutral-500">
                          실제 {formatArea(line.actualAreaM2)}
                          {line.minApplied ? (
                            <span className="ml-1.5 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">최소 {formatArea(line.appliedAreaM2)} 적용</span>
                          ) : (
                            <> · 적용 {formatArea(line.appliedAreaM2)}</>
                          )}
                        </div>
                        <div className="text-base font-bold tabular-nums">{formatKRW(line.lineAmount)}</div>
                      </>
                    ) : (
                      <span className="text-neutral-400">가로·세로를 입력하면 금액이 계산됩니다.</span>
                    )}
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => set("items", [...state.items, newItem(state.items.at(-1))])}>
              <Plus />창문 추가
            </Button>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ 일정 정보 */}
        <Card>
          <CardHeader><CardTitle>일정 정보</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="od">발주일</Label>
              <Input id="od" type="date" value={state.order_date} onChange={(e) => set("order_date", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sd">희망 발송일</Label>
              <Input id="sd" type="date" min={state.order_date} value={state.desired_ship_date} onChange={(e) => set("desired_ship_date", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="idt">희망 시공일</Label>
              <Input id="idt" type="date" min={state.desired_ship_date || state.order_date} value={state.desired_install_date} onChange={(e) => set("desired_install_date", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="itm">희망 시공 시간</Label>
              <Input id="itm" list="install-times" value={state.desired_install_time} onChange={(e) => set("desired_install_time", e.target.value)} placeholder="예: 오전 10시" />
              <datalist id="install-times">{INSTALL_TIME_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="note">요청 사항</Label>
              <Textarea id="note" value={state.request_note} onChange={(e) => set("request_note", e.target.value)} placeholder="현장 특이사항, 주차, 엘리베이터 여부 등" />
            </div>
            <div className="sm:col-span-2">
              <Label>현장 사진 첨부</Label>
              <PhotoPicker files={files} onChange={setFiles} />
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ 금액 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>금액 정보</CardTitle>
            <Segmented value={state.vat_mode} onChange={(v) => set("vat_mode", v)} options={[{ value: "excluded", label: "부가세 별도" }, { value: "included", label: "부가세 포함" }]} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="up">제품 단가 (원/㎡)</Label>
                {isAdmin ? (
                  <MoneyInput id="up" value={state.unit_price} onChange={(v) => set("unit_price", v === "" ? 0 : v)} />
                ) : (
                  <div className="flex h-12 items-center rounded-xl bg-neutral-100 px-4 font-semibold tabular-nums">{formatKRW(state.unit_price)}</div>
                )}
                <p className="mt-1 text-xs text-neutral-500">창문당 최소 {policy.minAreaM2}㎡ 적용</p>
              </div>
              <div>
                <Label>할인율 (%)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {policy.discountPresets.map((d) => (
                    <button key={d} type="button" onClick={() => set("discount_rate", String(d))}
                      className={cn("h-12 min-w-12 rounded-xl border px-3 text-sm font-semibold", discountRate === d ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-white")}>
                      {d}%
                    </button>
                  ))}
                  <Input aria-label="할인율 직접 입력" inputMode="decimal" className="h-12 w-20 text-right" value={state.discount_rate}
                    onChange={(e) => set("discount_rate", e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} />
                </div>
              </div>
              <div>
                <Label htmlFor="if">시공비</Label>
                <MoneyInput id="if" value={state.install_fee} onChange={(v) => set("install_fee", v)} />
              </div>
              <div>
                <Label htmlFor="tf">출장비</Label>
                <MoneyInput id="tf" value={state.travel_fee} onChange={(v) => set("travel_fee", v)} />
              </div>
            </div>

            <dl className="space-y-2 rounded-2xl bg-neutral-50 p-4 text-[15px]">
              <Row label="총 면적" value={`실제 ${formatArea(calc.totalActualAreaM2)} / 적용 ${formatArea(calc.totalAppliedAreaM2)}`} />
              <Row label="제품 금액" value={formatKRW(calc.productAmount)} />
              <Row label={`할인 (${discountRate}%)`} value={calc.discountAmount ? `−${formatKRW(calc.discountAmount)}` : "0원"} className="text-red-600" />
              <Row label="시공비" value={formatKRW(Number(state.install_fee) || 0)} />
              <Row label="출장비" value={formatKRW(Number(state.travel_fee) || 0)} />
              <div className="border-t border-neutral-200 pt-2" />
              <Row label="공급가액" value={formatKRW(calc.supplyValue)} />
              <Row label={state.vat_mode === "excluded" ? "부가세 (별도 10%)" : "부가세 (포함분)"} value={formatKRW(calc.vatAmount)} />
              <div className="flex items-baseline justify-between border-t border-neutral-900 pt-3">
                <dt className="font-bold">최종 합계 <span className="text-xs font-medium text-neutral-500">부가세 포함</span></dt>
                <dd className="text-2xl font-extrabold tabular-nums">{formatKRW(calc.totalAmount)}</dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-500">
              할인은 제품 금액에만 적용되며 시공비·출장비에는 적용되지 않습니다.
              {state.vat_mode === "included" ? " 입력 금액에 부가세가 포함되어 있어 추가로 부과하지 않습니다." : " 부가세 10%가 별도로 추가됩니다."}
              {` 파트너 공급가 합계: ${formatKRW(calc.supplyAmount)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------ PC 요약 + 저장 */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-3">
          <Card>
            <CardContent className="space-y-3 pt-5">
              {initial && <p className="text-sm text-neutral-500">발주번호 <b className="text-neutral-900">{initial.order_no}</b></p>}
              <p className="text-sm text-neutral-500">창문 {calc.itemCount}개 · 적용 {formatArea(calc.totalAppliedAreaM2)}</p>
              <p className="text-sm text-neutral-500">최종 합계</p>
              <p className="-mt-2 text-3xl font-extrabold tabular-nums">{formatKRW(calc.totalAmount)}</p>
              <SaveButtons onSave={onSave} saving={saving} busy={busy} hideDraft={!!isEditingSubmitted} />
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-neutral-400">작성 중인 내용은 이 기기에 자동 저장됩니다.</p>
        </div>
      </aside>

      {/* ------------------------------------------------ 모바일 하단 고정 바 */}
      <div className="h-24 lg:hidden" />
      <div className="no-print fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-neutral-500">최종 합계 (VAT 포함)</p>
            <p className="truncate text-lg font-extrabold tabular-nums">{formatKRW(calc.totalAmount)}</p>
          </div>
          <SaveButtons onSave={onSave} saving={saving} busy={busy} hideDraft={!!isEditingSubmitted} compact />
        </div>
      </div>
    </div>
  );
}

// ================================================================== parts
function SaveButtons({ onSave, saving, busy, hideDraft, compact }: { onSave: (s: "draft" | "submitted") => void; saving: string | null; busy: boolean; hideDraft: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex gap-2", !compact && "flex-col")}>
      {!hideDraft && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => onSave("draft")} className={cn(!compact && "w-full")}>
          {saving === "draft" && <Loader2 className="animate-spin" />}임시저장
        </Button>
      )}
      <Button type="button" disabled={busy} onClick={() => onSave("submitted")} className={cn(!compact && "w-full")} size={compact ? "default" : "lg"}>
        {saving === "submitted" && <Loader2 className="animate-spin" />}
        {hideDraft ? "수정 저장" : "발주 접수"}
      </Button>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={cn("text-right font-semibold tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-neutral-100 p-1" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-lg px-3 text-sm font-semibold text-neutral-500", value === o.value && "bg-white text-neutral-950 shadow-sm")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: ColorOption; onChange: (c: ColorOption) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
      {(["white", "black"] as const).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)}
          className={cn("flex h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-1 text-sm font-semibold", value === c ? "border-neutral-950 ring-1 ring-neutral-950" : "border-neutral-300 text-neutral-500")}>
          <span className={cn("size-3.5 shrink-0 rounded-full border", c === "white" ? "border-neutral-300 bg-white" : "border-neutral-950 bg-neutral-950")} />
          {COLOR_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function MoneyInput({ value, onChange, ...rest }: { value: number | ""; onChange: (v: number | "") => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="relative">
      <Input {...rest} inputMode="numeric" className="pr-10 text-right font-semibold tabular-nums"
        value={value === "" ? "" : value.toLocaleString("ko-KR")}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, 9);
          onChange(d === "" ? "" : Number(d));
        }} />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">원</span>
    </div>
  );
}

function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).filter((f) => {
      if (f.size > MAX_FILE_BYTES) toast.error(`${f.name}: 10MB 이하만 첨부할 수 있습니다.`);
      return f.size <= MAX_FILE_BYTES;
    });
    onChange([...files, ...next].slice(0, 20));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={i} className="relative size-20 overflow-hidden rounded-xl border bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.type.startsWith("image/") ? <img src={urls[i]} alt={f.name} className="size-full object-cover" /> : <span className="p-1 text-[10px]">{f.name}</span>}
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white" aria-label="삭제">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500 hover:bg-neutral-50">
          <Camera className="size-5" />촬영
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500 hover:bg-neutral-50">
          <ImagePlus className="size-5" />앨범
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">발주 저장 시 함께 업로드됩니다. (파일당 10MB 이하)</p>
    </div>
  );
}
