// HR H3.5 ▸ หน้าจอไฟล์โอนเงินเดือน (brief R15 · §6 เทียบภาพ 06: ปุ่ม "ไฟล์โอน" · ช่อง hero "โอน N คน · ฿X" · เลขบัญชี •••4 ตัวท้ายแบบลิ้นชัก)
//   server component ล้วน (ไม่มี "use client") — ข้อมูลที่ถึงเบราว์เซอร์มาจาก DTO ของ service เท่านั้น (เลขบัญชีแบบปิด) ·
//   ส่วนบนหน้าเงินเดือน = ผู้ผ่านด่าน (OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) เท่านั้น อื่น ๆ ไม่แสดงอะไรเลย ·
//   การ์ดตั้งค่า: บัญชีต้นทาง + เปิดรูปแบบธนาคาร = เจ้าของร้าน · ชุดคอลัมน์ = ผู้ผ่านด่าน ·
//   รูปแบบธนาคารทุกจุดมีป้าย "ยังไม่ทดสอบกับธนาคารจริง" + ติ๊กรับทราบก่อนสร้าง · ข้อความกฎหมาย (ม.55/ม.77) แสดงเสมอ ·
//   ผลการกดอ่านจาก ?bmsg= / ?msg= ผ่านรายการคงที่ (allowlist) ◂
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "../privacy";
import { BANK_TEXT, bankTextFor, type BankTexts } from "./codes"; // HR H3.5 fix r1 ▸ F7: ข้อความตามภาษาผู้ดู ◂
import { refusalKey } from "./build";
import { GENERIC_FIELDS } from "./generic";
import { generateBankFileAction } from "./actions";
import { canUseBankFiles, getBankProfile, listBankFiles, listBankPresets, listBankRuns, previewBankFile, type BankFileRequest } from "./service";

const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const warnChip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-danger)] px-2.5 text-xs text-[color:var(--color-danger)]";
const input = "min-h-[44px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const label = "flex flex-col gap-1 text-sm";
const check = "inline-flex min-h-[44px] items-center gap-2 text-sm";
/** สตางค์ → "1,234.56" (จัดรูปที่ขอบเท่านั้น) */
const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ISO → "YYYY-MM-DD HH:mm" เวลาไทย */
const bkkTime = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** รหัสผลการกดของหน้าตั้งค่า → ข้อความคงที่ (allowlist) */
export const BANK_MSG: Record<string, string> = Object.fromEntries(
  Object.entries(BANK_TEXT)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => [`b.${k}`, v as string]),
);
/** HR H3.5 fix r1 ▸ F7: รหัสผลของหน้าตั้งค่า (b.<คีย์>) → ข้อความตามภาษาผู้ดู · ไม่ใช่รหัสของส่วนนี้ = null ◂ */
export async function bankMsgText(code: string): Promise<string | null> {
  if (!code.startsWith("b.")) return null;
  const tx = bankTextFor(await getLocale()) as unknown as Record<string, unknown>;
  const v = tx[code.slice(2)];
  return typeof v === "string" ? v : null;
}
/** คำปฏิเสธจาก service → ข้อความตามภาษาผู้ดู (รายชื่อจาก employees · ยอดรวมเกินช่อง = คำว่า "ยอดรวมของไฟล์") */
function refusalFor(tx: BankTexts, f: { code: string; reason: string; employees?: { name: string }[] }): string {
  const k = refusalKey(f.code) ?? (f.code === "FORMAT_OFF" ? "formatOff" : f.code === "NO" ? "no" : null);
  if (!k) return f.reason;
  const names = f.employees?.length ? f.employees.map((e) => e.name) : f.code === "AMOUNT" ? [tx.amountTotal] : [];
  return String((tx as unknown as Record<string, unknown>)[k]).replace("{names}", names.join(", "));
}
/** รหัสคำปฏิเสธจาก ?bmsg= ของหน้าเงินเดือน → คีย์ข้อความคงที่ (ENCODING/FORMULA แสดงจากตัวอย่างพร้อมรายชื่อแทน) */
const BMSG_KEY: Record<string, keyof typeof BANK_TEXT> = { NO: "no", STATUS: "status", NEGATIVE: "negative", MISMATCH: "mismatch", OPTIONS: "options", PROFILE: "profile", EMPTY: "empty", FORMAT_OFF: "formatOff", EXPIRED: "expired", CHANGED: "changed" };

type Pick = { format: "KBANK_PCT" | "KTB_IPAY" | "CSV" | "XLSX"; presetId?: string };
function pickOf(v: string | undefined): Pick | null {
  if (v === "KBANK_PCT" || v === "KTB_IPAY") return { format: v };
  const m = /^(CSV|XLSX):([A-Za-z0-9_-]{1,64})$/.exec(v ?? "");
  return m ? { format: m[1] as "CSV" | "XLSX", presetId: m[2] } : null;
}

export type BankSectionParams = { bank?: string; bfmt?: string; beff?: string; benc?: string; bmode?: string; bera?: string; bbranch?: string; bmsg?: string; bfile?: string };

/** ส่วนไฟล์โอนบนหน้าเงินเดือน — ผู้ไม่ผ่านด่านไม่เห็นอะไรเลย (คืน null) */
export async function BankFileSection({ systemId, sp }: { systemId: string; sp: BankSectionParams }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth);
  if (!(await canUseBankFiles(ctx, viewer))) return null;
  const t = await getTranslations("hr.bank");
  const tx = bankTextFor(await getLocale());
  const [runs, profile, presets] = await Promise.all([listBankRuns(ctx, viewer), getBankProfile(ctx, viewer), listBankPresets(ctx, viewer)]);
  if (!runs.ok) return null;
  const enabled = profile.ok && profile.profile ? profile.profile.formatsEnabled : [];
  const runId = ID_RE.test(sp.bank ?? "") && runs.items.some((r) => r.id === sp.bank) ? sp.bank! : null;
  const run = runId ? runs.items.find((r) => r.id === runId)! : null;
  const pick = pickOf(sp.bfmt) ?? { format: "CSV" as const, presetId: "GENERIC" };
  const pickValue = pick.presetId ? `${pick.format}:${pick.presetId}` : pick.format;
  const fixed = pick.format === "KBANK_PCT" || pick.format === "KTB_IPAY";
  const options: Record<string, string> = {};
  if (DAY_RE.test(sp.beff ?? "")) options.effectiveDate = sp.beff!;
  if (fixed && (sp.benc === "ASCII" || sp.benc === "TIS620")) options.encoding = sp.benc;
  if (pick.format === "KTB_IPAY") {
    if (sp.bmode === "STANDARD" || sp.bmode === "DIRECT") options.ktbMode = sp.bmode;
    if (sp.bera === "CE" || sp.bera === "BE") options.ktbDateEra = sp.bera;
    if (sp.bbranch === "SPACES" || sp.bbranch === "ZEROS") options.ktbReceivingBranch = sp.bbranch;
  }
  const req: BankFileRequest = { runId, format: pick.format, presetId: pick.presetId, options };
  const [preview, files] = run ? await Promise.all([previewBankFile(ctx, viewer, req), listBankFiles(ctx, viewer, { runId: run.id })]) : [null, null];
  const flashKey = sp.bmsg === "ack" ? null : BMSG_KEY[sp.bmsg ?? ""];
  const flash = sp.bmsg === "ack" ? t("ackNeeded") : flashKey ? String(tx[flashKey]) : "";
  const kindLabel = (k: "CSV" | "XLSX") => (k === "CSV" ? "CSV" : "Excel");
  const ni = preview && (preview.ok ? preview.notIncluded : (preview.notIncluded ?? []));
  const nowMs = Date.now();
  const justMade = ID_RE.test(sp.bfile ?? "") ? sp.bfile! : ""; // HR H3.5 fix r1 ▸ F5: ไฟล์ที่เพิ่งสร้าง — ลิงก์ <a download> เด่น ไม่ดาวน์โหลดเอง ◂

  return (
    <section className={card} id="hr-bank" aria-labelledby="hr-bank-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-bank-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
      </div>
      <p className={muted}>{t("desc")}</p>
      <p role="note" className="rounded-xl border border-[color:var(--color-line)] p-3 text-sm" data-testid="hr-bank-legal">
        {tx.legal}
      </p>
      <h3 className="text-sm font-semibold">{t("runs")}</h3>
      {runs.items.length === 0 ? (
        <p className={muted}>{t("noRuns")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--color-line)] p-3">
              <span className="text-sm">
                {t("runLine", { period: r.periodKey, day: r.payDay, amount: baht(r.totalNetSatang) })} <span className={chip}>{r.status === "PAID" ? t("statusPaid") : t("statusApproved")}</span>
              </span>
              <Link href={`/app/sys/${systemId}/hr/payroll?bank=${encodeURIComponent(r.id)}#hr-bank`} className={r.id === runId ? btn : ghost} data-testid={`hr-bank-open-${r.id}`} aria-current={r.id === runId ? "true" : undefined}>
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {run ? (
        <div className="flex flex-col gap-3 border-t border-[color:var(--color-line)] pt-3">
          {flash ? (
            <p role="status" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
              {flash}
            </p>
          ) : null}
          <form method="get" action={`/app/sys/${systemId}/hr/payroll#hr-bank`} className="flex flex-col gap-2">
            <input type="hidden" name="bank" value={run.id} />
            <label className={label}>
              {t("format")}
              <select name="bfmt" defaultValue={pickValue} className={input} data-testid="hr-bank-format">
                <optgroup label={t("groupGeneric")}>
                  {(["CSV", "XLSX"] as const).map((k) => (
                    <option key={`${k}-g`} value={`${k}:GENERIC`}>
                      {t("fmtGeneric", { kind: kindLabel(k) })}
                    </option>
                  ))}
                  {(["CSV", "XLSX"] as const).map((k) => (
                    <option key={`${k}-k`} value={`${k}:KTB_BUSINESS`}>
                      {t("fmtKtbBiz", { kind: kindLabel(k) })}
                    </option>
                  ))}
                  {(presets.ok ? presets.items : []).map((p) => (
                    <option key={p.id} value={`${p.kind}:${p.id}`}>
                      {t("fmtPreset", { kind: kindLabel(p.kind), name: p.name })}
                    </option>
                  ))}
                </optgroup>
                {enabled.length ? (
                  <optgroup label={t("groupBank")}>
                    {enabled.includes("KBANK_PCT") ? <option value="KBANK_PCT">{`${t("fmtKbank")} · ${t("untested")}`}</option> : null}
                    {enabled.includes("KTB_IPAY") ? <option value="KTB_IPAY">{`${t("fmtKtb")} · ${t("untested")}`}</option> : null}
                  </optgroup>
                ) : null}
              </select>
            </label>
            {enabled.length === 0 ? <p className={muted}>{t("noBankFormat")}</p> : null}
            <div className="flex flex-wrap gap-3">
              <label className={label}>
                {t("effective")}
                <input type="date" name="beff" defaultValue={options.effectiveDate ?? run.payDay} className={input} />
              </label>
              {enabled.length ? (
                <label className={label}>
                  {t("encoding")}
                  <select name="benc" defaultValue={options.encoding ?? "TIS620"} className={input}>
                    <option value="TIS620">{t("encTis")}</option>
                    <option value="ASCII">{t("encAscii")}</option>
                  </select>
                </label>
              ) : null}
            </div>
            {enabled.includes("KTB_IPAY") ? (
              <div className="flex flex-wrap gap-3">
                <label className={label}>
                  {t("ktbMode")}
                  <select name="bmode" defaultValue={options.ktbMode ?? "STANDARD"} className={input}>
                    <option value="STANDARD">{t("ktbStd")}</option>
                    <option value="DIRECT">{t("ktbDirect")}</option>
                  </select>
                </label>
                <label className={label}>
                  {t("ktbEra")}
                  <select name="bera" defaultValue={options.ktbDateEra ?? "CE"} className={input}>
                    <option value="CE">{t("eraCe")}</option>
                    <option value="BE">{t("eraBe")}</option>
                  </select>
                </label>
                <label className={label}>
                  {t("ktbBranch")}
                  <select name="bbranch" defaultValue={options.ktbReceivingBranch ?? "SPACES"} className={input}>
                    <option value="SPACES">{t("branchSpaces")}</option>
                    <option value="ZEROS">{t("branchZeros")}</option>
                  </select>
                </label>
              </div>
            ) : null}
            <div>
              <button type="submit" className={ghost}>
                {t("previewBtn")}
              </button>
            </div>
          </form>
          {fixed ? (
            <div role="note" className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm" data-testid="hr-bank-untested">
              <span className={warnChip}>{t("untested")}</span>
              <span>{tx.untestedLong}</span>
            </div>
          ) : null}
          {preview && !preview.ok ? (
            <p role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
              {refusalFor(tx, preview)}
            </p>
          ) : null}
          {preview && preview.ok ? (
            <>
              <div className="flex flex-col gap-1 rounded-2xl bg-[color:var(--color-ink)] p-4 text-[color:var(--color-surface)]" data-testid="hr-bank-tile">
                <span className="text-2xl font-semibold">{t("tile", { n: preview.itemCount, amount: baht(preview.totalSatang) })}</span>
                <span className="text-sm">{t("tileOf", { amount: baht(preview.runNetSatang) })}</span>
              </div>
              <details className="rounded-xl border border-[color:var(--color-line)] p-3">
                <summary className="min-h-[44px] cursor-pointer text-sm font-semibold">{t("rows")}</summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {preview.rows.map((r) => (
                    <li key={r.employeeId + r.seq} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {r.seq}. {r.name} · {r.bankCode ?? "—"} {r.accountMasked}
                      </span>
                      <span>฿{baht(r.amountSatang)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : null}
          {ni && ni.length ? (
            <div className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] p-3" data-testid="hr-bank-excluded">
              <span className="text-sm font-semibold">{t("excluded", { n: ni.length })}</span>
              <span className={muted}>{t("excludedHint")}</span>
              <ul className="flex flex-col gap-1 text-sm">
                {ni.map((x) => (
                  <li key={x.employeeId} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {x.name || "—"} · {tx.reasons[x.cause as keyof BankTexts["reasons"]] ?? x.cause}
                    </span>
                    <span>฿{baht(x.netSatang)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview && preview.ok && preview.warnings.length ? (
            <div className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] p-3" data-testid="hr-bank-warn">
              <span className="text-sm font-semibold">{t("warnings")}</span>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.warnings.map((w, i) => (
                  <li key={`${w.employeeId ?? "-"}-${w.warning}-${i}`}>
                    {w.name ?? t("allRows")} · {tx.warnings[w.warning as keyof BankTexts["warnings"]] ?? w.warning}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview && preview.ok ? (
            <form action={generateBankFileAction} className="flex flex-col gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="format" value={pick.format} />
              <input type="hidden" name="pick" value={pickValue} />
              {pick.presetId ? <input type="hidden" name="presetId" value={pick.presetId} /> : null}
              {Object.entries(options).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              {fixed ? (
                <label className={check}>
                  <input type="checkbox" name="ack" required className="h-5 w-5" data-testid="hr-bank-ack" />
                  {t("ack")}
                </label>
              ) : null}
              <div>
                <button type="submit" className={btn} data-testid="hr-bank-generate">
                  {t("generate")}
                </button>
              </div>
              <p className={muted}>{t("notPaid")}</p>
            </form>
          ) : null}
          <div className="flex flex-col gap-2" data-testid="hr-bank-files">
            <h3 className="text-sm font-semibold">{t("files")}</h3>
            {files && files.ok && files.items.length ? (
              <ul className="flex flex-col gap-2">
                {files.items.map((f) => (
                  <li
                    key={f.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm ${f.id === justMade ? "border-2 border-[color:var(--color-accent)]" : "border-[color:var(--color-line)]"}`}
                    data-testid={`hr-bank-file-${f.id}`}
                    aria-current={f.id === justMade ? "true" : undefined}
                  >
                    {f.id === justMade ? <span className="w-full text-sm font-semibold">{t("justMade")}</span> : null}
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {f.fileName} {f.format === "KBANK_PCT" || f.format === "KTB_IPAY" ? <span className={warnChip}>{t("untested")}</span> : null}
                      </span>
                      <span className={muted}>{t("fileMeta", { n: f.itemCount, amount: baht(f.totalSatang), x: f.excludedCount, who: f.createdByName ?? t("someone") })}</span>
                      <span className={muted}>{t("fileWhen", { at: bkkTime(f.createdAt), until: bkkTime(f.expiresAt), d: f.downloads })}</span>
                    </span>
                    {new Date(f.expiresAt).getTime() > nowMs ? (
                      <a href={`/app/sys/${systemId}/hr/payroll/bank-file/${encodeURIComponent(f.id)}`} className={f.id === justMade ? btn : ghost} data-testid={`hr-bank-dl-${f.id}`} download>
                        {t("download")}
                      </a>
                    ) : (
                      <span className={muted}>{tx.expired}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={muted}>{t("noFiles")}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const FIELD_LABEL: Record<(typeof GENERIC_FIELDS)[number], string> = {
  seq: "fSeq",
  employeeCode: "fEmployeeCode",
  employeeName: "fEmployeeName",
  payeeName: "fPayeeName",
  bankName: "fBankName",
  bankCode: "fBankCode",
  accountNo: "fAccountNo",
  amount: "fAmount",
  effectiveDate: "fEffectiveDate",
  paymentRef: "fPaymentRef",
  blank: "fBlank",
};
const PRESET_ROWS = 10;
type Handler = ((fd: FormData) => Promise<void>) | null;

/** การ์ดตั้งค่า HR: บัญชีต้นทาง + รูปแบบธนาคาร (เจ้าของร้าน) · ชุดคอลัมน์ (ผู้ผ่านด่าน) — อื่น ๆ ไม่แสดง */
export async function BankSettingsCard({ systemId, onSaveProfile, onSavePreset, onDeletePreset }: { systemId: string; onSaveProfile: Handler; onSavePreset: Handler; onDeletePreset: Handler }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth);
  if (!(await canUseBankFiles(ctx, viewer))) return null;
  const t = await getTranslations("hr.bank");
  const tx = bankTextFor(await getLocale());
  const [prof, presets] = await Promise.all([getBankProfile(ctx, viewer), listBankPresets(ctx, viewer)]);
  const owner = auth.active.role === "OWNER" && !!onSaveProfile;
  const p = prof.ok ? prof.profile : null;
  return (
    <section className={card} id="hr-bank-settings" aria-labelledby="hr-bank-settings-title">
      <h2 id="hr-bank-settings-title" className="text-lg font-semibold">
        {t("profileTitle")}
      </h2>
      <p className={muted}>{t("profileDesc")}</p>
      <p role="note" className="rounded-xl border border-[color:var(--color-line)] p-3 text-sm">
        {tx.legal}
      </p>
      {owner ? (
        <form action={onSaveProfile!} className="flex flex-col gap-2" data-testid="hr-bank-profile">
          <input type="hidden" name="systemId" value={systemId} />
          <label className={label}>
            {t("debitBank")}
            <select name="debitBankCode" defaultValue={p?.debitBankCode ?? "004"} className={input}>
              {(["002", "004", "006", "014"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`bank${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("debitAccount")}
            <input name="debitAccountNo" inputMode="numeric" autoComplete="off" defaultValue={p?.debitAccountNo ?? ""} className={input} />
          </label>
          {p ? <span className={muted}>{t("debitAccountNow", { masked: p.debitAccountMasked })}</span> : null}
          <label className={label}>
            {t("debitBranch")}
            <input name="debitBranchCode" inputMode="numeric" maxLength={4} defaultValue={p?.debitBranchCode ?? ""} className={input} />
          </label>
          <label className={label}>
            {t("companyNameEn")}
            <input name="companyNameEn" maxLength={50} defaultValue={p?.companyNameEn ?? ""} className={input} />
          </label>
          <label className={label}>
            {t("ktbCompanyId")}
            <input name="ktbCompanyId" maxLength={16} defaultValue={p?.ktbCompanyId ?? ""} className={input} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold">{t("formats")}</legend>
            {(["KBANK_PCT", "KTB_IPAY"] as const).map((f) => (
              <label key={f} className={check}>
                <input type="checkbox" name="formats" value={f} defaultChecked={!!p?.formatsEnabled.includes(f)} className="h-5 w-5" data-testid={`hr-bank-fmt-${f}`} />
                {f === "KBANK_PCT" ? t("fmtKbank") : t("fmtKtb")} <span className={warnChip}>{t("untested")}</span>
              </label>
            ))}
            <p className={muted}>{tx.untestedLong}</p>
            <label className={check}>
              <input type="checkbox" name="ackUntested" className="h-5 w-5" data-testid="hr-bank-ack-untested" />
              {t("ackUntested")}
            </label>
          </fieldset>
          <div>
            <button type="submit" className={btn} data-testid="hr-bank-profile-save">
              {t("save")}
            </button>
          </div>
        </form>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3" data-testid="hr-bank-presets">
        <h3 className="text-sm font-semibold">{t("presetsTitle")}</h3>
        <p className={muted}>{t("presetsDesc")}</p>
        {presets.ok && presets.items.length ? (
          <ul className="flex flex-col gap-2">
            {presets.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--color-line)] p-3 text-sm">
                <span>
                  {x.name} · {x.kind === "CSV" ? t("kindCsv") : t("kindXlsx")} · {t("presetCols", { n: x.columns.length })}
                </span>
                {onDeletePreset ? (
                  <form action={onDeletePreset}>
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="id" value={x.id} />
                    <button type="submit" className={ghost} data-testid={`hr-bank-preset-del-${x.id}`}>
                      {t("presetDelete")}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>{t("noPresets")}</p>
        )}
        {onSavePreset ? (
          <form action={onSavePreset} className="flex flex-col gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <div className="flex flex-wrap gap-3">
              <label className={label}>
                {t("presetName")}
                <input name="name" maxLength={60} required className={input} />
              </label>
              <label className={label}>
                {t("presetKind")}
                <select name="kind" defaultValue="CSV" className={input}>
                  <option value="CSV">{t("kindCsv")}</option>
                  <option value="XLSX">{t("kindXlsx")}</option>
                </select>
              </label>
            </div>
            <ol className="flex flex-col gap-2">
              {Array.from({ length: PRESET_ROWS }, (_, i) => (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  <label className={label}>
                    {t("colN", { n: i + 1 })}
                    <select name={`f${i}`} defaultValue="" className={input}>
                      <option value="">{t("fNone")}</option>
                      {GENERIC_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {t(FIELD_LABEL[f])}
                        </option>
                      ))}
                      <option value="const">{t("fConst")}</option>
                    </select>
                  </label>
                  <label className={label}>
                    {t("colHeader")}
                    <input name={`h${i}`} maxLength={60} className={input} />
                  </label>
                  <label className={label}>
                    {t("colConst")}
                    <input name={`c${i}`} maxLength={40} className={input} />
                  </label>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-x-4">
              <label className={check}>
                <input type="checkbox" name="includeHeader" defaultChecked className="h-5 w-5" />
                {t("includeHeader")}
              </label>
              <label className={check}>
                <input type="checkbox" name="includeSummary" className="h-5 w-5" />
                {t("includeSummary")}
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className={label}>
                {t("amountStyle")}
                <select name="amountStyle" defaultValue="BAHT_2DP" className={input}>
                  <option value="BAHT_2DP">{t("amtBaht")}</option>
                  <option value="SATANG">{t("amtSatang")}</option>
                </select>
              </label>
              <label className={label}>
                {t("dateStyle")}
                <select name="dateStyle" defaultValue="ISO_CE" className={input}>
                  <option value="ISO_CE">{t("dateIso")}</option>
                  <option value="DMY_CE">{t("dateDmyCe")}</option>
                  <option value="DMY_BE">{t("dateDmyBe")}</option>
                </select>
              </label>
              <label className={label}>
                {t("csvEncoding")}
                <select name="encoding" defaultValue="UTF8_BOM" className={input}>
                  <option value="UTF8_BOM">{t("encUtf8")}</option>
                  <option value="TIS620">{t("encTis620")}</option>
                </select>
              </label>
            </div>
            <div>
              <button type="submit" className={btn} data-testid="hr-bank-preset-save">
                {t("presetSave")}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
