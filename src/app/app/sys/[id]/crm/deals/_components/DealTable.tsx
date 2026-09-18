"use client";

// DealTable.tsx — มุมมองตารางของดีล + คำสั่งกลุ่ม (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.2 "bulk: โอน · แท็ก · ย้ายขั้น · ส่งออก")
// 🔴 AUDIT-CLASS X9: ย้ายขั้น/โอนเป็นกลุ่ม = ติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร · ครั้งละ ≤ 200 ดีล (บริการตรวจซ้ำ) · แท็ก/ส่งออกไม่ต้องยืนยัน
// มือถือ: แถวเป็นการ์ด (ไม่มีตารางกว้างเกินจอ)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { bulkMoveAction, bulkReassignAction, bulkTagAction, exportDealsAction } from "@/lib/modules/crm/deals-actions";
import { DEAL_BULK_MAX, DEAL_REASON_MIN, FORECAST_CATEGORY_LABEL, formatBaht, formatThaiDay, type DealListInput, type DealListRow } from "@/lib/modules/crm/deals-shared";

export function DealTable({
  systemId,
  rows,
  stages,
  owners,
  filters,
}: {
  systemId: string;
  rows: DealListRow[];
  stages: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  filters: DealListInput;
}) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/deals`;
  const [picked, setPicked] = useState<string[]>([]);
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [tag, setTag] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const all = rows.length > 0 && picked.length === rows.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const needDanger = (): string | null => {
    if (picked.length === 0) return "ติ๊กเลือกดีลก่อน";
    if (picked.length > DEAL_BULK_MAX) return `ทำเป็นกลุ่มได้ครั้งละไม่เกิน ${DEAL_BULK_MAX} ดีล`;
    if (!confirm) return "ติ๊กช่องยืนยันก่อน";
    if (reason.trim().length < DEAL_REASON_MIN) return `ใส่เหตุผลอย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร`;
    return null;
  };

  const done = (r: { ok: true; done: number; failed: number } | { ok: false; error: string }, what: string) => {
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: r.failed === 0, text: `${what}สำเร็จ ${r.done.toLocaleString("th-TH")} ดีล${r.failed ? ` · ไม่สำเร็จ ${r.failed.toLocaleString("th-TH")} ดีล (ดูเหตุผลที่หน้าดีลนั้น)` : ""}` });
    setPicked([]);
    setConfirm(false);
    setReason("");
    router.refresh();
  };

  const doMove = async () => {
    const p = needDanger() ?? (stageId ? null : "เลือกขั้นปลายทางก่อน");
    if (p) return setMsg({ ok: false, text: p });
    setBusy(true);
    done(await bulkMoveAction(systemId, { ids: picked, stageId, confirm, reason: reason.trim() }), "ย้ายขั้น");
  };
  const doReassign = async () => {
    const p = needDanger();
    if (p) return setMsg({ ok: false, text: p });
    setBusy(true);
    done(await bulkReassignAction(systemId, { ids: picked, ownerUserId: ownerId || null, confirm, reason: reason.trim() }), "โอนผู้ดูแล");
  };
  const doTag = async () => {
    if (picked.length === 0) return setMsg({ ok: false, text: "ติ๊กเลือกดีลก่อน" });
    if (!tag.trim()) return setMsg({ ok: false, text: "ใส่แท็กก่อน" });
    setBusy(true);
    done(await bulkTagAction(systemId, { ids: picked, tag: tag.trim() }), "ติดแท็ก");
  };
  const doExport = async () => {
    setBusy(true);
    const r = await exportDealsAction(systemId, filters);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const blob = new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="deal-table">
      <div className="card flex flex-col gap-2 p-3 text-sm" data-testid="deal-bulk-bar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">เลือกแล้ว {picked.length.toLocaleString("th-TH")} ดีล</span>
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void doExport()} data-testid="deal-export-btn">
            ส่งออก CSV
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ย้ายไปขั้น</span>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input text-sm" data-testid="deal-bulk-stage">
              <option value="">— เลือกขั้น —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>โอนให้</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input text-sm" data-testid="deal-bulk-owner">
              <option value="">ไม่มีผู้ดูแล</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] lg:col-span-2">
            <span>เหตุผล (ย้ายขั้น/โอน · อย่างน้อย {DEAL_REASON_MIN} ตัวอักษร)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" data-testid="deal-bulk-reason" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="deal-bulk-confirm" />
            ยืนยันทำกับดีลที่เลือก
          </label>
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void doMove()} data-testid="deal-bulk-move">
            ย้ายขั้น
          </button>
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void doReassign()} data-testid="deal-bulk-reassign">
            โอนผู้ดูแล
          </button>
          <span className="flex items-center gap-1">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="แท็ก" aria-label="แท็กที่จะติด" className="input w-28 text-sm" data-testid="deal-bulk-tag-input" />
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void doTag()} data-testid="deal-bulk-tag">
              ติดแท็ก
            </button>
          </span>
        </div>
        {msg && (
          <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="deal-bulk-msg">
            {msg.text}
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_110px_110px_110px_120px] gap-2 border-b px-3 py-2 text-xs font-semibold text-[color:var(--color-muted)] md:grid">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? [] : rows.map((r) => r.id))} aria-label="เลือกทั้งหมด" data-testid="deal-check-all" />
          <span>ดีล</span>
          <span>ขั้น</span>
          <span className="text-right">มูลค่า</span>
          <span>ปิดคาด</span>
          <span>หมวด</span>
          <span>ผู้ดูแล</span>
        </div>
        {rows.length === 0 && <p className="p-4 text-sm text-[color:var(--color-muted)]">ไม่มีดีลที่ตรงกับตัวกรอง — ลองล้างตัวกรอง</p>}
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 px-3 py-2 text-sm md:grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_110px_110px_110px_120px] md:items-center">
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`เลือกดีล ${r.title}`} data-testid={`deal-row-check-${r.id}`} />
              <span className="flex min-w-0 flex-col">
                <Link href={`${base}/${r.id}`} className="break-words font-medium hover:underline" data-testid={`deal-row-link-${r.id}`}>
                  {r.title}
                </Link>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {r.companyName ?? r.contactName}
                  {r.stale ? " · นิ่ง" : ""}
                  <span className="md:hidden">
                    {" "}
                    · {r.stageName} · {formatBaht(r.valueSatang)} · ปิดคาด {formatThaiDay(r.expectedCloseAt)}
                  </span>
                </span>
              </span>
              <span className="hidden truncate md:block">{r.stageName}</span>
              <span className="hidden text-right md:block">{formatBaht(r.valueSatang)}</span>
              <span className="hidden md:block">{formatThaiDay(r.expectedCloseAt)}</span>
              <span className="hidden md:block">{FORECAST_CATEGORY_LABEL[r.forecastCategory]}</span>
              <span className="hidden truncate md:block">{r.ownerName ?? "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
