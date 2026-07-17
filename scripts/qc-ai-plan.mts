// QC — AI Plan L2 (agentic-2): แผนหลายขั้น เสนอทั้งชุด ยืนยันครั้งเดียว ทำต่อเนื่อง · Fable oracle
// สัญญา src/lib/ai/plans.ts:
//   createPlan(ctx, {conversationId, title, steps:[{kind, summary, payload}]}) → {id}
//     · steps ว่าง/เกิน 8 → throw ไทย · kind ต้องเป็น ProposalKind จริง (ปลอม throw) · hasDestructive = มี kind ใน DESTRUCTIVE_KINDS
//   executePlan(m, ctx, planId, opts?: {confirm2x?}) → {ok, results: [{summary, ok, note}], doneCount}
//     · PENDING เท่านั้น (claim → RUNNING) · hasDestructive && !confirm2x → {ok:false, needsSecondConfirm} คง PENDING
//     · รันทีละ step ผ่าน dispatch เดิม (สิทธิ์: assertCan ต่อ step ตาม KIND_ACCESS) · step ล้ม → หยุด ไม่รันต่อ · step ที่เหลือคง PENDING · plan = FAILED
//     · ครบ → DONE + executedAt · ทุก step บันทึก status/note ลง stepsJson
//   rejectPlan(ctx, id) · listPendingPlans(ctx, conversationId)
//   tool "propose_plan" (LLM เรียกเมื่อ user สั่งงานหลายอย่างพร้อมกัน) → createPlan · UI การ์ดแผน (แสดง step + ปุ่มยืนยันครั้งเดียว · destructive = 2 จังหวะ)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
let tid = "";
try {
  const pl = (await import("@/lib/ai/plans" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[] };
  if (!pl) { chk("PL-0", "มี ai/plans.ts", false); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC PLAN", slug: `qc-plan-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "plan" } });
    chk("PL-1.1", "tool propose_plan ลงทะเบียน", tools.toolRegistry().some((x) => x.def.name === "propose_plan"));
    let thKind = false; try { await pl.createPlan(ctx, { conversationId: conv.id, title: "x", steps: [{ kind: "ไม่มีจริง", summary: "s", payload: {} }] }); } catch { thKind = true; }
    chk("PL-1.2", "kind ปลอม → throw", thKind);
    // แผน 3 ขั้น: สร้างสินค้า → รับเข้า → จดความจำผ่าน kanban? ใช้ inventory ล้วน: create item → receive → adjust
    const plan = await pl.createPlan(ctx, { conversationId: conv.id, title: "ตั้งสต็อกกาแฟ", steps: [
      { kind: "inventory_create_item", summary: "สร้างสินค้า กาแฟ", payload: { sku: "PL-1", name: "กาแฟ" } },
      { kind: "inventory_receive", summary: "รับเข้า 20", payload: { sku: "PL-1", qty: 20, costSatang: 5000 } },
      { kind: "inventory_adjust", summary: "ปรับเป็น 18", payload: { sku: "PL-1", newQty: 18, note: "นับจริง" } },
    ] });
    const ex = await pl.executePlan(OWNER, ctx, plan.id);
    const item = await prisma.invItem.findFirst({ where: { tenantId: tid, sku: "PL-1" } });
    chk("PL-2.1", "แผน 3 ขั้นรันต่อเนื่องจบ → DONE + สต็อกจบที่ 18", ex?.ok === true && ex?.doneCount === 3 && item?.onHand === 18 && (await prisma.aiPlan.findUnique({ where: { id: plan.id as string } }))?.status === "DONE");
    chk("PL-2.2", "results รายงานทีละขั้น (3 แถว ok หมด)", Array.isArray(ex?.results) && ex.results.length === 3 && ex.results.every((r: any) => r.ok === true));
    chk("PL-2.3", "รันซ้ำแผนเดิม → ok:false (ไม่ทำซ้ำ)", ((await pl.executePlan(OWNER, ctx, plan.id)) as { ok: boolean }).ok === false);
    // แผนที่ step กลางล้ม → หยุด
    const bad = await pl.createPlan(ctx, { conversationId: conv.id, title: "แผนล้มกลางทาง", steps: [
      { kind: "inventory_receive", summary: "รับ PL-1 อีก 5", payload: { sku: "PL-1", qty: 5, costSatang: 5000 } },
      { kind: "inventory_receive", summary: "รับของที่ไม่มีจริง", payload: { sku: "NO-SUCH", qty: 1 } },
      { kind: "inventory_receive", summary: "ห้ามถึงขั้นนี้", payload: { sku: "PL-1", qty: 99, costSatang: 1 } },
    ] });
    const ex2 = await pl.executePlan(OWNER, ctx, bad.id);
    const item2 = await prisma.invItem.findFirst({ where: { tenantId: tid, sku: "PL-1" } });
    chk("PL-3.1", "step 2 ล้ม → หยุด (step 3 ไม่รัน · สต็อก 23 ไม่ใช่ 122) + plan FAILED", ex2?.ok === false && item2?.onHand === 23 && (await prisma.aiPlan.findUnique({ where: { id: bad.id as string } }))?.status === "FAILED");
    // แผนมี destructive → 2 ชั้นระดับแผน
    const wipe = await pl.createPlan(ctx, { conversationId: conv.id, title: "มี void", steps: [{ kind: "void_sale", summary: "ยกเลิกบิล", payload: { saleId: "none" } }] });
    const exW = await pl.executePlan(OWNER, ctx, wipe.id);
    chk("PL-4.1", "แผนมี step destructive → needsSecondConfirm (ยังไม่รัน)", exW?.ok === false && exW?.needsSecondConfirm === true && (await prisma.aiPlan.findUnique({ where: { id: wipe.id as string } }))?.status === "PENDING");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiPlan", "aiProposal", "aiConversation", "invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Plan =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
