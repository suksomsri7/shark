// QC — บอร์ดงาน WO K2.10: รายงานในแอป `/kanban/reports` — 5 รายงาน (ค้าง/เลยกำหนด/ภาระงาน/throughput/aging) คิวรีสด · ขอบเขต = บอร์ดที่มองเห็น · สิทธิ์ kanban.report.view · ส่งออก CSV
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.10
// requires: kanban-seed
// 🔴 ตัวเลขคาดหวังคำนวณสดจาก DB ในข้อสอบ (ไม่ตรึงตัวเลข — ชุดข้อมูลเปลี่ยนแล้วข้อสอบไม่เน่า) · นิยาม: ค้าง = ACTIVE + completedAt null · เลยกำหนด = ค้าง + dueAt < now
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/reports.ts") || !/export async function overdue/.test(readFileSync("src/lib/modules/kanban/reports.ts", "utf8"))) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (reports.ts ยังไม่มี overdue/workload/throughput/aging)");
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
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
/** วันจันทร์ไทยของสัปดาห์ที่มี d (คำนวณจาก ms ไม่ใช้ getDay กับเวลาไทย) */
const mondayBkk = (d: Date) => { const t = d.getTime() + 7 * 3600_000; const day = Math.floor(t / 86400_000); const dow = (day + 4) % 7; /* 1970-01-01 = พฤหัส(4) */ const mon = day - ((dow + 6) % 7); return new Date(mon * 86400_000).toISOString().slice(0, 10); };
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const rp = (await import("@/lib/modules/kanban/reports" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const owner = await actorOf(E.users.owner.userId);
  const managerR = await actorOf(E.users.manager.userId, { "kanban.board.read": true, "kanban.report.view": true }); // ผู้จัดการป่าตอง + สิทธิ์รายงาน
  const managerNo = await actorOf(E.users.manager.userId, { "kanban.board.read": true }); // ไม่มีสิทธิ์รายงาน
  const thanaR = await actorOf(E.users.staff.thana.userId, { "kanban.board.read": true, "kanban.report.view": true });
  const ctx = (a: Any) => ({ tenantId: tid, systemId: SYS, actorUserId: a.userId });
  const NOW = kq.dayFromToday(0, 10); // พุธ 30 ก.ย. 2569 10:00 ไทย

  // ═══ ค่าจริงจาก DB ═══
  const boards = await prisma.kanbanBoard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, select: { id: true, name: true, visibility: true, unitId: true } });
  const cards = await prisma.kanbanCard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE", boardId: { in: boards.map((b) => b.id) } }, select: { id: true, boardId: true, columnId: true, dueAt: true, completedAt: true, createdAt: true, assignees: { select: { userId: true } } } });
  const open = cards.filter((c) => !c.completedAt);
  const overdue = open.filter((c) => c.dueAt && c.dueAt < NOW);
  const kata = boards.find((b) => b.name === kq.KQC.boards.kataSecret)!;
  const openNoKata = open.filter((c) => c.boardId !== kata.id);
  const byUser = new Map<string, { open: number; overdue: number }>();
  for (const c of open) { const ids = c.assignees.length ? c.assignees.map((a) => a.userId) : ["none"]; for (const u of ids) { const r = byUser.get(u) ?? { open: 0, overdue: 0 }; r.open++; if (c.dueAt && c.dueAt < NOW) r.overdue++; byUser.set(u, r); } }
  const ageDays = (c: { createdAt: Date }) => Math.floor((NOW.getTime() - c.createdAt.getTime()) / 86400_000);
  const bucketOf = (d: number) => (d <= 7 ? "0-7" : d <= 14 ? "8-14" : d <= 30 ? "15-30" : "31+");
  const buckets: Record<string, number> = { "0-7": 0, "8-14": 0, "15-30": 0, "31+": 0 };
  for (const c of open) buckets[bucketOf(ageDays(c))]!++;
  const thisMon = mondayBkk(NOW);
  const createdThisWeek = cards.filter((c) => mondayBkk(c.createdAt) === thisMon).length;
  const completedThisWeek = cards.filter((c) => c.completedAt && mondayBkk(c.completedAt) === thisMon).length;

  // ═══ S1 สิทธิ์ + ขอบเขต ═══
  const eNo = await fails(() => rp.openCards(ctx(managerNo), managerNo, { now: NOW }));
  chk("K2.10-S1.1", "ไม่มี kanban.report.view (MANAGER ไม่มีคีย์) → Forbidden ไทย · OWNER ไม่ต้องมีคีย์", !!eNo && /[ก-๙]/.test(eNo.message) && !(await fails(() => rp.openCards(ctx(owner), owner, { now: NOW }))), "throw ไทย / owner ผ่าน", eNo?.message?.slice(0, 60) ?? "ไม่ throw");
  const oc = await rp.openCards(ctx(owner), owner, { now: NOW });
  chk("K2.10-S1.2", `openCards(ctx, actor, {now, boardId?}) → { total, overdue, byBoard[{boardId, boardName, open, overdue, dueToday, dueWeek}] } · owner เห็นทุกบอร์ด ACTIVE (${boards.length}) · total = ค้างจริง ${open.length} · overdue ${overdue.length}`, oc?.total === open.length && oc.overdue === overdue.length && Array.isArray(oc.byBoard) && oc.byBoard.length === boards.length && boards.every((b) => oc.byBoard.find((x: Any) => x.boardId === b.id)?.open === open.filter((c) => c.boardId === b.id).length), `${open.length}/${overdue.length}/${boards.length} บอร์ด`, JSON.stringify({ t: oc?.total, o: oc?.overdue, b: oc?.byBoard?.map((x: Any) => [x.boardName, x.open]) }));
  const ocM = await rp.openCards(ctx(managerR), managerR, { now: NOW });
  chk("K2.10-S1.3", `ผู้จัดการป่าตอง (มีคีย์) เห็นเฉพาะบอร์ดที่มองเห็น (ป่าตอง + ซ่อมบำรุง TENANT · ไม่เห็นบอร์ดลับกะตะ) → total ${openNoKata.length}`, ocM?.total === openNoKata.length && !ocM.byBoard.some((x: Any) => x.boardId === kata.id), String(openNoKata.length), `${ocM?.total} · kata=${ocM?.byBoard?.some((x: Any) => x.boardId === kata.id)}`);
  const ocB = await rp.openCards(ctx(owner), owner, { now: NOW, boardId: E.boards.patong.id });
  const ocKataM = await fails(() => rp.openCards(ctx(managerR), managerR, { now: NOW, boardId: kata.id }));
  chk("K2.10-S1.4", "boardId กรองบอร์ดเดียว (ป่าตอง) · ระบุบอร์ดที่มองไม่เห็น → ไม่พบ (throw)", ocB?.total === open.filter((c) => c.boardId === E.boards.patong.id).length && ocB.byBoard.length === 1 && !!ocKataM, "กรอง+404", `${ocB?.total} · ${ocB?.byBoard?.length} · ${ocKataM ? "throw" : "ไม่ throw"}`);
  const thanaNoKey = await actorOf(E.users.staff.thana.userId);
  const eStaffNoKey = await fails(() => rp.overdue(ctx(thanaNoKey), thanaNoKey, { now: NOW }));
  chk("K2.10-S1.5", "STAFF ที่ไม่มีคีย์ → Forbidden · STAFF ที่เจ้าของให้คีย์ report.view → ดูได้ (ขอบเขตบอร์ดที่มองเห็น)", !!eStaffNoKey && !(await fails(() => rp.overdue(ctx(thanaR), thanaR, { now: NOW }))), "throw / ผ่าน", `${eStaffNoKey ? "throw" : "ไม่ throw"}`);

  // ═══ S2 เลยกำหนด ═══
  const od = await rp.overdue(ctx(owner), owner, { now: NOW });
  const worst = overdue.slice().sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
  chk("K2.10-S2.1", `overdue → { total, rows[{cardId, cardNo, title, boardId, boardName, columnName, dueAt, daysOverdue, assignees[{userId,name}]}] } · total ${overdue.length} · เรียงเลยนานสุดก่อน · daysOverdue = จำนวนวันไทยที่เลย (≥1)`, od?.total === overdue.length && od.rows.length === overdue.length && (overdue.length === 0 || (od.rows[0].cardId === worst!.id && od.rows.every((r: Any) => Number.isInteger(r.daysOverdue) && r.daysOverdue >= 0 && typeof r.boardName === "string" && typeof r.columnName === "string" && Array.isArray(r.assignees)))), String(overdue.length), JSON.stringify({ t: od?.total, first: od?.rows?.[0]?.title, d: od?.rows?.[0]?.daysOverdue }));
  chk("K2.10-S2.2", "การ์ดที่เสร็จแล้ว (completedAt) แม้ dueAt ผ่านไปแล้ว ไม่นับเลยกำหนด · การ์ด ARCHIVED / บอร์ด ARCHIVED ไม่นับ (โค้ดกรอง status ทั้ง 2 ระดับ)", !od.rows.some((r: Any) => cards.find((c) => c.id === r.cardId)?.completedAt) && /board:\s*\{[^}]*status:\s*"ACTIVE"/.test(read("src/lib/modules/kanban/reports.ts").replace(/\s+/g, " ")), "กรองครบ", "ไม่ครบ");

  // ═══ S3 ภาระงาน ═══
  const wl = await rp.workload(ctx(owner), owner, { now: NOW });
  const pookRow = wl?.rows?.find((r: Any) => r.userId === E.users.staff.pook.userId);
  const noneRow = wl?.rows?.find((r: Any) => r.userId === "none");
  const expPook = byUser.get(E.users.staff.pook.userId) ?? { open: 0, overdue: 0 };
  const expNone = byUser.get("none") ?? { open: 0, overdue: 0 };
  chk("K2.10-S3.1", `workload → { rows[{userId|"none", name, open, overdue, dueWeek, done30d}] } · การ์ดหลายคนนับให้ทุกคน · ปุ๊ก open ${expPook.open}/overdue ${expPook.overdue} · ไม่มีผู้รับผิดชอบ ${expNone.open} · เรียง open มากก่อน`, !!pookRow && pookRow.open === expPook.open && pookRow.overdue === expPook.overdue && (expNone.open === 0 || noneRow?.open === expNone.open) && /[ก-๙]/.test(pookRow.name ?? "") && wl.rows.every((r: Any, i: number) => i === 0 || wl.rows[i - 1].open >= r.open), `${expPook.open}/${expPook.overdue} · none ${expNone.open}`, JSON.stringify({ pook: pookRow, none: noneRow }).slice(0, 200));
  chk("K2.10-S3.2", "ผลรวม open ทุกแถว = การ์ดค้าง (นับซ้ำคนละแถวสำหรับการ์ดหลายคน) และ done30d เป็นจำนวนเต็ม ≥ 0", wl.rows.reduce((n: number, r: Any) => n + r.open, 0) === [...byUser.values()].reduce((n, r) => n + r.open, 0) && wl.rows.every((r: Any) => Number.isInteger(r.done30d) && r.done30d >= 0), "เท่ากัน", String(wl.rows.reduce((n: number, r: Any) => n + r.open, 0)));

  // ═══ S4 throughput ═══
  const tp = await rp.throughput(ctx(owner), owner, { now: NOW, weeks: 12 });
  const last = tp?.[tp.length - 1];
  chk("K2.10-S4.1", `throughput({weeks:12}) → 12 สัปดาห์ [{weekStart (จันทร์ไทย YYYY-MM-DD), created, completed}] สัปดาห์นี้ท้าย (${thisMon}) · created ${createdThisWeek} · completed ${completedThisWeek} · weekStart ต่อเนื่องห่าง 7 วัน`, Array.isArray(tp) && tp.length === 12 && last?.weekStart === thisMon && last.created === createdThisWeek && last.completed === completedThisWeek && tp.every((w: Any, i: number) => i === 0 || (new Date(w.weekStart).getTime() - new Date(tp[i - 1].weekStart).getTime()) === 7 * 86400_000), `${thisMon} ${createdThisWeek}/${completedThisWeek}`, JSON.stringify(tp?.slice(-2) ?? null));
  chk("K2.10-S4.2", "ผลรวม created ทั้ง 12 สัปดาห์ ≤ การ์ด ACTIVE ทั้งหมด (ไม่นับซ้ำ) และ weeks เกิน 52 → ตัดที่ 52", tp.reduce((n: number, w: Any) => n + w.created, 0) <= cards.length && (await rp.throughput(ctx(owner), owner, { now: NOW, weeks: 99 })).length === 52, "≤ และ 52", String((await rp.throughput(ctx(owner), owner, { now: NOW, weeks: 99 })).length), "MAJOR");

  // ═══ S5 aging ═══
  const ag = await rp.aging(ctx(owner), owner, { now: NOW });
  chk("K2.10-S5.1", `aging → { buckets[{key: 0-7|8-14|15-30|31+, label ไทย, count}], byColumn[{boardName, columnName, open, avgDays, maxDays}] } · buckets = ${JSON.stringify(buckets)} · รวม = ค้าง ${open.length}`, ag && ["0-7", "8-14", "15-30", "31+"].every((k) => ag.buckets.find((b: Any) => b.key === k)?.count === buckets[k]) && ag.buckets.every((b: Any) => /[ก-๙]/.test(b.label)) && Array.isArray(ag.byColumn) && ag.byColumn.reduce((n: number, c: Any) => n + c.open, 0) === open.length, JSON.stringify(buckets), JSON.stringify(ag?.buckets ?? null));
  const oldest = open.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  chk("K2.10-S5.2", "byColumn: maxDays ของคอลัมน์ที่มีการ์ดเก่าสุด = อายุการ์ดนั้น (วันไทย) · avgDays ทศนิยม 1 ตำแหน่ง · เรียง avgDays มากก่อน", !!oldest && ag.byColumn.some((c: Any) => c.maxDays === ageDays(oldest)) && ag.byColumn.every((c: Any) => Number.isFinite(c.avgDays) && Math.round(c.avgDays * 10) === c.avgDays * 10) && ag.byColumn.every((c: Any, i: number) => i === 0 || ag.byColumn[i - 1].avgDays >= c.avgDays), String(oldest ? ageDays(oldest) : "-"), JSON.stringify(ag?.byColumn?.slice(0, 2) ?? null), "MAJOR");

  // ═══ S6 ส่งออก CSV ═══
  const csvOd = await rp.exportReportCsv(ctx(owner), owner, "overdue", { now: NOW });
  const csvWl = await rp.exportReportCsv(ctx(owner), owner, "workload", { now: NOW });
  const csvTp = await rp.exportReportCsv(ctx(owner), owner, "throughput", { now: NOW });
  const csvAg = await rp.exportReportCsv(ctx(owner), owner, "aging", { now: NOW });
  const lines = (s: string) => s.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
  chk("K2.10-S6.1", "exportReportCsv(ctx, actor, kind, opts) → string มี BOM · หัวไทย · จำนวนแถวข้อมูล = rows ของรายงานนั้น (overdue/workload/throughput 12/aging byColumn)", [csvOd, csvWl, csvTp, csvAg].every((s) => typeof s === "string" && s.startsWith("﻿") && /[ก-๙]/.test(lines(s)[0] ?? "")) && lines(csvOd).length === 1 + od.total && lines(csvWl).length === 1 + wl.rows.length && lines(csvTp).length === 13 && lines(csvAg).length === 1 + ag.byColumn.length, "BOM+หัวไทย+แถวตรง", `${lines(csvOd).length}/${lines(csvWl).length}/${lines(csvTp).length}/${lines(csvAg).length}`);
  const eKind = await fails(() => rp.exportReportCsv(ctx(owner), owner, "hack", { now: NOW }));
  chk("K2.10-S6.2", "kind ที่ไม่รู้จัก → throw ไทย · ผู้ไม่มีสิทธิ์ export → Forbidden · ค่าที่ขึ้นต้น = / + / - / @ ถูก neutralize (csvCell ของ core)", !!eKind && !!(await fails(() => rp.exportReportCsv(ctx(managerNo), managerNo, "overdue", { now: NOW }))) && /csvRow|csvCell/.test(read("src/lib/modules/kanban/reports.ts")), "ครบ", `${eKind ? "throw" : "ไม่ throw"}`);

  // ═══ S7 ประสิทธิภาพ (static) — รายงานคิวรีสด ต้องใช้ดัชนีที่มี ไม่ดึงทั้งตาราง ═══
  const src = read("src/lib/modules/kanban/reports.ts").replace(/\s+/g, " ");
  chk("K2.10-S7.1", "ทุกคิวรี KanbanCard ใน reports.ts มี where tenantId+systemId+status และ select เฉพาะคอลัมน์ที่ใช้ (ไม่ include ทั้งความสัมพันธ์) · overdue จำกัด 500 แถว · ไม่มี raw SQL ใหม่", (src.match(/kanbanCard\.(findMany|count|groupBy)/g) ?? []).length >= 1 && !/kanbanCard\.findMany\(\s*\{\s*where:\s*\{[^}]*\}\s*\}\s*\)/.test(src) && /take:\s*500/.test(src) && !/\$queryRaw|\$executeRaw/.test(src) && /select:/.test(src), "ครบ", "ขาด", "MAJOR");
  chk("K2.10-S7.2", "ขอบเขตบอร์ดใช้ visibleBoardsWhere(actor) ของ access.ts (ไม่เขียนตรรกะสิทธิ์ซ้ำ) · เวลาไทยคำนวณด้วย +07:00 ไม่ใช้ getDay()/toLocale*", /visibleBoardsWhere/.test(src) && !/getDay\(|toLocale/.test(src), "ครบ", "ขาด");

  // ═══ S8 UI (static) ═══
  const page = read("src/app/app/sys/[id]/kanban/reports/page.tsx");
  const comp = read("src/components/kanban/ReportsPage.tsx");
  chk("K2.10-S8.1", "หน้า /kanban/reports (page.tsx server: ตรวจสิทธิ์ → เรียก 5 รายงาน → props) + ReportsPage.tsx (client) testid reports-page · reports-tab (5 แท็บ: ค้าง/เลยกำหนด/ภาระงาน/ผลงานรายสัปดาห์/อายุงาน) · reports-board-filter (dropdown ทุกบอร์ด/รายบอร์ด → ?board=) · reports-export (ดาวน์โหลด CSV ของแท็บนั้น)", page.length > 0 && ["reports-page", "reports-tab", "reports-board-filter", "reports-export"].every((t) => comp.includes(t)) && /เลยกำหนด/.test(comp) && /ภาระงาน/.test(comp) && /อายุงาน/.test(comp), "ครบ", "ขาด");
  chk("K2.10-S8.2", "กราฟวาดด้วย SVG ล้วน (throughput แท่งคู่ สร้าง/เสร็จ · aging แท่ง 4 ช่วง · ภาระงานแถบต่อคน) ไม่เพิ่ม lib · ตัวเลขใหญ่ใช้โทเคนสี ไม่ hard-code น้ำเงิน · เลยกำหนดสีแดง · แถวเลยกำหนดคลิกเปิดการ์ด (href บอร์ด ?card=)", /<svg/.test(comp) && !/recharts|chart\.js|d3|victory/.test(comp + page) && !/#1d4ed8|bg-blue-600/.test(comp) && /\?card=/.test(comp), "ครบ", "ขาด", "MAJOR");
  chk("K2.10-S8.3", "nav.ts: reports status ready (เมนู 'รายงาน' เปิดใช้ · ไม่มี 'เร็ว ๆ นี้') · ผู้ไม่มีสิทธิ์รายงานไม่เห็นเมนู (nav กรองด้วย kanban.report.view / OWNER)", /key:\s*"reports"[^}]*status:\s*"ready"/.test(read("src/lib/modules/kanban/nav.ts")) && /report\.view/.test(read("src/lib/modules/kanban/nav.ts") + read("src/components/kanban/KanbanTabs.tsx")), "ready + กรองสิทธิ์", "ขาด");
  chk("K2.10-S8.4", "action exportReportCsvAction(kind, boardId?) ใน actions.ts คืน text (ดาวน์โหลดผ่าน Blob ฝั่ง client — ไม่เปิด route สาธารณะ)", /exportReportCsvAction/.test(read("src/lib/modules/kanban/actions.ts")) && !existsSync("src/app/api/kanban/reports"), "มี", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.10") ? readdirSync(".qc-shots/kanban/2.10").filter((f) => f.endsWith(".png")) : [];
  chk("K2.10-S8.5", "ภาพจริง ≥ 4 ใบใน .qc-shots/kanban/2.10 (ค้าง · เลยกำหนด · ภาระงาน · throughput/aging · มือถือ)", shots.length >= 4, "≥4", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.10 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
