// QC — บอร์ดงาน WO K1.8: ความเห็น + @mention + แจ้งเตือนยิงตรงคน (in-app/push รายคน) + auto-VIEWER + event
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.8
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/comments.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/comments.ts)");
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
const q = async <T = Any,>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe(sql) as Promise<T[]>;
const fails = async (f: () => Promise<unknown>): Promise<Any> => { try { await f(); return null; } catch (e) { return e; } };
const P = prisma as Any;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const U = { owner: E.users.owner.userId as string, thana: E.users.staff.thana.userId as string, pook: E.users.staff.pook.userId as string, kitti: E.users.staff.kitti.userId as string };
  const ctxOf = (u: string) => ({ tenantId: tid, systemId: SYS, actorUserId: u });
  const cm = (await import("@/lib/modules/kanban/comments" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const push = (await import("@/lib/core/push" as string)) as Record<string, Any>;

  // ═══ S1 schema + push helper ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanComment'`)).map((r) => r.column_name);
  chk("K1.8-S1.1", "ตาราง KanbanComment: cardId authorUserId body mentions editedAt deletedAt", ["cardId", "authorUserId", "body", "mentions", "editedAt", "deletedAt"].every((c) => cols.includes(c)), "ครบ", cols.join(","));
  chk("K1.8-S1.2", "src/lib/core/push.ts มี sendPushToUser(userId, …) ใหม่ (ยิงรายคน)", typeof push.sendPushToUser === "function", "function", typeof push.sendPushToUser);

  // เตรียม: pook เป็น EDITOR · kitti ไม่ใช่สมาชิก · บอร์ดป่าตอง PRIVATE
  await prisma.kanbanBoard.update({ where: { id: E.boards.patong.id }, data: { visibility: "PRIVATE" } });
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.patong.id } });
  await members.addMember(ctxOf(U.owner), E.boards.patong.id, U.pook, "EDITOR");
  await members.addMember(ctxOf(U.owner), E.boards.patong.id, U.thana, "VIEWER");
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.8 ความเห็น" });
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.comment.added" } });

  // ═══ S2 เพิ่มความเห็น + mention ═══
  const c1 = await cm.addComment(ctxOf(U.pook), card.id, `เช็คกับกัปตันแล้ว @[ธนา](${U.thana}) ใส่เงื่อนไขด้วยนะ และ @[กิตติ](${U.kitti}) เตรียมถัง`);
  chk("K1.8-S2.1", "addComment → row มี body · mentions = [thana,kitti] (ดึงจาก markup @[ชื่อ](userId)) · authorUserId = pook", !!c1?.id && c1.authorUserId === U.pook && Array.isArray(c1.mentions) && c1.mentions.includes(U.thana) && c1.mentions.includes(U.kitti) && c1.mentions.length === 2, "2 mention", JSON.stringify(c1?.mentions));
  const notes = await prisma.appNotification.findMany({ where: { tenantId: tid } }) as Any[];
  chk("K1.8-S2.2", "แจ้งเตือนในแอปถึง thana และ kitti เท่านั้น (recipientUserId ตรงคน · ไม่มีแถว null ทั้งร้าน · ไม่แจ้งผู้เขียน)", notes.length === 2 && notes.every((n) => n.recipientUserId !== null) && notes.some((n) => n.recipientUserId === U.thana) && notes.some((n) => n.recipientUserId === U.kitti) && !notes.some((n) => n.recipientUserId === U.pook), "2 ใบ ตรงคน", JSON.stringify(notes.map((n) => n.recipientUserId)));
  chk("K1.8-S2.3", "ข้อความแจ้งเตือนมีชื่อผู้เขียน + ชื่อการ์ด + ลิงก์ ?card=<id>", notes.every((n) => /QC K1.8/.test(n.body) && /card=/.test(n.body)), "มีลิงก์", notes[0]?.body?.slice(0, 120) ?? "", "MAJOR");
  const kittiRole = await members.boardRoleOf(ctxOf(U.kitti), E.boards.patong.id).catch(() => null);
  chk("K1.8-S2.4", "kitti (ไม่ใช่สมาชิกบอร์ด PRIVATE) ถูก mention → ถูกเพิ่มเป็น VIEWER อัตโนมัติ + แจ้งเตือนบอกว่าได้สิทธิ์ดู", kittiRole === "VIEWER" && notes.some((n) => n.recipientUserId === U.kitti && /ดู|VIEWER|สิทธิ์/.test(n.body)), "VIEWER", String(kittiRole));
  const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: "kanban.comment.added" } });
  const consumers = (await import("@/lib/outbox-consumers")).consumers as Record<string, unknown>;
  chk("K1.8-S2.5", "outbox kanban.comment.added 1 ใบ (idempotency #commentId) + consumer ลงทะเบียน · payload ไม่มี tenantId", ev.length === 1 && String(ev[0]!.idempotencyKey).includes(c1.id) && typeof consumers["kanban.comment.added"] === "function" && !("tenantId" in ((ev[0]!.payload as Record<string, unknown>) ?? {})), "1 + consumer", String(ev.length));
  const self = await cm.addComment(ctxOf(U.pook), card.id, `บันทึกให้ตัวเอง @[ปุ๊ก](${U.pook})`);
  chk("K1.8-S2.6", "mention ตัวเอง → ไม่แจ้งเตือนเพิ่ม", !!self && (await prisma.appNotification.count({ where: { tenantId: tid } })) === 2, "2", String(await prisma.appNotification.count({ where: { tenantId: tid } })), "MAJOR");
  const eEmpty = await fails(() => cm.addComment(ctxOf(U.pook), card.id, "   "));
  chk("K1.8-S2.7", "ความเห็นว่าง → error ไทย", !!eEmpty && /[ก-๙]/.test(String(eEmpty?.message ?? eEmpty)), "error", String(eEmpty?.message ?? eEmpty).slice(0, 60), "MAJOR");
  const eViewer = await fails(() => cm.addComment(ctxOf(U.thana), card.id, "VIEWER คอมเมนต์"));
  chk("K1.8-S2.8", "VIEWER (thana) เพิ่มความเห็นไม่ได้ → Forbidden (ต้อง EDITOR+ หรือคีย์ kanban.card.comment)", !!eViewer && (eViewer?.name === "KanbanForbiddenError" || eViewer?.status === 403), "403", `${eViewer?.name}`);
  const eHidden = await fails(() => cm.addComment(ctxOf(E.users.noPerm.userId), card.id, "x"));
  chk("K1.8-S2.9", "คนไม่มีสิทธิ์โมดูล → ไม่พบ (404-class)", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))), "ไม่พบ", `${eHidden?.name}`);

  // ═══ S3 แก้/ลบ ═══
  await cm.editComment(ctxOf(U.pook), c1.id, "เช็คกับกัปตันแล้ว (แก้ไข)");
  const c1b = await P.kanbanComment.findUnique({ where: { id: c1.id } });
  chk("K1.8-S3.1", "editComment โดยผู้เขียน → body ใหม่ + editedAt · mentions คำนวณใหม่ (ว่าง)", c1b.body === "เช็คกับกัปตันแล้ว (แก้ไข)" && c1b.editedAt instanceof Date && Array.isArray(c1b.mentions) && c1b.mentions.length === 0, "แก้ได้", JSON.stringify({ e: !!c1b.editedAt, m: c1b.mentions }));
  const eEditOther = await fails(() => cm.editComment(ctxOf(U.owner), c1.id, "เจ้าของแก้ของคนอื่น"));
  chk("K1.8-S3.2", "แก้ความเห็นของคนอื่นไม่ได้แม้เป็น OWNER (แก้ได้เฉพาะผู้เขียน)", !!eEditOther && c1b.body === (await P.kanbanComment.findUnique({ where: { id: c1.id } })).body, "ปฏิเสธ", String(eEditOther?.message ?? "").slice(0, 60), "MAJOR");
  await cm.deleteComment(ctxOf(U.owner), self.id);
  const selfRow = await P.kanbanComment.findUnique({ where: { id: self.id } });
  chk("K1.8-S3.3", "ADMIN (owner) ลบความเห็นของ pook ได้ → soft delete (deletedAt) ไม่หายจากตาราง", selfRow?.deletedAt instanceof Date, "deletedAt", String(selfRow?.deletedAt));
  const list = await cm.listComments(ctxOf(U.pook), card.id);
  chk("K1.8-S3.4", "listComments ไม่รวมที่ลบ · มี author{name} · เรียงเก่า→ใหม่", Array.isArray(list) && list.length === 1 && list[0].id === c1.id && typeof list[0].author?.name === "string", "1 รายการ", JSON.stringify(list).slice(0, 120));
  const eDelOther = await fails(() => cm.deleteComment(ctxOf(U.thana), c1.id));
  chk("K1.8-S3.5", "VIEWER ลบความเห็นคนอื่นไม่ได้", !!eDelOther && (await P.kanbanComment.findUnique({ where: { id: c1.id } })).deletedAt === null, "ปฏิเสธ", String(eDelOther?.name ?? ""), "MAJOR");

  // ═══ S4 มอบหมายงาน → push รายคน (ผ่าน notifyAssignment) — ตรวจว่า service เรียก sendPushToUser (static) ═══
  const svcSrc = readFileSync("src/lib/modules/kanban/service.ts", "utf8") + readFileSync("src/lib/modules/kanban/comments.ts", "utf8") + (existsSync("src/lib/modules/kanban/notify.ts") ? readFileSync("src/lib/modules/kanban/notify.ts", "utf8") : "");
  chk("K1.8-S4.1", "การมอบหมาย/mention เรียก sendPushToUser (ตัวช่วยกลาง notify.ts) — ไม่ใช่ sendPushToTenant ทั้งร้าน", /sendPushToUser/.test(svcSrc) && !/sendPushToTenant\(/.test(svcSrc), "sendPushToUser", "ไม่พบ/ใช้ทั้งร้าน", "MAJOR");
  const cb = existsSync("src/components/kanban/CardBack.tsx") ? readFileSync("src/components/kanban/CardBack.tsx", "utf8") : "";
  const cmUi = existsSync("src/components/kanban/Comments.tsx") ? readFileSync("src/components/kanban/Comments.tsx", "utf8") : "";
  chk("K1.8-S4.2", "UI: Comments.tsx (client) มี autocomplete @ (testid mention-menu) · ช่องเขียน testid comment-input · ปุ่ม ส่ง · CardBack ใช้", /"use client"/.test(cmUi) && cmUi.includes('"mention-menu"') && cmUi.includes('"comment-input"') && /Comments/.test(cb), "ครบ", "ขาด", "MAJOR");

  // cleanup
  await P.kanbanComment.deleteMany({ where: { cardId: card.id } });
  await prisma.kanbanCard.deleteMany({ where: { id: card.id } });
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.patong.id } });
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.comment.added" } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.patong.id}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.8 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
