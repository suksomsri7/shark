"use client";

// ─────────────────────────────────────────────────────────────
// BookingPolicySettings.tsx — จอง 08 "แม่แบบและนโยบาย" + ชิ้นร่วมของจอตั้งค่าจองคิว (แถวกะทัดรัด · ร่างค่าที่แก้ · เมนูซ้าย) · SVC B.11 §5.0 §5.1
//
// 🔴 แถวค่าตั้งทุกแถวมาจากโมเดล loadSettingsForm (กติกาเหล็ก #16) — ไฟล์นี้ห้ามมีคีย์ค่าตั้ง (ตำแหน่งอยู่ booking-settings-shared.ts)
// 🔴 ห้าม import ค่าจาก @/lib/core/settings · db · prisma · @/lib/modules (ลากถึง server) · ห้าม useRouter (action เรียก refresh())
// 🔴 render ได้ด้วย react-dom/server (ข้อสอบ renderToStaticMarkup) · ใน SSR การ์ด 1–9 ไม่มีตัวแก้ (โผล่เมื่อกดเม็ดค่า)
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RemoveResult, SetResult, SettingIssue } from "@/lib/core/settings/types";
import {
  deepEqual,
  formatFieldValue,
  parseFieldInput,
  submissionFor,
  TABLE_KEY_TH,
  unitLabelTh,
  valueToInputText,
  type SettingsField,
  type SettingsFormModel,
} from "@/components/settings/settings-shared";
import { fieldsOf, type BookingSettingsPage, type PolicyModel } from "./booking-settings-shared";

// ───────────────────────── ชนิด actions (หน้าห่อ bind unitSlug ให้แล้ว) ─────────────────────────

type Fail = { ok: false; code?: string; reason?: string; issues?: SettingIssue[] };
export type BookingSettingsActions = {
  save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>;
  reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult>;
  applyTemplate?(input: { templateKey: string; overwrite: string }): Promise<{ ok: true } | Fail | { ok: true; removed: number }>;
  setStaffService?(input: { staffId: string; serviceId: string; can: boolean; priceSatang: number | null; durationMin: number | null }): Promise<{ ok: true } | Fail>;
  setServiceBooking?(input: { serviceId: string; bufferMin?: number; bookable?: boolean; depositSatang?: number }): Promise<{ ok: true } | Fail>;
  applyRolePreset?(input: { membershipId: string; role: string }): Promise<{ ok: true } | Fail>;
};

export const failText = (r: unknown): string => {
  const x = (r ?? {}) as Fail;
  const issues = Array.isArray(x.issues) ? x.issues.map((i) => i.messageTh).filter(Boolean) : [];
  return issues.join(" · ") || x.reason || "บันทึกไม่สำเร็จ ลองอีกครั้ง";
};

// ───────────────────────── หน้าตา ─────────────────────────

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
export const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60";
export const BTN_PRIMARY = `${BTN} border-transparent bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-surface)]`;
export const BTN_GHOST = `${BTN} bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]`;
export const CARD = "rounded-2xl border bg-[color:var(--color-surface)] p-4 sm:p-5";
export const CHIP = "inline-flex items-center whitespace-nowrap rounded-md bg-[color:var(--color-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-accent)]";
export const MUTED = "text-[color:var(--color-muted)]";
const INPUT = "input min-h-11 w-full min-w-0";

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span className={cx("relative inline-block h-7 w-12 rounded-full transition-colors", checked ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]")}>
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

// ───────────────────────── ร่างค่าที่แก้ (หลายฟอร์มต่อหน้า) ─────────────────────────

const formKey = (m: SettingsFormModel) => `${m.scope}|${m.scopeId}`;

type DraftApi = {
  valueOf(form: SettingsFormModel, f: SettingsField): unknown;
  isFollow(form: SettingsFormModel, key: string): boolean;
  setValue(form: SettingsFormModel, key: string, v: unknown): void;
  setFollow(form: SettingsFormModel, key: string, on: boolean): void;
  dirty: number;
  saving: boolean;
  notice: { ok: boolean; text: string } | null;
  save(): Promise<void>;
  discard(): void;
};

const DraftCtx = createContext<DraftApi | null>(null);

export function useDraft(): DraftApi | null {
  return useContext(DraftCtx);
}

export function DraftProvider({ forms, actions, children }: { forms: (SettingsFormModel | null)[]; actions: BookingSettingsActions; children: ReactNode }) {
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [follow, setFollowState] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const live = forms.filter((f): f is SettingsFormModel => !!f);

  const api = useMemo<DraftApi>(() => {
    const parts = live.map((form) => {
      const fk = formKey(form);
      return { form, sub: submissionFor(form, edits[fk] ?? {}, new Set(follow[fk] ?? [])) };
    });
    const dirty = parts.reduce((n, p) => n + p.sub.changes.length + p.sub.resets.length, 0);
    return {
      valueOf: (form, f) => {
        const e = edits[formKey(form)];
        return e && Object.prototype.hasOwnProperty.call(e, f.key) ? e[f.key] : f.value;
      },
      isFollow: (form, key) => (follow[formKey(form)] ?? []).includes(key),
      setValue: (form, key, v) => {
        const fk = formKey(form);
        setEdits((s) => ({ ...s, [fk]: { ...(s[fk] ?? {}), [key]: v } }));
        setFollowState((s) => ({ ...s, [fk]: (s[fk] ?? []).filter((k) => k !== key) }));
        setNotice(null);
      },
      setFollow: (form, key, on) => {
        const fk = formKey(form);
        setFollowState((s) => ({ ...s, [fk]: on ? [...new Set([...(s[fk] ?? []), key])] : (s[fk] ?? []).filter((k) => k !== key) }));
        if (on) setEdits((s) => {
          const next = { ...(s[fk] ?? {}) };
          delete next[key];
          return { ...s, [fk]: next };
        });
        setNotice(null);
      },
      dirty,
      saving,
      notice,
      discard: () => {
        setEdits({});
        setFollowState({});
        setNotice(null);
      },
      save: async () => {
        if (!dirty || saving) return;
        setSaving(true);
        setNotice(null);
        try {
          const changes = parts.flatMap((p) => p.sub.changes);
          if (changes.length) {
            const r = await actions.save(changes);
            if (!r.ok) {
              setNotice({ ok: false, text: failText(r) });
              return;
            }
          }
          for (const t of parts.flatMap((p) => p.sub.resets)) {
            const r = await actions.reset(t);
            if (!r.ok) {
              setNotice({ ok: false, text: failText(r) });
              return;
            }
          }
          setEdits({});
          setFollowState({});
          setNotice({ ok: true, text: "บันทึกแล้ว" });
        } catch {
          setNotice({ ok: false, text: "บันทึกไม่สำเร็จ ระบบขัดข้องชั่วคราว ลองอีกครั้ง" });
        } finally {
          setSaving(false);
        }
      },
    };
  }, [live, edits, follow, saving, notice, actions]);

  return <DraftCtx.Provider value={api}>{children}</DraftCtx.Provider>;
}

/** ปุ่มบันทึกมุมขวาบน + แถบสถานะ */
export function SaveButton() {
  const d = useDraft();
  if (!d) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {d.notice && (
        <span role="status" className={cx("text-sm", d.notice.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]")}>
          {d.notice.text}
        </span>
      )}
      {d.dirty > 0 && (
        <button type="button" className={BTN_GHOST} onClick={d.discard} disabled={d.saving}>
          ยกเลิก
        </button>
      )}
      <button type="button" className={BTN_PRIMARY} onClick={() => void d.save()} disabled={d.saving || d.dirty === 0}>
        {d.saving ? "กำลังบันทึก…" : d.dirty > 0 ? `บันทึก (${d.dirty})` : "บันทึก"}
      </button>
    </div>
  );
}

// ───────────────────────── ตัวแก้ค่า (โผล่เมื่อกดเม็ดค่า) ─────────────────────────

type Json = null | string | number | boolean | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

function TableEditor({ f, value, onChange }: { f: SettingsField; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => (value === null || value === undefined ? "" : JSON.stringify(value, null, 1)));
  const [err, setErr] = useState<string | null>(null);
  if (Array.isArray(value) && value.every((x) => typeof x === "string" || typeof x === "number")) {
    const nums = value.length > 0 && value.every((x) => typeof x === "number");
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className={MUTED}>คั่นแต่ละรายการด้วยจุลภาค ( , )</span>
        <input
          className={INPUT}
          defaultValue={value.join(", ")}
          onChange={(e) => {
            const parts = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
            onChange(nums ? parts.map(Number) : parts);
          }}
        />
      </label>
    );
  }
  if (isObj(value) && Object.values(value).every(isScalar)) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(value).map(([k, x]) => (
          <label key={k} className="flex flex-col gap-1 text-xs">
            <span className={MUTED}>{TABLE_KEY_TH[k] ?? k}</span>
            {typeof x === "boolean" ? (
              <Switch checked={x} label={TABLE_KEY_TH[k] ?? k} onChange={(v) => onChange({ ...value, [k]: v })} />
            ) : (
              <input
                className={INPUT}
                defaultValue={x === null ? "" : String(x)}
                inputMode={typeof x === "number" ? "numeric" : undefined}
                onChange={(e) => {
                  const t = e.target.value.trim();
                  const n = Number(t);
                  onChange({ ...value, [k]: t === "" ? null : typeof x === "number" || (x === null && /^\d+$/.test(t)) ? (Number.isFinite(n) ? n : t) : t });
                }}
              />
            )}
          </label>
        ))}
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className={MUTED}>ข้อมูลแบบตาราง{f.nullable ? " · เว้นว่าง = ไม่ตั้ง" : ""}</span>
      <textarea
        className="input min-h-24 w-full font-mono text-xs"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === "" && f.nullable) {
            setErr(null);
            onChange(null);
            return;
          }
          try {
            onChange(JSON.parse(e.target.value) as Json);
            setErr(null);
          } catch {
            setErr("รูปแบบข้อมูลไม่ถูกต้อง");
          }
        }}
      />
      {err && <span className="text-[color:var(--color-danger)]">{err}</span>}
    </label>
  );
}

export function FieldEditor({ f, value, onChange }: { f: SettingsField; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => valueToInputText(f, value));
  const [err, setErr] = useState<string | null>(null);
  if (f.type === "enum") {
    return (
      <select className={INPUT} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} aria-label={f.labelTh}>
        {f.nullable && <option value="">— ไม่ตั้ง</option>}
        {(f.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.labelTh}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "template") {
    const th = isObj(value) && typeof value.th === "string" ? value.th : typeof value === "string" ? value : "";
    return (
      <textarea
        className="input min-h-24 w-full"
        defaultValue={th}
        aria-label={f.labelTh}
        onChange={(e) => onChange(isObj(value) ? { ...value, th: e.target.value } : { th: e.target.value })}
      />
    );
  }
  if (f.type === "table") return <TableEditor f={f} value={value} onChange={onChange} />;
  const unit = unitLabelTh(f.type);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          className={INPUT}
          type={f.type === "time" ? "time" : "text"}
          inputMode={f.type === "text" ? undefined : "decimal"}
          value={text}
          aria-label={f.labelTh}
          onChange={(e) => {
            setText(e.target.value);
            const r = parseFieldInput(f, e.target.value);
            if (r.ok) {
              setErr(null);
              onChange(r.value);
            } else setErr(r.messageTh);
          }}
        />
        {unit && <span className={cx("shrink-0 text-sm", MUTED)}>{unit}</span>}
      </div>
      {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
    </div>
  );
}

// ───────────────────────── แถวกะทัดรัด ─────────────────────────

/** แถวค่าตั้ง 1 แถว: ป้าย+คำอธิบายซ้าย · ค่าเป็นเม็ดขวา (bool = สวิตช์) · ป้ายปรับแล้ว/ปรับรายคน · กดเม็ด = ตัวแก้ */
export function SettingRow({ form, f, ownLabel }: { form: SettingsFormModel; f: SettingsField; ownLabel?: string }) {
  const d = useDraft();
  const [open, setOpen] = useState(false);
  const value = d ? d.valueOf(form, f) : f.value;
  const follow = d?.isFollow(form, f.key) ?? false;
  const changedLocal = !deepEqual(value, f.value);
  const locked = !f.editable;
  const shown = follow ? f.templateValue : value;
  return (
    <div data-setting-key={f.key} {...(locked ? { "data-locked": "true" } : {})} className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{f.labelTh}</div>
          {f.helpTh && <div className={cx("text-xs", MUTED)}>{f.helpTh}</div>}
          {locked && f.lockedReasonTh && <div className={cx("text-xs", MUTED)}>ล็อก · {f.lockedReasonTh}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {f.differsFromTemplate && (
            <span data-bk-chip="changed" className={CHIP}>
              ปรับแล้ว · แม่แบบ = {formatFieldValue(f, f.templateValue)}
            </span>
          )}
          {f.overrideCount > 0 && (
            <span data-bk-chip="override" className={CHIP}>
              {ownLabel ?? "ปรับรายคน"} {f.overrideCount}
            </span>
          )}
          {f.hasOwn && form.scope !== "UNIT" && form.scope !== "TENANT" && (
            <span data-bk-chip="own" className={CHIP}>
              ทับค่าร้าน
            </span>
          )}
          {(changedLocal || follow) && <span className="text-xs text-[color:var(--color-accent)]">ยังไม่บันทึก</span>}
          {f.type === "bool" ? (
            <Switch checked={shown === true} disabled={locked || follow} label={f.labelTh} onChange={(v) => d?.setValue(form, f.key, v)} />
          ) : locked ? (
            <span data-bk-pill="" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold">
              {formatFieldValue(f, shown)}
            </span>
          ) : (
            <button type="button" data-bk-pill="" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cx(BTN, "font-semibold")}>
              {formatFieldValue(f, shown)}
            </button>
          )}
        </div>
      </div>
      {open && !locked && (
        <div className="flex flex-col gap-2 rounded-xl bg-[color:var(--color-surface-2)] p-3">
          <FieldEditor f={f} value={value} onChange={(v) => d?.setValue(form, f.key, v)} />
          <div className="flex flex-wrap gap-2">
            {f.hasOwn && (
              <button type="button" className={BTN_GHOST} onClick={() => { d?.setFollow(form, f.key, true); setOpen(false); }}>
                {form.scope === "UNIT" ? "กลับไปใช้ค่าแม่แบบ" : "กลับไปใช้ค่าร้าน"}
              </button>
            )}
            <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>
              เสร็จ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** แถวตามรายการคีย์ของฟอร์ม (คีย์ที่ฟอร์มไม่มี = ข้าม) */
export function SettingRows({ form, keys, ownLabel }: { form: SettingsFormModel; keys?: readonly string[]; ownLabel?: string }) {
  const fields = fieldsOf(form);
  const list = keys ? keys.map((k) => fields.find((f) => f.key === k)).filter((f): f is SettingsField => !!f) : fields;
  return (
    <div className="flex flex-col">
      {list.map((f) => (
        <SettingRow key={f.key} form={form} f={f} ownLabel={ownLabel} />
      ))}
    </div>
  );
}

// ───────────────────────── เมนูซ้าย (หน้า 08 + 14) ─────────────────────────

export function pagePath(basePath: string, page: BookingSettingsPage): string {
  if (page === "messages") return `${basePath}/settings/messages`;
  if (page === "services") return `${basePath}/services`;
  if (page === "staff") return `${basePath}/staff`;
  return `${basePath}/settings`;
}

export function SettingsNav({ basePath, current }: { basePath: string; current: "policy" | "messages" }) {
  const items: { id: string; label: string; href: string; on: boolean }[] = [
    { id: "policy", label: "แม่แบบและนโยบาย", href: `${basePath}/settings`, on: current === "policy" },
    { id: "messages", label: "ข้อความแจ้งเตือน", href: `${basePath}/settings/messages#messages`, on: current === "messages" },
    { id: "devices", label: "จอทีวี · ตู้ · บัตร", href: `${basePath}/settings/messages#devices`, on: false },
    { id: "roles", label: "สิทธิ์ผู้ใช้", href: `${basePath}/settings/messages#roles`, on: false },
    { id: "integrations", label: "ศูนย์เชื่อมต่อ ↗", href: "/app/settings/integrations", on: false },
  ];
  return (
    <nav data-bk-nav="" aria-label="หมวดตั้งค่าจองคิว" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((it) => (
        <a
          key={it.id}
          data-bk-nav-item={it.id}
          href={it.href}
          {...(it.on ? { "aria-current": "page" as const } : {})}
          className={cx(
            "inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm",
            it.on ? "bg-[color:var(--color-ink)] font-semibold text-[color:var(--color-surface)]" : "hover:bg-[color:var(--color-surface-2)]",
          )}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}

export function PageHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        <p className={cx("text-sm", MUTED)}>{desc}</p>
      </div>
      <SaveButton />
    </div>
  );
}

// ───────────────────────── จอง 08 ─────────────────────────

function TemplateCards({ model, onPick }: { model: PolicyModel; onPick: (key: string) => void }) {
  return (
    <div data-bk-templates="" className="grid gap-3 md:grid-cols-3">
      {model.templates.map((t) => (
        <div
          key={t.key}
          data-template-card={t.key}
          data-active={String(t.active)}
          data-hidden={String(t.hidden)}
          className={cx("flex flex-col gap-2 rounded-2xl border bg-[color:var(--color-surface)] p-4", t.active && "border-2 border-[color:var(--color-ink)]", t.hidden && "opacity-70")}
        >
          <div className="flex flex-wrap items-center gap-2">
            {t.active && <span className="rounded-md bg-[color:var(--color-ink)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-surface)]">ใช้อยู่</span>}
            {t.hidden && <span className="rounded-md border px-2 py-0.5 text-xs">เร็ว ๆ นี้</span>}
          </div>
          <div className="text-base font-bold">{t.labelTh}</div>
          {t.tagTh && <div className={cx("text-xs", MUTED)}>{t.tagTh}</div>}
          <ul className="flex flex-col gap-0.5 text-sm">
            {t.summaryTh.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {model.canApplyTemplate && !t.active && !t.hidden && (
            <button type="button" data-template-pick={t.key} className={cx(BTN_GHOST, "mt-auto")} onClick={() => onPick(t.key)}>
              ใช้แม่แบบนี้
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function TemplateConfirm({ model, pending, actions, onClose }: { model: PolicyModel; pending: string | null; actions: BookingSettingsActions; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = model.templates.find((t) => t.key === pending)?.labelTh ?? "";
  const same = pending !== null && pending === model.template?.key;
  const run = async (overwrite: "KEEP_CUSTOM" | "RESET_ALL") => {
    if (!pending || !actions.applyTemplate) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await actions.applyTemplate({ templateKey: pending, overwrite });
      if (r.ok) onClose();
      else setErr(failText(r));
    } catch {
      setErr("เปลี่ยนแม่แบบไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-template-confirm="" hidden={pending === null} role="dialog" aria-label="ยืนยันการใช้แม่แบบ" className={cx(CARD, "flex flex-col gap-3 border-[color:var(--color-ink)]")}>
      <div className="text-sm font-semibold">
        {same ? `คืนค่าแม่แบบ «${label}»` : `เปลี่ยนเป็นแม่แบบ «${label}»`} — ค่าที่ปรับไว้ {model.diffCount} ข้อ จะทำอย่างไร?
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-overwrite="KEEP_CUSTOM" className={BTN_GHOST} disabled={busy} onClick={() => void run("KEEP_CUSTOM")}>
          คงค่าที่ปรับไว้
        </button>
        <button type="button" data-overwrite="RESET_ALL" className={BTN_PRIMARY} disabled={busy} onClick={() => void run("RESET_ALL")}>
          ล้างค่าที่ปรับ (ใช้ค่าแม่แบบทั้งหมด)
        </button>
        <button type="button" className={BTN_GHOST} disabled={busy} onClick={onClose}>
          ยกเลิก
        </button>
      </div>
      {err && <div className="text-sm text-[color:var(--color-danger)]">{err}</div>}
    </div>
  );
}

function ChangedList({ model }: { model: PolicyModel }) {
  const fields = fieldsOf(model.form);
  const pageTh: Record<BookingSettingsPage, string> = { policy: "แม่แบบและนโยบาย", messages: "ข้อความแจ้งเตือน", services: "บริการ", staff: model.providerLabel };
  return (
    <div data-bk-changed-list="" className={cx(CARD, "flex flex-col")}>
      <div className="pb-2 text-base font-bold">ค่าที่ปรับจากแม่แบบ ({model.diffCount} ข้อ)</div>
      {model.diffKeys.map((k) => {
        const f = fields.find((x) => x.key === k);
        if (!f) return null;
        const page = model.diffLinks[k] ?? "policy";
        return (
          <div key={k} data-setting-key={k} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0">
            <div className="min-w-0">
              <div className="text-sm font-medium">{f.labelTh}</div>
              <div className={cx("text-xs", MUTED)}>แม่แบบ = {formatFieldValue(f, f.templateValue)}</div>
            </div>
            <div className="flex items-center gap-2">
              <span data-bk-pill="" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold">
                {formatFieldValue(f, f.value)}
              </span>
              <a href={pagePath(model.basePath, page)} className="inline-flex min-h-11 items-center text-sm font-semibold text-[color:var(--color-accent)]">
                ไปที่หน้า{pageTh[page]} ›
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PolicyCard({ model, card }: { model: PolicyModel; card: PolicyModel["cards"][number] }) {
  return (
    <section data-bk-group={card.key} data-group-no={String(card.no)} className={CARD}>
      <h2 className="flex items-center gap-2 pb-1 text-base font-bold">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-[color:var(--color-ink)] px-1.5 text-sm text-[color:var(--color-surface)]">{card.no}</span>
        {card.labelTh}
      </h2>
      <SettingRows form={model.form} keys={card.fieldKeys} />
      {card.key === "notify" && (
        <a href={`${model.basePath}/settings/messages`} className="flex min-h-11 items-center justify-between border-t pt-3 text-sm">
          <span>แก้ข้อความ · ตั้งจอทีวี/ตู้ · สิทธิ์ผู้ใช้</span>
          <span className="font-semibold text-[color:var(--color-accent)]">เปิด ›</span>
        </a>
      )}
    </section>
  );
}

export default function BookingPolicySettings({ model, actions, view }: { model: PolicyModel; actions: BookingSettingsActions; view?: { onlyChanged?: boolean } }) {
  const [onlyChanged, setOnlyChanged] = useState(view?.onlyChanged === true);
  const [pending, setPending] = useState<string | null>(null);
  const cols = (side: "left" | "right") => model.cards.filter((c) => c.column === side);
  return (
    <DraftProvider forms={[model.form]} actions={actions}>
      <div data-bk-settings-page="policy" className="flex flex-col gap-5">
        <PageHead title={`ตั้งค่าการจองและคิว · ${model.unitName}`} desc="ค่าที่ตั้งตรงนี้ใช้ทั้งสาขา · ช่าง/บริการ ตั้งทับรายตัวได้ที่หน้านั้น · นัดที่จองแล้วใช้กติกา ณ วันจอง" />
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <SettingsNav basePath={model.basePath} current="policy" />
          <div className="flex min-w-0 flex-col gap-5">
            <TemplateCards model={model} onPick={setPending} />
            {model.canApplyTemplate && <TemplateConfirm model={model} pending={pending} actions={actions} onClose={() => setPending(null)} />}
            {model.template === null ? (
              <div data-bk-no-template="" className="rounded-2xl bg-[color:var(--color-accent-soft)] px-4 py-3 text-sm">
                ยังไม่ได้เลือกแม่แบบ — ตอนนี้ใช้ค่าเริ่มต้นของระบบจองรุ่นแรก · {model.canApplyTemplate ? "เลือกแม่แบบที่ตรงกับร้านด้านบน" : "ให้เจ้าของร้านเลือกแม่แบบ"}
              </div>
            ) : (
              <div data-bk-diff-bar="" data-diff-count={String(model.diffCount)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-accent-soft)] px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  ✎ ร้านนี้เริ่มจากแม่แบบ <b>{model.template.labelTh}</b> · ปรับจากแม่แบบแล้ว <b>{model.diffCount} ข้อ</b> (ป้ายฟ้า) · เปลี่ยนแม่แบบได้ทุกเมื่อ ระบบถามก่อนว่าจะเก็บค่าที่ปรับไว้ไหม
                </span>
                <span className="flex flex-wrap gap-2">
                  <button type="button" data-bk-action="only-changed" aria-pressed={onlyChanged} className={BTN_GHOST} onClick={() => setOnlyChanged((v) => !v)}>
                    {onlyChanged ? "ดูทั้งหมด" : "ดูเฉพาะที่ปรับ"}
                  </button>
                  {model.canApplyTemplate && (
                    <button type="button" data-bk-action="reset-template" className={BTN_GHOST} onClick={() => setPending(model.template?.key ?? null)}>
                      คืนค่าแม่แบบ
                    </button>
                  )}
                </span>
              </div>
            )}
            {onlyChanged && model.template !== null ? (
              <ChangedList model={model} />
            ) : (
              <div data-bk-cols="2" className="grid items-start gap-5 xl:grid-cols-2">
                {(["left", "right"] as const).map((side) => (
                  <div key={side} data-bk-col={side} className="flex min-w-0 flex-col gap-5">
                    {cols(side).map((c) => (
                      <PolicyCard key={c.key} model={model} card={c} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DraftProvider>
  );
}
