import Link from "next/link";
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { getDocDetailData, type DocDetailData, type RelatedSlot, type JvEntryView } from "@/lib/modules/account/doc-detail";
import { getSettings, DOC_LABEL, visibleConvertTargets } from "@/lib/modules/account/service";
import { editorListPath, editorDetailPath, editorEditPath, editorNewPath, sideOf } from "@/lib/modules/account/doc-editor-config";
import { EXP_DOC_LABEL } from "@/lib/modules/account/expense";
import { accountTone, StatusBadge } from "@/lib/modules/account/ui";
import { auditActionLabelTh } from "@/lib/modules/account/access";
import { storageEnabled } from "@/lib/storage/service";
import {
  issueDocumentAction,
  convertDocumentAction,
  quotationResponseAction,
  voidDocumentAction,
} from "@/lib/modules/account/actions";
import {
  issueExpenseDocAction,
  voidExpenseDocAction,
  receivePtxAction,
  markAssetReceivedAction,
  submitApprovalAction,
  approvePOAction,
  rejectPOAction,
  convertPOAction,
} from "@/lib/modules/account/expense-actions";
import { refundDepositFormAction } from "@/lib/modules/account/payment-actions";
import { accountPermFlags, type AccountPermFlags } from "@/lib/modules/account/guard";
// WO 1.9 — ⋯ "เตือนชำระ" (ส่งอีเมลจริง) + "ตั้งเป็นเอกสารประจำ"
import { sendPaymentReminderAction } from "@/lib/modules/account/recurring-actions";
import { paymentReminderBlockReason } from "@/lib/modules/account/service";
import { isRecurringDocType } from "@/lib/modules/account/recurring-shared";
import { isGroupDocType, groupDefOf } from "@/lib/modules/account/group";
import { PaymentPanel } from "./PaymentPanel";
// WO 5.5 — ลิงก์ชำระเงิน / QR PromptPay (§0.3 ข้อ 5)
import { PayLinkButton, type PayLinkView } from "./PayLinkButton";
import { PAYMENT_REQUEST_DOC_TYPES } from "@/lib/modules/account/payment-request";
import { confirmPaymentRequestAction, cancelPaymentRequestAction } from "@/lib/modules/account/payment-actions";
import { GroupPaymentPanel } from "./GroupPaymentPanel";
import { ShareLinkButton } from "./ShareLinkButton";
import { Stepper, type StepDef } from "./Stepper";
import type { RowActionItem } from "./RowActions";
import { DocMoreMenu, type DangerMenuItem } from "./DocMoreMenu";
import { DocAttachments } from "./DocAttachments";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatThaiDateLong as fmtDateLong, formatDateTh as fmtDate } from "@/lib/ui/date";
import { PAY_CHANNEL_LABEL } from "@/lib/ui/status-labels";

// ─────────────────────────────────────────────────────────────
// DocDetailPage — WO 1.5 · หน้าเอกสาร 1 ใบ ใช้ร่วมกันทั้งฝั่งรายรับ+รายจ่าย (DESIGN-SPEC-V2 §5.3)
// อ้างเฟรม g4-invoice-detail.png (เดสก์ท็อป) + f14-m-doc-detail.png (มือถือ)
// แทนที่ src/app/.../docs/[docType]/[docId]/page.tsx (ฝั่งรายรับ) และ ExpenseDetail (ฝั่งรายจ่าย)
// ─────────────────────────────────────────────────────────────

function Hidden({ systemId, docType, id }: { systemId: string; docType: string; id: string }) {
  return (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="id" value={id} />
    </>
  );
}

const PO_TYPES: readonly AccountDocType[] = ["PURCHASE_ORDER", "ASSET_PURCHASE_ORDER"];
const ADJUST_RECEIVED_TYPES: readonly AccountDocType[] = ["CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"];
const REVENUE_PAYABLE_TYPES: readonly AccountDocType[] = ["INVOICE", "DEPOSIT_RECEIPT", "BILLING_NOTE", "DEBIT_NOTE"];
const EXPENSE_PAYABLE_TYPES: readonly AccountDocType[] = ["PURCHASE", "EXPENSE", "ASSET_PURCHASE", "DEPOSIT_PAYMENT", "COMBINED_PAYMENT"];
const DEPOSIT_TYPES: readonly AccountDocType[] = ["DEPOSIT_RECEIPT", "DEPOSIT_PAYMENT"];
const ACTIVE_STATUSES = new Set(["DRAFT", "VOIDED", "CANCELLED", "REJECTED"]);
// WO 1.9 — ชนิดที่เมนู ⋯ โชว์รายการ "เตือนชำระ" (ตรงกับ PAYMENT_REMINDER_TYPES ฝั่ง service)
const PAYMENT_REMINDER_UI_TYPES: readonly AccountDocType[] = ["INVOICE", "BILLING_NOTE", "DEBIT_NOTE"];

function labelOf(dt: AccountDocType): string {
  return DOC_LABEL[dt] ?? EXP_DOC_LABEL[dt] ?? dt;
}

// §5.2 C: VAT ต่อบรรทัด — -1 = ยกเว้น (ไม่ใช่ 0%)
function vatLabel(vatRateBp: number): string {
  if (vatRateBp < 0) return "ยกเว้น";
  return `${vatRateBp / 100}%`;
}

// ─────────────────── ปุ่มดำหลัก + แถบปุ่มรอง ตามสถานะ (§5.3 "ปุ่มดำ action หลักตามสถานะ") ───────────────────
function ActionRow({
  data,
  systemId,
  side,
  base,
  editPath,
  vatRegistered,
  targets,
  perm,
}: {
  data: DocDetailData;
  systemId: string;
  side: "revenue" | "expense";
  base: string;
  editPath: string;
  vatRegistered: boolean;
  targets: AccountDocType[];
  /** WO 8.3 — ธงสิทธิ์ของผู้ใช้ปัจจุบัน (ปุ่มหาย = ไม่มีสิทธิ์ · action ก็ปฏิเสธด้วยกติกาเดียวกัน) */
  perm: AccountPermFlags;
}) {
  const dt = data.docType;
  const isPO = PO_TYPES.includes(dt);
  const isAdjustReceived = ADJUST_RECEIVED_TYPES.includes(dt);
  const canPay =
    perm.recordPayment &&
    (data.status === "AWAITING_PAYMENT" || data.status === "PARTIAL") &&
    (REVENUE_PAYABLE_TYPES.includes(dt) || EXPENSE_PAYABLE_TYPES.includes(dt));
  const canRefundDeposit = DEPOSIT_TYPES.includes(dt) && data.status === "AWAITING_DEDUCT";
  const hasTaxAlready = data.related.some((s) => s.kind === "TX" && s.doc);
  const canIssueTax = targets.includes("TAX_INVOICE") && !hasTaxAlready;

  let primary: React.ReactNode = null;

  if (data.status === "DRAFT") {
    primary = isPO ? (
      <form action={submitApprovalAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">ส่งอนุมัติ</SubmitButton>
      </form>
    ) : side === "expense" ? (
      <form action={issueExpenseDocAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">{isAdjustReceived ? "บันทึก" : "บันทึก/ตั้งเจ้าหนี้"}</SubmitButton>
      </form>
    ) : (
      <form action={issueDocumentAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">ออกเอกสาร</SubmitButton>
      </form>
    );
  } else if (dt === "QUOTATION" && data.status === "AWAITING_ACCEPT") {
    primary = (
      <form action={quotationResponseAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <input type="hidden" name="accepted" value="1" />
        <SubmitButton className="w-full md:w-auto">ลูกค้ายอมรับ</SubmitButton>
      </form>
    );
  } else if (isPO && data.status === "AWAITING_APPROVAL") {
    primary = (
      <form action={approvePOAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">อนุมัติ</SubmitButton>
      </form>
    );
  } else if (isPO && data.status === "APPROVED") {
    primary = (
      <form action={convertPOAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">แปลงเป็น{dt === "ASSET_PURCHASE_ORDER" ? "ซื้อสินทรัพย์" : "บันทึกซื้อ"}</SubmitButton>
      </form>
    );
  } else if (dt === "QUOTATION" && data.status === "ACCEPTED" && targets.length > 0) {
    // §9.3: ใบเสนอราคาที่ลูกค้ายอมรับแล้ว → ปุ่มหลัก = ปลายทางเริ่มต้นตามนโยบาย (ใบแจ้งหนี้ หรือ ใบรับเงินมัดจำ)
    primary = (
      <Link
        href={editorDetailPath(base, targets[0], data.id)}
        className="btn btn-primary w-full text-sm md:w-auto"
        data-testid="btn-convert-qt"
      >
        แปลงเป็น{DOC_LABEL[targets[0]] ?? targets[0]}
      </Link>
    );
  } else if (dt === "PURCHASE_TAX_INVOICE" && data.status === "AWAITING_RECEIVE") {
    primary = (
      <form action={receivePtxAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <SubmitButton className="w-full md:w-auto">รับใบกำกับแล้ว</SubmitButton>
      </form>
    );
  } else if (canPay && isGroupDocType(dt)) {
    // WO 1.7 §5.2 K — เอกสารกลุ่ม: 1 ครั้ง = กระจายลงใบลูกทุกใบ (แผงคนละตัวกับ §5.2 F)
    primary = (
      <GroupPaymentPanel
        systemId={systemId}
        docId={data.id}
        triggerLabel={groupDefOf(dt)?.texts.payAction ?? "รับชำระ"}
        triggerClassName="btn btn-primary w-full text-sm md:w-auto"
      />
    );
  } else if (canPay) {
    primary = (
      <PaymentPanel
        systemId={systemId}
        docId={data.id}
        triggerLabel={side === "expense" ? "บันทึกจ่าย" : "รับชำระ"}
        triggerClassName="btn btn-primary w-full text-sm md:w-auto"
      />
    );
  } else if (canRefundDeposit) {
    primary = (
      <ConfirmDialog
        action={refundDepositFormAction}
        fields={{ systemId, docType: dt, id: data.id }}
        reasonField={{ name: "reason", label: dt === "DEPOSIT_RECEIPT" ? "เหตุผลการคืนมัดจำ" : "เหตุผลการรับคืนมัดจำ" }}
        triggerLabel="คืนมัดจำ"
        triggerClassName="btn btn-primary w-full text-sm md:w-auto"
        title={dt === "DEPOSIT_RECEIPT" ? "คืนเงินมัดจำใบนี้?" : "รับเงินมัดจำคืนจากผู้ขาย?"}
        detail="ระบบจะกลับรายการบัญชีของใบมัดจำทั้งใบและปิดใบนี้เป็นยกเลิก"
        confirmLabel="ยืนยันคืนมัดจำ"
        danger
      />
    );
  } else if (canIssueTax) {
    primary = (
      <form action={convertDocumentAction}>
        <Hidden systemId={systemId} docType={dt} id={data.id} />
        <input type="hidden" name="toDocType" value="TAX_INVOICE" />
        <SubmitButton className="w-full md:w-auto">ออกใบกำกับ</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div data-testid="btn-primary-action" className="w-full md:w-auto">
        {primary}
      </div>
      {data.status === "DRAFT" && (
        <Link href={editPath} className="btn btn-ghost text-sm">
          แก้ไข
        </Link>
      )}
      {dt === "QUOTATION" && data.status === "AWAITING_ACCEPT" && (
        <form action={quotationResponseAction}>
          <Hidden systemId={systemId} docType={dt} id={data.id} />
          <input type="hidden" name="accepted" value="0" />
          <SubmitButton variant="ghost">ปฏิเสธ</SubmitButton>
        </form>
      )}
      {isPO && data.status === "AWAITING_APPROVAL" && (
        <ConfirmDialog
          action={rejectPOAction}
          fields={{ systemId, docType: dt, id: data.id }}
          reasonField={{ name: "reason", label: "เหตุผลไม่อนุมัติ" }}
          triggerLabel="ไม่อนุมัติ"
          triggerClassName="btn btn-ghost text-sm text-[color:var(--color-danger)]"
          title="ไม่อนุมัติใบสั่งซื้อนี้?"
          detail="ใบสั่งซื้อจะถูกปฏิเสธและนำไปทำรายการต่อไม่ได้"
          confirmLabel="ยืนยันไม่อนุมัติ"
          danger
        />
      )}
      {dt === "ASSET_PURCHASE" &&
        (data.status === "AWAITING_PAYMENT" || data.status === "PARTIAL" || data.status === "PAID") && (
          <form action={markAssetReceivedAction}>
            <Hidden systemId={systemId} docType={dt} id={data.id} />
            <SubmitButton variant="ghost">รับใบเสร็จแล้ว</SubmitButton>
          </form>
        )}
    </div>
  );
}

// Fable QC WO 1.5 รอบ 1: "ยกเลิกร่าง/ยกเลิกเอกสาร" ห้ามอยู่ข้างปุ่มดำหลัก — ย้ายเข้าเมนู "⋯" (รายการสุดท้าย)
function dangerMenuItemFor(data: DocDetailData, systemId: string, side: "revenue" | "expense"): DangerMenuItem | undefined {
  const dt = data.docType;
  const voidAction = side === "expense" ? voidExpenseDocAction : voidDocumentAction;
  if (data.status === "DRAFT") {
    return {
      action: voidAction,
      fields: { systemId, docType: dt, id: data.id, reason: "ยกเลิกร่าง" },
      triggerLabel: "ยกเลิกร่าง",
      title: "ยกเลิกร่างนี้?",
      detail: "ร่างเอกสารจะถูกยกเลิกและแก้ไขไม่ได้อีก",
      confirmLabel: "ยืนยันยกเลิก",
    };
  }
  if (!ACTIVE_STATUSES.has(data.status)) {
    return {
      action: voidAction,
      fields: { systemId, docType: dt, id: data.id },
      reasonField: { name: "reason", label: "เหตุผลการยกเลิก" },
      triggerLabel: "ยกเลิกเอกสาร",
      title: "ยกเลิกเอกสารนี้?",
      detail: "เอกสารจะถูกยกเลิก แก้ไขไม่ได้ และต้องออกใหม่เท่านั้น",
      confirmLabel: "ยืนยันยกเลิก",
    };
  }
  return undefined;
}

// ─────────────────── "⋯" ทำรายการ (§3) — แปลงเอกสารที่ยังทำได้จริง + placeholder "เร็ว ๆ นี้" ───────────────────
// WO 1.6 §5.2 J — เอกสารต้นทางที่ "ออกใบลดหนี้/เพิ่มหนี้" ได้จริง (สถานะที่ไม่ใช่ร่าง/ยกเลิก)
const CN_DN_SOURCE_TYPES: readonly AccountDocType[] = ["INVOICE", "RECEIPT", "TAX_INVOICE"];
const CNR_DNR_SOURCE_TYPES: readonly AccountDocType[] = ["PURCHASE", "EXPENSE"];

function moreActionsFor(data: DocDetailData, base: string, targets: AccountDocType[], systemId: string, detailPath: string): RowActionItem[] {
  const dt = data.docType;
  const items: RowActionItem[] = [];
  const soon = (label: string): RowActionItem => ({ label: `${label} (เร็ว ๆ นี้)`, href: "#" });
  const wizard = (adjustType: AccountDocType) => `${editorNewPath(base, adjustType)}?ref=${data.id}`;

  for (const t of targets) {
    if (t === "TAX_INVOICE" && data.related.some((s) => s.kind === "TX" && s.doc)) continue;
    // WO 1.6: CN/DN ไม่ใช่ "แปลง" ตรง ๆ อีกต่อไป — ข้ามที่นี่ (เติมทีเดียวรวม RE/TX ด้านล่าง แหล่งเดียว กัน href พังแบบเดิม
    // ที่เคยชี้ `docs/CREDIT_NOTE/<id ของใบต้นทาง>` ซึ่งไม่มีเอกสารนั้นจริง — CONVERT_MAP มี CN/DN แค่จาก INVOICE เท่านั้น)
    if (t === "CREDIT_NOTE" || t === "DEBIT_NOTE") continue;
    items.push({ label: `แปลงเป็น${labelOf(t)}`, href: `${editorDetailPath(base, t, data.id)}` });
  }
  // WO 1.6 §5.2 J — deep-link เข้า wizard ขั้น ② โดยเลือกเอกสารนี้อ้างอิงไว้ล่วงหน้า (`?ref=<id>`)
  //   ฝั่งขาย: ออกใบลดหนี้/เพิ่มหนี้จาก IV/RE/TX · ฝั่งซื้อ: บันทึกรับใบลดหนี้/เพิ่มหนี้จาก PUR/EXP (`targets` ฝั่งนี้ว่างเสมอ)
  if (!ACTIVE_STATUSES.has(data.status)) {
    if (CN_DN_SOURCE_TYPES.includes(dt)) {
      items.push(
        { label: "ออกใบลดหนี้", href: wizard("CREDIT_NOTE") },
        { label: "ออกใบเพิ่มหนี้", href: wizard("DEBIT_NOTE") },
      );
    }
    if (CNR_DNR_SOURCE_TYPES.includes(dt)) {
      items.push(
        { label: "บันทึกรับใบลดหนี้", href: wizard("CREDIT_NOTE_RECEIVED") },
        { label: "บันทึกรับใบเพิ่มหนี้", href: wizard("DEBIT_NOTE_RECEIVED") },
      );
    }
  }
  items.push(soon("ส่งอีเมล"));

  // WO 1.9 §5.3 — "เตือนชำระ" ส่งอีเมลถึงลูกค้าจริง (IV/BN/DN ที่ยังค้างชำระ)
  //   ไม่มีอีเมล / ไม่มียอดค้าง → รายการยังอยู่ในเมนูแต่กดไม่ได้ **พร้อมเหตุผลไทย**
  //   (ห้ามซ่อนทิ้ง — ผู้ใช้ต้องรู้ว่าต้องไปเติมอีเมลที่ผู้ติดต่อ ไม่ใช่หาปุ่มไม่เจอ)
  const remindBlock = paymentReminderBlockReason({
    docType: dt,
    status: data.status,
    contactEmail: data.contact?.email ?? null,
  });
  if (remindBlock === null) {
    items.push({
      label: "เตือนชำระ",
      submit: {
        action: sendPaymentReminderAction,
        fields: { systemId, id: data.id, backTo: detailPath },
      },
    });
  } else if (PAYMENT_REMINDER_UI_TYPES.includes(dt)) {
    items.push({ label: "เตือนชำระ", disabled: true, hint: remindBlock });
  }

  // WO 1.9 §0.3 ข้อ 7 — "ตั้งเป็นเอกสารประจำ" จากเอกสารที่ออกแล้ว (เติมแม่แบบให้ล่วงหน้า)
  if (isRecurringDocType(dt) && !ACTIVE_STATUSES.has(data.status)) {
    items.push({ label: "ตั้งเป็นเอกสารประจำ", href: `${base}/recurring/new?from=${data.id}` });
  }

  if (dt === "INVOICE") {
    // WO 1.7: ลิงก์จริงเข้าฟอร์มใบวางบิลรวมพร้อมติ๊กใบนี้ไว้ให้ — ใบที่อยู่ในใบวางบิลแล้วไม่โชว์ซ้ำ
    if (!data.groupChip && (data.status === "AWAITING_PAYMENT" || data.status === "PARTIAL")) {
      items.push({ label: "ใส่ในใบวางบิล", href: `${editorNewPath(base, "BILLING_NOTE")}?ids=${data.id}` });
    }
  }
  if ((dt === "PURCHASE" || dt === "EXPENSE" || dt === "DEBIT_NOTE_RECEIVED" || dt === "DEPOSIT_PAYMENT") &&
      !data.groupChip && (data.status === "AWAITING_PAYMENT" || data.status === "PARTIAL")) {
    items.push({ label: "ใส่ในใบรวมจ่าย", href: `${base}/combined-payment/new?ids=${data.id}` });
  }
  items.push(soon("คัดลอก"));
  return items;
}

// ─────────────────── แถบเอกสารที่เกี่ยวข้อง ───────────────────
function RelatedChip({ slot, base }: { slot: RelatedSlot; base: string }) {
  const testId = `related-${slot.kind}`;
  if (!slot.doc) {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs text-[color:var(--color-muted)]"
        style={{ borderColor: "var(--color-line)" }}
      >
        {slot.label} —
      </span>
    );
  }
  const href = editorDetailPath(base, slot.doc.docType, slot.doc.id);
  const tone = accountTone(slot.doc.status);
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
      style={{ borderColor: "var(--color-line)" }}
    >
      {slot.label} {slot.doc.docNo ?? "(ร่าง)"}
      {slot.doc.status === "PARTIAL" && <span className="text-[color:var(--color-accent)]">บางส่วน</span>}
      {tone === "strong" && <span aria-hidden>✓</span>}
    </Link>
  );
}

// ─────────────────── แท็บเนื้อหา ───────────────────
type TabKey = "detail" | "payments" | "gl" | "attachments" | "history";
const TABS: { key: TabKey; label: (n: number) => string }[] = [
  { key: "detail", label: () => "รายละเอียด" },
  { key: "payments", label: (n) => `การชำระเงิน${n ? ` ${n}` : ""}` },
  { key: "gl", label: () => "บัญชี" },
  { key: "attachments", label: (n) => `ไฟล์แนบ${n ? ` ${n}` : ""}` },
  { key: "history", label: () => "ประวัติ" },
];

function JvTable({ entries, testPrefix }: { entries: JvEntryView[]; testPrefix: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการบัญชีสำหรับเอกสารนี้</p>;
  }
  let n = 0;
  return (
    <div className="flex flex-col gap-4">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-[color:var(--color-muted)]">
            <span>
              {e.docNo} · {fmtDate(e.date)} {e.memo ? `· ${e.memo}` : ""}
              {e.status === "REVERSED" && " · กลับรายการแล้ว"}
              {e.needsReview && " · ⚑ ต้องตรวจ"}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-1.5 font-normal">บัญชี</th>
                <th className="py-1.5 text-right font-normal">เดบิต</th>
                <th className="py-1.5 text-right font-normal">เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l) => {
                n += 1;
                return (
                  <tr key={l.id} className="border-b last:border-0" data-testid={`${testPrefix}-${n}`}>
                    <td className="py-1.5">
                      {l.accountCode} · {l.accountName}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{l.debit > 0 ? <MoneyText satang={l.debit} decimals /> : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{l.credit > 0 ? <MoneyText satang={l.credit} decimals /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// WO 1.7 §5.2 K — ตาราง "เอกสารในกลุ่ม" ของ BN/CP (แทนตารางสินค้า/บริการ)
// แต่ละแถว = ใบลูก 1 ใบ พร้อมยอดค้างและสถานะปัจจุบัน (คลิกเข้าเอกสารนั้นได้)
function GroupChildrenTable({ data, base }: { data: DocDetailData; base: string }) {
  const rows = data.groupChildren ?? [];
  const label = groupDefOf(data.docType)?.texts.childrenTitle ?? "เอกสารในกลุ่ม";
  const outstandingLabel = groupDefOf(data.docType)?.texts.outstandingLabel ?? "ค้างชำระ";
  const sumOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  return (
    <div className="card overflow-x-auto" data-testid="group-children">
      <h3 className="mb-2 text-sm font-semibold">
        {label} <span data-testid="group-children-count">{rows.length}</span> ใบ
      </h3>
      {/* colgroup กำหนดความกว้างต่อคอลัมน์ชัดเจน — กัน "ค้างชำระ" กับ "สถานะ" ชนกัน
          (บั๊กที่ Fable เจอตอน QC ภาพจริง: "฿92,448.00รอชำระเงิน") · แบบเดียวกับ wizard ขั้น ① */}
      <table className="w-full min-w-[640px] table-fixed text-sm" data-testid="group-table">
        <colgroup>
          <col style={{ width: 170 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="py-2 pr-3 font-normal">เลขที่</th>
            <th className="py-2 pr-3 font-normal">วันที่</th>
            <th className="py-2 pr-3 font-normal">ครบกำหนด</th>
            <th className="py-2 pr-3 text-right font-normal">มูลค่า</th>
            <th className="py-2 pr-4 text-right font-normal">{outstandingLabel}</th>
            <th className="py-2 pl-1 font-normal">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0" data-testid={`group-child-${r.docNo ?? r.id}`}>
              <td className="py-2 pr-3">
                <Link href={editorDetailPath(base, r.docType, r.id)} className="font-medium underline">
                  {r.docNo ?? "(ร่าง)"}
                </Link>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">{r.docLabel}</span>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.issueDate)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                <MoneyText satang={r.grandTotal} decimals />
              </td>
              <td className="py-2 pr-4 text-right tabular-nums font-medium whitespace-nowrap">
                <MoneyText satang={r.outstanding} decimals />
              </td>
              <td className="py-2 pl-1 truncate">{r.statusLabel}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-[color:var(--color-muted)]">
                ไม่มีเอกสารในกลุ่มนี้
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-3 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <TotalRow label="รวมยอดกลุ่ม" satang={data.grandTotal} />
        <div className="flex w-full justify-between border-t pt-1 font-semibold">
          <span>{outstandingLabel}</span>
          <span data-testid="group-children-outstanding">
            <MoneyText satang={sumOutstanding} decimals />
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailTab({ data, vatRegistered, base }: { data: DocDetailData; vatRegistered: boolean; base: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card text-sm">
        <div className="text-xs text-[color:var(--color-muted)]">ผู้ติดต่อ</div>
        <div className="font-medium">{data.contact?.name ?? "ไม่ระบุ"}</div>
        {data.contact?.taxId && <div className="text-xs text-[color:var(--color-muted)]">เลขภาษี {data.contact.taxId}</div>}
      </div>
      {data.groupChildren ? <GroupChildrenTable data={data} base={base} /> : (
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 font-normal">สินค้า/บริการ</th>
              <th className="py-2 text-right font-normal">จำนวน</th>
              <th className="py-2 font-normal">หน่วย</th>
              <th className="py-2 text-right font-normal">ราคา/หน่วย</th>
              <th className="py-2 text-right font-normal">ส่วนลด</th>
              <th className="py-2 text-right font-normal">VAT</th>
              <th className="py-2 text-right font-normal">ก่อนภาษี</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2">
                  {l.description}
                  {l.account && <span className="block text-xs text-[color:var(--color-muted)]">{l.account.code} {l.account.name}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{l.qty}</td>
                <td className="py-2">{l.unitName ?? "—"}</td>
                <td className="py-2 text-right tabular-nums"><MoneyText satang={l.unitPrice} decimals /></td>
                <td className="py-2 text-right tabular-nums">{l.discount > 0 ? <MoneyText satang={l.discount} decimals /> : "—"}</td>
                <td className="py-2 text-right tabular-nums">{vatLabel(l.vatRateBp)}</td>
                <td className="py-2 text-right tabular-nums"><MoneyText satang={l.amount} decimals /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
          <TotalRow label="รวมเป็นเงิน" satang={data.subTotal} />
          {data.discountAmount > 0 && <TotalRow label="ส่วนลดท้ายบิล" satang={-data.discountAmount} />}
          {vatRegistered && <TotalRow label="ภาษีมูลค่าเพิ่ม" satang={data.vatAmount} />}
          {data.whtAmount > 0 && <TotalRow label="หัก ณ ที่จ่าย" satang={-data.whtAmount} />}
          {data.depositDeducted > 0 && <TotalRow label="หักเงินมัดจำ" satang={-data.depositDeducted} />}
          <div className="flex w-full justify-between border-t pt-1 font-semibold">
            <span>ยอดที่ต้องชำระ</span>
            <span><MoneyText satang={data.grandTotal} decimals /></span>
          </div>
        </div>
      </div>
      )}
      {(data.note || data.internalNote) && (
        <div className="card flex flex-col gap-1 text-sm">
          {data.note && (
            <div>
              <span className="text-xs text-[color:var(--color-muted)]">หมายเหตุ (พิมพ์บนเอกสาร): </span>
              {data.note}
            </div>
          )}
          {data.internalNote && (
            <div>
              <span className="text-xs text-[color:var(--color-muted)]">หมายเหตุภายใน: </span>
              {data.internalNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ผู้บันทึก (§5.3 แท็บ "การชำระเงิน") — วงกลมอักษรย่อ + ชื่อเต็ม (g4)
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[10px] font-medium">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

function TotalRow({ label, satang }: { label: string; satang: number }) {
  return (
    <div className="flex w-full justify-between text-[color:var(--color-muted)]">
      <span>{label}</span>
      <span className={satang < 0 ? "text-[color:var(--color-danger)]" : ""}>
        {satang < 0 && "−"}
        <MoneyText satang={Math.abs(satang)} decimals />
      </span>
    </div>
  );
}

/**
 * WO 5.5 — ตารางลิงก์เก็บเงินของเอกสารนี้ (สถานะ · ยอด · หมดอายุ · การกระทำ)
 * โหมด QR นิ่งที่ยังรอชำระ: ปุ่ม "ยืนยันรับเงินแล้ว" (เส้นทางเงินเดียวกับ webhook) + "ยกเลิกลิงก์"
 */
function PayRequestsCard({ data, systemId }: { data: DocDetailData; systemId: string }) {
  const now = new Date();
  return (
    <div className="card overflow-x-auto" data-testid="pay-request-card">
      <h3 className="mb-2 text-sm font-semibold">ลิงก์ชำระเงิน / QR พร้อมเพย์</h3>
      <table className="w-full min-w-[620px] table-fixed text-sm">
        {/* คอลัมน์กว้างคงที่ — กันหัวคอลัมน์ชนกันเป็นคำเดียว ("ยอดสถานะ") เวลาข้อความสั้น */}
        <colgroup>
          <col />
          <col className="w-32" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-64" />
        </colgroup>
        <thead>
          <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
            <th className="py-2 font-normal">วิธี</th>
            <th className="py-2 pr-4 text-right font-normal">ยอด</th>
            <th className="py-2 font-normal">สถานะ</th>
            <th className="py-2 font-normal">ใช้ได้ถึง</th>
            <th className="py-2 font-normal">การกระทำ</th>
          </tr>
        </thead>
        <tbody>
          {data.paymentRequests.map((r, i) => {
            const expired = r.status === "EXPIRED" || (r.status === "PENDING" && r.expiresAt <= now);
            const label = expired && r.status === "PENDING" ? "หมดอายุ" : r.statusLabel;
            return (
              <tr key={r.id} className="border-b last:border-0" data-testid={`pay-request-row-${i + 1}`}>
                <td className="py-2">{r.methodLabel}</td>
                <td className="py-2 pr-4 text-right tabular-nums"><MoneyText satang={r.amountSatang} decimals /></td>
                <td className="py-2">
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: "var(--color-line)" }}
                    data-testid={`pay-request-status-${i + 1}`}
                  >
                    {label}
                  </span>
                </td>
                <td className="py-2">{fmtDate(r.expiresAt)}</td>
                <td className="py-2">
                  {r.status === "PENDING" && !expired ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {r.method === "PROMPTPAY_STATIC" && (
                        <form action={confirmPaymentRequestAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="requestId" value={r.id} />
                          <input type="hidden" name="docType" value={data.docType} />
                          <input type="hidden" name="docId" value={data.id} />
                          <SubmitButton variant="ghost" className="text-xs">
                            ยืนยันรับเงินแล้ว
                          </SubmitButton>
                        </form>
                      )}
                      <form action={cancelPaymentRequestAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="docType" value={data.docType} />
                        <input type="hidden" name="docId" value={data.id} />
                        <SubmitButton variant="ghost" className="text-xs">
                          ยกเลิกลิงก์
                        </SubmitButton>
                      </form>
                    </span>
                  ) : (
                    <span className="text-[color:var(--color-muted)]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({
  data,
  systemId,
  side,
  perm,
}: {
  data: DocDetailData;
  systemId: string;
  side: "revenue" | "expense";
  perm: AccountPermFlags;
}) {
  const canPay =
    perm.recordPayment &&
    (data.status === "AWAITING_PAYMENT" || data.status === "PARTIAL") &&
    (REVENUE_PAYABLE_TYPES.includes(data.docType) || EXPENSE_PAYABLE_TYPES.includes(data.docType));
  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed text-sm">
          <colgroup>
            <col className="w-14" />
            <col className="w-24" />
            <col />
            <col className="w-28" />
            <col className="w-20" />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 font-normal">ครั้งที่</th>
              <th className="py-2 font-normal">วันที่</th>
              <th className="py-2 font-normal">ช่องทาง</th>
              <th className="py-2 text-right font-normal">จำนวน</th>
              <th className="py-2 text-right font-normal">WHT</th>
              <th className="py-2 font-normal">ผู้บันทึก</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p, i) => (
              <tr
                key={p.id}
                className={`border-b last:border-0 ${p.voidedAt ? "opacity-50 line-through" : ""}`}
                data-testid={`pay-row-${i + 1}`}
              >
                <td className="py-2">{i + 1}</td>
                <td className="py-2">{fmtDate(p.paidAt)}</td>
                <td className="truncate py-2">
                  {p.financeName ?? PAY_CHANNEL_LABEL[p.channel as keyof typeof PAY_CHANNEL_LABEL] ?? p.channel}
                  {p.chequeNo ? ` · เช็ค ${p.chequeNo}` : ""}
                </td>
                <td className="py-2 text-right tabular-nums"><MoneyText satang={p.amount} decimals /></td>
                <td className="py-2 text-right tabular-nums">{p.whtAmount > 0 ? <MoneyText satang={p.whtAmount} decimals /> : "—"}</td>
                <td className="py-2">{p.createdByName ? <Avatar name={p.createdByName} /> : "—"}</td>
              </tr>
            ))}
            {data.payments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-[color:var(--color-muted)]">
                  ยังไม่มีการรับชำระ
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {canPay && (
          <div className="mt-3">
            {isGroupDocType(data.docType) ? (
              <GroupPaymentPanel
                systemId={systemId}
                docId={data.id}
                triggerLabel={side === "expense" ? "+ บันทึกจ่ายเพิ่ม" : "+ รับชำระเพิ่ม"}
                triggerClassName="btn btn-ghost text-sm"
              />
            ) : (
              <PaymentPanel
                systemId={systemId}
                docId={data.id}
                triggerLabel={side === "expense" ? "+ บันทึกจ่ายเพิ่ม" : "+ รับชำระเพิ่ม"}
                triggerClassName="btn btn-ghost text-sm"
              />
            )}
          </div>
        )}
      </div>
      {/* WO 5.5 — ลิงก์ชำระเงิน / QR พร้อมเพย์ ของเอกสารนี้ (§0.3 ข้อ 5) */}
      {data.paymentRequests.length > 0 && <PayRequestsCard data={data} systemId={systemId} />}

      {/* g4: preview สมุดรายวันโชว์ใต้ตารางการชำระเงินเสมอ (ไม่ต้องสลับไปแท็บ "บัญชี") */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">บัญชี (ตัวอย่างสมุดรายวัน)</h3>
          <span className="text-xs text-[color:var(--color-muted)]">ดูสมุดรายวัน ›</span>
        </div>
        <JvTable entries={data.jv.slice(0, 1)} testPrefix="jv-line" />
      </div>
    </div>
  );
}

function GlTab({ data, base }: { data: DocDetailData; base: string }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">รายการบัญชี (Dr/Cr)</h3>
        <Link href={`${base}/journal`} className="text-xs underline">
          ดูสมุดรายวัน ›
        </Link>
      </div>
      <JvTable entries={data.jv} testPrefix="jv-line" />
    </div>
  );
}

function AttachmentsTab({ data, systemId }: { data: DocDetailData; systemId: string }) {
  return (
    <div className="card">
      <DocAttachments systemId={systemId} documentId={data.id} storageEnabled={storageEnabled()} initial={data.attachments} />
    </div>
  );
}

function HistoryTab({ data }: { data: DocDetailData }) {
  if (data.auditLogs.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประวัติ</p>;
  }
  return (
    <div className="card flex flex-col gap-2 text-sm">
      {data.auditLogs.map((l) => (
        <div key={l.id} className="flex items-center justify-between border-b pb-2 last:border-0">
          <span>{l.actionLabel ?? auditActionLabelTh(l.action)}</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            {fmtDateLong(l.createdAt)} · {l.actorName}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────── ส่วนหัว ───────────────────
function HeaderStat({ label, testId, danger, children }: { label: string; testId: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className="shrink-0 whitespace-nowrap">
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div
        className="text-lg font-semibold tabular-nums whitespace-nowrap"
        style={danger ? { color: "var(--color-danger)" } : undefined}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}

export async function DocDetailPage({
  tenantId,
  systemId,
  docId,
  expectDocType,
  tab,
  err,
  msg,
}: {
  tenantId: string;
  systemId: string;
  docId: string;
  /** เส้นทางฝั่งรายรับมี docType ใน path — ต้องตรงกับเอกสารจริง มิฉะนั้น 404 (กัน route สลับชนิด) */
  expectDocType?: AccountDocType;
  /** ?tab= — แท็บที่เปิดอยู่ (ค่าเริ่มต้น "รายละเอียด") */
  tab?: string;
  err?: string;
  /** WO 1.9 — ข้อความสำเร็จ (เช่น "ส่งอีเมลเตือนชำระถึง … แล้ว") */
  msg?: string;
}) {
  const [data, settings, perm] = await Promise.all([
    getDocDetailData(tenantId, systemId, docId),
    getSettings(tenantId, systemId),
    // WO 8.3 (§9.4): ธงสิทธิ์จริงของผู้ใช้ที่เปิดหน้านี้ — ใช้ซ่อนปุ่มที่เขากดไม่ได้
    accountPermFlags(systemId),
  ]);
  if (!data) notFound();
  if (expectDocType && data.docType !== expectDocType) notFound();

  const base = `/app/sys/${systemId}/account`;
  const dt = data.docType;
  const side = sideOf(dt);
  const listPath = editorListPath(base, dt);
  const editPath = editorEditPath(base, dt, data.id);
  const selfPath = editorDetailPath(base, dt, data.id);
  const rawTargets =
    side === "revenue" && !ACTIVE_STATUSES.has(data.status) ? visibleConvertTargets(dt, settings.vatRegistered) : [];
  // §9.3 "การออกเอกสารต่อ": ปลายทางที่ตั้งไว้ต้องมาก่อนเสมอ (ปุ่มหลัก + อันแรกในเมนู ⋯)
  const preferred = dt === "QUOTATION" ? settings.policy.convertQtTo : null;
  const targets = preferred
    ? [...rawTargets].sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0))
    : rawTargets;
  const canShareLink = ["RECEIPT", "DEPOSIT_RECEIPT", "INVOICE"].includes(dt) && !ACTIVE_STATUSES.has(data.status);
  // WO 5.5 — "ลิงก์ชำระเงิน" ใช้ได้เฉพาะเอกสารรายรับที่ออกแล้วและยังค้างชำระ
  //   กดไม่ได้ต้องบอกเหตุผลไทยเสมอ (BLUEPRINT §0.3 ข้อ 9 — ห้ามซ่อนปุ่มเงียบ ๆ)
  const payLinkBlockReason = !PAYMENT_REQUEST_DOC_TYPES.includes(dt)
    ? "เอกสารชนิดนี้ยังขอเก็บเงินผ่านลิงก์ไม่ได้"
    : data.status === "DRAFT"
      ? "ต้องออกเอกสารก่อนจึงสร้างลิงก์เก็บเงินได้"
      : !["AWAITING_PAYMENT", "PARTIAL"].includes(data.status)
        ? "เอกสารนี้ไม่มียอดค้างชำระแล้ว"
        : null;
  const canPayLink = payLinkBlockReason === null;
  const currentPayLink: PayLinkView | null = (() => {
    const r = data.paymentRequests.find((x) => x.status === "PENDING" && x.expiresAt > new Date());
    if (!r) return null;
    return {
      id: r.id,
      url: r.url,
      amountSatang: r.amountSatang,
      method: r.method,
      status: r.status,
      statusLabel: r.statusLabel,
      qrPayload: r.qrPayload,
      providerUrl: r.providerUrl,
      financeName: r.financeName,
      expiresAtText: fmtDate(r.expiresAt),
      note: r.note,
    };
  })();

  const steps: StepDef[] = data.timeline.map((s) => ({
    code: s.code,
    label: s.label,
    docNo: s.date ? `${fmtDate(s.date)}${s.note ? ` · ${s.note}` : ""}` : "—",
    state: s.state,
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {err && <p className="text-sm text-[color:var(--color-danger)]">{decodeURIComponent(err)}</p>}
      {msg && (
        <p className="text-sm font-medium" data-testid="doc-msg">
          {decodeURIComponent(msg)}
        </p>
      )}

      {/* หัว (g4/f14) — แถวเดียวบนจอกว้าง (lg+) ตาม g4: [เลขที่·chip]·ยอดสุทธิ·ค้างชำระ·ครบกำหนด …[ปุ่มรอง] · ปุ่มดำหลักแยกบรรทัดล่าง */}
      <div className="card flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-4 lg:flex-nowrap lg:gap-6">
            <div className="whitespace-nowrap">
              <Link href={listPath} className="text-xs text-[color:var(--color-muted)] underline">
                {data.label}เลขที่
              </Link>
              <h1 className="text-2xl font-semibold whitespace-nowrap" data-testid="doc-h1">
                {data.docNo ?? "(ร่าง)"}
              </h1>
            </div>
            <span data-testid="doc-status" className="shrink-0">
              <StatusBadge status={data.status} overdue={data.overdue} />
            </span>
            <HeaderStat label="ยอดสุทธิ" testId="doc-grand">
              <MoneyText satang={data.grandTotal} decimals />
            </HeaderStat>
            {(REVENUE_PAYABLE_TYPES.includes(dt) || EXPENSE_PAYABLE_TYPES.includes(dt)) && (
              <HeaderStat label="ค้างชำระ" testId="doc-outstanding" danger={data.overdue && data.remain > 0}>
                <MoneyText satang={data.remain} decimals />
              </HeaderStat>
            )}
            {data.dueDate && (
              <HeaderStat label={dt === "QUOTATION" ? "ใช้ได้ถึง" : "ครบกำหนด"} testId="doc-due" danger={data.overdue}>
                {fmtDate(data.dueDate)}
              </HeaderStat>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
            <ShareLinkButton systemId={systemId} docId={data.id} disabled={!canShareLink} />
            <PayLinkButton
              systemId={systemId}
              docId={data.id}
              docNo={data.docNo}
              disabled={!canPayLink}
              disabledHint={payLinkBlockReason ?? undefined}
              current={currentPayLink}
            />
            <Link href={`${base}/print/${data.id}`} target="_blank" className="btn btn-ghost text-sm">
              PDF
            </Link>
            <button type="button" className="btn btn-ghost text-sm" disabled title="เร็ว ๆ นี้">
              อีเมล
            </button>
            <DocMoreMenu
              testId="doc-more-actions"
              items={moreActionsFor(data, base, targets, systemId, selfPath)}
              danger={dangerMenuItemFor(data, systemId, side)}
            />
          </div>
        </div>

        <ActionRow data={data} systemId={systemId} side={side} base={base} editPath={editPath} vatRegistered={settings.vatRegistered} targets={targets} perm={perm} />
      </div>

      {/* ไทม์ไลน์เอกสาร */}
      {steps.length > 0 && (
        <div className="card overflow-x-auto">
          <Stepper steps={steps} testId="timeline" />
        </div>
      )}

      {/* เอกสารที่เกี่ยวข้อง */}
      {data.related.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.related.map((s) => (
            <RelatedChip key={s.kind} slot={s} base={base} />
          ))}
        </div>
      )}

      {/* แท็บ (?tab= — ฝั่ง server เลือก panel โดยตรง ไม่ต้องส่ง client JS เพิ่มเพื่อสลับแท็บ) */}
      <DocDetailTabsPanel
        data={data}
        systemId={systemId}
        base={base}
        side={side}
        vatRegistered={settings.vatRegistered}
        activeTab={TABS.some((t) => t.key === tab) ? (tab as TabKey) : "detail"}
        perm={perm}
      />
    </div>
  );
}

function DocDetailTabsPanel({
  data,
  systemId,
  base,
  side,
  vatRegistered,
  activeTab,
  perm,
}: {
  data: DocDetailData;
  systemId: string;
  base: string;
  side: "revenue" | "expense";
  vatRegistered: boolean;
  activeTab: TabKey;
  perm: AccountPermFlags;
}) {
  const active = activeTab;
  const counts: Record<TabKey, number> = {
    detail: 0,
    payments: data.payments.filter((p) => !p.voidedAt).length,
    gl: 0,
    attachments: data.attachments.length,
    history: 0,
  };
  const detailPath = editorDetailPath(base, data.docType, data.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "detail" ? detailPath : `${detailPath}?tab=${t.key}`}
            data-testid={`tab-${t.key}`}
            aria-current={active === t.key ? "page" : undefined}
            className="whitespace-nowrap border-b-2 px-3 py-2 text-sm"
            style={active === t.key ? { borderColor: "var(--color-ink)", fontWeight: 600 } : { borderColor: "transparent", color: "var(--color-muted)" }}
          >
            {t.label(counts[t.key])}
          </Link>
        ))}
      </div>
      {active === "detail" && <DetailTab data={data} vatRegistered={vatRegistered} base={base} />}
      {active === "payments" && <PaymentsTab data={data} systemId={systemId} side={side} perm={perm} />}
      {active === "gl" && <GlTab data={data} base={base} />}
      {active === "attachments" && <AttachmentsTab data={data} systemId={systemId} />}
      {active === "history" && <HistoryTab data={data} />}
    </div>
  );
}

export default DocDetailPage;
