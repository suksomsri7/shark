// probe — CRM C5.5-fix8 round 4 (review round 3 · RV-8 light-sender lane + V per-domain bucket · RV-9 one free-mail list · Gmail dots)
//   B  reviewer R3B.1 (P14 unset): 10 attacker mailboxes, each holding one OUT mail of ours, × 100 thread-only replies ⇒ the customer's
//      1st and 10th reply of the hour are stored; her 11th is dropped only because the T system bucket is full
//   A  reviewer R3A.1 (P14 set): 20 mailboxes on ONE attacker DMARC domain × 100 V mails ⇒ capped by the V domain bucket (300); the
//      customer's V reply is stored
//   L  light-lane boundary (10 stored, 11th dropped with the class system bucket full) · `+tag` / Gmail-dot / case variants = one sender
//   F  free-mail list parity (one source) · D and U have no light lane · notices deduped · pre-bucket cost (one narrow query)
// QC3 ONLY · throwaway tenant `qc-cf11-r4-*` · network blocked · rate buckets of the throwaway system removed
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/probe-cf11-r4.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r4");
const { P, prisma, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r4.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
const cDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${cDom}` } });
let outN = 0;
const outRow = async (to: string[]) => {
  const rfc = `${TAG}-out-${++outN}@shark.test`;
  await P.crmEmailMessage.create({
    data: { tenantId: tid, systemId: S, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: to, ccAddrs: [], subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
  });
  return rfc;
};
const pv = await outRow([V.email]);
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, o: { dmarc?: boolean; authserv?: boolean; replyTo?: string } = {}) => {
  const d = from.replace(/^.*@/, "").toLowerCase();
  const headers: Record<string, string> = {
    ...(o.dmarc ? { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${d}; dkim=pass header.d=${d}; dmarc=pass header.from=${d}` } : {}),
    ...(o.replyTo ? { "in-reply-to": `<${o.replyTo}>` } : {}),
  };
  if (o.authserv ?? true) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: "สวัสดีค่ะ", html: "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const ES = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const CS = (await import("@/lib/modules/crm/companies-shared" as string)) as Any;
const norm = (a: string) => (typeof ES.inboundSenderBucketAddr === "function" ? ES.inboundSenderBucketAddr(a) : a.toLowerCase());
const K = {
  sender: (c: string, a: string) => (c === "u" ? `crm.email.in.from.${S}.${sha(`from:${norm(a)}`).slice(0, 32)}` : `crm.email.in.from.${c}.${S}.${sha(`from:${norm(a)}`).slice(0, 32)}`),
  dom: (c: string, d: string) => `crm.email.in.dom.${c}.${S}.${sha(`dom:${d}`).slice(0, 32)}`,
  sys: (c: string) => (c === "u" ? `crm.email.in.sys.${S}` : `crm.email.in.sys.${c}.${S}`),
};
const setBucket = (key: string, count: number) =>
  P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const clear = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
const capNotices = () => P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } } });

await sub("B reviewer R3B.1 — P14 unset, 10 attacker pairs × 100 thread-only replies", async () => {
  await clear();
  let stored = 0;
  const owns: string[] = [];
  for (let k = 0; k < 10; k += 1) {
    const box = `atk${k}-${rand}@freemail${k}.test`;
    const own = await outRow([box]);
    owns.push(own); // one shop-sent mail per attacker mailbox (staff reply / form auto-mail / sequence step / CC)
    for (let i = 0; i < 100; i += 1) if ((await ingest(box, `Re: x ${k}.${i}`, { replyTo: own, authserv: false })).handled) stored += 1;
  }
  const tSys = await bucket(K.sys("t"));
  const r: Any[] = [];
  for (let i = 1; i <= 11; i += 1) r.push(await ingest(V.email, `Re: ใบเสนอราคา ${TAG} #${i}`, { replyTo: pv, authserv: false }));
  chk("B.1", stored === 1000 && tSys >= 1000 && r[0].handled === true && r[9].handled === true && r.slice(0, 10).every((x) => x.handled === true) && r[10].reason === "rate_limited",
    `attacker 10 pairs × 100 → ${stored}/1000 stored · T system bucket ${await bucket(K.sys("t"))} · customer's replies 1..10 → ${r.slice(0, 10).filter((x) => x.handled).length}/10 stored (1st ${r[0].handled ? "stored" : r[0].reason}, 10th ${r[9].handled ? "stored" : r[9].reason}) · 11th → ${r[10].reason ?? "stored"} (system bucket full ⇒ only senders above 10/h are dropped)`);
  const extra = await ingest(`atk0-${rand}@freemail0.test`, "Re: more", { replyTo: owns[0], authserv: false });
  chk("B.2", extra.reason === "rate_limited", `bound: an attacker mailbox above its sender cap → ${extra.reason ?? "stored"} (attacker volume ≤ system cap + 10·k)`);
});

await sub("A reviewer R3A.1 — P14 set, 20 mailboxes on one attacker DMARC domain × 100 V mails", async () => {
  await clear();
  const eDom = `evil-${rand}.test`;
  let stored = 0;
  for (let k = 0; k < 20; k += 1) {
    const box = `m${k}@${eDom}`;
    const own = await outRow([box]);
    for (let i = 0; i < 100; i += 1) if ((await ingest(box, `Re: v ${k}.${i}`, { dmarc: true, replyTo: own })).handled) stored += 1;
  }
  const g = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} V`, { dmarc: true, replyTo: pv });
  chk("A.1", stored === 300 && (await bucket(K.dom("v", eDom))) === 2000 && g.handled === true,
    `20 attacker mailboxes × 100 V mails on one DMARC domain → ${stored}/2000 stored (V domain bucket 300) · customer's V reply → ${g.handled ? "stored" : g.reason}`);
});

await sub("L light-lane boundary + sender-key variants", async () => {
  await clear();
  await setBucket(K.sys("t"), 1000);
  const fresh = `fresh-${rand}@client2-${rand}.test`;
  const own = await outRow([fresh]);
  const r: Any[] = [];
  for (let i = 1; i <= 11; i += 1) r.push(await ingest(fresh, `Re: f ${i}`, { replyTo: own, authserv: false }));
  chk("L.1", r.slice(0, 10).every((x) => x.handled === true) && r[10].reason === "rate_limited",
    `T system bucket full: a fresh sender's mails 1..10 → ${r.slice(0, 10).filter((x) => x.handled).length}/10 stored · 11th → ${r[10].reason ?? "stored"}`);
  await clear();
  await setBucket(K.sys("t"), 1000);
  const forms = [`john.smith${rand}`, `JohnSmith${rand}+a`, `j.o.h.n.s.m.i.t.h${rand}+b`, `john.smith${rand}+c`, `JOHN.SMITH${rand}`, `johnsmith${rand}`].map((l) => `${l}@gmail.com`);
  const ownG = await outRow(forms.map((f) => f.toLowerCase()));
  const keys = new Set(forms.map((f) => norm(f)));
  const rr: Any[] = [];
  for (let i = 0; i < 11; i += 1) rr.push(await ingest(forms[i % forms.length]!, `Re: g ${i}`, { replyTo: ownG, authserv: false }));
  chk("L.2", keys.size === 1 && rr.slice(0, 10).every((x) => x.handled === true) && rr[10].reason === "rate_limited",
    `Gmail dot / +tag / case variants → ${keys.size} sender key(s) ${j([...keys])} · with the T system bucket full: first 10 across the variants → ${rr.slice(0, 10).filter((x) => x.handled).length}/10 stored, 11th → ${rr[10].reason ?? "stored"} (one light-lane allowance per mailbox)`);
  const ot = norm(`a.b+x@outlook.com`);
  chk("L.3", ot === "a.b@outlook.com" && norm("A.B@googlemail.com") === "ab@googlemail.com", `dots are stripped only for gmail.com/googlemail.com: outlook → ${ot} · googlemail → ${norm("A.B@googlemail.com")}`);
});

await sub("F free-mail parity · D/U no light lane · notices · pre-bucket cost", async () => {
  await clear();
  const list = ES.CRM_INBOUND_FREE_MAIL_DOMAINS as Any;
  const has = (d: string) => (typeof list?.has === "function" ? list.has(d) : Array.isArray(list) && list.includes(d));
  chk("F.1", list === CS.FREE_MAIL_DOMAINS && ["hotmail.co.th", "msn.com", "mac.com", "aol.com", "gmx.com", "gmail.com"].every(has),
    `CRM_INBOUND_FREE_MAIL_DOMAINS is the module list FREE_MAIL_DOMAINS (same object: ${list === CS.FREE_MAIL_DOMAINS}) · has hotmail.co.th/msn.com/mac.com/aol.com/gmx.com: ${["hotmail.co.th", "msn.com", "mac.com", "aol.com", "gmx.com"].map(has).join(",")}`);
  await setBucket(K.dom("d", "hotmail.co.th"), 5000);
  const hm = await ingest(`thai-${rand}@hotmail.co.th`, "hm", { dmarc: true });
  chk("F.2", hm.handled === true && (await bucket(K.dom("d", "hotmail.co.th"))) === 5000, `DMARC-passing hotmail.co.th sender (D) → ${hm.handled ? "stored" : hm.reason} · no per-domain bucket touched`);
  await setBucket(K.sys("d"), 1000);
  await setBucket(K.sys("u"), 1000);
  const d1 = await ingest(`d1-${rand}@corp-${rand}.test`, "d1", { dmarc: true });
  const u1 = await ingest(`u1-${rand}@nobody-${rand}.test`, "u1", {});
  chk("F.3", d1.reason === "rate_limited" && u1.reason === "rate_limited", `D and U have no light lane: a fresh sender's 1st mail with the class system bucket full → D ${d1.reason ?? "stored"} · U ${u1.reason ?? "stored"}`);
  await clear();
  await P.appNotification.deleteMany({ where: { tenantId: tid } });
  await P.auditLog.deleteMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" } });
  await setBucket(K.sys("t"), 1000);
  for (const who of [`h1-${rand}@x1.test`, `h2-${rand}@x2.test`]) {
    const own = await outRow([who]);
    await setBucket(K.sender("t", who), 10);
    await ingest(who, "Re: h", { replyTo: own, authserv: false });
  }
  const aud = (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket).filter((b: string) => b === "system-t");
  chk("F.4", (await capNotices()) === 1 && aud.length === 1, `two heavy senders dropped by the full T system bucket → owner notices ${await capNotices()} (want 1) · system-t audit lines ${aud.length} (want 1 per window)`);
  // pre-bucket cost: a dropped mail citing 20 of our refs runs the dup check + ONE narrow proof query, nothing else on CrmEmailMessage
  await clear();
  await setBucket(K.sys("u"), 1000);
  await setBucket(K.sender("u", `cost-${rand}@spam.test`), 100);
  const del = (prisma as Any).crmEmailMessage;
  const calls: string[] = [];
  const wrap = (name: string) => { const o = del[name]; del[name] = async (...a: Any[]) => { calls.push(`${name}:${j(Object.keys(a[0]?.select ?? { "*": 1 }))}`); return o.apply(del, a); }; return () => { del[name] = o; }; };
  const un = [wrap("findMany"), wrap("findFirst"), wrap("findUnique")];
  const refs = Array.from({ length: 20 }, (_, i) => `<${TAG}-junk-${i}@x.test>`).join(" ");
  const dropped = await EM.ingestInbound({ messageId: `<${TAG}-cost@probe.test>`, from: `cost-${rand}@spam.test`, to: [`crm+${KEY}@shark.in.th`], cc: [], subject: "c", text: "c", html: "", headers: { references: refs }, attachments: [] }, deps);
  un.forEach((f) => f());
  chk("F.5", dropped.reason === "rate_limited" && j(calls) === j(['findFirst:["id"]', 'findMany:["messageId","toAddrs","ccAddrs"]']),
    `dropped mail with 20 references → ${dropped.reason} · CrmEmailMessage reads before the drop: ${j(calls)} (want the dup check + one narrow proof query)`);
});

await clear().catch(() => undefined);
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-r4");
