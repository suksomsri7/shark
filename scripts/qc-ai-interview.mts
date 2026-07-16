// QC — M4 สัมภาษณ์พิมพ์อิสระ (WO-0016) · Fable oracle, Builder ห้ามแตะ
// สัญญา src/lib/ai/interview.ts ที่ Builder ต้องทำตาม:
//   export type InterviewTurn = { role: "user" | "assistant"; content: string };
//   export type InterviewResult = { done: false; question: string } | { done: true; facts: DnaFacts };
//   export async function nextInterviewTurn(provider: AiProvider, tenantName: string, transcript: InterviewTurn[]): Promise<InterviewResult>
// โปรโตคอล LLM: ตอบ "คำถามถัดไป" เป็นข้อความธรรมดา หรือปิดจ๊อบด้วยบรรทัด `FACTS_JSON: {…13 field ตาม ZDnaFacts…}`
// กติกาเหล็ก: JSON เพี้ยน/facts ไม่ผ่าน ZDnaFacts → ต้องคืน done:false ถามต่อ (ห้าม throw) · ZDnaFacts.parse ที่ boundary เสมอ
try { process.loadEnvFile(".env"); } catch {}
const { ZBlueprintPlan } = await import("@/lib/dna/schema");
const { compile } = await import("@/lib/dna/compile");
import type { AiChatMessage, AiProvider, AiReply } from "@/lib/ai/provider";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// provider สคริปต์ — ตอบตามคิว + จับ messages ที่ถูกส่งเข้า (ตรวจ system prompt)
class Scripted implements AiProvider {
  captured: AiChatMessage[][] = [];
  constructor(private replies: string[]) {}
  async chat(messages: AiChatMessage[]): Promise<AiReply> {
    this.captured.push(messages);
    const text = this.replies.shift() ?? "";
    return { text, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

const SALON_FACTS = {
  industryHint: "SALON", branchCount: 3, appointment: true, tables: false, rooms: false,
  walkinQueue: false, sellsGoods: true, membership: true, rewardRedeem: true,
  staffCount: 5, vatRegistered: false, wantsAccounting: true, usesLineOA: true,
};

try {
  const iv = await import("@/lib/ai/interview" as string).catch(() => null);
  if (!iv) { chk("MI-0", "มี src/lib/ai/interview.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    // 1) LLM ตอบเป็นคำถาม → done:false ส่งคำถามผ่านตรง
    const p1 = new Scripted(["มีทั้งหมดกี่สาขาครับ?"]);
    const r1 = await iv.nextInterviewTurn(p1, "ร้านทดสอบ", [{ role: "user", content: "ผมเปิดร้านตัดผม" }]);
    chk("MI-1.1", "LLM ถามต่อ → done:false + คำถามผ่านตรง", r1.done === false && r1.question === "มีทั้งหมดกี่สาขาครับ?", "คำถามเดิม", JSON.stringify(r1).slice(0, 60));
    const sys1 = p1.captured[0]?.find((m) => m.role === "system")?.content ?? "";
    chk("MI-1.2", "system prompt มีชื่อกิจการ + โปรโตคอล FACTS_JSON", sys1.includes("ร้านทดสอบ") && sys1.includes("FACTS_JSON"), "มีทั้งคู่", sys1.slice(0, 60));
    chk("MI-1.3", "transcript ถูกส่งเข้า provider ครบ", (p1.captured[0] ?? []).some((m) => m.role === "user" && m.content.includes("ร้านตัดผม")), "มีข้อความ user", "?");

    // 2) LLM ปิดจ๊อบ FACTS_JSON ถูกต้อง → done:true + facts ผ่าน ZDnaFacts + compile ได้
    const r2 = await iv.nextInterviewTurn(new Scripted([`โอเค สรุปได้แล้วครับ\nFACTS_JSON: ${JSON.stringify(SALON_FACTS)}`]), "ร้านทดสอบ", [{ role: "user", content: "ครบแล้ว" }]);
    chk("MI-2.1", "FACTS_JSON ถูกต้อง → done:true", r2.done === true, "true", JSON.stringify(r2).slice(0, 60));
    if (r2.done) {
      chk("MI-2.2", "facts ตรง (SALON · 3 สาขา · 5 คน)", r2.facts.industryHint === "SALON" && r2.facts.branchCount === 3 && r2.facts.staffCount === 5, "ตรง", JSON.stringify(r2.facts).slice(0, 80));
      const plan = compile(r2.facts, "ร้านทดสอบ");
      const parsed = ZBlueprintPlan.safeParse(plan);
      chk("MI-2.3", "facts → compile ได้ blueprint ถูกสัญญา + มี steps", parsed.success && plan.steps.length > 0, "ผ่าน+>0", `${parsed.success}/${plan.steps.length}`);
    }

    // 3) JSON เพี้ยน → ห้าม throw ต้อง done:false ถามต่อ
    const r3 = await iv.nextInterviewTurn(new Scripted(["FACTS_JSON: {พัง!!!"]), "ร้านทดสอบ", []);
    chk("MI-3.1", "JSON เพี้ยน → done:false ไม่ throw", r3.done === false && typeof (r3 as { question?: string }).question === "string" && (r3 as { question: string }).question.length > 0, "done:false+คำถาม", JSON.stringify(r3).slice(0, 60));

    // 4) facts ไม่ผ่านสัญญา (branchCount 0) → done:false
    const bad = { ...SALON_FACTS, branchCount: 0 };
    const r4 = await iv.nextInterviewTurn(new Scripted([`FACTS_JSON: ${JSON.stringify(bad)}`]), "ร้านทดสอบ", []);
    chk("MI-4.1", "facts ผิดสัญญา (สาขา 0) → done:false", r4.done === false, "false", JSON.stringify(r4).slice(0, 60));

    // 5) มีข้อความห้อยท้าย JSON → ยังสกัดได้ (LLM ชอบพูดเกิน)
    const r5 = await iv.nextInterviewTurn(new Scripted([`FACTS_JSON: ${JSON.stringify(SALON_FACTS)}\nหวังว่าจะช่วยได้นะครับ`]), "ร้านทดสอบ", []);
    chk("MI-5.1", "JSON + ข้อความห้อยท้าย → สกัดได้ done:true", r5.done === true, "true", JSON.stringify(r5).slice(0, 50));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Interview (M4) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
