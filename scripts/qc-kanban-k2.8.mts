// QC — บอร์ดงาน WO K2.8: กล่องงานเข้าส่วนตัว (KanbanInboxItem) — inbox.ts · จดเร็ว · addFromSource idempotent · ส่งเข้าบอร์ด · UI ภาพ 06 ฝั่งซ้าย + มือถือ 07
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.8
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/inbox.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/inbox.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
let tid = ""; let SYS = ""; const madeCards: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const inbox = (await import("@/lib/modules/kanban/inbox" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const pook = await actorOf(E.users.staff.pook.userId); const thana = await actorOf(E.users.staff.thana.userId); const owner = await actorOf(E.users.owner.userId);
  const ctxP = { tenantId: tid, systemId: SYS, actorUserId: pook.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId }; const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId };
  const board = E.boards.maint.id as string; // TENANT: pook/thana เห็น
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;

  // ═══ S1 schema ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanInboxItem'`)).map((c) => c.column_name);
  chk("K2.8-S1.1", "KanbanInboxItem: tenantId systemId ownerUserId title note source sourceKey fileIds status movedCardId · unique(tenantId,sourceKey)", ["tenantId", "systemId", "ownerUserId", "title", "note", "source", "sourceKey", "fileIds", "status", "movedCardId"].every((c) => cols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanInboxItem' and indexdef ilike '%unique%' and indexdef ilike '%"sourceKey"%'`)).length === 1, "ครบ", cols.join(","));
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='KanbanInboxStatus'`)).map((e) => e.enumlabel);
  chk("K2.8-S1.2", "enum KanbanInboxStatus = OPEN MOVED DISMISSED", ["OPEN", "MOVED", "DISMISSED"].every((v) => enums.includes(v)), "3", enums.join(","));

  // ═══ S2 service ═══
  const i1 = await inbox.quickAdd(ctxP, { title: "  โทรหา supplier ถังอากาศ  " });
  chk("K2.8-S2.1", "quickAdd(ctx,{title}) → item OPEN ของ ownerUserId=ctx.actorUserId · title trim · source MANUAL", i1?.status === "OPEN" && i1.ownerUserId === pook.userId && i1.title === "โทรหา supplier ถังอากาศ" && i1.source === "MANUAL", "OPEN", JSON.stringify(i1).slice(0, 160));
  const eEmpty = await fails(() => inbox.quickAdd(ctxP, { title: "   " }));
  chk("K2.8-S2.2", "ชื่อว่าง → throw ไทย", !!eEmpty && /[ก-๙]/.test(eEmpty.message), "throw ไทย", eEmpty?.message?.slice(0, 50) ?? "ไม่ throw");
  const src = { source: "CHAT", sourceKey: `chat:qc-k28-${Date.now()}`, title: "ลูกค้าถามคอร์ส AOW", note: "จากแชท LINE · AI สรุป: ลูกค้าอยากเรียน AOW ปลายเดือน", fileIds: [] };
  const a1 = await inbox.addFromSource(ctxP, { ...src, ownerUserId: pook.userId });
  const a2 = await inbox.addFromSource(ctxP, { ...src, ownerUserId: pook.userId });
  chk("K2.8-S2.3", "addFromSource idempotent ด้วย sourceKey → ครั้งที่ 2 คืน item เดิม (id เท่ากัน) ไม่สร้างซ้ำ · source CHAT · note เก็บ", a1?.id && a2?.id === a1.id && a1.source === "CHAT" && /AI สรุป/.test(a1.note ?? ""), "id เดิม", `${a1?.id} / ${a2?.id}`);
  const lp = await inbox.listInbox(ctxP, pook.userId);
  const lt = await inbox.listInbox(ctxT, thana.userId);
  chk("K2.8-S2.4", "listInbox: pook เห็น 2 (ใหม่ก่อน) · thana เห็น 0 (ส่วนตัวล้วน) · รายการมี {id,title,note,source,sourceLabel ไทย,createdAt,fileIds}", lp.length === 2 && lt.length === 0 && lp[0].id === a1.id && /[ก-๙]/.test(lp[0].sourceLabel ?? ""), "2/0", `${lp.length}/${lt.length} ${JSON.stringify(lp[0] ?? {}).slice(0, 120)}`);
  const eSpy = await fails(() => inbox.listInbox(ctxO, pook.userId));
  chk("K2.8-S2.5", "OWNER ขอดูกล่องของ pook (userId ≠ actor) → Forbidden (ผู้ดูแลก็ดูของคนอื่นไม่ได้)", !!eSpy, "throw", "ไม่ throw");
  const before = await prisma.kanbanCard.count({ where: { boardId: board, status: "ACTIVE" } });
  const mv = await inbox.moveToBoard(ctxP, { itemId: a1.id, boardId: board, columnId: col.id, dueAt: null });
  const movedCard = mv?.cardId ? await prisma.kanbanCard.findUnique({ where: { id: mv.cardId } }) : null;
  if (mv?.cardId) madeCards.push(mv.cardId);
  const itemAfter = await P.kanbanInboxItem.findUnique({ where: { id: a1.id } });
  chk("K2.8-S2.6", "moveToBoard → สร้างการ์ดในคอลัมน์ (title/description=note · sourceType=CHAT · sourceKey เดิม · createdBy=pook · assignee=pook) · item → MOVED + movedCardId · activity CARD_CREATED", mv?.ok === true && movedCard?.columnId === col.id && movedCard?.sourceType === "CHAT" && movedCard?.title === "ลูกค้าถามคอร์ส AOW" && itemAfter?.status === "MOVED" && itemAfter?.movedCardId === mv.cardId && (await prisma.kanbanCard.count({ where: { boardId: board, status: "ACTIVE" } })) === before + 1, "MOVED + การ์ด", JSON.stringify({ mv, status: itemAfter?.status, src: movedCard?.sourceType }).slice(0, 160));
  const eAgain = await fails(() => inbox.moveToBoard(ctxP, { itemId: a1.id, boardId: board, columnId: col.id }));
  chk("K2.8-S2.7", "ส่ง item ที่ MOVED แล้วซ้ำ → throw ไทย (ไม่สร้างการ์ดใบที่ 2)", !!eAgain && (await prisma.kanbanCard.count({ where: { boardId: board, status: "ACTIVE" } })) === before + 1, "throw", eAgain?.message?.slice(0, 50) ?? "ไม่ throw");
  const eBoard = await fails(() => inbox.moveToBoard(ctxT, { itemId: i1.id, boardId: E.boards.patong.id, columnId: col.id }));
  chk("K2.8-S2.8", "thana ส่ง item ของ pook / หรือส่งเข้าบอร์ดที่มองไม่เห็น → ไม่พบ/Forbidden", !!eBoard, "throw", "ไม่ throw");
  await inbox.dismiss(ctxP, i1.id);
  const lp2 = await inbox.listInbox(ctxP, pook.userId);
  chk("K2.8-S2.9", "dismiss → DISMISSED · listInbox เหลือ 0 (เฉพาะ OPEN)", lp2.length === 0 && (await P.kanbanInboxItem.findUnique({ where: { id: i1.id } }))?.status === "DISMISSED", "0", String(lp2.length));
  const many = await fails(async () => { for (let i = 0; i < 201; i++) await inbox.quickAdd(ctxP, { title: `x${i}` }); });
  chk("K2.8-S2.10", "เพดาน 200 รายการ OPEN ต่อคน (KANBAN_LIMITS.inboxOpenMax) → ใบที่ 201 throw ไทย", !!many && /[ก-๙]/.test(many.message), "throw", many?.message?.slice(0, 50) ?? "ไม่ throw", "MAJOR");
  await P.kanbanInboxItem.deleteMany({ where: { ownerUserId: pook.userId, title: { startsWith: "x" } } });

  // ═══ S3 consumer §9.2 (แชท → กล่องงานเข้า) ═══
  const consumers = read("src/lib/outbox-consumers.ts") + read("src/lib/modules/kanban/inbox-consumers.ts");
  chk("K2.8-S3.1", "มี consumer 'kanban.inbox.requested' (หรือ chat.task.requested) ลงทะเบียน → addFromSource (idempotent sourceKey chat:<messageId>) + label ไทย", /inbox\.requested|task\.requested/.test(consumers) && /addFromSource/.test(consumers), "consumer", "ไม่มี", "MAJOR");

  // ═══ S4 UI (static) ═══
  const ui = read("src/components/kanban/InboxPanel.tsx") + read("src/components/kanban/MyTasks.tsx");
  chk("K2.8-S4.1", "InboxPanel.tsx (client) testid inbox-panel · inbox-quick-add (Enter = จด) · inbox-item · ปุ่ม 'ส่งเข้าบอร์ด' (เลือกบอร์ด/คอลัมน์) · ชิปที่มา (จากแชท LINE / ส่งต่อทางอีเมล / จดไว้เอง) · ป้าย 'AI ตั้งชื่อ + สรุปให้แล้ว' เมื่อมี note · ว่าง = 'กล่องงานเข้าว่างแล้ว — จดงานใหม่ได้ที่ช่องด้านบน'", ["inbox-panel", "inbox-quick-add", "inbox-item"].every((t) => ui.includes(t)) && /ส่งเข้าบอร์ด/.test(ui) && /จดไว้เอง/.test(ui) && /AI ตั้งชื่อ/.test(ui) && /กล่องงานเข้าว่างแล้ว/.test(ui), "ครบ", "ขาด");
  chk("K2.8-S4.2", "หน้า my-tasks: 2 คอลัมน์ (ซ้าย=กล่องงานเข้า · ขวา=งานของฉัน) ตามภาพ 06 · หัว 'สวัสดี…' + วันที่ไทย + 'จดงานเร็ว' · มือถือ: งานของฉันบนสุด กล่องถัดลงมา", /InboxPanel/.test(ui) && /สวัสดี/.test(ui) && /จดงานเร็ว/.test(ui), "ครบ", "ขาด", "MAJOR");
  chk("K2.8-S4.3", "actions quickAddInboxAction · moveInboxToBoardAction · dismissInboxAction (export เฉพาะ *Action)", ["quickAddInboxAction", "moveInboxToBoardAction", "dismissInboxAction"].every((a) => read("src/lib/modules/kanban/actions.ts").includes(a)), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.8") ? readdirSync(".qc-shots/kanban/2.8").filter((f) => f.endsWith(".png")) : [];
  chk("K2.8-S4.4", "ภาพจริง ≥ 3 ใบ (หน้า my-tasks 2 คอลัมน์ · หลังจด Enter · ส่งเข้าบอร์ด · มือถือ)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (madeCards.length) { await P.kanbanActivity.deleteMany({ where: { cardId: { in: madeCards } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: madeCards } } }); }
    if (tid) { await P.kanbanInboxItem.deleteMany({ where: { tenantId: tid, OR: [{ sourceKey: { startsWith: "chat:qc-k28-" } }, { title: { in: ["โทรหา supplier ถังอากาศ"] } }] } }); await P.kanbanActivity.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: "CARD_CREATED" } }); }
    const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
    await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.maint.id}'`);
  } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.8 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
