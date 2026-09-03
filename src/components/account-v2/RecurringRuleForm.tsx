"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SectionCard } from "./SectionCard";
import { DateInput } from "./DateInput";
import { ContactPicker, type ContactSearchResult } from "./ContactPicker";
import { DocLineTable } from "./DocLineTable";
import { DocTotals } from "./DocTotals";
import { StickyBar } from "./StickyBar";
import { newLineDraft, type ContactOption, type LedgerOption, type LineDraft, type ProductOption } from "./doc-editor-types";
import { computeDocTotals, type PriceMode } from "@/lib/modules/account/totals";
// 🔵 import server action ตรง ๆ เหมือน DocEditorV2 (บรรทัด 12–13 ของไฟล์นั้น) — ไม่ส่งผ่าน prop
import { searchContactsAction, searchProductsAction } from "@/lib/modules/account/editor-actions";
import { saveRecurringRuleAction } from "@/lib/modules/account/recurring-actions";
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  RECURRING_DOC_LABEL,
  RECURRING_DOC_TYPES,
  WEEKDAY_LABEL,
  firstRunAt,
  normDayOfMonth,
  parseYmd,
  scheduleLabel,
  ymd,
  type RecurringRulePayload,
  type SaveRuleResult,
} from "@/lib/modules/account/recurring-shared";

// ─────────────────────────────────────────────────────────────
// RecurringRuleForm — ฟอร์ม "เอกสารประจำ" (WO 1.9 · BLUEPRINT §0.3 ข้อ 7)
//
// = ฟอร์มเอกสาร §5.2 **ตัดวันที่ออก** แล้วเติม "การ์ดตารางเวลา" เข้าไปแทน
//   ⇒ ใช้ส่วนประกอบตัวเดียวกับ DocEditorV2 จริง ๆ (DocLineTable · DocTotals · ContactPicker · SectionCard)
//     ไม่ใช่ตารางที่วาดใหม่ — สูตรเงินก็เรียก computeDocTotals ตัวเดียวกับ server
//
// 🔴 ทำไมไม่ใช้ตัว DocEditorV2 ทั้งก้อน: ตัวนั้นผูกกับ "เอกสาร 1 ใบ" ตั้งแต่ autosave (saveDraftAction),
//    เลขที่เอกสาร, แนบไฟล์, อนุมัติ, รับชำระ — กฎเอกสารประจำไม่มีสิ่งเหล่านั้นเลย
//    การยัดโหมด template เข้าไปจะไปแตะเส้นทางที่ Fable QC ผ่านแล้ว 3 รอบใน WO 1.3 (เสี่ยงเกินได้)
// ─────────────────────────────────────────────────────────────

export type RecurringFormInitial = {
  ruleId?: string;
  name: string;
  docType: string;
  contactId: string | null;
  contactLabel: string;
  frequency: string;
  dayOfMonth: number | null;
  weekday: number | null;
  startDate: string;
  endDate: string;
  leadDays: number;
  autoApprove: boolean;
  active: boolean;
  priceMode: PriceMode;
  dueDays: number | null;
  note: string;
  lines: LineDraft[];
};

export function RecurringRuleForm({
  systemId,
  base,
  initial,
  products,
  incomeAccounts,
  expenseAccounts,
  vatRegistered,
  vatRateBp,
}: {
  systemId: string;
  base: string;
  initial: RecurringFormInitial;
  products: ProductOption[];
  incomeAccounts: LedgerOption[];
  expenseAccounts: LedgerOption[];
  vatRegistered: boolean;
  vatRateBp: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [docType, setDocType] = useState(initial.docType);
  const [contactId, setContactId] = useState<string | null>(initial.contactId);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [dayOfMonth, setDayOfMonth] = useState<number>(initial.dayOfMonth ?? 1);
  const [weekday, setWeekday] = useState<number>(initial.weekday ?? 1);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [leadDays, setLeadDays] = useState(initial.leadDays);
  const [autoApprove, setAutoApprove] = useState(initial.autoApprove);
  const [active, setActive] = useState(initial.active);
  const [priceMode, setPriceMode] = useState<PriceMode>(initial.priceMode);
  const [dueDays, setDueDays] = useState<string>(initial.dueDays == null ? "" : String(initial.dueDays));
  const [note, setNote] = useState(initial.note);
  const [lines, setLines] = useState<LineDraft[]>(initial.lines.length ? initial.lines : [newLineDraft(vatRateBp)]);
  const [error, setError] = useState("");

  const isRevenue = docType === "INVOICE" || docType === "QUOTATION";
  const accounts = isRevenue ? incomeAccounts : expenseAccounts;
  const weekly = frequency === "WEEKLY";

  const totals = useMemo(
    () =>
      computeDocTotals({
        lines: lines.map((l) => ({
          qty: l.qty,
          unitPriceSatang: l.unitPriceSatang,
          discount: l.discount,
          vatRateBp: l.vatRateBp,
        })),
        priceMode,
        vatRegistered,
        vatRateBp,
      }),
    [lines, priceMode, vatRegistered, vatRateBp],
  );

  // "รอบถัดไป" คิดด้วยสูตรเดียวกับที่ cron ใช้ (recurring-shared) — จอกับเครื่องต้องพูดตรงกัน
  const nextRunPreview = useMemo(() => {
    const start = parseYmd(startDate);
    if (!start) return null;
    return firstRunAt({
      frequency: frequency as never,
      dayOfMonth: weekly ? null : normDayOfMonth(dayOfMonth),
      weekday: weekly ? weekday : null,
      startDate: start,
    });
  }, [startDate, frequency, dayOfMonth, weekday, weekly]);

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.key !== key)));
  const reorderLine = (from: number, to: number) =>
    setLines((ls) => {
      const next = [...ls];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });

  const onSubmit = () => {
    setError("");
    const payload: RecurringRulePayload = {
      systemId,
      ruleId: initial.ruleId,
      name,
      docType,
      contactId,
      frequency,
      dayOfMonth: weekly ? null : normDayOfMonth(dayOfMonth),
      weekday: weekly ? weekday : null,
      startDate,
      endDate: endDate || null,
      leadDays,
      autoApprove,
      active,
      template: {
        priceMode,
        note,
        tags: [],
        dueDays: dueDays === "" ? null : Number(dueDays),
        lines: lines
          .filter((l) => l.name.trim().length > 0)
          .map((l) => ({
            name: l.name,
            description: l.description,
            qty: l.qty,
            unitName: l.unitName || null,
            unitPriceSatang: l.unitPriceSatang,
            vatRateBp: l.vatRateBp,
            // ฟอร์มนี้รับส่วนลดเป็นจำนวนเงิน/หน่วย (เหมือน DocEditorV2) → เก็บเป็นสตางค์ต่อบรรทัดทั้งบรรทัด
            discountSatang: Math.max(0, Math.round(l.discount.satang * (l.qty || 0))),
            productId: l.productId,
            accountId: l.accountId,
          })),
      },
    };
    startTransition(async () => {
      const res: SaveRuleResult = await saveRecurringRuleAction(payload);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`${base}/recurring?msg=${encodeURIComponent("บันทึกเอกสารประจำแล้ว")}`);
      router.refresh();
    });
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4" data-testid="recurring-form">
      <div className="flex flex-col gap-1">
        <Link href={`${base}/recurring`} className="text-sm text-[color:var(--color-muted)]">
          ← เอกสารประจำ
        </Link>
        <h1 className="text-2xl font-semibold">{initial.ruleId ? "แก้ไขเอกสารประจำ" : "ตั้งเอกสารประจำ"}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          ระบบจะสร้างเอกสารตามแม่แบบนี้ให้เองทุกงวด แล้วแจ้งเตือนให้คุณตรวจ
        </p>
      </div>

      {error && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="recurring-error">
          {error}
        </p>
      )}

      {/* ── การ์ดตารางเวลา (ของใหม่ของฟอร์มนี้) ── */}
      <SectionCard title="ตารางเวลา" testId="card-schedule">
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ชื่อเอกสารประจำ</span>
            <input
              className="input"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="ค่าเช่าสำนักงาน รายเดือน"
              data-testid="rec-name"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ชนิดเอกสาร</span>
            <select
              className="input"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              data-testid="rec-doctype"
            >
              {RECURRING_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RECURRING_DOC_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ความถี่</span>
            <select
              className="input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              data-testid="rec-frequency"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>

          {weekly ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">วันในสัปดาห์</span>
              <select
                className="input"
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                data-testid="rec-weekday"
              >
                {WEEKDAY_LABEL.map((w, i) => (
                  <option key={w} value={i}>
                    วัน{w}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">วันที่ของเดือน</span>
              <select
                className="input"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                data-testid="rec-dayofmonth"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    วันที่ {d}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[color:var(--color-muted)]">
                เดือนที่ไม่มีวันที่นี้ ระบบจะใช้วันสุดท้ายของเดือนแทน
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">วันที่เริ่ม</span>
            <DateInput value={startDate} onChange={setStartDate} testId="rec-start" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">วันที่สิ้นสุด (ไม่ใส่ = ทำไปเรื่อย ๆ)</span>
            <DateInput value={endDate} onChange={setEndDate} testId="rec-end" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">สร้างล่วงหน้า (วัน)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={60}
              value={leadDays}
              onChange={(e) => setLeadDays(Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
              data-testid="rec-leaddays"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ครบกำหนดชำระ (วันหลังวันที่ออก)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={365}
              value={dueDays}
              placeholder="ตามค่าเริ่มต้นของกิจการ"
              onChange={(e) => setDueDays(e.target.value)}
              data-testid="rec-duedays"
            />
          </label>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                data-testid="rec-autoapprove"
              />
              ออกเอกสารอัตโนมัติ (ไม่ต้องรอคนอนุมัติ)
            </label>
            <p className="pl-6 text-xs text-[color:var(--color-muted)]">
              ปิดไว้ = ระบบสร้างเป็น &ldquo;ร่าง&rdquo; แล้วแจ้งเตือนให้ตรวจก่อนออกจริง ·
              เปิดไว้แต่ข้อมูลไม่ครบ ระบบก็ยังคงเป็นร่างและบอกเหตุผลให้
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="rec-active"
              />
              เปิดใช้งาน
            </label>
          </div>

          <p className="text-sm sm:col-span-2" data-testid="rec-next-preview">
            {nextRunPreview
              ? `${scheduleLabel({
                  frequency: frequency as never,
                  dayOfMonth: weekly ? null : dayOfMonth,
                  weekday: weekly ? weekday : null,
                  startDate: parseYmd(startDate) ?? new Date(),
                })} · รอบถัดไป ${ymd(nextRunPreview)}`
              : "ใส่วันที่เริ่มเพื่อดูรอบถัดไป"}
          </p>
        </div>
      </SectionCard>

      {/* ── ผู้ติดต่อ (ส่วนหัวเอกสาร §5.2 B แบบไม่มีวันที่) ── */}
      <SectionCard title="ผู้ติดต่อ" testId="card-contact">
        <div className="px-5 pb-5">
          <ContactPicker
            defaultId={initial.contactId ?? undefined}
            defaultLabel={initial.contactLabel}
            testId="rec-contact"
            search={async (q) => {
              const rows: ContactOption[] = await searchContactsAction(systemId, q);
              return rows.map<ContactSearchResult>((c) => ({ id: c.id, name: c.name, sub: c.sub }));
            }}
            onSelect={(r) => setContactId(r.id)}
          />
          <p className="pt-2 text-xs text-[color:var(--color-muted)]">
            เอกสารทุกงวดจะออกให้ผู้ติดต่อรายนี้ · ไม่เลือก = ออกอัตโนมัติไม่ได้ (สร้างเป็นร่างอย่างเดียว)
          </p>
        </div>
      </SectionCard>

      {/* ── รายการ (ส่วน C ของ §5.2 — ตารางตัวเดียวกับฟอร์มเอกสาร) ── */}
      <SectionCard
        title="รายการในแม่แบบ"
        testId="card-lines"
        actions={
          <select
            className="input h-8 text-xs"
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value as PriceMode)}
            onClick={(e) => e.stopPropagation()}
            data-testid="rec-pricemode"
          >
            <option value="EXCL_VAT">แยก VAT</option>
            <option value="INCL_VAT">รวม VAT</option>
            <option value="NO_VAT">ไม่มี VAT</option>
          </select>
        }
      >
        <div className="flex flex-col gap-3 px-5 pb-5">
          <DocLineTable
            lines={lines}
            breakdown={totals.lines}
            accounts={accounts}
            products={products}
            searchProducts={(q) => searchProductsAction(systemId, q)}
            easy={false}
            requireLineAccount={!isRevenue}
            defaultVatRateBp={vatRateBp}
            invalidKeys={new Set()}
            onChange={patchLine}
            onRemove={removeLine}
            onReorder={reorderLine}
          />
          <div>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setLines((ls) => [...ls, newLineDraft(vatRateBp)])}
              data-testid="rec-add-line"
            >
              + เพิ่มรายการ
            </button>
          </div>
          <DocTotals
            totals={totals}
            vatRateBp={vatRateBp}
            vatRegistered={vatRegistered}
            docDiscount={{ mode: "amount", satang: 0, percentBp: 0 }}
            onDocDiscountChange={() => undefined}
          />
        </div>
      </SectionCard>

      <SectionCard title="หมายเหตุบนเอกสาร" testId="card-note" defaultOpen={false}>
        <div className="px-5 pb-5">
          <textarea
            className="input min-h-24"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            data-testid="rec-note"
          />
        </div>
      </SectionCard>

      <StickyBar
        testId="recurring-stickybar"
        secondary={
          <Link href={`${base}/recurring`} className="btn btn-ghost text-sm">
            ยกเลิก
          </Link>
        }
        primary={
          <button
            type="button"
            className="btn w-full text-sm"
            onClick={onSubmit}
            disabled={pending}
            data-testid="rec-save"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกเอกสารประจำ"}
          </button>
        }
      />
    </div>
  );
}

export default RecurringRuleForm;
