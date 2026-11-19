// QC — CAL1.5 `calendar.brief` สรุปเช้า/เย็น (สัญญา §6 · §7.2 · §4.6 · R-CAL-30/31) — นาฬิกาปลอม + transport ปลอม
//   P1 briefLines/briefPushParts บริสุทธิ์ (กลุ่ม · ลำดับ · ตัด 4 · count · กำหนดยื่น · google) · P2 pickPrimaryTenant
//   B1 ตั้ง 07:15 → ได้ 07:15 ครั้งเดียว · B2 2 กิจการ = 2 ข้อความ · B3 ปิด = ไม่ได้ · B4 วันว่าง = 0 (แต่จอง) · B5 เลยหน้าต่าง 90 น. = ข้าม
//   B6 เย็น = ของพรุ่งนี้ · B7 payload §7.2 · B8 120 คนเวลาเดียวกัน ≤ 3 รอบ · B9 ลงทะเบียน
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.5.mts
import { chk, errMsg, fakePush, finish, guard, makeFixture, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.5";
guard(LABEL);
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
const brief = (await import("@/lib/modules/calendar/brief")) as AnyMod;
const summary = (await import("@/lib/modules/calendar/summary")) as AnyMod;

const T = (s: string) => new Date(`${s}+07:00`);
const ai = (o: AnyMod) => ({ id: o.id, source: o.source, title: o.title ?? "x", sub: null, label: "", startAt: o.startAt, allDay: !!o.allDay, timeHint: null, deepLink: null, checkable: false, done: !!o.done, mine: true, colorKey: o.colorKey ?? o.source, ...(o.summary ? { summary: o.summary } : {}) });

console.log("── P1: briefLines (บริสุทธิ์) ──");
{
  const day = "2026-11-16";
  const its = [
    ai({ id: "booking:1", source: "booking", startAt: T("2026-11-16T11:00").toISOString() }),
    ai({ id: "booking:2", source: "booking", startAt: T("2026-11-16T09:30").toISOString() }),
    ai({ id: "account:due:s:2026-11-16", source: "account", title: "ใบแจ้งหนี้ครบกำหนด 2 ใบ", startAt: T("2026-11-16T00:00").toISOString(), allDay: true, summary: { count: 2, amountSatang: 1_840_000 } }),
    ai({ id: "reminder:r1", source: "reminder", title: "โทรหาคุณเอก", colorKey: "remind", startAt: T("2026-11-16T15:00").toISOString() }),
    ai({ id: "reminder:r2", source: "reminder", title: "เสร็จแล้ว", colorKey: "remind", startAt: T("2026-11-16T08:00").toISOString(), done: true }),
    ai({ id: "kanban:1", source: "kanban", startAt: T("2026-11-16T17:00").toISOString() }),
    ai({ id: "google:1", source: "google", startAt: T("2026-11-16T07:00").toISOString() }),
    ai({ id: "reminder:other-day", source: "reminder", startAt: T("2026-11-17T09:00").toISOString() }),
  ];
  const tax = [ai({ id: "tax:pp30", source: "tax", title: "ยื่น ภ.พ.30 เดือน ต.ค.", colorKey: "account", startAt: T("2026-11-19T00:00").toISOString(), allDay: true }), ai({ id: "tax:far", source: "tax", title: "ไกล", startAt: T("2026-11-30T00:00").toISOString(), allDay: true })];
  const r = summary.briefLines(its, day, T("2026-11-16T07:00"), { upcomingTax: tax });
  chk("P1-1", "4 บรรทัดแรกตามลำดับ: บัตรคิว (คิวแรก 09:30) · บัญชี (รวม ฿18,400) · เตือนรายตัว · การ์ดงาน", r.lines.length === 4 && r.lines[0].text === "นัดลูกค้า 2 คิว" && r.lines[0].rightText === "คิวแรก 09:30" && r.lines[1].text === "ใบแจ้งหนี้ครบกำหนด 2 ใบ" && r.lines[1].rightText === "฿18,400" && r.lines[2].text === "โทรหาคุณเอก" && r.lines[2].rightText === "15:00" && r.lines[3].text === "การ์ดงานครบกำหนด 1 ใบ", JSON.stringify(r.lines));
  chk("P1-2", "count = รายการจริง (2 คิว + 2 ใบ + 1 เตือน + 1 การ์ด + 1 ภาษี + 1 google = 8) · ตัด done/วันอื่น · more", r.count === 8 && r.more === true, String(r.count));
  const parts = summary.briefPushParts(its, day, { upcomingTax: tax });
  chk("P1-3", "push (ภาพจอ 1): นัดลูกค้า 2 คิว (คิวแรก 09:30) · ใบแจ้งหนี้ครบกำหนด 2 ใบ รวม ฿18,400 · … · อีก 3 วันยื่น ภ.พ.30 … · เตือนของคุณ 1 รายการ", parts[0] === "นัดลูกค้า 2 คิว (คิวแรก 09:30)" && parts[1] === "ใบแจ้งหนี้ครบกำหนด 2 ใบ รวม ฿18,400" && parts.includes("อีก 3 วันยื่น ภ.พ.30 เดือน ต.ค.") && parts[parts.length - 1] === "เตือนของคุณ 1 รายการ" && parts.includes("นัดในปฏิทินส่วนตัว 1 นัด") && !parts.some((p: string) => p.includes("ไกล")), JSON.stringify(parts));
  const ng = summary.briefPushParts(its, day, { upcomingTax: tax, includeGoogle: false });
  chk("P1-4", "includeGoogle=false (ไม่ใช่กิจการหลัก) ตัด google (R-CAL-31)", !ng.some((p: string) => p.includes("ปฏิทินส่วนตัว")));
  chk("P1-5", "วันว่าง = ไม่มีบรรทัด · count 0", summary.briefLines([its[4]], day, T("2026-11-16T07:00")).lines.length === 0 && summary.briefPushParts([], day).length === 0);
  const today = summary.briefPushParts([], day, { upcomingTax: [ai({ id: "tax:t", source: "tax", title: "ยื่น ภ.ง.ด.3", startAt: T("2026-11-16T00:00").toISOString(), allDay: true })] });
  chk("P1-6", "กำหนดยื่นวันนี้ = \"วันนี้…\" · dateLabel จ. 16 พ.ย.", today[0] === "วันนี้ยื่น ภ.ง.ด.3" && summary.dateLabel("2026-11-16") === "จ. 16 พ.ย.");
}
console.log("── P2: pickPrimaryTenant ──");
{
  const mem = [{ tenantId: "tB", createdAt: new Date(1) }, { tenantId: "tA", createdAt: new Date(2) }];
  chk("P2-1", "ไม่มีแถว = ค่าเริ่ม (ทุกร้าน 08:00) → tenantId น้อยสุด", brief.pickPrimaryTenant("morning", mem, []) === "tA");
  chk("P2-2", "นาทีน้อยสุดชนะ", brief.pickPrimaryTenant("morning", mem, [{ tenantId: "tB", morningOn: true, morningMinute: 435, eveningOn: false, eveningMinute: 1140 }]) === "tB");
  chk("P2-3", "เย็นปิดทุกร้าน → สมาชิกภาพแรกตาม createdAt · ไม่มีสมาชิก = null", brief.pickPrimaryTenant("evening", mem, []) === "tB" && brief.pickPrimaryTenant("morning", [], []) === null);
}

const fx = await makeFixture(prisma, "qccal15", { a: { role: "OWNER" }, b: { role: "OWNER" }, c: { role: "OWNER" }, d: { role: "OWNER" }, e: { role: "OWNER" } }, 2);
const [t1, t2] = fx.tids;
const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const act = (u: string, t: string) => ({ userId: fx.U[u], tenantId: t, membership: OWNER_M });
const fp = fakePush();
const extra: string[] = [];
const run = (now: Date, users = Object.values(fx.U)) => brief.runCalendarBrief(now, { deadline: Date.now() + 60_000, deps: { post: fp.post, scope: { userIds: [...users] } } });
const pref = (u: string, t: string, o: AnyMod) => prisma.calPref.upsert({ where: { userId_tenantId: { userId: fx.U[u], tenantId: t } }, create: { userId: fx.U[u], tenantId: t, ...o }, update: o });
let residue = -1;
try {
  const DAY = "2027-03-10";
  const D = (hm: string) => T(`${DAY}T${hm}`);
  for (const u of Object.keys(fx.U)) await prisma.pushDevice.create({ data: { userId: fx.U[u], tenantId: t1, expoToken: `ExponentPushToken[qccal15-${fx.U[u]}]`, platform: "ios" } });
  // a: ร้าน 1 ตั้ง 07:15 · ร้าน 2 ค่าเริ่ม 08:00 · มีเตือนวันนี้ทั้งสองร้าน
  await pref("a", t1, { morningMinute: 435 });
  await items.createItem(act("a", t1), { kind: "REMINDER", title: "โทรหาคุณเอก", startAt: D("15:00") }, { now: D("06:00") });
  await items.createItem(act("a", t2), { kind: "REMINDER", title: "ตรวจมิเตอร์น้ำ", startAt: D("10:00") }, { now: D("06:00") });
  // b: ปิดเช้าทั้งสองร้าน (มีเตือน)
  await pref("b", t1, { morningOn: false }); await pref("b", t2, { morningOn: false });
  await items.createItem(act("b", t1), { kind: "REMINDER", title: "ของ b", startAt: D("15:00") }, { now: D("06:00") });
  // c: วันว่าง (ไม่มีอะไรเลย) — เปิดเฉพาะร้าน 1
  await pref("c", t2, { morningOn: false });
  // d: ตั้ง 07:15 แต่ราง minute กลับมาตอน 08:50 (เลย 90 นาที) — ปิดร้าน 2
  await pref("d", t1, { morningMinute: 435 }); await pref("d", t2, { morningOn: false });
  await items.createItem(act("d", t1), { kind: "REMINDER", title: "ของ d", startAt: D("15:00") }, { now: D("06:00") });
  // e: ปิดเช้า · เปิดเย็น 19:00 ร้าน 1 · เตือนวันนี้ + พรุ่งนี้
  await pref("e", t1, { morningOn: false, eveningOn: true, eveningMinute: 1140 }); await pref("e", t2, { morningOn: false });
  await items.createItem(act("e", t1), { kind: "REMINDER", title: "ของวันนี้", startAt: D("20:00") }, { now: D("06:00") });
  await items.createItem(act("e", t1), { kind: "REMINDER", title: "ของพรุ่งนี้", startAt: T("2027-03-11T09:00") }, { now: D("06:00") });

  console.log("── B1/B2/B3/B4/B5: เช้า ──");
  fp.clear();
  await run(D("07:14"));
  chk("B1-1", "07:14 = ยังไม่ส่ง", fp.sent.length === 0);
  const r715 = await run(D("07:15"));
  const toA = fp.sent.filter((s) => s.to.includes(fx.U.a));
  chk("B1-2", "07:15 = a ได้สรุปของร้าน 1 (1 ข้อความ)", toA.length === 1 && toA[0].data?.tenantId === t1, JSON.stringify(r715));
  await run(D("07:16")); await run(D("07:30"));
  chk("B1-3", "07:16/07:30 ไม่ส่งซ้ำ", fp.sent.filter((s) => s.to.includes(fx.U.a) && s.data?.tenantId === t1).length === 1);
  await run(D("08:00"));
  const aAll = fp.sent.filter((s) => s.to.includes(fx.U.a));
  chk("B2-1", "08:00 = a ได้สรุปของร้าน 2 · รวม 2 กิจการ = 2 ข้อความ (ชื่อกิจการต่างกัน)", aAll.length === 2 && aAll[1].data?.tenantId === t2 && aAll[0].title !== aAll[1].title);
  chk("B3-1", "b ปิดเช้า = ไม่ได้", fp.sent.filter((s) => s.to.includes(fx.U.b)).length === 0);
  const cPref = await prisma.calPref.findFirst({ where: { userId: fx.U.c, tenantId: t1 } });
  chk("B4-1", "c วันว่าง = ไม่ส่ง แต่จองวันนี้แล้ว (แถว CalPref ถูกสร้าง · ค่าเริ่ม M2)", fp.sent.filter((s) => s.to.includes(fx.U.c)).length === 0 && cPref?.lastMorningDay === DAY && cPref?.morningMinute === 480);
  // d: ราง minute ล่มตั้งแต่ 07:00 (ข้อสอบนี้ไม่ได้รัน d ก่อน 08:50) — ใช้ scope เฉพาะ d
  fp.clear();
  // ล้างการจองของ d ที่อาจเกิดจากรอบ 07:15 ข้างบน แล้วจำลองว่าราง minute ล่มจนถึง 08:50
  await prisma.calPref.updateMany({ where: { userId: fx.U.d }, data: { lastMorningDay: null } });
  await run(D("08:50"), [fx.U.d]);
  const dp = await prisma.calPref.findFirst({ where: { userId: fx.U.d, tenantId: t1 } });
  chk("B5-1", "เลยหน้าต่าง 90 นาที (07:15 → 08:50) = ไม่ส่ง · ไม่จอง", fp.sent.length === 0 && dp?.lastMorningDay === null);
  await run(D("08:45"), [fx.U.d]);
  chk("B5-2", "ในหน้าต่าง (08:45 = +90) = ส่ง", fp.sent.length === 1);

  console.log("── B6/B7: เย็น + payload ──");
  fp.clear();
  await run(D("19:00"));
  const ev = fp.sent.filter((s) => s.to.includes(fx.U.e));
  chk("B6-1", "เย็น 19:00 = ของพรุ่งนี้ (\"🌙 พรุ่งนี้ · …\") · ไม่รวมของวันนี้", ev.length === 1 && ev[0].title.startsWith("🌙 พรุ่งนี้ · ") && ev[0].body === "เตือนของคุณ 1 รายการ" && ev[0].data?.link === "/secretary/calendar?day=2027-03-11", JSON.stringify(ev[0]));
  chk("B6-2", "คนที่ไม่ได้เปิดเย็น (ค่าเริ่มปิด) ไม่ได้", fp.sent.every((s) => s.to.includes(fx.U.e)));
  const m = aAll[0];
  const tn = (await prisma.tenant.findUnique({ where: { id: t1 } })).name;
  chk("B7-1", "payload §7.2: title ☀️ สรุปวันนี้ · <ชื่อกิจการ> · data {type cal_brief, link day, tenantId} · ไม่มี categoryId/badge · body ≤178", m.title === `☀️ สรุปวันนี้ · ${tn}` && m.data?.type === "cal_brief" && m.data?.link === `/secretary/calendar?day=${DAY}` && !("categoryId" in m) && !("badge" in m) && m.body.length <= 178 && m.body === "เตือนของคุณ 1 รายการ", JSON.stringify(m));
  chk("B7-2", "เปลี่ยนเวลาเป็นเวลาที่ยังไม่ถึงหลังจองแล้ว = พรุ่งนี้ (วันนี้ไม่ได้ซ้ำ)", await (async () => { await pref("a", t1, { morningMinute: 600 }); fp.clear(); await run(D("10:00"), [fx.U.a]); return fp.sent.length === 0; })());

  console.log("── B8: 120 คนเวลาเดียวกัน ──");
  const many: string[] = [];
  for (let i = 0; i < 120; i++) many.push(`qccal15-m${i}-${fx.STAMP}`);
  await prisma.user.createMany({ data: many.map((id) => ({ id, email: `${id}@example.com`, name: id })) });
  extra.push(...many);
  await prisma.membership.createMany({ data: many.map((id) => ({ tenantId: t1, userId: id, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() })) });
  await prisma.pushDevice.createMany({ data: many.map((id) => ({ userId: id, tenantId: t1, expoToken: `ExponentPushToken[${id}]`, platform: "ios" })) });
  const r1 = await run(D("08:00"), many);
  const r2 = await run(D("08:01"), many);
  const r3 = await run(D("08:02"), many);
  const claimed = await prisma.calPref.count({ where: { userId: { in: many }, lastMorningDay: DAY } });
  chk("B8-1", "ชุดละ ≤ 50 · 120 คนจองครบใน 3 รอบ", r1.claimed === 50 && r2.claimed === 50 && r3.claimed === 20 && claimed === 120, JSON.stringify([r1, r2, r3]));

  console.log("── B9: ลงทะเบียน ──");
  await import("@/lib/modules/calendar/jobs");
  const reg = (globalThis as unknown as Record<symbol, AnyMod>)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, AnyMod>;
  const job = reg?.get("calendar.brief");
  chk("B9-1", "registerMinuteJob calendar.brief everyMinutes 1 · ownBudgetMs 6000", job?.everyMinutes === 1 && job?.ownBudgetMs === 6000);
} catch (e) {
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  try {
    await prisma.calPref.deleteMany({ where: { userId: { in: extra } } });
    await prisma.pushDevice.deleteMany({ where: { userId: { in: extra } } });
    await prisma.membership.deleteMany({ where: { userId: { in: extra } } });
    await prisma.user.deleteMany({ where: { id: { in: extra } } });
  } catch { /* */ }
  residue = await fx.cleanup();
  residue += await prisma.user.count({ where: { id: { in: extra } } });
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
