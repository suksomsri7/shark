// C5.5-fix4 probe B — the 4 account case-insensitive equality sites (OWED by F15 until this card) are wildcard-safe:
//   account/service.ts findContactForImport (import file → which existing contact a document is filed on)
//   account/service.ts checkContactDuplicates (name leg of the OR · rows returned by the DB, take 20)
//   account/product.ts checkProductDuplicates (name + sku legs · rows returned by the DB, take 20)
// Every site keeps EQUALITY semantics (case-insensitive, every character literal) — `%` / `_` / `\` in the input must
// not match other rows; the same name in another case and a stored literal `50%_off\x` must still match themselves.
// Run (QC3): bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf4/probe-cf4-ci.mts
// requires: QC3 env · throwaway tenant `qc-cf4-<rand>` (own ACCOUNT AppSystem, raw rows only — no seed) · CLEAN at the end
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
globalThis.fetch = (async () => { throw new Error("probe: network blocked"); }) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf4-${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const sub = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message} ${e.stack?.split("\n").slice(1, 3).join(" ") ?? ""}` : String(e)); } };
let T = "";

try {
  const svc = (await import("@/lib/modules/account/service" as string)) as Any;
  const product = (await import("@/lib/modules/account/product" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG }, select: { id: true } })).id as string;
  const S = (await P.appSystem.create({ data: { tenantId: T, type: "ACCOUNT", name: `${TAG} acc` }, select: { id: true } })).id as string;

  // fixtures (names carry the TAG so nothing outside this tenant can collide; every query is tenant+system scoped anyway)
  const C = async (name: string, extra: Record<string, unknown> = {}) =>
    (await P.accountContact.create({ data: { tenantId: T, systemId: S, name, ...extra }, select: { id: true, name: true } })) as { id: string; name: string };
  const dotted = await C(`บริษัท.ก ${TAG}`); // `_` look-alike target
  const acme = await C(`ACME Co ${TAG}`);
  const literal = await C(`50%_off\\x ${TAG}`); // a name that really contains % _ \
  const fillers: { id: string }[] = [];
  for (let i = 0; i < 24; i += 1) fillers.push(await C(`filler ${String(i).padStart(2, "0")} ${TAG}`));
  const phoneTarget = await C(`โทรตรง ${TAG}`, { phone: "0812345678", phoneNorm: "0812345678" }); // created LAST (behind 27 rows)

  const Pr = async (name: string, sku: string | null) =>
    (await P.accountProduct.create({ data: { tenantId: T, systemId: S, name, sku }, select: { id: true, name: true, sku: true } })) as { id: string; name: string; sku: string | null };
  const pDotted = await Pr(`ชุด.ดำน้ำ ${TAG}`, `SKU.A-${rand}`);
  const pAcme = await Pr(`Fins Pro ${TAG}`, `ABC-1-${rand}`);
  const pLiteral = await Pr(`100%_cotton\\y ${TAG}`, `50%_X\\${rand}`);
  for (let i = 0; i < 3; i += 1) await Pr(`pfill ${i} ${TAG}`, `PF${i}-${rand}`);

  // spy: rows the DB actually returned to the two duplicate checks (proves the SQL, not just the JS post-filter)
  const spy = (delegate: Any) => {
    const orig = delegate.findMany;
    const box = { rows: [] as Any[] };
    delegate.findMany = async (a: Any) => { const r = await orig.call(delegate, a); box.rows = r; return r; };
    return { box, restore: () => { delegate.findMany = orig; } };
  };

  await sub("B0", async () => {
    // premise: raw `{ equals, mode: insensitive }` really is an unescaped ILIKE on this DB (positive control for every check below)
    const rawPct = await P.accountContact.count({ where: { tenantId: T, systemId: S, name: { equals: "%", mode: "insensitive" } } });
    const rawUs = await P.accountContact.count({ where: { tenantId: T, systemId: S, name: { equals: `บริษัท_ก ${TAG}`, mode: "insensitive" } } });
    const rawSku = await P.accountProduct.count({ where: { tenantId: T, systemId: S, sku: { equals: "%", mode: "insensitive" } } });
    chk("B0.1", "premise: raw equals+insensitive treats `%` and `_` as wildcards (contacts `%` ≥ 28 · `บริษัท_ก` = 1 · product sku `%` ≥ 6)", rawPct >= 28 && rawUs === 1 && rawSku >= 6, `contacts%=${rawPct} บริษัท_ก=${rawUs} sku%=${rawSku}`);
  });

  await sub("B1", async () => {
    // findContactForImport — the import picks the existing contact for a document row
    const f = (name: string) => svc.findContactForImport(T, S, { name, taxId: null });
    const pct = await f("%");
    const us = await f(`บริษัท_ก ${TAG}`);
    const bs = await f(`50\\%\\_off\\\\x ${TAG}`); // pre-escaped input must not unescape into the literal row either
    chk("B1.1", "import name `%` ⇒ no contact (was: an arbitrary contact of the book)", pct === null, `got=${pct ? pct.name : "null"}`);
    chk("B1.2", "import name `บริษัท_ก …` ⇒ no contact (was: `บริษัท.ก …`)", us === null, `got=${us ? us.name : "null"}`);
    chk("B1.3", "import name with backslash-escaped wildcards ⇒ no contact", bs === null, `got=${bs ? bs.name : "null"}`);
    const ci = await f(`acme co ${TAG}`.toUpperCase());
    const lit = await f(`50%_OFF\\X ${TAG}`);
    const th = await f(`บริษัท.ก ${TAG}`);
    chk("B1.4", "positive: same name in another case ⇒ that contact · stored literal `50%_off\\x` in another case ⇒ itself · Thai exact ⇒ itself",
      ci?.id === acme.id && lit?.id === literal.id && th?.id === dotted.id, `acme=${ci?.id === acme.id} literal=${lit?.id === literal.id} thai=${th?.id === dotted.id}`);
  });

  await sub("B2", async () => {
    // checkContactDuplicates — name leg of the OR; the DB rows feed `take: 20`
    const s = spy(P.accountContact);
    try {
      const r1 = await svc.checkContactDuplicates(T, S, { name: "%" });
      const rows1 = s.box.rows.length;
      chk("B2.1", "dupe check name `%` ⇒ DB returns 0 rows · 0 warnings", rows1 === 0 && r1.warnings.length === 0 && r1.blocking.length === 0, `dbRows=${rows1} warnings=${r1.warnings.length}`);
      const r2 = await svc.checkContactDuplicates(T, S, { name: `บริษัท_ก ${TAG}` });
      chk("B2.2", "dupe check name `บริษัท_ก …` ⇒ DB returns 0 rows (was: `บริษัท.ก …`)", s.box.rows.length === 0 && r2.warnings.length === 0, `dbRows=${s.box.rows.length} warnings=${r2.warnings.length}`);
      // crowding: `%` used to fill take:20 with 27 unrelated rows ⇒ the real phone match (created last) could drop out
      const r3 = await svc.checkContactDuplicates(T, S, { name: "%", phone: "081-234-5678" });
      chk("B2.3", "dupe check name `%` + phone ⇒ exactly the phone match (no crowding of take 20)", s.box.rows.length === 1 && r3.warnings.length === 1 && r3.warnings[0].id === phoneTarget.id && r3.warnings[0].reason === "phone",
        `dbRows=${s.box.rows.length} warnings=${JSON.stringify(r3.warnings.map((w: Any) => w.reason))}`);
      const r4 = await svc.checkContactDuplicates(T, S, { name: `acme co ${TAG}` });
      const r5 = await svc.checkContactDuplicates(T, S, { name: `50%_OFF\\X ${TAG}` });
      chk("B2.4", "positive: other-case name ⇒ name warning on that contact · literal `%_\\` name ⇒ itself",
        r4.warnings.length === 1 && r4.warnings[0].id === acme.id && r4.warnings[0].reason === "name" && r5.warnings.length === 1 && r5.warnings[0].id === literal.id,
        `acme=${JSON.stringify(r4.warnings.map((w: Any) => w.id === acme.id))} literal=${JSON.stringify(r5.warnings.map((w: Any) => w.id === literal.id))}`);
    } finally { s.restore(); }
  });

  await sub("B3", async () => {
    // checkProductDuplicates — name + sku legs
    const s = spy(P.accountProduct);
    try {
      const a = await product.checkProductDuplicates(T, S, { name: "%" });
      const ra = s.box.rows.length;
      const b = await product.checkProductDuplicates(T, S, { sku: "%" });
      const rb = s.box.rows.length;
      const c = await product.checkProductDuplicates(T, S, { name: `ชุด_ดำน้ำ ${TAG}`, sku: `SKU_A-${rand}` });
      const rc = s.box.rows.length;
      chk("B3.1", "product dupe check name `%` / sku `%` / `_` look-alikes ⇒ DB returns 0 rows · 0 hits", ra === 0 && rb === 0 && rc === 0 && a.length + b.length + c.length === 0, `dbRows=${ra}/${rb}/${rc} hits=${a.length + b.length + c.length}`);
      const d = await product.checkProductDuplicates(T, S, { sku: `abc-1-${rand.toUpperCase()}` });
      const e = await product.checkProductDuplicates(T, S, { name: `100%_COTTON\\Y ${TAG}` });
      const g = await product.checkProductDuplicates(T, S, { sku: `50%_x\\${rand}` });
      const h = await product.checkProductDuplicates(T, S, { name: `ชุด.ดำน้ำ ${TAG}` });
      chk("B3.2", "positive: sku other case ⇒ sku hit · literal `%_\\` name and sku ⇒ themselves · Thai exact name ⇒ itself",
        d.length === 1 && d[0].id === pAcme.id && d[0].reason === "sku" && e.length === 1 && e[0].id === pLiteral.id && g.length === 1 && g[0].id === pLiteral.id && h.length === 1 && h[0].id === pDotted.id,
        `sku=${JSON.stringify(d.map((x: Any) => x.reason))} litName=${e.length} litSku=${g.length} thai=${h.length}`);
    } finally { s.restore(); }
  });
} finally {
  if (T) {
    await P.accountProduct.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.accountContact.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.accountSettings.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    const left = (await P.accountContact.count({ where: { tenantId: T } })) + (await P.accountProduct.count({ where: { tenantId: T } })) + (await P.appSystem.count({ where: { tenantId: T } })) + (await P.tenant.count({ where: { id: T } }));
    chk("CLEAN", "throwaway tenant, ACCOUNT system, contacts and products removed (0 rows left)", left === 0, `left=${left}`);
  }
  await prisma.$disconnect();
}
const passed = cks.filter((x) => x.ok).length;
console.log(`\n${passed === cks.length ? "🟢" : "🔴"} probe-cf4-ci: ${passed}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, findings: cks.filter((x) => !x.ok).map((x) => ({ id: x.id })) })}`);
process.exit(passed === cks.length ? 0 : 1);
