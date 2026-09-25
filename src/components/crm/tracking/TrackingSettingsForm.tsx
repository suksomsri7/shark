"use client";

// TrackingSettingsForm.tsx — หน้าตั้งค่า "ติดตามเว็บ + ลิงก์ติดตาม" (ใบ C2.6 · ภาพ 16 + ลิงก์ของภาพ 11)
//
// 🔴 ทุกปุ่ม/ช่องกรอกมี `data-testid` (ทะเบียน `scripts/crm-ui-inventory.json` แถว wo C2.6)
// 🔴 ข้อความผิดพลาดขึ้น **inline** ใต้ส่วนที่เกี่ยวข้อง — ห้าม alert() (กติกา COMMON)
// 🔴 ใช้งานได้ทั้ง 1440 และ 390 (คอลัมน์เดียวบนมือถือ · ตารางลิงก์กลายเป็นการ์ด · ไม่มีล้นแนวนอน)
// 🔴 หน้านี้ไม่รู้จัก prisma/โมดูล CRM เลย — เรียก server action ของหน้า (`../../settings/tracking/actions`) เท่านั้น (F2.3)

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTrackedLink,
  deleteTrackedLink,
  saveTrackingWeb,
  trackedLinkQr,
  updateTrackedLink,
} from "@/app/app/sys/[id]/crm/settings/tracking/actions";
import type { CrmTrackLinkRow, CrmTrackingPageData } from "./types";

const card = "card flex min-w-0 flex-col gap-3 p-4";
const input = "min-w-0 rounded-lg border px-3 py-2 text-sm text-[color:var(--color-ink)] bg-[color:var(--color-surface)]";
const btn = "rounded-lg border px-3 py-2 text-sm font-medium";
const btnMain = "rounded-lg bg-[color:var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60";

/**
 * ค่านี้เป็น `<svg>` เปล่า ๆ ที่แปะลงหน้าได้ไหม (รีวิวรอบ 2 · N8)
 * 🔴 ชุดกฎเดียวกับ `isBareSvg` ของฝั่งเซิร์ฟเวอร์ — เขียนซ้ำที่นี่เพราะคอมโพเนนต์ import ไฟล์ในโมดูล CRM ไม่ได้ (F2.3)
 *    และด่านฝั่งนี้มีค่าเฉพาะตอนที่ฝั่งเซิร์ฟเวอร์พลาด (ซึ่งคือเหตุผลที่ต้องมีสองชั้น)
 */
function isBareSvgClient(svg: unknown): boolean {
  const s = typeof svg === "string" ? svg.trim() : "";
  if (!s || s.length > 200_000 || !s.startsWith("<svg") || !s.endsWith("</svg>")) return false;
  return !/<\s*(script|foreignObject|iframe|object|embed|use|image|a)\b/i.test(s) && !/\son[a-z]+\s*=/i.test(s) && !/javascript:|data:text\/html/i.test(s);
}

export function TrackingSettingsForm({ data }: { data: CrmTrackingPageData }) {
  const router = useRouter();
  const [s, setS] = useState(data.settings);
  const [links, setLinks] = useState<CrmTrackLinkRow[]>(data.links);
  const [domain, setDomain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [qr, setQr] = useState<{ id: string; svg: string } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [delReason, setDelReason] = useState("");

  async function save(patch: Parameters<typeof saveTrackingWeb>[1]) {
    setBusy(true);
    setErr(null);
    setNote(null);
    const r = await saveTrackingWeb(data.systemId, patch);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return false;
    }
    setS(r.data);
    setNote("บันทึกแล้ว");
    router.refresh();
    return true;
  }

  async function addLink() {
    setLinkErr(null);
    if (!linkUrl.trim()) {
      setLinkErr("ใส่ลิงก์ปลายทางก่อนนะ (ขึ้นต้นด้วย https://)");
      return;
    }
    setBusy(true);
    const r = await createTrackedLink(data.systemId, { url: linkUrl.trim(), name: linkName.trim() || null, code: linkCode.trim() || null });
    setBusy(false);
    if (!r.ok) {
      setLinkErr(r.error);
      return;
    }
    setLinks([r.data, ...links]);
    setLinkUrl("");
    setLinkName("");
    setLinkCode("");
    router.refresh();
  }

  async function toggle(row: CrmTrackLinkRow) {
    setBusy(true);
    const r = await updateTrackedLink(data.systemId, row.id, { active: !row.active });
    setBusy(false);
    if (!r.ok) {
      setLinkErr(r.error);
      return;
    }
    setLinks(links.map((l) => (l.id === row.id ? r.data : l)));
  }

  async function showQr(row: CrmTrackLinkRow) {
    setBusy(true);
    const r = await trackedLinkQr(data.systemId, row.id);
    setBusy(false);
    if (!r.ok) {
      setLinkErr(r.error);
      return;
    }
    setQr({ id: row.id, svg: r.data.svg });
  }

  /** ลบลิงก์ = งานอันตราย (X9): ยืนยัน + เหตุผล **inline** บนหน้า (ไม่มี alert/confirm ของเบราว์เซอร์) */
  async function remove(row: CrmTrackLinkRow) {
    setBusy(true);
    const r = await deleteTrackedLink(data.systemId, row.id, { confirm: true, reason: delReason });
    setBusy(false);
    if (!r.ok) {
      setLinkErr(r.error);
      return;
    }
    setLinks(links.filter((l) => l.id !== row.id));
    setDelId(null);
    setDelReason("");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-tracking-page">
      {/* ── สคริปต์ติดตาม + cookie consent ── */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">ติดตามเว็บไซต์ของร้าน (cookie consent)</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => void save({ enabled: e.target.checked })}
              data-testid="crm-track-web-enabled"
              aria-label="เปิดการติดตามเว็บ"
            />
            <span>{s.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}</span>
          </label>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          ระบบเก็บเฉพาะหน้าที่ลูกค้าเปิดและ utm ของลิงก์ — <strong>ไม่เก็บ IP เต็ม</strong> (เก็บเป็นค่าที่ย้อนกลับไม่ได้) และเก็บได้เฉพาะเมื่อลูกค้ากด “ยอมรับ”
        </p>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium">โดเมนที่อนุญาต</span>
          <div className="flex min-w-0 flex-wrap gap-2">
            {s.domains.map((d) => (
              <span key={d} className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
                {d}
                <button
                  type="button"
                  className="text-[color:var(--color-danger)]"
                  onClick={() => void save({ domains: s.domains.filter((x) => x !== d) })}
                  data-testid={`crm-track-domain-remove-${d}`}
                  aria-label={`ลบโดเมน ${d}`}
                >
                  ✕
                </button>
              </span>
            ))}
            {s.domains.length === 0 && <span className="text-xs text-[color:var(--color-muted)]">ยังไม่มีโดเมน — ใส่ชื่อเว็บของร้าน เช่น shop.example.com</span>}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input
              className={`${input} flex-1`}
              placeholder="shop.example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              data-testid="crm-track-domain-input"
              aria-label="โดเมนที่อนุญาต"
            />
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={async () => {
                const d = domain.trim();
                if (!d) {
                  setErr("ใส่ชื่อโดเมนก่อนนะ (เช่น shop.example.com)");
                  return;
                }
                if (await save({ domains: [...s.domains, d] })) setDomain("");
              }}
              data-testid="crm-track-domain-add"
            >
              เพิ่มโดเมน
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium">ข้อความแจ้งเรื่อง cookie consent</span>
          <textarea
            className={input}
            rows={3}
            value={s.consentText}
            onChange={(e) => setS({ ...s, consentText: e.target.value })}
            data-testid="crm-track-consent-text"
            aria-label="ข้อความ cookie consent"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
            <span>เวอร์ชันความยินยอมปัจจุบัน {s.consentVersion}</span>
            <button
              type="button"
              className={btn}
              disabled={busy}
              onClick={() => void save({ bumpConsentVersion: true })}
              data-testid="crm-track-consent-version-bump"
            >
              ขอความยินยอมใหม่ (เวอร์ชันถัดไป)
            </button>
            <button type="button" className={btn} onClick={() => setPreview(!preview)} data-testid="crm-track-preview">
              ดูตัวอย่างแบนเนอร์
            </button>
          </div>
          {preview && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--color-ink)] p-3 text-xs text-white" data-testid="crm-track-preview-box">
              <span className="min-w-0 flex-1 break-words">{s.consentText}</span>
              <span className="flex shrink-0 gap-2">
                <span className="rounded border px-2 py-1">ปฏิเสธ</span>
                <span className="rounded bg-[color:var(--color-accent)] px-2 py-1">ยอมรับ</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span>เก็บข้อมูลการเข้าชมกี่วัน</span>
            <input
              className={`${input} w-28`}
              type="number"
              min={data.limits.retentionMin}
              max={data.limits.retentionMax}
              value={s.retentionDays}
              onChange={(e) => setS({ ...s, retentionDays: Number(e.target.value) })}
              data-testid="crm-track-retention"
              aria-label="อายุการเก็บข้อมูลการเข้าชม (วัน)"
            />
          </label>
          <button
            type="button"
            className={btnMain}
            disabled={busy}
            onClick={() => void save({ consentText: s.consentText, retentionDays: s.retentionDays })}
            data-testid="crm-track-save"
          >
            บันทึกการตั้งค่า
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium">โค้ดฝัง (วางก่อนปิด &lt;/body&gt; ของเว็บร้าน)</span>
          <textarea className={`${input} font-mono text-xs`} rows={2} readOnly value={s.embedCode || "เปิดการติดตามก่อนเพื่อรับโค้ดฝัง"} data-testid="crm-track-embed-code" aria-label="โค้ดฝัง" />
        </div>

        {err && (
          <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-track-error">
            {err}
          </p>
        )}
        {note && <p className="text-xs text-[color:var(--color-accent)]">{note}</p>}
      </section>

      {/* ── สถิติ ── */}
      <section className={card} data-testid="crm-track-stats">
        <h2 className="text-sm font-semibold">30 วันที่ผ่านมา</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-lg font-semibold">{data.stats.sessions}</div>
            <div className="text-xs text-[color:var(--color-muted)]">การเข้าชม</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{data.stats.consented}</div>
            <div className="text-xs text-[color:var(--color-muted)]">ยอมรับคุกกี้</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{data.stats.identified}</div>
            <div className="text-xs text-[color:var(--color-muted)]">รู้ว่าเป็นใคร</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{data.stats.webLeads}</div>
            <div className="text-xs text-[color:var(--color-muted)]">lead จากเว็บ</div>
          </div>
        </div>
      </section>

      {/* ── ลิงก์ติดตาม ── */}
      <section className={card}>
        <h2 className="text-sm font-semibold">ลิงก์ติดตาม</h2>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            <span>ลิงก์ปลายทาง</span>
            <input className={input} placeholder="https://shop.example.com/promo" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} data-testid="crm-link-url" aria-label="ลิงก์ปลายทาง" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-40">
            <span>ชื่อเรียก</span>
            <input className={input} placeholder="โปรเดือนนี้" value={linkName} onChange={(e) => setLinkName(e.target.value)} data-testid="crm-link-name" aria-label="ชื่อลิงก์" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs sm:w-36">
            <span>รหัสที่อยากได้</span>
            <input className={input} placeholder="b2b-sep" value={linkCode} onChange={(e) => setLinkCode(e.target.value)} data-testid="crm-link-code" aria-label="รหัสลิงก์" />
          </label>
          <button type="button" className={btnMain} disabled={busy} onClick={() => void addLink()} data-testid="crm-link-create">
            สร้างลิงก์
          </button>
        </div>
        {linkErr && (
          <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-link-error">
            {linkErr}
          </p>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          {links.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีลิงก์ติดตาม</p>}
          {links.map((l) => (
            <div key={l.id} className="flex min-w-0 flex-col gap-1 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:justify-between" data-testid={`crm-link-row-${l.id}`}>
              <div className="min-w-0">
                <div className="truncate font-medium">{l.name ?? l.code}</div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">{l.shortUrl} → {l.url}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span>
                  {l.clicks} คลิก · {l.uniqueClicks} คน
                </span>
                <button type="button" className={btn} onClick={() => void showQr(l)} data-testid={`crm-link-qr-${l.id}`}>
                  QR
                </button>
                <button type="button" className={btn} onClick={() => void toggle(l)} data-testid={`crm-link-toggle-${l.id}`}>
                  {l.active ? "ปิด" : "เปิด"}
                </button>
                <button
                  type="button"
                  className={`${btn} text-[color:var(--color-danger)]`}
                  onClick={() => {
                    setLinkErr(null);
                    setDelReason("");
                    setDelId(delId === l.id ? null : l.id);
                  }}
                  data-testid={`crm-link-delete-${l.id}`}
                >
                  ลบ
                </button>
              </div>
              {delId === l.id && (
                <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-[color:var(--color-surface-2)] p-2 text-xs sm:flex-row sm:items-center" data-testid={`crm-link-delete-confirm-${l.id}`}>
                  <span className="min-w-0">ลบแล้วลิงก์และ QR ที่พิมพ์ไปแล้วจะกดไม่ได้อีก — ใส่เหตุผล (อย่างน้อย 5 ตัวอักษร)</span>
                  <input
                    className={`${input} min-w-0 flex-1`}
                    value={delReason}
                    onChange={(e) => setDelReason(e.target.value)}
                    data-testid={`crm-link-delete-reason-${l.id}`}
                    aria-label="เหตุผลที่ลบลิงก์"
                  />
                  <button type="button" className={`${btn} text-[color:var(--color-danger)]`} disabled={busy} onClick={() => void remove(l)} data-testid={`crm-link-delete-yes-${l.id}`}>
                    ยืนยันลบ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {qr && (
          <div className="flex flex-col items-center gap-2" data-testid="crm-link-qr-box">
            {/* 🔴 (รีวิวรอบ 2 · N8) นี่คือจุดเดียวของหน้านี้ที่เขียน HTML ตรง ๆ — เหตุผลที่ปลอดภัย + ด่านกันพลาด:
                (1) ค่านี้ไม่ได้มาจากผู้ใช้เลย: เซิร์ฟเวอร์สร้างจาก `${appUrl()}/l/<code>` (รหัสเป็น [A-Za-z0-9_-] ล้วน)
                (2) ฝั่งเซิร์ฟเวอร์ (`linkQrSvg`) โยนทิ้งถ้าผลลัพธ์ไม่ใช่ `<svg>` เปล่า ๆ (ไม่มี script/on*=)
                (3) ที่นี่ตรวจ **ซ้ำอีกชั้น** ก่อนแปะ — ถ้าวันหนึ่งมีทางอื่นเขียนค่าลง state นี้ หน้าจะขึ้นข้อความแทน
                    ไม่ใช่ยิงสคริปต์บนเบราว์เซอร์ของเจ้าของร้าน (คนที่มีสิทธิ์มากที่สุดในร้าน) */}
            {isBareSvgClient(qr.svg) ? (
              <div className="w-40" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            ) : (
              <p className="text-sm text-[color:var(--color-danger)]" role="alert">
                แสดงภาพ QR ไม่ได้ — ใช้ลิงก์สั้นด้านบนไปก่อนได้เลย
              </p>
            )}
            <button type="button" className={btn} onClick={() => setQr(null)} data-testid="crm-link-qr-close">
              ปิด
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
