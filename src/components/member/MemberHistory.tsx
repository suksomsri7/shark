// MemberHistory.tsx — แท็บ "ประวัติ" ในหน้าสมาชิก 360 (M3.7 · ภาพ ledger/design-member/08-history-review-referral.png ซ้าย/กลาง)
//   บน  : การ์ดตัวกรอง — "ชนิด:" ชิป ทั้งหมด + 9 ชนิด (มีจำนวน) · ช่วงเวลา · สาขา       (testid member-history-filter)
//   ล่าง: การ์ด "ไทม์ไลน์" — ไอคอนวงกลมสีตามชนิด · หัวเรื่อง (ลิงก์ไปต้นทาง) · รายละเอียด · เวลา · "โหลดเพิ่ม"
//
// 🔴 'use client' — import ได้เฉพาะไฟล์บริสุทธิ์ (`history-kinds.ts`) + server action (`history-actions.ts`)
//    ห้าม import `@/lib/modules/member` / `history.ts` (ลากถึง prisma → next build พัง · บทเรียน M3.1)
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์/สีตายตัว — ไอคอน MemberIcon · สีผ่านโทเคน `--color-tag-*`
// 🔴 ลิงก์ต้นทางใช้ prefetch={false}: แถวอ้างของที่อาจถูกลบไปแล้ว (บิล/การ์ด) — prefetch 404 = console error
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MemberIcon } from "./MemberIcon";
import { memberHistoryAction } from "@/lib/modules/member/history-actions";
import {
  HISTORY_KINDS,
  HISTORY_RANGES,
  iconOf,
  toneOf,
  type HistoryCounts,
  type HistoryKindFilter,
  type HistoryKindKey,
  type HistoryPageView,
  type HistoryRangeKey,
  type HistoryRowView,
  type HistoryUnitOption,
} from "@/lib/modules/member/history-kinds";

const MUTED = { color: "var(--color-muted)" } as const;

/**
 * ป้ายของชิป (ข้อความบนจอ) — ลำดับ/ไอคอน/สีมาจาก `HISTORY_KINDS` (ทะเบียนเดียวกับ server)
 * ชนิดของ map บังคับครบทุก key (เพิ่มชนิดใหม่ที่ทะเบียนแล้วลืมตั้งป้าย = tsc แดง)
 */
const CHIP_LABEL = {
  purchase: "ซื้อ",
  booking: "จอง",
  chat: "แชท",
  document: "เอกสาร",
  tier: "ระดับ",
  loyalty: "แต้ม/สิทธิ์",
  task: "งาน",
  review: "รีวิว/แนะนำ",
  profile: "โปรไฟล์",
} as const satisfies Record<HistoryKindKey, string>;

const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "9 ก.ย. 14:20" (ปีนี้) · "9 ก.ย. 68 14:20" (ปีอื่น) — เวลาไทยเสมอ ไม่ขึ้นกับเครื่องผู้ดู */
function thaiWhen(iso: string): string {
  const bkk = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const nowBkk = new Date(Date.now() + 7 * 3_600_000);
  const hh = String(bkk.getUTCHours()).padStart(2, "0");
  const mm = String(bkk.getUTCMinutes()).padStart(2, "0");
  const year = bkk.getUTCFullYear() !== nowBkk.getUTCFullYear() ? ` ${String((bkk.getUTCFullYear() + 543) % 100).padStart(2, "0")}` : "";
  return `${bkk.getUTCDate()} ${THAI_MONTH[bkk.getUTCMonth()]}${year} ${hh}:${mm}`;
}

function toneVar(row: { module: string; type: string }): string {
  return `var(--color-tag-${toneOf(row)})`;
}

function Chip({
  id,
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  id: string;
  label: string;
  count: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`member-history-chip-${id}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
      style={
        active
          ? { borderColor: "var(--color-ink)", color: "var(--color-ink)", fontWeight: 600, borderWidth: 1.5 }
          : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
      }
    >
      <span>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.8 }}>{count.toLocaleString("th-TH")}</span>
    </button>
  );
}

function Row({ row }: { row: HistoryRowView }) {
  const color = toneVar(row);
  const details = [row.summary, row.unitName && !row.summary.includes(row.unitName) ? row.unitName : null, row.actorName ? `โดย ${row.actorName}` : null]
    .filter((x): x is string => !!x)
    .join(" · ");
  return (
    <li data-testid={`member-history-row-${row.id}`} className="flex min-w-0 gap-3 border-b py-3 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: 30, height: 30, border: `1.5px solid ${color}`, color }}
      >
        <MemberIcon name={iconOf(row)} size="sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {row.href ? (
              <Link href={row.href} prefetch={false} className="break-words font-semibold hover:underline" style={{ fontSize: 13.5 }}>
                {row.title}
              </Link>
            ) : (
              <span className="break-words font-semibold" style={{ fontSize: 13.5 }}>
                {row.title}
              </span>
            )}
            {row.badge && (
              <span className="inline-flex items-center rounded-md border px-1.5 py-px text-xs" style={{ borderColor: "var(--color-line)", ...MUTED }}>
                {row.badge}
              </span>
            )}
          </div>
          <time dateTime={row.at} className="shrink-0 text-xs" style={MUTED}>
            {thaiWhen(row.at)}
          </time>
        </div>
        {details && (
          <p className="break-words text-xs" style={MUTED}>
            {details}
          </p>
        )}
      </div>
    </li>
  );
}

export function MemberHistory({
  systemId,
  memberId,
  initial,
  units,
  initialRange,
}: {
  systemId: string;
  memberId: string;
  initial: HistoryPageView;
  units: HistoryUnitOption[];
  initialRange: HistoryRangeKey;
}) {
  const [kind, setKind] = useState<HistoryKindFilter>("all");
  const [range, setRange] = useState<HistoryRangeKey>(initialRange);
  const [unitId, setUnitId] = useState<string>("");
  const [items, setItems] = useState<HistoryRowView[]>(initial.items);
  const [counts, setCounts] = useState<HistoryCounts>(initial.counts);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (next: { kind: HistoryKindFilter; range: HistoryRangeKey; unitId: string }, more: boolean) => {
    setError(null);
    start(async () => {
      const r = await memberHistoryAction(systemId, memberId, {
        kind: next.kind,
        range: next.range,
        unitId: next.unitId || null,
        cursor: more ? cursor : null,
      });
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      setItems((prev) => (more ? [...prev, ...r.data.items.filter((i) => !prev.some((p) => p.id === i.id))] : r.data.items));
      setCounts(r.data.counts);
      setCursor(r.data.nextCursor);
    });
  };

  const pick = (patch: Partial<{ kind: HistoryKindFilter; range: HistoryRangeKey; unitId: string }>) => {
    const next = { kind, range, unitId, ...patch };
    setKind(next.kind);
    setRange(next.range);
    setUnitId(next.unitId);
    load(next, false);
  };

  const total = kind === "all" ? counts.all : counts[kind];
  const rangeLabel = HISTORY_RANGES.find((r) => r.key === range)?.label ?? "";

  return (
    <div data-testid="member-history" className="flex min-w-0 flex-col gap-3">
      <div data-testid="member-history-filter" className="card grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="กรองประวัติตามชนิด">
          <span className="mr-1 text-xs" style={MUTED}>
            ชนิด:
          </span>
          <Chip id="all" label="ทั้งหมด" count={counts.all} active={kind === "all"} disabled={pending} onClick={() => pick({ kind: "all" })} />
          {HISTORY_KINDS.map((k) => (
            <Chip key={k.key} id={k.key} label={CHIP_LABEL[k.key]} count={counts[k.key]} active={kind === k.key} disabled={pending} onClick={() => pick({ kind: k.key })} />
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:w-[380px]">
          <select
            data-testid="member-history-range"
            aria-label="ช่วงเวลา"
            className="input min-w-0 text-sm"
            value={range}
            disabled={pending}
            onChange={(e) => pick({ range: e.target.value as HistoryRangeKey })}
          >
            {HISTORY_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            data-testid="member-history-unit"
            aria-label="สาขา"
            className="input min-w-0 text-sm"
            value={unitId}
            disabled={pending}
            onChange={(e) => pick({ unitId: e.target.value })}
          >
            <option value="">ทุกสาขา</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card flex min-w-0 flex-col p-4">
        <div className="flex flex-wrap items-baseline gap-2 pb-1">
          <span className="font-semibold">ไทม์ไลน์</span>
          <span className="text-xs" style={MUTED}>
            {items.length >= total ? `${total.toLocaleString("th-TH")} รายการล่าสุด` : `แสดง ${items.length.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} รายการ`}
            {pending ? " · กำลังโหลด…" : ""}
          </span>
        </div>
        {error && (
          <p role="alert" className="py-2 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <ul data-testid="member-history-list" className="flex min-w-0 flex-col">
          {items.length === 0 ? (
            <li data-testid="member-history-empty" className="py-8 text-center text-sm" style={MUTED}>
              {range === "all" && !unitId && kind === "all"
                ? "ยังไม่มีประวัติ — เมื่อลูกค้าซื้อ จอง หรือทักแชท รายการจะขึ้นที่นี่เอง"
                : `ยังไม่มีประวัติในช่วง${rangeLabel ? ` “${rangeLabel}”` : "ที่เลือก"} — ลองเปลี่ยนชนิด ช่วงเวลา หรือสาขา`}
            </li>
          ) : (
            items.map((row) => <Row key={row.id} row={row} />)
          )}
        </ul>
        {cursor && items.length > 0 && (
          <div className="flex justify-center pt-3">
            <button type="button" data-testid="member-history-more" className="btn btn-ghost text-sm" disabled={pending} onClick={() => load({ kind, range, unitId }, true)}>
              โหลดเพิ่ม
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MemberHistory;
