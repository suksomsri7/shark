"use client";
// SVC D.13 ▸ หอ 17 "นโยบาย · ข้อความ · สิทธิ์" — ภาพ ledger/design-dorm/17-settings-policies.png · ใบสั่ง svc-brief-d.13 §6.3
//   • กริดการ์ด 3 คอลัมน์ (ตำแหน่ง/คีย์ทั้งหมดมาจาก dorm-policy-shared + โมเดล — ไฟล์นี้ไม่มีคีย์ค่าตั้งพิมพ์เอง)
//   • แถวกะทัดรัด: ป้ายช่อง ····· เม็ดค่า (formatFieldValue) + ป้าย "ค่าเริ่ม …" เมื่อปรับจากแม่แบบ · ช่องที่แก้ไม่ได้ล็อกพร้อมเหตุผล
//   • แก้ค่า: ปุ่ม "แก้" ของการ์ดเปิดฟอร์มเครื่องยนต์ (SettingsForm) เฉพาะช่องของการ์ดนั้น — ด่านสิทธิ์/กฎหมาย/writeVia อยู่ฝั่งเซิร์ฟเวอร์
//   • ไม่ใช้ hook ของ Next · ลิงก์ <a> · SSR ไม่มีช่องกรอกข้อความยาว (ฟอร์มเปิดเมื่อกดเท่านั้น)
import { useMemo, useState } from "react";
import type { RemoveResult, SetResult } from "@/lib/core/settings/types";
import type { DormPolicyModel } from "@/lib/modules/dorm";
import SettingsForm from "@/components/settings/SettingsForm";
import { formatFieldValue, type SettingsField } from "@/components/settings/settings-shared";
import DormSettingsNav from "./DormSettingsNav";
import { bahtWhole, DORM_POLICY_LAYOUT, templateParts } from "./dorm-policy-shared";

type Actions = {
  save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>;
  reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult>;
  applyRolePreset?: (input: { membershipId: string; role: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** ตั้งอาคารของผู้ดูแลทีละคน (อ่าน-แก้-เขียนฝั่งเซิร์ฟเวอร์ใน tx เดียว — ไม่ส่งทั้งตาราง) */
  setBuildingAssignment?: (input: { membershipId: string; buildingIds: string[] }) => Promise<{ ok: true } | { ok: false; reason: string }>;
};
type Props = { model: DormPolicyModel; unitSlug: string; actions: Actions };
type Card = DormPolicyModel["cards"][number];

const CELL_TEXT = { YES: "✓", NO: "—", REQUEST: "ขออนุมัติ" } as const;
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm";
const issueText = (r: { ok: false; issues?: { messageTh: string }[] }) => r.issues?.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ";

export default function DormPolicySettings({ model, unitSlug, actions }: Props) {
  const fields = useMemo(() => {
    const m = new Map<string, SettingsField>();
    for (const g of model.form.groups) for (const f of g.fields) m.set(f.key, f);
    return m;
  }, [model]);
  const [editing, setEditing] = useState<Card | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const saveOne = async (key: string, value: unknown) => {
    const r = await actions.save([{ key, scope: model.form.scope, scopeId: model.form.scopeId, value }]);
    setNotice(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "err", text: issueText(r) });
  };

  const editModel = useMemo(() => {
    if (!editing) return null;
    // ตารางอาคารรายคนแก้ผ่านตารางติ๊ก (ทีละคน) เท่านั้น — ไม่เปิดในฟอร์มทั้งตาราง
    const keys = new Set(editing.fieldKeys.filter((k) => k !== DORM_POLICY_LAYOUT.buildingAssignmentsKey));
    return {
      ...model.form,
      groups: model.form.groups.map((g) => ({ ...g, fields: g.fields.filter((f) => keys.has(f.key)) })).filter((g) => g.fields.length > 0),
      history: model.form.history.filter((h) => keys.has(h.key)),
    };
  }, [editing, model]);

  return (
    <div data-dorm-policies="" className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
      <DormSettingsNav unitSlug={unitSlug} active="policies" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[color:var(--color-ink)]">นโยบาย · ข้อความ · สิทธิ์</h1>
            <p className="text-sm text-[color:var(--color-muted)]">{model.unitName} · ทุกค่ามี “ค่าเริ่มต้น” จากแม่แบบ และแก้ได้ต่อกิจการ</p>
          </div>
          <div data-dp-diff="" data-diff-count={model.diffCount} className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
            {model.template ? <>แม่แบบ {model.template.labelTh} · </> : null}
            <b className="text-[color:var(--color-ink)]">ปรับจากแม่แบบ {model.diffCount} ข้อ</b>
          </div>
        </header>
        {notice ? (
          <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--color-surface-2)", color: notice.tone === "err" ? "var(--color-danger)" : "var(--color-ink)" }}>
            {notice.text}
          </p>
        ) : null}

        <div data-dp-grid="" data-cols="3" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {model.cards.map((c) => (
            <section
              key={c.key}
              data-dp-card={c.key}
              data-card-no={c.no}
              data-col={c.col}
              className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
            >
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h2 className="min-w-0 text-base font-bold text-[color:var(--color-ink)]">{c.labelTh}</h2>
                <span className="flex flex-none items-center gap-2">
                  {c.pendingLegalReview ? (
                    <span data-dp-chip="legal-review" className="rounded-lg border border-[color:var(--color-line)] px-2 py-1 text-xs font-bold text-[color:var(--color-ink-soft)]">
                      รอตรวจกฎหมาย
                    </span>
                  ) : null}
                  {c.fieldKeys.some((k) => fields.get(k)?.editable) ? (
                    <button type="button" onClick={() => setEditing(c)} className="min-h-11 px-2 text-sm font-bold text-[color:var(--color-accent)]">
                      แก้
                    </button>
                  ) : null}
                </span>
              </div>
              <CardBody card={c} model={model} fields={fields} onSave={saveOne} actions={actions} setNotice={setNotice} />
            </section>
          ))}
        </div>
      </div>

      {editing && editModel ? (
        <div role="dialog" aria-modal="true" aria-label={`แก้ ${editing.labelTh}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[color:var(--color-surface)] sm:rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-line)] px-5 py-3">
              <h2 className="text-base font-bold text-[color:var(--color-ink)]">แก้ {editing.labelTh}</h2>
              <button type="button" onClick={() => setEditing(null)} className={`${BTN} border-[color:var(--color-line)]`}>
                ปิด
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
              <SettingsForm model={editModel} actions={{ save: actions.save, reset: actions.reset }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────── เนื้อการ์ด ─────────────────────────
function CardBody({
  card,
  model,
  fields,
  onSave,
  actions,
  setNotice,
}: {
  card: Card;
  model: DormPolicyModel;
  fields: Map<string, SettingsField>;
  onSave: (key: string, value: unknown) => Promise<void>;
  actions: Actions;
  setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void;
}) {
  const list = card.fieldKeys.map((k) => fields.get(k)).filter((f): f is SettingsField => !!f);
  const preview = list.find((f) => f.key === DORM_POLICY_LAYOUT.previewTemplateKey);
  return (
    <>
      {card.key === "roles" ? <RolesTable model={model} actions={actions} setNotice={setNotice} /> : null}
      <div className="flex min-w-0 flex-col">
        {list.map((f) =>
          f.key === DORM_POLICY_LAYOUT.buildingAssignmentsKey ? (
            <BuildingScope key={f.key} field={f} model={model} actions={actions} setNotice={setNotice} />
          ) : DORM_POLICY_LAYOUT.segmented.includes(f.key) ? (
            <SegRow key={f.key} f={f} onSave={onSave} />
          ) : (
            <Row key={f.key} f={f} />
          ),
        )}
      </div>
      {preview ? <MsgPreview f={preview} /> : null}
    </>
  );
}

function lockAttrs(f: SettingsField) {
  return f.editable ? {} : { "data-locked": "true", title: f.lockedReasonTh ?? "แก้ไม่ได้" };
}

function DefaultChip({ f }: { f: SettingsField }) {
  if (!f.differsFromTemplate) return null;
  return (
    <span data-dp-chip="default" className="whitespace-nowrap rounded-md border border-dashed border-[color:var(--color-line)] px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]">
      ค่าเริ่ม {formatFieldValue(f, f.templateValue)}
    </span>
  );
}

function Locked({ f }: { f: SettingsField }) {
  return f.editable ? null : <span className="sr-only">{f.lockedReasonTh ?? "แก้ไม่ได้"}</span>;
}

function Row({ f }: { f: SettingsField }) {
  const value = f.type === "template" ? (f.differsFromTemplate ? "ปรับข้อความเอง" : "ตามแม่แบบ") : formatFieldValue(f, f.value);
  return (
    <div data-setting-key={f.key} {...lockAttrs(f)} className="flex min-w-0 items-baseline gap-2 py-2 text-sm">
      <span className="min-w-0 shrink text-[color:var(--color-ink-soft)]">{f.labelTh}</span>
      <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-[color:var(--color-line)]" />
      <span data-dp-pill="" className="min-w-0 max-w-[60%] break-words text-right font-bold text-[color:var(--color-ink)]">
        {value}
      </span>
      <DefaultChip f={f} />
      <Locked f={f} />
    </div>
  );
}

function SegRow({ f, onSave }: { f: SettingsField; onSave: (key: string, value: unknown) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div data-setting-key={f.key} {...lockAttrs(f)} className="flex min-w-0 flex-col gap-2 py-2 text-sm">
      <span className="sr-only">
        {f.labelTh}: <span data-dp-pill="">{formatFieldValue(f, f.value)}</span>
      </span>
      <div data-dp-seg="" role="group" aria-label={f.labelTh} className="flex flex-wrap gap-2">
        {(f.options ?? []).map((o) => {
          const on = o.value === f.value;
          return (
            <button
              key={o.value}
              type="button"
              data-option={o.value}
              aria-pressed={on ? "true" : "false"}
              disabled={!f.editable || busy}
              onClick={async () => {
                if (on) return;
                setBusy(true);
                await onSave(f.key, o.value);
                setBusy(false);
              }}
              className={`min-h-11 rounded-xl border px-4 text-sm ${
                on ? "border-transparent bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"
              }`}
            >
              {o.labelTh}
            </button>
          );
        })}
      </div>
      <span className="flex gap-2">
        <DefaultChip f={f} />
      </span>
      <Locked f={f} />
    </div>
  );
}

function MsgPreview({ f }: { f: SettingsField }) {
  const v = f.value;
  const text = typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { th?: unknown }).th === "string" ? (v as { th: string }).th : "";
  if (!text || f.masked) return null;
  return (
    <div data-dp-msg-preview="" className="mt-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm leading-7 text-[color:var(--color-ink)]">
      {templateParts(text).map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} data-var={p.name} className="mx-0.5 rounded-md bg-[color:var(--color-accent-soft)] px-1.5 py-0.5 font-bold text-[color:var(--color-accent)]">
            {p.labelTh}
          </span>
        ),
      )}
    </div>
  );
}

// ───────────────────────── สิทธิ์ผู้ใช้ ─────────────────────────
function RolesTable({ model, actions, setNotice }: { model: DormPolicyModel; actions: Actions; setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void }) {
  const r = model.roles;
  const targets = r.applyTargets;
  const presetCols = r.columns.filter((c) => c.role !== "OWNER");
  const [member, setMember] = useState(targets?.[0]?.membershipId ?? "");
  const [preset, setPreset] = useState<string>(presetCols[0]?.role ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 overflow-x-auto">
        <table data-dp-roles="" className="w-full min-w-[300px] text-sm">
          <thead>
            <tr className="text-xs text-[color:var(--color-muted)]">
              <th className="py-2 text-left font-normal">
                <span className="sr-only">สิทธิ์</span>
              </th>
              {r.columns.map((c) => (
                <th key={c.role} data-role={c.role} className="px-1 py-2 text-center font-normal">
                  {c.labelTh}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.id} data-role-row={row.id} className="border-t border-[color:var(--color-line)]">
                <td className="py-2 pr-2 text-[color:var(--color-ink)]">{row.id === "deposit" ? `${row.labelTh} > ${bahtWhole(model.depositThresholdSatang)}` : row.labelTh}</td>
                {r.columns.map((c) => {
                  const cell = row.cells[c.role];
                  return (
                    <td
                      key={c.role}
                      data-role-cell={`${row.id}:${c.role}`}
                      data-cell={cell}
                      className={`px-1 py-2 text-center ${cell === "YES" ? "font-bold text-[color:var(--color-ink)]" : cell === "REQUEST" ? "text-xs text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-muted)]"}`}
                    >
                      {CELL_TEXT[cell]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-snug text-[color:var(--color-muted)]">
        ระบบมีบทบาทเจ้าของ · ผู้จัดการ · พนักงาน — ชุดนี้ใช้ติ๊กสิทธิ์ให้พนักงาน (ผู้จัดการทำได้ทุกข้อในหอที่ดูแล) · “ขออนุมัติ” = ยื่นขอให้เจ้าของอนุมัติ
      </p>
      {targets && actions.applyRolePreset ? (
        <form
          data-dp-role-apply=""
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!member || !preset || !actions.applyRolePreset) return;
            setBusy(true);
            const res = await actions.applyRolePreset({ membershipId: member, role: preset });
            setBusy(false);
            setNotice(res.ok ? { tone: "ok", text: "ใช้ชุดสิทธิ์แล้ว" } : { tone: "err", text: res.reason });
          }}
        >
          {targets.length ? (
            <>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                พนักงาน
                <select className="input min-h-11 w-full min-w-0" value={member} onChange={(e) => setMember(e.target.value)}>
                  {targets.map((t) => (
                    <option key={t.membershipId} value={t.membershipId}>
                      {t.nameTh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ชุดสิทธิ์
                <select className="input min-h-11" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {presetCols.map((c) => (
                    <option key={c.role} value={c.role}>
                      {c.labelTh}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy} className={`${BTN} border-transparent bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`}>
                ใช้ชุดสิทธิ์
              </button>
            </>
          ) : (
            <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีพนักงานที่เข้าหอนี้ได้</p>
          )}
        </form>
      ) : null}
    </div>
  );
}

function BuildingScope({
  field,
  model,
  actions,
  setNotice,
}: {
  field: SettingsField;
  model: DormPolicyModel;
  actions: Actions;
  setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void;
}) {
  const bs = model.buildingScope;
  const [busy, setBusy] = useState(false);
  const canEdit = bs.editable && field.editable && !busy && !!actions.setBuildingAssignment;
  const toggle = async (memberId: string, buildingId: string, on: boolean) => {
    if (!actions.setBuildingAssignment) return;
    const cur = new Set(bs.assignments[memberId] ?? []);
    if (on) cur.add(buildingId);
    else cur.delete(buildingId);
    setBusy(true);
    const r = await actions.setBuildingAssignment({ membershipId: memberId, buildingIds: [...cur] });
    setBusy(false);
    setNotice(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "err", text: r.reason });
  };
  return (
    <div data-dp-building-scope="" data-scope-mode={bs.mode} data-setting-key={field.key} {...lockAttrs(field)} className="mt-2 flex min-w-0 flex-col gap-2 border-t border-[color:var(--color-line)] pt-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold text-[color:var(--color-ink)]">{field.labelTh}</span>
        <span className="sr-only">
          <span data-dp-pill="">{formatFieldValue(field, field.value)}</span>
        </span>
        <DefaultChip f={field} />
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        {bs.mode === "BUILDING" ? "ผู้ดูแลเห็นเฉพาะอาคารที่ติ๊ก · ไม่ติ๊กเลย = ไม่เห็นห้องใด (เจ้าของเห็นทั้งหอ)" : "ตอนนี้ทุกคนเห็นทั้งหอ — เปลี่ยน “ผู้ดูแลเห็นข้อมูล” เป็นเฉพาะอาคารเพื่อใช้ตารางนี้"}
      </p>
      {bs.buildings.length === 0 ? (
        <p className="text-xs text-[color:var(--color-muted)]">หอนี้ยังไม่มีอาคาร</p>
      ) : bs.members.length === 0 ? (
        <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีผู้ดูแลที่เข้าหอนี้ได้</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[color:var(--color-muted)]">
                <th className="py-1 text-left font-normal">ผู้ดูแล</th>
                {bs.buildings.map((b) => (
                  <th key={b.id} className="px-1 py-1 text-center font-normal">
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bs.members.map((m) => (
                <tr key={m.membershipId} data-member={m.membershipId} className="border-t border-[color:var(--color-line)]">
                  <td className="py-1 pr-2 text-[color:var(--color-ink)]">{m.nameTh}</td>
                  {bs.buildings.map((b) => {
                    const on = (bs.assignments[m.membershipId] ?? []).includes(b.id);
                    return (
                      <td key={b.id} className="px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          data-building={b.id}
                          aria-label={`${m.nameTh} เห็น${b.name}`}
                          className="h-5 w-5"
                          checked={on}
                          disabled={!canEdit}
                          onChange={(e) => void toggle(m.membershipId, b.id, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Locked f={field} />
    </div>
  );
}
