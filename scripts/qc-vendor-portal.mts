// QC — Vendor Portal (WO-0059) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/inventory/procurement.ts เพิ่ม (schema Supplier.portalToken มีแล้ว):
//   enableVendorPortal(ctx, supplierId) → { token } — crypto ≥20 ตัว · เรียกซ้ำ = token ใหม่ (rotate ได้)
//   disableVendorPortal(ctx, supplierId) → boolean — portalToken = null
//   getVendorPortalView(token) → { supplier: { name }, pos: [{ code, status, totalSatang, createdAt }] } | null
//     · public token-first (prisma ตรงเฉพาะ resolve token พร้อม comment — จากนั้น query ต่อด้วย tenant/system ของ supplier)
//     · เห็นเฉพาะ PO ของ supplier ตัวเอง เรียงใหม่ก่อน · token ปลอม/ปิดแล้ว → null · ห้ามมีข้อมูล supplier อื่น หรือ token หลุดใน view
//   UI: หน้า public /vendor/[token] (read-only ไทย: ชื่อ supplier + ตาราง PO code/สถานะ/ยอด/วันที่) + ปุ่ม "เปิดลิงก์ผู้ขาย"/ปิด ในหน้า supplier ฝั่งร้าน (actions มี assertCan inventory.supplier.*)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = "";
try {
  const proc = (await import("@/lib/modules/inventory/procurement" as string)) as { [k: string]: (...a: any[]) => Promise<any> }; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (typeof proc.enableVendorPortal !== "function") { chk("VP-0", "มี enableVendorPortal", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC VP", slug: `qc-vp-${Date.now()}` } }); tid = t.id;
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const ctx = { tenantId: tid, systemId: inv.id };
    const s1 = await proc.createSupplier(ctx, { name: "ผู้ขาย หนึ่ง" });
    const s2 = await proc.createSupplier(ctx, { name: "ผู้ขาย สอง" });
    const item = await (await import("@/lib/modules/inventory/service")).createItem(ctx as never, { sku: "VP-1", name: "ของ" } as never);
    const po1 = await proc.createPo(ctx, { supplierId: s1.id, lines: [{ itemId: item.id, qty: 5, costSatang: 1000 }] });
    await proc.createPo(ctx, { supplierId: s2.id, lines: [{ itemId: item.id, qty: 9, costSatang: 2000 }] });

    const en = await proc.enableVendorPortal(ctx, s1.id);
    chk("VP-1.1", "token ≥20 ตัว + เก็บใน Supplier", typeof en.token === "string" && en.token.length >= 20 && (await prisma.supplier.findUnique({ where: { id: s1.id as string } }))?.portalToken === en.token, "≥20", String(en.token).length + "");
    const v = await proc.getVendorPortalView(en.token);
    const pos = (v?.pos ?? []) as { code: string }[];
    chk("VP-1.2", "view เห็นเฉพาะ PO ของตัวเอง (1 ใบ = ของผู้ขายหนึ่ง)", v?.supplier?.name === "ผู้ขาย หนึ่ง" && pos.length === 1 && pos[0].code === po1.code, "1 ใบ", JSON.stringify(pos.map((p) => p.code)));
    chk("VP-1.3", "token ปลอม → null", (await proc.getVendorPortalView("no-such-token-aaaaaaaaaa")) === null, "null", "?");
    const en2 = await proc.enableVendorPortal(ctx, s1.id);
    chk("VP-2.1", "rotate: เรียกซ้ำได้ token ใหม่ + token เก่าใช้ไม่ได้", en2.token !== en.token && (await proc.getVendorPortalView(en.token)) === null && (await proc.getVendorPortalView(en2.token)) !== null, "ใหม่/เก่าตาย", "?");
    chk("VP-2.2", "disable → view null", (await proc.disableVendorPortal(ctx, s1.id)) === true && (await proc.getVendorPortalView(en2.token)) === null, "null", "?");
    chk("VP-3.1", "มีหน้า public /vendor/[token]", (await import("node:fs")).existsSync("src/app/(store)/vendor/[token]/page.tsx") || (await import("node:fs")).existsSync("src/app/vendor/[token]/page.tsx"), "มี", "ไม่พบไฟล์", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["poLine", "purchaseOrder", "supplier", "invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Vendor Portal =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
