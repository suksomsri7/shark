"use client";

// IntegrationCredsCard.tsx — POS P3-SKEL U ▸ CD-SKELU-3: การ์ด credentials เดียว ใช้สามที่ (PLATFORM ในลิ้นชักช่องทาง · SLIP_VERIFY ในแผ่นตรวจสลิป · ETAX ในแผ่น e-Tax)
//   อ่านครั้งเดียวตอนเปิด (readIntegrationCredentialsAction) · หัว = ชิปสถานะ (ยังไม่ตั้งกุญแจ / รอ credentials + กรอกยังไม่ครบ / กรอกครบแล้ว) + บรรทัด "โครง ✅ · สวิตช์รอ W4"
//   ช่องละแถว (ป้าย pos.platform.fields.<name> · ไม่รู้จัก = ชื่อ ASCII) · ค่าลับ = password ว่างเสมอ (placeholder = ค่าปิดบังของเซิร์ฟเวอร์) · ค่าไม่ลับแสดงค่าที่เก็บ
//   บันทึก (saveIntegrationCredentialsAction · เจ้าของร้านเท่านั้น) ส่งเฉพาะช่องที่พิมพ์ · ล้างช่อง = ส่ง "" หลังยืนยัน · ทุกผลล้างช่องพิมพ์ + ผลแทนมุมมอง
//   ทดสอบ (testIntegrationConnectionAction) ปิดจนกว่า COMPLETE · ผลเป็นคำปฏิเสธเสมอ (NOT_CONFIGURED / ADAPTER_PENDING) — จอไม่เคยบอก "เชื่อมแล้ว"
// 🔴 ค่าลับไม่เคยกลับมาแสดง · ไม่อยู่ใน state หลังบันทึก · ไม่ลง console/URL/toast · ไม่แสดง message/label ไทยของเซิร์ฟเวอร์ (ใช้ messageKey + คีย์ของจอ)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม/ช่อง ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { readIntegrationCredentialsAction, saveIntegrationCredentialsAction, testIntegrationConnectionAction } from "@/lib/modules/pos/integration-creds-actions";
import type { PosIntegrationKind, PosIntegrationView } from "@/lib/modules/pos/integration-creds";

/** ชื่อช่องที่จอมีป้ายแปล (pos.platform.fields.<name>) — นอกนี้แสดงชื่อ ASCII ตรงตัว */
const KNOWN_FIELDS = new Set(["client_id", "client_secret", "merchant_id", "restaurant_id", "partner_id", "partner_key", "shop_id", "app_key", "app_secret", "seller_id", "webhookSecret", "api_key", "branch_id", "api_user"]);
/** messageKey จากเซิร์ฟเวอร์ใช้ได้เฉพาะใต้ platform.* (กันคีย์แปลก) */
const keyOk = (k: unknown): k is string => typeof k === "string" && /^platform\.[A-Za-z.]+$/.test(k);

type Props = {
  systemId: string;
  unitId: string;
  kind: PosIntegrationKind;
  provider: string;
  channelId?: string | null;
  /** เจ้าของร้าน (บันทึกได้) — อื่น = อ่านอย่างเดียว · เซิร์ฟเวอร์ตัดสินซ้ำ */
  isOwner: boolean;
};

type Note = { tone: "ok" | "error"; text: string } | null;

export function IntegrationCredsCard({ systemId, unitId, kind, provider, channelId = null, isOwner }: Props) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const [view, setView] = useState<PosIntegrationView | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "clear" | "test" | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [clearFor, setClearFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const msg = (k: unknown) => (keyOk(k) && tpos.has(k) ? tpos(k) : t("errors.unknown"));
  const target = { kind, provider, ...(channelId ? { channelId } : {}) };

  useEffect(() => {
    let live = true;
    setLoadErr(null);
    readIntegrationCredentialsAction({ systemId, unitId, input: target })
      .then((r) => {
        if (!live) return;
        if (r.ok === true) setView(r);
        else setLoadErr(msg(r.messageKey));
      })
      .catch(() => live && setLoadErr(t("creds.loadError")));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อ่านครั้งเดียวต่อเป้าหมาย (tick = ลองใหม่)
  }, [systemId, unitId, kind, provider, channelId, tick]);

  const labelOf = (name: string) => (KNOWN_FIELDS.has(name) ? t(`fields.${name}`) : name);
  const keyMissing = !!view && !view.keyConfigured;
  const locked = !isOwner || keyMissing || !!busy;
  // ช่องที่ "พิมพ์จริง": ค่าลับ = ไม่ว่าง · ค่าไม่ลับ = ไม่ว่างและต่างจากค่าที่เก็บ (ล้างช่อง = ปุ่มล้าง ไม่ใช่ลบข้อความ)
  const typed = view ? view.fields.flatMap((f): [string, string][] => { const v = draft[f.name]; return v !== undefined && v.trim() !== "" && (f.secret || v !== f.masked) ? [[f.name, v]] : []; }) : [];

  const apply = (r: Awaited<ReturnType<typeof saveIntegrationCredentialsAction>>, okText: string) => {
    setDraft({}); // ทุกผล: ล้างช่องที่พิมพ์ (ค่าลับไม่อยู่ใน state หลังบันทึก)
    if (r.ok === true) {
      setView(r);
      setNote({ tone: "ok", text: okText });
    } else setNote({ tone: "error", text: msg(r.messageKey) });
  };

  const save = async () => {
    if (locked || !typed.length) {
      if (!typed.length) setNote({ tone: "error", text: t("creds.nothingTyped") });
      return;
    }
    setBusy("save");
    setNote(null);
    setTestNote(null);
    const fields = Object.fromEntries(typed);
    try {
      apply(await saveIntegrationCredentialsAction({ systemId, unitId, input: { ...target, fields } }), t("creds.saved"));
    } catch {
      setDraft({});
      setNote({ tone: "error", text: t("errors.unknown") });
    } finally {
      setBusy(null);
    }
  };

  const clear = async (name: string) => {
    if (locked) return;
    setBusy("clear");
    setClearFor(null);
    setNote(null);
    setTestNote(null);
    try {
      apply(await saveIntegrationCredentialsAction({ systemId, unitId, input: { ...target, fields: { [name]: "" } } }), t("creds.saved"));
    } catch {
      setDraft({});
      setNote({ tone: "error", text: t("errors.unknown") });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!view || view.status !== "COMPLETE" || busy) return;
    setBusy("test");
    setTestNote(null);
    try {
      const r = await testIntegrationConnectionAction({ systemId, unitId, input: target });
      // โครง: ผลเป็นคำปฏิเสธเสมอ — แสดงคีย์ของรหัส (NOT_CONFIGURED / ADAPTER_PENDING) · ไม่มีทาง "เชื่อมแล้ว"
      setTestNote(r && r.ok === false ? msg(r.messageKey) : t("errors.unknown"));
    } catch {
      setTestNote(t("errors.unknown"));
    } finally {
      setBusy(null);
    }
  };

  const copyWebhook = async () => {
    if (!view?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(view.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* เบราว์เซอร์ไม่ให้คัดลอก — ผู้ใช้เลือกข้อความเองได้ */
    }
  };

  if (loadErr)
    return (
      <section data-testid="pos-channel-creds" data-state="error" className="flex flex-col gap-2 rounded-[12px] border px-3.5 py-3 text-[13px]">
        <p data-testid="pos-channel-creds-error" role="alert" className="text-[color:var(--color-danger)]">
          {loadErr}
        </p>
        <button data-testid="pos-channel-creds-retry" type="button" className="btn btn-ghost min-h-11 w-fit rounded-[11px] px-4 text-[13px]" onClick={() => setTick((n) => n + 1)}>
          {t("creds.retry")}
        </button>
      </section>
    );
  if (!view)
    return (
      <section data-testid="pos-channel-creds" data-state="loading" className="rounded-[12px] border px-3.5 py-3 text-[13px] text-[color:var(--color-muted)]">
        {t("creds.loading")}
      </section>
    );

  const chip = keyMissing ? t("status.keyMissingShort") : view.status === "COMPLETE" ? t("status.complete") : t("status.awaitingCreds");
  const inputCls = "input h-11 w-full min-w-0 rounded-[11px] px-3 text-[14px] disabled:opacity-70";
  return (
    <section
      data-testid="pos-channel-creds"
      data-kind={view.kind}
      data-provider={view.provider}
      data-status={keyMissing ? "KEY_MISSING" : view.status}
      data-row-status={view.status}
      className="flex min-w-0 flex-col gap-3 rounded-[12px] border px-3.5 py-3.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <RegisterIcon name="lock" size={15} />
        <h3 className="min-w-0 flex-1 text-[14px] font-bold">{t("creds.title")}</h3>
        <span
          data-testid="pos-channel-creds-status"
          className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-[12px] ${keyMissing ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : view.status === "COMPLETE" ? "font-semibold" : "text-[color:var(--color-muted)]"}`}
        >
          {chip}
        </span>
      </div>
      <p className="text-[12px] text-[color:var(--color-muted)]">
        {t("status.switchPending")}
        {!keyMissing && view.status === "DRAFT" ? ` · ${t("status.draft")}` : ""}
      </p>
      {keyMissing && (
        <p data-testid="pos-channel-creds-key-missing" role="status" className="rounded-[10px] border border-[color:var(--color-danger)] px-3 py-2 text-[12.5px] text-[color:var(--color-danger)]">
          {t("status.keyMissing")}
        </p>
      )}
      {!isOwner && (
        <p data-testid="pos-channel-creds-owner-only" className="flex items-start gap-2 rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
          <RegisterIcon name="lock" size={13} className="mt-[3px] shrink-0" />
          <span>{t("ownerOnly")}</span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        {view.fields.map((f) => {
          const label = labelOf(f.name);
          const v = draft[f.name];
          return (
            <div key={f.name} className="flex min-w-0 flex-col gap-1.5">
              <label className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]" htmlFor={`pos-creds-${f.name}`}>
                <span className="min-w-0 break-all">{label}</span>
                <span className="font-normal text-[color:var(--color-muted)]">{f.required ? t("creds.required") : t("creds.optional")}</span>
                <span className="flex-1" />
                <span className={`font-normal ${f.filled ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]"}`}>{f.filled ? t("creds.filled") : t("creds.empty")}</span>
              </label>
              <div className="flex min-w-0 items-center gap-2">
                {f.secret ? (
                  <input
                    id={`pos-creds-${f.name}`}
                    data-testid={`pos-channel-creds-field-${f.name}`}
                    data-secret="1"
                    className={inputCls}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={v ?? ""}
                    placeholder={f.filled ? f.masked : ""}
                    disabled={locked}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, [f.name]: e.target.value }));
                      setNote(null);
                    }}
                  />
                ) : (
                  <input
                    id={`pos-creds-${f.name}`}
                    data-testid={`pos-channel-creds-field-${f.name}`}
                    className={inputCls}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={v ?? f.masked}
                    disabled={locked}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, [f.name]: e.target.value }));
                      setNote(null);
                    }}
                  />
                )}
                {isOwner && f.filled && !keyMissing && (
                  <button
                    data-testid={`pos-channel-creds-clear-${f.name}`}
                    type="button"
                    className="btn btn-ghost min-h-11 shrink-0 rounded-[11px] px-3 text-[13px]"
                    disabled={!!busy}
                    aria-label={t("creds.clearConfirm", { field: label })}
                    onClick={() => setClearFor(f.name)}
                  >
                    {t("creds.clear")}
                  </button>
                )}
              </div>
              {clearFor === f.name && (
                <div role="alertdialog" aria-label={t("creds.clearConfirm", { field: label })} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[color:var(--color-danger)] px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1">{t("creds.clearConfirm", { field: label })}</span>
                  <button data-testid="pos-channel-creds-cancel-clear" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-3 text-[13px]" onClick={() => setClearFor(null)}>
                    {t("creds.cancel")}
                  </button>
                  <button data-testid="pos-channel-creds-confirm-clear" type="button" disabled={!!busy} className="btn min-h-11 rounded-[11px] border-[color:var(--color-danger)] px-3 text-[13px] font-semibold text-[color:var(--color-danger)]" onClick={() => void clear(f.name)}>
                    {t("creds.clearYes")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {view.fields.some((f) => f.secret) && <small className="text-[12px] text-[color:var(--color-muted)]">{t("creds.secretHint")}</small>}
      </div>

      {view.webhookUrl && (
        <div className="flex min-w-0 flex-col gap-1.5 border-t pt-3">
          <label className="text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]" htmlFor="pos-creds-webhook">
            {t("status.webhookUrl")}
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <input
              id="pos-creds-webhook"
              data-testid="pos-channel-creds-webhook"
              className="input h-11 w-full min-w-0 rounded-[11px] bg-[color:var(--color-surface-2)] px-3 font-mono text-[12px]"
              readOnly
              value={view.webhookUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button data-testid="pos-channel-creds-webhook-copy" type="button" className="btn btn-ghost min-h-11 shrink-0 rounded-[11px] px-3 text-[13px]" onClick={() => void copyWebhook()}>
              {copied ? t("creds.copied") : t("creds.copy")}
            </button>
          </div>
          <small className="text-[12px] text-[color:var(--color-muted)]">{t("status.webhookPending")}</small>
        </div>
      )}

      {note?.tone === "error" && (
        <p data-testid="pos-channel-creds-error" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
          {note.text}
        </p>
      )}
      {note?.tone === "ok" && (
        <p data-testid="pos-channel-creds-saved" role="status" className="text-[12.5px] text-[color:var(--color-ink-soft)]">
          {note.text}
        </p>
      )}
      {testNote && (
        <p data-testid="pos-channel-creds-result" role="status" className="rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
          {testNote}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && (
          <button data-testid="pos-channel-creds-save" type="button" disabled={locked} title={keyMissing ? t("status.keyMissing") : undefined} className="btn btn-primary min-h-11 rounded-[11px] px-4 text-[13.5px] font-semibold disabled:opacity-60" onClick={() => void save()}>
            {busy === "save" ? t("creds.saving") : t("creds.save")}
          </button>
        )}
        <button
          data-testid="pos-channel-creds-test"
          type="button"
          disabled={view.status !== "COMPLETE" || !!busy}
          title={view.status !== "COMPLETE" ? t("status.testDisabled") : undefined}
          className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[13.5px] disabled:opacity-60"
          onClick={() => void test()}
        >
          {busy === "test" ? t("creds.testing") : t("creds.test")}
        </button>
        {view.status !== "COMPLETE" && <small className="text-[12px] text-[color:var(--color-muted)]">{t("status.testDisabled")}</small>}
      </div>
    </section>
  );
}
