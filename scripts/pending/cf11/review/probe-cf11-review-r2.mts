// review probe (round 2) — CRM C5.5-fix8 r2 (1d118384): class assignment of the inbound buckets, adversarial
//   R2A "H3-1 reborn at system level": ONE attacker mailbox on a DMARC-passing domain, 20 plus-address variants × 100 proven mails
//       (only attacker-side steps, P14 set) fills the shared proven system bucket (2,000/h) ⇒ a genuine customer reply that is BOTH
//       DMARC-proven and thread-proven is dropped for the rest of the hour (owner told once)
//   R2B per-sender proven key is the raw From ⇒ plus-address variants of one mailbox are separate buckets
//   R2C narrow proof query: case / display-name forms prove · plus-address and BCC do not (conservative) · >100 refs window · class
//       observed through which bucket key was counted
// Checks assert the SAFE behaviour ⇒ ❌ = finding reproduces · INFO rows always pass
// QC3 ONLY · throwaway tenant `qc-cf11-r2r-*` · network blocked
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/review/probe-cf11-review-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("../_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r2r");
const { P, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r2r.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
const vDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${vDom}` } });
const BCC = `hidden-${rand}@thirdparty.test`;
const pv = `${TAG}-parent@shark.test`;
await P.crmEmailMessage.create({
  data: { tenantId: tid, systemId: S, contactId: V.id, direction: "OUT", messageId: `${S}:${pv}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: [V.email], ccAddrs: [], bccAddrs: [BCC], subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
});
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
const provenSenderKey = (a: string) => `crm.email.in.from.proven.${S}.${sha(`from:${a}`).slice(0, 32)}`;
const senderKey = (a: string) => `crm.email.in.from.${S}.${sha(`from:${a}`).slice(0, 32)}`;
const provenSysKey = `crm.email.in.sys.proven.${S}`;
const sysKey = `crm.email.in.sys.${S}`;
const clear = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
// which class counted this mail: diff of the two system buckets
const classOf = async (fn: () => Promise<Any>) => {
  const [p0, u0] = [await bucket(provenSysKey), await bucket(sysKey)];
  const r = await fn();
  const [p1, u1] = [await bucket(provenSysKey), await bucket(sysKey)];
  return { r, cls: p1 > p0 ? "proven" : u1 > u0 ? "unproven" : "none" };
};

await sub("R2C narrow proof query — address forms and window", async () => {
  await clear();
  const a = await classOf(() => ingest(`"Buyer" <BUYER@${vDom.toUpperCase()}>`, "Re", { extra: { "in-reply-to": `<${pv}>` } }));
  const b = await classOf(() => ingest(`buyer+x@${vDom}`, "Re", { extra: { "in-reply-to": `<${pv}>` } }));
  const c = await classOf(() => ingest(BCC, "Re", { extra: { "in-reply-to": `<${pv}>` } }));
  const junk = Array.from({ length: 150 }, (_, i) => `<j${i}-${rand}@x.test>`).join(" ");
  const d = await classOf(() => ingest(V.email, "Re", { extra: { references: `${junk} <${pv}>` } })); // ours newest (end) ⇒ in window
  const e = await classOf(() => ingest(V.email, "Re", { extra: { "in-reply-to": `<j0-${rand}@x.test>`, references: `<j1-${rand}@x.test> <${pv}> ${junk}` } })); // ours old, beyond window
  chk("R2C.1", a.cls === "proven" && b.cls === "unproven" && c.cls === "unproven" && d.cls === "proven",
    `display-name + upper-case form of the recipient → ${a.cls} · plus-address variant → ${b.cls} (conservative) · BCC recipient → ${c.cls} · our id newest after 150 junk refs → ${d.cls}`);
  chk("INFO-R2C.2", true, `our id 2nd-oldest of 152 refs (In-Reply-To = junk) → ${e.cls} (outside In-Reply-To + newest 99 window; a real client puts our id in In-Reply-To)`);
});

await sub("R2B per-sender proven key = raw From (plus-address variants are separate buckets)", async () => {
  await clear();
  const eDom = `evil-${rand}.test`;
  await P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,100,NOW(),NOW(),NOW())`, provenSenderKey(`x+0@${eDom}`));
  const r0 = await ingest(`x+0@${eDom}`, "s", { ar: arPass(eDom), authserv: true });
  const r1 = await ingest(`x+1@${eDom}`, "s", { ar: arPass(eDom), authserv: true });
  chk("R2B.1", !(r0.reason === "rate_limited" && r1.handled === true), `one mailbox: x+0 (bucket full) → ${r0.reason ?? "stored"} · x+1 → ${r1.handled ? "stored (fresh bucket)" : r1.reason} (want one bound per mailbox/domain)`);
});

await sub("R2A shared proven system bucket — attacker-only fill drops a genuine verified reply", async () => {
  await clear();
  const eDom = `evil2-${rand}.test`;
  const notes0 = await P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid } });
  let stored = 0;
  const t0 = Date.now();
  for (let k = 0; k < 20; k += 1) for (let i = 0; i < 100; i += 1) if ((await ingest(`x+${k}@${eDom}`, `s${k}.${i}`, { ar: arPass(eDom), authserv: true })).handled) stored += 1;
  const fillMs = Date.now() - t0;
  const sysP = await bucket(provenSysKey);
  // genuine customer: replies to OUR mail from the address we wrote to, DMARC passes for her own domain — the strongest evidence we have
  const g = await ingest(V.email, `Re: ใบเสนอราคา ${TAG}`, { ar: arPass(vDom), authserv: true, extra: { "in-reply-to": `<${pv}>` } });
  const gOnlyThread = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} (2)`, { extra: { "in-reply-to": `<${pv}>` } });
  const notes1 = await P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid } });
  const audits = (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket);
  chk("R2A.1", g.handled === true,
    `attacker: 1 mailbox on its own DMARC domain, 20 plus-variants × 100 → ${stored}/2000 stored in ${Math.round(fillMs / 1000)} s · proven system bucket ${sysP} · then the customer's DMARC+thread-proven reply → ${g.handled ? "stored" : g.reason} · thread-only reply → ${gOnlyThread.handled ? "stored" : gOnlyThread.reason} · owner notifications +${notes1 - notes0} · audits ${j(audits)} (want the verified reply stored)`);
  const u = await ingest(`stranger-${rand}@else.test`, "u", {});
  chk("INFO-R2A.2", true, `meanwhile unproven mail (separate class) → ${u.handled ? "stored" : u.reason} — an unproven sender is better off than a genuine verified customer`);
});

await clear();
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-review-r2");
