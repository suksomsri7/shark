// JourneyDetail.tsx — หน้ารายละเอียด journey 1 เส้น (M3.3 · ภาพ 22)
//
// โครงตามภาพ: แถว "ขั้นตอน" (การ์ดต่อขั้น + จำนวนคน) → ซ้าย "ผลลัพธ์ 30 วัน" 5 ตัวเลข + กล่องฟ้ากลุ่มเทียบ
//             + "ใช้สิทธิ์รายวัน" · ขวา "เข้าล่าสุด" (ชื่อ · เข้าเมื่อ · ขั้นปัจจุบัน · ใช้แล้ว)
// 🔴 กล่องกลุ่มเทียบต้องอยู่ติดตัวเลขผลลัพธ์เสมอ — "ใช้สิทธิ์ 16%" ไม่มีความหมายถ้าไม่รู้ว่าคนที่ไม่ได้รับกลับมาเองกี่ %
// 🔴 กริดทุกชั้นเป็น grid-cols-1 บนมือถือ + min-w-0 (ตารางกว้างเคยดันจอล้น — บทเรียน M3.2)
// 🔴 client component: import เฉพาะ server action + MemberIcon (ข้อมูลทั้งหมดมาจากหน้า server เป็น props)
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { duplicateJourneyAction, toggleJourneyAction } from "@/lib/modules/member/journeys-actions";

export type JourneyStepCard = {
  key: string;
  kind: "TRIGGER" | "CONDITION" | "ACTION" | "WAIT";
  tag: string;
  title: string;
  note: string;
  count: number;
  countLabel: string;
};

export type JourneyRecentView = { key: string; name: string; enteredLabel: string; stepLabel: string; usedLabel: string; usedTone: "used" | "wait" | "hold" };

export type JourneyDetailProps = {
  systemId: string;
  journeyId: string;
  enteredLabel: string;
  steps: JourneyStepCard[];
  results: { sent: string; used: string; sale: string; cost: string; roi: string };
  holdoutPct: number;
  holdoutConvertedLabel: string;
  upliftLabel: string;
  holdoutEntered: number;
  daily: { date: string; used: number; label: string }[];
  recent: JourneyRecentView[];
};

const STEP_ICON: Record<JourneyStepCard["kind"], string> = { TRIGGER: "clock", CONDITION: "filter", ACTION: "tag", WAIT: "clock" };

/** ปุ่มหัวหน้า: แก้ไข · หยุดชั่วคราว/เปิดใช้ · ทำสำเนา (ภาพ 22 มุมขวาบน) */
export function JourneyDetailActions({ systemId, journeyId, enabled, canManage }: { systemId: string; journeyId: string; enabled: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  const toggle = () => {
    if (enabled && !window.confirm("หยุด journey นี้ชั่วคราว? ขั้นที่รอส่งอยู่จะถูกยกเลิกทั้งหมด")) return;
    setError(null);
    start(async () => {
      const res = await toggleJourneyAction(systemId, journeyId, !enabled);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.refresh();
    });
  };
  const duplicate = () => {
    setError(null);
    start(async () => {
      const res = await duplicateJourneyAction(systemId, journeyId);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.push(`/app/sys/${systemId}/member/journeys/${res.data.id}?edit=1`);
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </span>
      )}
      <Link href={`/app/sys/${systemId}/member/journeys/${journeyId}?edit=1`} className="btn btn-ghost text-sm">
        แก้ไข
      </Link>
      <button data-testid="journey-toggle" type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={toggle}>
        {enabled ? "หยุดชั่วคราว" : "เปิดใช้อีกครั้ง"}
      </button>
      <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={duplicate}>
        ทำสำเนา
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-center" style={{ borderColor: "var(--color-line)" }}>
      <span className="truncate text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </div>
  );
}

export function JourneyDetail(props: JourneyDetailProps) {
  const max = Math.max(1, ...props.daily.map((d) => d.used));
  return (
    <div data-testid="journey-detail" className="flex min-w-0 flex-col gap-4">
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <MemberIcon name="bolt" size="sm" />
          <h2 className="text-sm font-semibold">ขั้นตอน</h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {props.enteredLabel}
          </span>
        </div>
        <div data-testid="journey-steps" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
          {props.steps.map((s, i) => (
            <div key={s.key} className="flex min-w-0 items-center gap-2">
              <div data-testid="journey-step" className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
                  <MemberIcon name={STEP_ICON[s.kind]} size="xs" /> {s.tag}
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
                <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                  {s.note}
                </span>
                <span className="mt-1 border-t pt-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
                  <strong className="tabular-nums">{s.count.toLocaleString("th-TH")}</strong>{" "}
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {s.countLabel}
                  </span>
                </span>
              </div>
              {i < props.steps.length - 1 && (
                <span className="hidden -rotate-90 md:inline" style={{ color: "var(--color-muted)" }}>
                  <MemberIcon name="chevronDown" size="xs" />
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section data-testid="journey-results" className="card flex min-w-0 flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold">ผลลัพธ์ 30 วัน</h2>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat value={props.results.sent} label="ส่งทั้งหมด" />
              <Stat value={props.results.used} label="ใช้สิทธิ์" />
              <Stat value={props.results.sale} label="ยอดที่เกิด" />
              <Stat value={props.results.cost} label="ต้นทุน" />
              <Stat value={props.results.roi} label="ROI" />
            </div>
            <div
              data-testid="journey-holdout"
              className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <MemberIcon name="users" size="sm" />
              <span>
                {props.holdoutPct > 0 ? (
                  <>
                    กลุ่มเทียบ (holdout {props.holdoutPct}%) กลับมาซื้อเอง <strong>{props.holdoutConvertedLabel}</strong> — ผลจริงที่เกิดจาก journey นี้คือ{" "}
                    <strong>{props.upliftLabel}</strong> เหนือค่าปกติ
                    {props.holdoutEntered === 0 ? " (ยังไม่มีคนในกลุ่มเทียบ)" : ""}
                  </>
                ) : (
                  <>กลุ่มเทียบ (holdout 0%) — journey นี้ไม่ได้กันกลุ่มเทียบไว้ จึงยังวัดไม่ได้ว่าลูกค้ากลับมาเพราะ journey หรือกลับมาเอง · แก้ไขแล้วตั้ง 10% เพื่อวัดผลจริง</>
                )}
              </span>
            </div>
          </section>

          <section className="card flex min-w-0 flex-col gap-3 p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">ใช้สิทธิ์รายวัน</h2>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {props.daily.length} วัน
              </span>
            </div>
            <div data-testid="journey-daily" className="flex h-16 min-w-0 items-end gap-1" role="img" aria-label="จำนวนคนที่ใช้สิทธิ์รายวัน">
              {props.daily.map((d) => (
                <span
                  key={d.date}
                  title={d.label}
                  className="min-w-0 flex-1 rounded-sm"
                  style={{ height: `${Math.max(8, Math.round((d.used / max) * 100))}%`, background: d.used > 0 ? "var(--color-ink)" : "var(--color-line)" }}
                />
              ))}
            </div>
          </section>
        </div>

        <section data-testid="journey-recent" className="card flex min-w-0 flex-col p-0">
          <div className="flex items-baseline gap-2 px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold">เข้าล่าสุด</h2>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              {props.recent.length.toLocaleString("th-TH")} คน
            </span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto] gap-2 border-y px-4 py-2 text-xs sm:grid" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)", background: "var(--color-bg)" }}>
            <span>ชื่อ</span>
            <span>เข้าเมื่อ</span>
            <span>ขั้นปัจจุบัน</span>
            <span>ใช้แล้ว</span>
          </div>
          {props.recent.length === 0 && (
            <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
              ยังไม่มีใครเข้า journey นี้ใน 30 วันที่ผ่านมา
            </p>
          )}
          {props.recent.map((r) => (
            <div key={r.key} className="grid min-w-0 grid-cols-2 items-center gap-2 border-t px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]" style={{ borderColor: "var(--color-line)" }}>
              <span className="truncate font-semibold">{r.name}</span>
              <span className="truncate text-xs sm:text-sm" style={{ color: "var(--color-muted)" }}>
                {r.enteredLabel}
              </span>
              <span className="truncate text-xs sm:text-sm" style={{ color: "var(--color-muted)" }}>
                {r.stepLabel}
              </span>
              <span
                className="justify-self-start rounded-lg border px-2 py-0.5 text-xs font-semibold sm:justify-self-end"
                style={r.usedTone === "used" ? { borderColor: "var(--color-ink)", color: "var(--color-ink)" } : { borderColor: "var(--color-line)", color: "var(--color-muted)" }}
              >
                {r.usedLabel}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export default JourneyDetail;
