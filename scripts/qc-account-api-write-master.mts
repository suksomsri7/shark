// QC — API บัญชี WO C3: WRITE ผู้ติดต่อ/กลุ่ม/รวมซ้ำ/เชื่อมระบบ · สินค้า/หน่วย/หมวด/จัดชุด/ยอดยกมา/ใบเบิก-คืน/ปรับต้นทุน/ผูกคลัง
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §C3
// 🔴 tenant ใหม่ของตัวเอง (ไม่แตะ seed) · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-master");
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
const idem = () => ({ "idempotency-key": `c3-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

let tid = "";
let tidB = "";
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  const t = await prisma.tenant.create({ data: { name: "QC API C3", slug: `qc-api-c3-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี C3");
  const SYS = s.id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน C3", taxId: "0105561000005", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const tB = await prisma.tenant.create({ data: { name: "QC API C3 B", slug: `qc-api-c3b-${Date.now()}` } });
  tidB = tB.id;
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const base = scopes.expandBundles(["issue-and-collect"]) as string[];
  const kW = await ak.createApiKey({ tenantId: tid }, "C3 write", { scopes: base, systemId: SYS });
  const kD = await ak.createApiKey({ tenantId: tid }, "C3 danger", { scopes: [...base, "account.contact.merge"], systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "C3 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });
  const kB = await ak.createApiKey({ tenantId: tidB }, "C3 B", { scopes: base, systemId: accB.id });

  const call = async (method: string, path: string, key: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()), ...extra };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  const W = kW.rawKey;
  const code = (r: Any) => r.body?.error?.code;

  // ═══ M1 ผู้ติดต่อ ═══
  const c1 = await call("POST", "/contacts", W, { kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ทะเลใส จำกัด", taxId: "0105561000006", branchCode: "00000", phone: "08-1234-5678", email: "info@talaysai.test", creditTermDays: 30, address: { addressLine: "1/1 ถ.ทะเล", subdistrict: "ป่าตอง", district: "กะทู้", province: "ภูเก็ต", postcode: "83150" } });
  chk("C3-M1.1", "POST /contacts → 200 data{id,code C000xx,name,kind,phone normalize 0812345678,taxId}", c1.status === 200 && /^C\d{5}$/.test(c1.body?.data?.code ?? "") && c1.body?.data?.phone === "0812345678" && c1.body?.data?.taxId === "0105561000006", "200 C000xx", `${c1.status} ${JSON.stringify(c1.body).slice(0, 220)}`);
  const c1Id = c1.body?.data?.id as string;
  const dupTax = await call("POST", "/contacts", W, { kind: "CUSTOMER", name: "ทะเลใส สาขาสอง", taxId: "0105561000006", branchCode: "00000" });
  chk("C3-M1.2", "เลขภาษี+สาขาซ้ำ → 409 duplicate + details ชี้ผู้ติดต่อเดิม", dupTax.status === 409 && code(dupTax) === "duplicate" && JSON.stringify(dupTax.body?.error).includes(c1Id), "409 duplicate", `${dupTax.status} ${JSON.stringify(dupTax.body?.error).slice(0, 200)}`);
  const badTax = await call("POST", "/contacts", W, { kind: "VENDOR", name: "x", taxId: "123" });
  chk("C3-M1.3", "เลขภาษีไม่ครบ 13 หลัก → 422", badTax.status === 422, "422", `${badTax.status}`);
  const c2 = await call("POST", "/contacts", W, { kind: "VENDOR", legalType: "PERSON", name: "สมชาย ขายอุปกรณ์", phone: "0899999999" });
  const c2Id = c2.body?.data?.id as string;
  chk("C3-M1.4", "สร้างผู้ขายบุคคล → 200", c2.status === 200 && c2.body?.data?.kind === "VENDOR", "200", `${c2.status}`);
  const upd = await call("PATCH", `/contacts/${c1Id}`, W, { creditTermDays: 45, email: "ar@talaysai.test" });
  chk("C3-M1.5", "PATCH /contacts/{id} (partial) → 200 creditTermDays 45 + email ใหม่ ชื่อเดิมคง", upd.status === 200 && upd.body?.data?.creditTermDays === 45 && upd.body?.data?.email === "ar@talaysai.test" && upd.body?.data?.name === "บริษัท ทะเลใส จำกัด", "45", `${upd.status} ${JSON.stringify(upd.body?.data).slice(0, 160)}`);
  const updCross = await call("PATCH", `/contacts/${c1Id}`, kB.rawKey, { name: "hack" });
  chk("C3-M1.6", "คีย์ร้านอื่น PATCH → 404 และชื่อไม่เปลี่ยน", updCross.status === 404 && (await prisma.accountContact.findUnique({ where: { id: c1Id }, select: { name: true } }))?.name === "บริษัท ทะเลใส จำกัด", "404", `${updCross.status}`);
  const readDenied = await call("POST", "/contacts", kR.rawKey, { kind: "CUSTOMER", name: "x" });
  chk("C3-M1.7", "คีย์ read-only สร้างผู้ติดต่อ → 403", readDenied.status === 403, "403", `${readDenied.status}`);
  const grp = await call("POST", "/contact-groups", W, { name: "ลูกค้า VIP", color: "#ff0000" });
  const grpId = grp.body?.data?.id as string;
  chk("C3-M1.8", "POST /contact-groups → 200 {id,name}", grp.status === 200 && typeof grpId === "string", "200", `${grp.status}`);
  const addM = await call("POST", `/contact-groups/${grpId}/members`, W, { contactIds: [c1Id, c2Id, c1Id] });
  chk("C3-M1.9", "POST members (มีซ้ำ) → added 2 · ซ้ำอีกครั้ง → added 0", addM.status === 200 && addM.body?.data?.added === 2 && (await call("POST", `/contact-groups/${grpId}/members`, W, { contactIds: [c1Id] })).body?.data?.added === 0, "2 แล้ว 0", `${addM.status} ${JSON.stringify(addM.body?.data)}`);
  const grpList = await call("GET", "/contact-groups", W);
  chk("C3-M1.10", "GET /contact-groups → count 2", (grpList.body?.data ?? []).find((g: Any) => g.id === grpId)?.count === 2, "2", JSON.stringify(grpList.body?.data));
  const rmM = await call("DELETE", `/contact-groups/${grpId}/members/${c2Id}`, W);
  chk("C3-M1.11", "DELETE member → 200 count 1", rmM.status === 200 && (await call("GET", "/contact-groups", W)).body?.data?.find((g: Any) => g.id === grpId)?.count === 1, "1", `${rmM.status}`);
  const c3 = await call("POST", "/contacts", W, { kind: "CUSTOMER", name: "บริษัท ทะเลใส จำกัด (ซ้ำ)", phone: "0812345678" });
  const c3Id = c3.body?.data?.id as string;
  chk("C3-M1.12", "สร้างผู้ติดต่อเบอร์ซ้ำ (ชื่อต่าง) → 200 แต่ data.warnings[] มีคำเตือนซ้ำ", c3.status === 200 && Array.isArray(c3.body?.data?.warnings) && c3.body.data.warnings.length >= 1, "200 + warnings", `${c3.status} ${JSON.stringify(c3.body?.data?.warnings)}`, "MAJOR");
  const cand = await call("GET", "/contacts/merge-candidates", kD.rawKey);
  chk("C3-M1.13", "merge-candidates เห็นคู่ c1/c3 (เบอร์ซ้ำ)", cand.status === 200 && (cand.body?.data ?? []).some((m: Any) => [m.a?.id, m.b?.id].includes(c1Id) && [m.a?.id, m.b?.id].includes(c3Id)), "เจอคู่", `${cand.status} ${cand.body?.data?.length}`);
  const mergeNo = await call("POST", "/contacts/merge", W, { keepId: c1Id, mergeId: c3Id, confirm: true, reason: "รายเดียวกัน" });
  chk("C3-M1.14", "merge ด้วยคีย์ไม่มี contact.merge → 403", mergeNo.status === 403, "403", `${mergeNo.status}`);
  const merged = await call("POST", "/contacts/merge", kD.rawKey, { keepId: c1Id, mergeId: c3Id, confirm: true, reason: "รายเดียวกัน" });
  const c3Row = await prisma.accountContact.findUnique({ where: { id: c3Id }, select: { mergedIntoId: true, archivedAt: true } });
  chk("C3-M1.15", "POST /contacts/merge (danger) → 200 · ตัวรองถูกรวม mergedIntoId = c1 + archived", merged.status === 200 && c3Row?.mergedIntoId === c1Id && !!c3Row?.archivedAt, "รวมแล้ว", `${merged.status} ${JSON.stringify(c3Row)}`);
  const arch = await call("DELETE", `/contacts/${c2Id}`, W);
  chk("C3-M1.16", "DELETE /contacts/{id} → 200 archived (soft)", arch.status === 200 && !!(await prisma.accountContact.findUnique({ where: { id: c2Id }, select: { archivedAt: true } }))?.archivedAt, "archived", `${arch.status}`);
  const restore = await call("POST", `/contacts/${c2Id}/restore`, W);
  chk("C3-M1.17", "POST /contacts/{id}/restore → 200 archivedAt null", restore.status === 200 && (await prisma.accountContact.findUnique({ where: { id: c2Id }, select: { archivedAt: true } }))?.archivedAt === null, "คืนแล้ว", `${restore.status}`, "MAJOR");

  // ═══ M2 หน่วย / หมวด ═══
  const unit = await call("POST", "/units", W, { name: "ถัง", nameEn: "tank", kind: "PRODUCT" });
  const unitId = unit.body?.data?.id as string;
  chk("C3-M2.1", "POST /units → 200 {id,code,name}", unit.status === 200 && typeof unitId === "string" && typeof unit.body?.data?.code === "string", "200", `${unit.status} ${JSON.stringify(unit.body?.data)}`);
  const unitDup = await call("POST", "/units", W, { name: "ถัง" });
  chk("C3-M2.2", "หน่วยชื่อซ้ำ → 409 duplicate หรือ 422 ไทย", unitDup.status === 409 || unitDup.status === 422, "409/422", `${unitDup.status}`, "MAJOR");
  const unitUpd = await call("PATCH", `/units/${unitId}`, W, { name: "ถังอากาศ" });
  chk("C3-M2.3", "PATCH /units/{id} → 200 ชื่อใหม่", unitUpd.status === 200 && unitUpd.body?.data?.name === "ถังอากาศ", "ชื่อใหม่", `${unitUpd.status}`);
  const cat = await call("POST", "/categories", W, { name: "ค่าอุปกรณ์", appliesTo: ["EXPENSE", "PURCHASE"] });
  const catId = cat.body?.data?.id as string;
  chk("C3-M2.4", "POST /categories → 200 {id,name,appliesTo}", cat.status === 200 && JSON.stringify(cat.body?.data?.appliesTo) === JSON.stringify(["EXPENSE", "PURCHASE"]), "200", `${cat.status} ${JSON.stringify(cat.body?.data)}`);
  const catUpd = await call("PATCH", `/categories/${catId}`, W, { name: "ค่าอุปกรณ์ดำน้ำ" });
  const catDel = await call("DELETE", `/categories/${catId}`, W);
  chk("C3-M2.5", "PATCH + DELETE /categories → 200 ทั้งคู่ · archived", catUpd.status === 200 && catDel.status === 200 && !!(await prisma.accountCategory.findUnique({ where: { id: catId }, select: { archivedAt: true } }))?.archivedAt, "200/200", `${catUpd.status}/${catDel.status}`);

  // ═══ M3 สินค้า / จัดชุด / ยอดยกมา ═══
  const p1 = await call("POST", "/products", W, { type: "GOODS", name: "หน้ากากดำน้ำ", sku: "MASK-001", unitId, salePriceSatang: 150000, buyPriceSatang: 90000, vatRateBp: 700, trackStock: true });
  const p1Id = p1.body?.data?.id as string;
  chk("C3-M3.1", "POST /products GOODS → 200 {id,code,sku,name,salePriceSatang,buyPriceSatang,unitName}", p1.status === 200 && typeof p1Id === "string" && p1.body?.data?.sku === "MASK-001" && p1.body?.data?.salePriceSatang === 150000 && p1.body?.data?.unitName === "ถังอากาศ", "200", `${p1.status} ${JSON.stringify(p1.body?.data).slice(0, 200)}`);
  const pDup = await call("POST", "/products", W, { type: "GOODS", name: "หน้ากากดำน้ำ 2", sku: "MASK-001" });
  chk("C3-M3.2", "SKU ซ้ำ → 409 duplicate (ไม่ error ดิบ)", pDup.status === 409 && code(pDup) === "duplicate", "409", `${pDup.status} ${code(pDup)}`);
  const pFrac = await call("POST", "/products", W, { type: "SERVICE", name: "x", salePriceSatang: 10.5 });
  chk("C3-M3.3", "ราคาทศนิยม → 422", pFrac.status === 422, "422", `${pFrac.status}`);
  const p2 = await call("POST", "/products", W, { type: "GOODS", name: "ท่อหายใจ", sku: "SNK-001", unitId, salePriceSatang: 50000, buyPriceSatang: 30000 });
  const p2Id = p2.body?.data?.id as string;
  const svc = await call("POST", "/products", W, { type: "SERVICE", name: "ค่าบริการไกด์", salePriceSatang: 100000 });
  chk("C3-M3.4", "สร้างสินค้าตัวที่ 2 + บริการ → 200", p2.status === 200 && svc.status === 200 && svc.body?.data?.type === "SERVICE", "200", `${p2.status}/${svc.status}`);
  const pUpd = await call("PATCH", `/products/${p1Id}`, W, { salePriceSatang: 160000 });
  chk("C3-M3.5", "PATCH /products/{id} (partial) → 200 ราคาใหม่ ชื่อ/sku เดิมคง", pUpd.status === 200 && pUpd.body?.data?.salePriceSatang === 160000 && pUpd.body?.data?.sku === "MASK-001" && pUpd.body?.data?.name === "หน้ากากดำน้ำ", "160000", `${pUpd.status} ${JSON.stringify(pUpd.body?.data).slice(0, 160)}`);
  const bundle = await call("POST", "/products", W, { type: "BUNDLE", name: "ชุดดำน้ำผิวน้ำ", sku: "SET-001", salePriceSatang: 190000 });
  const bundleId = bundle.body?.data?.id as string;
  const setB = await call("PUT", `/products/${bundleId}/bundle`, W, { items: [{ componentProductId: p1Id, qty: 1 }, { componentProductId: p2Id, qty: 1 }] });
  chk("C3-M3.6", "PUT /products/{id}/bundle → 200 count 2 · GET bundle เห็น 2 component", setB.status === 200 && setB.body?.data?.count === 2 && (await call("GET", `/products/${bundleId}/bundle`, W)).body?.data?.length === 2, "2", `${setB.status} ${JSON.stringify(setB.body?.data)}`);
  const setBadB = await call("PUT", `/products/${p1Id}/bundle`, W, { items: [{ componentProductId: p2Id, qty: 1 }] });
  chk("C3-M3.7", "ตั้ง bundle ให้สินค้าธรรมดา → 409/422 ไทย", (setBadB.status === 409 || setBadB.status === 422) && /[ก-๙]/.test(setBadB.body?.error?.message_th ?? ""), "409/422", `${setBadB.status}`, "MAJOR");
  const lot = await call("POST", `/products/${p1Id}/opening-lots`, W, { date: ymd(), qty: 10, unitCostSatang: 90000 });
  const lotEntries = await prisma.accountJournalEntry.count({ where: { systemId: SYS, refId: p1Id } });
  const p1Stock = await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } });
  chk("C3-M3.8", "POST /products/{id}/opening-lots → 200 {id,seq,amountSatang 900,000} + โพสต์ JV ยอดยกมา + qtyOnHand 10", lot.status === 200 && lot.body?.data?.amountSatang === 900000 && lotEntries >= 1 && Number(p1Stock?.qtyOnHand) === 10, "900000 + JV", `${lot.status} ${JSON.stringify(lot.body?.data)} entries=${lotEntries} onHand=${p1Stock?.qtyOnHand}`);

  // ═══ M4 ใบเบิก / คืน / ปรับต้นทุน ═══
  const gi = await call("POST", "/stock-documents", W, { type: "GOODS_ISSUE", issueDate: ymd(), reason: "ใช้ในทริป", lines: [{ productId: p1Id, qty: 3 }] });
  const giId = gi.body?.data?.id as string;
  chk("C3-M4.1", "POST /stock-documents GOODS_ISSUE (ออกทันที) → 200 {id,docNo PRR…,status,type} · สต็อกเหลือ 7 · JV โพสต์", gi.status === 200 && typeof gi.body?.data?.docNo === "string" && gi.body?.data?.type === "GOODS_ISSUE" && Number((await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } }))?.qtyOnHand) === 7 && (await prisma.accountJournalEntry.count({ where: { systemId: SYS, refId: giId } })) >= 1, "เหลือ 7", `${gi.status} ${JSON.stringify(gi.body?.data).slice(0, 160)}`);
  const giNeg = await call("POST", "/stock-documents", W, { type: "GOODS_ISSUE", lines: [{ productId: p1Id, qty: 100 }] });
  chk("C3-M4.2", "เบิกเกินสต็อก (ไม่ allowNegative) → 409/422 ไทย · สต็อกยัง 7", (giNeg.status === 409 || giNeg.status === 422) && Number((await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } }))?.qtyOnHand) === 7, "409/422", `${giNeg.status} ${code(giNeg)}`);
  const giDraft = await call("POST", "/stock-documents", W, { type: "GOODS_ISSUE", asDraft: true, lines: [{ productId: p1Id, qty: 2 }] });
  const giDraftId = giDraft.body?.data?.id as string;
  chk("C3-M4.3", "asDraft:true → status DRAFT สต็อกยังไม่ตัด", giDraft.status === 200 && giDraft.body?.data?.status === "DRAFT" && Number((await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } }))?.qtyOnHand) === 7, "DRAFT", `${giDraft.status} ${giDraft.body?.data?.status}`);
  const giApprove = await call("POST", `/stock-documents/${giDraftId}/approve`, W, {});
  chk("C3-M4.4", "POST /stock-documents/{id}/approve → 200 docNo · สต็อกเหลือ 5", giApprove.status === 200 && typeof giApprove.body?.data?.docNo === "string" && Number((await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } }))?.qtyOnHand) === 5, "5", `${giApprove.status} ${JSON.stringify(giApprove.body?.data)}`);
  const ret = await call("POST", "/stock-documents", W, { type: "GOODS_ISSUE_RETURN", sourceDocId: giId, lines: [{ productId: p1Id, qty: 1 }] });
  chk("C3-M4.5", "GOODS_ISSUE_RETURN อ้าง PRR → 200 · สต็อกกลับเป็น 6", ret.status === 200 && Number((await prisma.accountProduct.findUnique({ where: { id: p1Id }, select: { qtyOnHand: true } }))?.qtyOnHand) === 6, "6", `${ret.status} ${code(ret)}`);
  const ca = await call("POST", "/stock-documents", W, { type: "COST_ADJUSTMENT", productId: p1Id, newCostSatang: 95000, reason: "ราคาทุนใหม่" });
  chk("C3-M4.6", "COST_ADJUSTMENT → 200 {id,docNo,oldCostSatang 90000,newCostSatang 95000,deltaSatang}", ca.status === 200 && ca.body?.data?.oldCostSatang === 90000 && ca.body?.data?.newCostSatang === 95000 && Number.isInteger(ca.body?.data?.deltaSatang), "200", `${ca.status} ${JSON.stringify(ca.body?.data).slice(0, 200)}`);
  const mv = await call("GET", `/products/${p1Id}/movements`, W);
  chk("C3-M4.7", "GET movements หลังเบิก/คืน → ≥3 รายการ", mv.status === 200 && (mv.body?.data?.length ?? 0) >= 3, "≥3", `${mv.body?.data?.length}`, "MAJOR");
  const link = await call("POST", `/products/${p1Id}/link-inventory`, W, {});
  chk("C3-M4.8", "POST /products/{id}/link-inventory เมื่อร้านไม่มีระบบคลัง → 422 ไทย (ไม่ 500)", link.status === 422 && /[ก-๙]/.test(link.body?.error?.message_th ?? ""), "422", `${link.status} ${code(link)}`, "MAJOR");
  const pArch = await call("DELETE", `/products/${p2Id}`, W);
  chk("C3-M4.9", "DELETE /products/{id} → 200 archived", pArch.status === 200 && !!(await prisma.accountProduct.findUnique({ where: { id: p2Id }, select: { archivedAt: true } }))?.archivedAt, "archived", `${pArch.status}`);
  const uArch = await call("DELETE", `/units/${unitId}`, W);
  chk("C3-M4.10", "DELETE /units/{id} ที่ยังถูกใช้ → 409 ไทย (หรือ 200 ถ้า service อนุญาต)", uArch.status === 409 || uArch.status === 200, "409/200", `${uArch.status}`, "MINOR");

  // ═══ M5 audit + registry ═══
  const audits = await prisma.auditLog.count({ where: { tenantId: tid, actorType: "API_KEY" as Any } });
  chk("C3-M5.1", "audit API_KEY ≥ 20 แถว", audits >= 20, "≥20", `${audits}`, "MAJOR");
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["contacts.create", "write", "account.contact.manage"], ["contacts.update", "write", "account.contact.manage"], ["contacts.archive", "write", "account.contact.manage"], ["contacts.restore", "write", "account.contact.manage"], ["contacts.merge", "danger", "account.contact.merge"], ["contacts.dismiss-merge", "write", "account.contact.merge"], ["contacts.link", "write", "account.contact.manage"], ["contact-groups.create", "write", "account.contact.manage"], ["contact-groups.add-members", "write", "account.contact.manage"], ["contact-groups.remove-member", "write", "account.contact.manage"], ["products.create", "write", "account.product.manage"], ["products.update", "write", "account.product.manage"], ["products.archive", "write", "account.product.manage"], ["products.set-bundle", "write", "account.product.manage"], ["products.add-opening-lot", "write", "account.product.manage"], ["products.link-inventory", "write", "account.product.manage"], ["products.unlink-inventory", "write", "account.product.manage"], ["units.create", "write", "account.product.manage"], ["units.update", "write", "account.product.manage"], ["units.archive", "write", "account.product.manage"], ["categories.create", "write", "account.product.manage"], ["categories.update", "write", "account.product.manage"], ["categories.archive", "write", "account.product.manage"], ["stock-documents.create", "write", "account.product.manage"], ["stock-documents.approve", "write", "account.product.manage"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("C3-M5.2", "registry มี op ครบ 25 ตัวของ C3 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tidB]) {
    if (!id) continue;
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountProductBundleItem", "accountProductOpeningLot", "accountProduct", "accountUnit", "accountCategory", "accountContactGroupMember", "accountContactGroup", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE master (C3) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
