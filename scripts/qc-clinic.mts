// QC — Clinic (WO-0052) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/clinic/service.ts (ctx {tenantId, unitId} — tenantDb ทุก query · unit type CLINIC):
//   createPatient(ctx, {name, phone, birthYear?, allergies?, note?}) — name/phone ว่าง throw ไทย ·
//     มีระบบ MEMBER → findOrCreate Customer จากเบอร์ ผูก customerId (แบบ school) · ไม่มี → null
//   updatePatient · searchPatients(ctx, q) — ชื่อหรือเบอร์ contains (q ว่าง → รายการล่าสุด)
//   createVisit(ctx, {patientId, symptom, feeSatang?}) — symptom ว่าง throw · patient ไม่อยู่ unit นี้ → throw
//   dispense(ctx, visitId, items: [{invItemId, qty}]) → {ok} — visit OPEN เท่านั้น ·
//     บันทึกลง dispenseJson (สะสม — เรียกซ้ำ append) + inventory.consume ต่อรายการ (systemId = INVENTORY ตัวแรก ·
//     idempotencyKey `clinic-<visitId>-<invItemId>` — จ่ายยาซ้ำตัวเดิมใน visit เดิม = consume ไม่ซ้ำ (idempotent จาก key)) ·
//     ไม่มีระบบ INVENTORY → throw ไทย
//   billVisit(ctx, visitId) → {ok, posSaleId?} — claim OPEN→BILLED + pos.createSale `clinic-<visitId>` sourceModule "CLINIC"
//     payMethods CASH ยอด feeSatang · fee 0 → BILLED โดยไม่สร้างบิล (posSaleId null) · ไม่มีระบบ POS (และ fee>0) → throw+revert OPEN · ซ้ำ ok:false
//   UI: SYSTEM_DEFS CLINIC (business · available · no.24 · 🏥) + UNIT_NAV + /app/u/[unitSlug]/clinic (ค้นผู้ป่วย/เพิ่ม/เปิด visit/จ่ายยา/เก็บเงิน) ไทยล้วน · PDPA: หน้าโชว์เท่าที่จำเป็น
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = "";
try {
  const cl = (await import("@/lib/modules/clinic/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!cl) { chk("CL-0", "มี clinic/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC CLINIC", slug: `qc-cl-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "CLINIC", name: "คลินิก QC", slug: `cl-${Date.now()}` } });
    await sys.createSystem(tid, "POS", "ขาย");
    const invSys = await sys.createSystem(tid, "INVENTORY", "ยา");
    await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const inv = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: unknown, i: unknown) => Promise<{ id: string }>; receive: (c: unknown, i: unknown) => Promise<unknown> };
    const med = await inv.createItem({ tenantId: tid, systemId: invSys.id }, { sku: "MED-01", name: "พาราเซตามอล" });
    await inv.receive({ tenantId: tid, systemId: invSys.id }, { itemId: med.id, qty: 100, costSatang: 200, idempotencyKey: "cl-rc" });
    const ctx = { tenantId: tid, unitId: unit.id };

    const p1 = await cl.createPatient(ctx, { name: "คุณป่วย", phone: "0809998888", allergies: "เพนิซิลลิน" });
    chk("CL-1.1", "สร้างผู้ป่วย + ผูก Customer (มีระบบสมาชิก)", !!p1.id && (await prisma.patientRecord.findUnique({ where: { id: p1.id as string } }))?.customerId !== null, "ผูก", "?");
    chk("CL-1.2", "searchPatients ด้วยเบอร์บางส่วน เจอ", ((await cl.searchPatients(ctx, "0809")) as unknown[]).length === 1, "1", "?");

    const v = await cl.createVisit(ctx, { patientId: p1.id, symptom: "ปวดหัว มีไข้", feeSatang: 50000 });
    let thSym = false; try { await cl.createVisit(ctx, { patientId: p1.id, symptom: "", feeSatang: 0 }); } catch { thSym = true; }
    chk("CL-2.1", "เปิด visit + symptom ว่าง throw", !!v.id && thSym, "id+throw", "?");
    await cl.dispense(ctx, v.id, [{ invItemId: med.id, qty: 10 }]);
    await cl.dispense(ctx, v.id, [{ invItemId: med.id, qty: 10 }]); // ซ้ำ key เดิม → สต็อกไม่ตัดซ้ำ
    chk("CL-2.2", "จ่ายยา 10 เม็ด → สต็อก 90 (ซ้ำไม่ตัดเพิ่ม — idempotencyKey)", (await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.onHand === 90, "90", String((await prisma.invItem.findUnique({ where: { id: med.id as string } }))?.onHand));
    chk("CL-2.3", "movement sourceModule CLINIC + dispenseJson บันทึก", (await prisma.invMovement.findFirst({ where: { tenantId: tid, idempotencyKey: `clinic-${v.id}-${med.id}` } }))?.sourceModule === "CLINIC" && JSON.stringify((await prisma.clinicVisit.findUnique({ where: { id: v.id as string } }))?.dispenseJson).includes("พาราเซตามอล"), "CLINIC+json", "?");

    const bill = await cl.billVisit(ctx, v.id);
    const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: `clinic-${v.id}` } });
    chk("CL-3.1", "เก็บเงิน 500 → BILLED + PosSale PAID + posSaleId", bill.ok === true && sale?.grandTotalSatang === 50000 && (await prisma.clinicVisit.findUnique({ where: { id: v.id as string } }))?.status === "BILLED", "BILLED/50000", `${sale?.grandTotalSatang}`);
    chk("CL-3.2", "เก็บซ้ำ ok:false + บิลไม่ซ้ำ", ((await cl.billVisit(ctx, v.id)) as { ok: boolean }).ok === false && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: `clinic-${v.id}` } })) === 1, "false/1", "?");
    const v0 = await cl.createVisit(ctx, { patientId: p1.id, symptom: "ตรวจสุขภาพ", feeSatang: 0 });
    chk("CL-3.3", "fee 0 → BILLED โดยไม่มีบิล (posSaleId null)", ((await cl.billVisit(ctx, v0.id)) as { ok: boolean }).ok === true && (await prisma.clinicVisit.findUnique({ where: { id: v0.id as string } }))?.posSaleId === null, "null", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["clinicVisit", "patientRecord", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Clinic =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
