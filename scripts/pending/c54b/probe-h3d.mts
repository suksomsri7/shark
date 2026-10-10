// probe-h3d.mts — C5.4-B round 4 (hunter H3d/H4): erase masks CRM system messages already posted in a team room (author `system:*`),
//   never touches a human's message, and a phone shared with a LIVE contact is not masked in other people's notifications (QC2 only · throwaway tenant)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54b/probe-h3d.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !String(process.env.DATABASE_URL ?? "").includes("ep-cool-shadow")) { console.log(`REFUSE: not QC2 (${host})`); process.exit(2); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-c54b-h3d-${rand}`;
const TENANTS: string[] = []; const USERS: string[] = [];
const out: Record<string, unknown> = { tag: TAG };
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MT = (await import("@/lib/modules/meeting" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string; TENANTS.push(T);
  const u = await P.user.create({ data: { email: `${TAG}-o@qc.invalid`, name: `QC o ${TAG}` } }); USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $2::jsonb WHERE "id" = $1`, S, JSON.stringify({ crm: { uiVersion: 2 } }));
  const M = (await sysSvc.createSystem(T, "MEETING", `MT ${TAG}`)).id as string;
  const ch = await P.meetingChannel.create({ data: { tenantId: T, systemId: M, name: `room-${rand}`, createdByUserId: u.id } });
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const FULL = `สมหญิง${rand} ทดสอบลบ${rand}`;
  const OFFICE = "021234567";
  const X = await CRM.contacts.createContact(ctx, owner, { firstName: `สมหญิง${rand}`, lastName: `ทดสอบลบ${rand}`, phone: OFFICE });
  const xId = X?.row?.id ?? X?.contact?.id ?? X?.id;
  // a LIVE colleague on the same office line (created raw — dedupe would refuse the same phone through the service)
  await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `เพื่อนร่วมงาน ${rand}`, firstName: `เพื่อนร่วมงาน`, phone: OFFICE, ownerUserId: u.id } });
  await MT.postSystemMessage({ tenantId: T, systemId: M, channelId: ch.id, body: `🎉 ปิดดีลได้แล้ว: ต่อสัญญา ${FULL} · ฿1,000` });
  await P.meetingMessage.create({ data: { tenantId: T, systemId: M, channelId: ch.id, authorUserId: u.id, body: `ผมคุยกับ ${FULL} แล้ว` } });
  await P.appNotification.create({ data: { tenantId: T, recipientUserId: u.id, title: `โทรกลับเบอร์สำนักงาน 02-123-4567`, body: "x" } });
  const er = await CRM.privacy.eraseContact(ctx, owner, { contactId: xId, confirm: true, reason: `probe h3d ${TAG}` });
  const msgs = (await P.meetingMessage.findMany({ where: { tenantId: T }, select: { authorUserId: true, body: true } })) as Any[];
  const note = await P.appNotification.findFirst({ where: { tenantId: T, recipientUserId: u.id }, select: { title: true } });
  out.erase = er?.erased;
  out.systemPostHasName = msgs.filter((m) => String(m.authorUserId).startsWith("system:")).some((m) => String(m.body).includes(FULL));
  out.humanPostKept = msgs.filter((m) => !String(m.authorUserId).startsWith("system:")).some((m) => String(m.body).includes(FULL));
  out.sharedOfficePhoneKeptInNotification = String(note?.title ?? "").includes("02-123-4567");
  out.VERDICT = out.erase === true && out.systemPostHasName === false && out.humanPostKept === true && out.sharedOfficePhoneKeptInNotification === true ? "GREEN" : "RED";
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 3).join("\n")}` : String(e);
} finally {
  for (let pass = 0; pass < 3; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  out.cleanup = { tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }), usersLeft: await P.user.count({ where: { id: { in: USERS } } }) };
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}
