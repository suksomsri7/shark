// QC — Approval edit (WO: แก้สายอนุมัติ + คำขอของฉัน) · standalone-typesafe (dynamic import + wide cast)
// สัญญาที่ทดสอบ (src/lib/modules/approval/service.ts):
//   updatePolicy(ctx, policyId, { name, thresholdSatang?, unitId?, systemId?, steps }) → { id }
//     · แทนที่ steps ทั้งชุด (เก่าหาย) · steps ว่าง → throw · guard tenant (cross-tenant → ไม่แตะ → throw)
//   listMyRequests(ctx, userId) → คำขอที่ requestedById=userId (ใหม่สุดก่อน) + policyName + totalSteps
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const ap = (await import("@/lib/modules/approval/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> }; // any จงใจ: standalone-typesafe
  const t = await prisma.tenant.create({ data: { name: "QC APEDIT", slug: `qc-aped-${Date.now()}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC APEDIT2", slug: `qc-aped2-${Date.now()}` } }); tid2 = t2.id;
  const ctx = { tenantId: tid };
  const ctx2 = { tenantId: tid2 };

  // ── สร้างสายเริ่มต้น: PO ≥5,000 · 2 ขั้น (MANAGER→OWNER) ──
  const p = await ap.createPolicy(ctx, { name: "PO เดิม ≥5,000", entityType: "PurchaseOrder", thresholdSatang: 500000, steps: [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "OWNER" }] });
  chk("APE-0", "resolve ก่อนแก้: ยอด 6,000 เข้า policy (threshold 5,000)", ((await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", amountSatang: 600000 })) as { id?: string })?.id === p.id, "เข้า", "?");

  // ── updatePolicy: เปลี่ยนชื่อ/วงเงิน (→8,000) + steps เหลือขั้นเดียว (OWNER) ──
  await ap.updatePolicy(ctx, p.id, { name: "PO ใหม่ ≥8,000", thresholdSatang: 800000, steps: [{ order: 1, approverRole: "OWNER" }] });
  const listed = (await ap.listPolicies(ctx)) as Array<{ id: string; name: string; thresholdSatang: number | null; steps: Array<{ order: number; approverRole: string }> }>;
  const p2 = listed.find((x) => x.id === p.id);
  chk("APE-1.1", "listPolicies เห็นชื่อ+วงเงินใหม่", p2?.name === "PO ใหม่ ≥8,000" && p2?.thresholdSatang === 800000, "ใหม่/800000", `${p2?.name}/${p2?.thresholdSatang}`);
  chk("APE-1.2", "steps ถูกแทนทั้งชุด (เหลือ 1 ขั้น = OWNER · ของเดิม 2 ขั้นหาย)", p2?.steps.length === 1 && p2?.steps[0]?.approverRole === "OWNER", "1×OWNER", `${p2?.steps.length}×${p2?.steps[0]?.approverRole}`);
  chk("APE-1.3", "ตาราง ApprovalStep เหลือ 1 แถวจริง (ไม่มี orphan)", (await prisma.approvalStep.count({ where: { policyId: p.id } })) === 1, "1", String(await prisma.approvalStep.count({ where: { policyId: p.id } })));

  // ── resolve หลังแก้ใช้วงเงินใหม่ ──
  chk("APE-2.1", "resolve หลังแก้: ยอด 6,000 → null (ต่ำกว่าวงเงินใหม่ 8,000)", (await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", amountSatang: 600000 })) === null, "null", "?");
  chk("APE-2.2", "resolve หลังแก้: ยอด 8,000 → เข้า policy", ((await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", amountSatang: 800000 })) as { id?: string })?.id === p.id, "เข้า", "?");

  // ── steps ว่าง → throw ──
  let threw = false; try { await ap.updatePolicy(ctx, p.id, { name: "x", steps: [] }); } catch { threw = true; }
  chk("APE-3.1", "steps ว่าง → throw", threw, "throw", "?");

  // ── cross-tenant: updatePolicy ข้ามร้าน → ไม่แตะ ──
  let threwX = false; try { await ap.updatePolicy(ctx2, p.id, { name: "โดนแฮก", thresholdSatang: 1, steps: [{ order: 1, approverRole: "MANAGER" }] }); } catch { threwX = true; }
  const after = (await ap.listPolicies(ctx)) as Array<{ id: string; name: string; thresholdSatang: number | null; steps: unknown[] }>;
  const pX = after.find((x) => x.id === p.id);
  chk("APE-4.1", "updatePolicy ข้ามร้าน → throw + ไม่แตะ (ชื่อ/วงเงิน/steps เดิม)", threwX && pX?.name === "PO ใหม่ ≥8,000" && pX?.thresholdSatang === 800000 && pX?.steps.length === 1, "ไม่แตะ", `${pX?.name}/${pX?.thresholdSatang}/${pX?.steps.length}`);

  // ── listMyRequests: เฉพาะของผู้ยื่นนั้น ──
  await ap.createPolicy(ctx, { name: "ใบลาทุกใบ", entityType: "HrLeave", steps: [{ order: 1, approverRole: "OWNER" }] });
  await ap.submitForApproval(ctx, { entityType: "HrLeave", entityId: "lv-a", requestedById: "user-1" });
  await ap.submitForApproval(ctx, { entityType: "HrLeave", entityId: "lv-b", requestedById: "user-1" });
  await ap.submitForApproval(ctx, { entityType: "HrLeave", entityId: "lv-c", requestedById: "user-2" });
  const mine = (await ap.listMyRequests(ctx, "user-1")) as Array<{ requestedById: string; entityId: string; policyName: string; totalSteps: number }>;
  chk("APE-5.1", "listMyRequests(user-1) คืนเฉพาะของ user-1 (2 คำขอ)", mine.length === 2 && mine.every((r) => r.requestedById === "user-1"), "2 ของ user-1", `${mine.length}`);
  chk("APE-5.2", "ไม่เห็นคำขอของ user-2 (lv-c)", !mine.some((r) => r.entityId === "lv-c"), "ไม่เห็น lv-c", "?");
  chk("APE-5.3", "แนบ policyName + totalSteps", mine.every((r) => r.policyName === "ใบลาทุกใบ" && r.totalSteps === 1), "ชื่อ+1", `${mine[0]?.policyName}/${mine[0]?.totalSteps}`);
  const other = (await ap.listMyRequests(ctx, "user-2")) as Array<{ entityId: string }>;
  chk("APE-5.4", "listMyRequests(user-2) เห็นแค่ lv-c", other.length === 1 && other[0]?.entityId === "lv-c", "1×lv-c", `${other.length}`);
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "appNotification", "outboxEvent"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Approval Edit =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
