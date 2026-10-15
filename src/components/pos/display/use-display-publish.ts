"use client";

// use-display-publish.ts — หน้าขาย → จอลูกค้าที่จับคู่กับเครื่องนี้ (POS P2.10 · บรีฟ R5 · มติ 1 5 13)
//
// 🔴 import ค่าได้แค่ display-actions + display-shared (S5.17) — ชนิดของหน้าขายเป็น import type เท่านั้น
// 🔴 ประกอบ DisplayState จากของที่หน้าขายมีอยู่แล้ว (บรรทัดที่แสดง · quote ของเซิร์ฟเวอร์ · คูปอง · สมาชิก/สแตมป์จากกระเป๋า · ช่องจ่าย · บิลที่เสร็จ)
//    ไม่มีเบอร์/รหัสสมาชิก/นามสกุล/เลขบัตร/เลขมัดจำ/QR/ลิงก์ใบเสร็จ (เซิร์ฟเวอร์สร้างเอง · มติ 3 6)
// 🔴 ส่งเมื่อ "ภาพ" เปลี่ยน (คีย์ JSON คงที่) · หน่วง 300 มิลลิวิ · ไม่ถี่กว่า 1 ครั้ง/วิ · ตะกร้าที่ quote ยังไม่สด = ยังไม่ส่ง (ไม่ส่งทุกการกด) ·
//    paired:false = หยุดส่ง แล้วถามใหม่ทุก 5 นาที / เมื่อกลับมาที่แท็บนี้ (เช่น กลับจากหน้าตั้งค่าเครื่อง) ·
//    ภาพที่ไม่ใช่หน้าพักส่งซ้ำทุก 60 วิ (จอถือว่าหน้าขายหลุดเมื่อเงียบเกิน 120 วิ) · seq = เวลา (ข้ามการโหลดหน้าใหม่ได้)
// 🔴 ไม่เคยกระทบการขาย: ทุกการเรียกกลืนข้อผิดพลาด · ไม่มี await ในทางของการขาย

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publishDisplayStateAction } from "@/lib/modules/pos/display-actions";
import {
  DISPLAY_PUBLISH_DEBOUNCE_MS,
  DISPLAY_PUBLISH_KEEPALIVE_MS,
  DISPLAY_PUBLISH_MIN_GAP_MS,
  DISPLAY_UNPAIRED_RECHECK_MS,
  displaySeqNow,
  type DisplayLine,
  type DisplayPayIn,
  type DisplayState,
} from "@/lib/modules/pos/display-shared";
import type { RegisterMemberBenefits, RegisterMemberItem, RegisterQuoteTotals, RegisterSubmitOk } from "@/lib/modules/pos/register-shared";
import type { CartLineModel } from "@/components/pos/register/CartLine";

export type DisplayPublishInput = {
  systemId: string;
  unitId: string;
  /** รหัสเครื่องของเบราว์เซอร์นี้ (P1.9) — ยังไม่รู้ = ไม่ส่ง */
  deviceCode: string | undefined;
  lines: readonly CartLineModel[];
  /** quote ของเซิร์ฟเวอร์ที่ตรงรุ่นตะกร้า (null = ยังไม่สด) */
  quote: RegisterQuoteTotals | null;
  couponCode: string | null;
  /** สมาชิกที่ผูกกับบิลนี้ (null = ไม่มี) */
  member: RegisterMemberItem | null;
  benefits: RegisterMemberBenefits | null;
  /** ชั้นของหน้าขาย — ใช้ดูว่าจอชำระเปิดอยู่ / บิลเพิ่งเสร็จ */
  layers: readonly { kind: string; result?: RegisterSubmitOk }[];
};

/** ภาพบนจอจากสถานะหน้าขาย · null = ยังไม่ควรส่ง (ตะกร้ามีของแต่ quote ยังไม่สด) */
export function buildDisplayState(i: DisplayPublishInput, pay: DisplayPayIn | null): DisplayState | null {
  const done = i.layers.find((l) => l.kind === "done")?.result ?? null;
  const payOpen = i.layers.some((l) => l.kind === "pay");
  const member = i.member
    ? { firstName: i.member.name.trim().split(/\s+/)[0] ?? "", tier: i.member.tier?.name ?? null, points: i.member.points }
    : null;
  const q = i.quote;
  const lines: DisplayLine[] = i.lines.map((l) => {
    const d: DisplayLine = { qty: l.qty, name: l.name, grossSatang: l.grossSatang, discountSatang: l.discountSatang };
    if (l.detail) d.detail = l.detail;
    if (l.discountSatang > 0 && l.badge?.kind === "RULE") d.discountLabel = l.badge.text;
    return d;
  });
  const totals = q
    ? {
        subtotalSatang: q.subtotalSatang,
        lineDiscountSatang: q.lineDiscountSatang,
        billDiscountSatang: q.billDiscountSatang,
        coupon: i.couponCode && q.couponDiscountSatang > 0 ? { code: i.couponCode, satang: q.couponDiscountSatang } : null,
        member: (q.memberLines ?? []).filter((m) => m.discountSatang > 0).slice(0, 10).map((m) => ({ label: m.label, satang: m.discountSatang })),
        serviceChargeSatang: q.serviceChargeSatang,
        grandTotalSatang: q.grandTotalSatang,
      }
    : null;
  const card = member ? (i.benefits?.stamps?.[0] ?? null) : null;
  const stamp = card
    ? { name: card.name, stamps: card.stamps, slots: card.slots, toAdd: q?.stampsToAdd?.find((s) => s.cardId === card.cardId)?.count ?? 0 }
    : null;
  if (done) {
    return {
      phase: "done",
      member,
      ...(lines.length && totals ? { lines, totals } : {}),
      stamp,
      done: { receiptNo: done.receiptNo, saleId: done.saleId, changeSatang: done.changeSatang, ...(done.member ? { pointsEarned: done.member.pointsExpected } : {}) },
    };
  }
  if (!lines.length) return { phase: "idle" };
  if (!totals || lines.some((l) => !Number.isFinite(l.grossSatang))) return null;
  if (payOpen && pay) return { phase: "paying", member, lines, totals, stamp, pay };
  return { phase: "cart", member, lines, totals, stamp };
}

/**
 * ส่งภาพบิลของเครื่องนี้ให้จอลูกค้า — คืนตัวรับค่าช่องจ่าย (ส่งให้ PayDialog ทาง onDisplayPay · null = ปิดจอชำระ)
 */
export function useDisplayPublish(i: DisplayPublishInput): (v: DisplayPayIn | null) => void {
  const [pay, setPay] = useState<DisplayPayIn | null>(null);
  const onPay = useCallback((v: DisplayPayIn | null) => setPay((cur) => (JSON.stringify(cur) === JSON.stringify(v) ? cur : v)), []);
  const state = buildDisplayState(i, pay);
  const key = state ? JSON.stringify(state) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => state, [key]);

  const ref = useRef({
    sentKey: "",
    lastAt: 0,
    seq: 0,
    paired: "unknown" as "unknown" | "yes" | "no",
    recheckAt: 0,
    busy: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });
  const live = useRef({ state: stable, key, systemId: i.systemId, unitId: i.unitId, deviceCode: i.deviceCode });
  live.current = { state: stable, key, systemId: i.systemId, unitId: i.unitId, deviceCode: i.deviceCode };

  const send = useCallback(async (force: boolean) => {
    const r = ref.current;
    const cur = live.current;
    if (!cur.state || !cur.deviceCode || r.busy) return;
    const now = Date.now();
    if (r.paired === "no" && now < r.recheckAt) return;
    if (!force && cur.key === r.sentKey) return;
    r.busy = true;
    r.lastAt = now;
    r.seq = displaySeqNow(now, r.seq);
    try {
      const res = await publishDisplayStateAction({ systemId: cur.systemId, unitId: cur.unitId, deviceCode: cur.deviceCode, seq: r.seq, state: cur.state });
      if (res && res.ok) {
        if (res.paired === false) {
          r.paired = "no";
          r.recheckAt = Date.now() + DISPLAY_UNPAIRED_RECHECK_MS;
        } else r.paired = "yes";
        r.sentKey = cur.key;
      }
    } catch {
      /* จอลูกค้าไม่กระทบการขาย — ส่งใหม่รอบหน้า */
    } finally {
      r.busy = false;
    }
    // ภาพเปลี่ยนระหว่างรอคำตอบ = ส่งต่อ (ตามจังหวะ)
    if (live.current.key && live.current.key !== r.sentKey && r.paired !== "no") schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const schedule = useCallback(() => {
    const r = ref.current;
    if (r.timer) clearTimeout(r.timer);
    const wait = Math.max(DISPLAY_PUBLISH_DEBOUNCE_MS, r.lastAt + DISPLAY_PUBLISH_MIN_GAP_MS - Date.now());
    r.timer = setTimeout(() => {
      r.timer = undefined;
      void send(false);
    }, wait);
  }, [send]);

  // ภาพเปลี่ยน → ส่ง (หน่วง + เว้นจังหวะ)
  useEffect(() => {
    if (!key || !i.deviceCode) return;
    if (ref.current.paired === "no" && Date.now() < ref.current.recheckAt) return;
    if (key === ref.current.sentKey) return;
    schedule();
  }, [key, i.deviceCode, schedule]);

  // ส่งซ้ำ (ภาพที่ไม่ใช่หน้าพัก) ทุก 60 วิ · ถามใหม่เมื่อครบ 5 นาทีของ paired:false · กลับมาที่แท็บ = ถามใหม่
  useEffect(() => {
    const iv = setInterval(() => {
      const r = ref.current;
      const st = live.current.state;
      if (r.paired === "no") {
        if (Date.now() >= r.recheckAt) void send(true);
        return;
      }
      if (st && st.phase !== "idle" && Date.now() - r.lastAt >= DISPLAY_PUBLISH_KEEPALIVE_MS) void send(true);
    }, 15_000);
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const r = ref.current;
      if (r.paired === "no") {
        r.paired = "unknown";
        r.recheckAt = 0;
        void send(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      if (ref.current.timer) clearTimeout(ref.current.timer);
    };
  }, [send]);

  return onPay;
}
