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
// จุดต่อของใบหลัง (สเปก §1.3): addFromSearchEnter (P1.4) · onHold/onOpenHeld (P1.5) · InterimPayDialog + SaleDone (P1.6 แทนทั้งไฟล์)
//   memberSlot ของ CartPanel (P1.12) · onNeedsApproval (P1.15 PIN) · ProductCard.onPick → pick (P1.2 ป๊อปโอเวอร์ตัวเลือก)
// 🔴 ไฟล์ "use client": import จากโมดูล POS ได้แค่ register-shared · pricing-shared · register-actions (G9 · S5.17)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (S5.3) · testid เขียนตรงบนแท็กเสมอ (G1)

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import { useInApp } from "@/lib/ui/use-in-app";
import { priceCart, type PriceDiscount } from "@/lib/modules/pos/pricing-shared";
import {
  cartToPriceInput,
  cartToQuoteInput,
  cartToSubmitInput,
  displayName,
  moneyText,
  refusalMessageKey,
  REGISTER_MAX_LINES,
  REGISTER_MAX_QTY,
  type RegisterCart,
  type RegisterCartLine,
  type RegisterPayMethod,
  type RegisterCategory,
  type RegisterProduct,
  type RegisterQuote,
  type RegisterSaleStatus,
  type RegisterStatus,
  type RegisterSubmitInput,
  type RegisterSubmitOk,
} from "@/lib/modules/pos/register-shared";
import { quoteRegisterCartAction, registerCatalogAction, registerScanAction, registerStatusAction, submitRegisterSaleAction } from "@/lib/modules/pos/register-actions";
import { BillDiscountDialog } from "./BillDiscountDialog";
import { CartPanel, type CartTotalsModel } from "./CartPanel";
import type { CartLineModel } from "./CartLine";
import { CategoryChips } from "./CategoryChips";
import { ClearBillDialog } from "./ClearBillDialog";
import { CouponDialog } from "./CouponDialog";
import { CustomItemDialog } from "./CustomItemDialog";
import { InterimPayDialog, type PayChoice, type PayError, type PayPhase } from "./InterimPayDialog";
import { LineEditor, type LineEditResult } from "./LineEditor";
import { MobileCartBar } from "./MobileCartBar";
// ชื่อลงท้าย Sheet/Tabs = ตัวสแกนปุ่ม (F15.3) นับเป็น "คอมโพเนนต์กดได้" ⇒ ใช้ชื่อแฝงตอนวาง (ตัวที่กดได้จริงข้างในมี testid ครบแล้ว)
import { MobileCartSheet as CartSheetFrame } from "./MobileCartSheet";
import { OpenPriceDialog } from "./OpenPriceDialog";
import { ProductGrid } from "./ProductGrid";
import { RegisterModeTabs as ModeTabsNav } from "./RegisterModeTabs";
import { RegisterIcon } from "./RegisterIcon";
import { RegisterStatusBar } from "./RegisterStatusBar";
import { RegisterTopContext } from "./RegisterTopContext";
import { SaleDone } from "./SaleDone";
import { SearchRow } from "./SearchRow";

export type RegisterScreenProps = {
  systemId: string;
  unitId: string;
  tenantName: string;
  units: { id: string; name: string }[];
  /** หน้าแรกของกริด (เซิร์ฟเวอร์) · null = โหลดไม่สำเร็จ (จอแจ้ง + ลองใหม่) */
  initialCatalog: { categories: RegisterCategory[]; products: RegisterProduct[]; nextCursor: string | null } | null;
  initialStatus: RegisterStatus | null;
  vat: { mode: "INCLUDED" | "NONE"; rateBp: number };
  limits: { canSell: boolean; canOverridePrice: boolean; maxDiscountBp: number | null };
  /** PromptPay ID ของร้าน (ใช้วาด QR ล็อกยอด) · null = ยังไม่ตั้ง */
  promptpayId: string | null;
};

type Msg = { key: string; values?: Record<string, string | number> };
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
  | { kind: "done"; result: RegisterSubmitOk };

const newKey = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
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

/** PERCENT ของตัวตรวจเพดาน (bp) → "10" สำหรับข้อความ {limit}% */
const pctText = (bp: number) => String(Number((bp / 100).toFixed(2)));

export function RegisterScreen(props: RegisterScreenProps) {
  const { systemId, unitId, limits, vat } = props;
  const t = useTranslations("pos.register");
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
  const catalogueEmpty = !!props.initialCatalog && products.length === 0 && !q.trim() && categoryId === null && categories.length === 0 && !catalogPending;

  // ═══════ ตะกร้า + ยอด ═══════
  const [cart, setCart] = useState<RegisterCart>({ lines: [] });
  const [cartVer, setCartVer] = useState(0);
  const [quote, setQuote] = useState<{ ver: number; q: RegisterQuote } | null>(null);
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
  const [toast, setToast] = useState<Msg | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: Msg) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const [online, setOnline] = useState(true);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<RegisterStatus | null>(props.initialStatus);
  const synced = () => setLastSyncAt(new Date());

  // ═══════ การส่งบิล ═══════
  const [idemKey, setIdemKey] = useState(newKey);
  const [payPhase, setPayPhase] = useState<PayPhase>("form");
  const [payError, setPayError] = useState<PayError | null>(null);
  const [conflict, setConflict] = useState<{ receiptNo: string | null; saleStatus: RegisterSaleStatus } | null>(null);
  const sendingRef = useRef(false);
  /** ชุดคำขอที่ส่งไปแล้วแต่ยังไม่รู้ผล — ลองซ้ำต้องส่งตัวนี้ (ไม่สร้างใหม่) */
  const pendingSubmit = useRef<RegisterSubmitInput | null>(null);
  const frozen = payPhase === "sending" || payPhase === "unknown" || payPhase === "conflict";
  /** ค่าล่าสุดที่วาดแล้ว — งาน async (ผลสแกน) อ่านจาก ref ไม่ใช่ค่าที่ติดมากับ closure ตอนกด Enter (B2.2 S1) */
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
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

  // ── แถบสถานะ: ทุก 60 วิ ขณะเห็นจอ + หลังขายเสร็จ ──
  const statusSeq = useRef(0);
  const refreshStatus = useCallback(async () => {
    const seq = ++statusSeq.current;
    try {
      const r = await registerStatusAction({ systemId, unitId });
      if (seq !== statusSeq.current) return; // B2.2 N3: คำตอบเก่าที่มาช้ากว่าคำตอบใหม่ = ทิ้ง
      if (r.ok) {
        setStatus(r);
        synced();
      }
    } catch {
      /* เครือข่ายล้ม — ค่าเดิมค้างไว้ */
    }
  }, [systemId, unitId]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus();
    }, 60_000);
    return () => clearInterval(id);
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
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
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
    const input = cartToPriceInput(cart, known.current, vat, limits.maxDiscountBp);
    if ("ok" in input) return null; // สินค้าไม่รู้จัก/ไม่มีราคา — รอ quote ของเซิร์ฟเวอร์ตัดสิน
    const r = priceCart(input);
    return r.ok ? r : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- known เปลี่ยนพร้อม cartVer
  }, [cart, cartVer, vat, limits.maxDiscountBp]);

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
          setQuote({ ver, q: r });
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

  const quoteFresh = quote && quote.ver === cartVer ? quote.q : null;
  const quoteFailed = quoteErr && quoteErr.ver === cartVer ? quoteErr.code : null;
  const shownTotals: CartTotalsModel | null = quoteFresh ?? (local ? { ...local } : quote?.q ?? null);
  const payEnabled = cart.lines.length > 0 && !!quoteFresh && online && limits.canSell && payPhase === "form" && !frozen;
  const lastAmount = quoteFresh?.grandTotalSatang ?? local?.grandTotalSatang ?? quote?.q.grandTotalSatang ?? 0;
  const payAmount = quoteSlow && !quoteFresh ? tc("loading") : moneyText(cart.lines.length ? lastAmount : 0);

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
    if (key === "errors.discountExceedsLimit") return { key, values: { limit: pctText(limits.maxDiscountBp ?? 0) } };
    if (key === "errors.tooManyLines") return { key, values: { max: REGISTER_MAX_LINES } };
    if (key === "errors.stockInsufficient") return { key, values: { count: 0 } };
    return { key };
  }
  const msgNode = (m: Msg) => t.rich(m.key, { ...(m.values ?? {}), b: (c) => <b>{c}</b> });

  // ── แบบจำลองบรรทัดสำหรับวาด (ราคาเซิร์ฟเวอร์ทับราคากริดเมื่อ quote ตรงตะกร้า — มติ Q22) ──
  const lineModels: CartLineModel[] = cart.lines.map((l, i) => {
    const ql = quoteFresh?.lines[i];
    const ll = local?.lines[i];
    const prod = l.kind === "product" ? known.current.get(l.productId) : undefined;
    const unit = ql?.unitPriceSatang ?? ll?.unitPriceSatang ?? (l.kind === "custom" ? l.unitPriceSatang : (l.openPriceSatang ?? prod?.priceSatang ?? 0));
    const stockLeft = prod && prod.trackStock && prod.stockLeft !== null ? prod.stockLeft : null;
    const over = stockLeft !== null && l.qty > stockLeft;
    return {
      key: l.key,
      name: l.kind === "custom" ? l.name : prod ? displayName(prod, locale) : "-",
      qty: l.qty,
      unitPriceSatang: unit,
      grossSatang: ql?.grossSatang ?? ll?.grossSatang ?? unit * l.qty,
      discountSatang: ql?.discountSatang ?? ll?.discountSatang ?? 0,
      stockLeft,
      warn: over && warnAck[l.key] !== l.qty,
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
  const onHold = soon; // P1.5 แทน: พักบิล (F8)
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
    updateCart((prev) => {
      const same = prev.lines.findIndex((l) => l.kind === "product" && l.productId === p.id && !l.discount && l.openPriceSatang === undefined);
      if (same < 0) return appendTo(prev, { kind: "product", productId: p.id, qty: 1 }, key);
      return { ...prev, lines: prev.lines.map((l, i) => (i === same ? { ...l, qty: Math.min(REGISTER_MAX_QTY, l.qty + 1) } : l)) };
    });
    focusSearch();
  };
  /** แตะการ์ด (P1.2 จะเปิดป๊อปโอเวอร์ตัวเลือกตรงนี้เมื่อ optionGroupCount > 0) */
  const pick = (p: RegisterProduct) => {
    known.current.set(p.id, p);
    if (frozenRef.current) return;
    if (p.soldOutReason === "UNAVAILABLE") return showToast({ key: "errors.productUnavailable" });
    if (p.requiredOptionGroupCount > 0) return showToast({ key: "errors.optionsRequired" });
    if (p.priceSatang === null) {
      if (!limits.canOverridePrice) return showToast({ key: "errors.priceNotSet" });
      return push({ kind: "openPrice", productId: p.id });
    }
    addProduct(p);
  };

  /** Enter ในช่องค้นหา (Q24 · P1.4 รับช่วง: ตรวจจับการสแกนรัว · ตัวเลือกเมื่อบาร์โค้ดซ้ำ) */
  const addFromSearchEnter = async () => {
    const term = q.trim();
    if (!term || frozen) return;
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
      if (!r.ok) return showToast(errorFor(r.code));
      if (r.match === "one") {
        pick(r.product);
        clearTerm();
      } else if (r.match === "choose") {
        // B2.2 N3: บาร์โค้ดซ้ำหลายสินค้า ⇒ วางตัวเลือกในกริดให้แตะ (ตัวเลือกเต็มรูป = P1.4) + บอกให้เลือก
        catalogSeq.current++; // คำตอบกริดที่ค้างอยู่ห้ามทับรายการนี้
        remember(r.products);
        setProducts(r.products);
        setNextCursor(null);
        setShownQ(term);
        showToast({ key: "search.chooseOne", values: { count: r.products.length } });
      } else {
        // B2.2 N3: ไม่พบ = แจ้งให้เห็น (เดิมเงียบ)
        showToast({ key: "search.noResult", values: { q: term } });
      }
    } catch {
      if (gen === billGen.current) showToast({ key: "errors.loadFailed" });
    }
  };

  const lineIndex = (key: string) => cart.lines.findIndex((l) => l.key === key);
  /** ทดลองตะกร้าใหม่ด้วย priceCart ก่อนใช้จริง — ไม่ผ่าน = คืนข้อความ (กล่องค้าง ไม่ตัดเลขให้พอดี) */
  const tryCart = (next: RegisterCart): Msg | null => {
    const input = cartToPriceInput(next, known.current, vat, limits.maxDiscountBp);
    if ("ok" in input) return null; // ราคายังไม่รู้ (สินค้าใหม่จากเซิร์ฟเวอร์) — ให้ quote ตัดสิน
    const r = priceCart(input);
    return r.ok ? null : errorFor(r.code);
  };
  const applyLine = (key: string, r: LineEditResult): Msg | null => {
    const i = lineIndex(key);
    if (i < 0) return null;
    const lines = cart.lines.map((l, j) => (j === i ? ({ ...l, qty: r.qty, discount: r.discount } as RegisterCartLine) : l));
    const next = { ...cart, lines };
    const err = tryCart(next);
    if (err) return err;
    changeCart(next);
    pop();
    focusSearch();
    return null;
  };
  const removeLine = (key: string) => {
    changeCart({ ...cart, lines: cart.lines.filter((l) => l.key !== key) });
    pop();
    focusSearch();
  };
  const applyBillDiscount = (d: PriceDiscount | undefined): Msg | null => {
    const next: RegisterCart = { ...cart, billDiscount: d };
    if (!d) delete next.billDiscount;
    const err = tryCart(next);
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
  const resetBill = () => {
    billGen.current++;
    changeCart({ lines: [] });
    setIdemKey(newKey());
    setWarnAck({});
    pendingSubmit.current = null;
    setPayPhase("form");
    setPayError(null);
    setConflict(null);
  };

  // ═══════ ชำระเงิน ═══════
  const openPay = () => {
    // B2.2 S2: กล่องชำระเปิดอยู่แล้ว = ไม่ทำอะไร (แตะรัว/F4+คลิก ห้ามซ้อนกล่อง และห้ามล้าง error ของกล่องที่เปิดอยู่)
    if (!payEnabled || layersRef.current.some((l) => l.kind === "pay")) return;
    setPayError(null);
    setPayPhase("form");
    setLayers((s) => (s.some((l) => l.kind === "pay") ? s : [...s, { kind: "pay" }]));
  };
  const send = async (sale: RegisterSubmitInput) => {
    if (sendingRef.current) return; // กดซ้ำ/Enter ซ้ำ = คำขอเดียวระหว่างทาง
    sendingRef.current = true;
    pendingSubmit.current = sale;
    setPayPhase("sending");
    setPayError(null);
    try {
      const r = await submitRegisterSaleAction({ systemId, unitId, sale });
      synced();
      if (r.ok) {
        pendingSubmit.current = null;
        setPayPhase("form");
        setLayers((s) => [...s.filter((l) => l.kind !== "pay" && l.kind !== "sheet"), { kind: "done", result: r }]);
        void refreshStatus();
        return;
      }
      if (r.code === "UNKNOWN" || r.code === "INTERNAL" || r.code === "BUSY") {
        setPayPhase("unknown"); // ไม่แน่ใจ — คีย์เดิม ชุดคำขอเดิม
        return;
      }
      if (r.code === "IDEMPOTENCY_CONFLICT" && "saleId" in r) {
        setConflict({ receiptNo: r.receiptNo, saleStatus: r.saleStatus });
        setPayPhase("conflict");
        return;
      }
      // ปฏิเสธที่ชัดว่าไม่มีบิล ⇒ คีย์ใหม่สำหรับครั้งหน้า
      pendingSubmit.current = null;
      setIdemKey(newKey());
      setPayPhase("form");
      setPayError({ code: r.code, ...errorFor(r.code) });
      if (r.code === "PRICE_CHANGED" && "grandTotalSatang" in r) {
        // ยอดสดจากคำตอบ (ไม่ต้อง quote ซ้ำ) — ผู้ใช้ต้องกดยืนยันใหม่กับยอดนี้
        setQuote({
          ver: cartVer,
          q: {
            ok: true,
            subtotalSatang: r.subtotalSatang,
            lineDiscountSatang: r.lineDiscountSatang,
            billDiscountSatang: r.billDiscountSatang,
            couponDiscountSatang: r.couponDiscountSatang,
            netSatang: r.netSatang,
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
      setPayPhase("unknown"); // เครือข่ายล้ม/หมดเวลา — ไม่รู้ว่าบันทึกแล้วหรือยัง
    } finally {
      sendingRef.current = false;
    }
  };
  const confirmPay = (c: PayChoice) => {
    if (!quoteFresh || sendingRef.current || payPhase !== "form") return;
    const due = quoteFresh.grandTotalSatang;
    // ทุกช่องจ่าย ≥ 1 สตางค์ · บิล 0 บาท = payMethods [] (Addendum 2 · B1.1 ข้อ 4)
    const payMethods: RegisterPayMethod[] = due === 0 || c.method === "NONE" ? [] : [{ type: c.method, amountSatang: due }];
    if (c.method === "CASH" && (c.receivedSatang ?? 0) < due) return;
    const sale = cartToSubmitInput(cart, {
      idempotencyKey: idemKey,
      payMethods,
      ...(c.method === "CASH" && due > 0 ? { cashReceivedSatang: c.receivedSatang } : {}),
      expectedGrandTotalSatang: due,
    });
    void send(sale);
  };
  const retryPay = () => {
    if (pendingSubmit.current) void send(pendingSubmit.current); // ชุดเดิมทุกไบต์ · คีย์เดิม
  };
  const nextSale = () => {
    resetBill();
    setLayers([]);
    focusSearch();
  };

  // ═══════ แป้นลัด: ตัวจับเดียวบน window (สเปก §3.6) ═══════
  const keyState = useRef({ top, payEnabled, q, cartLen: cart.lines.length, payPhase, frozen });
  keyState.current = { top, payEnabled, q, cartLen: cart.lines.length, payPhase, frozen };
  const handlers = useRef({ openPay, onHold, pop, push, setQ });
  handlers.current = { openPay, onHold, pop, push, setQ };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = keyState.current;
      const h = handlers.current;
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

  // ═══════ วาด ═══════
  const lineOf = (key: string) => cart.lines.find((l) => l.key === key);
  const cartPanel = (variant: "inline" | "sheet") => (
    <CartPanel
      variant={variant}
      lines={lineModels}
      totals={cart.lines.length ? shownTotals : null}
      payAmount={payAmount}
      payEnabled={payEnabled}
      error={errorMsg ? msgNode(errorMsg) : null}
      frozen={frozen}
      onPay={openPay}
      onSoon={soon}
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
            focus={l.focus}
            onApply={(r) => applyLine(l.key, r)}
            onRemove={() => removeLine(l.key)}
            onClose={pop}
          />
        );
      }
      case "billDiscount":
        return <BillDiscountDialog key={k} current={cart.billDiscount} onApply={applyBillDiscount} onCoupon={() => push({ kind: "coupon" })} onClose={pop} />;
      case "coupon":
        return <CouponDialog key={k} onClose={pop} />;
      case "custom":
        return (
          <CustomItemDialog
            key={k}
            onAdd={(name, price) => {
              if (cart.lines.length >= REGISTER_MAX_LINES) return { key: "errors.tooManyLines", values: { max: REGISTER_MAX_LINES } };
              addLine({ kind: "custom", name, unitPriceSatang: price, qty: 1 });
              pop();
              focusSearch();
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
              focusSearch();
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
              focusSearch();
            }}
            onClose={pop}
          />
        );
      case "pay":
        return (
          <InterimPayDialog
            key={k}
            dueSatang={quoteFresh?.grandTotalSatang ?? quote?.q.grandTotalSatang ?? 0}
            quotePending={!quoteFresh}
            itemCount={cart.lines.length}
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
      case "done":
        return (
          <SaleDone
            key={k}
            receiptNo={l.result.receiptNo}
            totalSatang={l.result.grandTotalSatang}
            changeSatang={l.result.changeSatang}
            onNext={nextSale}
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
          user={status ? { name: status.user.name, role: status.user.role } : null}
          onCamera={soon}
        />
        <ModeTabsNav systemId={systemId} />
        {!online && (
          <div data-testid="pos-reg-offline-banner" className="flex shrink-0 items-center gap-3 bg-[color:var(--color-ink)] px-5 py-[13px] text-[14px] leading-[1.5] text-[color:var(--color-surface)]" role="status">
            <RegisterIcon name="warn" size={18} />
            <span>{t("status.offlineBanner", { time: formatThaiTime(offlineSince ?? new Date()) })}</span>
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
              onCamera={soon}
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

        <RegisterStatusBar pendingStock={status?.pendingStockCount ?? 0} pendingSync={status?.pendingSyncCount ?? 0} />
      </div>

      {/* ── ชั้นกล่อง (วาดตามลำดับ — ตัวท้ายอยู่บนสุด) · ชั้นที่ไม่ใช่บนสุด = inert (B2.2 S2) ── */}
      {layers.map((l, i) => (
        <div key={`${l.kind}-${i}`} className="contents" inert={i < layers.length - 1}>
          {layerNode(l, `${l.kind}-${i}`)}
        </div>
      ))}
      {toast && (
        <div
          data-testid="pos-reg-toast"
          className="pointer-events-none fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-[520px] items-center gap-3 rounded-[16px] bg-[color:var(--color-ink)] px-[18px] py-[14px] text-[14px] leading-[1.5] text-[color:var(--color-surface)] shadow-xl max-md:bottom-[150px]"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1">{msgNode(toast)}</span>
        </div>
      )}
    </div>
  );
}
