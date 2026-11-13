"use client";

// PrintMenu.tsx — ACC T2.7 · ปุ่มพิมพ์ของหน้ารายละเอียดเอกสาร (แทนคำแนะนำ "เติม ?copy=1 ท้าย URL")
//   พิมพ์ (ครั้งแรก = ต้นฉบับ · ครั้งต่อไป = สำเนา) · ดาวน์โหลด PDF · พิมพ์ชุดต้นฉบับ + สำเนา · ออกใบแทน · พิมพ์ต้นฉบับซ้ำ (คำเตือน + ยืนยัน)
//   ร่าง = พิมพ์ร่าง (ไม่บันทึก) · เอกสารชนิดอื่น = พิมพ์ / PDF (บันทึกประวัติ ไม่มีป้ายต้นฉบับ/สำเนา)
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { printDocAction } from "@/lib/modules/account/print-actions";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { LegalWarnings } from "./LegalWarnings";
import { Modal } from "./Modal";

type Req = "PRINT" | "COPY" | "SET" | "REPRINT_ORIGINAL" | "SUBSTITUTE";

export function PrintMenu({
  systemId,
  docId,
  base,
  isTaxInvoice,
  isDraft,
  originalPrinted,
}: {
  systemId: string;
  docId: string;
  base: string;
  isTaxInvoice: boolean;
  isDraft: boolean;
  originalPrinted: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [legal, setLegal] = useState<{ req: Req; warnings: LegalWarning[] } | null>(null);
  const [ack, setAck] = useState<string[]>([]);
  const [sub, setSub] = useState<{ reason: string; date: string } | null>(null);

  const run = (req: Req, channel: "SCREEN" | "PDF", extra?: { ack?: string[]; substituteReason?: string; substituteDate?: string }) =>
    start(async () => {
      setErr(null);
      // เปิดแท็บก่อน await (เบราว์เซอร์บล็อกป๊อปอัปที่เปิดหลัง await) แล้วค่อยใส่ URL
      const w = window.open("about:blank", "_blank");
      const res = await printDocAction({ systemId, docId, request: req, channel, ...extra });
      if (!res.ok) {
        w?.close();
        if (res.legal) {
          setLegal({ req, warnings: res.legal.warnings });
          setAck([]);
        } else setErr(res.reason);
        return;
      }
      if (w) w.location.href = res.url;
      else window.location.href = res.url;
      setLegal(null);
      setSub(null);
      setOpen(false);
      router.refresh();
    });

  if (isDraft) {
    return (
      <a href={`${base}/print/${docId}`} target="_blank" rel="noreferrer" className="btn btn-ghost text-sm" data-testid="doc-print-draft">
        พิมพ์ร่าง
      </a>
    );
  }
  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="doc-print-menu" disabled={pending}>
        พิมพ์ / PDF
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 flex w-64 flex-col rounded-lg border bg-[color:var(--color-surface)] p-1 text-sm shadow-lg" role="menu" data-testid="doc-print-menu-items">
          <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => run("PRINT", "SCREEN")} data-testid="doc-print-print">
            พิมพ์{isTaxInvoice ? (originalPrinted ? " (สำเนา)" : " (ต้นฉบับ)") : ""}
          </button>
          <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => run("PRINT", "PDF")} data-testid="doc-print-pdf">
            ดาวน์โหลด PDF{isTaxInvoice ? (originalPrinted ? " (สำเนา)" : " (ต้นฉบับ)") : ""}
          </button>
          {isTaxInvoice && (
            <>
              {!originalPrinted && (
                <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => run("SET", "SCREEN")} data-testid="doc-print-set">
                  พิมพ์ชุด ต้นฉบับ + สำเนา
                </button>
              )}
              {originalPrinted && (
                <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => run("COPY", "SCREEN")} data-testid="doc-print-copy">
                  พิมพ์สำเนา
                </button>
              )}
              <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => setSub({ reason: "", date: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) })} data-testid="doc-print-substitute">
                ออกใบแทน (ลูกค้าทำต้นฉบับหาย)
              </button>
              {originalPrinted && (
                <button type="button" role="menuitem" className="rounded px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" onClick={() => run("REPRINT_ORIGINAL", "SCREEN")} data-testid="doc-print-reprint">
                  พิมพ์ต้นฉบับซ้ำ…
                </button>
              )}
            </>
          )}
        </div>
      )}
      {err && (
        <p className="mt-1 text-xs text-[color:var(--color-danger)]" role="alert" data-testid="doc-print-error">
          {err}
        </p>
      )}
      {legal && (
        <Modal open title="ยืนยันก่อนพิมพ์" onClose={() => setLegal(null)} testId="doc-print-legal">
          <LegalWarnings warnings={legal.warnings} onAckChange={setAck} testId="doc-print-legal-warnings" />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setLegal(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending || legal.warnings.some((w) => w.ack && !ack.includes(w.code))} onClick={() => run(legal.req, "SCREEN", { ack })} data-testid="doc-print-legal-confirm">
              ยืนยันและพิมพ์
            </button>
          </div>
        </Modal>
      )}
      {sub && (
        <Modal open title="ออกใบแทนใบกำกับภาษี" onClose={() => setSub(null)} testId="doc-print-substitute-modal">
          <p className="text-xs text-[color:var(--color-muted)]">ใบแทน = สำเนาใบเดิม + ใบแทนออกให้ครั้งที่ · วันที่ออก · สาเหตุ · ลายมือชื่อผู้ออก (ม.86/12 · ประกาศ VAT ฉ.36) — ระบบเรียงครั้งที่ให้เอง</p>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            สาเหตุย่อ (บังคับ)
            <input className="input" maxLength={200} value={sub.reason} onChange={(e) => setSub({ ...sub, reason: e.target.value })} data-testid="doc-print-substitute-reason" />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-sm">
            วันที่ออกใบแทน
            <input type="date" className="input w-48" value={sub.date} onChange={(e) => setSub({ ...sub, date: e.target.value })} data-testid="doc-print-substitute-date" />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setSub(null)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending || !sub.reason.trim()} onClick={() => run("SUBSTITUTE", "SCREEN", { substituteReason: sub.reason, substituteDate: sub.date })} data-testid="doc-print-substitute-confirm">
              ออกใบแทนและพิมพ์
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
