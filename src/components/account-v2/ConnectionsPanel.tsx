"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { RowActions } from "./RowActions";
import { useSetBreadcrumbTail } from "./breadcrumb-tail";
import type { ConnectionCard } from "@/lib/modules/account/connections";
import {
  API_SCOPE_BUNDLES,
  ACCOUNT_SCOPE_KEYS,
  DEFAULT_BUNDLE_ID,
  expandBundles,
  bundleLabelForScopes,
  type ApiScopeBundleId,
} from "@/lib/api-keys/scopes";
import { permissionLabel } from "@/lib/core/permissions";

// ─────────────────────────────────────────────────────────────
// หน้า "ตั้งค่า › การเชื่อมต่อ" (SPEC §9.5 · เฟรม g14-settings-connections.png)
//   ?s=shark → การ์ดต่อระบบใน SHARK (สถานะ · ตัวเลือก · บัญชีที่ใช้ · เมนู ⋯)
//   ?s=etax  → e-Tax Invoice (จาง 🕓 — ขอบเขตที่ประกาศไม่ทำในรอบนี้ BLUEPRINT §0.4)
//   ?s=api   → คีย์ API · webhook · Zapier/Make · bank feed 🕓
// ─────────────────────────────────────────────────────────────

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revoked: boolean;
  /** [] = คีย์รุ่นเดิมก่อน A1 (อ่าน API กลางแบบเดิม) */
  scopes: string[];
  /** ป้ายไทยของสมุดบัญชีที่ผูก · "ทั้งร้าน" เมื่อไม่ผูก */
  systemLabel: string;
  /** "ไม่หมดอายุ" หรือวันที่ไทยที่ format แล้ว */
  expiresLabel: string;
  /** "ยังไม่เคยใช้" หรือวันที่ไทยที่ format แล้ว */
  lastUsedLabel: string;
};
export type WebhookRow = { id: string; url: string; active: boolean; events: string[]; secret: string };
export type DeliveryRow = { id: string; url: string; event: string; status: string; at: string };

export type ConnectionsPanelProps = {
  systemId: string;
  base: string;
  sub: string;
  subLabel: string;
  cards: ConnectionCard[];
  soonCards: readonly { label: string; icon: string; hint: string }[];
  mappingHref: string;
  /** ลิงก์ "ดูรายการที่ลง" ต่อ kind — เป็น map ไม่ใช่ฟังก์ชัน (ฟังก์ชันข้ามไป client component ไม่ได้) */
  recentHrefs: Record<string, string>;
  apiKeys: ApiKeyRow[];
  webhooks: WebhookRow[];
  deliveries: DeliveryRow[];
  accountEvents: readonly { value: string; label: string }[];
  connect: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  disconnect: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  setOption: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  createKey: (fd: FormData) => Promise<{ ok: true; rawKey: string } | { ok: false; reason: string }>;
  revokeKey: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  rotateKey: (fd: FormData) => Promise<{ ok: true; rawKey: string } | { ok: false; reason: string }>;
  createHook: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  updateHook: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  testHook: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  nav: React.ReactNode;
  mobileNav: React.ReactNode;
  showMobileNavOnly: boolean;
};

const helpCls = "text-xs text-[color:var(--color-muted)]";

export function ConnectionsPanel(p: ConnectionsPanelProps) {
  useSetBreadcrumbTail(p.subLabel);
  // เฟรม g14: ปุ่ม [ยกเลิก][✓ บันทึก] อยู่ระดับหน้า (เหนือเมนูซ้าย+การ์ด) แต่สถานะ "ยังไม่บันทึก" เกิดในการ์ด
  // ⇒ ยกสถานะขึ้นมาที่นี่แล้วส่งลงไป (ปุ่มกับสวิตช์ต้องเป็นความจริงชุดเดียวกัน)
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shared = { dirty, setDirty, pending, start, msg, setMsg };
  const body =
    p.sub === "api" ? <ApiSection {...p} /> : p.sub === "etax" ? <EtaxSection /> : <SharkSection {...p} {...shared} />;
  const hasDirty = Object.keys(dirty).length > 0;
  const saveAll = () =>
    start(async () => {
      for (const [k, on] of Object.entries(dirty)) {
        const [kind, option] = k.split(":");
        const card = p.cards.find((c) => c.kind === kind);
        if (!card?.linkedId) continue;
        const fd = new FormData();
        fd.set("systemId", p.systemId);
        fd.set("kind", kind);
        fd.set("linkedId", card.linkedId);
        fd.set("option", option);
        fd.set("on", on ? "1" : "0");
        const res = await p.setOption(fd);
        if (!res.ok) {
          setMsg({ ok: false, text: res.reason });
          return;
        }
      }
      setDirty({});
      setMsg({ ok: true, text: "บันทึกแล้ว" });
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        {p.sub === "shark" && (
          // มือถือก็ต้องกดบันทึกได้ (หน้านี้ไม่มีปุ่มบันทึกท้ายการ์ด) ⇒ แสดงเสมอ ไม่ใช่ md:flex
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDirty({});
                setMsg(null);
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={pending || !hasDirty}
              onClick={saveAll}
              data-testid="connections-save"
              className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            >
              <AccountIcon name="check" className="h-4 w-4" />
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="hidden md:block">{p.nav}</div>
        {p.showMobileNavOnly && <div className="md:hidden">{p.mobileNav}</div>}
        <div className={`min-w-0 flex-1 ${p.showMobileNavOnly ? "hidden md:block" : ""}`}>
          <Link
            href={`${p.base}/settings/connections`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted)] md:hidden"
          >
            ← หัวข้อตั้งค่า
          </Link>
          {body}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ระบบใน SHARK (เฟรม g14) ───────────────────────────

function StatusChip({ status, label }: { status: ConnectionCard["status"]; label: string }) {
  const cls =
    status === "linked"
      ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
      : status === "unlinked"
        ? "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"
        : "border-[color:var(--color-line)] text-[color:var(--color-muted)] opacity-70";
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${cls}`} data-testid="conn-status">
      {label}
    </span>
  );
}

type SharedState = {
  dirty: Record<string, boolean>;
  setDirty: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pending: boolean;
  start: React.TransitionStartFunction;
  msg: { ok: boolean; text: string } | null;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
};

function SharkSection(p: ConnectionsPanelProps & SharedState) {
  const { dirty, setDirty, pending, start, msg, setMsg } = p;
  // ตัวเลือกบนการ์ดแก้ในหน้าแล้วกด "บันทึก" ทีเดียว (ตรงเฟรม g14 ที่มีปุ่มบันทึกมุมขวาบน)
  // ส่วน "เชื่อม/ตัดการเชื่อม" มีผลทันที เพราะเป็นคนละการกระทำและมีปุ่มของตัวเองในเฟรม

  const optionOf = (kind: string, key: string, fallback: boolean) => dirty[`${kind}:${key}`] ?? fallback;
  const setOption = (kind: string, key: string, on: boolean) => {
    setDirty((prev) => ({ ...prev, [`${kind}:${key}`]: on }));
    setMsg(null);
  };
  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason ?? "ทำรายการไม่สำเร็จ" });
    });

  const post = (fields: Record<string, string>, fn: (fd: FormData) => Promise<{ ok: boolean; reason?: string }>) => {
    const fd = new FormData();
    fd.set("systemId", p.systemId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fn(fd);
  };


  return (
    <section className="card flex flex-col gap-4 p-5" data-testid="connections-shark">
      <div>
        <h2 className="text-sm font-medium">การเชื่อมต่อ · ระบบใน SHARK</h2>
        <p className={`mt-1 ${helpCls}`}>สมุดบัญชีเล่มนี้รับข้อมูลจากระบบต่อไปนี้อัตโนมัติ</p>
      </div>

      {msg && (
        <p
          data-testid="connections-msg"
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
        >
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {p.cards.map((c) => (
          <div
            key={c.kind}
            data-testid={`conn-card-${c.kind}`}
            className={`flex flex-col gap-3 rounded-xl border p-4 ${c.status === "no-system" ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                <AccountIcon name={c.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
              <StatusChip status={c.status} label={c.statusLabel} />
              {c.status === "linked" && (
                <RowActions
                  trigger="icon"
                  testId={`conn-menu-${c.kind}`}
                  items={[
                    { label: "ดูรายการที่ลง", icon: "list", href: p.recentHrefs[c.kind] ?? `${p.base}/journal` },
                    {
                      label: "ตัดการเชื่อม",
                      icon: "link",
                      danger: true,
                      onClick: () => run(() => post({ kind: c.kind, linkedId: c.linkedId ?? "" }, p.disconnect)),
                    },
                  ]}
                />
              )}
            </div>

            <div className={helpCls}>
              <div>{c.hint}</div>
              {c.status === "linked" && (
                <div data-testid={`conn-activity-${c.kind}`}>
                  {c.lastPostedText
                    ? `ลงบัญชีล่าสุด ${c.lastPostedText} · ${c.monthCount} รายการเดือนนี้`
                    : "ยังไม่มีรายการที่ลงบัญชี"}
                </div>
              )}
            </div>

            {c.status === "linked" && (
              <>
                <div className="flex flex-col">
                  {c.toggles.map((t) => {
                    const on = optionOf(c.kind, t.key, t.on);
                    return (
                      <label
                        key={t.key}
                        className="flex cursor-pointer items-center gap-3 border-t py-2.5 first:border-t-0 first:pt-0"
                      >
                        {/* สวิตช์แบบ pill ตามเฟรม g14 (เปิด = ดำ · ปิด = เทา) — checkbox จริงซ่อนไว้ให้ยังกด/อ่านค่าได้ */}
                        <span
                          aria-hidden
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            on ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"
                          }`}
                        >
                          <span
                            className={`absolute h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
                          />
                        </span>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={() => setOption(c.kind, t.key, !on)}
                          data-testid={`conn-toggle-${c.kind}-${t.key}`}
                          className="sr-only"
                        />
                        <span className="text-sm">
                          {t.label}
                          {on ? "" : " (ปิดอยู่)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
                  <span>
                    บัญชีที่ใช้ <span className="font-medium">{c.accountCodes.join(" / ")}</span>
                  </span>
                  <Link href={p.mappingHref} className="text-[color:var(--color-accent)]">
                    แก้ไข
                  </Link>
                </div>
              </>
            )}

            {c.status === "unlinked" && (
              <div>
                <button
                  type="button"
                  disabled={pending}
                  data-testid={`conn-connect-${c.kind}`}
                  onClick={() => run(() => post({ kind: c.kind, linkedId: c.linkedId ?? "" }, p.connect))}
                  className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                >
                  <AccountIcon name="link" className="h-4 w-4" />
                  เชื่อม
                </button>
              </div>
            )}

            {c.status === "no-system" && (
              <div>
                <button type="button" disabled className="btn btn-ghost btn-sm" title="ต้องเปิดระบบนี้ในร้านก่อน">
                  เปิดระบบก่อน
                </button>
              </div>
            )}
          </div>
        ))}

        {p.soonCards.map((c) => (
          <div key={c.label} className="flex flex-col gap-3 rounded-xl border p-4 opacity-60" data-testid={`conn-soon-${c.label}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                <AccountIcon name={c.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
              <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
                ยังไม่มีระบบ
              </span>
            </div>
            <div className={helpCls}>{c.hint}</div>
            <div>
              <button type="button" disabled className="btn btn-ghost btn-sm">
                เปิดระบบก่อน
              </button>
            </div>
          </div>
        ))}
      </div>

      <p
        className="flex items-start gap-2 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-3 text-sm"
        data-testid="connections-safety"
      >
        <AccountIcon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">กติกาความปลอดภัย:</span> ระบบที่ยังไม่เชื่อมจะไม่ลงบัญชีให้ (ไม่เชื่อม = ไม่ลงบัญชีให้)
        </span>
      </p>
    </section>
  );
}

// ─────────────────────────── e-Tax Invoice (🕓) ───────────────────────────

function EtaxSection() {
  return (
    <section className="card flex flex-col gap-2 p-5 opacity-70" data-testid="connections-etax">
      <h2 className="text-sm font-medium">e-Tax Invoice</h2>
      <p className={helpCls}>
        ส่งใบกำกับภาษีอิเล็กทรอนิกส์ให้กรมสรรพากรโดยตรง — ต้องผูกผู้ให้บริการภายนอกก่อน จึงยังไม่เปิดใช้ในรอบนี้
      </p>
      <span className="w-fit rounded-md border px-2 py-0.5 text-xs">เร็ว ๆ นี้</span>
    </section>
  );
}

// ─────────────────────────── แอปภายนอก / API ───────────────────────────

/** สรุปชุดสิทธิ์แบบไทย ประโยคเดียว — แปลจาก `summary` (อังกฤษ) ของ scopes.ts เก็บไว้ที่นี่ที่เดียว */
const BUNDLE_HELP_TH: Record<ApiScopeBundleId, string> = {
  "read-only": "อ่านเอกสาร สมุดรายวัน และรายงานภาษี/การเงินได้อย่างเดียว ไม่มีสิทธิ์เขียนใด ๆ",
  "issue-and-collect": "ทำได้ทุกอย่างในชุดอ่านอย่างเดียว บวกสร้าง/ออกเอกสาร บันทึกรับเงิน และจัดการผู้ติดต่อ/สินค้า",
  accountant: "ทำได้ทุกอย่างในชุดออกเอกสารและรับเงิน บวกงานปิดงวด ผังบัญชี สินทรัพย์ เช็ค และกระทบยอดธนาคาร",
  danger: "การกระทำที่ย้อนกลับยาก เช่น ยกเลิกเอกสาร เปิดงวดที่ปิดแล้ว หรือรวมผู้ติดต่อซ้ำ",
  settings: "แก้ตั้งค่าระบบบัญชีและนำเข้าข้อมูล",
};

function ApiSection(p: ConnectionsPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState<ApiScopeBundleId>(DEFAULT_BUNDLE_ID);
  const [checkedScopes, setCheckedScopes] = useState<Set<string>>(
    () => new Set(expandBundles([DEFAULT_BUNDLE_ID])),
  );
  const [scopesOpen, setScopesOpen] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason ?? "ทำรายการไม่สำเร็จ" });
    });

  const selectBundle = (id: ApiScopeBundleId) => {
    setBundleId(id);
    setCheckedScopes(new Set(expandBundles([id])));
  };
  const toggleScope = (key: string) => {
    setCheckedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="connections-api">
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`} data-testid="connections-msg">
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}

      <section className="card flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-sm font-medium">คีย์ API</h2>
          <p className={`mt-1 ${helpCls}`}>
            ให้โปรแกรมภายนอกเรียกข้อมูลบัญชีเล่มนี้ได้ผ่าน API — เลือกชุดสิทธิ์และวันหมดอายุที่เหมาะกับงาน แล้วเก็บคีย์ให้ดีเหมือนรหัสผ่าน
          </p>
        </div>

        {rawKey && (
          <div className="rounded-lg border p-3 text-sm" data-testid="api-key-new">
            <div className={helpCls}>คัดลอกคีย์นี้เก็บไว้ตอนนี้ — ปิดหน้าแล้วจะดูไม่ได้อีก</div>
            <code className="mt-1 block select-all break-all font-mono text-xs">{rawKey}</code>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {p.apiKeys.map((k) => (
            <div
              key={k.id}
              data-testid={`api-key-row-${k.id}`}
              className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:px-0 sm:py-2.5 last:sm:border-b-0"
            >
              <div className="min-w-0 sm:w-40 sm:shrink-0">
                <div className="truncate font-medium">{k.name}</div>
                <div className={`truncate font-mono text-xs ${helpCls}`}>ตัวขึ้นต้น {k.prefix}…</div>
              </div>
              <div className="sm:w-44 sm:shrink-0">
                <div className={`sm:hidden ${helpCls}`}>ขอบเขต</div>
                <div data-testid={`api-key-row-bundle-${k.id}`}>{bundleLabelForScopes(k.scopes)}</div>
              </div>
              <div className="sm:w-36 sm:shrink-0">
                <div className={`sm:hidden ${helpCls}`}>สมุดบัญชี</div>
                <div data-testid={`api-key-row-system-${k.id}`}>{k.systemLabel}</div>
              </div>
              <div className="sm:w-28 sm:shrink-0">
                <div className={`sm:hidden ${helpCls}`}>หมดอายุ</div>
                <div data-testid={`api-key-row-expires-${k.id}`}>{k.expiresLabel}</div>
              </div>
              <div className="sm:w-32 sm:shrink-0">
                <div className={`sm:hidden ${helpCls}`}>ใช้ล่าสุด</div>
                <div>{k.lastUsedLabel}</div>
              </div>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                {k.revoked ? (
                  <span className={helpCls}>เพิกถอนแล้ว</span>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      className="btn btn-ghost btn-sm"
                      data-testid={`api-key-rotate-${k.id}`}
                      onClick={() =>
                        run(async () => {
                          const fd = new FormData();
                          fd.set("systemId", p.systemId);
                          fd.set("id", k.id);
                          const res = await p.rotateKey(fd);
                          if (res.ok) setRawKey(res.rawKey);
                          return res;
                        })
                      }
                    >
                      หมุน
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="btn btn-ghost btn-sm"
                      data-testid={`api-key-revoke-${k.id}`}
                      onClick={() =>
                        run(() => {
                          const fd = new FormData();
                          fd.set("systemId", p.systemId);
                          fd.set("id", k.id);
                          return p.revokeKey(fd);
                        })
                      }
                    >
                      เพิกถอน
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {p.apiKeys.length === 0 && (
            <div className="py-5 text-center text-[color:var(--color-muted)]">ยังไม่มีคีย์ — สร้างคีย์แรกด้านล่าง</div>
          )}
        </div>

        <form
          className="flex flex-col gap-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("systemId", p.systemId);
            start(async () => {
              const res = await p.createKey(fd);
              if (res.ok) {
                setRawKey(res.rawKey);
                setMsg({ ok: true, text: "บันทึกแล้ว" });
              } else setMsg({ ok: false, text: res.reason });
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ชื่อคีย์
            <input name="name" className="input" placeholder="เช่น สำนักงานบัญชี" data-testid="api-key-name" />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className={`mb-1 ${helpCls}`}>ชุดสิทธิ์ (bundle) — ติ๊กเพิ่ม/ลดรายตัวได้ด้านล่าง</legend>
            {API_SCOPE_BUNDLES.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-[color:var(--color-ink)]"
              >
                <input
                  type="radio"
                  name="bundle"
                  value={b.id}
                  checked={bundleId === b.id}
                  onChange={() => selectBundle(b.id)}
                  data-testid={`api-key-bundle-${b.id}`}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{b.label}</span>
                  <span className={`block ${helpCls}`}>{BUNDLE_HELP_TH[b.id]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันหมดอายุ
              <select name="ttlDays" defaultValue="365" className="input" data-testid="api-key-ttl">
                <option value="30">30 วัน</option>
                <option value="90">90 วัน</option>
                <option value="365">365 วัน</option>
                <option value="0">ไม่หมดอายุ</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="api-key-scopes-toggle"
              onClick={() => setScopesOpen((o) => !o)}
            >
              {scopesOpen ? "ซ่อนสิทธิ์รายตัว" : "ดู/แก้สิทธิ์รายตัว"}
            </button>
          </div>

          {scopesOpen && (
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              {ACCOUNT_SCOPE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scope"
                    value={key}
                    checked={checkedScopes.has(key)}
                    onChange={() => toggleScope(key)}
                    data-testid={`api-key-scope-${key}`}
                  />
                  {permissionLabel(key)}
                </label>
              ))}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={pending}
              data-testid="api-key-submit"
              className="btn btn-sm min-h-[40px] bg-[color:var(--color-ink)] text-[color:var(--color-surface)] sm:min-h-0"
            >
              สร้างคีย์
            </button>
          </div>

          <p className={helpCls}>
            คีย์ที่สร้างจากที่นี่ผูกกับสมุดบัญชีเล่มนี้เสมอ — ดูวิธีเรียกใช้ในคู่มือนักพัฒนาที่{" "}
            <Link href="/developers/account" target="_blank" className="text-[color:var(--color-accent)] underline">
              /developers/account
            </Link>
          </p>
        </form>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <div>
          <h2 className="text-sm font-medium">Webhook (แจ้งเหตุการณ์บัญชีไปยังระบบอื่น)</h2>
          <p className={`mt-1 ${helpCls}`}>ระบบจะยิงข้อมูลไปที่อยู่ปลายทางทันทีเมื่อเกิดเหตุการณ์ พร้อมลายเซ็นตรวจสอบ</p>
        </div>

        <table className="w-full text-sm" data-testid="webhook-table">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 pr-3 font-normal">ปลายทาง</th>
              <th className="py-2 pr-3 font-normal">เหตุการณ์</th>
              <th className="py-2 font-normal">ทำรายการ</th>
            </tr>
          </thead>
          <tbody>
            {p.webhooks.map((w) => (
              <tr key={w.id} className="border-b last:border-b-0">
                <td className="py-2.5 pr-3">
                  <div className="break-all font-medium">{w.url}</div>
                  <div className={helpCls}>{w.active ? "เปิดอยู่" : "ปิดอยู่"}</div>
                </td>
                <td className="py-2.5 pr-3">{w.events.length === 0 ? "ทุกเหตุการณ์" : w.events.join(" · ")}</td>
                <td className="py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      data-testid={`webhook-toggle-${w.id}`}
                      onClick={() =>
                        run(() => {
                          const fd = new FormData();
                          fd.set("systemId", p.systemId);
                          fd.set("id", w.id);
                          fd.set("op", w.active ? "off" : "on");
                          return p.updateHook(fd);
                        })
                      }
                    >
                      {w.active ? "ปิด" : "เปิด"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      data-testid={`webhook-test-${w.id}`}
                      onClick={() =>
                        run(() => {
                          const fd = new FormData();
                          fd.set("systemId", p.systemId);
                          fd.set("type", w.events[0] ?? "account.document.approved");
                          return p.testHook(fd);
                        })
                      }
                    >
                      ยิงทดสอบ
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-[color:var(--color-danger)]"
                      disabled={pending}
                      onClick={() =>
                        run(() => {
                          const fd = new FormData();
                          fd.set("systemId", p.systemId);
                          fd.set("id", w.id);
                          fd.set("op", "delete");
                          return p.updateHook(fd);
                        })
                      }
                    >
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {p.webhooks.length === 0 && (
              <tr>
                <td colSpan={3} className="py-5 text-center text-[color:var(--color-muted)]">
                  ยังไม่มีปลายทาง — เพิ่มปลายทางแรกด้านล่าง
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("systemId", p.systemId);
            run(() => p.createHook(fd));
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ที่อยู่ปลายทาง (URL)
            <input name="url" className="input" placeholder="https://example.com/hooks/shark" data-testid="webhook-url" />
          </label>
          <fieldset className="flex flex-wrap gap-3">
            <legend className={helpCls}>เหตุการณ์บัญชีที่จะส่ง (ไม่เลือก = ทุกเหตุการณ์)</legend>
            {p.accountEvents.map((e) => (
              <label key={e.value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="events" value={e.value} className="h-4 w-4" />
                {e.label}
              </label>
            ))}
          </fieldset>
          <div>
            <button type="submit" disabled={pending} className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
              เพิ่มปลายทาง
            </button>
          </div>
        </form>

        <div>
          <h3 className="text-sm font-medium">การส่งล่าสุด</h3>
          <table className="mt-2 w-full text-sm" data-testid="webhook-delivery-table">
            <tbody>
              {p.deliveries.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3 break-all">{d.url}</td>
                  <td className="py-2 pr-3">{d.event}</td>
                  <td className="py-2 pr-3">{d.status}</td>
                  <td className="py-2">{d.at}</td>
                </tr>
              ))}
              {p.deliveries.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-[color:var(--color-muted)]">ยังไม่มีการส่ง</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-sm font-medium">เชื่อมกับแอปอื่น</h2>
        <p className={helpCls}>
          Zapier / Make ต่อกับ SHARK ผ่าน &ldquo;คีย์ API + webhook&rdquo; ด้านบน — สร้างคีย์ 1 อัน แล้วใส่ที่อยู่ปลายทางของ Zap
          ในตาราง webhook
        </p>
        <div className="flex items-center justify-between gap-2 rounded-lg border p-3 opacity-60">
          <span className="text-sm">ดึงรายการเดินบัญชีจากธนาคารอัตโนมัติ (bank feed)</span>
          <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs">เร็ว ๆ นี้</span>
        </div>
      </section>
    </div>
  );
}

export default ConnectionsPanel;
