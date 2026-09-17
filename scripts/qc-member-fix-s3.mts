// QC — Member v2 audit-fix ชุด S3 (แจ้งเตือน + journey): H6 กันส่งซ้ำ/จองแถวก่อนส่ง · H7 ตรวจยินยอมซ้ำตอนส่งจริง · L14 digest ตรงชั่วโมงพอดี · L11 "use server" ห้าม export type · M7 จองแถว WAIT เป็น lease ไม่ใช่ปิดแถว · M8 ทริกเกอร์ member.merged / point.transferred
// Fable oracle (audit-fix) · Builder ห้ามแตะ · สัญญา ledger/member-briefs/member-fix-s3.md + ledger/AUDIT-2026-09-16-MEMBER.md (H6 H7 M7 M8 L11 L14)
// requires: member-seed
//
// สัญญาที่ข้อสอบนี้ตัดสิน (เกณฑ์ "หลังแก้" — วันนี้ต้องแดง)
//   H6a send(ctx, {event, customerId, refId}) ที่ refId เดิม 2 ครั้ง (เรียงกัน และพร้อมกัน) ⇒ ส่งจริงครั้งเดียว · แถวที่ไม่ใช่ SKIPPED ของ refId นั้นมีใบเดียว
//   H6b runDue 2 ตัวซ้อนกัน (ตัวส่งช้า) ⇒ แถวคิวแต่ละใบถูกส่งครั้งเดียว · แถว DIGEST ของ (คน, ช่องทาง) เกิดใบเดียว · ไม่มีแถวค้าง QUEUED
//   H7  แถวที่เลื่อนไว้ (quiet hours/digest) ต้องตรวจความยินยอมใหม่ตอน runDue ⇒ ถอนยินยอมแล้ว = ไม่ส่ง · แถวเป็น SKIPPED + เหตุผลไทย
//   L14 nextDigestTime: event เวลา 09:00 ไทยพอดี (digestHour 9) ⇒ เข้ารอบ "วันนี้" (09:00 วันเดียวกัน) · 08:59 ⇒ วันนี้ · 09:01 ⇒ พรุ่งนี้
//   L11 notifications-actions.ts ("use server") ต้องไม่มี export type/interface และ export ทุกตัวเป็น async function
//   M7  แถว WAITING ที่ถูกจองแล้ว "เครื่องดับ" (แถวค้างแบบเดิม: status WAITING + finishedAt ถูกเซ็ต) ⇒ cron รอบถัดไป (now + 20 นาที) ต้องหยิบมาทำต่อจนจบ · และทำครั้งเดียว
//   M8  journey ที่ฟัง member.merged {keepId, mergedId} ⇒ เข้า journey ให้ "คนที่เก็บไว้" (keepId) · point.transferred {fromCustomerId, toCustomerId, points} ⇒ ให้ผู้โอน (fromCustomerId) · event ที่หาสมาชิกไม่ได้ ⇒ มีแถว AutomationRun SKIPPED พร้อมเหตุผลไทย (ไม่เงียบหาย)
// 🔴 ไม่ส่งข้อความจริง: ฉีดตัวส่งปลอมทุกครั้ง · ข้อมูลที่แตะ (settings การแจ้งเตือน · ความยินยอมของลูกค้าที่ข้อสอบสร้างเอง · journey/run/แถวแจ้งเตือนที่ขึ้นต้น "fix-s3-") คืนสภาพใน finally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = prisma as Any;
// เวลาไทย: Date ที่ตรงกับ HH:MM ไทยของ "วันนี้ + dayOffset" (UTC+7)
const thaiAt = (hh: number, mm = 0, dayOffset = 0) => {
  const th = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate() + dayOffset, hh - 7, mm, 0, 0));
};
let tid = ""; let SYS = "";
const tag = `fix-s3-${Date.now().toString(36)}`;
const made = { customers: [] as string[], journeys: [] as string[], eventKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const N = (await import("@/lib/modules/member/notifications" as string)) as Record<string, (...a: Any[]) => Any>;
  const J = (await import("@/lib/modules/member/journeys" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };

  // ตั้งค่าแจ้งเตือนทั้งก้อน (AppSystem.settings) — คืนค่าเดิมใน finally
  const sys0 = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: (sys0?.settings ?? {}) as Any } }));

  // ตัวส่งปลอม (นับครั้ง · หน่วงได้เพื่อเปิดหน้าต่างชนกันของ cron 2 ตัว)
  const mkNotif = (delayMs = 0) => {
    const calls = { line: [] as Any[], email: [] as Any[], sms: [] as Any[], push: [] as Any[] };
    const fn = (k: "line" | "email" | "sms" | "push") => async (r: Any) => { if (delayMs) await sleep(delayMs); calls[k].push(r); return { ok: true }; };
    return { calls, deps: { line: fn("line"), email: fn("email"), sms: fn("sms"), push: fn("push") } };
  };
  const mkJourney = () => {
    const calls = { line: [] as Any[], email: [] as Any[], sms: [] as Any[], push: [] as Any[], kanban: [] as Any[] };
    const fn = (k: "line" | "email" | "sms" | "push") => async (r: Any) => { calls[k].push(r); return { ok: true }; };
    return { calls, deps: { line: fn("line"), email: fn("email"), sms: fn("sms"), push: fn("push"), kanban: async (r: Any) => { calls.kanban.push(r); return { ok: true, cardId: `card-${r.customerId}` }; } } };
  };
  const nLine = (d: Any, cid: string) => d.calls.line.filter((c: Any) => c.customerId === cid).length;

  // ลูกค้าทดสอบ: มี LINE identity + ยินยอม LINE · ไม่มีอีเมล/อุปกรณ์ push ⇒ ช่องทางจริงมีแต่ LINE (ช่องอื่น SKIPPED "ไม่มีช่องทาง")
  const mkCust = async (nm: string) => {
    const c = await PR.createMember(ctx as Any, owner, {
      phone: `0877${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`,
      firstName: nm, lastName: "แก้ออดิต", source: "WALK_IN", homeUnitId: E.units.patong,
    });
    made.customers.push(c.customerId as string);
    await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: c.customerId, channel: "LINE", externalId: `U-${tag}-${Math.random().toString(36).slice(2, 8)}`, linkedBy: "MANUAL" } }).catch(() => null);
    await PV.setConsent(ctx, owner, c.customerId, { channel: "LINE", granted: true, source: "STAFF" }).catch(() => null);
    return c.customerId as string;
  };
  const notifRows = (cid: string, refId?: string) => P.memberNotification.findMany({ where: { customerId: cid, ...(refId ? { refId } : {}) }, orderBy: { createdAt: "asc" } });

  // แถวคิวค้างของระบบนี้ที่ไม่ใช่ของข้อสอบ (runDue กวาดทั้งระบบ) — พักไว้ก่อนแล้วคืนค่าเดิม
  const foreign = (await P.memberNotification.findMany({ where: { systemId: SYS, status: "QUEUED" }, select: { id: true, scheduledAt: true } })) as Any[];
  if (foreign.length) {
    const parked = new Date(Date.UTC(2099, 0, 1));
    await P.memberNotification.updateMany({ where: { id: { in: foreign.map((f) => f.id) } }, data: { scheduledAt: parked } });
    restore.push(async () => { for (const f of foreign) await P.memberNotification.update({ where: { id: f.id }, data: { scheduledAt: f.scheduledAt } }).catch(() => null); });
  }

  // ═══ L11 — "use server" ห้าม export type ═══
  const actSrc = read("src/lib/modules/member/notifications-actions.ts");
  const typeExports = actSrc.match(/^export\s+(type|interface)\b.*$/gm) ?? [];
  const nonAsync = (actSrc.match(/^export\s+(?!async\s+function\b)[A-Za-z].*$/gm) ?? []);
  chk("S3-L11.1", 'notifications-actions.ts ("use server") ไม่มี export type/interface และ export ทุกตัวเป็น async function (ชนิดข้อมูลย้ายไป notifications-shared.ts)',
    actSrc.length > 0 && typeExports.length === 0 && nonAsync.length === 0,
    "0 export type · 0 export ที่ไม่ใช่ async function", `type=${typeExports.length ? typeExports.join(" | ").slice(0, 120) : 0} other=${nonAsync.length ? nonAsync.join(" | ").slice(0, 120) : 0}`);

  // ═══ H6a — send กันซ้ำด้วย refId ═══
  const A = await mkCust("กันซ้ำ");
  const ref1 = `${tag}-dedupe1`;
  const d1 = mkNotif();
  const s1a = await N.send(ctx, { event: "VOUCHER_NEW", customerId: A, vars: { voucher: "ส่วนลด ฿100" }, refId: ref1 }, { now: thaiAt(14), deps: d1.deps });
  const s1b = await N.send(ctx, { event: "VOUCHER_NEW", customerId: A, vars: { voucher: "ส่วนลด ฿100" }, refId: ref1 }, { now: thaiAt(14), deps: d1.deps });
  const rows1 = (await notifRows(A, ref1)) as Any[];
  const live1 = rows1.filter((r) => r.status !== "SKIPPED");
  chk("S3-H6.1", "send เหตุการณ์เดิม + refId เดิม 2 ครั้งเรียงกัน (มีแต่ช่องทาง LINE ที่ส่งได้) ⇒ ตัวส่งจริงถูกเรียกครั้งเดียว · แถวที่ไม่ใช่ SKIPPED ของ refId นี้เหลือใบเดียว (ครั้งที่ 2 คืนแถวเดิม ไม่สร้างใหม่)",
    nLine(d1, A) === 1 && live1.length === 1 && live1[0]?.channel === "LINE",
    "ส่ง 1 · แถว 1", `line=${nLine(d1, A)} rows=${rows1.map((r: Any) => `${r.channel}:${r.status}`).join(",")} res=${JSON.stringify([s1a?.results?.length, s1b?.results?.length])}`);

  const ref2 = `${tag}-dedupe2`;
  const d2 = mkNotif(120);
  await Promise.all([
    N.send(ctx, { event: "VOUCHER_NEW", customerId: A, vars: { voucher: "ส่วนลด ฿100" }, refId: ref2 }, { now: thaiAt(14), deps: d2.deps }),
    N.send(ctx, { event: "VOUCHER_NEW", customerId: A, vars: { voucher: "ส่วนลด ฿100" }, refId: ref2 }, { now: thaiAt(14), deps: d2.deps }),
  ]).catch(() => null);
  const rows2 = (await notifRows(A, ref2)) as Any[];
  const live2 = rows2.filter((r) => r.status !== "SKIPPED");
  chk("S3-H6.2", "send refId เดิม 2 ครั้ง **พร้อมกัน** (Promise.all · ตัวส่งหน่วง 120ms) ⇒ ยังส่งจริงครั้งเดียว · แถวที่ไม่ใช่ SKIPPED ใบเดียว (ล็อกกันชนระดับฐานข้อมูล ไม่ใช่แค่ read-then-write)",
    nLine(d2, A) === 1 && live2.length === 1,
    "ส่ง 1 · แถว 1", `line=${nLine(d2, A)} rows=${rows2.map((r: Any) => `${r.channel}:${r.status}`).join(",")}`);

  // ═══ H7 — ถอนยินยอมหลังเข้าคิว (quiet hours) ⇒ runDue ต้องไม่ส่ง ═══
  const C = await mkCust("ถอนยินยอม");
  const refH7 = `${tag}-h7`;
  const d3 = mkNotif();
  const sH7 = await N.send(ctx, { event: "VOUCHER_NEW", customerId: C, vars: { voucher: "ส่วนลด ฿100" }, refId: refH7 }, { now: thaiAt(22), deps: d3.deps });
  const queuedH7 = ((await notifRows(C, refH7)) as Any[]).filter((r) => r.status === "QUEUED");
  await PV.setConsent(ctx, owner, C, { channel: "LINE", granted: false, source: "STAFF" });
  const dueH7 = await N.runDue(ctx, { now: thaiAt(8, 1, 1), deps: d3.deps });
  const afterH7 = ((await notifRows(C, refH7)) as Any[]).filter((r) => r.channel === "LINE");
  chk("S3-H7.1", "ข้อความที่เลื่อนเพราะ quiet hours (ส่ง 22:00 → คิวไว้ 08:00) แล้วลูกค้าถอนความยินยอม LINE ก่อนถึงเวลา ⇒ runDue(08:01) ไม่ส่งเลย · แถวกลายเป็น SKIPPED พร้อมเหตุผลไทยเรื่องความยินยอม",
    queuedH7.length >= 1 && nLine(d3, C) === 0 && afterH7.length >= 1 && afterH7.every((r: Any) => r.status === "SKIPPED") && afterH7.some((r: Any) => /[ก-๙]/.test(r.reason ?? "") && /ยินยอม/.test(r.reason ?? "")),
    "ไม่ส่ง · SKIPPED เหตุผลไทย", `queued=${queuedH7.length} line=${nLine(d3, C)} after=${afterH7.map((r: Any) => `${r.status}:${(r.reason ?? "").slice(0, 40)}`).join(" | ")} due=${JSON.stringify(dueH7)}`);

  // ═══ H6b — runDue 2 ตัวซ้อนกัน (digest + แถวเดี่ยวที่เลื่อนจาก quiet hours) ═══
  await N.setTemplate(ctx, owner, "POINTS_EARNED", { timing: "DAILY_DIGEST", digestHour: 9 });
  const d4 = mkNotif(150);
  const refD1 = `${tag}-dg1`; const refD2 = `${tag}-dg2`; const refB = `${tag}-quiet`;
  await N.send(ctx, { event: "POINTS_EARNED", customerId: A, vars: { แต้ม: 30 }, refId: refD1 }, { now: thaiAt(10), deps: d4.deps });
  await N.send(ctx, { event: "POINTS_EARNED", customerId: A, vars: { แต้ม: 45 }, refId: refD2 }, { now: thaiAt(10), deps: d4.deps });
  const B = await mkCust("เลื่อนเช้า");
  await N.send(ctx, { event: "VOUCHER_NEW", customerId: B, vars: { voucher: "ส่วนลด ฿100" }, refId: refB }, { now: thaiAt(22), deps: d4.deps });
  const par = await Promise.all([
    N.runDue(ctx, { now: thaiAt(9, 5, 1), deps: d4.deps }).catch((e: Any) => ({ error: String(e?.message ?? e).slice(0, 80) })),
    N.runDue(ctx, { now: thaiAt(9, 5, 1), deps: d4.deps }).catch((e: Any) => ({ error: String(e?.message ?? e).slice(0, 80) })),
  ]);
  const dgRows = ((await notifRows(A)) as Any[]).filter((r) => [refD1, refD2].includes(r.refId));
  const dgMade = await P.memberNotification.count({ where: { customerId: A, event: "DIGEST", channel: "LINE" } });
  const leftQueued = await P.memberNotification.count({ where: { customerId: { in: [A, B] }, status: "QUEUED", scheduledAt: { lte: thaiAt(9, 5, 1) } } });
  chk("S3-H6.3", "runDue 2 ตัวพร้อมกัน (ตัวส่งหน่วง 150ms) กับคิว digest 2 ใบของคนเดียวกัน ⇒ ส่งจริงครั้งเดียว · แถว DIGEST เกิดใบเดียว · แถวเดิมเป็น DIGESTED ทั้งคู่ · ไม่มีแถวค้าง QUEUED (จองแถว QUEUED→SENDING ก่อนส่ง)",
    nLine(d4, A) === 1 && dgMade === 1 && dgRows.length === 2 && dgRows.every((r: Any) => r.status === "DIGESTED" && !!r.digestOfId) && leftQueued === 0,
    "ส่ง 1 · DIGEST 1 · ไม่ค้าง", `line=${nLine(d4, A)} digest=${dgMade} rows=${dgRows.map((r: Any) => r.status).join(",")} queuedLeft=${leftQueued} par=${JSON.stringify(par)}`);
  const rowsB = ((await notifRows(B, refB)) as Any[]).filter((r) => r.channel === "LINE");
  chk("S3-H6.4", "runDue 2 ตัวพร้อมกัน กับแถวเดี่ยวที่เลื่อนจาก quiet hours ⇒ ส่งจริงครั้งเดียว · แถวเดียวสถานะ SENT (ไม่มีใบซ้ำ ไม่ถูกส่ง 2 รอบ)",
    nLine(d4, B) === 1 && rowsB.length === 1 && rowsB[0]?.status === "SENT" && !!rowsB[0]?.sentAt,
    "ส่ง 1 · SENT 1 ใบ", `line=${nLine(d4, B)} rows=${rowsB.map((r: Any) => r.status).join(",")}`);

  // ═══ M7 — จองแถว WAIT เป็น lease (cron ตายแล้วต้องมีคนหยิบต่อ) ═══
  const jd1 = mkJourney();
  const tagW = `${tag}-w`;
  const jw = await J.createJourney(ctx, owner, {
    name: `${tag} รอแล้วทำต่อ`,
    trigger: { event: "member.tier.at_risk" },
    conditions: { groups: [] },
    actions: [{ type: "WAIT_THEN", params: { days: 1, thenActions: [{ type: "ADD_TAG", params: { tag: tagW } }, { type: "SEND_LINE", params: { template: "ตามต่อคุณ {ชื่อ}" } }] } }],
    holdoutPct: 0,
    enabled: true,
  });
  made.journeys.push(jw.id);
  const base = new Date();
  const W1 = await mkCust("รอแล้วเครื่องดับ");
  await J.runForEvent({ tenantId: tid, type: "member.tier.at_risk", payload: { customerId: W1 }, idempotencyKey: `${tag}-w1` }, { now: base, deps: jd1.deps });
  const wr1 = await P.automationRun.findFirst({ where: { ruleId: jw.id, customerId: W1, status: "WAITING" } });
  // จำลอง "cron จองแถวแล้วเครื่องดับ" — จองด้วยวิธีเดียวกับโค้ดวันนี้ (เซ็ต finishedAt) แล้วไม่ทำต่อ
  const claimed = await P.automationRun.updateMany({ where: { id: wr1?.id ?? "-", status: "WAITING", finishedAt: null }, data: { finishedAt: new Date() } });
  const jd2 = mkJourney();
  const ranAfter = await J.runDueWaits({ now: new Date(base.getTime() + 86_400_000 + 20 * 60_000), tenantId: tid, deps: jd2.deps });
  const wr1b = await P.automationRun.findUnique({ where: { id: wr1?.id ?? "-" } });
  const tagsW1 = ((await prisma.customer.findUnique({ where: { id: W1 } }))?.tags as Any as string[]) ?? [];
  chk("S3-M7.1", "ขั้น 'รอ 1 วัน' ถูกจองแล้ว cron ตายกลางทาง (แถวค้าง WAITING + finishedAt ถูกเซ็ต) ⇒ cron รอบถัดไป (now + 20 นาที หลังหมดอายุการจอง) หยิบไปทำจนจบ: run เป็น OK · ติดแท็ก · ส่ง LINE 1 ครั้ง",
    claimed.count === 1 && wr1b?.status === "OK" && tagsW1.includes(tagW) && nLine(jd2, W1) === 1,
    "หยิบต่อจนจบ", `claimed=${claimed.count} run=${wr1b?.status} finishedAt=${!!wr1b?.finishedAt} tags=${JSON.stringify(tagsW1)} line=${nLine(jd2, W1)} ran=${JSON.stringify(ranAfter)}`);

  const W2 = await mkCust("แถวค้างของเดิม");
  await J.runForEvent({ tenantId: tid, type: "member.tier.at_risk", payload: { customerId: W2 }, idempotencyKey: `${tag}-w2` }, { now: base, deps: jd1.deps });
  const wr2 = await P.automationRun.findFirst({ where: { ruleId: jw.id, customerId: W2, status: "WAITING" } });
  await P.automationRun.update({ where: { id: wr2?.id ?? "-" }, data: { finishedAt: base } }); // แถวที่ค้างมาแต่เดิม (บั๊กแบบเก่า)
  const jd3 = mkJourney();
  await J.runDueWaits({ now: new Date(base.getTime() + 86_400_000 + 20 * 60_000), tenantId: tid, deps: jd3.deps });
  const wr2b = await P.automationRun.findUnique({ where: { id: wr2?.id ?? "-" } });
  const tagsW2 = ((await prisma.customer.findUnique({ where: { id: W2 } }))?.tags as Any as string[]) ?? [];
  chk("S3-M7.2", "แถวที่ค้างอยู่แล้วในฐานข้อมูล (status WAITING + finishedAt ถูกเซ็ต · ไม่มีขั้นถัดไป) ถูกกู้คืนด้วย cron รอบเดียวกัน ⇒ run OK · ติดแท็ก · ส่ง LINE",
    wr2b?.status === "OK" && tagsW2.includes(tagW) && nLine(jd3, W2) === 1,
    "กู้แถวค้างเดิม", `run=${wr2b?.status} tags=${JSON.stringify(tagsW2)} line=${nLine(jd3, W2)}`);

  await J.runDueWaits({ now: new Date(base.getTime() + 86_400_000 + 40 * 60_000), tenantId: tid, deps: jd3.deps });
  const wr2c = await P.automationRun.findUnique({ where: { id: wr2?.id ?? "-" } });
  chk("S3-M7.3", "กู้แล้วต้องทำครั้งเดียว: cron อีกรอบ (now + 40 นาที) ไม่ทำ thenActions ซ้ำ (deps.line ของคนนี้ยัง 1 ครั้ง · run ยัง OK)",
    nLine(jd3, W2) === 1 && wr2c?.status === "OK",
    "ทำครั้งเดียว", `line=${nLine(jd3, W2)} run=${wr2c?.status}`);

  // ═══ M8 — ทริกเกอร์ member.merged / point.transferred ═══
  const tagM8 = `${tag}-m8`;
  const jm = await J.createJourney(ctx, owner, {
    name: `${tag} รวมสมาชิก`, trigger: { event: "member.merged" }, conditions: { groups: [] },
    actions: [{ type: "ADD_TAG", params: { tag: tagM8 } }], holdoutPct: 0, enabled: true,
  });
  made.journeys.push(jm.id);
  const K = await mkCust("คนที่เก็บไว้"); const MG = await mkCust("คนที่ถูกรวม");
  const jd4 = mkJourney();
  const keyMerged = `${tag}-merged`;
  made.eventKeys.push(keyMerged);
  await J.runForEvent({ tenantId: tid, type: "member.merged", payload: { keepId: K, mergedId: MG }, idempotencyKey: keyMerged }, { deps: jd4.deps });
  const runsK = (await P.automationRun.findMany({ where: { ruleId: jm.id } })) as Any[];
  const tagsK = ((await prisma.customer.findUnique({ where: { id: K } }))?.tags as Any as string[]) ?? [];
  chk("S3-M8.1", "journey ทริกเกอร์ member.merged: payload จริงคือ {keepId, mergedId} (profile.ts) ⇒ resolveCustomerId ต้องเข้าใจ keepId ⇒ เกิด AutomationRun ให้ 'คนที่เก็บไว้' (keepId) สถานะ OK + ทำ action",
    runsK.some((r) => r.customerId === K && r.status === "OK") && tagsK.includes(tagM8),
    "run OK ของ keepId", `runs=${runsK.map((r) => `${r.customerId === K ? "keep" : r.customerId === MG ? "merged" : "?"}:${r.status}`).join(",") || "ไม่มีแถวเลย"} tags=${JSON.stringify(tagsK)}`);

  const tagM8b = `${tag}-m8b`;
  const jt = await J.createJourney(ctx, owner, {
    name: `${tag} โอนแต้ม`, trigger: { event: "point.transferred" }, conditions: { groups: [] },
    actions: [{ type: "ADD_TAG", params: { tag: tagM8b } }], holdoutPct: 0, enabled: true,
  });
  made.journeys.push(jt.id);
  const FROM = await mkCust("ผู้โอนแต้ม"); const TO = await mkCust("ผู้รับแต้ม");
  const jd5 = mkJourney();
  const keyTransfer = `${tag}-transferred`;
  made.eventKeys.push(keyTransfer);
  await J.runForEvent({ tenantId: tid, type: "point.transferred", payload: { fromCustomerId: FROM, toCustomerId: TO, points: 50 }, idempotencyKey: keyTransfer }, { deps: jd5.deps });
  const runsT = (await P.automationRun.findMany({ where: { ruleId: jt.id } })) as Any[];
  const tagsF = ((await prisma.customer.findUnique({ where: { id: FROM } }))?.tags as Any as string[]) ?? [];
  chk("S3-M8.2", "journey ทริกเกอร์ point.transferred: payload จริงคือ {fromCustomerId, toCustomerId, points} (point/transfer.ts) ⇒ resolveCustomerId ต้องเข้าใจ fromCustomerId ⇒ เกิด AutomationRun ให้ 'ผู้โอน' สถานะ OK + ทำ action",
    runsT.some((r) => r.customerId === FROM && r.status === "OK") && tagsF.includes(tagM8b),
    "run OK ของ fromCustomerId", `runs=${runsT.map((r) => `${r.customerId === FROM ? "from" : r.customerId === TO ? "to" : "?"}:${r.status}`).join(",") || "ไม่มีแถวเลย"} tags=${JSON.stringify(tagsF)}`);

  const keyOrphan = `${tag}-orphan`;
  made.eventKeys.push(keyOrphan);
  const jd6 = mkJourney();
  await J.runForEvent({ tenantId: tid, type: "member.merged", payload: { mergedId: MG }, idempotencyKey: keyOrphan }, { deps: jd6.deps });
  const orphan = (await P.automationRun.findMany({ where: { tenantId: tid, eventKey: keyOrphan } })) as Any[];
  chk("S3-M8.3", "event ของ journey ที่หาสมาชิกไม่ได้ (member.merged ที่ไม่มี keepId) ⇒ ต้องมีแถว AutomationRun สถานะ SKIPPED พร้อมเหตุผลไทยให้ร้านเห็น (ไม่ return เงียบ ๆ)",
    orphan.length >= 1 && orphan.some((r) => r.status === "SKIPPED" && /[ก-๙]/.test(r.detail ?? "")),
    "แถว SKIPPED + เหตุผลไทย", `rows=${orphan.map((r) => `${r.status}:${(r.detail ?? "").slice(0, 50)}`).join(" | ") || "ไม่มีแถวเลย"}`);

  // ═══ L14 — digest ตรงชั่วโมงพอดี ═══
  await N.setTemplate(ctx, owner, "TIER_UP", { timing: "DAILY_DIGEST", digestHour: 9 });
  const d5 = mkNotif();
  const refL0 = `${tag}-l14-0900`; const refLa = `${tag}-l14-0859`; const refLb = `${tag}-l14-0901`;
  await N.send(ctx, { event: "TIER_UP", customerId: A, vars: { ระดับ: "Gold" }, refId: refL0 }, { now: thaiAt(9, 0), deps: d5.deps });
  await N.send(ctx, { event: "TIER_UP", customerId: A, vars: { ระดับ: "Gold" }, refId: refLa }, { now: thaiAt(8, 59), deps: d5.deps });
  await N.send(ctx, { event: "TIER_UP", customerId: A, vars: { ระดับ: "Gold" }, refId: refLb }, { now: thaiAt(9, 1), deps: d5.deps });
  const schedOf = async (refId: string) => {
    const r = ((await notifRows(A, refId)) as Any[]).find((x) => x.channel === "LINE" && x.status === "QUEUED");
    return r?.scheduledAt ? new Date(r.scheduledAt).getTime() : 0;
  };
  const today9 = thaiAt(9, 0, 0).getTime(); const tomorrow9 = thaiAt(9, 0, 1).getTime();
  const at0900 = await schedOf(refL0); const at0859 = await schedOf(refLa); const at0901 = await schedOf(refLb);
  chk("S3-L14.1", "nextDigestTime: event เกิด 09:00 ไทยพอดี (digestHour 9 · รอบวันนี้ยังไม่ผ่านไป) ⇒ เข้า digest ของ **วันนี้** 09:00 ไม่ใช่พรุ่งนี้ (คลาด 1 วัน)",
    at0900 === today9,
    `scheduledAt = วันนี้ 09:00 (${new Date(today9).toISOString()})`, at0900 ? new Date(at0900).toISOString() : "ไม่มีแถว QUEUED");
  chk("S3-L14.2", "ขอบเขตสองฝั่ง: event 08:59 ⇒ digest วันนี้ 09:00 · event 09:01 (รอบวันนี้ผ่านไปแล้ว) ⇒ digest พรุ่งนี้ 09:00 (แก้แล้วต้องไม่เลยเถิดไปดึงของเมื่อวาน)",
    at0859 === today9 && at0901 === tomorrow9,
    "08:59 → วันนี้ · 09:01 → พรุ่งนี้", `0859=${at0859 ? new Date(at0859).toISOString() : "-"} 0901=${at0901 ? new Date(at0901).toISOString() : "-"}`);
} catch (e) {
  console.error("💥", e);
  chk("S3-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 300));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.eventKeys.length) await d(() => P.automationRun.deleteMany({ where: { tenantId: tid, eventKey: { in: made.eventKeys } } }));
  if (made.journeys.length) {
    await d(() => P.automationRun.deleteMany({ where: { OR: [{ ruleId: { in: made.journeys } }, { journeyId: { in: made.journeys } }] } }));
    await d(() => P.automationRule.deleteMany({ where: { id: { in: made.journeys } } }));
  }
  if (made.customers.length) {
    await d(() => P.memberNotification.deleteMany({ where: { customerId: { in: made.customers } } }));
    for (const id of made.customers) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, payload: { path: ["customerId"], equals: id } } }));
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["automationRun", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} FIX-S3: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
