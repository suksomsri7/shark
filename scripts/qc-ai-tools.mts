// QC — Phase 3 v1: AI tool use อ่านข้อมูลจริง (WO-0018) · Fable oracle, Builder ห้ามแตะ
//
// สัญญาที่ Builder ต้องทำตาม:
// 1) src/lib/ai/provider.ts ขยาย (คงพฤติกรรมเดิมทั้งหมด):
//    export type AiChatMessage = { role: "system"|"user"|"assistant"|"tool"; content: string; toolCallId?: string; toolCalls?: AiToolCall[] }
//    export type AiToolDef = { name: string; description: string; parameters: object }   // JSON Schema
//    export type AiToolCall = { id: string; name: string; args: unknown }
//    export type AiReply = { text: string; toolCalls?: AiToolCall[]; tokensIn: number; tokensOut: number; model: string }
//    chat(messages: AiChatMessage[], opts?: { maxTokens?: number; tools?: AiToolDef[] }): Promise<AiReply>
//    OpenRouterProvider: map tools → OpenAI tools param · อ่าน tool_calls จาก response (JSON.parse arguments — เพี้ยน = args {}) ·
//                        ส่งกลับ: assistant ที่มี toolCalls → message.tool_calls · role:"tool" → { role:"tool", tool_call_id, content }
//    MockProvider: เดิม (ไม่แตะ tools)
// 2) src/lib/ai/tools.ts (ใหม่):
//    export type AiTool = { def: AiToolDef; execute(ctx: { tenantId: string }, args: unknown): Promise<string> }  // คืน JSON string ให้ LLM
//    export function toolRegistry(): AiTool[]  // 5 ตัว: list_systems · sales_summary({days?=7}) · low_stock · pending_leaves · member_count
//    export async function runTool(ctx, name: string, args: unknown): Promise<string>  // tool ไม่รู้จัก/execute พัง → คืน JSON {"error":"..."} ห้าม throw
//    (model system-scoped เช่น InvItem/HrLeave: หา AppSystem ประเภทนั้นก่อนแล้ว query ต่อ system — ดู pattern marketing/service.ts)
// 3) src/lib/ai/service.ts — sendMessage(ctx, input, deps?: { provider?: AiProvider }): agent loop
//    ส่ง tools ทุกรอบ · reply มี toolCalls → append assistant(toolCalls) + tool result ต่อรอบถัดไป · เพดาน 5 รอบ (ครบ = จบด้วยข้อความสุภาพ ok:true)
//    persist เฉพาะ USER + ASSISTANT ตัวจบ (ไม่เก็บ tool traffic) · usage รวมทุกรอบ
// 4) persona.ts: บอกว่า AI ดูข้อมูลจริงของร้านผ่านเครื่องมือได้ (ตัดประโยค "ยังทำรายการแทนไม่ได้" ให้เหลือเฉพาะ mutation)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

class Scripted implements AiProvider {
  captured: { messages: AiChatMessage[]; tools?: AiToolDef[] }[] = [];
  constructor(private replies: Partial<AiReply>[]) {}
  async chat(messages: AiChatMessage[], opts?: { tools?: AiToolDef[] }): Promise<AiReply> {
    this.captured.push({ messages, tools: opts?.tools });
    const r = this.replies.shift() ?? {};
    return { text: r.text ?? "", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

let tid = "";
try {
  const tools = await import("@/lib/ai/tools" as string).catch(() => null);
  if (!tools) { chk("TU-0", "มี src/lib/ai/tools.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const reg = tools.toolRegistry() as { def: AiToolDef }[];
    const names = reg.map((t) => t.def.name);
    const readFive = ["list_systems", "low_stock", "member_count", "pending_leaves", "sales_summary"];
    chk("TU-0.1", "registry ครบ 5 เครื่องมืออ่าน (จำนวนรวมคุมโดย oracle รุ่นล่าสุด)", reg.length >= 8 && readFive.every((n) => names.includes(n)), "≥8+ครบ 5 อ่าน", `${reg.length}:${names.sort().join(",")}`);
    chk("TU-0.2", "ทุก tool มี description + parameters", reg.every((t) => t.def.description.length > 0 && typeof t.def.parameters === "object"), "ครบ", "?");

    // ── seed ──
    const t = await prisma.tenant.create({ data: { name: "QC TOOLS", slug: `qc-tools-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const hr = await sys.createSystem(tid, "HR", "พนักงาน");
    const pos = await sys.createSystem(tid, "POS", "ขายหน้าร้าน");
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขาหลัก", slug: `u-${Date.now()}` } });
    await prisma.customer.createMany({ data: [
      { tenantId: tid, memberSystemId: member.id, name: "ลูกค้า 1" },
      { tenantId: tid, memberSystemId: member.id, name: "ลูกค้า 2" },
    ] });
    const invSvc = await import("@/lib/modules/inventory/service");
    const item = await invSvc.createItem({ tenantId: tid, systemId: inv.id }, { sku: "QC-1", name: "แชมพู", reorderPoint: 5 });
    await invSvc.receive({ tenantId: tid, systemId: inv.id }, { itemId: item.id, qty: 3, costSatang: 1000, idempotencyKey: "qc-r1" });
    const hrSvc = await import("@/lib/modules/hr/service");
    const emp = await hrSvc.createEmployee({ tenantId: tid, systemId: hr.id }, { name: "พนักงานทดสอบ" });
    await hrSvc.requestLeave({ tenantId: tid, systemId: hr.id }, { employeeId: emp.id, type: "SICK", fromDate: "2026-07-16", toDate: "2026-07-16", reason: "qc" });
    await prisma.posSale.create({ data: { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "qc-s1", status: "PAID", subtotalSatang: 15000, grandTotalSatang: 15000 } });

    // ── execute ตรง ๆ ──
    const ls = await tools.runTool(ctx, "list_systems", {});
    chk("TU-1.1", "list_systems เห็นครบ 4 ระบบ", ["MEMBER", "INVENTORY", "HR", "POS"].every((x) => ls.includes(x)), "ครบ", ls.slice(0, 80));
    const mc = await tools.runTool(ctx, "member_count", {});
    chk("TU-1.2", "member_count = 2", mc.includes("2"), "มีเลข 2", mc.slice(0, 60));
    const lo = await tools.runTool(ctx, "low_stock", {});
    chk("TU-1.3", "low_stock เจอแชมพู (3 ≤ RP 5)", lo.includes("แชมพู"), "มีแชมพู", lo.slice(0, 80));
    const pl = await tools.runTool(ctx, "pending_leaves", {});
    chk("TU-1.4", "pending_leaves เจอใบลา + ชื่อพนักงาน", pl.includes("พนักงานทดสอบ"), "มีชื่อ", pl.slice(0, 80));
    const ss = await tools.runTool(ctx, "sales_summary", { days: 7 });
    chk("TU-1.5", "sales_summary รวมยอดวันนี้ (150 บาท)", ss.includes("150") || ss.includes("15000"), "มียอด", ss.slice(0, 80));

    // ── กันพัง ──
    const uk = await tools.runTool(ctx, "hack_the_db", {});
    chk("TU-2.1", "tool ไม่รู้จัก → JSON error ไม่ throw", uk.includes("error"), "error", uk.slice(0, 60));
    const badArgs = await tools.runTool(ctx, "sales_summary", { days: "พัง" });
    chk("TU-2.2", "args เพี้ยน → ไม่ throw (error หรือ default)", typeof badArgs === "string" && badArgs.length > 0, "string", badArgs.slice(0, 60));

    // ── agent loop ใน service ──
    const svc = await import("@/lib/ai/service");
    const sp = new Scripted([
      { toolCalls: [{ id: "1", name: "member_count", args: {} }] },
      { text: "ร้านคุณมีสมาชิก 2 คนครับ" },
    ]);
    const r = await svc.sendMessage(ctx, { text: "มีสมาชิกกี่คน" }, { provider: sp });
    chk("TU-3.1", "loop: tool call → คำตอบจบ", r.ok === true && (r as { reply: string }).reply.includes("2 คน"), "คำตอบจบ", JSON.stringify(r).slice(0, 80));
    chk("TU-3.2", "รอบแรกส่ง tools ครบทั้ง registry ให้ LLM (test=prod)", (sp.captured[0]?.tools?.length ?? 0) === tools.toolRegistry().length, String(tools.toolRegistry().length), String(sp.captured[0]?.tools?.length));
    const toolMsg = sp.captured[1]?.messages.find((m) => m.role === "tool");
    chk("TU-3.3", "รอบสองมี tool result (เลข 2 + toolCallId)", !!toolMsg && toolMsg.content.includes("2") && toolMsg.toolCallId === "1", "มี", JSON.stringify(toolMsg).slice(0, 80));
    if (r.ok) {
      const persisted = await svc.listMessages(ctx, r.conversationId);
      chk("TU-3.4", "persist เฉพาะ USER+ASSISTANT จบ (2 แถว)", persisted.length === 2, "2", String(persisted.length));
    }
    // loop cap: ยิง tool ตลอด → ต้องจบเองใน ≤5 รอบ ไม่ infinite
    const loopy = new Scripted(Array.from({ length: 10 }, () => ({ toolCalls: [{ id: "x", name: "member_count", args: {} }] })));
    const r2 = await svc.sendMessage(ctx, { text: "วนไป" }, { provider: loopy });
    chk("TU-4.1", "เพดาน 5 รอบ: จบเอง ok:true + มีข้อความ", r2.ok === true && (r2 as { reply: string }).reply.length > 0 && loopy.captured.length <= 5, `≤5 รอบ`, `${loopy.captured.length} รอบ · ${JSON.stringify(r2).slice(0, 60)}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  if (tid) { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    for (const m of ["aiMessage", "aiConversation", "aiUsage", "posSale", "hrLeave", "hrAttendance", "hrEmployee", "invMovement", "invItem", "customer", "appSystemUnit", "appSystem", "businessUnit"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Tools (Phase 3 v1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
