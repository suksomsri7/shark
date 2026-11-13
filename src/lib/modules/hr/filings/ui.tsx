// HR H3.6 ▸ หน้าจอแบบยื่นภาษี/ประกันสังคม (brief R15 · §6 ขั้น "ยื่นภาษี/ประกันสังคม" ของหน้ารอบจ่าย ภาพ 06)
//   server component ล้วน (ไม่มี "use client") — ข้อมูลที่ถึงเบราว์เซอร์มาจาก DTO ของ service เท่านั้น (เลขประจำตัวแบบ •••4 ตัวท้าย) ·
//   FilingSection (หน้าเงินเดือน) = ผู้ผ่านด่านแบบยื่นเท่านั้น อื่น ๆ ไม่แสดงอะไรเลย · FilingSettingsCard (หน้าตั้งค่า) = แก้ได้เฉพาะเจ้าของร้าน ·
//   MyTaxCertCard (หน้า "เงินเดือน" ของฉัน) = ใบของตัวเองที่ยังไม่ยกเลิก ·
//   ป้าย untestedSso / wageU / pdfNote + กำหนดยื่น แสดงเป็นคำเตือน ไม่บล็อก · ผลการกดอ่านจาก ?fmsg= ผ่านรายการคงที่ (allowlist) ◂
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "../privacy";
import { selfActorOf } from "../self";
import { FIELD_LABEL, filingTextFor, type FilingLang, type FilingTextKey } from "./texts";
import { generateFilingAction, issueTaxCertAction, issueTaxCertsBulkAction, saveFilingPersonAction, saveFilingProfileAction, voidTaxCertAction } from "./actions";
import {
  canUseFilings,
  getFilingPerson,
  getFilingProfile,
  listCertCandidates,
  listFilingEmployees,
  listFilingFiles,
  listFilingRuns,
  listMyTaxCertificates,
  listTaxCertificates,
  previewFiling,
  type FilingRequest,
} from "./service";

const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const box = "flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const warnBox = "flex flex-col gap-1 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm";
const input = "min-h-[44px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const label = "flex flex-col gap-1 text-sm";
const check = "inline-flex min-h-[44px] items-center gap-2 text-sm";
/** สตางค์ → "1,234.56" */
const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ISO → "YYYY-MM-DD HH:mm" เวลาไทย */
const bkkTime = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** camelCase → kebab (testid) */
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
type Lang = FilingLang;
const langOf = (locale: string): Lang => (locale === "en" ? "en" : "th");
const fieldsText = (fields: string[], lang: Lang) =>
  fields
    .map((f) => {
      const m = /^(.*?)(:char|:long)?$/.exec(f)!;
      const L = FIELD_LABEL[lang] as Record<string, string>;
      return m[2] ? `${L[m[1]!] ?? m[1]} ${L[m[2]]}` : (L[m[1]!] ?? m[1]!);
    })
    .join(", ");

/** รหัสผลบน URL → ข้อความ (allowlist) */
const MSG_KEY: Record<string, FilingTextKey> = {
  NO: "no", PROFILE_OWNER: "profileOwner", PROFILE: "profile", PERSON: "person", OPTIONS: "options", STATUS: "status", NOT_FINAL: "notFinal", RUN_DATA: "runData", EMPTY: "empty",
  CERT_EXISTS: "certExists", CERT_NONE: "certNone", CERT_INCOMPLETE: "certIncomplete", CERT_NOT_LEFT: "certNotLeft", CERT_TOO_EARLY: "certTooEarly", VOID_OWNER: "certVoidOwner", VOID_REASON: "voidReason", VOIDED: "voided", CHANGED: "changed",
};
export type FilingParams = { fstop?: string; fk?: string; fp?: string; frun?: string; fmsg?: string; fflds?: string; fdoc?: string; fbi?: string; fbs?: string; ffile?: string; ty?: string; fperson?: string };
async function flashOf(sp: FilingParams): Promise<{ text: string; ok: boolean } | null> {
  const t = await getTranslations("hr.filing");
  const lang = langOf(await getLocale());
  const tx = filingTextFor(lang);
  const code = sp.fmsg ?? "";
  if (code === "saved" || code === "issued" || code === "voided" || code === "made") return { text: t(`done_${code}`), ok: true };
  // fix r1 F4: ออกทั้งปีแล้วหยุดกลางทาง — แสดงจำนวนที่ออกไปแล้ว + เหตุที่หยุด (ไม่ใช่ "ไม่สำเร็จ" เปล่า)
  if (code === "bulk" && MSG_KEY[sp.fstop ?? ""]) return { text: t("stopped", { issued: Number(/^\d{1,4}$/.test(sp.fbi ?? "") ? sp.fbi : 0), skipped: Number(/^\d{1,4}$/.test(sp.fbs ?? "") ? sp.fbs : 0), reason: tx[MSG_KEY[sp.fstop!]!].replace("{fields}", "").replace("{docNo}", "").replace("{runs}", "") }), ok: false };
  if (code === "bulk") return { text: t("done_bulk", { issued: Number(/^\d{1,4}$/.test(sp.fbi ?? "") ? sp.fbi : 0), skipped: Number(/^\d{1,4}$/.test(sp.fbs ?? "") ? sp.fbs : 0) }), ok: true };
  const key = MSG_KEY[code];
  if (!key) return null;
  const known = Object.keys(FIELD_LABEL.th);
  const fields = (sp.fflds ?? "").split(",").filter((f) => known.includes(f.replace(/:(char|long)$/, "")));
  const doc = /^[A-Z0-9]{1,8}-\d{4}-\d{4,}$/.test(sp.fdoc ?? "") ? sp.fdoc! : "";
  return { text: tx[key].replace("{fields}", () => fieldsText(fields, lang)).replace("{docNo}", () => doc).replace("{runs}", () => ""), ok: false };
}
function Flash({ f }: { f: { text: string; ok: boolean } | null }) {
  if (!f) return null;
  return (
    <p role={f.ok ? "status" : "alert"} className={f.ok ? box : warnBox}>
      {f.text}
    </p>
  );
}

/** ส่วนแบบยื่นบนหน้าเงินเดือน — ผู้ไม่ผ่านด่านไม่เห็นอะไรเลย (คืน null) */
export async function FilingSection({ systemId, sp }: { systemId: string; sp: FilingParams }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth);
  if (!(await canUseFilings(ctx, viewer))) return null;
  const t = await getTranslations("hr.filing");
  const lang = langOf(await getLocale());
  const tx = filingTextFor(lang);
  const owner = auth.active.role === "OWNER";
  const thisYear = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));
  const kind = sp.fk === "PND1A" || sp.fk === "SSO110" ? sp.fk : "PND1";
  const runs = await listFilingRuns(ctx, viewer);
  const runItems = runs.ok ? runs.items : [];
  const frun = kind === "SSO110" && ID_RE.test(sp.frun ?? "") && runItems.some((r) => r.id === sp.frun) ? sp.frun! : "";
  const fp = kind === "PND1" ? (/^\d{4}-(0[1-9]|1[0-2])$/.test(sp.fp ?? "") ? sp.fp! : "") : kind === "PND1A" ? (/^\d{4}$/.test(sp.fp ?? "") ? sp.fp! : "") : "";
  const ty = /^\d{4}$/.test(sp.ty ?? "") ? Number(sp.ty) : thisYear - 1;
  const req: FilingRequest | null = kind === "SSO110" ? (frun ? { kind, runId: frun } : null) : fp ? { kind, period: fp } : null;
  const [preview, files, certs, cands, emps, flash] = await Promise.all([
    req ? previewFiling(ctx, viewer, req) : Promise.resolve(null),
    listFilingFiles(ctx, viewer, {}),
    listTaxCertificates(ctx, viewer, { taxYear: ty }),
    listCertCandidates(ctx, viewer, { taxYear: ty }),
    listFilingEmployees(ctx, viewer),
    flashOf(sp),
  ]);
  const justMade = ID_RE.test(sp.ffile ?? "") ? sp.ffile! : "";
  const nowMs = Date.now();
  const base = `/app/sys/${systemId}/hr/payroll`;
  const keepQ = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(kind ? { fk: kind } : {}), ...(fp ? { fp } : {}), ...(frun ? { frun } : {}), ty: String(ty), ...extra });
    return `${base}?${q.toString()}#hr-filing`;
  };
  const hidden = (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="fk" value={kind} />
      {fp ? <input type="hidden" name="fp" value={fp} /> : null}
      {frun ? <input type="hidden" name="frun" value={frun} /> : null}
      <input type="hidden" name="ty" value={String(ty)} />
    </>
  );
  const warnText = (w: { warning: string; fields: string[] }) =>
    w.warning === "NOT_FINAL" ? `${tx.notFinal} (${w.fields.join(", ")})` : w.warning === "NOT_PAID" ? tx.notPaid : w.warning === "V1_RUN" ? tx.v1Note : w.warning === "SLASH_DASH" ? tx.slashNote : w.warning === "CERT_SEQ" ? t("warnCertSeq") : w.warning === "NAME_CUT" ? t("warnNameCut", { fields: fieldsText(w.fields, lang) }) : w.warning;
  const person = ID_RE.test(sp.fperson ?? "") && emps.ok && emps.items.some((e) => e.employeeId === sp.fperson) ? sp.fperson! : "";
  const pRow = person ? await getFilingPerson(ctx, viewer, { employeeId: person }) : null;
  const pv = pRow && pRow.ok ? pRow.person : null;

  return (
    <section className={card} id="hr-filing" aria-labelledby="hr-filing-title">
      <h2 id="hr-filing-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className={muted}>{t("desc")}</p>
      <Flash f={flash} />
      <ul className={`${muted} flex list-disc flex-col gap-1 pl-5`}>
        <li>{tx.pnd1Due}</li>
        <li>{tx.pnd1aDue}</li>
        <li>{tx.ssoDue}</li>
        <li>{tx.certDue}</li>
      </ul>

      {/* ── เลือกแบบ ── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("kind")}>
        <Link href={`${base}?fk=PND1#hr-filing`} className={kind === "PND1" ? btn : ghost} aria-current={kind === "PND1" ? "true" : undefined} data-testid="hr-filing-pnd1">
          {t("pnd1")}
        </Link>
        <Link href={`${base}?fk=PND1A#hr-filing`} className={kind === "PND1A" ? btn : ghost} aria-current={kind === "PND1A" ? "true" : undefined} data-testid="hr-filing-pnd1a">
          {t("pnd1a")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={muted}>{t("sso")}</span>
        {runItems.length === 0 ? <span className={muted}>{t("noRuns")}</span> : null}
        {runItems.map((r) => (
          <Link key={r.id} href={`${base}?fk=SSO110&frun=${encodeURIComponent(r.id)}#hr-filing`} className={frun === r.id ? btn : ghost} data-testid={`hr-filing-sso-${r.id}`}>
            {r.periodKey}
          </Link>
        ))}
      </div>
      {kind !== "SSO110" ? (
        <form method="get" action={`${base}#hr-filing`} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="fk" value={kind} />
          <label className={label}>
            {kind === "PND1" ? t("month") : t("year")}
            <input name="fp" defaultValue={fp} placeholder={kind === "PND1" ? "2026-11" : "2026"} pattern={kind === "PND1" ? "\\d{4}-\\d{2}" : "\\d{4}"} className={input} data-testid="hr-filing-period" />
          </label>
          <button type="submit" className={ghost} data-testid="hr-filing-show">
            {t("show")}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          <p className={chip} data-testid="hr-filing-untested">
            {tx.untestedSso}
          </p>
          <p className={muted}>{tx.wageU}</p>
        </div>
      )}

      {/* ── ตัวอย่าง ── */}
      {kind !== "SSO110" ? (
        <p className={chip} data-testid="hr-filing-untested-rd">
          {t("untestedRd")}
        </p>
      ) : null}
      {preview && !preview.ok ? <p role="alert" className={warnBox}>{preview.code === "NO" ? tx.no : preview.reason}</p> : null}
      {preview && preview.ok ? (
        <div className="flex flex-col gap-3">
          <div className={box} data-testid="hr-filing-tile">
            <span className="text-sm font-semibold">{t("tile", { kind: t(`kind_${preview.kind}`), period: preview.period })}</span>
            <span className="text-sm">{t("tileLine", { n: preview.lineCount, amount: baht(preview.totalSatang), tax: baht(preview.taxSatang) })}</span>
            <span className={muted}>{preview.kind === "SSO110" ? t("tileSsoNote") : t("tileTaxNote")}</span>
          </div>
          {preview.warnings.length ? (
            <ul className={warnBox} data-testid="hr-filing-warn">
              {preview.warnings.map((w, i) => (
                <li key={`${w.warning}-${w.employeeId ?? ""}-${i}`}>
                  {w.name ? `${w.name}: ` : ""}
                  {warnText(w)}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.notIncluded.length ? (
            <div className={box} data-testid="hr-filing-excluded">
              <span className="text-sm font-semibold">{t("excluded", { n: preview.notIncluded.length })}</span>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.notIncluded.map((x, i) => (
                  <li key={`${x.employeeId}-${i}`}>
                    {x.name} · {t(`cause_${x.cause}`)}
                    {x.fields.length ? ` — ${fieldsText(x.fields, lang)}` : ""}
                    {preview.kind === "SSO110" && x.taxSatang > 0 ? ` · ${t("contribTotal", { amount: baht(x.taxSatang) })}` : ""}
                  </li>
                ))}
              </ul>
              {preview.notIncluded.some((x) => x.cause === "ZERO_INCOME") ? <p className={muted}>{tx.zeroRule}</p> : null}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1 text-sm">
            {preview.rows.slice(0, 50).map((r) => (
              <li key={`${r.seq}`} className="flex flex-wrap justify-between gap-2">
                <span>
                  {r.seq}. {r.name} <span className={muted}>{r.pinMasked}</span>
                </span>
                <span className="tabular-nums">
                  {baht(r.amountSatang)} / {baht(r.taxSatang)}
                </span>
              </li>
            ))}
          </ul>
          <form action={generateFilingAction} className="flex flex-col gap-2">
            {hidden}
            {preview.kind === "SSO110" ? (
              <div className="flex flex-wrap gap-2">
                <label className={label}>
                  {t("encoding")}
                  <select name="encoding" defaultValue="" className={input} data-testid="hr-filing-opt-encoding">
                    <option value="">{t("asProfile")}</option>
                    <option value="TIS620">TIS-620</option>
                    <option value="UTF8">UTF-8</option>
                  </select>
                </label>
                <label className={label}>
                  {t("wageMode")}
                  <select name="wageMode" defaultValue="" className={input} data-testid="hr-filing-opt-wage">
                    <option value="">{t("asProfile")}</option>
                    <option value="CLAMPED">{t("wageClamped")}</option>
                    <option value="ACTUAL">{t("wageActual")}</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <label className={label}>
                  {t("slashMode")}
                  <select name="slashMode" defaultValue="" className={input} data-testid="hr-filing-opt-slash">
                    <option value="">{t("asProfile")}</option>
                    <option value="DASH">{t("slashDash")}</option>
                    <option value="EXCLUDE">{t("slashExclude")}</option>
                  </select>
                </label>
              </div>
            )}
            <button type="submit" className={btn} data-testid="hr-filing-generate">
              {t("generate")}
            </button>
          </form>
        </div>
      ) : null}

      {/* ── ไฟล์ที่สร้าง (7 วัน) ── */}
      <h3 className="text-sm font-semibold">{t("files")}</h3>
      <ul className="flex flex-col gap-2" data-testid="hr-filing-files">
        {files.ok && files.items.length === 0 ? <li className={muted}>{t("noFiles")}</li> : null}
        {(files.ok ? files.items : []).map((f) => {
          const live = new Date(f.expiresAt).getTime() > nowMs;
          return (
            <li key={f.id} className={`${box} ${f.id === justMade ? "border-[color:var(--color-primary)]" : ""}`}>
              <span className="text-sm">
                {t(`kind_${f.kind}`)} · {f.period} · {t("fileLine", { n: f.lineCount, amount: baht(f.totalSatang), excluded: f.excludedCount })}
              </span>
              <span className={muted}>
                {t("fileMeta", { when: bkkTime(f.createdAt), by: f.createdByName ?? "-", downloads: f.downloads })} · {live ? t("expires", { when: bkkTime(f.expiresAt) }) : t("expired")}
              </span>
              {live ? (
                <a href={`${base}/filing/${encodeURIComponent(f.id)}`} download className={f.id === justMade ? btn : ghost} data-testid={`hr-filing-dl-${f.id}`}>
                  {t("download")} {f.fileName}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* ── หนังสือรับรอง 50 ทวิ ── */}
      <h3 className="text-sm font-semibold">{t("certs")}</h3>
      <p className={muted} data-testid="hr-taxcert-pdfnote">
        {tx.pdfNote}
      </p>
      <form method="get" action={`${base}#hr-filing`} className="flex flex-wrap items-end gap-2">
        <label className={label}>
          {t("taxYear")}
          <input name="ty" defaultValue={String(ty)} pattern="\d{4}" className={input} data-testid="hr-taxcert-year" />
        </label>
        <button type="submit" className={ghost} data-testid="hr-taxcert-show">
          {t("show")}
        </button>
      </form>
      <form action={issueTaxCertsBulkAction}>
        {hidden}
        <button type="submit" className={btn} data-testid="hr-taxcert-bulk">
          {t("bulk", { year: ty + 543 })}
        </button>
      </form>
      <ul className="flex flex-col gap-2" data-testid="hr-taxcert-list">
        {certs.ok && certs.items.length === 0 ? <li className={muted}>{t("noCerts")}</li> : null}
        {(certs.ok ? certs.items : []).map((c) => (
          <li key={c.id} className={box}>
            <span className="text-sm">
              {c.docNo} · {c.name} · {t(`certKind_${c.kind}`)} · {t("formSeq", { n: c.formSeq })}
              {c.voided ? <span className={`${chip} ml-2`}>{t("voidedChip")}</span> : null}
              {c.stale ? <span className={`${chip} ml-2`}>{t("staleChip")}</span> : null}
            </span>
            {!c.voided ? (
              <div className="flex flex-wrap gap-2">
                <a href={`${base}/tax-cert/${encodeURIComponent(c.id)}`} download className={ghost} data-testid={`hr-taxcert-dl-${c.id}`}>
                  {t("downloadPdf")}
                </a>
                {owner ? (
                  <form action={voidTaxCertAction} className="flex flex-wrap items-end gap-2">
                    {hidden}
                    <input type="hidden" name="certId" value={c.id} />
                    <label className={label}>
                      {t("voidReason")}
                      <input name="reason" required maxLength={200} className={input} data-testid={`hr-taxcert-reason-${c.id}`} />
                    </label>
                    <button type="submit" className={ghost} data-testid={`hr-taxcert-void-${c.id}`}>
                      {t("void")}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {cands.ok && cands.items.some((x) => !x.certified) ? (
        <ul className="flex flex-col gap-2">
          {cands.items
            .filter((x) => !x.certified)
            .map((x) => (
              <li key={x.employeeId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{x.name}</span>
                <form action={issueTaxCertAction} className="flex flex-wrap gap-2">
                  {hidden}
                  <input type="hidden" name="employeeId" value={x.employeeId} />
                  <input type="hidden" name="kind" value={x.leaver ? "LEAVER" : "ANNUAL"} />
                  <button type="submit" className={ghost} data-testid={`hr-taxcert-issue-${x.employeeId}`}>
                    {x.leaver ? t("issueLeaver") : t("issue")}
                  </button>
                </form>
              </li>
            ))}
        </ul>
      ) : null}

      {/* ── ข้อมูลยื่นของพนักงาน (ชื่อ/คำนำหน้า/ที่อยู่แยกช่อง) ── */}
      <h3 className="text-sm font-semibold">{t("persons")}</h3>
      <p className={muted}>{t("personsDesc")}</p>
      <div className="flex flex-wrap gap-2">
        {(emps.ok ? emps.items : []).map((e) => (
          <Link key={e.employeeId} href={keepQ({ fperson: e.employeeId })} className={person === e.employeeId ? btn : ghost} data-testid={`hr-filing-person-${e.employeeId}`}>
            {e.code ? `${e.code} ` : ""}
            {e.name}
          </Link>
        ))}
      </div>
      {person ? (
        <form action={saveFilingPersonAction} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {hidden}
          <input type="hidden" name="fperson" value={person} />
          <input type="hidden" name="employeeId" value={person} />
          {(["title", "firstName", "lastName", "ssoPrefix", "building", "room", "floor", "village", "houseNo", "moo", "soi", "street"] as const).map((k) => (
            <label key={k} className={label}>
              {(FIELD_LABEL[lang] as Record<string, string>)[k === "title" || k === "firstName" || k === "lastName" || k === "ssoPrefix" ? k : `address.${k}`]}
              <input name={k} defaultValue={pv?.[k] ?? ""} className={input} data-testid={`hr-filing-person-f-${kebab(k)}`} />
            </label>
          ))}
          <button type="submit" className={btn} data-testid="hr-filing-person-save">
            {t("save")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

/** การ์ดข้อมูลผู้จ่ายเงิน (หน้าตั้งค่า) — ผู้ผ่านด่านเห็น · แก้ได้เฉพาะเจ้าของร้าน */
export async function FilingSettingsCard({ systemId, msg }: { systemId: string; msg?: FilingParams }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const viewer = hrViewerOf(auth);
  if (!(await canUseFilings(ctx, viewer))) return null;
  const t = await getTranslations("hr.filing");
  const lang = langOf(await getLocale());
  const tx = filingTextFor(lang);
  const prof = await getFilingProfile(ctx, viewer);
  const p = prof.ok ? prof.profile : null;
  const owner = auth.active.role === "OWNER";
  const flash = msg ? await flashOf(msg) : null;
  const L = FIELD_LABEL[lang] as Record<string, string>;
  const text = (k: string, v: string | null | undefined, extra: Record<string, string | number> = {}) => (
    <label key={k} className={label}>
      {L[k] ?? k}
      <input name={k} defaultValue={v ?? ""} disabled={!owner} className={input} data-testid={`hr-filing-profile-f-${kebab(k)}`} {...extra} />
    </label>
  );
  return (
    <section className={card} id="hr-filing-profile" aria-labelledby="hr-filing-profile-title" data-testid="hr-filing-profile">
      <h2 id="hr-filing-profile-title" className="text-lg font-semibold">
        {t("profileTitle")}
      </h2>
      <p className={muted}>{t("profileDesc")}</p>
      <Flash f={flash} />
      {!owner ? <p className={muted}>{tx.profileOwner}</p> : null}
      <form action={saveFilingProfileAction} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input type="hidden" name="systemId" value={systemId} />
        {text("taxId", p?.taxId, { inputMode: "numeric", maxLength: 13 })}
        {text("branchNo", p?.branchNo ?? "000000", { inputMode: "numeric", maxLength: 6 })}
        {text("employerName", p?.employerName, { maxLength: 100 })}
        {text("employerAddress", p?.employerAddress, { maxLength: 300 })}
        {text("deptName", p?.deptName ?? "สำนักงานใหญ่", { maxLength: 80 })}
        {text("rdUserId", p?.rdUserId, { maxLength: 20 })}
        {text("ssoAccountNo", p?.ssoAccountNo, { inputMode: "numeric", maxLength: 10 })}
        {text("ssoBranchNo", p?.ssoBranchNo ?? "000000", { inputMode: "numeric", maxLength: 6 })}
        {text("signerName", p?.signerName, { maxLength: 100 })}
        {text("certPrefix", p?.certPrefix ?? "HR50", { maxLength: 8 })}
        <label className={label}>
          {L.formFlag}
          <select name="rdFormFlag" defaultValue={String(p?.rdFormFlag ?? 2)} disabled={!owner} className={input} data-testid="hr-filing-profile-formflag">
            <option value="1">{t("formFlag1")}</option>
            <option value="2">{t("formFlag2")}</option>
          </select>
          <span className={muted}>{t("formFlagHint")}</span>
        </label>
        <label className={label}>
          {L.slashMode}
          <select name="rdSlashMode" defaultValue={p?.rdSlashMode ?? "DASH"} disabled={!owner} className={input} data-testid="hr-filing-profile-slashmode">
            <option value="DASH">{t("slashDash")}</option>
            <option value="EXCLUDE">{t("slashExclude")}</option>
          </select>
        </label>
        <label className={label}>
          {L.encoding}
          <select name="ssoEncoding" defaultValue={p?.ssoEncoding ?? "TIS620"} disabled={!owner} className={input} data-testid="hr-filing-profile-encoding">
            <option value="TIS620">TIS-620</option>
            <option value="UTF8">UTF-8</option>
          </select>
        </label>
        <label className={label}>
          {L.wageMode}
          <select name="ssoWageMode" defaultValue={p?.ssoWageMode ?? "CLAMPED"} disabled={!owner} className={input} data-testid="hr-filing-profile-wagemode">
            <option value="CLAMPED">{t("wageClamped")}</option>
            <option value="ACTUAL">{t("wageActual")}</option>
          </select>
        </label>
        <label className={label}>
          {t("branchType")}
          <select name="branchType" defaultValue={p?.branchType ?? ""} disabled={!owner} className={input} data-testid="hr-filing-profile-branchtype">
            <option value="">{t("branchTypeNone")}</option>
            <option value="V">V</option>
            <option value="S">S</option>
          </select>
        </label>
        <label className={check}>
          <input type="checkbox" name="lto" defaultChecked={!!p?.lto} disabled={!owner} data-testid="hr-filing-profile-lto" />
          {t("lto")}
        </label>
        <p className={`${muted} sm:col-span-2`}>{tx.wageU}</p>
        <p className={`${muted} sm:col-span-2`}>{tx.slashNote}</p>
        {owner ? (
          <button type="submit" className={btn} data-testid="hr-filing-profile-save">
            {t("save")}
          </button>
        ) : null}
      </form>
    </section>
  );
}

/** หนังสือรับรองของฉัน (หน้า "เงินเดือน" ของพนักงาน) — ใบที่ยังไม่ยกเลิกของตัวเองเท่านั้น */
export async function MyTaxCertCard() {
  const auth = await requireTenant();
  const r = await listMyTaxCertificates(selfActorOf(auth));
  if (!r.ok) return null;
  const t = await getTranslations("hr.filing");
  const tx = filingTextFor(langOf(await getLocale()));
  return (
    <section className={card} data-testid="hr-mytaxcert" aria-labelledby="hr-mytaxcert-title">
      <h2 id="hr-mytaxcert-title" className="text-lg font-semibold">
        {t("myCerts")}
      </h2>
      {r.items.length === 0 ? <p className={muted}>{t("noMyCerts")}</p> : null}
      <ul className="flex flex-col gap-2">
        {r.items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              {t("myCertLine", { year: c.taxYear + 543, docNo: c.docNo })} · {t(`certKind_${c.kind}`)}
            </span>
            <a href={`/app/me/hr/tax-cert/${encodeURIComponent(c.id)}`} download className={ghost} data-testid={`hr-mytaxcert-dl-${c.id}`}>
              {t("downloadPdf")}
            </a>
          </li>
        ))}
      </ul>
      <p className={muted}>{tx.pdfNote}</p>
    </section>
  );
}
