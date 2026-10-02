// review probe (round 3) — CRM C5.5-fix8 r3 (3123f37e): V/D/T/U split, adversarial · corrected classifier (per-class system keys)
//   R3C classifier: which class's system bucket moved (`crm.email.in.sys.{v,d,t}.<sys>` · U `crm.email.in.sys.<sys>`)
//   R3A V kill switch (P14 set): an attacker who holds k provable pairs = k of its OWN mailboxes that each received one OUT mail from the
//       shop (auto-welcome / sequence on contact.created, or a staff reply to an enquiry) — 20 mailboxes on one attacker DMARC domain ×
//       100 V mails fill V's system bucket (2,000/h) ⇒ a genuine customer's verified reply is dropped (no V per-domain bucket)
//   R3B T kill switch (P14 UNSET — today): 10 attacker mailboxes (any domain, no DMARC) that each received one OUT mail × 100 thread-only
//       replies fill T's system bucket (1,000/h) ⇒ every customer's genuine reply (all T while P14 is unset) is dropped
//   R3D normalisation: `+tag` merged · case merged · Gmail dot variants are separate buckets (INFO)
//   R3E count-then-drop: with T's system bucket full, a forged-in-the-victim's-name T mail still consumes the victim's T sender bucket (INFO)
//   R3F free-mail list vs the module's FREE_MAIL_DOMAINS (INFO)
// Checks assert the SAFE behaviour ⇒ ❌ = finding reproduces · INFO rows always pass
// QC3 ONLY · throwaway tenant `qc-cf11-r3r-*` · network blocked
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/review/probe-cf11-review-r3.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("../_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r3r");
const { P, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r3r.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const ES = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const CS = (await import("@/lib/modules/crm/companies-shared" as string)) as Any;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
const cDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${cDom}` } });
const BCC = `hidden-${rand}@thirdparty.test`;
let outN = 0;
// an OUT mail the shop sent (staff reply / sequence / automation SEND_EMAIL — same row shape for the proof query)
const outRow = async (to: string[], cc: string[] = [], bcc: string[] = []) => {
  const rfc = `${TAG}-out-${++outN}@shark.test`;
  await P.crmEmailMessage.create({
    data: { tenantId: tid, systemId: S, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: to, ccAddrs: cc, bccAddrs: bcc, subject: `ยินดีต้อนรับ ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
  });
  return rfc;
};
const pv = await outRow([V.email], [], [BCC]);
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, o: { ar?: string; authserv?: boolean; extra?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { ...(o.ar ? { "authentication-results": o.ar } : {}), ...(o.extra ?? {}) };
  if (o.authserv) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: "x", html: "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const arPass = (d: string) => `${AUTHSERV}; spf=pass smtp.mailfrom=${d}; dkim=pass header.d=${d}; dmarc=pass header.from=${d}`;
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const sysKeys: Record<string, string> = { V: `crm.email.in.sys.v.${S}`, D: `crm.email.in.sys.d.${S}`, T: `crm.email.in.sys.t.${S}`, U: `crm.email.in.sys.${S}` };
const senderKeyT = (a: string) => `crm.email.in.from.t.${S}.${sha(`from:${ES.inboundSenderBucketAddr(a)}`).slice(0, 32)}`;
const senderKeyD = (a: string) => `crm.email.in.from.d.${S}.${sha(`from:${a}`).slice(0, 32)}`;
const clear = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
const classOf = async (fn: () => Promise<Any>) => {
  const before: Record<string, number> = {};
  for (const [c, k] of Object.entries(sysKeys)) before[c] = await bucket(k);
  const r = await fn();
  const moved: string[] = [];
  for (const [c, k] of Object.entries(sysKeys)) if ((await bucket(k)) > before[c]!) moved.push(c);
  return { r, cls: moved.join("+") || "none" };
};
const reply = (rfc: string) => ({ "in-reply-to": `<${rfc}>` });

await sub("R3C corrected classifier", async () => {
  await clear();
  const a = await classOf(() => ingest(`"Buyer" <BUYER@${cDom.toUpperCase()}>`, "Re", { extra: reply(pv) }));
  const b = await classOf(() => ingest(`buyer+x@${cDom}`, "Re", { extra: reply(pv) }));
  const c = await classOf(() => ingest(BCC, "Re", { extra: reply(pv) }));
  const d = await classOf(() => ingest(V.email, "Re", { ar: arPass(cDom), authserv: true, extra: reply(pv) }));
  const e = await classOf(() => ingest(`new@${cDom}`, "hi", { ar: arPass(cDom), authserv: true }));
  const f = await classOf(() => ingest(V.email, "Re", { ar: arPass(cDom), authserv: false, extra: reply(pv) }));
  chk("R3C.1", a.cls === "T" && b.cls === "U" && c.cls === "U" && d.cls === "V" && e.cls === "D" && f.cls === "T",
    `display-name/upper-case recipient → ${a.cls} · plus variant → ${b.cls} · BCC recipient → ${c.cls} · DMARC+thread → ${d.cls} · DMARC only → ${e.cls} · P14 unset with a perfect A-R → ${f.cls} (want T U U V D T — exactly one class each)`);
});

await sub("R3B T system bucket — attacker with 10 provable pairs, P14 unset", async () => {
  await clear();
  const att: string[] = [];
  for (let k = 0; k < 10; k += 1) att.push(`lead${k}-${rand}@anything${k}.test`);
  const pairs: string[] = [];
  for (const a of att) pairs.push(await outRow([a])); // e.g. "thank you for your enquiry" sent to each new lead
  let stored = 0;
  for (let k = 0; k < 10; k += 1) for (let i = 0; i < 100; i += 1) if ((await ingest(att[k]!, `t${k}.${i}`, { extra: reply(pairs[k]!) })).handled) stored += 1;
  const tSys = await bucket(sysKeys.T!);
  const g = await ingest(V.email, `Re: ${TAG}`, { extra: reply(pv) }); // genuine customer, P14 unset ⇒ T
  chk("R3B.1", g.handled === true, `10 attacker mailboxes (no DMARC needed) each holding one OUT mail of ours × 100 replies → ${stored}/1000 stored · T system bucket ${tSys} · then the customer's genuine reply to OUR quote → ${g.handled ? "stored" : g.reason} (want stored — base: thread-proven replies had no system bucket)`);
  // R3E count-then-drop (T system full): a forgery in the victim's name with a pair still consumes her sender bucket
  const vb0 = await bucket(senderKeyT(V.email));
  await ingest(V.email, "forged", { extra: reply(pv) });
  const vb1 = await bucket(senderKeyT(V.email));
  chk("INFO-R3E", true, `T system full: victim's T sender bucket ${vb0} → ${vb1} after one more dropped mail in her name (count-then-drop; a pair-holder can lock her T sender bucket — needs her address + one of our ids to her)`);
});

await sub("R3A V system bucket — attacker with 20 provable pairs on its own DMARC domain, P14 set", async () => {
  await clear();
  const eDom = `evil-${rand}.test`;
  const att: string[] = [];
  for (let k = 0; k < 20; k += 1) att.push(`m${k}@${eDom}`);
  const pairs: string[] = [];
  for (const a of att) pairs.push(await outRow([a]));
  let stored = 0;
  for (let k = 0; k < 20; k += 1) for (let i = 0; i < 100; i += 1) if ((await ingest(att[k]!, `v${k}.${i}`, { ar: arPass(eDom), authserv: true, extra: reply(pairs[k]!) })).handled) stored += 1;
  const vSys = await bucket(sysKeys.V!);
  const g = await ingest(V.email, `Re: ${TAG}`, { ar: arPass(cDom), authserv: true, extra: reply(pv) });
  chk("R3A.1", g.handled === true, `20 mailboxes on ONE attacker DMARC domain, each holding one OUT mail of ours × 100 → ${stored}/2000 stored (no V per-domain bucket) · V system bucket ${vSys} · then the customer's DMARC+thread reply → ${g.handled ? "stored" : g.reason} (want stored)`);
});

await sub("R3D normalisation + R3F free-mail list (INFO)", async () => {
  const N = ES.inboundSenderBucketAddr;
  chk("INFO-R3D", true, `+tag: ${N("A.B+x@Gmail.com")} · case: ${N("John@EXAMPLE.test")} · gmail dots: "${N("j.o.h.n@gmail.com")}" vs "${N("john@gmail.com")}" (separate D sender buckets; gmail.com has no D domain bucket) · leading +: ${N("+x@d.test")} · '-' separator: ${N("a-x@yahoo.com")}`);
  const inb = new Set(ES.CRM_INBOUND_FREE_MAIL_DOMAINS as string[]);
  const mod = [...(CS.FREE_MAIL_DOMAINS as Set<string>)];
  chk("INFO-R3F", true, `in FREE_MAIL_DOMAINS (companies-shared) but not in CRM_INBOUND_FREE_MAIL_DOMAINS: ${j(mod.filter((d) => !inb.has(d)))} · reverse: ${j([...inb].filter((d) => !mod.includes(d)))}`);
  await clear();
  const g1 = await ingest("j.o.h.n@gmail.com", "d", { ar: arPass("gmail.com"), authserv: true });
  const g2 = await ingest("john@gmail.com", "d", { ar: arPass("gmail.com"), authserv: true });
  chk("INFO-R3D.2", true, `gmail dot variants → D sender buckets ${await bucket(senderKeyD("j.o.h.n@gmail.com"))} and ${await bucket(senderKeyD("john@gmail.com"))} (separate) · ${g1.handled && g2.handled ? "both stored" : "?"}`);
});

await clear();
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-review-r3");
