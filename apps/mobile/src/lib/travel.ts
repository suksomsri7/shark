// Q8 เผื่อเวลาเดินทาง ฝั่งแอป (มติเจ้าของ 15 พ.ย. · สัญญา §16)
//   กติกา = travel-rules.ts (สำเนาตรงของเซิร์ฟเวอร์ · qc-cal-1.10 ส่วนบริสุทธิ์ 12/12) — ใช้เฉพาะคู่ที่มีนัดในเครื่อง (เซิร์ฟเวอร์ไม่เห็น device)
//   ยืนยันคู่ของเซิร์ฟเวอร์ = POST travel/confirm (เซิร์ฟเวอร์คำนวณคู่ใหม่เอง) · คู่ในเครื่อง = PUT travel/rules/<device:id> (เมื่อจำ)
//     + POST items เตือนชื่อกลาง ๆ "ออกเดินทาง (นัด HH:MM)" — ชื่อนัดในเครื่องไม่ออกจากเครื่อง · ข้ามคู่ในเครื่อง = จำ pairKey ในเครื่อง
import { calApi, calChanged, travelApi, travelLeaveAt, type AgendaItem, type TravelRule, type TravelSuggestion } from "@/src/api/calendar";
import { scheduleZoneBadges } from "@/src/api/secretary";
import { dayOfMs, hhmm } from "./cal-date";
import { travelSuggestions, type CalendarOf } from "./travel-rules";

type T = (k: "cal.tr.doneSet" | "cal.tr.doneNone" | "cal.tr.doneRemember", v?: Record<string, string | number>) => string;
function resultText(t: T, leaveAt: string | null, remember: boolean, typeLabel: string): string {
  const main = leaveAt ? t("cal.tr.doneSet", { time: hhmm(leaveAt) }) : t("cal.tr.doneNone");
  return remember ? `${main} · ${t("cal.tr.doneRemember", { type: typeLabel })}` : main;
}

/** ยืนยันข้อเสนอของเซิร์ฟเวอร์ (day = วันของนัดถัดไป) */
export async function confirmServerTravel(sug: TravelSuggestion, minutes: number, remember: boolean, t: T): Promise<string> {
  const r = await travelApi.confirm(sug.pairKey, dayOfMs(Date.parse(sug.nextStartAt)), minutes, remember);
  scheduleZoneBadges();
  calChanged();
  return resultText(t, r.item?.startAt ?? null, remember, sug.typeLabel);
}
export async function dismissServerTravel(sug: TravelSuggestion): Promise<void> {
  await travelApi.dismiss(sug.pairKey, dayOfMs(Date.parse(sug.nextStartAt)));
  calChanged();
}

/** คู่ที่มีนัดในเครื่องอยู่ด้วย (เซิร์ฟเวอร์ไม่เห็น) — กฎจาก GET travel/rules · ปฏิทินของแถว device จาก ref.systemId + ชื่อในเครื่อง */
export function deviceTravel(items: AgendaItem[], rules: TravelRule[], calName: (id: string) => string | null, skipped: Set<string>): TravelSuggestion[] {
  const cal: CalendarOf = {};
  for (const it of items) if (it.source === "device" && it.ref?.systemId) cal[it.id] = { calendarId: it.ref.systemId, name: calName(it.ref.systemId) ?? "" };
  return travelSuggestions(items, rules, skipped, new Date(), { calendarOf: cal }).filter((s) => s.prevId.startsWith("device:") || s.nextId.startsWith("device:"));
}

/** ยืนยันคู่ในเครื่อง — ส่งขึ้นเซิร์ฟเวอร์เฉพาะ: กฎ (ประเภท + นาที + ชื่อปฏิทิน · §16.1 label) และเตือนชื่อกลาง ๆ (ไม่มีชื่อนัด) */
export async function confirmDeviceTravel(sug: TravelSuggestion, minutes: number, remember: boolean, t: T, skip: (k: string) => void): Promise<string> {
  if (remember) await travelApi.putRule(sug.typeKey, minutes, sug.typeLabel.slice(0, 120));
  const at = travelLeaveAt(sug.nextStartAt, minutes, Date.now());
  if (at) await calApi.create({ kind: "REMINDER", title: `ออกเดินทาง (นัด ${hhmm(sug.nextStartAt)})`, startAt: at });
  skip(sug.pairKey);
  scheduleZoneBadges();
  calChanged();
  return resultText(t, at, remember, sug.typeLabel);
}
