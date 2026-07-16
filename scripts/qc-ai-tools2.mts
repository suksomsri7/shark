// QC — AI tools v2 (WO-0022): +2 อ่าน (customer_search/sales_by_day) +1 ทำแทน (member_create) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา (ต่อยอด tools.ts + proposals.ts เดิม):
// read tools ใหม่:
//   customer_search({ query }): ค้นชื่อ/เบอร์/อีเมลลูกค้า (member.listCustomers) — คืน JSON รายชื่อ (จำกัด ~10)
//   sales_by_day({ days?=7 }): ยอดขาย PAID แยกรายวัน (วัน BKK) — คืน JSON [{day, totalSatang|บาท, count}]
// action tool ใหม่ (ผ่าน proposal เหมือน 3 ตัวเดิม — ห้ามทำทันที):
//   member_create({ name, phone?, email? }) → proposal kind "member_create"
//   execute: resolve ระบบ MEMBER → member.findOrCreate source "STAFF" · ไม่มีระบบ MEMBER → FAILED + note ไทย
//   assertCan ตาม convention "member.customer.create"
// จำนวน registry รวม = 11 (5+3 เดิม + 3 ใหม่)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER" as const, unitAccess: [] as string[], permissions: {} as Record<string, unknown> };

let tid = ""; let tid2 = "";
try {
  const tools = await import("@/lib/ai/tools");
  const pr = await import("@/lib/ai/proposals");
  const reg = tools.toolRegistry();
  const names = reg.map((t) => t.def.name);
  chk("V2-0.1", "registry 11 ตัว + มีของใหม่ครบ 3", reg.length === 11 && ["customer_search", "sales_by_day", "member_create"].every((n) => names.includes(n)), "11+ครบ", `${reg.length}:${names.sort().join(",")}`);

  const t = await prisma.tenant.create({ data: { name: "QC V2", slug: `qc-v2-${Date.now()}` } }); tid = t.id;
  const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
  const pos = await sys.createSystem(tid, "POS", "ขาย");
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "หลัก", slug: `v2-${Date.now()}` } });
  await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "สมชาย ใจดี", phone: "0812345678" } });
  await prisma.posSale.create({ data: { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "v2-s1", status: "PAID", subtotalSatang: 25000, grandTotalSatang: 25000 } });
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "qc" } });
  const rtWide = tools.runTool as unknown as (c: unknown, n: string, a: unknown) => Promise<string>;

  // read ใหม่
  const cs = await rtWide({ tenantId: tid }, "customer_search", { query: "สมชาย" });
  chk("V2-1.1", "customer_search เจอสมชาย", cs.includes("สมชาย"), "เจอ", cs.slice(0, 60));
  const cs2 = await rtWide({ tenantId: tid }, "customer_search", { query: "0812345678" });
  chk("V2-1.2", "ค้นด้วยเบอร์ก็เจอ", cs2.includes("สมชาย"), "เจอ", cs2.slice(0, 60));
  const sbd = await rtWide({ tenantId: tid }, "sales_by_day", { days: 7 });
  chk("V2-1.3", "sales_by_day มียอดวันนี้ (250 บาท) + count", (sbd.includes("250") || sbd.includes("25000")) && sbd.includes("1"), "มียอด", sbd.slice(0, 80));

  // action member_create → proposal → execute
  const before = await prisma.customer.count({ where: { tenantId: tid } });
  const out = await rtWide({ tenantId: tid, conversationId: conv.id }, "member_create", { name: "สมหญิง รักดี", phone: "0899999999" });
  const prop = await prisma.aiProposal.findFirst({ where: { tenantId: tid, kind: "member_create", status: "PENDING" }, orderBy: { createdAt: "desc" } });
  chk("V2-2.1", "member_create → proposal PENDING ไม่สร้างทันที", !!prop && out.includes(prop.id) && (await prisma.customer.count({ where: { tenantId: tid } })) === before, "proposal+นิ่ง", out.slice(0, 60));
  const ex = await pr.executeProposal(OWNER, { tenantId: tid }, prop!.id);
  const created = await prisma.customer.findFirst({ where: { tenantId: tid, name: "สมหญิง รักดี" } });
  chk("V2-2.2", "ยืนยัน → Customer เกิดจริง (ชื่อ+เบอร์ตรง)", ex.ok === true && created?.phone === "0899999999", "เกิด", JSON.stringify({ ok: ex.ok, phone: created?.phone }));

  // ไม่มีระบบ MEMBER → FAILED
  const t2 = await prisma.tenant.create({ data: { name: "QC V2-2", slug: `qc-v22-${Date.now()}` } }); tid2 = t2.id;
  const conv2 = await prisma.aiConversation.create({ data: { tenantId: tid2, title: "qc" } });
  const p2 = await pr.createProposal({ tenantId: tid2 }, { conversationId: conv2.id, kind: "member_create", summary: "x", payload: { name: "ไร้ระบบ" } });
  const ex2 = await pr.executeProposal(OWNER, { tenantId: tid2 }, p2.id);
  chk("V2-2.3", "ไม่มีระบบ MEMBER → FAILED + note ไทย", ex2.ok === false && (await prisma.aiProposal.findUnique({ where: { id: p2.id } }))?.status === "FAILED" && ex2.note.length > 0, "FAILED", ex2.note.slice(0, 60));

  // regression read เดิม
  const mc = await rtWide({ tenantId: tid }, "member_count", {});
  chk("V2-3.1", "member_count เดิมยังทำงาน (2 หลัง execute)", mc.includes("2"), "2", mc.slice(0, 40));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiProposal", "aiMessage", "aiConversation", "aiUsage", "memberActivity", "posSale", "customer", "appSystemUnit", "appSystem", "businessUnit"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Tools v2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
