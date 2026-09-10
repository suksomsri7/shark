// seed ชุดข้อมูล QC ของ RUN "ระบบสมาชิก v2" — ลบร้าน QC ทิ้งแล้วสร้างใหม่ทั้งก้อน (idempotent)
//
// ใช้:  pnpm exec tsx scripts/seed-member-qc.mts
// 🔴 โหลด `.env.qc` เท่านั้น (ผ่าน acc-v2-env.loadQcEnv) — `.env` = production
// 🔴 ตัวเลข/กติกาทั้งหมดเป็นสัญญาอยู่ที่ `scripts/member-qc-env.mts` (MQC) — แก้ที่นั่นที่เดียว
// 🔴 ข้อมูลทุกชิ้นเดินผ่าน service จริง เมื่อมี service (สมาชิก/บิล/นัด) — ยัดแถวตรงเฉพาะสิ่งที่ยังไม่มีเอนจิน
//    (ส่วน/ฟิลด์เทมเพลตดำน้ำ = M1.2 จะเปลี่ยนเป็น applyTemplate · ห้องแชท = ห้ามแตะ chat/**)
// 🔴 ท้ายสคริปต์ **รัน backfill ทั้ง 6 ตัว** กับร้านนี้ ⇒ ฐานข้อมูลอยู่ในสภาพ "หลัง backfill" ให้ทุกชุดข้อสอบถัดไป
//
// โครงตาม ledger/MEMBER-RUN.md §0 ข้อ 1 + พิมพ์เขียว docs/modules/06-member-v2.md §4

import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const mq = (await import("./member-qc-env.mts" as string)) as {
  MQC: Any;
  SYSTEM_FIELD_KEYS: readonly string[];
  dayFromToday: (n: number, h?: number) => Date;
};
const { MQC, dayFromToday } = mq;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const sys = await import("@/lib/modules/system/service");
const member = await import("@/lib/modules/member/service");
const pos = await import("@/lib/modules/pos/service");
const booking = await import("@/lib/modules/booking/service");
const { drainAll } = await import("@/lib/outbox-consumers");

const t0 = Date.now();

// ═══════════════════ 1. ลบร้านเดิม (ทุกตารางที่ผูก tenantId · เรียงลูกก่อนแม่) ═══════════════════
const old = await prisma.tenant.findFirst({ where: { slug: MQC.tenantSlug } });
if (old) {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ตารางอาจยังไม่มีในรอบนี้ / ไม่มีแถว */
    }
  };
  for (const m of [
    // ── ระบบสมาชิก v2 ──
    "memberFieldValueHistory", "memberFieldValue", "memberField", "memberSection",
    "memberConsent", "memberAddress", "memberAccessLog", "memberPrivacyRequest", "memberPrivacyPolicy",
    "memberSensitivePolicy", "memberSavedView", "memberTag", "memberChannelIdentity",
    "acquisitionLink", "memberAttribution", "memberTierHistory", "memberTierBenefit", "memberTierDef",
    "memberTierConfig", "memberActivity",
    // ── แต้ม / ขาย / จอง ──
    "pointLedger", "pointBalance", "pointSettings",
    "posPayment", "posSaleLine", "posSale", "posReceiptCounter",
    "appointment", "bookingStaffHours", "bookingStaff", "bookingService", "bookingHours", "bookingClosure",
    // ── แชท / CRM / บัญชี / HR / การตลาด ──
    "chatMessage", "chatConversationEvent", "chatConversationPref", "chatReadState", "chatConversation", "chatContact",
    "crmContact", "accountContact",
    "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
    "mktRecipient", "mktCampaign",
    // ── แกนกลาง ──
    "automationRun", "automationRule", "appNotification", "outboxEvent", "auditLog",
    "customer", "party", "partyMergeCandidate",
    "session", "membership", "appSystemUnit", "appSystem", "businessUnit",
  ]) {
    await d(() => P[m].deleteMany({ where: { tenantId: old.id } }));
  }
  await prisma.tenant.delete({ where: { id: old.id } });
}
// ผู้ใช้ QC (อีเมลคงที่ · รันซ้ำได้)
const emails: string[] = [MQC.ownerEmail, MQC.managerEmail, ...MQC.staff.map((s: Any) => s.email), MQC.noPermEmail];
await prisma.membership.deleteMany({ where: { user: { email: { in: emails } } } });
await prisma.user.deleteMany({ where: { email: { in: emails } } });

// ═══════════════════ 2. ร้าน + สาขา + ระบบ 8 ประเภท ═══════════════════
const tenant = await prisma.tenant.create({ data: { name: MQC.tenantName, slug: MQC.tenantSlug } });
const tenantId = tenant.id;
const units: Record<string, string> = {};
for (const u of MQC.units) {
  const row = await prisma.businessUnit.create({ data: { tenantId, type: "SHOP" as Any, name: u.name, slug: u.slug } });
  units[u.key] = row.id;
}
const SYSTEM_LABEL: Record<string, string> = {
  MEMBER: "สมาชิก", POINT: "แต้ม", REWARD: "รางวัล", COUPON: "คูปอง",
  POS: "ขายหน้าร้าน", BOOKING: "จองคิว", CHAT: "แชทลูกค้า", HR: "พนักงาน",
};
const systems: Record<string, string> = {};
for (const type of MQC.systems as string[]) {
  const s = await sys.createSystem(tenantId, type as Any, `${SYSTEM_LABEL[type] ?? type} · MB QC`);
  systems[type] = s.id;
  // ผูกทั้ง 2 สาขาเข้าทุกระบบ (สมาชิก/แต้ม/ขาย/จอง ใช้ร่วมสาขาเดียวกัน)
  for (const key of Object.keys(units)) await sys.linkUnit(tenantId, s.id, units[key]!);
}
const SYS = systems.MEMBER!;

// ═══════════════════ 3. คน 7 (owner · manager · staff 4 · ไม่มีสิทธิ์) ═══════════════════
// สิทธิ์ member พื้นฐานของพนักงาน — ธนา/พยาบาล/กะตะ ใช้ชุดนี้ · ปุ๊กได้การตลาด/รายงานเพิ่ม
const STAFF_PERMS: Record<string, boolean> = {
  "member.customer.read": true,
  "member.customer.create": true,
  "member.customer.update": true,
};
const MARKETING_PERMS: Record<string, boolean> = {
  ...STAFF_PERMS,
  "marketing.campaign.create": true,
  "marketing.campaign.send": true,
  "member.report.view": true,
};
async function mkUser(email: string, name: string, role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[], permissions: Record<string, boolean>) {
  const u = await prisma.user.create({ data: { email, name } });
  const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { userId: u.id, membershipId: m.id, name, email };
}
const owner = await mkUser(MQC.ownerEmail, MQC.ownerName, "OWNER", ["*"], {});
const manager = await mkUser(MQC.managerEmail, "ผู้จัดการป่าตอง (MB QC)", "MANAGER", [units.patong!], {});
const staff: Record<string, Awaited<ReturnType<typeof mkUser>>> = {};
for (const s of MQC.staff as Any[]) {
  const unitAccess = s.unit === "*" ? ["*"] : [units[s.unit]!];
  staff[s.key] = await mkUser(s.email, s.name, "STAFF", unitAccess, s.key === "pook" ? MARKETING_PERMS : STAFF_PERMS);
}
const noPerm = await mkUser(MQC.noPermEmail, "พนักงานไม่มีสิทธิ์สมาชิก (MB QC)", "STAFF", ["*"], {});

// ═══════════════════ 4. ทะเบียนพนักงาน HR (D17 — ตำแหน่ง/แผนกใช้ตั้ง policy อ่อนไหว) ═══════════════════
const nurseDef = (MQC.staff as Any[]).find((s) => s.key === "nurse");
const thanaDef = (MQC.staff as Any[]).find((s) => s.key === "thana");
const hrNurse = await P.hrEmployee.create({
  data: {
    tenantId, systemId: systems.HR!, name: nurseDef.name, email: nurseDef.email,
    position: nurseDef.hrPosition, department: nurseDef.hrDepartment,
    // 🔴 ผูกตั้งแต่ seed (ไม่รอ backfill) — ข้อสอบใช้คนนี้พิสูจน์ว่า backfill "ไม่ทับของที่ผูกไว้แล้ว"
    linkedUserId: staff.nurse!.userId,
  },
});
const hrThana = await P.hrEmployee.create({
  data: { tenantId, systemId: systems.HR!, name: thanaDef.name, email: thanaDef.email, position: "พนักงานขาย", department: "หน้าร้าน" },
});
const hrNoEmail = await P.hrEmployee.create({
  data: { tenantId, systemId: systems.HR!, name: "สมพร แม่บ้าน (MB QC)", position: "แม่บ้าน", department: "หน้าร้าน" },
});

// ═══════════════════ 5. เกณฑ์ระดับเดิม (MemberTierConfig) — ต้องมีก่อน backfill ═══════════════════
for (const [tier, minSpendSatang] of Object.entries(MQC.tierConfig as Record<string, number>)) {
  await P.memberTierConfig.create({ data: { tenantId, tier, label: tier === "SILVER" ? "เงิน" : tier === "GOLD" ? "ทอง" : "แพลทินัม", minSpendSatang } });
}

// ═══════════════════ 6. สมาชิก 60 คน ═══════════════════
// ชื่อไทย 60 ชุดไม่ซ้ำ = ชื่อจริง 12 × นามสกุล 5 (deterministic ตาม index)
const FIRST = ["ธนกร", "ศิริพร", "ณัฐวุฒิ", "พิมพ์ชนก", "อนุชา", "กมลวรรณ", "ปิยะพงษ์", "รัตนาภรณ์", "สุรศักดิ์", "จันทิมา", "วีระชัย", "อรอุมา"];
const LAST = ["ทองดี", "ศรีสุข", "แก้วมณี", "บุญมาก", "พงษ์พันธ์"];
const NICK = ["ต้น", "แนน", "บอย", "ฝ้าย", "โอ๊ต", "มิ้นท์", "เอ", "ปุ๋ย", "กอล์ฟ", "แพร", "บิ๊ก", "หนึ่ง", "เจี๊ยบ", "ตาล", "นก"];
const GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"];

const tierOf = (i: number) => (i <= 30 ? "MEMBER" : i <= 45 ? "SILVER" : i <= 55 ? "GOLD" : "PLATINUM");
const unitKeyOf = (i: number) => (i <= 40 ? "patong" : "kata");
// ยอดสะสมให้สอดคล้องเกณฑ์ของร้าน (MQC.tierConfig — สตางค์)
const spentOf = (i: number) => {
  if (i <= 30) return 20_000 * i; // < 1,000,000 = ยังเป็นสมาชิกธรรมดา
  if (i <= 45) return 1_000_000 + (i - 30) * 50_000;
  if (i <= 55) return 3_000_000 + (i - 45) * 200_000;
  return 10_000_000 + (i - 55) * 500_000;
};
// วันเกิด: index 1–12 = เดือนตุลาคม (ใช้ทดสอบ journey วันเกิด) · ที่เหลือกระจายเดือนอื่น
// 🔴 ข้อแย้ง (ดู ledger/wo-notes/member-M1.1.md): ข้อสอบนับช่วง 2026-10-01..2026-10-31 ⇒ ต้องเก็บ **ปี 2026**
//    ซึ่งเป็นวันเกิดในอนาคต · ที่ถูกควรเก็บปีเกิดจริงแล้วให้ข้อสอบนับ "เดือน 10 ปีใดก็ได้"
// index 1–12 = วันเกิดเดือน ต.ค. (ปีเกิดจริง 1985+i) — ใช้ทดสอบ journey วันเกิด · ข้อสอบนับ "เดือน 10 ปีใดก็ได้"
const birthOf = (i: number) => (i <= 12 ? new Date(Date.UTC(1985 + i, 9, i)) : new Date(Date.UTC(1980 + (i % 20), (i * 5) % 9, ((i * 3) % 27) + 1)));
const memberName = (i: number) => `${FIRST[(i - 1) % 12]} ${LAST[Math.floor((i - 1) / 12)]}`;

type MemberRow = { index: number; id: string; memberCode: string; partyId: string | null; phone: string; email: string | null; tier: string; unit: string };
const members: MemberRow[] = [];
for (let i = 1; i <= MQC.members.total; i += 1) {
  const c = await member.findOrCreate({
    tenantId,
    memberSystemId: SYS,
    phone: MQC.members.phoneOf(i),
    email: MQC.members.emailOf(i) ?? undefined,
    name: memberName(i),
    source: "STAFF",
  });
  members.push({ index: i, id: c.id, memberCode: c.memberCode!, partyId: c.partyId, phone: c.phone!, email: c.email, tier: tierOf(i), unit: unitKeyOf(i) });
}

// ═══════════════════ 7. บิล 120 ใบ (2 ใบ/คน · ป่าตอง 80 · กะตะ 40) ═══════════════════
// 🔴 เรียก createSale ภายใน tx ของเรา ⇒ ownsTx=false → ไม่ตัดสต็อก/ไม่ระบายคิวเอง
//    (เราตรึงวันที่บิลก่อน แล้วค่อยระบายคิวรวดเดียวท้ายสุด — แบบเดียวกับ seed-acc-v2-qc.mts)
const BILL_ITEMS = ["คอร์สดำน้ำ Open Water", "ทริปดำน้ำ 2 ไดฟ์", "เช่าอุปกรณ์ครบชุด", "เติมอากาศ 10 ถัง"];
let billCount = 0;
for (const m of members) {
  for (let n = 1; n <= 2; n += 1) {
    const amount = Math.max(50_000, Math.round(spentOf(m.index) / 2 / 100) * 100);
    const sale = await prisma.$transaction((tx) =>
      pos.createSale(
        {
          tenantId,
          unitId: units[m.unit]!,
          systemId: systems.POS!,
          pointSystemId: systems.POINT!,
          memberId: m.id,
          idempotencyKey: `mbqc-sale-${m.index}-${n}`,
          lines: [{ name: BILL_ITEMS[(m.index + n) % BILL_ITEMS.length]!, qty: 1, unitPriceSatang: amount }],
          payMethods: [{ type: "CASH" as Any, amountSatang: amount }],
        },
        tx,
      ),
    );
    // กระจายย้อนหลัง ≤ 365 วันจากวันอ้างอิงของชุดข้อมูล (deterministic)
    const at = dayFromToday(-(((m.index * 3 + n * 17) % 360) + 1), 14);
    await prisma.posSale.update({ where: { id: sale.saleId }, data: { paidAt: at, createdAt: at } });
    billCount += 1;
  }
}

// ═══════════════════ 8. นัด 40 รายการ ═══════════════════
const bookingStaffIds: Record<string, string[]> = {};
const bookingServiceIds: Record<string, string> = {};
for (const key of Object.keys(units)) {
  const unitId = units[key]!;
  for (let w = 0; w < 7; w += 1) {
    await prisma.bookingHours.create({ data: { tenantId, unitId, weekday: w, openMin: 540, closeMin: 1260, closed: false } });
  }
  const svc = await prisma.bookingService.create({
    data: { tenantId, unitId, name: "ทริปดำน้ำครึ่งวัน", durationMin: 60, priceSatang: 250_000, depositSatang: 50_000, bufferMin: 0 },
  });
  bookingServiceIds[key] = svc.id;
  bookingStaffIds[key] = [];
  for (const nm of ["ครูโอ๋", "ครูเบิร์ด"]) {
    const st = await prisma.bookingStaff.create({ data: { tenantId, unitId, name: `${nm} (${key})` } });
    bookingStaffIds[key]!.push(st.id);
  }
}
// วันที่ของ "นัดในอนาคต" ต้องนับจากเวลาจริงตอนรัน (service ปฏิเสธเวลาที่ผ่านไปแล้ว)
const dateStrFromNow = (plusDays: number) => {
  const d = new Date(Date.now() + 7 * 3600_000 + plusDays * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
let apptCount = 0;
const apptIds: string[] = [];
for (let k = 0; k < MQC.appointments.total; k += 1) {
  const key = k < 26 ? "patong" : "kata";
  const m = members[k % members.length]!;
  const res = (await booking.createAppointment({
    tenantId,
    unitId: units[key]!,
    serviceId: bookingServiceIds[key]!,
    staffId: bookingStaffIds[key]![k % 2]!,
    dateStr: dateStrFromNow(2 + Math.floor(k / 4)),
    startMin: 600 + (k % 4) * 90,
    customerName: memberName(m.index),
    customerPhone: m.phone,
    source: "STAFF",
    idempotencyKey: `mbqc-appt-${k}`,
  })) as Any;
  if (!res.ok) throw new Error(`สร้างนัดที่ ${k} ไม่สำเร็จ: ${res.reason}`);
  apptIds.push(res.id);
  apptCount += 1;
}
// ครึ่งแรกย้ายไปอดีต + ปิดงานแล้ว (ไทม์ไลน์ต้องมีทั้งนัดที่ผ่านมาแล้วและนัดที่ยังไม่ถึง)
for (let k = 0; k < 20; k += 1) {
  const start = dayFromToday(-(k + 5), 10);
  await prisma.appointment.update({
    where: { id: apptIds[k]! },
    data: { startAt: start, endAt: new Date(start.getTime() + 3600_000), status: "DONE" as Any },
  });
}

// ═══════════════════ 9. ห้องแชท 10 ห้อง (6 ห้องมีเบอร์ตรงสมาชิก 1–6) ═══════════════════
const chatSys = systems.CHAT!;
const convIds: string[] = [];
for (let n = 1; n <= MQC.chat.contactsWithPhone; n += 1) {
  const m = members[n - 1]!;
  const contact = await prisma.chatContact.create({
    data: {
      tenantId, systemId: chatSys, channel: "LINE" as Any,
      externalUserId: `U-mbqc-${String(n).padStart(2, "0")}`,
      displayName: memberName(n), phone: m.phone,
    },
  });
  const conv = await prisma.chatConversation.create({
    data: { tenantId, systemId: chatSys, channel: "LINE" as Any, contactId: contact.id, unitId: units.patong, lastMessagePreview: "สอบถามรอบทริปเสาร์นี้ครับ", lastMessageAt: dayFromToday(-n, 11) },
  });
  convIds.push(conv.id);
}
for (let n = 1; n <= MQC.chat.conversations - MQC.chat.contactsWithPhone; n += 1) {
  const contact = await prisma.chatContact.create({
    data: { tenantId, systemId: chatSys, channel: "WEBCHAT" as Any, externalUserId: `web-mbqc-${n}`, displayName: `ผู้เยี่ยมชมเว็บ ${n}` },
  });
  const conv = await prisma.chatConversation.create({
    data: { tenantId, systemId: chatSys, channel: "WEBCHAT" as Any, contactId: contact.id, lastMessagePreview: "ราคาคอร์สเท่าไรคะ", lastMessageAt: dayFromToday(-n, 15) },
  });
  convIds.push(conv.id);
}

// ═══════════════════ 10. เติมคอลัมน์ v2 ให้สมาชิก (ทำ**หลัง**บิล — createSale เขียนยอด/ระดับเอง) ═══════════════════
for (const m of members) {
  const i = m.index;
  const granted = i % 3 !== 0;
  await prisma.customer.update({
    where: { id: m.id },
    data: {
      firstName: FIRST[(i - 1) % 12]!,
      lastName: LAST[Math.floor((i - 1) / 12)]!,
      nickname: NICK[(i - 1) % NICK.length]!,
      titleTh: i % 2 === 0 ? "นางสาว" : "นาย",
      gender: GENDERS[(i - 1) % 4] as Any,
      birthDate: birthOf(i),
      nationality: "TH",
      homeUnitId: units[m.unit]!,
      tier: m.tier as Any,
      totalSpentSatang: spentOf(i),
      marketingConsent: granted,
      consentAt: granted ? dayFromToday(-(i % 90) - 1, 9) : null,
      createdAt: dayFromToday(-(1 + ((i * 7) % 400)), 9),
      lastActivityAt: dayFromToday(-(i % 30), 16),
    } as Any,
  });
}

// ═══════════════════ 11. ตัวตนช่องทาง LINE (index ≤ 30) ═══════════════════
for (let i = 1; i <= MQC.members.lineIdentityCount; i += 1) {
  const m = members[i - 1]!;
  await P.memberChannelIdentity.create({
    data: {
      tenantId, customerId: m.id, channel: "LINE",
      externalId: `U-mbqc-${String(i).padStart(2, "0")}`,
      displayName: memberName(i), verified: true, linkedBy: "CHANNEL_ID",
      linkedAt: dayFromToday(-(i % 60) - 1, 12),
    },
  });
}

// ═══════════════════ 12. ส่วน/ฟิลด์เทมเพลต "ดำน้ำ" + "สุขภาพ" ═══════════════════
// 🔴 ยัดแถวตรงเพราะเอนจินฟิลด์ยังไม่มี (มติ Fable ข้อ 4) — M1.2 จะเปลี่ยนมาใช้ applyTemplate
const secDive = await P.memberSection.create({
  data: { tenantId, systemId: SYS, key: "dive", label: "ข้อมูลดำน้ำ", description: "ใบรับรอง ประสบการณ์", columns: 2, sortOrder: 10, isSystem: false, sensitive: false },
});
const secHealth = await P.memberSection.create({
  data: { tenantId, systemId: SYS, key: "health", label: "สุขภาพ", description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์", columns: 1, sortOrder: 11, isSystem: false, sensitive: true },
});
const mkField = async (sectionId: string, f: Any) =>
  P.memberField.create({
    data: {
      tenantId, systemId: SYS, sectionId,
      key: f.key, label: f.label, type: f.type,
      options: f.options ?? null,
      required: false, unique: false,
      filterable: f.filterable ?? false, showInList: f.showInList ?? false, showOnCard: false,
      customerEditable: false, sensitive: f.sensitive ?? false, trackHistory: f.trackHistory ?? false,
      isSystem: false, systemKey: null, sortOrder: f.sortOrder,
    },
  });
const fCertLevel = await mkField(secDive.id, {
  key: "certLevel", label: "ระดับใบรับรอง", type: "SELECT", filterable: true, showInList: true, sortOrder: 1,
  options: { choices: [{ value: "Open Water", label: "Open Water" }, { value: "Advanced", label: "Advanced" }, { value: "Rescue", label: "Rescue" }, { value: "Divemaster", label: "Divemaster" }] },
});
const fCertAgency = await mkField(secDive.id, {
  key: "certAgency", label: "หน่วยงานที่ออกใบรับรอง", type: "SELECT", sortOrder: 2,
  options: { choices: [{ value: "PADI", label: "PADI" }, { value: "SSI", label: "SSI" }, { value: "NAUI", label: "NAUI" }, { value: "OTHER", label: "อื่น ๆ" }] },
});
const fCertNo = await mkField(secDive.id, { key: "certNo", label: "เลขที่ใบรับรอง", type: "TEXT", sortOrder: 3 });
const fDiveCount = await mkField(secDive.id, { key: "diveCount", label: "จำนวนไดฟ์สะสม", type: "NUMBER", sortOrder: 4, options: { unit: "ไดฟ์", decimals: 0, min: 0 } });
const fLastDiveAt = await mkField(secDive.id, { key: "lastDiveAt", label: "ไดฟ์ล่าสุด", type: "DATE", filterable: true, sortOrder: 5 });
const fConditions = await mkField(secHealth.id, { key: "conditions", label: "โรคประจำตัว", type: "LONG_TEXT", sensitive: true, trackHistory: true, sortOrder: 1 });
const fEmergency = await mkField(secHealth.id, { key: "emergencyContact", label: "ผู้ติดต่อฉุกเฉิน", type: "TEXT", sensitive: true, sortOrder: 2 });

const CERT_LEVELS = ["Open Water", "Advanced", "Rescue", "Divemaster"];
const CERT_AGENCIES = ["PADI", "SSI", "NAUI", "OTHER"];
const CONDITIONS = ["หอบหืดเล็กน้อย ควบคุมได้", "ภูมิแพ้อากาศ", "ความดันโลหิตสูง กินยาประจำ", "ไม่มีโรคประจำตัว"];
for (const m of members) {
  const i = m.index;
  if (i <= MQC.members.diveFieldsCount) {
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fCertLevel.id, valueOptions: [CERT_LEVELS[i % 4]!] } });
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fCertAgency.id, valueOptions: [CERT_AGENCIES[i % 4]!] } });
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fCertNo.id, valueText: `MBQC-CERT-${String(i).padStart(3, "0")}` } });
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fDiveCount.id, valueNumber: 5 + i * 3 } });
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fLastDiveAt.id, valueDate: dayFromToday(-(i * 4) - 1, 10) } });
  }
  if (i <= MQC.members.healthFieldsCount) {
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fConditions.id, valueText: CONDITIONS[i % 4]! } });
    await P.memberFieldValue.create({ data: { tenantId, customerId: m.id, fieldId: fEmergency.id, valueText: `${NICK[(i + 3) % NICK.length]} ${MQC.members.phoneOf(((i + 20) % 60) + 1)}` } });
  }
}

// ═══════════════════ 13. ระบายคิว outbox จนเงียบ (บทเรียน: หยิบ 50 แล้วเลิก = คิวตันทั้งระบบ) ═══════════════════
{
  let rounds = 0;
  for (;;) {
    const { processed } = await drainAll();
    rounds += 1;
    if (processed === 0) break;
    if (rounds > 80) throw new Error("❌ ระบายคิว outbox ไม่จบใน 80 รอบ");
  }
}

// ═══════════════════ 14. รัน backfill ทั้ง 6 ตัวกับร้านนี้ ═══════════════════
// ⇒ ฐานข้อมูลอยู่ในสภาพ "หลัง backfill" (มี TierDef/ฟิลด์ระบบ/ยินยอม/Party/ที่มา/ผูก HR) ให้ทุกชุดข้อสอบถัดไป
const BACKFILL = [
  "member-backfill-tiers.mts", "member-backfill-fields.mts", "member-backfill-consent.mts",
  "member-backfill-party-links.mts", "member-backfill-attribution.mts", "member-backfill-hr-users.mts",
];
for (const script of BACKFILL) {
  const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}`, "--tenant", MQC.tenantSlug], { encoding: "utf8", env: process.env, timeout: 600_000 });
  if (r.status !== 0) {
    console.error(`${r.stdout ?? ""}\n${r.stderr ?? ""}`);
    throw new Error(`❌ backfill ${script} ล้มเหลว (exit ${r.status})`);
  }
  const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("BACKFILL_SUMMARY"));
  console.log(`  ↳ ${script} · ${line?.slice("BACKFILL_SUMMARY ".length) ?? "ok"}`);
}

// ═══════════════════ 15. เฉลย ═══════════════════
const tierDefRows = (await P.memberTierDef.findMany({ where: { systemId: SYS }, select: { id: true, key: true } })) as { id: string; key: string }[];
const tierDefs: Record<string, string> = {};
for (const r of tierDefRows) tierDefs[r.key] = r.id;

// อ่านค่าสุดท้ายจาก DB (partyId/tierDefId ถูกเติมโดย backfill)
const finalMembers = (await prisma.customer.findMany({
  where: { tenantId, memberSystemId: SYS },
  select: { id: true, memberCode: true, partyId: true, phone: true, email: true, tier: true, tierDefId: true },
})) as Any[];
const byId = new Map(finalMembers.map((c) => [c.id, c]));

const expected = {
  _readme: "เฉลยของชุดข้อมูล QC ระบบสมาชิก v2 — เขียนโดย scripts/seed-member-qc.mts ทุกครั้งที่ seed",
  generatedAt: new Date().toISOString(),
  today: MQC.today,
  oracleValidUntil: MQC.oracleValidUntil,
  tenantId,
  systemId: SYS,
  systems,
  units,
  users: { owner, manager, staff, noPerm },
  hrEmployees: { nurse: hrNurse.id, thana: hrThana.id, noEmail: hrNoEmail.id },
  tierDefs,
  fields: {
    dive: { section: secDive.id, certLevel: fCertLevel.id, certAgency: fCertAgency.id, certNo: fCertNo.id, diveCount: fDiveCount.id, lastDiveAt: fLastDiveAt.id },
    health: { section: secHealth.id, conditions: fConditions.id, emergencyContact: fEmergency.id },
  },
  members: members.map((m) => {
    const c = byId.get(m.id);
    return { index: m.index, id: m.id, memberCode: c?.memberCode ?? m.memberCode, partyId: c?.partyId ?? m.partyId, phone: m.phone, email: m.email, tier: m.tier, unit: m.unit, tierDefId: c?.tierDefId ?? null };
  }),
  counts: {
    members: members.length,
    byTier: MQC.members.byTier,
    byUnit: MQC.members.byUnit,
    bills: billCount,
    appointments: apptCount,
    conversations: convIds.length,
    lineIdentities: MQC.members.lineIdentityCount,
    consentGranted: MQC.members.consentCount,
    diveFieldValues: MQC.members.diveFieldsCount,
    healthFieldValues: MQC.members.healthFieldsCount,
  },
};
writeFileSync(MQC.expectedPath, JSON.stringify(expected, null, 2));

console.log(
  `\n✅ seed ระบบสมาชิก: ร้าน ${tenantId} · ระบบ ${Object.keys(systems).length} ประเภท · สมาชิก ${members.length} · ` +
    `บิล ${billCount} · นัด ${apptCount} · ห้องแชท ${convIds.length} · เฉลย ${MQC.expectedPath} · ใช้เวลา ${Math.round((Date.now() - t0) / 1000)} วิ`,
);
await prisma.$disconnect();
