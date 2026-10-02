// review probe (round 4) — CRM C5.5-fix8 r4 (3495091e): light-sender lane for V/T, adversarial
//   R4A minting light senders without a pair: case / `+tag` / Gmail-dot variants of a proven address → which class and which sender key
//   R4B lane atomicity: 30 concurrent thread-only mails from ONE provable sender with T's system bucket full ⇒ exactly 10 stored
//   R4C audit dedupe: a light sender reaches count = limit + 1 of the system bucket (not dropped, no audit); the first REAL drop is audited
//       once; later drops in the window are not re-audited (one line per window, as for every other bucket)
//   R4D one reply-all OUT mail with 40 visible CC addresses = 40 pairs: T per-Message-ID bucket caps all of them at 100/h (P14 unset)
//   R4E (INFO) V light senders on a free-mail domain (no V domain bucket): bound = system cap + 10·k
// Checks assert the SAFE behaviour ⇒ ❌ = finding reproduces · INFO rows always pass
// QC3 ONLY · throwaway tenant `qc-cf11-r4r-*` · network blocked
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/review/probe-cf11-review-r4.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("../_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r4r");
const { P, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r4r.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const ES = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
let outN = 0;
const outRow = async (to: string[], cc: string[] = []) => {
  const rfc = `${TAG}-out-${++outN}@shark.test`;
  await P.crmEmailMessage.create({
    data: { tenantId: tid, systemId: S, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: to, ccAddrs: cc, subject: `x ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
  });
  return rfc;
};
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, o: { dmarcDomain?: string; extra?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { ...(o.dmarcDomain ? { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${o.dmarcDomain}; dkim=pass header.d=${o.dmarcDomain}; dmarc=pass header.from=${o.dmarcDomain}` } : {}), ...(o.extra ?? {}) };
  if (o.dmarcDomain) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: "x", html: "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const setBucket = (key: string, count: number) =>
  P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
const sKey = (c: string, a: string) => (c === "u" ? `crm.email.in.from.${S}.` : `crm.email.in.from.${c}.${S}.`) + sha(`from:${ES.inboundSenderBucketAddr(a)}`).slice(0, 32);
const sysKey = (c: string) => (c === "u" ? `crm.email.in.sys.${S}` : `crm.email.in.sys.${c}.${S}`);
const clear = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
const reply = (rfc: string) => ({ "in-reply-to": `<${rfc}>` });
const audits = async () => (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket);

await sub("R4A minting light senders without a pair", async () => {
  await clear();
  const me = `real-${rand}@gmail.com`;
  const pv = await outRow([me]);
  await setBucket(sysKey("t"), 1000);
  await setBucket(sysKey("u"), 1000);
  const forms = [`Real-${rand}@GMAIL.com`, `real-${rand}+x@gmail.com`, `r.e.a.l-${rand}@gmail.com`, `real-${rand}@googlemail.com`];
  const out: string[] = [];
  let lightOutsidePair = 0;
  for (const f of forms) {
    const tb = await bucket(sKey("t", f));
    const r = await ingest(f, "v", { extra: reply(pv) });
    const ta = await bucket(sKey("t", f));
    const cls = ta > tb ? "T" : "U";
    if (cls === "T" && r.handled && ES.inboundSenderBucketAddr(f) !== ES.inboundSenderBucketAddr(me)) lightOutsidePair += 1;
    out.push(`${f} → class ${cls} key=${ES.inboundSenderBucketAddr(f) === ES.inboundSenderBucketAddr(me) ? "same as pair" : "own"} ${r.handled ? "stored" : r.reason}`);
  }
  chk("R4A.1", lightOutsidePair === 0, `variants of a proven Gmail address, T+U system buckets full: ${out.join(" · ")} (want: no variant becomes a NEW light sender)`);
});

await sub("R4B lane atomic under concurrency", async () => {
  await clear();
  const a = `conc-${rand}@any.test`;
  const pv = await outRow([a]);
  await setBucket(sysKey("t"), 1000);
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => ingest(a, `c${i}`, { extra: reply(pv) })));
  const stored = rs.filter((r: Any) => r.handled).length;
  chk("R4B.1", stored === 10, `30 concurrent thread-only mails from one provable sender, T system full → ${stored} stored (want exactly 10) · sender bucket ${await bucket(sKey("t", a))}`);
});

await sub("R4C audit on first REAL drop of the system bucket", async () => {
  await clear();
  const light = `light-${rand}@any.test`;
  const heavy = `heavy-${rand}@any.test`;
  const pl = await outRow([light]);
  const ph = await outRow([heavy]);
  await setBucket(sysKey("t"), 1000);
  const a0 = (await audits()).filter((b: string) => b === "system-t").length;
  const l = await ingest(light, "l", { extra: reply(pl) }); // system count 1001 = limit + 1, light ⇒ not dropped
  const a1 = (await audits()).filter((b: string) => b === "system-t").length;
  await setBucket(sKey("t", heavy), 10);
  const h1 = await ingest(heavy, "h1", { extra: reply(ph) });
  const h2 = await ingest(heavy, "h2", { extra: reply(ph) });
  const a2 = (await audits()).filter((b: string) => b === "system-t").length;
  chk("R4C.1", l.handled === true && a1 === a0 && h1.reason === "rate_limited" && h2.reason === "rate_limited" && a2 - a0 === 1,
    `light sender at system count limit+1 → ${l.handled ? "stored" : l.reason}, audits +${a1 - a0} · heavy sender's 11th/12th → ${h1.reason}/${h2.reason}, system-t audits +${a2 - a0} (want stored, +0, dropped ×2, +1)`);
});

await sub("R4D one reply-all OUT mail with 40 visible CC = 40 pairs (P14 unset)", async () => {
  await clear();
  const cc = Array.from({ length: 40 }, (_, i) => `cc${i}-${rand}@any${i % 5}.test`);
  const pv = await outRow([`buyer-${rand}@client.test`], cc);
  let stored = 0;
  for (const a of cc) for (let i = 0; i < 4; i += 1) if ((await ingest(a, `r${i}`, { extra: reply(pv) })).handled) stored += 1;
  chk("R4D.1", stored <= 100, `40 CC addresses × 4 replies citing ONE OUT mail → ${stored}/160 stored (T per-Message-ID bucket ${await bucket(`crm.email.in.msg.t.${S}.${sha(`msg:${S}:${pv}`).slice(0, 32)}`)}) (want ≤ 100)`);
  const g = await ingest(`buyer-${rand}@client.test`, "genuine", { extra: reply(pv) });
  chk("INFO-R4D.2", true, `the customer's own reply to THAT mail afterwards → ${g.handled ? "stored" : g.reason} (residual: per-Message-ID bucket exhausted by co-recipients — stated by the builder)`);
});

await sub("R4E V light senders on a free-mail domain (INFO)", async () => {
  await clear();
  await setBucket(sysKey("v"), 2000);
  const k = 5;
  let stored = 0;
  for (let m = 0; m < k; m += 1) {
    const a = `acct${m}-${rand}@gmail.com`;
    const pv = await outRow([a]);
    for (let i = 0; i < 12; i += 1) if ((await ingest(a, `g${m}.${i}`, { dmarcDomain: "gmail.com", extra: reply(pv) })).handled) stored += 1;
  }
  chk("INFO-R4E", true, `V system full · ${k} Gmail mailboxes each with one OUT mail × 12 → ${stored} stored (bound 10·k = ${10 * k}; no V domain bucket on free mail)`);
});

await clear();
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-review-r4");
