// C5.5-fix4 REVIEW — DB probe (QC3 only): (I) the 1 MB inbound HTML cap end-to-end through emails.ingestInbound (what is
// stored), attack HTML through the real ingest, wall time of pathological 3–5 MB bodies; (B) PART B account lookups —
// angles the builder's probe did not cover: cross-tenant, trimming, excludeId, archived rows, `_` literal + case, backslash.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf4/review/rv-cf4-db.mts
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

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual.slice(0, 1200)}`);
};
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
const j = (v: unknown) => JSON.stringify(v);

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-rvcf4-${rand}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const SYSTEMS: string[] = [];

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const svc = (await import("@/lib/modules/account/service" as string)) as Any;
  const product = (await import("@/lib/modules/account/product" as string)) as Any;

  const T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  TENANTS.push(T);
  const T2 = (await P.tenant.create({ data: { name: `${TAG}-b`, slug: `${TAG}-b` } })).id as string;
  TENANTS.push(T2);

  // ═══════════════ I · inbound cap through the real ingestInbound ═══════════════
  await sub("I", async () => {
    const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
    const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
    SYSTEMS.push(S);
    const crm = { uiVersion: 2, bridgesEnabled: true, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } };
    await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`, JSON.stringify(crm), S);
    const INBOX = `crm+${KEY}@shark.in.th`;
    const party = await P.party.create({ data: { tenantId: T, name: `cust ${TAG}`, kind: "PERSON" } });
    await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `cust ${TAG}`, firstName: "cust", partyId: party.id, ownerUserId: u.id, email: `cust-${rand}@probe.test` } });
    let n = 0;
    const deps = { transport: async () => ({ ok: true, id: `copy-${++n}` }) };
    const ingest = async (html: string, text = "", fromN = 0) => {
      const t = performance.now();
      const r = await CRM.emails.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from: `cust${fromN || ""}-${rand}@probe.test`, to: [INBOX], cc: [], subject: `rv ${n}`, text, html, headers: {}, attachments: [] }, deps);
      const ms = performance.now() - t;
      const row = r?.emailId ? await P.crmEmailMessage.findUnique({ where: { id: r.emailId }, select: { bodyHtml: true, bodyText: true, snippet: true } }) : null;
      return { r, row, ms };
    };
    const filler = "x".repeat(1_100_000);
    const big = await ingest(`<p>HEADMARK</p>${filler}<p>TAILMARK</p>`);
    chk("I1", "html of 1.1 MB: stored bodyHtml and bodyText keep the head but NOT the tail beyond 1 000 000 chars (cap applies to both sanitize and htmlToText)",
      big.r?.handled && big.row && big.row.bodyHtml.includes("HEADMARK") && !big.row.bodyHtml.includes("TAILMARK") && big.row.bodyText.includes("HEADMARK") && !big.row.bodyText.includes("TAILMARK") && big.row.bodyHtml.length <= 1_000_100,
      `handled=${big.r?.handled} reason=${big.r?.reason} htmlLen=${big.row?.bodyHtml?.length} textLen=${big.row?.bodyText?.length} head=${big.row?.bodyHtml?.includes("HEADMARK")} tail=${big.row?.bodyHtml?.includes("TAILMARK")}/${big.row?.bodyText?.includes("TAILMARK")} ms=${big.ms.toFixed(0)}`);
    const small = await ingest(`<p>HEADMARK</p>${"x".repeat(900_000)}<p>TAILMARK</p>`, "", 1);
    chk("I1.ctl", "positive control: html of 0.9 MB keeps the tail (nothing else truncates below the cap)",
      small.r?.handled && small.row?.bodyHtml?.includes("TAILMARK") && small.row?.bodyText?.includes("TAILMARK"), `handled=${small.r?.handled} reason=${small.r?.reason} tail=${small.row?.bodyHtml?.includes("TAILMARK")}/${small.row?.bodyText?.includes("TAILMARK")}`);
    const atk = await ingest(`<svg/onload=alert(1)><a/href=javascript:alert(1)>a</a><img src=x onerror=alert(1)><img src="https://i.example/p.png" onerror="alert(1)"><x-y onclick=alert(1)>z</x-y><a href="https://ok.example/?a=1&amp;b=2">ok</a>`, "", 2);
    const h = String(atk.row?.bodyHtml ?? "");
    chk("I2", "attack HTML through the real ingest: stored html has no svg / custom tag / on*= attribute / javascript: href · keeps the https link (decoded once, re-escaped once) and the https img without onerror",
      atk.r?.handled && !/<svg|<x-y|javascript:/i.test(h) && !/<[^>]*\son[a-z]+=/i.test(h.replace(/"[^"]*"/g, '""')) && h.includes(`<a href="https://ok.example/?a=1&amp;b=2" rel="noopener" target="_blank">ok</a>`) && h.includes(`<img src="https://i.example/p.png">`),
      j(h));
    const slowA = await ingest("<a" + " ".repeat(5_000_000), "", 3);
    const slowB = await ingest("<".repeat(3_000_000), "", 4);
    chk("I3", "pathological 5 MB `<a`+spaces and 3 MB `<`×n through the whole ingest (incl. DB writes): each < 4 s wall time on this box",
      slowA.ms < 4000 && slowB.ms < 4000, `a+spaces=${slowA.ms.toFixed(0)}ms(handled=${slowA.r?.handled} htmlLen=${slowA.row?.bodyHtml?.length ?? 0}) lt=${slowB.ms.toFixed(0)}ms(handled=${slowB.r?.handled} htmlLen=${slowB.row?.bodyHtml?.length ?? 0})`);
  });

  // ═══════════════ B · PART B account lookups ═══════════════
  await sub("B", async () => {
    const S = (await P.appSystem.create({ data: { tenantId: T, type: "ACCOUNT", name: `${TAG} acc` }, select: { id: true } })).id as string;
    const S2 = (await P.appSystem.create({ data: { tenantId: T2, type: "ACCOUNT", name: `${TAG} acc b` }, select: { id: true } })).id as string;
    const C = async (tenantId: string, systemId: string, name: string, extra: Record<string, unknown> = {}) =>
      (await P.accountContact.create({ data: { tenantId, systemId, name, ...extra }, select: { id: true, name: true } })) as { id: string; name: string };
    const under = await C(T, S, `Acme_Co ${rand}`);
    const look = await C(T, S, `AcmexCo ${rand}`);
    const bs = await C(T, S, `Back\\Slash ${rand}`);
    await C(T, S, `BackSlash ${rand}`);
    await C(T, S, `Gone ${rand}`, { archivedAt: new Date() });
    await C(T2, S2, `OnlyInB ${rand}`);
    await C(T2, S2, `Acme_Co ${rand}`);

    const r1 = await svc.findContactForImport(T, S, { name: `acme_co ${rand.toUpperCase()}` });
    const r2 = await svc.findContactForImport(T, S, { name: `   ACME_CO ${rand}   ` });
    chk("B1", "import lookup: other-case name with a literal `_` ⇒ that contact (not the `x` look-alike) · surrounding spaces trimmed as before",
      r1?.id === under.id && r2?.id === under.id, `r1=${r1?.name ?? "null"} r2=${r2?.name ?? "null"} lookalike=${look.name}`);
    const r3 = await svc.findContactForImport(T, S, { name: `OnlyInB ${rand}` });
    const r4 = await svc.findContactForImport(T, S, { name: `Gone ${rand}` });
    const r5 = await svc.findContactForImport(T, S, { name: "   " });
    chk("B2", "import lookup: name that exists only in another tenant ⇒ null · archived ⇒ null · blank ⇒ null", r3 === null && r4 === null && r5 === null, `cross=${r3?.name ?? "null"} archived=${r4?.name ?? "null"} blank=${r5?.name ?? "null"}`);
    const r6 = await svc.findContactForImport(T, S, { name: `back\\slash ${rand}` });
    chk("B3", "import lookup: stored `Back\\Slash` found by other case of itself, NOT confused with `BackSlash`", r6?.id === bs.id, `got=${r6?.name ?? "null"}`);

    const d1 = await svc.checkContactDuplicates(T, S, { name: `acme_co ${rand}` });
    const d2 = await svc.checkContactDuplicates(T, S, { name: `acme_co ${rand}`, excludeId: under.id });
    const d3 = await svc.checkContactDuplicates(T, S, { name: null });
    const d4 = await svc.checkContactDuplicates(T, S, { name: `OnlyInB ${rand}` });
    chk("B4", "dupe check: other case ⇒ exactly the `_` contact as a name warning · excludeId suppresses it · null name ⇒ nothing · other tenant's name ⇒ nothing",
      d1.warnings.length === 1 && d1.warnings[0].id === under.id && d1.warnings[0].reason === "name" && d2.warnings.length === 0 && d3.warnings.length + d3.blocking.length === 0 && d4.warnings.length === 0,
      `d1=${j(d1.warnings.map((w: Any) => [w.name, w.reason]))} d2=${d2.warnings.length} d3=${d3.warnings.length + d3.blocking.length} d4=${d4.warnings.length}`);

    const Pr = async (tenantId: string, systemId: string, name: string, sku: string | null) =>
      (await P.accountProduct.create({ data: { tenantId, systemId, name, sku }, select: { id: true } })) as { id: string };
    const pu = await Pr(T, S, `Mask_Pro ${rand}`, `SKU_1-${rand}`);
    await Pr(T, S, `MaskxPro ${rand}`, `SKUx1-${rand}`);
    await Pr(T2, S2, `Mask_Pro ${rand}`, `SKU_1-${rand}`);
    const p1 = await product.checkProductDuplicates(T, S, { sku: `sku_1-${rand}` });
    const p2 = await product.checkProductDuplicates(T, S, { name: `MASK_PRO ${rand}` });
    const p3 = await product.checkProductDuplicates(T, S, { name: `mask_pro ${rand}`, excludeId: pu.id });
    const p4 = await product.checkProductDuplicates(T, S, { name: " ", sku: "" });
    chk("B5", "product dupes: sku other case ⇒ only `SKU_1` (sku) · name other case ⇒ only `Mask_Pro` (name) · excludeId ⇒ none · blank ⇒ [] · other tenant never",
      p1.length === 1 && p1[0].id === pu.id && p1[0].reason === "sku" && p2.length === 1 && p2[0].id === pu.id && p2[0].reason === "name" && p3.length === 0 && p4.length === 0,
      `p1=${j(p1.map((x: Any) => x.reason))} p2=${j(p2.map((x: Any) => x.reason))} p3=${p3.length} p4=${p4.length}`);
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
  chk("CLEAN", "throwaway tenants, users, systems, rate buckets removed (0 rows left)", left.length === 0 && buckets === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `${left.join(" · ") || "-"} buckets=${buckets}`);
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} rv-cf4-db: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => x.id) })}`);
process.exit(0);
