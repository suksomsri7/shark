// QC — API บัญชี WO B2: READ ผู้ติดต่อ / กลุ่ม / โปรไฟล์ / คู่ซ้ำ / เชื่อมระบบ / DBD · สินค้า / หน่วย / หมวด / จัดชุด / ยอดยกมา / คลัง
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §B2
// requires: acc-v2-seed (SIAM DIVE QC + scripts/acc-v2-expected.json)
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Any;
const SYS: string = E.systemId;
const TID: string = E.tenantId;
const noLeak = (v: unknown) => { const s = JSON.stringify(v); return !/"tenantId"|"systemId"|"publicToken"|"keyHash"|"href"/.test(s); };

let tidB = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const readOnly = scopes.expandBundles(["read-only"]) as string[];
  const kRead = await ak.createApiKey({ tenantId: TID }, "QC B2 read", { scopes: readOnly, systemId: SYS });
  const kManage = await ak.createApiKey({ tenantId: TID }, "QC B2 manage", { scopes: [...readOnly, "account.contact.manage", "account.contact.merge", "account.product.manage"], systemId: SYS });
  const tB = await prisma.tenant.create({ data: { name: "QC B2 other", slug: `qc-b2-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const kB = await ak.createApiKey({ tenantId: tidB }, "QC B2 B", { scopes: readOnly, systemId: accB.id });

  const call = async (method: string, path: string, key: string) => {
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${key}` } });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let body: Any = null; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
    return { status: res.status, body };
  };
  const K = kRead.rawKey;

  // ═══ C1 contacts list ═══
  const all = await call("GET", "/contacts", K);
  chk("B2-C1.1", "GET /contacts → 200 data[] + page + summary{all,customer,vendor,archived,active,regular} ตรงเฉลย", all.status === 200 && Array.isArray(all.body?.data) && all.body?.page && ["all", "customer", "vendor", "archived", "active", "regular"].every((k) => all.body?.summary?.[k] === E.contacts[k]), JSON.stringify({ all: E.contacts.all, c: E.contacts.customer, v: E.contacts.vendor, a: E.contacts.archived, act: E.contacts.active, r: E.contacts.regular }), `${all.status} ${JSON.stringify(all.body?.summary)}`);
  chk("B2-C1.2", "page.total (default = ใช้งานอยู่) = เฉลย active", all.body?.page?.total === E.contacts.active, `${E.contacts.active}`, `${all.body?.page?.total}`);
  const c0 = all.body?.data?.[0];
  chk("B2-C1.3", "แถวผู้ติดต่อมี id/code/name/kind/legalType/taxId/phone/email/archived/outstandingSatang/lastDocument", !!c0 && typeof c0.code === "string" && typeof c0.name === "string" && /^(CUSTOMER|VENDOR|BOTH)$/.test(c0.kind) && "taxId" in c0 && "phone" in c0 && "email" in c0 && typeof c0.archived === "boolean" && Number.isInteger(c0.outstandingSatang) && "lastDocument" in c0, "ครบ", JSON.stringify(c0).slice(0, 220));
  chk("B2-C1.4", "ไม่รั่ว tenantId/systemId/href", noLeak(all.body), "สะอาด", "หลุด");
  const vendors = await call("GET", "/contacts?group=vendor&pageSize=100", K);
  chk("B2-C1.5", "group=vendor → total = เฉลย vendor · ทุกแถว kind ∈ VENDOR/BOTH", vendors.body?.page?.total === E.contacts.vendor && (vendors.body?.data ?? []).every((c: Any) => c.kind === "VENDOR" || c.kind === "BOTH"), `${E.contacts.vendor}`, `${vendors.body?.page?.total}`);
  const archived = await call("GET", "/contacts?group=archived", K);
  chk("B2-C1.6", "group=archived → total = เฉลย archived · ทุกแถว archived=true", archived.body?.page?.total === E.contacts.archived && (archived.body?.data ?? []).every((c: Any) => c.archived === true), `${E.contacts.archived}`, `${archived.body?.page?.total}`);
  const q = await call("GET", `/contacts?q=${encodeURIComponent(c0?.name?.slice(0, 4) ?? "x")}`, K);
  chk("B2-C1.7", "q= ค้นหาชื่อ → ≥1 แถว ทุกแถวมีคำค้น", q.status === 200 && (q.body?.data?.length ?? 0) >= 1 && q.body.data.every((c: Any) => (c.name as string).includes(c0.name.slice(0, 4))), "ตรง", `${q.body?.data?.length}`);
  const badGroup = await call("GET", "/contacts?group=nope", K);
  chk("B2-C1.8", "group ไม่รู้จัก → 422", badGroup.status === 422, "422", `${badGroup.status}`, "MAJOR");
  const groups = await call("GET", "/contact-groups", K);
  chk("B2-C1.9", "GET /contact-groups → data[{id,name,color,count}] ชื่อ/จำนวนตรงเฉลย", groups.status === 200 && Array.isArray(groups.body?.data) && (E.contacts.groups as Any[]).every((g) => groups.body.data.some((x: Any) => x.name === g.name && x.count === g.count)), JSON.stringify(E.contacts.groups), JSON.stringify(groups.body?.data).slice(0, 200));
  const byGroup = await call("GET", `/contacts?group=custom:${groups.body?.data?.[0]?.id}`, K);
  chk("B2-C1.10", "group=custom:<groupId> → total = count ของกลุ่ม", byGroup.status === 200 && byGroup.body?.page?.total === groups.body?.data?.[0]?.count, `${groups.body?.data?.[0]?.count}`, `${byGroup.status} ${byGroup.body?.page?.total}`);

  // ═══ C2 contact profile ═══
  const prof = await call("GET", `/contacts/${c0?.id}`, K);
  const p = prof.body?.data;
  chk("B2-C2.1", "GET /contacts/{id} → 200 header{id,code,name,kind,legalType,archived,mergedIntoId} + info{taxId,address,phone,email,creditTermDays,...} + kpi{outstandingSatang,outstandingDocs,overdueDocs,paidThisYearSatang}", prof.status === 200 && p?.header?.id === c0?.id && p?.header?.code === c0?.code && typeof p?.info?.creditTermDays === "number" && Number.isInteger(p?.kpi?.outstandingSatang) && Number.isInteger(p?.kpi?.outstandingDocs) && Number.isInteger(p?.kpi?.paidThisYearSatang), "ครบ", `${prof.status} ${JSON.stringify(Object.keys(p ?? {}))}`);
  chk("B2-C2.2", "profile.kpi.outstandingSatang = outstandingSatang ของแถวใน list", p?.kpi?.outstandingSatang === c0?.outstandingSatang, `${c0?.outstandingSatang}`, `${p?.kpi?.outstandingSatang}`);
  chk("B2-C2.3", "profile มี documents[] (เอกสารล่าสุด) + groups[] + links{member,crm,chat}", Array.isArray(p?.documents) && Array.isArray(p?.groups) && !!p?.links, "ครบ", JSON.stringify(Object.keys(p ?? {})), "MAJOR");
  chk("B2-C2.4", "profile ไม่รั่ว href/base/tenantId", noLeak(p) && !("base" in (p ?? {})), "สะอาด", "หลุด", "MAJOR");
  const nf = await call("GET", "/contacts/does-not-exist", K);
  chk("B2-C2.5", "id ไม่มี → 404", nf.status === 404 && nf.body?.error?.code === "not_found", "404", `${nf.status}`);
  const cross = await call("GET", `/contacts/${c0?.id}`, kB.rawKey);
  chk("B2-C2.6", "คีย์ร้านอื่น → 404", cross.status === 404, "404", `${cross.status}`);
  const docsTab = await call("GET", `/contacts/${c0?.id}/documents?pageSize=5`, K);
  chk("B2-C2.7", "GET /contacts/{id}/documents → data[] ทุกแถว contact.id ตรง + page", docsTab.status === 200 && Array.isArray(docsTab.body?.data) && docsTab.body.data.every((d: Any) => d.contact?.id === c0?.id) && !!docsTab.body?.page, "ตรง", `${docsTab.status} ${docsTab.body?.data?.length}`);

  // ═══ C3 merge candidates / link suggestions / DBD ═══
  const merge = await call("GET", "/contacts/merge-candidates", kManage.rawKey);
  chk("B2-C3.1", "GET /contacts/merge-candidates (scope contact.merge) → data[{pairKey,a{id,name},b{id,name},reason,similarity}]", merge.status === 200 && Array.isArray(merge.body?.data) && merge.body.data.every((m: Any) => typeof m.pairKey === "string" && m.a?.id && m.b?.id && typeof m.reason === "string"), "array", `${merge.status} ${JSON.stringify(merge.body?.data?.[0]).slice(0, 160)}`);
  const mergeDenied = await call("GET", "/contacts/merge-candidates", K);
  chk("B2-C3.2", "คีย์อ่านอย่างเดียวขอ merge-candidates → 403 scope_missing", mergeDenied.status === 403, "403", `${mergeDenied.status}`);
  const links = await call("GET", `/contacts/${c0?.id}/link-suggestions`, kManage.rawKey);
  chk("B2-C3.3", "GET /contacts/{id}/link-suggestions (scope contact.manage) → {member[],crm[],chat,available{member,crm}}", links.status === 200 && Array.isArray(links.body?.data?.member) && Array.isArray(links.body?.data?.crm) && typeof links.body?.data?.available?.member === "boolean", "ครบ", `${links.status} ${JSON.stringify(links.body?.data).slice(0, 160)}`);
  const dbdBad = await call("GET", "/contacts/lookup-tax-id/123", kManage.rawKey);
  chk("B2-C3.4", "lookup-tax-id เลขไม่ครบ 13 หลัก → 422 validation", dbdBad.status === 422, "422", `${dbdBad.status}`);
  const dbd = await call("GET", "/contacts/lookup-tax-id/0105555555555", kManage.rawKey);
  const hasKey = !!(process.env.DBD_API_KEY ?? "").trim();
  chk("B2-C3.5", hasKey ? "lookup-tax-id มี key → 200/404" : "lookup-tax-id ไม่มี DBD_API_KEY → 503 upstream_unavailable + message_th บอกว่ายังไม่ได้ตั้งค่า", hasKey ? dbd.status === 200 || dbd.status === 404 : dbd.status === 503 && dbd.body?.error?.code === "upstream_unavailable" && /[ก-๙]/.test(dbd.body?.error?.message_th ?? ""), hasKey ? "200/404" : "503", `${dbd.status} ${dbd.body?.error?.code}`);

  // ═══ C4 products ═══
  const goods = await call("GET", "/products?type=GOODS", K);
  chk("B2-C4.1", "GET /products?type=GOODS → 200 data[] + page + counts{GOODS,SERVICE,BUNDLE,active,archived} ตรงเฉลย + stockValueSatang", goods.status === 200 && ["GOODS", "SERVICE", "BUNDLE"].every((k) => goods.body?.counts?.[k] === E.productsByType[k]) && Number.isInteger(goods.body?.stockValueSatang), JSON.stringify(E.productsByType), `${goods.status} ${JSON.stringify(goods.body?.counts)} sv=${goods.body?.stockValueSatang}`);
  chk("B2-C4.2", "page.total ของ GOODS = เฉลย", goods.body?.page?.total === E.productsByType.GOODS, `${E.productsByType.GOODS}`, `${goods.body?.page?.total}`);
  const p0 = goods.body?.data?.[0];
  chk("B2-C4.3", "แถวสินค้ามี id/code/sku/name/type/unitName/salePriceSatang/buyPriceSatang/onHand/archived/category", !!p0 && typeof p0.name === "string" && p0.type === "GOODS" && "sku" in p0 && "salePriceSatang" in p0 && "buyPriceSatang" in p0 && "onHand" in p0 && typeof p0.archived === "boolean", "ครบ", JSON.stringify(p0).slice(0, 220));
  const allTypes = await call("GET", "/products?pageSize=100", K);
  chk("B2-C4.4", "ไม่ส่ง type → ทุกชนิด total = เฉลย products", allTypes.status === 200 && allTypes.body?.page?.total === E.products, `${E.products}`, `${allTypes.status} ${allTypes.body?.page?.total}`, "MAJOR");
  const badType = await call("GET", "/products?type=NOPE", K);
  chk("B2-C4.5", "type ไม่รู้จัก → 422", badType.status === 422, "422", `${badType.status}`, "MAJOR");
  const detail = await call("GET", `/products/${p0?.id}`, K);
  const pd = detail.body?.data;
  chk("B2-C4.6", "GET /products/{id} → 200 product{...} + bundleItems[] + openingLots[] + inventory{linked,item|null}", detail.status === 200 && pd?.product?.id === p0?.id && Array.isArray(pd?.bundleItems) && Array.isArray(pd?.openingLots) && typeof pd?.inventory?.linked === "boolean", "ครบ", `${detail.status} ${JSON.stringify(Object.keys(pd ?? {}))}`);
  const pnf = await call("GET", "/products/does-not-exist", K);
  chk("B2-C4.7", "สินค้าไม่มี → 404", pnf.status === 404, "404", `${pnf.status}`);
  const mv = await call("GET", `/products/${p0?.id}/movements`, K);
  chk("B2-C4.8", "GET /products/{id}/movements → data[] (docNo/date/type/qty/document)", mv.status === 200 && Array.isArray(mv.body?.data), "array", `${mv.status}`);
  const bundleRow = await prisma.accountProduct.findFirst({ where: { tenantId: TID, systemId: SYS, type: "BUNDLE", archivedAt: null }, select: { id: true } });
  const bundle = await call("GET", `/products/${bundleRow?.id}/bundle`, K);
  const dbBundle = await prisma.accountProductBundleItem.count({ where: { tenantId: TID, systemId: SYS, bundleProductId: bundleRow?.id ?? "" } });
  chk("B2-C4.9", "GET /products/{id}/bundle → data[] จำนวนเท่า DB · มี component{id,name,sku} + qty", bundle.status === 200 && bundle.body?.data?.length === dbBundle && (bundle.body?.data ?? []).every((b: Any) => b.component?.id && typeof b.qty === "number"), `${dbBundle}`, `${bundle.status} ${bundle.body?.data?.length}`);
  const lotRow = await prisma.accountProductOpeningLot.findFirst({ where: { tenantId: TID, systemId: SYS }, select: { productId: true } });
  const lots = await call("GET", `/products/${lotRow?.productId}/opening-lots`, K);
  const dbLots = await prisma.accountProductOpeningLot.count({ where: { tenantId: TID, systemId: SYS, productId: lotRow?.productId ?? "" } });
  chk("B2-C4.10", "GET /products/{id}/opening-lots → data[] จำนวนเท่า DB · qty/unitCostSatang/date", lots.status === 200 && lots.body?.data?.length === dbLots && (lots.body?.data ?? []).every((l: Any) => typeof l.qty === "number" && Number.isInteger(l.unitCostSatang)), `${dbLots}`, `${lots.status} ${lots.body?.data?.length}`);
  const crossP = await call("GET", `/products/${p0?.id}`, kB.rawKey);
  chk("B2-C4.11", "คีย์ร้านอื่นอ่านสินค้า → 404", crossP.status === 404, "404", `${crossP.status}`);

  // ═══ C5 units / categories / warehouses ═══
  const units = await call("GET", "/units", K);
  const dbUnits = await prisma.accountUnit.count({ where: { tenantId: TID, systemId: SYS, archivedAt: null } });
  chk("B2-C5.1", "GET /units → data[] จำนวนเท่า DB (ไม่รวม archived) · มี id/code/name/kind", units.status === 200 && units.body?.data?.length === dbUnits && (units.body?.data ?? []).every((u: Any) => typeof u.id === "string" && typeof u.name === "string"), `${dbUnits}`, `${units.status} ${units.body?.data?.length}`);
  const unitsAll = await call("GET", "/units?includeArchived=true", K);
  const dbUnitsAll = await prisma.accountUnit.count({ where: { tenantId: TID, systemId: SYS } });
  chk("B2-C5.2", "includeArchived=true → รวม archived", unitsAll.body?.data?.length === dbUnitsAll, `${dbUnitsAll}`, `${unitsAll.body?.data?.length}`, "MAJOR");
  const cats = await call("GET", "/categories", K);
  const dbCats = await prisma.accountCategory.count({ where: { tenantId: TID, systemId: SYS, archivedAt: null } });
  chk("B2-C5.3", "GET /categories → data[] จำนวนเท่า DB · มี id/name/appliesTo[]", cats.status === 200 && cats.body?.data?.length === dbCats && (cats.body?.data ?? []).every((c: Any) => Array.isArray(c.appliesTo)), `${dbCats}`, `${cats.status} ${cats.body?.data?.length}`);
  const wh = await call("GET", "/warehouses", K);
  chk("B2-C5.4", "GET /warehouses → data[{id,name,isDefault}] (ร้าน QC มีคลัง)", wh.status === 200 && Array.isArray(wh.body?.data) && wh.body.data.every((w: Any) => typeof w.name === "string" && typeof w.isDefault === "boolean"), "array", `${wh.status}`);

  // ═══ C6 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string][] = [["contacts.list", "account.doc.view"], ["contacts.get", "account.doc.view"], ["contacts.documents", "account.doc.view"], ["contact-groups.list", "account.doc.view"], ["contacts.merge-candidates", "account.contact.merge"], ["contacts.link-suggestions", "account.contact.manage"], ["contacts.lookup-tax-id", "account.contact.manage"], ["products.list", "account.doc.view"], ["products.get", "account.doc.view"], ["products.movements", "account.doc.view"], ["products.bundle", "account.doc.view"], ["products.opening-lots", "account.doc.view"], ["units.list", "account.doc.view"], ["categories.list", "account.doc.view"], ["warehouses.list", "account.doc.view"]];
  const bad = need.filter(([id, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== "read" || o.action !== action; });
  chk("B2-C6.1", "registry มี op ครบ 15 ตัวของ B2 · kind=read · action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 220) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC B2 " } } }));
  if (tidB) {
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tidB } }));
    await d(() => prisma.tenant.delete({ where: { id: tidB } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API READ master (B2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
