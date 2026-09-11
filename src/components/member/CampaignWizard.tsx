// CampaignWizard.tsx — ตัวสร้างแคมเปญ 3 ขั้น (M3.2 · ภาพ 21)
//
// โครงตามภาพ: ซ้าย = 3 การ์ดตามลำดับ (1 กลุ่มเป้าหมาย · 2 ช่องทางและข้อความ · 3 กำหนดส่ง)
//              ขวา = ตัวอย่างหน้าจอ LINE จริง + กล่องประมาณการ + ปุ่มทดสอบส่งหาตัวเอง
// หัว: ปุ่ม "บันทึกร่าง" กับ "ส่งแคมเปญ"
//
// 🔴 client component ห้าม import โมดูลที่ลากถึง prisma (บทเรียน M3.1) —
//    ที่นี่ import ได้แค่ `campaigns-shared` (ไฟล์บริสุทธิ์) กับ server action เท่านั้น
// 🔴 ตัวเลขในกล่องประมาณการคำนวณจาก "จำนวนคนในกลุ่ม" ที่เซิร์ฟเวอร์นับมาให้ —
//    ไม่เดาเอง และไม่ปล่อยว่างระหว่างรอ (ผู้ใช้ต้องเห็นผลกระทบของ holdout ทันทีที่ลากแถบ)
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { countSegmentAction } from "@/lib/modules/member/segments-actions";
import { saveCampaignAction, saveAndSendCampaignAction, testSendCampaignAction } from "@/lib/modules/marketing/campaigns-actions";
import { CAMPAIGN_VARS, renderMessage, type CampaignChannel } from "@/lib/modules/marketing/campaigns-shared";

export type WizardSegment = { id: string; name: string; summary: string; lastCount: number | null; definition: unknown };
export type WizardVoucher = { id: string; name: string; value: number; kindLabel: string };

export type CampaignWizardProps = {
  /** ระบบสมาชิก (หน้าจออยู่ใต้ `/app/sys/{memberSystemId}/member/...`) */
  systemId: string;
  shopName: string;
  segments: WizardSegment[];
  vouchers: WizardVoucher[];
  canManage: boolean;
};

const CHANNEL_TABS: { key: CampaignChannel; label: string }[] = [
  { key: "LINE", label: "LINE" },
  { key: "EMAIL", label: "อีเมล" },
  { key: "SMS", label: "SMS" },
  { key: "PUSH", label: "push" },
];

const DEFAULT_LINE = "สวัสดีค่ะคุณ {ชื่อ} สมาชิกระดับ {ระดับ} ของเรา — พิเศษสำหรับคุณ รับ voucher {voucher} ไปใช้ได้เลยก่อนหมดเขต";

const baht = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

export function CampaignWizard({ systemId, shopName, segments, vouchers, canManage }: CampaignWizardProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? "");
  const [count, setCount] = useState<{ count: number; avgSpend12mSatang: number; names: string[] } | null>(
    segments[0]?.lastCount != null ? { count: segments[0].lastCount, avgSpend12mSatang: 0, names: [] } : null,
  );

  const [channels, setChannels] = useState<CampaignChannel[]>(["LINE"]);
  const [tab, setTab] = useState<CampaignChannel>("LINE");
  const [line, setLine] = useState(DEFAULT_LINE);
  const [emailSubject, setEmailSubject] = useState("สิทธิพิเศษสำหรับคุณ {ชื่อ}");
  const [emailBody, setEmailBody] = useState(DEFAULT_LINE);
  const [sms, setSms] = useState("{ชื่อ} รับ voucher {voucher} ได้ที่ร้านเลย");
  const [pushTitle, setPushTitle] = useState("สิทธิพิเศษสำหรับสมาชิก");
  const [pushBody, setPushBody] = useState("รับ voucher {voucher} ไปใช้ได้เลย");

  const [voucherId, setVoucherId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [abOn, setAbOn] = useState(false);
  const [lineB, setLineB] = useState("");
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [holdoutOn, setHoldoutOn] = useState(false);
  const [holdoutPct, setHoldoutPct] = useState(10);

  const segment = useMemo(() => segments.find((s) => s.id === segmentId) ?? null, [segments, segmentId]);
  const voucher = useMemo(() => vouchers.find((v) => v.id === voucherId) ?? null, [vouchers, voucherId]);

  // นับจำนวนคนจริงจากเซิร์ฟเวอร์ทุกครั้งที่เปลี่ยนกลุ่ม (ตัวเลขต้องมาจากข้อมูลจริง ไม่ใช่ค่าที่จำไว้)
  const refreshCount = useCallback(
    (definition: unknown) => {
      start(async () => {
        const res = await countSegmentAction(systemId, definition);
        if (res.ok) setCount({ count: res.data.count, avgSpend12mSatang: res.data.avgSpend12mSatang, names: res.data.sample.map((s) => s.name) });
      });
    },
    [systemId],
  );

  useEffect(() => {
    if (segment) refreshCount(segment.definition);
  }, [segment, refreshCount]);

  const audience = count?.count ?? 0;
  const holdoutCount = holdoutOn ? Math.round((audience * holdoutPct) / 100) : 0;
  const willSend = Math.max(0, audience - holdoutCount);
  const maxCostSatang = willSend * (voucher?.value ?? 0);

  const sampleVars = {
    ชื่อ: count?.names[0] ?? "สมชาย",
    ระดับ: "Gold",
    voucher: voucher ? baht(voucher.value) : "",
    รหัสสมาชิก: "SHK-0001",
  };
  const previewText = renderMessage(line, sampleVars);

  const toggleChannel = (key: CampaignChannel) => {
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
    setTab(key);
  };

  const payload = () => ({
    name: name.trim() || segment?.name || "แคมเปญใหม่",
    segmentId: segmentId || null,
    channels,
    content: {
      line,
      email: { subject: emailSubject, body: emailBody },
      sms,
      push: { title: pushTitle, body: pushBody },
    },
    variantB: abOn ? { line: lineB || line, email: { subject: emailSubject, body: emailBody }, sms, push: { title: pushTitle, body: pushBody } } : null,
    holdoutPct: holdoutOn ? holdoutPct : 0,
    attachVoucherTemplateId: voucherId || null,
    couponCode: couponCode.trim() || null,
    scheduledAt: scheduleOn && scheduledAt ? new Date(scheduledAt) : null,
  });

  const saveDraft = () => {
    setError(null);
    setNote(null);
    start(async () => {
      const res = await saveCampaignAction(systemId, null, payload());
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`/app/sys/${systemId}/member/campaigns/${res.data.id}`);
    });
  };

  const send = () => {
    setError(null);
    setNote(null);
    start(async () => {
      const res = await saveAndSendCampaignAction(systemId, null, payload());
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`/app/sys/${systemId}/member/campaigns/${res.data.id}`);
    });
  };

  const testSend = () => {
    setError(null);
    setNote(null);
    start(async () => {
      const res = await testSendCampaignAction(systemId, { subject: renderMessage(emailSubject, sampleVars), body: previewText });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setNote(`ส่งข้อความตัวอย่างไปที่ ${res.data.to} แล้ว`);
    });
  };

  const stepHead = (n: string, title: string, desc?: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-semibold"
        style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
      >
        {n}
      </span>
      <span className="text-sm font-semibold">{title}</span>
      {desc && (
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {desc}
        </span>
      )}
    </div>
  );

  return (
    <div data-testid="campaign-new" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อแคมเปญ (ทีมเห็นชื่อนี้)"
          className="input min-w-0 flex-1 text-sm"
          aria-label="ชื่อแคมเปญ"
        />
        <button data-testid="campaign-save-draft" type="button" className="btn text-sm" disabled={!canManage || busy} onClick={saveDraft}>
          บันทึกร่าง
        </button>
        <button data-testid="campaign-send" type="button" className="btn btn-primary text-sm" disabled={!canManage || busy} onClick={send}>
          <MemberIcon name="mail" size="sm" /> ส่งแคมเปญ
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      {note && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {note}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── ขั้น 1 ── */}
          <section data-testid="campaign-step-segment" className="card flex flex-col gap-3 p-4">
            {stepHead("1", "กลุ่มเป้าหมาย", "Segment builder — เลือกจากฟิลด์สมาชิกทั้งหมด รวมฟิลด์กำหนดเอง")}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-lg px-2.5 py-1 text-xs font-medium"
                style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
              >
                สมาชิกที่
              </span>
              <select
                data-testid="campaign-segment-pick"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className="input min-w-0 flex-1 text-sm"
                aria-label="เลือกกลุ่มเป้าหมาย"
              >
                {segments.length === 0 && <option value="">ยังไม่มีกลุ่มที่บันทึกไว้</option>}
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <a href={`/app/sys/${systemId}/member/segments/new`} className="btn text-sm">
                <MemberIcon name="plus" size="sm" /> เพิ่มเงื่อนไข
              </a>
            </div>
            {segment && (
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                {segment.summary}
              </p>
            )}
            <div
              data-testid="campaign-count"
              className="flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
            >
              <span>
                <strong>{audience.toLocaleString("th-TH")} คน</strong> เข้าเงื่อนไข
                {count && count.avgSpend12mSatang > 0 ? ` · ยอดซื้อ 12 เดือนเฉลี่ย ${baht(count.avgSpend12mSatang)}/คน` : ""}
              </span>
              {count && count.names.length > 0 && (
                <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                  ตัวอย่าง: {count.names.join(", ")}
                </span>
              )}
            </div>
          </section>

          {/* ── ขั้น 2 ── */}
          <section data-testid="campaign-step-message" className="card flex flex-col gap-3 p-4">
            {stepHead("2", "ช่องทางและข้อความ")}
            <div data-testid="campaign-channel-tabs" className="flex flex-wrap gap-2 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
              {CHANNEL_TABS.map((t) => {
                const on = channels.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => (on && tab === t.key ? toggleChannel(t.key) : on ? setTab(t.key) : toggleChannel(t.key))}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
                    style={
                      tab === t.key
                        ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                        : { color: on ? "var(--color-ink)" : "var(--color-muted)" }
                    }
                    aria-pressed={on}
                  >
                    {on && <MemberIcon name="check" size="sm" />}
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div data-testid="campaign-message" className="flex flex-col gap-2">
              {tab === "EMAIL" && (
                <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input text-sm" aria-label="หัวข้ออีเมล" />
              )}
              {tab === "PUSH" && (
                <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} className="input text-sm" aria-label="หัวข้อแจ้งเตือน" />
              )}
              <textarea
                value={tab === "LINE" ? line : tab === "EMAIL" ? emailBody : tab === "SMS" ? sms : pushBody}
                onChange={(e) =>
                  tab === "LINE"
                    ? setLine(e.target.value)
                    : tab === "EMAIL"
                      ? setEmailBody(e.target.value)
                      : tab === "SMS"
                        ? setSms(e.target.value)
                        : setPushBody(e.target.value)
                }
                rows={4}
                className="input text-sm"
                aria-label="ข้อความที่จะส่ง"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
                ตัวแปร:
                {CAMPAIGN_VARS.map((v) => (
                  <span key={v.token} className="rounded-lg border px-2 py-0.5" style={{ borderColor: "var(--color-line)" }} title={v.label}>
                    {v.token}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn text-sm" disabled title="ผู้ช่วย AI ร่างข้อความให้ — เปิดใช้ที่ M3.10">
                <MemberIcon name="bolt" size="sm" /> ให้ AI ร่าง
              </button>
              <select
                data-testid="campaign-voucher"
                value={voucherId}
                onChange={(e) => setVoucherId(e.target.value)}
                className="input text-sm"
                aria-label="แนบ voucher"
              >
                <option value="">ไม่แนบ voucher</option>
                {vouchers.map((v) => (
                  <option key={v.id} value={v.id}>
                    voucher {v.name} ({v.kindLabel})
                  </option>
                ))}
              </select>
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="คูปองโค้ด: เช่น SUMMER300"
                className="input text-sm"
                aria-label="คูปองโค้ด"
              />
            </div>

            <label data-testid="campaign-ab-toggle" className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" checked={abOn} onChange={(e) => setAbOn(e.target.checked)} />
              ทดสอบข้อความ B (A/B 50/50)
            </label>
            {abOn && (
              <textarea
                value={lineB}
                onChange={(e) => setLineB(e.target.value)}
                rows={3}
                placeholder="ข้อความแบบ B — ครึ่งหนึ่งของผู้รับจะได้ข้อความนี้แทน"
                className="input text-sm"
                aria-label="ข้อความแบบ B"
              />
            )}
          </section>

          {/* ── ขั้น 3 ── */}
          <section data-testid="campaign-step-schedule" className="card flex flex-col gap-3 p-4">
            {stepHead("3", "กำหนดส่ง")}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} />
                <MemberIcon name="clock" size="sm" /> ตั้งเวลา
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={!scheduleOn}
                className="input min-w-0 flex-1 text-sm"
                aria-label="วันเวลาที่จะส่ง"
              />
            </div>
            <div data-testid="campaign-holdout" className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={holdoutOn} onChange={(e) => setHoldoutOn(e.target.checked)} />
                กันกลุ่มเทียบ (holdout)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={holdoutPct}
                onChange={(e) => setHoldoutPct(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                disabled={!holdoutOn}
                className="input w-20 text-sm"
                aria-label="สัดส่วนกลุ่มเทียบเป็นเปอร์เซ็นต์"
              />
              <span style={{ color: "var(--color-muted)" }}>% — ไม่ส่งให้ ใช้วัดผลจริง</span>
            </div>
          </section>
        </div>

        {/* ── แผงขวา ── */}
        <aside className="flex min-w-0 flex-col gap-4">
          <section className="card flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MemberIcon name="chat" size="sm" /> ตัวอย่างหน้าจอ LINE
            </span>
            <div data-testid="campaign-preview-line" className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
              <span className="flex items-center gap-2 text-xs font-medium">
                <MemberIcon name="chat" size="sm" /> {shopName}
              </span>
              <p className="mt-2 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--color-bg)" }}>
                {previewText}
              </p>
              {voucher && (
                <div className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
                  <div className="px-3 py-1.5 text-xs" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
                    VOUCHER · แคมเปญ
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <strong className="text-base">{baht(voucher.value)}</strong>
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {voucher.name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card flex flex-col gap-2 p-4">
            <span className="text-sm font-semibold">ประมาณการ</span>
            <div data-testid="campaign-estimate" className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--color-line)" }}>
                <strong className="block text-lg tabular-nums">{willSend.toLocaleString("th-TH")}</strong>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  จะส่งจริง
                </span>
              </div>
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--color-line)" }}>
                <strong className="block text-lg tabular-nums">{holdoutCount.toLocaleString("th-TH")}</strong>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  หัก holdout
                </span>
              </div>
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--color-line)" }}>
                <strong className="block text-lg tabular-nums">{baht(maxCostSatang)}</strong>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ต้นทุนสูงสุด
                </span>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              คาดใช้สิทธิ์จริง 25–40% จากสถิติแคมเปญที่ผ่านมา
            </p>
          </section>

          <button data-testid="campaign-test-send" type="button" className="btn text-sm" disabled={busy} onClick={testSend}>
            ทดสอบส่งหาตัวเอง
          </button>
        </aside>
      </div>
    </div>
  );
}

export default CampaignWizard;
