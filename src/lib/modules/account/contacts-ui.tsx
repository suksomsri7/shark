// contacts-ui.tsx — หน้าผู้ติดต่อ V2 (WO 3.2) — server component ประกอบ data layer (contacts-list.ts)
// อ้าง DESIGN-SPEC-V2 §7.1 · mockup f5-contacts.png + f5-contacts-menu.png · checklist เต็มใน wo-notes/3.2.md
//
// รอบแก้ 2 (Fable QC ภาพจริง) — เขียนใหม่ให้ตรง f5 เกือบทั้งหมด: การ์ดซ้ายเดียวรวมทุกส่วน + จุดนำหน้า +
// active = ขอบซ้ายฟ้า · แถวปุ่มหัว [เพิ่มเข้ากลุ่ม][นำเข้า][พิมพ์รายงาน][+เพิ่มผู้ติดต่อ] (ย้าย "ยอดนิยม" ไปซ้าย) ·
// แถวค้นหาอยู่บรรทัดเดียวกับ "กลุ่ม: … รายชื่อ" · เลขที่เป็นลิงก์สีฟ้า · เบอร์จัดขีดแบบไทย · ท้ายตารางมี
// "เลือกอยู่ N รายการ" ตลอดเวลา + ตัวเลือกจำนวนต่อหน้า — ดู ContactsPanel.tsx (client) สำหรับส่วน interactive
//
// ความต่างจากภาพจริงที่เหลือ (ตั้งใจ — ดูเหตุผลเต็มใน wo-notes/3.2.md):
//   1) แถวคลิก → หน้ารายละเอียดย่อ (อ่านอย่างเดียว) ไม่ใช่แผงเลื่อน 360° — TODO(WO 3.4)
//   2) dropdown ทำรายการ เพิ่ม "เพิ่มเข้ากลุ่ม" ต่อจาก "แก้ไขข้อมูล" (deliverable text ระบุชัด แม้ภาพตัวอย่างไม่มี)
//
// WO 3.3: ฟอร์ม inline เดิมถูกแทนด้วย `ContactModal` (§7.2 · ภาพ g5) — เปิดด้วย `?new=1` / `?edit=<id>`

import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTh } from "@/lib/ui/date";
import { RowActions, type RowActionItem } from "@/components/account-v2/RowActions";
import { HashSection } from "@/components/account-v2/HashSection";
import { ContactModal, type ContactModalContact } from "@/components/account-v2/ContactModal";
import { getAccMode } from "@/components/account-v2/mode";
import { ContactsPanel, type ContactsPanelGroupItem, type ContactsPanelRow } from "@/components/account-v2/ContactsPanel";
import { editorNewPath, editorDetailPath } from "./doc-editor-config";
import {
  loadContactsSidebar,
  listContactsPage,
  formatPhoneTh,
  POPULAR_VENDORS,
  type ContactRow,
  type ContactGroupKey,
} from "./contacts-list";
import { getContact, nextContactCode, listTenantMembers } from "./service";
import { isDbdConfigured, DBD_REASON } from "./dbd";
import {
  archiveContactAction,
  createContactGroupAction,
  addContactsToGroupAction,
  insertPopularVendorsAction,
} from "./actions";

const KIND_LABEL: Record<string, string> = { CUSTOMER: "ลูกค้า", VENDOR: "ผู้ขาย", BOTH: "ทั้งคู่" };

type SP = {
  q?: string;
  group?: string;
  legalType?: string;
  page?: string;
  pageSize?: string;
  err?: string;
  bulkIds?: string;
  edit?: string;
  /** WO 3.3 — "?new=1" เปิด modal เพิ่มผู้ติดต่อ · "?tab=basic|advanced" เลือกแท็บเริ่มต้น (ใช้ถ่ายภาพ QC) */
  new?: string;
  tab?: string;
};

// สลับกลุ่มแล้วคง q/legalType เดิมไว้ (ค้นหาระหว่างเปลี่ยนกลุ่มได้ต่อเนื่อง) — รีเซ็ต page เสมอ (ชุดข้อมูลใหม่)
function groupHref(pathname: string, current: { q?: string; legalType?: string }, group: ContactGroupKey | "all") {
  const p = new URLSearchParams();
  if (current.q) p.set("q", current.q);
  if (current.legalType) p.set("legalType", current.legalType);
  if (group !== "all") p.set("group", group);
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export async function ContactsPage({
  tenantId,
  systemId,
  id,
  searchParams,
}: {
  tenantId: string;
  systemId: string;
  id: string; // systemId ของ URL (`/app/sys/<id>/...`)
  searchParams: SP;
}) {
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/contacts`;
  const ctx = { tenantId, systemId };

  const sidebar = await loadContactsSidebar(ctx);
  const group = (searchParams.group as ContactGroupKey | undefined) ?? "all";
  const legalType = searchParams.legalType === "COMPANY" || searchParams.legalType === "PERSON" ? searchParams.legalType : undefined;
  const result = await listContactsPage(
    ctx,
    { q: searchParams.q, group, legalType, page: Number(searchParams.page) || 1, pageSize: Number(searchParams.pageSize) || 8 },
    sidebar,
  );

  // ── WO 3.3: ข้อมูลที่ modal §7.2 ต้องใช้ (โหลดเฉพาะตอนเปิด modal — หน้ารายการปกติไม่เสีย query เพิ่ม) ──
  const modalOpen = searchParams.new === "1" || !!searchParams.edit;
  const editingContact = searchParams.edit ? await getContact(tenantId, systemId, searchParams.edit) : null;
  const [modalNextCode, modalOwners, editingGroupIds, accMode] = modalOpen
    ? await Promise.all([
        editingContact ? Promise.resolve("") : nextContactCode(systemId),
        listTenantMembers(tenantId),
        editingContact ? listContactGroupIds(ctx, editingContact.id) : Promise.resolve([] as string[]),
        getAccMode(),
      ])
    : ["", [] as { id: string; name: string }[], [] as string[], "accountant" as const];

  const cellsFor = (r: ContactRow): React.ReactNode[] => [
    // เลขที่ — ลิงก์สีฟ้า (accent) ตรง f5 (ไม่ใช่สีดำแบบรอบแรก)
    <a key="code" href={`${pathname}/${r.id}`} className="font-semibold" style={{ color: "var(--color-accent)" }} data-testid={`contact-code-${r.code}`}>
      {r.code}
    </a>,
    <a key="name" href={`${pathname}/${r.id}`} className="flex flex-col gap-0.5" style={{ color: "var(--color-ink)" }}>
      <span className="font-medium">{r.name}</span>
      {(r.badges.member || r.badges.crm) && (
        <span className="flex gap-1 text-[10px]">
          {r.badges.member && <span className="rounded-full border px-1.5 py-0 text-[color:var(--color-muted)]">สมาชิก</span>}
          {r.badges.crm && <span className="rounded-full border px-1.5 py-0 text-[color:var(--color-muted)]">CRM</span>}
        </span>
      )}
    </a>,
    <StatusChip key="kind" value={KIND_LABEL[r.kind] ?? r.kind} tone={r.kind === "VENDOR" ? "strong" : "muted"} />,
    <div key="contact" className="flex flex-col text-xs">
      {r.phone && <span>{formatPhoneTh(r.phone)}</span>}
      {r.email && <span className="text-[color:var(--color-muted)]">{r.email}</span>}
      {!r.phone && !r.email && <span className="text-[color:var(--color-muted)]">—</span>}
    </div>,
    r.receivableSatang > 0 ? (
      <div key="outstanding" className="flex flex-col items-end">
        <span className="text-xs text-[color:var(--color-muted)]">ค้างรับ</span>
        <span className="font-semibold" style={{ color: "var(--color-danger)" }}>
          <MoneyText satang={r.receivableSatang} decimals />
        </span>
      </div>
    ) : r.payableSatang > 0 ? (
      <div key="outstanding" className="flex flex-col items-end">
        <span className="text-xs text-[color:var(--color-muted)]">ค้างจ่าย</span>
        <span className="font-semibold">
          <MoneyText satang={r.payableSatang} decimals />
        </span>
      </div>
    ) : (
      <span key="outstanding" className="block text-right text-[color:var(--color-muted)]">
        —
      </span>
    ),
    r.lastDoc ? (
      <div key="lastDoc" className="flex flex-col text-xs">
        <a href={editorDetailPath(base, r.lastDoc.docType, r.lastDoc.docId)} style={{ color: "var(--color-accent)" }}>
          {r.lastDoc.docNo ?? "(ร่าง)"}
        </a>
        <span className="text-[color:var(--color-muted)]">{formatDateTh(r.lastDoc.issueDate)}</span>
      </div>
    ) : (
      <span key="lastDoc" className="text-[color:var(--color-muted)]">
        —
      </span>
    ),
  ];

  const rowActionsFor = (r: ContactRow): RowActionItem[] => [
    { label: "สร้างใบเสนอราคา", href: `${editorNewPath(base, "QUOTATION")}?contactId=${r.id}`, icon: "doc" },
    { label: "สร้างใบแจ้งหนี้", href: `${editorNewPath(base, "INVOICE")}?contactId=${r.id}`, icon: "file" },
    { label: "สร้างใบเสร็จรับเงิน", href: `${editorNewPath(base, "RECEIPT")}?contactId=${r.id}`, icon: "check" },
    { label: "บันทึกค่าใช้จ่าย", href: `${editorNewPath(base, "EXPENSE")}?contactId=${r.id}`, icon: "upload" },
    { label: "ดูประวัติการซื้อขาย", href: `${pathname}/${r.id}`, icon: "clock", sepBefore: true },
    { label: "แก้ไขข้อมูล", href: `${pathname}?edit=${r.id}`, icon: "edit" },
    { label: "เพิ่มเข้ากลุ่ม", href: `${pathname}?bulkIds=${r.id}#bulk-group`, icon: "tag" },
    {
      label: "ปิดใช้งาน",
      danger: true,
      icon: "x",
      sepBefore: true,
      submit: { action: archiveContactAction, fields: { systemId, id: r.id } },
    },
  ];

  const bulkIds = (searchParams.bulkIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const spCurrent = { q: searchParams.q, legalType: searchParams.legalType };

  const std: ContactsPanelGroupItem[] = [
    { key: "all", label: "ทั้งหมด", count: sidebar.counts.all, href: groupHref(pathname, spCurrent, "all"), active: group === "all", dotTone: "strong" },
    { key: "customer", label: "ลูกค้า", count: sidebar.counts.customer, href: groupHref(pathname, spCurrent, "customer"), active: group === "customer", dotTone: "strong" },
    {
      key: "regular",
      label: "ลูกค้าประจำ",
      count: sidebar.counts.regular,
      href: groupHref(pathname, spCurrent, "regular"),
      active: group === "regular",
      dotTone: "strong",
      subtitle: sidebar.regularRuleLabel,
    },
    { key: "vendor", label: "ผู้ขาย", count: sidebar.counts.vendor, href: groupHref(pathname, spCurrent, "vendor"), active: group === "vendor", dotTone: "strong" },
    { key: "archived", label: "ปิดใช้งาน", count: sidebar.counts.archived, href: groupHref(pathname, spCurrent, "archived"), active: group === "archived", dotTone: "muted" },
  ];
  const customGroups: ContactsPanelGroupItem[] = sidebar.counts.custom.map((g) => ({
    key: `custom:${g.id}`,
    label: g.name,
    count: g.count,
    href: groupHref(pathname, spCurrent, `custom:${g.id}`),
    active: group === `custom:${g.id}`,
    dotTone: "muted",
  }));
  const sourceGroups: ContactsPanelGroupItem[] = (
    [
      ["source:member", "สมาชิก", sidebar.counts.source.member],
      ["source:crm", "CRM", sidebar.counts.source.crm],
      ["source:chat", "แชท", sidebar.counts.source.chat],
      ["source:pos", "POS", sidebar.counts.source.pos],
      ["source:imported", "นำเข้า", sidebar.counts.source.imported],
    ] as [ContactGroupKey, string, number][]
  ).map(([key, label, count]) => ({ key, label, count, href: groupHref(pathname, spCurrent, key), active: group === key, dotTone: "muted" as const }));

  const panelRows: ContactsPanelRow[] = result.rows.map((r) => ({
    id: r.id,
    code: r.code,
    cells: cellsFor(r),
    rowActions: <RowActions items={rowActionsFor(r)} testId={`contact-row-actions-${r.code}`} />,
    mobile: {
      title: (
        <span>
          {r.code} · {r.name}
        </span>
      ),
      subtitle: `${KIND_LABEL[r.kind] ?? r.kind}${r.phone ? " · " + formatPhoneTh(r.phone) : ""}`,
      trailing:
        r.receivableSatang > 0 ? (
          <span style={{ color: "var(--color-danger)" }}>
            <MoneyText satang={r.receivableSatang} decimals />
          </span>
        ) : r.payableSatang > 0 ? (
          <MoneyText satang={r.payableSatang} decimals />
        ) : (
          "—"
        ),
      dateLine: r.lastDoc ? `${r.lastDoc.docNo ?? "(ร่าง)"} · ${formatDateTh(r.lastDoc.issueDate)}` : "ยังไม่มีเอกสาร",
    },
  }));

  return (
    <div className="flex flex-col gap-5 pb-28">
      {searchParams.err && <p className="text-sm text-[color:var(--color-danger)]">กรุณากรอกข้อมูลให้ครบถ้วน</p>}

      <ContactsPanel
        base={base}
        pathname={pathname}
        searchParams={{ q: searchParams.q, group: searchParams.group, legalType: searchParams.legalType }}
        importHref={`${base}/import/contacts`}
        createContactHref={`${pathname}?new=1`}
        sidebarStandard={std}
        sidebarCustom={customGroups}
        newGroupHref="#new-group"
        popularVendorsHref="#popular-vendors"
        sidebarSource={sourceGroups}
        searchQ={searchParams.q}
        legalType={searchParams.legalType}
        activeGroupKey={group}
        groupLabel={result.groupLabel}
        groupTotal={result.total}
        rows={panelRows}
        page={result.page}
        pageSize={result.pageSize}
        pageCount={result.pageCount}
        total={result.total}
        emptyText="ไม่พบผู้ติดต่อ — ลองค้นหาด้วยคำอื่น หรือเพิ่มผู้ติดต่อใหม่"
      />

      {/* modal เพิ่ม/แก้ไขผู้ติดต่อ §7.2 (ภาพ g5) — เปิดจาก "+ เพิ่มผู้ติดต่อ" (?new=1) หรือ "แก้ไขข้อมูล" (?edit=<id>) */}
      {modalOpen && (
        <ContactModal
          systemId={systemId}
          contactsPath={pathname}
          contact={editingContact ? toModalContact(editingContact, editingGroupIds) : null}
          nextCode={modalNextCode}
          groups={sidebar.counts.custom.map((g) => ({ id: g.id, name: g.name }))}
          owners={modalOwners}
          dbdEnabled={isDbdConfigured()}
          dbdDisabledReason={DBD_REASON.noKey}
          defaultTab={searchParams.tab === "advanced" ? "advanced" : searchParams.tab === "basic" ? "basic" : accMode === "easy" ? "basic" : "advanced"}
        />
      )}

      {/* เพิ่มเข้ากลุ่ม (bulk) */}
      {bulkIds.length > 0 && (
        <HashSection hash="bulk-group" defaultOpen>
          <div className="card flex flex-col gap-3">
            <h2 className="text-sm font-medium">เพิ่ม {bulkIds.length} รายการเข้ากลุ่ม</h2>
            {sidebar.counts.custom.length > 0 ? (
              <form action={addContactsToGroupAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="contactIds" value={bulkIds.join(",")} />
                <FormField label="กลุ่ม">
                  <select name="groupId" className="input" required>
                    {sidebar.counts.custom.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <SubmitButton>เพิ่มเข้ากลุ่ม</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกลุ่มกำหนดเอง — สร้างกลุ่มใหม่ก่อน</p>
            )}
          </div>
        </HashSection>
      )}

      {/* + เพิ่มกลุ่มใหม่ */}
      <HashSection hash="new-group">
        <div className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">เพิ่มกลุ่มกำหนดเอง</h2>
          <form action={createContactGroupAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="systemId" value={systemId} />
            <FormField label="ชื่อกลุ่ม" required>
              <input name="name" required className="input" placeholder="เช่น ลูกค้า VIP" />
            </FormField>
            <SubmitButton>+ เพิ่มกลุ่ม</SubmitButton>
          </form>
        </div>
      </HashSection>

      {/* + เพิ่มผู้ติดต่อยอดนิยม (§7.1) */}
      <HashSection hash="popular-vendors">
        <div className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">เพิ่มผู้ติดต่อยอดนิยม</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            รายชื่อหน่วยงาน/ผู้ให้บริการที่ SME ไทยใช้บ่อย — เลขผู้เสียภาษีเป็นตัวอย่าง แก้ไขได้หลังเพิ่ม
          </p>
          <form action={insertPopularVendorsAction} className="flex flex-col gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {POPULAR_VENDORS.map((v, i) => (
                <label key={v.taxId} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" name="vendorIndex" value={i} className="h-4 w-4" />
                  <span className="flex flex-col">
                    <span>{v.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">{v.taxId}</span>
                  </span>
                </label>
              ))}
            </div>
            <SubmitButton className="w-fit">+ เพิ่มที่เลือก</SubmitButton>
          </form>
        </div>
      </HashSection>
    </div>
  );
}

// ── WO 3.3 · ตัวช่วยของ modal §7.2 ──

/** id ของกลุ่มกำหนดเองที่ผู้ติดต่อรายนี้อยู่ (ติ๊กไว้ในช่อง "กลุ่มกำหนดเอง") */
async function listContactGroupIds(ctx: { tenantId: string; systemId: string }, contactId: string): Promise<string[]> {
  const { listGroupIdsOfContact } = await import("./contacts-list");
  return listGroupIdsOfContact(ctx, contactId);
}

/** แถว AccountContact (Prisma) → props ของ ContactModal (client component รับได้เฉพาะค่าธรรมดา) */
function toModalContact(
  c: {
    id: string; code: string | null; kind: string; legalType: string; name: string;
    taxId: string | null; taxIdCountry: string | null; branchCode: string | null; officeType: string | null;
    legalEntityType: string | null; personTitle: string | null; contactPerson: string | null;
    addressLine: string | null; subdistrict: string | null; district: string | null; province: string | null;
    postcode: string | null; country: string | null; email: string | null; phone: string | null;
    website: string | null; fax: string | null; lineId: string | null; creditTermDays: number;
    defaultPriceMode: string | null; defaultWhtType: string | null; defaultWhtRateBp: number | null;
    bankAccountNote: string | null; arAccountCode: string | null; apAccountCode: string | null;
    ownerUserId: string | null; note: string | null; tags: unknown; partyId: string | null;
  },
  groupIds: string[],
): ContactModalContact {
  return {
    id: c.id, code: c.code, kind: c.kind, legalType: c.legalType, name: c.name,
    taxId: c.taxId, taxIdCountry: c.taxIdCountry, branchCode: c.branchCode, officeType: c.officeType,
    legalEntityType: c.legalEntityType, personTitle: c.personTitle, contactPerson: c.contactPerson,
    addressLine: c.addressLine, subdistrict: c.subdistrict, district: c.district, province: c.province,
    postcode: c.postcode, country: c.country, email: c.email, phone: c.phone, website: c.website,
    fax: c.fax, lineId: c.lineId, creditTermDays: c.creditTermDays, defaultPriceMode: c.defaultPriceMode,
    defaultWhtType: c.defaultWhtType, defaultWhtRateBp: c.defaultWhtRateBp,
    bankAccountNote: c.bankAccountNote, arAccountCode: c.arAccountCode, apAccountCode: c.apAccountCode,
    ownerUserId: c.ownerUserId, note: c.note,
    tags: Array.isArray(c.tags) ? (c.tags as unknown[]).map(String) : [],
    groupIds,
    partyId: c.partyId,
  };
}

export default ContactsPage;
