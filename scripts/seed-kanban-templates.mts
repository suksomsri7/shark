// seed-kanban-templates.mts — 6 เทมเพลตแพลตฟอร์มของ "บอร์ดงาน" (K1.12 · KANBAN-RUN §K1.12)
//
// idempotent: upsert ด้วย key เอง (หาก่อนแล้วค่อยเขียน — ตารางนี้ไม่มี `@@unique` ที่ Prisma รู้จัก
// unique จริงเป็น partial index ในไมเกรชัน SQL ดู prisma/schema/kanban.prisma) รันซ้ำได้ผลเท่าเดิม
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/seed-kanban-templates.mts             (ใช้ .env.qc · มีด่านกัน prod)
//   PROD :  ALLOW_PROD_SEED=1 pnpm exec tsx scripts/seed-kanban-templates.mts
//           (โหลด .env = production · ต้องจงใจตั้งตัวแปรเอง)

import { existsSync } from "node:fs";

// ── env: QC เป็นค่าเริ่มต้น · prod ต้องจงใจ (แพตเทิร์นเดียวกับ backfill-kanban-v2-a.mts) ──
const ALLOW_PROD = process.env.ALLOW_PROD_SEED === "1";
if (ALLOW_PROD) {
  try {
    process.loadEnvFile(process.env.SEED_ENV_FILE ?? ".env");
  } catch {
    /* env ถูก export มาแล้วก็ได้ */
  }
  console.warn("⚠️  ALLOW_PROD_SEED=1 — กำลังรันบนฐานข้อมูลจริงตามที่สั่ง");
} else if (existsSync(".env.qc") || (process.env.DATABASE_URL && process.env.DIRECT_URL)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
  const { host } = accEnv.loadQcEnv();
  console.log(`[env] seed-kanban-templates · DB ${host}`);
} else {
  console.error(
    "🔴 หยุด! ไม่พบ .env.qc และ env ก็ไม่มี DATABASE_URL+DIRECT_URL\n" +
      "   ถ้าจะรันกับฐานข้อมูลจริง ต้องตั้ง ALLOW_PROD_SEED=1 มาเอง",
  );
  process.exit(1);
}

const { prisma } = await import("@/lib/core/db");

type ColumnSpec = { name: string; isDone?: boolean };
type LabelSpec = { name: string; color: string };
type CardSpec = { title: string; column: string; description?: string; labels?: string[]; checklist?: string[] };
type Structure = { columns: ColumnSpec[]; labels: LabelSpec[]; cards: CardSpec[] };
type TemplateSeed = { key: string; name: string; description: string; icon: string; structure: Structure };

// ───────────────────────── 6 เทมเพลตธุรกิจไทย (พิมพ์เขียว 13-kanban-v2 §10) ─────────────────────────

const TEMPLATES: TemplateSeed[] = [
  {
    key: "dive-shop",
    name: "ร้านดำน้ำ/ทัวร์ทางน้ำ",
    description: "งานประจำวันของร้านดำน้ำ/ผู้จัดทริปทางน้ำ — ตั้งแต่งานเข้าจากแชทลูกค้าไปจนถึงซ่อมบำรุงอุปกรณ์หลังทริป",
    icon: "shop",
    structure: {
      columns: [{ name: "กล่องงานเข้า" }, { name: "รอทำ" }, { name: "กำลังทำ" }, { name: "รอตรวจ" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "ด่วน", color: "RED" },
        { name: "งานขาย", color: "BLUE" },
        { name: "ซ่อมบำรุง", color: "AMBER" },
        { name: "ลูกค้า", color: "PURPLE" },
        { name: "เอกสาร", color: "SLATE" },
        { name: "ทีมงาน", color: "GREEN" },
      ],
      cards: [
        {
          title: "ตอบลูกค้าที่ค้างในแชท",
          column: "กล่องงานเข้า",
          description: "ลูกค้าถามคิวทริปดำน้ำผ่านแชท — ตอบก่อนหมดเวลาทำการ",
          labels: ["ลูกค้า", "ด่วน"],
        },
        {
          title: "เติมถังอากาศก่อนทริปพรุ่งนี้",
          column: "รอทำ",
          labels: ["ซ่อมบำรุง"],
          checklist: ["นับถังคงเหลือ", "เช็คแรงดันทุกถัง", "บันทึกรอบเติมล่าสุด"],
        },
        { title: "ต่อทะเบียนเรือประจำปี", column: "รอทำ", labels: ["เอกสาร"] },
        {
          title: "ทำใบเสนอราคาทริปกลุ่มบริษัท",
          column: "กำลังทำ",
          labels: ["งานขาย"],
          checklist: ["เช็ควันว่างเรือ", "ขอเลขผู้เสียภาษีลูกค้า", "คำนวณต้นทุน+กำไร", "ส่งใบเสนอราคาให้ลูกค้า"],
        },
        { title: "นัดสัมภาษณ์ไกด์ดำน้ำคนใหม่", column: "กำลังทำ", labels: ["ทีมงาน"] },
        { title: "ตรวจอุปกรณ์หลังทริปกลับมา", column: "รอตรวจ", labels: ["ซ่อมบำรุง"] },
      ],
    },
  },
  {
    key: "hotel",
    name: "โรงแรม/ที่พัก",
    description: "งานแม่บ้าน + ซ่อมบำรุงของโรงแรม/ที่พัก — จากแจ้งเข้าไปจนถึงตรวจรับงานเสร็จ",
    icon: "home",
    structure: {
      columns: [{ name: "แจ้งเข้า" }, { name: "กำลังทำ" }, { name: "รออะไหล่" }, { name: "ตรวจรับ" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "ด่วน", color: "RED" },
        { name: "ห้องพัก", color: "BLUE" },
        { name: "ส่วนกลาง", color: "GREEN" },
        { name: "ซัพพลาย", color: "AMBER" },
        { name: "ร้องเรียน", color: "PURPLE" },
      ],
      cards: [
        {
          title: "แอร์ห้อง 301 ไม่เย็น",
          column: "แจ้งเข้า",
          labels: ["ห้องพัก", "ด่วน"],
          checklist: ["ตรวจสอบหน้างาน", "แจ้งช่างแอร์", "ทดสอบหลังซ่อม", "แจ้งแขกว่าซ่อมเสร็จ"],
        },
        { title: "เคสร้องเรียนเสียงดังจากห้องข้างเคียง", column: "แจ้งเข้า", labels: ["ร้องเรียน", "ด่วน"] },
        { title: "เติมของใช้ในห้องพักชั้น 2", column: "กำลังทำ", labels: ["ซัพพลาย"] },
        { title: "รออะไหล่ก๊อกน้ำห้อง 512", column: "รออะไหล่", labels: ["ห้องพัก"] },
        {
          title: "ตรวจสระว่ายน้ำประจำสัปดาห์",
          column: "ตรวจรับ",
          labels: ["ส่วนกลาง"],
          checklist: ["วัดค่าคลอรีน", "ทำความสะอาดขอบสระ", "บันทึกผลตรวจ"],
        },
      ],
    },
  },
  {
    key: "restaurant",
    name: "ร้านอาหาร",
    description: "งานประจำวันของร้านอาหาร — เตรียมร้าน ระหว่างวัน จนถึงปิดยอดสิ้นวัน",
    icon: "flag",
    structure: {
      columns: [{ name: "เตรียมร้าน" }, { name: "ระหว่างวัน" }, { name: "ปัญหาที่ต้องแก้" }, { name: "ปิดร้าน" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "ครัว", color: "AMBER" },
        { name: "หน้าร้าน", color: "BLUE" },
        { name: "วัตถุดิบ", color: "GREEN" },
        { name: "ความสะอาด", color: "SLATE" },
        { name: "ด่วน", color: "RED" },
      ],
      cards: [
        {
          title: "เช็ควัตถุดิบก่อนเปิดร้าน",
          column: "เตรียมร้าน",
          labels: ["วัตถุดิบ"],
          checklist: ["เช็คของสด", "เช็คของแห้ง", "ทิ้งของหมดอายุ"],
        },
        { title: "สั่งของเข้าครัวรอบสัปดาห์", column: "เตรียมร้าน", labels: ["วัตถุดิบ"] },
        { title: "แก้เมนูขายดีที่ของหมด", column: "ปัญหาที่ต้องแก้", labels: ["หน้าร้าน", "ด่วน"] },
        { title: "ทำความสะอาดเครื่องดูดควัน", column: "ปิดร้าน", labels: ["ความสะอาด"] },
        {
          title: "ปิดยอดสิ้นวัน",
          column: "ปิดร้าน",
          labels: ["หน้าร้าน"],
          checklist: ["นับเงินสด", "สรุปยอดขาย", "ปิดระบบ POS"],
        },
      ],
    },
  },
  {
    key: "clinic",
    name: "คลินิก/สถานพยาบาล",
    description: "งานของคลินิก — นัดหมายวันนี้ เอกสาร ติดตามผลผู้ป่วย จนถึงเคลม/เบิก",
    icon: "check",
    structure: {
      columns: [{ name: "นัดหมายวันนี้" }, { name: "รอเอกสาร" }, { name: "ติดตามผล" }, { name: "เคลม/เบิก" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "ผู้ป่วย", color: "BLUE" },
        { name: "เอกสาร", color: "SLATE" },
        { name: "เวชภัณฑ์", color: "GREEN" },
        { name: "ด่วน", color: "RED" },
        { name: "เครื่องมือ", color: "AMBER" },
      ],
      cards: [
        { title: "แจ้งผลตรวจด่วนให้ผู้ป่วย", column: "นัดหมายวันนี้", labels: ["ผู้ป่วย", "ด่วน"] },
        {
          title: "สอบเทียบเครื่องมือแพทย์",
          column: "นัดหมายวันนี้",
          labels: ["เครื่องมือ"],
          checklist: ["นัดผู้ให้บริการสอบเทียบ", "เก็บใบรับรอง"],
        },
        { title: "เบิกเวชภัณฑ์ประจำเดือน", column: "รอเอกสาร", labels: ["เวชภัณฑ์"] },
        {
          title: "ติดตามผลผู้ป่วยหลังรักษา",
          column: "ติดตามผล",
          labels: ["ผู้ป่วย"],
          checklist: ["โทรติดตามอาการ", "บันทึกผล", "นัดครั้งถัดไป"],
        },
        { title: "ยื่นเอกสารเคลมประกันสุขภาพ", column: "เคลม/เบิก", labels: ["เอกสาร"] },
      ],
    },
  },
  {
    key: "retail",
    name: "ร้านค้าปลีก",
    description: "งานของร้านค้าปลีก — สต็อก หน้าร้าน โปรโมชัน และการเงินประจำวัน",
    icon: "box",
    structure: {
      columns: [{ name: "งานเข้า" }, { name: "กำลังทำ" }, { name: "รอของ/รออนุมัติ" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "สต็อก", color: "GREEN" },
        { name: "หน้าร้าน", color: "BLUE" },
        { name: "โปรโมชัน", color: "PURPLE" },
        { name: "การเงิน", color: "AMBER" },
        { name: "ด่วน", color: "RED" },
      ],
      cards: [
        { title: "จัดหน้าร้านตามโปรใหม่", column: "งานเข้า", labels: ["โปรโมชัน", "หน้าร้าน"] },
        {
          title: "นับสต็อกรอบเดือน",
          column: "กำลังทำ",
          labels: ["สต็อก"],
          checklist: ["แบ่งโซนนับ", "นับจริง", "กระทบยอดในระบบ", "ปรับยอดที่คลาดเคลื่อน"],
        },
        {
          title: "ตรวจยอดเงินสดปลายวัน",
          column: "กำลังทำ",
          labels: ["การเงิน"],
          checklist: ["นับเงินสด", "เทียบกับระบบ POS", "บันทึกส่วนต่าง"],
        },
        { title: "สั่งของเติมสินค้าขายดี", column: "รอของ/รออนุมัติ", labels: ["สต็อก"] },
      ],
    },
  },
  {
    key: "weekly",
    name: "งานประจำสัปดาห์ (ใช้ได้ทุกธุรกิจ)",
    description: "บอร์ดกลางสำหรับทีมเล็ก — ประชุม สรุปงาน และเคลียร์งานค้างประจำสัปดาห์",
    icon: "cal",
    structure: {
      columns: [{ name: "รอทำ" }, { name: "กำลังทำ" }, { name: "รอคนอื่น" }, { name: "เสร็จแล้ว", isDone: true }],
      labels: [
        { name: "ด่วน", color: "RED" },
        { name: "ประจำ", color: "SLATE" },
        { name: "ทีมงาน", color: "GREEN" },
        { name: "ลูกค้า", color: "BLUE" },
      ],
      cards: [
        {
          title: "ประชุมทีมประจำสัปดาห์",
          column: "รอทำ",
          labels: ["ประจำ"],
          checklist: ["รวบรวมวาระจากทุกคน", "ส่งสรุปการประชุม"],
        },
        { title: "ติดตามลูกค้าที่ค้างการตอบกลับ", column: "รอทำ", labels: ["ลูกค้า"] },
        { title: "สรุปยอดขายประจำสัปดาห์ให้เจ้าของ", column: "กำลังทำ", labels: ["ประจำ"] },
        { title: "เคลียร์งานค้างจากสัปดาห์ก่อน", column: "รอคนอื่น", labels: ["ด่วน"] },
      ],
    },
  },
];

let created = 0;
let updated = 0;
for (const t of TEMPLATES) {
  const existing = await prisma.kanbanBoardTemplate.findFirst({ where: { scope: "PLATFORM", key: t.key } });
  if (existing) {
    await prisma.kanbanBoardTemplate.update({
      where: { id: existing.id },
      data: { name: t.name, description: t.description, icon: t.icon, structure: t.structure },
    });
    updated += 1;
  } else {
    await prisma.kanbanBoardTemplate.create({
      data: { tenantId: null, scope: "PLATFORM", key: t.key, name: t.name, description: t.description, icon: t.icon, structure: t.structure },
    });
    created += 1;
  }
}

console.log(`✅ seed เทมเพลตบอร์ดงาน: สร้างใหม่ ${created} · อัปเดต ${updated} (รวม ${TEMPLATES.length} ชุด)`);
await prisma.$disconnect();
