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
// POS P1.12U ▸ ส่วนสิทธิ์สมาชิก (memberSection = PayBenefits) ระหว่างยอดกับแถวแยกจ่าย · ชิป "{ชื่อ} · {ระดับ}" บนหัว ·
//   รายละเอียดยอดเพิ่มคูปอง/ระดับ/ว่อชเชอร์/แต้ม ตามลำดับภาพ 02 · แถวช่องที่ 2 (ว่อชเชอร์/บัตรของขวัญ · มัดจำ · ลงบิลห้องพัก · เครดิตร้าน)
//   ปิดเสมอ "เร็ว ๆ นี้" (CD3 · P2.9) ไม่มีผลกับยอด/แป้นตัวเลข · เลิกปุ่ม "ถอดสมาชิก" ของ MEMBER_RIGHTS_UNSUPPORTED (คีย์คงไว้) ◂
// POS P2.1U ▸ มติ 6 (R5): บิลของช่องทาง payout PLATFORM (quote.channel — ถึงได้ทางบิลพักที่มี channelId / P2.8) = ช่อง "แพลตฟอร์ม"
//   เลือกไว้แล้วเต็มยอด · ช่องอื่นปิด · แป้น/ปุ่มด่วน/ทิปปิด (แถวเดียว = ยอดบิล) · ช่องทางอื่น = ไม่มีช่องนี้เลย ◂
// POS P2.9U ▸ แถวช่องที่ 2 เป็นวิธีชำระจริง (มติผู้คุม P2.9U 1–7 · หน้าขายส่ง tenders มาเท่านั้น — โต๊ะ/ออเดอร์ = ปิด "เร็ว ๆ นี้" แบบเดิม):
//   บัตรของขวัญ (registerPayTendersAction ครั้งเดียวต่อการเปิดกล่อง · ค้นบัตร registerGiftCardLookupAction · จำนวน = min(คงเหลือ, ยอดบัตร) ·
//   PIN = แป้นตัวเลขโหมดปิดบัง · "ใช้บัตรนี้" ⇒ แถว · ≤ 3 ใบไม่ซ้ำ) · เครดิตร้าน (สมาชิกในบิลที่มีเครดิต · ไม่มี PIN · แถวเดียว) ·
//   มัดจำ "เร็ว ๆ นี้" (P2.9b) · ลงบิลห้องพัก = เฉพาะสาขาโรงแรม "เร็ว ๆ นี้" · ทิป = แสดงเมื่อเปิดทิป · จ่ายได้จากแถวเงินจริงเท่านั้น ·
//   🔴 PIN อยู่ใน pinsRef/ช่อง password แบบไม่ควบคุม (ไม่ sync เป็น attribute) ของกล่องนี้เท่านั้น — ไม่ลง storage/URL/console/data-* ·
//      ล้างเมื่อปิดกล่อง/ถอดแถว/GIFT_CARD_CHANGED · คำปฏิเสธบัตร (GIFT_CARD_PIN/LOCKED/CHANGED · STORE_CREDIT_NOT_OWNER) แสดงที่แถว/แบนเนอร์ ◂
// POS P2.9bU ▸ ช่อง "มัดจำที่ชำระไว้" (มติผู้คุม P2.9bU 1–4 · สัญญา S ledger/wo-notes/pos-P2.9b.md §P2.9bU):
//   เปิดเมื่อ registerPayTendersAction().tenders.deposit.enabled (อ่านครั้งเดียวต่อการเปิดกล่องพร้อมช่องอื่น) · ปิด = "ยังไม่เปิดใช้" ·
//   แผงขวา = ค้นมัดจำ (เลขใบเสร็จ / ชื่อ ≥ 3 ตัว · ไม่มีคำใบ้เบอร์) + มัดจำของสมาชิกในบิล (memberId) · แถวไม่มียอด = ค้นซ้ำด้วยเลขใบเสร็จ (+ 4 หลักท้ายเมื่อ needsPhoneLast4) ·
//   จำนวน = min(คงเหลือ, ยอดมัดจำ) แก้ด้วยแป้น · "ใช้มัดจำนี้" ⇒ แถว "มัดจำ #… ฿x ✓ · คงเหลือ ฿y" (คงเหลือ = ยอดค้นล่าสุด − จำนวน · แสดงอย่างเดียว) · ≤ 3 ใบไม่ซ้ำ ·
//   🔴 4 หลักท้ายอยู่ใน last4Ref/ช่อง password แบบไม่ควบคุมของกล่องนี้เท่านั้น (แบบ PIN บัตร) — ไม่ลง storage/URL/console/data-* · ล้างเมื่อปิดกล่อง/ถอดแถว ·
//   คำปฏิเสธ DEPOSIT_* แสดงที่แถว/แบนเนอร์ (ไม่ใช่การ์ดผิดพลาด) · ทิปไม่จ่ายจากมัดจำ (REGISTER_CASH_LIKE_PAY ไม่มี DEPOSIT) ◂

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl"; // POS P3.6U ▸ + useLocale (วันครบกำหนด) ◂
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
  // POS P2.9U ▸ ตัวช่วยบริสุทธิ์ของวิธีชำระบัตร ◂
  GIFT_CARD_PIN_MAX,
  GIFT_CARD_PIN_MIN,
  REGISTER_CASH_LIKE_PAY,
  REGISTER_MAX_GIFT_CARDS,
  giftCardKindOf,
  giftCardNumberKey,
  refusalMessageKey,
  // POS P2.9bU ▸ มัดจำ ◂
  DEPOSIT_INLINE_CODES,
  DEPOSIT_QUERY_MIN,
  REGISTER_MAX_DEPOSITS,
} from "@/lib/modules/pos/register-shared";
import { registerGiftCardLookupAction, registerPayTendersAction } from "@/lib/modules/pos/register-actions"; // POS P2.9U ▸ มติ 1–2 ◂
import { registerDepositLookupAction } from "@/lib/modules/pos/deposit-actions"; // POS P2.9bU ▸ มติ 2 ◂
import { depositBlame } from "./deposit-blame"; // POS HF-FU2 ▸ DEP-1 ◂
import { hundredthsText, parseHundredths } from "./LineEditor";
import { RegisterDialog } from "./RegisterDialog";
import { RegisterIcon, type RegisterIconName } from "./RegisterIcon";
import { PayIntentPanel, usePayIntent, type IntentTarget, type PayIntentSetup } from "./PayIntentPanel";
import { HEAD_OFFICE_BRANCH_CODE, type TaxInvoiceBuyerInput } from "@/lib/modules/pos/tax-invoice-shared";
import type { DisplayPayIn } from "@/lib/modules/pos/display-shared"; // POS P2.10 ▸ จอลูกค้า ◂
// POS P3.6U ▸ CD-P36U-5: ไทล์ "วางบิล (เครดิตเทอม)" — สถานะวงเงินจากเซิร์ฟเวอร์ (ไม่คิดวงเงินฝั่งจอ) · ชนิดวิธีจ่ายกว้าง (ON_ACCOUNT) เฉพาะไฟล์นี้ ◂
import { registerCreditStatusAction } from "@/lib/modules/pos/credit-actions";
import type { RegisterCreditStatus } from "@/lib/modules/pos/credit-shared";
import type { REGISTER_PAY_TYPES } from "@/lib/modules/pos/register-shared";

export type PayPhase = "form" | "sending" | "unknown" | "conflict";
export type PayError = { /** POS HF-FU2 ▸ DEP-1: ใบมัดจำที่คำปฏิเสธ DEPOSIT_* ระบุ (register.ts) ◂ */ depositId?: string; code: string; key: string; values?: Record<string, string | number>; /** POS P2.14 ▸ UI-9: GIFT_CARD_PIN — ลำดับแถวบัตรของขวัญ (เริ่ม 0) + ครั้งที่เหลือ ◂ */ giftCardRow?: number; attemptsLeft?: number };
/** POS P2.14 ▸ UI-9: ส่งแถว/ครั้งที่เหลือของคำปฏิเสธ PIN ต่อให้กล่องจ่าย (ไม่มี = ทุกแถวบัตรใส่ใหม่ตามเดิม) ◂ · POS HF-FU2 ▸ DEP-1: + depositId ของคำปฏิเสธมัดจำ (ผู้เรียกทั้งสามไม่ต้องแก้) ◂ */
export function payErrorPinMeta(refusal: object): Pick<PayError, "giftCardRow" | "attemptsLeft" | "depositId"> {
  const r = refusal as { giftCardRow?: unknown; attemptsLeft?: unknown; depositId?: unknown };
  return {
    ...(typeof r.giftCardRow === "number" ? { giftCardRow: r.giftCardRow } : {}),
    ...(typeof r.attemptsLeft === "number" ? { attemptsLeft: r.attemptsLeft } : {}),
    ...(typeof r.depositId === "string" && r.depositId ? { depositId: r.depositId } : {}), // POS HF-FU2 ▸ DEP-1 ◂
  };
}
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
  /** POS P1.12U: คูปอง · ส่วนลดระดับ · บรรทัดสิทธิ์ (ว่อชเชอร์/แต้ม) จาก quote ของเซิร์ฟเวอร์ */
  couponDiscountSatang?: number;
  tierDiscountSatang?: number;
  memberLines?: { kind: string; discountSatang: number }[];
};

/** POS P1.12U มติ 7: ช่องวิธีชำระแถวที่ 2 — ปิดเสมอ (P2.9) · sub = บรรทัดรองตามภาพ */
const SOON_TILES: { id: "giftcard" | "deposit" | "roomcharge" | "storecredit"; label: string; sub: string | null }[] = [
  { id: "giftcard", label: "pay.tiles.giftcard", sub: null },
  { id: "deposit", label: "pay.tiles.deposit", sub: null },
  { id: "roomcharge", label: "pay.tiles.roomcharge", sub: "pay.tiles.roomchargeSub" },
  { id: "storecredit", label: "pay.tiles.storecredit", sub: "pay.tiles.storecreditSub" },
];

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
  salesHref: string;
  onConfirm: (c: PayChoice) => void;
  onRetry: () => void;
  onClose: () => void;
  onNewBill: () => void;
  /** POS P1.12U ▸ ส่วนสิทธิ์สมาชิก (PayBenefits) · ชิปสมาชิกบนหัว · บัตรของขวัญ (อ่านอย่างเดียว ใต้ช่องว่อชเชอร์/บัตรของขวัญ) ◂ */
  memberSection?: React.ReactNode;
  memberChip?: string | null;
  giftCards?: { numberMasked: string; balanceSatang: number }[];
  /** POS P1.7U ▸ ใบขอรับเงิน (ไม่ส่ง = พร้อมเพย์แบบ QR นิ่ง + ยืนยันเองของ P1.6) */
  intent?: PayIntentSetup | null;
  /** POS P2.1U ▸ มติ 6: ช่องทางของบิลรับเงินผ่านแพลตฟอร์ม (quote.channel.payout = PLATFORM) — null/ไม่ส่ง = ไม่มีช่อง "แพลตฟอร์ม" ◂ */
  platform?: { name: string } | null;
  /** POS P1.13U ▸ สวิตช์ "ออกใบกำกับภาษีเต็มรูป" ท้ายจอ (ภาพ 02) — buyer = ผู้ซื้อที่ตั้งไว้ (สวิตช์เปิด) · ปิดสวิตช์ = onClear · แก้/เปิด = onOpen (กล่อง 15A) ◂ */
  taxInvoice?: { eligible: boolean; buyer: TaxInvoiceBuyerInput | null; onOpen: () => void; onClear: () => void } | null;
  /** POS P2.4U ▸ มติ 8: วิธีจ่ายที่เลือกไว้ตอนเปิด (แจ้งเตือน PAY_PROMPTPAY "ยืนยันรับเงิน" = PROMPTPAY) · ไม่ส่ง = เงินสด (เดิม) · บิลแพลตฟอร์มชนะเสมอ ◂ */
  initialMethod?: RegisterPayType;
  /**
   * POS P2.4U ▸ fix 1 F4 (มติผู้คุม): โหมด "ยืนยันพร้อมเพย์ที่แจ้งจากโต๊ะ" — วิธีจ่ายล็อกที่ initialMethod · แตะวิธีอื่น = onSwitch (ผู้เรียกปิดแล้วเปิดเช็คบิลปกติ) ·
   * managerOnly = ด่านเดียวกับปุ่มยืนยันเองของ QR (manualConfirmRequiresManager และผู้ใช้ไม่มี pos.shift.manage) ⇒ ยืนยัน/แยกจ่ายไม่ได้ ◂
   */
  lockedMethod?: { managerOnly: boolean; onSwitch: (m: RegisterPayType) => void } | null;
  /**
   * POS P2.8U ▸ fix 1 F1: จอที่ไม่มีใบขอรับเงิน (intent = null · รับเงินออเดอร์) — ค่าตั้ง manualConfirmRequiresManager และผู้ใช้ไม่มี pos.shift.manage ⇒
   *   บัตร (EDC) ยืนยัน/แยกจ่ายไม่ได้ด้วยคำใบ้เดียวกับ HF-PP (pay.intent.managerOnly) · ผู้เรียกไม่ส่ง promptpayId (ไม่มี QR นิ่ง) ◂
   */
  manualManagerOnly?: boolean;
  /** POS P2.9U ▸ มติ 1: แถวช่องที่ 2 เป็นวิธีชำระจริง (หน้าขาย) — ไม่ส่ง = ปิดทั้งแถว "เร็ว ๆ นี้" แบบ P1.12U (โต๊ะ/ออเดอร์) ◂ */
  tenders?: { systemId: string; unitId: string } | null;
  /** POS P2.9U ▸ มติ 1 + 5: สมาชิกในบิล + เครดิตร้านของเขา (benefits.giftCards ชนิด STORE_CREDIT ยอด > 0) ◂ */
  member?: { attached: boolean; storeCredit: { numberMasked: string; balanceSatang: number } | null } | null;
  /** POS P2.9U ▸ มติ 2a: สแกนเลขบัตรด้วยกล้อง — ผู้เรียกเปิดชั้นกล้อง แล้วส่งเลขกลับทาง scannedGiftCard (เลขเท่านั้น ไม่ใช่ PIN) ◂ */
  onScanGiftCard?: () => void;
  scannedGiftCard?: { number: string; seq: number } | null;
  /**
   * POS P2.9U ▸ มติ 3: คำขอที่ส่งแบบไม่มี PIN (ลองซ้ำ/โหลดกลับ) ถูกปฏิเสธเพราะคีย์ยังไม่มีบิล ⇒ ใส่ PIN อีกครั้ง ·
   * payMethods = แถวของคำขอนั้น (ใช้สร้างแถวคืนเมื่อกล่องนี้ไม่มีแถว — หลัง reload) ◂
   */
  pinAgain?: { seq: number; payMethods: RegisterPayMethod[]; tipSatang: number; cashReceivedSatang?: number } | null;
  /** POS P2.5U ▸ มติ 7: ชิปหัวจอ "บิล n จาก N · โต๊ะ A5" ของการจ่ายใบแยกบิล (quote.split) — ไม่ส่ง = ไม่มีชิป ◂ */
  splitChip?: string | null;
  /** POS P2.9bU ▸ มติ 2a: สมาชิกในบิล (Customer.id) — แผงมัดจำแสดงมัดจำของสมาชิกนี้ก่อน (registerDepositLookup {memberId}) · ไม่ส่ง = ค้นอย่างเดียว ◂ */
  memberId?: string | null;
  onDisplayPay?: (v: DisplayPayIn | null) => void; // POS P2.10 ▸ จอลูกค้า (มติ 5): ยอด/วิธี/รอบ/ใบขอรับเงินของกล่องนี้ → หน้าขาย (ไม่ส่ง = ไม่มีจอ) ◂
  /**
   * POS P3.6U ▸ CD-P36U-5: ไทล์ "วางบิล (เครดิตเทอม)" — ไม่ส่ง/null = ไม่มีไทล์ (ปิดเครดิต · ออฟไลน์ · โต๊ะ · ร้านไม่มี CRM) ·
   * company = บริษัทของบิล (null = ไทล์บอก "เลือกบริษัท" แล้วเปิดแผ่นเลือก) · buyer = ผู้ซื้อใบกำกับที่ตั้งไว้ · onStatus = สถานะล่าสุด (วันครบกำหนดของจอสำเร็จ) ◂
   */
  onAccount?: {
    systemId: string;
    unitId: string;
    company: { partyId: string; name: string; taxId: string | null } | null;
    requireBuyer: boolean;
    buyer: TaxInvoiceBuyerInput | null;
    onPickCompany: () => void;
    onNeedBuyer: () => void;
    onStatus: (s: RegisterCreditStatus | null) => void;
  } | null;
};
/** POS P3.6U ▸ ชนิดวิธีจ่ายของเซิร์ฟเวอร์ (รวม ON_ACCOUNT — RegisterPayType ของจอยังไม่รวม) · แถววางบิล = แถวเดียวเต็มยอด ◂ */
type AnyPayType = (typeof REGISTER_PAY_TYPES)[number];
const onAccountRow = (amountSatang: number): RegisterPayMethod => ({ type: "ON_ACCOUNT" satisfies AnyPayType, amountSatang }) as unknown as RegisterPayMethod;
type AcctLook = null | { state: "loading" } | { state: "ok"; s: RegisterCreditStatus } | { state: "error"; key: string };
const ddmmyyyy = (ymd: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));

/** แถวที่แยกจ่ายไว้แล้ว (ยังไม่ส่ง) · id = ตัวนับในกล่อง (ไม่ใช่คีย์บิล) */
type PayRow = {
  id: number;
  type: RegisterPayType;
  amountSatang: number;
  reference?: string;
  tenderedSatang?: number;
  /** P1.7U: แถวจากใบขอรับเงินที่ PAID แล้ว — ล็อก (reference = id ของใบ) */
  via?: "WEBHOOK" | "MANUAL" | null;
  /**
   * POS P2.9U ▸ แถวบัตรของขวัญ/เครดิตร้าน: number = เลขที่สแกน/พิมพ์ (ส่งกับคำขอ · เครดิตร้าน = "") · masked/balanceSatang = ผลค้นล่าสุด
   * (balanceSatang null = ยังไม่รู้ — แถวที่สร้างคืนหลัง reload ก่อนค้นใหม่) · note = ข้อความใต้แถว · PIN อยู่ใน pinsRef เท่านั้น ◂
   */
  card?: { number: string; masked: string; balanceSatang: number | null; note?: "pinWrong" | "pinAgain" | null; /** POS P2.14 ▸ UI-9: ครั้งที่เหลือก่อนบัตรถูกระงับ ◂ */ left?: number | null };
  /**
   * POS P2.9bU ▸ แถวมัดจำ: id = PosDeposit.id (ส่งเป็น depositId) · receiptNo = เลขใบรับ (null = แถวที่สร้างคืนหลัง reload) ·
   * remainingSatang = ยอดค้นล่าสุด (null = ไม่รู้) · needsLast4 = ต้องส่ง 4 หลักท้าย (อยู่ใน last4Ref เท่านั้น) · note = ข้อความใต้แถว ◂
   */
  dep?: { id: string; receiptNo: string | null; remainingSatang: number | null; needsLast4: boolean; memberLinked: boolean; l4Checked: boolean; note?: "wrong" | "again" | null };
};
/** POS P2.9U ▸ ผลค้นบัตร (DTO ของ registerGiftCardLookupAction) ◂ */
type GcCard = { numberMasked: string; balanceSatang: number; status: string; expiresAt: string | null; usable: boolean; reason: "SUSPENDED" | "EXPIRED" | "DEPLETED" | "PIN_LOCKED" | null };
type GcLook = null | { state: "loading" } | { state: "found"; card: GcCard } | { state: "notFound" } | { state: "error"; key: string };
/** แผงบัตรของขวัญ (คอลัมน์ขวา) — forRow = ใส่ PIN ใหม่ให้แถวที่มีอยู่ (จำนวนล็อกตามแถว) · target = แป้นตัวเลขกำลังกรอกอะไร */
type GcPanel = { number: string; look: GcLook; amount: string | null; pinLen: number; target: "amount" | "pin"; forRow: number | null; err: string | null };
const GC_EMPTY: GcPanel = { number: "", look: null, amount: null, pinLen: 0, target: "amount", forRow: null, err: null };
type Tenders = Extract<Awaited<ReturnType<typeof registerPayTendersAction>>, { ok: true }>["tenders"];
// ── POS P2.9bU ▸ แผงมัดจำ (มติ 2) ──
/** แถวผลค้นมัดจำ (DTO ของ registerDepositLookupAction — ไม่มีเบอร์เต็ม/4 หลักท้าย) */
type DepDto = Extract<Awaited<ReturnType<typeof registerDepositLookupAction>>, { ok: true }>["deposits"][number];
type DepLook = null | { state: "loading" } | { state: "found"; rows: DepDto[]; byMember: boolean } | { state: "empty" } | { state: "error"; key: string };
/**
 * แผงมัดจำ (คอลัมน์ขวา) — sel = มัดจำที่เลือก (remainingSatang null = ยังไม่เห็นยอด) · verify = กำลังค้นซ้ำ/ผลของ 4 หลักท้าย ·
 * forRow = ใส่ 4 หลักท้ายใหม่ให้แถวที่มีอยู่ · target = แป้นตัวเลขกรอกอะไร · last4Len = ความยาวที่กรอก (ค่าอยู่ใน ref เท่านั้น)
 */
type DepPanel = { query: string; look: DepLook; sel: DepDto | null; verify: "idle" | "loading" | "wrong"; amount: string | null; last4Len: number; target: "amount" | "last4"; forRow: number | null; err: string | null };
const DP_EMPTY: DepPanel = { query: "", look: null, sel: null, verify: "idle", amount: null, last4Len: 0, target: "amount", forRow: null, err: null };
const DEP_LAST4 = 4;
/** คำปฏิเสธของมัดจำ → ข้อความใต้รายการแยกจ่าย (มติ 4) */
const DEP_NOTE_KEY: Record<string, string> = {
  DEPOSIT_NOT_FOUND: "errors.depositNotFound",
  DEPOSIT_CLOSED: "errors.depositClosed",
  DEPOSIT_NOT_OWNER: "errors.depositNotOwner",
  DEPOSIT_LOCKED: "errors.depositLocked",
};
// ◂
/** POS P2.9U ▸ คำปฏิเสธของบัตรที่แสดงที่แถว/แบนเนอร์แทนการ์ดข้อผิดพลาด (มติ 4) ◂ */
const GC_INLINE_CODES: ReadonlySet<string> = new Set(["GIFT_CARD_PIN", "GIFT_CARD_LOCKED", "GIFT_CARD_CHANGED", "STORE_CREDIT_NOT_OWNER"]);
const GC_REASON_KEY: Record<NonNullable<GcCard["reason"]>, string> = {
  SUSPENDED: "pay.gc.reasonSuspended",
  EXPIRED: "pay.gc.reasonExpired",
  DEPLETED: "pay.gc.reasonDepleted",
  PIN_LOCKED: "pay.gc.reasonPinLocked",
};
/** วันหมดอายุ dd/mm/yy (เวลาไทย) — ค่ามาจากเซิร์ฟเวอร์ (ไม่ใช่นาฬิกาเครื่อง · HF-418 ไม่เกี่ยว) */
const ddmmyy = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear() % 100).padStart(2, "0")}`;
};
/** เลขปิดบังสำรอง (แถวที่สร้างคืนก่อนค้นใหม่) — รูปเดียวกับของเซิร์ฟเวอร์ GC-••••1234 */
const maskLocal = (n: string): string => `GC-\u2022\u2022\u2022\u2022${n.replace(/\s+/g, "").slice(-4)}`;

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
/** POS P2.1U ▸ มติ 6: ช่องแพลตฟอร์ม (แสดงเฉพาะบิลช่องทาง payout PLATFORM) ◂ */
const PLATFORM_METHOD: { type: RegisterPayType; label: string; icon: RegisterIconName } = { type: "PLATFORM", label: "pay.platform", icon: "truck" };
// POS P2.9U ▸ + GIFT_CARD (pay.giftCard · tag) · STORE_CREDIT (pay.storeCredit · pig) ◂
// POS P2.9bU ▸ + DEPOSIT (pay.deposit · cheque) ◂
const methodLabelKey = (type: RegisterPayType) =>
  type === "PLATFORM" ? PLATFORM_METHOD.label : type === "GIFT_CARD" ? "pay.giftCard" : type === "STORE_CREDIT" ? "pay.storeCredit" : type === "DEPOSIT" ? "pay.deposit" : (METHODS.find((m) => m.type === type)?.label ?? "pay.cash");
const methodIcon = (type: RegisterPayType): RegisterIconName =>
  type === "PLATFORM" ? PLATFORM_METHOD.icon : type === "GIFT_CARD" ? "tag" : type === "STORE_CREDIT" ? "pig" : type === "DEPOSIT" ? "cheque" : (METHODS.find((m) => m.type === type)?.icon ?? "cash");
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
  const tm = useTranslations("pos.member");
  const tc = useTranslations("common");
  const busy = p.phase !== "form";
  const err = p.error ?? p.quoteError;
  const rowSeq = useRef(0);
  const amountRef = useRef<HTMLInputElement>(null);

  // ═══════ สถานะของกล่อง ═══════
  const [rows, setRows] = useState<PayRow[]>([]);
  // POS P2.1U ▸ มติ 6: บิลแพลตฟอร์มเริ่มที่ช่อง "แพลตฟอร์ม" เต็มยอด (entry null = ยอดคงเหลือพอดี) ◂
  const platformOn = !!p.platform;
  // POS P2.4U ▸ มติ 8: initialMethod (ไม่ใช่เงินสด ⇒ ช่องจำนวนเริ่มที่ยอดคงเหลือพอดีแบบเดียวกับแตะช่องนั้น) ◂
  const firstMethod: RegisterPayType = platformOn ? "PLATFORM" : (p.initialMethod ?? "CASH");
  const [method, setMethod] = useState<RegisterPayType>(firstMethod);
  /** ค่าที่กรอก (บาท ทศนิยม ≤ 2) · null = ใช้ยอดคงเหลือพอดี (ค่าเริ่มของบัตร/โอน/พร้อมเพย์) */
  const [entry, setEntry] = useState<string | null>(firstMethod === "CASH" ? "" : null);
  const [reference, setReference] = useState("");
  const [tipOn, setTipOn] = useState(false);
  const [tipText, setTipText] = useState("");

  const tipParsed = tipOn && !platformOn ? parseHundredths(tipText) : 0;
  const tipOk = tipParsed !== null;
  const tip = tipParsed ?? 0;
  const due = p.dueSatang + tip;
  const paid = rows.reduce((s, r) => s + r.amountSatang, 0);
  const remaining = due - paid;
  const zero = due === 0 && rows.length === 0;
  const cashRow = rows.find((r) => r.type === "CASH") ?? null;
  // ── POS P2.9U ▸ บัตรของขวัญ / เครดิตร้าน / ทิป (มติ 1–7) ──
  /** PIN ของแถวบัตร (rowId → PIN) — หน่วยความจำของกล่องนี้เท่านั้น · ไม่ serialise ที่ใด */
  const pinsRef = useRef(new Map<number, string>());
  /** POS P2.9bU ▸ มติ 3: 4 หลักท้ายของแถวมัดจำ (rowId → 4 หลัก) — หน่วยความจำของกล่องนี้เท่านั้น · ไม่ serialise ที่ใด ◂ */
  const last4Ref = useRef(new Map<number, string>());
  /** PIN ที่กำลังกรอกในแผง (ช่อง password แบบไม่ควบคุม + ค่าใน ref — ไม่ไปเป็น attribute ของ DOM) */
  const gcPinRef = useRef("");
  const gcPinInput = useRef<HTMLInputElement>(null);
  const gcNumberInput = useRef<HTMLInputElement>(null);
  const [gc, setGc] = useState<GcPanel>(GC_EMPTY);
  // POS P2.9bU ▸ แผงมัดจำ — 4 หลักที่กำลังกรอก = ref + ช่อง password แบบไม่ควบคุม (ไม่เป็น attribute ของ DOM) ◂
  const depLast4Ref = useRef("");
  const depLast4Input = useRef<HTMLInputElement>(null);
  const depSearchInput = useRef<HTMLInputElement>(null);
  const [dp, setDp] = useState<DepPanel>(DP_EMPTY);
  const [depBanner, setDepBanner] = useState(false);
  const [depNote, setDepNote] = useState<string | null>(null);
  /** POS P2.9bU ▸ มติ 3: คำขอล่าสุดเป็นการ "ลองซ้ำ" (ชุดที่ถูกตัด 4 หลักท้าย) — DEPOSIT_NOT_OWNER ⇒ "ใส่อีกครั้ง" ไม่ใช่ "ไม่ถูกต้อง" ◂ */
  const sentStripped = useRef(false);
  /** POS P2.9bU ▸ fix1 มติ 1: ชุดแถวมัดจำ (row id) ที่เหลือหลัง DEPOSIT_NOT_OWNER ครั้งก่อน — ซ้ำชุดเดิมหลังใส่ใหม่ = ถอดทั้งหมด (ไม่วนแถวเดิม) ◂ */
  const notOwnerSet = useRef<string | null>(null);
  const [gcBanner, setGcBanner] = useState(false);
  const [gcRowsNote, setGcRowsNote] = useState<string | null>(null);
  const [tenders, setTenders] = useState<Tenders | null>(null);
  /** แป้นตัวเลขกรอกยอดทิป (แตะช่องทิป) แทนช่องจำนวน */
  const [padTip, setPadTip] = useState(false);
  const sc = p.member?.attached ? (p.member.storeCredit ?? null) : null;
  const scBal = sc?.balanceSatang ?? 0;
  const gcRows = rows.filter((r) => r.type === "GIFT_CARD");
  const scRow = rows.find((r) => r.type === "STORE_CREDIT") ?? null;
  const gcMode = method === "GIFT_CARD";
  // POS P2.9bU ▸ มัดจำ: แผงขวาแทนช่องจำนวน (แบบบัตรของขวัญ) — panelMode = รอบนี้เพิ่มแถวด้วยปุ่มของแผงเท่านั้น ◂
  const depMode = method === "DEPOSIT";
  const depRows = rows.filter((r) => r.type === "DEPOSIT");
  const panelMode = gcMode || depMode;
  /** ค่าปริยายของรอบ: เครดิตร้าน = min(คงเหลือ, ยอดเครดิต) · อื่น = คงเหลือพอดี */
  const autoEntry = method === "STORE_CREDIT" ? Math.min(Math.max(remaining, 0), scBal) : Math.max(remaining, 0);
  const entryText = entry ?? hundredthsText(autoEntry);
  const entrySatang = entry === null ? autoEntry : parseHundredths(entry);
  // แผงบัตรของขวัญ: รอบนี้ไม่มีแถวสุดท้ายแบบปกติ (เพิ่มแถวด้วย "ใช้บัตรนี้") · คงเหลือ 0 = ยืนยันได้
  const scOver = method === "STORE_CREDIT" && entrySatang !== null && entrySatang > scBal;
  const plan = panelMode // POS P2.9bU ▸ + มัดจำ ◂
    ? remaining <= 0
      ? { amount: 0, change: 0, state: remaining === 0 ? ("complete" as const) : ("over" as const) }
      : { amount: 0, change: 0, state: "gift" as const }
    : scOver
      ? { amount: 0, change: 0, state: "over" as const }
      : payRoundPlan(remaining, method, entrySatang);
  const rowsFull = rows.length >= REGISTER_MAX_PAY_METHODS - 1;
  const ppMissing = method === "PROMPTPAY" && !p.promptpayId;
  const ready = !busy && p.itemCount > 0 && !p.quotePending && !p.quoteError && tipOk && !ppMissing;
  /** แถวบัตรที่ยังไม่มี PIN (ใส่ใหม่หลังปฏิเสธ/โหลดกลับ) ⇒ ยืนยันไม่ได้ */
  const gcPinMissing = gcRows.some((r) => (pinsRef.current.get(r.id) ?? "").length < GIFT_CARD_PIN_MIN);
  /** POS P2.9bU ▸ มติ 3: แถวมัดจำที่ต้องมี 4 หลักท้ายแต่ยังไม่มี (ใส่ใหม่หลังปฏิเสธ/โหลดกลับ) ⇒ ยืนยันไม่ได้ ◂ */
  const depLast4Missing = depRows.some((r) => !!r.dep?.needsLast4 && (last4Ref.current.get(r.id) ?? "").length !== DEP_LAST4);
  // ── POS P3.6U ▸ CD-P36U-5: วางบิล (เครดิตเทอม) — แถวเดียวเต็มยอด · ไม่มีทิป/แยกจ่าย/เงินรับ · สถานะวงเงินจากเซิร์ฟเวอร์ (ครั้งละคำขอ · ผลล่าสุดชนะ) ──
  const oa = p.onAccount ?? null;
  const locale = useLocale();
  const [acct, setAcct] = useState(false);
  const [acctSt, setAcctSt] = useState<AcctLook>(null);
  const oaParty = oa?.company?.partyId ?? null;
  const oaRef = useRef(oa);
  oaRef.current = oa;
  const dueRef = useRef(p.dueSatang);
  dueRef.current = p.dueSatang;
  const acctBusy = useRef(false);
  const acctAgain = useRef(false);
  const loadAcct = async () => {
    const o = oaRef.current;
    const party = o?.company?.partyId;
    if (!o || !party) return;
    if (acctBusy.current) {
      acctAgain.current = true;
      return;
    }
    acctBusy.current = true;
    try {
      const r = await registerCreditStatusAction({ systemId: o.systemId, unitId: o.unitId, customerPartyId: party, amountSatang: Math.max(0, dueRef.current) });
      if (!acctAgain.current && oaRef.current?.company?.partyId === party) {
        setAcctSt(r.ok ? { state: "ok", s: r } : { state: "error", key: r.code === "CUSTOMER_INVALID" ? "credit.errors.customerInvalid" : refusalMessageKey(r.code) });
        o.onStatus(r.ok ? r : null);
      }
    } catch {
      if (!acctAgain.current) setAcctSt({ state: "error", key: "errors.unknown" });
    } finally {
      acctBusy.current = false;
      if (acctAgain.current) {
        acctAgain.current = false;
        void loadAcct();
      }
    }
  };
  useEffect(() => {
    if (!oa || !oaParty) {
      setAcctSt(null);
      return;
    }
    setAcctSt((s) => (s?.state === "ok" ? s : { state: "loading" }));
    const h = setTimeout(() => void loadAcct(), 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้น = บริษัท/ยอด/การมีไทล์
  }, [!!oa, oaParty, p.dueSatang]);
  const acctNotAllowed = acctSt?.state === "ok" && acctSt.s.enabled && !acctSt.s.allowed;
  const acctHidden = acctSt?.state === "ok" && !acctSt.s.enabled;
  // ไม่มีไทล์/บริษัทหลุด/สถานะไม่อนุญาต ⇒ ออกจากโหมดวางบิล
  useEffect(() => {
    if (acct && (!oa || !oaParty || acctNotAllowed || acctHidden)) setAcct(false);
  }, [acct, oa, oaParty, acctNotAllowed, acctHidden]);
  const buyerTax = (oa?.buyer?.taxId ?? "").replace(/\D/g, "");
  const coTax = (oa?.company?.taxId ?? "").replace(/\D/g, "");
  const acctMismatch = acct && !!buyerTax && !!coTax && buyerTax !== coTax;
  const acctOk =
    acct && !busy && p.itemCount > 0 && !p.quotePending && !p.quoteError && !platformOn && !!oa?.company && acctSt?.state === "ok" && acctSt.s.enabled && acctSt.s.allowed && (!oa.requireBuyer || !!oa.buyer) && rows.every((r) => r.via === undefined);
  // ◂
  // มติ 6: ทิปจ่ายจากแถวเงินจริงเท่านั้น (CASH/PROMPTPAY/TRANSFER/CARD) · รอบสุดท้ายที่เป็นเงินจริงนับด้วย
  const cashLikeRows = rows.filter((r) => REGISTER_CASH_LIKE_PAY.has(r.type)).reduce((t, r) => t + r.amountSatang, 0);
  const cashLikeNow = REGISTER_CASH_LIKE_PAY.has(method) && remaining > 0 ? remaining : 0;
  const tipAllowed = !acct /* POS P3.6U ▸ วางบิล = ไม่มีทิป ◂ */ && p.tipEnabled && !platformOn && (cashLikeRows > 0 || REGISTER_CASH_LIKE_PAY.has(method));
  const tipFundOk = tip === 0 || tip <= cashLikeRows + cashLikeNow;
  // ◂

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
  // POS P2.10 ▸ จอลูกค้า (มติ 5): ภาพช่องจ่ายของกล่องนี้ (อ่านอย่างเดียว · ไม่แตะ resetBill/sendingRef · ปิดกล่อง = null) — มัดจำ/บัตรของขวัญ/เงินสดทุกแถวนับเป็น "ชำระแล้ว"
  const displayPayFn = p.onDisplayPay;
  const displayPayKey = JSON.stringify(
    displayPayFn
      ? {
          method: method === "CASH" || method === "PROMPTPAY" || method === "CARD" ? method : "OTHER",
          dueSatang: due,
          roundSatang: roundAmount > 0 ? roundAmount : Math.max(remaining, 0),
          paidSatang: paid,
          remainingSatang: remaining,
          ...(method === "CASH" && entrySatang !== null && entrySatang > 0 ? { cashReceivedSatang: entrySatang, changeSatang: plan.change } : {}),
          ...(intentMode && pi.intent ? { intentId: pi.intent.id } : {}),
        }
      : null,
  );
  useEffect(() => {
    displayPayFn?.(JSON.parse(displayPayKey) as DisplayPayIn | null);
  }, [displayPayFn, displayPayKey]);
  useEffect(() => () => displayPayFn?.(null), [displayPayFn]);
  // ◂
  /** ใบของรอบนี้จ่ายแล้วและยอดตรงรอบนี้ ⇒ ยืนยัน/แยกจ่ายได้ · ยอด/วิธีล็อก */
  /** แผงใบขอรับเงินแสดงอยู่ (คอลัมน์ขวาใช้ระยะกระชับ) */
  const panelOn = intentMode && !!p.intent;
  const piPaid = intentMode && pi.intent?.status === "PAID" && pi.intent.amountSatang === roundAmount;
  const piLocked = intentMode && pi.intent?.status === "PAID";
  /** POS P2.1U ▸ มติ 6: ช่องแพลตฟอร์ม = ยอดล็อกเต็มยอด (แป้น/ปุ่มด่วน/ช่องจำนวนปิด) ◂ */
  const platformLock = method === "PLATFORM";
  const presetBlocked = !!p.lockedMethod?.managerOnly; // POS P2.4U ▸ fix 1 F4: ด่านผู้จัดการของการยืนยันเอง ◂
  // POS HF-PP ▸ fix 1 F1: บัตรทาง EDC (Beam บัตรปิด/CARD_UNAVAILABLE) = ยืนยันรับเงินเอง — ค่าตั้ง manualConfirmRequiresManager และผู้ใช้ไม่มี
  //   pos.shift.manage ⇒ ยืนยัน/แยกจ่าย/F4 ไม่ได้ (ก่อนรูดบัตรลูกค้า) · คำใบ้ชุดเดียวกับปุ่มยืนยันเองของ QR (pay.intent.managerOnly) ◂
  const edcManagerOnly = method === "CARD" && !intentMode && ((!!p.intent?.manualRequiresManager && !p.intent?.canManageShift) || (!p.intent && !!p.manualManagerOnly)); // POS P2.8U ▸ fix 1 F1: + manualManagerOnly ◂
  const canConfirm = acct /* POS P3.6U ▸ CD-P36U-5: วางบิล = เงื่อนไขของมันเอง ◂ */ ? acctOk :
    ready && !presetBlocked && !edcManagerOnly && (zero || plan.state === "complete") && (!intentMode || zero || remaining <= 0 || piPaid) && !gcPinMissing && !depLast4Missing && tipFundOk; // POS P2.9U ▸ PIN ครบ · ทิปจากเงินจริง ◂ · POS P2.9bU ▸ 4 หลักท้ายครบ ◂
  const canSplit = !acct /* POS P3.6U ◂ */ && ready && !presetBlocked && !edcManagerOnly && !zero && plan.state === "partial" && !rowsFull && (!intentMode || piPaid);
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
    clearPins(); // POS P2.9U ▸ มติ 3: ปิดกล่อง = ล้าง PIN ทุกใบ ◂
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
  // POS P2.1U ▸ มติ 6: quote เปลี่ยนเป็น/จากช่องทางแพลตฟอร์มระหว่างกล่องเปิด ⇒ ตั้งช่องใหม่ (แถวแยกจ่ายที่ยังไม่ส่งทิ้งได้ — ไม่มีเงินเข้า) ◂
  useEffect(() => {
    if (platformOn === (method === "PLATFORM")) return;
    if (rows.some((r) => r.via !== undefined) || pi.intent?.status === "PAID") return;
    setRows([]);
    setMethod(platformOn ? "PLATFORM" : "CASH");
    setEntry(platformOn ? null : "");
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เฉพาะเมื่อช่องทางของ quote เปลี่ยน
  }, [platformOn]);

  const pickMethod = (m: RegisterPayType) => {
    if (platformOn && m !== "PLATFORM") return; // POS P2.1U ▸ มติ 6 (R5): บิลแพลตฟอร์มจ่ายได้ช่องเดียว ◂
    // POS P2.4U ▸ fix 1 F4: วิธีจ่ายล็อก — แตะวิธีอื่น (ยังไม่มีแถวแยกจ่าย · ไม่ได้กำลังส่ง) = ให้ผู้เรียกเปิดเช็คบิลปกติ ◂
    if (p.lockedMethod && m !== method) {
      if (!busy && rows.length === 0) p.lockedMethod.onSwitch(m);
      return;
    }
    if (piLocked && m !== method) return flash("pay.intent.locked"); // มติ 2: ใบที่เงินเข้าแล้วเปลี่ยนวิธีไม่ได้
    setAcct(false); // POS P3.6U ▸ เลือกวิธีอื่น = ออกจากวางบิล ◂
    setMethod(m);
    setEntry(m === "CASH" ? "" : null);
    setReference("");
    setPadTip(false); // POS P2.9U ◂
    // POS P2.9bU ▸ มติ 2: ช่องมัดจำ = แผงค้นมัดจำ (+ มัดจำของสมาชิกในบิล) · ออกจากช่อง = ล้าง 4 หลักที่กรอกค้าง + แผง ◂
    if (m === "DEPOSIT") {
      if (gc.look || gc.pinLen) {
        setGcPin("");
        setGc(GC_EMPTY);
      }
      if (dp.forRow === null && !dp.sel && !dp.look) {
        setDp(DP_EMPTY);
        if (p.memberId) void depMemberList();
      }
      if (isFinePointer()) setTimeout(() => depSearchInput.current?.focus(), 0);
      return;
    }
    if (dp.sel || dp.last4Len || dp.forRow !== null) {
      setDepLast4("");
      setDp((d) => ({ ...DP_EMPTY, query: d.query, look: d.look }));
    }
    // POS P2.9U ▸ มติ 2: ช่องบัตรของขวัญ = แผงค้นบัตร (โฟกัสช่องเลขบัตร) · ออกจากช่อง = ล้าง PIN ที่กรอกค้าง ◂
    if (m === "GIFT_CARD") {
      if (gc.forRow === null && !gc.look) setGc(GC_EMPTY);
      if (isFinePointer()) setTimeout(() => gcNumberInput.current?.focus(), 0);
      return;
    }
    if (gc.look || gc.pinLen) {
      setGcPin("");
      setGc(GC_EMPTY);
    }
    if (isFinePointer()) setTimeout(() => amountRef.current?.focus(), 0);
  };
  useEffect(() => {
    if (!zero && isFinePointer()) amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งแรกที่เปิดกล่องเท่านั้น
  }, []);

  // ═══════ POS P2.9U ▸ บัตรของขวัญ · เครดิตร้าน (มติ 1–5) ═══════
  /** ล้าง PIN ทั้งหมด (ปิดกล่อง · GIFT_CARD_CHANGED · ถอดคอมโพเนนต์) */
  function clearPins() {
    pinsRef.current.clear();
    setGcPin("");
    // POS P2.9bU ▸ มติ 3: ปิดกล่อง = ล้าง 4 หลักท้ายทุกแถว + ที่กรอกค้าง ◂
    last4Ref.current.clear();
    setDepLast4("");
    notOwnerSet.current = null; // POS P2.9bU ▸ fix1 มติ 1 ◂
  }
  /** PIN ที่กำลังกรอกในแผง — ref + ช่อง password แบบไม่ควบคุม (ตั้ง .value ตรง ๆ ไม่ผ่าน React ⇒ ไม่เป็น attribute) */
  function setGcPin(v: string) {
    gcPinRef.current = v;
    if (gcPinInput.current && gcPinInput.current.value !== v) gcPinInput.current.value = v;
    setGc((g) => (g.pinLen === v.length ? g : { ...g, pinLen: v.length }));
  }
  useEffect(() => {
    const pins = pinsRef.current;
    const l4 = last4Ref.current; // POS P2.9bU ◂
    return () => {
      pins.clear();
      gcPinRef.current = "";
      l4.clear(); // POS P2.9bU ▸ มติ 3: ถอดกล่อง (จอสำเร็จ/ปิด) = ล้าง 4 หลักท้าย ◂
      depLast4Ref.current = "";
    };
  }, []);
  // แถวที่หายไป (ถอดเอง · ยอดบิลเปลี่ยน · ช่องทางเปลี่ยน) ⇒ PIN ของแถวนั้นหายด้วย
  useEffect(() => {
    const live = new Set(rows.map((r) => r.id));
    for (const id of [...pinsRef.current.keys()]) if (!live.has(id)) pinsRef.current.delete(id);
    for (const id of [...last4Ref.current.keys()]) if (!live.has(id)) last4Ref.current.delete(id); // POS P2.9bU ◂
  }, [rows]);
  // มติ 1: ช่องแถว 2 ของจอนี้ — อ่านครั้งเดียวต่อการเปิดกล่อง
  useEffect(() => {
    if (!p.tenders) return;
    let live = true;
    registerPayTendersAction({ systemId: p.tenders.systemId, unitId: p.tenders.unitId })
      .then((r) => {
        if (live && r.ok) setTenders(r.tenders);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวต่อการเปิดกล่อง (มติ 1)
  }, []);
  // มติ 5: ถอดสมาชิก/เครดิตหมด ⇒ แถวเครดิตร้านหาย · ช่องเครดิตร้านที่เลือกอยู่ ⇒ กลับเงินสด
  useEffect(() => {
    if (sc) return;
    setRows((s) => (s.some((r) => r.type === "STORE_CREDIT") ? s.filter((r) => r.type !== "STORE_CREDIT") : s));
    if (method === "STORE_CREDIT") {
      setMethod("CASH");
      setEntry("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือสมาชิก/เครดิตของบิล
  }, [!!sc]);
  const gcSeq = useRef(0);
  /** ค้นบัตร (มติ 2a–b) — ผลเก่าที่กลับมาช้ากว่าการค้นใหม่ = ทิ้ง */
  const gcLookup = async (raw: string, forRow: number | null = null) => {
    const n = raw.trim();
    if (!n || !p.tenders || busy) return;
    const seq = ++gcSeq.current;
    setGcPin("");
    setGc((g) => ({ ...g, number: n, look: { state: "loading" }, amount: null, target: "amount", forRow, err: null }));
    const r = await registerGiftCardLookupAction({ systemId: p.tenders.systemId, unitId: p.tenders.unitId, number: n }).catch(() => null);
    if (seq !== gcSeq.current) return;
    const look: GcLook = !r
      ? { state: "error", key: "errors.unknown" }
      : r.ok
        ? { state: "found", card: r.card }
        : r.code === "GIFT_CARD_NOT_FOUND"
          ? { state: "notFound" }
          : { state: "error", key: refusalMessageKey(r.code) };
    setGc((g) => ({ ...g, look, target: look.state === "found" && look.card.usable ? "pin" : "amount" }));
    if (look.state === "found" && look.card.usable && isFinePointer()) setTimeout(() => gcPinInput.current?.focus(), 0);
  };
  // มติ 2a: เลขจากกล้อง ⇒ ช่องเลขบัตร + ค้นทันที (กล้องอ่านเลขอย่างเดียว ไม่เคยเห็น PIN)
  const lastScan = useRef(p.scannedGiftCard?.seq ?? 0);
  useEffect(() => {
    const sg = p.scannedGiftCard;
    if (!sg || sg.seq === lastScan.current) return;
    lastScan.current = sg.seq;
    if (method !== "GIFT_CARD") setMethod("GIFT_CARD");
    void gcLookup(sg.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือผลสแกนใหม่
  }, [p.scannedGiftCard]);
  const gcCard = gc.look?.state === "found" ? gc.look.card : null;
  const gcRowFor = gc.forRow !== null ? (rows.find((r) => r.id === gc.forRow) ?? null) : null;
  /** มติ 2c: จำนวนที่ใช้จากบัตร = min(คงเหลือ, ยอดบัตร) · แก้ด้วยแป้นได้ · เกินยอดบัตร = ตัดเหลือยอดบัตร · แถวที่ใส่ PIN ใหม่ = ยอดของแถวนั้น */
  const gcMax = gcCard ? Math.min(Math.max(remaining, 0), gcCard.balanceSatang) : 0;
  const gcTyped = gc.amount === null ? null : parseHundredths(gc.amount);
  const gcAmount = gcRowFor ? gcRowFor.amountSatang : gcTyped === null ? (gc.amount === null ? gcMax : 0) : Math.min(gcTyped, gcCard?.balanceSatang ?? 0);
  const gcAmountOver = !gcRowFor && gcTyped !== null && gcTyped > Math.max(remaining, 0);
  const gcShort = !!gcCard && !gcRowFor && gcCard.balanceSatang < Math.max(remaining, 0);
  const gcCanUse = !busy && !!gcCard && gcCard.usable && gc.pinLen >= GIFT_CARD_PIN_MIN && gcAmount > 0 && !gcAmountOver;
  const gcPress = (k: (typeof KEYS)[number]) => {
    if (gc.target === "pin") {
      if (!gcCard?.usable) return;
      const cur = gcPinRef.current;
      setGcPin(k.digits === null ? cur.slice(0, -1) : (cur + k.digits).slice(0, GIFT_CARD_PIN_MAX));
      return;
    }
    if (gcRowFor || !gcCard) return;
    const text = gc.amount ?? hundredthsText(gcMax);
    if (k.digits === null) return setGc((g) => ({ ...g, amount: text.slice(0, -1) }));
    const base = gc.amount === null || text.includes(".") ? "" : text;
    const next = (base + k.digits).replace(/^0+(?=\d)/, "");
    if (next.length > MAX_DIGITS) return;
    // เกินยอดบัตร = ตัดเหลือยอดบัตรทันที (มติ 2c)
    const v = parseHundredths(next);
    setGc((g) => ({ ...g, amount: v !== null && v > gcCard.balanceSatang ? hundredthsText(gcCard.balanceSatang) : next }));
  };
  /** มติ 2d: "ใช้บัตรนี้" ⇒ แถว (หรือใส่ PIN ใหม่ให้แถวเดิม) · ≤ 3 ใบไม่ซ้ำ (CD4) */
  const gcUse = () => {
    if (!gcCanUse || !gcCard) return;
    const pin = gcPinRef.current;
    if (gcRowFor) {
      pinsRef.current.set(gcRowFor.id, pin);
      setRows((s) => s.map((r) => (r.id === gcRowFor.id && r.card ? { ...r, card: { ...r.card, masked: gcCard.numberMasked, balanceSatang: gcCard.balanceSatang, note: null } } : r)));
      setGcPin("");
      const nextRow = gcRows.find((r) => r.id !== gcRowFor.id && (pinsRef.current.get(r.id) ?? "").length < GIFT_CARD_PIN_MIN);
      setGc(GC_EMPTY);
      if (nextRow?.card) void gcLookup(nextRow.card.number, nextRow.id);
      else setGcRowsNote(null);
      return;
    }
    const key = giftCardNumberKey(gc.number);
    if (gcRows.some((r) => r.card && giftCardNumberKey(r.card.number) === key)) return setGc((g) => ({ ...g, err: "pay.gc.dupCard" }));
    if (gcRows.length >= REGISTER_MAX_GIFT_CARDS) return setGc((g) => ({ ...g, err: "pay.gc.maxCards" }));
    if (rowsFull) return setGc((g) => ({ ...g, err: "errors.splitInvalid" }));
    const id = ++rowSeq.current;
    pinsRef.current.set(id, pin);
    setRows((s) => [...s, { id, type: "GIFT_CARD", amountSatang: gcAmount, card: { number: gc.number.trim(), masked: gcCard.numberMasked, balanceSatang: gcCard.balanceSatang, note: null } }]);
    setGcPin("");
    setGc(GC_EMPTY);
    // ยังเหลือ ⇒ รอบถัดไปเงินสด (ยังไม่มีแถวเงินสด) / โอน · ครบแล้ว = อยู่แผงเดิม (ยืนยันได้)
    if (remaining - gcAmount > 0) {
      const next: RegisterPayType = cashRow ? "TRANSFER" : "CASH";
      setMethod(next);
      setEntry(next === "CASH" ? "" : null);
      setReference("");
    }
  };
  /** แถวบัตรที่ต้องใส่ PIN ใหม่ ⇒ เปิดแผงของแถวนั้น (ค้นใหม่เพื่อยอดล่าสุด) */
  const reenterPin = (r: PayRow) => {
    if (busy || !r.card) return;
    setMethod("GIFT_CARD");
    void gcLookup(r.card.number, r.id);
  };
  /**
   * มติ 4: ค้นแถวบัตรทุกใบใหม่ (GIFT_CARD_LOCKED / GIFT_CARD_CHANGED / โหลดกลับ) — ใช้ไม่ได้/ล็อก = ถอดแถว · ยอดใหม่ = ตัดจำนวนลงเหลือยอดบัตร ·
   * คืนจำนวนแถวที่ถอด (คำปฏิเสธไม่บอกว่าใบไหน — ใบเดียว = ใบนั้นเลย)
   */
  const relookupRows = async (mode: "locked" | "changed" | "restore", only: PayRow[]): Promise<PayRow[]> => {
    if (!p.tenders) return [];
    const t = p.tenders;
    const res = await Promise.all(
      only.map(async (r) => ({ r, out: r.card ? await registerGiftCardLookupAction({ systemId: t.systemId, unitId: t.unitId, number: r.card.number }).catch(() => null) : null })),
    );
    const drop = new Set<number>();
    const upd = new Map<number, GcCard>();
    for (const { r, out } of res) {
      if (out && out.ok) {
        if (!out.card.usable || (mode === "locked" && out.card.reason === "PIN_LOCKED")) drop.add(r.id);
        else upd.set(r.id, out.card);
      } else if (out && !out.ok && out.code === "GIFT_CARD_NOT_FOUND") drop.add(r.id);
      else if (mode === "locked" && only.length === 1) drop.add(r.id);
    }
    if (mode === "locked" && only.length === 1) drop.add(only[0]!.id);
    setRows((s) =>
      s.flatMap((r): PayRow[] => {
        if (drop.has(r.id)) return [];
        const c = upd.get(r.id);
        if (!c || !r.card) return [r];
        const amount = Math.min(r.amountSatang, c.balanceSatang);
        return amount > 0 ? [{ ...r, amountSatang: amount, card: { ...r.card, masked: c.numberMasked, balanceSatang: c.balanceSatang } }] : [];
      }),
    );
    if (drop.size) setGcRowsNote(mode === "locked" ? "pay.gc.lockedRemoved" : "pay.gc.unusableRemoved");
    // POS P2.9U ▸ fix1 V1: แถวที่ยังอยู่ (ยอด/เลขปิดบังล่าสุด) — ผู้เรียกเปิดแผงใส่ PIN ของแถวแรกได้ทันที ◂
    return only.flatMap((r): PayRow[] => {
      if (drop.has(r.id) || !r.card) return [];
      const c = upd.get(r.id);
      return [c ? { ...r, amountSatang: Math.min(r.amountSatang, c.balanceSatang), card: { ...r.card, masked: c.numberMasked, balanceSatang: c.balanceSatang } } : r];
    }).filter((r) => r.amountSatang > 0);
  };
  // มติ 4: คำปฏิเสธของบัตรจาก submit (refusalMessageKey) → แถว/แบนเนอร์ · คำขอเดิมไม่มีบิล (คีย์เดิม)
  const lastErr = useRef<PayError | null>(null);
  useEffect(() => {
    const e = p.error;
    if (!e || e === lastErr.current) return;
    lastErr.current = e;
    // POS P2.14 ▸ UI-9: คำปฏิเสธบอกแถว (giftCardRow) ⇒ ล้าง PIN + ข้อความ "ไม่ถูกต้อง · เหลืออีก n ครั้ง" เฉพาะแถวนั้น แล้วเปิดแป้นของแถวนั้น ◂
    const pinRow = e.code === "GIFT_CARD_PIN" && typeof e.giftCardRow === "number" ? gcRows[e.giftCardRow] : undefined;
    if (pinRow) {
      pinsRef.current.delete(pinRow.id);
      setRows((s) => s.map((r) => (r.id === pinRow.id && r.card ? { ...r, card: { ...r.card, note: "pinWrong", left: e.attemptsLeft ?? null } } : r)));
      setGcRowsNote(null);
      reenterPin(pinRow);
    } else if (e.code === "GIFT_CARD_PIN") {
      // ไม่มีเลขแถวในคำปฏิเสธ (register.ts:600 · service.ts tenderStep) ⇒ ทุกแถวบัตรต้องใส่ PIN ใหม่ · ใบเดียว = เปิดแป้นของใบนั้นทันที
      for (const r of gcRows) pinsRef.current.delete(r.id);
      setRows((s) => s.map((r) => (r.type === "GIFT_CARD" && r.card ? { ...r, card: { ...r.card, note: "pinWrong" } } : r)));
      setGcRowsNote(null);
      if (gcRows[0]) reenterPin(gcRows[0]);
    } else if (e.code === "GIFT_CARD_LOCKED") {
      for (const r of gcRows) pinsRef.current.delete(r.id);
      setRows((s) => s.map((r) => (r.type === "GIFT_CARD" && r.card ? { ...r, card: { ...r.card, note: "pinAgain" } } : r)));
      setGc(GC_EMPTY);
      void relookupRows("locked", gcRows);
    } else if (e.code === "GIFT_CARD_CHANGED") {
      clearPins();
      setGcBanner(true);
      setRows((s) => s.map((r) => (r.type === "GIFT_CARD" && r.card ? { ...r, card: { ...r.card, note: "pinAgain" } } : r)));
      setGc(GC_EMPTY);
      // POS P2.9U ▸ fix1 V1: ค้นใหม่แล้วเปิดแผงบัตรของแถวแรกที่ยังอยู่ พร้อมแป้น PIN (ไม่ต้องแตะ "ใส่ PIN") ◂
      void relookupRows("changed", gcRows).then((kept) => {
        if (kept[0]) reenterPin(kept[0]);
      });
    } else if (e.code === "STORE_CREDIT_NOT_OWNER") {
      setRows((s) => s.filter((r) => r.type !== "STORE_CREDIT"));
      if (method === "STORE_CREDIT") {
        setMethod("CASH");
        setEntry("");
      }
    } else if (e.code === "DEPOSIT_NOT_FOUND" || e.code === "DEPOSIT_CLOSED" || e.code === "DEPOSIT_NOT_OWNER" || e.code === "DEPOSIT_LOCKED") {
      // POS HF-FU2 ▸ DEP-1 (มติ 5): ตัดสินแถวที่โดนด้วย depositBlame (บริสุทธิ์ · deposit-blame.ts) —
      //   คำปฏิเสธมี depositId ⇒ ถอด/ถาม 4 หลักเฉพาะแถวของใบนั้น (หลัง reload ก็ถามเฉพาะแถวนั้น) ·
      //   ไม่มี depositId (D2) ⇒ กติกาเดิม P2.9bU มติ 4 · fix1 มติ 1 · fix2 G1 ทุกประการ (ข้อสอบ DP3 golden) ◂
      const b = depositBlame({
        code: e.code,
        depositId: e.depositId ?? null,
        rows: depRows.map((r) => ({ id: r.id, depositId: r.dep?.id ?? "", receiptNo: r.dep?.receiptNo ?? null, needsLast4: !!r.dep?.needsLast4, memberLinked: !!r.dep?.memberLinked, l4Checked: !!r.dep?.l4Checked })),
        sentStripped: sentStripped.current,
        notOwnerSet: notOwnerSet.current,
      });
      if (b.lookup) void depDropClosed(e.code);
      else {
        const drop = new Set(b.drop);
        const reask = new Set(b.reask);
        for (const id of [...drop, ...reask]) last4Ref.current.delete(id);
        setRows((s) =>
          s.flatMap((r): PayRow[] =>
            drop.has(r.id) ? [] : r.type === "DEPOSIT" && r.dep && reask.has(r.id) ? [{ ...r, dep: { ...r.dep, needsLast4: true, note: b.reaskNote, l4Checked: false } }] : [r],
          ),
        );
        setDepNote(b.note);
        notOwnerSet.current = b.notOwnerSet;
        const first = b.reask.length ? depRows.find((r) => r.id === b.reask[0]) : undefined;
        if (first) reenterLast4(first);
        else {
          setDepLast4("");
          setDp(DP_EMPTY);
        }
      }
      // ◂
    } else if (e.code === "DEPOSIT_EXCEEDS") {
      // POS P2.9bU ▸ มติ 4: ยอดมัดจำเปลี่ยน ⇒ ค้นทุกแถวมัดจำใหม่อัตโนมัติ · ตัดจำนวนลงเหลือยอดใหม่ · แบนเนอร์ ◂
      setDepBanner(true);
      void depRelookup(depRows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือคำปฏิเสธใหม่
  }, [p.error]);
  // มติ 3: คำขอไม่มี PIN ถูกปฏิเสธ (คีย์ยังไม่มีบิล) ⇒ "กรุณาใส่ PIN อีกครั้ง" · กล่องไม่มีแถว (หลัง reload) = สร้างแถวคืนจากคำขอที่เก็บ
  //   (หลัง reload ตะกร้าเพิ่งถูกสร้างคืน ⇒ รอ quote ของตะกร้านั้นก่อน · ยอดไม่ตรงคำขอเดิม = ไม่สร้างแถว ให้รับเงินใหม่ทั้งบิล)
  const lastPinAgain = useRef(p.pinAgain?.seq ?? 0);
  useEffect(() => {
    const a = p.pinAgain;
    if (!a || a.seq === lastPinAgain.current) return;
    if (gcRows.length || depRows.length) { // POS P2.9bU ▸ + แถวมัดจำ (4 หลักท้ายอีกครั้ง) ◂
      lastPinAgain.current = a.seq;
      for (const r of gcRows) pinsRef.current.delete(r.id);
      for (const r of depRows) if (r.dep?.needsLast4) last4Ref.current.delete(r.id);
      setRows((s) =>
        s.map((r) =>
          r.type === "GIFT_CARD" && r.card ? { ...r, card: { ...r.card, note: "pinAgain" } } : r.type === "DEPOSIT" && r.dep?.needsLast4 ? { ...r, dep: { ...r.dep, note: "again" } } : r,
        ),
      );
      const d0 = depRows.find((r) => r.dep?.needsLast4);
      if (gcRows[0]) reenterPin(gcRows[0]);
      else if (d0) reenterLast4(d0);
      return;
    }
    if (p.quotePending || p.quoteError) return;
    lastPinAgain.current = a.seq;
    if (p.dueSatang + a.tipSatang !== a.payMethods.reduce((t, m) => t + m.amountSatang, 0)) {
      setGcRowsNote("pay.gc.pinAgainRestart");
      return;
    }
    const cashPart = a.payMethods.find((m) => m.type === "CASH");
    const rebuilt: PayRow[] = a.payMethods.map((m) => ({
      id: ++rowSeq.current,
      type: m.type,
      amountSatang: m.amountSatang,
      ...(m.reference ? { reference: m.reference } : {}),
      ...(m.reference?.startsWith("pi_") ? { via: "MANUAL" as const } : {}),
      ...(m === cashPart ? { tenderedSatang: Math.max(a.cashReceivedSatang ?? m.amountSatang, m.amountSatang) } : {}),
      ...(m.type === "GIFT_CARD" && m.giftCard ? { card: { number: m.giftCard.number, masked: maskLocal(m.giftCard.number), balanceSatang: null, note: "pinAgain" as const } } : {}),
      ...(m.type === "STORE_CREDIT" && sc ? { card: { number: "", masked: sc.numberMasked, balanceSatang: sc.balanceSatang } } : {}),
      // POS P2.9bU ▸ มติ 3: แถวมัดจำที่สร้างคืน = ไม่รู้เลขใบรับ/ยอด (คำขอที่เก็บมีแค่ depositId) · ต้องใส่ 4 หลักท้ายอีกครั้ง ◂
      ...(m.type === "DEPOSIT" && m.depositId ? { dep: { id: m.depositId, receiptNo: null, remainingSatang: null, needsLast4: true, memberLinked: false, l4Checked: false, note: "again" as const } } : {}),
    }));
    setRows(rebuilt);
    if (a.tipSatang > 0) {
      setTipOn(true);
      setTipText(hundredthsText(a.tipSatang));
    }
    const firstGc = rebuilt.find((r) => r.type === "GIFT_CARD");
    if (firstGc) {
      void relookupRows("restore", rebuilt.filter((r) => r.type === "GIFT_CARD"));
      reenterPin(firstGc);
    }
    const firstDep = rebuilt.find((r) => r.type === "DEPOSIT"); // POS P2.9bU ◂
    if (!firstGc && firstDep) reenterLast4(firstDep);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือคำขอใส่ PIN ใหม่ (+ quote ของตะกร้าที่สร้างคืน)
  }, [p.pinAgain, p.quotePending, p.quoteError, p.dueSatang]);
  // ◂

  // ═══════ POS P2.9bU ▸ มัดจำ (มติผู้คุม P2.9bU 2–4) ═══════
  /** 4 หลักที่กำลังกรอกในแผง — ref + ช่อง password แบบไม่ควบคุม (ตั้ง .value ตรง ๆ ⇒ ไม่เป็น attribute) */
  function setDepLast4(v: string) {
    depLast4Ref.current = v;
    if (depLast4Input.current && depLast4Input.current.value !== v) depLast4Input.current.value = v;
    setDp((d) => (d.last4Len === v.length ? d : { ...d, last4Len: v.length }));
  }
  const depSeq = useRef(0);
  const depArgs = () => ({ systemId: p.tenders?.systemId ?? "", unitId: p.tenders?.unitId ?? "" });
  /** มติ 2a: มัดจำของสมาชิกในบิล (มียอด — รวมสมาชิกที่ถูกรวมเข้า) · ไม่มี = ไม่แสดงรายการ */
  async function depMemberList() {
    if (!p.tenders || !p.memberId || busy) return;
    const seq = ++depSeq.current;
    setDp((d) => ({ ...d, look: { state: "loading" } }));
    const r = await registerDepositLookupAction({ ...depArgs(), memberId: p.memberId }).catch(() => null);
    if (seq !== depSeq.current) return;
    const look: DepLook = !r ? { state: "error", key: "errors.unknown" } : r.ok ? (r.deposits.length ? { state: "found", rows: r.deposits, byMember: true } : null) : { state: "error", key: refusalMessageKey(r.code) };
    setDp((d) => ({ ...d, look }));
  }
  /** มติ 2a: ค้นด้วยเลขใบเสร็จ (ตรงตัว) / ชื่อ (ขึ้นต้น) ≥ 3 ตัว — ไม่ค้นด้วยเบอร์ (fix3 ของ S) · ผลเก่าที่กลับช้ากว่าการค้นใหม่ = ทิ้ง */
  const depSearch = async () => {
    const q = dp.query.trim();
    if (!p.tenders || busy) return;
    if ([...q].length < DEPOSIT_QUERY_MIN) return setDp((d) => ({ ...d, err: "pay.depositQueryShort" }));
    const seq = ++depSeq.current;
    setDepLast4("");
    setDp((d) => ({ ...d, look: { state: "loading" }, sel: null, verify: "idle", amount: null, target: "amount", forRow: null, err: null }));
    const r = await registerDepositLookupAction({ ...depArgs(), query: q }).catch(() => null);
    if (seq !== depSeq.current) return;
    const look: DepLook = !r ? { state: "error", key: "errors.unknown" } : r.ok ? (r.deposits.length ? { state: "found", rows: r.deposits, byMember: false } : { state: "empty" }) : { state: "error", key: refusalMessageKey(r.code) };
    setDp((d) => ({ ...d, look }));
    if (look.state === "found" && look.rows.length === 1 && look.rows[0]!.receiptNo === q) depPick(look.rows[0]!); // ตรงเลขใบเสร็จใบเดียว = เลือกให้เลย
  };
  /** มติ 2b: แตะแถว — มียอด = เลือก · ไม่มียอด = ค้นซ้ำด้วยเลขใบเสร็จ (มัดจำ walk-in ที่มีเบอร์ = แสดงช่อง 4 หลักท้ายก่อน) */
  function depPick(row: DepDto) {
    if (busy || row.status !== "OPEN") return;
    setDepLast4("");
    setDp((d) => ({ ...d, sel: row, verify: "idle", amount: null, target: row.remainingSatang === null && row.needsPhoneLast4 ? "last4" : "amount", forRow: null, err: null }));
    if (row.remainingSatang !== null) return;
    if (row.needsPhoneLast4) {
      if (isFinePointer()) setTimeout(() => depLast4Input.current?.focus(), 0);
      return;
    }
    void depVerify(row, null);
  }
  /** ค้นซ้ำด้วยเลขใบเสร็จ (+ 4 หลักท้าย — เซิร์ฟเวอร์นับครั้งผิด/ล็อก) ⇒ ยอดของมัดจำที่เลือก · ไม่เห็นยอด = "4 หลักท้ายไม่ถูกต้อง" (ผิดกับล็อกตอบเหมือนกัน) */
  async function depVerify(row: DepDto, last4: string | null) {
    if (!p.tenders || !row.receiptNo) return;
    const seq = ++depSeq.current;
    setDp((d) => ({ ...d, verify: "loading" }));
    const r = await registerDepositLookupAction({ ...depArgs(), query: row.receiptNo, ...(last4 ? { phoneLast4: last4 } : {}) }).catch(() => null);
    if (seq !== depSeq.current) return;
    const hit = r && r.ok ? (r.deposits.find((x) => x.id === row.id) ?? null) : null;
    if (hit && hit.remainingSatang !== null) {
      setDp((d) => ({ ...d, sel: hit, verify: "idle", target: "amount", look: d.look?.state === "found" ? { ...d.look, rows: d.look.rows.map((x) => (x.id === hit.id ? hit : x)) } : d.look }));
      return;
    }
    if (last4) setDepLast4("");
    setDp((d) => ({ ...d, verify: last4 ? "wrong" : "idle", target: last4 ? "last4" : d.target, err: last4 ? null : r && !r.ok ? refusalMessageKey(r.code) : "errors.unknown" }));
  }
  /** 4 หลักท้าย (ช่อง/แป้น) — แก้หลังเห็นยอดแล้ว = ซ่อนยอด (ต้องยืนยันใหม่) · ครบ 4 = ค้นซ้ำทันที (ค่าที่ส่งตอนใช้ = ค่าที่ผ่านการค้นเสมอ) */
  const depLast4Typed = (v: string) => {
    setDepLast4(v);
    if (dp.forRow !== null || !dp.sel?.needsPhoneLast4) return;
    const base: DepDto = dp.sel.remainingSatang !== null ? { ...dp.sel, remainingSatang: null, amountSatang: null } : dp.sel;
    if (base !== dp.sel) setDp((d) => ({ ...d, sel: base, amount: null, verify: "idle" }));
    if (v.length === DEP_LAST4) void depVerify(base, v);
  };
  const depBal = dp.sel?.remainingSatang ?? null;
  const depRowFor = dp.forRow !== null ? (rows.find((r) => r.id === dp.forRow) ?? null) : null;
  /** มติ 2c: จำนวน = min(คงเหลือ, ยอดมัดจำ) · แก้ด้วยแป้น · เกินยอดมัดจำ = ตัดเหลือยอดมัดจำ · แถวที่ใส่ 4 หลักใหม่ = ยอดของแถวนั้น */
  const depMax = depBal !== null ? Math.min(Math.max(remaining, 0), depBal) : 0;
  const depTyped = dp.amount === null ? null : parseHundredths(dp.amount);
  const depAmount = depRowFor ? depRowFor.amountSatang : depTyped === null ? (dp.amount === null ? depMax : 0) : Math.min(depTyped, depBal ?? 0);
  const depAmountOver = !depRowFor && depTyped !== null && depTyped > Math.max(remaining, 0);
  const depShort = !depRowFor && depBal !== null && depBal < Math.max(remaining, 0);
  const depCanUse =
    !busy && (depRowFor ? dp.last4Len === DEP_LAST4 : !!dp.sel && depBal !== null && depAmount > 0 && !depAmountOver && (!dp.sel.needsPhoneLast4 || dp.last4Len === DEP_LAST4));
  const depPress = (k: (typeof KEYS)[number]) => {
    if (depRowFor || dp.target === "last4") {
      if (!depRowFor && !dp.sel?.needsPhoneLast4) return;
      const cur = depLast4Ref.current;
      depLast4Typed(k.digits === null ? cur.slice(0, -1) : (cur + k.digits).slice(0, DEP_LAST4));
      return;
    }
    if (depBal === null) return;
    const text = dp.amount ?? hundredthsText(depMax);
    if (k.digits === null) return setDp((d) => ({ ...d, amount: text.slice(0, -1) }));
    const base = dp.amount === null || text.includes(".") ? "" : text;
    const next = (base + k.digits).replace(/^0+(?=\d)/, "");
    if (next.length > MAX_DIGITS) return;
    const v = parseHundredths(next);
    setDp((d) => ({ ...d, amount: v !== null && v > depBal ? hundredthsText(depBal) : next }));
  };
  /** มติ 2d: "ใช้มัดจำนี้" ⇒ แถว (หรือใส่ 4 หลักใหม่ให้แถวเดิม) · ≤ 3 ใบ ใบละครั้ง (CD4) */
  const depUse = () => {
    if (!depCanUse) return;
    const l4 = depLast4Ref.current;
    if (depRowFor) {
      last4Ref.current.set(depRowFor.id, l4);
      // POS P2.9bU ▸ fix1 มติ 1: 4 หลักที่ใส่ใหม่ทางแถว = แผงไม่ได้ค้นตรวจ (l4Checked false) ◂
      setRows((s) => s.map((r) => (r.id === depRowFor.id && r.dep ? { ...r, dep: { ...r.dep, note: null, l4Checked: false } } : r)));
      setDepLast4("");
      const nextRow = depRows.find((r) => r.id !== depRowFor.id && !!r.dep?.needsLast4 && (last4Ref.current.get(r.id) ?? "").length !== DEP_LAST4);
      setDp(DP_EMPTY);
      if (nextRow) reenterLast4(nextRow);
      else setDepNote(null);
      return;
    }
    const sel = dp.sel;
    if (!sel) return;
    if (depRows.some((r) => r.dep?.id === sel.id)) return setDp((d) => ({ ...d, err: "pay.depositDup" }));
    if (depRows.length >= REGISTER_MAX_DEPOSITS) return setDp((d) => ({ ...d, err: "pay.depositMax" }));
    if (rowsFull) return setDp((d) => ({ ...d, err: "errors.splitInvalid" }));
    const id = ++rowSeq.current;
    if (sel.needsPhoneLast4) last4Ref.current.set(id, l4);
    // POS P2.9bU ▸ fix1 มติ 1: ที่มาของแถว — memberLinked = มัดจำสมาชิก (S memberLinked) ที่แผงเห็นยอดโดยไม่ใช้ 4 หลัก (รายการสมาชิกในบิล / เลขใบเสร็จตรง) ·
    //   l4Checked = 4 หลักผ่านการค้นของแผงแล้ว (depVerify — ยอดเห็นได้เฉพาะเมื่อถูก) ◂
    setRows((s) => [...s, { id, type: "DEPOSIT", amountSatang: depAmount, dep: { id: sel.id, receiptNo: sel.receiptNo, remainingSatang: depBal, needsLast4: sel.needsPhoneLast4, memberLinked: sel.memberLinked && !sel.needsPhoneLast4, l4Checked: sel.needsPhoneLast4, note: null } }]);
    setDepLast4("");
    setDp((d) => ({ ...DP_EMPTY, query: d.query, look: d.look }));
    setDepNote(null);
    setDepBanner(false);
    // ยังเหลือ ⇒ รอบถัดไปเงินสด (ยังไม่มีแถวเงินสด) / โอน · ครบแล้ว = อยู่แผงเดิม (ยืนยันได้)
    if (remaining - depAmount > 0) {
      const next: RegisterPayType = cashRow ? "TRANSFER" : "CASH";
      setMethod(next);
      setEntry(next === "CASH" ? "" : null);
      setReference("");
    }
  };
  /** แถวมัดจำที่ต้องใส่ 4 หลักใหม่ ⇒ เปิดแผงของแถวนั้น */
  function reenterLast4(r: PayRow) {
    if (busy || !r.dep) return;
    setMethod("DEPOSIT");
    setDepLast4("");
    setDp({ ...DP_EMPTY, forRow: r.id, target: "last4" });
    if (isFinePointer()) setTimeout(() => depLast4Input.current?.focus(), 0);
  }
  /** มติ 4: DEPOSIT_NOT_FOUND / DEPOSIT_CLOSED — ค้นแถวมัดจำด้วยเลขใบรับ (อ่านอย่างเดียว · เห็นสถานะ) ⇒ ถอดใบที่ไม่พบ/ไม่ OPEN · ระบุไม่ได้ = ถอดทุกแถวมัดจำ */
  async function depDropClosed(code: string) {
    const list = depRows;
    const res = await Promise.all(
      list.map(async (r) => {
        const d = r.dep!;
        const out = d.receiptNo && p.tenders ? await registerDepositLookupAction({ ...depArgs(), query: d.receiptNo }).catch(() => null) : null;
        const hit = out && out.ok ? out.deposits.find((x) => x.id === d.id) : undefined;
        return { id: r.id, bad: !!out && out.ok && (!hit || hit.status !== "OPEN") };
      }),
    );
    const bad = res.filter((x) => x.bad).map((x) => x.id);
    const drop = new Set(bad.length ? bad : list.map((r) => r.id));
    for (const id of drop) last4Ref.current.delete(id);
    setRows((s) => s.filter((r) => !drop.has(r.id)));
    setDepNote(DEP_NOTE_KEY[code] ?? "errors.unknown");
  }
  /** มติ 4: DEPOSIT_EXCEEDS — ค้นทุกแถวมัดจำใหม่ (สมาชิก = {memberId} · walk-in = เลขใบรับ + 4 หลักที่ผ่านแล้ว) · ตัดจำนวนลงเหลือยอดใหม่ · หมด/ปิด = ถอด */
  async function depRelookup(only: PayRow[]) {
    if (!p.tenders) return;
    const res = await Promise.all(
      only.map(async (r) => {
        const d = r.dep!;
        const l4 = last4Ref.current.get(r.id);
        const out =
          d.memberLinked && p.memberId
            ? await registerDepositLookupAction({ ...depArgs(), memberId: p.memberId }).catch(() => null)
            : d.receiptNo
              ? await registerDepositLookupAction({ ...depArgs(), query: d.receiptNo, ...(l4 ? { phoneLast4: l4 } : {}) }).catch(() => null)
              : null;
        return { id: r.id, known: !!out && out.ok, hit: out && out.ok ? (out.deposits.find((x) => x.id === d.id) ?? null) : null };
      }),
    );
    setRows((s) =>
      s.flatMap((r): PayRow[] => {
        const x = res.find((y) => y.id === r.id);
        if (!x || !r.dep) return [r];
        if (x.known && (!x.hit || x.hit.status !== "OPEN")) return [];
        if (!x.hit || x.hit.remainingSatang === null) return [r];
        const amount = Math.min(r.amountSatang, x.hit.remainingSatang);
        return amount > 0 ? [{ ...r, amountSatang: amount, dep: { ...r.dep, remainingSatang: x.hit.remainingSatang } }] : [];
      }),
    );
  }
  // ◂

  // ── แป้นตัวเลข: ต่อท้ายหลักบาท · ค่าที่มีทศนิยม (จาก "พอดี") หรือค่าอัตโนมัติ = เริ่มใหม่ · ⌫ ลบทีละตัว ──
  const press = (k: (typeof KEYS)[number]) => {
    if (busy || piLocked || platformLock) return;
    // POS P2.9U ▸ แป้นเดียวกัน 3 โหมด: ยอดทิป (แตะช่องทิป) · แผงบัตรของขวัญ (จำนวน/PIN ปิดบัง) · ช่องจำนวนเดิม ◂
    if (padTip && tipOn) {
      const cur = tipText;
      if (k.digits === null) return setTipText(cur.slice(0, -1));
      const nx = ((cur.includes(".") ? "" : cur) + k.digits).replace(/^0+(?=\d)/, "");
      if (nx.length <= MAX_DIGITS) setTipText(nx);
      return;
    }
    if (gcMode) return gcPress(k);
    if (depMode) return depPress(k); // POS P2.9bU ▸ แผงมัดจำ: จำนวน / 4 หลักท้ายปิดบัง ◂
    if (k.digits === null) {
      setEntry(entryText.slice(0, -1));
      return;
    }
    const base = entry === null || entryText.includes(".") ? "" : entryText;
    const next = (base + k.digits).replace(/^0+(?=\d)/, "");
    if (next.length > MAX_DIGITS) return;
    // POS P2.9U ▸ มติ 5: เครดิตร้านเกินยอดเครดิต = ตัดเหลือยอดเครดิต ◂
    const v = method === "STORE_CREDIT" ? parseHundredths(next) : null;
    setEntry(v !== null && v > scBal ? hundredthsText(scBal) : next);
  };
  const quick = (v: number) => {
    if (busy || piLocked || platformLock || panelMode) return; // POS P2.9bU ▸ panelMode ◂
    setEntry(hundredthsText(method === "STORE_CREDIT" ? Math.min(v, scBal) : v));
  };
  const exact = () => {
    if (busy || piLocked || platformLock || panelMode) return; // POS P2.9bU ▸ panelMode ◂
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
      ...(method === "STORE_CREDIT" && sc ? { card: { number: "", masked: sc.numberMasked, balanceSatang: sc.balanceSatang } } : {}), // POS P2.9U ▸ มติ 5 ◂
    };
    if (intentMode) pi.release();
    setRows((s) => [...s, row]);
    // P1.7U: หลังใบที่เงินเข้าแล้ว ⇒ รอบถัดไปเริ่มที่เงินสด (ถ้ายังไม่มีแถวเงินสด) — ไม่สร้าง QR ใบที่สองเอง
    const next: RegisterPayType =
      intentMode || method === "STORE_CREDIT" ? (cashRow ? "TRANSFER" : "CASH") : method === "CASH" ? (p.promptpayId ? "PROMPTPAY" : "TRANSFER") : method; // POS P2.9U ▸ เครดิตร้านแถวเดียว ⇒ รอบถัดไปเงินสด/โอน ◂
    setMethod(next);
    setEntry(next === "CASH" ? "" : null);
    setReference("");
  };
  const removeRow = (id: number) => {
    if (busy) return;
    if (rows.some((r) => r.id === id && r.via !== undefined)) return flash("pay.intent.locked"); // มติ 2: เงินเข้าแล้ว — เอาออกไม่ได้
    pinsRef.current.delete(id); // POS P2.9U ▸ มติ 2: ถอดแถว = ล้าง PIN ของแถวนั้น ◂
    if (gc.forRow === id) {
      setGcPin("");
      setGc(GC_EMPTY);
    }
    // POS P2.9bU ▸ มติ 3: ถอดแถวมัดจำ = ล้าง 4 หลักของแถวนั้น ◂
    last4Ref.current.delete(id);
    if (dp.forRow === id) {
      setDepLast4("");
      setDp(DP_EMPTY);
    }
    setRows((s) => s.filter((r) => r.id !== id));
    setEntry(method === "CASH" ? "" : null);
  };

  // ── POS P3.6U ▸ CD-P36U-5: แตะไทล์วางบิล — ไม่มีบริษัท = เปิดแผ่นเลือกบริษัท · เลือก = แถวเดียวเต็มยอด (ล้างแถวแยก · ปิดทิป) · ต้องมีผู้ซื้อ = เปิดกล่องใบกำกับ ◂
  const pickOnAccount = () => {
    if (!oa || busy || platformOn || p.lockedMethod || moneyIn || piLocked) return;
    if (!oa.company) return oa.onPickCompany();
    if (acctNotAllowed || acctHidden) return;
    setRows([]);
    setTipOn(false);
    setTipText("");
    setPadTip(false);
    if (gc.look || gc.pinLen) {
      setGcPin("");
      setGc(GC_EMPTY);
    }
    if (dp.sel || dp.look || dp.forRow !== null) {
      setDepLast4("");
      setDp(DP_EMPTY);
    }
    setMethod("CASH");
    setEntry("");
    setReference("");
    setAcct(true);
    if (oa.requireBuyer && !oa.buyer) oa.onNeedBuyer();
  };
  // ── ยืนยัน: แถวที่แยกไว้ + รอบสุดท้าย (ถ้ายังมีคงเหลือ) → payMethods · เงินรับของแถวเงินสด → cashReceivedSatang ──
  const confirm = () => {
    if (!canConfirm) return;
    if (acct) return p.onConfirm({ payMethods: [onAccountRow(p.dueSatang)], tipSatang: 0 }); // POS P3.6U ▸ CD-P36U-5: แถวเดียวเต็มยอด ◂
    sentStripped.current = false; // POS P2.9bU ◂
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
    // POS P2.9U ▸ มติ 2: แถว GIFT_CARD = {number, pin} จากหน่วยความจำของกล่อง (PIN ไม่ครบ = ไม่ส่ง) ◂
    if (all.some((r) => r.type === "GIFT_CARD" && (!r.card || (pinsRef.current.get(r.id) ?? "").length < GIFT_CARD_PIN_MIN))) return;
    // POS P2.9bU ▸ มติ 2–3: แถว DEPOSIT = {depositId, phoneLast4?} จากหน่วยความจำของกล่อง (ต้องใช้แต่ไม่ครบ = ไม่ส่ง) ◂
    if (all.some((r) => r.type === "DEPOSIT" && (!r.dep || (r.dep.needsLast4 && (last4Ref.current.get(r.id) ?? "").length !== DEP_LAST4)))) return;
    const cash = all.find((r) => r.type === "CASH");
    p.onConfirm({
      payMethods: all.map((r) => ({
        type: r.type,
        amountSatang: r.amountSatang,
        ...(r.reference ? { reference: r.reference } : {}),
        ...(r.type === "GIFT_CARD" && r.card ? { giftCard: { number: r.card.number, pin: pinsRef.current.get(r.id) ?? "" } } : {}),
        ...(r.type === "DEPOSIT" && r.dep ? { depositId: r.dep.id, ...(last4Ref.current.get(r.id) ? { phoneLast4: last4Ref.current.get(r.id)! } : {}) } : {}), // POS P2.9bU ◂
      })),
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
      // POS P1.15U ▸ fix รอบ 1 F4: กล่องอยู่ใต้ [inert] (จอล็อก / กล่องอื่นทับ) = ไม่รับ F4 ◂
      if (document.querySelector('[data-testid="pos-reg-paydlg"]')?.closest("[inert]")) return;
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
        // POS P1.12U: ลำดับภาพ 02 — คูปอง → ระดับ → ว่อชเชอร์ → แต้ม (ตัวเลขจาก quote)
        (b.couponDiscountSatang ?? 0) > 0 ? tm("pay.bdCoupon", { amount: moneyText(-(b.couponDiscountSatang ?? 0)) }) : null,
        (b.tierDiscountSatang ?? 0) > 0 ? tm("pay.bdTier", { amount: moneyText(-(b.tierDiscountSatang ?? 0)) }) : null,
        ...(b.memberLines ?? [])
          .filter((l) => (l.kind === "VOUCHER" || l.kind === "POINTS") && l.discountSatang > 0)
          .map((l) => tm(l.kind === "VOUCHER" ? "pay.bdVoucher" : "pay.bdPoints", { amount: moneyText(-l.discountSatang) })),
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
    // POS P2.9U ▸ fix1 V2: ช่องเตี้ยลง (60 / xl 70 · ภาพ 02 ≈ 75) ให้เนื้อหา 02 ทั้งชุดพอดีกล่องที่ 1440×900 และ 1024×768 ◂
    `flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] border px-2 text-center text-[15px] font-semibold leading-tight disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)] xl:h-[70px] xl:gap-1 ${
      on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "bg-[color:var(--color-surface)]"
    }`;

  return (
    <RegisterDialog onDismiss={() => void tryClose()} locked={busy || closing}>
      <div
        data-testid="pos-reg-paydlg"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-surface)] shadow-xl md:h-[min(840px,calc(100dvh-32px))] md:w-[min(1120px,calc(100vw-32px))] md:rounded-[16px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("pay.title")}
      >
        {/* ── หัว ── */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 md:gap-[19px] md:px-[22px] md:py-[14px]">
          <RegisterIcon name="wallet" size={18} className="hidden md:block" />
          <h2 className="text-[19px] font-bold md:text-[17px]">{t("pay.title")}</h2>
          <span className="inline-flex h-7 items-center rounded-[8px] border px-[11px] text-[13px] text-[color:var(--color-ink-soft)]">{t("cart.itemCount", { count: p.itemCount })}</span>
          {/* POS P2.5U ▸ มติ 7: ชิปใบแยกบิล ◂ */}
          {p.splitChip && (
            <span data-testid="pos-reg-paydlg-splitchip" className="inline-flex h-7 min-w-0 max-w-[240px] items-center truncate rounded-[8px] border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-[11px] text-[13px] font-bold text-[color:var(--color-accent)]">
              {p.splitChip}
            </span>
          )}
          {p.memberChip && (
            <span data-testid="pos-member-pay-chip" className="inline-flex h-7 min-w-0 max-w-[260px] items-center truncate rounded-[8px] border px-[11px] text-[13px] text-[color:var(--color-ink-soft)] max-md:hidden">
              {p.memberChip}
            </span>
          )}
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
            {/* POS P2.9U ▸ fix1 V2: กล่องสูงตามภาพ 02 (≤ 840 · 1440×900 = 840) · จังหวะแนวตั้งกระชับ · หัวยอดที่ต้องชำระติดบนคอลัมน์ (sticky md+) ◂ */}
            <div className="flex min-w-0 flex-col gap-5 px-5 py-4 md:flex-1 md:gap-3.5 md:overflow-y-auto md:border-r md:px-[22px] md:pb-[14px] md:pt-0 xl:gap-[18px]">
              <div data-testid="pos-reg-paydlg-due-head" className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 md:sticky md:top-0 md:z-10 md:bg-[color:var(--color-surface)] md:pb-1 md:pt-[14px] xl:pt-[18px]">
                <div>
                  <div className="text-[12px] text-[color:var(--color-muted)]">{t("pay.due")}</div>
                  <div data-testid="pos-reg-paydlg-due" className="text-[44px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-[40px] xl:text-[52px]">
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

              {/* POS P2.9U ▸ มติ 4: GIFT_CARD_CHANGED = แบนเนอร์ + ค้นบัตรใหม่ (PIN ใส่ใหม่) ◂ */}
              {gcBanner && (
                <div data-testid="pos-reg-paydlg-giftcard-changed" className="flex items-start gap-2.5 rounded-[14px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-3 text-[14.5px] font-bold text-[color:var(--color-danger)]" role="alert">
                  <RegisterIcon name="warn" size={18} className="mt-0.5" />
                  <span className="min-w-0 flex-1">{t("pay.gc.changedBanner")}</span>
                  <button data-testid="pos-reg-paydlg-giftcard-changed-close" className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)]" type="button" aria-label={t("cart.close")} onClick={() => setGcBanner(false)}>
                    <RegisterIcon name="x" size={14} />
                  </button>
                </div>
              )}

              {/* POS P2.9bU ▸ มติ 4: DEPOSIT_EXCEEDS = แบนเนอร์ + ค้นแถวมัดจำใหม่ (จำนวนตัดลง) ◂ */}
              {depBanner && (
                <div data-testid="pos-reg-paydlg-deposit-changed" className="flex items-start gap-2.5 rounded-[14px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-3 text-[14.5px] font-bold text-[color:var(--color-danger)]" role="alert">
                  <RegisterIcon name="warn" size={18} className="mt-0.5" />
                  <span className="min-w-0 flex-1">{t("pay.depositChangedBanner")}</span>
                  <button data-testid="pos-reg-paydlg-deposit-changed-close" className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)]" type="button" aria-label={t("cart.close")} onClick={() => setDepBanner(false)}>
                    <RegisterIcon name="x" size={14} />
                  </button>
                </div>
              )}

              {err && !GC_INLINE_CODES.has(err.code) && !DEPOSIT_INLINE_CODES.has(err.code) && ( // POS P2.9U ▸ คำปฏิเสธของบัตรแสดงที่แถว/แบนเนอร์ (มติ 4) ◂ · POS P2.9bU ▸ + มัดจำ ◂
                <div data-testid="pos-reg-paydlg-error" data-code={err.code} className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] p-5" role="alert">
                  <div className="flex items-start gap-2.5 text-[17px] font-bold text-[color:var(--color-danger)]">
                    <RegisterIcon name="warn" size={18} className="mt-0.5" />
                    <span>{t.rich(err.key, { ...(err.values ?? {}), b: (c) => <b>{c}</b> })}</span>
                  </div>
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
                  <button
                    data-testid="pos-reg-paydlg-retry"
                    className="btn btn-primary h-14 rounded-[16px] text-[16px] font-bold"
                    type="button"
                    autoFocus
                    onClick={() => {
                      sentStripped.current = true; // POS P2.9bU ▸ มติ 3: ชุดที่ลองซ้ำไม่มี 4 หลักท้าย/PIN ◂
                      p.onRetry();
                    }}
                  >
                    {t("pay.retry")}
                  </button>
                </div>
              )}

              {showForm && p.memberSection}

              {showForm && !zero && (
                <div>
                  {rows.length > 0 && <div className="mb-1.5 text-[12px] text-[color:var(--color-muted)]">{t("pay.splitTitle")}</div>}
                  <div className="overflow-hidden rounded-[12px] border" role="list" aria-label={t("pay.splitTitle")}>
                    {rows.map((r) => {
                      // POS P2.9U ▸ แถวบัตร: "บัตรของขวัญ GC-••••1234 ฿325 ✓ · คงเหลือ ฿175" (คงเหลือ = ยอดค้นล่าสุด − จำนวน · แสดงอย่างเดียว) ◂
                      const gcN = r.type === "GIFT_CARD" ? gcRows.findIndex((x) => x.id === r.id) + 1 : 0;
                      const depN = r.type === "DEPOSIT" ? depRows.findIndex((x) => x.id === r.id) + 1 : 0; // POS P2.9bU ◂
                      const left = r.card && r.card.balanceSatang !== null ? r.card.balanceSatang - r.amountSatang : r.dep && r.dep.remainingSatang !== null ? r.dep.remainingSatang - r.amountSatang : null;
                      return (
                      <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0 border-b px-[14px] py-1 text-[13px] md:gap-x-[19px]" role="listitem">
                        <RegisterIcon name={methodIcon(r.type)} size={14} />
                        {r.type === "GIFT_CARD" ? (
                          <b data-testid={`pos-reg-paydlg-giftcard-row-${gcN}`} className="shrink-0">
                            {t(methodLabelKey(r.type))}
                            {r.card ? ` ${r.card.masked}` : ""}
                          </b>
                        ) : r.type === "STORE_CREDIT" ? (
                          <b data-testid="pos-reg-paydlg-storecredit-row" className="shrink-0">
                            {t(methodLabelKey(r.type))}
                            {r.card ? ` ${r.card.masked}` : ""}
                          </b>
                        ) : r.type === "DEPOSIT" ? (
                          // POS P2.9bU ▸ มติ 2d: "มัดจำ #<เลขใบรับ> ฿x ✓ · คงเหลือ ฿y" (คงเหลือ = ยอดค้นล่าสุด − จำนวน · แสดงอย่างเดียว) ◂
                          <b data-testid={`pos-reg-paydlg-deposit-split-${depN}`} className="shrink-0">
                            {t(methodLabelKey(r.type))}
                            {r.dep?.receiptNo ? ` #${r.dep.receiptNo}` : ""}
                          </b>
                        ) : (
                          <b className="shrink-0">{t(methodLabelKey(r.type))}</b>
                        )}
                        <span className="font-bold tabular-nums">{moneyText(r.amountSatang)}</span>
                        <RegisterIcon name="check" size={14} />
                        {/* POS P2.9U ▸ fix1 V4: แถวบัตร < md = "คงเหลือ ฿x" ขึ้นบรรทัดที่ 2 ใต้แถว (ไม่ตัดเหลือ "ค…") ◂ */}
                        <span
                          className={`min-w-0 flex-1 truncate text-[color:var(--color-muted)] ${
                            r.card || r.dep ? "max-md:order-last max-md:basis-full max-md:whitespace-normal max-md:pb-1 max-md:pl-[27px]" : ""
                          }`}
                        >
                          {r.card || r.dep // POS P2.9bU ▸ + แถวมัดจำ ◂
                            ? left !== null
                              ? t("pay.gc.rowLeft", { amount: moneyText(Math.max(left, 0)) })
                              : ""
                            : r.type === "CASH" && r.tenderedSatang !== undefined
                            ? t("pay.rowCash", { received: moneyText(r.tenderedSatang), change: moneyText(r.tenderedSatang - r.amountSatang) })
                            : r.via !== undefined
                              ? t(r.via === "WEBHOOK" ? "pay.intent.paidBeam" : "pay.intent.paidManual")
                              : r.reference
                              ? t("pay.rowRef", { ref: r.reference })
                              : ""}
                        </span>
                        <button
                          data-testid={`pos-reg-paydlg-row-remove-${r.id}`}
                          className="-mr-2 ml-auto grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50 aria-disabled:opacity-40"
                          type="button"
                          disabled={busy}
                          aria-disabled={r.via !== undefined || undefined}
                          aria-label={t("pay.removeRow", { method: t(methodLabelKey(r.type)), amount: moneyText(r.amountSatang) })}
                          onClick={() => removeRow(r.id)}
                        >
                          <RegisterIcon name="x" size={14} />
                        </button>
                        {/* POS P2.9bU ▸ มติ 3–4: แถวมัดจำต้องใส่ 4 หลักท้ายใหม่ (ผิด / ลองซ้ำหลังโหลดกลับ) ◂ */}
                        {r.type === "DEPOSIT" && r.dep?.note && (
                          <span className="flex basis-full items-center gap-3 pb-1 pl-[27px] max-md:order-last md:pl-[33px]">
                            <span data-testid={`pos-reg-paydlg-deposit-row-note-${depN}`} className="min-w-0 flex-1 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                              {t(r.dep.note === "wrong" ? "pay.depositLast4Wrong" : "pay.depositLast4Again")}
                            </span>
                            <button
                              data-testid={`pos-reg-paydlg-deposit-row-last4-${depN}`}
                              className="h-11 shrink-0 rounded-[10px] border px-3 text-[12.5px] font-bold disabled:opacity-50"
                              type="button"
                              disabled={busy}
                              onClick={() => reenterLast4(r)}
                            >
                              {t("pay.depositEnterLast4")}
                            </button>
                          </span>
                        )}
                        {r.type === "GIFT_CARD" && r.card?.note && (
                          <span className="flex basis-full items-center gap-3 pb-1 pl-[27px] max-md:order-last md:pl-[33px]">
                            <span data-testid={`pos-reg-paydlg-giftcard-row-note-${gcN}`} className="min-w-0 flex-1 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                              {t(r.card.note === "pinWrong" ? "pay.gc.pinWrong" : "pay.gc.pinAgain")}
                              {r.card.note === "pinWrong" && typeof r.card.left === "number" && <> · {t("pay.gc.pinLeft", { n: r.card.left })}</>}{/* POS P2.14 ▸ UI-9 ◂ */}
                            </span>
                            <button
                              data-testid={`pos-reg-paydlg-giftcard-row-pin-${gcN}`}
                              className="h-11 shrink-0 rounded-[10px] border px-3 text-[12.5px] font-bold disabled:opacity-50"
                              type="button"
                              disabled={busy}
                              onClick={() => reenterPin(r)}
                            >
                              {t("pay.gc.enterPin")}
                            </button>
                          </span>
                        )}
                      </div>
                      );
                    })}
                    {/* POS P2.9U ▸ มติ 6: Σ ทิปใต้รายการแยกจ่าย ◂ */}
                    {tip > 0 && (
                      <div data-testid="pos-reg-paydlg-tip-total" className="flex items-center gap-3 border-b px-[14px] py-2 text-[13px] text-[color:var(--color-ink-soft)]" role="listitem">
                        <span>{t("pay.gc.tipTotal")}</span>
                        <span className="flex-1" />
                        <span className="font-bold tabular-nums">{moneyText(tip)}</span>
                      </div>
                    )}
                    <div
                      data-testid="pos-reg-paydlg-remaining"
                      className="flex items-center gap-3 bg-[color:var(--color-accent-soft)] px-[14px] py-[11px] text-[14.5px] font-bold text-[color:var(--color-accent)] md:py-2"
                      role="listitem"
                    >
                      <span>{t("pay.remaining")}</span>
                      <span className="flex-1" />
                      <span className="tabular-nums">{moneyText(Math.max(remaining, 0))}</span>
                    </div>
                  </div>
                  {gcRowsNote && (
                    <p data-testid="pos-reg-paydlg-giftcard-note" className="mt-1.5 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="status">
                      {t(gcRowsNote)}
                    </p>
                  )}
                  {/* POS P2.9bU ▸ มติ 4: แถวมัดจำถูกถอด (ไม่พบ · ใช้หมด/คืนแล้ว · ของสมาชิกอื่น · ถูกล็อก 15 นาที) ◂ */}
                  {depNote && (
                    <p data-testid="pos-reg-paydlg-deposit-note" className="mt-1.5 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="status">
                      {t(depNote)}
                    </p>
                  )}
                </div>
              )}

              {showForm && !zero && (
                <div>
                  <div className="mb-1.5 text-[12px] text-[color:var(--color-muted)]">{t("pay.methodsTitle")}</div>
                  <div className={`grid grid-cols-2 gap-3 md:gap-2.5 xl:gap-3 ${platformOn ? "sm:grid-cols-5" : "sm:grid-cols-4"}`} role="group" aria-label={t("pay.methodsTitle")}>
                    {platformOn && (
                      // POS P2.1U ▸ มติ 6: ช่อง "แพลตฟอร์ม" (ช่องทาง payout PLATFORM เท่านั้น) — เลือกไว้แล้ว เต็มยอด ◂
                      <button
                        data-testid="pos-reg-paydlg-method-platform"
                        className={tile(method === "PLATFORM" && !busy)}
                        type="button"
                        aria-pressed={method === "PLATFORM"}
                        disabled={busy}
                        onClick={() => pickMethod("PLATFORM")}
                      >
                        <span>{t(PLATFORM_METHOD.label)}</span>
                        <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{p.platform?.name ? t("pay.platformVia", { name: p.platform.name }) : t("pay.platformHint")}</small>
                      </button>
                    )}
                    {METHODS.map((m) => {
                      const off = busy || platformOn || (m.type === "CASH" && !!cashRow) || (m.type === "PROMPTPAY" && !p.promptpayId);
                      const sub =
                        m.type === "CASH"
                          ? cashRow
                            ? t("pay.cashUsed", { amount: moneyText(cashRow.amountSatang) })
                            : null
                          : m.type === "PROMPTPAY"
                            ? p.promptpayId
                              ? t("pay.promptpayHint")
                              : !p.intent && p.manualManagerOnly // POS P2.8U ▸ fix 2 G1: ช่องปิดเพราะด่านผู้จัดการ (ไม่ใช่ร้านไม่ได้ตั้ง PromptPay) ◂
                                ? t("pay.intent.managerOnly")
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
                          className={tile(!acct /* POS P3.6U ◂ */ && method === m.type && !off)}
                          type="button"
                          aria-pressed={!acct && method === m.type}
                          disabled={off}
                          onClick={() => pickMethod(m.type)}
                        >
                          <span>{t(m.label)}</span>
                          {sub && <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{sub}</small>}
                        </button>
                      );
                    })}
                  </div>
                  {/* POS P2.9U ▸ มติ 1: แถวที่ 2 จริง (หน้าขายส่ง tenders) — บัตรของขวัญ · เครดิตร้าน · มัดจำ "เร็ว ๆ นี้" · ลงบิลห้องพักเฉพาะสาขาโรงแรม ◂ */}
                  {p.tenders ? (
                    <div className={`mt-3 grid grid-cols-2 gap-3 md:mt-2.5 md:gap-2.5 xl:mt-3 xl:gap-3 ${tenders?.roomCharge.visible ? "sm:grid-cols-4" : "sm:grid-cols-3"}`} role="group" aria-label={t("pay.gc.tilesTitle")}>
                      {(() => {
                        const gcOn = !!tenders?.giftCard.enabled && !busy && !platformOn && !p.lockedMethod;
                        const gcSub = !tenders ? null : !tenders.giftCard.enabled ? t("pay.gc.tileOff") : gcRows.length ? t("pay.gc.tileUsed", { count: gcRows.length }) : t("pay.gc.tileHint");
                        return (
                          <button
                            data-testid="pos-reg-paydlg-method-giftcard"
                            className={tile(gcMode && gcOn)}
                            type="button"
                            aria-pressed={gcMode}
                            disabled={!gcOn}
                            onClick={() => pickMethod("GIFT_CARD")}
                          >
                            <span>{tm("pay.tiles.giftcard")}</span>
                            {gcSub && <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{gcSub}</small>}
                          </button>
                        );
                      })()}
                      {(() => {
                        // POS P2.9bU ▸ มติ 1: เปิดเมื่อ tenders.deposit.enabled (ค่าตั้ง pos.deposit.enabled) · ปิด = "ยังไม่เปิดใช้" (reason DISABLED) · visible false = ไม่แสดง ◂
                        const dv = tenders?.deposit;
                        if (dv && !dv.visible) return null;
                        const depOn = !!dv?.enabled && !busy && !platformOn && !p.lockedMethod;
                        const depSub = !tenders ? null : !dv?.enabled ? t("pay.depositTileOff") : depRows.length ? t("pay.depositTileUsed", { count: depRows.length }) : t("pay.depositTileHint");
                        return (
                          <button
                            data-testid="pos-reg-paydlg-method-deposit"
                            className={tile(depMode && depOn)}
                            type="button"
                            aria-pressed={depMode}
                            disabled={!depOn}
                            onClick={() => pickMethod("DEPOSIT")}
                          >
                            <span>{tm("pay.tiles.deposit")}</span>
                            {depSub && <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{depSub}</small>}
                          </button>
                        );
                      })()}
                      {tenders?.roomCharge.visible && (
                        <button data-testid="pos-reg-paydlg-method-roomcharge" className={`${tile(false)} text-[color:var(--color-muted)] opacity-80`} type="button" disabled aria-disabled="true" title={tm("pay.comingSoon")}>
                          <span>{tm("pay.tiles.roomcharge")}</span>
                          <small className="text-[12px] font-normal">{`${tm("pay.tiles.roomchargeSub")} \u00b7 ${tm("pay.comingSoon")}`}</small>
                        </button>
                      )}
                      {(() => {
                        // มติ 1 + 5: สมาชิกในบิล + เครดิตร้าน > 0 · แถวเดียวต่อบิล
                        const scOn = !!sc && !scRow && !busy && !platformOn && !p.lockedMethod && !!tenders?.storeCredit.enabled;
                        const scSub = !p.member?.attached
                          ? t("pay.gc.scNoMember")
                          : !sc
                            ? t("pay.gc.scNoCredit")
                            : scRow
                              ? t("pay.cashUsed", { amount: moneyText(scRow.amountSatang) })
                              : t("pay.gc.scBalance", { amount: moneyText(sc.balanceSatang) });
                        return (
                          <button
                            data-testid="pos-reg-paydlg-method-storecredit"
                            className={tile(method === "STORE_CREDIT" && scOn)}
                            type="button"
                            aria-pressed={method === "STORE_CREDIT"}
                            disabled={!scOn}
                            onClick={() => pickMethod("STORE_CREDIT")}
                          >
                            <span>{tm("pay.tiles.storecredit")}</span>
                            <small className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{scSub}</small>
                          </button>
                        );
                      })()}
                      {oa && !platformOn && !p.lockedMethod && !acctHidden && (() => {
                        // POS P3.6U ▸ CD-P36U-5: ไทล์วางบิล — ไม่มีบริษัท = เหตุผล "เลือกบริษัท" (แตะ = เปิดแผ่นเลือก) · ไม่อนุญาต = ปิด + เหตุผล ◂
                        const off = busy || moneyIn || acctNotAllowed;
                        const why = !oa.company ? t("credit.pickCompany") : acctNotAllowed ? t("credit.errors.notAllowed") : null;
                        return (
                          <button
                            data-testid="pos-reg-paydlg-method-onaccount"
                            className={tile(acct && !off)}
                            type="button"
                            aria-pressed={acct}
                            aria-disabled={off || !oa.company}
                            disabled={busy || moneyIn || acctNotAllowed}
                            onClick={pickOnAccount}
                          >
                            <span>{t("credit.tile")}</span>
                            {why ? (
                              <small data-testid="pos-reg-paydlg-onaccount-reason" className="text-[12.5px] font-normal text-[color:var(--color-muted)]">
                                {why}
                              </small>
                            ) : (
                              <small className="truncate text-[12.5px] font-normal text-[color:var(--color-muted)]">{oa.company?.name}</small>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:mt-4 xl:gap-4" role="group" aria-label={tm("pay.tiles.title")}>
                    {/* POS P1.12U มติ 7 ▸ ไม่มี tenders (โต๊ะ/ออเดอร์) = ช่องแถวที่ 2 ปิดเสมอ ◂ */}
                    {SOON_TILES.map((s) => (
                      <button
                        key={s.id}
                        data-testid={`pos-reg-paydlg-method-${s.id}`}
                        className={`${tile(false)} text-[color:var(--color-muted)] opacity-80`}
                        type="button"
                        disabled
                        aria-disabled="true"
                        title={tm("pay.comingSoon")}
                      >
                        <span>{tm(s.label)}</span>
                        <small className="text-[12px] font-normal">{s.sub ? `${tm(s.sub)} \u00b7 ${tm("pay.comingSoon")}` : tm("pay.comingSoon")}</small>
                      </button>
                    ))}
                  </div>
                  )}
                  {/* POS P2.9U ▸ บัตรของสมาชิก (อ่านอย่างเดียว) — เฉพาะบัตรของขวัญ · เครดิตร้านอยู่บนช่องของมันเอง (F4) ◂ */}
                  {(p.giftCards ?? []).some((g) => giftCardKindOf(g) === "GIFT") && (
                    <p data-testid="pos-member-giftcards" className="mt-1.5 text-[12.5px] text-[color:var(--color-muted)]">
                      {(p.giftCards ?? []).filter((g) => giftCardKindOf(g) === "GIFT").map((g) => tm("pay.giftCardLine", { number: g.numberMasked, amount: moneyText(g.balanceSatang) })).join(" \u00b7 ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* POS P3.6U ▸ CD-P36U-5: วางบิล — คอลัมน์ขวา = สถานะวงเงิน (ทุกคนเห็นพอ/ไม่พอ · เทอม · ครบกำหนด · คงเหลือเฉพาะเมื่อเซิร์ฟเวอร์ส่งมา) ◂ */}
            {showForm && !zero && acct && oa && (
              <div className="flex flex-col gap-3 px-5 pb-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:bg-[color:var(--color-surface-2)] md:px-[22px] md:py-[18px] lg:w-[470px]">
                <h3 className="text-[16px] font-bold">{t("credit.title")}</h3>
                <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("credit.fullDue", { amount: moneyText(p.dueSatang) })}</p>
                <p className="text-[13px] text-[color:var(--color-muted)]">{oa.company?.name}</p>
                <div data-testid="pos-reg-paydlg-onaccount-status" data-state={acctSt?.state ?? "loading"} data-sufficient={acctSt?.state === "ok" ? String(acctSt.s.sufficient) : undefined} data-remaining={acctSt?.state === "ok" && acctSt.s.remainingSatang !== undefined ? "1" : undefined} role="status" className="flex flex-col gap-1.5 rounded-[14px] border bg-[color:var(--color-surface)] p-4 text-[14px]">
                  {acctSt?.state === "ok" ? (
                    <>
                      <b className={acctSt.s.sufficient ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}>{t(acctSt.s.sufficient ? "credit.sufficient" : "credit.insufficient")}</b>
                      {acctSt.s.termDays !== null && <span>{t("credit.termDays", { days: acctSt.s.termDays })}</span>}
                      {acctSt.s.dueDate && <span>{t("credit.dueDate", { date: ddmmyyyy(acctSt.s.dueDate, locale) })}</span>}
                      {acctSt.s.remainingSatang !== undefined && <span className="tabular-nums">{t("credit.remaining", { amount: moneyText(acctSt.s.remainingSatang) })}</span>}
                    </>
                  ) : acctSt?.state === "error" ? (
                    <span role="alert" className="font-semibold text-[color:var(--color-danger)]">
                      {t(acctSt.key)}
                    </span>
                  ) : (
                    <span className="text-[color:var(--color-muted)]">{t("credit.statusLoading")}</span>
                  )}
                </div>
                {oa.requireBuyer && !oa.buyer && (
                  <p data-testid="pos-reg-paydlg-onaccount-reason" className="text-[13px] font-semibold text-[color:var(--color-danger)]">
                    {t("credit.buyerRequired")}
                  </p>
                )}
                {acctMismatch && (
                  <p data-testid="pos-reg-paydlg-onaccount-buyer-mismatch" role="status" className="text-[13px] font-semibold text-[color:var(--color-note-ink)]">
                    {t("credit.buyerMismatch")}
                  </p>
                )}
              </div>
            )}
            {/* ── คอลัมน์ขวา (มือถือ: ต่อท้ายคอลัมน์ซ้าย · ไม่มีแป้นตัวเลข) ── */}
            {showForm && !zero && !acct /* POS P3.6U ◂ */ && (
              <div
                className={`flex flex-col px-5 pb-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:bg-[color:var(--color-surface-2)] md:px-[22px] lg:w-[470px] ${
                  // P1.7U แก้รอบ 2: มีแผง QR ⇒ ระยะ/แป้นกระชับ ให้แผง + ช่องจำนวน + แป้น 4 แถว + ปุ่มด่วน พอดีกล่องที่ 1440×900 และ 1024×768
                  panelOn ? "gap-3 md:py-[14px]" : "gap-4 md:py-[18px] xl:gap-[23px]"
                }`}
              >
                {intentMode && p.intent && (
                  <PayIntentPanel
                    h={pi}
                    setup={p.intent}
                    method={method === "CARD" ? "CARD" : "PROMPTPAY"}
                    amountSatang={roundAmount}
                    waiting={intentWaiting}
                    onOtherMethod={() => {
                      // POS P2.14 ▸ UI-1: การ์ดแดง 19ค "เลือกวิธีอื่น" = กลับเงินสด ◂
                      setMethod("CASH");
                      setEntry("");
                    }}
                  />
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
                    {edcManagerOnly && <small data-testid="pos-reg-paydlg-edc-manager-only" className="text-[12px] text-[color:var(--color-muted)]">{t("pay.intent.managerOnly")}</small>}
                  </label>
                )}

                {/* ═══ POS P2.9U ▸ มติ 2: แผงบัตรของขวัญ (แทนช่องจำนวน · แป้นตัวเลข = จำนวน/PIN ปิดบัง) ═══ */}
                {gcMode && (
                  <div data-testid="pos-reg-paydlg-giftcard-panel" className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[10px] border bg-[color:var(--color-surface)] px-3 text-[13px] text-[color:var(--color-muted)]">
                        <span className="sr-only">{t("pay.gc.number")}</span>
                        <RegisterIcon name="tag" size={14} />
                        <input
                          data-testid="pos-reg-paydlg-giftcard-number"
                          ref={gcNumberInput}
                          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold tabular-nums text-[color:var(--color-ink)] outline-none"
                          placeholder={t("pay.gc.numberPlaceholder")}
                          autoComplete="off"
                          maxLength={40}
                          value={gc.number}
                          disabled={busy || gc.forRow !== null}
                          onChange={(e) => {
                            const v = e.target.value;
                            setGcPin("");
                            setGc((g) => ({ ...g, number: v, look: null, amount: null, err: null, target: "amount" }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault(); // ไม่ส่งฟอร์มของกล่อง — Enter ที่ช่องเลขบัตร = ค้นบัตร
                              void gcLookup(gc.number);
                            }
                          }}
                        />
                      </label>
                      {p.onScanGiftCard && (
                        <button
                          data-testid="pos-reg-paydlg-giftcard-scan"
                          className="grid size-12 shrink-0 place-items-center rounded-[10px] border bg-[color:var(--color-surface)] disabled:opacity-50"
                          type="button"
                          aria-label={t("pay.gc.scan")}
                          disabled={busy || gc.forRow !== null}
                          onClick={() => p.onScanGiftCard?.()}
                        >
                          <RegisterIcon name="cam" size={16} />
                        </button>
                      )}
                      <button
                        data-testid="pos-reg-paydlg-giftcard-lookup"
                        className="btn btn-ghost h-12 shrink-0 rounded-[10px] px-4 text-[14px] font-bold disabled:opacity-50"
                        type="button"
                        disabled={busy || !gc.number.trim() || gc.look?.state === "loading" || gc.forRow !== null}
                        onClick={() => void gcLookup(gc.number)}
                      >
                        {gc.look?.state === "loading" ? tc("loading") : t("pay.gc.lookup")}
                      </button>
                    </div>
                    {gc.look?.state === "notFound" && (
                      <div data-testid="pos-reg-paydlg-giftcard-notfound" className="flex items-start gap-2 rounded-[12px] border-[1.5px] border-[color:var(--color-danger)] px-3 py-2.5 text-[13.5px] font-bold text-[color:var(--color-danger)]" role="alert">
                        <RegisterIcon name="warn" size={16} className="mt-0.5" />
                        <span>{t("pay.gc.notFound")}</span>
                      </div>
                    )}
                    {gc.look?.state === "error" && (
                      <p className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                        {t(gc.look.key)}
                      </p>
                    )}
                    {gcCard && (
                      <div data-testid="pos-reg-paydlg-giftcard-result" className="flex flex-col gap-1 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] py-2.5 text-[13.5px]">
                        <span className="font-bold tabular-nums">
                          {[gcCard.numberMasked, t("pay.gc.balance", { amount: moneyText(gcCard.balanceSatang) }), gcCard.expiresAt ? t("pay.gc.expires", { date: ddmmyy(gcCard.expiresAt) }) : null].filter(Boolean).join(" \u00b7 ")}
                        </span>
                        {!gcCard.usable && gcCard.reason && (
                          <span data-testid="pos-reg-paydlg-giftcard-unusable" className="text-[12.5px] text-[color:var(--color-muted)]">
                            {t(GC_REASON_KEY[gcCard.reason])}
                          </span>
                        )}
                      </div>
                    )}
                    {gcCard?.usable && (
                      <>
                        <button
                          data-testid="pos-reg-paydlg-giftcard-amount"
                          className={`flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-left text-[13px] text-[color:var(--color-muted)] ${
                            gc.target === "amount" && !gcRowFor ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                          }`}
                          type="button"
                          disabled={busy || !!gcRowFor}
                          onClick={() => {
                            setPadTip(false);
                            setGc((g) => ({ ...g, target: "amount" }));
                          }}
                        >
                          <span className="min-w-0 truncate">{t("pay.gc.amount")}</span>
                          <span className="text-[22px] font-bold tabular-nums text-[color:var(--color-ink)]">{gcRowFor || gc.amount === null ? hundredthsText(gcAmount) : gc.amount || "0"}</span>
                        </button>
                        {gcShort && (
                          <p data-testid="pos-reg-paydlg-giftcard-insufficient" className="-mt-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                            {t("pay.gc.short", { amount: moneyText(gcCard.balanceSatang) })}
                          </p>
                        )}
                        {gcAmountOver && (
                          <p className="-mt-1 text-[13px] text-[color:var(--color-danger)]" role="alert">
                            {t("pay.overRemaining", { method: t("pay.giftCard"), amount: moneyText(Math.max(remaining, 0)) })}
                          </p>
                        )}
                        <label
                          className={`flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-[13px] text-[color:var(--color-muted)] ${
                            gc.target === "pin" ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                          }`}
                        >
                          <span className="min-w-0 truncate">{t("pay.gc.pin")}</span>
                          <input
                            data-testid="pos-reg-paydlg-giftcard-pin"
                            ref={gcPinInput}
                            className="h-full w-40 min-w-0 bg-transparent text-right text-[22px] font-bold tracking-[0.3em] text-[color:var(--color-ink)] outline-none"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={GIFT_CARD_PIN_MAX}
                            defaultValue=""
                            disabled={busy}
                            aria-describedby="pos-gc-pin-hint"
                            onFocus={() => {
                              setPadTip(false);
                              setGc((g) => (g.target === "pin" ? g : { ...g, target: "pin" }));
                            }}
                            onChange={(e) => {
                              const d = e.target.value.replace(/\D/g, "").slice(0, GIFT_CARD_PIN_MAX);
                              if (d !== e.target.value) e.target.value = d;
                              setGcPin(d);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                gcUse();
                              }
                            }}
                          />
                        </label>
                        <p id="pos-gc-pin-hint" className="-mt-1 text-[12px] text-[color:var(--color-muted)]">
                          {t("pay.gc.pinHint", { min: GIFT_CARD_PIN_MIN, max: GIFT_CARD_PIN_MAX })}
                        </p>
                        <button
                          data-testid="pos-reg-paydlg-giftcard-use"
                          className="btn btn-primary h-12 rounded-[13px] text-[15px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
                          type="button"
                          disabled={!gcCanUse}
                          onClick={gcUse}
                        >
                          {gcRowFor ? t("pay.gc.usePin") : t("pay.gc.use", { amount: moneyText(gcAmount) })}
                        </button>
                      </>
                    )}
                    {gc.err && (
                      <p data-testid="pos-reg-paydlg-giftcard-error" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                        {t(gc.err)}
                      </p>
                    )}
                  </div>
                )}

                {/* ═══ POS P2.9bU ▸ มติ 2: แผงมัดจำ (แทนช่องจำนวน · แป้นตัวเลข = จำนวน/4 หลักท้ายปิดบัง) ═══ */}
                {depMode && (
                  <div data-testid="pos-reg-paydlg-deposit-panel" className="flex flex-col gap-3">
                    {depRowFor ? (
                      <div className="flex flex-col gap-1 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] py-2.5 text-[13.5px]">
                        <span className="font-bold tabular-nums">
                          {[`${t("pay.deposit")}${depRowFor.dep?.receiptNo ? ` #${depRowFor.dep.receiptNo}` : ""}`, moneyText(depRowFor.amountSatang)].join(" \u00b7 ")}
                        </span>
                        <span className="text-[12.5px] text-[color:var(--color-muted)]">{t("pay.depositLast4ForRow")}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[10px] border bg-[color:var(--color-surface)] px-3 text-[13px] text-[color:var(--color-muted)]">
                          <span className="sr-only">{t("pay.depositSearch")}</span>
                          <RegisterIcon name="search" size={14} />
                          <input
                            data-testid="pos-reg-paydlg-deposit-search"
                            ref={depSearchInput}
                            className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[color:var(--color-ink)] outline-none"
                            placeholder={t("pay.depositSearchPlaceholder")}
                            autoComplete="off"
                            maxLength={60}
                            value={dp.query}
                            disabled={busy}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDp((d) => ({ ...d, query: v, err: null }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault(); // Enter ที่ช่องค้น = ค้นมัดจำ (ไม่ส่งฟอร์มของกล่อง)
                                void depSearch();
                              }
                            }}
                          />
                        </label>
                        <button
                          data-testid="pos-reg-paydlg-deposit-lookup"
                          className="btn btn-ghost h-12 shrink-0 rounded-[10px] px-4 text-[14px] font-bold disabled:opacity-50"
                          type="button"
                          disabled={busy || !dp.query.trim() || dp.look?.state === "loading"}
                          onClick={() => void depSearch()}
                        >
                          {dp.look?.state === "loading" ? tc("loading") : t("pay.depositLookup")}
                        </button>
                      </div>
                    )}
                    {!depRowFor && dp.look?.state === "empty" && (
                      <div data-testid="pos-reg-paydlg-deposit-notfound" className="flex items-start gap-2 rounded-[12px] border-[1.5px] border-[color:var(--color-danger)] px-3 py-2.5 text-[13.5px] font-bold text-[color:var(--color-danger)]" role="alert">
                        <RegisterIcon name="warn" size={16} className="mt-0.5" />
                        <span>{t("pay.depositNotFound")}</span>
                      </div>
                    )}
                    {!depRowFor && dp.look?.state === "error" && (
                      <p className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                        {t(dp.look.key)}
                      </p>
                    )}
                    {!depRowFor && dp.look?.state === "found" && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] text-[color:var(--color-muted)]">{t(dp.look.byMember ? "pay.depositMemberList" : "pay.depositResults")}</span>
                        <div className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto" role="list">
                          {dp.look.rows.map((d, i) => {
                            const on = dp.sel?.id === d.id;
                            const open = d.status === "OPEN";
                            const right = !open
                              ? t(d.status === "REFUNDED" ? "pay.depositRefunded" : "pay.depositUsedUp")
                              : d.remainingSatang !== null
                                ? t("pay.gc.balance", { amount: moneyText(d.remainingSatang) }) // POS P2.9bU ▸ fix1 มติ 9: ยอดปัจจุบันของมัดจำ ("Balance ฿x" · th เดิม "คงเหลือ") — "Balance after" เฉพาะแถวแยกจ่าย ◂
                                : t("pay.depositNeedReceipt");
                            return (
                              <button
                                key={d.id}
                                data-testid={`pos-reg-paydlg-deposit-row-${i + 1}`}
                                className={`flex min-h-[48px] items-center gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-3 py-1.5 text-left text-[13px] disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)] ${
                                  on ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                                }`}
                                type="button"
                                role="listitem"
                                aria-pressed={on}
                                disabled={busy || !open}
                                onClick={() => depPick(d)}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  <b className="tabular-nums">{d.receiptNo ? `#${d.receiptNo}` : "-"}</b>
                                  {[d.customerName, d.phoneMasked].filter(Boolean).map((x) => ` \u00b7 ${x}`).join("")}
                                </span>
                                <span className={`shrink-0 tabular-nums ${d.remainingSatang !== null && open ? "font-bold" : "text-[12px] text-[color:var(--color-muted)]"}`}>{right}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(dp.sel?.needsPhoneLast4 || depRowFor) && (
                      <>
                        <label
                          className={`flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-[13px] text-[color:var(--color-muted)] ${
                            dp.target === "last4" || depRowFor ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                          }`}
                        >
                          <span className="min-w-0 truncate">{t("pay.depositLast4")}</span>
                          <input
                            data-testid="pos-reg-paydlg-deposit-last4"
                            ref={depLast4Input}
                            className="h-full w-28 min-w-0 bg-transparent text-right text-[22px] font-bold tracking-[0.3em] text-[color:var(--color-ink)] outline-none"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={DEP_LAST4}
                            defaultValue=""
                            disabled={busy || dp.verify === "loading"}
                            aria-describedby="pos-dep-last4-hint"
                            onFocus={() => {
                              setPadTip(false);
                              setDp((d) => (d.target === "last4" ? d : { ...d, target: "last4" }));
                            }}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, DEP_LAST4);
                              if (v !== e.target.value) e.target.value = v;
                              depLast4Typed(v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                depUse();
                              }
                            }}
                          />
                        </label>
                        <p id="pos-dep-last4-hint" className="-mt-1 text-[12px] text-[color:var(--color-muted)]">
                          {dp.verify === "loading" ? tc("loading") : t("pay.depositLast4Hint")}
                        </p>
                        {dp.verify === "wrong" && (
                          <p data-testid="pos-reg-paydlg-deposit-last4-wrong" className="-mt-1 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                            {t("pay.depositLast4Wrong")}
                          </p>
                        )}
                      </>
                    )}
                    {!depRowFor && dp.sel && depBal !== null && (
                      <>
                        <button
                          data-testid="pos-reg-paydlg-deposit-amount"
                          className={`flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-left text-[13px] text-[color:var(--color-muted)] ${
                            dp.target === "amount" ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""
                          }`}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setPadTip(false);
                            setDp((d) => ({ ...d, target: "amount" }));
                          }}
                        >
                          <span className="min-w-0 truncate">{t("pay.depositAmount")}</span>
                          <span className="text-[22px] font-bold tabular-nums text-[color:var(--color-ink)]">{dp.amount === null ? hundredthsText(depAmount) : dp.amount || "0"}</span>
                        </button>
                        {depShort && (
                          <p data-testid="pos-reg-paydlg-deposit-short" className="-mt-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                            {t("pay.depositShort", { amount: moneyText(depBal) })}
                          </p>
                        )}
                        {depAmountOver && (
                          <p className="-mt-1 text-[13px] text-[color:var(--color-danger)]" role="alert">
                            {t("pay.overRemaining", { method: t("pay.deposit"), amount: moneyText(Math.max(remaining, 0)) })}
                          </p>
                        )}
                      </>
                    )}
                    {(depRowFor || dp.sel) && (
                      <button
                        data-testid="pos-reg-paydlg-deposit-use"
                        className="btn btn-primary h-12 rounded-[13px] text-[15px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
                        type="button"
                        disabled={!depCanUse}
                        onClick={depUse}
                      >
                        {depRowFor ? t("pay.depositUseLast4") : depBal !== null ? t("pay.depositUse", { amount: moneyText(depAmount) }) : t("pay.depositUseNoAmount")}
                      </button>
                    )}
                    {dp.err && (
                      <p data-testid="pos-reg-paydlg-deposit-error" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                        {t(dp.err)}
                      </p>
                    )}
                  </div>
                )}

                {/* POS P2.9U ▸ มติ 5: เครดิตร้าน — เลขปิดบัง + ยอดเครดิต (จำนวนตัดที่ยอดเครดิต) ◂ */}
                {method === "STORE_CREDIT" && sc && (
                  <div data-testid="pos-reg-paydlg-storecredit-info" className="rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] py-2.5 text-[13.5px] font-bold tabular-nums">
                    {`${sc.numberMasked} \u00b7 ${t("pay.gc.balance", { amount: moneyText(sc.balanceSatang) })}`}
                  </div>
                )}

                {!panelMode && ( // POS P2.9bU ▸ panelMode (บัตรของขวัญ · มัดจำ) ◂
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
                    disabled={busy || piLocked || platformLock}
                    aria-invalid={plan.state === "invalid" || plan.state === "over"}
                    onFocus={() => setPadTip(false)}
                    onChange={(e) => setEntry(e.target.value)}
                  />
                </label>
                )}

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
                    {scOver ? t("pay.gc.scOver", { amount: moneyText(scBal) }) : t("pay.overRemaining", { method: methodName, amount: moneyText(remaining) })}
                  </p>
                )}
                {/* POS P2.9U ▸ ทิปลดลงหลังรับแถวไปแล้ว ⇒ ยอดรับเกิน (ถอดแถวแล้วรับใหม่) ◂ */}
                {remaining < 0 && !overPaid && (
                  <p data-testid="pos-reg-paydlg-over-due" className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                    {t("pay.gc.overDue", { amount: moneyText(-remaining) })}
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

                <div className={`hidden grid-cols-3 md:grid ${panelOn ? "gap-2.5" : "gap-3.5"}`} role="group" aria-label={t("pay.numpad")}>
                  {KEYS.map((k) => (
                    <button
                      key={k.id}
                      data-testid={`pos-reg-paydlg-key-${k.id}`}
                      className={`grid place-items-center rounded-[14px] border text-[21px] font-semibold tabular-nums active:bg-[color:var(--color-surface-2)] disabled:opacity-50 ${panelOn ? "h-[46px] xl:h-[52px]" : "h-14 xl:h-16"} ${
                        k.id === "00" || k.id === "back" ? "bg-[color:var(--color-surface-2)] text-[18px]" : "bg-[color:var(--color-surface)]"
                      }`}
                      type="button"
                      disabled={busy || piLocked || platformLock}
                      aria-label={k.id === "back" ? t("pay.backspace") : k.label}
                      onClick={() => press(k)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                {!panelMode && ( // POS P2.9bU ▸ panelMode ◂
                <div className="grid grid-cols-4 gap-2.5 xl:gap-4">
                  {QUICK.map((v) => (
                    <button
                      key={v}
                      data-testid={`pos-reg-paydlg-quick-${v / 100}`}
                      className="h-11 rounded-[8px] border bg-[color:var(--color-surface)] text-[13px] font-semibold tabular-nums disabled:opacity-50"
                      type="button"
                      disabled={busy || piLocked || platformLock || (method !== "CASH" && v > remaining)}
                      onClick={() => quick(v)}
                    >
                      {(v / 100).toLocaleString("th-TH")}
                    </button>
                  ))}
                  <button
                    data-testid="pos-reg-paydlg-quick-exact"
                    className="h-11 rounded-[8px] border bg-[color:var(--color-surface)] text-[13px] font-semibold disabled:opacity-50"
                    type="button"
                    disabled={busy || piLocked || platformLock}
                    onClick={exact}
                  >
                    {t("pay.exact")}
                  </button>
                </div>
                )}
              </div>
            )}
          </div>

          {/* ── ท้าย: ใบกำกับเต็มรูป (P1.13U) · ทิป · ย้อนกลับ · ปุ่มหลัก ── */}
          {showForm && (
            <div className="flex shrink-0 flex-col gap-3 border-t px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:flex-row md:items-center md:gap-[31px] md:px-[22px] md:py-[14px]">
              <div className="flex min-w-0 flex-1 flex-col gap-y-1">
              {p.taxInvoice ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                  <button
                    data-testid="pos-taxinv-toggle"
                    className={`flex h-11 items-center gap-3 font-bold disabled:cursor-not-allowed ${!p.taxInvoice.eligible ? "text-[color:var(--color-muted)]" : ""}`}
                    type="button"
                    role="switch"
                    aria-checked={!!p.taxInvoice.buyer}
                    aria-disabled={!p.taxInvoice.eligible || undefined}
                    disabled={busy}
                    onClick={() => (p.taxInvoice?.buyer ? p.taxInvoice.onClear() : p.taxInvoice?.onOpen())}
                  >
                    <span className={`relative h-6 w-10 rounded-full transition-colors ${p.taxInvoice.buyer ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}>
                      <span className={`absolute top-0.5 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${p.taxInvoice.buyer ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                    {t("taxInvoice.toggle")}
                  </button>
                  {!p.taxInvoice.eligible ? (
                    <span data-testid="pos-taxinv-not-eligible" className="min-w-0 text-[12.5px] text-[color:var(--color-muted)]">
                      {t("errors.taxInvoiceNotEligible")}
                    </span>
                  ) : p.taxInvoice.buyer ? (
                    <>
                      <span data-testid="pos-taxinv-footer-line" className="min-w-0 max-w-full truncate text-[12.5px] text-[color:var(--color-ink-soft)]">
                        {"\u2014 "}
                        {[
                          p.taxInvoice.buyer.name,
                          p.taxInvoice.buyer.taxId,
                          p.taxInvoice.buyer.branchCode && p.taxInvoice.buyer.branchCode !== HEAD_OFFICE_BRANCH_CODE
                            ? t("taxInvoice.branchOf", { code: p.taxInvoice.buyer.branchCode })
                            : t("taxInvoice.headOffice"),
                        ].join(" \u00b7 ")}
                      </span>
                      <button data-testid="pos-taxinv-edit" className="h-11 px-1 text-[12.5px] font-bold text-[color:var(--color-accent)] disabled:opacity-50" type="button" disabled={busy} onClick={p.taxInvoice.onOpen}>
                        {t("taxInvoice.edit")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {/* POS P2.9U ▸ มติ 6: ทิปแสดงเมื่อร้านเปิดทิป (payment settings tip.enabled · register/page.tsx:103) · เปิดได้เมื่อมีแถว/รอบที่เป็นเงินจริง ·
                  ยอดทิปกรอกด้วยแป้นตัวเลข (แตะช่องทิป) · ทิป ≤ Σ แถวเงินจริง (CASH/PROMPTPAY/TRANSFER/CARD) ◂ */}
              {p.tipEnabled && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <button
                  data-testid="pos-reg-paydlg-tip-toggle"
                  className="flex h-11 items-center gap-3 font-bold disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)]"
                  type="button"
                  role="switch"
                  aria-checked={tipOn}
                  disabled={busy || platformOn || (!tipOn && !tipAllowed)}
                  onClick={() => {
                    setTipOn((v) => !v);
                    setTipText("");
                    setPadTip(!tipOn);
                  }}
                >
                  <span className={`relative h-6 w-10 rounded-full transition-colors ${tipOn ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}>
                    <span className={`absolute top-0.5 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${tipOn ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  {t("pay.tip")}
                </button>
                {tipOn ? (
                  <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--color-muted)]">
                    {t("pay.tipAmount")}
                    <input
                      data-testid="pos-reg-paydlg-tip"
                      className={`input h-11 w-28 rounded-[10px] text-right text-[15px] font-bold tabular-nums text-[color:var(--color-ink)] ${padTip ? "border-[color:var(--color-ink)]" : ""}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={tipText}
                      placeholder="0"
                      disabled={busy}
                      aria-invalid={!tipOk || !tipFundOk}
                      onFocus={() => setPadTip(true)}
                      onChange={(e) => setTipText(e.target.value)}
                    />
                    <span>{t("pay.tipHint")}</span>
                  </label>
                ) : !tipAllowed ? (
                  <span data-testid="pos-reg-paydlg-tip-cashonly" className="min-w-0 text-[12.5px] text-[color:var(--color-muted)]">
                    {t("pay.gc.tipCashOnly")}
                  </span>
                ) : null}
                {tipOn && !tipFundOk && (
                  <span data-testid="pos-reg-paydlg-tip-over" className="min-w-0 text-[12.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t("pay.gc.tipOverCash", { amount: moneyText(cashLikeRows + cashLikeNow) })}
                  </span>
                )}
              </div>
              )}
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
                  title={edcManagerOnly ? t("pay.intent.managerOnly") : intentMode && !piPaid && !zero ? t("pay.intent.waitPaid") : undefined}
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
