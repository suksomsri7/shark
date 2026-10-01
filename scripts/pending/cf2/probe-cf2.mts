// C5.5-fix2 probe — hunter 2a findings (portal + inbound mail) that are not the sanitizer:
//   A  wildcard-safe case-insensitive equality (2a-6 portal takeover · 2a-5 staff From · every `equals … mode insensitive` site outside account/**)
//   B  2a-1 copy-to-CRM mail loop (copy targets inside SHARK refused · copy carries Auto-Submitted + loop marker · loop marker dropped)
//   C  2a-2 forged customer From (unverified flag · no scoring / no customer attribution on the event · reply effects need proof)
//   D  2a-7 inbound rate cap per system + per sender · 2a-8 re-invite revokes the access's live sessions
//   E  it4 F1 `/companies` gated by crm.company.read (page + tab + drawer) · F2 aria-current on deal stage tabs
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf2/probe-cf2.mts
// requires: QC3 env (SESSION_SECRET ≥ 32) · throwaway tenant `qc-cf2-<rand>` · network = stub · CLEAN at the end (0 rows left)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
process.env.QC_OTP_PREVIEW = "1";
const SENT: Any[] = [];
globalThis.fetch = (async (url: Any, init: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  let body: Any = {};
  try { body = JSON.parse(String(init?.body ?? "{}")); } catch { /* */ }
  SENT.push(body);
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf2-${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const settle = async (p: Promise<Any>): Promise<{ ok: true; v: Any } | { ok: false; err: string }> => p.then((v: Any) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, err: e instanceof Error ? `${e.name}:${e.message}` : String(e) }));
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;
const AUTHSERV = "mx.qc-cf2.test";
let T = "";
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  const ES = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
  const CI = (await import("@/lib/core/ci-equals" as string).catch(() => null)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const OB = P.outboxEvent; const OB_FIND = OB.findMany;
  OB.findMany = (a: Any) => OB_FIND.call(OB, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const staffU = await P.user.create({ data: { email: `sta.ff-${rand}@qc.invalid`, name: `พนักงาน ${TAG}` } });
  USERS.push(staffU.id);
  await P.membership.create({ data: { userId: staffU.id, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  const setCrm = async (crm: Record<string, unknown>) =>
    P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crm), S);
  const EMAIL_SETTINGS = { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null };
  await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] } });
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

  // ════════ A0 · the helper itself (Prisma emits ILIKE for equals+insensitive: escape \ % _ ; legit match intact) ════════
  const victim = await mkContact("เหยื่อ", `vic.tim-${rand}@qc.invalid`);
  const pctRow = await mkContact("ตัวอักษรพิเศษ", `50%_off\\x-${rand}@qc.invalid`);
  const thaiRow = await mkContact("ไทย", `ทดสอบ.ไทย-${rand}@qc.invalid`);
  await sub("A0", async () => {
    const raw = async (x: string) => (await P.crmContact.findMany({ where: { systemId: S, email: { equals: x, mode: "insensitive" } }, select: { id: true } })).map((r: Any) => r.id);
    const safe = async (x: string) => (CI ? (await P.crmContact.findMany({ where: { systemId: S, email: CI.ciEquals(x) }, select: { id: true } })).map((r: Any) => r.id) : ["helper-missing"]);
    const look = `vic_tim-${rand}@qc.invalid`;
    const rawU = await raw(look);
    const rawP = await raw("%@qc.invalid");
    const sU = await safe(look);
    const sP = await safe("%@qc.invalid");
    const sBs = await safe(`50%_off\\y-${rand}@qc.invalid`);
    const sExact = await safe(`VIC.TIM-${rand}@QC.INVALID`);
    const sLit = await safe(`50%_OFF\\X-${rand}@qc.invalid`);
    const sThai = await safe(`ทดสอบ.ไทย-${rand}@QC.invalid`);
    const sThaiLook = await safe(`ทดสอบ_ไทย-${rand}@qc.invalid`);
    chk("A0.1", "premise (positive control): raw `{ equals, mode: insensitive }` is ILIKE with live wildcards — `_` look-alike and `%@domain` match the victim",
      rawU.includes(victim.id) && rawP.length >= 3, `rawUnderscore=${rawU.includes(victim.id)} rawPercent=${rawP.length}`);
    chk("A0.2", "ciEquals(): `_` look-alike ⇒ 0 · `%@domain` ⇒ 0 · `\\` treated literally (a\\y ≠ a\\x) · exact address in other case ⇒ the victim · literal `%_\\` address in other case ⇒ itself · Thai local part (case-folded domain) ⇒ itself, Thai `_` look-alike ⇒ 0",
      !!CI && sU.length === 0 && sP.length === 0 && sBs.length === 0 && j(sExact) === j([victim.id]) && j(sLit) === j([pctRow.id]) && j(sThai) === j([thaiRow.id]) && sThaiLook.length === 0,
      `helper=${!!CI} u=${sU.length} p=${sP.length} bs=${sBs.length} exact=${j(sExact) === j([victim.id])} literal=${j(sLit) === j([pctRow.id])} thai=${j(sThai) === j([thaiRow.id])} thaiLook=${sThaiLook.length}`);
  });

  // ════════ A1/A2 · portal takeover path (OTP + LINE) ════════
  const company = await mkCompany(`บริษัทลูกค้า ${TAG}`);
  await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: victim.id, isPrimary: true, startedAt: new Date(Date.now() - 600_000) } });
  const access = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: company.id, contactId: victim.id, role: "APPROVE", loginMethods: [], invitedAt: new Date(Date.now() - 300_000), acceptedAt: new Date(Date.now() - 300_000), invitedById: u.id } });
  const otpLogin = async (email: string, ip: string) => {
    const r = await settle(CRM.portal.requestOtp(TAG, { email }, { ip }));
    if (!r.ok) return { stage: "request", err: r.err };
    const v = await settle(CRM.portal.verifyOtp({ otpId: r.v.otpId, code: r.v.devOtp }, { ip, userAgent: "probe-cf2" }));
    return v.ok ? { stage: "session", accessId: v.v.portalAccessId } : { stage: "verify", err: v.err, hadCode: !!r.v.devOtp };
  };
  await sub("A1", async () => {
    const look = await otpLogin(`vic_tim-${rand}@qc.invalid`, "203.0.113.201");
    const pct = await otpLogin(`vic%-${rand}@qc.invalid`, "203.0.113.202");
    const legit = await otpLogin(`VIC.TIM-${rand}@QC.INVALID`, "203.0.113.203");
    chk("A1", "portal OTP: a look-alike mailbox (`vic_tim-…` for contact `vic.tim-…`, or `%`) gets NO portal session (the takeover of 2a-6) · positive control: the contact's own address in other case ⇒ a session of the victim's access",
      look.stage !== "session" && pct.stage !== "session" && legit.stage === "session" && (legit as Any).accessId === access.id,
      `lookalike=${j(look)} percent=${j(pct)} legit=${j(legit)}`);
  });
  await sub("A2", async () => {
    const look = await settle(CRM.portal.loginWithLine(TAG, { lineUserId: `U${rand}look`, email: `vic_tim-${rand}@qc.invalid` }, { ip: "203.0.113.204" }));
    const legit = await settle(CRM.portal.loginWithLine(TAG, { lineUserId: `U${rand}legit`, email: `Vic.Tim-${rand}@qc.invalid` }, { ip: "203.0.113.205" }));
    chk("A2", "portal LINE (no invite): verified LINE e-mail `vic_tim-…` ⇒ no session · positive control: the contact's own address (other case) ⇒ session of the victim's access",
      !look.ok && legit.ok && (legit as Any).v?.portalAccessId === access.id,
      `lookalike=${look.ok ? `SESSION ${(look as Any).v?.portalAccessId}` : (look as Any).err} legit=${legit.ok ? (legit as Any).v?.portalAccessId === access.id : (legit as Any).err}`);
  });

  // ════════ A3 · staff lookup by From (emails.ts) — look-alike staff address with a GENUINE A-R for its own mailbox ════════
  await sub("A3", async () => {
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    try {
      const target = await mkContact("ลูกค้าในสำเนา", `cc-${rand}@qc-cust.test`);
      const look = await ingest(mail({ from: `sta_ff-${rand}@qc.invalid`, to: [INBOX, target.email], headers: AR("qc.invalid") }));
      const lr = await rowOf(look.emailId);
      const legit = await ingest(mail({ from: `STA.FF-${rand}@QC.INVALID`, to: [INBOX, target.email], headers: AR("qc.invalid") }));
      const gr = await rowOf(legit.emailId);
      chk("A3", "inbound From `sta_ff-…` (attacker's real, DMARC-passing mailbox) is NOT the staff `sta.ff-…`: stored IN, sentById null — never a forged 'sent by our salesperson' OUT · positive control: the staff's own address (other case) with A-R ⇒ OUT, sentById = staff",
        look.handled === true && lr?.direction === "IN" && !lr?.sentById && gr?.direction === "OUT" && gr?.sentById === staffU.id,
        `look=${j({ h: look.handled, r: look.reason, dir: lr?.direction, by: lr?.sentById ? "staff" : null })} legit=${j({ dir: gr?.direction, by: gr?.sentById === staffU.id })}`);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
  });

  // ════════ A4 · user-setting "address belongs to a contact" check (emails.ts) ════════
  await sub("A4", async () => {
    const dom = `shop-${rand}.test`;
    await P.emailDomain.create({ data: { tenantId: T, domain: dom, status: "VERIFIED", verifiedAt: new Date() } });
    await mkContact("ผู้ติดต่อบนโดเมนร้าน", `sa.les@${dom}`);
    const look = await settle(CRM.emails.setUserSetting(ctx, owner, { fromAddr: `sa_les@${dom}` }));
    const legit = await settle(CRM.emails.setUserSetting(ctx, owner, { fromAddr: `SA.LES@${dom}` }));
    chk("A4", "setUserSetting fromAddr `sa_les@<verified>` is NOT refused as 'a contact's address' because of contact `sa.les@` (false refusal) · positive control: the contact's exact address (other case) is refused",
      look.ok && !legit.ok, `look=${look.ok ? "saved" : (look as Any).err} legit=${legit.ok ? "saved" : "refused"}`);
  });

  // ════════ A5 · companies (inbound domain match · industry filter · exact-name match) ════════
  await sub("A5", async () => {
    const co = await mkCompany(`โดเมน ${TAG}`, { emailDomain: `dom-${rand}.test`, industry: `ab-${rand}` });
    const look = await ingest(mail({ from: `stranger@dom_${rand}.test` }));
    const lr = await rowOf(look.emailId);
    const legit = await ingest(mail({ from: `stranger@DOM-${rand}.TEST` }));
    const gr = await rowOf(legit.emailId);
    chk("A5.1", "inbound From domain `dom_…` (forgeable, no auth for customers) does NOT file the mail on company `dom-…` (matchedBy NONE) · positive control: same domain other case ⇒ DOMAIN, that company",
      lr?.matchedBy === "NONE" && !lr?.companyId && gr?.matchedBy === "DOMAIN" && gr?.companyId === co.id, `look=${lr?.matchedBy}/${lr?.companyId === co.id} legit=${gr?.matchedBy}/${gr?.companyId === co.id}`);
    const fl = await CRM.companies.listCompanies(ctx, owner, { industry: `ab_${rand}` });
    const fg = await CRM.companies.listCompanies(ctx, owner, { industry: `AB-${rand}` });
    chk("A5.2", "industry filter `ab_…` does not list industry `ab-…` (harmless widening) · positive control: other case lists it",
      !fl.items.some((x: Any) => x.id === co.id) && fg.items.some((x: Any) => x.id === co.id), `look=${fl.items.length} legit=${fg.items.some((x: Any) => x.id === co.id)}`);
    const thai = await mkCompany(`บริษัท ทดสอบ ABC ${rand}`);
    const lit = await mkCompany(`50%_ส่วนลด\\${rand}`);
    const m1 = await CRM.companies.matchByExactName(ctx, owner, "%");
    const m2 = await CRM.companies.matchByExactName(ctx, owner, `บริษัท ทดสอบ abc ${rand}`);
    const m3 = await CRM.companies.matchByExactName(ctx, owner, `50%_ส่วนลด\\${rand}`);
    const m4 = await CRM.companies.matchByExactName(ctx, owner, `5_%_ส่วนลด\\${rand}`);
    chk("A5.3", "matchByExactName('%') ⇒ null (was: the oldest company) · Thai+Latin name other case ⇒ that company · a name holding literal `%_\\` ⇒ itself · `_` look-alike of it ⇒ null",
      m1 === null && m2?.id === thai.id && m3?.id === lit.id && m4 === null, `pct=${m1?.id ?? null} thai=${m2?.id === thai.id} literal=${m3?.id === lit.id} look=${m4?.id ?? null}`);
  });

  // ════════ A6/A7 · contacts dedupe (bridge lead) · findContactsForLink (crm/service.ts) ════════
  await sub("A6", async () => {
    const look = await CRM.contacts.leadFromBridge({ tenantId: T, systemId: S, actorUserId: null }, { kind: "EMAIL", email: `vic_tim-${rand}@qc.invalid`, name: "คนแปลกหน้า" });
    const legit = await CRM.contacts.leadFromBridge({ tenantId: T, systemId: S, actorUserId: null }, { kind: "EMAIL", email: `VIC.TIM-${rand}@qc.invalid`, name: "ซ้ำ" });
    chk("A6", "bridge lead `vic_tim-…` is a NEW contact (was: silently merged into the victim `vic.tim-…`) · positive control: the victim's address in other case ⇒ the victim (repeated)",
      look.created === true && look.contactId !== victim.id && legit.contactId === victim.id && legit.created === false, `look=${j({ c: look.created, victim: look.contactId === victim.id })} legit=${j({ c: legit.created, victim: legit.contactId === victim.id })}`);
  });
  await sub("A7", async () => {
    const look = await CRM.findContactsForLink({ tenantId: T, systemId: S }, { email: `vic_tim-${rand}@qc.invalid` }, "system");
    const legit = await CRM.findContactsForLink({ tenantId: T, systemId: S }, { email: `VIC.TIM-${rand}@qc.invalid` }, "system");
    chk("A7", "findContactsForLink (account 'same person?' block) `vic_tim-…` ⇒ not the victim · positive control: exact other case ⇒ the victim",
      !look.some((x: Any) => x.id === victim.id) && legit.some((x: Any) => x.id === victim.id), `look=${look.length} legit=${legit.some((x: Any) => x.id === victim.id)}`);
  });

  // ════════ A8 · member/service.ts findCustomersForLink (PROD-LIVE) ════════
  await sub("A8", async () => {
    const M = (await sysSvc.createSystem(T, "MEMBER", `${TAG} member`)).id as string;
    SYSTEMS.push(M);
    const cust = await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `สมาชิก ${TAG}`, email: `me.mber-${rand}@qc.invalid` } });
    const MS = (await import("@/lib/modules/member/service" as string)) as Any;
    const look = await MS.findCustomersForLink(T, M, { email: `me_mber-${rand}@qc.invalid` }, "system");
    const pct = await MS.findCustomersForLink(T, M, { email: `%@qc.invalid` }, "system");
    const legit = await MS.findCustomersForLink(T, M, { email: `ME.MBER-${rand}@QC.invalid` }, "system");
    chk("A8", "[PROD-LIVE] member findCustomersForLink `me_mber-…` / `%@domain` ⇒ not the member · positive control: exact other case ⇒ the member",
      !look.some((x: Any) => x.id === cust.id) && !pct.some((x: Any) => x.id === cust.id) && legit.some((x: Any) => x.id === cust.id), `look=${look.length} pct=${pct.length} legit=${legit.some((x: Any) => x.id === cust.id)}`);
  });

  // ════════ A9 · kanban mail-to-board sender lookup (PROD-LIVE) ════════
  await sub("A9", async () => {
    const K = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
    SYSTEMS.push(K);
    const KS = (await import("@/lib/modules/kanban/service" as string)) as Any;
    const KI = (await import("@/lib/modules/kanban/integrations" as string)) as Any;
    const EM = (await import("@/lib/platform/kanban-email-in" as string)) as Any;
    const board = await KS.createBoard({ tenantId: T, systemId: K, name: `บอร์ด ${TAG}`, createdById: u.id });
    const bkey = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    await P.kanbanBoard.update({ where: { id: board.id }, data: { emailKey: bkey } });
    await KI.setIntegrations({ tenantId: T, systemId: K, actorUserId: u.id }, owner, { cardFromEmail: { enabled: true } });
    const up = { upload: async () => ({ ok: false }) };
    const look = await EM.ingestInboundEmail({ messageId: `<${TAG}-k1@probe.test>`, from: `sta_ff-${rand}@qc.invalid`, to: [`งาน+${bkey}@shark.in.th`], subject: "ขอเงินด่วน", text: "โอนให้หน่อย" }, up);
    const legit = await EM.ingestInboundEmail({ messageId: `<${TAG}-k2@probe.test>`, from: `STA.FF-${rand}@qc.invalid`, to: [`งาน+${bkey}@shark.in.th`], subject: "งานจริง", text: "ตามนี้" }, up);
    const card = async (id: string) => P.kanbanCard.findUnique({ where: { id }, select: { description: true, assignees: { select: { userId: true } } } });
    const lc = look.cardId ? await card(look.cardId) : null;
    const gc = legit.cardId ? await card(legit.cardId) : null;
    chk("A9", "[PROD-LIVE] mail-to-board From `sta_ff-…` is an OUTSIDER: not assigned to staff `sta.ff-…` and the card shows 'จาก: <sender>' · positive control: the staff's own address (other case) ⇒ assigned to that staff",
      !!lc && !lc.assignees.some((a: Any) => a.userId === staffU.id) && /จาก:/.test(String(lc.description ?? "")) && !!gc && gc.assignees.some((a: Any) => a.userId === staffU.id),
      `look=${j({ ok: look.ok, asg: lc?.assignees?.length, from: /จาก:/.test(String(lc?.description ?? "")) })} legit=${j({ ok: legit.ok, staff: gc?.assignees?.some((a: Any) => a.userId === staffU.id) })}`);
  });

  // ════════ B · copy loop (2a-1) ════════
  await sub("B1", async () => {
    const tries: [string, string][] = [["system", INBOX], ["other-shop", "crm+abcdefgh@shark.in.th"], ["board", "งาน+abcdefgh@shark.in.th"], ["board-ascii", "tasks+abcdefgh@shark.in.th"], ["shop-slug", `${TAG}@shark.in.th`], ["case", "CRM+ABCDEFGH@SHARK.IN.TH"]];
    const sys: string[] = [];
    const usr: string[] = [];
    for (const [label, addr] of tries) {
      const r = await settle(CRM.emails.setEmailSettings(ctx, owner, { copyToAddr: addr, copyMode: "IN" }));
      if (r.ok) sys.push(label);
      const r2 = await settle(CRM.emails.setUserSetting(ctx, owner, { copyToAddr: addr, copyMode: "BOTH" }));
      if (r2.ok) usr.push(label);
    }
    const okSys = await settle(CRM.emails.setEmailSettings(ctx, owner, { copyToAddr: `copy-${rand}@qc-copy.test`, copyMode: "IN" }));
    const okUsr = await settle(CRM.emails.setUserSetting(ctx, owner, { copyToAddr: `copy-u-${rand}@qc-copy.test`, copyMode: "NONE" }));
    chk("B1", "copy target inside SHARK inbound (own/other `crm+…`, board `งาน+`/`tasks+`, shop `<slug>@shark.in.th`, any case) is refused for the shop setting AND the per-user setting · positive control: an outside address is accepted",
      sys.length === 0 && usr.length === 0 && okSys.ok && okUsr.ok, `acceptedShop=${sys.join(",") || "-"} acceptedUser=${usr.join(",") || "-"} outside=${okSys.ok}/${okUsr.ok}`);
  });
  await sub("B2", async () => {
    COPIES.length = 0;
    const r = await ingest(mail({ from: `buyer-${rand}@qc-cust.test` }));
    const cp = COPIES[0];
    const h = cp?.headers ?? {};
    const loopV = String(h["X-SHARK-Loop"] ?? "");
    chk("B2", "the inbound copy (copyMode IN) carries `Auto-Submitted: auto-forwarded` and our loop marker `X-SHARK-Loop`",
      r.handled === true && COPIES.length === 1 && h["Auto-Submitted"] === "auto-forwarded" && loopV.length > 0, `handled=${r.handled} copies=${COPIES.length} headers=${j(h)}`);
    const before = await P.crmEmailMessage.count({ where: { systemId: S } });
    COPIES.length = 0;
    const back = await ingest(mail({ from: "noreply@shark.in.th", subject: cp?.subject ?? "copy", headers: { "Auto-Submitted": "auto-forwarded", "X-SHARK-Loop": loopV || "crm" } }));
    const after = await P.crmEmailMessage.count({ where: { systemId: S } });
    const normal = await ingest(mail({ from: `buyer2-${rand}@qc-cust.test`, headers: { "X-Other": "1" } }));
    chk("B3", "a mail that carries our loop marker comes back ⇒ dropped (handled false, no row, no copy sent again) · positive control: an ordinary mail is stored and copied",
      back.handled === false && after === before && COPIES.filter((c) => String(c?.subject ?? "").includes(String(cp?.subject ?? "x"))).length === 0 && normal.handled === true && COPIES.length === 1,
      `back=${j({ h: back.handled, r: back.reason })} rows+${after - before} normal=${normal.handled} copies=${COPIES.length}`);
    // legacy row written before the validation existed: the runtime guard refuses to send a copy into SHARK
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: { ...EMAIL_SETTINGS, copyMode: "BOTH", copyToAddr: INBOX }, portal: { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] } });
    COPIES.length = 0;
    const lg = await ingest(mail({ from: `buyer3-${rand}@qc-cust.test` }));
    chk("B4", "legacy setting copyToAddr = our own `crm+…` (saved before the guard) ⇒ the mail is stored but NO copy is sent",
      lg.handled === true && COPIES.length === 0, `handled=${lg.handled} copies=${j(COPIES.map((c) => c.to))}`);
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] } });
  });

  // ════════ C · forged customer From (2a-2) ════════
  await sub("C", async () => {
    const custDom = `cust-${rand}.test`;
    const K1 = await mkContact("ลูกค้าจริง", `buyer@${custDom}`);
    const K2 = await mkContact("ลูกค้าอีกคน", `other@${custDom}`);
    await P.crmScoreRule.create({ data: { tenantId: T, systemId: S, name: `ตอบอีเมล ${TAG}`, event: "crm.email.received", points: 10, active: true } });
    const seq = await CRM.sequences.createSequence(ctx, owner, { name: `ลำดับ ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, businessDaysOnly: false, sendWindow: null, steps: [{ kind: "EMAIL", subject: "หนึ่ง", body: "เรียนคุณ {{contact.firstName}}" }, { kind: "EMAIL", subject: "สอง", body: "ตามต่อ" }] });
    const seqId = (seq?.id ?? seq?.sequence?.id) as string;
    for (const k of [K1, K2]) await CRM.sequences.enroll(ctx, owner, { sequenceId: seqId, contactId: k.id });
    const enr = async (k: Any) => (await P.crmSequenceEnrollment.findFirst({ where: { sequenceId: seqId, contactId: k.id }, select: { status: true } }))?.status;
    const rfc = `${TAG}-out@probe.test`;
    const thread = `thr${rand}`;
    const out = await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: K1.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: thread, fromAddr: `${TAG}@shark.in.th`, toAddrs: [K1.email], subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 60_000), trackTokenHash: sha(`${TAG}-out`) } });
    const bridges = (await import("@/lib/platform/crm-bridges" as string)) as Any;
    const scoreOf = async (k: Any) => P.crmScoreLog.count({ where: { contactId: k.id } });
    const recv = async (emailId: string) => (await P.outboxEvent.findMany({ where: { type: "crm.email.received" } })).find((e: Any) => e.payload?.emailId === emailId);
    const score = async (emailId: string) => { const e = await recv(emailId); if (e) await bridges.onScoringEvent({ id: e.id, tenantId: e.tenantId, systemId: e.systemId, type: e.type, payload: e.payload }); return e; };
    const repliedEvents = async () => (await P.outboxEvent.findMany({ where: { type: "crm.email.replied" } })).length;

    // C1 forged From = K1 (no A-R, no Message-ID) — timeline phishing "Re: <subject>"
    const f = await ingest(mail({ from: K1.email, subject: `Re: ใบเสนอราคา ${TAG}`, text: "โอนเข้าบัญชีใหม่นะครับ" }));
    const fr = await rowOf(f.emailId);
    const fe = await score(f.emailId);
    const thr = await CRM.emails.getThread(ctx, owner, fr?.threadKey ?? "none");
    const dto = thr.messages.find((m: Any) => m.id === f.emailId);
    chk("C1", "forged customer From (no authentication proof) ⇒ stored on the contact (staff still sees it) WITH routing.unverifiedFrom = true · thread DTO says unverifiedFrom · crm.email.received carries no contactId/companyId (unverifiedFrom: true) ⇒ the score rule awards 0",
      f.handled === true && fr?.contactId === K1.id && (fr?.routing as Any)?.unverifiedFrom === true && dto?.unverifiedFrom === true && !!fe && !fe.payload?.contactId && fe.payload?.unverifiedFrom === true && (await scoreOf(K1)) === 0,
      `row=${j({ c: fr?.contactId === K1.id, routing: fr?.routing })} dto=${dto?.unverifiedFrom} evt=${j(fe?.payload)} score=${await scoreOf(K1)}`);
    // C2 forged From = K2 holding the thread's Message-ID (a CC'd party / forwarded copy) ⇒ no reply effects
    const r0 = await repliedEvents();
    const g = await ingest(mail({ from: K2.email, subject: `Re: ใบเสนอราคา ${TAG}`, headers: { "in-reply-to": `<${rfc}>`, references: `<${rfc}>` } }));
    const outAfterG = await P.crmEmailMessage.findUnique({ where: { id: out.id }, select: { repliedAt: true } });
    chk("C2", "unverified From that is NOT the thread's recipient but cites its Message-ID ⇒ OUT not marked replied · no crm.email.replied · that contact's sequence NOT stopped",
      g.handled === true && !outAfterG?.repliedAt && (await repliedEvents()) === r0 && (await enr(K2)) === "ACTIVE",
      `replied=${!!outAfterG?.repliedAt} evts+${(await repliedEvents()) - r0} enrK2=${await enr(K2)}`);
    // C3 authenticated From = K1 (A-R of our MTA, dmarc pass for its domain) ⇒ behaves as today
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    try {
      const a = await ingest(mail({ from: K1.email, subject: `Re: ใบเสนอราคา ${TAG}`, headers: { ...AR(custDom), "in-reply-to": `<${rfc}>` } }));
      const ar = await rowOf(a.emailId);
      const ae = await score(a.emailId);
      const outAfterA = await P.crmEmailMessage.findUnique({ where: { id: out.id }, select: { repliedAt: true } });
      chk("C3", "authenticated customer reply (CRM_INBOUND_AUTHSERV_ID set · dmarc=pass header.from=<its domain>) ⇒ no flag · event carries contactId · score +10 · OUT repliedAt · ONE crm.email.replied · K1's sequence STOPPED",
        a.handled === true && !(ar?.routing as Any)?.unverifiedFrom && ae?.payload?.contactId === K1.id && (await scoreOf(K1)) === 1 && !!outAfterA?.repliedAt && (await repliedEvents()) === r0 + 1 && (await enr(K1)) === "STOPPED",
        `routing=${j(ar?.routing)} evt=${j(ae?.payload)} score=${await scoreOf(K1)} replied=${!!outAfterA?.repliedAt} evts+${(await repliedEvents()) - r0} enrK1=${await enr(K1)}`);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
  });

  // ════════ D1 · inbound rate cap (2a-7) ════════
  await sub("D1", async () => {
    const L = ES.CRM_INBOUND_RATE_LIMITS ?? { perSender: { limit: 100, windowMs: 3_600_000 }, perSystem: { limit: 1000, windowMs: 3_600_000 } };
    const from = `flood-${rand}@qc-flood.test`;
    const senderKey = `crm.email.in.from.${S}.${sha(`from:${from}`).slice(0, 32)}`;
    const sysKey = `crm.email.in.sys.${S}`;
    const fill = async (key: string, count: number) => P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
    const audits = async (bucket: string) => (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).filter((a: Any) => a.after?.bucket === bucket).length;
    await fill(senderKey, L.perSender.limit);
    const rows0 = await P.crmEmailMessage.count({ where: { systemId: S } });
    const o1 = await ingest(mail({ from }));
    const o2 = await ingest(mail({ from }));
    const ok1 = await ingest(mail({ from: `calm-${rand}@qc-flood.test` }));
    const rows1 = await P.crmEmailMessage.count({ where: { systemId: S } });
    chk("D1.1", "per-sender cap: a sender over its hourly bucket ⇒ accepted-and-dropped (ok true · handled false · reason rate_limited · no row) · exactly ONE audit line for the window however many mails · positive control: another sender is stored",
      o1.ok === true && o1.handled === false && o1.reason === "rate_limited" && o2.reason === "rate_limited" && ok1.handled === true && rows1 === rows0 + 1 && (await audits("sender")) === 1,
      `o1=${j(o1)} o2=${o2.reason} other=${ok1.handled} rows+${rows1 - rows0} audits=${await audits("sender")}`);
    await fill(sysKey, L.perSystem.limit);
    const s1 = await ingest(mail({ from: `new1-${rand}@qc-flood.test` }));
    const s2 = await ingest(mail({ from: `new2-${rand}@qc-flood.test` }));
    const rows2 = await P.crmEmailMessage.count({ where: { systemId: S } });
    chk("D1.2", "per-system cap: system bucket full ⇒ any new sender dropped (reason rate_limited, no row) · ONE audit line for the window",
      s1.handled === false && s1.reason === "rate_limited" && s2.reason === "rate_limited" && rows2 === rows1 && (await audits("system")) === 1, `s1=${j(s1)} s2=${s2.reason} rows+${rows2 - rows1} audits=${await audits("system")}`);
    await P.chatRateBucket.deleteMany({ where: { key: { in: [senderKey, sysKey] } } });
    const back = await ingest(mail({ from }));
    chk("D1.3", "window over (bucket reset) ⇒ the same sender is stored again", back.handled === true, j(back));
  });

  // ════════ D2 · re-invite revokes live sessions (2a-8) ════════
  await sub("D2", async () => {
    const k = await mkContact("ผู้ติดต่อเชิญซ้ำ", `re.invite-${rand}@qc.invalid`);
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: company.id, contactId: k.id, isPrimary: false, startedAt: new Date(Date.now() - 600_000) } });
    const inv1 = await CRM.portal.invite(ctx, owner, { companyId: company.id, contactId: k.id, role: "VIEW" });
    await P.crmPortalAccess.update({ where: { id: inv1.accessId }, data: { acceptedAt: new Date() } });
    const s1 = await CS.mintPortalSession(inv1.accessId, { ip: "203.0.113.210", userAgent: "probe" });
    const alive1 = !!(await CS.getPortalSession(s1.token));
    await CRM.portal.invite(ctx, owner, { companyId: company.id, contactId: k.id, role: "APPROVE" });
    const alive2 = !!(await CS.getPortalSession(s1.token));
    const s2 = await CS.mintPortalSession(inv1.accessId, { ip: "203.0.113.211", userAgent: "probe" });
    const alive3 = !!(await CS.getPortalSession(s2.token));
    const audit = await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.portal.invite", targetId: inv1.accessId }, orderBy: { createdAt: "desc" }, select: { after: true } });
    chk("D2", "re-sending the invite of an access kills its live portal sessions (old device signed out) · invite audit records sessionsRevoked · positive control: a session minted after the re-invite works",
      alive1 && !alive2 && alive3 && Number((audit?.after as Any)?.sessionsRevoked ?? -1) === 1, `before=${alive1} afterReinvite=${alive2} fresh=${alive3} audit=${j(audit?.after)}`);
  });

  // ════════ E · companies gate (it4 F1) + aria-current (F2) ════════
  await sub("E", async () => {
    const NAV = (await import("@/lib/modules/crm/nav" as string)) as Any;
    const entry = (NAV.CRM_NAV as Any[]).find((e) => e.key === "companies");
    const withKey = NAV.crmNavItems(S, () => true).some((x: Any) => x.href.endsWith("/crm/companies"));
    const without = NAV.crmNavItems(S, (k: string) => k !== "crm.company.read").some((x: Any) => x.href.endsWith("/crm/companies"));
    chk("E1", "nav: tab บริษัท carries perm crm.company.read (shown with the key, hidden without it)", entry?.perm === "crm.company.read" && withKey && !without, `perm=${entry?.perm} with=${withKey} without=${without}`);
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const list = strip(read("src/app/app/sys/[id]/crm/companies/page.tsx"));
    const rec = strip(read("src/app/app/sys/[id]/crm/companies/[companyId]/page.tsx"));
    const lay = strip(read("src/app/app/layout.tsx"));
    const gateIdx = (src: string, before: string) => { const g = src.search(/if\s*\(\s*!crmCan\(actor,\s*"crm\.company\.read"\)\)\s*notFound\(\)/); const b = src.indexOf(before); return g > 0 && b > 0 && g < b; };
    chk("E2", "/companies list + /companies/[companyId]: `if (!crmCan(actor, \"crm.company.read\")) notFound()` before any company read · drawer link บริษัท gated by crm.company.read (เพิ่มบริษัท by crm.company.create)",
      gateIdx(list, "listCompanies(ctx") && gateIdx(rec, "getCompany360(ctx") && /crmCan\(membershipOf\(auth\),\s*"crm\.company\.read"\)\s*\?\s*\[\{\s*href:\s*`\$\{s\}\/crm\/companies`/.test(lay) && /crmCan\(membershipOf\(auth\),\s*"crm\.company\.create"\)\s*\?\s*\[\{\s*href:\s*`\$\{s\}\/crm\/companies\/new`/.test(lay),
      `list=${gateIdx(list, "listCompanies(ctx")} record=${gateIdx(rec, "getCompany360(ctx")} drawer=${/"crm\.company\.read"\)\s*\?\s*\[\{\s*href:\s*`\$\{s\}\/crm\/companies`/.test(lay)}`);
    const board = read("src/app/app/sys/[id]/crm/deals/_components/DealBoard.tsx");
    chk("E3", "deal stage tabs expose the selected stage: aria-current on the active `deal-stage-tab-*`", /aria-current=\{active === c\.stageId \? "true" : undefined\}/.test(board), /aria-current/.test(board) ? "present" : "absent");
  });
  // ════════════════════════ ROUND 2 (independent review RV2-1 … RV2-7) ════════════════════════
  // RV2-1 · copy loop through an outside forwarder that rewrites the mail ("FW: …", no X- header, From = the copy mailbox)
  await sub("R2-1", async () => {
    const box = `copybox-${rand}@qc-copy.test`;
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: { ...EMAIL_SETTINGS, copyMode: "IN", copyToAddr: box }, portal: { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] } });
    COPIES.length = 0;
    const first = await ingest(mail({ from: `fwd-cust-${rand}@qc-cust.test`, subject: `สอบถามราคา ${TAG}` }));
    let subj = String(COPIES[0]?.subject ?? "");
    for (let hop = 0; hop < 4; hop += 1) {
      await ingest(mail({ from: box, subject: `FW: ${subj}`, headers: {} }));
      subj = `FW: ${subj}`;
    }
    const afterHops = COPIES.length;
    await ingest(mail({ from: `auto-${rand}@qc-cust.test`, subject: `Out of office ${TAG}`, headers: { "Auto-Submitted": "auto-replied" } }));
    await ingest(mail({ from: `other-${rand}@qc-cust.test`, subject: `Re: FW: [สำเนาจดหมายเข้า] เรื่องเดิม ${TAG}` }));
    const afterAll = COPIES.length;
    chk("R2-1", "4-hop outside-forwarder loop (FW: subject, no loop header, From = the copy mailbox) ⇒ exactly ONE copy (the original) · an Auto-Submitted mail and a subject carrying the copy prefix mid-way get no copy · positive control: the customer's mail was copied",
      first.handled === true && afterHops === 1 && afterAll === 1, `firstCopied=${first.handled}/${COPIES.length >= 1} afterHops=${afterHops} afterAll=${afterAll}`);
    await setCrm({ uiVersion: 2, bridgesEnabled: true, email: EMAIL_SETTINGS, portal: { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"] } });
  });

  // RV2-2 + RV2-4 · forged From on a company's e-mail domain (no contact) is flagged; list/REST/AI carry the flag
  await sub("R2-2", async () => {
    const dom = `dom2-${rand}.test`;
    const co = await mkCompany(`บริษัทโดเมน ${TAG}`, { emailDomain: dom });
    const f = await ingest(mail({ from: `ceo@${dom}`, subject: `แจ้งเปลี่ยนบัญชีรับเงิน ${TAG}` }));
    const fr = await rowOf(f.emailId);
    const fe = (await P.outboxEvent.findMany({ where: { type: "crm.email.received" } })).find((e: Any) => e.payload?.emailId === f.emailId);
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let ar: Any = null; let ae: Any = null;
    try {
      const a = await ingest(mail({ from: `cfo@${dom}`, subject: `ใบแจ้งหนี้ ${TAG}`, headers: AR(dom) }));
      ar = await rowOf(a.emailId);
      ae = (await P.outboxEvent.findMany({ where: { type: "crm.email.received" } })).find((e: Any) => e.payload?.emailId === a.emailId);
    } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
    chk("R2-2", "RV2-2: forged `ceo@<company emailDomain>` (no contact, no A-R) filed by DOMAIN ⇒ routing.unverifiedFrom · event has NO companyId (unverifiedFrom: true) · positive control: the same domain WITH A-R ⇒ no flag, event carries companyId",
      fr?.matchedBy === "DOMAIN" && fr?.companyId === co.id && (fr?.routing as Any)?.unverifiedFrom === true && !!fe && !fe.payload?.companyId && fe.payload?.unverifiedFrom === true && ar?.companyId === co.id && !(ar?.routing as Any)?.unverifiedFrom && ae?.payload?.companyId === co.id,
      `forged=${j({ by: fr?.matchedBy, routing: fr?.routing, evt: fe?.payload })} proven=${j({ routing: ar?.routing, evtCo: ae?.payload?.companyId === co.id })}`);
    const list = await CRM.emails.listThreads(ctx, owner, { companyId: co.id });
    const forgedT = list.items.find((t: Any) => t.threadKey === fr?.threadKey);
    const provenT = list.items.find((t: Any) => t.threadKey === ar?.threadKey);
    const inbox = read("src/components/crm/emails/EmailInbox.tsx");
    const ops = read("src/lib/modules/crm/api/ops/emails.ts");
    const threadsOp = ops.slice(ops.indexOf('id: "emails.threads.list"'), ops.indexOf('id: "emails.thread.get"'));
    chk("R2-4", "RV2-4: listThreads (inbox · contact/company lists · REST GET /emails/threads · AI tool crm_email_thread) carries unverifiedFrom per thread (forged thread true · proven thread false) · inbox rows render the badge · the REST/AI op passes items through and its summary + tool hint explain the flag",
      forgedT?.unverifiedFrom === true && provenT?.unverifiedFrom === false && /t\.unverifiedFrom && \(/.test(inbox) && /ไม่ยืนยันผู้ส่ง/.test(inbox) && /unverifiedFrom/.test(threadsOp) && /tool:[^\n]*unverifiedFrom/.test(threadsOp) && /maskFreeText\(\{ \.\.\.it \}/.test(threadsOp),
      `forged=${forgedT?.unverifiedFrom} proven=${provenT?.unverifiedFrom} inboxBadge=${/t\.unverifiedFrom && \(/.test(inbox)} opText=${/unverifiedFrom/.test(threadsOp)}`);
  });

  // RV2-3 · system cap: proven mail (A-R or thread proof) is exempt; owner notified once per window
  await sub("R2-3", async () => {
    const L = ES.CRM_INBOUND_RATE_LIMITS;
    const sysKey = `crm.email.in.sys.${S}`;
    const kP = await mkContact("ลูกค้ายืนยันได้", `proven-${rand}@cust3-${rand}.test`);
    const kT = await mkContact("ลูกค้าตอบเธรด", `thread-${rand}@qc-cust.test`);
    const rfc = `${TAG}-r23@probe.test`;
    await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: kT.id, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: `r23${rand}`, fromAddr: `${TAG}@shark.in.th`, toAddrs: [kT.email], subject: `ใบเสนอราคา r23 ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 60_000), trackTokenHash: sha(`${TAG}-r23`) } });
    await P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, sysKey, L.perSystem.limit);
    const notes0 = await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id, title: { contains: "เกินเพดาน" } } });
    const t0 = new Date(Date.now() - 1_000);
    const u1 = await ingest(mail({ from: `rand1-${rand}@qc-flood.test` }));
    const u2 = await ingest(mail({ from: `rand2-${rand}@qc-flood.test` }));
    const bucketAfterFlood = Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, sysKey)) as Any[])[0]?.count ?? 0);
    process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
    let pv: Any;
    try { pv = await ingest(mail({ from: kP.email, headers: AR(`cust3-${rand}.test`) })); } finally {
      if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID; else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
    }
    const th = await ingest(mail({ from: kT.email, subject: `Re: ใบเสนอราคา r23 ${TAG}`, headers: { "in-reply-to": `<${rfc}>` } }));
    const bucketAfterProven = Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, sysKey)) as Any[])[0]?.count ?? 0);
    const notes = (await P.appNotification.count({ where: { tenantId: T, recipientUserId: u.id, title: { contains: "เกินเพดาน" } } })) - notes0;
    const audits = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.email.inbound.rate_limited", createdAt: { gte: t0 } }, select: { after: true } })).filter((a: Any) => a.after?.bucket === "system").length;
    chk("R2-3", "RV2-3 ruling: system bucket full ⇒ unproven random senders dropped (rate_limited) · an A-R-proven contact mail AND a thread-proven reply (our Message-ID, from that mail's recipient) are STORED and do not touch the system bucket · the owner gets ONE notification for the window (with ONE audit line)",
      u1.reason === "rate_limited" && u2.reason === "rate_limited" && pv?.handled === true && th.handled === true && bucketAfterProven === bucketAfterFlood && notes === 1 && audits === 1,
      `flood=${u1.reason}/${u2.reason} proven=${j({ h: pv?.handled, r: pv?.reason })} thread=${j({ h: th.handled, r: th.reason })} bucket=${bucketAfterFlood}→${bucketAfterProven} ownerNotes=${notes} audits=${audits}`);
    await P.chatRateBucket.deleteMany({ where: { key: sysKey } });
  });

  // RV2-5 · re-invite signs the contact out of EVERY company (B→A switchCompany scenario)
  await sub("R2-5", async () => {
    const km = await mkContact("ผู้ติดต่อสองบริษัท", `two.co-${rand}@qc.invalid`);
    const coB = await mkCompany(`บริษัทบี ${TAG}`);
    for (const co of [company, coB]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: km.id, isPrimary: co.id === company.id, startedAt: new Date(Date.now() - 600_000) } });
    const accA = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: company.id, contactId: km.id, role: "APPROVE", loginMethods: [], invitedAt: new Date(Date.now() - 300_000), acceptedAt: new Date(Date.now() - 300_000), invitedById: u.id } });
    const accB = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: coB.id, contactId: km.id, role: "VIEW", loginMethods: [], invitedAt: new Date(Date.now() - 300_000), acceptedAt: new Date(Date.now() - 300_000), invitedById: u.id } });
    const sB = await CS.mintPortalSession(accB.id, { ip: "203.0.113.220", userAgent: "probe" });
    const sw1 = await settle(CRM.portal.switchCompany(sB.token, company.id, { ip: "203.0.113.220" }, { revokeCurrent: false }));
    const switchedA = sw1.ok ? (sw1 as Any).v : null;
    await CRM.portal.invite(ctx, owner, { companyId: company.id, contactId: km.id, role: "APPROVE" });
    const bAlive = !!(await CS.getPortalSession(sB.token));
    const aAlive = switchedA ? !!(await CS.getPortalSession(switchedA.token)) : null;
    const sw2 = await settle(CRM.portal.switchCompany(sB.token, company.id, { ip: "203.0.113.221" }, { revokeCurrent: false }));
    chk("R2-5", "RV2-5: re-inviting the contact at company A kills its live session at company B too (no B→A switchCompany afterwards) and the A session obtained by switching · positive control: before the re-invite B→A switch minted a live A session",
      !!switchedA && switchedA.portalAccessId === accA.id && !bAlive && aAlive === false && !sw2.ok, `beforeSwitch=${switchedA?.portalAccessId === accA.id} B=${bAlive} A=${aAlive} switchAfter=${sw2.ok ? "SESSION" : (sw2 as Any).err}`);
  });

  // RV2-6 · F15 scanner (the spellings the reviewer lists + negatives) and line-anchored debt
  await sub("R2-6", async () => {
    const SC = (await import("../../lib/ci-equals-scan.mjs" as string)) as Any;
    const miss = Object.entries(SC.F15_SELF_TEST.mustHit as Record<string, string>).filter(([, s]) => SC.findRawInsensitive(s).length !== 1).map(([k]) => k);
    const fp = Object.entries(SC.F15_SELF_TEST.mustNotHit as Record<string, string>).filter(([, s]) => SC.findRawInsensitive(s).length !== 0).map(([k]) => k);
    const svc = read("src/lib/modules/account/service.ts");
    const fit = read("scripts/fitness.mts");
    const owedSnippets = [...fit.matchAll(/file: "src\/lib\/modules\/account\/service\.ts", snippet: `([^`]+)`/g)].map((m) => m[1]);
    const added = SC.findRawInsensitive(`${svc}\nexport const __probe = { name: { equals: "x", mode: "insensitive" } };`);
    const newHit = added.filter((h: Any) => !owedSnippets.includes(h.snippet));
    chk("R2-6", "F15: scanner catches all 12 must-hit spellings (incl. shorthand · swapped · single quote · comma in value · quoted key · QueryMode · variable object · spread · // in string · multi-line · mode variable) and none of the 8 negatives · a NEW `name: {equals, mode}` in account/service.ts is outside the line-anchored debt",
      miss.length === 0 && fp.length === 0 && added.length === 3 && newHit.length === 1, `miss=${miss.join(",") || "-"} falsePos=${fp.join(",") || "-"} sites=${added.length} newOutsideDebt=${newHit.length}`);
  });

  // RV2-7 · nav: บริษัท tab visible on every CRM page for anyone with crm.company.read
  await sub("R2-7", async () => {
    const NAV = (await import("@/lib/modules/crm/nav" as string)) as Any;
    const NP = (await import("@/components/nav-perms" as string)) as Any;
    const ACC = (await import("@/lib/modules/crm/access" as string)) as Any;
    const lay = read("src/app/app/sys/[id]/crm/layout.tsx");
    const tabs = read("src/components/module-tabs.tsx");
    const PAGES = ["deals/page.tsx", "contacts/page.tsx", "activities/page.tsx", "calendar/page.tsx", "settings/page.tsx", "emails/page.tsx", "companies/new/page.tsx"];
    const pagesOk = PAGES.filter((p) => /crmNavItems\(id[,)]/.test(read(`src/app/app/sys/[id]/crm/${p}`)));
    const asOf = (actor: Any) => NP.visibleTabs(NAV.crmNavItems(S), (NAV.CRM_NAV_PERMS as string[]).filter((k) => ACC.crmCan(actor, k))).some((x: Any) => x.href.endsWith("/crm/companies"));
    const ownerSees = asOf({ userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} });
    const managerSees = asOf({ userId: u.id, role: "MANAGER", unitAccess: ["*"], permissions: {} });
    const staffNoKey = asOf({ userId: staffU.id, role: "STAFF", unitAccess: ["*"], permissions: { "crm.deal.read": true, "crm.contact.read": true } });
    const staffKey = asOf({ userId: staffU.id, role: "STAFF", unitAccess: ["*"], permissions: { "crm.company.read": true } });
    const noProvider = NP.visibleTabs(NAV.crmNavItems(S), []).some((x: Any) => x.href.endsWith("/crm/companies"));
    chk("R2-7", "RV2-7: the CRM layout computes the nav keys once (NavPermsProvider + CRM_NAV_PERMS) and ModuleTabs filters with them ⇒ on every page that calls crmNavItems(id) (7 pages checked) บริษัท shows for OWNER/MANAGER/STAFF-with-key and is hidden for a STAFF without crm.company.read · no provider ⇒ hidden (fail closed)",
      /NavPermsProvider perms=\{perms\}/.test(lay) && /CRM_NAV_PERMS\.filter\(\(k\) => crmCan\(actor, k\)\)/.test(lay) && /visibleTabs\(items, perms\)/.test(tabs) && pagesOk.length === PAGES.length && ownerSees && managerSees && staffKey && !staffNoKey && !noProvider,
      `pages=${pagesOk.length}/${PAGES.length} owner=${ownerSees} manager=${managerSees} staffKey=${staffKey} staffNoKey=${staffNoKey} noProvider=${noProvider}`);
  });
  // ════════════════════════ ROUND 3 (re-review R2b-1) ════════════════════════
  // switchCompany(B→A) racing a re-invite of A: the session minted by the switch must never survive the contact-wide revoke
  await sub("R3-1", async () => {
    const TRIALS = 24;
    const coB = await mkCompany(`บริษัทแข่ง ${TAG}`);
    let survivors = 0;
    let switchesWon = 0;
    const detail: string[] = [];
    for (let t = 0; t < TRIALS; t += 1) {
      const k = await mkContact(`แข่ง${t}`, `race${t}-${rand}@qc.invalid`);
      for (const co of [company, coB]) await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: k.id, isPrimary: co.id === company.id, startedAt: new Date(Date.now() - 600_000) } });
      await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: company.id, contactId: k.id, role: "APPROVE", loginMethods: [], invitedAt: new Date(Date.now() - 300_000), acceptedAt: new Date(Date.now() - 300_000), invitedById: u.id } });
      const accB = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: coB.id, contactId: k.id, role: "VIEW", loginMethods: [], invitedAt: new Date(Date.now() - 300_000), acceptedAt: new Date(Date.now() - 300_000), invitedById: u.id } });
      const sB = await CS.mintPortalSession(accB.id, { ip: "203.0.113.230", userAgent: "probe-race" });
      const lag = (t % 4) * 4; // 0 · 4 · 8 · 12 ms — switch first on even trials, invite first on odd
      const sw = async () => { if (t % 2 === 1) await new Promise((r) => setTimeout(r, lag)); return settle(CRM.portal.switchCompany(sB.token, company.id, { ip: "203.0.113.230" }, { revokeCurrent: true })); };
      const inv = async () => { if (t % 2 === 0) await new Promise((r) => setTimeout(r, lag)); return settle(CRM.portal.invite(ctx, owner, { companyId: company.id, contactId: k.id, role: "APPROVE" })); };
      const [r1, r2] = await Promise.all([sw(), inv()]);
      if (r1.ok) switchesWon += 1;
      const live = await P.portalSession.count({ where: { tenantId: T, crmContactId: k.id, revokedAt: null } });
      if (live > 0) { survivors += 1; detail.push(`t${t}:live=${live}/sw=${r1.ok}`); }
      if (!r2.ok) detail.push(`t${t}:invite=${(r2 as Any).err}`);
    }
    chk("R3-1", `R2b-1: ${TRIALS} trials of switchCompany(B→A) concurrent with re-invite(A) (0–12 ms staggers, both orders) ⇒ 0 live portal sessions of the contact afterwards · every re-invite succeeds`,
      survivors === 0 && !detail.some((d) => d.includes("invite=")), `survivors=${survivors} switchesThatMinted=${switchesWon}/${TRIALS} ${detail.slice(0, 6).join(" ")}`);
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
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf2: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
