"use client";

// VisibilitySettings.tsx — หน้า "การมองเห็นข้อมูล" ของ CRM v2 (ใบ C1.7 · §6.2 · มติ C9 · ภาพ 10 ซ้ายกลาง)
// ตาราง บทบาท × ชนิดข้อมูล (CONTACT · COMPANY · DEAL · ACTIVITY · REPORT) — พนักงานขาย/ผู้จัดการแก้ได้ (= policy ระดับบทบาท)
// หัวหน้าทีม/เจ้าของร้าน = กติกาตายตัว · ใต้ตาราง = การตั้งทับต่อทีม / ต่อ pipeline (เพิ่ม · ลบ) ผ่าน visibility policies
// 🔴 'use client': ไม่ import โมดูลที่ลากถึง prisma — ป้าย/ตัวเลือกทั้งหมดมาจากหน้า server ทาง props · เขียนผ่าน server action
// 🔴 ข้อผิดพลาดแสดงในหน้า (inline) · testid คงที่ (แถวซ้ำแยกด้วย data-*) ตามทะเบียน crm-ui-inventory

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeVisibilityPolicyAction, setVisibilityPolicyAction } from "@/app/app/sys/[id]/crm/settings/visibility/actions";

type Opt = { value: string; label: string };
export type MatrixCell = { entity: string; level: string; source: "policy" | "settings" | "default"; policyId: string | null };
export type MatrixRow = { key: string; label: string; editable: boolean; cells: MatrixCell[] };
export type OverrideRow = { id: string; team: string; pipeline: string; role: string; entity: string; level: string };
type Result = { ok: true } | { ok: false; error: string };

const SOURCE_LABEL: Record<MatrixCell["source"], string> = { policy: "ตั้งไว้", settings: "ค่าของร้าน", default: "ค่าเริ่มต้น" };

export function VisibilitySettings({
  systemId,
  matrix,
  fixed,
  overrides,
  entities,
  levels,
  roles,
  teams,
  pipelines,
}: {
  systemId: string;
  matrix: MatrixRow[];
  fixed: MatrixRow[];
  overrides: OverrideRow[];
  entities: Opt[];
  levels: Opt[];
  roles: Opt[];
  teams: Opt[];
  pipelines: Opt[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ teamId: "", pipelineId: "", role: "", entity: "DEAL", visibility: "ALL" });
  const entityLabel = new Map(entities.map((e) => [e.value, e.label]));

  const run = async (f: () => Promise<Result>, okText: string): Promise<boolean> => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };

  const rowsAll = [...matrix, ...fixed];
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="visibility-settings">
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="vis-matrix-heading">
        <h2 id="vis-matrix-heading" className="text-base font-semibold">
          การมองเห็น (Visibility) <span className="text-xs font-normal text-[color:var(--color-muted)]">ต่อบทบาท</span>
        </h2>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-testid="visibility-matrix">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="p-2 font-medium">บทบาท</th>
                {entities.map((e) => (
                  <th key={e.value} className="p-2 font-medium">
                    {e.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rowsAll.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="p-2 text-left font-normal">
                    {row.label}
                  </th>
                  {row.cells.map((c) => (
                    <td key={c.entity} className="p-2 align-top">
                      {row.editable ? (
                        <div className="flex flex-col gap-1">
                          <select
                            className="input text-sm"
                            value={c.level}
                            disabled={busy}
                            aria-label={`${row.label} — ${entityLabel.get(c.entity) ?? c.entity}`}
                            onChange={(ev) => void run(() => setVisibilityPolicyAction(systemId, { role: row.key, entity: c.entity, visibility: ev.target.value }), "บันทึกการมองเห็นแล้ว — มีผลตั้งแต่คำขอถัดไป")}
                            data-testid="visibility-cell"
                            data-role={row.key}
                            data-entity={c.entity}
                          >
                            {levels.map((l) => (
                              <option key={l.value} value={l.value}>
                                {l.value}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-[color:var(--color-muted)]">
                            {SOURCE_LABEL[c.source]}
                            {c.policyId && (
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  className="underline"
                                  disabled={busy}
                                  onClick={() => void run(() => removeVisibilityPolicyAction(systemId, c.policyId!), "กลับไปใช้ค่าเริ่มต้นแล้ว")}
                                  data-testid="visibility-cell-reset"
                                  data-role={row.key}
                                  data-entity={c.entity}
                                >
                                  ใช้ค่าเริ่มต้น
                                </button>
                              </>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span>{c.level}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          {levels.map((l) => (
            <li key={l.value}>
              <b>{l.value}</b> = {l.label}
            </li>
          ))}
          <li>
            โอนดีลข้ามทีมต้องมีสิทธิ์ <code>crm.deal.reassign</code> · พนักงานที่ยังไม่อยู่ทีมไหนเห็นเฉพาะของตัวเอง · เปลี่ยนแล้วมีผลทันทีในคำขอถัดไป
          </li>
        </ul>
      </section>

      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="vis-override-heading">
        <h2 id="vis-override-heading" className="text-base font-semibold">
          ตั้งทับต่อทีม / ต่อ pipeline
        </h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          ลำดับที่ใช้: pipeline + ทีม → ทีม → บทบาท (ตารางด้านบน) → ค่าของร้าน → ค่าเริ่มต้น · เช่น pipeline &quot;ลูกค้าองค์กร&quot; ให้ทีมกรุงเทพเห็นทั้งร้าน
        </p>
        {overrides.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="visibility-override-empty">
            ยังไม่มีการตั้งทับ — ทุกทีมใช้ค่าตามตารางด้านบน
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col divide-y rounded-lg border">
            {overrides.map((o) => (
              <li key={o.id} className="flex min-w-0 flex-wrap items-center gap-2 p-2 text-sm" data-testid="visibility-override-row" data-id={o.id}>
                <span className="min-w-0 flex-1">
                  <b>{o.team}</b> · {o.pipeline} · {o.role} · {o.entity} → <b>{o.level}</b>
                </span>
                <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => void run(() => removeVisibilityPolicyAction(systemId, o.id), "ลบการตั้งทับแล้ว")} data-testid="visibility-override-remove" data-id={o.id}>
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.teamId && !form.pipelineId) return setMsg({ ok: false, text: "เลือกทีม หรือ pipeline อย่างน้อยหนึ่งอย่าง (ค่าต่อบทบาทแก้ในตารางด้านบน)" });
            if (form.pipelineId && form.entity !== "DEAL") return setMsg({ ok: false, text: "การตั้งทับต่อ pipeline ใช้ได้กับดีลเท่านั้น — เลือกชนิดข้อมูลเป็นดีล" });
            void run(() => setVisibilityPolicyAction(systemId, form), "เพิ่มการตั้งทับแล้ว");
          }}
          data-testid="visibility-override-form"
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ทีม</span>
            <select className="input text-sm" value={form.teamId} onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))} data-testid="visibility-override-team">
              <option value="">ทุกทีม</option>
              {teams.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>pipeline (เฉพาะดีล)</span>
            <select className="input text-sm" value={form.pipelineId} onChange={(e) => setForm((f) => ({ ...f, pipelineId: e.target.value }))} data-testid="visibility-override-pipeline">
              <option value="">ทุก pipeline</option>
              {pipelines.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>บทบาท</span>
            <select className="input text-sm" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} data-testid="visibility-override-role">
              <option value="">ทุกบทบาท</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชนิดข้อมูล</span>
            <select className="input text-sm" value={form.entity} onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))} data-testid="visibility-override-entity">
              {entities.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ระดับ</span>
            <select className="input text-sm" value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} data-testid="visibility-override-level">
              {levels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.value} — {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary w-full text-sm" disabled={busy} data-testid="visibility-override-add">
              เพิ่มการตั้งทับ
            </button>
          </div>
        </form>
      </section>

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="visibility-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
