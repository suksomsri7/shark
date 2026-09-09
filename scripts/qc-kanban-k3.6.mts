// QC — บอร์ดงาน WO K3.6: คำแนะนำกฎอัตโนมัติจากพฤติกรรมจริง — นับจาก KanbanActivity (ไม่ใช่ข้อความแต่ง) · กด "สร้าง" ได้ร่างกฎที่แก้ได้ก่อนบันทึก · แผงในภาพ 08
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.6 · เกณฑ์ §3.9/§13 K3.6 · ต้องมี K2.9 ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/automation-suggest.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/automation-suggest.ts)");
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
const P = prisma as Any;
let tid = ""; let SYS = "";
const madeActs: string[] = []; const madeCards: string[] = []; let lblId: string | null = null;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const sg = (await import("@/lib/modules/kanban/automation-suggest" as string)) as Record<string, (...a: Any[]) => Any>;
  const au = (await import("@/lib/modules/kanban/automation" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: U.thana };
  const board = E.boards.maint.id as string; const NOW = kq.dayFromToday(0, 10);
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const [c0, c1, c2] = [cols[0]!, cols[1]!, cols[2] ?? cols[1]!];
  const anyCard = (await prisma.kanbanCard.findFirst({ where: { boardId: board, status: "ACTIVE" } }))!;
  const lbl = await prisma.kanbanLabel.create({ data: { tenantId: tid, systemId: SYS, boardId: board, name: `ด่วนมาก-${Date.now() % 10000}`, color: "RED" } as Any }); lblId = lbl.id;
  const base = new Date(NOW.getTime() - 3 * 86400_000);
  // พฤติกรรมจริง 1: pook ย้ายการ์ด c1 → c2 ด้วยมือ 7 ครั้งใน 30 วัน (ทุกครั้งหลังเช็คลิสต์ครบ)
  for (let i = 0; i < 7; i++) {
    const a = await prisma.kanbanActivity.create({ data: { tenantId: tid, boardId: board, cardId: anyCard.id, actorUserId: U.pook, type: "CARD_MOVED", data: { fromColumnId: c1.id, toColumnId: c2.id }, createdAt: new Date(base.getTime() - i * 3600_000) } as Any }); madeActs.push(a.id);
  }
  // พฤติกรรมจริง 2: การ์ดป้าย "ด่วนมาก" 6 ใบ ถูกสร้างแล้วไม่มีผู้รับผิดชอบภายใน 1 ชม.แรก
  for (let i = 0; i < 6; i++) {
    const c = await prisma.kanbanCard.create({ data: { tenantId: tid, systemId: SYS, boardId: board, columnId: c0.id, title: `QC K3.6 ด่วน ${i}`, createdAt: new Date(base.getTime() - i * 7200_000), sortOrder: 0 } }); madeCards.push(c.id);
    await prisma.kanbanCardLabel.create({ data: { cardId: c.id, labelId: lbl.id, tenantId: tid } });
    const a1 = await prisma.kanbanActivity.create({ data: { tenantId: tid, boardId: board, cardId: c.id, actorUserId: U.owner, type: "CARD_CREATED", data: { title: c.title }, createdAt: c.createdAt } as Any }); madeActs.push(a1.id);
    const a2 = await prisma.kanbanActivity.create({ data: { tenantId: tid, boardId: board, cardId: c.id, actorUserId: U.owner, type: "CARD_LABELED", data: { labelId: lbl.id }, createdAt: new Date(c.createdAt.getTime() + 60_000) } as Any }); madeActs.push(a2.id);
    if (i === 0) { const a3 = await prisma.kanbanActivity.create({ data: { tenantId: tid, boardId: board, cardId: c.id, actorUserId: U.owner, type: "CARD_ASSIGNED", data: { userId: U.pook }, createdAt: new Date(c.createdAt.getTime() + 20 * 60_000) } as Any }); madeActs.push(a3.id); } // ใบแรกมอบภายใน 20 นาที → ไม่นับ
  }

  // ═══ S1 suggestRules ═══
  const s1 = await sg.suggestRules(ctxO, owner, board, { now: NOW, days: 30 });
  const moveSug = s1.find((s: Any) => s.pattern === "REPEATED_MANUAL_MOVE");
  const assignSug = s1.find((s: Any) => s.pattern === "LABEL_UNASSIGNED");
  chk("K3.6-S1.1", "suggestRules(ctx, actor, boardId, {now, days}) → [{ id (คงที่), pattern, title ไทย, reason ไทย, evidence: { count, since, sample[] }, rule: KanbanRuleInput }] · ไม่ต้องใช้ LLM (วิเคราะห์จาก KanbanActivity) · เรียงตาม evidence.count มากก่อน", Array.isArray(s1) && s1.length >= 2 && s1.every((s: Any) => typeof s.id === "string" && /[ก-๙]/.test(s.title) && /[ก-๙]/.test(s.reason) && Number.isInteger(s.evidence?.count) && s.rule?.boardId === board && Array.isArray(s.rule.actions)) && s1.every((s: Any, i: number) => i === 0 || s1[i - 1].evidence.count >= s.evidence.count), "≥2 ข้อเสนอ", JSON.stringify(s1?.map((s: Any) => [s.pattern, s.evidence?.count])));
  chk("K3.6-S1.2", "🔴 แบบที่ 1 'คุณย้ายการ์ดจาก {c1} ไป {c2} เองซ้ำ ๆ 7 ครั้ง' — evidence.count = 7 ตรงกับ KanbanActivity CARD_MOVED จริง (ไม่ใช่ตัวเลขแต่ง) · title มีชื่อคอลัมน์ทั้งสอง · rule = RULE event kanban.checklist.completed + condition column is {c1} + action move_column {c2}", moveSug && moveSug.evidence.count === 7 && moveSug.title.includes(c1.name) && moveSug.title.includes(c2.name) && moveSug.rule.kind === "RULE" && moveSug.rule.event === "kanban.checklist.completed" && moveSug.rule.conditions?.some((c: Any) => c.field === "column" && c.value === c1.id) && moveSug.rule.actions?.some((a: Any) => a.type === "move_column" && a.params?.columnId === c2.id), "7 ครั้ง", JSON.stringify(moveSug ?? null).slice(0, 240));
  chk("K3.6-S1.3", "🔴 แบบที่ 2 'การ์ดป้าย {ด่วนมาก} ไม่เคยมีผู้รับผิดชอบใน 1 ชม.แรก 5 ใบ' — count = 5 (ใบที่มอบใน 20 นาทีไม่นับ) · rule = RULE event kanban.card.created + condition label has {lbl} + action assign (userId = ผู้ดูแล/ผู้จัดการที่ระบบเดา หรือปล่อยว่างให้ผู้ใช้เลือก)", assignSug && assignSug.evidence.count === 5 && assignSug.title.includes(lbl.name) && assignSug.rule.event === "kanban.card.created" && assignSug.rule.conditions?.some((c: Any) => c.field === "label" && c.value === lbl.id) && assignSug.rule.actions?.some((a: Any) => a.type === "assign" || a.type === "notify"), "5 ใบ", JSON.stringify(assignSug ?? null).slice(0, 240));
  const s2 = await sg.suggestRules(ctxO, owner, board, { now: NOW, days: 30 });
  chk("K3.6-S1.4", "id คงที่ข้ามการเรียก (hash จาก pattern+พารามิเตอร์) · days=1 → พฤติกรรมเมื่อ 3 วันก่อนไม่นับ → ไม่มีข้อเสนอ 2 แบบนี้", s2.map((s: Any) => s.id).join() === s1.map((s: Any) => s.id).join() && !(await sg.suggestRules(ctxO, owner, board, { now: NOW, days: 1 })).some((s: Any) => s.pattern === "REPEATED_MANUAL_MOVE" || s.pattern === "LABEL_UNASSIGNED"), "คงที่ · กรองวัน", "ไม่ตรง");
  const eT = await fails(() => sg.suggestRules(ctxT, thana, board, { now: NOW }));
  chk("K3.6-S1.5", "thana (ไม่มีคีย์ automation.manage / ไม่ใช่ ADMIN) → Forbidden · บอร์ดที่ไม่มีพฤติกรรมพอ (< 5 ครั้ง) → []", !!eT && (await sg.suggestRules(ctxO, owner, E.boards.kata.id, { now: NOW })).length === 0, "throw · []", `${!!eT}`);
  // ร่างกฎต้องผ่าน zod ของ K2.9 และไม่เขียน DB จนกว่าจะบันทึก
  const before = await prisma.automationRule.count({ where: { tenantId: tid } });
  const dry = await au.dryRun(ctxO, owner, moveSug.rule, { days: 30, now: NOW });
  chk("K3.6-S1.6", "rule ที่เสนอผ่านการตรวจของ K2.9 (dryRun ไม่ throw) · ยังไม่มีแถว AutomationRule ใหม่ (สร้างเมื่อผู้ใช้กดบันทึกในตัวสร้างกฎเท่านั้น)", dry && Array.isArray(dry.matched) && (await prisma.automationRule.count({ where: { tenantId: tid } })) === before, "ผ่าน · ไม่เขียน", JSON.stringify(dry).slice(0, 120));
  chk("K3.6-S1.7", "ถ้ามี deps.complete (LLM) ใช้เฉพาะ 'เรียบเรียง title/reason' — evidence/rule ต้องเท่าเดิมเป๊ะ · LLM พัง → ใช้ข้อความ deterministic ไม่ throw", await (async () => { const a = await sg.suggestRules(ctxO, owner, board, { now: NOW, days: 30, deps: { complete: async () => JSON.stringify({ title: "ชื่อจาก AI", reason: "เหตุผลจาก AI" }) } }); const b = await sg.suggestRules(ctxO, owner, board, { now: NOW, days: 30, deps: { complete: async () => { throw new Error("x"); } } }); const am = a.find((s: Any) => s.pattern === "REPEATED_MANUAL_MOVE"); const bm = b.find((s: Any) => s.pattern === "REPEATED_MANUAL_MOVE"); return am?.evidence.count === 7 && JSON.stringify(am.rule) === JSON.stringify(moveSug.rule) && bm?.evidence.count === 7 && /[ก-๙]/.test(bm.title); })(), "evidence เท่าเดิม", "ไม่ตรง", "MAJOR");

  // ═══ S2 UI (static) ═══
  const ui = read("src/components/kanban/AutomationBuilder.tsx") + read("src/components/kanban/AutomationSuggestions.tsx");
  chk("K3.6-S2.1", "แผง 'คำแนะนำจาก AI (n)' testid automation-suggestions ตามภาพ 08: แต่ละข้อ = title หนา + บรรทัดรอง (reason อ้างตัวเลขจริง) + ปุ่ม 'สร้าง' testid suggestion-create → โหลด rule ลงตัวสร้างกฎ (ยังไม่บันทึก · หัว 'กฎใหม่ — ยังไม่บันทึก') · ซ้ายเมนู 'คำแนะนำจาก AI' แสดงจำนวน · ไม่มีข้อเสนอ = 'ยังไม่พบพฤติกรรมซ้ำพอจะแนะนำ — ใช้บอร์ดต่อไปอีกสักพัก'", ui.includes("automation-suggestions") && ui.includes("suggestion-create") && /คำแนะนำจาก AI/.test(ui) && /ยังไม่พบพฤติกรรม/.test(ui), "ครบ", "ขาด");
  chk("K3.6-S2.2", "หน้า automation เรียก suggestRules ฝั่ง server (ไม่ใช่ client fetch) · action loadSuggestionAction ไม่มี (โหลดเข้าฟอร์มฝั่ง client จาก props) · automation-suggest.ts ไม่มี any และไม่ import LLM provider แบบ static (lazy)", /suggestRules/.test(read("src/app/app/sys/[id]/kanban/automation/page.tsx")) && !/:\s*any\b/.test(read("src/lib/modules/kanban/automation-suggest.ts")) && !/^import .*@\/lib\/ai\/provider/m.test(read("src/lib/modules/kanban/automation-suggest.ts")), "ครบ", "ขาด", "MAJOR");
  const shots = existsSync(".qc-shots/kanban/3.6") ? readdirSync(".qc-shots/kanban/3.6").filter((f) => f.endsWith(".png")) : [];
  chk("K3.6-S2.3", "ภาพจริง ≥ 1 ใบใน .qc-shots/kanban/3.6 (แผงคำแนะนำมีข้อเสนอจริง + หลังกด 'สร้าง' ฟอร์มถูกเติม)", shots.length >= 1, "≥1", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (madeActs.length) await prisma.kanbanActivity.deleteMany({ where: { id: { in: madeActs } } });
    if (madeCards.length) { await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: madeCards } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: madeCards } } }); }
    if (lblId) await prisma.kanbanLabel.deleteMany({ where: { id: lblId } });
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.6 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
