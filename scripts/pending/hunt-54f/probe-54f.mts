// probe-54f.mts — C5.4-F HUNTER (public surface) · NOT an oracle · QC2 ONLY (ep-cool-shadow) · read-only hunt of the batch F diff
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54f/probe-54f.mts
// Throwaway tenant `qc-hunt54f-<rand>` (+ its users) deleted in finally, rate-bucket keys it touched deleted. No drains, no network.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`not QC2 (${host}) — refuse`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("probe: network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt54f-${rand}`;
const out: Record<string, unknown> = { tag: TAG };
const TENANTS: string[] = []; const USERS: string[] = []; const RATE_KEYS: string[] = [];
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const key8 = () => Array.from(randomBytes(8)).map((b) => B32[b % 32]).join("");

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const TRK = (await import("@/lib/modules/crm/tracking" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const ACCESS = (await import("@/lib/modules/crm/access" as string)) as Any;
  const STAFF_KEYS = Object.fromEntries(((ACCESS.CRM_ROLE_DEFAULTS?.STAFF ?? []) as string[]).map((k) => [k, true]));
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG, status: "ACTIVE" } });
  TENANTS.push(t.id); const T = t.id as string;
  const mkUser = async (label: string, role: string, email: string, perms: Any = {}) => {
    const u = await P.user.create({ data: { email, name: `QC ${label} ${TAG}` } }); USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    return { userId: u.id as string, email, actor: { userId: u.id, role, unitAccess: ["*"], permissions: perms } };
  };
  const owner = await mkUser("owner", "OWNER", `${TAG}-owner@qc.invalid`);
  const SD = `staff-${rand}.example`; const VER = `${rand}-shop.example`;
  const staff = await mkUser("sales", "STAFF", `sales-${rand}@${SD}`, { ...STAFF_KEYS });
  const setCrm = (S: string, crm: Any) => P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crm), S);
  const mkCrm = async (label: string, crm: Any = {}) => {
    const S = (await sysSvc.createSystem(T, "CRM", `${label} ${TAG}`)).id as string;
    await setCrm(S, { uiVersion: 2, bridgesEnabled: false, ...crm });
    await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `p ${TAG}`, isDefault: true, stages: { create: [["ใหม่", "OPEN", 20], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]].map(([name, kind, probability], i) => ({ tenantId: T, systemId: S, sortOrder: i, name, kind, probability })) } } });
    return { S, ctx: { tenantId: T, systemId: S, actorUserId: owner.userId } };
  };
  const mkContact = async (S: string, label: string, email: string) => {
    const party = await P.party.create({ data: { tenantId: T, name: `${label} ${TAG}`, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: T, systemId: S, name: `${label} ${TAG}`, firstName: label, partyId: party.id, ownerUserId: owner.userId, email } });
  };
  await P.emailDomain.create({ data: { tenantId: T, domain: VER, status: "VERIFIED", verifiedAt: new Date() } });

  // ═══ 1 · inbound ═══
  const KEY = key8();
  const c = await mkCrm("in", { email: { inboundKey: KEY, inboundEnabled: true, bccCaptureEnabled: true, strangerToLead: true, fromMode: "SHARK", replyToMode: "SHARK", copyMode: "NONE" } });
  const cust = await mkContact(c.S, "cust", `cust-${rand}@cust.example`);
  const OURS = "mx.shark.in.th";
  const mail = (from: string, headers: Record<string, string>, to: string[] = [cust.email]) => ({ messageId: `<${TAG}-${randomBytes(5).toString("hex")}@p.example>`, from, to: [...to, `crm+${KEY}@shark.in.th`], cc: [], subject: "p", text: "p", html: "<p>p</p>", headers, attachments: [] });
  const run = async (label: string, m: Any) => {
    try {
      const r = await CRM.emails.ingestInbound(m);
      const row = r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { direction: true, contactId: true, sentById: true, routing: true } }) : null;
      const ct = row?.contactId ? await P.crmContact.findUnique({ where: { id: row.contactId }, select: { email: true, name: true } }) : null;
      return `${label}: ${row ? `${row.direction}${row.sentById ? "(sentBy staff)" : ""} contact=${ct ? (ct.email === cust.email ? "CUSTOMER" : `new:${ct.email}|${ct.name}`) : "null"}${(row?.routing as Any)?.unverifiedShopFrom ? " flag" : ""}` : `not-stored(${r?.reason})`}`;
    } catch (e) { return `${label}: THROW ${String((e as Error)?.message ?? e).slice(0, 120)}`; }
  };
  const FAIL = `${OURS}; dkim=fail header.d=${SD}; spf=fail smtp.mailfrom=${SD}; dmarc=fail header.from=${SD}`;
  const GOOD = `${OURS}; dkim=pass header.d=${SD}; dmarc=pass header.from=${SD}`;
  const r: string[] = [];
  process.env.CRM_INBOUND_AUTHSERV_ID = OURS;
  r.push(await run("ctl-genuine", mail(staff.email, { "authentication-results": GOOD })));
  r.push(await run("ctl-fail-then-forged(\\n)", mail(staff.email, { "authentication-results": `${FAIL}\n${GOOD}` })));
  r.push(await run("A1 joiner \\n\\t (whitespace-led joiner)", mail(staff.email, { "authentication-results": `${FAIL}\n\t${GOOD}` })));
  r.push(await run("A2 comment breakout (unescaped ')' of attacker envelope in MTA comment)", mail(staff.email, { "authentication-results": `${OURS}; spf=fail (${OURS}: domain of "x);dkim=pass header.d=${SD};("@evil.example does not designate 192.0.2.1) smtp.mailfrom=evil.example; dkim=none; dmarc=fail header.from=${SD}` })));
  r.push(await run("A3 unquoted smtp.helo with ';'", mail(staff.email, { "authentication-results": `${OURS}; spf=none smtp.helo=x;dkim=pass header.d=${SD}; dkim=none; dmarc=fail header.from=${SD}` })));
  r.push(await run("A4 unbalanced '(' in genuine swallows joiner, forged closes it", mail(staff.email, { "authentication-results": `${OURS}; dkim=fail header.d=${SD}; spf=none (helo=foo( ; dmarc=fail header.from=${SD}, evil.example; x=y) ; dkim=pass header.d=${SD}` })));
  r.push(await run("A5 quoted helo (RFC-conformant MTA)", mail(staff.email, { "authentication-results": `${OURS}; spf=none smtp.helo="x;dkim=pass header.d=${SD}"; dkim=none; dmarc=fail header.from=${SD}` })));
  r.push(await run("A6 escaped \\) in comment (RFC-conformant)", mail(staff.email, { "authentication-results": `${OURS}; spf=fail (domain of "x\\);dkim=pass header.d=${SD};\\("@evil.example) smtp.mailfrom=evil.example; dkim=none; dmarc=fail header.from=${SD}` })));
  r.push(await run("A7 key-case collision (worker keyed case-sensitively)", mail(staff.email, { "Authentication-Results": FAIL, "authentication-results": GOOD })));
  r.push(await run("A8 multi From <evil>,<staff> + evil passes", mail(`<a@evil.example>, <${staff.email}>`, { "authentication-results": `${OURS}; dkim=pass header.d=evil.example; dmarc=pass header.from=evil.example` })));
  r.push(await run("A9 display-name spoof", mail(`"${staff.email}" <a@evil.example>`, { "authentication-results": `${OURS}; dkim=pass header.d=evil.example` })));
  r.push(await run("A10 authserv-id UPPER + version + comment", mail(staff.email, { "authentication-results": `MX.Shark.IN.TH 1 (postfix); dkim=pass (2048-bit key; secure) header.d=${SD} header.i=@${SD}; spf=pass (domain of b@${SD} designates 192.0.2.1 as permitted sender) smtp.mailfrom=b@${SD}; dmarc=pass (p=NONE) header.from=${SD}` })));
  r.push(await run("A11 header.d suffix-not-label (x" + SD + ")", mail(staff.email, { "authentication-results": `${OURS}; dkim=pass header.d=x${SD}` })));
  r.push(await run("A12 header.i=@staffdomain but d=evil", mail(staff.email, { "authentication-results": `${OURS}; dkim=pass header.d=evil.example header.i=@${SD}` })));
  r.push(await run("A13 Reply-To=customer, outsider From", mail(`x-${rand}@evil.example`, { "reply-to": cust.email }, [])));
  r.push(await run("A14 staff plus-address, no proof (strangerToLead on)", mail(`sales-${rand}+ceo@${SD}`, {}, [])));
  r.push(await run("A15 unregistered shop-domain address, no proof", mail(`ceo@${VER}`, {}, [])));
  r.push(await run("A16 display-name = staff name, outsider From", mail(`"QC sales ${TAG} (${staff.email})" <y-${rand}@evil.example>`, {}, [])));
  delete process.env.CRM_INBOUND_AUTHSERV_ID;
  r.push(await run("U1 env unset, genuine", mail(staff.email, { "authentication-results": GOOD })));
  out.inbound = r;

  // ═══ 2 · /l ═══
  const RL = (await import(pathToFileURL(resolve("src/app/l/[code]/route.ts")).href)) as Any;
  const c2 = await mkCrm("l");
  const code = `h54f${rand}`;
  const lk = await CRM.tracking.createLink(c2.ctx, owner.actor, { url: `https://dest-${rand}.example/x`, name: TAG, code });
  const IPS: string[] = [];
  const hitL = async (cd: string) => {
    const ip = `198.51.100.${10 + IPS.length % 200}`; IPS.push(ip);
    const t0 = performance.now();
    const res: Response = await RL.GET(new Request(`http://qc.invalid/l/${cd}`, { headers: { "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 qc" } }), { params: Promise.resolve({ code: cd }) });
    return { ms: performance.now() - t0, loc: res.headers.get("location") ?? "", cookie: res.headers.get("set-cookie") ?? "", st: res.status };
  };
  const l: string[] = [];
  for (const st of ["ACTIVE", "PENDING", "SUSPENDED", "CLOSED", "PENDING_DELETE"]) {
    await P.tenant.update({ where: { id: T }, data: { status: st } });
    const before = await P.crmTrackedLink.findFirst({ where: { code }, select: { clicks: true } });
    const h = await hitL(code);
    const after = await P.crmTrackedLink.findFirst({ where: { code }, select: { clicks: true } });
    l.push(`${st}: ${h.st} loc=${h.loc.slice(0, 50)} cookie=${h.cookie ? "yes" : "no"} clicks ${before?.clicks}→${after?.clicks}`);
  }
  // timing: suspended vs unknown (enumeration), 12 each interleaved
  await P.tenant.update({ where: { id: T }, data: { status: "SUSPENDED" } });
  const tS: number[] = []; const tU: number[] = [];
  for (let i = 0; i < 12; i += 1) { tS.push((await hitL(code)).ms); tU.push((await hitL(`zz${rand}${i}`)).ms); }
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]!.toFixed(1);
  const uk = await hitL(`nope${rand}`);
  const su = await hitL(code);
  l.push(`timing median suspended=${med(tS)}ms unknown=${med(tU)}ms · bytes-equal(loc/cookie/status)=${uk.loc === su.loc && uk.cookie === su.cookie && uk.st === su.st}`);
  await P.tenant.update({ where: { id: T }, data: { status: "ACTIVE" } });
  for (const ip of IPS) RATE_KEYS.push(`crm:l:${String(TRK.ipHashFor(ip, new Date())).slice(0, 32)}`);
  out.link = { created: !!lk, l };

  // ═══ 3 · headerSafeLocation ═══
  const hs = (u: string) => { try { const v = TRK.headerSafeLocation(u); let ok = true; try { new Headers({ Location: v }); } catch { ok = false; } return `${JSON.stringify(u).slice(0, 60)} → ${JSON.stringify(v).slice(0, 80)}${ok ? "" : " (HEADER THROWS)"}`; } catch (e) { return `${JSON.stringify(u)} → THROW ${(e as Error).message}`; } };
  out.headerSafe = [
    "https://a.example/x\r\nSet-Cookie: s=1", "https://a.example/x y z", "https://a.example/\u0085x", "//evil.example/x", "javascript:alert(1)//ไทย",
    "https://good.example\\@evil.example/ไทย", "https://аpple.com/ไทย", "https://evil。example/ไทย", "https://a.example/%E0%B8%AA/ไทย", "not a url ไทย\r\nX: y", "https://a.example/\u0000x",
  ].map(hs);
  // createLink rejects? (stored-link path)
  const cl: string[] = [];
  for (const u of ["https://a.example/x y", "https://a.example/ x", "//evil.example/", "javascript:alert(1)", "https://аpple.com/", "https:\\\\evil.example/", "HTTPS://evil.example/"]) {
    try { await CRM.tracking.createLink(c2.ctx, owner.actor, { url: u, name: TAG }); cl.push(`${JSON.stringify(u)}=ACCEPTED`); } catch (e) { cl.push(`${JSON.stringify(u)}=rejected`); }
  }
  out.createLink = cl;

  // ═══ 4 · one-click under full bucket ═══
  const RU = (await import(pathToFileURL(resolve("src/app/u/[token]/one-click/route.ts")).href)) as Any;
  const c4 = await mkCrm("u");
  const k4 = await mkContact(c4.S, "unsub", `${TAG}-u@qc.invalid`);
  await P.crmContactConsent.create({ data: { tenantId: T, systemId: c4.S, contactId: k4.id, channel: "EMAIL", granted: true, source: "STAFF", createdAt: new Date(Date.now() - 120_000) } });
  const sent: Any[] = [];
  const transport = async (m: Any) => { sent.push(m); return { ok: true, providerId: `${TAG}-p${sent.length}` }; };
  const sr = await CRM.emails.sendEmail(c4.ctx, owner.actor, { contactId: k4.id, subject: `u ${TAG}`, bodyHtml: "<p>hi</p>" }, { transport }).catch((e: Any) => ({ err: String(e?.message ?? e) }));
  const html = String(sent[0]?.html ?? "") + JSON.stringify(sent[0]?.headers ?? {});
  const tok = (/\/u\/([^"'\s<>/]+)\/one-click/.exec(html) ?? /\/u\/([^"'\s<>/]+)/.exec(html) ?? [])[1] ?? "";
  const ipF = `203.0.113.${50 + Math.floor(Math.random() * 100)}`;
  const kk = CRM.emails.trackRateKeys("u", { ip: ipF, token: tok }) as string[]; RATE_KEYS.push(...kk);
  const fullIp = () => P.chatRateBucket.upsert({ where: { key: kk[0] }, create: { key: kk[0], count: 999, windowStart: new Date() }, update: { count: 999, windowStart: new Date() } });
  const post = (tk: string, ip = ipF) => RU.POST(new Request(`http://qc.invalid/u/${tk}/one-click`, { method: "POST", headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token: tk }) });
  const counts = async () => ({ ev: await P.crmEmailEvent.count({ where: { tenantId: T, kind: "UNSUBSCRIBE" } }), audit: await P.auditLog.count({ where: { tenantId: T, action: "crm.email.unsubscribe" } }).catch(() => -1), consent: await P.crmContactConsent.count({ where: { tenantId: T, contactId: k4.id } }), buckets: await P.chatRateBucket.count({ where: { key: { startsWith: "crm.email.t.u." } } }) });
  await fullIp();
  const u0 = await counts();
  const fake: string[] = [];
  for (let i = 0; i < 5; i += 1) { const f = `${sent[0] ? String(tok.split("~")[0]) : "x"}~${randomBytes(24).toString("base64url")}`; fake.push(f); await post(f); }
  const u1 = await counts();
  const r1 = await post(tok);
  const opt1 = (await P.crmContact.findUnique({ where: { id: k4.id }, select: { emailOptOut: true } }))?.emailOptOut;
  const u2 = await counts();
  for (let i = 0; i < 5; i += 1) await post(tok);
  const u3 = await counts();
  // bucket not full, already opted out, repeated
  const ipG = `203.0.113.${160 + Math.floor(Math.random() * 60)}`; RATE_KEYS.push(...(CRM.emails.trackRateKeys("u", { ip: ipG, token: tok }) as string[]));
  for (let i = 0; i < 5; i += 1) await post(tok, ipG);
  const u4 = await counts();
  const g = await RU.GET(new Request(`http://qc.invalid/u/${tok}/one-click`), { params: Promise.resolve({ token: tok }) });
  out.unsub = { send: sr?.err ?? "ok", tok: tok ? "found" : "MISSING", status: r1.status, optOut: opt1, getStatus: g.status, start: u0, after5fakeFull: u1, afterValidFull: u2, after5moreValidFull: u3, after5validFreshIp: u4 };
  for (const f of fake) RATE_KEYS.push(...(CRM.emails.trackRateKeys("u", { ip: ipF, token: f }) as string[]));

  // ═══ 5 · trackGate chain + I1/I2 ═══
  const ipC = `198.51.100.${220 + Math.floor(Math.random() * 30)}`;
  const kc = CRM.emails.trackRateKeys("o", { ip: ipC }) as string[]; RATE_KEYS.push(kc[0]!);
  await P.chatRateBucket.upsert({ where: { key: kc[0] }, create: { key: kc[0], count: 999, windowStart: new Date() }, update: { count: 999, windowStart: new Date() } });
  const tks = Array.from({ length: 4 }, () => `a~${randomBytes(12).toString("hex")}`);
  const tkKeys = tks.map((x) => (CRM.emails.trackRateKeys("o", { ip: ipC, token: x }) as string[])[1]!); RATE_KEYS.push(...tkKeys);
  const v = []; for (const x of tks) v.push(await CRM.emails.trackGate("o", { ip: ipC, token: x }));
  const ipRow = await P.chatRateBucket.findUnique({ where: { key: kc[0] }, select: { count: true } });
  out.gate = { verdicts: v, tokenRows: await P.chatRateBucket.count({ where: { key: { in: tkKeys } } }), ipCount: ipRow?.count };
  const saved = { APP_ENV: process.env.APP_ENV, APP_URL: process.env.APP_URL };
  const i2: string[] = [];
  for (const [ae, au] of [["production", "https://shark.in.th"], ["production", "http://127.0.0.1:3000"], ["production", ""], ["preview", "https://x.vercel.app/path"], ["development", "http://127.0.0.1:3215"], ["development", "javascript:alert(1)"], ["development", ""], ["PRODUCTION", "http://127.0.0.1:1"]]) {
    process.env.APP_ENV = ae; if (au) process.env.APP_URL = au; else delete process.env.APP_URL;
    i2.push(`${ae}|${au || "(unset)"} → ${TRK.trackerOrigin()}`);
  }
  process.env.APP_ENV = saved.APP_ENV; if (saved.APP_URL === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved.APP_URL;
  out.trackerOrigin = i2;
  const EM = (await import("@/lib/core/email" as string)) as Any;
  const envMod = (await import("@/lib/env" as string)) as Any;
  const i1 = await EM.sendEmailRich({ to: ["a@qc.invalid"], subject: `i1 ${TAG}`, html: "<p>x</p>" }).catch((e: Any) => ({ throw: String(e?.message ?? e) }));
  const i1bad = await EM.sendEmailRich({ to: ["a@qc.invalid\r\nBcc: z@evil.example"], subject: "x", html: "x" }).catch((e: Any) => ({ throw: String(e?.message ?? e) }));
  out.I1 = { emailEnabled: envMod.emailEnabled, result: i1, crlfTo: i1bad };
} catch (e) {
  out.fatal = String((e as Error)?.stack ?? e).slice(0, 800);
} finally {
  delete process.env.CRM_INBOUND_AUTHSERV_ID;
  await new Promise((r) => setTimeout(r, 1500));
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  if (RATE_KEYS.length) await P.chatRateBucket.deleteMany({ where: { key: { in: RATE_KEYS } } }).catch(() => undefined);
  await P.opsEvent.deleteMany({ where: { OR: [{ message: { contains: TAG } }, { tenantId: { in: TENANTS } }] } }).catch(() => undefined);
  out.cleanup = { tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }), usersLeft: await P.user.count({ where: { id: { in: USERS } } }), bucketsLeft: RATE_KEYS.length ? await P.chatRateBucket.count({ where: { key: { in: RATE_KEYS } } }) : 0, emailsLeft: await P.crmEmailMessage.count({ where: { tenantId: { in: TENANTS } } }) };
  console.log(JSON.stringify(out, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2));
  await prisma.$disconnect();
  process.exit(0);
}
