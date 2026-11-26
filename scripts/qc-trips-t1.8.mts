// ร่างข้อสอบ — QC TRIPS T1.8a · ข้อความถึงลูกค้าทริปผ่าน notifyCustomer (ภาพ 13จ)
// สถานะ: ร่างของผู้ร่างใบ (.txt — ไม่รัน) · ผู้เขียนข้อสอบแปลงเป็น scripts/qc-trips-t1.8.mts หลังผู้คุมเคาะ C-1..C-12
// ใบสั่ง: ledger/trips-briefs/T1.8.md (§3 ไฟล์/งบ · §4 พฤติกรรม · §4.3 ตาราง "ส่งได้ไหม" · §5 ข้อความ · §8 ห้าม)
//
// กลุ่มข้อ (ป้ายระดับในชื่อข้อ: [pure] notify-core · [service] notifyTripBooking/consumer · [job] runCustomerMessages ·
//           [action] บันทึกค่าตั้ง · [page] ลิ้นชัก/ตัวอย่าง (renderToStaticMarkup) · [code] สแกนไฟล์)
//   PC ตัวควบคุม (เขียวก่อนและหลังงาน)   S ขอบเขต/กติกาโค้ด   P ตัวช่วยบริสุทธิ์
//   GW ประตู platform (เพิ่มอย่างเดียว)   C ยืนยัน   M เตือนก่อนเดินทาง   D งวดจ่าย   A ตามจองค้าง (G6)
//   R ผู้รับ/เอเจนซี่/ช่องทาง   X PDPA/ข้อมูลส่วนบุคคล   E ซ้ำ/พร้อมกัน/โพรเซสตาย   J งาน (ลองซ้ำ · เวลาเงียบ · tenantIds · signal)
//   G ไม่ส่งสิ่งที่ T1.6b / W1.4b2 / W1.4c ยังไม่เปิด   T แม่แบบ (ด่าน · ค่าเริ่ม · ตัวอย่าง)   L บันทึกต่อการจอง   PF จำนวน SQL
//
// 🔴 ไม่ยิงข้อความจริงเด็ดขาด (แบบ qc-svc-b.9.mts:142–175 · qc-svc-r0.7.mts:90–148):
//    ตัวจำลอง LINE = node:http บน 127.0.0.1 (จด method/path/json ของทุกคำขอ · /v2/bot/message/push ⇒ 200 · โหมด 429/500 สลับได้ต่อข้อ)
//    + process.env.LINE_API_BASE = ตัวจำลอง + ครอบ globalThis.fetch: โฮสต์นอก 127.0.0.1/localhost/ฐาน QC ⇒ ตอบ 503 + จดใน BLOCKED
//    ข้อ PC-3 ต้องเห็น BLOCKED ว่าง และทุก push ไปที่ตัวจำลองเท่านั้น · โพรเซสลูก (E-4) ได้ LINE_API_BASE เดียวกัน
//    APP_URL ตั้งเป็น https://qc-trips.invalid (ให้ Flex/ลิงก์เต็มทำงาน · โดเมน .invalid ไม่มีวันออกเน็ต) · SESSION_SECRET ทดสอบ ≥ 32 ตัว
// 🔴 นาฬิกา: [service]/[job] ส่ง now จำลองเสมอ · NOW0 = 2027-03-01T10:00:00+07:00 (จันทร์) · รอบทดสอบ D1 = 2027-03-02 08:00 เวลาหน่วย
//    หน่วยเขตเวลา Asia/Bangkok (หลัก) + หน่วย Asia/Tokyo (ข้อ M-6 C-6) · ห้ามข้อใดเทียบกับวันนี้จริง · งานเรียกด้วย tenantIds เสมอ
// 🔴 ร้านชั่วคราว slug `trips-t18-*` · ลบใน finally + กวาดค้างตอนเริ่ม · ค่าคาดหวังคิดเองจากฟิกซ์เจอร์ (ไม่เรียกโค้ดที่ทดสอบมาคิดคำตอบ)
// 🔴 ฟิกซ์เจอร์ LINE ต่อร้าน: ChatChannelConnection LINE (token ทดสอบ) + ค่าตั้ง messaging.lineConnectionId ของหน่วย + ChatContact LINE ผูก Party
//    (แบบ PC ของ qc-svc-b.9) · ผู้จอง P1 มี LINE (lang "th") · P2 มี LINE (lang "en") · P3 ไม่มี LINE · P4 LINE blockedAt · P5 ถอนยินยอม LINE
//    · การจองสร้างผ่านบริการจริงของ trips (holdSeats/confirm/recordPayment ตาม T0.6/T0.7) ไม่ insert ตรง ยกเว้นสถานะที่ยังไม่มีทางสร้าง (TRAVELLED ของ b)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.8.mts   (ห้าม timeout ครอบ)
// ผลที่ถูกต้องก่อนมีงาน: PC · S-2..S-4 · G-1..G-3 (ยังไม่มี consumer) เขียว · ที่เหลือแดง "ยังไม่มี"

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { spawn } from "node:child_process";
import pg from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { changedOnlyByMainMerge, fromMainMerge } from "./trips-main-merge.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t1.8";
loadTripsQcEnv(LABEL);                              // ฐานไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) process.exit(4);                // with-gate-lock
if (process.env.APP_ENV === "production") process.exit(4);

// ═══ ตัวจำลอง LINE + ครอบ fetch (คัดแบบ qc-svc-b.9) ═══
type FakeReq = { method: string; path: string; json: any; retryKey: string; status: number };
const FAKE: FakeReq[] = []; let FAKE_MODE: "ok" | "429" | "500" = "ok";
const server = createServer(/* push ⇒ ตาม FAKE_MODE · จด header x-line-retry-key */);
// process.env.LINE_API_BASE = FAKE_BASE · globalThis.fetch = guard(BLOCKED) · คืนค่าเดิมใน finally
const pushesSince = (m: number) => FAKE.slice(m).filter((r) => r.path === "/v2/bot/message/push");

// ═══ harness: st(id, name, fn) · ok/eq · groupLine · JSON_SUMMARY (แบบ qc-trips-w1.4.mts) ═══
// ═══ ตัวนับ SQL: PrismaClient event query ฉีดเป็น globalThis.prisma · measure() (แบบ qc-trips-t1.7a2 PF-3) ═══

// ───────────────────────── PC ตัวควบคุม ─────────────────────────
// PC-1 ฟิกซ์เจอร์: ร้าน A (หน่วย TRIPS Bangkok + หน่วย Tokyo) · ร้าน B (ข้ามร้าน) · OA LINE ต่อหน่วย · Party P1–P5 · สินค้า R (มี en) · รอบ D1
// PC-2 ตัวจำลอง LINE ตอบ push ได้ (เรียก pushLineMessagesToContact ของ facade แชทตรงหนึ่งครั้ง ⇒ FAKE +1) · โหมด 429 ⇒ code QUOTA
// PC-3 ไม่มีคำขอออกนอกเครื่อง (BLOCKED ว่างตอนจบ) — ตรวจซ้ำท้ายไฟล์ด้วย
// PC-4 notifyCustomer เดิม domain "booking" ยังทำงาน (ส่ง booking.msg.confirmation ⇒ SENT) — ตัวควบคุมของ GW

// ───────────────────────── S ขอบเขต / กติกาโค้ด ─────────────────────────
// S-1 [code] ไฟล์ที่แตะ ⊆ ใบสั่ง §3 + งบต่อไฟล์ (เทียบ merge-base กับ session/trips · ไม่นับไฟล์ที่ตรงกับ session/trips · ไม่นับไฟล์จาก main
//      ตาม fromMainMerge/changedOnlyByMainMerge · ไม่นับ scratchpad/ ledger/)
// S-2 [code] ไม่มี migration · ไม่แตะ src/lib/core/** · ไม่มีคีย์ค่าตั้ง/สิทธิ์ใหม่ (permissions.ts ตรงกับ session/trips)
// S-3 [code] ไม่มี event ใหม่: automation/labels.ts · webhooks/labels.ts ตรงกับ session/trips · outbox-consumers.ts ต่างเฉพาะ 2 บรรทัด
//      (trips.booking.confirmed · trips.payment.due_soon) · ไม่มีคีย์ "trips.booking.travelled" "cancel_choice" "paid_after_expiry" ในไฟล์
// S-4 [code] ไฟล์ใหม่ใน trips ไม่เรียกตัวส่ง LINE ตรง (push*/replyFlex/api.line.me/sendLineToParty) · ไม่ import @/lib/modules/member|crm|chat
// S-5 [code] notify-core.ts ไม่มี import ที่แตะฐาน/เวลาเครื่อง (ไม่มี prisma · Date.now · new Date() ไม่มีอาร์กิวเมนต์)
// S-6 [code] jobs.ts ลงทะเบียน trips.customerMessages ทุก 15 นาที ใน minute-jobs.ts · ไม่มี "AT TIME ZONE" ในไฟล์ที่แตะ

// ───────────────────────── P ตัวช่วยบริสุทธิ์ (notify-core) ─────────────────────────
// P-1 [pure] คีย์กันซ้ำ: 4 ชนิดตรงรูป §4.5 · มีแต่ [A-Za-z0-9:._-] · ไม่มีเบอร์ไทย · ≤ 200 ตัว
// P-2 [pure] ตาราง §4.3 ครบทุกเซลล์ (สถานะ 9 × ชนิด 4 · A32 3 ค่า × ชนิด · ช่องทาง 12 × ชนิด · collectMode) — ตารางคาดหวังเขียนในข้อสอบ
// P-3 [pure] จุดเตือน: รอบ 2027-03-02 07:00 Bangkok ⇒ ช่วงส่ง [2027-03-01 17:00, 2027-03-02 00:00) เวลาหน่วย · รอบ 23:00 (ดำกลางคืน) ⇒ ช่วงเดียวกัน
//      · หน่วย Tokyo รอบ 08:00 JST ⇒ ช่วง [17:00 JST วันก่อน, 24:00 JST) (ไม่ใช่เวลาไทย)
// P-4 [pure] ตัวแปร th/en: วันที่ "อ. 2 มี.ค. 2570" / "Tue 2 Mar 2027" · ยอด "฿1,234.50"/"THB 1,234.50" · ไม่มีจุดรับ ⇒ ข้อความกลาง §5 · ชื่อสินค้าไม่มี en ⇒ th
// P-5 [pure] ด่านแม่แบบ: "คืนเงินอัตโนมัติ" ⇒ ผิด · "refund within 7 days" ⇒ ผิด · "ทันที" ⇒ ผิด · ไม่มี {ลิงก์} ใน confirmation ⇒ ผิด ·
//      ไม่มี {ลิงก์} ใน (ไม่มีชนิดบังคับอื่น) ⇒ ผ่าน · en มี "ร้าน" นอก {} ⇒ ผิด · en มี "{ร้าน}" ⇒ ผ่าน · 1,001 ตัว ⇒ ผิด · ค่าเริ่มทั้ง 10 ชนิดของทะเบียนผ่าน
// P-6 [pure] Flex 13จ: bubble · หัว "จองสำเร็จ"/"Booking confirmed" · มีรหัส/สินค้า/วัน/คน/ชำระ · ไม่มีชื่อผู้จอง/เบอร์ · ปุ่ม uri https เท่านั้น ·
//      การจองเอเจนซี่หรือ snapshot ไม่ยอมเปลี่ยนเอง ⇒ ไม่มีปุ่ม "เลื่อนวัน / ยกเลิก" · ไม่มีปุ่มกรอกข้อมูลผู้เดินทาง · en ไม่มีอักษรไทย (ยกเว้นชื่อร้าน/สินค้าที่ไม่มี en)

// ───────────────────────── GW ประตู platform ─────────────────────────
// GW-1 [service] domain "trips" + messageKey "confirmation" ⇒ ใช้แม่แบบ trips.msg.confirmation · domain "trip" (สะกดผิด) ⇒ VALIDATION
// GW-2 [service] scope.productId: ตั้งแม่แบบชั้น PRODUCT ของ R ⇒ ข้อความที่ตัวจำลองได้ = ชั้นสินค้า · สินค้าอื่น ⇒ ชั้นหน่วย
// GW-3 [service] localized.en: ผู้รับ lang "en" ได้ vars/flex ของ en · lang "th" ได้ของหลัก · ไม่ส่ง localized ⇒ เหมือนเดิมทุกไบต์ (เทียบข้อความกับ PC-4)
// GW-4 [code] ผู้เรียกเดิม (booking-notify · dorm-* · booking-waitlist) ไม่ถูกแก้ · regression qc-svc-r0.7/b.9/d.9 รันในหมวด RG (นอกไฟล์นี้)

// ───────────────────────── C ยืนยันการจอง ─────────────────────────
// C-1 [service] P1 จอง WEB จ่ายครบ (HOLD→PAID) ⇒ event confirmed 1 ตัว ⇒ consumer ⇒ push 1 · ข้อความ altText = แม่แบบ th แทนค่าครบ · ลิงก์ = https://qc-trips.invalid/book/<slug>/my/<token จาก bookingPublicToken>
// C-2 [service] P2 (en) ⇒ แม่แบบ en · ลิงก์มี ?lang=en · ไม่มีอักษรไทยนอกชื่อร้าน
// C-3 [service] ยืนยันตอน 23:30 (เวลาเงียบ) ของการจองที่สร้าง 23:10 ⇒ ส่งทันที (≤ 30 นาที) · ของการจองที่สร้าง 20:00 แล้วร้านอนุมัติ 23:30 ⇒ SKIPPED_QUIET + retryAt 08:00
// C-4 [service] HOLD (ยังไม่จ่าย) ⇒ ไม่มีข้อความ · PENDING ⇒ ไม่มี · EXPIRED/CANCELLED ก่อน consumer มา ⇒ ไม่ส่ง (BAD_STATE หรือ SKIPPED_PRECHECK_*)
// C-5 [service] ช่องทาง OTA · IMPORT ⇒ ไม่ส่ง
// C-6 [service] T69 confirmation ปิดชั้นสินค้า ⇒ ไม่ส่ง (DISABLED · ไม่มีแถว log) · เปิดชั้นหน่วยแต่ปิดชั้นสินค้า ⇒ ไม่ส่ง
// C-7 [service] origin ไม่ใช่ https (APP_URL http://…) ⇒ ข้อความล้วน (type text) ไม่ใช่ flex

// ───────────────────────── M เตือนก่อนเดินทาง ─────────────────────────
// M-1 [job] NOW = 2027-03-01 16:45 ⇒ ไม่ส่ง · 17:00 ⇒ ส่ง 1 (P1 การจอง PAID บนรอบ D1) · tick ซ้ำ 17:15 ⇒ ไม่ส่งเพิ่ม
// M-2 [job] การจองสร้าง 17:30 วันก่อน ⇒ ไม่เตือน (จองหลังจุดเตือน)
// M-3 [job] ช่วงเวลาเงียบตั้ง 16:00–09:00 ⇒ 17:00 ข้ามหน่วย (ไม่มีแถว SKIPPED_QUIET ใหม่) · วันเดินทาง 09:00 ⇒ ไม่ส่ง (เลยวันก่อน · TOO_LATE) — ไม่ส่ง "พรุ่งนี้" ในวันเดินทาง
// M-4 [job] ย้ายรอบ (trips.booking.changed) หลังเตือนแล้ว ไปวันที่ 2027-03-05 ⇒ 2027-03-04 17:00 ส่งอีก 1 (คีย์ใหม่) · ของเดิมไม่ส่งซ้ำ
// M-5 [job] ร้านยกเลิกรอบ (สถานะรอบ CANCELLED · ตั้งผ่านบริการรอบ) ⇒ ไม่เตือน · มีคำขอคืนเงิน REQUESTED ⇒ ไม่เตือน · CANCELLED ⇒ ไม่เตือน
// M-6 [job] หน่วย Tokyo: NOW = 17:00 JST (= 15:00 ไทย) ⇒ ส่ง · 16:30 JST ⇒ ไม่ส่ง (เขตเวลาหน่วย)
// M-7 [service] {เวลารับ}/{จุดนัด}: จัดรถแล้ว (T1.4) ⇒ "07:10–07:30"/ชื่อจุดรับ · ยังไม่จัด ⇒ จุดนัดสินค้า · ไม่มีทั้งคู่ ⇒ ข้อความกลาง (missingVars ว่าง)

// ───────────────────────── D งวดจ่าย ─────────────────────────
// D-1 [service] LA (T69 paymentDue เปิดค่าเริ่ม) งวด OPEN · runPaymentDue ⇒ event due_soon :<dueId>:7 ⇒ push 1 · {ยอดค้าง} {ครบกำหนด} ถูก
// D-2 [service] DS (ค่าเริ่มปิด) ⇒ ไม่ส่ง · collectMode AGENT ⇒ ไม่ส่ง · งวดจ่ายครบก่อน consumer ⇒ SKIPPED_PRECHECK_* · มีคำขอคืนเงินเปิด ⇒ ไม่ส่ง
// D-3 [service] d=7 และ d=1 ⇒ 2 ข้อความ (คนละคีย์) · event ซ้ำ ⇒ ไม่เพิ่ม

// ───────────────────────── A ตามจองค้าง (G6) ─────────────────────────
// A-1 [job] WEB hold หมด 10:00 (P1 มี LINE แต่ผูกด้วย Party เท่านั้น) · NOW 11:00 ⇒ **ไม่ส่ง** (ไม่มีผู้รับที่ยืนยันตัว · C-4 ก) · ไม่มีแถว log
// A-2 [job] เหมือน A-1 แต่ใส่ ChatLinkCode purpose "TRIP_BOOKING" refId=การจอง usedByChatContactId=ผู้ติดต่อ P1 ⇒ 10:59 ไม่ส่ง · 11:00 ส่ง 1 · ลิงก์ = หน้าหมดเวลา
// A-3 [job] เลย 12 ชม. (22:01 ของวันเดียวกัน + เวลาเงียบ) ⇒ ไม่ส่ง · ในเวลาเงียบ ⇒ ข้ามหน่วย แล้ว 08:00 (ยังในหน้าต่าง) ⇒ ส่ง
// A-4 [job] paidSatang > 0 · การจองฟื้นเป็น CONFIRMED (ตั้งผ่านทางที่มี) · Party เดียวกันจองรอบเดียวกันใหม่หลังจากนั้น · รอบเต็ม/ปิดรับ/เริ่มไปแล้ว ⇒ ไม่ส่งทุกกรณี
// A-5 [job] ช่องทาง COUNTER · AGENT_LINK (agentAccountId) ⇒ ไม่ส่ง
// A-6 [job] Party เดียวกันถือหมด 2 ครั้งใน 3 วัน (คนละการจอง · ยืนยันตัวทั้งคู่) ⇒ ส่งครั้งเดียว (≤ 1/Party/7 วัน)
// A-7 [job] T10 enabled=false หรือ T69 abandonedBooking=false ⇒ ไม่ส่ง (AND · C-8) · afterMinutes 120 ⇒ ส่งที่ +120
// A-8 [job] ผู้จองถูกลบตามอายุ (piiPurgedAt · bookerPartyId null) ⇒ ไม่ส่ง

// ───────────────────────── R ผู้รับ · เอเจนซี่ · ช่องทาง ─────────────────────────
// R-1 [service] P3 (ไม่มี LINE) ⇒ แถว NO_CHANNEL (เห็นในลิ้นชัก) · ไม่มี push
// R-2 [service] A32 SHOP_FULL ⇒ ยืนยัน+เตือน · SHOP_OPS_ONLY ⇒ เตือนเท่านั้น · AGENT_ONLY ⇒ ไม่มีอะไร (ตั้งค่าที่ชั้น AGENT · และค่าใน snapshot ชนะค่าสด)
// R-3 [service] OA ของหน่วยไม่ได้ตั้ง (messaging.lineConnectionId null) ⇒ NO_CHANNEL · ผู้ติดต่ออยู่บน OA อื่นของร้าน ⇒ NO_CHANNEL (ไม่เดา OA)
// R-4 [service] ข้ามร้าน: เรียก notifyTripBooking ด้วย ctx ร้าน B + bookingId ร้าน A ⇒ NOT_FOUND · ไม่มี push · ไม่มีแถว log ในร้านใด
// R-5 [service] ChatLinkCode ผูกผู้ติดต่อที่ Party ไม่ตรงผู้จอง ⇒ ไม่ใช้ผู้ติดต่อนั้น (แบบ booking-notify partyMismatch)

// ───────────────────────── X PDPA · ข้อมูลส่วนบุคคล ─────────────────────────
// X-1 [service] P4 blockedAt ⇒ SKIPPED_CONSENT · P5 ถอนยินยอม LINE ⇒ SKIPPED_CONSENT · ไม่มี push
// X-2 [service] booker.erased (CRM/สมาชิกลบ · onBookerPartyErased) ⇒ ไม่ส่งทุกชนิด แม้ bookerPartyId ยังอยู่
// X-3 [code+service] สแกน: แถว ServiceMessageLog · OutboxEvent ที่ใบนี้สร้าง · audit · console ที่ดักไว้ ⇒ ไม่มีชื่อ/เบอร์/อีเมลของ P1–P5 · ไม่มี token · ไม่มีข้อความแม่แบบ
// X-4 [service] ข้อความที่ตัวจำลองได้ไม่มีชื่อผู้จอง/เบอร์/อีเมล/ชื่อผู้เดินทาง/เลขเอกสาร (ฟิกซ์เจอร์ใส่ค่าที่หาเจอง่าย)
// X-5 [page] หน้าปลายลิงก์ GET /book/<slug>/my/<token> (ถ้ามี QC_BASE) ⇒ <title> ไม่มีรหัส/สินค้า/ชื่อ · ไม่มี og:* · robots noindex — ไม่มี QC_BASE ⇒ SKIP (ไม่นับผ่าน)
// X-6 [service] marketingEligible=false (เอเจนซี่เก็บเงิน) ⇒ ไม่มีการเรียก member.* ใด ๆ (สแกนตาราง Customer/MemberConsent ไม่เพิ่มแถว)

// ───────────────────────── E ซ้ำ · พร้อมกัน · โพรเซสตาย ─────────────────────────
// E-1 [service] consumer event เดียวกัน 2 ครั้งติด ⇒ push 1
// E-2 [service] consumer 8 ตัวพร้อมกัน (Promise.all) ⇒ push 1 · แถว log 1 (SENT)
// E-3 [job] runCustomerMessages 2 ตัวพร้อมกันที่ 17:00 ⇒ เตือน 1 ต่อการจอง
// E-4 [service] โพรเซสลูกส่งแล้วตายหลังตัวจำลองรับ (ตัวจำลองค้างคำตอบ แล้ว kill ลูก) · แถวค้าง SENDING ⇒ ก่อน 2 นาทีไม่ส่งซ้ำ (pending) ·
//      หลัง 2 นาที (เลื่อน at ของแถวในฐาน) ⇒ ส่งซ้ำด้วย x-line-retry-key เดิม (ตรวจ header ทั้งสองคำขอเท่ากัน)
// E-5 [service] ตัวจำลองตอบ 500 ⇒ FAILED · ตอบ 429 ⇒ QUOTA (จบ) + audit messaging.line.quota 1 แถว ไม่มี vars

// ───────────────────────── J งาน ─────────────────────────
// J-1 [job] ลองซ้ำ: แถว confirmation FAILED อายุ 61 นาที ⇒ tick ส่งได้ · อายุ 30 นาที ⇒ ไม่ลอง · SKIPPED_QUIET ⇒ ลองหลังพ้นเวลาเงียบ
// J-2 [job] ไม่เริ่ม "ครั้งแรก" ของ confirmation/paymentDue เอง: การจอง CONFIRMED เก่า (ไม่มีแถว log) ⇒ tick ไม่ส่ง (เปิดใช้ครั้งแรกไม่ย้อนหลัง)
// J-3 [job] tenantIds = [ร้าน A] ⇒ ไม่แตะร้าน B · tenantIds = [] ⇒ ไม่ทำอะไร
// J-4 [job] signal aborted ก่อนเริ่ม ⇒ คืน more=true ไม่ส่ง · deadline ผ่านกลางทาง ⇒ หยุดก่อนหน่วยถัดไป
// J-5 [job] หน่วยที่ค่าตั้งผิดรูป ⇒ failed[] มีรหัสสั้น (ไม่มีข้อความดิบ) · หน่วยอื่นยังทำงาน

// ───────────────────────── G ไม่ส่งสิ่งที่ใบอื่นยังไม่เปิด ─────────────────────────
// G-1 [code] outbox-consumers: trips.departure.cancelled · trips.waitlist.offered · trips.refund.* · trips.hold.expired ยังเป็นงานเดิม (เทียบ session/trips ทีละบรรทัด)
// G-2 [code] ไม่มีคีย์ trips.booking.cancel_choice_offered/_made · trips.booking.paid_after_expiry · trips.booking.travelled ในทะเบียน 3 ไฟล์
// G-3 [code+service] แม่แบบ departureChanged · waitlistOffer · refunded · docsMissing · pickupInfo · reviewRequest ไม่ถูกส่ง:
//      สแกน messageKey ในโค้ดใหม่ + หลังทุกกลุ่มข้อ แถว log ของ domain trips มี messageKey ⊆ {confirmation, reminder1Day, paymentDue, abandonedBooking}
// G-4 [service] emit outbox ปลอมชนิด trips.departure.cancelled / trips.refund.done / trips.waitlist.offered ของการจอง P1 แล้ว drain ⇒ push 0
// G-5 [service] รอบที่ร้านยกเลิก (T1.6a ยังไม่รวม ⇒ ตั้งสถานะรอบผ่านบริการรอบที่มี) ⇒ ไม่มี reminder · ไม่มีข้อความเส้นตายใด ๆ
// G-6 [service] การจอง EXPIRED ที่ร้านรับเงินหลังหมดเวลา (ถ้า W1.4b1 ยังไม่รวม ⇒ ตั้ง paidSatang > 0 ผ่านทางที่มี) ⇒ ไม่มี abandoned · ไม่มีข้อความใด
// G-7 [code] ข้อความทั้งหมดของใบ (json + notify-core) ไม่มี "อัตโนมัติ" "automatic" "ทันที" "immediately" ระยะเวลาคืนเงิน

// ───────────────────────── T แม่แบบ ─────────────────────────
// T-1 [action] saveTripsSettings ผู้มี trips.settings.edit: trips.msg.confirmation = "…คืนเงินอัตโนมัติ… {ลิงก์}" ⇒ VALIDATION + messageTh บอกคำ · ไม่บันทึก
// T-2 [action] ลบ {ลิงก์} ออกจาก reminder1Day ⇒ VALIDATION · ใช้ {ชื่อลูกค้า} ⇒ TEMPLATE_VAR_NOT_ALLOWED (ด่านเดิม)
// T-3 [action] ผู้ไม่มีสิทธิ์ (STAFF ไม่มี trips.settings.*) ⇒ PERMISSION · MANAGER หน่วยอื่น ⇒ NOT_FOUND · OWNER ⇒ บันทึกได้ (ข้อความถูกต้อง)
// T-4 [service] เขียนแม่แบบต้องห้ามผ่านเครื่องยนต์ตรง (setSettings จากข้อสอบ = จำลองทางจอกลาง) ⇒ ตอนส่งใช้ค่าเริ่มของทะเบียน + logOps WARN 1 แถวไม่มีข้อความแม่แบบ
// T-5 [action] คืนค่าเริ่ม (resetTripsSetting) ⇒ ข้อความที่ส่งครั้งถัดไป = ค่าเริ่ม · en ว่าง ⇒ ผู้รับ en ได้ th
// T-6 [page] TripsMsgPreview: ค่าในฟอร์ม (ยังไม่บันทึก) ⇒ ตัวอย่างไทย + อังกฤษแทนค่าตัวอย่าง · มีป้าย "ใช้ค่าตัวอย่าง" · ด่านผิด ⇒ แสดงคำที่ผิด · ไม่มีข้อมูลการจองจริง

// ───────────────────────── L บันทึกต่อการจอง ─────────────────────────
// L-1 [service] loadBookingDetailVM.messages ของการจอง C-1 = [{kind confirmation, status SENT, channel LINE}] · ของ R-1 = NO_CHANNEL · ล่าสุดก่อน · ≤ 30
// L-2 [service] ไม่มี trips.booking.view ⇒ FORBIDDEN (ไม่มี messages) · การจองอื่นในร้านเดียวกันไม่ปนกัน (คำนำ trips:<id>: ไม่ชนการจองที่ id ขึ้นต้นเหมือนกัน)
// L-3 [page] BookingDrawer: ก้อน data-testid="trips-bk-msgs" ป้ายไทยตาม §4.9 · ภาษาอังกฤษไม่มีอักษรไทย · 390 ไม่ล้น (ภาพฉากโดยผู้คุม)
// L-4 [service] ผู้จองถูกลบ ⇒ ข้อความ bk.msg.erased

// ───────────────────────── PF จำนวน SQL ─────────────────────────
// PF-1 [service] notifyTripBooking confirmation (รอบที่สอง · แคชอุ่น) ≤ 14 คำสั่ง (ประตู ≤ 10)
// PF-2 [job] runCustomerMessages ต่อหน่วยไม่มีงาน ≤ 4 คำสั่ง · ไม่มี SELECT บน "ServiceMessageLog" ที่ไม่มีเงื่อนไข "dedupeKey" (ไม่สแกนทั้งตาราง)
// PF-3 [service] loadBookingDetailVM เพิ่มไม่เกิน 1 คำสั่ง

// ═══ finally: ลบร้าน trips-t18-* · ล้าง ChatRateBucket ที่ใช้ · คืน fetch/LINE_API_BASE/APP_URL · ปิดตัวจำลอง · PC-3 ซ้ำ ═══
// console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total, passed, failed, skipped, groups })}`)
