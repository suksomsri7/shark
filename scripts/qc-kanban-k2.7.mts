// QC — บอร์ดงาน WO K2.7: เทมเพลตการ์ด (KanbanCardTemplate) + กำหนดส่งซ้ำ (recurrenceRule · cron รายวัน idempotent)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.7
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/card-templates.ts") || !existsSync("src/lib/modules/kanban/recurrence.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/card-templates.ts + recurrence.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number, h?: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
/** วันที่ไทย YYYY-MM-DD ของ Date (UTC+7 คำนวณเอง — ห้าม toLocale*/
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
let tid = ""; let SYS = ""; let boardId = "";
const madeCards: string[] = []; const madeTemplates: string[] = []; const madeFields: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const ct = (await import("@/lib/modules/kanban/card-templates" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const rc = (await import("@/lib/modules/kanban/recurrence" as string)) as Record<string, (...a: Any[]) => Any>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId); const pook = await actorOf(E.users.staff.pook.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  boardId = E.boards.maint.id; // TENANT: owner=ADMIN · thana=VIEWER (ไม่ได้ถูกเชิญ)
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const col0 = cols[0]!; const col1 = cols[1] ?? cols[0]!;
  const lbl = await prisma.kanbanLabel.findFirst({ where: { boardId } });
  const TODAY = kq.dayFromToday(0, 10); // พุธ 30 ก.ย. 2569 10:00 ไทย

  // ═══ S1 schema ═══
  const tcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCardTemplate'`)).map((c) => c.column_name);
  chk("K2.7-S1.1", "KanbanCardTemplate {tenantId systemId boardId name title description labelIds checklists fieldValues reminderMinutesBefore sortOrder createdById} + index [boardId, sortOrder]", ["tenantId", "systemId", "boardId", "name", "title", "description", "labelIds", "checklists", "fieldValues", "reminderMinutesBefore", "sortOrder", "createdById"].every((c) => tcols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanCardTemplate' and indexdef ilike '%"boardId"%' and indexdef ilike '%"sortOrder"%'`)).length >= 1, "ครบ", tcols.join(","));
  const ccols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCard'`)).map((c) => c.column_name);
  chk("K2.7-S1.2", "KanbanCard เพิ่ม recurrenceRule recurrenceParentId recurrenceKey + unique(recurrenceParentId, recurrenceKey) (ด่าน DB กัน cron ซ้อนสร้างซ้ำ)", ["recurrenceRule", "recurrenceParentId", "recurrenceKey"].every((c) => ccols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanCard' and indexdef ilike '%unique%' and indexdef ilike '%"recurrenceParentId"%' and indexdef ilike '%"recurrenceKey"%'`)).length === 1, "ครบ", ccols.filter((c) => /recur/i.test(c)).join(","));

  // ═══ S2 เทมเพลตการ์ด ═══
  // การ์ดต้นแบบ: ชื่อ/รายละเอียด/ป้าย/เช็คลิสต์/กำหนดส่ง/ผู้รับผิดชอบ
  const src = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col0.id, title: "ตรวจถังอากาศประจำสัปดาห์", description: "<p>ไล่เช็คทุกถังตามรายการ</p>", dueAt: kq.dayFromToday(3, 18), assigneeUserId: pook.userId, createdById: owner.userId });
  madeCards.push(src.id);
  if (lbl) await prisma.kanbanCardLabel.create({ data: { cardId: src.id, labelId: lbl.id, tenantId: tid } });
  const cl = await prisma.kanbanChecklist.create({ data: { tenantId: tid, cardId: src.id, title: "ขั้นตอน", position: "a0" } });
  await prisma.kanbanChecklistItem.createMany({ data: [{ tenantId: tid, checklistId: cl.id, text: "เช็คแรงดัน", position: "a0", done: true, doneAt: new Date(), assigneeUserId: pook.userId }, { tenantId: tid, checklistId: cl.id, text: "เช็ควาล์ว", position: "a1", done: false }] });
  const tpl = await ct.saveAsCardTemplate(ctxO, owner, src.id, { name: "ตรวจถังอากาศ" });
  madeTemplates.push(tpl?.id);
  const tplRow = await P.kanbanCardTemplate.findUnique({ where: { id: tpl?.id ?? "x" } });
  const tplCls = (tplRow?.checklists ?? []) as Any[];
  chk("K2.7-S2.1", "saveAsCardTemplate(ctx, actor, cardId, {name}) (ADMIN) → เก็บ name/title/description/labelIds/checklists[{title,items[text]}] · ไม่เก็บวันที่/ผู้รับผิดชอบ/สถานะติ๊ก", !!tplRow && tplRow.name === "ตรวจถังอากาศ" && tplRow.title === src.title && /ไล่เช็ค/.test(tplRow.description ?? "") && (!lbl || (tplRow.labelIds as string[]).includes(lbl.id)) && tplCls.length === 1 && tplCls[0].items?.length === 2 && !JSON.stringify(tplRow).includes(pook.userId) && !/dueAt|done":true/.test(JSON.stringify(tplRow)), "เก็บถูก", JSON.stringify(tplRow ?? {}).slice(0, 220));
  const eV = await fails(() => ct.saveAsCardTemplate(ctxT, thana, src.id, { name: "x" }));
  chk("K2.7-S2.2", "thana (VIEWER บนบอร์ด TENANT) บันทึกเทมเพลต → Forbidden", !!eV, "throw", "ไม่ throw");
  const eEmpty = await fails(() => ct.saveAsCardTemplate(ctxO, owner, src.id, { name: "  " }));
  chk("K2.7-S2.3", "ชื่อเทมเพลตว่าง → throw ไทย", !!eEmpty && /[ก-๙]/.test(eEmpty.message), "throw ไทย", eEmpty?.message?.slice(0, 60) ?? "ไม่ throw");
  const list = await ct.listCardTemplates(ctxO, owner, boardId);
  chk("K2.7-S2.4", "listCardTemplates(ctx, actor, boardId) → [{id,name,title,labelCount,checklistItemCount,…}] มีเทมเพลตที่เพิ่งบันทึก · thana (VIEWER) ก็อ่านได้", Array.isArray(list) && list.some((t: Any) => t.id === tpl.id && t.checklistItemCount === 2) && Array.isArray(await ct.listCardTemplates(ctxT, thana, boardId)), "มี", JSON.stringify(list?.slice(0, 2) ?? []).slice(0, 160));
  const before = await prisma.kanbanCard.count({ where: { boardId, status: "ACTIVE" } });
  const made = await ct.createCardFromTemplate(ctxO, owner, { templateId: tpl.id, columnId: col1.id });
  madeCards.push(made?.cardId ?? made?.id);
  const newId = made?.cardId ?? made?.id;
  const nc = await prisma.kanbanCard.findUnique({ where: { id: newId ?? "x" }, include: { cardLabels: true, assignees: true, checklists: { include: { items: true } } } });
  chk("K2.7-S2.5", "createCardFromTemplate(ctx, actor, {templateId, columnId}) (EDITOR) → การ์ดใหม่: ชื่อ/รายละเอียด/ป้าย/เช็คลิสต์ (ทุกข้อยังไม่ทำ · ไม่มีผู้รับมอบ) ตามเทมเพลต · dueAt null · assignees [] · sourceType TEMPLATE sourceId=templateId · cardNo มี · อยู่คอลัมน์ที่เลือก", !!nc && nc.title === src.title && /ไล่เช็ค/.test(nc.description ?? "") && (!lbl || nc.cardLabels.some((l) => l.labelId === lbl.id)) && nc.checklists.length === 1 && nc.checklists[0]!.items.length === 2 && nc.checklists[0]!.items.every((i) => !i.done && !i.assigneeUserId) && nc.dueAt === null && nc.assignees.length === 0 && nc.sourceType === "TEMPLATE" && nc.sourceId === tpl.id && typeof nc.cardNo === "number" && nc.columnId === col1.id && (await prisma.kanbanCard.count({ where: { boardId, status: "ACTIVE" } })) === before + 1, "ตรงเทมเพลต", JSON.stringify({ t: nc?.title, due: nc?.dueAt, a: nc?.assignees?.length, cl: nc?.checklists?.length, st: nc?.sourceType, col: nc?.columnId === col1.id }));
  const act = await prisma.kanbanActivity.findFirst({ where: { cardId: newId ?? "x", type: "CARD_CREATED" } });
  chk("K2.7-S2.6", "activity CARD_CREATED ของการ์ดจากเทมเพลต data มี templateId", !!act && JSON.stringify(act.data).includes(tpl.id), "มี", JSON.stringify(act?.data ?? null).slice(0, 120), "MAJOR");
  const due2 = kq.dayFromToday(5, 18);
  const made2 = await ct.createCardFromTemplate(ctxO, owner, { templateId: tpl.id, columnId: col0.id, title: "ตรวจถัง — ชุดกะตะ", dueAt: due2, assigneeUserIds: [thana.userId] });
  const id2 = made2?.cardId ?? made2?.id; madeCards.push(id2);
  const nc2 = await prisma.kanbanCard.findUnique({ where: { id: id2 ?? "x" }, include: { assignees: true } });
  chk("K2.7-S2.7", "ระบุ title/dueAt/assigneeUserIds ตอนสร้าง → ทับค่าจากเทมเพลต (ชื่อใหม่ · dueAt ตามที่ให้ · ผู้รับผิดชอบ thana)", !!nc2 && nc2.title === "ตรวจถัง — ชุดกะตะ" && nc2.dueAt?.getTime() === due2.getTime() && nc2.assignees.some((a) => a.userId === thana.userId), "ทับได้", JSON.stringify({ t: nc2?.title, due: nc2?.dueAt, a: nc2?.assignees?.map((a) => a.userId) }));
  const eT = await fails(() => ct.createCardFromTemplate(ctxT, thana, { templateId: tpl.id, columnId: col0.id }));
  chk("K2.7-S2.8", "thana (VIEWER) สร้างการ์ดจากเทมเพลต → Forbidden", !!eT, "throw", "ไม่ throw");
  // ฟิลด์กำหนดเอง (K2.6) — ถ้ามี fields.ts ต้องก๊อปค่าด้วย
  if (existsSync("src/lib/modules/kanban/fields.ts")) {
    const fx = (await import("@/lib/modules/kanban/fields" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
    const fld = await fx.createField(ctxO, owner, boardId, { name: `จำนวนถัง-${Date.now() % 10000}`, type: "NUMBER" });
    madeFields.push(fld.id);
    await fx.setCardFieldValue(ctxO, owner, src.id, fld.id, 12);
    const tpl2 = await ct.saveAsCardTemplate(ctxO, owner, src.id, { name: "ตรวจถัง+ฟิลด์" });
    madeTemplates.push(tpl2.id);
    const m3 = await ct.createCardFromTemplate(ctxO, owner, { templateId: tpl2.id, columnId: col0.id });
    const id3 = m3?.cardId ?? m3?.id; madeCards.push(id3);
    const vals = await fx.getCardFieldValues(ctxO, owner, id3);
    chk("K2.7-S2.9", "ค่าฟิลด์กำหนดเอง (K2.6) ถูกเก็บใน template.fieldValues และก๊อปลงการ์ดใหม่ (จำนวนถัง = 12)", vals.some((v: Any) => v.fieldId === fld.id && Number(v.value) === 12), "12", JSON.stringify(vals).slice(0, 160));
  } else {
    chk("K2.7-S2.9", "ฟิลด์กำหนดเอง (K2.6) ยังไม่มีในทรี — ข้าม (ต้องกลับมาตรวจเมื่อรวม K2.6)", true, "", "");
  }
  // เพดาน 30/บอร์ด
  const cur = await P.kanbanCardTemplate.count({ where: { boardId } });
  const filler: string[] = [];
  for (let i = cur; i < 30; i++) { const r = await P.kanbanCardTemplate.create({ data: { tenantId: tid, systemId: SYS, boardId, name: `filler-${i}`, title: `filler ${i}`, labelIds: [], checklists: [], fieldValues: {}, sortOrder: 100 + i } }); filler.push(r.id); }
  madeTemplates.push(...filler);
  const eLim = await fails(() => ct.saveAsCardTemplate(ctxO, owner, src.id, { name: "ใบที่ 31" }));
  chk("K2.7-S2.10", "เพดาน KANBAN_LIMITS.cardTemplatesPerBoard = 30 → ใบที่ 31 throw ไทย code LIMIT_REACHED", !!eLim && /[ก-๙]/.test(eLim.message) && /LIMIT_REACHED|30/.test(`${(eLim as Any).code ?? ""} ${eLim.message}`) && /cardTemplatesPerBoard:\s*30/.test(read("src/lib/modules/kanban/limits.ts")), "throw LIMIT_REACHED", eLim?.message?.slice(0, 60) ?? "ไม่ throw");
  await ct.deleteCardTemplate(ctxO, owner, tpl.id);
  chk("K2.7-S2.11", "deleteCardTemplate (ADMIN) → หายจากรายการ · การ์ดที่เคยสร้างจากมันยังอยู่", !(await ct.listCardTemplates(ctxO, owner, boardId)).some((t: Any) => t.id === tpl.id) && !!(await prisma.kanbanCard.findUnique({ where: { id: newId } })), "หาย · การ์ดอยู่", "ไม่ตรง");

  // ═══ S3 กำหนดส่งซ้ำ (recurrence) ═══
  const okRules = ["FREQ=DAILY", "FREQ=DAILY;INTERVAL=2", "FREQ=WEEKLY;BYDAY=MO", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", "FREQ=MONTHLY;BYMONTHDAY=15"];
  const badRules = ["", "FREQ=YEARLY", "FREQ=WEEKLY", "FREQ=WEEKLY;BYDAY=XX", "FREQ=MONTHLY;BYMONTHDAY=32", "DAILY", "FREQ=DAILY;INTERVAL=0"];
  const parsedOk = okRules.every((r) => { try { const p = rc.parseRecurrenceRule(r); return p && /DAILY|WEEKLY|MONTHLY/.test(p.freq); } catch { return false; } });
  const parsedBad = badRules.every((r) => { try { rc.parseRecurrenceRule(r); return false; } catch (e) { return /[ก-๙]/.test((e as Error).message); } });
  chk("K2.7-S3.1", "parseRecurrenceRule: รับ subset RRULE (DAILY/WEEKLY(BYDAY)/MONTHLY(BYMONTHDAY) + INTERVAL≥1) · รูปแบบอื่น throw ไทย", parsedOk && parsedBad, "5 ผ่าน / 7 ปฏิเสธ", `${parsedOk}/${parsedBad}`);
  const d1 = rc.describeRecurrence("FREQ=WEEKLY;BYDAY=MO"); const d2 = rc.describeRecurrence("FREQ=DAILY;INTERVAL=2"); const d3 = rc.describeRecurrence("FREQ=MONTHLY;BYMONTHDAY=15");
  chk("K2.7-S3.2", "describeRecurrence → ไทย: 'ทุกวันจันทร์' · 'ทุก 2 วัน' · 'ทุกวันที่ 15 ของเดือน'", /ทุกวันจันทร์/.test(d1) && /ทุก 2 วัน/.test(d2) && /ทุกวันที่ 15/.test(d3), "ไทย 3 แบบ", `${d1} | ${d2} | ${d3}`);
  // วันอ้างอิง: พุธ 30 ก.ย. 2569 18:00 ไทย
  const base = kq.dayFromToday(0, 18);
  const n1 = rc.nextOccurrence("FREQ=WEEKLY;BYDAY=MO", base); const n2 = rc.nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=15", base); const n3 = rc.nextOccurrence("FREQ=DAILY;INTERVAL=2", base); const n4 = rc.nextOccurrence("FREQ=WEEKLY;BYDAY=WE", base);
  chk("K2.7-S3.3", "nextOccurrence(rule, after) คิดวันแบบไทย (+07:00) · คงเวลาเดิม 18:00: จันทร์ถัดไป = 5 ต.ค. · วันที่ 15 ถัดไป = 15 ต.ค. · ทุก 2 วัน = 2 ต.ค. · BYDAY=WE จากพุธ = พุธหน้า 7 ต.ค. (ไม่ใช่วันเดียวกัน)", bkkDay(n1) === "2026-10-05" && bkkDay(n2) === "2026-10-15" && bkkDay(n3) === "2026-10-02" && bkkDay(n4) === "2026-10-07" && [n1, n2, n3, n4].every((d) => d.getUTCHours() === 11), "5 ต.ค./15 ต.ค./2 ต.ค./7 ต.ค. 18:00", [n1, n2, n3, n4].map((d) => d?.toISOString?.()).join(" | "));
  // การ์ดแม่: กำหนดส่ง พุธ 23 ก.ย. 18:00 (สัปดาห์ก่อน) ทุกวันพุธ
  const parent = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col0.id, title: "ล้างคอมเพรสเซอร์ทุกพุธ", dueAt: kq.dayFromToday(-7, 18), assigneeUserId: pook.userId, createdById: owner.userId });
  madeCards.push(parent.id);
  if (lbl) await prisma.kanbanCardLabel.create({ data: { cardId: parent.id, labelId: lbl.id, tenantId: tid } });
  const pcl = await prisma.kanbanChecklist.create({ data: { tenantId: tid, cardId: parent.id, title: "ขั้นตอน", position: "a0" } });
  await prisma.kanbanChecklistItem.create({ data: { tenantId: tid, checklistId: pcl.id, text: "ถ่ายน้ำมัน", position: "a0", done: true, doneAt: new Date() } });
  const noDue = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col0.id, title: "ไม่มีกำหนดส่ง", createdById: owner.userId });
  madeCards.push(noDue.id);
  const eNoDue = await fails(() => rc.setCardRecurrence(ctxO, owner, noDue.id, "FREQ=DAILY"));
  const eBad = await fails(() => rc.setCardRecurrence(ctxO, owner, parent.id, "FREQ=YEARLY"));
  await rc.setCardRecurrence(ctxO, owner, parent.id, "FREQ=WEEKLY;BYDAY=WE");
  const pRow = await prisma.kanbanCard.findUnique({ where: { id: parent.id } }) as Any;
  const pAct = await prisma.kanbanActivity.findFirst({ where: { cardId: parent.id, type: "CARD_UPDATED" }, orderBy: { createdAt: "desc" } });
  chk("K2.7-S3.4", "setCardRecurrence(ctx, actor, cardId, rule|null) (EDITOR): การ์ดไม่มี dueAt → throw ไทย · กฎผิด → throw · ตั้งได้ → recurrenceRule เก็บ + activity CARD_UPDATED {recurrence}", !!eNoDue && /[ก-๙]/.test(eNoDue.message) && !!eBad && pRow?.recurrenceRule === "FREQ=WEEKLY;BYDAY=WE" && !!pAct && /recurrence/.test(JSON.stringify(pAct.data)), "ครบ", `${eNoDue?.message?.slice(0, 40)} · ${eBad ? "bad throw" : "bad ok"} · ${pRow?.recurrenceRule} · ${JSON.stringify(pAct?.data ?? null).slice(0, 80)}`);
  const eVR = await fails(() => rc.setCardRecurrence(ctxT, thana, parent.id, null));
  chk("K2.7-S3.5", "thana (VIEWER) ตั้ง/ล้างกำหนดส่งซ้ำ → Forbidden", !!eVR, "throw", "ไม่ throw");
  // 🔴 cron: วันนี้ (พุธ 30 ก.ย.) เป็นรอบถัดไปหลัง 23 ก.ย. → สร้างลูก 1 ใบ · รัน 2 รอบวันเดียวกัน = ยัง 1 ใบ
  const kidsBefore = await prisma.kanbanCard.count({ where: { recurrenceParentId: parent.id } as Any });
  const r1 = await rc.sweepRecurringCards(TODAY);
  const r2 = await rc.sweepRecurringCards(kq.dayFromToday(0, 23)); // รอบสองในวันเดียวกัน (ดึก)
  const kids = await prisma.kanbanCard.findMany({ where: { recurrenceParentId: parent.id } as Any, include: { cardLabels: true, assignees: true, checklists: { include: { items: true } } } }) as Any[];
  madeCards.push(...kids.map((k) => k.id));
  const kid = kids[0];
  const key = `kanban.recur.${parent.id}.2026-09-30`;
  chk("K2.7-S3.6", "🔴 sweepRecurringCards(now) รัน 2 รอบวันเดียวกัน → การ์ดลูก 1 ใบ (กันซ้ำด้วย recurrenceKey `kanban.recur.{parentId}.{yyyy-mm-dd}` + unique DB) · คืนจำนวนที่สร้าง (1 แล้ว 0)", kids.length - kidsBefore === 1 && r1 === 1 && r2 === 0 && kid?.recurrenceKey === key, "1 ใบ · 1/0", `${kids.length - kidsBefore} ใบ · ${r1}/${r2} · key=${kid?.recurrenceKey}`);
  chk("K2.7-S3.7", "การ์ดลูก: dueAt = วันนี้ 18:00 ไทย (คงเวลาของแม่) · ชื่อ/รายละเอียด/ป้าย/ผู้รับผิดชอบ/เช็คลิสต์ (ยังไม่ทำ) เหมือนแม่ · ไม่มี recurrenceRule เอง · sourceType AUTOMATION sourceId=parentId · อยู่คอลัมน์แรกของบอร์ด · cardNo ใหม่ · activity CARD_CREATED", !!kid && bkkDay(kid.dueAt) === "2026-09-30" && kid.dueAt.getUTCHours() === 11 && kid.title === parent.title && (!lbl || kid.cardLabels.some((l: Any) => l.labelId === lbl.id)) && kid.assignees.some((a: Any) => a.userId === pook.userId) && kid.checklists.length === 1 && kid.checklists[0].items.length === 1 && kid.checklists[0].items[0].done === false && kid.recurrenceRule == null && kid.sourceType === "AUTOMATION" && kid.sourceId === parent.id && kid.columnId === col0.id && typeof kid.cardNo === "number" && kid.cardNo !== parent.cardNo && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: kid.id, type: "CARD_CREATED" } })), "เหมือนแม่", JSON.stringify({ due: kid?.dueAt, t: kid?.title, a: kid?.assignees?.length, cl: kid?.checklists?.[0]?.items?.length, rule: kid?.recurrenceRule, st: kid?.sourceType, col: kid?.columnId === col0.id }));
  const r3 = await rc.sweepRecurringCards(kq.dayFromToday(1, 10)); // พฤหัส — ไม่ใช่รอบ
  const r4 = await rc.sweepRecurringCards(kq.dayFromToday(-7, 10)); // วันเดียวกับ dueAt ของแม่ — แม่คือรอบแรกเอง
  chk("K2.7-S3.8", "วันที่ไม่ตรงกฎ → 0 · วันเดียวกับ dueAt ของแม่ → 0 (การ์ดแม่คือรอบแรก ไม่สร้างซ้ำ)", r3 === 0 && r4 === 0 && (await prisma.kanbanCard.count({ where: { recurrenceParentId: parent.id } as Any })) - kidsBefore === 1, "0/0", `${r3}/${r4}`);
  await prisma.kanbanCard.update({ where: { id: parent.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  const r5 = await rc.sweepRecurringCards(kq.dayFromToday(7, 10)); // พุธหน้า แต่แม่ถูกเก็บแล้ว
  chk("K2.7-S3.9", "แม่ถูกเก็บเข้าคลัง → ไม่สร้างลูกอีก (0)", r5 === 0 && (await prisma.kanbanCard.count({ where: { recurrenceParentId: parent.id } as Any })) - kidsBefore === 1, "0", String(r5));
  await prisma.kanbanCard.update({ where: { id: parent.id }, data: { status: "ACTIVE", archivedAt: null } });
  const r6 = await rc.sweepRecurringCards(kq.dayFromToday(7, 10));
  const kid2 = await prisma.kanbanCard.findFirst({ where: { recurrenceParentId: parent.id, recurrenceKey: `kanban.recur.${parent.id}.2026-10-07` } as Any });
  if (kid2) madeCards.push(kid2.id);
  chk("K2.7-S3.10", "พุธหน้า (7 ต.ค.) → ลูกใบใหม่ key …2026-10-07 (ไม่ย้อนสร้างวันที่พลาด · สร้างเฉพาะวันของ now)", r6 === 1 && !!kid2 && bkkDay(kid2.dueAt!) === "2026-10-07", "1 ใบ 7 ต.ค.", `${r6} · ${kid2?.dueAt?.toISOString()}`);
  const cron = read("src/lib/platform/cron.ts");
  chk("K2.7-S3.11", "runDailyCron เรียก sweepRecurringCards(now) ใน try/catch ของตัวเอง + คืน recurringCards (ไม่เพิ่ม cron ใน vercel.json)", /sweepRecurringCards\(now\)/.test(cron) && /recurringCards/.test(cron) && !/recur/i.test(read("vercel.json")), "มี", "ขาด");
  const detail = await svc.getCardDetail?.(ctxO, parent.id).catch(() => null) ?? (await (await import("@/lib/modules/kanban/cards" as string) as Any).getCardDetail(ctxO, parent.id));
  chk("K2.7-S3.12", "getCardDetail มี recurrenceRule + recurrenceLabel (ไทย) + recurrenceParentId (ลูกชี้แม่) · การ์ดบนบอร์ด (getBoardView DTO) มี isRecurring", detail?.recurrenceRule === "FREQ=WEEKLY;BYDAY=WE" && /ทุกวันพุธ/.test(detail?.recurrenceLabel ?? "") && /isRecurring/.test(read("src/lib/modules/kanban/service.ts") + read("src/lib/modules/kanban/types.ts")), "มี", JSON.stringify({ rule: detail?.recurrenceRule, label: detail?.recurrenceLabel }));

  // ═══ S4 UI (static) ═══
  const cb = read("src/components/kanban/CardBack.tsx");
  chk("K2.7-S4.1", "CardBack: บล็อก 'กำหนดส่งซ้ำ' testid card-recurrence (ไม่ซ้ำ/ทุกวัน/ทุกสัปดาห์/ทุก 2 สัปดาห์/ทุกเดือน — วันตาม dueAt) + คำอธิบายไทย · เมนู 'บันทึกเป็นเทมเพลต' testid save-card-template (ADMIN เท่านั้น) · ลูกแสดง 'เกิดจากงานประจำ: ชื่อแม่' ลิงก์ ?card=", cb.includes("card-recurrence") && cb.includes("save-card-template") && /กำหนดส่งซ้ำ/.test(cb) && /บันทึกเป็นเทมเพลต/.test(cb) && /ทุก 2 สัปดาห์/.test(cb), "ครบ", "ขาด");
  const colc = read("src/components/kanban/Column.tsx") + read("src/components/kanban/BoardView.tsx") + read("src/components/kanban/CardTemplatePicker.tsx");
  chk("K2.7-S4.2", "ปุ่มเพิ่มการ์ดในคอลัมน์มี 'จากเทมเพลต ▾' testid card-template-picker (`CardTemplatePicker.tsx`) → เลือกแล้วสร้างทันที (ชื่อแก้ได้ก่อนสร้าง)", colc.includes("card-template-picker") && /จากเทมเพลต/.test(colc) && existsSync("src/components/kanban/CardTemplatePicker.tsx"), "ครบ", "ขาด");
  chk("K2.7-S4.3", "การ์ดบนบอร์ด/ตาราง: ชิป 🔁 testid card-recurring เมื่อ isRecurring", read("src/components/kanban/Card.tsx").includes("card-recurring"), "มี", "ขาด", "MAJOR");
  const st = read("src/components/kanban/CardTemplatesSettings.tsx") + read("src/app/app/sys/[id]/kanban/b/[boardId]/settings/page.tsx") + read("src/app/app/sys/[id]/kanban/b/[boardId]/settings/card-templates/page.tsx");
  chk("K2.7-S4.4", "ตั้งค่าบอร์ด › เทมเพลตการ์ด testid card-templates-settings: รายการ 'n / 30' + แก้ชื่อ/ลบ/ลาก · ใช้ทางเดียวกับหน้าตั้งค่าของ K2.5/K2.6", st.includes("card-templates-settings") && /\/ 30|\/30/.test(st), "ครบ", "ขาด", "MAJOR");
  const acts = read("src/lib/modules/kanban/actions.ts") + read("src/lib/modules/kanban/settings-actions.ts");
  chk("K2.7-S4.5", "actions: saveCardTemplateAction createCardFromTemplateAction updateCardTemplateAction deleteCardTemplateAction reorderCardTemplatesAction setCardRecurrenceAction", ["saveCardTemplateAction", "createCardFromTemplateAction", "updateCardTemplateAction", "deleteCardTemplateAction", "reorderCardTemplatesAction", "setCardRecurrenceAction"].every((a) => acts.includes(a)), "6 action", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.7") ? readdirSync(".qc-shots/kanban/2.7").filter((f) => f.endsWith(".png")) : [];
  chk("K2.7-S4.6", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/2.7 (เลือกเทมเพลตในคอลัมน์ · หลังการ์ดตั้งกำหนดส่งซ้ำ · ตั้งค่าเทมเพลต)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  // คืนสภาพ: ลบการ์ดที่สร้าง (cascade เช็คลิสต์/ป้าย/ผู้รับผิดชอบ/กิจกรรม) · เทมเพลต · ฟิลด์
  try {
    const ids = madeCards.filter(Boolean);
    if (ids.length) {
      await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } });
      await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } });
    }
    if (madeTemplates.length) await P.kanbanCardTemplate.deleteMany({ where: { id: { in: madeTemplates.filter(Boolean) } } });
    if (madeFields.length) await P.kanbanCustomField.deleteMany({ where: { id: { in: madeFields } } });
    if (tid) await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.7 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
