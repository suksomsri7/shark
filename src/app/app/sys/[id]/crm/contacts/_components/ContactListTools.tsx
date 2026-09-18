"use client";

// เครื่องมือของหน้ารายชื่อผู้ติดต่อ (CRM v2 · ใบ C1.4 · §3.17): ตารางเลือกหลายแถว + โอนเป็นกลุ่ม · นำเข้า CSV (จับคู่คอลัมน์ · ซ้ำ 3 แบบ) ·
// ส่งออก CSV (ยืนยัน + เหตุผล)
// 🔴 ไฟล์ client: import ได้เฉพาะ contacts-shared / companies-shared / core/csv (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma
// 🔴 การกระทำอันตราย (โอนเป็นกลุ่ม · ส่งออก) = ติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร (X9) · ข้อผิดพลาดแสดงในกล่อง ไม่ใช้ alert()

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/core/csv";
import {
  CONTACT_BULK_MAX,
  CONTACT_IMPORT_INLINE_MAX_ROWS,
  CONTACT_IMPORT_MAX_BYTES,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_REASON_MIN,
  IMPORT_DUPLICATE_LABEL,
  IMPORT_DUPLICATE_MODES,
  IMPORT_TARGETS,
  IMPORT_TARGET_LABEL,
  LEAD_STATUS_LABEL,
  LIFECYCLE_LABEL,
  SCORE_BAND_LABEL,
  type ContactLeadStatus,
  type ContactLifecycle,
  type ContactListInput,
  type ContactScoreBand,
  type ImportContactsResult,
  type ImportDuplicateMode,
} from "@/lib/modules/crm/contacts-shared";
import { bulkAssignAction, exportContactsAction, importContactsAction } from "@/lib/modules/crm/contacts-actions";

type Opt = { id: string; name: string };
export type ContactRowView = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  jobTitle: string | null;
  lifecycleStage: ContactLifecycle;
  leadStatus: ContactLeadStatus;
  scoreBand: ContactScoreBand | null;
  ownerName: string | null;
  isMember: boolean;
  archived: boolean;
  optOut: boolean;
};

function Sheet({ label, testid, onClose, children }: { label: string; testid: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => (e.target === e.currentTarget ? onClose() : undefined)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testid}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold">{label}</h2>
        {children}
      </div>
    </div>
  );
}

function DangerFields({ kind, confirm, setConfirm, reason, setReason, what }: { kind: "bulk-assign" | "export"; confirm: boolean; setConfirm: (v: boolean) => void; reason: string; setReason: (v: string) => void; what: string }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>เหตุผล (อย่างน้อย {CONTACT_REASON_MIN} ตัวอักษร — ทีมย้อนดูได้)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" placeholder="เช่น โอนลูกค้าให้ทีมเขตใต้" data-testid={`contacts-${kind}-reason`} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid={`contacts-${kind}-confirm`} />
        ยืนยัน{what}
      </label>
    </>
  );
}

const TONE: Record<ContactScoreBand, string> = { HOT: "var(--color-danger)", WARM: "var(--color-accent)", COLD: "var(--color-muted)" };

// ───────────────────────── ตาราง + โอนเป็นกลุ่ม ─────────────────────────

export function ContactTable({ systemId, rows, owners }: { systemId: string; rows: ContactRowView[]; owners: Opt[] }) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/contacts`;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () =>
    start(async () => {
      setError(null);
      if (!owner) return setError("เลือกผู้ดูแลคนใหม่ก่อน");
      if (reason.trim().length < CONTACT_REASON_MIN) return setError(`ใส่เหตุผลอย่างน้อย ${CONTACT_REASON_MIN} ตัวอักษร`);
      if (!confirm) return setError("ติ๊กช่องยืนยันก่อน");
      const r = await bulkAssignAction(systemId, { ids: [...sel], userId: owner, confirm, reason });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setSel(new Set());
      setReason("");
      setConfirm(false);
      setDone(`โอนแล้ว ${r.updated.toLocaleString("th-TH")} คน`);
      router.refresh();
    });

  const badge = (r: ContactRowView) => (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      <span className="rounded-md border px-1.5">{LIFECYCLE_LABEL[r.lifecycleStage]}</span>
      <span className="rounded-md border px-1.5 text-[color:var(--color-muted)]">{LEAD_STATUS_LABEL[r.leadStatus]}</span>
      {r.scoreBand && (
        <span className="rounded-md border px-1.5 font-semibold" style={{ color: TONE[r.scoreBand], borderColor: TONE[r.scoreBand] }}>
          {SCORE_BAND_LABEL[r.scoreBand]}
        </span>
      )}
      {r.isMember && <span className="rounded-md border px-1.5" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>สมาชิก</span>}
      {r.optOut && <span className="rounded-md border px-1.5 text-[color:var(--color-muted)]">ไม่รับข่าวสาร</span>}
      {r.archived && <span className="rounded-md border px-1.5 text-[color:var(--color-muted)]">เก็บถาวร</span>}
    </span>
  );

  return (
    <>
      {(sel.size > 0 || done) && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm" data-testid="contacts-bulk-bar">
          {sel.size > 0 ? (
            <>
              <span>เลือกไว้ {sel.size.toLocaleString("th-TH")} คน</span>
              <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(true)} disabled={sel.size > CONTACT_BULK_MAX} data-testid="contacts-bulk-assign-btn">
                โอนให้ผู้ดูแลคนใหม่
              </button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setSel(new Set())} data-testid="contacts-bulk-clear">
                ล้างที่เลือก
              </button>
              {sel.size > CONTACT_BULK_MAX && <span className="text-xs text-[color:var(--color-danger)]">โอนได้ครั้งละไม่เกิน {CONTACT_BULK_MAX} คน</span>}
            </>
          ) : (
            <span role="status">{done}</span>
          )}
        </div>
      )}
      <div className="card hidden overflow-x-auto p-0 md:block" data-testid="contacts-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="เลือกทั้งหมดในหน้านี้" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} data-testid="contacts-select-all" />
              </th>
              <th className="px-3 py-2.5 font-medium">ผู้ติดต่อ</th>
              <th className="px-3 py-2.5 font-medium">บริษัท / ตำแหน่ง</th>
              <th className="px-3 py-2.5 font-medium">สถานะ</th>
              <th className="px-3 py-2.5 font-medium">ผู้ดูแล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2.5">
                  <input type="checkbox" aria-label={`เลือก ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} data-testid="contacts-row-select" />
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`${base}/${r.id}`} className="font-medium hover:underline" data-testid="contacts-row-link">
                    {r.name}
                  </Link>
                  <div className="text-xs text-[color:var(--color-muted)]">{[r.phone, r.email].filter(Boolean).join(" · ") || "ยังไม่มีช่องทางติดต่อ"}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div>{r.companyName ?? "—"}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">{r.jobTitle ?? ""}</div>
                </td>
                <td className="px-3 py-2.5">{badge(r)}</td>
                <td className="px-3 py-2.5">{r.ownerName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 md:hidden" data-testid="contacts-cards">
        {rows.map((r) => (
          <div key={r.id} className="card flex items-start gap-2 p-3">
            <input type="checkbox" aria-label={`เลือก ${r.name}`} className="mt-1" checked={sel.has(r.id)} onChange={() => toggle(r.id)} data-testid="contacts-card-select" />
            <Link href={`${base}/${r.id}`} className="flex min-w-0 flex-1 flex-col gap-1" data-testid="contacts-card-link">
              <span className="break-words font-medium">{r.name}</span>
              <span className="break-words text-xs text-[color:var(--color-muted)]">{[r.companyName, r.jobTitle, r.ownerName ? `ผู้ดูแล ${r.ownerName}` : null].filter(Boolean).join(" · ") || "ยังไม่มีรายละเอียด"}</span>
              {badge(r)}
            </Link>
          </div>
        ))}
      </div>
      {open && (
        <Sheet label={`โอนผู้ติดต่อ ${sel.size.toLocaleString("th-TH")} คนให้ผู้ดูแลคนใหม่`} testid="contacts-bulk-assign-modal" onClose={() => setOpen(false)}>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ผู้ดูแลคนใหม่</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input text-sm" data-testid="contacts-bulk-assign-owner">
              <option value="">— เลือกผู้ดูแล —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <DangerFields kind="bulk-assign" confirm={confirm} setConfirm={setConfirm} reason={reason} setReason={setReason} what="การโอนผู้ติดต่อเป็นกลุ่ม" />
          {error && (
            <p className="text-sm text-[color:var(--color-danger)]" data-testid="contacts-bulk-assign-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)} data-testid="contacts-bulk-assign-cancel">
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={submit} data-testid="contacts-bulk-assign-submit">
              {pending ? "กำลังโอน…" : "โอน"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── ส่งออก ─────────────────────────

export function ContactExportButton({ systemId, filters }: { systemId: string; filters: ContactListInput }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      if (reason.trim().length < CONTACT_REASON_MIN) return setError(`ใส่เหตุผลอย่างน้อย ${CONTACT_REASON_MIN} ตัวอักษร`);
      if (!confirm) return setError("ติ๊กช่องยืนยันก่อน");
      const r = await exportContactsAction(systemId, filters, confirm, reason);
      if (!r.ok) return setError(r.error);
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
      setReason("");
      setConfirm(false);
    });
  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="contacts-export-btn">
        ส่งออก CSV
      </button>
      {open && (
        <Sheet label="ส่งออกรายชื่อผู้ติดต่อ (ตามตัวกรองที่ใช้อยู่)" testid="contacts-export-modal" onClose={() => setOpen(false)}>
          <p className="text-xs text-[color:var(--color-muted)]">ไฟล์มีข้อมูลส่วนบุคคลของลูกค้า — ระบบบันทึกว่าใครส่งออกเมื่อไหร่ เพราะอะไร · ข้อมูลอ่อนไหวออกได้เฉพาะคนที่มีสิทธิ์ดู</p>
          <DangerFields kind="export" confirm={confirm} setConfirm={setConfirm} reason={reason} setReason={setReason} what="การส่งออกข้อมูลผู้ติดต่อ" />
          {error && (
            <p className="text-sm text-[color:var(--color-danger)]" data-testid="contacts-export-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)} data-testid="contacts-export-cancel">
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={submit} data-testid="contacts-export-submit">
              {pending ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลด"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── นำเข้า ─────────────────────────

const GUESS: [RegExp, string][] = [
  [/^(ชื่อ|ชื่อจริง|first ?name|firstname|name)$/i, "firstName"],
  [/^(นามสกุล|last ?name|lastname|surname)$/i, "lastName"],
  [/(มือถือ|เบอร์|โทร|phone|mobile|tel)/i, "phone"],
  [/(อีเมล|e-?mail)/i, "email"],
  [/(ตำแหน่ง|job|title|position)/i, "jobTitle"],
  [/(แท็ก|tag)/i, "tags"],
  [/(บริษัท|company|organi[sz]ation)/i, "company"],
];

export function ContactImportButton({ systemId, customFields }: { systemId: string; customFields: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ImportDuplicateMode>("skip");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportContactsResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(CONTACT_IMPORT_MAX_BYTES / 1024 / 1024);
  const targets = useMemo(
    () => [...IMPORT_TARGETS.map((t) => ({ value: t, label: IMPORT_TARGET_LABEL[t] })), ...customFields.map((f) => ({ value: `f.${f.id}`, label: `ฟิลด์: ${f.name}` }))],
    [customFields],
  );

  const load = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const file = fileRef.current?.files?.[0];
      if (!file) return setError("เลือกไฟล์ CSV ก่อน");
      if (file.size > CONTACT_IMPORT_MAX_BYTES) return setError(`ไฟล์ใหญ่เกิน ${maxMb} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      const t = parseCsv(await file.text());
      if (t.headers.length === 0) return setError("ไฟล์นี้ว่าง — ตรวจว่าแถวแรกเป็นหัวคอลัมน์");
      if (t.rows.length > CONTACT_IMPORT_MAX_ROWS) return setError(`ไฟล์มี ${t.rows.length.toLocaleString("th-TH")} แถว — ครั้งละไม่เกิน ${CONTACT_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว`);
      if (t.rows.length > CONTACT_IMPORT_INLINE_MAX_ROWS) {
        return setError(`ตอนนี้นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_INLINE_MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์ (${t.rows.length.toLocaleString("th-TH")} แถว) เป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      }
      // วัดขนาดแบบเดียวกับเซิร์ฟเวอร์: ไบต์ UTF-8 ของ JSON {headers, rows} ที่จะส่งจริง (ไม่ใช่ขนาดไฟล์)
      if (new TextEncoder().encode(JSON.stringify({ headers: t.headers, rows: t.rows })).length > CONTACT_IMPORT_MAX_BYTES) {
        return setError(`ข้อมูลใหญ่เกิน ${maxMb} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      }
      setHeaders(t.headers);
      setRows(t.rows);
      const m: Record<string, string> = {};
      const used = new Set<string>();
      for (const h of t.headers) {
        const g = GUESS.find(([re, target]) => re.test(h.trim()) && !used.has(target));
        m[h] = g ? g[1] : "";
        if (g) used.add(g[1]);
      }
      setMapping(m);
    });

  const submit = () =>
    start(async () => {
      setError(null);
      if (!Object.values(mapping).some((t) => t === "firstName" || t === "lastName")) return setError("จับคู่คอลัมน์ชื่อก่อน (ชื่อจริง หรือ นามสกุล)");
      let r: Awaited<ReturnType<typeof importContactsAction>>;
      try {
        r = await importContactsAction(systemId, { headers, rows, mapping, onDuplicate: mode });
      } catch {
        // การเรียกหลุดกลางทาง (เน็ต/หมดเวลา) — ชุดก่อนหน้าอาจบันทึกไปแล้ว
        router.refresh();
        return setError("การนำเข้าหยุดกลางทาง บางส่วนอาจบันทึกไปแล้ว — ตรวจรายการก่อนนำเข้าซ้ำ");
      }
      if (!r.ok) return setError(r.error);
      setResult({ created: r.created, updated: r.updated, skipped: r.skipped, candidates: r.candidates, failed: r.failed, errors: r.errors });
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="contacts-import-btn">
        นำเข้า CSV
      </button>
      {open && (
        <Sheet label="นำเข้าผู้ติดต่อจากไฟล์ CSV" testid="contacts-import-modal" onClose={() => setOpen(false)}>
          <p className="text-xs text-[color:var(--color-muted)]">
            แถวแรกเป็นหัวคอลัมน์ (ภาษาไทยได้) · ครั้งละไม่เกิน {CONTACT_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว / {maxMb} MB · ช่องที่ขึ้นต้นด้วย = + - @ เก็บเป็นข้อความตามที่พิมพ์
          </p>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ไฟล์ CSV</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="input text-sm" onChange={load} data-testid="contacts-import-file" />
          </label>
          {headers.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="contacts-import-mapping">
              <span className="text-xs text-[color:var(--color-muted)]">จับคู่คอลัมน์ ({rows.length.toLocaleString("th-TH")} แถว)</span>
              {headers.map((h) => (
                <label key={h} className="grid grid-cols-2 items-center gap-2 text-sm">
                  <span className="truncate" title={h}>
                    {h}
                  </span>
                  <select value={mapping[h] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))} className="input text-sm" data-testid="contacts-import-map">
                    <option value="">— ไม่นำเข้า —</option>
                    {targets.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                <span>ถ้าเบอร์/อีเมลซ้ำกับคนในระบบ</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as ImportDuplicateMode)} className="input text-sm" data-testid="contacts-import-duplicate">
                  {IMPORT_DUPLICATE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {IMPORT_DUPLICATE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {error && (
            <p className="text-sm text-[color:var(--color-danger)]" data-testid="contacts-import-error">
              {error}
            </p>
          )}
          {result && (
            <div className="rounded-lg border p-3 text-sm" data-testid="contacts-import-result" role="status">
              <p>
                เพิ่ม {result.created.toLocaleString("th-TH")} · อัปเดต {result.updated.toLocaleString("th-TH")} · ข้าม {result.skipped.toLocaleString("th-TH")} · คู่สงสัยซ้ำ{" "}
                {result.candidates.toLocaleString("th-TH")}
                {result.failed > 0 ? ` · มีปัญหา ${result.failed.toLocaleString("th-TH")} แถว` : ""}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-[color:var(--color-muted)]">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={`${e.row}-${i}`}>
                      แถว {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)} data-testid="contacts-import-cancel">
              ปิด
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending || rows.length === 0} onClick={submit} data-testid="contacts-import-submit">
              {pending ? "กำลังนำเข้า…" : "นำเข้า"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
