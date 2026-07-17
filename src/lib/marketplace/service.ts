// Marketplace โครง (WO-0063) — เทมเพลตธุรกิจสำเร็จรูป "ติดตั้งคลิกเดียว"
//
// แนวคิด: เทมเพลต = DNA preset (ชุดข้อเท็จจริงของธุรกิจที่พบบ่อย) ไม่ใช่ "ชุดโมดูล"
//   ติดตั้ง = เดิน pipeline DNA เดิมทั้งดุ้น: saveDnaFacts → proposeBlueprint → applyBlueprint
//   (ระบบ/หน่วยธุรกิจจริงจึงเกิดจากข้อเท็จจริง ไม่ใช่ยัดโมดูลตรง ๆ — debug ย้อนได้ทุกเมนู)
//
// กันพัง:
//   - key ปลอม → throw
//   - tenant มี DnaProfile อยู่แล้ว → throw (กัน clobber ร้านที่ตั้งค่า/สัมภาษณ์เอง)
//     ครอบคลุมทั้ง "ติดตั้งซ้ำ key เดิม" และ "ติดตั้งเทมเพลตอื่นทับ"
//   - บันทึก TenantInstall (unique [tenantId,itemKey]) พร้อม blueprintId ที่ apply

import { tenantDb } from "@/lib/core/db";
import type { DnaFacts } from "@/lib/dna/schema";
import { ZDnaFacts } from "@/lib/dna/schema";
import { saveDnaFacts, proposeBlueprint, applyBlueprint } from "@/lib/dna/apply";

export type MarketplaceCtx = { tenantId: string };

type Template = {
  label: string; // ป้ายไทย
  description: string; // คำอธิบายไทย
  icon: string;
  facts: DnaFacts; // ต้อง valid ตาม ZDnaFacts
};

// ─────────────────── ทะเบียนเทมเพลต (registry ในโค้ด) ───────────────────
// facts เลือกตามลักษณะจริงของอุตสาหกรรม — validate ด้วย ZDnaFacts.parse ที่ท้ายไฟล์
export const TEMPLATES: Record<string, Template> = {
  // ร้านเสริมสวย: ลูกค้านัดหมายล่วงหน้า · สมาชิก+สะสมแต้ม+แลกของรางวัล · ไม่ได้ขายสินค้าหน้าร้าน
  salon: {
    label: "ร้านเสริมสวย / ทำผม",
    description: "รับลูกค้าแบบนัดหมายล่วงหน้า พร้อมระบบสมาชิกสะสมแต้มและแลกของรางวัล",
    icon: "💇",
    facts: {
      industryHint: "SALON",
      branchCount: 1,
      appointment: true,
      tables: false,
      rooms: false,
      walkinQueue: false,
      sellsGoods: false,
      membership: true,
      rewardRedeem: true,
      staffCount: 5,
      vatRegistered: false,
      wantsAccounting: true,
      usesLineOA: true,
    },
  },

  // ร้านอาหาร: มีโต๊ะ · มีบัตรคิวหน้าร้าน · ขาย/คิดเงินหน้าร้าน
  restaurant: {
    label: "ร้านอาหาร / คาเฟ่",
    description: "มีโต๊ะให้ลูกค้านั่ง จัดคิวหน้าร้าน และคิดเงินขายหน้าร้าน",
    icon: "🍜",
    facts: {
      industryHint: "RESTAURANT",
      branchCount: 1,
      appointment: false,
      tables: true,
      rooms: false,
      walkinQueue: true,
      sellsGoods: true,
      membership: false,
      rewardRedeem: false,
      staffCount: 8,
      vatRegistered: false,
      wantsAccounting: true,
      usesLineOA: true,
    },
  },

  // ร้านค้าปลีก: ขายสินค้า+สต็อก · สมาชิกสะสมแต้ม · มีเคาน์เตอร์คิดเงิน/บัตรคิวหน้าร้าน
  retail: {
    label: "ร้านค้าปลีก",
    description: "ขายสินค้าหน้าร้าน มีเคาน์เตอร์คิดเงิน พร้อมระบบสมาชิกสะสมแต้ม",
    icon: "🛍️",
    facts: {
      industryHint: "RETAIL",
      branchCount: 1,
      appointment: false,
      tables: false,
      rooms: false,
      walkinQueue: true,
      sellsGoods: true,
      membership: true,
      rewardRedeem: true,
      staffCount: 3,
      vatRegistered: true,
      wantsAccounting: true,
      usesLineOA: true,
    },
  },

  // ที่พัก: มีห้องพัก · รับจอง/นัดหมายเข้าพักล่วงหน้า · จด VAT + ต้องการบัญชี
  hotel: {
    label: "ที่พัก / โรงแรม",
    description: "มีห้องพักให้เข้าพัก รับจองล่วงหน้า พร้อมระบบบัญชีและออกเอกสาร",
    icon: "🏨",
    facts: {
      industryHint: "HOTEL",
      branchCount: 1,
      appointment: true,
      tables: false,
      rooms: true,
      walkinQueue: false,
      sellsGoods: false,
      membership: false,
      rewardRedeem: false,
      staffCount: 6,
      vatRegistered: true,
      wantsAccounting: true,
      usesLineOA: true,
    },
  },
};

// validate ทุกเทมเพลตตั้งแต่โหลดโมดูล — เทมเพลตพัง = fail-fast ไม่รอถึงตอนติดตั้ง
for (const [key, tpl] of Object.entries(TEMPLATES)) {
  const r = ZDnaFacts.safeParse(tpl.facts);
  if (!r.success) throw new Error(`เทมเพลต "${key}" มีข้อเท็จจริงไม่ถูกต้องตามสัญญา DNA`);
}

// ─────────────────── API ───────────────────

export function listTemplates(): { key: string; label: string; description: string; icon: string }[] {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    label: t.label,
    description: t.description,
    icon: t.icon,
  }));
}

export async function installTemplate(
  ctx: MarketplaceCtx,
  key: string,
): Promise<{ ok: true; blueprintId: string; results: unknown[] }> {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`ไม่พบเทมเพลต "${key}" ในตลาดเทมเพลต`);

  const db = tenantDb(ctx);

  // กัน clobber: ร้านที่ตั้งค่าธุรกิจไว้แล้ว (สัมภาษณ์เอง หรือเคยติดตั้งเทมเพลต) ห้ามทับ
  const existing = await db.dnaProfile.findFirst({ where: {} });
  if (existing) {
    throw new Error(
      "ร้านนี้ตั้งค่าธุรกิจไว้แล้ว จึงติดตั้งเทมเพลตทับไม่ได้ — หากต้องปรับ ให้แก้ผ่านการตั้งค่าธุรกิจโดยตรง",
    );
  }

  // เดิน pipeline DNA เดิมตรง ๆ (ฟังก์ชันเหล่านี้จัดการ prisma เอง)
  await saveDnaFacts(ctx.tenantId, tpl.facts);
  const { blueprintId } = await proposeBlueprint(ctx.tenantId);
  const { results } = await applyBlueprint(ctx.tenantId, blueprintId);

  // บันทึกว่าติดตั้งเทมเพลตนี้แล้ว (tenantId inject โดย tenantDb + ระบุตรง ๆ ให้ชัด)
  await db.tenantInstall.create({
    data: { tenantId: ctx.tenantId, itemKey: key, blueprintId },
  });

  return { ok: true, blueprintId, results };
}

export async function listInstalled(
  ctx: MarketplaceCtx,
): Promise<{ itemKey: string; blueprintId: string | null; installedAt: Date }[]> {
  const db = tenantDb(ctx);
  const rows = await db.tenantInstall.findMany({ orderBy: { installedAt: "desc" } });
  return rows.map((r) => ({ itemKey: r.itemKey, blueprintId: r.blueprintId, installedAt: r.installedAt }));
}
