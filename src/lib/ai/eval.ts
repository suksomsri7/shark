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

// ── ข้อสอบทองคำ (โจทย์จริง) — ครอบทั้งอ่าน (read) และทำแทน (action) หลายโดเมน รวมสกิลบัญชี ──
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
  // Wave5-A read tools ใหม่ (≥2 เคส/tool)
  { prompt: "วันนี้ร้านอาหารขายไปเท่าไหร่", expectTool: "restaurant_today" },
  { prompt: "ตอนนี้มีโต๊ะเปิดอยู่กี่โต๊ะ", expectTool: "restaurant_today" },
  { prompt: "ขายตั๋วงานอีเวนต์ไปเท่าไหร่แล้ว", expectTool: "ticket_event_sales" },
  { prompt: "งานอีเวนต์นี้ขายบัตรไปกี่ใบ", expectTool: "ticket_event_sales" },
  { prompt: "เดือนนี้กำไรเท่าไหร่", expectTool: "financial_summary" },
  { prompt: "สรุปรายรับรายจ่ายเดือนนี้หน่อย", expectTool: "financial_summary" },
  { prompt: "มีลูกค้ามุ่งหวังใหม่ล่าสุดไหม", expectTool: "recent_leads" },
  { prompt: "ใครกรอกฟอร์มติดต่อเข้ามาบ้าง", expectTool: "recent_leads" },
  { prompt: "ลูกค้าสมชายมีแต้มเท่าไหร่", expectTool: "customer_points" },
  { prompt: "เช็คแต้มสะสมของลูกค้าเบอร์นี้หน่อย", expectTool: "customer_points" },
  { prompt: "สัปดาห์นี้มีนัดหรือเข้าพักอะไรบ้าง", expectTool: "upcoming_schedule" },
  { prompt: "มีตารางนัดที่กำลังจะถึงไหม", expectTool: "upcoming_schedule" },
  // ── สกิลบัญชี (WO E2) — ภาษาที่เจ้าของร้าน/ผู้ทำบัญชีพูดจริง ──
  { prompt: "ตอนนี้ลูกหนี้ค้างรับรวมเท่าไหร่", expectTool: "account_dashboard" },
  { prompt: "สรุปภาพรวมบัญชีเดือนนี้ให้หน่อย", expectTool: "account_dashboard" },
  { prompt: "ขอรายการใบแจ้งหนี้ที่ยังไม่ได้จ่ายทั้งหมด", expectTool: "account_list_documents" },
  { prompt: "ดูใบเสร็จทั้งหมดของเดือนที่แล้ว", expectTool: "account_list_documents" },
  { prompt: "ขอดูรายละเอียดเอกสารเลขที่ IV-2026-09-0001", expectTool: "account_get_document" },
  { prompt: "ของบกำไรขาดทุนเดือนนี้", expectTool: "account_report" },
  { prompt: "ขอรายงานภาษีขาย ภ.พ.30 ของเดือนสิงหาคม", expectTool: "account_report" },
  { prompt: "ขอรายงานอายุหนี้ลูกหนี้ที่ค้างชำระเกินกำหนด", expectTool: "account_report" },
  { prompt: "ออกใบเสนอราคาให้บริษัทสยามไดฟ์ ค่าบริการ 10,000 บาท", expectTool: "account_create_document" },
  { prompt: "เปิดใบแจ้งหนี้ค่าบริการรายเดือนให้ลูกค้ารายนี้", expectTool: "account_create_document" },
  { prompt: "ยืนยันออกใบแจ้งหนี้ฉบับร่างให้ลูกค้าเลย", expectTool: "account_issue_document" },
  { prompt: "บันทึกรับชำระใบแจ้งหนี้ 10,700 บาท เข้าบัญชีธนาคาร", expectTool: "account_record_payment" },
  { prompt: "ลูกค้าโอนเงินมาแล้ว ตัดชำระใบแจ้งหนี้ให้หน่อย", expectTool: "account_record_payment" },
  { prompt: "ยกเลิกใบแจ้งหนี้ใบนี้เพราะลูกค้าสั่งผิด", expectTool: "account_void_document" },
  { prompt: "เพิ่มผู้ติดต่อใหม่ บริษัท สยามไดฟ์ จำกัด เป็นลูกค้า", expectTool: "account_create_contact" },
  { prompt: "ค้นหาผู้ติดต่อในสมุดบัญชีชื่อสยามไดฟ์", expectTool: "account_search_contacts" },
  { prompt: "ตอนนี้เงินในบัญชีธนาคารกับเงินสดในมือเหลือเท่าไหร่", expectTool: "account_finance_balances" },
  // ── CAL1.7 ปฏิทินส่วนตัว (เคสบวกที่ระบุเครื่องมือได้ — ชุดเต็มรวมเคสห้ามสร้าง/ถามกลับอยู่ใน CALENDAR_EVAL_CASES) ──
  { prompt: "เตือนพรุ่งนี้บ่ายสามโทรหาคุณเอก เรื่องมัดจำเรือ", expectTool: "calendar_add" },
  { prompt: "ทุกวันจันทร์ 9 โมงเตือนเช็กสต็อกอุปกรณ์", expectTool: "calendar_add" },
  { prompt: "อีกครึ่งชั่วโมงเตือนฉันโอนเงินค่าน้ำมันเรือ", expectTool: "calendar_add" },
  { prompt: "เตือนฉันจ่ายค่าเช่าท่าเรือวันที่ 5 ทุกเดือน 10 โมง", expectTool: "calendar_add" },
  { prompt: "เตือนฉันให้โทรหาครูนิวพรุ่งนี้ 10 โมง", expectTool: "calendar_add" },
  { prompt: "พรุ่งนี้ฉันมีนัดอะไรบ้าง", expectTool: "calendar_agenda" },
];

/**
 * CAL1.7 ▸ ข้อสอบปฏิทินส่วนตัว (สัญญา 32 §9.2 · §9.4 · เกณฑ์ ≥ 20 ประโยค ผ่าน ≥ 95%)
 *   expect: ชื่อเครื่องมือที่ต้องเรียก · "none" = ห้ามเรียก calendar_add และต้องเสนอการ์ดบอร์ดแทน (M3) ·
 *           "clarify" = ห้ามสร้าง ต้องถามกลับ (ask_clarify หรือคำถามเป็นข้อความ)
 *   want: ค่าที่ต้องได้ใน args ของ calendar_add — วันนับจากวันนี้ (เวลาไทย) · เวลา HH:MM · ทำซ้ำ · นาทีจากตอนนี้
 *   ผู้ตรวจ (scripts/qc-cal-1.7-live.mts) ยิงโมเดลจริงตาม routing ของผลิตภัณฑ์ · scripts/qc-cal-1.7.mts ตรวจโครงสร้างชุดนี้
 */
export type CalendarEvalCase = {
  prompt: string;
  expect: "calendar_add" | "calendar_agenda" | "schedule_task" | "none" | "clarify";
  want?: {
    kind?: "REMINDER" | "EVENT";
    day?: number | "nextMonday" | "nextFriday";
    time?: string;
    repeat?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
    repeatDays?: number[];
    monthDay?: number;
    inMinutes?: number;
    endTime?: string;
    /** ยอมรับทั้ง "เตือนก่อน N นาที" (leadMinutes) หรือเลื่อนเวลาเอง */
    leadOrShift?: number;
  };
  /** ยอมรับผลอื่นด้วย (เช่น "ทุกวันที่ 31" — ถามกลับ หรือสร้างพร้อมบอกเรื่องเดือนสั้น) */
  alsoOk?: CalendarEvalCase["expect"][];
  why: string;
};
export const CALENDAR_EVAL_CASES: CalendarEvalCase[] = [
  { prompt: "เตือนพรุ่งนี้บ่ายสามโทรหาคุณเอก เรื่องมัดจำเรือ", expect: "calendar_add", want: { day: 1, time: "15:00", repeat: "NONE" }, why: "จอ 5 · พรุ่งนี้บ่ายสาม" },
  { prompt: "ทุกวันจันทร์ 9 โมงเตือนเช็กสต็อกอุปกรณ์", expect: "calendar_add", want: { day: "nextMonday", time: "09:00", repeat: "WEEKLY", repeatDays: [1] }, why: "จอ 5 · ทุกวันจันทร์ 9 โมง (ร่างรอยืนยัน)" },
  { prompt: "อีกครึ่งชั่วโมงเตือนฉันโอนเงินค่าน้ำมันเรือ", expect: "calendar_add", want: { inMinutes: 30 }, why: "อีกครึ่งชั่วโมง" },
  { prompt: "เตือนฉันจ่ายค่าเช่าท่าเรือวันที่ 5 ทุกเดือน 10 โมง", expect: "calendar_add", want: { time: "10:00", repeat: "MONTHLY", monthDay: 5 }, why: "วันที่ 5 ทุกเดือน" },
  { prompt: "เตือนฉันให้โทรหาครูนิวพรุ่งนี้ 10 โมง", expect: "calendar_add", want: { day: 1, time: "10:00" }, why: "§9.4 ผู้รับคือฉัน = สร้าง" },
  { prompt: "เตือนครูนิวให้เช็กถังด้วย", expect: "none", why: "§9.4 M3 ปฏิเสธ + เสนอการ์ด" },
  { prompt: "บอกทุกคนว่าพรุ่งนี้ประชุม 9 โมง", expect: "none", why: "§9.4 M3 ทุกคน" },
  { prompt: "ช่วยเตือนทีมช่างให้ล้างเรือพรุ่งนี้เช้าด้วย", expect: "none", why: "M3 ทีม" },
  { prompt: "ตั้งเตือนให้ครูบอสไปรับลูกค้าที่สนามบินพรุ่งนี้บ่ายโมง", expect: "none", why: "M3 ใส่ชื่อคนอื่น" },
  { prompt: "เตือนโทรหาคุณเอก", expect: "clarify", why: "§9.2 ไม่มีเวลา" },
  { prompt: "ต้นเดือนหน้าเตือนต่อภาษีรถด้วย", expect: "clarify", why: "§9.2 ต้นเดือน กำกวม" },
  { prompt: "ช่วงบ่ายๆ เตือนฉันเก็บเงินมัดจำลูกค้าด้วย", expect: "clarify", why: "§9.2 ช่วงบ่าย กำกวม" },
  { prompt: "ทุกเย็นหกโมงช่วยสรุปยอดขายส่งให้หน่อย", expect: "schedule_task", why: "งานประจำของเลขา ไม่ใช่เตือน" },
  { prompt: "ทุกเช้าแปดโมงช่วยสรุปงานค้างในบอร์ดให้ที", expect: "schedule_task", why: "งานประจำของเลขา" },
  { prompt: "พรุ่งนี้ฉันมีนัดอะไรบ้าง", expect: "calendar_agenda", why: "อ่าน agenda" },
  { prompt: "วันนี้ฉันมีอะไรต้องทำบ้าง", expect: "calendar_agenda", why: "อ่าน agenda" },
  { prompt: "คืนนี้เตือนเช็กพยากรณ์อากาศก่อนออกเรือ", expect: "calendar_add", want: { day: 0, time: "20:00" }, why: "คืนนี้ = 20:00" },
  { prompt: "นัดทำฟันวันศุกร์นี้บ่ายสองถึงบ่ายสาม", expect: "calendar_add", want: { kind: "EVENT", day: "nextFriday", time: "14:00", endTime: "15:00" }, why: "นัดส่วนตัวมีช่วงเวลา" },
  { prompt: "เตือนฉันทุกวันตอน 7 โมงเช้าให้เช็กลมยาง", expect: "calendar_add", want: { time: "07:00", repeat: "DAILY" }, why: "ทุกวัน" },
  { prompt: "อีก 2 ชั่วโมงเตือนฉันโทรกลับลูกค้า", expect: "calendar_add", want: { inMinutes: 120 }, why: "อีก 2 ชั่วโมง" },
  { prompt: "เตือนฉันทุกวันที่ 31 ตอน 5 โมงเย็นให้ปิดยอดบัญชี", expect: "calendar_add", want: { time: "17:00", repeat: "MONTHLY", monthDay: 31 }, alsoOk: ["clarify"], why: "§9.2 ทุกวันที่ 31 (บอกเรื่องเดือนสั้น)" },
  { prompt: "พรุ่งนี้ 10 โมงมีนัดกับธนาคาร เตือนก่อนครึ่งชั่วโมงด้วย", expect: "calendar_add", want: { day: 1, time: "10:00", leadOrShift: 30 }, why: "เตือนล่วงหน้า" },
];

// ── heuristic keyword rules (เรียงตามลำดับความจำเพาะ — คืน tool ตัวแรกที่ match) ──
// เจตนา: เคสจำเพาะ/หลายขั้น/ตั้งเวลา มาก่อน, action มาก่อน read ในโดเมนเดียวกัน, กันคำซ้อน (เช่น "รออนุมัติ" กับ "อนุมัติ")
const KEYWORD_RULES: { re: RegExp; tool: string }[] = [
  // งานหลายขั้น — จับก่อนเพราะประโยคมักมีคำ action ปนอยู่
  { re: /หลายขั้น|เป็นขั้นตอน|ตั้งแต่.*(จน|ถึง)|ทั้งหมดตั้งแต่|วางแผน|แผนงาน/, tool: "propose_plan" },
  // CAL1.7 ▸ ปฏิทินส่วนตัว — ก่อน schedule_task ("ทุกวันจันทร์ … เตือน" = เตือนผู้ใช้ ไม่ใช่งานประจำของเลขา) ◂
  { re: /(?<!แจ้ง)เตือน|นัดส่วนตัว|นัดทำฟัน/, tool: "calendar_add" },
  { re: /(วันนี้|พรุ่งนี้)ฉันมี|ปฏิทินของฉัน|ตารางของฉัน/, tool: "calendar_agenda" },
  // ความจำถาวร — ต้องมาก่อน schedule_task (ประโยค "จำไว้...ทุกวัน" มีคำ "ทุกวัน" ปน)
  { re: /จำไว้|จดจำ|จำว่า|จดไว้|จดว่า|ช่วยจำ/, tool: "remember_fact" },
  { re: /ลืม(ความจำ|เรื่อง)?ที่จำ|ลบความจำ/, tool: "forget_fact" },
  { re: /จำอะไรไว้บ้าง|ความจำที่จดไว้|ดูความจำ/, tool: "list_memories" },
  // ตั้งเวลา/งานประจำ
  { re: /ทุก ?(วัน|เย็น|เช้า|คืน|สัปดาห์|เดือน)|ทุก ?\d|เป็นประจำ|ประจำทุก|ตั้งเวลา|ตั้งงานประจำ/, tool: "schedule_task" },
  // ── สกิลบัญชี (WO E2) — วางก่อนกฎเดิมทั้งหมดที่ใช้คำเงิน ๆ ทอง ๆ กว้าง ๆ ──
  //    ("กำไร"/"รายจ่าย"/"ยอดขาย"/"ยกเลิก...บิล"/"เพิ่มลูกค้าใหม่" ของกฎเดิมจะแย่งประโยคบัญชีไปหมด)
  //    ภายในบล็อกเรียงจาก "จำเพาะที่สุด" ลงไป: ยกเลิก → ออกตัวจริง → สร้าง → รับชำระ → ดูใบเดียว → รายงาน → รายการ → ภาพรวม
  { re: /ยกเลิก(ใบ(แจ้งหนี้|เสร็จ|กำกับภาษี|เสนอราคา|วางบิล)|เอกสาร)/, tool: "account_void_document" },
  { re: /ยืนยันออกใบ|ออกใบ.*ฉบับร่าง|ฉบับร่าง.*เป็นตัวจริง|ออกเอกสารตัวจริง/, tool: "account_issue_document" },
  { re: /(ออก|เปิด|สร้าง|ทำ)ใบ(เสนอราคา|แจ้งหนี้|กำกับภาษี|วางบิล|ลดหนี้|เพิ่มหนี้|เสร็จรับเงิน)/, tool: "account_create_document" },
  { re: /(รับ|ตัด)ชำระ|บันทึกการชำระ|ลงรับเงินใบ/, tool: "account_record_payment" },
  { re: /(เพิ่ม|สร้าง|บันทึก)(ผู้ติดต่อ|ผู้ขาย|ซัพพลายเออร์|คู่ค้า|เจ้าหนี้)/, tool: "account_create_contact" },
  { re: /(ค้นหา|ค้น|หา)(ผู้ติดต่อ|คู่ค้า|ซัพพลายเออร์|ผู้ขาย)|ผู้ติดต่อ(ชื่อ|ในสมุดบัญชี)/, tool: "account_search_contacts" },
  { re: /(เอกสาร|ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับภาษี|ใบเสนอราคา)เลขที่|รายละเอียดเอกสาร/, tool: "account_get_document" },
  { re: /งบกำไรขาดทุน|งบดุล|งบทดลอง|งบกระแสเงินสด|งบการเงิน|ภ\.?พ\.? ?30|ภาษีซื้อภาษีขาย|อายุหนี้|บัญชีแยกประเภท/, tool: "account_report" },
  { re: /(ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับภาษี|ใบเสนอราคา|ใบวางบิล|เอกสารบัญชี)/, tool: "account_list_documents" },
  { re: /เงินในบัญชีธนาคาร|เงินสดในมือ|ยอดเงินคงเหลือ|ช่องทางเงิน|บัญชีเงินฝาก/, tool: "account_finance_balances" },
  { re: /ค้างรับ|ค้างจ่าย|ลูกหนี้|เจ้าหนี้|ภาพรวมบัญชี|สรุปบัญชี|แดชบอร์ดบัญชี/, tool: "account_dashboard" },
  // Wave5-A read tools — วางก่อน action/read เดิม เพราะคีย์เวิร์ดจำเพาะ (กันถูก rule กว้าง เช่น "ยอดขาย"/"รายจ่าย" แย่ง)
  { re: /ร้านอาหาร|ออเดอร์ร้าน|โต๊ะ(ที่เปิด|เปิดอยู่|ว่าง|ไหน)|กี่โต๊ะ/, tool: "restaurant_today" },
  { re: /ขายตั๋ว|ยอดตั๋ว|ตั๋ว.*(ขาย|เหลือ|งาน)|ขายบัตร(งาน|อีเวนต์|คอนเสิร์ต)|อีเวนต์|งานคอนเสิร์ต/, tool: "ticket_event_sales" },
  { re: /กำไร|รายรับ ?รายจ่าย|สรุปการเงิน|การเงินเดือน|งบกำไร|สถานะการเงิน/, tool: "financial_summary" },
  { re: /มุ่งหวัง|ลีดใหม่|lead|กรอกฟอร์ม|ฟอร์มติดต่อ|ลูกค้าสนใจ/, tool: "recent_leads" },
  { re: /แต้ม|คะแนนสะสม/, tool: "customer_points" },
  { re: /สัปดาห์นี้|กำลังจะถึง|ตารางนัด|นัดที่จะถึง|เร็ว ?ๆ ?นี้|จะเข้าพัก/, tool: "upcoming_schedule" },
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
