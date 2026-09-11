"use client";

// MemberApiSettings.tsx — "สมาชิก › ตั้งค่า › API" (M1.11 · ภาพ ledger/design-member/27 ครึ่งขวา)
//
// เลย์เอาต์ตามภาพ 27 ขวา จากบนลงล่าง:
//   1. คีย์ API ของระบบสมาชิก + ปุ่ม "สร้างคีย์"  (ตาราง: ชื่อ · ชุดสิทธิ์ · ใช้ล่าสุด · หมดอายุ)
//   2. กล่องดำตัวอย่าง curl 3 เส้น (อ่าน · สมัคร · ระดับ)
//   3. เครื่องมือของสกิล AI `members` + ลิงก์ manifest/OpenAPI/คู่มือนักพัฒนา
//   4. Webhook: ปลายทางของระบบสมาชิก (ตาราง url · เหตุการณ์ · สถานะ · ส่งล่าสุด) + ฟอร์ม "เพิ่ม URL"
//      (url https + เลือกเหตุการณ์) + secret ที่แสดงครั้งเดียว + การส่งล่าสุด (M3.10)
//
// 🔴 คีย์ดิบแสดง **ครั้งเดียว** (DB เก็บแต่ hash) — ข้อความบนจอต้องบอกให้ชัดก่อนผู้ใช้ปิดหน้า
// 🔴 ชุดสิทธิ์อธิบายด้วยคำที่เจ้าของร้านเข้าใจ ไม่ใช่รายชื่อ scope ดิบ · และต้องบอกตรง ๆ ว่า
//    ชุดอ่าน/ชุดหน้าร้าน **ไม่เห็นข้อมูลอ่อนไหว** (§6.3) เพราะนั่นคือคำถามแรกที่เจ้าของร้านถาม

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MemberApiActionResult, MemberKeyResult } from "@/lib/modules/member/api-actions";
import type {
  MemberWebhookActionResult,
  MemberWebhookCreateResult,
  MemberWebhookDeliveryRow,
  MemberWebhookRow,
  MemberWebhookTestResult,
} from "@/lib/modules/member/api-shared";
import { MemberIcon } from "@/components/member/MemberIcon";

export type MemberApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  bundleId: string | null;
  bundleLabel: string;
  expiresLabel: string;
  lastUsedLabel: string;
};

export type MemberApiToolRow = {
  name: string;
  method: string;
  kind: "read" | "write" | "danger";
  scope: string;
  label: string;
};

type Props = {
  systemId: string;
  keys: MemberApiKeyRow[];
  tools: MemberApiToolRow[];
  toolCount: number;
  opCount: number;
  events: { value: string; label: string }[];
  createKey: (fd: FormData) => Promise<MemberKeyResult>;
  revokeKey: (fd: FormData) => Promise<MemberApiActionResult>;
  /** M3.10 — ปลายทาง webhook ของระบบสมาชิก + การส่งล่าสุด + action จัดการ */
  webhooks: MemberWebhookRow[];
  deliveries: MemberWebhookDeliveryRow[];
  createWebhook: (fd: FormData) => Promise<MemberWebhookCreateResult>;
  toggleWebhook: (fd: FormData) => Promise<MemberWebhookActionResult>;
  deleteWebhook: (fd: FormData) => Promise<MemberWebhookActionResult>;
  testWebhook: (fd: FormData) => Promise<MemberWebhookTestResult>;
};

const help = "text-xs text-[color:var(--color-muted)]";
const cell = "py-2 pr-3 align-top text-sm";
const head = "py-1.5 pr-3 text-left text-xs font-medium text-[color:var(--color-muted)]";

/** คำอธิบายไทยของชุดสิทธิ์ — แปลจาก `summary` (อังกฤษ) ของ scopes.ts เก็บไว้ที่นี่ที่เดียว */
const BUNDLES: { id: string; label: string; help: string }[] = [
  {
    id: "member-read",
    label: "อ่านอย่างเดียว",
    help: "อ่านรายชื่อสมาชิก ระดับ แต้ม โปรโมชัน และรายงานได้ · เขียนอะไรไม่ได้เลย · ไม่เห็นข้อมูลอ่อนไหว",
  },
  {
    id: "member-operate",
    label: "ทำงานกับสมาชิก",
    help: "อ่านได้ทั้งหมด + สมัคร/แก้ข้อมูลสมาชิก นำเข้ารายชื่อ ประทับสแตมป์ ออกโปรโมชัน ปรับแต้ม ตอบรีวิว · ยังไม่เห็นข้อมูลอ่อนไหว",
  },
  {
    id: "member-admin",
    label: "ผู้ดูแล",
    help: "ทำได้ทุกอย่างของระบบสมาชิก รวมตั้งค่าฟิลด์ ความเป็นส่วนตัว ระดับ และคีย์ API · ชุดเดียวที่เห็นข้อมูลอ่อนไหวได้ตามนโยบายที่ร้านตั้งไว้",
  },
];

const KIND_TH: Record<MemberApiToolRow["kind"], string> = { read: "อ่าน", write: "เขียน", danger: "อันตราย" };

/** สีชิปชนิดของเครื่องมือตามภาพ 27 ขวา (อ่าน = เขียว · เขียน = ฟ้า · อันตราย = แดง) — โทเคนเดิมของ globals.css */
const KIND_TONE: Record<MemberApiToolRow["kind"], string> = {
  read: "var(--color-tag-green)",
  write: "var(--color-tag-blue)",
  danger: "var(--color-tag-red)",
};

/** ตัวอย่าง curl 3 เส้น — path/ฟิลด์ทุกตัวมีอยู่จริงในทะเบียน op (ภาพ 27: กล่องดำใต้ตารางคีย์) */
const CURL_SAMPLE = [
  "# ค้นหาสมาชิกจากชื่อ/เบอร์/รหัส",
  'curl -sS "https://shark.in.th/api/v1/member/members/search?q=สมชาย" \\',
  '  -H "Authorization: Bearer $SHARK_API_KEY"',
  "",
  "# สมัครสมาชิกใหม่ (คำสั่งเขียนต้องมี Idempotency-Key เสมอ)",
  'curl -sS -X POST "https://shark.in.th/api/v1/member/members" \\',
  '  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\',
  '  -H "Content-Type: application/json" \\',
  `  -d '{"phone":"0812345678","firstName":"สมชาย","source":"API"}'`,
  "",
  "# สมาชิกคนนี้ขาดอีกเท่าไรถึงจะเลื่อนระดับ",
  'curl -sS "https://shark.in.th/api/v1/member/members/cus_123/tier" \\',
  '  -H "Authorization: Bearer $SHARK_API_KEY"',
].join("\n");

export function MemberApiSettings({
  systemId,
  keys,
  tools,
  toolCount,
  opCount,
  events,
  createKey,
  revokeKey,
  webhooks,
  deliveries,
  createWebhook,
  toggleWebhook,
  deleteWebhook,
  testWebhook,
}: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string>("member-read");
  const [formOpen, setFormOpen] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookSecret, setHookSecret] = useState<string | null>(null);
  const [hookMsg, setHookMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<string[]>(["member.created", "member.updated"].filter((e) => events.some((x) => x.value === e)));
  const [focusId, setFocusId] = useState<string | null>(null);
  const shownDeliveries = (focusId ? deliveries.filter((d) => d.endpointId === focusId) : deliveries).slice(0, 10);

  const hookAction = (endpointId: string, run: (fd: FormData) => Promise<MemberWebhookActionResult | MemberWebhookTestResult>, extra: Record<string, string> = {}, okText = "บันทึกแล้ว") => {
    const fd = new FormData();
    fd.set("systemId", systemId);
    fd.set("endpointId", endpointId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(async () => {
      const res = await run(fd);
      if (!res.ok) {
        setHookMsg({ ok: false, text: res.reason });
        return;
      }
      if ("delivered" in res) {
        setHookMsg(
          res.delivered
            ? { ok: true, text: "ส่งทดสอบถึงปลายทางแล้ว" }
            : { ok: false, text: `ปลายทางยังรับไม่ได้ — ${res.error ?? "ไม่ทราบสาเหตุ"} (ระบบบันทึกไว้ในการส่งล่าสุดแล้ว)` },
        );
        return;
      }
      setHookMsg({ ok: true, text: okText });
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="member-api-page">
      {msg && (
        <p
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
          data-testid="member-api-msg"
        >
          {msg.ok ? "บันทึกแล้ว" : msg.text}
        </p>
      )}

      {/* ── 1. คีย์ API ─────────────────────────────────────────────── */}
      <section className="card flex flex-col gap-3 p-5" data-testid="member-api-keys">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">คีย์ API ของระบบสมาชิก</h2>
            <p className={`mt-1 ${help}`}>
              ให้เว็บร้าน แอปของคุณเอง หรือผู้ช่วย AI ภายนอก อ่านและแก้ข้อมูลสมาชิกในระบบนี้ได้
              ตามชุดสิทธิ์ที่เลือก — เก็บคีย์ให้ดีเหมือนรหัสผ่าน
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm whitespace-nowrap"
            data-testid="member-api-new"
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? "ปิดฟอร์ม" : "สร้างคีย์"}
          </button>
        </div>

        {rawKey && (
          <div className="rounded-lg border p-3 text-sm" data-testid="member-api-key-new">
            <div className={help}>คัดลอกคีย์นี้เก็บไว้ตอนนี้ — ปิดหน้าแล้วจะดูไม่ได้อีก</div>
            <code className="mt-1 block select-all break-all font-mono text-xs">{rawKey}</code>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className={head}>ชื่อ</th>
                <th className={head}>ชุดสิทธิ์</th>
                <th className={head}>ใช้ล่าสุด</th>
                <th className={head}>หมดอายุ</th>
                <th className={head} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b" data-testid={`member-api-key-row-${k.id}`}>
                  <td className={cell}>
                    <div className="font-medium">{k.name}</div>
                    <div className={`font-mono ${help}`}>ตัวขึ้นต้น {k.prefix}…</div>
                  </td>
                  <td className={cell}>
                    <span className="rounded-full border px-2 py-0.5 text-xs">{k.bundleLabel}</span>
                  </td>
                  <td className={cell}>{k.lastUsedLabel}</td>
                  <td className={cell}>{k.expiresLabel}</td>
                  <td className={cell}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      data-testid={`member-api-key-revoke-${k.id}`}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("systemId", systemId);
                        fd.set("keyId", k.id);
                        start(async () => {
                          const res = await revokeKey(fd);
                          setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason });
                        });
                      }}
                    >
                      เพิกถอน
                    </button>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td className={`${cell} py-5 text-center text-[color:var(--color-muted)]`} colSpan={5}>
                    ยังไม่มีคีย์ — กด &quot;สร้างคีย์&quot; เพื่อออกใบแรก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {formOpen && (
          <form
            className="flex flex-col gap-3 border-t pt-3"
            data-testid="member-api-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("systemId", systemId);
              start(async () => {
                const res = await createKey(fd);
                if (res.ok) {
                  setRawKey(res.rawKey);
                  setMsg({ ok: true, text: "บันทึกแล้ว" });
                  setFormOpen(false);
                } else setMsg({ ok: false, text: res.reason });
              });
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              ชื่อคีย์
              <input name="name" className="input" placeholder="เช่น เว็บร้าน — สมัครสมาชิก" data-testid="member-api-key-name" />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className={`mb-1 ${help}`}>ชุดสิทธิ์ — กำหนดว่าคีย์นี้ทำอะไรได้กับข้อมูลสมาชิกของร้าน</legend>
              {BUNDLES.map((b) => (
                <label
                  key={b.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-[color:var(--color-ink)]"
                >
                  <input
                    type="radio"
                    name="bundle"
                    value={b.id}
                    checked={bundleId === b.id}
                    onChange={() => setBundleId(b.id)}
                    data-testid={`member-api-key-bundle-${b.id}`}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    <span className={`block ${help}`}>{b.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex w-fit flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันหมดอายุ
              <select name="ttlDays" defaultValue="365" className="input" data-testid="member-api-key-ttl">
                <option value="30">30 วัน</option>
                <option value="90">90 วัน</option>
                <option value="365">365 วัน</option>
                <option value="0">ไม่หมดอายุ</option>
              </select>
            </label>

            <div>
              <button
                type="submit"
                disabled={pending}
                data-testid="member-api-key-submit"
                className="btn btn-sm min-h-[40px] bg-[color:var(--color-ink)] text-[color:var(--color-surface)] sm:min-h-0"
              >
                สร้างคีย์
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── 2. ตัวอย่างการเรียก ──────────────────────────────────────── */}
      <section className="card flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-sm font-medium">ตัวอย่างการเรียก</h2>
          <p className={`mt-1 ${help}`}>
            ทุกคำขอแนบ <code>Authorization: Bearer &lt;คีย์&gt;</code> · คำสั่งที่เปลี่ยนข้อมูลต้องมี{" "}
            <code>Idempotency-Key</code> เพื่อกันรายการซ้ำเวลาเน็ตหลุดแล้วยิงใหม่
          </p>
        </div>
        <pre
          data-testid="member-api-curl"
          className="overflow-x-auto whitespace-pre rounded-lg p-3 text-xs"
          style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
        >
          <code>{CURL_SAMPLE}</code>
        </pre>
        <p className={help}>
          รายการคำสั่งทั้งหมด {opCount} รายการ พร้อมตารางฟิลด์และตัวอย่างต่อคำสั่ง อยู่ในคู่มือนักพัฒนา{" "}
          <Link href="/developers/member" target="_blank" className="text-[color:var(--color-accent)] underline">
            /developers/member
          </Link>{" "}
          · สัญญาแบบเครื่องอ่าน{" "}
          <Link href="/api/v1/member/openapi.json" target="_blank" className="text-[color:var(--color-accent)] underline">
            openapi.json
          </Link>{" "}
          · ฉบับข้อความล้วนสำหรับ AI{" "}
          <Link href="/developers/member.md" target="_blank" className="text-[color:var(--color-accent)] underline">
            /developers/member.md
          </Link>
        </p>
      </section>

      {/* ── 3. เครื่องมือของผู้ช่วย AI ────────────────────────────────── */}
      <section className="card flex flex-col gap-3 p-5" data-testid="member-api-tools">
        <div>
          <h2 className="text-sm font-medium">{toolCount} เครื่องมือในสกิล members</h2>
          <p className={`mt-1 ${help}`}>
            manifest สำหรับผู้ช่วย AI ภายนอก (Claude / GPT / n8n) — เครื่องมือที่อ่านอย่างเดียวทำงานทันที
            ส่วนเครื่องมือที่เขียนจะเสนอให้คุณกดยืนยันก่อนเสมอ ไม่ลงมือเอง
          </p>
          <p className={`mt-1 break-words ${help}`}>
            manifest: <code className="break-all font-mono">GET /api/v1/ai/skills/members</code> (แนบคีย์ API ของระบบสมาชิก) · เรียกใช้:{" "}
            <code className="break-all font-mono">POST /api/v1/ai/tools/&lt;ชื่อเครื่องมือ&gt;</code> · ผู้ช่วยในแอป:{" "}
            <Link href={`/app/sys/${systemId}/member/assistant`} className="text-[color:var(--color-accent)] underline">
              หน้าผู้ช่วย AI ของระบบสมาชิก
            </Link>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className={head}>Tool</th>
                <th className={head}>Method</th>
                <th className={head}>ชนิด</th>
                <th className={head}>สิทธิ์ที่ต้องมี</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name} className="border-b">
                  <td className={`${cell} font-mono text-xs`}>{t.name}</td>
                  <td className={`${cell} font-mono text-xs`}>{t.method}</td>
                  <td className={cell}>
                    <span
                      className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs"
                      style={{ color: KIND_TONE[t.kind], borderColor: KIND_TONE[t.kind] }}
                      data-testid={`member-api-tool-kind-${t.kind}`}
                    >
                      {KIND_TH[t.kind]}
                    </span>
                  </td>
                  <td className={`${cell} font-mono text-xs`}>{t.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {toolCount > tools.length && (
          <p className={help}>แสดง {tools.length} จาก {toolCount} เครื่องมือ — รายชื่อครบอยู่ในคู่มือนักพัฒนา</p>
        )}
      </section>

      {/* ── 4. Webhook (M3.10 · ภาพ 27 ขวาล่าง) ─────────────────────────── */}
      <section className="card flex min-w-0 flex-col gap-3 p-5" data-testid="member-api-webhooks">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3" data-testid="member-api-webhook-new">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Webhook</h2>
            <p className={`mt-1 ${help}`}>
              ให้ SHARK ยิงกลับไปหาระบบของคุณเมื่อมีอะไรเปลี่ยนในระบบสมาชิก · เนื้อที่ส่งไปมีแต่รหัสอ้างอิง
              ไม่มีชื่อหรือเบอร์ของลูกค้า · ปลายทางที่รับเหตุการณ์ของระบบอื่นด้วย จัดการได้ที่{" "}
              <Link href="/app/settings/integrations" className="text-[color:var(--color-accent)] underline">
                ตั้งค่าร้าน › แอปภายนอก
              </Link>
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap" onClick={() => setHookOpen((v) => !v)} data-testid="member-api-webhook-add">
            <MemberIcon name={hookOpen ? "x" : "plus"} size="xs" />
            {hookOpen ? "ปิดฟอร์ม" : "เพิ่ม URL"}
          </button>
          {hookOpen && (
            <form
              className="flex w-full min-w-0 flex-col gap-3 border-t pt-3"
              data-testid="member-api-webhook-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("systemId", systemId);
                fd.delete("events");
                for (const ev of picked) fd.append("events", ev);
                start(async () => {
                  const res = await createWebhook(fd);
                  if (res.ok) {
                    setHookSecret(res.secret);
                    setHookMsg({ ok: true, text: "เพิ่มปลายทางแล้ว" });
                    setHookOpen(false);
                  } else setHookMsg({ ok: false, text: res.reason });
                });
              }}
            >
              <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ที่อยู่ปลายทาง (ต้องขึ้นต้นด้วย https://)
                <input name="url" type="url" className="input min-w-0" placeholder="https://example.com/shark-hook" data-testid="member-api-webhook-url" />
              </label>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className={`mb-1 ${help}`}>เหตุการณ์ที่จะรับ (เลือกได้หลายอัน)</legend>
                <div className="grid min-w-0 grid-cols-1 gap-1.5 md:grid-cols-2">
                  {events.map((ev) => (
                    <label key={ev.value} className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked.includes(ev.value)}
                        onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, ev.value] : cur.filter((x) => x !== ev.value)))}
                        data-testid={`member-api-webhook-event-${ev.value}`}
                      />
                      <span className="min-w-0">
                        <code className="break-all font-mono text-xs">{ev.value}</code>
                        <span className={`block ${help}`}>{ev.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={pending} data-testid="member-api-webhook-submit">
                  บันทึกปลายทาง
                </button>
              </div>
            </form>
          )}
        </div>

        {hookMsg && (
          <p className="text-sm" style={{ color: hookMsg.ok ? "var(--color-ink)" : "var(--color-danger)" }} data-testid="member-api-webhook-msg">
            {hookMsg.text}
          </p>
        )}

        {hookSecret && (
          <div className="rounded-lg border p-3 text-sm" data-testid="member-api-webhook-secret">
            <div className={help}>
              รหัสลับสำหรับตรวจลายเซ็น (X-Shark-Signature) — คัดลอกเก็บไว้ตอนนี้ ปิดหน้าแล้วจะดูไม่ได้อีก
            </div>
            <code className="mt-1 block select-all break-all font-mono text-xs">{hookSecret}</code>
          </div>
        )}

        {webhooks.length === 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t pt-3">
            {events.slice(0, 3).map((e) => (
              <code key={e.value} className="rounded border px-1.5 py-0.5 font-mono text-xs">
                {e.value}
              </code>
            ))}
            {events.length > 3 && <span className={help}>+{events.length - 3} event</span>}
            <span className={`w-full ${help}`}>ยังไม่มีปลายทาง — กด &quot;เพิ่ม URL&quot; เพื่อเริ่มรับเหตุการณ์ของระบบสมาชิก</span>
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className={head}>ปลายทาง</th>
                  <th className={head}>เหตุการณ์</th>
                  <th className={head}>สถานะ</th>
                  <th className={head}>ส่งล่าสุด</th>
                  <th className={head} />
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id} className="border-b" data-testid={`member-api-webhook-row-${w.id}`}>
                    <td className={cell}>
                      <button type="button" className="max-w-[16rem] break-all text-left font-mono text-xs underline" onClick={() => setFocusId((cur) => (cur === w.id ? null : w.id))}>
                        {w.url}
                      </button>
                    </td>
                    <td className={cell}>
                      <div className="flex flex-wrap gap-1">
                        {w.events.slice(0, 3).map((ev) => (
                          <code key={ev} className="rounded border px-1.5 py-0.5 font-mono text-xs">
                            {ev}
                          </code>
                        ))}
                        {w.events.length > 3 && <span className={help}>+{w.events.length - 3}</span>}
                      </div>
                    </td>
                    <td className={cell}>
                      <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs" style={w.active ? { color: "var(--color-tag-green)", borderColor: "var(--color-tag-green)" } : undefined}>
                        {w.active ? "ใช้งาน" : "พักไว้"}
                      </span>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {w.lastLabel ? (
                        <span style={{ color: w.lastStatus === "FAILED" ? "var(--color-danger)" : undefined }}>
                          {w.lastLabel} · {w.lastStatus === "FAILED" ? "ส่งไม่ถึง" : "ส่งถึง"}
                        </span>
                      ) : (
                        <span className={help}>ยังไม่เคยส่ง</span>
                      )}
                    </td>
                    <td className={cell}>
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => hookAction(w.id, testWebhook)} data-testid={`member-api-webhook-test-${w.id}`}>
                          ทดสอบ
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => hookAction(w.id, toggleWebhook, { active: w.active ? "false" : "true" }, w.active ? "พักปลายทางแล้ว" : "เปิดใช้ปลายทางแล้ว")}
                        >
                          {w.active ? "พัก" : "เปิดใช้"}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => hookAction(w.id, deleteWebhook, {}, "ลบปลายทางแล้ว")}>
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-2 border-t pt-3" data-testid="member-api-deliveries">
          <h3 className="text-xs font-medium">
            การส่งล่าสุด{focusId ? " — เฉพาะปลายทางที่เลือก" : ""}
          </h3>
          {shownDeliveries.length === 0 ? (
            <p className={help}>ยังไม่มีการส่ง — เหตุการณ์แรกที่ตรงกับปลายทางจะขึ้นที่นี่ (ส่งไม่ถึงระบบลองใหม่ให้สูงสุด 5 ครั้ง)</p>
          ) : (
            <ul className="flex min-w-0 flex-col gap-1">
              {shownDeliveries.map((d) => (
                <li key={d.id} className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                  <span className={help}>{d.atLabel}</span>
                  <code className="break-all font-mono">{d.eventType}</code>
                  <span style={{ color: d.status === "FAILED" ? "var(--color-danger)" : "var(--color-tag-green)" }}>
                    {d.status === "FAILED" ? `ส่งไม่ถึง (ครั้งที่ ${d.attempts})` : "ส่งถึง"}
                  </span>
                  {d.lastError && <span className={`min-w-0 break-words ${help}`}>{d.lastError}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
