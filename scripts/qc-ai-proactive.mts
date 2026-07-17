// QC — AI เชิงรุก ระดับ 1 (level 1 proactive): เห็นปัญหา→ทักก่อน+เสนอทางแก้ · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/ai/proactive.ts (deterministic — ห้าม LLM):
//   gatherProactiveInsights(ctx {tenantId}) → [{ key, message(ไทย มีตัวเลข), actionHint? }]
//     กติกา v1 (อย่างน้อย 4): lowStock (InvItem onHand ≤ reorderPoint, >0 รายการ) · pendingApprovalsAged (ApprovalRequest PENDING เก่ากว่า 2 วัน) ·
//       pendingLeavesAged (HrLeave PENDING เก่ากว่า 2 วัน) · shopOrdersPending (ShopOrder PENDING_PAYMENT >0)
//     · ไม่มีปัญหา → [] · ระบบไม่เปิด/ตารางว่าง = ข้ามเงียบ ห้าม throw
//   sweepProactiveNudges(now?: Date) → number — tenant ACTIVE (cap 50):
//     insight ≥1 → AppNotification { title:"ผู้ช่วยมีเรื่องอยากบอก", body: รวม insight (ทัก + ชวนสั่ง AI แก้) }
//     · กันสแปม: มี noti title นี้ของวันเดียวกัน (BKK) → ข้าม · ร้านพัง catch ไปต่อ
//   cron: runDailyCron เพิ่ม field proactiveNudges (try/catch -1 · field เดิมห้ามหาย)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const DAY = 86400000;
let tid = ""; let tid2 = "";
try {
  const pa = (await import("@/lib/ai/proactive" as string).catch(() => null)) as { gatherProactiveInsights: (c: any) => Promise<any[]>; sweepProactiveNudges: (n?: Date) => Promise<number> } | null;
  if (!pa) { chk("PR-0", "มี ai/proactive.ts", false); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC PROACT", slug: `qc-pr-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    // low stock
    const invS = await sys.createSystem(tid, "INVENTORY", "คลัง");
    await prisma.invItem.create({ data: { tenantId: tid, systemId: invS.id, sku: "PR-1", name: "กาแฟ", onHand: 2, reorderPoint: 5 } });
    // pending approval เก่า
    const pol = await prisma.approvalPolicy.create({ data: { tenantId: tid, name: "x", entityType: "PurchaseOrder" } });
    await prisma.approvalRequest.create({ data: { tenantId: tid, policyId: pol.id, entityType: "PurchaseOrder", entityId: "po-old", requestedById: "u1", idempotencyKey: "k1", status: "PENDING", createdAt: new Date(Date.now() - 3 * DAY) } });
    // pending leave เก่า
    const hrS = await sys.createSystem(tid, "HR", "คน");
    const emp = await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hrS.id, name: "พนง" } });
    await prisma.hrLeave.create({ data: { tenantId: tid, systemId: hrS.id, employeeId: emp.id, fromDate: new Date("2026-09-01"), toDate: new Date("2026-09-02"), status: "PENDING", createdAt: new Date(Date.now() - 3 * DAY) } });

    const ins = await pa.gatherProactiveInsights(ctx);
    const keys = (ins as { key: string; message: string }[]).map((x) => x.key);
    chk("PR-1.1", "เห็น ≥3 insight (สต็อก/อนุมัติค้าง/ลาค้าง) + message ไทยมีตัวเลข", ins.length >= 3 && (ins as { message: string }[]).every((x) => /[ก-๙]/.test(x.message)) && keys.some((k) => k.toLowerCase().includes("stock")));
    const t2 = await prisma.tenant.create({ data: { name: "QC PROACT2", slug: `qc-pr2-${Date.now()}` } }); tid2 = t2.id;
    chk("PR-1.2", "ร้านไม่มีปัญหา → [] ไม่ throw", (await pa.gatherProactiveInsights({ tenantId: tid2 })).length === 0);

    const n1 = await pa.sweepProactiveNudges();
    const notiCount = () => prisma.appNotification.count({ where: { tenantId: tid, title: "ผู้ช่วยมีเรื่องอยากบอก" } });
    chk("PR-2.1", "sweep → noti 1 ฉบับ (นับ ≥1)", n1 >= 1 && (await notiCount()) === 1);
    await pa.sweepProactiveNudges();
    chk("PR-2.2", "sweep ซ้ำวันเดียวกัน → ไม่ส่งซ้ำ (ยัง 1)", (await notiCount()) === 1);
    chk("PR-2.3", "ร้านไม่มีปัญหา → ไม่มี noti", (await prisma.appNotification.count({ where: { tenantId: tid2 } })) === 0);

    const cron = (await import("@/lib/platform/cron")) as unknown as { runDailyCron: (n?: Date) => Promise<Record<string, number>> };
    const res = await cron.runDailyCron();
    chk("PR-3.1", "runDailyCron มี proactiveNudges + field เดิมครบ", typeof res.proactiveNudges === "number" && ["subsExpired", "onboardingDripped", "dnaReviews", "lotsExpiring"].every((k) => typeof res[k] === "number"));
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { for (const m of ["appNotification", "approvalRequest", "approvalPolicy", "hrLeave", "hrEmployee", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Proactive =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
