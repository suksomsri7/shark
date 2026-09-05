// QC — บอร์ดงาน WO K1.11: ตัวกรอง (URL) + ค้นหาข้ามบอร์ด + ไวยากรณ์ไทย + สิทธิ์การมองเห็น
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.11
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/search.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/search.ts)");
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
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const search = (await import("@/lib/modules/kanban/search" as string)) as Record<string, (...a: Any[]) => Any>;
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const bPatong = E.boards.patong.id as string; const bMaint = E.boards.maint.id as string;
  await prisma.kanbanBoard.update({ where: { id: bPatong }, data: { visibility: "PRIVATE", unitId: E.units.patong } });
  await prisma.kanbanBoard.update({ where: { id: bMaint }, data: { visibility: "TENANT" } });
  // ตั้งคอลัมน์ "เสร็จแล้ว" ของบอร์ดป่าตองเป็น done (K1.4) เพื่อทดสอบ status=done
  const doneCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: bPatong, name: "เสร็จแล้ว" } }))!;
  await moves.setColumnDone(ctxO, doneCol.id, true);
  const NOW = kq.dayFromToday(0, 10); // "วันนี้" ของชุดข้อมูล = 2026-09-30 10:00 BKK

  // ═══ S1 parser ไวยากรณ์ (pure) ═══
  const p1 = search.parseSearchQuery("@ฉัน ป้าย:ด่วน เลยกำหนด บอร์ด:ซ่อม ถังอากาศ");
  chk("K1.11-S1.1", "parseSearchQuery: '@ฉัน ป้าย:ด่วน เลยกำหนด บอร์ด:ซ่อม ถังอากาศ' → {assignee:'me', label:'ด่วน', due:'overdue', board:'ซ่อม', q:'ถังอากาศ'}", p1?.assignee === "me" && p1?.label === "ด่วน" && p1?.due === "overdue" && p1?.board === "ซ่อม" && p1?.q === "ถังอากาศ", "ครบ", JSON.stringify(p1));
  const p2 = search.parseSearchQuery("วันนี้ สัปดาห์นี้ ไม่กำหนด เสร็จ");
  chk("K1.11-S1.2", "คำสงวน วันนี้/สัปดาห์นี้/ไม่กำหนด/เสร็จ → due today|week|none · status done (ตัวสุดท้ายชนะสำหรับ due)", ["today", "week", "none"].includes(p2?.due) && p2?.status === "done", "แปลงได้", JSON.stringify(p2), "MAJOR");
  const p3 = search.parseSearchQuery("   ");
  chk("K1.11-S1.3", "ข้อความว่าง → ตัวกรองว่าง (ไม่ error)", p3 && !p3.q && !p3.assignee && !p3.label, "ว่าง", JSON.stringify(p3), "MAJOR");

  // ═══ S2 filterBoardCards (pure · ใช้ฝั่ง client) ═══
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const board = await svc.getBoardFor(ctxO, owner, bPatong);
  const allCards = board.columns.flatMap((c: Any) => c.cards);
  const fLabel = search.filterBoardCards(allCards, { label: "ด่วน" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.1", "filterBoardCards label 'ด่วน' บนบอร์ดป่าตอง → 3 การ์ด", fLabel.length === 3, "3", String(fLabel.length));
  const fOver = search.filterBoardCards(allCards, { due: "overdue" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.2", "due=overdue (อ้าง now ของชุดข้อมูล) → 1 การ์ด (เคลมประกัน) — การ์ดในคอลัมน์เสร็จไม่นับเลยกำหนด", fOver.length === 1 && /เคลมประกัน/.test(fOver[0].title), "1", `${fOver.length} ${fOver.map((c: Any) => c.title.slice(0, 20)).join(",")}`);
  const fToday = search.filterBoardCards(allCards, { due: "today" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.3", "due=today → 2 การ์ด (ลูกค้าถาม · เติมถัง)", fToday.length === 2, "2", `${fToday.length} ${fToday.map((c: Any) => c.title.slice(0, 14)).join(",")}`);
  const fNone = search.filterBoardCards(allCards, { due: "none" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.4", "due=none → การ์ดไม่มีกำหนดส่ง (6)", fNone.length === 6, "6", String(fNone.length), "MAJOR");
  const fAsg = search.filterBoardCards(allCards, { assignee: E.users.staff.pook.userId }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.5", "assignee=pook → 7 การ์ด (จากตาราง assignee)", fAsg.length === 7, "7", String(fAsg.length));
  const fDone = search.filterBoardCards(allCards, { status: "done" }, { now: NOW, userId: owner.userId });
  const fOpen = search.filterBoardCards(allCards, { status: "open" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.6", "status=done → 7 (คอลัมน์เสร็จ completedAt) · open → 17", fDone.length === 7 && fOpen.length === 17, "7/17", `${fDone.length}/${fOpen.length}`);
  const fCombo = search.filterBoardCards(allCards, { label: "การเงิน", assignee: E.users.staff.thana.userId, status: "open" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.7", "ผสม label การเงิน + assignee thana + open → 2 (เคลมประกัน · รอผู้จัดการอนุมัติ)", fCombo.length === 2, "2", `${fCombo.length} ${fCombo.map((c: Any) => c.title.slice(0, 16)).join(",")}`);
  const fQ = search.filterBoardCards(allCards, { q: "sea fox" }, { now: NOW, userId: owner.userId });
  chk("K1.11-S2.8", "q ค้นชื่อไม่สนตัวพิมพ์ 'sea fox' → 2", fQ.length === 2, "2", String(fQ.length), "MAJOR");

  // ═══ S3 searchCards ข้ามบอร์ด + สิทธิ์ ═══
  const sOwner = await search.searchCards(ctxO, owner, { q: "Sea Fox" });
  chk("K1.11-S3.1", "searchCards owner 'Sea Fox' → 3 (ป่าตอง 2 + ซ่อม 1) · item มี boardName/columnName/cardNo/labels/assignees", sOwner?.items?.length === 3 && sOwner.items.every((i: Any) => typeof i.boardName === "string" && typeof i.columnName === "string" && typeof i.cardNo === "number" && Array.isArray(i.labels) && Array.isArray(i.assignees)), "3", `${sOwner?.items?.length} ${JSON.stringify(sOwner?.items?.[0]).slice(0, 120)}`);
  const sThana = await search.searchCards(ctxT, thana, { q: "Sea Fox" });
  chk("K1.11-S3.2", "thana (เห็นเฉพาะบอร์ดซ่อม TENANT) → 1 · ไม่รั่วบอร์ด PRIVATE", sThana?.items?.length === 1 && sThana.items[0].boardId === bMaint, "1", String(sThana?.items?.length));
  const sMe = await search.searchCards(ctxO, await actorOf(E.users.staff.kitti.userId), search.parseSearchQuery("@ฉัน เลยกำหนด"));
  chk("K1.11-S3.3", "kitti '@ฉัน เลยกำหนด' → การ์ดเลยกำหนดของ kitti ในบอร์ดที่เห็น (ซ่อม: คอมเพรสเซอร์ due 0 ไม่นับ · ป่าตอง PRIVATE ไม่เห็น) = 0", sMe?.items?.length === 0, "0", String(sMe?.items?.length), "MAJOR");
  const sBoard = await search.searchCards(ctxO, owner, search.parseSearchQuery("บอร์ด:ซ่อม ด่วน"));
  chk("K1.11-S3.4", "'บอร์ด:ซ่อม ด่วน' → เฉพาะบอร์ดซ่อม ที่ชื่อ/ป้ายมี 'ด่วน' (1: คอมเพรสเซอร์)", sBoard?.items?.length === 1 && sBoard.items[0].boardId === bMaint, "1", String(sBoard?.items?.length), "MAJOR");
  const sPage = await search.searchCards(ctxO, owner, { take: 5 });
  chk("K1.11-S3.5", "ไม่มีเงื่อนไข + take 5 → 5 รายการ + nextCursor · total = 38", sPage?.items?.length === 5 && typeof sPage.nextCursor === "string" && sPage.total === 38, "5/cursor/38", `${sPage?.items?.length}/${typeof sPage?.nextCursor}/${sPage?.total}`, "MAJOR");
  const sNo = await search.searchCards(ctxO, await actorOf(E.users.noPerm.userId), { q: "Sea" });
  chk("K1.11-S3.6", "คนไม่มีสิทธิ์โมดูล → 0 (ไม่ error)", sNo?.items?.length === 0, "0", String(sNo?.items?.length));

  // ═══ S4 static UI ═══
  const fb = read("src/components/kanban/FilterBar.tsx"); const sp = read("src/components/kanban/SearchPalette.tsx"); const bv = read("src/components/kanban/BoardView.tsx"); const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx");
  chk("K1.11-S4.1", "FilterBar.tsx (client) testid filter-bar · filter-count ('แสดง n จาก m การ์ด') · filter-clear · อ่าน/เขียน URL params assignee,label,due,status,q", /"use client"/.test(fb) && ["filter-bar", "filter-count", "filter-clear"].every((t) => fb.includes(`"${t}"`)) && /แสดง .* จาก/.test(fb) && /useSearchParams|searchParams/.test(fb + bv) && ["assignee", "label", "due", "status"].every((k) => (fb + bv + page).includes(`"${k}"`)), "ครบ", "ขาด");
  chk("K1.11-S4.2", "SearchPalette.tsx (client) testid search-palette · search-input · เปิดด้วย Ctrl/⌘ K · แสดงคำใบ้ไวยากรณ์ (@ฉัน ป้าย: เลยกำหนด บอร์ด:)", /"use client"/.test(sp) && sp.includes('"search-palette"') && sp.includes('"search-input"') && /metaKey|ctrlKey/.test(sp) && /@ฉัน/.test(sp) && /ป้าย:/.test(sp), "ครบ", "ขาด");
  chk("K1.11-S4.3", "หน้าบอร์ดส่ง filters จาก URL ให้ BoardView (server → client) และ empty state 'ไม่มีการ์ดตรงกับตัวกรอง' + ปุ่มล้าง", /ไม่มีการ์ดตรงกับตัวกรอง/.test(bv + fb) && /filters|filter/.test(page), "ครบ", "ขาด", "MAJOR");
  chk("K1.11-S4.4", "ค้นหาผ่าน server action searchCardsAction (ไม่ใช่ route API เปิดสาธารณะ) · export เฉพาะ *Action", /export async function searchCardsAction/.test(read("src/lib/modules/kanban/actions.ts")) && (read("src/lib/modules/kanban/actions.ts").match(/export (async )?function (\w+)/g) ?? []).every((m) => /Action\b/.test(m)), "searchCardsAction", "ไม่พบ", "MAJOR");

  await moves.setColumnDone(ctxO, doneCol.id, false);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.11 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
