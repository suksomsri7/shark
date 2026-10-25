"use client";

// LanAgentsCard.tsx — POS P3-SKEL U ▸ CD-SKELU-9: การ์ด "ตัวช่วยพิมพ์ LAN" ในแท็บเครื่องและเครื่องพิมพ์ (ภาพ 17B "เครื่องพิมพ์ครัว (LAN 192.168.1.50)")
//   รายการ (หน้าเพจอ่าน listPrintAgents ครั้งเดียวต่อการเปิดจอ · ไม่ poll): ชื่อ · เครื่องพิมพ์ host:port + ชิปงาน · ออนไลน์/ออฟไลน์จากเซิร์ฟเวอร์ · เห็นล่าสุด (ฝั่งจอหลัง mount)
//   ลงทะเบียน (ชื่อ 1–60 · เครื่องพิมพ์ 1–8: ชื่อ · ที่อยู่ · พอร์ตจากหน้าเพจ PRINT_PRINTER_PORTS · งาน ใบครัว/ใบเสร็จ/ไม่ระบุ) → registerPrintAgentAction →
//   กล่องโทเคนแสดงครั้งเดียว (คัดลอก + "จะแสดงครั้งเดียว" · ปิด/ออกจากหน้า = ล้าง · ไม่ log) · เพิกถอน (ยืนยันในบรรทัด) → revokePrintAgentAction
// 🔴 ผู้ถือ pos.device.manage เท่านั้น (แท็บนี้แสดงเฉพาะผู้ถือ — เซิร์ฟเวอร์ตรวจซ้ำ) · ติดตั้ง agent = เจ้าของ/ผู้ดูแลระบบ (แพ็กเกจ OUT)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม/ช่อง ≥ 44px

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { registerPrintAgentAction, revokePrintAgentAction } from "@/lib/modules/pos/platform-ui-actions";
import type { PrintAgentView, PrintTarget } from "@/lib/modules/pos/print-relay";
import { lanMessageKey } from "@/components/pos/print/lan";
import { Chip, InlineNote, SettingsCard } from "./settings-ui";

type Draft = { name: string; host: string; port: number; target: "" | PrintTarget };
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
/** ตรวจที่อยู่เครื่องพิมพ์ฝั่งจอ (กติกาเดียวกับ print-relay — 169.254/16 ไม่รับ) · เซิร์ฟเวอร์ตรวจซ้ำ */
const hostOk = (h: string) => {
  const m = IPV4.exec(h);
  return m ? m.slice(1).every((x) => Number(x) <= 255) && !(m[1] === "169" && m[2] === "254") : HOST.test(h);
};

type Props = {
  systemId: string;
  unitId: string;
  agents: PrintAgentView[];
  onAgents: (next: PrintAgentView[]) => void;
  /** พอร์ตที่เซิร์ฟเวอร์รับ (PRINT_PRINTER_PORTS จากหน้าเพจ) */
  ports: readonly number[];
};

export function LanAgentsCard({ systemId, unitId, agents, onAgents, ports }: Props) {
  const t = useTranslations("pos.platform");
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [printers, setPrinters] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeFor, setRevokeFor] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  // HF-418: เวลาเห็นล่าสุดจัดรูปฝั่งจอหลัง mount เท่านั้น
  const seen = (iso: string | null) =>
    !iso ? t("print.neverSeen") : mounted ? t("print.lastSeen", { time: new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) }) : "";
  const blank = (): Draft => ({ name: "", host: "", port: ports[0] ?? 9100, target: "" });
  const openForm = () => {
    setName("");
    setPrinters([blank()]);
    setErr(null);
    setFormOpen(true);
  };
  const setP = (i: number, patch: Partial<Draft>) => setPrinters((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const submit = async () => {
    if (busy) return;
    const n = name.trim();
    if (!n || [...n].length > 60) return setErr(t("print.nameBad"));
    for (const [i, p] of printers.entries()) if (!p.name.trim() || p.name.trim().length > 40 || !hostOk(p.host.trim())) return setErr(t("print.printerBad", { n: i + 1 }));
    const targets = printers.map((p) => p.target).filter(Boolean);
    if (new Set(targets).size !== targets.length) return setErr(t("print.targetDup"));
    setBusy(true);
    setErr(null);
    try {
      const r = await registerPrintAgentAction({
        systemId,
        unitId,
        input: { name: n, printers: printers.map((p) => ({ name: p.name.trim(), host: p.host.trim(), port: p.port, ...(p.target ? { target: p.target } : {}) })) },
      });
      if (r && r.ok === true) {
        onAgents([...agents, r.agent]);
        setFormOpen(false);
        setToken({ name: r.agent.name, value: r.token }); // แสดงครั้งเดียว · ไม่ log
      } else setErr(t(lanMessageKey(r?.code)));
    } catch {
      setErr(t("print.errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await revokePrintAgentAction({ systemId, unitId, agentId: id });
      setRevokeFor(null);
      if (r && r.ok === true) onAgents(agents.map((a) => (a.id === r.agent.id ? r.agent : a)));
      else setErr(t(lanMessageKey(r?.code)));
    } catch {
      setErr(t("print.errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.value);
      setCopied(true);
    } catch {
      /* เบราว์เซอร์ไม่ให้คัดลอก — ผู้ใช้เลือกข้อความเองได้ */
    }
  };
  const closeToken = () => {
    setToken(null);
    setCopied(false);
  };
  const targetText = (x: PrintTarget | undefined) => (x === "kitchen" ? t("print.targetKitchen") : x === "receipt" ? t("print.targetReceipt") : t("print.targetNone"));
  const field = "input h-11 w-full min-w-0 rounded-[11px] px-3 text-[14px]";
  const live = agents.filter((a) => !a.revokedAt).length;

  return (
    <SettingsCard testid="pos-device-lan-card" className="gap-4">
      <div className="flex items-center gap-3">
        <RegisterIcon name="print" size={17} />
        <h2 className="min-w-0 flex-1 text-[17px] font-bold tracking-[-0.01em]">{t("print.card")}</h2>
        <Chip tone={live ? "plain" : "muted"}>{live}</Chip>
      </div>
      <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("print.agentHowto")}</p>
      <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("print.notProven")}</p>

      {agents.length === 0 ? (
        <p className="rounded-[12px] border border-dashed px-4 py-3 text-[13.5px] text-[color:var(--color-muted)]">{t("print.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-[13px] border">
          {agents.map((a, i) => (
            <li key={a.id} data-testid={`pos-device-lan-agent-${i}`} data-revoked={a.revokedAt ? "1" : undefined} className={`flex flex-col gap-2 px-4 py-3 ${a.revokedAt ? "opacity-60" : ""}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <b className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.name}</b>
                <Chip tone={a.revokedAt ? "muted" : a.online ? "accent" : "muted"}>{a.revokedAt ? t("print.revoked") : a.online ? t("print.online") : t("print.offline")}</Chip>
              </div>
              <small className="text-[12px] text-[color:var(--color-muted)]">{seen(a.lastSeenAt)}</small>
              <ul className="flex flex-col gap-1">
                {a.printers.map((p, j) => (
                  <li key={j} className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="font-mono text-[12.5px] tabular-nums text-[color:var(--color-ink-soft)]">
                      {p.host}:{p.port}
                    </span>
                    <span className="inline-flex h-6 items-center rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-muted)]">{targetText(p.target)}</span>
                  </li>
                ))}
              </ul>
              {!a.revokedAt &&
                (revokeFor === a.id ? (
                  <div role="alertdialog" aria-label={t("print.revoke")} className="flex flex-wrap items-center gap-2 rounded-[11px] border border-[color:var(--color-danger)] px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">{t("print.revokeConfirm", { name: a.name })}</span>
                    <button data-testid="pos-device-lan-revoke-cancel" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-3 text-[13px]" onClick={() => setRevokeFor(null)}>
                      {t("print.cancel")}
                    </button>
                    <button data-testid="pos-device-lan-revoke-confirm" type="button" disabled={busy} className="btn min-h-11 rounded-[11px] border-[color:var(--color-danger)] px-3 text-[13px] font-semibold text-[color:var(--color-danger)]" onClick={() => void revoke(a.id)}>
                      {t("print.revoke")}
                    </button>
                  </div>
                ) : (
                  <button data-testid={`pos-device-lan-revoke-${i}`} type="button" disabled={busy} className="btn btn-ghost min-h-11 w-fit rounded-[11px] px-4 text-[13.5px] text-[color:var(--color-danger)]" onClick={() => setRevokeFor(a.id)}>
                    {t("print.revoke")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      {token && (
        <div data-testid="pos-device-lan-token" role="status" className="flex flex-col gap-2 rounded-[13px] border-[1.5px] border-[color:var(--color-ink)] px-4 py-3">
          <b className="text-[14px]">{t("print.tokenTitle", { name: token.name })}</b>
          <code className="break-all rounded-[9px] bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-[12.5px]">{token.value}</code>
          <p className="text-[12.5px] font-semibold text-[color:var(--color-danger)]">{t("print.tokenOnce")}</p>
          <div className="flex flex-wrap gap-2">
            <button data-testid="pos-device-lan-token-copy" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[13.5px]" onClick={() => void copyToken()}>
              {copied ? t("print.copied") : t("print.copy")}
            </button>
            <button data-testid="pos-device-lan-token-close" type="button" className="btn btn-primary min-h-11 rounded-[11px] px-4 text-[13.5px] font-semibold" onClick={closeToken}>
              {t("print.done")}
            </button>
          </div>
        </div>
      )}

      {formOpen ? (
        <form
          data-testid="pos-device-lan-register"
          noValidate
          className="@container flex flex-col gap-3 rounded-[13px] border px-4 py-4" /* POS P4.3 fix8 ▸ CD-P43-15: ฟอร์ม = @container ของ fieldset ด้านล่าง ◂ */
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("print.name")}</span>
            <input data-testid="pos-device-lan-name" className={field} value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <span className="text-[13px] font-bold text-[color:var(--color-ink-soft)]">{t("print.printers")}</span>
          {printers.map((p, i) => (
            /* POS P4.3 fix8 ▸ CD-P43-15: ช่องเครื่องพิมพ์สองคอลัมน์เมื่อฟอร์มกว้าง ≥ 360px (ช่องละ ≥ ~163px) — เดิม sm:grid-cols-2 ตามจอ ⇒ คอลัมน์แคบก็ยังผ่าครึ่ง ·
               ที่ 1024 (ซ้อน · ฟอร์ม 306px) = คอลัมน์เดียว · 1280 แถบกาง (ฟอร์ม 546px) = สองคอลัมน์ ◂ */
            <fieldset key={i} className="grid min-w-0 grid-cols-1 gap-2 rounded-[11px] border px-3 py-3 @min-[360px]:grid-cols-2">
              <input data-testid={`pos-device-lan-printer-name-${i}`} aria-label={t("print.printerName")} placeholder={t("print.printerName")} className={field} value={p.name} maxLength={40} autoComplete="off" onChange={(e) => setP(i, { name: e.target.value })} />
              <input data-testid={`pos-device-lan-printer-host-${i}`} aria-label={t("print.host")} placeholder={t("print.host")} className={`${field} font-mono`} value={p.host} inputMode="url" autoComplete="off" spellCheck={false} onChange={(e) => setP(i, { host: e.target.value })} />
              <select data-testid={`pos-device-lan-printer-port-${i}`} aria-label={t("print.port")} className={field} value={p.port} onChange={(e) => setP(i, { port: Number(e.target.value) })}>
                {ports.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              <select data-testid={`pos-device-lan-printer-target-${i}`} aria-label={t("print.target")} className={field} value={p.target} onChange={(e) => setP(i, { target: e.target.value === "kitchen" || e.target.value === "receipt" ? e.target.value : "" })}>
                <option value="">{t("print.targetNone")}</option>
                <option value="kitchen">{t("print.targetKitchen")}</option>
                <option value="receipt">{t("print.targetReceipt")}</option>
              </select>
              {printers.length > 1 && (
                <button data-testid={`pos-device-lan-printer-remove-${i}`} type="button" className="btn btn-ghost min-h-11 w-fit rounded-[11px] px-3 text-[13px]" onClick={() => setPrinters((l) => l.filter((_, j) => j !== i))}>
                  {t("print.printerRemove", { n: i + 1 })}
                </button>
              )}
            </fieldset>
          ))}
          {printers.length < 8 && (
            <button data-testid="pos-device-lan-printer-add" type="button" className="inline-flex min-h-11 w-fit items-center text-[13.5px] font-bold text-[color:var(--color-accent)]" onClick={() => setPrinters((l) => [...l, blank()])}>
              {t("print.printerAdd")}
            </button>
          )}
          {err && (
            <InlineNote tone="error" testid="pos-device-lan-error">
              {err}
            </InlineNote>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button data-testid="pos-device-lan-cancel" type="button" className="btn btn-ghost min-h-11 rounded-[11px] px-5 text-[14px]" onClick={() => setFormOpen(false)}>
              {t("print.cancel")}
            </button>
            <button data-testid="pos-device-lan-submit" type="submit" disabled={busy} className="btn btn-primary min-h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-60">
              {busy ? t("print.saving") : t("print.submit")}
            </button>
          </div>
        </form>
      ) : (
        <>
          {err && (
            <InlineNote tone="error" testid="pos-device-lan-error">
              {err}
            </InlineNote>
          )}
          <button data-testid="pos-device-lan-add" type="button" disabled={busy} className="inline-flex min-h-11 w-fit items-center text-[14px] font-bold text-[color:var(--color-accent)]" onClick={openForm}>
            {t("print.add")}
          </button>
        </>
      )}
    </SettingsCard>
  );
}
