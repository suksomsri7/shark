"use client";

// CrmApiSettings.tsx — "CRM › ตั้งค่า › API" (ใบ C1.10 · ภาพ 14 ขวา · โครงเดียวกับหน้า API ของระบบสมาชิก)
//
// จากบนลงล่าง: คีย์ API ของ CRM + "สร้างคีย์" (ชุดสิทธิ์ 3 ชุด · ตัวกรองทีม) · กล่อง curl · เครื่องมือของสกิล AI `crm` ·
//   webhook ของ CRM (ปลายทาง + เพิ่ม URL + secret แสดงครั้งเดียว) · การส่งล่าสุด
// 🔴 คีย์ดิบ/secret แสดงครั้งเดียว (ฐานเก็บแต่ hash) · ข้อความผิดพลาดแสดงใต้ฟอร์ม (ไม่ใช้ alert)
// 🔴 ไฟล์ 'use client' — import ได้เฉพาะชนิดบริสุทธิ์ (`./shared`) · action มาทาง props

import { useState, useTransition } from "react";
import { CRM_KEY_BUNDLES, type CrmActionResult, type CrmApiKeyRow, type CrmApiToolRow, type CrmBundleScopeRow, type CrmKeyResult, type CrmWebhookCreateResult, type CrmWebhookDeliveryRow, type CrmWebhookRow } from "./shared";

type Props = {
  systemId: string;
  keys: CrmApiKeyRow[];
  teams: { id: string; name: string }[];
  tools: CrmApiToolRow[];
  opCount: number;
  /** CRM C2.11 ▸ จำนวนคีย์สิทธิ์จริงของแต่ละชุด + คีย์ที่เฟส C2 เพิ่มเข้ามา (อีเมล · ลำดับ · คะแนน · ลิงก์ · กฎ) ◂ */
  bundleScopes: CrmBundleScopeRow[];
  events: { value: string; label: string }[];
  webhooks: CrmWebhookRow[];
  deliveries: CrmWebhookDeliveryRow[];
  createKey: (fd: FormData) => Promise<CrmKeyResult>;
  revokeKey: (fd: FormData) => Promise<CrmActionResult>;
  createWebhook: (fd: FormData) => Promise<CrmWebhookCreateResult>;
  toggleWebhook: (fd: FormData) => Promise<CrmActionResult>;
  deleteWebhook: (fd: FormData) => Promise<CrmActionResult>;
};

const help = "text-xs text-[color:var(--color-muted)]";
const cell = "py-2 pr-3 align-top text-sm";
const head = "py-1.5 pr-3 text-left text-xs font-medium text-[color:var(--color-muted)]";
const btn = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-50";
const input = "w-full rounded-md border px-2 py-1.5 text-sm";
const KIND_TH: Record<CrmApiToolRow["kind"], string> = { read: "อ่าน (ทำทันที)", write: "เขียน (รอคนยืนยัน)", danger: "อันตราย" };

const CURL = [
  "# ทดสอบคีย์",
  'curl -sS "https://shark.in.th/api/v1/crm/ping" -H "Authorization: Bearer $SHARK_API_KEY"',
  "",
  "# เพิ่ม lead ใหม่ (คำสั่งเขียนต้องมี Idempotency-Key เสมอ)",
  'curl -sS -X POST "https://shark.in.th/api/v1/crm/contacts" \\',
  '  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\',
  '  -H "Content-Type: application/json" \\',
  `  -d '{"firstName":"สมชาย","phone":"0812345678","sourceKind":"WEB_FORM"}'`,
  "",
  "# ดีลในกระดาน (ต่อขั้น)",
  'curl -sS "https://shark.in.th/api/v1/crm/deals/board" -H "Authorization: Bearer $SHARK_API_KEY"',
].join("\n");

/**
 * CRM C2.11 ▸ " · N สิทธิ์ (เฟส C2 เพิ่ม: อีเมล ลำดับการติดตาม คะแนน …)" ต่อท้ายคำอธิบายของชุดสิทธิ์
 *   ตัวเลขและรายชื่อมาจาก `API_SCOPE_BUNDLES` ตัวจริง (คำนวณฝั่งเซิร์ฟเวอร์) — ไม่มีรายการที่พิมพ์มือให้เก่า ◂
 */
const C2_GROUP_TH: Record<string, string> = {
  email: "อีเมล",
  sequence: "ลำดับการติดตาม",
  assignment: "แจกลีด",
  score: "คะแนนลูกค้า",
  tracking: "ลิงก์/เว็บ",
  automation: "กฎอัตโนมัติ",
};

function scopeNote(rows: CrmBundleScopeRow[], id: string): string {
  const row = rows.find((r) => r.id === id);
  if (!row) return "";
  const groups = [...new Set(row.newInC2.map((s) => s.split(".")[1] ?? ""))].map((g) => C2_GROUP_TH[g] ?? g).filter(Boolean);
  return ` · ${row.count} สิทธิ์${groups.length > 0 ? ` (รวม ${groups.join(" · ")})` : ""}`;
}

export function CrmApiSettings(p: Props) {
  const [pending, start] = useTransition();
  const [keyOpen, setKeyOpen] = useState(false);
  const [bundle, setBundle] = useState<string>("crm.readonly");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookMsg, setHookMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(["crm.deal.won", "crm.contact.created"].filter((e) => p.events.some((x) => x.value === e)));

  const run = <T extends { ok: boolean }>(fn: () => Promise<T>, done: (r: T) => void) => start(async () => done(await fn()));

  const onCreateKey = (fd: FormData) => {
    fd.set("systemId", p.systemId);
    fd.set("bundle", bundle);
    run(() => p.createKey(fd), (r) => {
      if (r.ok) {
        setRawKey(r.rawKey);
        setKeyMsg({ ok: true, text: "สร้างคีย์แล้ว — คัดลอกเก็บไว้ตอนนี้ ระบบจะไม่แสดงคีย์นี้อีก" });
        setKeyOpen(false);
      } else setKeyMsg({ ok: false, text: r.reason });
    });
  };
  const onRevoke = (id: string) => {
    const fd = new FormData();
    fd.set("systemId", p.systemId);
    fd.set("keyId", id);
    run(() => p.revokeKey(fd), (r) => setKeyMsg(r.ok ? { ok: true, text: "เพิกถอนคีย์แล้ว — คำขอถัดไปของคีย์นี้จะถูกปฏิเสธ" } : { ok: false, text: r.reason }));
  };
  const onCreateHook = (fd: FormData) => {
    fd.set("systemId", p.systemId);
    fd.delete("events");
    for (const e of picked) fd.append("events", e);
    run(() => p.createWebhook(fd), (r) => {
      if (r.ok) {
        setSecret(r.secret);
        setHookMsg({ ok: true, text: "เพิ่มปลายทางแล้ว — คัดลอก secret ไว้ตรวจลายเซ็น ระบบจะไม่แสดงอีก" });
        setHookOpen(false);
      } else setHookMsg({ ok: false, text: r.reason });
    });
  };
  const hookAction = (fn: (fd: FormData) => Promise<CrmActionResult>, id: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("systemId", p.systemId);
    fd.set("endpointId", id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    run(() => fn(fd), (r) => setHookMsg(r.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: r.reason }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="crm-api-page">
      {/* ── คีย์ API ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-api-keys">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">คีย์ API ของ CRM</h2>
          <button type="button" className={btn} onClick={() => setKeyOpen((v) => !v)} disabled={pending} data-testid="crm-api-new" aria-expanded={keyOpen}>
            สร้างคีย์
          </button>
        </div>
        <p className={help}>คีย์ใช้กับระบบ CRM นี้เท่านั้น · ทำได้ {p.opCount} คำสั่งตามชุดสิทธิ์ที่เลือก · ระบบภายนอกส่งคีย์ในส่วนหัว Authorization</p>
        {keyOpen ? (
          <form action={onCreateKey} className="flex flex-col gap-3 rounded-md border p-3" data-testid="crm-api-key-form">
            <label className="flex flex-col gap-1 text-sm">
              ชื่อคีย์
              <input name="name" maxLength={100} required className={input} placeholder="เช่น ฟอร์มหน้าเว็บ — lead" data-testid="crm-api-key-name" />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">ชุดสิทธิ์</legend>
              {CRM_KEY_BUNDLES.map((b) => (
                <label key={b.id} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="bundlePick" value={b.id} checked={bundle === b.id} onChange={() => setBundle(b.id)} data-testid={`crm-api-key-bundle-${b.id}`} />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    {/* CRM C2.11 ▸ ต่อท้ายคำอธิบายเดิมด้วยตัวเลขจริงจากทะเบียนชุดสิทธิ์ (ไม่เพิ่มแถวใหม่ — ภาพ 14 ขวาคงรูปเดิม) ◂ */}
                    <span className={`block ${help}`}>
                      {b.help}
                      {scopeNote(p.bundleScopes, b.id)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              จำกัดให้เห็นเฉพาะทีม (ไม่บังคับ)
              <select name="teamId" className={input} defaultValue="" data-testid="crm-api-key-team">
                <option value="">ทุกทีม (ตามชุดสิทธิ์)</option>
                {p.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btn} disabled={pending} data-testid="crm-api-key-submit">
                สร้างคีย์
              </button>
            </div>
          </form>
        ) : null}
        {keyMsg ? (
          <p className={`text-sm ${keyMsg.ok ? "" : "text-[color:var(--color-danger)]"}`} role="status" data-testid="crm-api-key-msg">
            {keyMsg.text}
          </p>
        ) : null}
        {rawKey ? <code className="block break-all rounded-md border p-2 text-xs">{rawKey}</code> : null}
        <div className="overflow-x-auto">
          <table className="w-full md:min-w-[520px]">
            <thead>
              <tr>
                <th className={head}>ชื่อ</th>
                <th className={head}>ชุดสิทธิ์</th>
                <th className={head}>ใช้ล่าสุด</th>
                <th className={head}>หมดอายุ</th>
                <th className={head}>
                  <span className="sr-only">จัดการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.keys.length === 0 ? (
                <tr>
                  <td className={cell} colSpan={5}>
                    <span className={help}>ยังไม่มีคีย์ของ CRM</span>
                  </td>
                </tr>
              ) : (
                p.keys.map((k) => (
                  <tr key={k.id} className="border-t">
                    <td className={cell}>
                      {k.name}
                      <span className={`block ${help}`}>{k.prefix}…</span>
                    </td>
                    <td className={cell}>
                      {k.bundleLabel}
                      {k.filterLabel ? <span className={`block ${help}`}>{k.filterLabel}</span> : null}
                    </td>
                    <td className={cell}>{k.lastUsedLabel}</td>
                    <td className={cell}>{k.expiresLabel}</td>
                    <td className={cell}>
                      <button type="button" className={btn} disabled={pending} onClick={() => onRevoke(k.id)} data-testid={`crm-api-key-revoke-${k.id}`} aria-label={`เพิกถอนคีย์ ${k.name}`}>
                        เพิกถอน
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ตัวอย่าง curl ── */}
      <section className="card flex min-w-0 flex-col gap-2 p-4">
        <h2 className="text-sm font-medium">ตัวอย่างการเรียก</h2>
        <pre className="overflow-x-auto rounded-md bg-black p-3 text-xs text-white" data-testid="crm-api-curl">
          {CURL}
        </pre>
        <p className={help}>คู่มือเต็ม: /api/v1/crm/openapi.json (ไม่ต้องใช้คีย์) · docs/api/CRM-API.md</p>
      </section>

      {/* ── เครื่องมือของผู้ช่วย AI ── */}
      <section className="card flex min-w-0 flex-col gap-2 p-4">
        <h2 className="text-sm font-medium">เครื่องมือของผู้ช่วย AI (สกิล crm · {p.tools.length} ตัว)</h2>
        <p className={help}>ผู้ช่วยอ่านได้เท่าสิทธิ์ของคนที่ถาม · คำสั่งเขียนทุกตัวเป็นข้อเสนอที่ต้องมีคนกดยืนยันก่อน · manifest: /api/v1/ai/skills/crm</p>
        <div className="overflow-x-auto">
          <table className="w-full md:min-w-[480px]">
            <thead>
              <tr>
                <th className={head}>เครื่องมือ</th>
                <th className={head}>ชนิด</th>
                <th className={head}>สิทธิ์</th>
              </tr>
            </thead>
            <tbody>
              {p.tools.map((t) => (
                <tr key={t.name} className="border-t">
                  <td className={cell}>
                    <code className="text-xs">{t.name}</code>
                    <span className={`block ${help}`}>{t.label}</span>
                  </td>
                  <td className={cell}>{KIND_TH[t.kind]}</td>
                  <td className={cell}>
                    <code className="text-xs">{t.scope}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Webhook ── */}
      <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-api-webhooks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Webhook ของ CRM</h2>
          <button type="button" className={btn} onClick={() => setHookOpen((v) => !v)} disabled={pending} data-testid="crm-api-hook-new" aria-expanded={hookOpen}>
            เพิ่ม URL
          </button>
        </div>
        <p className={help}>ส่งเฉพาะรหัสอ้างอิง (ไม่มีเบอร์ อีเมล ชื่อ) · ลงลายเซ็น X-Shark-Signature และ X-Shark-Signature-V2 ด้วย secret ของปลายทาง</p>
        {hookOpen ? (
          <form action={onCreateHook} className="flex flex-col gap-3 rounded-md border p-3" data-testid="crm-api-hook-form">
            <label className="flex flex-col gap-1 text-sm">
              ที่อยู่ปลายทาง (https://)
              <input name="url" type="url" maxLength={500} required className={input} placeholder="https://example.com/hooks/shark" data-testid="crm-api-hook-url" />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm">เหตุการณ์ที่จะรับ</legend>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {p.events.map((e) => (
                  <label key={e.value} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={picked.includes(e.value)}
                      onChange={(ev) => setPicked((cur) => (ev.target.checked ? [...cur, e.value] : cur.filter((x) => x !== e.value)))}
                      data-testid={`crm-api-hook-event-${e.value}`}
                    />
                    <span>
                      <code>{e.value}</code> {e.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button type="submit" className={btn} disabled={pending} data-testid="crm-api-hook-submit">
                บันทึกปลายทาง
              </button>
            </div>
          </form>
        ) : null}
        {hookMsg ? (
          <p className={`text-sm ${hookMsg.ok ? "" : "text-[color:var(--color-danger)]"}`} role="status" data-testid="crm-api-hook-msg">
            {hookMsg.text}
          </p>
        ) : null}
        {secret ? <code className="block break-all rounded-md border p-2 text-xs">{secret}</code> : null}
        <div className="overflow-x-auto">
          <table className="w-full md:min-w-[560px]">
            <thead>
              <tr>
                <th className={head}>ปลายทาง</th>
                <th className={head}>เหตุการณ์</th>
                <th className={head}>ส่งล่าสุด</th>
                <th className={head}>
                  <span className="sr-only">จัดการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.webhooks.length === 0 ? (
                <tr>
                  <td className={cell} colSpan={4}>
                    <span className={help}>ยังไม่มีปลายทางของ CRM</span>
                  </td>
                </tr>
              ) : (
                p.webhooks.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td className={`${cell} break-all`}>
                      {w.url}
                      <span className={`block ${help}`}>{w.active ? "เปิดใช้" : "พักไว้"}</span>
                    </td>
                    <td className={cell}>{w.events.length} เหตุการณ์</td>
                    <td className={cell}>{w.lastLabel ? `${w.lastLabel} · ${w.lastStatus === "FAILED" ? "ไม่สำเร็จ" : "สำเร็จ"}` : "ยังไม่เคยส่ง"}</td>
                    <td className={cell}>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={btn} disabled={pending} onClick={() => hookAction(p.toggleWebhook, w.id, { active: w.active ? "false" : "true" })} data-testid={`crm-api-hook-toggle-${w.id}`}>
                          {w.active ? "พักไว้" : "เปิดใช้"}
                        </button>
                        <button type="button" className={btn} disabled={pending} onClick={() => hookAction(p.deleteWebhook, w.id)} data-testid={`crm-api-hook-delete-${w.id}`} aria-label={`ลบปลายทาง ${w.url}`}>
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── การส่งล่าสุด ── */}
      <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-api-deliveries">
        <h2 className="text-sm font-medium">การส่งล่าสุด (Deliveries)</h2>
        <div className="overflow-x-auto">
          <table className="w-full md:min-w-[480px]">
            <thead>
              <tr>
                <th className={head}>เวลา</th>
                <th className={head}>เหตุการณ์</th>
                <th className={head}>ผล</th>
              </tr>
            </thead>
            <tbody>
              {p.deliveries.length === 0 ? (
                <tr>
                  <td className={cell} colSpan={3}>
                    <span className={help}>ยังไม่มีการส่ง</span>
                  </td>
                </tr>
              ) : (
                p.deliveries.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className={cell}>{d.atLabel}</td>
                    <td className={cell}>
                      <code className="text-xs">{d.eventType}</code>
                    </td>
                    <td className={cell}>
                      {d.status === "OK" ? "สำเร็จ" : "ไม่สำเร็จ"} · {d.attempts} ครั้ง
                      {d.lastError ? <span className={`block ${help}`}>{d.lastError}</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
