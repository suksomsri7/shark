// C5.5-fix5 — DB probe (QC3 only · own throwaway tenant/users/systems · cleaned up): the review C5.5-fix4 findings end to end.
//   RV-1  sendCrmEmailAction catch path on a `<`-only bodyHtml (the action is called outside a request ⇒ session() throws ⇒
//         the catch path runs — exactly the path the review measured) · growth n → 4n · oversized bodyHtml answered up front
//   RV-2  emails.ingestInbound with a pathological From / References (real CRM v2 system with inbound on) · growth n → 4n ·
//         1 MB From / To item / References handled fast · normal mail stored with the same From/To/Cc/name/threading fields as
//         the base run (snapshot) · board mail-in (kanban ingestInboundEmail) with a pathological From · growth
//   RV-4  setUserSetting signature: stored HTML always well-formed (no tag cut) · over-long input refused
// Timing checks compare growth between two sizes (robust to machine load), not absolute ms.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf6/probe-cf6-db.mts <label> [baseLabel]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const LABEL = process.argv[2] ?? "run";
const BASE = process.argv[3] ?? null;
mkdirSync("/tmp/cf6-logs", { recursive: true });

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
if (!/weathered-river/.test(String(env?.host ?? process.env.DATABASE_URL ?? ""))) { console.error("🔴 not QC3 — stop"); process.exit(4); }
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async (url: Any) => {
  if (!String(url).startsWith("https://api.resend.com/")) throw new Error("probe: network blocked");
  return new Response(JSON.stringify({ id: `re_${randomBytes(6).toString("hex")}` }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1500)}`);
};
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const j = (v: unknown) => JSON.stringify(v);
type G = { a: number; b: number; ratio: number; linear: boolean };
const gs = (g: G) => `n: ${g.a.toFixed(1)} ms → 4n: ${g.b.toFixed(1)} ms (×${g.ratio.toFixed(1)})`;
async function growth(f: (n: number) => Promise<unknown>, n: number): Promise<G> {
  await f(n); // warm-up
  const t = async (m: number) => { let b = Infinity; for (let k = 0; k < 2; k++) { const a = performance.now(); await f(m); const d = performance.now() - a; b = Math.min(b, d); if (d > 400) break; } return b; };
  const a = await t(n);
  const b = await t(4 * n);
  // end-to-end calls carry DB round trips (constant per call) — linear ⇒ ratio ≤ 4; quadratic ⇒ ≈ 16
  const ratio = b / Math.max(a, 0.5);
  return { a, b, ratio, linear: ratio < 6 || b - a < 40 };
}

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf6-${rand}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];
const snap: Record<string, unknown> = {};
const SCRUB: [string, string][] = []; // per-run random values → fixed tokens (so two runs compare)

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  SYSTEMS.push(S);
  const crmSettings = { uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crmSettings), S);
  const INBOX = `crm+${KEY}@shark.in.th`;
  SCRUB.push([KEY, "INBOXKEY"]);
  const party = await P.party.create({ data: { tenantId: T, name: `cust ${TAG}`, kind: "PERSON" } });
  const contact = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `cust ${TAG}`, firstName: "cust", partyId: party.id, ownerUserId: u.id, email: `cust-${rand}@probe.test` } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  // ═══════════════ RV-1 · sendCrmEmailAction catch path ═══════════════
  await sub("RV1", async () => {
    const ACT = (await import("@/lib/modules/crm/emails-actions" as string)) as Any;
    const call = (bodyHtml: string, extra: Record<string, unknown> = {}) => ACT.sendCrmEmailAction(S, { contactId: contact.id, subject: "probe", bodyHtml, ...extra });
    const g = await growth((n) => call("<".repeat(n)), 8000);
    chk("RV1.G", "action with bodyHtml `<`×n, failing request (no session) — catch path grows linearly (review: ×4.85 per doubling)", g.linear, gs(g));
    if (g.linear) {
      const t0 = performance.now();
      const big = await call("<".repeat(5_000_000));
      const ms = performance.now() - t0;
      const msgs = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
      chk("RV1.cap", "bodyHtml of 5 MB `<` ⇒ refused up front with the body-too-long message under the body field (same rule/message as bodyText), well under a second",
        big?.ok === false && big.code === "VALIDATION" && big.error === msgs.CRM_EMAIL_BODY_TOO_LONG_MSG && big.fieldErrors?.body === msgs.CRM_EMAIL_BODY_TOO_LONG_MSG && ms < 1000, `${j(big).slice(0, 300)} ms=${ms.toFixed(0)}`);
      const atCap = await call("x".repeat(msgs.CRM_EMAIL_BODY_MAX_BYTES));
      chk("RV1.cap.edge", "bodyHtml exactly at the 500 KiB limit is NOT refused up front (reaches the session gate like before)", !(atCap?.code === "VALIDATION" && atCap?.error === msgs.CRM_EMAIL_BODY_TOO_LONG_MSG), j(atCap).slice(0, 200));
    } else chk("RV1.cap", "skipped (catch path is quadratic — a 5 MB body would take hours)", false, "-");
    // shapes for normal bodies (no session ⇒ same failure as before; compared with the base run)
    const shapes: Record<string, unknown> = {};
    for (const [k, b] of Object.entries({ empty: "", blank: "   ", para: "<p>สวัสดีครับ</p>", tagsOnly: "<p> </p><br>", text: "plain" })) shapes[k] = await call(b);
    shapes.bodyText = await ACT.sendCrmEmailAction(S, { contactId: contact.id, subject: "probe", bodyText: "hello" });
    snap.actionShapes = shapes;
  });

  // ═══════════════ RV-2 · ingestInbound ═══════════════
  await sub("RV2", async () => {
    let n = 0;
    const deps = { transport: async () => ({ ok: true, id: `copy-${++n}` }) };
    const ingest = (over: Record<string, unknown>) =>
      CRM.emails.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from: `cust-${rand}@probe.test`, to: [INBOX], cc: [], subject: `rv2 ${n}`, text: "body", html: "", headers: {}, attachments: [], ...over }, deps);
    const gF = await growth((m) => ingest({ from: "<".repeat(m) }), 8000);
    chk("RV2.from.G", "ingestInbound with From = `<`×n (no `>`): whole ingest grows linearly (review: bareEmail + displayNameOf quadratic before the sender bucket)", gF.linear, gs(gF));
    const gR = await growth((m) => ingest({ headers: { references: "<".repeat(m), "in-reply-to": "<".repeat(m) } }), 8000);
    chk("RV2.refs.G", "ingestInbound with References/In-Reply-To = `<`×n: grows linearly", gR.linear, gs(gR));
    if (gF.linear && gR.linear) {
      const t0 = performance.now();
      const r1 = await ingest({ from: "<".repeat(1_000_000), to: ["<".repeat(1_000_000), INBOX], cc: ["<".repeat(1_000_000)], headers: { references: "<".repeat(1_000_000), "authentication-results": "a".repeat(1_000_000) } });
      const ms = performance.now() - t0;
      chk("RV2.big", "1 MB From + 1 MB To item + 1 MB Cc item + 1 MB References + 1 MB Authentication-Results ⇒ answered fast, mail still routed to the CRM inbox (the long To item is ignored, the real one kept), never throws",
        r1?.ok === true && ms < 3000, `${j(r1)} ms=${ms.toFixed(0)}`);
    } else chk("RV2.big", "skipped (quadratic — 1 MB headers would take minutes)", false, "-");
    // normal mail: stored fields identical to the base run
    const normal: Record<string, unknown> = {};
    const cases: Record<string, Record<string, unknown>> = {
      thai: { from: `"สมชาย ใจดี" <Cust-${rand}@Probe.TEST>` },
      bare: { from: `cust-${rand}@probe.test` },
      angleOnly: { from: `<cust-${rand}@probe.test>` },
      comment: { from: `cust-${rand}@probe.test (สมชาย)` },
      nameNoSpace: { from: `Somchai<cust-${rand}@probe.test>`, cc: [`"A, B" <a-${rand}@probe.test>`, `b-${rand}@probe.test`] },
      threaded: { from: `Somchai <cust-${rand}@probe.test>`, headers: { "in-reply-to": `<parent-${rand}@probe.test>`, references: `<root-${rand}@probe.test> <parent-${rand}@probe.test>` } },
      stranger: { from: `"Stranger Danger" <stranger-${rand}@elsewhere.test>`, to: [`"CRM" <${INBOX}>`, `other-${rand}@probe.test`] },
    };
    for (const [k, over] of Object.entries(cases)) {
      const r = await ingest(over);
      const row = r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { fromAddr: true, fromName: true, toAddrs: true, ccAddrs: true, inReplyTo: true, references: true, direction: true, matchedBy: true, contactId: true, subject: true } }) : null;
      normal[k] = { ok: r?.ok, handled: r?.handled, reason: r?.reason ?? null, row: row ? { ...row, contactId: row.contactId ? (row.contactId === contact.id ? "CONTACT" : "OTHER") : null, subject: String(row.subject).replace(/\d+$/, "#") } : null };
    }
    snap.ingestNormal = normal;
    chk("RV2.normal", "normal mail (Thai quoted name · bare · <addr> · comment · name<addr> + Cc · threaded · stranger with display-name To) ingested and stored with the expected From fields",
      (normal.thai as Any)?.row?.fromName === "สมชาย ใจดี" && (normal.thai as Any)?.row?.fromAddr === `cust-${rand}@probe.test` && (normal.threaded as Any)?.row?.inReplyTo === `parent-${rand}@probe.test` && (normal.stranger as Any)?.handled === true,
      j(normal).slice(0, 1400));
  });

  // ═══════════════ RV-2 · board mail-in (kanban ingestInboundEmail) ═══════════════
  await sub("RV2K", async () => {
    const KS = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
    SYSTEMS.push(KS);
    const KSVC = (await import("@/lib/modules/kanban/service" as string)) as Any;
    const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Any;
    const em = (await import("@/lib/platform/kanban-email-in" as string)) as Any;
    const board = await KSVC.createBoard({ tenantId: T, systemId: KS, name: `${TAG} b`, createdById: u.id });
    const BKEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    await P.kanbanBoard.update({ where: { id: board.id }, data: { emailKey: BKEY } });
    SCRUB.push([BKEY, "BOARDKEY"]);
    await integ.setIntegrations({ tenantId: T, systemId: KS, actorUserId: u.id }, { ...owner, unitAccess: ["*"] }, { cardFromEmail: { enabled: true } });
    let n = 0;
    const fakeUpload = async () => ({ storageKey: `t/${T}/x`, url: "https://cdn.example.test/x", bytes: 1 });
    const mail = (over: Record<string, unknown>) => em.ingestInboundEmail({ messageId: `<${TAG}-k${++n}@probe.test>`, to: [`งาน+${BKEY}@shark.in.th`], from: `x-${rand}@probe.test`, subject: `k ${n}`, text: "t", ...over }, { upload: fakeUpload });
    const probeOk = await mail({});
    const g = await growth((m) => mail({ from: "<".repeat(m) }), 8000);
    chk("RV2K.G", "board mail-in with From = `<`×n: grows linearly (kanban-email-in bareEmail was /<([^>]+)>/ on the raw From)", probeOk?.ok === true && g.linear, `fixture=${j(probeOk)} ${gs(g)}`);
    const norm: Record<string, unknown> = {};
    for (const [k, from] of Object.entries({ quoted: `"สมชาย" <X-${rand}@Probe.test>`, bare: `x-${rand}@probe.test`, multi: `a <b> <x-${rand}@probe.test>` })) {
      const r = await mail({ from });
      const card = r?.cardId ? await P.kanbanCard.findUnique({ where: { id: r.cardId }, select: { title: true, description: true } }) : null;
      norm[k] = { ok: r?.ok, created: r?.created, desc: card?.description ?? null };
    }
    snap.boardNormal = norm;
  });

  // ═══════════════ RV-4 · signature ═══════════════
  await sub("RV4", async () => {
    const tail = `<a href="https://shop.example.com/very/long/path?with=query&and=more">ร้านของเรา</a>`;
    const sig = "ก".repeat(4000 - tail.length - 5) + tail; // input 3 995 chars (≤ 4 000) · sanitized output > 4 000 (href gets &amp;, rel/target added)
    const before = sig.length;
    let stored: string | null = null;
    let err = "";
    try { stored = (await CRM.emails.setUserSetting(ctx, owner, { signatureHtml: sig }))?.signatureHtml ?? null; } catch (e) { err = e instanceof Error ? e.message : String(e); }
    const row = await P.crmEmailUserSetting.findFirst({ where: { systemId: S, userId: u.id }, select: { signatureHtml: true } });
    const html = String(row?.signatureHtml ?? stored ?? "");
    const lastLt = html.lastIndexOf("<");
    const wellFormed = !!html && lastLt < html.lastIndexOf(">") && (html.match(/<a\b/g) ?? []).length === (html.match(/<\/a>/g) ?? []).length;
    chk("RV4.form", `signature of ${before} chars whose sanitized form exceeds 4 000: stored HTML is well-formed (no tag cut in half · every <a> closed)`, wellFormed, `err=${err} len=${html.length} tail=${j(html.slice(-120))}`);
    let tooLong = "";
    // r2 (review RV5-1): the input bound is CRM_EMAIL_SIGNATURE_INPUT_MAX (16 000 · the stored cap 8 000 applies after sanitising) — 4 000 on round 1
    const SH = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
    const inMax = Number(SH.CRM_EMAIL_SIGNATURE_INPUT_MAX ?? 4000);
    try { await CRM.emails.setUserSetting(ctx, owner, { signatureHtml: "x".repeat(inMax + 1) }); } catch (e) { tooLong = e instanceof Error ? `${(e as Any).code ?? ""} ${e.message}` : String(e); }
    chk("RV4.cap", `signature input over the input bound (${inMax}) is refused with a validation message (same bound as the REST op)`, /VALIDATION/.test(tooLong), tooLong || "accepted");
    const small = await CRM.emails.setUserSetting(ctx, owner, { signatureHtml: "<p>สมชาย · ฝ่ายขาย</p><p><a href=\"https://ex.com/?a=1&amp;b=2\">เว็บ</a></p>" });
    snap.signatureSmall = small?.signatureHtml ?? null;
  });
} finally {
  await new Promise((r) => setTimeout(r, 1_500));
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  for (const T of TENANTS) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (const sid of SYSTEMS) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${sid}%`).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${T}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) { const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[]; if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`); }
  }
  for (const uid of USERS) { await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined); await P.user.delete({ where: { id: uid } }).catch(() => undefined); }
  const buckets = SYSTEMS.length ? Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, SYSTEMS.map((s) => `%${s}%`))) as Any[])[0]?.n ?? 0) : 0;
  chk("CLEAN", "throwaway tenant, users, systems, rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  // snapshot: normalise the per-run random tag so two runs compare
  const norm = (v: unknown) => JSON.parse([[TAG, "TAG"], [rand, "RAND"], ...SCRUB].reduce((s, [a, b]) => s.split(a as string).join(b as string), JSON.stringify(v)));
  writeFileSync(`/tmp/cf6-logs/dbsnap-${LABEL}.json`, JSON.stringify(norm(snap), null, 1));
  if (BASE && existsSync(`/tmp/cf6-logs/dbsnap-${BASE}.json`)) {
    const base = JSON.parse(readFileSync(`/tmp/cf6-logs/dbsnap-${BASE}.json`, "utf8")) as Record<string, unknown>;
    const now = norm(snap) as Record<string, unknown>;
    const diff = Object.keys(base).filter((k) => j(base[k]) !== j(now[k]));
    chk("SNAP", `normal inputs behave exactly as in the ${BASE} run (action failure shapes · stored inbound From/To/Cc/name/threading · board cards · small signature)`, diff.length === 0, `differ: ${diff.map((k) => `${k}: base=${j(base[k]).slice(0, 400)} now=${j(now[k]).slice(0, 400)}`).join(" || ")}`);
  }
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf6-db (${LABEL}): ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ probe: "probe-cf6-db", label: LABEL, total: cks.length, passed, failed: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);
