// QC — บอร์ดงาน WO K1.10: ประวัติกิจกรรม (KanbanActivity append-only) + สายรวมความเห็น/กิจกรรม + pagination + สิทธิ์
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.10
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/activity.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/activity.ts)");
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
  const act = (await import("@/lib/modules/kanban/activity" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const labels = (await import("@/lib/modules/kanban/labels" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cm = (await import("@/lib/modules/kanban/comments" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  // ═══ S1 schema ═══
  const en = await q<{ labels: string }>(`select string_agg(e.enumlabel, ',' order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname='KanbanActivityType'`);
  const types = (en[0]?.labels ?? "").split(",");
  const need = ["BOARD_CREATED", "BOARD_UPDATED", "BOARD_ARCHIVED", "MEMBER_ADDED", "MEMBER_ROLE_CHANGED", "MEMBER_REMOVED", "COLUMN_CREATED", "COLUMN_UPDATED", "COLUMN_MOVED", "COLUMN_ARCHIVED", "CARD_CREATED", "CARD_UPDATED", "CARD_MOVED", "CARD_ASSIGNED", "CARD_UNASSIGNED", "CARD_DUE_SET", "CARD_LABELED", "CARD_UNLABELED", "CARD_ARCHIVED", "CARD_RESTORED", "CARD_COMPLETED", "CHECKLIST_ITEM_DONE", "COMMENT_ADDED", "ATTACHMENT_ADDED"];
  chk("K1.10-S1.1", "enum KanbanActivityType มีชนิดหลักครบ 24 (จาก 28 ของ v1)", need.every((t) => types.includes(t)), "ครบ", need.filter((t) => !types.includes(t)).join(",") || "ครบ");
  const idx = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='KanbanActivity'`);
  chk("K1.10-S1.2", "index (cardId, createdAt DESC) และ (boardId, createdAt DESC)", idx.some((i) => /"cardId", "createdAt" DESC/.test(i.indexdef)) && idx.some((i) => /"boardId", "createdAt" DESC/.test(i.indexdef)), "2 index", idx.map((i) => i.indexdef.replace(/.*USING btree /, "")).join("|"), "MAJOR");

  // ═══ S2 ทุกการกระทำหลักมี activity ═══
  const board = E.boards.patong.id as string;
  await P.kanbanActivity.deleteMany({ where: { boardId: board } });
  const col1 = (await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col1[0]!.id, title: "QC K1.10 กิจกรรม", createdById: E.users.owner.userId });
  await cards.updateCardFields(owner, card.id, { title: "QC K1.10 กิจกรรม (แก้)", dueAt: kq.dayFromToday(2, 17) });
  await cards.setCardAssignees(owner, card.id, [E.users.staff.pook.userId]);
  const lbl = (await labels.listLabels(owner, board))[0];
  await labels.setCardLabels(owner, card.id, [lbl.id]);
  await moves.moveCard(owner, { cardId: card.id, toColumnId: col1[1]!.id });
  await cm.addComment(owner, card.id, "ความเห็นทดสอบ");
  await cards.setCardAssignees(owner, card.id, []);
  await labels.setCardLabels(owner, card.id, []);
  await cards.archiveCard(owner, card.id);
  await cards.restoreCard(owner, card.id);
  const rows = await P.kanbanActivity.findMany({ where: { cardId: card.id }, orderBy: { createdAt: "asc" } }) as Any[];
  const seq = rows.map((r) => r.type);
  const expectTypes = ["CARD_CREATED", "CARD_UPDATED", "CARD_DUE_SET", "CARD_ASSIGNED", "CARD_LABELED", "CARD_MOVED", "COMMENT_ADDED", "CARD_UNASSIGNED", "CARD_UNLABELED", "CARD_ARCHIVED", "CARD_RESTORED"];
  chk("K1.10-S2.1", "ลำดับกิจกรรมของการ์ด: CREATED → UPDATED → DUE_SET → ASSIGNED → LABELED → MOVED → COMMENT_ADDED → UNASSIGNED → UNLABELED → ARCHIVED → RESTORED (ครบทุกชนิด · ลำดับตามเวลา)", expectTypes.every((t) => seq.includes(t)) && expectTypes.map((t) => seq.indexOf(t)).every((v, i, a) => i === 0 || v > a[i - 1]!), expectTypes.join(">"), seq.join(">"));
  const moved = rows.find((r) => r.type === "CARD_MOVED");
  chk("K1.10-S2.2", "CARD_MOVED.data = {fromColumnId,toColumnId} · ทุกแถวมี actorUserId=owner · boardId", moved?.data?.fromColumnId === col1[0]!.id && moved?.data?.toColumnId === col1[1]!.id && rows.every((r) => r.actorUserId === E.users.owner.userId && r.boardId === board), "data ครบ", JSON.stringify(moved?.data));
  const due = rows.find((r) => r.type === "CARD_DUE_SET");
  const asg = rows.find((r) => r.type === "CARD_ASSIGNED");
  chk("K1.10-S2.3", "CARD_DUE_SET.data.dueAt (ISO) · CARD_ASSIGNED.data.userIds มี pook", typeof due?.data?.dueAt === "string" && Array.isArray(asg?.data?.userIds) && asg.data.userIds.includes(E.users.staff.pook.userId), "data", JSON.stringify({ d: due?.data, a: asg?.data }), "MAJOR");

  // board-level
  const tmpCol = await svc.createColumn(tid, SYS, board, "QC คอลัมน์กิจกรรม");
  await moves.renameColumn(owner, tmpCol.id, "QC เปลี่ยนชื่อ");
  await moves.moveColumn(owner, { columnId: tmpCol.id, beforeColumnId: col1[0]!.id });
  await members.addMember(owner, board, E.users.staff.thana.userId, "VIEWER");
  await members.setMemberRole(owner, board, E.users.staff.thana.userId, "EDITOR");
  await members.removeMember(owner, board, E.users.staff.thana.userId);
  await moves.archiveColumn(owner, tmpCol.id);
  const brows = await P.kanbanActivity.findMany({ where: { boardId: board, cardId: null }, orderBy: { createdAt: "asc" } }) as Any[];
  const bseq = brows.map((r) => r.type);
  chk("K1.10-S2.4", "กิจกรรมระดับบอร์ด: COLUMN_CREATED · COLUMN_UPDATED · COLUMN_MOVED · MEMBER_ADDED · MEMBER_ROLE_CHANGED · MEMBER_REMOVED · COLUMN_ARCHIVED", ["COLUMN_CREATED", "COLUMN_UPDATED", "COLUMN_MOVED", "MEMBER_ADDED", "MEMBER_ROLE_CHANGED", "MEMBER_REMOVED", "COLUMN_ARCHIVED"].every((t) => bseq.includes(t)), "ครบ", bseq.join(">"));

  // ═══ S3 อ่าน: การ์ด · บอร์ด · timeline · pagination · สิทธิ์ ═══
  const ca = await act.listCardActivity(owner, card.id, { take: 5 });
  chk("K1.10-S3.1", "listCardActivity(ctx, cardId, {take}) → {items[≤5 ล่าสุดก่อน], nextCursor} · item มี {id,type,actor{name},data,createdAt}", Array.isArray(ca?.items) && ca.items.length === 5 && ca.items[0].type === "CARD_RESTORED" && typeof ca.nextCursor === "string" && typeof ca.items[0].actor?.name === "string", "5 + cursor", JSON.stringify({ n: ca?.items?.length, first: ca?.items?.[0]?.type, cur: typeof ca?.nextCursor }));
  const ca2 = await act.listCardActivity(owner, card.id, { take: 5, cursor: ca.nextCursor });
  chk("K1.10-S3.2", "หน้าถัดไปด้วย cursor ไม่ซ้ำหน้าแรก", Array.isArray(ca2?.items) && ca2.items.length > 0 && !ca2.items.some((x: Any) => ca.items.some((y: Any) => y.id === x.id)), "ไม่ซ้ำ", String(ca2?.items?.length), "MAJOR");
  const ba = await act.listBoardActivity(owner, board, { take: 50 });
  chk("K1.10-S3.3", "listBoardActivity รวมทั้งการ์ดและระดับบอร์ด (≥ 18 รายการ) เรียงล่าสุดก่อน", Array.isArray(ba?.items) && ba.items.length >= 18 && new Date(ba.items[0].createdAt) >= new Date(ba.items.at(-1).createdAt), "≥18", String(ba?.items?.length));
  const tl = await act.listCardTimeline(owner, card.id, { filter: "all" });
  const tlC = await act.listCardTimeline(owner, card.id, { filter: "comments" });
  chk("K1.10-S3.4", "listCardTimeline รวมความเห็น+กิจกรรม (kind: comment|activity) · filter comments = เฉพาะความเห็น 1 รายการ", Array.isArray(tl?.items) && tl.items.some((x: Any) => x.kind === "comment") && tl.items.some((x: Any) => x.kind === "activity") && Array.isArray(tlC?.items) && tlC.items.length === 1 && tlC.items[0].kind === "comment", "ผสม + กรอง", JSON.stringify({ all: tl?.items?.length, c: tlC?.items?.length }));
  const eHidden = await fails(() => act.listCardActivity(thanaCtx, card.id, {}));
  chk("K1.10-S3.5", "thana (มองไม่เห็นบอร์ด) อ่านกิจกรรม → ไม่พบ", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))), "ไม่พบ", `${eHidden?.name}`);
  const other = E.boards.patong.cardIds[0] as string;
  const oa = await act.listCardActivity(owner, other, {});
  chk("K1.10-S3.6", "กิจกรรมไม่ปนข้ามการ์ด (การ์ดอื่นของบอร์ดเดียวกันไม่มีแถวของการ์ดทดสอบ)", Array.isArray(oa?.items) && !oa.items.some((x: Any) => x.cardId === card.id), "ไม่ปน", "ปน");
  // append-only: ไม่มี update/delete API
  const actSrc = readFileSync("src/lib/modules/kanban/activity.ts", "utf8");
  chk("K1.10-S3.7", "activity.ts append-only: ไม่มี kanbanActivity.update/delete", !/kanbanActivity\.(update|delete|updateMany|deleteMany)\(/.test(actSrc), "append-only", "มี update/delete", "MAJOR");
  chk("K1.10-S3.8", "AuditLog กลาง (จาก K1.3) ยังมีแถว member/visibility — activity ไม่แทนที่ audit", (await prisma.auditLog.count({ where: { tenantId: tid, action: { startsWith: "kanban.board.member" } } })) >= 3, "≥3", String(await prisma.auditLog.count({ where: { tenantId: tid, action: { startsWith: "kanban.board.member" } } })), "MAJOR");

  // ═══ S4 static UI ═══
  const cb = existsSync("src/components/kanban/CardBack.tsx") ? readFileSync("src/components/kanban/CardBack.tsx", "utf8") : "";
  const tlUi = existsSync("src/components/kanban/Timeline.tsx") ? readFileSync("src/components/kanban/Timeline.tsx", "utf8") : "";
  chk("K1.10-S4.1", "UI: Timeline.tsx (client) testid timeline · timeline-filter (ทั้งหมด/ความเห็น/กิจกรรม) · CardBack ใช้ · ข้อความกิจกรรมเป็นไทย", /"use client"/.test(tlUi) && tlUi.includes('"timeline"') && tlUi.includes('"timeline-filter"') && /ทั้งหมด/.test(tlUi) && /Timeline/.test(cb), "ครบ", "ขาด", "MAJOR");
  chk("K1.10-S4.2", "เมนูบอร์ด ⋯ มีรายการ 'กิจกรรมของบอร์ด' (BoardHeader/BoardMenu)", /กิจกรรมของบอร์ด/.test((existsSync("src/components/kanban/BoardHeader.tsx") ? readFileSync("src/components/kanban/BoardHeader.tsx", "utf8") : "") + (existsSync("src/components/kanban/BoardMenu.tsx") ? readFileSync("src/components/kanban/BoardMenu.tsx", "utf8") : "")), "มี", "ไม่มี", "MAJOR");

  // cleanup
  await P.kanbanComment.deleteMany({ where: { cardId: card.id } });
  await P.kanbanActivity.deleteMany({ where: { cardId: card.id } });
  await prisma.kanbanCard.deleteMany({ where: { id: card.id } });
  await prisma.kanbanColumn.deleteMany({ where: { id: tmpCol.id } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${board}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.10 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
