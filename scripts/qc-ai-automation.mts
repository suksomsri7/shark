// QC — AI สร้างกฎ automation ผ่านการ์ดยืนยัน (คำสั่งเจ้าของ 24 ก.ค. "ทำให้ดีที่สุด") · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
//   tools.ts เพิ่ม tool "automation_create_rule" (เสนอผ่าน proposal — ไม่ทำทันที): args {name, event, minAmountBaht?, notifyTitle?}
//     — v1 จำกัด actionType NOTIFY เท่านั้น (WEBHOOK มี URL ภายนอก = ความเสี่ยง ให้ตั้งเองที่หน้า settings)
//     — event ต้องอยู่ใน whitelist ของระบบ automation จริง · event เพี้ยน → validate-explain (ไม่สร้าง proposal)
//   proposals.ts: kind "automation_create_rule" → executeProposal สร้าง AutomationRule (enabled=true, NOTIFY)
//   persona.ts พูดถึงการตั้งกฎ automation ได้
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {} };

const ts = Date.now();
const tids: string[] = [];
try {
  const t = await prisma.tenant.create({ data: { name: "QC AI-AUTO", slug: `qc-aa-${ts}` } }); tids.push(t.id);
  const conv = await prisma.aiConversation.create({ data: { tenantId: t.id, title: "ตั้งกฎ" } });
  const ctx = { tenantId: t.id };

  const toolsMod = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string }; execute: (c: unknown, a: unknown) => Promise<string> }[] };
  const tool = toolsMod.toolRegistry().find((x) => x.def.name === "automation_create_rule");
  if (!tool) chk("AA-1.0", "มี tool automation_create_rule", false, "มี", "ยังไม่สร้าง");
  else {
    // เสนอกฎถูกต้อง → เกิด AiProposal PENDING (ยังไม่สร้างกฎจริง)
    const res = await tool.execute({ tenantId: t.id, conversationId: conv.id }, { name: "เตือนบิลใหญ่", event: "pos.sale.paid", minAmountBaht: 1000, notifyTitle: "มีบิลเกิน 1,000 บาท" });
    const prop = await prisma.aiProposal.findFirst({ where: { tenantId: t.id, kind: "automation_create_rule", status: "PENDING" } });
    chk("AA-1.1", "เสนอ → AiProposal PENDING (ห้ามสร้างกฎทันที)", !!prop && (await prisma.automationRule.count({ where: { tenantId: t.id } })) === 0, "PENDING/0 กฎ", String(res).slice(0, 80));

    // event นอก whitelist → ไม่สร้าง proposal + อธิบาย
    const bad = await tool.execute({ tenantId: t.id, conversationId: conv.id }, { name: "x", event: "event.ปลอม" });
    const propCount = await prisma.aiProposal.count({ where: { tenantId: t.id, kind: "automation_create_rule" } });
    chk("AA-1.2", "event เพี้ยน → validate-explain ไม่สร้าง proposal เพิ่ม", propCount === 1 && /event|เหตุการณ์/i.test(String(bad)), "1", `${propCount}/${String(bad).slice(0, 60)}`);

    // ยืนยัน → กฎถูกสร้างจริง (NOTIFY + ยอดขั้นต่ำเป็นสตางค์)
    if (prop) {
      const proposals = (await import("@/lib/ai/proposals")) as unknown as { executeProposal: (m: unknown, c: unknown, id: string, o?: unknown) => Promise<{ ok: boolean; note: string }> };
      const ex = await proposals.executeProposal(OWNER, ctx, prop.id);
      const rule = await prisma.automationRule.findFirst({ where: { tenantId: t.id } });
      chk("AA-2.1", "ยืนยัน → AutomationRule จริง (NOTIFY · enabled · 1000บ=100000สต.)", ex.ok === true && rule?.actionType === "NOTIFY" && rule?.enabled === true && rule?.event === "pos.sale.paid" && rule?.minAmountSatang === 100_000, "ครบ", JSON.stringify({ ok: ex.ok, r: rule?.minAmountSatang }));
    }
  }
  const persona = readFileSync("src/lib/ai/persona.ts", "utf8");
  chk("AA-3.1", "persona มีกติกา automation_create_rule", persona.includes("automation_create_rule"), "มี", "ไม่พบ", "MAJOR");
} finally {
  for (const tid of tids) {
    for (const m of ["automationRule", "aiProposal", "aiMessage", "aiConversation", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-ai-automation: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
