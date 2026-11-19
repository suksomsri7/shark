// QC — CAL1.4 minute job `calendar.fire` (สัญญา §5.6 · §7.1 · R-CAL-11/12/13/22/34) — นาฬิกาปลอม + transport push ปลอม
//   F1 ยิงตรงเวลา 1 ครั้ง + payload ตามสัญญา · F2 ซ้ำนาทีเดิม = 0 · F3 ย้ำ 1 ครั้งหลัง 30 นาทีแล้วจบ · F4 2 รอบซ้อน = ส่ง 1
//   F5 เสร็จ/เลื่อน/แก้ ระหว่างจอง = 0 · F6 WEEKLY ข้ามเดือน · F7 MONTHLY 31 → ก.พ. · F8 transport ล้ม 2 แล้วสำเร็จ = 1 · F9 ล้ม 3 = เลิก
//   F10 ถอนสิทธิ์ = ไม่ยิง · F11 link: body ข้อมูลล่าสุด เบอร์ปิด · SEC_CAL_CALL · F12 เก็บกวาด · F13 push.ts categoryId additive
//   F14 ลงทะเบียน + import ใน crm-cron/outbox route · F15 ไม่แตะระบบอื่น (โครงสร้าง)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.4.mts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chk, errMsg, fakePush, finish, guard, makeFixture, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.4";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
guard(LABEL);
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
const fire = (await import("@/lib/modules/calendar/fire")) as AnyMod;
const push = (await import("@/lib/core/push")) as AnyMod;

const T = (s: string) => new Date(`${s}+07:00`);
const MIN = 60_000;
const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const fx = await makeFixture(prisma, "qccal14", { a: { role: "OWNER" }, b: { role: "STAFF" } });
const [tid] = fx.tids;
const A = { userId: fx.U.a, tenantId: tid, membership: OWNER_M };
const B = { userId: fx.U.b, tenantId: tid, membership: { role: "STAFF", unitAccess: ["*"], permissions: {} } };
const fp = fakePush();
// ทุกรอบจำกัดแถวที่ข้อสอบข้อนั้นสนใจ (นาฬิกาปลอมเดินหน้า → แถวของข้ออื่นถึงเวลาด้วย)
const run = (now: Date, ids: string[], extra: AnyMod = {}) => fire.runCalendarFire(now, { deadline: Date.now() + 30_000, deps: { post: fp.post, scope: { userIds: [fx.U.a, fx.U.b], itemIds: ids }, ...extra } });
const row = (id: string) => prisma.calItem.findUnique({ where: { id } });
const eq = (a: Date | null | undefined, b: Date | null | undefined) => (a == null && b == null) || (!!a && !!b && +a === +b);
const seedTouched: string[] = [];
let residue = -1;
try {
  for (const u of [fx.U.a, fx.U.b]) await prisma.pushDevice.create({ data: { userId: u, tenantId: tid, expoToken: `ExponentPushToken[qccal14-${u}]`, platform: "ios" } });
  const T0 = T("2026-12-01T09:00");

  console.log("── F1/F2/F3: ยิง · ซ้ำ · ย้ำ ──");
  const it = await items.createItem(A, { kind: "REMINDER", title: "โทรหาคุณเอก เรื่องมัดจำเรือ", startAt: new Date(+T0 + 10 * MIN) }, { now: T0 });
  fp.clear();
  const r0 = await run(new Date(+T0 + 5 * MIN), [it.id]);
  chk("F1-1", "ก่อนเวลา = ไม่ยิง", fp.sent.length === 0 && r0.claimed === 0);
  const r1 = await run(new Date(+T0 + 10 * MIN), [it.id]);
  const p = fp.sent[0] ?? {};
  chk("F1-2", "ถึงเวลา = ส่ง 1 ใบ", r1.sent === 1 && fp.sent.length === 1, JSON.stringify(r1));
  chk("F1-3", "payload §7.1: title 🔔 · data {type cal, link, tenantId, itemId, occ} · categoryId SEC_CAL · ไม่มี badge", p.title === "🔔 โทรหาคุณเอก เรื่องมัดจำเรือ" && p.data?.type === "cal" && p.data?.itemId === it.id && p.data?.tenantId === tid && p.data?.occ === new Date(+T0 + 10 * MIN).toISOString() && p.data?.link === `/secretary/calendar?day=2026-12-01&item=${it.id}` && p.categoryId === "SEC_CAL" && !("badge" in p) && p.body === "09:10 · เตือนฉัน", JSON.stringify(p));
  const rw = await row(it.id);
  chk("F1-4", "หลังยิง: firedOccAt=occ · nagAt=+30น. · nextFireAt=nag · lease ปล่อย · version ไม่เปลี่ยน", eq(rw.firedOccAt, rw.occursAt) && eq(rw.nagAt, new Date(+T0 + 40 * MIN)) && eq(rw.nextFireAt, rw.nagAt) && rw.leaseToken === null && rw.leaseUntil === null && rw.version === 0);
  fp.clear();
  await run(new Date(+T0 + 10 * MIN), [it.id]);
  await run(new Date(+T0 + 11 * MIN), [it.id]);
  chk("F2-1", "รันซ้ำนาทีเดิม/นาทีถัดไป = 0", fp.sent.length === 0);
  await run(new Date(+T0 + 40 * MIN), [it.id]);
  chk("F3-1", "30 นาทีไม่กด → ย้ำ 1 ครั้ง (title 🔔 ย้ำ:)", fp.sent.length === 1 && fp.sent[0].title === "🔔 ย้ำ: โทรหาคุณเอก เรื่องมัดจำเรือ" && fp.sent[0].data?.occ === new Date(+T0 + 10 * MIN).toISOString());
  await run(new Date(+T0 + 75 * MIN), [it.id]);
  await run(new Date(+T0 + 600 * MIN), [it.id]);
  const rw2 = await row(it.id);
  chk("F3-2", "ย้ำแล้วไม่ย้ำอีก · nextFireAt null · ยัง OPEN", fp.sent.length === 1 && rw2.nextFireAt === null && rw2.status === "OPEN");

  console.log("── F4: 2 รอบซ้อน ──");
  const it4 = await items.createItem(A, { kind: "REMINDER", title: "ซ้อน", startAt: new Date(+T0 + 20 * MIN) }, { now: T0 });
  fp.clear();
  const [x1, x2] = await Promise.all([run(new Date(+T0 + 20 * MIN), [it4.id]), run(new Date(+T0 + 20 * MIN), [it4.id])]);
  chk("F4-1", "2 รอบพร้อมกัน = ส่ง 1 · จองได้ฝั่งเดียว", fp.sent.filter((s) => s.data?.itemId === it4.id).length === 1 && x1.claimed + x2.claimed === 1, JSON.stringify([x1, x2]));

  console.log("── F5: ผู้ใช้แก้ระหว่างจอง ──");
  const it5 = await items.createItem(A, { kind: "REMINDER", title: "เสร็จระหว่างรอ", startAt: new Date(+T0 + 30 * MIN) }, { now: T0 });
  fp.clear();
  const r5 = await run(new Date(+T0 + 30 * MIN), [it5.id], { afterClaim: async () => { await items.markDone(A, it5.id, { now: new Date(+T0 + 30 * MIN) }); } });
  const rw5 = await row(it5.id);
  chk("F5-1", "เสร็จระหว่างจอง = ไม่ส่ง · DONE คงอยู่", fp.sent.length === 0 && r5.skipped === 1 && rw5.status === "DONE" && rw5.firedOccAt === null, JSON.stringify(r5));
  const it6 = await items.createItem(A, { kind: "REMINDER", title: "เลื่อนระหว่างรอ", startAt: new Date(+T0 + 31 * MIN) }, { now: T0 });
  await run(new Date(+T0 + 31 * MIN), [it6.id], { afterClaim: async () => { await items.snooze(A, it6.id, { preset: "1h" }, new Date(+T0 + 31 * MIN)); } });
  const rw6 = await row(it6.id);
  chk("F5-2", "เลื่อนระหว่างจอง = ไม่ส่ง · ผู้ใช้เลือกเลื่อน ⇒ รอเวลาเลื่อน (+1ชม.) · lease ปล่อย", fp.sent.length === 0 && eq(rw6.snoozeUntil, new Date(+T0 + 91 * MIN)) && eq(rw6.nextFireAt, new Date(+T0 + 91 * MIN)) && rw6.leaseToken === null);
  await run(new Date(+T0 + 34 * MIN), [it6.id]);
  chk("F5-3", "ก่อนเวลาเลื่อน = ไม่ส่ง", fp.sent.length === 0);
  await run(new Date(+T0 + 91 * MIN), [it6.id]);
  const rw6b = await row(it6.id);
  chk("F5-4", "ถึงเวลาเลื่อน → ส่ง 1 (ครอบครั้งปกติที่ค้าง) · ย้ำตามมาอีก 30 น.", fp.sent.length === 1 && fp.sent[0].data?.itemId === it6.id && eq(rw6b.firedOccAt, rw6b.occursAt) && eq(rw6b.nagAt, new Date(+T0 + 121 * MIN)));
  const it7 = await items.createItem(A, { kind: "REMINDER", title: "แก้เวลาระหว่างรอ", startAt: new Date(+T0 + 32 * MIN) }, { now: T0 });
  fp.clear();
  await run(new Date(+T0 + 32 * MIN), [it7.id], { afterClaim: async () => { await items.updateItem(A, it7.id, { startAt: new Date(+T0 + 300 * MIN) }, new Date(+T0 + 32 * MIN)); } });
  chk("F5-5", "แก้เวลาระหว่างจอง = ไม่ส่ง · ตารางใหม่", fp.sent.length === 0 && eq((await row(it7.id)).nextFireAt, new Date(+T0 + 300 * MIN)));

  console.log("── F6/F7: ทำซ้ำข้ามเดือน ──");
  const wk = await items.createItem(A, { kind: "REMINDER", title: "เช็กสต็อกทุกจันทร์", startAt: T("2026-11-30T09:00"), repeat: "WEEKLY", repeatDays: [1] }, { now: T("2026-11-29T12:00") });
  fp.clear();
  await run(T("2026-11-30T09:00"), [wk.id]);
  const w1 = await row(wk.id);
  await run(T("2026-12-07T09:00"), [wk.id]);
  const w2 = await row(wk.id);
  chk("F6-1", "WEEKLY: 30 พ.ย. → 7 ธ.ค. → 14 ธ.ค. · ไม่ย้ำ · ส่ง 2", fp.sent.filter((s) => s.data?.itemId === wk.id).length === 2 && eq(w1.occursAt, T("2026-12-07T09:00")) && eq(w2.occursAt, T("2026-12-14T09:00")) && w2.nagAt === null && eq(w2.nextFireAt, T("2026-12-14T09:00")));
  const mo = await items.createItem(A, { kind: "REMINDER", title: "จ่ายค่าเช่าท่าเรือ", startAt: T("2027-01-31T10:00"), repeat: "MONTHLY" }, { now: T("2027-01-30T10:00") });
  await run(T("2027-01-31T10:00"), [mo.id]);
  const m1 = await row(mo.id);
  await run(T("2027-02-28T10:00"), [mo.id]);
  const m2 = await row(mo.id);
  chk("F7-1", "MONTHLY 31: → 28 ก.พ. → 31 มี.ค.", eq(m1.occursAt, T("2027-02-28T10:00")) && eq(m2.occursAt, T("2027-03-31T10:00")));
  const lateRun = await row(mo.id);
  chk("F7-2", "ครั้งที่ยิงแล้ว = firedOccAt", eq(lateRun.firedOccAt, T("2027-02-28T10:00")));

  console.log("── F8/F9: transport ล้ม ──");
  const T8 = T("2027-04-01T09:00");
  const it8 = await items.createItem(A, { kind: "REMINDER", title: "ล้ม 2 ครั้ง", startAt: T8 }, { now: new Date(+T8 - 60 * MIN) });
  fp.clear(); fp.st.failNext = 2;
  const a1 = await run(T8, [it8.id]);
  const s1 = await row(it8.id);
  chk("F8-1", "ล้มครั้งแรก: คืนสถานะ (ยังไม่ยิง) · nextFireAt +60 วิ · attempts 1", a1.retried === 1 && s1.firedOccAt === null && eq(s1.nextFireAt, new Date(+T8 + MIN)) && s1.fireAttempts === 1, JSON.stringify(a1));
  await run(new Date(+T8 + MIN), [it8.id]);
  const s2 = await row(it8.id);
  await run(new Date(+T8 + 2 * MIN), [it8.id]);
  const s3 = await row(it8.id);
  chk("F8-2", "ล้ม 2 แล้วสำเร็จ = ส่ง 1 · attempts กลับ 0 · ยิงแล้ว", s2.fireAttempts === 2 && fp.sent.length === 1 && s3.fireAttempts === 0 && eq(s3.firedOccAt, T8) && eq(s3.nagAt, new Date(+T8 + 32 * MIN)));
  const it9 = await items.createItem(A, { kind: "REMINDER", title: "ล้ม 3 ครั้ง", startAt: new Date(+T8 + 10 * MIN) }, { now: T8 });
  fp.clear(); fp.st.failNext = 3;
  await run(new Date(+T8 + 10 * MIN), [it9.id]);
  await run(new Date(+T8 + 11 * MIN), [it9.id]);
  const g3 = await run(new Date(+T8 + 12 * MIN), [it9.id]);
  const s9 = await row(it9.id);
  await run(new Date(+T8 + 13 * MIN), [it9.id]);
  chk("F9-1", "ล้มครบ 3 = เลิก (คงสถานะยิงแล้ว · ไม่ลองใหม่) + WARN", g3.gaveUp === 1 && fp.sent.length === 0 && eq(s9.firedOccAt, new Date(+T8 + 10 * MIN)) && eq(s9.nextFireAt, s9.nagAt), JSON.stringify(g3));
  const ops = await prisma.opsEvent.findFirst({ where: { source: "calendar", message: "push ล้ม 3 ครั้ง", createdAt: { gte: new Date(Date.now() - 600_000) } }, orderBy: { createdAt: "desc" } });
  chk("F9-2", "logOps WARN: detail มี itemId ไม่มีชื่อเรื่อง", !!ops && String(ops.detail ?? "").includes(it9.id) && !String(ops.detail ?? "").includes("ล้ม 3 ครั้ง"), JSON.stringify(ops)?.slice(0, 200));

  console.log("── F10: สมาชิกถูกระงับแล้วคืนสิทธิ์ (review M5) ──");
  const itB = await items.createItem(B, { kind: "REMINDER", title: "ของคนที่ถูกระงับ", startAt: new Date(+T8 + 20 * MIN) }, { now: T8 });
  await prisma.membership.updateMany({ where: { userId: fx.U.b, tenantId: tid }, data: { acceptedAt: null } });
  fp.clear();
  const r10 = await run(new Date(+T8 + 20 * MIN), [itB.id]);
  const rb = await row(itB.id);
  chk("F10-1", "Membership ไม่ active = ไม่ยิง · ไม่ทิ้งตาราง: nextFireAt = +1 ชม. · lease ปล่อย", fp.sent.length === 0 && r10.noMember === 1 && eq(rb.nextFireAt, new Date(+T8 + 80 * MIN)) && rb.leaseToken === null, JSON.stringify(rb));
  const mB = await prisma.membership.findFirst({ where: { userId: fx.U.b, tenantId: tid } });
  const staffSvc = (await import("@/lib/staff/service")) as AnyMod;
  const rs = await staffSvc.restoreStaffAccess({ tenantId: tid, actorUserId: fx.U.a, membershipId: mB.id });
  const rb2 = await row(itB.id);
  chk("F10-2", "restoreStaffAccess ปลุกตาราง (nextFireAt = ตอนคืนสิทธิ์)", rs.ok === true && !!rb2.nextFireAt && +rb2.nextFireAt <= Date.now() + 1000, JSON.stringify(rs));
  await run(new Date(+T8 + 25 * MIN), [itB.id]);
  chk("F10-3", "หลังคืนสิทธิ์ รอบถัดไปยิงเตือนที่ค้าง (ช้าดีกว่าหาย)", fp.sent.length === 1 && fp.sent[0].data?.itemId === itB.id);

  console.log("── F11: ผูกลูกค้า (seed calqc) ──");
  const SEED_OWNER = { userId: "calqc-owner", tenantId: "calqc-tenant", membership: OWNER_M };
  if (!(await prisma.crmContact.findFirst({ where: { id: "calqc-crm-contact-ek" } }))) chk("F11-0", "มี seed calqc", false);
  else {
    const TL = new Date(Date.now() + 3 * 3_600_000);
    const li = await items.createItem(SEED_OWNER, { kind: "REMINDER", title: "qc-cal-1.4 โทรคุณเอก", startAt: TL, link: { type: "CRM_CONTACT", id: "calqc-crm-contact-ek" } });
    seedTouched.push(li.id);
    const dev = await prisma.pushDevice.create({ data: { userId: "calqc-owner", tenantId: "calqc-tenant", expoToken: `ExponentPushToken[qccal14-seed-${fx.STAMP}]`, platform: "ios" } });
    fp.clear();
    try {
      await fire.runCalendarFire(TL, { deadline: Date.now() + 30_000, deps: { post: fp.post, scope: { itemIds: [li.id] } } });
    } finally {
      await prisma.pushDevice.deleteMany({ where: { id: dev.id } });
    }
    const ek = await prisma.crmContact.findFirst({ where: { id: "calqc-crm-contact-ek" }, select: { phone: true } });
    const digits = String(ek?.phone ?? "").replace(/\D/g, "");
    const pl = JSON.stringify(fp.sent[0] ?? {});
    chk("F11-1", "ผูกลูกค้ามีเบอร์ → categoryId SEC_CAL_CALL · body เบอร์ปิด · ไม่มีเบอร์เต็มใน payload", fp.sent.length === 1 && fp.sent[0].categoryId === "SEC_CAL_CALL" && /เบอร์ \d\dx-xxx-\d{4}/.test(fp.sent[0].body) && digits.length > 6 && !pl.replace(/\D/g, "").includes(digits.slice(-7)), pl.slice(0, 300));
  }

  console.log("── F12: เก็บกวาด ──");
  const nowS = T("2027-06-01T09:00");
  const dOld = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "draft เก่า", startAt: nowS, occursAt: nowS, status: "DRAFT", createdAt: new Date(+nowS - 25 * 3_600_000) } });
  const dNew = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "draft ใหม่", startAt: nowS, occursAt: nowS, status: "DRAFT", createdAt: new Date(+nowS - 3_600_000) } });
  const cOld = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "c", startAt: nowS, occursAt: nowS, status: "CANCELLED", cancelledAt: new Date(+nowS - 91 * 86_400_000) } });
  const doneOld = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "d", startAt: nowS, occursAt: nowS, status: "DONE", doneAt: new Date(+nowS - 91 * 86_400_000) } });
  const doneRep = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "r", startAt: nowS, occursAt: nowS, status: "DONE", repeat: "DAILY", doneAt: new Date(+nowS - 91 * 86_400_000) } });
  const doneNew = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "dn", startAt: nowS, occursAt: nowS, status: "DONE", doneAt: new Date(+nowS - 10 * 86_400_000) } });
  await run(nowS, [dOld.id, dNew.id, cOld.id, doneOld.id, doneRep.id, doneNew.id]);
  chk("F12-0", "นาทีที่ไม่ใช่ :07 = ไม่เก็บกวาด (review m7 ชั่วโมงละครั้ง)", (await row(dOld.id)).status === "DRAFT" && !!(await row(cOld.id)));
  await run(nowS, [dOld.id, dNew.id, cOld.id, doneOld.id, doneRep.id, doneNew.id], { sweepNow: true });
  chk("F12-1", "DRAFT > 24 ชม. → CANCELLED · DRAFT ใหม่คงอยู่", (await row(dOld.id)).status === "CANCELLED" && (await row(dNew.id)).status === "DRAFT");
  chk("F12-2", "CANCELLED/DONE(ไม่ทำซ้ำ) > 90 วัน → ลบ · DONE ทำซ้ำ/ใหม่ คงอยู่", (await row(cOld.id)) === null && (await row(doneOld.id)) === null && !!(await row(doneRep.id)) && !!(await row(doneNew.id)));

  console.log("── F13: push.ts categoryId additive ──");
  const cap = fakePush();
  await push.sendPushToUser(fx.U.a, { title: "t", body: "b", data: { x: 1 } }, { post: cap.post });
  await push.sendPushToUser(fx.U.a, { title: "t", body: "b", data: { x: 1 }, categoryId: "SEC_CAL" }, { post: cap.post });
  chk("F13-1", "ไม่ใส่ categoryId = payload เดิม (to/title/body/data/sound) · ใส่ = มี categoryId", JSON.stringify(Object.keys(cap.sent[0]).sort()) === JSON.stringify(["body", "data", "sound", "title", "to"]) && cap.sent[1].categoryId === "SEC_CAL");
  const thr = await push.sendPushToUser(fx.U.a, { title: "t", body: "b" }, { post: async () => { throw new Error("down"); } });
  const none = await push.sendPushToUser(`qccal14-nobody-${fx.STAMP}`, { title: "t", body: "b" }, { post: cap.post });
  chk("F13-2", "sendPushToUser แยก transportErrors (โยน) กับไม่มีเครื่อง", thr.sent === 0 && thr.transportErrors === 1 && none.sent === 0 && none.transportErrors === 0);

  console.log("── F16: sendPushEach (รวมชุด) ──");
  {
    const calls: number[] = [];
    const rec = async (p: unknown[]) => { calls.push(p.length); return p.map(() => ({ status: "ok" })); };
    const r = await push.sendPushEach([{ userId: fx.U.a, msg: { title: "1", body: "b" } }, { userId: `qccal14-nobody-${fx.STAMP}`, msg: { title: "2", body: "b" } }, { userId: fx.U.b, msg: { title: "3", body: "b", categoryId: "SEC_CAL" } }], { post: rec });
    chk("F16-1", "หลายคนคนละข้อความ = ยิง Expo ครั้งเดียว · ผลต่อรายการ · ไม่มีเครื่อง = 0 ไม่ใช่ transport error", calls.length === 1 && calls[0] === 2 && r[0].sent === 1 && r[1].sent === 0 && !r[1].transportError && r[2].sent === 1, JSON.stringify({ calls, r }));
    const r2 = await push.sendPushEach([{ userId: fx.U.a, msg: { title: "1", body: "b" } }, { userId: `qccal14-nobody-${fx.STAMP}`, msg: { title: "2", body: "b" } }], { post: async () => { throw new Error("Expo HTTP 429"); } });
    chk("F16-2", "transport โยน (เช่น HTTP 429/5xx) = transportError เฉพาะรายการที่มีเครื่อง", r2[0].transportError && !r2[1].transportError);
    const ps = readFileSync(join(ROOT, "src/lib/core/push.ts"), "utf8");
    chk("F16-3", "expoPost: AbortSignal.timeout + รวมสัญญาณผู้เรียก + HTTP ไม่ใช่ 2xx = โยน (review M2/m2)", /AbortSignal\.timeout\(EXPO_TIMEOUT_MS\)/.test(ps) && /AbortSignal\.any\(\[t, signal\]\)/.test(ps) && /if \(!res\.ok\) throw/.test(ps));
  }

  console.log("── F17: สัญญาณยกเลิก/Expo ค้าง (review M2) ──");
  {
    const T17 = T("2027-07-01T09:00");
    const it17 = await items.createItem(A, { kind: "REMINDER", title: "Expo ค้าง", startAt: T17 }, { now: new Date(+T17 - 3_600_000) });
    const hang = (_p: unknown[], signal?: AbortSignal) => new Promise((_res, rej) => { signal?.addEventListener("abort", () => rej(new Error("aborted"))); });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    const t0 = Date.now();
    const r = await fire.runCalendarFire(T17, { deadline: Date.now() + 30_000, signal: ac.signal, deps: { post: hang, scope: { itemIds: [it17.id] } } });
    const x = await row(it17.id);
    chk("F17-1", "ส่งค้าง → ยกเลิกตามสัญญาณ (ไม่ค้างทั้งงาน) = transport error → คืนสถานะ ลองใหม่ +60 วิ · lease ปล่อย", Date.now() - t0 < 5_000 && r.retried === 1 && x.firedOccAt === null && eq(x.nextFireAt, new Date(+T17 + MIN)) && x.leaseToken === null, JSON.stringify(r));
  }

  console.log("── F18: 300 แถวถึงพร้อมกัน (review M3) ──");
  {
    const base = T("2027-08-01T08:00");
    const data = Array.from({ length: 300 }, (_, i) => {
      const at = new Date(+base + i * 1000); // ถึงก่อน = เวลาน้อยกว่า
      return { userId: i % 2 ? fx.U.a : fx.U.b, tenantId: tid, title: `แถว ${i}`, startAt: at, occursAt: at, nextFireAt: at };
    });
    await prisma.calItem.createMany({ data });
    const rows300 = await prisma.calItem.findMany({ where: { tenantId: tid, title: { startsWith: "แถว " } }, select: { id: true, nextFireAt: true }, orderBy: [{ nextFireAt: "asc" }, { id: "asc" }] });
    const ids300 = rows300.map((r: AnyMod) => r.id);
    const order: string[] = [];
    fp.clear();
    const at = new Date(+base + 10 * MIN);
    let runs = 0;
    const t0 = Date.now();
    for (; runs < 6; runs++) {
      const r = await fire.runCalendarFire(at, { deadline: Date.now() + 5_000, deps: { post: fp.post, scope: { itemIds: ids300 }, onSent: (ids: string[]) => order.push(...ids) } });
      if (!r.claimed) break;
    }
    const sentRows = fp.sent.filter((p) => ids300.includes(p.data?.itemId)).length;
    chk("F18-1", "300 แถวส่งครบใน ≤ 3 รอบ (งบ 5 วิ/รอบ) · ส่งตามลำดับถึงก่อน", sentRows === 300 && runs <= 3 && JSON.stringify(order) === JSON.stringify(ids300), JSON.stringify({ sentRows, runs, ms: Date.now() - t0, inOrder: JSON.stringify(order) === JSON.stringify(ids300) }));
    // งบหมดกลางรอบ → แถวที่ไม่ทันปล่อย lease ทันที (ไม่ต้องรอ 2 นาที)
    await prisma.calItem.updateMany({ where: { id: { in: ids300 } }, data: { firedOccAt: null, nagAt: null, nextFireAt: at, lastFiredAt: null } });
    const cut = await fire.runCalendarFire(at, { deadline: Date.now() + 1_520, deps: { post: fp.post, scope: { itemIds: ids300 } } });
    const leased = await prisma.calItem.count({ where: { id: { in: ids300 }, leaseToken: { not: null } } });
    chk("F18-2", "เลยงบระหว่าง commit = ปล่อย lease แถวที่ไม่ทัน (รอบหน้าหยิบต่อทันที)", cut.claimed === 100 && cut.released > 0 && leased === 0, JSON.stringify(cut));
  }

  console.log("── F19: m3 · m6 ──");
  {
    const T19 = T("2027-09-01T09:00");
    // แถวที่ nextFireAt ถึงแต่ไม่มีเหตุ + ผู้ใช้แก้ระหว่างจอง → ไม่ทับค่าผู้ใช้ แต่ปล่อย lease
    const odd = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: tid, title: "ไม่มีเหตุ", startAt: new Date(+T19 + 5 * 3_600_000), occursAt: new Date(+T19 + 5 * 3_600_000), nextFireAt: T19 } });
    await run(T19, [odd.id], { afterClaim: async () => { await prisma.calItem.update({ where: { id: odd.id }, data: { version: { increment: 1 } } }); } });
    const o = await row(odd.id);
    chk("F19-1", "ไม่มีเหตุ + version เปลี่ยน = ไม่ทับ แต่ปล่อย lease (review m3)", o.leaseToken === null && eq(o.nextFireAt, T19));
    // เลื่อนก่อนยิงครั้งแรก: ส่ง 1 ตอนเลื่อน + ย้ำ 1 · ไม่ยิงซ้ำตอนเวลาเดิม
    const one = await items.createItem(A, { kind: "REMINDER", title: "เลื่อนก่อนยิง", startAt: new Date(+T19 + 5 * 3_600_000) }, { now: T19 });
    await items.snooze(A, one.id, { preset: "1h" }, T19);
    fp.clear();
    for (const m of [60, 90, 120, 300, 330, 400]) await run(new Date(+T19 + m * MIN), [one.id]);
    chk("F19-2", "เลื่อนก่อนยิงครั้งแรก = 2 ข้อความ (เลื่อน + ย้ำ 1) · ไม่ยิงซ้ำตอนเวลาเดิม (review m6)", fp.sent.length === 2 && fp.sent[1].title.startsWith("🔔 ย้ำ:"), fp.sent.map((x) => x.title).join(" | "));
  }

  console.log("── F14/F15: ลงทะเบียน + โครงสร้าง ──");
  await import("@/lib/modules/calendar/jobs");
  const jobsSrc = readFileSync(join(ROOT, "src/lib/modules/calendar/jobs.ts"), "utf8");
  chk("F14-3", "jobs.ts ส่ง ctrl.signal ให้ calendar.fire (review M2)", /runCalendarFire\(now, \{ deadline: ctrl\.deadline, signal: ctrl\.signal \}\)/.test(jobsSrc));
  const reg = (globalThis as unknown as Record<symbol, AnyMod>)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, AnyMod>;
  const job = reg?.get("calendar.fire");
  chk("F14-1", "registerMinuteJob calendar.fire everyMinutes 1 · ownBudgetMs 5000", job?.everyMinutes === 1 && job?.ownBudgetMs === 5000 && job?.cadence === "minute");
  const cron = readFileSync(join(ROOT, "scripts/crm-cron.mts"), "utf8");
  const route = readFileSync(join(ROOT, "src/app/api/cron/outbox/route.ts"), "utf8");
  chk("F14-2", "import ใน scripts/crm-cron.mts และ api/cron/outbox/route.ts", /await import\("@\/lib\/modules\/calendar\/jobs"\)/.test(cron) && /import "@\/lib\/modules\/calendar\/jobs"/.test(route));
  const src = readFileSync(join(ROOT, "src/lib/modules/calendar/fire.ts"), "utf8").replace(/\/\/.*$/gm, "");
  chk("F15-1", "fire.ts แตะเฉพาะ calItem/membership (ไม่ push การ์ด/กิจกรรมระบบอื่น · R-CAL-22) · ไม่ใช้ quiet hours · ไม่ใส่ badge · ไม่ใส่ tenantId ให้ sendPushToUser", !/prisma\.(kanban|crm|appointment|account)/i.test(src) && !/quiet/i.test(src) && !/badge/.test(src) && /sendPushEach\(msgs,/.test(src) && !/tenantId: o\.row\.tenantId \}\s*\)\s*;?\s*\/\/ push/.test(src));
} catch (e) {
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  try { await prisma.calItem.deleteMany({ where: { id: { in: seedTouched }, userId: "calqc-owner" } }); } catch { /* */ }
  residue = await fx.cleanup();
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
