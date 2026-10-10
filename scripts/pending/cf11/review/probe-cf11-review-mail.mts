// review probe — CRM C5.5-fix8 items 6/7 (R2-1 · H3-1), adversarial · checks assert the SAFE behaviour ⇒ ❌ = finding reproduces
//   RA  proven mail is exempt from BOTH buckets with no bound: thread-proof sender (customer address + one Message-ID of our mail) and a
//       CC participant of that mail · DMARC-proven sender (own domain) — with both buckets already full, every mail is stored and pays the
//       full downstream (activity · crm.email.received · "customer replied" notice · copy-in outbound mail)
//   RB  reference lookup amplification: `findMany` of up to 50 referenced rows WITHOUT `select` runs before the buckets ⇒ an unproven
//       flood mail that is dropped still loads every column (bodyHtml/bodyText ≤ 1 M chars each) of up to 50 rows
//   RC  owner-notice spam: one AppNotification per owner per forged sender that trips its per-sender bucket (no dedupe across senders)
//   RD  Authentication-Results controls (authserv-id unset / two instances / sub-domain / lookalike) — expected green
// QC3 ONLY · throwaway tenant `qc-cf11-rv-*` · network blocked
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/review/probe-cf11-review-mail.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes, createHash } from "node:crypto";
const { ctx } = (await import("../_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("rv");
const { P, prisma, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11-rv.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
const COPY = `copybox-${rand}@outside.test`;
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "IN", copyToAddr: COPY } });
await P.crmPipeline.create({
  data: {
    tenantId: tid,
    systemId: S,
    name: `ขาย ${TAG}`,
    isDefault: true,
    stages: { create: ([["ใหม่", "OPEN", 10], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]] as const).map(([name, kind, probability], i) => ({ tenantId: tid, systemId: S, sortOrder: i, name, kind, probability })) },
  },
});
const vDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${vDom}` } });
const CC = `colleague-${rand}@thirdparty.test`;
const pv = `${TAG}-parent@shark.test`;
await P.crmEmailMessage.create({
  data: { tenantId: tid, systemId: S, contactId: V.id, direction: "OUT", messageId: `${S}:${pv}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: [V.email], ccAddrs: [CC], subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
});

const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
let copies = 0;
const deps = { transport: async () => { copies += 1; return { ok: true, id: "copy" }; } };
let n = 0;
const ingest = async (from: string, subject: string, o: { ar?: string | null; authserv?: string | null; extra?: Record<string, string>; html?: string; text?: string; messageId?: string } = {}) => {
  const headers: Record<string, string> = { ...(o.ar ? { "authentication-results": o.ar } : {}), ...(o.extra ?? {}) };
  if (o.authserv) process.env.CRM_INBOUND_AUTHSERV_ID = o.authserv;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: o.messageId ?? `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: o.text ?? "สวัสดีค่ะ", html: o.html ?? "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const arPass = (d: string) => `${AUTHSERV}; spf=pass smtp.mailfrom=${d}; dkim=pass header.d=${d}; dmarc=pass header.from=${d}`;
const senderKey = (addr: string) => `crm.email.in.from.${S}.${sha(`from:${addr}`).slice(0, 32)}`;
const sysKey = `crm.email.in.sys.${S}`;
const setBucket = (key: string, count: number) =>
  P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const capNotices = () => P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } } });
const allNotices = () => P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid } });
const evts = () => P.outboxEvent.count({ where: { tenantId: tid, type: "crm.email.received" } });
const acts = () => P.crmActivity.count({ where: { tenantId: tid, source: "EMAIL", contactId: V.id } });

await sub("RA proven mail has no bound (H3-1 exemption)", async () => {
  // both buckets already full (an unproven flood ran this hour) — proven mail must still be bounded by SOMETHING
  await setBucket(senderKey(V.email), 100);
  await setBucket(senderKey(CC), 100);
  await setBucket(sysKey, 1000);
  const N = 150;
  const [c0, e0, a0, n0] = [copies, await evts(), await acts(), await allNotices()];
  let stored = 0;
  for (let i = 0; i < N; i += 1) if ((await ingest(V.email, `Re: ใบเสนอราคา ${TAG} #${i}`, { extra: { "in-reply-to": `<${pv}>` }, html: `<p>${"ข้อความยาว ".repeat(200)}</p>` })).handled) stored += 1;
  const [c1, e1, a1, n1] = [copies, await evts(), await acts(), await allNotices()];
  chk("RA.1", stored < N, `thread-proven (customer address + our Message-ID), both buckets full: ${stored}/${N} stored · per mail: copy-in sends +${c1 - c0} · crm.email.received +${e1 - e0} · EMAIL activities +${a1 - a0} · owner notifications +${n1 - n0} · sender bucket ${await bucket(senderKey(V.email))} (untouched) · system bucket ${await bucket(sysKey)} (want some bound)`);
  let ccStored = 0;
  for (let i = 0; i < 30; i += 1) if ((await ingest(CC, `Re: ใบเสนอราคา ${TAG} cc#${i}`, { extra: { "in-reply-to": `<${pv}>` } })).handled) ccStored += 1;
  chk("RA.2", ccStored < 30, `a CC participant of our mail (not a contact) citing it, both buckets full: ${ccStored}/30 stored (want some bound)`);
  const eDom = `evil-${rand}.test`;
  let dStored = 0;
  await setBucket(senderKey(`x@${eDom}`), 100);
  for (let i = 0; i < 120; i += 1) if ((await ingest(`x@${eDom}`, `สแปม ${i}`, { ar: arPass(eDom), authserv: AUTHSERV })).handled) dStored += 1;
  chk("RA.3", dStored < 120, `DMARC-proven sender on an attacker-owned domain (one address), both buckets full: ${dStored}/120 stored (base: the per-sender bucket counted all mail ⇒ 0) (want some bound)`);
  // control: an unproven flood from the customer's address is still dropped
  const u = await ingest(V.email, "ปลอม", {});
  chk("RA.4", u.handled === false && u.reason === "rate_limited", `control: unproven mail in the customer's name with buckets full → ${j(u)}`);
});

await sub("RB reference lookup loads full rows of up to 50 referenced mails before the buckets", async () => {
  // a realistic big stored row via the real path (≤ 1 M chars of HTML survives the sanitiser)
  await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
  const big = await ingest(`att-${rand}@spam.test`, "big", { html: `<p>${"a".repeat(999_000)}</p>`, text: "b".repeat(999_000), messageId: `<${TAG}-big-0@spam.test>` });
  const bigRow = (await P.crmEmailMessage.findUnique({ where: { id: big.emailId }, select: { bodyHtml: true, bodyText: true } })) as Any;
  chk("RB.0", big.handled === true && (bigRow?.bodyHtml?.length ?? 0) > 990_000 && (bigRow?.bodyText?.length ?? 0) > 990_000,
    `premise: an unproven stranger's mail stores bodyHtml=${bigRow?.bodyHtml?.length} bodyText=${bigRow?.bodyText?.length} chars`);
  // 49 more rows of 200 k + 200 k chars (inserted directly to keep QC small — same columns the path stores)
  const ids: string[] = [`${TAG}-big-0@spam.test`];
  const rows = [];
  for (let i = 1; i < 50; i += 1) {
    const rfc = `${TAG}-big-${i}@spam.test`;
    ids.push(rfc);
    rows.push({ tenantId: tid, systemId: S, direction: "IN", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `att-${rand}@spam.test`, toAddrs: [`crm+${KEY}@shark.in.th`], subject: `big ${i}`, bodyHtml: "h".repeat(200_000), bodyText: "t".repeat(200_000), status: "RECEIVED", receivedAt: new Date(), matchedBy: "NONE", trackTokenHash: randomBytes(16).toString("hex") });
  }
  await P.crmEmailMessage.createMany({ data: rows });
  const bytes = Number(((await P.$queryRawUnsafe(`SELECT coalesce(sum(coalesce(octet_length("bodyHtml"),0)+coalesce(octet_length("bodyText"),0)),0)::bigint AS b FROM "CrmEmailMessage" WHERE "systemId"=$1 AND "messageId" = ANY($2::text[])`, S, ids.map((x) => `${S}:${x}`))) as Any[])[0]?.b ?? 0);
  // measure what the path actually loads: wrap the model delegate's findMany (same singleton emails.ts uses)
  const del = (prisma as Any).crmEmailMessage;
  const orig = del.findMany;
  let loaded = 0;
  let wrappedCalls = 0;
  del.findMany = async (...a: Any[]) => {
    const r = await orig.apply(del, a);
    wrappedCalls += 1;
    loaded += JSON.stringify(r).length;
    return r;
  };
  const wrapOk = (prisma as Any).crmEmailMessage.findMany === del.findMany;
  // flooder: unproven, own sender bucket full + system bucket full ⇒ the mail is dropped
  const fl = `flood-${rand}@spam.test`;
  await setBucket(senderKey(fl), 100);
  await setBucket(sysKey, 1000);
  const refsAll = ids.map((x) => `<${x}>`).join(" ");
  const t0 = Date.now();
  const r50 = await ingest(fl, "x", { extra: { references: refsAll } });
  const ms50 = Date.now() - t0;
  const loaded50 = loaded;
  loaded = 0;
  const t1 = Date.now();
  const r1 = await ingest(fl, "x", { extra: { references: `<${ids[1]}>` } });
  const ms1 = Date.now() - t1;
  const loaded1 = loaded;
  del.findMany = orig;
  chk("RB.1", r50.reason === "rate_limited" && loaded50 < 1_000_000,
    `dropped unproven mail citing 50 stored mails → ${r50.reason} · reference query loaded ≈${(loaded50 / 1e6).toFixed(1)} M chars of row JSON (DB body bytes of those rows ${(bytes / 1e6).toFixed(1)} MB) in ${ms50} ms · same mail citing 1 row → ${r1.reason}, ${(loaded1 / 1e6).toFixed(2)} M chars, ${ms1} ms · wrapper active=${wrapOk && wrappedCalls > 0} (want < 1 M chars before a drop — base findFirst = 1 row)`);
});

await sub("RC owner notices: one per forged sender that trips its bucket", async () => {
  await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
  await setBucket(sysKey, 1000); // system bucket already full — the per-sender bucket is still counted first
  const before = await capNotices();
  const K = 12;
  for (let i = 0; i < K; i += 1) {
    const a = `forged${i}-${rand}@random${i}.test`;
    await setBucket(senderKey(a), 100);
    await ingest(a, "x", {});
  }
  const after = await capNotices();
  const sysAfter = await bucket(sysKey);
  chk("RC.1", after - before <= 2, `${K} forged senders × 101 unproven mails each (bucket preset to 100) → owner cap notices +${after - before} (one per sender · system bucket ${sysAfter}, its own notice fired at most once) (want deduped per window)`);
});

await sub("RD Authentication-Results controls (expected green)", async () => {
  await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
  const d = `ar-${rand}.test`;
  const flag = async (r: Any) => ((await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { routing: true } })) as Any)?.routing?.unverifiedFrom === true;
  const unset = await ingest(`a@${d}`, "unset", { ar: arPass(d), authserv: null });
  const two = await ingest(`b@${d}`, "two", { ar: `${arPass(d)}\n${arPass(d)}`, authserv: AUTHSERV });
  const sub1 = await ingest(`c@mail.${d}`, "subdomain", { ar: arPass(d), authserv: AUTHSERV });
  const look = await ingest(`d@${d}`, "lookalike", { ar: arPass(`x${d}`), authserv: AUTHSERV });
  const other = await ingest(`e@${d}`, "other authserv", { ar: arPass(d).replace(AUTHSERV, "mx.attacker.test"), authserv: AUTHSERV });
  const ok = await ingest(`f@${d}`, "ok", { ar: arPass(d), authserv: AUTHSERV });
  const fl = [await flag(unset), await flag(two), await flag(sub1), await flag(look), await flag(other), await flag(ok)];
  chk("RD.1", fl.join() === "true,true,true,true,true,false", `unverifiedFrom: authserv unset=${fl[0]} · two instances of our id=${fl[1]} · From sub-domain vs header.from parent=${fl[2]} · lookalike header.from=${fl[3]} · foreign authserv=${fl[4]} · genuine=${fl[5]} (want true×5, false)`);
  const caseDup = await ingest(`g@${d}`, "case dup", { ar: arPass(d), authserv: AUTHSERV, extra: { "Authentication-Results": arPass(d) } });
  chk("RD.2", await flag(caseDup), `two A-R headers differing only in case are joined ⇒ two instances ⇒ no proof → flagged=${await flag(caseDup)}`);
});

await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } }).catch(() => undefined);
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-review-mail");
