"use client";

// ShiftsClient.tsx — POS P1.9 U หน้ากะและลิ้นชักเงิน (ภาพ 07) + กล่องเปิดกะ (ภาพ 13A ส่วน A) + นับย้อนหลัง (P1.9b R13)
//   ซ้าย: การ์ดกะปัจจุบัน (X: KPI · แยกตามวิธีชำระ · เงินสดที่ควรมี · เงินเข้า/ออก) → การ์ดปิดกะ (นับตามแบงก์) / รายงาน Z หลังปิด
//   ขวา: กะที่ปิดแล้ว (Z) · เงินสดนอกกะวันนี้ · เครื่องนี้ · (ส่งสรุปกะ LINE = P3 บรรทัดเดียว)
//   390: คอลัมน์เดียว เรียงการ์ด การ์ดปิดกะอยู่ท้ายสุด (display:contents + order)
// 🔴 โหลดหน้า = shiftsPageDataAction คำขอเดียว (Server Action เรียงคิวต่อ client) · หลังทำรายการสำเร็จโหลดใหม่ด้วยคำขอเดียวกัน
// 🔴 เงินเป็นสตางค์ Int ทุกที่ (ช่องกรอกเป็นบาท) · คำปฏิเสธแสดงผ่าน refusalMessageKey (ไม่แสดง message ไทยของเซิร์ฟเวอร์)
// 🔴 คีย์กันซ้ำ (ปิดกะ/เงินเข้าออก/นับย้อนหลัง) เก็บใน state หมุนเฉพาะหลังสำเร็จ (R2 F6)
// POS P1.10 U ▸ ปุ่ม "เปิดลิ้นชัก" ในการ์ดเครื่องนี้ — แสดงเฉพาะเมื่อค่าตั้งเครื่อง drawerKick + จับคู่เครื่องพิมพ์ USB/BT ในเบราว์เซอร์นี้แล้ว ·
//   ส่ง ESC p 0 25 250 ล้วน (kickDrawer) · ไม่ลง audit (คำสั่งฮาร์ดแวร์ · มติ CD4) · หน้านี้เปิดได้เฉพาะ pos.shift.operate/manage อยู่แล้ว ◂
// ไม่ทำในใบนี้: ส่งสรุปกะ LINE/PDF (P3) · พิมพ์ X/ใบเปิดกะ (P1.10) ·
//   รายชื่อพนักงานจาก HR / PIN (P1.15/P3.5) · สถานะพร้อมเพย์/Beam ต่อวิธีชำระ (P1.7) · ตั้งค่า blind (P1.18)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { thisDevicePrinter, type ThisDevicePrinter } from "@/components/pos/print/device-printer";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { kickDrawer, printerPaired } from "@/components/pos/print/printReceipt";
import type { PrintResult } from "@/components/pos/print/types";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
// POS P1.15U ▸ มติ 2: เปิดกะด้วยโทเคนผู้ขายของเครื่องนี้ (ผู้เปิดกะ = คนในโทเคน) — เฉพาะเมื่อเป็นเครื่องเดียวกับที่ออกโทเคน ◂
import { readStaffSession } from "@/lib/modules/pos/staff-session";
import type { RecountView, ShiftReport, ShiftsPageItem } from "@/lib/modules/pos/shift";
import {
  closeShiftAction,
  openShiftAction,
  recordCashMovementAction,
  recountShiftAction,
  shiftsPageDataAction,
  zReportAction,
} from "@/lib/modules/pos/shift-actions";
// POS P2.4U ▸ มติ 9 (Q10): บรรทัด "โต๊ะยังไม่ปิด N · ฿x" ในการ์ด X — แสดงอย่างเดียว ไม่บล็อกการปิดกะ ◂
import { OpenTablesInfo } from "@/components/pos/tables/OpenTablesInfo";
import { CARD, FigureBox, Kpi, NOTE_DENOMS, Pill, ShiftIcon, bahtToSatang, bkkDate, bkkDay, bkkHm, denomTotal, elapsed, money, signedMoney, type T } from "./shifts-ui";

type Unit = { id: string; name: string };
type Props = { systemId: string; units: Unit[]; unitId: string; canManage: boolean; meName: string };
type PageData = Awaited<ReturnType<typeof shiftsPageDataAction>>;
type PageOk = Extract<PageData, { ok: true }>;

const newKey = () => `shift-${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`;

/** R2 F7: ชื่อวิธีชำระภาษาคน (pos.shift.method.*) · ชนิดที่ยังไม่มีป้าย = แสดงรหัสเดิม */
// POS P2.1U ▸ มติ 5: PLATFORM = แถวไม่ใช่เงินสด "แพลตฟอร์ม · รอแพลตฟอร์มโอน" (pos.shift.method.PLATFORM · ลำดับจากเซิร์ฟเวอร์ต่อท้ายแถวไม่ใช่เงินสด) ◂
const METHOD_KEYS = new Set(["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE", "PLATFORM"]);
const METHOD_ICON: Record<string, RegisterIconName> = { CASH: "cash", CARD: "card", PROMPTPAY: "qr", TRANSFER: "bank", DEPOSIT: "wallet", ROOM_CHARGE: "doc", PLATFORM: "truck" };
const SOURCE_KEYS = new Set(["POS", "BOOKING", "HOTEL", "RESTAURANT", "TICKET"]);
const emptyDen = (): Record<string, string> => Object.fromEntries(NOTE_DENOMS.map((d) => [String(d), ""]));

/** รายงาน X/Z แบบการ์ด (Z แช่แข็งแสดงตามที่เก็บ · ยอดที่ซ่อน = "—") */
function Report({ r, t }: { r: ShiftReport; t: T }) {
  const row = (label: string, v: number | null | undefined) => (
    <div className="flex justify-between gap-3 border-b py-2 text-sm last:border-0">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="tabular-nums">{v === null || v === undefined ? "—" : money(v)}</span>
    </div>
  );
  return (
    <div className="flex flex-col rounded-xl border px-4 py-2">
      <div className="flex flex-wrap items-center gap-2 border-b py-2 text-sm font-semibold">
        <span>
          {r.zNumber ? t("zHash", { no: r.zNumber }) : t("xReport")} · {t("shiftHash", { no: r.shiftNo })}
          {r.deviceLabel ? ` · ${r.deviceLabel}` : ""}
        </span>
        {r.forced ? <Pill tone="danger">{t("forced")}</Pill> : null}
      </div>
      {row(t("float"), r.floatSatang)}
      <div className="flex justify-between gap-3 border-b py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">{t("bills")}</span>
        <span className="tabular-nums">
          {r.billCount} · {money(r.salesTotalSatang)}
        </span>
      </div>
      <div className="flex justify-between gap-3 border-b py-2 text-sm">
        <span className="text-[color:var(--color-muted)]">{t("voids")}</span>
        <span className="tabular-nums">
          {r.voidCount} · {money(r.voidTotalSatang)}
        </span>
      </div>
      {r.byMethod.map((m) => (
        <div key={m.type} className="flex justify-between gap-3 border-b py-2 text-sm">
          <span className="text-[color:var(--color-muted)]">
            {METHOD_KEYS.has(m.type) ? t(`method.${m.type}`) : m.type} ({m.count})
          </span>
          <span className="tabular-nums">{money(m.amountSatang)}</span>
        </div>
      ))}
      {row(t("tendered"), r.cashTenderedSatang)}
      {row(t("change"), r.changeSatang)}
      {row(t("tip"), r.tipSatang)}
      {row(t("cashIn"), r.cashInSatang)}
      {row(t("cashOut"), r.cashOutSatang)}
      {row(t("expected"), r.expectedCashSatang)}
      {r.zNumber ? row(t("counted"), r.countedCashSatang) : null}
      {r.zNumber ? row(t("overShort"), r.overShortSatang) : null}
    </div>
  );
}

/** P1.9b (R12/R13): ผลนับย้อนหลังแสดงข้าง Z (ไม่ผสานเข้า Z ที่แช่แข็ง) · ผู้นับเป็นชื่อจากตัวอ่านหน้า (ไม่แสดงรหัส) */
function RecountBlock({ recount, byName, t, locale }: { recount: RecountView; byName: string | null; t: T; locale: string }) {
  const line = (label: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b py-2 text-sm last:border-0">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );
  return (
    <div className="flex flex-col rounded-xl border px-4 py-2" data-testid="pos-shift-recount">
      <div className="border-b py-2 text-sm font-semibold">{t("recount.title")}</div>
      {line(t("recount.counted"), money(recount.countedCashSatang))}
      {line(t("recount.variance"), signedMoney(recount.varianceSatang))}
      {line(t("recount.note"), recount.note)}
      {line(t("recount.by"), <span>{byName ?? "—"}</span>)}
      {line(t("recount.at"), `${bkkDay(recount.recountedAt, locale)} ${bkkHm(recount.recountedAt, locale)}`)}
    </div>
  );
}

/** กล่องโต้ตอบกลางจอ (390 = แผ่นล่าง) */
function Dialog({ labelledBy, testid, wide, children }: { labelledBy: string; testid: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testid}
        className={`flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] shadow-lg sm:rounded-2xl ${wide ? "max-w-[760px]" : "max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ShiftsClient({ systemId, units, unitId, canManage, meName }: Props) {
  const t = useTranslations("pos.shift") as T;
  const te = useTranslations("pos.register");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<PageData | null>(null);
  const [online, setOnline] = useState(true);
  const [viewZ, setViewZ] = useState<ShiftReport | null>(null);
  const [viewRecount, setViewRecount] = useState<RecountView | null>(null);
  const [showX, setShowX] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showOffBills, setShowOffBills] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // เปิดกะ (13A)
  const [openDlg, setOpenDlg] = useState(false);
  const [label, setLabel] = useState("");
  const [floatB, setFloatB] = useState("0");
  const [floatDen, setFloatDen] = useState<Record<string, string>>(emptyDen);
  const [floatCoins, setFloatCoins] = useState("");
  // เงินเข้า/ออก
  const [moveDlg, setMoveDlg] = useState(false);
  const [moveKind, setMoveKind] = useState<"IN" | "OUT">("IN");
  const [moveB, setMoveB] = useState("");
  const [moveReason, setMoveReason] = useState("");
  // R2 F6: คีย์กันซ้ำเงินเข้า/ออก คงไว้จนสำเร็จ (แบบ closeKey) — กดซ้ำหลังเน็ตหลุด = รายการเดิม ไม่บันทึกสองครั้ง
  const [moveKey, setMoveKey] = useState(newKey);
  // R2 F4: คีย์ผูกกับกะ — เปิดกล่องของกะอื่น = คีย์ใหม่ (กะเดิม = คีย์เดิมจนสำเร็จ)
  const [moveKeyShift, setMoveKeyShift] = useState<string | null>(null);
  // ปิดกะ (07)
  const [countDen, setCountDen] = useState<Record<string, string>>(emptyDen);
  const [countCoins, setCountCoins] = useState("");
  const [note, setNote] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [closeKey, setCloseKey] = useState(newKey);
  // P1.9b: กล่องนับย้อนหลัง — คำปฏิเสธอยู่ในกล่อง (load() ไม่ล้าง) · คีย์คงไว้จนสำเร็จ (F6)
  const [recountFor, setRecountFor] = useState<ShiftsPageItem | null>(null);
  const [recountB, setRecountB] = useState("");
  const [recountNote, setRecountNote] = useState("");
  const [recountErr, setRecountErr] = useState<string | null>(null);
  // R2: คีย์กันซ้ำผูกกับกะ — เปิดกล่องของกะอื่น = คีย์ใหม่ (กะเดิมเปิดซ้ำ = คีย์เดิม จนสำเร็จ)
  const [recountKey, setRecountKey] = useState(newKey);
  const [recountKeyShift, setRecountKeyShift] = useState<string | null>(null);

  const base = { systemId, unitId, ...(deviceId ? { deviceId } : {}) };
  const fail = useCallback((r: { code: string }) => setError(te(refusalMessageKey(r.code))), [te]);

  const load = useCallback(
    async (dev: string | undefined) => {
      const r = await shiftsPageDataAction({ systemId, unitId, ...(dev ? { deviceId: dev } : {}) });
      setData(r);
    },
    [systemId, unitId],
  );

  useEffect(() => {
    const dev = getPosDeviceId();
    setDeviceId(dev);
    void load(dev).catch(() => setLoadFailed(true));
  }, [load]);

  // POS P1.10 U ▸ ลิ้นชัก: ค่าตั้งเครื่องนี้ (heartbeat) + จับคู่ในเบราว์เซอร์นี้ ◂
  const tpr = useTranslations("pos.print") as T;
  const [drawerDev, setDrawerDev] = useState<ThisDevicePrinter | null>(null);
  const [drawerRes, setDrawerRes] = useState<PrintResult | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);
  useEffect(() => {
    void thisDevicePrinter(systemId, unitId)
      .then(setDrawerDev)
      .catch(() => setDrawerDev(null));
  }, [systemId, unitId]);
  const canKick = !!drawerDev && drawerDev.config.drawerKick && printerPaired(drawerDev.config.mode, drawerDev.deviceCode);
  const openDrawer = async () => {
    if (!drawerDev || drawerBusy) return;
    setDrawerBusy(true);
    try {
      // อ่านค่าตั้งเครื่องใหม่ก่อนส่ง (ผู้จัดการปิด drawerKick/เปลี่ยนวิธีพิมพ์ระหว่างหน้าเปิดอยู่ได้)
      const dev = await thisDevicePrinter(systemId, unitId);
      setDrawerDev(dev);
      if (!dev.config.drawerKick || !printerPaired(dev.config.mode, dev.deviceCode)) return;
      setDrawerRes(await kickDrawer(dev.config, dev.deviceCode));
    } finally {
      setDrawerBusy(false);
    }
  };

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const ok: PageOk | null = data && data.ok ? data : null;
  const shift = ok && ok.current.ok ? ok.current.shift : null;
  const x = ok && ok.x && ok.x.ok ? ok.x : null;
  const items = useMemo(() => (ok && ok.history.ok ? ok.history.items : []), [ok]);
  const closedItems = items.filter((h) => h.status !== "OPEN" && h.zNumber !== null);
  const others = items.filter((h) => h.status === "OPEN" && h.deviceId !== (ok?.deviceId ?? deviceId));
  const lastOfDevice = items.find((h) => h.status !== "OPEN" && h.deviceId === (ok?.deviceId ?? deviceId)) ?? null;
  const settings = ok?.settings ?? { blindClose: false, overShortReasonSatang: 10_000 };
  const at = ok?.at ?? new Date().toISOString();

  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let done = false;
    try {
      done = await fn();
      if (done) await load(deviceId);
    } catch {
      // R2 F5: บันทึกสำเร็จแล้วแต่โหลดหน้าใหม่ล้ม ≠ บันทึกไม่สำเร็จ
      setError(done ? t("savedReloadFailed") : te("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  // ── เปิดกะ ──
  const floatCalc = denomTotal(floatDen, floatCoins);
  const floatByDen = !!floatCalc && floatCalc.used;
  const floatTotal = floatByDen ? floatCalc.total : bahtToSatang(floatB);
  const startOpen = () => {
    setError(null);
    setLabel(lastOfDevice?.deviceLabel ?? "");
    setFloatB(lastOfDevice ? String(lastOfDevice.floatSatang / 100) : "0");
    setFloatDen(emptyDen());
    setFloatCoins("");
    setOpenDlg(true);
  };
  const doOpen = () =>
    run(async () => {
      const f = floatTotal;
      if (f === null || floatCalc === null || !deviceId) {
        setError(t("invalidAmount"));
        return false;
      }
      const detail = floatByDen ? floatCalc.detail : null;
      const staffToken = readStaffSession(deviceId)?.staffToken;
      const r = await openShiftAction({ ...base, shift: { deviceId, floatSatang: f, ...(label.trim() ? { deviceLabel: label.trim() } : {}), ...(detail ? { floatDetail: detail } : {}), ...(staffToken ? { staffToken } : {}) } });
      // R2 F2: ถูกปฏิเสธ = คืน false (ไม่ load ซ้ำ ข้อความผิดพลาดค้างในกล่อง) · true เฉพาะสำเร็จ / มีกะเปิดอยู่แล้ว (รับกะนั้นต่อ)
      if (!r.ok && r.code !== "SHIFT_ALREADY_OPEN") {
        fail(r);
        return false;
      }
      setOpenDlg(false);
      setViewZ(null);
      setViewRecount(null);
      return true;
    });

  // ── เงินเข้า/ออก ──
  const doMove = () =>
    run(async () => {
      const a = bahtToSatang(moveB);
      if (!shift || a === null || a <= 0 || !moveReason.trim()) {
        setError(t("moveInvalid"));
        return false;
      }
      const r = await recordCashMovementAction({ ...base, movement: { shiftId: shift.id, kind: moveKind, amountSatang: a, reason: moveReason.trim(), idempotencyKey: moveKey } });
      if (!r.ok) {
        // R2 F4: คีย์นี้มีรายการอื่นอยู่แล้ว (payload ต่าง) = หมุนคีย์ ให้กดบันทึกใหม่ได้
        if (r.code === "IDEMPOTENCY_CONFLICT") setMoveKey(newKey());
        fail(r);
        return false;
      }
      setMoveB("");
      setMoveReason("");
      setMoveKey(newKey());
      setMoveDlg(false);
      return true;
    });

  // ── ปิดกะ ──
  const countCalc = denomTotal(countDen, countCoins);
  const expected = x ? x.report.expectedCashSatang : null;
  const diff = countCalc && expected !== null ? countCalc.total - expected : null;
  const doClose = () =>
    run(async () => {
      if (!shift || countCalc === null) {
        setError(t("countInvalid"));
        return false;
      }
      setReasonErr(null);
      const r = await closeShiftAction({
        ...base,
        close: { shiftId: shift.id, countedCashSatang: countCalc.total, ...(countCalc.detail ? { countDetail: countCalc.detail } : {}), ...(note.trim() ? { note: note.trim() } : {}), idempotencyKey: closeKey },
      });
      if (!r.ok) {
        if (r.code === "REASON_REQUIRED") setReasonErr(te(refusalMessageKey(r.code)));
        else fail(r);
        return false;
      }
      setViewZ(r.report);
      setViewRecount(null);
      setShowX(false);
      setCountDen(emptyDen());
      setCountCoins("");
      setNote("");
      setCloseKey(newKey());
      return true;
    });
  const showZ = (id: string) =>
    run(async () => {
      const r = await zReportAction({ ...base, shiftId: id });
      if (r.ok) {
        setViewZ(r.report);
        setViewRecount(r.recount ?? null);
        setOpenDlg(false);
        requestAnimationFrame(() => document.querySelector('[data-testid="pos-shift-z"]')?.scrollIntoView({ block: "start", behavior: "smooth" }));
      } else fail(r);
      return false;
    });

  // ── นับย้อนหลัง (P1.9b) ──
  const openRecount = (h: ShiftsPageItem) => {
    setRecountFor(h);
    setRecountB("");
    setRecountNote("");
    setRecountErr(null);
    setNotice(null);
    if (recountKeyShift !== h.id) {
      setRecountKey(newKey());
      setRecountKeyShift(h.id);
    }
  };
  /** P1.9b: ถูกปฏิเสธ = ข้อความค้างในกล่อง ไม่ load ซ้ำ · สำเร็จ = ปิดกล่อง เปิด Z ของกะนั้นพร้อมผลนับ แล้วโหลดหน้าใหม่ */
  const doRecount = async () => {
    if (busy || !recountFor) return;
    const c = bahtToSatang(recountB);
    if (c === null || !recountNote.trim()) {
      setRecountErr(t("recount.invalid"));
      return;
    }
    const shiftId = recountFor.id;
    setBusy(true);
    setRecountErr(null);
    setNotice(null);
    let saved: Extract<Awaited<ReturnType<typeof recountShiftAction>>, { ok: true }> | null = null;
    try {
      const r = await recountShiftAction({ ...base, recount: { shiftId, countedCashSatang: c, note: recountNote.trim(), idempotencyKey: recountKey } });
      if (!r.ok) {
        setRecountErr(te(refusalMessageKey(r.code)));
        // R2: คำปฏิเสธถาวร = ข้อความค้างในกล่อง + โหลดหน้าใหม่ (load ไม่ล้าง recountErr)
        if (r.code === "ALREADY_RECOUNTED" || r.code === "IDEMPOTENCY_CONFLICT" || r.code === "SHIFT_NOT_FORCED") {
          try {
            await load(deviceId);
          } catch {
            /* ข้อความปฏิเสธยังอยู่ในกล่อง */
          }
        }
        return;
      }
      saved = r;
    } catch {
      setRecountErr(te("errors.unknown"));
    } finally {
      if (!saved) setBusy(false);
    }
    if (!saved) return;
    // R2: สำเร็จ = ปิดกล่องก่อน · ขั้นหลังสำเร็จ (Z, load) พังได้โดยไม่ขึ้น errors.unknown ในกล่อง
    setRecountKey(newKey());
    setRecountKeyShift(null);
    setRecountFor(null);
    setNotice(t("recount.saved"));
    try {
      const z = await zReportAction({ ...base, shiftId });
      if (z.ok) {
        setViewZ(z.report);
        setViewRecount(z.recount ?? saved.recount);
      }
      await load(deviceId);
    } catch {
      /* บันทึกแล้ว — ขั้นถัดไปพังไม่กระทบผล */
    } finally {
      setBusy(false);
    }
  };

  const nameOfRecount = (rc: RecountView) => items.find((h) => h.id === rc.shiftId)?.recountByName ?? null;
  const sourceLabel = (s: string) => (SOURCE_KEYS.has(s) ? t(`source.${s}`) : t("source.OTHER"));
  const errorBox = error ? (
    <div role="alert" data-testid="pos-shift-error" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
      {error}
    </div>
  ) : null;
  const anyDialog = openDlg || moveDlg || !!recountFor;

  // ═══════════ หัวหน้า ═══════════
  const header = (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[26px] font-bold leading-tight">{t("pageTitle")}</h2>
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("pageSubtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {units.length > 1 && (
          <label className="flex h-12 items-center gap-1.5 rounded-[12px] border px-3.5 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("unit")}:</span>
            <select
              data-testid="pos-shift-unit"
              className="bg-transparent font-semibold outline-none"
              value={unitId}
              onChange={(e) => router.push(`/app/sys/${systemId}/pos/shifts?unit=${encodeURIComponent(e.target.value)}`)}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {shift && (
          <button
            data-testid="pos-shift-move-open"
            type="button"
            className="btn btn-ghost h-12 rounded-[12px]"
            disabled={busy}
            onClick={() => {
              setError(null);
              if (moveKeyShift !== shift.id) {
                setMoveKey(newKey());
                setMoveKeyShift(shift.id);
              }
              setMoveDlg(true);
            }}
          >
            <ShiftIcon name="swap" />
            {t("move.open")}
          </button>
        )}
      </div>
    </div>
  );

  if (data && !data.ok) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5" data-testid="pos-shifts">
        {header}
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-shift-refusal" data-code={data.code}>
          <b className="text-[15px]">{t("pageTitle")}</b>
          <span className="text-[color:var(--color-muted)]">{te(refusalMessageKey(data.code))}</span>
        </div>
      </div>
    );
  }

  // ═══════════ การ์ดกะปัจจุบัน / ยังไม่เปิดกะ ═══════════
  const r = x?.report ?? null;
  const blindHidden = !!r && r.expectedCashSatang === null;
  const el = shift ? elapsed(shift.openedAt, at) : { h: 0, m: 0 };
  const currentCard = !ok ? (
    <section className={CARD}>
      <p className="text-sm text-[color:var(--color-muted)]">{t("loading")}</p>
    </section>
  ) : !shift ? (
    <section className={`${CARD} flex flex-col gap-4`} data-testid="pos-shift-open">
      <div className="flex items-center gap-2.5">
        <ShiftIcon name="clock" size={18} />
        <h3 className="text-[17px] font-bold">{t("noShift")}</h3>
      </div>
      <p className="text-sm text-[color:var(--color-muted)]">{t("noShiftHint")}</p>
      {!ok.current.ok ? <p className="text-sm text-[color:var(--color-danger)]">{te(refusalMessageKey(ok.current.code))}</p> : null}
      <div>
        <button data-testid="pos-shift-open-start" type="button" className="btn btn-primary h-12 rounded-[12px] px-6" disabled={busy || !deviceId} onClick={startOpen}>
          <ShiftIcon name="clock" />
          {t("open")}
        </button>
      </div>
    </section>
  ) : (
    <section className={`${CARD} flex flex-col gap-5`} data-testid="pos-shift-current">
      <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <ShiftIcon name="clock" size={18} />
          <h3 className="text-[17px] font-bold">
            {t("shiftHash", { no: shift.shiftNo })}
            {shift.deviceLabel ? ` · ${shift.deviceLabel}` : ""}
          </h3>
          <Pill tone="accent" testid="pos-shift-current-pill">
            {t("pillOpen")}
          </Pill>
        </div>
        <p className="text-[12px] text-[color:var(--color-muted)]">
          {t("openedBy")}{" "}
          <b className="text-[color:var(--color-ink)]">
            {shift.openedByName}
          </b>{" "}
          · {bkkHm(shift.openedAt, locale)} · {t("floatShort")} <b className="text-[color:var(--color-ink)] tabular-nums">{money(shift.floatSatang)}</b> · {t("elapsed", el)}
        </p>
      </div>

      {/* POS P2.4U ▸ มติ 9 (Q10) ◂ */}
      <OpenTablesInfo systemId={systemId} units={units.filter((u) => u.id === unitId)} />
      <div className="flex flex-col gap-1 @md:flex-row @md:items-center @md:justify-between">
        <h4 className="text-[13px] font-bold">{t("xHeading")}</h4>
        <button data-testid="pos-shift-refresh" type="button" className="min-h-11 text-left text-[12px] text-[color:var(--color-muted)] @md:text-right" disabled={busy} onClick={() => run(async () => true)}>
          {t("dataAt", { time: bkkHm(at, locale) })}
        </button>
      </div>

      {ok.x && !ok.x.ok ? (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="pos-shift-x-refusal">
          {te(refusalMessageKey(ok.x.code))}
        </p>
      ) : r ? (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @md:grid-cols-3 @2xl:grid-cols-5" data-testid="pos-shift-kpis">
            <Kpi testid="pos-shift-kpi-sales" label={t("kpi.sales")} value={money(r.salesTotalSatang)} />
            <Kpi testid="pos-shift-kpi-bills" label={t("kpi.bills")} value={String(r.billCount)} />
            <Kpi testid="pos-shift-kpi-avg" label={t("kpi.avg")} value={r.billCount > 0 ? money(Math.round(r.salesTotalSatang / r.billCount)) : "—"} />
            <Kpi testid="pos-shift-kpi-voids" label={t("kpi.voids")} value={String(r.voidCount)} sub={money(r.voidTotalSatang)} />
            <Kpi testid="pos-shift-kpi-refunds" label={t("kpi.refunds")} value={r.cashRefundsSatang === 0 ? "0" : "—"} sub={money(r.cashRefundsSatang)} />
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-bold">{t("byMethodTitle")}</h4>
            <div className="overflow-hidden rounded-xl border" data-testid="pos-shift-methods">
              <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,96px)] items-center gap-3 border-b bg-[color:var(--color-surface-2)] px-4 py-3 text-[12px] font-semibold text-[color:var(--color-muted)] @lg:grid-cols-[minmax(0,1.3fr)_56px_minmax(0,100px)_minmax(0,1.6fr)]">
                <span>{t("col.method")}</span>
                <span className="text-right">{t("col.bills")}</span>
                <span className="text-right">{t("col.amount")}</span>
                <span className="hidden @lg:block">{t("col.status")}</span>
              </div>
              {r.byMethod.length === 0 ? <div className="px-4 py-4 text-sm text-[color:var(--color-muted)]">{t("noSales")}</div> : null}
              {r.byMethod.map((m) => (
                <div
                  key={m.type}
                  data-testid={`pos-shift-method-${m.type}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_56px_minmax(0,96px)] items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0 @lg:grid-cols-[minmax(0,1.3fr)_56px_minmax(0,100px)_minmax(0,1.6fr)]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <RegisterIcon name={METHOD_ICON[m.type] ?? "wallet"} size={14} className="text-[color:var(--color-muted)]" />
                      <span className="truncate">{METHOD_KEYS.has(m.type) ? t(`method.${m.type}`) : m.type}</span>
                    </span>
                    <span className="text-[11px] text-[color:var(--color-muted)] @lg:hidden">{m.type === "CASH" ? t("cashStatus") : ""}</span>
                  </span>
                  <span className="text-right tabular-nums">{m.count}</span>
                  <span className="text-right font-semibold tabular-nums">{money(m.amountSatang)}</span>
                  <span className="hidden text-[13px] text-[color:var(--color-ink-soft)] @lg:block">{m.type === "CASH" ? t("cashStatus") : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-bold">{t("drawerTitle")}</h4>
            <div className="flex flex-col gap-3 rounded-xl border bg-[color:var(--color-surface-2)] px-4 py-3 @2xl:flex-row @2xl:items-center @2xl:justify-between" data-testid="pos-shift-drawer">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                {(
                  [
                    ["", t("drawer.float"), r.floatSatang],
                    ["+", t("drawer.tendered"), r.cashTenderedSatang],
                    ["−", t("drawer.change"), r.changeSatang],
                    ["−", t("drawer.refunds"), r.cashRefundsSatang],
                    ...(r.cashInSatang !== 0 ? [["+", t("drawer.in"), r.cashInSatang] as const] : []),
                    ...(r.cashOutSatang !== 0 ? [["−", t("drawer.out"), r.cashOutSatang] as const] : []),
                  ] as const
                ).map(([op, lbl, v], i) => (
                  <span key={i} className="flex items-end gap-3">
                    {op ? <span className="pb-0.5 text-[color:var(--color-muted)]">{op}</span> : null}
                    <span className="flex flex-col">
                      <span className="text-[11px] text-[color:var(--color-muted)]">{lbl}</span>
                      <span className="text-[13px] font-semibold tabular-nums">{money(v)}</span>
                    </span>
                  </span>
                ))}
                <span className="flex items-end gap-3">
                  <span className="pb-0.5 text-[color:var(--color-muted)]">=</span>
                  <span className="flex flex-col">
                    <span className="text-[11px] text-[color:var(--color-muted)]">{t("drawer.expected")}</span>
                    <span className="text-[17px] font-bold tabular-nums" data-testid="pos-shift-drawer-expected">
                      {r.expectedCashSatang === null ? "—" : money(r.expectedCashSatang)}
                    </span>
                  </span>
                </span>
              </div>
              <span className="text-[12px] text-[color:var(--color-muted)]">{blindHidden ? t("blindHint") : x && x.movements.length ? t("movesTitle") : t("noMoves")}</span>
            </div>
            {x && x.movements.length > 0 && (
              <ul className="flex flex-col rounded-xl border px-4" data-testid="pos-shift-moves">
                {x.movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b py-2.5 text-[13px] last:border-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Pill tone={m.kind === "IN" ? "ink" : "muted"}>{m.kind === "IN" ? t("cashIn") : t("cashOut")}</Pill>
                      <span className="truncate">{m.reason}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[12px] text-[color:var(--color-muted)]">
                      <b className="text-[13px] text-[color:var(--color-ink)] tabular-nums">{money(m.amountSatang)}</b>
                      <span>{m.byName}</span> · {bkkHm(m.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );

  // ═══════════ การ์ดปิดกะ (07) ═══════════
  const denRow = (d: number) => {
    const raw = countDen[String(d)] ?? "";
    const n = Number(raw.replace(/[,\s]/g, "")) || 0;
    return (
      <div key={d} className="grid min-h-14 grid-cols-[64px_16px_64px_16px_minmax(0,1fr)] items-center gap-2 border-b py-1.5 text-sm">
        <b className="tabular-nums">{money(d)}</b>
        <span className="text-center text-[color:var(--color-muted)]">×</span>
        <input
          data-testid={`pos-shift-close-denom-${d}`}
          aria-label={money(d)}
          className="input h-11 px-1 text-center font-semibold tabular-nums"
          inputMode="numeric"
          value={raw}
          placeholder="0"
          onChange={(e) => setCountDen((p) => ({ ...p, [String(d)]: e.target.value }))}
        />
        <span className="text-center text-[color:var(--color-muted)]">=</span>
        <span className="text-right font-semibold tabular-nums">{money(d * n)}</span>
      </div>
    );
  };
  const coinsSatang = bahtToSatang(countCoins, true);
  const closeCard = shift ? (
    <section className={`${CARD} flex flex-col gap-5`} data-testid="pos-shift-close">
      <div className="flex flex-col gap-1 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="flex items-center gap-2.5">
          <ShiftIcon name="lock" size={18} />
          <h3 className="text-[17px] font-bold">{t("closeCard.title")}</h3>
        </div>
        <p className="text-[12px] text-[color:var(--color-muted)]">{t("closeCard.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-x-8 @lg:grid-cols-2">
        <div className="flex flex-col">{NOTE_DENOMS.slice(0, 3).map(denRow)}</div>
        <div className="flex flex-col">
          {NOTE_DENOMS.slice(3).map(denRow)}
          <div className="grid min-h-14 grid-cols-[64px_minmax(0,96px)_minmax(0,1fr)] items-center gap-2 py-1.5 text-sm">
            <b>{t("closeCard.coins")}</b>
            <input
              data-testid="pos-shift-close-coins"
              aria-label={t("closeCard.coins")}
              className="input h-11 px-2 text-center font-semibold tabular-nums"
              inputMode="decimal"
              value={countCoins}
              placeholder={money(0)}
              onChange={(e) => setCountCoins(e.target.value)}
            />
            <span className="flex items-center justify-end gap-2 text-right">
              <span className="text-[11px] text-[color:var(--color-muted)]">{t("closeCard.coinsTotal")}</span>
              <b className="tabular-nums">{coinsSatang === null ? "—" : money(coinsSatang)}</b>
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <FigureBox testid="pos-shift-close-expected" label={t("closeCard.expected")} value={expected === null ? "—" : money(expected)} />
        <FigureBox testid="pos-shift-close-counted" label={t("closeCard.counted")} value={countCalc ? money(countCalc.total) : "—"} />
        <FigureBox testid="pos-shift-close-diff" label={t("closeCard.diff")} value={diff === null ? "—" : signedMoney(diff)} danger={diff !== null && diff !== 0} />
      </div>
      {blindHidden ? <p className="-mt-2 text-[12px] text-[color:var(--color-muted)]">{t("blindHint")}</p> : null}
      <div className="grid grid-cols-1 items-start gap-2 @md:grid-cols-[140px_minmax(0,1fr)] @md:gap-4">
        <label htmlFor="pos-shift-close-note" className="flex flex-col pt-1">
          <b className="text-[13px]">{t("reason")}</b>
          <span className="text-[11px] text-[color:var(--color-muted)]">{t("closeCard.reasonHint", { amount: money(settings.overShortReasonSatang) })}</span>
        </label>
        <div className="flex flex-col gap-1">
          <input
            id="pos-shift-close-note"
            data-testid="pos-shift-close-note"
            className={`input h-12 rounded-xl px-4 font-semibold ${reasonErr ? "border-[color:var(--color-danger)]" : ""}`}
            maxLength={200}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setReasonErr(null);
            }}
          />
          {reasonErr ? (
            <span role="alert" className="text-[12px] text-[color:var(--color-danger)]" data-testid="pos-shift-close-reason-error">
              {reasonErr}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="flex flex-wrap gap-3">
          <button data-testid="pos-shift-close-submit" type="button" className="btn btn-primary h-12 rounded-[12px] px-6" disabled={busy || !countCalc} onClick={doClose}>
            <ShiftIcon name="lock" />
            {t("closeCard.submit")}
          </button>
          <button data-testid="pos-shift-close-x" type="button" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={!r} aria-expanded={showX} onClick={() => setShowX((v) => !v)}>
            <RegisterIcon name="doc" size={14} />
            {showX ? t("closeCard.hideX") : t("closeCard.viewX")}
          </button>
        </div>
        <span className="flex items-center gap-2.5 text-[12px] text-[color:var(--color-muted)]">
          <span
            role="switch"
            aria-checked={settings.blindClose}
            aria-readonly="true"
            aria-label={t("closeCard.blindToggle")}
            data-testid="pos-shift-close-blind"
            className={`relative inline-block h-6 w-10 shrink-0 rounded-full ${settings.blindClose ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--color-surface)] shadow ${settings.blindClose ? "left-[18px]" : "left-0.5"}`} />
          </span>
          {t("closeCard.blindToggle")}
        </span>
      </div>
      {showX && r ? (
        <div data-testid="pos-shift-x">
          <Report r={r} t={t} />
        </div>
      ) : null}
    </section>
  ) : null;

  // ═══════════ รายงาน Z (หลังปิด / เปิดจากรายการ) ═══════════
  const zPanel = viewZ ? (
    <section className={`${CARD} flex flex-col gap-4`} data-testid="pos-shift-z">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <ShiftIcon name="zdoc" size={18} />
          <h3 className="text-[17px] font-bold">{t("zReport")}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {!shift && ok ? (
            <button data-testid="pos-shift-z-new" type="button" className="btn btn-primary h-11 rounded-[12px] px-5" disabled={busy || !deviceId} onClick={startOpen}>
              {t("z.new")}
            </button>
          ) : null}
          <button
            data-testid="pos-shift-z-dismiss"
            type="button"
            className="btn btn-ghost h-11 rounded-[12px] px-4"
            onClick={() => {
              setViewZ(null);
              setViewRecount(null);
            }}
          >
            {t("z.dismiss")}
          </button>
        </div>
      </div>
      <Report r={viewZ} t={t} />
      {viewRecount && <RecountBlock recount={viewRecount} byName={nameOfRecount(viewRecount)} t={t} locale={locale} />}
    </section>
  ) : null;

  // ═══════════ ขวา: กะที่ปิดแล้ว (Z) ═══════════
  const closedRow = (h: ShiftsPageItem, full: boolean) => {
    const os = h.overShortSatang;
    const body = (
      <>
        <b className="w-12 shrink-0 pt-0.5 text-[13px] tabular-nums">{t("zHash", { no: h.zNumber ?? 0 })}</b>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px]">
            {bkkDay(h.closedAt ?? h.openedAt, locale)} · <span>{h.closedByName ?? h.openedByName}</span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-[color:var(--color-muted)]">
            <span className="truncate">
              {h.deviceLabel ?? t("openDlg.unnamed")}
              {h.billCount !== null ? ` · ${t("closed.billsN", { n: h.billCount })}` : ""}
            </span>
            {h.hasNote ? <Pill tone="muted">{t("closed.chipNote")}</Pill> : null}
            {h.status === "FORCE_CLOSED" ? <Pill tone="danger">{t("closed.chipForced")}</Pill> : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <b className="text-[13px] tabular-nums">{h.salesTotalSatang !== null ? money(h.salesTotalSatang) : "—"}</b>
          {os !== null ? (
            <span className={`text-[12px] tabular-nums ${os < 0 ? "font-semibold text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>{t("closed.diff", { amount: signedMoney(os) })}</span>
          ) : h.recount ? (
            <span className={`text-[12px] tabular-nums ${h.recount.varianceSatang < 0 ? "font-semibold text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
              {t("closed.recountBrief", { amount: signedMoney(h.recount.varianceSatang) })}
            </span>
          ) : (
            <span className="text-[12px] text-[color:var(--color-muted)]">{t("closed.noDiff")}</span>
          )}
        </span>
      </>
    );
    if (!full)
      return (
        <li key={h.id} className="border-b last:border-0">
          <button
            data-testid={`pos-shift-closed-${h.zNumber}`}
            type="button"
            className="flex min-h-14 w-full items-start gap-3 py-3 text-left"
            disabled={busy}
            onClick={() => showZ(h.id)}
          >
            {body}
          </button>
        </li>
      );
    return (
      <li key={h.id} className="flex flex-col gap-2 border-b py-3 last:border-0">
        <div className="flex items-start gap-3">{body}</div>
        <span className="flex justify-end gap-2">
          {h.status === "FORCE_CLOSED" && h.recount === null && canManage ? (
            <button data-testid={`pos-shift-recount-${h.zNumber ?? h.id}`} type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy} onClick={() => openRecount(h)}>
              {t("recount.action")}
            </button>
          ) : null}
          {h.zNumber ? (
            <button data-testid={`pos-shift-z-view-${h.zNumber}`} type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy} onClick={() => showZ(h.id)}>
              {t("view")} {t("zHash", { no: h.zNumber })}
            </button>
          ) : null}
        </span>
      </li>
    );
  };
  const closedCard = (
    <section className={`${CARD} flex flex-col gap-2`} data-testid="pos-shift-closed">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <ShiftIcon name="zdoc" />
          <h3 className="text-[15px] font-bold">{t("closed.title")}</h3>
        </div>
        {closedItems.length > 0 ? (
          <button data-testid="pos-shift-closed-all" type="button" className="min-h-11 px-1 text-[13px] font-semibold text-[color:var(--color-accent)]" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? t("closed.viewLess") : t("closed.viewAll")}
          </button>
        ) : null}
      </div>
      {ok && !ok.history.ok ? (
        <p className="text-sm text-[color:var(--color-danger)]">{te(refusalMessageKey(ok.history.code))}</p>
      ) : closedItems.length === 0 ? (
        <p className="py-2 text-sm text-[color:var(--color-muted)]">{ok ? t("closed.empty") : t("loading")}</p>
      ) : (
        <ul className="flex flex-col" data-testid={showAll ? "pos-shift-history" : undefined}>
          {(showAll ? closedItems : closedItems.slice(0, 4)).map((h) => closedRow(h, showAll))}
        </ul>
      )}
    </section>
  );

  // ═══════════ ขวา: เงินสดนอกกะวันนี้ (manage เท่านั้น · ซ่อนเมื่อ 0 และไม่มีบิล) ═══════════
  const off = ok && ok.offShift.ok ? ok.offShift : null;
  const offCard =
    canManage && off && (off.totalSatang !== 0 || off.bills.length > 0) ? (
      <section className="card flex min-w-0 flex-col gap-3 rounded-2xl border-[color:var(--color-danger)] p-5 sm:p-7" data-testid="pos-shift-offshift">
        <div className="flex items-center gap-2.5">
          <ShiftIcon name="warn" className="text-[color:var(--color-danger)]" />
          <h3 className="text-[15px] font-bold">
            {t("off.title")} <span className="text-[color:var(--color-danger)] tabular-nums">{money(off.totalSatang)}</span>
          </h3>
        </div>
        <p className="text-[13px]">{t("off.text", { n: off.bills.length })}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button data-testid="pos-shift-offshift-toggle" type="button" className="btn btn-ghost h-11 rounded-[12px] px-4" aria-expanded={showOffBills} onClick={() => setShowOffBills((v) => !v)}>
            <RegisterIcon name="doc" size={14} />
            {showOffBills ? t("off.hide") : t("off.view")}
          </button>
          {!showOffBills ? (
            <span className="text-[12px] text-[color:var(--color-muted)] tabular-nums">
              {off.bills
                .slice(0, 3)
                .map((b) => `${bkkHm(b.createdAt, locale)} ${money(b.cashSatang)}`)
                .join(" · ")}
            </span>
          ) : null}
        </div>
        {showOffBills ? (
          <ul className="flex flex-col rounded-xl border px-4" data-testid="pos-shift-offshift-bills">
            {off.bills.map((b) => (
              <li key={b.saleId} className="flex items-center justify-between gap-3 border-b py-2.5 text-[13px] last:border-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="tabular-nums">{bkkHm(b.createdAt, locale)}</span>
                  <span className="truncate text-[color:var(--color-muted)]">
                    {sourceLabel(b.sourceModule)}
                    {b.receiptNo ? ` · ${b.receiptNo}` : ""}
                  </span>
                </span>
                <b className="tabular-nums">{money(b.cashSatang)}</b>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    ) : null;

  // ═══════════ ขวา: เครื่องนี้ ═══════════
  const thisLabel = shift?.deviceLabel ?? lastOfDevice?.deviceLabel ?? null;
  const deviceCard = (
    <section className={`${CARD} flex flex-col gap-1`} data-testid="pos-shift-device">
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2.5">
          <ShiftIcon name="device" />
          <h3 className="text-[15px] font-bold">{t("deviceCard.title")}</h3>
        </div>
        <Pill tone={online ? "ink" : "danger"} testid="pos-shift-device-online">
          {online ? t("deviceCard.online") : t("deviceCard.offline")}
        </Pill>
      </div>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t py-3 text-[13px]">
        <span className="text-[color:var(--color-muted)]">{t("deviceCard.name")}</span>
        <span className={thisLabel ? "" : "text-[color:var(--color-muted)]"}>{thisLabel ?? t("openDlg.unnamed")}</span>
      </div>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t py-3 text-[13px]">
        <span className="text-[color:var(--color-muted)]">{t("deviceCard.others")}</span>
        <span className="flex min-w-0 flex-col gap-1">
          {others.length === 0 ? (
            <span className="text-[color:var(--color-muted)]">{t("deviceCard.noOthers")}</span>
          ) : (
            others.map((o) => (
              <span key={o.id} className="truncate">
                {t("deviceCard.otherLine", { device: o.deviceLabel ?? t("openDlg.unnamed"), no: o.shiftNo, name: o.openedByName })}
              </span>
            ))
          )}
        </span>
      </div>
      {canKick && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <button data-testid="pos-print-drawer-open" type="button" className="btn btn-ghost h-11 gap-2 rounded-[11px] px-4 text-[14px]" disabled={drawerBusy} onClick={() => void openDrawer()}>
            <RegisterIcon name="cash" size={15} />
            {tpr("drawer.open")}
          </button>
          {drawerRes?.ok ? (
            <span data-testid="pos-print-drawer-opened" role="status" className="text-[12.5px] text-[color:var(--color-muted)]">
              {tpr("drawer.opened")}
            </span>
          ) : (
            <PrintStatus result={drawerRes} onRetry={() => void openDrawer()} />
          )}
        </div>
      )}
    </section>
  );

  // ═══════════ กล่องเปิดกะ (13A ส่วน A) ═══════════
  const tile = (key: string, title: string, value: string, set: (v: string) => void, numeric: boolean) => (
    <label key={key} className="flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1.5">
      <b className="text-[14px] tabular-nums">{title}</b>
      <span className="flex items-center gap-1 text-[12px] text-[color:var(--color-muted)]">
        {numeric ? "×" : ""}
        <input
          data-testid={`pos-shift-open-denom-${key}`}
          aria-label={title}
          className="h-11 w-14 rounded-lg border-0 bg-transparent text-center text-[13px] font-semibold text-[color:var(--color-ink)] tabular-nums outline-none focus:bg-[color:var(--color-surface-2)]"
          inputMode={numeric ? "numeric" : "decimal"}
          placeholder="0"
          value={value}
          onChange={(e) => set(e.target.value)}
        />
      </span>
    </label>
  );
  const openDialog = openDlg ? (
    <Dialog labelledBy="pos-shift-open-title" testid="pos-shift-open-dialog" wide>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <ShiftIcon name="clock" size={18} />
          <h2 id="pos-shift-open-title" className="text-[18px] font-bold">
            {t("openDlg.title")}
          </h2>
          <Pill tone="muted">{bkkDate(new Date().toISOString(), locale)}</Pill>
        </div>
        <button data-testid="pos-shift-open-close" type="button" aria-label={tc("cancel")} className="grid h-11 w-11 place-items-center rounded-lg" onClick={() => setOpenDlg(false)}>
          <RegisterIcon name="x" size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-7">
        {errorBox}
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px]">
            <b>{t("openDlg.deviceHeading")}</b> <span className="text-[color:var(--color-muted)]">· {t("openDlg.deviceNote")}</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border-2 border-[color:var(--color-ink)] px-4 py-3">
              <RegisterIcon name="cash" size={16} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <input
                  data-testid="pos-shift-open-label"
                  aria-label={t("deviceLabel")}
                  className="h-9 min-w-0 rounded-md border-0 bg-transparent text-[15px] font-bold outline-none focus:bg-[color:var(--color-surface-2)]"
                  maxLength={40}
                  placeholder={t("openDlg.unnamed")}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <span className="text-[12px] text-[color:var(--color-muted)]">{t("openDlg.thisDevice")}</span>
              </span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
                <ShiftIcon name="check" size={14} />
              </span>
            </div>
            {others.slice(0, 3).map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border bg-[color:var(--color-surface-2)] px-4 py-3 text-[color:var(--color-muted)]">
                <RegisterIcon name="cash" size={16} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="truncate text-[15px]">{o.deviceLabel ?? t("openDlg.unnamed")}</b>
                  <span className="truncate text-[12px]">{t("openDlg.otherOpen", { no: o.shiftNo, name: o.openedByName })}</span>
                </span>
                <ShiftIcon name="lock" size={14} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px]">
            <b>{t("openDlg.staffHeading")}</b> <span className="text-[color:var(--color-muted)]">· {t("openDlg.staffNote")}</span>
          </p>
          <div className="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--color-ink)] px-4 py-3 sm:w-[calc(50%-6px)]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-[13px] font-bold">{meName.slice(0, 1)}</span>
            <b className="min-w-0 flex-1 truncate text-[15px]">{meName}</b>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
              <ShiftIcon name="check" size={14} />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px]">
            <b>{t("openDlg.floatHeading")}</b> <span className="text-[color:var(--color-muted)]">· {t("openDlg.floatNote")}</span>
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
            <label className="col-span-2 flex min-h-[72px] items-center justify-between gap-3 rounded-xl border-2 border-[color:var(--color-ink)] px-4 sm:col-span-1 sm:row-span-2">
              <span className="text-[12px] text-[color:var(--color-muted)]">{t("openDlg.total")}</span>
              <input
                data-testid="pos-shift-open-float"
                aria-label={t("float")}
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-right text-[28px] font-bold tabular-nums outline-none"
                inputMode="decimal"
                readOnly={floatByDen}
                value={floatByDen ? money(floatCalc.total) : floatB}
                onChange={(e) => setFloatB(e.target.value)}
              />
            </label>
            {NOTE_DENOMS.map((d) => tile(String(d), money(d), floatDen[String(d)] ?? "", (v) => setFloatDen((p) => ({ ...p, [String(d)]: v })), true))}
            {tile("coins", t("closeCard.coins"), floatCoins, setFloatCoins, false)}
          </div>
          <p className="text-[12px] text-[color:var(--color-muted)]">
            {floatTotal !== null ? money(floatTotal) : "—"}
            {lastOfDevice ? ` · ${t("openDlg.lastFloat", { amount: money(lastOfDevice.floatSatang) })}` : ""}
          </p>
        </div>
        {lastOfDevice && lastOfDevice.zNumber !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-[color:var(--color-surface-2)] px-4 py-2 text-[13px]" data-testid="pos-shift-open-prev">
            <span className="flex items-center gap-2">
              <RegisterIcon name="doc" size={14} className="text-[color:var(--color-muted)]" />
              {t("openDlg.prev", {
                z: lastOfDevice.zNumber,
                at: lastOfDevice.closedAt ? `${bkkDay(lastOfDevice.closedAt, locale)} ${bkkHm(lastOfDevice.closedAt, locale)}` : "—",
                diff: lastOfDevice.overShortSatang !== null ? signedMoney(lastOfDevice.overShortSatang) : "—",
              })}
            </span>
            <button data-testid="pos-shift-open-prev-z" type="button" className="min-h-11 font-semibold text-[color:var(--color-accent)]" disabled={busy} onClick={() => showZ(lastOfDevice.id)}>
              {t("openDlg.prevView", { z: lastOfDevice.zNumber })}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-3 border-t px-5 py-4 sm:px-7">
        <button data-testid="pos-shift-open-cancel" type="button" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={busy} onClick={() => setOpenDlg(false)}>
          {t("openDlg.back")}
        </button>
        <button data-testid="pos-shift-open-submit" type="button" className="btn btn-primary h-12 min-w-[200px] rounded-[12px] px-6" disabled={busy || !deviceId || floatTotal === null} onClick={doOpen}>
          {t("open")}
        </button>
      </div>
    </Dialog>
  ) : null;

  // ═══════════ กล่องเงินเข้า/ออก ═══════════
  const moveDialog =
    moveDlg && shift ? (
      <Dialog labelledBy="pos-shift-move-title" testid="pos-shift-move-dialog">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <ShiftIcon name="swap" size={18} />
            <h2 id="pos-shift-move-title" className="text-[18px] font-bold">
              {t("move.title")}
            </h2>
          </div>
          <p className="text-[12px] text-[color:var(--color-muted)]">
            {t("shiftHash", { no: shift.shiftNo })}
            {shift.deviceLabel ? ` · ${shift.deviceLabel}` : ""} · {t("move.note")}
          </p>
          {errorBox}
          <div role="radiogroup" aria-label={t("move.title")} className="grid grid-cols-2 gap-2">
            <button
              data-testid="pos-shift-cash-in"
              type="button"
              role="radio"
              aria-checked={moveKind === "IN"}
              className={`btn h-12 rounded-[12px] ${moveKind === "IN" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMoveKind("IN")}
            >
              {t("cashIn")}
            </button>
            <button
              data-testid="pos-shift-cash-out"
              type="button"
              role="radio"
              aria-checked={moveKind === "OUT"}
              className={`btn h-12 rounded-[12px] ${moveKind === "OUT" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMoveKind("OUT")}
            >
              {t("cashOut")}
            </button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("amount")}</span>
            <input data-testid="pos-shift-move-amount" className="input h-12" inputMode="decimal" value={moveB} onChange={(e) => setMoveB(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("reason")}</span>
            <input data-testid="pos-shift-move-reason" className="input h-12" maxLength={200} placeholder={t("move.reasonPlaceholder")} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button data-testid="pos-shift-move-cancel" type="button" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={busy} onClick={() => setMoveDlg(false)}>
              {tc("cancel")}
            </button>
            <button data-testid="pos-shift-move-submit" type="button" className="btn btn-primary h-12 rounded-[12px] px-6" disabled={busy} onClick={doMove}>
              {t("save")}
            </button>
          </div>
        </div>
      </Dialog>
    ) : null;

  // ═══════════ กล่องนับย้อนหลัง (P1.9b) ═══════════
  const recountDialog = recountFor ? (
    <Dialog labelledBy="pos-shift-recount-title" testid="pos-shift-recount-dialog">
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 id="pos-shift-recount-title" className="text-lg font-semibold">
          {t("recount.title")}
        </h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          {t("shiftHash", { no: recountFor.shiftNo })}
          {recountFor.zNumber ? ` · ${t("zHash", { no: recountFor.zNumber })}` : ""}
          {recountFor.expectedCashSatang !== null ? ` · ${t("expected")} ${money(recountFor.expectedCashSatang)}` : ""}
        </p>
        {recountErr && (
          <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-shift-recount-error">
            {recountErr}
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("recount.counted")}</span>
          <input data-testid="pos-shift-recount-counted" className="input h-12" inputMode="decimal" value={recountB} onChange={(e) => setRecountB(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("recount.note")}</span>
          <input data-testid="pos-shift-recount-note" className="input h-12" maxLength={200} value={recountNote} onChange={(e) => setRecountNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button data-testid="pos-shift-recount-cancel" type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy} onClick={() => setRecountFor(null)}>
            {tc("cancel")}
          </button>
          <button data-testid="pos-shift-recount-submit" type="button" className="btn btn-primary min-h-[44px] text-sm" disabled={busy} onClick={() => void doRecount()}>
            {t("save")}
          </button>
        </div>
      </div>
    </Dialog>
  ) : null;

  // ═══════════ เลย์เอาต์: lg = สองคอลัมน์ · < lg = คอลัมน์เดียว การ์ดปิดกะท้ายสุด ═══════════
  return (
    <div className="flex w-full min-w-0 flex-col gap-5" data-testid="pos-shifts">
      {header}
      {(notice || (ok && ok.current.ok && ok.current.forceClosedShiftId)) && (
        <div role="status" className="rounded-xl border p-3 text-sm" data-testid="pos-shift-notice">
          {notice ?? t("forcedNotice")}
        </div>
      )}
      {loadFailed && !data ? (
        <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-shift-load-error">
          {te("errors.unknown")}
        </div>
      ) : null}
      {!anyDialog && errorBox}
      <div className="@container w-full min-w-0">
      <div className="flex min-w-0 flex-col gap-5 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_340px] @4xl:items-start @6xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-5">
          <div className="order-1 min-w-0 @4xl:order-none">{currentCard}</div>
          {closeCard ? <div className="order-6 min-w-0 @4xl:order-none">{closeCard}</div> : null}
          {zPanel ? <div className="order-2 min-w-0 @4xl:order-none">{zPanel}</div> : null}
        </div>
        <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-5">
          <div className="order-3 min-w-0 @4xl:order-none">{closedCard}</div>
          {offCard ? <div className="order-4 min-w-0 @4xl:order-none">{offCard}</div> : null}
          <div className="order-5 flex min-w-0 flex-col gap-3 @4xl:order-none">
            {deviceCard}
            <p className="px-1 text-[12px] text-[color:var(--color-muted)]" data-testid="pos-shift-line-soon">
              {t("lineSoon")}
            </p>
          </div>
        </div>
      </div>
      </div>
      {openDialog}
      {moveDialog}
      {recountDialog}
    </div>
  );
}
