// EtaxTsBlocks — ACC T5.4 (เลน 2) ▸ บล็อกฝั่ง server: สถานะ e-Tax ประทับเวลาในหน้าเอกสาร · การ์ดค่าตั้งในตั้งค่า › ภาษี
//   ข้อมูลจาก etax-ts.ts (ตัวเดียวกับ REST) · ตัวควบคุมอยู่ที่ EtaxTsPanels (client)
import { formatThaiDateLong } from "@/lib/ui/date";
import { LegalWarnings } from "./LegalWarnings";
import { EtaxSendControls, EtaxSettingsForm } from "./EtaxTsPanels";
import { etaxDocState, etaxTsSettings } from "@/lib/modules/account/etax-ts";
import { getProviderExtension } from "@/lib/modules/account/etax-provider-ext";
import { previewEtaxSendAction, saveEtaxSettingsAction, sendEtaxAction, uploadStampedAction } from "@/lib/modules/account/etax-actions";
import { ETAX_TS_ELIGIBILITY_LABEL_TH, ETAX_TS_SUBJECT_DATE_LABEL_TH } from "@/lib/core/settings/legal/th-tax-2569";
import { publicCitationTh, publicNoteTh } from "@/lib/core/settings/legal/warnings"; // merge T4+T5 ◂

const TONE: Record<string, string> = { NOT_SENT: "var(--color-muted)", QUEUED: "var(--color-muted)", SENT: "var(--color-ink)", STAMPED: "var(--color-ink)", FAILED: "var(--color-danger)" };
const fmtTime = (d: Date | null) => (d ? `${formatThaiDateLong(d)} ${new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(11, 16)} น.` : "-");

export async function EtaxDocBlock({ tenantId, systemId, appId, docId, canIssue }: { tenantId: string; systemId: string; appId: string; docId: string; canIssue: boolean }) {
  const st = await etaxDocState({ tenantId, systemId }, docId);
  if (!st || !st.covered) return null;
  if (!st.settings.enabled && st.attempts.length === 0) return null;
  const fileHref = (id: string) => `/app/sys/${appId}/account/etax-file/${id}`;
  return (
    <section className="card flex max-w-4xl flex-col gap-3 p-5" data-testid="etax-block">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">e-Tax (ประทับเวลา)</h2>
        <span className="text-sm font-medium" style={{ color: TONE[st.state] }} data-testid="etax-state" data-state={st.state}>{st.stateLabel}</span>
      </div>
      {st.subjectPreview && (
        <p className="text-xs text-[color:var(--color-muted)]" data-testid="etax-subject">
          หัวเรื่องอีเมล <span className="font-mono text-[color:var(--color-ink)]">{st.subjectPreview}</span> · ผู้ส่ง {st.settings.senderEmail || "ยังไม่ได้ตั้ง"} · สำเนาถึง {st.settings.ccAddress}
          {st.settings.transport === "CAPTURE" && <> · <b>ระบบทดสอบ: ไม่ส่งอีเมลจริง</b></>}
        </p>
      )}
      <LegalWarnings warnings={st.infos} testId="etax-infos" compact />
      {st.blockedReason && <p className="text-xs text-[color:var(--color-muted)]" data-testid="etax-blocked">{st.blockedReason}</p>}
      {canIssue && (st.canSend || st.state === "STAMPED" || st.attempts.length > 0) && (
        <EtaxSendControls
          systemId={systemId}
          documentId={docId}
          defaultTo={st.buyerEmail}
          hasAttempt={st.attempts.some((a) => a.status === "SENT" || a.status === "STAMPED")}
          stamped={st.state === "STAMPED"}
          canSend={st.canSend && st.state !== "STAMPED"}
          preview={previewEtaxSendAction}
          send={sendEtaxAction}
          upload={uploadStampedAction}
        />
      )}
      {st.attempts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs" data-testid="etax-attempts">
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="py-1 pr-2">ครั้งที่</th>
                <th className="py-1 pr-2">เวลา</th>
                <th className="py-1 pr-2">ถึง / สำเนา</th>
                <th className="py-1 pr-2">ไฟล์</th>
                <th className="py-1 pr-2">ผล</th>
              </tr>
            </thead>
            <tbody>
              {st.attempts.map((a) => (
                <tr key={a.id} className="border-t align-top" data-testid={`etax-attempt-${a.attemptNo}`}>
                  <td className="py-1 pr-2">{a.attemptNo}{a.mode === "RESEND_STAMPED" ? " (ส่งไฟล์ประทับเวลาซ้ำ)" : ""}</td>
                  <td className="py-1 pr-2">{fmtTime(a.sentAt ?? a.createdAt)}</td>
                  <td className="py-1 pr-2">{a.toAddress}<br /><span className="text-[color:var(--color-muted)]">{a.ccAddress ?? "ไม่มีสำเนา"}</span></td>
                  <td className="py-1 pr-2">
                    {a.pdfFileId ? <a className="underline" href={fileHref(a.pdfFileId)} data-testid={`etax-file-sent-${a.attemptNo}`}>{a.attachmentName}</a> : a.attachmentName} · {(a.attachmentBytes / 1024).toFixed(1)} KB
                    <br /><span className="font-mono text-[color:var(--color-muted)]">SHA-256 {a.pdfSha256.slice(0, 16)}…</span>
                    {a.stampedFileId && (
                      <>
                        <br /><a className="underline" href={fileHref(a.stampedFileId)} data-testid={`etax-file-stamped-${a.attemptNo}`}>ไฟล์ประทับเวลา</a> <span className="font-mono text-[color:var(--color-muted)]">{a.stampedSha256?.slice(0, 16)}…</span>
                      </>
                    )}
                  </td>
                  <td className="py-1 pr-2" style={{ color: TONE[a.status] }}>{a.statusLabel}{a.error ? ` — ${a.error}` : ""}<br /><span className="text-[color:var(--color-muted)]">{a.transport === "CAPTURE" ? "จับไว้ในระบบทดสอบ (ไม่ได้ส่งจริง)" : a.transport}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-[color:var(--color-muted)]">{st.attempts[0]?.pdfConformance}</p>
        </div>
      )}
    </section>
  );
}

export async function EtaxSettingsCard({ tenantId, systemId }: { tenantId: string; systemId: string }) {
  const s = await etaxTsSettings({ tenantId, systemId });
  const p = getProviderExtension();
  const tableCc = String(s.rows.find((r) => r.key === "ETAX_TS_CC_ADDRESS")?.value ?? "");
  return (
    <div className="flex flex-col gap-4" data-testid="etax-settings">
      <section className="card flex flex-col gap-3 p-5" data-testid="etax-ts-card">
        <div>
          <h2 className="text-base font-semibold">e-Tax Invoice by Time Stamp (ไม่ต้องมีผู้ให้บริการ)</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            ส่งใบกำกับภาษี ใบเพิ่มหนี้ ใบลดหนี้ เป็นไฟล์ PDF ทางอีเมลถึงผู้ซื้อพร้อมสำเนาถึงระบบประทับรับรองเวลาของกรมสรรพากร · ต้องยื่นแบบ ก.อ.01 ได้รับประกาศรายชื่อ และแจ้งอีเมลที่ใช้ส่งก่อน · ไม่ใช้กับใบเสร็จรับเงิน
            {s.transport === "CAPTURE" && " · ระบบนี้เป็นระบบทดสอบ: อีเมลถูกจับไว้ ไม่ได้ส่งจริง"}
            {s.transport === "NONE" && " · ยังไม่มีช่องทางส่งในนามอีเมลของร้าน — ส่งได้ด้วยโปรแกรมอีเมลของร้านเอง (ดาวน์โหลดไฟล์ + หัวเรื่องที่ระบบแสดง)"}
          </p>
        </div>
        <EtaxSettingsForm
          systemId={systemId}
          initial={{ enabled: s.enabled, autoOnIssue: s.autoOnIssue, senderEmail: s.senderEmail, ccAddress: s.ccAddress, ccSource: s.ccSource, subjectDateFormat: s.subjectDateFormat, eligibility: s.eligibility }}
          tableCc={tableCc}
          labels={{ formats: ETAX_TS_SUBJECT_DATE_LABEL_TH, eligibility: ETAX_TS_ELIGIBILITY_LABEL_TH }}
          save={saveEtaxSettingsAction}
        />
        <LegalWarnings warnings={s.warnings} testId="etax-settings-current-warnings" compact />
        <details className="text-xs" data-testid="etax-legal-rows">
          <summary className="cursor-pointer font-medium">ค่าของระบบประทับเวลา (ตารางค่ากฎหมาย)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="text-left text-[color:var(--color-muted)]">
                  <th className="py-1 pr-2">รายการ</th>
                  <th className="py-1 pr-2">ค่า</th>
                  <th className="py-1 pr-2">ที่มา</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id} className="border-t align-top" data-testid={`etax-row-${r.key}`}>
                    <td className="w-48 py-1 pr-2">{r.labelTh}</td>
                    <td className="whitespace-nowrap py-1 pr-2 font-mono">{typeof r.value === "number" ? r.value.toLocaleString("en-US") : r.value}</td>
                    <td className="py-1 pr-2 text-[color:var(--color-muted)]">
                      {/* merge T4+T5 ▸ ที่มาที่ผู้ใช้เห็นแบบเดียวกับ LegalValuesPanel (ACC T4 Job 0): กฎหมาย/ประกาศภาษาไทย · ไม่มี path ภายใน/ป้ายตัวอักษร ◂ */}
                      {publicCitationTh(r.source) || r.source.replace(/references\/\S+/g, "").trim()}
                      {r.note ? ` · ${publicNoteTh(r.note)}` : ""} · {r.tag === "S" || r.tag === "U" ? "ค่าเริ่มต้นของระบบ — โปรดตรวจกับนักบัญชีของร้าน" : "จากแหล่งทางการ"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="card flex flex-col gap-2 p-5 opacity-70" aria-disabled="true" data-testid="etax-provider-card">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">e-Tax Invoice แบบลงลายมือชื่ออิเล็กทรอนิกส์ ผ่านผู้ให้บริการ</h2>
          <span className="text-xs font-medium" data-testid="etax-provider-state">ต้องมีคีย์ผู้ให้บริการ</span>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">{p.reasonTh}</p>
        <ul className="text-xs text-[color:var(--color-muted)]">
          {p.providers.map((x) => (
            <li key={x.code}>{x.label} — ต้องการ {x.requiredFields.join(" · ")} (ยังไม่เชื่อม)</li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm self-start" disabled data-testid="etax-provider-connect">เชื่อมผู้ให้บริการ (ยังไม่เปิด)</button>
      </section>
    </div>
  );
}
