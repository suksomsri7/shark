// QC — API บัญชี ACC T3 (เลน 1) หัก ณ ที่จ่าย: GET /documents/{id}/wht-context (T3-API.1) · GET /settings/tax/deadlines (T3-API.2) ·
//   POST /payments ฟิลด์ใหม่ (whtIncomeCode · whtChannel · whtCondition · ewhtRef) · PATCH /settings/tax (ewhtEnabled · grossUp*) ·
//   PATCH /contacts/{id} (whtRecipient · whtAgent)
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-wht.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-wht");
const F = await import("./acc-v2-wht-fixture.mts" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { chk, finish } = F.makeChecker();
const idem = () => ({ "idempotency-key": `t3w-${Date.now()}-${Math.random().toString(16).slice(2)}` });
let shop: Any = null;
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  shop = await F.makeShop("api", { entityKind: "COMPANY", vat: true });
  const kS = await ak.createApiKey({ tenantId: shop.tid }, "T3 accountant", { scopes: scopes.expandBundles(["accountant", "settings"]), systemId: shop.S });
  const kR = await ak.createApiKey({ tenantId: shop.tid }, "T3 read", { scopes: scopes.expandBundles(["read-only"]), systemId: shop.S });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const S = kS.rawKey;
  const R = kR.rawKey;
  const v = await shop.vendor("บจก. ผสม API", { taxId: "0105561000999" });
  const e = await F.makeExpense(shop, v.id, [
    { description: "ค่าโฆษณา", amount: 1_000_000, lineKind: "SERVICE", whtIncomeType: "M40_8", whtRateBp: 200 },
    { description: "ของแถม", amount: 500_000, lineKind: "GOODS" },
  ]);

  // ═══ T3-API.1 GET /documents/{id}/wht-context ═══
  const g = await call("GET", `/documents/${e}/wht-context`, R);
  const d = g.body?.data;
  const adv = d?.incomeTypes?.find((x: Any) => x.code === "ADVERTISING");
  chk("T3-API.1", "GET wht-context (read-only) → 200 · ผู้จ่าย JURISTIC · ผู้รับ JURISTIC_TH · โฆษณา 200 (ที่มา §10 · V) · e-WHT 100 ถึง 2027-12-31 · ฐานทั้งใบ 1,000,000 · ไม่นับสินค้า 500,000",
    g.status === 200 && d?.payer?.kind === "JURISTIC" && d?.payee?.kind === "JURISTIC_TH" && adv?.section === "M40_8" && adv?.normal?.rateBp === 200 && /§10/.test(adv?.normal?.source ?? "") && adv?.normal?.tag === "V" && adv?.ewht?.rateBp === 100 && adv?.ewht?.until === "2027-12-31" && d?.base?.wholeDocumentSatang === 1_000_000 && d?.base?.goodsExcludedSatang === 500_000 && d?.remainingBaseSatang === 1_000_000,
    "ครบ", `${g.status} ${JSON.stringify(d).slice(0, 400)}`);
  const g404 = await call("GET", `/documents/nope/wht-context`, R);
  chk("T3-API.1b", "เอกสารไม่มี → 404", g404.status === 404, "404", `${g404.status}`, "MAJOR");

  // ═══ T3-API.2 GET /settings/tax/deadlines ═══
  const dl = await call("GET", "/settings/tax/deadlines?asOf=2026-11-13", R);
  const pp = dl.body?.data?.deadlines?.find((x: Any) => x.form === "PP30");
  chk("T3-API.2", "GET deadlines asOf 2026-11-13 → ภ.พ.30 2026-10 กระดาษ 2026-11-15 ออนไลน์ 2026-11-23 · ครบ 6 แบบ", dl.status === 200 && dl.body?.data?.deadlines?.length === 6 && pp?.taxMonth === "2026-10" && pp?.paper?.date === "2026-11-15" && pp?.online?.date === "2026-11-23", "ตามนั้น", `${dl.status} ${JSON.stringify(pp)}`);

  // ═══ POST /payments ฟิลด์ใหม่ (payments.record = C2-P1.1) ═══
  const p = await call("POST", "/payments", S, { documentId: e, rows: [{ paidAt: "2026-09-15", financeAccountId: shop.bank.id, amountSatang: 1_585_000, whtIncomeCode: "ADVERTISING", whtRateBp: 200, whtAmountSatang: 20_000 }] });
  const cert = await shop.prisma.accountDocument.findFirst({ where: { systemId: shop.S, docType: "WHT_CERT", sourceDocId: e } });
  chk("T3-API.3", "POST /payments whtIncomeCode ADVERTISING (ไม่ส่ง whtIncomeType) → 201/200 · 50 ทวิ ม.40(8) + รหัส ADVERTISING · ฐาน 1,000,000 · ภาษี 20,000",
    (p.status === 200 || p.status === 201) && cert?.whtIncomeType === "M40_8" && cert.whtIncomeCode === "ADVERTISING" && cert.subTotal === 1_000_000 && cert.whtAmount === 20_000,
    "ตามนั้น", `${p.status} ${JSON.stringify(p.body).slice(0, 300)} ${JSON.stringify(cert && [cert.whtIncomeType, cert.whtIncomeCode, cert.subTotal, cert.whtAmount])}`);
  const bad = await call("POST", "/payments", S, { documentId: e, rows: [{ paidAt: "2026-09-15", financeAccountId: shop.bank.id, amountSatang: 1000, whtIncomeCode: "LOTTERY" }] });
  chk("T3-API.3b", "whtIncomeCode ไม่รู้จัก → 422", bad.status === 422, "422", `${bad.status}`, "MAJOR");

  // ═══ PATCH /settings/tax (ewhtEnabled · grossUp) = T02-API.2 ═══
  const st = await call("PATCH", "/settings/tax", S, { ewhtEnabled: true, grossUpAlways: "NET_TIMES_RATE" });
  chk("T3-API.4", "PATCH ewhtEnabled + grossUpAlways → 200 · settings.whtSettings สะท้อน · คำเตือน WHT_GROSS_UP", st.status === 200 && st.body?.data?.settings?.whtSettings?.ewhtEnabled === true && st.body?.data?.settings?.whtSettings?.grossUpAlways === "NET_TIMES_RATE" && st.body?.data?.warnings?.some((w: Any) => w.code === "WHT_GROSS_UP"), "ตามนั้น", `${st.status} ${JSON.stringify(st.body?.data?.settings?.whtSettings)}`);
  const stBad = await call("PATCH", "/settings/tax", S, { grossUpOnce: "MAGIC" });
  chk("T3-API.4b", "สูตรไม่รู้จัก → 422", stBad.status === 422, "422", `${stBad.status}`, "MAJOR");

  // ═══ e-WHT ผ่าน REST ═══
  const e2 = await F.makeExpense(shop, v.id, [{ description: "ค่าบริการ", amount: 1_000_000, lineKind: "SERVICE", whtIncomeType: "M40_8", whtRateBp: 100 }]);
  const pe = await call("POST", "/payments", S, { documentId: e2, rows: [{ paidAt: "2026-09-16", financeAccountId: shop.bank.id, amountSatang: 1_060_000, whtIncomeCode: "M40_8", whtRateBp: 100, whtAmountSatang: 10_000, whtChannel: "EWHT", ewhtRef: "SCB-1" }] });
  const pay2 = await shop.prisma.accountDocumentPayment.findFirst({ where: { documentId: e2 } });
  chk("T3-API.5", "POST /payments whtChannel EWHT → ไม่มี 50 ทวิ · ช่องทาง EWHT · เลขอ้างอิง SCB-1 · คำเตือน WHT_EWHT_CHANNEL", (pe.status === 200 || pe.status === 201) && pay2?.whtChannel === "EWHT" && pay2.ewhtRef === "SCB-1" && (await shop.prisma.accountDocument.count({ where: { systemId: shop.S, docType: "WHT_CERT", sourceDocId: e2 } })) === 0 && pe.body?.data?.warnings?.some((w: Any) => w.code === "WHT_EWHT_CHANNEL"), "EWHT", `${pe.status} ${JSON.stringify(pe.body).slice(0, 300)}`);

  // ═══ PATCH /contacts/{id} (contacts.update = C3-M1.5) ═══
  const cu = await call("PATCH", `/contacts/${v.id}`, S, { whtAgent: true, whtRecipient: "FOREIGN_PE" });
  const cdb = await shop.prisma.accountContact.findUnique({ where: { id: v.id }, select: { whtAgent: true, whtRecipient: true } });
  chk("T3-API.6", "PATCH contact whtAgent + whtRecipient → 200 · เก็บจริง · ผลคืนค่า", cu.status === 200 && cdb?.whtAgent === true && cdb.whtRecipient === "FOREIGN_PE" && cu.body?.data?.whtAgent === true, "ตามนั้น", `${cu.status} ${JSON.stringify(cdb)}`);
  const g2 = await call("GET", `/documents/${e2}/wht-context`, R);
  chk("T3-API.6b", "wht-context หลังแก้ผู้ติดต่อ: payee FOREIGN_PE · withholdingAgent true", g2.body?.data?.payee?.kind === "FOREIGN_PE" && g2.body?.data?.payee?.withholdingAgent === true, "ตามนั้น", JSON.stringify(g2.body?.data?.payee), "MAJOR");
} catch (e) {
  console.error(e);
  chk("CRASH", "ไม่ crash", false, "-", String(e));
} finally {
  if (shop) await shop.cleanup();
}
const ok = finish();
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
