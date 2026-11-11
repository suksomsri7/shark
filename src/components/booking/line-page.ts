// SVC B.5 — ตัวช่วยของหน้า /booking · /booking/mine · /booking/day (server เท่านั้น — ไม่ใช่คอมโพเนนต์ client)
//   lineActionsFor: server actions ของจอ (§3.5) bind unitSlug ⇒ prop `actions` ของ TodayLine/MyQueue
//   qcNowOf: นาฬิกา QC — ผู้เรียกส่งธง `process.env.SVC_QC_CLOCK === "1"` เอง (ไม่ตั้ง = นาฬิกาจริงเสมอ · ไม่ส่ง at ลงฟอร์ม)
import {
  callJobAction,
  cancelJobAction,
  checkInAction,
  completeJobAction,
  moveJobStaffAction,
  noShowAction,
  recallJobAction,
  skipJobAction,
  startJobAction,
  walkInAction,
} from "@/lib/actions/booking-line";
import type { LineActions } from "./line-parts";

export function lineActionsFor(unitSlug: string): LineActions {
  return {
    call: callJobAction.bind(null, unitSlug),
    recall: recallJobAction.bind(null, unitSlug),
    skip: skipJobAction.bind(null, unitSlug),
    start: startJobAction.bind(null, unitSlug),
    done: completeJobAction.bind(null, unitSlug),
    move: moveJobStaffAction.bind(null, unitSlug),
    checkin: checkInAction.bind(null, unitSlug),
    noshow: noShowAction.bind(null, unitSlug),
    cancel: cancelJobAction.bind(null, unitSlug),
    walkin: walkInAction.bind(null, unitSlug),
  };
}

/** ?at= ⇒ now (เฉพาะเมื่อ qcClock) · ผิดรูป/ไม่ส่ง/ไม่เปิด ⇒ นาฬิกาจริง และไม่มี at */
export function qcNowOf(raw: unknown, qcClock: boolean): { now: Date; at: string | undefined } {
  if (!qcClock || typeof raw !== "string" || !raw) return { now: new Date(), at: undefined };
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? { now: new Date(), at: undefined } : { now: d, at: d.toISOString() };
}
