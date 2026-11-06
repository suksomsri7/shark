"use client";
// SVC H.1 ▸ จอตั้งค่าโรงแรม (/hotel/settings · แบบหอ 17 = การ์ดกริด 3 คอลัมน์ + เมนูซ้าย · ใบสั่ง h.1 §6)
//   • ผัง/ป้ายการ์ดมาจาก hotel-settings-shared + โมเดล (ไฟล์นี้ไม่มีคีย์ค่าตั้งพิมพ์เอง)
//   • แถวกะทัดรัด: ป้ายช่อง ····· ค่า (formatFieldValue) · ช่องที่ตั้งไว้เองมีปุ่ม «คืนค่าเริ่มต้น» · ช่องล็อกแสดงเหตุผล
//   • ปุ่ม «แก้» ของการ์ดเปิดฟอร์มเครื่องยนต์ (SettingsForm) เฉพาะช่องของการ์ด — ด่านสิทธิ์/กฎหมายอยู่ฝั่งเซิร์ฟเวอร์
//   • เมนูซ้าย = ชั้นที่ตั้ง: ทั้งโรงแรม · ตั้งเฉพาะแผนราคา · ตั้งเฉพาะประเภทห้อง (ลิงก์ <a> ไม่ใช้ hook ของ Next)
import { useMemo, useState } from "react";
import type { RemoveResult, SetResult } from "@/lib/core/settings/types";
import type { HotelSettingsModel } from "@/lib/modules/hotel";
import SettingsForm from "@/components/settings/SettingsForm";
import { formatFieldValue, type SettingsField } from "@/components/settings/settings-shared";
import { HOTEL_FIELD_LINKS, HOTEL_SCOPE_LABEL_TH } from "./hotel-settings-shared";

type Actions = {
  save(changes: unknown, opts?: { ackLegalWarn?: boolean }): Promise<SetResult>;
  reset(t: { key: string; scope: string; scopeId: string }): Promise<RemoveResult>;
};
type Props = { model: HotelSettingsModel; unitSlug: string; actions: Actions };
type Card = HotelSettingsModel["cards"][number];

const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const issueText = (r: { ok: false; issues?: { messageTh: string }[] }) => r.issues?.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ";

export default function HotelSettings({ model, unitSlug, actions }: Props) {
  const fields = useMemo(() => {
    const m = new Map(model.form.groups.flatMap((g) => g.fields).map((f) => [f.key, f] as const));
    return m;
  }, [model]);
  const [editing, setEditing] = useState(null as Card | null);
  const [showHistory, setShowHistory] = useState(false);
  const [notice, setNotice] = useState(null as { tone: "ok" | "err"; text: string } | null);
  const base = `/app/u/${unitSlug}/hotel/settings`;
  const cards = model.cards.filter((c) => c.fieldKeys.some((k) => fields.has(k)));

  const resetOne = async (f: SettingsField) => {
    const r = await actions.reset({ key: f.key, scope: model.form.scope, scopeId: model.form.scopeId });
    setNotice(r.ok ? { tone: "ok", text: `คืนค่าเริ่มต้น «${f.labelTh}» แล้ว` } : { tone: "err", text: issueText(r) });
  };
  const editModel = useMemo(() => {
    if (!editing) return null;
    const keys = new Set(editing.fieldKeys.filter((k) => fields.get(k)?.editable));
    return {
      ...model.form,
      groups: model.form.groups.map((g) => ({ ...g, fields: g.fields.filter((f) => keys.has(f.key)) })).filter((g) => g.fields.length > 0),
      history: model.form.history.filter((h) => keys.has(h.key)),
    };
  }, [editing, model, fields]);

  const scopeName =
    model.scope === "RATE_PLAN"
      ? `${HOTEL_SCOPE_LABEL_TH.RATE_PLAN}: ${model.ratePlans.find((p) => p.id === model.scopeId)?.name ?? ""}`
      : model.scope === "ROOM_TYPE"
        ? `${HOTEL_SCOPE_LABEL_TH.ROOM_TYPE}: ${model.roomTypes.find((t) => t.id === model.scopeId)?.name ?? ""}`
        : HOTEL_SCOPE_LABEL_TH.UNIT;

  return (
    <div data-hotel-settings="" data-scope={model.scope} className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
      <nav aria-label="ชั้นที่ตั้งค่า" className="flex min-w-0 gap-1 overflow-x-auto lg:w-60 lg:flex-none lg:flex-col lg:overflow-visible">
        <a href={base} aria-current={model.scope === "UNIT" ? "page" : undefined} className={navCls(model.scope === "UNIT")}>
          {HOTEL_SCOPE_LABEL_TH.UNIT}
        </a>
        <span className="hidden px-4 pt-3 text-xs text-[color:var(--color-muted)] lg:block">{HOTEL_SCOPE_LABEL_TH.RATE_PLAN}</span>
        {model.ratePlans.map((p) => (
          <a key={p.id} href={`${base}?scope=RATE_PLAN&id=${p.id}`} aria-current={model.scope === "RATE_PLAN" && model.scopeId === p.id ? "page" : undefined} className={navCls(model.scope === "RATE_PLAN" && model.scopeId === p.id)}>
            {`แผน ${p.name}`}
          </a>
        ))}
        <span className="hidden px-4 pt-3 text-xs text-[color:var(--color-muted)] lg:block">{HOTEL_SCOPE_LABEL_TH.ROOM_TYPE}</span>
        {model.roomTypes.map((t) => (
          <a key={t.id} href={`${base}?scope=ROOM_TYPE&id=${t.id}`} aria-current={model.scope === "ROOM_TYPE" && model.scopeId === t.id ? "page" : undefined} className={navCls(model.scope === "ROOM_TYPE" && model.scopeId === t.id)}>
            {`ห้อง ${t.name}`}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[color:var(--color-ink)]">ตั้งค่าโรงแรม</h1>
            <p className="text-sm text-[color:var(--color-muted)]">{`${model.unitName} · ${scopeName} · ทุกค่ามีค่าเริ่มต้น และร้านแก้เองได้`}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">{`ปรับจากค่าเริ่มต้น ${model.form.differsCount} ข้อ`}</span>
            <button type="button" className={BTN} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              ประวัติ
            </button>
          </div>
        </header>
        {model.canEdit ? null : <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">ดูได้อย่างเดียว — แก้ค่าตั้งโรงแรมต้องมีสิทธิ์ «ตั้งค่าโรงแรม»</p>}
        {notice ? (
          <p role="status" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm" style={{ color: notice.tone === "err" ? "var(--color-danger)" : "var(--color-ink)" }}>
            {notice.text}
          </p>
        ) : null}
        {showHistory ? (
          <section className="rounded-2xl border border-[color:var(--color-line)] p-4">
            {model.form.history.length ? (
              <ul className="flex flex-col gap-2">
                {model.form.history.map((h) => (
                  <li key={h.id} className="flex min-w-0 flex-col rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-xs">
                    <span className="font-medium">{h.labelTh}</span>
                    <span className="break-words">{h.masked ? "ซ่อนไว้" : `${h.beforeTh} → ${h.afterTh}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประวัติการแก้ไข</p>
            )}
          </section>
        ) : null}

        <div data-hs-grid="" data-cols="3" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <section key={c.key} data-hs-card={c.key} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <h2 className="min-w-0 text-base font-bold text-[color:var(--color-ink)]">{c.labelTh}</h2>
                {model.canEdit && cardEditable(c, fields) ? (
                  <button type="button" onClick={() => setEditing(c)} className="min-h-11 px-2 text-sm font-bold text-[color:var(--color-accent)]">
                    แก้
                  </button>
                ) : null}
              </div>
              {c.noteTh ? <p className="text-xs text-[color:var(--color-muted)]">{c.noteTh}</p> : null}
              {c.fieldKeys
                .map((k) => fields.get(k))
                .filter((f): f is SettingsField => !!f)
                .map((f) => (
                  <FieldRow key={f.key} field={f} canEdit={model.canEdit} onReset={() => void resetOne(f)} />
                ))}
            </section>
          ))}
        </div>
      </div>

      {editing && editModel ? (
        <div role="dialog" aria-modal="true" aria-label={`แก้ ${editing.labelTh}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[color:var(--color-surface)] sm:rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-line)] px-5 py-3">
              <h2 className="text-base font-bold text-[color:var(--color-ink)]">{`แก้ ${editing.labelTh}`}</h2>
              <button type="button" onClick={() => setEditing(null)} className={BTN}>
                ปิด
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
              <SettingsForm model={editModel} actions={{ save: actions.save, reset: actions.reset }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function cardEditable(c: Card, fields: Map<string, SettingsField>): boolean {
  return c.fieldKeys.some((k) => fields.get(k)?.editable === true);
}

const navCls = (on: boolean): string =>
  `whitespace-nowrap rounded-xl px-4 py-3 text-sm ${on ? "bg-[color:var(--color-surface-2)] font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"}`;

function FieldRow({ field: f, canEdit, onReset }: { field: SettingsField; canEdit: boolean; onReset: () => void }) {
  const link = HOTEL_FIELD_LINKS[f.key];
  const value = f.masked ? "ซ่อนไว้" : formatFieldValue(f, f.value);
  return (
    <div data-hs-field={f.key} className="flex min-w-0 flex-col gap-0.5 border-b border-[color:var(--color-line)] py-2 text-sm last:border-b-0">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-[color:var(--color-ink-soft)]">{f.labelTh}</span>
        <span className="min-w-0 break-words text-right font-medium text-[color:var(--color-ink)]">{value}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-muted)]">
        <span>{f.sourceLabelTh}</span>
        {f.sensitivity === "MONEY" ? <span className="rounded border border-[color:var(--color-line)] px-1">เรื่องเงิน</span> : null}
        {f.ownerOnly ? <span className="rounded border border-[color:var(--color-line)] px-1">เฉพาะเจ้าของ</span> : null}
        {f.differsFromTemplate && !f.masked ? <span>{`ค่าเริ่ม ${formatFieldValue(f, f.templateValue)}`}</span> : null}
        {canEdit && f.hasOwn && f.editable ? (
          <button type="button" onClick={onReset} className="min-h-11 font-bold text-[color:var(--color-accent)]">
            คืนค่าเริ่มต้น
          </button>
        ) : null}
        {link ? (
          <a href={link.href} className="font-bold text-[color:var(--color-accent)]">
            {`${link.labelTh} ›`}
          </a>
        ) : null}
      </div>
      {!f.editable && f.lockedReasonTh ? <p className="text-xs text-[color:var(--color-ink-soft)]">{`🔒 ${f.lockedReasonTh}`}</p> : null}
    </div>
  );
}
