"use client";

// TeamsManager.tsx — หน้า "ทีมขาย" (CRM v2 ใบ C1.7 · ภาพ 10 ซ้ายบน · §11.6)
// การ์ดทีม (ชื่อ · จำนวนคน · หัวหน้า · สาขา) + สร้างทีม → เลือกการ์ด = แผงรายละเอียด: เปลี่ยนชื่อ · สาขา · หัวหน้า ·
// สมาชิก (รับลีด เปิด/ปิด · เอาออก พร้อมคำเตือน "โอนดีลก่อนไหม") · เพิ่มสมาชิก · เก็บถาวร/กู้คืน
// 🔴 'use client': ไม่ import โมดูลที่ลากถึง prisma — ข้อมูลมาจากหน้า server ทาง props · เขียนผ่าน server action เท่านั้น
// 🔴 ข้อผิดพลาดแสดงในหน้า (inline) ไม่ใช้ alert() · testid คงที่ (แถวซ้ำแยกด้วย data-id) ตามทะเบียน crm-ui-inventory

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addMemberAction,
  archiveTeamAction,
  createTeamAction,
  removeMemberAction,
  renameTeamAction,
  restoreTeamAction,
  setAcceptingLeadsAction,
  setLeadAction,
  setTeamUnitsAction,
} from "@/app/app/settings/teams/actions";

export type TeamMemberView = { userId: string; name: string; role: "LEAD" | "MEMBER"; acceptingLeads: boolean };
export type TeamView = { id: string; name: string; leadUserId: string | null; unitIds: string[]; archived: boolean; members: TeamMemberView[] };
type Person = { userId: string; name: string };
type Unit = { id: string; name: string };
type Result = { ok: true } | { ok: false; error: string };

export function TeamsManager({ teams, people, units }: { teams: TeamView[]; people: Person[]; units: Unit[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(teams.find((t) => !t.archived)?.id ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnits, setNewUnits] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const personName = new Map(people.map((p) => [p.userId, p.name]));
  const visible = teams.filter((t) => showArchived || !t.archived);
  const selected = teams.find((t) => t.id === selectedId) ?? null;

  const run = async (f: () => Promise<Result>, okText: string): Promise<boolean> => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="teams-manager">
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="teams-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="teams-heading" className="text-base font-semibold">
            ทีม
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[color:var(--color-muted)]">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="teams-show-archived" />
              แสดงทีมที่เก็บถาวร
            </label>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setCreating((v) => !v)} aria-expanded={creating} data-testid="teams-create-open">
              + สร้างทีม
            </button>
          </div>
        </div>

        {creating && (
          <form
            className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return setMsg({ ok: false, text: "ตั้งชื่อทีมก่อน เช่น \"ทีมขาย — ภูเก็ต\"" });
              void run(() => createTeamAction({ name: newName.trim(), unitIds: newUnits }), "สร้างทีมแล้ว").then((ok) => {
                if (ok) {
                  setNewName("");
                  setNewUnits([]);
                  setCreating(false);
                }
              });
            }}
            data-testid="teams-create-form"
          >
            <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>ชื่อทีม</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="เช่น ทีมขาย — ภูเก็ต" className="input text-sm" data-testid="teams-create-name" />
            </label>
            {units.length > 0 && (
              <fieldset className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                <legend>สาขาของทีม (ไม่เลือก = ทุกสาขา)</legend>
                <div className="flex flex-wrap gap-3">
                  {units.map((u) => (
                    <label key={u.id} className="flex items-center gap-1 text-sm text-[color:var(--color-fg)]">
                      <input
                        type="checkbox"
                        checked={newUnits.includes(u.id)}
                        onChange={(e) => setNewUnits((xs) => (e.target.checked ? [...xs, u.id] : xs.filter((x) => x !== u.id)))}
                        data-testid="teams-create-unit"
                        data-id={u.id}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="teams-create-submit">
                สร้างทีม
              </button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setCreating(false)} data-testid="teams-create-cancel">
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {visible.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="teams-empty">
            ยังไม่มีทีม — กด &quot;+ สร้างทีม&quot; เพื่อจัดพนักงานเป็นทีมแรก (พนักงานที่ไม่อยู่ทีมไหนเห็นเฉพาะลูกค้าและดีลของตัวเอง)
          </p>
        ) : (
          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map((t) => {
              const lead = t.leadUserId ? (personName.get(t.leadUserId) ?? t.members.find((m) => m.userId === t.leadUserId)?.name ?? "—") : "ยังไม่ตั้ง";
              const unitText = t.unitIds.length ? t.unitIds.map((u) => unitName.get(u) ?? "สาขาที่ปิดแล้ว").join(", ") : "ทุกสาขา";
              const active = t.id === selectedId;
              return (
                <li key={t.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    aria-pressed={active}
                    className="flex w-full min-w-0 flex-col gap-1 rounded-lg border p-3 text-left"
                    style={{ borderColor: active ? "var(--color-accent)" : undefined, background: active ? "var(--color-accent-soft, transparent)" : undefined }}
                    data-testid="team-card"
                    data-id={t.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold">{t.name}</span>
                      <span className="shrink-0 rounded-full border px-2 text-xs">{t.members.length} คน</span>
                      {t.archived && <span className="shrink-0 rounded-full border px-2 text-xs text-[color:var(--color-muted)]">เก็บถาวร</span>}
                    </span>
                    <span className="truncate text-xs text-[color:var(--color-muted)]">
                      หัวหน้า: <b>{lead}</b> · สาขา: {unitText}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && <TeamDetail key={selected.id} team={selected} people={people} units={units} busy={busy} run={run} />}

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="teams-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}

function TeamDetail({
  team,
  people,
  units,
  busy,
  run,
}: {
  team: TeamView;
  people: Person[];
  units: Unit[];
  busy: boolean;
  run: (f: () => Promise<Result>, okText: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(team.name);
  const [unitIds, setUnitIds] = useState<string[]>(team.unitIds);
  const [addUserId, setAddUserId] = useState("");
  const [removing, setRemoving] = useState<TeamMemberView | null>(null);
  const memberIds = new Set(team.members.map((m) => m.userId));
  const addable = people.filter((p) => !memberIds.has(p.userId));
  const unitsChanged = [...unitIds].sort().join("|") !== [...team.unitIds].sort().join("|");

  return (
    <section className="card flex min-w-0 flex-col gap-4 p-4" aria-labelledby="team-detail-heading" data-testid="team-detail" data-id={team.id}>
      <h2 id="team-detail-heading" className="truncate text-base font-semibold">
        {team.name}
      </h2>

      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชื่อทีม</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input text-sm" disabled={team.archived} data-testid="team-rename-input" />
        </label>
        <button type="button" className="btn btn-ghost text-sm" disabled={busy || team.archived || !name.trim() || name.trim() === team.name} onClick={() => void run(() => renameTeamAction(team.id, name), "เปลี่ยนชื่อทีมแล้ว")} data-testid="team-rename-save">
          บันทึกชื่อ
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>หัวหน้าทีม (เห็นลูกค้า ดีล และกิจกรรมของทั้งทีม)</span>
          <select
            className="input text-sm"
            value={team.leadUserId ?? ""}
            disabled={busy || team.archived}
            onChange={(e) => void run(() => setLeadAction(team.id, e.target.value || null), e.target.value ? "ตั้งหัวหน้าทีมแล้ว" : "เอาหัวหน้าทีมออกแล้ว")}
            data-testid="team-lead-select"
          >
            <option value="">— ไม่มีหัวหน้า —</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {units.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2 text-xs text-[color:var(--color-muted)]">
          <legend>สาขาของทีม (ไม่เลือก = ทุกสาขา · ผู้จัดการที่ดูแลบางสาขาเห็นเฉพาะทีมของสาขาตน)</legend>
          <div className="flex flex-wrap gap-3">
            {units.map((u) => (
              <label key={u.id} className="flex items-center gap-1 text-sm text-[color:var(--color-fg)]">
                <input
                  type="checkbox"
                  checked={unitIds.includes(u.id)}
                  disabled={team.archived}
                  onChange={(e) => setUnitIds((xs) => (e.target.checked ? [...xs, u.id] : xs.filter((x) => x !== u.id)))}
                  data-testid="team-unit-toggle"
                  data-id={u.id}
                />
                {u.name}
              </label>
            ))}
          </div>
          <div>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy || team.archived || !unitsChanged} onClick={() => void run(() => setTeamUnitsAction(team.id, unitIds), "บันทึกสาขาของทีมแล้ว")} data-testid="team-units-save">
              บันทึกสาขา
            </button>
          </div>
        </fieldset>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold">สมาชิก ({team.members.length} คน)</h3>
        {team.members.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสมาชิก — เพิ่มจากช่องด้านล่าง</p>
        ) : (
          <ul className="flex min-w-0 flex-col divide-y rounded-lg border">
            {team.members.map((m) => (
              <li key={m.userId} className="flex min-w-0 flex-wrap items-center gap-2 p-2" data-testid="team-member-row" data-id={m.userId}>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.name}
                  {m.role === "LEAD" && <span className="ml-2 rounded-full border px-2 text-xs">หัวหน้า</span>}
                </span>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={m.acceptingLeads}
                    disabled={busy || team.archived}
                    onChange={(e) => void run(() => setAcceptingLeadsAction(team.id, m.userId, e.target.checked), e.target.checked ? `เปิดรับลีดให้ ${m.name} แล้ว` : `ปิดรับลีดของ ${m.name} แล้ว`)}
                    aria-label={`รับลีด — ${m.name}`}
                    data-testid="team-member-accepting-leads"
                    data-id={m.userId}
                  />
                  รับลีด
                </label>
                <button type="button" className="btn btn-ghost text-xs" disabled={busy || team.archived} onClick={() => setRemoving(m)} aria-label={`เอา ${m.name} ออกจากทีม`} data-testid="team-member-remove" data-id={m.userId}>
                  เอาออก
                </button>
              </li>
            ))}
          </ul>
        )}

        {removing && (
          <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3" role="alertdialog" aria-labelledby="team-remove-title" data-testid="team-member-remove-confirm">
            <p id="team-remove-title" className="text-sm font-semibold">
              โอนดีลก่อนไหม?
            </p>
            <p className="text-sm text-[color:var(--color-muted)]">
              ดีลและลูกค้าที่ {removing.name} ดูแลอยู่ยังเป็นของเขา — รายการที่ผูกทีม &quot;{team.name}&quot; ไว้ ทีมยังเห็นตามเดิม แต่รายการที่ไม่ได้ผูกทีมนี้ (ไม่มีทีม หรือผูกทีมอื่น) คนในทีมจะมองไม่เห็นอีก (ผู้จัดการและเจ้าของร้านยังเห็น) และ {removing.name} จะไม่เห็นรายการของทีมนี้ที่ไม่ใช่ของตัวเองอีก — ถ้าจะให้ทีมดูแลต่อ ให้โอนดีลให้เพื่อนร่วมทีมก่อน แล้วค่อยเอาออก
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy}
                onClick={() => void run(() => removeMemberAction(team.id, removing.userId), `เอา ${removing.name} ออกจากทีมแล้ว`).then(() => setRemoving(null))}
                data-testid="team-member-remove-yes"
              >
                เอาออกจากทีมเลย
              </button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setRemoving(null)} data-testid="team-member-remove-cancel">
                ยกเลิก (ไปโอนดีลก่อน)
              </button>
            </div>
          </div>
        )}

        {!team.archived && (
          <form
            className="flex min-w-0 flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addUserId) return;
              void run(() => addMemberAction(team.id, addUserId), "เพิ่มสมาชิกแล้ว").then((ok) => {
                if (ok) setAddUserId("");
              });
            }}
            data-testid="team-member-add-form"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>เพิ่มสมาชิก</span>
              <select className="input text-sm" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} data-testid="team-member-add-select">
                <option value="">— เลือกพนักงาน —</option>
                {addable.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-ghost text-sm" disabled={busy || !addUserId} data-testid="team-member-add-submit">
              เพิ่ม
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {team.archived ? (
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => restoreTeamAction(team.id), "กู้คืนทีมแล้ว")} data-testid="team-restore">
            กู้คืนทีม
          </button>
        ) : (
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => archiveTeamAction(team.id), "เก็บทีมถาวรแล้ว — สมาชิกไม่เห็นลูกค้าของกันและกันผ่านทีมนี้อีก")} data-testid="team-archive">
            เก็บทีมถาวร
          </button>
        )}
      </div>
    </section>
  );
}
