// probe — CRM C5.5-fix8 round 2 (review RV-1 · RV-2 · RV-3 · RV-5 · P14 fail-closed)
//   R1 (RV-1) nothing body-sized is loaded before the inbound rate buckets: a dropped mail citing 50 big stored mails loads < 1 M chars
//   R2 (RV-2) proven mail has its OWN bounded buckets: thread-proven / CC participant / DMARC-proven attacker address → 100 per hour
//      each, proven system-wide bucket 2000 per hour; forged unproven mail (both unproven buckets full) never blocks proven mail (H3-1);
//      thread proof needs our OUT mail of THIS tenant+system addressed to that exact From
//   R3 (RV-3) owner notice for the per-sender bucket ≤ 1 per system per window (12 tripping senders ⇒ 1 notice, 12 audit lines)
//   R4 (RV-5) account page: rotate AND revoke refuse keys that are not account-managed (unbound / foreign scope); account keys still work
//   R5 P14: CRM_INBOUND_AUTHSERV_ID unset ⇒ an A-R header proves nothing (mail counts in the unproven buckets)
// QC3 ONLY · throwaway tenant `qc-cf11-r2-*` · network blocked · rate buckets of the throwaway systems removed
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/probe-cf11-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r2");
const { P, prisma, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, inScope, sessionCookie, fdx, call, errText, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r2.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const S2 = (await sysSvc.createSystem(tid, "CRM", `CRM2 ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
await setCrm(S2, { uiVersion: 2 });
const vDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${vDom}` } });
const CC = `colleague-${rand}@thirdparty.test`;
const pv = `${TAG}-parent@shark.test`;
const outRow = (systemId: string, messageId: string, to: string[], cc: string[] = []) =>
  P.crmEmailMessage.create({
    data: { tenantId: tid, systemId, direction: "OUT", messageId, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: to, ccAddrs: cc, subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
  });
await outRow(S, `${S}:${pv}`, [V.email], [CC]);
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, o: { ar?: string; authserv?: boolean; extra?: Record<string, string>; html?: string; text?: string; messageId?: string } = {}) => {
  const headers: Record<string, string> = { ...(o.ar ? { "authentication-results": o.ar } : {}), ...(o.extra ?? {}) };
  if (o.authserv) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: o.messageId ?? `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: o.text ?? "สวัสดีค่ะ", html: o.html ?? "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const arPass = (d: string) => `${AUTHSERV}; spf=pass smtp.mailfrom=${d}; dkim=pass header.d=${d}; dmarc=pass header.from=${d}`;
const senderKey = (a: string) => `crm.email.in.from.${S}.${sha(`from:${a}`).slice(0, 32)}`;
const provenSenderKey = (a: string) => `crm.email.in.from.proven.${S}.${sha(`from:${a}`).slice(0, 32)}`;
const sysKey = `crm.email.in.sys.${S}`;
const provenSysKey = `crm.email.in.sys.proven.${S}`;
const setBucket = (key: string, count: number) =>
  P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const clearBuckets = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
const capNotices = () => P.appNotification.count({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } } });
const audits = async () => (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => String(a.after?.bucket));
const countStored = async (k: number, f: (i: number) => Promise<Any>) => {
  let s = 0;
  for (let i = 0; i < k; i += 1) if ((await f(i)).handled) s += 1;
  return s;
};

await sub("R1 (RV-1) no body-sized load before the buckets", async () => {
  await clearBuckets();
  const ids: string[] = [];
  const rows = [];
  for (let i = 0; i < 50; i += 1) {
    const rfc = `${TAG}-big-${i}@spam.test`;
    ids.push(rfc);
    rows.push({ tenantId: tid, systemId: S, direction: "IN", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `att-${rand}@spam.test`, toAddrs: [`crm+${KEY}@shark.in.th`], subject: `big ${i}`, bodyHtml: "h".repeat(200_000), bodyText: "t".repeat(200_000), status: "RECEIVED", receivedAt: new Date(), matchedBy: "NONE", trackTokenHash: randomBytes(16).toString("hex") });
  }
  await P.crmEmailMessage.createMany({ data: rows });
  const del = (prisma as Any).crmEmailMessage;
  const origMany = del.findMany;
  const origFirst = del.findFirst;
  let loaded = 0;
  del.findMany = async (...a: Any[]) => { const r = await origMany.apply(del, a); loaded += JSON.stringify(r ?? null).length; return r; };
  del.findFirst = async (...a: Any[]) => { const r = await origFirst.apply(del, a); loaded += JSON.stringify(r ?? null).length; return r; };
  const fl = `flood-${rand}@spam.test`;
  await setBucket(senderKey(fl), 100);
  await setBucket(sysKey, 1000);
  const refsAll = ids.map((x) => `<${x}>`).join(" ");
  const t0 = Date.now();
  const r50 = await ingest(fl, "x", { extra: { references: refsAll } });
  const ms = Date.now() - t0;
  const dropLoaded = loaded;
  loaded = 0;
  await clearBuckets();
  const acc = await ingest(`calm-${rand}@spam.test`, "x", { extra: { references: `<${ids[0]}>` } });
  const accLoaded = loaded;
  del.findMany = origMany;
  del.findFirst = origFirst;
  chk("R1.1", r50.reason === "rate_limited" && dropLoaded < 1_000_000,
    `dropped unproven mail citing 50 stored mails (200 k + 200 k chars each) → ${r50.reason} · CrmEmailMessage rows loaded before the drop ≈ ${dropLoaded} chars in ${ms} ms (want < 1 M; round 1 loaded ≈ 21.6 M)`);
  chk("R1.2", acc.handled === true && accLoaded >= 400_000 && accLoaded < 1_000_000,
    `control: an accepted mail citing one big row still loads that one parent row after the buckets (threading) → ${acc.handled ? "stored" : acc.reason}, ≈ ${accLoaded} chars`);
});

await sub("R2 (RV-2) proven mail: own bounded buckets · exact-address thread proof", async () => {
  await clearBuckets();
  // unproven buckets full (an unproven flood ran this hour) — forged mail cannot block proven mail (H3-1) …
  await setBucket(senderKey(V.email), 100);
  await setBucket(senderKey(CC), 100);
  await setBucket(sysKey, 1000);
  const a0 = (await audits()).length;
  const tp = await countStored(110, (i) => ingest(V.email, `Re: ใบเสนอราคา ${TAG} #${i}`, { extra: { "in-reply-to": `<${pv}>` } }));
  chk("R2.1", tp === 100 && (await bucket(provenSenderKey(V.email))) === 110 && (await bucket(senderKey(V.email))) === 100 && (await bucket(sysKey)) === 1000,
    `thread-proven replies of the customer with both UNPROVEN buckets full: ${tp}/110 stored (want 100 — first 100 get in despite the forged flood, then the proven per-sender cap) · proven bucket ${await bucket(provenSenderKey(V.email))} · unproven buckets untouched ${await bucket(senderKey(V.email))}/${await bucket(sysKey)}`);
  const cc = await countStored(105, (i) => ingest(CC, `Re: ใบเสนอราคา ${TAG} cc#${i}`, { extra: { "in-reply-to": `<${pv}>` } }));
  chk("R2.2", cc === 100, `CC participant of our mail (not a contact) citing it: ${cc}/105 stored (want 100)`);
  const eDom = `evil-${rand}.test`;
  await setBucket(senderKey(`x@${eDom}`), 100);
  const dm = await countStored(120, (i) => ingest(`x@${eDom}`, `สแปม ${i}`, { ar: arPass(eDom), authserv: true }));
  chk("R2.3", dm === 100, `DMARC-proven attacker-owned address: ${dm}/120 stored (want 100 = the per-address bound before this card)`);
  // exact-address thread proof: a non-recipient citing a valid Message-ID, and an OUT mail of ANOTHER system of the same shop, prove nothing
  const pv2 = `${TAG}-s2@shark.test`;
  await outRow(S2, pv2, [`spoof-${rand}@other.test`]);
  await outRow(S2, `${S2}:${pv2}`, [`spoof-${rand}@other.test`]);
  const out1 = `outsider-${rand}@${vDom}`;
  const spoof = `spoof-${rand}@other.test`;
  await setBucket(senderKey(out1), 100);
  await setBucket(senderKey(spoof), 100);
  const nr = await ingest(out1, "Re: x", { extra: { "in-reply-to": `<${pv}>` } });
  const xs = await ingest(spoof, "Re: y", { extra: { "in-reply-to": `<${pv2}>` } });
  chk("R2.4", nr.reason === "rate_limited" && xs.reason === "rate_limited" && (await bucket(provenSenderKey(out1))) === 0 && (await bucket(provenSenderKey(spoof))) === 0,
    `non-recipient citing our valid Message-ID → ${nr.reason ?? "stored"} · recipient of an OUT mail of ANOTHER CRM system citing it → ${xs.reason ?? "stored"} (both unproven ⇒ dropped by the full unproven buckets; proven buckets untouched)`);
  // proven system-wide bucket (2000/h): full ⇒ proven mail dropped · one audit + one owner notice
  const n0 = await capNotices();
  await setBucket(provenSysKey, 2000);
  const ps1 = await ingest(`fresh-${rand}@${eDom}`, "proven 1", { ar: arPass(eDom), authserv: true });
  const ps2 = await ingest(`fresh2-${rand}@${eDom}`, "proven 2", { ar: arPass(eDom), authserv: true });
  const n1 = await capNotices();
  const aa = (await audits()).slice(a0);
  chk("R2.5", ps1.reason === "rate_limited" && ps2.reason === "rate_limited" && aa.filter((x: string) => x === "system-proven").length === 1 && aa.filter((x: string) => x === "sender-proven").length === 3 && n1 - n0 === 1,
    `proven system bucket full → ${ps1.reason}/${ps2.reason} · audits since R2 start ${j(aa)} (want sender-proven ×3, system-proven ×1) · owner notices +${n1 - n0} (want 1: system-proven; the sender-proven notice was already sent this window)`);
  // control: the unproven system bucket notice text is unchanged
  await clearBuckets();
});

await sub("R3 (RV-3) per-sender owner notice deduped per system", async () => {
  await clearBuckets();
  await P.appNotification.deleteMany({ where: { tenantId: tid } });
  await P.auditLog.deleteMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" } });
  await setBucket(sysKey, 1000);
  for (let i = 0; i < 12; i += 1) {
    const a = `forged${i}-${rand}@random${i}.test`;
    await setBucket(senderKey(a), 100);
    await ingest(a, "x", {});
  }
  const notes = await capNotices();
  const au = await audits();
  chk("R3.1", notes === 1 && au.filter((x: string) => x === "sender").length === 12,
    `12 forged senders each tripping their unproven bucket → owner notices ${notes} (want 1) · sender audit lines ${au.filter((x: string) => x === "sender").length} (want 12)`);
  const fl = `again-${rand}@spam.test`;
  await setBucket(senderKey(fl), 100);
  await ingest(fl, "x", {});
  chk("R3.2", (await capNotices()) === 1, `same window: a 13th tripping sender → notices ${await capNotices()} (want still 1)`);
  await P.chatRateBucket.deleteMany({ where: { key: { startsWith: "crm.email.in.notice." , contains: S } } });
  await setBucket(senderKey(`late-${rand}@spam.test`), 100);
  await ingest(`late-${rand}@spam.test`, "x", {});
  chk("R3.3", (await capNotices()) === 2, `next window (notice bucket expired/cleared) → a new tripping sender notifies again → ${await capNotices()} (want 2)`);
  await clearBuckets();
});

await sub("R4 (RV-5) account page rotate/revoke only account-managed keys", async () => {
  const KS = (await import("@/lib/api-keys/service" as string)) as Any;
  const ownerCookie = await sessionCookie(uid, tid);
  const A = (await sysSvc.createSystem(tid, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  await accSvc.saveSettings(tid, A, { orgName: `QC ${TAG}`, taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  const CONN = (await import("@/lib/modules/account/connections-actions" as string)) as Any;
  const cp = `/app/sys/${A}/account/settings/connections`;
  const mk = async (name: string, scopes: string[], systemId: string | null) => {
    const id = (await KS.createApiKey({ tenantId: tid }, `${TAG}-r4-${name}`, { scopes: ["account.doc.view"], systemId, expiresAt: new Date(Date.now() + 86_400_000), createdById: uid })).id as string;
    await P.$executeRawUnsafe(`UPDATE "ApiKey" SET "scopesJson" = $1::jsonb WHERE "id" = $2`, JSON.stringify(scopes), id);
    return id;
  };
  const refused: string[] = [];
  let bad = 0;
  for (const [name, scopes, sys] of [["pos-unbound", ["account.doc.view", "pos.sale.create"], null], ["general", [], null], ["acc-unbound", ["account.doc.view"], null], ["crm-on-account", ["account.doc.view", "crm.contact.read"], A]] as [string, string[], string | null][]) {
    const id = await mk(name, scopes, sys);
    const rv = await call(() => inScope(ownerCookie, cp, () => CONN.revokeApiKeyAction(fdx({ systemId: A, id }))));
    const rr = await call(() => inScope(ownerCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id }))));
    const row = (await P.apiKey.findUnique({ where: { id }, select: { revokedAt: true } })) as Any;
    const kids = await P.apiKey.count({ where: { rotatedFromId: id } });
    const ok = rv.v?.ok === false && rr.v?.ok === false && String(rv.v?.reason).startsWith("ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี") && !row?.revokedAt && kids === 0;
    if (!ok) bad += 1;
    refused.push(`${name}:${ok ? "not here" : `revoke ${errText(rv)} · rotate ${errText(rr)} · revoked=${!!row?.revokedAt} kids=${kids}`}`);
  }
  chk("R4.1", bad === 0, `account page revoke + rotate of non-account-managed keys → ${refused.join(" · ")}`);
  const good = await mk("acc-bound", ["account.doc.view"], A);
  const legacy = await mk("acc-empty", [], A);
  const rr = await call(() => inScope(ownerCookie, cp, () => CONN.rotateApiKeyAction(fdx({ systemId: A, id: good }))));
  const lr = await call(() => inScope(ownerCookie, cp, () => CONN.revokeApiKeyAction(fdx({ systemId: A, id: legacy }))));
  const gRow = (await P.apiKey.findUnique({ where: { id: good }, select: { revokedAt: true } })) as Any;
  const lRow = (await P.apiKey.findUnique({ where: { id: legacy }, select: { revokedAt: true } })) as Any;
  chk("R4.2", rr.v?.ok === true && !!gRow?.revokedAt && lr.v?.ok === true && !!lRow?.revokedAt,
    `positive: account-bound account key rotates → ${rr.v?.ok ? "ok" : errText(rr)} · account-bound legacy [] key can still be revoked here → ${lr.v?.ok ? "ok" : errText(lr)}`);
});

await sub("R5 P14 fail-closed", async () => {
  await clearBuckets();
  const d = `p14-${rand}.test`;
  const r = await ingest(`a@${d}`, "unset", { ar: arPass(d), authserv: false });
  const row = (await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { routing: true } })) as Any;
  chk("R5.1", r.handled === true && row?.routing?.unverifiedFrom === true && (await bucket(senderKey(`a@${d}`))) === 1 && (await bucket(provenSenderKey(`a@${d}`))) === 0,
    `CRM_INBOUND_AUTHSERV_ID unset + a perfect-looking A-R header → flagged=${row?.routing?.unverifiedFrom} · unproven sender bucket ${await bucket(senderKey(`a@${d}`))} · proven bucket ${await bucket(provenSenderKey(`a@${d}`))} (want true · 1 · 0)`);
  await clearBuckets();
});

await clearBuckets().catch(() => undefined);
await P.chatRateBucket.deleteMany({ where: { key: { contains: S2 } } }).catch(() => undefined);
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { OR: [{ key: { contains: S } }, { key: { contains: S2 } }] } })) === 0, "rate buckets of the throwaway systems removed");
await done("probe-cf11-r2");
