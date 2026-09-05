// ทะเบียน action กลางของทั้งระบบ (WO-CW2) — "ที่เดียว" ที่บอกว่ามีสิทธิ์อะไรให้ติ๊กได้บ้าง
//
// ทำไมต้องมี: `Membership.permissions` เป็น `Json` เปล่า ๆ ⇒ ก่อนหน้านี้ไม่มีใครรู้ว่าคีย์ที่ใส่ได้
// มีอะไรบ้าง และไม่มีอะไรกันการเขียนคีย์มั่วลง DB (คีย์ที่สะกดผิด = สิทธิ์ที่ไม่มีวันตรงกับ assertCan
// = ผู้ใช้กดแล้วถูกปฏิเสธโดยไม่มีใครอธิบายได้)
//
// 🔴 กติกา 3 ข้อของไฟล์นี้
//   1. **หน้า UI ต้องอ่านจากที่นี่ที่เดียว** ห้ามพิมพ์ลิสต์ซ้ำในหน้าจอ
//      (บทเรียน AS-6.1/6.3 ของรีโปนี้: ลิสต์ที่พิมพ์มือแยกกันเพี้ยนจากของจริงเสมอ)
//   2. **คีย์ในนี้ต้องตรงกับ string ที่โค้ดจริงยิงเข้า `assertCan()` เป๊ะ ๆ** — ไม่ใช่ชื่อที่อ่านสวย
//      คีย์ทั้งหมดด้านล่างสกัดจากซอร์สจริงเมื่อ 31 ส.ค. 2026 (`grep assertCan/evaluate` ทั้ง src/)
//      ไม่ใช่รายการที่นึกขึ้นเอง
//   3. `updateStaffAccess` ต้อง validate ทุกคีย์กับทะเบียนนี้ก่อนเขียน DB (fail-closed)
//
// ⚠️ ไฟล์นี้เป็น **ทะเบียนสิทธิ์** คนละเรื่องกับ `AUDIT_ACTION_LABELS` ใน
//    `src/lib/modules/account/access.ts` ซึ่งเป็นป้ายอ่าน AuditLog (ครอบ event ระดับแพลตฟอร์ม
//    อย่าง `billing.paid` / `tenant.suspend` ที่ไม่ใช่สิทธิ์ให้ติ๊ก) — จงใจไม่ยุบรวม
//
// วิธีที่ `evaluate()` (core/rbac.ts) อ่านค่า:
//   OWNER → ผ่านทุกอย่าง · MANAGER → ผ่านทุกอย่างในหน่วยที่เข้าถึงได้
//   STAFF → `permissions[action] === true` **หรือ** `permissions["<module>.*"] === true`
//   ⇒ ทะเบียนนี้จึงต้องรองรับทั้ง action เดี่ยว และ wildcard ระดับโมดูล

/** กลุ่มใหญ่สำหรับจัดหน้าจอ — ไม่มีผลต่อการตัดสินสิทธิ์ */
export type PermissionGroupKey =
  | "chat"
  | "sales"
  | "booking"
  | "customer"
  | "back"
  | "work"
  | "admin";

export const PERMISSION_GROUPS: readonly { key: PermissionGroupKey; label: string }[] = [
  { key: "chat", label: "แชทลูกค้า" },
  { key: "sales", label: "การขาย" },
  { key: "booking", label: "จอง คิว และบริการ" },
  { key: "customer", label: "ลูกค้าและการตลาด" },
  { key: "back", label: "หลังบ้าน (คลัง บุคคล บัญชี)" },
  { key: "work", label: "งานภายในและเครื่องมือ" },
  { key: "admin", label: "ตั้งค่าร้าน" },
] as const;

export type PermissionDef = {
  /** คีย์ที่เขียนลง `Membership.permissions` — ต้องตรงกับที่ assertCan ใช้เป๊ะ */
  key: string;
  /** ชื่อโมดูล (มิติที่ 3 ของ RBAC) */
  module: string;
  /** คำอธิบายภาษาไทยที่คนทั่วไปอ่านรู้เรื่อง */
  label: string;
  group: PermissionGroupKey;
  /** true = ยังไม่มีโค้ดไหนเรียก (จองคีย์ไว้ให้สายที่ทำต่อ) — หน้าจอเอาไปขึ้นป้าย "เร็ว ๆ นี้" ได้ */
  planned?: boolean;
};

/** ค่าตัวเลขของสิทธิ์ (ไม่ใช่ติ๊กถูก/ผิด) — อ่านผ่าน `permissionValue()` */
export type PermissionParamDef = {
  key: string;
  module: string;
  label: string;
  group: PermissionGroupKey;
  /** หน่วยของค่าที่กรอก เพื่อให้หน้าจอบอกคนกรอกได้ถูก */
  unit: string;
  /**
   * ตัวคูณจาก "หน่วยที่คนกรอก" → "หน่วยที่เก็บใน DB" (default 1)
   * เช่นเงินเก็บเป็นสตางค์แต่ให้คนกรอกเป็นบาท ⇒ factor 100
   * 🔴 มีที่นี่ที่เดียว — หน้าจอกับ action ต้องอ่านจากตรงนี้ ห้ามฮาร์ดโค้ด ×100 เอง
   */
  factor?: number;
  hint?: string;
};

type ModuleDef = {
  module: string;
  label: string;
  group: PermissionGroupKey;
  /** key → คำอธิบายไทย · คีย์ต้องเป็น string เดียวกับที่ assertCan ใช้ */
  actions: Record<string, string>;
  /** คีย์ที่ยังไม่มีใครเรียก (ของรอบนี้ที่จองไว้ให้สายอื่น) */
  planned?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// ทะเบียนจริง — เรียงตามโมดูล
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_DEFS: readonly ModuleDef[] = [
  {
    module: "chat",
    label: "แชทลูกค้า",
    group: "chat",
    // 10 ตัวแรก = ของจริงที่ `src/lib/modules/chat/actions.ts` ยิงเข้า assertCan อยู่แล้ววันนี้
    actions: {
      "chat.conversation.read": "เปิดดูกล่องแชทและอ่านข้อความลูกค้า",
      "chat.message.send": "ตอบข้อความลูกค้า",
      "chat.conversation.assign": "มอบหมาย/รับผิดชอบห้องแชท",
      "chat.conversation.setStatus": "ปิด/เปิดห้องแชทใหม่",
      "chat.conversation.markRead": "ทำเครื่องหมายว่าอ่านแล้ว",
      "chat.customer.link": "ผูกผู้ติดต่อในแชทเข้ากับสมาชิกของร้าน",
      "chat.connection.create": "เชื่อมช่องทางแชทใหม่ (LINE ฯลฯ)",
      "chat.connection.disable": "ปิดการเชื่อมช่องทางแชท",
      "chat.setting.setMemberSystem": "ตั้งว่าแชทผูกกับระบบสมาชิกชุดไหน",
      "chat.setting.setBusinessHours": "ตั้งเวลาทำการและข้อความนอกเวลา",
      "chat.setting.setRetention": "ตั้งอายุการเก็บข้อความ (PDPA)",
      "chat.ai.suggest": "ใช้ AI ช่วยร่างคำตอบ (มีค่าใช้จ่ายต่อครั้ง)",
      "chat.translate.use": "ใช้การแปลข้อความ (มีค่าใช้จ่ายต่อครั้ง)",
      // 🔴 แยกจาก `chat.message.send` โดยตั้งใจ (Fable 31 ส.ค.) — "ตอบลูกค้า 1 ครั้ง" เป็นงานประจำวัน
      //    แต่ "บันทึก/ถอดตัวอย่างคำตอบ" ไป **แก้คลังที่ AI ใช้อ้างอิงถาวร** ⇒ ผิดพลาดแล้วส่งผลกับ
      //    คำตอบของทุกคนในร้านตลอดไป · OWNER/MANAGER ได้อัตโนมัติ · STAFF ต้องได้รับสิทธิ์เจาะจง
      "chat.example.manage": "จัดการคลังตัวอย่างคำตอบที่ AI ใช้อ้างอิง",
      // ── WO-CV6 (1 ก.ย.) ──
      // 🔴 แยกจาก `chat.message.send` ด้วยเหตุผลเดียวกับ `chat.example.manage`:
      //    "ตอบลูกค้า 1 ครั้ง" = ของชั่วคราว ผิดแล้วขอโทษในห้องนั้นจบ
      //    แต่คลังคำตอบสำเร็จรูปคือ **ข้อความที่ทุกคนในร้านจะกดส่งซ้ำ ๆ ทุกวัน** (เลขบัญชี ราคา เงื่อนไข)
      //    แก้ผิดตัวเดียว = ส่งข้อมูลผิดให้ลูกค้าทุกคนจนกว่าจะมีคนสังเกตเห็น
      //    ⇒ ใช้คลังได้ = มีสิทธิ์ตอบลูกค้าก็พอ · **แก้คลัง** ต้องได้รับสิทธิ์นี้เจาะจง
      "chat.quickreply.manage": "จัดการคลังคำตอบสำเร็จรูป (เพิ่ม/แก้/ถอด)",
      // ป้ายกำกับห้องแชทเป็นข้อมูลปฏิบัติการรายห้อง (เหมือนมอบหมายงาน) ไม่ใช่ของถาวรระดับร้าน
      // ⇒ เป็นสิทธิ์ของตัวเอง แยกจาก `chat.conversation.assign` เพราะ "ติดป้าย" ไม่ได้แปลว่ารับผิดชอบห้อง
      "chat.conversation.tag": "ติด/ถอดป้ายกำกับห้องแชท",
    },
    // 🔴 ถอดธงหมดแล้ว 1 ก.ย. — ทุกคีย์ในโมดูลนี้ถูก `assertChatCan` เรียกจริงทั้งหมด
    //    (`chat.example.manage` ถูกเรียกตั้งแต่ 31 ส.ค. ที่ `chat/actions.ts` แต่ลืมถอดธง —
    //     สาย D รายงานแทนที่จะแก้เอง เพราะไม่ใช่ไฟล์ของเขา · Fable ถอดให้)
    //    ⚠️ ธง `planned` ที่ค้างไว้ = หน้าจอขึ้นป้าย "กำลังพัฒนา" ทั้งที่ใช้ได้จริง ⇒ แอดมินไม่กล้าติ๊กให้พนักงาน
  },
  {
    module: "pos",
    label: "ขายหน้าร้าน (POS)",
    group: "sales",
    actions: {
      "pos.sale.create": "บันทึกการขาย / เปิดหน้าขาย / ดึงรายงานขายรายวัน",
      "pos.product.setPrice": "ตั้งราคาขายสินค้า",
      "pos.sale.void": "ยกเลิกบิลขาย (ใช้กับข้อเสนอของผู้ช่วย AI)",
    },
  },
  {
    module: "restaurant",
    label: "ร้านอาหาร",
    group: "sales",
    actions: {
      "restaurant.setting.update": "แก้ตั้งค่าร้านอาหาร",
      "restaurant.zone.create": "เพิ่มโซนโต๊ะ",
      "restaurant.zone.archive": "เก็บโซนโต๊ะออกจากผัง",
      "restaurant.table.create": "เพิ่มโต๊ะ",
      "restaurant.table.archive": "เก็บโต๊ะออกจากผัง",
      "restaurant.table.setStatus": "เปลี่ยนสถานะโต๊ะ",
      "restaurant.table.rotateQr": "เปลี่ยน QR ประจำโต๊ะ",
      "restaurant.category.create": "เพิ่มหมวดเมนู",
      "restaurant.category.archive": "เก็บหมวดเมนู",
      "restaurant.item.create": "เพิ่ม/แก้เมนู",
      "restaurant.item.duplicate": "คัดลอกเมนู",
      "restaurant.item.archive": "เก็บเมนูออกจากหน้าสั่ง",
      "restaurant.item.setStock": "ตั้งจำนวนเมนูที่เหลือ",
      "restaurant.item.resetStock": "รีเซ็ตจำนวนเมนูที่เหลือ",
      "restaurant.optionGroup.create": "เพิ่มกลุ่มตัวเลือกเมนู",
      "restaurant.optionGroup.archive": "เก็บกลุ่มตัวเลือกเมนู",
      "restaurant.choice.setStock": "ตั้งจำนวนตัวเลือกที่เหลือ",
      "restaurant.station.create": "เพิ่มจุดผลิต (ครัว/บาร์)",
      "restaurant.session.open": "เปิดโต๊ะ",
      "restaurant.session.close": "ปิดโต๊ะ",
      "restaurant.session.move": "ย้ายโต๊ะ",
      "restaurant.session.merge": "รวมโต๊ะ",
      "restaurant.session.linkMember": "ผูกโต๊ะกับสมาชิก",
      "restaurant.order.create": "รับออร์เดอร์",
      "restaurant.order.confirm": "ยืนยันออร์เดอร์",
      "restaurant.order.cancelItem": "ยกเลิกรายการในออร์เดอร์",
      "restaurant.order.rush": "เร่งออร์เดอร์",
      "restaurant.kds.advance": "เดินสถานะงานในครัว",
      "restaurant.kds.recall": "ดึงงานในครัวกลับ",
      "restaurant.kitchen.pause": "พักรับออร์เดอร์เข้าครัว",
      "restaurant.request.ack": "รับเรื่องที่ลูกค้าเรียก",
      "restaurant.request.done": "ปิดเรื่องที่ลูกค้าเรียก",
      "restaurant.checkout.create": "ปิดบิล/รับชำระเงิน",
      "restaurant.checkout.void": "ยกเลิกบิลที่ปิดไปแล้ว",
    },
  },
  {
    module: "shop",
    label: "ร้านค้าออนไลน์",
    group: "sales",
    actions: {
      "shop.product.create": "เพิ่มสินค้าในร้านออนไลน์",
      "shop.product.update": "แก้ไขสินค้าในร้านออนไลน์",
      "shop.order.confirm": "ยืนยันคำสั่งซื้อ",
      "shop.order.cancel": "ยกเลิกคำสั่งซื้อ",
      "shop.order.refund": "คืนเงินคำสั่งซื้อ",
    },
  },
  {
    module: "delivery",
    label: "การจัดส่ง",
    group: "sales",
    actions: {
      "delivery.shipment.create": "สร้างรายการจัดส่ง",
      "delivery.shipment.update": "อัปเดตสถานะการจัดส่ง",
    },
  },
  {
    module: "booking",
    label: "นัดหมาย",
    group: "booking",
    actions: {
      "booking.appointment.create": "สร้างนัดหมาย (ใช้กับข้อเสนอของผู้ช่วย AI)",
      "booking.appointment.setStatus": "เปลี่ยนสถานะนัดหมาย",
      "booking.service.create": "เพิ่มบริการที่จองได้",
      "booking.service.update": "แก้ไขบริการที่จองได้",
      "booking.service.setDeposit": "ตั้งค่ามัดจำของบริการ",
      "booking.deposit.record": "บันทึกรับมัดจำ",
      "booking.deposit.refund": "คืนมัดจำ",
      "booking.staff.create": "เพิ่ม/ตั้งค่าผู้ให้บริการ",
      "booking.staff.delete": "เอาผู้ให้บริการออก",
      "booking.hours.set": "ตั้งเวลาทำการและวันหยุด",
    },
  },
  {
    module: "hotel",
    label: "ที่พัก",
    group: "booking",
    actions: {
      "hotel.reservation.create": "สร้างการจองห้องพัก",
      "hotel.reservation.checkIn": "เช็คอิน",
      "hotel.reservation.checkOut": "เช็คเอาท์",
      "hotel.reservation.cancel": "ยกเลิกการจอง",
      "hotel.reservation.refund": "คืนเงินการจอง",
      "hotel.room.create": "เพิ่มห้องพัก",
      "hotel.room.delete": "ลบห้องพัก",
      "hotel.room.setStatus": "เปลี่ยนสถานะห้องพัก",
      "hotel.roomType.create": "เพิ่มประเภทห้องพัก",
      "hotel.roomType.delete": "ลบประเภทห้องพัก",
    },
  },
  {
    module: "queue",
    label: "คิว",
    group: "booking",
    actions: {
      "queue.type.create": "เพิ่มประเภทคิว",
      "queue.type.delete": "ลบประเภทคิว",
      "queue.counter.create": "เพิ่มช่องบริการ",
      "queue.counter.delete": "ลบช่องบริการ",
      "queue.counter.open": "เปิดช่องบริการ",
      "queue.counter.close": "ปิดช่องบริการ",
      "queue.counter.setTypes": "ตั้งว่าช่องนี้รับคิวประเภทไหน",
      "queue.display.create": "สร้างจอแสดงคิว",
      "queue.display.revoke": "ยกเลิกจอแสดงคิว",
      "queue.ticket.issue": "ออกบัตรคิว",
      "queue.ticket.callNext": "เรียกคิวถัดไป",
      "queue.ticket.recall": "เรียกซ้ำ",
      "queue.ticket.recallSkipped": "เรียกคิวที่ข้ามไปแล้วกลับมา",
      "queue.ticket.serve": "เริ่มให้บริการ",
      "queue.ticket.done": "จบคิว",
      "queue.ticket.skip": "ข้ามคิว",
      "queue.ticket.cancel": "ยกเลิกคิว",
      "queue.ticket.transfer": "โอนคิวไปช่องอื่น",
    },
  },
  {
    module: "ticket",
    label: "บัตรอีเวนต์",
    group: "booking",
    actions: {
      "ticket.event.create": "สร้างอีเวนต์",
      "ticket.event.setStatus": "เปลี่ยนสถานะอีเวนต์",
      "ticket.event.archive": "เก็บอีเวนต์",
      "ticket.type.create": "เพิ่มประเภทบัตร",
      "ticket.type.delete": "ลบประเภทบัตร",
      "ticket.order.create": "สร้างคำสั่งซื้อบัตร",
      "ticket.order.markPaid": "บันทึกรับชำระค่าบัตร",
      "ticket.order.cancel": "ยกเลิกคำสั่งซื้อบัตร",
      "ticket.checkin.scan": "สแกนบัตรหน้างาน",
    },
  },
  {
    module: "rental",
    label: "ให้เช่า",
    group: "booking",
    actions: {
      "rental.asset.create": "เพิ่มของให้เช่า",
      "rental.asset.update": "แก้ไขของให้เช่า",
      "rental.booking.create": "สร้างรายการเช่า",
      "rental.booking.update": "แก้ไขรายการเช่า",
      "rental.booking.return": "รับคืนของ",
      "rental.booking.cancel": "ยกเลิกรายการเช่า",
      "rental.booking.refund": "คืนเงินค่าเช่า",
    },
  },
  {
    module: "clinic",
    label: "คลินิก",
    group: "booking",
    // ⚠️ 3 คีย์ล่างเป็น 2 ท่อน (clinic.bill) ไม่ใช่ <module>.<entity>.<verb> ตาม convention
    //    — ของจริงในโค้ดเป็นแบบนี้ (clinic/actions.ts) ทะเบียนต้องพูดความจริง ไม่ใช่ดัดให้สวย
    actions: {
      "clinic.patient.create": "เพิ่ม/แก้ข้อมูลคนไข้",
      "clinic.visit.create": "เปิดการเข้ารับบริการ",
      "clinic.appointment.confirm": "ยืนยันนัดหมายคนไข้",
      "clinic.appointment.reject": "ปฏิเสธนัดหมายคนไข้",
      "clinic.appointment.complete": "ปิดนัดหมายคนไข้",
      "clinic.dispense": "จ่ายยา",
      "clinic.bill": "เก็บเงินค่ารักษา",
      "clinic.refund": "คืนเงินค่ารักษา",
    },
  },
  {
    module: "school",
    label: "โรงเรียน/คอร์สเรียน",
    group: "booking",
    actions: {
      "school.course.create": "เพิ่มคอร์ส",
      "school.course.update": "แก้ไขคอร์ส",
      "school.class.create": "เปิดคาบเรียน",
      "school.enrollment.create": "ลงทะเบียนเรียน",
      "school.enrollment.pay": "บันทึกรับค่าเรียน",
      "school.enrollment.cancel": "ยกเลิกการลงทะเบียน",
      "school.enrollment.refund": "คืนค่าเรียน",
      "school.attendance.mark": "เช็คชื่อผู้เรียน",
    },
  },
  {
    module: "member",
    label: "สมาชิก/ลูกค้า",
    group: "customer",
    actions: {
      "member.customer.create": "เพิ่มลูกค้า/สมาชิก",
      "member.customer.update": "แก้ไขข้อมูลลูกค้า/สมาชิก",
      "member.customer.import": "นำเข้าลูกค้าจากไฟล์",
      "member.tier.update": "ตั้งระดับสมาชิก",
      "member.plan.create": "สร้างแพ็กเกจสมาชิก",
      "member.plan.update": "แก้ไขแพ็กเกจสมาชิก",
      "member.subscription.create": "เปิดการสมัครสมาชิกรายงวด",
      "member.subscription.cancel": "ยกเลิกการสมัครสมาชิกรายงวด",
    },
  },
  {
    module: "point",
    label: "แต้มสะสม",
    group: "customer",
    actions: {
      "point.adjust.create": "ปรับ/แจกแต้มด้วยมือ",
      "point.settings.update": "ตั้งอัตราการสะสมแต้ม",
    },
  },
  {
    module: "reward",
    label: "ของรางวัล",
    group: "customer",
    actions: {
      "reward.redemption.create": "รับแลกของรางวัล",
      "reward.redemption.fulfill": "ส่งมอบของรางวัล",
      "reward.redemption.cancel": "ยกเลิกการแลกของรางวัล",
    },
  },
  {
    module: "coupon",
    label: "คูปอง",
    group: "customer",
    actions: {
      "coupon.coupon.create": "สร้างคูปอง",
      "coupon.coupon.toggle": "เปิด/ปิดคูปอง",
    },
  },
  {
    module: "crm",
    label: "งานขาย (CRM)",
    group: "customer",
    actions: {
      "crm.contact.create": "เพิ่มผู้ติดต่อ",
      "crm.deal.create": "เปิดดีล",
      "crm.deal.move": "ย้ายขั้นของดีล",
      "crm.deal.quote": "ออกใบเสนอราคาจากดีล",
      "crm.activity.create": "บันทึกกิจกรรมติดตาม",
      "crm.activity.complete": "ปิดกิจกรรมติดตาม",
    },
  },
  {
    module: "marketing",
    label: "การตลาด",
    group: "customer",
    actions: {
      "marketing.campaign.create": "สร้างแคมเปญ",
      "marketing.campaign.send": "ส่งแคมเปญออกไปหาลูกค้า",
    },
  },
  {
    module: "inventory",
    label: "คลังสินค้า",
    group: "back",
    actions: {
      "inventory.item.read": "ดูรายการสินค้าในคลัง",
      "inventory.item.create": "เพิ่มสินค้าในคลัง",
      "inventory.item.update": "แก้ไขสินค้าในคลัง",
      "inventory.item.import": "นำเข้าสินค้าจากไฟล์",
      "inventory.location.create": "เพิ่มที่เก็บของ",
      "inventory.movement.receive": "รับของเข้าคลัง",
      "inventory.movement.consume": "เบิก/ตัดสต็อก",
      "inventory.movement.transfer": "ย้ายของระหว่างที่เก็บ",
      "inventory.movement.adjust": "ปรับยอดสต็อก",
      "inventory.lot.expiring": "ดูล็อตที่ใกล้หมดอายุ",
      "inventory.supplier.create": "เพิ่มผู้ขาย",
      "inventory.supplier.update": "แก้ไขผู้ขาย",
      "inventory.po.create": "สร้างใบสั่งซื้อ",
      "inventory.po.order": "ส่งใบสั่งซื้อให้ผู้ขาย",
      "inventory.po.receive": "รับของตามใบสั่งซื้อ",
      "inventory.po.cancel": "ยกเลิกใบสั่งซื้อ",
    },
  },
  {
    module: "hr",
    label: "งานบุคคล",
    group: "back",
    actions: {
      "hr.employee.create": "เพิ่ม/แก้ทะเบียนพนักงาน",
      "hr.attendance.clock": "ลงเวลาเข้า-ออกแทนพนักงาน",
      "hr.leave.request": "ยื่นใบลา",
      "hr.leave.read": "ดูข้อมูลการลาของทั้งร้าน",
      "hr.leave.decide": "อนุมัติ/ปฏิเสธการลา",
      "hr.payadjust.request": "ขอปรับเงินเดือน/เบี้ยเลี้ยง",
      "hr.payadjust.approve": "อนุมัติการปรับเงิน",
      "hr.payadjust.reject": "ปฏิเสธการปรับเงิน",
      "hr.payroll.read": "🔒 ดูเงินเดือนและข้อมูลอ่อนไหว (เลขบัตร ปชช./บัญชีธนาคาร)",
      "hr.payroll.create": "สร้างรอบเงินเดือน",
      "hr.payroll.approve": "อนุมัติรอบเงินเดือน",
      "hr.payroll.pay": "บันทึกจ่ายเงินเดือน",
      "hr.payroll.reverse": "กลับรายการเงินเดือน",
    },
  },
  {
    module: "account",
    label: "บัญชี",
    group: "back",
    actions: {
      // V2 (WO 0.3): แยก "ดู" ออกจาก "สร้าง/แก้" — หน้าอ่านอย่างเดียว (list/detail/print) ใช้ตัวนี้
      // ⚠️ ใครที่มี account.doc.create อยู่เดิม ได้ account.doc.view อัตโนมัติ (ตาราง IMPLIES ใน account/access.ts)
      "account.doc.view": "ดูเอกสารบัญชี",
      "account.doc.create": "สร้าง/แก้เอกสารบัญชี",
      "account.doc.issue": "ออกเอกสารบัญชี (มีผลทางบัญชี)",
      "account.doc.approve": "อนุมัติเอกสารบัญชี",
      "account.doc.void": "ยกเลิกเอกสารบัญชี",
      "account.doc.public_link": "สร้างลิงก์ให้ลูกค้าขอใบกำกับภาษี",
      "account.payment.record": "บันทึกรับ/จ่ายเงิน",
      "account.payment.void": "ยกเลิกการชำระเงิน",
      "account.contact.manage": "จัดการผู้ติดต่อทางบัญชี",
      "account.product.manage": "จัดการสินค้า/บริการทางบัญชี",
      "account.document.manage": "จัดการแฟ้มเอกสารบัญชี",
      "account.settings.manage": "แก้ตั้งค่าระบบบัญชี",
      "account.chart.manage": "จัดการผังบัญชี",
      "account.mapping.manage": "จัดการการผูกบัญชีอัตโนมัติ",
      "account.journal.view": "ดูสมุดรายวัน",
      "account.journal.adjust": "ลงรายการปรับปรุงเอง",
      "account.period.close": "ปิดงวดบัญชี",
      "account.period.reopen": "เปิดงวดบัญชีที่ปิดไปแล้ว",
      "account.tax.view": "ดูรายงานภาษี",
      "account.wht.manage": "จัดการภาษีหัก ณ ที่จ่าย",
      // V2 (WO 5.4) — เหมือน account.period.reopen: ยกเลิกเครื่องหมายนำส่ง ภ.ง.ด. ที่ยื่นแล้ว (สิทธิ์ระดับเจ้าของ)
      "account.wht.unmark": "🔒 ยกเลิกเครื่องหมายนำส่งภาษีหัก ณ ที่จ่าย",
      "account.report.view": "ดูงบการเงิน",
      "account.finance.manage": "จัดการบัญชีธนาคาร/เงินสด",
      "account.asset.manage": "จัดการทะเบียนสินทรัพย์",
      "account.asset.register": "ขึ้นทะเบียนสินทรัพย์",
      "account.asset.dispose": "จำหน่ายสินทรัพย์",
      "account.asset.writeoff": "ตัดจำหน่ายสินทรัพย์",
      "account.cheque.manage": "จัดการเช็ค",
      "account.cheque.deposit": "นำเช็คเข้าธนาคาร",
      "account.cheque.clear": "บันทึกเช็คผ่าน",
      "account.cheque.bounce": "บันทึกเช็คคืน",
      "account.cheque.void": "ยกเลิกเช็ค",
      // V2 (WO 0.3) — ของใหม่ที่เฟส 1+ จะใช้ (SPEC §14.11)
      "account.reconcile": "กระทบยอดธนาคาร",
      "account.contact.merge": "รวมผู้ติดต่อซ้ำ",
      "account.import": "นำเข้าข้อมูลบัญชี",
      "account.approve.limit": "เพดานยอดอนุมัติ",
    },
  },
  {
    module: "approval",
    label: "สายอนุมัติ",
    group: "back",
    actions: {
      "approval.policy.create": "สร้างสายอนุมัติ",
      "approval.policy.update": "แก้ไขสายอนุมัติ",
      "approval.request.decide": "อนุมัติ/ปฏิเสธคำขอ",
    },
  },
  {
    module: "kanban",
    label: "บอร์ดงาน",
    group: "work",
    actions: {
      // 🔴 K1.3: `kanban.board.read` เป็นคีย์ใหม่ — ก่อนหน้านี้ "มีสิทธิ์โมดูล = เห็นทุกบอร์ด"
      //    (รวมบอร์ดเงินเดือน/เรื่องร้องเรียน) · ชั้นที่ 2 (`kanban/access.ts`) ตรวจคีย์นี้เป็นขั้นต่ำ
      //    ผู้ใช้เดิมไม่หลุดสิทธิ์: มีคีย์ `kanban.*` ตัวใดตัวหนึ่งอยู่แล้ว = ได้ read โดยนัย (IMPLIES ในโค้ด ไม่ backfill DB)
      "kanban.board.read": "เห็นบอร์ดงาน",
      "kanban.board.create": "สร้างบอร์ด",
      "kanban.board.rename": "เปลี่ยนชื่อบอร์ด",
      "kanban.board.delete": "ลบบอร์ด",
      "kanban.board.member.manage": "จัดการสมาชิกบอร์ด",
      "kanban.column.create": "เพิ่มคอลัมน์",
      "kanban.column.delete": "ลบคอลัมน์",
      "kanban.card.create": "สร้างการ์ดงาน",
      "kanban.card.update": "แก้ไขการ์ดงาน",
      "kanban.card.move": "ย้ายการ์ดงาน",
      "kanban.card.delete": "ลบการ์ดงาน",
      "kanban.card.comment": "เขียนความเห็นในการ์ด",
      "kanban.card.attach": "แนบไฟล์ในการ์ด",
      "kanban.label.manage": "จัดการป้ายกำกับ",
      "kanban.automation.manage": "ตั้งกฎอัตโนมัติของบอร์ด",
      "kanban.report.view": "ดูรายงานบอร์ดงาน",
      "kanban.template.manage": "จัดการเทมเพลตบอร์ด",
    },
  },
  {
    module: "meeting",
    label: "ห้องคุยภายใน",
    group: "work",
    actions: {
      "meeting.channel.create": "สร้างห้องคุย",
      "meeting.channel.delete": "ลบห้องคุย",
      "meeting.channel.invite": "ชวนคนเข้าห้อง",
      "meeting.channel.join": "เข้าห้องคุย",
      "meeting.channel.leave": "ออกจากห้องคุย",
      "meeting.message.post": "ส่งข้อความในห้องคุย",
      "meeting.message.edit": "แก้ข้อความของตัวเอง",
      "meeting.message.delete": "ลบข้อความ",
    },
  },
  {
    module: "kb",
    label: "คลังความรู้",
    group: "work",
    actions: {
      "kb.article.create": "เพิ่มบทความ",
      "kb.article.update": "แก้ไขบทความ",
    },
  },
  {
    module: "forms",
    label: "ฟอร์ม",
    group: "work",
    actions: {
      "forms.form.create": "สร้างฟอร์ม",
      "forms.form.update": "แก้ไขฟอร์ม",
    },
  },
  {
    module: "calendar",
    label: "ปฏิทินรวม",
    group: "work",
    actions: { "calendar.event.read": "ดูปฏิทินรวมของร้าน" },
  },
  {
    module: "reports",
    label: "รายงาน",
    group: "work",
    actions: {
      "reports.report.run": "ดู/รัน/ส่งออกรายงาน",
      "reports.report.save": "บันทึก/ลบนิยามรายงาน",
    },
  },
  {
    module: "dashboard",
    label: "หน้าแรก",
    group: "work",
    actions: { "dashboard.layout.update": "ปรับหน้าแรกของร้าน" },
  },
  {
    module: "pages",
    label: "หน้าเว็บของร้าน",
    group: "work",
    actions: { "pages.page.manage": "จัดการหน้าเว็บและ widget" },
  },
  {
    module: "ai",
    label: "ผู้ช่วย AI",
    group: "work",
    actions: {
      "ai.chat.send": "คุยกับผู้ช่วย AI (มีค่าใช้จ่ายต่อข้อความ)",
      "ai.schedule.create": "ตั้งงานประจำให้ผู้ช่วย AI",
    },
  },
  {
    module: "automation",
    label: "ระบบอัตโนมัติ",
    group: "work",
    actions: { "automation.rule.create": "สร้าง/แก้กฎอัตโนมัติ" },
  },
  {
    module: "settings",
    label: "ผู้ใช้งานและสิทธิ์",
    group: "admin",
    // ใหม่ในรอบนี้ — ด่านของหน้า /app/settings/staff เอง
    actions: {
      "settings.staff.read": "ดูรายชื่อผู้ใช้งานและสิทธิ์",
      "settings.staff.write": "ให้/แก้/ถอนสิทธิ์การเข้าใช้งานของคนอื่น",
    },
  },
  {
    module: "systems",
    label: "ทะเบียนระบบของร้าน",
    group: "admin",
    actions: {
      "systems.system.create": "เพิ่ม/เอาระบบออกจากร้าน",
      "systems.unit.update": "แก้ที่อยู่/แผนที่/ข้อมูลสาขา",
      "systems.link.create": "ผูกระบบเข้าด้วยกัน",
      "systems.link.delete": "ยกเลิกการผูกระบบ",
      "systems.reward.create": "เพิ่มของรางวัลในทะเบียน",
      "systems.reward.delete": "ลบของรางวัลในทะเบียน",
    },
  },
  {
    module: "system",
    label: "ทะเบียนระบบ (ผ่านผู้ช่วย AI)",
    group: "admin",
    // ⚠️ ของจริงในโค้ดเป็นแบบนี้: ปุ่มจริงใช้ `systems.system.create` (module "systems")
    //    แต่ข้อเสนอของผู้ช่วย AI (ai/proposals.ts KIND_ACCESS.open_system) ใช้ "system.system.create"
    //    (module "system") ⇒ คนละคีย์ ต้องให้ทั้งคู่ถึงจะทำได้ทั้งสองทาง — รายงานไว้แล้ว ไม่ดัดเงียบ ๆ
    actions: { "system.system.create": "เปิดระบบใหม่ผ่านข้อเสนอของผู้ช่วย AI" },
  },
  {
    module: "api",
    label: "API นักพัฒนา",
    group: "admin",
    actions: {
      "api.key.create": "ออกคีย์ API",
      "api.key.revoke": "เพิกถอนคีย์ API",
    },
  },
  {
    module: "webhook",
    label: "Webhook",
    group: "admin",
    actions: {
      "webhook.endpoint.create": "เพิ่มปลายทาง webhook",
      "webhook.endpoint.update": "แก้ไขปลายทาง webhook",
      "webhook.endpoint.delete": "ลบปลายทาง webhook",
    },
  },
  {
    module: "branding",
    label: "หน้าตาแบรนด์",
    group: "admin",
    actions: { "branding.setting.update": "แก้โลโก้/สี/ชื่อที่แสดง" },
  },
  {
    module: "marketplace",
    label: "ตลาดเทมเพลต",
    group: "admin",
    actions: { "marketplace.template.install": "ติดตั้งเทมเพลตลงร้าน" },
  },
] as const;

/** ค่าตัวเลขของสิทธิ์ — อ่านผ่าน `permissionValue()` ใน core/rbac.ts */
// วันนี้มีตัวเดียวที่โค้ดจริงอ่าน: account/expense-actions.ts:323
// (`_maxDiscountBp` ที่เขียนไว้ในคอมเมนต์ของ rbac.ts เป็นแค่ตัวอย่าง ไม่มีโค้ดไหนอ่าน — ไม่ใส่)
export const PERMISSION_PARAMS: readonly PermissionParamDef[] = [
  {
    key: "_maxApproveSatang",
    module: "account",
    label: "วงเงินอนุมัติค่าใช้จ่ายสูงสุด",
    group: "back",
    unit: "บาท",
    factor: 100, // เก็บเป็นสตางค์ (ดู account/expense-actions.ts:323)
    hint: "ไม่กรอก = ไม่จำกัดวงเงิน",
  },
] as const;

/** ค่าที่เก็บใน DB → ค่าที่โชว์ให้คนกรอก */
export function permissionParamToInput(def: PermissionParamDef, stored: number): number {
  return stored / (def.factor ?? 1);
}

/** ค่าที่คนกรอก → ค่าที่เก็บใน DB */
export function permissionParamToStored(def: PermissionParamDef, input: number): number {
  return Math.round(input * (def.factor ?? 1));
}

export function permissionParam(key: string): PermissionParamDef | undefined {
  return PERMISSION_PARAMS.find((p) => p.key === key);
}

// ─────────────────────────────────────────────────────────────────────────────
// ดัชนีที่คำนวณจากทะเบียน — ห้ามพิมพ์ซ้ำที่อื่น
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS: readonly PermissionDef[] = MODULE_DEFS.flatMap((m) =>
  Object.entries(m.actions).map(([key, label]) => ({
    key,
    module: m.module,
    label,
    group: m.group,
    ...(m.planned?.includes(key) ? { planned: true as const } : {}),
  })),
);

export type PermissionModuleView = {
  module: string;
  label: string;
  group: PermissionGroupKey;
  /** คีย์ wildcard ของโมดูลนี้ (`<module>.*`) — ติ๊กแล้วได้ทุก action ในโมดูล */
  wildcardKey: string;
  actions: readonly PermissionDef[];
  params: readonly PermissionParamDef[];
};

/** โมดูลทั้งหมดพร้อม action ในนั้น — รูปที่หน้าจอใช้วาดได้ตรง ๆ */
export const PERMISSION_MODULES: readonly PermissionModuleView[] = MODULE_DEFS.map((m) => ({
  module: m.module,
  label: m.label,
  group: m.group,
  wildcardKey: `${m.module}.*`,
  actions: PERMISSIONS.filter((p) => p.module === m.module),
  params: PERMISSION_PARAMS.filter((p) => p.module === m.module),
}));

const BY_KEY = new Map<string, PermissionDef>(PERMISSIONS.map((p) => [p.key, p]));
const PARAM_BY_KEY = new Map<string, PermissionParamDef>(PERMISSION_PARAMS.map((p) => [p.key, p]));
const WILDCARDS = new Map<string, string>(MODULE_DEFS.map((m) => [`${m.module}.*`, m.module]));
const MODULE_LABELS = new Map<string, string>(MODULE_DEFS.map((m) => [m.module, m.label]));

/** ชุดคีย์ที่ยอมให้เขียนลง `Membership.permissions` ได้ (action + wildcard) */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set([
  ...PERMISSIONS.map((p) => p.key),
  ...WILDCARDS.keys(),
]);

/** คีย์นี้เป็นสิทธิ์แบบติ๊กถูก/ผิด ที่ทะเบียนรู้จักไหม (รวม `<module>.*`) */
export function isPermissionKey(key: string): boolean {
  return BY_KEY.has(key) || WILDCARDS.has(key);
}

/** คีย์นี้เป็นค่าตัวเลขของสิทธิ์ที่ทะเบียนรู้จักไหม */
export function isPermissionParamKey(key: string): boolean {
  return PARAM_BY_KEY.has(key);
}

/** โมดูลของคีย์ — ใช้ประกอบ `AccessQuery` ตอนตรวจการยกระดับสิทธิ์ (มิติที่ 3 ของ RBAC) */
export function moduleOfPermissionKey(key: string): string | undefined {
  return BY_KEY.get(key)?.module ?? WILDCARDS.get(key) ?? PARAM_BY_KEY.get(key)?.module;
}

/** คำอธิบายไทยของคีย์ — ไม่รู้จักก็ยังคืนคีย์ดิบ (ไม่ทำหน้าจอว่าง) */
export function permissionLabel(key: string): string {
  const wildcardModule = WILDCARDS.get(key);
  if (wildcardModule) return `ทุกอย่างในระบบ${MODULE_LABELS.get(wildcardModule) ?? wildcardModule}`;
  return BY_KEY.get(key)?.label ?? PARAM_BY_KEY.get(key)?.label ?? key;
}

/** ทะเบียนจัดกลุ่มสำหรับหน้าจอ — เรียงตาม PERMISSION_GROUPS */
export function permissionModulesByGroup(): {
  group: PermissionGroupKey;
  label: string;
  modules: readonly PermissionModuleView[];
}[] {
  return PERMISSION_GROUPS.map((g) => ({
    group: g.key,
    label: g.label,
    modules: PERMISSION_MODULES.filter((m) => m.group === g.key),
  })).filter((g) => g.modules.length > 0);
}
