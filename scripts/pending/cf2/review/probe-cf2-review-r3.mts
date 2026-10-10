// C5.5-fix2 ROUND 3 — reviewer probe: R2b-1 race (switchCompany vs re-invite) both interleavings, ≥40 trials
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf2/review/probe-cf2-review-r3.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
process.env.QC_OTP_PREVIEW = "1";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const settle = async (p: Promise<Any>): Promise<{ ok: true; v: Any } | { ok: false; err: string }> => p.then((v: Any) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, err: e instanceof Error ? `${e.name}:${e.message}` : String(e) }));

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf2s-${rand}`;
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const AUTHSERV = "mx.qc-cf2s.test";
let T = "";
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  const setCrm = async (crm: Record<string, unknown>) =>
    P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crm), S);
  const EMAIL_SETTINGS = { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null };
  const PORTAL = { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] };
  await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: PORTAL });
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const INBOX = `crm+${KEY}@shark.in.th`;
  let n = 0;
  const mkContact = async (label: string, email: string | null) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: u.id, email } });
    await P.crmContactConsent.create({ data: { tenantId: T, systemId: S, contactId: k.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 300_000) } });
    return k;
  };
  const mkCompany = async (name: string, extra: Record<string, unknown> = {}) => {
    const party = await P.party.create({ data: { tenantId: T, name, kind: "COMPANY" } });
    return P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: party.id, name, ownerUserId: u.id, ...extra } });
  };
  const mail = (o: Record<string, unknown>) => ({ messageId: `<${TAG}-${++n}@probe.test>`, from: "x@probe.test", to: [INBOX], cc: [], subject: `เรื่อง ${TAG} ${n}`, text: "สวัสดี", html: "<p>สวัสดี</p>", headers: {}, attachments: [], ...o });
  const COPIES: Any[] = [];
  const deps = { transport: async (m: Any) => { COPIES.push(m); return { ok: true, id: `copy-${COPIES.length}` }; } };
  const ingest = (m: Any) => CRM.emails.ingestInbound(m, deps);
  const rowOf = (id: string | undefined) => (id ? P.crmEmailMessage.findUnique({ where: { id } }) : null);
  const AR = (domain: string) => ({ "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${domain}; dkim=pass header.d=${domain}; dmarc=pass header.from=${domain}` });
  const evtOf = async (type: string, emailId: string) => (await P.outboxEvent.findMany({ where: { tenantId: T, type } })).find((e: Any) => e.payload?.emailId === emailId);
  const fillBucket = async (key: string, count: number) => P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
  const bucketCount = async (key: string) => Number((await P.chatRateBucket.findFirst({ where: { key }, select: { count: true } }))?.count ?? 0);
  const senderKey = (from: string) => `crm.email.in.from.${S}.${sha(`from:${from.toLowerCase()}`).slice(0, 32)}`;
  const sysKey = `crm.email.in.sys.${S}`;


  // ════════ R3 · R2b-1 race, both interleavings, ≥40 trials ════════
  await sub("R3", async () => {
    const meta = { ip: "203.0.113.240", userAgent: "lost-phone" };
    let seq = 0;
    const setup = async () => {
      const lbl = `t${++seq}`;
      const coA = await mkCompany(`A ${lbl} ${TAG}`);
      const coB = await mkCompany(`B ${lbl} ${TAG}`);
      const k = await mkContact(`race ${lbl}`, `race-${lbl}-${rand}@qc.invalid`);
      for (const co of [coA, coB]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: k.id, isPrimary: co.id === coA.id, startedAt: new Date(Date.now() - 600_000) } });
      const iA = await CRM.portal.invite(ctx, owner, { companyId: coA.id, contactId: k.id, role: "APPROVE" });
      const iB = await CRM.portal.invite(ctx, owner, { companyId: coB.id, contactId: k.id, role: "VIEW" });
      await P.crmPortalAccess.updateMany({ where: { id: { in: [iA.accessId, iB.accessId] } }, data: { acceptedAt: new Date() } });
      return { coA, coB, k, iA, iB };
    };
    const liveOf = async (contactId: string) => P.portalSession.count({ where: { tenantId: T, crmContactId: contactId, revokedAt: null } });
    const delays = [0, 0, 1, 2, 3, 5, 8, 12, 20, 35, 60];
    const res: string[] = [];
    const invErrs: string[] = []; let survived = 0; let inviteErr = 0; let switchOdd = 0; let trials = 0;
    for (const order of ["switchFirst", "inviteFirst"] as const) {
      for (const d of [...delays, ...delays]) {
        const s = await setup();
        const sB = await CS.mintPortalSession(s.iB.accessId, meta);
        const sw = () => settle(CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: true }));
        const inv = () => settle(CRM.portal.invite(ctx, owner, { companyId: s.coA.id, contactId: s.k.id, role: "APPROVE" }));
        const wait = () => new Promise((r) => setTimeout(r, d));
        const [a, b] = order === "switchFirst" ? await Promise.all([sw(), wait().then(inv)]) : await Promise.all([wait().then(sw), inv()]); // [switch, invite]
        const swR = a; const invR = b; // both orders return [switch, invite]
        trials += 1;
        const live = await liveOf(s.k.id);
        if (live > 0) survived += 1;
        if (!invR.ok) { inviteErr += 1; invErrs.push(`${order[0]}${d}:${(invR as Any).err.slice(0, 160)}`); }
        if (!swR.ok && !/ไม่พบ|NOT_FOUND|PortalError/.test(swR.err)) switchOdd += 1;
        res.push(`${order[0]}${d}:${swR.ok ? "sw" : "x"}${live}`);
      }
    }
    chk("R3", "R2b-1 CLOSED? ≥40 trials of switchCompany(B→A) vs re-invite(A) in both interleavings (0–60 ms staggers) ⇒ 0 live sessions of the contact after every trial · every re-invite succeeds (no deadlock/timeout) · switch failures are only the generic not-found",
      trials >= 40 && survived === 0 && inviteErr === 0 && switchOdd === 0, `trials=${trials} survived=${survived} inviteErr=${inviteErr} switchOdd=${switchOdd} invErrs=${j(invErrs)} ${res.join(" ")}`);
    // positive control: without a concurrent re-invite the switch still works and leaves exactly one live session
    const s = await setup();
    const sB = await CS.mintPortalSession(s.iB.accessId, meta);
    const ok = await settle(CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: true }));
    chk("R3.ctl", "positive control: an uncontended switch B→A succeeds (1 live session, on A)", ok.ok && (await liveOf(s.k.id)) === 1 && (ok as Any).v?.portalAccessId === s.iA.accessId, `ok=${ok.ok} live=${await liveOf(s.k.id)}`);
  });
} finally {
  if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  await new Promise((r) => setTimeout(r, 1_500));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.apiKey.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${T}%`).catch(() => undefined);
    await P.customerOtp.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
  const buckets = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, SYSTEMS.map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  if (T) chk("CLEAN", "throwaway tenant, users, systems and rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf2-review-r3: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(0);
