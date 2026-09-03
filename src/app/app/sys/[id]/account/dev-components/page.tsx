import { notFound } from "next/navigation";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";

import { StatusTabs, type StatusTabDef, type TabCounts } from "@/components/account-v2/StatusTabs";
import { ListFilters, type ContactOption } from "@/components/account-v2/ListFilters";
import { DocTable, type DocColumn } from "@/components/account-v2/DocTable";
import { RowActions, type RowActionItem } from "@/components/account-v2/RowActions";
import { MoneyInput } from "@/components/account-v2/MoneyInput";
import { QtyInput } from "@/components/account-v2/QtyInput";
import { DateInput } from "@/components/account-v2/DateInput";
import { PercentOrAmountInput } from "@/components/account-v2/PercentOrAmountInput";
import { Stepper, type StepDef } from "@/components/account-v2/Stepper";
import { SectionCard } from "@/components/account-v2/SectionCard";
import { Accordion } from "@/components/account-v2/Accordion";
import { StickyBar } from "@/components/account-v2/StickyBar";
import { EasyModeToggle } from "@/components/account-v2/EasyModeToggle";
import { DateText } from "@/lib/ui/DateText";
import {
  ContactPickerGallery,
  ProductPickerGallery,
  ModalGallery,
  SlideOverGallery,
  ToastGallery,
} from "./GalleryClient";

// storybook-lite ของ WO 0.5 (BLUEPRINT-ACCOUNT-V2 §3 แถว 0.5) — เฉพาะ dev/preview เท่านั้น ปิดบน prod
// ทุกบล็อกใส่ data-testid="gal-<name>" ให้ scripts/visual-acc-v2.mts ถ่ายภาพเทียบ mockup ได้ตรงจุด

type FixtureDoc = {
  id: string;
  docNo: string;
  issueDate: string;
  dueDate: string;
  contactName: string;
  netSatang: number;
  outstandingSatang: number;
  status: "DRAFT" | "AWAITING_PAYMENT" | "PARTIAL" | "PAID" | "OVERDUE";
};

// ตัวเลขชุดเดียวกับ f3-invoice-list.png (ทั้งหมด 51 · ร่าง 3 · รอชำระ 12 · ชำระบางส่วน 2 · ชำระแล้ว 29 · พ้นกำหนด 4 · ยกเลิก 1)
const FIXTURE_DOCS: FixtureDoc[] = [
  { id: "d1", docNo: "IV-202609-0012", issueDate: "2026-09-28", dueDate: "2026-10-12", contactName: "บจก. อันดามัน ทราเวล", netSatang: 8640000, outstandingSatang: 8640000, status: "AWAITING_PAYMENT" },
  { id: "d2", docNo: "IV-202609-0011", issueDate: "2026-09-26", dueDate: "2026-09-26", contactName: "คุณกานต์ ศรีวิไล", netSatang: 4800000, outstandingSatang: 0, status: "PAID" },
  { id: "d3", docNo: "IV-202609-0009", issueDate: "2026-09-22", dueDate: "2026-10-06", contactName: "โรงแรมสิมิลันวิว", netSatang: 12450000, outstandingSatang: 6225000, status: "PARTIAL" },
  { id: "d4", docNo: "IV-202609-0007", issueDate: "2026-09-18", dueDate: "2026-10-02", contactName: "คุณณัฐพล รุ่งเรือง", netSatang: 2490000, outstandingSatang: 2490000, status: "AWAITING_PAYMENT" },
  { id: "d5", docNo: "IV-202609-0004", issueDate: "2026-09-10", dueDate: "2026-09-24", contactName: "บจก. ซีบรีซ รีสอร์ท", netSatang: 6230000, outstandingSatang: 6230000, status: "OVERDUE" },
  { id: "d6", docNo: "IV-202608-0021", issueDate: "2026-08-12", dueDate: "2026-08-26", contactName: "คุณปิยธิดา อินสุ่ม", netSatang: 3840000, outstandingSatang: 3840000, status: "OVERDUE" },
  { id: "d7", docNo: "IV-202607-0016", issueDate: "2026-07-07", dueDate: "2026-07-21", contactName: "ร้านดำน้ำ บลูโอเชียน", netSatang: 1550000, outstandingSatang: 1550000, status: "OVERDUE" },
  { id: "d8", docNo: "IV-202606-0009", issueDate: "2026-06-08", dueDate: "2026-06-22", contactName: "คุณสมชาย ทองดี", netSatang: 1220000, outstandingSatang: 1220000, status: "OVERDUE" },
];

const STATUS_LABEL: Record<FixtureDoc["status"], string> = {
  DRAFT: "ร่าง",
  AWAITING_PAYMENT: "รอชำระ",
  PARTIAL: "ชำระบางส่วน",
  PAID: "ชำระแล้ว",
  OVERDUE: "พ้นกำหนด",
};
const toneOf = (v: string) => (v === "PAID" ? "strong" : v === "OVERDUE" ? "danger" : "muted");

const TAB_DEFS: StatusTabDef[] = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "DRAFT", label: "ร่าง" },
  { key: "AWAITING_PAYMENT", label: "รอชำระ" },
  { key: "PARTIAL", label: "ชำระบางส่วน" },
  { key: "PAID", label: "ชำระแล้ว" },
  { key: "OVERDUE", label: "พ้นกำหนด", tone: "danger" },
  { key: "CANCELLED", label: "ยกเลิก" },
];
const TAB_COUNTS: TabCounts = { ALL: 51, DRAFT: 3, AWAITING_PAYMENT: 12, PARTIAL: 2, PAID: 29, OVERDUE: 4, CANCELLED: 1 };

const CONTACTS: ContactOption[] = [
  { id: "c1", name: "คุณณัฐพล รุ่งเรือง" },
  { id: "c2", name: "บจก. อันดามัน ทราเวล" },
  { id: "c3", name: "โรงแรมสิมิลันวิว" },
];

const COLS: DocColumn<FixtureDoc>[] = [
  {
    key: "docNo",
    header: "เลขที่",
    sort: "docNo",
    render: (r) => (
      <a href="#" className="text-[color:var(--color-accent)] hover:underline">
        {r.docNo}
      </a>
    ),
  },
  { key: "issueDate", header: "วันที่", sort: "issueDate", render: (r) => <DateText value={r.issueDate} /> },
  {
    key: "dueDate",
    header: "ครบกำหนด",
    render: (r) => (
      <span style={r.status === "OVERDUE" ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>
        <DateText value={r.dueDate} />
      </span>
    ),
  },
  { key: "contact", header: "ผู้ติดต่อ", render: (r) => r.contactName },
  { key: "net", header: "มูลค่าสุทธิ", align: "right", sort: "amount", render: (r) => <MoneyText satang={r.netSatang} decimals /> },
  { key: "outstanding", header: "ค้างชำระ", align: "right", render: (r) => <MoneyText satang={r.outstandingSatang} decimals /> },
  { key: "status", header: "สถานะ", render: (r) => <StatusChip value={r.status} map={STATUS_LABEL} toneOf={toneOf} /> },
];

function rowMenu(_r: FixtureDoc): RowActionItem[] {
  return [
    { label: "รับชำระ", href: "#" },
    { label: "ออกใบเสร็จ", href: "#" },
    { label: "ส่งอีเมล/ลิงก์", href: "#" },
    { label: "พิมพ์", href: "#" },
    { label: "ยกเลิก", href: "#", danger: true },
  ];
}

const STEPPER_STEPS: StepDef[] = [
  { code: "QT", label: "ใบเสนอราคา QT", docNo: "QT-202609-0018", state: "done" },
  { code: "IV", label: "ใบแจ้งหนี้ IV", docNo: "กำลังสร้าง", state: "current" },
  { code: "RE", label: "ใบเสร็จรับเงิน RE", state: "next" },
  { code: "TX", label: "ใบกำกับภาษี TX", state: "next" },
];

export default async function ComponentGalleryPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.APP_ENV === "production") notFound();
  const { id } = await params;
  await requireAccountPage(id, "account.doc.view");
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/dev-components`;
  const totalNet = FIXTURE_DOCS.reduce((s, d) => s + d.netSatang, 0);

  return (
    <div className="flex max-w-4xl flex-col gap-8 pb-24">
      <PageHeader
        title="Component gallery — WO 0.5"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc={'เฉพาะ dev/preview · เทียบกับ f3/g1/g5/g17/g18 — ทุกบล็อกมี data-testid="gal-<name>"'}
      />

      <Section title="StatusTabs (f3-invoice-list.png)">
        <div data-testid="gal-status-tabs">
          <StatusTabs tabs={TAB_DEFS} counts={TAB_COUNTS} active="ALL" />
        </div>
      </Section>

      <Section title="ListFilters (f3-invoice-list.png)">
        <ListFilters
          testId="gal-list-filters"
          action={pathname}
          value={{ preset: "this_year", q: "" }}
          contacts={CONTACTS}
          resetHref={pathname}
        />
      </Section>

      <Section title="DocTable — มีข้อมูล 8 แถว (f3-invoice-list.png)">
        <DocTable
          testId="gal-doc-table"
          cols={COLS}
          rows={FIXTURE_DOCS}
          pathname={pathname}
          searchParams={{}}
          sort="issueDate"
          sortDir="desc"
          rowActions={(r) => <RowActions items={rowMenu(r)} testId={`gal-doc-table-row-actions-${r.id}`} />}
          mobileTitle={(r) => r.docNo}
          mobileSubtitle={(r) => r.contactName}
          mobileTrailing={(r) => <MoneyText satang={r.netSatang} decimals />}
          footerTotalSatang={totalNet}
          page={1}
          pageCount={7}
          pageSize={8}
          emptyText="ไม่พบรายการในช่วงวันที่ที่เลือก"
        />
      </Section>

      <Section title="DocTable — เลือกแถว + แถบ bulk (f3-invoice-list.png)">
        <div data-testid="gal-doc-table-selected">
          <DocTable
            cols={COLS}
            rows={FIXTURE_DOCS.slice(0, 3)}
            pathname={pathname}
            searchParams={{}}
            initialSelectedIds={["d1", "d3"]}
            bulkActions={
              <>
                <button type="button" className="btn-sm">
                  ออกใบวางบิลรวม
                </button>
                <button type="button" className="btn-sm">
                  พิมพ์
                </button>
                <button type="button" className="btn-sm" style={{ color: "var(--color-danger)" }}>
                  ยกเลิก
                </button>
              </>
            }
            rowActions={(r) => <RowActions items={rowMenu(r)} />}
            footerTotalSatang={FIXTURE_DOCS.slice(0, 3).reduce((s, d) => s + d.netSatang, 0)}
            page={1}
            pageCount={1}
            pageSize={20}
            emptyText="ไม่พบรายการ"
          />
        </div>
      </Section>

      <Section title="DocTable — ว่าง (EmptyState)">
        <div data-testid="gal-doc-table-empty">
          <DocTable
            cols={COLS}
            rows={[]}
            pathname={pathname}
            searchParams={{}}
            page={1}
            pageCount={1}
            pageSize={20}
            emptyText="ไม่พบรายการในช่วงวันที่ที่เลือก — สร้างใบแจ้งหนี้ใบแรก"
          />
        </div>
      </Section>

      <Section title="RowActions — เมนูเปิดค้าง (f3-invoice-list.png)">
        <div data-testid="gal-row-menu">
          <RowActions items={rowMenu(FIXTURE_DOCS[0])} defaultOpen testId="gal-row-menu-open" />
        </div>
      </Section>

      <Section title="Stepper (g1-invoice-form.png)">
        <div data-testid="gal-stepper" className="card">
          <Stepper steps={STEPPER_STEPS} hrefFor={() => "#"} />
        </div>
      </Section>

      <Section title="SectionCard (g1-invoice-form.png)">
        <div className="flex flex-col gap-3" data-testid="gal-section-card">
          <SectionCard title="ส่วนหัวเอกสาร" complete>
            <p className="text-sm text-[color:var(--color-muted)]">ตัวอย่าง section การ์ดที่กรอกครบแล้ว (✓ ดำ)</p>
          </SectionCard>
          <SectionCard title="เงินมัดจำ" complete={false}>
            <p className="text-sm text-[color:var(--color-muted)]">ตัวอย่าง section ที่ยังไม่ครบ (ไม่มี ✓)</p>
          </SectionCard>
        </div>
      </Section>

      <Section title="Accordion มือถือ (g17-invoice-form.png)">
        <div className="max-w-sm" data-testid="gal-accordion">
          <Accordion
            items={[
              { key: "head", title: "ส่วนหัวเอกสาร", badge: <span className="text-xs text-[color:var(--color-muted)]">3</span>, content: "เนื้อหาส่วนหัว", defaultOpen: true },
              { key: "lines", title: "รายการ", badge: <span className="text-xs text-[color:var(--color-muted)]">3</span>, content: "เนื้อหารายการสินค้า" },
              { key: "notes", title: "หมายเหตุ", content: "เนื้อหาหมายเหตุ" },
            ]}
          />
        </div>
      </Section>

      <Section title="MoneyInput / QtyInput / DateInput / PercentOrAmountInput (g1-invoice-form.png)">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ราคา/หน่วย
            <MoneyInput name="price" defaultValueSatang={990000} testId="gal-money-input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            จำนวน
            <QtyInput name="qty" defaultValue={2} testId="gal-qty-input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่ออก
            <DateInput name="issueDate" defaultValue="2026-09-18" testId="gal-date-input" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ส่วนลด
            <PercentOrAmountInput namePrefix="discount" testId="gal-percent-amount" />
          </label>
        </div>
      </Section>

      <Section title="ContactPicker (g1/g5)">
        <div className="max-w-md">
          <ContactPickerGallery />
        </div>
      </Section>

      <Section title="ProductPicker (g1-invoice-form.png)">
        <div className="max-w-md">
          <ProductPickerGallery />
        </div>
      </Section>

      <Section title="Modal (g5-contact-modal.png)">
        <ModalGallery />
      </Section>

      <Section title="SlideOver (g6 โปรไฟล์ 360° / g18-sheet-l2.png บนมือถือ)">
        <SlideOverGallery />
      </Section>

      <Section title="Toast (g5-contact-modal.png แถบดำล่างจอ)">
        <ToastGallery />
      </Section>

      <Section title="EasyModeToggle">
        <div data-testid="gal-easy-mode-toggle">
          <EasyModeToggle />
        </div>
      </Section>

      <Section title="StickyBar (g17-invoice-form.png)">
        <div className="max-w-sm rounded-lg border" data-testid="gal-sticky-bar">
          <div className="p-4 text-sm text-[color:var(--color-muted)]">เนื้อหาฟอร์ม…</div>
          <StickyBar
            secondary={
              <button type="button" className="btn btn-ghost text-sm">
                บันทึกร่าง
              </button>
            }
            primary={
              <button type="button" className="btn btn-primary w-full text-sm">
                อนุมัติ
              </button>
            }
            more={
              <button type="button" className="btn-sm" aria-label="เพิ่มเติม">
                ⋯
              </button>
            }
          />
        </div>
      </Section>
    </div>
  );
}
