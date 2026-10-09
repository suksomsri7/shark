// visual-pos.mts — ถ่ายภาพหน้าจอจริงของ POS 3 ขนาด (RUN POS · ใบ P0.1)
//
// ใช้:
//   pnpm exec tsx scripts/visual-pos.mts <wo|all> --user owner|cashier --base http://127.0.0.1:<port> [--tenant coffee|resto] [--page register]
//   pnpm exec tsx scripts/visual-pos.mts all --user cashier --dry        # พิมพ์แผนการถ่าย (ไม่ต่อ DB · ไม่ต่อเซิร์ฟเวอร์ · ไม่เปิด chromium)
//   ฐานข้อมูลของ "เซิร์ฟเวอร์" ต้องเป็นฐานเดียวกับที่สคริปต์นี้ mint session (ระหว่าง CRM RUN = QC4):
//   bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts all --user owner --base http://127.0.0.1:<port>
//
// ถ่ายอะไร: หน้าที่มีจริงวันนี้ `/app/sys/[id]/pos/{register,sales,products,close,reports,stock}` (POS_PAGES) ×
//   1440×900 · 1024×768 (iPad แนวนอน) · 390×844 → `.qc-shots/pos/<wo>/<page>-<user>-<w>x<h>.png`
//   บันทึกต่อภาพ: HTTP status เทียบ PAGE_EXPECT (owner 200 · cashier บันทึกอย่างเดียว) · URL ปลายทาง (เด้งไป /login = mint ไม่ติด) ·
//   console error · ล้นแนวนอนที่ html/body/main (scrollWidth > clientWidth) · คำขอย่อย 5xx = ตก (4xx บันทึกอย่างเดียว)
//   <wo> รับเฉพาะ ^[A-Za-z0-9._-]+$ ไม่มี '..' · SIGINT/SIGTERM/SIGHUP = ทำความสะอาดแบบเดียวกับ finally ก่อนออก
//   ท้ายสุด `JSON_SUMMARY {...}` + `.qc-shots/pos/<wo>/summary-<user>.json`
//
// POS P1.3 ▸ ถ่าย "สถานะ" ของหน้าขายใหม่ (wo ขึ้นต้น p1.3 หรือ --states) — หน้า register แทนที่ภาพเดียวด้วยชุดสถานะ:
//   default · cart3 (3 บรรทัด + ส่วนลดรายการ) · line-editor · bill-discount · custom-item (owner = กล่อง · cashier = ข้อความเหตุผล)
//   paydlg-cash · sale-done (1440 เท่านั้น — ⚠️ สร้างบิลขายจริง PAID เงินสด 1 ใบต่อผู้ใช้ในร้าน QC: อเมริกาโน่×2 + ลาเต้ ไม่ผูกสต็อก)
//   search-empty · stock-warn (การ์ดเหลือน้อย/หมด/ปิดขาย + กล่องเตือนในบรรทัด) · mobile-sheet (390 เท่านั้น)
//   B2.5: cart4-01 (ตะกร้า 4 บรรทัดเท่าภาพ 01 · ไม่มีคูปอง = P1.12) · offline (ภาพ 19ง) · แคตตาล็อกว่าง = ข้าม (ดู STATE_PLAN)
//   ไฟล์: `<wo>/register-<state>-<user>-<w>x<h>[-en].png` · LOCALE=en (env) = ถ่ายเฉพาะ 1440 + คุกกี้ LOCALE=en (ภาพ 20B)
//   การ์ดเหลือน้อย/หมด/ปิดขาย: สร้างสินค้าชั่วคราว 3 ตัว (+ InvItem 2 ตัว) ที่สาขาของรอบนี้ ลบทิ้งใน finally/signal เสมอ
//     (id `posqc-vis-<pid>-*` · ซากที่ค้างเกิน 1 ชม. ถูกกวาดตอนเริ่ม) — ร้าน QC POS เท่านั้น (`--tenant coffee`)
//   P1.2 U R2: options-popover (desktop/ipad/mobile · สินค้าชั่วคราวมีตัวแปร 2 ตัว + กลุ่มตัวเลือก 4 กลุ่มเท่าภาพ 01 → เลือกตัวแปร +
//     ชิป 2 กลุ่ม "M +10" "นมโอ๊ต +15" + จำนวน 2 · md+ = ป๊อปโอเวอร์ยึดการ์ด · 390 = แผ่นล่าง) · weigh (desktop/mobile · สินค้าชั่งชั่วคราว ฿350/กก.
//     → กล่องน้ำหนัก · owner พิมพ์ 250 กรัม · cashier เห็นข้อความต้องมีสิทธิ์) — กลุ่ม/ตัวเลือก (MenuOptionGroup/Choice) ชั่วคราวลบใน finally ด้วย
//     (ชื่อกลุ่มซ้ำกับของร้านในสาขาเดียวกัน ⇒ ต่อท้าย " (QC <pid>)") · การ์ดถูกหาด้วยคำค้น (ช่องค้นหาจึงมีคำค้นค้างในภาพ)
//   P1.2 U R2 ข้อ 7 + R3 V4 (กะ · P1.9): ธง registerV2 ⇒ บังคับเปิดกะ (required.register) — ก่อนถ่ายสถานะหน้าขาย สคริปต์ตั้งรหัสเครื่องคงที่
//     `posqc-vis-dev-<pid>` (localStorage "shark.pos.deviceId" ผ่าน evaluateOnNewDocument ทุกแท็บ) แล้ว "เจ้าของร้าน" เปิดกะให้เครื่องนั้นผ่าน UI จริง
//     ใน browser context แยก (หน้า /pos/shifts · เงินทอนตั้งต้น 1,000 · ยืนยัน) — แคชเชียร์ QC มีแค่ pos.sale.create เปิดกะเองไม่ได้ (สิทธิ์จริง ·
//     ห้ามเพิ่มสิทธิ์) ⇒ ใช้เครื่องเดียวกับที่เจ้าของเปิดกะให้ · 1 กะต่อรอบ · ทุกสถานะตรวจว่าแถบ "เปิดกะก่อนเริ่มขาย" หายแล้ว (ไม่หาย = ขั้นตอนตก)
//     ปิดกะใน finally/signal ด้วย closeShift ของบริการ (เจ้าของร้าน · นับเงิน = ยอดคาด ⇒ ขาด/เกิน 0 ไม่ต้องเหตุผล) — ปิดไม่ได้ = บันทึกใน summary
//     (shiftClose) ไม่โยน · ห้ามปิดธง required.register เพื่อเลี่ยง
//   ต้องเปิดธง settings.pos.registerV2 ของร้าน QC ก่อน (scripts/seed-pos-qc.mts) — ไม่งั้นได้หน้าขายเดิม = ขั้นตอนสถานะตก
//   ขั้นตอนพัง = ภาพนั้นตก (บันทึก stepError) แต่ยังถ่ายหน้าจอ ณ จุดที่พังไว้ดู ◂
//
// POS P1.14 U ▸ หน้า stock + `--states` (เฉพาะร้าน coffee): stock-default (ไม่ส่ง tab) · stock-count-open (ภาพ 05ค: เปิดรอบ ALL ที่ที่เก็บหลักผ่าน UI
//   ครั้งแรก + บันทึก 2 รายการ — SET ด้วยช่องจำนวน 1 · สแกน ADD ด้วยรหัสสินค้า 1) · stock-count-confirm (กล่องยืนยัน) · stock-receive (คิวรับ 2 แถว ไม่กดรับ) ·
//   stock-adjust (เลือกสินค้า + −2 ไม่กดบันทึก) — 3 ขนาด · แคชเชียร์ QC ไม่มี pos.stock.count ⇒ ทุกสถานะ = การ์ดปฏิเสธ pos-stock-refusal (หน้า 200)
//   🔴 ไม่เขียนอะไรนอกจากรอบนับของรอบนี้: ไม่กดรับเข้า/บันทึกการปรับ · finally/signal ยกเลิกรอบที่รอบนี้เปิด (cancelStockCount · เหตุผล "visual-pos")
//      รอบ OPEN ที่มีอยู่ก่อน (ไม่ใช่ของรอบนี้) = ใช้ถ่ายแต่ไม่ยกเลิก (บันทึกใน summary.stockCount) ◂
//
// POS P1.9 U ▸ หน้า shifts + `--states` (เฉพาะร้าน coffee · --page shifts หรือ wo p1.9*): ใช้รหัสเครื่องแยก `posqc-vis-shdev-<pid>` (ไม่ชนกะของหน้าขาย)
//   shifts-noshift (การ์ดยังไม่เปิดกะ + กล่องเปิดกะ 13A เปิดค้าง ไม่กดยืนยัน) · shifts-current (เปิดกะผ่านกล่อง เงินตั้งต้น ฿2,000 แยกแบงก์
//   1000×1 · 500×1 · 100×4 · 20×5 → ขายเงินสด 1 บิลผ่านหน้าขายของเครื่องเดียวกัน (อเมริกาโน่×2 + ลาเต้ แบบ sale-done) → นำเงินเข้า ฿100 "แลกแบงก์" ผ่านกล่อง)
//   shifts-close (กรอกแบงก์/เหรียญ = ยอดคาด − ฿15 + เหตุผล · ไม่กดปิด) · shifts-z (กดปิดกะ → แผง Z + รายการกะที่ปิดแล้ว · ขนาดถัดไปเปิด Z จากแถวในรายการ)
//   🔴 เขียน: กะ 1 กะ + บิลขาย PAID เงินสด 1 ใบ + เงินเข้า 1 รายการ (ของรอบนี้ · ร้าน QC) · finally/signal ปิดกะนี้ถ้ายังเปิด (นับ = ยอดคาด)
//   แคชเชียร์ QC ไม่มี pos.shift.operate ⇒ ทุกสถานะ = การ์ดปฏิเสธ pos-shift-refusal (หน้า 200) · ไม่เขียนอะไร ◂
//
// POS P1.16 ▸ หน้า sales ("บิลวันนี้" ภาพ 12) + `--states` (เฉพาะร้าน coffee · --page sales หรือ wo p1.16*): เครื่องแยก `posqc-vis-bills-<pid>`
//   bills-list (วันนี้ ≥ 6 บิลหลายสถานะ) · bills-drawer (เลือกแถว → ลิ้นชัก) · bills-void (กล่องยกเลิก + พิมพ์เหตุผล · ไม่กดยืนยัน) ·
//   bills-refund (หน้าต่างคืนเงิน · เลือก 1 บรรทัด · เงินสด · ไม่กดยืนยัน) · bills-empty (?date= วันที่ไม่มีบิล) — 3 ขนาด
//   ข้อมูล: 7 บิลของวันนี้ผ่านบริการ (submitRegisterSale ในกะของเครื่องภาพบิล · ปกติ 2 · คืนบางส่วน 1 (refundSale) · คืนครบ 1 (refundSale) ·
//   ยกเลิก 1 (voidSaleByActor = ตัวทำงานของ voidSaleAction) · เงินสดนอกกะ 1 (createSale shiftId null) · จ่ายผสม 1) — ชื่อบรรทัดลงท้าย "(ภาพบิล QC)"
//   🔴 เขียน: กะ 1 กะ + 7 บิล + ใบคืน 2 ใบ (ร้าน QC) · รอบแคชเชียร์ใช้ชุดของวันนี้ซ้ำถ้ามีครบ (ไม่เขียนเพิ่ม) ·
//   finally/signal ปิดกะของเครื่องภาพบิลถ้ายังเปิด (นับ = ยอดคาด) · แคชเชียร์ไม่มี pos.sale.void/refund ⇒ bills-void/bills-refund = ลิ้นชักที่ปุ่มปิด/ซ่อน ◂
//
// POS P1.11U ▸ หน้า receipt-public (ใบเสร็จออนไลน์สาธารณะ `/r/<token>` · ภาพ 11C · เฉพาะร้าน coffee · 390×844 เท่านั้น · ไม่ต้องล็อกอิน):
//   ไม่ส่ง --states = rpub-paid ภาพเดียว · --states = rpub-paid · rpub-refunded-partial · rpub-voided · rpub-taxinvoice-form (เปิดแผ่น + กรอก ไม่กดส่ง) ·
//   rpub-issue-sent (กรอก + กดส่ง → "ส่งแล้ว…") · rpub-not-found (โทเคนรูปถูกแต่ไม่มีจริง → HTTP 404)
//   ข้อมูล (F3 · ชุดเดียวต่อวัน): หาบิลชุดวันนี้ก่อนด้วยคีย์กันซ้ำ `posqc-p111u-<YYYYMMDD ไทย>-<paid|partial|voided>-*` + วันที่ (แบบ existingBillsSet ของ P1.16)
//   ครบ = ใช้ซ้ำ ไม่เขียนบิล/กะเพิ่ม · ขาดชนิดไหน = เปิดกะเครื่องคงที่ `posqc-p111u-dev` แล้วขายเฉพาะชนิดนั้นผ่านบริการหน้าขาย (submitRegisterSale ลาเต้×2 ·
//   อเมริกาโน่ · ครัวซองต์ − ส่วนลดท้ายบิล ฿10 · เงินสด ฿100 + PromptPay ส่วนที่เหลือ) → คืนบางส่วน (refundSale) · ยกเลิก (voidSaleByActor) · โทเคนอ่านด้วย prisma
//   🔴 finally/signal: ลบ PosReceiptIssue/PosTaxInvoiceRequest ของบิลชุดนี้ (+ OutboxEvent ของมัน) · เก็บการ์ดบอร์ดงานที่ consumer เปิดเข้าคลัง (archiveCard) ·
//   ปิดกะที่รอบนี้ใช้ขาย (นับ = ยอดคาด) · บิลขาย/ใบคืนคงอยู่ (ข้อมูลเงิน ห้ามลบ — แต่ไม่งอกเพราะใช้ชุดของวันซ้ำ)
//   รอบ 2: บิล paid ผูกสมาชิก QC (แต้ม + ปุ่มให้คะแนน) · เปิด posAbbreviated ของสมุดที่ผูก POS ชั่วคราว (saveDocSettings · คืนค่าใน finally/signal) ·
//   rpub-not-found ไม่นับ console "status of 404" ของหน้านั้น 1 บรรทัด (HTTP 404 ยังตรวจ)
//   รอบ 3: ตัวตัดสินใบกำกับอย่างย่อจริงคือ taxId ของสมุด (สมุด QC ไม่มีแถว AccountSettings) ⇒ ตั้ง taxId ชั่วคราวผ่าน account saveSettings + ยืนยัน
//   vatConfigOf/taxId ก่อนขาย · บิล paid ใช้ซ้ำเฉพาะที่มี abbNo + AVAILABLE · finally คืน/ลบแถวที่สร้าง · ค้นชุดวันนี้ด้วยคีย์ "reg2:" ด้วย ·
//   เตือนตัวนับเลขใบเสร็จถอยหลัง (COUNTER_LAG) ก่อนขาย ◂
// POS P1.10 U ▸ หน้า settings (ภาพ 17A/17B) + `--states` (เฉพาะร้าน coffee · --page settings หรือ wo p1.10u*):
//   settings-receipt (17A + ตัวอย่างสด · แคชเชียร์ = อ่านอย่างเดียว) · settings-devices (17B · 2 เครื่อง QC `posqc-vis-dev-<pid>-{1,2}` ลงทะเบียนด้วย
//   registerDevice ของบริการ · เครื่อง 1 มี printerConfig USB 80 มม. + ลิ้นชัก + พิมพ์อัตโนมัติ) · settings-device-revoke (กล่องยืนยันเพิกถอนเปิด · ไม่กดยืนยัน) ·
//   settings-print-pair (กล่องเลือกเครื่องพิมพ์ของเครื่อง 1 — ซ่อน navigator.usb ก่อนโหลดหน้า ⇒ สถานะ "เบราว์เซอร์นี้ไม่รองรับ") — 3 ขนาด ·
//   paydone-print (1440 เท่านั้น · หน้าขายบนเครื่อง 2 = พิมพ์ผ่านเบราว์เซอร์ · ขายเงินสด 1 บิล → จอสำเร็จพร้อมปุ่มพิมพ์ใบเสร็จ/สำเนา · ไม่กดพิมพ์)
//   🔴 เขียน: เครื่อง 2 เครื่อง + กะ 1 กะของเครื่อง 2 (openShift ของบริการ) + บิลขายเงินสด 1 ใบ · finally/signal ปิดกะนี้ (นับ = ยอดคาด) +
//   เพิกถอนเครื่อง QC ของรอบนี้ (ซากของรอบที่ถูก kill เกิน 1 ชม. ถูกเพิกถอนตอนเริ่ม) · แคชเชียร์ QC ไม่มี pos.device.manage ⇒ แท็บเครื่อง = การ์ดปฏิเสธ ◂
//
// POS P1.7U ▸ ใบขอรับเงิน (มติ 8): หน้า register `--states` เพิ่ม paydlg-promptpay-qr (cart3 → ชำระ → พร้อมเพย์ = ใบ PROMPTPAY_STATIC + QR ล็อกยอด) ·
//   paydlg-promptpay-paid (desktop/mobile · กด "ยืนยันเองเมื่อเห็นเงินเข้า" ผ่าน confirmPaymentIntentManualAction → ✓ เงินเข้าแล้ว · หลังถ่ายกดยืนยันรับเงิน
//   = บิลขายจริง 1 ใบที่ใช้ใบนั้น (CONSUMED)) · paydlg-card-edc (Beam ปิด ⇒ ช่องบัตร "EDC · ใส่เลขอ้างอิง" + ช่องเลขอ้างอิงแบบ P1.6) ·
//   หน้า settings `--states` เพิ่ม settings-payments (17A "วิธีรับเงิน" · แคชเชียร์ = อ่านอย่างเดียว)
//   ร้าน coffee ไม่มี PaymentProfile.promptpayId ที่ใช้ได้ ⇒ ตั้งด้วย savePaymentProfile (ตัวแก้เดิมของร้าน) แล้วคืนค่าเดิมใน finally/signal
//   🔴 finally/signal: ใบที่รอบนี้สร้าง (เครื่องของรอบนี้ · หลังเริ่มรอบ) ที่ยัง PENDING = cancelPaymentIntent ของบริการ (ตัวทำงานของ cancelPaymentIntentAction) ·
//      ห้ามลบใบด้วย SQL (แถวเงิน) · ใบ PAID ที่ไม่ได้ใช้ = บันทึกใน summary (intentState) ◂
//
// 🔴 ไม่มีค่าปริยายของ base — ไม่ส่ง `--base`/`QC_BASE` = exit 2 · ต่อไม่ได้ = exit 2 · `:3215` = exit 2
//    (พอร์ต 3215 เป็นของเซิร์ฟเวอร์ CRM RUN — LANE-RULES ข้อ 4 · ตั้ง POS_VISUAL_ALLOW_3215=1 เมื่อ CRM ปิดแล้วเท่านั้น)
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้องมีเซิร์ฟเวอร์ + chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ: ปักธง userAgent `qc-visual-pos` · ลบ "เฉพาะ id ของรอบนี้" ใน finally + กวาดซากที่หมดอายุแล้ว
//    (ห้าม process.exit() ระหว่าง mint→finally — exit ข้าม finally = token ค้างในฐาน QC)
// 🔴 โปรไฟล์ chromium (`/tmp/chr-pos-<pid>` + สำเนาใน snap-private-tmp) ลบทุกครั้ง ทั้งจบปกติ/ตาย/ถูก Ctrl-C
//    (snap chromium ทิ้งโปรไฟล์ ~GB ต่อรอบ — เคยทำดิสก์ VPS 99%) · ลบเฉพาะของ pid นี้ ห้ามกวาด /tmp

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { PQC, POS_PAGES, POS_VIEWPORTS, type PosPage } from "./pos-qc-env.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. อาร์กิวเมนต์ ═══════════════════
const argv = process.argv.slice(2);
const flag = (name: string): string | null => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? null) : null);
const DRY = argv.includes("--dry");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
const USERS = ["owner", "cashier"] as const;
type UserKey = (typeof USERS)[number];
const userKey = (flag("--user") ?? "owner") as UserKey;
const tenantKey = (flag("--tenant") ?? "coffee") as "coffee" | "resto";
const onlyPage = flag("--page");

function die(msg: string): never {
  console.error(`❌ ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots: [], failures: 0, fatal: msg })}`);
  process.exit(2);
}
if (!WO) die("ต้องระบุ <wo|all> เป็นอาร์กิวเมนต์แรก เช่น `visual-pos.mts p1.3 --user owner --base http://127.0.0.1:3300`");
// wo กลายเป็นชื่อโฟลเดอร์ใต้ .qc-shots/pos — รับเฉพาะตัวอักษรปลอดภัย ห้าม `..` (กันเขียนไฟล์ออกนอกโฟลเดอร์)
if (!/^[A-Za-z0-9._-]+$/.test(WO) || WO.includes("..")) die(`<wo> "${WO}" ไม่ถูกต้อง — ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - และห้ามมี ".."`);
if (!(USERS as readonly string[]).includes(userKey)) die(`--user ${userKey} ไม่รู้จัก — ใช้ได้: ${USERS.join(" · ")}`);
if (tenantKey !== "coffee" && tenantKey !== "resto") die(`--tenant ${tenantKey} ไม่รู้จัก — ใช้ได้: coffee · resto`);
if (onlyPage && !(POS_PAGES as readonly string[]).includes(onlyPage)) die(`--page ${onlyPage} ไม่รู้จัก — ใช้ได้: ${POS_PAGES.join(" · ")}`);

const T = PQC[tenantKey];
const U = T.users[userKey];
// สาขาที่ผู้ใช้เข้าได้ (แคชเชียร์ = สาขาเดียว) — ใส่ ?unit= ให้หน้าขายเปิดสาขาที่ถูก
const unitKey = U.units[0] === "*" ? Object.keys(T.units)[0]! : U.units[0]!;
const unitId = (T.units as Record<string, { id: string }>)[unitKey]!.id;
const SYS = T.systems.POS.id;
const pages: PosPage[] = onlyPage ? [onlyPage as PosPage] : [...POS_PAGES];
/**
 * สิ่งที่คาดต่อหน้า ต่อบทบาท (HTTP) — owner ต้องได้ 200 · cashier = "record" (บันทึกอย่างเดียว ไม่ตัดสิน)
 * จนกว่าผู้คุมงานรันจริงครั้งแรกแล้วกำหนด 200|404 ตามพฤติกรรมจริง (มติรอบ 2 · ใบ P1.15/P4.2 เป็นเจ้าของตาราง)
 */
const PAGE_EXPECT: Record<PosPage, Record<UserKey, number | "record">> = {
  register: { owner: 200, cashier: "record" },
  sales: { owner: 200, cashier: "record" },
  products: { owner: 200, cashier: "record" },
  close: { owner: 200, cashier: "record" },
  // POS P1.17 U ▸ แคชเชียร์ QC ไม่มี pos.report.view ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-report-refusal) · ไม่ 404/500 ◂
  reports: { owner: 200, cashier: 200 },
  // POS P1.14 U ▸ แคชเชียร์ QC ไม่มี pos.stock.count / สิทธิ์คลัง ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-stock-refusal) ◂
  stock: { owner: 200, cashier: 200 },
  // POS P1.9 U ▸ แคชเชียร์ QC ไม่มี pos.shift.operate/manage ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-shift-refusal) ◂
  shifts: { owner: 200, cashier: 200 },
  // POS P1.11U ▸ หน้าสาธารณะ (ไม่อ่าน session) ⇒ 200 ทุกบทบาท · rpub-not-found = 404 (ต่อสถานะ ดู RPUB_STATE_PLAN) ◂
  "receipt-public": { owner: 200, cashier: 200 },
  // POS P1.10 U ▸ แคชเชียร์ QC มี pos.sale.create ⇒ แท็บใบเสร็จอ่านอย่างเดียว · แท็บเครื่อง = การ์ดปฏิเสธ (หน้า 200) ◂
  settings: { owner: 200, cashier: 200 },
};
// POS P1.17 U ▸ wo ขึ้นต้น p1.17: REPORT_QUERY (env) ต่อท้ายหน้า reports เช่น "kind=daily&from=2026-10-01&to=2026-10-07" (ภาพจาก URL เดียวกันได้มุมมองเดียวกัน) ◂
const REPORT_QUERY = /^p1\.17/i.test(WO) && /^[A-Za-z0-9=&_.-]+$/.test(process.env.REPORT_QUERY ?? "") ? `?${process.env.REPORT_QUERY}` : "";
const pathOf = (p: PosPage) => `/app/sys/${SYS}/pos/${p}${p === "register" || p === "stock" || p === "shifts" || p === "settings" ? `?unit=${unitId}` : p === "reports" ? REPORT_QUERY : ""}`;
const OUT = `${PQC.shotsDir}/${WO}`;
const fileOf = (p: PosPage, w: number, h: number) => `${OUT}/${p}-${userKey}-${w}x${h}.png`;

// ── POS P1.3 ▸ แผนสถานะของหน้าขายใหม่ ──
const STATES_ON = /^p1\.3/i.test(WO) || argv.includes("--states");
const LOCALE_EN = process.env.LOCALE === "en";
type Device = (typeof POS_VIEWPORTS)[number]["name"];
type StateKey = "default" | "cart3" | "cart4-01" | "line-editor" | "bill-discount" | "custom-item" | "paydlg-cash" | "paydlg-promptpay-qr" | "paydlg-promptpay-paid" | "paydlg-card-edc" | "sale-done" | "search-empty" | "stock-warn" | "offline" | "mobile-sheet" | "options-popover" | "weigh" | P115StateKey | StockStateKey | ShiftsStateKey | BillsStateKey | SettingsStateKey | RpubStateKey;
const STATE_PLAN: { key: StateKey; devices: readonly Device[]; note: string }[] = [
  { key: "default", devices: ["desktop", "ipad", "mobile"], note: "เปิดหน้า (ตะกร้าว่าง) — การ์ดเหลือน้อย/หมด/ปิดขายของ fixture อยู่ในกริด" },
  { key: "cart3", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่×2 · ลาเต้ (ลด ฿10) · ครัวซองต์ (สต็อก N → N−1)" },
  // B2.5 (สเปก §7 · ตัวเทียบภาพ 01): ตะกร้า 4 บรรทัดเท่าภาพ — ลาเต้ ×2 ฿100 · อเมริกาโน่ ฿70 · ครัวซองต์อัลมอนด์ ฿95 −฿10 · เมล็ดกาแฟ 250 g ฿320 (สต็อก 11)
  //   🔴 ไม่มีคูปอง WELCOME50 — คูปองเลื่อนไป P1.12 (มติ Q12) · บรรทัด VAT ขึ้นกับสมุดบัญชีของร้าน QC (ไม่ตั้งในสคริปต์นี้)
  { key: "cart4-01", devices: ["desktop", "ipad", "mobile"], note: "ตะกร้า 4 บรรทัดเท่าภาพ 01 (สินค้าชั่วคราว 4 ตัว · ไม่มีคูปอง = P1.12)" },
  { key: "line-editor", devices: ["desktop", "ipad", "mobile"], note: "cart3 + เปิดตัวแก้บรรทัดแรก" },
  { key: "bill-discount", devices: ["desktop", "ipad", "mobile"], note: "cart3 + กล่องส่วนลดท้ายบิล" },
  { key: "custom-item", devices: ["desktop", "ipad", "mobile"], note: "owner = กล่องรายการกำหนดเอง · cashier = ข้อความเหตุผล (ไม่มีสิทธิ์ตั้งราคา)" },
  { key: "paydlg-cash", devices: ["desktop", "ipad", "mobile"], note: "cart3 + กล่องชำระ เงินสด รับพอดี" },
  // POS P1.7U ▸ ภาพ 02 แผงขวา: ใบขอรับเงิน (QR ล็อกยอด · ยืนยันเอง · บัตรแบบ EDC เมื่อ Beam ปิด) ◂
  { key: "paydlg-promptpay-qr", devices: ["desktop", "ipad", "mobile"], note: "cart3 + ชำระ → พร้อมเพย์ = ใบ PROMPTPAY_STATIC (QR ล็อกยอด · นับถอยหลัง · ปุ่มยืนยันเอง)" },
  { key: "paydlg-promptpay-paid", devices: ["desktop", "mobile"], note: "⚠️ ใบ STATIC → ยืนยันเอง → ✓ เงินเข้าแล้ว (หลังถ่ายกดยืนยันรับเงิน = บิลขายจริง 1 ใบ ใช้ใบนั้น)" },
  { key: "paydlg-card-edc", devices: ["desktop", "ipad", "mobile"], note: "cart3 + ชำระ → บัตร (Beam ปิด) = EDC · ใส่เลขอ้างอิง" },
  { key: "sale-done", devices: ["desktop"], note: "⚠️ ขายจริง 1 บิล (อเมริกาโน่×2 + ลาเต้ · เงินสด) → ขายสำเร็จ" },
  { key: "search-empty", devices: ["desktop", "ipad", "mobile"], note: "ค้นคำที่ไม่มี → กล่องไม่พบ" },
  { key: "stock-warn", devices: ["desktop", "ipad", "mobile"], note: "สินค้าเหลือ 2 ×3 → กล่องเตือนสต็อกในบรรทัด (19ฉ)" },
  // B2.5 (ภาพ 19ง): ออฟไลน์ = puppeteer setOfflineMode → แถบดำ + ปุ่มชำระปิด
  //   ข้าม "แคตตาล็อกว่าง" (19): ต้องมีสาขา POS ที่ไม่มีสินค้า/หมวดเลย — ร้าน QC มีแคตตาล็อกเต็ม สร้างสาขาชั่วคราว (BusinessUnit + ผูก POS) เกินขอบเขตสคริปต์ภาพ
  { key: "offline", devices: ["desktop", "ipad", "mobile"], note: "cart3 แล้วตัดเน็ต (setOfflineMode) → แถบออฟไลน์ + ชำระปิด" },
  { key: "mobile-sheet", devices: ["mobile"], note: "cart3 + แผ่นตะกร้าเปิด" },
  // P1.2 U R2 (ภาพ 01 ป๊อปโอเวอร์): สินค้าชั่วคราวมีตัวแปร + 4 กลุ่ม → เลือกตัวแปร · M +10 · นมโอ๊ต +15 · จำนวน 2
  { key: "options-popover", devices: ["desktop", "ipad", "mobile"], note: "ตัวเลือก/ตัวแปร: ป๊อปโอเวอร์ยึดการ์ด (390 = แผ่นล่าง) · เลือก 2 กลุ่ม + จำนวน 2" },
  { key: "weigh", devices: ["desktop", "mobile"], note: "สินค้าชั่ง ฿350/กก. → กล่องน้ำหนัก (owner พิมพ์ 250 กรัม · cashier = ต้องมีสิทธิ์)" },
  // POS P1.15U ▸ ภาพ 13B / 21B + แผ่นส่วนลดเกินสิทธิ์ (ข้อมูล: seedP115Once · ลบ/คืนค่าใน finally) ◂
  { key: "lock-screen", devices: ["desktop", "ipad", "mobile"], note: "13B: กดล็อก → จอล็อก (ผู้ใช้รอบนี้ · ล็อกเมื่อ HH:MM) + จุด 3 ดวง · ขวา: พนักงาน 2 คน + บิลที่พัก 1 ใบ" },
  { key: "lock-pin-locked", devices: ["desktop"], note: "แถว PIN ของผู้ใช้รอบนี้ถูกล็อก → ใส่ PIN ถูก → \"ล็อกชั่วคราว 15 นาที\" + ปุ่มผู้จัดการปลดล็อก" },
  { key: "staff-switch", devices: ["desktop", "ipad", "mobile"], note: "จอล็อก → แตะการ์ดอีกคน → แป้น PIN ของคนนั้น (ยังไม่ใส่ครบ)" },
  { key: "discount-over-sheet", devices: ["desktop", "ipad", "mobile"], note: "โทเคนแคชเชียร์ · cart3 + ส่วนลดท้ายบิล 20% (> เพดาน 10%) → แผ่นส่วนลดเกินสิทธิ์" },
  { key: "approval-wait", devices: ["desktop", "ipad", "mobile"], note: "⚠️ ขายจริง 1 บิล → คำขอ POS_VOID PENDING (เขียนตรง · ลบใน finally) → บิลวันนี้ → \"ยกเลิกบิล — รออนุมัติ…\" → 21B (แคชเชียร์ = ปุ่มรออนุมัติ)" },
];
type P115StateKey = "lock-screen" | "lock-pin-locked" | "staff-switch" | "discount-over-sheet" | "approval-wait";
const P115_STATE_KEYS: ReadonlySet<string> = new Set<string>(["lock-screen", "lock-pin-locked", "staff-switch", "discount-over-sheet", "approval-wait"]);
// POS P1.14 U ▸ สถานะของหน้าสต็อก (ลำดับสำคัญ: default ก่อนเปิดรอบ · count-open รอบแรกเปิด+บันทึก · ที่เหลือใช้รอบเดิม) ◂
type StockStateKey = "stock-default" | "stock-count-open" | "stock-count-confirm" | "stock-receive" | "stock-adjust";
const STOCK_STATE_PLAN: { key: StockStateKey; tab: string | null; devices: readonly Device[]; note: string }[] = [
  { key: "stock-default", tab: null, devices: ["desktop", "ipad", "mobile"], note: "เปิดหน้า (ไม่ส่ง tab) — มือถือ = ตรวจนับ · md+ = รับของเข้า (ภาพ 16)" },
  { key: "stock-count-open", tab: "count", devices: ["desktop", "ipad", "mobile"], note: "ภาพ 05ค: รอบ ALL ที่ที่เก็บหลัก (เปิดผ่าน UI ครั้งแรก) + SET 3 รายการแรก + สแกนรายการที่สอง 2 ครั้งติดกัน (ต้องได้ 2 — F1)" },
  { key: "stock-count-confirm", tab: "count", devices: ["desktop", "ipad", "mobile"], note: "กล่องยืนยันผลต่าง (ไม่กดยืนยัน)" },
  { key: "stock-receive", tab: "receive", devices: ["desktop", "ipad", "mobile"], note: "การ์ดรับของเข้า + คิว 2 แถว (ไม่กดรับเข้าคลัง)" },
  { key: "stock-adjust", tab: "adjust", devices: ["desktop", "ipad", "mobile"], note: "การ์ดปรับสต็อก: เลือกสินค้า + −2 (ไม่กดบันทึก)" },
];
// POS P1.9 U ▸ สถานะของหน้ากะ (ลำดับสำคัญ: noshift ก่อนเปิดกะ · current เปิดกะ+ขาย+เงินเข้า ครั้งแรก · close กรอกนับ · z ปิดกะครั้งแรก) ◂
type ShiftsStateKey = "shifts-noshift" | "shifts-current" | "shifts-close" | "shifts-z";
const SHIFTS_STATE_PLAN: { key: ShiftsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "shifts-noshift", devices: ["desktop", "ipad", "mobile"], note: "ยังไม่เปิดกะบนเครื่องนี้ + กล่องเปิดกะ 13A (ไม่กดยืนยัน)" },
  { key: "shifts-current", devices: ["desktop", "ipad", "mobile"], note: "กะเปิด (฿2,000 แยกแบงก์) + ขายเงินสด 1 บิล + นำเงินเข้า ฿100 แลกแบงก์ → X" },
  { key: "shifts-close", devices: ["desktop", "ipad", "mobile"], note: "การ์ดปิดกะ: แบงก์/เหรียญ = ยอดคาด − ฿15 + เหตุผล (ไม่กดปิด)" },
  { key: "shifts-z", devices: ["desktop", "ipad", "mobile"], note: "ปิดกะ → แผง Z + กะที่ปิดแล้ว (ขนาดถัดไป = เปิด Z จากแถวในรายการ)" },
];
// POS P1.16 ▸ สถานะของหน้าบิลวันนี้ (ข้อมูลสร้างครั้งเดียวก่อนเปิด chromium · ทุกสถานะอ่านอย่างเดียว ไม่กดยืนยัน) ◂
type BillsStateKey = "bills-list" | "bills-drawer" | "bills-void" | "bills-refund" | "bills-empty";
const BILLS_STATE_PLAN: { key: BillsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "bills-list", devices: ["desktop", "ipad", "mobile"], note: "วันนี้ ≥ 6 บิล: ยกเลิก 1 · คืนบางส่วน 1 · คืนครบ 1 · เงินสดนอกกะ 1 · ปกติ/จ่ายผสม" },
  { key: "bills-drawer", devices: ["desktop", "ipad", "mobile"], note: "เลือกบิลปกติ → ลิ้นชักบิล (390 = แผ่นเต็มจอ)" },
  { key: "bills-void", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ = กล่องยกเลิกบิล + พิมพ์เหตุผล (ไม่กดยืนยัน) · แคชเชียร์ = ปุ่มยกเลิกปิด + คำอธิบาย" },
  { key: "bills-refund", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ = หน้าต่างคืนเงิน เลือก 1 บรรทัด + เงินสด (ไม่กดยืนยัน) · แคชเชียร์ = ไม่มีปุ่มคืนเงิน" },
  { key: "bills-empty", devices: ["desktop", "ipad", "mobile"], note: "?date= วันที่ไม่มีบิล → ข้อความว่าง" },
];
// POS P1.10 U ▸ สถานะของหน้าตั้งค่า (เครื่อง QC 2 เครื่องลงทะเบียนครั้งเดียวก่อนเปิด chromium · ไม่กดยืนยันเพิกถอน/ไม่กดพิมพ์) ◂
type SettingsStateKey = "settings-receipt" | "settings-payments" | "settings-devices" | "settings-device-revoke" | "settings-print-pair" | "paydone-print";
const SETTINGS_STATE_PLAN: { key: SettingsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "settings-receipt", devices: ["desktop", "ipad", "mobile"], note: "17A ใบเสร็จและภาษี + ตัวอย่างสด (แคชเชียร์ = ช่องปิด · อ่านอย่างเดียว)" },
  { key: "settings-payments", devices: ["desktop", "ipad", "mobile"], note: "P1.7U 17A วิธีรับเงิน: พร้อมเพย์ (อ่านอย่างเดียว) · อายุ QR · Beam + ชิปคีย์ · ยืนยันเอง (แคชเชียร์ = อ่านอย่างเดียว)" },
  { key: "settings-devices", devices: ["desktop", "ipad", "mobile"], note: "17B เครื่องและเครื่องพิมพ์ · 2 เครื่อง QC (เครื่อง 1 = USB 80 มม. + ลิ้นชัก) · แคชเชียร์ = การ์ดปฏิเสธ" },
  { key: "settings-device-revoke", devices: ["desktop", "ipad", "mobile"], note: "เลือกเครื่อง 2 → กล่องยืนยันเพิกถอน (ไม่กดยืนยัน)" },
  { key: "settings-print-pair", devices: ["desktop", "ipad", "mobile"], note: "เครื่อง 1 (เบราว์เซอร์นี้) → กล่องเลือกเครื่องพิมพ์ = \"เบราว์เซอร์นี้ไม่รองรับ\" (ซ่อน navigator.usb)" },
  { key: "paydone-print", devices: ["desktop"], note: "⚠️ ขายจริง 1 บิลบนเครื่อง 2 (พิมพ์ผ่านเบราว์เซอร์) → จอสำเร็จ + ปุ่มพิมพ์ใบเสร็จ/สำเนา" },
];
const SETTINGS_STATE_KEYS: ReadonlySet<string> = new Set(SETTINGS_STATE_PLAN.map((s) => s.key));
const isSettingsState = (k: StateKey): k is SettingsStateKey => SETTINGS_STATE_KEYS.has(k);
/** เครื่อง QC ของหน้าตั้งค่า (brief §6) — 1 = มี printerConfig (ภาพจับคู่) · 2 = เบราว์เซอร์ (กะ + บิลของ paydone-print) */
const SETTINGS_DEVICE_CODES = [`posqc-vis-dev-${process.pid}-1`, `posqc-vis-dev-${process.pid}-2`] as const;
const BILLS_STATE_KEYS: ReadonlySet<string> = new Set(BILLS_STATE_PLAN.map((s) => s.key));
const isBillsState = (k: StateKey): k is BillsStateKey => BILLS_STATE_KEYS.has(k);
/** รหัสเครื่องคงที่ของรอบนี้ — ทุกแท็บ (ทั้ง context ของผู้ใช้และของเจ้าของ) ใช้ค่าเดียวกัน = เครื่องเดียวกัน (P1.15U: ลงทะเบียน + โทเคนผู้ขาย) */
const DEVICE_ID = `posqc-vis-dev-${process.pid}`;
/** รหัสเครื่องของสถานะหน้าบิล (กะของบิลชุดภาพ · ปิดใน finally) */
const BILLS_DEVICE_ID = `posqc-vis-bills-${process.pid}`;
/** วันที่ไม่มีบิลของสถานะ bills-empty (ก่อนร้าน QC มีข้อมูล) */
const BILLS_EMPTY_DATE = "2024-01-02";
/** รหัสเครื่องของสถานะหน้ากะ — แยกจาก DEVICE_ID ของหน้าขาย (กะของหน้าขายเปิดค้างทั้งรอบ) */
const SHIFTS_DEVICE_ID = `posqc-vis-shdev-${process.pid}`;
const STOCK_STATE_KEYS: ReadonlySet<string> = new Set(STOCK_STATE_PLAN.map((s) => s.key));
const SHIFTS_STATE_KEYS: ReadonlySet<string> = new Set(SHIFTS_STATE_PLAN.map((s) => s.key));
const isStockState = (k: StateKey): k is StockStateKey => STOCK_STATE_KEYS.has(k);
const isShiftsState = (k: StateKey): k is ShiftsStateKey => SHIFTS_STATE_KEYS.has(k);
// POS P1.11U ▸ สถานะของหน้าใบเสร็จออนไลน์ (390 เท่านั้น · ลำดับสำคัญ: issue-sent เขียนแถวแจ้งปัญหา ⇒ ถ่ายหลังภาพบิลปกติ) ◂
type RpubStateKey = "rpub-paid" | "rpub-refunded-partial" | "rpub-voided" | "rpub-taxinvoice-form" | "rpub-issue-sent" | "rpub-not-found";
const RPUB_STATE_PLAN: { key: RpubStateKey; bill: "paid" | "partial" | "voided" | "none"; expect: number; note: string }[] = [
  { key: "rpub-paid", bill: "paid", expect: 200, note: "บิลชำระแล้ว: ชิป \"ชำระแล้ว\" · รายการ · ส่วนลด + คูปอง · VAT · ยอดสุทธิ · วิธีจ่าย · 4 ปุ่ม (ภาพ 11C)" },
  { key: "rpub-refunded-partial", bill: "partial", expect: 200, note: "คืนบางส่วน (refundSale 1 ชิ้น): ชิป \"คืนเงินบางส่วน ฿x\" + แถวคืนเงิน" },
  { key: "rpub-voided", bill: "voided", expect: 200, note: "ยกเลิกแล้ว (voidSaleByActor): ชิปแดง \"ยกเลิกแล้ว\" · ไม่มีปุ่มขอใบกำกับ" },
  { key: "rpub-taxinvoice-form", bill: "paid", expect: 200, note: "แผ่นขอใบกำกับภาษีเต็มรูป + กรอกครบ (ไม่กดส่ง)" },
  { key: "rpub-issue-sent", bill: "paid", expect: 200, note: "⚠️ แจ้งปัญหาจริง 1 แถว → \"ส่งแล้ว เจ้าหน้าที่จะติดต่อกลับ\" (ลบใน finally)" },
  { key: "rpub-not-found", bill: "none", expect: 404, note: "โทเคนรูปถูก (12 ตัว) แต่ไม่มีบิล → \"ไม่พบใบเสร็จ\" HTTP 404" },
];
const RPUB_STATE_KEYS: ReadonlySet<string> = new Set(RPUB_STATE_PLAN.map((s) => s.key));
const isRpubState = (k: StateKey): k is RpubStateKey => RPUB_STATE_KEYS.has(k);
/** โทเคนที่รูปถูกแต่ไม่มีจริง (Crockford ไม่มี I L O U · ตรวจกับ DB ก่อนใช้) */
const RPUB_MISSING_TOKEN = "ZZZZZZZZZZZZ";
/** F3: เครื่องคงที่ (ไม่ผูก pid) — รอบซ้ำไม่สร้างเครื่อง/กะเพิ่ม · กะเปิดเฉพาะเมื่อต้องขายบิลใหม่ */
const RPUB_DEVICE_ID = "posqc-p111u-dev";
type Job = { page: PosPage; v: (typeof POS_VIEWPORTS)[number]; state: StateKey | null; file: string; path?: string; expect?: number };
const viewports = LOCALE_EN ? POS_VIEWPORTS.filter((v) => v.name === "desktop") : [...POS_VIEWPORTS];
// สถานะหน้าสต็อกเฉพาะ --page stock หรือ wo p1.14* (รอบ p1.3/p1.2 --states ทุกหน้าเดิมไม่เปลี่ยน · ไม่เปิดรอบนับเพิ่ม)
const stockStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "stock" || /^p1\.14/i.test(WO));
// สถานะหน้ากะเฉพาะ --page shifts หรือ wo p1.9* (รอบ --states ทุกหน้าเดิมไม่เปิดกะ/ไม่ขายเพิ่ม)
const shiftsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "shifts" || /^p1\.9/i.test(WO));
// สถานะหน้าบิลวันนี้เฉพาะ --page sales หรือ wo p1.16* (รอบ --states ทุกหน้าเดิมไม่สร้างบิลเพิ่ม)
const billsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "sales" || /^p1\.16/i.test(WO));
// สถานะหน้าตั้งค่าเฉพาะ --page settings หรือ wo p1.10u* (รอบ --states ทุกหน้าเดิมไม่ลงทะเบียนเครื่อง/ไม่ขายเพิ่ม)
const settingsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "settings" || /^p1\.10u/i.test(WO));
const settingsPath = (st: SettingsStateKey) =>
  st === "paydone-print"
    ? `/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(unitId)}`
    : `/app/sys/${SYS}/pos/settings?tab=${st === "settings-receipt" ? "receipt" : st === "settings-payments" ? "payments" : "devices"}&unit=${encodeURIComponent(unitId)}`;
const billsPath = (st: BillsStateKey) => `/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}${st === "bills-empty" ? `&date=${BILLS_EMPTY_DATE}` : ""}`;
// POS P1.11U ▸ หน้าใบเสร็จออนไลน์: ร้าน coffee เท่านั้น (ร้านอื่น = ข้ามหน้า) · 390×844 เสมอ (LOCALE=en ⇒ ?lang=en) · path จริงรู้หลังสร้างบิล (rpubPath) ◂
const RPUB_VIEWPORT = POS_VIEWPORTS.find((v) => v.name === "mobile")!;
const rpubOn = tenantKey === "coffee" && pages.includes("receipt-public");
const rpubPlan = RPUB_STATE_PLAN.filter((st) => STATES_ON || st.key === "rpub-paid");
const jobs: Job[] = pages.flatMap((p: PosPage): Job[] =>
  p === "receipt-public"
    ? rpubOn
      ? rpubPlan.map((st): Job => ({ page: p, v: RPUB_VIEWPORT, state: st.key, expect: st.expect, path: `/r/${st.bill === "none" ? RPUB_MISSING_TOKEN : `<token:${st.bill}>`}${LOCALE_EN ? "?lang=en" : ""}`, file: `${OUT}/${p}-${st.key.replace(/^rpub-/, "")}-${userKey}-${RPUB_VIEWPORT.w}x${RPUB_VIEWPORT.h}${LOCALE_EN ? "-en" : ""}.png` }))
      : []
    : settingsStatesOn && p === "settings"
    ? SETTINGS_STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: settingsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^settings-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : billsStatesOn && p === "sales"
    ? BILLS_STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: billsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^bills-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : shiftsStatesOn && p === "shifts"
    ? SHIFTS_STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, file: `${OUT}/${p}-${st.key.replace(/^shifts-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : stockStatesOn && p === "stock"
    ? STOCK_STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `${pathOf(p)}${st.tab ? `&tab=${st.tab}` : ""}`, file: `${OUT}/${p}-${st.key.replace(/^stock-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : STATES_ON && p === "register"
    ? STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : viewports.map((v): Job => ({ page: p, v, state: null, file: LOCALE_EN ? fileOf(p, v.w, v.h).replace(/\.png$/, "-en.png") : fileOf(p, v.w, v.h) })),
);
const needFixtures = STATES_ON && tenantKey === "coffee" && jobs.some((j) => j.state && j.page === "register");
if (STATES_ON && tenantKey !== "coffee" && pages.includes("register")) die("สถานะหน้าขาย P1.3 ถ่ายได้เฉพาะ --tenant coffee (มี PromptPay + สินค้าตายตัวที่ขั้นตอนใช้)");
// ◂

// ═══════════════════ 2. --dry: แผนการถ่าย (ไม่แตะอะไรเลย) ═══════════════════
const BASE_RAW = flag("--base") ?? process.env.QC_BASE ?? "";
if (DRY) {
  const plan = jobs.map((j) => ({ page: j.page, state: j.state, viewport: `${j.v.w}x${j.v.h}`, device: j.v.name, path: j.path ?? pathOf(j.page), file: j.file, expect: j.expect ?? PAGE_EXPECT[j.page][userKey] }));
  console.log(`แผนการถ่าย POS · wo ${WO} · ผู้ใช้ ${userKey} (${U.email}) · ร้าน ${T.slug} · สาขา ${unitKey} · base ${BASE_RAW || "(ยังไม่ระบุ — รันจริงต้องมี --base)"}`);
  for (const s of plan) console.log(`  ${s.page.padEnd(9)} ${(s.state ?? "-").padEnd(19)} ${s.viewport.padEnd(9)} ${s.device.padEnd(8)} คาด ${String(s.expect).padEnd(6)} ${s.path} → ${s.file}`);
  if (STATES_ON) {
    if (pages.includes("register")) {
      console.log(`สถานะหน้าขาย P1.3${LOCALE_EN ? " (LOCALE=en · 1440 เท่านั้น)" : ""}:`);
      for (const st of STATE_PLAN) console.log(`  · ${st.key.padEnd(13)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
    }
    if (stockStatesOn && pages.includes("stock")) {
      console.log(`สถานะหน้าสต็อก P1.14 U${userKey === "cashier" ? " (แคชเชียร์ = การ์ดปฏิเสธทุกสถานะ)" : ""}:`);
      for (const st of STOCK_STATE_PLAN) console.log(`  · ${st.key.padEnd(19)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      if (userKey === "owner") console.log("  เขียน: รอบตรวจนับ 1 รอบ (OPEN → ยกเลิกใน finally · เหตุผล visual-pos) + 2 รายการนับในรอบนั้น · ไม่รับเข้า/ไม่ปรับสต็อก");
    }
    if (shiftsStatesOn && pages.includes("shifts")) {
      console.log(`สถานะหน้ากะ P1.9 U${userKey === "cashier" ? " (แคชเชียร์ = การ์ดปฏิเสธทุกสถานะ)" : ""} · เครื่อง ${SHIFTS_DEVICE_ID}:`);
      for (const st of SHIFTS_STATE_PLAN) console.log(`  · ${st.key.padEnd(19)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      if (userKey === "owner") console.log("  เขียน: กะ 1 กะ (เปิดผ่าน UI → ปิดผ่าน UI ใน shifts-z · ค้าง = ปิดใน finally นับ = ยอดคาด) + บิลขายเงินสด 1 ใบ + นำเงินเข้า ฿100 1 รายการ");
    }
    if (rpubOn && STATES_ON) {
      console.log(`สถานะหน้าใบเสร็จออนไลน์ P1.11U (สาธารณะ · 390×844 · เครื่อง ${RPUB_DEVICE_ID}):`);
      for (const st of RPUB_STATE_PLAN) console.log(`  · ${st.key.padEnd(22)} คาด ${st.expect} ${st.note}`);
      console.log("  เขียน: ชุดบิลของวันนี้ครบ = ไม่เขียนบิล/กะ · ขาด = กะ 1 กะ (ปิดใน finally) + บิลที่ขาด (สูงสุด 3 ใบ + ใบคืน 1) · แจ้งปัญหา 1 แถว (ลบใน finally พร้อม OutboxEvent · การ์ดบอร์ดงาน = เก็บเข้าคลัง)");
    }
    if (billsStatesOn && pages.includes("sales")) {
      console.log(`สถานะหน้าบิลวันนี้ P1.16 U${userKey === "cashier" ? " (แคชเชียร์ = ปุ่มยกเลิกปิด/ไม่มีคืนเงิน)" : ""} · เครื่อง ${BILLS_DEVICE_ID}:`);
      for (const st of BILLS_STATE_PLAN) console.log(`  · ${st.key.padEnd(19)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(`  เขียน: กะ 1 กะ (บริการ openShift · ปิดใน finally นับ = ยอดคาด) + บิลวันนี้ 7 ใบ + ใบคืน 2 ใบ${userKey === "cashier" ? " — ข้ามเมื่อวันนี้มีชุดภาพบิลครบแล้ว (จากรอบเจ้าของ)" : ""}`);
    }
    if (settingsStatesOn && pages.includes("settings")) {
      console.log(`สถานะหน้าตั้งค่า P1.10 U${userKey === "cashier" ? " (แคชเชียร์ = ใบเสร็จอ่านอย่างเดียว · แท็บเครื่องเป็นการ์ดปฏิเสธ)" : ""} · เครื่อง ${SETTINGS_DEVICE_CODES.join(" · ")}:`);
      for (const st of SETTINGS_STATE_PLAN) console.log(`  · ${st.key.padEnd(22)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log("  เขียน: เครื่อง QC 2 เครื่อง (registerDevice · เพิกถอนใน finally) + กะ 1 กะของเครื่อง 2 (openShift · ปิดใน finally นับ = ยอดคาด) + บิลขายเงินสด 1 ใบ (paydone-print)");
    }
    if (pages.includes("register")) console.log(`  P1.15U: เครื่อง ${DEVICE_ID} (registerDevice · เพิกถอนใน finally) · PIN 6 หลักสุ่มของเจ้าของ/แคชเชียร์ (setStaffPin · ไม่พิมพ์ · คืนแถวเดิมใน finally) · โทเคนผู้ขายฉีดลง sessionStorage · บิลพัก 1 ใบ · กติกา POS_VOID ที่ปิดไว้ + คำขอ PENDING 1 ใบ (approval-wait) — ลบใน finally`);
    if (pages.includes("register") && jobs.some((j) => j.state === "paydlg-promptpay-qr" || j.state === "paydlg-promptpay-paid"))
      console.log("  P1.7U: ใบขอรับเงินของเครื่องรอบนี้ (PENDING = ยกเลิกใน finally) + บิลขายจริงที่ใช้ใบ PAID (paydlg-promptpay-paid) · PromptPay ID ของร้าน QC ตั้ง/คืนค่าเมื่อยังไม่มี");
    if (needFixtures) console.log(`  fixture: สินค้าชั่วคราว 11 ตัว (เหลือ 2 · หมดสต็อก · ปิดขาย + 4 ตัวของภาพ 01 + ลาเต้มีตัวแปร 1+2 + สินค้าชั่ง 1) + กลุ่มตัวเลือก 4 กลุ่ม ที่สาขา ${unitKey} — ลบใน finally`);
  }
  console.log(`รวม ${plan.length} ภาพ (${pages.length} หน้า × ${viewports.length} ขนาด${STATES_ON ? " · หน้าขายแยกตามสถานะ" : ""} × 1 ผู้ใช้)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, dry: true, locale: LOCALE_EN ? "en" : "th", states: STATES_ON, pages: pages.length, viewports: viewports.length, shots: plan.length, plan })}`);
  process.exit(0);
}

// ═══════════════════ 3. base: ต้องระบุ · ห้าม 3215 · ต้องต่อได้ ═══════════════════
if (!BASE_RAW) die("ไม่ได้ระบุเซิร์ฟเวอร์ — ส่ง `--base http://127.0.0.1:<port>` หรือ QC_BASE (ไม่มีค่าปริยาย · ห้ามใช้ :3215 ของ CRM)");
let BASE: string;
try {
  const u = new URL(BASE_RAW);
  if (u.port === "3215" && process.env.POS_VISUAL_ALLOW_3215 !== "1") die(`${BASE_RAW} คือเซิร์ฟเวอร์ของ CRM RUN (:3215) — POS ห้ามใช้ (LANE-RULES ข้อ 4)`);
  BASE = u.origin;
} catch {
  die(`--base ${BASE_RAW} ไม่ใช่ URL`);
}
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ให้ผู้คุมงานเปิดเซิร์ฟเวอร์ QC ของ POS ก่อน (CONTROLLER-RUN)`);
}

// ═══════════════════ 4. env + DB (หลังด่านทั้งหมด — --dry/ไม่มี base ไม่เคยถึงตรงนี้) ═══════════════════
const { loadPosQcEnv } = await import("./pos-qc-env.mjs");
loadPosQcEnv("visual-pos");
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const UA = "qc-visual-pos";
const PROFILE_DIRS = [`/tmp/chr-pos-${process.pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-pos-${process.pid}`];
const cleanProfiles = () => {
  for (const d of PROFILE_DIRS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
};
class Fatal extends Error {}
const MINE: string[] = [];
let BROWSER: Any = null;
/** ลบ session ที่รอบนี้ mint (เฉพาะ id ของตัวเอง) + ซากที่หมดอายุแล้ว — เรียกได้ซ้ำ (finally และ signal) */
let sessionsCleaned = false;
async function cleanSessions(): Promise<{ removed: number; stale: number }> {
  if (sessionsCleaned) return { removed: 0, stale: 0 };
  sessionsCleaned = true;
  let removed = 0;
  if (MINE.length) removed = (await prisma.session.deleteMany({ where: { id: { in: MINE } } })).count;
  // ซากของรอบที่ถูก kill -9: แท็กเดียวกัน + หมดอายุแล้ว (รอบที่ยังวิ่งมีอายุอีก 1 ชม. จึงไม่โดน)
  const stale = (await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } })).count;
  return { removed, stale };
}
// POS P1.3 ▸ สินค้าชั่วคราวของภาพสถานะ (การ์ดเหลือน้อย/หมด/ปิดขาย) — เขียนตรงด้วย prisma ได้เพราะเป็นสคริปต์ (F15.1 สแกนเฉพาะ src/)
//   id ของรอบนี้เท่านั้น · ลบซ้ำได้ · ซากของรอบที่ถูก kill -9 (เกิน 1 ชม.) ถูกกวาดก่อนสร้างใหม่ ◂
const FIX = { prefix: "posqc-vis-", products: [] as string[], items: [] as string[], groups: [] as string[] };
let fixturesCleaned = false;
async function cleanFixtures(): Promise<{ products: number; items: number }> {
  if (fixturesCleaned) return { products: 0, items: 0 };
  fixturesCleaned = true;
  // P1.2 U: ลิงก์กลุ่ม (PosProductOptionGroup) ตามสินค้า (cascade) · ตัวเลือก → กลุ่ม ลบเอง
  if (FIX.groups.length) {
    await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: FIX.groups } } });
    await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: FIX.groups } } });
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.groups } } });
  }
  const products = FIX.products.length ? (await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.products } } })).count : 0;
  const items = FIX.items.length ? (await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.items } } })).count : 0;
  return { products, items };
}
async function makeFixtures(): Promise<void> {
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } } });
  await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } } });
  const oldGroups = (await prisma.menuOptionGroup.findMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } }, select: { id: true } })).map((g) => g.id);
  if (oldGroups.length) {
    await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: oldGroups } } });
    await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: oldGroups } } });
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: oldGroups } } });
  }
  const inv = (T.systems as Record<string, { id: string }>).INVENTORY!.id;
  const tag = `${FIX.prefix}${process.pid}`;
  const mk = async (key: string, name: string, nameEn: string, price: number, onHand: number | null, off: boolean) => {
    let invItemId: string | null = null;
    if (onHand !== null) {
      invItemId = `${tag}-${key}-inv`;
      FIX.items.push(invItemId);
      await prisma.invItem.create({ data: { id: invItemId, tenantId: T.tenantId, systemId: inv, sku: `PQC-VIS-${process.pid}-${key}`.toUpperCase(), name, onHand, kind: "PRODUCT" } });
    }
    const id = `${tag}-${key}`;
    FIX.products.push(id);
    await prisma.posProduct.create({
      data: { id, tenantId: T.tenantId, systemId: SYS, unitId, invItemId, kind: "PRODUCT", name, nameEn, basePriceSatang: price, trackStock: onHand !== null ? true : null, unavailableUnitIds: off ? [unitId] : [] },
    });
    return id;
  };
  FIXTURE_IDS.low = await mk("low", "บราวนี่ (ภาพ QC)", "Brownie (QC shot)", 6500, 2, false);
  FIXTURE_IDS.out = await mk("out", "ครัวซองต์อัลมอนด์ (ภาพ QC)", "Almond croissant (QC shot)", 9500, 0, false);
  FIXTURE_IDS.off = await mk("off", "มัทฉะลาเต้ (ภาพ QC)", "Matcha latte (QC shot)", 9000, null, true);
  // B2.5: สินค้าของตะกร้าภาพ 01 (ชื่อ/ราคาเท่าภาพ · ลบใน finally เหมือนตัวอื่น)
  FIXTURE_IDS.m01latte = await mk("m01latte", M01.latte, "Latte", 10000, null, false);
  FIXTURE_IDS.m01amer = await mk("m01amer", M01.amer, "Americano", 7000, null, false);
  FIXTURE_IDS.m01crois = await mk("m01crois", M01.crois, "Almond croissant", 9500, null, false);
  FIXTURE_IDS.m01beans = await mk("m01beans", M01.beans, "Coffee beans 250 g", 32000, 11, false);
  // P1.2 U R2: ลาเต้มีตัวแปร (ร้อน/เย็น · ลูกใช้ราคาแม่) + 4 กลุ่มของภาพ 01 ผูกที่แม่ · สินค้าชั่ง ฿350/กก.
  FIXTURE_IDS.optParent = await mk("optp", M01.optName, "Latte (QC options)", 7500, null, false);
  for (const [k, nm, en] of [["optv1", "ร้อน", "Hot"], ["optv2", "เย็น", "Iced"]] as const) {
    const id = `${tag}-${k}`;
    FIX.products.unshift(id); // ลูกก่อนแม่ตอนลบ
    await prisma.posProduct.create({ data: { id, tenantId: T.tenantId, systemId: SYS, unitId, kind: "PRODUCT", name: `${M01.optName} ${nm}`, nameEn: `Latte ${en}`, basePriceSatang: null, parentId: FIXTURE_IDS.optParent } });
  }
  const groups: [string, string, number, number, [string, string, number][]][] = [
    ["size", "ขนาด", 1, 1, [["S", "S", 0], ["M", "M", 1000], ["L", "L", 2000]]],
    ["milk", "นม", 1, 1, [["ปกติ", "Regular", 0], ["นมโอ๊ต", "Oat milk", 1500], ["นมอัลมอนด์", "Almond milk", 1500]]],
    ["sweet", "ความหวาน", 1, 1, [["ปกติ", "Regular", 0], ["น้อย", "Less", 0], ["ไม่หวาน", "None", 0]]],
    ["top", "ท็อปปิ้ง", 0, 2, [["วิปครีม", "Whipped cream", 1000], ["ช็อตเพิ่ม", "Extra shot", 2000]]],
  ];
  let order = 0;
  for (const [gk, gname, min, max, choices] of groups) {
    const gid = `${tag}-g-${gk}`;
    const make = (name: string) => prisma.menuOptionGroup.create({ data: { id: gid, tenantId: T.tenantId, unitId, name, minSelect: min, maxSelect: max } });
    try {
      await make(gname);
    } catch {
      await make(`${gname} (QC ${process.pid})`); // ชื่อกลุ่มซ้ำของร้านในสาขาเดียวกัน (@@unique unitId+name)
    }
    FIX.groups.push(gid);
    let co = 0;
    for (const [cn, cen, delta] of choices) {
      const cid = `${gid}-c${co}`;
      await prisma.menuOptionChoice.create({ data: { id: cid, tenantId: T.tenantId, unitId, groupId: gid, name: cn, nameEn: cen, priceDelta: delta, sortOrder: co++ } });
      if (gk === "size" && cn === "M") FIXTURE_IDS.optSizeM = cid;
      if (gk === "milk" && cn === "นมโอ๊ต") FIXTURE_IDS.optOat = cid;
    }
    await prisma.posProductOptionGroup.create({ data: { tenantId: T.tenantId, productId: FIXTURE_IDS.optParent, groupId: gid, sortOrder: order++ } });
  }
  FIXTURE_IDS.weighed = `${tag}-weigh`;
  FIX.products.push(FIXTURE_IDS.weighed);
  await prisma.posProduct.create({
    data: { id: FIXTURE_IDS.weighed, tenantId: T.tenantId, systemId: SYS, unitId, kind: "PRODUCT", name: M01.weighName, nameEn: "Roasted beans by weight (QC)", basePriceSatang: 35000, soldByWeight: true },
  });
}
const FIXTURE_IDS = { low: "", out: "", off: "", m01latte: "", m01amer: "", m01crois: "", m01beans: "", optParent: "", optSizeM: "", optOat: "", weighed: "" };
/** ชื่อบรรทัดของภาพ 01 — ใช้เป็นคำค้นด้วย (ชื่อซ้ำกับสินค้าจริงของร้าน QC ได้ ⇒ แตะด้วย testid ของ fixture เสมอ) */
const M01 = { latte: "ลาเต้", amer: "อเมริกาโน่", crois: "ครัวซองต์อัลมอนด์", beans: "เมล็ดกาแฟ 250 g", optName: "ลาเต้ตัวเลือก QC", weighName: "เมล็ดคั่วชั่งกิโล QC" };
// ถูก Ctrl-C/kill/ปิดเทอร์มินัล: ทำความสะอาดแบบเดียวกับ finally (ปิด chromium · ลบ session ของรอบนี้ · ลบโปรไฟล์) แล้วค่อยออก
process.on("exit", cleanProfiles);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    console.error(`\n⚠️ ได้รับ ${sig} — ทำความสะอาดก่อนออก`);
    const done = (async () => {
      try {
        await BROWSER?.close();
      } catch {
        /* ปิดไม่ได้ก็ลบโปรไฟล์ต่อ */
      }
      // POS P1.9 U: ปิดกะของสถานะหน้ากะ (เหมือน finally)
      try {
        await closeShiftsStateShift();
        if (SHIFTS.close) console.error(`${SHIFTS.close.ok ? "🧹" : "⚠️"} ${SHIFTS.close.detail}`);
      } catch (e) {
        console.error(`❌ ปิดกะของหน้ากะไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.11U: ลบแจ้งปัญหา/คำขอของบิลชุดภาพใบเสร็จ + ปิดกะ (เหมือน finally)
      try {
        await cleanRpub();
        if (RPUB.cleanup) console.error(rpubCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาดชุดภาพใบเสร็จไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.16 U: ปิดกะของเครื่องภาพบิล (เหมือน finally)
      try {
        await closeBillsShift();
        if (BILLS.close) console.error(`${BILLS.close.ok ? "🧹" : "⚠️"} ${BILLS.close.detail}`);
      } catch (e) {
        console.error(`❌ ปิดกะของหน้าบิลไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.7U: ยกเลิกใบขอรับเงิน PENDING ของรอบนี้ + คืน PromptPay ID (เหมือน finally)
      try {
        await cleanupIntents();
        if (INTENTS.cleanup) console.error(`${INTENTS.cleanup.ok ? "🧹" : "⚠️"} ${INTENTS.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ เก็บกวาดใบขอรับเงินไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.10 U: ปิดกะ + เพิกถอนเครื่อง QC ของหน้าตั้งค่า (เหมือน finally)
      try {
        await cleanupSettingsState();
        if (SETTINGS.cleanup) console.error(`${SETTINGS.cleanup.ok ? "🧹" : "⚠️"} ${SETTINGS.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ เก็บกวาดเครื่องของหน้าตั้งค่าไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.14 U: ยกเลิกรอบนับของรอบนี้ (เหมือน finally)
      try {
        await cancelRunCount();
        if (STOCK.cancel) console.error(`${STOCK.cancel.ok ? "🧹" : "⚠️"} ${STOCK.cancel.detail}`);
      } catch (e) {
        console.error(`❌ ยกเลิกรอบนับไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // R3 F7: ปิดกะของรอบนี้ก่อนลบ session (เหมือน finally) — ผลอยู่ใน SHIFT.close · ไม่โยน
      try {
        await closeRunShift();
        if (SHIFT.close) console.error(`${SHIFT.close.ok ? "🧹" : "⚠️"} ${SHIFT.close.detail}`);
      } catch (e) {
        console.error(`❌ ปิดกะไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P1.15U: ลบคำขอ/กติกา · ทิ้งบิลพัก · คืนแถว PIN · เพิกถอนเครื่อง (เหมือน finally)
      try {
        await cleanupP115();
        if (P115.cleanup) console.error(`${P115.cleanup.ok ? "🧹" : "⚠️"} ${P115.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P1.15U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      try {
        const r = await cleanSessions();
        console.error(`🧹 ลบ session ${r.removed} (+ซาก ${r.stale})`);
      } catch (e) {
        console.error(`❌ ลบ session ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      try {
        const f = await cleanFixtures();
        if (f.products || f.items) console.error(`🧹 ลบสินค้าชั่วคราว ${f.products} (+InvItem ${f.items})`);
      } catch (e) {
        console.error(`❌ ลบสินค้าชั่วคราวไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      cleanProfiles();
    })();
    void done.finally(() => process.exit(130));
  });
}
// ═══════════════════ POS P1.3 ▸ ขั้นตอนของแต่ละสถานะ (ปุ่มหาโดย data-testid ที่มองเห็นเท่านั้น) ═══════════════════
const QC_IDS = { amer: "", latte: "", crois: "" };
class StepError extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tid = (id: string) => `[data-testid="${id}"]`;
const tidPrefix = (p: string) => `[data-testid^="${p}"]`;
async function visibleEl(page: Any, sel: string, nth = 0, timeout = 10_000): Promise<Any> {
  const until = Date.now() + timeout;
  for (;;) {
    const hs: Any[] = await page.$$(sel);
    const vis: Any[] = [];
    for (const h of hs) if (await h.isVisible().catch(() => false)) vis.push(h);
    if (vis[nth]) return vis[nth];
    if (Date.now() > until) throw new StepError(`ไม่พบ ${sel}${nth ? ` ตัวที่ ${nth + 1}` : ""} ที่มองเห็น`);
    await sleep(200);
  }
}
async function clickEl(page: Any, sel: string, nth = 0) {
  const h = await visibleEl(page, sel, nth);
  // B2.5: เลื่อนให้อยู่กลางจอก่อนคลิก — ที่ 390 แถวการ์ดล่างอยู่ "ในจอ" (puppeteer ไม่เลื่อนให้) แต่ถูกแถบตะกร้า sticky ทับ ⇒ คลิกหายเงียบ
  await h.evaluate((el: Element) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await sleep(150);
  await h.click();
  await sleep(200);
}
/**
 * B2.5: ตรวจจำนวนบรรทัดตะกร้าหลังลูปเพิ่มสินค้า — คลิกหาย = ขั้นตอนตก (ไม่ใช่ภาพผิดเงียบ ๆ)
 *   md+ = นับ [data-testid^=pos-reg-cart-line-] ที่มองเห็น · มือถือ = data-count ของแถบตะกร้า (บรรทัดอยู่ในแผ่นที่ยังไม่เปิด)
 */
async function expectLines(page: Any, n: number) {
  const ok = await page
    .waitForFunction(
      (want: number) => {
        const bar = document.querySelector('[data-testid="pos-reg-cart-bar"]');
        if (bar && bar.getClientRects().length > 0) return Number(bar.getAttribute("data-count")) === want;
        const lines = Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]')).filter((e) => e.getClientRects().length > 0);
        return lines.length === want;
      },
      { timeout: 5_000 },
      n,
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) throw new StepError(`ตะกร้าไม่ได้ ${n} บรรทัดหลังคลิกเพิ่มสินค้า (คลิกหาย?)`);
}
/** B2.5: หาการ์ดสินค้าด้วยคำค้น (fixture อาจอยู่นอกหน้าแรกของกริด) แล้วแตะ · ล้างคำค้นด้วย Esc */
async function pickBySearch(page: Any, id: string, term: string, times = 1) {
  await typeInto(page, tid("pos-reg-search"), term);
  await visibleEl(page, tid(`pos-reg-product-${id}`), 0, 10_000);
  for (let i = 0; i < times; i++) await clickEl(page, tid(`pos-reg-product-${id}`));
  await page.keyboard.press("Escape");
  await sleep(300);
}
async function typeInto(page: Any, sel: string, text: string) {
  const h = await visibleEl(page, sel);
  await h.click({ count: 3 });
  await h.type(text);
  await sleep(200);
}
/** ปุ่มชำระ (ตะกร้าข้าง หรือแถบล่างมือถือ) เปิด = quote ของเซิร์ฟเวอร์มาแล้วและตรงตะกร้า */
async function waitPayReady(page: Any) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-testid="pos-reg-pay"],[data-testid="pos-reg-cart-bar-pay"]')).some(
          (e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled,
        ),
      { timeout: 15_000 },
    )
    .catch(() => {
      throw new StepError("ปุ่มชำระไม่เปิดภายใน 15 วิ (quote ไม่มา/ถูกปฏิเสธ)");
    });
}
async function addCart3(page: Any, device: Device) {
  if (!QC_IDS.amer || !QC_IDS.latte || !QC_IDS.crois) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน/ครัวซองต์เนยสด) — รัน seed-pos-qc + backfill ก่อน");
  for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte, QC_IDS.crois]) await clickEl(page, tid(`pos-reg-product-${id}`));
  await expectLines(page, 3); // อเมริกาโน่ ×2 รวมเป็นบรรทัดเดียว
  await waitPayReady(page);
  // ส่วนลดรายการ ฿10 ที่บรรทัดที่ 2 (ลาเต้)
  if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
  await clickEl(page, tidPrefix("pos-reg-cart-line-"), 1);
  await typeInto(page, tidPrefix("pos-reg-line-discount-"), "10");
  await clickEl(page, tid("pos-reg-editor-apply"));
  if (device === "mobile") {
    await page.keyboard.press("Escape"); // ปิดแผ่นตะกร้า
    await sleep(250);
  }
  await waitPayReady(page);
}
/** ขายจริง 1 บิล (อเมริกาโน่×2 + ลาเต้ · เงินสดรับพอดี) → ขายสำเร็จ — ใช้ร่วม: สถานะ sale-done + บิลของสถานะหน้ากะ (P1.9 U) */
async function cashSaleAmerLatte(page: Any, device: Device): Promise<void> {
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC");
  for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte]) await clickEl(page, tid(`pos-reg-product-${id}`));
  await expectLines(page, 2);
  await waitPayReady(page);
  await clickPay(page, device);
  await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
  await clickEl(page, tid("pos-reg-paydlg-confirm"));
  await visibleEl(page, tid("pos-reg-done"), 0, 20_000);
}
const openCartOnMobile = async (page: Any, device: Device) => {
  if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
};
const clickPay = (page: Any, device: Device) => clickEl(page, tid(device === "mobile" ? "pos-reg-cart-bar-pay" : "pos-reg-pay"));
// ── P1.2 U R2 ข้อ 7: กะของรอบนี้ (เปิดผ่าน UI ครั้งเดียว · ปิดใน finally) ──
const SHIFT = { opened: false, id: "" as string, openError: null as string | null, close: null as null | { ok: boolean; detail: string } };
/** แถบ "เปิดกะก่อนเริ่มขาย" ยังอยู่หลังสถานะของเครื่อง (deviceId) มาแล้ว = ยังไม่มีกะ */
async function shiftBannerStays(page: Any): Promise<boolean> {
  const gone = await page
    .waitForFunction(() => !Array.from(document.querySelectorAll('[data-testid="pos-reg-shift-required"]')).some((e) => e.getClientRects().length > 0), { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  return !gone;
}
/** R3 V4: ทุกสถานะ — แถบเปิดกะต้องหายแล้ว (เจ้าของเปิดกะให้เครื่องนี้ไว้ก่อนเริ่มถ่าย) */
async function ensureShift(page: Any): Promise<void> {
  if (!(await shiftBannerStays(page))) return;
  throw new StepError(SHIFT.opened ? "เปิดกะให้เครื่องนี้แล้วแต่แถบ \"เปิดกะก่อนเริ่มขาย\" ยังอยู่ (deviceId ไม่ตรง?)" : `ไม่ได้เปิดกะ: ${SHIFT.openError ?? "?"}`);
}
const DEVICE_KEY = "shark.pos.deviceId";
async function pinDevice(page: Any, device: string = DEVICE_ID): Promise<void> {
  await page.evaluateOnNewDocument(
    (k: string, v: string) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* ไม่มี storage */
      }
    },
    DEVICE_KEY,
    device,
  );
}
/** R3 V4: เจ้าของร้านเปิดกะให้เครื่อง DEVICE_ID ผ่านหน้า /pos/shifts จริง (browser context แยก · session เจ้าของของรอบนี้) — พังไม่โยน (บันทึก openError) */
async function openShiftAsOwner(browser: Any, ownerCookies: Any[], viewport: { width: number; height: number }): Promise<void> {
  const ctx = typeof browser.createBrowserContext === "function" ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  try {
    const page = await ctx.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.setCookie(...ownerCookies);
    await pinDevice(page);
    await page.goto(`${BASE}/app/sys/${SYS}/pos/shifts?unit=${encodeURIComponent(unitId)}`, { waitUntil: "networkidle2", timeout: 60_000 });
    const current = await visibleEl(page, tid("pos-shift-current"), 0, 3_000).then(() => true).catch(() => false);
    if (!current) {
      await visibleEl(page, tid("pos-shift-open"), 0, 15_000).catch(() => {
        throw new StepError("หน้ากะของเจ้าของไม่ขึ้นการ์ดเปิดกะ (pos-shift-open)");
      });
      // P1.9 U: การ์ด "ยังไม่เปิดกะ" → ปุ่มเปิดกะ → กล่องเปิดกะ (ภาพ 13A) · ช่อง "รวม" = pos-shift-open-float
      await clickEl(page, tid("pos-shift-open-start"));
      await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
      await typeInto(page, tid("pos-shift-open-float"), "1000");
      await page
        .waitForFunction(() => !(document.querySelector('[data-testid="pos-shift-open-submit"]') as HTMLButtonElement | null)?.disabled, { timeout: 10_000 })
        .catch(() => undefined);
      await clickEl(page, tid("pos-shift-open-submit"));
      await visibleEl(page, tid("pos-shift-current"), 0, 15_000).catch(() => {
        throw new StepError("เปิดกะไม่สำเร็จ (ไม่เห็น pos-shift-current)");
      });
    }
    const row = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: DEVICE_ID, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true } });
    if (!row) throw new StepError("เปิดกะผ่าน UI แล้วแต่ไม่พบแถวกะของเครื่องนี้ใน DB");
    SHIFT.opened = true;
    SHIFT.id = row.id;
  } catch (e) {
    SHIFT.openError = e instanceof Error ? e.message.slice(0, 200) : String(e);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
/** finally: ปิดกะของรอบนี้แบบนับตรงยอด (closeShift ของบริการ · actor = เจ้าของร้าน QC) — ผลอยู่ใน summary ไม่โยน */
async function closeRunShift(): Promise<void> {
  if (!SHIFT.opened || SHIFT.close) return; // เรียกซ้ำได้ (signal แล้ว finally)
  SHIFT.close = await closeShiftAsOwner(SHIFT.id, "close");
}
/** ปิดกะตาม id แบบนับตรงยอด (closeShift ของบริการ · actor = เจ้าของร้าน QC) — คืนผล ไม่โยน (POS P1.9 U: ใช้ร่วมกับกะของสถานะหน้ากะ) */
async function closeShiftAsOwner(shiftId: string, keyTag: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const { closeShift, computeReport } = await import("@/lib/modules/pos/shift");
    const sh = shiftId ? await prisma.posShift.findFirst({ where: { id: shiftId, tenantId: T.tenantId } }) : null;
    if (!sh) return { ok: false, detail: "หาแถวกะของรอบนี้ไม่เจอ (เปิดผ่าน UI แล้วแต่ไม่พบใน DB)" };
    if (sh.status !== "OPEN") return { ok: true, detail: `กะ ${sh.id} สถานะ ${sh.status} อยู่แล้ว` };
    const expected = (await computeReport(prisma, sh)).expectedCashSatang;
    const own = T.users.owner;
    const mb = await prisma.membership.findUnique({ where: { id: own.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
    if (expected === null || !mb) return { ok: false, detail: `คำนวณยอดคาดไม่ได้ (${expected}) หรือไม่พบ membership เจ้าของร้าน` };
    const actor = {
      userId: own.userId,
      role: mb.role as "OWNER" | "MANAGER" | "STAFF",
      unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
      permissions: mb.permissions && typeof mb.permissions === "object" ? (mb.permissions as Record<string, unknown>) : {},
    };
    const r = await closeShift({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { shiftId: sh.id, countedCashSatang: expected, idempotencyKey: `${FIX.prefix}${process.pid}-${keyTag}` });
    return r.ok ? { ok: true, detail: `ปิดกะ ${sh.id} (ยอดคาด = ยอดนับ ${expected})` } : { ok: false, detail: `ปิดกะไม่สำเร็จ: ${r.code}` };
  } catch (e) {
    return { ok: false, detail: `ปิดกะล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  }
}

// ═══════════════════ POS P1.15U ▸ ผู้ขายบนเครื่อง (PIN + โทเคน) · จอล็อก 13B · แผ่นส่วนลดเกินสิทธิ์ · 21B ═══════════════════
//   หน้าขายล็อกเมื่อไม่มีโทเคนผู้ขาย (sessionStorage `pos-staff:<deviceId>`) และเครื่องต้องลงทะเบียน ⇒ ทุกงานของหน้า register:
//   ลงทะเบียนเครื่องของรอบ (registerDevice · เพิกถอนใน finally) · ตั้ง PIN 6 หลักสุ่มของเจ้าของ/แคชเชียร์ผ่าน setStaffPin (ไม่พิมพ์ PIN ·
//   แถวเดิมถูกเก็บแล้วคืนค่าใน finally · ไม่มีแถวเดิม = ลบ) · ออกโทเคนด้วย issueStaffToken แล้วฉีดลง sessionStorage ก่อนสคริปต์ของหน้า
//   สถานะใหม่: lock-screen · lock-pin-locked (ตั้งล็อกแถว PIN ของผู้ใช้รอบนี้ตรง ๆ แล้วใส่ PIN ถูก → PIN_LOCKED) · staff-switch ·
//   discount-over-sheet (โทเคนแคชเชียร์ · ลด 20% > เพดาน 10%) · approval-wait (ขายเงินสด 1 บิลผ่าน UI → คำขอ POS_VOID PENDING + snapshot
//   เขียนตรงด้วย prisma ใต้กติกาที่ปิดไว้ (active false · ไม่กระทบชุดข้อสอบอื่น) → หน้าบิลวันนี้ → ปุ่ม "ยกเลิกบิล — รออนุมัติ…" → 21B)
//   🔴 finally/signal: ลบคำขอ + snapshot + กติกา · ทิ้งบิลพักของรอบ · คืนแถว PIN · เพิกถอนเครื่อง ◂
const P115 = {
  seeded: false,
  error: null as string | null,
  deviceRowId: "",
  pins: {} as Record<string, string>,
  restore: [] as { userId: string; row: { pinHash: string; failedCount: number; lockedUntil: Date | null; setById: string } | null }[],
  sessions: {} as Record<string, string>,
  heldId: "",
  policyId: "",
  requestId: "",
  /** fix รอบ 1 F9: ทุกคำขอที่สร้าง (approval-wait 1 ใบต่อขนาดจอ) — ลบครบใน finally */
  requestIds: [] as string[],
  saleId: "",
  cleanup: null as null | { ok: boolean; detail: string },
};
const STAFF_KEY = (dev: string) => `pos-staff:${dev}`;
const WEAK = new Set(["0000", "1234", "1111", "123456", "000000"]);
async function memberActorOf(k: UserKey): Promise<{ userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> }> {
  const u = T.users[k];
  const mb = await prisma.membership.findUnique({ where: { id: u.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mb) throw new StepError(`ไม่พบ membership ${k} ของร้าน QC`);
  return {
    userId: u.userId,
    role: mb.role as "OWNER" | "MANAGER" | "STAFF",
    unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((x): x is string => typeof x === "string") : [],
    permissions: mb.permissions && typeof mb.permissions === "object" ? (mb.permissions as Record<string, unknown>) : {},
  };
}
/** โทเคนผู้ขาย (JSON ของ sessionStorage) ของผู้ใช้ k บนเครื่อง dev — ต้องมีแถว PIN แล้ว (pinVersion) */
async function staffSessionJson(k: UserKey, dev: string): Promise<string | null> {
  const cacheKey = `${k}|${dev}`;
  if (P115.sessions[cacheKey]) return P115.sessions[cacheKey]!;
  if (!P115.pins[k]) return null;
  const { issueStaffToken } = await import("@/lib/modules/pos/staff-pin");
  const a = await memberActorOf(k);
  const t = await issueStaffToken({ tenantId: T.tenantId, systemId: SYS, unitId, deviceId: dev }, { unitId, deviceId: dev, userId: a.userId });
  const json = JSON.stringify({ userId: a.userId, name: T.users[k].name, role: a.role, staffToken: t.staffToken, expiresAt: t.expiresAt });
  P115.sessions[cacheKey] = json;
  return json;
}
async function injectStaff(page: Any, dev: string, json: string): Promise<void> {
  await page.evaluateOnNewDocument(
    (k: string, v: string) => {
      try {
        window.sessionStorage.setItem(k, v);
      } catch {
        /* ไม่มี storage = จอล็อก (ตามจริง) */
      }
    },
    STAFF_KEY(dev),
    json,
  );
}
/** ครั้งเดียวต่อรอบ (ก่อนเปิด chromium) — พังไม่โยน (บันทึก P115.error · หน้าขายจะขึ้นจอล็อกและสถานะตกพร้อมเหตุผล) */
async function seedP115Once(): Promise<void> {
  if (P115.seeded || P115.error) return;
  try {
    const { registerDevice } = await import("@/lib/modules/pos/device");
    const { setStaffPin } = await import("@/lib/modules/pos/staff-pin");
    const { randomInt } = await import("node:crypto");
    const owner = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    const rg = await registerDevice(ctx, owner, { name: `เครื่องขาย QC ${process.pid} (ภาพ P1.15U)`.slice(0, 60), deviceCode: DEVICE_ID });
    if (!rg.ok) throw new StepError(`ลงทะเบียนเครื่อง ${DEVICE_ID} ไม่ได้: ${rg.code}`);
    P115.deviceRowId = rg.device.id;
    for (const k of USERS) {
      const a = await memberActorOf(k).catch(() => null);
      if (!a) continue;
      const prev = await prisma.posStaffPin.findUnique({ where: { unitId_userId: { unitId, userId: a.userId } }, select: { pinHash: true, failedCount: true, lockedUntil: true, setById: true } });
      P115.restore.push({ userId: a.userId, row: prev });
      for (let i = 0; i < 6 && !P115.pins[k]; i++) {
        const pin = String(randomInt(100000, 1000000));
        if (WEAK.has(pin) || Object.values(P115.pins).includes(pin)) continue;
        const r = await setStaffPin(ctx, a, { userId: a.userId, pin });
        if (r.ok) P115.pins[k] = pin;
        else if (r.code !== "PIN_TAKEN" && r.code !== "WEAK_PIN") break; // แคชเชียร์ขายสาขานี้ไม่ได้ = ไม่มี PIN (สถานะที่ต้องใช้จะตกพร้อมเหตุผล)
      }
    }
    if (!P115.pins[userKey]) throw new StepError(`ตั้ง PIN ของผู้ใช้รอบนี้ (${userKey}) ไม่ได้`);
    // บิลที่พัก 1 ใบ (การ์ด "บิลที่พักไว้" ของจอล็อก)
    if (QC_IDS.amer && QC_IDS.latte && QC_IDS.crois) {
      const { holdRegisterCart } = await import("@/lib/modules/pos/held-cart");
      const h = await holdRegisterCart(ctx, owner, { cart: { lines: [{ productId: QC_IDS.amer, qty: 1 }, { productId: QC_IDS.latte, qty: 1 }, { productId: QC_IDS.crois, qty: 1 }] }, label: "พี่แว่น (ภาพ QC)" });
      if (h.ok) P115.heldId = h.heldCart.id;
    }
    // กติกา POS_VOID ที่ปิดไว้ (active false — resolvePolicy ไม่เห็น ⇒ ชุดข้อสอบอื่นไม่เปลี่ยน) ให้คำขอของภาพมีขั้น/ชื่อกติกา
    if (jobs.some((j) => j.state === "approval-wait")) {
      const pol = await prisma.approvalPolicy.create({
        data: { tenantId: T.tenantId, name: `ยกเลิกบิล > ฿100 ต้องผู้จัดการ (ภาพ QC ${process.pid})`, entityType: "POS_VOID", active: false, thresholdSatang: 10000, steps: { create: [{ tenantId: T.tenantId, order: 1, approverRole: "MANAGER" }] } },
        select: { id: true },
      });
      P115.policyId = pol.id;
    }
    P115.seeded = true;
  } catch (e) {
    P115.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** approval-wait: บิลล่าสุดของเครื่องรอบนี้ (ขายผ่าน UI) → คำขอ POS_VOID PENDING + snapshot (เขียนตรง · ลบใน finally) */
async function seedVoidRequest(): Promise<string> {
  if (!P115.policyId) throw new StepError("ไม่มีกติกา POS_VOID ของภาพ (seedP115Once)");
  const sale = await prisma.posSale.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", status: "PAID", createdAt: { gte: RUN_STARTED } }, orderBy: { createdAt: "desc" }, select: { id: true, receiptNo: true, grandTotalSatang: true } });
  if (!sale) throw new StepError("ไม่พบบิลที่เพิ่งขายของรอบนี้");
  const cashier = T.users.cashier.userId;
  const req = await prisma.approvalRequest.create({
    data: { tenantId: T.tenantId, policyId: P115.policyId, entityType: "POS_VOID", entityId: sale.id, unitId, systemId: SYS, amountSatang: sale.grandTotalSatang, requestedById: cashier, idempotencyKey: `approval-POS_VOID-${sale.id}` },
    select: { id: true },
  });
  P115.requestId = req.id;
  P115.requestIds.push(req.id);
  P115.saleId = sale.id;
  await prisma.posApprovalPayload.create({
    data: {
      requestId: req.id,
      tenantId: T.tenantId,
      kind: "POS_VOID",
      payload: { ref: sale.id, entityId: sale.id, saleId: sale.id, requestedById: cashier, amountSatang: sale.grandTotalSatang, unitId, systemId: SYS, reason: "ลูกค้าเปลี่ยนใจ (ภาพ QC)", idempotencyKey: `${FIX.prefix}${process.pid}-void`, deviceId: DEVICE_ID, receiptNo: sale.receiptNo, title: `ยกเลิกบิล ${sale.receiptNo ?? sale.id.slice(-6)}` },
    },
  });
  return sale.id;
}
/** ปลดล็อกแถว PIN ของผู้ใช้รอบนี้ (หลัง lock-pin-locked) */
async function unlockRunPin(): Promise<void> {
  await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: T.users[userKey].userId }, data: { failedCount: 0, lockedUntil: null } });
}
async function clickPinDigits(page: Any, pin: string): Promise<void> {
  for (const d of pin) await clickEl(page, tid(`pos-lock-key-${d}`));
}
async function lockFromRegister(page: Any, device: Device): Promise<void> {
  await clickEl(page, tid(device === "mobile" ? "pos-lock-now-mobile" : "pos-lock-now"));
  await visibleEl(page, tid("pos-lock-screen"), 0, 10_000);
  await visibleEl(page, tid("pos-staff-card"), 0, 15_000).catch(() => {
    throw new StepError("จอล็อกไม่มีรายชื่อพนักงาน (listStaffForDeviceAction)");
  });
}
async function runP115State(page: Any, state: StateKey, device: Device): Promise<void> {
  if (P115.error || !P115.seeded) throw new StepError(`ไม่มีข้อมูลภาพ P1.15U: ${P115.error ?? "ยังไม่ได้สร้าง"}`);
  if (state === "lock-screen") {
    await lockFromRegister(page, device);
    await clickPinDigits(page, "123"); // จุด 3 ดวง (ยังไม่ครบ 6 = ไม่ส่ง)
    return;
  }
  if (state === "lock-pin-locked") {
    await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: T.users[userKey].userId }, data: { failedCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    await lockFromRegister(page, device);
    await clickPinDigits(page, P115.pins[userKey]!);
    await visibleEl(page, tid("pos-lock-manager-unlock"), 0, 10_000);
    return;
  }
  if (state === "staff-switch") {
    await lockFromRegister(page, device);
    const other = T.users[userKey === "owner" ? "cashier" : "owner"].name;
    const cards = await page.$$(tid("pos-staff-card"));
    let hit = false;
    for (const c of cards) {
      if (String(await c.evaluate((n: Element) => n.textContent ?? "")).includes(other)) {
        await c.click();
        hit = true;
        break;
      }
    }
    if (!hit) throw new StepError(`ไม่พบการ์ดของ ${other} บนจอล็อก`);
    await clickPinDigits(page, "12");
    return;
  }
  if (state === "discount-over-sheet") {
    await addCart3(page, device);
    await openCartOnMobile(page, device);
    await clickEl(page, tid("pos-reg-bill-discount"));
    await visibleEl(page, tid("pos-reg-bill-discount-dialog"));
    await clickEl(page, tid("pos-reg-bill-discount-percent"));
    await typeInto(page, tid("pos-reg-bill-discount-value"), "20");
    await clickEl(page, tid("pos-reg-bill-discount-apply"));
    await visibleEl(page, tid("pos-discount-over-sheet"), 0, 10_000);
    await visibleEl(page, tid("pos-discount-over-manager"), 0, 10_000).catch(() => undefined);
    return;
  }
  if (state === "approval-wait") {
    await cashSaleAmerLatte(page, device);
    const saleId = await seedVoidRequest();
    await page.goto(`${BASE}/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(page, tid("pos-bills-list"), 0, 15_000);
    await clickEl(page, `[data-bill-id="${saleId}"]`);
    await visibleEl(page, tid("pos-bills-void-open"), 0, 15_000);
    await page.waitForFunction(() => document.querySelector('[data-testid="pos-bills-void-open"]')?.getAttribute("data-pending") === "true", { timeout: 15_000 }).catch(() => {
      throw new StepError("ปุ่มยกเลิกบิลไม่ขึ้น \"รออนุมัติ…\" (posApprovalStatusAction saleId)");
    });
    if (userKey === "cashier") return; // แคชเชียร์ QC ไม่มี pos.sale.void — ปุ่มปิดแต่ขึ้น "รออนุมัติ…" (ภาพนี้)
    await clickEl(page, tid("pos-bills-void-open"));
    await visibleEl(page, tid("pos-approval-wait"), 0, 10_000);
    await page.waitForFunction(() => document.querySelector('[data-testid="pos-approval-wait"]')?.getAttribute("data-status") === "PENDING", { timeout: 15_000 }).catch(() => undefined);
    return;
  }
}
/** สรุปสำหรับ summary/JSON_SUMMARY — ไม่มี PIN/โทเคน */
const p115Summary = () => ({ seeded: P115.seeded, error: P115.error, device: P115.deviceRowId ? DEVICE_ID : null, pinsSet: Object.keys(P115.pins), heldId: P115.heldId || null, requestIds: P115.requestIds, saleId: P115.saleId || null, cleanup: P115.cleanup });
/** finally/signal: ลบคำขอ/snapshot/กติกา · ทิ้งบิลพัก · คืนแถว PIN · เพิกถอนเครื่อง — เรียกซ้ำได้ · ผลใน summary ไม่โยน */
async function cleanupP115(): Promise<void> {
  if (P115.cleanup || (!P115.seeded && !P115.error && !P115.restore.length && !P115.deviceRowId)) return;
  const parts: string[] = [];
  let ok = true;
  const step = async (label: string, fn: () => Promise<string>) => {
    try {
      parts.push(await fn());
    } catch (e) {
      ok = false;
      parts.push(`${label} ล้ม: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  await step("คำขอ", async () => {
    // fix รอบ 1 F9: ลบทุกคำขอของกติกาภาพ (ทุกขนาดจอ) + snapshot ของมัน ก่อนลบกติกา
    let n = 0;
    if (P115.policyId) {
      const reqs = await prisma.approvalRequest.findMany({ where: { tenantId: T.tenantId, policyId: P115.policyId }, select: { id: true } });
      const ids = [...new Set([...P115.requestIds, ...reqs.map((r) => r.id)])];
      if (ids.length) await prisma.posApprovalPayload.deleteMany({ where: { tenantId: T.tenantId, requestId: { in: ids } } });
      n = (await prisma.approvalRequest.deleteMany({ where: { tenantId: T.tenantId, OR: [{ policyId: P115.policyId }, { id: { in: P115.requestIds } }] } })).count;
      await prisma.approvalPolicy.deleteMany({ where: { tenantId: T.tenantId, id: P115.policyId } });
    }
    return `คำขอ/กติกาของภาพ ${n}/${P115.policyId ? 1 : 0}`;
  });
  await step("บิลพัก", async () => {
    if (!P115.heldId) return "บิลพัก 0";
    const { discardHeldCart } = await import("@/lib/modules/pos/held-cart");
    const r = await discardHeldCart({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), { id: P115.heldId });
    return `บิลพักของภาพ ${r.ok ? "ทิ้งแล้ว" : "ไม่อยู่แล้ว"}`;
  });
  await step("PIN", async () => {
    let n = 0;
    for (const r of P115.restore) {
      if (r.row) await prisma.posStaffPin.updateMany({ where: { unitId, userId: r.userId }, data: { pinHash: r.row.pinHash, failedCount: r.row.failedCount, lockedUntil: r.row.lockedUntil, setById: r.row.setById } });
      else await prisma.posStaffPin.deleteMany({ where: { tenantId: T.tenantId, unitId, userId: r.userId } });
      n++;
    }
    return `คืนแถว PIN ${n}`;
  });
  await step("เครื่อง", async () => {
    if (!P115.deviceRowId) return "เครื่อง 0";
    const { revokeDevice } = await import("@/lib/modules/pos/device");
    const r = await revokeDevice({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), { id: P115.deviceRowId });
    if (!r.ok) throw new StepError(`เพิกถอนเครื่อง ${DEVICE_ID}: ${r.code}`);
    return `เพิกถอนเครื่อง ${DEVICE_ID}`;
  });
  P115.cleanup = { ok, detail: `P1.15U: ${parts.join(" · ")}` };
}

async function runState(page: Any, state: StateKey, device: Device): Promise<void> {
  // R3: แยกด้วยสมาชิกชุดที่แน่นอน ไม่ใช่คำนำหน้า — สถานะหน้าขาย "stock-warn" ขึ้นต้น "stock-" แต่ไม่ใช่สถานะหน้าสต็อก
  if (isStockState(state)) return runStockState(page, state); // POS P1.14 U
  if (isShiftsState(state)) return runShiftsState(page, state); // POS P1.9 U
  if (isBillsState(state)) return runBillsState(page, state); // POS P1.16 U
  if (isRpubState(state)) return runRpubState(page, state); // POS P1.11U
  if (isSettingsState(state)) return runSettingsState(page, state, device); // POS P1.10 U
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root) — ธง settings.pos.registerV2 ของร้าน QC เปิดหรือยัง? (seed-pos-qc)");
  });
  // ข้อ 7: ร้าน QC บังคับเปิดกะ (P1.9) — เปิดผ่าน UI ครั้งเดียวต่อรอบ ภาพจึงมีหัว "กะ #… · เปิด …" เหมือนภาพ 01
  await ensureShift(page);
  if (P115_STATE_KEYS.has(state)) return runP115State(page, state, device); // POS P1.15U
  switch (state) {
    case "default":
      return;
    case "cart3":
      return addCart3(page, device);
    case "cart4-01": {
      const f = FIXTURE_IDS;
      if (!f.m01latte || !f.m01amer || !f.m01crois || !f.m01beans) throw new StepError("ไม่มีสินค้าชั่วคราวของภาพ 01 — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      await pickBySearch(page, f.m01latte, M01.latte, 2);
      await pickBySearch(page, f.m01amer, M01.amer);
      await pickBySearch(page, f.m01crois, M01.crois);
      await pickBySearch(page, f.m01beans, M01.beans);
      await expectLines(page, 4);
      await waitPayReady(page);
      // ส่วนลด ฿10 ที่ครัวซองต์ (บรรทัดที่ 3)
      await openCartOnMobile(page, device);
      await clickEl(page, tidPrefix("pos-reg-cart-line-"), 2);
      await typeInto(page, tidPrefix("pos-reg-line-discount-"), "10");
      await clickEl(page, tid("pos-reg-editor-apply"));
      if (device === "mobile") {
        await page.keyboard.press("Escape");
        await sleep(250);
      }
      await waitPayReady(page);
      return;
    }
    case "offline":
      await addCart3(page, device);
      await page.setOfflineMode(true);
      await visibleEl(page, tid("pos-reg-offline-banner"), 0, 10_000);
      return;
    case "line-editor":
      await addCart3(page, device);
      await openCartOnMobile(page, device);
      await clickEl(page, tidPrefix("pos-reg-line-qty-"));
      await visibleEl(page, tid("pos-reg-line-editor"));
      return;
    case "bill-discount":
      await addCart3(page, device);
      await openCartOnMobile(page, device);
      await clickEl(page, tid("pos-reg-bill-discount"));
      await visibleEl(page, tid("pos-reg-bill-discount-dialog"));
      return;
    case "custom-item":
      await clickEl(page, tid("pos-reg-custom-item"));
      await visibleEl(page, tid(userKey === "owner" ? "pos-reg-custom-dialog" : "pos-reg-toast"));
      return;
    case "paydlg-cash":
      await addCart3(page, device);
      await clickPay(page, device);
      await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
      await visibleEl(page, tid("pos-reg-paydlg-change"));
      return;
    // POS P1.7U ▸ ใบขอรับเงิน ◂
    case "paydlg-promptpay-qr":
    case "paydlg-promptpay-paid":
      await addCart3(page, device);
      await clickPay(page, device);
      await clickEl(page, tid("pos-reg-paydlg-method-promptpay"));
      await visibleEl(page, `${tid("pos-pay-intent")}[data-status="PENDING"]`, 0, 15_000).catch(async () => {
        const st = await page.$eval(tid("pos-pay-intent"), (e: Element) => `${e.getAttribute("data-status")} ${e.textContent?.slice(0, 120)}`).catch(() => "ไม่มีแผง");
        throw new StepError(`ใบขอรับเงินไม่ขึ้น PENDING (${st})`);
      });
      await visibleEl(page, tid("pos-pay-intent-countdown"), 0, 5_000);
      if (state === "paydlg-promptpay-qr") return;
      await clickEl(page, tid("pos-pay-intent-manual"));
      await visibleEl(page, tid("pos-pay-intent-paid"), 0, 10_000).catch(() => {
        throw new StepError("ยืนยันเองแล้วไม่ขึ้น ✓ เงินเข้าแล้ว (pos-pay-intent-paid)");
      });
      await page
        .waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 5_000 })
        .catch(() => {
          throw new StepError("ใบ PAID แล้วแต่ปุ่มยืนยันรับเงินยังปิด");
        });
      return;
    case "paydlg-card-edc":
      await addCart3(page, device);
      await clickPay(page, device);
      await clickEl(page, tid("pos-reg-paydlg-method-card"));
      await visibleEl(page, tid("pos-reg-paydlg-reference"), 0, 5_000).catch(() => {
        throw new StepError("บัตร (Beam ปิด) ไม่ขึ้นช่องเลขอ้างอิง EDC");
      });
      if (await page.$(tid("pos-pay-intent"))) throw new StepError("บัตรตอน Beam ปิดไม่ควรมีแผงใบขอรับเงิน");
      return;
    case "sale-done":
      return cashSaleAmerLatte(page, device);
    case "search-empty":
      await typeInto(page, tid("pos-reg-search"), "zz-no-such-item-qc");
      await visibleEl(page, tid("pos-reg-search-empty"), 0, 10_000);
      return;
    case "stock-warn":
      if (!FIXTURE_IDS.low) throw new StepError("ไม่มีสินค้าชั่วคราว (fixture) — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      for (let i = 0; i < 3; i++) await clickEl(page, tid(`pos-reg-product-${FIXTURE_IDS.low}`));
      await expectLines(page, 1);
      await waitPayReady(page);
      await openCartOnMobile(page, device);
      await visibleEl(page, tidPrefix("pos-reg-line-warn-"));
      return;
    case "mobile-sheet":
      await addCart3(page, device);
      await clickEl(page, tid("pos-reg-cart-view"));
      await visibleEl(page, tid("pos-reg-cart-sheet"));
      return;
    case "options-popover": {
      const f = FIXTURE_IDS;
      if (!f.optParent || !f.optSizeM || !f.optOat) throw new StepError("ไม่มีสินค้าชั่วคราวที่มีตัวเลือก — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      // คำค้นค้างในช่อง (Esc จะปิดป๊อปโอเวอร์) — การ์ดอาจอยู่นอกหน้าแรกของกริด
      await typeInto(page, tid("pos-reg-search"), M01.optName);
      await clickEl(page, tid(`pos-reg-product-${f.optParent}`));
      await visibleEl(page, tid("pos-reg-options-dialog"), 0, 10_000);
      await clickEl(page, tidPrefix("pos-reg-variant-"));
      await clickEl(page, tid(`pos-reg-option-${f.optSizeM}`));
      await clickEl(page, tid(`pos-reg-option-${f.optOat}`));
      await clickEl(page, tid("pos-reg-options-qty-inc"));
      return;
    }
    case "weigh":
      if (!FIXTURE_IDS.weighed) throw new StepError("ไม่มีสินค้าชั่งชั่วคราว — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      await typeInto(page, tid("pos-reg-search"), M01.weighName);
      await clickEl(page, tid(`pos-reg-product-${FIXTURE_IDS.weighed}`));
      await visibleEl(page, tid("pos-reg-weigh-dialog"), 0, 10_000);
      if (userKey === "owner") await typeInto(page, tid("pos-reg-weigh-grams"), "250");
      return;
  }
}
// ◂

// ═══════════════════ POS P1.14 U ▸ ขั้นตอนของหน้าสต็อก ═══════════════════
const RUN_STARTED = new Date();
const STOCK = { countId: "", ours: false, recorded: false, cancel: null as null | { ok: boolean; detail: string } };
/** สินค้าในคลังของร้าน QC 2 ตัว (PRODUCT · ไม่เก็บถาวร · ไม่ใช่ fixture) สำหรับคิวรับ/ปรับ */
async function stockItems(): Promise<{ id: string; sku: string; name: string }[]> {
  const inv = (T.systems as Record<string, { id: string }>).INVENTORY!.id;
  const rows = await prisma.invItem.findMany({
    where: { tenantId: T.tenantId, systemId: inv, kind: "PRODUCT", archivedAt: null, NOT: { id: { startsWith: FIX.prefix } } },
    select: { id: true, sku: true, name: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  const ok = rows.filter((r) => r.sku && r.sku.trim().length >= 2);
  if (ok.length < 2) throw new StepError("คลังของร้าน QC มีสินค้าที่มี SKU ไม่ถึง 2 ตัว — seed-pos-qc ก่อน");
  return ok.slice(0, 2);
}
/** ตัวเลือกสินค้า: พิมพ์ SKU → รอผล → แตะผลของสินค้านั้น */
async function pickStockItem(page: Any, kind: string, item: { id: string; sku: string }) {
  await typeInto(page, tid(`pos-stock-${kind}-search`), item.sku);
  await clickEl(page, tid(`pos-stock-${kind}-search-hit-${item.id}`));
}
/** รอบนี้: เปิดรอบผ่าน UI ถ้ายังไม่มี (การ์ดเริ่ม) แล้วจำ id · เป็นของรอบนี้ = เปิดโดยเจ้าของ QC หลังเริ่มรัน */
async function ensureCountOpen(page: Any): Promise<void> {
  const start = await visibleEl(page, tid("pos-stock-start"), 0, 4_000).then(() => true).catch(() => false);
  if (start) await clickEl(page, tid("pos-stock-start-submit"));
  const el = await visibleEl(page, tid("pos-stock-count"), 0, 20_000).catch(() => {
    throw new StepError("ไม่ขึ้นจอนับ (pos-stock-count) หลังเริ่มตรวจนับ");
  });
  const id = String(await el.evaluate((e: Element) => e.getAttribute("data-count-id") ?? ""));
  if (!id) throw new StepError("จอนับไม่มี data-count-id");
  if (STOCK.countId !== id) {
    STOCK.countId = id;
    const row = await prisma.posStockCount.findFirst({ where: { id, tenantId: T.tenantId }, select: { openedByUserId: true, createdAt: true } });
    STOCK.ours = !!row && row.openedByUserId === T.users.owner.userId && row.createdAt >= RUN_STARTED;
  }
}
/** บันทึก 2 รายการผ่าน UI (ครั้งเดียวต่อรอบ): แถวแรกที่ยังไม่นับ = SET 3 · แถวที่สองที่ยังไม่นับ = สแกนรหัส 2 ครั้งติดกัน (ADD 1 + ADD 1 = 2) */
async function recordTwoLines(page: Any): Promise<void> {
  if (STOCK.recorded) return;
  // F3: ไม่เขียนลงรอบที่สคริปต์ไม่ได้เปิดเอง (รอบนั้นไม่ถูกยกเลิกใน finally) — ถ่ายตามที่เป็นอยู่
  if (!STOCK.ours) throw new StepError(`รอบ ${STOCK.countId} เปิดอยู่ก่อนรอบนี้ — ไม่บันทึกรายการลงรอบของคนอื่น (ยกเลิกรอบนั้นก่อนถ่าย)`);
  const lines = await prisma.posStockCountLine.findMany({ where: { countId: STOCK.countId, tenantId: T.tenantId, countedQty: null }, select: { itemId: true }, take: 50 });
  const items = await prisma.invItem.findMany({ where: { tenantId: T.tenantId, id: { in: lines.map((l) => l.itemId) } }, select: { id: true, sku: true, barcode: true, name: true }, orderBy: { name: "asc" } });
  const codeOf = (i: { barcode: string | null; sku: string }) => i.barcode?.trim() || i.sku.trim();
  const withCode = items.filter((i) => codeOf(i).length > 0);
  if (withCode.length < 2) throw new StepError("รอบนับมีรายการที่ยังไม่นับ (มีรหัส) ไม่ถึง 2 รายการ");
  const [a, b] = [withCode[0]!, withCode[1]!];
  await clickEl(page, tid(`pos-stock-qty-${a.id}`)); // ปุ่ม "นับ" → ช่องกรอก (โฟกัสเอง)
  await typeInto(page, tid(`pos-stock-qty-${a.id}`), "3");
  await page.keyboard.press("Enter");
  const until = Date.now() + 15_000;
  for (;;) {
    const l = await prisma.posStockCountLine.findFirst({ where: { countId: STOCK.countId, itemId: a.id }, select: { countedQty: true } });
    if (l?.countedQty === 3) break;
    if (Date.now() > until) throw new StepError(`บันทึก SET ของ ${a.name} ไม่ถึงฐานใน 15 วิ`);
    await sleep(300);
  }
  // F1: สแกนรหัสเดียวกันสองครั้งติดกัน (Enter ซ้ำก่อนผลแรกกลับ) ต้องรวมเป็น 2 — คีย์ใหม่ทุกการสแกน
  await typeInto(page, tid("pos-stock-scan"), codeOf(b));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await visibleEl(page, tid("pos-stock-scan-result"), 0, 15_000);
  const untilB = Date.now() + 15_000;
  for (;;) {
    const l = await prisma.posStockCountLine.findFirst({ where: { countId: STOCK.countId, itemId: b.id }, select: { countedQty: true } });
    if (l?.countedQty === 2) break;
    if (Date.now() > untilB) throw new StepError(`สแกน ${b.name} สองครั้งติดกันได้ยอด ${l?.countedQty ?? "null"} (ต้องเป็น 2 — F1)`);
    await sleep(300);
  }
  STOCK.recorded = true;
  await sleep(800); // get สรุปหลังบันทึก
}
async function runStockState(page: Any, state: StockStateKey): Promise<void> {
  if (userKey !== "owner") {
    await visibleEl(page, tid("pos-stock-refusal"), 0, 15_000).catch(() => {
      throw new StepError("แคชเชียร์ไม่เห็นการ์ดปฏิเสธ pos-stock-refusal");
    });
    return;
  }
  await visibleEl(page, tid("pos-stock-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าสต็อกไม่ขึ้น (pos-stock-root) — ร้าน QC ผูกคลังหรือยัง?");
  });
  switch (state) {
    case "stock-default":
      return;
    case "stock-count-open":
      await ensureCountOpen(page);
      await recordTwoLines(page);
      return;
    case "stock-count-confirm":
      await ensureCountOpen(page);
      await clickEl(page, tid("pos-stock-count-confirm"));
      await visibleEl(page, tid("pos-stock-confirm-dialog"), 0, 10_000);
      return;
    case "stock-receive": {
      const [a, b] = await stockItems();
      await pickStockItem(page, "receive", a!);
      await pickStockItem(page, "receive", b!);
      await visibleEl(page, tid(`pos-stock-receive-row-${b!.id}`), 0, 5_000);
      return;
    }
    case "stock-adjust": {
      const [a] = await stockItems();
      await pickStockItem(page, "adjust", a!);
      await visibleEl(page, tid("pos-stock-adjust-item"), 0, 5_000);
      await clickEl(page, tid("pos-stock-adjust-minus"));
      await clickEl(page, tid("pos-stock-adjust-minus"));
      return;
    }
  }
}
/** finally/signal: ยกเลิกรอบที่รอบนี้เปิด (cancelStockCount ของบริการ · เจ้าของร้าน QC) — ผลอยู่ใน summary ไม่โยน · เรียกซ้ำได้ */
async function cancelRunCount(): Promise<void> {
  if (!STOCK.countId || STOCK.cancel) return;
  if (!STOCK.ours) {
    STOCK.cancel = { ok: true, detail: `รอบ ${STOCK.countId} มีอยู่ก่อนรอบนี้ — ไม่ยกเลิก` };
    return;
  }
  try {
    const { cancelStockCount } = await import("@/lib/modules/pos/stock-count");
    const own = T.users.owner;
    const mb = await prisma.membership.findUnique({ where: { id: own.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
    if (!mb) {
      STOCK.cancel = { ok: false, detail: "ไม่พบ membership เจ้าของร้าน" };
      return;
    }
    const actor = {
      userId: own.userId,
      role: mb.role as "OWNER" | "MANAGER" | "STAFF",
      unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
      permissions: mb.permissions && typeof mb.permissions === "object" ? (mb.permissions as Record<string, unknown>) : {},
    };
    const r = await cancelStockCount({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { countId: STOCK.countId, reason: "visual-pos", idempotencyKey: `${FIX.prefix}${process.pid}-cancel` });
    STOCK.cancel = r.ok ? { ok: true, detail: `ยกเลิกรอบนับ ${STOCK.countId}` } : r.code === "COUNT_NOT_OPEN" ? { ok: true, detail: `รอบ ${STOCK.countId} ปิดไปแล้ว` } : { ok: false, detail: `ยกเลิกรอบนับไม่สำเร็จ: ${r.code}` };
  } catch (e) {
    STOCK.cancel = { ok: false, detail: `ยกเลิกรอบนับล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  }
}
// ◂

// ═══════════════════ POS P1.9 U ▸ ขั้นตอนของหน้ากะ (เครื่อง SHIFTS_DEVICE_ID · เจ้าของร้าน) ═══════════════════
const SHIFTS = { id: "", opened: false, seeded: false, zNumber: 0, close: null as null | { ok: boolean; detail: string } };
let USER_COOKIES: Any[] = [];
const FLOAT_2000: [number, string][] = [[100000, "1"], [50000, "1"], [10000, "4"], [2000, "5"]];
const COUNT_DENOMS = [100000, 50000, 10000, 5000, 2000, 1000];
async function shiftsRow(): Promise<{ id: string; status: string; zNumber: number | null } | null> {
  return prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: SHIFTS_DEVICE_ID }, orderBy: { openedAt: "desc" }, select: { id: true, status: true, zNumber: true } });
}
/** กะของเครื่องนี้เปิดอยู่ (เปิดผ่านกล่อง 13A ถ้ายังไม่มี · ฿2,000 แยกแบงก์) */
async function ensureShiftsOpen(page: Any): Promise<void> {
  const cur = await visibleEl(page, tid("pos-shift-current"), 0, 4_000).then(() => true).catch(() => false);
  if (!cur) {
    if (SHIFTS.opened) throw new StepError("กะของรอบนี้ถูกปิดไปแล้ว — ลำดับสถานะผิด (current/close ต้องมาก่อน z)");
    await clickEl(page, tid("pos-shift-open-start"));
    await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
    for (const [d, n] of FLOAT_2000) await typeInto(page, tid(`pos-shift-open-denom-${d}`), n);
    const total = await page.$eval(tid("pos-shift-open-float"), (e: Element) => (e as HTMLInputElement).value).catch(() => "");
    if (total.replace(/[^\d.]/g, "") !== "2000") throw new StepError(`ยอดรวมเงินตั้งต้นในกล่องไม่ใช่ ฿2,000 (ได้ "${total}")`);
    await clickEl(page, tid("pos-shift-open-submit"));
    await visibleEl(page, tid("pos-shift-current"), 0, 15_000).catch(() => {
      throw new StepError("เปิดกะผ่านกล่องไม่สำเร็จ (ไม่เห็น pos-shift-current)");
    });
  }
  const row = await shiftsRow();
  if (!row || row.status !== "OPEN") throw new StepError("ไม่พบกะ OPEN ของเครื่องสถานะหน้ากะใน DB");
  SHIFTS.id = row.id;
  SHIFTS.opened = true;
}
/** ขายเงินสด 1 บิลผ่านหน้าขายของเครื่องเดียวกัน (แท็บแยก 1440 · ขั้นตอนเดียวกับ sale-done) */
async function shiftsSale(page: Any): Promise<void> {
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน)");
  const reg = await page.browser().newPage();
  try {
    await pinDevice(reg, SHIFTS_DEVICE_ID);
    await reg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await reg.setCookie(...USER_COOKIES);
    await reg.goto(`${BASE}${pathOf("register")}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(reg, tid("pos-reg-root"), 0, 15_000).catch(() => {
      throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root) ระหว่างขายบิลของกะ");
    });
    if (await shiftBannerStays(reg)) throw new StepError("หน้าขายของเครื่องสถานะหน้ากะยังขึ้นแถบเปิดกะ (deviceId ไม่ตรง?)");
    await cashSaleAmerLatte(reg, "desktop"); // R2 F6: ขั้นตอนเดียวกับสถานะ sale-done
  } finally {
    await reg.close().catch(() => undefined);
  }
}
/** ครั้งแรก: ขาย 1 บิล + นำเงินเข้า ฿100 "แลกแบงก์" ผ่านกล่อง · ครั้งถัดไป: ไม่เขียนเพิ่ม */
async function seedShiftOnce(page: Any): Promise<void> {
  if (SHIFTS.seeded) return;
  await shiftsSale(page);
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  await visibleEl(page, tid("pos-shift-current"), 0, 15_000);
  await clickEl(page, tid("pos-shift-move-open"));
  await visibleEl(page, tid("pos-shift-move-dialog"), 0, 10_000);
  await clickEl(page, tid("pos-shift-cash-in"));
  await typeInto(page, tid("pos-shift-move-amount"), "100");
  await typeInto(page, tid("pos-shift-move-reason"), "แลกแบงก์");
  await clickEl(page, tid("pos-shift-move-submit"));
  await visibleEl(page, tid("pos-shift-moves"), 0, 15_000).catch(() => {
    throw new StepError("นำเงินเข้า ฿100 แล้วไม่เห็นรายการเงินเข้า/ออก (pos-shift-moves)");
  });
  SHIFTS.seeded = true;
}
/** กรอกการ์ดปิดกะ = ยอดคาด − ฿15 (แบงก์มากไปน้อย · เศษเป็นเหรียญ) + เหตุผล — ไม่กดปิด */
async function fillCloseCard(page: Any): Promise<void> {
  const { computeReport } = await import("@/lib/modules/pos/shift");
  const sh = await prisma.posShift.findFirst({ where: { id: SHIFTS.id, tenantId: T.tenantId } });
  if (!sh || sh.status !== "OPEN") throw new StepError("กะของสถานะหน้ากะไม่ได้เปิดอยู่");
  const expected = (await computeReport(prisma, sh)).expectedCashSatang;
  if (expected === null || expected < 1500) throw new StepError(`ยอดคาดใช้ไม่ได้ (${expected})`);
  let rest = expected - 1500;
  await visibleEl(page, tid("pos-shift-close"), 0, 10_000);
  for (const d of COUNT_DENOMS) {
    const n = Math.floor(rest / d);
    rest -= n * d;
    if (n > 0) await typeInto(page, tid(`pos-shift-close-denom-${d}`), String(n));
  }
  if (rest > 0) await typeInto(page, tid("pos-shift-close-coins"), (rest / 100).toFixed(rest % 100 ? 2 : 0));
  await typeInto(page, tid("pos-shift-close-note"), "ทอนเกินให้ลูกค้า 1 บิล");
  await sleep(300);
}
async function runShiftsState(page: Any, state: ShiftsStateKey): Promise<void> {
  if (userKey !== "owner") {
    await visibleEl(page, tid("pos-shift-refusal"), 0, 15_000).catch(() => {
      throw new StepError("แคชเชียร์ไม่เห็นการ์ดปฏิเสธ pos-shift-refusal");
    });
    return;
  }
  await visibleEl(page, `${tid("pos-shift-open")},${tid("pos-shift-current")}`, 0, 15_000).catch(() => {
    throw new StepError("หน้ากะไม่ขึ้น (pos-shift-open / pos-shift-current)");
  });
  switch (state) {
    case "shifts-noshift":
      if (SHIFTS.opened) throw new StepError("เครื่องสถานะหน้ากะมีกะเปิดแล้ว — noshift ต้องมาก่อน");
      await clickEl(page, tid("pos-shift-open-start"));
      await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
      return;
    case "shifts-current":
      await ensureShiftsOpen(page);
      await seedShiftOnce(page);
      return;
    case "shifts-close":
      await ensureShiftsOpen(page);
      await seedShiftOnce(page);
      await fillCloseCard(page);
      return;
    case "shifts-z": {
      const row = SHIFTS.id ? await prisma.posShift.findFirst({ where: { id: SHIFTS.id, tenantId: T.tenantId }, select: { status: true, zNumber: true } }) : null;
      if (!row || row.status === "OPEN") {
        await ensureShiftsOpen(page);
        await seedShiftOnce(page);
        await fillCloseCard(page);
        await clickEl(page, tid("pos-shift-close-submit"));
        await visibleEl(page, tid("pos-shift-z"), 0, 20_000).catch(() => {
          throw new StepError("กดปิดกะแล้วไม่เห็นแผง Z (pos-shift-z)");
        });
        const after = await prisma.posShift.findFirst({ where: { id: SHIFTS.id, tenantId: T.tenantId }, select: { status: true, zNumber: true } });
        SHIFTS.zNumber = after?.zNumber ?? 0;
        SHIFTS.close = { ok: after?.status === "CLOSED", detail: `ปิดกะ ${SHIFTS.id} ผ่าน UI (สถานะ ${after?.status ?? "?"} · Z#${SHIFTS.zNumber})` };
        return;
      }
      SHIFTS.zNumber = SHIFTS.zNumber || (row.zNumber ?? 0);
      await clickEl(page, tid(`pos-shift-closed-${SHIFTS.zNumber}`));
      await visibleEl(page, tid("pos-shift-z"), 0, 15_000);
      return;
    }
  }
}
/** finally/signal: ปิดกะของสถานะหน้ากะถ้ายังเปิด (นับ = ยอดคาด · ผลใน summary ไม่โยน) */
/** R2 F2: หาจาก DB เสมอ (ไม่พึ่ง SHIFTS.opened/id) — ขั้นตอนพังหลังกดเปิด/ปิดกะแต่ก่อนบันทึก state ก็ยังปิดได้ · เรียกซ้ำได้ */
async function closeShiftsStateShift(): Promise<void> {
  if (!shiftsStatesOn) return;
  const open = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: SHIFTS_DEVICE_ID, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true } });
  if (!open) return; // ไม่มีกะค้าง (ไม่เคยเปิด หรือปิดผ่าน UI แล้ว)
  SHIFTS.opened = true;
  SHIFTS.id = open.id;
  SHIFTS.close = await closeShiftAsOwner(open.id, "shifts-close");
}
// ◂

// ═══════════════════ POS P1.16 U ▸ ข้อมูล + ขั้นตอนของหน้าบิลวันนี้ (เครื่อง BILLS_DEVICE_ID · actor = เจ้าของร้าน) ═══════════════════
const BILLS = { seeded: false, reused: false, shiftId: "", target: "", ids: {} as Record<string, string>, error: null as string | null, close: null as null | { ok: boolean; detail: string } };
const BILL_TAG = "(ภาพบิล QC)";
async function ownerActor(): Promise<{ userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> }> {
  const own = T.users.owner;
  const mb = await prisma.membership.findUnique({ where: { id: own.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mb) throw new StepError("ไม่พบ membership เจ้าของร้าน QC");
  return {
    userId: own.userId,
    role: mb.role as "OWNER" | "MANAGER" | "STAFF",
    unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
    permissions: mb.permissions && typeof mb.permissions === "object" ? (mb.permissions as Record<string, unknown>) : {},
  };
}
/** บิลภาพของวันนี้ที่มีอยู่แล้ว (รอบแคชเชียร์ใช้ซ้ำ) — ต้องครบทุกสถานะ + มีบิลปกติที่ยังไม่คืน */
async function existingBillsSet(): Promise<string | null> {
  const start = new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`));
  const rows = await prisma.posSale.findMany({
    where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", createdAt: { gte: start }, lines: { some: { name: { endsWith: BILL_TAG } } } },
    select: { id: true, status: true, refundedSatang: true, shiftId: true, payments: { select: { type: true } } },
    orderBy: { createdAt: "asc" },
  });
  const has = (f: (r: (typeof rows)[number]) => boolean) => rows.some(f);
  const ok =
    rows.length >= 6 &&
    has((r) => r.status === "VOIDED") &&
    has((r) => r.status === "REFUNDED") &&
    has((r) => r.status === "PAID" && r.refundedSatang > 0) &&
    has((r) => r.shiftId === null && r.payments.some((p) => p.type === "CASH"));
  return ok ? (rows.find((r) => r.status === "PAID" && r.refundedSatang === 0 && r.shiftId !== null)?.id ?? null) : null;
}
/** สร้างบิลชุดภาพครั้งเดียวต่อรอบ (ก่อนเปิด chromium) — พังไม่โยน (บันทึก BILLS.error · ทุกสถานะตกพร้อมเหตุผล) */
async function seedBillsOnce(): Promise<void> {
  if (BILLS.seeded || BILLS.error) return;
  try {
    if (userKey !== "owner") {
      const reuse = await existingBillsSet();
      if (reuse) {
        BILLS.target = reuse;
        BILLS.reused = true;
        BILLS.seeded = true;
        return;
      }
    }
    const { openShift } = await import("@/lib/modules/pos/shift");
    const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
    const { refundSale, saleForRefund } = await import("@/lib/modules/pos/refund");
    const { voidSaleByActor } = await import("@/lib/modules/pos/bills");
    const { createSale } = await import("@/lib/modules/pos/service");
    const { refundLineAmount, refundServiceCharge } = await import("@/lib/modules/pos/refund-math");
    const actor = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId, deviceId: BILLS_DEVICE_ID };
    const op = await openShift(ctx, actor, { deviceId: BILLS_DEVICE_ID, deviceLabel: "เครื่องภาพบิล QC", floatSatang: 100000 });
    if (!op.ok) throw new StepError(`เปิดกะของเครื่องภาพบิลไม่ได้: ${op.code}`);
    BILLS.shiftId = op.shift.id;
    let n = 0;
    const key = (k: string) => `${FIX.prefix}${process.pid}-bill-${k}-${++n}`;
    const sell = async (k: string, lines: [string, number, number][], pay: (grand: number) => [string, number][]): Promise<string> => {
      const cart = { lines: lines.map(([name, qty, unitPriceSatang]) => ({ name: `${name} ${BILL_TAG}`, qty, unitPriceSatang })) };
      const q = await quoteRegisterCart(ctx, actor, cart);
      if (!q.ok) throw new StepError(`quote บิล ${k}: ${q.code}`);
      const payMethods = pay(q.grandTotalSatang).map(([type, amountSatang]) => ({ type, amountSatang }));
      const cash = payMethods.filter((p) => p.type === "CASH").reduce((a, p) => a + p.amountSatang, 0);
      const r = await submitRegisterSale(ctx, actor, {
        ...cart,
        idempotencyKey: key(k),
        expectedGrandTotalSatang: q.grandTotalSatang,
        payMethods,
        ...(cash > 0 ? { cashReceivedSatang: Math.ceil(cash / 10000) * 10000 } : {}),
      } as never);
      if (!r.ok) throw new StepError(`ขายบิล ${k}: ${r.code}`);
      BILLS.ids[k] = r.saleId;
      return r.saleId;
    };
    /** คืน qty ต่อบรรทัด (ยอดคืนตามสูตรเดียวกับ refund.ts) */
    const refund = async (k: string, saleId: string, pick: (lines: { lineId: string; qty: number }[]) => { lineId: string; qty: number }[], type: "CASH" | "PROMPTPAY") => {
      const fr = await saleForRefund(ctx, actor, { saleId });
      if (!fr.ok) throw new StepError(`saleForRefund ${k}: ${fr.code}`);
      const want = pick(fr.lines.map((l) => ({ lineId: l.lineId, qty: l.refundableQty })));
      const byId = new Map(fr.lines.map((l) => [l.lineId, l]));
      const amounts = want.map((w) => {
        const l = byId.get(w.lineId)!;
        return refundLineAmount(l.netSatang, l.qty, l.refundedQty, l.refundedSatang, w.qty);
      });
      const linesSum = amounts.reduce((a, b) => a + b, 0);
      const full = fr.lines.every((l) => l.refundedQty + (want.find((w) => w.lineId === l.lineId)?.qty ?? 0) >= l.qty);
      const total = linesSum + refundServiceCharge(fr.sale.serviceChargeSatang, linesSum, fr.sale.netTotalSatang, fr.sale.serviceChargeRefundedSatang, full);
      const r = await refundSale(ctx, actor, {
        saleId,
        lines: want,
        payMethods: total > 0 ? [{ type, amountSatang: total }] : [],
        reasonCode: "CHANGED_MIND",
        reason: "ลูกค้าเปลี่ยนใจ (ภาพ QC)",
        deviceId: BILLS_DEVICE_ID,
        idempotencyKey: key(`r${k}`),
      });
      if (!r.ok) throw new StepError(`คืนเงินบิล ${k}: ${r.code}`);
    };
    // ลำดับเวลา: เก่า → ใหม่ (รายการเรียงใหม่ → เก่า)
    await sell("mixed", [["ลาเต้เย็น", 2, 7500], ["บราวนี่", 1, 6500]], (g) => [["PROMPTPAY", g - 10000], ["CASH", 10000]]);
    const partial = await sell("partial", [["ครัวซองต์อัลมอนด์", 1, 8500], ["อเมริกาโน่ร้อน", 2, 7500], ["แซนด์วิชแฮมชีส", 2, 9500]], (g) => [["PROMPTPAY", g]]);
    const full = await sell("full", [["เค้กส้ม", 1, 9000]], (g) => [["CASH", g]]);
    const voided = await sell("void", [["ชาไทยเย็น", 2, 6000]], (g) => [["CASH", g]]);
    {
      const off = await createSale({
        tenantId: T.tenantId,
        unitId,
        systemId: SYS,
        sourceModule: "POS",
        shiftId: null,
        soldByUserId: actor.userId,
        idempotencyKey: key("offshift"),
        lines: [{ name: `โกโก้เย็น ${BILL_TAG}`, qty: 1, unitPriceSatang: 6500 }],
        payMethods: [{ type: "CASH", amountSatang: 6500 }],
      } as never);
      BILLS.ids.offshift = off.saleId;
    }
    await sell("cash", [["มัทฉะลาเต้", 1, 9000], ["คุกกี้", 2, 3500]], (g) => [["CASH", g]]);
    const target = await sell("target", [["ครัวซองต์อัลมอนด์", 1, 8500], ["ลาเต้เย็น", 2, 7500], ["อเมริกาโน่ร้อน", 1, 6500], ["บราวนี่", 2, 6500]], (g) => [["CASH", g]]);
    await refund("partial", partial, (ls) => [{ lineId: ls[0]!.lineId, qty: 1 }], "PROMPTPAY");
    await refund("full", full, (ls) => ls.filter((l) => l.qty > 0), "CASH");
    const v = await voidSaleByActor(ctx, actor, { unitId, saleId: voided, reason: "ลูกค้ายกเลิกออเดอร์ (ภาพ QC)", idempotencyKey: key("void") });
    if (!v.ok) throw new StepError(`ยกเลิกบิล: ${v.code}`);
    // ระบายคิว (ใบกำกับอย่างย่อ · แต้ม · ใบลดหนี้) ให้ลิ้นชักมีแถว "ลงบัญชีอัตโนมัติ"
    try {
      const { drainAll } = await import("@/lib/outbox-consumers");
      await drainAll();
    } catch {
      /* เซิร์ฟเวอร์ QC ระบายเองภายหลัง */
    }
    BILLS.target = target;
    BILLS.seeded = true;
  } catch (e) {
    BILLS.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** แตะบิลเป้าหมาย (แถวที่ md+ · การ์ดที่ 390) แล้วรอลิ้นชักที่มีไทม์ไลน์ */
async function openTargetBill(page: Any): Promise<void> {
  await visibleEl(page, tid("pos-bills-list"), 0, 15_000);
  await clickEl(page, `[data-bill-id="${BILLS.target}"]`);
  await visibleEl(page, tid("pos-bills-timeline"), 0, 15_000).catch(() => {
    throw new StepError("แตะบิลแล้วไม่เห็นลิ้นชักบิล (pos-bills-timeline)");
  });
}
async function runBillsState(page: Any, state: BillsStateKey): Promise<void> {
  if (state === "bills-empty") {
    await visibleEl(page, tid("pos-bills-empty"), 0, 15_000).catch(() => {
      throw new StepError(`วันที่ ${BILLS_EMPTY_DATE} ไม่ขึ้นข้อความว่าง (pos-bills-empty)`);
    });
    return;
  }
  if (BILLS.error || !BILLS.target) throw new StepError(`ไม่มีบิลชุดภาพ: ${BILLS.error ?? "ยังไม่ได้สร้าง"}`);
  await visibleEl(page, tid("pos-bills-list"), 0, 15_000).catch(() => {
    throw new StepError("หน้าบิลวันนี้ไม่ขึ้น (pos-bills-list)");
  });
  await visibleEl(page, `[data-bill-id="${BILLS.target}"]`, 0, 15_000).catch(() => {
    throw new StepError("ไม่เห็นบิลเป้าหมายในหน้าแรกของรายการ");
  });
  const n = await page.$$eval('[data-testid="pos-bills-row"],[data-testid="pos-bills-card"]', (els: Element[]) => els.filter((e) => e.getClientRects().length > 0).length).catch(() => 0);
  if (n < 6) throw new StepError(`รายการวันนี้มี ${n} บิล (คาด ≥ 6)`);
  if (state === "bills-list") return;
  await openTargetBill(page);
  if (state === "bills-drawer") return;
  if (state === "bills-void") {
    if (userKey !== "owner") {
      await visibleEl(page, tid("pos-bills-void-hint"), 0, 10_000).catch(() => {
        throw new StepError("แคชเชียร์ไม่เห็นคำอธิบายปุ่มยกเลิกที่ปิด (pos-bills-void-hint)");
      });
      return;
    }
    await clickEl(page, tid("pos-bills-void-open"));
    await visibleEl(page, tid("pos-bills-void"), 0, 10_000);
    await typeInto(page, tid("pos-bills-void-reason"), "ลูกค้ายกเลิกออเดอร์ ทำรายการซ้ำ");
    return;
  }
  // bills-refund
  if (userKey !== "owner") {
    const hasRefund = await visibleEl(page, tid("pos-bills-refund-open"), 0, 1_500).then(() => true).catch(() => false);
    if (hasRefund) throw new StepError("แคชเชียร์เห็นปุ่มคืนเงิน (ต้องซ่อน — ไม่มี pos.sale.refund)");
    return;
  }
  await clickEl(page, tid("pos-bills-refund-open"));
  await visibleEl(page, tid("pos-bills-refund-line"), 0, 15_000).catch(() => {
    throw new StepError("หน้าต่างคืนเงินไม่ขึ้นรายการ (pos-bills-refund-line)");
  });
  await clickEl(page, tid("pos-bills-refund-line"));
  await clickEl(page, tid("pos-bills-refund-method-cash"));
  await page
    .waitForFunction(() => !(document.querySelector('[data-testid="pos-bills-refund-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 5_000 })
    .catch(() => {
      throw new StepError("เลือก 1 บรรทัดแล้วปุ่มยืนยันคืนเงินยังปิด");
    });
}
/** finally/signal: ปิดกะของเครื่องภาพบิลถ้ายังเปิด (หาจาก DB · เรียกซ้ำได้ · ผลใน summary ไม่โยน) */
async function closeBillsShift(): Promise<void> {
  if (!billsStatesOn || BILLS.close) return;
  const open = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: BILLS_DEVICE_ID, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true } });
  if (!open) return;
  BILLS.shiftId = open.id;
  BILLS.close = await closeShiftAsOwner(open.id, "bills-close");
}
// ◂

/** รอบ 3: ตัวนับเลขใบเสร็จ (เดือนนี้) ที่ตามหลังเลขที่ออกแล้วของสาขาในร้าน QC รอบนี้ → ["<unit> seq N < เลข M"] */
let COUNTER_LAG: string[] = [];
async function receiptCounterLag(): Promise<string[]> {
  const out: string[] = [];
  const rows = await prisma.posReceiptCounter.findMany({ where: { tenantId: T.tenantId } }).catch(() => []);
  for (const c of rows) {
    const top = await prisma.posSale.findFirst({ where: { unitId: c.unitId, docType: "SALE", receiptNo: { startsWith: `${c.period}-` } }, orderBy: { receiptNo: "desc" }, select: { receiptNo: true } }).catch(() => null);
    const max = top?.receiptNo ? Number(top.receiptNo.slice(c.period.length + 1)) : 0;
    if (Number.isFinite(max) && max > c.seq) out.push(`${c.unitId} ${c.period} seq ${c.seq} < เลข ${max}`);
  }
  return out;
}
// ═══════════════════ POS P1.11U ▸ ข้อมูล + ขั้นตอนของหน้าใบเสร็จออนไลน์ (เครื่อง RPUB_DEVICE_ID · actor = เจ้าของร้าน) ═══════════════════
const RPUB = {
  seeded: false,
  reused: [] as string[],
  error: null as string | null,
  shiftId: "",
  openedShift: false,
  sales: {} as Record<string, string>,
  tokens: {} as Record<string, string>,
  actions: {} as Record<string, unknown>,
  close: null as null | { ok: boolean; detail: string },
  cleanup: null as null | { issues: number; taxRequests: number; outbox: number; kanbanCards: string[]; error?: string },
  /** รอบ 2 (มติ 3b): สมาชิก QC ของบิล paid (แต้ม + ปุ่มให้คะแนนแบบภาพ 11C) */
  memberId: "",
  /** รอบ 2 (มติ 3b): เปิด posAbbreviatedInvoice ของสมุด QC ชั่วคราวผ่าน saveDocSettings (คืนค่าเดิมใน finally) */
  abb: null as null | { bookId: string; prev: unknown; toggled: boolean; vatRegistered: boolean; hasTaxId: boolean; restored?: string; taxIdSet?: boolean; prevView?: unknown; createdRowId?: string; taxIdRestored?: string; posAbbreviatedInvoice?: boolean },
};
/** F3: คีย์กันซ้ำของ "ชุดวันนี้" (วันที่ไทย) — รอบซ้ำวันเดียวกันใช้บิลชุดเดิม (แบบ existingBillsSet ของ P1.16) · ข้ามวัน = ชุดใหม่ 1 ชุด */
const RPUB_PREFIX = `posqc-p111u-${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "")}-`;
/** บิลชุดภาพของวันนี้ที่ยังอยู่ในสถานะที่ภาพต้องการ (paid = PAID ไม่มีคืน · partial = PAID คืนบางส่วน · voided = VOIDED) */
async function existingRpubSet(): Promise<Record<string, string>> {
  const start = new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`));
  const rows = await prisma.posSale.findMany({
    // รอบ 3: submitRegisterSale เก็บคีย์เป็น "reg2:<คีย์>" — ค้นทั้งสองรูป (รอบ 1–2 ค้นแค่ไม่มีคำนำหน้า ⇒ ไม่เคยเจอชุดเดิม · ขายใหม่ทุกรอบ)
    where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", OR: [{ idempotencyKey: { startsWith: RPUB_PREFIX } }, { idempotencyKey: { startsWith: `reg2:${RPUB_PREFIX}` } }], createdAt: { gte: start } },
    select: { id: true, status: true, refundedSatang: true, idempotencyKey: true, memberId: true },
    orderBy: { createdAt: "desc" },
  });
  const out: Record<string, string> = {};
  for (const r of rows) {
    const kind = r.idempotencyKey.replace(/^reg2:/, "").slice(RPUB_PREFIX.length).split("-")[0] ?? "";
    if (out[kind]) continue;
    const ok =
      kind === "paid" ? r.status === "PAID" && r.refundedSatang === 0 && r.memberId !== null : kind === "partial" ? r.status === "PAID" && r.refundedSatang > 0 : kind === "voided" ? r.status === "VOIDED" : false;
    if (ok) out[kind] = r.id;
  }
  return out;
}
/** สร้างบิลชุดภาพครั้งเดียว (ก่อนเปิด chromium) ผ่านบริการหน้าขาย — พังไม่โยน (RPUB.error · ทุกสถานะตกพร้อมเหตุผล) */
async function seedRpubOnce(): Promise<void> {
  if (RPUB.seeded || RPUB.error) return;
  const need = new Set(rpubPlan.map((st) => st.bill).filter((b) => b !== "none"));
  try {
    if (need.size) {
      // รอบ 2 (มติ 3b): ใบกำกับอย่างย่อต้องเปิดที่สมุดที่ผูก POS — เปิด posAbbreviated ชั่วคราวผ่านตัวบันทึกตั้งค่าบัญชีเดิม (saveDocSettings) · คืนค่าใน finally
      {
        const account = await import("@/lib/modules/account");
        const { saveDocSettings } = await import("@/lib/modules/account/doc-settings");
        const { parseDocSettings } = await import("@/lib/modules/account/settings-schema");
        const bookId = await account.posAccountSystemId(T.tenantId, SYS);
        if (bookId) {
          const row = await prisma.accountSettings.findFirst({ where: { systemId: bookId, tenantId: T.tenantId }, select: { docConfig: true, taxId: true } });
          const prev = parseDocSettings(row?.docConfig ?? null).autoTaxInvoice;
          let toggled = false;
          if (row && !prev.posAbbreviated) {
            const sv = await saveDocSettings({ tenantId: T.tenantId, systemId: bookId }, { autoTaxInvoice: { ...prev, posAbbreviated: true } });
            if (!sv.ok) throw new StepError(`เปิดใบกำกับอย่างย่อของสมุด QC ไม่ได้: ${sv.reason}`);
            toggled = true;
          }
          // รอบ 3 (มติ 2): ตัวตัดสินจริงคือ receiptKindOf = vatRegistered + posAbbreviatedInvoice + **taxId ของสมุด** + VAT ของบิล —
          //   สมุด QC ไม่มีเลขผู้เสียภาษี (hasTaxId:false ในรอบ vis36) ⇒ ตั้งเลขผู้เสียภาษีชั่วคราวผ่านตัวบันทึก "ข้อมูลกิจการ" เดิม (account saveSettings
          //   ด้วยค่าเดิมทั้งก้อน + taxId) แล้วคืนค่าเดิมใน finally · อ่าน vatConfigOf/taxId ซ้ำและยืนยันก่อนขายบิล
          const hasTaxId = !!row?.taxId?.trim();
          RPUB.abb = { bookId, prev, toggled, vatRegistered: false, hasTaxId };
          if (!hasTaxId) {
            // สมุด QC ไม่มีแถว AccountSettings เลย (พบรอบ 3: ค่า VAT มาจากค่าปริยาย) ⇒ saveSettings สร้างแถว → finally ลบแถวที่รอบนี้สร้าง ·
            //   มีแถวแต่ไม่มี taxId ⇒ finally บันทึกค่าเดิมทั้งก้อนกลับ
            const { getSettings, saveSettings } = await import("@/lib/modules/account/service");
            const view = await getSettings(T.tenantId, bookId);
            RPUB.abb.prevView = view;
            const saved = await saveSettings(T.tenantId, bookId, { ...view, taxId: "0105561234567" });
            if (!row) RPUB.abb.createdRowId = saved.id;
            RPUB.abb.taxIdSet = true;
          }
          const vat = await account.vatConfigOf(bookId);
          const again = await prisma.accountSettings.findFirst({ where: { systemId: bookId, tenantId: T.tenantId }, select: { taxId: true } });
          RPUB.abb.vatRegistered = vat.vatRegistered;
          RPUB.abb.posAbbreviatedInvoice = vat.posAbbreviatedInvoice;
          RPUB.abb.hasTaxId = !!again?.taxId?.trim();
          if (!vat.vatRegistered || !vat.posAbbreviatedInvoice || !RPUB.abb.hasTaxId)
            throw new StepError(`สมุด QC ยังออกใบกำกับอย่างย่อไม่ได้ (vatRegistered ${vat.vatRegistered} · posAbbreviatedInvoice ${vat.posAbbreviatedInvoice} · taxId ${RPUB.abb.hasTaxId})`);
        }
      }
      const mem = await prisma.customer.findFirst({ where: { tenantId: T.tenantId, phone: PQC.coffee.member.phone }, select: { id: true } });
      if (!mem) throw new StepError(`ไม่พบสมาชิก QC ${PQC.coffee.member.phone} (seed-pos-qc)`);
      RPUB.memberId = mem.id;
      const { openShift } = await import("@/lib/modules/pos/shift");
      const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
      const { refundSale, saleForRefund } = await import("@/lib/modules/pos/refund");
      const { voidSaleByActor } = await import("@/lib/modules/pos/bills");
      const { refundLineAmount, refundServiceCharge } = await import("@/lib/modules/pos/refund-math");
      const { publicReceipt } = await import("@/lib/modules/pos/public-receipt");
      const actor = await ownerActor();
      const ctx = { tenantId: T.tenantId, systemId: SYS, unitId, deviceId: RPUB_DEVICE_ID };
      const have = await existingRpubSet();
      // รอบ 3: บิล paid ของวันนี้ใช้ซ้ำได้เฉพาะเมื่อขายหลังสมุดพร้อม (มีเลขใบกำกับอย่างย่อ + ขอใบกำกับเต็มรูปได้) — ไม่งั้นขายใหม่หลังตั้งค่า
      if (have.paid) {
        const tok = (await prisma.posSale.findFirst({ where: { id: have.paid, tenantId: T.tenantId }, select: { publicToken: true } }))?.publicToken;
        const pr = tok ? await publicReceipt(tok) : null;
        if (!pr?.ok || !pr.receipt.abbNo || pr.receipt.actions.taxInvoice !== "AVAILABLE") delete have.paid;
      }
      for (const [k, id] of Object.entries(have)) if (need.has(k as "paid")) {
        RPUB.sales[k] = id;
        RPUB.reused.push(k);
      }
      const missing = [...need].filter((b) => !RPUB.sales[b]);
      if (missing.length) {
        // กะของเครื่องภาพ: ใช้กะที่เปิดค้างอยู่ (รอบที่ตายกลางทาง) · ไม่มี = เปิดใหม่และปิดใน finally
        const cur = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: RPUB_DEVICE_ID, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true } });
        if (cur) RPUB.shiftId = cur.id;
        else {
          const op = await openShift(ctx, actor, { deviceId: RPUB_DEVICE_ID, deviceLabel: "เครื่องภาพใบเสร็จออนไลน์ QC", floatSatang: 100000 });
          if (!op.ok) throw new StepError(`เปิดกะของเครื่องภาพใบเสร็จไม่ได้: ${op.code}`);
          RPUB.shiftId = op.shift.id;
        }
        RPUB.openedShift = true;
      }
      const prods = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, systemId: SYS, archivedAt: null }, select: { id: true, name: true } });
      const idOf = (n: string) => {
        const id = prods.find((r) => r.name === n)?.id;
        if (!id) throw new StepError(`ไม่พบสินค้า QC "${n}" (seed-pos-qc)`);
        return id;
      };
      // ใกล้ภาพ 11C: ลาเต้ ×2 · อเมริกาโน่ · ครัวซองต์ − ส่วนลดท้ายบิล ฿10 · เงินสด ฿100 + PromptPay ส่วนที่เหลือ (สินค้ามี VAT ของร้าน QC)
      const cart0 = { lines: [{ productId: idOf("ลาเต้ร้อน"), qty: 2 }, { productId: idOf("อเมริกาโน่เย็น"), qty: 1 }, { productId: idOf("ครัวซองต์เนยสด"), qty: 1 }], billDiscount: { type: "AMOUNT" as const, value: 1000 } };
      const sell = async (k: string): Promise<string> => {
        // รอบ 2 (มติ 3b): บิล paid ผูกสมาชิก QC ⇒ หน้าแสดง "ดูแต้มของฉัน" + "ให้คะแนนร้าน" แบบภาพ 11C
        const cart = k === "paid" ? { ...cart0, memberId: RPUB.memberId } : cart0;
        const q = await quoteRegisterCart(ctx, actor, cart);
        if (!q.ok) throw new StepError(`quote บิล ${k}: ${q.code}`);
        const cash = Math.min(10000, q.grandTotalSatang);
        const payMethods = [{ type: "CASH", amountSatang: cash }, ...(q.grandTotalSatang > cash ? [{ type: "PROMPTPAY", amountSatang: q.grandTotalSatang - cash }] : [])];
        const r = await submitRegisterSale(ctx, actor, { ...cart, idempotencyKey: `${RPUB_PREFIX}${k}-${process.pid}`, expectedGrandTotalSatang: q.grandTotalSatang, payMethods, cashReceivedSatang: cash } as never);
        if (!r.ok) throw new StepError(`ขายบิล ${k}: ${r.code}`);
        RPUB.sales[k] = r.saleId;
        return r.saleId;
      };
      const fresh = new Set<string>();
      for (const b of ["paid", "partial", "voided"] as const)
        if (need.has(b) && !RPUB.sales[b]) {
          await sell(b);
          fresh.add(b);
        }
      if (fresh.has("partial")) {
        const saleId = RPUB.sales.partial;
        const fr = await saleForRefund(ctx, actor, { saleId });
        if (!fr.ok) throw new StepError(`saleForRefund: ${fr.code}`);
        const l = fr.lines[0]!;
        const amount = refundLineAmount(l.netSatang, l.qty, l.refundedQty, l.refundedSatang, 1);
        const total = amount + refundServiceCharge(fr.sale.serviceChargeSatang, amount, fr.sale.netTotalSatang, fr.sale.serviceChargeRefundedSatang, fr.lines.length === 1 && l.qty === 1);
        const r = await refundSale(ctx, actor, { saleId, lines: [{ lineId: l.lineId, qty: 1 }], payMethods: total > 0 ? [{ type: "CASH", amountSatang: total }] : [], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ (ภาพใบเสร็จ QC)", deviceId: RPUB_DEVICE_ID, idempotencyKey: `${RPUB_PREFIX}partial-refund-${process.pid}` });
        if (!r.ok) throw new StepError(`คืนเงินบางส่วน: ${r.code}`);
      }
      if (fresh.has("voided")) {
        const v = await voidSaleByActor(ctx, actor, { unitId, saleId: RPUB.sales.voided!, reason: "ลูกค้ายกเลิกออเดอร์ (ภาพใบเสร็จ QC)", idempotencyKey: `${RPUB_PREFIX}voided-void-${process.pid}` });
        if (!v.ok) throw new StepError(`ยกเลิกบิล: ${v.code}`);
      }
      try {
        const { drainAll } = await import("@/lib/outbox-consumers");
        await drainAll(); // ใบกำกับอย่างย่อ (abbNo) · แต้ม
      } catch {
        /* เซิร์ฟเวอร์ QC ระบายเองภายหลัง */
      }
      // โทเคน: อ่านด้วย prisma (createSale ตั้งใน tx ของบิล) · ไม่มี = ensureReceiptToken (บิลเก่าแบบ lazy)
      const { ensureReceiptToken } = await import("@/lib/modules/pos/receipt-token");
      for (const [k, id] of Object.entries(RPUB.sales)) {
        const row = await prisma.posSale.findFirst({ where: { id, tenantId: T.tenantId }, select: { publicToken: true } });
        const tok = row?.publicToken ?? (await ensureReceiptToken(T.tenantId, id));
        if (!tok) throw new StepError(`บิล ${k} ไม่มีโทเคนใบเสร็จ`);
        RPUB.tokens[k] = tok;
        const pr = await publicReceipt(tok);
        RPUB.actions[k] = pr.ok ? { status: pr.receipt.status, ...pr.receipt.actions, abbNo: pr.receipt.abbNo ?? null, vat: !!pr.receipt.vat } : { code: pr.code };
      }
    }
    if (rpubPlan.some((st) => st.bill === "none")) {
      const clash = await prisma.posSale.findFirst({ where: { publicToken: RPUB_MISSING_TOKEN }, select: { id: true } });
      if (clash) throw new StepError(`โทเคนทดสอบ ${RPUB_MISSING_TOKEN} มีบิลจริงอยู่ — เปลี่ยนค่าคงที่`);
    }
    RPUB.seeded = true;
  } catch (e) {
    RPUB.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
const rpubPath = (st: RpubStateKey): string => {
  const bill = RPUB_STATE_PLAN.find((x) => x.key === st)!.bill;
  const tok = bill === "none" ? RPUB_MISSING_TOKEN : (RPUB.tokens[bill] ?? RPUB_MISSING_TOKEN);
  return `/r/${tok}${LOCALE_EN ? "?lang=en" : ""}`;
};
async function runRpubState(page: Any, state: RpubStateKey): Promise<void> {
  if (state === "rpub-not-found") {
    await visibleEl(page, tid("pos-rpub-not-found"), 0, 15_000).catch(() => {
      throw new StepError("โทเคนที่ไม่มีจริงไม่ขึ้นหน้า \"ไม่พบใบเสร็จ\" (pos-rpub-not-found)");
    });
    return;
  }
  if (RPUB.error || !RPUB.seeded) throw new StepError(`ไม่มีบิลชุดภาพใบเสร็จ: ${RPUB.error ?? "ยังไม่ได้สร้าง"}`);
  await visibleEl(page, tid("pos-rpub-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าใบเสร็จออนไลน์ไม่ขึ้น (pos-rpub-root)");
  });
  const want: Record<string, string> = { "rpub-refunded-partial": "REFUNDED_PARTIAL", "rpub-voided": "VOIDED" };
  const chip = await page.$eval(tid("pos-rpub-status"), (el: Element) => el.getAttribute("data-status")).catch(() => null);
  if (chip !== (want[state] ?? "PAID")) throw new StepError(`ชิปสถานะ = ${chip} (คาด ${want[state] ?? "PAID"})`);
  if (state === "rpub-taxinvoice-form") {
    await clickEl(page, tid("pos-rpub-taxinvoice-open")).catch(() => {
      throw new StepError(`ไม่มีปุ่มขอใบกำกับภาษีเต็มรูป (actions ของบิล = ${JSON.stringify(RPUB.actions.paid ?? null)})`);
    });
    await visibleEl(page, tid("pos-rpub-taxinvoice-sheet"), 0, 10_000);
    await typeInto(page, tid("pos-rpub-taxinvoice-name"), "บริษัท ทดสอบภาพ จำกัด");
    await typeInto(page, tid("pos-rpub-taxinvoice-taxid"), "0105561234567");
    await typeInto(page, tid("pos-rpub-taxinvoice-address"), "88/8 ถ.เพชรเกษม ต.หัวหิน อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110");
    await typeInto(page, tid("pos-rpub-taxinvoice-email"), "acc@example.com");
    return;
  }
  if (state === "rpub-issue-sent") {
    await clickEl(page, tid("pos-rpub-issue-open"));
    await visibleEl(page, tid("pos-rpub-issue-sheet"), 0, 10_000);
    await typeInto(page, tid("pos-rpub-issue-message"), "ได้ครัวซองต์ไม่ครบ ขาดไป 1 ชิ้น (ภาพ QC)");
    await typeInto(page, tid("pos-rpub-issue-contact"), "081-000-0000");
    await clickEl(page, tid("pos-rpub-issue-submit"));
    await visibleEl(page, tid("pos-rpub-issue-sent"), 0, 15_000).catch(async () => {
      const err = await page.$eval(tid("pos-rpub-issue-error"), (el: Element) => el.textContent).catch(() => null);
      throw new StepError(`ส่งแจ้งปัญหาแล้วไม่ขึ้น "ส่งแล้ว"${err ? ` — ${err}` : ""}`);
    });
  }
}
/** finally/signal: ลบแถวแจ้งปัญหา/คำขอใบกำกับของบิลชุดนี้ (+ OutboxEvent ของแจ้งปัญหา) แล้วปิดกะ — เรียกซ้ำได้ · ผลใน summary ไม่โยน */
async function cleanRpub(): Promise<void> {
  if (!rpubOn || RPUB.cleanup) return;
  // รอบ 3: คืนข้อมูลกิจการเดิมของสมุด QC (taxId ว่างเหมือนก่อนรอบ) — ก่อนคืน posAbbreviated
  if (RPUB.abb?.taxIdSet && !RPUB.abb.taxIdRestored) {
    try {
      if (RPUB.abb.createdRowId) {
        await prisma.accountSettings.deleteMany({ where: { id: RPUB.abb.createdRowId, tenantId: T.tenantId, systemId: RPUB.abb.bookId } });
      } else {
        const { saveSettings } = await import("@/lib/modules/account/service");
        await saveSettings(T.tenantId, RPUB.abb.bookId, RPUB.abb.prevView as never);
      }
      RPUB.abb.taxIdRestored = "ok";
    } catch (e) {
      RPUB.abb.taxIdRestored = `fail: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
    }
  }
  // รอบ 2 (มติ 3b): คืนค่า posAbbreviated เดิมของสมุด QC (เฉพาะเมื่อรอบนี้เป็นคนเปิด)
  if (RPUB.abb?.toggled && !RPUB.abb.restored) {
    try {
      const { saveDocSettings } = await import("@/lib/modules/account/doc-settings");
      const sv = await saveDocSettings({ tenantId: T.tenantId, systemId: RPUB.abb.bookId }, { autoTaxInvoice: RPUB.abb.prev as never });
      RPUB.abb.restored = sv.ok ? "ok" : `fail: ${sv.reason}`;
    } catch (e) {
      RPUB.abb.restored = `fail: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
    }
  }
  const ids = Object.values(RPUB.sales);
  try {
    let issues = 0;
    let taxRequests = 0;
    let outbox = 0;
    let kanbanCards: string[] = [];
    if (ids.length) {
      const rows = await prisma.posReceiptIssue.findMany({ where: { tenantId: T.tenantId, saleId: { in: ids } }, select: { id: true, kanbanCardId: true } });
      // F3: การ์ดบอร์ดงานที่ consumer เปิดให้แจ้งปัญหาของชุดภาพ (kanbanCardId หรือ sourceKey "pos-receipt-issue:<issueId>") → เก็บเข้าคลัง (archiveCard)
      const cards = await prisma.kanbanCard.findMany({
        where: { tenantId: T.tenantId, status: "ACTIVE", OR: [{ id: { in: rows.map((r) => r.kanbanCardId).filter((x): x is string => !!x) } }, { sourceKey: { in: rows.map((r) => `pos-receipt-issue:${r.id}`) } }] },
        select: { id: true, systemId: true },
      });
      if (cards.length) {
        const { archiveCard } = await import("@/lib/modules/kanban/service");
        for (const c of cards) await archiveCard(T.tenantId, c.systemId, c.id, T.users.owner.userId);
      }
      kanbanCards = cards.map((c) => c.id);
      for (const r of rows) outbox += (await prisma.outboxEvent.deleteMany({ where: { tenantId: T.tenantId, type: "pos.receipt.issue_reported", payload: { path: ["issueId"], equals: r.id } } })).count;
      issues = (await prisma.posReceiptIssue.deleteMany({ where: { tenantId: T.tenantId, saleId: { in: ids } } })).count;
      const reqs = await prisma.posTaxInvoiceRequest.findMany({ where: { tenantId: T.tenantId, saleId: { in: ids } }, select: { id: true } });
      for (const r of reqs) outbox += (await prisma.outboxEvent.deleteMany({ where: { tenantId: T.tenantId, type: "pos.receipt.taxInvoiceRequested", payload: { path: ["requestId"], equals: r.id } } })).count;
      taxRequests = (await prisma.posTaxInvoiceRequest.deleteMany({ where: { tenantId: T.tenantId, saleId: { in: ids } } })).count;
    }
    RPUB.cleanup = { issues, taxRequests, outbox, kanbanCards };
  } catch (e) {
    RPUB.cleanup = { issues: 0, taxRequests: 0, outbox: 0, kanbanCards: [], error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
  if (!RPUB.close && RPUB.openedShift && RPUB.shiftId) RPUB.close = await closeShiftAsOwner(RPUB.shiftId, "rpub-close"); // ปิดเฉพาะกะที่รอบนี้ใช้ขาย
}
const rpubCleanupLine = () =>
  RPUB.cleanup
    ? `${RPUB.cleanup.error ? "⚠️" : "🧹"} ใบเสร็จออนไลน์: ลบแจ้งปัญหา ${RPUB.cleanup.issues} · คำขอใบกำกับ ${RPUB.cleanup.taxRequests} · OutboxEvent ${RPUB.cleanup.outbox}${RPUB.cleanup.kanbanCards.length ? ` · เก็บการ์ดบอร์ดงานเข้าคลัง ${RPUB.cleanup.kanbanCards.length}` : ""}${RPUB.cleanup.error ? ` · ${RPUB.cleanup.error}` : ""}${RPUB.close ? ` · ${RPUB.close.detail}` : ""}${RPUB.abb?.toggled ? ` · คืนค่าใบกำกับอย่างย่อของสมุด QC: ${RPUB.abb.restored ?? "ยังไม่คืน"}` : ""}${RPUB.abb?.taxIdSet ? ` · คืนข้อมูลกิจการ (taxId) ของสมุด QC: ${RPUB.abb.taxIdRestored ?? "ยังไม่คืน"}` : ""}`
    : "";
// ◂
// ═══════════════════ POS P1.10 U ▸ ข้อมูล + ขั้นตอนของหน้าตั้งค่า (เครื่อง SETTINGS_DEVICE_CODES · actor = เจ้าของร้าน) ═══════════════════
const SETTINGS = {
  seeded: false,
  error: null as string | null,
  devices: [] as { id: string; code: string }[],
  shiftId: "",
  swept: 0,
  cleanup: null as null | { ok: boolean; detail: string },
};
/** ลงทะเบียนเครื่อง QC 2 เครื่อง + กะของเครื่อง 2 ครั้งเดียวต่อรอบ (ก่อนเปิด chromium) — พังไม่โยน (บันทึก SETTINGS.error) */
async function seedSettingsOnce(): Promise<void> {
  if (SETTINGS.seeded || SETTINGS.error) return;
  try {
    const { registerDevice, revokeDevice, updateDevice } = await import("@/lib/modules/pos/device");
    const { openShift } = await import("@/lib/modules/pos/shift");
    const actor = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    // ซากของรอบที่ถูก kill (ACTIVE · รหัส posqc-vis-dev-*-1/2 · เกิน 1 ชม.) = เพิกถอนก่อน (เพดาน 3 เครื่อง/สาขา)
    const stale = await prisma.posDevice.findMany({
      where: { tenantId: T.tenantId, unitId, status: "ACTIVE", deviceCode: { startsWith: "posqc-vis-dev-" }, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      select: { id: true, deviceCode: true },
    });
    for (const d of stale.filter((x) => /-[12]$/.test(x.deviceCode))) if ((await revokeDevice(ctx, actor, { id: d.id })).ok) SETTINGS.swept++;
    const names = ["เคาน์เตอร์ 1 (ภาพ QC)", "เคาน์เตอร์ 2 (ภาพ QC)"];
    for (let i = 0; i < SETTINGS_DEVICE_CODES.length; i++) {
      const r = await registerDevice(ctx, actor, { name: names[i]!, deviceCode: SETTINGS_DEVICE_CODES[i]! });
      if (!r.ok) throw new StepError(`ลงทะเบียนเครื่อง QC ${i + 1} ไม่ได้: ${r.code}`);
      SETTINGS.devices.push({ id: r.device.id, code: SETTINGS_DEVICE_CODES[i]! });
    }
    const u1 = await updateDevice(ctx, actor, { id: SETTINGS.devices[0]!.id, posRegNo: "POS001", printerConfig: { mode: "escpos-usb", paper: "80", drawerKick: true, autoPrint: true, thaiText: "raster", copies: 1 } });
    if (!u1.ok) throw new StepError(`ตั้ง printerConfig เครื่อง 1 ไม่ได้: ${u1.code}`);
    const u2 = await updateDevice(ctx, actor, { id: SETTINGS.devices[1]!.id, posRegNo: "POS002" });
    if (!u2.ok) throw new StepError(`ตั้งเลขเครื่อง 2 ไม่ได้: ${u2.code}`);
    if (jobs.some((j) => j.state === "paydone-print")) {
      const code = SETTINGS_DEVICE_CODES[1];
      const op = await openShift({ ...ctx, deviceId: code }, actor, { deviceId: code, deviceLabel: names[1]!, floatSatang: 100000 });
      if (!op.ok) throw new StepError(`เปิดกะของเครื่อง 2 ไม่ได้: ${op.code}`);
      SETTINGS.shiftId = op.shift.id;
    }
    SETTINGS.seeded = true;
  } catch (e) {
    SETTINGS.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function runSettingsState(page: Any, state: SettingsStateKey, device: Device): Promise<void> {
  // POS P1.7U ▸ แท็บวิธีรับเงิน ไม่ใช้เครื่อง QC ของหน้าตั้งค่า ◂
  if (state === "settings-payments") {
    await visibleEl(page, tid("pos-settings-payments"), 0, 15_000).catch(() => {
      throw new StepError("แท็บวิธีรับเงินไม่ขึ้น (pos-settings-payments)");
    });
    await visibleEl(page, tid("pos-settings-pay-beam-chip"), 0, 5_000);
    if (userKey === "cashier") await visibleEl(page, tid("pos-settings-readonly"), 0, 5_000).catch(() => {
      throw new StepError("แคชเชียร์ไม่เห็นป้ายอ่านอย่างเดียว (pos-settings-readonly)");
    });
    return;
  }
  if (SETTINGS.error || !SETTINGS.seeded) throw new StepError(`ไม่มีเครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.error ?? "ยังไม่ได้สร้าง"}`);
  if (state === "paydone-print") {
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
      throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root)");
    });
    await ensureShift(page);
    await cashSaleAmerLatte(page, device);
    await visibleEl(page, tid("pos-print-receipt"), 0, 10_000).catch(() => {
      throw new StepError("จอสำเร็จไม่มีปุ่มพิมพ์ใบเสร็จ (pos-print-receipt)");
    });
    await visibleEl(page, tid("pos-print-copy"), 0, 5_000);
    return;
  }
  await visibleEl(page, tid("pos-settings-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าตั้งค่าไม่ขึ้น (pos-settings-root)");
  });
  if (state === "settings-receipt") {
    await visibleEl(page, tid("pos-settings-receipt"), 0, 15_000).catch(() => {
      throw new StepError("แท็บใบเสร็จไม่ขึ้น (pos-settings-receipt)");
    });
    await visibleEl(page, tid("pos-settings-preview"), 0, 10_000);
    if (userKey === "cashier") await visibleEl(page, tid("pos-settings-readonly"), 0, 5_000).catch(() => {
      throw new StepError("แคชเชียร์ไม่เห็นป้ายอ่านอย่างเดียว (pos-settings-readonly)");
    });
    await sleep(600); // iframe ตัวอย่างวัดความสูงหลังโหลด
    return;
  }
  if (userKey === "cashier") {
    await visibleEl(page, tid("pos-settings-refusal"), 0, 10_000).catch(() => {
      throw new StepError("แคชเชียร์ไม่เห็นการ์ดปฏิเสธของแท็บเครื่อง (pos-settings-refusal)");
    });
    return;
  }
  await visibleEl(page, tid("pos-settings-devices"), 0, 15_000).catch(() => {
    throw new StepError("แท็บเครื่องไม่ขึ้น (pos-settings-devices)");
  });
  for (const d of SETTINGS.devices) await visibleEl(page, tid(`pos-device-card-${d.id}`), 0, 10_000);
  if (state === "settings-devices") return;
  if (state === "settings-device-revoke") {
    await clickEl(page, tid(`pos-device-card-${SETTINGS.devices[1]!.id}`));
    await clickEl(page, tid("pos-device-revoke"));
    await visibleEl(page, tid("pos-device-revoke-dialog"), 0, 5_000);
    return;
  }
  // settings-print-pair — เครื่อง 1 = เครื่องของเบราว์เซอร์นี้ (pinDevice) · mode USB
  await clickEl(page, tid(`pos-device-card-${SETTINGS.devices[0]!.id}`));
  await clickEl(page, tid("pos-device-pair"));
  await visibleEl(page, tid("pos-print-pair"), 0, 5_000);
  // P1.11U รอบ 2 (มติข้อ 3a): chromium headless เปิด WebUSB ให้เสมอแม้ซ่อน navigator.usb ⇒ ยอมรับกล่อง "ไม่รองรับ" หรือปุ่มค้นหาเครื่องพิมพ์ อย่างใดอย่างหนึ่ง
  await visibleEl(page, `${tid("pos-print-pair-unsupported")},${tid("pos-print-pair-find")}`, 0, 5_000).catch(() => {
    throw new StepError("กล่องจับคู่ไม่ขึ้นทั้งสถานะ \"ไม่รองรับ\" (pos-print-pair-unsupported) และปุ่มค้นหา (pos-print-pair-find)");
  });
}
/** finally: ปิดกะของเครื่อง 2 (นับ = ยอดคาด) + เพิกถอนเครื่อง QC ของรอบนี้ — เรียกซ้ำได้ · ไม่โยน */
async function cleanupSettingsState(): Promise<void> {
  if (!settingsStatesOn || SETTINGS.cleanup || (!SETTINGS.devices.length && !SETTINGS.shiftId)) return;
  const parts: string[] = [];
  let ok = true;
  if (SETTINGS.shiftId) {
    const c = await closeShiftAsOwner(SETTINGS.shiftId, "settings-close");
    ok &&= c.ok;
    parts.push(c.detail);
  }
  try {
    const { revokeDevice } = await import("@/lib/modules/pos/device");
    const actor = await ownerActor();
    let n = 0;
    for (const d of SETTINGS.devices) {
      const r = await revokeDevice({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { id: d.id });
      if (r.ok) n++;
      else ok = false;
    }
    parts.push(`เพิกถอนเครื่อง QC ${n}/${SETTINGS.devices.length}${SETTINGS.swept ? ` (+ซาก ${SETTINGS.swept})` : ""}`);
  } catch (e) {
    ok = false;
    parts.push(`เพิกถอนเครื่องล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  SETTINGS.cleanup = { ok, detail: parts.join(" · ") };
}

// ═══════════════════ POS P1.7U ▸ ใบขอรับเงินของภาพ (PromptPay ID ของร้าน QC · เก็บกวาดใบของรอบนี้) ═══════════════════
const INTENT_STATES: ReadonlySet<string> = new Set(["paydlg-promptpay-qr", "paydlg-promptpay-paid"]);
const INTENTS = {
  /** PaymentProfile ก่อนรอบนี้ (null = ไม่มีแถว · undefined = ไม่ได้แตะ) */
  ppBefore: undefined as undefined | null | { promptpayId: string | null; displayName: string | null },
  ppNote: "",
  consumed: 0,
  cleanup: null as null | { ok: boolean; detail: string },
};
/** ร้าน QC ต้องมี PromptPay ID ที่ใช้ได้ — ไม่มี/ผิดรูป = ตั้งด้วย savePaymentProfile (ตัวแก้เดิม) · คืนค่าใน cleanupIntents · พังไม่โยน */
async function ensureQcPromptPay(): Promise<void> {
  try {
    const { getPaymentProfile, savePaymentProfile } = await import("@/lib/payment/service");
    const { isValidPromptPayId } = await import("@/lib/payment/promptpay");
    const cur = await getPaymentProfile({ tenantId: T.tenantId });
    if (cur?.promptpayId && isValidPromptPayId(cur.promptpayId)) {
      INTENTS.ppNote = "ร้าน QC มี PromptPay ID อยู่แล้ว (ไม่แตะ)";
      return;
    }
    INTENTS.ppBefore = cur ? { promptpayId: cur.promptpayId, displayName: cur.displayName } : null;
    await savePaymentProfile({ tenantId: T.tenantId, actorUserId: T.users.owner.userId }, { promptpayId: "0812345678", displayName: "ร้าน QC (ภาพ P1.7U)" });
    INTENTS.ppNote = `ตั้ง PromptPay ID ชั่วคราว (${cur ? "แทนค่าผิดรูป" : "ร้านยังไม่มี"})`;
  } catch (e) {
    INTENTS.ppNote = `ตั้ง PromptPay ID ไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
  }
}
/** หลังถ่าย paydlg-promptpay-paid: กดยืนยันรับเงิน ⇒ บิลขายใช้ใบ PAID (CONSUMED) — ไม่ทิ้งเงินเข้าไม่มีบิล */
async function finishPaidIntentSale(page: Any): Promise<void> {
  await clickEl(page, tid("pos-reg-paydlg-confirm"));
  await visibleEl(page, tid("pos-reg-done"), 0, 20_000);
  INTENTS.consumed++;
}
/** finally/signal: ยกเลิกใบ PENDING ของเครื่องรอบนี้ (บริการ cancelPaymentIntent) + คืน PromptPay ID — เรียกซ้ำได้ · ไม่โยน */
async function cleanupIntents(): Promise<void> {
  if (INTENTS.cleanup) return;
  const parts: string[] = [];
  let ok = true;
  try {
    const rows = await prisma.posPaymentIntent.findMany({
      where: { tenantId: T.tenantId, unitId, deviceId: DEVICE_ID, createdAt: { gte: RUN_STARTED } },
      select: { id: true, status: true },
    });
    if (rows.length) {
      const { cancelPaymentIntent } = await import("@/lib/modules/pos/payment-intent");
      const actor = await ownerActor();
      let cancelled = 0;
      for (const r of rows.filter((x) => x.status === "PENDING")) {
        const c = await cancelPaymentIntent({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { intentId: r.id });
        if (c.ok) cancelled++;
        else ok = false;
      }
      const paidLeft = rows.filter((x) => x.status === "PAID").length;
      if (paidLeft) ok = false; // แก้รอบ 1 F5: เงินเข้าไม่มีบิล = ภาพรอบนี้ตก (rc 1)
      parts.push(`ใบขอรับเงินของรอบนี้ ${rows.length} · ยกเลิก ${cancelled} · ใช้ในบิล ${INTENTS.consumed}${paidLeft ? ` · ⚠️ PAID ไม่ได้ใช้ ${paidLeft}` : ""}`);
    }
  } catch (e) {
    ok = false;
    parts.push(`เก็บกวาดใบขอรับเงินล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  if (INTENTS.ppBefore !== undefined) {
    try {
      // แก้รอบ 1 F5: คืนผ่านตัวแก้เดิม (savePaymentProfile) เมื่อค่าเดิมผ่านตัวตรวจของมัน · ไม่มีแถวเดิม = ลบแถว (ตัวแก้ไม่มีทางลบ) ·
      //   ค่าเดิมผิดรูป = เขียนตรง (ตัวแก้ปฏิเสธค่าผิดรูป) — บันทึกใน summary
      const { savePaymentProfile } = await import("@/lib/payment/service");
      const { isValidPromptPayId } = await import("@/lib/payment/promptpay");
      const before = INTENTS.ppBefore;
      if (before === null) {
        await prisma.paymentProfile.deleteMany({ where: { tenantId: T.tenantId } });
        parts.push("คืน PromptPay ID: ลบแถวที่รอบนี้สร้าง (ร้าน QC ไม่มีแถวเดิม · เขียนตรง)");
      } else if (before.promptpayId && isValidPromptPayId(before.promptpayId)) {
        await savePaymentProfile({ tenantId: T.tenantId, actorUserId: T.users.owner.userId }, { promptpayId: before.promptpayId, displayName: before.displayName ?? undefined });
        parts.push("คืน PromptPay ID ผ่าน savePaymentProfile");
      } else {
        await prisma.paymentProfile.update({ where: { tenantId: T.tenantId }, data: before });
        parts.push("คืน PromptPay ID ค่าเดิมที่ผิดรูป (เขียนตรง — savePaymentProfile ไม่รับค่าผิดรูป)");
      }
    } catch (e) {
      ok = false;
      parts.push(`คืน PromptPay ID ไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  }
  if (parts.length) INTENTS.cleanup = { ok, detail: parts.join(" · ") };
}

type Shot = { page: string; state: string | null; stepError: string | null; viewport: string; file: string; status: number; expect: number | "record"; http5xx: number; finalUrl: string; redirectedToLogin: boolean; overflow: boolean; overflowEl: string | null; consoleErrors: string[]; httpErrors: string[]; ok: boolean };
const shots: Shot[] = [];
let failures = 0;
let fatal = "";
mkdirSync(OUT, { recursive: true });

try {
  // ── mint session (ผู้ใช้ QC id ตายตัวจาก PQC · ต้อง seed-pos-qc ก่อน) ──
  const user = await prisma.user.findUnique({ where: { id: U.userId }, select: { id: true, email: true } });
  if (!user || user.email !== U.email) throw new Fatal(`ไม่พบผู้ใช้ ${U.email} (${U.userId}) ในฐานนี้ — รัน seed-pos-qc บนฐานเดียวกับเซิร์ฟเวอร์ก่อน`);
  const token = "pos" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const row = await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.push(row.id);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  // ชื่อคุกกี้ผูกกับโปรโตคอล: http = shark_session · https = __Host-shark_session (เหมือน visual-crm)
  const cookies: Any[] = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: T.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: T.tenantId, domain: host, path: "/" }];
  // POS P1.3 ▸ ภาษาอังกฤษ (ภาพ 20B) — next-intl อ่าน locale จากคุกกี้ LOCALE ◂
  if (LOCALE_EN) cookies.push(https ? { name: "LOCALE", value: "en", url: BASE, path: "/", secure: true } : { name: "LOCALE", value: "en", domain: host, path: "/" });
  USER_COOKIES = cookies; // POS P1.9 U: แท็บขายของสถานะหน้ากะ
  if (needFixtures) await makeFixtures();
  // R3 V4: session ของเจ้าของร้าน (เปิดกะให้เครื่องของรอบนี้) — รอบ owner ใช้คุกกี้เดียวกัน · รอบ cashier mint เพิ่ม (ลบใน finally เหมือนกัน)
  let ownerCookies: Any[] = cookies;
  if (STATES_ON && pages.includes("register") && userKey !== "owner") {
    const ownTok = "pos" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ownRow = await prisma.session.create({ data: { userId: T.users.owner.userId, tokenHash: sha256(ownTok), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
    MINE.push(ownRow.id);
    ownerCookies = cookies.map((c: Any) => (/shark_session$/.test(c.name) ? { ...c, value: ownTok } : c));
  }
  // ข้อมูลตายตัวของร้าน QC ที่ขั้นตอนสถานะใช้ (หาจากชื่อ — seed-pos-qc · ไม่ผูกสต็อก ยกเว้นครัวซองต์)
  if (STATES_ON) {
    const rows = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, systemId: SYS, archivedAt: null }, select: { id: true, name: true } });
    const byName = (n: string) => rows.find((r) => r.name === n)?.id ?? "";
    QC_IDS.amer = byName("อเมริกาโน่เย็น");
    QC_IDS.latte = byName("ลาเต้ร้อน");
    QC_IDS.crois = byName("ครัวซองต์เนยสด");
  }

  // รอบ 3 ▸ ตรวจตัวนับเลขใบเสร็จของร้าน QC ก่อนขายจริง — ตัวนับถอยหลัง (seq < เลขที่ออกไปแล้ว) = ทุกการขายชน unique (unitId, receiptNo)
  //   3 ครั้งแล้วได้ BUSY ("ยังไม่แน่ใจว่าบันทึกบิลแล้วหรือยัง") · สาเหตุที่พบ: qc-pos-p1.3 คืนค่าตัวนับของร้าน QC จาก snapshot ตอนเริ่มรอบ
  //   ทับบิลที่รอบภาพ/เลนอื่นขายระหว่างนั้น · สคริปต์นี้ไม่ซ่อมเอง — แจ้งชัดใน log/summary แล้วให้ขั้นตอนขายตกพร้อมเหตุผลนี้ ◂
  COUNTER_LAG = await receiptCounterLag();
  if (COUNTER_LAG.length) console.error(`⚠️ ตัวนับเลขใบเสร็จของร้าน QC ถอยหลัง: ${COUNTER_LAG.join(" · ")} — การขายจะได้ BUSY จนกว่าจะซ่อมตัวนับ`);
  if (rpubOn) {
    await seedRpubOnce(); // POS P1.11U — พังไม่โยน (ทุกสถานะ rpub-* ที่ต้องใช้บิลตกพร้อมเหตุผล)
    console.log(RPUB.error ? `  ⚠️ บิลชุดภาพใบเสร็จ: ${RPUB.error}` : `  บิลชุดภาพใบเสร็จ: ${Object.keys(RPUB.sales).join(" · ") || "-"}${RPUB.reused.length ? ` (ใช้ชุดวันนี้ซ้ำ: ${RPUB.reused.join(" · ")})` : ""} · actions ${JSON.stringify(RPUB.actions)} · abb ${JSON.stringify(RPUB.abb && { toggled: RPUB.abb.toggled, taxIdSet: !!RPUB.abb.taxIdSet, vatRegistered: RPUB.abb.vatRegistered, posAbbreviatedInvoice: RPUB.abb.posAbbreviatedInvoice, hasTaxId: RPUB.abb.hasTaxId })}`);
  }
  // POS P1.15U ▸ หน้าขายล็อกเมื่อไม่มีโทเคนผู้ขาย/เครื่องไม่ลงทะเบียน ⇒ ลงทะเบียนเครื่อง + PIN + โทเคน (+ ข้อมูลของสถานะ 13B/21B) ก่อนเปิด chromium ◂
  if (jobs.some((j) => j.page === "register" || j.state === "paydone-print")) {
    await seedP115Once();
    console.log(P115.error ? `  ⚠️ ข้อมูลภาพ P1.15U: ${P115.error}` : `  ข้อมูลภาพ P1.15U: เครื่อง ${DEVICE_ID} · PIN ${Object.keys(P115.pins).join("/")} (ไม่พิมพ์ค่า) · บิลพัก ${P115.heldId || "-"}`);
  }
  if (jobs.some((j) => j.state && INTENT_STATES.has(j.state))) {
    await ensureQcPromptPay(); // POS P1.7U
    console.log(`  PromptPay ของร้าน QC: ${INTENTS.ppNote}`);
  }
  if (settingsStatesOn && pages.includes("settings")) {
    await seedSettingsOnce(); // POS P1.10 U — พังไม่โยน (ทุกสถานะ settings-* ตกพร้อมเหตุผล)
    console.log(SETTINGS.error ? `  ⚠️ เครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.error}` : `  เครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.devices.map((d) => d.id).join(" · ")} · กะ ${SETTINGS.shiftId || "-"}`);
  }
  if (billsStatesOn && pages.includes("sales")) {
    await seedBillsOnce(); // POS P1.16 U — พังไม่โยน (ทุกสถานะ bills-* ตกพร้อมเหตุผล)
    console.log(BILLS.error ? `  ⚠️ บิลชุดภาพ: ${BILLS.error}` : `  บิลชุดภาพ: ${BILLS.reused ? "ใช้ชุดของวันนี้ซ้ำ" : `สร้าง ${Object.keys(BILLS.ids).length} ใบ`} · เป้าหมาย ${BILLS.target}`);
  }
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  })) as Any;
  const browser = (BROWSER = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE_DIRS[0]}`],
  }));
  try {
    if (STATES_ON && jobs.some((j) => j.state && j.page === "register")) await openShiftAsOwner(browser, ownerCookies, { width: 1440, height: 900 });
    for (const job of jobs) {
      {
        const p = job.page;
        const v = job.v;
        const page = await browser.newPage();
        await pinDevice(
          page,
          p === "settings" && job.state ? SETTINGS_DEVICE_CODES[job.state === "paydone-print" ? 1 : 0] : p === "shifts" && job.state ? SHIFTS_DEVICE_ID : p === "sales" && job.state ? BILLS_DEVICE_ID : DEVICE_ID,
        ); // P1.10 U: หน้าตั้งค่าใช้เครื่อง QC 1 (paydone-print = เครื่อง 2 ที่มีกะ) // P1.16 U: หน้าบิลใช้เครื่องของกะภาพบิล (การ์ดเงินสด "จากลิ้นชักกะ #N") // R3 V4: เครื่องเดียวกับที่เจ้าของเปิดกะให้ · P1.9 U: สถานะหน้ากะใช้เครื่องแยก
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.name !== "desktop" });
        // POS P1.15U ▸ หน้าขาย = โทเคนผู้ขายของเครื่องที่หน้านี้ใช้ (discount-over-sheet = แคชเชียร์ · เพดาน 10%) · ปลดล็อกแถว PIN ที่ lock-pin-locked ตั้งไว้ ◂
        if ((p === "register" || job.state === "paydone-print") && P115.seeded) {
          await unlockRunPin().catch(() => undefined);
          const dev = job.state === "paydone-print" ? SETTINGS_DEVICE_CODES[1] : DEVICE_ID;
          const who: UserKey = job.state === "discount-over-sheet" && P115.pins.cashier ? "cashier" : userKey;
          const json = await staffSessionJson(who, dev).catch(() => null);
          if (json) await injectStaff(page, dev, json);
        }
        // POS P1.10 U ▸ settings-print-pair: เบราว์เซอร์ไม่มี WebUSB (แบบ iOS Safari) — ซ่อน navigator.usb ก่อนสคริปต์ของหน้า ⇒ กล่องจับคู่ขึ้นสถานะ "ไม่รองรับ" ◂
        if (job.state === "settings-print-pair") {
          await page.evaluateOnNewDocument(() => {
            try {
              Object.defineProperty(Navigator.prototype, "usb", { get: () => undefined, configurable: true });
            } catch {
              /* แก้ไม่ได้ = ปล่อยตามจริง */
            }
          });
        }
        await page.setCookie(...cookies);
        const consoleErrors: string[] = [];
        const httpErrors: string[] = [];
        const http5xx: string[] = [];
        page.on("pageerror", (e: Error) => consoleErrors.push(e.message.slice(0, 160)));
        page.on("console", (m: Any) => {
          if (m.type() === "error") consoleErrors.push(String(m.text()).slice(0, 160));
        });
        page.on("response", (r: Any) => {
          try {
            const line = `HTTP ${r.status()} ${String(r.url()).replace(BASE, "").slice(0, 160)}`;
            if (r.status() >= 500) http5xx.push(line); // คำขอย่อย 5xx = ภาพตก
            else if (r.status() >= 400) httpErrors.push(line); // 4xx = บันทึกอย่างเดียว
          } catch {
            /* ignore */
          }
        });
        const resp = await page.goto(`${BASE}${p === "receipt-public" && job.state && isRpubState(job.state) ? rpubPath(job.state) : (job.path ?? pathOf(p))}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 800));
        // POS P1.3 ▸ ขั้นตอนของสถานะ (พัง = บันทึก stepError แล้วถ่าย ณ จุดนั้น) ◂
        let stepError: string | null = null;
        if (job.state) {
          try {
            await runState(page, job.state, v.name);
            await new Promise((r) => setTimeout(r, 500));
          } catch (e) {
            stepError = e instanceof Error ? e.message.slice(0, 200) : String(e);
            if (COUNTER_LAG.length) stepError += ` · ตัวนับเลขใบเสร็จถอยหลัง (${COUNTER_LAG[0]})`; // รอบ 3
          }
        }
        const finalUrl = String(page.url()).replace(BASE, "");
        // ล้นแนวนอน = เนื้อหากว้างกว่ากรอบที่มองเห็น (เกณฑ์ X10 — ไม่มี overflow ทั้ง 3 ขนาด)
        const ov = (await page
          .evaluate(() => {
            const d = document.documentElement;
            // ตรวจ html · body · กรอบเลื่อนหลัก (main / [role=main]) — เลย์เอาต์ที่ล็อก html แล้วให้ main เลื่อนเองจะไม่ล้นที่ html
            const boxes = [d, document.body, ...Array.from(document.querySelectorAll("main, [role=main]"))].filter(Boolean) as Element[];
            const overBox = boxes.find((b) => b.scrollWidth > b.clientWidth + 1);
            const over = !!overBox;
            if (!over) return { over, el: null as string | null };
            const boxName = overBox === d ? "html" : overBox === document.body ? "body" : overBox!.tagName.toLowerCase();
            let best: { r: number; d: string } | null = null;
            for (const el of Array.from(document.querySelectorAll("body *"))) {
              const cs = getComputedStyle(el);
              if (cs.position === "fixed" || cs.display === "none") continue;
              const b = el.getBoundingClientRect();
              if (b.width === 0 || b.right <= d.clientWidth + 1) continue;
              if (!best || b.right > best.r) {
                const tid = el.getAttribute("data-testid");
                best = { r: b.right, d: `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ""} right=${Math.round(b.right)}` };
              }
            }
            return { over, el: `${boxName}: ${best?.d ?? "?"}` };
          })
          .catch(() => ({ over: false, el: null }))) as { over: boolean; el: string | null };
        const file = job.file;
        await page.screenshot({ path: file, fullPage: true });
        // POS P1.7U ▸ ใบที่ PAID แล้วต้องถูกใช้ในบิล (ไม่ทิ้งเงินเข้าไม่มีบิล) — พัง = ภาพนี้ตก ◂
        if (job.state === "paydlg-promptpay-paid" && !stepError) {
          await finishPaidIntentSale(page).catch((e: unknown) => {
            stepError = `หลังถ่าย: ยืนยันรับเงินด้วยใบ PAID ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
          });
        }
        const status = resp?.status() ?? 0;
        const redirectedToLogin = /\/login\b/.test(finalUrl);
        const exp = job.expect ?? PAGE_EXPECT[p][userKey];
        const statusOk = exp === "record" ? true : status === exp && !redirectedToLogin;
        const judged = exp === "record" ? status > 0 && status < 400 : true; // record-only: หน้าที่ถูกปฏิเสธ ไม่ตัดสินเลย์เอาต์/console
        // รอบ 2 (มติ 3c): rpub-not-found คาด HTTP 404 ของตัวหน้าเอง ⇒ ข้อความ console "status of 404" ของหน้านั้น 1 บรรทัดไม่นับ (สถานะ 404 ยังตรวจที่ statusOk)
        if (job.state === "rpub-not-found") {
          const i = consoleErrors.findIndex((e) => /status of 404/.test(e));
          if (i >= 0) consoleErrors.splice(i, 1);
        }
        const ok = statusOk && !stepError && (!judged || (consoleErrors.length === 0 && !ov.over && http5xx.length === 0));
        if (!ok) failures++;
        shots.push({ page: p, state: job.state, stepError, viewport: `${v.w}x${v.h}`, file, status, expect: exp, finalUrl, redirectedToLogin, overflow: ov.over, overflowEl: ov.el, consoleErrors, httpErrors: [...http5xx, ...httpErrors], http5xx: http5xx.length, ok });
        console.log(
          `  ${ok ? "✅" : "❌"} ${p}${job.state ? `/${job.state}` : ""} ${v.w}x${v.h} HTTP ${status}${stepError ? ` · ขั้นตอนพัง: ${stepError}` : ""} (คาด ${exp})${http5xx.length ? ` · คำขอย่อย 5xx ${http5xx.length}: ${http5xx[0]}` : ""}${redirectedToLogin ? " · เด้งไป /login" : ""}${ov.over ? ` · ล้นแนวนอน ${ov.el ?? "?"}` : ""}${consoleErrors.length ? ` · console error ${consoleErrors.length}: ${consoleErrors[0]}` : ""} → ${file}`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  await closeRunShift();
  if (SHIFT.close && !SHIFT.close.ok) console.error(`⚠️ ${SHIFT.close.detail}`);
  await cleanupP115(); // POS P1.15U (หลังปิดกะ — เพิกถอนเครื่องเป็นขั้นท้าย)
  if (P115.cleanup) console.error(`${P115.cleanup.ok ? "🧹" : "⚠️"} ${P115.cleanup.detail}`);
  if (P115.cleanup && !P115.cleanup.ok) failures++;
  await closeShiftsStateShift(); // POS P1.9 U
  if (SHIFTS.close) console.error(`${SHIFTS.close.ok ? "🧹" : "⚠️"} ${SHIFTS.close.detail}`);
  if (SHIFTS.opened && SHIFTS.close && !SHIFTS.close.ok) failures++;
  await cancelRunCount(); // POS P1.14 U
  if (STOCK.cancel) console.error(`${STOCK.cancel.ok ? "🧹" : "⚠️"} ${STOCK.cancel.detail}`);
  if (STOCK.cancel && !STOCK.cancel.ok) failures++;
  await closeBillsShift(); // POS P1.16 U
  await cleanRpub(); // POS P1.11U
  if (RPUB.cleanup) console.error(rpubCleanupLine());
  if (RPUB.cleanup?.error || (RPUB.close && !RPUB.close.ok) || (RPUB.abb?.toggled && RPUB.abb.restored !== "ok") || (RPUB.abb?.taxIdSet && RPUB.abb.taxIdRestored !== "ok")) failures++;
  if (BILLS.close) console.error(`${BILLS.close.ok ? "🧹" : "⚠️"} ${BILLS.close.detail}`);
  if (BILLS.close && !BILLS.close.ok) failures++;
  await cleanupIntents(); // POS P1.7U
  if (INTENTS.cleanup) console.error(`${INTENTS.cleanup.ok ? "🧹" : "⚠️"} ${INTENTS.cleanup.detail}`);
  if (INTENTS.cleanup && !INTENTS.cleanup.ok) failures++;
  await cleanupSettingsState(); // POS P1.10 U
  if (SETTINGS.cleanup) console.error(`${SETTINGS.cleanup.ok ? "🧹" : "⚠️"} ${SETTINGS.cleanup.detail}`);
  if (SETTINGS.cleanup && !SETTINGS.cleanup.ok) failures++;
  const { removed, stale } = await cleanSessions();
  let fixOut = "";
  try {
    const f = await cleanFixtures();
    if (f.products || f.items) fixOut = ` · ลบสินค้าชั่วคราว ${f.products} (+InvItem ${f.items})`;
  } catch (e) {
    fixOut = ` · ❌ ลบสินค้าชั่วคราวไม่สำเร็จ: ${e instanceof Error ? e.message : e}`;
    failures++;
  }
  await prisma.$disconnect();
  cleanProfiles();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, at: new Date().toISOString(), deviceId: DEVICE_ID, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, intentState: INTENTS, counterLag: COUNTER_LAG, p115State: p115Summary(), shots }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${removed}${stale ? ` (+ซากหมดอายุ ${stale})` : ""}${fixOut} · ลบโปรไฟล์ chromium ${PROFILE_DIRS[0]} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, counterLag: COUNTER_LAG, p115State: p115Summary(), shots: shots.map(({ consoleErrors, httpErrors, ...s }) => ({ ...s, consoleErrors: consoleErrors.length, httpErrors: httpErrors.length })), failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
