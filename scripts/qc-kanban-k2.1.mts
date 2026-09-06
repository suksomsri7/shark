// QC — บอร์ดงาน WO K2.1: มุมมองตาราง (?view=table) — listBoardTable · bulkUpdate · exportCardsCsv · TableView UI (ภาพ 04)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.1
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/table.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/table.ts)");
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
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let created: string[] = []; let snapshot: { id: string; columnId: string; position: string; status: string }[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const tbl = (await import("@/lib/modules/kanban/table" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const reports = (await import("@/lib/modules/kanban/reports" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId); const pook = await actorOf(E.users.staff.pook.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const board = E.boards.patong.id as string; const NOW = kq.dayFromToday(0, 10);
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  snapshot = (await prisma.kanbanCard.findMany({ where: { boardId: board }, select: { id: true, columnId: true, position: true, status: true } })).map((c) => ({ id: c.id, columnId: c.columnId, position: c.position ?? "", status: c.status }));

  // ═══ S1 listBoardTable ═══
  const t0 = await tbl.listBoardTable(ctxO, owner, board, { now: NOW });
  chk("K2.1-S1.1", "listBoardTable(ctx, actor, boardId, {now}) → {rows[], total, page, pageSize} · total 24 · rows ≤ pageSize · แถวมี {id,cardNo,title,columnId,columnName,assignees[],dueAt,completedAt,checklistDone,checklistTotal,labels[],links[],updatedAt}", t0.total === 24 && Array.isArray(t0.rows) && t0.rows.length <= (t0.pageSize ?? 50) && t0.rows.every((r: Any) => typeof r.cardNo === "number" && typeof r.columnName === "string" && Array.isArray(r.assignees) && Array.isArray(r.labels) && Array.isArray(r.links) && "checklistTotal" in r && "updatedAt" in r), "24 + ฟิลด์ครบ", `${t0.total} ${JSON.stringify(t0.rows?.[0] ?? {}).slice(0, 160)}`);
  const tg = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, group: "column" });
  const colCounts = Object.fromEntries(await Promise.all(cols.map(async (c) => [c.id, await prisma.kanbanCard.count({ where: { columnId: c.id, status: "ACTIVE" } })])));
  chk("K2.1-S1.2", "group=column → groups[] เรียงตามคอลัมน์ · แต่ละกลุ่ม rowIds ตรงจำนวนการ์ด active ของคอลัมน์ (5/6/3/3/7)", Array.isArray(tg.groups) && tg.groups.length === cols.length && tg.groups.every((g: Any, i: number) => g.key === cols[i]!.id && g.label === cols[i]!.name && g.rowIds.length === colCounts[cols[i]!.id]), "5 กลุ่มตรง", JSON.stringify(tg.groups?.map((g: Any) => [g.label, g.rowIds?.length])));
  const ta = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, group: "assignee" });
  chk("K2.1-S1.3", "group=assignee → มีกลุ่ม 'ไม่มีผู้รับผิดชอบ' (key none) · การ์ดที่มีหลายคนอยู่หลายกลุ่ม (rowIds รวม ≥ 24)", Array.isArray(ta.groups) && ta.groups.some((g: Any) => g.key === "none") && ta.groups.reduce((n: number, g: Any) => n + g.rowIds.length, 0) >= 24, "none + ≥24", JSON.stringify(ta.groups?.map((g: Any) => [g.key, g.rowIds?.length])), "MAJOR");
  const ts = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, sort: "due" });
  const dues = ts.rows.map((r: Any) => r.dueAt).filter(Boolean).map((d: Any) => new Date(d).getTime());
  chk("K2.1-S1.4", "sort=due → กำหนดส่งเรียงน้อย→มาก · ไม่กำหนดอยู่ท้าย", dues.every((d: number, i: number) => i === 0 || d >= dues[i - 1]) && ts.rows.findIndex((r: Any) => !r.dueAt) > ts.rows.findLastIndex((r: Any) => !!r.dueAt), "เรียง", JSON.stringify(ts.rows.map((r: Any) => r.dueAt?.slice?.(0, 10) ?? null)).slice(0, 200));
  const tf = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, filters: { label: "ด่วน" } });
  chk("K2.1-S1.5", "filters (ใช้ filterBoardCards เดิม): label ด่วน → total 3", tf.total === 3, "3", String(tf.total));
  const tp = await tbl.listBoardTable(ctxO, owner, board, { now: NOW, page: 2, pageSize: 10 });
  chk("K2.1-S1.6", "แบ่งหน้า page=2 pageSize=10 → rows 10 · total 24 · page 2", tp.rows.length === 10 && tp.total === 24 && tp.page === 2, "10/24/2", `${tp.rows.length}/${tp.total}/${tp.page}`, "MAJOR");
  const eT = await fails(() => tbl.listBoardTable(ctxT, thana, board, { now: NOW }));
  chk("K2.1-S1.7", "thana (ไม่ใช่สมาชิกบอร์ด PRIVATE) → ไม่พบ (404-class)", !!eT && /NotFound|ไม่พบ/.test(`${eT.name} ${eT.message}`), "ไม่พบ", eT?.message?.slice(0, 60) ?? "ไม่ throw");

  // ═══ S2 bulkUpdate ═══
  const src = cols[1]!; const dst = cols[2]!;
  const two = await prisma.kanbanCard.findMany({ where: { columnId: src.id, status: "ACTIVE" }, orderBy: { position: "asc" }, take: 2 });
  const ids2 = two.map((c) => c.id);
  const before = await prisma.kanbanActivity.count({ where: { boardId: board } });
  const r1 = await cards.bulkUpdate(ctxO, ids2, { toColumnId: dst.id });
  const moved = await prisma.kanbanCard.findMany({ where: { id: { in: ids2 } } });
  chk("K2.1-S2.1", "bulkUpdate(ctx, ids, {toColumnId}) → {updated:2, skipped:[]} · ทั้ง 2 อยู่คอลัมน์ใหม่ · position ไม่ซ้ำกันและต่อท้าย · activity CARD_MOVED +2", r1.updated === 2 && r1.skipped.length === 0 && moved.every((c) => c.columnId === dst.id) && new Set(moved.map((c) => c.position)).size === 2 && (await prisma.kanbanActivity.count({ where: { boardId: board } })) - before >= 2, "2 ย้าย", JSON.stringify(r1));
  const r2 = await cards.bulkUpdate(ctxO, ids2, { addAssigneeUserIds: [pook.userId] });
  const asg = await P.kanbanCardAssignee.count({ where: { cardId: { in: ids2 }, userId: pook.userId } });
  chk("K2.1-S2.2", "bulkUpdate {addAssigneeUserIds:[pook]} → ทั้ง 2 มี pook (ไม่ลบคนเดิม · ไม่ซ้ำ)", r2.updated === 2 && asg === 2, "2", `${JSON.stringify(r2)} asg=${asg}`);
  const lbl = (await prisma.kanbanLabel.findFirst({ where: { boardId: board, name: "ด่วน" } }))!;
  const r3 = await cards.bulkUpdate(ctxO, ids2, { addLabelIds: [lbl.id], dueAt: kq.dayFromToday(3, 18) });
  const lab = await P.kanbanCardLabel.count({ where: { cardId: { in: ids2 }, labelId: lbl.id } });
  const due = await prisma.kanbanCard.findMany({ where: { id: { in: ids2 } }, select: { dueAt: true } });
  chk("K2.1-S2.3", "bulkUpdate {addLabelIds, dueAt} → ป้ายติดทั้ง 2 · กำหนดส่งตั้งทั้ง 2 (ไม่เกิน 30 ป้าย/บอร์ด · ตรวจ limits)", r3.updated === 2 && lab === 2 && due.every((d) => d.dueAt && Math.abs(d.dueAt.getTime() - kq.dayFromToday(3, 18).getTime()) < 1000), "2/2", `${JSON.stringify(r3)} lab=${lab}`);
  const foreign = (await prisma.kanbanCard.findFirst({ where: { boardId: E.boards.kata.id } }))!;
  const r4 = await cards.bulkUpdate(ctxO, [ids2[0]!, foreign.id, "nope"], { archive: true });
  chk("K2.1-S2.4", "bulkUpdate {archive:true} กับ id ต่างบอร์ด/ไม่มี → updated 1 · skipped 2 (ไม่ throw ทั้งชุด · ไม่แตะบอร์ดอื่น)", r4.updated === 1 && r4.skipped.length === 2 && (await prisma.kanbanCard.findUnique({ where: { id: ids2[0]! } }))!.status === "ARCHIVED" && (await prisma.kanbanCard.findUnique({ where: { id: foreign.id } }))!.status === "ACTIVE", "1/2", JSON.stringify(r4));
  const eV = await fails(() => cards.bulkUpdate({ ...ctxO, actorUserId: thana.userId }, [ids2[1]!], { toColumnId: src.id }));
  chk("K2.1-S2.5", "VIEWER/ไม่ใช่สมาชิก → Forbidden/ไม่พบ (ไม่แตะข้อมูล)", !!eV, "throw", eV?.message?.slice(0, 60) ?? "ไม่ throw");
  const eLim = await fails(() => cards.bulkUpdate(ctxO, Array.from({ length: 201 }, (_, i) => `x${i}`), { archive: true }));
  chk("K2.1-S2.6", "เกิน KANBAN_LIMITS.bulkMax (200) → throw ไทย", !!eLim && /[ก-๙]/.test(eLim.message), "throw ไทย", eLim?.message?.slice(0, 60) ?? "ไม่ throw", "MAJOR");

  // ═══ S3 CSV ═══
  const csv = await reports.exportCardsCsv(ctxO, owner, board, { now: NOW });
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  chk("K2.1-S3.1", "exportCardsCsv → ขึ้นต้น BOM · หัวตารางไทย (#, การ์ด, คอลัมน์, ผู้รับผิดชอบ, กำหนดส่ง, เช็คลิสต์, ป้ายกำกับ, แก้ไขล่าสุด) · แถวข้อมูล = การ์ด active หลัง bulk (23)", csv.charCodeAt(0) === 0xfeff && /การ์ด/.test(lines[0]!) && /กำหนดส่ง/.test(lines[0]!) && /ป้ายกำกับ/.test(lines[0]!) && lines.length - 1 === 23, "BOM+หัว+23", `${csv.charCodeAt(0).toString(16)} ${lines[0]?.slice(0, 80)} rows=${lines.length - 1}`);
  chk("K2.1-S3.2", "CSV ใช้ csvRow/csvCell จาก @/lib/core/csv (escape , \" \\n) · ชื่อการ์ดที่มี , อยู่ในเครื่องหมายคำพูด", /@\/lib\/core\/csv/.test(read("src/lib/modules/kanban/reports.ts")) && lines.slice(1).every((l) => l.split(",").length >= 8), "ใช้ core/csv", "ไม่ใช้", "MAJOR");
  const eCsvT = await fails(() => reports.exportCardsCsv(ctxT, thana, board, { now: NOW }));
  chk("K2.1-S3.3", "ส่งออกของบอร์ดที่มองไม่เห็น → ไม่พบ", !!eCsvT, "throw", "ไม่ throw");

  // ═══ S4 UI (static) ═══
  const tv = read("src/components/kanban/TableView.tsx");
  chk("K2.1-S4.1", "TableView.tsx (client) testid table-view · table-row · bulk-bar · table-group · แถวท้าย 'เพิ่มการ์ดใหม่ในคอลัมน์' · ท้ายตาราง 'แสดง' + 'แก้ค่าในช่องได้ทันที'", /^"use client"/m.test(tv) && ["table-view", "table-row", "bulk-bar", "table-group"].every((t) => tv.includes(t)) && /เพิ่มการ์ดใหม่ในคอลัมน์/.test(tv) && /แก้ค่าในช่องได้ทันที/.test(tv), "ครบ", "ขาด");
  chk("K2.1-S4.2", "แก้ในช่อง: คอลัมน์ (select→moveCardAction) · ผู้รับผิดชอบ (setCardAssigneesAction) · กำหนดส่ง (ThaiDatePicker → updateCardFieldsAction) · ป้าย (setCardLabelsAction) · ชื่อ (updateCardFieldsAction) · bulk → bulkUpdateAction", ["moveCardAction", "setCardAssigneesAction", "updateCardFieldsAction", "setCardLabelsAction", "bulkUpdateAction", "ThaiDatePicker"].every((s) => tv.includes(s)), "ครบ", ["moveCardAction", "setCardAssigneesAction", "updateCardFieldsAction", "setCardLabelsAction", "bulkUpdateAction", "ThaiDatePicker"].filter((s) => !tv.includes(s)).join(","));
  chk("K2.1-S4.3", "แถบเลือกหลายรายการ: 'เลือก n การ์ด' + ย้ายไปคอลัมน์ · มอบหมาย · ติดป้าย · ตั้งกำหนดส่ง · เก็บเข้าคลัง (ตามภาพ 04) · เก็บเข้าคลังต้องยืนยัน (ไม่ใช้ confirm())", /เลือก/.test(tv) && ["ย้ายไปคอลัมน์", "มอบหมาย", "ติดป้าย", "ตั้งกำหนดส่ง", "เก็บเข้าคลัง"].every((s) => tv.includes(s)) && !/\bconfirm\(/.test(tv), "ครบ", "ขาด", "MAJOR");
  chk("K2.1-S4.4", "มือถือ (<sm): รายการ 2 บรรทัด ไม่มีแก้ในช่อง (ตามแบบ §3.4) · ใช้ useSyncExternalStore/matchMedia แบบ K1.13 กัน hydration", /sm:|matchMedia|useSyncExternalStore|isMobile/.test(tv), "มีโหมดมือถือ", "ไม่มี", "MAJOR");
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx") + read("src/components/kanban/BoardView.tsx");
  chk("K2.1-S4.5", "?view=table เรนเดอร์ TableView จากหน้าบอร์ด (server โหลด listBoardTable) · group/sort อ่านจาก URL · ปุ่มส่งออก CSV ผ่าน exportBoardCsvAction/route (ไม่ใช่ fetch API สาธารณะ)", /view.*table|"table"/.test(page) && /TableView/.test(page) && /group|sort/.test(page) && /exportBoardCsvAction|\/export/.test(page + tv), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.1") ? readdirSync(".qc-shots/kanban/2.1").filter((f) => f.endsWith(".png")) : [];
  chk("K2.1-S4.6", "ภาพจริง ≥ 4 ใบใน .qc-shots/kanban/2.1 (ตาราง · เลือกหลาย · จัดกลุ่ม · มือถือ)", shots.length >= 4, "≥4", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  // คืนสภาพ: การ์ดที่ถูก bulk (คอลัมน์/สถานะ/position) · ผู้รับผิดชอบ/ป้าย/กำหนดส่งที่เพิ่ม
  try {
    const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
    const pookId = E.users.staff.pook.userId as string; const boardId = E.boards.patong.id as string;
    const lbl = await prisma.kanbanLabel.findFirst({ where: { boardId, name: "ด่วน" } });
    for (const s of snapshot) {
      const cur = await prisma.kanbanCard.findUnique({ where: { id: s.id }, select: { columnId: true, status: true, position: true } });
      if (!cur) continue;
      if (cur.columnId !== s.columnId || cur.status !== s.status || cur.position !== s.position) {
        await prisma.kanbanCard.update({ where: { id: s.id }, data: { columnId: s.columnId, status: s.status as Any, position: s.position || cur.position, archivedAt: null, completedAt: null, dueAt: undefined } });
        await P.kanbanCardAssignee.deleteMany({ where: { cardId: s.id, userId: pookId, card: { boardId }, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => {});
        if (lbl) await P.kanbanCardLabel.deleteMany({ where: { cardId: s.id, labelId: lbl.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => {});
      }
    }
    await P.kanbanActivity.deleteMany({ where: { boardId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
    void created;
  } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
