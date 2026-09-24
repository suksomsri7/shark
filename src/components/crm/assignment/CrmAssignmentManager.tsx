"use client";

// CrmAssignmentManager.tsx — หน้าจอ "มอบหมายอัตโนมัติ" ของ CRM v2 (ใบ C2.3 · พิมพ์เขียว §5.7 §11.5 · ภาพ 07 ขวา)
//   ตารางกฎตามลำดับ (กฎแรกที่เงื่อนไขตรง = ผู้ตัดสิน) + ป้าย "คิวถัดไป" ต่อกฎ · ผู้รับสำรอง · ทดลองว่า lead จะเข้าใคร
//   + ตารางพนักงาน (คิวงานค้าง · ลา · ปิดรับ) ตามภาพ 07 ขวา
// 🔴 'use client' + ด่าน F2.3: ไฟล์นี้ไม่ import โมดูล CRM เลย (แม้ไฟล์ `*-shared`) — ทะเบียนโหมด/เงื่อนไข/ป้าย/เพดาน
//    มาจากหน้า server ทาง props ทั้งชุด · เขียนข้อมูลผ่าน server action ของหน้าเท่านั้น
// 🔴 ตรวจค่าแบบ inline ในหน้า (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้ · testid ทุกตัวมีแถวใน scripts/crm-ui-inventory.json
// 🔴 กว้าง 1440px และ 390px ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ตารางมี overflow-x ของตัวเอง)

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createCrmAssignRuleAction,
  deleteCrmAssignRuleAction,
  reorderCrmAssignRulesAction,
  setCrmAssignFallbackAction,
  simulateCrmAssignAction,
  toggleCrmAssignRuleAction,
  updateCrmAssignRuleAction,
} from "@/app/app/sys/[id]/crm/settings/assignment/actions";
import type { CrmAssignPageData, CrmAssignRuleDraft, CrmAssignRuleView, CrmAssignSimResult } from "./types";

type Draft = CrmAssignRuleDraft & { id: string | null };

const valueOf = (v: string | string[]): string => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));
const toValue = (op: string, raw: string): string | string[] => (op === "in" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw.trim());

export function CrmAssignmentManager({ data }: { data: CrmAssignPageData }) {
  const router = useRouter();
  const { systemId, limits } = data;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<CrmAssignRuleView | null>(null);
  const [reason, setReason] = useState("");
  const [sim, setSim] = useState({ sourceKind: "WEB_FORM", sourceChannel: "", locale: "th", address: "", companySize: "", fieldKey: "", fieldValue: "", count: "4" });
  const [simOut, setSimOut] = useState<CrmAssignSimResult[] | null>(null);

  const userName = useMemo(() => new Map(data.users.map((u) => [u.id, u.name])), [data.users]);
  const teamName = useMemo(() => new Map(data.teams.map((t) => [t.id, t.name])), [data.teams]);
  const firstField = data.conditionFields[0]?.value ?? "sourceKind";
  const firstOp = data.ops[0]?.value ?? "eq";
  const emptyDraft = (): Draft => ({ id: null, name: "", mode: data.modes[0]?.value ?? "ROUND_ROBIN", userIds: [], teamId: null, maxOpenPerUser: null, conditions: { mode: "AND", items: [] }, active: true });

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string): Promise<boolean> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };

  const payload = (d: Draft): CrmAssignRuleDraft => ({
    name: d.name,
    mode: d.mode,
    userIds: d.userIds,
    teamId: d.teamId,
    maxOpenPerUser: d.maxOpenPerUser,
    conditions: d.conditions,
    active: d.active,
  });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setMsg({ ok: false, text: "ตั้งชื่อกฎสักหน่อย จะได้รู้ว่ากฎนี้ใช้ทำอะไร" });
      return;
    }
    const ok = await run(
      () => (draft.id ? updateCrmAssignRuleAction(systemId, draft.id, payload(draft)) : createCrmAssignRuleAction(systemId, payload(draft))),
      draft.id ? "บันทึกกฎแล้ว" : "เพิ่มกฎแล้ว — กฎใหม่ต่อท้ายลำดับ",
    );
    if (ok) setDraft(null);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const ids = data.rules.map((r) => r.id);
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    await run(() => reorderCrmAssignRulesAction(systemId, ids), "เรียงลำดับกฎใหม่แล้ว");
  };

  const runSimulate = async () => {
    const n = Math.max(1, Math.min(limits.simMax, Number(sim.count) || 1));
    // ส่งครบทุกชนิดเงื่อนไขที่กรอกได้ — ฟิลด์กำหนดเองส่งเป็นคู่ คีย์:ค่า (คีย์มาจากรายการเงื่อนไข `f.<key>`)
    const key = sim.fieldKey.startsWith(data.customFieldPrefix) ? sim.fieldKey.slice(data.customFieldPrefix.length) : sim.fieldKey;
    const fields = key && sim.fieldValue.trim() ? { [key]: sim.fieldValue.trim() } : null;
    const rows = Array.from({ length: n }, () => ({
      sourceKind: sim.sourceKind || null,
      sourceChannel: sim.sourceChannel.trim() || null,
      locale: sim.locale || null,
      address: sim.address.trim() || null,
      companySize: sim.companySize || null,
      fields,
    }));
    setBusy(true);
    const r = await simulateCrmAssignAction(systemId, rows);
    setBusy(false);
    if (r.ok) {
      setSimOut(r.results);
      setMsg({ ok: true, text: `ทดลอง ${r.results.length} รายการแล้ว — ไม่มีการบันทึกอะไร คิวจริงไม่ขยับ` });
    } else {
      setSimOut(null);
      setMsg({ ok: false, text: r.error });
    }
  };

  const modeHint = (m: string) => data.modes.find((x) => x.value === m)?.hint ?? "";
  /** เงื่อนไข "ฟิลด์กำหนดเอง" ที่ตั้งได้ (ใช้ในช่องทดลองด้วย) */
  const customFields = useMemo(() => data.conditionFields.filter((f) => f.value.startsWith(data.customFieldPrefix)), [data.conditionFields, data.customFieldPrefix]);
  const listFor = (field: string) => (field === "sourceKind" ? "crm-assign-source-values" : field === "companySize" ? "crm-assign-size-values" : field === "language" ? "crm-assign-language-values" : undefined);
  const patchItem = (d: Draft, idx: number, next: Partial<{ field: string; op: string; value: string | string[] }>): Draft => ({
    ...d,
    conditions: { ...d.conditions, items: d.conditions.items.map((x, k) => (k === idx ? { ...x, ...next } : x)) },
  });

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-assign-page">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-muted)]" : "text-red-600"}`} role="status" data-testid="crm-assign-error">
          {msg.text}
        </p>
      )}

      {/* ── กฎมอบหมาย (ตามลำดับ) ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-rules-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="crm-assign-rules-heading" className="text-base font-semibold">
            กฎมอบหมาย <span className="text-xs font-normal text-[color:var(--color-muted)]">ใช้กับ lead ใหม่ทุกทางเข้าที่ไม่มีคนเลือกผู้ดูแลเอง · กฎแรกที่เงื่อนไขตรงเป็นผู้ตัดสิน</span>
          </h2>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setDraft(emptyDraft())} data-testid="crm-assign-rule-new">
            เพิ่มกฎ
          </button>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[720px]" data-testid="crm-assign-rule-list">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="p-2 font-medium">ลำดับ</th>
                <th className="p-2 font-medium">กฎ</th>
                <th className="p-2 font-medium">วิธีแจก</th>
                <th className="p-2 font-medium">คนที่รับ</th>
                <th className="p-2 font-medium">คิวถัดไป</th>
                <th className="p-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rules.length === 0 && (
                <tr>
                  <td className="p-3 text-[color:var(--color-muted)]" colSpan={6}>
                    ยังไม่มีกฎ — lead ใหม่ที่ไม่มีคนเลือกผู้ดูแลจะไปหาผู้รับสำรองด้านล่าง ถ้าไม่มีอีกก็จะยังไม่มีผู้ดูแล และระบบจะแจ้งเจ้าของร้าน/ผู้จัดการให้มอบหมายเอง
                  </td>
                </tr>
              )}
              {data.rules.map((r, i) => (
                <tr key={r.id} data-testid={`crm-assign-rule-row-${r.id}`} data-active={r.active ? "1" : "0"}>
                  <td className="p-2 align-top tabular-nums">{i + 1}</td>
                  <td className="p-2 align-top">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-[color:var(--color-muted)]">{r.summary}</span>
                    {!r.active && <span className="block text-xs text-amber-600">ปิดอยู่ — ระบบข้ามกฎนี้</span>}
                  </td>
                  <td className="p-2 align-top">
                    {r.modeLabel}
                    {r.maxOpenPerUser !== null && <span className="block text-xs text-[color:var(--color-muted)]">เพดานคนละ {r.maxOpenPerUser} งาน</span>}
                  </td>
                  <td className="p-2 align-top">
                    {r.teamId ? `ทีม ${teamName.get(r.teamId) ?? "—"}` : ""}
                    {r.userIds.length > 0 && <span className="block text-xs text-[color:var(--color-muted)]">{r.userIds.map((u) => userName.get(u) ?? "พนักงานที่ถูกเอาออก").join(" · ")}</span>}
                    {!r.teamId && r.userIds.length === 0 && <span className="text-[color:var(--color-muted)]">—</span>}
                  </td>
                  <td className="p-2 align-top">
                    <span data-testid={`crm-assign-next-${r.id}`}>{r.nextUserId ? (userName.get(r.nextUserId) ?? "พนักงาน") : "ยังไม่มีใครรับได้"}</span>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-sm" disabled={busy || i === 0} aria-label={`เลื่อนกฎ ${r.name} ขึ้น`} onClick={() => void move(i, -1)} data-testid={`crm-assign-rule-move-up-${r.id}`}>
                        ขึ้น
                      </button>
                      <button type="button" className="btn btn-sm" disabled={busy || i === data.rules.length - 1} aria-label={`เลื่อนกฎ ${r.name} ลง`} onClick={() => void move(i, 1)} data-testid={`crm-assign-rule-move-down-${r.id}`}>
                        ลง
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        aria-label={`แก้กฎ ${r.name}`}
                        onClick={() => setDraft({ id: r.id, name: r.name, mode: r.mode, userIds: [...r.userIds], teamId: r.teamId, maxOpenPerUser: r.maxOpenPerUser, conditions: { mode: r.conditions.mode, items: r.conditions.items.map((c) => ({ ...c })) }, active: r.active })}
                        data-testid={`crm-assign-rule-edit-${r.id}`}
                      >
                        แก้
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        aria-label={`${r.active ? "ปิด" : "เปิด"}กฎ ${r.name}`}
                        onClick={() => void run(() => toggleCrmAssignRuleAction(systemId, r.id, !r.active), r.active ? "ปิดกฎแล้ว (กฎยังอยู่ เปิดกลับได้ทุกเมื่อ)" : "เปิดกฎแล้ว")}
                        data-testid={`crm-assign-rule-toggle-${r.id}`}
                      >
                        {r.active ? "ปิด" : "เปิด"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm text-red-600"
                        disabled={busy}
                        aria-label={`ลบกฎ ${r.name}`}
                        onClick={() => {
                          setRemoving(r);
                          setReason("");
                        }}
                        data-testid={`crm-assign-rule-delete-${r.id}`}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ตัวแก้กฎ ── */}
      {draft && (
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-editor-heading" data-testid="crm-assign-editor">
          <h2 id="crm-assign-editor-heading" className="text-base font-semibold">
            {draft.id ? "แก้กฎมอบหมาย" : "กฎมอบหมายใหม่"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>ชื่อกฎ</span>
              <input className="input" value={draft.name} maxLength={limits.nameMax} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="crm-assign-rule-name" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>วิธีแจกงาน</span>
              <select className="input" value={draft.mode} disabled={busy} onChange={(e) => setDraft({ ...draft, mode: e.target.value })} data-testid="crm-assign-rule-mode">
                {data.modes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[color:var(--color-muted)]">{modeHint(draft.mode)}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>ทีม (ใช้กับ “หัวหน้าทีม” และใช้ดูว่าใครปิดรับงานอยู่)</span>
              <select className="input" value={draft.teamId ?? ""} disabled={busy} onChange={(e) => setDraft({ ...draft, teamId: e.target.value || null })} data-testid="crm-assign-rule-team">
                <option value="">ไม่ระบุทีม</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>เพดานงานค้างต่อคน (เว้นว่าง = ไม่จำกัด)</span>
              <input
                className="input"
                type="number"
                min={limits.maxOpenMin}
                max={limits.maxOpenMax}
                value={draft.maxOpenPerUser ?? ""}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, maxOpenPerUser: e.target.value === "" ? null : Number(e.target.value) })}
                data-testid="crm-assign-rule-max-open"
              />
            </label>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm">คนที่รับงานของกฎนี้ (ไม่เลือกเลย = ใช้สมาชิกของทีมที่เลือกไว้)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {data.users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.userIds.includes(u.id)}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, userIds: e.target.checked ? [...draft.userIds, u.id] : draft.userIds.filter((x) => x !== u.id) })}
                    data-testid={`crm-assign-rule-user-${u.id}`}
                  />
                  <span>
                    {u.name}
                    <span className="text-xs text-[color:var(--color-muted)]"> · คิว {u.load}</span>
                  </span>
                </label>
              ))}
              {data.users.length === 0 && <span className="text-sm text-[color:var(--color-muted)]">ยังไม่มีพนักงานที่เห็นผู้ติดต่อในร้านนี้ — ให้สิทธิ์ที่หน้าทีมก่อน</span>}
            </div>
          </fieldset>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm">เงื่อนไข (ไม่ใส่เลย = ใช้กับ lead ใหม่ทุกราย)</legend>
            <label className="flex w-fit flex-col gap-1 text-sm">
              <span>รวมเงื่อนไขแบบ</span>
              <select className="input" value={draft.conditions.mode} disabled={busy} onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, mode: e.target.value } })} data-testid="crm-assign-cond-mode">
                <option value="AND">ต้องตรงทุกข้อ (และ)</option>
                <option value="OR">ตรงข้อใดข้อหนึ่ง (หรือ)</option>
              </select>
            </label>
            {draft.conditions.items.map((c, idx) => (
              <div key={`${c.field}-${idx}`} className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>ข้อมูล</span>
                  <select className="input" value={c.field} disabled={busy} onChange={(e) => setDraft(patchItem(draft, idx, { field: e.target.value }))} data-testid={`crm-assign-cond-field-${idx}`}>
                    {data.conditionFields.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>เทียบแบบ</span>
                  <select
                    className="input"
                    value={c.op}
                    disabled={busy}
                    onChange={(e) => setDraft(patchItem(draft, idx, { op: e.target.value, value: toValue(e.target.value, valueOf(c.value)) }))}
                    data-testid={`crm-assign-cond-op-${idx}`}
                  >
                    {data.ops.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm">
                  <span>ค่า{c.op === "in" ? " (คั่นด้วยจุลภาค)" : ""}</span>
                  <input
                    className="input"
                    list={listFor(c.field)}
                    value={valueOf(c.value)}
                    disabled={busy}
                    onChange={(e) => setDraft(patchItem(draft, idx, { value: toValue(c.op, e.target.value) }))}
                    data-testid={`crm-assign-cond-value-${idx}`}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  aria-label={`ลบเงื่อนไขข้อที่ ${idx + 1}`}
                  onClick={() => setDraft({ ...draft, conditions: { ...draft.conditions, items: draft.conditions.items.filter((_, k) => k !== idx) } })}
                  data-testid={`crm-assign-cond-remove-${idx}`}
                >
                  ลบเงื่อนไข
                </button>
              </div>
            ))}
            <datalist id="crm-assign-source-values">
              {data.sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </datalist>
            <datalist id="crm-assign-size-values">
              {data.sizes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </datalist>
            <datalist id="crm-assign-language-values">
              {data.languages.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              className="btn btn-sm w-fit"
              disabled={busy}
              onClick={() => setDraft({ ...draft, conditions: { ...draft.conditions, items: [...draft.conditions.items, { field: firstField, op: firstOp, value: "" }] } })}
              data-testid="crm-assign-cond-add"
            >
              เพิ่มเงื่อนไข
            </button>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()} data-testid="crm-assign-rule-save">
              บันทึกกฎ
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setDraft(null)} data-testid="crm-assign-rule-cancel">
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {/* ── ลบกฎ (ยืนยัน + เหตุผล) ── */}
      {removing && (
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-delete-heading" data-testid="crm-assign-delete-box">
          <h2 id="crm-assign-delete-heading" className="text-base font-semibold">
            ลบกฎ “{removing.name}” ถาวร
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span>เหตุผลที่ลบ (อย่างน้อย {limits.deleteReasonMin} ตัวอักษร — เก็บไว้ในประวัติการแก้ไข)</span>
            <input className="input" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} data-testid="crm-assign-delete-reason" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                if (reason.trim().length < limits.deleteReasonMin) {
                  setMsg({ ok: false, text: `ใส่เหตุผลอีกนิด (อย่างน้อย ${limits.deleteReasonMin} ตัวอักษร) จะได้รู้ภายหลังว่าลบเพราะอะไร` });
                  return;
                }
                if (await run(() => deleteCrmAssignRuleAction(systemId, removing.id, reason.trim()), "ลบกฎแล้ว")) setRemoving(null);
              }}
              data-testid="crm-assign-delete-confirm"
            >
              ยืนยันลบ
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setRemoving(null)} data-testid="crm-assign-delete-cancel">
              ไม่ลบแล้ว
            </button>
          </div>
        </section>
      )}

      {/* ── ผู้รับสำรอง ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-fallback-heading">
        <h2 id="crm-assign-fallback-heading" className="text-base font-semibold">
          ผู้รับสำรอง <span className="text-xs font-normal text-[color:var(--color-muted)]">ใช้เมื่อกฎที่ตรงไม่มีใครรับได้ หรือไม่มีกฎไหนตรงเลย</span>
        </h2>
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          <span>พนักงานที่รับ lead ที่ตกหล่น</span>
          <select
            className="input"
            value={data.fallbackUserId ?? ""}
            disabled={busy}
            onChange={(e) => void run(() => setCrmAssignFallbackAction(systemId, e.target.value || null), e.target.value ? "ตั้งผู้รับสำรองแล้ว" : "เลิกใช้ผู้รับสำรองแล้ว — lead ที่ตกหล่นจะยังไม่มีผู้ดูแล และระบบจะแจ้งเจ้าของร้าน/ผู้จัดการ")}
            data-testid="crm-assign-fallback"
          >
            <option value="">ไม่ตั้งผู้รับสำรอง</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* ── ทดลอง ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-sim-heading">
        <h2 id="crm-assign-sim-heading" className="text-base font-semibold">
          ทดลองดูก่อน <span className="text-xs font-normal text-[color:var(--color-muted)]">ดูว่า lead แบบนี้จะเข้าใคร — ไม่บันทึกอะไร คิวจริงไม่ขยับ</span>
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>ช่องทางที่มา</span>
            <select className="input" value={sim.sourceKind} disabled={busy} onChange={(e) => setSim({ ...sim, sourceKind: e.target.value })} data-testid="crm-assign-sim-source">
              {data.sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>ช่องทางย่อย (เช่น facebook)</span>
            <input className="input" value={sim.sourceChannel} disabled={busy} onChange={(e) => setSim({ ...sim, sourceChannel: e.target.value })} data-testid="crm-assign-sim-channel" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>ภาษาของลูกค้า</span>
            <select className="input" value={sim.locale} disabled={busy} onChange={(e) => setSim({ ...sim, locale: e.target.value })} data-testid="crm-assign-sim-language">
              {data.languages.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span>ที่อยู่ของลูกค้า (ใช้กับเงื่อนไขจังหวัด)</span>
            <input className="input" value={sim.address} disabled={busy} placeholder="เช่น 99 หาดกะตะ ภูเก็ต" onChange={(e) => setSim({ ...sim, address: e.target.value })} data-testid="crm-assign-sim-address" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>ขนาดบริษัท</span>
            <select className="input" value={sim.companySize} disabled={busy} onChange={(e) => setSim({ ...sim, companySize: e.target.value })} data-testid="crm-assign-sim-size">
              <option value="">ไม่ระบุ (ลูกค้าบุคคล)</option>
              {data.sizes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {customFields.length > 0 && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span>ฟิลด์กำหนดเอง</span>
                <select className="input" value={sim.fieldKey} disabled={busy} onChange={(e) => setSim({ ...sim, fieldKey: e.target.value })} data-testid="crm-assign-sim-field">
                  <option value="">ไม่ใช้</option>
                  {customFields.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span>ค่าของฟิลด์นั้น</span>
                <input className="input" value={sim.fieldValue} disabled={busy} onChange={(e) => setSim({ ...sim, fieldValue: e.target.value })} data-testid="crm-assign-sim-field-value" />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span>กี่ราย (1–{limits.simMax})</span>
            <input className="input w-24" type="number" min={1} max={limits.simMax} value={sim.count} disabled={busy} onChange={(e) => setSim({ ...sim, count: e.target.value })} data-testid="crm-assign-sim-count" />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void runSimulate()} data-testid="crm-assign-simulate-run">
            ทดลอง
          </button>
        </div>
        {/* ความซื่อสัตย์ของการทดลอง: บอกบนจอตรง ๆ ว่าอะไรที่มันยังไม่ครอบ */}
        {!data.timeOffAware && (
          <p className="text-xs text-[color:var(--color-muted)]" data-testid="crm-assign-leave-note">
            บัญชีของคุณไม่ได้เปิดสิทธิ์ดูข้อมูลการลาของพนักงาน — ผลการทดลองและป้าย “คิวถัดไป” ที่คุณเห็น<b>ไม่ได้คิดเรื่องวันลา</b> ของจริงระบบจะข้ามคนที่ลาอยู่ให้เอง
          </p>
        )}
        <p className="text-xs text-[color:var(--color-muted)]">
          การทดลองใช้ค่าที่กรอกที่นี่ตรง ๆ · ของจริงอ่าน<b>จังหวัด</b>จากที่อยู่ในระเบียนลูกค้า (ไม่มีก็ของบริษัทที่ผูกไว้) และอ่าน<b>ขนาดบริษัท</b>จากบริษัทที่ผูกกับลีดใบนั้น
          {" "}สิ่งที่การทดลอง<b>ยังไม่ครอบ</b>: งานค้างที่เปลี่ยนไประหว่างวัน (เพดาน/คนงานค้างน้อยสุดคิดจากคิวตอนนี้) · คิวจริงของ “วนตามคิว” ไม่ขยับ ·
          {" "}คนที่ลาหรือปิดรับหลังจากนี้ · ลีดซ้ำกับลูกค้าเดิม (ของจริงจะไม่สร้างใบใหม่)
        </p>
        {simOut && (
          <ol className="flex flex-col gap-1 text-sm" data-testid="crm-assign-simulate-result">
            {simOut.map((r) => (
              <li key={r.index} className="flex flex-wrap gap-2">
                <span className="tabular-nums text-[color:var(--color-muted)]">#{r.index + 1}</span>
                <span className="font-medium">{r.ownerUserId ? (userName.get(r.ownerUserId) ?? "พนักงาน") : "ยังไม่มีผู้ดูแล"}</span>
                <span className="text-[color:var(--color-muted)]">{r.reasonText}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── คิวของพนักงาน (อ่านอย่างเดียว) ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-assign-queue-heading">
        <h2 id="crm-assign-queue-heading" className="text-base font-semibold">
          คิวของพนักงาน <span className="text-xs font-normal text-[color:var(--color-muted)]">งานค้าง = lead ที่ยังไม่ปิด + ดีลที่ยังเปิดอยู่ในระบบนี้</span>
        </h2>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="p-2 font-medium">พนักงาน</th>
                <th className="p-2 font-medium">คิว</th>
                <th className="p-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="p-2">{u.name}</td>
                  <td className="p-2 tabular-nums">{u.load}</td>
                  {/* สถานะลามีมาเฉพาะผู้ดูที่มีสิทธิ์ดูข้อมูลการลาของร้าน — ไม่มีมา = บอกได้แค่ "ปิดรับ lead" / "รับงานได้" */}
                  <td className="p-2 text-[color:var(--color-muted)]">{u.onLeave === true ? "ลาอยู่วันนี้" : !u.accepting ? "ปิดรับ lead" : "รับงานได้"}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td className="p-3 text-[color:var(--color-muted)]" colSpan={3}>
                    ยังไม่มีพนักงานที่เห็นผู้ติดต่อในร้านนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
