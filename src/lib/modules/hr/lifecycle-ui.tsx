// HR H4.4 ▸ หน้าจอวงจรพนักงาน (ภาพ 02: แผง "ต้องจัดการ" · แถบทดลองงาน · รายการรับเข้า/ออก · บันทึก · ปุ่มสิ้นสุดการจ้าง) + ค่าตั้งในหน้าตั้งค่า
//   server component ล้วน (ไม่มี "use client" — ไฟล์นี้อ่าน lifecycle.ts ได้ · client ไม่ได้รับอะไรนอกจาก HTML) · ฟอร์ม = server action ของ lifecycle-actions.ts ·
//   ข้อความจาก src/messages hr.life · ผลการกดอ่านจาก ?life= ผ่านรายการ LIFE_MSG เท่านั้น · ไม่มีแท็บใหม่ (Q6) ◂
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { formatDateTh, thaiDateKey } from "@/lib/ui/date";
import { hrViewerOf } from "./privacy";
import {
  canOffboard,
  canSeeLifecycle,
  getLifecyclePolicy,
  LIFE_MSG,
  lifecycleBoards,
  lifecycleDue,
  listChecklist,
  listReviewNotes,
  NOTE_KINDS,
  OFFBOARD_REASONS,
  type ChecklistItem,
  type LifeDueItem,
  type LifecyclePolicy,
  type LifeTemplateRow,
  type loadLifecycleForViewer,
} from "./lifecycle";
import {
  addReviewNoteAction,
  confirmProbationAction,
  offboardEmployeeAction,
  saveLifecyclePolicyAction,
  setTaskDoneAction,
  startChecklistAction,
} from "./lifecycle-actions";

type Life = Awaited<ReturnType<typeof loadLifecycleForViewer>>;
const muted = "text-[color:var(--color-muted)]";
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const dateTh = (day: string | null | undefined) => (day ? formatDateTh(`${day}T00:00:00+07:00`) : "—");
const dayMs = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
const daysFrom = (today: string, day: string) => Math.round((dayMs(day) - dayMs(today)) / 86_400_000);

/** ผลการกดล่าสุด (?life=) — รหัสที่ไม่รู้จัก = ไม่แสดง */
export async function LifecycleMsg({ code }: { code?: string }) {
  if (!code) return null;
  const t = await getTranslations("hr.life");
  const text = code === "ok" ? t("saved") : Object.prototype.hasOwnProperty.call(LIFE_MSG, code) ? LIFE_MSG[code]! : "";
  if (!text) return null;
  return (
    <p role={code === "ok" ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${code === "ok" ? "" : "text-[color:var(--color-danger)]"}`}>
      {text}
    </p>
  );
}

// ═══════════════════════════ ทะเบียน: แผง "ต้องจัดการ" ═══════════════════════════
/** แผง 4 ช่องของภาพ 02 — ผู้ดูข้อมูลบันทึก (OWNER/คีย์ตรง) เท่านั้น · คนอื่นไม่เห็นแผง */
export async function LifecycleDuePanel({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const due = await lifecycleDue({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth));
  if (!due) return null;
  const t = await getTranslations("hr.life");
  const groups: { kind: LifeDueItem["kind"]; label: string }[] = [
    { kind: "PROBATION_END", label: t("due.probation") },
    { kind: "CONTRACT_END", label: t("due.contract") },
    { kind: "ONBOARDING_OPEN", label: t("due.onboarding") },
    { kind: "OFFBOARDING_OPEN", label: t("due.offboarding") },
  ];
  return (
    <section data-testid="hr-life-due" aria-label={t("due.title")} className="card mb-3 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold">{t("due.title")}</h2>
        <span className={`text-xs ${muted}`}>{t("due.sub")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {groups.map((g) => {
          const items = due.items.filter((i) => i.kind === g.kind);
          const count = g.kind === "ONBOARDING_OPEN" || g.kind === "OFFBOARDING_OPEN" ? items.reduce((n, i) => n + i.open, 0) : items.length;
          return (
            <div key={g.kind} className="min-w-0 rounded-xl border border-[color:var(--color-line)] p-3">
              <span className={`block text-xs ${muted}`}>{g.label}</span>
              <b className="mt-1 block text-xl">{count === 0 ? t("due.none") : g.kind.endsWith("_OPEN") ? t("due.items", { n: count }) : count}</b>
              <ul className="mt-1 flex flex-col gap-1">
                {items.slice(0, 5).map((i) => (
                  <li key={`${i.employeeId}-${i.kind}`}>
                    <Link
                      href={`/app/sys/${systemId}/hr/employees/${i.employeeId}`}
                      data-testid={`hr-life-due-${i.employeeId}-${i.kind}`}
                      className={`inline-flex min-h-11 items-center text-xs underline-offset-2 hover:underline ${muted}`}
                    >
                      {i.name}
                      {i.date ? ` · ${formatDateTh(`${i.date}T00:00:00+07:00`, { withYear: false })}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════ โปรไฟล์ ═══════════════════════════
type ProfileProps = {
  systemId: string;
  employeeId: string;
  /** ผลของ loadLifecycleForViewer (null = ผู้ดูไม่เห็นข้อมูลบันทึก) */
  life: Life;
  /** สถานะใช้งานของแถว (จาก DTO โปรไฟล์) */
  active: boolean;
  /** ผู้ดูคือพนักงานคนนี้เอง (ผูกบัญชี) — ไม่แสดงปุ่มที่ทำกับตัวเองไม่ได้ */
  isSelf: boolean;
};

function Task({ t, systemId, employeeId, item, today }: { t: Awaited<ReturnType<typeof getTranslations>>; systemId: string; employeeId: string; item: ChecklistItem; today: string }) {
  const late = !item.done && item.dueDate && item.dueDate < today;
  return (
    <form action={setTaskDoneAction} className="contents">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="taskId" value={item.id} />
      <input type="hidden" name="done" value={item.done ? "0" : "1"} />
      <button
        type="submit"
        data-testid={`hr-life-task-${item.id}`}
        aria-pressed={item.done}
        title={item.done ? t("checklist.markOpen") : t("checklist.markDone")}
        className={`flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--color-line)] px-3 text-left text-sm ${item.done ? muted : "font-semibold"}`}
      >
        <span aria-hidden className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded border border-[color:var(--color-ink)]">
          {item.done ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.hasCard && <span className={`text-xs font-normal ${muted}`}>{t("checklist.card")}</span>}
        {!item.done && item.dueDate && (
          <span className={`text-xs font-normal ${late ? "text-[color:var(--color-danger)]" : muted}`}>{formatDateTh(`${item.dueDate}T00:00:00+07:00`, { withYear: false })}</span>
        )}
      </button>
    </form>
  );
}

/** ส่วนวงจรพนักงานในหน้าโปรไฟล์ — ผู้ดูข้อมูลบันทึกเห็นทั้งหมด · ผู้สิ้นสุดการจ้างได้ (ด่านปุ่มลบเดิม) เห็นปุ่มสิ้นสุด · คนอื่นไม่เห็นอะไรเพิ่ม */
export async function LifecycleProfile({ systemId, employeeId, life, active, isSelf }: ProfileProps) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const records = !!life && canSeeLifecycle(viewer);
  const offOk = canOffboard(viewer) && active && !isSelf;
  if (!records && !offOk) return null;
  const t = await getTranslations("hr.life");
  const today = thaiDateKey(new Date());
  const [check, notes, policy] = records
    ? await Promise.all([listChecklist(ctx, viewer, employeeId), listReviewNotes(ctx, viewer, employeeId), getLifecyclePolicy(ctx)])
    : [null, null, await getLifecyclePolicy(ctx)];
  const hidden = (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="employeeId" value={employeeId} />
    </>
  );
  const probation = life?.status === "PROBATION" && life.probationEndAt ? life.probationEndAt : null;
  const left = probation ? daysFrom(today, probation) : 0;
  const leftText = left > 0 ? t("banner.left", { n: left }) : left === 0 ? t("banner.today") : t("banner.over", { n: -left });
  const onDone = check?.onboarding.filter((x) => x.done).length ?? 0;
  const onTotal = check?.onboarding.length ?? 0;

  return (
    <div id="hr-life" className="flex flex-col gap-5">
      {records && life && (probation || life.offboard || life.contractEndAt) && (
        <div data-testid="hr-life-banner" className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-[color:var(--color-accent)] px-4 py-3">
          <div className="min-w-0 flex-1">
            {probation ? (
              <b className="block text-[color:var(--color-accent)]">{t("banner.probation", { date: dateTh(probation), left: leftText })}</b>
            ) : life.offboard && !active ? (
              <b className="block text-[color:var(--color-accent)]">{t("ended.title")}</b>
            ) : (
              <b className="block text-[color:var(--color-accent)]">{t("banner.contract", { date: dateTh(life.contractEndAt) })}</b>
            )}
            <small className="mt-1 block text-[color:var(--color-ink-soft)]">
              {life.startDate ? t("banner.start", { date: dateTh(life.startDate) }) : ""}
              {probation && life.contractEndAt ? ` · ${t("banner.contract", { date: dateTh(life.contractEndAt) })}` : ""}
            </small>
            {life.offboard && (
              <small className="mt-1 block">
                {t("ended.detail", { date: dateTh(life.offboard.endDate), reason: life.offboard.reason ? t(`reason.${life.offboard.reason}`) : "—" })}
                {life.offboard.note ? ` · ${t("ended.note", { note: life.offboard.note })}` : ""}
              </small>
            )}
          </div>
          {probation && active && !isSelf && (
            <form action={confirmProbationAction}>
              {hidden}
              <button type="submit" data-testid="hr-life-pass" className={btn}>
                {t("banner.pass")}
              </button>
            </form>
          )}
        </div>
      )}

      {records && check && (
        <section data-testid="hr-life-checklist" className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {t("checklist.onboarding")}
            <span className="flex-1" />
            {onTotal > 0 && <b>{t("checklist.progress", { done: onDone, total: onTotal })}</b>}
          </h3>
          {onTotal > 0 ? (
            <>
              <div className="h-2 overflow-hidden rounded border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]">
                <i className="block h-full bg-[color:var(--color-ink)]" style={{ width: `${Math.round((onDone / onTotal) * 100)}%` }} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {check.onboarding.map((x) => (
                  <Task key={x.id} t={t} systemId={systemId} employeeId={employeeId} item={x} today={today} />
                ))}
              </div>
              {policy.kanban.enabled && <p className={`text-xs ${muted}`}>{t("checklist.kanbanOn")}</p>}
            </>
          ) : (
            active && (
              <form action={startChecklistAction}>
                {hidden}
                <input type="hidden" name="kind" value="ONBOARDING" />
                <button type="submit" data-testid="hr-life-start-onboarding" className={ghost}>
                  {t("checklist.startOnboarding")}
                </button>
              </form>
            )
          )}
          {(check.offboarding.length > 0 || !active) && (
            <>
              <h3 className="mt-2 text-sm font-semibold">{t("checklist.offboarding")}</h3>
              {check.offboarding.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {check.offboarding.map((x) => (
                    <Task key={x.id} t={t} systemId={systemId} employeeId={employeeId} item={x} today={today} />
                  ))}
                </div>
              ) : (
                <form action={startChecklistAction}>
                  {hidden}
                  <input type="hidden" name="kind" value="OFFBOARDING" />
                  <button type="submit" data-testid="hr-life-start-offboarding" className={ghost}>
                    {t("checklist.startOffboarding")}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      )}

      {records && notes && (
        <section data-testid="hr-life-notes" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t("notes.title")}</h3>
          {notes.items.length === 0 && <p className={`text-xs ${muted}`}>{t("notes.empty")}</p>}
          <ul className="flex flex-col gap-2">
            {notes.items.map((n) => (
              <li key={n.id} data-testid={`hr-life-note-${n.id}`} className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs">{t(`notes.kinds.${n.kind}`)}</span>
                  <b className="min-w-0 flex-1 truncate">{n.title}</b>
                  <span className={`text-xs ${muted}`}>{formatDateTh(n.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                <p className={`mt-1 text-xs ${muted}`}>
                  {[
                    n.periodLabel,
                    n.score !== null ? t("notes.scoreOf", { n: n.score }) : null,
                    n.authorName ? t("notes.by", { name: n.authorName }) : null,
                    n.visibleToEmployee ? t("notes.shown") : t("notes.hidden"),
                    n.acknowledgedAt ? t("notes.acked", { date: formatDateTh(n.acknowledgedAt) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          {!isSelf && (
            <details className="rounded-xl border border-[color:var(--color-line)] px-3 py-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("notes.add")}</summary>
              <form action={addReviewNoteAction} data-testid="hr-life-note-add" className="mt-2 flex flex-col gap-2">
                {hidden}
                <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                  {t("notes.kind")}
                  <select name="kind" defaultValue="NOTE" className="input min-h-11">
                    {NOTE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`notes.kinds.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                  {t("notes.fieldTitle")}
                  <input name="title" required maxLength={120} className="input min-h-11" />
                </label>
                <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                  {t("notes.fieldBody")}
                  <textarea name="body" required maxLength={4000} rows={3} className="input" />
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                    {t("notes.period")}
                    <input name="periodLabel" placeholder="2026-Q4" className="input min-h-11" />
                  </label>
                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                    {t("notes.score")}
                    <select name="score" defaultValue="" className="input min-h-11">
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                    {t("notes.visible")}
                    <select name="visibleToEmployee" defaultValue="" className="input min-h-11">
                      <option value="">{t("notes.visibleDefault")}</option>
                      <option value="yes">{t("notes.visibleYes")}</option>
                      <option value="no">{t("notes.visibleNo")}</option>
                    </select>
                  </label>
                </div>
                <p className={`text-xs ${muted}`}>{t("notes.writtenAlways")} · {t("notes.appendOnly")}</p>
                <button type="submit" className={`${btn} self-start`}>
                  {t("notes.save")}
                </button>
              </form>
            </details>
          )}
        </section>
      )}

      {offOk && (
        <details data-testid="hr-life-offboard" className="rounded-xl border border-[color:var(--color-line)] px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-[color:var(--color-danger)]">{t("offboard.open")}</summary>
          <form action={offboardEmployeeAction} className="mt-2 flex flex-col gap-3">
            {hidden}
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("offboard.date")}
              <input type="date" name="endDate" max={today} defaultValue={today} data-testid="hr-life-offboard-date" className="input min-h-11" />
            </label>
            <p className={`text-xs ${muted}`}>{t("offboard.future")}</p>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("offboard.reason")}
              <select name="reason" required defaultValue="" data-testid="hr-life-offboard-reason" className="input min-h-11">
                <option value="" disabled>
                  {t("offboard.choose")}
                </option>
                {OFFBOARD_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`reason.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("offboard.note")}
              <textarea name="note" maxLength={500} rows={2} data-testid="hr-life-offboard-note" className="input" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="revokeAccess" defaultChecked={policy.revokeAppAccess} data-testid="hr-life-offboard-access" className="h-5 w-5" />
              {t("offboard.access")}
            </label>
            <div role="note" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-xs">
              <p>{t("offboard.effects")}</p>
              {policy.autoRevokePin && <p className="mt-1">{t("offboard.pin")}</p>}
              <p className="mt-1 font-semibold">{t("offboard.payslips")}</p>
            </div>
            <button type="submit" data-testid="hr-life-offboard-confirm" className="btn min-h-[44px] self-start border border-[color:var(--color-danger)] text-sm text-[color:var(--color-danger)]">
              {t("offboard.confirm")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

// ═══════════════════════════ หน้าตั้งค่า ═══════════════════════════
const tplText = (rows: LifeTemplateRow[]) => rows.map((r) => `${r.key} | ${r.title} | ${r.dueDays}`).join("\n");

/** ค่าตั้งวงจรพนักงาน — ผู้ดูข้อมูลบันทึกเห็น · แก้ได้เฉพาะผู้ดูแลทุกสาขา (ค่าทั้งร้าน) */
export async function LifecycleSettings({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  if (!canSeeLifecycle(viewer)) return null;
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const t = await getTranslations("hr.life");
  const [pol, boards] = await Promise.all([getLifecyclePolicy(ctx), lifecycleBoards(ctx, viewer)]);
  const shopWide = viewer.role === "OWNER" || (Array.isArray(viewer.unitAccess) && (viewer.unitAccess.length === 0 || viewer.unitAccess.includes("*")));
  return <SettingsForm systemId={systemId} pol={pol} boards={boards} t={t} editable={shopWide} />;
}

function SettingsForm({ systemId, pol, boards, t, editable }: { systemId: string; pol: LifecyclePolicy; boards: { id: string; name: string }[]; t: Awaited<ReturnType<typeof getTranslations>>; editable: boolean }) {
  return (
    <section id="hr-life" data-testid="hr-life-settings" className="card flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">{t("settings.title")}</h2>
      <p className={`text-xs ${muted}`}>{t("settings.desc")}</p>
      {!editable && <p className={`text-xs ${muted}`}>{t("settings.shopWide")}</p>}
      <form action={saveLifecyclePolicyAction} className="flex flex-col gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <fieldset disabled={!editable} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("settings.leadProbation")}
              <input type="number" name="probationLeadDays" min={0} max={90} defaultValue={pol.probationLeadDays} data-testid="hr-life-lead-probation" className="input min-h-11" />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("settings.leadContract")}
              <input type="number" name="contractLeadDays" min={0} max={180} defaultValue={pol.contractLeadDays} data-testid="hr-life-lead-contract" className="input min-h-11" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="kanbanEnabled" defaultChecked={pol.kanban.enabled} data-testid="hr-life-kanban" className="h-5 w-5" />
            {t("settings.kanban")}
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("settings.board")}
              <select name="boardId" defaultValue={pol.kanban.boardId ?? ""} className="input min-h-11">
                <option value="">{t("settings.noBoard")}</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              {t("settings.assign")}
              <select name="assignTo" defaultValue={pol.assignTo} className="input min-h-11">
                <option value="UNIT_MANAGER">{t("settings.assignManager")}</option>
                <option value="OWNER">{t("settings.assignOwner")}</option>
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="autoRevokePin" defaultChecked={pol.autoRevokePin} className="h-5 w-5" />
            {t("settings.autoPin")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="revokeAppAccess" defaultChecked={pol.revokeAppAccess} className="h-5 w-5" />
            {t("settings.revokeApp")}
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            {t("settings.tplOn")}
            <textarea name="onboardingTemplate" rows={7} defaultValue={tplText(pol.onboardingTemplate)} data-testid="hr-life-template-onboarding" className="input font-mono" />
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            {t("settings.tplOff")}
            <textarea name="offboardingTemplate" rows={6} defaultValue={tplText(pol.offboardingTemplate)} data-testid="hr-life-template-offboarding" className="input font-mono" />
          </label>
          <p className={`text-xs ${muted}`}>{t("settings.tplHelp")}</p>
          <button type="submit" className={`${btn} self-start`}>
            {t("settings.save")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
