"use client";

// KdsTopBar.tsx — แถบบนของจอครัว (POS P2.6U · ภาพ 04 · มติ 2): ‹ กลับ · ชื่อร้าน · ชิปสาขา · ชิปเครื่อง "จอครัว · <ชื่อเครื่อง>" · นาฬิกา (หลัง mount) ·
//   ชิปกะ "กะ #N · <เครื่อง>" (เฉพาะเมื่อเครื่องนี้มีกะเปิด — ตัวอ่านเดียวกับหัวหน้าขาย registerStatusAction) · อักษรแรกของผู้ใช้ · ไม่มีอย่างอื่น
//   md+ = portal เข้าช่อง #app-topbar-slot ของแถบบนแอป (แบบ RegisterTopContext) · ไม่พบช่อง/มือถือ = แถวในหน้า
//   🔴 ชื่อร้าน/สาขา/เครื่อง/ผู้ใช้ = ข้อมูล ไม่แปล · ไม่มีข้อความไทยในไฟล์ (ST7)

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

export type KdsTopBarProps = {
  systemId: string;
  tenantName: string;
  units: { id: string; name: string }[];
  activeUnitId: string;
  /** ชื่อเครื่องที่ลงทะเบียนของเบราว์เซอร์นี้ (null = ยังไม่ลงทะเบียน) */
  deviceName: string | null;
  /** "HH:MM" หลัง mount (null = ยังไม่วาด) */
  clock: string | null;
  shift: { no: number; device: string | null } | null;
  userName: string;
};

function UnitChip({ p, mobile }: { p: KdsTopBarProps; mobile: boolean }) {
  const t = useTranslations("pos.kds");
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
  const name = p.units.find((u) => u.id === p.activeUnitId)?.name ?? "";
  const chip = `inline-flex h-8 min-w-0 max-w-[200px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[13px] text-[color:var(--color-ink-soft)] ${mobile ? "max-w-[40%]" : ""}`;
  if (p.units.length <= 1)
    return (
      <span className={chip} data-testid="pos-kds-unit" title={name}>
        <span className="truncate">{name}</span>
      </span>
    );
  return (
    <div ref={box} className="relative flex min-w-0">
      <button type="button" className={`${chip} hover:bg-[color:var(--color-surface-2)]`} data-testid="pos-kds-unit" aria-haspopup="menu" aria-expanded={open} aria-label={`${t("unit")}: ${name}`} onClick={() => setOpen((o) => !o)}>
        <span className="truncate">{name}</span>
        <RegisterIcon name="chevron" size={12} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl">
          {p.units.map((u) => (
            <Link
              key={u.id}
              role="menuitem"
              data-testid={`pos-kds-unit-option-${u.id}`}
              href={`/app/sys/${p.systemId}/pos/kds?unit=${encodeURIComponent(u.id)}`}
              aria-current={u.id === p.activeUnitId ? "true" : undefined}
              className={`flex h-11 items-center rounded-[8px] px-2.5 text-[14px] hover:bg-[color:var(--color-surface-2)] ${u.id === p.activeUnitId ? "font-bold" : ""}`}
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

export function KdsTopBar(p: KdsTopBarProps) {
  const t = useTranslations("pos.kds");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [looked, setLooked] = useState(false);
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("app-topbar-slot"));
    setLooked(true);
    const m = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const initial = p.userName.trim().charAt(0).toUpperCase() || "?";
  const bar = (inline: boolean) => (
    <div
      data-testid="pos-kds-topbar"
      className={`flex min-w-0 flex-1 items-center gap-3 ${inline ? "h-14 shrink-0 border-b bg-[color:var(--color-surface)] px-4 lg:px-5" : ""}`}
    >
      <Link
        href={`/app/sys/${p.systemId}`}
        data-testid="pos-kds-back"
        className="grid size-11 shrink-0 place-items-center rounded-[10px] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
        aria-label={t("back")}
        title={t("back")}
      >
        <RegisterIcon name="back" size={18} />
      </Link>
      <b className="hidden min-w-0 shrink truncate text-[16px] md:inline">{p.tenantName}</b>
      <UnitChip p={p} mobile={!wide} />
      <span data-testid="pos-kds-device" className="hidden h-8 min-w-0 max-w-[260px] items-center rounded-[8px] border px-2.5 text-[13px] text-[color:var(--color-ink-soft)] sm:inline-flex">
        <span className="truncate">{p.deviceName ? t("deviceChip", { device: p.deviceName }) : t("deviceChipPlain")}</span>
      </span>
      <span className="flex-1" />
      {p.clock !== null && (
        <span data-testid="pos-kds-clock" className="shrink-0 text-[13px] font-bold tabular-nums text-[color:var(--color-ink-soft)]">
          {p.clock}
        </span>
      )}
      {p.shift && (
        <span data-testid="pos-kds-shift" className="hidden h-8 shrink-0 items-center gap-1.5 rounded-[8px] border-[1.5px] border-[color:var(--color-ink)] px-2.5 text-[13px] font-bold text-[color:var(--color-ink)] lg:inline-flex">
          <RegisterIcon name="clock" size={12} />
          {p.shift.device ? t("shift", { no: p.shift.no, device: p.shift.device }) : t("shiftNoDevice", { no: p.shift.no })}
        </span>
      )}
      <span aria-label={p.userName} title={p.userName} className="grid size-7 shrink-0 place-items-center rounded-[7px] border bg-[color:var(--color-surface-2)] text-[11px] font-bold text-[color:var(--color-ink-soft)]">
        {initial}
      </span>
    </div>
  );
  if (!looked) return null;
  if (wide === false || !slot) return bar(true);
  return createPortal(bar(false), slot);
}
