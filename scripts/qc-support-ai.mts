// QC — AI triage support (WO-0047) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/platform/support-ai.ts:
//   draftCaseReply(caseId: string, deps?: { provider?: AiProvider }): Promise<string | null>
//     — อ่าน SupportCase + SupportMessage ทั้งเธรด (prisma ตรง — platform layer) → LLM ร่างคำตอบไทย
//     — system prompt: ทีมซัพพอร์ต SHARK · สุภาพ · **ห้ามสัญญาสิ่งที่ระบบทำไม่ได้/ห้ามแต่งฟีเจอร์** · แนบเธรดทั้งหมดใน prompt
//     — provider null (ไม่ฉีด+ไม่มี env) → คืน null เงียบ ๆ · **ห้ามเขียน DB ใด ๆ (ร่างเฉย ๆ คนกดส่งเอง)**
//   summarizeCase(caseId, deps?): Promise<string | null>   // สรุปเคสสั้น ๆ สำหรับหัวตาราง — กติกาเดียวกัน
// UI: หน้า backoffice/cases/[id] เพิ่มปุ่ม "ให้ AI ร่างคำตอบ" (client) → เรียก action → เติมข้อความลง textarea ตอบกลับ (แก้ได้ก่อนส่ง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type Msg = { role: string; content: string };
class Scripted {
  captured: Msg[][] = [];
  constructor(private text: string) {}
  async chat(messages: Msg[]): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
    this.captured.push(messages);
    return { text: this.text, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

let tid = "";
try {
  const sai = (await import("@/lib/platform/support-ai" as string).catch(() => null)) as {
    draftCaseReply: (id: string, d?: { provider?: unknown }) => Promise<string | null>;
    summarizeCase: (id: string, d?: { provider?: unknown }) => Promise<string | null>;
  } | null;
  if (!sai) { chk("SA-0", "มี src/lib/platform/support-ai.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC SAI", slug: `qc-sai-${Date.now()}` } }); tid = t.id;
    const shop = (await import("@/lib/support/service")) as unknown as {
      createCase: (c: unknown, i: unknown) => Promise<{ id: string }>;
      addShopMessage: (c: unknown, id: string, u: string, b: string) => Promise<boolean>;
    };
    const c1 = await shop.createCase({ tenantId: tid }, { userId: "u1", subject: "QR พร้อมเพย์สแกนไม่ได้", body: "ลูกค้าสแกนแล้วขึ้น error ครับ" });
    await shop.addShopMessage({ tenantId: tid }, c1.id, "u1", "ลองสองธนาคารแล้วเหมือนกัน");

    const before = { cases: await prisma.supportMessage.count({ where: { tenantId: tid } }) };
    const sp = new Scripted("สวัสดีครับ ขอบคุณที่แจ้งปัญหา ทีมงานกำลังตรวจสอบ QR ของร้านคุณครับ");
    const draft = await sai.draftCaseReply(c1.id, { provider: sp });
    chk("SA-1.1", "ได้ draft ตาม provider", draft === "สวัสดีครับ ขอบคุณที่แจ้งปัญหา ทีมงานกำลังตรวจสอบ QR ของร้านคุณครับ", "ตรง", String(draft).slice(0, 40));
    const joined = sp.captured[0]?.map((m) => m.content).join(" ") ?? "";
    chk("SA-1.2", "prompt แนบเธรดครบ (ทั้ง 2 ข้อความ)", joined.includes("สแกนแล้วขึ้น error") && joined.includes("สองธนาคาร"), "ครบ", "?");
    chk("SA-1.3", "ห้ามเขียน DB (จำนวน message เท่าเดิม)", (await prisma.supportMessage.count({ where: { tenantId: tid } })) === before.cases, "เท่าเดิม", "?");
    chk("SA-1.4", "prompt มีกติกาห้ามแต่ง/ห้ามสัญญาเกินจริง", /ห้าม(แต่ง|สัญญา)/.test(joined), "มี", "?");

    const sum = await sai.summarizeCase(c1.id, { provider: new Scripted("ลูกค้าสแกน QR ไม่ได้ 2 ธนาคาร") });
    chk("SA-2.1", "summarizeCase ทำงาน", sum === "ลูกค้าสแกน QR ไม่ได้ 2 ธนาคาร", "ตรง", "?");
    chk("SA-2.2", "ไม่มี provider → null ไม่ throw", (await sai.draftCaseReply(c1.id)) === null || process.env.SHARK_AI_KEY !== undefined, "null/มี key", "?");
    chk("SA-3.1", "เคสไม่มีจริง → null ไม่ throw", (await sai.draftCaseReply("no-such-case", { provider: sp })) === null, "null", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["supportMessage", "supportCase"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Support AI =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
