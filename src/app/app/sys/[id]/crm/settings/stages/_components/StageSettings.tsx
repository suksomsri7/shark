"use client";

// StageSettings.tsx — ตั้งค่าขั้นของ pipeline (CRM v2 · ใบ C1.5 · §3.7 "ดีลนิ่งต่อขั้น" · §11.3 เงื่อนไขก่อนเข้าขั้น)
//   ชื่อ · ชนิด (เปิด/ชนะ/แพ้ — เปลี่ยนได้เมื่อไม่มีดีลในขั้น) · โอกาสปิด % · วันที่ถือว่านิ่ง · ฟิลด์ที่ต้องกรอก · ต้องมีรายการ/ใบเสนอราคา ·
//   เรียงขึ้น/ลง · ลบ (เมื่อไม่มีดีล) · เพิ่มขั้น — ข้อความไทยจากบริการแสดงใต้แต่ละส่วน (ไม่ใช้ alert)

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addStageAction, deleteStageAction, reorderStagesAction, updateStageAction } from "@/lib/modules/crm/pipelines-actions";
import { DEAL_KIND_LABEL, STAGE_REQUIRABLE_LABEL, STAGE_REQUIRABLE_SYSTEM_KEYS, type DealKind, type PipelineDto, type StageDto } from "@/lib/modules/crm/deals-shared";

type Draft = { name: string; kind: DealKind; probability: string; staleDays: string; requireFields: string[]; requireLines: boolean; requireQuotation: boolean };
const toDraft = (s: StageDto): Draft => ({ name: s.name, kind: s.kind, probability: String(s.probability), staleDays: s.staleDays === null ? "" : String(s.staleDays), requireFields: s.requireFields, requireLines: s.requireLines, requireQuotation: s.requireQuotation });
const KINDS: DealKind[] = ["OPEN", "WON", "LOST"];

export function StageSettings({
  systemId,
  pipeline,
  pipelines,
  customFields,
}: {
  systemId: string;
  pipeline: PipelineDto;
  pipelines: { id: string; name: string }[];
  customFields: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(pipeline.stages.map((s) => [s.id, toDraft(s)])));
  const [msgs, setMsgs] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<DealKind>("OPEN");
  const [newProb, setNewProb] = useState("20");
  const requirable = [...STAGE_REQUIRABLE_SYSTEM_KEYS.map((k) => ({ key: k as string, label: STAGE_REQUIRABLE_LABEL[k] })), ...customFields];

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  const say = (id: string, ok: boolean, text: string) => setMsgs((m) => ({ ...m, [id]: { ok, text } }));
  const run = async (id: string, f: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    say(id, r.ok, r.ok ? okText : r.error);
    if (r.ok) router.refresh();
    return r.ok;
  };
  const order = pipeline.stages.map((s) => s.id);
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void run(id, () => reorderStagesAction(systemId, pipeline.id, next), "เรียงใหม่แล้ว");
  };

  return (
    <div className="flex flex-col gap-4" data-testid="stage-settings">
      <label className="flex max-w-sm flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>pipeline</span>
        <select value={pipeline.id} onChange={(e) => router.push(`/app/sys/${systemId}/crm/settings/stages?pipeline=${encodeURIComponent(e.target.value)}`)} className="input text-sm" data-testid="st-pipeline-select">
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <ol className="flex flex-col gap-3">
        {pipeline.stages.map((s, i) => {
          const d = drafts[s.id] ?? toDraft(s);
          return (
            <li key={s.id} className="card flex flex-col gap-3 p-4" data-testid={`st-row-${s.id}`}>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_90px_110px]">
                <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>ชื่อขั้น</span>
                  <input value={d.name} onChange={(e) => set(s.id, { name: e.target.value })} className="input text-sm" data-testid={`st-name-${s.id}`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>ชนิด</span>
                  <select value={d.kind} onChange={(e) => set(s.id, { kind: e.target.value as DealKind })} className="input text-sm" data-testid={`st-kind-${s.id}`}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DEAL_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>โอกาสปิด %</span>
                  <input value={d.probability} onChange={(e) => set(s.id, { probability: e.target.value })} inputMode="numeric" className="input text-sm" data-testid={`st-prob-${s.id}`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>นิ่งเมื่อเกิน (วัน)</span>
                  <input value={d.staleDays} onChange={(e) => set(s.id, { staleDays: e.target.value })} inputMode="numeric" placeholder="ค่าเริ่มต้น" className="input text-sm" data-testid={`st-stale-${s.id}`} />
                </label>
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs text-[color:var(--color-muted)]">ต้องมีข้อมูลนี้ก่อนย้ายดีลเข้าขั้นนี้</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {requirable.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={d.requireFields.includes(f.key)}
                        onChange={(e) => set(s.id, { requireFields: e.target.checked ? [...d.requireFields, f.key] : d.requireFields.filter((k) => k !== f.key) })}
                        data-testid={`st-req-${s.id}-${f.key}`}
                      />
                      {f.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={d.requireLines} onChange={(e) => set(s.id, { requireLines: e.target.checked })} data-testid={`st-req-lines-${s.id}`} />
                    มีรายการสินค้า
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={d.requireQuotation} onChange={(e) => set(s.id, { requireQuotation: e.target.checked })} data-testid={`st-req-quote-${s.id}`} />
                    ออกใบเสนอราคาแล้ว
                  </label>
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  disabled={busy}
                  onClick={() => {
                    const prob = Number(d.probability);
                    const stale = d.staleDays.trim() === "" ? null : Number(d.staleDays);
                    if (!Number.isInteger(prob) || prob < 0 || prob > 100) return say(s.id, false, "โอกาสปิดต้องเป็นจำนวนเต็ม 0–100");
                    if (stale !== null && (!Number.isInteger(stale) || stale < 0 || stale > 365)) return say(s.id, false, "จำนวนวันนิ่งต้องเป็นจำนวนเต็ม 0–365 หรือเว้นว่าง");
                    void run(s.id, () => updateStageAction(systemId, s.id, { name: d.name, kind: d.kind, probability: prob, staleDays: stale, requireFields: d.requireFields, requireLines: d.requireLines, requireQuotation: d.requireQuotation }), "บันทึกขั้นแล้ว");
                  }}
                  data-testid={`st-save-${s.id}`}
                >
                  บันทึก
                </button>
                <button type="button" className="btn btn-ghost text-sm" disabled={busy || i === 0} onClick={() => move(s.id, -1)} aria-label={`เลื่อนขั้น ${s.name} ขึ้น`} data-testid={`st-up-${s.id}`}>
                  ↑
                </button>
                <button type="button" className="btn btn-ghost text-sm" disabled={busy || i === pipeline.stages.length - 1} onClick={() => move(s.id, 1)} aria-label={`เลื่อนขั้น ${s.name} ลง`} data-testid={`st-down-${s.id}`}>
                  ↓
                </button>
                <button type="button" className="btn btn-ghost text-sm" style={{ color: "var(--color-danger)" }} disabled={busy} onClick={() => void run(s.id, () => deleteStageAction(systemId, s.id), "ลบขั้นแล้ว")} data-testid={`st-delete-${s.id}`}>
                  ลบขั้น
                </button>
                {msgs[s.id] && (
                  <span className="text-sm" style={{ color: msgs[s.id]!.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status">
                    {msgs[s.id]!.text}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <form
        className="card flex flex-col gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const prob = Number(newProb);
          if (!newName.trim()) return say("new", false, "ใส่ชื่อขั้นก่อน");
          if (!Number.isInteger(prob) || prob < 0 || prob > 100) return say("new", false, "โอกาสปิดต้องเป็นจำนวนเต็ม 0–100");
          void run("new", () => addStageAction(systemId, pipeline.id, { name: newName.trim(), kind: newKind, probability: prob }), "เพิ่มขั้นแล้ว").then((ok) => {
            if (ok) setNewName("");
          });
        }}
        data-testid="st-new-form"
      >
        <h2 className="font-semibold">เพิ่มขั้น</h2>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_90px]">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อขั้น</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input text-sm" data-testid="st-new-name" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชนิด</span>
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as DealKind)} className="input text-sm" data-testid="st-new-kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {DEAL_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>โอกาสปิด %</span>
            <input value={newProb} onChange={(e) => setNewProb(e.target.value)} inputMode="numeric" className="input text-sm" data-testid="st-new-prob" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          {msgs.new && (
            <span className="text-sm" style={{ color: msgs.new.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status">
              {msgs.new.text}
            </span>
          )}
          <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="st-new-submit">
            เพิ่มขั้น
          </button>
        </div>
      </form>
    </div>
  );
}
