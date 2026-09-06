// QC — บอร์ดงาน WO K2.3: มุมมองไทม์ไลน์ `?view=timeline` — แถบงาน startAt→dueAt · จัดกลุ่มคอลัมน์/คน/ป้าย · ซูม สัปดาห์/เดือน/ไตรมาส · ลากขอบเปลี่ยนช่วงวัน · ไม่มีบนมือถือ
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.3 · ไม่มี mockup — เกณฑ์ §3.6/§13 K2.3
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/timeline.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/timeline.ts)");
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
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const restore: { id: string; startAt: Date | null; dueAt: Date | null }[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const tl = (await import("@/lib/modules/kanban/timeline" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const board = E.boards.patong.id as string; const NOW = kq.dayFromToday(0, 10);
  const FROM = kq.dayFromToday(-14, 0); const TO = kq.dayFromToday(28, 0);
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const withDue = await prisma.kanbanCard.findMany({ where: { boardId: board, status: "ACTIVE", dueAt: { not: null } }, select: { id: true, startAt: true, dueAt: true, columnId: true, completedAt: true, title: true }, orderBy: { dueAt: "asc" } });
  // เตรียม: การ์ด 2 ใบมีช่วงวัน (startAt→dueAt) ชั่วคราว
  const [k1, k2] = [withDue[0]!, withDue[1]!];
  for (const k of [k1, k2]) restore.push({ id: k.id, startAt: k.startAt, dueAt: k.dueAt });
  await prisma.kanbanCard.update({ where: { id: k1.id }, data: { startAt: kq.dayFromToday(-3, 9), dueAt: kq.dayFromToday(2, 18) } });
  await prisma.kanbanCard.update({ where: { id: k2.id }, data: { startAt: null, dueAt: kq.dayFromToday(5, 18) } });

  // ═══ S1 listBoardTimeline ═══
  const t0 = await tl.listBoardTimeline(ctxO, owner, board, { from: FROM, to: TO, now: NOW });
  chk("K2.3-S1.1", "listBoardTimeline(ctx, actor, boardId, {from, to, now, filters?, group?}) → { range:{from,to}, zoomDays, rows:[{key,label,bars:[{cardId,cardNo,title,startAt,dueAt,startDay,endDay (YYYY-MM-DD ไทย),isOverdue,isDone,color,columnName,assignees[]}]}], unscheduled: n }", t0 && t0.range && Array.isArray(t0.rows) && typeof t0.unscheduled === "number" && t0.rows.every((r: Any) => Array.isArray(r.bars)), "โครงครบ", JSON.stringify(Object.keys(t0 ?? {})));
  const allBars: Any[] = t0.rows.flatMap((r: Any) => r.bars);
  const b1 = allBars.find((b) => b.cardId === k1.id); const b2 = allBars.find((b) => b.cardId === k2.id);
  chk("K2.3-S1.2", "แถบตรงช่วงวันจริง (วันไทย): k1 startDay = วันนี้-3 · endDay = วันนี้+2 · k2 ไม่มี startAt → แถบยาว 1 วัน (startDay = endDay = วันครบกำหนด)", b1?.startDay === bkkDay(kq.dayFromToday(-3)) && b1.endDay === bkkDay(kq.dayFromToday(2)) && b2?.startDay === bkkDay(kq.dayFromToday(5)) && b2.endDay === bkkDay(kq.dayFromToday(5)), `${bkkDay(kq.dayFromToday(-3))}→${bkkDay(kq.dayFromToday(2))} · ${bkkDay(kq.dayFromToday(5))}`, JSON.stringify({ b1: [b1?.startDay, b1?.endDay], b2: [b2?.startDay, b2?.endDay] }));
  const inRange = withDue.filter((c) => c.id !== k1.id && c.id !== k2.id ? (c.dueAt! >= FROM && c.dueAt! <= TO) : true).length;
  const noDue = await prisma.kanbanCard.count({ where: { boardId: board, status: "ACTIVE", dueAt: null } });
  chk("K2.3-S1.3", `จำนวนแถบ = การ์ด active ที่มี dueAt ในช่วง (${inRange}) · แถบไม่ซ้ำข้ามกลุ่ม (group ปริยาย = column) · unscheduled = การ์ดไม่มี dueAt (${noDue}) · แถบเรียงตาม startDay`, allBars.length === inRange && new Set(allBars.map((b) => b.cardId)).size === allBars.length && t0.unscheduled === noDue && t0.rows.every((r: Any) => r.bars.every((b: Any, i: number) => i === 0 || r.bars[i - 1].startDay <= b.startDay)), `${inRange} · ${noDue}`, `${allBars.length} · ${t0.unscheduled}`);
  chk("K2.3-S1.4", "group=column ปริยาย: rows ตามลำดับคอลัมน์ (key = columnId · label = ชื่อ) รวมคอลัมน์ว่าง · isOverdue = dueAt < now และยังไม่เสร็จ · isDone = completedAt", t0.rows.length === cols.length && t0.rows.every((r: Any, i: number) => r.key === cols[i]!.id && r.label === cols[i]!.name) && allBars.every((b) => { const c = withDue.find((x) => x.id === b.cardId); const due = b.cardId === k1.id ? kq.dayFromToday(2, 18) : b.cardId === k2.id ? kq.dayFromToday(5, 18) : c!.dueAt!; return b.isOverdue === (due < NOW && !c!.completedAt) && b.isDone === !!c!.completedAt; }), "ตรง", JSON.stringify(t0.rows.map((r: Any) => [r.label, r.bars.length])));
  const tA = await tl.listBoardTimeline(ctxO, owner, board, { from: FROM, to: TO, now: NOW, group: "assignee" });
  const tL = await tl.listBoardTimeline(ctxO, owner, board, { from: FROM, to: TO, now: NOW, group: "label" });
  chk("K2.3-S1.5", "group=assignee: การ์ดหลายคนอยู่หลายแถว + แถว 'ไม่มีผู้รับผิดชอบ' (key none) · group=label: + 'ไม่มีป้าย' · ทั้งสองแบบยังครอบคลุมทุกการ์ดที่มีแถบ", tA.rows.some((r: Any) => r.key === "none") && new Set(tA.rows.flatMap((r: Any) => r.bars.map((b: Any) => b.cardId))).size === allBars.length && tL.rows.some((r: Any) => r.key === "none") && new Set(tL.rows.flatMap((r: Any) => r.bars.map((b: Any) => b.cardId))).size === allBars.length, "ครอบคลุม", `${tA.rows.length} แถวคน · ${tL.rows.length} แถวป้าย`);
  const tF = await tl.listBoardTimeline(ctxO, owner, board, { from: FROM, to: TO, now: NOW, filters: { label: "ด่วน" } });
  const urgentWithDue = await prisma.kanbanCard.count({ where: { boardId: board, status: "ACTIVE", dueAt: { not: null, gte: FROM, lte: TO }, cardLabels: { some: { label: { name: "ด่วน" } } } } });
  chk("K2.3-S1.6", `filters ใช้ filterBoardCards เดิม: label ด่วน → แถบ ${urgentWithDue}`, tF.rows.flatMap((r: Any) => r.bars).length === urgentWithDue, String(urgentWithDue), String(tF.rows.flatMap((r: Any) => r.bars).length));
  const eT = await fails(() => tl.listBoardTimeline(ctxT, thana, board, { from: FROM, to: TO, now: NOW }));
  const eRange = await fails(() => tl.listBoardTimeline(ctxO, owner, board, { from: FROM, to: kq.dayFromToday(400, 0), now: NOW }));
  chk("K2.3-S1.7", "thana มองไม่เห็นบอร์ด → ไม่พบ · ช่วง > 366 วัน → throw ไทย (กันดึงทั้งประวัติ)", !!eT && !!eRange && /[ก-๙]/.test(eRange.message), "throw ทั้งคู่", `${!!eT}/${eRange?.message?.slice(0, 40)}`);

  // ═══ S2 setCardRange (ลากขอบ) ═══
  const r1 = await tl.setCardRange(ctxO, k1.id, { startAt: kq.dayFromToday(-1, 9), dueAt: kq.dayFromToday(4, 18) });
  const k1r = (await prisma.kanbanCard.findUnique({ where: { id: k1.id } }))!;
  chk("K2.3-S2.1", "🔴 setCardRange(ctx, cardId, {startAt, dueAt}) → {ok, startAt, dueAt} · ค่าใน DB เปลี่ยนตาม (ลากขอบซ้าย/ขวา) · activity CARD_DUE_SET · ผ่าน updateCardFields เดิม (reminderSentAt reset)", r1?.ok === true && bkkDay(k1r.startAt!) === bkkDay(kq.dayFromToday(-1)) && bkkDay(k1r.dueAt!) === bkkDay(kq.dayFromToday(4)) && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: k1.id, type: "CARD_DUE_SET" }, orderBy: { createdAt: "desc" } })) && k1r.reminderSentAt === null, "เปลี่ยน", JSON.stringify({ s: k1r.startAt, d: k1r.dueAt }));
  const eOrder = await fails(() => tl.setCardRange(ctxO, k1.id, { startAt: kq.dayFromToday(5, 9), dueAt: kq.dayFromToday(2, 18) }));
  chk("K2.3-S2.2", "startAt > dueAt → throw ไทย · startAt null ได้ (ล้างวันเริ่ม)", !!eOrder && /[ก-๙]/.test(eOrder.message) && (await tl.setCardRange(ctxO, k1.id, { startAt: null, dueAt: kq.dayFromToday(4, 18) }))?.ok === true && ((await prisma.kanbanCard.findUnique({ where: { id: k1.id } }))!).startAt === null, "throw + ล้างได้", eOrder?.message?.slice(0, 50) ?? "ไม่ throw");
  const shifted = await tl.shiftCardRange(ctxO, k2.id, { days: 2 });
  chk("K2.3-S2.3", "shiftCardRange(ctx, cardId, {days}) → เลื่อนทั้งแถบ (ลากตัวแถบ) คงเวลาเดิม: k2 due +2 วัน = วันนี้+7 18:00", shifted?.ok === true && bkkDay(((await prisma.kanbanCard.findUnique({ where: { id: k2.id } }))!).dueAt!) === bkkDay(kq.dayFromToday(7)) && ((await prisma.kanbanCard.findUnique({ where: { id: k2.id } }))!).dueAt!.getUTCHours() === 11, bkkDay(kq.dayFromToday(7)), "ไม่ตรง");
  const eV = await fails(() => tl.setCardRange(ctxT, k1.id, { startAt: null, dueAt: kq.dayFromToday(4, 18) }));
  chk("K2.3-S2.4", "thana (มองไม่เห็น) ลากขอบ → ไม่พบ/Forbidden", !!eV, "throw", "ไม่ throw");

  // ═══ S3 UI (static) ═══
  const tv = read("src/components/kanban/TimelineView.tsx");
  chk("K2.3-S3.1", "TimelineView.tsx (client) testid timeline-view · timeline-bar (แถบต่อการ์ด · คลิก → ?card=) · timeline-zoom (สัปดาห์/เดือน/ไตรมาส) · timeline-group (คอลัมน์/คน/ป้าย) · timeline-today (เส้นวันนี้) · ‹ › เลื่อนช่วง + ปุ่ม 'วันนี้' · หัวตารางวันไทย (ชื่อเดือนไทย + พ.ศ. คำนวณเอง ห้าม toLocale*)", ["timeline-view", "timeline-bar", "timeline-zoom", "timeline-group", "timeline-today"].every((t) => tv.includes(t)) && /ไตรมาส/.test(tv) && /\?card=|card=/.test(tv) && !/toLocale/.test(tv), "ครบ", "ขาด");
  chk("K2.3-S3.2", "ลากขอบซ้าย/ขวา (resize handle testid timeline-handle) → setCardRangeAction · ลากตัวแถบ → shiftCardRangeAction · optimistic + rollback เมื่อพัง · ไม่มี lib ใหม่ (pointer events เอง)", tv.includes("timeline-handle") && /setCardRangeAction/.test(tv) && /shiftCardRangeAction/.test(tv) && !/react-dnd|dnd-kit|gantt|frappe|vis-timeline/.test(tv + read("package.json")), "ครบ", "ขาด");
  chk("K2.3-S3.3", "มือถือ <md: ไม่แสดงไทม์ไลน์ — ข้อความ testid timeline-mobile-hint 'ไทม์ไลน์ใช้บนจอกว้าง — บนมือถือลองมุมมองตาราง' + ลิงก์ ?view=table", tv.includes("timeline-mobile-hint") && /view=table/.test(tv) && /มุมมองตาราง/.test(tv), "ครบ", "ขาด");
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx") + read("src/components/kanban/BoardView.tsx") + read("src/components/kanban/BoardHeader.tsx");
  chk("K2.3-S3.4", "?view=timeline&zoom=week|month|quarter&group=&from=YYYY-MM-DD → server เรียก listBoardTimeline (ช่วงตามซูม: สัปดาห์ 2 สัปดาห์ · เดือน 6 สัปดาห์ · ไตรมาส 13 สัปดาห์) · แท็บ 'ไทม์ไลน์' เปิดใช้ (เลิก 'เร็ว ๆ นี้') · มุมมองที่บันทึกไว้ (K2.5) รับ view=timeline", /timeline/.test(page) && /TimelineView/.test(page) && !/ไทม์ไลน์[^<]{0,40}เร็ว ๆ นี้/.test(page), "ครบ", "ขาด");
  chk("K2.3-S3.5", "แถบใช้สีป้ายแรกของการ์ด (token --color-tag-*) · เลยกำหนด = ขอบแดง · เสร็จ = จาง · ไม่ hard-code น้ำเงิน", /color-tag|tagColor|labelColor/.test(tv) && !/#1d4ed8|bg-blue-600/.test(tv), "ครบ", "ขาด", "MAJOR");
  const shots = existsSync(".qc-shots/kanban/2.3") ? readdirSync(".qc-shots/kanban/2.3").filter((f) => f.endsWith(".png")) : [];
  chk("K2.3-S3.6", "ภาพจริง ≥ 4 ใบใน .qc-shots/kanban/2.3 (เดือน · ไตรมาส · จัดกลุ่มตามคน · หลังลากขอบ (ค่าเปลี่ยน) · มือถือ=ข้อความชวน)", shots.length >= 4, "≥4", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { for (const r of restore) await prisma.kanbanCard.update({ where: { id: r.id }, data: { startAt: r.startAt, dueAt: r.dueAt, reminderSentAt: null } }); } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.3 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
