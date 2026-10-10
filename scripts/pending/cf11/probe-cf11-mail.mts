// probe — CRM C5.5-fix8 item 6 (fix3b review round 2 · R2-1): inbound mail whose sender is NOT proven must carry the
//   "sender not verified" flag even when it matches no contact/company at ingest — so a later "attach to contact" shows the badge on
//   the thread, the inbox list, the activity block and the contact/company 360 timelines (all read `routing` via emailRoutingUnverified)
//   M1 RED shape: forged mail from an unknown address → stored routing has no unverifiedFrom → attached → 360 row unflagged
//   M2 positive control: unknown sender WITH proof (our MTA's Authentication-Results dmarc=pass header.from) → no flag before/after attach
//   M3 matched-mail behaviour byte-identical: routing JSON + crm.email.received outbox payload of contact-matched / domain-matched mail,
//      with and without proof, exactly as fix2 wrote them · unmatched-mail outbox payload unchanged (no contact id, no flag)
// QC3 ONLY · throwaway tenant `qc-cf11-m-*` · network blocked · env CRM_INBOUND_AUTHSERV_ID set only inside the proven-mail calls
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf11/probe-cf11-mail.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("m");
const { P, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
await P.crmPipeline.create({
  data: {
    tenantId: tid,
    systemId: S,
    name: `ขาย ${TAG}`,
    isDefault: true,
    stages: { create: ([["ใหม่", "OPEN", 10], ["ชนะ", "WON", 100], ["แพ้", "LOST", 0]] as const).map(([name, kind, probability], i) => ({ tenantId: tid, systemId: S, sortOrder: i, name, kind, probability })) },
  },
});
const owner = { userId: uid, role: "OWNER", unitAccess: ["*"], permissions: {} };
const cx = { tenantId: tid, systemId: S, actorUserId: uid };
const dom = `cust-${rand}.test`;
const party = await P.party.create({ data: { tenantId: tid, name: `Co ${TAG}`, kind: "COMPANY" } });
const co = await P.crmCompany.create({ data: { tenantId: tid, systemId: S, partyId: party.id, name: `Co ${TAG}`, ownerUserId: uid, emailDomain: dom } });
const kParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const K = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: kParty.id, ownerUserId: uid, email: `buyer@${dom}`, companyId: co.id } });
await P.crmCompanyContact.create({ data: { tenantId: tid, companyId: co.id, contactId: K.id, isPrimary: true } });

const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const ACT = (await import("@/lib/modules/crm/activities" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const COS = (await import("@/lib/modules/crm/companies" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, proof: boolean, extra: Record<string, string> = {}, messageId?: string) => {
  const fromDom = from.replace(/^.*@/, "");
  const headers = { ...(proof ? { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${fromDom}; dkim=pass header.d=${fromDom}; dmarc=pass header.from=${fromDom}` } : {}), ...extra };
  if (proof) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  try {
    const r = await EM.ingestInbound({ messageId: messageId ?? `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: "โอนเข้าบัญชีใหม่นะคะ", html: "<p>x</p>", headers, attachments: [] }, deps);
    return r;
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
// jsonb stores keys in its own order ⇒ compare payloads with sorted keys
const canon = (v: Any): string => (v && typeof v === "object" && !Array.isArray(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v));
const rowOf = (id: string) => P.crmEmailMessage.findUnique({ where: { id }, select: { contactId: true, companyId: true, routing: true, direction: true, threadKey: true, matchedBy: true } });
const evtOf = async (id: string) => ((await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "crm.email.received", idempotencyKey: `crm.email.received#${id}#${id}` }, select: { payload: true } })) as Any)?.payload ?? null;

await sub("M1/M2 unmatched mail — flag at ingest, survives attach", async () => {
  const forged = await ingest(`nobody-${rand}@elsewhere.test`, `ปลอม ${TAG}`, false);
  const proven = await ingest(`real-${rand}@elsewhere2.test`, `จริง ${TAG}`, true);
  const fRow = (await rowOf(forged.emailId)) as Any;
  const pRow = (await rowOf(proven.emailId)) as Any;
  chk("M1.0", forged.handled === true && proven.handled === true && fRow?.contactId === null && fRow?.companyId === null && pRow?.contactId === null && fRow?.direction === "IN",
    `premise: both stored unmatched IN (forged ${j({ handled: forged.handled, contactId: fRow?.contactId, companyId: fRow?.companyId })} · proven ${j({ handled: proven.handled, contactId: pRow?.contactId })})`);
  chk("M1.1", fRow?.routing?.unverifiedFrom === true, `forged unmatched mail stored routing=${j(fRow?.routing)} (want unverifiedFrom: true)`);
  chk("M2.1", pRow?.routing == null || pRow?.routing?.unverifiedFrom === undefined, `positive: proven unmatched mail routing=${j(pRow?.routing)} (want no flag)`);
  // inbox (unmatched list) + thread view, before attaching
  const inbox = await EM.listThreads(cx, owner, { unmatched: true });
  const it = (tk: string) => (inbox.items as Any[]).find((x) => x.threadKey === tk);
  const th = await EM.getThread(cx, owner, fRow.threadKey);
  const thP = await EM.getThread(cx, owner, pRow.threadKey);
  chk("M1.2", it(fRow.threadKey)?.unverifiedFrom === true && (th.messages as Any[])[0]?.unverifiedFrom === true,
    `forged: unmatched inbox item flag=${it(fRow.threadKey)?.unverifiedFrom} · thread view flag=${(th.messages as Any[])[0]?.unverifiedFrom} (want true, true)`);
  chk("M2.2", it(pRow.threadKey)?.unverifiedFrom === false && (thP.messages as Any[])[0]?.unverifiedFrom === false,
    `positive: proven inbox flag=${it(pRow.threadKey)?.unverifiedFrom} · thread flag=${(thP.messages as Any[])[0]?.unverifiedFrom} (want false, false)`);
  // attach both to K later (manual) → EMAIL/IN activity on K (+ company roll-up)
  await EM.attachToContact(cx, owner, forged.emailId, K.id);
  await EM.attachToContact(cx, owner, proven.emailId, K.id);
  const fAct = (await P.crmActivity.findFirst({ where: { sourceRef: forged.emailId, source: "EMAIL", contactId: K.id } })) as Any;
  const pAct = (await P.crmActivity.findFirst({ where: { sourceRef: proven.emailId, source: "EMAIL", contactId: K.id } })) as Any;
  const c360 = await CON.getContact360(cx, owner, K.id);
  const ct = (id: string | undefined) => (c360.timeline as Any[]).find((x) => x.id === id);
  const m360 = await COS.getCompany360(cx, owner, co.id);
  const mt = (id: string | undefined) => (m360.timeline as Any[]).find((x) => x.id === id);
  const list = await ACT.listActivities(cx, owner, { contactId: K.id, pageSize: 50 });
  const lt = (id: string | undefined) => (list.items as Any[]).find((x) => x.id === id);
  const th2 = await EM.getThread(cx, owner, fRow.threadKey);
  const kInbox = await EM.listThreads(cx, owner, { contactId: K.id });
  const kt = (kInbox.items as Any[]).find((x) => x.threadKey === fRow.threadKey);
  chk("M1.3", !!fAct && ct(fAct.id)?.unverifiedFrom === true && mt(fAct.id)?.unverifiedFrom === true && lt(fAct.id)?.unverifiedFrom === true && (th2.messages as Any[])[0]?.unverifiedFrom === true && kt?.unverifiedFrom === true,
    `forged after attach: activity=${!!fAct} · contact 360=${ct(fAct?.id)?.unverifiedFrom} · company 360=${mt(fAct?.id)?.unverifiedFrom} · activity block=${lt(fAct?.id)?.unverifiedFrom} · thread=${(th2.messages as Any[])[0]?.unverifiedFrom} · contact inbox=${kt?.unverifiedFrom} (want all true)`);
  chk("M2.3", !!pAct && !!ct(pAct.id) && ct(pAct.id).unverifiedFrom === undefined && !!mt(pAct.id) && mt(pAct.id).unverifiedFrom === undefined && !!lt(pAct.id) && lt(pAct.id).unverifiedFrom === undefined,
    `positive: proven after attach: contact 360=${ct(pAct?.id)?.unverifiedFrom} · company 360=${mt(pAct?.id)?.unverifiedFrom} · activity block=${lt(pAct?.id)?.unverifiedFrom} (want undefined ×3)`);
  // the outbox event of unmatched mail is unchanged by this card: no contact/company, no flag (fix2 anonymity)
  const fEv = await evtOf(forged.emailId);
  const pEv = await evtOf(proven.emailId);
  chk("M3.4", canon(fEv) === canon({ emailId: forged.emailId, threadKey: fRow.threadKey }) && canon(pEv) === canon({ emailId: proven.emailId, threadKey: pRow.threadKey }),
    `unmatched crm.email.received payloads byte-identical to fix2: forged=${j(fEv)} · proven=${j(pEv)}`);
});

await sub("M3 matched mail — routing + event byte-identical to fix2", async () => {
  const mC = await ingest(K.email, `ตรงผู้ติดต่อ ${TAG}`, false);
  const mCp = await ingest(K.email, `ตรงผู้ติดต่อ จริง ${TAG}`, true);
  const mD = await ingest(`ceo@${dom}`, `ตรงโดเมน ${TAG}`, false);
  const mDp = await ingest(`ceo@${dom}`, `ตรงโดเมน จริง ${TAG}`, true);
  const r = async (x: Any) => (await rowOf(x.emailId)) as Any;
  const [c, cp, d, dp] = [await r(mC), await r(mCp), await r(mD), await r(mDp)];
  chk("M3.1", c?.contactId === K.id && j(c?.routing) === j({ unverifiedFrom: true }) && cp?.contactId === K.id && cp?.routing === null,
    `contact-matched: no proof routing=${j(c?.routing)} (want {"unverifiedFrom":true}) · proven routing=${j(cp?.routing)} (want null)`);
  chk("M3.2", d?.contactId === null && d?.companyId === co.id && j(d?.routing) === j({ unverifiedFrom: true }) && dp?.companyId === co.id && dp?.routing === null,
    `domain-matched: no proof routing=${j(d?.routing)} (want {"unverifiedFrom":true}) · proven routing=${j(dp?.routing)} (want null)`);
  const [ec, ecp, ed, edp] = [await evtOf(mC.emailId), await evtOf(mCp.emailId), await evtOf(mD.emailId), await evtOf(mDp.emailId)];
  chk("M3.3",
    canon(ec) === canon({ emailId: mC.emailId, threadKey: c.threadKey, unverifiedFrom: true }) &&
      canon(ecp) === canon({ emailId: mCp.emailId, contactId: K.id, companyId: co.id, threadKey: cp.threadKey }) &&
      canon(ed) === canon({ emailId: mD.emailId, threadKey: d.threadKey, unverifiedFrom: true }) &&
      canon(edp) === canon({ emailId: mDp.emailId, companyId: co.id, threadKey: dp.threadKey }),
    `crm.email.received payloads: contact/no proof=${j(ec)} · contact/proof=${j(ecp)} · domain/no proof=${j(ed)} · domain/proof=${j(edp)}`);
});

// ═══ H (closing hunt H3-1, copied from scripts/pending/hunt3/probe-hunt3.mts S1.2/S1.3/S1.6 + controls) ═══
await sub("H per-sender bucket vs proven mail (H3-1)", async () => {
  const vDom = `bigclient-${rand}.test`;
  const vParty = await P.party.create({ data: { tenantId: tid, name: `เหยื่อ ${TAG}`, kind: "PERSON" } });
  const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `เหยื่อ ${TAG}`, firstName: "เหยื่อ", partyId: vParty.id, ownerUserId: uid, email: `buyer@${vDom}` } });
  const mkParent = async (k: number) => {
    const rfc = `${TAG}-parent-${k}@shark.test`;
    await P.crmEmailMessage.create({
      data: { tenantId: tid, systemId: S, contactId: V.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: [V.email], subject: `ใบเสนอราคา ${TAG} ${k}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
    });
    return rfc;
  };
  const pv = await mkParent(1);
  const pv2 = await mkParent(2);
  const r0 = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} 1`, false, { "in-reply-to": `<${pv}>` });
  chk("H.0", r0.handled === true, `control: victim's thread-proven reply before any flood → ${j(r0)}`);
  let stored = 0;
  for (let i = 0; i < 99; i += 1) if ((await ingest(V.email, `ด่วน เปลี่ยนเลขบัญชี ${i}`, false)).handled) stored += 1;
  chk("H.1", stored === 99, `control: 99 forged mails in the victim's name stored (flagged) → ${stored}`);
  const r1 = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} 1`, false, { "in-reply-to": `<${pv}>` });
  chk("S1.2", r1.handled === true, `after 99 forged mails, the victim's thread-proven reply is stored → ${j(r1)}`);
  const r2 = await ingest(V.email, "ยืนยันตัวตน", true);
  chk("S1.3", r2.handled === true, `after the flood, a DMARC-proven mail from the victim is stored → ${j(r2)}`);
  const victimReplies = await P.crmEmailMessage.count({ where: { systemId: S, contactId: V.id, direction: "IN", subject: { startsWith: "Re:" } } });
  chk("S1.6", victimReplies === 2, `both genuine victim replies stored as rows → ${victimReplies}`);
  // control: the unproven flood from that forged sender is still limited (100/h) — 100th stored, 101st dropped · one audit · owner told once, no address
  const f100 = await ingest(V.email, "ด่วน 100", false);
  const f101 = await ingest(V.email, "ด่วน 101", false);
  const f102 = await ingest(V.email, "ด่วน 102", false);
  const audits = (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket);
  const notes = await P.appNotification.findMany({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } }, select: { body: true } });
  chk("H.2", f100.handled === true && f101.handled === false && f101.reason === "rate_limited" && f102.reason === "rate_limited" && j(audits) === j(["sender"]) && notes.length === 1 && !notes[0].body.includes("@"),
    `control: forged #100 → ${f100.handled ? "stored" : f100.reason} · #101 → ${f101.reason} · #102 → ${f102.reason} · audits=${j(audits)} · owner notices=${notes.length} (no address: ${!notes[0]?.body?.includes("@")})`);
  // proven mail still gets in with the sender bucket full · proof via an OLDER referenced OUT mail when the newest reference is the customer's own IN mail
  const own = await ingest(V.email, "ข้อความของลูกค้าเอง", true, {}, `<${TAG}-own@client.test>`);
  const r3 = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} 2`, false, { "in-reply-to": `<${TAG}-own@client.test>`, references: `<${pv2}> <${TAG}-own@client.test>` });
  const pv2Row = (await P.crmEmailMessage.findFirst({ where: { systemId: S, messageId: `${S}:${pv2}` }, select: { repliedAt: true } })) as Any;
  chk("H.3", own.handled === true && r3.handled === true && !pv2Row?.repliedAt,
    `sender bucket full: reply citing our older OUT mail + the customer's own newer mail → ${r3.handled ? "stored" : r3.reason} (anyThreadProof) · reply effects still tied to the newest reference (OUT repliedAt untouched: ${!pv2Row?.repliedAt})`);
  // system-wide limit unchanged: bucket full ⇒ unproven new sender dropped; a thread-proven reply is stored and does not consume it; one system audit + notice
  const sysKey = `crm.email.in.sys.${S}`;
  await P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, sysKey, 1000);
  const s1 = await ingest(`new-${rand}@spam.test`, "สแปม", false);
  const before = Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, sysKey)) as Any[])[0]?.count ?? 0);
  const s2 = await ingest(V.email, `Re: ใบเสนอราคา ${TAG} 1 อีกครั้ง`, false, { "in-reply-to": `<${pv}>` });
  const after = Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, sysKey)) as Any[])[0]?.count ?? 0);
  const audits2 = (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket).sort();
  const notes2 = await P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } } });
  chk("H.4", s1.handled === false && s1.reason === "rate_limited" && s2.handled === true && before === after && j(audits2) === j(["sender", "system"]) && notes2 === 2,
    `control: system bucket full → unproven new sender ${s1.reason ?? "stored"} · thread-proven reply ${s2.handled ? "stored" : s2.reason} (bucket ${before}→${after}) · audits=${j(audits2)} notices=${notes2}`);
  // R2-1 flagging unchanged by the reorder: forged mails stored during the flood carry the flag
  const flagged = await P.crmEmailMessage.count({ where: { systemId: S, contactId: V.id, subject: { startsWith: "ด่วน" }, routing: { path: ["unverifiedFrom"], equals: true } } });
  chk("H.5", flagged === 100, `the 100 stored forged mails are flagged unverifiedFrom → ${flagged}`);
  await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
});

await sub("INFO staff-claim mail (unverifiedShopFrom)", async () => {
  const me = (await P.user.findUnique({ where: { id: uid }, select: { email: true } })) as Any;
  const s = await ingest(me.email, `อ้างพนักงาน ${TAG}`, false);
  const row = (await rowOf(s.emailId)) as Any;
  chk("INFO-shop", true, `From = a staff address, no proof → direction ${row?.direction} routing=${j(row?.routing)} (fix2: {"unverifiedShopFrom":true}; this card adds unverifiedFrom on unmatched mail — the reader ORs both, badge unchanged)`);
});

await P.chatRateBucket.deleteMany({ where: { key: { contains: S } } }).catch(() => undefined);
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-mail");
