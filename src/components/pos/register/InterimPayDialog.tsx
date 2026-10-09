"use client";

// InterimPayDialog.tsx — จอชำระเงินของหน้าขายใหม่ (POS P1.6 U · ภาพ 02 เดสก์ท็อป/iPad · ภาพ 05ข มือถือ)
//   ⚠️ ชื่อไฟล์ยังเป็น "Interim" เพราะ qc-pos-p1.3 S5.20 อ่านพาธนี้ตรงตัว (ตัวกัน quotePending/quoteError) — เปลี่ยนชื่อเป็น
//      PayDialog.tsx ได้เมื่อผู้คุมงานอนุมัติ ORACLE-EDIT แบบเปลี่ยนพาธอย่างเดียว (โน้ต pos-P1.6U) · เนื้อในคือจอ P1.6 ทั้งหมดแล้ว
//
// โครง (ภาพ 02): หัว (กระเป๋าเงิน · ชำระเงิน · ชิปจำนวนรายการ · Esc ปิด · ✕) → ตัว 2 คอลัมน์
//   ซ้าย = ยอดที่ต้องชำระ (ใหญ่) + รายละเอียดยอด · การ์ดผิดพลาด · แยกจ่าย (แถวที่รับแล้ว + "คงเหลือ") · ช่องวิธีจ่าย 4 แบบ
//   ขวา (พื้น surface-2) = QR พร้อมเพย์ล็อกยอดรอบนี้ / เลขอ้างอิงบัตร-โอน · ช่องจำนวน · เงินทอน · แป้นตัวเลข · ปุ่มด่วน 100/500/1,000/พอดี
//   ท้าย = ทิป (ปิดอยู่จนกว่า P1.6b — แสดงเหตุผล) · ย้อนกลับ · ยืนยันรับเงิน ฿X (F4)
//   มือถือ (ภาพ 05ข) = เต็มจอ · หัวมีปุ่มย้อนกลับ · ซ้อนลงมาตามลำดับเดียวกัน · ไม่มีแป้นตัวเลข (ใช้แป้นของเครื่อง) · ปุ่มยืนยันเต็มกว้างล่างจอ
//
// เงิน (กติกา P1.6 R2 R3 · มติ §8):
//   1) ยอดบิล = grandTotal จาก quote ของเซิร์ฟเวอร์เสมอ · ทิปอยู่นอกยอดบิล ⇒ Σ วิธีจ่าย = ยอดบิล + ทิป · ทุกแถว ≥ 1 สตางค์
//   2) แยกจ่ายได้ไม่เกิน REGISTER_MAX_PAY_METHODS แถว · เงินสดได้แถวเดียว (เงินรับ/ทอนอยู่บนแถวเงินสด) · บัตร/โอน/พร้อมเพย์ ≤ ยอดคงเหลือ
//   3) เงินสดรอบสุดท้าย: รับ ≥ คงเหลือ ⇒ ส่วนเงินสด = คงเหลือ · ทอน = รับ − คงเหลือ · รับน้อยกว่าคงเหลือ = "แยกจ่าย" (แถวเงินสด รับ = ยอด)
//   4) ยอดบิลเปลี่ยน (quote ใหม่ / PRICE_CHANGED) ⇒ ล้างแถวที่แยกไว้ (ห้ามส่งยอดเก่า) · ทิปแก้ได้เฉพาะตอนยังไม่มีแถว
//   5) บิล 0 บาท = payMethods [] (ไม่มีช่องให้เลือก)
// 🔴 ไม่แสดง message ของเซิร์ฟเวอร์เลย — ข้อความมาจากคีย์ errors.* (refusalMessageKey) · รหัสอยู่แค่ data-code
// 🔴 ผลยังไม่แน่ใจ (unknown) = มีแค่ "ลองอีกครั้ง" (ชุดคำขอเดิม คีย์เดิม — วงจรคีย์อยู่ที่ RegisterScreen) · ห้ามสร้างคีย์ในไฟล์นี้ (S5.21)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3) · testid เขียนตรงบนแท็ก
// POS P1.7U ▸ พร้อมเพย์ (และบัตรเมื่อร้านเปิด Beam) = ใบขอรับเงินต่อรอบ (PayIntentPanel · usePayIntent):
//   รอบนี้ยืนยัน/แยกจ่ายได้เมื่อใบเป็น PAID เท่านั้น · แถวที่มาจากใบ PAID มี reference = id ของใบ และล็อก (เอาออก/แก้ไม่ได้ — มติ 2) ·
//   บัตรเมื่อ Beam ปิด/CARD_UNAVAILABLE = ทาง EDC + เลขอ้างอิงเดิมของ P1.6 (มติ 3) · ส่วนลดเกินเพดาน = ไม่สร้าง QR (มติ 5) ◂

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PromptPayQr } from "@/components/PromptPayQr";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { formatBaht } from "@/lib/ui/money";
import {
  moneyText,
  REGISTER_MAX_PAY_METHODS,
  REGISTER_REFERENCE_MAX,
  type RegisterPayMethod,
  type RegisterPayType,
  type RegisterSaleStatus,
} from "@/lib/modules/pos/register-shared";
import { hundredthsText, parseHundredths } from "./LineEditor";
import { RegisterDialog } from "./RegisterDialog";
import { RegisterIcon, type RegisterIconName } from "./RegisterIcon";
import { PayIntentPanel, usePayIntent, type IntentTarget, type PayIntentSetup } from "./PayIntentPanel";

export type PayPhase = "form" | "sending" | "unknown" | "conflict";
export type PayError = { code: string; key: string; values?: Record<string, string | number> };
/** สิ่งที่กล่องส่งกลับเมื่อยืนยัน — RegisterScreen ประกอบเป็นคำขอ submit (คีย์บิล + expectedGrandTotalSatang อยู่ฝั่งนั้น) */
export type PayChoice = { payMethods: RegisterPayMethod[]; cashReceivedSatang?: number; tipSatang: number };
/** รายละเอียดยอดจาก quote (แสดงใต้ยอดใหญ่) */
export type PayBreakdown = {
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  vatMode: "INCLUDED" | "EXCLUDED" | "NONE";
  vatRateBp: number;
};

type Props = {
  /** ยอดบิล (grandTotal ของ quote · ไม่รวมทิป) */
  dueSatang: number;
  breakdown: PayBreakdown | null;
  /** B2.2 N1: quote ของตะกร้าปัจจุบันยังไม่มา ⇒ ยืนยันไม่ได้ + ป้าย "กำลังโหลด" */
  quotePending: boolean;
  /** B2.3 N-a: quote ของตะกร้าปัจจุบันล้ม ⇒ การ์ดข้อผิดพลาด + ยืนยันไม่ได้ */
  quoteError: PayError | null;
  itemCount: number;
  promptpayId: string | null;
  /** P1.6 R4/F5: ระบบเปิดรับทิป (วันนี้ปิดเสมอจนกว่า P1.6b ลงบัญชีทิปได้) */
  tipEnabled: boolean;
  billNote: string | null;
  phase: PayPhase;
  error: PayError | null;
  /** R4 K2: saleStatus null = CONFLICT เปล่า (บิลอยู่นอกสาขา/ระบบนี้) */
  conflict: { receiptNo: string | null; saleStatus: RegisterSaleStatus | null } | null;
  memberAttached: boolean;
  salesHref: string;
  onConfirm: (c: PayChoice) => void;
  onRetry: () => void;
  onClose: () => void;
  onNewBill: () => void;
  onRemoveMember: () => void;
  /** POS P1.7U ▸ ใบขอรับเงิน (ไม่ส่ง = พร้อมเพย์แบบ QR นิ่ง + ยืนยันเองของ P1.6) */
  intent?: PayIntentSetup | null;
};

/** แถวที่แยกจ่ายไว้แล้ว (ยังไม่ส่ง) · id = ตัวนับในกล่อง (ไม่ใช่คีย์บิล) */
type PayRow = {
  id: number;
  type: RegisterPayType;
  amountSatang: number;
  reference?: string;
  tenderedSatang?: number;
  /** P1.7U: แถวจากใบขอรับเงินที่ PAID แล้ว — ล็อก (reference = id ของใบ) */
  via?: "WEBHOOK" | "MANUAL" | null;
};

const QUICK = [10_000, 50_000, 100_000];
const STATUS_KEY: Record<RegisterSaleStatus, string> = { PAID: "pay.statusPaid", VOIDED: "pay.statusVoided", REFUNDED: "pay.statusRefunded" };
const METHODS: { type: RegisterPayType; label: string; icon: RegisterIconName }[] = [
  { type: "CASH", label: "pay.cash", icon: "cash" },
  { type: "PROMPTPAY", label: "pay.promptpay", icon: "qr" },
  { type: "TRANSFER", label: "pay.transfer", icon: "bank" },
  { type: "CARD", label: "pay.card", icon: "card" },
];
const KEYS: { id: string; label: string; digits: string | null }[] = [
  ...["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => ({ id: d, label: d, digits: d })),
  { id: "00", label: "00", digits: "00" },
  { id: "0", label: "0", digits: "0" },
  { id: "back", label: "⌫", digits: null },
];
/** ตัวเลขบาทยาวได้ไม่เกิน 7 หลัก (฿9,999,999) จากแป้น */
const MAX_DIGITS = 7;
/** แก้รอบ 2 N3: รหัสปฏิเสธของการบันทึกบิลที่บิลนี้ไปต่อไม่ได้ (ต้องคืนเงินที่เข้าแล้วเอง) */
const TERMINAL_SUBMIT: ReadonlySet<string> = new Set(["DEVICE_REVOKED", "SHIFT_CLOSED", "SHIFT_REQUIRED", "INTENT_CONSUMED", "INTENT_EXPIRED"]);
const methodLabelKey = (type: RegisterPayType) => METHODS.find((m) => m.type === type)?.label ?? "pay.cash";
const methodIcon = (type: RegisterPayType): RegisterIconName => METHODS.find((m) => m.type === type)?.icon ?? "cash";
const ratePct = (bp: number) => String(Number((bp / 100).toFixed(2)));
const isFinePointer = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

/**
 * แผนการจ่ายรอบนี้ (บริสุทธิ์) — ยอดที่ต้องรับ ส่วนของรอบนี้ เงินทอน และสถานะ "ครบ/แยก/เกิน"
 *   entry = ค่าที่กรอก (สตางค์ · null = ผิดรูป) · auto = ช่องว่างไว้ให้ใช้ยอดคงเหลือพอดี (บัตร/โอน/พร้อมเพย์)
 */
export function payRoundPlan(remaining: number, type: RegisterPayType, entry: number | null) {
  if (remaining <= 0) return { amount: 0, change: 0, state: remaining === 0 ? ("complete" as const) : ("over" as const) };
  if (entry === null) return { amount: 0, change: 0, state: "invalid" as const };
  if (entry <= 0) return { amount: 0, change: 0, state: "empty" as const };
  if (type === "CASH") {
    if (entry >= remaining) return { amount: remaining, change: entry - remaining, state: "complete" as const };
    return { amount: entry, change: 0, state: "partial" as const };
  }
  if (entry > remaining) return { amount: 0, change: 0, state: "over" as const };
  return { amount: entry, change: 0, state: entry === remaining ? ("complete" as const) : ("partial" as const) };
}

export function PayDialog(p: Props) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const busy = p.phase !== "form";
  const err = p.error ?? p.quoteError;
  const rowSeq = useRef(0);
  const amountRef = useRef<HTMLInputElement>(null);

  // ═══════ สถานะของกล่อง ═══════
  const [rows, setRows] = useState<PayRow[]>([]);
  const [method, setMethod] = useState<RegisterPayType>("CASH");
  /** ค่าที่กรอก (บาท ทศนิยม ≤ 2) · null = ใช้ยอดคงเหลือพอดี (ค่าเริ่มของบัตร/โอน/พร้อมเพย์) */
  const [entry, setEntry] = useState<string | null>("");
  const [reference, setReference] = useState("");
  const [tipOn, setTipOn] = useState(false);
  const [tipText, setTipText] = useState("");

  const tipParsed = tipOn ? parseHundredths(tipText) : 0;
  const tipOk = tipParsed !== null;
  const tip = tipParsed ?? 0;
  const due = p.dueSatang + tip;
  const paid = rows.reduce((s, r) => s + r.amountSatang, 0);
  const remaining = due - paid;
  const zero = due === 0 && rows.length === 0;
  const cashRow = rows.find((r) => r.type === "CASH") ?? null;
  const entryText = entry ?? hundredthsText(Math.max(remaining, 0));
  const entrySatang = entry === null ? Math.max(remaining, 0) : parseHundredths(entry);
  const plan = payRoundPlan(remaining, method, entrySatang);
  const rowsFull = rows.length >= REGISTER_MAX_PAY_METHODS - 1;
  const ppMissing = method === "PROMPTPAY" && !p.promptpayId;
  const ready = !busy && p.itemCount > 0 && !p.quotePending && !p.quoteError && tipOk && !ppMissing;

  // ── POS P1.7U ▸ ใบขอรับเงินของรอบนี้ (มติ 1–3 · 5) ──
  /** บัตรถูกปฏิเสธ CARD_UNAVAILABLE ⇒ ใช้ทาง EDC เดิมตลอดกล่องนี้ */
  const [cardEdc, setCardEdc] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const beamCard = !!p.intent?.beamCard && !cardEdc;
  const intentMode = !!p.intent && (method === "PROMPTPAY" || (method === "CARD" && beamCard));
  const roundAmount = plan.state === "complete" || plan.state === "partial" ? plan.amount : 0;
  const intentWaiting = roundAmount <= 0 || (plan.state === "partial" && rowsFull);
  const target: IntentTarget =
    intentMode && ready && !zero && !intentWaiting && !p.intent!.discountOverCap ? { method: method as "PROMPTPAY" | "CARD", amountSatang: roundAmount } : null;
  const flash = (key: string) => {
    setNotice(key);
    setTimeout(() => setNotice((n) => (n === key ? null : n)), 3500);
  };
  // F1: แถวที่ = ลำดับแถวแยกจ่ายถัดไป · ใบที่อยู่บนแถวแล้วห้ามถูกใช้ซ้ำ · F2: ใบเดิมเงินเข้าแล้วระหว่างยกเลิก ⇒ คืนวิธี/ยอดของใบนั้น + ล็อก
  const pi = usePayIntent(p.intent ?? null, target, {
    slot: rows.length,
    usedIds: rows.flatMap((r) => (r.via !== undefined && r.reference ? [r.reference] : [])),
    onPaidElsewhere: (it) => {
      setMethod(it.kind === "CARD_BEAM" ? "CARD" : "PROMPTPAY");
      setEntry(hundredthsText(it.amountSatang));
      flash("pay.intent.locked");
    },
  });
  /** ใบของรอบนี้จ่ายแล้วและยอดตรงรอบนี้ ⇒ ยืนยัน/แยกจ่ายได้ · ยอด/วิธีล็อก */
  const piPaid = intentMode && pi.intent?.status === "PAID" && pi.intent.amountSatang === roundAmount;
  const piLocked = intentMode && pi.intent?.status === "PAID";
  const canConfirm = ready && (zero || plan.state === "complete") && (!intentMode || zero || remaining <= 0 || piPaid);
  const canSplit = ready && !zero && plan.state === "partial" && !rowsFull && (!intentMode || piPaid);
  /** F3b: เงินเข้าเกินยอดบิล (ยอดบิลลดลงหลังมีแถวที่เงินเข้าแล้ว) — ยืนยันไม่ได้ · ต้องคืนเงินเอง */
  const overPaid = remaining < 0 && rows.some((r) => r.via !== undefined);
  /** F3b: มีเงินเข้าแล้วในกล่องนี้ (ใบปัจจุบัน PAID หรือแถวที่มาจากใบ) ⇒ ปิดกล่องไม่ได้ (ยกเว้นเงินเกินยอด — ต้องออกไปคืนเงิน) */
  const moneyIn = pi.intent?.status === "PAID" || rows.some((r) => r.via !== undefined);
  /** แก้รอบ 2 N3: ปฏิเสธจากการบันทึกบิลแบบปลายทาง (บิลนี้บันทึกไม่ได้แล้ว) ⇒ ปิดได้แม้มีเงินเข้า + บรรทัด "คืนเงินเอง" */
  const terminalRefusal = !!p.error && TERMINAL_SUBMIT.has(p.error.code);
  const [closing, setClosing] = useState(false);
  // แก้รอบ 2 N1: ระหว่างยืนยันเอง/กำลังปิด = ห้ามปิด · ใบ PENDING ถูกยกเลิกและรอผลก่อนปิด (INTENT_PAID ⇒ รับใบนั้น + ล็อก + ไม่ปิด)
  const tryClose = async () => {
    if (closing) return;
    if (pi.confirming) return flash("pay.intent.locked");
    if (moneyIn && !overPaid && !terminalRefusal) return flash("pay.intent.locked");
    if (pi.intent?.status === "PENDING") {
      setClosing(true);
      const r = await pi.cancelCurrent();
      setClosing(false);
      if (r === "paid") return; // onPaidElsewhere แสดงข้อความล็อกแล้ว
    }
    p.onClose();
  };
  useEffect(() => {
    if (pi.error?.code === "CARD_UNAVAILABLE" && method === "CARD") setCardEdc(true);
  }, [pi.error, method]);

  // ยอดบิลเปลี่ยน (quote ใหม่ · PRICE_CHANGED) ⇒ แถวที่แยกไว้คิดจากยอดเก่า — ล้างทิ้ง เริ่มรับใหม่ (กติกาข้อ 4)
  //   P1.7U F3b: แถวที่เงินเข้าแล้ว (via) คงไว้เสมอ · ใบปัจจุบันที่ PAID ย้ายลงแถว · คิดใหม่เฉพาะส่วนที่ยังไม่จ่าย
  const lastDue = useRef(p.dueSatang);
  useEffect(() => {
    if (lastDue.current === p.dueSatang) return;
    lastDue.current = p.dueSatang;
    const cur = pi.intent;
    const paidRow: PayRow | null =
      cur && cur.status === "PAID"
        ? { id: ++rowSeq.current, type: cur.kind === "CARD_BEAM" ? "CARD" : "PROMPTPAY", amountSatang: cur.amountSatang, reference: cur.id, via: cur.confirmedVia }
        : null;
    if (paidRow) pi.release();
    setRows((s) => [...s.filter((r) => r.via !== undefined), ...(paidRow ? [paidRow] : [])]);
    setEntry(method === "CASH" ? "" : null);
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เฉพาะเมื่อยอดบิลเปลี่ยน
  }, [p.dueSatang, method]);

  // เลือกวิธีจ่าย: เงินสด = ช่องว่างรอรับเงิน · อื่น ๆ = ยอดคงเหลือพอดี · โฟกัสช่องจำนวนเฉพาะเมาส์/คีย์บอร์ด (จอสัมผัสไม่เด้งคีย์บอร์ด)
  const pickMethod = (m: RegisterPayType) => {
    if (piLocked && m !== method) return flash("pay.intent.locked"); // มติ 2: ใบที่เงินเข้าแล้วเปลี่ยนวิธีไม่ได้
    setMethod(m);
    setEntry(m === "CASH" ? "" : null);
    setReference("");
    if (isFinePointer()) setTimeout(() => amountRef.current?.focus(), 0);
  };
  useEffect(() => {
    if (!zero && isFinePointer()) amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งแรกที่เปิดกล่องเท่านั้น
  }, []);

  // ── แป้นตัวเลข: ต่อท้ายหลักบาท · ค่าที่มีทศนิยม (จาก "พอดี") หรือค่าอัตโนมัติ = เริ่มใหม่ · ⌫ ลบทีละตัว ──
  const press = (k: (typeof KEYS)[number]) => {
    if (busy || piLocked) return;
    if (k.digits === null) {
      setEntry(entryText.slice(0, -1));
      return;
    }
    const base = entry === null || entryText.includes(".") ? "" : entryText;
    const next = (base + k.digits).replace(/^0+(?=\d)/, "");
    if (next.length > MAX_DIGITS) return;
    setEntry(next);
  };
  const quick = (v: number) => {
    if (busy || piLocked) return;
    setEntry(hundredthsText(v));
  };
  const exact = () => {
    if (busy || piLocked) return;
    setEntry(method === "CASH" ? hundredthsText(Math.max(remaining, 0)) : null);
  };

  // ── แยกจ่าย: เก็บแถวรอบนี้ แล้วรอบถัดไปตั้งยอดคงเหลือพอดี (เงินสดใช้แล้ว ⇒ เลือกพร้อมเพย์/โอนให้) ──
  const addSplit = () => {
    if (!canSplit) return;
    const row: PayRow = {
      id: ++rowSeq.current,
      type: method,
      amountSatang: plan.amount,
      ...(method === "CASH" ? { tenderedSatang: plan.amount } : {}),
      ...(!intentMode && (method === "CARD" || method === "TRANSFER") && reference.trim() ? { reference: reference.trim() } : {}),
      ...(intentMode && piPaid && pi.intent ? { reference: pi.intent.id, via: pi.intent.confirmedVia } : {}),
    };
    if (intentMode) pi.release();
    setRows((s) => [...s, row]);
    // P1.7U: หลังใบที่เงินเข้าแล้ว ⇒ รอบถัดไปเริ่มที่เงินสด (ถ้ายังไม่มีแถวเงินสด) — ไม่สร้าง QR ใบที่สองเอง
    const next: RegisterPayType = intentMode ? (cashRow ? "TRANSFER" : "CASH") : method === "CASH" ? (p.promptpayId ? "PROMPTPAY" : "TRANSFER") : method;
    setMethod(next);
    setEntry(next === "CASH" ? "" : null);
    setReference("");
  };
  const removeRow = (id: number) => {
    if (busy) return;
    if (rows.some((r) => r.id === id && r.via !== undefined)) return flash("pay.intent.locked"); // มติ 2: เงินเข้าแล้ว — เอาออกไม่ได้
    setRows((s) => s.filter((r) => r.id !== id));
    setEntry(method === "CASH" ? "" : null);
  };

  // ── ยืนยัน: แถวที่แยกไว้ + รอบสุดท้าย (ถ้ายังมีคงเหลือ) → payMethods · เงินรับของแถวเงินสด → cashReceivedSatang ──
  const confirm = () => {
    if (!canConfirm) return;
    if (zero) return p.onConfirm({ payMethods: [], tipSatang: 0 });
    const final: PayRow[] =
      remaining > 0
        ? [
            {
              id: 0,
              type: method,
              amountSatang: plan.amount,
              ...(method === "CASH" ? { tenderedSatang: entrySatang ?? plan.amount } : {}),
              ...(!intentMode && (method === "CARD" || method === "TRANSFER") && reference.trim() ? { reference: reference.trim() } : {}),
              ...(intentMode && piPaid && pi.intent ? { reference: pi.intent.id } : {}),
            },
          ]
        : [];
    const all = [...rows, ...final];
    if (all.length > REGISTER_MAX_PAY_METHODS || all.reduce((s, r) => s + r.amountSatang, 0) !== due || all.some((r) => r.amountSatang <= 0)) return;
    const cash = all.find((r) => r.type === "CASH");
    p.onConfirm({
      payMethods: all.map((r) => ({ type: r.type, amountSatang: r.amountSatang, ...(r.reference ? { reference: r.reference } : {}) })),
      ...(cash ? { cashReceivedSatang: cash.tenderedSatang ?? cash.amountSatang } : {}),
      tipSatang: tip,
    });
  };
  const primary = () => (canConfirm ? confirm() : canSplit ? addSplit() : undefined);
  const primaryRef = useRef(primary);
  primaryRef.current = primary;
  // F4 ในกล่อง = ปุ่มหลัก (ภาพ 02 "ยืนยันรับเงิน ฿X (F4)") — ตัวจับแป้นของ RegisterScreen ไม่ทำอะไรเมื่อมีกล่องเปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F4" || e.repeat) return;
      e.preventDefault();
      primaryRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // QR ล็อกยอดรอบนี้ (ไม่ใช่ทั้งบิลเมื่อแยกจ่าย) — ID ผิดรูป = ไม่มี QR (กล่องช่วยเหลือของ PromptPayQr)
  const qrAmount = method === "PROMPTPAY" && (plan.state === "complete" || plan.state === "partial") ? plan.amount : 0;
  const qr = useMemo(() => {
    if (!p.promptpayId || qrAmount <= 0) return null;
    try {
      return promptpayPayload({ id: p.promptpayId, amountSatang: qrAmount });
    } catch {
      return null;
    }
  }, [p.promptpayId, qrAmount]);

  const b = p.breakdown;
  const breakdown = b
    ? [
        `${t("totals.subtotal")} ${moneyText(b.subtotalSatang)}`,
        b.lineDiscountSatang > 0 ? `${t("totals.lineDiscounts")} ${moneyText(-b.lineDiscountSatang)}` : null,
        b.billDiscountSatang > 0 ? `${t("totals.billDiscount")} ${moneyText(-b.billDiscountSatang)}` : null,
        b.serviceChargeSatang > 0 ? `${t("totals.serviceCharge")} ${moneyText(b.serviceChargeSatang)}` : null,
        tip > 0 ? `${t("totals.tip")} ${moneyText(tip)}` : null,
        b.vatMode === "INCLUDED" ? t("pay.breakdownVat", { rate: ratePct(b.vatRateBp), amount: formatBaht(b.vatSatang, { decimals: true }) }) : null,
        b.vatMode === "EXCLUDED" ? `${t("totals.vatExcluded", { rate: ratePct(b.vatRateBp) })} ${formatBaht(b.vatSatang, { decimals: true })}` : null,
      ].filter((x): x is string => !!x)
    : [];
  const methodName = t(methodLabelKey(method));
  const primaryLabel =
    p.phase === "sending"
      ? t("pay.sending")
      : p.quotePending
        ? tc("loading")
        : zero
          ? t("pay.confirmFree")
          : canSplit
            ? t("pay.addSplit", { method: methodName, amount: moneyText(plan.amount) })
            : t("pay.confirm", { amount: moneyText(Math.max(plan.state === "complete" ? (remaining > 0 ? plan.amount : due) : remaining, 0)) });
  const showForm = p.phase === "form" || p.phase === "sending";
  const tile = (on: boolean) =>
    `flex h-[66px] flex-col items-center justify-center gap-1 rounded-[16px] border px-2 text-center text-[15px] font-semibold leading-tight disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)] xl:h-[78px] xl:gap-1.5 ${
      on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "bg-[color:var(--color-surface)]"
    }`;

  return (
    <RegisterDialog onDismiss={() => void tryClose()} locked={busy || closing}>
      <div
        data-testid="pos-reg-paydlg"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-surface)] shadow-xl md:h-[min(760px,calc(100dvh-32px))] md:w-[min(1120px,calc(100vw-32px))] md:rounded-[16px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("pay.title")}
      >
        {/* ── หัว ── */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 md:gap-[19px] md:px-[22px] md:py-[14px]">
          <RegisterIcon name="wallet" size={18} className="hidden md:block" />
          <h2 className="text-[19px] font-bold md:text-[17px]">{t("pay.title")}</h2>
          <span className="inline-flex h-7 items-center rounded-[8px] border px-[11px] text-[13px] text-[color:var(--color-ink-soft)]">{t("cart.itemCount", { count: p.itemCount })}</span>
          <span className="flex-1" />
          <span className="hidden text-[12px] text-[color:var(--color-muted)] md:inline">{t("pay.escClose")}</span>
          {!busy && (
            <button
              data-testid="pos-reg-paydlg-close"
              className="-ml-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] max-md:order-first max-md:text-[color:var(--color-ink)] md:-mr-2 md:ml-0"
              type="button"
              aria-label={t("cart.close")}
              onClick={() => void tryClose()}
            >
              <span className="md:hidden">
                <RegisterIcon name="back" size={20} />
              </span>
              <span className="hidden md:block">
                <RegisterIcon name="x" size={18} />
              </span>
            </button>
          )}
        </div>

        <form
          data-testid="pos-reg-paydlg-form"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            primary();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            {/* ── คอลัมน์ซ้าย ── */}
            <div className="flex min-w-0 flex-col gap-5 px-5 py-4 md:flex-1 md:overflow-y-auto md:border-r md:px-[22px] md:py-[18px] xl:gap-[23px]">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div>
                  <div className="text-[12px] text-[color:var(--color-muted)]">{t("pay.due")}</div>
                  <div data-testid="pos-reg-paydlg-due" className="text-[44px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums xl:text-[56px]">
                    {moneyText(due)}
                  </div>
                </div>
                {breakdown.length > 0 && (
                  <p data-testid="pos-reg-paydlg-breakdown" className="max-w-[340px] text-right text-[12px] leading-[1.6] text-[color:var(--color-muted)] max-md:hidden">
                    {breakdown.join(" · ")}
                  </p>
                )}
              </div>
              {p.billNote && <p className="-mt-2 break-words text-[13px] text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{t("pay.billNote", { note: p.billNote })}</p>}

              {err && (
                <div data-testid="pos-reg-paydlg-error" data-code={err.code} className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
                  <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
                    <RegisterIcon name="warn" size={18} className="mt-0.5" />
                    <span>{t.rich(err.key, { ...(err.values ?? {}), b: (c) => <b>{c}</b> })}</span>
                  </div>
                  {err.code === "MEMBER_RIGHTS_UNSUPPORTED" && p.memberAttached && (
                    <button
                      data-testid="pos-reg-paydlg-remove-member"
                      className="btn btn-ghost h-11 self-start rounded-[13px] px-5 text-[15px]"
                      type="button"
                      onClick={p.onRemoveMember}
                    >
                      {t("pay.removeMember")}
                    </button>
                  )}
                </div>
              )}

              {p.phase === "conflict" && p.conflict && (
                <div data-testid="pos-reg-paydlg-conflict" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
                  <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
                    <RegisterIcon name="warn" size={18} className="mt-0.5" />
                    <span>{t("errors.idempotencyConflict")}</span>
                  </div>
                  {p.conflict.saleStatus && (
                    <p className="text-[14.5px] leading-[1.65] text-[color:var(--color-ink-soft)]">
                      {t("pay.existingBill", { no: p.conflict.receiptNo ?? "-", status: t(STATUS_KEY[p.conflict.saleStatus]) })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2.5">
                    <button data-testid="pos-reg-paydlg-new-bill" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px]" type="button" autoFocus onClick={p.onNewBill}>
                      {t("pay.newBill")}
                    </button>
                    <Link data-testid="pos-reg-paydlg-bills" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" href={p.salesHref}>
                      {t("tabs.bills")}
                    </Link>
                  </div>
                </div>
              )}

              {p.phase === "unknown" && (
                <div data-testid="pos-reg-paydlg-unknown" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
                  <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
                    <RegisterIcon name="warn" size={18} className="mt-0.5" />
                    <span>{t("errors.unknownResult")}</span>
                  </div>
                  <button data-testid="pos-reg-paydlg-retry" className="btn btn-primary h-14 rounded-[16px] text-[16px] font-bold" type="button" autoFocus onClick={p.onRetry}>
                    {t("pay.retry")}
                  </button>
                </div>
              )}

              {showForm && !zero && (
                <div>
                  {rows.length > 0 && <div className="mb-1.5 text-[12px] text-[color:var(--color-muted)]">{t("pay.splitTitle")}</div>}
                  <div className="overflow-hidden rounded-[12px] border" role="list" aria-label={t("pay.splitTitle")}>
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 border-b px-[14px] py-1 text-[13px] md:gap-[19px]" role="listitem">
                        <RegisterIcon name={methodIcon(r.type)} size={14} />
                        <b className="shrink-0">{t(methodLabelKey(r.type))}</b>
                        <span className="font-bold tabular-nums">{moneyText(r.amountSatang)}</span>
                        <RegisterIcon name="check" size={14} />
                        <span className="min-w-0 flex-1 truncate text-[color:var(--color-muted)]">
                          {r.type === "CASH" && r.tenderedSatang !== undefined
                            ? t("pay.rowCash", { received: moneyText(r.tenderedSatang), change: moneyText(r.tenderedSatang - r.amountSatang) })
                            : r.via !== undefined
                              ? t(r.via === "WEBHOOK" ? "pay.intent.paidBeam" : "pay.intent.paidManual")
                              : r.reference
                              ? t("pay.rowRef", { ref: r.reference })
                              : ""}
                        </span>
                        <button
                          data-testid={`pos-reg-paydlg-row-remove-${r.id}`}
                          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50 aria-disabled:opacity-40"
                          type="button"
                          disabled={busy}
                          aria-disabled={r.via !== undefined || undefined}
                          aria-label={t("pay.removeRow", { method: t(methodLabelKey(r.type)), amount: moneyText(r.amountSatang) })}
                          onClick={() => removeRow(r.id)}
                        >
                          <RegisterIcon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                    <div
                      data-testid="pos-reg-paydlg-remaining"
                      className="flex items-center gap-3 bg-[color:var(--color-accent-soft)] px-[14px] py-[11px] text-[14.5px] font-bold text-[color:var(--color-accent)]"
                      role="listitem"
                    >
                      <span>{t("pay.remaining")}</span>
                      <span className="flex-1" />
                      <span className="tabular-nums">{moneyText(Math.max(remaining, 0))}</span>
                    </div>
                  </div>
                </div>
              )}

              {showForm && !zero && (
                <div>
                  <div className="mb-1.5 text-[12px] text-[color:var(--color-muted)]">{t("pay.methodsTitle")}</div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:gap-4" role="group" aria-label={t("pay.methodsTitle")}>
                    {METHODS.map((m) => {
                      const off = busy || (m.type === "CASH" && !!cashRow) || (m.type === "PROMPTPAY" && !p.promptpayId);
                      const sub =
                        m.type === "CASH"
                          ? cashRow
                            ? t("pay.cashUsed", { amount: moneyText(cashRow.amountSatang) })
                            : null
                          : m.type === "PROMPTPAY"
                            ? p.promptpayId
                              ? t("pay.promptpayHint")
                              : t("pay.noPromptPay")
                            : m.type === "TRANSFER"
                              ? t("pay.transferHint")
                              : p.intent
                                ? t(beamCard ? "pay.intent.cardBeam" : "pay.intent.cardEdc")
                                : t("pay.cardHint");
                      return (
                        <button
                          key={m.type}
                          data-testid={`pos-reg-paydlg-method-${m.type.toLowerCase()}`}
                          className={tile(method === m.type && !off)}
                          type="button"
                          aria-pressed={method === m.type}
                          disabled={off}
                          onClick={() => pickMethod(m.type)}
                        >
                          <span>{t(m.label)}</span>
                          {sub && <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{sub}</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── คอลัมน์ขวา (มือถือ: ต่อท้ายคอลัมน์ซ้าย · ไม่มีแป้นตัวเลข) ── */}
            {showForm && !zero && (
              <div className="flex flex-col gap-4 px-5 pb-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:bg-[color:var(--color-surface-2)] md:px-[22px] md:py-[18px] lg:w-[470px] xl:gap-[23px]">
                {intentMode && p.intent && (
                  <PayIntentPanel h={pi} setup={p.intent} method={method === "CARD" ? "CARD" : "PROMPTPAY"} amountSatang={roundAmount} waiting={intentWaiting} />
                )}
                {!p.intent && method === "PROMPTPAY" && p.promptpayId && (
                  <div data-testid="pos-reg-paydlg-qr" className="flex items-center gap-5 rounded-[12px] border bg-[color:var(--color-surface)] p-[14px] max-md:flex-col xl:gap-[31px]">
                    <PromptPayQr payload={qr} size={150} />
                    <div className="flex min-w-0 flex-1 flex-col gap-3 max-md:items-center max-md:text-center">
                      <div className="text-[12px] text-[color:var(--color-muted)]">{t("pay.promptpayRound")}</div>
                      <div className="text-[28px] font-bold tracking-[-0.02em] tabular-nums">{moneyText(qrAmount)}</div>
                      <p className="text-[12.5px] leading-[1.45] text-[color:var(--color-ink-soft)]">{t("pay.scanToPay")}</p>
                    </div>
                  </div>
                )}

                {((method === "CARD" && !intentMode) || method === "TRANSFER") && (
                  <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
                    <span>
                      {t("pay.reference")} <span className="text-[12px]">· {t("pay.referenceHint")}</span>
                    </span>
                    <input
                      data-testid="pos-reg-paydlg-reference"
                      className="input h-12 rounded-[10px] text-[15px] text-[color:var(--color-ink)]"
                      value={reference}
                      maxLength={REGISTER_REFERENCE_MAX}
                      disabled={busy}
                      autoComplete="off"
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                )}

                <label className="flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-[13px] text-[color:var(--color-muted)]">
                  <span className="min-w-0 truncate">{method === "CASH" ? t("pay.amountCash") : t("pay.amountFor", { method: methodName })}</span>
                  <input
                    data-testid="pos-reg-paydlg-received"
                    className="h-full w-36 min-w-0 bg-transparent text-right text-[22px] font-bold tabular-nums text-[color:var(--color-ink)] outline-none"
                    ref={amountRef}
                    inputMode="decimal"
                    autoComplete="off"
                    value={entryText}
                    placeholder="0"
                    disabled={busy || piLocked}
                    aria-invalid={plan.state === "invalid" || plan.state === "over"}
                    onChange={(e) => setEntry(e.target.value)}
                  />
                </label>

                {method === "CASH" && (
                  <div className="flex items-baseline justify-between rounded-[10px] bg-[color:var(--color-surface)] px-[14px] py-2.5 md:border">
                    <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("pay.change")}</span>
                    <span data-testid="pos-reg-paydlg-change" className="text-[22px] font-bold tabular-nums">
                      {plan.state === "complete" ? moneyText(plan.change) : "-"}
                    </span>
                  </div>
                )}
                {plan.state === "invalid" && (
                  <p className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                    {t("errors.amountInvalid")}
                  </p>
                )}
                {plan.state === "over" && remaining > 0 && (
                  <p className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                    {t("pay.overRemaining", { method: methodName, amount: moneyText(remaining) })}
                  </p>
                )}
                {plan.state === "partial" && rowsFull && (
                  <p className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                    {t("errors.splitInvalid")}
                  </p>
                )}
                {terminalRefusal && moneyIn && (
                  <p data-testid="pos-pay-intent-refund" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t("pay.intent.refundYourself")}
                  </p>
                )}
                {overPaid && (
                  <p data-testid="pos-pay-intent-overpaid" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t("pay.intent.overPaid", { amount: moneyText(-remaining) })}
                  </p>
                )}
                {notice && (
                  <p data-testid="pos-pay-intent-locked" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="status">
                    {t(notice)}
                  </p>
                )}

                <div className="hidden grid-cols-3 gap-3.5 md:grid" role="group" aria-label={t("pay.numpad")}>
                  {KEYS.map((k) => (
                    <button
                      key={k.id}
                      data-testid={`pos-reg-paydlg-key-${k.id}`}
                      className={`grid h-14 place-items-center rounded-[14px] border text-[21px] font-semibold tabular-nums active:bg-[color:var(--color-surface-2)] disabled:opacity-50 xl:h-16 ${
                        k.id === "00" || k.id === "back" ? "bg-[color:var(--color-surface-2)] text-[18px]" : "bg-[color:var(--color-surface)]"
                      }`}
                      type="button"
                      disabled={busy || piLocked}
                      aria-label={k.id === "back" ? t("pay.backspace") : k.label}
                      onClick={() => press(k)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2.5 xl:gap-4">
                  {QUICK.map((v) => (
                    <button
                      key={v}
                      data-testid={`pos-reg-paydlg-quick-${v / 100}`}
                      className="h-11 rounded-[8px] border bg-[color:var(--color-surface)] text-[13px] font-semibold tabular-nums disabled:opacity-50"
                      type="button"
                      disabled={busy || piLocked || (method !== "CASH" && v > remaining)}
                      onClick={() => quick(v)}
                    >
                      {(v / 100).toLocaleString("th-TH")}
                    </button>
                  ))}
                  <button
                    data-testid="pos-reg-paydlg-quick-exact"
                    className="h-11 rounded-[8px] border bg-[color:var(--color-surface)] text-[13px] font-semibold disabled:opacity-50"
                    type="button"
                    disabled={busy || piLocked}
                    onClick={exact}
                  >
                    {t("pay.exact")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── ท้าย: ทิป · ย้อนกลับ · ปุ่มหลัก ── */}
          {showForm && (
            <div className="flex shrink-0 flex-col gap-3 border-t px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:flex-row md:items-center md:gap-[31px] md:px-[22px] md:py-[14px]">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <button
                  data-testid="pos-reg-paydlg-tip-toggle"
                  className="flex h-11 items-center gap-3 font-bold disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)]"
                  type="button"
                  role="switch"
                  aria-checked={tipOn}
                  disabled={!p.tipEnabled || busy || rows.length > 0}
                  onClick={() => {
                    setTipOn((v) => !v);
                    setTipText("");
                  }}
                >
                  <span className={`relative h-6 w-10 rounded-full transition-colors ${tipOn ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}>
                    <span className={`absolute top-0.5 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${tipOn ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  {t("pay.tip")}
                </button>
                {!p.tipEnabled ? (
                  <span className="min-w-0 text-[12.5px] text-[color:var(--color-muted)]">{t("errors.tipNotAvailable")}</span>
                ) : tipOn ? (
                  <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--color-muted)]">
                    {t("pay.tipAmount")}
                    <input
                      data-testid="pos-reg-paydlg-tip"
                      className="input h-11 w-28 rounded-[10px] text-right text-[15px] font-bold tabular-nums text-[color:var(--color-ink)]"
                      inputMode="decimal"
                      autoComplete="off"
                      value={tipText}
                      placeholder="0"
                      disabled={busy || rows.length > 0}
                      aria-invalid={!tipOk}
                      onChange={(e) => setTipText(e.target.value)}
                    />
                    <span>{t("pay.tipHint")}</span>
                  </label>
                ) : null}
              </div>
              <button
                data-testid="pos-reg-paydlg-back"
                className="btn btn-ghost hidden h-12 rounded-[13px] px-5 text-[14.5px] md:inline-flex"
                type="button"
                disabled={busy}
                onClick={() => void tryClose()}
              >
                {t("pay.back")}
              </button>
              {canSplit ? (
                <button
                  data-testid="pos-reg-paydlg-add-split"
                  className="btn btn-primary h-14 rounded-[16px] px-5 text-[16px] font-bold md:h-12 md:rounded-[13px] md:text-[14.5px]"
                  type="submit"
                >
                  {primaryLabel}
                </button>
              ) : (
                <button
                  data-testid="pos-reg-paydlg-confirm"
                  className="btn btn-primary h-14 rounded-[16px] px-5 text-[16px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)] md:h-12 md:rounded-[13px] md:text-[14.5px]"
                  type="submit"
                  aria-keyshortcuts="F4"
                  disabled={!canConfirm}
                  title={intentMode && !piPaid && !zero ? t("pay.intent.waitPaid") : undefined}
                >
                  {primaryLabel}
                  {!busy && !p.quotePending && <span className="ml-1.5 hidden opacity-70 md:inline">(F4)</span>}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </RegisterDialog>
  );
}
