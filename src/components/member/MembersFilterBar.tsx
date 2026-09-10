// MembersFilterBar.tsx — แถบตัวกรองหน้ารวมสมาชิก (M1.5 · ภาพ 01 · testid `members-filter`)
//
// โครงตรงแบบ (ตีกลับรอบ 1 ข้อ 1): ค้นหา · ระดับ · สาขา · แท็ก · ฟิลด์กำหนดเอง filterable ที่ไม่ใช่ isSystem
// (เช่น "ระดับใบรับรอง") วางอินไลน์ทั้งหมด — ฟิลด์ระบบ filterable อื่น ๆ (เพศ/จังหวัด/ช่องทางที่มา/…) อยู่ใน
// popover ของปุ่ม "ตัวกรอง" (มีตัวเลขจำนวนที่ใช้อยู่) · มุมมองที่บันทึกไว้เป็นชิปท้ายแถว (`savedViewsSlot`)
//
// 🔴 ฟิลด์กำหนดเองที่โชว์อินไลน์วนจาก `inlineCustomFields` ที่ page.tsx คำนวณจาก layout จริง
//    (เกณฑ์: filterable && !isSystem && showInList) — ห้ามฮาร์ดโค้ดชื่อฟิลด์ใด ๆ ในไฟล์นี้
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MemberIcon } from "./MemberIcon";

export type MembersFilterField = {
  key: string;
  label: string;
  type: string;
  choices?: { value: string; label: string }[];
};

function setParam(sp: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(sp.toString());
  if (value) next.set(key, value);
  else next.delete(key);
  next.delete("page"); // ตัวกรองเปลี่ยน = กลับหน้า 1 เสมอ
  return next;
}

export function MembersFilterBar({
  q,
  tier,
  unit,
  tag,
  f,
  tierOptions,
  unitOptions,
  inlineCustomFields,
  advancedFields,
  savedViewsSlot,
}: {
  q: string;
  tier: string;
  unit: string;
  tag: string;
  f: Record<string, string>;
  tierOptions: { key: string; name: string }[];
  unitOptions: { id: string; name: string }[];
  /** ฟิลด์กำหนดเอง filterable ที่ showInList (โชว์อินไลน์ในแถบ — ปกติมี 1 ตัวแบบภาพ 01 "ระดับใบรับรอง") */
  inlineCustomFields: MembersFilterField[];
  /** ฟิลด์ filterable ที่เหลือทั้งหมด (ระบบ + กำหนดเองที่ไม่ showInList) — อยู่ใน popover "ตัวกรอง" */
  advancedFields: MembersFilterField[];
  /** `<MembersSavedViewsMenu>` — วางเป็นชิปท้ายแถวก่อนปุ่ม "ตัวกรอง" ตามภาพ 01 */
  savedViewsSlot: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [qDraft, setQDraft] = useState(q);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState(tag);
  const [advOpen, setAdvOpen] = useState(false);

  const go = (key: string, value: string) => {
    const qs = setParam(searchParams, key, value).toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const submitQ = () => go("q", qDraft.trim());
  const submitTag = () => {
    go("tag", tagDraft.trim());
    setTagOpen(false);
  };

  const advActiveCount = advancedFields.filter((field) => !!f[field.key]).length;
  const anyActive = !!(q || tier || unit || tag || Object.keys(f).length > 0);

  return (
    <div data-testid="members-filter" className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
      <div className="input" style={{ minWidth: 220, flex: "1 1 220px", display: "flex", alignItems: "center", gap: 6 }}>
        <MemberIcon name="search" size="sm" />
        <input
          data-testid="members-search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitQ();
          }}
          onBlur={submitQ}
          placeholder="ค้นชื่อ เบอร์ อีเมล รหัสสมาชิก…"
          className="min-w-0 flex-1"
          style={{ border: "none", outline: "none", background: "transparent" }}
        />
      </div>

      <select data-testid="members-filter-tier" value={tier} onChange={(e) => go("tier", e.target.value)} className="input" style={{ width: 140 }}>
        <option value="">ระดับ: ทั้งหมด</option>
        {tierOptions.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
          </option>
        ))}
      </select>

      <select data-testid="members-filter-unit" value={unit} onChange={(e) => go("unit", e.target.value)} className="input" style={{ width: 140 }}>
        <option value="">สาขา: ทั้งหมด</option>
        {unitOptions.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      <Popover
        testId="members-filter-tag"
        open={tagOpen}
        onToggle={() => setTagOpen((o) => !o)}
        onClose={() => setTagOpen(false)}
        label={tag ? `แท็ก: ${tag}` : "แท็ก"}
      >
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>
          กรองด้วยแท็ก
          <input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTag();
            }}
            className="input"
            placeholder="เช่น VIP"
          />
        </label>
        <button type="button" className="btn btn-primary text-sm" onClick={submitTag}>
          ใช้ตัวกรอง
        </button>
      </Popover>

      {inlineCustomFields.map((field) => (
        <MemberFieldFilter key={field.key} field={field} value={f[field.key] ?? ""} onChange={(v) => go(`f.${field.key}`, v)} />
      ))}

      <span className="sp" style={{ flex: 1 }} />

      {savedViewsSlot}

      {advancedFields.length > 0 && (
        <Popover
          testId="members-filter-advanced"
          open={advOpen}
          onToggle={() => setAdvOpen((o) => !o)}
          onClose={() => setAdvOpen(false)}
          icon="filter"
          label={advActiveCount > 0 ? `ตัวกรอง (${advActiveCount})` : "ตัวกรอง"}
        >
          <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
            {advancedFields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1" style={{ fontSize: 12 }}>
                {field.label}
                <MemberFieldInput field={field} value={f[field.key] ?? ""} onChange={(v) => go(`f.${field.key}`, v)} />
              </label>
            ))}
          </div>
        </Popover>
      )}

      {anyActive && (
        <button type="button" data-testid="members-filter-clear" onClick={() => router.push(pathname, { scroll: false })} className="btn btn-ghost text-sm">
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}

/** กล่องลอย (chip/button trigger + panel) ใช้ร่วมกันทั้งแท็ก/ตัวกรองขั้นสูง */
function Popover({
  testId,
  open,
  onToggle,
  onClose,
  label,
  icon,
  children,
}: {
  testId: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  label: string;
  icon?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button type="button" data-testid={testId} onClick={onToggle} className="btn btn-ghost text-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {icon && <MemberIcon name={icon} size="sm" />}
        {label}
        <MemberIcon name="chevronDown" size="xs" />
      </button>
      {open && (
        <div
          data-testid={`${testId}-panel`}
          className="flex flex-col gap-2 rounded-xl p-3"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 20,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            boxShadow: "0 14px 34px rgba(10,10,10,.12)",
            minWidth: 200,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MemberFieldFilter({ field, value, onChange }: { field: MembersFilterField; value: string; onChange: (v: string) => void }) {
  if (field.type === "SELECT" || field.type === "MULTI_SELECT") {
    return (
      <select data-testid={`members-filter-f-${field.key}`} value={value} onChange={(e) => onChange(e.target.value)} className="input" style={{ width: 170 }}>
        <option value="">{field.label}: ทั้งหมด</option>
        {(field.choices ?? []).map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      data-testid={`members-filter-f-${field.key}`}
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onChange((e.target as HTMLInputElement).value.trim());
      }}
      placeholder={field.label}
      className="input"
      style={{ width: 150 }}
    />
  );
}

/** ตัวควบคุมในกล่อง "ตัวกรอง" ขั้นสูง — เหมือน MemberFieldFilter แต่ไม่ตั้ง testid ซ้ำ (อยู่ใน popover เดียวกันหมด) */
function MemberFieldInput({ field, value, onChange }: { field: MembersFilterField; value: string; onChange: (v: string) => void }) {
  if (field.type === "SELECT" || field.type === "MULTI_SELECT") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">ทั้งหมด</option>
        {(field.choices ?? []).map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "BOOLEAN") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">ทั้งหมด</option>
        <option value="true">ใช่</option>
        <option value="false">ไม่ใช่</option>
      </select>
    );
  }
  return (
    <input
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onChange((e.target as HTMLInputElement).value.trim());
      }}
      className="input"
      placeholder={field.type === "NUMBER" || field.type === "DATE" ? "เช่น 10..30" : ""}
    />
  );
}

export default MembersFilterBar;
