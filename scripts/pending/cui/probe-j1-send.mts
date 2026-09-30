// CRM C4.4-fix2 ▸ J1 service-level probe — a URL typed as plain text by staff (composer) or written in a rule's
//   SEND_EMAIL body reaches the customer as a CLICK-TRACKED link (routing.links ≥ 1 · outgoing HTML has /t/c/<token>),
//   the outgoing HTML contains no injected tag, and the stored plain-text alternative still reads naturally ◂
//   Path A = the payload the composer in THIS tree sends (read from EmailComposer.tsx: HEAD escapes the body into
//   `bodyHtml`; the fix sends `bodyText`) → emails.sendEmail with a capturing transport (no provider call).
//   Path B = the automation SEND_EMAIL dependency (CRM_DEFAULT_DEPS.email — real code, unchanged signature).
// Writes on QC1 (tagged `qc-cui-j1`): 1 contact + the sent messages — deleted by id in finally.
// Run: bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cui/probe-j1-send.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as Any;
const envInfo = accEnv.loadQcEnv();
if (!String(envInfo?.host ?? "").includes("ep-plain-art")) {
  console.error("not QC1 — stop");
  process.exit(4);
}
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as Any;
const CRM = (await import("@/lib/modules/crm" as string)) as Any;
const AUTO = (await import("@/lib/modules/crm/automation" as string)) as Any;

let pass = 0;
let fail = 0;
const chk = (id: string, ok: boolean, msg: string) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✅" : "❌"} ${id} ${msg}`);
};

const env = await lib.resolveEnv(prisma);
const { ctx, actor } = await lib.actorFor(prisma, env, "owner");
const TAG = `qc-cui-j1-${Date.now().toString(36)}`;
const URL1 = "https://example.com/quote?id=7&x=1";
const TEXT = `เรียนคุณลูกค้า\nดูใบเสนอราคาได้ที่ ${URL1}.\n\nขอบคุณค่ะ <b>ทีมขาย</b> — It's "ok"`;

const composerSrc = readFileSync("src/components/crm/emails/EmailComposer.tsx", "utf8");
const composerSendsText = /bodyText\s*:\s*body/.test(composerSrc);
const headComposerHtml = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
console.log(`composer in this tree sends: ${composerSendsText ? "bodyText (plain text)" : "bodyHtml (escaped by the composer)"}`);

const created: { contact: string | null; emails: string[] } = { contact: null, emails: [] };
try {
  const settings = await CRM.emails.getEmailSettings(ctx, actor);
  chk("J1.S0", !!settings.trackClicks, `QC1 shop has click tracking on (precondition) — trackClicks=${settings.trackClicks}`);

  const c = await CRM.contacts.createContact(ctx, actor, { firstName: `ผู้ติดต่อ ${TAG}`, email: `${TAG}@example.com`, phone: `06${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, ownerUserId: env.users.owner.userId });
  created.contact = c.contact?.id ?? null;
  // precondition: e-mail consent granted by staff (the same service the contact page toggle calls) — marketing send needs it
  await CRM.consents.set(ctx, actor, created.contact, { channel: "EMAIL", granted: true, source: "STAFF" });

  // ── Path A: composer payload → sendEmail (capturing transport) ──
  const sent: Any[] = [];
  const deps = { transport: async (m: Any) => { sent.push(m); return { ok: true, providerId: `${TAG}-a` }; }, put: async () => {}, del: async () => 200 };
  const payload = composerSendsText ? { bodyText: TEXT } : { bodyHtml: headComposerHtml(TEXT) };
  const rA = await CRM.emails.sendEmail(ctx, actor, { contactId: created.contact, subject: `ใบเสนอราคา ${TAG}`, ...payload }, deps).then((v: Any) => ({ ok: true, v }), (e: Any) => ({ ok: false, e }));
  if (rA.ok) created.emails.push(rA.v.emailId);
  const rowA = rA.ok ? await prisma.crmEmailMessage.findFirst({ where: { id: rA.v.emailId }, select: { bodyHtml: true, bodyText: true, routing: true } }) : null;
  const htmlA = String(sent[0]?.html ?? "");
  const linksA = ((rowA?.routing as Any)?.links ?? []) as Any[];
  chk("J1.A1", rA.ok && linksA.length === 1 && linksA[0]?.url === URL1, `composer path: exactly the typed URL is click-tracked (routing.links) — ok=${rA.ok} ${rA.ok ? "" : String(rA.e?.message)} links=${JSON.stringify(linksA)}`);
  chk("J1.A2", /href="[^"]*\/t\/c\/[^"]+"/.test(htmlA) && !htmlA.includes(`href="${URL1.replace(/&/g, "&amp;")}"`), `composer path: outgoing HTML carries /t/c/<token> instead of the raw URL — ${htmlA.slice(0, 300)}`);
  chk("J1.A3", !/<b>/i.test(htmlA) && /&lt;b&gt;ทีมขาย&lt;\/b&gt;/.test(htmlA), `composer path: HTML typed by staff stays text (no injected tag)`);
  chk("J1.A4", String(rowA?.bodyText ?? "").includes(URL1) && String(rowA?.bodyText ?? "").includes(`It's "ok"`) && !/&#39;|&quot;|<a /.test(String(rowA?.bodyText ?? "")), `composer path: stored plain-text alternative reads naturally — ${JSON.stringify(rowA?.bodyText)}`);
  chk("J1.A5", /<\/a>\.<br>|<\/a>\.</.test(String(rowA?.bodyHtml ?? "")), `composer path: the full stop after the URL stays outside the link — ${String(rowA?.bodyHtml ?? "").slice(0, 240)}`);

  // ── Path B: automation SEND_EMAIL (same plain-text body) ──
  const rB = await AUTO.CRM_DEFAULT_DEPS.email({ tenantId: env.tenantId, systemId: env.SYS, contactId: created.contact, subject: `กฎ ${TAG}`, body: TEXT });
  const rowB = await prisma.crmEmailMessage.findFirst({ where: { tenantId: env.tenantId, contactId: created.contact, subject: `กฎ ${TAG}` }, select: { id: true, routing: true, bodyHtml: true } });
  if (rowB) created.emails.push(rowB.id);
  const linksB = ((rowB?.routing as Any)?.links ?? []) as Any[];
  chk("J1.B1", !!rB?.ok && linksB.length === 1 && linksB[0]?.url === URL1, `automation SEND_EMAIL: the URL in the rule body is click-tracked — ok=${rB?.ok} ${rB?.error ?? ""} links=${JSON.stringify(linksB)}`);
  chk("J1.B2", !/<b>/i.test(String(rowB?.bodyHtml ?? "")), `automation SEND_EMAIL: body stays escaped text`);
} finally {
  for (const id of created.emails) {
    await prisma.crmEmailEvent?.deleteMany?.({ where: { emailId: id } }).catch(() => {});
    await prisma.crmEmailMessage.deleteMany({ where: { id } }).catch((e: Any) => console.log(`   cleanup email ${id}: ${e?.message}`));
  }
  if (created.contact) {
    await prisma.crmActivity.deleteMany({ where: { contactId: created.contact } }).catch(() => {});
    await prisma.crmContactConsent?.deleteMany?.({ where: { contactId: created.contact } }).catch(() => {});
    await prisma.crmContact.deleteMany({ where: { id: created.contact } }).catch((e: Any) => console.log(`   cleanup contact: ${String(e?.message).slice(0, 200)} — archived instead`));
    const left = await prisma.crmContact.count({ where: { id: created.contact } });
    if (left) await prisma.crmContact.update({ where: { id: created.contact }, data: { archivedAt: new Date() } }).catch(() => {});
    console.log(`   cleanup: contact ${left ? "archived (FK)" : "deleted"} · ${created.emails.length} messages deleted`);
  }
  await prisma.$disconnect();
}
console.log(`\nJ1 send probe: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
