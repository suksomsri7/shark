"use client";

// MemberApiSettings.tsx — "สมาชิก › ตั้งค่า › API" (M1.11 · ภาพ ledger/design-member/27 ครึ่งขวา)
//
// เลย์เอาต์ตามภาพ 27 ขวา จากบนลงล่าง:
//   1. คีย์ API ของระบบสมาชิก + ปุ่ม "สร้างคีย์"  (ตาราง: ชื่อ · ชุดสิทธิ์ · ใช้ล่าสุด · หมดอายุ)
//   2. กล่องดำตัวอย่าง curl 3 เส้น (อ่าน · สมัคร · ระดับ)
//   3. เครื่องมือของสกิล AI `members` + ลิงก์ manifest/OpenAPI/คู่มือนักพัฒนา
//   4. Webhook: event ของระบบสมาชิกที่สมัครรับได้
//
// 🔴 คีย์ดิบแสดง **ครั้งเดียว** (DB เก็บแต่ hash) — ข้อความบนจอต้องบอกให้ชัดก่อนผู้ใช้ปิดหน้า
// 🔴 ชุดสิทธิ์อธิบายด้วยคำที่เจ้าของร้านเข้าใจ ไม่ใช่รายชื่อ scope ดิบ · และต้องบอกตรง ๆ ว่า
//    ชุดอ่าน/ชุดหน้าร้าน **ไม่เห็นข้อมูลอ่อนไหว** (§6.3) เพราะนั่นคือคำถามแรกที่เจ้าของร้านถาม

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MemberApiActionResult, MemberKeyResult } from "@/lib/modules/member/api-actions";

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
}: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string>("member-read");
  const [formOpen, setFormOpen] = useState(false);

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
                    <span className="rounded-full border px-2 py-0.5 text-xs">{KIND_TH[t.kind]}</span>
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

      {/* ── 4. Webhook ──────────────────────────────────────────────── */}
      <section className="card flex flex-col gap-3 p-5" data-testid="member-api-webhooks">
        <div>
          <h2 className="text-sm font-medium">Webhook</h2>
          <p className={`mt-1 ${help}`}>
            ให้ SHARK ยิงกลับไปหาระบบของคุณเมื่อมีอะไรเปลี่ยน — ตั้งปลายทางและเลือกเหตุการณ์ได้ที่{" "}
            <Link href="/app/settings/integrations" className="text-[color:var(--color-accent)] underline">
              ตั้งค่าร้าน › แอปภายนอก
            </Link>{" "}
            · เนื้อที่ส่งไปมีแต่รหัสอ้างอิง ไม่มีชื่อหรือเบอร์ของลูกค้า
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {events.map((e) => (
            <li key={e.value} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded border px-1.5 py-0.5 font-mono text-xs">{e.value}</code>
              <span className={help}>{e.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
