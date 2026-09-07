// QC — บอร์ดงาน WO K3.8: มุมมองข้ามบอร์ดระดับองค์กร `/kanban/overview` — เห็นเฉพาะบอร์ดที่มีสิทธิ์ · ตัวกรอง/จัดกลุ่ม · มุมมองที่บันทึกไว้แบบข้ามบอร์ด (boardId null) ส่วนตัว/ทั้งทีม
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.8 · เกณฑ์ §13 K3.8 · ต้องมี K2.1 (table) + K2.5 (views) ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/overview.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/overview.ts)");
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
let tid = ""; let SYS = ""; const madeViews: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const ov = (await import("@/lib/modules/kanban/overview" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const views = (await import("@/lib/modules/kanban/views" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const manager = await actorOf(U.manager); const thana = await actorOf(U.thana);
  const ctxOf = (userId: string) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const NOW = kq.dayFromToday(0, 10);
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.patong.id } });
  const boards = await prisma.kanbanBoard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, select: { id: true, name: true, visibility: true } });
  const activeAll = await prisma.kanbanCard.count({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE", boardId: { in: boards.map((b) => b.id) }, completedAt: null } });
  const maintActive = await prisma.kanbanCard.count({ where: { boardId: E.boards.maint.id, status: "ACTIVE", completedAt: null } });
  const kataActive = await prisma.kanbanCard.count({ where: { boardId: E.boards.kata.id, status: "ACTIVE", completedAt: null } });

  // ═══ S1 listCrossBoard ═══
  const o1 = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, pageSize: 200 });
  chk("K3.8-S1.1", `listCrossBoard(ctx, actor, {now, filters?, group?, sort?, page?, pageSize?}) → { rows: (TableRowDto + boardId, boardName, boardColor), total, page, pageSize, boards:[{id,name,count}], groups? } · owner เห็นทุกบอร์ด ACTIVE (${boards.length}) · การ์ดค้าง (ไม่นับเสร็จ · ไม่นับบอร์ด/การ์ด ARCHIVED) = ${activeAll}`, o1?.total === activeAll && o1.rows.every((r: Any) => typeof r.boardName === "string" && r.boardId) && o1.boards?.length === boards.length, String(activeAll), JSON.stringify({ total: o1?.total, boards: o1?.boards?.length }));
  const oT = await ov.listCrossBoard(ctxOf(U.thana), thana, { now: NOW, pageSize: 200 });
  const oM = await ov.listCrossBoard(ctxOf(U.manager), manager, { now: NOW, pageSize: 200 });
  chk("K3.8-S1.2", `🔴 เห็นเฉพาะบอร์ดที่มีสิทธิ์ (visibleBoardsWhere): thana = เฉพาะซ่อมบำรุง (TENANT) → ${maintActive} · ผู้จัดการป่าตอง = ป่าตอง + ซ่อม (ไม่เห็นบอร์ดลับกะตะ) → ${activeAll - kataActive} · boards[] ก็กรองด้วย`, oT?.total === maintActive && oT.boards.length === 1 && oM?.total === activeAll - kataActive && !oM.boards.some((b: Any) => b.id === E.boards.kata.id), `${maintActive} / ${activeAll - kataActive}`, `${oT?.total} / ${oM?.total}`);
  const oF = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, filters: { label: "ด่วน" }, pageSize: 200 });
  const urgent = await prisma.kanbanCard.count({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE", completedAt: null, boardId: { in: boards.map((b) => b.id) }, cardLabels: { some: { label: { name: "ด่วน" } } } } });
  const oB = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, filters: { board: [E.boards.maint.id] }, pageSize: 200 });
  chk("K3.8-S1.3", `filters ใช้ชุดเดียวกับตาราง (BoardFilters) + board[] (เลือกหลายบอร์ด): label ด่วน ข้ามบอร์ด = ${urgent} · board=[ซ่อม] = ${maintActive} · ป้ายเทียบด้วย "ชื่อ" (ป้ายคนละบอร์ดชื่อเดียวกันรวมกัน)`, oF?.total === urgent && oB?.total === maintActive, `${urgent} / ${maintActive}`, `${oF?.total} / ${oB?.total}`);
  const oG = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, group: "board", pageSize: 200 });
  const oGa = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, group: "assignee", pageSize: 200 });
  chk("K3.8-S1.4", "group=board → groups[{key: boardId, label: ชื่อบอร์ด, rowIds[]}] ครบทุกบอร์ดที่มีการ์ด · group=assignee → รวมข้ามบอร์ด + none · group=due → overdue/today/week/later/none", Array.isArray(oG?.groups) && oG.groups.every((g: Any) => boards.some((b) => b.id === g.key)) && oG.groups.reduce((n: number, g: Any) => n + g.rowIds.length, 0) === activeAll && oGa?.groups?.some((g: Any) => g.key === "none") && (await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, group: "due", pageSize: 200 }))?.groups?.some((g: Any) => g.key === "overdue"), "ครบ", JSON.stringify(oG?.groups?.map((g: Any) => [g.label, g.rowIds.length])));
  const p1 = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, page: 1, pageSize: 10, sort: "due" });
  const p2 = await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, page: 2, pageSize: 10, sort: "due" });
  chk("K3.8-S1.5", "แบ่งหน้า pageSize 10 → หน้า 1/2 ไม่ซ้ำกัน · sort=due ไม่กำหนดอยู่ท้าย · pageSize > 200 → ตัดที่ 200", p1?.rows?.length === 10 && p2?.rows?.length > 0 && !p1.rows.some((r: Any) => p2.rows.some((s: Any) => s.id === r.id)) && (await ov.listCrossBoard(ctxOf(U.owner), owner, { now: NOW, pageSize: 999 }))?.pageSize === 200, "แบ่งหน้าถูก", `${p1?.rows?.length}/${p2?.rows?.length}`);

  // ═══ S2 มุมมองที่บันทึกไว้แบบข้ามบอร์ด (boardId null) ═══
  const vT = await views.saveView(ctxOf(U.thana), thana, { boardId: null, name: "ของฉันข้ามบอร์ด", scope: "PRIVATE", config: { view: "table", filters: { assignee: U.thana }, sort: "due" } });
  madeViews.push(vT?.id);
  const eTeam = await fails(() => views.saveView(ctxOf(U.thana), thana, { boardId: null, name: "ทั้งทีม", scope: "BOARD", config: { view: "table", filters: { label: "ด่วน" } } }));
  const vO = await views.saveView(ctxOf(U.owner), owner, { boardId: null, name: "ด่วนทั้งองค์กร", scope: "BOARD", config: { view: "table", filters: { label: "ด่วน" }, group: "board" } });
  madeViews.push(vO?.id);
  chk("K3.8-S2.1", "🔴 saveView(boardId null): PRIVATE = ใครก็ได้ที่เห็นบอร์ดงาน (thana ok) · scope BOARD (ทั้งทีม) ข้ามบอร์ด = OWNER เท่านั้น (thana → Forbidden · owner ok) · แถว KanbanBoardView.boardId = null", vT?.id && !!eTeam && vO?.id && ((await P.kanbanBoardView.findUnique({ where: { id: vO.id } }))).boardId === null, "ครบ", `${!!vT?.id}/${!!eTeam}/${!!vO?.id}`);
  const lT = await views.listViews(ctxOf(U.thana), thana, null);
  const lO = await views.listViews(ctxOf(U.owner), owner, null);
  chk("K3.8-S2.2", "listViews(ctx, actor, null) → ทั้งทีม (ข้ามบอร์ด) ก่อน แล้วส่วนตัวของตัวเอง: thana เห็น [ด่วนทั้งองค์กร, ของฉันข้ามบอร์ด] · owner เห็น [ด่วนทั้งองค์กร] (ไม่เห็นส่วนตัวของ thana) · มุมมองของบอร์ดใดบอร์ดหนึ่งไม่ปน", lT?.some((v: Any) => v.id === vO.id) && lT.some((v: Any) => v.id === vT.id) && lO?.some((v: Any) => v.id === vO.id) && !lO.some((v: Any) => v.id === vT.id) && lT.every((v: Any) => v.boardId === null), "ตรง", JSON.stringify({ t: lT?.map((v: Any) => v.name), o: lO?.map((v: Any) => v.name) }));
  const ap = await views.applyView(ctxOf(U.owner), owner, vO.id);
  chk("K3.8-S2.3", "applyView(ข้ามบอร์ด) → href ขึ้นต้น /kanban/overview? พร้อม label=ด่วน&group=board&savedView=", typeof ap?.href === "string" && /\/kanban\/overview\?/.test(ap.href) && /label=/.test(ap.href) && /group=board/.test(ap.href) && ap.href.includes(`savedView=${vO.id}`), "href overview", String(ap?.href));

  // ═══ S3 UI + nav (static) ═══
  const ui = read("src/components/kanban/OverviewPage.tsx"); const page = read("src/app/app/sys/[id]/kanban/overview/page.tsx");
  chk("K3.8-S3.1", "หน้า /kanban/overview (page.tsx server → listCrossBoard + listViews(null)) + OverviewPage.tsx (client) testid overview-page · ตัวเลข 4 ค่า (ค้าง/เลยกำหนด/วันนี้/สัปดาห์นี้ ข้ามบอร์ด) · แถบเครื่องมือ: เลือกบอร์ด (multi) testid overview-boards · FilterBar เดิม · จัดกลุ่ม (บอร์ด/คน/กำหนดส่ง) testid overview-group · มุมมองที่บันทึกไว้ testid overview-saved-views (แยก 'ทั้งทีม/ส่วนตัว' · บันทึกได้ · scope ทั้งทีมเฉพาะ OWNER) · ตาราง reuse TableView (คอลัมน์ 'บอร์ด' เพิ่ม · คลิกแถว → หลังการ์ดข้ามบอร์ด ?card=) · มือถือ: รายการ 2 บรรทัด + ชื่อบอร์ดกำกับ", page.length > 0 && ["overview-page", "overview-boards", "overview-group", "overview-saved-views"].every((t) => ui.includes(t)) && /TableView|table-view/.test(ui) && /ทั้งทีม/.test(ui), "ครบ", "ขาด");
  chk("K3.8-S3.2", "nav.ts เพิ่ม 'ภาพรวม' (key overview · path /kanban/overview · ready) ถัดจากบอร์ด · qc-nav-functions ยังเขียว (builder รัน) · แถบล่างมือถือ (K1.13) ไม่เปลี่ยน 5 เมนู", /key:\s*"overview"[^}]*status:\s*"ready"/.test(read("src/lib/modules/kanban/nav.ts")), "มี", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.8") ? readdirSync(".qc-shots/kanban/3.8").filter((f) => f.endsWith(".png")) : [];
  chk("K3.8-S3.3", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/3.8 (ภาพรวม owner จัดกลุ่มตามบอร์ด · ของ thana เห็นบอร์ดเดียว · มือถือ)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { if (madeViews.filter(Boolean).length) await P.kanbanBoardView.deleteMany({ where: { id: { in: madeViews.filter(Boolean) } } }); } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.8 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
