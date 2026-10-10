// C5.5 hunt 3 probe — read-only on product code; own throwaway tenant on QC3; CLEAN at the end.
//   S1  inbound per-sender bucket (fix2) is counted BEFORE sender proof ⇒ forged mail in a customer's name locks that customer's
//       genuine (thread-proven / A-R-proven) replies out for the rest of the hour, silently (handled:false · reason rate_limited)
//   X1  lens: PDPA person export (privacy.exportContact) silently truncates a table at its `take` (CrmScoreLog 5,000)
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt3/probe-hunt3.mts
// A check marked "FINDING" is expected RED on 53d88b71 (it asserts the safe behaviour); controls must be GREEN.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-hunt3: QC3 only (host=${host})`);
  process.exit(4);
}
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-hunt3: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-h3-${rand}`;
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING check)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
};
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
};
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const AUTHSERV = "mx.qc-h3.test";
let T = "";
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: false, copyMode: "NONE", copyToAddr: null } }),
    S,
  );
  const INBOX = `crm+${KEY}@shark.in.th`;
  const mkContact = async (label: string, email: string) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: T, systemId: S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email } });
  };
  // OUT mail of the shop (the parent a genuine reply cites) — inserted directly, no network
  const mkParent = async (contact: Any, n: number) => {
    const rfc = `${TAG}-parent-${n}@shark.test`;
    await P.crmEmailMessage.create({
      data: {
        tenantId: T, systemId: S, contactId: contact.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"),
        fromAddr: `sales@${TAG}.test`, toAddrs: [contact.email], subject: `ใบเสนอราคา ${TAG} ${n}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000),
        trackTokenHash: randomBytes(16).toString("hex"),
      },
    });
    return rfc;
  };
  let n = 0;
  const mail = (o: Record<string, unknown>) => ({ messageId: `<${TAG}-${++n}@probe.test>`, from: "x@probe.test", to: [INBOX], cc: [], subject: `เรื่อง ${TAG} ${n}`, text: "สวัสดี", html: "", headers: {}, attachments: [], ...o });
  const deps = { transport: async () => ({ ok: true, id: "copy" }) };
  const ingest = (m: Any) => CRM.emails.ingestInbound(m, deps);

  // ════════ S1 · per-sender bucket counted before proof ════════
  const victim = await mkContact("ลูกค้าจริง", `buyer-${rand}@bigclient.qc.invalid`);
  const other = await mkContact("ลูกค้าอีกคน", `other-${rand}@bigclient.qc.invalid`);
  const pv = await mkParent(victim, 1);
  const po = await mkParent(other, 2);
  await sub("S1", async () => {
    // control: before the flood, the victim's genuine thread-proven reply is stored
    const r0 = await ingest(mail({ from: `"Buyer" <${victim.email}>`, subject: `Re: ใบเสนอราคา ${TAG} 1`, headers: { "in-reply-to": `<${pv}>` } }));
    chk("S1.0", "control: victim's genuine reply (cites our OUT Message-ID, From = its recipient) is stored before any flood", r0.ok && r0.handled && !!r0.emailId, JSON.stringify(r0));
    // attacker: 99 forged mails in the victim's name (no proof, no thread) — fills the per-(system, From) bucket to 100
    let stored = 0;
    let firstDrop = -1;
    for (let i = 0; i < 99; i += 1) {
      const r = await ingest(mail({ from: victim.email, subject: `ด่วน เปลี่ยนเลขบัญชี ${i}` }));
      if (r.handled) stored += 1;
      else if (firstDrop < 0) firstDrop = i;
    }
    const forgedRows = await P.crmEmailMessage.count({ where: { systemId: S, contactId: victim.id, direction: "IN", subject: { startsWith: "ด่วน" } } });
    chk("S1.1", "control (premise): the 99 forged mails are accepted and stored on the victim's timeline (flagged unverified)", stored === 99 && forgedRows === 99, `stored=${stored} rows=${forgedRows} firstDrop=${firstDrop}`);
    // the victim now answers the real thread — thread proof present
    const r1 = await ingest(mail({ from: victim.email, subject: `Re: ใบเสนอราคา ${TAG} 1`, text: "อย่าโอน — ไม่ใช่เราส่ง", headers: { "in-reply-to": `<${pv}>` } }));
    chk("S1.2", "FINDING: after 99 forged mails in the victim's name, the victim's genuine thread-proven reply is still stored (RV2-3 promise: proven/thread mail always gets in)", r1.handled === true, JSON.stringify(r1), true);
    // with A-R proof too (P14 set in-process for this check only)
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    const ar = { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=bigclient.qc.invalid; dmarc=pass header.from=bigclient.qc.invalid` };
    const r2 = await ingest(mail({ from: victim.email, subject: "ยืนยันตัวตน", headers: ar }));
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    chk("S1.3", "FINDING: a DMARC-proven mail from the victim (A-R pass of our MTA) is still stored after the flood", r2.handled === true, JSON.stringify(r2), true);
    // control: another customer's genuine reply is unaffected (the drop is the per-sender bucket, not the system bucket)
    const r3 = await ingest(mail({ from: other.email, subject: `Re: ใบเสนอราคา ${TAG} 2`, headers: { "in-reply-to": `<${po}>` } }));
    chk("S1.4", "control: another customer's thread-proven reply is stored (system bucket not involved)", r3.handled === true, JSON.stringify(r3));
    const audits = await P.auditLog.findMany({ where: { tenantId: T, action: "crm.email.inbound.rate_limited" }, select: { after: true } });
    const notes = await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id, title: { contains: "เพดาน" } } });
    chk("S1.5", "control (mechanism): exactly one sender-bucket audit line, no owner notification for the sender bucket (owner is not told the customer's mail is being dropped)",
      audits.length === 1 && (audits[0]?.after as Any)?.bucket === "sender" && notes === 0, `audits=${JSON.stringify(audits.map((a: Any) => a.after))} ownerNotices=${notes}`);
    const victimReplies = await P.crmEmailMessage.count({ where: { systemId: S, contactId: victim.id, direction: "IN", subject: { startsWith: "Re:" } } });
    chk("S1.6", "FINDING: both genuine victim replies exist as rows (the second one is lost with no bounce — provider got 200)", victimReplies === 2, `genuineRepliesStored=${victimReplies}`, true);
  });

  // ════════ X1 · lens: PDPA person export truncates silently ════════
  await sub("X1", async () => {
    const k = await mkContact("ส่งออก", `export-${rand}@qc.invalid`);
    const N = 5_100;
    const rows = Array.from({ length: N }, (_v, i) => ({ tenantId: T, contactId: k.id, points: 1, reason: `probe ${i}`, createdAt: new Date(Date.now() - (N - i) * 60_000) }));
    for (let i = 0; i < rows.length; i += 1_000) await P.crmScoreLog.createMany({ data: rows.slice(i, i + 1_000) });
    const inDb = await P.crmScoreLog.count({ where: { tenantId: T, contactId: k.id } });
    const bundle = await CRM.privacy.exportContact({ tenantId: T, systemId: S, actorUserId: u.id }, owner, k.id);
    const got = (bundle?.tables?.CrmScoreLog ?? []).length;
    const marker = JSON.stringify(bundle).includes("truncat") || JSON.stringify(bundle).includes("ตัด");
    chk("X1.0", "control: the contact really has more score-log rows than the export cap", inDb === N, `inDb=${inDb}`);
    chk("X1.1", "FINDING: the person export holds every CrmScoreLog row of the data subject, or says the table was truncated", got === inDb || marker, `exported=${got} of ${inDb} · truncationMarker=${marker}`, true);
  });
} finally {
  if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
  else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  await new Promise((r) => setTimeout(r, 1_000));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
  }
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  const buckets = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, SYSTEMS.map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  if (T) chk("CLEAN", "throwaway tenant, user, system and rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks RED (= finding reproduced) ${findings.filter((c) => !c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "not reproduced" : "REPRODUCED"]) })}`);
process.exit(controls.every((c) => c.ok) ? 0 : 1);
