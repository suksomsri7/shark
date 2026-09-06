// QC — บอร์ดงาน WO K2.2: มุมมองปฏิทิน (?view=calendar) — listBoardCalendar · ถาดยังไม่กำหนดวัน · ลากตั้ง/เปลี่ยนกำหนดส่ง · ซ้อนงานระบบอื่น (อ่านอย่างเดียว) · ภาพ 05
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.2
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/calendar.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/calendar.ts)");
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
const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10); // YYYY-MM-DD ตามเวลาไทย
let restore: { id: string; dueAt: Date | null }[] = []; let leaveId = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const cal = (await import("@/lib/modules/kanban/calendar" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const board = E.boards.patong.id as string; const NOW = kq.dayFromToday(0, 10);
  const from = new Date(NOW); from.setUTCDate(1); from.setUTCHours(-7, 0, 0, 0); // ต้นเดือน (เวลาไทย 00:00)
  const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
  const activeCards = await prisma.kanbanCard.findMany({ where: { boardId: board, status: "ACTIVE" }, select: { id: true, dueAt: true, completedAt: true } });
  const inWindow = activeCards.filter((c) => c.dueAt && c.dueAt >= from && c.dueAt < to);
  const noDue = activeCards.filter((c) => !c.dueAt);

  // ═══ S1 listBoardCalendar ═══
  const c0 = await cal.listBoardCalendar(ctxO, owner, board, { from, to, now: NOW });
  chk("K2.2-S1.1", "listBoardCalendar(ctx, actor, boardId, {from,to,now}) → {days: Record<YYYY-MM-DD,{cards[],external[]}>, unscheduled[], range{from,to}} · การ์ดที่มีกำหนดในเดือนนี้ครบ · ถาดยังไม่กำหนดวัน = การ์ด active ที่ไม่มี dueAt (" + noDue.length + ")", c0 && typeof c0.days === "object" && Array.isArray(c0.unscheduled) && Object.values(c0.days).reduce((n: number, d: Any) => n + d.cards.length, 0) === inWindow.length && c0.unscheduled.length === noDue.length, `${inWindow.length}/${noDue.length}`, `${Object.values(c0?.days ?? {}).reduce((n: number, d: Any) => n + (d.cards?.length ?? 0), 0)}/${c0?.unscheduled?.length}`);
  const anyDay = Object.entries(c0.days).find(([, d]: [string, Any]) => d.cards.length > 0) as [string, Any] | undefined;
  chk("K2.2-S1.2", "การ์ดในวัน: {id,cardNo,title,dueAt,columnName,labels[{name,color}],assignees[{userId,name}],isOverdue,isDone} · คีย์วันเป็นวันที่ไทย (dueAt +7 ชม.)", !!anyDay && anyDay[1].cards.every((c: Any) => typeof c.cardNo === "number" && "isOverdue" in c && "isDone" in c && Array.isArray(c.labels) && bkk(new Date(c.dueAt)) === anyDay[0]), "ฟิลด์+วันไทย", JSON.stringify(anyDay?.[1]?.cards?.[0] ?? {}).slice(0, 160));
  const overdueCards = Object.values(c0.days).flatMap((d: Any) => d.cards).filter((c: Any) => c.isOverdue);
  const expOverdue = inWindow.filter((c) => c.dueAt! < NOW && !c.completedAt).length;
  chk("K2.2-S1.3", "isOverdue = dueAt < now และยังไม่เสร็จ (completedAt null) — นับตรงกับ DB", overdueCards.length === expOverdue, String(expOverdue), String(overdueCards.length));
  const cX = await cal.listBoardCalendar(ctxO, owner, board, { from, to, now: NOW, includeExternal: true });
  chk("K2.2-S1.4", "includeExternal:true → external[] มาจาก getCalendarEvents ของ modules/calendar (โครง {id,kind,title,startAt,endAt,href}) และไม่มีใน includeExternal:false", Object.values(cX.days).every((d: Any) => Array.isArray(d.external)) && Object.values(c0.days).every((d: Any) => (d.external?.length ?? 0) === 0), "external แยกตามสวิตช์", "ไม่ตรง");
  const cF = await cal.listBoardCalendar(ctxO, owner, board, { from, to, now: NOW, filters: { label: "ด่วน" } });
  chk("K2.2-S1.5", "filters ใช้ filterBoardCards เดิม (label ด่วน → นับเฉพาะใบที่มีป้าย ทั้งในวันและถาด)", Object.values(cF.days).reduce((n: number, d: Any) => n + d.cards.length, 0) + cF.unscheduled.length <= 3, "≤3", String(Object.values(cF.days).reduce((n: number, d: Any) => n + d.cards.length, 0) + cF.unscheduled.length), "MAJOR");
  const eT = await fails(() => cal.listBoardCalendar(ctxT, thana, board, { from, to, now: NOW }));
  chk("K2.2-S1.6", "thana มองไม่เห็นบอร์ด PRIVATE → ไม่พบ", !!eT, "throw", eT?.message?.slice(0, 60) ?? "ไม่ throw");

  // ═══ S2 ตั้ง/เปลี่ยนกำหนดส่งด้วยการลาก (service เดียวกับหลังการ์ด) ═══
  const target = noDue[0]!; restore.push({ id: target.id, dueAt: null });
  const day = kq.dayFromToday(5, 18);
  const r1 = await cal.setCardDueFromCalendar(ctxO, target.id, day);
  const after1 = await prisma.kanbanCard.findUnique({ where: { id: target.id }, select: { dueAt: true } });
  chk("K2.2-S2.1", "setCardDueFromCalendar(ctx, cardId, date) จากถาด → dueAt = วันนั้น 18:00 ไทย (เวลาปริยาย) · คืน {ok, dueAt} · activity CARD_DUE_SET", r1?.ok === true && after1?.dueAt && Math.abs(after1.dueAt.getTime() - day.getTime()) < 1000 && (await prisma.kanbanActivity.count({ where: { cardId: target.id, type: "CARD_DUE_SET" } })) >= 1, "ตั้งวัน", JSON.stringify({ r1, dueAt: after1?.dueAt }).slice(0, 160));
  const withDue = inWindow[0]!; restore.push({ id: withDue.id, dueAt: withDue.dueAt });
  const shifted = new Date(withDue.dueAt!.getTime() + 2 * 86400_000);
  const r2 = await cal.setCardDueFromCalendar(ctxO, withDue.id, shifted, { keepTime: true });
  const after2 = await prisma.kanbanCard.findUnique({ where: { id: withDue.id }, select: { dueAt: true } });
  chk("K2.2-S2.2", "ลากในปฏิทินไปอีกวัน (keepTime) → เปลี่ยนเฉพาะวัน เวลาเดิมคงไว้", r2?.ok === true && after2?.dueAt && bkk(after2.dueAt) === bkk(shifted) && after2.dueAt.getUTCHours() === withDue.dueAt!.getUTCHours(), "เปลี่ยนวัน คงเวลา", `${after2?.dueAt?.toISOString()} vs ${shifted.toISOString()}`);
  const eV = await fails(() => cal.setCardDueFromCalendar(ctxT, withDue.id, shifted));
  chk("K2.2-S2.3", "thana (ไม่มีสิทธิ์) ลากไม่ได้ → throw", !!eV, "throw", "ไม่ throw");

  // ═══ S3 งานจากระบบอื่น (อ่านอย่างเดียว) ═══
  const hrSys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "HR" }, select: { id: true } });
  if (hrSys) {
    const lv = await (prisma as Any).hrLeave.create({ data: { tenantId: tid, systemId: hrSys.id, userId: E.users.staff.thana.userId, type: "SICK", startAt: kq.dayFromToday(2, 0), endAt: kq.dayFromToday(3, 0), status: "APPROVED", reason: "QC K2.2" } }).catch(() => null);
    leaveId = lv?.id ?? "";
  }
  const cX2 = await cal.listBoardCalendar(ctxO, owner, board, { from, to, now: NOW, includeExternal: true });
  const ext = Object.values(cX2.days).flatMap((d: Any) => d.external);
  chk("K2.2-S3.1", "external มีรายการจริง (ลา/นัด/เข้าพัก) เมื่อร้านมีข้อมูล · แต่ละรายการมี kind + title ไทย + href ไปหน้าต้นทาง (ไม่มี HR = ข้อนี้ถือว่าผ่านเมื่อ external ว่างและไม่ error)", hrSys ? ext.length >= 1 && ext.every((e: Any) => typeof e.kind === "string" && typeof e.href === "string" && /[ก-๙]/.test(e.title)) : true, "มี external", `hr=${!!hrSys} ext=${ext.length}`, "MAJOR");

  // ═══ S4 UI (static) ═══
  const cv = read("src/components/kanban/CalendarView.tsx");
  chk("K2.2-S4.1", "CalendarView.tsx (client) testid calendar-view · calendar-day · calendar-unscheduled · calendar-external-toggle · calendar-today · สลับ สัปดาห์/เดือน · ปุ่ม 'วันนี้' · ‹ › เดือน", /^"use client"/m.test(cv) && ["calendar-view", "calendar-day", "calendar-unscheduled", "calendar-external-toggle", "calendar-today"].every((t) => cv.includes(t)) && /สัปดาห์/.test(cv) && /เดือน/.test(cv) && /วันนี้/.test(cv), "ครบ", "ขาด");
  chk("K2.2-S4.2", "ถาด 'ยังไม่กำหนดวัน (n)' + บรรทัดสอน 'ลากการ์ดไปวางบนวันในปฏิทิน = ตั้งกำหนดส่ง' · คำอธิบายสัญลักษณ์ 3 แบบ (การ์ดในบอร์ดนี้ / เลยกำหนด / จองทริป·ลา·ประชุม อ่านอย่างเดียว)", /ยังไม่กำหนดวัน/.test(cv) && /ลากการ์ดไปวางบนวันในปฏิทิน/.test(cv) && /อ่านอย่างเดียว/.test(cv) && /เลยกำหนด/.test(cv), "ครบ", "ขาด", "MAJOR");
  chk("K2.2-S4.3", "ลาก-วาง: pointer/dnd ลงช่องวัน → setCardDueFromCalendarAction (optimistic + rollback) · ชื่อเดือนไทย + พ.ศ. คำนวณเอง (ห้าม toLocaleDateString — บทเรียน K1.5)", /setCardDueFromCalendarAction/.test(cv) && /onDrop|onPointerUp|drop/.test(cv) && !/toLocaleDateString|toLocaleString/.test(cv) && /2569|พ\.ศ|\+ 543/.test(cv + read("src/components/kanban/ThaiDatePicker.tsx")), "ครบ", "ขาด");
  chk("K2.2-S4.4", "คลิกงานระบบอื่น → ไปหน้าต้นทาง (href) ไม่เปิดหลังการ์ด · คลิกการ์ด → ?card= · มือถือ: สัปดาห์เป็นรายการวันต่อวัน", /href/.test(cv) && /card=/.test(cv) && /sm:|matchMedia|useSyncExternalStore|isMobile/.test(cv), "ครบ", "ขาด", "MAJOR");
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx") + read("src/components/kanban/BoardView.tsx");
  chk("K2.2-S4.5", "?view=calendar&month=YYYY-MM&mode=week|month&ext=1 → server เรียก listBoardCalendar ส่ง props · แท็บ 'ปฏิทิน' เปิดใช้", /calendar/.test(page) && /CalendarView/.test(page) && /month|mode/.test(page), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.2") ? readdirSync(".qc-shots/kanban/2.2").filter((f) => f.endsWith(".png")) : [];
  chk("K2.2-S4.6", "ภาพจริง ≥ 4 ใบใน .qc-shots/kanban/2.2 (เดือน · สัปดาห์ · หลังลากการ์ดจากถาดลงวัน · มือถือ)", shots.length >= 4, "≥4", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    for (const r of restore) await prisma.kanbanCard.update({ where: { id: r.id }, data: { dueAt: r.dueAt } });
    if (leaveId) await (prisma as Any).hrLeave.delete({ where: { id: leaveId } }).catch(() => {});
    const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
    await (prisma as Any).kanbanActivity.deleteMany({ where: { boardId: E.boards.patong.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
