"use client";
// TRIPS T1.4 ▸ ชิ้นส่วนร่วมของใบรายชื่อรายวัน (ภาพ 12): ข้อความจากรหัส · ป้ายรายชื่อ·เอกสารแยกรูปทรง · รายชื่อรายคน · ปุ่มของส่วนที่ยังไม่เปิดใช้
//   🔴 แสดงผลเท่านั้น — สถานะ/จำนวน/ยอด มาจาก loadManifestVM (คอมโพเนนต์ไม่บวกเลข ไม่ตัดสินสถานะ ไม่คิดวันเวลา)
//   🔴 รหัสดิบ (สถานะ · ช่องทาง · ชนิดเอกสาร ฯลฯ) ไม่ขึ้นจอ — ผ่านข้อความ trips.manifest.* เสมอ (รหัสนอกชุด ⇒ ข้อความสำรอง)
//   🔴 ไม่มีเนื้อหาสุขภาพ/เลขเอกสารเต็ม/เบอร์เต็มในไฟล์นี้ — VM ไม่มีค่าเหล่านั้น
import { useTranslations } from "next-intl";
import type { ManifestExtraQty, ManifestPaxQty, ManifestPaxVM, ManifestRowVM } from "@/lib/modules/trips";
import { BTN } from "./ProductsScreenParts";
import { useDepDates, useTitle } from "./DepartureParts";
import { formatBaht } from "./trips-shared";

const DEP_STATUS = ["OPEN", "GUARANTEED", "FULL", "CLOSED", "CANCELLED"];
const FORM_CODES = ["NOT_REQUIRED", "PENDING", "SUBMITTED", "VERIFIED", "NEEDS_FIX"];
const WAIVER_CODES = ["NOT_REQUIRED", "MISSING", "SIGNED", "NEEDS_RESIGN"];
const HEALTH_CODES = ["NOT_COLLECTED", "MISSING", "PROVIDED", "DECLINED", "WITHDRAWN", "GUARDIAN_REQUIRED", "PURGED"];
const DOC_TYPE_CODES = ["PASSPORT", "ID_CARD", "OTHER"];

/** ข้อความของรหัสต่าง ๆ บนใบรายชื่อ (ตามภาษาผู้ดู) */
export function useMfText(channels: readonly string[]) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const T = useTitle();
  const pick = (ns: string, codes: readonly string[], code: string) => t(`manifest.${ns}.${codes.includes(code) ? code : "unknown"}`);
  const formStatus = (code: string) => pick("formStatus", FORM_CODES, code);
  const waiver = (code: string) => pick("waiver", WAIVER_CODES, code);
  const health = (code: string) => pick("health", HEALTH_CODES, code);
  const docType = (code: string | null) => (code ? t(`manifest.docType.${DOC_TYPE_CODES.includes(code) ? code : "OTHER"}`) : "");
  /** ชื่อสถานะรอบ — ใช้ชื่อเดียวกับจอปฏิทินรอบ */
  const depStatus = (code: string) => (DEP_STATUS.includes(code) ? t(`departures.state.${code}`) : "");
  /** ชื่อช่องทางขาย — ชุดเดียวกับจอการจอง */
  const channel = (code: string) => (channels.includes(code) ? t(`bookings.channel.${code}`) : t("bookings.filter.direct"));
  /** จำนวนเงินพร้อมสกุลเงิน — รูปเดียวต่อภาษา (ข้อความเดียวกับจอการจอง) */
  const money = (satang: number) => t("bookings.detail.baht", { amount: formatBaht(satang) });
  /** "2 ผู้ใหญ่ 1 เด็ก" */
  const paxLine = (pax: readonly ManifestPaxQty[]) => pax.map((p) => t("manifest.kpi.paxItem", { qty: p.qty, label: T(p.labelTh, p.labelEn) })).join(" ");
  const extraText = (x: ManifestExtraQty) => (x.qty > 1 ? t("manifest.kpi.extraItem", { label: T(x.nameTh, x.nameEn), qty: x.qty }) : T(x.nameTh, x.nameEn));
  /** ชื่อผู้จองของแถว (ถูกลบตามนโยบาย / ไม่มีชื่อ ⇒ ข้อความ) */
  const booker = (row: Pick<ManifestRowVM, "bookerName" | "bookerPurged">) => (row.bookerPurged ? t("manifest.bookerPurged") : (row.bookerName ?? t("manifest.noBooker")));
  const contact = (row: Pick<ManifestRowVM, "phoneMasked" | "contactRoute">) => (row.contactRoute === "VIA_AGENT" ? t("manifest.contact.viaAgent") : (row.phoneMasked ?? t("manifest.contact.none")));
  /** ชื่อผู้เดินทาง (ถูกลบ / ยังไม่กรอก ⇒ ข้อความ) */
  const paxName = (p: Pick<ManifestPaxVM, "fullName" | "purged">) => (p.purged ? t("manifest.pax.purged") : (p.fullName ?? t("manifest.pax.noName")));
  const paxType = (p: Pick<ManifestPaxVM, "paxTypeTh" | "paxTypeEn">) => (p.paxTypeTh ? T(p.paxTypeTh, p.paxTypeEn) : "");
  const docLine = (p: Pick<ManifestPaxVM, "docType" | "docMasked">) => (p.docType || p.docMasked ? t("manifest.pax.docLine", { type: docType(p.docType), masked: p.docMasked ?? "" }).trim() : "");
  /** บรรทัดหมายเหตุของแถว: รายการเสริม · ขนาดตีนกบ · ซื้อรับส่ง (สถานะ ไม่ใช่เนื้อหา) */
  const noteParts = (row: Pick<ManifestRowVM, "extras" | "travellers" | "pickup">) => {
    const fins = row.travellers.filter((p) => !p.purged && p.finSize).map((p) => p.finSize);
    return [...row.extras.map(extraText), ...(fins.length ? [t("manifest.pax.fin", { size: fins.join(", ") })] : []), ...(row.pickup.paid ? [t("manifest.pax.pickupPaid")] : [])];
  };
  return { t, D, T, formStatus, waiver, health, docType, depStatus, channel, money, paxLine, extraText, booker, contact, paxName, paxType, docLine, noteParts };
}
export type MfText = ReturnType<typeof useMfText>;

/**
 * ป้ายรายชื่อ·เอกสารของการจอง — แยกด้วยรูปทรง ไม่ใช่สีอย่างเดียว:
 * ทึบ = ครบ · กรอบสีอันตราย + ไอคอน = ขาดรายชื่อ · เส้นประ = แบบฟอร์มยังไม่ครบ · จาง = ลบตามนโยบายแล้ว
 */
export function DocBadge({ doc, X }: { doc: ManifestRowVM["doc"]; X: MfText }) {
  const base = "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-sm";
  if (doc.state === "MISSING_NAMES") {
    return (
      <span data-shape="alert" data-doc-state={doc.state} className={`${base} border-2 border-[color:var(--color-danger)] font-bold text-[color:var(--color-danger)]`}>
        <span aria-hidden="true">⚠</span>
        <span className="[overflow-wrap:anywhere]">{X.t("manifest.docState.MISSING_NAMES", { n: doc.missingNames })}</span>
      </span>
    );
  }
  if (doc.state === "INCOMPLETE") {
    return (
      <span data-shape="dashed" data-doc-state={doc.state} className={`${base} border border-dashed border-[color:var(--color-ink-soft)] text-[color:var(--color-ink-soft)]`}>
        {X.t("manifest.docState.INCOMPLETE")}
      </span>
    );
  }
  if (doc.state === "PURGED") {
    return (
      <span data-shape="muted" data-doc-state={doc.state} className={`${base} border border-transparent bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]`}>
        {X.t("manifest.docState.PURGED")}
      </span>
    );
  }
  return (
    <span data-shape="solid" data-doc-state={doc.state} className={`${base} border border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]`}>
      {X.t("manifest.docState.COMPLETE")}
    </span>
  );
}

/** ป้ายรอง ๆ ของคอลัมน์รายชื่อ·เอกสาร: เซ็นแล้ว a/b · ต้องแก้ n */
export function DocExtras({ doc, X }: { doc: ManifestRowVM["doc"]; X: MfText }) {
  return (
    <>
      {doc.waiverRequired > 0 ? <span className="text-sm text-[color:var(--color-ink-soft)]">{X.t("manifest.pax.signed", { a: doc.waiverSigned, b: doc.waiverRequired })}</span> : null}
      {doc.needsFix > 0 ? <span className="text-sm font-medium text-[color:var(--color-danger)]">{X.t("manifest.pax.needsFix", { n: doc.needsFix })}</span> : null}
    </>
  );
}

/** ป้ายสถานะข้อมูลสุขภาพของการจอง (จำนวน ไม่ใช่เนื้อหา) */
export function HealthCounts({ doc, X }: { doc: ManifestRowVM["doc"]; X: MfText }) {
  return (
    <>
      {doc.healthProvided > 0 ? <span className="text-sm text-[color:var(--color-ink)]">{X.t("manifest.pax.healthProvided", { n: doc.healthProvided })}</span> : null}
      {doc.healthMissing > 0 ? <span className="text-sm text-[color:var(--color-ink-soft)]">{X.t("manifest.pax.healthMissing", { n: doc.healthMissing })}</span> : null}
    </>
  );
}

/**
 * รายชื่อรายคนของการจอง (รายการ ไม่ใช่ตาราง — ใช้ได้ทั้งในแถวตาราง การ์ดมือถือ และผังพิมพ์)
 * print = ผังพิมพ์: ไม่แสดงจำนวนไฟล์ที่รอลบ (ข้อมูลของจอร้านเท่านั้น)
 */
export function PaxList({ row, X, print, testid }: { row: ManifestRowVM; X: MfText; print?: boolean; testid?: string }) {
  const { t } = X;
  if (row.travellers.length === 0) {
    return (
      <p data-testid={testid} className="text-sm text-[color:var(--color-muted)]">
        {t("manifest.pax.none")}
      </p>
    );
  }
  return (
    <ol data-testid={testid} aria-label={t("manifest.pax.listAria", { code: row.code })} className="flex min-w-0 flex-col gap-1.5">
      {row.travellers.map((p) => (
        <li key={p.passengerId} data-purged={p.purged ? "true" : undefined} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-[color:var(--color-ink)]">
          <span className="tabular-nums text-[color:var(--color-muted)]">{p.no}.</span>
          <b className={`min-w-0 [overflow-wrap:anywhere] ${p.purged || !p.fullName ? "font-medium text-[color:var(--color-muted)]" : ""}`}>{X.paxName(p)}</b>
          {p.purged ? null : (
            <>
              {X.paxType(p) ? <span>{X.paxType(p)}</span> : null}
              {p.isMinor ? <span>{t("manifest.pax.minor")}</span> : null}
              {p.nationality ? <span className="[overflow-wrap:anywhere]">{p.nationality}</span> : null}
              {X.docLine(p) ? <span className="whitespace-nowrap tabular-nums">{X.docLine(p)}</span> : null}
              <span>
                {t("manifest.pax.colForm")}: {X.formStatus(p.formStatus)}
              </span>
              <span>
                {t("manifest.pax.colWaiver")}: {X.waiver(p.waiver)}
              </span>
              <span>
                {t("manifest.pax.colHealth")}: {X.health(p.health)}
              </span>
              {p.finSize ? <span className="[overflow-wrap:anywhere]">{t("manifest.pax.fin", { size: p.finSize })}</span> : null}
            </>
          )}
          {print ? null : (
            <span className="text-[color:var(--color-ink-soft)]">
              {t("manifest.pax.files", { n: p.docs.live })}
              {p.docs.pendingDeletion > 0 ? ` · ${t("manifest.pax.pendingDeletion", { n: p.docs.pendingDeletion })}` : ""}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** ปุ่มของส่วนที่ยังไม่เปิดใช้ — กดไม่ได้ + บอกตรง ๆ ว่ายังไม่เปิดใช้ (ไม่มีรหัสใบงานบนจอ) */
export function MfNotYet({ "data-testid": testid, label, hint, className }: { "data-testid": string; label: string; hint: string; className?: string }) {
  const t = useTranslations("trips");
  return (
    <button type="button" data-testid={testid} disabled title={hint} aria-label={`${label} — ${hint}`} className={`${className ?? BTN} h-auto flex-wrap gap-x-1.5 gap-y-0`}>
      <span>{label}</span>
      <span className="text-sm text-[color:var(--color-muted)]">· {t("manifest.notYet.label")}</span>
    </button>
  );
}
