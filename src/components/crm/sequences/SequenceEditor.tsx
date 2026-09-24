"use client";

// SequenceEditor.tsx — ตัวแก้ไขลำดับการติดตาม + รายชื่อผู้ลงทะเบียน + สถิติต่อขั้น (ใบ C2.2 · ภาพ 07 ล่าง)
// 🔴 client component — import เฉพาะ server actions ของหน้า (ห้าม import โมดูล CRM ที่แตะ prisma · fitness F2.3)
// 🔴 แก้ "ขั้น" ขณะมีผู้ลงทะเบียน = ขึ้นเวอร์ชันใหม่ (บริการเป็นผู้ตัดสิน) — หน้าจอบอกล่วงหน้าเสมอ
// 🔴 AUDIT-CLASS X9: เก็บลำดับ = อันตราย — ต้องติ๊กยืนยัน + ใส่เหตุผล ≥ 5 ตัวอักษร ก่อนปุ่มทำงาน
// 🔴 รูปหน้าจอตามภาพ 07 (ล่าง): แถบภาพรวม "ขั้นเรียงเป็นแถวพร้อมตัวเลขต่อขั้น" ด้านบน · ตาราง "ลงทะเบียนอยู่"
//    (ผู้ติดต่อ · บริษัท · ขั้นปัจจุบัน · เข้าเมื่อ) · ตัวแก้ไขขั้นแบบเต็มถูกพับไว้หลังปุ่ม "แก้ไขขั้น"
// 🔴 ลำดับที่ถูกเก็บแล้ว = โหมด "อ่านอย่างเดียว" (แก้/บันทึกไม่ได้) แต่ยังกด "ทำการเก็บต่อ" ได้ถ้ายังมีคนค้าง (มติผู้คุมงานรอบสอง ข้อ 1)
// 🔴 ข้อผิดพลาดแสดงในหน้า (inline) ไม่ใช้ alert

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  archiveSequenceAction,
  pauseEnrollmentAction,
  resumeEnrollmentAction,
  stopEnrollmentAction,
  updateSequenceAction,
} from "@/app/app/sys/[id]/crm/settings/sequences/actions";
import { emptyStep, StepFields, stepPayload, stepsChanged } from "./StepFields";
import type { SeqEditorData, SeqHead, SeqStepDraft } from "./types";

const lbl = "flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]";
const thaiTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "—");

export function SequenceEditor({ data }: { data: SeqEditorData }) {
  const router = useRouter();
  const { systemId, canManage } = data;
  const [head, setHead] = useState<SeqHead>(data.head);
  const [steps, setSteps] = useState<SeqStepDraft[]>(data.steps);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editSteps, setEditSteps] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const archived = !!head.archivedAt;
  // แก้ได้จริงต้อง "มีสิทธิ์ + ลำดับยังไม่ถูกเก็บ" (ลำดับที่ถูกเก็บแล้วแก้ไม่ได้ — บริการก็ปฏิเสธอีกชั้น)
  const canEdit = canManage && !archived;
  // 🔴 จำนวนคนที่ยังเดินอยู่ = ผลรวมจาก `versions` (นับทั้งตารางในบริการ) ไม่ใช่จากรายชื่อ 500 แถวที่แสดงด้านล่าง (มติผู้คุมงานรอบสอง ข้อ 2)
  const liveCount = data.versions.reduce((n, v) => n + v.live, 0);
  const elsewhereLive = data.versions.filter((v) => v.version !== data.statsVersion).reduce((n, v) => n + v.live, 0);
  const patchStep = (key: string, p: Partial<SeqStepDraft>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      const a = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = a;
      return copy;
    });

  // 🔴 ส่ง `steps` เฉพาะตอนที่ "ขั้น" เปลี่ยนจริง (มติรีวิว C2.2 ข้อ 3): เดิมส่งทุกครั้ง ⇒ แค่แก้ชื่อหรือติ๊ก "หยุดเมื่อดีลแพ้"
  //    ก็สร้างชุดขั้นซ้ำที่เวอร์ชัน+1 แล้วสถิติที่ร้านเห็นกลายเป็น 0/0/0/0 ทั้งที่งานจริงยังเดินอยู่บนเวอร์ชันเก่า
  const dirtySteps = stepsChanged(steps, data.steps);
  const stopWhen = [head.stopOnReply ? "ลูกค้าตอบกลับ" : "", head.stopOnWon ? "ดีลชนะ" : "", head.stopOnLost ? "ดีลแพ้" : "", "ยกเลิกรับข่าวสาร", "หยุดเอง"].filter(Boolean).join(" · ");

  const save = async () => {
    setBusy(true);
    const r = await updateSequenceAction(systemId, head.id, {
      name: head.name,
      description: head.description,
      stopOnReply: head.stopOnReply,
      stopOnWon: head.stopOnWon,
      stopOnLost: head.stopOnLost,
      businessDaysOnly: head.businessDaysOnly,
      active: head.active,
      sendWindow: head.useWindow ? { from: head.windowFrom, to: head.windowTo } : null,
      ...(dirtySteps ? { steps: steps.map(stepPayload) } : {}),
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.versionBumped ? `บันทึกแล้ว — ขึ้นเวอร์ชัน ${r.version.toLocaleString("th-TH")} คนที่กำลังเดินอยู่ยังเดินบนเวอร์ชันเดิมจนจบ` : "บันทึกแล้ว" });
    router.refresh();
  };

  const archive = async () => {
    setBusy(true);
    const r = await archiveSequenceAction(systemId, head.id, { confirm: confirmArchive, reason: archiveReason });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    if (r.remaining > 0) {
      // ลำดับถูกปิดรับคนใหม่แล้วแน่นอน · ที่เหลือคือหยุดคนที่ยังเดินอยู่ (ชนเพดานเวลาของคำขอเดียว) — หน้านี้ยังเปิดได้ จึงกดต่อได้จนหมด
      setMsg({ ok: true, text: `หยุดไปแล้ว ${r.stopped.toLocaleString("th-TH")} คน · ยังเหลืออีก ${r.remaining.toLocaleString("th-TH")} คน — กด “ทำการเก็บต่อ” เพื่อทำงานที่เหลือ` });
      return router.refresh();
    }
    router.push(`/app/sys/${systemId}/crm/settings/sequences`);
  };

  const runEnrollment = async (f: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-seq-editor">
      {archived && (
        <p className="card p-3 text-sm" style={{ borderColor: "var(--color-danger)" }} role="status">
          ลำดับนี้ถูกเก็บแล้ว — ดูได้อย่างเดียว แก้ไขไม่ได้ และไม่รับคนใหม่
          {liveCount > 0
            ? ` · ยังมีผู้ติดต่อ ${liveCount.toLocaleString("th-TH")} คนที่ยังไม่ถูกหยุด — กด “ทำการเก็บต่อ” ด้านล่างเพื่อทำงานที่เหลือให้จบ`
            : " · คนที่อยู่ในลำดับถูกหยุดครบแล้ว"}
        </p>
      )}
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <h2 className="font-semibold">ตั้งค่าลำดับ (เวอร์ชัน {head.version.toLocaleString("th-TH")})</h2>
        <label className={lbl}>
          <span>ชื่อลำดับ</span>
          <input value={head.name} maxLength={120} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, name: e.target.value }))} className="input text-sm" data-testid="crm-seq-name" />
        </label>
        <label className={lbl}>
          <span>คำอธิบาย (ไม่บังคับ)</span>
          <textarea value={head.description} rows={2} maxLength={500} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, description: e.target.value }))} className="input text-sm" data-testid="crm-seq-desc" />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={head.stopOnReply} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, stopOnReply: e.target.checked }))} data-testid="crm-seq-stop-reply" />
            หยุดเมื่อลูกค้าตอบกลับ
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={head.stopOnWon} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, stopOnWon: e.target.checked }))} data-testid="crm-seq-stop-won" />
            หยุดเมื่อดีลชนะ
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={head.stopOnLost} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, stopOnLost: e.target.checked }))} data-testid="crm-seq-stop-lost" />
            หยุดเมื่อดีลแพ้
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={head.businessDaysOnly} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, businessDaysOnly: e.target.checked }))} data-testid="crm-seq-biz-days" />
            นับเฉพาะวันทำการ
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={head.active} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, active: e.target.checked }))} data-testid="crm-seq-active" />
            เปิดรับคนใหม่
          </label>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          ปิด “เปิดรับคนใหม่” = หยุดรับคนใหม่เท่านั้น — คนที่อยู่ในลำดับแล้วยังเดินต่อจนจบตามปกติ (ถ้าต้องการหยุดคนที่เดินอยู่ ใช้ปุ่ม “หยุด” รายคนด้านล่าง หรือเก็บลำดับ)
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-1.5 py-2 text-sm">
            <input type="checkbox" checked={head.useWindow} disabled={!canEdit || busy} onChange={(e) => setHead((h) => ({ ...h, useWindow: e.target.checked }))} data-testid="crm-seq-window-on" />
            ส่งเฉพาะในช่วงเวลา
          </label>
          <label className={lbl}>
            <span>ตั้งแต่</span>
            <input type="time" value={head.windowFrom} disabled={!canEdit || busy || !head.useWindow} onChange={(e) => setHead((h) => ({ ...h, windowFrom: e.target.value }))} className="input w-[120px] text-sm" data-testid="crm-seq-window-from" />
          </label>
          <label className={lbl}>
            <span>ถึง</span>
            <input type="time" value={head.windowTo} disabled={!canEdit || busy || !head.useWindow} onChange={(e) => setHead((h) => ({ ...h, windowTo: e.target.value }))} className="input w-[120px] text-sm" data-testid="crm-seq-window-to" />
          </label>
        </div>
      </section>

      {/* ── ภาพรวมลำดับ (ภาพ 07 ล่าง): การ์ดต่อขั้นเรียงเป็นแถว + ลูกศร + ตัวเลขต่อขั้น · อ่านอย่างเดียว ──
          🔴 ที่ 390 px การ์ดเรียงลงล่าง (ไม่มีความกว้างตายตัวที่ไม่มีคำนำหน้า sm:/md: — กติกา C1.11-S1.6) */}
      <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-seq-overview">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">ภาพรวมลำดับ</h2>
          <span className="break-words text-xs text-[color:var(--color-muted)]">
            เวอร์ชัน {data.statsVersion.toLocaleString("th-TH")} · {data.overview.length.toLocaleString("th-TH")} ขั้น · หยุดเมื่อ: {stopWhen}
          </span>
        </div>
        {data.overview.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ลำดับนี้ยังไม่มีขั้น — กด “แก้ไขขั้น” ด้านล่างเพื่อเพิ่มขั้นแรก</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2 overflow-x-auto pb-1 sm:flex-row sm:items-stretch">
            {data.overview.map((c, i) => (
              <Fragment key={`ov-${c.index}`}>
                {i > 0 && (
                  <span aria-hidden className="self-center text-[color:var(--color-muted)]">
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-1 rounded-md border p-3 sm:min-w-[150px] sm:flex-1 sm:basis-0">
                  <span className="w-fit rounded-full border px-2 py-0.5 text-[11px] text-[color:var(--color-muted)]">{c.chip}</span>
                  <span className="break-words text-sm font-semibold">{c.title}</span>
                  <span className="break-words text-xs text-[color:var(--color-muted)]">{c.detail}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 border-t pt-1 text-xs">
                    {c.counts.length === 0 ? (
                      <span className="text-[color:var(--color-muted)]">ยังไม่มีใครถึงขั้นนี้</span>
                    ) : (
                      c.counts.map((n) => (
                        <span key={`ov-${c.index}-${n.label}`}>
                          <b>{n.n.toLocaleString("th-TH")}</b> <span className="text-[color:var(--color-muted)]">{n.label}</span>
                        </span>
                      ))
                    )}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </section>

      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">ขั้นของลำดับ</h2>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            aria-expanded={editSteps}
            onClick={() => setEditSteps((v) => !v)}
            data-testid="crm-seq-steps-toggle"
          >
            {editSteps ? "ซ่อนตัวแก้ไขขั้น" : "แก้ไขขั้น"}
          </button>
        </div>
        {!editSteps && (
          <p className="text-xs text-[color:var(--color-muted)]">
            ดูขั้นทั้งหมดได้ที่ “ภาพรวมลำดับ” ด้านบน — กด “แก้ไขขั้น” เมื่อต้องการเปลี่ยนเนื้อความหรือสลับลำดับขั้น
          </p>
        )}
        {editSteps && (<>
        {liveCount > 0 && !archived && (
          <p className="text-xs" style={{ color: "var(--color-danger)" }}>
            มีผู้ติดต่อกำลังเดินอยู่ {liveCount.toLocaleString("th-TH")} คน — แก้ขั้นแล้วบันทึกจะขึ้นเวอร์ชันใหม่ คนเดิมเดินจนจบบนเวอร์ชันของตัวเอง
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s.key} className="rounded-md border p-3" data-testid={`crm-seq-step-${s.key}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">ขั้นที่ {(i + 1).toLocaleString("th-TH")}</span>
                <button type="button" className="btn btn-ghost text-xs" disabled={!canEdit || busy || i === 0} onClick={() => move(i, -1)} data-testid={`crm-seq-step-up-${s.key}`}>
                  ขึ้น
                </button>
                <button type="button" className="btn btn-ghost text-xs" disabled={!canEdit || busy || i === steps.length - 1} onClick={() => move(i, 1)} data-testid={`crm-seq-step-down-${s.key}`}>
                  ลง
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  disabled={!canEdit || busy || steps.length <= 1}
                  onClick={() => setSteps((list) => list.filter((x) => x.key !== s.key))}
                  data-testid={`crm-seq-step-remove-${s.key}`}
                >
                  ลบขั้นนี้
                </button>
              </div>
              <StepFields step={s} disabled={!canEdit || busy} onChange={(p) => patchStep(s.key, p)} />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost text-sm" disabled={!canEdit || busy} onClick={() => setSteps((list) => [...list, emptyStep("WAIT", `n${Date.now()}${list.length}`)])} data-testid="crm-seq-step-add">
            + เพิ่มขั้น
          </button>
          <button type="button" className="btn btn-primary text-sm" disabled={!canEdit || busy} onClick={() => void save()} data-testid="crm-seq-save">
            บันทึก
          </button>
        </div>
        </>)}
      </section>

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="crm-seq-editor-msg">
          {msg.text}
        </p>
      )}

      <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-seq-stats">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">สถิติต่อขั้น</h2>
          {/* 🔴 สถิติผูกกับ "เวอร์ชัน" เสมอ (มติรีวิว C2.2 ข้อ 3) — หลังขึ้นเวอร์ชันใหม่ คนที่ยังเดินอยู่อยู่เวอร์ชันเก่า
              ถ้าไม่ให้เลือกดู ตารางจะขึ้น 0 ทั้งแถวทั้งที่งานยังเดิน = หน้าจอโกหกร้าน */}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เวอร์ชันที่ดู</span>
            <select
              value={String(data.statsVersion)}
              disabled={busy}
              onChange={(e) => router.push(`/app/sys/${systemId}/crm/settings/sequences/${head.id}?v=${e.target.value}`)}
              className="input w-[220px] text-sm"
              data-testid="crm-seq-stats-version"
            >
              {data.versions.map((v) => (
                <option key={v.version} value={String(v.version)}>
                  เวอร์ชัน {v.version.toLocaleString("th-TH")}
                  {v.version === head.version ? " (ล่าสุด)" : ""} · กำลังเดิน {v.live.toLocaleString("th-TH")} คน
                </option>
              ))}
            </select>
          </label>
        </div>
        {elsewhereLive > 0 && (
          <p className="text-xs" style={{ color: "var(--color-danger)" }} data-testid="crm-seq-stats-other-version">
            ยังมีผู้ติดต่อ {elsewhereLive.toLocaleString("th-TH")} คนเดินอยู่บนเวอร์ชันอื่น — ตัวเลขด้านล่างนับเฉพาะเวอร์ชัน {data.statsVersion.toLocaleString("th-TH")} เท่านั้น
          </p>
        )}
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm md:min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-1">ขั้น</th>
                <th className="py-1">ทำสำเร็จ</th>
                <th className="py-1">ข้าม</th>
                <th className="py-1">ไม่สำเร็จ</th>
                <th className="py-1">กำลังรอขั้นนี้</th>
              </tr>
            </thead>
            <tbody>
              {data.stats.map((s) => (
                <tr key={s.index} className="border-t" data-testid={`crm-seq-stats-row-${s.index}`}>
                  <td className="py-1.5">
                    {(s.index + 1).toLocaleString("th-TH")}. {s.label}
                  </td>
                  <td className="py-1.5">{s.sent.toLocaleString("th-TH")}</td>
                  <td className="py-1.5">{s.skipped.toLocaleString("th-TH")}</td>
                  <td className="py-1.5">{s.failed.toLocaleString("th-TH")}</td>
                  <td className="py-1.5">{s.active.toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ลงทะเบียนอยู่ (ภาพ 07 ล่าง): ผู้ติดต่อ · บริษัท · ขั้นปัจจุบัน · เข้าเมื่อ + ปุ่มจัดการท้ายแถว ──
          ขอบเขตการมองเห็นเท่าเดิม (บริการกรองด้วย visibleWhere ของผู้ติดต่อ) */}
      <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-seq-enrollments">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">ลงทะเบียนอยู่</h2>
          <span className="text-xs text-[color:var(--color-muted)]">
            {liveCount.toLocaleString("th-TH")} คนกำลังเดิน · แสดง {data.enrollments.length.toLocaleString("th-TH")} รายการล่าสุด
          </span>
        </div>
        {data.enrollments.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีใครอยู่ในลำดับนี้ — ใส่ได้จากหน้าผู้ติดต่อ หรือใส่เป็นกลุ่มจากรายชื่อผู้ติดต่อ</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  <th className="py-1">ผู้ติดต่อ</th>
                  <th className="py-1">บริษัท</th>
                  <th className="py-1">ขั้นปัจจุบัน</th>
                  <th className="py-1">เข้าเมื่อ</th>
                  <th className="py-1 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {data.enrollments.map((e) => (
                  <tr key={e.id} className="border-t align-top" data-testid={`crm-seq-enr-row-${e.id}`}>
                    <td className="py-2 pr-2">
                      <Link href={e.contactHref} className="break-words font-medium underline" data-testid={`crm-seq-enr-contact-${e.id}`}>
                        {e.contactName}
                      </Link>
                      <span className="block break-words text-xs text-[color:var(--color-muted)]">
                        {e.statusLabel}
                        {e.stoppedReason ? ` · ${e.stoppedReason}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-2 break-words text-[color:var(--color-muted)]">{e.companyName ?? "—"}</td>
                    <td className="py-2 pr-2 break-words text-[color:var(--color-muted)]">
                      {e.currentStep ?? "—"}
                      <span className="block text-xs">
                        ขั้นที่ {Math.min(e.stepIndex + 1, Math.max(e.stepCount, 1)).toLocaleString("th-TH")}/{e.stepCount.toLocaleString("th-TH")} · เวอร์ชัน{" "}
                        {e.sequenceVersion.toLocaleString("th-TH")}
                        {e.nextAt ? ` · ถึงคิว ${thaiTime(e.nextAt)}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{e.enteredAgo}</td>
                    <td className="py-2 text-right">
                      <span className="flex flex-wrap justify-end gap-1">
                        {e.status === "ACTIVE" && (
                          <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => void runEnrollment(() => pauseEnrollmentAction(systemId, e.id, head.id), "พักไว้แล้ว")} data-testid={`crm-seq-enr-pause-${e.id}`}>
                            พักไว้
                          </button>
                        )}
                        {e.status === "PAUSED" && (
                          <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => void runEnrollment(() => resumeEnrollmentAction(systemId, e.id, head.id), "ให้เดินต่อแล้ว")} data-testid={`crm-seq-enr-resume-${e.id}`}>
                            เดินต่อ
                          </button>
                        )}
                        {(e.status === "ACTIVE" || e.status === "PAUSED") && (
                          <button
                            type="button"
                            className="btn btn-ghost text-xs"
                            disabled={busy}
                            onClick={() => void runEnrollment(() => stopEnrollmentAction(systemId, e.id, "หยุดจากหน้าลำดับการติดตาม", head.id), "หยุดแล้ว")}
                            data-testid={`crm-seq-enr-stop-${e.id}`}
                          >
                            หยุด
                          </button>
                        )}
                        {e.status !== "ACTIVE" && e.status !== "PAUSED" && <span className="text-xs text-[color:var(--color-muted)]">—</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className="card flex min-w-0 flex-col gap-2 p-4" style={{ borderColor: "var(--color-danger)" }} data-testid="crm-seq-archive-box">
          <h2 className="font-semibold">{archived ? "ทำการเก็บลำดับนี้ต่อ" : "เก็บลำดับนี้"}</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {archived
              ? "ลำดับนี้ถูกเก็บแล้ว (ไม่รับคนใหม่) — กดปุ่มนี้เพื่อหยุดคนที่ยังเดินอยู่ให้ครบ ทำซ้ำได้จนเหลือ 0 คน"
              : "เก็บแล้วลำดับจะไม่รับคนใหม่ และผู้ที่กำลังเดินอยู่ทั้งหมดจะถูกหยุด — ต้องยืนยันและบอกเหตุผล (เก็บไว้ในประวัติการแก้ไข)"}
          </p>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={confirmArchive} disabled={busy} onChange={(e) => setConfirmArchive(e.target.checked)} data-testid="crm-seq-archive-confirm" />
            ยืนยันว่าต้องการเก็บลำดับนี้
          </label>
          <label className={lbl}>
            <span>เหตุผล (อย่างน้อย 5 ตัวอักษร)</span>
            <input value={archiveReason} maxLength={500} disabled={busy} onChange={(e) => setArchiveReason(e.target.value)} className="input text-sm" data-testid="crm-seq-archive-reason" />
          </label>
          <div>
            <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void archive()} data-testid="crm-seq-archive">
              {archived ? "ทำการเก็บต่อ" : "เก็บลำดับ"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
