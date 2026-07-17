// QC — AI Phase A: choice/clarify + destructive 2-layer + validate-explain (feedback เจ้าของ 2026-07-17)
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา (schema AiProposal.risk เพิ่มแล้ว: NORMAL|DESTRUCTIVE):
// [1] CHOICE/CLARIFY — เมื่อคำสั่งกำกวม AI ถามกลับพร้อมตัวเลือกให้กด:
//   src/lib/ai/tools.ts: tool "ask_clarify" (def เท่านั้น — LLM เรียกเมื่อไม่ชัด) params {question, options:[{label,value}]}
//   src/lib/ai/service.ts SendResult เพิ่ม optional { clarify?: { question: string; options: {label:string; value:string}[] } }
//     — เมื่อ agent loop พบ LLM เรียก ask_clarify → จบเทิร์นด้วย reply=question + clarify.options (ไม่สร้าง proposal)
//   AiChat.tsx: render ปุ่มตัวเลือก · กด = ส่ง value เป็นข้อความถัดไป
// [2] DESTRUCTIVE 2-LAYER — proposal ลบ/void/ยกเลิก ต้องยืนยัน 2 ชั้น:
//   proposals.ts: DESTRUCTIVE_KINDS + createProposal ตั้ง risk="DESTRUCTIVE" ให้ kind กลุ่มนี้ · เพิ่ม kind: void_sale, cancel_appointment, cancel_reservation, kanban_archive_card
//   executeProposal(m, ctx, id, opts?: { confirm2x?: boolean }) — ถ้า proposal.risk==="DESTRUCTIVE" และ !confirm2x → { ok:false, note:"ต้องยืนยันครั้งที่สอง", needsSecondConfirm:true } ไม่ทำจริง (ยัง PENDING)
//     · confirm2x=true → ทำจริง · NORMAL ไม่ต้อง (ทำได้เลยชั้นเดียว เหมือนเดิม — regression proposals ต้องเขียว)
//   dispatch destructive: void_sale→pos.voidSale · cancel_appointment→booking.setAppointmentStatus CANCELLED · cancel_reservation→hotel.cancelReservation · kanban_archive_card→kanban.archiveCard
//   tools ใหม่: void_sale (saleId) — action tool เสนอ destructive
// [3] VALIDATE-EXPLAIN — tool ตรวจ input ก่อนเสนอ ถ้าผิดคืน {error, suggestion?} (ไม่สร้าง proposal) ให้ LLM อธิบาย:
//   inventory_adjust: newQty < 0 → { error:"...ติดลบไม่ได้...", suggestion:"ตั้งเป็น 0?" } ไม่สร้าง proposal
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
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[]; runTool: (c: any, n: string, a: any) => Promise<string> };
  const props = (await import("@/lib/ai/proposals")) as unknown as { createProposal: (c: any, i: any) => Promise<any>; executeProposal: (m: any, c: any, id: string, o?: any) => Promise<any> };
  const t = await prisma.tenant.create({ data: { name: "QC PHASEA", slug: `qc-pa-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };

  // [1] ask_clarify tool มีอยู่
  chk("PA-1.1", "tool ask_clarify ลงทะเบียน (ถามกลับแบบ choice)", tools.toolRegistry().some((x) => x.def.name === "ask_clarify"));

  // [2] destructive kind → risk DESTRUCTIVE + 2-layer
  const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
  const kbSys = await sys.createSystem(tid, "KANBAN", "บอร์ด");
  const kanbanSvc = (await import("@/lib/modules/kanban/service")) as unknown as { createBoard: (i: any) => Promise<any>; getBoard: (t: string, s: string, b: string) => Promise<any>; createCard: (i: any) => Promise<any>; listCards?: any };
  const board = await kanbanSvc.createBoard({ tenantId: tid, systemId: kbSys.id, name: "บอร์ด", description: null });
  const full = await kanbanSvc.getBoard(tid, kbSys.id, board.id);
  const card = await kanbanSvc.createCard({ tenantId: tid, systemId: kbSys.id, columnId: full.columns[0].id, title: "การ์ดจะลบ", description: null });
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "x" } });
  const dp = await props.createProposal(ctx, { conversationId: conv.id, kind: "kanban_archive_card", summary: `ลบการ์ด "${card.title}"`, payload: { cardId: card.id } });
  const row = await prisma.aiProposal.findUnique({ where: { id: dp.id as string } });
  chk("PA-2.1", "proposal ลบการ์ด → risk=DESTRUCTIVE อัตโนมัติ", (row as { risk?: string })?.risk === "DESTRUCTIVE");
  const first = await props.executeProposal(OWNER, ctx, dp.id);
  const cardAfter1 = await prisma.kanbanCard.findUnique({ where: { id: card.id as string } });
  chk("PA-2.2", "ยืนยันชั้นเดียว → ยังไม่ลบ + needsSecondConfirm", first?.ok === false && first?.needsSecondConfirm === true && cardAfter1?.archivedAt == null);
  const second = await props.executeProposal(OWNER, ctx, dp.id, { confirm2x: true });
  const cardAfter2 = await prisma.kanbanCard.findUnique({ where: { id: card.id as string } });
  chk("PA-2.3", "ยืนยันชั้นสอง (confirm2x) → ลบจริง (archivedAt set)", second?.ok === true && cardAfter2?.archivedAt != null);

  // NORMAL ยังทำได้ชั้นเดียว (regression กันพัง)
  const np = await props.createProposal(ctx, { conversationId: conv.id, kind: "inventory_create_item", summary: "สร้างสินค้า", payload: { sku: "PA-1", name: "ของ" } });
  const nrow = await prisma.aiProposal.findUnique({ where: { id: np.id as string } });
  const nex = await props.executeProposal(OWNER, { tenantId: tid, systemId: inv.id } as any, np.id);
  chk("PA-2.4", "NORMAL risk + ทำชั้นเดียวได้ทันที (ไม่ต้อง 2 ชั้น)", (nrow as { risk?: string })?.risk === "NORMAL" && nex?.ok === true);

  // void_sale tool มีอยู่ (destructive action)
  chk("PA-2.5", "tool void_sale ลงทะเบียน (ยกเลิกบิล — destructive)", tools.toolRegistry().some((x) => x.def.name === "void_sale"), "MAJOR");

  // [3] validate-explain: inventory_adjust ติดลบ → error+suggestion ไม่สร้าง proposal
  const item = await (await import("@/lib/modules/inventory/service")).createItem({ tenantId: tid, systemId: inv.id } as never, { sku: "PA-ADJ", name: "ปรับ" } as never);
  const before = await prisma.aiProposal.count({ where: { tenantId: tid } });
  const out = await tools.runTool({ tenantId: tid, conversationId: conv.id }, "inventory_adjust", { sku: "PA-ADJ", newQty: -5 });
  const after = await prisma.aiProposal.count({ where: { tenantId: tid } });
  let parsed: any = {}; try { parsed = JSON.parse(out); } catch {}
  chk("PA-3.1", "ปรับสต็อกติดลบ → คืน error (มี suggestion) + ไม่สร้าง proposal", !!parsed.error && after === before, "MAJOR");
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiMessage", "aiConversation", "kanbanCard", "kanbanColumn", "kanbanBoard", "invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Phase A =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
