// QC — บอร์ดงาน WO K1.7: เช็คลิสต์ (หลายชุด · รายการมอบหมาย/กำหนดส่ง · reorder · ≤50 · ความคืบหน้า · งานของฉัน · event ครบทุกข้อ)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.7
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/checklists.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/checklists.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number, h?: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const q = async <T = Any,>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe(sql) as Promise<T[]>;
const fails = async (f: () => Promise<unknown>): Promise<Any> => { try { await f(); return null; } catch (e) { return e; } };
const P = prisma as Any;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const owner = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const thanaCtx = { tenantId: tid, systemId: SYS, actorUserId: E.users.staff.thana.userId };
  const cl = (await import("@/lib/modules/kanban/checklists" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ord = (await import("@/lib/modules/kanban/ordering" as string)) as Record<string, (...a: Any[]) => Any>;

  // ═══ S1 schema ═══
  const tables = (await q<{ table_name: string }>(`select table_name from information_schema.tables where table_name in ('KanbanChecklist','KanbanChecklistItem')`)).map((r) => r.table_name);
  chk("K1.7-S1.1", "ตาราง KanbanChecklist · KanbanChecklistItem", tables.length === 2, "2", tables.join(","));
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanChecklistItem'`)).map((r) => r.column_name);
  chk("K1.7-S1.2", "รายการมี text/done/position/assigneeUserId/dueAt/doneAt/doneById", ["text", "done", "position", "assigneeUserId", "dueAt", "doneAt", "doneById"].every((c) => cols.includes(c)), "ครบ", cols.join(","));

  // ═══ S2 สร้าง/แก้/เรียง ═══
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.7 การ์ดเช็คลิสต์" });
  const l1 = await cl.createChecklist(owner, card.id, "ขั้นตอนงาน");
  const l2 = await cl.createChecklist(owner, card.id, "เอกสาร");
  chk("K1.7-S2.1", "createChecklist ×2 บนการ์ดเดียว → 2 ชุด เรียงตาม position", !!l1?.id && !!l2?.id && (await P.kanbanChecklist.count({ where: { cardId: card.id } })) === 2 && l1.position < l2.position, "2 ชุด", String(await P.kanbanChecklist.count({ where: { cardId: card.id } })));
  const i1 = await cl.addItem(owner, l1.id, "เช็ควันว่างเรือ");
  const i2 = await cl.addItem(owner, l1.id, "ขอเลขผู้เสียภาษี", { assigneeUserId: E.users.staff.pook.userId, dueAt: kq.dayFromToday(2, 17) });
  const i3 = await cl.addItem(owner, l1.id, "ส่งใบเสนอราคา");
  chk("K1.7-S2.2", "addItem ×3 → position เรียง · รายการที่ 2 มี assignee+dueAt", i1.position < i2.position && i2.position < i3.position && i2.assigneeUserId === E.users.staff.pook.userId && i2.dueAt instanceof Date, "เรียง+มอบหมาย", JSON.stringify({ a: i2.assigneeUserId === E.users.staff.pook.userId, d: !!i2.dueAt }));
  await cl.moveItem(owner, i3.id, { beforeItemId: i1.id });
  const items = await P.kanbanChecklistItem.findMany({ where: { checklistId: l1.id }, orderBy: { position: "asc" } }) as Any[];
  chk("K1.7-S2.3", "moveItem i3 ไปก่อน i1 → ลำดับ i3,i1,i2 (ordering.ts)", items.map((i) => i.id).join() === [i3.id, i1.id, i2.id].join(), "i3,i1,i2", items.map((i) => i.text).join());
  await cl.editItem(owner, i1.id, { text: "เช็ควันว่างเรือ Sea Fox", assigneeUserId: E.users.staff.thana.userId, dueAt: kq.dayFromToday(1, 12) });
  const i1b = await P.kanbanChecklistItem.findUnique({ where: { id: i1.id } });
  chk("K1.7-S2.4", "editItem เปลี่ยน text/assignee/dueAt", i1b.text === "เช็ควันว่างเรือ Sea Fox" && i1b.assigneeUserId === E.users.staff.thana.userId && i1b.dueAt instanceof Date, "แก้ได้", JSON.stringify({ t: i1b.text, a: i1b.assigneeUserId === E.users.staff.thana.userId }));
  await cl.renameChecklist(owner, l2.id, "เอกสารประกอบ");
  chk("K1.7-S2.5", "renameChecklist", (await P.kanbanChecklist.findUnique({ where: { id: l2.id } })).title === "เอกสารประกอบ", "ชื่อใหม่", "เดิม", "MAJOR");
  const eNotMember = await fails(() => cl.addItem(owner, l1.id, "x", { assigneeUserId: "user_none" }));
  chk("K1.7-S2.6", "มอบหมายรายการให้คนที่ไม่ใช่ membership ของร้าน → error ไทย", !!eNotMember && /[ก-๙]/.test(String(eNotMember?.message ?? eNotMember)), "error", String(eNotMember?.message ?? eNotMember).slice(0, 60), "MAJOR");

  // ═══ S3 ติ๊ก/ความคืบหน้า/event ═══
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.checklist.completed" } });
  await cl.toggleItem(owner, i1.id, true);
  const i1c = await P.kanbanChecklistItem.findUnique({ where: { id: i1.id } });
  chk("K1.7-S3.1", "toggleItem true → done · doneAt · doneById = ผู้ทำ", i1c.done === true && i1c.doneAt instanceof Date && i1c.doneById === E.users.owner.userId, "done", JSON.stringify({ d: i1c.done, by: i1c.doneById === E.users.owner.userId }));
  const prog = await cl.getCardChecklists(owner, card.id);
  chk("K1.7-S3.2", "getCardChecklists(ctx, cardId) → [{id,title,items[],progress{done,total}}] · ชุดแรก 1/3 · รวม 1/3", Array.isArray(prog) && prog.length === 2 && prog[0].progress.done === 1 && prog[0].progress.total === 3 && Array.isArray(prog[0].items) && prog[0].items.length === 3, "1/3", JSON.stringify(prog?.[0]?.progress));
  await cl.toggleItem(owner, i2.id, true); await cl.toggleItem(owner, i3.id, true);
  const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: "kanban.checklist.completed" } });
  chk("K1.7-S3.3", "ติ๊กครบทุกข้อ → outbox kanban.checklist.completed 1 ใบ (idempotency ผูก checklistId)", ev.length === 1 && String(ev[0]!.idempotencyKey).includes(l1.id), "1", String(ev.length));
  await cl.toggleItem(owner, i3.id, false); await cl.toggleItem(owner, i3.id, true);
  const ev2 = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: "kanban.checklist.completed" } });
  chk("K1.7-S3.4", "ติ๊กออกแล้วติ๊กครบใหม่ → event ใบใหม่ (คีย์ต่างรอบ) รวม 2 · consumer ลงทะเบียน", ev2.length === 2 && typeof ((await import("@/lib/outbox-consumers")).consumers as Record<string, unknown>)["kanban.checklist.completed"] === "function", "2 + consumer", String(ev2.length), "MAJOR");
  const i1d = await P.kanbanChecklistItem.findUnique({ where: { id: i1.id } });
  await cl.toggleItem(owner, i1.id, false);
  const i1e = await P.kanbanChecklistItem.findUnique({ where: { id: i1.id } });
  chk("K1.7-S3.5", "toggle false → done false · doneAt/doneById null", i1d.done === true && i1e.done === false && i1e.doneAt === null && i1e.doneById === null, "null", JSON.stringify({ d: i1e.done, at: i1e.doneAt }), "MAJOR");

  // ═══ S4 งานของฉัน: รายการที่มอบหมายให้ฉัน ═══
  const mine = await cl.listMyChecklistItems(owner, E.users.staff.pook.userId);
  chk("K1.7-S4.1", "listMyChecklistItems(ctx, userId) ของ pook → มีรายการ i2 พร้อม card{id,title,cardNo,boardId} และ dueAt · ไม่รวมที่ done", Array.isArray(mine) && mine.some((m: Any) => m.id === i2.id && m.card?.id === card.id && typeof m.card?.cardNo === "number") === false && mine.every((m: Any) => m.done === false), "ไม่รวม done", JSON.stringify(mine).slice(0, 120));
  await cl.toggleItem(owner, i2.id, false);
  const mine2 = await cl.listMyChecklistItems(owner, E.users.staff.pook.userId);
  chk("K1.7-S4.2", "หลังติ๊กออก → รายการ i2 โผล่ในงานของฉันของ pook", mine2.some((m: Any) => m.id === i2.id && m.card?.id === card.id), "โผล่", JSON.stringify(mine2.map((m: Any) => m.id)).slice(0, 100));

  // ═══ S5 เพดาน 50 · ลบ · สิทธิ์ ═══
  for (let i = 0; i < 47; i++) await cl.addItem(owner, l2.id, `รายการ ${i}`);
  const eLimit = await fails(() => cl.addItem(owner, l2.id, "เกิน 50"));
  chk("K1.7-S5.1", "รายการรวมต่อการ์ดเกิน 50 → error ไทย (KANBAN_LIMITS.checklistItemsPerCard)", !!eLimit && /[ก-๙]/.test(String(eLimit?.message ?? eLimit)) && (await P.kanbanChecklistItem.count({ where: { checklist: { cardId: card.id } } })) === 50, "50 + error", `${await P.kanbanChecklistItem.count({ where: { checklist: { cardId: card.id } } })}`);
  await cl.deleteItem(owner, i3.id);
  await cl.deleteChecklist(owner, l2.id);
  chk("K1.7-S5.2", "deleteItem · deleteChecklist (ลบรายการในชุดด้วย cascade)", (await P.kanbanChecklistItem.count({ where: { id: i3.id } })) === 0 && (await P.kanbanChecklist.count({ where: { id: l2.id } })) === 0 && (await P.kanbanChecklistItem.count({ where: { checklistId: l2.id } })) === 0, "หาย", "ค้าง");
  const eHidden = await fails(() => cl.toggleItem(thanaCtx, i1.id, true));
  chk("K1.7-S5.3", "thana (มองไม่เห็นบอร์ด PRIVATE) ติ๊ก → ไม่พบ (404-class) ไม่เปลี่ยน", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))) && (await P.kanbanChecklistItem.findUnique({ where: { id: i1.id } })).done === false, "ไม่พบ", `${eHidden?.name}`);
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  await members.addMember(owner, E.boards.patong.id, E.users.staff.thana.userId, "VIEWER");
  const eViewer = await fails(() => cl.toggleItem(thanaCtx, i1.id, true));
  chk("K1.7-S5.4", "VIEWER ติ๊ก → Forbidden (403)", !!eViewer && (eViewer?.name === "KanbanForbiddenError" || eViewer?.status === 403), "403", `${eViewer?.name}`);
  await members.removeMember(owner, E.boards.patong.id, E.users.staff.thana.userId);

  // static UI
  const cb = existsSync("src/components/kanban/CardBack.tsx") ? readFileSync("src/components/kanban/CardBack.tsx", "utf8") : "";
  const clUi = existsSync("src/components/kanban/Checklist.tsx") ? readFileSync("src/components/kanban/Checklist.tsx", "utf8") : "";
  chk("K1.7-S6.1", "UI: มี Checklist.tsx (client) มี testid checklist · checklist-item · checklist-progress · ซ่อนที่ทำแล้ว (ข้อความ 'ซ่อนรายการที่ทำแล้ว') และ CardBack ใช้", /"use client"/.test(clUi) && ["checklist", "checklist-item", "checklist-progress"].every((t) => clUi.includes(`"${t}"`)) && /ซ่อนรายการที่ทำแล้ว/.test(clUi) && /Checklist/.test(cb), "ครบ", "ขาด", "MAJOR");
  chk("K1.7-S6.2", "การ์ดบนบอร์ดแสดงตรา n/m ของเช็คลิสต์ (Card.tsx อ่าน checklistProgress)", /checklist/i.test(existsSync("src/components/kanban/Card.tsx") ? readFileSync("src/components/kanban/Card.tsx", "utf8") : ""), "ตรา", "ไม่มี", "MAJOR");

  // cleanup
  await P.kanbanChecklistItem.deleteMany({ where: { checklist: { cardId: card.id } } });
  await P.kanbanChecklist.deleteMany({ where: { cardId: card.id } });
  await prisma.kanbanCard.deleteMany({ where: { id: card.id } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.checklist.completed" } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.patong.id}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.7 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
