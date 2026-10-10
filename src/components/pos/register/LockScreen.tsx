"use client";

// LockScreen.tsx — จอล็อกด้วย PIN + สลับพนักงาน (POS P1.15U · ภาพ 13B · มติผู้คุมงาน 1 3 8)
//   เต็มจอ (ทับแถบบนของแอปด้วย) · หัว: SHARK · ร้าน · สาขา · เครื่อง | ชิปกะ · ออนไลน์ · นาฬิกา · วันที่
//   ซ้าย: กุญแจ · "ใส่ PIN เพื่อปลดล็อก" · <อวตาร> ชื่อ · บทบาท · ล็อกเมื่อ HH:MM · จุด 6 ดวง · แป้น 1–9 / ลืม PIN / 0 / ⌫ · คำใบ้
//   ขวา: "ใครกำลังใช้เครื่องนี้" การ์ดพนักงาน (ใช้งานอยู่ · เจ้าของกะ · ขายในกะนี้ได้ · ยังไม่ตั้ง PIN) · [สลับพนักงาน] · การ์ดบิลที่พัก · ท้าย: ล็อกอัตโนมัติ N นาที
//   ทาง: PIN ของคนที่เลือก (ส่ง userId เสมอ — ไม่มีทาง "จับทุกแถว") · PIN_LOCKED / ลืม PIN = ผู้จัดการแตะชื่อตัวเอง + PIN ผู้จัดการ →
//     unlockStaffPinAction (ไม่มีทางตั้ง PIN ใหม่ — ตั้งค่า → พนักงาน) · fix รอบ 1 F1: ตั้ง PIN จากจอนี้ได้เฉพาะการ์ดของผู้ใช้ session
//     ที่ยังไม่มี PIN (setOwnStaffPinAction) · คนอื่นที่ยังไม่มี PIN = ข้อความให้ผู้จัดการตั้งที่ ตั้งค่า → พนักงาน
//   ไม่ได้ลงทะเบียนเครื่อง = "ลงทะเบียนเครื่องนี้ก่อน" + ลิงก์ตั้งค่า (ไม่มีแป้น PIN) · เครื่องถูกเพิกถอน = ข้อความแดง
// 🔴 PIN ไม่ถูกเก็บที่ใดนอก state ของจอนี้ (ล้างทันทีหลังส่ง) · โทเคนที่ได้ส่งให้ RegisterScreen ผ่าน onUnlocked เท่านั้น
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatThaiDate, formatThaiTime } from "@/lib/ui/date";
import { moneyText, refusalMessageKey, type HeldCartSummary, type RegisterRole, type RegisterShiftInfo, type StaffListItem } from "@/lib/modules/pos/register-shared";
import { listStaffForDeviceAction, setOwnStaffPinAction, unlockStaffPinAction, verifyStaffPinAction } from "@/lib/modules/pos/staff-pin-actions";
import type { StaffSession } from "@/lib/modules/pos/staff-session";
import { RegisterIcon } from "./RegisterIcon";

const ROLE_KEY: Record<RegisterRole, string> = { OWNER: "roles.owner", MANAGER: "roles.manager", STAFF: "roles.cashier" };
const PIN_MAX = 6;
const PIN_MIN = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type LockMode = "checking" | "unregistered" | "revoked" | "ready";
type Phase = { kind: "pin" } | { kind: "manager"; forUserId: string; forgot: boolean } | { kind: "set"; userId: string; first: string | null };
type Msg = { key: string; values?: Record<string, string | number>; tone?: "danger" | "ok" };

export function LockScreen(p: {
  mode: LockMode;
  systemId: string;
  unitId: string;
  deviceId: string | undefined;
  tenantName: string;
  unitName: string;
  deviceLabel: string | null;
  shift: RegisterShiftInfo | null;
  online: boolean;
  /** คนที่ใช้งานอยู่ก่อนล็อก (ชิป "ใช้งานอยู่" + เลือกไว้ก่อน) · null = ยังไม่มีใครเข้าใช้ */
  current: Pick<StaffSession, "userId" | "name" | "role"> | null;
  lockedAt: Date | null;
  heldItems: HeldCartSummary[] | null;
  heldCount: number;
  autoLockMinutes: number;
  settingsHref: string;
  /** fix รอบ 1 F1: ผู้ใช้ session — ตั้ง PIN จากจอนี้ได้เฉพาะการ์ดของคนนี้ (ครั้งแรกเท่านั้น) */
  sessionUserId: string;
  /** fix รอบ 1 F2: ร้านยังไม่มีใครตั้ง PIN — จอล็อกเปิดเองจากปุ่มล็อก มีปุ่ม "กลับไปขาย" */
  onCancel?: () => void;
  /** ตั้ง PIN สำเร็จ — หน้าขายถามรายชื่อใหม่ (โหมดร้านไม่มี PIN จบ) */
  onStaffChanged?: () => void;
  onUnlocked: (s: StaffSession) => void;
}) {
  const t = useTranslations("pos.register");
  const [staff, setStaff] = useState<StaffListItem[] | null>(null);
  const [staffErr, setStaffErr] = useState(false);
  const [selected, setSelected] = useState<string | null>(p.current?.userId ?? null);
  const [manager, setManager] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "pin" });
  const [msg, setMsg] = useState<Msg | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // HF-418: นาฬิกาหัวจอล็อกอ่านเวลาหลัง mount เท่านั้น — จอล็อกถูกวาดตั้งแต่ SSR (staff ยังไม่ได้อ่าน = ล็อก) ⇒ เดิม new Date() ตอนเรนเดอร์
  //   ให้ "HH:MM" ของเซิร์ฟเวอร์ ≠ ของเบราว์เซอร์เมื่อข้ามนาทีระหว่าง SSR → hydrate = React #418 (text) แบบสุ่มทุกรอบภาพ
  //   null = ยังไม่ mount (SSR/เฟรมแรก) ⇒ เว้นที่ของเวลาไว้ (invisible) ไม่ให้หัวจอขยับ
  const [now, setNow] = useState<Date | null>(null);
  const target = { systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}) };

  const loadStaff = useCallback(async () => {
    setStaffErr(false);
    try {
      const r = await listStaffForDeviceAction({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}) });
      if (r.ok) setStaff(r.items);
      else setStaffErr(true);
    } catch {
      setStaffErr(true);
    }
  }, [p.systemId, p.unitId, p.deviceId]);
  useEffect(() => {
    if (p.mode === "ready") void loadStaff();
  }, [p.mode, loadStaff]);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  // ยังไม่ได้เลือกใคร: คนที่ใช้งานอยู่ก่อน → ไม่งั้นคนเดียวในรายการ
  useEffect(() => {
    if (selected || !staff) return;
    if (staff.length === 1) setSelected(staff[0]!.userId);
  }, [staff, selected]);

  const byId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s])), [staff]);
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? (p.current?.userId === id ? p.current.name : null) ?? "-") : "-");
  const sel = selected ? (byId.get(selected) ?? null) : null;
  const isManagerRole = (r: RegisterRole) => r === "MANAGER" || r === "OWNER";

  const reset = (m: Msg | null = null) => {
    setPin("");
    setMsg(m);
  };
  const choose = (s: StaffListItem) => {
    if (busyRef.current) return;
    if (phase.kind === "manager") {
      if (!isManagerRole(s.role) || !s.hasPin) return;
      setManager(s.userId);
      reset(null);
      return;
    }
    setSelected(s.userId);
    // fix รอบ 1 F1: ตั้ง PIN จากจอนี้ได้เฉพาะการ์ดของผู้ใช้ session (ครั้งแรก) · คนอื่นที่ยังไม่มี PIN = ให้ผู้จัดการตั้งที่ ตั้งค่า → พนักงาน
    if (!s.hasPin && s.userId === p.sessionUserId) {
      setPhase({ kind: "set", userId: s.userId, first: null });
      reset(null);
      return;
    }
    setPhase({ kind: "pin" });
    reset(s.hasPin ? null : { key: "lock.forgotBody" });
  };
  /** สลับพนักงาน: เลือกคนถัดไปที่ไม่ใช่คนที่ใช้งานอยู่ (แป้น PIN ของคนนั้น) */
  const switchNext = () => {
    if (!staff?.length || busyRef.current) return;
    const others = staff.filter((s) => s.userId !== (p.current?.userId ?? selected));
    const i = others.findIndex((s) => s.userId === selected);
    const next = others[(i + 1) % Math.max(1, others.length)] ?? others[0];
    if (next) choose(next);
  };

  const refusal = (code: string): Msg => {
    if (code === "PIN_LOCKED") return { key: "lock.pinLocked", tone: "danger" };
    return { key: refusalMessageKey(code), tone: "danger" };
  };

  const submit = async (value: string) => {
    if (busyRef.current || p.mode !== "ready") return;
    if (value.length < PIN_MIN) return;
    busyRef.current = true;
    setBusy(true);
    setPin("");
    try {
      if (phase.kind === "pin") {
        if (!sel || !p.deviceId) return;
        const r = await verifyStaffPinAction({ ...target, deviceId: p.deviceId, pin: value, userId: sel.userId });
        if (r.ok) {
          setMsg(null);
          p.onUnlocked({ userId: r.userId, name: sel.name, role: r.role, staffToken: r.staffToken, expiresAt: r.expiresAt });
          return;
        }
        if (r.code === "PIN_LOCKED") setLocked((s) => new Set(s).add(sel.userId));
        setMsg(refusal(r.code));
        return;
      }
      if (phase.kind === "manager") {
        if (!manager || !p.deviceId) return setMsg({ key: "lock.managerBody", tone: "danger" });
        const v = await verifyStaffPinAction({ ...target, deviceId: p.deviceId, pin: value, userId: manager });
        if (!v.ok) return setMsg(refusal(v.code));
        if (!isManagerRole(v.role)) return setMsg({ key: "lock.managerBody", tone: "danger" });
        const u = await unlockStaffPinAction({ ...target, userId: phase.forUserId });
        if (!u.ok && u.code !== "NOT_FOUND") return setMsg({ key: "lock.unlockDenied", tone: "danger" });
        setLocked((s) => {
          const n = new Set(s);
          n.delete(phase.forUserId);
          return n;
        });
        setManager(null);
        setSelected(phase.forUserId);
        // fix รอบ 1 F1: ลืม PIN ไม่มีทางตั้ง PIN ใหม่จากจอนี้ — ปลดล็อกแล้วชี้ไป ตั้งค่า → พนักงาน
        setPhase({ kind: "pin" });
        setMsg(phase.forgot ? { key: "lock.forgotBody", tone: "ok" } : { key: "lock.unlocked", values: { name: nameOf(phase.forUserId) }, tone: "ok" });
        return;
      }
      // ตั้ง PIN ของตัวเอง (fix รอบ 1 F1): ครั้งแรก → ยืนยันอีกครั้ง → setOwnStaffPinAction → เข้าใช้ด้วย PIN ใหม่
      if (phase.first === null) {
        setPhase({ ...phase, first: value });
        setMsg({ key: "lock.setConfirmTitle" });
        return;
      }
      if (phase.first !== value) {
        setPhase({ ...phase, first: null });
        return setMsg({ key: "lock.setMismatch", tone: "danger" });
      }
      if (phase.userId !== p.sessionUserId) return setMsg({ key: "lock.forgotBody", tone: "danger" });
      const s = await setOwnStaffPinAction({ ...target, pin: value });
      if (!s.ok) {
        setPhase({ ...phase, first: null });
        return setMsg(refusal(s.code));
      }
      void loadStaff();
      p.onStaffChanged?.();
      if (!p.deviceId) return;
      const r = await verifyStaffPinAction({ ...target, deviceId: p.deviceId, pin: value, userId: phase.userId });
      if (!r.ok) {
        setPhase({ kind: "pin" });
        return setMsg(refusal(r.code));
      }
      setMsg(null);
      p.onUnlocked({ userId: r.userId, name: nameOf(phase.userId), role: r.role, staffToken: r.staffToken, expiresAt: r.expiresAt });
    } catch {
      setMsg({ key: "errors.loadFailed", tone: "danger" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busyRef.current) return;
    setMsg((m) => (m?.tone === "danger" ? null : m));
    if (k === "del") return setPin((v) => v.slice(0, -1));
    setPin((v) => {
      if (v.length >= PIN_MAX) return v;
      const next = v + k;
      if (next.length === PIN_MAX) queueMicrotask(() => void submit(next));
      return next;
    });
  };
  // แป้นพิมพ์จริง: ตัวเลข · Backspace · Enter (PIN 4–5 หลัก)
  const keyRef = useRef({ press, submit, pin });
  keyRef.current = { press, submit, pin };
  useEffect(() => {
    if (p.mode !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        keyRef.current.press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        keyRef.current.press("del");
      } else if (e.key === "Enter") {
        e.preventDefault();
        void keyRef.current.submit(keyRef.current.pin);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.mode]);

  const startManager = (forgot: boolean) => {
    if (!sel) return;
    setManager(null);
    setPhase({ kind: "manager", forUserId: sel.userId, forgot });
    reset({ key: forgot ? "lock.forgotBody" : "lock.managerBody" });
  };
  const back = () => {
    setPhase({ kind: "pin" });
    setManager(null);
    reset(null);
  };

  // ── วาด ──
  const avatar = (name: string | null, big = false) => (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-[10px] font-bold ${big ? "size-11 bg-[color:var(--color-ink)] text-[15px] text-[color:var(--color-surface)]" : "size-7 border bg-[color:var(--color-surface-2)] text-[12px] text-[color:var(--color-ink-soft)]"}`}
    >
      {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
  const shiftNoOf = (id: string) => (p.shift && p.shift.id === id ? p.shift.shiftNo : null);
  const staffLine = (s: StaffListItem): string => {
    if (s.shift) {
      const no = shiftNoOf(s.shift.id);
      const time = formatThaiTime(new Date(s.shift.openedAt));
      return no !== null ? t("staff.shiftOwner", { no, time }) : t("staff.shiftOwnerNoNo", { time });
    }
    if (!s.hasPin) return t(s.userId === p.sessionUserId ? "staff.noPinOwn" : "staff.noPin");
    return p.shift ? t("staff.canSell") : t(ROLE_KEY[s.role]);
  };
  const heldFirst = p.heldItems?.[0] ?? null;
  const dots = (
    <div data-testid="pos-lock-dots" className="flex items-center justify-center gap-4" aria-label={t("lock.dotsLabel", { count: pin.length })}>
      {Array.from({ length: PIN_MAX }, (_, i) => (
        <i key={i} aria-hidden className={`inline-block size-[18px] rounded-full border-[1.5px] border-[color:var(--color-ink)] ${i < pin.length ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface)] opacity-40"}`} />
      ))}
    </div>
  );
  const title =
    phase.kind === "manager"
      ? t("lock.managerTitle")
      : phase.kind === "set"
        ? phase.first === null
          ? t("lock.setTitle", { name: nameOf(phase.userId) })
          : t("lock.setConfirmTitle")
        : t("lock.title");
  const subject =
    phase.kind === "manager"
      ? manager
        ? `${nameOf(manager)} · ${t("lock.managerFor", { name: nameOf(phase.forUserId) })}`
        : t("lock.managerFor", { name: nameOf(phase.forUserId) })
      : sel
        ? `${sel.name ?? "-"} · ${t(ROLE_KEY[sel.role])}${p.lockedAt && p.current?.userId === sel.userId ? ` · ${t("lock.lockedAt", { time: formatThaiTime(p.lockedAt) })}` : ""}`
        : null;
  const padReady = p.mode === "ready" && (phase.kind === "manager" ? !!manager : phase.kind === "set" ? true : !!sel && sel.hasPin && !locked.has(sel.userId));

  return (
    <div
      data-testid="pos-lock-screen"
      data-mode={p.mode}
      data-phase={phase.kind}
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"
      role="dialog"
      aria-modal="true"
      aria-label={t("lock.title")}
    >
      {/* หัวจอ */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:h-[66px] md:flex-nowrap md:px-7">
        <span className="text-[15px] font-bold tracking-tight">SHARK</span>
        <span className="min-w-0 truncate text-[13px] text-[color:var(--color-ink-soft)]">
          {[p.tenantName, p.unitName, p.deviceLabel].filter(Boolean).join(" · ")}
        </span>
        <span className="flex-1" />
        {p.shift && (
          <span data-testid="pos-lock-shift" className="inline-flex h-7 shrink-0 items-center gap-[5px] rounded-[8px] border border-[color:var(--color-ink)] px-[11px] text-[13px] font-semibold">
            <RegisterIcon name="clock" size={12} />
            {t("status.shift", { no: p.shift.shiftNo, time: formatThaiTime(new Date(p.shift.openedAt)) })}
          </span>
        )}
        <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-[8px] border px-[11px] text-[12.5px] text-[color:var(--color-muted)]" role="status">
          <i aria-hidden className={`inline-block size-2 rounded-full ${p.online ? "bg-[color:var(--color-ink)]" : "border-[1.5px] border-[color:var(--color-ink)]"}`} />
          {p.online ? t("status.online") : t("status.offline")}
        </span>
        {now ? (
          <>
            <span data-testid="pos-lock-clock" className="shrink-0 text-[15px] font-bold tabular-nums">{formatThaiTime(now)}</span>
            <span className="hidden shrink-0 text-[13px] text-[color:var(--color-muted)] sm:inline">{formatThaiDate(now)}</span>
          </>
        ) : (
          <span aria-hidden className="invisible shrink-0 text-[15px] font-bold tabular-nums">
            00:00
          </span>
        )}
      </header>

      {/* POS HF-P1CLOSE ▸ O5: มือถือ = กล่องนี้สูงตามเนื้อหา (min-h-0 เฉพาะ md+) ⇒ ความสูงเลื่อนของหน้าจอล็อก = แป้น + รายชื่อพนักงาน + สลับพนักงาน + บิลพักครบ
          (เดิม min-h-0 ทุกขนาด ⇒ กล่องหดเท่าจอ เนื้อหาล้นออกนอกกล่อง — ยังเลื่อนได้ แต่พึ่งการนับส่วนล้นของลูก) ◂ */}
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        {/* ซ้าย: PIN */}
        <section className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-8 md:py-10">
          <span className="grid size-[68px] place-items-center rounded-[18px] border bg-[color:var(--color-surface-2)]">
            <RegisterIcon name="lock" size={26} />
          </span>
          {p.mode === "checking" ? (
            <p data-testid="pos-lock-checking" className="text-[15px] text-[color:var(--color-muted)]">
              {t("lock.checking")}
            </p>
          ) : p.mode === "unregistered" ? (
            <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
              <h2 className="text-[26px] font-bold">{t("lock.unregisteredTitle")}</h2>
              <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("lock.unregisteredBody")}</p>
              <Link data-testid="pos-lock-register-device" href={p.settingsHref} className="btn btn-primary mt-2 inline-flex h-12 items-center rounded-[13px] px-6 text-[15px]">
                {t("lock.unregisteredLink")}
              </Link>
            </div>
          ) : p.mode === "revoked" ? (
            <div className="flex max-w-[440px] flex-col items-center gap-3 text-center" role="alert">
              <h2 className="text-[26px] font-bold text-[color:var(--color-danger)]">{t("lock.revokedTitle")}</h2>
              <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("lock.revokedBody")}</p>
            </div>
          ) : (
            <>
              <h2 className="text-center text-[26px] font-bold md:text-[30px]">{title}</h2>
              {subject ? (
                <p data-testid="pos-lock-who" className="inline-flex items-center gap-2.5 text-[15px] text-[color:var(--color-ink-soft)]">
                  {avatar(phase.kind === "manager" ? (manager ? nameOf(manager) : null) : (sel?.name ?? null))}
                  {subject}
                </p>
              ) : (
                <p data-testid="pos-lock-pick" className="text-[15px] text-[color:var(--color-muted)]">
                  {t("lock.pickStaff")}
                </p>
              )}
              {dots}
              {msg && (
                <p
                  data-testid="pos-lock-message"
                  role={msg.tone === "danger" ? "alert" : "status"}
                  className={`max-w-[400px] text-center text-[14px] leading-[1.5] ${msg.tone === "danger" ? "font-semibold text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}
                >
                  {t(msg.key, msg.values ?? {})}
                </p>
              )}
              {sel && locked.has(sel.userId) && phase.kind === "pin" && (
                <button data-testid="pos-lock-manager-unlock" type="button" className="btn btn-primary h-12 rounded-[13px] px-6 text-[15px]" onClick={() => startManager(false)}>
                  {t("lock.managerUnlock")}
                </button>
              )}
              <div className="grid w-full max-w-[390px] grid-cols-3 gap-3">
                {KEYS.map((k) => (
                  <button
                    key={k}
                    data-testid={`pos-lock-key-${k}`}
                    type="button"
                    disabled={!padReady || busy}
                    className="h-[70px] rounded-[14px] border bg-[color:var(--color-surface)] text-[24px] font-semibold disabled:opacity-40"
                    onClick={() => press(k)}
                  >
                    {k}
                  </button>
                ))}
                {phase.kind === "pin" ? (
                  <button
                    data-testid="pos-lock-forgot"
                    type="button"
                    disabled={!sel || busy}
                    className="h-[70px] rounded-[14px] border bg-[color:var(--color-surface-2)] text-[15px] font-semibold disabled:opacity-40"
                    onClick={() => startManager(true)}
                  >
                    {t("lock.forgot")}
                  </button>
                ) : (
                  <button data-testid="pos-lock-back" type="button" disabled={busy} className="h-[70px] rounded-[14px] border bg-[color:var(--color-surface-2)] text-[15px] font-semibold disabled:opacity-40" onClick={back}>
                    {t("lock.back")}
                  </button>
                )}
                <button data-testid="pos-lock-key-0" type="button" disabled={!padReady || busy} className="h-[70px] rounded-[14px] border text-[24px] font-semibold disabled:opacity-40" onClick={() => press("0")}>
                  0
                </button>
                <button
                  data-testid="pos-lock-key-del"
                  type="button"
                  disabled={!padReady || busy || !pin}
                  aria-label={t("lock.del")}
                  className="grid h-[70px] place-items-center rounded-[14px] border bg-[color:var(--color-surface-2)] disabled:opacity-40"
                  onClick={() => press("del")}
                >
                  <RegisterIcon name="del" size={22} />
                </button>
              </div>
              {pin.length >= PIN_MIN && pin.length < PIN_MAX && (
                <button data-testid="pos-lock-submit" type="button" disabled={busy} className="btn btn-ghost h-11 rounded-[12px] px-6 text-[15px] font-semibold" onClick={() => void submit(pin)}>
                  {t("lock.confirm")}
                </button>
              )}
              <p className="text-center text-[13px] text-[color:var(--color-muted)]">{phase.kind === "set" ? t("lock.setHint") : t("lock.hint")}</p>
              {p.onCancel && (
                <button data-testid="pos-lock-cancel" type="button" disabled={busy} className="btn btn-ghost h-11 rounded-[12px] px-6 text-[14px]" onClick={p.onCancel}>
                  {t("lock.backToSale")}
                </button>
              )}
            </>
          )}
        </section>

        {/* ขวา: ใครกำลังใช้เครื่องนี้ */}
        {p.mode === "ready" && (
          <aside className="flex shrink-0 flex-col gap-3.5 border-t bg-[color:var(--color-surface-2)] px-5 py-6 md:w-[460px] md:border-l md:border-t-0 md:px-10 md:py-10 xl:w-[574px]">
            <h3 className="text-[19px] font-bold">{t("staff.title")}</h3>
            {staff === null ? (
              staffErr ? (
                <div className="flex items-center gap-3 text-[14px] text-[color:var(--color-muted)]">
                  {t("staff.loadFailed")}
                  <button data-testid="pos-staff-retry" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={() => void loadStaff()}>
                    {t("staff.retry")}
                  </button>
                </div>
              ) : (
                <p className="text-[14px] text-[color:var(--color-muted)]">{t("staff.loading")}</p>
              )
            ) : staff.length === 0 ? (
              <p data-testid="pos-staff-empty" className="text-[14px] text-[color:var(--color-muted)]">
                {t("staff.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {staff.map((s) => {
                  const isSel = phase.kind === "manager" ? manager === s.userId : selected === s.userId;
                  const dim = phase.kind === "manager" ? !isManagerRole(s.role) || !s.hasPin : !s.hasPin && s.userId !== selected;
                  return (
                    <li key={s.userId}>
                      <button
                        data-testid="pos-staff-card"
                        data-selected={isSel ? "true" : "false"}
                        type="button"
                        disabled={busy || (phase.kind === "manager" && (!isManagerRole(s.role) || !s.hasPin))}
                        className={`flex min-h-[74px] w-full items-center gap-3.5 rounded-[16px] border bg-[color:var(--color-surface)] px-4 py-3 text-left ${isSel ? "border-2 border-[color:var(--color-ink)]" : ""} ${dim ? "opacity-55" : ""}`}
                        onClick={() => choose(s)}
                      >
                        {avatar(s.name, isSel)}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-bold">{s.name ?? "-"}</span>
                          <span className="block truncate text-[13px] text-[color:var(--color-muted)]">{staffLine(s)}</span>
                        </span>
                        {p.current?.userId === s.userId && (
                          <span data-testid="pos-staff-active" className="shrink-0 rounded-[8px] border-[1.5px] border-[color:var(--color-ink)] px-2.5 py-1 text-[12px] font-bold">
                            {t("staff.active")}
                          </span>
                        )}
                        {locked.has(s.userId) && <RegisterIcon name="lock" size={14} className="text-[color:var(--color-danger)]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              data-testid="pos-staff-switch"
              type="button"
              disabled={busy || !staff || staff.length < 2 || phase.kind === "manager"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border bg-[color:var(--color-surface)] text-[15px] font-semibold disabled:opacity-50"
              onClick={switchNext}
            >
              <RegisterIcon name="swap" size={16} />
              {t("staff.switch")}
            </button>
            {p.heldCount > 0 && heldFirst && (
              <div data-testid="pos-staff-held" className="mt-2 flex items-center gap-3.5 rounded-[16px] border bg-[color:var(--color-surface)] px-4 py-4">
                <RegisterIcon name="clock" size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{t("staff.heldTitle", { count: p.heldCount })}</span>
                  <span className="block truncate text-[12.5px] text-[color:var(--color-muted)]">
                    {t("staff.heldLine", {
                      label: heldFirst.label ?? t("held.untitled", { time: formatThaiTime(new Date(heldFirst.createdAt)) }),
                      lines: heldFirst.lineCount,
                      time: formatThaiTime(new Date(heldFirst.createdAt)),
                      name: heldFirst.heldByName ?? "-",
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-[20px] font-bold tabular-nums">{moneyText(heldFirst.approxTotalSatang)}</span>
              </div>
            )}
            <span className="flex-1" />
            <p className="mt-4 flex items-center gap-2 border-t pt-4 text-[13px] text-[color:var(--color-muted)]">
              <RegisterIcon name="lock" size={12} />
              {p.autoLockMinutes > 0 ? t("lock.footer", { minutes: p.autoLockMinutes }) : t("lock.footerOff")}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
