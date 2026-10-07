// QC — HF-INV-0: สิทธิ์เข้าหน้าคลัง + id ที่มาจาก client (D14 · D3 + ชนิดเดียวกัน) · oracle-first
// HF-INV-1 R3.8 (ส่วน 12 + HF-10.1): receivePoAction คืนผล { status, message } แทน throw · กดซ้ำไม่รับซ้ำ/ไม่ขึ้น error
// HF-INV-1 R3.7 (HF-11.2): sales ต้องมี pos.sale.create ด้วย — ส่วนรายงานที่เหลืออยู่ใน qc-hf-reports-authz.mts
// HF-INV-1 R3c (C4): การปฏิเสธที่คาดไว้ของรายงาน/รับของ PO กลับมาเป็นข้อมูล (Next ปิดบังข้อความที่ throw ใน production)
//   HF-11.1 นับ "ปฏิเสธ" = throw หรือ { error } ไทย · HF-12.5/12.6 receivePoAction ล้มก่อน try (สิทธิ์ · ระบบผิด) ⇒ { status:"error", message ไทย } ไม่ throw
// ⚠️ standalone-typesafe: โมดูลที่ยังไม่มี (guard.ts) ใช้ dynamic import + `as string` + wide cast
//
// สัญญาที่คุม (ต้องแดงบนโค้ดเดิม origin/main 04d2ade9 · เขียวหลังแก้):
//   src/lib/modules/inventory/guard.ts
//     inventoryCanRead(m) → OWNER/MANAGER ✔ · STAFF ✔ เมื่อมี inventory.item.read | inventory.* | คีย์ inventory.<x> อื่นใด
//       (สิทธิ์เขียน ⇒ อ่านได้ · ห้ามคีย์โมดูลอื่นเปิดหน้าคลัง) · null ✘
//     requireInventoryPage(systemId) → requireTenant → ระบบ {id, tenantId, type INVENTORY} → สิทธิ์อ่าน → ไม่ผ่าน = notFound() (404 ไม่ใช่ 403)
//     findInventoryCtx(tenantId, systemId) → Ctx | null · requireInventoryCtx(…) → Ctx | throw (ไทย)
//   ทุกหน้า src/app/app/sys/[id]/inventory/**/page.tsx + InvHub เรียก requireInventoryPage (static)
//   ทุก server action ของคลัง resolve ระบบ INVENTORY ของร้านก่อนแตะข้อมูล (systemId ระบบอื่น/ร้านอื่น → ไม่มีแถวเกิด)
//   transfer: คลังต้นทาง/ปลายทางต้องมีจริง · ของระบบนี้ · ไม่ถูกปิด (archivedAt) — ไม่งั้น throw ไม่มีอะไรขยับ
//     ติดลบที่ต้นทางยังยอม + needsReview (นโยบายเดิม · qc-warehouse WH-5.1)
//   createPo: supplierId + lines[].itemId ต้องเป็นของระบบนี้ (สินค้า PRODUCT) · receivePo: locationId ผิด → PO ยัง ORDERED
//
// DB: ใช้ฐาน QC ผ่าน qc-env-guard (กัน prod) · แถวชั่วคราวผูก tenant ที่สร้างเอง (slug qc-hfinv-*) · ลบใน finally
// session: ยัด fake `src/lib/core/context.ts` (requireTenant) ลง require.cache ก่อน import action ใด ๆ
//          + fake `next/cache` (revalidatePath นอก request ของ Next ใช้ไม่ได้)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-inventory-authz");

const { readFileSync, readdirSync, statSync, existsSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve, join } = await import("node:path");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

// ── fake session + next/cache (ต้องมาก่อน import โมดูลที่เรียก requireTenant) ──
type Sess = { tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
let SESSION: Sess = { tenantId: "", role: "OWNER", unitAccess: ["*"], permissions: {} };
const req = createRequire(import.meta.url);
const putModule = (absPath: string, exports: Record<string, unknown>) => {
  req.cache[absPath] = { id: absPath, filename: absPath, path: resolve(absPath, ".."), loaded: true, exports, children: [], paths: [] } as never;
};
const ROOT = resolve(import.meta.dirname, "..");
putModule(resolve(ROOT, "src/lib/core/context.ts"), {
  requireTenant: async () => ({
    user: { id: "U-QC-HFINV", email: "qc-hfinv@example.com", name: "QC" },
    memberships: [],
    active: {
      tenantId: SESSION.tenantId,
      tenant: { id: SESSION.tenantId, name: "QC HFINV", status: "ACTIVE" },
      role: SESSION.role,
      unitAccess: SESSION.unitAccess,
      permissions: SESSION.permissions,
    },
  }),
  requireAuth: async () => ({ user: { id: "U-QC-HFINV" }, memberships: [], active: null }),
  requireMembership: async () => ({}),
  getAuth: async () => null,
});
putModule(req.resolve("next/cache"), { revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(f: T) => f });

const { prisma } = await import("@/lib/core/db");
const sysSvc = await import("@/lib/modules/system/service");

type AnyFn = (...a: any[]) => Promise<any>; // any จงใจ: oracle ล้ำหน้าโค้ด (standalone-typesafe)
type Mod = { [k: string]: AnyFn } | null;
const guard = (await import("@/lib/modules/inventory/guard" as string).catch(() => null)) as
  | ({ inventoryCanRead?: (m: unknown) => boolean } & { [k: string]: unknown })
  | null;
const actions = (await import("@/lib/modules/inventory/actions" as string).catch((e) => { console.error("import actions:", e); return null; })) as Mod;
const pactions = (await import("@/lib/modules/inventory/procurement-actions" as string).catch((e) => { console.error("import procurement-actions:", e); return null; })) as Mod;
const svc = (await import("@/lib/modules/inventory/service" as string)) as { [k: string]: AnyFn };
const proc = (await import("@/lib/modules/inventory/procurement" as string)) as { [k: string]: AnyFn };

const isNotFound = (e: unknown) =>
  !!e && typeof e === "object" && /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String((e as { digest?: string }).digest ?? (e as Error).message ?? ""));
const run = async (f: () => unknown): Promise<{ threw: boolean; notFound: boolean; value: unknown; msg: string }> => {
  try { const v = await f(); return { threw: false, notFound: false, value: v, msg: "ไม่ throw" }; }
  catch (e) { return { threw: true, notFound: isNotFound(e), value: undefined, msg: e instanceof Error ? `${e.name}: ${e.message.slice(0, 100)}` : String(e) }; }
};
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
// ตัดคอมเมนต์ก่อน grep (คอมเมนต์เล่าอดีตห้ามนับเป็นโค้ดจริง)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:"'`])\/\/.*$/gm, "$1");
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const OWNER: Sess["role"] = "OWNER";
const tenants: string[] = [];
const stamp = Date.now();
try {
  // ═════════ fixtures: ร้าน A (คลัง 2 ระบบ + POS) · ร้าน B (คลัง) ═════════
  const tA = await prisma.tenant.create({ data: { name: "QC HFINV A", slug: `qc-hfinv-a-${stamp}` } }); tenants.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC HFINV B", slug: `qc-hfinv-b-${stamp}` } }); tenants.push(tB.id);
  const invA = await sysSvc.createSystem(tA.id, "INVENTORY", "คลัง A");
  const invA2 = await sysSvc.createSystem(tA.id, "INVENTORY", "คลัง A2");
  const posA = await sysSvc.createSystem(tA.id, "POS", "POS A");
  const invB = await sysSvc.createSystem(tB.id, "INVENTORY", "คลัง B");
  const ctxA = { tenantId: tA.id, systemId: invA.id };
  const ctxA2 = { tenantId: tA.id, systemId: invA2.id };
  const ctxB = { tenantId: tB.id, systemId: invB.id };

  const defA = await svc.ensureDefaultLocation(ctxA);
  const brA = await svc.createLocation(ctxA, { name: "สาขา 2" });
  const archA = await svc.createLocation(ctxA, { name: "คลังที่ปิดแล้ว" });
  await prisma.invLocation.update({ where: { id: archA.id }, data: { archivedAt: new Date() } });
  const locA2 = await svc.ensureDefaultLocation(ctxA2);
  const locB = await svc.ensureDefaultLocation(ctxB);
  const item = await svc.createItem(ctxA, { sku: "HF-01", name: "น้ำดื่ม", costSatang: 1000 });
  await svc.receive(ctxA, { itemId: item.id, qty: 10, costSatang: 1000, idempotencyKey: `hfinv-seed-${stamp}` });
  const svcItem = await svc.createItem(ctxA, { sku: "HF-SV", name: "ค่าบริการ", kind: "SERVICE" });
  const itemA2 = await svc.createItem(ctxA2, { sku: "HF-A2", name: "ของระบบ A2" });
  const itemB = await svc.createItem(ctxB, { sku: "HF-B", name: "ของร้าน B" });
  const supA = await proc.createSupplier(ctxA, { name: "ผู้ขาย A" });
  const supA2 = await proc.createSupplier(ctxA2, { name: "ผู้ขาย A2" });

  const stockAt = async (loc: string) => (await prisma.invLocationStock.findFirst({ where: { itemId: item.id, locationId: loc } }))?.onHand ?? null;
  const totalOnHand = async () => (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand ?? null;
  const rowsUnder = async (systemId: string) => {
    const [a, b, c, d, e, f, g] = await Promise.all([
      prisma.invItem.count({ where: { systemId } }), prisma.invLocation.count({ where: { systemId } }),
      prisma.supplier.count({ where: { systemId } }), prisma.invSettings.count({ where: { systemId } }),
      prisma.invCategory.count({ where: { systemId } }), prisma.invMovement.count({ where: { systemId } }),
      prisma.purchaseOrder.count({ where: { systemId } }),
    ]);
    return a + b + c + d + e + f + g;
  };

  // ═════════ 1) pure: inventoryCanRead ═════════
  const canRead = typeof guard?.inventoryCanRead === "function" ? guard.inventoryCanRead : null;
  if (!canRead) chk("HF-1.0", "guard.ts export inventoryCanRead", false, "มี", "ยังไม่มี");
  else {
    const m = (role: string, permissions: Record<string, unknown> = {}, unitAccess = ["*"]) => ({ role, unitAccess, permissions });
    const cases: [string, unknown, boolean][] = [
      ["OWNER", m("OWNER"), true],
      ["MANAGER (จำกัดสาขา)", m("MANAGER", {}, ["u1"]), true],
      ["STAFF + inventory.item.read", m("STAFF", { "inventory.item.read": true }), true],
      ["STAFF + inventory.*", m("STAFF", { "inventory.*": true }), true],
      ["STAFF + inventory.movement.receive อย่างเดียว (เขียน ⇒ อ่าน)", m("STAFF", { "inventory.movement.receive": true }), true],
      ["STAFF เปล่า", m("STAFF"), false],
      ["STAFF มีแต่ pos.* / account.*", m("STAFF", { "pos.*": true, "account.product.manage": true }), false],
      ["STAFF inventory.item.read=false", m("STAFF", { "inventory.item.read": false }), false],
      ["null", null, false],
    ];
    cases.forEach(([n, mm, exp], i) => { const act = canRead(mm); chk(`HF-1.${i + 1}`, `inventoryCanRead: ${n}`, act === exp, String(exp), String(act)); });
  }

  // ═════════ 2) page guard (404 ไม่ใช่ 403) ═════════
  const reqPage = typeof guard?.requireInventoryPage === "function" ? (guard.requireInventoryPage as AnyFn) : null;
  if (!reqPage) chk("HF-2.0", "guard.ts export requireInventoryPage", false, "มี", "ยังไม่มี");
  else {
    const asS = async (s: Partial<Sess>, sysId: string) => { SESSION = { tenantId: tA.id, role: OWNER, unitAccess: ["*"], permissions: {}, ...s }; return run(() => reqPage(sysId)); };
    const o = await asS({}, invA.id);
    chk("HF-2.1", "OWNER เปิดหน้าคลังของร้านตัวเองได้ (คืน ctx ของระบบนี้)", !o.threw && (o.value as { ctx?: { systemId?: string } })?.ctx?.systemId === invA.id, "ผ่าน + ctx", o.msg);
    const mg = await asS({ role: "MANAGER", unitAccess: ["u-other"] }, invA.id);
    chk("HF-2.2", "MANAGER เปิดได้", !mg.threw, "ผ่าน", mg.msg);
    const sr = await asS({ role: "STAFF", permissions: { "inventory.item.read": true } }, invA.id);
    chk("HF-2.3", "STAFF + inventory.item.read เปิดได้", !sr.threw, "ผ่าน", sr.msg);
    const s0 = await asS({ role: "STAFF", permissions: { "pos.sale.create": true } }, invA.id);
    chk("HF-2.4", "STAFF ไม่มีสิทธิ์คลัง → 404 (ไม่เห็นต้นทุน/ผู้ขาย)", s0.notFound, "notFound", s0.msg);
    const np = await asS({}, posA.id);
    chk("HF-2.5", "id ระบบ POS ของร้านเดียวกัน → 404", np.notFound, "notFound", np.msg);
    const ot = await asS({}, invB.id);
    chk("HF-2.6", "id ระบบคลังของร้านอื่น → 404", ot.notFound, "notFound", ot.msg);
  }

  // ═════════ 3) static (round 2 · N9): ทีละหน้า/ทีละ action + พิสูจน์ด้วยการกลายพันธุ์ ═════════
  const PAGES_DIR = resolve(ROOT, "src/app/app/sys/[id]/inventory");
  const pages: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^(page|route)\.tsx?$/.test(f)) pages.push(p); } };
  walk(PAGES_DIR);
  // หน้า "ผ่านด่าน" = await ตัวแรกหลัง `await params` คือ requireInventoryPage(
  const pageGuardedFirst = (src: string) => {
    const body = strip(src);
    const calls = [...body.matchAll(/await\s+([\w.]+)\s*\(/g)].map((m) => m[1]);
    return calls.length > 0 && calls[0] === "requireInventoryPage";
  };
  const badPages = pages.filter((p) => !pageGuardedFirst(read(p)));
  chk("HF-3.1", `[static] ทุกหน้าใต้ /inventory (${pages.length}) — await แรก (หลัง params) คือ requireInventoryPage(`, pages.length >= 7 && badPages.length === 0, "0 หน้าหลุด", badPages.map((p) => p.slice(PAGES_DIR.length)).join(",") || `${pages.length} หน้า`);
  // ผู้ import Inv*Section/InvHub ทุกไฟล์ต้องอยู่ในชุดที่ผ่านด่าน (7 หน้า + หน้า /app/sys/[id] ที่ import InvHub ซึ่งกั้นตัวเอง)
  const SRC_ROOT = resolve(ROOT, "src");
  const allSrc: string[] = [];
  const walkSrc = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walkSrc(p); else if (/\.(tsx?|mts)$/.test(f)) allSrc.push(p); } };
  walkSrc(SRC_ROOT);
  const UI_FILE = resolve(ROOT, "src/lib/modules/inventory/ui.tsx");
  const importers = allSrc.filter((f) => f !== UI_FILE && /import\s*\{[^}]*\bInv\w*Section\b[^}]*\}\s*from\s*["']@\/lib\/modules\/inventory\/ui["']/.test(read(f)));
  const strayImporters = importers.filter((f) => !pages.includes(f));
  chk("HF-3.1b", `[static] ผู้ import Inv*Section (${importers.length} ไฟล์) อยู่ในชุดหน้าที่ผ่านด่านทั้งหมด`, importers.length >= 7 && strayImporters.length === 0, "0 ไฟล์นอกชุด", strayImporters.map((f) => f.slice(ROOT.length)).join(",") || `${importers.length}`);
  const ui = strip(read(UI_FILE));
  const fnBody = (src: string, name: string) => { const i = src.search(new RegExp(`export async function ${name}\\b`)); if (i < 0) return ""; const j = src.slice(i + 10).search(/\nexport /); return j < 0 ? src.slice(i) : src.slice(i, i + 10 + j); };
  const sectionGuardedFirst = (body: string) => { const calls = [...body.matchAll(/await\s+([\w.]+)\s*\(/g)].map((m) => m[1]); return calls[0] === "requireInventoryPage"; };
  const SECTIONS = ["InvHub", "InvItemsSection", "InvCountSection", "InvMovementsSection", "InvLocationsSection", "InvProcurementSection", "InvServicesSection", "InvSettingsSection"];
  const exportedSections = [...ui.matchAll(/^export async function (Inv\w*)\(/gm)].map((m) => m[1]);
  const badSections = SECTIONS.filter((n) => !sectionGuardedFirst(fnBody(ui, n)));
  chk("HF-3.2", "[static] Inv*Section + InvHub ทุกตัว await requireInventoryPage( เป็นตัวแรก (N7 · กันผู้ import ในอนาคต)", badSections.length === 0 && exportedSections.every((n) => SECTIONS.includes(n)), "8/8 · ไม่มี section ใหม่ที่ไม่อยู่ในรายการ", `หลุด ${badSections.join(",") || "-"} · exported ${exportedSections.join(",")}`);
  // ทีละ action (26 ชื่อ) — resolve ระบบ INVENTORY ในตัวเอง · ไม่มี ctx จาก systemId ดิบ
  const ACTIONS_EXPECTED: Record<string, string[]> = {
    "actions.ts": ["createItemAction", "updateItemAction", "archiveItemAction", "receiveAction", "consumeAction", "bulkCountAction", "importItemsAction", "createLocationAction", "transferAction", "itemLotsAction", "findItemByBarcodeAction", "createServiceAction", "updateServiceAction", "saveCategoryAction", "removeCategoryAction", "saveSettingsAction", "uploadItemImageAction", "removeItemImageAction", "setPrimaryImageAction"],
    "procurement-actions.ts": ["createSupplierAction", "enableVendorPortalAction", "disableVendorPortalAction", "createPoAction", "markOrderedAction", "receivePoAction", "cancelPoAction"],
  };
  const actionResolves = (body: string) =>
    /(requireInventoryCtx|findInventoryCtx)\(/.test(body) && !/\{\s*tenantId:\s*auth\.active\.tenantId,\s*systemId\s*\}/.test(body) &&
    (!/uploadFile\(/.test(body) || body.search(/(requireInventoryCtx|findInventoryCtx)\(/) < body.indexOf("uploadFile("));
  const actionSrc: Record<string, string> = {};
  for (const [f, names] of Object.entries(ACTIONS_EXPECTED)) {
    const src = strip(read(resolve(ROOT, "src/lib/modules/inventory", f))); actionSrc[f] = src;
    const exported = [...src.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
    chk(`HF-3.3.${f}`, `[static] ${f}: ชุด action ที่ export = รายการที่ตรวจ (${names.length}) — มี action ใหม่ต้องเพิ่มเข้าข้อสอบ`, exported.length === names.length && names.every((n) => exported.includes(n)), names.join(","), exported.join(","));
    for (const n of names) chk(`HF-3.4.${n}`, `[static] ${n} resolve ระบบ INVENTORY ของร้านก่อนแตะข้อมูล (ไม่มี ctx จาก systemId ดิบ)`, actionResolves(fnBody(src, n)), "resolve", fnBody(src, n).slice(0, 80).replace(/\s+/g, " "));
  }
  // พิสูจน์ด้วยการกลายพันธุ์ (ในหน่วยความจำ ไม่แตะไฟล์): ถอดด่านแล้วตัวตรวจต้องแดง
  const pageSample = read(pages.find((p) => p.includes("/procurement/")) ?? pages[0]);
  const mutPage = pageSample.replace(/await\s+requireInventoryPage\(/, "await Promise.resolve(");
  chk("HF-3.9a", "[mutation] ถอด requireInventoryPage ออกจากหน้า procurement → ตัวตรวจหน้า (HF-3.1) แดง", pageGuardedFirst(pageSample) && mutPage !== pageSample && !pageGuardedFirst(mutPage), "true→false", `${pageGuardedFirst(pageSample)}→${pageGuardedFirst(mutPage)}`);
  const tfBody = fnBody(actionSrc["actions.ts"], "transferAction");
  const mutTf = tfBody.replace(/await\s+requireInventoryCtx\(auth\.active\.tenantId,\s*systemId\)/, "{ tenantId: auth.active.tenantId, systemId }");
  chk("HF-3.9b", "[mutation] เปลี่ยน transferAction กลับเป็น ctx ดิบ → ตัวตรวจ action (HF-3.4) แดง", actionResolves(tfBody) && mutTf !== tfBody && !actionResolves(mutTf), "true→false", `${actionResolves(tfBody)}→${actionResolves(mutTf)}`);
  const upBody = fnBody(actionSrc["actions.ts"], "uploadItemImageAction");
  const mutUp = upBody.replace(/const ctx = await findInventoryCtx\([^;]*;\s*if \(!ctx\)[^;]*;/, "").replace(/addItemImage\(ctx/, "addItemImage(await findInventoryCtx(auth.active.tenantId, systemId)");
  chk("HF-3.9c", "[mutation] ย้ายการตรวจระบบไปหลัง uploadFile → ตัวตรวจ action แดง", actionResolves(upBody) && mutUp !== upBody && !actionResolves(mutUp), "true→false", `${actionResolves(upBody)}→${actionResolves(mutUp)}`);

  // ═════════ 4) action ที่ส่ง systemId ระบบอื่น/ร้านอื่น → ไม่มีแถวเกิด ═════════
  if (!actions || !pactions) chk("HF-4.0", "import actions ได้", false, "ได้", "ไม่ได้");
  else {
    SESSION = { tenantId: tA.id, role: OWNER, unitAccess: ["*"], permissions: {} };
    const before = { pos: await rowsUnder(posA.id), b: await rowsUnder(invB.id) };
    const bogusCalls: [string, (sid: string) => Promise<unknown>][] = [
      ["createItemAction", (sid) => actions.createItemAction(fd({ systemId: sid, sku: `X-${sid.slice(-4)}`, name: "ของปลอม", cost: "5" }))],
      ["createServiceAction", (sid) => actions.createServiceAction(fd({ systemId: sid, name: "บริการปลอม", sku: `SV-${sid.slice(-4)}` }))],
      ["createLocationAction", (sid) => actions.createLocationAction(fd({ systemId: sid, name: "คลังปลอม" }))],
      ["saveCategoryAction", (sid) => actions.saveCategoryAction(fd({ systemId: sid, name: "หมวดปลอม" }))],
      ["saveSettingsAction", (sid) => actions.saveSettingsAction(fd({ systemId: sid, skuPrefix: "ZZ" }))],
      ["createSupplierAction", (sid) => pactions.createSupplierAction(fd({ systemId: sid, name: "ผู้ขายปลอม" }))],
      ["importItemsAction", (sid) => actions.importItemsAction(sid, null, fd({ csv: "name,sku\nของนำเข้า,IMP-HF" }))],
    ];
    for (const [label, sid] of [["POS ร้านเดียวกัน", posA.id], ["คลังร้านอื่น", invB.id]] as const) {
      const res: string[] = [];
      for (const [n, call] of bogusCalls) { const r = await run(() => call(sid)); res.push(`${n}:${r.threw ? "throw" : JSON.stringify(r.value ?? null).slice(0, 30)}`); }
      const after = await rowsUnder(sid);
      const base = sid === posA.id ? before.pos : before.b;
      chk(`HF-4.${label === "POS ร้านเดียวกัน" ? 1 : 2}`, `action สร้างของด้วย systemId ${label} → ไม่มีแถวเกิดใต้ระบบนั้น (7 action)`, after === base, `${base} แถว`, `${after} แถว · ${res.join(" ")}`.slice(0, 300));
    }
    // movement action ด้วย systemId ร้านอื่น แต่ itemId ของร้านอื่นจริง → ต้องไม่ขยับสต็อกร้าน B
    const beforeB = (await prisma.invItem.findUnique({ where: { id: itemB.id } }))?.onHand;
    const rr = await run(() => actions.receiveAction(fd({ systemId: invB.id, itemId: itemB.id, qty: "50", cost: "1" })));
    const afterB = (await prisma.invItem.findUnique({ where: { id: itemB.id } }))?.onHand;
    chk("HF-4.3", "receiveAction ด้วย systemId+itemId ของร้านอื่น → สต็อกร้านอื่นไม่ขยับ", afterB === beforeB && rr.threw, `${beforeB} + throw`, `${afterB} · ${rr.msg}`);
    const bc = await run(() => actions.bulkCountAction(posA.id, { status: "idle" }, fd({ countItemId: item.id, countQty: "99" })));
    chk("HF-4.4", "bulkCountAction ด้วย id ระบบ POS → ไม่สำเร็จ + สต็อกคง 10", (await totalOnHand()) === 10 && (bc.threw || (bc.value as { status?: string })?.status === "error"), "error/10", `${JSON.stringify(bc.value ?? bc.msg).slice(0, 80)} · ${await totalOnHand()}`);
    const lots = await run(() => actions.itemLotsAction(invB.id, itemB.id));
    chk("HF-4.5", "itemLotsAction (read) ด้วย systemId ร้านอื่น → ไม่คืนข้อมูล", lots.threw || (Array.isArray(lots.value) && lots.value.length === 0), "[]/throw", lots.msg);
    // คู่บวก: ระบบคลังจริงของร้านตัวเอง → สร้างได้
    const okc = await run(() => actions.createItemAction(fd({ systemId: invA.id, sku: "HF-OK", name: "ของจริง" })));
    chk("HF-4.6", "คู่บวก: createItemAction ระบบคลังจริง → สร้างได้", !okc.threw && (await prisma.invItem.count({ where: { systemId: invA.id, sku: "HF-OK" } })) === 1, "1 แถว", okc.msg);
    // สิทธิ์: STAFF ไม่มีคีย์ → ถูกปฏิเสธ (ของเดิม · กันถอยหลัง)
    SESSION = { tenantId: tA.id, role: "STAFF", unitAccess: ["*"], permissions: {} };
    const st = await run(() => actions.transferAction(fd({ systemId: invA.id, itemId: item.id, fromLocationId: defA.id, toLocationId: brA.id, qty: "1" })));
    chk("HF-4.7", "STAFF ไม่มี inventory.movement.transfer → ปฏิเสธ + สต็อกคง", st.threw && (await stockAt(defA.id)) === 10, "throw/10", `${st.msg} · ${await stockAt(defA.id)}`);
    SESSION = { tenantId: tA.id, role: OWNER, unitAccess: ["*"], permissions: {} };
  }

  // ═════════ 5) D3 transfer: location id จาก client ═════════
  const tfBad: [string, string, string][] = [
    ["HF-5.1", "ต้นทาง = id มั่ว", `fake-${stamp}`],
    ["HF-5.2", "ต้นทาง = คลังของระบบคลังอื่นในร้านเดียวกัน", locA2.id],
    ["HF-5.3", "ต้นทาง = คลังของร้านอื่น", locB.id],
    ["HF-5.4", "ต้นทาง = คลังที่ปิดแล้ว (archived)", archA.id],
  ];
  for (const [id, n, from] of tfBad) {
    const r = await run(() => svc.transfer(ctxA, { itemId: item.id, fromLocationId: from, toLocationId: brA.id, qty: 3, idempotencyKey: `hfinv-${id}-${stamp}` }));
    const phantom = await prisma.invLocationStock.count({ where: { itemId: item.id, locationId: from } });
    chk(id, `transfer ${n} → throw · ไม่มีแถวสต็อกผี · สาขา 2 ไม่ได้ของ`, r.threw && phantom === 0 && ((await stockAt(brA.id)) ?? 0) === 0 && (await totalOnHand()) === 10, "throw/0/0/10", `${r.msg} · phantom ${phantom} · br ${await stockAt(brA.id)}`);
  }
  const rTo = await run(() => svc.transfer(ctxA, { itemId: item.id, fromLocationId: defA.id, toLocationId: `fake-to-${stamp}`, qty: 3, idempotencyKey: `hfinv-to-${stamp}` }));
  chk("HF-5.5", "transfer ปลายทาง = id มั่ว → throw · ต้นทางไม่ลด", rTo.threw && (await stockAt(defA.id)) === 10, "throw/10", `${rTo.msg} · ${await stockAt(defA.id)}`);
  if (actions) {
    const ra = await run(() => actions.transferAction(fd({ systemId: invA.id, itemId: item.id, fromLocationId: `fake-a-${stamp}`, toLocationId: brA.id, qty: "4" })));
    chk("HF-5.6", "transferAction (ฟอร์ม) ต้นทางมั่ว → throw · สาขา 2 ไม่ได้ของ", ra.threw && ((await stockAt(brA.id)) ?? 0) === 0, "throw/0", `${ra.msg} · ${await stockAt(brA.id)}`);
    const rp = await run(() => actions.transferAction(fd({ systemId: posA.id, itemId: item.id, fromLocationId: defA.id, toLocationId: brA.id, qty: "4" })));
    chk("HF-5.7", "transferAction ด้วย id ระบบ POS → throw · ไม่ขยับ", rp.threw && (await stockAt(defA.id)) === 10, "throw/10", `${rp.msg} · ${await stockAt(defA.id)}`);
  }
  // คู่บวก: โอนจริงขยับจริง + ติดลบยังยอมตามนโยบายเดิม
  const ok1 = await run(() => svc.transfer(ctxA, { itemId: item.id, fromLocationId: defA.id, toLocationId: brA.id, qty: 4, idempotencyKey: `hfinv-ok1-${stamp}` }));
  chk("HF-5.8", "คู่บวก: โอน 4 คลังหลัก→สาขา 2 → 6/4 รวม 10", !ok1.threw && (await stockAt(defA.id)) === 6 && (await stockAt(brA.id)) === 4 && (await totalOnHand()) === 10, "6/4/10", `${ok1.msg} · ${await stockAt(defA.id)}/${await stockAt(brA.id)}`);
  const ok2 = await run(() => svc.transfer(ctxA, { itemId: item.id, fromLocationId: brA.id, toLocationId: defA.id, qty: 9, idempotencyKey: `hfinv-ok2-${stamp}` }));
  const outMv = await prisma.invMovement.findFirst({ where: { tenantId: tA.id, idempotencyKey: `hfinv-ok2-${stamp}-out` } });
  chk("HF-5.9", "คู่บวก: โอนเกินยอด → ยอม (นโยบายเดิม) สาขา 2 = -5 + needsReview", !ok2.threw && (await stockAt(brA.id)) === -5 && outMv?.needsReview === true, "-5/review", `${ok2.msg} · ${await stockAt(brA.id)}`);
  if (actions) {
    const ok3 = await run(() => actions.transferAction(fd({ systemId: invA.id, itemId: item.id, fromLocationId: defA.id, toLocationId: brA.id, qty: "5" })));
    chk("HF-5.10", "คู่บวก: transferAction ฟอร์มจริง → สาขา 2 กลับเป็น 0", !ok3.threw && (await stockAt(brA.id)) === 0 && (await totalOnHand()) === 10, "0/10", `${ok3.msg} · ${await stockAt(brA.id)}`);
  }
  // receive/consume: locationId ข้ามระบบถูกกันอยู่แล้ว (WO 4.1) — กันถอยหลัง
  const rc = await run(() => svc.receive(ctxA, { itemId: item.id, qty: 1, costSatang: 1, idempotencyKey: `hfinv-rc-${stamp}`, locationId: locB.id }));
  const cs = await run(() => svc.consume(ctxA, { itemId: item.id, qty: 1, idempotencyKey: `hfinv-cs-${stamp}`, locationId: `fake-cs-${stamp}` }));
  chk("HF-5.11", "receive/consume คลังร้านอื่น/มั่ว → throw ทั้งคู่ (กันถอยหลัง)", rc.threw && cs.threw && (await totalOnHand()) === 10, "throw/throw/10", `${rc.msg} | ${cs.msg}`);

  // ═════════ 6) PO: supplierId · lines[].itemId · receive locationId ═════════
  const poCount = async () => prisma.purchaseOrder.count({ where: { systemId: invA.id } });
  const p0 = await poCount();
  const poBad: [string, string, string, string][] = [
    ["HF-6.1", "ผู้ขาย id มั่ว", `fake-sup-${stamp}`, item.id],
    ["HF-6.2", "ผู้ขายของระบบคลังอื่น", supA2.id, item.id],
    ["HF-6.3", "สินค้าของระบบคลังอื่น", supA.id, itemA2.id],
    ["HF-6.4", "สินค้าของร้านอื่น", supA.id, itemB.id],
    ["HF-6.5", "รายการเป็นบริการ (ไม่มีสต็อก)", supA.id, svcItem.id],
  ];
  for (const [id, n, supplierId, itemId] of poBad) {
    const r = await run(() => proc.createPo(ctxA, { supplierId, lines: [{ itemId, qty: 2, costSatang: 100 }] }));
    chk(id, `createPo ${n} → throw · ไม่มี PO เกิด`, r.threw && (await poCount()) === p0, `throw/${p0}`, `${r.msg} · ${await poCount()}`);
  }
  if (pactions) {
    const ra = await run(() => pactions.createPoAction(fd({ systemId: invA.id, supplierId: `fake-sup2-${stamp}`, lineItemId: item.id, lineQty: "2", lineCost: "1" })));
    chk("HF-6.6", "createPoAction (ฟอร์ม) ผู้ขายมั่ว → ไม่มี PO เกิด", (await poCount()) === p0, String(p0), `${await poCount()} · ${ra.msg}`);
  }
  const goodPo = await run(() => proc.createPo(ctxA, { supplierId: supA.id, lines: [{ itemId: item.id, qty: 2, costSatang: 100 }] }));
  chk("HF-6.7", "คู่บวก: createPo ผู้ขาย+สินค้าจริง → สร้างได้", !goodPo.threw && (await poCount()) === p0 + 1, String(p0 + 1), goodPo.msg);
  const poId = (goodPo.value as { id?: string } | undefined)?.id;
  if (poId) {
    await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: "ORDERED" } });
    const bad = await run(() => proc.receivePo(ctxA, poId, { locationId: locB.id }));
    const st1 = (await prisma.purchaseOrder.findUnique({ where: { id: poId } }))?.status;
    chk("HF-6.8", "receivePo คลังของร้านอื่น → PO ยัง ORDERED (รับใหม่ได้) · สต็อกไม่ขยับ", st1 === "ORDERED" && (await totalOnHand()) === 10, "ORDERED/10", `${st1} · ${await totalOnHand()} · ${bad.threw ? bad.msg : JSON.stringify(bad.value)}`);
    const good = await run(() => proc.receivePo(ctxA, poId, { locationId: brA.id }));
    const st2 = (await prisma.purchaseOrder.findUnique({ where: { id: poId } }))?.status;
    chk("HF-6.9", "คู่บวก: receivePo คลังจริง → RECEIVED + สาขา 2 ได้ 2 · รวม 12", st2 === "RECEIVED" && (await stockAt(brA.id)) === 2 && (await totalOnHand()) === 12, "RECEIVED/2/12", `${st2} · ${await stockAt(brA.id)} · ${await totalOnHand()} · ${good.msg}`);
  }

  // ═════════════════════ ROUND 2 ═════════════════════
  const asSess = (s: Partial<Sess>) => { SESSION = { tenantId: tA.id, role: OWNER, unitAccess: ["*"], permissions: {}, ...s }; };
  const STAFF = (permissions: Record<string, unknown>): Partial<Sess> => ({ role: "STAFF", permissions });

  // ═════════ 7) S1: หน้าจัดซื้อต้องมีสิทธิ์จัดซื้อ/อ่านสินค้า · ลิงก์ผู้ขายเฉพาะคนที่หมุนลิงก์ได้ ═════════
  const PROC = (guard as { INVENTORY_PROCUREMENT_KEYS?: unknown } | null)?.INVENTORY_PROCUREMENT_KEYS;
  const perms = (await import("@/lib/core/permissions" as string)) as { PERMISSIONS: { key: string }[] };
  const expectProc = perms.PERMISSIONS.map((p) => p.key).filter((k) => k === "inventory.item.read" || k.startsWith("inventory.supplier.") || k.startsWith("inventory.po."));
  chk("HF-7.1", "guard export INVENTORY_PROCUREMENT_KEYS = item.read + supplier.* + po.* (ชื่อจริงจาก permissions.ts)", Array.isArray(PROC) && PROC.length === expectProc.length && expectProc.every((k) => (PROC as string[]).includes(k)), expectProc.join(","), JSON.stringify(PROC ?? null));
  const reqPage2 = typeof guard?.requireInventoryPage === "function" ? (guard.requireInventoryPage as AnyFn) : null;
  if (reqPage2 && Array.isArray(PROC)) {
    const procCase = async (s: Partial<Sess>) => { asSess(s); return run(() => reqPage2(invA.id, { anyOf: PROC })); };
    const c1 = await procCase(STAFF({ "inventory.movement.consume": true }));
    chk("HF-7.2", "หน้าจัดซื้อ: STAFF มีแค่ inventory.movement.consume → 404 (ไม่เห็นเบอร์/อีเมลผู้ขาย ยอด PO ลิงก์ผู้ขาย)", c1.notFound, "notFound", c1.msg);
    for (const [id, k] of [["HF-7.3", "inventory.po.create"], ["HF-7.4", "inventory.supplier.update"], ["HF-7.5", "inventory.item.read"], ["HF-7.6", "inventory.*"]] as const) {
      const c = await procCase(STAFF({ [k]: true }));
      chk(id, `หน้าจัดซื้อ: STAFF + ${k} → เปิดได้`, !c.threw, "ผ่าน", c.msg);
    }
    const cm = await procCase({ role: "MANAGER" });
    chk("HF-7.7", "หน้าจัดซื้อ: MANAGER เปิดได้", !cm.threw, "ผ่าน", cm.msg);
    asSess(STAFF({ "inventory.movement.consume": true }));
    const other = await run(() => reqPage2(invA.id));
    chk("HF-7.8", "หน้าอื่น (ไม่ส่ง anyOf): STAFF consume อย่างเดียว → ยังเปิดได้ (กฎคีย์ใดก็ได้เดิม)", !other.threw, "ผ่าน", other.msg);
  } else chk("HF-7.2", "requireInventoryPage(id, { anyOf }) + INVENTORY_PROCUREMENT_KEYS", false, "มี", "ยังไม่มี");
  const procPageSrc = strip(read(resolve(ROOT, "src/app/app/sys/[id]/inventory/procurement/page.tsx")));
  chk("HF-7.9", "[static] หน้า procurement ส่ง anyOf: INVENTORY_PROCUREMENT_KEYS ให้ด่าน", /requireInventoryPage\(\s*id\s*,\s*\{\s*anyOf:\s*INVENTORY_PROCUREMENT_KEYS\s*\}\s*\)/.test(procPageSrc), "มี", procPageSrc.match(/requireInventoryPage\([^)]*\)/)?.[0] ?? "ไม่มี");
  // render จริง: ลิงก์ผู้ขาย (bearer URL) โผล่เฉพาะคนที่มี inventory.supplier.update
  const uiMod = (await import("@/lib/modules/inventory/ui" as string).catch((e) => { console.error("import ui:", e instanceof Error ? e.message : e); return null; })) as { [k: string]: AnyFn } | null;
  const { token } = await proc.enableVendorPortal(ctxA, supA.id);
  const treeHas = (node: unknown, needle: string, seen = new Set<unknown>()): boolean => {
    if (node == null) return false;
    if (typeof node === "string") return node.includes(needle);
    if (typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some((n) => treeHas(n, needle, seen));
    const el = node as { props?: unknown };
    if ("props" in el) return treeHas(el.props, needle, seen);
    return Object.values(node as Record<string, unknown>).some((v) => treeHas(v, needle, seen));
  };
  if (!uiMod) chk("HF-7.10", "import inventory/ui ได้ (render section ในข้อสอบ)", false, "ได้", "ไม่ได้");
  else {
    const renderProc = async (s: Partial<Sess>) => { asSess(s); return run(() => uiMod.InvProcurementSection({ systemId: invA.id })); };
    const rOwner = await renderProc({});
    chk("HF-7.10", "คู่บวก: OWNER เห็นลิงก์ผู้ขาย (/vendor/<token>) ในหน้าจัดซื้อ", !rOwner.threw && treeHas(rOwner.value, `/vendor/${token}`), "มีลิงก์", rOwner.msg);
    const rPo = await renderProc(STAFF({ "inventory.po.create": true }));
    chk("HF-7.11", "STAFF inventory.po.create (ไม่มี supplier.update) → ไม่มีลิงก์ผู้ขายใน output", !rPo.threw && !treeHas(rPo.value, `/vendor/${token}`) && !treeHas(rPo.value, token), "ไม่มีลิงก์", `${rPo.msg} · มีลิงก์=${treeHas(rPo.value, token)}`);
    const rSu = await renderProc(STAFF({ "inventory.supplier.update": true }));
    chk("HF-7.12", "STAFF inventory.supplier.update → เห็นลิงก์ผู้ขาย", !rSu.threw && treeHas(rSu.value, `/vendor/${token}`), "มีลิงก์", rSu.msg);

    // ═════════ 8) N7: ทุก section กั้นตัวเอง (เรียกตรงด้วย systemId ดิบ) ═════════
    const SECTION_NAMES = ["InvHub", "InvItemsSection", "InvCountSection", "InvMovementsSection", "InvLocationsSection", "InvProcurementSection", "InvServicesSection", "InvSettingsSection"];
    const posRowsBefore = await rowsUnder(posA.id);
    const leaked: string[] = [];
    for (const n of SECTION_NAMES) {
      asSess(STAFF({ "pos.sale.create": true }));
      const a = await run(() => uiMod[n]({ systemId: invA.id }));
      asSess({});
      const b = await run(() => uiMod[n]({ systemId: posA.id }));
      if (!a.notFound || !b.notFound) leaked.push(`${n}(${a.notFound ? "" : "staff-render"}${b.notFound ? "" : " pos-render"})`);
    }
    chk("HF-8.1", "เรียก Inv*Section/InvHub ตรง ๆ: STAFF ไม่มีสิทธิ์คลัง / id ระบบ POS → 404 ทุกตัว (8)", leaked.length === 0, "0", leaked.join(", "));
    chk("HF-8.2", "เรียก section ด้วย id ระบบ POS ไม่สร้างแถวคลังใต้ POS (ensureDefaultLocation ไม่วิ่ง)", (await rowsUnder(posA.id)) === posRowsBefore, String(posRowsBefore), String(await rowsUnder(posA.id)));
  }

  // ═════════ 9) N4: action อ่าน (lot/บาร์โค้ด) ใช้กฎอ่านเดียวกับหน้า ═════════
  if (actions) {
    await prisma.invItem.update({ where: { id: item.id }, data: { barcode: `HF-BC-${stamp}` } });
    asSess(STAFF({ "inventory.movement.consume": true }));
    const l = await run(() => actions.itemLotsAction(invA.id, item.id));
    chk("HF-9.1", "itemLotsAction: STAFF consume อย่างเดียว (เปิดหน้าได้) → ไม่โดนปฏิเสธ", !l.threw && Array.isArray(l.value), "array", l.msg);
    const bc = await run(() => actions.findItemByBarcodeAction(invA.id, null, fd({ barcode: `HF-BC-${stamp}` })));
    chk("HF-9.2", "findItemByBarcodeAction: STAFF consume อย่างเดียว → เจอสินค้า", !bc.threw && (bc.value as { ok?: boolean })?.ok === true, "ok:true", `${bc.msg} ${JSON.stringify(bc.value ?? null).slice(0, 60)}`);
    asSess(STAFF({ "pos.sale.create": true }));
    const l2 = await run(() => actions.itemLotsAction(invA.id, item.id));
    const bc2 = await run(() => actions.findItemByBarcodeAction(invA.id, null, fd({ barcode: `HF-BC-${stamp}` })));
    chk("HF-9.3", "STAFF ไม่มีคีย์คลังเลย → ทั้งสอง action ถูกปฏิเสธ (กันถอยหลัง)", l2.threw && bc2.threw, "throw/throw", `${l2.msg} | ${bc2.msg}`);
  }

  // ═════════ 10) S3 + N9: receivePoAction แจ้งผล · id ระบบอื่นใน action ที่เหลือ ═════════
  if (pactions && actions) {
    asSess({});
    const po2 = await proc.createPo(ctxA, { supplierId: supA.id, lines: [{ itemId: item.id, qty: 1, costSatang: 100 }] });
    await prisma.purchaseOrder.update({ where: { id: po2.id }, data: { status: "ORDERED" } });
    const onHandBefore = await totalOnHand();
    const r = await run(() => pactions.receivePoAction(fd({ systemId: invA.id, poId: po2.id, locationId: locB.id })));
    const st = (await prisma.purchaseOrder.findUnique({ where: { id: po2.id } }))?.status;
    // HF-INV-1 R3.8: ผลไม่สำเร็จ "คืนค่า" รูปแบบบ้าน { status: "error", message } (ข้อความที่ throw ถูก Next ปิดบังใน production)
    const rv = r.value as { status?: string; message?: string } | undefined;
    chk("HF-10.1", "S3 + R3.8: receivePoAction คลังผิด → คืน { status: \"error\", message ไทย } (ไม่ throw · ไม่เงียบ) · PO ยัง ORDERED · สต็อกไม่ขยับ", !r.threw && rv?.status === "error" && /[ก-๙]/.test(rv?.message ?? "") && st === "ORDERED" && (await totalOnHand()) === onHandBefore, "error ไทย/ORDERED", `${r.threw ? `threw ${r.msg}` : JSON.stringify(rv)} · ${st}`);
    // id ระบบ POS ของร้านเดียวกัน → ปฏิเสธ + ไม่มีอะไรเปลี่ยน
    const img = await svc.addItemImage(ctxA, item.id, { url: "https://example.com/hf.png" });
    const po3 = await proc.createPo(ctxA, { supplierId: supA.id, lines: [{ itemId: item.id, qty: 1, costSatang: 100 }] });
    const snap = async () => JSON.stringify({
      it: await prisma.invItem.findUnique({ where: { id: item.id }, select: { name: true, archivedAt: true } }),
      imgs: await prisma.invItemImage.count({ where: { itemId: item.id } }),
      tok: (await prisma.supplier.findUnique({ where: { id: supA.id } }))?.portalToken,
      po2: (await prisma.purchaseOrder.findUnique({ where: { id: po2.id } }))?.status,
      po3: (await prisma.purchaseOrder.findUnique({ where: { id: po3.id } }))?.status,
    });
    const before = await snap();
    const P = posA.id;
    const foreign: [string, () => Promise<unknown>][] = [
      ["updateItemAction", () => actions.updateItemAction(fd({ systemId: P, itemId: item.id, name: "ถูกแก้" }))],
      ["archiveItemAction", () => actions.archiveItemAction(fd({ systemId: P, itemId: item.id }))],
      ["uploadItemImageAction", () => actions.uploadItemImageAction(P, item.id, { status: "idle" }, fd({ dataUrl: "data:image/png;base64,iVBORw0KGgo=" }))],
      ["removeItemImageAction", () => actions.removeItemImageAction(fd({ systemId: P, imageId: img.id }))],
      ["setPrimaryImageAction", () => actions.setPrimaryImageAction(fd({ systemId: P, itemId: item.id, imageId: img.id }))],
      ["enableVendorPortalAction", () => pactions.enableVendorPortalAction(fd({ systemId: P, supplierId: supA.id }))],
      ["disableVendorPortalAction", () => pactions.disableVendorPortalAction(fd({ systemId: P, supplierId: supA.id }))],
      ["markOrderedAction", () => pactions.markOrderedAction(fd({ systemId: P, poId: po3.id }))],
      ["receivePoAction", () => pactions.receivePoAction(fd({ systemId: P, poId: po2.id }))],
      ["cancelPoAction", () => pactions.cancelPoAction(fd({ systemId: P, poId: po3.id }))],
    ];
    for (const [n, call] of foreign) {
      const x = await run(call);
      const refused = x.threw || (x.value as { status?: string } | undefined)?.status === "error";
      const after = await snap();
      chk(`HF-10.${n}`, `${n} ด้วย id ระบบ POS ของร้านเดียวกัน → ปฏิเสธ · ไม่มีอะไรเปลี่ยน`, refused && after === before, "ปฏิเสธ/คงเดิม", `${x.msg} · ${after === before ? "คงเดิม" : after}`);
    }
  }

  // ═════════ 11) S2: รายงาน — inventory ต้องมีสิทธิ์คลัง · ไม่ส่ง field นอก columns · take มีเพดาน ═════════
  const rAct = (await import("@/lib/modules/reports/actions" as string).catch(() => null)) as { [k: string]: AnyFn } | null;
  const rSvc = (await import("@/lib/modules/reports/service" as string)) as { [k: string]: unknown } & { DATASETS: Record<string, { columns: { key: string }[] }> };
  const memA = await sysSvc.createSystem(tA.id, "MEMBER", "สมาชิก A");
  const unitA = await prisma.businessUnit.create({ data: { tenantId: tA.id, type: "SHOP", name: "สาขา HF", slug: `hfinv-u-${stamp}` } });
  await prisma.customer.create({ data: { tenantId: tA.id, memberSystemId: memA.id, name: "ลูกค้า HF", email: "secret-hf@example.com", note: "โน้ตลับ" } });
  await prisma.posSale.create({ data: { tenantId: tA.id, unitId: unitA.id, systemId: posA.id, idempotencyKey: `hfinv-sale-${stamp}`, status: "PAID", subtotalSatang: 100, grandTotalSatang: 100 } });
  if (!rAct) chk("HF-11.0", "import reports/actions ได้", false, "ได้", "ไม่ได้");
  else {
    asSess(STAFF({ "reports.report.run": true }));
    const inv1 = await run(() => rAct.runReportAction({ dataset: "inventory" }));
    const inv2 = await run(() => rAct.exportReportCsvAction({ dataset: "inventory" }));
    // R3c (C4): ปฏิเสธ = throw (ก่อน R3c) หรือคืน { error } ไทย (หลัง R3c — ข้อความถึงคนใช้ใน production)
    const refusalMsg = (x: { threw: boolean; value: unknown; msg: string }) => (x.threw ? x.msg : (x.value as { error?: unknown } | null)?.error);
    const refusedR = (x: { threw: boolean; value: unknown; msg: string }) => { const m = refusalMsg(x); return typeof m === "string" && /[ก-๙]/.test(m) && (x.threw || !(x.value as { rows?: unknown[] }).rows?.length); };
    chk("HF-11.1", "STAFF มีแค่ reports.report.run → dataset inventory (มีต้นทุน) ถูกปฏิเสธทั้งจอและ CSV · ข้อความไทย", refusedR(inv1) && refusedR(inv2) && typeof inv2.value !== "string" && !(inv2.value as { csv?: unknown } | undefined)?.csv, "ปฏิเสธ/ปฏิเสธ ไทย", `${String(refusalMsg(inv1))} | ${String(refusalMsg(inv2))} | ${JSON.stringify(inv2.value ?? "").slice(0, 60)}`);
    // HF-INV-1 R3.7: ชุดข้อมูล sales ต้องอ่านข้อมูลขายของ POS ได้ (pos.sale.create — กติกาเดียวกับหน้าประวัติบิล) — เดิมพอแค่ reports.report.run
    asSess(STAFF({ "reports.report.run": true, "pos.sale.create": true }));
    const salesOk = await run(() => rAct.runReportAction({ dataset: "sales" }));
    chk("HF-11.2", "คู่บวก: STAFF reports.report.run + pos.sale.create (ทุกสาขา) รัน dataset sales ได้", !salesOk.threw, "ผ่าน", salesOk.msg);
    asSess(STAFF({ "reports.report.run": true, "inventory.item.read": true }));
    const inv3 = await run(() => rAct.runReportAction({ dataset: "inventory" }));
    chk("HF-11.3", "คู่บวก: STAFF reports.report.run + inventory.item.read → รัน inventory ได้", !inv3.threw && ((inv3.value as { rows?: unknown[] })?.rows?.length ?? 0) > 0, "มีแถว", inv3.msg);
    asSess({});
    for (const [id, dsName] of [["HF-11.4", "customers"], ["HF-11.5", "sales"], ["HF-11.6", "inventory"]] as const) {
      const x = await run(() => rAct.runReportAction({ dataset: dsName }));
      const cols = rSvc.DATASETS[dsName].columns.map((c) => c.key);
      const rows = ((x.value as { rows?: Record<string, unknown>[] })?.rows ?? []);
      const extra = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !cols.includes(k))))];
      chk(id, `รายงาน ${dsName}: แถวที่ส่งกลับมีเฉพาะคีย์ใน columns (ไม่มี id/email/โน้ต/คีย์ภายใน)`, !x.threw && rows.length > 0 && extra.length === 0, "0 คีย์เกิน", `${rows.length} แถว · เกิน: ${extra.slice(0, 12).join(",")}`);
    }
    const clamp = rSvc.clampReportTake as ((t: unknown, fb: number) => number) | undefined;
    const cap = rSvc.EXPORT_CAP as number;
    chk("HF-11.7", "clampReportTake: 1e9 → EXPORT_CAP · -5 → 1 · NaN/ไม่ส่ง → ค่าเริ่มต้น · 2.7 → 2", typeof clamp === "function" && clamp(1e9, 500) === cap && clamp(-5, 500) === 1 && clamp(Number.NaN, 500) === 500 && clamp(undefined, 500) === 500 && clamp(2.7, 500) === 2, `${cap}/1/500/500/2`, typeof clamp === "function" ? `${clamp(1e9, 500)}/${clamp(-5, 500)}/${clamp(Number.NaN, 500)}/${clamp(undefined, 500)}/${clamp(2.7, 500)}` : "ไม่มี");
    const rsrc = strip(read(resolve(ROOT, "src/lib/modules/reports/service.ts")));
    chk("HF-11.8", "[static] runReport ใช้ clampReportTake กับ take ที่มาจาก client", /clampReportTake\(\s*input\.take/.test(rsrc) && !/input\.take\s*\?\?\s*RAW_CAP/.test(rsrc), "ใช้", "ยังใช้ input.take ดิบ");
  }

  // ═════════ 12) HF-INV-1 R3.8: receivePoAction คืนผลรูปแบบบ้าน · กดซ้ำไม่รับซ้ำและไม่ขึ้น error ═════════
  if (pactions) {
    asSess({});
    const mkOrdered = async (qtys: number[]) => {
      const po = await proc.createPo(ctxA, { supplierId: supA.id, lines: qtys.map((q) => ({ itemId: item.id, qty: q, costSatang: 100 })) });
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "ORDERED" } });
      return po.id as string;
    };
    const inCount = async (poId: string) => prisma.invMovement.count({ where: { tenantId: tA.id, type: "IN", refType: "PurchaseOrder", refId: poId } });
    const poOk = await mkOrdered([2]);
    const before = await totalOnHand();
    const g = await run(() => pactions.receivePoAction(fd({ systemId: invA.id, poId: poOk })));
    const gv = g.value as { status?: string; message?: string } | undefined;
    const st = (await prisma.purchaseOrder.findUnique({ where: { id: poOk } }))?.status;
    chk("HF-12.1", "R3.8: รับของสำเร็จ → คืน { status: \"ok\", message ไทย } · RECEIVED · สต็อก +2", !g.threw && gv?.status === "ok" && /[ก-๙]/.test(gv?.message ?? "") && st === "RECEIVED" && (await totalOnHand()) === (before ?? 0) + 2, "ok/RECEIVED/+2", `${g.threw ? `threw ${g.msg}` : JSON.stringify(gv)} · ${st} · ${before}→${await totalOnHand()}`);
    const again = await run(() => pactions.receivePoAction(fd({ systemId: invA.id, poId: poOk })));
    const av = again.value as { status?: string } | undefined;
    chk("HF-12.2", "R3.8: กดรับซ้ำหลังรับแล้ว → ไม่ขึ้น error (status ok) · ไม่รับซ้ำ (IN 1 แถว · สต็อกคงเดิม)", !again.threw && av?.status === "ok" && (await inCount(poOk)) === 1 && (await totalOnHand()) === (before ?? 0) + 2, "ok/1", `${again.threw ? `threw ${again.msg}` : JSON.stringify(av)} · IN ${await inCount(poOk)}`);
    const poDbl = await mkOrdered([3, 4]);
    const b2 = await totalOnHand();
    const both = await Promise.all([0, 1].map(() => run(() => pactions.receivePoAction(fd({ systemId: invA.id, poId: poDbl })))));
    const sts = both.map((x) => (x.threw ? `threw:${x.msg}` : (x.value as { status?: string } | undefined)?.status));
    chk("HF-12.3", "R3.8: ดับเบิลคลิก (2 คำขอพร้อมกัน) → ทั้งคู่ไม่ขึ้น error · รับครั้งเดียว (IN 2 แถว = 2 บรรทัด · สต็อก +7)", sts.every((x) => x === "ok") && (await inCount(poDbl)) === 2 && (await totalOnHand()) === (b2 ?? 0) + 7, "ok,ok/2/+7", `${sts.join(",")} · IN ${await inCount(poDbl)} · ${b2}→${await totalOnHand()}`);
    const uiSrc = strip(read(UI_FILE));
    const formFile = resolve(ROOT, "src/lib/modules/inventory/PoReceiveForm.tsx");
    const formSrc = strip(read(formFile));
    chk("HF-12.4", "[static] R3.8: หน้าจัดซื้อไม่ผูก receivePoAction เป็น form action ตรง ๆ (ผลถูกทิ้ง) — ใช้ PoReceiveForm (useActionState + แสดงข้อความ)", !/action=\{\s*receivePoAction\s*\}/.test(uiSrc) && /<PoReceiveForm\b/.test(uiSrc) && /useActionState/.test(formSrc) && /receivePoAction\(/.test(formSrc) && /\.message/.test(formSrc), "PoReceiveForm", `ui direct=${/action=\{\s*receivePoAction\s*\}/.test(uiSrc)} · form ${existsSync(formFile)}`);
    // R3c (C4): ล้มก่อน try ของ action (สิทธิ์ · ระบบที่ไม่ใช่คลังของร้าน) ⇒ คืน { status:"error", message ไทย } — ไม่ throw ไปถึง error boundary
    const poNo = await mkOrdered([1]);
    const b5 = await totalOnHand();
    asSess(STAFF({ "inventory.item.read": true }));
    const noPerm = await run(() => pactions.receivePoAction(fd({ systemId: invA.id, poId: poNo })));
    asSess({});
    const npv = noPerm.value as { status?: string; message?: string } | undefined;
    chk("HF-12.5", "R3c: STAFF ไม่มีสิทธิ์รับของ (inventory.po.receive) → คืน { status:\"error\", message ไทย } ไม่ throw · ไม่รับของ", !noPerm.threw && npv?.status === "error" && /[ก-๙]/.test(npv?.message ?? "") && (await inCount(poNo)) === 0 && (await totalOnHand()) === b5, "error ไทย/ไม่รับ", `${noPerm.threw ? `threw ${noPerm.msg}` : JSON.stringify(npv)} · IN ${await inCount(poNo)}`, "MAJOR");
    const wrongSys = await run(() => pactions.receivePoAction(fd({ systemId: posA.id, poId: poNo })));
    const wsv = wrongSys.value as { status?: string; message?: string } | undefined;
    chk("HF-12.6", "R3c: systemId เป็นระบบ POS (ไม่ใช่คลังของร้าน) → คืน { status:\"error\", message ไทย } ไม่ throw · ไม่รับของ", !wrongSys.threw && wsv?.status === "error" && /[ก-๙]/.test(wsv?.message ?? "") && (await inCount(poNo)) === 0, "error ไทย/ไม่รับ", `${wrongSys.threw ? `threw ${wrongSys.msg}` : JSON.stringify(wsv)} · IN ${await inCount(poNo)}`, "MAJOR");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 200)}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
  for (const tid of tenants) {
    for (const m of ["invMovement", "invLot", "invLocationStock", "invLocation", "poLine", "purchaseOrder", "supplier", "invItemImage", "invCategory", "invSettings", "invItem", "approvalRequest", "outboxEvent", "auditLog", "posSale", "customer", "reportDef", "party", "appSystemUnit", "appSystem", "businessUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: `qc-hfinv-` } } }).catch(() => -1);
  if (left !== 0) console.log(`  ⚠️ เหลือ tenant ทดสอบ ${left} ร้าน (slug qc-hfinv-*)`);
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC HF-INV-0 inventory authz =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
