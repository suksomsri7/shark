// NotificationsSettings.tsx — หน้า "ระบบสมาชิก › ตั้งค่า › การแจ้งเตือน" (M3.6 · ภาพ ledger/design-member/30-notifications-templates.png)
//
// ตาราง 8 เหตุการณ์ × ชิป 4 ช่องทาง (การ์ดต่อแถวบนมือถือ) + แผงขวาแก้เทมเพลตของเหตุการณ์ที่เลือก
// (แท็บช่องทาง · ตัวแปร · ตัวอย่างเรนเดอร์สด (บับเบิลแชทเมื่อดูช่องทาง LINE) · เวลาส่ง (30/7 วันก่อน
// เฉพาะแต้มใกล้หมดอายุ) · สวิตช์ quiet hours/ยินยอม · ปุ่มทดสอบส่งหาตัวเอง/บันทึก) + แถบล่างสรุปยอดส่งเดือนนี้ต่อช่องทาง
//
// 🔴 ไม่มีอีโมจิ/hex สี — ใช้ MemberIcon + โทเคนสี var(--color-*) ทั้งหมด
// 🔴 import เฉพาะ `notifications-shared` (บริสุทธิ์) + `notifications-actions` ("use server") — ไม่แตะ
//    `notifications.ts`/`notification-events.ts` ตรง (ไฟล์นั้นลาก prisma เข้าบันเดิลของเบราว์เซอร์)
// 🔴 ตัวอย่างใช้ชื่อร้าน/ลิงก์กระเป๋าจริงของ tenant (ส่งมาจาก page.tsx) — ห้ามใช้ข้อมูลปลอม "ร้านตัวอย่าง"/slug demo
//
// ป้าย 8 เหตุการณ์ (มาจาก `NOTIF_EVENTS[].label` — วาดสดในตาราง ไม่ใช่ข้อความตายตัวที่นี่):
// ต้อนรับสมาชิกใหม่ · ได้แต้ม · แต้มใกล้หมดอายุ · เลื่อนระดับ · ใกล้ลดระดับ · voucher ใหม่ · สแตมป์ครบ · ขอรีวิว
// ป้ายเวลาส่ง (มาจาก `NOTIF_TIMING_LABELS`): ทันที · รวมรายวัน
"use client";

import { useState, useTransition } from "react";
import { MemberIcon } from "./MemberIcon";
import {
  NOTIF_CHANNELS,
  NOTIF_CHANNEL_LABELS,
  NOTIF_EVENTS,
  NOTIF_TIMING_LABELS,
  NOTIF_VAR_LABELS,
  renderTemplate,
  type NotifChannel,
  type NotificationSettingsView,
} from "@/lib/modules/member/notifications-shared";
import { saveNotificationSettingsAction, saveTemplateAction, testSendNotificationAction } from "@/lib/modules/member/notifications-actions";

type MonthStats = { byChannel: Record<string, number> };

type Props = {
  systemId: string;
  initialSettings: NotificationSettingsView;
  monthStats: MonthStats;
  /** ชื่อร้านจริง (tenant) — ใช้ในตัวอย่างข้อความ ห้ามใช้ค่าสมมติ */
  tenantName: string;
  /** ลิงก์กระเป๋าสิทธิ์จริงของร้าน (origin จริง + slug จริง) — ใช้ในตัวอย่างข้อความ */
  walletUrl: string;
};

/** อักษรย่อของร้าน (คำแรก + คำที่สอง ตัวแรกตัวใหญ่) สำหรับวงกลม avatar ในตัวอย่างบน LINE — แบบเดียวกับป้ายโลโก้ในแถบบน */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function NotificationsSettings({ systemId, initialSettings, monthStats, tenantName, walletUrl }: Props) {
  const [settings, setSettings] = useState<NotificationSettingsView>(initialSettings);
  const [selectedKey, setSelectedKey] = useState<string>(NOTIF_EVENTS[0].key);
  const [tab, setTab] = useState<NotifChannel>("LINE");
  const [pending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const event = NOTIF_EVENTS.find((e) => e.key === selectedKey) ?? NOTIF_EVENTS[0];
  const tpl = settings.templates[event.key];
  const chCfg = tpl.channels[tab];

  const previewVars: Record<string, string | number> = {
    ชื่อ: "สมชาย",
    ร้าน: tenantName,
    ระดับ: "Gold",
    แต้ม: 1200,
    ลิงก์กระเป๋า: walletUrl,
    สาขา: "สาขาหลัก",
    voucher: "ส่วนลด 100 บาท",
    แต้มที่จะหมด: 400,
    วันหมดอายุ: "10 ต.ค. 2569",
  };

  function patchTemplate(fn: (t: typeof tpl) => typeof tpl) {
    setSettings((s) => ({ ...s, templates: { ...s.templates, [event.key]: fn(s.templates[event.key]) } }));
  }

  function updateChannelField(field: "body" | "subject" | "title", value: string) {
    patchTemplate((t) => ({ ...t, channels: { ...t.channels, [tab]: { ...t.channels[tab], [field]: value } } }));
  }

  function toggleLeadDay(d: number) {
    patchTemplate((t) => {
      const cur = t.leadDays ?? [];
      const leadDays = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => b - a);
      return { ...t, leadDays };
    });
  }

  function save() {
    setSaveMsg(null);
    startTransition(async () => {
      const t = settings.templates[event.key];
      const r1 = await saveTemplateAction({
        systemId,
        key: event.key,
        patch: { enabled: t.enabled, timing: t.timing, digestHour: t.digestHour, leadDays: t.leadDays, channels: t.channels },
      });
      if (!r1.ok) {
        setSaveMsg(r1.reason);
        return;
      }
      const r2 = await saveNotificationSettingsAction({
        systemId,
        patch: { quietHours: settings.quietHours, respectConsent: settings.respectConsent, transactionalOverride: settings.transactionalOverride },
      });
      if (!r2.ok) {
        setSaveMsg(r2.reason);
        return;
      }
      setSettings((s) => ({ ...s, templates: { ...s.templates, [event.key]: r1.data } }));
      setSaveMsg("บันทึกแล้ว");
    });
  }

  function runTestSend() {
    setTestMsg(null);
    startTransition(async () => {
      const r = await testSendNotificationAction({ systemId, key: event.key, channel: tab });
      if (!r.ok) {
        setTestMsg(r.reason);
        return;
      }
      setTestMsg(r.data.result.ok ? "ส่งทดสอบสำเร็จ — ดูที่ช่องทางของคุณ" : `ส่งทดสอบไม่สำเร็จ — ${r.data.result.error ?? "ไม่ทราบสาเหตุ"}`);
    });
  }

  const previewSubject = tab === "EMAIL" ? renderTemplate(chCfg.subject ?? "", previewVars) : null;
  const previewText = renderTemplate(chCfg.body, previewVars);
  // ตัวแปร {ลิงก์กระเป๋า} ในตัวอย่างโชว์เป็นลิงก์ข้อความ "เปิดกระเป๋าสิทธิ์ →" แทน URL ดิบ (ข้อความจริงที่ส่งออก
  // ยังมี URL เต็มฝังอยู่ — ตรงนี้เป็นแค่การแสดงผลตัวอย่างให้อ่านง่ายแบบเดียวกับที่ลูกค้าเห็นในแอป LINE)
  const previewParts = walletUrl && previewText.includes(walletUrl) ? previewText.split(walletUrl) : [previewText];

  return (
    <div data-testid="notif-page" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_460px]">
      <section className="card min-w-0 p-0">
        <div data-testid="notif-table" className="flex min-w-0 flex-col">
          <div
            className="hidden gap-2 border-b px-3 py-2 text-xs md:grid"
            style={{ gridTemplateColumns: "1.2fr 1.9fr 0.85fr 0.65fr", borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            <span>เหตุการณ์</span>
            <span>ช่องทาง</span>
            <span>ส่งเมื่อ</span>
            <span>สถานะ</span>
          </div>

          {NOTIF_EVENTS.map((ev) => {
            const t = settings.templates[ev.key];
            return (
              <div
                key={ev.key}
                data-testid={`notif-row-${ev.key}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedKey(ev.key);
                  setTab("LINE");
                  setSaveMsg(null);
                  setTestMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSelectedKey(ev.key);
                    setTab("LINE");
                  }
                }}
                className="grid min-w-0 grid-cols-1 gap-2 border-b px-3 py-2.5 text-sm md:grid-cols-[1.2fr_1.9fr_0.85fr_0.65fr] md:items-center md:gap-2"
                style={{ borderColor: "var(--color-line)", background: ev.key === event.key ? "var(--color-surface-2)" : undefined, cursor: "pointer" }}
              >
                <span className="font-medium">{ev.label}</span>
                <div className="flex min-w-0 flex-wrap gap-1">
                  {NOTIF_CHANNELS.map((ch) => {
                    const on = t.channels[ch].enabled;
                    const smsGrey = ch === "SMS" && !settings.smsAvailable;
                    return (
                      <span
                        key={ch}
                        data-testid={`notif-chip-${ev.key}-${ch}`}
                        className="flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none whitespace-nowrap"
                        style={{
                          borderColor: "var(--color-line)",
                          color: smsGrey ? "var(--color-muted)" : on ? "var(--color-accent)" : "var(--color-muted)",
                          opacity: smsGrey ? 0.55 : 1,
                        }}
                        title={smsGrey ? "ยังไม่ได้ตั้งค่าผู้ให้บริการ SMS" : undefined}
                      >
                        {NOTIF_CHANNEL_LABELS[ch]}
                        <MemberIcon name={on ? "check" : "x"} size="xs" />
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs md:block md:text-sm" style={{ color: "var(--color-muted)" }}>
                  <span className="md:hidden">ส่งเมื่อ</span>
                  <span style={{ color: "inherit" }}>
                    {NOTIF_TIMING_LABELS[t.timing]}
                    {t.timing === "DAILY_DIGEST" ? ` ${String(t.digestHour).padStart(2, "0")}:00` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between md:block">
                  <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>
                    สถานะ
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: "var(--color-line)", color: t.enabled ? "var(--color-accent)" : "var(--color-muted)" }}
                  >
                    {t.enabled ? "ใช้งาน" : "ปิดอยู่"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {!settings.smsAvailable && (
          <p data-testid="notif-sms-unavailable" className="p-3 text-xs" style={{ color: "var(--color-muted)" }}>
            ช่องทาง SMS: ยังไม่ได้ตั้งค่าผู้ให้บริการ SMS
          </p>
        )}
        <div data-testid="notif-month-summary" className="flex flex-wrap gap-5 border-t p-3" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex flex-col justify-end text-xs" style={{ color: "var(--color-muted)" }}>
            <span>เดือนนี้ส่ง</span>
          </div>
          {NOTIF_CHANNELS.map((ch) => (
            <div key={ch} className="flex flex-col gap-0.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {NOTIF_CHANNEL_LABELS[ch]}
              </span>
              <span className="text-lg font-semibold tabular-nums">{(monthStats.byChannel[ch] ?? 0).toLocaleString("th-TH")}</span>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              อัตราเปิด LINE
            </span>
            {/* ยังไม่มีการวัด "เปิดอ่าน" ของการแจ้งเตือน (ต่างจากแคมเปญ M3.2 ที่มี pixel) — โชว์ "—" ไม่แต่งตัวเลข */}
            <span className="text-lg font-semibold tabular-nums">—</span>
          </div>
        </div>
      </section>

      <aside data-testid="notif-panel" className="card flex min-w-0 flex-col gap-3 p-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MemberIcon name="edit" size="sm" /> แก้เทมเพลต — {event.label}
        </span>

        <div data-testid="notif-panel-tabs" className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--color-line)" }}>
          {NOTIF_CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setTab(ch)}
              className="px-3 py-1.5 text-sm"
              style={{ fontWeight: tab === ch ? 700 : 400, borderBottom: tab === ch ? "2px solid var(--color-accent)" : "2px solid transparent" }}
            >
              {NOTIF_CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>

        <div data-testid="notif-panel-body" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tpl.enabled} onChange={(e) => patchTemplate((t) => ({ ...t, enabled: e.target.checked }))} />
              {tpl.enabled ? "ใช้งาน" : "ปิดอยู่"}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chCfg.enabled}
                onChange={(e) => patchTemplate((t) => ({ ...t, channels: { ...t.channels, [tab]: { ...t.channels[tab], enabled: e.target.checked } } }))}
              />
              ส่งทาง {NOTIF_CHANNEL_LABELS[tab]}
            </label>
          </div>

          {tab === "EMAIL" && (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                หัวเรื่องอีเมล
              </span>
              <input
                value={chCfg.subject ?? ""}
                onChange={(e) => updateChannelField("subject", e.target.value)}
                className="input min-w-0 text-sm"
                aria-label="หัวเรื่องอีเมล"
              />
            </div>
          )}
          {tab === "PUSH" && (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                หัวข้อการแจ้งเตือน
              </span>
              <input
                value={chCfg.title ?? ""}
                onChange={(e) => updateChannelField("title", e.target.value)}
                className="input min-w-0 text-sm"
                aria-label="หัวข้อการแจ้งเตือน"
              />
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              ข้อความ
            </span>
            <textarea
              value={chCfg.body}
              onChange={(e) => updateChannelField("body", e.target.value)}
              rows={4}
              className="input min-w-0 text-sm"
              aria-label="ข้อความที่จะส่ง"
            />
          </div>

          <div data-testid="notif-vars" className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
            ตัวแปร:
            {event.vars.map((v) => (
              <span key={v} className="rounded-lg border px-2 py-0.5" style={{ borderColor: "var(--color-line)" }} title={NOTIF_VAR_LABELS[v] ?? v}>
                {`{${v}}`}
              </span>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MemberIcon name="chat" size="sm" /> ตัวอย่างบน {NOTIF_CHANNEL_LABELS[tab]}
            </span>
            {tab === "LINE" ? (
              <div data-testid="notif-preview" className="min-w-0 rounded-2xl p-3" style={{ background: "var(--color-surface-2)" }}>
                <div className="flex min-w-0 items-end gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
                  >
                    {initialsOf(tenantName)}
                  </span>
                  <div className="min-w-0 rounded-2xl px-3 py-2 text-sm" style={{ background: "var(--color-surface)" }}>
                    <p className="whitespace-pre-wrap break-words">
                      {previewParts[0]}
                      {previewParts.length > 1 ? (
                        <>
                          <br />
                          <a className="font-medium" style={{ color: "var(--color-accent)" }}>
                            เปิดกระเป๋าสิทธิ์ →
                          </a>
                          {previewParts.slice(1).join(walletUrl)}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div data-testid="notif-preview" className="min-w-0 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
                {previewSubject ? <p className="mb-1 font-medium">{previewSubject}</p> : null}
                <p className="whitespace-pre-wrap break-words">{previewText}</p>
              </div>
            )}
          </div>

          {event.leadDays ? (
            <div data-testid="notif-lead-days" className="flex flex-col gap-2">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                เวลาส่ง
              </span>
              <div className="flex flex-wrap gap-2">
                {[30, 7].map((d) => {
                  const on = (tpl.leadDays ?? []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleLeadDay(d)}
                      className="rounded-full border px-3 py-1 text-xs font-medium"
                      style={{
                        borderColor: "var(--color-accent)",
                        color: "var(--color-accent)",
                        background: on ? "var(--color-accent-soft)" : "var(--color-surface)",
                      }}
                    >
                      {d} วันก่อน
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label data-testid="notif-quiet" className="flex items-center justify-between gap-2 text-sm">
            <span>
              ห้ามส่งช่วง {settings.quietHours.from}–{settings.quietHours.to}
            </span>
            <input
              type="checkbox"
              checked={settings.quietHours.enabled}
              onChange={(e) => setSettings((s) => ({ ...s, quietHours: { ...s.quietHours, enabled: e.target.checked } }))}
            />
          </label>
          <label data-testid="notif-consent" className="flex items-center justify-between gap-2 text-sm">
            <span>เคารพความยินยอมต่อช่องทาง</span>
            <input
              type="checkbox"
              checked={settings.respectConsent}
              onChange={(e) => setSettings((s) => ({ ...s, respectConsent: e.target.checked }))}
            />
          </label>

          {testMsg && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {testMsg}
            </p>
          )}
          {saveMsg && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {saveMsg}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="notif-test-send" onClick={runTestSend} disabled={pending} className="btn btn-ghost text-sm">
              ทดสอบส่งหาตัวเอง
            </button>
            <button type="button" data-testid="notif-save" onClick={save} disabled={pending} className="btn btn-primary text-sm">
              บันทึก
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default NotificationsSettings;
