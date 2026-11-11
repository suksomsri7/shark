"use client";

// use-qr.ts — hook ของหน้าสาธารณะ QR (POS P2.7U): quote ตะกร้าแบบหน่วง · โพลแบบ sinceVer ที่หยุดเมื่อแท็บไม่อยู่หน้าจอ · นาฬิกาหลัง mount
//   โพล = อ่านอย่างเดียวของเซิร์ฟเวอร์ (tablePoll / orderStatus · 0 เขียน มติ 11) · แท็บซ่อน = ไม่ยิง · กลับมาที่แท็บ = ยิงทันที
//   🔴 ไม่มีข้อความไทย (ST7)

import { useCallback, useEffect, useRef, useState } from "react";
import type { QrQuoteResult } from "@/lib/modules/pos/qr-order-shared";
import { cartLines, type QrCartItem } from "./qr-ui";
import { clockNow, type FloorClock } from "@/components/pos/tables/table-ui"; // POS P2.7U fix2 ▸ G1 ◂

type QuoteOk = Extract<QrQuoteResult, { ok: true }>;
type QuoteBad = Extract<QrQuoteResult, { ok: false }>;

/** quote ของตะกร้า (หน่วง 250 มิลลิวิ · ผลเก่ากว่าคำขอล่าสุดทิ้ง) */
export function useQrQuote(cart: readonly QrCartItem[], fetcher: (lines: unknown) => Promise<QrQuoteResult>) {
  const [quote, setQuote] = useState<QuoteOk | null>(null);
  const [refusal, setRefusal] = useState<QuoteBad | null>(null);
  const [quoting, setQuoting] = useState(false);
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const sig = JSON.stringify(cartLines(cart));
  useEffect(() => {
    const my = ++seq.current;
    if (!cart.length) {
      setQuote(null);
      setRefusal(null);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const h = setTimeout(() => {
      fetchRef
        .current(JSON.parse(sig))
        .then((r) => {
          if (my !== seq.current) return;
          if (r.ok) {
            setQuote(r);
            setRefusal(null);
          } else {
            setQuote(null);
            setRefusal(r);
          }
        })
        .catch(() => {
          if (my === seq.current) setRefusal({ ok: false, code: "INTERNAL", messageKey: "qr.errors.internal" });
        })
        .finally(() => {
          if (my === seq.current) setQuoting(false);
        });
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig = ลายนิ้วมือของตะกร้า
  }, [sig]);
  return { quote, refusal, quoting };
}

/** โพลทุก intervalMs ขณะแท็บอยู่หน้าจอ (Page Visibility) · enabled=false = หยุด · run() คืน Promise ให้ผู้เรียกยิงเองได้ */
export function useVisiblePoll(run: () => Promise<void>, intervalMs: number, enabled: boolean) {
  const ref = useRef(run);
  ref.current = run;
  const busy = useRef(false);
  const fire = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await ref.current();
    } catch {
      /* โพลพลาดรอบนี้ = รอรอบหน้า */
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void fire();
    }, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void fire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, fire]);
  return fire;
}

/** เวลาเครื่องหลัง mount (null ก่อน mount — HF-418) เดินทุก tickMs */
export function useNow(tickMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

/** ข้อความลอยสั้น ๆ (4 วิ) */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone?: "danger" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, tone?: "danger") => {
    setToast({ text, ...(tone ? { tone } : {}) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  return { toast, show };
}

// POS P2.7U fix1 ▸ F3: นาฬิกาของหน้า = เวลาเซิร์ฟเวอร์ตอนตอบ + เวลาที่ผ่านไปบนเครื่อง (clockNow ของจอ 09) — ไม่เชื่อนาฬิกาเครื่องลูกค้า ◂
// POS P2.7U fix2 ▸ G1: เวลาที่ผ่านไป = Date.now() (นาฬิกาผนัง · ค่าคลาดคงที่ของเครื่องหักกันในผลต่าง · เดินต่อระหว่างเครื่องพักหน้าจอ — performance.now() หยุดบน iOS Safari/macOS)
//   ตัวเดียวกับ clockNow ของ tables/table-ui · ตั้งหลักใหม่ทุกคำตอบที่มี serverNow ◂
/** เวลาเซิร์ฟเวอร์โดยประมาณ (ms) หลัง mount · null ก่อน mount · serverIso ใหม่ = ตั้งหลักใหม่ */
export function useServerNow(serverIso: string | null | undefined, tickMs = 1000): number | null {
  const anchor = useRef<FloorClock | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const ms = serverIso ? Date.parse(serverIso) : NaN;
    anchor.current = Number.isFinite(ms) ? { serverMs: ms, localMs: Date.now() } : null;
    const read = () => clockNow(anchor.current, Date.now());
    setNow(read());
    const id = setInterval(() => setNow(read()), tickMs);
    return () => clearInterval(id);
  }, [serverIso, tickMs]);
  return now;
}
