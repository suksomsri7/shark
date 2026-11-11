"use client";

// ─────────────────────────────────────────────────────────────
// BookingMessagesSettings.tsx — จอง 14 "ข้อความแจ้งเตือน · จอทีวี · ตู้ · บัตร · สิทธิ์ผู้ใช้" · SVC B.11 §5.4
//   ข้อความ 10 ชนิด (สวิตช์เปิด/ปิด + ตัวแก้ + ปุ่มตัวแปร + ตัวอย่าง LINE) · ทีวี/ตู้ (DEVICE = อ่านอย่างเดียวจนรองรับรายเครื่อง)
//   ตารางสิทธิ์ตามแม่แบบ + ใช้ชุดสิทธิ์กับพนักงาน · ความเป็นส่วนตัว (ชั้นทั้งร้าน — เจ้าของเท่านั้น)
// 🔴 ไม่มีคีย์ค่าตั้งในไฟล์นี้ (อ่านจากโมเดล/booking-settings-shared) · ไม่ import ค่าจาก server · ไม่มี useRouter
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import type { SettingsField, SettingsFormModel } from "@/components/settings/settings-shared";
import { BOOKING_SETTINGS_LAYOUT, fieldsOf, type DeviceRow, type MessagesModel } from "./booking-settings-shared";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  CHIP,
  cx,
  DraftProvider,
  failText,
  MUTED,
  PageHead,
  SettingRow,
  SettingsNav,
  Switch,
  useDraft,
  type BookingSettingsActions,
} from "./BookingPolicySettings";

const VAR_RE = /\{([^{}]+)\}/g;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function MessageList({ model }: { model: MessagesModel }) {
  const d = useDraft();
  const form = model.form;
  const fields = fieldsOf(form);
  const enabledField = fields.find((f) => f.key === BOOKING_SETTINGS_LAYOUT.msgEnabledKey);
  const enabledVal = enabledField ? (d ? d.valueOf(form, enabledField) : enabledField.value) : null;
  const canToggle = !!enabledField?.editable;
  const toggle = (kind: string, on: boolean) => {
    if (!enabledField || !d) return;
    d.setValue(form, enabledField.key, { ...(isObj(enabledVal) ? enabledVal : {}), [kind]: on });
  };
  return (
    <div {...(enabledField ? { "data-setting-key": enabledField.key } : {})} {...(enabledField && !canToggle ? { "data-locked": "true" } : {})} className="flex flex-col">
      {enabledField && !canToggle && enabledField.lockedReasonTh && <div className={cx("pb-2 text-xs", MUTED)}>ล็อก · {enabledField.lockedReasonTh}</div>}
      {model.msgKinds.map((k) => {
        const on = isObj(enabledVal) ? enabledVal[k.kind] === true : k.enabled;
        const sel = k.kind === model.selectedKind;
        const tf = fields.find((f) => f.key === k.key);
        return (
          <div
            key={k.kind}
            data-msg-kind={k.kind}
            data-setting-key={k.key}
            {...(tf && !tf.editable ? { "data-locked": "true" } : {})}
            className={cx("flex items-center justify-between gap-3 rounded-xl border-b px-3 py-2 last:border-b-0", sel && "bg-[color:var(--color-accent-soft)]")}
          >
            <a href={`?msg=${encodeURIComponent(k.kind)}#messages`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center" aria-current={sel ? "true" : undefined}>
              <span className="text-sm font-medium">{k.labelTh}</span>
              <span className={cx("text-xs", MUTED)}>
                {k.hintTh}
                {tf?.differsFromTemplate ? " · ปรับข้อความแล้ว" : ""}
              </span>
            </a>
            <span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold">LINE</span>
            <Switch checked={on} disabled={!canToggle} label={`เปิดส่ง${k.labelTh}`} onChange={(v) => toggle(k.kind, v)} />
          </div>
        );
      })}
    </div>
  );
}

function MessageEditor({ model }: { model: MessagesModel }) {
  const d = useDraft();
  const form = model.form;
  const kind = model.msgKinds.find((k) => k.kind === model.selectedKind);
  const f = fieldsOf(form).find((x) => x.key === kind?.key);
  const cur = f ? (d ? d.valueOf(form, f) : f.value) : null;
  const curTh = isObj(cur) && typeof cur.th === "string" ? cur.th : "";
  const [text, setText] = useState(curTh);
  if (!kind || !f) return null;
  const set = (t: string) => {
    setText(t);
    d?.setValue(form, f.key, { ...(isObj(cur) ? cur : {}), th: t });
  };
  const edited = isObj(cur) && isObj(f.value) ? cur.th !== f.value.th : false;
  const preview = edited ? text.replace(VAR_RE, (_m, n: string) => model.previewVars[n.trim()] ?? "") : model.preview.th;
  return (
    <div data-bk-msg-editor="" data-msg-kind={kind.kind} className="flex min-w-0 flex-col gap-3">
      <div className="text-sm font-semibold">แก้ข้อความ · {kind.labelTh} (LINE)</div>
      <div data-setting-key={f.key} {...(!f.editable ? { "data-locked": "true" } : {})} className="flex flex-col gap-2">
        <textarea
          className="input min-h-28 w-full"
          value={text}
          disabled={!f.editable}
          aria-label={f.labelTh}
          onChange={(e) => set(e.target.value)}
        />
        {f.differsFromTemplate && (
          <span data-bk-chip="changed" className={cx(CHIP, "self-start")}>
            ปรับแล้ว · ต่างจากข้อความแม่แบบ
          </span>
        )}
        {!f.editable && f.lockedReasonTh && <span className={cx("text-xs", MUTED)}>ล็อก · {f.lockedReasonTh}</span>}
        <div className="flex flex-wrap gap-1.5">
          {(f.templateVars ?? []).map((v) => (
            <button
              key={v}
              type="button"
              data-var={`{${v}}`}
              disabled={!f.editable}
              className="inline-flex min-h-11 items-center rounded-md border border-dashed border-[color:var(--color-accent)] px-2 text-xs font-semibold text-[color:var(--color-accent)]"
              onClick={() => set(`${text}{${v}}`)}
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
        <span className={cx("text-xs", MUTED)}>กดตัวแปรเพื่อแทรก · ระบบเติมค่าจริงตอนส่ง · ภาษา: ไทย (อังกฤษตามลูกค้า)</span>
      </div>
      <div className="rounded-2xl bg-[color:var(--color-surface-2)] p-3">
        <div className="flex items-end gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-xs font-bold text-[color:var(--color-surface)]">ร้าน</span>
          <div data-bk-line-preview="" className="min-w-0 rounded-2xl bg-[color:var(--color-surface)] px-3 py-2 text-sm shadow-sm">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceRowView({ form, row }: { form: SettingsFormModel; row: DeviceRow }) {
  if ("domain" in row) return <SettingRow form={form} f={row as SettingsField} />;
  return (
    <div data-setting-key={row.key} data-locked="true" className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{row.labelTh}</span>
        <span data-bk-pill="" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold">
          {row.valueTh}
        </span>
      </div>
      <span className={cx("text-xs", MUTED)}>{row.lockedReasonTh}</span>
    </div>
  );
}

function RoleApply({ model, actions }: { model: MessagesModel; actions: BookingSettingsActions }) {
  const targets = model.roles.applyTargets ?? [];
  const [who, setWho] = useState(targets[0]?.membershipId ?? "");
  const [role, setRole] = useState("PROVIDER");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const roleCols = model.roles.columns.filter((c) => c.role === "LEAD" || c.role === "PROVIDER" || c.role === "CASHIER");
  const run = async () => {
    if (!who || !actions.applyRolePreset) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await actions.applyRolePreset({ membershipId: who, role });
      setMsg(r.ok ? { ok: true, text: "ใช้ชุดสิทธิ์แล้ว" } : { ok: false, text: failText(r) });
    } catch {
      setMsg({ ok: false, text: "ใช้ชุดสิทธิ์ไม่สำเร็จ ลองอีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      data-bk-role-apply=""
      className="flex flex-wrap items-end gap-2 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs">
        <span className={MUTED}>พนักงาน</span>
        <select className="input min-h-11" value={who} onChange={(e) => setWho(e.target.value)} disabled={!targets.length}>
          {targets.length === 0 && <option value="">ยังไม่มีพนักงานในสาขานี้</option>}
          {targets.map((t) => (
            <option key={t.membershipId} value={t.membershipId}>
              {t.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[160px] flex-col gap-1 text-xs">
        <span className={MUTED}>ชุดสิทธิ์</span>
        <select className="input min-h-11" value={role} onChange={(e) => setRole(e.target.value)}>
          {roleCols.map((c) => (
            <option key={c.role} value={c.role}>
              {c.labelTh}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={BTN_PRIMARY} disabled={busy || !who}>
        ใช้ชุดสิทธิ์กับพนักงาน
      </button>
      <a href="/app/settings/staff" className="inline-flex min-h-11 items-center text-sm font-semibold text-[color:var(--color-accent)]">
        แก้สิทธิ์รายคน ›
      </a>
      {msg && <span className={cx("w-full text-sm", msg.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]")}>{msg.text}</span>}
    </form>
  );
}

function Roles({ model, actions }: { model: MessagesModel; actions: BookingSettingsActions }) {
  const { columns, rows } = model.roles;
  return (
    <section id="roles" data-bk-roles="" className={cx(CARD, "flex flex-col gap-3")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">สิทธิ์ผู้ใช้ (ค่าเริ่มตามแม่แบบ)</h2>
        <span className={cx("text-xs", MUTED)}>ใช้ระบบสิทธิ์กลางของร้าน · ทุกการเปลี่ยนแปลงลงบันทึก</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-[color:var(--color-surface-2)] text-xs">
              <th className={cx("px-3 py-2 text-left font-semibold", MUTED)}>ทำอะไรได้</th>
              {columns.map((c) => (
                <th key={c.role} data-role={c.role} className={cx("px-2 py-2 text-center font-semibold", MUTED)}>
                  {c.labelTh}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-role-row={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2.5">{r.labelTh}</td>
                {columns.map((c) => {
                  const on = r.cells[c.role] === true;
                  return (
                    <td key={c.role} data-role-cell={`${r.id}:${c.role}`} data-checked={String(on)} className="px-2 py-2.5 text-center">
                      <span
                        aria-label={on ? "ทำได้" : "ทำไม่ได้"}
                        className={cx(
                          "inline-flex h-5 w-5 items-center justify-center rounded border text-xs",
                          on ? "border-transparent bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)]",
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cx("text-xs", MUTED)}>
        ผู้จัดการทำได้ทุกข้อในสาขาที่ดูแล · {columns.filter((c) => c.role !== "OWNER").map((c) => c.labelTh).join(" / ")} คือชุดสิทธิ์ของบทบาทพนักงาน — ใช้ชุดกับพนักงานทีละคนด้านล่าง แล้วปรับรายข้อได้ที่หน้าผู้ใช้งาน
      </p>
      {model.roles.applyTargets !== null && <RoleApply model={model} actions={actions} />}
    </section>
  );
}

function Privacy({ model }: { model: MessagesModel }) {
  const tf = model.tenantForm;
  if (!tf) return null;
  return (
    <section data-bk-privacy="" className={CARD}>
      <h2 className="pb-1 text-base font-bold">ความเป็นส่วนตัว (ทั้งร้าน)</h2>
      <p className={cx("text-xs", MUTED)}>ครบกำหนดแล้วระบบลบชื่อ/เบอร์ของลูกค้า walk-in ที่ไม่ได้เป็นสมาชิก (นัด/บัตรคิวยังอยู่เพื่อรายงานและบิล)</p>
      {fieldsOf(tf).map((f) => (
        <SettingRow key={f.key} form={tf} f={f} />
      ))}
    </section>
  );
}

export default function BookingMessagesSettings({ model, actions }: { model: MessagesModel; actions: BookingSettingsActions }) {
  const extraKeys = BOOKING_SETTINGS_LAYOUT.messagesKeys.msgSettingsKeys;
  const extra = fieldsOf(model.form).filter((f) => extraKeys.includes(f.key));
  return (
    <DraftProvider forms={[model.form, model.tenantForm]} actions={actions}>
      <div data-bk-settings-page="messages" className="flex flex-col gap-5">
        <PageHead title={`ตั้งค่าการจองและคิว · ${model.unitName}`} desc="ข้อความ · จอ · ตู้ · สิทธิ์ (รวมไว้ในหน้าเดียว — ในแอปแยกเมนูซ้าย)" />
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <SettingsNav basePath={model.basePath} current="messages" />
          <div className="flex min-w-0 flex-col gap-5">
            <section id="messages" data-bk-messages="" className={cx(CARD, "grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]")}>
              <div className="flex min-w-0 flex-col">
                <h2 className="pb-2 text-base font-bold">ข้อความแจ้งเตือน</h2>
                <MessageList model={model} />
                {extra.length > 0 && (
                  <div className="mt-3 border-t pt-1">
                    {extra.map((f) => (
                      <SettingRow key={f.key} form={model.form} f={f} />
                    ))}
                  </div>
                )}
              </div>
              <MessageEditor key={model.selectedKind} model={model} />
            </section>
            <section id="devices" data-bk-devices="" className="grid items-start gap-5 xl:grid-cols-2">
              <div data-bk-device-card="tv" className={CARD}>
                <h2 className="pb-1 text-base font-bold">จอทีวีเรียกคิว</h2>
                {model.devices.tv.map((r) => (
                  <DeviceRowView key={r.key} form={model.form} row={r} />
                ))}
              </div>
              <div data-bk-device-card="kiosk" className={CARD}>
                <h2 className="pb-1 text-base font-bold">ตู้รับบัตร / เช็กอิน</h2>
                {model.devices.kiosk.map((r) => (
                  <DeviceRowView key={r.key} form={model.form} row={r} />
                ))}
              </div>
            </section>
            <Roles model={model} actions={actions} />
            <Privacy model={model} />
            <a href={`${model.basePath}/settings`} className={cx(BTN_GHOST, "self-start")}>
              ‹ กลับไปแม่แบบและนโยบาย
            </a>
          </div>
        </div>
      </div>
    </DraftProvider>
  );
}
