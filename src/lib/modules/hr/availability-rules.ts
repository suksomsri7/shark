// HR H4.1 ▸ กติกาหน้าต่างเวลาจองของพนักงานจากตารางกะ — ฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา · ไม่มี async)
//
// dayWindows({ day, unitId, entries, leaves }) → ช่วงเวลาที่จองได้ของวัน `day` (นาทีจากเที่ยงคืนไทย) เรียง · รวมช่วงที่ซ้อน/แตะกัน · ตัดให้อยู่ใน [0,1440]
//   entries = แถวตารางกะที่ประกาศแล้วของพนักงานคนเดียว วันที่ D−1 และ D (ทุกสาขา) · leaves = ใบลาของคนนั้น
//   R3 หน้าต่างของวัน D = แถววัน D ของสาขา `unitId` หรือแถวไม่ระบุสาขา → [start, ข้ามเที่ยงคืน ? 1440 : end]
//      + แถววัน D−1 ที่ข้ามเที่ยงคืน → [0, end] · ใบลาผูกกับ "วันที่กะเริ่ม" (H2.1 R3 · H2.7 R4) · นับเฉพาะ APPROVED
//   R4 ครึ่งวัน: ช่วงของวัน = เริ่มเร็วสุด → เลิกช้าสุด (กะดึก +1440) ของทุกแถววันนั้นทุกสาขา · กลาง = เริ่ม + floor(ยาว/2) ·
//      AM ตัด [เริ่ม, กลาง) · PM ตัด [กลาง, เลิก)
//   Q5 ลาเป็นชั่วโมง (ไม่มีเวลาเริ่ม) = ตัดทั้งแถวของวันนั้น (ระวังไว้ก่อน — ไม่มีวันจองซ้อน) · วันที่เสีย ⇒ []
// ◂ HR H4.1

export type AvailabilityWindow = { startMin: number; endMin: number };
export type AvailabilityEntry = { date: string; unitId: string | null; startMin: number; endMin: number; crossesMidnight: boolean };
export type AvailabilityLeave = { fromDate: string; toDate: string; status: string; halfDay: string | null; hours: unknown };
export type DayWindowsInput = { day: string; unitId: string | null; entries: readonly AvailabilityEntry[]; leaves: readonly AvailabilityLeave[] };

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MIN = 1440;
const pad2 = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** "YYYY-MM-DD" ที่เป็นวันจริง (รวม 29 ก.พ.) → [y, m, d] · ไม่ใช่ ⇒ null */
function parseDay(day: unknown): [number, number, number] | null {
  const m = typeof day === "string" ? DAY_RE.exec(day) : null;
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return [y, mo, d];
}

/** วันก่อนหน้าตามปฏิทิน (คิดเลขล้วน) */
export function prevDayOf(day: string): string | null {
  const p = parseDay(day);
  if (!p) return null;
  let [y, mo, d] = p;
  if (d > 1) d -= 1;
  else if (mo > 1) {
    mo -= 1;
    d = daysInMonth(y, mo);
  } else {
    y -= 1;
    mo = 12;
    d = 31;
  }
  return `${String(y).padStart(4, "0")}-${pad2(mo)}-${pad2(d)}`;
}

export const isValidDay = (day: unknown): day is string => parseDay(day) !== null;

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** ช่วงของแถวบนเส้นเวลาของวันที่กะเริ่ม [start, end) (กะดึก end + 1440) · เวลาเสีย ⇒ null */
function spanOf(e: AvailabilityEntry): AvailabilityWindow | null {
  if (!e || !isInt(e.startMin) || !isInt(e.endMin) || e.startMin < 0 || e.startMin > 1439 || e.endMin < 0 || e.endMin > DAY_MIN) return null;
  const end = e.crossesMidnight ? e.endMin + DAY_MIN : e.endMin;
  return end > e.startMin ? { startMin: e.startMin, endMin: end } : null;
}

/** ใบลาครึ่งวัน (AM/PM ที่ไม่มีชั่วโมง) · อื่น ๆ (เต็มวัน · ชั่วโมง) = ทั้งวัน */
function halfOf(l: AvailabilityLeave): "AM" | "PM" | null {
  const noHours = l.hours === null || l.hours === undefined || l.hours === "";
  return noHours && (l.halfDay === "AM" || l.halfDay === "PM") ? l.halfDay : null;
}

/** ลบช่วง cut ออกจาก w (ครึ่งเปิด) */
function minus(ws: AvailabilityWindow[], cut: AvailabilityWindow): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  for (const w of ws) {
    if (cut.endMin <= w.startMin || cut.startMin >= w.endMin) {
      out.push(w);
      continue;
    }
    if (cut.startMin > w.startMin) out.push({ startMin: w.startMin, endMin: cut.startMin });
    if (cut.endMin < w.endMin) out.push({ startMin: cut.endMin, endMin: w.endMin });
  }
  return out;
}

/** เรียง + รวมช่วงที่ซ้อน/แตะกัน */
export function mergeWindows(ws: readonly AvailabilityWindow[]): AvailabilityWindow[] {
  const s = ws.filter((w) => w.endMin > w.startMin).map((w) => ({ startMin: w.startMin, endMin: w.endMin }));
  s.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: AvailabilityWindow[] = [];
  for (const w of s) {
    const last = out[out.length - 1];
    if (last && w.startMin <= last.endMin) last.endMin = Math.max(last.endMin, w.endMin);
    else out.push(w);
  }
  return out;
}

/** ช่วงที่เหลือของแถวที่เริ่มวัน `start` หลังหักใบลา (บนเส้นเวลาของวันที่กะเริ่ม) */
function startDayPieces(start: string, unitId: string | null, entries: readonly AvailabilityEntry[], leaves: readonly AvailabilityLeave[], tailsOnly: boolean): AvailabilityWindow[] {
  const own = entries.filter((e) => e && e.date === start);
  if (own.length === 0) return [];
  const covering = leaves.filter((l) => l && l.status === "APPROVED" && typeof l.fromDate === "string" && typeof l.toDate === "string" && l.fromDate <= start && start <= l.toDate);
  if (covering.some((l) => halfOf(l) === null)) return []; // เต็มวัน/ชั่วโมง = ทั้งแถวของวันนั้น
  const spans = own.map(spanOf).filter((x): x is AvailabilityWindow => x !== null);
  const cuts: AvailabilityWindow[] = [];
  if (covering.length && spans.length) {
    const s = Math.min(...spans.map((x) => x.startMin));
    const e = Math.max(...spans.map((x) => x.endMin));
    const mid = s + Math.floor((e - s) / 2);
    for (const l of covering) cuts.push(halfOf(l) === "AM" ? { startMin: s, endMin: mid } : { startMin: mid, endMin: e });
  }
  let pieces: AvailabilityWindow[] = [];
  for (const e of own) {
    if (tailsOnly && e.crossesMidnight !== true) continue; // วัน D−1: เฉพาะส่วนหางของกะข้ามเที่ยงคืน
    if (e.unitId !== null && e.unitId !== unitId) continue; // แถวสาขาอื่น = ไม่เปิดเวลาที่สาขานี้ (แต่ยังนับช่วงครึ่งวัน)
    const sp = spanOf(e);
    if (sp) pieces.push(sp);
  }
  for (const c of cuts) pieces = minus(pieces, c);
  return pieces;
}

/** R2–R5: หน้าต่างเวลาที่จองได้ของวัน `day` */
export function dayWindows(input: DayWindowsInput): AvailabilityWindow[] {
  const day = input?.day;
  const prev = isValidDay(day) ? prevDayOf(day) : null;
  if (!prev) return [];
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const unitId = typeof input.unitId === "string" ? input.unitId : null;
  const out: AvailabilityWindow[] = [];
  for (const w of startDayPieces(day, unitId, entries, leaves, false)) out.push({ startMin: w.startMin, endMin: Math.min(w.endMin, DAY_MIN) });
  for (const w of startDayPieces(prev, unitId, entries, leaves, true)) out.push({ startMin: Math.max(w.startMin - DAY_MIN, 0), endMin: w.endMin - DAY_MIN });
  return mergeWindows(out);
}
