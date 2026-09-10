// identities.ts — "ผูกช่องทางเข้ากับสมาชิก **คนนี้**" (M1.11)
//
// `profile.linkIdentity` เป็นทางเข้าของ **ระบบภายนอก** ที่ยังไม่รู้ว่าคนที่ทักมาคือใคร: มันจับคู่เอง
// ด้วยกติกาตายตัว (เบอร์ → อีเมล → id ช่องทางที่เคยผูก) แล้วบอกว่าเจอใคร
//
// แต่หน้าจอ/REST มีอีกกรณีหนึ่งที่ต่างกันคนละเรื่อง: **คนสั่งรู้อยู่แล้วว่าจะผูกกับใคร**
// (`POST /members/{id}/identities`) ⇒ ต้องบังคับให้ลงที่สมาชิกคนนั้นจริง ๆ ไม่ใช่ปล่อยให้เดา
//
// วิธี: ยืนยันว่าเห็นสมาชิกคนนั้นก่อน (ไม่เห็น = 404) แล้วส่ง **เบอร์/อีเมลของเขาเอง** เป็นกุญแจจับคู่
// ⇒ ได้กติกาชนกันชุดเดียวกันฟรี (id ช่องทางนี้เป็นของอีกคนอยู่ = 409 พร้อมตั้งคู่ "อาจเป็นคนเดียวกัน")
// โดยไม่ต้องเขียนตรรกะซ้ำ และไม่มีทางลัดที่ข้ามด่านไปเขียนแถวเอง

import { prisma } from "./db";
import type { MemberActor } from "./access";
import { MemberInputError, MemberNotFoundError } from "./errors";
import { briefFor, linkIdentity, type LinkIdentityResult, type MemberCtx } from "./profile";

export type LinkToMemberInput = {
  channel: string;
  externalId: string;
  displayName?: string | null;
  verified?: boolean;
  /** ห้องแชทที่ควรถูกผูกกลับด้วย (ถ้าผู้เรียกเป็นกล่องแชท) */
  contactId?: string | null;
};

/** ผูก id ช่องทางภายนอกเข้ากับสมาชิกที่ระบุ — ชนกับคนอื่น = 409 (ไม่แย่งของใคร) */
export async function linkIdentityToMember(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  input: LinkToMemberInput,
): Promise<LinkIdentityResult> {
  const [brief] = await briefFor(ctx, actor, [customerId]);
  if (!brief) throw new MemberNotFoundError();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { phone: true, email: true },
  });
  if (!customer) throw new MemberNotFoundError();
  if (!customer.phone && !customer.email) {
    throw new MemberInputError(
      "สมาชิกคนนี้ยังไม่มีเบอร์หรืออีเมลในระบบ จึงยืนยันไม่ได้ว่าช่องทางที่จะผูกเป็นของเขาจริง — " +
        "เพิ่มเบอร์หรืออีเมลให้เขาก่อน แล้วค่อยผูกช่องทาง",
    );
  }

  const res = await linkIdentity(ctx, {
    channel: input.channel,
    externalId: input.externalId,
    phone: customer.phone,
    email: customer.email,
    displayName: input.displayName ?? null,
    contactId: input.contactId ?? null,
    ...(input.verified === undefined ? {} : { verified: input.verified }),
  });
  if (res.customerId && res.customerId !== customerId) {
    // เบอร์/อีเมลของคนนี้ดันไปตรงกับอีกคน (ข้อมูลซ้ำในระบบ) — ไม่เขียนทับ ให้ไปรวมคนซ้ำก่อน
    throw new MemberInputError("เบอร์หรืออีเมลของสมาชิกคนนี้ตรงกับสมาชิกอีกคนในระบบ — รวมคนซ้ำให้เรียบร้อยก่อนแล้วค่อยผูกช่องทาง");
  }
  return res;
}
