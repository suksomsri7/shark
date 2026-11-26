// visual-trips.mts — ถ่ายภาพหน้าจอจริงของ RUN TRIPS (จอร้าน) เพื่อทำภาพคู่ MOCKUP|RENDER — เดสก์ท็อป 1440×900 (ภาพคู่) + มือถือ 390×844 (ตรวจล้นแนวนอนเท่านั้น)
// โครงลอกจาก scripts/visual-svc.mts (mint session · puppeteer-core · ตรวจล้นแนวนอน · ลบ session ใน finally) + ขั้นกด/กรอกก่อนถ่าย
//
// ใช้ (ต้องมี QC server ของ TRIPS — production build บน .env.qc-trips · builder ห้าม build ⇒ ผู้คุมเปิด server เอง):
//   bash scripts/iso.sh bash scripts/qc-trips.sh pnpm exec tsx scripts/visual-trips.mts t1.1 --base http://127.0.0.1:<port>
//   … t1.1 --list                       # พิมพ์สเปกของใบ (ไม่ต่อ server · ไม่ mint session)
//   … t1.1 --only settings-unit         # ถ่ายฉากเดียว
//   … t1.1 --ex-date 2026-12-31         # ปักรอบตัวอย่างของราชา (ปริยาย = รอบ ส. 14 พ.ย. ของฟิกซ์เจอร์ · ไม่ขึ้นกับวันนี้)
//   … t1.2 --week 2026-11-11 --month 2026-11 --dec-date 2026-12-31   # T1.2: ปักสัปดาห์/เดือน/รอบราชาของฉากแผง (ปริยาย = ค่าในฟิกซ์เจอร์ · ไม่ขึ้นกับวันนี้)
//   ⚠️ T1.2: สถานะ "เดินทางแล้ว/ออกเรือแล้ว/ต่ำกว่าขั้นต่ำ" ของช่องคิดจากนาฬิกาจริงของ server (หน้าไม่รับเวลา) — ฉากแผง/กล่องตัดสินใช้รอบ 31 ธ.ค. ที่ต่ำกว่าขั้นต่ำจนถึงวันนั้น
// ⚠️ ตัวโหลดใช้นาฬิกาจริง (ตั้งใจ — production): รอบตัวอย่าง/ลูกค้าจะเห็น ปักผ่าน ?ex= ได้เสมอ แต่ "2 รอบถัดไป" และป้าย "ใช้อยู่" ของฤดูกาลขึ้นกับวันที่ถ่าย
//   หรือส่ง base ทาง env: QC_BASE=http://127.0.0.1:<port>
//   … t1.3                              # T1.3a: 4 ฉาก (bookings-list · booking-detail · payment-dialog · money-docs) ↔ ภาพ 18 · ไม่กดยืนยันรับเงิน
// ภาพคู่: bash scripts/parity-trips.sh <16|17> .qc-shots/trips/t1.1/<ฉาก>-desktop.png .qc-shots/trips/t1.1/<ฉาก>-PARITY.png
//
// 🔴 ไม่มี base ปริยาย · :3215 (server ของ CRM) ⇒ exit 2 · ต่อ server ไม่ได้ ⇒ exit 2 ก่อน mint session
// 🔴 session ที่ mint ปักธง userAgent "qc-visual-trips" แล้วลบ **เฉพาะแถวของรอบนี้** ใน finally (ห้าม process.exit ระหว่าง mint/ถ่าย)
// 🔴 ล้นแนวนอน = ❌ (ทั้ง 1440 และ 390) · HTTP ≥ 400 = ❌ · page error = ❌ · ขั้นกด/กรอกหาเป้าไม่เจอ = ❌ · ภาพ → .qc-shots/trips/<wo>/<ชื่อ>-<desktop|mobile>.png
// 🔴 ฉากที่มีกล่องโต้ตอบ (fullPage: false) ถ่ายเฉพาะจอ — fullPage จะยืดจอแล้วเย็บหน้าหลังกล่องเข้ามา
// 🔴 ผู้ใช้ = เจ้าของร้านตัวอย่าง SHOP_DIVE (seed-trips-qc) · id ของสินค้า/รอบหาจาก slug ตอนรัน (ไม่ฝัง id)
// 🔴 ฉาก settings-similan-warning: กรอกตารางยกเลิก 50/30/0 → กดบันทึก ⇒ กล่องคำเตือน W01 → W03 · ถ่ายก่อนยืนยัน **ไม่กดยืนยัน** (ไม่เขียนฐาน)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { CALENDAR_WEEK_1111, DEPARTURE_RACHA_1114, RACHA_DEPARTURE_PRICE_1231, SHOP_DIVE, TRIPS_VISUAL_SIMILAN_LADDER } from "./trips-fixture.mjs";

loadTripsQcEnv("visual-trips");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "qc-visual-trips";
const SHOTS_DIR = ".qc-shots/trips";
const FORBIDDEN_PORTS = ["3215"];
const VIEWPORT = { width: 1440, height: 900 } as const;
/** ผู้จองของการจองตัวอย่างภาพ 18 (TR-…-0142 ในภาพ) — Party ของ seed */
const BOOKING_0142_PARTY = "tripsqc-party-dive-pattra";
const DEVICES = [
  { device: "desktop", width: VIEWPORT.width, height: VIEWPORT.height, mobile: false },
  { device: "mobile", width: 390, height: 844, mobile: true },
] as const;

// ═══════════════ สเปกภาพ (คีย์ = ใบงาน) ═══════════════
type Ids = { unitSlug: string; racha: string; similan: string; racha1114: string; racha1231: string; week: string; month: string; decWeek: string; shopSlug: string; bookMonth: string; bookDate: string; booking0142: string };
type Action =
  | { click: { selector: string; text?: string } }
  | { fill: { selector: string; nth?: number; value: string } }
  | { waitFor: string }
  | { reveal: string }
  | { pause: number };
// TRIPS W1.1 ▸ public = หน้าสาธารณะ: ไม่ใส่คุกกี้ session (บริบทเบราว์เซอร์ใหม่) + ตั้งหัว x-forwarded-for (หน้าต้องรู้ IP) · expectStatus = รหัสสถานะที่ต้องได้ (ปริยาย: ต่ำกว่า 400) ◂
type Spec = { name: string; mockup: "11" | "15" | "16" | "17" | "12" | "18" | "19" | "01" | "07"; path: (ids: Ids) => string; actions?: Action[]; fullPage?: boolean; public?: true; expectStatus?: number; media?: "print"; as?: string }; // TRIPS T1.7a1 ▸ as = key ของผู้ใช้ seed (SHOP_DIVE.users[].key · ปริยายเจ้าของร้าน) — บริบทเบราว์เซอร์แยก ◂
const PUBLIC_CLIENT_IP = "198.51.100.77";
const BOOK_RACHA = "racha-yai-day-trip";
// ตัวแก้ตารางของฟอร์มกลาง (ทะเบียนมี tableTh ของขั้นบันได) — ช่องย่อยมีป้ายไทยต่อช่อง [data-table-cell=<ช่อง>]
const LADDER = '[role="dialog"] [data-setting-key="trips.cancel.ladder"]';
const LADDER_DAYS = `${LADDER} [data-table-cell="fromDaysBefore"] input`;
const LADDER_PCT = `${LADDER} [data-table-cell="refundPct"] input`;
// TRIPS W1.3 ▸ วันของรอบชั่วคราว (วันนี้ตามเวลาไทย + 45 วัน → ≥ 30 วัน = คืน 100%) + ขั้นยืนยันเบอร์ที่ทุกฉากแก้ใช้ร่วมกัน ◂
const W13_PHONE = "0890001313";
const W13_DATES = (() => {
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const base = Date.parse(`${ymd(Date.now() + 7 * 3_600_000)}T00:00:00.000Z`) + 45 * 86_400_000;
  return { d1: ymd(base) };
})();
const W13_VERIFY: Action[] = [
  { waitFor: '[data-testid="book-verify"]' },
  { pause: 1_500 }, // nonce ของฟอร์มต้องอายุ ≥ 1 วิ (TOO_FAST)
  { fill: { selector: '[data-testid="book-verify-phone"]', value: W13_PHONE } },
  { click: { selector: '[data-testid="book-verify-submit"]' } },
];
export const TRIPS_VISUAL_SPECS: Record<string, Spec[]> = {
  "t1.1": [
    // ภาพ 16 — ตัวแก้ราชา · รอบตัวอย่างปัก ?ex= (ปริยาย ส. 14 พ.ย. ⇒ ลูกค้าจะเห็น 11,450.00 · --ex-date เปลี่ยนได้)
    { name: "products-racha", mockup: "16", path: (i) => `/app/u/${i.unitSlug}/trips/products?p=${i.racha}&ex=${i.racha1114}` },
    // ภาพ 17 — ค่าตั้งชั้นหน่วย (ต่างจากแม่แบบ 3 · ตั้งรายสินค้า 6)
    { name: "settings-unit", mockup: "17", path: (i) => `/app/u/${i.unitSlug}/trips/settings` },
    // ภาพ 17 การ์ด Liveaboard — ชั้นสินค้าสิมิลัน หมวดยกเลิก: กรอก 60/50 · 31/30 · 0/0 → บันทึก ⇒ กล่อง W01 (สูง) ก่อน W03 · ไม่กดยืนยัน
    {
      name: "settings-similan-warning",
      mockup: "17",
      path: (i) => `/app/u/${i.unitSlug}/trips/settings?scope=PRODUCT&id=${i.similan}&section=cancel`,
      fullPage: false,
      actions: [
        { waitFor: LADDER_DAYS },
        ...TRIPS_VISUAL_SIMILAN_LADDER.flatMap((s, k) => [
          { fill: { selector: LADDER_DAYS, nth: k, value: String(s.fromDaysBefore) } },
          { fill: { selector: LADDER_PCT, nth: k, value: String(s.refundPct) } },
        ]),
        { click: { selector: '[role="dialog"] button', text: "บันทึก" } },
        { waitFor: '[role="alertdialog"]' },
        // จบที่ภาพกล่อง W01 + W03 อยู่ในจอ (กล่องโต้ตอบเลื่อนให้เองด้วย · ขั้นนี้กันพลาด) — ไม่กดยืนยัน
        { reveal: '[role="alertdialog"]' },
        { pause: 600 },
      ],
    },
  ],
  // TRIPS T1.2 ▸ ปฏิทินรอบ (ภาพ 11) — ทุกฉาก 1440 + 390 · วันที่ปักด้วย --week/--month/--dec-date (ไม่พึ่งวันนี้) · กล่องโต้ตอบถ่ายแบบ viewport ◂
  "t1.2": [
    // ภาพ 11 ทั้งหน้า: สัปดาห์ 11–17 พ.ย. + แผงรอบราชา ส. 14 เปิด
    { name: "calendar-week", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.week}&dep=${i.racha1114}` },
    // เดือน พ.ย. 2569 (ตาราง 7 คอลัมน์ · มือถือ = จุด/จำนวน)
    { name: "calendar-month", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=month&month=${i.month}` },
    // แผงราชา 31 ธ.ค. → กล่องราคาเฉพาะรอบ 4,500/3,150
    {
      name: "departure-panel",
      mockup: "11",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.decWeek}&dep=${i.racha1231}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-dep-price"]' }, { click: { selector: '[data-testid="trips-dep-price"]' } }, { waitFor: '[data-testid="trips-price-dialog"]' }, { pause: 500 }],
    },
    // แผงราชา 31 ธ.ค. (ต่ำกว่าขั้นต่ำจนถึงวันนั้น) → กล่องตัดสิน 3 ทางเลือก · ไม่กดยืนยัน
    {
      name: "belowmin-decision",
      mockup: "11",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.decWeek}&dep=${i.racha1231}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-dep-decide"]' }, { click: { selector: '[data-testid="trips-dep-decide"]' } }, { waitFor: '[data-testid="trips-decide-dialog"]' }, { pause: 500 }],
    },
  ],
  // TRIPS W1.1 ▸ หน้าจองสาธารณะ /book/[shop] (ภาพ 19 จอใหญ่อังกฤษ · ภาพ 01 จอ ก มือถือไทย) — ทุกฉาก 1440 + 390 · ไม่มีคุกกี้ · เดือน/วันปักด้วย --book-month/--book-date (หน้าใช้นาฬิกาจริง) ◂
  "w1.1": [
    { name: "book-index", mockup: "19", public: true, path: (i) => `/book/${i.shopSlug}` },
    { name: "book-product", mockup: "01", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=th&m=${i.bookMonth}&d=${i.bookDate}` },
    { name: "book-product-en", mockup: "19", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=en&m=${i.bookMonth}&d=${i.bookDate}` },
    // Liveaboard ที่เผยแพร่แล้วยังไม่เปิดหน้าสาธารณะ ⇒ ต้องได้ 404 จริง
    { name: "book-not-found", mockup: "19", public: true, expectStatus: 404, path: (i) => `/book/${i.shopSlug}/t/similan-4-nights` },
  ],
  // TRIPS T1.3 ▸ การจองฝั่งร้าน (ภาพ 18) — ทุกฉาก 1440 + 390 · วันปักด้วย when=all (ไม่พึ่งวันนี้) · booking0142 = การจองของภัทรา (Party tripsqc-party-dive-pattra) บนรอบราชา ส. 14 พ.ย. หาจาก seed ตอนรัน ◂
  "t1.3": [
    // ภาพ 18 ส่วนตาราง: รายการการจองทั้งหมด (seed 3 ใบ)
    { name: "bookings-list", mockup: "18", path: (i) => `/app/u/${i.unitSlug}/trips/bookings?when=all` },
    // ลิ้นชักรายละเอียดของภัทรา เปิดทับขวา (11,450.00 · ก่อนภาษี 9,299.07 · VAT 650.93 · เก็บแทน 1,500.00)
    {
      name: "booking-detail",
      mockup: "18",
      path: (i) => `/app/u/${i.unitSlug}/trips/bookings?when=all&b=${i.booking0142}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-bk-detail"]' }, { pause: 500 }],
    },
    // ลิ้นชักเดิม → กดรับเงิน ⇒ กล่องรับเงิน (แถบเงินสดเก็บแยก) · ไม่กดยืนยัน (ไม่เขียนฐาน)
    {
      name: "payment-dialog",
      mockup: "18",
      path: (i) => `/app/u/${i.unitSlug}/trips/bookings?when=all&b=${i.booking0142}`,
      fullPage: false,
      actions: [{ waitFor: '[data-testid="trips-bk-pay"]' }, { click: { selector: '[data-testid="trips-bk-pay"]' } }, { waitFor: '[data-testid="trips-pay-dialog"]' }, { pause: 500 }],
    },
    // คิวเอกสารเงินรอออก (seed ว่าง ⇒ ข้อความถาวร + สถานะว่าง)
    { name: "money-docs", mockup: "18", path: (i) => `/app/u/${i.unitSlug}/trips/bookings?view=docs` },
  ],
  // TRIPS T1.4 ▸ ใบรายชื่อรายวัน (ภาพ 12 ส่วนจอใหญ่) — ทุกฉาก 1440 + 390 · รอบราชา ส. 14 พ.ย. (racha1114) · ฉากพิมพ์ถ่ายด้วยสื่อ print (ไม่กดปุ่มพิมพ์ ⇒ ไม่เขียนฐาน) ◂
  "t1.4": [
    // มุมมองตามรถรับส่ง (seed ยังไม่จัดรถ ⇒ กลุ่มเดียว "ยังไม่จัดรถ / มาเอง")
    { name: "manifest-pickup", mockup: "12", path: (i) => `/app/u/${i.unitSlug}/trips/departures/${i.racha1114}/manifest`, actions: [{ waitFor: '[data-testid="trips-mf"]' }] },
    // มุมมองตามการจอง + ขยายรายชื่อรายคนของการจองแรก
    {
      name: "manifest-booking",
      mockup: "12",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures/${i.racha1114}/manifest?view=booking`,
      actions: [{ waitFor: '[data-testid^="trips-mf-pax-toggle-"]' }, { click: { selector: '[data-testid^="trips-mf-pax-toggle-"]' } }, { waitFor: '[data-testid^="trips-mf-pax-"]:not([data-testid^="trips-mf-pax-toggle-"])' }, { pause: 300 }],
    },
    // ผังพิมพ์ของฉากแรก: สื่อ print (emulateMediaType) ถ่ายทั้งหน้า — ต้องเห็นเฉพาะใบรายชื่อ ไม่มีเปลือกแอป/แถบทัวร์/ปุ่ม
    { name: "manifest-print", mockup: "12", media: "print", path: (i) => `/app/u/${i.unitSlug}/trips/departures/${i.racha1114}/manifest`, actions: [{ waitFor: '[data-print-root="trips-manifest"]' }] },
    // แผงรอบในปฏิทิน: ปุ่ม "ใบรายชื่อ" เป็นลิงก์จริง
    {
      name: "manifest-panel-link",
      mockup: "12",
      path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.week}&dep=${i.racha1114}`,
      actions: [{ waitFor: 'a[data-testid="trips-dep-manifest"]' }],
    },
  ],
  // TRIPS T1.7a1 ▸ เงินระดับรอบ (ภาพ 11 แผงรอบ :56–:57 · จอต้นทุนไม่มีภาพ — ธรรมเนียมจอ T1.3a/T1.4a) — 1440 + 390 · อ่านอย่างเดียว (ไม่กดบันทึก ⇒ ไม่เขียนฐาน)
  //   seed ไม่มีแถวต้นทุน ⇒ "ยังไม่บันทึกต้นทุน" · ตัวเลขภาพ 11 / มุมมองอ่านอย่างเดียว (cost.view) / ร้านไม่จด VAT ผู้คุมดูจากร้านชั่วคราวของ probe (seed ไม่มีผู้ใช้/หน่วยแบบนั้น) ◂
  "t1.7": [
    { name: "panel-money", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures?view=week&start=${i.week}&dep=${i.racha1114}`, actions: [{ waitFor: '[data-testid="trips-dep-money"]' }] },
    { name: "departure-costs", mockup: "11", path: (i) => `/app/u/${i.unitSlug}/trips/departures/${i.racha1114}/costs`, actions: [{ waitFor: '[data-testid="trips-cost-editor"]' }] },
    // ORACLE-EDIT (ผู้คุม 26 พ.ย.): ไกด์ของ seed (STAFF · unitAccess = หน่วย BOOKING "andaman-dive" เท่านั้น) เข้าหน่วยทัวร์ไม่ได้ ⇒ แอปตอบ 404 ถูกต้อง (หน่วยอื่น ⇒ NOT_FOUND)
    //   seed ไม่มีผู้ใช้ที่เข้าหน่วยทัวร์ได้แต่ไม่มีคีย์ต้นทุน (มีแค่เจ้าของ + ไกด์ · ห้ามเพิ่มผู้ใช้ seed) ⇒ ฉากนี้คาด 404 ตามจริง · หน้าไม่มีสิทธิ์ (trips-forbidden) ดูจากร้านชั่วคราวของ probe ผู้คุม
    { name: "departure-costs-not-found", mockup: "11", as: "dive-guide-mint", expectStatus: 404, path: (i) => `/app/u/${i.unitSlug}/trips/departures/${i.racha1114}/costs` },
  ],
  // TRIPS W1.2 ▸ ทัวร์ 4 ขั้นฝั่งลูกค้า (ภาพ 01 ข/ค/ง มือถือไทย · 19 จอใหญ่อังกฤษ) — ทุกฉาก public 1440 + 390 · วัน/เดือนปักด้วย --book-month/--book-date (ปริยาย 31 ธ.ค. ของ seed)
  //   "w1.2" อ่านอย่างเดียว (ไม่เขียนฐาน) · "w1.2-flow" กดผ่านฟอร์มจริง ⇒ เขียนฐานเลน (ถือ 3 ที่บนรอบ 31 ธ.ค. + การจอง HOLD + Party ผู้จองทดสอบ ค้างจนตัวกวาดวิ่ง) — รันหลังข้อสอบ/ก่อน reseed
  //   วอเชอร์ = การจอง TR-…-0142 ของ seed (ภัทรา · CONFIRMED ยังไม่จ่าย) · token หาจาก bookingPublicToken ตอนรัน (ไม่ฝัง token) ◂
  "w1.2": [
    { name: "book-select", mockup: "01", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=th&m=${i.bookMonth}&d=${i.bookDate}&n.ADULT=2&n.CHILD=1`, actions: [{ reveal: '[data-testid="book-select"]' }] },
    { name: "book-select-en", mockup: "19", public: true, path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=en&m=${i.bookMonth}&d=${i.bookDate}&n.ADULT=2&n.CHILD=1` },
    { name: "book-voucher", mockup: "01", public: true, path: (i) => `/book/${i.shopSlug}/my/${W12_VOUCHER_TOKEN}?lang=th`, actions: [{ waitFor: '[data-testid="book-res"]' }] },
  ],
  "w1.2-flow": [
    {
      name: "book-checkout",
      mockup: "01",
      public: true,
      path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=th&m=${i.bookMonth}&d=${i.bookDate}&n.ADULT=2&n.CHILD=1`,
      actions: [{ waitFor: '[data-testid="book-continue"]' }, { pause: 2_500 }, { click: { selector: '[data-testid="book-continue"]' } }, { waitFor: '[data-testid="book-checkout"]' }, { pause: 300 }],
    },
    {
      name: "book-pay",
      mockup: "01",
      public: true,
      path: (i) => `/book/${i.shopSlug}/t/${BOOK_RACHA}?lang=th&m=${i.bookMonth}&d=${i.bookDate}&n.ADULT=2&n.CHILD=1`,
      actions: [
        { waitFor: '[data-testid="book-continue"]' }, { pause: 2_500 }, { click: { selector: '[data-testid="book-continue"]' } }, { waitFor: '[data-testid="book-checkout"]' }, { pause: 2_500 },
        { fill: { selector: '[data-testid="book-booker-name"]', value: "ภัทรา ภาพทดสอบ" } }, { fill: { selector: '[data-testid="book-booker-phone"]', value: "0890001180" } },
        { click: { selector: '[data-testid="book-accept"]' } }, { click: { selector: '[data-testid="book-pay-submit"]' } }, { waitFor: '[data-testid="book-res"]' },
        { waitFor: '[data-testid="book-pay-qr"]' }, { pause: 300 }, // TRIPS W1.2 r1 (มติ W6) ▸ ร้าน seed มีผู้รับเงินพร้อมเพย์แล้ว ⇒ ต้องเห็น QR (ไม่ใช่ "ร้านยังไม่ได้ตั้งบัญชีรับเงิน") ◂
      ],
    },
    // TRIPS W1.2 รอบ 2 (มติ R8) ▸ หน้าการจองหมดเวลา (07 · "ถ้าโอนแล้ว ติดต่อร้าน") — ก่อนถ่าย: การจอง WEB ล่าสุดของร้าน seed (จากฉาก book-pay) ถูกเลื่อนเวลาถือให้หมด
    //   (เขียนฐานเลนเหมือนฉากอื่นของกลุ่มนี้ · ตัวกวาดปล่อยที่ตามปกติ) · ไม่มีฉาก AWAIT_SHOP ใน a (ย้ายไป W1.2b) ◂
    { name: "book-expired", mockup: "07", public: true, path: () => `/book/${SHOP_DIVE.tenant.slug}/my/${W12_EXPIRED_TOKEN}?lang=th`, actions: [{ waitFor: '[data-testid="book-res-expired"]' }] },
  ],
  // TRIPS W1.3 ▸ การจองของฉัน (ภาพ 01ง ปุ่มเลื่อน/ยกเลิก · 07ง แถบวัน · 15 ยอดคืน) — ทุกฉาก public 1440 + 390
  //   🔴 เขียนฐาน: w13Prepare สร้าง "รอบชั่วคราว" ของราชาบนร้าน seed (วันนี้ + 45 วัน · เวลา 06:13 ไม่ชนรอบของ seed) + การจองของตัวเอง (ผ่านเส้นจริง W1.2a + ร้านรับเงิน)
  //      ไม่มีฉากเลื่อน/ขอลิงก์ใหม่ (มติ K1 → W1.3a2/W1.3b) · ฉากที่เขียน (ยกเลิก) ใช้การจองแยกต่ออุปกรณ์ · w13Cleanup ลบทุกแถวที่ผูกการจอง/รอบของตัวเอง + รอบ + Party ผู้จองทดสอบ + ถังของเครื่องที่ใช้ ใน finally (ไม่แตะรอบ/การจองของ seed)
  //      ผู้จองทุกการจองใช้เบอร์ W13_PHONE (ฉากกรอกเบอร์นี้ในช่องยืนยัน) · ไม่ฝัง token (สร้างตอนรัน) ◂
  "w1.3": [
    { name: "self-manage", mockup: "01", public: true, path: () => w13Path("paid", "th"), actions: [{ waitFor: '[data-testid="book-manage"]' }, { reveal: '[data-testid="book-manage"]' }] },
    { name: "self-manage-en", mockup: "01", public: true, path: () => w13Path("paid", "en"), actions: [{ waitFor: '[data-testid="book-manage"]' }, { reveal: '[data-testid="book-manage"]' }] },
    { name: "self-verify", mockup: "01", public: true, path: () => w13Path("paid", "th", "cancel"), actions: [{ waitFor: '[data-testid="book-verify"]' }] },
    { name: "self-cancel-quote", mockup: "15", public: true, path: () => w13Path("paid", "th", "cancel"), actions: [...W13_VERIFY, { waitFor: '[data-testid="book-cancel-quote"]' }] },
    {
      name: "self-cancel-requested",
      mockup: "15",
      public: true,
      path: () => w13Path("cancel", "th", "cancel"),
      actions: [...W13_VERIFY, { waitFor: '[data-testid="book-cancel-quote"]' }, { pause: 1_500 }, { click: { selector: '[data-testid="book-cancel-accept"]' } }, { click: { selector: '[data-testid="book-cancel-submit"]' } }, { waitFor: '[data-testid="book-refund-status"]' }],
    },
    {
      name: "self-unpaid-cancelled",
      mockup: "07",
      public: true,
      path: () => w13Path("hold", "th", "cancel"),
      actions: [...W13_VERIFY, { waitFor: '[data-testid="book-cancel-quote"]' }, { pause: 1_500 }, { click: { selector: '[data-testid="book-cancel-accept"]' } }, { click: { selector: '[data-testid="book-cancel-submit"]' } }, { waitFor: '[data-testid="book-cancel-done"]' }],
    },
    // K8: คำขอคืนเงินที่ร้านปฏิเสธ (ร้านยื่นแทนแล้วปฏิเสธใน w13Prepare) ⇒ ไม่มีปุ่มยกเลิก + ข้อความติดต่อร้าน
    { name: "self-refund-rejected", mockup: "15", public: true, path: () => w13Path("rejected", "th"), actions: [{ waitFor: '[data-testid="book-refund-status"]' }, { reveal: '[data-testid="book-manage"]' }] },
    // K6: การจองที่ถูกลองเบอร์ผิดครบเพดาน (w13Prepare ยิงผิด 20 ครั้งจาก 20 เครื่อง) ⇒ กรอกเบอร์ถูกแล้วยังเห็น "ถูกล็อก ติดต่อร้าน"
    { name: "self-locked", mockup: "07", public: true, path: () => w13Path("locked", "th", "cancel"), actions: [...W13_VERIFY, { waitFor: '[data-testid="book-self-locked"]' }] },
  ],
  // TRIPS W1.4a ▸ 07ก รอบเต็ม + 07ข หมดเวลา · public 1440+390 · w14Prepare: รอบชั่วคราว full (เต็ม) · near · exo/exf/exc (การจองที่ตัวกวาดจริงปล่อยหมดเวลา แล้ว exf เต็ม · exc ร้านยกเลิก) — เก็บใน W13 ⇒ w13Cleanup ลบใน finally ◂
  "w1.4": [
    { name: "full-select", mockup: "07", public: true, path: () => w14Path("full", "th"), actions: [{ waitFor: '[data-testid="book-full"]' }, { reveal: '[data-testid="book-full"]' }] },
    { name: "full-select-en", mockup: "07", public: true, path: () => w14Path("full", "en"), actions: [{ waitFor: '[data-testid="book-full"]' }, { reveal: '[data-testid="book-full"]' }] },
    { name: "res-expired-open", mockup: "07", public: true, path: () => w14Path("exo", "th"), actions: [{ waitFor: '[data-testid="book-res-rehold"]' }] },
    { name: "res-expired-full", mockup: "07", public: true, path: () => w14Path("exf", "th"), actions: [{ waitFor: '[data-testid="book-full"]' }] },
    { name: "res-expired-off", mockup: "07", public: true, path: () => w14Path("exc", "th"), actions: [{ waitFor: '[data-testid="book-res-expired-now"]' }] },
  ],
};
const W14_DAY = (n: number) => new Date(Date.parse(`${W13_DATES.d1}T00:00:00.000Z`) + (5 + n) * 86_400_000).toISOString().slice(0, 10);
const w14Path = (k: "full" | "exo" | "exf" | "exc", lang: "th" | "en") =>
  k === "full" ? `/book/${SHOP_DIVE.tenant.slug}/t/${BOOK_RACHA}?lang=${lang}&m=${W14_DAY(0).slice(0, 7)}&d=${W14_DAY(0)}&n.ADULT=2` : `/book/${SHOP_DIVE.tenant.slug}/my/${W13.tokens[`w14:${k}`] ?? "none"}?lang=${lang}`;
async function w14Prepare(ids: Ids): Promise<void> {
  const tenantId = SHOP_DIVE.tenant.id, unitId = SHOP_DIVE.units.trips.id, shop = SHOP_DIVE.tenant.slug;
  const opt = await prisma.tripOption.findFirst({ where: { tenantId, productId: ids.racha, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  if (!opt) throw new Fatal("ไม่พบตัวเลือกของราชา — รัน scripts/seed-trips-qc.mts ก่อน");
  const book = (await import("@/lib/platform/trips-book")) as unknown as Record<string, W13Fn> & { issueBookFormNonce: (o: unknown) => string | null };
  const pub = (await import("@/lib/platform/trips-public")) as unknown as { bookClientKey: (ip: string) => string | null; bookSlotToken: (t: string, d: string) => string | null };
  const dep: Record<string, string> = {};
  for (const [k, n, cap] of [["full", 0, 2], ["near", 1, 30], ["exo", 2, 30], ["exf", 3, 2], ["exc", 4, 30]] as const) {
    const startsAt = new Date(`${W14_DAY(n)}T06:14:00+07:00`);
    W13.deps.push((dep[k] = (await prisma.tripDeparture.create({ data: { tenantId, unitId, productId: ids.racha, optionId: opt.id, localDate: new Date(`${W14_DAY(n)}T00:00:00.000Z`), startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * 3_600_000), status: "OPEN", capacity: cap, sold: k === "full" ? cap : 0, cutoffAt: startsAt }, select: { id: true } })).id));
  }
  for (const [i, k] of (["exo", "exf", "exc"] as const).entries()) {
    const clientKey = pub.bookClientKey(`198.51.103.${i + 1}`), t = pub.bookSlotToken(tenantId, dep[k] ?? ""), d = W14_DAY(i + 2), sel = { "n.ADULT": "2" };
    if (!clientKey || !t) throw new Fatal("ทำกุญแจเครื่อง/ตัวอ้างรอบไม่ได้ (ไม่มี SESSION_SECRET?)");
    else W13.clientKeys.push(clientKey);
    const nonce = (purpose: "hold" | "confirm") => book.issueBookFormNonce({ now: new Date(Date.now() - 60_000), scope: { tenantId, purpose } });
    const total = String(((await book.quoteBookSelection({ shop, productSlug: BOOK_RACHA, query: { d, t, ...sel }, acceptLanguage: "th", clientKey })).summary as { totalSatang?: number } | null)?.totalSatang ?? "");
    const h = await book.startBookHold({ shop, productSlug: BOOK_RACHA, form: { d, t, ...sel, nonce: nonce("hold"), seen: total }, acceptLanguage: "th", clientKey });
    const c = h.ok === true ? await book.confirmBookHold({ shop, basketToken: h.basketToken, sel: h.sel, form: { name: `ภาพทดสอบ W1.4 ${k}`, phone: W13_PHONE, email: "", accept: "on", nonce: nonce("confirm"), seen: total }, clientKey }) : h;
    if (c.ok !== true || typeof c.token !== "string") throw new Fatal(`ฉาก w1.4: จอง ${k} ไม่ได้ (${JSON.stringify(c).slice(0, 160)})`);
    W13.tokens[`w14:${k}`] = c.token;
  }
  W13.bookingIds.push(...(await prisma.tripBooking.findMany({ where: { tenantId, departureId: { in: W13.deps } }, select: { id: true } })).map((b) => b.id));
  await prisma.tripHold.updateMany({ where: { tenantId, departureId: { in: W13.deps }, status: "ACTIVE" }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await ((await import("@/lib/modules/trips")) as unknown as { runExpireHolds: (now: Date, o: unknown) => Promise<unknown> }).runExpireHolds(new Date(), { tenantIds: [tenantId] });
  await Promise.all([prisma.tripDeparture.update({ where: { id: dep.exf ?? "" }, data: { sold: 2 } }), prisma.tripDeparture.update({ where: { id: dep.exc ?? "" }, data: { status: "CANCELLED" } })]);
}
// TRIPS W1.2 ▸ token ของการจอง 0142 (ฉาก book-voucher) — เติมก่อนถ่ายเมื่อใบ = w1.2 · ไม่มีกุญแจเซิร์ฟเวอร์/ไม่พบการจอง ⇒ หยุด ◂
let W12_VOUCHER_TOKEN = "";
async function w12VoucherToken(bookingId: string): Promise<string> {
  if (!bookingId) throw new Fatal(`ไม่พบการจองของ ${BOOKING_0142_PARTY} บนรอบราชา ${DEPARTURE_RACHA_1114.date} — รัน scripts/seed-trips-qc.mts ก่อน`);
  const trips = (await import("@/lib/modules/trips")) as { bookingPublicToken?: (id: string) => string | null };
  const t = typeof trips.bookingPublicToken === "function" ? trips.bookingPublicToken(bookingId) : null;
  if (!t) throw new Fatal("ทำ token การจองไม่ได้ (ไม่มี SESSION_SECRET ใน .env.qc-trips?)");
  return t;
}
// TRIPS W1.2 รอบ 2 ▸ ฉาก book-expired: การจอง WEB สถานะ HOLD ล่าสุดของร้าน seed ⇒ เลื่อนที่ถือ ACTIVE ให้หมด 1 นาทีก่อน (นาฬิกาเครื่อง = นาฬิกาเซิร์ฟเวอร์ที่เปิดหน้า) ⇒ token ◂
let W12_EXPIRED_TOKEN = "";
async function w12ExpireLatestWebBooking(): Promise<string> {
  const tenantId = SHOP_DIVE.tenant.id;
  const b = await prisma.tripBooking.findFirst({ where: { tenantId, unitId: SHOP_DIVE.units.trips.id, channel: "WEB", status: "HOLD" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!b) throw new Fatal("ไม่พบการจอง WEB ที่ถืออยู่ของร้าน seed — ฉาก book-expired ต้องรันหลัง book-pay ในกลุ่ม w1.2-flow");
  await prisma.tripHold.updateMany({ where: { tenantId, bookingId: b.id, status: "ACTIVE" }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const trips = (await import("@/lib/modules/trips")) as { bookingPublicToken?: (id: string) => string | null };
  const t = typeof trips.bookingPublicToken === "function" ? trips.bookingPublicToken(b.id) : null;
  if (!t) throw new Fatal("ทำ token การจองไม่ได้ (ไม่มี SESSION_SECRET ใน .env.qc-trips?)");
  return t;
}

// TRIPS W1.3 ▸ ของที่ฉาก w1.3 สร้าง (ลบใน finally ด้วย w13Cleanup) · W13_DEV = อุปกรณ์ของฉากที่กำลังถ่าย (ฉากที่เขียนฐานใช้การจองแยกต่ออุปกรณ์) ◂
const W13 = { deps: [] as string[], bookingIds: [] as string[], basketIds: [] as string[], clientKeys: [] as string[], tokens: {} as Record<string, string>, bucketKeys: [] as string[] };
let W13_DEV = "";
function w13Path(kind: "paid" | "cancel" | "hold" | "rejected" | "locked", lang: "th" | "en", act?: "cancel"): string {
  const token = W13.tokens[kind === "cancel" || kind === "hold" ? `${kind}:${W13_DEV}` : kind];
  if (!token) throw new Fatal(`ไม่มีการจองของฉาก ${kind}:${W13_DEV} — w13Prepare ยังไม่รัน`);
  return `/book/${SHOP_DIVE.tenant.slug}/my/${token}?lang=${lang}${act ? `&do=${act}` : ""}`;
}
type W13Fn = (input: unknown, opts?: unknown) => Promise<Record<string, unknown>>;
async function w13Prepare(ids: Ids): Promise<void> {
  const tenantId = SHOP_DIVE.tenant.id;
  const unitId = SHOP_DIVE.units.trips.id;
  const staff = await prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } });
  const opt = await prisma.tripOption.findFirst({ where: { tenantId, productId: ids.racha, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  if (!staff || !opt) throw new Fatal("ไม่พบเจ้าของร้าน/ตัวเลือกของราชา — รัน scripts/seed-trips-qc.mts ก่อน");
  for (const d of [W13_DATES.d1]) {
    const startsAt = new Date(`${d}T06:13:00+07:00`);
    const dep = await prisma.tripDeparture.create({
      data: { tenantId, unitId, productId: ids.racha, optionId: opt.id, localDate: new Date(`${d}T00:00:00.000Z`), startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * 3_600_000), status: "OPEN", capacity: 30, cutoffAt: startsAt },
      select: { id: true },
    });
    W13.deps.push(dep.id);
  }
  const book = (await import("@/lib/platform/trips-book")) as unknown as Record<string, W13Fn> & { issueBookFormNonce: (o: unknown) => string | null };
  const pub = (await import("@/lib/platform/trips-public")) as unknown as { bookClientKey: (ip: string) => string | null; bookSlotToken: (t: string, d: string) => string | null };
  const trips = (await import("@/lib/modules/trips")) as unknown as { recordTripPayment: W13Fn; requestTripRefund: W13Fn; decideTripRefund: W13Fn };
  const staffCtx = { tenantId, unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: staff.id } };
  const t = pub.bookSlotToken(tenantId, W13.deps[0] ?? "");
  if (!t) throw new Fatal("ทำตัวอ้างรอบชั่วคราวไม่ได้ (ไม่มี SESSION_SECRET?)");
  let n = 0;
  const one = async (key: string, pay: boolean) => {
    n++;
    const clientKey = pub.bookClientKey(`198.51.101.${n}`);
    if (!clientKey) throw new Fatal("ทำกุญแจเครื่องไม่ได้");
    W13.clientKeys.push(clientKey);
    const nonce = (purpose: "hold" | "confirm") => book.issueBookFormNonce({ now: new Date(Date.now() - 60_000), scope: { tenantId, purpose } });
    const sel = { "n.ADULT": "2", "n.CHILD": "1" };
    const qs = await book.quoteBookSelection({ shop: SHOP_DIVE.tenant.slug, productSlug: BOOK_RACHA, query: { d: W13_DATES.d1, t, ...sel }, acceptLanguage: "th", clientKey });
    const total = Number((qs.summary as { totalSatang?: unknown } | null | undefined)?.totalSatang);
    if (qs.ok !== true || !Number.isSafeInteger(total)) throw new Fatal(`ฉาก w1.3: คิดยอดไม่ได้ (${JSON.stringify(qs).slice(0, 160)})`);
    const h = await book.startBookHold({ shop: SHOP_DIVE.tenant.slug, productSlug: BOOK_RACHA, form: { d: W13_DATES.d1, t, ...sel, nonce: nonce("hold"), seen: String(total) }, acceptLanguage: "th", clientKey });
    if (h.ok !== true) throw new Fatal(`ฉาก w1.3: ถือที่ไม่ได้ (${JSON.stringify(h).slice(0, 160)})`);
    const c = await book.confirmBookHold({ shop: SHOP_DIVE.tenant.slug, basketToken: h.basketToken, sel: h.sel, form: { name: `ภาพทดสอบ W1.3 ${key}`, phone: W13_PHONE, email: "", accept: "on", nonce: nonce("confirm"), seen: String(total) }, clientKey });
    if (c.ok !== true || typeof c.token !== "string") throw new Fatal(`ฉาก w1.3: ยืนยันการจองไม่ได้ (${JSON.stringify(c).slice(0, 160)})`);
    const b = await prisma.tripBooking.findFirst({ where: { tenantId, publicTokenHash: sha256(c.token) }, select: { id: true, basketId: true } });
    if (!b) throw new Fatal("ฉาก w1.3: ไม่พบการจองที่เพิ่งสร้าง");
    W13.bookingIds.push(b.id);
    if (b.basketId) W13.basketIds.push(b.basketId);
    if (pay) {
      const p = await trips.recordTripPayment(staffCtx, { bookingId: b.id, amountSatang: total, tender: "PROMPTPAY", idempotencyKey: `w13vis_${b.id}`.slice(0, 90) });
      if (p.ok !== true) throw new Fatal(`ฉาก w1.3: รับเงินไม่ได้ (${JSON.stringify(p).slice(0, 160)})`);
    }
    W13.tokens[key] = c.token;
    return b.id;
  };
  await one("paid", true);
  for (const dev of DEVICES) await one(`cancel:${dev.device}`, true);
  // K8 ฉากคำขอถูกปฏิเสธ: ร้านยื่นคำขอแทน (STAFF) แล้วปฏิเสธ — ร้าน seed อนุมัติอัตโนมัติ = 0 ⇒ QUOTED → REJECTED
  const rej = await one("rejected", true);
  const rb = await prisma.tripBooking.findFirst({ where: { id: rej }, select: { version: true } });
  const rq = await trips.requestTripRefund(staffCtx, { bookingId: rej, expectedVersion: rb?.version ?? 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ภาพทดสอบ W1.3", idempotencyKey: `w13visrq_${rej}`.slice(0, 90) });
  const rqId = (rq.value as { requestId?: unknown } | undefined)?.requestId;
  if (rq.ok !== true || typeof rqId !== "string") throw new Fatal(`ฉาก w1.3: ยื่นคำขอคืนเงินแทนลูกค้าไม่ได้ (${JSON.stringify(rq).slice(0, 160)})`);
  const dj = await trips.decideTripRefund(staffCtx, { requestId: rqId, decision: "REJECT", reason: "ภาพทดสอบ W1.3", idempotencyKey: `w13visdj_${rej}`.slice(0, 90) });
  if (dj.ok !== true) throw new Fatal(`ฉาก w1.3: ปฏิเสธคำขอไม่ได้ (${JSON.stringify(dj).slice(0, 160)})`);
  // K6 ฉากล็อก: ยิงเบอร์ผิด 20 ครั้งจาก 20 เครื่องผ่าน verifyBookSelf ของ W1.3a (ต้องมีงานของผู้สร้างแล้ว)
  await one("locked", true);
  const SELF_MOD: string = "@/lib/platform/trips-self"; // ไฟล์ของผู้สร้าง W1.3a — ตัวแปรกันตัวตรวจชนิดหาโมดูลก่อนมีงาน
  const self = (await import(SELF_MOD)) as unknown as Record<string, W13Fn> & { issueSelfFormNonce: (o: unknown) => string | null };
  const lockedToken = W13.tokens.locked ?? "";
  for (let i = 0; i < 20; i++) {
    const ckL = pub.bookClientKey(`198.51.102.${i + 1}`);
    if (!ckL) throw new Fatal("ทำกุญแจเครื่องไม่ได้");
    W13.clientKeys.push(ckL);
    const nonceV = self.issueSelfFormNonce({ now: new Date(Date.now() - 60_000), scope: { tenantId, purpose: "verify", token: lockedToken } });
    await self.verifyBookSelf({ shop: SHOP_DIVE.tenant.slug, token: lockedToken, form: { phone: "0899999913", nonce: nonceV }, clientKey: ckL });
  }
  W13.bucketKeys.push(`trips:verifyb:${tenantId}:${sha256(sha256(lockedToken)).slice(0, 24)}`);
  for (const dev of DEVICES) await one(`hold:${dev.device}`, false); // ที่ยังไม่จ่ายสร้างท้ายสุด (เพดานถือพร้อมกันต่อเบอร์ X10 = 3)
  console.log(`🧪 w1.3: รอบชั่วคราว ${W13_DATES.d1} · การจองทดสอบ ${W13.bookingIds.length}`);
}
/** ลบของที่ฉาก w1.3 สร้าง: ทุกตารางที่มี bookingId ของการจองบนรอบชั่วคราว · ที่ถือ · ตะกร้า · audit · outbox · การจอง · รอบ · Party ผู้จองทดสอบที่ไม่มีการจองอื่น · ถังของเครื่องที่ใช้ — คืนจำนวนแถว */
async function w13Cleanup(): Promise<number> {
  if (!W13.deps.length && !W13.bookingIds.length) return 0;
  const tenantId = SHOP_DIVE.tenant.id;
  let n = 0;
  const run = async (sql: string, ...args: unknown[]) => {
    try {
      n += await prisma.$executeRawUnsafe(sql, ...args);
    } catch {
      /* ตารางอ้างกันอยู่ — รอบถัดไป */
    }
  };
  const onDeps = await prisma.tripBooking.findMany({ where: { tenantId, departureId: { in: W13.deps } }, select: { id: true, basketId: true } });
  const bids = [...new Set([...W13.bookingIds, ...onDeps.map((b) => b.id)])];
  const baskets = [...new Set([...W13.basketIds, ...onDeps.flatMap((b) => (b.basketId ? [b.basketId] : []))])];
  const refundIds = bids.length ? (await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "TripRefundRequest" WHERE "tenantId" = $1 AND "bookingId" = ANY($2::text[])`, tenantId, bids)).map((r) => r.id) : [];
  const tables = (await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.columns k ON k.table_name = c.table_name AND k.table_schema = c.table_schema AND k.column_name = 'tenantId' WHERE c.table_schema = current_schema() AND c.column_name = 'bookingId' AND c.table_name <> 'TripBooking'`)).map((r) => r.t);
  for (let pass = 0; pass < 6; pass++) {
    for (const t of tables) await run(`DELETE FROM "${t}" WHERE "tenantId" = $1 AND "bookingId" = ANY($2::text[])`, tenantId, bids);
    await run(`DELETE FROM "TripHold" WHERE "tenantId" = $1 AND "departureId" = ANY($2::text[])`, tenantId, W13.deps);
    await run(`DELETE FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = ANY($2::text[])`, tenantId, [...bids, ...refundIds, ...W13.deps]);
    await run(`DELETE FROM "OutboxEvent" WHERE "tenantId" = $1 AND (payload->>'bookingId' = ANY($2::text[]) OR payload->>'id' = ANY($2::text[]) OR payload->>'requestId' = ANY($3::text[]) OR payload->>'departureId' = ANY($4::text[]))`, tenantId, bids, refundIds, W13.deps);
    await run(`DELETE FROM "TripBooking" WHERE "tenantId" = $1 AND id = ANY($2::text[])`, tenantId, bids);
    await run(`DELETE FROM "SellBasket" WHERE "tenantId" = $1 AND id = ANY($2::text[])`, tenantId, baskets);
    await run(`DELETE FROM "TripDeparture" WHERE "tenantId" = $1 AND id = ANY($2::text[])`, tenantId, W13.deps);
  }
  await run(`DELETE FROM "Party" p WHERE p."tenantId" = $1 AND p."phoneNorm" = $2 AND NOT EXISTS (SELECT 1 FROM "TripBooking" b WHERE b."bookerPartyId" = p.id)`, tenantId, W13_PHONE);
  if (W13.clientKeys.length) await run(`DELETE FROM "ChatRateBucket" WHERE key LIKE ANY($1::text[])`, W13.clientKeys.map((k) => `%:${k}`));
  if (W13.bucketKeys.length) await run(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, W13.bucketKeys);
  const left = await prisma.tripDeparture.count({ where: { id: { in: W13.deps } } });
  if (left) console.error(`⚠️ w1.3: ลบรอบชั่วคราวไม่หมด (${left}) — ตรวจ ${W13.deps.join(", ")}`);
  return n;
}

const argv = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
const allSpecs = TRIPS_VISUAL_SPECS[WO];
if (!WO || !allSpecs) {
  console.error(`❌ ไม่มีสเปกภาพของใบ "${WO}" — มี: ${Object.keys(TRIPS_VISUAL_SPECS).join(" · ")}`);
  process.exit(2);
}
const only = argOf("--only");
const EX_DATE = argOf("--ex-date") ?? DEPARTURE_RACHA_1114.date;
if (!/^\d{4}-\d{2}-\d{2}$/.test(EX_DATE)) {
  console.error(`❌ --ex-date ต้องเป็น YYYY-MM-DD: ${EX_DATE}`);
  process.exit(2);
}
const WEEK = argOf("--week") ?? CALENDAR_WEEK_1111.rows.racha[0].date;
const MONTH = argOf("--month") ?? WEEK.slice(0, 7);
const DEC_DATE = argOf("--dec-date") ?? RACHA_DEPARTURE_PRICE_1231.date;
const BOOK_DATE = argOf("--book-date") ?? RACHA_DEPARTURE_PRICE_1231.date;
const BOOK_MONTH = argOf("--book-month") ?? BOOK_DATE.slice(0, 7);
for (const [flag, v, re] of [["--week", WEEK, /^\d{4}-\d{2}-\d{2}$/], ["--month", MONTH, /^\d{4}-\d{2}$/], ["--dec-date", DEC_DATE, /^\d{4}-\d{2}-\d{2}$/], ["--book-date", BOOK_DATE, /^\d{4}-\d{2}-\d{2}$/], ["--book-month", BOOK_MONTH, /^\d{4}-\d{2}$/]] as const) {
  if (!re.test(v)) {
    console.error(`❌ ${flag} รูปแบบผิด: ${v}`);
    process.exit(2);
  }
}
const specs = only ? allSpecs.filter((s) => s.name === only) : allSpecs;
if (!specs.length) {
  console.error(`❌ --only ${only} ไม่มีในสเปก ${WO}: ${allSpecs.map((s) => s.name).join(" · ")}`);
  process.exit(2);
}
if (argv.includes("--list")) {
  console.log(`VISUAL_SPECS ${JSON.stringify(specs.map((s) => ({ name: s.name, mockup: s.mockup, actions: s.actions?.length ?? 0, fullPage: s.fullPage !== false, devices: DEVICES.map((d) => `${d.width}x${d.height}`) })))} · exDate ${EX_DATE} · week ${WEEK} · month ${MONTH} · decDate ${DEC_DATE}`);
  process.exit(0);
}
const BASE = (argOf("--base") ?? process.env.QC_BASE ?? "").replace(/\/+$/, "");
if (!BASE) {
  console.error("❌ ไม่ได้ระบุ server — ส่ง --base http://127.0.0.1:<port> หรือ QC_BASE (ไม่มีค่าปริยาย)");
  process.exit(2);
}
let baseUrl: URL;
try {
  baseUrl = new URL(BASE);
} catch {
  console.error(`❌ --base อ่านไม่ได้: ${BASE}`);
  process.exit(2);
}
if (FORBIDDEN_PORTS.includes(baseUrl.port)) {
  console.error(`❌ ${BASE} คือ server ของ CRM (:${baseUrl.port}) — TRIPS ต้องใช้ server ของตัวเอง`);
  process.exit(2);
}
{
  const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (ping instanceof Error) {
    console.error(`❌ ต่อ QC server ${BASE} ไม่ได้ (${ping.message.slice(0, 80)}) — เปิด server ของ TRIPS ก่อนแล้วรันซ้ำ`);
    process.exit(2);
  }
  console.log(`🌐 QC server ${BASE} ตอบ HTTP ${ping.status}`);
}

const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const OUT = join(ROOT, SHOTS_DIR, WO);
mkdirSync(OUT, { recursive: true });
class Fatal extends Error {}
const MINE = { sessionIds: [] as string[] };
type Cookie = { name: string; value: string; url?: string; domain?: string; path: string; secure?: boolean };

const owner = SHOP_DIVE.users[0];
async function mintSession(asKey?: string): Promise<Cookie[]> {
  const who = asKey ? SHOP_DIVE.users.find((u) => u.key === asKey) : owner;
  if (!who) throw new Fatal(`ไม่มีผู้ใช้ seed key ${asKey}`);
  const row = await prisma.user.findUnique({ where: { email: who.email }, select: { id: true } });
  if (!row) throw new Fatal(`ไม่พบผู้ใช้ (${who.email}) — รัน scripts/seed-trips-qc.mts ก่อน`);
  const token = "trp" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const s = await prisma.session.create({ data: { userId: row.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.sessionIds.push(s.id);
  const tenantId = SHOP_DIVE.tenant.id;
  return baseUrl.protocol === "https:"
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: baseUrl.hostname, path: "/" }, { name: "shark_tenant", value: tenantId, domain: baseUrl.hostname, path: "/" }];
}
async function idsFromSeed(): Promise<Ids> {
  const tenantId = SHOP_DIVE.tenant.id;
  const unit = SHOP_DIVE.units.trips;
  const prod = async (slug: string) => {
    const p = await prisma.tripProduct.findFirst({ where: { tenantId, unitId: unit.id, slug }, select: { id: true } });
    if (!p) throw new Fatal(`ไม่พบสินค้า ${slug} — รัน scripts/seed-trips-qc.mts ก่อน`);
    return p.id;
  };
  const racha = await prod("racha-yai-day-trip");
  const similan = await prod("similan-4-nights");
  const dep = await prisma.tripDeparture.findFirst({ where: { tenantId, unitId: unit.id, productId: racha, localDate: new Date(`${EX_DATE}T00:00:00.000Z`), status: { not: "CANCELLED" } }, select: { id: true } });
  if (!dep) throw new Fatal(`ไม่พบรอบราชา ${EX_DATE} (ที่ไม่ยกเลิก) — รัน seed ก่อน หรือส่ง --ex-date ของรอบที่มีจริง`);
  const dec = await prisma.tripDeparture.findFirst({ where: { tenantId, unitId: unit.id, productId: racha, localDate: new Date(`${DEC_DATE}T00:00:00.000Z`), status: { not: "CANCELLED" } }, select: { id: true } });
  if (!dec && WO === "t1.2") throw new Fatal(`ไม่พบรอบราชา ${DEC_DATE} (ที่ไม่ยกเลิก) — รัน seed ก่อน หรือส่ง --dec-date ของรอบที่มีจริง`);
  const decWeek = new Date(Date.parse(`${DEC_DATE}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  // TRIPS T1.3 ▸ การจองของภัทรา บนรอบราชา DEPARTURE_RACHA_1114.date (ไม่ฝัง id/เลขจอง — เลขจริงมาจากตัวนับของ seed) ◂
  const bk0142 = await prisma.tripBooking.findFirst({
    where: { tenantId, unitId: unit.id, productId: racha, travelDate: new Date(`${DEPARTURE_RACHA_1114.date}T00:00:00.000Z`), bookerPartyId: BOOKING_0142_PARTY },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  if (!bk0142 && WO === "t1.3") throw new Fatal(`ไม่พบการจองของ ${BOOKING_0142_PARTY} บนรอบราชา ${DEPARTURE_RACHA_1114.date} — รัน scripts/seed-trips-qc.mts ก่อน`);
  return { unitSlug: unit.slug, racha, similan, racha1114: dep.id, racha1231: dec?.id ?? "", week: WEEK, month: MONTH, decWeek, shopSlug: SHOP_DIVE.tenant.slug, bookMonth: BOOK_MONTH, bookDate: BOOK_DATE, booking0142: bk0142?.id ?? "" };
}

type Page = {
  setViewport(v: object): Promise<void>;
  setCookie(...c: Cookie[]): Promise<void>;
  setExtraHTTPHeaders(h: Record<string, string>): Promise<void>;
  on(ev: string, f: (x: never) => void): void;
  goto(url: string, o: object): Promise<{ status(): number } | null>;
  evaluate<R, A>(f: (a: A) => R, a?: A): Promise<R>;
  waitForSelector(sel: string, o: object): Promise<unknown>;
  screenshot(o: object): Promise<unknown>;
  emulateMediaType(type?: string): Promise<void>;
  close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void>; createBrowserContext?(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
type Pptr = { default: { launch(o: object): Promise<Browser> } };

/** ขั้นกด/กรอกก่อนถ่าย — หาเป้าไม่เจอ ⇒ ข้อความผิดพลาด (ฉากนั้น ❌) */
async function runAction(page: Page, a: Action): Promise<string | null> {
  if ("pause" in a) {
    await new Promise((r) => setTimeout(r, a.pause));
    return null;
  }
  if ("reveal" in a) {
    const ok = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ block: "start" });
      return true;
    }, a.reveal);
    await new Promise((r) => setTimeout(r, 300));
    return ok ? null : `เลื่อนไป ${a.reveal} ไม่ได้`;
  }
  if ("waitFor" in a) {
    const ok = await page.waitForSelector(a.waitFor, { timeout: 15_000 }).then(() => true).catch(() => false);
    return ok ? null : `รอ ${a.waitFor} ไม่ขึ้น`;
  }
  if ("fill" in a) {
    const ok = await page.evaluate((x: { selector: string; nth: number; value: string }) => {
      const el = document.querySelectorAll(x.selector)[x.nth];
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, x.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { selector: a.fill.selector, nth: a.fill.nth ?? 0, value: a.fill.value });
    await new Promise((r) => setTimeout(r, 150));
    return ok ? null : `กรอก ${a.fill.selector}[${a.fill.nth ?? 0}] ไม่ได้`;
  }
  const ok = await page.evaluate((x: { selector: string; text: string | null }) => {
    const els = Array.from(document.querySelectorAll(x.selector)).filter((e) => x.text === null || (e.textContent ?? "").trim() === x.text);
    const el = els.find((e) => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled);
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return true;
  }, { selector: a.click.selector, text: a.click.text ?? null });
  await new Promise((r) => setTimeout(r, 400));
  return ok ? null : `กด ${a.click.selector}${a.click.text ? ` "${a.click.text}"` : ""} ไม่ได้`;
}

let failures = 0;
let publicSeq = 0; // TRIPS W1.2 r1 ▸ ลำดับ IP ของฉากสาธารณะ (ฉาก×อุปกรณ์) ◂
let fatal = "";
const shots: string[] = [];
const results: { name: string; device: string; mockup: string; status: number; errors: string[]; overflow: boolean; file: string }[] = [];
const profile = `/tmp/chr-trips-${process.pid}`;
try {
  const ids = await idsFromSeed();
  if (WO === "w1.2") W12_VOUCHER_TOKEN = await w12VoucherToken(ids.booking0142); // TRIPS W1.2 ▸ ◂
  if (WO === "w1.3") await w13Prepare(ids); // TRIPS W1.3 ▸ รอบ/การจองของตัวเอง (ลบใน finally) ◂
  if (WO === "w1.4") await w14Prepare(ids); // TRIPS W1.4a ▸ รอบ/การจองของตัวเอง (ลบใน finally ด้วย w13Cleanup) ◂
  const cookies = specs.some((s) => !s.public) ? await mintSession() : [];
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e})`);
  })) as Pptr;
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`],
  });
  try {
    for (const spec of specs) for (const dev of DEVICES) {
      if (spec.name === "book-expired" && !W12_EXPIRED_TOKEN) W12_EXPIRED_TOKEN = await w12ExpireLatestWebBooking(); // TRIPS W1.2 รอบ 2 ▸ ◂
      W13_DEV = dev.device; // TRIPS W1.3 ▸ ◂
      // หน้าสาธารณะ: บริบทใหม่ (ไม่มีคุกกี้ของฉากอื่น) + หัว IP ของผู้ใช้ (ไม่พึ่งว่า server เติมให้)
      const ctx = (spec.public || spec.as) && browser.createBrowserContext ? await browser.createBrowserContext() : null;
      const page = await (ctx ?? browser).newPage();
      await page.setViewport({ width: dev.width, height: dev.height, deviceScaleFactor: 1, isMobile: dev.mobile, hasTouch: dev.mobile });
      // TRIPS W1.2 r1 (มติ W2 · ผู้คุมทำตอนรับงาน) ▸ ฉากสาธารณะใช้ IP ผู้ใช้ต่างกันต่อฉาก×อุปกรณ์ — ไม่ชนถังถือต่อรอบต่อเครื่อง (3/ชม.) / ถังถือต่อเครื่อง ◂
      if (spec.public) await page.setExtraHTTPHeaders({ "x-forwarded-for": `${PUBLIC_CLIENT_IP.split(".").slice(0, 3).join(".")}.${(Number(PUBLIC_CLIENT_IP.split(".")[3]) + ++publicSeq) % 250}` });
      else await page.setCookie(...(spec.as ? await mintSession(spec.as) : cookies));
      const errors: string[] = [];
      page.on("pageerror", (e: never) => errors.push(String((e as Error).message).slice(0, 120)));
      if (spec.media) await page.emulateMediaType(spec.media);
      const resp = await page.goto(`${BASE}${spec.path(ids)}`, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200));
      for (const a of spec.actions ?? []) {
        const err = await runAction(page, a);
        if (err) {
          errors.push(err);
          break;
        }
      }
      if (!spec.actions?.length) await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
      // T1.4a มติ M6: ผังพิมพ์เป็นตารางคอลัมน์ขนาดกระดาษ (~148 มม.) — เครื่องพิมพ์จัดหน้าตามความกว้างกระดาษ ไม่ใช่ความกว้างจอ ⇒ ไม่ตรวจล้นที่ 390 ของสื่อพิมพ์
      const overflow = spec.media === "print" && dev.width < 600 ? false : await page.evaluate((vw: number) => document.documentElement.scrollWidth > vw + 2, dev.width).catch(() => false);
      const file = join(OUT, `${spec.name}-${dev.device}.png`);
      await page.screenshot({ path: file, fullPage: spec.fullPage !== false });
      shots.push(file);
      const status = resp?.status() ?? 0;
      const statusOk = spec.expectStatus !== undefined ? status === spec.expectStatus : status > 0 && status < 400;
      const ok = statusOk && !overflow && errors.length === 0;
      if (!ok) failures++;
      results.push({ name: spec.name, device: dev.device, mockup: spec.mockup, status, errors, overflow, file });
      console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${dev.device} ${dev.width}] (↔ ภาพ ${spec.mockup}) HTTP ${status} → ${file}${overflow ? " · ล้นแนวนอน" : ""}${errors.length ? ` · ${errors.length} ข้อผิดพลาด: ${errors[0]}` : ""}`);
      await page.close();
      await ctx?.close();
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  let count = 0;
  let cleaned: number | null = null;
  if (WO === "w1.3") cleaned = await w13Cleanup().catch((e: unknown) => { console.error(`⚠️ w1.3: ล้างไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`); return -1; }); // TRIPS W1.3 ▸ ◂
  if (WO === "w1.4") cleaned = await w13Cleanup().catch((e: unknown) => { console.error(`⚠️ w1.4: ล้างไม่สำเร็จ — ${e instanceof Error ? e.message : String(e)}`); return -1; }); // TRIPS W1.4a ▸ ◂
  if (MINE.sessionIds.length) count = (await prisma.session.deleteMany({ where: { id: { in: MINE.sessionIds } } })).count;
  const stale = await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } });
  await prisma.$disconnect();
  for (const d of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
  writeFileSync(join(OUT, "summary.json"), JSON.stringify({ wo: WO, at: new Date().toISOString(), results, ...(cleaned === null ? {} : { cleaned }) }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${count}${stale.count ? ` (+ซากหมดอายุ ${stale.count})` : ""} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, shots: shots.length, failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
