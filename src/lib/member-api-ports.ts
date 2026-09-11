// member-api-ports.ts — composition root ของ "ช่องเสียบ" ใน REST ระบบสมาชิก (M3.10)
//
// ทำไมอยู่นอก modules: op `campaigns.*` อยู่ในทะเบียน REST ของระบบสมาชิก แต่ตัวจริงของแคมเปญเป็นของ
// โมดูล marketing (M3.2) — ให้โมดูลสมาชิก import marketing ตรง = เส้น member→marketing ใหม่ใน fitness F2
// + วงจร marketing ⇄ member ตอนโหลดไฟล์ ⇒ ต่อสายที่นี่แทน (แบบเดียวกับ `member-hooks.ts` / `approval-effects.ts`)
//
// 🔴 `registerMemberApiPorts()` idempotent — ถูกเรียกจาก `campaign-port.ts` ครั้งแรกที่มี op แคมเปญถูกเรียก
// 🔴 ไฟล์นี้ห่อบาง ๆ: ตรรกะของแคมเปญทั้งหมดอยู่ที่ marketing · ที่นี่แปลงรูปขาเข้า/ctx อย่างเดียว
//    ยกเว้น `testSend` (ส่งตัวอย่างหาอีเมลของคนที่ออกคีย์/คนกดยืนยัน — ไม่มี service ของ marketing ที่รับ id แคมเปญ)

import { prisma } from "@/lib/core/db";
import {
  cancelCampaign,
  campaignStats,
  createCampaignV2,
  getCampaign,
  listCampaignsV2,
  parseContent,
  previewCampaign,
  renderMessage,
  resolveCampaignCtx,
  sendCampaignV2,
  updateCampaignV2,
  type CampaignCtx,
  type SaveCampaignInput,
} from "@/lib/modules/marketing";
import {
  registerMemberCampaignPort,
  type CampaignPortCtx,
  type CampaignPortInput,
  type MemberActor,
} from "@/lib/modules/member";

let registered = false;

function toCtx(c: CampaignPortCtx, create: boolean): Promise<CampaignCtx> {
  return resolveCampaignCtx(c.tenantId, c.memberSystemId, c.actorUserId, { create });
}

/** ร้านที่ยังไม่มีระบบการตลาด = ยังไม่มีแคมเปญ (อ่าน) — ไม่สร้างระบบใหม่ให้เพียงเพราะมีคนเปิดดู */
function noSystem(ctx: CampaignCtx): boolean {
  return !ctx.systemId;
}

function asSaveInput(input: CampaignPortInput, base?: SaveCampaignInput): SaveCampaignInput {
  const pick = <K extends keyof CampaignPortInput>(k: K) => (Object.prototype.hasOwnProperty.call(input, k) ? input[k] : undefined);
  const segmentId = pick("segmentId");
  const definition = pick("definition");
  const out: SaveCampaignInput = {
    name: input.name ?? base?.name ?? "",
    segmentId: segmentId !== undefined ? segmentId : (base?.segmentId ?? null),
    definition: definition !== undefined ? definition : base?.definition,
    channels: input.channels ?? base?.channels ?? [],
    content: input.content ?? base?.content ?? {},
    variantB: pick("variantB") !== undefined ? input.variantB : base?.variantB,
    holdoutPct: input.holdoutPct ?? base?.holdoutPct ?? 0,
    attachVoucherTemplateId: pick("attachVoucherTemplateId") !== undefined ? input.attachVoucherTemplateId : (base?.attachVoucherTemplateId ?? null),
    couponCode: pick("couponCode") !== undefined ? input.couponCode : (base?.couponCode ?? null),
    scheduledAt: pick("scheduledAt") !== undefined ? input.scheduledAt : (base?.scheduledAt ?? null),
  };
  // ไม่ได้เลือกกลุ่มและไม่ได้ตั้งเงื่อนไข = สมาชิกทุกคนของระบบ (แคมเปญเกิดเป็นร่างเสมอ — ยังไม่ส่งใครจนกว่าจะสั่ง send)
  if (!out.segmentId && (out.definition === undefined || out.definition === null)) out.definition = { groups: [] };
  return out;
}

const mask = (email: string): string => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(3, name.length - 2))}@${domain}`;
};

export function registerMemberApiPorts(): void {
  if (registered) return;
  registered = true;

  registerMemberCampaignPort({
    async list(c, actor: MemberActor) {
      const ctx = await toCtx(c, false);
      if (noSystem(ctx)) return [];
      return listCampaignsV2(ctx, actor);
    },
    async get(c, actor, id) {
      return getCampaign(await toCtx(c, false), actor, id);
    },
    async create(c, actor, input) {
      return createCampaignV2(await toCtx(c, true), actor, asSaveInput(input));
    },
    async update(c, actor, id, input) {
      const ctx = await toCtx(c, false);
      const cur = await getCampaign(ctx, actor, id);
      const base: SaveCampaignInput = {
        name: cur.name,
        segmentId: cur.segmentId,
        channels: cur.channels,
        content: cur.content,
        variantB: cur.variantB ?? undefined,
        holdoutPct: cur.holdoutPct,
        attachVoucherTemplateId: cur.attachVoucherTemplateId,
        couponCode: cur.couponCode,
        scheduledAt: cur.scheduledAt ? cur.scheduledAt.toISOString() : null,
      };
      return updateCampaignV2(ctx, actor, id, asSaveInput(input, base));
    },
    async preview(c, actor, id) {
      return previewCampaign(await toCtx(c, false), actor, id);
    },
    async testSend(c, actor, id, input) {
      const ctx = await toCtx(c, false);
      const cur = await getCampaign(ctx, actor, id);
      const content = parseContent(cur.content);
      const vars = { ชื่อ: "สมชาย", ระดับ: "Gold", voucher: "V-TEST01", รหัสสมาชิก: "M000001" };
      const want = String(input.channel ?? "").toUpperCase();
      const channel = want === "LINE" || want === "SMS" || want === "PUSH" || want === "EMAIL" ? want : content.email ? "EMAIL" : (cur.channels[0] ?? "LINE");
      const body =
        channel === "EMAIL" ? content.email?.body ?? "" : channel === "SMS" ? content.sms ?? "" : channel === "PUSH" ? content.push?.body ?? "" : content.line ?? "";
      const subject = channel === "EMAIL" ? renderMessage(content.email?.subject ?? "", vars) : undefined;
      const preview = { channel, ...(subject ? { subject } : {}), body: renderMessage(body, vars) };
      // ส่งจริงได้ทางเดียวที่ปลอดภัย: อีเมลของ "คนที่อยู่เบื้องหลัง" (ผู้ออกคีย์/คนกดยืนยัน) — ไม่ส่งหาลูกค้าจริง
      const user = c.actorUserId ? await prisma.user.findUnique({ where: { id: c.actorUserId }, select: { email: true } }) : null;
      const to = user?.email ?? "";
      if (!to || !preview.body) {
        return {
          preview,
          sent: false,
          sentTo: null,
          note: !preview.body
            ? "แคมเปญนี้ยังไม่มีข้อความของช่องทางนี้ — ใส่ข้อความก่อนแล้วลองทดสอบใหม่"
            : "ส่งตัวอย่างได้เฉพาะทางอีเมลของผู้ออกคีย์ — บัญชีผู้ออกคีย์ยังไม่มีอีเมล จึงแสดงตัวอย่างข้อความให้ดูแทน",
        };
      }
      try {
        const { sendEmail } = await import("@/lib/core/email");
        await sendEmail(to, preview.subject ?? `ทดสอบข้อความแคมเปญ: ${cur.name}`, preview.body);
        return { preview, sent: true, sentTo: mask(to), note: null };
      } catch {
        return { preview, sent: false, sentTo: mask(to), note: "ส่งอีเมลตัวอย่างไม่สำเร็จในตอนนี้ — ตัวอย่างข้อความอยู่ด้านบน ลองใหม่อีกครั้งภายหลัง" };
      }
    },
    async send(c, actor, id) {
      return sendCampaignV2(await toCtx(c, false), actor, id);
    },
    async cancel(c, actor, id) {
      return cancelCampaign(await toCtx(c, false), actor, id);
    },
    async stats(c, actor, id) {
      return campaignStats(await toCtx(c, false), actor, id);
    },
  });
}
