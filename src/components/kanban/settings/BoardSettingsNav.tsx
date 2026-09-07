// BoardSettingsNav.tsx — เมนูซ้ายของ "ตั้งค่าบอร์ด" (K2.5 · ภาพ 10) — เซิร์ฟเวอร์ล้วน (ลิงก์ธรรมดา)
// สถานะ "เปิดอยู่" มาจาก URL (`[tab]`) ไม่ใช่ state ในเบราว์เซอร์ — แบบเดียวกับ `SettingsNav` (account-v2)

import Link from "next/link";
import { KanbanIcon } from "../KanbanIcon";
import { ArchiveBoardButton } from "./ArchiveBoardButton";

export const BOARD_SETTINGS_TABS = ["general", "members", "labels", "fields", "views", "automation", "archive"] as const;
export type BoardSettingsTab = (typeof BOARD_SETTINGS_TABS)[number];

const TAB_META: { key: BoardSettingsTab; label: string; icon: string; soon?: string }[] = [
  { key: "general", label: "ทั่วไป", icon: "gear" },
  { key: "members", label: "สมาชิกและสิทธิ์", icon: "users" },
  { key: "labels", label: "ป้ายกำกับ", icon: "tag" },
  { key: "fields", label: "ฟิลด์กำหนดเอง", icon: "list" },
  { key: "views", label: "มุมมองที่บันทึกไว้", icon: "grid" },
  { key: "automation", label: "อัตโนมัติ", icon: "spark", soon: "K2.9" },
  { key: "archive", label: "คลังเก็บ", icon: "box" },
];

export function BoardSettingsNav({ systemId, boardId, active }: { systemId: string; boardId: string; active: BoardSettingsTab }) {
  const base = `/app/sys/${systemId}/kanban/b/${boardId}/settings`;
  return (
    <nav data-testid="board-settings-nav" className="card flex w-full shrink-0 flex-col gap-0.5 p-2 md:w-[240px]" aria-label="หมวดตั้งค่าบอร์ด">
      {TAB_META.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${base}/${t.key}`}
            data-testid={`board-settings-tab-${t.key}`}
            aria-current={on ? "page" : undefined}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              background: on ? "var(--color-surface-2)" : "transparent",
              color: on ? "var(--color-ink)" : "var(--color-ink-soft)",
              fontWeight: on ? 600 : 400,
            }}
          >
            <KanbanIcon name={t.icon} size="xs" />
            <span className="flex-1">{t.label}</span>
            {t.soon && (
              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 999, border: "1px solid var(--color-line)", color: "var(--color-muted)" }}>
                เร็ว ๆ นี้
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
        <ArchiveBoardButton systemId={systemId} boardId={boardId} />
      </div>
    </nav>
  );
}

export default BoardSettingsNav;
