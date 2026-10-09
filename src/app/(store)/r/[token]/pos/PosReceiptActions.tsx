"use client";

// PosReceiptActions.tsx — ปุ่ม 4 ปุ่มของใบเสร็จออนไลน์ (ภาพ 11C) + แผ่นฟอร์ม (P1.11U มติข้อ 3)
//   ขอใบกำกับภาษีเต็มรูป (ปุ่มดำ · AVAILABLE เท่านั้น · REQUESTED/ISSUED = ปุ่มจางกดไม่ได้ · NOT_AVAILABLE = ซ่อน) ·
//   ดูแต้มของฉัน (เฉพาะบิลสมาชิก · กางในหน้า ไม่อ่านเซิร์ฟเวอร์เพิ่ม) · ให้คะแนนร้าน (actions.review) · แจ้งปัญหาบิลนี้ (เสมอ)
// 🔴 ส่งเฉพาะ token + ข้อมูลที่ลูกค้ากรอก (R9) — ไม่มี id ใด ๆ · คำปฏิเสธแสดงผ่าน receiptRefusalMessageKey (ไม่แสดง message ของเซิร์ฟเวอร์)
// 🔴 'use client': import ได้เฉพาะไฟล์บริสุทธิ์ (*-shared · receipt-render) + server action ข้างหน้า (../pos-receipt-actions)

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { reportReceiptIssueAction, requestFullTaxInvoiceAction, submitReceiptReviewAction } from "../pos-receipt-actions";
import { receiptRefusalMessageKey } from "@/lib/modules/pos/receipt-render";
import {
  RECEIPT_EMAIL_RE,
  RECEIPT_ISSUE_CONTACT_MAX,
  RECEIPT_ISSUE_MESSAGE_MAX,
  RECEIPT_REVIEW_BODY_MAX,
  TAX_INVOICE_REQUEST_DAYS,
  textLength,
  type PublicReceipt,
  type PublicTaxInvoiceAction,
} from "@/lib/modules/pos/receipt-public-shared";

type T = (key: string, values?: Record<string, string | number>) => string;
type Sheet = "tax" | "review" | "issue" | null;

const btnBase = "flex h-[46px] w-full items-center justify-start gap-[9px] rounded-[13px] px-5 text-left text-[15px] font-medium transition-colors";
const btnGhost = `${btnBase} border border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]`;
const btnMuted = `${btnBase} border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]`;
const inputCls = "w-full rounded-[11px] border border-[color:var(--color-line)] px-3 py-2.5 text-[15px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-ink)]";
const closeCls = "-mr-2 grid h-11 w-11 place-items-center rounded-lg text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]";
const labelCls = "flex flex-col gap-1.5 text-[13px] text-[color:var(--color-ink-soft)]";

function Icon({ name, className = "" }: { name: "doc" | "pig" | "flag" | "warn" | "arrow" | "x" | "check"; className?: string }) {
  const d: Record<typeof name, React.ReactNode> = {
    doc: (
      <>
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5M10 13h6M10 17h6" />
      </>
    ),
    pig: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 12h5M12 9.5v5" />
      </>
    ),
    flag: <path d="M6 21V4m0 0h11l-2 4 2 4H6" />,
    warn: (
      <>
        <path d="M12 4l9 16H3z" />
        <path d="M12 10v4M12 17.5v.01" />
      </>
    ),
    arrow: <path d="M9 6l6 6-6 6" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {d[name]}
    </svg>
  );
}

/** แผ่นล่าง (390) / กล่องกลางจอ (จอกว้าง) · Esc ปิด */
const PANEL_TESTID = { tax: "pos-rpub-taxinvoice-sheet", review: "pos-rpub-review-sheet", issue: "pos-rpub-issue-sheet" } as const;
function RpubPanel({ kind, title, closeLabel, onClose, children }: { kind: keyof typeof PANEL_TESTID; title: string; closeLabel: string; onClose: () => void; children: React.ReactNode }) {
  const hid = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={hid}
        data-testid={PANEL_TESTID[kind]}
        className="flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-y-auto rounded-t-[20px] bg-[color:var(--color-surface)] px-5 pb-6 pt-2 shadow-xl sm:rounded-[20px]"
      >
        <div className="flex items-center gap-2">
          <h2 id={hid} className="flex-1 text-[17px] font-bold text-[color:var(--color-ink)]">
            {title}
          </h2>
          {kind === "tax" ? (
            <button type="button" data-testid="pos-rpub-taxinvoice-close" aria-label={closeLabel} onClick={onClose} className={closeCls}>
              <Icon name="x" />
            </button>
          ) : kind === "review" ? (
            <button type="button" data-testid="pos-rpub-review-close" aria-label={closeLabel} onClick={onClose} className={closeCls}>
              <Icon name="x" />
            </button>
          ) : (
            <button type="button" data-testid="pos-rpub-issue-close" aria-label={closeLabel} onClick={onClose} className={closeCls}>
              <Icon name="x" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function PosReceiptActions({ token, actions, points }: { token: string; actions: PublicReceipt["actions"]; points: PublicReceipt["points"] }) {
  const t = useTranslations("pos.receipt") as unknown as T;
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setSheet(null);
    setErr(null);
  };
  const open = (s: Exclude<Sheet, null>) => {
    setErr(null);
    setSheet(s);
  };
  const refusal = (code: string, kind?: "issue") => (kind === "issue" && code === "RATE_LIMITED" ? t("issue.errors.rateLimited") : t(receiptRefusalMessageKey(code)));

  // ── ใบกำกับภาษีเต็มรูป ──
  const [tax, setTax] = useState<PublicTaxInvoiceAction>(actions.taxInvoice);
  const [tf, setTf] = useState({ name: "", taxId: "", branchCode: "00000", address: "", email: "" });
  const [taxDone, setTaxDone] = useState(false);
  const submitTax = async () => {
    const name = tf.name.trim();
    const address = tf.address.trim();
    const email = tf.email.trim();
    const branchCode = tf.branchCode.trim() || "00000";
    if (!name || !address) return setErr(t("public.required"));
    if (!/^\d{13}$/.test(tf.taxId.trim())) return setErr(t("taxInvoice.taxIdInvalid"));
    if (!/^\d{5}$/.test(branchCode)) return setErr(t("taxInvoice.branchInvalid"));
    if (email && !RECEIPT_EMAIL_RE.test(email)) return setErr(t("send.emailInvalid"));
    setBusy(true);
    setErr(null);
    try {
      const r = await requestFullTaxInvoiceAction(token, { name, taxId: tf.taxId.trim(), branchCode, address, ...(email ? { email } : {}) });
      if (r.ok) {
        setTax("REQUESTED");
        setTaxDone(true);
        setSheet(null);
        router.refresh();
        return;
      }
      if (r.code === "ALREADY_REQUESTED") setTax("REQUESTED");
      if (r.code === "NOT_ELIGIBLE") setTax("NOT_AVAILABLE");
      setErr(refusal(r.code));
    } catch {
      setErr(t("errors.internal"));
    } finally {
      setBusy(false);
    }
  };

  // ── แต้ม ──
  const [pointsOpen, setPointsOpen] = useState(false);

  // ── รีวิว ──
  const [review, setReview] = useState<{ state: "open" | "done" | "muted" | "hidden"; text?: string }>({ state: actions.review ? "open" : "hidden" });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const submitReview = async () => {
    if (rating < 1) return setErr(t("review.pick"));
    setBusy(true);
    setErr(null);
    try {
      const b = body.trim();
      const r = await submitReceiptReviewAction(token, { rating, ...(b ? { body: b } : {}) });
      if (r.ok) {
        setReview({ state: "done" });
        setSheet(null);
        return;
      }
      if (r.code === "ALREADY_REVIEWED" || r.code === "REVIEW_EXPIRED") {
        setReview({ state: "muted", text: refusal(r.code) });
        setSheet(null);
        return;
      }
      if (r.code === "NO_MEMBER") {
        setReview({ state: "hidden" });
        setSheet(null);
        return;
      }
      setErr(refusal(r.code));
    } catch {
      setErr(t("errors.internal"));
    } finally {
      setBusy(false);
    }
  };

  // ── แจ้งปัญหา ──
  const [issueSent, setIssueSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState("");
  const submitIssue = async () => {
    const m = msg.trim();
    if (!m) return setErr(t("public.required"));
    setBusy(true);
    setErr(null);
    try {
      const c = contact.trim();
      const r = await reportReceiptIssueAction(token, { message: m, ...(c ? { contact: c } : {}) });
      if (r.ok) {
        setIssueSent(true);
        setSheet(null);
        return;
      }
      setErr(refusal(r.code, "issue"));
    } catch {
      setErr(t("errors.internal"));
    } finally {
      setBusy(false);
    }
  };

  const errLine = (id: string) =>
    err ? (
      <p role="alert" data-testid={id} className="text-[13px] text-[color:var(--color-danger)]">
        {err}
      </p>
    ) : null;
  const counter = (n: number, max: number) => <span className="self-end text-[11.5px] text-[color:var(--color-muted)] tabular-nums">{t("public.counter", { n, max })}</span>;

  return (
    <>
      <div className="mt-[17px] flex flex-col gap-4">
        {/* ขอใบกำกับภาษีเต็มรูป */}
        {tax === "AVAILABLE" ? (
          <button type="button" data-testid="pos-rpub-taxinvoice-open" onClick={() => open("tax")} className={`${btnBase} bg-[color:var(--color-ink)] text-[color:var(--color-surface)] hover:bg-[color:var(--color-ink-soft)]`}>
            <Icon name="doc" />
            {t("taxInvoice.open")}
            <Icon name="arrow" className="ml-auto opacity-60" />
          </button>
        ) : tax === "REQUESTED" || tax === "ISSUED" ? (
          <div data-testid="pos-rpub-taxinvoice-state" data-state={tax} aria-disabled="true" className={btnMuted}>
            <Icon name={tax === "ISSUED" ? "check" : "doc"} />
            {tax === "ISSUED" ? t("taxInvoice.issued") : t("taxInvoice.requested")}
          </div>
        ) : null}
        {taxDone ? (
          <p data-testid="pos-rpub-taxinvoice-done" role="status" className="-mt-2 text-[13px] text-[color:var(--color-ink-soft)]">
            {t("taxInvoice.done")}
          </p>
        ) : null}

        {/* ดูแต้มของฉัน (บิลสมาชิกเท่านั้น) */}
        {points ? (
          <div className="flex flex-col gap-2">
            <button type="button" data-testid="pos-rpub-points-toggle" aria-expanded={pointsOpen} onClick={() => setPointsOpen((v) => !v)} className={btnGhost}>
              <Icon name="pig" />
              {t("public.points.open", { balance: points.balance.toLocaleString("en-US") })}
              <Icon name="arrow" className={`ml-auto text-[color:var(--color-muted)] transition-transform ${pointsOpen ? "rotate-90" : ""}`} />
            </button>
            {pointsOpen ? (
              <dl data-testid="pos-rpub-points" className="rounded-[12px] border px-[14px] py-2.5 text-[13px] tabular-nums">
                <div className="flex justify-between py-[3px]">
                  <dt className="text-[color:var(--color-ink-soft)]">{t("public.points.earned")}</dt>
                  <dd>{t("public.points.unit", { n: points.earned.toLocaleString("en-US") })}</dd>
                </div>
                <div className="flex justify-between py-[3px] font-semibold">
                  <dt>{t("public.points.balance")}</dt>
                  <dd>{t("public.points.unit", { n: points.balance.toLocaleString("en-US") })}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}

        {/* ให้คะแนนร้าน */}
        {review.state === "open" ? (
          <button type="button" data-testid="pos-rpub-review-open" onClick={() => open("review")} className={btnGhost}>
            <Icon name="flag" />
            {t("review.open")}
            <span aria-hidden="true" className="tracking-[1px]">
              ★★★★★
            </span>
            <Icon name="arrow" className="ml-auto text-[color:var(--color-muted)]" />
          </button>
        ) : review.state === "done" || review.state === "muted" ? (
          <p data-testid="pos-rpub-review-done" role="status" className={btnMuted}>
            <Icon name="flag" />
            <span className="min-w-0 truncate">{review.state === "done" ? t("review.done") : review.text}</span>
          </p>
        ) : null}

        {/* แจ้งปัญหาบิลนี้ */}
        {issueSent ? (
          <p data-testid="pos-rpub-issue-sent" role="status" className={btnMuted}>
            <Icon name="check" />
            {t("issue.sent")}
          </p>
        ) : (
          <button type="button" data-testid="pos-rpub-issue-open" onClick={() => open("issue")} className={btnGhost}>
            <Icon name="warn" />
            {t("issue.open")}
            <Icon name="arrow" className="ml-auto text-[color:var(--color-muted)]" />
          </button>
        )}
      </div>

      {sheet === "tax" ? (
        <RpubPanel kind="tax" title={t("taxInvoice.title")} closeLabel={t("public.close")} onClose={close}>
          <form
            data-testid="pos-rpub-taxinvoice-form"
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitTax();
            }}
          >
            <p className="text-[13px] text-[color:var(--color-muted)]">{t("taxInvoice.hint", { days: TAX_INVOICE_REQUEST_DAYS })}</p>
            <label className={labelCls}>
              {t("taxInvoice.name")}
              <input data-testid="pos-rpub-taxinvoice-name" className={inputCls} value={tf.name} maxLength={120} autoComplete="organization" onChange={(e) => setTf({ ...tf, name: e.target.value })} />
            </label>
            <label className={labelCls}>
              {t("taxInvoice.taxId")}
              <input data-testid="pos-rpub-taxinvoice-taxid" className={inputCls} value={tf.taxId} inputMode="numeric" maxLength={13} placeholder="0000000000000" onChange={(e) => setTf({ ...tf, taxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} />
            </label>
            <label className={labelCls}>
              {t("taxInvoice.branchCode")}
              <input data-testid="pos-rpub-taxinvoice-branch" className={inputCls} value={tf.branchCode} inputMode="numeric" maxLength={5} onChange={(e) => setTf({ ...tf, branchCode: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
            </label>
            <label className={labelCls}>
              {t("taxInvoice.address")}
              <textarea data-testid="pos-rpub-taxinvoice-address" className={inputCls} rows={3} maxLength={300} value={tf.address} autoComplete="street-address" onChange={(e) => setTf({ ...tf, address: e.target.value })} />
            </label>
            <label className={labelCls}>
              {t("taxInvoice.email")}
              <input data-testid="pos-rpub-taxinvoice-email" className={inputCls} type="email" value={tf.email} maxLength={200} autoComplete="email" onChange={(e) => setTf({ ...tf, email: e.target.value })} />
            </label>
            {errLine("pos-rpub-taxinvoice-error")}
            <button type="submit" data-testid="pos-rpub-taxinvoice-submit" disabled={busy} className="btn btn-primary mt-1 h-[46px] rounded-[13px] text-[15px] disabled:opacity-60">
              {busy ? t("public.sending") : t("taxInvoice.submit")}
            </button>
          </form>
        </RpubPanel>
      ) : null}

      {sheet === "review" ? (
        <RpubPanel kind="review" title={t("review.title")} closeLabel={t("public.close")} onClose={close}>
          <form
            data-testid="pos-rpub-review-form"
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitReview();
            }}
          >
            <div role="radiogroup" aria-label={t("review.title")} className="flex justify-center gap-1 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={t("review.star", { n })}
                  data-testid={`pos-rpub-review-star-${n}`}
                  onClick={() => setRating(n)}
                  className={`grid h-12 w-12 place-items-center rounded-lg text-[30px] leading-none ${n <= rating ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-line)]"}`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className={labelCls}>
              {t("review.body")}
              <textarea data-testid="pos-rpub-review-body" className={inputCls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
              {counter(textLength(body.trim()), RECEIPT_REVIEW_BODY_MAX)}
            </label>
            {errLine("pos-rpub-review-error")}
            <button type="submit" data-testid="pos-rpub-review-submit" disabled={busy || textLength(body.trim()) > RECEIPT_REVIEW_BODY_MAX} className="btn btn-primary h-[46px] rounded-[13px] text-[15px] disabled:opacity-60">
              {busy ? t("public.sending") : t("review.submit")}
            </button>
          </form>
        </RpubPanel>
      ) : null}

      {sheet === "issue" ? (
        <RpubPanel kind="issue" title={t("issue.title")} closeLabel={t("public.close")} onClose={close}>
          <form
            data-testid="pos-rpub-issue-form"
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitIssue();
            }}
          >
            <label className={labelCls}>
              {t("issue.message")}
              <textarea data-testid="pos-rpub-issue-message" className={inputCls} rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} />
              {counter(textLength(msg.trim()), RECEIPT_ISSUE_MESSAGE_MAX)}
            </label>
            <label className={labelCls}>
              {t("issue.contact")}
              <input data-testid="pos-rpub-issue-contact" className={inputCls} value={contact} maxLength={RECEIPT_ISSUE_CONTACT_MAX} onChange={(e) => setContact(e.target.value)} />
            </label>
            {errLine("pos-rpub-issue-error")}
            <button type="submit" data-testid="pos-rpub-issue-submit" disabled={busy || textLength(msg.trim()) > RECEIPT_ISSUE_MESSAGE_MAX} className="btn btn-primary h-[46px] rounded-[13px] text-[15px] disabled:opacity-60">
              {busy ? t("public.sending") : t("issue.submit")}
            </button>
          </form>
        </RpubPanel>
      ) : null}
    </>
  );
}
