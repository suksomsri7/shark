// QC — ระบบสมาชิก v2 WO M3.6: การแจ้งเตือนสมาชิก — เทมเพลต 8 เหตุการณ์ × 4 ช่องทาง (LINE/อีเมล/SMS/push) · ตัวแปร · send (เคารพยินยอมต่อช่องทาง · transactional ยกเว้น · quiet hours 21:00–08:00 เลื่อนเช้า · รวมรายวัน) · SMS ไม่มี provider = ปิด · stats · UI ภาพ 30 + ทดสอบส่งหาตัวเอง
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.6 · พิมพ์เขียว §5.10 notifications §8.x (บรรทัด 478: consent/transactional/quiet hours/LINE ผ่าน chat facade/อีเมล Resend/SMS provider/push PushDevice) · ภาพ 30
// requires: member-seed
//
// สัญญา (Fable ตัดสิน: ต้องมี migration `member_v2_h2` ตาราง `MemberNotification` เป็นบันทึกส่ง/คิว — ตาราง RUN เขียน "—" แต่ digest/quiet hours/stats ต้องมีที่เก็บ · บันทึกใน §4)
//   schema: MemberNotification {tenantId systemId customerId event String channel String status String (QUEUED|SENT|FAILED|SKIPPED|DIGESTED) scheduledAt? sentAt? subject? body reason? refId? digestOfId? createdAt} index(systemId,status,scheduledAt) index(customerId,createdAt) index(systemId,createdAt)
//   ทะเบียน NOTIF_EVENTS (src/lib/modules/member/notification-events.ts · 8 ตัว ตามลำดับภาพ 30): WELCOME (ต้อนรับสมาชิกใหม่ · transactional) · POINTS_EARNED (ได้แต้ม · transactional) · POINTS_EXPIRING (แต้มใกล้หมดอายุ · transactional · leadDays [30, 7]) · TIER_UP (เลื่อนระดับ) · TIER_AT_RISK (ใกล้ลดระดับ) · VOUCHER_NEW (voucher ใหม่) · STAMP_COMPLETE (สแตมป์ครบ) · REVIEW_REQUEST (ขอรีวิว) — แต่ละตัว { key, label ไทย, transactional, vars: string[] (ชื่อไทยในปีกกา เช่น {ชื่อ} {แต้ม} {แต้มที่จะหมด} {วันหมดอายุ} {ระดับ} {ลิงก์กระเป๋า} {ร้าน} {voucher} {สาขา}) , sourceEvent (member.created / point.earned / point.expiring / member.tier.changed / member.tier.at_risk / voucher.issued / stamp.completed / review.requested) }
//   NOTIF_CHANNELS = ["LINE", "EMAIL", "SMS", "PUSH"]
//   settings ใน AppSystem.settings.member.notifications = { templates: { [key]: { enabled, timing: "IMMEDIATE" | "DAILY_DIGEST", digestHour 9, leadDays?, channels: { LINE: { enabled, body }, EMAIL: { enabled, subject, body }, SMS: { enabled, body }, PUSH: { enabled, title, body } } } }, quietHours: { enabled true, from "21:00", to "08:00" }, respectConsent true, transactionalOverride true }
//   getNotificationSettings(ctx) → ค่าปริยายครบ 8 × 4 (ข้อความไทยตั้งต้นทุกช่อง · LINE/EMAIL/PUSH enabled true · SMS enabled false) + { smsAvailable: boolean (core/sms.ts มี provider?) , quietHours, respectConsent, transactionalOverride }
//   setTemplate(ctx, actor, key, partial{ enabled?, timing?, digestHour?, leadDays?, channels? }) → member.settings.manage · key ไม่รู้จัก → throw ไทย · timing ผิด → throw · digestHour 0–23 · ตัวแปรที่ไม่อยู่ใน vars ของ event → throw ไทย ("ไม่รู้จักตัวแปร {x}") · setNotificationSettings(ctx, actor, { quietHours?, respectConsent?, transactionalOverride? }) · from/to "HH:MM"
//   renderTemplate(body, vars: Record<string, string|number>) → แทน {ชื่อ} ทุกตัว · ตัวแปรที่ไม่มีค่า → "" (ไม่เหลือปีกกา) · pure
//   buildVars(ctx, customerId, extra?) → { ชื่อ, ร้าน, ระดับ, แต้ม, ลิงก์กระเป๋า (URL เต็ม /m/<slug>/wallet), สาขา, ...extra }
//   send(ctx, { event: key, customerId, vars?, refId? }, { now?, deps?: { line?, email?, sms?, push? } }) → { results: [{ channel, status, reason?, notificationId }] } — ลำดับต่อช่องทางที่ template.channels[ch].enabled: (1) ไม่มีช่องทาง (LINE identity / email / phone / PushDevice ของ customer) → SKIPPED "ไม่มีช่องทาง…" (2) SMS ไม่มี provider (deps.sms ไม่มี และ core/sms provider null) → SKIPPED "ไม่มีผู้ให้บริการ SMS" (3) respectConsent && !consent(ch) && !(transactional && transactionalOverride) → SKIPPED "ไม่ได้ยินยอม…" (4) template.enabled false → SKIPPED (5) timing DAILY_DIGEST → QUEUED scheduledAt = digestHour ถัดไป (เวลาไทย) (6) quietHours.enabled && now (เวลาไทย) ใน [from, to) → QUEUED scheduledAt = วันนี้/พรุ่งนี้ to (08:00 ไทย) (7) ส่งผ่าน deps.<ch> (ปริยาย: LINE → chat facade pushToContact · EMAIL → core/email sendEmail · SMS → core/sms · PUSH → core/push customer device) → SENT sentAt | FAILED reason · ทุกผลลัพธ์เขียน MemberNotification 1 แถว/ช่องทาง (body ที่ render แล้ว)
//   runDue(ctx, { now?, deps? }) → { sent, failed, digested } — QUEUED scheduledAt ≤ now: กลุ่ม (customerId, channel) ที่มี > 1 แถว หรือ timing DAILY_DIGEST → รวมเป็นข้อความเดียว (บรรทัดละรายการ · หัว "สรุปวันนี้จาก {ร้าน}") → แถวใหม่ event "DIGEST" SENT + แถวเดิม → DIGESTED digestOfId · แถวเดี่ยว (เลื่อนจาก quiet hours) → ส่งตามปกติ SENT
//   stats(ctx, actor, { month? = เดือนไทยนี้ }) → { sent, failed, skipped, queued, byChannel { LINE, EMAIL, SMS, PUSH }, byEvent { key: n } }
//   testSend(ctx, actor, key, channel, { deps? }) → { preview: { subject?, body }, result } — ส่งหาตัวเอง (อีเมล/LINE ของผู้ใช้ที่ล็อกอิน · ตัวอย่างข้อมูลจำลอง) · member.settings.manage
//   hooks: outbox-consumers → member.created → send WELCOME · point.earned → POINTS_EARNED · member.tier.changed (ขึ้น) → TIER_UP · member.tier.at_risk → TIER_AT_RISK · voucher.issued → VOUCHER_NEW · stamp.completed → STAMP_COMPLETE · cron member notifications (emit point.expiring ตาม leadDays จาก PointLot · runDue ทุก 15 นาที) · M3.4 requestReview ใช้ template REVIEW_REQUEST · M3.3 SEND_LINE ยังส่งตรง (ไม่ผ่านเทมเพลต)
//   UI (ภาพ 30): /member/settings/notifications — ตาราง 8 แถว (เหตุการณ์ · ชิป LINE/อีเมล/SMS/push ✓/✗ ผ่าน MemberIcon · ส่งเมื่อ ทันที/รวมรายวัน 09:00 · สถานะ ใช้งาน/ปิดอยู่) · แผงขวา 480px แก้เทมเพลต (แท็บ 4 ช่องทาง · textarea + ชิปตัวแปร · ตัวอย่างบน LINE เป็นบับเบิล · เวลาส่ง 30 วันก่อน/7 วันก่อน (POINTS_EXPIRING) · สวิตช์ห้ามส่งช่วง 21:00–08:00 + เคารพความยินยอมต่อช่องทาง · ปุ่ม ทดสอบส่งหาตัวเอง / บันทึก) · แถบล่าง สรุปยอดส่งเดือนนี้ (ส่งแล้ว n · ล้มเหลว n · ข้าม n · ต่อช่องทาง) · SMS ไม่มี provider → ชิป SMS เทา + คำอธิบาย "ยังไม่ได้ตั้งค่าผู้ให้บริการ SMS"
//   testid: notif-page notif-table notif-row-<KEY> notif-chip-<KEY>-<CH> notif-panel notif-panel-tabs notif-panel-body notif-vars notif-preview notif-lead-days notif-quiet notif-consent notif-test-send notif-save notif-month-summary notif-sms-unavailable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_h2$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/member/notifications.ts") || !existsSync("src/app/app/sys/[id]/member/settings/notifications/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_h2 · member/notifications.ts · member/settings/notifications/page.tsx)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const hasIdx = async (t: string, colsIn: string[]) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("(") + 1).replace(/"/g, "").toLowerCase(); return colsIn.every((c) => body.includes(c.toLowerCase())); }); };
const P = prisma as Any;
// เวลาไทย: สร้าง Date ที่ตรงกับ HH:MM ไทยของ "วันนี้" (UTC+7)
const thaiAt = (hh: number, mm = 0, dayOffset = 0) => { const now = new Date(); const th = new Date(now.getTime() + 7 * 3600_000); const d = new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate() + dayOffset, hh - 7, mm, 0, 0)); return d; };
const thaiHM = (d: Date) => { const th = new Date(d.getTime() + 7 * 3600_000); return `${String(th.getUTCHours()).padStart(2, "0")}:${String(th.getUTCMinutes()).padStart(2, "0")}`; };
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const made = { customers: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const N = (await import("@/lib/modules/member/notifications" as string)) as Record<string, (...a: Any[]) => Any>;
  const EV = (await import("@/lib/modules/member/notification-events" as string)) as Any;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const sys0 = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: (sys0?.settings ?? {}) as Any } }));
  const mkDeps = () => { const calls = { line: [] as Any[], email: [] as Any[], sms: [] as Any[], push: [] as Any[] }; const ok = async () => ({ ok: true }); return { calls, deps: { line: async (r: Any) => { calls.line.push(r); return ok(); }, email: async (r: Any) => { calls.email.push(r); return ok(); }, sms: async (r: Any) => { calls.sms.push(r); return ok(); }, push: async (r: Any) => { calls.push.push(r); return ok(); } } }; };
  const mkCust = async (nm: string, o: { line?: boolean; email?: boolean; phone?: boolean; consents?: string[] }) => {
    const c = await PR.createMember(ctx as Any, owner, { phone: o.phone === false ? undefined : `0866${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`, email: o.email ? `nt-${tag}-${Math.random().toString(36).slice(2, 7)}@example.com` : undefined, firstName: nm, lastName: "แจ้งเตือน", source: "WALK_IN", homeUnitId: E.units.patong });
    made.customers.push(c.customerId);
    if (o.line) await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: c.customerId, channel: "LINE", externalId: `U-nt-${tag}-${Math.random().toString(36).slice(2, 8)}` } }).catch(() => null);
    for (const ch of o.consents ?? []) await PV.setConsent(ctx, owner, c.customerId, { channel: ch, granted: true, source: "STAFF" }).catch(() => null);
    return c.customerId as string;
  };
  const rows = (cid: string, event?: string) => P.memberNotification.findMany({ where: { customerId: cid, ...(event ? { event } : {}) }, orderBy: { createdAt: "asc" } });

  // ═══ S1 schema · ทะเบียน · settings ปริยาย ═══
  const nc = await cols("MemberNotification");
  const evs: Any[] = EV.NOTIF_EVENTS; const chs: string[] = EV.NOTIF_CHANNELS;
  const s0 = await N.getNotificationSettings(ctx);
  const tKeys = Object.keys(s0?.templates ?? {});
  chk("M3.6-S1.1", "migration member_v2_h2: MemberNotification {systemId customerId event channel status scheduledAt sentAt subject body reason refId digestOfId} index(systemId,status,scheduledAt) · NOTIF_EVENTS 8 ตัว (WELCOME POINTS_EARNED POINTS_EXPIRING TIER_UP TIER_AT_RISK VOUCHER_NEW STAMP_COMPLETE REVIEW_REQUEST) label ไทย · transactional 3 ตัวแรก · POINTS_EXPIRING มี leadDays [30,7] · NOTIF_CHANNELS 4 · settings ปริยาย: 8 template × 4 ช่อง body ไทย · LINE/EMAIL/PUSH enabled · SMS enabled false · quietHours {enabled true, 21:00, 08:00} · respectConsent true · transactionalOverride true · smsAvailable false (QC ไม่มี provider)",
    ["systemId", "customerId", "event", "channel", "status", "scheduledAt", "sentAt", "subject", "body", "reason", "refId", "digestOfId"].every((c) => nc.has(c)) && (await hasIdx("MemberNotification", ["systemId", "status", "scheduledAt"])) && evs?.length === 8 && ["WELCOME", "POINTS_EARNED", "POINTS_EXPIRING", "TIER_UP", "TIER_AT_RISK", "VOUCHER_NEW", "STAMP_COMPLETE", "REVIEW_REQUEST"].every((k, i) => evs[i]?.key === k && /[ก-๙]/.test(evs[i]?.label ?? "")) && evs.slice(0, 3).every((e) => e.transactional === true) && evs.slice(3).every((e) => !e.transactional) && JSON.stringify(evs[2]?.leadDays) === "[30,7]" && JSON.stringify(chs) === JSON.stringify(["LINE", "EMAIL", "SMS", "PUSH"]) && tKeys.length === 8 && tKeys.every((k) => chs.every((c) => typeof s0.templates[k].channels?.[c]?.body === "string" && /[ก-๙]/.test(s0.templates[k].channels[c].body))) && s0.templates.WELCOME.channels.LINE.enabled === true && s0.templates.WELCOME.channels.SMS.enabled === false && s0.quietHours?.enabled === true && s0.quietHours.from === "21:00" && s0.quietHours.to === "08:00" && s0.respectConsent === true && s0.transactionalOverride === true && s0.smsAvailable === false,
    "ครบ", `cols=${nc.size} evs=${evs?.map((e) => e.key).join(",")} chs=${JSON.stringify(chs)} tKeys=${tKeys.length} sms=${s0?.templates?.WELCOME?.channels?.SMS?.enabled} quiet=${JSON.stringify(s0?.quietHours)} smsAvail=${s0?.smsAvailable}`);
  const eKey = await fails(() => N.setTemplate(ctx, owner, "NOPE", { enabled: false }));
  const eVar = await fails(() => N.setTemplate(ctx, owner, "WELCOME", { channels: { LINE: { enabled: true, body: "สวัสดี {ชื่อ} {แต้มที่จะหมด}" } } }));
  const eTiming = await fails(() => N.setTemplate(ctx, owner, "WELCOME", { timing: "WEEKLY" }));
  const ePerm = await fails(() => N.setTemplate(ctx, thana, "WELCOME", { enabled: false }));
  await N.setTemplate(ctx, owner, "VOUCHER_NEW", { channels: { LINE: { enabled: true, body: "คุณ{ชื่อ} ได้รับ {voucher} จาก {ร้าน} ใช้ได้ที่ {ลิงก์กระเป๋า}" }, EMAIL: { enabled: true, subject: "สิทธิพิเศษสำหรับ {ชื่อ}", body: "{voucher} รอคุณอยู่" } } });
  const s1 = await N.getNotificationSettings(ctx);
  chk("M3.6-S1.2", "setTemplate: key ไม่รู้จัก → throw ไทย · ตัวแปรนอกทะเบียน ({แต้มที่จะหมด} ใน WELCOME) → throw ไทย · timing WEEKLY → throw · thana → throw · owner แก้ VOUCHER_NEW LINE/EMAIL แล้วอ่านกลับ (ช่องอื่นคงเดิม)", thai(eKey) && thai(eVar) && thai(eTiming) && !!ePerm && s1?.templates?.VOUCHER_NEW?.channels?.LINE?.body?.includes("{voucher}") && s1.templates.VOUCHER_NEW.channels.EMAIL.subject === "สิทธิพิเศษสำหรับ {ชื่อ}" && typeof s1.templates.VOUCHER_NEW.channels.PUSH?.body === "string", "validation", `key=${thai(eKey)} var=${thai(eVar)} timing=${thai(eTiming)} perm=${!!ePerm} line=${s1?.templates?.VOUCHER_NEW?.channels?.LINE?.body}`);

  // ═══ S2 render ═══
  const r1 = N.renderTemplate("สวัสดีคุณ{ชื่อ} คุณมี {แต้ม} แต้ม ({ชื่อ})", { ชื่อ: "สมชาย", แต้ม: 1200 });
  const r2 = N.renderTemplate("หมดอายุ {วันหมดอายุ} ลิงก์ {ลิงก์กระเป๋า}", { วันหมดอายุ: "31 ธ.ค." });
  const vars = await N.buildVars(ctx, E.members[0].id, { voucher: "ส่วนลด ฿100" });
  chk("M3.6-S2.1", "renderTemplate แทนทุกตัว (ซ้ำได้) · ตัวแปรไม่มีค่า → '' ไม่เหลือปีกกา · buildVars(สมาชิก 1) → ชื่อ = ชื่อจริง · ร้าน · ระดับ · แต้ม (ตัวเลข) · ลิงก์กระเป๋า URL เต็ม /m/<slug>/wallet · extra ผ่านมา", r1 === "สวัสดีคุณสมชาย คุณมี 1200 แต้ม (สมชาย)" && r2 === "หมดอายุ 31 ธ.ค. ลิงก์ " && vars?.ชื่อ === E.members[0].firstName && !!vars.ร้าน && !!vars.ระดับ && /^\d+$/.test(String(vars.แต้ม)) && new RegExp(`^https?://.+/m/${mq.MQC.tenantSlug}/wallet`).test(vars.ลิงก์กระเป๋า ?? "") && vars.voucher === "ส่วนลด ฿100", "render ถูก", `r1=${r1} r2=${r2} vars=${JSON.stringify(vars)}`);
  const X = await mkCust("ครบช่อง", { line: true, email: true, consents: ["LINE", "EMAIL", "PUSH"] });
  const dX = mkDeps();
  const sx = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "ส่วนลด ฿100" } }, { now: thaiAt(14), deps: dX.deps });
  const rx = await rows(X, "VOUCHER_NEW");
  const byCh = (r: Any[]) => Object.fromEntries(r.map((x: Any) => [x.channel, x.status]));
  chk("M3.6-S2.2", "send VOUCHER_NEW ให้ X (LINE+อีเมล+ยินยอม · 14:00 ไทย): LINE SENT body render แล้ว (ชื่อ X + voucher + URL) · EMAIL SENT subject 'สิทธิพิเศษสำหรับ <ชื่อ>' · PUSH SKIPPED (ไม่มี PushDevice) · SMS ไม่ถูกส่ง (enabled false) · deps.line 1 (to = LINE externalId หรือ customerId) deps.email 1 (to = อีเมล X) · MemberNotification 3 แถว body ไม่มีปีกกา", byCh(rx).LINE === "SENT" && byCh(rx).EMAIL === "SENT" && byCh(rx).PUSH === "SKIPPED" && !("SMS" in byCh(rx)) && dX.calls.line.length === 1 && dX.calls.email.length === 1 && /ครบช่อง/.test(dX.calls.line[0]?.text ?? dX.calls.line[0]?.body ?? "") && /ส่วนลด ฿100/.test(dX.calls.line[0]?.text ?? dX.calls.line[0]?.body ?? "") && /\/m\/.+\/wallet/.test(dX.calls.line[0]?.text ?? dX.calls.line[0]?.body ?? "") && (dX.calls.email[0]?.subject ?? "") === "สิทธิพิเศษสำหรับ ครบช่อง" && /@example\.com/.test(dX.calls.email[0]?.to ?? "") && rx.every((x: Any) => !/\{[^}]+\}/.test(x.body ?? "")), "SENT ×2", `res=${JSON.stringify(sx?.results)} rows=${JSON.stringify(byCh(rx))} line=${JSON.stringify(dX.calls.line[0]).slice(0, 160)} email=${JSON.stringify(dX.calls.email[0]).slice(0, 120)}`);

  // ═══ S3 consent / transactional / ไม่มีช่องทาง ═══
  const Y = await mkCust("ไม่ยินยอม", { line: true, email: true, consents: ["EMAIL"] });
  const dY = mkDeps();
  const sy = await N.send(ctx, { event: "VOUCHER_NEW", customerId: Y, vars: { voucher: "v" } }, { now: thaiAt(14), deps: dY.deps });
  const ry = byCh(await rows(Y, "VOUCHER_NEW"));
  const rejL = sy?.results?.find((r: Any) => r.channel === "LINE");
  chk("M3.6-S3.1", "Y ยินยอมเฉพาะอีเมล: VOUCHER_NEW (ไม่ใช่ transactional) → LINE SKIPPED reason ไทย 'ไม่ได้ยินยอม' · EMAIL SENT · deps.line 0", ry.LINE === "SKIPPED" && /ยินยอม/.test(rejL?.reason ?? "") && ry.EMAIL === "SENT" && dY.calls.line.length === 0 && dY.calls.email.length === 1, "เคารพยินยอม", `rows=${JSON.stringify(ry)} rej=${JSON.stringify(rejL)}`);
  const dY2 = mkDeps();
  await N.send(ctx, { event: "POINTS_EARNED", customerId: Y, vars: { แต้ม: 50 } }, { now: thaiAt(14), deps: dY2.deps });
  await N.setNotificationSettings(ctx, owner, { transactionalOverride: false });
  const dY3 = mkDeps();
  await N.send(ctx, { event: "WELCOME", customerId: Y }, { now: thaiAt(14), deps: dY3.deps });
  await N.setNotificationSettings(ctx, owner, { transactionalOverride: true, respectConsent: false });
  const dY4 = mkDeps();
  await N.send(ctx, { event: "TIER_UP", customerId: Y, vars: { ระดับ: "Gold" } }, { now: thaiAt(14), deps: dY4.deps });
  await N.setNotificationSettings(ctx, owner, { respectConsent: true });
  chk("M3.6-S3.2", "transactional: POINTS_EARNED ให้ Y (ไม่ยินยอม LINE) → LINE SENT (transactionalOverride true) · ปิด transactionalOverride → WELCOME LINE SKIPPED · respectConsent false → TIER_UP LINE SENT แม้ไม่ยินยอม", byCh(await rows(Y, "POINTS_EARNED")).LINE === "SENT" && dY2.calls.line.length === 1 && byCh(await rows(Y, "WELCOME")).LINE === "SKIPPED" && dY3.calls.line.length === 0 && byCh(await rows(Y, "TIER_UP")).LINE === "SENT" && dY4.calls.line.length === 1, "สวิตช์ทำงาน", `pe=${byCh(await rows(Y, "POINTS_EARNED")).LINE} w=${byCh(await rows(Y, "WELCOME")).LINE} tu=${byCh(await rows(Y, "TIER_UP")).LINE}`);
  const Z = await mkCust("ไม่มีช่อง", { consents: ["LINE", "EMAIL"] });
  const dZ = mkDeps();
  const sz = await N.send(ctx, { event: "WELCOME", customerId: Z }, { now: thaiAt(14), deps: dZ.deps });
  await N.setTemplate(ctx, owner, "STAMP_COMPLETE", { enabled: false });
  const dZ2 = mkDeps();
  const sz2 = await N.send(ctx, { event: "STAMP_COMPLETE", customerId: X }, { now: thaiAt(14), deps: dZ2.deps });
  await N.setTemplate(ctx, owner, "STAMP_COMPLETE", { enabled: true });
  chk("M3.6-S3.3", "Z ไม่มี LINE identity/อีเมล (ยินยอมแล้ว) → LINE/EMAIL SKIPPED reason 'ไม่มีช่องทาง' · เทมเพลตปิด (STAMP_COMPLETE enabled false) → ทุกช่อง SKIPPED ไม่เรียก deps", sz?.results?.every((r: Any) => r.status === "SKIPPED") && sz.results.some((r: Any) => /ช่องทาง/.test(r.reason ?? "")) && dZ.calls.line.length + dZ.calls.email.length === 0 && sz2?.results?.every((r: Any) => r.status === "SKIPPED") && dZ2.calls.line.length + dZ2.calls.email.length === 0, "SKIPPED", `z=${JSON.stringify(sz?.results)} z2=${JSON.stringify(sz2?.results)}`);

  // ═══ S4 quiet hours ═══
  const dQ = mkDeps();
  const sq = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "ดึก" }, refId: `q-${tag}` }, { now: thaiAt(22), deps: dQ.deps });
  const rq = (await rows(X, "VOUCHER_NEW")).filter((x: Any) => x.refId === `q-${tag}`);
  const early = await N.runDue(ctx, { now: thaiAt(7, 30, 1), deps: dQ.deps });
  const rqA = (await rows(X, "VOUCHER_NEW")).filter((x: Any) => x.refId === `q-${tag}`);
  const late = await N.runDue(ctx, { now: thaiAt(8, 1, 1), deps: dQ.deps });
  const rqB = (await rows(X, "VOUCHER_NEW")).filter((x: Any) => x.refId === `q-${tag}`);
  chk("M3.6-S4.1", "22:00 ไทย (quiet 21:00–08:00) → LINE/EMAIL QUEUED scheduledAt = พรุ่งนี้ 08:00 ไทย · deps 0 · runDue(07:30 พรุ่งนี้) → ยัง QUEUED · runDue(08:01) → SENT sentAt · deps.line 1 · deps.email 1", sq?.results?.filter((r: Any) => r.status === "QUEUED").length === 2 && rq.length >= 2 && rq.every((x: Any) => x.status === "QUEUED" && thaiHM(new Date(x.scheduledAt)) === "08:00" && new Date(x.scheduledAt) > thaiAt(22)) && dQ.calls.line.length < 1 && (early?.sent ?? 0) === 0 && rqA.every((x: Any) => x.status === "QUEUED") && (late?.sent ?? 0) >= 2 && rqB.every((x: Any) => x.status === "SENT" && !!x.sentAt) && dQ.calls.line.length === 1 && dQ.calls.email.length === 1, "เลื่อนเช้า", `res=${JSON.stringify(sq?.results)} sched=${rq.map((x: Any) => thaiHM(new Date(x.scheduledAt))).join(",")} early=${JSON.stringify(early)} late=${JSON.stringify(late)} after=${rqB.map((x: Any) => x.status).join(",")}`);
  await N.setNotificationSettings(ctx, owner, { quietHours: { enabled: false, from: "21:00", to: "08:00" } });
  const dQ2 = mkDeps();
  const sq2 = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "ดึกไม่เงียบ" } }, { now: thaiAt(23), deps: dQ2.deps });
  await N.setNotificationSettings(ctx, owner, { quietHours: { enabled: true, from: "21:00", to: "08:00" } });
  const dQ3 = mkDeps();
  const sq3 = await N.send(ctx, { event: "POINTS_EARNED", customerId: X, vars: { แต้ม: 10 } }, { now: thaiAt(2), deps: dQ3.deps });
  chk("M3.6-S4.2", "ปิด quiet hours → 23:00 ส่งทันที SENT · เปิดกลับ → 02:00 (ข้ามเที่ยงคืนยังอยู่ในช่วง) → QUEUED 08:00 วันเดียวกัน", sq2?.results?.some((r: Any) => r.channel === "LINE" && r.status === "SENT") && dQ2.calls.line.length === 1 && sq3?.results?.some((r: Any) => r.channel === "LINE" && r.status === "QUEUED") && dQ3.calls.line.length === 0, "ช่วงข้ามคืน", `off=${JSON.stringify(sq2?.results)} 02=${JSON.stringify(sq3?.results)}`);

  // ═══ S5 digest รวมรายวัน ═══
  await N.setTemplate(ctx, owner, "POINTS_EARNED", { timing: "DAILY_DIGEST", digestHour: 9 });
  const dD = mkDeps();
  await N.send(ctx, { event: "POINTS_EARNED", customerId: X, vars: { แต้ม: 30 }, refId: `d1-${tag}` }, { now: thaiAt(10), deps: dD.deps });
  await N.send(ctx, { event: "POINTS_EARNED", customerId: X, vars: { แต้ม: 45 }, refId: `d2-${tag}` }, { now: thaiAt(15), deps: dD.deps });
  const dq = (await rows(X, "POINTS_EARNED")).filter((x: Any) => [`d1-${tag}`, `d2-${tag}`].includes(x.refId));
  const dig = await N.runDue(ctx, { now: thaiAt(9, 5, 1), deps: dD.deps });
  const dqA = (await rows(X, "POINTS_EARNED")).filter((x: Any) => [`d1-${tag}`, `d2-${tag}`].includes(x.refId));
  const digRow = await P.memberNotification.findFirst({ where: { customerId: X, event: "DIGEST", channel: "LINE" }, orderBy: { createdAt: "desc" } });
  chk("M3.6-S5.1", "timing DAILY_DIGEST 09:00: ส่ง 2 ครั้ง (10:00, 15:00) → QUEUED ×2/ช่องทาง scheduledAt พรุ่งนี้ 09:00 · deps 0 · runDue(09:05 พรุ่งนี้) → LINE 1 ข้อความรวม 2 บรรทัด (มี 30 และ 45) · แถวเดิม DIGESTED digestOfId → แถว DIGEST SENT · digested 4 (LINE 2 + EMAIL 2) · deps.line 1 deps.email 1", dq.filter((x: Any) => x.channel === "LINE").length === 2 && dq.every((x: Any) => x.status === "QUEUED" && thaiHM(new Date(x.scheduledAt)) === "09:00") && dD.calls.line.length < 1 && (dig?.digested ?? 0) >= 4 && dqA.every((x: Any) => x.status === "DIGESTED" && !!x.digestOfId) && !!digRow && digRow.status === "SENT" && /30/.test(digRow.body) && /45/.test(digRow.body) && dD.calls.line.length === 1 && dD.calls.email.length === 1 && /30[\s\S]*45|45[\s\S]*30/.test(dD.calls.line[0]?.text ?? dD.calls.line[0]?.body ?? ""), "รวม 1 ข้อความ", `q=${dq.map((x: Any) => `${x.channel}:${x.status}@${thaiHM(new Date(x.scheduledAt))}`).join(",")} dig=${JSON.stringify(dig)} after=${dqA.map((x: Any) => x.status).join(",")} digRow=${digRow?.body?.slice(0, 80)} line=${dD.calls.line.length}`);
  const dD2 = mkDeps();
  await N.send(ctx, { event: "POINTS_EARNED", customerId: X, vars: { แต้ม: 5 }, refId: `d3-${tag}` }, { now: thaiAt(10), deps: dD2.deps });
  await N.send(ctx, { event: "POINTS_EARNED", customerId: Y, vars: { แต้ม: 7 }, refId: `d4-${tag}` }, { now: thaiAt(10), deps: dD2.deps });
  const dig2 = await N.runDue(ctx, { now: thaiAt(9, 5, 1), deps: dD2.deps });
  const dig3 = await N.runDue(ctx, { now: thaiAt(9, 6, 1), deps: dD2.deps });
  await N.setTemplate(ctx, owner, "POINTS_EARNED", { timing: "IMMEDIATE" });
  chk("M3.6-S5.2", "digest แยกต่อลูกค้า: X 1 รายการ + Y 1 รายการ → runDue ส่ง LINE 2 ข้อความ (คนละคน) · runDue ซ้ำ → 0 (ไม่ส่งซ้ำ)", dD2.calls.line.length === 2 && new Set(dD2.calls.line.map((c: Any) => c.to ?? c.customerId ?? c.contactId)).size === 2 && (dig3?.sent ?? 0) + (dig3?.digested ?? 0) === 0, "แยกคน + idempotent", `dig2=${JSON.stringify(dig2)} dig3=${JSON.stringify(dig3)} line=${dD2.calls.line.length}`);

  // ═══ S6 stats ═══
  const stt = await N.stats(ctx, owner, {});
  const sentN = await P.memberNotification.count({ where: { systemId: SYS, status: "SENT", customerId: { in: made.customers } } });
  chk("M3.6-S6.1", "stats เดือนนี้ {sent, failed, skipped, queued, byChannel{LINE,EMAIL,SMS,PUSH}, byEvent} · sent ≥ จำนวน SENT ของลูกค้าทดสอบ · byChannel.LINE ≥ 5 · byEvent.VOUCHER_NEW ≥ 2 · thana (ไม่มี settings.manage) → throw", stt?.sent >= sentN && sentN >= 8 && stt.byChannel?.LINE >= 5 && stt.byEvent?.VOUCHER_NEW >= 2 && typeof stt.skipped === "number" && typeof stt.queued === "number" && !!(await fails(() => N.stats(ctx, thana, {}))), "นับถูก", `stats=${JSON.stringify(stt)} sentN=${sentN}`);

  // ═══ S7 SMS ═══
  await N.setTemplate(ctx, owner, "VOUCHER_NEW", { channels: { SMS: { enabled: true, body: "{ร้าน}: {voucher}" } } });
  const dS = mkDeps(); delete (dS.deps as Any).sms;
  const ss = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "SMS" }, refId: `s1-${tag}` }, { now: thaiAt(14), deps: dS.deps });
  const smsR = ss?.results?.find((r: Any) => r.channel === "SMS");
  const smsSrc = read("src/lib/core/sms.ts");
  chk("M3.6-S7.1", "SMS enabled แต่ QC ไม่มี provider (core/sms.ts getSmsProvider() null · ไม่มี deps.sms) → SMS SKIPPED reason 'ไม่มีผู้ให้บริการ SMS' · LINE/EMAIL ยัง SENT · settings.smsAvailable false", smsR?.status === "SKIPPED" && /SMS/.test(smsR.reason ?? "") && /[ก-๙]/.test(smsR.reason ?? "") && ss.results.find((r: Any) => r.channel === "LINE")?.status === "SENT" && /getSmsProvider|smsProvider/.test(smsSrc), "SMS ปิด", `sms=${JSON.stringify(smsR)} src=${/getSmsProvider|smsProvider/.test(smsSrc)}`);
  const dS2 = mkDeps();
  const ss2 = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "SMS2" }, refId: `s2-${tag}` }, { now: thaiAt(14), deps: dS2.deps });
  const W = await mkCust("ไม่มีเบอร์", { line: true, phone: false, consents: ["LINE", "SMS"] });
  const dS3 = mkDeps();
  const ss3 = await N.send(ctx, { event: "VOUCHER_NEW", customerId: W, vars: { voucher: "x" } }, { now: thaiAt(14), deps: dS3.deps });
  await N.setTemplate(ctx, owner, "VOUCHER_NEW", { channels: { SMS: { enabled: false, body: "{ร้าน}: {voucher}" } } });
  chk("M3.6-S7.2", "ฉีด deps.sms → SMS SENT (to = เบอร์ X · body 'ร้าน: SMS2' ไม่มีปีกกา) · X ไม่ยินยอม SMS → ต้อง SKIPPED? — X ยินยอม LINE/EMAIL/PUSH เท่านั้น ⇒ SMS SKIPPED ยินยอม (respectConsent) · W ยินยอม SMS แต่ไม่มีเบอร์ → SKIPPED ไม่มีช่องทาง", (() => { const r = ss2?.results?.find((x: Any) => x.channel === "SMS"); return r?.status === "SKIPPED" && /ยินยอม/.test(r.reason ?? ""); })() && dS2.calls.sms.length === 0 && (() => { const r = ss3?.results?.find((x: Any) => x.channel === "SMS"); return r?.status === "SKIPPED" && /ช่องทาง|เบอร์/.test(r.reason ?? ""); })() && dS3.calls.sms.length === 0, "SMS ตามกติกา", `x=${JSON.stringify(ss2?.results?.find((x: Any) => x.channel === "SMS"))} w=${JSON.stringify(ss3?.results?.find((x: Any) => x.channel === "SMS"))}`);
  await PV.setConsent(ctx, owner, X, { channel: "SMS", granted: true, source: "STAFF" }).catch(() => null);
  await N.setTemplate(ctx, owner, "VOUCHER_NEW", { channels: { SMS: { enabled: true, body: "{ร้าน}: {voucher}" } } });
  const dS4 = mkDeps();
  const ss4 = await N.send(ctx, { event: "VOUCHER_NEW", customerId: X, vars: { voucher: "SMS4" }, refId: `s4-${tag}` }, { now: thaiAt(14), deps: dS4.deps });
  await N.setTemplate(ctx, owner, "VOUCHER_NEW", { channels: { SMS: { enabled: false, body: "{ร้าน}: {voucher}" } } });
  chk("M3.6-S7.3", "X ยินยอม SMS + deps.sms → SMS SENT · deps.sms[0] { to = เบอร์ X (0866…), text/body มี 'SMS4' ไม่มีปีกกา }", ss4?.results?.find((x: Any) => x.channel === "SMS")?.status === "SENT" && dS4.calls.sms.length === 1 && /^0866|^\+66866/.test(dS4.calls.sms[0]?.to ?? "") && /SMS4/.test(dS4.calls.sms[0]?.text ?? dS4.calls.sms[0]?.body ?? "") && !/\{/.test(dS4.calls.sms[0]?.text ?? dS4.calls.sms[0]?.body ?? ""), "SENT", `r=${JSON.stringify(ss4?.results?.find((x: Any) => x.channel === "SMS"))} sms=${JSON.stringify(dS4.calls.sms[0])}`);

  // ═══ S8 hooks / testSend / UI ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const nsrc = read("src/lib/modules/member/notifications.ts"); const rvsrc = read("src/lib/modules/member/reviews.ts");
  const hooked = (ev: string) => /notif|notifications/i.test(consumers.split(`"${ev}"`)[1]?.slice(0, 500) ?? "");
  const cronSrc = read("src/app/api/cron/member-notifications/route.ts") + read("src/app/api/cron/member/route.ts") + read("src/lib/modules/member/notifications-cron.ts");
  const dT = mkDeps();
  const ts = await N.testSend(ctx, owner, "POINTS_EXPIRING", "EMAIL", { deps: dT.deps });
  chk("M3.6-S8.1", "consumers: member.created / point.earned / member.tier.changed / member.tier.at_risk / voucher.issued / stamp.completed → เรียก notifications.send · cron (point.expiring ตาม leadDays + runDue) มีจริง · M3.4 requestReview ใช้ REVIEW_REQUEST · testSend(POINTS_EXPIRING, EMAIL) → preview.body ไม่มีปีกกา + deps.email 1 ถึงอีเมล owner · thana → throw · ไม่มี any", ["member.created", "point.earned", "member.tier.changed", "member.tier.at_risk", "voucher.issued", "stamp.completed"].every(hooked) && /runDue/.test(cronSrc) && /POINTS_EXPIRING|point\.expiring/.test(cronSrc + nsrc) && /REVIEW_REQUEST/.test(rvsrc) && typeof ts?.preview?.body === "string" && !/\{[^}]+\}/.test(ts.preview.body) && dT.calls.email.length === 1 && !!(await fails(() => N.testSend(ctx, thana, "WELCOME", "LINE", { deps: mkDeps().deps }))) && !/:\s*any\b/.test(nsrc), "ต่อครบ", `hooks=${["member.created", "point.earned", "member.tier.changed", "member.tier.at_risk", "voucher.issued", "stamp.completed"].filter((e) => !hooked(e)).join(",") || "-"} cron=${/runDue/.test(cronSrc)} rv=${/REVIEW_REQUEST/.test(rvsrc)} ts=${JSON.stringify(ts?.preview).slice(0, 100)} email=${dT.calls.email.length}`);
  const pageSrc = read("src/app/app/sys/[id]/member/settings/notifications/page.tsx");
  const actSrc = read("src/lib/modules/member/notifications-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /notif/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = pageSrc + comps;
  const TIDS = ["notif-page", "notif-table", "notif-row-", "notif-chip-", "notif-panel", "notif-panel-tabs", "notif-panel-body", "notif-vars", "notif-preview", "notif-lead-days", "notif-quiet", "notif-consent", "notif-test-send", "notif-save", "notif-month-summary", "notif-sms-unavailable"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["การแจ้งเตือนสมาชิก", "ต้อนรับสมาชิกใหม่", "ได้แต้ม", "แต้มใกล้หมดอายุ", "เลื่อนระดับ", "ใกล้ลดระดับ", "voucher ใหม่", "สแตมป์ครบ", "ขอรีวิว", "ส่งเมื่อ", "ทันที", "รวมรายวัน", "ใช้งาน", "ปิดอยู่", "ตัวแปร", "ตัวอย่าง", "วันก่อน", "ห้ามส่งช่วง", "เคารพความยินยอม", "ทดสอบส่งหาตัวเอง", "บันทึก", "เดือนนี้", "ผู้ให้บริการ SMS"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const nav = read("src/lib/modules/member/nav.ts");
  chk("M3.6-S8.2", "หน้า /member/settings/notifications มีจริง requireTenant · actions 'use server' + member.settings.manage · testid 16 · ป้ายภาพ 30 ครบ · nav/settings มีทางเข้า · ไม่มีอีโมจิ (✓/✗ ใช้ MemberIcon)/hex", pageSrc.length > 0 && /requireTenant/.test(pageSrc) && /["']use server["']/.test(actSrc) && /member\.settings\.manage/.test(actSrc) && missingT.length === 0 && missingL.length === 0 && /notifications/.test(nav + read("src/app/app/sys/[id]/member/settings/page.tsx")) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")), "ครบ", `page=${pageSrc.length > 0} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.6`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.6-S8.3", "ภาพ 30: notifications-owner desktop+mobile 200 ไม่ล้น (ตาราง 8 แถว · ชิป 4 ช่อง · แถบสรุปเดือน) · notifications-edit-owner desktop 200 (คลิกแถว 'แต้มใกล้หมดอายุ' → แผงขวา แท็บ 4 · ตัวแปร · ตัวอย่างบับเบิล · 30/7 วันก่อน · สวิตช์ quiet/consent · ปุ่มทดสอบ/บันทึก) · thana (ไม่มีสิทธิ์) → 403/redirect", ok("owner", "notifications-owner", "desktop") && ok("owner", "notifications-owner", "mobile") && ok("owner", "notifications-edit-owner", "desktop") && [403, 302, 307].includes(r("thana", "notifications-thana", "desktop")?.status ?? (r("thana", "notifications-thana", "desktop")?.finalUrl?.includes("/member") && !r("thana", "notifications-thana", "desktop")?.finalUrl?.includes("notifications") ? 302 : 0)), "200 ×3 + 403", `${r("owner", "notifications-owner", "desktop")?.status}/${r("owner", "notifications-owner", "mobile")?.status}/${r("owner", "notifications-edit-owner", "desktop")?.status} thana=${r("thana", "notifications-thana", "desktop")?.status} missing=${JSON.stringify(r("owner", "notifications-edit-owner", "desktop")?.missing)}`);
  chk("M3.6-S8.4", "🔴 parity ภาพ 30 — Fable ตรวจด้วยตา · wo-notes/member-M3.6.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.6.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.6-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.customers.length) {
    await d(() => P.memberNotification.deleteMany({ where: { customerId: { in: made.customers } } }));
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["member.", "point."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.6: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
