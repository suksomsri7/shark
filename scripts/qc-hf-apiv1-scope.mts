// QC — HF-APIV1 (hotfix): route เก่า `/api/v1/*` ต้องเคารพขอบเขตสิทธิ์ (scope) + ระบบที่ผูกของคีย์
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (เรียก Route Handler ตรง ๆ ไม่ต้องมีเซิร์ฟเวอร์)
//
// สัญญา:
//   คีย์รุ่นเดิมระดับร้าน (scopes [] และไม่ผูกระบบ — ออกจาก /app/settings/api) ⇒ 8 route ข้อมูลทำงานเหมือนเดิม 200
//   คีย์ที่มี scope และ/หรือผูกระบบ (คีย์ของโมดูล บัญชี/บอร์ดงาน/สมาชิก/CRM) ⇒ 403 ไม่มีข้อมูล ไม่มีจำนวน
//     body เดียวกันทุก route ทุกคีย์ ไม่ขึ้นกับว่ามีข้อมูลหรือไม่ · ข้อความไทยไม่โทษผู้ใช้ + error_en
//   หมดอายุ / เพิกถอน ⇒ 401 เหมือนเดิม · คีย์ร้านอื่น ⇒ เห็นเฉพาะร้านตัวเอง (เหมือนเดิม)
//   /api/v1/me คืนแค่ตัวตนของร้านเจ้าของคีย์ ⇒ เปิดให้คีย์ที่ใช้ได้ทุกใบ (ตัดสินใน ledger/wo-notes/HF-APIV1.md)
// ข้อมูลทดสอบ: ร้านชั่วคราว 2 ร้าน slug `qc-hf-apiv1-<rand>` · ลบทั้งหมดใน finally
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-apiv1-scope"); // 🔴 กัน prod
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type Handler = { GET: (r: Request) => Promise<Response> };
type Body = Record<string, unknown>;
const TAG = `qc-hf-apiv1-${Math.random().toString(36).slice(2, 8)}`;
const tids: string[] = [];

const ROUTES: { id: string; path: string; mod: string; seeded?: string }[] = [
  { id: "sales", path: "/api/v1/sales", mod: "@/app/api/v1/sales/route", seeded: "receiptNo" },
  { id: "customers", path: "/api/v1/customers", mod: "@/app/api/v1/customers/route", seeded: "name" },
  { id: "inventory", path: "/api/v1/inventory/items", mod: "@/app/api/v1/inventory/items/route", seeded: "name" },
  { id: "appointments", path: "/api/v1/appointments", mod: "@/app/api/v1/appointments/route" },
  { id: "queue", path: "/api/v1/queue/tickets", mod: "@/app/api/v1/queue/tickets/route" },
  { id: "reservations", path: "/api/v1/reservations", mod: "@/app/api/v1/reservations/route" },
  { id: "shop", path: "/api/v1/shop/orders", mod: "@/app/api/v1/shop/orders/route", seeded: "customerName" },
  { id: "tickets", path: "/api/v1/tickets/orders", mod: "@/app/api/v1/tickets/orders/route" },
];

const req = (path: string, key?: string) => new Request(`http://x${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
async function call(h: Handler, path: string, key?: string): Promise<{ status: number; text: string; body: Body }> {
  const r = await h.GET(req(path, key));
  const text = await r.text();
  let body: Body = {};
  try { body = JSON.parse(text) as Body; } catch { /* ไม่ใช่ JSON */ }
  return { status: r.status, text, body };
}

try {
  const ak = (await import("@/lib/api-keys/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> }; // any จงใจ: oracle ไม่ผูก type ของโค้ด
  const scopesMod = (await import("@/lib/api-keys/scopes" as string)) as { expandBundles: (ids: string[]) => string[] };

  // ── ร้าน A: มีข้อมูลใน 4 route (POS · สมาชิก · คลัง · ร้านค้า) + ระบบบัญชี/บอร์ดงานให้ผูกคีย์ ──
  const seed = async (label: string) => {
    const t = await prisma.tenant.create({ data: { name: `QC HF ${label}`, slug: `${TAG}-${label.toLowerCase()}` } });
    tids.push(t.id);
    const unit = await prisma.businessUnit.create({ data: { tenantId: t.id, type: "SHOP", name: `สาขา ${label}`, slug: `${TAG}-u-${label.toLowerCase()}` } });
    const pos = await sys.createSystem(t.id, "POS", "POS");
    const member = await sys.createSystem(t.id, "MEMBER", "สมาชิก");
    const inv = await sys.createSystem(t.id, "INVENTORY", "คลัง");
    const acc = await sys.createSystem(t.id, "ACCOUNT", "สมุดบัญชี");
    const kb = await sys.createSystem(t.id, "KANBAN", "บอร์ดงาน");
    await prisma.posSale.create({ data: { tenantId: t.id, unitId: unit.id, systemId: pos.id, idempotencyKey: `${TAG}-${label}`, subtotalSatang: 10000, grandTotalSatang: 10700, receiptNo: `${TAG}-R-${label}` } as never });
    await prisma.customer.create({ data: { tenantId: t.id, memberSystemId: member.id, name: `${TAG}-ลูกค้า-${label}`, phone: "0812223333" } });
    await prisma.invItem.create({ data: { tenantId: t.id, systemId: inv.id, sku: `${TAG}-${label}`, name: `${TAG}-สินค้า-${label}` } });
    await prisma.shopOrder.create({ data: { tenantId: t.id, unitId: unit.id, code: `${TAG}-SO-${label}`, customerName: `${TAG}-ผู้ซื้อ-${label}`, customerPhone: "0812223333" } });
    return { tid: t.id, ctx: { tenantId: t.id }, acc, kb };
  };
  const A = await seed("A");
  const B = await seed("B");

  const legacy = await ak.createApiKey(A.ctx, `${TAG} legacy`);
  const scopedOnly = await ak.createApiKey(A.ctx, `${TAG} kanban-read`, { scopes: scopesMod.expandBundles(["kanban-read"]) });
  const boundOnly = await ak.createApiKey(A.ctx, `${TAG} acc-bound`, { systemId: A.acc.id, scopes: [] });
  const scopedBound = await ak.createApiKey(A.ctx, `${TAG} acc-read-bound`, { systemId: A.acc.id, scopes: scopesMod.expandBundles(["read-only"]) });
  const kbBound = await ak.createApiKey(A.ctx, `${TAG} kb-read-bound`, { systemId: A.kb.id, scopes: scopesMod.expandBundles(["kanban-read"]) });
  const expired = await ak.createApiKey(A.ctx, `${TAG} expired`);
  await prisma.apiKey.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const revoked = await ak.createApiKey(A.ctx, `${TAG} revoked`);
  await ak.revokeApiKey(A.ctx, revoked.id);
  const legacyB = await ak.createApiKey(B.ctx, `${TAG} legacy B`);
  const scopedB = await ak.createApiKey(B.ctx, `${TAG} kanban-read B`, { scopes: scopesMod.expandBundles(["kanban-read"]) });

  const denied: { label: string; key: string }[] = [
    { label: "scope อย่างเดียว (kanban-read)", key: scopedOnly.rawKey },
    { label: "ผูกสมุดบัญชี scopes []", key: boundOnly.rawKey },
    { label: "scope + ผูกสมุดบัญชี (read-only)", key: scopedBound.rawKey },
    { label: "scope + ผูกบอร์ดงาน (kanban-read)", key: kbBound.rawKey },
  ];
  const deniedTexts = new Set<string>();

  for (const r of ROUTES) {
    const h = (await import(r.mod as string)) as Handler;
    // 1) คีย์รุ่นเดิม = ตัวคุมฝั่งบวก (ต้องได้ข้อมูลเหมือนเดิม)
    const L = await call(h, r.path, legacy.rawKey);
    const data = Array.isArray(L.body.data) ? (L.body.data as Body[]) : null;
    const seededOk = !r.seeded || (data ?? []).some((row) => String(row[r.seeded!] ?? "").includes(`${TAG}`) && String(row[r.seeded!] ?? "").endsWith("A"));
    chk(`HF-1.${r.id}`, `${r.path} คีย์รุ่นเดิม → 200 data array${r.seeded ? " มีแถวของร้าน A" : ""}`, L.status === 200 && data !== null && seededOk, "200 + data", `${L.status} ${L.text.slice(0, 80)}`);
    // 2) คีย์ที่มี scope/ผูกระบบ → 403 ไม่มี data
    for (const d of denied) {
      const D = await call(h, r.path, d.key);
      const msgTh = typeof D.body.error === "string" ? D.body.error : "";
      const ok = D.status === 403 && !("data" in D.body) && /[ก-๙]/.test(msgTh) && typeof D.body.error_en === "string" && !D.text.includes(TAG);
      chk(`HF-2.${r.id}.${denied.indexOf(d) + 1}`, `${r.path} ${d.label} → 403 ไม่มีข้อมูล`, ok, "403 no data", `${D.status} ${D.text.slice(0, 100)}`);
      if (D.status === 403) deniedTexts.add(D.text);
    }
    // 3) หมดอายุ / เพิกถอน → 401 เดิม
    const E = await call(h, r.path, expired.rawKey);
    const R = await call(h, r.path, revoked.rawKey);
    chk(`HF-3.${r.id}`, `${r.path} หมดอายุ/เพิกถอน → 401 (เดิม)`, E.status === 401 && R.status === 401 && !("data" in E.body) && !("data" in R.body), "401/401", `${E.status}/${R.status}`);
    // 4) คีย์ร้าน B → เห็นแต่ร้าน B
    const LB = await call(h, r.path, legacyB.rawKey);
    chk(`HF-4.${r.id}`, `${r.path} คีย์รุ่นเดิมร้าน B → 200 ไม่เห็นข้อมูลร้าน A`, LB.status === 200 && Array.isArray(LB.body.data) && !/-A"/.test(LB.text) && (!r.seeded || LB.text.includes(`${TAG}`)), "200 own only", `${LB.status} ${LB.text.slice(0, 80)}`);
    // 5) body 403 ไม่ขึ้นกับว่ามีข้อมูล — ร้าน B (ไม่มีสมุดบัญชีที่คีย์ผูก/ข้อมูลต่างกัน) ต้องได้ข้อความเดียวกันทุกตัวอักษร
    const DB = await call(h, r.path, scopedB.rawKey);
    if (DB.status === 403) deniedTexts.add(DB.text);
    chk(`HF-5.${r.id}`, `${r.path} คีย์ scope ร้าน B → 403 เหมือนร้าน A`, DB.status === 403, "403", `${DB.status}`);
  }
  chk("HF-5.0", "body 403 เหมือนกันทุก route ทุกคีย์ทุกร้าน (ไม่บอกใบ้ว่ามีข้อมูลหรือไม่)", deniedTexts.size === 1, "1 แบบ", `${deniedTexts.size} แบบ: ${[...deniedTexts].map((t) => t.slice(0, 60)).join(" | ")}`);

  // 6) /me — ตัวตนร้านเท่านั้น ⇒ คีย์ที่ใช้ได้ทุกใบเรียกได้ · หมดอายุ/เพิกถอน 401
  const me = (await import("@/app/api/v1/me/route" as string)) as Handler;
  const meAll = await Promise.all([legacy, scopedOnly, boundOnly, scopedBound, kbBound].map((k) => call(me, "/api/v1/me", k.rawKey)));
  chk("HF-6.1", "/me คีย์ที่ใช้ได้ทุกแบบ → 200 { tenant: {id,name,slug} } ของร้าน A เท่านั้น",
    meAll.every((m) => m.status === 200 && (m.body.tenant as Body | undefined)?.id === A.tid && Object.keys(m.body).join() === "tenant" && Object.keys(m.body.tenant as Body).sort().join() === "id,name,slug"),
    "200 identity", meAll.map((m) => m.status).join(","));
  const meBad = await Promise.all([expired, revoked].map((k) => call(me, "/api/v1/me", k.rawKey)));
  chk("HF-6.2", "/me หมดอายุ/เพิกถอน → 401", meBad.every((m) => m.status === 401), "401", meBad.map((m) => m.status).join(","));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
  for (const tid of tids) {
    for (const m of ["apiKey", "posSale", "customer", "invItem", "shopOrder", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC HF-APIV1 scope =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
