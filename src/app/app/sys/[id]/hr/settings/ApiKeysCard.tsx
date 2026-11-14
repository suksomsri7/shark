"use client";

// ApiKeysCard.tsx — การ์ด "คีย์ API ของระบบงานบุคคล" ในหน้าตั้งค่า HR (ใบ H4.8 · brief R3 · มติ Q3 · O1)
//   แสดงเฉพาะเจ้าของร้าน (หน้าเลือกแสดง · เซิร์ฟเวอร์ตรวจซ้ำทุกครั้งใน api/keys.ts)
//   รายการคีย์ (ชื่อ · prefix · ชุดสิทธิ์ · ป้ายข้อมูลเงินเดือน · วันที่ · สถานะ · ปุ่มเพิกถอนพร้อมยืนยัน)
//   ฟอร์มออกคีย์: ชื่อ · ชุดสิทธิ์ 3 แบบ (ค่าปริยาย = อ่านอย่างเดียว ไม่มีเงินเดือน) · อายุ 30/90/365/ไม่หมดอายุ ·
//     ชุดข้อมูลเงินเดือน ⇒ ช่องยินยอม (O1 "ข้อมูลเงินเดือนจะออกจากระบบ" — ปิดไว้ก่อน) + ห้ามไม่หมดอายุ
//   สำเร็จ ⇒ คีย์ดิบแสดงครั้งเดียว (state ของการ์ดเท่านั้น · ไม่เก็บ · ไม่ log)
// 🔴 ข้อความทั้งหมดผ่านคีย์ hr.apiKeys.* · คำปฏิเสธของเซิร์ฟเวอร์แสดงตามรหัส · ปุ่ม ≥ 44px · data-testid ตัวอักษรตรง
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { issueHrApiKeyAction, listHrApiKeysAction, revokeHrApiKeyAction } from "@/lib/modules/hr/api-key-actions";
import { formatShortDate } from "@/lib/ui/date";

type ListOk = Extract<Awaited<ReturnType<typeof listHrApiKeysAction>>, { ok: true }>;
type KeyRow = ListOk["keys"][number];
const BUNDLES = ["hr-read", "hr-leave", "hr-payroll-read"] as const;
type BundleId = (typeof BUNDLES)[number];
const TTLS = [30, 90, 365, 0] as const;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";

const refusalKey = (code: string) => (code === "PERMISSION_DENIED" ? "refusal.denied" : code === "VALIDATION" ? "refusal.validation" : code === "NOT_FOUND" ? "refusal.notFound" : "refusal.unknown");

export function ApiKeysCard({ systemId }: { systemId: string }) {
  const t = useTranslations("hr.apiKeys");
  const locale = useLocale();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bundle, setBundle] = useState<BundleId>("hr-read");
  const [ttl, setTtl] = useState<number>(90);
  const [consent, setConsent] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const pay = bundle === "hr-payroll-read";

  const load = useCallback(async () => {
    const r = await listHrApiKeysAction({ systemId });
    if (r.ok) {
      setKeys(r.keys);
      setError(null);
    } else setError(refusalKey(r.code));
  }, [systemId]);
  useEffect(() => {
    void load();
  }, [load]);

  const issue = async () => {
    setBusy(true);
    try {
      const r = await issueHrApiKeyAction({ systemId, name, bundle, ttlDays: pay && ttl === 0 ? 90 : ttl, payConsent: pay && consent });
      if (r.ok) {
        setRawKey(r.rawKey);
        setName("");
        setConsent(false);
        setError(null);
        await load();
      } else setError(refusalKey(r.code));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (keyId: string) => {
    setBusy(true);
    try {
      const r = await revokeHrApiKeyAction({ systemId, keyId });
      setConfirmId(null);
      if (r.ok) await load();
      else setError(refusalKey(r.code));
    } finally {
      setBusy(false);
    }
  };
  const date = (iso: string) => formatShortDate(iso, locale);

  return (
    <section className="card flex flex-col gap-3" id="hr-api-keys" data-testid="hr-apikeys-card">
      <h2 className="text-sm font-medium">{t("title")}</h2>
      <p className="text-xs text-[color:var(--color-muted)]">{t("desc")}</p>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--color-danger)]" data-testid="hr-apikeys-error">
          {t(error)}
        </p>
      )}
      {rawKey && (
        <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="hr-apikeys-raw">
          <p className="text-xs font-medium">{t("rawOnce")}</p>
          <input readOnly value={rawKey} className="input min-h-[44px] font-mono text-xs" aria-label={t("rawOnce")} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className={`${ghost} self-start`} data-testid="hr-apikeys-raw-done" onClick={() => setRawKey(null)}>
            {t("done")}
          </button>
        </div>
      )}
      {keys === null ? (
        <p className="text-xs text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-[color:var(--color-muted)]" data-testid="hr-apikeys-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y" data-testid="hr-apikeys-list">
          {keys.map((k) => {
            const active = !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt).getTime() > Date.now());
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 text-xs" data-testid="hr-apikeys-row">
                <b className="text-[13px]">{k.name}</b>
                <span className="font-mono">{`${k.prefix}…`}</span>
                <span>{t(`bundle.${BUNDLES.includes(k.bundle as BundleId) ? k.bundle : "custom"}`)}</span>
                {k.pay && <span className="rounded border px-1 text-[color:var(--color-danger)]">{t("payBadge")}</span>}
                <span className="text-[color:var(--color-muted)]">{t("created", { date: date(k.createdAt) })}</span>
                <span className="text-[color:var(--color-muted)]">{k.expiresAt ? t("expires", { date: date(k.expiresAt) }) : t("noExpiry")}</span>
                <span>{k.revokedAt ? t("status.revoked") : active ? t("status.active") : t("status.expired")}</span>
                {!k.revokedAt &&
                  (confirmId === k.id ? (
                    <span className="flex gap-2">
                      <button type="button" className={btn} disabled={busy} data-testid="hr-apikeys-revoke-confirm" onClick={() => void revoke(k.id)}>
                        {t("revokeConfirm")}
                      </button>
                      <button type="button" className={ghost} onClick={() => setConfirmId(null)}>
                        {t("cancel")}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className={ghost} data-testid="hr-apikeys-revoke" onClick={() => setConfirmId(k.id)}>
                      {t("revoke")}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 border-t pt-3"
        data-testid="hr-apikeys-form"
        onSubmit={(e) => {
          e.preventDefault();
          void issue();
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          {t("name")}
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="input min-h-[44px]" data-testid="hr-apikeys-name" />
        </label>
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend>{t("bundleLabel")}</legend>
          {BUNDLES.map((b) => (
            <label key={b} className="flex min-h-[44px] items-center gap-2">
              <input type="radio" name="bundle" value={b} checked={bundle === b} onChange={() => setBundle(b)} data-testid={`hr-apikeys-bundle-${b}`} />
              <span>
                <b>{t(`bundle.${b}`)}</b> — {t(`bundleDesc.${b}`)}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-xs">
          {t("ttl")}
          <select value={String(ttl)} onChange={(e) => setTtl(Number(e.target.value))} className="input min-h-[44px] w-40" data-testid="hr-apikeys-ttl">
            {TTLS.filter((d) => !(pay && d === 0)).map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t("noExpiry") : t("days", { n: d })}
              </option>
            ))}
          </select>
        </label>
        {pay && (
          <label className="flex min-h-[44px] items-start gap-2 text-xs" data-testid="hr-apikeys-consent-label">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="hr-apikeys-consent" />
            <span>{t("consent")}</span>
          </label>
        )}
        <button type="submit" className={`${btn} self-start`} disabled={busy || !name.trim() || (pay && !consent)} data-testid="hr-apikeys-issue">
          {t("issue")}
        </button>
      </form>
      <a href="/developers/hr.md" className="text-xs underline" data-testid="hr-apikeys-docs">
        {t("docs")}
      </a>
    </section>
  );
}
