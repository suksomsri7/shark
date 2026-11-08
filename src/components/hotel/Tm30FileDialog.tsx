"use client";
// SVC H.4 ▸ แจ้งที่พักคนต่างด้าว (ตม.30) — ภายใน 24 ชม. · ระบบไม่ส่งเอง (DH:148)
//   1) ดาวน์โหลดไฟล์สำหรับอัปโหลด (CSV · เปิดด้วย Excel ได้ · คอลัมน์ตามค่าตั้ง) → 2) ส่งเข้าเว็บ ตม. → 3) กรอกเลขรับแจ้ง (+รูปหลักฐาน) "บันทึกว่าแจ้งแล้ว"
//   เลขรับแจ้ง 1 เลขใช้กับหลายคนได้ · ไฟล์มีเลขหนังสือเดินทางเต็มตามแบบ ตม. (ระบบไม่เก็บไฟล์ · บันทึกการส่งออกทุกครั้ง)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markTm30FiledAction, tm30ExportAction } from "@/lib/modules/hotel/actions";
import { FILE_MAX_BYTES, readFileAsDataUrl } from "./checkin-shared";

type Props = { unitSlug: string; guestIds: string[]; canFile: boolean; compact?: boolean };

export default function Tm30FileDialog({ unitSlug, guestIds, canFile, compact = false }: Props) {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  const none = guestIds.length === 0;
  const download = async () => {
    setBusy(true);
    setMsg({ tone: "", text: "" });
    try {
      const r = await tm30ExportAction(unitSlug, { guestIds, format: "csv" });
      if (!r.ok || typeof r.base64 !== "string") {
        setMsg({ tone: "err", text: r.reason ?? "เตรียมไฟล์ไม่สำเร็จ" });
        return;
      }
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: typeof r.contentType === "string" ? r.contentType : "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = typeof r.name === "string" ? r.name : "tm30.csv";
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ tone: "ok", text: `เตรียมไฟล์ ${String(r.count ?? guestIds.length)} คนแล้ว — อัปโหลดเข้าเว็บ ตม. แล้วกรอกเลขรับแจ้ง` });
    } finally {
      setBusy(false);
    }
  };
  const pickEvidence = async (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > FILE_MAX_BYTES) {
      setMsg({ tone: "err", text: "ไฟล์หลักฐานใหญ่เกิน 8 MB" });
      return;
    }
    setEvidence(await readFileAsDataUrl(f));
  };
  const file = async () => {
    setBusy(true);
    try {
      const r = await markTm30FiledAction(unitSlug, { guestIds, tm30Ref: ref, ...(evidence ? { evidence: { dataUrl: evidence } } : {}) });
      if (!r.ok) {
        setMsg({ tone: "err", text: r.reason ?? "บันทึกไม่สำเร็จ" });
        return;
      }
      setMsg({ tone: "ok", text: "บันทึกว่าแจ้ง ตม.30 แล้ว" });
      setRef("");
      setEvidence("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-tm30-dialog="" className={`flex min-w-0 flex-col gap-2 ${compact ? "" : "rounded-xl border border-[color:var(--color-line)] p-3"}`}>
      {!compact ? <p className="text-sm font-bold">แจ้งที่พักคนต่างด้าว (ตม.30) — ภายใน 24 ชม.</p> : null}
      <button type="button" disabled={busy || none} onClick={() => void download()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm disabled:opacity-50">
        ดาวน์โหลดไฟล์สำหรับอัปโหลด ({guestIds.length} คน · CSV เปิดด้วย Excel ได้)
      </button>
      {canFile ? (
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขรับแจ้งจากเว็บ ตม.
            <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className="min-h-11 w-full min-w-0 rounded-lg border border-[color:var(--color-line)] px-3 text-sm" />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-dashed border-[color:var(--color-line)] px-3 text-xs">
            {evidence ? "แนบหลักฐานแล้ว" : "แนบรูป/ไฟล์หลักฐาน"}
            <input type="file" accept="image/png,image/jpeg,application/pdf" className="sr-only" onChange={(e) => void pickEvidence(e.target.files?.[0])} />
          </label>
          <button type="button" disabled={busy || none || !ref.trim()} onClick={() => void file()} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-accent)] px-4 text-sm font-bold text-white disabled:opacity-50">
            บันทึกว่าแจ้งแล้ว
          </button>
        </div>
      ) : null}
      {msg.text ? (
        <p role="status" className={`text-xs ${msg.tone === "err" ? "text-[color:var(--color-danger)]" : "text-emerald-700"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
