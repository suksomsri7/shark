"use client";

// ApiKeysPanel.tsx — "ตั้งค่า › API" ของบอร์ดงาน (K1.15 · D18)
//
// UI เล็ก ตามแบบเดียวกับ `ConnectionsPanel` ของบัญชี: เลือก 1 ใน 3 ชุดสิทธิ์ → ตั้งชื่อ → ออกคีย์
// 🔴 โชว์คีย์ดิบครั้งเดียวเท่านั้น (DB เก็บแต่ hash) — ข้อความบนจอต้องบอกให้ชัดก่อนผู้ใช้ปิดหน้า
// 🔴 ชุดสิทธิ์ = "บทบาทบนบอร์ด" ของคีย์ (D18) ⇒ อธิบายด้วยคำที่เจ้าของร้านเข้าใจ (ดู/ทำงาน/ผู้ดูแล)
//    ไม่ใช่รายชื่อ scope ดิบ

import Link from "next/link";
import { useState, useTransition } from "react";
import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
import type {
  KanbanActionResult,
  KanbanKeyResult,
} from "@/lib/modules/kanban/settings-actions";

export type KanbanApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  bundleLabel: string;
  expiresLabel: string;
  lastUsedLabel: string;
};

type Props = {
  systemId: string;
  keys: KanbanApiKeyRow[];
  createKey: (fd: FormData) => Promise<KanbanKeyResult>;
  revokeKey: (fd: FormData) => Promise<KanbanActionResult>;
};

const help = "text-xs text-[color:var(--color-muted)]";

/** คำอธิบายไทยของชุดสิทธิ์บอร์ดงาน — แปลจาก `summary` (อังกฤษ) ของ scopes.ts เก็บไว้ที่นี่ที่เดียว */
const BUNDLE_HELP_TH: Record<string, string> = {
  "kanban-read": "อ่านทุกบอร์ดของระบบนี้ได้อย่างเดียว (เหมือนผู้ชม) — เหมาะกับแดชบอร์ด/รายงานภายนอก",
  "kanban-edit": "อ่านได้ + สร้าง/แก้/ย้าย/เก็บการ์ด คอลัมน์ ป้าย ความเห็น ไฟล์แนบ (เหมือนสมาชิกที่แก้ไขได้ทุกบอร์ด)",
  "kanban-admin": "ทำได้ทุกอย่างของชุดก่อนหน้า + จัดการสมาชิกบอร์ด เก็บบอร์ด/คอลัมน์ เทมเพลต และกฎอัตโนมัติ",
};

const KANBAN_BUNDLES = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("kanban-"));

export function ApiKeysPanel({ systemId, keys, createKey, revokeKey }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<string>("kanban-edit");

  return (
    <div className="flex flex-col gap-4" data-testid="kanban-api-panel">
      {msg && (
        <p
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
          data-testid="kanban-api-msg"
        >
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}

      <section className="card flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-sm font-medium">คีย์ API ของบอร์ดงาน</h2>
          <p className={`mt-1 ${help}`}>
            ให้โปรแกรมภายนอกหรือผู้ช่วย AI ของคุณเอง อ่าน/สร้าง/ย้ายการ์ดในระบบบอร์ดงานนี้ได้ —
            คีย์ทำงานได้ทุกบอร์ดของระบบนี้ตามชุดสิทธิ์ที่เลือก เก็บคีย์ให้ดีเหมือนรหัสผ่าน
          </p>
        </div>

        {rawKey && (
          <div className="rounded-lg border p-3 text-sm" data-testid="kanban-api-key-new">
            <div className={help}>คัดลอกคีย์นี้เก็บไว้ตอนนี้ — ปิดหน้าแล้วจะดูไม่ได้อีก</div>
            <code className="mt-1 block select-all break-all font-mono text-xs">{rawKey}</code>
          </div>
        )}

        <div className="flex flex-col gap-2" data-testid="kanban-api-key-list">
          {keys.map((k) => (
            <div
              key={k.id}
              data-testid={`kanban-api-key-row-${k.id}`}
              className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
            >
              <div className="min-w-0 sm:w-44 sm:shrink-0">
                <div className="truncate font-medium">{k.name}</div>
                <div className={`truncate font-mono ${help}`}>ตัวขึ้นต้น {k.prefix}…</div>
              </div>
              <div className="sm:w-52 sm:shrink-0">
                <div className={`sm:hidden ${help}`}>ชุดสิทธิ์</div>
                <div>{k.bundleLabel}</div>
              </div>
              <div className="sm:w-28 sm:shrink-0">
                <div className={`sm:hidden ${help}`}>หมดอายุ</div>
                <div>{k.expiresLabel}</div>
              </div>
              <div className="sm:w-32 sm:shrink-0">
                <div className={`sm:hidden ${help}`}>ใช้ล่าสุด</div>
                <div>{k.lastUsedLabel}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm w-fit"
                disabled={pending}
                data-testid={`kanban-api-key-revoke-${k.id}`}
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
            </div>
          ))}
          {keys.length === 0 && (
            <div className="py-5 text-center text-[color:var(--color-muted)]">ยังไม่มีคีย์ — สร้างคีย์แรกด้านล่าง</div>
          )}
        </div>

        <form
          className="flex flex-col gap-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("systemId", systemId);
            start(async () => {
              const res = await createKey(fd);
              if (res.ok) {
                setRawKey(res.rawKey);
                setMsg({ ok: true, text: "บันทึกแล้ว" });
              } else setMsg({ ok: false, text: res.reason });
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ชื่อคีย์
            <input name="name" className="input" placeholder="เช่น ระบบแจ้งงานของช่าง" data-testid="kanban-api-key-name" />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className={`mb-1 ${help}`}>ชุดสิทธิ์ — กำหนดว่าคีย์นี้ทำอะไรได้บนทุกบอร์ดของระบบนี้</legend>
            {KANBAN_BUNDLES.map((b) => (
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
                  data-testid={`kanban-api-key-bundle-${b.id}`}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{b.label}</span>
                  <span className={`block ${help}`}>{BUNDLE_HELP_TH[b.id] ?? b.summary}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="flex w-fit flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันหมดอายุ
            <select name="ttlDays" defaultValue="365" className="input" data-testid="kanban-api-key-ttl">
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
              data-testid="kanban-api-key-submit"
              className="btn btn-sm min-h-[40px] bg-[color:var(--color-ink)] text-[color:var(--color-surface)] sm:min-h-0"
            >
              สร้างคีย์
            </button>
          </div>

          <p className={help}>
            วิธีเรียกใช้ ตัวอย่าง curl และรายการคำสั่งทั้งหมดอยู่ในคู่มือนักพัฒนาที่{" "}
            <Link href="/developers/kanban" target="_blank" className="text-[color:var(--color-accent)] underline">
              /developers/kanban
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
