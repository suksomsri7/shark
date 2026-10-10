"use client";

// RegisterTopContext.tsx — บริบทหัวจอ: สาขา ▾ · ออนไลน์/ซิงก์ล่าสุด · กะ · ผู้ขาย (สเปก §1.1 แถว 1–4, 29 · §4.1 · ภาพ 01 / 20 / 05ก / 19ง)
//   md+ (มติ Q1 = A ชั่วคราว): portal เข้าช่อง #app-topbar-slot ของแถบบนแอป (Topbar.tsx) — ไม่เสียความสูง
//     ไม่พบช่อง (เช่น shell อื่น) = แถวบริบทสูง 48 ในหน้า (ทาง B) · ทั้งสองทางใช้โค้ดชุดเดียว (placement)
//     D: ชิปร้าน·สาขา สูง 32 มุม 8 ตัว 13 · "● ออนไลน์ · ซิงก์ล่าสุด HH:MM" 12.5 muted · ชิปกะ สูง 28 ตัว 13 · อวตาร 24 + "ชื่อ · บทบาท"
//     T: ไม่มีเวลาซิงก์ · ชื่ออย่างเดียว · M: ซ่อนชิปกะและชื่อ (พื้นที่แถบบนไม่พอ — ไม่มีภาพของช่วงนี้)
//   C (<768 · 05ก): หัวจอในหน้า — ชื่อสาขา 16 หนา ▾ · ชิปกะ 28 · ปุ่มกล้อง 44 (แบบ 36 — กติกา ≥44px) · ☰ เฉพาะในแอป (เว็บมี ☰ ที่แถบบนแล้ว)
//   ออฟไลน์ (19ง): จุดกลวงขอบหมึก 1.5px + "ออฟไลน์"
// P1.2 U R3 V3: ชิปกะอ่านสถานะเดียวกับ RegisterScreen (status.shift ของเครื่องนี้) — เปิดอยู่ = "กะ #N · เปิด HH:MM · <ชื่อเครื่อง>" หมึก (ภาพ 01/02) ·
//   ยังไม่เปิด = "ยังไม่เปิดกะ" สี muted · สถานะรีเฟรชตามรอบของ RegisterScreen (ทุก 60 วิ · กลับมาที่แท็บ · หลังขาย)
// 🔴 ชื่อร้าน/สาขา/ผู้ใช้ = ข้อมูล ไม่แปล · บทบาทแปลฝั่ง client จาก role (มติ Q23 — roleLabel ของเซิร์ฟเวอร์เป็นไทย)
// 🔴 ปุ่มกล้องบนมือถืออยู่ไฟล์นี้ และไฟล์นี้ถูกอ่านก่อน SearchRow (ลำดับชื่อไฟล์) ⇒ แท็กนี้ต้องมีคลาส ≥44px (S5.9 · G4)

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import type { RegisterRole, RegisterShiftInfo } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "./RegisterIcon";
import { LocaleChooser } from "@/components/pos/LocaleChooser";

type Unit = { id: string; name: string };
type Props = {
  /** null = ยังไม่รู้ขนาดจอ (ก่อน mount) · true = ≥768 · false = มือถือ */
  wide: boolean | null;
  inApp: boolean;
  systemId: string;
  tenantName: string;
  units: Unit[];
  activeUnitId: string;
  online: boolean;
  lastSyncAt: Date | null;
  user: { name: string; role: RegisterRole } | null;
  /** กะ OPEN ของเครื่องนี้ (registerStatus.shift) · null = ยังไม่เปิด/ยังไม่รู้ */
  shift: RegisterShiftInfo | null;
  onCamera: () => void;
  /** POS P1.15U ▸ ปุ่มล็อกจอ (ชิปผู้ขาย = คนในโทเคน) · ไม่ส่ง = ไม่มีปุ่ม ◂ */
  onLock?: () => void;
};

const ROLE_KEY: Record<RegisterRole, string> = { OWNER: "roles.owner", MANAGER: "roles.manager", STAFF: "roles.cashier" };

function UnitChooser({ systemId, units, activeUnitId, label, mobile }: { systemId: string; units: Unit[]; activeUnitId: string; label: string; mobile: boolean }) {
  const t = useTranslations("pos.register");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const chip = mobile
    ? "inline-flex min-w-0 items-center gap-[5px] text-[16px] font-bold text-[color:var(--color-ink)]"
    : "inline-flex h-8 w-full min-w-0 items-center gap-2.5 rounded-[8px] border px-2.5 text-[13px] text-[color:var(--color-ink-soft)] xl:gap-3";
  // B2.5 (§7.2.20 · 20A): เพดานความกว้างอยู่ที่ "กรอบ" ของชิป (flex item ตัวจริงในแถว) — เดิมอยู่ที่ปุ่มข้างใน div ⇒ div หดแต่ปุ่มไม่หด
  //   ล้นทับจุด "● ออนไลน์" ที่ 1024 · ไอคอน (RegisterIcon shrink-0 อยู่แล้ว) ไม่หด ⇒ ชื่อถูกตัด … ก่อน ลูกศรไม่โดนบีบ
  // POS HF-P1CLOSE ▸ O1: มือถือ 390 (en) ชิปกะยาวเบียดชื่อสาขาจนเหลือ "⌄" เปล่า ⇒ ชิปสาขาไม่หด (กว้างได้ไม่เกินครึ่งแถว · ชื่อยาวตัด …) ให้ชิปกะเป็นฝ่ายหด ◂
  const capW = mobile ? "min-w-0 max-w-[50%] shrink-0" : "min-w-0 max-w-[200px] lg:max-w-[240px] xl:max-w-[360px]";
  if (units.length <= 1) {
    return (
      <span data-testid="pos-reg-unit-switch" className={`${chip} ${capW}`} title={label}>
        {!mobile && <RegisterIcon name="shop" size={14} />}
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <div ref={box} className={`relative flex ${capW}`}>
      <button
        data-testid="pos-reg-unit-switch"
        className={`${chip} ${mobile ? "h-11" : ""} hover:bg-[color:var(--color-surface-2)]`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("unit.label")}: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {!mobile && <RegisterIcon name="shop" size={14} />}
        <span className="min-w-0 truncate">{label}</span>
        <RegisterIcon name="chevron" size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl" role="menu">
          {units.map((u) => (
            <Link
              key={u.id}
              data-testid={`pos-reg-unit-option-${u.id}`}
              className={`flex h-11 items-center rounded-[8px] px-2.5 text-[14px] hover:bg-[color:var(--color-surface-2)] ${u.id === activeUnitId ? "font-bold" : ""}`}
              role="menuitem"
              aria-current={u.id === activeUnitId ? "true" : undefined}
              href={`/app/sys/${systemId}/pos/register?unit=${u.id}`}
              onClick={() => setOpen(false)}
            >
              <span className="truncate">{u.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegisterTopContext(p: Props) {
  const t = useTranslations("pos.register");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    setSlot(document.getElementById("app-topbar-slot"));
    setLooked(true);
  }, []);
  const unitName = p.units.find((u) => u.id === p.activeUnitId)?.name ?? "";
  const dot = (
    <i
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${
        p.online ? "bg-[color:var(--color-ink)]" : "border-[1.5px] border-[color:var(--color-ink)] bg-[color:var(--color-surface)]"
      }`}
    />
  );
  // POS HF-P1CLOSE ▸ O1: shrink = มือถือ — ชิปกะหดได้ ข้อความตัด … (เดิม shrink-0 ⇒ ชื่อสาขาโดนบีบเหลือ 0) ◂
  const shiftChip = (extra: string, shrink = false) => (
    <span
      data-testid="pos-reg-status-shift"
      className={`h-7 ${shrink ? "min-w-0" : "shrink-0"} items-center gap-[5px] whitespace-nowrap rounded-[8px] border px-[11px] text-[13px] ${p.shift ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-muted)]"} ${extra}`}
    >
      <RegisterIcon name="clock" size={12} />
      <span className="min-w-0 truncate">
        {p.shift
          ? `${t("status.shift", { no: p.shift.shiftNo, time: formatThaiTime(new Date(p.shift.openedAt)) })}${p.shift.deviceLabel ? ` · ${p.shift.deviceLabel}` : ""}`
          : t("status.noShift")}
      </span>
    </span>
  );

  // ── มือถือ (05ก) — ในหน้า ใต้แถบบนของเว็บ ──
  const mobile = (
    <div className="flex items-center gap-4 px-5 pb-[14px] pt-2 md:hidden">
      <UnitChooser systemId={p.systemId} units={p.units} activeUnitId={p.activeUnitId} label={unitName} mobile />
      {shiftChip("inline-flex", true)}
      <span className="flex-1" />
      <button
        data-testid="pos-reg-scan-camera"
        className="grid size-11 shrink-0 place-items-center rounded-[10px] border text-[color:var(--color-ink-soft)]"
        type="button"
        aria-disabled="true"
        title={t("soon")}
        aria-label={t("search.scanCamera")}
        onClick={p.onCamera}
      >
        <RegisterIcon name="cam" size={14} />
      </button>
      {p.onLock && (
        <button
          data-testid="pos-lock-now-mobile"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] border text-[color:var(--color-ink-soft)]"
          type="button"
          aria-label={p.user ? `${t("lock.lockNow")} · ${p.user.name}` : t("lock.lockNow")}
          onClick={p.onLock}
        >
          <RegisterIcon name="lock" size={14} />
        </button>
      )}
      {p.inApp && (
        <button
          data-testid="pos-reg-mobile-menu"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] border text-[color:var(--color-ink-soft)]"
          type="button"
          aria-label={t("menu")}
          onClick={() => window.dispatchEvent(new CustomEvent("app:drawer-open"))}
        >
          <RegisterIcon name="menu" size={14} />
        </button>
      )}
    </div>
  );

  // ── md+ — ช่องในแถบบน (หรือแถว 48 ในหน้าเมื่อไม่มีช่อง) ──
  const desktop = (inline: boolean) => (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${inline ? "h-12 shrink-0 border-b px-4 xl:px-[26px]" : ""}`}>
      <UnitChooser systemId={p.systemId} units={p.units} activeUnitId={p.activeUnitId} label={`${p.tenantName} · ${unitName}`} mobile={false} />
      <span className="flex-1" />
      <span data-testid="pos-reg-status-online" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[12.5px] text-[color:var(--color-muted)]" role="status">
        {dot}
        {p.online ? t("status.online") : t("status.offline")}
        {p.online && p.lastSyncAt && <span className="hidden xl:inline">{` · ${t("status.lastSync", { time: formatThaiTime(p.lastSyncAt) })}`}</span>}
      </span>
      {shiftChip("hidden lg:inline-flex")}
      {/* POS P1.18U ▸ มติ 8 (O10 ก): ตัวสลับภาษา TH | EN ข้างชิปออนไลน์/กะ (md+ · มือถือ 390 ไม่มีที่ในหัว 05ก — สลับได้ที่ ตั้งค่า → ทั่วไป) ◂ */}
      <LocaleChooser compact />
      {p.user && p.onLock && (
        <button
          data-testid="pos-lock-now"
          className="inline-flex h-11 min-w-0 shrink items-center gap-2 rounded-[10px] px-1.5 text-[12.5px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
          type="button"
          title={t("lock.lockNow")}
          aria-label={`${t("lock.lockNow")} · ${p.user.name}`}
          onClick={p.onLock}
        >
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] border bg-[color:var(--color-surface-2)] text-[11px] font-bold text-[color:var(--color-ink-soft)]">
            {p.user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span data-testid="pos-reg-status-user" className="hidden truncate lg:inline">
            {p.user.name}
            <span className="hidden xl:inline">{` · ${t(ROLE_KEY[p.user.role])}`}</span>
          </span>
          <RegisterIcon name="lock" size={12} />
        </button>
      )}
      {p.user && !p.onLock && (
        <span data-testid="pos-reg-status-user" className="inline-flex min-w-0 shrink items-center gap-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-[7px] border bg-[color:var(--color-surface-2)] text-[11px] font-bold text-[color:var(--color-ink-soft)]"
          >
            {p.user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="hidden truncate lg:inline">
            {p.user.name}
            <span className="hidden xl:inline">{` · ${t(ROLE_KEY[p.user.role])}`}</span>
          </span>
        </span>
      )}
    </div>
  );

  if (p.wide === false) return mobile;
  if (p.wide === null) return mobile; // ก่อน mount: เรนเดอร์หัวมือถือ (md:hidden) — จอใหญ่ไม่เห็นอะไรจนกว่าจะรู้ช่อง
  if (!looked) return null;
  return slot ? createPortal(desktop(false), slot) : desktop(true);
}
