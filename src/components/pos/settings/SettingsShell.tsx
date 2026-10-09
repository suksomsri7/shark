"use client";

// SettingsShell.tsx — โครงหน้า /pos/settings (POS P1.10 U · มติ CD1 · ภาพ 17A/17B): เมนูซ้าย 240 (พื้น surface-2 · ขอบขวา) + เนื้อหา
//   เมนู = POS_SETTINGS_TABS (ทะเบียนเดียว) · แท็บ live = ลิงก์ ?tab= · แท็บที่ยังไม่เปิด = จาง + "รอบถัดไป" ไม่มีลิงก์ (P1.18 เติม)
//   390 = เมนูเป็นแถบเลื่อนแนวนอนเหนือเนื้อหา · หลายสาขา = ตัวเลือกสาขาบนหัวเมนู (เครื่อง/เลขเครื่องเป็นรายสาขา)
// 🔴 หมายเหตุท้ายเมนูของภาพ ("ตั้งค่าเป็นรายสาขา … ค่ารวม ทั่วไป") ตัดออก — ค่าตั้งวันนี้เป็นรายระบบ POS ไม่มีค่าแทนรายสาขา (บันทึกใน wo-notes)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { POS_SETTINGS_TABS, posSettingsHref, type PosSettingsTabKey } from "./settings-tabs";

type Unit = { id: string; name: string };
type Props = { systemId: string; active: PosSettingsTabKey; units: Unit[]; unitId: string; children: ReactNode };

export function SettingsShell({ systemId, active, units, unitId, children }: Props) {
  const t = useTranslations("pos.settings");
  const router = useRouter();
  return (
    <div data-testid="pos-settings-root" className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border bg-[color:var(--color-surface)] md:flex-row">
      <aside className="flex min-w-0 shrink-0 flex-col gap-2 border-b bg-[color:var(--color-surface-2)] px-3 py-3 md:w-[200px] md:border-b-0 md:border-r md:py-[14px] lg:w-[240px]">
        <div className="flex items-center gap-2 px-2 md:flex-col md:items-stretch">
          <span className="text-[12px] font-semibold text-[color:var(--color-muted)]">{t("menuTitle")}</span>
          {units.length > 1 && (
            <select
              data-testid="pos-settings-unit"
              aria-label={t("unit")}
              className="input ml-auto h-11 min-w-0 max-w-[60%] text-[13px] md:ml-0 md:max-w-none"
              value={unitId}
              onChange={(e) => router.push(posSettingsHref(systemId, active, e.target.value))}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <nav aria-label={t("menuTitle")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
          {POS_SETTINGS_TABS.map((tab) =>
            tab.live ? (
              <Link
                key={tab.key}
                data-testid={`pos-settings-nav-${tab.key}`}
                href={posSettingsHref(systemId, tab.key, unitId)}
                aria-current={tab.key === active ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-[10px] whitespace-nowrap rounded-[9px] px-3 text-[14px] md:rounded-l-none md:rounded-r-[7px] md:border-l-2 ${
                  tab.key === active
                    ? "bg-[color:var(--color-surface)] font-semibold text-[color:var(--color-ink)] md:border-[color:var(--color-accent)]"
                    : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface)] md:border-transparent"
                }`}
              >
                <RegisterIcon name={tab.icon} size={15} />
                {t(`tabs.${tab.msg}`)}
              </Link>
            ) : (
              <span
                key={tab.key}
                data-testid={`pos-settings-nav-soon-${tab.key}`}
                aria-disabled="true"
                className="flex min-h-11 shrink-0 items-center gap-[10px] whitespace-nowrap rounded-[9px] px-3 text-[14px] text-[color:var(--color-muted)] opacity-70 md:border-l-2 md:border-transparent"
              >
                <RegisterIcon name={tab.icon} size={15} />
                <span className="min-w-0 truncate">{t(`tabs.${tab.msg}`)}</span>
                <span className="ml-auto rounded-full border px-2 text-[10.5px] leading-[18px]">{t("soon")}</span>
              </span>
            ),
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:gap-8 md:px-6 md:py-[22px] xl:px-8">{children}</div>
    </div>
  );
}
