"use client";
// SVC D.4 ▸ จอ หอ 12 "นำเข้าข้อมูลหอ" — ภาพ ledger/design-dorm/12-import-excel.png (ซ้าย = ตารางจับคู่คอลัมน์ · ขวา = ผลตรวจ + จะสร้างอะไรบ้าง)
//   • ข้อมูลทั้งหมดมาจากผู้เรียก (getImport / previewImport ของ facade หอ) — ไฟล์นี้ import จากโมดูลได้เฉพาะ type · action รับทาง prop
//     (ไม่ลาก prisma/โมดูล server/actions/next navigation) ⇒ render ด้วย renderToStaticMarkup ได้เมื่อไม่ส่ง actions
//   • ไม่มีเบอร์เต็ม/เลขบัตร (ค่าที่มาจาก facade ปิดแล้ว) · ไม่มีข้อความที่ขึ้นต้นด้วยเครื่องหมายสูตร (ค่าจากไฟล์ทำให้เป็นกลางแล้ว)
//   • ข้อความหน้าต่างย้อนกลับอ่านจากค่าตั้ง (view.undoDays — RULING-3) · เดสก์ท็อป 1440 สองคอลัมน์ · มือถือ 390 ซ้อนลง ไม่ล้นแนวนอน
//   • X3: ปุ่มนำเข้าใช้ previewHash ของพรีวิวล่าสุดที่ยืนยันแล้ว (จาก view) · X8: ตัวเลือก · ตัดสินรายแถว · ทำต่อ/ย้อนต่อ · X19: หัวรายการตามภาพ
import { useState } from "react";
import type { ImportDecision, ImportIssue, ImportMapping, ImportPlan, ImportPreviewResult, ImportSummary, ImportView } from "@/lib/modules/dorm";
import { IMPORT_FIELD_LABEL_TH, IMPORT_FIELD_ORDER, IMPORT_ISSUE_TH, IMPORT_SEVERITY_TH, IMPORT_STEPS, importBaht, importUndoWindowTh, type ImportStepKey } from "./import-shared";

type ActionResult = {
  ok: boolean;
  code?: string;
  reason?: string;
  batchId?: string;
  previewHash?: string;
  blockers?: { code: string; room: string }[];
  mustFix?: number;
  failedRowNo?: number;
  failedCode?: string;
  done?: number;
};
type Opts = { dateFormat: "BE_DMY" | "CE_DMY" | "ISO"; meterReadDate: string; depositChannel: "CASH" | "TRANSFER" | "PROMPTPAY"; financeAccountId: string | null };
export type ImportScreenActions = {
  upload: (input: { fileName: string; dataUrl: string; sheet?: string | null }) => Promise<ActionResult>;
  guess: (input: { batchId: string }) => Promise<ActionResult>;
  preview: (input: { batchId: string; mapping?: ImportMapping; options?: Partial<Opts>; decisions?: Record<string, ImportDecision[]> }) => Promise<ActionResult>;
  create: (input: { batchId: string; previewHash: string; legalAckReason?: string | null; skipRows?: number[] }) => Promise<ActionResult>;
  undo: (input: { batchId: string; reason: string }) => Promise<ActionResult>;
};
export type ImportScreenProps = {
  unitSlug: string;
  view: ImportView | null;
  preview: ImportPreviewResult | null;
  actions?: ImportScreenActions;
};

const card = "rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";
const muted = "text-[color:var(--color-muted)]";
const MAX_SHOWN = 60;
const BLOCKER_TH: Record<string, string> = {
  BILL_EXISTS: "มีบิลแล้ว",
  MOVEOUT_EXISTS: "มีการย้ายออก",
  LEASE_CHANGED: "สัญญาเปลี่ยนสถานะ",
  DEPOSIT_MOVED: "เงินประกันถูกปิด/เปลี่ยน",
  METER_READ_AFTER_IMPORT: "มีเลขมิเตอร์หลังนำเข้า",
  ROOM_IN_USE: "ห้องถูกใช้",
};

function stepOf(view: ImportView | null, confirmed: boolean): ImportStepKey {
  if (!view) return "UPLOAD";
  if (view.status === "CREATED" || view.status === "UNDONE" || view.status === "CREATING" || view.status === "UNDOING") return "CREATE";
  return confirmed ? "CHECK" : "MAP";
}
/** หัวรายการตามภาพ 12: "แถว 27 · ห้อง 310" + ข้อความส่วนแรก · ส่วนหลัง "—" เป็นบรรทัดเล็ก */
function issueParts(i: ImportIssue): { where: string; head: string; sub: string } {
  const where = [i.rowNo !== null ? `แถว ${i.rowNo}` : "", i.room ? `ห้อง ${i.room}` : ""].filter(Boolean).join(" · ");
  const at = i.messageTh.indexOf(" — ");
  const head = at > 0 ? i.messageTh.slice(0, at) : (IMPORT_ISSUE_TH[i.code] ?? i.code);
  const sub = at > 0 ? i.messageTh.slice(at + 3) : i.messageTh;
  return { where, head, sub };
}
const SEV_ORDER: Record<string, number> = { MUST_FIX: 0, WARN: 1, INFO: 2 };

export default function ImportScreen({ unitSlug, view, preview, actions }: ImportScreenProps) {
  const base = `/app/u/${unitSlug}/dorm/tenants/import`;
  const confirmed = preview?.confirmed ?? view?.confirmed ?? false;
  const mappingIn: ImportMapping = preview?.mapping ?? view?.mapping ?? {};
  const summary: ImportSummary | null = preview?.summary ?? view?.summary ?? null;
  const plan: ImportPlan | null = preview?.plan ?? view?.plan ?? null;
  const issues: ImportIssue[] = preview?.issues ?? view?.issues ?? [];
  const previewHash = preview?.previewHash ?? view?.previewHash ?? null;
  const [mapping, setMapping] = useState<ImportMapping>(mappingIn);
  const [opts, setOpts] = useState<Opts>(view?.options ?? { dateFormat: "BE_DMY", meterReadDate: "", depositChannel: "TRANSFER", financeAccountId: null });
  const [decisions, setDecisions] = useState<Record<string, ImportDecision[]>>(view?.decisions ?? {});
  const [sheet, setSheet] = useState<string>(view?.sheet ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ack, setAck] = useState("");
  const active = stepOf(view, confirmed);
  const sorted = issues.filter((i) => i.severity !== "INFO").sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || (a.rowNo ?? 0) - (b.rowNo ?? 0));
  const shown = sorted.slice(0, MAX_SHOWN);
  const legalWarn = issues.some((i) => i.code === "DEPOSIT_LEGAL" && i.severity === "WARN");
  const mustFix = summary?.mustFix ?? 0;
  const canCreate = !!view && !!summary && !!previewHash && confirmed && mustFix === 0 && (view.status === "DRAFT" || view.status === "UNDONE");
  const reload = (batchId?: string) => {
    if (typeof window !== "undefined") window.location.assign(batchId ? `${base}?batch=${encodeURIComponent(batchId)}` : window.location.href);
  };
  const explain = (r: ActionResult): string => {
    const parts = [r.reason ?? "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง"];
    if (r.blockers?.length) parts.push(`ติด: ${r.blockers.slice(0, 8).map((b) => `${BLOCKER_TH[b.code] ?? b.code}${b.room ? ` ห้อง ${b.room}` : ""}`).join(" · ")}`);
    if (typeof r.mustFix === "number") parts.push(`ต้องแก้ ${r.mustFix} แถว`);
    if (typeof r.failedRowNo === "number") parts.push(`หยุดที่แถว ${r.failedRowNo}${r.failedCode ? ` (${IMPORT_ISSUE_TH[r.failedCode] ?? r.failedCode})` : ""}`);
    return parts.join(" · ");
  };
  const run = async (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) => {
    if (!actions || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (!r.ok) setMsg(explain(r));
      else if (after) after(r);
    } catch {
      setMsg("ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  const optionsOut = (): Partial<Opts> => ({
    dateFormat: opts.dateFormat,
    depositChannel: opts.depositChannel,
    ...(opts.meterReadDate ? { meterReadDate: opts.meterReadDate } : {}),
    financeAccountId: opts.financeAccountId && opts.financeAccountId.trim() ? opts.financeAccountId.trim() : null,
  });
  const recheck = (dec: Record<string, ImportDecision[]>) => {
    if (!view || !actions) return;
    setDecisions(dec);
    void run(() => actions.preview({ batchId: view.batchId, mapping, options: optionsOut(), decisions: dec }), () => reload(view.batchId));
  };
  const decide = (rowNo: number | null, d: ImportDecision) => {
    if (rowNo === null) return;
    const k = String(rowNo);
    const keep = (decisions[k] ?? []).filter((x) => x.action !== d.action);
    recheck({ ...decisions, [k]: [...keep, d] });
  };
  const onFile = (f: File | null | undefined) => {
    if (!f || !actions) return;
    const rd = new FileReader();
    rd.onload = () =>
      void run(
        async () => {
          const up = await actions.upload({ fileName: f.name, dataUrl: String(rd.result ?? ""), sheet: sheet && view && sheet !== view.sheet ? sheet : null });
          if (up.ok && up.batchId) {
            await actions.guess({ batchId: up.batchId });
            await actions.preview({ batchId: up.batchId });
          }
          return up;
        },
        (r) => reload(r.batchId),
      );
    rd.readAsDataURL(f);
  };

  return (
    <div data-dorm-import className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-2xl font-bold">นำเข้าข้อมูลหอ</h1>
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="ขั้นตอนนำเข้า">
          {IMPORT_STEPS.map((s, i) => {
            const on = s.key === active;
            const doneStep = IMPORT_STEPS.findIndex((x) => x.key === active) > i;
            return (
              <li key={s.key} data-import-step={s.key} data-active={on ? "true" : "false"} className={`flex items-center gap-2 ${on ? "font-semibold text-[color:var(--color-accent)]" : muted}`}>
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${on ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-[color:var(--color-surface)]" : "border-[color:var(--color-line)]"}`}
                >
                  {doneStep ? "✓" : String(i + 1)}
                </span>
                <span>{s.labelTh}</span>
                {i < IMPORT_STEPS.length - 1 ? <span aria-hidden className="mx-1 hidden h-px w-8 bg-[color:var(--color-line)] sm:inline-block" /> : null}
              </li>
            );
          })}
        </ol>
        <a href={`${base}/template`} className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-[color:var(--color-line)] px-4 text-sm font-semibold">
          ดาวน์โหลดแม่แบบ
        </a>
      </header>

      {msg ? (
        <p role="alert" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          {msg}
        </p>
      ) : null}

      {!view ? (
        <section data-import-upload className={`${card} flex flex-col gap-3 p-6`}>
          <h2 className="text-lg font-semibold">อัปโหลดไฟล์ทะเบียนหอ</h2>
          <p className={`text-sm ${muted}`}>รับไฟล์ .xlsx หรือ CSV (UTF-8 / Excel ภาษาไทย) — ระบบเดาคอลัมน์ให้ คุณตรวจและยืนยันก่อนนำเข้า</p>
          <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)]">
            เลือกไฟล์
            <input type="file" accept=".xlsx,.csv,.tsv,.txt" className="sr-only" disabled={busy || !actions} onChange={(e) => onFile(e.currentTarget.files?.[0])} />
          </label>
        </section>
      ) : (
        <>
          <div data-import-file className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-5 py-4 text-sm">
            <span className="min-w-0 break-words">
              <b>{view.fileName}</b>
              {` · ชีต "${view.sheet}" · ${view.rowCount} แถว ${view.columnCount} คอลัมน์`}
              {view.sheets
                .filter((s) => s.name !== view.sheet)
                .map((s) => ` · ชีต "${s.name}" ${s.rowCount} แถว`)
                .join("")}
            </span>
            {view.sheets.length > 1 && (view.status === "DRAFT" || view.status === "UNDONE") ? (
              <label className="flex items-center gap-2 text-xs">
                <span className={muted}>ใช้ชีต</span>
                <select value={sheet} onChange={(e) => setSheet(e.currentTarget.value)} className="min-h-9 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2" disabled={busy || !actions}>
                  {view.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {sheet !== view.sheet ? <span className={muted}>แล้วเลือกไฟล์เดิมอีกครั้ง</span> : null}
              </label>
            ) : null}
            <label className="ml-auto cursor-pointer font-semibold text-[color:var(--color-accent)]">
              {sheet !== view.sheet ? "เลือกไฟล์เดิม" : "เปลี่ยนไฟล์"}
              <input type="file" accept=".xlsx,.csv,.tsv,.txt" className="sr-only" disabled={busy || !actions} onChange={(e) => onFile(e.currentTarget.files?.[0])} />
            </label>
          </div>

          {view.resumable || view.undoResumable ? (
            <div data-import-resume className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-danger)] px-5 py-4 text-sm">
              <span>
                {view.resumable ? "การนำเข้าหยุดกลางทาง" : "การย้อนกลับหยุดกลางทาง"}
                {view.lastError?.rowNo ? ` ที่แถว ${view.lastError.rowNo}` : ""}
                {view.lastError ? ` (${IMPORT_ISSUE_TH[view.lastError.code] ?? view.lastError.code})` : ""}
              </span>
              {view.resumable ? (
                <>
                  <button
                    type="button"
                    data-import-resume-create
                    disabled={busy || !actions}
                    onClick={() => void run(() => actions!.create({ batchId: view.batchId, previewHash: "" }), () => reload(view.batchId))}
                    className="inline-flex min-h-10 items-center rounded-xl bg-[color:var(--color-ink)] px-4 font-semibold text-[color:var(--color-surface)] disabled:opacity-50"
                  >
                    ทำต่อ
                  </button>
                  {view.lastError?.rowNo ? (
                    <button
                      type="button"
                      disabled={busy || !actions}
                      onClick={() => void run(() => actions!.create({ batchId: view.batchId, previewHash: "", skipRows: [view.lastError!.rowNo as number] }), () => reload(view.batchId))}
                      className="inline-flex min-h-10 items-center rounded-xl border border-[color:var(--color-line)] px-4 font-semibold"
                    >
                      {`ข้ามแถว ${view.lastError.rowNo} แล้วทำต่อ`}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  data-import-resume-undo
                  disabled={busy || !actions}
                  onClick={() => {
                    const reason = typeof window !== "undefined" ? window.prompt("เหตุผลที่ย้อนกลับการนำเข้าทั้งชุด") : null;
                    if (reason && reason.trim().length >= 3) void run(() => actions!.undo({ batchId: view.batchId, reason: reason.trim() }), () => reload(view.batchId));
                  }}
                  className="inline-flex min-h-10 items-center rounded-xl bg-[color:var(--color-ink)] px-4 font-semibold text-[color:var(--color-surface)] disabled:opacity-50"
                >
                  ย้อนต่อ
                </button>
              )}
            </div>
          ) : null}

          <div className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
            {/* ── ซ้าย: คอลัมน์ในไฟล์ → ช่องในระบบ ── */}
            <section className={`${card} min-w-0 overflow-hidden lg:flex-[1.3]`}>
              <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
                <h2 className="font-semibold">คอลัมน์ในไฟล์ → ช่องในระบบ</h2>
                <span data-map-source={view.proposal?.source ?? "NONE"} className="ml-auto rounded-full bg-[color:var(--color-accent-soft)] px-3 py-1 text-xs text-[color:var(--color-accent)]">
                  {view.proposal && view.proposal.source !== "NONE" ? `ระบบเดาให้ ${view.proposal.guessed}/${view.columnCount} · ตรวจแล้วกดต่อ` : `จับคู่เอง 0/${view.columnCount}`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className={`bg-[color:var(--color-surface-2)] text-left text-xs ${muted}`}>
                    <tr>
                      <th className="px-4 py-3 font-medium">คอลัมน์ในไฟล์</th>
                      <th className="px-4 py-3 font-medium">ตัวอย่าง</th>
                      <th className="px-2 py-3" aria-hidden />
                      <th className="px-4 py-3 font-medium">ช่องในระบบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.headers.map((h, i) => {
                      const k = String(i);
                      const f = mapping[k] ?? "";
                      const sample = view.samples[i]?.[0] ?? "";
                      const isLine = /^\s*line\b|ไลน์/i.test(h);
                      return (
                        <tr key={k} data-map-col={k} className="border-t border-[color:var(--color-line)]">
                          <td className="px-4 py-3 font-semibold">{h || `คอลัมน์ ${i + 1}`}</td>
                          <td className="px-4 py-3">
                            {sample ? (
                              <code data-map-sample className="rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[13px]">
                                {sample}
                              </code>
                            ) : (
                              <span data-map-sample className={muted}>
                                ว่าง
                              </span>
                            )}
                          </td>
                          <td className={`px-2 py-3 ${muted}`} aria-hidden>
                            →
                          </td>
                          <td className="px-4 py-3">
                            <select
                              data-map-field={f}
                              aria-label={`ช่องในระบบของคอลัมน์ ${h}`}
                              className={`min-h-10 w-full max-w-[280px] rounded-xl border border-[color:var(--color-line)] px-3 text-sm ${f === "IGNORE" ? `${muted} bg-[color:var(--color-surface-2)]` : "bg-[color:var(--color-surface)]"}`}
                              value={f}
                              disabled={busy || !actions}
                              onChange={(e) => {
                                const v = e.currentTarget.value;
                                setMapping((m) => {
                                  const next: ImportMapping = { ...m };
                                  if (!v) delete next[k];
                                  else next[k] = v as ImportMapping[string];
                                  return next;
                                });
                              }}
                            >
                              <option value="">— เลือกช่อง —</option>
                              {IMPORT_FIELD_ORDER.map((key) => (
                                <option key={key} value={key}>
                                  {key === "IGNORE" ? (isLine ? (IMPORT_FIELD_LABEL_TH.IGNORE ?? "ไม่นำเข้า") : "ไม่นำเข้า") : (IMPORT_FIELD_LABEL_TH[key] ?? key)}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-[color:var(--color-line)] px-5 py-4 text-sm">
                <label className="flex flex-col gap-1">
                  <span className={`text-xs ${muted}`}>รูปแบบวันที่ในไฟล์</span>
                  <select
                    value={opts.dateFormat}
                    disabled={busy || !actions}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setOpts((o) => ({ ...o, dateFormat: v === "CE_DMY" || v === "ISO" ? v : "BE_DMY" }));
                    }}
                    className="min-h-10 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2"
                  >
                    <option value="BE_DMY">พ.ศ. วัน/เดือน/ปี</option>
                    <option value="CE_DMY">ค.ศ. วัน/เดือน/ปี</option>
                    <option value="ISO">ปปปป-ดด-วว</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`text-xs ${muted}`}>วันที่จดมิเตอร์ในไฟล์</span>
                  <input
                    type="date"
                    value={opts.meterReadDate}
                    disabled={busy || !actions}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setOpts((o) => ({ ...o, meterReadDate: v }));
                    }}
                    className="min-h-10 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2"
                  />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className={`text-xs ${muted}`}>บัญชีรับเงินประกันยกมา (เว้นว่าง = ตามช่องทาง · แนะนำบัญชีพัก)</span>
                  <input
                    type="text"
                    value={opts.financeAccountId ?? ""}
                    maxLength={64}
                    disabled={busy || !actions}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setOpts((o) => ({ ...o, financeAccountId: v || null }));
                    }}
                    className="min-h-10 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2"
                  />
                </label>
                <button
                  type="button"
                  data-import-check
                  disabled={busy || !actions || view.status === "CREATING" || view.status === "UNDOING"}
                  onClick={() => void run(() => actions!.preview({ batchId: view.batchId, mapping, options: optionsOut(), decisions }), () => reload(view.batchId))}
                  className="inline-flex min-h-11 items-center rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-50"
                >
                  ยืนยันการจับคู่และตรวจ
                </button>
                <span className={`text-xs ${muted}`}>{confirmed ? "ยืนยันการจับคู่แล้ว" : "ยังไม่ได้ยืนยันการจับคู่ — ระบบเดาให้เท่านั้น"}</span>
              </div>
            </section>

            {/* ── ขวา: ผลตรวจ + แผน ── */}
            <div className="flex min-w-0 flex-col gap-5 lg:flex-1">
              <section data-import-summary data-ready={String(summary?.ready ?? 0)} data-warn={String(summary?.warn ?? 0)} data-mustfix={String(mustFix)} className={`${card} p-5`}>
                <h2 className="font-semibold">ผลตรวจก่อนนำเข้า</h2>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <div className={`text-sm ${muted}`}>พร้อม</div>
                    <div className="text-3xl font-bold">{summary?.ready ?? 0}</div>
                  </div>
                  <div>
                    <div className={`text-sm ${muted}`}>เตือน</div>
                    <div className="text-3xl font-bold">{summary?.warn ?? 0}</div>
                  </div>
                  <div>
                    <div className={`text-sm ${muted}`}>ต้องแก้</div>
                    <div className={`text-3xl font-bold ${mustFix > 0 ? "text-[color:var(--color-danger)]" : ""}`}>{mustFix}</div>
                  </div>
                </div>
                {shown.length ? (
                  <ul className="mt-4 flex flex-col divide-y divide-[color:var(--color-line)]">
                    {shown.map((i, n) => {
                      const ip = issueParts(i);
                      const editable = !!actions && (view.status === "DRAFT" || view.status === "UNDONE") && i.rowNo !== null;
                      return (
                        <li key={`${i.code}-${i.rowNo ?? "x"}-${n}`} data-import-issue={i.code} data-row={i.rowNo ?? ""} data-severity={i.severity} className="flex items-start gap-3 py-3 text-sm">
                          <span
                            className={`mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-bold ${i.severity === "MUST_FIX" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "border border-[color:var(--color-line)]"}`}
                            title={IMPORT_SEVERITY_TH[i.severity]}
                          >
                            {i.severity === "MUST_FIX" ? "!" : "?"}
                          </span>
                          <span className="min-w-0 flex-1 break-words">
                            <b>{ip.where}</b>
                            {` ${ip.head}`}
                            <small className={`block text-[12.5px] ${muted}`}>{ip.sub}</small>
                            {i.legal ? <small className={`block text-[12px] ${muted}`}>{`อ้างอิง: ${i.legal.citation}`}</small> : null}
                            {editable ? (
                              <span className="mt-1 flex flex-wrap gap-2 text-xs">
                                {i.code === "PHONE_DUP_IN_FILE" ? (
                                  <>
                                    <button type="button" disabled={busy} onClick={() => decide(i.rowNo, { action: "TENANT", mode: "MERGE" })} className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">
                                      รวมเป็นผู้เช่าคนเดียว
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => decide(i.rowNo, { action: "TENANT", mode: "SEPARATE" })} className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">
                                      แยกคน
                                    </button>
                                  </>
                                ) : null}
                                {i.code === "TENANT_MATCH_CONFIRM" ? (
                                  <button type="button" disabled={busy} onClick={() => decide(i.rowNo, { action: "TENANT", createNewParty: true })} className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">
                                    สร้างผู้เช่ารายใหม่
                                  </button>
                                ) : null}
                                <button type="button" data-import-skip-row disabled={busy} onClick={() => decide(i.rowNo, { action: "SKIP" })} className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">
                                  ข้ามแถว
                                </button>
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : summary ? (
                  <p className={`mt-4 text-sm ${muted}`}>ไม่มีแถวที่ต้องแก้หรือเตือน</p>
                ) : (
                  <p className={`mt-4 text-sm ${muted}`}>กด “ยืนยันการจับคู่และตรวจ” เพื่อดูผลตรวจ</p>
                )}
                {sorted.length > MAX_SHOWN ? <p className={`mt-2 text-xs ${muted}`}>{`อีก ${sorted.length - MAX_SHOWN} รายการ — ดาวน์โหลดรายการปัญหาทั้งหมดเป็น CSV ได้`}</p> : null}
              </section>

              <section data-import-plan className={`${card} p-5`}>
                <h2 className="font-semibold">จะสร้างอะไรบ้าง</h2>
                <dl className="mt-3 flex flex-col gap-2 text-sm">
                  <PlanLine k="structure" label="อาคาร · ชั้น · ห้อง" value={plan ? `${plan.buildings} · ${plan.floors} · ${plan.rooms}` : "—"} />
                  <PlanLine k="leases" label="ผู้เช่า + สัญญา" value={plan ? String(plan.leases) : "—"} />
                  <PlanLine k="meters" label="มิเตอร์ (ไฟ+น้ำ) และเลขเริ่ม" value={plan ? String(plan.meters) : "—"} />
                  <PlanLine k="arrears" label="ยอดค้างยกมา (จดไว้ ยังไม่ออกใบ)" value={plan ? `${plan.arrears.count} รายการ · ${importBaht(plan.arrears.satang)}` : "—"} />
                  <PlanLine k="deposit" label="เงินประกันเปิดยอด (หนี้สิน)" value={plan ? importBaht(plan.depositSatang) : "—"} />
                </dl>
                {plan && (plan.existing.rooms > 0 || plan.existing.leases > 0) ? (
                  <p className={`mt-2 text-xs ${muted}`}>{`มีอยู่แล้วในระบบ (ไม่สร้างซ้ำ): ห้อง ${plan.existing.rooms} · สัญญา ${plan.existing.leases} · มิเตอร์ ${plan.existing.meters}`}</p>
                ) : null}
                <p className={`mt-3 text-[13px] ${muted}`}>{`นำเข้าทั้งชุดเป็น 1 รายการ · ย้อนกลับได้${importUndoWindowTh(view.undoDays)} ถ้ายังไม่ออกบิล`}</p>
                <p className={`mt-1 text-[12.5px] ${muted}`}>เงินประกันยกมาลงบัญชีรับเงินของหอ — ถ้าตั้งยอดยกมาของบัญชีธนาคารไว้เองแล้ว ให้เลือกบัญชีพักหรือตรวจกับผู้ทำบัญชีเพื่อไม่ให้ยอดเงินนับซ้ำ</p>

                {legalWarn && view.status !== "CREATED" ? (
                  <label className="mt-4 flex flex-col gap-1 text-sm">
                    <span className="font-semibold">เหตุผลที่นำเข้าแถวที่เงินประกันเกินคำแนะนำ (เจ้าของร้าน · อย่างน้อย 10 ตัวอักษร)</span>
                    <textarea
                      value={ack}
                      onChange={(e) => setAck(e.currentTarget.value)}
                      rows={2}
                      maxLength={500}
                      className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2"
                    />
                  </label>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {view.status !== "CREATED" ? (
                    <button
                      type="button"
                      data-import-create
                      disabled={!canCreate || busy}
                      onClick={() => void run(() => actions!.create({ batchId: view.batchId, previewHash: previewHash ?? "", legalAckReason: legalWarn ? ack : null }), () => reload(view.batchId))}
                      className="inline-flex min-h-11 items-center rounded-xl bg-[color:var(--color-accent)] px-5 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-50"
                    >
                      นำเข้าทั้งชุด
                    </button>
                  ) : (
                    <span className="text-sm font-semibold">นำเข้าแล้ว</span>
                  )}
                  {view.status === "CREATED" && view.canUndo ? (
                    <button
                      type="button"
                      data-import-undo
                      disabled={busy || !actions}
                      onClick={() => {
                        const reason = typeof window !== "undefined" ? window.prompt("เหตุผลที่ย้อนกลับการนำเข้าทั้งชุด") : null;
                        if (reason && reason.trim().length >= 3) void run(() => actions!.undo({ batchId: view.batchId, reason: reason.trim() }), () => reload(view.batchId));
                      }}
                      className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--color-line)] px-4 text-sm font-semibold"
                    >
                      ย้อนกลับทั้งชุด
                    </button>
                  ) : null}
                  {view.status === "UNDONE" ? <span className={`text-sm ${muted}`}>ย้อนกลับแล้ว — นำเข้าใหม่ได้หลังตรวจอีกครั้ง</span> : null}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PlanLine({ k, label, value }: { k: string; label: string; value: string }) {
  return (
    <div data-plan-item={k} className="flex items-baseline gap-2">
      <dt className={muted}>{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-[color:var(--color-line)]" />
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
