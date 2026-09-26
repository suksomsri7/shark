// CrmPortalBlock.tsx — บล็อก "พอร์ทัลลูกค้า" ในบริษัท 360 (ใบ C3.5 · พิมพ์เขียว §3.4 แถบขวา "portal ใครเข้าได้") — คอมโพเนนต์ฝั่งเซิร์ฟเวอร์
// ใครเข้าได้ (บทบาท · สถานะ · เข้าล่าสุด) · เชิญ/ถอนสิทธิ์ · คำขอจากพอร์ทัลที่รอพิจารณา
// 🔴 อ่านผ่าน facade `crm.portal` (คีย์ `crm.portal.manage` — ไม่มีคีย์ = ไม่แสดงบล็อกเลย) · ไม่มี hash/token ในข้อมูลที่ส่งลงหน้า
// 🔴 server action มาทาง props จากหน้าในโฟลเดอร์ CRM (ด่าน F2.3 ห้ามคอมโพเนนต์ล้วงไฟล์ภายในของโมดูล)
import { crmCan, portal, portalDate, PORTAL_ROLE_LABEL, PORTAL_ROLES } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { CrmPortalAccessPanel, type PortalStaffActions } from "./CrmPortalAccessPanel";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "ใช้งาน", INVITED: "รอรับคำเชิญ (เข้าได้จนคำเชิญหมดอายุ)", EXPIRED: "ต้องเชิญใหม่ (คำเชิญหมดอายุหรือข้อมูลติดต่อเปลี่ยน)", REVOKED: "ถอนสิทธิ์แล้ว" };

export async function CrmPortalBlock(props: {
  ctx: { tenantId: string; systemId: string; actorUserId: string | null };
  actor: MemberActor;
  companyId: string;
  contacts: { id: string; name: string }[];
  actions: PortalStaffActions;
}) {
  if (!crmCan(props.actor, "crm.portal.manage")) return null;
  const [access, reqs] = await Promise.all([
    portal.listAccess(props.ctx, props.actor, { companyId: props.companyId }).catch(() => null),
    portal.listCompanyRequests(props.ctx, props.actor, { companyId: props.companyId }).catch(() => ({ items: [] })),
  ]);
  if (!access) return null;
  return (
    <section className="card flex flex-col gap-3 p-4" data-testid="crm-portal-block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">พอร์ทัลลูกค้า</h2>
        {!access.portalEnabled && (
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ยังไม่เปิดพอร์ทัล (ตั้งค่า › พอร์ทัลลูกค้า)
          </span>
        )}
      </div>
      <CrmPortalAccessPanel
        systemId={props.ctx.systemId}
        companyId={props.companyId}
        contacts={props.contacts}
        roles={PORTAL_ROLES.map((r) => ({ value: r, label: PORTAL_ROLE_LABEL[r] }))}
        rows={access.items.map((a) => ({
          id: a.id,
          contactName: a.contactName,
          roleLabel: PORTAL_ROLE_LABEL[a.role as keyof typeof PORTAL_ROLE_LABEL] ?? a.role,
          status: a.status,
          statusLabel: STATUS_LABEL[a.status] ?? a.status,
          lastLogin: a.lastLoginAt ? portalDate(a.lastLoginAt, true) : "",
        }))}
        requests={reqs.items
          .filter((r) => r.status === "PENDING")
          .slice(0, 10)
          .map((r) => ({ id: r.id, title: r.title || r.kindLabel, kindLabel: r.kindLabel, contactName: r.contactName, progressLabel: r.progressLabel, canDecide: !r.kanbanCardId, at: portalDate(r.createdAt) }))}
        actions={props.actions}
      />
    </section>
  );
}
