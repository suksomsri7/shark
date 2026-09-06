// QC — บอร์ดงาน WO K2.4: มุมมองสรุป (?view=summary) — boardSummary 4 ไทล์ + throughput รายสัปดาห์ · เจาะลงเป็นรายการ (ลิงก์ไป ?view=table&filters)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.4
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/summary.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/summary.ts)");
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
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const sm = (await import("@/lib/modules/kanban/summary" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const tbl = (await import("@/lib/modules/kanban/table" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const board = E.boards.patong.id as string; const NOW = kq.dayFromToday(0, 10);
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const active = await prisma.kanbanCard.findMany({ where: { boardId: board, status: "ACTIVE" }, select: { id: true, columnId: true, dueAt: true, completedAt: true } });

  // ═══ S1 boardSummary ═══
  const s0 = await sm.boardSummary(ctxO, owner, board, { now: NOW });
  chk("K2.4-S1.1", "boardSummary(ctx, actor, boardId, {now}) → { totals{open,overdue,dueToday,dueWeek,done}, byColumn[{key,label,count,href}], byAssignee[{key,label,count,href}], byDue[{key,label,count,href}], byLabel[{key,label,color,count,href}], throughput[{weekStart,created,completed}] }", s0 && s0.totals && Array.isArray(s0.byColumn) && Array.isArray(s0.byAssignee) && Array.isArray(s0.byDue) && Array.isArray(s0.byLabel) && Array.isArray(s0.throughput), "โครงครบ", JSON.stringify(Object.keys(s0 ?? {})));
  chk("K2.4-S1.2", "byColumn ตรงกับ DB ทุกคอลัมน์ (5/6/3/3/7) และรวม = open 24", cols.every((c) => s0.byColumn.find((b: Any) => b.key === c.id)?.count === active.filter((a) => a.columnId === c.id).length) && s0.totals.open === 24, "5/6/3/3/7", JSON.stringify(s0.byColumn?.map((b: Any) => [b.label, b.count])));
  const overdue = active.filter((a) => a.dueAt && a.dueAt < NOW && !a.completedAt).length;
  chk("K2.4-S1.3", "totals.overdue = การ์ด active ที่ dueAt < now และยังไม่เสร็จ · byDue มีกลุ่ม overdue/today/week/later/none และผลรวม = open", s0.totals.overdue === overdue && ["overdue", "today", "week", "later", "none"].every((k) => s0.byDue.some((d: Any) => d.key === k)) && s0.byDue.reduce((n: number, d: Any) => n + d.count, 0) === 24, `${overdue}`, `${s0.totals.overdue} · ${JSON.stringify(s0.byDue?.map((d: Any) => [d.key, d.count]))}`);
  chk("K2.4-S1.4", "byAssignee มี 'ไม่มีผู้รับผิดชอบ' (key none) · byLabel นับการ์ดต่อป้าย (ด่วน = 3) + 'ไม่มีป้าย'", s0.byAssignee.some((a: Any) => a.key === "none") && s0.byLabel.find((l: Any) => l.label === "ด่วน")?.count === 3 && s0.byLabel.some((l: Any) => l.key === "none"), "none + ด่วน 3", JSON.stringify(s0.byLabel?.map((l: Any) => [l.label, l.count])));
  // 🔴 หัวใจของ K2.4: กดไทล์แล้วเจาะลงได้ตัวเลขเท่ากัน — href ต้องเป็น ?view=table&… และ listBoardTable ด้วย filters เดียวกันคืน total เท่ากับ count
  const parseHref = (h: string) => Object.fromEntries(new URL(h, "http://x").searchParams.entries());
  const tiles = [...s0.byColumn, ...s0.byLabel.filter((l: Any) => l.key !== "none"), ...s0.byDue.filter((d: Any) => d.key !== "later")];
  let mismatch: string[] = [];
  for (const t of tiles) {
    const q = parseHref(t.href);
    if (q.view !== "table") { mismatch.push(`${t.label}:no-table`); continue; }
    const filters: Any = {}; if (q.label) filters.label = q.label; if (q.due) filters.due = q.due; if (q.assignee) filters.assignee = q.assignee; if (q.status) filters.status = q.status; if (q.column) filters.column = q.column;
    const res = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, filters, pageSize: 200 });
    if (res.total !== t.count) mismatch.push(`${t.label}:${t.count}≠${res.total}`);
  }
  chk("K2.4-S1.5", "🔴 ทุกไทล์ (คอลัมน์/ป้าย/กำหนดส่ง) href=?view=table&… และเจาะลงด้วย listBoardTable ได้ total = count เป๊ะ", mismatch.length === 0, "ตรงทุกไทล์", mismatch.join(" | ") || "ตรง");
  chk("K2.4-S1.6", "throughput 8 สัปดาห์ล่าสุด (weekStart = วันจันทร์ไทย) created/completed เป็นจำนวนเต็ม · สัปดาห์นี้อยู่ท้าย", s0.throughput.length === 8 && s0.throughput.every((w: Any) => Number.isInteger(w.created) && Number.isInteger(w.completed) && /^\d{4}-\d{2}-\d{2}$/.test(w.weekStart)) && s0.throughput[7].weekStart <= new Date(NOW.getTime() + 7 * 3600_000).toISOString().slice(0, 10), "8 สัปดาห์", JSON.stringify(s0.throughput?.map((w: Any) => [w.weekStart, w.created, w.completed])).slice(0, 200), "MAJOR");
  const eT = await fails(() => sm.boardSummary(ctxT, thana, board, { now: NOW }));
  chk("K2.4-S1.7", "thana มองไม่เห็นบอร์ด → ไม่พบ", !!eT, "throw", "ไม่ throw");

  // ═══ S2 filters.column (ใหม่ — เพื่อเจาะลงตามคอลัมน์) ═══
  const flt = read("src/lib/modules/kanban/filters.ts");
  chk("K2.4-S2.1", "BoardFilters เพิ่ม column?: columnId (filterBoardCards กรอง columnId) และ FilterBar/URL รองรับ &column=", /column\??:/.test(flt) && /columnId/.test(flt) && /column/.test(read("src/components/kanban/FilterBar.tsx")), "มี column filter", "ไม่มี");

  // ═══ S3 UI (static) ═══
  const sv = read("src/components/kanban/SummaryView.tsx");
  chk("K2.4-S3.1", "SummaryView.tsx (client) testid summary-view · summary-tile · summary-chart · 4 ไทล์ (คอลัมน์/คน/กำหนดส่ง/ป้าย) เป็น <Link href> ไป ?view=table&… · กราฟ throughput วาดด้วย SVG (ไม่มี lib ใหม่)", ["summary-view", "summary-tile", "summary-chart"].every((t) => sv.includes(t)) && /Link|href=/.test(sv) && /<svg/.test(sv) && !/recharts|chart\.js|d3/.test(sv), "ครบ", "ขาด");
  chk("K2.4-S3.2", "ตัวเลขใหญ่ 5 ค่า (ค้าง/เลยกำหนด/วันนี้/สัปดาห์นี้/เสร็จ) ใช้คำไทยตามแบบ · เลยกำหนดสีแดง · ไม่ hard-code น้ำเงิน", /เลยกำหนด/.test(sv) && /ค้าง/.test(sv) && /สัปดาห์นี้/.test(sv) && !/#1d4ed8|bg-blue-600/.test(sv), "ครบ", "ขาด", "MAJOR");
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx") + read("src/components/kanban/BoardView.tsx");
  chk("K2.4-S3.3", "?view=summary → server เรียก boardSummary ส่ง props · แท็บ 'สรุป' เปิดใช้", /summary/.test(page) && /SummaryView/.test(page), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.4") ? readdirSync(".qc-shots/kanban/2.4").filter((f) => f.endsWith(".png")) : [];
  chk("K2.4-S3.4", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/2.4 (สรุป desktop · หลังกดไทล์ → ตารางกรอง · มือถือ)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.4 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
