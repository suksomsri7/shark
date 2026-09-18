"use client";

// ฟอร์ม "บันทึกกิจกรรม" (CRM v2 · ใบ C1.6 · ภาพ 08 ซ้าย): ชนิด · ผลลัพธ์ (ชิปจากทะเบียนของระบบ) · ระยะเวลา · ทิศทาง · โน้ต ·
// งานถัดไป · (โน้ต) ปักหมุด + @กล่าวถึงเพื่อนร่วมทีม
// 🔴 ไฟล์ client: import ได้เฉพาะ activities-shared (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma
// 🔴 ตรวจค่าแบบ inline (ไม่ใช้ alert) · บริการตรวจซ้ำทุกข้อ (X6) · ข้อความผิดพลาดไม่โทษผู้ใช้

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_BODY_MAX,
  ACTIVITY_DIRECTION_LABEL,
  ACTIVITY_MANUAL_TYPES,
  ACTIVITY_TITLE_MAX,
  ACTIVITY_TYPE_LABEL,
  isoToThaiLocalInput,
  outcomesOf,
  parseDurationText,
  thaiLocalInputToIso,
  type ActivityType,
  type MentionOption,
} from "@/lib/modules/crm/activities-shared";
import { logActivityAction, searchActivityTargetsAction } from "./actions";

export type ActivityTarget = { contactId?: string | null; companyId?: string | null; dealId?: string | null; customRecordId?: string | null };
type TargetPick = { kind: "CONTACT" | "DEAL" | "COMPANY"; id: string; name: string };
const KIND_LABEL: Record<TargetPick["kind"], string> = { CONTACT: "ผู้ติดต่อ", DEAL: "ดีล", COMPANY: "บริษัท" };
const TIMED: readonly ActivityType[] = ["CALL", "MEETING", "VISIT", "EMAIL", "LINE", "SMS", "WHATSAPP"];

export function LogActivityForm({
  systemId,
  target,
  outcomes,
  mentionOptions,
  defaultType = "CALL",
  onDone,
}: {
  systemId: string;
  /** null = ให้ผู้ใช้เลือกเป้าหมายเอง (หน้ากิจกรรม) */
  target: ActivityTarget | null;
  outcomes: Partial<Record<ActivityType, string[]>>;
  mentionOptions: MentionOption[];
  defaultType?: ActivityType;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<ActivityType>(defaultType);
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [duration, setDuration] = useState("");
  const [direction, setDirection] = useState<"" | "IN" | "OUT">("OUT");
  const [startAt, setStartAt] = useState(() => isoToThaiLocalInput(new Date().toISOString()));
  const [endAt, setEndAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [location, setLocation] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [withNext, setWithNext] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [picked, setPicked] = useState<TargetPick | null>(null);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<TargetPick[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  const chips = outcomesOf(outcomes, type);
  const timed = TIMED.includes(type);

  useEffect(() => {
    if (target) return;
    const s = q.trim();
    const my = ++seq.current;
    if (!s) return;
    const t = setTimeout(() => {
      void searchActivityTargetsAction(systemId, s).then((r) => {
        if (my !== seq.current) return;
        setOptions(r.ok ? r.items : []);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, systemId, target]);

  function reset() {
    setTitle("");
    setOutcome("");
    setDuration("");
    setBody("");
    setPinned(false);
    setMentions([]);
    setWithNext(false);
    setNextTitle("");
    setNextDue("");
    setEndAt("");
    setDueAt("");
    setLocation("");
    setErrors({});
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "ใส่หัวเรื่องก่อน — เช่น \"โทรคุยเรื่องราคา\"";
    else if (title.trim().length > ACTIVITY_TITLE_MAX) e.title = `ยาวเกิน ${ACTIVITY_TITLE_MAX} ตัวอักษร`;
    if (body.length > ACTIVITY_BODY_MAX) e.body = `โน้ตยาวเกิน ${ACTIVITY_BODY_MAX.toLocaleString("th-TH")} ตัวอักษร`;
    const dur = parseDurationText(duration);
    if (dur !== null && !Number.isFinite(dur)) e.duration = "ใส่ระยะเวลาแบบ นาที:วินาที เช่น 04:32";
    const sIso = timed ? thaiLocalInputToIso(startAt) : null;
    if (sIso === "") e.startAt = "เวลาเริ่มอ่านไม่ออก";
    const eIso = type === "MEETING" ? thaiLocalInputToIso(endAt) : null;
    if (eIso === "") e.endAt = "เวลาจบอ่านไม่ออก";
    if (sIso && eIso && Date.parse(eIso) < Date.parse(sIso)) e.endAt = "เวลาจบต้องไม่ก่อนเวลาเริ่ม";
    const dIso = type === "TASK" ? thaiLocalInputToIso(dueAt) : null;
    if (dIso === "") e.dueAt = "วันครบกำหนดอ่านไม่ออก";
    let next: { type: ActivityType; title: string; dueAt: string } | null = null;
    if (withNext) {
      const nIso = thaiLocalInputToIso(nextDue);
      if (!nextTitle.trim()) e.nextTitle = "ใส่ชื่องานถัดไป";
      if (!nIso) e.nextDue = "เลือกวันครบกำหนดของงานถัดไป";
      if (nextTitle.trim() && nIso) next = { type: "TASK", title: nextTitle.trim(), dueAt: nIso };
    }
    const tgt: ActivityTarget | null = target ?? (picked ? { contactId: picked.kind === "CONTACT" ? picked.id : null, dealId: picked.kind === "DEAL" ? picked.id : null, companyId: picked.kind === "COMPANY" ? picked.id : null } : null);
    if (!tgt) e.target = "เลือกผู้ติดต่อ ดีล หรือบริษัทของกิจกรรมนี้ก่อน";
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length > 0 || !tgt) return;
    start(async () => {
      const r = await logActivityAction(systemId, {
        type,
        title: title.trim(),
        body: body.trim() || null,
        ...tgt,
        outcome: outcome || null,
        durationSec: type === "CALL" ? (dur ?? null) : null,
        direction: type === "CALL" && direction ? direction : null,
        startAt: sIso || null,
        endAt: eIso || null,
        dueAt: dIso || null,
        location: type === "MEETING" || type === "VISIT" ? location.trim() || null : null,
        pinned: type === "NOTE" ? pinned : null,
        mentions: type === "NOTE" && mentions.length ? mentions : null,
        nextTask: next,
      });
      if (!r.ok) {
        setServerError(r.error);
        return;
      }
      // บอกผู้เขียนว่าเพื่อนร่วมทีมคนไหนไม่ได้รับแจ้งเตือน (ชื่อจากรายการตัวเลือกของเขาเอง · ไม่บอกเหตุผล)
      const missed = mentions.filter((m) => !r.notified.includes(m)).map((m) => mentionOptions.find((o) => o.id === m)?.name ?? "").filter(Boolean);
      reset();
      router.refresh();
      if (missed.length > 0) {
        setNotice(`บันทึกแล้ว — ${missed.join(", ")} ไม่ได้รับแจ้งเตือนสำหรับโน้ตนี้`);
        return;
      }
      onDone?.();
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="activity-log-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      {!target && (
        <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>กิจกรรมของ</span>
          {picked ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-[color:var(--color-fg,inherit)]">
              <span className="min-w-0 truncate">
                {KIND_LABEL[picked.kind]} · {picked.name}
              </span>
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setPicked(null)} data-testid="activity-log-target-clear">
                เปลี่ยน
              </button>
            </div>
          ) : (
            <>
              <input
                className="input text-sm"
                value={q}
                onChange={(ev) => setQ(ev.target.value)}
                placeholder="พิมพ์ชื่อผู้ติดต่อ ดีล หรือบริษัท"
                aria-label="ค้นหาผู้ติดต่อ ดีล หรือบริษัท"
                data-testid="activity-log-target-q"
              />
              {q.trim() && options.length > 0 && (
                <ul className="flex max-h-48 flex-col overflow-y-auto rounded-lg border text-sm">
                  {options.map((o) => (
                    <li key={`${o.kind}:${o.id}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-[color:var(--color-surface-2,transparent)]"
                        onClick={() => {
                          setPicked(o);
                          setQ("");
                          setOptions([]);
                        }}
                        data-testid="activity-log-target-option"
                      >
                        <span className="text-xs text-[color:var(--color-muted)]">{KIND_LABEL[o.kind]}</span> {o.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {errors.target && <span className="text-[color:var(--color-danger)]">{errors.target}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="ชนิดกิจกรรม">
        {ACTIVITY_MANUAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={type === t ? { borderColor: "var(--color-accent)", color: "var(--color-accent)", fontWeight: 700 } : undefined}
            onClick={() => {
              setType(t);
              setOutcome("");
            }}
            data-testid={`activity-log-type-${t}`}
          >
            {ACTIVITY_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        หัวเรื่อง
        <input className="input text-sm" value={title} maxLength={ACTIVITY_TITLE_MAX} onChange={(ev) => setTitle(ev.target.value)} placeholder="เช่น โทรคุยเรื่องแพ็กเกจ 25 คน" data-testid="activity-log-title" />
        {errors.title && <span className="text-[color:var(--color-danger)]">{errors.title}</span>}
      </label>

      {chips.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผลสาย/ผลลัพธ์</span>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="ผลลัพธ์">
            {chips.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={outcome === o}
                className="rounded-md border px-2 py-0.5 text-xs"
                style={outcome === o ? { borderColor: "var(--color-accent)", color: "var(--color-accent)", fontWeight: 700 } : undefined}
                onClick={() => setOutcome(outcome === o ? "" : o)}
                data-testid="activity-log-outcome"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === "CALL" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ระยะเวลา
            <input className="input text-sm" value={duration} onChange={(ev) => setDuration(ev.target.value)} placeholder="04:32" inputMode="numeric" data-testid="activity-log-duration" />
            {errors.duration && <span className="text-[color:var(--color-danger)]">{errors.duration}</span>}
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ทิศทาง
            <select className="input text-sm" value={direction} onChange={(ev) => setDirection(ev.target.value as "" | "IN" | "OUT")} data-testid="activity-log-direction">
              <option value="OUT">{ACTIVITY_DIRECTION_LABEL.OUT}</option>
              <option value="IN">{ACTIVITY_DIRECTION_LABEL.IN}</option>
            </select>
          </label>
        </div>
      )}

      {timed && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เวลาเริ่ม
            <input type="datetime-local" className="input text-sm" value={startAt} onChange={(ev) => setStartAt(ev.target.value)} data-testid="activity-log-start" />
            {errors.startAt && <span className="text-[color:var(--color-danger)]">{errors.startAt}</span>}
          </label>
          {type === "MEETING" && (
            <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              เวลาจบ
              <input type="datetime-local" className="input text-sm" value={endAt} onChange={(ev) => setEndAt(ev.target.value)} data-testid="activity-log-end" />
              {errors.endAt && <span className="text-[color:var(--color-danger)]">{errors.endAt}</span>}
            </label>
          )}
        </div>
      )}

      {(type === "MEETING" || type === "VISIT") && (
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          สถานที่
          <input className="input text-sm" value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="เช่น ออฟฟิศลูกค้า ภูเก็ต" data-testid="activity-log-location" />
        </label>
      )}

      {type === "TASK" && (
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ครบกำหนด
          <input type="datetime-local" className="input text-sm" value={dueAt} onChange={(ev) => setDueAt(ev.target.value)} data-testid="activity-log-due" />
          {errors.dueAt && <span className="text-[color:var(--color-danger)]">{errors.dueAt}</span>}
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        โน้ต
        <textarea className="input min-h-[80px] text-sm" value={body} maxLength={ACTIVITY_BODY_MAX} onChange={(ev) => setBody(ev.target.value)} placeholder="สรุปสิ่งที่คุย ข้อตกลง สิ่งที่ลูกค้าขอ" data-testid="activity-log-body" />
        <span className="self-end">
          {body.length.toLocaleString("th-TH")}/{ACTIVITY_BODY_MAX.toLocaleString("th-TH")}
        </span>
        {errors.body && <span className="text-[color:var(--color-danger)]">{errors.body}</span>}
      </label>

      {type === "NOTE" && (
        <div className="flex flex-col gap-2 text-xs text-[color:var(--color-muted)]">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(ev) => setPinned(ev.target.checked)} data-testid="activity-log-pinned" />
            ปักหมุดโน้ตนี้ไว้บนสุด
          </label>
          {mentionOptions.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend>@กล่าวถึงเพื่อนร่วมทีม (แจ้งเตือนเฉพาะคนที่เห็นรายการนี้ได้)</legend>
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                {mentionOptions.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={mentions.includes(m.id)}
                      onChange={(ev) => setMentions(ev.target.checked ? [...mentions, m.id] : mentions.filter((x) => x !== m.id))}
                      data-testid="activity-log-mention"
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {type !== "NOTE" && (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withNext} onChange={(ev) => setWithNext(ev.target.checked)} data-testid="activity-log-next-toggle" />
            สร้างงานถัดไป
          </label>
          {withNext && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                งานถัดไป
                <input className="input text-sm" value={nextTitle} onChange={(ev) => setNextTitle(ev.target.value)} placeholder="เช่น ส่งใบเสนอราคา + โทรติดตาม" data-testid="activity-log-next-title" />
                {errors.nextTitle && <span className="text-[color:var(--color-danger)]">{errors.nextTitle}</span>}
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ครบกำหนด
                <input type="datetime-local" className="input text-sm" value={nextDue} onChange={(ev) => setNextDue(ev.target.value)} data-testid="activity-log-next-due" />
                {errors.nextDue && <span className="text-[color:var(--color-danger)]">{errors.nextDue}</span>}
              </label>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className="rounded-lg border px-3 py-2 text-sm" role="status" data-testid="activity-log-notice">
          {notice}{" "}
          <button type="button" className="btn btn-ghost text-xs" onClick={() => { setNotice(null); onDone?.(); }} data-testid="activity-log-notice-close">
            ปิด
          </button>
        </p>
      )}
      {serverError && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} role="alert" data-testid="activity-log-error">
          {serverError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-ghost text-sm"
          disabled={pending}
          onClick={() => {
            reset();
            onDone?.();
          }}
          data-testid="activity-log-cancel"
        >
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-primary text-sm" disabled={pending} data-testid="activity-log-submit">
          {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
        </button>
      </div>
    </form>
  );
}
