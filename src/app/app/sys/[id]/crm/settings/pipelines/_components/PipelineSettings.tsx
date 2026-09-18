"use client";

// PipelineSettings.tsx — ตั้งค่า pipeline (CRM v2 · ใบ C1.5 · R-A): สร้าง · แก้ชื่อ · ตั้งค่าเริ่มต้น · เก็บถาวร (ยืนยัน + เหตุผล) · กู้คืน
// 🔴 เก็บถาวรได้เฉพาะเมื่อไม่มีดีลที่เปิดอยู่ (บริการตรวจใต้ล็อก — ข้อความไทยแสดงในหน้าต่าง) · ไม่ใช้ alert()

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { archivePipelineAction, createPipelineAction, restorePipelineAction, updatePipelineAction } from "@/lib/modules/crm/pipelines-actions";
import { DEAL_REASON_MIN, type PipelineDto } from "@/lib/modules/crm/deals-shared";

type Row = PipelineDto & { openDeals: number };

const TEMPLATES: Record<string, { label: string; stages: { name: string; kind: "OPEN" | "WON" | "LOST"; probability: number }[] }> = {
  standard: {
    label: "มาตรฐาน 5 ขั้น (ผู้สนใจ → ติดต่อ → เสนอราคา → ชนะ/แพ้)",
    stages: [
      { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 },
      { name: "ติดต่อแล้ว", kind: "OPEN", probability: 30 },
      { name: "เสนอราคา", kind: "OPEN", probability: 60 },
      { name: "ปิดการขายได้", kind: "WON", probability: 100 },
      { name: "ไม่สำเร็จ", kind: "LOST", probability: 0 },
    ],
  },
  short: {
    label: "สั้น 3 ขั้น (กำลังคุย → ชนะ/แพ้)",
    stages: [
      { name: "กำลังคุย", kind: "OPEN", probability: 40 },
      { name: "ปิดการขายได้", kind: "WON", probability: 100 },
      { name: "ไม่สำเร็จ", kind: "LOST", probability: 0 },
    ],
  },
};

export function PipelineSettings({ systemId, pipelines }: { systemId: string; pipelines: Row[] }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(pipelines.map((p) => [p.id, p.name])));
  const [newName, setNewName] = useState("");
  const [tpl, setTpl] = useState("standard");
  const [archive, setArchive] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };

  return (
    <div className="flex flex-col gap-4" data-testid="pipeline-settings">
      <ul className="flex flex-col gap-3">
        {pipelines.map((p) => (
          <li key={p.id} className="card flex flex-col gap-2 p-4" data-testid={`pl-row-${p.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={names[p.id] ?? ""}
                onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))}
                aria-label="ชื่อ pipeline"
                disabled={!!p.archivedAt}
                className="input min-w-0 flex-1 text-sm"
                data-testid={`pl-name-${p.id}`}
              />
              <button type="button" className="btn btn-ghost text-sm" disabled={busy || !!p.archivedAt || names[p.id] === p.name} onClick={() => void run(() => updatePipelineAction(systemId, p.id, { name: names[p.id] ?? "" }), "บันทึกชื่อแล้ว")} data-testid={`pl-rename-${p.id}`}>
                บันทึกชื่อ
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[color:var(--color-muted)]">
                {p.stages.length} ขั้น · ดีลเปิด {p.openDeals.toLocaleString("th-TH")}
                {p.isDefault ? " · ค่าเริ่มต้น" : ""}
                {p.archivedAt ? " · เก็บถาวรแล้ว" : ""}
              </span>
              <Link href={`/app/sys/${systemId}/crm/settings/stages?pipeline=${encodeURIComponent(p.id)}`} className="underline" data-testid={`pl-stages-link-${p.id}`}>
                แก้ขั้น
              </Link>
              {!p.archivedAt && !p.isDefault && (
                <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => updatePipelineAction(systemId, p.id, { isDefault: true }), "ตั้งเป็นค่าเริ่มต้นแล้ว")} data-testid={`pl-default-${p.id}`}>
                  ตั้งเป็นค่าเริ่มต้น
                </button>
              )}
              {!p.archivedAt ? (
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  disabled={busy}
                  onClick={() => {
                    setArchive(p);
                    setReason("");
                    setConfirm(false);
                    setModalErr(null);
                  }}
                  data-testid={`pl-archive-${p.id}`}
                >
                  เก็บถาวร
                </button>
              ) : (
                <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => restorePipelineAction(systemId, p.id), "กู้คืนแล้ว")} data-testid={`pl-restore-${p.id}`}>
                  กู้คืน
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form
        className="card flex flex-col gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return setMsg({ ok: false, text: "ใส่ชื่อ pipeline ก่อน" });
          void run(() => createPipelineAction(systemId, { name: newName.trim(), stages: TEMPLATES[tpl]!.stages }), "สร้าง pipeline แล้ว").then((ok) => {
            if (ok) setNewName("");
          });
        }}
        data-testid="pl-new-form"
      >
        <h2 className="font-semibold">สร้าง pipeline ใหม่</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อ</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input text-sm" placeholder="เช่น ขายองค์กร (B2B)" data-testid="pl-new-name" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ขั้นตั้งต้น (แก้ทีหลังได้)</span>
            <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="input text-sm" data-testid="pl-new-template">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="pl-new-submit">
            สร้าง pipeline
          </button>
        </div>
      </form>

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="pl-msg">
          {msg.text}
        </p>
      )}

      {archive && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="เก็บ pipeline ถาวร" data-testid="pl-archive-modal">
          <div className="card flex w-full max-w-md flex-col gap-3 p-4">
            <h2 className="font-semibold">เก็บ &quot;{archive.name}&quot; ถาวร</h2>
            <p className="text-sm text-[color:var(--color-muted)]">ทำได้เมื่อไม่มีดีลที่เปิดอยู่ใน pipeline นี้ · ดีลที่ปิดแล้วยังอยู่ครบ · กู้คืนได้ภายหลัง</p>
            <label className="flex flex-col gap-1 text-sm">
              <span>เหตุผล (อย่างน้อย {DEAL_REASON_MIN} ตัวอักษร)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input text-sm" data-testid="pl-archive-reason" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="pl-archive-confirm" />
              ยืนยันเก็บ pipeline นี้ถาวร
            </label>
            {modalErr && <p className="text-sm text-[color:var(--color-danger)]" role="alert">{modalErr}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setArchive(null)} data-testid="pl-archive-cancel">
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy}
                onClick={async () => {
                  if (!confirm) return setModalErr("ติ๊กช่องยืนยันก่อน");
                  if (reason.trim().length < DEAL_REASON_MIN) return setModalErr(`ใส่เหตุผลอย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร`);
                  setBusy(true);
                  const r = await archivePipelineAction(systemId, archive.id, confirm, reason.trim());
                  setBusy(false);
                  if (!r.ok) return setModalErr(r.error);
                  setArchive(null);
                  setMsg({ ok: true, text: "เก็บ pipeline ถาวรแล้ว" });
                  router.refresh();
                }}
                data-testid="pl-archive-submit"
              >
                เก็บถาวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
