"use client";

// ─────────────────────────────────────────────────────────────
// LegalValuesPanel — "ตั้งค่า › ข้อมูลกิจการ › อัตราภาษีและกำหนดยื่น" (ACC T0.2)
//   ตารางค่ากฎหมายมีวันที่มีผล 3 ตาราง: อัตรา VAT · อัตราหัก ณ ที่จ่าย · กำหนดยื่นแบบ
//   แถวของระบบ (ที่มา + ป้าย + วันที่ตรวจ) แก้ไม่ได้ แต่ร้าน "ตั้งค่าของร้านแทน" ได้ทุกแถว · แถวของร้านแก้/ลบได้
//   ค่าที่ต่างจากค่าเริ่มต้น = คำเตือน ไม่บล็อก (หลัก SHARK)
// 🔴 client: import ได้เฉพาะไฟล์ pure (th-tax-2569) + type — ห้ามลาก prisma
// ─────────────────────────────────────────────────────────────
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateInput } from "./DateInput";
import { formatDateTh } from "@/lib/ui/date";
import {
  CHECK_WITH_ACCOUNTANT_TH,
  FILING_CHANNELS,
  FILING_CHANNEL_LABEL_TH,
  FILING_FORMS,
  FILING_FORM_LABEL_TH,
  WHT_CHANNELS,
  WHT_CHANNEL_LABEL_TH,
  WHT_INCOME_LABEL_TH,
  WHT_METHODS,
  WHT_METHOD_LABEL_TH,
  WHT_PAYERS,
  WHT_PAYER_LABEL_TH,
  WHT_RECIPIENTS,
  WHT_RECIPIENT_LABEL_TH,
  type LegalWarning,
} from "@/lib/core/settings/legal/th-tax-2569";
import type { BookTaxView, LegalRowView } from "@/lib/modules/account/legal-values";

type Kind = "vat" | "wht" | "deadline";
type SaveFn = (systemId: string, kind: Kind, rows: unknown) => Promise<{ ok: true; warnings: LegalWarning[] } | { ok: false; reason: string }>;

const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";
const helpCls = "text-xs text-[color:var(--color-muted)]";

const TITLE: Record<Kind, { title: string; desc: string }> = {
  vat: { title: "อัตราภาษีมูลค่าเพิ่ม", desc: "อัตรามาตรฐานตามวันที่ความรับผิดเกิด — ใช้เป็นค่าเริ่มของเอกสารและตัวเลือกอัตราในฟอร์ม" },
  wht: { title: "อัตราหัก ณ ที่จ่าย", desc: "ประเภทเงินได้ × ผู้จ่าย × ผู้รับ × ช่องทาง — ใช้เป็นอัตราที่แนะนำตอนเลือกประเภทเงินได้" },
  deadline: { title: "กำหนดยื่นแบบ", desc: "ยื่นภายในวันที่เท่าไรของเดือนถัดจากเดือนภาษี — ใช้กับการแจ้งเตือนกำหนดยื่น" },
};

type Draft = {
  id: string;
  /** VAT/WHT = เปอร์เซ็นต์ · กำหนดยื่น = วันที่ของเดือน */
  value: string;
  method: string;
  incomeType: string;
  payer: string;
  recipient: string;
  channel: string;
  form: string;
  from: string;
  to: string;
  source: string;
  note: string;
};

function draftOf(kind: Kind, r: LegalRowView | null, keepId: boolean): Draft {
  const d = r?.dims ?? {};
  return {
    id: keepId && r ? r.id : "",
    value: r?.value == null ? "" : kind === "deadline" ? String(r.value) : String(r.value / 100),
    method: r?.method ?? "RATE",
    incomeType: d.incomeType ?? "M40_8",
    payer: d.payer ?? "JURISTIC",
    recipient: d.recipient ?? "JURISTIC_TH",
    channel: d.channel ?? (kind === "deadline" ? "PAPER" : "NORMAL"),
    form: d.form ?? "PP30",
    from: r?.from ?? "",
    to: r?.to ?? "",
    source: keepId && r?.origin === "SHOP" ? r.source : "",
    note: keepId && r ? (r.note ?? "") : "",
  };
}

/** แถวของร้านในรูปที่ server รับ (ไม่มี tag — server ติด SHOP ให้เอง) */
function payloadOf(kind: Kind, r: LegalRowView): Record<string, unknown> {
  const base = { id: r.id, value: r.value, from: r.from, to: r.to, source: r.source, checkedAt: r.checkedAt, ...(r.note ? { note: r.note } : {}) };
  if (kind === "wht") return { ...base, ...r.dims, method: r.method };
  if (kind === "deadline") return { ...base, ...r.dims };
  return base;
}

function payloadFromDraft(kind: Kind, d: Draft): Record<string, unknown> {
  const n = Number.parseFloat(d.value);
  const base = {
    id: d.id,
    from: d.from || null,
    to: d.to || null,
    source: d.source.trim(),
    checkedAt: null,
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
  };
  if (kind === "deadline") return { ...base, value: Math.round(n), form: d.form, channel: d.channel };
  const bp = Number.isFinite(n) ? Math.round(n * 100) : null;
  if (kind === "vat") return { ...base, value: bp };
  return {
    ...base,
    value: d.method === "RATE" ? bp : null,
    method: d.method,
    incomeType: d.incomeType,
    payer: d.payer,
    recipient: d.recipient,
    channel: d.channel,
  };
}

const rangeText = (r: { from: string | null; to: string | null }) =>
  r.from || r.to ? `${r.from ? formatDateTh(r.from) : "ไม่ระบุ"} – ${r.to ? formatDateTh(r.to) : "ไม่ระบุ"}` : "ไม่ระบุช่วง";

function Warnings({ list, testId }: { list: LegalWarning[]; testId?: string }) {
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-0.5" data-testid={testId}>
      {list.map((w, i) => (
        <li key={`${w.code}-${i}`} className="text-xs text-[color:var(--color-ink)]">
          {w.messageTh}
          {w.citation ? <span className="text-[color:var(--color-muted)]"> · อ้างอิง: {w.citation}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Select({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (v: string) => void; options: Record<string, string>; testId?: string }) {
  return (
    <label className={labelCls}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input" data-testid={testId}>
        {Object.entries(options).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const pick = <K extends string>(keys: readonly K[], labels: Record<K, string>): Record<string, string> => Object.fromEntries(keys.map((k) => [k, labels[k]]));

function Editor({ kind, draft, setDraft, onCancel, onSave, pending }: { kind: Kind; draft: Draft; setDraft: (d: Draft) => void; onCancel: () => void; onSave: () => void; pending: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-line)] p-3" data-testid={`legal-editor-${kind}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        {kind === "wht" && (
          <>
            <Select label="ประเภทเงินได้" value={draft.incomeType} onChange={(v) => set({ incomeType: v })} options={WHT_INCOME_LABEL_TH} testId="legal-ed-income" />
            <Select label="ผู้จ่าย" value={draft.payer} onChange={(v) => set({ payer: v })} options={pick(WHT_PAYERS, WHT_PAYER_LABEL_TH)} />
            <Select label="ผู้รับ" value={draft.recipient} onChange={(v) => set({ recipient: v })} options={pick(WHT_RECIPIENTS, WHT_RECIPIENT_LABEL_TH)} />
            <Select label="ช่องทาง" value={draft.channel} onChange={(v) => set({ channel: v })} options={pick(WHT_CHANNELS, WHT_CHANNEL_LABEL_TH)} />
            <Select label="วิธีหัก" value={draft.method} onChange={(v) => set({ method: v })} options={pick(WHT_METHODS, WHT_METHOD_LABEL_TH)} />
          </>
        )}
        {kind === "deadline" && (
          <>
            <Select label="แบบ" value={draft.form} onChange={(v) => set({ form: v })} options={pick(FILING_FORMS, FILING_FORM_LABEL_TH)} />
            <Select label="ช่องทาง" value={draft.channel} onChange={(v) => set({ channel: v })} options={pick(FILING_CHANNELS, FILING_CHANNEL_LABEL_TH)} />
          </>
        )}
        {(kind !== "wht" || draft.method === "RATE") && (
          <label className={labelCls}>
            {kind === "deadline" ? "ยื่นภายในวันที่ (ของเดือนถัดไป)" : "อัตรา (%)"}
            <input
              type="number"
              step={kind === "deadline" ? 1 : 0.01}
              min={kind === "deadline" ? 1 : 0}
              max={kind === "deadline" ? 31 : 100}
              value={draft.value}
              onChange={(e) => set({ value: e.target.value })}
              className="input"
              data-testid="legal-ed-value"
            />
          </label>
        )}
        <label className={labelCls}>
          มีผลตั้งแต่ (เว้นว่าง = ไม่ระบุ)
          <DateInput value={draft.from} onChange={(iso) => set({ from: iso })} testId="legal-ed-from" />
        </label>
        <label className={labelCls}>
          ถึง (เว้นว่าง = ไม่ระบุ)
          <DateInput value={draft.to} onChange={(iso) => set({ to: iso })} testId="legal-ed-to" />
        </label>
      </div>
      <label className={labelCls}>
        ที่มา (เช่น เลขที่หนังสือ/ประกาศ หรือคำแนะนำของนักบัญชี)
        <input value={draft.source} onChange={(e) => set({ source: e.target.value })} maxLength={500} className="input" placeholder="ร้านตั้งเอง" />
      </label>
      <label className={labelCls}>
        หมายเหตุ
        <input value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} className="input" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={pending}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
          onClick={onSave}
          disabled={pending}
          data-testid="legal-ed-save"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกแถวของร้าน"}
        </button>
      </div>
    </div>
  );
}

function TableCard({ kind, rows, systemId, save }: { kind: Kind; rows: LegalRowView[]; systemId: string; save: SaveFn }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; warnings: LegalWarning[] } | null>(null);
  const shop = rows.filter((r) => r.origin === "SHOP");

  function commit(next: Record<string, unknown>[]) {
    start(async () => {
      const res = await save(systemId, kind, next);
      if (res.ok) {
        setDraft(null);
        setMsg({ ok: true, text: "บันทึกแล้ว", warnings: res.warnings });
        router.refresh();
      } else setMsg({ ok: false, text: res.reason, warnings: [] });
    });
  }

  function saveDraft() {
    if (!draft) return;
    const row = payloadFromDraft(kind, draft);
    const others = shop.filter((r) => r.id !== draft.id).map((r) => payloadOf(kind, r));
    commit([row, ...others]);
  }

  function remove(id: string) {
    commit(shop.filter((r) => r.id !== id).map((r) => payloadOf(kind, r)));
  }

  return (
    <section className="card flex flex-col gap-3 p-5" data-testid={`legal-card-${kind}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{TITLE[kind].title}</h2>
          <p className={helpCls}>{TITLE[kind].desc}</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setDraft(draftOf(kind, null, false))} data-testid={`legal-add-${kind}`}>
          เพิ่มแถวของร้าน
        </button>
      </div>
      {msg && (
        <div data-testid={`legal-msg-${kind}`}>
          <p className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}>{msg.text}</p>
          <Warnings list={msg.warnings} />
        </div>
      )}
      {draft && <Editor kind={kind} draft={draft} setDraft={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} pending={pending} />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-line)] text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 pr-3 font-normal">กรณี</th>
              <th className="py-2 pr-3 font-normal">ค่า</th>
              <th className="py-2 pr-3 font-normal">ช่วงที่มีผล</th>
              <th className="py-2 pr-3 font-normal">ที่มา</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.origin}-${r.id}`} className="border-b border-[color:var(--color-line)] align-top" data-testid={`legal-row-${r.id}`}>
                <td className="py-2 pr-3">
                  {r.dimsLabel}
                  <div className={helpCls}>
                    {r.origin === "SHOP" ? "แถวของร้าน" : "ค่าเริ่มต้นของระบบ"}
                    {r.inEffect ? " · ใช้อยู่วันนี้" : ""}
                  </div>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.valueLabel}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{rangeText(r)}</td>
                <td className="py-2 pr-3">
                  <div className="text-xs">{r.source}</div>
                  <div className={helpCls}>
                    ป้าย {r.tag} — {r.tagLabel}
                    {r.checkedAt ? ` · ตรวจ ${formatDateTh(r.checkedAt)}` : ""}
                  </div>
                  {r.note ? <div className={helpCls}>{r.note}</div> : null}
                  <Warnings list={r.warnings} testId={`legal-row-warn-${r.id}`} />
                </td>
                <td className="py-2 whitespace-nowrap text-right">
                  {r.origin === "SHOP" ? (
                    <span className="inline-flex gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(draftOf(kind, r, true))} disabled={pending}>
                        แก้
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(r.id)} disabled={pending} data-testid={`legal-del-${r.id}`}>
                        ลบ
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(draftOf(kind, r, false))} disabled={pending} data-testid={`legal-override-${r.id}`}>
                      ตั้งค่าของร้านแทน
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function LegalValuesPanel({ systemId, orgSettingsHref, view, save }: { systemId: string; orgSettingsHref: string; view: BookTaxView; save: SaveFn }) {
  return (
    <div className="flex flex-col gap-4" data-testid="legal-values-panel">
      <section className="card flex flex-col gap-2 p-5">
        <h2 className="text-base font-semibold">อัตราภาษีและกำหนดยื่น</h2>
        <p className={helpCls}>
          ค่าเริ่มต้นของระบบมาจากผลค้นคว้ากฎหมายของ SHARK (มีที่มา ป้ายความเชื่อมั่น และวันที่ตรวจทุกแถว) ไม่ใช่คำปรึกษาทางกฎหมายหรือภาษี ·
          ร้านตั้งค่าของตัวเองแทนได้ทุกแถว ระบบจะใช้ค่าของร้านและแสดงคำเตือนเมื่อต่างจากค่าเริ่มต้น — {CHECK_WITH_ACCOUNTANT_TH}
        </p>
        <p className="text-sm" data-testid="legal-entity-kind">
          ประเภทผู้ประกอบการ: <b>{view.entityKindLabel}</b>
          {view.entityKind === "UNSET" ? (
            <>
              {" "}
              — <Link href={orgSettingsHref} className="underline">ตั้งที่ข้อมูลทั่วไป</Link> (ระหว่างนี้ระบบแนะนำอัตราหัก ณ ที่จ่ายแบบผู้จ่ายเป็นนิติบุคคล)
            </>
          ) : null}
        </p>
        <p className="text-sm">
          อัตรา VAT ที่ใช้วันนี้ ({formatDateTh(view.asOf)}): <b data-testid="legal-vat-today">{view.vatRateBp / 100}%</b>
        </p>
      </section>
      {(["vat", "wht", "deadline"] as const).map((k) => (
        <TableCard key={k} kind={k} rows={view.tables[k]} systemId={systemId} save={save} />
      ))}
    </div>
  );
}
