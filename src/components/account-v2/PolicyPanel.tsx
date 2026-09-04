"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { DateInput } from "./DateInput";
import { useSetBreadcrumbTail } from "./breadcrumb-tail";
import {
  CONVERT_PO_LABEL,
  CONVERT_QT_LABEL,
  DUP_POLICY_LABEL,
  PRICE_MODE_POLICY_LABEL,
  VAT_TIMING_LABEL,
} from "@/lib/modules/account/policy-labels";

// ─────────────────────────────────────────────────────────────
// หน้า "ตั้งค่า › นโยบายบัญชี" (SPEC §9.3)
//
// ไม่มีเฟรมของตัวเอง ⇒ ใช้ภาษาภาพเดียวกับ WO 8.1 (f10-settings.png) เป๊ะ:
//   หัวเรื่อง "ตั้งค่า" + ปุ่ม [ยกเลิก][✓ บันทึก] sticky มุมขวาบน · ซ้าย = เมนู w-280 (ส่งมาเป็น children)
//   ขวา = การ์ดเนื้อหา max-w-2xl · 1 หัวข้อย่อย = 1 ฟอร์ม 1 ปุ่มบันทึก
// ทุกหัวข้อมีข้อความอธิบายเป็น "ภาษาคน" ใต้ชื่อช่อง (BLUEPRINT §0.3 ข้อ 9 — ห้ามมี enum ลอย ๆ)
// ─────────────────────────────────────────────────────────────

export type WhtDefaultRow = { incomeType: string; label: string; enabled: boolean; ratePct: string; accountCodes: string };
export type LedgerOpt = { code: string; name: string };

export type PolicyView = {
  fiscalYearStartMonth: number;
  periodCloseDay: number | null;
  fiscalYearLabel: string;
  vatRegistered: boolean;
  vatRatePct: string;
  vatTiming: "ON_ISSUE" | "ON_PAYMENT";
  defaultPriceMode: "" | "EXCL_VAT" | "INCL_VAT" | "NO_VAT";
  /** "YYYY-MM-DD" หรือ "" = ไม่ล็อก */
  lockBeforeDate: string;
  /** ข้อความไทยของวันล็อก ("31 ส.ค. 2026") — "" = ไม่ล็อก */
  lockBeforeDateText: string;
  dupContactPolicy: "WARN" | "BLOCK";
  dupProductPolicy: "WARN" | "BLOCK";
  defaultSalesAccountCode: string;
  defaultPurchaseAccountCode: string;
  defaultExpenseAccountCode: string;
  convertQtTo: "INVOICE" | "DEPOSIT_RECEIPT";
  convertPoTo: "PURCHASE" | "EXPENSE";
  copyNotesOnConvert: boolean;
  copyTagsOnConvert: boolean;
  regularCustomer: { minPaidDocs: number; minPaidTotalBaht: string; periodMonths: number };
  regularCustomerCount: number;
  autoClosePeriods: boolean;
  autoCloseNotify: boolean;
  emailReportDaily: boolean;
  emailReportWeekly: boolean;
  emailReportRecipients: string;
  whtRows: WhtDefaultRow[];
};

export type PolicyPanelProps = {
  systemId: string;
  base: string;
  sub: string;
  subLabel: string;
  policy: PolicyView;
  incomeLedgers: LedgerOpt[];
  expenseLedgers: LedgerOpt[];
  nav: React.ReactNode;
  mobileNav: React.ReactNode;
  showMobileNavOnly: boolean;
  save: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
};

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";
const helpCls = "text-xs text-[color:var(--color-muted)]";

function Card({
  title,
  desc,
  children,
  testId,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid={testId}>
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {desc && <p className={`mt-1 ${helpCls}`}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/** สวิตช์ 1 บรรทัด (ชื่อ + คำอธิบายจางใต้ชื่อ + toggle ขวา) — เหมือนการ์ด "กฎอัตโนมัติ" ของ f10 */
function Toggle({
  name,
  label,
  desc,
  defaultChecked,
  testId,
}: {
  name: string;
  label: string;
  desc: string;
  defaultChecked: boolean;
  testId: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border-t pt-3 first:border-t-0 first:pt-0">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className={`block ${helpCls}`}>{desc}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} data-testid={testId} className="mt-1 h-4 w-4 shrink-0" />
    </label>
  );
}

export function PolicyPanel(p: PolicyPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const formId = "policy-form";
  useSetBreadcrumbTail(p.subLabel);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await p.save(fd);
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason });
      if (res.ok) setDirty(false);
    });
  }

  const v = p.policy;
  const body = (() => {
    switch (p.sub) {
      case "vat":
        return <VatSection v={v} />;
      case "wht":
        return <WhtSection v={v} />;
      case "price":
        return <PriceSection v={v} />;
      case "lock":
        return <LockSection v={v} />;
      case "dup":
        return <DupSection v={v} />;
      case "accounts":
        return <AccountsSection v={v} income={p.incomeLedgers} expense={p.expenseLedgers} />;
      case "convert":
        return <ConvertSection v={v} />;
      case "regular":
        return <RegularSection v={v} />;
      case "autoclose":
        return <AutoCloseSection v={v} />;
      case "email":
        return <EmailSection v={v} />;
      case "insight":
        return <InsightSection />;
      default:
        return <FiscalSection v={v} />;
    }
  })();

  // Smart Insight ยังไม่ทำ ⇒ ไม่มีอะไรให้บันทึก
  const hasSaveBar = p.sub !== "insight";

  return (
    <form id={formId} onSubmit={submit} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      <input type="hidden" name="systemId" value={p.systemId} />

      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        {hasSaveBar && (
          <div className={`items-center gap-2 ${p.showMobileNavOnly ? "hidden md:flex" : "flex"}`}>
            <Link href={`${p.base}/settings/policy?s=${p.sub}`} className="btn btn-ghost btn-sm">
              ยกเลิก
            </Link>
            <button
              type="submit"
              disabled={pending}
              data-testid="policy-save-top"
              className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            >
              <AccountIcon name="check" className="h-4 w-4" />
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p
          data-testid="policy-msg"
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
        >
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}
      {dirty && !msg && <p className={helpCls}>มีการแก้ไขที่ยังไม่ได้บันทึก</p>}

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="hidden md:block">{p.nav}</div>
        {p.showMobileNavOnly && <div className="md:hidden">{p.mobileNav}</div>}
        <div className={`min-w-0 flex-1 md:max-w-2xl ${p.showMobileNavOnly ? "hidden md:block" : ""}`}>
          <Link
            href={`${p.base}/settings/policy`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted)] md:hidden"
          >
            ← หัวข้อตั้งค่า
          </Link>
          <div className="flex flex-col gap-4">
            {body}
            {hasSaveBar && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  data-testid="policy-save-bottom"
                  className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                >
                  {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

// ═══════════════ ① ปีบัญชี ═══════════════

function FiscalSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-fiscal-card"
      title="ปีบัญชี"
      desc="รอบปีบัญชีใช้ตัดสินว่า “กำไรสะสม” กับ “กำไรปีนี้” ในงบแสดงฐานะการเงินแบ่งกันตรงไหน และเป็นช่วงเริ่มต้นของหน้ารายงาน"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          เดือนเริ่มปีบัญชี
          <select name="fiscalYearStartMonth" defaultValue={String(v.fiscalYearStartMonth)} className="input" data-testid="policy-fy-month">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          วันปิดงวดของแต่ละเดือน (ไม่บังคับ)
          <input
            name="periodCloseDay"
            type="number"
            min={1}
            max={28}
            defaultValue={v.periodCloseDay ?? ""}
            placeholder="เช่น 5"
            className="input"
            data-testid="policy-close-day"
          />
        </label>
      </div>
      <p className={helpCls} data-testid="policy-fy-label">
        รอบปัจจุบัน: <span className="font-medium text-[color:var(--color-ink)]">{v.fiscalYearLabel}</span>
      </p>
      <p className={helpCls}>
        “วันปิดงวด” คือวันที่ทีมบัญชีตั้งใจปิดงวดของเดือนก่อนให้เสร็จ — ใช้เตือนและใช้กับการปิดงวดอัตโนมัติ
        เลือกได้ไม่เกินวันที่ 28 เพื่อให้ใช้กับเดือนกุมภาพันธ์ได้ด้วย
      </p>
    </Card>
  );
}

// ═══════════════ ② VAT ═══════════════

function VatSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-vat-card"
      title="ภาษีมูลค่าเพิ่ม (VAT)"
      desc="ตั้งครั้งเดียว ใช้กับทุกเอกสารที่ออกหลังจากนี้ — เอกสารที่ออกไปแล้วยังคงอัตราเดิมของใบนั้น"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          สถานะจดทะเบียน
          <select name="vatRegistered" defaultValue={v.vatRegistered ? "1" : "0"} className="input" data-testid="policy-vat-registered">
            <option value="1">จดทะเบียน VAT</option>
            <option value="0">ไม่จด VAT</option>
          </select>
        </label>
        <label className={labelCls}>
          อัตรา VAT (%)
          <input name="vatRatePct" type="number" step="0.01" min={0} max={100} defaultValue={v.vatRatePct} className="input" data-testid="policy-vat-rate" />
        </label>
      </div>
      <label className={labelCls}>
        จุดรับรู้ภาษีขายเริ่มต้น
        <select name="vatTiming" defaultValue={v.vatTiming} className="input" data-testid="policy-vat-timing">
          <option value="ON_ISSUE">{VAT_TIMING_LABEL.ON_ISSUE}</option>
          <option value="ON_PAYMENT">{VAT_TIMING_LABEL.ON_PAYMENT}</option>
        </select>
      </label>
      <p className={helpCls}>
        ขายสินค้า = ภาษีขายเกิดตอนออกใบกำกับ · ให้บริการ = ภาษีขายเกิดตอนรับเงิน (ระหว่างรอ ระบบพักไว้ในบัญชี “ภาษีขายรอเรียกเก็บ”)
        เปลี่ยนได้รายใบในฟอร์มเอกสาร
      </p>
    </Card>
  );
}

// ═══════════════ ③ หัก ณ ที่จ่ายเริ่มต้น ═══════════════

function WhtSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-wht-card"
      title="หัก ณ ที่จ่ายเริ่มต้น"
      desc="ตั้งอัตราต่อประเภทเงินได้ และผูกกับบัญชีค่าใช้จ่ายที่ใช้บ่อย — เลือกบัญชีในฟอร์มแล้วระบบเติมประเภท/อัตราให้เอง"
    >
      <input type="hidden" name="whtSection" value="1" />
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[520px] border-collapse text-sm" data-testid="policy-wht-table">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 font-normal">ใช้</th>
              <th className="py-2 font-normal">ประเภทเงินได้</th>
              <th className="py-2 font-normal">อัตรา (%)</th>
              <th className="py-2 font-normal">บัญชีค่าใช้จ่ายที่ใช้อัตรานี้</th>
            </tr>
          </thead>
          <tbody>
            {v.whtRows.map((r) => (
              <tr key={r.incomeType} className="border-b last:border-0" data-testid={`policy-wht-row-${r.incomeType}`}>
                <td className="py-2 pr-2">
                  <input type="checkbox" name={`wht_${r.incomeType}_on`} defaultChecked={r.enabled} data-testid={`policy-wht-on-${r.incomeType}`} className="h-4 w-4" />
                </td>
                <td className="py-2 pr-2">{r.label}</td>
                <td className="py-2 pr-2">
                  <input
                    name={`wht_${r.incomeType}_rate`}
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    defaultValue={r.ratePct}
                    className="input w-20"
                    data-testid={`policy-wht-rate-${r.incomeType}`}
                  />
                </td>
                <td className="py-2">
                  <input
                    name={`wht_${r.incomeType}_accounts`}
                    defaultValue={r.accountCodes}
                    placeholder="เช่น 6100, 6900"
                    className="input w-full"
                    data-testid={`policy-wht-acc-${r.incomeType}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={helpCls}>ใส่รหัสบัญชีคั่นด้วยจุลภาค เว้นว่างได้ถ้าไม่ต้องการผูกกับบัญชีใด</p>
    </Card>
  );
}

// ═══════════════ ④ ประเภทราคาเริ่มต้น ═══════════════

function PriceSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-price-card"
      title="ประเภทราคาเริ่มต้น"
      desc="ราคาที่คุณพิมพ์ในฟอร์มเอกสาร หมายถึงราคาก่อนหรือหลังรวม VAT"
    >
      <label className={labelCls}>
        ค่าเริ่มต้นของฟอร์มเอกสาร
        <select name="defaultPriceMode" defaultValue={v.defaultPriceMode} className="input" data-testid="policy-price-mode">
          <option value="">ตามสถานะจด VAT ของกิจการ (แนะนำ)</option>
          <option value="EXCL_VAT">{PRICE_MODE_POLICY_LABEL.EXCL_VAT}</option>
          <option value="INCL_VAT">{PRICE_MODE_POLICY_LABEL.INCL_VAT}</option>
          <option value="NO_VAT">{PRICE_MODE_POLICY_LABEL.NO_VAT}</option>
        </select>
      </label>
      <p className={helpCls}>ถ้าผู้ติดต่อรายนั้นตั้งประเภทราคาไว้เอง ระบบจะใช้ของผู้ติดต่อก่อนเสมอ</p>
    </Card>
  );
}

// ═══════════════ ⑤ ล็อกข้อมูลก่อนวันที่ ═══════════════

function LockSection({ v }: { v: PolicyView }) {
  // 🔴 ปุ่ม "ปลดล็อก" ต้องล้างค่าในช่องจริง ๆ ก่อน submit
  //    (ถ้าใช้ปุ่ม submit ที่มี name/value ค่าจะไม่เข้า FormData ที่สร้างจาก form element — เงียบและหาไม่เจอ)
  const [date, setDate] = useState(v.lockBeforeDate);
  return (
    <Card
      testId="policy-lock-card"
      title="ล็อกข้อมูลก่อนวันที่"
      desc="ปิดไม่ให้ใครบันทึก แก้ไข หรือยกเลิกรายการย้อนหลังก่อนวันที่กำหนด — ใช้หลังปิดงบหรือยื่นภาษีเรียบร้อยแล้ว"
    >
      <label className={labelCls}>
        ล็อกข้อมูลก่อนวันที่
        {/* 🔴 ต้องใช้ `DateInput` เสมอ — ช่องวันที่ของเบราว์เซอร์โชว์ "08/31/2026" ซึ่งเจ้าของอ่านไม่รู้เรื่อง
            (ดูหัวไฟล์ DateInput.tsx) · ค่า ISO ที่ส่งเข้าฟอร์มอยู่ใน hidden input ชื่อ lockBeforeDate */}
        <DateInput name="lockBeforeDate" value={date} onChange={setDate} testId="policy-lock-date" />
      </label>
      {v.lockBeforeDateText ? (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="policy-lock-note">
          ⚠ ตอนนี้ล็อกอยู่ — บันทึก/แก้ไข/ยกเลิก เอกสาร การรับ-จ่ายเงิน และสมุดรายวัน ที่ลงวันที่<b>ก่อน</b>{" "}
          {v.lockBeforeDateText} ไม่ได้ (วันที่ {v.lockBeforeDateText} เองยังบันทึกได้) · การดูรายงานย้อนหลังไม่กระทบ
        </p>
      ) : (
        <p className={helpCls} data-testid="policy-lock-note">
          ยังไม่ได้ล็อก — ทุกคนที่มีสิทธิ์ยังบันทึกย้อนหลังได้ทุกวัน
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm whitespace-nowrap"
          data-testid="policy-lock-clear"
          disabled={!date}
          onClick={() => setDate("")}
        >
          ปลดล็อก
        </button>
        <span className={helpCls}>กดปลดล็อกแล้วกด “บันทึก” = เปิดให้แก้ย้อนหลังได้ทั้งหมด</span>
      </div>
    </Card>
  );
}

// ═══════════════ ⑥ การสร้างชื่อซ้ำ ═══════════════

function DupSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-dup-card"
      title="การสร้างชื่อซ้ำ"
      desc="เมื่อมีคนสร้างผู้ติดต่อหรือสินค้าชื่อเดียวกับที่มีอยู่แล้ว ให้ระบบทำอย่างไร"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          ผู้ติดต่อชื่อซ้ำ
          <select name="dupContactPolicy" defaultValue={v.dupContactPolicy} className="input" data-testid="policy-dup-contact">
            <option value="WARN">{DUP_POLICY_LABEL.WARN}</option>
            <option value="BLOCK">{DUP_POLICY_LABEL.BLOCK}</option>
          </select>
        </label>
        <label className={labelCls}>
          สินค้า/บริการชื่อซ้ำ
          <select name="dupProductPolicy" defaultValue={v.dupProductPolicy} className="input" data-testid="policy-dup-product">
            <option value="WARN">{DUP_POLICY_LABEL.WARN}</option>
            <option value="BLOCK">{DUP_POLICY_LABEL.BLOCK}</option>
          </select>
        </label>
      </div>
      <p className={helpCls}>
        เลขประจำตัวผู้เสียภาษีซ้ำ และรหัสสินค้า (SKU) ซ้ำ ห้ามเสมอไม่ว่าตั้งค่านี้ไว้อย่างไร — เป็นตัวชี้ตัวตนที่ซ้ำกันไม่ได้
      </p>
    </Card>
  );
}

// ═══════════════ ⑦ บัญชีรายรับ/รายจ่ายเริ่มต้น ═══════════════

function AccountsSection({ v, income, expense }: { v: PolicyView; income: LedgerOpt[]; expense: LedgerOpt[] }) {
  const opt = (rows: LedgerOpt[]) =>
    rows.map((l) => (
      <option key={l.code} value={l.code}>
        {l.code} {l.name}
      </option>
    ));
  return (
    <Card
      testId="policy-accounts-card"
      title="บัญชีรายรับ/รายจ่ายเริ่มต้น"
      desc="บัญชีที่ระบบใช้ลงรายการเมื่อบรรทัดในเอกสารไม่ได้ระบุบัญชีเอง"
    >
      <label className={labelCls}>
        บัญชีขาย (รายได้)
        <select name="defaultSalesAccountCode" defaultValue={v.defaultSalesAccountCode} className="input" data-testid="policy-acc-sales">
          <option value="">— ใช้ค่ามาตรฐานของระบบ —</option>
          {opt(income)}
        </select>
      </label>
      <label className={labelCls}>
        บัญชีซื้อสินค้า
        <select name="defaultPurchaseAccountCode" defaultValue={v.defaultPurchaseAccountCode} className="input" data-testid="policy-acc-purchase">
          <option value="">— ใช้ค่ามาตรฐานของระบบ —</option>
          {opt(expense)}
        </select>
      </label>
      <label className={labelCls}>
        บัญชีค่าใช้จ่ายทั่วไป
        <select name="defaultExpenseAccountCode" defaultValue={v.defaultExpenseAccountCode} className="input" data-testid="policy-acc-expense">
          <option value="">— ใช้ค่ามาตรฐานของระบบ —</option>
          {opt(expense)}
        </select>
      </label>
      <p className={helpCls}>เปลี่ยนแล้วมีผลกับเอกสารที่ลงบัญชีหลังจากนี้ — ใบที่ลงไปแล้วไม่ย้ายบัญชีเอง</p>
    </Card>
  );
}

// ═══════════════ ⑧ การออกเอกสารต่อ ═══════════════

function ConvertSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-convert-card"
      title="การออกเอกสารต่อ"
      desc="เมื่อกดปุ่มออกเอกสารต่อจากใบเดิม ให้ไปเอกสารชนิดไหนก่อน และคัดลอกอะไรไปด้วย"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          จากใบเสนอราคา ไปที่
          <select name="convertQtTo" defaultValue={v.convertQtTo} className="input" data-testid="policy-convert-qt">
            <option value="INVOICE">{CONVERT_QT_LABEL.INVOICE}</option>
            <option value="DEPOSIT_RECEIPT">{CONVERT_QT_LABEL.DEPOSIT_RECEIPT}</option>
          </select>
        </label>
        <label className={labelCls}>
          จากใบสั่งซื้อ ไปที่
          <select name="convertPoTo" defaultValue={v.convertPoTo} className="input" data-testid="policy-convert-po">
            <option value="PURCHASE">{CONVERT_PO_LABEL.PURCHASE}</option>
            <option value="EXPENSE">{CONVERT_PO_LABEL.EXPENSE}</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3">
        <Toggle
          name="copyNotesOnConvert"
          label="คัดลอกหมายเหตุไปเอกสารใหม่"
          desc="หมายเหตุท้ายเอกสารของใบต้นทางจะถูกใส่ให้ใบใหม่อัตโนมัติ"
          defaultChecked={v.copyNotesOnConvert}
          testId="policy-copy-notes"
        />
        <Toggle
          name="copyTagsOnConvert"
          label="คัดลอกแท็กไปเอกสารใหม่"
          desc="แท็กจัดประเภท (เช่น ทริปสิมิลัน) ติดไปกับใบใหม่ด้วย"
          defaultChecked={v.copyTagsOnConvert}
          testId="policy-copy-tags"
        />
      </div>
      <p className={helpCls}>ใบสั่งซื้อสินทรัพย์จะไปที่ “ซื้อสินทรัพย์” เสมอ เพราะต้องเข้าทะเบียนสินทรัพย์</p>
    </Card>
  );
}

// ═══════════════ ⑨ ลูกค้าประจำ ═══════════════

function RegularSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-regular-card"
      title="นิยามลูกค้าประจำ"
      desc="ใช้กับตัวกรอง “ลูกค้าประจำ” ในหน้าผู้ติดต่อ — นับจากเงินที่รับจริง ไม่ใช่แค่สถานะเอกสาร"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          ซื้ออย่างน้อย (ครั้ง)
          <input name="rcMinPaidDocs" type="number" min={1} defaultValue={v.regularCustomer.minPaidDocs} className="input" data-testid="policy-rc-docs" />
        </label>
        <label className={labelCls}>
          หรือยอดรวมอย่างน้อย (บาท)
          <input name="rcMinPaidTotalBaht" type="number" step="0.01" min={0} defaultValue={v.regularCustomer.minPaidTotalBaht} className="input" data-testid="policy-rc-total" />
        </label>
        <label className={labelCls}>
          ภายในช่วง (เดือน)
          <input name="rcPeriodMonths" type="number" min={1} max={120} defaultValue={v.regularCustomer.periodMonths} className="input" data-testid="policy-rc-months" />
        </label>
      </div>
      <p className={helpCls} data-testid="policy-rc-count">
        ตอนนี้เข้าเกณฑ์ <span className="font-medium text-[color:var(--color-ink)]">{v.regularCustomerCount} ราย</span>
      </p>
    </Card>
  );
}

// ═══════════════ ⑩ ปิดงวดอัตโนมัติ ═══════════════

function AutoCloseSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-autoclose-card"
      title="ปิดงวดอัตโนมัติ"
      desc="ระบบปิดงวดของเดือนก่อนให้เอง เมื่อเช็กลิสต์ผ่านครบ (บัญชีพักเคลียร์ + ไม่มีใบสำคัญที่ต้องตรวจ)"
    >
      <input type="hidden" name="autoCloseSection" value="1" />
      <div className="flex flex-col gap-3">
        <Toggle
          name="autoClosePeriods"
          label="ปิดงวดของเดือนก่อนให้อัตโนมัติ"
          desc="ถ้าเช็กลิสต์ยังไม่ผ่าน ระบบจะไม่ปิดและไม่แก้ข้อมูลใด ๆ"
          defaultChecked={v.autoClosePeriods}
          testId="policy-autoclose-on"
        />
        <Toggle
          name="autoCloseNotify"
          label="แจ้งเตือนผลการปิดงวด"
          desc="ส่งแจ้งเตือนในระบบทั้งตอนปิดสำเร็จและตอนปิดไม่ได้ (แจ้งครั้งเดียวต่องวด)"
          defaultChecked={v.autoCloseNotify}
          testId="policy-autoclose-notify"
        />
      </div>
    </Card>
  );
}

// ═══════════════ ⑪ รายงานทางอีเมล ═══════════════

function EmailSection({ v }: { v: PolicyView }) {
  return (
    <Card
      testId="policy-email-card"
      title="รายงานทางอีเมล"
      desc="สรุปเงินในมือ ค้างรับ ค้างจ่าย เลยกำหนด และงานที่รอคุณ ส่งเข้าอีเมลตามรอบที่เลือก"
    >
      <input type="hidden" name="emailReportSection" value="1" />
      <div className="flex flex-col gap-3">
        <Toggle
          name="emailReportDaily"
          label="สรุปรายวัน"
          desc="ส่งทุกเช้า (เวลาไทย)"
          defaultChecked={v.emailReportDaily}
          testId="policy-email-daily"
        />
        <Toggle
          name="emailReportWeekly"
          label="สรุปรายสัปดาห์"
          desc="ส่งเช้าวันจันทร์"
          defaultChecked={v.emailReportWeekly}
          testId="policy-email-weekly"
        />
      </div>
      <label className={labelCls}>
        ส่งถึงใคร (อีเมล คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)
        <textarea
          name="emailReportRecipients"
          rows={3}
          defaultValue={v.emailReportRecipients}
          placeholder="owner@example.com, accountant@example.com"
          className="input"
          data-testid="policy-email-recipients"
        />
      </label>
      <p className={helpCls}>รายงานมีแต่ตัวเลขรวม ไม่มีชื่อหรือเบอร์ลูกค้าอยู่ในอีเมล</p>
    </Card>
  );
}

// ═══════════════ ⑫ Smart Insight 🕓 ═══════════════

function InsightSection() {
  return (
    <section className="card flex flex-col gap-2 p-5 opacity-60" data-testid="policy-insight-card">
      <h2 className="text-sm font-medium">
        Smart Insight <span className="ml-1 rounded-md border px-1.5 py-0.5 text-[11px] font-normal">เร็ว ๆ นี้</span>
      </h2>
      <p className={helpCls}>
        ให้ระบบอ่านตัวเลขของกิจการแล้วบอกเป็นภาษาคนว่าเดือนนี้ควรระวังอะไร เช่น ลูกค้ารายไหนเริ่มจ่ายช้าลง
        หรือค่าใช้จ่ายหมวดไหนโตผิดปกติ — กำลังพัฒนา
      </p>
    </section>
  );
}

export default PolicyPanel;
