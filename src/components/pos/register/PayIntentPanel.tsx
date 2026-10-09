"use client";

// PayIntentPanel.tsx — POS P1.7U แผงขวาของจอชำระ (ภาพ 02: QR "PromptPay · ยอดรอบนี้" · รอเงินเข้า… ยืนยันอัตโนมัติผ่าน Beam · ยืนยันเองเมื่อเห็นเงินเข้า)
//   usePayIntent = วงจรใบขอรับเงินของ "รอบนี้" (วิธี + ยอด) ในกล่องชำระ · PayIntentPanel = ภาพของใบนั้น
//
// กติกา (มติผู้คุมงาน P1.7U ข้อ 1–3 · สัญญา ledger/wo-notes/pos-P1.7.md "Contract for P1.7U"):
//   1) เลือกพร้อมเพย์ (หรือบัตรเมื่อเปิด Beam) ให้ยอดรอบนี้ ⇒ createPaymentIntentAction · คีย์ = คีย์บิล_s<แถว>_วิธี_ยอด (CD3 · F1) ·
//      สร้างใหม่หลังหมดอายุ/ถูกยกเลิก = ต่อท้าย _r<n> · ⚠️ ตัวคั่นเป็น "_" ไม่ใช่ ":" เพราะคีย์ของเซิร์ฟเวอร์รับเฉพาะ [A-Za-z0-9_-] (C2)
//   2) ยอด/วิธีเปลี่ยนตอนใบยัง PENDING ⇒ cancelPaymentIntentAction แล้วค่อยสร้างใบใหม่ (หน่วงสั้น ๆ ให้พิมพ์ยอดจบก่อน) ·
//      ใบที่ PAID แล้วล็อก (ไม่ยกเลิก/ไม่เปลี่ยน — กล่องชำระกันการแก้เอง)
//   3) PENDING ⇒ โพล paymentIntentStatusAction ทุก 2 วินาที · หยุดเมื่อ PAID/EXPIRED/CANCELLED/CONSUMED
//   4) แก้รอบ 1 F3a: ปิดกล่องชำระ = ยกเลิกใบที่ยังไม่จ่าย (เงินมาช้า ⇒ refund_needed) · ใบที่จ่ายแล้ว (หรือแถวที่มีเงินเข้า) = ปิดกล่องไม่ได้ (F3b)
//   5) F2: ยกเลิกแล้วได้ INTENT_PAID = เงินเข้าแล้ว ⇒ ใบนั้นกลับมาเป็นใบปัจจุบันที่ล็อก (ไม่สร้างใบใหม่ทับ)
// 🔴 ไม่แสดง message ของเซิร์ฟเวอร์ — ข้อความจาก intentRefusalMessageKey (คีย์ใต้ pos) เท่านั้น · ไม่มีข้อความไทยนอกคอมเมนต์
// 🔴 ไม่สร้างคีย์สุ่มในไฟล์นี้ (qc-pos-p1.3 S5.21) — ฐานของคีย์ = คีย์บิลจาก RegisterScreen

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PromptPayQr } from "@/components/PromptPayQr";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import {
  cancelPaymentIntentAction,
  confirmPaymentIntentManualAction,
  createPaymentIntentAction,
  paymentIntentStatusAction,
} from "@/lib/modules/pos/payment-intent-actions";
import { intentRefusalMessageKey, type PaymentIntentMethod, type PaymentIntentView } from "@/lib/modules/pos/payment-intent-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "./RegisterIcon";

/** สิ่งที่หน้าเพจ/RegisterScreen ส่งให้กล่องชำระ (สิทธิ์อ่านจากหน้าเพจ — ไม่เดา) */
export type PayIntentSetup = {
  systemId: string;
  unitId: string;
  /** คีย์บิลของตะกร้านี้ (ฐานของคีย์ใบขอรับเงิน) */
  cartKey: string;
  /** รับบัตรผ่าน Beam ได้ (ร้านเปิด settings.pos.payment.beam.enabled + แพลตฟอร์มมีคีย์) */
  beamCard: boolean;
  /** ผู้ใช้มี pos.shift.manage ที่สาขานี้ */
  canManageShift: boolean;
  /** settings.pos.payment.manualConfirmRequiresManager */
  manualRequiresManager: boolean;
  /** ลิงก์ไปตั้ง PromptPay ID ของร้าน (PaymentProfile) */
  promptpayLink: string;
  /** มติ 5: ส่วนลดท้ายบิลเกินเพดานของผู้ขาย ⇒ ห้ามสร้าง QR */
  discountOverCap: boolean;
};
export type IntentTarget = { method: PaymentIntentMethod; amountSatang: number } | null;
type IntentErr = { code: string; key: string };

const POLL_MS = 2000;
const DEBOUNCE_MS = 450;
const MAX_ROUNDS = 6;
const kindMethod = (k: PaymentIntentView["kind"]): PaymentIntentMethod => (k === "CARD_BEAM" ? "CARD" : "PROMPTPAY");
/** คีย์ใบขอรับเงิน (CD3 · แก้รอบ 1 F1) — คีย์บิล_s<แถวที่>_วิธี_ยอด[_r<n>] · ตัดอักษรนอก [A-Za-z0-9_-] ออกจากคีย์บิล · ยาวรวม ≤ 100 */
export const intentKeyOf = (cartKey: string, slot: number, method: PaymentIntentMethod, amountSatang: number, round: number) =>
  `${cartKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)}_s${slot}_${method}_${amountSatang}${round > 0 ? `_r${round}` : ""}`;
const errOf = (code: string): IntentErr => ({ code, key: intentRefusalMessageKey(code) });
/** แก้รอบ 1 F5: สร้างใบไม่สำเร็จจนหมดรอบ — ข้อความจริง + "ลองใหม่" */
const ROUNDS_EXHAUSTED: IntentErr = { code: "ROUNDS_EXHAUSTED", key: "register.pay.intent.roundsExhausted" };
type CancelOutcome = { ok: true } | { ok: false; code: string };

/**
 * วงจรใบขอรับเงินของรอบนี้ — setup null หรือ target null = ไม่มีใบ (ใบ PENDING ที่ค้างถูกยกเลิก)
 *   usedIds = id ของใบที่อยู่บนแถวแยกจ่ายแล้ว (ใบ reused ที่ซ้ำแถวอื่น = ห้ามแสดงเป็นจ่ายแล้วของแถวใหม่ — F1)
 *   onPaidElsewhere = ยกเลิกใบเดิมไม่ได้เพราะเงินเข้าแล้ว (INTENT_PAID) ⇒ กล่องชำระคืนวิธี/ยอดของใบนั้นและล็อก (F2)
 *   คืน intent ปัจจุบัน · สถานะงาน · ข้อผิดพลาด · วินาทีที่เหลือ · ยืนยันเอง · สร้างใหม่ · ปล่อยใบ (หลังใส่ลงแถวแยกจ่ายแล้ว)
 */
export function usePayIntent(
  setup: PayIntentSetup | null,
  target: IntentTarget,
  opts: { slot: number; usedIds: readonly string[]; onPaidElsewhere: (it: PaymentIntentView) => void },
) {
  const [intent, setIntent] = useState<PaymentIntentView | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<IntentErr | null>(null);
  const [regen, setRegen] = useState(0);
  /** regen ที่จัดการไปแล้ว — ค่าใหม่ = ผู้ใช้สั่งสร้างใหม่ (ห้ามทางลัด "ใบเดิมยังใช้ได้") */
  const regenSeen = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const intentRef = useRef(intent);
  intentRef.current = intent;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const seq = useRef(0);
  /** คีย์ฐาน (คีย์บิล_s_วิธี_ยอด) → รอบที่ใช้อยู่ (_r<n>) */
  const rounds = useRef(new Map<string, number>());
  const scope = setup ? { systemId: setup.systemId, unitId: setup.unitId } : null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const tk = setup && target ? `${opts.slot}|${target.method}|${target.amountSatang}` : "";
  const cartKey = setup?.cartKey ?? "";

  const args = () => ({ ...scopeRef.current!, deviceId: getPosDeviceId() });
  /** F2: ผลของการยกเลิกคืนให้ผู้เรียกเสมอ (INTENT_PAID = เงินเข้าแล้ว ห้ามสร้างใบใหม่ทับ) */
  const cancelIntent = async (id: string): Promise<CancelOutcome> => {
    if (!scopeRef.current) return { ok: false, code: "NOT_FOUND" };
    try {
      const r = await cancelPaymentIntentAction({ ...args(), intentId: id });
      return r.ok ? { ok: true } : { ok: false, code: r.code };
    } catch {
      return { ok: false, code: "INTERNAL" };
    }
  };
  /** F2: ใบที่ยกเลิกไม่ได้เพราะเงินเข้าแล้ว — อ่านสถานะใหม่ ตั้งเป็นใบปัจจุบันที่ล็อก แล้วให้กล่องชำระคืนวิธี/ยอดของใบนั้น */
  const adoptPaid = async (cur: PaymentIntentView) => {
    const st = await paymentIntentStatusAction({ ...args(), intentId: cur.id }).catch(() => null);
    const paid: PaymentIntentView =
      st && st.ok ? { ...cur, status: st.status === "CONSUMED" ? "PAID" : st.status, paidAt: st.paidAt, confirmedVia: st.confirmedVia, expiresAt: st.expiresAt } : { ...cur, status: "PAID" };
    setIntent(paid);
    setCreating(false);
    optsRef.current.onPaidElsewhere(paid);
  };

  // ── สร้าง/ยกเลิกตามรอบนี้ (มติ 1–2 · แก้รอบ 1 F1/F2/F5) ──
  useEffect(() => {
    const cur = intentRef.current;
    if (cur?.status === "PAID") return; // ล็อก — กล่องชำระไม่ให้เปลี่ยนยอด/วิธีอยู่แล้ว
    const my = ++seq.current;
    const forced = regen !== regenSeen.current;
    regenSeen.current = regen;
    const parts = tk ? tk.split("|") : [];
    const slot = Number(parts[0] ?? 0);
    const want: IntentTarget = tk ? { method: parts[1] as PaymentIntentMethod, amountSatang: Number(parts[2]) } : null;
    if (cur && cur.status === "PENDING" && want && kindMethod(cur.kind) === want.method && cur.amountSatang === want.amountSatang && !forced) return;
    setError(null);
    setCreating(!!want);
    const prev = cur && cur.status === "PENDING" ? cur : null;
    if (cur && !prev) setIntent(null);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (prev) {
        // F2: ยกเลิกก่อนเสมอ (target ว่างก็ด้วย) · INTENT_PAID = เงินเข้าแล้ว ⇒ หยุด ไม่สร้างใบทับ
        const c = await cancelIntent(prev.id);
        if (!c.ok && c.code === "INTENT_PAID") return adoptPaid(prev);
        if (seq.current === my) setIntent((x) => (x && x.id === prev.id ? null : x));
      }
      if (!want || seq.current !== my || !scopeRef.current) {
        if (seq.current === my) setCreating(false);
        return;
      }
      const base = intentKeyOf(cartKey, slot, want.method, want.amountSatang, 0);
      let done = false;
      let dupRetried = false;
      for (let i = 0; i < MAX_ROUNDS && !done; i++) {
        const round = rounds.current.get(base) ?? 0;
        const deviceId = getPosDeviceId() ?? "";
        let r: Awaited<ReturnType<typeof createPaymentIntentAction>>;
        try {
          r = await createPaymentIntentAction({
            ...args(),
            input: { method: want.method, amountSatang: want.amountSatang, idempotencyKey: intentKeyOf(cartKey, slot, want.method, want.amountSatang, round), deviceId },
          });
        } catch {
          r = { ok: false, code: "INTERNAL", message: "" };
        }
        if (seq.current !== my) {
          // คำตอบของรอบที่ถูกแทนแล้ว — ใบใหม่ที่ไม่มีใครดูต้องไม่ค้างรอเงิน
          if (r.ok && r.intent.status === "PENDING" && !r.reused) void cancelIntent(r.intent.id);
          return;
        }
        if (!r.ok) {
          if (r.code === "IDEMPOTENCY_CONFLICT") {
            rounds.current.set(base, round + 1); // F5: คีย์นี้ถูกใช้กับอย่างอื่นแล้ว ⇒ รอบใหม่
            continue;
          }
          setError(errOf(r.code));
          done = true;
          break;
        }
        // F1: ใบ reused ที่เป็นของแถวอื่นแล้ว ⇒ รอบใหม่ (ครั้งเดียว) · ห้ามแสดงเป็นจ่ายแล้วของแถวนี้
        if (r.reused && optsRef.current.usedIds.includes(r.intent.id)) {
          rounds.current.set(base, round + 1);
          if (dupRetried) {
            setError(ROUNDS_EXHAUSTED);
            done = true;
            break;
          }
          dupRetried = true;
          continue;
        }
        if (r.intent.status === "EXPIRED" || r.intent.status === "CANCELLED") {
          rounds.current.set(base, round + 1); // ใบเดิมของคีย์นี้ใช้ไม่ได้แล้ว ⇒ รอบใหม่
          continue;
        }
        if (r.intent.status === "CONSUMED") {
          setError(errOf("INTENT_CONSUMED"));
          done = true;
          break;
        }
        setIntent(r.intent);
        done = true;
      }
      if (seq.current !== my) return;
      if (!done) setError(ROUNDS_EXHAUSTED); // F5: หมดรอบ — ข้อความจริง + ลองใหม่
      setCreating(false);
    };
    timer = setTimeout(() => void run(), prev || forced ? 0 : DEBOUNCE_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- รอบนี้เปลี่ยนเมื่อแถว/วิธี/ยอด/คีย์บิล/สั่งสร้างใหม่เท่านั้น
  }, [tk, cartKey, regen]);

  // F3a: ถอดกล่อง (ปิด/ขายเสร็จ) = ยกเลิกใบปัจจุบันที่ยังไม่จ่าย (เงินมาช้า ⇒ refund_needed แทนใบกำพร้า) · คำตอบที่ค้างกลายเป็นของเก่า
  useEffect(
    () => () => {
      seq.current++;
      const cur = intentRef.current;
      if (cur && cur.status === "PENDING") void cancelIntent(cur.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── โพลทุก 2 วินาทีขณะ PENDING (มติ 1) + นาฬิกานับถอยหลัง · F5: ปฏิเสธที่ไม่ใช่ INTERNAL = หยุดโพล + แสดง ──
  const pendingId = intent?.status === "PENDING" ? intent.id : null;
  useEffect(() => {
    if (!pendingId) return;
    let alive = true;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const stop = () => {
      alive = false;
      clearInterval(tick);
      clearInterval(poll);
    };
    const poll = setInterval(async () => {
      if (!scopeRef.current) return;
      const r = await paymentIntentStatusAction({ ...args(), intentId: pendingId }).catch(() => null);
      if (!alive || !r) return;
      if (!r.ok) {
        if (r.code !== "INTERNAL") {
          setError(errOf(r.code));
          stop();
        }
        return;
      }
      setIntent((cur) =>
        cur && cur.id === pendingId ? { ...cur, status: r.status, expiresAt: r.expiresAt, paidAt: r.paidAt, confirmedVia: r.confirmedVia, qrPayload: r.qrPayload ?? cur.qrPayload } : cur,
      );
    }, POLL_MS);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูกกับใบที่ PENDING ใบเดียว
  }, [pendingId]);

  const confirmManual = useCallback(async () => {
    const cur = intentRef.current;
    if (!cur || cur.status !== "PENDING" || confirming || !scopeRef.current) return;
    setConfirming(true);
    setError(null);
    try {
      const r = await confirmPaymentIntentManualAction({ ...args(), intentId: cur.id });
      if (r.ok) setIntent((x) => (x && x.id === r.intent.id ? r.intent : x));
      else setError(errOf(r.code));
    } catch {
      setError(errOf("INTERNAL"));
    } finally {
      setConfirming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming]);

  /** สร้างใบใหม่ (หมดอายุ/ถูกยกเลิก/ผิดพลาด) — รอบถัดไปของคีย์เดิม */
  const regenerate = useCallback(() => {
    const cur = intentRef.current;
    if (cur?.status === "PAID" || !tk) return;
    const [s, m, a] = tk.split("|");
    const base = intentKeyOf(cartKey, Number(s), m as PaymentIntentMethod, Number(a), 0);
    if (cur && (cur.status === "EXPIRED" || cur.status === "CANCELLED")) rounds.current.set(base, (rounds.current.get(base) ?? 0) + 1);
    setRegen((n) => n + 1);
  }, [tk, cartKey]);

  /**
   * แก้รอบ 2 N1: ปิดกล่อง — ยกเลิกใบปัจจุบันที่ PENDING แล้วรอผล · INTENT_PAID = เงินเข้าแล้ว ⇒ รับใบนั้นเป็นใบที่ล็อก (แบบ F2) และห้ามปิด
   *   คืน "none" (ไม่มีใบค้าง) · "ok" (ยกเลิกแล้ว/ล้มแบบอื่น — ปิดได้ · ถอดกล่องจะลองยกเลิกซ้ำ) · "paid" (ห้ามปิด)
   */
  const cancelCurrent = useCallback(async (): Promise<"none" | "ok" | "paid"> => {
    const cur = intentRef.current;
    if (!cur || cur.status !== "PENDING") return "none";
    seq.current++; // คำตอบสร้างใบที่ค้างอยู่กลายเป็นของเก่า
    const c = await cancelIntent(cur.id);
    if (!c.ok && c.code === "INTENT_PAID") {
      await adoptPaid(cur);
      return "paid";
    }
    if (c.ok) setIntent((x) => (x && x.id === cur.id ? { ...x, status: "CANCELLED" } : x));
    return "ok";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ใบ PAID ถูกใส่ลงแถวแยกจ่ายแล้ว — ปล่อยจากรอบนี้ (ไม่ยกเลิก) */
  const release = useCallback(() => {
    seq.current++;
    setIntent(null);
    setError(null);
    setCreating(false);
  }, []);

  const expMs = intent ? Date.parse(intent.expiresAt) : NaN;
  const secondsLeft = intent?.status === "PENDING" && Number.isFinite(expMs) ? Math.max(0, Math.ceil((expMs - now) / 1000)) : null;
  return { intent, creating, confirming, error, secondsLeft, confirmManual, regenerate, release, cancelCurrent };
}
export type PayIntentHandle = ReturnType<typeof usePayIntent>;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** แผง QR ของรอบนี้ (ภาพ 02 ขวาบน) — ปุ่ม/ลิงก์ทุกตัวมี testid pos-pay-intent-* */
export function PayIntentPanel({
  h,
  setup,
  method,
  amountSatang,
  waiting,
}: {
  h: PayIntentHandle;
  setup: PayIntentSetup;
  method: PaymentIntentMethod;
  amountSatang: number;
  /** ยอดรอบนี้ยังไม่พร้อม (ว่าง/เกิน/แถวเต็ม) — ยังไม่สร้างใบ */
  waiting: boolean;
}) {
  const t = useTranslations("pos.register.pay.intent");
  const tp = useTranslations("pos");
  const it = h.intent;
  const title = method === "CARD" ? t("cardTitle") : t("promptpayTitle");
  const shown = it ? it.amountSatang : amountSatang;
  const manualAllowed = !!it && (it.kind === "PROMPTPAY_BEAM" ? setup.canManageShift : !setup.manualRequiresManager || setup.canManageShift);
  const notConfigured = h.error?.code === "PROMPTPAY_NOT_CONFIGURED";

  let body: ReactNode;
  if (setup.discountOverCap) {
    body = (
      <p data-testid="pos-pay-intent-approval" role="alert" className="flex items-start gap-2 text-[13.5px] font-semibold text-[color:var(--color-danger)]">
        <RegisterIcon name="warn" size={14} className="mt-0.5 shrink-0" />
        {t("approvalFirst")}
      </p>
    );
  } else if (notConfigured) {
    body = (
      <div className="flex flex-col gap-2">
        <p data-testid="pos-pay-intent-not-configured" role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
          {t("notConfigured")}
        </p>
        <Link data-testid="pos-pay-intent-setup-link" href={setup.promptpayLink} className="flex min-h-11 items-center text-[13.5px] font-semibold text-[color:var(--color-accent)]">
          {t("setupLink")}
        </Link>
      </div>
    );
  } else if (it && it.status === "PAID") {
    body = (
      <span
        data-testid="pos-pay-intent-paid"
        data-via={it.confirmedVia ?? ""}
        className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-[9px] bg-[color:var(--color-ink)] px-3 text-[13px] font-bold text-[color:var(--color-surface)]"
      >
        <RegisterIcon name="check" size={13} strokeWidth={2.4} />
        {it.confirmedVia === "WEBHOOK" ? t("paidBeam") : t("paidManual")}
        {it.lateWebhook ? <span className="font-normal opacity-80">· {t("lateWebhook")}</span> : null}
      </span>
    );
  } else if (it && (it.status === "EXPIRED" || it.status === "CANCELLED")) {
    body = (
      <div className="flex flex-col gap-2">
        <p data-testid="pos-pay-intent-expired" role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
          {it.status === "EXPIRED" ? t("expired") : t("cancelled")}
        </p>
        <button data-testid="pos-pay-intent-regenerate" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-4 text-[14px]" onClick={h.regenerate}>
          {t("regenerate")}
        </button>
      </div>
    );
  } else if (it && it.status === "PENDING") {
    body = (
      <div className="flex flex-col gap-2">
        {it.kind === "PROMPTPAY_BEAM" ? (
          <p data-testid="pos-pay-intent-wait" className="flex items-start gap-2 text-[13px] font-semibold leading-[1.4] text-[color:var(--color-accent)]">
            <span aria-hidden className="mt-[2px] grid size-4 shrink-0 place-items-center rounded-full border-2 border-[color:var(--color-accent)]">
              <span className="size-1.5 rounded-full bg-[color:var(--color-accent)]" />
            </span>
            {t("waitBeam")}
          </p>
        ) : it.kind === "CARD_BEAM" ? (
          <p data-testid="pos-pay-intent-wait" className="text-[13px] font-semibold leading-[1.4] text-[color:var(--color-accent)]">
            {t("waitCard")}
          </p>
        ) : (
          <p data-testid="pos-pay-intent-wait" className="text-[12.5px] leading-[1.45] text-[color:var(--color-ink-soft)]">
            {t("staticHint")}
          </p>
        )}
        {it.kind === "CARD_BEAM" ? (
          it.qrPayload ? (
            <a
              data-testid="pos-pay-intent-open-link"
              href={it.qrPayload}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost inline-flex h-11 self-start rounded-[11px] px-4 text-[14px]"
            >
              {t("openLink")}
            </a>
          ) : null
        ) : (
          <div className="flex flex-col gap-1">
            <button
              data-testid="pos-pay-intent-manual"
              type="button"
              className="btn btn-ghost h-11 self-start rounded-[11px] px-4 text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!manualAllowed || h.confirming}
              title={!manualAllowed ? t("managerOnly") : undefined}
              onClick={() => void h.confirmManual()}
            >
              {h.confirming ? t("manualBusy") : t("manual")}
            </button>
            {!manualAllowed && <small className="text-[12px] text-[color:var(--color-muted)]">{t("managerOnly")}</small>}
          </div>
        )}
        {h.secondsLeft !== null && (
          <small data-testid="pos-pay-intent-countdown" className="text-[12px] tabular-nums text-[color:var(--color-muted)]">
            {t("expiresIn", { time: mmss(h.secondsLeft) })}
          </small>
        )}
      </div>
    );
  } else if (h.error) {
    body = (
      <div className="flex flex-col gap-2">
        <p data-testid="pos-pay-intent-error" data-code={h.error.code} role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
          {tp(h.error.key)}
        </p>
        {h.error.code !== "CARD_UNAVAILABLE" && (
          <button data-testid="pos-pay-intent-retry" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-4 text-[14px]" onClick={h.regenerate}>
            {t("retry")}
          </button>
        )}
      </div>
    );
  } else {
    body = waiting ? null : (
      <p data-testid="pos-pay-intent-loading" className="text-[12.5px] text-[color:var(--color-muted)]">
        {t("creating")}
      </p>
    );
  }
  // ข้อผิดพลาดหลังมีใบแล้ว (เช่น ยืนยันเองถูกปฏิเสธ) แสดงใต้สถานะ
  const lateErr = it && h.error && !notConfigured ? h.error : null;
  const qrOn = !!it?.qrPayload && it.status !== "CANCELLED" && !setup.discountOverCap;

  return (
    <div
      data-testid="pos-pay-intent"
      data-kind={it?.kind ?? ""}
      data-status={it?.status ?? (h.creating ? "CREATING" : "")}
      className="flex items-center gap-5 rounded-[12px] border bg-[color:var(--color-surface)] p-[14px] max-md:flex-col xl:gap-[31px]"
    >
      <div className={`relative shrink-0 ${it && it.status !== "PENDING" && it.status !== "PAID" ? "opacity-40" : ""}`}>
        {qrOn ? (
          <PromptPayQr payload={it!.qrPayload} size={146} />
        ) : (
          <div aria-hidden className="grid size-[170px] place-items-center rounded-xl border bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]">
            <RegisterIcon name={method === "CARD" ? "card" : "qr"} size={28} />
          </div>
        )}
      </div>
      {/* ภาพ 02: แผงสูง ≈ 200 — QR 170 ซ้าย · ข้อความ/ปุ่ม/อายุ QR ซ้อนในคอลัมน์ขวา (แก้รอบ 2 · แป้นตัวเลขต้องพอดีจอ 1440×900 / 1024×768) */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 max-md:items-center max-md:text-center">
        <div className="text-[12px] text-[color:var(--color-muted)]">{title}</div>
        <div className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] tabular-nums">{moneyText(shown)}</div>
        {body}
        {lateErr && (
          <p data-testid="pos-pay-intent-error" data-code={lateErr.code} role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
            {tp(lateErr.key)}
          </p>
        )}
      </div>
    </div>
  );
}
