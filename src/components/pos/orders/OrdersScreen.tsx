"use client";

// OrdersScreen.tsx — จอ "ออเดอร์ทุกช่องทาง" ของหน้าขาย (POS P2.8U · ภาพ 09 · มติผู้คุม 1–8) · เจ้าของสถานะทั้งจอ
//   กรอบ = หัวบริบทของหน้าขาย (RegisterTopContext) + แถบโหมด (แท็บ "ออเดอร์ออนไลน์" active + ป้ายนับจากการดึงของจอนี้) +
//     รางช่องทาง 220px (≥1024 · มือถือ = ตัวเลือกช่องทาง + ส่วนตั้งค่าท้ายจอ) + หัวกระดาน + 4 คอลัมน์ (มือถือ = ทีละคอลัมน์ด้วยแถบสลับ) +
//     แผงรายละเอียด 320px (≥1280 · iPad = แผ่นขวา · มือถือ = เต็มจอ)
//   ข้อมูล: listOrdersAction ทุก 10 วิ ขณะเห็นจอ (ล้างตัวจับเวลาเมื่อออก · กลับมาที่แท็บ = ดึงทันที) · ordersChannelsAction พร้อมกัน ·
//     แผง = getOrderAction (โหลดใหม่ทุกรอบดึง/หลังทุกปุ่ม) · นาฬิกา = `at` ของเซิร์ฟเวอร์ + เวลาที่ผ่านไปบนเครื่อง (ตัวนับเดินทุก 1 วิ)
//   เสียงเตือน (ปริยายปิด · localStorage ต่อเครื่อง): ออเดอร์ใหม่ (id ใหม่ในคอลัมน์ใหม่ระหว่างรอบดึง) = เสียง 2 จังหวะ + "(N)" หน้าชื่อแท็บเบราว์เซอร์
//   ปุ่ม: รับ/ปฏิเสธ/เตรียม/พร้อม/ส่งมอบ/ยกเลิก/แก้เวลา = order-actions · รับเงิน = จอชำระเดิม (OrderPay · คีย์ใหม่ต่อการเปิด) · ดูบิล = ลิ้นชักบิลของหน้าบิลวันนี้ (?bill=)
//   คำปฏิเสธ: messageKey (ใต้ pos) ถ้ามี ไม่งั้น refusalMessageKey(code) · ORDER_STATE_CHANGED = แทนการ์ดด้วย order ที่ส่งกลับ + toast · PENDING_APPROVAL = toast รอผู้จัดการ
// 🔴 ไม่มีการคิดเงินในจอ — ยอดทุกตัวมาจากเซิร์ฟเวอร์ · ข้อความเวลา/ตัวนับวาดหลัง mount เท่านั้น (HF-418)
// 🔴 ไฟล์ "use client": import โมดูล POS ได้แค่ *-shared · *-actions · device-id · staff-session (G9)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useInApp } from "@/lib/ui/use-in-app";
import {
  acceptOrderAction,
  cancelOrderAction,
  getOrderAction,
  handOverAction,
  listOrdersAction,
  markPreparingAction,
  markReadyAction,
  rejectOrderAction,
  setChannelOrderSettingsAction,
  setPrepMinutesAction,
} from "@/lib/modules/pos/order-actions";
import { ordersChannelsAction } from "@/lib/modules/pos/order-ui-actions";
import { ORDER_COLUMNS, ORDER_PREP_DEFAULT_MIN, type ListOrdersResult, type OrderActionResult, type OrderCard, type OrderColumn, type OrderDetail, type OrderRefusal, type OrderRejectReason } from "@/lib/modules/pos/order-shared";
import { moneyText, refusalMessageKey, type RegisterStatus } from "@/lib/modules/pos/register-shared";
import { registerStatusAction } from "@/lib/modules/pos/register-actions";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { readStaffSession, type StaffSession } from "@/lib/modules/pos/staff-session";
import { RegisterTopContext } from "@/components/pos/register/RegisterTopContext";
import { RegisterModeTabs as ModeTabsNav } from "@/components/pos/register/RegisterModeTabs";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { DoneRow, OrderCardView } from "./OrderCardView";
import { OrderPanel } from "./OrderPanel";
import { ChannelChooser, isPausedNow, OrdersRail, RailSettings, railChannels } from "./OrdersRail";
import { CancelDialog, PauseDialog, PrepDialog, RejectDialog } from "./OrderDialogs";
import { OrderPay } from "./OrderPay";
import { ManualOrderEntry } from "./ManualOrderEntry";
import {
  beep,
  bkkClock,
  bkkDate,
  cardsByColumn,
  clockNow,
  minAcceptLeft,
  mmss,
  newOrderKey,
  ORDERS_ACCEPT_RED_SEC,
  ORDERS_POLL_MS,
  ORDERS_TICK_MS,
  PAUSE_UNTIL_REOPEN_MS,
  readSoundPref,
  writeSoundPref,
  type FloorClock,
  type OrdersChannel,
} from "./orders-ui";

type List = Extract<ListOrdersResult, { ok: true }>;
type Toast = { text: string; tone?: "danger" };
export type OrdersPerms = { accept: boolean; reject: boolean; create: boolean; priceOverride: boolean; voidSale: boolean };

export type OrdersScreenProps = {
  systemId: string;
  unitId: string;
  tenantName: string;
  units: { id: string; name: string }[];
  tablesHref: string | null;
  perms: OrdersPerms;
  promptpayId: string | null;
};

type Layer =
  | { kind: "reject"; card: OrderCard }
  | { kind: "cancel"; card: OrderCard; key: string }
  | { kind: "pause" }
  | { kind: "prep"; card: OrderCard; mode: "accept" | "change"; initial: number }
  | { kind: "pay"; key: string }
  | { kind: "manual"; key: string };

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

export function OrdersScreen(p: OrdersScreenProps) {
  const t = useTranslations("pos.orders");
  const tr = useTranslations("pos.register");
  const tpos = useTranslations("pos");
  const tch = useTranslations("pos.channel");
  const wide = useMedia("(min-width: 768px)");
  const lg = useMedia("(min-width: 1024px)") === true;
  const xl = useMedia("(min-width: 1280px)") === true;
  const inApp = useInApp();
  const base = `/app/sys/${p.systemId}`;

  // ═══════ เวลา (หลัง mount เท่านั้น) ═══════
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState<FloorClock | null>(null);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((v) => v + 1), ORDERS_TICK_MS);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick = ตัวกระตุ้นให้ตัวนับเดิน
  const now = useMemo(() => (mounted ? clockNow(clock, Date.now()) : null), [mounted, clock, tick]);

  // ═══════ ข้อความลอย ═══════
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: Toast) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  /** คำปฏิเสธ → ข้อความ: messageKey (ใต้ pos · เช่น orders.errors.webPaid) ก่อน · ไม่มี = refusalMessageKey(code) */
  const refusalText = useCallback((r: Pick<OrderRefusal, "code" | "messageKey">) => (r.messageKey ? tpos(r.messageKey) : tr(refusalMessageKey(r.code))), [tpos, tr]);

  // ═══════ ออนไลน์ · เครื่อง · ผู้ขาย · สถานะหน้าขาย (หัวบริบท) ═══════
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
  const [status, setStatus] = useState<RegisterStatus | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  useEffect(() => {
    const d = getPosDeviceId();
    setDeviceId(d);
    setStaff(readStaffSession(d));
    void registerStatusAction({ systemId: p.systemId, unitId: p.unitId, deviceId: d })
      .then((r) => {
        if (r.ok) setStatus(r);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอน mount
  }, []);
  const target = useCallback(() => ({ systemId: p.systemId, unitId: p.unitId, ...(getPosDeviceId() ? { deviceId: getPosDeviceId() } : {}) }), [p.systemId, p.unitId]);

  // ═══════ เสียงเตือน (ต่อเครื่อง · ปริยายปิด) ═══════
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => setSoundOn(readSoundPref()), []);
  const soundRef = useRef(false);
  soundRef.current = soundOn;
  const baseTitle = useRef<string | null>(null);

  // ═══════ รายการ + ช่องทาง (ดึงทุก 10 วิ) ═══════
  const [list, setList] = useState<List | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [channels, setChannels] = useState<OrdersChannel[]>([]);
  const seenNew = useRef<Set<string> | null>(null);
  const listSeq = useRef(0);
  const refreshList = useCallback(async (): Promise<List | null> => {
    const seq = ++listSeq.current;
    try {
      const [r, ch] = await Promise.all([listOrdersAction(target()), ordersChannelsAction(target()).catch(() => null)]);
      if (seq !== listSeq.current) return null;
      if (ch && ch.ok) setChannels(ch.items);
      if (!r.ok) {
        setListErr(refusalText(r));
        return null;
      }
      setList(r);
      setClock({ serverMs: Date.parse(r.at), localMs: Date.now() });
      setListErr(null);
      setLastSyncAt(new Date());
      // ออเดอร์ใหม่ระหว่างรอบดึง (รอบแรก = ตั้งต้น ไม่เตือน)
      const ids = new Set(r.orders.filter((o) => o.status === "NEW").map((o) => o.id));
      const prev = seenNew.current;
      if (prev) {
        const fresh = r.orders.filter((o) => o.status === "NEW" && !prev.has(o.id));
        if (fresh.length) {
          showToast({ text: t("newOrderToast", { channel: channelDisplayName(fresh[0]!.channel.code, fresh[0]!.channel.name, tch) }) });
          if (soundRef.current) beep();
        }
      }
      seenNew.current = ids;
      return r;
    } catch {
      if (seq === listSeq.current) setListErr(t("page.loadFailed"));
      return null;
    }
  }, [refusalText, showToast, t, target, tch]);
  // ป้ายหน้าชื่อแท็บเบราว์เซอร์: เสียงเปิด + มีออเดอร์ใหม่ = "(N) ชื่อเดิม"
  const newCount = list?.counts.byColumn.new ?? null;
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title;
    document.title = soundOn && newCount ? `(${newCount}) ${baseTitle.current}` : baseTitle.current;
  }, [soundOn, newCount]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  // ═══════ เลือกออเดอร์ · แผง ═══════
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [panelErr, setPanelErr] = useState<string | null>(null);
  const [saleVoided, setSaleVoided] = useState<string | null>(null);
  const [prepOverride, setPrepOverride] = useState<{ id: string; n: number } | null>(null);
  const detailSeq = useRef(0);
  const loadDetail = useCallback(
    async (id: string) => {
      const seq = ++detailSeq.current;
      try {
        const r = await getOrderAction({ ...target(), id });
        if (seq !== detailSeq.current) return;
        if (r.ok) {
          setDetail(r.order);
          setDetailErr(null);
        } else setDetailErr(refusalText(r));
      } catch {
        if (seq === detailSeq.current) setDetailErr(t("page.loadFailed"));
      }
    },
    [refusalText, t, target],
  );
  useEffect(() => {
    detailSeq.current++;
    setDetail(null);
    setDetailErr(null);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);
  const selCard = list?.orders.find((o) => o.id === selectedId) ?? null;
  const shownDetail = detail && detail.id === selectedId ? detail : null;

  // ═══════ ดึงซ้ำทุก 10 วิ ขณะเห็นจอ ═══════
  const pollRef = useRef({ refreshList, loadDetail, selectedId });
  pollRef.current = { refreshList, loadDetail, selectedId };
  useEffect(() => {
    const run = () => {
      const r = pollRef.current;
      void r.refreshList();
      if (r.selectedId) void r.loadDetail(r.selectedId);
    };
    run();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, ORDERS_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const reloadAll = useCallback(async () => {
    await refreshList();
    if (pollRef.current.selectedId) await loadDetail(pollRef.current.selectedId);
  }, [refreshList, loadDetail]);

  // ═══════ ตัวกรองช่องทาง · คอลัมน์มือถือ ═══════
  const [filter, setFilter] = useState("all");
  const [mobileCol, setMobileCol] = useState<OrderColumn>("new");
  const shownCards = useMemo(() => (list ? (filter === "all" ? list.orders : list.orders.filter((o) => o.channel.id === filter)) : []), [list, filter]);
  const cols = useMemo(() => cardsByColumn(shownCards), [shownCards]);
  const chanById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const railRows = useMemo(() => railChannels(channels), [channels]);
  /** ช่องทางที่ค่าตั้ง (เวลาเตรียม/ปิดรับ) จะลง: ช่องที่เลือกในราง · ทุกช่องทาง = ทุกช่องในราง */
  const settingTargets = useMemo(() => (filter === "all" ? railRows : railRows.filter((c) => c.id === filter)), [filter, railRows]);
  const targetLabel = filter === "all" ? t("rail.all") : (() => {
    const c = chanById.get(filter);
    return c ? channelDisplayName(c.code, c.name, tch) : t("rail.all");
  })();
  const prepValue = useMemo(() => {
    const vals = new Set(settingTargets.map((c) => c.prepMinutes ?? ORDER_PREP_DEFAULT_MIN));
    return vals.size === 1 ? [...vals][0]! : settingTargets.length === 0 ? ORDER_PREP_DEFAULT_MIN : null;
  }, [settingTargets]);
  const paused = useMemo(() => railRows.filter((c) => isPausedNow(c, now)), [railRows, now]);

  // ═══════ ชั้นบน (แผ่น/กล่อง) ═══════
  const [layer, setLayer] = useState<Layer | null>(null);
  const [layerErr, setLayerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openLayer = (l: Layer) => {
    setLayerErr(null);
    setLayer(l);
  };
  const closeLayer = useCallback(() => {
    if (busy) return;
    setLayer(null);
    setLayerErr(null);
  }, [busy]);
  const closePanel = useCallback(() => setSelectedId(null), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (layer) {
        if (layer.kind !== "pay") closeLayer(); // จอชำระจัดการ Esc เอง
      } else if (selectedId && !xl) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer, selectedId, xl, closeLayer, closePanel]);

  /** ผลของปุ่มที่เปลี่ยนสถานะ: สำเร็จ = แทนการ์ด + โหลดแผง · STATE_CHANGED = แทนการ์ดด้วย order ที่ส่งกลับ + toast */
  const applyCard = useCallback((o: OrderCard) => {
    setList((l) => (l ? { ...l, orders: l.orders.map((x) => (x.id === o.id ? o : x)) } : l));
  }, []);
  const handle = useCallback(
    async (fn: () => Promise<OrderActionResult>, opts: { okToast?: string; inLayer?: boolean; onRefusal?: (r: OrderRefusal) => boolean } = {}): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setPanelErr(null);
      try {
        const r = await fn();
        if (r.ok) {
          applyCard(r.order);
          if (opts.okToast) showToast({ text: opts.okToast });
          setLayer(null);
          void reloadAll();
          return true;
        }
        if (opts.onRefusal?.(r)) return false;
        if (r.code === "ORDER_STATE_CHANGED") {
          if (r.order) applyCard(r.order);
          setLayer(null);
          showToast({ text: refusalText(r), tone: "danger" });
          void reloadAll();
          return false;
        }
        if (opts.inLayer) setLayerErr(refusalText(r));
        else {
          setPanelErr(refusalText(r));
          showToast({ text: refusalText(r), tone: "danger" });
        }
        return false;
      } catch {
        const m = t("page.loadFailed");
        if (opts.inLayer) setLayerErr(m);
        else showToast({ text: m, tone: "danger" });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyCard, busy, refusalText, reloadAll, showToast, t],
  );

  const acceptPrepOf = (c: OrderCard) => (prepOverride && prepOverride.id === c.id ? prepOverride.n : (c.prepMinutes ?? chanById.get(c.channel.id)?.prepMinutes ?? ORDER_PREP_DEFAULT_MIN));
  const accept = (c: OrderCard, prep?: number) =>
    void handle(() => acceptOrderAction({ ...target(), id: c.id, ...(prep !== undefined ? { prepMinutes: prep } : {}) }), { okToast: t("toast.accepted", { ref: c.ref }) });
  const reject = (c: OrderCard, reason: OrderRejectReason, note: string) =>
    void handle(() => rejectOrderAction({ ...target(), id: c.id, reasonCode: reason, ...(note ? { note } : {}) }), { okToast: t("toast.rejected", { ref: c.ref }), inLayer: true });
  const startPrep = (c: OrderCard) => void handle(() => markPreparingAction({ ...target(), id: c.id }));
  const ready = (c: OrderCard) => void handle(() => markReadyAction({ ...target(), id: c.id }), { okToast: t("toast.ready", { ref: c.ref }) });
  const handOver = (c: OrderCard) =>
    void handle(() => handOverAction({ ...target(), id: c.id }), {
      okToast: t("toast.handed", { ref: c.ref }),
      onRefusal: (r) => {
        if (r.messageKey === "orders.errors.saleVoided") {
          // H3: บิลถูกยกเลิกแล้ว — ส่งมอบไม่ได้ · เสนอ "ยกเลิกออเดอร์" แทน (เปิดแผงของออเดอร์นี้)
          setSelectedId(c.id);
          setSaleVoided(c.id);
          setPanelErr(refusalText(r));
          return true;
        }
        return false;
      },
    });
  const cancel = (c: OrderCard, reason: string, key: string) =>
    void handle(() => cancelOrderAction({ ...target(), id: c.id, reason, idempotencyKey: key }), {
      okToast: t("toast.cancelled", { ref: c.ref }),
      inLayer: true,
      onRefusal: (r) => {
        if (r.code === "PENDING_APPROVAL") {
          setLayer(null);
          showToast({ text: t("cancel.pendingApproval") });
          void reloadAll();
          return true;
        }
        return false;
      },
    });
  const changePrep = (c: OrderCard, n: number) => void handle(() => setPrepMinutesAction({ ...target(), id: c.id, prepMinutes: n }), { inLayer: true, okToast: t("toast.prepChanged", { n }) });

  /** ค่าตั้งรับออเดอร์ของช่องทาง (ทีละช่อง · ช่องไหนพัง = แจ้ง + หยุด) */
  const saveSettings = async (targets: readonly OrdersChannel[], patch: { autoAccept?: boolean; prepMinutes?: number | null; pausedUntil?: string | null }, okToast?: string): Promise<boolean> => {
    if (busy || !targets.length) return false;
    setBusy(true);
    try {
      for (const c of targets) {
        const r = await setChannelOrderSettingsAction({ ...target(), input: { channelId: c.id, ...patch } });
        if (!r.ok) {
          const m = refusalText(r);
          if (layer) setLayerErr(m);
          showToast({ text: m, tone: "danger" });
          return false;
        }
        setChannels((cs) => cs.map((x) => (x.id === r.channel.id ? { ...x, autoAccept: r.channel.autoAccept, prepMinutes: r.channel.prepMinutes, pausedUntil: r.channel.pausedUntil } : x)));
      }
      if (okToast) showToast({ text: okToast });
      setLayer(null);
      return true;
    } catch {
      showToast({ text: t("page.loadFailed"), tone: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const pause = (minutes: number | null) => {
    const base0 = now ?? Date.now();
    const until = new Date(base0 + (minutes === null ? PAUSE_UNTIL_REOPEN_MS : minutes * 60_000)).toISOString();
    void saveSettings(settingTargets, { pausedUntil: until }, t("toast.paused", { time: bkkClock(until) }));
  };

  // ═══════ ส่วนประกอบของจอ ═══════
  const total = list?.summary.count ?? null;
  const settingsNode = p.perms.accept ? (
    <RailSettings
      channels={railRows}
      targetLabel={targetLabel}
      prepValue={prepValue}
      busy={busy}
      onAuto={(c, on) => void saveSettings([c], { autoAccept: on }, on ? t("toast.autoOn", { channel: channelDisplayName(c.code, c.name, tch) }) : t("toast.autoOff", { channel: channelDisplayName(c.code, c.name, tch) }))}
      onPrep={(n) => void saveSettings(settingTargets, { prepMinutes: n }, t("toast.prepDefault", { n }))}
      onPause={() => openLayer({ kind: "pause" })}
    />
  ) : null;

  const billHref = (d: OrderDetail) => (d.saleId ? `${base}/pos/sales?unit=${encodeURIComponent(p.unitId)}${bkkDate(d.acceptedAt ?? d.receivedAt) ? `&date=${bkkDate(d.acceptedAt ?? d.receivedAt)}` : ""}&bill=${encodeURIComponent(d.saleId)}` : null);
  const panelOf = (inAside: boolean) =>
    selCard ? (
      <OrderPanel
        detail={shownDetail}
        refText={selCard.ref}
        loadError={detailErr}
        channel={chanById.get(selCard.channel.id) ?? null}
        now={now}
        perms={{ accept: p.perms.accept, reject: p.perms.reject, create: p.perms.create }}
        busy={busy}
        acceptPrep={acceptPrepOf(selCard)}
        error={panelErr}
        saleVoided={saleVoided === selCard.id}
        billHref={shownDetail ? billHref(shownDetail) : null}
        onAccept={() => accept(selCard, acceptPrepOf(selCard))}
        onEditPrep={() => openLayer({ kind: "prep", card: selCard, mode: selCard.status === "NEW" ? "accept" : "change", initial: selCard.status === "NEW" ? acceptPrepOf(selCard) : (selCard.prepMinutes ?? acceptPrepOf(selCard)) })}
        onReject={() => openLayer({ kind: "reject", card: selCard })}
        onStart={() => startPrep(selCard)}
        onReady={() => ready(selCard)}
        onHandOver={() => handOver(selCard)}
        onPay={() => openLayer({ kind: "pay", key: newOrderKey("ordpay") })}
        onCancel={() => openLayer({ kind: "cancel", card: selCard, key: newOrderKey("ordcancel") })}
        onRetry={() => void loadDetail(selCard.id)}
        onClose={inAside ? undefined : closePanel}
      />
    ) : null;

  const layerNode = (() => {
    if (!layer) return null;
    switch (layer.kind) {
      case "reject":
        return <RejectDialog refText={layer.card.ref} busy={busy} error={layerErr} onConfirm={(r, n) => reject(layer.card, r, n)} onClose={closeLayer} />;
      case "cancel":
        return <CancelDialog refText={layer.card.ref} receiptNo={layer.card.receiptNo} busy={busy} error={layerErr} onConfirm={(r) => cancel(layer.card, r, layer.key)} onClose={closeLayer} />;
      case "pause":
        return <PauseDialog targetLabel={targetLabel} busy={busy} error={layerErr} onPick={pause} onClose={closeLayer} />;
      case "prep":
        return (
          <PrepDialog
            initial={layer.initial}
            title={t("prep.title", { ref: layer.card.ref })}
            busy={busy}
            error={layerErr}
            onConfirm={(n) => {
              if (layer.mode === "accept") {
                setPrepOverride({ id: layer.card.id, n });
                setLayer(null);
              } else changePrep(layer.card, n);
            }}
            onClose={closeLayer}
          />
        );
      case "pay":
        return shownDetail ? (
          <OrderPay
            key={layer.key}
            systemId={p.systemId}
            unitId={p.unitId}
            deviceId={deviceId}
            order={shownDetail}
            idempotencyKey={layer.key}
            promptpayId={p.promptpayId}
            salesHref={`${base}/pos/sales?unit=${encodeURIComponent(p.unitId)}`}
            onPaid={(_, dup) => {
              setLayer(null);
              showToast({ text: dup ? t("toast.paidAlready") : t("toast.paid", { amount: moneyText(shownDetail.totalSatang) }) });
              void reloadAll();
            }}
            onGone={(r) => {
              setLayer(null);
              if (r.order) applyCard(r.order);
              showToast({ text: refusalText(r), tone: "danger" });
              void reloadAll();
            }}
            onClose={() => setLayer(null)}
          />
        ) : null;
      case "manual":
        return (
          <ManualOrderEntry
            key={layer.key}
            systemId={p.systemId}
            unitId={p.unitId}
            deviceId={deviceId}
            channels={channels}
            initialChannelId={filter === "all" ? null : filter}
            idempotencyKey={layer.key}
            canOverridePrice={p.perms.priceOverride}
            onDone={(orderId, dup) => {
              setLayer(null);
              showToast({ text: dup ? t("toast.manualDuplicated") : t("toast.manualSaved") });
              setPanelErr(null);
              setSaleVoided(null);
              setSelectedId(orderId);
              void reloadAll();
            }}
            onConflict={() => showToast({ text: tr(refusalMessageKey("IDEMPOTENCY_CONFLICT")), tone: "danger" })}
            onClose={closeLayer}
          />
        );
    }
  })();

  const colTitle: Record<OrderColumn, string> = { new: t("columns.new"), preparing: t("columns.preparing"), ready: t("columns.ready"), done: t("columns.done") };
  const newLeft = now !== null ? minAcceptLeft(cols.new, now) : null;
  const pick = (c: OrderCard) => {
    setSaleVoided(null);
    setPanelErr(null);
    setSelectedId(c.id);
  };
  const columnNode = (col: OrderColumn) => {
    const cards = cols[col];
    const n = list ? list.counts.byColumn[col] : null;
    return (
      <section key={col} data-testid={`pos-ord-col-${col}`} aria-label={colTitle[col]} className="flex min-w-0 flex-col gap-2.5">
        <h3 className="flex items-center gap-2 px-1 text-[13.5px] font-bold">
          <span>{colTitle[col]}</span>
          {n !== null ? <span className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] tabular-nums ${col === "new" && n > 0 ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]"}`}>{n}</span> : null}
          {col === "new" && newLeft !== null ? (
            <span data-testid="pos-ord-new-left" className={`truncate text-[12.5px] ${newLeft < ORDERS_ACCEPT_RED_SEC ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-accent)]"}`}>
              {"· "}
              {t("columns.newHint", { time: mmss(newLeft) })}
            </span>
          ) : null}
        </h3>
        {col === "done" ? (
          <>
            {cards.length ? (
              <ul className="overflow-hidden rounded-[16px] border bg-[color:var(--color-surface)]">
                {cards.map((c) => (
                  <DoneRow key={c.id} card={c} selected={c.id === selectedId} now={now} onPick={() => pick(c)} />
                ))}
              </ul>
            ) : (
              <p className="px-1 text-[12.5px] text-[color:var(--color-muted)]">{t("columns.empty")}</p>
            )}
            {list ? (
              <div data-testid="pos-ord-summary" className="flex flex-col gap-0.5 px-1 text-[12px] text-[color:var(--color-muted)]">
                <span>{t("summary.rejectedCancelled", { count: list.summary.rejectedCancelled })}</span>
                <span>{t("summary.avgAccept", { seconds: list.summary.avgAcceptSeconds })}</span>
                <span>{t("summary.onTime", { n: list.summary.onTime.n, m: list.summary.onTime.m })}</span>
              </div>
            ) : null}
          </>
        ) : cards.length ? (
          <ul className="flex flex-col gap-2.5">
            {cards.map((c) => (
              <OrderCardView
                key={c.id}
                card={c}
                selected={c.id === selectedId}
                now={now}
                perms={{ accept: p.perms.accept, reject: p.perms.reject }}
                busy={busy}
                onPick={() => pick(c)}
                onAccept={() => accept(c)}
                onReject={() => openLayer({ kind: "reject", card: c })}
                onHandOver={() => handOver(c)}
              />
            ))}
          </ul>
        ) : (
          <p className="px-1 text-[12.5px] text-[color:var(--color-muted)]">{t("columns.empty")}</p>
        )}
      </section>
    );
  };

  const empty = !!list && list.orders.length === 0;
  const board = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:px-5">
        <h2 data-testid="pos-ord-head" className="min-w-0 text-[15px] font-bold">
          {t("todayCount", { count: list?.summary.count ?? 0 })}
          <span className="ml-2 text-[13px] font-normal text-[color:var(--color-muted)]">{`· ${t("todayTotal", { amount: moneyText(list?.summary.totalSatang ?? 0) })}`}</span>
        </h2>
        <span className="flex-1" />
        <button
          type="button"
          role="switch"
          aria-checked={soundOn}
          data-testid="pos-ord-sound"
          className="inline-flex h-11 items-center gap-2 rounded-[12px] border px-3 text-[13px] text-[color:var(--color-ink-soft)]"
          onClick={() => {
            const v = !soundOn;
            setSoundOn(v);
            writeSoundPref(v);
            if (v) beep();
          }}
        >
          <RegisterIcon name="flag" size={13} />
          {t("sound.label")} <b className="text-[color:var(--color-ink)]">{soundOn ? t("sound.on") : t("sound.off")}</b>
        </button>
        <span data-testid="pos-ord-updated" className="text-[12.5px] tabular-nums text-[color:var(--color-muted)]">
          {mounted && list ? t("updatedAt", { time: bkkClockSec(list.at) }) : ""}
        </span>
        {p.perms.create ? (
          <button type="button" data-testid="pos-ord-manual" className="btn btn-primary h-11 rounded-[12px] px-4 text-[14px] font-bold" onClick={() => openLayer({ kind: "manual", key: newOrderKey("ordman") })}>
            {t("actions.keyOrder")}
          </button>
        ) : null}
      </div>
      {!lg && wide !== null && (
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <ChannelChooser channels={channels} counts={list?.counts.byChannel ?? null} total={total} filter={filter} onFilter={setFilter} />
        </div>
      )}
      {paused.map((c) => (
        <div key={c.id} data-testid={`pos-ord-paused-${c.code}`} role="status" className="flex flex-wrap items-center gap-3 border-b bg-[color:var(--color-surface-2)] px-5 py-2.5 text-[13.5px]">
          <RegisterIcon name="lock" size={14} />
          <span className="min-w-0 flex-1">{t("pausedBanner", { channel: channelDisplayName(c.code, c.name, tch), time: bkkClock(c.pausedUntil) })}</span>
          {p.perms.accept ? (
            <button type="button" data-testid={`pos-ord-reopen-${c.code}`} disabled={busy} className="btn btn-ghost h-11 rounded-[12px] px-4 text-[13.5px] font-bold disabled:opacity-50" onClick={() => void saveSettings([c], { pausedUntil: null }, t("toast.reopened", { channel: channelDisplayName(c.code, c.name, tch) }))}>
              {t("rail.reopen")}
            </button>
          ) : null}
        </div>
      ))}
      {!p.perms.accept && list ? (
        <p data-testid="pos-ord-readonly" className="border-b px-5 py-2 text-[12.5px] text-[color:var(--color-muted)]">
          {t("page.readOnly")}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-4">
        {!list ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-[14.5px] text-[color:var(--color-muted)]" role="alert" aria-busy={!listErr}>
            <p>{listErr ?? t("page.loading")}</p>
            {listErr ? (
              <button type="button" data-testid="pos-ord-retry" className="btn btn-ghost h-11 rounded-[13px] px-5" onClick={() => void refreshList()}>
                {t("page.retry")}
              </button>
            ) : null}
          </div>
        ) : empty ? (
          <div data-testid="pos-ord-empty" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
            <RegisterIcon name="truck" size={28} className="text-[color:var(--color-muted)]" />
            <h2 className="text-[18px] font-bold">{t("empty")}</h2>
            <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("page.emptyBody")}</p>
          </div>
        ) : wide === false ? (
          <div className="flex flex-col gap-3">
            <div role="tablist" aria-label={t("columns.label")} className="grid grid-cols-4 gap-1 rounded-[12px] bg-[color:var(--color-surface-2)] p-1">
              {ORDER_COLUMNS.map((col) => (
                <button
                  key={col}
                  type="button"
                  role="tab"
                  aria-selected={mobileCol === col}
                  data-testid={`pos-ord-coltab-${col}`}
                  className={`h-11 truncate rounded-[10px] px-1 text-[12.5px] ${mobileCol === col ? "bg-[color:var(--color-surface)] font-bold shadow-sm" : "text-[color:var(--color-ink-soft)]"}`}
                  onClick={() => setMobileCol(col)}
                >
                  {`${colTitle[col]} ${list.counts.byColumn[col]}`}
                </button>
              ))}
            </div>
            {columnNode(mobileCol)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">{ORDER_COLUMNS.map((col) => columnNode(col))}</div>
        )}
        {!lg && wide !== null && settingsNode ? <div className="mt-6 border-t pt-2">{settingsNode}</div> : null}
      </div>
    </div>
  );

  const panel = panelOf(false);
  return (
    <div data-testid="pos-ord-root" className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[color:var(--color-surface)] md:h-[calc(100dvh-3.5rem)] md:min-h-0 md:overflow-hidden">
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
          unitHref={(id) => `${base}/pos/orders?unit=${encodeURIComponent(id)}`}
        />
        <ModeTabsNav systemId={p.systemId} active="online-orders" unitId={p.unitId} tablesHref={p.tablesHref} ordersBadge={newCount} />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {lg && <OrdersRail channels={channels} counts={list?.counts.byChannel ?? null} total={total} filter={filter} onFilter={setFilter} now={now} settings={settingsNode} />}
          {board}
          {xl && (
            <aside data-testid="pos-ord-side" className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l">
              {panelOf(true) ?? (
                <p data-testid="pos-ord-pick-hint" className="px-6 py-10 text-center text-[14px] text-[color:var(--color-muted)]">
                  {t("page.pickHint")}
                </p>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* แผงบน iPad (แผ่นขวา) / มือถือ (เต็มจอ) — เปิดเมื่อเลือกออเดอร์ */}
      {!xl && wide !== null && panel && (
        <div className="contents" inert={!!layer}>
          <div
            data-testid="pos-ord-panel-frame"
            className={
              wide
                ? "fixed bottom-0 right-0 top-14 z-40 flex w-[380px] max-w-[100vw] flex-col overflow-y-auto border-l bg-[color:var(--color-surface)] shadow-2xl"
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
          data-testid="pos-ord-toast"
          className={`pointer-events-none fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-[520px] items-center gap-3 rounded-[16px] px-[18px] py-[14px] text-[14px] leading-[1.5] shadow-xl ${toast.tone === "danger" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"}`}
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1">{toast.text}</span>
        </div>
      )}
    </div>
  );
}

/** HH:MM:SS เวลาไทยของ iso ("อัปเดต 12:10:22") */
function bkkClockSec(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const d = new Date(at + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}
