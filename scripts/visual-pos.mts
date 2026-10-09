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
//   ปิดกะที่รอบนี้ใช้ขาย (นับ = ยอดคาด) · บิลขาย/ใบคืนคงอยู่ (ข้อมูลเงิน ห้ามลบ — แต่ไม่งอกเพราะใช้ชุดของวันซ้ำ) ◂
// POS P1.10 U ▸ หน้า settings (ภาพ 17A/17B) + `--states` (เฉพาะร้าน coffee · --page settings หรือ wo p1.10u*):
//   settings-receipt (17A + ตัวอย่างสด · แคชเชียร์ = อ่านอย่างเดียว) · settings-devices (17B · 2 เครื่อง QC `posqc-vis-dev-<pid>-{1,2}` ลงทะเบียนด้วย
//   registerDevice ของบริการ · เครื่อง 1 มี printerConfig USB 80 มม. + ลิ้นชัก + พิมพ์อัตโนมัติ) · settings-device-revoke (กล่องยืนยันเพิกถอนเปิด · ไม่กดยืนยัน) ·
//   settings-print-pair (กล่องเลือกเครื่องพิมพ์ของเครื่อง 1 — ซ่อน navigator.usb ก่อนโหลดหน้า ⇒ สถานะ "เบราว์เซอร์นี้ไม่รองรับ") — 3 ขนาด ·
//   paydone-print (1440 เท่านั้น · หน้าขายบนเครื่อง 2 = พิมพ์ผ่านเบราว์เซอร์ · ขายเงินสด 1 บิล → จอสำเร็จพร้อมปุ่มพิมพ์ใบเสร็จ/สำเนา · ไม่กดพิมพ์)
//   🔴 เขียน: เครื่อง 2 เครื่อง + กะ 1 กะของเครื่อง 2 (openShift ของบริการ) + บิลขายเงินสด 1 ใบ · finally/signal ปิดกะนี้ (นับ = ยอดคาด) +
//   เพิกถอนเครื่อง QC ของรอบนี้ (ซากของรอบที่ถูก kill เกิน 1 ชม. ถูกเพิกถอนตอนเริ่ม) · แคชเชียร์ QC ไม่มี pos.device.manage ⇒ แท็บเครื่อง = การ์ดปฏิเสธ ◂
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
type StateKey = "default" | "cart3" | "cart4-01" | "line-editor" | "bill-discount" | "custom-item" | "paydlg-cash" | "sale-done" | "search-empty" | "stock-warn" | "offline" | "mobile-sheet" | "options-popover" | "weigh" | StockStateKey | ShiftsStateKey | BillsStateKey | SettingsStateKey | RpubStateKey;
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
];
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
type SettingsStateKey = "settings-receipt" | "settings-devices" | "settings-device-revoke" | "settings-print-pair" | "paydone-print";
const SETTINGS_STATE_PLAN: { key: SettingsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "settings-receipt", devices: ["desktop", "ipad", "mobile"], note: "17A ใบเสร็จและภาษี + ตัวอย่างสด (แคชเชียร์ = ช่องปิด · อ่านอย่างเดียว)" },
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
  st === "paydone-print" ? `/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(unitId)}` : `/app/sys/${SYS}/pos/settings?tab=${st === "settings-receipt" ? "receipt" : "devices"}&unit=${encodeURIComponent(unitId)}`;
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
/** รหัสเครื่องคงที่ของรอบนี้ — ทุกแท็บ (ทั้ง context ของผู้ใช้และของเจ้าของ) ใช้ค่าเดียวกัน = เครื่องเดียวกัน */
const DEVICE_ID = `posqc-vis-dev-${process.pid}`;
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
};
/** F3: คีย์กันซ้ำของ "ชุดวันนี้" (วันที่ไทย) — รอบซ้ำวันเดียวกันใช้บิลชุดเดิม (แบบ existingBillsSet ของ P1.16) · ข้ามวัน = ชุดใหม่ 1 ชุด */
const RPUB_PREFIX = `posqc-p111u-${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "")}-`;
/** บิลชุดภาพของวันนี้ที่ยังอยู่ในสถานะที่ภาพต้องการ (paid = PAID ไม่มีคืน · partial = PAID คืนบางส่วน · voided = VOIDED) */
async function existingRpubSet(): Promise<Record<string, string>> {
  const start = new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`));
  const rows = await prisma.posSale.findMany({
    where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", idempotencyKey: { startsWith: RPUB_PREFIX }, createdAt: { gte: start } },
    select: { id: true, status: true, refundedSatang: true, idempotencyKey: true },
    orderBy: { createdAt: "desc" },
  });
  const out: Record<string, string> = {};
  for (const r of rows) {
    const kind = r.idempotencyKey.slice(RPUB_PREFIX.length).split("-")[0] ?? "";
    if (out[kind]) continue;
    const ok =
      kind === "paid" ? r.status === "PAID" && r.refundedSatang === 0 : kind === "partial" ? r.status === "PAID" && r.refundedSatang > 0 : kind === "voided" ? r.status === "VOIDED" : false;
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
      const { openShift } = await import("@/lib/modules/pos/shift");
      const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
      const { refundSale, saleForRefund } = await import("@/lib/modules/pos/refund");
      const { voidSaleByActor } = await import("@/lib/modules/pos/bills");
      const { refundLineAmount, refundServiceCharge } = await import("@/lib/modules/pos/refund-math");
      const { publicReceipt } = await import("@/lib/modules/pos/public-receipt");
      const actor = await ownerActor();
      const ctx = { tenantId: T.tenantId, systemId: SYS, unitId, deviceId: RPUB_DEVICE_ID };
      const have = await existingRpubSet();
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
      const cart = { lines: [{ productId: idOf("ลาเต้ร้อน"), qty: 2 }, { productId: idOf("อเมริกาโน่เย็น"), qty: 1 }, { productId: idOf("ครัวซองต์เนยสด"), qty: 1 }], billDiscount: { type: "AMOUNT" as const, value: 1000 } };
      const sell = async (k: string): Promise<string> => {
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
    ? `${RPUB.cleanup.error ? "⚠️" : "🧹"} ใบเสร็จออนไลน์: ลบแจ้งปัญหา ${RPUB.cleanup.issues} · คำขอใบกำกับ ${RPUB.cleanup.taxRequests} · OutboxEvent ${RPUB.cleanup.outbox}${RPUB.cleanup.kanbanCards.length ? ` · เก็บการ์ดบอร์ดงานเข้าคลัง ${RPUB.cleanup.kanbanCards.length}` : ""}${RPUB.cleanup.error ? ` · ${RPUB.cleanup.error}` : ""}${RPUB.close ? ` · ${RPUB.close.detail}` : ""}`
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
  await visibleEl(page, tid("pos-print-pair-unsupported"), 0, 5_000).catch(() => {
    throw new StepError("กล่องจับคู่ไม่ขึ้นสถานะ \"ไม่รองรับ\" (pos-print-pair-unsupported)");
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

  if (rpubOn) {
    await seedRpubOnce(); // POS P1.11U — พังไม่โยน (ทุกสถานะ rpub-* ที่ต้องใช้บิลตกพร้อมเหตุผล)
    console.log(RPUB.error ? `  ⚠️ บิลชุดภาพใบเสร็จ: ${RPUB.error}` : `  บิลชุดภาพใบเสร็จ: ${Object.keys(RPUB.sales).join(" · ") || "-"}${RPUB.reused.length ? ` (ใช้ชุดวันนี้ซ้ำ: ${RPUB.reused.join(" · ")})` : ""} · actions ${JSON.stringify(RPUB.actions)}`);
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
        const status = resp?.status() ?? 0;
        const redirectedToLogin = /\/login\b/.test(finalUrl);
        const exp = job.expect ?? PAGE_EXPECT[p][userKey];
        const statusOk = exp === "record" ? true : status === exp && !redirectedToLogin;
        const judged = exp === "record" ? status > 0 && status < 400 : true; // record-only: หน้าที่ถูกปฏิเสธ ไม่ตัดสินเลย์เอาต์/console
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
  await closeShiftsStateShift(); // POS P1.9 U
  if (SHIFTS.close) console.error(`${SHIFTS.close.ok ? "🧹" : "⚠️"} ${SHIFTS.close.detail}`);
  if (SHIFTS.opened && SHIFTS.close && !SHIFTS.close.ok) failures++;
  await cancelRunCount(); // POS P1.14 U
  if (STOCK.cancel) console.error(`${STOCK.cancel.ok ? "🧹" : "⚠️"} ${STOCK.cancel.detail}`);
  if (STOCK.cancel && !STOCK.cancel.ok) failures++;
  await closeBillsShift(); // POS P1.16 U
  await cleanRpub(); // POS P1.11U
  if (RPUB.cleanup) console.error(rpubCleanupLine());
  if (RPUB.cleanup?.error || (RPUB.close && !RPUB.close.ok)) failures++;
  if (BILLS.close) console.error(`${BILLS.close.ok ? "🧹" : "⚠️"} ${BILLS.close.detail}`);
  if (BILLS.close && !BILLS.close.ok) failures++;
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
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, at: new Date().toISOString(), deviceId: DEVICE_ID, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, shots }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${removed}${stale ? ` (+ซากหมดอายุ ${stale})` : ""}${fixOut} · ลบโปรไฟล์ chromium ${PROFILE_DIRS[0]} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, shots: shots.map(({ consoleErrors, httpErrors, ...s }) => ({ ...s, consoleErrors: consoleErrors.length, httpErrors: httpErrors.length })), failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
