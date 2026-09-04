"use client";

// ReconcilePanel — หน้า "กระทบยอดธนาคาร" V2 (WO 5.3 · DESIGN-SPEC-V2 §10.2)
// เฟรมอ้างอิง: docs/design/account-v2/g10-bank-reconcile.png · checklist เต็มใน ledger/wo-notes/5.3.md
//
// โครงตาม g10: หัว (ช่องทาง + เดือน + นำเข้า CSV) → 4 ไทล์ → การ์ด "จับคู่รายการ"
// (ซ้าย statement · กลางปุ่ม ⇄ จับคู่ / สร้างรายการจากแถวนี้ / ข้าม · ขวารายการในระบบ)
// → "รายการที่กระทบยอดแล้ว" → แถบท้าย (เหลือรอจับคู่ n · tooltip · ยืนยันกระทบยอดเดือนนี้)
// มือถือ 390 (§13): ซ้อนแนวตั้ง — ลิสต์ statement ก่อน แตะแถว → bottom sheet แสดงรายการระบบที่เข้าคู่ได้
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "./Modal";
import { SlideOver } from "./SlideOver";
import { FinanceSubTabsBar } from "./FinanceSubTabsBar";
import { BankStatementImportModal } from "./BankStatementImportModal";
import type { FinanceSubTab } from "./FinancePanel";
import { formatBaht } from "@/lib/ui/money";
import type { ReconcilePageData, StatementLineView } from "@/lib/modules/account/reconcile";
import {
  manualMatchAction,
  unmatchAction,
  skipLineAction,
  createEntryFromLineAction,
  confirmMonthAction,
  reopenMonthAction,
} from "@/app/app/sys/[id]/account/finance/reconcile/actions";

const THAI_MONTH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// พื้นไฮไลต์คู่ที่แนะนำ/ที่เลือก (g10: ฟ้าอ่อน + เส้นน้ำเงินซ้าย) — โทนเดียวกับ --color-out ของแชท
const PICK_BG = "#eff4ff";

export function monthLabelShort(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  return `${THAI_MONTH_ABBR[m - 1] ?? periodKey} ${y}`;
}

function dayLabel(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const bkk = new Date(dt.getTime() + 7 * 3600 * 1000);
  return `${bkk.getUTCDate()} ${THAI_MONTH_ABBR[bkk.getUTCMonth()]}`;
}

function signed(satang: number): string {
  return (satang > 0 ? "+" : "") + formatBaht(satang, { decimals: true });
}

const STATUS_LABEL: Record<string, string> = {
  MATCHED: "จับคู่แล้ว",
  CREATED: "สร้างรายการแล้ว",
  SUGGESTED: "แนะนำจับคู่",
  UNMATCHED: "รอจับคู่",
  SKIPPED: "ข้ามแล้ว",
};

// ปุ่มที่กดไม่ได้ต้อง "ดูเหมือนกดไม่ได้" ด้วย (g10: ปุ่มยืนยันเป็นสีเทาจนกว่าส่วนต่างจะเป็น 0)
// globals.css ไม่มีสไตล์ :disabled กลาง ⇒ กำหนดที่นี่
const disabledStyle = { background: "var(--color-line)", color: "var(--color-muted)", cursor: "not-allowed" } as const;

function StatusChip({ status, testId }: { status: string; testId?: string }) {
  const accent = status === "SUGGESTED";
  return (
    <span
      className="inline-block shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs"
      style={
        accent
          ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
          : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
      }
      data-testid={testId}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ReconcilePanel({
  systemId,
  subTabs,
  data,
  channels,
  monthOptions,
  reconcilePath,
  importOpen,
  canReopen,
}: {
  systemId: string;
  subTabs: FinanceSubTab[];
  data: ReconcilePageData;
  channels: { id: string; label: string }[];
  monthOptions: string[];
  /** path ของหน้านี้ (`…/account/finance/reconcile`) — client ประกอบ query เอง
   * (ห้ามส่งฟังก์ชันข้ามเส้น server→client — props ต้อง serialize ได้) */
  reconcilePath: string;
  importOpen: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const s = data.summary;
  const hrefFor = (o: { channel?: string; month?: string; importOpen?: boolean }) => {
    const q = new URLSearchParams();
    q.set("channel", o.channel ?? s.financeId);
    q.set("month", o.month ?? s.periodKey);
    if (o.importOpen) q.set("import", "1");
    return `${reconcilePath}?${q.toString()}`;
  };
  const [pickedLineId, setPickedLineId] = useState<string | null>(
    () => data.statementLines.find((l) => l.status === "SUGGESTED")?.id ?? null,
  );
  const [pickedSystemId, setPickedSystemId] = useState<string | null>(
    () => data.statementLines.find((l) => l.status === "SUGGESTED")?.suggestedLineId ?? null,
  );
  const [sheetLineId, setSheetLineId] = useState<string | null>(null);
  const [createFor, setCreateFor] = useState<StatementLineView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const linesById = useMemo(() => new Map(data.statementLines.map((l) => [l.id, l])), [data.statementLines]);
  const picked = pickedLineId ? linesById.get(pickedLineId) ?? null : null;
  const sheetLine = sheetLineId ? linesById.get(sheetLineId) ?? null : null;

  const run = (fn: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      router.refresh();
    });
  };

  const pickStatementLine = (l: StatementLineView) => {
    setPickedLineId(l.id);
    setPickedSystemId(l.suggestedLineId ?? null);
  };

  const doMatch = (lineId: string, journalLineId: string) => run(() => manualMatchAction(systemId, lineId, journalLineId));
  const doSkip = (lineId: string) => run(() => skipLineAction(systemId, lineId));
  const doUnmatch = (lineId: string) => run(() => unmatchAction(systemId, lineId));

  const locked = s.confirmedAt != null;
  const pendingText =
    s.pendingCount > 0
      ? `เหลือรายการรอจับคู่ ${s.pendingCount} รายการ${pendingReasonText(data.statementLines)}`
      : s.hasStatement
        ? "จับคู่ครบทุกรายการแล้ว"
        : "ยังไม่ได้นำเข้ารายการเดินบัญชีของเดือนนี้";

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="reconcile-page">
      <PageHeader
        title="กระทบยอดธนาคาร"
        actions={
          <>
            <select
              className="input w-auto"
              value={s.financeId}
              onChange={(e) => router.push(hrefFor({ channel: e.target.value }))}
              aria-label="ช่องทาง"
              data-testid="reconcile-channel"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  ช่องทาง: {c.label}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={s.periodKey}
              onChange={(e) => router.push(hrefFor({ month: e.target.value }))}
              aria-label="เดือน"
              data-testid="reconcile-month"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  เดือน: {monthLabelShort(m)}
                </option>
              ))}
            </select>
            <Link href={hrefFor({ importOpen: true })} className="btn-sm" data-testid="reconcile-import-open">
              ⤓ นำเข้ารายการเดินบัญชี (CSV)
            </Link>
          </>
        }
      />
      <FinanceSubTabsBar subTabs={subTabs} />

      {err && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="reconcile-err">
          {err}
        </p>
      )}

      {/* ── 4 ไทล์ (g10) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="reconcile-tiles">
        <Tile
          label="ยอดตามรายการเดินบัญชี (statement)"
          value={s.statementBalanceSatang != null ? formatBaht(s.statementBalanceSatang, { decimals: true }) : "—"}
          sub={`${s.channel.bankName ?? s.channel.name} · ${monthLabelShort(s.periodKey)}`}
          testId="reconcile-tile-statement"
        />
        <Tile
          label="ยอดในระบบ"
          value={formatBaht(s.systemBalanceSatang, { decimals: true })}
          sub={`บัญชีแยกประเภท ${s.channel.ledgerCode}`}
          testId="reconcile-tile-system"
        />
        <Tile
          label="ส่วนต่าง"
          value={s.differenceSatang != null ? formatBaht(s.differenceSatang, { decimals: true }) : "—"}
          sub={s.differenceSatang === 0 ? "ตรงกันแล้ว" : "ยังไม่เท่ากัน · ต้องจับคู่เพิ่ม"}
          danger={s.differenceSatang != null && s.differenceSatang !== 0}
          testId="reconcile-tile-diff"
        />
        <Tile
          label="จับคู่แล้ว"
          value={`${s.matchedCount}/${s.totalCount}`}
          sub="รายการทั้งหมดในงวด"
          testId="reconcile-tile-matched"
        />
      </div>

      {!s.hasStatement ? (
        <EmptyState
          text={`ยังไม่ได้นำเข้ารายการเดินบัญชีของ ${s.channel.name} เดือน ${monthLabelShort(s.periodKey)} — กด "นำเข้ารายการเดินบัญชี (CSV)" เพื่อเริ่มกระทบยอด`}
          action={{ href: hrefFor({ importOpen: true }), label: "นำเข้ารายการเดินบัญชี (CSV)" }}
        />
      ) : (
        <section className="card flex flex-col gap-3" data-testid="reconcile-match-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">จับคู่รายการ</h2>
            <span className="text-xs text-[color:var(--color-muted)]" data-testid="reconcile-match-meta">
              แสดง {data.statementLines.length} จาก {s.totalCount} รายการ · เรียงตามวันที่ล่าสุด
            </span>
          </div>

          {locked && (
            <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }} data-testid="reconcile-locked">
              ยืนยันกระทบยอดเดือนนี้แล้ว — แก้การจับคู่ไม่ได้
              {canReopen && (
                <button
                  type="button"
                  className="ml-2 underline"
                  disabled={pending}
                  onClick={() => run(() => reopenMonthAction(systemId, s.financeId, s.periodKey))}
                  data-testid="reconcile-reopen"
                >
                  เปิดกลับเพื่อแก้ไข
                </button>
              )}
            </p>
          )}

          {/* ── เดสก์ท็อป: ซ้าย statement · กลางปุ่ม · ขวารายการในระบบ ── */}
          <div className="hidden gap-2 md:grid" style={{ gridTemplateColumns: "1fr 200px 1fr" }}>
            <div>
              <h3 className="pb-2 text-sm font-medium">รายการจากธนาคาร (statement)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                    <th className="px-2 py-2 font-medium">วันที่</th>
                    <th className="px-2 py-2 font-medium">รายละเอียด</th>
                    <th className="px-2 py-2 text-right font-medium">เข้า/ออก</th>
                    <th className="px-2 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody data-testid="reconcile-statement-rows">
                  {data.statementLines.map((l) => {
                    const active = l.id === pickedLineId;
                    return (
                      <tr
                        key={l.id}
                        className="cursor-pointer border-b last:border-0"
                        style={{
                          borderColor: "var(--color-line)",
                          background: active ? PICK_BG : undefined,
                          boxShadow: active ? "inset 3px 0 0 0 var(--color-accent)" : undefined,
                        }}
                        onClick={() => pickStatementLine(l)}
                        data-testid={`reconcile-line-${l.seq}`}
                      >
                        <td className="px-2 py-2.5 whitespace-nowrap">{dayLabel(l.txDate)}</td>
                        <td className="px-2 py-2.5">{l.description}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums" style={l.amountSatang < 0 ? { color: "var(--color-danger)" } : undefined}>
                          {signed(l.amountSatang)}
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusChip status={l.status} testId={`reconcile-line-status-${l.seq}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* คอลัมน์กลาง — ปุ่มทำรายการกับคู่ที่เลือก */}
            <div className="flex flex-col items-center justify-center gap-3 self-center" data-testid="reconcile-actions">
              {(() => {
                const matchDisabled = pending || locked || !picked || !pickedSystemId || picked.status === "MATCHED" || picked.status === "CREATED";
                const createDisabled = pending || locked || !picked || picked.status === "MATCHED" || picked.status === "CREATED";
                return (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary w-full justify-center"
                      style={matchDisabled ? disabledStyle : undefined}
                      disabled={matchDisabled}
                      onClick={() => picked && pickedSystemId && doMatch(picked.id, pickedSystemId)}
                      data-testid="reconcile-btn-match"
                    >
                      ⇄ จับคู่
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost w-full whitespace-normal text-center leading-snug"
                      style={{ borderColor: "var(--color-line)", ...(createDisabled ? { color: "var(--color-muted)", cursor: "not-allowed" } : null) }}
                      disabled={createDisabled}
                      onClick={() => picked && setCreateFor(picked)}
                      data-testid="reconcile-btn-create"
                    >
                      สร้างรายการจากแถวนี้ (ค่าธรรมเนียม/ดอกเบี้ย)
                    </button>
                  </>
                );
              })()}
              {picked && (picked.status === "MATCHED" || picked.status === "CREATED") ? (
                <button
                  type="button"
                  className="text-sm text-[color:var(--color-muted)] underline"
                  disabled={pending || locked || picked.status === "CREATED"}
                  onClick={() => doUnmatch(picked.id)}
                  data-testid="reconcile-btn-unmatch"
                >
                  ยกเลิกการจับคู่
                </button>
              ) : (
                <button
                  type="button"
                  className="text-sm text-[color:var(--color-muted)]"
                  disabled={pending || locked || !picked}
                  onClick={() => picked && doSkip(picked.id)}
                  data-testid="reconcile-btn-skip"
                >
                  ข้าม
                </button>
              )}
            </div>

            <div>
              <h3 className="pb-2 text-sm font-medium">รายการในระบบ</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                    <th className="px-2 py-2 font-medium">เอกสาร</th>
                    <th className="px-2 py-2 font-medium">รายละเอียด</th>
                    <th className="px-2 py-2 text-right font-medium">จำนวน</th>
                    <th className="px-2 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody data-testid="reconcile-system-rows">
                  {[...data.reconciledRows, ...data.systemRows]
                    .sort((a, b) => a.date.getTime() - b.date.getTime())
                    .map((r) => {
                      const active = r.lineId === pickedSystemId;
                      const suggested = picked?.suggestedLineId === r.lineId;
                      return (
                        <tr
                          key={r.lineId}
                          className={r.reconciled ? "border-b last:border-0" : "cursor-pointer border-b last:border-0"}
                          style={{
                            borderColor: "var(--color-line)",
                            background: active ? PICK_BG : undefined,
                            boxShadow: active ? "inset 3px 0 0 0 var(--color-accent)" : undefined,
                          }}
                          onClick={() => !r.reconciled && setPickedSystemId(r.lineId)}
                          data-testid={`reconcile-sys-${r.docNo}`}
                        >
                          <td className="px-2 py-2.5 whitespace-nowrap">
                            {r.documentHref ? (
                              <Link href={r.documentHref} style={{ color: "var(--color-accent)" }} onClick={(e) => e.stopPropagation()}>
                                {r.documentNo ?? r.docNo}
                              </Link>
                            ) : (
                              <span style={{ color: "var(--color-accent)" }}>{r.docNo}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <div>{r.label}</div>
                            <div className="text-xs text-[color:var(--color-muted)]">{dayLabel(r.date)}</div>
                            {suggested && picked?.suggestedHint && (
                              <div className="text-xs" style={{ color: "var(--color-accent)" }} data-testid="reconcile-suggest-hint">
                                {picked.suggestedHint}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums" style={r.amountSatang < 0 ? { color: "var(--color-danger)" } : undefined}>
                            {signed(r.amountSatang)}
                          </td>
                          <td className="px-2 py-2.5">
                            <StatusChip status={r.reconciled ? "MATCHED" : suggested ? "SUGGESTED" : "UNMATCHED"} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── มือถือ 390: ลิสต์ statement · แตะแถว → bottom sheet เลือกคู่ ── */}
          <ul className="flex flex-col gap-2 md:hidden" data-testid="reconcile-mobile-list">
            {data.statementLines.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border px-3 py-2 text-left"
                  style={{ borderColor: "var(--color-line)", background: l.status === "SUGGESTED" ? PICK_BG : undefined }}
                  onClick={() => {
                    pickStatementLine(l);
                    setSheetLineId(l.id);
                  }}
                  data-testid={`reconcile-m-line-${l.seq}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[color:var(--color-muted)]">{dayLabel(l.txDate)}</span>
                    <StatusChip status={l.status} />
                  </div>
                  <div className="truncate text-sm">{l.description}</div>
                  <div className="text-sm tabular-nums" style={l.amountSatang < 0 ? { color: "var(--color-danger)" } : undefined}>
                    {signed(l.amountSatang)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── รายการที่กระทบยอดแล้ว (§10.2) ── */}
      <section className="card flex flex-col gap-2" data-testid="reconcile-done-card">
        <h2 className="text-sm font-semibold">รายการที่กระทบยอดแล้ว</h2>
        {data.reconciledRows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="reconcile-done-empty">
            ยังไม่มีรายการที่กระทบยอดในเดือนนี้
          </p>
        ) : (
          <ul className="flex flex-col text-sm" data-testid="reconcile-done-rows">
            {data.reconciledRows.map((r) => (
              <li key={r.lineId} className="flex items-center gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--color-line)" }}>
                <span className="w-16 shrink-0 text-xs text-[color:var(--color-muted)]">{dayLabel(r.date)}</span>
                {/* มือถือ 390: date + เลขที่เอกสาร + จำนวนเงิน เท่านั้น — ยัดคำอธิบายด้วยจะเหลือ "ร้…" อ่านไม่ได้ทั้งคู่ */}
                <span style={{ color: "var(--color-accent)" }} className="min-w-0 flex-1 truncate sm:w-40 sm:flex-none">
                  {r.documentNo ?? r.docNo}
                </span>
                <span className="hidden min-w-0 flex-1 truncate sm:block">{r.label}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums" style={r.amountSatang < 0 ? { color: "var(--color-danger)" } : undefined}>
                  {signed(r.amountSatang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── แถบท้าย (g10) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="reconcile-footer">
        <span className="text-sm text-[color:var(--color-muted)]" data-testid="reconcile-pending-text">
          {pendingText}
        </span>
        <div className="flex items-center gap-3">
          {!s.canConfirm && !locked && s.confirmBlockReason && (
            <span
              className="relative rounded-lg px-3 py-1.5 text-xs"
              style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
              data-testid="reconcile-confirm-tip"
            >
              {s.confirmBlockReason}
              {/* หางฟองคำพูดชี้ลง (g10) — สี่เหลี่ยมหมุน 45° สีเดียวกับฟอง */}
              <i
                aria-hidden
                className="absolute left-1/2 block h-2 w-2 -translate-x-1/2 rotate-45"
                style={{ background: "var(--color-ink)", bottom: "-3px" }}
              />
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={pending || !s.canConfirm ? disabledStyle : undefined}
            disabled={pending || !s.canConfirm}
            onClick={() => run(() => confirmMonthAction(systemId, s.financeId, s.periodKey))}
            data-testid="reconcile-confirm"
          >
            ✓ {locked ? "ยืนยันกระทบยอดแล้ว" : "ยืนยันกระทบยอดเดือนนี้"}
          </button>
        </div>
      </div>

      {importOpen && (
        <BankStatementImportModal
          systemId={systemId}
          financeId={s.financeId}
          periodKey={s.periodKey}
          channelLabel={s.channel.name}
          monthLabel={monthLabelShort(s.periodKey)}
          onClose={() => router.push(hrefFor({}))}
        />
      )}

      {createFor && (
        <CreateEntryModal
          systemId={systemId}
          line={createFor}
          onClose={() => setCreateFor(null)}
          onDone={() => {
            setCreateFor(null);
            router.refresh();
          }}
        />
      )}

      {sheetLine && (
        <SlideOver open onClose={() => setSheetLineId(null)} title={`${dayLabel(sheetLine.txDate)} · ${signed(sheetLine.amountSatang)}`} testId="reconcile-sheet">
          <div className="flex flex-col gap-3">
            <p className="text-sm">{sheetLine.description}</p>
            <p className="text-xs text-[color:var(--color-muted)]">รายการในระบบที่เข้าคู่ได้ (ยอดตรงกัน)</p>
            <ul className="flex flex-col gap-2" data-testid="reconcile-sheet-candidates">
              {data.systemRows
                .filter((r) => r.amountSatang === sheetLine.amountSatang)
                .map((r) => (
                  <li key={r.lineId} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.documentNo ?? r.docNo}</div>
                      <div className="truncate text-xs text-[color:var(--color-muted)]">{r.label} · {dayLabel(r.date)}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending || locked}
                      onClick={() => {
                        doMatch(sheetLine.id, r.lineId);
                        setSheetLineId(null);
                      }}
                      data-testid={`reconcile-sheet-match-${r.docNo}`}
                    >
                      จับคู่
                    </button>
                  </li>
                ))}
              {data.systemRows.filter((r) => r.amountSatang === sheetLine.amountSatang).length === 0 && (
                <li className="text-sm text-[color:var(--color-muted)]">ไม่พบรายการในระบบที่ยอดตรงกัน — สร้างรายการจากแถวนี้ หรือข้าม</li>
              )}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost flex-1 justify-center" disabled={pending || locked} onClick={() => setCreateFor(sheetLine)} data-testid="reconcile-sheet-create">
                สร้างรายการจากแถวนี้
              </button>
              <button type="button" className="btn btn-ghost flex-1 justify-center" disabled={pending || locked} onClick={() => { doSkip(sheetLine.id); setSheetLineId(null); }} data-testid="reconcile-sheet-skip">
                ข้าม
              </button>
            </div>
          </div>
        </SlideOver>
      )}
    </div>
  );
}

/** ข้อความในวงเล็บของแถบท้าย (g10: "…3 รายการ (ค่าธรรมเนียม/ดอกเบี้ย/โอนเข้าไม่ระบุที่มา)") */
function pendingReasonText(lines: StatementLineView[]): string {
  const names = lines
    .filter((l) => l.status === "UNMATCHED" || l.status === "SUGGESTED")
    .slice(0, 3)
    .map((l) => l.description.trim())
    .filter(Boolean);
  return names.length > 0 ? ` (${names.join("/")})` : "";
}

function Tile({
  label,
  value,
  sub,
  danger,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
  testId: string;
}) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-2xl font-semibold tabular-nums" style={danger ? { color: "var(--color-danger)" } : undefined} data-testid={testId}>
        {value}
      </div>
      <div className="text-xs text-[color:var(--color-muted)]">{sub}</div>
    </div>
  );
}

function CreateEntryModal({
  systemId,
  line,
  onClose,
  onDone,
}: {
  systemId: string;
  line: StatementLineView;
  onClose: () => void;
  onDone: () => void;
}) {
  const outflow = line.amountSatang < 0;
  const [kind, setKind] = useState<"FEE" | "INTEREST" | "OTHER">(outflow ? "FEE" : "INTEREST");
  const [accountCode, setAccountCode] = useState("");
  const [note, setNote] = useState(line.description);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await createEntryFromLineAction(systemId, { lineId: line.id, kind, accountCode: accountCode.trim() || undefined, note });
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      onDone();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      sheetOnMobile
      testId="reconcile-create-modal"
      title="สร้างรายการจากแถวนี้"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={submit} data-testid="reconcile-create-submit">
            {pending ? "กำลังบันทึก…" : "บันทึกรายการ"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {dayLabel(line.txDate)} · {line.description} ·{" "}
          <span className="tabular-nums" style={outflow ? { color: "var(--color-danger)" } : undefined}>
            {signed(line.amountSatang)}
          </span>
        </p>
        <FormField label="ประเภทรายการ">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "FEE" | "INTEREST" | "OTHER")} data-testid="reconcile-create-kind">
            {outflow && <option value="FEE">ค่าธรรมเนียมธนาคาร (Dr ค่าธรรมเนียม / Cr เงินฝาก)</option>}
            {!outflow && <option value="INTEREST">ดอกเบี้ยรับ (Dr เงินฝาก / Cr ดอกเบี้ยรับ)</option>}
            <option value="OTHER">อื่น ๆ (เลือกผังบัญชีเอง)</option>
          </select>
        </FormField>
        {kind === "OTHER" && (
          <FormField label="รหัสผังบัญชีคู่" hint="เช่น 6900 ค่าใช้จ่ายอื่น · 4900 รายได้อื่น">
            <input className="input" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} data-testid="reconcile-create-account" />
          </FormField>
        )}
        <FormField label="คำอธิบาย">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} data-testid="reconcile-create-note" />
        </FormField>
        {err && (
          <p className="text-sm text-[color:var(--color-danger)]" data-testid="reconcile-create-err">
            {err}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default ReconcilePanel;
