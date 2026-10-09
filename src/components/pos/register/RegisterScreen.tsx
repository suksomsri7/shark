"use client";

// RegisterScreen.tsx — หน้าขายใหม่ (POS P1.3) · เจ้าของสถานะทั้งหมดของจอ (สเปก §3.3) + ตัวจับแป้นเดียว (§3.6 · G2) + โฟกัสช่องค้นหา (G5)
//
// เลย์เอาต์ (สเปก §2): D ≥1280 = แท็บยาว · กริด 4 · ตะกร้า 480 · แถบสถานะ  ·  T 1024–1279 = แท็บไอคอน · กริด 3 · ตะกร้า 380
//   M 768–1023 = กริด 2 · ตะกร้า 340 (ไม่มีภาพ)  ·  C <768 = หัวมือถือ · กริด 3 · แถบตะกร้าล่าง + แผ่นตะกร้า · หน้าเลื่อนทั้งหน้า
//   md+ = ล็อกความสูงจอ (100dvh − แถบบน 56) แล้วให้กริด/บรรทัดตะกร้าเลื่อนในพื้นที่ตัวเอง (มติ Q3) · โหมดรางไอคอน = NavRail.isRailPath
//
// เงิน (กติกาที่ต่อรองไม่ได้ของใบสั่ง B2):
//   1) ยอดบนจอ = priceCart ทันใจ → quote ของเซิร์ฟเวอร์ทับ (หน่วง 250ms · คำตอบเก่าทิ้งด้วยตัวนับ) · ยอดที่จ่าย = quote เสมอ
//      ชำระได้เมื่อ: มีของ · quote ล่าสุดตรงตะกร้าปัจจุบัน · ออนไลน์ · มีสิทธิ์ขาย · ไม่ได้กำลังส่ง
//   2) คีย์บิล (สเปก §3.4 + โน้ต B1.1 §6): 1 คีย์ต่อความพยายามขาย 1 บิล · ส่งแล้วเก็บ "ชุดคำขอ" ไว้ ลองซ้ำ = ส่งชุดเดิมทุกไบต์
//      ok (รวม duplicated) = เสร็จ → บิลถัดไปได้คีย์ใหม่ · UNKNOWN/INTERNAL/BUSY/เครือข่ายล้ม = ไม่แน่ใจ → คีย์เดิม + "ลองอีกครั้ง" เท่านั้น
//      IDEMPOTENCY_CONFLICT = มีบิลของคีย์นี้แล้ว → แสดงบิลเดิม (เลขใบเสร็จ/สถานะ) ห้ามขายซ้ำด้วยคีย์ใหม่เงียบ ๆ (ผู้ใช้กด "เริ่มบิลใหม่" เอง)
//      ปฏิเสธอื่น = ชัดว่าไม่มีบิล → คีย์ใหม่สำหรับครั้งหน้า · PRICE_CHANGED = ยอดใหม่จากคำตอบ ต้องกดยืนยันอีกครั้ง
//      กดซ้ำ/Enter ซ้ำ = ส่งได้ทีละครั้ง (sendingRef)
//   3) ข้อความผิดพลาดมาจาก refusalMessageKey(code) → pos.register.errors.* เท่านั้น (ไม่โชว์ message ไทยของเซิร์ฟเวอร์)
//
// P1.4 (บาร์โค้ด): ตัวจับ keydown ทั้งหน้า (capture) แยกเครื่องสแกนด้วย classifyScanBurst → onScannedCode = ทางสแกนทางเดียว
//   (ไม่ผ่านหน่วงค้นหา 200ms · Enter ของช่องค้นหาไม่ถึงเมื่อเป็นการสแกน) · สแกนซ้ำ = +1 (cartAddProduct) · choose = ScanChooserDialog ·
//   none = toast + "เพิ่มเป็นรายการกำหนดเอง?" เฉพาะผู้มีสิทธิ์ราคาเปิด · กล้อง = ScanCameraDialog
// จุดต่อของใบหลัง (สเปก §1.3): onHold/onOpenHeld (P1.5) · จอชำระ P1.6 U = PayDialog (ไฟล์ InterimPayDialog.tsx) + PayDone
//   (แยกจ่าย ≤10 · เงินรับ/ทอนบนแถวเงินสด · บัตร/โอนมีเลขอ้างอิง · ทิปนอกยอดบิล) · หมายเหตุบิล (BillNoteDialog) + หมายเหตุรายการ (LineEditor)
//   memberSlot ของ CartPanel (P1.12) · onNeedsApproval (P1.15 PIN)
// P1.2 U: pick → OptionsDialog เมื่อ optionGroupCount/variantCount > 0 (cartAddProduct พร้อม choiceId) · สินค้าชั่ง → WeighDialog
//   (cartAddWeighed น้ำหนักที่กรอก — ต้องมีสิทธิ์ราคาเปิด) · สแกนป้ายเครื่องชั่ง (weighed) → cartAddWeighed ด้วยป้าย · บรรทัดแสดงตัวเลือก/น้ำหนัก
// 🔴 ไฟล์ "use client": import จากโมดูล POS ได้แค่ register-shared · pricing-shared · scan-shared · register-actions (G9 · S5.17)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3) · testid เขียนตรงบนแท็กเสมอ (G1)

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import { useInApp } from "@/lib/ui/use-in-app";
import { priceCart, type PriceDiscount } from "@/lib/modules/pos/pricing-shared";
import {
  cartAddProduct,
  cartAddWeighed,
  cartToPriceInput,
  cartToQuoteInput,
  cartToSubmitInput,
  displayName,
  HELD_CART_EXPIRE_DAYS,
  moneyText,
  quoteInputToCart,
  refusalMessageKey,
  REGISTER_MAX_LINES,
  REGISTER_MAX_PAY_METHODS,
  REGISTER_MAX_QTY,
  type HeldCartNoticeCode,
  type PosApprovalView,
  type PosDiscountCaps,
  type HeldCartSummary,
  type RegisterCart,
  type RegisterCartLine,
  type RegisterPayMethod,
  type RegisterCategory,
  type RegisterProduct,
  type RegisterQuote,
  type RegisterSaleStatus,
  type RegisterScanResult,
  type RegisterStatus,
  type RegisterSubmitInput,
  type RegisterSubmitOk,
} from "@/lib/modules/pos/register-shared";
import { classifyScanBurst, scanKeyFromEvent, scanOutcome, SCAN_MAX_GAP_MS, type ScanKey } from "@/lib/modules/pos/scan-shared";
import {
  discardHeldCartAction,
  holdRegisterCartAction,
  listHeldCartsAction,
  quoteRegisterCartAction,
  recallHeldCartAction,
  registerCatalogAction,
  registerScanAction,
  registerStatusAction,
  submitRegisterSaleAction,
} from "@/lib/modules/pos/register-actions";
import { BillDiscountDialog } from "./BillDiscountDialog";
import { BillNoteDialog } from "./BillNoteDialog";
import { CartPanel, type CartTotalsModel } from "./CartPanel";
import type { CartLineModel } from "./CartLine";
import { CategoryChips } from "./CategoryChips";
import { ClearBillDialog } from "./ClearBillDialog";
import { CouponDialog } from "./CouponDialog";
import { CustomItemDialog } from "./CustomItemDialog";
import { HeldBillsDialog } from "./HeldBillsDrawer";
import { HeldRecallConfirmDialog, HoldLabelDialog } from "./HeldDialogs";
import { PayDialog, type PayChoice, type PayError, type PayPhase } from "./InterimPayDialog";
import { LineEditor, type LineEditResult } from "./LineEditor";
import { MobileCartBar } from "./MobileCartBar";
// ชื่อลงท้าย Sheet/Tabs = ตัวสแกนปุ่ม (F15.3) นับเป็น "คอมโพเนนต์กดได้" ⇒ ใช้ชื่อแฝงตอนวาง (ตัวที่กดได้จริงข้างในมี testid ครบแล้ว)
import { MobileCartSheet as CartSheetFrame } from "./MobileCartSheet";
import { OpenPriceDialog } from "./OpenPriceDialog";
import { OptionsDialog, type OptionsPick } from "./OptionsDialog";
import { ProductGrid } from "./ProductGrid";
import type { PickAnchor } from "./ProductCard";
import { RegisterModeTabs as ModeTabsNav } from "./RegisterModeTabs";
import { RegisterIcon } from "./RegisterIcon";
import { RegisterStatusBar } from "./RegisterStatusBar";
import { RegisterTopContext } from "./RegisterTopContext";
import { PayDone } from "./PayDone";
import { ScanCameraDialog } from "./ScanCameraDialog";
import { ScanChooserDialog } from "./ScanChooserDialog";
import { SearchRow } from "./SearchRow";
import { WeighDialog } from "./WeighDialog";
// POS P1.9 ▸ รหัสเครื่อง → กะของเครื่อง (ผูกบิล · ล็อกปุ่มชำระเมื่อบังคับเปิดกะ) ◂
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
// POS P1.15U ▸ ผู้ขายบนเครื่อง (โทเคน PIN ใน sessionStorage) · จอล็อก 13B · ล็อกเมื่อไม่ใช้งาน ◂
import { clearStaffSession, readStaffSession, writeStaffSession, type StaffSession } from "@/lib/modules/pos/staff-session";
import { listStaffForDeviceAction } from "@/lib/modules/pos/staff-pin-actions";
import { LockScreen, type LockMode } from "./LockScreen";
import { ApprovalWaitDialog, type ApprovalPinResult } from "./ApprovalWaitDialog";
// ชื่อลงท้าย Sheet = ตัวสแกนปุ่ม (F15.3) นับเป็นคอมโพเนนต์กดได้ ⇒ ชื่อแฝงตอนวาง (ปุ่มข้างในมี testid ครบ)
import { DiscountOverSheet as DiscountOverBox } from "./DiscountOverSheet";
import { useIdleLock } from "./use-idle-lock";
// POS P1.10 U ▸ heartbeat ของเครื่องนี้ → ชื่อเครื่อง + printerConfig (พิมพ์ใบเสร็จ · ชิปแถบล่าง) · เครื่องถูกเพิกถอน = แถบแดงค้าง + ล็อกปุ่มชำระ ◂
import { heartbeatAction } from "@/lib/modules/pos/device-actions";
import { POS_PRINTER_DEFAULTS, parsePrinterConfig, type PosDeviceView } from "@/lib/modules/pos/device-shared";
import { printerPaired } from "@/components/pos/print/printReceipt";

export type RegisterScreenProps = {
  systemId: string;
  unitId: string;
  tenantName: string;
  /** R4.1 F2: ผู้ใช้ของ session — คำขอค้างใน sessionStorage ผูกผู้ใช้ด้วย (สลับบัญชีในแท็บเดียวกันห้ามลองซ้ำคำขอของคนอื่น) */
  userId: string;
  units: { id: string; name: string }[];
  /** หน้าแรกของกริด (เซิร์ฟเวอร์) · null = โหลดไม่สำเร็จ (จอแจ้ง + ลองใหม่) */
  initialCatalog: { categories: RegisterCategory[]; products: RegisterProduct[]; nextCursor: string | null } | null;
  initialStatus: RegisterStatus | null;
  vat: { mode: "INCLUDED" | "NONE"; rateBp: number };
  limits: { canSell: boolean; canOverridePrice: boolean; maxDiscountBp: number | null };
  /** PromptPay ID ของร้าน (ใช้วาด QR ล็อกยอด) · null = ยังไม่ตั้ง */
  promptpayId: string | null;
  /** P1.6 R4/F5: ระบบนี้เปิดรับทิป (parsePosPaymentSettings · วันนี้ false เสมอจนกว่า P1.6b) */
  tipEnabled?: boolean;
  /** P1.2 U R2: สาขานี้ตั้งนโยบาย BLOCK (ห้ามขายเกินสต็อก) ⇒ ตัวแปรที่หมดเลือกไม่ได้ · ไม่ตั้ง/ALLOW_NEGATIVE = เลือกได้ */
  oversellBlock?: boolean;
  /** POS P1.15U: ล็อกจออัตโนมัติหลังไม่ใช้งาน N นาที (settings.pos.register.autoLockMinutes · 0 = ปิด) */
  autoLockMinutes?: number;
  /** POS P1.15U: เพดานส่วนลดตามบทบาทของระบบนี้ (registerDiscountCaps) — ผู้ขายในโทเคนที่ไม่ใช่ผู้ใช้ session ใช้ค่านี้คิดยอดบนจอ */
  discountCaps?: PosDiscountCaps;
};

type Msg = { key: string; values?: Record<string, string | number> };
/** ข้อความลอย — offerCustom = ปุ่ม "เพิ่มเป็นรายการกำหนดเอง?" (สแกนไม่พบ · เฉพาะผู้มีสิทธิ์ราคาเปิด · P1.4 B4) */
type ToastMsg = Msg & { offerCustom?: boolean };
/** บรรทัดใหม่ (ยังไม่มี key) — Omit แบบกระจายทีละสมาชิกของ union */
type NewLine = RegisterCartLine extends infer L ? (L extends unknown ? Omit<L, "key"> : never) : never;
type Layer =
  | { kind: "sheet" }
  | { kind: "line"; key: string; focus: "qty" | "discount" }
  | { kind: "billDiscount" }
  | { kind: "coupon" }
  | { kind: "custom" }
  | { kind: "openPrice"; productId: string }
  | { kind: "clear" }
  | { kind: "pay" }
  | { kind: "done"; result: RegisterSubmitOk; payMethods: RegisterPayMethod[] }
  | { kind: "note" }
  // P1.2 U: กล่องตัวเลือก/ตัวแปร (weighedBarcode = มาจากป้ายเครื่องชั่งที่สแกน) · กล่องน้ำหนัก (options = ที่เลือกมาก่อน)
  | { kind: "options"; product: RegisterProduct; weighedBarcode?: string; anchor?: PickAnchor }
  | { kind: "weigh"; product: RegisterProduct; options: string[]; note?: string }
  | { kind: "scanChoose"; products: RegisterProduct[] }
  | { kind: "camera" }
  // P1.5: ลิ้นชักบิลที่พัก · กล่องตั้งป้ายก่อนพัก · ถาม "พักตะกร้านี้ก่อน?" เมื่อเรียกคืนทับตะกร้าที่มีของ
  | { kind: "held" }
  | { kind: "holdLabel" }
  | { kind: "heldConfirm"; item: HeldCartSummary }
  // POS P1.15U: แผ่นส่วนลดเกินสิทธิ์ (next = ตะกร้าที่จะใช้ถ้าได้สิทธิ์) · กล่องรอผู้จัดการอนุมัติ 21B (heldCartId = บิลส่วนลดที่พักรอ)
  | { kind: "discountOver"; next: RegisterCart; wantBp: number }
  | { kind: "approval"; requestId: string; heldCartId?: string };
/**
 * POS P1.15U ▸ สิทธิ์ส่วนลดเกินเพดานของบิลนี้: pin = PIN ผู้จัดการที่เครื่อง (ส่งพร้อม submit · heldCartId = บิลส่วนลดที่พักรอ) ·
 * approved = เรียกคืนบิลพักที่อนุมัติแล้ว (quote ด้วยเพดานที่อนุมัติ · ใช้ได้เฉพาะตะกร้าเดิมทุกไบต์ — inputJson) ◂
 */
//   fix รอบ 1 F5: ทุกสิทธิ์จำส่วนลดที่อนุญาต (bp ของยอดก่อนส่วนลด + สตางค์) — ส่วนลดของตะกร้าเกินนี้ = ล้างสิทธิ์แล้วเปิดแผ่นใหม่
type DiscountAuth =
  | { kind: "pin"; managerUserId: string; managerName: string; managerPin: string; heldCartId?: string; bp: number; satang: number }
  | { kind: "approved"; heldCartId: string; inputJson: string; quote: RegisterQuote; bp: number; satang: number };

const newKey = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
};
/**
 * P1.4 R2: คีย์ของเครื่องสแกนตกลงในช่องกรอกอื่น (เช่น "รับเงิน" ของกล่องชำระ) ⇒ คืนค่าก่อนการสแกน
 *   ใช้ setter ของ prototype + เหตุการณ์ input ⇒ React (controlled input) รับค่าคืนด้วย
 */
const restoreFieldValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  if (el.value === value) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const isFinePointer = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

/** media query หลัง mount (null = ยังไม่รู้ — SSR/เฟรมแรก) */
function useMedia(q: string): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return v;
}

/** P1.2: บรรทัดที่ราคาคิดได้ที่เซิร์ฟเวอร์เท่านั้น (มีตัวเลือก · ป้ายเครื่องชั่ง · น้ำหนัก) */
const isPricedByServer = (l: RegisterCartLine) =>
  l.kind === "product" && ((l.options?.length ?? 0) > 0 || l.weighedBarcode !== undefined || l.weightGrams !== undefined);
/** R3 F1: ยอดรอ quote */
const PENDING = "\u2014";
/** ราคาประมาณของน้ำหนักที่พิมพ์เอง — ปัดครึ่งขึ้นของ กรัม × ราคาต่อกก. / 1000 (สูตรเดียวกับ WeighDialog / weighedPriceSatang) */
const weighedEstimate = (grams: number, perKg: number) => Math.floor((2 * grams * perKg + 1000) / 2000);

/** PERCENT ของตัวตรวจเพดาน (bp) → "10" สำหรับข้อความ {limit}% */
const pctText = (bp: number) => String(Number((bp / 100).toFixed(2)));

export function RegisterScreen(props: RegisterScreenProps) {
  const { systemId, unitId, userId, limits, vat } = props;
  const t = useTranslations("pos.register");
  const ts = useTranslations("pos.shift");
  const tc = useTranslations("common");
  const locale = useLocale();
  const wide = useMedia("(min-width: 768px)");
  const xl = useMedia("(min-width: 1280px)") === true;
  const inApp = useInApp();
  const searchRef = useRef<HTMLInputElement>(null);
  const base = `/app/sys/${systemId}`;

  // ═══════ แคตตาล็อก ═══════
  const [categories, setCategories] = useState<RegisterCategory[]>(props.initialCatalog?.categories ?? []);
  const [products, setProducts] = useState<RegisterProduct[]>(props.initialCatalog?.products ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(props.initialCatalog?.nextCursor ?? null);
  const [q, setQ] = useState("");
  /** q ที่ผลในกริดตอนนี้เป็นของมัน (Enter ตัดสินจากผลของคำค้นเดียวกันเท่านั้น) */
  const [shownQ, setShownQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [catalogPending, startCatalog] = useTransition();
  const catalogSeq = useRef(0);
  /** ทุกสินค้าที่เคยเห็น — บรรทัดตะกร้ายังแสดงได้แม้กริดเปลี่ยนหมวด/คำค้น */
  const known = useRef(new Map<string, RegisterProduct>((props.initialCatalog?.products ?? []).map((p) => [p.id, p])));
  const remember = (list: RegisterProduct[]) => list.forEach((p) => known.current.set(p.id, p));
  /** P1.2 U: choiceId → ชื่อตัวเลือกตามภาษาจอ (จากกล่องตัวเลือก) — บรรทัดตะกร้าวาดได้ก่อน quote มา */
  const optionNames = useRef(new Map<string, string>());
  const catalogueEmpty = !!props.initialCatalog && products.length === 0 && !q.trim() && categoryId === null && categories.length === 0 && !catalogPending;

  // ═══════ ตะกร้า + ยอด ═══════
  const [cart, setCart] = useState<RegisterCart>({ lines: [] });
  const [cartVer, setCartVer] = useState(0);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  /** keys = คีย์บรรทัดของตะกร้ารุ่นที่ quote นี้ตอบ (บรรทัดที่ i ของ quote ↔ keys[i]) — R3 F2 จับคู่ราคาบรรทัดตามคีย์ ไม่ใช่ตำแหน่ง */
  const [quote, setQuote] = useState<{ ver: number; q: RegisterQuote; keys: string[] } | null>(null);
  const [quoteErr, setQuoteErr] = useState<{ ver: number; code: string } | null>(null);
  const [quoteSlow, setQuoteSlow] = useState(false);
  const quoteSeq = useRef(0);
  const [warnAck, setWarnAck] = useState<Record<string, number>>({});

  // ═══════ ชั้นกล่อง · ข้อความลอย · การเชื่อมต่อ ═══════
  const [layers, setLayers] = useState<Layer[]>([]);
  const top = layers[layers.length - 1] ?? null;
  /** ชั้นล่าสุดที่วาดแล้ว — ตัวกันเปิดกล่องชำระซ้อน (B2.2 S2) อ่านจากนี่ ไม่ใช่ค่าที่ติดมากับ closure */
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const push = (l: Layer) => setLayers((s) => [...s, l]);
  const pop = () => setLayers((s) => s.slice(0, -1));
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: ToastMsg) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const [online, setOnline] = useState(true);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<RegisterStatus | null>(props.initialStatus);
  const synced = () => setLastSyncAt(new Date());

  // ═══════ P1.5 บิลที่พักของสาขา (ป้ายจำนวน + ลิ้นชัก) ═══════
  const [heldItems, setHeldItems] = useState<HeldCartSummary[] | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [heldExpireDays, setHeldExpireDays] = useState(HELD_CART_EXPIRE_DAYS);
  const [heldBusy, setHeldBusy] = useState(false);
  const heldBusyRef = useRef(false);
  /** ชื่อสินค้าของบรรทัดที่เรียกคืน (รวมที่ขายไม่ได้แล้ว — ไม่อยู่ใน known) */
  const heldNames = useRef(new Map<string, string>());
  /** คำเตือนของบิลที่เพิ่งเรียกคืน ผูกกับคีย์บรรทัด — เอาบรรทัดออก/บิลใหม่ = หายเอง */
  const [heldNotices, setHeldNotices] = useState<{ key: string; code: HeldCartNoticeCode; from?: number; to?: number }[]>([]);
  const heldSeq = useRef(0);
  const refreshHeld = useCallback(async () => {
    const seq = ++heldSeq.current;
    try {
      const r = await listHeldCartsAction({ systemId, unitId });
      if (seq !== heldSeq.current) return;
      if (r.ok) {
        setHeldItems(r.items);
        setHeldCount(r.count);
        setHeldExpireDays(r.expireDays);
      } else setHeldItems([]);
    } catch {
      if (seq === heldSeq.current) setHeldItems((v) => v ?? []);
    }
  }, [systemId, unitId]);
  useEffect(() => {
    void refreshHeld();
    // เครื่องอื่นในสาขาพัก/เรียกคืน ⇒ ป้ายจำนวนตามทันเมื่อกลับมาที่แท็บ
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshHeld();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshHeld]);

  // ═══════ POS P1.15U ▸ ผู้ขายบนเครื่อง + จอล็อก 13B (มติผู้คุมงาน 1 3 8) ═══════
  //   โทเคนอยู่ใน sessionStorage `pos-staff:<deviceId>` · ล็อกเมื่อ: ไม่มี/หมดอายุ · ไม่ใช้งานครบ N นาที · กดล็อก · คำขอใดตอบ STAFF_TOKEN_INVALID
  //   ล็อกไม่ทิ้งตะกร้า (อยู่ใน state) · ปลดด้วยคนเดิม = ขายต่อ · คนอื่น = พักตะกร้าของคนก่อน (ป้าย "สลับพนักงาน") แล้วเริ่มบิลใหม่
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  /** undefined = ยังไม่ได้อ่าน storage (SSR/เฟรมแรก) · null = ไม่มีโทเคน */
  const [staff, setStaff] = useState<StaffSession | null | undefined>(undefined);
  const staffRef = useRef(staff);
  staffRef.current = staff;
  /** คนที่ใช้เครื่องล่าสุด (คงไว้แม้โทเคนตาย — ชิป "ใช้งานอยู่" + เจ้าของตะกร้าตอนสลับ) */
  const lastStaffRef = useRef<StaffSession | null>(null);
  const [lockFlag, setLockFlag] = useState(false);
  const [lockedAt, setLockedAt] = useState<Date | null>(null);
  /** registerStatus ที่ถามพร้อมรหัสเครื่องตอบแล้ว (รู้สถานะทะเบียนเครื่อง) */
  const [deviceKnown, setDeviceKnown] = useState(false);
  useEffect(() => {
    const d = getPosDeviceId();
    setDeviceId(d);
    const cur = readStaffSession(d);
    setStaff(cur);
    if (cur) lastStaffRef.current = cur;
  }, []);
  // ── fix รอบ 1 F2: ร้านที่ยังไม่มีใครตั้ง PIN (ทุกแถวของ listStaffForDevice hasPin:false) = ขายด้วยผู้ใช้ session ได้ + แถบเตือนปิดได้ ·
  //    มี PIN แม้คนเดียว = กติกาล็อกเต็ม · เครื่องไม่ลงทะเบียน = ข้อความลงทะเบียนเหมือนเดิม · โหมดนี้ไม่ล็อกเมื่อไม่ใช้งาน ──
  const deviceReady = deviceKnown && !!deviceId && status?.deviceStatus === "ACTIVE";
  /** null = ยังไม่รู้ · true = มีคนตั้ง PIN แล้วอย่างน้อย 1 คน */
  const [anyPin, setAnyPin] = useState<boolean | null>(null);
  const refreshPins = useCallback(async () => {
    try {
      const r = await listStaffForDeviceAction({ systemId, unitId, ...(deviceId ? { deviceId } : {}) });
      setAnyPin(r.ok ? r.items.some((x) => x.hasPin) : true); // อ่านไม่ได้ = ถือว่ามี PIN (ล็อกไว้ก่อน — ปลอดภัยกว่า)
    } catch {
      setAnyPin(true);
    }
  }, [systemId, unitId, deviceId]);
  useEffect(() => {
    if (deviceReady) void refreshPins();
  }, [deviceReady, refreshPins]);
  const noPinMode = deviceReady && anyPin === false;
  const noPinBannerKey = `pos-nopin-banner:${deviceId ?? "-"}`;
  const [noPinDismissed, setNoPinDismissed] = useState(false);
  useEffect(() => {
    try {
      setNoPinDismissed(window.sessionStorage.getItem(noPinBannerKey) === "1");
    } catch {
      /* ไม่มี storage = แสดงแถบ */
    }
  }, [noPinBannerKey]);
  const dismissNoPin = () => {
    setNoPinDismissed(true);
    try {
      window.sessionStorage.setItem(noPinBannerKey, "1");
    } catch {
      /* จำไม่ได้ = ปิดเฉพาะหน้านี้ */
    }
  };
  const locked = lockFlag || (!staff && !noPinMode);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const lockNow = useCallback(() => {
    setLockFlag(true);
    setLockedAt(new Date());
  }, []);
  /** คำขอใดตอบ STAFF_TOKEN_INVALID ⇒ ลบโทเคน + ล็อก (ไม่ถอยไปใช้ผู้ใช้ session) */
  const staffTokenDead = () => {
    clearStaffSession(deviceId);
    setStaff(null);
    setLockedAt(new Date());
    showToast({ key: "errors.staffTokenInvalid" });
  };
  /** คำขอที่พกโทเคน: ส่ง deviceId ด้วยเสมอ (ลายเซ็นโทเคนผูกเครื่อง) */
  const tokenArgs = (): { deviceId?: string; staffToken?: string } => ({
    ...(deviceId ? { deviceId } : {}),
    ...(staffRef.current ? { staffToken: staffRef.current.staffToken } : {}),
  });
  const onUnlocked = async (next: StaffSession) => {
    const prev = lastStaffRef.current;
    // มติ 3: คนอื่นปลดล็อก ⇒ ตะกร้าที่ค้างพักไว้ในชื่อคนก่อน (ด้วยโทเคนของคนก่อน) · ว่าง = ไม่พัก · ระหว่างส่งบิล = ไม่แตะ
    //   fix รอบ 1 F10: โทเคนคนก่อนตาย ⇒ พักด้วยโทเคนของคนใหม่ ป้าย "สลับพนักงาน · <ชื่อคนก่อน>" · พักไม่ได้ทั้งสองทาง = ไม่สลับ (จอยังล็อก)
    //   ตะกร้าของคนก่อนไม่ค้างบนจอของคนใหม่เด็ดขาด
    if (prev && prev.userId !== next.userId && cartRef.current.lines.length && !frozenRef.current) {
      const who = prev.name ?? "-";
      const hold = async (token: string, label: string) => {
        try {
          return await holdRegisterCartAction({ systemId, unitId, ...(deviceId ? { deviceId } : {}), cart: cartToQuoteInput(cartRef.current), label, staffToken: token });
        } catch {
          return null;
        }
      };
      let r = await hold(prev.staffToken, t("lock.holdLabel"));
      if (!r?.ok) r = await hold(next.staffToken, `${t("lock.holdLabel")} · ${who}`.slice(0, 60));
      if (!r?.ok) {
        showToast({ key: "lock.switchHeldFailed", values: { name: who } });
        return; // ไม่สลับ — ตะกร้ายังเป็นของคนก่อน จอยังล็อก
      }
      resetBill();
      setLayers([]);
      showToast({ key: "lock.switchHeld", values: { name: who } });
      void refreshHeld();
    }
    if (deviceId) writeStaffSession(deviceId, next);
    lastStaffRef.current = next;
    setStaff(next);
    setLockFlag(false);
    setLockedAt(null);
  };
  const lockMode: LockMode = !deviceKnown || staff === undefined || (deviceReady && anyPin === null) ? "checking" : !deviceId ? "unregistered" : status?.deviceStatus === "REVOKED" ? "revoked" : status?.deviceStatus === "ACTIVE" ? "ready" : "unregistered";
  // POS P1.15U ▸ มติ 4: เพดานส่วนลดของผู้ขายในโทเคน (คนเดียวกับ session = limits ของหน้าเพจ · คนอื่น = ค่าตั้งตามบทบาท) + สิทธิ์เกินเพดานของบิลนี้ ◂
  const sellerCap: number | null =
    staff && staff.userId !== userId && props.discountCaps ? (props.discountCaps[staff.role] >= 10_000 ? null : props.discountCaps[staff.role]) : limits.maxDiscountBp;
  const [discAuth, setDiscAuth] = useState<DiscountAuth | null>(null);
  const [discBusy, setDiscBusy] = useState(false);
  const [discErr, setDiscErr] = useState<string | null>(null);
  /** ส่งต่อจาก send/ขออนุมัติ: บิลถูกพักที่เซิร์ฟเวอร์รออนุมัติ ⇒ ล้างจอ (resetBill นอก send) แล้วเปิด 21B */
  const [approvalHandoff, setApprovalHandoff] = useState<{ requestId: string; heldCartId?: string } | null>(null);
  /** เพดานที่ใช้คิดยอดบนจอ — มีสิทธิ์เกินเพดานแล้ว = ไม่จำกัด (เซิร์ฟเวอร์ตัดสินจริง) */
  // fix รอบ 1 F5: มีสิทธิ์เกินเพดาน = เพดานบนจอขยายเท่าที่อนุญาต (ไม่ปลดเพดาน) · เกินกว่านั้น = แผ่นส่วนลดเกินสิทธิ์อีกครั้ง
  const localCap = discAuth && sellerCap !== null ? Math.max(sellerCap, discAuth.bp) : sellerCap;

  // ═══════ การส่งบิล ═══════
  const [idemKey, setIdemKey] = useState(newKey);
  const [payPhase, setPayPhase] = useState<PayPhase>("form");
  const [payError, setPayError] = useState<PayError | null>(null);
  const [conflict, setConflict] = useState<{ receiptNo: string | null; saleStatus: RegisterSaleStatus | null } | null>(null);
  const sendingRef = useRef(false);
  /** ชุดคำขอที่ส่งไปแล้วแต่ยังไม่รู้ผล — ลองซ้ำต้องส่งตัวนี้ (ไม่สร้างใหม่) */
  const pendingSubmit = useRef<RegisterSubmitInput | null>(null);
  // R4 K5: คำขอที่ส่งแล้วแต่ยังไม่รู้ผล (คีย์ + payload + phase) อยู่รอด reload/Back ใน sessionStorage ต่อระบบ POS + สาขา
  //   ทุกการแตะ storage อยู่ใน try (private mode / ถูกบล็อก = ทำงานต่อแบบไม่จำ) · ลบเมื่อรู้ผล (ok · conflict · ปฏิเสธ) หรือ resetBill
  const pendingStoreKey = `pos-reg-pending:${systemId}:${unitId}:${userId}`;
  const savePending = (sale: RegisterSubmitInput, phase: "sending" | "unknown") => {
    try {
      // POS P1.15U ▸ fix รอบ 1 F3: PIN ผู้จัดการห้ามลง storage (อ่านได้จากเครื่อง) — สำเนาที่เก็บไม่มี managerPin/managerUserId ·
      //   โหลดกลับแล้วลองซ้ำ = บิลเดิมถ้าบันทึกแล้ว · ไม่งั้นได้ DISCOUNT_EXCEEDS_LIMIT ชัด ๆ (ไม่มีบิล) แล้วใส่ PIN ใหม่ · staffToken อยู่ใน sessionStorage อยู่แล้ว ◂
      const { managerPin: _pin, managerUserId: _mgr, ...stored } = sale;
      void _pin;
      void _mgr;
      window.sessionStorage.setItem(pendingStoreKey, JSON.stringify({ v: 1, userId, idempotencyKey: stored.idempotencyKey, sale: stored, phase }));
    } catch {
      /* เก็บไม่ได้ — ลองซ้ำในหน้านี้ยังได้ */
    }
  };
  const clearPending = () => {
    try {
      window.sessionStorage.removeItem(pendingStoreKey);
    } catch {
      /* ไม่มีอะไรให้ลบ */
    }
  };
  const frozen = payPhase === "sending" || payPhase === "unknown" || payPhase === "conflict";
  /** ค่าล่าสุดที่วาดแล้ว — งาน async (ผลสแกน) อ่านจาก ref ไม่ใช่ค่าที่ติดมากับ closure ตอนกด Enter (B2.2 S1) */
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  // POS P1.15U ▸ มติ 8: ไม่ใช้งานครบ N นาที / แท็บถูกซ่อนนานเกิน ⇒ ล็อก (ไม่ล็อกระหว่างส่งบิล/ผลยังไม่แน่ใจ) ◂
  useIdleLock(props.autoLockMinutes ?? 2, !locked && !frozen && !noPinMode, lockNow);
  // POS P1.15U ▸ fix รอบ 1 F4: ล็อกตอนกล่องชำระยังอยู่ในขั้นกรอก = ปิดกล่องชำระ (ระหว่างส่ง/ไม่แน่ใจ ห้ามปิด — สเปก §3.4) ◂
  useEffect(() => {
    if (locked && payPhase === "form") setLayers((s) => (s.some((l) => l.kind === "pay") ? s.filter((l) => l.kind !== "pay") : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือการล็อก
  }, [locked]);
  /** รุ่นของบิล — resetBill เพิ่มทุกครั้ง · ผลสแกนที่เริ่มในบิลรุ่นก่อน = ทิ้ง (B2.2 S1) */
  const billGen = useRef(0);

  // B2.2 N2: ระหว่างส่ง/ผลยังไม่แน่ใจ มี "ชุดคำขอที่ส่งแล้ว" ค้างในหน่วยความจำ — ปิด/รีโหลดแท็บ = เสียชุดนั้น
  //   (ลองซ้ำด้วยชุดเดิมไม่ได้อีก ⇒ เสี่ยงเก็บเงินซ้ำด้วยบิลใหม่) ⇒ ให้เบราว์เซอร์ถามก่อนออก
  useEffect(() => {
    if (payPhase !== "sending" && payPhase !== "unknown") return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [payPhase]);

  const focusSearch = useCallback((select = false) => {
    if (!isFinePointer()) return; // จอสัมผัสล้วน: ไม่เด้งคีย์บอร์ดทับกริด (สเปก §3.6)
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    if (select) el.select();
  }, []);
  useEffect(() => {
    focusSearch();
  }, [focusSearch]);
  // B2.3 R1: ปิดกล่องสุดท้าย ⇒ โฟกัสช่องค้นหา "หลัง commit" — ระหว่างที่ยังมีชั้นกล่อง ของหลังม่าน inert ⇒ focus() ในตัวจับเดียวกับ pop/setLayers ไม่มีผล
  //   (บาร์โค้ดแรกของบิลถัดไปจะหาย) · focusSearch ข้ามจอสัมผัสล้วนเหมือนเดิม (ไม่เด้งคีย์บอร์ด) · ห้ามเรียก focusSearch ข้าง pop()/setLayers([]) อีก
  const hadLayers = useRef(false);
  useEffect(() => {
    if (layers.length > 0) {
      hadLayers.current = true;
      return;
    }
    if (hadLayers.current) {
      hadLayers.current = false;
      focusSearch();
    }
  }, [layers.length, focusSearch]);

  // ── ออนไลน์/ออฟไลน์ (navigator.onLine + เหตุการณ์) ──
  useEffect(() => {
    const apply = () => {
      const on = navigator.onLine;
      setOnline(on);
      setOfflineSince((s) => (on ? null : (s ?? new Date())));
    };
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  // ── POS P1.10 U ▸ เครื่องนี้ (heartbeat): undefined = ยังไม่รู้ · null = ยังไม่ลงทะเบียน ──
  const [device, setDevice] = useState<PosDeviceView | null | undefined>(undefined);
  const refreshDevice = useCallback(async () => {
    const deviceCode = getPosDeviceId();
    if (!deviceCode) return setDevice(null);
    const hb = await heartbeatAction({ systemId, unitId, deviceCode }).catch(() => null);
    if (hb?.ok) setDevice(hb.device);
  }, [systemId, unitId]);
  const printer = useMemo(() => {
    const parsed = device && device.status === "ACTIVE" ? parsePrinterConfig(device.printerConfig) : null;
    return { config: parsed?.ok ? parsed.config : { ...POS_PRINTER_DEFAULTS }, deviceCode: device?.deviceCode ?? getPosDeviceId() };
  }, [device]);

  // ── แถบสถานะ: ทุก 60 วิ ขณะเห็นจอ + หลังขายเสร็จ ──
  const statusSeq = useRef(0);
  const refreshStatus = useCallback(async () => {
    const seq = ++statusSeq.current;
    try {
      const r = await registerStatusAction({ systemId, unitId, deviceId: getPosDeviceId() });
      if (seq !== statusSeq.current) return; // B2.2 N3: คำตอบเก่าที่มาช้ากว่าคำตอบใหม่ = ทิ้ง
      if (r.ok) {
        setStatus(r);
        synced();
        setDeviceKnown(true); // POS P1.15U ▸ จอล็อกรู้สถานะทะเบียนเครื่องแล้ว ◂
      }
      void refreshDevice();
    } catch {
      /* เครือข่ายล้ม — ค่าเดิมค้างไว้ */
    }
  }, [systemId, unitId, refreshDevice]);
  useEffect(() => {
    // P1.9: สถานะจากเซิร์ฟเวอร์ตอนโหลดหน้าไม่รู้รหัสเครื่อง (localStorage) ⇒ ถามใหม่ทันทีพร้อม deviceId
    void refreshStatus();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus();
    }, 60_000);
    // R3 V3: กลับมาที่แท็บ (เช่น หลังเปิดกะในหน้ากะ) ⇒ ถามสถานะใหม่ทันที — ชิปกะ/แถบเปิดกะ/ปุ่มชำระตามทัน
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshStatus]);

  // ── โหลดกริด: คำค้น (หน่วง 200ms) · หมวด (ทันที) · หน้าถัดไป ──
  const loadCatalog = useCallback(
    (nq: string, cat: string | null, cursor?: string) => {
      const seq = ++catalogSeq.current;
      startCatalog(async () => {
        try {
          const r = await registerCatalogAction({ systemId, unitId, q: nq.trim() || undefined, categoryId: cat ?? undefined, cursor });
          if (seq !== catalogSeq.current) return; // คำตอบเก่า
          if (!r.ok) {
            showToast({ key: refusalMessageKey(r.code) === "errors.invalidLine" ? "errors.loadFailed" : refusalMessageKey(r.code) });
            return;
          }
          synced();
          remember(r.products);
          setCategories(r.categories);
          setProducts((prev) => (cursor ? [...prev, ...r.products.filter((p) => !prev.some((x) => x.id === p.id))] : r.products));
          setNextCursor(r.nextCursor);
          setShownQ(nq);
        } catch {
          if (seq === catalogSeq.current) showToast({ key: "errors.loadFailed" });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remember/synced อ่าน ref/setter เท่านั้น
    [systemId, unitId, showToast],
  );
  const firstQ = useRef(true);
  /** P1.4: สแกนจากช่องค้นหาล้างคำค้น (ตัวอักษรของเครื่องสแกน) — กริดยังเป็นของคำค้นว่างอยู่แล้ว ⇒ ไม่ต้องโหลดซ้ำ */
  const qClearedByScan = useRef(false);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
    }
    if (qClearedByScan.current) {
      qClearedByScan.current = false;
      if (q === "" && shownQ === "") return; // ตัวหน่วงที่ค้างถูกยกเลิกโดย cleanup ของ effect รอบก่อนแล้ว
    }
    const id = setTimeout(() => loadCatalog(q, categoryId), 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- หมวดเปลี่ยนโหลดเองที่ pickCategory
  }, [q]);
  const pickCategory = (id: string | null) => {
    setCategoryId(id);
    loadCatalog(q, id);
  };
  const loadMore = useCallback(() => {
    if (nextCursor && !catalogPending) loadCatalog(shownQ, categoryId, nextCursor);
  }, [nextCursor, catalogPending, loadCatalog, shownQ, categoryId]);

  // ═══════ ราคา: ทันใจ (priceCart) แล้ว quote ของเซิร์ฟเวอร์ทับ ═══════
  const local = useMemo(() => {
    if (!cart.lines.length) return null;
    // P1.2: ส่วนต่างของตัวเลือก/ราคาตามน้ำหนักอยู่ที่เซิร์ฟเวอร์เท่านั้น ⇒ ตะกร้าที่มีบรรทัดแบบนั้นใช้ quote (ไม่เดายอด)
    if (cart.lines.some(isPricedByServer)) return null;
    const input = cartToPriceInput(cart, known.current, vat, localCap);
    if ("ok" in input) return null; // สินค้าไม่รู้จัก/ไม่มีราคา — รอ quote ของเซิร์ฟเวอร์ตัดสิน
    const r = priceCart(input);
    return r.ok ? r : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- known เปลี่ยนพร้อม cartVer
  }, [cart, cartVer, vat, localCap]);

  const changeCart = (next: RegisterCart) => {
    setCart(next);
    setCartVer((v) => v + 1);
  };
  /** แก้ตะกร้าจากค่าล่าสุดเสมอ (setCart แบบฟังก์ชัน) — ใช้กับการเพิ่มสินค้าที่อาจมาจากงาน async (B2.2 S1) */
  const updateCart = (fn: (prev: RegisterCart) => RegisterCart) => {
    setCart(fn);
    setCartVer((v) => v + 1);
  };
  useEffect(() => {
    if (!cart.lines.length) {
      quoteSeq.current++;
      setQuote(null);
      setQuoteErr(null);
      setQuoteSlow(false);
      return;
    }
    const ver = cartVer;
    const seq = ++quoteSeq.current;
    setQuoteSlow(false);
    const slow = setTimeout(() => {
      if (seq === quoteSeq.current) setQuoteSlow(true);
    }, 400);
    const id = setTimeout(async () => {
      try {
        const r = await quoteRegisterCartAction({ systemId, unitId, cart: cartToQuoteInput(cart) });
        if (seq !== quoteSeq.current) return;
        if (r.ok) {
          setQuote({ ver, q: r, keys: cart.lines.map((l) => l.key) });
          setQuoteErr(null);
          synced();
        } else {
          setQuoteErr({ ver, code: r.code });
        }
      } catch {
        if (seq === quoteSeq.current) setQuoteErr({ ver, code: "UNKNOWN" });
      } finally {
        if (seq === quoteSeq.current) setQuoteSlow(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เวอร์ชันตะกร้าคือตัวกระตุ้นเดียว
  }, [cartVer]);

  const quoteServer = quote && quote.ver === cartVer ? quote.q : null;
  const quoteErrNow = quoteErr && quoteErr.ver === cartVer ? quoteErr.code : null;
  // POS P1.15U ▸ ส่วนลดเกินเพดานที่มีสิทธิ์แล้ว: quote ของเซิร์ฟเวอร์ปฏิเสธ (quote ไม่รู้จัก PIN/บิลที่อนุมัติ) ⇒ ยอดสำหรับชำระ =
  //   อนุมัติแล้ว: quote ที่เรียกคืนด้วยเพดานที่อนุมัติ (ตะกร้าเดิมทุกไบต์) · PIN: priceCart ไม่จำกัดเพดาน (ราคาบรรทัดตัวเลือก/ชั่งจาก quote ล่าสุด) —
  //   ยอดไม่ตรงเซิร์ฟเวอร์ = PRICE_CHANGED พร้อมยอดจริง (ยืนยันอีกครั้ง) ◂
  const cartInputJson = useMemo(() => JSON.stringify(cartToQuoteInput(cart)), [cart]);
  const overrideQuote: RegisterQuote | null =
    quoteServer || quoteErrNow !== "DISCOUNT_EXCEEDS_LIMIT" || !discAuth
      ? null
      : discAuth.kind === "approved"
        ? discAuth.inputJson === cartInputJson
          ? discAuth.quote
          : null
        : localQuote(cart);
  const quoteFresh = quoteServer ?? overrideQuote;
  const quoteFailed = quoteErrNow && !overrideQuote ? quoteErrNow : null;
  // R3 F1: ตะกร้าที่มีบรรทัดราคาฝั่งเซิร์ฟเวอร์ (ตัวเลือก/ชั่ง) และ quote ยังไม่ตรงรุ่น = ยอดรอ (—) — ห้ามโชว์ยอดของตะกร้าเก่าค้าง
  const totalsPending = !quoteFresh && cart.lines.some(isPricedByServer);
  const shownTotals: CartTotalsModel | null = totalsPending ? null : (quoteFresh ?? (local ? { ...local } : quote?.q ?? null));
  // POS P1.9 (S15): จุดขายบังคับเปิดกะ แต่เครื่องนี้ยังไม่มีกะ = ล็อกปุ่มชำระ + การ์ด "เปิดกะก่อนเริ่มขาย"
  const shiftBlocked = !!status?.shiftRequired && !status?.shift;
  // POS P1.10 U ▸ เครื่องถูกเพิกถอน (registerStatus.deviceStatus) = ล็อกการขาย (เซิร์ฟเวอร์ปฏิเสธ DEVICE_REVOKED อยู่แล้ว — จอไม่ให้เริ่ม) ◂
  const deviceRevoked = status?.deviceStatus === "REVOKED";
  const payEnabled = cart.lines.length > 0 && !!quoteFresh && online && limits.canSell && payPhase === "form" && !frozen && !shiftBlocked && !deviceRevoked;
  const lastAmount = quoteFresh?.grandTotalSatang ?? local?.grandTotalSatang ?? quote?.q.grandTotalSatang ?? 0;
  const payAmount = quoteSlow && !quoteFresh ? tc("loading") : totalsPending ? PENDING : moneyText(cart.lines.length ? lastAmount : 0);

  // ข้อความใต้ยอด: ออฟไลน์ > ไม่มีสิทธิ์ > quote ล้ม
  const errorMsg: Msg | null = !online
    ? { key: "errors.offline" }
    : !limits.canSell
      ? { key: "errors.permissionDenied" }
      : quoteFailed && cart.lines.length
        ? errorFor(quoteFailed)
        : null;

  function errorFor(code: string): Msg {
    const key = refusalMessageKey(code);
    if (key === "errors.discountExceedsLimit") return { key, values: { limit: pctText(sellerCap ?? 0) } };
    if (key === "errors.tooManyLines") return { key, values: { max: REGISTER_MAX_LINES } };
    if (key === "errors.stockInsufficient") return { key, values: { count: 0 } };
    return { key };
  }
  const msgNode = (m: Msg) => t.rich(m.key, { ...(m.values ?? {}), b: (c) => <b>{c}</b> });

  // ── แบบจำลองบรรทัดสำหรับวาด (ราคาเซิร์ฟเวอร์ทับราคากริดเมื่อ quote ตรงตะกร้า — มติ Q22) ──
  /** P1.2 U: บรรทัดรองของตัวเลือก/น้ำหนัก — ชื่อตามภาษาจอจากกล่องตัวเลือกก่อน แล้วค่อยชื่อจาก quote · น้ำหนักจาก quote (ป้าย) หรือที่กรอก */
  const lineDetail = (l: RegisterCartLine, ql: RegisterQuote["lines"][number] | undefined): string => {
    if (l.kind !== "product") return "";
    const opts = (l.options ?? []).map((id) => optionNames.current.get(id) ?? ql?.options.find((o) => o.choiceId === id)?.name ?? "").filter(Boolean);
    const grams = ql?.weightGrams ?? l.weightGrams ?? null;
    const w = grams !== null ? t("line.grams", { grams: grams.toLocaleString("th-TH") }) : l.weighedBarcode !== undefined ? t("line.label") : "";
    return [...opts, w].filter(Boolean).join(" · ");
  };
  const lineModels: CartLineModel[] = cart.lines.map((l, i) => {
    const ql = quoteFresh?.lines[i];
    const ll = local?.lines[i];
    const prod = l.kind === "product" ? known.current.get(l.productId) : undefined;
    // R3 F1: บรรทัดราคาฝั่งเซิร์ฟเวอร์ที่ยังไม่มี quote สด = รอ (—) · ยกเว้นน้ำหนักที่พิมพ์เองไม่มีตัวเลือก = ประมาณด้วยสูตรเดียวกับ WeighDialog
    const serverPriced = isPricedByServer(l);
    const est =
      serverPriced && !ql && l.kind === "product" && l.weightGrams !== undefined && !(l.options?.length ?? 0) && typeof prod?.priceSatang === "number"
        ? weighedEstimate(l.weightGrams, prod.priceSatang)
        : null;
    const pending = serverPriced && !ql && est === null;
    const unit = ql?.unitPriceSatang ?? est ?? ll?.unitPriceSatang ?? (l.kind === "custom" ? l.unitPriceSatang : (l.openPriceSatang ?? prod?.priceSatang ?? 0));
    const stockLeft = prod && prod.trackStock && prod.stockLeft !== null ? prod.stockLeft : null;
    const over = stockLeft !== null && l.qty > stockLeft;
    return {
      key: l.key,
      name: l.kind === "custom" ? l.name : prod ? displayName(prod, locale) : (heldNames.current.get(l.productId) ?? "-"),
      qty: l.qty,
      unitPriceSatang: unit,
      grossSatang: ql?.grossSatang ?? ll?.grossSatang ?? unit * l.qty,
      discountSatang: ql?.discountSatang ?? ll?.discountSatang ?? 0,
      stockLeft,
      warn: over && warnAck[l.key] !== l.qty,
      ...(pending ? { pending: true } : {}),
      ...(l.note ? { note: l.note } : {}),
      ...(lineDetail(l, ql) ? { detail: lineDetail(l, ql) } : {}),
    };
  });
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart.lines) if (l.kind === "product") m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [cart]);
  const peek = cart.lines
    .slice(0, 6)
    .map((l) => {
      const nm = l.kind === "custom" ? l.name : displayName(known.current.get(l.productId) ?? { name: "-" }, locale);
      return l.qty > 1 ? `${nm} ×${l.qty.toLocaleString("th-TH")}` : nm;
    })
    .join(" · ");

  // ═══════ การกระทำบนตะกร้า ═══════
  const soon = () => showToast({ key: "soon" });

  // ═══════ P1.5 พักบิล / เรียกคืน ═══════
  // H5: พักสำเร็จ ⇒ resetBill() (ล้างจอ + หมุนคีย์บิล "ที่เดียว" ตาม S5.21) · เรียกคืน ⇒ resetBill() ก่อนวางตะกร้าที่คืน (คีย์ใหม่เสมอ ·
  //     บิลที่พักไม่เคยพกคีย์ไปด้วย — cartToQuoteInput ไม่มีคีย์) · พักล้ม = ตะกร้าเดิมอยู่ครบ
  const onHold = async (label?: string): Promise<boolean> => {
    if (frozenRef.current || frozen || !cart.lines.length || heldBusyRef.current) return false;
    heldBusyRef.current = true;
    setHeldBusy(true);
    try {
      const r = await holdRegisterCartAction({ systemId, unitId, ...tokenArgs(), cart: cartToQuoteInput(cart), label: label?.trim() || null });
      if (!r.ok) {
        if (r.code === "STAFF_TOKEN_INVALID") staffTokenDead();
        else showToast(errorFor(r.code));
        return false;
      }
      resetBill();
      setLayers((s) => s.filter((l) => l.kind !== "holdLabel"));
      showToast({ key: "held.holdDone" });
      void refreshHeld();
      return true;
    } catch {
      showToast({ key: "errors.loadFailed" });
      return false;
    } finally {
      heldBusyRef.current = false;
      setHeldBusy(false);
    }
  };
  const onRecallHeld = async (id: string, armPin?: { managerUserId: string; pin: string }): Promise<true | string> => {
    if (frozenRef.current || heldBusyRef.current) return "BUSY";
    heldBusyRef.current = true;
    setHeldBusy(true);
    try {
      const r = await recallHeldCartAction({ systemId, unitId, ...tokenArgs(), id });
      if (!r.ok) {
        if (r.code === "STAFF_TOKEN_INVALID") staffTokenDead();
        else showToast(errorFor(r.code));
        void refreshHeld();
        return r.code;
      }
      remember(r.products);
      r.cart.lines.forEach((l, i) => {
        const nm = r.lineNames[i];
        if ("productId" in l && nm) heldNames.current.set(l.productId, nm);
      });
      resetBill();
      const next = quoteInputToCart(r.cart, newKey);
      changeCart(next);
      setHeldNotices(r.notices.flatMap((n) => (next.lines[n.lineIndex] ? [{ key: next.lines[n.lineIndex]!.key, code: n.code, from: n.heldUnitPriceSatang, to: n.unitPriceSatang }] : [])));
      // POS P1.15U ▸ มติ 5: บิลพักที่อนุมัติส่วนลดแล้ว ⇒ ยอดจาก quote ที่เรียกคืน (เพดานที่อนุมัติ) + heldCartId ตอนชำระ ◂
      if (r.approvedRequestId && r.quote.ok) {
        const q = r.quote;
        const satang = q.lineDiscountSatang + q.billDiscountSatang;
        setDiscAuth({ kind: "approved", heldCartId: r.heldCartId, inputJson: JSON.stringify(cartToQuoteInput(next)), quote: q, satang, bp: q.subtotalSatang > 0 ? Math.ceil((satang * 10_000) / q.subtotalSatang) : 0 });
      } else if (armPin) {
        const d = discountOf(next);
        setDiscAuth({ kind: "pin", managerUserId: armPin.managerUserId, managerName: "", managerPin: armPin.pin, heldCartId: r.heldCartId, ...d });
      }
      setLayers([]);
      showToast({ key: "held.recalled" });
      void refreshHeld();
      return true;
    } catch {
      showToast({ key: "errors.loadFailed" });
      return "UNKNOWN";
    } finally {
      heldBusyRef.current = false;
      setHeldBusy(false);
    }
  };
  /** มติ 4: ตะกร้ามีของ ⇒ ถามก่อน (พักก่อน / ยกเลิก) · ว่าง ⇒ เรียกคืนเลย */
  const requestRecall = (h: HeldCartSummary) => {
    if (frozenRef.current) return;
    if (cart.lines.length) push({ kind: "heldConfirm", item: h });
    else void onRecallHeld(h.id);
  };
  const onDiscardHeld = async (h: HeldCartSummary) => {
    if (heldBusyRef.current) return;
    heldBusyRef.current = true;
    setHeldBusy(true);
    try {
      const r = await discardHeldCartAction({ systemId, unitId, id: h.id });
      showToast(r.ok ? { key: "held.discarded" } : errorFor(r.code));
    } catch {
      showToast({ key: "errors.loadFailed" });
    } finally {
      heldBusyRef.current = false;
      setHeldBusy(false);
      void refreshHeld();
    }
  };
  const openHeld = () => {
    if (frozenRef.current || layersRef.current.some((l) => l.kind === "held")) return;
    setHeldItems(null);
    push({ kind: "held" });
    void refreshHeld();
  };
  /** P1.15: เปิด PIN ผู้จัดการ · วันนี้ = แสดงเหตุผล */
  const onNeedsApproval = (key: string) => showToast({ key });

  // B2.2 S1: เพิ่มบรรทัด/สินค้า = แก้จากตะกร้าล่าสุด (prev) ไม่ใช่ `cart` ของ render ที่สร้างฟังก์ชันนี้
  //   — ผลสแกนที่กลับมาหลังผู้ใช้กดเพิ่มสินค้าอื่นไปแล้วจะไม่ทับตะกร้าด้วยสำเนาเก่า · คีย์บรรทัดสร้างนอก updater (StrictMode เรียกซ้ำได้)
  const appendTo = (prev: RegisterCart, line: NewLine, key: string): RegisterCart =>
    prev.lines.length >= REGISTER_MAX_LINES ? prev : { ...prev, lines: [...prev.lines, { ...line, key } as RegisterCartLine] };
  const addLine = (line: NewLine) => {
    if (frozenRef.current) return;
    if (cart.lines.length >= REGISTER_MAX_LINES) return showToast({ key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } });
    const key = newKey();
    updateCart((prev) => appendTo(prev, line, key));
  };
  const addProduct = (p: RegisterProduct) => {
    if (frozenRef.current) return;
    const key = newKey();
    // R2: เพดานจำนวน/จำนวนบรรทัด = บอกผู้ใช้ (เดิมเงียบ) · ตรวจกับตะกร้าล่าสุดที่วาดแล้ว (cartRef)
    const cur = cartRef.current;
    if (cartAddProduct(cur, p.id, key) === cur) {
      const atMaxQty = cur.lines.some((l) => l.kind === "product" && l.productId === p.id && !l.discount && l.openPriceSatang === undefined);
      return showToast(atMaxQty ? { key: "errors.qtyInvalid", values: { max: REGISTER_MAX_QTY } } : { key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } });
    }
    // P1.4 B2: สแกนซ้ำ/แตะซ้ำ = +1 บรรทัดเดิม (ราคาเดียวกัน) — ตัวลดรูปบริสุทธิ์ใน register-shared (ข้อสอบ R1)
    updateCart((prev) => cartAddProduct(prev, p.id, key));
    focusSearch();
  };
  /** แตะการ์ด (P1.2 จะเปิดป๊อปโอเวอร์ตัวเลือกตรงนี้เมื่อ optionGroupCount > 0) */
  const pick = (p: RegisterProduct, anchor?: PickAnchor) => {
    known.current.set(p.id, p);
    if (frozenRef.current) return;
    if (p.soldOutReason === "UNAVAILABLE") return showToast({ key: "errors.productUnavailable" });
    // P1.2 R16: มีกลุ่มตัวเลือก (optionGroupCount) หรือตัวแปร (variantCount) ⇒ กล่องเลือก · สินค้าชั่ง ⇒ กล่องน้ำหนัก
    if (p.optionGroupCount > 0 || p.variantCount > 0) return push({ kind: "options", product: p, ...(anchor ? { anchor } : {}) });
    if (p.soldByWeight) return push({ kind: "weigh", product: p, options: [] });
    if (p.priceSatang === null) {
      if (!limits.canOverridePrice) return showToast({ key: "errors.priceNotSet" });
      return push({ kind: "openPrice", productId: p.id });
    }
    addProduct(p);
  };

  /** P1.2 U: ผลของกล่องตัวเลือก — สินค้าชั่ง (ยังไม่มีป้าย) ⇒ ต่อกล่องน้ำหนัก · มีหมายเหตุ ⇒ บรรทัดใหม่เสมอ · อื่น ๆ = cartAddProduct ทีละชิ้น (+1 รวมชุดเดียวกัน) */
  const addPicked = (o: OptionsPick, weighedBarcode?: string) => {
    if (frozenRef.current) return;
    known.current.set(o.product.id, o.product);
    for (const [id, nm] of Object.entries(o.names)) optionNames.current.set(id, nm);
    if (weighedBarcode !== undefined) {
      setLayers((s) => s.filter((l) => l.kind !== "options"));
      return addWeighed(o.product, { weighedBarcode }, o.options, o.note);
    }
    if (o.soldByWeight) {
      return setLayers((s) => [...s.filter((l) => l.kind !== "options"), { kind: "weigh", product: o.product, options: o.options, ...(o.note ? { note: o.note } : {}) }]);
    }
    const key = newKey();
    // R2 ข้อ 2: คีย์รวม = สินค้า + ชุดตัวเลือก + หมายเหตุ (cartAddProduct) — ชิ้นละครั้งตามจำนวน
    const addAll = (prev: RegisterCart): { next: RegisterCart; added: number } => {
      let next = prev;
      let added = 0;
      for (let i = 0; i < o.qty; i++) {
        const n = o.note ? cartAddProduct(next, o.product.id, key, o.options, o.note) : cartAddProduct(next, o.product.id, key, o.options);
        if (n === next) break;
        next = n;
        added++;
      }
      return { next, added };
    };
    // R3 F4: เทียบก่อน/หลังกับตะกร้าล่าสุดที่วาดแล้ว — เต็ม 200 บรรทัด / ชนเพดานจำนวน = บอกผู้ใช้ (เหมือน addProduct)
    const cur = cartRef.current;
    const trial = addAll(cur);
    if (trial.added < o.qty) {
      const full = trial.added === 0 && cur.lines.length >= REGISTER_MAX_LINES;
      const merged = cur.lines.some((l) => l.kind === "product" && l.productId === o.product.id);
      showToast(full && !merged ? { key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } } : { key: "errors.qtyInvalid", values: { max: REGISTER_MAX_QTY } });
      if (trial.added === 0) return;
    }
    updateCart((prev) => addAll(prev).next);
    setLayers((s) => s.filter((l) => l.kind !== "options"));
  };
  /** P1.2 U: บรรทัดชั่ง (ป้ายเครื่องชั่ง หรือน้ำหนักที่กรอก) — qty 1 ไม่รวมกับบรรทัดใด · ราคาจริงจาก quote */
  const addWeighed = (p: RegisterProduct, weight: { weighedBarcode: string } | { weightGrams: number }, options: string[], note?: string) => {
    if (frozenRef.current) return;
    if (cartRef.current.lines.length >= REGISTER_MAX_LINES) return showToast({ key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } });
    known.current.set(p.id, p);
    const key = newKey();
    updateCart((prev) => {
      const next = cartAddWeighed(prev, p.id, key, weight, options);
      return note ? { ...next, lines: next.lines.map((l) => (l.key === key ? { ...l, note } : l)) } : next;
    });
    focusSearch();
  };

  // ═══════ บาร์โค้ด (P1.4) ═══════
  /** เวลา (event.timeStamp) ของการสแกนล่าสุดที่ตัวจับแป้นรับไป — Enter ของช่องค้นหาในช่วงนี้ = ของการสแกน ห้ามเพิ่มซ้ำ (มติผู้คุมงาน 3) */
  const lastScanAt = useRef(-Infinity);
  /** ผลของ registerScan → ทำตาม scanOutcome (ทางเดียวทั้งเครื่องสแกน กล้อง และ Enter ในช่องค้นหา) */
  const applyScan = (r: RegisterScanResult, code: string, from: "scan" | "search") => {
    // P1.2 R11: ป้ายเครื่องชั่ง (one + weighed) ⇒ บรรทัดชั่งด้วยป้ายนั้น · สินค้ามีตัวเลือก/ตัวแปร ⇒ เลือกก่อนแล้วใช้ป้ายเดิม
    if (r.ok && r.match === "one" && r.weighed) {
      const wp = r.product;
      remember([wp]);
      if (wp.soldOutReason === "UNAVAILABLE") return showToast({ key: "errors.productUnavailable" });
      if (wp.optionGroupCount > 0) return push({ kind: "options", product: wp, weighedBarcode: r.weighed.code });
      return addWeighed(wp, { weighedBarcode: r.weighed.code }, []);
    }
    const o = scanOutcome(r, { canOverridePrice: limits.canOverridePrice });
    if (o.action === "error") return showToast(errorFor(o.code));
    if (o.action === "add") return pick(o.product);
    if (o.action === "choose") {
      // B4: กล่องเลือกจริง (ไม่ยึดกริด) · จำสินค้าไว้ให้บรรทัดตะกร้าวาดชื่อ/ราคาได้
      remember(o.products);
      return push({ kind: "scanChoose", products: o.products });
    }
    // none: ไม่พบ — ผู้มีสิทธิ์ราคาเปิดได้ปุ่ม "เพิ่มเป็นรายการกำหนดเอง?" (offerCustom) · คนอื่นเห็นแค่ข้อความ
    showToast(from === "search" ? { key: "search.noResult", values: { q: code }, offerCustom: o.offerCustom } : { key: "scan.notFound", values: { code }, offerCustom: o.offerCustom });
  };

  /** Enter ในช่องค้นหา (Q24) — คนพิมพ์เท่านั้น: การสแกนรัวถูกตัวจับแป้นรับไปก่อน (capture) และไม่ถึงที่นี่ */
  const addFromSearchEnter = async () => {
    const term = q.trim();
    if (!term || frozen) return;
    if (performance.now() - lastScanAt.current < 250) return; // P1.4: Enter นี้เป็นของการสแกนที่เพิ่งรับไป — หนึ่งสแกน = หนึ่งครั้ง
    const lc = term.toLowerCase();
    if (shownQ.trim() === term && !catalogPending) {
      const exact = products.filter((p) => (p.sku ?? "").toLowerCase() === lc || (p.barcode ?? "").toLowerCase() === lc);
      const one = products.length === 1 ? products[0] : exact.length === 1 ? exact[0] : null;
      if (one) {
        pick(one);
        setQ("");
        return;
      }
      if (products.length > 1) return;
    }
    const gen = billGen.current;
    try {
      const r = await registerScanAction({ systemId, unitId, barcode: term });
      // B2.2 S1: ระหว่างรอ บิลถูกล้าง/ขายจบ/กำลังส่ง ⇒ ผลนี้ไม่ใช่ของบิลปัจจุบันแล้ว — ทิ้ง
      if (gen !== billGen.current || frozenRef.current) return;
      const clearTerm = () => setQ((cur) => (cur.trim() === term ? "" : cur));
      if (r.ok && (r.match === "one" || r.match === "choose")) clearTerm();
      applyScan(r, term, "search");
    } catch {
      if (gen === billGen.current) showToast({ key: "errors.loadFailed" });
    }
  };

  /** ทางสแกนทางเดียว (เครื่องสแกนรัว · กล้อง) — เรียก registerScanAction ตรง: ไม่ผ่านคำค้น/หน่วง 200ms/โหลดกริด (B1 · ข้อสอบ S1) */
  const onScannedCode = async (code: string) => {
    if (frozenRef.current) return showToast({ key: "scan.ignoredWhileDialog" }); // R2: ระหว่างส่งบิล = บอก ไม่เงียบ
    const gen = billGen.current;
    try {
      const r = await registerScanAction({ systemId, unitId, barcode: code });
      if (gen !== billGen.current) return; // บิลเปลี่ยนรุ่นระหว่างรอ = ทิ้ง (B2.2 S1)
      if (frozenRef.current) return showToast({ key: "scan.ignoredWhileDialog" });
      // B2: ระหว่างรอ ผู้ใช้เปิดกล่องชำระ/จบการขาย ⇒ ไม่แตะตะกร้าใต้กล่องนั้น
      if (layersRef.current.some((l) => l.kind === "pay" || l.kind === "done")) return showToast({ key: "scan.ignoredWhileDialog" });
      applyScan(r, code, "scan");
    } catch {
      if (gen === billGen.current) showToast({ key: "errors.loadFailed" });
    }
  };
  /** สแกนจากช่องค้นหา: ตัวอักษรของเครื่องสแกนอยู่ในช่องแล้ว ⇒ ยกเลิกคำค้นที่รอหน่วง + ทิ้งผลกริดที่ค้าง + ล้างช่อง (มติผู้คุมงาน 2) */
  const clearSearchForScan = () => {
    catalogSeq.current++;
    qClearedByScan.current = true;
    setQ("");
  };
  const openCamera = () => {
    if (frozenRef.current || layersRef.current.length) return;
    push({ kind: "camera" });
  };

  const lineIndex = (key: string) => cart.lines.findIndex((l) => l.key === key);
  /** ทดลองตะกร้าใหม่ด้วย priceCart ก่อนใช้จริง — ไม่ผ่าน = คืนข้อความ (กล่องค้าง ไม่ตัดเลขให้พอดี) */
  const tryCart = (next: RegisterCart): Msg | null => {
    const r = priceLocal(next, localCap);
    if (r && !r.ok) return errorFor(r.code);
    // fix รอบ 1 F5: เกินส่วนลดที่ผู้จัดการ/สายอนุมัติอนุญาต (bp หรือสตางค์) = เท่ากับเกินเพดาน
    if (discAuth) {
      const d = discountOf(next);
      if (d.bp > discAuth.bp || d.satang > discAuth.satang) return errorFor("DISCOUNT_EXCEEDS_LIMIT");
    }
    return null;
  };
  /**
   * priceCart ของตะกร้า (เพดาน cap) — null = ราคายังไม่รู้ (สินค้าใหม่จากเซิร์ฟเวอร์ / บรรทัดตัวเลือกที่ยังไม่มี quote) ให้ quote ตัดสิน
   * R3 F2: บรรทัดตัวเลือก/ชั่ง = ใช้ราคาต่อหน่วยจาก quote ล่าสุด (จับคู่ด้วยคีย์บรรทัด) แล้วตรวจเพดานส่วนลดทั้งตะกร้าตามเดิม
   */
  function priceLocal(next: RegisterCart, cap: number | null) {
    let priced = next;
    if (next.lines.some(isPricedByServer)) {
      const lines: RegisterCartLine[] = [];
      for (const l of next.lines) {
        if (!isPricedByServer(l)) {
          lines.push(l);
          continue;
        }
        const qi = quote ? quote.keys.indexOf(l.key) : -1;
        const ql = qi >= 0 ? quote?.q.lines[qi] : undefined;
        if (!ql) return null;
        lines.push({ key: l.key, kind: "custom", name: "-", unitPriceSatang: ql.unitPriceSatang, qty: l.qty, ...(l.discount ? { discount: l.discount } : {}) });
      }
      priced = { ...next, lines };
    }
    const input = cartToPriceInput(priced, known.current, vat, cap);
    if ("ok" in input) return null; // ราคายังไม่รู้ (สินค้าใหม่จากเซิร์ฟเวอร์) — ให้ quote ตัดสิน
    return priceCart(input);
  }
  /** POS P1.15U ▸ ยอดสำหรับชำระของส่วนลดที่ผู้จัดการอนุญาตด้วย PIN (ไม่จำกัดเพดาน) — รูปเดียวกับ quote ของเซิร์ฟเวอร์ ◂ */
  function localQuote(c: RegisterCart): RegisterQuote | null {
    const r = priceLocal(c, localCap);
    if (!r || !r.ok) return null;
    return {
      ok: true,
      subtotalSatang: r.subtotalSatang,
      lineDiscountSatang: r.lineDiscountSatang,
      billDiscountSatang: r.billDiscountSatang,
      couponDiscountSatang: r.couponDiscountSatang,
      netSatang: r.netSatang,
      serviceChargeSatang: r.serviceChargeSatang,
      vatSatang: r.vatSatang,
      grandTotalSatang: r.grandTotalSatang,
      vatMode: vat.mode,
      vatRateBp: vat.rateBp,
      lines: r.lines.map((pl, i) => {
        const l = c.lines[i];
        return { productId: l?.kind === "product" ? l.productId : null, unitPriceSatang: pl.unitPriceSatang, grossSatang: pl.grossSatang, discountSatang: pl.discountSatang, lineTotalSatang: pl.lineTotalSatang, optionsSatang: 0, options: [], weightGrams: null };
      }),
    };
  }
  /** ส่วนลดรวม (bp ของยอดก่อนส่วนลด) ของตะกร้า — แสดงบนแผ่นส่วนลดเกินสิทธิ์ */
  const discountBpOf = (c: RegisterCart): number => discountOf(c).bp;
  /** ส่วนลดรวมของตะกร้า (สตางค์ + bp ปัดขึ้น) — ราคายังไม่รู้ = 0 (quote ของเซิร์ฟเวอร์ตัดสิน) */
  function discountOf(c: RegisterCart): { bp: number; satang: number } {
    const r = priceLocal(c, null);
    if (!r || !r.ok) return { bp: 0, satang: 0 };
    const satang = r.lineDiscountSatang + r.billDiscountSatang;
    return { satang, bp: r.subtotalSatang > 0 ? Math.ceil((satang * 10_000) / r.subtotalSatang) : 0 };
  }
  /** ส่วนลดเกินเพดานของผู้ขาย (มีโทเคน) ⇒ เปิดแผ่นส่วนลดเกินสิทธิ์แทนข้อความผิด — คืน true เมื่อเปิดแผ่นแล้ว */
  const openDiscountOver = (next: RegisterCart, err: Msg | null): boolean => {
    if (err?.key !== "errors.discountExceedsLimit" || !staffRef.current) return false;
    setDiscErr(null);
    setDiscAuth(null); // fix รอบ 1 F5: สิทธิ์เดิมไม่ครอบคลุมแล้ว — ขอใหม่
    setLayers((s) => [...s.filter((l) => l.kind !== "billDiscount" && l.kind !== "line" && l.kind !== "discountOver"), { kind: "discountOver", next, wantBp: discountBpOf(next) }]);
    return true;
  };
  const applyLine = (key: string, r: LineEditResult): Msg | null => {
    const i = lineIndex(key);
    if (i < 0) return null;
    const cur = cart.lines[i]!;
    if (cur.kind === "product" && (cur.weighedBarcode !== undefined || cur.weightGrams !== undefined) && r.qty !== 1) return { key: "weigh.qtyOne" };
    const lines = cart.lines.map((l, j) => (j === i ? ({ ...l, qty: r.qty, discount: r.discount, note: r.note } as RegisterCartLine) : l));
    const next = { ...cart, lines };
    const err = tryCart(next);
    if (openDiscountOver(next, err)) return null; // POS P1.15U ▸ มติ 4 ◂
    if (err) return err;
    changeCart(next);
    pop();
    return null;
  };
  const removeLine = (key: string) => {
    const lines = cart.lines.filter((l) => l.key !== key);
    // R3 F8: ลบบรรทัดสุดท้าย = บิลใหม่ ⇒ ล้างหมายเหตุบิล + ส่วนลดท้ายบิลด้วย (สมาชิกคงไว้)
    if (!lines.length) {
      const next: RegisterCart = { lines: [] };
      if (cart.memberId) next.memberId = cart.memberId;
      changeCart(next);
      pop();
      return;
    }
    changeCart({ ...cart, lines });
    pop();
  };
  const applyBillDiscount = (d: PriceDiscount | undefined): Msg | null => {
    const next: RegisterCart = { ...cart, billDiscount: d };
    if (!d) delete next.billDiscount;
    const err = tryCart(next);
    if (openDiscountOver(next, err)) return null; // POS P1.15U ▸ มติ 4 ◂
    if (err) return err;
    changeCart(next);
    pop();
    return null;
  };
  const keepSelling = (key: string) => {
    const l = cart.lines.find((x) => x.key === key);
    if (l) setWarnAck((s) => ({ ...s, [key]: l.qty }));
  };
  const reduceTo = (key: string, n: number) => {
    if (n < 1) return;
    changeCart({ ...cart, lines: cart.lines.map((l) => (l.key === key ? { ...l, qty: n } : l)) });
  };
  // R4 K3: คีย์ของบิลหมุน "ที่นี่ที่เดียว" (บิลใหม่ · ล้างบิล · พักบิลภายหลัง) — ปฏิเสธใด ๆ ใน send เก็บคีย์เดิม
  //   (ส่ง payload ที่แก้แล้วด้วยคีย์เดิม = สำเร็จครั้งเดียว หรือ IDEMPOTENCY_CONFLICT ที่กล่องรับมือได้ — ไม่มีบิลที่สองเงียบ ๆ)
  const resetBill = () => {
    billGen.current++;
    changeCart({ lines: [] });
    setIdemKey(newKey());
    clearPending();
    setWarnAck({});
    pendingSubmit.current = null;
    setPayPhase("form");
    setPayError(null);
    setConflict(null);
    setDiscAuth(null); // POS P1.15U ▸ สิทธิ์ส่วนลดเกินเพดานเป็นของบิลนี้เท่านั้น ◂
    setDiscErr(null);
  };

  // ═══════ ชำระเงิน ═══════
  const openPay = () => {
    // B2.2 S2: กล่องชำระเปิดอยู่แล้ว = ไม่ทำอะไร (แตะรัว/F4+คลิก ห้ามซ้อนกล่อง และห้ามล้าง error ของกล่องที่เปิดอยู่)
    if (!payEnabled || layersRef.current.some((l) => l.kind === "pay")) return;
    setPayError(null);
    setPayPhase("form");
    setLayers((s) => (s.some((l) => l.kind === "pay") ? s : [...s, { kind: "pay" }]));
  };
  const send = async (sale: RegisterSubmitInput, opts?: { restore?: boolean }) => {
    if (sendingRef.current) return; // กดซ้ำ/Enter ซ้ำ = คำขอเดียวระหว่างทาง
    // POS P1.15U ▸ fix รอบ 1 F4: จอล็อกทับอยู่ = ไม่ส่ง (ยกเว้นลองซ้ำชุดคำขอที่ค้างจากก่อนโหลดหน้า — ชุดเดิมพกโทเคนของมันเอง) ◂
    if (lockedRef.current && !opts?.restore) return;
    sendingRef.current = true;
    pendingSubmit.current = sale;
    savePending(sale, "sending");
    setPayPhase("sending");
    setPayError(null);
    try {
      const r = await submitRegisterSaleAction({ systemId, unitId, sale, deviceId: getPosDeviceId() });
      synced();
      if (r.ok) {
        pendingSubmit.current = null;
        clearPending();
        setPayPhase("form");
        setLayers((s) => [...s.filter((l) => l.kind !== "pay" && l.kind !== "sheet"), { kind: "done", result: r, payMethods: sale.payMethods }]);
        void refreshStatus();
        return;
      }
      if (r.code === "UNKNOWN" || r.code === "INTERNAL" || r.code === "BUSY") {
        savePending(sale, "unknown");
        setPayPhase("unknown"); // ไม่แน่ใจ — คีย์เดิม ชุดคำขอเดิม
        return;
      }
      if (r.code === "IDEMPOTENCY_CONFLICT") {
        // R4 K2: ไม่มี saleId = CONFLICT เปล่า (บิลนอกสาขา/ระบบนี้) — ยังต้องหยุดขายด้วยคีย์นี้ ผู้ใช้กด "เริ่มบิลใหม่" เอง
        setConflict("saleId" in r ? { receiptNo: r.receiptNo, saleStatus: r.saleStatus } : { receiptNo: null, saleStatus: null });
        pendingSubmit.current = null;
        clearPending();
        setPayPhase("conflict");
        return;
      }
      // ปฏิเสธที่ชัดว่าไม่มีบิล ⇒ คีย์เดิม (R4 K3 — หมุนเฉพาะ resetBill) · ไม่มีคำขอค้าง
      pendingSubmit.current = null;
      clearPending();
      setPayPhase("form");
      setPayError({ code: r.code, ...errorFor(r.code) });
      if (r.code === "STAFF_TOKEN_INVALID") staffTokenDead(); // POS P1.15U ▸ โทเคนตาย = ล็อก (ไม่มีบิล · คีย์เดิม) ◂
      // POS P1.15U ▸ PIN ผู้จัดการผิด/ล็อก = ล้างสิทธิ์ที่เตรียมไว้ (ใส่ใหม่ผ่านแผ่นส่วนลดเกินสิทธิ์) · ต้องรออนุมัติ = บิลถูกพักแล้ว ⇒ 21B (ล้างจอนอก send) ◂
      if (r.code === "PIN_INVALID" || r.code === "PIN_LOCKED" || r.code === "APPROVAL_MISMATCH") setDiscAuth(null);
      if ((r.code === "APPROVAL_REQUIRED" || r.code === "PENDING_APPROVAL") && "requestId" in r) setApprovalHandoff({ requestId: r.requestId, ...(r.heldCartId ? { heldCartId: r.heldCartId } : {}) });
      if (r.code === "PRICE_CHANGED" && "grandTotalSatang" in r) {
        // ยอดสดจากคำตอบ (ไม่ต้อง quote ซ้ำ) — ผู้ใช้ต้องกดยืนยันใหม่กับยอดนี้
        setQuote({
          ver: cartVer,
          keys: cart.lines.map((l) => l.key),
          q: {
            ok: true,
            subtotalSatang: r.subtotalSatang,
            lineDiscountSatang: r.lineDiscountSatang,
            billDiscountSatang: r.billDiscountSatang,
            couponDiscountSatang: r.couponDiscountSatang,
            netSatang: r.netSatang,
            serviceChargeSatang: r.serviceChargeSatang, // P1.6: ยอดสดมีค่าบริการด้วย (ส่งต่อเฉย ๆ · การแสดงผลเป็นงานของ builder U)
            vatSatang: r.vatSatang,
            grandTotalSatang: r.grandTotalSatang,
            lines: r.lines,
            vatMode: r.vatMode,
            vatRateBp: r.vatRateBp,
          },
        });
      } else if (r.code === "PAYMENT_MISMATCH") {
        setCartVer((v) => v + 1); // quote ใหม่
      }
    } catch {
      savePending(sale, "unknown");
      setPayPhase("unknown"); // เครือข่ายล้ม/หมดเวลา — ไม่รู้ว่าบันทึกแล้วหรือยัง
    } finally {
      sendingRef.current = false;
    }
  };
  const confirmPay = (c: PayChoice) => {
    if (!quoteFresh || sendingRef.current || payPhase !== "form") return;
    // POS P1.15U ▸ fix รอบ 1 F4: ล็อกอยู่ = ไม่ส่ง · เครื่องลงทะเบียนที่มี PIN แล้วแต่ไม่มีโทเคน = ล็อก (ไม่ถอยไปใช้ผู้ใช้ session เงียบ ๆ — มติ 1) ◂
    if (lockedRef.current) return;
    if (!staffRef.current && !noPinMode) {
      lockNow();
      return;
    }
    const due = quoteFresh.grandTotalSatang;
    // P1.6: Σ วิธีจ่าย = ยอดบิล + ทิป · ทุกแถว ≥ 1 สตางค์ · ≤ 10 แถว · บิล 0 บาท (ไม่มีทิป) = payMethods [] — ตรวจซ้ำก่อนส่ง (กล่องคิดมาแล้ว)
    const tip = props.tipEnabled ? c.tipSatang : 0;
    const sum = c.payMethods.reduce((s, m) => s + m.amountSatang, 0);
    if (sum !== due + tip || c.payMethods.some((m) => m.amountSatang <= 0) || c.payMethods.length > REGISTER_MAX_PAY_METHODS) return;
    const cash = c.payMethods.find((m) => m.type === "CASH");
    if (cash && (c.cashReceivedSatang ?? 0) < cash.amountSatang) return;
    const sale = cartToSubmitInput(cart, {
      idempotencyKey: idemKey,
      payMethods: c.payMethods,
      ...(cash ? { cashReceivedSatang: c.cashReceivedSatang } : {}),
      ...(tip > 0 ? { tipSatang: tip } : {}),
      ...(cart.note ? { note: cart.note } : {}),
      expectedGrandTotalSatang: due,
    });
    // POS P1.15U ▸ มติ 2: ผู้ขาย = คนในโทเคน (ส่งทุกบิล · ลองซ้ำส่งชุดเดิมทั้งก้อน) ◂
    const st = staffRef.current;
    // POS P1.15U ▸ มติ 4–5: ส่วนลดเกินเพดาน — PIN ผู้จัดการ (managerPin + managerUserId · heldCartId ของบิลที่พักรอ) · บิลพักที่อนุมัติแล้ว (heldCartId) ◂
    const auth = discAuth;
    const over =
      auth?.kind === "pin"
        ? { managerPin: auth.managerPin, managerUserId: auth.managerUserId, ...(auth.heldCartId ? { heldCartId: auth.heldCartId } : {}) }
        : auth?.kind === "approved" && auth.inputJson === cartInputJson
          ? { heldCartId: auth.heldCartId }
          : {};
    void send({ ...sale, ...(st ? { staffToken: st.staffToken } : {}), ...over });
  };
  const retryPay = () => {
    if (pendingSubmit.current) void send(pendingSubmit.current); // ชุดเดิมทุกไบต์ · คีย์เดิม
  };
  const nextSale = () => {
    resetBill();
    setLayers([]);
  };

  // ═══════ POS P1.15U ▸ ส่วนลดเกินสิทธิ์ (มติ 4) + รอผู้จัดการอนุมัติ 21B (มติ 5) ═══════
  // บิลถูกพักที่เซิร์ฟเวอร์รออนุมัติ (APPROVAL_REQUIRED / PENDING_APPROVAL) ⇒ ล้างจอ (คีย์ใหม่ · resetBill ที่เดียว) แล้วเปิด 21B
  useEffect(() => {
    if (!approvalHandoff) return;
    resetBill();
    setLayers([{ kind: "approval", requestId: approvalHandoff.requestId, ...(approvalHandoff.heldCartId ? { heldCartId: approvalHandoff.heldCartId } : {}) }]);
    setApprovalHandoff(null);
    void refreshHeld();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือคำส่งต่อเท่านั้น
  }, [approvalHandoff]);
  /** (ข) ส่งขออนุมัติ: submit ตะกร้าที่ขอส่วนลด (ไม่มีวิธีจ่าย · ยอดคาดที่ไม่มีทางตรง ⇒ ไม่มีบิลเกิดแน่นอน) → เซิร์ฟเวอร์พักบิล + ยื่นคำขอ */
  const requestDiscountApproval = async (next: RegisterCart) => {
    const st = staffRef.current;
    if (!st || discBusy || frozenRef.current) return;
    setDiscBusy(true);
    setDiscErr(null);
    try {
      const grand = priceLocal(next, null);
      const sale: RegisterSubmitInput = {
        ...cartToQuoteInput(next),
        idempotencyKey: idemKey,
        payMethods: [],
        expectedGrandTotalSatang: (grand && grand.ok ? grand.grandTotalSatang : 0) + 1,
        staffToken: st.staffToken,
      };
      const r = await submitRegisterSaleAction({ systemId, unitId, sale, ...(deviceId ? { deviceId } : {}) });
      if (!r.ok && (r.code === "APPROVAL_REQUIRED" || r.code === "PENDING_APPROVAL") && "requestId" in r) {
        setApprovalHandoff({ requestId: r.requestId, ...(r.heldCartId ? { heldCartId: r.heldCartId } : {}) });
        return;
      }
      if (!r.ok && r.code === "STAFF_TOKEN_INVALID") {
        setLayers((s) => s.filter((l) => l.kind !== "discountOver"));
        return staffTokenDead();
      }
      setDiscErr(t(!r.ok && r.code === "DISCOUNT_EXCEEDS_LIMIT" ? "discountOver.noPolicy" : r.ok ? "errors.unknown" : refusalMessageKey(r.code)));
    } catch {
      setDiscErr(t("errors.unknown"));
    } finally {
      setDiscBusy(false);
    }
  };
  /** (ก) PIN ผู้จัดการ: เก็บไว้กับบิลนี้ (ส่งพร้อม submit) แล้วใช้ส่วนลด */
  const armManagerPin = (next: RegisterCart, managerUserId: string, managerName: string, pin: string) => {
    setDiscAuth({ kind: "pin", managerUserId, managerName, managerPin: pin, ...discountOf(next) });
    changeCart(next);
    setLayers((s) => s.filter((l) => l.kind !== "discountOver"));
    showToast({ key: "discountOver.pinArmed", values: { name: managerName } });
  };
  /** 21B ของส่วนลด: PIN ผู้จัดการ = เรียกคืนบิลที่พักรอ แล้วเตรียม PIN ไว้กับบิลนั้น (ส่งพร้อม heldCartId ⇒ เซิร์ฟเวอร์ยกเลิกคำขอที่รอ) */
  const approvalPin = async (heldCartId: string | undefined, managerUserId: string, pin: string): Promise<ApprovalPinResult> => {
    if (!heldCartId) return { ok: false, code: "NOT_FOUND" };
    const r = await onRecallHeld(heldCartId, { managerUserId, pin });
    return r === true ? { ok: true } : { ok: false, code: r };
  };
  /** 21B จบ: อนุมัติ = เรียกคืนบิลด้วยเพดานที่อนุมัติ · ปฏิเสธ = แจ้งเหตุผล (เซิร์ฟเวอร์ทิ้งบิลพักแล้ว) · ยกเลิก = แจ้ง */
  const approvalDone = (view: PosApprovalView, heldCartId: string | undefined) => {
    setLayers((s) => s.filter((l) => l.kind !== "approval"));
    if (view.status === "APPROVED") {
      showToast({ key: "approval.approvedDiscount" });
      if (heldCartId) void onRecallHeld(heldCartId);
    } else if (view.status === "REJECTED") {
      showToast(view.note ? { key: "approval.rejected", values: { reason: view.note } } : { key: "approval.rejectedNoReason" });
      void refreshHeld();
    } else showToast({ key: "approval.cancelled" });
  };

  // R4.1 F1: คำขอที่โหลดกลับแล้วถูกปฏิเสธชัด ⇒ กล่องชำระค้างบนตะกร้าว่าง — ปิดกล่องแล้วแสดงเหตุผลเป็นข้อความลอย
  //   (ทำนอก send ตามมติ — คีย์คงเดิมเพราะปฏิเสธชัด ไม่มีบิล) · ปกติเปิดกล่องได้เมื่อมีของในตะกร้าเท่านั้น ⇒ เงื่อนไขนี้เกิดแค่ทางโหลดกลับ
  useEffect(() => {
    if (payPhase !== "form" || cart.lines.length > 0 || layersRef.current[layersRef.current.length - 1]?.kind !== "pay") return;
    setLayers((s) => s.filter((l) => l.kind !== "pay"));
    if (payError) showToast({ key: payError.key, values: payError.values });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้นคือ phase เปลี่ยนเท่านั้น
  }, [payPhase]);

  // R4 K5: เปิดจอ (reload/Back) แล้วมีคำขอค้างของระบบ+สาขานี้ ⇒ ขึ้นการ์ด "ไม่แน่ใจ" แล้วลองซ้ำด้วยคีย์เดิม ชุดคำขอเดิมทันที
  //   (ตะกร้าบนจอไม่ถูกสร้างคืน — ยอดในกล่องมาจาก expectedGrandTotalSatang ของคำขอ) · StrictMode เรียกซ้ำ = sendingRef กันไว้
  useEffect(() => {
    let saved: { idempotencyKey: string; sale: RegisterSubmitInput } | null = null;
    try {
      const raw = window.sessionStorage.getItem(pendingStoreKey);
      const v: unknown = raw ? JSON.parse(raw) : null;
      const o = v as { userId?: unknown; idempotencyKey?: unknown; sale?: { idempotencyKey?: unknown } } | null;
      if (o && o.userId !== userId) {
        // R4.1 F2: ระเบียนของผู้ใช้อื่น (หรือรูปแบบเก่าที่ไม่มี userId) = ไม่ลองซ้ำ · ลบทิ้ง
        window.sessionStorage.removeItem(pendingStoreKey);
      } else if (o && typeof o.idempotencyKey === "string" && o.sale && o.sale.idempotencyKey === o.idempotencyKey) {
        saved = o as { idempotencyKey: string; sale: RegisterSubmitInput };
      }
    } catch {
      saved = null;
    }
    if (!saved) return;
    pendingSubmit.current = saved.sale;
    setIdemKey(saved.idempotencyKey);
    setPayPhase("unknown");
    setLayers([{ kind: "pay" }]);
    void send(saved.sale, { restore: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอนเปิดจอ (key ของจอ = สาขา)
  }, []);

  // ═══════ แป้นลัด: ตัวจับเดียวบน window (สเปก §3.6) ═══════
  const keyState = useRef({ top, payEnabled, q, cartLen: cart.lines.length, payPhase, frozen, locked });
  keyState.current = { top, payEnabled, q, cartLen: cart.lines.length, payPhase, frozen, locked };
  const handlers = useRef({ openPay, onHold, pop, push, setQ });
  handlers.current = { openPay, onHold, pop, push, setQ };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = keyState.current;
      const h = handlers.current;
      if (s.locked) return; // POS P1.15U ▸ จอล็อกทับอยู่ = แป้นลัดทั้งหมดปิด (แป้น PIN อยู่ที่ LockScreen) ◂
      if (e.key === "F2") {
        // แป้นพิมพ์จริง ⇒ โฟกัสเสมอ (ไม่เช็ก pointer แบบ focusSearch) แม้กำลังพิมพ์ช่องอื่นอยู่
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (!e.repeat && !s.top && s.payEnabled) h.openPay();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (!e.repeat && !s.top) h.onHold();
        return;
      }
      if (e.key === "Escape") {
        if (e.isComposing) return; // B2.2 N4: Esc ระหว่างพิมพ์ด้วย IME = ยกเลิกคำที่กำลังประกอบ ไม่ใช่ปิดกล่อง/ล้างบิล
        if (s.top) {
          // ปิดชั้นบนสุด · ระหว่างส่ง/ไม่แน่ใจ/บิลซ้ำ = ห้ามปิด (สเปก §3.4 ข้อ 3, 6)
          if (s.top.kind === "pay" && s.payPhase !== "form") return;
          if (s.top.kind === "done") return; // ปิดด้วย "ขายบิลถัดไป" เท่านั้น
          e.preventDefault();
          h.pop();
          return;
        }
        if (s.q) {
          e.preventDefault();
          h.setQ("");
          return;
        }
        if (s.cartLen > 0 && !s.frozen) {
          e.preventDefault();
          h.push({ kind: "clear" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ═══════ เครื่องสแกนแบบพิมพ์รัว (P1.4 B1): ตัวจับ keydown ทั้งหน้า ช่วง capture ═══════
  //   capture บน window = เห็นคีย์ก่อนช่องค้นหา/ปุ่มที่โฟกัสอยู่ ⇒ Enter/Tab ที่จบการสแกนถูกกลืน (preventDefault + stopPropagation):
  //   onKeyDown ของช่องค้นหาไม่ถึง (หนึ่งสแกน = หนึ่งครั้ง) · ปุ่มที่โฟกัสไม่ถูกกด · Tab ไม่ย้ายโฟกัส · Enter ไม่ไปยืนยันกล่องชำระ
  //   ตัดสินที่ classifyScanBurst เท่านั้น (IME → กล่องเปิด → ช่องกรอกอื่น → จังหวะ) — คนพิมพ์ = ปล่อยผ่านตามเดิมทุกอย่าง
  const scanBuf = useRef<ScanKey[]>([]);
  /** ค่าของช่องกรอก (ไม่ใช่ช่องค้นหา) ตอนคีย์แรกของบัฟเฟอร์ — คืนค่านี้ถ้าบัฟเฟอร์กลายเป็นการสแกน (R2) */
  const scanFieldSnap = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; value: string } | null>(null);
  const scanHandlers = useRef({ onScannedCode, clearSearchForScan, showToast });
  scanHandlers.current = { onScannedCode, clearSearchForScan, showToast };
  useEffect(() => {
    const onScanKey = (e: KeyboardEvent) => {
      const buf = scanBuf.current;
      if (lockedRef.current) {
        buf.length = 0; // POS P1.15U ▸ จอล็อก: ตัวเลขคือ PIN ไม่ใช่การสแกน ◂
        return;
      }
      const prev = buf[buf.length - 1];
      if (prev && e.timeStamp - prev.at > SCAN_MAX_GAP_MS) buf.length = 0; // ห่างเกินจังหวะเครื่องสแกน = เริ่มบัฟเฟอร์ใหม่
      if (!buf.length) {
        const t0 = e.target;
        scanFieldSnap.current = t0 !== searchRef.current && (t0 instanceof HTMLInputElement || t0 instanceof HTMLTextAreaElement) ? { el: t0, value: t0.value } : null;
      }
      buf.push({ key: scanKeyFromEvent(e), at: e.timeStamp, isComposing: e.isComposing });
      if (buf.length > 128) buf.splice(0, buf.length - 128);
      if (e.key !== "Enter" && e.key !== "Tab") return;
      const keys = buf.splice(0);
      const el = e.target;
      const target: "search" | "input" | "body" =
        el === searchRef.current
          ? "search"
          : el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable)
            ? "input"
            : "body";
      const r = classifyScanBurst(keys, { dialogOpen: layersRef.current.length > 0, target });
      const h = scanHandlers.current;
      const snap = scanFieldSnap.current;
      scanFieldSnap.current = null;
      const scanTimed = r.kind === "scan" || (r.kind === "ignore" && r.reason !== "ime" && classifyScanBurst(keys, { target: "body" }).kind === "scan");
      // R2: รหัสที่สแกนตกลงในช่องกรอกอื่น (กล่องชำระ "รับเงิน" 500 → 5008850…) ⇒ คืนค่าเดิมก่อนทำอย่างอื่น
      if (scanTimed && snap && snap.el === el) restoreFieldValue(snap.el, snap.value);
      if (r.kind === "scan") {
        e.preventDefault();
        e.stopPropagation();
        lastScanAt.current = e.timeStamp;
        if (target === "search") h.clearSearchForScan();
        void h.onScannedCode(r.code);
        return;
      }
      // กล่องเปิดอยู่ (ชำระ · ตัวเลือก · กล้อง …) และจังหวะเป็นเครื่องสแกน ⇒ ไม่ทำอะไร + บอกผู้ใช้ (B2) · กลืนตัวจบไม่ให้ไปกดปุ่มในกล่อง
      if (r.kind === "ignore" && r.reason === "dialog" && scanTimed) {
        e.preventDefault();
        e.stopPropagation();
        h.showToast({ key: "scan.ignoredWhileDialog" });
      }
    };
    window.addEventListener("keydown", onScanKey, true);
    return () => window.removeEventListener("keydown", onScanKey, true);
  }, []);

  // ═══════ วาด ═══════
  const lineOf = (key: string) => cart.lines.find((l) => l.key === key);
  // P1.5 H3: คำเตือนของบิลที่เรียกคืน — เฉพาะบรรทัดที่ยังอยู่ (เอาออก = หาย) · ขายไม่ได้แล้ว ⇒ quote ปฏิเสธ = ชำระไม่ได้จนกว่าจะเอาออก
  const shownNotices = heldNotices.filter((n) => cart.lines.some((l) => l.key === n.key));
  const noticeName = (key: string) => {
    const l = lineOf(key);
    if (!l) return "-";
    if (l.kind === "custom") return l.name;
    const prod = known.current.get(l.productId);
    return prod ? displayName(prod, locale) : (heldNames.current.get(l.productId) ?? "-");
  };
  const heldNoticeNode = shownNotices.length ? (
    <div data-testid="pos-reg-held-notices" role="status" className="flex items-start gap-2.5 rounded-[14px] border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-3.5 py-2.5 text-[13.5px] leading-[1.5]">
      <RegisterIcon name="warn" size={16} className="mt-0.5 shrink-0 text-[color:var(--color-danger)]" />
      <ul className="min-w-0 flex-1">
        {shownNotices.map((n) => (
          <li key={`${n.key}-${n.code}`}>
            {n.code === "PRICE_CHANGED"
              ? t("held.noticePriceChanged", { name: noticeName(n.key), from: moneyText(n.from ?? 0), to: moneyText(n.to ?? 0) })
              : n.code === "PERMISSION_DENIED"
                ? t("held.noticeNeedsPermission", { name: noticeName(n.key) })
                : t("held.noticeUnavailable", { name: noticeName(n.key) })}
          </li>
        ))}
      </ul>
      <button
        data-testid="pos-reg-held-notices-close"
        className="-my-1.5 -mr-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)]"
        type="button"
        aria-label={t("cart.close")}
        onClick={() => setHeldNotices([])}
      >
        <RegisterIcon name="x" size={14} />
      </button>
    </div>
  ) : null;
  // POS P1.15U ▸ ส่วนลดเกินเพดาน (เช่น บิลที่เรียกคืน) ⇒ ปุ่ม "ขอสิทธิ์ส่วนลด" ใต้ข้อความ → แผ่นส่วนลดเกินสิทธิ์ ◂
  const errorNode = errorMsg ? (
    <>
      {msgNode(errorMsg)}
      {quoteFailed === "DISCOUNT_EXCEEDS_LIMIT" && staff && !frozen ? (
        <button
          data-testid="pos-discount-over-open"
          className="mt-1 block min-h-[44px] font-semibold underline underline-offset-2"
          type="button"
          onClick={() => openDiscountOver(cart, { key: "errors.discountExceedsLimit" })}
        >
          {t("discountOver.open")}
        </button>
      ) : null}
    </>
  ) : null;
  const cartPanel = (variant: "inline" | "sheet") => (
    <CartPanel
      variant={variant}
      lines={lineModels}
      totals={cart.lines.length ? shownTotals : null}
      totalsPending={totalsPending}
      payAmount={payAmount}
      payEnabled={payEnabled}
      error={errorNode}
      frozen={frozen}
      onPay={openPay}
      onSoon={soon}
      onNote={() => {
        if (!frozenRef.current && cart.lines.length) push({ kind: "note" });
      }}
      hasNote={!!cart.note}
      onHold={() => {
        if (!frozenRef.current && cart.lines.length) push({ kind: "holdLabel" });
      }}
      onOpenHeld={openHeld}
      heldCount={heldCount}
      notice={heldNoticeNode}
      onBillDiscount={() => push({ kind: "billDiscount" })}
      onOpenLine={(key, focus) => push({ kind: "line", key, focus })}
      onKeep={keepSelling}
      onReduce={reduceTo}
      onClose={variant === "sheet" ? pop : undefined}
      memberAttached={!!cart.memberId}
      onRemoveMember={() => {
        const next = { ...cart };
        delete next.memberId;
        changeCart(next);
      }}
    />
  );

  // ── ชั้นกล่องหนึ่งชั้น (โหนดที่วาด) ──
  const layerNode = (l: Layer, k: string): React.ReactNode => {
    switch (l.kind) {
      case "sheet":
        return wide === true ? null : (
          <CartSheetFrame key={k} onClose={pop} locked={frozen}>
            {cartPanel("sheet")}
          </CartSheetFrame>
        );
      case "line": {
        const line = lineOf(l.key);
        if (!line) return null;
        const nm = line.kind === "custom" ? line.name : displayName(known.current.get(line.productId) ?? { name: "-" }, locale);
        return (
          <LineEditor
            key={k}
            lineKey={l.key}
            name={nm}
            qty={line.qty}
            discount={line.discount}
            note={line.note}
            focus={l.focus}
            onApply={(r) => applyLine(l.key, r)}
            onRemove={() => removeLine(l.key)}
            onClose={pop}
          />
        );
      }
      case "billDiscount":
        return <BillDiscountDialog key={k} current={cart.billDiscount} capBp={staff ? sellerCap : undefined} onApply={applyBillDiscount} onCoupon={() => push({ kind: "coupon" })} onClose={pop} />;
      case "coupon":
        return <CouponDialog key={k} onClose={pop} />;
      // POS P1.15U ▸ แผ่นส่วนลดเกินสิทธิ์ (มติ 4) · รอผู้จัดการอนุมัติ 21B (มติ 5) ◂
      case "discountOver":
        return (
          <DiscountOverBox
            key={k}
            systemId={systemId}
            unitId={unitId}
            deviceId={deviceId}
            capBp={sellerCap}
            wantBp={l.wantBp}
            canRequest={online && !!staff}
            busy={discBusy}
            error={discErr}
            onPin={(id, name, pin) => armManagerPin(l.next, id, name, pin)}
            onRequest={() => void requestDiscountApproval(l.next)}
            onClose={() => {
              if (!discBusy) pop();
            }}
          />
        );
      case "approval":
        return (
          <ApprovalWaitDialog
            key={k}
            systemId={systemId}
            unitId={unitId}
            deviceId={deviceId}
            requestId={l.requestId}
            onPin={(mgr, pin) => approvalPin(l.heldCartId, mgr, pin)}
            allowPin={!!l.heldCartId}
            onDone={(v) => approvalDone(v, l.heldCartId)}
            onClose={pop}
          />
        );
      case "custom":
        return (
          <CustomItemDialog
            key={k}
            onAdd={(name, price) => {
              if (cart.lines.length >= REGISTER_MAX_LINES) return { key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } };
              addLine({ kind: "custom", name, unitPriceSatang: price, qty: 1 });
              pop();
              return null;
            }}
            onClose={pop}
          />
        );
      case "openPrice": {
        const prod = known.current.get(l.productId);
        return (
          <OpenPriceDialog
            key={k}
            name={prod ? displayName(prod, locale) : "-"}
            onAdd={(price) => {
              addLine({ kind: "product", productId: l.productId, qty: 1, openPriceSatang: price });
              pop();
            }}
            onClose={pop}
          />
        );
      }
      case "clear":
        return (
          <ClearBillDialog
            key={k}
            onConfirm={() => {
              resetBill();
              setLayers([]);
            }}
            onClose={pop}
          />
        );
      case "pay":
        return (
          <PayDialog
            key={k}
            dueSatang={quoteFresh?.grandTotalSatang ?? quote?.q.grandTotalSatang ?? pendingSubmit.current?.expectedGrandTotalSatang ?? 0}
            breakdown={quoteFresh ?? quote?.q ?? null}
            tipEnabled={!!props.tipEnabled}
            billNote={cart.note ?? null}
            quotePending={!quoteFresh && !quoteFailed}
            quoteError={quoteFailed ? { code: quoteFailed, ...errorFor(quoteFailed) } : null}
            itemCount={cart.lines.length || (pendingSubmit.current?.lines.length ?? 0)}
            promptpayId={props.promptpayId}
            phase={payPhase}
            error={payError}
            conflict={conflict}
            memberAttached={!!cart.memberId}
            salesHref={`${base}/pos/sales`}
            onConfirm={confirmPay}
            onRetry={retryPay}
            onClose={() => {
              if (payPhase === "form") pop();
            }}
            onNewBill={nextSale}
            onRemoveMember={() => {
              const next = { ...cart };
              delete next.memberId;
              changeCart(next);
              setPayError(null);
            }}
          />
        );
      case "scanChoose":
        return (
          <ScanChooserDialog
            key={k}
            products={l.products}
            locale={locale}
            onPick={(p) => {
              pop();
              pick(p);
            }}
            onClose={pop}
          />
        );
      case "held":
        return (
          <HeldBillsDialog
            key={k}
            items={heldItems}
            expireDays={heldExpireDays}
            busy={heldBusy}
            onRecall={requestRecall}
            onDiscard={(h) => void onDiscardHeld(h)}
            onClose={pop}
          />
        );
      case "holdLabel":
        return <HoldLabelDialog key={k} busy={heldBusy} onHold={(label) => void onHold(label)} onClose={pop} />;
      case "heldConfirm":
        return (
          <HeldRecallConfirmDialog
            key={k}
            item={l.item}
            currentCount={cart.lines.length}
            currentTotal={quoteFresh ? moneyText(quoteFresh.grandTotalSatang) : null}
            busy={heldBusy}
            onHoldFirst={() => {
              void (async () => {
                if (await onHold()) await onRecallHeld(l.item.id);
              })();
            }}
            onClose={pop}
          />
        );
      case "camera":
        return (
          <ScanCameraDialog
            key={k}
            onCode={(code) => {
              pop();
              void onScannedCode(code);
            }}
            onClose={pop}
          />
        );
      case "done":
        return (
          <PayDone
            key={k}
            receiptNo={l.result.receiptNo}
            totalSatang={l.payMethods.reduce((s, m) => s + m.amountSatang, 0) || l.result.grandTotalSatang}
            changeSatang={l.result.changeSatang}
            payMethods={l.payMethods}
            onNext={nextSale}
            systemId={systemId}
            saleId={l.result.saleId}
            printer={printer}
            locale={locale.startsWith("en") ? "en" : "th"}
          />
        );
      case "options":
        return (
          <OptionsDialog
            key={k}
            product={l.product}
            systemId={systemId}
            unitId={unitId}
            locale={locale}
            weighedLabel={l.weighedBarcode !== undefined}
            anchor={l.anchor}
            allowNegative={!props.oversellBlock}
            onAdd={(o) => addPicked(o, l.weighedBarcode)}
            onClose={pop}
          />
        );
      case "weigh":
        return (
          <WeighDialog
            key={k}
            product={l.product}
            locale={locale}
            canOverridePrice={limits.canOverridePrice}
            onAdd={(grams) => {
              setLayers((s) => s.filter((x) => x.kind !== "weigh"));
              addWeighed(l.product, { weightGrams: grams }, l.options, l.note);
            }}
            onClose={pop}
          />
        );
      case "note":
        return (
          <BillNoteDialog
            key={k}
            current={cart.note}
            onSave={(note) => {
              // หมายเหตุไม่กระทบราคา ⇒ ไม่เพิ่มรุ่นตะกร้า (quote ปัจจุบันยังใช้ได้)
              setCart((c) => {
                const next = { ...c };
                if (note) next.note = note;
                else delete next.note;
                return next;
              });
              pop();
            }}
            onClose={pop}
          />
        );
    }
  };

  return (
    <div
      data-testid="pos-reg-root"
      className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[color:var(--color-surface)] md:h-[calc(100dvh-3.5rem)] md:min-h-0 md:overflow-hidden"
    >
      {/* B2.2 S2: มีกล่องเปิด ⇒ ทุกอย่างหลังม่าน inert (คลิก/โฟกัส/โปรแกรมอ่านจอไม่ถึง) · contents = ไม่เปลี่ยนเลย์เอาต์ flex */}
      {/* POS P1.15U ▸ จอล็อกทับอยู่ ⇒ ทั้งจอขายและชั้นกล่อง inert (จอล็อก/ข้อความลอยอยู่นอกกรอบนี้) ◂ */}
      <div className="contents" inert={locked}>
      <div className="contents" inert={layers.length > 0}>
        <h1 className="sr-only">{t("title")}</h1>
        <RegisterTopContext
          wide={wide}
          inApp={inApp}
          systemId={systemId}
          tenantName={props.tenantName}
          units={props.units}
          activeUnitId={unitId}
          online={online}
          lastSyncAt={lastSyncAt}
          user={staff ? { name: staff.name ?? "-", role: staff.role } : status ? { name: status.user.name, role: status.user.role } : null}
          shift={status?.shift ?? null}
          onCamera={openCamera}
          onLock={staff || noPinMode ? lockNow : undefined}
        />
        <ModeTabsNav systemId={systemId} />
        {!online && (
          <div data-testid="pos-reg-offline-banner" className="flex shrink-0 items-center gap-3 bg-[color:var(--color-ink)] px-5 py-[13px] text-[14px] leading-[1.5] text-[color:var(--color-surface)]" role="status">
            <RegisterIcon name="warn" size={18} />
            <span>{t("status.offlineBanner", { time: formatThaiTime(offlineSince ?? new Date()) })}</span>
          </div>
        )}

        {deviceRevoked && (
          <div data-testid="pos-reg-device-revoked" className="flex shrink-0 items-center gap-3 bg-[color:var(--color-danger)] px-5 py-[11px] text-[14px] font-semibold leading-[1.5] text-white" role="alert">
            <RegisterIcon name="warn" size={18} />
            <span>{t("status.deviceRevoked")}</span>
          </div>
        )}
        {noPinMode && !noPinDismissed && (
          <div data-testid="pos-staff-nopin-banner" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-[color:var(--color-surface-2)] px-5 py-[10px] text-[14px] text-[color:var(--color-ink)]" role="status">
            <RegisterIcon name="lock" size={16} />
            <span className="flex-1">{t("staff.noPinBanner")}</span>
            <button data-testid="pos-staff-nopin-dismiss" type="button" className="grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)]" aria-label={t("cart.close")} onClick={dismissNoPin}>
              <RegisterIcon name="x" size={14} />
            </button>
          </div>
        )}
        {shiftBlocked && (
          <div data-testid="pos-reg-shift-required" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-[color:var(--color-surface-2)] px-5 py-[10px] text-[14px] text-[color:var(--color-ink)]" role="status">
            <RegisterIcon name="warn" size={18} />
            <span className="flex-1">{t("errors.shiftRequired")}</span>
            <a data-testid="pos-reg-shift-open-link" href={`/app/sys/${systemId}/pos/shifts?unit=${encodeURIComponent(unitId)}`} className="btn btn-primary min-h-[44px] text-sm">
              {ts("open")}
            </a>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col px-[22px] md:min-h-0 md:border-r md:px-0">
            <SearchRow
              ref={searchRef}
              q={q}
              onQ={setQ}
              onEnter={() => void addFromSearchEnter()}
              wide={xl}
              compact={wide === false}
              canCustom={limits.canOverridePrice}
              onCustom={() => (limits.canOverridePrice ? push({ kind: "custom" }) : onNeedsApproval("errors.needPriceOverride"))}
              onCamera={openCamera}
              disabled={frozen}
            />
            <CategoryChips categories={categories} active={categoryId} onPick={pickCategory} />
            {props.initialCatalog === null && products.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[15px] text-[color:var(--color-muted)]" role="alert">
                <p>{t("errors.loadFailed")}</p>
                <button data-testid="pos-reg-grid-retry" className="btn btn-ghost h-11 rounded-[13px] px-5 text-[15px]" type="button" onClick={() => loadCatalog(q, categoryId)}>
                  {t("pay.retry")}
                </button>
              </div>
            ) : (
              <ProductGrid
                products={products}
                inCart={inCart}
                pending={catalogPending}
                q={shownQ}
                categoryId={categoryId}
                catalogueEmpty={catalogueEmpty}
                hasMore={!!nextCursor}
                productsHref={`${base}/pos/products`}
                onPick={pick}
                selectedId={top?.kind === "options" && top.anchor ? top.product.id : null}
                onMore={loadMore}
                onClearSearch={() => {
                  setQ("");
                  focusSearch();
                }}
              />
            )}
            {wide !== true && (
              <MobileCartBar
                peek={peek}
                count={cart.lines.length}
                totalText={payAmount}
                payEnabled={payEnabled}
                empty={cart.lines.length === 0}
                onOpen={() => push({ kind: "sheet" })}
                onPay={openPay}
              />
            )}
          </div>
          {wide !== false && <div className="hidden min-h-0 shrink-0 md:flex md:w-[340px] lg:w-[380px] xl:w-[480px]">{cartPanel("inline")}</div>}
        </div>

        <RegisterStatusBar
          pendingStock={status?.pendingStockCount ?? 0}
          pendingSync={status?.pendingSyncCount ?? 0}
          device={
            device === undefined
              ? undefined
              : {
                  name: device && device.status === "ACTIVE" ? device.name : null,
                  revoked: device?.status === "REVOKED" || status?.deviceStatus === "REVOKED",
                  settingsHref: `${base}/pos/settings?tab=devices&unit=${encodeURIComponent(unitId)}`,
                  printer: printer.config.mode === "browser" ? "browser" : printerPaired(printer.config.mode, printer.deviceCode) ? "ready" : "none",
                  paper: printer.config.paper,
                }
          }
        />
      </div>

      {/* ── ชั้นกล่อง (วาดตามลำดับ — ตัวท้ายอยู่บนสุด) · ชั้นที่ไม่ใช่บนสุด = inert (B2.2 S2) ── */}
      {layers.map((l, i) => (
        <div key={`${l.kind}-${i}`} className="contents" inert={i < layers.length - 1}>
          {layerNode(l, `${l.kind}-${i}`)}
        </div>
      ))}
      </div>
      {toast && (
        <div
          data-testid="pos-reg-toast"
          className="pointer-events-none fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-[520px] items-center gap-3 rounded-[16px] bg-[color:var(--color-ink)] px-[18px] py-[14px] text-[14px] leading-[1.5] text-[color:var(--color-surface)] shadow-xl max-md:bottom-[150px]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1">{msgNode(toast)}</span>
          {toast.offerCustom && limits.canOverridePrice && !locked && (
            <button
              data-testid="pos-reg-scan-add-custom"
              className="pointer-events-auto h-11 shrink-0 rounded-[11px] border border-[color:var(--color-surface)] px-3 text-[14px] font-semibold"
              type="button"
              onClick={() => {
                setToast(null);
                if (!frozenRef.current) push({ kind: "custom" });
              }}
            >
              {t("scan.addAsCustom")}
            </button>
          )}
        </div>
      )}
      {locked && (
        <LockScreen
          mode={lockMode}
          systemId={systemId}
          unitId={unitId}
          deviceId={deviceId}
          tenantName={props.tenantName}
          unitName={props.units.find((u) => u.id === unitId)?.name ?? ""}
          deviceLabel={(device && device.status === "ACTIVE" ? device.name : null) ?? status?.shift?.deviceLabel ?? null}
          shift={status?.shift ?? null}
          online={online}
          current={lastStaffRef.current}
          lockedAt={lockedAt}
          heldItems={heldItems}
          heldCount={heldCount}
          autoLockMinutes={props.autoLockMinutes ?? 2}
          settingsHref={`${base}/pos/settings?tab=devices&unit=${encodeURIComponent(unitId)}`}
          sessionUserId={userId}
          onCancel={noPinMode ? () => setLockFlag(false) : undefined}
          onStaffChanged={() => void refreshPins()}
          onUnlocked={(n) => void onUnlocked(n)}
        />
      )}
    </div>
  );
}
