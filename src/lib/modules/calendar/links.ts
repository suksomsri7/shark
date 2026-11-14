// links.ts — "ผูกกับ" ของเตือน/นัดส่วนตัว (CAL1.2 · สัญญา §4.5 · R-CAL-23)
//   ตรวจว่า actor **อ่าน** สิ่งที่ผูกได้ด้วยตัวกรองของแหล่งนั้น (ตอนสร้าง/แก้ + ทุกครั้งที่แสดง/ส่ง push) · อ่านไม่ได้ = ไม่มีใน Map
//   ไม่โยน: แหล่งไหนล้ม = ถือว่าอ่านไม่ได้ (ไม่เผยข้อมูล) · ไม่ log ชื่อ/เบอร์
//   อ่านผ่าน tenantDb ต่อระบบ (ไม่ใช้ prisma ดิบ · F5) · ตัวกรองสิทธิ์มาจาก facade ของแหล่ง (crm/index · member/index · kanban/access) แบบ dynamic import
import type { CalLinkType, SystemType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { maskPhone, satang } from "./push-msg";

export type LinkRef = { type: CalLinkType; id: string };
export type LinkInfo = {
  type: CalLinkType;
  id: string;
  systemId: string;
  /** ป้ายสั้นสำหรับการ์ด/แถว ("คุณเอก (CRM)") */
  label: string;
  /** เบอร์เต็ม (ตามที่บันทึก) — ใช้กับ "โทรเลย" เท่านั้น ห้ามใส่ใน push */
  phone: string | null;
  /** บรรทัด body ของ push (§7.1 · เบอร์ปิดแล้ว) */
  body: string;
};
type Who = { userId: string; tenantId: string; membership: MembershipCtx };

export const linkKey = (r: LinkRef) => `${r.type}:${r.id}`;

async function systemsOf(tenantId: string, type: SystemType): Promise<string[]> {
  const rows = await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type }, select: { id: true }, take: 20 });
  return rows.map((r) => r.id);
}

/** อ่านทุก ref ที่ actor อ่านได้ (ชุดเดียว · ต่อชนิดต่อระบบคิวรีเดียว) */
export async function resolveLinks(who: Who, refs: LinkRef[]): Promise<Map<string, LinkInfo>> {
  const out = new Map<string, LinkInfo>();
  const ids = (t: CalLinkType) => [...new Set(refs.filter((r) => r.type === t).map((r) => r.id))].slice(0, 200);
  const put = (i: LinkInfo) => out.set(linkKey(i), i);
  const tenantId = who.tenantId;

  const contactIds = ids("CRM_CONTACT");
  const dealIds = ids("CRM_DEAL");
  if (contactIds.length || dealIds.length) {
    try {
      const { contactWhere, dealWhere } = await import("@/lib/modules/crm");
      const { toMemberActor } = await import("@/lib/modules/member");
      const actor = toMemberActor(who.userId, who.membership);
      for (const systemId of await systemsOf(tenantId, "CRM")) {
        const db = tenantDb({ tenantId, systemId });
        if (contactIds.length) {
          const w = await contactWhere({ tenantId, systemId }, actor);
          const rows = await db.crmContact.findMany({ where: { AND: [w, { tenantId, systemId, id: { in: contactIds } }] }, select: { id: true, name: true, phone: true } });
          for (const c of rows) {
            const masked = maskPhone(c.phone);
            put({ type: "CRM_CONTACT", id: c.id, systemId, label: `${c.name} (CRM)`, phone: c.phone || null, body: masked ? `${c.name} · เบอร์ ${masked}` : c.name });
          }
        }
        if (dealIds.length) {
          const w = await dealWhere({ tenantId, systemId }, actor);
          const rows = await db.crmDeal.findMany({
            where: { AND: [w, { tenantId, systemId, id: { in: dealIds } }] },
            select: { id: true, title: true, valueSatang: true, contact: { select: { name: true, phone: true } } },
          });
          for (const d of rows) {
            const masked = maskPhone(d.contact?.phone);
            const parts = [d.title, d.valueSatang > 0 ? `มูลค่า ${satang(d.valueSatang)}` : "", masked ? `เบอร์ ${masked}` : ""].filter(Boolean);
            put({ type: "CRM_DEAL", id: d.id, systemId, label: `${d.contact?.name ? `${d.contact.name} (CRM) · ` : ""}${d.title}`, phone: d.contact?.phone || null, body: parts.join(" · ") });
          }
        }
      }
    } catch {
      /* CRM อ่านไม่ได้ = ไม่ผูก (ไม่เผย) */
    }
  }

  const docIds = ids("ACCOUNT_DOC");
  if (docIds.length) {
    try {
      const { membershipCan } = await import("@/lib/ai/tool-access");
      if (membershipCan(who.membership, { module: "account", action: "account.doc.view" }, who.userId)) {
        for (const systemId of await systemsOf(tenantId, "ACCOUNT")) {
          const rows = await tenantDb({ tenantId, systemId }).accountDocument.findMany({
            where: { tenantId, systemId, id: { in: docIds } },
            select: { id: true, docNo: true, grandTotal: true, paidTotal: true, dueDate: true, contactSnapshot: true, contact: { select: { name: true } } },
          });
          for (const d of rows) {
            const snap = (d.contactSnapshot as Record<string, unknown> | null) ?? null;
            const whoName = (typeof snap?.name === "string" ? snap.name : null) ?? d.contact?.name ?? "";
            const no = d.docNo ?? "ฉบับร่าง";
            const owe = d.grandTotal - d.paidTotal;
            const dd = d.dueDate ? new Date(+d.dueDate + 7 * 3_600_000) : null;
            const due = dd ? `ครบ ${dd.getUTCDate()}/${dd.getUTCMonth() + 1}` : "";
            put({ type: "ACCOUNT_DOC", id: d.id, systemId, label: whoName ? `${whoName} · ${no}` : no, phone: null, body: [no, owe > 0 ? `ค้าง ${satang(owe)}` : "", due].filter(Boolean).join(" · ") });
          }
        }
      }
    } catch {
      /* */
    }
  }

  const cardIds = ids("KANBAN_CARD");
  if (cardIds.length) {
    try {
      const { visibleBoardsWhere } = await import("@/lib/modules/kanban/access");
      const kActor = { userId: who.userId, role: who.membership.role, unitAccess: who.membership.unitAccess, permissions: who.membership.permissions };
      for (const systemId of await systemsOf(tenantId, "KANBAN")) {
        const rows = await tenantDb({ tenantId, systemId }).kanbanCard.findMany({
          where: { tenantId, systemId, id: { in: cardIds }, board: { AND: [visibleBoardsWhere(kActor), { tenantId, systemId }] } },
          select: { id: true, title: true, board: { select: { name: true } } },
        });
        for (const c of rows) put({ type: "KANBAN_CARD", id: c.id, systemId, label: `${c.title} (การ์ด)`, phone: null, body: `การ์ดในบอร์ด "${c.board.name}"` });
      }
    } catch {
      /* */
    }
  }
  return out;
}

export async function resolveLink(who: Who, ref: LinkRef): Promise<LinkInfo | null> {
  return (await resolveLinks(who, [ref])).get(linkKey(ref)) ?? null;
}
