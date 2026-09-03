import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { requireAccountPage } from "./guard";
// 🔴 หน้านี้ **ไม่ import prisma** — ทุกการอ่าน DB ผ่านชั้น service/product (fitness F5)
import {
  getRecurringRule,
  getSettings,
  listRecurringRules,
  buildRuleDraftFromDocument,
  type RecurringRuleRow,
} from "./service";
import { listExpenseAccounts, listIncomeAccounts, listProducts, listUnits } from "./product";
import { toggleRecurringRuleAction, runRecurringNowAction } from "./recurring-actions";
import {
  RECURRING_DOC_LABEL,
  RECURRING_DOC_TYPES,
  isRecurringDocType,
  scheduleLabel,
  ymd,
  type RecurringTemplate,
} from "./recurring-shared";
import { RecurringRuleForm, type RecurringFormInitial } from "@/components/account-v2/RecurringRuleForm";
import { newLineDraft, type LineDraft } from "@/components/account-v2/doc-editor-types";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTh } from "@/lib/ui/date";

// ─────────────────────────────────────────────────────────────
// recurring-page.tsx — ตัวประกอบหน้า (server) ของ "เอกสารประจำ" (WO 1.9)
// 2 หน้า: รายการกฎ · ฟอร์มสร้าง/แก้ไข — เขียนรวมไฟล์เดียวเหมือน group-page.tsx / expense-page.tsx
// ─────────────────────────────────────────────────────────────

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function templateTotalSatang(t: RecurringTemplate): number {
  return t.lines.reduce((s, l) => s + Math.max(0, Math.round(l.qty * l.unitPriceSatang) - l.discountSatang), 0);
}

function docLabelOf(dt: AccountDocType): string {
  return RECURRING_DOC_LABEL[dt] ?? dt;
}

// ═══════════════════ หน้ารายการ ═══════════════════

export async function RecurringListPage({
  systemId,
  msg,
  err,
}: {
  systemId: string;
  msg?: string;
  err?: string;
}) {
  const { tenantId } = await requireAccountPage(systemId, "account.doc.view");
  const base = `/app/sys/${systemId}/account`;
  const rules = await listRecurringRules(tenantId, systemId);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4" data-testid="recurring-list">
      <PageHeader
        title="เอกสารประจำ"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc="ตั้งครั้งเดียว ระบบออกเอกสารให้เองทุกงวด แล้วแจ้งเตือนให้คุณตรวจ"
        actions={
          <>
            <form action={runRecurringNowAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <SubmitButton className="btn btn-ghost text-sm" pendingText="กำลังสร้าง…">
                สร้างรอบที่ถึงกำหนด
              </SubmitButton>
            </form>
            <Link href={`${base}/recurring/new`} className="btn text-sm" data-testid="btn-new-rule">
              + ตั้งเอกสารประจำ
            </Link>
          </>
        }
      />

      {msg && (
        <p className="text-sm font-medium" data-testid="recurring-msg">
          {msg}
        </p>
      )}
      {err && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="recurring-err">
          {err}
        </p>
      )}

      {rules.length === 0 ? (
        <EmptyState
          text="ยังไม่มีเอกสารประจำ — ตั้งใบแจ้งหนี้ค่าเช่า/ค่าบริการรายเดือนไว้ แล้วระบบจะร่างให้เองทุกงวด"
          action={{ href: `${base}/recurring/new`, label: "+ ตั้งเอกสารประจำ" }}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm" data-testid="recurring-table">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">ชื่อ</th>
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">ชนิด</th>
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">ผู้ติดต่อ</th>
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">ความถี่</th>
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">รอบถัดไป</th>
                <th className="px-4 py-3 text-right text-xs font-normal text-[color:var(--color-muted)]">มูลค่าต่อรอบ</th>
                <th className="px-4 py-3 text-left text-xs font-normal text-[color:var(--color-muted)]">สถานะ</th>
                <th className="px-4 py-3 text-right text-xs font-normal text-[color:var(--color-muted)]">ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRow key={r.id} rule={r} base={base} systemId={systemId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[color:var(--color-muted)]">
        ระบบตรวจรอบให้ทุกวันตอนเช้า · เอกสารที่สร้างจะติดป้าย &ldquo;ประจำ&rdquo; และมีที่มาเป็น
        &ldquo;เอกสารประจำ&rdquo; ให้ค้นหาย้อนหลังได้
      </p>
    </div>
  );
}

function RuleRow({ rule, base, systemId }: { rule: RecurringRuleRow; base: string; systemId: string }) {
  const total = templateTotalSatang(rule.template);
  return (
    <tr className="border-b last:border-0" data-testid={`rec-row-${rule.id}`}>
      <td className="px-4 py-3">
        <Link href={`${base}/recurring/${rule.id}/edit`} className="font-medium underline-offset-2 hover:underline">
          {rule.name}
        </Link>
        {rule.autoApprove && (
          <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] text-[color:var(--color-muted)]">
            ออกอัตโนมัติ
          </span>
        )}
      </td>
      <td className="px-4 py-3">{docLabelOf(rule.docType)}</td>
      <td className="px-4 py-3">{rule.contactName ?? "—"}</td>
      <td className="px-4 py-3">
        {scheduleLabel({
          frequency: rule.frequency,
          dayOfMonth: rule.dayOfMonth,
          weekday: rule.weekday,
          startDate: rule.startDate,
        })}
      </td>
      <td className="px-4 py-3" data-testid={`rec-next-${rule.id}`}>
        {rule.active ? formatDateTh(rule.nextRunAt) : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">฿{baht(total)}</td>
      <td className="px-4 py-3">
        <span
          className="rounded-full border px-2 py-0.5 text-xs"
          data-testid={`rec-status-${rule.id}`}
          style={rule.active ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
        >
          {rule.active ? "ทำงานอยู่" : "หยุดชั่วคราว"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Link href={`${base}/recurring/${rule.id}/edit`} className="btn-sm">
            แก้ไข
          </Link>
          <form action={toggleRecurringRuleAction}>
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="id" value={rule.id} />
            <input type="hidden" name="active" value={rule.active ? "0" : "1"} />
            <SubmitButton className="btn-sm" pendingText="…">
              {rule.active ? "หยุดชั่วคราว" : "เปิดใช้งาน"}
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

// ═══════════════════ ฟอร์มสร้าง/แก้ไข ═══════════════════

const EMPTY_TEMPLATE: RecurringTemplate = {
  priceMode: "EXCL_VAT",
  lines: [],
  note: "",
  tags: [],
  dueDays: null,
};

export async function RecurringFormPage({
  systemId,
  ruleId,
  fromDocId,
  docTypeHint,
}: {
  systemId: string;
  ruleId?: string;
  /** `?from=<docId>` — ปุ่ม "ตั้งเป็นเอกสารประจำ" บนหน้าเอกสาร (§5.3 ⋯) */
  fromDocId?: string;
  docTypeHint?: string;
}) {
  const { tenantId } = await requireAccountPage(systemId, "account.doc.create");
  const base = `/app/sys/${systemId}/account`;

  const rule = ruleId ? await getRecurringRule(tenantId, systemId, ruleId) : null;
  if (ruleId && !rule) notFound();

  const prefill = !rule && fromDocId ? await buildRuleDraftFromDocument(tenantId, systemId, fromDocId) : null;

  const [settings, products, units, incomeAccounts, expenseAccounts] = await Promise.all([
    getSettings(tenantId, systemId),
    listProducts(tenantId, systemId),
    listUnits(tenantId, systemId),
    listIncomeAccounts(tenantId, systemId),
    listExpenseAccounts(tenantId, systemId),
  ]);
  const unitNameOf = new Map(units.map((u) => [u.id, u.name]));

  const template = rule?.template ?? prefill?.template ?? EMPTY_TEMPLATE;
  const docType =
    rule?.docType ??
    prefill?.docType ??
    (isRecurringDocType(docTypeHint) ? (docTypeHint as AccountDocType) : RECURRING_DOC_TYPES[0]);

  const lines: LineDraft[] = template.lines.length
    ? template.lines.map((l) => ({
        ...newLineDraft(settings.vatRateBp),
        productId: l.productId,
        name: l.name,
        description: l.description,
        descriptionOpen: l.description.length > 0,
        accountId: l.accountId,
        qty: l.qty,
        unitName: l.unitName ?? "",
        unitPriceSatang: l.unitPriceSatang,
        discount: {
          mode: "amount" as const,
          satang: l.qty > 0 ? Math.round(l.discountSatang / l.qty) : l.discountSatang,
          percentBp: 0,
        },
        vatRateBp: l.vatRateBp,
      }))
    : [newLineDraft(settings.vatRateBp)];

  const isRevenueType = docType === "INVOICE" || docType === "QUOTATION";
  const today = ymd(new Date());
  const initial: RecurringFormInitial = {
    ruleId: rule?.id,
    name: rule?.name ?? prefill?.name ?? "",
    docType,
    contactId: rule?.contactId ?? prefill?.contactId ?? null,
    contactLabel: rule?.contactName ?? "",
    frequency: rule?.frequency ?? "MONTHLY",
    dayOfMonth: rule?.dayOfMonth ?? null,
    weekday: rule?.weekday ?? null,
    startDate: rule ? ymd(rule.startDate) : today,
    endDate: rule?.endDate ? ymd(rule.endDate) : "",
    leadDays: rule?.leadDays ?? 0,
    autoApprove: rule?.autoApprove ?? false,
    active: rule?.active ?? true,
    priceMode: template.priceMode,
    dueDays: template.dueDays,
    note: template.note,
    lines,
  };

  return (
    <RecurringRuleForm
      systemId={systemId}
      base={base}
      initial={initial}
      products={products.slice(0, 20).map((p) => ({
        id: p.id,
        name: p.name,
        sub: p.sku ?? undefined,
        priceSatang: (isRevenueType ? p.salePrice : p.buyPrice) ?? p.salePrice ?? 0,
        unitName: p.unitId ? (unitNameOf.get(p.unitId) ?? null) : null,
        vatRateBp: p.vatRateBp,
        accountId: (isRevenueType ? p.incomeAccountId : p.expenseAccountId) ?? null,
      }))}
      incomeAccounts={incomeAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
      expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
      vatRegistered={settings.vatRegistered}
      vatRateBp={settings.vatRateBp}
    />
  );
}
