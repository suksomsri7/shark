// AI Eval (self-improving item 1) — ชุด "ข้อสอบ" วัดว่าผู้ช่วย AI เลือกเครื่องมือ (tool) ถูกไหม
//
// ทำไมต้องมี: ความฉลาดของ AI = เลือก tool ให้ตรงเจตนาผู้ใช้ (ถามยอดขาย→ดูยอดขาย, สั่งเปิดบิล→เปิดบิล)
// ไฟล์นี้เป็น oracle เดินจริงในเครื่อง ไม่แตะ DB ไม่ยิง LLM:
//   - GOLDEN_CASES: โจทย์จริง + เครื่องมือที่ "ควร" เลือก (expectTool = ชื่อ tool จริงใน toolRegistry)
//   - runEval(deps): ฉีด pickTool ได้ (mock LLM หรือ heuristic) → นับคะแนน passed/total
//   - evalToolFromRegistry: baseline heuristic เดิน keyword-rules จริง (ผูกกับ toolRegistry — คืนเฉพาะชื่อ tool ที่มีจริง)
//   - scoreEvalWithHeuristic: รันข้อสอบด้วย baseline heuristic (ให้ Fable/คนดูคะแนนตั้งต้นได้)
//
// หมายเหตุ: import toolRegistry ได้ (อ่านอย่างเดียว ไม่ query DB) — heuristic กรองผลผ่านชุดชื่อ tool จริง
//           จึงเป็นไปไม่ได้ที่จะคืนชื่อเครื่องมือที่ไม่มีอยู่

import { toolRegistry } from "./tools";

export type GoldenCase = { prompt: string; expectTool: string };

// ── ข้อสอบทองคำ (20 เคสจริง) — ครอบทั้งอ่าน (read) และทำแทน (action) หลายโดเมน ──
// ทุก expectTool = ชื่อ tool จริงใน toolRegistry() (ตรวจได้ด้วย assertGoldenCasesValid)
export const GOLDEN_CASES: GoldenCase[] = [
  // อ่านข้อมูล (read)
  { prompt: "วันนี้ขายได้เท่าไหร่", expectTool: "sales_summary" },
  { prompt: "ขอสรุปยอดขาย 7 วันล่าสุดหน่อย", expectTool: "sales_summary" },
  { prompt: "สินค้าอะไรใกล้หมดบ้าง ต้องเติมสต็อก", expectTool: "low_stock" },
  { prompt: "ช่วยหาลูกค้าชื่อสมชายให้หน่อย", expectTool: "customer_search" },
  { prompt: "ตอนนี้ร้านมีสมาชิกกี่คน", expectTool: "member_count" },
  { prompt: "มีใบลาไหนของพนักงานรออนุมัติอยู่บ้าง", expectTool: "pending_leaves" },
  { prompt: "ค้นหาในคลังความรู้เรื่องนโยบายการคืนสินค้า", expectTool: "kb_search" },
  // ทำงานแทน (action / เสนอ)
  { prompt: "เพิ่มสินค้าใหม่ชื่อกาแฟคั่วเข้ม รหัส C-01", expectTool: "inventory_create_item" },
  { prompt: "รับสินค้าเข้าคลัง รหัส C-01 จำนวน 10 ชิ้น", expectTool: "inventory_receive" },
  { prompt: "เปิดบิลขายกาแฟ 2 แก้ว จ่ายเงินสด", expectTool: "pos_create_sale" },
  { prompt: "ยกเลิกบิลขายเลขที่ SL-0001 ให้หน่อย", expectTool: "void_sale" },
  { prompt: "จองห้องดีลักซ์ให้คุณสมหญิง เช็คอินพรุ่งนี้", expectTool: "hotel_create_reservation" },
  { prompt: "จองนัดตัดผมให้ลูกค้าพรุ่งนี้ 10 โมง", expectTool: "booking_create_appointment" },
  { prompt: "ออกบัตรคิวให้ลูกค้าที่เพิ่งมาถึง", expectTool: "queue_issue_ticket" },
  { prompt: "อนุมัติคำขอที่รออยู่ในสายอนุมัติให้หน่อย", expectTool: "approval_decide" },
  { prompt: "บันทึกค่าใช้จ่ายค่าไฟเดือนนี้ 500 บาท", expectTool: "record_expense" },
  { prompt: "เปิดระบบการตลาดให้ร้านหน่อย", expectTool: "open_system" },
  { prompt: "จำไว้นะว่าร้านเปิด 9 โมงเช้าทุกวัน", expectTool: "remember_fact" },
  { prompt: "ทุกเย็นหกโมงช่วยสรุปยอดขายส่งให้หน่อย", expectTool: "schedule_task" },
  { prompt: "ช่วยตั้งสต็อกกาแฟใหม่ทั้งหมด ตั้งแต่เพิ่มสินค้าจนรับของเข้าคลัง", expectTool: "propose_plan" },
];

// ── heuristic keyword rules (เรียงตามลำดับความจำเพาะ — คืน tool ตัวแรกที่ match) ──
// เจตนา: เคสจำเพาะ/หลายขั้น/ตั้งเวลา มาก่อน, action มาก่อน read ในโดเมนเดียวกัน, กันคำซ้อน (เช่น "รออนุมัติ" กับ "อนุมัติ")
const KEYWORD_RULES: { re: RegExp; tool: string }[] = [
  // งานหลายขั้น — จับก่อนเพราะประโยคมักมีคำ action ปนอยู่
  { re: /หลายขั้น|เป็นขั้นตอน|ตั้งแต่.*(จน|ถึง)|ทั้งหมดตั้งแต่|วางแผน|แผนงาน/, tool: "propose_plan" },
  // ความจำถาวร — ต้องมาก่อน schedule_task (ประโยค "จำไว้...ทุกวัน" มีคำ "ทุกวัน" ปน)
  { re: /จำไว้|จดจำ|จำว่า|จดไว้|จดว่า|ช่วยจำ/, tool: "remember_fact" },
  { re: /ลืม(ความจำ|เรื่อง)?ที่จำ|ลบความจำ/, tool: "forget_fact" },
  { re: /จำอะไรไว้บ้าง|ความจำที่จดไว้|ดูความจำ/, tool: "list_memories" },
  // ตั้งเวลา/งานประจำ
  { re: /ทุก ?(วัน|เย็น|เช้า|คืน|สัปดาห์|เดือน)|ทุก ?\d|เป็นประจำ|ประจำทุก|ตั้งเวลา|ตั้งงานประจำ/, tool: "schedule_task" },
  // action — บิล/ยกเลิก
  { re: /ยกเลิก.*บิล|void|โมฆะบิล/, tool: "void_sale" },
  { re: /เปิดบิล|ออกบิล|เปิดการขาย|คิดเงิน.*แก้ว/, tool: "pos_create_sale" },
  // action — จอง
  { re: /จองห้อง|ห้องพัก|เช็คอิน|เช็กอิน|reservation/, tool: "hotel_create_reservation" },
  { re: /จองนัด|นัดหมาย|นัดตัดผม|จองบริการ|นัดคิว/, tool: "booking_create_appointment" },
  { re: /บัตรคิว|ออกคิว|ออกบัตร|แจกคิว/, tool: "queue_issue_ticket" },
  { re: /จองเช่า|เช่าของ|ให้เช่า.*ลูกค้า/, tool: "rental_create_booking" },
  // read — ใบลา (ต้องมาก่อน approval เพราะมีคำ "อนุมัติ" ปน)
  { re: /ใบลา|ขอลา|ลาป่วย|ลากิจ|วันลา/, tool: "pending_leaves" },
  // action — อนุมัติ/ปฏิเสธ
  { re: /อนุมัติ|ปฏิเสธคำขอ|สายอนุมัติ/, tool: "approval_decide" },
  // action — คลังสินค้า
  { re: /เพิ่มสินค้า|สินค้าใหม่|สร้างสินค้า|ลงสินค้าใหม่/, tool: "inventory_create_item" },
  { re: /รับ(สินค้า|ของ|สต็อก)?เข้า|รับเข้าคลัง|รับของเข้า|รับสต็อกเข้า/, tool: "inventory_receive" },
  { re: /ตัด(สินค้า|สต็อก|ของ)ออก|เบิกใช้|เบิกของ|ของเสีย/, tool: "inventory_consume" },
  { re: /ปรับ(ยอด|สต็อก)|นับสต็อก.*ปรับ|ยอดคงเหลือใหม่/, tool: "inventory_adjust" },
  // action — อื่น ๆ
  { re: /ค่าใช้จ่าย|ค่าไฟ|ค่าน้ำ|ค่าเช่า|บันทึกค่า|รายจ่าย|ใบเสร็จค่า/, tool: "record_expense" },
  { re: /เปิดระบบ|เปิดใช้ระบบ|เปิดใช้งานระบบ/, tool: "open_system" },
  { re: /(เพิ่ม|สร้าง|ลง)(ลูกค้า|สมาชิก)ใหม่|สมัครสมาชิก/, tool: "member_create" },
  { re: /(เพิ่ม|สร้าง|จ้าง)พนักงาน/, tool: "hr_create_employee" },
  { re: /คูปอง|โค้ดส่วนลด/, tool: "coupon_create" },
  { re: /แคมเปญ|ยิงโฆษณา|ส่งโปรโมชั่น/, tool: "marketing_create_campaign" },
  // read — สต็อก/ลูกค้า/ยอดขาย/ความรู้
  { re: /ใกล้หมด|ของใกล้หมด|สต็อก(ต่ำ|เหลือน้อย|จะหมด)|ต้องเติม/, tool: "low_stock" },
  { re: /หาลูกค้า|ค้นลูกค้า|ค้นหาลูกค้า|ลูกค้าชื่อ|เบอร์ลูกค้า/, tool: "customer_search" },
  { re: /กี่คน|จำนวนสมาชิก|มีสมาชิก|นับสมาชิก/, tool: "member_count" },
  { re: /คลังความรู้|ค้นความรู้|faq|นโยบาย|วิธี(การ|ใช้)/, tool: "kb_search" },
  { re: /ยอดขายราย ?วัน|ขายแต่ละวัน|เทียบราย ?วัน/, tool: "sales_by_day" },
  { re: /ยอดขาย|ขายได้|ขายดี|รายได้|ยอดวันนี้/, tool: "sales_summary" },
  { re: /นัดวันนี้|นัดหมายวันนี้/, tool: "today_appointments" },
  { re: /คิวที่รอ|กำลังรอคิว|รอเรียกคิว/, tool: "queue_waiting" },
  { re: /ระบบอะไรบ้าง|เปิดระบบไหน|รายชื่อระบบ/, tool: "list_systems" },
];

/**
 * baseline heuristic เดินจริง (ไม่ยิง LLM): จับ keyword → ชื่อ tool
 * ผูกกับ toolRegistry จริง — ถ้า match ได้ tool ที่ไม่มีในทะเบียน (ไม่ควรเกิด) จะคืน null
 */
export function evalToolFromRegistry(prompt: string): string | null {
  if (!prompt || typeof prompt !== "string") return null;
  const names = new Set(toolRegistry().map((t) => t.def.name));
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(prompt)) return names.has(rule.tool) ? rule.tool : null;
  }
  return null;
}

export type EvalCaseResult = { prompt: string; expect: string; got: string | null; ok: boolean };
export type EvalResult = { total: number; passed: number; byCase: EvalCaseResult[] };

/** วนทุก GOLDEN_CASES เรียก deps.pickTool(prompt) เทียบกับ expectTool */
export function runEval(deps: { pickTool: (prompt: string) => string | null }): EvalResult {
  const byCase: EvalCaseResult[] = GOLDEN_CASES.map((c) => {
    const got = deps.pickTool(c.prompt);
    return { prompt: c.prompt, expect: c.expectTool, got, ok: got === c.expectTool };
  });
  return { total: byCase.length, passed: byCase.filter((b) => b.ok).length, byCase };
}

/** คะแนน baseline heuristic (Fable/คนดูคะแนนตั้งต้นได้) */
export function scoreEvalWithHeuristic(): EvalResult {
  return runEval({ pickTool: evalToolFromRegistry });
}

/** ตรวจว่า expectTool ทุกเคสเป็นชื่อ tool จริงในทะเบียน (ใช้ตอน debug/QC เสริม) */
export function assertGoldenCasesValid(): { ok: boolean; unknown: string[] } {
  const names = new Set(toolRegistry().map((t) => t.def.name));
  const unknown = [...new Set(GOLDEN_CASES.map((c) => c.expectTool).filter((n) => !names.has(n)))];
  return { ok: unknown.length === 0, unknown };
}
