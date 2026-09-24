"use client";

// EmailSettingsForm.tsx — "ตั้งค่า — อีเมล (เส้นทางส่ง/รับ)" ของ CRM v2 (ใบ C2.5b · ภาพ 15)
//   กล่องอีเมลร้าน (รับเข้า) + หมุนกุญแจ · ผู้ส่ง (กล่อง SHARK / โดเมนร้าน + DNS) · Reply-To · สำเนา (forward) ·
//   BCC จับเข้า CRM + สวิตช์ lead/ติดตาม/อายุการเก็บ · ทับค่าต่อผู้ใช้ · แม่แบบจดหมาย · ส่งอีเมลทดสอบ
//
// 🔴 'use client' + ด่าน F2.3: ไม่ import โมดูล CRM — ทะเบียนโหมด/ป้าย/เพดานมาทาง props จากหน้า server
// 🔴 ตรวจค่าแบบ inline (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้ · ทุกปุ่ม/ช่องมี data-testid + แถวในทะเบียน
// 🔴 "หมุนกุญแจกล่องขาเข้า" เป็นของอันตราย (X9): ต้องพิมพ์เหตุผลก่อน แล้วกดยืนยันอีกชั้น — ที่อยู่เดิมหยุดรับทันที
// 🔴 กว้าง 1440 และ 390 ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ตารางมี overflow-x ของตัวเอง · ความกว้างคงที่มีคำนำหน้า sm:)

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addCrmEmailDomainAction,
  deleteCrmEmailTemplateAction,
  refreshCrmEmailDomainAction,
  rotateCrmInboundKeyAction,
  saveCrmEmailSettingsAction,
  saveCrmEmailTemplateAction,
  saveCrmEmailUserSettingAction,
  sendCrmEmailTestAction,
} from "@/app/app/sys/[id]/crm/emails/actions";
import type { CrmEmailSettingsData, CrmEmailUserRow } from "./types";

type TemplateDraft = { id: string | null; name: string; subject: string; bodyHtml: string };

export function EmailSettingsForm({ data }: { data: CrmEmailSettingsData }) {
  const router = useRouter();
  const { systemId, limits } = data;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [s, setS] = useState(data.settings);
  const [rotateReason, setRotateReason] = useState("");
  const [rotating, setRotating] = useState(false);
  const [domain, setDomain] = useState("");
  const [userDraft, setUserDraft] = useState<CrmEmailUserRow | null>(null);
  const [tpl, setTpl] = useState<TemplateDraft | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" });
    if (r.ok) router.refresh();
  }

  const save = (patch: Record<string, unknown>, okText = "บันทึกแล้ว") => run(() => saveCrmEmailSettingsAction(systemId, patch), okText);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-email-settings">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-muted)]" : "text-red-600"}`} role="status" data-testid="crm-email-settings-msg">
          {msg.text}
        </p>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {/* ── กล่องอีเมลร้าน (รับเข้า CRM) ── */}
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-inbox-heading">
          <h2 id="crm-email-inbox-heading" className="text-base font-semibold">
            กล่องอีเมลร้าน (รับเข้า CRM)
          </h2>
          <input type="text" readOnly className="input font-mono text-sm" value={s.inboundAddress} aria-label="ที่อยู่กล่องอีเมลของร้าน" data-testid="crm-email-inbound-address" />
          <p className="text-xs text-[color:var(--color-muted)]">
            ลูกค้าตอบกลับมาที่นี่ตามโหมด Reply-To ด้านล่าง · ใช้เป็น BCC ในกล่องอีเมลส่วนตัวก็ได้ — จดหมายจะถูกบันทึกเข้าไทม์ไลน์ CRM ให้เอง
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>เปิดรับอีเมลเข้า</span>
            <input
              type="checkbox"
              checked={s.inboundEnabled}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, inboundEnabled: e.target.checked });
                void save({ inboundEnabled: e.target.checked });
              }}
              data-testid="crm-email-inbound-enabled"
            />
          </label>
          {!rotating ? (
            <button type="button" className="btn btn-ghost self-start text-xs" disabled={busy} onClick={() => setRotating(true)} data-testid="crm-email-rotate-key">
              หมุนกุญแจกล่องขาเข้า
            </button>
          ) : (
            <div className="flex min-w-0 flex-col gap-2 rounded-md border border-amber-300 p-3">
              <p className="text-xs text-amber-700">
                ที่อยู่เดิมจะหยุดรับจดหมายทันทีที่กดยืนยัน — จดหมายที่ลูกค้าตอบมาที่อยู่เก่าจะไม่เข้าระบบอีก ใส่เหตุผลไว้ให้คนอื่นเข้าใจภายหลังด้วย
              </p>
              <input
                type="text"
                className="input"
                placeholder={`เหตุผล (อย่างน้อย ${limits.rotateReasonMin} ตัวอักษร)`}
                aria-label="เหตุผลที่หมุนกุญแจกล่องขาเข้า"
                value={rotateReason}
                onChange={(e) => setRotateReason(e.target.value)}
                data-testid="crm-email-rotate-reason"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-xs"
                  disabled={busy || rotateReason.trim().length < limits.rotateReasonMin}
                  onClick={() =>
                    void run(async () => {
                      const r = await rotateCrmInboundKeyAction(systemId, rotateReason.trim());
                      if (r.ok) {
                        setRotating(false);
                        setRotateReason("");
                        setS({ ...s, inboundAddress: r.address });
                      }
                      return r;
                    }, "เปลี่ยนที่อยู่กล่องขาเข้าแล้ว")
                  }
                  data-testid="crm-email-rotate-confirm"
                >
                  ยืนยันหมุนกุญแจ
                </button>
                <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => { setRotating(false); setRotateReason(""); }} data-testid="crm-email-rotate-cancel">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── ส่งสำเนาไปที่ (forward) + BCC จับเข้า CRM ── */}
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-copy-heading">
          <h2 id="crm-email-copy-heading" className="text-base font-semibold">
            ส่งสำเนาไปที่ (forward)
          </h2>
          <input
            type="email"
            className="input"
            placeholder="sales-backup@example.com"
            aria-label="ที่อยู่รับสำเนา"
            value={s.copyToAddr ?? ""}
            onChange={(e) => setS({ ...s, copyToAddr: e.target.value })}
            onBlur={() => void save({ copyToAddr: s.copyToAddr?.trim() ? s.copyToAddr.trim() : null })}
            data-testid="crm-email-copy-to"
          />
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">ส่งสำเนาเมื่อไหร่</span>
            <select
              className="input"
              value={s.copyMode}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, copyMode: e.target.value });
                void save({ copyMode: e.target.value });
              }}
              data-testid="crm-email-copy-mode"
            >
              {data.copyModes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <h3 className="mt-2 text-sm font-semibold">BCC จับเข้า CRM</h3>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>อีเมลแปลกหน้าเป็น lead ใหม่อัตโนมัติ</span>
            <input
              type="checkbox"
              checked={s.strangerToLead}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, strangerToLead: e.target.checked });
                void save({ strangerToLead: e.target.checked });
              }}
              data-testid="crm-email-stranger-lead"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>เก็บสำเนาจดหมายที่พนักงาน BCC มา</span>
            <input
              type="checkbox"
              checked={s.bccCaptureEnabled}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, bccCaptureEnabled: e.target.checked });
                void save({ bccCaptureEnabled: e.target.checked });
              }}
              data-testid="crm-email-bcc-capture"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>ติดตามการเปิด (pixel)</span>
            <input
              type="checkbox"
              checked={s.trackOpens}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, trackOpens: e.target.checked });
                void save({ trackOpens: e.target.checked });
              }}
              data-testid="crm-email-track-opens"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>ติดตามการคลิกลิงก์</span>
            <input
              type="checkbox"
              checked={s.trackClicks}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, trackClicks: e.target.checked });
                void save({ trackClicks: e.target.checked });
              }}
              data-testid="crm-email-track-clicks"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>เก็บเนื้อความอีเมลไว้ (วัน)</span>
            <input
              type="number"
              className="input w-full sm:w-28"
              min={limits.retentionMin}
              max={limits.retentionMax}
              value={s.retentionDays}
              disabled={busy}
              onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })}
              onBlur={() => void save({ retentionDays: s.retentionDays }, "บันทึกอายุการเก็บแล้ว")}
              data-testid="crm-email-retention"
            />
          </label>
        </section>

        {/* ── ส่งออก — ผู้ส่ง + โดเมน ── */}
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-from-heading">
          <h2 id="crm-email-from-heading" className="text-base font-semibold">
            ส่งออก — ผู้ส่ง
          </h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            ตอนนี้ลูกค้าจะเห็นผู้ส่งเป็น <span className="font-mono">{data.effectiveFrom}</span> (ผ่าน{data.via === "DOMAIN" ? "โดเมนของร้าน" : "กล่อง SHARK"})
          </p>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">ที่อยู่ผู้ส่ง</span>
            <select
              className="input"
              value={s.fromMode}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, fromMode: e.target.value });
                void save({ fromMode: e.target.value });
              }}
              data-testid="crm-email-from-mode"
            >
              {data.fromModes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">ชื่อผู้ส่งที่ลูกค้าเห็น</span>
            <input
              type="text"
              className="input"
              placeholder="ชื่อร้านของคุณ"
              value={s.fromName ?? ""}
              onChange={(e) => setS({ ...s, fromName: e.target.value })}
              onBlur={() => void save({ fromName: s.fromName?.trim() ? s.fromName.trim() : null })}
              data-testid="crm-email-from-name"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">ที่อยู่ผู้ส่งบนโดเมนร้าน (ใช้เมื่อเลือกโหมดโดเมน)</span>
            <input
              type="email"
              className="input"
              placeholder="sales@example.com"
              value={s.fromAddr ?? ""}
              onChange={(e) => setS({ ...s, fromAddr: e.target.value })}
              onBlur={() => void save({ fromAddr: s.fromAddr?.trim() ? s.fromAddr.trim() : null })}
              data-testid="crm-email-from-addr"
            />
          </label>

          <h3 className="mt-2 text-sm font-semibold">โดเมนผู้ส่งของร้าน</h3>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="text"
              className="input w-full sm:w-56"
              placeholder="example.com"
              aria-label="โดเมนที่จะยืนยัน"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              data-testid="crm-email-domain-input"
            />
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={busy || !domain.trim()}
              onClick={() =>
                void run(async () => {
                  const r = await addCrmEmailDomainAction(systemId, domain.trim());
                  if (r.ok) setDomain("");
                  return r;
                }, "เพิ่มโดเมนแล้ว — ตั้งค่า DNS ตามตารางด้านล่างแล้วกดตรวจสถานะ")
              }
              data-testid="crm-email-domain-add"
            >
              เพิ่มโดเมน
            </button>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-xs sm:min-w-[560px]" data-testid="crm-email-domain-records">
              <thead>
                <tr className="text-left text-[color:var(--color-muted)]">
                  <th className="p-2 font-medium">โดเมน / ชนิด</th>
                  <th className="p-2 font-medium">ชื่อ</th>
                  <th className="p-2 font-medium">ค่า</th>
                  <th className="p-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.domains.length === 0 && (
                  <tr>
                    <td className="p-3 text-[color:var(--color-muted)]" colSpan={4}>
                      ยังไม่มีโดเมนของร้าน — ส่งผ่านกล่อง SHARK ได้เลยโดยไม่ต้องตั้ง DNS
                    </td>
                  </tr>
                )}
                {data.domains.map((d) => (
                  <tr key={d.id} className="align-top" data-domain-id={d.id}>
                    <td className="p-2">
                      <span className="block font-mono">{d.domain}</span>
                      <button
                        type="button"
                        className="btn btn-ghost mt-1 text-xs"
                        disabled={busy}
                        onClick={() => void run(() => refreshCrmEmailDomainAction(systemId, d.id), "ตรวจสถานะโดเมนแล้ว")}
                        data-testid="crm-email-domain-refresh"
                        data-domain-id={d.id}
                      >
                        ตรวจสถานะ
                      </button>
                    </td>
                    <td className="p-2">
                      {d.records.map((r, i) => (
                        <span key={`${d.id}-n-${i}`} className="block font-mono">
                          {r.type} · {r.name}
                        </span>
                      ))}
                    </td>
                    <td className="p-2">
                      {d.records.map((r, i) => (
                        <span key={`${d.id}-v-${i}`} className="block truncate font-mono">
                          {r.value}
                        </span>
                      ))}
                    </td>
                    <td className="p-2">{d.statusLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Reply-To ── */}
        <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-replyto-heading">
          <h2 id="crm-email-replyto-heading" className="text-base font-semibold">
            Reply-To (ลูกค้าตอบไปที่ไหน)
          </h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            ตอนนี้ลูกค้าจะตอบไปที่ <span className="font-mono">{data.effectiveReplyTo}</span>
          </p>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">โหมด</span>
            <select
              className="input"
              value={s.replyToMode}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, replyToMode: e.target.value });
                void save({ replyToMode: e.target.value });
              }}
              data-testid="crm-email-replyto-mode"
            >
              {data.replyModes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">ที่อยู่รับคำตอบ (ใช้เมื่อเลือกโหมดกำหนดเอง)</span>
            <input
              type="email"
              className="input"
              placeholder="reply@example.com"
              value={s.replyToAddr ?? ""}
              onChange={(e) => setS({ ...s, replyToAddr: e.target.value })}
              onBlur={() => void save({ replyToAddr: s.replyToAddr?.trim() ? s.replyToAddr.trim() : null })}
              data-testid="crm-email-replyto-addr"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>ให้พนักงานตั้งค่าของตัวเองทับได้</span>
            <input
              type="checkbox"
              checked={s.allowUserOverride}
              disabled={busy}
              onChange={(e) => {
                setS({ ...s, allowUserOverride: e.target.checked });
                void save({ allowUserOverride: e.target.checked });
              }}
              data-testid="crm-email-allow-override"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost self-start text-xs"
            disabled={busy}
            onClick={() => void run(() => sendCrmEmailTestAction(systemId), "ส่งอีเมลทดสอบไปที่อีเมลของคุณแล้ว")}
            data-testid="crm-email-test-send"
          >
            ส่งอีเมลทดสอบถึงตัวเอง
          </button>
        </section>
      </div>

      {/* ── ทับค่าต่อผู้ใช้ ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-users-heading">
        <h2 id="crm-email-users-heading" className="text-base font-semibold">
          ทับค่าต่อผู้ใช้ <span className="text-xs font-normal text-[color:var(--color-muted)]">พนักงานแต่ละคนตั้งชื่อผู้ส่ง · Reply-To · สำเนาของตัวเองได้</span>
        </h2>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[680px]" data-testid="crm-email-user-overrides">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="p-2 font-medium">พนักงาน</th>
                <th className="p-2 font-medium">อีเมลตัวเอง</th>
                <th className="p-2 font-medium">Reply-To</th>
                <th className="p-2 font-medium">สำเนา</th>
                <th className="p-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.length === 0 && (
                <tr>
                  <td className="p-3 text-[color:var(--color-muted)]" colSpan={5}>
                    ยังไม่มีพนักงานที่เข้าถึง CRM ได้ในร้านนี้
                  </td>
                </tr>
              )}
              {data.users.map((u) => (
                <tr key={u.userId} data-user-id={u.userId}>
                  <td className="p-2">{u.name}</td>
                  <td className="p-2 font-mono text-xs">{u.userEmail ?? "—"}</td>
                  <td className="p-2 text-xs">{u.replyToMode === "SHARK" ? "กล่อง SHARK" : u.replyToMode === "CUSTOM" ? (u.replyToAddr ?? "กำหนดเอง") : "อีเมลตัวเอง"}</td>
                  <td className="p-2 text-xs">{u.copyToAddr ?? "—"}</td>
                  <td className="p-2">
                    <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => setUserDraft(u)} data-testid="crm-email-user-edit" data-user-id={u.userId}>
                      แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {userDraft && (
          <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">ตั้งค่าของ {userDraft.name}</p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-[color:var(--color-muted)]">ชื่อผู้ส่ง</span>
                <input type="text" className="input" value={userDraft.fromName ?? ""} onChange={(e) => setUserDraft({ ...userDraft, fromName: e.target.value })} data-testid="crm-email-user-fromname" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-[color:var(--color-muted)]">Reply-To</span>
                <select className="input" value={userDraft.replyToMode} onChange={(e) => setUserDraft({ ...userDraft, replyToMode: e.target.value })} data-testid="crm-email-user-replyto-mode">
                  {data.replyModes.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-[color:var(--color-muted)]">ที่อยู่รับคำตอบ (โหมดกำหนดเอง)</span>
                <input type="email" className="input" value={userDraft.replyToAddr ?? ""} onChange={(e) => setUserDraft({ ...userDraft, replyToAddr: e.target.value })} data-testid="crm-email-user-replyto-addr" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-[color:var(--color-muted)]">ที่อยู่รับสำเนา</span>
                <input type="email" className="input" value={userDraft.copyToAddr ?? ""} onChange={(e) => setUserDraft({ ...userDraft, copyToAddr: e.target.value })} data-testid="crm-email-user-copy-to" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-[color:var(--color-muted)]">ส่งสำเนาเมื่อไหร่</span>
                <select className="input" value={userDraft.copyMode} onChange={(e) => setUserDraft({ ...userDraft, copyMode: e.target.value })} data-testid="crm-email-user-copy-mode">
                  {data.copyModes.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await saveCrmEmailUserSettingAction(systemId, {
                      userId: userDraft.userId,
                      fromName: userDraft.fromName?.trim() ? userDraft.fromName.trim() : null,
                      replyToMode: userDraft.replyToMode,
                      replyToAddr: userDraft.replyToAddr?.trim() ? userDraft.replyToAddr.trim() : null,
                      copyToAddr: userDraft.copyToAddr?.trim() ? userDraft.copyToAddr.trim() : null,
                      copyMode: userDraft.copyMode,
                    });
                    if (r.ok) setUserDraft(null);
                    return r;
                  }, "บันทึกค่าของพนักงานคนนี้แล้ว")
                }
                data-testid="crm-email-user-save"
              >
                บันทึก
              </button>
              <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => setUserDraft(null)} data-testid="crm-email-user-cancel">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── แม่แบบจดหมาย ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" aria-labelledby="crm-email-templates-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="crm-email-templates-heading" className="text-base font-semibold">
            แม่แบบจดหมาย <span className="text-xs font-normal text-[color:var(--color-muted)]">ใช้ซ้ำในหน้าเขียนจดหมาย · ใส่ {"{{contact.firstName}}"} แทนชื่อลูกค้าได้</span>
          </h2>
          <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={() => setTpl({ id: null, name: "", subject: "", bodyHtml: "" })} data-testid="crm-email-template-new">
            เพิ่มแม่แบบ
          </button>
        </div>
        <ul className="divide-y" data-testid="crm-email-templates">
          {data.templates.length === 0 && <li className="p-3 text-sm text-[color:var(--color-muted)]">ยังไม่มีแม่แบบ — เพิ่มได้จากปุ่มด้านบน</li>}
          {data.templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-template-id={t.id}>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{t.name}</span> <span className="text-xs text-[color:var(--color-muted)]">· {t.subject}</span>
              </span>
              <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => setTpl({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml })} data-testid="crm-email-template-edit" data-template-id={t.id}>
                แก้ไข
              </button>
              <button
                type="button"
                className="btn btn-ghost text-xs text-red-600"
                disabled={busy}
                onClick={() => void run(() => deleteCrmEmailTemplateAction(systemId, t.id), "ลบแม่แบบแล้ว")}
                data-testid="crm-email-template-delete"
                data-template-id={t.id}
              >
                ลบ
              </button>
            </li>
          ))}
        </ul>
        {tpl && (
          <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
            <input type="text" className="input" placeholder="ชื่อแม่แบบ" aria-label="ชื่อแม่แบบ" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} data-testid="crm-email-template-name" />
            <input
              type="text"
              className="input"
              placeholder="หัวข้อจดหมาย"
              aria-label="หัวข้อของแม่แบบ"
              maxLength={limits.subjectMax}
              value={tpl.subject}
              onChange={(e) => setTpl({ ...tpl, subject: e.target.value })}
              data-testid="crm-email-template-subject"
            />
            <textarea className="input min-h-24" placeholder="เนื้อความ" aria-label="เนื้อความของแม่แบบ" value={tpl.bodyHtml} onChange={(e) => setTpl({ ...tpl, bodyHtml: e.target.value })} data-testid="crm-email-template-body" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={busy || !tpl.name.trim() || !tpl.subject.trim() || !tpl.bodyHtml.trim()}
                onClick={() =>
                  void run(async () => {
                    const body = tpl.bodyHtml.includes("<") ? tpl.bodyHtml : `<p>${tpl.bodyHtml.replace(/\n/g, "<br>")}</p>`;
                    const r = await saveCrmEmailTemplateAction(systemId, { id: tpl.id, name: tpl.name.trim(), subject: tpl.subject.trim(), bodyHtml: body });
                    if (r.ok) setTpl(null);
                    return r;
                  }, "บันทึกแม่แบบแล้ว")
                }
                data-testid="crm-email-template-save"
              >
                บันทึกแม่แบบ
              </button>
              <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => setTpl(null)} data-testid="crm-email-template-cancel">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
