// C5.5-fix2 ROUND 2 — INDEPENDENT REVIEW probe (reviewer-owned · not an oracle of the card)
//   Q1  RV2-1 copy loop: Fwd:/ส่งต่อ:/RE: FW: stacking · copy target mixed case + plus-address · second-hop forwarder · control
//   Q2  RV2-2 domain-matched forged From: mixed-case domain · sub-domain · A-R positive
//   Q3  RV2-3 system cap exemption: thread proof cannot be forged cheaply · exempt path still per-sender capped · owner notice once/window
//   Q4  RV2-4 list surface flag (listThreads = inbox · REST list · AI tool crm_email_thread)
//   Q5  RV2-5 re-invite orderings (B→A · re-invite B · switched-first · revoke-vs-switch race · first-invite deviation)
//   Q6  F15 scanner: 7 more spellings · no false positive on current src/ · a NEW account/service.ts site fails
//   Q7  nav: other modules' tab builders carry no `perm` (unchanged by visibleTabs) · CRM perm-tagged tabs gate by key
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf2/review/probe-cf2-review-r2.mts
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

// ════════ Q6 · F15 scanner (offline) ════════
await sub("Q6", async () => {
  const S = (await import("../../../lib/ci-equals-scan.mjs" as string)) as Any;
  const hits = (src: string) => S.findRawInsensitive(src).length;
  const mine: Record<string, string> = {
    computedKey: `const w = { email: { equals: v, ["mode"]: "insensitive" } };`,
    ternary: `const w = { email: { equals: v, mode: strict ? "default" : "insensitive" } };`,
    parenthesized: `const w = { email: { equals: v, mode: ("insensitive") } };`,
    enumAlias: `const QM = Prisma.QueryMode; const w = { email: { equals: v, mode: QM.insensitive } };`,
    importedConst: `import { INS } from "./modes"; const w = { email: { equals: v, mode: INS } };`,
    equalsPlusEmptyContains: `const w = { email: { equals: v, contains: "", mode: "insensitive" } };`,
    satisfiesCast: `const w = { email: { equals: v, mode: "insensitive" satisfies Prisma.QueryMode } };`,
    helperReturn: `const ci = (x: string) => ({ equals: x, mode: "insensitive" as const });`,
  };
  const res = Object.fromEntries(Object.entries(mine).map(([k, s]) => [k, hits(s)]));
  const missed = Object.entries(res).filter(([, n]) => n === 0).map(([k]) => k);
  chk("Q6.1", "F15 scanner vs 8 more spellings — which are still missed", true, `hits=${j(res)} missed=[${missed.join(", ")}]`);
  // current tree: hits outside the OWED snippets (exact file + line text + count, read from fitness.mts)
  const fit = readFileSync("scripts/fitness.mts", "utf8");
  const owed = [...fit.matchAll(/\{ file: "([^"]+)", snippet: `([^`]+)`, count: (\d+) \}/g)].map((m) => ({ file: m[1]!, snippet: m[2]!, count: Number(m[3]) }));
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });
  const evalTree = (override?: { file: string; src: string }) => {
    const bad: string[] = [];
    const seen = new Map<string, number>();
    for (const p of walk("src")) {
      if (p === "src/lib/core/ci-equals.ts") continue;
      const src = override && override.file === p ? override.src : readFileSync(p, "utf8");
      if (!/insensitive/.test(src)) continue;
      for (const h of S.findRawInsensitive(src)) {
        const o = owed.find((x) => x.file === p && x.snippet === h.snippet);
        if (!o) { bad.push(`${p}:${h.line}`); continue; }
        const k = `${o.file}::${o.snippet}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
        if ((seen.get(k) ?? 0) > o.count) bad.push(`${p}:${h.line}(over)`);
      }
    }
    return bad;
  };
  const clean = evalTree();
  const svc = "src/lib/modules/account/service.ts";
  const newSite = evalTree({ file: svc, src: `${readFileSync(svc, "utf8")}\nexport async function __probe(name: string) { return { where: { name: { equals: name, mode: "insensitive" } } }; }\n` });
  const dupLine = evalTree({ file: svc, src: `${readFileSync(svc, "utf8")}\nfunction __p2(or: any[], name: string) {\n  if (name) or.push({ name: { equals: name, mode: "insensitive" } });\n}\n` });
  chk("Q6.2", "F15 on the current tree: no false positive (0 bad, all 4 OWED present) · a NEW `name:` site in account/service.ts is flagged · a copy of an OWED line (same text) is flagged as over-count",
    owed.length === 4 && clean.length === 0 && newSite.length === 1 && dupLine.length === 1, `owed=${owed.length} clean=${j(clean)} newSite=${j(newSite)} dupLine=${j(dupLine)}`);
});

// ════════ Q7 · nav (offline) ════════
await sub("Q7", async () => {
  const NP = (await import("@/components/nav-perms" as string)) as Any;
  const NAV = (await import("@/lib/modules/crm/nav" as string)) as Any;
  const mods: [string, string, string][] = [
    ["member", "@/lib/modules/member/ui", "memberTabs"], ["inventory", "@/lib/modules/inventory/ui", "invTabs"], ["hr", "@/lib/modules/hr/ui", "hrTabs"],
    ["pos", "@/lib/modules/pos/tabs", "posTabs"], ["point", "@/lib/modules/point/ui", "pointTabs"], ["reward", "@/lib/modules/reward/ui", "rewardTabs"],
    ["coupon", "@/lib/modules/coupon/ui", "couponTabs"], ["chat", "@/lib/modules/chat/ui", "chatTabs"], ["marketing", "@/lib/modules/marketing/ui", "marketingTabs"], ["meeting", "@/lib/modules/meeting/ui", "meetingTabs"],
  ];
  const out: Record<string, string> = {};
  let allSame = true;
  for (const [name, path, fn] of mods) {
    const m = await settle(import(path as string));
    if (!m.ok) { out[name] = `import-failed ${m.err.slice(0, 60)}`; continue; }
    const items = (m.v as Any)[fn]("sysX") as Any[];
    const tagged = items.filter((x) => "perm" in x).length;
    const same = NP.visibleTabs(items, []).length === items.length;
    if (tagged || !same) allSame = false;
    out[name] = `${items.length} tabs · perm-tagged ${tagged} · unchanged ${same}`;
  }
  const loaded = Object.values(out).filter((v) => !v.startsWith("import-failed")).length;
  chk("Q7.1", "other modules' tab builders carry no `perm` ⇒ visibleTabs(items, []) returns every tab (shared ModuleTabs unchanged for them)", allSame && loaded >= 6, `${j(out)}`);
  const items = NAV.crmNavItems("sysX") as Any[];
  const tagged = items.filter((x) => x.perm).map((x) => `${x.label}:${x.perm}`);
  const none = NP.visibleTabs(items, []).map((x: Any) => x.label);
  const withEmail = NP.visibleTabs(items, ["crm.email.read"]).map((x: Any) => x.label);
  chk("Q7.2", "CRM: perm-tagged tabs hidden with no keys / no provider (fail closed), shown only for the key held",
    tagged.length >= 3 && !none.includes("อีเมล") && !none.includes("บริษัท") && withEmail.includes("อีเมล") && !withEmail.includes("บริษัท"),
    `tagged=${j(tagged)} visibleNoKeys=${none.length}/${items.length} emailKeyShows=${withEmail.includes("อีเมล")}`);
});

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

  // ════════ Q1 · RV2-1 copy-loop variants ════════
  await sub("Q1", async () => {
    const copyCfg = `Sales+CRM@Shop-${rand}.Test`;
    const copyBox = copyCfg.toLowerCase();
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: { ...EMAIL_SETTINGS, copyMode: "BOTH", copyToAddr: copyCfg }, portal: PORTAL });
    COPIES.length = 0;
    const ctl = await ingest(mail({ from: `cust-${rand}@qc-cust.test`, subject: `สอบถามราคา ${TAG}` }));
    const c0 = COPIES.length;
    const base = String(COPIES[0]?.subject ?? "");
    const variants: Record<string, Any> = {
      fwdSameBoxUpper: { from: copyBox.toUpperCase(), subject: `Fwd: ${base}` },
      thaiForwardSecondHop: { from: `boss-${rand}@shop-${rand}.test`, subject: `ส่งต่อ: ${base}` },
      stackedReFwFwd: { from: `boss-${rand}@shop-${rand}.test`, subject: `RE: FW: Fwd: ${base}` },
      externalTag: { from: `gw-${rand}@relay.test`, subject: `[EXTERNAL] FW: ${base}` },
      displayNameFrom: { from: `"Sales" <${copyBox}>`, subject: `FW: something else ${TAG}` },
    };
    const res: Record<string, string> = {};
    for (const [k, v] of Object.entries(variants)) {
      const before = COPIES.length;
      const r = await ingest(mail(v));
      res[k] = `${r.handled ? "stored" : r.reason}/copies+${COPIES.length - before}`;
    }
    const anyCopy = Object.values(res).some((s) => !s.endsWith("+0"));
    chk("Q1", "RV2-1 CLOSED? copy target `Sales+CRM@Shop…` (mixed case, plus-address) · forwards back as Fwd:/ส่งต่อ:/RE: FW: Fwd:/[EXTERNAL] FW: from the box itself (upper-case), a second-hop mailbox, or a relay ⇒ stored but NO further copy · positive control: an ordinary customer mail is copied once",
      ctl.handled === true && c0 === 1 && !anyCopy, `control copies=${c0} variants=${j(res)}`);
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: PORTAL });
  });

  // ════════ Q2 · RV2-2 domain variants ════════
  await sub("Q2", async () => {
    const dom = `corp-${rand}.test`;
    const co = await mkCompany(`บริษัทโดเมน ${TAG}`, { emailDomain: dom });
    const a = await ingest(mail({ from: `CEO@Corp-${rand}.TEST`, subject: `แจ้งเปลี่ยนบัญชี ${TAG}` }));
    const ar = await rowOf(a.emailId);
    const ae = await evtOf("crm.email.received", a.emailId);
    const b = await ingest(mail({ from: `ceo@mail.${dom}`, subject: `แจ้งเปลี่ยนบัญชี sub ${TAG}` }));
    const br = await rowOf(b.emailId);
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let cr: Any = null; let ce: Any = null;
    try {
      const c = await ingest(mail({ from: `ceo@${dom}`, subject: `ยืนยันแล้ว ${TAG}`, headers: AR(dom) }));
      cr = await rowOf(c.emailId); ce = await evtOf("crm.email.received", c.emailId);
    } finally { delete process.env.CRM_INBOUND_AUTHSERV_ID; }
    chk("Q2", "RV2-2 CLOSED? mixed-case company domain forged ⇒ filed on company + unverifiedFrom + event without companyId · sub-domain ⇒ not attributed to anyone (no company, no contact ⇒ nothing to badge) · positive: A-R pass on the domain ⇒ companyId kept, no flag",
      ar?.companyId === co.id && (ar?.routing as Any)?.unverifiedFrom === true && !ae?.payload?.companyId && ae?.payload?.unverifiedFrom === true &&
      !br?.companyId && !br?.contactId &&
      cr?.companyId === co.id && !(cr?.routing as Any)?.unverifiedFrom && ce?.payload?.companyId === co.id,
      `mixed=${j({ co: ar?.companyId === co.id, routing: ar?.routing, evt: ae?.payload })} sub=${j({ co: br?.companyId, k: br?.contactId, routing: br?.routing })} ar=${j({ co: cr?.companyId === co.id, routing: cr?.routing, evtCo: !!ce?.payload?.companyId })}`);
  });

  // ════════ Q3 · RV2-3 system-cap exemption ════════
  await sub("Q3", async () => {
    const dom = `cust3-${rand}.test`;
    const K1 = await mkContact("ผู้รับ", `buyer@${dom}`);
    const rfc = `${randomBytes(12).toString("hex")}.q3@shark.in.th`;
    await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: K1.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: `thr3${rand}`, fromAddr: `${TAG}@shark.in.th`, toAddrs: [K1.email], subject: `ใบเสนอราคา Q3 ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 60_000), trackTokenHash: sha(`${TAG}-q3`) } });
    // attacker's own earlier IN mail (its Message-ID is known to the attacker)
    const ownRfc = `${TAG}-own@evil.test`;
    const own = await ingest(mail({ messageId: `<${ownRfc}>`, from: `evil@evil-${rand}.test` }));
    await fillBucket(sysKey, 1000);
    const notifs0 = await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id } });
    const r: Record<string, Any> = {};
    r.random1 = await ingest(mail({ from: `r1-${rand}@spam.test` }));
    const afterFirstDrop = await bucketCount(sysKey);
    r.random2 = await ingest(mail({ from: `r2-${rand}@spam.test` }));
    r.guessedId = await ingest(mail({ from: K1.email, headers: { "in-reply-to": `<${randomBytes(12).toString("hex")}.${Date.now().toString(36)}@shark.in.th>` } }));
    r.validIdWrongFrom = await ingest(mail({ from: `outsider@${dom}`, headers: { "in-reply-to": `<${rfc}>` } }));
    r.ownInboundId = await ingest(mail({ from: `evil@evil-${rand}.test`, headers: { "in-reply-to": `<${ownRfc}>`, references: `<${ownRfc}>` } }));
    r.ccAsToForge = await ingest(mail({ from: INBOX, headers: { "in-reply-to": `<${rfc}>` } }));
    const sysBefore = await bucketCount(sysKey);
    r.genuineReply = await ingest(mail({ from: K1.email, subject: `Re: ใบเสนอราคา Q3 ${TAG}`, headers: { "in-reply-to": `<${rfc}>` } }));
    const sysAfter = await bucketCount(sysKey);
    const notifs1 = await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id } });
    const capNotices = await P.appNotification.findMany({ where: { tenantId: T, recipientUserId: u.id, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } }, select: { title: true, body: true } });
    const notif = capNotices[0];
    const repliedNotices = await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id, title: "ลูกค้าตอบกลับแล้ว" } });
    const audits = await P.auditLog.count({ where: { tenantId: T, action: "crm.email.inbound.rate_limited" } });
    // exempt path is still bounded by the per-sender bucket
    await fillBucket(senderKey(K1.email), 100);
    r.genuineOverSender = await ingest(mail({ from: K1.email, subject: `Re: again ${TAG}`, headers: { "in-reply-to": `<${rfc}>` } }));
    await P.chatRateBucket.deleteMany({ where: { key: { in: [sysKey, senderKey(K1.email)] } } });
    const rs = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.handled ? "stored" : v?.reason]));
    chk("Q3", "RV2-3 CLOSED? with the system bucket full: random From, guessed Message-ID, valid Message-ID from a non-recipient, citing the attacker's OWN inbound Message-ID, From = our inbox ⇒ all dropped · the genuine recipient's reply is stored and does NOT consume the bucket · exempt path still dies at the per-sender cap · owner told ONCE per window (no address/PII in the notice) · one audit line",
      own.handled === true && rs.random1 === "rate_limited" && rs.random2 === "rate_limited" && rs.guessedId === "rate_limited" && rs.validIdWrongFrom === "rate_limited" && rs.ownInboundId === "rate_limited" && rs.ccAsToForge !== "stored" &&
      rs.genuineReply === "stored" && sysAfter === sysBefore && rs.genuineOverSender === "rate_limited" && capNotices.length === 1 && notifs1 - notifs0 === 1 + repliedNotices && audits === 1 && afterFirstDrop === 1001 &&
      !String(notif?.body ?? "").includes("@"),
      `${j(rs)} sysBucket ${sysBefore}→${sysAfter} afterFirstDrop=${afterFirstDrop} notices+${notifs1 - notifs0} (cap=${capNotices.length} replied=${repliedNotices}) audits=${audits} notice=${j(notif)}`);
  });

  // ════════ Q4 · RV2-4 list surface ════════
  await sub("Q4", async () => {
    const k = await mkContact("ลูกค้าQ4", `q4@cust4-${rand}.test`);
    const f = await ingest(mail({ from: k.email, subject: `ปลอม Q4 ${TAG}` }));
    const lst = await CRM.emails.listThreads(ctx, owner, { contactId: k.id });
    const row = await rowOf(f.emailId);
    const item = lst.items.find((t: Any) => t.threadKey === row?.threadKey);
    const act = await P.crmActivity.findFirst({ where: { tenantId: T, sourceRef: f.emailId }, select: { title: true } });
    const opsSrc = readFileSync("src/lib/modules/crm/api/ops/emails.ts", "utf8");
    const passThrough = /const items = forAssistant\(actor\) \? r\.items\.map\(\(it\) => maskFreeText\(\{ \.\.\.it \}, \["subject", "snippet"\]\)\) : r\.items;/.test(opsSrc);
    chk("Q4", "RV2-4 CLOSED? listThreads item (inbox · REST GET /emails/threads · AI tool crm_email_thread — the op returns listThreads items as-is, assistant masking keeps other keys) carries unverifiedFrom = true · residual: the contact timeline activity row has only the subject (no flag)",
      item?.unverifiedFrom === true && passThrough, `item=${j({ unverifiedFrom: item?.unverifiedFrom })} opPassThrough=${passThrough} activity=${j(act)}`);
  });

  // ════════ Q5 · RV2-5 orderings ════════
  await sub("Q5", async () => {
    const meta = { ip: "203.0.113.230", userAgent: "lost-phone" };
    const setup = async (label: string) => {
      const coA = await mkCompany(`A ${label} ${TAG}`);
      const coB = await mkCompany(`B ${label} ${TAG}`);
      const k = await mkContact(`สอง ${label}`, `two-${label}-${rand}@qc.invalid`);
      for (const co of [coA, coB]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: k.id, isPrimary: co.id === coA.id, startedAt: new Date(Date.now() - 600_000) } });
      const iA = await CRM.portal.invite(ctx, owner, { companyId: coA.id, contactId: k.id, role: "APPROVE" });
      const iB = await CRM.portal.invite(ctx, owner, { companyId: coB.id, contactId: k.id, role: "VIEW" });
      await P.crmPortalAccess.updateMany({ where: { id: { in: [iA.accessId, iB.accessId] } }, data: { acceptedAt: new Date() } });
      return { coA, coB, k, iA, iB };
    };
    const liveOf = async (contactId: string) => P.portalSession.count({ where: { tenantId: T, crmContactId: contactId, revokedAt: null } });
    const out: Record<string, string> = {};
    // (a) device on B · re-invite A · switch B→A
    { const s = await setup("a"); const sB = await CS.mintPortalSession(s.iB.accessId, meta);
      await CRM.portal.invite(ctx, owner, { companyId: s.coA.id, contactId: s.k.id, role: "APPROVE" });
      const sw = await settle(CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: true }));
      out.a = `B=${!!(await CS.getPortalSession(sB.token))} switch=${sw.ok ? "OK" : "refused"} live=${await liveOf(s.k.id)}`; }
    // (b) device on A · re-invite B
    { const s = await setup("b"); const sA = await CS.mintPortalSession(s.iA.accessId, meta);
      await CRM.portal.invite(ctx, owner, { companyId: s.coB.id, contactId: s.k.id, role: "VIEW" });
      out.b = `A=${!!(await CS.getPortalSession(sA.token))} live=${await liveOf(s.k.id)}`; }
    // (c) device switches B→A first, then re-invite B
    { const s = await setup("c"); const sB = await CS.mintPortalSession(s.iB.accessId, meta);
      const sw = await CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: false });
      await CRM.portal.invite(ctx, owner, { companyId: s.coB.id, contactId: s.k.id, role: "VIEW" });
      out.c = `oldB=${!!(await CS.getPortalSession(sB.token))} newA=${!!(await CS.getPortalSession(sw.token))} live=${await liveOf(s.k.id)}`; }
    // (d) race: switch B→A concurrently with re-invite A (several delays)
    let survived = 0; const trials: string[] = [];
    for (const delay of [0, 5, 15, 30, 60, 120]) {
      const s = await setup(`d${delay}`); const sB = await CS.mintPortalSession(s.iB.accessId, meta);
      const [sw] = await Promise.all([
        settle(CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: true })),
        new Promise((r) => setTimeout(r, delay)).then(() => CRM.portal.invite(ctx, owner, { companyId: s.coA.id, contactId: s.k.id, role: "APPROVE" })),
      ]);
      const live = await liveOf(s.k.id);
      if (live > 0) survived += 1;
      trials.push(`${delay}ms:${sw.ok ? "sw" : "x"}/live${live}`);
    }
    out.d = `${trials.join(" ")} survived=${survived}`;
    // (e) FIRST invite into a new company C while device on A (accepted deviation)
    { const s = await setup("e"); const coC = await mkCompany(`C e ${TAG}`);
      await P.crmCompanyContact.create({ data: { tenantId: T, companyId: coC.id, contactId: s.k.id, isPrimary: false, startedAt: new Date(Date.now() - 600_000) } });
      const sA = await CS.mintPortalSession(s.iA.accessId, meta);
      await CRM.portal.invite(ctx, owner, { companyId: coC.id, contactId: s.k.id, role: "APPROVE" });
      const sw = await settle(CRM.portal.switchCompany(sA.token, coC.id, meta, { revokeCurrent: true }));
      out.e = `A=${!!(await CS.getPortalSession(sA.token))} switchIntoNewC=${sw.ok ? "OK" : "refused"}`; }
    // (f) staff REVOKE of A (not re-invite) while device on B
    { const s = await setup("f"); const sB = await CS.mintPortalSession(s.iB.accessId, meta);
      await CRM.portal.revoke(ctx, owner, { accessId: s.iA.accessId }).catch(async () => CRM.portal.revoke(ctx, owner, s.iA.accessId));
      const sw = await settle(CRM.portal.switchCompany(sB.token, s.coA.id, meta, { revokeCurrent: true }));
      out.f = `B=${!!(await CS.getPortalSession(sB.token))} switchIntoRevokedA=${sw.ok ? "OK" : "refused"}`; }
    chk("Q5", "RV2-5: (a) re-invite A kills B and switch B→A is refused · (b) re-invite B kills A · (c) switched-first then re-invite B kills both · (d) race switch-vs-re-invite: report survivors · (e) first invite into new C: lost device on A stays and can switch into C (accepted deviation) · (f) revoke A: B stays, switch into A refused",
      out.a?.startsWith("B=false switch=refused live=0") && out.b === "A=false live=0" && /oldB=false newA=false live=0/.test(out.c ?? "") && /switchIntoRevokedA=refused/.test(out.f ?? ""),
      j(out));
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf2-review-r2: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(0);
