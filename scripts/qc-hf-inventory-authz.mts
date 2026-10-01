// QC — HF-INV-0: สิทธิ์เข้าหน้าคลัง + id ที่มาจาก client (D14 · D3 + ชนิดเดียวกัน) · oracle-first
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

  // ═════════ 3) static: ทุกหน้าคลัง + InvHub เรียกด่าน · action ไม่สร้าง ctx จาก systemId ดิบ ═════════
  const PAGES_DIR = resolve(ROOT, "src/app/app/sys/[id]/inventory");
  const pages: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^(page|route)\.tsx?$/.test(f)) pages.push(p); } };
  walk(PAGES_DIR);
  const unguarded = pages.filter((p) => !/requireInventoryPage\(/.test(strip(read(p))));
  chk("HF-3.1", `[static] ทุกหน้าใต้ /inventory (${pages.length}) เรียก requireInventoryPage`, pages.length >= 7 && unguarded.length === 0, "0 หน้าหลุด", unguarded.map((p) => p.slice(PAGES_DIR.length)).join(",") || `${pages.length} หน้า`);
  const ui = strip(read(resolve(ROOT, "src/lib/modules/inventory/ui.tsx")));
  const hubBody = ui.slice(ui.indexOf("export async function InvHub"), ui.indexOf("export async function InvHub") + 600);
  chk("HF-3.2", "[static] InvHub (หน้าภาพรวมใน /app/sys/[id]) เรียก requireInventoryPage ก่อนอ่าน/เขียน", /requireInventoryPage\(/.test(hubBody) && hubBody.indexOf("requireInventoryPage(") < hubBody.indexOf("ensureDefaultLocation("), "เรียกก่อน ensureDefaultLocation", hubBody.slice(0, 160).replace(/\s+/g, " "));
  for (const [id, f] of [["HF-3.3", "actions.ts"], ["HF-3.4", "procurement-actions.ts"]] as const) {
    const src = strip(read(resolve(ROOT, "src/lib/modules/inventory", f)));
    const raw = (src.match(/\{\s*tenantId:\s*auth\.active\.tenantId,\s*systemId\s*\}/g) ?? []).length;
    const exported = (src.match(/^export async function \w+Action\(/gm) ?? []).length;
    const resolved = (src.match(/(requireInventoryCtx|findInventoryCtx)\(/g) ?? []).length;
    chk(id, `[static] ${f}: ไม่มี ctx จาก systemId ดิบ · ทุก action resolve ระบบ INVENTORY (${exported} action)`, raw === 0 && resolved >= exported, `raw 0 · resolve ≥ ${exported}`, `raw ${raw} · resolve ${resolved}`);
  }

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
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 200)}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
  for (const tid of tenants) {
    for (const m of ["invMovement", "invLot", "invLocationStock", "invLocation", "poLine", "purchaseOrder", "supplier", "invItemImage", "invCategory", "invSettings", "invItem", "approvalRequest", "outboxEvent", "auditLog", "party", "appSystemUnit", "appSystem", "businessUnit"]) {
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
