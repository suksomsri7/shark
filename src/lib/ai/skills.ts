// ทะเบียน "สกิล" — จัดกลุ่มเครื่องมือ 63 ตัวเป็นชุดความสามารถที่โหลดตามต้องการ
//
// ทำไมต้องมี (วัดจริงบน prod 8 ส.ค. 2026):
//   ส่ง tool ครบ 63 ตัวทุกคำขอ = **76,703 token** = 94.5% ของค่าใช้จ่ายต่อข้อความ
//   ("สวัสดี" คำเดียวจึงราคา $0.083 ทั้งที่ AI ตอบแค่ 314 token)
//   → เปลี่ยนเป็น: ส่งสารบัญสกิลสั้น ๆ + เครื่องมือแกน แล้วให้ AI สั่ง `load_skill` เอาชุดที่ต้องใช้
//
// ออกแบบให้โมเดลค่ายอื่นใช้ได้ด้วย (และรองรับ "ลูกค้าเอา AI ของตัวเองมาเสียบ" ในอนาคต):
//   - `summary` เขียนเป็นภาษาอังกฤษสั้น ๆ — โมเดลนอกค่าย Claude อ่านไทยได้แย่กว่ามาก
//   - โครง manifest (id/label/summary/tools) เป็น JSON ล้วน ส่งออกเป็น API ได้ตรง ๆ
//   - `systems` = โชว์สกิลนี้เฉพาะร้านที่เปิดระบบนั้นจริง (ร้านตัดผมไม่ต้องเห็นเครื่องมือโรงแรม)
//
// 🔴 กติกาเหล็ก: **ทุก tool ต้องอยู่ในสกิลใดสกิลหนึ่งเสมอ พอดี 1 ที่**
//    ตรวจโดย assertSkillRegistryComplete() + ข้อสอบ qc-ai-skills
//    (ลืมลงทะเบียน tool ใหม่ = AI เรียกไม่ได้เลย ซึ่งจะเงียบมากถ้าไม่มีด่านนี้)

import { accountToolNames } from "./account-ops";
import { toolRegistry } from "./tools";

/** สกิล 1 ชุด — โครงนี้คือสิ่งที่จะกลายเป็น manifest สาธารณะสำหรับ AI ภายนอก */
export type Skill = {
  id: string;
  /** ชื่อไทยสำหรับหน้าจอคน */
  label: string;
  /** คำอธิบายสั้นภาษาอังกฤษ — สิ่งเดียวที่อยู่ใน context ตลอด ต้องสั้นและชี้ชัดว่าเมื่อไหร่ควรโหลด */
  summary: string;
  tools: string[];
  /** โชว์เฉพาะร้านที่เปิดระบบเหล่านี้ (ไม่ระบุ = ทุกร้านเห็น) — ชื่อตรงกับ SystemType ใน Prisma */
  systems?: string[];
};

/**
 * แกนกลาง — โหลดติดตัวเสมอทุกคำขอ ไม่ต้องสั่ง load_skill
 * เก็บให้เล็กที่สุด: มีเฉพาะตัวที่ AI ต้องใช้ "เพื่อจะรู้ว่าต้องโหลดอะไรต่อ" และตัวที่ใช้แทบทุกบทสนทนา
 */
export const CORE_TOOLS = [
  "list_systems",
  "ask_clarify",
  "propose_plan",
  "open_system",
  "kb_search",
  "remember_fact",
  "list_memories",
  "support_open_case",
] as const;

export const SKILLS: Skill[] = [
  {
    id: "sales",
    label: "ขายหน้าร้านและการเงิน",
    summary: "Point of sale: open bills, void sales, sales figures by day, expenses, financial summary.",
    tools: ["sales_summary", "sales_by_day", "pos_create_sale", "void_sale", "record_expense", "financial_summary"],
    systems: ["POS", "ACCOUNT"],
  },
  {
    id: "account",
    label: "บัญชี",
    summary:
      "Full Thai accounting: quotations, invoices, receipts and tax invoices, expenses and purchase orders, contacts, products, cash/bank accounts, payments and payment links, withholding tax, journal entries, financial statements (P&L, balance sheet, trial balance, cash flow, VAT PP30, aging), period close and fixed assets. Use for any question about money owed or paid, revenue, expenses, taxes, or to create accounting documents.",
    // 🔴 รายชื่อนี้ต้องตรงกับ op ที่ประกาศ `tool` ในทะเบียน API บัญชีเป๊ะ ๆ
    //    เขียนไว้เป็นตัวหนังสือด้วยเหตุผลเดียว: ด่าน fitness F13.3 อ่าน "ไฟล์นี้" เพื่อยืนยันว่า tool ใหม่
    //    มีบ้านจริง (ทะเบียนที่ generate มาไม่มีอะไรให้ด่านอ่าน) · ความตรงกันบังคับด้วย
    //    assertSkillRegistryComplete() ซึ่งเทียบกับ accountToolNames() ทุกครั้งที่ boot/รันข้อสอบ
    tools: [
      // อ่าน
      "account_dashboard", "account_list_documents", "account_get_document", "account_report",
      "account_search_contacts", "account_get_contact", "account_search_products",
      "account_finance_balances", "account_wht_summary", "account_list_journal", "account_assets",
      "account_chart_of_accounts", "account_settings", "account_parse_quick_create",
      // เขียน (ผ่านการยืนยันของเจ้าของ)
      "account_create_document", "account_issue_document", "account_convert_document",
      "account_approve_document", "account_record_payment", "account_create_payment_link",
      "account_create_contact", "account_update_contact", "account_create_product",
      "account_issue_goods", "account_post_journal", "account_close_period",
      "account_run_depreciation", "account_transfer_funds", "account_email_document",
      "account_create_recurring", "account_upload_file", "account_read_bill_image",
      // อันตราย (ยืนยัน 2 ชั้น)
      "account_void_document", "account_void_payment", "account_merge_contacts", "account_reopen_period",
    ],
    systems: ["ACCOUNT"],
  },
  {
    id: "inventory",
    label: "สินค้า/บริการ",
    summary: "Stock: low-stock alerts, receive goods, create items, adjust or consume stock.",
    tools: ["low_stock", "inventory_receive", "inventory_create_item", "inventory_adjust", "inventory_consume"],
    systems: ["INVENTORY"],
  },
  {
    id: "members",
    label: "สมาชิก แต้ม และรางวัล",
    summary: "Customers and loyalty: find customers, member count, add members, points balance and adjustment, redeem rewards, coupons.",
    tools: [
      "member_count", "member_create", "customer_search", "customer_points",
      "point_adjust", "reward_redeem", "reward_list_redemptions", "coupon_create",
    ],
    systems: ["MEMBER", "POINT", "REWARD", "COUPON"],
  },
  {
    id: "booking",
    label: "นัดหมายและคิว",
    summary: "Appointments and walk-in queue: today's bookings, create an appointment, waiting queue, issue a queue ticket, upcoming schedule.",
    tools: ["today_appointments", "booking_create_appointment", "queue_waiting", "queue_issue_ticket", "upcoming_schedule"],
    systems: ["BOOKING", "QUEUE"],
  },
  {
    id: "shop",
    label: "ร้านค้าออนไลน์",
    summary: "Online store orders: list pending orders, confirm an order, refund an order.",
    tools: ["shop_pending_orders", "shop_confirm_order", "shop_refund_order"],
    systems: ["SHOP"],
  },
  {
    id: "restaurant",
    label: "ร้านอาหาร",
    summary: "Restaurant floor: today's tables and orders, close a bill.",
    tools: ["restaurant_today", "restaurant_close_bill"],
    systems: ["RESTAURANT"],
  },
  {
    id: "hotel",
    label: "โรงแรมและที่พัก",
    summary: "Hotel: create a room reservation.",
    tools: ["hotel_create_reservation"],
    systems: ["HOTEL"],
  },
  {
    id: "rental",
    label: "เช่าของ",
    summary: "Rental: active rental contracts, create a rental booking.",
    tools: ["rental_active", "rental_create_booking"],
    systems: ["RENTAL"],
  },
  {
    id: "ticket",
    label: "ตั๋วและอีเวนต์",
    summary: "Event ticketing: sales per event, mark a ticket order as paid.",
    tools: ["ticket_event_sales", "ticket_mark_paid"],
    systems: ["TICKET"],
  },
  {
    id: "school",
    label: "โรงเรียนและคอร์ส",
    summary: "Courses: enroll a student, mark tuition paid.",
    tools: ["school_enroll", "school_mark_paid"],
    systems: ["SCHOOL"],
  },
  {
    id: "clinic",
    label: "คลินิก",
    summary: "Clinic: register a patient.",
    tools: ["clinic_create_patient"],
    systems: ["CLINIC"],
  },
  {
    id: "hr",
    label: "พนักงานและการลา",
    summary: "Staff: pending leave requests, approve or reject leave, add an employee.",
    tools: ["pending_leaves", "hr_decide_leave", "hr_create_employee"],
    systems: ["HR"],
  },
  {
    id: "crm",
    label: "ลูกค้ามุ่งหวังและการตลาด",
    summary: "Leads and marketing: recent leads, create a lead, launch a campaign, growth suggestions.",
    tools: ["recent_leads", "crm_create_lead", "marketing_create_campaign", "growth_recommendations"],
    systems: ["CRM", "MARKETING"],
  },
  {
    id: "tasks",
    label: "งานและบอร์ด",
    summary: "Task boards: my assigned tasks, create a board, create a card.",
    tools: ["kanban_my_tasks", "kanban_create_board", "kanban_create_card"],
    systems: ["KANBAN"],
  },
  {
    id: "approvals",
    label: "สายอนุมัติ",
    summary: "Approval flow: requests waiting on me, approve or reject a request.",
    tools: ["approvals_pending", "approval_decide"],
  },
  {
    id: "chat",
    label: "แชทลูกค้า",
    summary: "Customer chat: conversations with unread messages.",
    tools: ["chat_unread_conversations"],
    systems: ["CHAT"],
  },
  {
    id: "knowledge",
    label: "คลังความรู้",
    summary: "Knowledge base: write an article, save a durable business fact learned in conversation.",
    tools: ["kb_create_article", "kb_auto_save"],
  },
  {
    id: "automation",
    label: "งานประจำและระบบอัตโนมัติ",
    summary: "Automation: schedule a recurring AI task, create an event-triggered rule.",
    tools: ["schedule_task", "automation_create_rule"],
  },
  {
    id: "memory",
    label: "ความจำผู้ช่วย",
    summary: "Assistant memory: forget a previously remembered fact.",
    tools: ["forget_fact"],
  },
];

/**
 * เครื่องมือ meta สำหรับโหลดสกิล — อยู่ชั้น service ไม่ใช่ tool ธุรกิจ (ไม่แตะฐานข้อมูล)
 * enum ใส่เฉพาะสกิลที่ยังไม่โหลด → AI เลือกผิดชื่อไม่ได้ และไม่สั่งโหลดซ้ำ
 */
export function LOAD_SKILL_TOOL(availableIds: string[]) {
  return {
    name: "load_skill",
    description:
      "Load one or more skills to get their tools. Call this first when the request needs a capability you don't have a tool for yet. Tools become callable on the next step.",
    parameters: {
      type: "object",
      properties: {
        skills: {
          type: "array",
          description: "Skill ids to load",
          items: { type: "string", enum: availableIds },
        },
      },
      required: ["skills"],
      additionalProperties: false,
    },
  };
}

/** ชื่อ tool → สกิลที่สังกัด (null = อยู่ในแกนกลาง) */
export function skillOfTool(toolName: string): Skill | null {
  return SKILLS.find((s) => s.tools.includes(toolName)) ?? null;
}

export function skillById(id: string): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

/**
 * สกิลที่ร้านนี้เห็น — กรองตามระบบที่เปิดใช้จริง
 * ร้านตัดผมไม่ควรเห็นเครื่องมือโรงแรม/โรงเรียน ทั้งเปลืองและทำให้ AI เลือกผิด
 * สกิลที่ไม่ระบุ systems = เห็นเสมอ (สายอนุมัติ/คลังความรู้/งานอัตโนมัติ/ความจำ)
 */
export function skillsForTenant(openedSystemTypes: string[]): Skill[] {
  const opened = new Set(openedSystemTypes);
  return SKILLS.filter((s) => !s.systems || s.systems.some((t) => opened.has(t)));
}

/**
 * สารบัญสกิลที่ฉีดเข้า system prompt — สั้นที่สุดเท่าที่ยังชี้ทางถูก
 * ภาษาอังกฤษล้วน: วัดแล้วไทยกิน token ~4 เท่าของอังกฤษ และส่วนนี้อยู่ใน context ทุกคำขอ
 */
export function skillIndexPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map((s) => `- ${s.id}: ${s.summary}`);
  return [
    "AVAILABLE SKILLS (tools are not loaded yet — call load_skill first, then use the tools it returns):",
    ...lines,
    'Load only what the current request needs. You may load several at once: load_skill({"skills":["sales","inventory"]}).',
  ].join("\n");
}

/** รวมชื่อ tool ของหลายสกิล (ไม่ซ้ำ) */
export function toolNamesOfSkills(ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) for (const n of skillById(id)?.tools ?? []) out.add(n);
  return [...out];
}

/**
 * ด่านความครบถ้วน — ทุก tool ในทะเบียนต้องอยู่ในแกนกลางหรือสกิล **พอดี 1 ที่**
 * เรียกตอน boot + ข้อสอบ · โยน error พร้อมชื่อที่ผิด (ไม่ปล่อยผ่านเงียบ ๆ)
 */
export function assertSkillRegistryComplete(): void {
  const all = toolRegistry().map((t) => t.def.name);
  const core = new Set<string>(CORE_TOOLS);
  const problems: string[] = [];

  for (const name of all) {
    const inCore = core.has(name);
    const owners = SKILLS.filter((s) => s.tools.includes(name));
    if (inCore && owners.length > 0) problems.push(`${name}: อยู่ทั้งแกนกลางและสกิล ${owners.map((o) => o.id).join(",")}`);
    else if (!inCore && owners.length === 0) problems.push(`${name}: ไม่ได้อยู่ในสกิลใดเลย`);
    else if (owners.length > 1) problems.push(`${name}: อยู่หลายสกิล (${owners.map((o) => o.id).join(",")})`);
  }
  // ชื่อในทะเบียนสกิลที่ไม่มี tool จริงรองรับ = สะกดผิด/ลบ tool แล้วลืมลบชื่อ
  const known = new Set(all);
  for (const s of SKILLS) for (const n of s.tools) if (!known.has(n)) problems.push(`สกิล ${s.id} อ้าง tool ที่ไม่มีจริง: ${n}`);
  for (const n of core) if (!known.has(n)) problems.push(`แกนกลางอ้าง tool ที่ไม่มีจริง: ${n}`);

  // สกิลบัญชี generate มาจากทะเบียน op — รายชื่อในไฟล์นี้ต้องตรงกับทะเบียน "ไม่ขาดไม่เกิน"
  // (ใส่ tool ให้ op แล้วลืมเติมชื่อที่นี่ = ผู้ช่วยเรียกไม่ได้และเงียบสนิท — บทเรียนเดียวกับ F10)
  const declared = new Set(SKILLS.find((s) => s.id === "account")?.tools ?? []);
  const fromRegistry = accountToolNames();
  const missing = fromRegistry.filter((n) => !declared.has(n));
  const extra = [...declared].filter((n) => !fromRegistry.includes(n));
  if (missing.length > 0) problems.push(`สกิล account ขาด tool ของทะเบียน: ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`สกิล account มี tool ที่ทะเบียนไม่มีแล้ว: ${extra.join(", ")}`);

  if (problems.length > 0) {
    throw new Error(`ทะเบียนสกิลไม่ครบ/ขัดกัน:\n  - ${problems.join("\n  - ")}`);
  }
}
