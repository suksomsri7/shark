"use client";

// TablesScreen.tsx — จอ "โต๊ะ" ของหน้าขาย (POS P2.4U · ภาพ 03 · มติผู้คุม 1–9) · เจ้าของสถานะทั้งจอ
//   กรอบ = หัวบริบทของหน้าขาย (RegisterTopContext) + แถบโหมด (แท็บ "โต๊ะ" active) + ผัง (ซ้าย) + แผงโต๊ะ/แจ้งเตือน (ขวา)
//   D ≥1280 = แผงเป็นคอลัมน์ขวาเสมอ (ไม่ได้เลือก = คำแนะนำ) · T/M 768–1279 = แผงเป็นแผ่นขวาเมื่อเลือกโต๊ะ · C <768 = แผงเต็มจอ (ปุ่มย้อนกลับของเบราว์เซอร์ปิดได้)
//   ข้อมูล: registerTablesAction + registerTableRequestsAction ทุก 20 วิ ขณะเห็นจอ (ล้างตัวจับเวลาเมื่อออก) · กลับมาที่แท็บ = ดึงทันที
//     แผง = registerTableDetailAction (โหลดใหม่ทุกรอบดึง) · ยอด = quoteRegisterCartAction({cart:{lines:[], tableSessionId}}) ใหม่เมื่อ itemsHash เปลี่ยน
//   เช็คบิล = TableCheckout (จอชำระเดิม) · จองโต๊ะ = ReservationsDialog · ผูกสมาชิก = แผงสมาชิกของหน้าขาย (MemberPanel)
// 🔴 ไม่มีการคิดเงินในจอ — ยอดทุกตัวมาจากเซิร์ฟเวอร์ · ข้อความเวลา/นาทีวาดหลัง mount เท่านั้น (HF-418) · ข้อความผิดพลาดมาจาก refusalMessageKey / pos.tables.*
// 🔴 ไฟล์ "use client": import โมดูล POS ได้แค่ *-shared · *-actions · device-id · staff-session (G9)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useInApp } from "@/lib/ui/use-in-app";
import { refusalMessageKey, type PosDiscountCaps, type RegisterMemberItem, type RegisterQuote, type RegisterStatus } from "@/lib/modules/pos/register-shared";
import type { RegisterTableDetailResult, RegisterTablesResult, TableCard, TableRoundItem } from "@/lib/modules/pos/table-shared";
import {
  registerAckTableRequestAction,
  registerCancelTableItemAction,
  registerClearTableAction,
  registerCloseTableAction,
  registerDoneTableRequestAction,
  registerLinkTableMemberAction,
  registerOpenTableAction,
  registerSeatReservationAction,
  registerTableDetailAction,
  registerTableRequestsAction,
  registerTablesAction,
} from "@/lib/modules/pos/table-actions";
import { quoteRegisterCartAction, registerMemberLookupAction, registerStatusAction } from "@/lib/modules/pos/register-actions";
import { listStaffForDeviceAction } from "@/lib/modules/pos/staff-pin-actions";
import { heartbeatAction } from "@/lib/modules/pos/device-actions";
import { POS_PRINTER_DEFAULTS, parsePrinterConfig, type PosDeviceView } from "@/lib/modules/pos/device-shared";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { clearStaffSession, readStaffSession, type StaffSession } from "@/lib/modules/pos/staff-session";
import { RegisterTopContext } from "@/components/pos/register/RegisterTopContext";
import { RegisterModeTabs as ModeTabsNav } from "@/components/pos/register/RegisterModeTabs";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { MemberPanel } from "@/components/pos/register/MemberPanel";
import { ScanCameraDialog } from "@/components/pos/register/ScanCameraDialog";
import { TableFloor } from "./TableFloor";
import { TablePanel } from "./TablePanel";
import { TableAlerts, type TableRequest } from "./TableAlerts";
import { CancelItemDialog, CloseTableDialog, OpenTableDialog } from "./TableDialogs";
import { ReservationsDialog } from "./ReservationsDialog";
import { readTablePending, TableCheckout, type TableToast } from "./TableCheckout";
import { bkkClock, clockNow, newCheckoutKey, type FloorClock } from "./table-ui";

type Floor = Extract<RegisterTablesResult, { ok: true }>;
type Detail = Extract<RegisterTableDetailResult, { ok: true }>;
type Pending = NonNullable<ReturnType<typeof readTablePending>>;

export type TablesScreenProps = {
  systemId: string;
  unitId: string;
  userId: string;
  tenantName: string;
  units: { id: string; name: string }[];
  /** registerTableMode (มติ Q5) — null = อ่านไม่ได้ */
  mode: { visible: boolean; tableCount: number; canCreateTables: boolean } | null;
  initialFloor: Floor | null;
  /** หน้าตั้งค่าโต๊ะเดิม (มีสิทธิ์ restaurant.table.create) — null = ไม่มีปุ่ม */
  setupHref: string | null;
  /** ?open=<sessionId> — เลือกโต๊ะนั้นตอนเปิดจอ (กลับจากส่งครัว) */
  initialOpen: string | null;
  /** ?sent=<เลขออเดอร์> — toast "ส่งครัวแล้ว · ออเดอร์ #N" */
  sentNo: number | null;
  limits: { canSell: boolean; canOverridePrice: boolean; maxDiscountBp: number | null };
  discountCaps?: PosDiscountCaps;
  promptpayId: string | null;
  tipEnabled: boolean;
  payIntent: { beamCard: boolean; manualRequiresManager: boolean; canManageShift: boolean; promptpayLink: string };
};

type Layer =
  | { kind: "open"; card: TableCard }
  | { kind: "cancel"; item: TableRoundItem }
  | { kind: "close" }
  | { kind: "member" }
  | { kind: "reservations" }
  | { kind: "checkout"; sessionId: string; tableName: string; preset: boolean; restore: Pending | null };

const POLL_MS = 20_000;
const TICK_MS = 30_000;

/** media query หลัง mount (null = ยังไม่รู้) */
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

export function TablesScreen(p: TablesScreenProps) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const tm = useTranslations("pos.member");
  const ts = useTranslations("pos.shift");
  const locale = useLocale();
  const wide = useMedia("(min-width: 768px)");
  const xl = useMedia("(min-width: 1280px)") === true;
  const inApp = useInApp();
  const base = `/app/sys/${p.systemId}`;
  const unitQ = `unit=${encodeURIComponent(p.unitId)}`;

  // ═══════ เวลา (หลัง mount เท่านั้น) ═══════
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState<FloorClock | null>(null);
  useEffect(() => {
    setMounted(true);
    if (p.initialFloor) setClock({ serverMs: Date.parse(p.initialFloor.serverTime), localMs: Date.now() });
    const id = setInterval(() => setTick((v) => v + 1), TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอน mount
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick = ตัวกระตุ้นให้นาทีขยับ
  const now = useMemo(() => (mounted ? clockNow(clock, Date.now()) : null), [mounted, clock, tick]);

  // ═══════ ข้อความลอย ═══════
  const [toast, setToast] = useState<TableToast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: TableToast) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const msgText = (m: TableToast) => (m.ns === "tables" ? t(m.key, m.values) : tr(m.key, m.values));
  const errKey = (code: string): TableToast => ({ key: refusalMessageKey(code), ns: "register" });

  // ═══════ ออนไลน์ · เครื่อง · ผู้ขาย · สถานะหน้าขาย ═══════
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const apply = () => setOnline(navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [anyPin, setAnyPin] = useState<boolean | null>(null);
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [status, setStatus] = useState<RegisterStatus | null>(null);
  const [device, setDevice] = useState<PosDeviceView | null | undefined>(undefined);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  useEffect(() => {
    const d = getPosDeviceId();
    setDeviceId(d);
    setStaff(readStaffSession(d));
    void (async () => {
      try {
        const r = await listStaffForDeviceAction({ systemId: p.systemId, unitId: p.unitId, ...(d ? { deviceId: d } : {}) });
        if (r.ok) {
          setAnyPin(r.items.some((x) => x.hasPin));
          setStaffNames(new Map(r.items.flatMap((x) => (x.name ? [[x.userId, x.name] as const] : []))));
        } else setAnyPin(true);
      } catch {
        setAnyPin(true);
      }
      if (d) {
        const hb = await heartbeatAction({ systemId: p.systemId, unitId: p.unitId, deviceCode: d }).catch(() => null);
        setDevice(hb?.ok ? hb.device : null);
      } else setDevice(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอน mount
  }, []);
  const refreshStatus = useCallback(async () => {
    try {
      const r = await registerStatusAction({ systemId: p.systemId, unitId: p.unitId, deviceId: getPosDeviceId() });
      if (r.ok) setStatus(r);
    } catch {
      /* ค่าเดิมค้างไว้ */
    }
  }, [p.systemId, p.unitId]);
  useEffect(() => {
    void refreshStatus();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus();
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshStatus]);
  const printer = useMemo(() => {
    const parsed = device && device.status === "ACTIVE" ? parsePrinterConfig(device.printerConfig) : null;
    return { config: parsed?.ok ? parsed.config : { ...POS_PRINTER_DEFAULTS }, deviceCode: device?.deviceCode ?? getPosDeviceId() };
  }, [device]);

  // ═══════ ผัง + แจ้งเตือน (ดึงทุก 20 วิ) ═══════
  const [floor, setFloor] = useState<Floor | null>(p.initialFloor);
  const [floorErr, setFloorErr] = useState<string | null>(null);
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const floorSeq = useRef(0);
  const refreshFloor = useCallback(async () => {
    const seq = ++floorSeq.current;
    try {
      const [f, rq] = await Promise.all([
        registerTablesAction({ systemId: p.systemId, unitId: p.unitId }),
        registerTableRequestsAction({ systemId: p.systemId, unitId: p.unitId }).catch(() => null),
      ]);
      if (seq !== floorSeq.current) return;
      if (f.ok) {
        setFloor(f);
        setClock({ serverMs: Date.parse(f.serverTime), localMs: Date.now() });
        setFloorErr(null);
        setLastSyncAt(new Date());
      } else setFloorErr(refusalMessageKey(f.code));
      if (rq && rq.ok) setRequests(rq.requests);
    } catch {
      if (seq === floorSeq.current) setFloorErr("errors.loadFailed");
    }
  }, [p.systemId, p.unitId]);

  // ═══════ เลือกโต๊ะ · แผง · ยอดของโต๊ะ ═══════
  const [zone, setZone] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** หลังพาลูกค้าที่จองนั่ง: เลือกโต๊ะของ session ใหม่เมื่อผังรอบถัดไปมาถึง */
  const selectSessionAfter = useRef<string | null>(null);
  useEffect(() => {
    const sid = selectSessionAfter.current;
    if (!sid || !floor) return;
    const c = floor.tables.find((x) => x.sessionId === sid);
    if (c) {
      selectSessionAfter.current = null;
      setSelectedId(c.id);
    }
  }, [floor]);
  const selCard = floor?.tables.find((c) => c.id === selectedId) ?? null;
  const selSession = selCard?.sessionId ?? null;
  const [detail, setDetail] = useState<{ sessionId: string; data: Detail } | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const detailSeq = useRef(0);
  const loadDetail = useCallback(
    async (sessionId: string) => {
      const seq = ++detailSeq.current;
      try {
        const r = await registerTableDetailAction({ systemId: p.systemId, unitId: p.unitId, tableSessionId: sessionId });
        if (seq !== detailSeq.current) return;
        if (r.ok) {
          setDetail({ sessionId, data: r });
          setDetailErr(null);
        } else setDetailErr(refusalMessageKey(r.code));
      } catch {
        if (seq === detailSeq.current) setDetailErr("errors.loadFailed");
      }
    },
    [p.systemId, p.unitId],
  );
  useEffect(() => {
    detailSeq.current++;
    setDetail(null);
    setDetailErr(null);
    if (selSession) void loadDetail(selSession);
  }, [selSession, loadDetail]);
  const shownDetail = detail && detail.sessionId === selSession ? detail.data : null;

  const [quote, setQuote] = useState<{ hash: string; q: RegisterQuote } | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const quoteSeq = useRef(0);
  const itemsHash = shownDetail && shownDetail.unpaidItemIds.length ? shownDetail.itemsHash : null;
  /** สมาชิกของโต๊ะ (ผูก/ถอดแล้วยอดเปลี่ยนได้ — ส่วนลดระดับ) = ตัวกระตุ้น quote อีกตัว */
  const tableMemberKey = shownDetail?.session.member?.id ?? "";
  const requoteTable = useCallback(async () => {
    const seq = ++quoteSeq.current;
    if (!selSession || !itemsHash) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }
    try {
      const r = await quoteRegisterCartAction({ systemId: p.systemId, unitId: p.unitId, cart: { lines: [], tableSessionId: selSession } });
      if (seq !== quoteSeq.current) return;
      if (r.ok) {
        setQuote({ hash: r.table?.itemsHash ?? itemsHash, q: r });
        setQuoteErr(null);
      } else {
        setQuote(null);
        setQuoteErr(r.code === "TABLE_EMPTY" ? null : refusalMessageKey(r.code));
      }
    } catch {
      if (seq === quoteSeq.current) setQuoteErr("errors.loadFailed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tableMemberKey = ตัวกระตุ้น (สมาชิกเปลี่ยน ⇒ ยอดใหม่)
  }, [p.systemId, p.unitId, selSession, itemsHash, tableMemberKey]);
  // ยอดของโต๊ะ = quote ใหม่ทุกครั้งที่ชุดรายการ (itemsHash) เปลี่ยน
  useEffect(() => {
    void requoteTable();
  }, [requoteTable]);
  const shownQuote = quote && itemsHash && quote.hash === itemsHash ? quote.q : null;

  // ═══════ ดึงซ้ำทุก 20 วิ ขณะเห็นจอ ═══════
  const pollRef = useRef({ refreshFloor, loadDetail, selSession });
  pollRef.current = { refreshFloor, loadDetail, selSession };
  useEffect(() => {
    const run = () => {
      const r = pollRef.current;
      void r.refreshFloor();
      if (r.selSession) void r.loadDetail(r.selSession);
    };
    if (!p.initialFloor) run();
    else void registerTableRequestsAction({ systemId: p.systemId, unitId: p.unitId }).then((rq) => rq.ok && setRequests(rq.requests)).catch(() => undefined);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวจับเวลาเดียวตลอดอายุจอ (อ่านค่าล่าสุดจาก ref)
  }, []);

  // ═══════ ชั้นกล่อง ═══════
  const [layer, setLayer] = useState<Layer | null>(null);
  const [busy, setBusy] = useState(false);
  const [layerErr, setLayerErr] = useState<string | null>(null);
  const [memberKey, setMemberKey] = useState(() => newCheckoutKey());
  const [memberCamera, setMemberCamera] = useState(false);
  const [busyReq, setBusyReq] = useState<string | null>(null);
  const openLayer = (l: Layer) => {
    setLayerErr(null);
    setLayer(l);
  };
  const closeLayer = () => {
    setLayer(null);
    setLayerErr(null);
    setMemberCamera(false);
  };

  // ── ตอนเปิดจอ: ?open= เลือกโต๊ะ · ?sent= toast · คำขอเช็คบิลที่ค้างจาก storage ⇒ เปิดจอชำระในสถานะ "ไม่แน่ใจ" ──
  const bootDone = useRef(false);
  useEffect(() => {
    if (bootDone.current || !floor) return;
    bootDone.current = true;
    if (p.initialOpen) {
      const c = floor.tables.find((x) => x.sessionId === p.initialOpen || x.id === p.initialOpen);
      if (c) setSelectedId(c.id);
    }
    if (p.sentNo) showToast({ key: "toast.sent", ns: "tables", values: { no: p.sentNo } });
    if (p.sentNo || p.initialOpen) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("sent");
        u.searchParams.delete("open");
        window.history.replaceState(window.history.state, "", u.toString());
      } catch {
        /* URL ค้างไว้ได้ */
      }
    }
    const pend = readTablePending(p.systemId, p.unitId, p.userId);
    if (pend) {
      const c = floor.tables.find((x) => x.sessionId === pend.sessionId);
      if (c) setSelectedId(c.id);
      setLayer({ kind: "checkout", sessionId: pend.sessionId, tableName: pend.tableName, preset: false, restore: pend });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวเมื่อมีผังแรก
  }, [floor]);

  // ── มือถือ: แผงเต็มจอเป็น "สถานะของเส้นทาง" — ปุ่มย้อนกลับของเบราว์เซอร์ปิดแผง ──
  const pushedPanel = useRef(false);
  const selectCard = (c: TableCard | null) => {
    setSelectedId(c?.id ?? null);
    if (c && wide === false && !pushedPanel.current) {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), posTbl: c.id }, "");
        pushedPanel.current = true;
      } catch {
        /* ไม่มี history = ปิดด้วยปุ่มอย่างเดียว */
      }
    }
  };
  useEffect(() => {
    const onPop = () => {
      if (pushedPanel.current) {
        pushedPanel.current = false;
        setSelectedId(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const closePanel = () => {
    if (pushedPanel.current) {
      try {
        window.history.back();
        return;
      } catch {
        pushedPanel.current = false;
      }
    }
    setSelectedId(null);
  };

  // ── Esc: ชั้นบนสุดก่อน (จอชำระจัดการ Esc เอง) → แผง (ที่ไม่ใช่คอลัมน์ถาวร) ──
  const escRef = useRef({ layer, selectedId, xl, busy });
  escRef.current = { layer, selectedId, xl, busy };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const s = escRef.current;
      if (s.layer) {
        if (s.layer.kind === "checkout" || s.busy) return;
        e.preventDefault();
        closeLayer();
      } else if (s.selectedId && !s.xl) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวจับเดียว
  }, []);

  const target = () => ({ systemId: p.systemId, unitId: p.unitId, ...(deviceId ? { deviceId } : {}) });
  const reloadAll = async () => {
    await refreshFloor();
    if (selSession) await loadDetail(selSession);
  };

  // ═══════ การกระทำ ═══════
  const openTable = async (c: TableCard, guests: number) => {
    if (busy) return;
    setBusy(true);
    setLayerErr(null);
    try {
      const r = await registerOpenTableAction({ ...target(), tableId: c.id, guestCount: guests });
      if (!r.ok) return setLayerErr(tr(refusalMessageKey(r.code)));
      closeLayer();
      showToast(r.reservationOverridden ? { key: "reservation.overridden", ns: "tables" } : { key: "toast.opened", ns: "tables", values: { table: c.name } });
      setSelectedId(c.id);
      await reloadAll();
    } catch {
      setLayerErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const seatReserved = async (c: TableCard) => {
    if (busy || !c.reservation) return;
    setBusy(true);
    try {
      const r = await registerSeatReservationAction({ ...target(), reservationId: c.reservation.id, tableId: c.id });
      if (!r.ok) {
        showToast(r.code === "VALIDATION" && c.sessionId ? { key: "errors.occupied", ns: "tables" } : errKey(r.code));
        return;
      }
      showToast({ key: "reservation.seated", ns: "tables", values: { table: c.name } });
      await reloadAll();
    } catch {
      showToast(errKey("UNKNOWN"));
    } finally {
      setBusy(false);
    }
  };
  const clearTable = async (c: TableCard) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await registerClearTableAction({ ...target(), tableId: c.id });
      showToast(r.ok ? { key: "toast.cleared", ns: "tables", values: { table: c.name } } : errKey(r.code));
      await refreshFloor();
    } catch {
      showToast(errKey("UNKNOWN"));
    } finally {
      setBusy(false);
    }
  };
  const cancelItem = async (item: TableRoundItem, reason: string) => {
    if (busy) return;
    setBusy(true);
    setLayerErr(null);
    try {
      const r = await registerCancelTableItemAction({ ...target(), itemId: item.id, reason });
      if (!r.ok) {
        // มติ 3: ถูกปฏิเสธตามกติกาเดิมของร้านอาหาร (VALIDATION) = เหตุผลภาษาไทยของเซิร์ฟเวอร์ · อื่น ๆ = คีย์
        setLayerErr(r.code === "VALIDATION" && r.message ? r.message : tr(refusalMessageKey(r.code)));
        return;
      }
      closeLayer();
      showToast({ key: "toast.cancelled", ns: "tables" });
      await reloadAll();
    } catch {
      setLayerErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const closeTable = async () => {
    if (busy || !selSession || !selCard) return;
    setBusy(true);
    setLayerErr(null);
    try {
      const r = await registerCloseTableAction({ ...target(), tableSessionId: selSession });
      if (!r.ok) {
        setLayerErr(tr(refusalMessageKey(r.code))); // TABLE_HAS_UNPAID · BUSY (กดอีกครั้งได้)
        return;
      }
      closeLayer();
      showToast({ key: "toast.closed", ns: "tables", values: { table: selCard.name } });
      await refreshFloor();
    } catch {
      setLayerErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const linkMember = async (memberId: string | null, name?: string) => {
    if (!selSession) return false;
    try {
      const r = await registerLinkTableMemberAction({ ...target(), tableSessionId: selSession, memberId });
      if (!r.ok) {
        showToast(errKey(r.code));
        return false;
      }
      showToast(memberId ? { key: "toast.memberLinked", ns: "tables", values: { name: name ?? "" } } : { key: "toast.memberUnlinked", ns: "tables" });
      await reloadAll();
      return true;
    } catch {
      showToast(errKey("UNKNOWN"));
      return false;
    }
  };
  const memberScan = async (code: string) => {
    try {
      const r = await registerMemberLookupAction({ systemId: p.systemId, unitId: p.unitId, q: code.trim().slice(0, 200) });
      if (!r.ok) return showToast(errKey(r.code));
      const m = r.items.length === 1 ? r.items[0]! : null;
      if (!m) return showToast({ key: "errors.memberNotFound", ns: "register" });
      if (m.suspended) return showToast({ key: "errors.memberSuspended", ns: "register" });
      if (await linkMember(m.id, m.name)) closeLayer();
    } catch {
      showToast(errKey("UNKNOWN"));
    }
  };
  const reqAction = async (r: TableRequest, kind: "ack" | "done") => {
    if (busyReq) return;
    setBusyReq(r.id);
    try {
      const res = kind === "ack" ? await registerAckTableRequestAction({ ...target(), requestId: r.id }) : await registerDoneTableRequestAction({ ...target(), requestId: r.id });
      showToast(res.ok ? { key: kind === "ack" ? "toast.acked" : "toast.done", ns: "tables" } : errKey(res.code));
      await refreshFloor();
    } catch {
      showToast(errKey("UNKNOWN"));
    } finally {
      setBusyReq(null);
    }
  };
  const openCheckout = (c: TableCard, preset: boolean) => {
    if (!c.sessionId) return;
    openLayer({ kind: "checkout", sessionId: c.sessionId, tableName: c.name, preset, restore: null });
  };
  const staffTokenDead = () => {
    clearStaffSession(deviceId);
    setStaff(null);
    showToast({ key: "errors.staffTokenInvalid", ns: "register" });
  };

  // ── เช็คบิลได้ไหม (เหตุผลแสดงใต้ปุ่ม) ──
  const shiftBlocked = !!status?.shiftRequired && !status?.shift;
  const checkoutBlock: React.ReactNode | null = !p.limits.canSell ? (
    tr("errors.permissionDenied")
  ) : !online ? (
    tr("errors.offline")
  ) : status?.deviceStatus === "REVOKED" ? (
    tr("status.deviceRevoked")
  ) : shiftBlocked ? (
    <span>
      {tr("errors.shiftRequired")}{" "}
      <Link data-testid="pos-tbl-shift-open" href={`${base}/pos/shifts?${unitQ}`} className="font-bold underline">
        {ts("open")}
      </Link>
    </span>
  ) : anyPin && !staff ? (
    <span>
      {t("checkout.needUnlock")}{" "}
      <Link data-testid="pos-tbl-unlock-register" href={`${base}/pos/register?${unitQ}`} className="font-bold underline">
        {t("checkout.openRegister")}
      </Link>
    </span>
  ) : null;

  // ═══════ วาด ═══════
  const empty = !!floor && floor.tables.length === 0;
  const unpaidOf = (tableId: string) => floor?.tables.find((c) => c.id === tableId)?.unpaidSatang ?? 0;
  const alertsNode = (compact: boolean) => (
    <TableAlerts
      requests={requests}
      unpaidOf={unpaidOf}
      now={now}
      busyId={busyReq}
      compact={compact}
      onAck={(r) => void reqAction(r, "ack")}
      onDone={(r) => void reqAction(r, "done")}
      onOpen={(r) => {
        const c = floor?.tables.find((x) => x.id === r.tableId);
        if (c) selectCard(c);
      }}
      onConfirmPay={(r) => {
        const c = floor?.tables.find((x) => x.id === r.tableId);
        if (!c) return;
        selectCard(c);
        if (!checkoutBlock) openCheckout(c, true);
      }}
    />
  );
  const orderMoreHref = selSession && p.limits.canSell ? `${base}/pos/register?${unitQ}&table=${encodeURIComponent(selSession)}` : null;
  const memberInfo = shownDetail?.session.member ?? null;
  const panel = selCard ? (
    <TablePanel
      card={selCard}
      detail={shownDetail}
      detailError={detailErr}
      quote={shownQuote}
      quoteError={quoteErr}
      serviceCharge={floor?.serviceCharge ?? null}
      staffName={(id) => (id ? (staffNames.get(id) ?? null) : null)}
      now={now}
      busy={busy}
      checkoutBlock={checkoutBlock}
      orderMoreHref={orderMoreHref}
      onOpen={() => openLayer({ kind: "open", card: selCard })}
      onSeat={() => void seatReserved(selCard)}
      onClear={() => void clearTable(selCard)}
      onCheckout={() => openCheckout(selCard, false)}
      onCancelItem={(item) => openLayer({ kind: "cancel", item })}
      onCloseTable={() => openLayer({ kind: "close" })}
      onLinkMember={
        status?.memberEnabled
          ? () => {
              setMemberKey(newCheckoutKey());
              openLayer({ kind: "member" });
            }
          : null
      }
      onUnlinkMember={() => void linkMember(null)}
      onViewBooking={() => openLayer({ kind: "reservations" })}
      onClose={xl ? undefined : closePanel}
    />
  ) : null;

  const layerNode = (() => {
    if (!layer) return null;
    switch (layer.kind) {
      case "open":
        return (
          <OpenTableDialog
            name={layer.card.name}
            seats={layer.card.seats}
            reservedNote={layer.card.reservation && now !== null ? t("open.reserved", { time: bkkClock(layer.card.reservation.at), name: layer.card.reservation.name }) : null}
            busy={busy}
            error={layerErr}
            onConfirm={(n) => void openTable(layer.card, n)}
            onClose={closeLayer}
          />
        );
      case "cancel":
        return <CancelItemDialog name={layer.item.name} busy={busy} error={layerErr} onConfirm={(reason) => void cancelItem(layer.item, reason)} onClose={closeLayer} />;
      case "close":
        return <CloseTableDialog name={selCard?.name ?? ""} busy={busy} error={layerErr} onConfirm={() => void closeTable()} onClose={closeLayer} />;
      case "member": {
        const attached: RegisterMemberItem | null = memberInfo
          ? { id: memberInfo.id, memberCode: "", name: memberInfo.name || "…", phoneMasked: "", tier: memberInfo.tier ? { key: memberInfo.tier, name: memberInfo.tier, color: "" } : null, points: 0, lastPurchaseAt: null, purchaseCount: 0, suspended: false }
          : null;
        return (
          <>
            <div className="contents" inert={memberCamera}>
              <MemberPanel
                systemId={p.systemId}
                unitId={p.unitId}
                attached={attached}
                benefits={null}
                formKey={memberKey}
                frozen={busy}
                onAttach={(m) => {
                  void (async () => {
                    if (await linkMember(m.id, m.name)) closeLayer();
                  })();
                }}
                onDetach={() => void linkMember(null)}
                onScan={() => setMemberCamera(true)}
                onFulfilled={() => undefined}
                onClose={closeLayer}
                onRekey={() => setMemberKey(newCheckoutKey())}
              />
            </div>
            {memberCamera && (
              <ScanCameraDialog
                onCode={(code) => {
                  setMemberCamera(false);
                  void memberScan(code);
                }}
                onClose={() => setMemberCamera(false)}
              />
            )}
          </>
        );
      }
      case "reservations":
        return (
          <ReservationsDialog
            systemId={p.systemId}
            unitId={p.unitId}
            deviceId={deviceId}
            tables={floor?.tables ?? []}
            nowMs={now ?? Date.now()}
            onChanged={(m, seatedSessionId) => {
              if (m) showToast(m);
              if (seatedSessionId) {
                closeLayer();
                selectSessionAfter.current = seatedSessionId;
              }
              void refreshFloor();
            }}
            onClose={closeLayer}
          />
        );
      case "checkout":
        return (
          <TableCheckout
            systemId={p.systemId}
            unitId={p.unitId}
            userId={p.userId}
            sessionId={layer.sessionId}
            tableName={layer.tableName}
            memberChip={memberInfo && shownDetail?.session.id === layer.sessionId ? tm("pay.chip", { name: memberInfo.name, tier: memberInfo.tier ?? tm("chip.general") }) : null}
            memberAttached={!!memberInfo}
            initialQuote={shownDetail?.session.id === layer.sessionId ? shownQuote : null}
            promptpayPreset={layer.preset}
            promptpayId={p.promptpayId}
            tipEnabled={p.tipEnabled}
            payIntent={p.payIntent}
            maxDiscountBp={staff && staff.userId !== p.userId && p.discountCaps ? (p.discountCaps[staff.role] >= 10_000 ? null : p.discountCaps[staff.role]) : p.limits.maxDiscountBp}
            discountCaps={p.discountCaps}
            deviceId={deviceId}
            staffToken={staff?.staffToken}
            printer={printer}
            locale={locale.startsWith("en") ? "en" : "th"}
            salesHref={`${base}/pos/sales`}
            restore={layer.restore}
            onToast={showToast}
            onStaffTokenDead={staffTokenDead}
            onFinished={() => {
              closeLayer();
              void reloadAll();
              void refreshStatus();
            }}
          />
        );
    }
  })();

  const floorBody = !floor ? (
    <div className="flex flex-col items-center gap-3 p-10 text-center text-[14.5px] text-[color:var(--color-muted)]" role="alert">
      <p>{floorErr ? tr(floorErr) : t("page.loadFailed")}</p>
      <button data-testid="pos-tbl-retry" type="button" className="btn btn-ghost h-11 rounded-[13px] px-5" onClick={() => void refreshFloor()}>
        {t("page.retry")}
      </button>
    </div>
  ) : empty ? (
    <div data-testid="pos-tbl-empty" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <RegisterIcon name="grid" size={28} className="text-[color:var(--color-muted)]" />
      <h2 className="text-[18px] font-bold">{t("empty.title")}</h2>
      <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("empty.body")}</p>
      {p.setupHref ? (
        <Link data-testid="pos-tbl-empty-setup" href={p.setupHref} className="btn btn-primary mt-1 h-12 rounded-[14px] px-6 text-[15px] font-bold">
          {t("empty.setup")}
        </Link>
      ) : (
        <p data-testid="pos-tbl-empty-muted" className="text-[13px] text-[color:var(--color-muted)]">
          {t("empty.noPermission")}
        </p>
      )}
    </div>
  ) : (
    <TableFloor
      floor={floor}
      zone={zone}
      onZone={setZone}
      selectedId={selectedId}
      now={now}
      busy={busy}
      onPick={(c) => selectCard(c)}
      onOpen={(c) => openLayer({ kind: "open", card: c })}
      onCleared={(c) => void clearTable(c)}
      onReservations={() => openLayer({ kind: "reservations" })}
      alerts={xl ? undefined : alertsNode(true)}
    />
  );

  return (
    <div data-testid="pos-tbl-root" className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[color:var(--color-surface)] md:h-[calc(100dvh-3.5rem)] md:min-h-0 md:overflow-hidden">
      <div className="contents" inert={!!layer}>
        <h1 className="sr-only">{t("title")}</h1>
        <RegisterTopContext
          wide={wide}
          inApp={inApp}
          systemId={p.systemId}
          tenantName={p.tenantName}
          units={p.units}
          activeUnitId={p.unitId}
          online={online}
          lastSyncAt={lastSyncAt}
          user={staff ? { name: staff.name ?? "-", role: staff.role } : status ? { name: status.user.name, role: status.user.role } : null}
          shift={status?.shift ?? null}
          onCamera={() => undefined}
          noCamera
          unitHref={(id) => `${base}/pos/tables?unit=${encodeURIComponent(id)}`}
        />
        <ModeTabsNav systemId={p.systemId} active="tables" unitId={p.unitId} />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="min-w-0 flex-1 md:overflow-y-auto">{floorBody}</div>
          {xl && floor && !empty && (
            <aside data-testid="pos-tbl-side" className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l">
              {panel ?? (
                <p data-testid="pos-tbl-pick-hint" className="px-6 py-10 text-center text-[14px] text-[color:var(--color-muted)]">
                  {t("page.pickHint")}
                </p>
              )}
              {alertsNode(false)}
            </aside>
          )}
        </div>
      </div>

      {/* แผงบน iPad (แผ่นขวา) / มือถือ (เต็มจอ) — เปิดเมื่อเลือกโต๊ะ */}
      {!xl && wide !== null && panel && (
        <div className="contents" inert={!!layer}>
          <div
            data-testid="pos-tbl-panel-frame"
            className={
              wide
                ? "fixed bottom-0 right-0 top-14 z-40 flex w-[420px] max-w-[100vw] flex-col overflow-y-auto border-l bg-[color:var(--color-surface)] shadow-2xl"
                : "fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom)]"
            }
          >
            {panel}
          </div>
        </div>
      )}

      {layerNode}

      {toast && (
        <div
          data-testid="pos-tbl-toast"
          className="pointer-events-none fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-[520px] items-center gap-3 rounded-[16px] bg-[color:var(--color-ink)] px-[18px] py-[14px] text-[14px] leading-[1.5] text-[color:var(--color-surface)] shadow-xl"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1">{msgText(toast)}</span>
        </div>
      )}
    </div>
  );
}
