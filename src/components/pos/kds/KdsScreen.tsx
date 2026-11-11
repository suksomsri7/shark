"use client";

// KdsScreen.tsx — จอครัว (KDS) ของ POS (P2.6U · ภาพ 04 · มติผู้คุม 1–11 · brief §6) · เจ้าของสถานะทั้งจอ
//   กรอบ: แถบบน (KdsTopBar) · แถวหัว = แท็บสถานี (ชื่อ + ตัวนับ openCount · แท็บที่เลือก = ตัวหนา + ขีดล่างสีเน้น + ตัวนับทึบ) + "รวมเสิร์ฟ (Expo)" ·
//     เวลาเฉลี่ย/เป้า · สวิตช์ "หยุดรับออเดอร์ครัว" · ปุ่ม "พิมพ์ใบครัว" · ป้ายพักครัว · 3 คอลัมน์ ใหม่/กำลังทำ/พร้อมเสิร์ฟ (1440 = 1fr 2fr 1fr gap 26 ·
//     กำลังทำ 2 คอลัมน์ย่อย · 1024 = 1fr 1fr 1fr · 390 = ตัวเลือกสถานี + แถบสลับคอลัมน์) · แถบเสิร์ฟแล้ววันนี้ (ดึงใบกลับ) · แถบล่าง/แผ่น 86
//   ข้อมูล: kdsBoardAction ทุก KDS_POLL_MS (6 วิ) ขณะเห็นจอ (Page Visibility) · ตัวจับเวลาเดินทุก 1 วิ จาก serverNow + เวลาที่ผ่านไปบนเครื่อง
//   ปุ่ม: แตะใบใหม่ = kdsStartAction · แตะบรรทัด = kdsLineDoneAction · เสร็จ = kdsTicketDoneAction · เสิร์ฟแล้ว = kdsServedAction ·
//     ดึงกลับ = kdsRecallAction · เร่ง = kdsRushAction · 86 = setAvailabilityAction(source KDS) · พักครัว = kitchenPauseAction เดิมของร้านอาหาร (มติ 3 ·
//     src/lib/actions/restaurant.ts:62 · restaurant.kitchen.pause) · พิมพ์ = kitchenSlipPayloadAction → kds-print (ทางพิมพ์ของใบเสร็จ P1.10)
//   คำปฏิเสธ: kdsRefusalMessageKey(code) → toast · TICKET_NOT_FOUND / changed 0 = โหลดบอร์ดใหม่เงียบ ๆ
//   🔴 ไม่มีเงิน · ไม่เรียงตั๋วใหม่ฝั่ง client (ลำดับ sortColumn ของเซิร์ฟเวอร์) · ข้อความเวลาวาดหลัง mount (HF-418) · ไม่มีเสียง (P2.11) · ไม่มีข้อความไทยในไฟล์ (ST7)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  kdsBoardAction,
  kdsLineDoneAction,
  kdsRecallAction,
  kdsRushAction,
  kdsServedAction,
  kdsStartAction,
  kdsTicketDoneAction,
  kitchenSlipPayloadAction,
  setAvailabilityAction,
} from "@/lib/modules/pos/kds-actions";
import { KDS_EXPO, KDS_POLL_MS, kdsRefusalMessageKey, type KdsBoard, type KdsColumn, type KdsRefusal, type KdsTicket, type KitchenSlip } from "@/lib/modules/pos/kds-shared";
import { heartbeatAction } from "@/lib/modules/pos/device-actions";
import { registerStatusAction } from "@/lib/modules/pos/register-actions";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { kdsKitchenPauseAction } from "@/lib/modules/pos/kds-actions"; // POS P5.2 ▸ D11: kitchenPauseAction เดิมปิดบนสาขาที่ผูก POS ⇒ จอครัวพักผ่าน POS ◂
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { KdsTopBar } from "./KdsTopBar";
import { KdsChannelChip, KdsTicketCard, useSourceText } from "./KdsTicketCard";
import { channelDisplayName } from "@/components/pos/settings/channel-text"; // POS P2.14 ▸ U2 Q3 ◂
import { CHANNEL_BUILTIN_NAMES, isChannelBuiltinCode } from "@/lib/modules/pos/channel-shared"; // POS P2.14 ▸ U2 Q3 ◂
import { KdsBottomBar, KdsEightySixPanel } from "./KdsEightySix";
import { printKitchenSlips } from "./kds-print";
import { bkkClock, clockNow, columnTickets, expoGroups, KDS_TICK_MS, midnightWindow, shortName, stationName, ticketKey, type FloorClock } from "./kds-ui";

export type KdsPerms = { advance: boolean; recall: boolean; rush: boolean; pause: boolean; setupStations: boolean; availability: boolean };
export type KdsScreenProps = {
  systemId: string;
  unitId: string;
  unitSlug: string | null;
  tenantName: string;
  units: { id: string; name: string }[];
  userName: string;
  initialStationId: string | null;
  perms: KdsPerms;
};

type Toast = { text: string; tone?: "danger" };
type ActionRes = { ok: true; changed?: number } | KdsRefusal;
const COLS: readonly KdsColumn[] = ["NEW", "COOKING", "READY"];
const COL_KEY: Record<KdsColumn, "new" | "cooking" | "ready"> = { NEW: "new", COOKING: "cooking", READY: "ready" };

export function KdsScreen(p: KdsScreenProps) {
  const t = useTranslations("pos.kds");
  const tpr = useTranslations("pos.print");
  const locale = useLocale();
  const sourceText = useSourceText();
  // POS P2.14 ▸ U2 Q3: ป้ายช่องทางของ "ล่าสุด" (ออนไลน์ = "ชื่อช่องทาง · เลขอ้างอิง" จากเซิร์ฟเวอร์) — ชื่อ builtin แปลผ่านตัวช่วยเดียวกับจอออเดอร์ ("Chat") · ชื่อที่ร้านตั้งเอง = คงเดิม ◂
  const tch = useTranslations("pos.channel");
  const onlineLastLabel = (label: string): string => {
    const [name = "", ...rest] = label.split(" · ");
    const code = Object.keys(CHANNEL_BUILTIN_NAMES).find((c) => isChannelBuiltinCode(c) && CHANNEL_BUILTIN_NAMES[c] === name);
    return [code ? channelDisplayName(code, name, tch) : name, ...rest].join(" · ");
  };
  const target = useMemo(() => ({ systemId: p.systemId, unitId: p.unitId }), [p.systemId, p.unitId]);

  // ═══════ เวลา (หลัง mount เท่านั้น) ═══════
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState<FloorClock | null>(null);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((v) => v + 1), KDS_TICK_MS);
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
  const refusalText = useCallback((r: Pick<KdsRefusal, "code">) => t(kdsRefusalMessageKey(r.code)), [t]);

  // ═══════ เครื่องนี้ · กะ (หัวจอ — มติ 2) ═══════
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [printer, setPrinter] = useState<PosPrinterConfig | null>(null);
  const [shift, setShift] = useState<{ no: number; device: string | null } | null>(null);
  useEffect(() => {
    const deviceId = getPosDeviceId();
    if (!deviceId) return;
    let live = true;
    void heartbeatAction({ ...target, deviceCode: deviceId })
      .then((r) => {
        if (!live || !r || r.ok !== true || !r.device) return;
        setDeviceName(r.device.name);
        setPrinter(r.device.printerConfig);
      })
      .catch(() => undefined);
    void registerStatusAction({ ...target, deviceId })
      .then((r) => {
        if (!live || !r || r.ok !== true || !r.shift) return;
        setShift({ no: r.shift.shiftNo, device: r.shift.deviceLabel });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [target]);

  // ═══════ บอร์ด + poll (มติ 5) ═══════
  const [station, setStation] = useState<string | null>(p.initialStationId);
  const [board, setBoard] = useState<KdsBoard | null>(null);
  const [loadErr, setLoadErr] = useState<KdsRefusal | null>(null);
  const stationRef = useRef(station);
  stationRef.current = station;
  const seq = useRef(0);
  const load = useCallback(async () => {
    const want = stationRef.current ?? KDS_EXPO;
    const my = ++seq.current;
    const r = await kdsBoardAction({ ...target, stationId: want }).catch(() => null);
    if (my !== seq.current) return;
    if (!r) return;
    if (r.ok !== true) {
      // สถานีใน URL ไม่มีแล้ว ⇒ กลับไปสถานีแรก (อ่าน expo เพื่อรู้รายชื่อ)
      if (r.code === "KDS_STATION_NOT_FOUND" && stationRef.current !== null) {
        setStation(null);
        return;
      }
      setLoadErr(r);
      return;
    }
    setLoadErr(null);
    setClock({ serverMs: Date.parse(r.serverNow) || Date.now(), localMs: Date.now() });
    // ยังไม่เลือกสถานี = สถานีแรก (ภาพ 04 · แท็บแรก active)
    if (stationRef.current === null && r.stations.length) {
      setStation(r.stations[0]!.id);
      return;
    }
    setBoard(r);
  }, [target]);
  useEffect(() => {
    void load();
  }, [load, station]);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => void load(), KDS_POLL_MS);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);
  // ?station= ตามแท็บ (ไม่ทำให้หน้าโหลดใหม่)
  useEffect(() => {
    if (!station) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("station") !== station) {
        u.searchParams.set("station", station);
        window.history.replaceState(window.history.state, "", u.toString());
      }
    } catch {
      /* ไม่สำคัญ */
    }
  }, [station]);

  const expo = station === KDS_EXPO;
  const stations = board?.stations ?? [];
  const stationsById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);

  // ═══════ ปุ่มของตั๋ว ═══════
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<ActionRes>, okToast?: string) => {
      setBusy(key);
      try {
        const r = await fn().catch(() => ({ ok: false, code: "INTERNAL", message: "" }) as KdsRefusal);
        if (r.ok !== true) {
          if (r.code !== "TICKET_NOT_FOUND") showToast({ text: refusalText(r), tone: "danger" });
        } else if (okToast && r.changed !== 0) showToast({ text: okToast });
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load, refusalText, showToast],
  );
  const onStart = (x: KdsTicket) => void run(ticketKey(x), () => kdsStartAction({ ...target, orderId: x.orderId, stationId: x.stationId }));
  const onLineDone = (x: KdsTicket, itemId: string) => void run(ticketKey(x), () => kdsLineDoneAction({ ...target, itemId }));
  const onDone = (x: KdsTicket) => void run(ticketKey(x), () => kdsTicketDoneAction({ ...target, orderId: x.orderId, stationId: x.stationId }));
  const onServed = (x: KdsTicket) => void run(ticketKey(x), () => kdsServedAction({ ...target, orderId: x.orderId, stationId: x.stationId }));
  const onRush = (x: KdsTicket, rush: boolean) =>
    void run(ticketKey(x), async () => {
      const r = await kdsRushAction({ ...target, orderId: x.orderId, rush });
      return r.ok === true ? { ok: true } : r;
    });
  /** expo: เสิร์ฟทุกสถานีของรอบ (ทีละสถานี · หยุดที่คำปฏิเสธแรก — มติ 7) */
  const onServeGroup = (orderId: string, list: KdsTicket[]) =>
    void run(`expo:${orderId}`, async () => {
      for (const x of list) {
        const r = await kdsServedAction({ ...target, orderId: x.orderId, stationId: x.stationId });
        if (r.ok !== true) return r;
      }
      return { ok: true };
    });
  const last = board?.servedToday.last ?? null;
  const onRecall = () => {
    if (!last?.orderId || !last.stationId) return;
    void run(`recall:${last.orderId}`, () => kdsRecallAction({ ...target, orderId: last.orderId as string, stationId: last.stationId as string }), t("recalled", { no: last.no }));
  };

  // ═══════ พิมพ์ใบครัว (มติ 6) ═══════
  const [selected, setSelected] = useState<string | null>(null);
  const printed = useRef(new Set<string>());
  const printTickets = async (list: KdsTicket[]) => {
    if (!list.length) {
      showToast({ text: t("printNone") });
      return;
    }
    setBusy("print");
    try {
      const slips: KitchenSlip[] = [];
      for (const x of list) {
        const k = ticketKey(x);
        const copy = printed.current.has(k) || x.state !== "NEW";
        const r = await kitchenSlipPayloadAction({ ...target, orderId: x.orderId, stationId: x.stationId, copy, locale: locale === "en" ? "en" : "th" }).catch(() => null);
        if (!r) continue;
        if (r.ok !== true) {
          if (r.code !== "TICKET_NOT_FOUND") showToast({ text: refusalText(r), tone: "danger" });
          continue;
        }
        slips.push(...r.slips);
      }
      if (!slips.length) return;
      const res = await printKitchenSlips(slips, printer, locale === "en" ? "en" : "th");
      if (res.ok) {
        for (const x of list) printed.current.add(ticketKey(x));
        showToast({ text: t("printed", { n: slips.length }) });
      } else showToast({ text: tpr(`errors.${res.code}`), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const onPrintHeader = () => {
    const sel = selected ? board?.tickets.find((x) => ticketKey(x) === selected) : undefined;
    void printTickets(sel ? [sel] : columnTickets(board, "NEW"));
    setSelected(null);
  };

  // ═══════ พักครัว (มติ 3 · ทางเดิมของร้านอาหาร) ═══════
  const [pausing, setPausing] = useState(false);
  const onPause = async (on: boolean) => {
    if (!p.unitSlug) return;
    setPausing(true);
    try {
      // POS P5.2 ▸ D11: kdsKitchenPauseAction (คืนคำปฏิเสธเป็นข้อมูล) แทน kitchenPauseAction ของหน้าร้านอาหาร ◂
      const r = await kdsKitchenPauseAction({ ...target, paused: on });
      if (r.ok) showToast({ text: on ? t("pausedOn") : t("pausedOff") });
      else showToast({ text: refusalText(r), tone: "danger" });
    } catch {
      showToast({ text: t("errors.permissionDenied"), tone: "danger" });
    } finally {
      setPausing(false);
      await load();
    }
  };

  // ═══════ 86 (มติ 8) ═══════
  const [sheet, setSheet] = useState(false);
  const [busy86, setBusy86] = useState<string | null>(null);
  const on86 = async (productId: string, name: string, available: boolean, note: string | null) => {
    setBusy86(productId);
    try {
      const r = await setAvailabilityAction({ ...target, productId, available, source: "KDS", ...(note ? { note } : {}) }).catch(() => ({ ok: false, code: "INTERNAL", message: "" }) as KdsRefusal);
      if (r.ok !== true) showToast({ text: refusalText(r), tone: "danger" });
      else showToast({ text: available ? t("eightySix.released", { name }) : t("eightySix.markedOut", { name }) });
    } finally {
      setBusy86(null);
      await load();
    }
  };

  // ═══════ มือถือ: คอลัมน์ที่เห็น ═══════
  const [seg, setSeg] = useState<KdsColumn>("NEW");

  const noPerm = (ok: boolean, key: string) => (ok ? undefined : t(key));
  const avg = board ? board.avgMinutes : null;
  const cardPerms = { advance: p.perms.advance, rush: p.perms.rush };

  const card = (x: KdsTicket) => (
    <KdsTicketCard
      key={ticketKey(x)}
      ticket={x}
      now={now}
      perms={cardPerms}
      busy={busy === ticketKey(x)}
      selected={selected === ticketKey(x)}
      onStart={() => onStart(x)}
      onLineDone={(id) => onLineDone(x, id)}
      onDone={() => onDone(x)}
      onServed={() => onServed(x)}
      onRush={(r) => onRush(x, r)}
      onPrint={() => void printTickets([x])}
      onChoose={(on) => setSelected(on ? ticketKey(x) : null)}
    />
  );

  const servedStrip = (
    <button
      type="button"
      data-testid="pos-kds-recall"
      className="flex w-full flex-col gap-0.5 rounded-[14px] border border-dashed border-[color:var(--color-line)] px-4 py-3 text-left text-[12.5px] text-[color:var(--color-muted)] enabled:hover:bg-[color:var(--color-surface)] disabled:cursor-not-allowed"
      disabled={!last?.orderId || !p.perms.recall || busy !== null}
      title={noPerm(p.perms.recall, "perm.recall")}
      onClick={onRecall}
    >
      <b className="text-[13px] text-[color:var(--color-ink)]">{t("servedToday", { count: board?.servedToday.count ?? 0 })}</b>
      {last && mounted ? (
        <span>{`${t("servedLast", { no: last.no, label: sourceText({ source: last.source, label: last.label }) || (last.source === "ONLINE" ? onlineLastLabel(last.label) : last.label) /* POS P2.14 ▸ U2 Q3 ◂ */, time: bkkClock(last.at) })} — ${t("tapRecall")}`}</span>
      ) : (
        <span>{t("servedNone")}</span>
      )}
    </button>
  );

  const column = (col: KdsColumn) => {
    const list = columnTickets(board, col);
    const cooking = col === "COOKING";
    return (
      <section
        key={col}
        data-testid={`pos-kds-col-${COL_KEY[col]}`}
        className={`min-h-0 flex-col ${seg === col ? "flex" : "hidden"} md:flex`}
        aria-label={t(`columns.${COL_KEY[col]}`)}
      >
        <header className="flex items-center gap-3 px-0.5 pb-2.5 text-[14px] font-bold">
          {t(`columns.${COL_KEY[col]}`)}
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[11.5px] tabular-nums">{list.length}</span>
          <span className="flex-1" />
          <small className="hidden text-[11.5px] font-normal text-[color:var(--color-muted)] lg:inline">{t(`hints.${COL_KEY[col]}`)}</small>
        </header>
        <div className={cooking ? "flex flex-col gap-[19px] xl:grid xl:grid-cols-2 xl:items-start" : "flex flex-col gap-[19px]"}>
          {list.map(card)}
          {col === "NEW" && board && board.tickets.length === 0 && (
            <p data-testid="pos-kds-empty-station" className="rounded-[14px] border border-dashed px-4 py-6 text-center text-[13px] text-[color:var(--color-muted)]">
              {t("emptyStation")}
            </p>
          )}
        </div>
        {col === "READY" && <div className="mt-[19px]">{servedStrip}</div>}
      </section>
    );
  };

  const groups = expoGroups(board);
  const expoView = (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid grid-cols-1 gap-[19px] md:grid-cols-2 xl:grid-cols-4" data-testid="pos-kds-expo">
        {groups.map((g) => (
          <div key={g.orderId} data-testid={`pos-kds-expo-${g.orderId}`} className="flex flex-col rounded-[14px] border-[1.5px] border-[color:var(--color-ink)] bg-[color:var(--color-surface)]">
            <div className="flex min-h-12 items-center gap-2.5 px-4 py-2.5 text-[14px] font-bold">
              {g.head.source === "ONLINE" ? (
                <>
                  <span className="tabular-nums">{`#${g.head.no}`}</span>
                  <KdsChannelChip ticket={g.head} />
                </>
              ) : (
                <span className="min-w-0 truncate tabular-nums">{`#${g.head.no} \u00B7 ${sourceText(g.head)}`}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {g.tickets.map((x) => (
                <span key={x.stationId} className="inline-flex h-6 items-center rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-ink-soft)]">
                  {stationName(stationsById.get(x.stationId), locale)}
                </span>
              ))}
            </div>
            {g.tickets.flatMap((x) =>
              x.lines
                .filter((l) => !l.cancelled)
                .map((l) => (
                  <div key={l.itemId} className="flex items-start gap-3 border-t border-[color:var(--color-line)] px-4 py-2.5">
                    <b className="w-6 shrink-0 text-[15px] tabular-nums">{l.qty}</b>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px]">{l.name}</span>
                      {l.note ? <small className="text-[12px] font-bold">{l.note}</small> : null}
                      {l.options.length ? <small className="text-[12px] text-[color:var(--color-muted)]">{l.options.join(" · ")}</small> : null}
                    </span>
                  </div>
                )),
            )}
            <div className="mt-auto flex items-center gap-3 rounded-b-[13px] border-t bg-[color:var(--color-surface-2)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[color:var(--color-muted)]">{g.head.staffName ? t("server", { name: shortName(g.head.staffName) }) : ""}</span>
              <button
                type="button"
                data-testid="pos-kds-served"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-[color:var(--color-ink)] px-4 text-[13px] font-bold text-[color:var(--color-surface)] disabled:opacity-50"
                disabled={busy !== null || !p.perms.advance}
                title={noPerm(p.perms.advance, "perm.advance")}
                onClick={() => onServeGroup(g.orderId, g.tickets)}
              >
                <RegisterIcon name="check" size={12} />
                {t("served")}
              </button>
            </div>
          </div>
        ))}
        {board && groups.length === 0 && (
          <p data-testid="pos-kds-empty-station" className="rounded-[14px] border border-dashed px-4 py-6 text-center text-[13px] text-[color:var(--color-muted)] md:col-span-2 xl:col-span-4">
            {t("expoEmpty")}
          </p>
        )}
      </div>
      <div className="max-w-md">{servedStrip}</div>
    </div>
  );

  const noStations = board !== null && stations.length === 0;
  const setupHref = p.unitSlug ? `/app/u/${p.unitSlug}/restaurant/setup` : null;

  return (
    <div data-testid="pos-kds" className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[color:var(--color-surface-2)]">
      <KdsTopBar
        systemId={p.systemId}
        tenantName={p.tenantName}
        units={p.units}
        activeUnitId={p.unitId}
        deviceName={deviceName}
        clock={now !== null ? bkkClock(new Date(now).toISOString()) : null}
        shift={shift}
        userName={p.userName}
      />
      {noStations ? (
        <div className="flex flex-1 items-start justify-center p-6">
          <div data-testid="pos-kds-empty-unit" className="card flex max-w-lg flex-col items-start gap-2 text-sm">
            <b className="text-[16px]">{t("noStations")}</b>
            <span className="text-[color:var(--color-muted)]">{t("noStationsHint")}</span>
            {setupHref && (
              <Link href={setupHref} className="mt-1 inline-flex h-11 items-center rounded-[10px] border px-4 text-[13px] font-bold hover:bg-[color:var(--color-surface-2)]" data-testid="pos-kds-setup-link">
                {t("setupStations")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* แถวหัว: แท็บสถานี · เฉลี่ย/เป้า · พักครัว · พิมพ์ */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b bg-[color:var(--color-surface)] px-4 lg:px-5">
            <div className="hidden min-w-0 items-end gap-1 overflow-x-auto md:flex" role="tablist" aria-label={t("stationsLabel")}>
              {stations.map((s) => {
                const on = station === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    data-testid={`pos-kds-tab-${s.id}`}
                    className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3.5 pb-3 pt-3.5 text-[14px] ${on ? "border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]" : "border-transparent text-[color:var(--color-ink-soft)]"}`}
                    onClick={() => setStation(s.id)}
                  >
                    {stationName(s, locale)}
                    <span
                      className={`inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-muted)]"}`}
                    >
                      {s.openCount}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                role="tab"
                aria-selected={expo}
                data-testid="pos-kds-tab-expo"
                className={`inline-flex min-h-12 shrink-0 items-center border-b-2 px-3.5 pb-3 pt-3.5 text-[14px] ${expo ? "border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]" : "border-transparent text-[color:var(--color-ink-soft)]"}`}
                onClick={() => setStation(KDS_EXPO)}
              >
                {t("expo")}
              </button>
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-2 py-2 md:hidden">
              <span className="sr-only">{t("stationsLabel")}</span>
              <select
                data-testid="pos-kds-station-select"
                className="input h-11 min-w-0 flex-1 rounded-[12px] text-[15px]"
                value={station ?? ""}
                onChange={(e) => setStation(e.target.value || null)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{`${stationName(s, locale)} (${s.openCount})`}</option>
                ))}
                <option value={KDS_EXPO}>{t("expo")}</option>
              </select>
            </label>
            <span className="hidden flex-1 md:block" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2">
              {avg !== null && (
                <span data-testid="pos-kds-avg" className="flex items-baseline gap-2 text-[12.5px] text-[color:var(--color-muted)]">
                  <span>{t("avgLabel")}</span>
                  <b className="text-[18px] tabular-nums text-[color:var(--color-ink)]">{t("avgMinutes", { avg })}</b>
                  <span>{t("avgTarget", { target: board?.targetMinutes ?? 0 })}</span>
                </span>
              )}
              <label className="flex h-11 items-center gap-3 border-l pl-3.5 text-[12.5px] text-[color:var(--color-ink-soft)]" title={noPerm(p.perms.pause && !!p.unitSlug, "perm.pause")}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!board?.paused}
                  data-testid="pos-kds-pause"
                  disabled={!p.perms.pause || !p.unitSlug || pausing || !board}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${board?.paused ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-line)]"}`}
                  onClick={() => void onPause(!board?.paused)}
                  aria-label={t("pause")}
                >
                  <span className={`absolute top-1 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${board?.paused ? "left-6" : "left-1"}`} />
                </button>
                <span className="whitespace-nowrap">{t("pause")}</span>
              </label>
              <button
                type="button"
                data-testid="pos-kds-print"
                className="inline-flex h-11 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-bold hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                disabled={busy === "print" || !board || expo}
                onClick={onPrintHeader}
              >
                <RegisterIcon name="print" size={14} />
                {t("printSlip")}
              </button>
            </div>
          </div>
          {board?.paused && (
            <div role="status" data-testid="pos-kds-paused-banner" className="mx-4 mt-3 rounded-[12px] border-[1.5px] border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-4 py-2.5 text-[13px] font-bold text-[color:var(--color-danger)] lg:mx-5">
              {t("pausedBanner")}
              {board.pausedNote ? <span className="font-normal text-[color:var(--color-ink-soft)]">{` · ${board.pausedNote}`}</span> : null}
            </div>
          )}
          {midnightWindow(now) && (
            <p data-testid="pos-kds-midnight" className="mx-4 mt-3 text-[12px] text-[color:var(--color-muted)] lg:mx-5">
              {t("midnightNote")}
            </p>
          )}
          {loadErr && !board && (
            <div role="alert" className="mx-4 mt-3 rounded-[12px] border px-4 py-3 text-[13px] text-[color:var(--color-danger)]" data-testid="pos-kds-load-error">
              {refusalText(loadErr)}
            </div>
          )}
          {/* มือถือ: แถบสลับคอลัมน์ */}
          {!expo && (
            <div className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-[12px] border bg-[color:var(--color-surface)] p-1 md:hidden" role="tablist">
              {COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={seg === c}
                  data-testid={`pos-kds-seg-${COL_KEY[c]}`}
                  className={`h-11 rounded-[9px] text-[13.5px] ${seg === c ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`}
                  onClick={() => setSeg(c)}
                >
                  {`${t(`columns.${COL_KEY[c]}`)} ${columnTickets(board, c).length}`}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 px-4 py-3.5 lg:px-5">
            {!board ? (
              <p className="py-10 text-center text-[13px] text-[color:var(--color-muted)]">{loadErr ? "" : t("loading")}</p>
            ) : expo ? (
              expoView
            ) : (
              <div data-testid="pos-kds-board" className="grid grid-cols-1 gap-[26px] md:grid-cols-3 xl:grid-cols-[1fr_2fr_1fr]">
                {COLS.map(column)}
              </div>
            )}
          </div>
          <KdsBottomBar board={board} mounted={mounted} onOpen={() => setSheet(true)} />
        </>
      )}
      {sheet && <KdsEightySixPanel systemId={p.systemId} unitId={p.unitId} board={board} canMark={p.perms.availability} busyId={busy86} onFlip={(id, n, a, note) => void on86(id, n, a, note)} onDismiss={() => setSheet(false)} />}
      {toast && (
        <div
          role="status"
          data-testid="pos-kds-toast"
          data-tone={toast.tone ?? "info"}
          className={`fixed bottom-6 left-1/2 z-[60] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-[12px] px-4 py-3 text-[13.5px] shadow-xl ${
            toast.tone === "danger" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
