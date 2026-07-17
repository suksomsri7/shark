// QC — Dashboard builder v1 (WO-0056) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/dashboard/widgets.ts (ต่อยอด dashboard/service เดิม — WO-0030):
//   WIDGETS: Record<string, { label: string(ไทย), unit?: string }> — อย่างน้อย 8 ตัว:
//     salesToday(บาท) · sales7d(บาท) · billsToday · newCustomers7d · lowStockCount · pendingLeaves ·
//     pendingApprovals(ApprovalRequest PENDING) · shopOrdersPending(ShopOrder PENDING_PAYMENT)
//   getDashboardLayout(ctx {tenantId}) → string[] — ยังไม่ตั้ง = default (≥4 ตัวแรก) · ตั้งแล้ว = ตามที่บันทึก
//   saveDashboardLayout(ctx, keys: string[]) → {ok} — key นอก WIDGETS → throw ไทย · ว่าง → throw · เก็บลง TenantDashboard (find→update/create)
//   runWidgets(ctx, keys) → [{ key, label, value: number }] — ตามลำดับ keys · ระบบไม่เปิด = 0 ห้าม throw
//     · เงินคืนเป็น "สตางค์" (UI ค่อย format) — salesToday ต้องตรงยอด PosSale PAID วันนี้ (BKK)
//   UI: หน้า /app (dashboard) render ตาม layout + โหมด "ปรับแต่ง" (เลือก/เรียง widget แล้วบันทึก) — actions assertCan dashboard.layout.update
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = "";
try {
  const w = (await import("@/lib/dashboard/widgets" as string).catch(() => null)) as { [k: string]: any } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!w) { chk("DW-0", "มี dashboard/widgets.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC DW", slug: `qc-dw-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    const REQ = ["salesToday", "sales7d", "billsToday", "newCustomers7d", "lowStockCount", "pendingLeaves", "pendingApprovals", "shopOrdersPending"];
    chk("DW-1.1", "WIDGETS ครบ ≥8 ตัว + ป้ายไทย", REQ.every((k) => w.WIDGETS[k] && /[ก-๙]/.test(w.WIDGETS[k].label)), "ครบ", JSON.stringify(Object.keys(w.WIDGETS ?? {})));
    const def = (await w.getDashboardLayout(ctx)) as string[];
    chk("DW-1.2", "default layout ≥4 ตัว ทุก key อยู่ใน WIDGETS", def.length >= 4 && def.every((k) => k in w.WIDGETS), "≥4", JSON.stringify(def));
    let th1 = false; try { await w.saveDashboardLayout(ctx, ["ไม่มีจริง"]); } catch { th1 = true; }
    let th2 = false; try { await w.saveDashboardLayout(ctx, []); } catch { th2 = true; }
    chk("DW-2.1", "key ปลอม/ว่าง → throw ทั้งคู่", th1 && th2, "throw", `${th1}/${th2}`);
    await w.saveDashboardLayout(ctx, ["pendingLeaves", "salesToday"]);
    await w.saveDashboardLayout(ctx, ["salesToday", "pendingApprovals"]);
    chk("DW-2.2", "บันทึกซ้ำ (find→update) → ค่าล่าสุด+ลำดับตรง + แถวเดียว", JSON.stringify(await w.getDashboardLayout(ctx)) === JSON.stringify(["salesToday", "pendingApprovals"]) && (await prisma.tenantDashboard.count({ where: { tenantId: tid } })) === 1, "ล่าสุด/1", "?");
    const pos = await sys.createSystem(tid, "POS", "ขาย");
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ส", slug: `dw-${Date.now()}` } });
    await prisma.posSale.create({ data: { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "dw1", status: "PAID", subtotalSatang: 12300, grandTotalSatang: 12300 } });
    const out = (await w.runWidgets(ctx, ["salesToday", "pendingApprovals"])) as { key: string; value: number }[];
    chk("DW-3.1", "runWidgets: salesToday 12300 สตางค์ · pendingApprovals 0 (ระบบไม่เปิด ไม่ throw) · ลำดับตรง", out.length === 2 && out[0].key === "salesToday" && out[0].value === 12300 && out[1].value === 0, "12300/0", JSON.stringify(out));
    const pageSrc = (await import("node:fs")).readFileSync("src/app/app/page.tsx", "utf8");
    chk("DW-4.1", "หน้า /app ใช้ layout+runWidgets", /getDashboardLayout|runWidgets/.test(pageSrc), "ใช้", "?", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} }; if (tid) { for (const m of ["tenantDashboard", "posSale", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); } await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Dashboard Builder =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
