// QC — KB auto-capture (คำสั่งเจ้าของ: AI เข้าใจบริบทและเก็บความรู้จำเป็นลง KB อัตโนมัติ) · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
//   tools.ts เพิ่ม tool "kb_auto_save" (เขียนทันที ไม่ผ่าน proposal — แบบ remember_fact/support_open_case)
//     args {title, content, category?} → createArticle ของ kb service เดิม (ห้าม fork)
//     description ต้องกำกับ: ใช้เมื่อ user บอก "ความรู้ถาวรของกิจการ" (นโยบาย/ราคา/วิธีทำงาน/กติกา)
//       ห้ามเก็บเรื่องชั่วคราว/คำสั่งงาน + เช็ค kb_search ก่อนกันซ้ำ + ตอบ user สั้น ๆ ว่าบันทึกแล้ว
//   persona.ts มีกติกา auto เก็บความรู้ลง KB
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

const ts = Date.now();
const tids: string[] = [];
try {
  const t = await prisma.tenant.create({ data: { name: "QC KB-AUTO", slug: `qc-kba-${ts}` } }); tids.push(t.id);

  const toolsMod = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string; description: string }; execute: (ctx: unknown, args: unknown) => Promise<string> }[] };
  const tool = toolsMod.toolRegistry().find((x) => x.def.name === "kb_auto_save");
  if (!tool) chk("KA-1.0", "มี tool kb_auto_save ใน registry", false, "มี", "ยังไม่สร้าง");
  else {
    chk("KA-1.1", "description กำกับ: ความรู้ถาวรเท่านั้น + กันซ้ำ", /ถาวร/.test(tool.def.description) && /ซ้ำ/.test(tool.def.description), "มี", tool.def.description.slice(0, 80), "MAJOR");
    const res = await tool.execute({ tenantId: t.id, conversationId: "conv-qc" }, { title: "นโยบายคืนสินค้า", content: "รับคืนภายใน 7 วัน พร้อมใบเสร็จ สภาพสมบูรณ์เท่านั้น", category: "นโยบายร้าน" });
    const row = await prisma.kbArticle.findFirst({ where: { tenantId: t.id, title: "นโยบายคืนสินค้า" } });
    chk("KA-1.2", "execute → KbArticle ถูกสร้างจริงใน tenant", !!row && row.body.includes("7 วัน"), "มีแถว", String(res).slice(0, 80));
    chk("KA-1.3", "ผลลัพธ์ tool บอกว่าบันทึกแล้ว (AI เอาไปตอบ user ต่อ)", /บันทึก/.test(String(res)), "มี", String(res).slice(0, 80), "MAJOR");
  }

  const persona = readFileSync("src/lib/ai/persona.ts", "utf8");
  chk("KA-2.1", "persona มีกติกา auto เก็บความรู้ลง KB", /kb_auto_save/.test(persona), "มี", "ไม่พบ");
} finally {
  for (const tid of tids) {
    await prisma.kbArticle.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-kb-auto: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
