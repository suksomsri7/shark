// QC — บอร์ดงาน WO K2.11: ติดตาม (KanbanWatcher) + แจ้งเตือนตามตาราง §7.4 + ค่าตั้งความถี่อีเมล + cron เตือนใกล้กำหนด/เลยกำหนด + อีเมลสรุป (digest)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.11
// requires: kanban-seed
// 🔴 อีเมลใน QC สังเกตผ่าน deps.sendEmail ที่ฉีดเข้า sweep (แบบเดียวกับ engine.ts deps.post) — emailEnabled เป็น false ใน QC เสมอ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/watch.ts") || !existsSync("src/lib/modules/kanban/digest.ts") || !existsSync("src/lib/modules/kanban/reminders.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (watch.ts + reminders.ts + digest.ts)");
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
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
let tid = ""; let SYS = ""; let patong = "";
const madeCards: string[] = []; const prefsBackup = new Map<string, unknown>();
const emails: { to: string; subject: string; text: string }[] = [];
const sink = { sendEmail: async (to: string, subject: string, text: string) => { emails.push({ to, subject, text }); } };
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId; patong = E.boards.patong.id;
  const w = (await import("@/lib/modules/kanban/watch" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const rm = (await import("@/lib/modules/kanban/reminders" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const dg = (await import("@/lib/modules/kanban/digest" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cm = (await import("@/lib/modules/kanban/comments" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const mv = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const prefs = (await import("@/lib/core/user-preferences" as string)) as Record<string, (...a: Any[]) => Any>;
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string, kitti: E.users.staff.kitti.userId as string, noPerm: (await prisma.user.findFirst({ where: { email: kq.KQC.noPermEmail } }))!.id };
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const ctxOf = (userId: string) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const A = { owner: await actorOf(U.owner), pook: await actorOf(U.pook), thana: await actorOf(U.thana), kitti: await actorOf(U.kitti) };
  const NOW = kq.dayFromToday(0, 10); // พุธ 30 ก.ย. 2569 10:00 ไทย
  const notifCount = (userId: string, title?: RegExp, bodyHas?: string) => prisma.appNotification.findMany({ where: { tenantId: tid, recipientUserId: userId, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } } }).then((r) => r.filter((n) => (!title || title.test(n.title)) && (!bodyHas || n.body.includes(bodyHas))).length);
  for (const id of Object.values(U)) prefsBackup.set(id, (await prisma.user.findUnique({ where: { id }, select: { prefs: true } }))?.prefs ?? null);

  // เตรียม: ป่าตอง PRIVATE · pook EDITOR · thana VIEWER · kitti ไม่ใช่สมาชิก (แบบ K1.8)
  await P.kanbanBoardMember.deleteMany({ where: { boardId: patong } });
  await members.addMember(ctxOf(U.owner), patong, U.pook, "EDITOR");
  await members.addMember(ctxOf(U.owner), patong, U.thana, "VIEWER");
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: patong, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const [c0, c1] = [cols[0]!, cols[1]!];
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 ติดตาม", createdById: U.owner });
  madeCards.push(card.id);

  // ═══ S1 schema ═══
  const wcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanWatcher'`)).map((c) => c.column_name);
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='KanbanWatchTargetType'`)).map((e) => e.enumlabel);
  chk("K2.11-S1.1", "KanbanWatcher {tenantId systemId targetType targetId userId} · unique(targetType,targetId,userId) · enum CARD COLUMN BOARD", ["tenantId", "systemId", "targetType", "targetId", "userId"].every((c) => wcols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanWatcher' and indexdef ilike '%unique%' and indexdef ilike '%"targetId"%' and indexdef ilike '%"userId"%'`)).length === 1 && ["CARD", "COLUMN", "BOARD"].every((v) => enums.includes(v)), "ครบ", `${wcols.join(",")} · ${enums.join(",")}`);
  const dcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanDigestSent'`)).map((c) => c.column_name);
  const ncols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='AppNotification'`)).map((c) => c.column_name);
  chk("K2.11-S1.2", "KanbanDigestSent {tenantId userId periodKey sentAt} unique(tenantId,userId,periodKey) (หลักฐาน 1 ฉบับ/คน/รอบ) · AppNotification เพิ่ม emailedAt (nullable · additive)", ["tenantId", "userId", "periodKey", "sentAt"].every((c) => dcols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanDigestSent' and indexdef ilike '%unique%' and indexdef ilike '%"periodKey"%'`)).length === 1 && ncols.includes("emailedAt"), "ครบ", `${dcols.join(",")} · emailedAt=${ncols.includes("emailedAt")}`);

  // ═══ S2 ติดตาม ═══
  const w1 = await w.watch(ctxOf(U.pook), A.pook, { targetType: "CARD", targetId: card.id });
  const w2 = await w.watch(ctxOf(U.pook), A.pook, { targetType: "CARD", targetId: card.id });
  chk("K2.11-S2.1", "watch(ctx, actor, {targetType, targetId}) → {watching:true} · ซ้ำ = idempotent (แถวเดียว) · VIEWER ก็ติดตามได้", w1?.watching === true && w2?.watching === true && (await P.kanbanWatcher.count({ where: { targetType: "CARD", targetId: card.id, userId: U.pook } })) === 1 && (await w.watch(ctxOf(U.thana), A.thana, { targetType: "CARD", targetId: card.id }))?.watching === true, "1 แถว", String(await P.kanbanWatcher.count({ where: { targetType: "CARD", targetId: card.id } })));
  const eK = await fails(() => w.watch(ctxOf(U.kitti), A.kitti, { targetType: "CARD", targetId: card.id }));
  const eKata = await fails(() => w.watch(ctxOf(U.thana), A.thana, { targetType: "BOARD", targetId: E.boards.kata.id }));
  chk("K2.11-S2.2", "kitti (ไม่ใช่สมาชิกบอร์ด PRIVATE) ติดตามการ์ด → ไม่พบ · thana ติดตามบอร์ดลับกะตะ → ไม่พบ", !!eK && !!eKata, "throw ทั้งคู่", `${eK ? "throw" : "ไม่"}/${eKata ? "throw" : "ไม่"}`);
  await w.watch(ctxOf(U.kitti), A.kitti, { targetType: "BOARD", targetId: E.boards.maint.id }); // maint TENANT: kitti เห็น
  await w.watch(ctxOf(U.thana), A.thana, { targetType: "COLUMN", targetId: c1.id });
  const isW = await w.isWatching(ctxOf(U.pook), A.pook, { targetType: "CARD", targetId: card.id });
  const set = await w.resolveWatchersForCard(ctxOf(U.owner), card.id);
  chk("K2.11-S2.3", "isWatching → true · resolveWatchersForCard(ctx, cardId) → Set(userId) = ผู้ติดตามการ์ด ∪ ผู้ติดตามคอลัมน์ของการ์ด ∪ ผู้ติดตามบอร์ด ∪ ผู้รับผิดชอบ (ตอนนี้: pook, thana(การ์ด) · thana ติดตาม c1 ไม่ใช่ c0 · kitti ติดตามบอร์ดอื่น)", isW === true && set instanceof Set && set.has(U.pook) && set.has(U.thana) && !set.has(U.kitti) && !set.has(U.owner), "{pook,thana}", JSON.stringify([...(set ?? [])]));
  await cards.setCardAssignees(ctxOf(U.owner), card.id, [U.kitti]).catch(() => null); // kitti ไม่ใช่สมาชิก → อาจถูกปฏิเสธ · ถ้าสำเร็จต้องอยู่ใน set
  const set2 = await w.resolveWatchersForCard(ctxOf(U.owner), card.id);
  const kittiAssigned = (await prisma.kanbanCardAssignee.count({ where: { cardId: card.id, userId: U.kitti } })) === 1;
  chk("K2.11-S2.4", "ผู้รับผิดชอบนับเป็นผู้ติดตามโดยนัย (ถ้ามอบหมาย kitti ได้ → อยู่ใน set)", !kittiAssigned || set2.has(U.kitti), "สอดคล้อง", `assigned=${kittiAssigned} inSet=${set2?.has(U.kitti)}`);
  const un1 = await w.unwatch(ctxOf(U.thana), A.thana, { targetType: "CARD", targetId: card.id });
  const un2 = await w.unwatch(ctxOf(U.thana), A.thana, { targetType: "CARD", targetId: card.id });
  chk("K2.11-S2.5", "unwatch → {watching:false} · ซ้ำไม่ throw · แถวหาย (hard delete ได้ตาม §11.6)", un1?.watching === false && un2?.watching === false && (await P.kanbanWatcher.count({ where: { targetType: "CARD", targetId: card.id, userId: U.thana } })) === 0, "0 แถว", "ยังอยู่");
  const mine = await w.myWatched(ctxOf(U.pook), A.pook);
  chk("K2.11-S2.6", "myWatched(ctx, actor) → การ์ดที่ฉันติดตาม (ตรง+ผ่านคอลัมน์/บอร์ด) ที่ฉัน **ไม่ได้** รับผิดชอบ [{id, title, boardName, columnName, dueAt}] (บล็อก 'ที่ฉันติดตาม' ในงานของฉัน)", Array.isArray(mine) && mine.some((c: Any) => c.id === card.id && typeof c.boardName === "string"), "มีการ์ด", JSON.stringify(mine?.slice(0, 2) ?? null).slice(0, 160));

  // ═══ S3 ความเห็นใหม่ → ผู้ติดตาม (ยกเว้นคนที่ถูก mention และผู้เขียน) ═══
  await w.watch(ctxOf(U.thana), A.thana, { targetType: "CARD", targetId: card.id }); // thana ติดตามด้วย และจะถูก mention
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await cm.addComment(ctxOf(U.owner), card.id, `ฝากดูด้วย @[ธนา](${U.thana})`);
  const nP = await notifCount(U.pook); const nT = await notifCount(U.thana); const nO = await notifCount(U.owner);
  chk("K2.11-S3.1", "🔴 owner เขียนความเห็น + mention thana: pook (ผู้ติดตาม) ได้ 1 ใบ 'ความเห็นใหม่…' · thana ได้ **1 ใบเท่านั้น** (mention · ไม่ซ้ำจากการติดตาม) · owner (ผู้เขียน) 0", nP === 1 && nT === 1 && nO === 0, "1/1/0", `${nP}/${nT}/${nO}`);
  const rowP = (await prisma.appNotification.findFirst({ where: { tenantId: tid, recipientUserId: U.pook } }))!;
  chk("K2.11-S3.2", "ใบของ pook: title มีคำว่า 'ความเห็น' · body มีชื่อการ์ด + ลิงก์ ?card= · ไม่มีเนื้อความเห็นเต็ม (ตัด ≤ 80 ตัวอักษร) · emailedAt null (รอสรุปรายชั่วโมง — ค่าปริยาย HOURLY)", /ความเห็น/.test(rowP.title) && rowP.body.includes(card.title) && /\?card=/.test(rowP.body) && (rowP as Any).emailedAt === null, "ตรง", `${rowP.title} | ${rowP.body.slice(0, 80)}`);
  // สรุปรายชั่วโมง (อีเมล) — pook HOURLY ปริยาย · thana ตั้ง OFF · ใบที่อ่านแล้วไม่ส่ง
  await prefs.setUserPreferences(U.thana, { kanbanEmailMode: "OFF" });
  emails.length = 0;
  const h1 = await dg.sweepKanbanEmailHourly(new Date(), sink);
  const h2 = await dg.sweepKanbanEmailHourly(new Date(), sink);
  const pookEmail = (await prisma.user.findUnique({ where: { id: U.pook } }))!.email;
  chk("K2.11-S3.3", "sweepKanbanEmailHourly(now, deps) → ส่งอีเมลรวมใบที่ยังไม่อ่าน+ยังไม่เคยส่ง ให้คนที่ตั้ง HOURLY (pook 1 ฉบับ · มีชื่อการ์ด) · thana OFF = 0 · ตั้ง emailedAt · รันซ้ำ → 0", h1 === 1 && h2 === 0 && emails.length === 1 && emails[0]!.to === pookEmail && emails[0]!.text.includes(card.title) && !emails.some((e) => e.to !== pookEmail) && ((await prisma.appNotification.findFirst({ where: { id: rowP.id } })) as Any).emailedAt !== null, "1 แล้ว 0 · ถึง pook", `${h1}/${h2} · ${emails.map((e) => e.to).join(",")}`);
  await cm.addComment(ctxOf(U.owner), card.id, "ความเห็นที่สอง");
  const rowP2 = (await prisma.appNotification.findFirst({ where: { tenantId: tid, recipientUserId: U.pook, emailedAt: null } as Any }))!;
  await prisma.appNotification.update({ where: { id: rowP2.id }, data: { readAt: new Date() } });
  emails.length = 0;
  const h3 = await dg.sweepKanbanEmailHourly(new Date(), sink);
  chk("K2.11-S3.4", "อ่านในแอปแล้ว (readAt) → ไม่ส่งอีเมลซ้ำ (sweep = 0)", h3 === 0 && emails.length === 0, "0", `${h3} · ${emails.length}`);
  await prefs.setUserPreferences(U.pook, { kanbanEmailMode: "INSTANT" });
  chk("K2.11-S3.5", "INSTANT: notifyWatchers ส่งอีเมลทันทีผ่าน notifyKanbanUser({email:true}) และตั้ง emailedAt ตอนสร้าง (โค้ด: ค่า mode INSTANT → email: true) · OFF: ไม่ส่งและไม่ให้ sweep เก็บ", /INSTANT/.test(read("src/lib/modules/kanban/notify.ts")) && /emailedAt/.test(read("src/lib/modules/kanban/notify.ts")) && /OFF/.test(read("src/lib/modules/kanban/digest.ts")), "มี", "ขาด", "MAJOR");
  await prefs.setUserPreferences(U.pook, { kanbanEmailMode: "HOURLY" });

  // ═══ S4 ย้าย/เก็บการ์ดที่ติดตาม ═══
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await mv.moveCard(ctxOf(U.owner), { cardId: card.id, toColumnId: c1.id });
  const mP = await notifCount(U.pook, /ย้าย/); const mT = await notifCount(U.thana, /ย้าย/); const mO = await notifCount(U.owner);
  chk("K2.11-S4.1", "owner ย้ายการ์ดข้ามคอลัมน์ → ผู้ติดตาม (pook, thana) ได้ใบ 'การ์ดที่คุณติดตามถูกย้าย…' คนละ 1 · owner 0 · (thana ติดตาม c1 ปลายทางด้วย — ยังได้ใบเดียว)", mP === 1 && mT === 1 && mO === 0, "1/1/0", `${mP}/${mT}/${mO}`);
  await mv.moveCardSideways?.(ctxOf(U.owner), { cardId: card.id }).catch(() => null);
  chk("K2.11-S4.2", "ย้ายภายในคอลัมน์เดียวกัน (sideways) ไม่แจ้ง · notifyWatchers kind MOVED ไม่ยิง push (§7.4) — โค้ด: push เฉพาะ COMMENT", (await notifCount(U.pook, /ย้าย/)) === 1 && /push:\s*kind\s*===\s*"COMMENT"|kind === "COMMENT"/.test(read("src/lib/modules/kanban/notify.ts").replace(/\s+/g, " ")), "1 · push เฉพาะ COMMENT", String(await notifCount(U.pook, /ย้าย/)), "MAJOR");
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await cards.archiveCard(ctxOf(U.owner), card.id);
  chk("K2.11-S4.3", "เก็บการ์ดที่ติดตาม → ผู้ติดตามได้ใบ 'ถูกเก็บเข้าคลัง' 1 ใบ", (await notifCount(U.pook, /เก็บ/)) === 1, "1", String(await notifCount(U.pook, /เก็บ/)));
  await cards.restoreCard(ctxOf(U.owner), card.id).catch(() => null);

  // ═══ S5 cron เตือนใกล้ถึงกำหนด (รายชั่วโมง) ═══
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  const soon = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 ใกล้กำหนด", dueAt: new Date(NOW.getTime() + 30 * 60_000), assigneeUserId: U.pook, createdById: U.owner });
  const later = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 อีกนาน", dueAt: new Date(NOW.getTime() + 3 * 3600_000), assigneeUserId: U.pook, createdById: U.owner });
  const noAssignee = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 ไม่มีคนรับ", dueAt: new Date(NOW.getTime() + 30 * 60_000), createdById: U.owner });
  const done = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 เสร็จแล้ว", dueAt: new Date(NOW.getTime() + 30 * 60_000), assigneeUserId: U.pook, createdById: U.owner });
  for (const c of [soon, later, noAssignee, done]) await cards.updateCardFields(ctxOf(U.owner), c.id, { reminderMinutesBefore: 60 });
  await prisma.kanbanCard.update({ where: { id: done.id }, data: { completedAt: new Date() } });
  madeCards.push(soon.id, later.id, noAssignee.id, done.id);
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  const r1 = await rm.sweepDueSoonReminders(NOW);
  const r2 = await rm.sweepDueSoonReminders(NOW);
  const soonRow = (await prisma.kanbanCard.findUnique({ where: { id: soon.id } }))!;
  const laterRow = (await prisma.kanbanCard.findUnique({ where: { id: later.id } }))!;
  const ob = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, type: "kanban.card.due_soon", idempotencyKey: `kanban.due_soon.${soon.id}.${soon.dueAt.toISOString()}` } });
  chk("K2.11-S5.1", "🔴 sweepDueSoonReminders(now) → เตือนการ์ดที่ dueAt - reminderMinutesBefore ≤ now (2 ใบ: ใกล้กำหนด + ไม่มีคนรับ) · 'อีกนาน' (3 ชม.) ไม่เตือน · เสร็จแล้วไม่เตือน · claim ด้วย reminderSentAt (รันซ้ำ = 0) · outbox kanban.card.due_soon key kanban.due_soon.{cardId}.{dueAtISO}", r1 === 2 && r2 === 0 && soonRow.reminderSentAt !== null && laterRow.reminderSentAt === null && !!ob, "2 แล้ว 0", `${r1}/${r2} · sent=${!!soonRow.reminderSentAt} later=${!!laterRow.reminderSentAt} outbox=${!!ob}`);
  const dP = await notifCount(U.pook, /ใกล้ถึงกำหนด|ใกล้กำหนด/, "QC K2.11 ใกล้กำหนด"); const dO = await notifCount(U.owner, /ใกล้ถึงกำหนด|ใกล้กำหนด/, "QC K2.11 ไม่มีคนรับ");
  chk("K2.11-S5.2", "ผู้รับผิดชอบทุกคนได้ใบ 'ใกล้ถึงกำหนดส่ง' (pook 1 จากใบใกล้กำหนด · ใบ 'เสร็จแล้ว' ไม่นับ) · ไม่มีผู้รับผิดชอบ → ผู้สร้าง (owner 1)", dP === 1 && dO === 1, "1/1", `${dP}/${dO}`);
  await cards.updateCardFields(ctxOf(U.owner), soon.id, { dueAt: new Date(NOW.getTime() + 24 * 3600_000) });
  chk("K2.11-S5.3", "เลื่อนกำหนดส่ง → reminderSentAt ถูกล้าง (จะเตือนรอบใหม่ได้)", ((await prisma.kanbanCard.findUnique({ where: { id: soon.id } }))!).reminderSentAt === null, "null", "ยังมีค่า");

  // ═══ S6 cron เลยกำหนด (รายวัน) ═══
  const od = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.11 เลยกำหนด", dueAt: kq.dayFromToday(-1, 18), assigneeUserId: U.pook, createdById: U.owner });
  madeCards.push(od.id);
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.card.overdue" } });
  const o1 = await rm.sweepOverdue(NOW);
  const o2 = await rm.sweepOverdue(kq.dayFromToday(0, 22));
  const obO = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: `kanban.overdue.${od.id}.2026-09-30` } });
  const oP = await notifCount(U.pook, /เลยกำหนด/, "QC K2.11 เลยกำหนด");
  chk("K2.11-S6.1", "🔴 sweepOverdue(now) → การ์ดค้างที่ dueAt < วันนี้ (ไทย) ยิง outbox kanban.card.overdue key kanban.overdue.{cardId}.{yyyy-mm-dd} + ใบ 'เลยกำหนดส่ง' ให้ผู้รับผิดชอบ 1 ครั้ง/การ์ด/วัน · รันซ้ำวันเดียวกัน = ไม่เพิ่ม (คืน 0) · payload มี overdueDays ≥ 1", o1 >= 1 && o2 === 0 && !!obO && (obO.payload as Any).overdueDays >= 1 && oP === 1, "≥1 แล้ว 0 · pook 1", `${o1}/${o2} · outbox=${!!obO} · pook=${oP}`);
  const o3 = await rm.sweepOverdue(kq.dayFromToday(1, 10));
  chk("K2.11-S6.2", "วันถัดไป → key ใหม่ (…2026-10-01) ยิงอีกครั้ง · ไม่ push (§7.4) · ผู้ดูแลบอร์ดที่ถูกเชิญชัด (ADMIN) ได้ใบด้วย — D20: ไม่รวม OWNER โดยนัย", o3 >= 1 && !!(await prisma.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: `kanban.overdue.${od.id}.2026-10-01` } })) && (await notifCount(U.owner, /เลยกำหนด/, "QC K2.11 เลยกำหนด")) === 0, "≥1 · owner 0", `${o3} · owner=${await notifCount(U.owner, /เลยกำหนด/, "QC K2.11 เลยกำหนด")}`);

  // ═══ S7 อีเมลสรุป (digest) ═══
  await prefs.setUserPreferences(U.pook, { kanbanDigest: "DAILY" });
  await prefs.setUserPreferences(U.thana, { kanbanDigest: "OFF" });
  await prefs.setUserPreferences(U.kitti, { kanbanDigest: "WEEKLY" });
  await P.kanbanDigestSent.deleteMany({ where: { tenantId: tid } });
  emails.length = 0;
  const g1 = await dg.sweepKanbanDigest(NOW, sink);
  const g2 = await dg.sweepKanbanDigest(kq.dayFromToday(0, 23), sink);
  const pookMail = emails.find((e) => e.to === pookEmail);
  chk("K2.11-S7.1", "🔴 sweepKanbanDigest(now, deps) → DAILY: pook ได้ 1 ฉบับ (หัวเรื่องมี 'สรุปงาน' · เนื้อหามี เลยกำหนด/วันนี้/สัปดาห์นี้ + ชื่อการ์ดเลยกำหนด) · thana OFF = เงียบ · kitti WEEKLY วันพุธ = ไม่ส่ง · KanbanDigestSent(daily:2026-09-30) · รันซ้ำวันเดียวกัน = 0", g1 === 1 && g2 === 0 && !!pookMail && /สรุปงาน/.test(pookMail.subject) && /เลยกำหนด/.test(pookMail.text) && pookMail.text.includes("QC K2.11 เลยกำหนด") && !emails.some((e) => e.to !== pookEmail) && (await P.kanbanDigestSent.count({ where: { tenantId: tid, userId: U.pook, periodKey: "daily:2026-09-30" } })) === 1, "1 แล้ว 0 · เฉพาะ pook", `${g1}/${g2} · ${emails.map((e) => e.to).join(",")}`);
  emails.length = 0;
  const g3 = await dg.sweepKanbanDigest(kq.dayFromToday(5, 6), sink); // จันทร์ 5 ต.ค. 06:00
  const kittiEmail = (await prisma.user.findUnique({ where: { id: U.kitti } }))!.email;
  chk("K2.11-S7.2", "วันจันทร์ → WEEKLY (kitti) ได้ 1 ฉบับ periodKey weekly:2026-10-05 · DAILY (pook) ได้อีก 1 (daily:2026-10-05) · noPerm (ไม่มีสิทธิ์บอร์ดงาน) ไม่ได้", g3 === 2 && emails.some((e) => e.to === kittiEmail) && emails.some((e) => e.to === pookEmail) && (await P.kanbanDigestSent.count({ where: { tenantId: tid, userId: U.kitti, periodKey: "weekly:2026-10-05" } })) === 1 && !(await P.kanbanDigestSent.findFirst({ where: { tenantId: tid, userId: U.noPerm } })), "2 ฉบับ", `${g3} · ${emails.map((e) => e.to).join(",")}`);
  chk("K2.11-S7.3", "digest ส่งเฉพาะคนที่มีอะไรจะบอก (ค้าง/เลยกำหนด/ถึงกำหนด/ได้รับมอบใหม่ ≥ 1 รายการ) — คนว่างไม่ได้อีเมลเปล่า · ห้าม LINE/Telegram (D5)", /มีอะไร|nothing|empty|length === 0|ไม่มีรายการ/.test(read("src/lib/modules/kanban/digest.ts")) && !/telegram|line\.me/i.test(read("src/lib/modules/kanban/digest.ts")), "มีด่านว่าง", "ไม่มี", "MAJOR");

  // ═══ S8 ค่าตั้งของคน (core user-preferences) ═══
  const parsed = prefs.parsePreferences({ kanbanEmailMode: "WEIRD", kanbanDigest: "WEEKLY", navCollapsed: true });
  const defaults = prefs.parsePreferences(null);
  chk("K2.11-S8.1", "UserPreferences เพิ่ม kanbanEmailMode ∈ OFF|HOURLY|INSTANT (ปริยาย HOURLY) · kanbanDigest ∈ OFF|DAILY|WEEKLY (ปริยาย DAILY) · ค่าแปลก → ปริยาย · patch ไม่ทับคีย์อื่น", parsed.kanbanEmailMode === "HOURLY" && parsed.kanbanDigest === "WEEKLY" && parsed.navCollapsed === true && defaults.kanbanEmailMode === "HOURLY" && defaults.kanbanDigest === "DAILY" && (await prefs.getUserPreferences(U.pook)).kanbanEmailMode === "HOURLY", "ปริยาย HOURLY/DAILY", JSON.stringify({ parsed, defaults }));

  // ═══ S9 wiring + UI (static) ═══
  const hourly = read("src/app/api/cron/hourly/route.ts"); const cron = read("src/lib/platform/cron.ts");
  chk("K2.11-S9.1", "cron: hourly route เรียก sweepDueSoonReminders + sweepKanbanEmailHourly (best-effort ไม่ทำรอบแดง) · runDailyCron เรียก sweepOverdue + sweepKanbanDigest ใน try/catch แยก + คืนค่า · ไม่แก้ vercel.json", /sweepDueSoonReminders/.test(hourly) && /sweepKanbanEmailHourly/.test(hourly) && /sweepOverdue\(now\)/.test(cron) && /sweepKanbanDigest\(now\)/.test(cron) && !/kanban/i.test(read("vercel.json")), "ครบ", "ขาด");
  chk("K2.11-S9.2", "AUTOMATION_EVENTS เพิ่ม kanban.card.due_soon + kanban.card.overdue (ป้ายไทย) · consumer ทั้งคู่มีอยู่แล้วใน outbox-consumers", /kanban\.card\.due_soon/.test(read("src/lib/automation/labels.ts")) && /kanban\.card\.overdue/.test(read("src/lib/automation/labels.ts")) && /"kanban\.card\.due_soon"/.test(read("src/lib/outbox-consumers.ts")) && /"kanban\.card\.overdue"/.test(read("src/lib/outbox-consumers.ts")), "ครบ", "ขาด");
  const cb = read("src/components/kanban/CardBack.tsx"); const bh = read("src/components/kanban/BoardHeader.tsx"); const colc = read("src/components/kanban/Column.tsx"); const mt = read("src/components/kanban/MyTasks.tsx");
  chk("K2.11-S9.3", "UI: หลังการ์ดปุ่ม 👁 'ติดตาม/เลิกติดตาม' testid card-watch · เมนูคอลัมน์ 'ติดตามคอลัมน์' testid column-watch · หัวบอร์ด 'ติดตามบอร์ด' testid board-watch · งานของฉันบล็อก 'ที่ฉันติดตาม (ไม่ได้รับผิดชอบ)' testid my-watched", cb.includes("card-watch") && colc.includes("column-watch") && bh.includes("board-watch") && mt.includes("my-watched") && /ที่ฉันติดตาม/.test(mt), "ครบ", "ขาด");
  const np = read("src/components/kanban/NotifyPrefs.tsx") + read("src/app/app/sys/[id]/kanban/settings/page.tsx");
  chk("K2.11-S9.4", "ตั้งค่า › 'การแจ้งเตือนของฉัน' testid notify-prefs (NotifyPrefs.tsx): อีเมลแจ้งเตือน 3 ตัวเลือก (ไม่ส่ง / สรุปรายชั่วโมง / ทันที) + อีเมลสรุป 3 ตัวเลือก (ไม่ส่ง / ทุกวัน / ทุกสัปดาห์) + บรรทัด 'การ @กล่าวถึง/มอบหมาย/เชิญเข้าบอร์ด แจ้งทันทีเสมอ ปิดไม่ได้' · action setKanbanNotifyPrefsAction · actions watchAction/unwatchAction", np.includes("notify-prefs") && /สรุปรายชั่วโมง/.test(np) && /ทุกสัปดาห์/.test(np) && /ปิดไม่ได้/.test(np) && /setKanbanNotifyPrefsAction/.test(np + read("src/lib/modules/kanban/actions.ts")) && /watchAction/.test(read("src/lib/modules/kanban/actions.ts")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.11") ? readdirSync(".qc-shots/kanban/2.11").filter((f) => f.endsWith(".png")) : [];
  chk("K2.11-S9.5", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/2.11 (ปุ่มติดตามบนหลังการ์ด · ตั้งค่าการแจ้งเตือน · งานของฉันบล็อกที่ฉันติดตาม)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      await P.kanbanWatcher.deleteMany({ where: { tenantId: tid } }).catch(() => null);
      await P.kanbanDigestSent.deleteMany({ where: { tenantId: tid } }).catch(() => null);
      const ids = madeCards.filter(Boolean);
      if (ids.length) { await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: { in: ["kanban.card.due_soon", "kanban.card.overdue", "kanban.comment.added", "kanban.card.moved", "kanban.card.archived", "kanban.card.created", "kanban.card.assigned"] }, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => null);
      if (patong) await P.kanbanBoardMember.deleteMany({ where: { boardId: patong } });
      for (const [id, prefsRaw] of prefsBackup) await prisma.user.update({ where: { id }, data: { prefs: (prefsRaw ?? {}) as Any } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.11 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
