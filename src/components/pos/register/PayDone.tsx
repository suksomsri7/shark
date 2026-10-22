"use client";

// PayDone.tsx — จอสำเร็จหลังชำระครบ (POS P1.6 U · ภาพ 02b) — แทน SaleDone ชั่วคราวของ P1.3
//   วงกลมหมึก + ถูก · "ชำระแล้ว ฿X" 30 หนา · กล่องตัวเลข (เงินทอน · เลขใบเสร็จ · วิธีชำระ) · ปุ่ม "ขายต่อ (อัตโนมัติ 5 วินาที)"
//   ช่องที่ภาพมีแต่ยังไม่มีงานรองรับ: แต้มที่ได้ (P1.12) · ใบกำกับอย่างย่อ (P1.13) · สถานะลงบัญชี · QR ใบเสร็จบนจอ — ไม่แสดง
// POS P1.11U ▸ แถวส่งใบเสร็จ (ภาพ 02b): "ส่งทาง LINE" (เปิดเมื่อบิลมีสมาชิก) · "ส่งอีเมล" (แผ่นช่องเดียวในจอนี้ · ว่าง = อีเมลสมาชิก) ข้างปุ่มพิมพ์ ·
//   sendReceiptAction · ผล/คำปฏิเสธเป็นข้อความใต้ปุ่ม · นับถอยหลัง 5 วินาทีหยุดระหว่างแผ่นอีเมลเปิด/กำลังส่ง ◂
// POS P1.10 U ▸ ปุ่ม "พิมพ์ใบเสร็จ" (receiptPayloadAction — ต้นฉบับภายใน 30 นาที · จอเชื่อ payload.copy) + "พิมพ์สำเนา" (reprintReceiptAction · audit)
//   ผ่าน printReceipt ตามค่าตั้งเครื่องนี้ (heartbeat) · autoPrint + จับคู่ USB/BT แล้ว = พิมพ์เองครั้งเดียวต่อบิล (กันด้วย saleId ใน ref) ·
//   พิมพ์ไม่สำเร็จ = กล่องคำปฏิเสธ + "พิมพ์ซ้ำ" (+ "พิมพ์ผ่านระบบแทน") และหยุดนับถอยหลัง · ลิ้นชักเปิดใน encodeEscPos (เงินสด + drawerKick) ไม่มีปุ่มแยก ◂
//   "สำเร็จ" = หมึกตัวหนา + ไอคอนถูก (ไม่ใช่สีเขียว — UI_STANDARD §0.1) · ปุ่มถัดไปโฟกัสรอ (Enter = ขายต่อ)
// 🔴 duplicated:true ก็คือขายสำเร็จบิลเดิม · ปิดด้วยม่าน/Esc ไม่ได้
// 🔴 มติผู้คุมงาน (7 ต.ค. Q2): นับถอยหลัง 5 วินาทีแล้วไปบิลถัดไปเอง (ภาพ 02b) เฉพาะเมื่อไม่มีเงินทอน (ทอน 0) ·
//    มีเงินทอน = จอค้างจนกด Enter/ปุ่ม "ขายต่อ" (แคชเชียร์ต้องอ่านยอดทอนให้ทัน)
// POS P2.9U ▸ มติ 7 (02b): บิลที่มีแถวบัตรของขวัญ/เครดิตร้าน ⇒ ช่อง "ชำระด้วย" เป็นรายบรรทัดจาก payload ใบเสร็จ (payments[].card: เลขปิดบัง ·
//   ยอดหลังรายการ) "บัตรของขวัญ GC-••••1234 ฿325 · คงเหลือ ฿175" · "เครดิตร้าน SC-•••• ฿x" + "ทิป ฿x" เมื่อ > 0 ·
//   อ่าน receiptPayloadAction ครั้งเดียว (บิลสด ≤ 30 นาที = ต้นฉบับ ไม่เขียน audit · บิลซ้ำ duplicated = ไม่อ่าน) · ตัวเรนเดอร์ใบเสร็จไม่แก้ ◂
// POS P2.9bU ▸ มติ 6 (02b บิลที่ใช้มัดจำ): บรรทัด "มัดจำ #<เลขใบรับ> ฿x · คงเหลือ ฿y" จาก payload ใบเสร็จ payments[].deposit (receiptNo · remainingAfterSatang) ◂

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText, type RegisterPayMethod, type RegisterPayType } from "@/lib/modules/pos/register-shared";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { receiptPayloadAction, reprintReceiptAction } from "@/lib/modules/pos/receipt-actions";
import { receiptRefusalMessageKey, type ReceiptPayment } from "@/lib/modules/pos/receipt-render";
import { sendReceiptAction } from "@/lib/modules/pos/receipt-send-actions";
import { RECEIPT_EMAIL_RE } from "@/lib/modules/pos/receipt-public-shared";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt, printerPaired } from "@/components/pos/print/printReceipt";
import type { PrintResult } from "@/components/pos/print/types";
import { kdsQueueNoAction, kitchenSlipPayloadAction } from "@/lib/modules/pos/kds-actions"; // POS P2.6U ▸ มติ 10: "คิว N" · fix1 F2: ใบครัวหลังขาย ◂
import { kitchenSlipSettings } from "@/lib/modules/pos/device-shared"; // POS P2.6U ▸ fix1 F2 ◂
import type { KitchenSlip } from "@/lib/modules/pos/kds-shared"; // POS P2.6U ▸ fix1 F2 ◂
import { printKitchenSlips } from "@/components/pos/kds/kds-print"; // POS P2.6U ▸ fix1 F2 ◂
import { RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

const AUTO_SECONDS = 5;
const PAY_LABEL: Record<RegisterPayType, string> = { CASH: "pay.cash", PROMPTPAY: "pay.promptpay", TRANSFER: "pay.transfer", CARD: "pay.card", PLATFORM: "pay.platform", GIFT_CARD: "pay.giftCard", STORE_CREDIT: "pay.storeCredit", DEPOSIT: "pay.deposit" }; // POS P2.1 ▸ PLATFORM ◂ · POS P2.9 ▸ STORE_CREDIT ◂ · POS P2.9b ▸ DEPOSIT ◂

type Props = {
  receiptNo: string | null;
  totalSatang: number;
  changeSatang: number;
  payMethods: RegisterPayMethod[];
  onNext: () => void;
  /** POS P1.10 U ▸ พิมพ์ใบเสร็จของบิลนี้ */
  systemId: string;
  saleId: string;
  printer: { config: PosPrinterConfig; deviceCode: string | undefined };
  locale: "th" | "en";
  /** POS P1.11U ▸ บิลนี้มีสมาชิก (เปิดปุ่มส่งทาง LINE) */
  memberAttached?: boolean;
  /** POS P1.13U ▸ มติ 5: บิลส่งไปพร้อมผู้ซื้อใบกำกับเต็มรูป ⇒ ช่อง "ใบกำกับเต็มรูป · กำลังออกในบัญชี" (consumer ออกเอง · ไม่ poll) ◂ */
  taxInvoicePending?: boolean;
  /**
   * POS P1.12U ▸ มติ 9: ผล submit ของบิลที่มีสมาชิก ⇒ ช่อง "แต้มที่ได้รับ {pointsExpected} แต้ม (รวม {balanceAfterBurn + expected})" หลังเงินทอน
   *   ตัวเลขเป็นค่าที่คาด (quote.pointsToEarn) — แต้มจริงเขียนหลังคิว pos.sale.paid ระบาย (ไม่ poll) ◂
   */
  member?: { pointsBurned: number; pointsExpected: number; pointsBalanceAfterBurn: number };
  /** POS P2.6U ▸ มติ 10: สาขาของบิล — ส่งมา = ถามเลขคิวครัวของบิล (≤ 3 ครั้ง × 1 วิ) แล้วแสดง "คิว N" (ไม่มีรอบ = ไม่แสดง) ◂ */
  unitId?: string;
  /** POS P2.9U ▸ มติ 7: ทิปของบิล (บรรทัด "ทิป ฿x" เมื่อ > 0) · duplicated = บิลเดิมของคีย์ (ไม่อ่าน payload — กันสำเนา/audit ของบิลเก่า) ◂ */
  tipSatang?: number;
  duplicated?: boolean;
  /** POS P3.7U ▸ CD-P37U-7: settings.pos.chat.receiptAuto (หน้าเพจส่ง) — เปิด ∧ บิลมีสมาชิก = ชิป "ส่งใบเสร็จทาง LINE อัตโนมัติ" (ป้ายสถานะ ไม่ใช่ "ส่งแล้ว") ◂ */
  chatReceiptAuto?: boolean;
};

/** POS P2.6U ▸ fix1 F2: บิลที่สั่งพิมพ์ใบครัวหลังขายไปแล้ว (ระดับโมดูล — ครั้งเดียวต่อบิล) ◂ */
const kitchenPrinted = new Set<string>();
/** บิลที่สั่งพิมพ์อัตโนมัติไปแล้ว (ระดับโมดูล — จอสำเร็จถูกวาดใหม่/StrictMode ก็ไม่พิมพ์ซ้ำ) */
const autoPrinted = new Set<string>();
/**
 * แก้รอบ 1 F1/F2: บิลที่พิมพ์ใบต้นฉบับสำเร็จแล้ว (ระดับโมดูล · ฝั่ง client) —
 *   ยังไม่มี = ปุ่ม "พิมพ์ใบเสร็จ" (receiptPayloadAction) + เปิดลิ้นชักได้ (ใบต้นฉบับใบแรก) ·
 *   มีแล้ว = ปุ่มกลายเป็น "พิมพ์ซ้ำ" (reprintReceiptAction · สำเนา + audit) และไม่เปิดลิ้นชักอีก
 */
const printedOriginal = new Set<string>();

export function PayDone({ receiptNo, totalSatang, changeSatang, payMethods, onNext, systemId, saleId, printer, locale, memberAttached = false, taxInvoicePending = false, member, unitId, tipSatang = 0, duplicated = false, chatReceiptAuto = false /* POS P3.7U ◂ */ }: Props) {
  const t = useTranslations("pos.register");
  // ── POS P2.9U ▸ มติ 7: แถวบัตรของบิล (เลขปิดบัง · ยอดหลังรายการ) จาก payload ใบเสร็จ — ครั้งเดียวต่อบิล ◂
  const hasCards = payMethods.some((m) => m.type === "GIFT_CARD" || m.type === "STORE_CREDIT" || m.type === "DEPOSIT"); // POS P2.9bU ▸ + มัดจำ ◂
  const [cardPays, setCardPays] = useState<ReceiptPayment[] | null>(null);
  useEffect(() => {
    if (!hasCards || duplicated || !saleId) return;
    let live = true;
    receiptPayloadAction({ systemId, saleId })
      .then((r) => {
        if (live && r.ok) setCardPays(r.payload.payments);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hasCards, duplicated, systemId, saleId]);
  // POS P2.6U ▸ มติ 10: รอบครัวสร้างหลัง commit ⇒ ถาม ≤ 3 ครั้ง ห่าง 1 วิ · ได้เลข = หยุด · ไม่ได้ = ไม่แสดงอะไร ◂
  const [queueNo, setQueueNo] = useState<number | null>(null);
  const [kitchenErr, setKitchenErr] = useState<string | null>(null); // POS P2.6U ▸ fix1 F2 ◂
  /** POS P2.6U ▸ fix1 F2 (17B "พิมพ์หลังขายที่เครื่องนี้"): ใบครัวของรอบนี้ ครั้งเดียวต่อบิล · เฉพาะสถานีที่เลือก · พังไม่บล็อกจอ (ข้อความบรรทัดเดียว) ◂ */
  const printKitchen = async (orderId: string) => {
    const ks = kitchenSlipSettings(printer.config);
    if (ks.mode !== "after-sale" || !unitId || kitchenPrinted.has(saleId)) return;
    kitchenPrinted.add(saleId);
    const slips: KitchenSlip[] = [];
    for (const stationId of ks.stationIds.length ? ks.stationIds : [undefined]) {
      const r = await kitchenSlipPayloadAction({ systemId, unitId, orderId, ...(stationId ? { stationId } : {}), locale }).catch(() => null);
      if (r && r.ok === true) slips.push(...r.slips);
    }
    if (!slips.length) return;
    const res = await printKitchenSlips(slips, printer.config, locale);
    if (!res.ok) setKitchenErr(t("done.kitchenPrintFailed", { reason: tp(`errors.${res.code}`) }));
  };
  useEffect(() => {
    if (!unitId || !saleId) return;
    let live = true;
    void (async () => {
      let kitchen = true; // POS P2.14 ▸ UI-8: บิลมีบรรทัดที่เข้าครัว (จากเซิร์ฟเวอร์ · ถามไม่ได้ = ถือว่ามี — เตือนแบบเดิม) ◂
      for (let i = 0; i < 3 && live; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1000));
        const r = await kdsQueueNoAction({ systemId, unitId, saleId }).catch(() => null);
        if (!live) return;
        if (r && r.ok === true) kitchen = r.kitchen !== false; // POS P2.14 ▸ UI-8 ◂
        if (r && r.ok === true && r.queueNo !== null) {
          setQueueNo(r.queueNo);
          if (r.orderId) void printKitchen(r.orderId).catch(() => undefined); // POS P2.6U ▸ fix1 F2 ◂
          return;
        }
        if (r && r.ok !== true) return;
      }
      // POS P2.6U ▸ fix2 N1: ถาม 3 ครั้งไม่ได้รอบ ขณะเครื่องนี้ตั้งพิมพ์ใบครัวหลังขาย = บอกว่าใบครัวไม่ออก (ไม่บล็อกจอ · ร้านที่ไม่ใช้ใบครัวไม่เห็น) ◂
      if (live && kitchen && kitchenSlipSettings(printer.config).mode === "after-sale") setKitchenErr(t("done.kitchenNoTicket")); // POS P2.14 ▸ UI-8: บิลไม่มีบรรทัดครัว = ไม่เตือน ◂
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- POS P2.6U ▸ fix1 F2: printKitchen อ่านค่าตั้งเครื่องตอนได้รอบ (ครั้งเดียวต่อบิล) ◂
  }, [systemId, unitId, saleId]);
  const tm = useTranslations("pos.member");
  const tp = useTranslations("pos.print");
  const trc = useTranslations("pos.receipt");
  const tchat = useTranslations("pos.chat"); // POS P3.7U ▸ CD-P37U-7 ◂
  const [printing, setPrinting] = useState<"receipt" | "copy" | null>(null);
  const [printRes, setPrintRes] = useState<PrintResult | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [lastKind, setLastKind] = useState<"receipt" | "copy">("receipt");
  const [printed, setPrinted] = useState(() => printedOriginal.has(saleId));
  const print = async (kind: "receipt" | "copy", forceBrowser = false) => {
    if (printing) return;
    // F2: ต้นฉบับพิมพ์ไปแล้ว ⇒ "พิมพ์ใบเสร็จ"/ลองซ้ำ = พิมพ์ซ้ำผ่าน reprintReceiptAction (สำเนา + audit)
    const original = kind === "receipt" && !printedOriginal.has(saleId);
    setPrinting(kind);
    setLastKind(kind);
    setLoadErr(null);
    setPrintRes(null);
    try {
      const r = original ? await receiptPayloadAction({ systemId, saleId }) : await reprintReceiptAction({ systemId, saleId });
      if (!r.ok) {
        setLoadErr(trc(receiptRefusalMessageKey(r.code)));
        return;
      }
      const cfg = forceBrowser ? { ...printer.config, mode: "browser" as const } : printer.config;
      // F1: ลิ้นชักเฉพาะใบต้นฉบับใบแรกของบิล (ไม่ใช่สำเนาตามกฎ 30 นาที) — สำเนา/พิมพ์ซ้ำ = false เสมอ
      const kickDrawer = original && cfg.drawerKick && !r.payload.copy;
      const res = await printReceipt(r.payload, cfg, { locale, deviceCode: printer.deviceCode, kickDrawer });
      if (res.ok && original) {
        printedOriginal.add(saleId);
        setPrinted(true);
      }
      setPrintRes(res);
    } catch {
      setLoadErr(trc("errors.internal"));
    } finally {
      setPrinting(null);
    }
  };
  const printRef = useRef(print);
  printRef.current = print;
  useEffect(() => {
    if (!saleId || autoPrinted.has(saleId)) return;
    if (!printer.config.autoPrint || !printerPaired(printer.config.mode, printer.deviceCode)) return;
    autoPrinted.add(saleId);
    void printRef.current("receipt");
  }, [saleId, printer.config.autoPrint, printer.config.mode, printer.deviceCode]);
  // ── POS P1.11U ▸ ส่งใบเสร็จ ──
  const [sendBusy, setSendBusy] = useState<"LINE" | "EMAIL" | null>(null);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const send = async (via: "LINE" | "EMAIL") => {
    if (sendBusy) return;
    const to = emailTo.trim();
    if (via === "EMAIL" && to && !RECEIPT_EMAIL_RE.test(to)) return setSendMsg({ ok: false, text: trc("send.emailInvalid") });
    setSendBusy(via);
    setSendMsg(null);
    try {
      const r = await sendReceiptAction({ systemId, saleId, via, ...(via === "EMAIL" && to ? { email: to } : {}) });
      if (!r.ok) return setSendMsg({ ok: false, text: trc(receiptRefusalMessageKey(r.code)) });
      setSendMsg({ ok: true, text: trc(via === "LINE" ? "send.sentLine" : "send.sentEmail") });
      if (via === "EMAIL") setEmailOpen(false);
    } catch {
      setSendMsg({ ok: false, text: trc("errors.internal") });
    } finally {
      setSendBusy(null);
    }
  };
  const failed = !!loadErr || (!!printRes && !printRes.ok);
  // P1.11U: นับถอยหลังหยุดระหว่างแผ่นอีเมลเปิด/กำลังส่ง (กลับมานับต่อเมื่อปิด)
  const auto = changeSatang === 0 && !failed && !printing && !emailOpen && !sendBusy;
  const [left, setLeft] = useState(AUTO_SECONDS);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [auto]);
  useEffect(() => {
    if (auto && left <= 0) nextRef.current();
  }, [auto, left]);
  const paidBy = payMethods.map((m) => `${t(PAY_LABEL[m.type])} ${moneyText(m.amountSatang)}`).join(" · ");
  // POS P2.9U ▸ มติ 7: บรรทัดวิธีชำระ (บิลที่มีบัตร/ทิป) — payload มาแล้วใช้แถวของบิลจริง · ยังไม่มา = แถวที่ส่ง (ยังไม่มีเลขปิดบัง) ◂
  const payLines: string[] =
    hasCards || tipSatang > 0
      ? [
          ...((cardPays ?? payMethods) as (ReceiptPayment | RegisterPayMethod)[]).map((m) => {
            const label = Object.prototype.hasOwnProperty.call(PAY_LABEL, m.type) ? t(PAY_LABEL[m.type as RegisterPayType]) : String(m.type);
            const c = "card" in m ? m.card : undefined;
            const dep = "deposit" in m ? m.deposit : undefined; // POS P2.9bU ▸ มติ 6 ◂
            return c
              ? [`${label} ${c.numberMasked} ${moneyText(m.amountSatang)}`, ...(c.kind === "GIFT" ? [t("pay.gc.rowLeft", { amount: moneyText(c.balanceAfterSatang) })] : [])].join(" \u00b7 ")
              : dep
                ? [`${label} #${dep.receiptNo} ${moneyText(m.amountSatang)}`, t("pay.gc.rowLeft", { amount: moneyText(dep.remainingAfterSatang) })].join(" \u00b7 ")
                : `${label} ${moneyText(m.amountSatang)}`;
          }),
          ...(tipSatang > 0 ? [`${t("done.tip")} ${moneyText(tipSatang)}`] : []),
        ]
      : [];
  const cell = "flex min-w-[150px] flex-col gap-[3px] px-5 py-[11px] max-md:border-t max-md:first:border-t-0 md:border-l md:first:border-l-0";
  return (
    <RegisterDialog onDismiss={() => undefined}>
      <div
        data-testid="pos-reg-done"
        className="relative flex max-h-[88dvh] w-full flex-col items-center gap-5 overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 text-center shadow-xl md:w-auto md:min-w-[560px] md:max-w-[calc(100vw-32px)] md:gap-[31px] md:rounded-[22px] md:px-10 md:py-9"
        role="dialog"
        aria-modal="true"
        aria-label={t("done.title")}
      >
        <SheetGrab />
        <span className="mt-2 grid size-[52px] place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)] md:mt-0">
          <RegisterIcon name="check" size={26} strokeWidth={2.4} />
        </span>
        <h2 className="text-[26px] font-bold tracking-[-0.02em] tabular-nums md:text-[30px]">{t("done.paid", { amount: moneyText(totalSatang) })}</h2>
        <div className="flex w-full overflow-hidden rounded-[12px] border text-left max-md:flex-col md:w-auto">
          <div className={cell}>
            <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("pay.change")}</span>
            <span data-testid="pos-reg-done-change" className="text-[15px] font-bold tabular-nums">
              {moneyText(changeSatang)}
            </span>
          </div>
          {member && (
            <div className={cell} title={tm("done.expectedNote")}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{tm("done.pointsLabel")}</span>
              <span
                data-testid="pos-member-done-points"
                className="text-[15px] tabular-nums text-[color:var(--color-ink-soft)] [&_b]:font-bold [&_b]:text-[color:var(--color-ink)]"
                aria-label={tm("done.pointsEarned", { points: member.pointsExpected.toLocaleString("th-TH"), total: (member.pointsBalanceAfterBurn + member.pointsExpected).toLocaleString("th-TH") })}
              >
                {tm.rich("done.pointsValue", {
                  points: member.pointsExpected.toLocaleString("th-TH"),
                  total: (member.pointsBalanceAfterBurn + member.pointsExpected).toLocaleString("th-TH"),
                  b: (c) => <b>{c}</b>,
                })}
              </span>
            </div>
          )}
          <div className={cell}>
            <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.receiptNo")}</span>
            <span data-testid="pos-reg-done-receipt" className="text-[15px] font-bold tabular-nums">
              {receiptNo ?? "-"}
            </span>
          </div>
          {queueNo !== null && ( // POS P2.6U ▸ มติ 10 ◂
            <div className={cell}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.kitchenLabel")}</span>
              <span data-testid="pos-reg-done-queue" className="text-[15px] font-bold tabular-nums">
                {t("done.queue", { n: queueNo })}
              </span>
            </div>
          )}
          {payLines.length > 0 ? (
            // POS P2.9U ▸ มติ 7: บรรทัดละวิธี (บัตรของขวัญ + คงเหลือ · เครดิตร้าน · ทิป) ◂
            <div className={cell}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.paidBy")}</span>
              <span data-testid="pos-reg-done-pay-lines" className="flex flex-col text-[14px] font-bold tabular-nums">
                {payLines.map((x, i) => (
                  <span key={i}>{x}</span>
                ))}
              </span>
            </div>
          ) : paidBy ? (
            <div className={cell}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.paidBy")}</span>
              <span className="text-[15px] font-bold tabular-nums">{paidBy}</span>
            </div>
          ) : null}
          {taxInvoicePending && (
            <div className={cell}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("taxInvoice.doneLabel")}</span>
              <span data-testid="pos-taxinv-done" className="text-[15px] font-bold">
                {t("taxInvoice.donePending")}
              </span>
            </div>
          )}
        </div>
        {/* POS P3.7U ▸ CD-P37U-7: ส่งใบเสร็จทาง LINE อัตโนมัติ (ป้ายสถานะ — คิวส่งทีหลัง · สมาชิกอาจไม่มี LINE) · ปุ่มส่งทาง LINE เดิมยังอยู่ (ส่งซ้ำ = P1.11) ◂ */}
        {chatReceiptAuto && memberAttached && (
          <p data-testid="pos-reg-done-line-auto" className="inline-flex items-center gap-1.5 rounded-[9px] border border-dashed px-3 py-1.5 text-[13px] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="link" size={13} />
            {tchat("notify.receipt")}
          </p>
        )}
        {kitchenErr && ( // POS P2.6U ▸ fix1 F2: ใบครัวหลังขายพิมพ์ไม่สำเร็จ (ไม่บล็อกจอ) ◂
          <p data-testid="pos-reg-done-kitchen-error" role="status" className="w-full text-left text-[13px] text-[color:var(--color-danger)]">
            {kitchenErr}
          </p>
        )}
        {loadErr && (
          <p data-testid="pos-print-load-error" role="alert" className="w-full rounded-[13px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-2 text-left text-[13.5px]">
            {loadErr}
          </p>
        )}
        {printRes && <PrintStatus result={printRes} variant="toast" /* POS P2.14 ▸ UI-1 (19ค) ◂ */ onRetry={() => void print(lastKind)} onBrowser={() => void print(lastKind, true)} />}
        <div className="flex w-full flex-col-reverse gap-[10px] md:w-auto md:flex-row md:items-center md:justify-center">
          <button
            data-testid="pos-print-receipt"
            className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60"
            type="button"
            disabled={!!printing}
            onClick={() => void print("receipt")}
          >
            <RegisterIcon name="print" size={15} />
            {printing === "receipt" ? tp("printing") : printed ? tp("reprint") : tp("receipt")}
          </button>
          <button
            data-testid="pos-print-copy"
            className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60"
            type="button"
            disabled={!!printing}
            onClick={() => void print("copy")}
          >
            <RegisterIcon name="doc" size={15} />
            {printing === "copy" ? tp("printing") : tp("copy")}
          </button>
          {/* POS P1.11U ▸ ส่งทาง LINE · ส่งอีเมล (ภาพ 02b) ◂ */}
          <button
            data-testid="pos-receipt-send-paydone-line"
            className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60"
            type="button"
            disabled={!memberAttached || !!sendBusy}
            onClick={() => void send("LINE")}
          >
            <RegisterIcon name="link" size={15} />
            {sendBusy === "LINE" ? trc("public.sending") : trc("send.lineVia")}
          </button>
          <button
            data-testid="pos-receipt-send-paydone-email"
            className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60"
            type="button"
            disabled={!!sendBusy}
            aria-expanded={emailOpen}
            onClick={() => {
              setSendMsg(null);
              setEmailOpen((v) => !v);
            }}
          >
            <RegisterIcon name="mail" size={15} />
            {trc("send.email")}
          </button>
          <button
            data-testid="pos-reg-done-next"
            className="btn btn-primary h-14 w-full gap-2 rounded-[16px] px-6 text-[16px] font-bold md:h-12 md:w-auto md:min-w-[210px] md:rounded-[13px]"
            type="button"
            autoFocus
            onClick={onNext}
          >
            {t("done.nextShort")}
            {auto && <span className="font-normal opacity-70">{t("done.auto", { sec: Math.max(left, 0) })}</span>}
          </button>
        </div>
        {emailOpen && (
          <form
            data-testid="pos-receipt-send-paydone-email-form"
            noValidate
            className="flex w-full flex-col gap-2 rounded-[13px] border p-4 text-left md:w-[420px]"
            onSubmit={(e) => {
              e.preventDefault();
              void send("EMAIL");
            }}
          >
            <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-ink-soft)]">
              {trc("send.emailLabel")}
              <input
                type="email"
                data-testid="pos-receipt-send-paydone-email-input"
                autoFocus
                maxLength={200}
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="input h-11 text-[15px]"
              />
            </label>
            <span className="text-[12px] text-[color:var(--color-muted)]">{trc("send.emailHint")}</span>
            <div className="flex gap-2">
              <button data-testid="pos-receipt-send-paydone-email-close" type="button" className="btn btn-ghost h-11 flex-1 rounded-[12px]" onClick={() => setEmailOpen(false)}>
                {trc("send.close")}
              </button>
              <button data-testid="pos-receipt-send-paydone-email-submit" type="submit" disabled={!!sendBusy} className="btn btn-primary h-11 flex-1 rounded-[12px] disabled:opacity-60">
                {sendBusy === "EMAIL" ? trc("public.sending") : trc("send.submit")}
              </button>
            </div>
          </form>
        )}
        {sendMsg && (
          <p data-testid="pos-receipt-send-paydone-result" role={sendMsg.ok ? "status" : "alert"} className={`text-[13.5px] ${sendMsg.ok ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-danger)]"}`}>
            {sendMsg.text}
          </p>
        )}
      </div>
    </RegisterDialog>
  );
}
