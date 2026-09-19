// ObjectsAdmin.tsx — แผงซ้ายของหน้า "ตั้งค่า — วัตถุกำหนดเอง" (CRM v2 · ใบ C1.9 · ภาพ ledger/design-crm/06-custom-objects.png ซ้าย)
//   • "วัตถุที่มีอยู่" — ชื่อ · ผูกกับ · N รายการ · N ฟิลด์ · แก้ไข · เก็บถาวร (มีรายการ = พิมพ์ key + เหตุผล) · กู้คืน
//   • "เพิ่มวัตถุ" — ชื่อเอกพจน์ · พหูพจน์ · ชื่ออ้างอิง (key) · ผูกกับ ×5 · ความสัมพันธ์ 1–n · ชื่อรายการคือ · แท็บใน 360 · portal
//   • "เทมเพลตกิจการ" — 8 ชุด (กดแล้วเติมฟอร์ม แก้ต่อได้ก่อนสร้าง)
// 🔴 'use client' — ค่าคงที่/เทมเพลต/ตัวตรวจ key จาก `objects-shared.ts` (บริสุทธิ์) · ไม่มีทางถึง prisma
// 🔴 ข้อผิดพลาดทุกตัวแสดงในแผง (inline) ข้อความไทยจากบริการ — ไม่ใช้ alert()
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OBJECT_PARENT_LABEL,
  OBJECT_PARENT_TYPES,
  OBJECT_REASON_MIN,
  objectKeyProblem,
  type ObjectParentType,
} from "@/lib/modules/crm/objects-shared";
import { archiveObjectAction, createObjectAction, restoreObjectAction, updateObjectAction } from "@/lib/modules/crm/objects-actions";
import type { ObjectListItem, ObjectTemplateChip } from "@/components/crm/objects/types";

const ICON: Record<string, string> = { paw: "🐾", car: "🚗", gear: "⚙", doc: "📄", shield: "🛡", home: "🏠", folder: "📁", user: "🎓" };

// ───────────────────────── วัตถุที่มีอยู่ ─────────────────────────

export function ObjectList({ systemId, items, selected, baseHref }: { systemId: string; items: ObjectListItem[]; selected: string; baseHref: string }) {
  const live = items.filter((o) => !o.archived);
  const archived = items.filter((o) => o.archived);
  return (
    <section className="card flex flex-col gap-1 p-4" data-testid="objects-list">
      <h2 className="flex items-center gap-2 font-semibold">
        วัตถุที่มีอยู่ <span className="text-xs font-normal text-[color:var(--color-muted)]">{live.length.toLocaleString("th-TH")} วัตถุ</span>
      </h2>
      {live.length === 0 && <p className="py-2 text-sm text-[color:var(--color-muted)]">ยังไม่มีวัตถุกำหนดเอง — เพิ่มจากแผงด้านล่าง หรือเลือกเทมเพลตกิจการ</p>}
      <ul className="flex flex-col divide-y">
        {live.map((o) => (
          <ObjectRow key={o.key} systemId={systemId} item={o} selected={o.key === selected} baseHref={baseHref} />
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-[color:var(--color-muted)]" data-testid="objects-archived-toggle">
            เก็บถาวรแล้ว {archived.length.toLocaleString("th-TH")} วัตถุ
          </summary>
          <ul className="mt-1 flex flex-col divide-y">
            {archived.map((o) => (
              <ArchivedRow key={o.key} systemId={systemId} item={o} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ObjectRow({ systemId, item, selected, baseHref }: { systemId: string; item: ObjectListItem; selected: boolean; baseHref: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "archive">("view");
  return (
    <li className="flex flex-col gap-2 py-2.5" style={selected ? { background: "var(--color-surface-2)", borderRadius: 10, padding: "10px 8px" } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`${baseHref}?object=${item.key}`} className="flex min-w-0 flex-col" data-testid={`object-select-${item.key}`}>
          <span className="break-words font-medium">
            {item.label}
            {selected && (
              <span className="ml-2 rounded-md border px-1 text-[10px]" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
                กำลังแก้
              </span>
            )}
          </span>
          <span className="text-xs text-[color:var(--color-muted)]">
            ผูกกับ: {item.parentLabel} · {item.recordCount.toLocaleString("th-TH")} รายการ · {item.fieldCount.toLocaleString("th-TH")} ฟิลด์
          </span>
        </Link>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "edit" ? "view" : "edit")} data-testid="object-edit-btn">
            แก้ไข
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "archive" ? "view" : "archive")} data-testid="object-archive-btn">
            เก็บถาวร
          </button>
        </div>
      </div>
      {mode === "edit" && <EditObjectForm systemId={systemId} item={item} onDone={() => setMode("view")} />}
      {mode === "archive" && <ArchiveObjectForm systemId={systemId} item={item} onDone={() => setMode("view")} />}
    </li>
  );
}

function ArchivedRow({ systemId, item }: { systemId: string; item: ObjectListItem }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-[color:var(--color-muted)]">
          {item.label} · {item.recordCount.toLocaleString("th-TH")} รายการ (เก็บไว้ครบ)
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          data-testid="object-restore-btn"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await restoreObjectAction(systemId, item.key);
              if (!res.ok) setError(res.error);
              else router.refresh();
            })
          }
        >
          กู้คืน
        </button>
      </div>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-restore-error">
          {error}
        </span>
      )}
    </li>
  );
}

/** AUDIT-CLASS X9: วัตถุที่มีรายการ ⇒ พิมพ์ key ให้ตรง + เหตุผล ≥ OBJECT_REASON_MIN ตัวอักษร (บริการตรวจซ้ำเสมอ) · วัตถุว่าง = ยืนยันกดเดียว */
function ArchiveObjectForm({ systemId, item, onDone }: { systemId: string; item: ObjectListItem; onDone: () => void }) {
  const router = useRouter();
  const [confirmKey, setConfirmKey] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // CRM C1.9 ▸ รีวิว S6: ตัวนับในหน้าอาจเก่า — บริการตอบ CONFIRM_REQUIRED (มีรายการเกิดขึ้นระหว่างนั้น) ⇒ เปิดช่องพิมพ์ key + เหตุผลทันที ◂
  const [needs, setNeeds] = useState(item.recordCount > 0);
  const ready = !needs || (confirmKey.trim() === item.key && reason.trim().length >= OBJECT_REASON_MIN);
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      style={{ borderColor: "var(--color-danger)" }}
      data-testid="object-archive-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await archiveObjectAction(systemId, item.key, needs ? { confirmKey: confirmKey.trim(), reason: reason.trim() } : {});
          if (!res.ok) {
            if (res.code === "CONFIRM_REQUIRED") setNeeds(true);
            setError(res.error);
            return;
          }
          onDone();
          router.refresh();
        });
      }}
    >
      <p>
        เก็บถาวร &quot;{item.label}&quot; — แท็บและหน้ารายการจะถูกซ่อน{needs ? ` · รายการ${item.recordCount > 0 ? ` ${item.recordCount.toLocaleString("th-TH")} รายการ` : "ที่มีอยู่"}ถูกเก็บไว้ครบ กู้คืนได้` : " (ยังไม่มีรายการ)"}
      </p>
      {needs && (
        <>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>
              พิมพ์ชื่ออ้างอิง <b>{item.key}</b> เพื่อยืนยัน
            </span>
            <input value={confirmKey} onChange={(e) => setConfirmKey(e.target.value)} className="input text-sm" data-testid="object-archive-confirm-key" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เหตุผล (อย่างน้อย {OBJECT_REASON_MIN} ตัวอักษร)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" data-testid="object-archive-reason" />
          </label>
        </>
      )}
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-archive-error">
          {error}
        </span>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} data-testid="object-archive-cancel">
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-sm" disabled={!ready || pending} style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} data-testid="object-archive-submit">
          {pending ? "กำลังเก็บ…" : "เก็บถาวร"}
        </button>
      </div>
    </form>
  );
}

function EditObjectForm({ systemId, item, onDone }: { systemId: string; item: ObjectListItem; onDone: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(item.label);
  const [plural, setPlural] = useState(item.labelPlural);
  const [key, setKey] = useState(item.key);
  const [titleFieldKey, setTitleFieldKey] = useState(item.titleFieldKey);
  const [showAsTab, setShowAsTab] = useState(item.showAsTab);
  const [portal, setPortal] = useState(item.portalVisible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyProblem = key.trim() !== item.key ? objectKeyProblem(key) : null;
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      style={{ borderColor: "var(--color-line)" }}
      data-testid="object-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (keyProblem) return;
        setError(null);
        startTransition(async () => {
          const res = await updateObjectAction(systemId, item.key, {
            label,
            labelPlural: plural,
            titleFieldKey,
            showAsTab,
            portalVisible: portal,
            ...(key.trim() !== item.key ? { key: key.trim() } : {}),
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชื่อเอกพจน์</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="input text-sm" data-testid="object-edit-label" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>พหูพจน์</span>
          <input value={plural} onChange={(e) => setPlural(e.target.value)} className="input text-sm" data-testid="object-edit-plural" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชื่ออ้างอิง (เปลี่ยนได้เมื่อยังไม่มีรายการ)</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} className="input text-sm" data-testid="object-edit-key" disabled={item.recordCount > 0} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชื่อรายการคือฟิลด์</span>
          <input value={titleFieldKey} onChange={(e) => setTitleFieldKey(e.target.value)} className="input text-sm" data-testid="object-edit-title-field" />
        </label>
      </div>
      {keyProblem && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} data-testid="object-edit-key-hint">
          {keyProblem}
        </span>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" role="switch" checked={showAsTab} onChange={(e) => setShowAsTab(e.target.checked)} data-testid="object-edit-show-as-tab" className="h-4 w-4" />
        <span>{`แสดงเป็นแท็บในหน้า 360 ของ${item.parentLabel}`}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" role="switch" checked={portal} onChange={(e) => setPortal(e.target.checked)} data-testid="object-edit-portal" className="h-4 w-4" />
        <span>เปิดให้ลูกค้าเห็นใน portal</span>
      </label>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-edit-error">
          {error}
        </span>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} data-testid="object-edit-cancel">
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !!keyProblem} data-testid="object-edit-save">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────── เพิ่มวัตถุ + เทมเพลตกิจการ ─────────────────────────

type Draft = { label: string; plural: string; key: string; parentType: ObjectParentType; titleFieldKey: string; showAsTab: boolean; portal: boolean; templateKey: string | null };
const EMPTY: Draft = { label: "", plural: "", key: "", parentType: "COMPANY", titleFieldKey: "name", showAsTab: true, portal: false, templateKey: null };

export function AddObjectForm({ systemId, baseHref, takenKeys, templates }: { systemId: string; baseHref: string; takenKeys: string[]; templates: ObjectTemplateChip[] }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(EMPTY);
  const [touchedKey, setTouchedKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyProblem = d.key ? objectKeyProblem(d.key) ?? (takenKeys.includes(d.key.trim()) ? `มีวัตถุที่ใช้ชื่ออ้างอิง "${d.key.trim()}" อยู่แล้ว — ตั้งชื่ออ้างอิงอื่น` : null) : null;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const tpl = d.templateKey ? templates.find((t) => t.key === d.templateKey) ?? null : null;
  const titleChoices = tpl ? tpl.titleChoices : [];

  function pickTemplate(key: string) {
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    setD({ label: t.label, plural: t.labelPlural, key: takenKeys.includes(t.key) ? "" : t.key, parentType: t.parentType, titleFieldKey: t.titleFieldKey, showAsTab: true, portal: false, templateKey: t.key });
    setTouchedKey(takenKeys.includes(t.key));
    setError(null);
  }

  function submit() {
    setError(null);
    if (!d.label.trim()) {
      setError("ตั้งชื่อวัตถุ (เอกพจน์) ก่อนสร้าง");
      return;
    }
    if (!d.key.trim() || keyProblem) {
      setTouchedKey(true);
      setError(keyProblem ?? "ตั้งชื่ออ้างอิง (key) ภาษาอังกฤษพิมพ์เล็กก่อนสร้าง เช่น \"vehicle\"");
      return;
    }
    startTransition(async () => {
      const res = await createObjectAction(systemId, {
        key: d.key.trim(),
        label: d.label.trim(),
        labelPlural: d.plural.trim() || d.label.trim(),
        parentType: d.parentType,
        titleFieldKey: d.titleFieldKey.trim(),
        showAsTab: d.showAsTab,
        portalVisible: d.portal,
        templateKey: d.templateKey,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setD(EMPTY);
      setTouchedKey(false);
      router.push(`${baseHref}?object=${res.data.key}`);
      router.refresh();
    });
  }

  return (
    <>
      <form
        className="card flex flex-col gap-3 p-4"
        data-testid="object-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="font-semibold">+ เพิ่มวัตถุ{tpl ? <span className="ml-2 text-xs font-normal text-[color:var(--color-muted)]">จากเทมเพลต &quot;{tpl.label}&quot;</span> : null}</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อเอกพจน์</span>
            <input value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="กรมธรรม์" className="input text-sm" data-testid="object-add-singular" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>พหูพจน์</span>
            <input value={d.plural} onChange={(e) => set({ plural: e.target.value })} placeholder="กรมธรรม์" className="input text-sm" data-testid="object-add-plural" />
          </label>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชื่ออ้างอิง (key — ภาษาอังกฤษพิมพ์เล็ก ใช้ในลิงก์และตัวกรอง)</span>
          <input
            value={d.key}
            onChange={(e) => set({ key: e.target.value })}
            onBlur={() => setTouchedKey(true)}
            placeholder="policy"
            className="input text-sm"
            data-testid="object-add-key"
            autoComplete="off"
          />
          {touchedKey && keyProblem && (
            <span style={{ color: "var(--color-danger)" }} data-testid="object-add-key-hint">
              {keyProblem}
            </span>
          )}
        </label>
        <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผูกกับ</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="ผูกกับ">
            {OBJECT_PARENT_TYPES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={d.parentType === p}
                onClick={() => set({ parentType: p })}
                className="rounded-md border px-2 py-1 text-xs"
                style={d.parentType === p ? { borderColor: "var(--color-accent)", color: "var(--color-accent)", fontWeight: 600 } : { borderColor: "var(--color-line)" }}
                data-testid={`object-add-parent-${p.toLowerCase()}`}
              >
                {OBJECT_PARENT_LABEL[p] === "ไม่ผูกกับใคร" ? "ไม่ผูก" : OBJECT_PARENT_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ความสัมพันธ์</span>
            <span className="w-fit rounded-md border px-2 py-1 text-xs">{d.parentType === "NONE" ? "ไม่มีเจ้าของ" : "1 – n"}</span>
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อรายการคือฟิลด์</span>
            {titleChoices.length > 0 ? (
              <select value={d.titleFieldKey} onChange={(e) => set({ titleFieldKey: e.target.value })} className="input text-sm" data-testid="object-add-title-field">
                {titleChoices.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            ) : (
              <input value={d.titleFieldKey} onChange={(e) => set({ titleFieldKey: e.target.value })} placeholder="name" className="input text-sm" data-testid="object-add-title-field" />
            )}
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" role="switch" checked={d.showAsTab} onChange={(e) => set({ showAsTab: e.target.checked })} data-testid="object-add-show-as-tab" className="h-4 w-4" />
          <span>แสดงเป็นแท็บในหน้า 360</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" role="switch" checked={d.portal} onChange={(e) => set({ portal: e.target.checked })} data-testid="object-add-portal" className="h-4 w-4" />
          <span>เปิดให้ลูกค้าเห็นใน portal</span>
        </label>
        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-add-error">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => {
              setD(EMPTY);
              setTouchedKey(false);
              setError(null);
            }}
            data-testid="object-add-cancel"
          >
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary text-sm" disabled={pending} data-testid="object-add-create">
            {pending ? "กำลังสร้าง…" : "สร้างวัตถุ"}
          </button>
        </div>
      </form>

      <section className="card flex flex-col gap-2 p-4" data-testid="object-templates">
        <h2 className="font-semibold">
          เทมเพลตกิจการ <span className="text-xs font-normal text-[color:var(--color-muted)]">เลือกแล้วแก้ต่อได้</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pickTemplate(t.key)}
              title={t.description}
              className="rounded-md border px-2 py-1 text-xs"
              style={d.templateKey === t.key ? { borderColor: "var(--color-ink)", fontWeight: 600 } : { borderColor: "var(--color-line)" }}
              data-testid={`object-template-${t.key}`}
            >
              <span aria-hidden>{ICON[t.icon] ?? "▫"}</span> {t.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
