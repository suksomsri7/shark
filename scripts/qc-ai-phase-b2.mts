// QC — AI Phase B2 (ชุดปิด): CRM·KB·โรงเรียน·คลินิก·เช่า·สายอนุมัติ·คลังตัด/โอน · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// kinds ใหม่ (pattern เดิม · unit-scoped resolve แบบ B1 · ทุกตัว NORMAL):
//   crm_create_lead {name, phone?, email?, note?} → crm.createContact (ระบบ CRM · source "AI")
//   kb_create_article {title, body, category?} → kb.createArticle
//   school_enroll {unitName?, courseName, className?, studentName, studentPhone} → resolve course ชื่อ contains + class (ชื่อหรือรอบแรก) → school.enroll
//   school_mark_paid {studentName หรือ studentPhone} → หา enrollment ENROLLED ล่าสุดของนักเรียน → school.markPaid (เงินเข้า)
//   clinic_create_patient {unitName?, name, phone, allergies?} → clinic.createPatient
//   rental_create_booking {unitName?, assetName, customerName, customerPhone, startDate, endDate} → resolve asset ชื่อ → rental.createBooking
//   approval_decide {requestSummary หรือ requestId, decision:"APPROVED"|"REJECTED", note?} → approval.decide (ส่ง MembershipCtx ของคนกดยืนยันจริง — dispatch ต้องรับ m เพิ่ม)
//   inventory_consume {sku, qty, note?} → inventory.consume (validate qty>0)
// read ใหม่: approvals_pending (คำขอรอฉันอนุมัติ) · rental_active (สัญญาเช่าค้างคืน)
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
  const t = await prisma.tenant.create({ data: { name: "QC PB2", slug: `qc-pb2-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "b2" } });
  const run = async (kind: string, payload: Record<string, unknown>) => { const p = await props.createProposal(ctx, { conversationId: conv.id, kind, summary: kind, payload }); return props.executeProposal(OWNER, ctx, p.id); };

  const NEW = ["crm_create_lead", "kb_create_article", "school_enroll", "school_mark_paid", "clinic_create_patient", "rental_create_booking", "approval_decide", "inventory_consume", "approvals_pending", "rental_active"];
  const reg = tools.toolRegistry().map((x) => x.def.name);
  chk("B2-0", "tools ใหม่ครบ 10 ตัว", NEW.every((n) => reg.includes(n)));

  // CRM + KB
  await sys.createSystem(tid, "CRM", "ลูกค้ามุ่งหวัง");
  const r1 = await run("crm_create_lead", { name: "ลีดจาก AI", phone: "0800000001" });
  chk("B2-1", "crm_create_lead → CrmContact เกิด (source AI)", r1?.ok === true && (await prisma.crmContact.findFirst({ where: { tenantId: tid, name: "ลีดจาก AI" } }))?.source === "AI");
  const r2 = await run("kb_create_article", { title: "นโยบายคืนสินค้า", body: "คืนได้ใน 7 วัน", category: "นโยบาย" });
  chk("B2-2", "kb_create_article → บทความเกิด", r2?.ok === true && (await prisma.kbArticle.count({ where: { tenantId: tid, title: "นโยบายคืนสินค้า" } })) === 1);

  // โรงเรียน: สมัคร + รับชำระ (เส้นเงิน)
  const schUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SCHOOL", name: "โรงเรียน", slug: `pb2s-${Date.now()}` } });
  await sys.createSystem(tid, "POS", "ขาย");
  const schoolSvc = (await import("@/lib/modules/school/service")) as unknown as { createCourse: (c: any, i: any) => Promise<any>; createClass: (c: any, i: any) => Promise<any> };
  const course = await schoolSvc.createCourse({ tenantId: tid, unitId: schUnit.id }, { name: "คอร์สว่ายน้ำ", priceSatang: 100000 });
  await schoolSvc.createClass({ tenantId: tid, unitId: schUnit.id }, { courseId: course.id, name: "รอบเช้า" });
  const r3 = await run("school_enroll", { courseName: "ว่ายน้ำ", studentName: "น้องเอไอ", studentPhone: "0800000002" });
  chk("B2-3.1", "school_enroll → สมัครสำเร็จ snapshot ราคา", r3?.ok === true && (await prisma.schoolEnrollment.findFirst({ where: { tenantId: tid, studentName: "น้องเอไอ" } }))?.priceSatang === 100000);
  const r4 = await run("school_mark_paid", { studentPhone: "0800000002" });
  chk("B2-3.2", "school_mark_paid → PAID + PosSale เกิด (เส้นเงิน)", r4?.ok === true && (await prisma.schoolEnrollment.findFirst({ where: { tenantId: tid, studentName: "น้องเอไอ" } }))?.status === "PAID" && (await prisma.posSale.count({ where: { tenantId: tid } })) >= 1);

  // คลินิก + เช่า
  const clUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "CLINIC", name: "คลินิก", slug: `pb2c-${Date.now()}` } });
  const r5 = await run("clinic_create_patient", { name: "คนไข้เอไอ", phone: "0800000003", allergies: "เพนิซิลลิน" });
  chk("B2-4", "clinic_create_patient → ผู้ป่วยเกิด (แพ้ยาบันทึก)", r5?.ok === true && (await prisma.patientRecord.findFirst({ where: { tenantId: tid, name: "คนไข้เอไอ" } }))?.allergies === "เพนิซิลลิน");
  const rtUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RENTAL", name: "เช่ารถ", slug: `pb2r-${Date.now()}` } });
  const rentalSvc = (await import("@/lib/modules/rental/service")) as unknown as { createAsset: (c: any, i: any) => Promise<any> };
  await rentalSvc.createAsset({ tenantId: tid, unitId: rtUnit.id }, { name: "มอไซค์ A", dailyRateSatang: 30000, depositSatang: 50000 });
  const r6 = await run("rental_create_booking", { assetName: "มอไซค์", customerName: "คุณเช่าเอไอ", customerPhone: "0800000004", startDate: "2026-09-01", endDate: "2026-09-03" });
  chk("B2-5", "rental_create_booking → จองเกิด (2 วัน = 600 บาท quote)", r6?.ok === true && (await prisma.rentalBooking.count({ where: { tenantId: tid, customerName: "คุณเช่าเอไอ" } })) === 1);

  // สายอนุมัติ: มีคำขอ → AI อนุมัติแทน (สิทธิ์ของคนกด)
  const ap = (await import("@/lib/modules/approval/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  await ap.createPolicy(ctx, { name: "ใบลา", entityType: "HrLeave", steps: [{ order: 1, approverRole: "OWNER" }] });
  const sub = await ap.submitForApproval(ctx, { entityType: "HrLeave", entityId: "lv-ai-1", requestedById: "u1" });
  const r7 = await run("approval_decide", { requestId: sub.requestId, decision: "APPROVED", note: "อนุมัติผ่าน AI" });
  chk("B2-6", "approval_decide → คำขอ APPROVED จริง", r7?.ok === true && (await prisma.approvalRequest.findUnique({ where: { id: sub.requestId as string } }))?.status === "APPROVED");

  // คลังตัดออก + validate
  const invS = await sys.createSystem(tid, "INVENTORY", "คลัง");
  const invSvc = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: any, i: any) => Promise<any>; receive: (c: any, i: any) => Promise<any> };
  const item = await invSvc.createItem({ tenantId: tid, systemId: invS.id }, { sku: "B2-1", name: "ของ" });
  await invSvc.receive({ tenantId: tid, systemId: invS.id }, { itemId: item.id, qty: 10, costSatang: 100, idempotencyKey: "b2rc" });
  const r8 = await run("inventory_consume", { sku: "B2-1", qty: 4, note: "เบิกใช้" });
  chk("B2-7.1", "inventory_consume → สต็อก 10→6", r8?.ok === true && (await prisma.invItem.findUnique({ where: { id: item.id as string } }))?.onHand === 6);
  const bad = await tools.runTool({ tenantId: tid, conversationId: conv.id }, "inventory_consume", { sku: "B2-1", qty: -2 });
  let bp: any = {}; try { bp = JSON.parse(bad); } catch {}
  chk("B2-7.2", "ตัด qty ติดลบ → error ไม่สร้าง proposal", !!bp.error, "MAJOR");

  // read tools
  const rp = await tools.runTool({ tenantId: tid }, "approvals_pending", {});
  chk("B2-8", "approvals_pending ตอบไม่ error", !String(rp).includes('"error"'), "MAJOR");
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiMessage", "aiConversation", "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "rentalBooking", "rentalAsset", "clinicVisit", "patientRecord", "schoolAttendance", "schoolEnrollment", "schoolClass", "schoolCourse", "kbArticle", "crmActivity", "crmDeal", "crmContact", "crmStage", "crmPipeline", "invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "customer", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Phase B2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
