// C5.5-fix5 INDEPENDENT REVIEW — DB probe (QC3 only · own throwaway tenant/user/system · cleaned up).
//   SIG   the new signature cap is checked on the INPUT, but the stored value is the sanitized (longer) HTML ⇒ a signature that is
//         accepted once can no longer be re-saved by the screen that edits it (MySendingCard sends the stored HTML back on every
//         save, also when only the sender name changes) and a REST GET → PUT round trip fails optText(4000)
//   CAP   what the "drop over-long header" rule does downstream in emails.ingestInbound: From > 998 (sender dropped → attribution),
//         CRM inbox To item > 998 (routing), Message-ID > 998 (mail refused), joined Authentication-Results > 16 KiB (proof dropped
//         ⇒ fail-closed), References > 16 KiB with In-Reply-To kept (threading)
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/review/rv-cf6-db.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(env?.host ?? process.env.DATABASE_URL ?? ""))) { console.error("🔴 not QC3 — stop"); process.exit(4); }
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
process.env.CRM_INBOUND_AUTHSERV_ID = "mx.rv-cf6.test";

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`);
};
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const j = (v: unknown) => JSON.stringify(v);

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-rvcf6-${rand}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SAN = (await import("@/lib/core/sanitize" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const u = await P.user.create({ data: { email: `${TAG}-owner@rvcf6.test`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  const crmSettings = { uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crmSettings), S);
  const INBOX = `crm+${KEY}@shark.in.th`;
  const party = await P.party.create({ data: { tenantId: T, name: `cust ${TAG}`, kind: "PERSON" } });
  const CUST = `cust-${rand}@probe.test`;
  const contact = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `cust ${TAG}`, firstName: "cust", partyId: party.id, ownerUserId: u.id, email: CUST } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  // ═══════════════ SIG ═══════════════
  await sub("SIG", async () => {
    const link = `<a href="https://shop.example.com/p?a=1&b=2">ร้าน</a>`;
    let input = "";
    for (let i = 0; ; i++) { const next = input + `<p>บรรทัด ${i} ${link}</p>`; if (next.length > 4000) break; input = next; }
    const san = SAN.sanitizeHtml(input) as string;
    const first = await CRM.emails.setUserSetting(ctx, owner, { signatureHtml: input });
    const stored = String(first?.signatureHtml ?? "");
    chk("SIG.0", `fixture: input ${input.length} chars (≤ 4 000) is accepted and stored sanitized at ${stored.length} chars (> 4 000)`, input.length <= 4000 && stored.length > 4000 && stored === san, `input=${input.length} stored=${stored.length} sanitize(input)=${san.length}`);
    // MySendingCard.save(): { fromName, replyToMode, replyToAddr, signatureHtml: <the stored HTML it was loaded with> }
    let err = "";
    let res: Any = null;
    try { res = await CRM.emails.setUserSetting(ctx, owner, { fromName: "ชื่อใหม่", signatureHtml: stored }); } catch (e) { err = `${(e as Any).code ?? ""} ${e instanceof Error ? e.message : String(e)}`; }
    chk("SIG.resave", "FINDING: re-saving the settings card unchanged except the sender name (the card always sends the stored signature back) is refused with the signature-length message", /VALIDATION/.test(err) && /ลายเซ็น/.test(err), err || `accepted: ${j(res).slice(0, 200)}`);
    const idem = SAN.sanitizeHtml(stored) as string;
    chk("SIG.idem", "sanitizeHtml is idempotent on the stored signature (so a cap on the sanitized length would accept the round trip)", idem === stored, `sanitize(stored)=${idem.length} stored=${stored.length}`);
    const row = await P.crmEmailUserSetting.findFirst({ where: { systemId: S, userId: u.id }, select: { fromName: true } });
    chk("SIG.lost", "FINDING: the sender-name change from that save was not stored", row?.fromName !== "ชื่อใหม่", j(row));
  });

  // ═══════════════ CAP ═══════════════
  await sub("CAP", async () => {
    let n = 0;
    const deps = { transport: async () => ({ ok: true, id: `copy-${++n}` }) };
    const ingest = (over: Record<string, unknown>) =>
      CRM.emails.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from: CUST, to: [INBOX], cc: [], subject: `cap ${n}`, text: "body", html: "", headers: {}, attachments: [], ...over }, deps);
    const rowOf = async (r: Any) => (r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { fromAddr: true, fromName: true, contactId: true, direction: true, threadKey: true, inReplyTo: true, references: true, routing: true } }) : null);

    const longName = `"${"ส".repeat(1000)}" <${CUST}>`;
    const r1 = await ingest({ from: longName });
    const row1 = await rowOf(r1);
    chk("CAP.from", "From > 998 chars with a real address inside: the sender is dropped (stored fromAddr empty · not attributed to the contact) — base attributed it", r1?.ok === true && row1?.fromAddr === "" && row1?.contactId === null, `res=${j(r1)} row=${j(row1)}`);

    const r2 = await ingest({ to: [`"${"x".repeat(1000)}" <${INBOX}>`] });
    chk("CAP.to", "CRM inbox To item > 998 (long display name) ⇒ refused as invalid (base: routed to the inbox)", r2?.ok === false && r2?.reason === "invalid", j(r2));

    const r3 = await ingest({ messageId: `<${"m".repeat(1000)}@probe.test>` });
    chk("CAP.msgid", "Message-ID > 998 ⇒ refused as invalid (no dedupe collision possible: nothing stored)", r3?.ok === false && r3?.reason === "invalid", j(r3));

    const STAFF = `${TAG}-owner@rvcf6.test`;
    const real = "mx.rv-cf6.test; dmarc=pass header.from=rvcf6.test";
    const r4a = await ingest({ from: STAFF, to: [INBOX, CUST], headers: { "authentication-results": real } });
    const row4a = await rowOf(r4a);
    const r4b = await ingest({ from: STAFF, to: [INBOX, CUST], headers: { "authentication-results": `${real}\n${"other.mta; spf=none ".repeat(900)}` } });
    const row4b = await rowOf(r4b);
    chk("CAP.ar", "positive control: staff BCC copy with our A-R ⇒ OUT · same mail whose joined A-R > 16 KiB ⇒ proof dropped ⇒ IN (fail-closed, never the reverse)", row4a?.direction === "OUT" && row4b?.direction === "IN", `short=${j(row4a?.direction)} long=${j(row4b?.direction)} ${j(r4b)}`);
    const r4c = await ingest({ from: STAFF, to: [INBOX, CUST], headers: { "authentication-results": `${real}\n${"mx.rv-cf6.test; dmarc=pass header.from=rvcf6.test ".repeat(400)}` } });
    const row4c = await rowOf(r4c);
    chk("CAP.ar.forged", "forged duplicates of our A-R padded past 16 KiB do not authenticate", row4c?.direction !== "OUT", j(row4c?.direction));

    const pid = `${TAG}-parent@probe.test`;
    const parentMsg = await ingest({ messageId: `<${pid}>` });
    const parentRow = await P.crmEmailMessage.findUnique({ where: { id: parentMsg.emailId }, select: { messageId: true, threadKey: true } });
    const r5 = await ingest({ headers: { "in-reply-to": `<${pid}>`, references: Array.from({ length: 400 }, (_, i) => `<ref-${i}-${"r".repeat(40)}@probe.test>`).join(" ") } });
    const row5 = await rowOf(r5);
    chk("CAP.refs", "References > 16 KiB is dropped but In-Reply-To still threads the reply", row5?.threadKey === parentRow?.threadKey, `parent=${parentRow?.threadKey} reply=${row5?.threadKey} storedMsgId=${parentRow?.messageId}`);
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_500));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const T of TENANTS) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
  const buckets = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, SYSTEMS.map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  chk("CLEAN", "throwaway tenant, user, system, rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} rv-cf6-db: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "rv-cf6-db", total: cks.length, passed, failed: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);
