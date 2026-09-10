// MembersTable.tsx — ตารางสมาชิก 10 คอลัมน์ + bulk + ส่งออก (M1.5 · ภาพ 01)
// testid: members-table · members-row-{id} · members-bulk · members-export
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { TierChip } from "./TierChip";
import type { MemberListRow, ListMembersOptions } from "@/lib/modules/member/list";
import { bulkSetTagsAction, exportMembersAction } from "@/lib/modules/member/members-list-actions";

export type MembersListColumn = { key: string; label: string };

function thaiBaht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function relativeThai(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day <= 0) return "วันนี้";
  if (day === 1) return "เมื่อวาน";
  if (day < 7) return `${day} วันที่แล้ว`;
  if (day < 30) return `${Math.floor(day / 7)} สัปดาห์ที่แล้ว`;
  if (day < 365) return `${Math.floor(day / 30)} เดือนที่แล้ว`;
  return `${Math.floor(day / 365)} ปีที่แล้ว`;
}

export function MembersTable({
  systemId,
  rows,
  extraColumns,
  canBulkEdit,
  canExport,
  currentFilters,
}: {
  systemId: string;
  rows: MemberListRow[];
  /** คอลัมน์เพิ่มจากฟิลด์กำหนดเอง (showInList) — วนจาก layout ของร้านนั้นจริง ไม่ฮาร์ดโค้ด */
  extraColumns: MembersListColumn[];
  canBulkEdit: boolean;
  canExport: boolean;
  currentFilters: ListMembersOptions;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagDraft, setTagDraft] = useState("");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  const applyTag = () => {
    const tag = tagDraft.trim();
    if (!tag || selected.size === 0) return;
    startTransition(async () => {
      const res = await bulkSetTagsAction({ systemId, ids: [...selected], add: [tag], remove: [] });
      setMessage(res.ok ? `ตั้งแท็ก "${tag}" ให้ ${res.data.updated} คน (ข้าม ${res.data.skipped} คนที่มองไม่เห็น)` : res.reason);
      if (res.ok) setTagDraft("");
    });
  };

  const exportAll = () => {
    startTransition(async () => {
      const columns = ["memberCode", "name", "phone", "tier", "spent12m", "visits12m", "points", "tags", ...extraColumns.map((c) => c.key)];
      const res = await exportMembersAction({ systemId, filters: currentFilters, columns });
      if (!res.ok) {
        setMessage(res.reason);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "สมาชิก.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  if (rows.length === 0) {
    return <EmptyState text="ไม่มีสมาชิกตรงกับตัวกรองนี้" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div data-testid="members-bulk" className="flex flex-wrap items-center gap-2 rounded-xl border p-2" style={{ borderColor: "var(--color-line)" }}>
        <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>เลือกอยู่ {selected.size} คน</span>
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          placeholder="ตั้งแท็ก…"
          className="input"
          style={{ width: 140 }}
          disabled={!canBulkEdit || selected.size === 0}
        />
        <button type="button" className="btn btn-ghost text-sm" onClick={applyTag} disabled={busy || !canBulkEdit || selected.size === 0}>
          แท็ก
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ออก voucher — เร็ว ๆ นี้ (M2.5)">
          ออก voucher
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ให้แต้ม — เร็ว ๆ นี้ (M2.2)">
          ให้แต้ม
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ส่งข้อความ — เร็ว ๆ นี้ (M3.2)">
          ส่งข้อความ
        </button>
        <span className="flex-1" />
        <button type="button" data-testid="members-export" className="btn btn-ghost text-sm" onClick={exportAll} disabled={!canExport || busy}>
          ส่งออก CSV
        </button>
      </div>
      {message && (
        <p data-testid="members-bulk-message" style={{ fontSize: 12, color: "var(--color-muted)" }}>
          {message}
        </p>
      )}

      {/* มือถือ ≤ 390: ตารางเป็นการ์ด 2 บรรทัด (§3.1) — ซ่อนที่จอกว้าง ใช้ตารางจริงแทน */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => (
          <label
            key={r.id}
            data-testid={`members-row-card-${r.id}`}
            className="flex items-start gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--color-line)" }}
          >
            <input type="checkbox" aria-label={`เลือก ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />
            <Link href={`/app/sys/${systemId}/member/members/${r.id}`} className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.name}</span>
                {r.tier && <TierChip name={r.tier.name} color={r.tier.color} />}
              </div>
              <div className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                {r.memberCode} · {r.phoneMasked} · ฿{thaiBaht(r.spent12mSatang)} · {r.points.toLocaleString("th-TH")} แต้ม
              </div>
            </Link>
          </label>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border sm:block" style={{ borderColor: "var(--color-line)" }}>
        <table data-testid="members-table" className="w-full border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th className="border-b px-2 py-2 text-left">
                <input type="checkbox" aria-label="เลือกทั้งหมด" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
              </th>
              <Th>รหัส</Th>
              <Th>ชื่อ</Th>
              <Th>ระดับ</Th>
              <Th align="right">ยอด 12 เดือน</Th>
              <Th align="right">ครั้ง</Th>
              <Th>มาล่าสุด</Th>
              <Th align="right">แต้ม</Th>
              <Th align="right">voucher</Th>
              <Th>แท็ก</Th>
              {extraColumns.map((c) => (
                <Th key={c.key}>{c.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`members-row-${r.id}`}>
                <td className="border-b px-2 py-2">
                  <input type="checkbox" aria-label={`เลือก ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="border-b px-3 py-2 text-sm">
                  <Link href={`/app/sys/${systemId}/member/members/${r.id}`} style={{ color: "var(--color-accent)" }}>
                    {r.memberCode}
                  </Link>
                </td>
                <td className="border-b px-3 py-2 text-sm">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                    {r.phoneMasked}
                  </div>
                  {r.upgradeHint && (
                    <div className="truncate text-xs font-semibold" style={{ color: "var(--color-accent)" }}>
                      อีก ฿{Math.round(r.upgradeHint.shortfallSatang / 100).toLocaleString("th-TH")} เลื่อน {r.upgradeHint.nextTierName}
                    </div>
                  )}
                </td>
                <td className="border-b px-3 py-2 text-sm">{r.tier ? <TierChip name={r.tier.name} color={r.tier.color} /> : "—"}</td>
                <td className="border-b px-3 py-2 text-right text-sm tabular-nums">฿{thaiBaht(r.spent12mSatang)}</td>
                <td className="border-b px-3 py-2 text-right text-sm tabular-nums">{r.visits12m}</td>
                <td className="border-b px-3 py-2 text-sm">{relativeThai(r.lastActivityAt)}</td>
                <td className="border-b px-3 py-2 text-right text-sm tabular-nums">{r.points.toLocaleString("th-TH")}</td>
                <td className="border-b px-3 py-2 text-right text-sm tabular-nums">—</td>
                <td className="border-b px-3 py-2 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {r.tags.length === 0 ? "—" : r.tags.map((t) => <StatusChip key={t} value={t} />)}
                  </div>
                </td>
                {extraColumns.map((c) => (
                  <td key={c.key} className="border-b px-3 py-2 text-sm">
                    {r.listFields[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`border-b px-3 pb-2 pt-2 text-xs font-medium ${align === "right" ? "text-right" : "text-left"}`} style={{ color: "var(--color-muted)" }}>
      {children}
    </th>
  );
}

export default MembersTable;
