// QC — HF-POS-PAGES: สิทธิ์หน้าจอ POS ต่อสาขา (หน้าขาย · ประวัติบิล · ปิดวัน + CSV · สินค้า/ราคา)
// persona: ร้านมี 2 สาขา (A, B) ผูก POS เดียวกัน · คนของสาขา A ต้องไม่เห็น/ไม่แตะสาขา B
// รัน: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hf-pos-page-authz.mts
//
// หน้า (server component) เรียกในโปรเซสไม่ได้ (ต้องมี session) ⇒ ตรวจ 3 ชั้น:
//   [guard]  ฟังก์ชันตัดสินสิทธิ์แบบ pure ใน `@/lib/modules/pos/access` (ต่อบุคคล × ต่อหน้า)
//   [data]   ตัวอ่านยอด/บิลจริงบน DB เมื่อจำกัดสาขา (closeDaySummary/closeDayBills/closeDayCsv + where ของหน้าบิล)
//   [static] หน้า/แอ็กชันเรียก guard จริง และไม่มี assertCan ที่ลืม unit เหลืออยู่
// ทุกเคส: OWNER · ผู้จัดการทุกสาขา · แคชเชียร์สาขา A ที่ A · คนสาขา A ขอสาขา B · คนไม่มีสิทธิ์ POS · ร้านอื่น

import { readFileSync } from "node:fs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-pos-page-authz"); // 🔴 กัน prod

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = await import("@/lib/modules/pos/service");
const reg = await import("@/lib/modules/pos/register");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

// ── guard module (ยังไม่มีบน origin/main ⇒ ทุกเคส guard แดง) ──
type Role = "OWNER" | "MANAGER" | "STAFF";
type M = { role: Role; unitAccess: string[]; permissions: Record<string, unknown> };
type Scope = { allUnits: true } | { allUnits: false; unitIds: string[] };
type RegView<T> = { ok: false } | { ok: true; units: T[]; active: T | null };
type Access = {
  posSalesScope: (m: M | null) => Scope | null;
  posScopeUnitIds: (s: Scope) => string[] | undefined;
  posCanSetTenantPrice: (m: M | null, linkedUnitIds: string[]) => boolean;
  posRegisterView: <T extends { id: string }>(m: M | null, linked: T[], unitParam?: string) => RegView<T>;
};
let access: Access | null = null;
try {
  access = (await import("@/lib/modules/pos/access" as string)) as Access;
} catch (e) {
  console.log(`  (guard module โหลดไม่ได้: ${e instanceof Error ? e.message.slice(0, 80) : e})`);
}

const read = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

let tenantId = "";
let tenant2Id = "";
try {
  console.log("── setup: ร้าน 2 สาขา + ร้านอื่น ──");
  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC HF-POS ร้าน 2 สาขา", slug: `qc-hfpos-${stamp}` } });
  tenantId = t.id;
  const uA = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขา A", slug: `a-${stamp}` } });
  const uB = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขา B", slug: `b-${stamp}` } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS ร้าน");
  const posEmpty = await sys.createSystem(tenantId, "POS", "POS ยังไม่ผูก");
  await sys.linkUnit(tenantId, posSys.id, uA.id);
  await sys.linkUnit(tenantId, posSys.id, uB.id);
  const sale = (unitId: string, key: string, amount: number, tid = tenantId, sid = posSys.id) =>
    pos.createSale({
      tenantId: tid, unitId, systemId: sid, idempotencyKey: key,
      lines: [{ name: "สินค้า", qty: 1, unitPriceSatang: amount }],
      payMethods: [{ type: "CASH", amountSatang: amount }],
    });
  const sA = await sale(uA.id, `hf-a-${stamp}`, 10000);
  const sB = await sale(uB.id, `hf-b-${stamp}`, 5000);

  const t2 = await prisma.tenant.create({ data: { name: "QC HF-POS ร้านอื่น", slug: `qc-hfpos2-${stamp}` } });
  tenant2Id = t2.id;
  const u2 = await prisma.businessUnit.create({ data: { tenantId: tenant2Id, type: "BOOKING", name: "ร้านอื่น", slug: `o-${stamp}` } });
  const pos2 = await sys.createSystem(tenant2Id, "POS", "POS ร้านอื่น");
  await sys.linkUnit(tenant2Id, pos2.id, u2.id);
  await sale(u2.id, `hf-o-${stamp}`, 77700, tenant2Id, pos2.id);

  // เลขใบเสร็จนับต่อสาขา (ทั้งคู่ = YYYYMM-0001) ⇒ ตั้งเลขให้ต่างกันเพื่อแยกว่าใครเห็นบิลไหน
  const rA = `QCA-${stamp}`;
  const rB = `QCB-${stamp}`;
  await prisma.posSale.update({ where: { id: sA.saleId }, data: { receiptNo: rA } });
  await prisma.posSale.update({ where: { id: sB.saleId }, data: { receiptNo: rB } });

  // ── บุคคล ──
  const P: Record<string, M> = {
    owner: { role: "OWNER", unitAccess: [], permissions: {} },
    mgrAll: { role: "MANAGER", unitAccess: ["*"], permissions: {} },
    mgrA: { role: "MANAGER", unitAccess: [uA.id], permissions: {} },
    cashierA: { role: "STAFF", unitAccess: [uA.id], permissions: { "pos.sale.create": true } },
    staffAllPrice: { role: "STAFF", unitAccess: ["*"], permissions: { "pos.product.setPrice": true } },
    priceA: { role: "STAFF", unitAccess: [uA.id], permissions: { "pos.product.setPrice": true } },
    noPerm: { role: "STAFF", unitAccess: ["*"], permissions: {} },
    noPermA: { role: "STAFF", unitAccess: [uA.id], permissions: { "booking.*": true } },
  };

  // ── ร้านอื่น: ทุกหน้าเริ่มที่ appSystem.findFirst({id, tenantId, type:POS}) → notFound ──
  console.log("\n── ร้านอื่น (tenant 2 เปิด id ระบบของร้านนี้) ──");
  const cross = await prisma.appSystem.findFirst({ where: { id: posSys.id, tenantId: tenant2Id, type: "POS" } });
  chk("X-1", "ร้านอื่นหา POS ของร้านนี้ไม่เจอ (หน้า → notFound)", cross === null, "null", String(cross?.id));
  const crossUnits = await reg.posUnits(tenant2Id, posSys.id);
  chk("X-2", "ร้านอื่นได้สาขาของ POS นี้ = 0", crossUnits.length === 0, "0", String(crossUnits.length));
  const crossSum = await pos.closeDaySummary({ tenantId: tenant2Id, systemId: posSys.id });
  chk("X-3", "ร้านอื่นยิงสรุปวันด้วย systemId นี้ → 0 บิล", crossSum.billCount === 0, "0", String(crossSum.billCount));

  // ── 1) หน้าประวัติบิล /pos/sales ──
  console.log("\n── /pos/sales (ประวัติบิล) ──");
  const salesFor = async (m: M) => {
    if (!access) return null;
    const scope = access.posSalesScope(m);
    if (!scope) return null;
    const unitIds = access.posScopeUnitIds(scope);
    const rows = await prisma.posSale.findMany({
      where: { tenantId, systemId: posSys.id, ...(unitIds ? { unitId: { in: unitIds } } : {}) },
      select: { receiptNo: true },
    });
    return rows.map((r) => r.receiptNo).sort();
  };
  const both = [rA, rB].sort().join(",");
  const sOwner = await salesFor(P.owner);
  chk("S-1", "OWNER เห็นบิลทั้ง 2 สาขา (control)", sOwner?.join(",") === both, both, String(sOwner));
  const sMgrAll = await salesFor(P.mgrAll);
  chk("S-2", "ผู้จัดการทุกสาขา เห็นทั้ง 2 สาขา", sMgrAll?.join(",") === both, both, String(sMgrAll));
  const sCashA = await salesFor(P.cashierA);
  chk("S-3", "แคชเชียร์ A เห็นบิล A (control)", !!sCashA?.includes(rA), rA, String(sCashA));
  chk("S-4", "แคชเชียร์ A ไม่เห็นบิล B", !!sCashA && !sCashA.includes(rB), `ไม่มี ${rB}`, String(sCashA));
  const sMgrA = await salesFor(P.mgrA);
  chk("S-5", "ผู้จัดการสาขา A เห็นแค่ A", sMgrA?.join(",") === rA, rA, String(sMgrA));
  chk("S-6", "STAFF ไม่มีสิทธิ์ POS (ทุกสาขา) → ปฏิเสธ", !!access && access.posSalesScope(P.noPerm) === null, "null", access ? JSON.stringify(access.posSalesScope(P.noPerm)) : "no guard");
  chk("S-7", "STAFF สาขา A ไม่มีสิทธิ์ POS → ปฏิเสธ", !!access && access.posSalesScope(P.noPermA) === null, "null", access ? JSON.stringify(access.posSalesScope(P.noPermA)) : "no guard");
  const salesPage = read("src/app/app/sys/[id]/pos/sales/page.tsx");
  chk("S-8", "[static] หน้าประวัติบิลเรียก posSalesScope + notFound + กรองสาขาใน where", /posSalesScope\(/.test(salesPage) && /posScopeUnitIds\(/.test(salesPage) && /notFound\(\)/.test(salesPage), "มี", "ไม่ครบ");

  // ── 2) หน้าปิดวัน + CSV ──
  console.log("\n── /pos/close + CSV ──");
  const closeFor = async (m: M) => {
    if (!access) return null;
    const scope = access.posSalesScope(m);
    if (!scope) return null;
    const ctx = { tenantId, systemId: posSys.id, unitIds: access.posScopeUnitIds(scope) };
    const [sum, bills, csv] = await Promise.all([pos.closeDaySummary(ctx), pos.closeDayBills(ctx), pos.closeDayCsv(ctx)]);
    return { net: sum.netSalesSatang, cash: sum.cashInDrawerSatang, bills: bills.map((b) => b.receiptNo), csv };
  };
  const sumA = await pos.closeDaySummary({ tenantId, systemId: posSys.id, unitIds: [uA.id] });
  chk("C-0", "[data] closeDaySummary จำกัดสาขา [A] → 100.00 (ไม่รวม B)", sumA.netSalesSatang === 10000, "10000", String(sumA.netSalesSatang));
  const cOwner = await closeFor(P.owner);
  chk("C-1", "OWNER ยอดวันนี้ = 150.00 ทั้ง 2 สาขา (control)", cOwner?.net === 15000 && cOwner.bills.length === 2, "15000/2", `${cOwner?.net}/${cOwner?.bills.length}`);
  const cMgrAll = await closeFor(P.mgrAll);
  chk("C-2", "ผู้จัดการทุกสาขา ยอด = 150.00", cMgrAll?.net === 15000, "15000", String(cMgrAll?.net));
  const cCashA = await closeFor(P.cashierA);
  chk("C-3", "แคชเชียร์ A ยอด = 100.00 (เฉพาะ A)", cCashA?.net === 10000, "10000", String(cCashA?.net));
  chk("C-4", "แคชเชียร์ A เงินสดควรมี = 100.00 (ไม่รวม B)", cCashA?.cash === 10000, "10000", String(cCashA?.cash));
  chk("C-5", "แคชเชียร์ A รายการบิลไม่มีบิล B", !!cCashA && cCashA.bills.length === 1 && cCashA.bills[0] === rA, rA, String(cCashA?.bills));
  chk("C-6", "CSV ของแคชเชียร์ A ไม่มีเลขบิล B", !!cCashA && cCashA.csv.includes(rA) && !cCashA.csv.includes(rB), `มี ${rA} ไม่มี ${rB}`, cCashA ? `A:${cCashA.csv.includes(rA)} B:${cCashA.csv.includes(rB)}` : "null");
  chk("C-7", "ไม่มีสิทธิ์ POS → ปิดวันปฏิเสธ", !!access && access.posSalesScope(P.noPerm) === null && access.posSalesScope(P.noPermA) === null, "null", "ไม่ null/no guard");
  const closePage = read("src/app/app/sys/[id]/pos/close/page.tsx");
  chk("C-8", "[static] หน้าปิดวันใช้ posSalesScope + ส่ง unitIds + notFound (ไม่เหลือ assertCan ไร้สาขา)", /posSalesScope\(/.test(closePage) && /unitIds/.test(closePage) && /notFound\(\)/.test(closePage) && !/assertCan\(/.test(closePage), "ครบ", "ไม่ครบ");
  const actions = read("src/lib/actions/pos.ts");
  const csvBody = actions.slice(actions.indexOf("export async function exportDaySalesCsvAction"), actions.indexOf("export async function registerSaleAction"));
  chk("C-9", "[static] exportDaySalesCsvAction ใช้ posSalesScope + unitIds", /posSalesScope\(/.test(csvBody) && /unitIds/.test(csvBody), "ครบ", "ไม่ครบ");

  // ── 3) หน้าสินค้า/ราคา + ตั้งราคา (ราคาใช้ทั้งร้าน ⇒ ต้องเข้าได้ทุกสาขา) ──
  console.log("\n── /pos/products + setItemSalePriceAction ──");
  // round 2: "ทุกสาขา" = OWNER · unitAccess "*" · หรือเข้าได้ครบทุกสาขา (ไม่ archived) ที่ผูก POS นี้
  const linkedAB = (await reg.posUnits(tenantId, posSys.id)).map((u) => u.id);
  const can = (m: M, linked: string[] = linkedAB) => (access ? access.posCanSetTenantPrice(m, linked) : null);
  chk("P-1", "OWNER ตั้งราคาได้ (control)", can(P.owner) === true, "true", String(can(P.owner)));
  chk("P-2", "ผู้จัดการทุกสาขา ตั้งราคาได้", can(P.mgrAll) === true, "true", String(can(P.mgrAll)));
  chk("P-3", "STAFF ทุกสาขา + pos.product.setPrice ตั้งราคาได้", can(P.staffAllPrice) === true, "true", String(can(P.staffAllPrice)));
  chk("P-4", "ผู้จัดการสาขา A ตั้งราคาทั้งร้านไม่ได้", can(P.mgrA) === false, "false", String(can(P.mgrA)));
  chk("P-5", "STAFF สาขา A + setPrice ตั้งราคาทั้งร้านไม่ได้", can(P.priceA) === false, "false", String(can(P.priceA)));
  chk("P-6", "ไม่มีสิทธิ์ → ไม่ได้", can(P.noPerm) === false && can(P.cashierA) === false, "false", `${can(P.noPerm)}/${can(P.cashierA)}`);
  // ร้านสาขาเดียว (S) + สาขาที่ archived แล้ว (C) ผูก POS เดียวกัน — C ต้องไม่นับ
  const uS = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขาเดียว", slug: `s-${Date.now()}` } });
  const uC = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "สาขาปิดแล้ว", slug: `c-${Date.now()}` } });
  const posSingle = await sys.createSystem(tenantId, "POS", "POS สาขาเดียว");
  await sys.linkUnit(tenantId, posSingle.id, uS.id);
  await sys.linkUnit(tenantId, posSingle.id, uC.id);
  await prisma.businessUnit.update({ where: { id: uC.id }, data: { status: "ARCHIVED" } });
  const linkedS = (await reg.posUnits(tenantId, posSingle.id)).map((u) => u.id);
  chk("P-9a", "POS สาขาเดียว: posUnits ไม่นับสาขา archived (control)", linkedS.length === 1 && linkedS[0] === uS.id, "1 (S)", String(linkedS.length));
  const mgrS: M = { role: "MANAGER", unitAccess: [uS.id], permissions: {} };
  chk("P-9", "ร้านสาขาเดียว: ผู้จัดการ [S] ตั้งราคาได้ (สาขา archived ไม่นับ)", can(mgrS, linkedS) === true, "true", String(can(mgrS, linkedS)));
  const mgrAB: M = { role: "MANAGER", unitAccess: [uA.id, uB.id], permissions: {} };
  chk("P-10", "ร้าน 2 สาขา: ผู้จัดการ [A,B] ตั้งราคาได้", can(mgrAB) === true, "true", String(can(mgrAB)));
  const staffABPrice: M = { role: "STAFF", unitAccess: [uA.id, uB.id], permissions: { "pos.product.setPrice": true } };
  chk("P-11", "ร้าน 2 สาขา: STAFF [A,B] + setPrice ตั้งราคาได้", can(staffABPrice) === true, "true", String(can(staffABPrice)));
  const staffABSell: M = { role: "STAFF", unitAccess: [uA.id, uB.id], permissions: { "pos.sale.create": true } };
  chk("P-12", "ร้าน 2 สาขา: STAFF [A,B] ไม่มี setPrice → ไม่ได้", can(staffABSell) === false, "false", String(can(staffABSell)));
  chk("P-13", "ร้าน 2 สาขา: ผู้จัดการ [A] เท่านั้น → ไม่ได้", can(P.mgrA) === false, "false", String(can(P.mgrA)));
  chk("P-14", "POS ยังไม่ผูกสาขา: คนจำกัดสาขาไม่ได้ · OWNER ได้", can(mgrS, []) === false && can(P.owner, []) === true, "false/true", `${can(mgrS, [])}/${can(P.owner, [])}`);
  const prodPage = read("src/app/app/sys/[id]/pos/products/page.tsx");
  chk("P-7", "[static] หน้าสินค้าใช้ posCanSetTenantPrice + notFound (ไม่เหลือ assertCan ไร้สาขา)", /posCanSetTenantPrice\(/.test(prodPage) && prodPage.split("\n").some((l) => /posCanSetTenantPrice\(/.test(l) && /posUnits\(/.test(l)) && /notFound\(\)/.test(prodPage) && !/assertCan\(/.test(prodPage), "ครบ", "ไม่ครบ");
  const priceBody = actions.slice(actions.indexOf("export async function setItemSalePriceAction"));
  const priceFn = priceBody.slice(0, priceBody.indexOf("\n}\n") + 2);
  chk("P-8", "[static] setItemSalePriceAction ใช้ posCanSetTenantPrice (ไม่เหลือ assertCan ไร้สาขา)", /posCanSetTenantPrice\(/.test(priceFn) && /posUnits\(/.test(priceFn) && !/assertCan\(/.test(priceFn), "ครบ", "ไม่ครบ");

  // ── 4) หน้าขาย /pos/register ──
  console.log("\n── /pos/register ──");
  const linked = await reg.posUnits(tenantId, posSys.id);
  chk("R-0", "POS ผูก 2 สาขา (control)", linked.length === 2, "2", String(linked.length));
  const view = (m: M, param?: string, units = linked) => (access ? access.posRegisterView(m, units, param) : null);
  const ids = (v: RegView<{ id: string }> | null) => (v && v.ok ? `${v.units.map((u) => u.id === uA.id ? "A" : "B").join("")}@${v.active ? (v.active.id === uA.id ? "A" : "B") : "-"}` : "refused");
  chk("R-1", "OWNER ไม่ระบุสาขา → เห็น A,B · active A (เหมือนเดิม)", ids(view(P.owner)) === "AB@A", "AB@A", ids(view(P.owner)));
  chk("R-2", "OWNER ?unit=B → active B", ids(view(P.owner, uB.id)) === "AB@B", "AB@B", ids(view(P.owner, uB.id)));
  chk("R-3", "ผู้จัดการทุกสาขา ?unit=B → active B", ids(view(P.mgrAll, uB.id)) === "AB@B", "AB@B", ids(view(P.mgrAll, uB.id)));
  chk("R-4", "แคชเชียร์ A → เห็นแค่ A · active A", ids(view(P.cashierA)) === "A@A", "A@A", ids(view(P.cashierA)));
  chk("R-5", "แคชเชียร์ A ขอ ?unit=B → ปฏิเสธ (ไม่โหลดสมาชิก/สินค้าของ B)", ids(view(P.cashierA, uB.id)) === "refused", "refused", ids(view(P.cashierA, uB.id)));
  chk("R-6", "ผู้จัดการสาขา A ขอ ?unit=B → ปฏิเสธ", ids(view(P.mgrA, uB.id)) === "refused", "refused", ids(view(P.mgrA, uB.id)));
  chk("R-7", "แคชเชียร์ A ?unit=ค่ามั่ว → กลับไป A (พฤติกรรมเดิม)", ids(view(P.cashierA, "garbage")) === "A@A", "A@A", ids(view(P.cashierA, "garbage")));
  chk("R-8", "ไม่มีสิทธิ์ POS → ปฏิเสธ", ids(view(P.noPerm)) === "refused" && ids(view(P.noPermA)) === "refused", "refused", `${ids(view(P.noPerm))}/${ids(view(P.noPermA))}`);
  const emptyUnits = await reg.posUnits(tenantId, posEmpty.id);
  const vEmpty = view(P.owner, undefined, emptyUnits);
  chk("R-9", "POS ยังไม่ผูกสาขา → OWNER ยังเห็นหน้าชวนเชื่อม (active ว่าง)", !!vEmpty && vEmpty.ok && vEmpty.active === null, "ok/null", JSON.stringify(vEmpty));
  const vEmptyNo = view(P.noPerm, undefined, emptyUnits);
  chk("R-10", "POS ยังไม่ผูกสาขา → คนไม่มีสิทธิ์ ปฏิเสธ", !!vEmptyNo && !vEmptyNo.ok, "refused", JSON.stringify(vEmptyNo));
  const regPage = read("src/app/app/sys/[id]/pos/register/page.tsx");
  chk("R-11", "[static] หน้าขายใช้ posRegisterView + notFound", /posRegisterView\(/.test(regPage) && /notFound\(\)/.test(regPage) && !/units\.find\(\(u\) => u\.id === unitParam\)/.test(regPage), "ครบ", "ไม่ครบ");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  for (const tid of [tenantId, tenant2Id].filter(Boolean)) {
    const del = async (name: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`); }
    };
    await del("outbox", () => (prisma as never as { outboxEvent?: { deleteMany: (a: unknown) => Promise<unknown> } }).outboxEvent?.deleteMany({ where: { tenantId: tid } }) ?? Promise.resolve());
    await del("posPayment", () => prisma.posPayment.deleteMany({ where: { tenantId: tid } }));
    await del("posLine", () => prisma.posSaleLine.deleteMany({ where: { tenantId: tid } }));
    await del("posSale", () => prisma.posSale.deleteMany({ where: { tenantId: tid } }));
    await del("posCounter", () => prisma.posReceiptCounter.deleteMany({ where: { tenantId: tid } }));
    await del("appSystemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del("appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tid } }));
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: HF-POS-PAGES สิทธิ์หน้าจอ POS ต่อสาขา =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
