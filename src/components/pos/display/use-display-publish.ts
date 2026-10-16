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
import type { RegisterMemberBenefits, RegisterMemberItem, RegisterMemberLine, RegisterQuoteTotals, RegisterSubmitOk } from "@/lib/modules/pos/register-shared"; // POS P2.10 ▸ fix1 F4: + RegisterMemberLine ◂
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

// POS P2.10 ▸ fix1 F2 (มติ fix1 ข้อ 2): บรีฟสมาชิกใช้รหัสสมาชิกแทนชื่อเมื่อไม่มีชื่อ (member/profile.ts) → ส่งชื่อว่าง (จอทักทายแบบไม่มีชื่อ)
function memberFirstName(m: RegisterMemberItem): string {
  const name = m.name.trim();
  if (!name || name === m.memberCode) return "";
  return name.split(/\s+/)[0] ?? "";
}
// ◂

// POS P2.10 ▸ fix1 F4 (มติ fix1 ข้อ 4): ส่ง kind ให้เซิร์ฟเวอร์เลือกป้าย (POINTS + showPoints=false / VOUCHER ไม่มีชื่อ / GIFTCARD = ป้ายกลาง) ·
//    VOUCHER ส่งป้ายเฉพาะชื่อจริงของใบในกระเป๋า (wallet ใช้โค้ด voucher เมื่อไม่มีชื่อ · ไม่มีชื่อ = ป้ายว่าง) · GIFTCARD ป้ายว่าง (ป้ายเดิมมีเลขบัตร)
function memberRow(m: RegisterMemberLine, benefits: RegisterMemberBenefits | null): { kind: RegisterMemberLine["kind"]; label: string; satang: number } {
  if (m.kind === "GIFTCARD") return { kind: m.kind, label: "", satang: m.discountSatang };
  if (m.kind === "VOUCHER") {
    const v = m.ref ? benefits?.vouchers.find((x) => x.id === m.ref) : undefined;
    const name = v?.name?.trim() ?? "";
    return { kind: m.kind, label: name && name !== v?.code ? name : "", satang: m.discountSatang };
  }
  return { kind: m.kind, label: m.label, satang: m.discountSatang };
}
// ◂

/** ภาพบนจอจากสถานะหน้าขาย · null = ยังไม่ควรส่ง (ตะกร้ามีของแต่ quote ยังไม่สด) */
export function buildDisplayState(i: DisplayPublishInput, pay: DisplayPayIn | null): DisplayState | null {
  const done = i.layers.find((l) => l.kind === "done")?.result ?? null;
  const payOpen = i.layers.some((l) => l.kind === "pay");
  const member = i.member
    ? { firstName: memberFirstName(i.member), tier: i.member.tier?.name ?? null, points: i.member.points } // POS P2.10 ▸ fix1 F2 ◂
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
        member: (q.memberLines ?? []).filter((m) => m.discountSatang > 0).slice(0, 10).map((m) => memberRow(m, i.benefits)), // POS P2.10 ▸ fix1 F4 ◂
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
    // POS P2.14 ▸ U3 H1b: ออฟไลน์ = ไม่ส่ง (ไม่ยิงคำขอที่รู้ว่าล้ม · จอลูกค้าแสดงภาพล่าสุดตามกติกาเดิมของเซิร์ฟเวอร์) — กลับมาออนไลน์ = ส่งทันทีหนึ่งครั้ง (ตัวฟัง online ด้านล่าง)
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    // ◂
    const now = Date.now();
    if (r.paired === "no" && now < r.recheckAt) return;
    if (!force && cur.key === r.sentKey) return;
    if (force && cur.state.phase === "done") return; // POS P2.10 ▸ fix1 F1: การส่งซ้ำ (keepalive/ถามใหม่หลัง paired:false/กลับมาที่แท็บ) ไม่ส่ง done — done ส่งครั้งเดียวตอนภาพเปลี่ยน ◂
    r.busy = true;
    r.lastAt = now;
    r.seq = displaySeqNow(now, r.seq);
    try {
      // POS HF-FU2 ▸ D12b: ไม่ส่ง deviceId แล้ว — เซิร์ฟเวอร์หาเครื่องจากกะ OPEN ของผู้ใช้เอง (displayPublisherDevice) · action ยังรับ deviceId? จากแท็บเก่าและไม่อ่าน ◂
      const res = await publishDisplayStateAction({ systemId: cur.systemId, unitId: cur.unitId, deviceCode: cur.deviceCode, seq: r.seq, state: cur.state });
      // POS P2.10 ▸ fix1 F8: ผลการส่งล่าสุด (ไว้ดูตอนวินิจฉัย — ไม่มีเนื้อหาภาพ/ข้อมูลลูกค้า) · window.__posDisplayPublish
      (window as unknown as { __posDisplayPublish?: unknown }).__posDisplayPublish = {
        at: Date.now(),
        seq: r.seq,
        phase: cur.state.phase,
        ok: !!res?.ok,
        ...(res && res.ok ? { paired: res.paired, ...(res.paired ? { written: res.written } : {}) } : { code: res?.code ?? "NO_RESULT" }),
      }; // ◂
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
      // POS P2.10 ▸ fix1 F1 (มติ fix1 ข้อ 1): ไม่ส่ง done ซ้ำ — ภาพ "ขอบคุณ + QR ใบเสร็จ" ส่งครั้งเดียวแล้วหมดอายุที่เซิร์ฟเวอร์ (20 วิ)
      //    ลูกค้าคนถัดไปจึงไม่เห็น QR ใบเสร็จของคนก่อน แม้หน้าขายยังเปิดจอจบบิลค้างไว้
      if (st && st.phase !== "idle" && st.phase !== "done" && Date.now() - r.lastAt >= DISPLAY_PUBLISH_KEEPALIVE_MS) void send(true); // ◂
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
    // POS P2.14 ▸ U3 H1b: กลับมาออนไลน์ = ส่งทันที (ภาพเปลี่ยนระหว่างออฟไลน์ = ส่งภาพใหม่ · ภาพเดิม = ส่งซ้ำแบบ keepalive)
    const onOnline = () => void send(live.current.key !== ref.current.sentKey ? false : true);
    window.addEventListener("online", onOnline);
    // ◂
    return () => {
      window.removeEventListener("online", onOnline); // POS P2.14 ▸ U3 H1b ◂
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      if (ref.current.timer) clearTimeout(ref.current.timer);
    };
  }, [send]);

  return onPay;
}
