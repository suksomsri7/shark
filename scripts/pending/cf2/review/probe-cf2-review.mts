// C5.5-fix2 INDEPENDENT REVIEW probe (reviewer-owned · not an oracle of the card)
//   R1  SQL Prisma 7 actually emits for `equals + mode insensitive` (and `contains`) — ESCAPE char · param values
//   R2  Postgres LIKE semantics of likeEscape(): backslash (incl. trailing) · Unicode case folding vs the JS re-check
//   R3  copy loop through a header-stripping "FW:" forwarder (copy target outside SHARK forwards back to crm+…)
//   R4  forged From on a company e-mail DOMAIN (no contact) — flag / badge / event attribution
//   R5  ruling (a): thread-proven but unauthenticated reply by a CC'd party forging the To recipient
//   R6  outsider adds X-SHARK-Loop — only its own mail is dropped
//   R7  per-system cap drops an AUTHENTICATED customer mail (DoS trade-off) · sender key = forgeable From
//   R8  re-invite of access A vs a live session on the same contact's access B (switchCompany back into A)
//   R9  F15 regex bypass forms + OWED key granularity (offline)
// Run (QC3): bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf2/review/probe-cf2-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
process.env.QC_OTP_PREVIEW = "1";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// own logging client BEFORE db.ts loads (db.ts reuses globalThis.prisma outside production) ⇒ the app's queries are captured
const { PrismaClient } = (await import("@prisma/client" as string)) as Any;
const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
const QUERIES: { query: string; params: string }[] = [];
const logging = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
logging.$on("query", (e: Any) => QUERIES.push({ query: String(e.query), params: String(e.params) }));
(globalThis as Any).prisma = logging;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf2r-${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const settle = async (p: Promise<Any>): Promise<{ ok: true; v: Any } | { ok: false; err: string }> => p.then((v: Any) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, err: e instanceof Error ? `${e.name}:${e.message}` : String(e) }));
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const AUTHSERV = "mx.qc-cf2r.test";
let T = "";
const USERS: string[] = [];
const SYSTEMS: string[] = [];

// ════════ R9 · F15 regex (offline — the exact RAW_RE / strip / OWED logic copied out of scripts/fitness.mts at runtime) ════════
await sub("R9", async () => {
  const fit = readFileSync("scripts/fitness.mts", "utf8");
  const reSrc = fit.match(/const RAW_RE = \/(.+)\/g;/)?.[1];
  if (!reSrc) throw new Error("RAW_RE not found in fitness.mts");
  const RAW_RE = new RegExp(reSrc, "g");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const hits = (src: string) => [...strip(src).matchAll(RAW_RE)].length;
  const control = `const w = { email: { equals: keys.email.trim(), mode: "insensitive" } };`;
  const multi = `const w = {\n  email: {\n    equals: x,\n    mode: "insensitive",\n  },\n};`;
  const bypass: Record<string, string> = {
    shorthand: `const equals = v; const w = { email: { equals, mode: "insensitive" } };`,
    swapped: `const w = { email: { mode: "insensitive", equals: v } };`,
    singleQuote: `const w = { email: { equals: v, mode: 'insensitive' } };`,
    commaInValue: `const w = { email: { equals: v.slice(0, 40), mode: "insensitive" } };`,
    quotedKey: `const w = { "email": { equals: v, mode: "insensitive" } };`,
    queryModeEnum: `const w = { email: { equals: v, mode: Prisma.QueryMode.insensitive } };`,
    variableObject: `const f = { equals: v, mode: "insensitive" as const }; const w = { email: f };`,
    spread: `const ci = { mode: "insensitive" as const }; const w = { email: { ...ci, equals: v } };`,
    urlOnSameLine: `const u = "a//b"; const w = { email: { equals: v, mode: "insensitive" } };`,
  };
  const missed = Object.entries(bypass).filter(([, s]) => hits(s) === 0).map(([k]) => k);
  chk("R9.1", "F15 RAW_RE: positive controls (single-line + multi-line object) match · list of realistic spellings it does NOT catch",
    hits(control) === 1 && hits(multi) === 1 && missed.length > 0, `control=${hits(control)} multi=${hits(multi)} missed=[${missed.join(", ")}] of ${Object.keys(bypass).length}`);
  // OWED granularity: key = "<file>:<field>" ⇒ a NEW `name:` site in account/service.ts is silently covered by the old debt
  const owedKeys = [...(fit.match(/const OWED = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const fakeNew = `${readFileSync("src/lib/modules/account/service.ts", "utf8")}\nexport const __probe = { name: { equals: "x", mode: "insensitive" } };`;
  const keysOf = (src: string) => [...strip(src).matchAll(RAW_RE)].map((m) => `src/lib/modules/account/service.ts:${m[1]}`);
  const before = keysOf(readFileSync("src/lib/modules/account/service.ts", "utf8"));
  const after = keysOf(fakeNew);
  const flaggedAfter = after.filter((k) => !owedKeys.includes(k));
  chk("R9.2", "F15 OWED is keyed by file:field (not by site) ⇒ the two account/service.ts sites share ONE key and a third NEW `name: {equals, mode}` in that file is NOT flagged",
    before.length === 2 && after.length === 3 && flaggedAfter.length === 0, `owed=${j(owedKeys)} sitesBefore=${before.length} sitesAfterAddingOne=${after.length} flagged=${flaggedAfter.length}`);
});

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  const CI = (await import("@/lib/core/ci-equals" as string)) as Any;
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

  // ════════ R1 · SQL emitted by Prisma 7 ════════
  await sub("R1", async () => {
    await mkContact("sql", `sq_l-${rand}@qc.invalid`);
    const grab = async (where: Any) => {
      QUERIES.length = 0;
      await P.crmContact.findMany({ where: { systemId: S, ...where }, select: { id: true } });
      const q = QUERIES.find((x) => /"CrmContact"/.test(x.query) && /"email"/.test(x.query.split("WHERE")[1] ?? "")) ?? QUERIES[QUERIES.length - 1];
      const frag = (q?.query.split("WHERE")[1] ?? "").replace(/\s+/g, " ").slice(0, 260);
      return { frag, params: (q?.params ?? "").slice(0, 200) };
    };
    const eqRaw = await grab({ email: { equals: `sq_l-${rand}@qc.invalid`, mode: "insensitive" } });
    const eqSafe = await grab({ email: CI.ciEquals(`sq_l-${rand}@qc.invalid`) });
    const cont = await grab({ email: { contains: "q_l", mode: "insensitive" } });
    const eqSens = await grab({ email: { equals: `sq_l-${rand}@qc.invalid` } });
    console.log(`        R1 equals+insensitive : ${j(eqRaw)}\n        R1 ciEquals           : ${j(eqSafe)}\n        R1 contains+insensitive: ${j(cont)}\n        R1 equals (sensitive) : ${j(eqSens)}`);
    chk("R1.1", "Prisma 7 emits `ILIKE $n` with NO ESCAPE clause for equals+insensitive (⇒ Postgres default escape `\\` applies) · ciEquals passes the escaped value as the bound param",
      /ILIKE/i.test(eqRaw.frag) && !/ESCAPE/i.test(eqRaw.frag) && /ILIKE/i.test(eqSafe.frag) && /sq\\\\?_l/.test(eqSafe.params), `raw=${eqRaw.frag} | safeParams=${eqSafe.params}`);
    chk("R1.2", "info: contains+insensitive SQL/param (does Prisma escape wildcards in contains?)", true, `${cont.frag} | params=${cont.params}`);
  });

  // ════════ R2 · Postgres LIKE semantics + Unicode vs JS re-check ════════
  await sub("R2", async () => {
    const like = async (val: string, pat: string) => settle(P.$queryRaw`SELECT (${val}::text ILIKE ${pat}::text) AS m`.then((r: Any) => r[0]?.m));
    const le = CI.likeEscape as (s: string) => string;
    const cases = {
      backslashSelf: await like("a\\b@x.th", le("a\\b@x.th")),
      backslashRawSelf: await like("a\\b@x.th", "a\\b@x.th"),
      trailingBsSafe: await like("abc\\", le("abc\\")),
      trailingBsRaw: await like("abc\\", "abc\\"),
      doubleBsSafe: await like("a\\\\b", le("a\\\\b")),
      pctLiteral: await like("50%off", le("50%off")),
      pctNoMatch: await like("50Xoff", le("50%off")),
      thaiCase: await like("ทดสอบ@X.TH", le("ทดสอบ@x.th")),
    };
    const settings = (await P.$queryRaw`SELECT current_setting('standard_conforming_strings') AS scs, (SELECT datcollate FROM pg_database WHERE datname = current_database()) AS coll, (SELECT datctype FROM pg_database WHERE datname = current_database()) AS ctype`)[0];
    const uni = {
      kelvinDb: await like("kate@x.th", le("Kate@x.th")),
      kelvinJs: "Kate@x.th".toLowerCase() === "kate@x.th",
      dottedIDb: await like("istanbul@x.th", le("İstanbul@x.th")),
      dottedIJs: "İstanbul@x.th".toLowerCase() === "istanbul@x.th",
      sharpSDb: await like("strasse@x.th", le("STRAßE@x.th")),
    };
    console.log(`        R2 cases=${j(cases)}\n        R2 db=${j(settings)} unicode=${j(uni)}`);
    const v = (r: Any) => (r.ok ? r.v : `ERR ${r.err.slice(0, 80)}`);
    chk("R2.1", "likeEscape is correct under Postgres default escape: literal `\\` (incl. trailing `\\` and `\\\\`) matches itself, `%` literal, no wildcard · the OLD raw form with a trailing `\\` errors (500 before the fix) and `a\\b` did not match itself",
      v(cases.backslashSelf) === true && v(cases.trailingBsSafe) === true && v(cases.doubleBsSafe) === true && v(cases.pctLiteral) === true && v(cases.pctNoMatch) === false && v(cases.thaiCase) === true && v(cases.backslashRawSelf) === false && !cases.trailingBsRaw.ok,
      j(Object.fromEntries(Object.entries(cases).map(([k, r]) => [k, v(r)]))));
    chk("R2.2", "info: Unicode folding DB-ILIKE vs JS toLowerCase (portal re-check is an AND ⇒ can only narrow)", true, `${j(settings)} ${j(Object.fromEntries(Object.entries(uni).map(([k, r]) => [k, typeof r === "boolean" ? r : v(r)])))}`);
  });

  // ════════ R3 · copy loop through a header-stripping "FW:" forwarder ════════
  await sub("R3", async () => {
    const copyBox = `sales-${rand}@qc-shop.test`;
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: { ...EMAIL_SETTINGS, copyMode: "IN", copyToAddr: copyBox }, portal: PORTAL });
    COPIES.length = 0;
    const rows0 = await P.crmEmailMessage.count({ where: { systemId: S } });
    const first = await ingest(mail({ from: `cust-${rand}@qc-cust.test`, subject: `สอบถามราคา ${TAG}` }));
    let hops = 0;
    for (let i = 0; i < 4; i += 1) {
      const last = COPIES[COPIES.length - 1];
      if (!last) break;
      // Exchange/Outlook "forward" rule on the copy mailbox → crm+…: new message, FW: prefix, From = the copy mailbox, custom X- headers not carried
      const r = await ingest(mail({ from: copyBox, subject: `FW: ${String(last.subject)}`, text: "fw", html: "<p>fw</p>" }));
      if (r.handled) hops += 1;
    }
    const rows1 = await P.crmEmailMessage.count({ where: { systemId: S } });
    const redirected = await ingest(mail({ from: copyBox, subject: String(COPIES[0]?.subject ?? ""), headers: { "x-shark-loop": "crm-copy" } }));
    chk("R3", "REPRODUCED: copy target outside SHARK that forwards back with `FW:` and without our X- header ⇒ every hop is stored AND re-copied (subject prefix guard is startsWith only; no From==copy-target guard) — bounded only by the 100/h per-sender cap · positive control: a redirect that keeps X-SHARK-Loop is dropped",
      first.handled === true && hops === 4 && COPIES.length === 5 && rows1 - rows0 === 5 && redirected.reason === "loop",
      `first=${first.handled} hops=${hops} copies=${COPIES.length} rows+${rows1 - rows0} lastSubject=${j(String(COPIES[COPIES.length - 1]?.subject ?? "").slice(0, 120))} redirect=${redirected.reason}`);
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: PORTAL });
  });

  // ════════ R4 · forged From on a company DOMAIN (no contact) ════════
  await sub("R4", async () => {
    const dom = `corp-${rand}.test`;
    const co = await mkCompany(`บริษัทโดเมน ${TAG}`, { emailDomain: dom });
    const f = await ingest(mail({ from: `ceo@${dom}`, subject: `แจ้งเปลี่ยนบัญชีรับเงิน ${TAG}`, text: "โปรดโอนเข้าบัญชีใหม่" }));
    const row = await rowOf(f.emailId);
    const thr = await CRM.emails.getThread(ctx, owner, row?.threadKey ?? "none");
    const dto = thr.messages.find((m: Any) => m.id === f.emailId);
    const evt = await evtOf("crm.email.received", f.emailId);
    // positive control: the same forged mail from an address that IS a contact is flagged
    const k = await mkContact("ผู้ติดต่อโดเมน", `ap@${dom}`);
    const g = await ingest(mail({ from: k.email, subject: `แจ้งเปลี่ยนบัญชีรับเงิน 2 ${TAG}` }));
    const grow = await rowOf(g.emailId);
    chk("R4", "REPRODUCED: forged `ceo@<company domain>` (no contact, no A-R) is filed on the company with NO unverifiedFrom flag/badge and crm.email.received carries companyId (claim C says unproven mail is flagged + anonymous) · positive control: forged From of an existing contact IS flagged",
      row?.companyId === co.id && !(row?.routing as Any)?.unverifiedFrom && dto?.unverifiedFrom === false && evt?.payload?.companyId === co.id && !evt?.payload?.unverifiedFrom && (grow?.routing as Any)?.unverifiedFrom === true,
      `company=${row?.companyId === co.id} routing=${j(row?.routing)} badge=${dto?.unverifiedFrom} evt=${j(evt?.payload)} contactCase=${j(grow?.routing)}`);
  });

  // ════════ R5 · ruling (a): CC'd party forges the To recipient on a thread it holds ════════
  await sub("R5", async () => {
    const dom = `cust5-${rand}.test`;
    const K1 = await mkContact("ผู้รับ", `buyer@${dom}`);
    const K3 = await mkContact("ผู้ร่วมCC", `cc@${dom}`);
    const seq = await CRM.sequences.createSequence(ctx, owner, { name: `ลำดับ R5 ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false, sendWindow: null, steps: [{ kind: "EMAIL", subject: "หนึ่ง", body: "เรียนคุณ {{contact.firstName}}" }, { kind: "EMAIL", subject: "สอง", body: "ตามต่อ" }] });
    const seqId = (seq?.id ?? seq?.sequence?.id) as string;
    await CRM.sequences.enroll(ctx, owner, { sequenceId: seqId, contactId: K1.id });
    const rfc = `${randomBytes(12).toString("hex")}.r5@shark.in.th`;
    const out = await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: K1.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: `thr5${rand}`, fromAddr: `${TAG}@shark.in.th`, toAddrs: [K1.email], ccAddrs: [K3.email], subject: `ใบเสนอราคา R5 ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 60_000), trackTokenHash: sha(`${TAG}-r5`) } });
    delete process.env.CRM_INBOUND_AUTHSERV_ID; // P14 not configured (today's state)
    const f = await ingest(mail({ from: K1.email, subject: `Re: ใบเสนอราคา R5 ${TAG}`, text: "ยกเลิกครับ", headers: { "in-reply-to": `<${rfc}>`, references: `<${rfc}>`, received: `from mx.attacker.test (cc@${dom})` } }));
    const row = await rowOf(f.emailId);
    const outAfter = await P.crmEmailMessage.findUnique({ where: { id: out.id }, select: { repliedAt: true } });
    const rep = (await P.outboxEvent.findMany({ where: { tenantId: T, type: "crm.email.replied" } })).find((e: Any) => e.payload?.emailId === out.id);
    const enr = (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId: K1.id }, select: { status: true } }))?.status;
    chk("R5", "ruling (a) residual, as documented: a holder of our Message-ID (the CC'd party) forging From = the To recipient, no A-R ⇒ OUT repliedAt · crm.email.replied WITH contactId (not anonymised) · recipient's sequence STOPPED · the stored mail itself is badged",
      !!outAfter?.repliedAt && rep?.payload?.contactId === K1.id && enr === "STOPPED" && (row?.routing as Any)?.unverifiedFrom === true,
      `replied=${!!outAfter?.repliedAt} evt=${j(rep?.payload)} enr=${enr} rowFlag=${j(row?.routing)}`);
  });

  // ════════ R6 · outsider adds X-SHARK-Loop ════════
  await sub("R6", async () => {
    const k = await mkContact("คนนอกใส่หัว", `loopy@cust6-${rand}.test`);
    const rows0 = await P.crmEmailMessage.count({ where: { systemId: S } });
    const a = await ingest(mail({ from: k.email, headers: { "X-SHARK-Loop": "anything" } }));
    const b = await ingest(mail({ from: k.email }));
    const rows1 = await P.crmEmailMessage.count({ where: { systemId: S } });
    chk("R6", "sender-supplied X-SHARK-Loop drops only that sender's own mail (handled false · reason loop · 200) · positive control: same sender without the header is stored",
      a.ok === true && a.handled === false && a.reason === "loop" && b.handled === true && rows1 - rows0 === 1, `withHeader=${j(a)} without=${b.handled} rows+${rows1 - rows0}`);
  });

  // ════════ R7 · per-system cap vs an AUTHENTICATED customer mail ════════
  await sub("R7", async () => {
    const dom = `cust7-${rand}.test`;
    const k = await mkContact("ลูกค้ายืนยันแล้ว", `real@${dom}`);
    const sysKey = `crm.email.in.sys.${S}`;
    await P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, sysKey, 1000);
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let r: Any;
    try {
      r = await ingest(mail({ from: k.email, headers: AR(dom) }));
    } finally {
      delete process.env.CRM_INBOUND_AUTHSERV_ID;
    }
    const keys = [`a-${rand}@x.test`, `b-${rand}@x.test`].map((f) => `crm.email.in.from.${S}.${sha(`from:${f}`).slice(0, 32)}`);
    await P.chatRateBucket.deleteMany({ where: { key: sysKey } });
    chk("R7", "DoS trade-off REPRODUCED: once the per-system bucket is full (1000 mails/h from 1000 forged Froms — sender key = hash of the unauthenticated From, rotated for free), a DMARC-pass mail from a known customer is accepted-and-dropped (no row, no bounce)",
      r?.handled === false && r?.reason === "rate_limited" && keys[0] !== keys[1], `verifiedCustomer=${j(r)} senderKeysDiffer=${keys[0] !== keys[1]}`);
  });

  // ════════ R8 · re-invite A vs a live session on the same contact's access B ════════
  await sub("R8", async () => {
    const coA = await mkCompany(`บริษัท A ${TAG}`);
    const coB = await mkCompany(`บริษัท B ${TAG}`);
    const k = await mkContact("สองบริษัท", `two.co-${rand}@qc.invalid`);
    for (const co of [coA, coB]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: k.id, isPrimary: co.id === coA.id, startedAt: new Date(Date.now() - 600_000) } });
    const invA = await CRM.portal.invite(ctx, owner, { companyId: coA.id, contactId: k.id, role: "APPROVE" });
    const invB = await CRM.portal.invite(ctx, owner, { companyId: coB.id, contactId: k.id, role: "VIEW" });
    await P.crmPortalAccess.updateMany({ where: { id: { in: [invA.accessId, invB.accessId] } }, data: { acceptedAt: new Date() } });
    const sA = await CS.mintPortalSession(invA.accessId, { ip: "203.0.113.220", userAgent: "lost-phone" });
    const sB = await CS.mintPortalSession(invB.accessId, { ip: "203.0.113.221", userAgent: "lost-phone" });
    // staff: "customer lost the phone" ⇒ re-send the invite of the APPROVE access A
    await CRM.portal.invite(ctx, owner, { companyId: coA.id, contactId: k.id, role: "APPROVE" });
    const aliveA = !!(await CS.getPortalSession(sA.token));
    const aliveB = !!(await CS.getPortalSession(sB.token));
    const back = await settle(CRM.portal.switchCompany(sB.token, coA.id, { ip: "203.0.113.221", userAgent: "lost-phone" }, { revokeCurrent: true }));
    const backInA = back.ok && (back as Any).v?.portalAccessId === invA.accessId && !!(await CS.getPortalSession((back as Any).v?.token));
    chk("R8", "REPRODUCED (multi-company contact): re-invite of access A kills A's sessions (positive control) but the old device's session on the same contact's access B survives and switchCompany(B→A) mints a fresh APPROVE session on A",
      !aliveA && aliveB && backInA, `A=${aliveA} B=${aliveB} switchBackToA=${back.ok ? (back as Any).v?.portalAccessId === invA.accessId : (back as Any).err} alive=${backInA}`);
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf2-review: ${passed}/${cks.length} (✅ on R3/R4/R5/R7/R8/R9 = the finding REPRODUCED)`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(0);
