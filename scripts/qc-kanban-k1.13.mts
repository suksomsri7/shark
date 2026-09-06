// QC — บอร์ดงาน WO K1.13: มือถือ (เลื่อนทีละคอลัมน์ · กดค้างลาก · ปัดขวา=เสร็จ/ซ้าย=เก็บ + undo) + งานของฉันใหม่ (myTasksOverview) — ส่วนภาพ: visual-kanban.mts 1.13
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.13
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/my-tasks.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/my-tasks.ts)");
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
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const mt = (await import("@/lib/modules/kanban/my-tasks" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const kitti = await actorOf(E.users.staff.kitti.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxK = { tenantId: tid, systemId: SYS, actorUserId: kitti.userId };
  const NOW = kq.dayFromToday(0, 10);
  // thana/kitti ให้เห็นบอร์ดป่าตอง (สมาชิก) เพื่อให้ตัวเลขนิ่ง
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.patong.id, userId: { in: [kitti.userId, thana.userId] } } });
  await members.addMember(ctxO, E.boards.patong.id, kitti.userId, "EDITOR");
  await prisma.kanbanBoard.update({ where: { id: E.boards.patong.id }, data: { visibility: "PRIVATE" } });
  const doneCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, name: "เสร็จแล้ว" } }))!;
  await moves.setColumnDone(ctxO, doneCol.id, true);

  // ═══ S1 myTasksOverview ═══
  const ov = await mt.myTasksOverview(ctxK, kitti, { now: NOW });
  // kitti (seed): ป่าตอง เติมถัง(due 0) · ซ่อมเรกกูเลเตอร์(1) · ล้างชุด(-26 done) · เปลี่ยนโอริง(-15 done) · ซ่อม: BCD(2) · คอมเพรสเซอร์(0) · Apeks(1) · โอริง(6) · แบต(-3 done) · ล้างถัง(-12 done)
  chk("K1.13-S1.1", "myTasksOverview(ctx, actor, {now}) → {counts{overdue,today,week,none,doneThisWeek}, groups{overdue[],today[],week[],later[],none[]}, checklistItems[], watching[]}", ov && ov.counts && ov.groups && Array.isArray(ov.groups.today) && Array.isArray(ov.checklistItems) && Array.isArray(ov.watching), "โครงครบ", JSON.stringify(Object.keys(ov ?? {})));
  chk("K1.13-S1.2", "kitti: today = 2 (เติมถัง · คอมเพรสเซอร์) · week = 4 (ซ่อมเรกฯ 1 · BCD 2 · Apeks 1 · โอริง 6) · overdue = 0 · งานเสร็จ (คอลัมน์ done) ไม่โผล่ในกลุ่ม", ov.counts.today === 2 && ov.counts.week === 4 && ov.counts.overdue === 0 && ![...ov.groups.today, ...ov.groups.week, ...ov.groups.later, ...ov.groups.none].some((c: Any) => c.completedAt), "2/4/0", JSON.stringify(ov.counts));
  chk("K1.13-S1.3", "รายการงานมี {id,cardNo,title,boardId,boardName,columnName,dueAt,labels[],checklistProgress?} เรียงตามกำหนดส่ง", ov.groups.today.every((c: Any) => typeof c.boardName === "string" && typeof c.columnName === "string" && typeof c.cardNo === "number" && Array.isArray(c.labels)), "ฟิลด์ครบ", JSON.stringify(ov.groups.today[0]).slice(0, 140), "MAJOR");
  // งานที่ตัวเองไม่ได้รับผิดชอบแต่บอร์ดมองไม่เห็น ต้องไม่โผล่: ถอด kitti ออกจากป่าตอง → today เหลือ 1
  await members.removeMember(ctxO, E.boards.patong.id, kitti.userId);
  const ov2 = await mt.myTasksOverview(ctxK, kitti, { now: NOW });
  chk("K1.13-S1.4", "ถูกถอดจากบอร์ด PRIVATE → งานในบอร์ดนั้นหายจากงานของฉัน (today 1 · week 3)", ov2.counts.today === 1 && ov2.counts.week === 3, "1/3", JSON.stringify(ov2.counts));
  await members.addMember(ctxO, E.boards.patong.id, kitti.userId, "EDITOR");

  // ═══ S2 ปัด: เสร็จ / เก็บ + undo ═══
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const c = await (await import("@/lib/modules/kanban/service" as string)).createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.13 ปัด" });
  const done = await mt.completeCard(ctxO, c.id);
  const cRow = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.13-S2.1", "completeCard (ปัดขวา) → ย้ายเข้าคอลัมน์ done + completedAt · คืน {ok, fromColumnId, undoToken}", done?.ok === true && cRow.columnId === doneCol.id && cRow.completedAt instanceof Date && typeof done.undoToken === "string" && done.fromColumnId === col.id, "done", JSON.stringify({ col: cRow.columnId === doneCol.id, undo: typeof done?.undoToken }));
  const undone = await mt.undo(ctxO, done.undoToken);
  const cRow2 = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.13-S2.2", "undo(token) ภายใน 5 วิ → กลับคอลัมน์เดิม · completedAt null", undone?.ok === true && cRow2.columnId === col.id && cRow2.completedAt === null, "กลับ", JSON.stringify({ col: cRow2.columnId === col.id }));
  const arch = await mt.archiveWithUndo(ctxO, c.id);
  const cRow3 = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.13-S2.3", "archiveWithUndo (ปัดซ้าย) → ARCHIVED + undoToken", arch?.ok === true && cRow3.status === "ARCHIVED" && typeof arch.undoToken === "string", "ARCHIVED", cRow3.status);
  const undone2 = await mt.undo(ctxO, arch.undoToken);
  chk("K1.13-S2.4", "undo เก็บ → ACTIVE คอลัมน์เดิม", undone2?.ok === true && ((await prisma.kanbanCard.findUnique({ where: { id: c.id } })) as Any).status === "ACTIVE", "ACTIVE", "ไม่กลับ");
  const late = await mt.undo(ctxO, arch.undoToken);
  chk("K1.13-S2.5", "undo ซ้ำด้วย token เดิม → ok:false (ใช้ได้ครั้งเดียว) · token ปลอม → ok:false", late?.ok === false && (await mt.undo(ctxO, "fake-token"))?.ok === false, "ok:false", JSON.stringify(late), "MAJOR");
  const noDone = E.boards.kata.id as string;
  const kcol = (await prisma.kanbanColumn.findFirst({ where: { boardId: noDone, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const kc = await (await import("@/lib/modules/kanban/service" as string)).createCard({ tenantId: tid, systemId: SYS, columnId: kcol.id, title: "QC ไม่มี done" });
  const noDoneRes = await mt.completeCard(ctxO, kc.id);
  chk("K1.13-S2.6", "บอร์ดไม่มีคอลัมน์ done → completeCard คืน ok:false code NO_DONE_COLUMN message ไทย (ไม่ย้าย)", noDoneRes?.ok === false && noDoneRes?.code === "NO_DONE_COLUMN" && /[ก-๙]/.test(noDoneRes?.message ?? ""), "NO_DONE_COLUMN", JSON.stringify(noDoneRes), "MAJOR");
  const eHidden = await mt.completeCard({ tenantId: tid, systemId: SYS, actorUserId: thana.userId }, c.id).catch((e: Any) => e);
  chk("K1.13-S2.7", "thana (มองไม่เห็นบอร์ด) completeCard → ไม่พบ", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))), "ไม่พบ", `${eHidden?.name}`);

  // ═══ S3 static UI ═══
  const bv = read("src/components/kanban/BoardView.tsx") + read("src/components/kanban/MobileBoard.tsx");
  const card = read("src/components/kanban/Card.tsx");
  const my = read("src/components/kanban/MyTasks.tsx") + read("src/app/app/sys/[id]/kanban/my-tasks/page.tsx");
  chk("K1.13-S3.1", "มือถือ: คอลัมน์เลื่อน snap (scroll-snap) + จุดบอกตำแหน่ง testid column-dots · testid mobile-board", /scroll-snap|snap-x|snap-mandatory/.test(bv) && bv.includes('"column-dots"') && bv.includes('"mobile-board"'), "snap + dots", "ไม่พบ");
  chk("K1.13-S3.2", "กดค้าง 300ms ยกการ์ด (long-press timer) + ปัดขวา/ซ้าย (touch/pointer dx) + toast undo 5 วิ ('เลิกทำ') + ปุ่ม FAB testid fab-add", /300/.test(bv + card) && /dx|deltaX|swipe/i.test(bv + card) && /เลิกทำ/.test(bv + card) && (bv + card).includes('"fab-add"'), "ครบ", "ขาด");
  chk("K1.13-S3.3", "หลังการ์ดบนมือถือ = แผ่นเต็มจอ (fixed inset-0 / h-dvh) ช่องความเห็นติดขอบล่าง (sticky bottom)", /inset-0|h-dvh|h-screen/.test(read("src/components/kanban/CardBack.tsx")) && /sticky|bottom-0/.test(read("src/components/kanban/CardBack.tsx") + read("src/components/kanban/Comments.tsx")), "เต็มจอ", "ไม่พบ", "MAJOR");
  chk("K1.13-S3.4", "งานของฉันใหม่: testid my-tasks · 4 ตัวเลข (เลยกำหนด/ถึงกำหนดวันนี้/สัปดาห์นี้/ปิดไปสัปดาห์นี้) · กลุ่ม · ติ๊กเสร็จ (checkbox → completeCard) · empty 'วันนี้ไม่มีงานค้าง'", my.includes('"my-tasks"') && /เลยกำหนด/.test(my) && /สัปดาห์นี้/.test(my) && /วันนี้ไม่มีงานค้าง/.test(my) && /completeCardAction|checkbox/.test(my), "ครบ", "ขาด");
  chk("K1.13-S3.5", "actions: completeCardAction · archiveWithUndoAction · undoAction (export เฉพาะ *Action)", ["completeCardAction", "archiveWithUndoAction", "undoAction"].every((a) => read("src/lib/modules/kanban/actions.ts").includes(`function ${a}`)), "ครบ", "ขาด", "MAJOR");

  // cleanup
  await moves.setColumnDone(ctxO, doneCol.id, false);
  await members.removeMember(ctxO, E.boards.patong.id, kitti.userId).catch(() => {});
  await prisma.kanbanCard.deleteMany({ where: { id: { in: [c.id, kc.id] } } });
  for (const b of [E.boards.patong.id, noDone]) await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${b}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.13 — ส่วนภาพ: pnpm exec tsx scripts/visual-kanban.mts 1.13 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
