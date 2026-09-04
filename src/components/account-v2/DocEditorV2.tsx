"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { computeDocTotals } from "@/lib/modules/account/totals";
import {
  approveDocAction,
  discardDraftAction,
  saveDraftAction,
  saveFavoriteLinesAction,
  searchContactsAction,
  searchProductsAction,
} from "@/lib/modules/account/editor-actions";
import { approveReceiptWithPaymentsAction } from "@/lib/modules/account/payment-actions";
import { MoneyText } from "@/components/ui/MoneyText";
import { ContactPicker, type ContactSearchResult } from "./ContactPicker";
import { DepositSection, type DepositApplied } from "./DepositSection";
import { PaymentSection, boxTieOff, newPayBox, type PayBox } from "./PaymentSection";
import { DateInput } from "./DateInput";
import { DocAttachments } from "./DocAttachments";
import { DocLineTable } from "./DocLineTable";
import { DocTotals, MobileTotalsBar } from "./DocTotals";
import { EasyModeToggle, useAccMode } from "./EasyModeToggle";
import { SectionCard } from "./SectionCard";
import { Stepper, type StepDef } from "./Stepper";
import { StickyBar } from "./StickyBar";
import { ToastProvider, useToast } from "./Toast";
import {
  PRICE_MODE_OPTIONS,
  REASON_OPTIONS,
  newLineDraft,
  type ContactOption,
  type DocDraftPayload,
  type DocEditorV2Props,
  type FavoriteSet,
  type LineDraft,
  type ProductOption,
} from "./doc-editor-types";

// ─────────────────────────────────────────────────────────────
// DocEditorV2 — ฟอร์มสร้าง/แก้เอกสารเต็มหน้า (DESIGN-SPEC-V2 §5.2 ส่วน A B C E G H I)
// ภาพอ้างอิงที่ต้องเหมือน: g1-invoice-form.png (เดสก์ท็อป) · g1-invoice-form-menu.png (เมนูอนุมัติ)
//                          g17-invoice-form.png (มือถือ: accordion + แถบยอดติดล่าง)
// WO 1.4 เติมส่วน D (เงินมัดจำ · `DepositSection`) และ F (รับชำระเงิน · `PaymentSection` ตาม g2)
//   D อยู่ระหว่าง "รายการ" กับ "สรุปยอด" (ยอดที่หักไหลเข้า `tot-deposit`/`tot-due`)
//   F โผล่เฉพาะใบเสร็จรับเงิน — ปุ่มอนุมัติเปลี่ยนไปเรียก `approveReceiptWithPaymentsAction`
//
// 🔴 ตัวเลขบนจอ = พรีวิวเท่านั้น — server action คำนวณใหม่ด้วย computeDocTotals ตัวเดียวกันก่อนบันทึกเสมอ
// ─────────────────────────────────────────────────────────────

const AUTOSAVE_MS = 2000;

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
      data-testid={testId}
    >
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? "var(--color-ink)" : "var(--color-line)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full transition-transform"
          style={{ background: "var(--color-surface)", transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </span>
      {label}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}

export function DocEditorV2(props: DocEditorV2Props) {
  return (
    <ToastProvider testId="toast">
      <EditorBody {...props} />
    </ToastProvider>
  );
}

function EditorBody(props: DocEditorV2Props) {
  const router = useRouter();
  const toast = useToast();
  const [mode] = useAccMode(props.accMode);
  const easy = mode === "easy";
  const [pending, startTransition] = useTransition();

  const [docId, setDocId] = useState<string | undefined>(props.docId);
  const [value, setValue] = useState(props.initial);
  const [contacts, setContacts] = useState<ContactOption[]>(props.contacts);
  const [products, setProducts] = useState<ProductOption[]>(props.products);
  const [tagOptions, setTagOptions] = useState<string[]>(props.tagOptions);
  const [favorites, setFavorites] = useState<FavoriteSet[]>(props.favorites);
  const [favName, setFavName] = useState("");
  const [attachmentCount, setAttachmentCount] = useState(props.attachments.length);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [draftMenuOpen, setDraftMenuOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [mobileTotalsOpen, setMobileTotalsOpen] = useState(false);
  // ── WO 1.4 ส่วน D/F ──
  const [depositApplied, setDepositApplied] = useState<DepositApplied[]>(props.depositApplied);
  const [depositDeducted, setDepositDeducted] = useState(props.depositDeductedSatang);
  const [payAdvanced, setPayAdvanced] = useState(false);
  const [payBoxes, setPayBoxes] = useState<PayBox[]>([]);
  const [payError, setPayError] = useState("");
  const payKeyRef = useRef(`pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const approveFormRef = useRef<HTMLFormElement>(null);
  const approveNextRef = useRef<HTMLInputElement>(null);
  const approveIdRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);
  const lastSavedRef = useRef("");

  // ── ยอดสด (สูตรเดียวกับ server) ──
  const totals = useMemo(
    () =>
      computeDocTotals({
        lines: value.lines.map((l) => ({
          qty: l.qty,
          unitPriceSatang: l.unitPriceSatang,
          discount: l.discount,
          vatRateBp: l.vatRateBp,
          whtRateBp: l.whtRateBp,
        })),
        priceMode: value.priceMode,
        vatRegistered: props.vatRegistered,
        vatRateBp: props.vatRateBp,
        docDiscount: value.docDiscount,
        depositDeductedSatang: depositDeducted,
      }),
    [value.lines, value.priceMode, value.docDiscount, props.vatRegistered, props.vatRateBp, depositDeducted],
  );

  // ── validation (inline + toast รวม) ──
  const invalidLineKeys = useMemo(() => {
    const s = new Set<string>();
    for (const l of value.lines) {
      if (!l.name.trim() || l.qty <= 0) s.add(l.key);
      else if (props.requireLineAccount && !l.accountId) s.add(l.key);
    }
    return s;
  }, [value.lines, props.requireLineAccount]);
  const missingContact = !value.contactId;
  const missingDate = !value.issueDate;
  // WO 1.6 §5.2 J — เหตุผลบังคับสำหรับเอกสารปรับปรุงหนี้ ("อื่น ๆ" ต้องกรอกข้อความเพิ่ม)
  const missingReason =
    !!props.adjustMode &&
    (!value.adjustReasonCode || (value.adjustReasonCode === "OTHER" && !value.adjustReasonText.trim()));
  const capExceeded = props.capSatang != null && totals.grandTotal > props.capSatang;
  const valid = !missingContact && !missingDate && !missingReason && value.lines.length > 0 && invalidLineKeys.size === 0;

  const payload = useCallback(
    (): DocDraftPayload => ({
      systemId: props.systemId,
      docType: props.docType,
      docId,
      // WO 1.6 — เอกสารอ้างอิงจาก wizard ขั้น ① (server ใช้เฉพาะตอนสร้างใหม่ — ไม่มีผลถ้า docId มีค่าแล้ว)
      refId: props.refDoc?.id ?? null,
      value: { ...value, lines: value.lines.map(({ key: _key, ...rest }) => rest) },
    }),
    [props.systemId, props.docType, docId, props.refDoc?.id, value],
  );

  const save = useCallback(
    async (opts?: { silent?: boolean }): Promise<string | null> => {
      if (!valid) {
        if (!opts?.silent) {
          setShowErrors(true);
          toast.error("โปรดกรอกช่องที่ไฮไลต์");
        }
        return null;
      }
      setSaving(true);
      try {
        const res = await saveDraftAction(payload());
        if (res.ok) {
          setDocId(res.docId);
          setSavedAt(res.savedAt);
          setSaveError("");
          if (!opts?.silent) toast.success("บันทึกร่างแล้ว");
          return res.docId;
        }
        setSaveError(res.reason);
        if (!opts?.silent) toast.error(res.reason);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [valid, payload, toast],
  );

  // ── autosave: หยุดพิมพ์ 2 วิ → บันทึกร่าง (ครั้งแรกสร้าง · ครั้งถัดไปทับใบเดิม ไม่กินเลขรัน) ──
  useEffect(() => {
    const snap = JSON.stringify(value);
    if (firstRender.current) {
      firstRender.current = false;
      lastSavedRef.current = snap; // โหลดหน้ามาเฉย ๆ ไม่ถือว่าแก้ → ไม่บันทึก
      return;
    }
    // กันวนซ้ำ: หลังบันทึกเสร็จ state จะเปลี่ยน (docId/savedAt) แต่ "ค่าในฟอร์ม" เท่าเดิม ⇒ ไม่ยิงซ้ำ
    if (!valid || snap === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = snap;
      void save({ silent: true });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [value, valid, save]);

  // ── ตัวช่วยแก้ค่า ──
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => setValue((p) => ({ ...p, [k]: v }));
  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setValue((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const addLine = () => setValue((p) => ({ ...p, lines: [...p.lines, newLineDraft(props.vatRateBp)] }));
  const removeLine = (key: string) =>
    setValue((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((l) => l.key !== key) : p.lines }));
  const reorderLine = (from: number, to: number) =>
    setValue((p) => {
      const next = [...p.lines];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...p, lines: next };
    });

  const searchContacts = async (q: string): Promise<ContactSearchResult[]> => {
    const rows = await searchContactsAction(props.systemId, q);
    setContacts(rows);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      sub: c.sub,
      meta: { member: c.member, overdueSatang: c.outstandingSatang },
    }));
  };
  const searchProducts = async (q: string): Promise<ProductOption[]> => {
    const rows = await searchProductsAction(props.systemId, q);
    setProducts((prev) => [...rows, ...prev.filter((p) => !rows.some((r) => r.id === p.id))]);
    return rows;
  };

  const pickContact = (id: string, name: string) => {
    const c = contacts.find((x) => x.id === id);
    setValue((p) => {
      const dueDate =
        c && c.creditTermDays && c.creditTermDays > 0 && p.issueDate
          ? isoPlusDays(p.issueDate, c.creditTermDays)
          : p.dueDate;
      return {
        ...p,
        contactId: id,
        contactLabel: name,
        dueDate,
        priceMode: c?.priceMode ?? p.priceMode,
      };
    });
  };

  const selectedContact = contacts.find((c) => c.id === value.contactId);

  const steps: StepDef[] = props.steps.map((s) => ({
    code: s.code,
    label: s.label,
    docNo: s.docNo,
    state: s.state,
  }));
  const stepHref = (code: string) => props.steps.find((s) => s.code === code)?.href;

  // ── WO 1.4 ส่วน F: กล่อง "ครั้งที่ 1" ตั้งต้นของใบเสร็จ = ยอดเต็มใบ (แก้ได้) ──
  useEffect(() => {
    if (!props.paymentEnabled) return;
    setPayBoxes((prev) =>
      prev.length > 0
        ? prev
        : [newPayBox(value.issueDate, totals.grandTotal, props.paymentChannels[0]?.id ?? null)],
    );
  }, [props.paymentEnabled, props.paymentChannels, value.issueDate, totals.grandTotal]);

  const approve = (next: "" | "pay" | "print" | "email") =>
    startTransition(async () => {
      if (capExceeded) {
        setShowErrors(true);
        toast.error("ยอดเกินยอดคงเหลือของเอกสารอ้างอิง — แก้ยอดหรือเลือกเอกสารอ้างอิงใหม่");
        return;
      }
      const id = await save();
      if (!id) return;
      // ── ใบเสร็จรับเงิน (g2): อนุมัติ = ออกเอกสาร + บันทึกการรับชำระที่กรอกไว้ในคำสั่งเดียว ──
      if (props.paymentEnabled) {
        setPayError("");
        const res = await approveReceiptWithPaymentsAction(
          props.systemId,
          id,
          payBoxes.filter((b) => boxTieOff(b) > 0).map((b) => ({
            paidAt: b.paidAt,
            financeAccountId: b.financeAccountId,
            amountSatang: b.amountSatang,
            note: b.note,
            whtIncomeType: b.whtOn ? (b.whtIncomeType as never) : null,
            whtRateBp: b.whtOn ? b.whtRateBp : null,
            whtAmountSatang: b.whtOn ? b.whtAmountSatang : 0,
            feeSatang: b.feeSatang,
            cheque: b.chequeOn
              ? { chequeNo: b.chequeNo, bankName: b.bankName, chequeDate: b.chequeDate }
              : null,
          })),
          payKeyRef.current,
        );
        if (!res.ok) {
          setPayError(res.reason);
          toast.error(res.reason);
          return;
        }
        toast.success(`อนุมัติ${props.docLabel} ${res.docNo} แล้ว`);
        router.push(res.href);
        router.refresh();
        return;
      }
      if (approveNextRef.current) approveNextRef.current.value = next;
      if (approveIdRef.current) approveIdRef.current.value = id;
      approveFormRef.current?.requestSubmit();
    });

  const saveDraftAndGo = (where: "detail" | "new") =>
    startTransition(async () => {
      const id = await save();
      if (!id) return;
      router.push(where === "new" ? `${props.listPath}/new` : `${props.detailPathFor}/${id}`);
      router.refresh();
    });

  // §5.2 C "รายการโปรด" — บันทึกชุดบรรทัดปัจจุบันไว้ใช้ซ้ำ (เก็บใน AccountSettings.docConfig ผ่าน action)
  const saveFavorite = () =>
    startTransition(async () => {
      const name = favName.trim();
      const lines = value.lines.filter((l) => l.name.trim()).map(({ key: _key, ...rest }) => rest);
      if (!name) {
        toast.error("กรุณาตั้งชื่อชุดรายการ");
        return;
      }
      if (lines.length === 0) {
        toast.error("ไม่มีรายการให้บันทึก");
        return;
      }
      const res = await saveFavoriteLinesAction(props.systemId, name, lines);
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      setFavorites((prev) => [...prev.filter((f) => f.name !== name), { name, lines }]);
      setFavName("");
      toast.success("บันทึกรายการโปรดแล้ว");
    });

  /** ร่างที่ "ฟอร์มนี้สร้างเอง" ระหว่าง autosave (เข้าหน้ามาแบบ /new) — กดยกเลิกแล้วต้องไม่ทิ้งร่างผีไว้
   *  ⚠️ เข้ามาทาง /[docId]/edit (props.docId มีค่า) = ร่างของผู้ใช้เอง → "ยกเลิก" แค่ออกจากหน้า ห้ามยกเลิกร่าง */
  const autoCreatedDraft = !props.docId && !!docId;

  const headerComplete = !missingContact && !missingDate;
  const linesComplete = value.lines.length > 0 && invalidLineKeys.size === 0;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 pb-40 md:pb-28" data-testid="doc-editor-v2">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold">
            {docId ? "แก้ไข" : "สร้าง"}
            {props.docLabel}
          </h1>
          <span className="text-sm text-[color:var(--color-muted)]" data-testid="doc-head-no">
            {value.docNo || "เลขที่ออกเมื่ออนุมัติ"} · ร่าง
          </span>
          {/* WO 1.6 §5.2 J — chip เอกสารอ้างอิงในหัวฟอร์ม (โหมด wizard เท่านั้น) */}
          {props.refDoc && (
            <Link
              href={props.refDoc.href}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
              style={{ background: "var(--color-surface-2)", color: "var(--color-accent)" }}
              data-testid="ref-chip"
            >
              อ้างอิง{props.refDoc.label} {props.refDoc.docNo ?? "—"}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[color:var(--color-muted)]" data-testid="autosave-state" aria-live="polite">
            {saving ? "กำลังบันทึกร่าง…" : savedAt ? "บันทึกร่างอัตโนมัติแล้ว" : ""}
          </span>
          <EasyModeToggle ssrMode={props.accMode} testId="acc-mode" />
        </div>
      </div>

      {/* WO 1.6 §5.2 J — สเต็ปเปอร์ wizard 2 ขั้น (① เลือกเอกสาร ✓ · ② ฟอร์มปัจจุบัน) */}
      {props.adjustMode && (
        <div className="card px-5 py-4">
          <Stepper
            steps={[
              { code: "1", label: "เลือกเอกสาร", state: "done" },
              { code: "2", label: props.docLabel, state: "current" },
            ]}
            testId="wizard-step"
          />
        </div>
      )}

      {/* A — stepper */}
      {steps.length > 1 && (
        <div className="card px-5 py-4">
          <Stepper steps={steps} hrefFor={(s) => stepHref(s.code)} testId="doc-steps" />
        </div>
      )}

      {/* WO 1.6 §5.2 J — เหตุผลการปรับปรุงหนี้ (ม.86/10) + เพดานยอดคงเหลือของเอกสารอ้างอิง */}
      {props.adjustMode && (
        <SectionCard title="เหตุผลการปรับปรุงหนี้" complete={!missingReason} testId="sec-reason">
          {props.refDoc && props.capSatang != null && (
            <p
              className="text-sm"
              data-testid="cap-line"
              style={capExceeded ? { color: "var(--color-danger)" } : undefined}
            >
              ยอดคงเหลือของเอกสารอ้างอิง <MoneyText satang={props.capSatang} decimals /> — ลดได้ไม่เกินนี้
              {capExceeded && " · ยอดในฟอร์มนี้เกินยอดคงเหลือ"}
            </p>
          )}
          {!props.refDoc && <p className="text-sm text-[color:var(--color-muted)]">ไม่อ้างอิงเอกสารเดิม</p>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="เหตุผล (ตามประกาศสรรพากร ม.86/10)" htmlFor="fld-reason">
              <span
                style={
                  showErrors && missingReason
                    ? { display: "block", borderRadius: 8, boxShadow: "0 0 0 2px var(--color-danger)" }
                    : undefined
                }
              >
                <select
                  id="fld-reason"
                  className="input"
                  value={value.adjustReasonCode}
                  onChange={(e) => set("adjustReasonCode", e.target.value)}
                  data-testid="reason-select"
                >
                  <option value="">— เลือกเหตุผล —</option>
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
            </Field>
            <Field label={value.adjustReasonCode === "OTHER" ? "ระบุเหตุผล (บังคับ)" : "รายละเอียดเพิ่มเติม"} htmlFor="fld-reason-text">
              <input
                id="fld-reason-text"
                className="input"
                maxLength={500}
                value={value.adjustReasonText}
                onChange={(e) => set("adjustReasonText", e.target.value)}
                data-testid="reason-text"
              />
            </Field>
          </div>
        </SectionCard>
      )}

      {/* การ์ดหัวของ g2: เลขที่เอกสาร · ผู้ติดต่อ · อ้างอิงใบแจ้งหนี้ · ยอด (เฉพาะฟอร์มที่มีส่วน F) */}
      {props.paymentEnabled && (
        <div className="card flex flex-wrap items-center gap-x-7 gap-y-3" data-testid="pay-head">
          <HeadStat label="เลขที่เอกสาร" value={value.docNo || "—"} />
          <HeadStat label="ผู้ติดต่อ" value={value.contactLabel || "—"} />
          {props.sourceDoc && (
            <HeadStat
              label={`อ้างอิง${props.sourceDoc.label}`}
              value={
                <Link href={props.sourceDoc.href} className="text-[color:var(--color-accent)] underline">
                  {props.sourceDoc.docNo ?? "—"}
                </Link>
              }
            />
          )}
          <span className="flex-1" />
          <div className="text-right">
            <div className="text-xs text-[color:var(--color-muted)]">ยอด</div>
            <div className="text-xl font-semibold tabular-nums" data-testid="pay-head-total">
              <MoneyText satang={totals.grandTotal} decimals />
            </div>
          </div>
        </div>
      )}

      {saveError && <p className="text-sm text-[color:var(--color-danger)]">{saveError}</p>}

      {/* B — ส่วนหัวเอกสาร */}
      <SectionCard title="ส่วนหัวเอกสาร" complete={headerComplete} testId="sec-header">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="เลขที่เอกสาร">
            <span className="flex items-center gap-2">
              <input
                className="input"
                value={value.docNo}
                readOnly
                placeholder="ออกอัตโนมัติเมื่ออนุมัติ"
                data-testid="fld-docno"
              />
              <Link
                href={`${props.basePath}/settings`}
                className="btn-sm h-11 w-11 shrink-0 px-0 text-center leading-[2.6]"
                aria-label="ตั้งค่าเลขที่เอกสาร"
                title="ตั้งค่าเลขที่เอกสาร"
              >
                ⚙
              </Link>
            </span>
          </Field>

          <Field label="ผู้ติดต่อ">
            <span className="flex flex-col gap-1">
              <span
                style={
                  showErrors && missingContact
                    ? { display: "block", borderRadius: 8, boxShadow: "0 0 0 2px var(--color-danger)" }
                    : undefined
                }
              >
                {/* WO 1.6 §5.2 J: อ้างอิงเอกสารเดิมแล้ว → ผู้ติดต่อต้องตรงกับเอกสารต้นทางเสมอ (ล็อกแก้ไม่ได้) */}
                {props.adjustMode && props.refDoc ? (
                  <input className="input" readOnly value={value.contactLabel || "—"} data-testid="contact-picker" />
                ) : (
                  <ContactPicker
                    defaultId={value.contactId ?? undefined}
                    defaultLabel={value.contactLabel}
                    search={searchContacts}
                    onSelect={(r) => pickContact(r.id, r.name)}
                    onCreate={() => router.push(`${props.basePath}/contacts`)}
                    testId="contact-picker"
                  />
                )}
              </span>
              {selectedContact && (
                <span
                  className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-xs"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-accent)" }}
                  data-testid="contact-badge"
                >
                  <span aria-hidden>👤</span>
                  {selectedContact.member ? "สมาชิก" : "ผู้ติดต่อ"}
                  {selectedContact.sub ? ` #${selectedContact.sub}` : ""} · ค้างรับ{" "}
                  <MoneyText satang={selectedContact.outstandingSatang ?? 0} decimals />
                </span>
              )}
            </span>
          </Field>

          <Field label="วันที่ออก" htmlFor="fld-issue">
            <span
              className="block"
              style={showErrors && missingDate ? { borderRadius: 8, boxShadow: "0 0 0 2px var(--color-danger)" } : undefined}
            >
              <DateInput
                id="fld-issue"
                value={value.issueDate}
                onChange={(iso) => set("issueDate", iso)}
                testId="fld-issue"
              />
            </span>
          </Field>

          {/* WO 1.6 §5.2 J: CN/DN/CNR/DNR ไม่มีแนวคิด "ครบกำหนด" — ตัดช่องนี้ออก เหลือแค่วันที่ออก */}
          {!props.adjustMode && (
            <Field label={props.dueLabel} htmlFor="fld-due">
              <DateInput id="fld-due" value={value.dueDate} onChange={(iso) => set("dueDate", iso)} testId="fld-due" />
            </Field>
          )}
        </div>

        {/* มือถือย่อส่วนที่เหลือไว้ตาม g17 ("เพิ่มเติม: อ้างอิง · สกุลเงิน · ใบกำกับ · พนักงานขาย") */}
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-[color:var(--color-muted)] md:hidden"
          aria-expanded={extraOpen}
          onClick={() => setExtraOpen((v) => !v)}
          data-testid="header-more"
        >
          <span className={`transition-transform ${extraOpen ? "rotate-180" : ""}`}>▾</span>
          เพิ่มเติม: อ้างอิง · สกุลเงิน · ใบกำกับ · พนักงานขาย
        </button>

        <div className={`${extraOpen ? "grid" : "hidden md:grid"} grid-cols-1 gap-4 md:grid-cols-2`}>
          <Field label="อ้างอิง" htmlFor="fld-ref">
            <input
              id="fld-ref"
              className="input"
              maxLength={35}
              placeholder="เลข PO ลูกค้า / เอกสารต้นทาง"
              value={value.reference}
              onChange={(e) => set("reference", e.target.value)}
              data-testid="fld-reference"
            />
          </Field>

          {!easy && (
            <Field label="ประเภทราคา" htmlFor="fld-pricemode">
              <select
                id="fld-pricemode"
                className="input"
                value={value.priceMode}
                onChange={(e) => set("priceMode", e.target.value as typeof value.priceMode)}
                data-testid="fld-pricemode"
              >
                {PRICE_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="สกุลเงิน">
            <input className="input" value="THB (คงที่)" readOnly data-testid="fld-currency" />
          </Field>

          <Field label="พนักงานขาย / สาขา">
            <span className="flex items-center gap-2">
              <select
                className="input"
                value={value.salesUserId ?? ""}
                onChange={(e) => set("salesUserId", e.target.value || null)}
                aria-label="พนักงานขาย"
                data-testid="fld-sales"
              >
                <option value="">— ไม่ระบุ —</option>
                {props.salesUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-sm text-[color:var(--color-muted)]" data-testid="fld-branch">
                · {props.branchName}
              </span>
            </span>
          </Field>

          {props.vatRegistered && (props.docType === "INVOICE" || props.docType === "RECEIPT") && (
            <div className="flex flex-col gap-2 md:col-span-2">
              <span className="text-xs text-[color:var(--color-muted)]">การออกใบกำกับภาษี</span>
              <div className="flex flex-wrap items-center gap-6">
                <Toggle
                  checked={value.autoTaxInvoice}
                  onChange={(v) => set("autoTaxInvoice", v)}
                  label="ออกใบกำกับภาษีพร้อมกัน"
                  testId="tg-auto-tax"
                />
                <Toggle
                  checked={value.recognizeVatNow}
                  onChange={(v) => set("recognizeVatNow", v)}
                  label="รับรู้ภาษีขายงวดนี้ (ภ.พ.30)"
                  testId="tg-vat-now"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-xs text-[color:var(--color-muted)]">แท็ก</span>
            <div className="flex flex-wrap items-center gap-2" data-testid="fld-tags">
              {value.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
                  {t}
                  <button
                    type="button"
                    aria-label={`ลบแท็ก ${t}`}
                    className="text-[color:var(--color-muted)]"
                    onClick={() => set("tags", value.tags.filter((x) => x !== t))}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {addingTag ? (
                <input
                  autoFocus
                  className="input w-40"
                  list="acc-tag-options"
                  value={tagInput}
                  placeholder="พิมพ์แล้วกด Enter"
                  onChange={(e) => setTagInput(e.target.value)}
                  onBlur={() => setAddingTag(false)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = tagInput.trim();
                    if (t && !value.tags.includes(t)) {
                      set("tags", [...value.tags, t]);
                      if (!tagOptions.includes(t)) setTagOptions([...tagOptions, t]);
                    }
                    setTagInput("");
                    setAddingTag(false);
                  }}
                  data-testid="tag-input"
                />
              ) : (
                <button
                  type="button"
                  className="text-xs text-[color:var(--color-accent)]"
                  onClick={() => setAddingTag(true)}
                  data-testid="tag-add"
                >
                  + เพิ่มแท็ก
                </button>
              )}
              <datalist id="acc-tag-options">
                {tagOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* C — รายการ */}
      <SectionCard title="รายการ" complete={linesComplete} testId="sec-lines">
        <DocLineTable
          lines={value.lines}
          breakdown={totals.lines}
          accounts={props.accounts}
          products={products}
          searchProducts={searchProducts}
          easy={easy}
          requireLineAccount={props.requireLineAccount}
          defaultVatRateBp={props.vatRateBp}
          whtRateByIncomeType={props.whtRateByIncomeType}
          invalidKeys={showErrors ? invalidLineKeys : new Set<string>()}
          onChange={patchLine}
          onRemove={removeLine}
          onReorder={reorderLine}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-sm" onClick={addLine} data-testid="line-add">
            + เพิ่มรายการ
          </button>
          <details className="relative">
            <summary className="btn-sm inline-flex cursor-pointer list-none items-center gap-1" data-testid="fav-menu">
              รายการโปรด ▾
            </summary>
            <div className="absolute z-20 mt-1 flex min-w-[280px] flex-col rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]">
              {favorites.length === 0 && (
                <span className="px-3 py-2 text-xs text-[color:var(--color-muted)]">
                  ยังไม่มีชุดรายการที่บันทึกไว้ — กรอกรายการแล้วตั้งชื่อด้านล่าง
                </span>
              )}
              {favorites.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                  data-testid={`fav-apply-${f.name}`}
                  onClick={() =>
                    setValue((p) => ({
                      ...p,
                      lines: [
                        ...p.lines.filter((l) => l.name.trim()),
                        ...f.lines.map((l) => ({ ...newLineDraft(props.vatRateBp), ...l })),
                      ],
                    }))
                  }
                >
                  {f.name}
                </button>
              ))}
              <span className="mt-1 flex items-center gap-1 border-t px-3 pb-1 pt-2">
                <input
                  className="input"
                  maxLength={60}
                  placeholder="ตั้งชื่อชุดรายการ"
                  value={favName}
                  onChange={(e) => setFavName(e.target.value)}
                  aria-label="ชื่อชุดรายการโปรด"
                  data-testid="fav-name"
                />
                <button type="button" className="btn-sm shrink-0" onClick={saveFavorite} data-testid="fav-save">
                  บันทึก
                </button>
              </span>
            </div>
          </details>
        </div>
      </SectionCard>

      {/* D — เงินมัดจำ (§5.2 D) */}
      {props.depositEnabled && (
        <SectionCard title="เงินมัดจำ" complete={depositDeducted > 0} testId="sec-deposit">
          <DepositSection
            systemId={props.systemId}
            docType={props.docType}
            docId={docId}
            contactId={value.contactId}
            docGrossSatang={totals.grandTotal + depositDeducted}
            applied={depositApplied}
            onApplied={(rows, total) => {
              setDepositApplied(rows);
              setDepositDeducted(total);
            }}
            onNeedDraft={() => save({ silent: true })}
          />
        </SectionCard>
      )}

      {/* E — สรุปยอด */}
      <SectionCard title="สรุปยอด" complete={totals.grandTotal > 0 && !capExceeded} testId="sec-totals">
        <DocTotals
          totals={totals}
          vatRateBp={props.vatRateBp}
          vatRegistered={props.vatRegistered}
          docDiscount={value.docDiscount}
          onDocDiscountChange={(v) => set("docDiscount", v)}
        />
        {capExceeded && (
          <p
            className="mt-2 text-sm font-semibold"
            data-testid="cap-exceeded-totals"
            style={{ color: "var(--color-danger)" }}
          >
            เกินยอดคงเหลือ <MoneyText satang={props.capSatang ?? 0} decimals />
          </p>
        )}
      </SectionCard>

      {/* F — รับชำระเงิน (§5.2 F · ภาพ g2) */}
      {props.paymentEnabled && (
        <>
          {payError && <p className="text-sm text-[color:var(--color-danger)]" data-testid="pay-error">{payError}</p>}
          <PaymentSection
            value={payBoxes}
            onChange={setPayBoxes}
            advanced={payAdvanced}
            onAdvancedChange={setPayAdvanced}
            channels={props.paymentChannels}
            direction={props.side === "expense" ? "IN" : "OUT"}
            docTotalSatang={totals.grandTotal}
            alreadyPaidSatang={0}
            whtBaseSatang={totals.afterDiscount}
            docTotalLabel={`ยอด${props.docLabel}`}
          />
        </>
      )}

      {/* G — หมายเหตุ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title="หมายเหตุสำหรับลูกค้า" complete={!!value.note.trim()} testId="sec-note">
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            value={value.note}
            onChange={(e) => set("note", e.target.value)}
            data-testid="fld-note"
          />
        </SectionCard>
        <SectionCard title="หมายเหตุภายใน" complete={!!value.internalNote.trim()} testId="sec-internal-note">
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            placeholder="ไม่พิมพ์บนเอกสาร"
            value={value.internalNote}
            onChange={(e) => set("internalNote", e.target.value)}
            data-testid="fld-internal-note"
          />
        </SectionCard>
      </div>

      {/* H — แนบไฟล์ */}
      <SectionCard title="แนบไฟล์" complete={attachmentCount > 0} testId="sec-attachments">
        <DocAttachments
          systemId={props.systemId}
          documentId={docId}
          storageEnabled={props.storageEnabled}
          initial={props.attachments}
          onNeedDraft={() => save({ silent: true })}
          onCountChange={setAttachmentCount}
        />
      </SectionCard>

      {/* I — แถบปุ่มท้าย (sticky) · g17: แถบยอดมือถืออยู่เหนือปุ่ม และติดล่างจอไปด้วยกัน */}
      <div className="sticky bottom-0 z-20">
        {mobileTotalsOpen && (
          <div
            className="border-t bg-[color:var(--color-surface)] px-4 py-3 md:hidden"
            data-testid="totals-m-panel"
          >
            <DocTotals
              totals={totals}
              vatRateBp={props.vatRateBp}
              vatRegistered={props.vatRegistered}
              docDiscount={value.docDiscount}
              onDocDiscountChange={(v) => set("docDiscount", v)}
            />
          </div>
        )}
        <MobileTotalsBar totals={totals} open={mobileTotalsOpen} onToggle={() => setMobileTotalsOpen((v) => !v)} />
        <StickyBar
          testId="editor-actions"
          secondary={
            <>
              {autoCreatedDraft ? (
                <form action={discardDraftAction}>
                  <input type="hidden" name="systemId" value={props.systemId} />
                  <input type="hidden" name="docType" value={props.docType} />
                  <input type="hidden" name="id" value={docId ?? ""} />
                  <button type="submit" className="btn btn-ghost text-sm" data-testid="btn-cancel">
                    ยกเลิก
                  </button>
                </form>
              ) : (
                <Link href={props.listPath} className="btn btn-ghost text-sm" data-testid="btn-cancel">
                  ยกเลิก
                </Link>
              )}
              <span className="relative">
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => setDraftMenuOpen((v) => !v)}
                  disabled={pending || saving}
                  aria-expanded={draftMenuOpen}
                  data-testid="btn-save-draft"
                >
                  {saving ? "กำลังบันทึก…" : "บันทึกร่าง"} ▾
                </button>
                {draftMenuOpen && (
                  <span className="absolute bottom-full left-0 z-30 mb-1 flex w-56 flex-col rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.12)]">
                    <button
                      type="button"
                      className="px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => {
                        setDraftMenuOpen(false);
                        saveDraftAndGo("detail");
                      }}
                    >
                      บันทึกร่าง
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => {
                        setDraftMenuOpen(false);
                        saveDraftAndGo("new");
                      }}
                    >
                      บันทึกและสร้างใหม่
                    </button>
                  </span>
                )}
              </span>
            </>
          }
          primary={
            <span className="relative flex justify-end">
              <button
                type="button"
                className="btn btn-primary text-sm disabled:opacity-40"
                disabled={pending || saving || capExceeded}
                title={capExceeded ? "ยอดเกินยอดคงเหลือของเอกสารอ้างอิง — แก้ยอดหรือเลือกเอกสารอ้างอิงใหม่ก่อนอนุมัติ" : undefined}
                aria-expanded={approveOpen}
                onClick={() => setApproveOpen((v) => !v)}
                data-testid="btn-approve-menu"
              >
                {pending ? "กำลังอนุมัติ…" : `อนุมัติ${props.docLabel}`} ▾
              </button>
              {approveOpen && (
                <span
                  className="absolute bottom-full right-0 z-30 mb-1 flex w-60 flex-col rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.12)]"
                  data-testid="approve-menu"
                >
                  <span className="px-3 py-2 text-xs text-[color:var(--color-muted)]">เลือกการอนุมัติ</span>
                  {(
                    [
                      { next: "" as const, icon: "✓", label: "อนุมัติ" },
                      { next: "print" as const, icon: "🖨", label: "อนุมัติและพิมพ์" },
                      { next: "email" as const, icon: "✉", label: "อนุมัติและส่งอีเมล" },
                      { next: "pay" as const, icon: "💵", label: "อนุมัติและรับชำระ" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                      onClick={() => {
                        setApproveOpen(false);
                        approve(o.next);
                      }}
                      data-testid={`approve-${o.next || "plain"}`}
                    >
                      <span aria-hidden>{o.icon}</span>
                      {o.label}
                    </button>
                  ))}
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* ฟอร์มจริงของการอนุมัติ — ยิง server action (redirect ไปหน้าเอกสาร) */}
      <form ref={approveFormRef} action={approveDocAction} className="hidden">
        <input type="hidden" name="systemId" value={props.systemId} />
        <input type="hidden" name="docType" value={props.docType} />
        <input type="hidden" name="id" ref={approveIdRef} defaultValue={docId ?? ""} />
        <input type="hidden" name="next" ref={approveNextRef} defaultValue="" />
      </form>
    </div>
  );
}

/** ช่องสรุปเล็กบนการ์ดหัวของ g2 (ป้ายจาง + ค่าตัวหนา) */
function HeadStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className="text-base font-semibold">{value}</span>
    </div>
  );
}

/** ISO + n วัน (ตามปฏิทิน ไม่พึ่ง TZ ของเครื่อง — ทำงานบนสตริงล้วน) */
function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default DocEditorV2;
