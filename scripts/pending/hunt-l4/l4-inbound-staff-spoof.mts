// L4 probe — inbound mail "sent by staff" (direction OUT) without any proof the From is genuine.
// Throwaway tenant `qc-hunt-l4-*` on QC2 only; everything it wrote is deleted in finally. No network (copyMode NONE, no attachments).
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l4/l4-inbound-staff-spoof.mts
import { randomBytes } from "node:crypto";
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (/ep-royal-night|ep-plain-art/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL))) { console.log("not QC2 — stop"); process.exit(4); }
globalThis.fetch = (async () => { throw new Error("network blocked in probe"); }) as typeof fetch;
const { prisma: P } = (await import("@/lib/core/db")) as Any;
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const TAG = `qc-hunt-l4-${randomBytes(4).toString("hex")}`;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const KEY = Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");
const INADDR = `crm+${KEY}@shark.in.th`;
const VER = `${TAG}-shop.example`; // shop's VERIFIED sending domain
const USERS: string[] = [];
let tid = "";
try {
  const owner = await P.user.create({ data: { email: `owner@${VER}`, name: `QC owner ${TAG}` } });
  USERS.push(owner.id);
  const staff2 = await P.user.create({ data: { email: `${TAG}-sales@gmail-like.example`, name: `QC sales ${TAG}` } });
  USERS.push(staff2.id);
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  await P.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: staff2.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: false, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } }), crm);
  await P.emailDomain.create({ data: { tenantId: tid, domain: VER, status: "VERIFIED", verifiedAt: new Date() } });
  const party = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
  const cust = await P.crmContact.create({ data: { tenantId: tid, systemId: crm, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", email: `buyer@${TAG}-cust.example`, partyId: party.id, ownerUserId: owner.id } });
  const mail = (from: string, headers: Record<string, string>) => ({
    messageId: `<${TAG}-${randomBytes(4).toString("hex")}@attacker.example>`, from, to: [cust.email, INADDR], cc: [],
    subject: "ยืนยันส่วนลด 50% ตามที่คุยกัน", text: "ยืนยันส่วนลด 50% — ทีมขาย", html: "<p>ยืนยันส่วนลด 50% — ทีมขาย</p>", headers, attachments: [],
  });
  const show = async (label: string, r: Any) => {
    const row = r?.emailId ? await P.crmEmailMessage.findFirst({ where: { id: r.emailId }, select: { direction: true, sentById: true, contactId: true } }) : null;
    const act = row ? await P.crmActivity.count({ where: { tenantId: tid, contactId: cust.id, type: "EMAIL" } }) : 0;
    console.log(`${label}: handled=${r?.handled} reason=${r?.reason ?? "-"} dir=${row?.direction} sentById=${row?.sentById === owner.id ? "OWNER" : row?.sentById === staff2.id ? "STAFF2" : row?.sentById} contact=${row?.contactId === cust.id ? "victim customer" : row?.contactId} emailActivitiesOnContact=${act}`);
  };
  // A) verified-domain branch: plain spoof, NO authentication evidence at all
  await show("A  From owner@<verified domain>, no headers", await EM.ingestInbound(mail(`"เจ้าของร้าน" <owner@${VER}>`, {})));
  // B) header branch: attacker writes its own Authentication-Results (any authserv-id) for a non-verified staff domain
  await show("B  From staff@gmail-like, forged A-R", await EM.ingestInbound(mail(staff2.email, { "authentication-results": `attacker.example; dkim=pass header.d=gmail-like.example` })));
  // C) same via X-Authentication-Results (no MTA ever strips that one)
  await show("C  From staff@gmail-like, forged X-A-R", await EM.ingestInbound(mail(staff2.email, { "x-authentication-results": `x; spf=pass smtp.mailfrom=gmail-like.example` })));
  // control: no evidence, non-verified domain ⇒ must be IN
  await show("ctl From staff@gmail-like, no headers", await EM.ingestInbound(mail(staff2.email, {})));
} finally {
  if (tid) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => r.table_name as string).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (let pass = 0; pass < 4; pass += 1) for (const tb of tables) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid).catch(() => null);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => null);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => null);
    await P.businessUnit.deleteMany({ where: { tenantId: tid } }).catch(() => null);
    await P.tenant.delete({ where: { id: tid } }).catch(() => null);
  }
  for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => null);
  const left = tid ? await P.tenant.count({ where: { id: tid } }) : 0;
  const leftU = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
  console.log(`cleanup: tenants left=${left} users left=${leftU}`);
  await P.$disconnect();
}
process.exit(0);
