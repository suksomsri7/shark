// QC — Report builder v1 (WO-0055) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/reports/service.ts (ctx {tenantId}):
//   DATASETS: Record<string, { label: string(ไทย), columns: [{key,label,type:"string"|"number"|"date"}] }>
//     · v1 อย่างน้อย: "sales" (PosSale status PAID — ทุกระบบ POS ของร้าน) · "customers" (Customer ทุกระบบ MEMBER) · "inventory" (InvItem ทุกระบบ INVENTORY)
//     · model แกน system → enumerate AppSystem ต่อ type แล้ว query ผ่าน tenantDb({tenantId, systemId}) รวมผล (pattern เดียว calendar)
//   runReport(ctx, { dataset, filters?, groupBy?, metric?, take? }) → { columns, rows }
//     · filters: [{ field, op: "eq"|"gte"|"lte"|"contains", value }] — **field ต้องอยู่ใน columns ของ dataset เท่านั้น** (นอกนั้น throw ไทย — กัน field injection)
//     · dataset ไม่รู้จัก → throw ไทย
//     · ไม่มี groupBy → rows = แถวข้อมูล (cap take ?? 500)
//     · มี groupBy (field ใน columns) → rows = [{ group, value }] · metric: "count" (default) | "sum:<numberField>"
//   saveReport(ctx, { name, config }) → {id} · listReports(ctx) · deleteReport(ctx, id) (schema ReportDef มีแล้ว)
//   toCsv(result) → string — ขึ้นต้น BOM ﻿ + header + escape ค่า (คำที่มี , หรือ " ต้องห่อ)
//   UI /app/reports: เลือก dataset → filter → group/metric → ตาราง + ปุ่มดาวน์โหลด CSV + บันทึก/เรียกรายงานที่บันทึก + ลิงก์ NavDrawer · actions มี assertCan reports.*
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const rb = (await import("@/lib/modules/reports/service" as string).catch(() => null)) as { [k: string]: any } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!rb) { chk("RB-0", "มี reports/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC RPT", slug: `qc-rpt-${Date.now()}` } }); tid = t.id;
    const pos = await sys.createSystem(tid, "POS", "ขาย");
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const u1 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขา 1", slug: `r1-${Date.now()}` } });
    const u2 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขา 2", slug: `r2-${Date.now()}` } });
    await prisma.posSale.createMany({ data: [
      { tenantId: tid, unitId: u1.id, systemId: pos.id, idempotencyKey: "r1", status: "PAID", subtotalSatang: 10000, grandTotalSatang: 10000 },
      { tenantId: tid, unitId: u1.id, systemId: pos.id, idempotencyKey: "r2", status: "PAID", subtotalSatang: 30000, grandTotalSatang: 30000 },
      { tenantId: tid, unitId: u2.id, systemId: pos.id, idempotencyKey: "r3", status: "PAID", subtotalSatang: 60000, grandTotalSatang: 60000 },
      { tenantId: tid, unitId: u2.id, systemId: pos.id, idempotencyKey: "r4", status: "VOIDED", subtotalSatang: 99999, grandTotalSatang: 99999 },
    ] });
    await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "คุณรายงาน, จำกัด" } });
    const ctx = { tenantId: tid };

    chk("RB-1.1", "DATASETS มี sales/customers/inventory + ป้ายไทย + columns", ["sales", "customers", "inventory"].every((k) => rb.DATASETS[k] && /[ก-๙]/.test(rb.DATASETS[k].label) && Array.isArray(rb.DATASETS[k].columns)), "ครบ 3", JSON.stringify(Object.keys(rb.DATASETS ?? {})));

    const all = await rb.runReport(ctx, { dataset: "sales" });
    chk("RB-2.1", "sales ทั้งหมด = 3 แถว (ตัด VOIDED)", (all.rows as unknown[]).length === 3, "3", String((all.rows as unknown[]).length));
    const sum = await rb.runReport(ctx, { dataset: "sales", groupBy: "unitId", metric: "sum:grandTotalSatang" });
    const vals = (sum.rows as { group: string; value: number }[]).map((r) => r.value).sort((a, b) => a - b);
    chk("RB-2.2", "groupBy unit + sum → [400, 600] บาท", vals.length === 2 && vals[0] === 40000 && vals[1] === 60000, "40000/60000", JSON.stringify(vals));
    const cnt = await rb.runReport(ctx, { dataset: "sales", groupBy: "unitId" });
    chk("RB-2.3", "groupBy ไม่ระบุ metric = count → [1, 2]", ((cnt.rows as { value: number }[]).map((r) => r.value).sort().join(",")) === "1,2", "1,2", "?");
    const flt = await rb.runReport(ctx, { dataset: "sales", filters: [{ field: "grandTotalSatang", op: "gte", value: 30000 }] });
    chk("RB-2.4", "filter gte 30000 → 2 แถว", (flt.rows as unknown[]).length === 2, "2", String((flt.rows as unknown[]).length));

    let th1 = false; try { await rb.runReport(ctx, { dataset: "ไม่มีจริง" }); } catch { th1 = true; }
    let th2 = false; try { await rb.runReport(ctx, { dataset: "sales", filters: [{ field: "tenantId", op: "eq", value: "x" }] }); } catch { th2 = true; }
    chk("RB-3.1", "dataset ปลอม / filter field นอก whitelist → throw ทั้งคู่ (กัน injection)", th1 && th2, "throw", `${th1}/${th2}`);

    const cust = await rb.runReport(ctx, { dataset: "customers" });
    const csv = rb.toCsv(cust) as string;
    chk("RB-4.1", "toCsv: BOM + header + escape ค่ามี comma", csv.startsWith("﻿") && csv.includes('"คุณรายงาน, จำกัด"'), "BOM+quote", csv.slice(0, 40));

    const saved = await rb.saveReport(ctx, { name: "ยอดขายรายสาขา", config: { dataset: "sales", groupBy: "unitId", metric: "sum:grandTotalSatang" } });
    chk("RB-5.1", "save/list/delete รายงาน", !!saved.id && ((await rb.listReports(ctx)) as unknown[]).length === 1 && (await rb.deleteReport(ctx, saved.id)) === true && ((await rb.listReports(ctx)) as unknown[]).length === 0, "ครบวงจร", "?");

    const t2 = await prisma.tenant.create({ data: { name: "QC RPT2", slug: `qc-rpt2-${Date.now()}` } }); tid2 = t2.id;
    chk("RB-6.1", "tenant อื่น run sales → 0 แถว (guard)", (((await rb.runReport({ tenantId: tid2 }, { dataset: "sales" })).rows) as unknown[]).length === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["reportDef", "posSale", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Report Builder =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
