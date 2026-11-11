"use client";

// ApiKeysCard.tsx — การ์ด "คีย์ API ของระบบขายหน้าร้าน" ในแท็บ "การเชื่อมต่อระบบ SHARK" (ใบ P2.13 · U-lite §7 · brief §2.6 · มติ 3)
//   หัวแผง (แบบแผงช่องทางขาย/วิธีรับเงิน): ไอคอน · ชื่อ · คำอธิบาย · ปุ่ม "สร้างคีย์" (มีคีย์แล้ว + canCreate)
//   สถานะ: กำลังโหลด · โหลดไม่สำเร็จ + ลองอีกครั้ง · คำปฏิเสธ (การ์ดยังอยู่ · ไม่มีปุ่ม) · ว่าง (คำอธิบาย + ลิงก์คู่มือ /developers/pos + สร้างคีย์) ·
//   รายการ (ชื่อ · prefix ตัวอักษรคงที่ · ชุดสิทธิ์ · สาขา · วันที่สร้าง · ใช้ล่าสุด · หมดอายุ · ชิปสถานะ · ปุ่มเพิกถอนของคีย์ที่ยังใช้ได้)
//   กล่องสร้าง (RegisterDialog): ชื่อ ≤ 60 · ชุดสิทธิ์ 3 การ์ด · อายุ 30/90/365/ไม่หมดอายุ (ปริยาย 365) · สาขา (ทุกสาขา / เลือก — allUnits false = ต้องเลือก) ·
//     สำเร็จ ⇒ แผงคีย์ดิบครั้งเดียว (ช่องอ่านอย่างเดียว + คัดลอก + คำเตือน + "เสร็จแล้ว" ปิดแล้วโหลดรายการใหม่ · แตะม่านไม่ปิด)
//   กล่องยืนยันเพิกถอน (alertdialog · ปุ่มแดงแบบกล่องปิดการลงบัญชี)
// 🔴 canCreate false = อ่านอย่างเดียว (ไม่มีปุ่มสร้าง/เพิกถอน + หมายเหตุ) · เซิร์ฟเวอร์ตรวจซ้ำทุกครั้ง
// 🔴 คำปฏิเสธแสดงผ่านคีย์ข้อความ (ไม่แสดง message ไทยของเซิร์ฟเวอร์) · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px
// 🔴 คีย์ดิบอยู่ใน state ของกล่องเท่านั้น (ไม่เก็บลง storage · ไม่ log) — ปิดกล่อง = ทิ้ง

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { createPosApiKeyAction, listPosApiKeysAction, revokePosApiKeyAction } from "@/lib/modules/pos/api-key-actions";
import { formatShortDate } from "@/lib/ui/date";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

type ListOk = Extract<Awaited<ReturnType<typeof listPosApiKeysAction>>, { ok: true }>;
type KeyRow = ListOk["keys"][number];

/** ชุดสิทธิ์ที่ออกได้จากหน้านี้ (ตรงกับ POS_BUNDLE_IDS ของ api-key-actions.ts) → คีย์ข้อความ */
const BUNDLES = [
  { id: "pos-read", key: "read" },
  { id: "pos-operate", key: "operate" },
  { id: "pos-admin", key: "admin" },
] as const;
type BundleId = (typeof BUNDLES)[number]["id"];
const TTLS = [30, 90, 365, 0] as const;
const NAME_MAX = 60;
const DOCS_HREF = "/developers/pos";

/** รหัสคำปฏิเสธ → คีย์ข้อความ (ตามงานที่ถูกปฏิเสธ) */
function refusalKey(code: string, op: "list" | "create" | "revoke"): string {
  if (code === "PERMISSION_DENIED") return op === "create" ? "refusal.createDenied" : op === "revoke" ? "refusal.revokeDenied" : "refusal.denied";
  if (code === "VALIDATION") return "refusal.validation";
  if (code === "NOT_FOUND") return "refusal.notFound";
  return "refusal.unknown";
}

export function ApiKeysCard({ systemId }: { systemId: string }) {
  const t = useTranslations("pos.settings.api");
  const locale = useLocale();
  const [data, setData] = useState<ListOk | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadErr, setLoadErr] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);

  const load = useCallback(async () => {
    setLoadErr(false);
    try {
      const r = await listPosApiKeysAction({ systemId });
      if (!r.ok) {
        setData(null);
        setRefusal(refusalKey(r.code, "list"));
        return;
      }
      setRefusal(null);
      setData(r);
      setLoadedAt(Date.now());
    } catch {
      setLoadErr(true);
    }
  }, [systemId]);
  useEffect(() => {
    void load();
  }, [load]);

  const keys = data?.keys ?? [];
  const canCreate = !!data?.canCreate;
  const canRevoke = !!data?.canRevoke;
  const date = (iso: string) => formatShortDate(iso, locale);
  const bundleLabel = (k: KeyRow) => {
    const b = BUNDLES.find((x) => x.id === k.bundle);
    return b ? t(`bundle.${b.key}.title`) : t("bundle.custom", { count: k.scopeCount });
  };
  const branchLabel = (k: KeyRow) => (k.units.length === 0 ? t("allBranches") : k.units.map((u) => u.name ?? t("unknownBranch")).join(", "));

  const row = (k: KeyRow) => {
    const revoked = !!k.revokedAt;
    const expired = !revoked && !!k.expiresAt && new Date(k.expiresAt).getTime() <= loadedAt;
    const active = !revoked && !expired;
    return (
      <li key={k.id} data-testid={`pos-settings-api-row-${k.id}`} data-state={revoked ? "revoked" : expired ? "expired" : "active"} className="border-t first:border-t-0">
        <div className={`flex min-w-0 items-start gap-3 px-[14px] py-2.5 md:gap-4 ${active ? "" : "opacity-70"}`}>
          <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] border bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="lock" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <b className="min-w-0 break-words text-[13px] font-semibold">{k.name}</b>
              <span
                data-testid={`pos-settings-api-status-${k.id}`}
                className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-[7px] border px-2 text-[11.5px] ${
                  revoked ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : expired ? "text-[color:var(--color-muted)]" : "border-[color:var(--color-ink)] font-bold"
                }`}
              >
                {revoked ? t("status.revoked") : expired ? t("status.expired") : t("status.active")}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[color:var(--color-muted)]">
              <span data-testid={`pos-settings-api-prefix-${k.id}`} className="font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                {`${k.prefix}…`}
              </span>
              <span>{bundleLabel(k)}</span>
              <span className="min-w-0 break-words">{branchLabel(k)}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[color:var(--color-muted)]">
              <span>{t("created", { date: date(k.createdAt) })}</span>
              <span>{k.lastUsedAt ? t("lastUsed", { date: date(k.lastUsedAt) }) : t("neverUsed")}</span>
              <span>{!k.expiresAt ? t("noExpiry") : expired ? t("expired") : t("expires", { date: date(k.expiresAt) })}</span>
            </div>
          </div>
          {canRevoke && !revoked && (
            <button
              data-testid={`pos-settings-api-row-revoke-${k.id}`}
              type="button"
              aria-label={t("revokeLabel", { name: k.name })}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[11px] border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-3 text-[13px] font-semibold text-[color:var(--color-danger)]"
              onClick={() => setRevoking(k)}
            >
              {t("revoke")}
            </button>
          )}
        </div>
      </li>
    );
  };

  const docsLink = (
    <Link data-testid="pos-settings-api-docs" href={DOCS_HREF} className="inline-flex min-h-11 items-center text-[12.5px] font-bold text-[color:var(--color-accent)] underline-offset-2 hover:underline">
      {t("docs")}
    </Link>
  );

  return (
    <section data-testid="pos-settings-api" aria-label={t("title")} className="flex min-w-0 flex-col gap-2">
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-bold">
        <RegisterIcon name="lock" size={16} />
        {t("title")}
        <span className="min-w-0 text-[12.5px] font-normal text-[color:var(--color-muted)]">{t("subtitle")}</span>
        {canCreate && keys.length > 0 && (
          <button data-testid="pos-settings-api-create" type="button" className="ml-auto inline-flex min-h-11 items-center text-[13px] font-bold text-[color:var(--color-accent)]" onClick={() => setCreating(true)}>
            {`+ ${t("create")}`}
          </button>
        )}
      </div>
      {loadErr ? (
        <div data-testid="pos-settings-api-error" role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] border px-[14px] py-3 text-[13px] text-[color:var(--color-danger)]">
          <span className="min-w-0 flex-1">{t("loadFailed")}</span>
          <button data-testid="pos-settings-api-retry" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[13px]" onClick={() => void load()}>
            {t("retry")}
          </button>
        </div>
      ) : refusal ? (
        <div data-testid="pos-settings-api-refusal" role="alert" className="flex items-start gap-3 rounded-[12px] border border-[color:var(--color-danger)] px-[14px] py-3 text-[13px] text-[color:var(--color-ink-soft)]">
          <RegisterIcon name="warn" size={16} className="mt-[1px] shrink-0 text-[color:var(--color-danger)]" />
          <span className="min-w-0 flex-1">{t(refusal)}</span>
        </div>
      ) : !data ? (
        <p data-testid="pos-settings-api-loading" className="rounded-[12px] border px-[14px] py-4 text-[13px] text-[color:var(--color-muted)]">
          {t("loading")}
        </p>
      ) : keys.length === 0 ? (
        <div data-testid="pos-settings-api-empty" className="flex min-w-0 flex-col gap-2 rounded-[12px] border bg-[color:var(--color-surface)] px-[14px] py-3.5">
          <b className="text-[13.5px] font-semibold">{t("emptyTitle")}</b>
          <p className="text-[12.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("emptyBody")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {canCreate && (
              <button data-testid="pos-settings-api-empty-create" type="button" className="btn btn-primary h-11 rounded-[11px] px-4 text-[14px] font-semibold" onClick={() => setCreating(true)}>
                {t("create")}
              </button>
            )}
            {docsLink}
          </div>
        </div>
      ) : (
        <>
          <ul data-testid="pos-settings-api-list" className="overflow-hidden rounded-[12px] border bg-[color:var(--color-surface)]">
            {keys.map(row)}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4">{docsLink}</div>
        </>
      )}
      {data && !canCreate && (
        <p data-testid="pos-settings-api-readonly" className="text-[12px] text-[color:var(--color-muted)]">
          {t("readOnly")}
        </p>
      )}
      {creating && data && (
        <CreateKeyDialog
          systemId={systemId}
          units={data.units}
          allUnits={data.allUnits}
          onClose={(created) => {
            setCreating(false);
            if (created) void load();
          }}
        />
      )}
      {revoking && (
        <RevokeDialog
          systemId={systemId}
          k={revoking}
          onClose={(done) => {
            setRevoking(null);
            if (done) void load();
          }}
        />
      )}
    </section>
  );
}

// ─────────────────── กล่องสร้างคีย์ + แผงคีย์ดิบครั้งเดียว ───────────────────
function CreateKeyDialog({ systemId, units, allUnits, onClose }: { systemId: string; units: ListOk["units"]; allUnits: boolean; onClose: (created: boolean) => void }) {
  const t = useTranslations("pos.settings.api");
  const [name, setName] = useState("");
  const [bundle, setBundle] = useState<BundleId>("pos-read");
  const [ttl, setTtl] = useState<(typeof TTLS)[number]>(365);
  // allUnits false ⇒ บังคับเลือกสาขา (ไม่มีตัวเลือก "ทุกสาขา")
  const [scope, setScope] = useState<"all" | "pick">(allUnits ? "all" : "pick");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "ok" | "fail">("idle");
  const rawRef = useRef<HTMLInputElement>(null);

  const toggleUnit = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (busy) return;
    const clean = name.trim();
    if (!clean || clean.length > NAME_MAX) return setErr(t("dialog.nameRequired", { max: NAME_MAX }));
    if (scope === "pick" && picked.length === 0) return setErr(allUnits ? t("dialog.pickOne") : t("dialog.branchesRequired"));
    setBusy(true);
    setErr(null);
    try {
      const r = await createPosApiKeyAction({ systemId, name: clean, bundle, ttlDays: ttl, ...(scope === "pick" ? { unitIds: picked } : {}) });
      if (r.ok) setRaw(r.rawKey);
      else setErr(t(refusalKey(r.code, "create")));
    } catch {
      setErr(t("refusal.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const copyRaw = async () => {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopy("ok");
      return;
    } catch {
      // ไม่มี clipboard API / ไม่ใช่ secure context ⇒ เลือกข้อความในช่องแล้วใช้คำสั่งคัดลอกเดิมของเบราว์เซอร์
    }
    const el = rawRef.current;
    if (el) {
      el.focus();
      el.select();
      try {
        setCopy(document.execCommand("copy") ? "ok" : "fail");
        return;
      } catch {
        /* ตกไปบอกให้คัดลอกเอง */
      }
    }
    setCopy("fail");
  };

  if (raw)
    return (
      <RegisterDialog onDismiss={() => undefined} locked>
        <div data-testid="pos-settings-api-raw" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("raw.title")}>
          <SheetGrab />
          <h2 className="text-[20px] font-bold">{t("raw.title")}</h2>
          <div role="alert" className="flex items-start gap-2.5 rounded-[12px] border border-[color:var(--color-danger)] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="warn" size={16} className="mt-[2px] shrink-0 text-[color:var(--color-danger)]" />
            <span>{t("raw.warning")}</span>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            {t("raw.label")}
            <input
              ref={rawRef}
              data-testid="pos-settings-api-raw-key"
              readOnly
              value={raw}
              spellCheck={false}
              autoComplete="off"
              className="input h-11 w-full font-mono text-[13px] font-normal"
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button data-testid="pos-settings-api-raw-copy" type="button" className="btn btn-ghost h-11 gap-2 rounded-[11px] px-4 text-[14px]" onClick={() => void copyRaw()}>
              <RegisterIcon name={copy === "ok" ? "check" : "doc"} size={15} />
              {copy === "ok" ? t("raw.copied") : t("raw.copy")}
            </button>
            {copy === "fail" && (
              <span data-testid="pos-settings-api-raw-copy-failed" role="status" className="min-w-0 flex-1 text-[12.5px] text-[color:var(--color-danger)]">
                {t("raw.copyFailed")}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button data-testid="pos-settings-api-raw-done" type="button" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px] font-semibold" onClick={() => onClose(true)}>
              {t("raw.done")}
            </button>
          </div>
        </div>
      </RegisterDialog>
    );

  return (
    <RegisterDialog onDismiss={() => !busy && onClose(false)} locked={busy}>
      <div data-testid="pos-settings-api-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("dialog.title")}>
        <SheetGrab />
        <div>
          <h2 className="text-[20px] font-bold">{t("dialog.title")}</h2>
          <p className="mt-1 text-[13px] text-[color:var(--color-muted)]">{t("dialog.desc")}</p>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {t("dialog.name")}
          <input
            data-testid="pos-settings-api-name"
            className="input h-11 w-full text-[15px] font-normal"
            value={name}
            maxLength={NAME_MAX}
            placeholder={t("dialog.namePlaceholder")}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="text-[11.5px] font-normal text-[color:var(--color-muted)]">{t("dialog.nameHint", { max: NAME_MAX })}</span>
        </label>
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1.5 text-[13px] font-semibold">{t("dialog.bundle")}</legend>
          {BUNDLES.map((b) => (
            <label
              key={b.id}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5 ${bundle === b.id ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]" : "bg-[color:var(--color-surface)]"}`}
            >
              <input data-testid={`pos-settings-api-bundle-${b.id}`} type="radio" name="pos-api-bundle" className="mt-[3px] size-4 shrink-0" checked={bundle === b.id} onChange={() => setBundle(b.id)} />
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px] font-semibold">{t(`bundle.${b.key}.title`)}</b>
                <span className="block text-[12px] leading-[1.5] text-[color:var(--color-muted)]">{t(`bundle.${b.key}.desc`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {t("dialog.ttl")}
          <select data-testid="pos-settings-api-ttl" className="input h-11 w-full text-[15px] font-normal" value={ttl} disabled={busy} onChange={(e) => setTtl(Number(e.target.value) as (typeof TTLS)[number])}>
            {TTLS.map((d) => (
              <option key={d} value={d}>
                {t(`dialog.ttl${d}`)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1.5 text-[13px] font-semibold">{t("dialog.branches")}</legend>
          {allUnits && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                <input data-testid="pos-settings-api-scope-all" type="radio" name="pos-api-scope" className="size-4" checked={scope === "all"} onChange={() => setScope("all")} />
                {t("dialog.branchesAll")}
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                <input data-testid="pos-settings-api-scope-pick" type="radio" name="pos-api-scope" className="size-4" checked={scope === "pick"} onChange={() => setScope("pick")} />
                {t("dialog.branchesPick")}
              </label>
            </div>
          )}
          {!allUnits && <p className="text-[12px] text-[color:var(--color-muted)]">{units.length ? t("dialog.branchesRequired") : t("dialog.noBranches")}</p>}
          {scope === "pick" && units.length > 0 && (
            <div data-testid="pos-settings-api-units" className="flex flex-col rounded-[12px] border">
              {units.map((u) => (
                <label key={u.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-t px-3 text-[13.5px] first:border-t-0">
                  <input data-testid={`pos-settings-api-unit-${u.id}`} type="checkbox" className="size-4 shrink-0" checked={picked.includes(u.id)} onChange={() => toggleUnit(u.id)} />
                  <span className="min-w-0 flex-1 break-words">{u.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {err && (
          <p data-testid="pos-settings-api-create-error" role="alert" className="text-[13.5px] text-[color:var(--color-danger)]">
            {err}
          </p>
        )}
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button data-testid="pos-settings-api-create-cancel" type="button" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" disabled={busy} onClick={() => onClose(false)}>
            {t("dialog.cancel")}
          </button>
          <button
            data-testid="pos-settings-api-create-submit"
            type="button"
            className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px] font-semibold disabled:opacity-60"
            disabled={busy || (!allUnits && units.length === 0)}
            onClick={() => void submit()}
          >
            {busy ? t("dialog.submitting") : t("dialog.submit")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}

// ─────────────────── กล่องยืนยันเพิกถอน ───────────────────
function RevokeDialog({ systemId, k, onClose }: { systemId: string; k: KeyRow; onClose: (done: boolean) => void }) {
  const t = useTranslations("pos.settings.api");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await revokePosApiKeyAction({ systemId, keyId: k.id });
      if (r.ok) return onClose(true);
      setErr(t(refusalKey(r.code, "revoke")));
    } catch {
      setErr(t("refusal.unknown"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <RegisterDialog onDismiss={() => !busy && onClose(false)} locked={busy}>
      <div data-testid="pos-settings-api-revoke-confirm" className={REG_DIALOG_PANEL} role="alertdialog" aria-modal="true" aria-label={t("revokeDialog.title", { name: k.name })}>
        <SheetGrab />
        <h2 className="break-words text-[20px] font-bold">{t("revokeDialog.title", { name: k.name })}</h2>
        <p className="font-mono text-[13px] text-[color:var(--color-ink-soft)]">{`${k.prefix}…`}</p>
        <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("revokeDialog.body")}</p>
        {err && (
          <p data-testid="pos-settings-api-revoke-error" role="alert" className="text-[13.5px] text-[color:var(--color-danger)]">
            {err}
          </p>
        )}
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button data-testid="pos-settings-api-revoke-cancel" type="button" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" disabled={busy} onClick={() => onClose(false)}>
            {t("revokeDialog.cancel")}
          </button>
          <button
            data-testid="pos-settings-api-revoke-yes"
            type="button"
            className="btn h-12 rounded-[13px] border-[color:var(--color-danger)] bg-[color:var(--color-danger)] px-5 text-[15px] font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void revoke()}
          >
            {busy ? t("revokeDialog.working") : t("revokeDialog.confirm")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
