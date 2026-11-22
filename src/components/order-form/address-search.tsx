"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface DaumPostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
  apartment: "Y" | "N";
  sido: string;
  userSelectedType: "R" | "J";
}
declare global {
  interface Window {
    daum?: { Postcode: new (opts: { oncomplete: (d: DaumPostcodeData) => void; width?: string; height?: string }) => { embed: (el: HTMLElement) => void } };
  }
}

const SIDO_MAP: [RegExp, string][] = [
  [/^서울/, "서울"], [/^경기/, "경기"], [/^인천/, "인천"], [/^강원/, "강원"], [/^충(청)?북/, "충북"], [/^충(청)?남/, "충남"],
  [/^대전/, "대전"], [/^세종/, "세종"], [/^전(라)?북|^전북/, "전북"], [/^전(라)?남/, "전남"], [/^광주/, "광주"], [/^경(상)?북/, "경북"],
  [/^경(상)?남/, "경남"], [/^대구/, "대구"], [/^울산/, "울산"], [/^부산/, "부산"], [/^제주/, "제주"],
];
export const sidoToRegion = (sido: string) => SIDO_MAP.find(([re]) => re.test(sido))?.[1] ?? sido;

function loadScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("주소 검색을 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
}

/** 카카오(다음) 우편번호 서비스 — 별도 API 키 불필요 */
export function AddressSearch({ onSelect }: { onSelect: (v: { address: string; postalCode: string; region: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.daum) return;
        new window.daum.Postcode({
          width: "100%",
          height: "100%",
          oncomplete: (d) => {
            const base = d.userSelectedType === "R" ? d.roadAddress : d.jibunAddress;
            const extra = d.userSelectedType === "R" && d.buildingName && d.apartment === "Y" ? ` (${d.buildingName})` : "";
            onSelect({ address: base + extra, postalCode: d.zonecode, region: sidoToRegion(d.sido) });
            setOpen(false);
          },
        }).embed(boxRef.current);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, onSelect]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="shrink-0">
        <Search />주소 검색
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[600px] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b px-4">
              <p className="font-bold">주소 검색</p>
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-lg hover:bg-neutral-100" aria-label="닫기"><X className="size-5" /></button>
            </div>
            {error ? <p className="p-6 text-sm text-red-600">{error} 주소를 직접 입력해 주세요.</p> : <div ref={boxRef} className="flex-1" />}
          </div>
        </div>
      )}
    </>
  );
}
