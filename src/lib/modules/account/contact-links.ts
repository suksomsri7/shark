// contact-links.ts — บล็อก "เชื่อมกับ" ของ modal ผู้ติดต่อ (WO 3.3 · DESIGN-SPEC-V2 §7.2 · ภาพ g5)
//
// หน้าที่: เดาว่า "ผู้ติดต่อบัญชีรายนี้" กับ "สมาชิก/ผู้ติดต่อ CRM" เป็นคนเดียวกันไหม (จาก phoneNorm /
// อีเมล / partyId ที่รู้แล้ว) แล้วให้ผู้ใช้กด "ใช่ คนเดียวกัน" → ทั้งสองแถวชี้ Party เดียวกัน
//
// กติกา:
//   1) ข้ามโมดูลผ่าน service ที่อนุมัติแล้วเท่านั้น (account→member, account→crm ใน fitness.mts)
//      **การเขียน** Customer/CrmContact ทำผ่าน `setCustomerPartyId`/`setContactPartyId` ของโมดูลนั้น
//      (ที่นี่ไม่แตะตารางของคนอื่นตรง ๆ)
//   2) 🔴 **แชท**: ยังไม่มีเส้น account→chat ใน allowlist และใบสั่งงานห้ามแตะ `chat/**`
//      ⇒ ช่อง "แชท" ใน modal เป็น placeholder "ยังไม่เชื่อม" ตรงตามที่ g5 วาดไว้เป๊ะ
//      งานจริงคือให้ session แชทเซ็ต `ChatContact.partyId` ตอน maybeAutoLinkMember
//      (จดไว้ใน ledger/ACCOUNT-V2-RUN.md "ของที่ต้องส่งต่อ session อื่น" ตั้งแต่ WO 3.1)
//   3) ไม่ log ข้อมูลลูกค้า

import { tenantDb } from "@/lib/core/db";
import * as party from "@/lib/modules/party";
import * as memberSvc from "@/lib/modules/member/service";
import * as crmSvc from "@/lib/modules/crm/service";
import { findLinkedSystemIds, normalizePhoneTh } from "./service";

export type Ctx = { tenantId: string; systemId: string };

export type LinkSuggestion = {
  system: "member" | "crm";
  id: string;
  /** ป้ายหลักบนการ์ด — "สมาชิก #M-00231" / "ดีล CRM: คุณสมชาย ใจดี" */
  label: string;
  /** เหตุที่ระบบเดาว่าใช่ — "เบอร์ตรงกัน" / "อีเมลตรงกัน" / "เชื่อมอยู่แล้ว" */
  reason: string;
  /** ผูก Party เดียวกับผู้ติดต่ออยู่แล้วหรือยัง (แล้ว = ไม่ต้องโชว์ปุ่ม "ใช่ คนเดียวกัน") */
  linked: boolean;
  partyId: string | null;
};

export type LinkSuggestions = {
  member: LinkSuggestion[];
  crm: LinkSuggestion[];
  /** null เสมอในรอบนี้ — ดูเหตุผลข้อ 2 หัวไฟล์ (ไม่ใช่ "ไม่มีข้อมูล" แต่ "ยังไม่ได้ต่อสาย") */
  chat: null;
  /** ระบบสมาชิก/CRM ของร้านนี้เปิดใช้อยู่ไหม (ปิด = ไม่ต้องโชว์บล็อกนั้น) */
  available: { member: boolean; crm: boolean };
};

/** รูปแบบเบอร์ที่ยอมให้จับคู่ — ตารางอื่นเก็บเบอร์ดิบ (ไม่มี phoneNorm) จึงต้องลองหลายแบบ */
export function phoneVariants(phone: string | null | undefined): string[] {
  const raw = (phone ?? "").trim();
  if (!raw) return [];
  const norm = normalizePhoneTh(raw); // "08-1234-5678" → "0812345678"
  const digits = raw.replace(/\D/g, "");
  const out = new Set([raw, digits, norm].filter(Boolean));
  if (norm.startsWith("0")) out.add("+66" + norm.slice(1)); // เผื่อฝั่งนั้นเก็บเป็น +66…
  return [...out];
}

/**
 * ผลลัพธ์ที่ระบบเดาให้จาก phoneNorm/อีเมล/taxId (SPEC §7.2)
 * ≤ 4 query (systems 1 + member 1 + crm 1 + ผู้ติดต่อเอง 1) · ไม่ N+1
 */
export async function suggestLinks(
  ctx: Ctx,
  input: { phone?: string | null; email?: string | null; taxId?: string | null; partyId?: string | null },
): Promise<LinkSuggestions> {
  const { memberSystemId, crmSystemId } = await findLinkedSystemIds(ctx.tenantId);
  const keys = {
    phoneVariants: phoneVariants(input.phone),
    email: input.email ?? null,
    partyId: input.partyId ?? null,
  };
  const nothingToMatch = keys.phoneVariants.length === 0 && !keys.email && !keys.partyId;
  if (nothingToMatch) {
    return { member: [], crm: [], chat: null, available: { member: !!memberSystemId, crm: !!crmSystemId } };
  }

  const [customers, crmContacts] = await Promise.all([
    memberSystemId ? memberSvc.findCustomersForLink(ctx.tenantId, memberSystemId, keys) : Promise.resolve([]),
    crmSystemId ? crmSvc.findContactsForLink({ tenantId: ctx.tenantId, systemId: crmSystemId }, keys) : Promise.resolve([]),
  ]);

  const reasonOf = (row: { phone: string | null; email: string | null; partyId: string | null }): string => {
    if (input.partyId && row.partyId === input.partyId) return "เชื่อมอยู่แล้ว";
    const wanted = new Set(keys.phoneVariants);
    if (row.phone && wanted.has(row.phone.trim())) return "เบอร์ตรงกัน";
    if (row.phone && normalizePhoneTh(row.phone) && normalizePhoneTh(row.phone) === normalizePhoneTh(input.phone))
      return "เบอร์ตรงกัน";
    if (keys.email && row.email && row.email.toLowerCase() === keys.email.toLowerCase()) return "อีเมลตรงกัน";
    return "ข้อมูลใกล้เคียง";
  };

  return {
    member: customers.map((c) => ({
      system: "member" as const,
      id: c.id,
      label: `สมาชิก #${c.memberCode ?? c.id.slice(-6)}${c.name ? ` · ${c.name}` : ""}`,
      reason: reasonOf(c),
      linked: !!input.partyId && c.partyId === input.partyId,
      partyId: c.partyId,
    })),
    crm: crmContacts.map((c) => ({
      system: "crm" as const,
      id: c.id,
      label: `CRM · ${c.name}${c.company ? ` (${c.company})` : ""}`,
      reason: reasonOf(c),
      linked: !!input.partyId && c.partyId === input.partyId,
      partyId: c.partyId,
    })),
    chat: null,
    available: { member: !!memberSystemId, crm: !!crmSystemId },
  };
}

export type LinkResult = { ok: true; partyId: string } | { ok: false; reason: string };

/**
 * "ใช่ คนเดียวกัน" — ทำให้ AccountContact กับ Customer/CrmContact ชี้ Party เดียวกัน
 *
 * ลำดับ:
 *   1) ผู้ติดต่อบัญชีมี partyId แล้ว → ใช้ตัวนั้น (ตาม chain การรวมไปตัวปลายทางก่อน)
 *   2) ยังไม่มี → `party.findOrCreate` จากข้อมูลผู้ติดต่อ (ดูเหตุผลในตัวฟังก์ชัน)
 * จากนั้นเขียน partyId ให้ทั้ง 2 ฝั่งให้ตรงกัน · ฝั่งโน้นเขียนผ่าน facade ของโมดูลนั้น
 */
export async function linkContactTo(
  ctx: Ctx,
  input: { contactId: string; target: "member" | "crm"; targetId: string },
): Promise<LinkResult> {
  const db = tenantDb(ctx);
  const contact = await db.accountContact.findFirst({
    where: { id: input.contactId },
    select: { id: true, name: true, phone: true, email: true, taxId: true, branchCode: true, legalType: true, partyId: true },
  });
  if (!contact) return { ok: false, reason: "ไม่พบผู้ติดต่อรายนี้" };

  const { memberSystemId, crmSystemId } = await findLinkedSystemIds(ctx.tenantId);
  const targetSystemId = input.target === "member" ? memberSystemId : crmSystemId;
  if (!targetSystemId)
    return { ok: false, reason: input.target === "member" ? "ร้านนี้ยังไม่ได้เปิดระบบสมาชิก" : "ร้านนี้ยังไม่ได้เปิดระบบ CRM" };

  let partyId = contact.partyId ? await party.resolveCanonical(ctx.tenantId, contact.partyId) : null;
  if (!partyId) {
    // ผู้ติดต่อยังไม่มี Party → สร้าง/หาให้จากข้อมูลของตัวเอง
    // 🔴 ไม่ต้องไปอ่าน partyId ของฝั่งโน้นมาใช้: `party.findOrCreate` จับคู่ด้วยลำดับ taxId → เบอร์ →
    //    ชื่อ+อีเมล เหมือนกันเป๊ะกับที่ member/crm ใช้ตอนสร้างแถวของเขา ⇒ ข้อมูลชุดเดียวกันจะได้
    //    Party ตัวเดียวกันอยู่แล้ว (ถ้าไม่ตรง แปลว่าคนละคนจริง ๆ — การบังคับใช้ของฝั่งโน้นจะกลายเป็น
    //    การรวมคนละคนเข้าด้วยกันเงียบ ๆ ซึ่งเป็นบั๊กที่ WO 3.2 เพิ่งเจอมาแล้วกับเบอร์ซ้ำข้าม kind)
    const created = await party.findOrCreate(ctx.tenantId, {
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      taxId: contact.taxId,
      branchCode: contact.branchCode || undefined,
      kind: contact.legalType === "PERSON" ? "PERSON" : "COMPANY",
    });
    partyId = created.id;
  }

  const wrote =
    input.target === "member"
      ? await memberSvc.setCustomerPartyId(ctx.tenantId, targetSystemId, input.targetId, partyId)
      : await crmSvc.setContactPartyId({ tenantId: ctx.tenantId, systemId: targetSystemId }, input.targetId, partyId);
  if (!wrote) return { ok: false, reason: "ไม่พบรายการปลายทาง (อาจถูกลบไปแล้ว)" };

  if (contact.partyId !== partyId)
    await db.accountContact.updateMany({ where: { id: contact.id }, data: { partyId } });

  return { ok: true, partyId };
}
