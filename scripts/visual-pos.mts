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
// POS P1.13U ▸ ใบกำกับภาษีเต็มรูป (มติ 9): หน้า register `--states` เพิ่ม taxinvoice-dialog (15A จากปุ่มท้ายตะกร้า · นิติบุคคล + เลข QC ✓) ·
//   taxinvoice-set (จอชำระ + สวิตช์ → 15A → บันทึก → แถวผู้ซื้อท้ายจอ) — ก่อนเปิด chromium เปิดสมุด QC ให้ออกใบกำกับได้ด้วย ensureAbbBook (คืนค่าใน cleanRpub) ·
//   หน้า sales `--states` เพิ่ม bill-taxinvoice-requested (บิลกาแฟ ABB + คำขอ P1.11 ผ่าน requestFullTaxInvoice · ลบคำขอใน finally/signal) ·
//   bill-taxinvoice-issued (⚠️ issueFullTaxInvoice — ใบ TX ค้างในบัญชี QC4 · docId ใน summary taxInvoiceState) · บิลใช้ซ้ำรายวันด้วยคีย์ posqc-p113u-<วันที่>- ◂
// POS P1.7U ▸ ใบขอรับเงิน (มติ 8): หน้า register `--states` เพิ่ม paydlg-promptpay-qr (cart3 → ชำระ → พร้อมเพย์ = ใบ PROMPTPAY_STATIC + QR ล็อกยอด) ·
//   paydlg-promptpay-paid (desktop/mobile · กด "ยืนยันเองเมื่อเห็นเงินเข้า" ผ่าน confirmPaymentIntentManualAction → ✓ เงินเข้าแล้ว · หลังถ่ายกดยืนยันรับเงิน
//   = บิลขายจริง 1 ใบที่ใช้ใบนั้น (CONSUMED)) · paydlg-card-edc (Beam ปิด ⇒ ช่องบัตร "EDC · ใส่เลขอ้างอิง" + ช่องเลขอ้างอิงแบบ P1.6) ·
//   หน้า settings `--states` เพิ่ม settings-payments (17A "วิธีรับเงิน" · แคชเชียร์ = อ่านอย่างเดียว)
//   ร้าน coffee ไม่มี PaymentProfile.promptpayId ที่ใช้ได้ ⇒ ตั้งด้วย savePaymentProfile (ตัวแก้เดิมของร้าน) แล้วคืนค่าเดิมใน finally/signal
//   🔴 finally/signal: ใบที่รอบนี้สร้าง (เครื่องของรอบนี้ · หลังเริ่มรอบ) ที่ยัง PENDING = cancelPaymentIntent ของบริการ (ตัวทำงานของ cancelPaymentIntentAction) ·
//      ห้ามลบใบด้วย SQL (แถวเงิน) · ใบ PAID ที่ไม่ได้ใช้ = บันทึกใน summary (intentState) ◂
// POS P1.12U ▸ สมาชิกที่ตะกร้า + สิทธิ์ที่จอชำระ (มติ 11): หน้า register `--states` เพิ่ม member-panel (cart3 → + เพิ่มสมาชิก → 14A พิมพ์ "089" ·
//   สมาชิก QC กาแฟขึ้นในรายการ) · member-register (14A ค้น 0899000002 = ไม่พบ + เบอร์เติมเอง · ชื่อ "ทดสอบ สมัครด่วน" · ยินยอม · ที่มา LINE —
//   ไม่กดสมัคร) · member-attached (อเมริกาโน่×2 + ลาเต้ + ผูกสมาชิก QC → การ์ด 01) · paydlg-member-points (อเมริกาโน่×2 + ลาเต้ + สมาชิก → ชำระ → ใช้ 500 แต้ม) ·
//   paydlg-member-capped (อเมริกาโน่ 1 แก้ว + สมาชิก → ชำระ → 500 แต้ม > เพดาน 50% ⇒ แก้เป็น allowedPoints (≈325) + บรรทัดบอก) · sale-done-member
//   (1440 · ⚠️ ขายจริง PAID 1 บิลผูกสมาชิก QC: อเมริกาโน่×2 + ลาเต้ เงินสด → 02b ช่องแต้มที่ได้รับ)
//   ข้อมูล (prepMemberFixture ก่อนเปิด chromium · find-or-create ผ่านโมดูล): ค่าตั้งแต้มของร้าน burn 10 สตางค์/แต้ม · ขั้นต่ำ 100 · สูงสุด 50%
//   (setPointSettings เฉพาะเมื่อไม่ตรง) · ยอดแต้มของสมาชิก QC < 1,000 ⇒ point.credit ให้ครบ 1,240 ด้วยคีย์ `posqc-p112u-topup-<YYYYMMDD>-<ยอดก่อนเติม>`
//   (fix รอบ 1: คีย์ผูกยอดก่อนเติม ⇒ lane อื่นตัดแต้มจนต่ำกว่า 1,000 ซ้ำในวันเดียวกัน = เติมได้อีก · รันซ้ำยอดเดิม = ไม่เติมซ้ำ) ·
//   fix รอบ 1 (มติ 10): ระบบคูปองของร้าน QC (ผูกสาขาที่ถ่าย) + คูปอง WELCOME50 ฿50 (หมดอายุ 2030 · find-or-create ตามโค้ด ผ่านโมดูล system/coupon) ⇒
//   member-attached ใส่ WELCOME50 จากตะกร้า (ส่วนลดท้ายบิล → คูปอง · แถว 01 "คูปอง WELCOME50 −฿50") · paydlg-member-points ใส่จากจอชำระ ("ใส่คูปอง" · แถว 02)
//   — ไม่มีสถานะไหนบันทึกบิลพร้อมคูปอง (ไม่มี CouponRedemption) · ไม่ลบอะไร (ค่าตั้ง/แต้ม/บิล/ระบบคูปองคงอยู่ · บันทึกใน summary memberState) ◂
//
// POS P1.18U ▸ หน้า settings `--states` (--page settings หรือ wo p1.18u*/p118u*) เพิ่ม 8 สถานะ (3 ขนาด · th + LOCALE=en · owner + cashier):
//   settings-general (ทั่วไป · แคชเชียร์ = อ่านอย่างเดียว) · settings-staff (17C · แคชเชียร์ = การ์ดปฏิเสธ) · settings-staff-pin (กล่อง PIN เปิด ใส่ 3 หลัก · ไม่ส่ง) ·
//   settings-shark (ภาพ 10) · settings-shark-account-off (สวิตช์บัญชี → กล่องยืนยันเปิด · ไม่กดยืนยัน · แคชเชียร์ = สวิตช์ปิด) ·
//   settings-history (ลิ้นชักประวัติเปิด ≥ 3 แถว · แคชเชียร์ = ไม่มีปุ่มประวัติ) · settings-channels · settings-offline
//   ข้อมูลประวัติ (seedHistoryOnce): ประวัติของ POS ร้าน QC < 3 แถว ⇒ แก้ค่าทั่วไปจริง 4 ครั้งผ่าน updatePosGeneralSettings (เจ้าของร้าน · บิลพักหมดอายุ +1 แล้วคืน ·
//   ล็อกจอ ±1 แล้วคืน — ค่าสุดท้ายเท่าเดิม) · ≥ 3 แถวแล้ว = ไม่เขียน (รันซ้ำไม่งอก)
//   หน้า register `--states` เพิ่ม register-en (แตะ EN ที่แถบบน md+ · มือถือ = คุกกี้ LOCALE=en (หัว 05ก ไม่มีตัวสลับ) · หลังถ่ายลบคุกกี้ LOCALE/lang คืนภาษาไทย) ·
//   register-empty-catalogue (ภาพ 19ก · เจ้าของเท่านั้น — แคชเชียร์ QC เข้าสาขา fixture ไม่ได้): fixture สาขา SHOP "posqc-vis-empty-<pid>" + ระบบ POS
//   "แคตตาล็อกว่าง (ภาพ QC)" (createSystem + linkUnit + updatePosGeneralSettings shift.requiredRegister=false + registerDevice) ·
//   ไม่มีฟังก์ชันโมดูลสร้าง BusinessUnit / ธง registerV2 ⇒ 2 แถวนี้ใช้คำสั่งเดียวกับ createSystemAction / seed-pos-qc (find-or-create · id ผูก pid —
//   รอบ th/en พร้อมกันไม่ชนกัน · F7) · finally และ SIGINT/SIGTERM/SIGHUP ลบทั้งชุด (เครื่อง · ลิงก์ · ระบบ · สาขา + AuditLog ที่ชี้แถวเหล่านี้) ·
//   ซากสาขา posqc-vis-empty-* อายุ > 1 ชม. (รอบที่ถูก kill -9) กวาดตอนสร้าง ◂
//
// POS P2.1U ▸ ช่องทางขาย (มติ 8 · wo p21u · --page settings|sales|register --states · 3 ขนาด · th + LOCALE=en · owner + cashier):
//   settings: settings-channels (รายการจริง: 4 ช่องทางพื้นฐาน + LINE MAN + Grab ที่สร้างผ่าน saveChannel · Shopee/foodpanda = แถว "เชื่อมต่อ") ·
//   settings-channel-drawer (ลิ้นชัก LINE MAN + ตัวอย่างสด · ไม่บันทึก · แคชเชียร์ = อ่านอย่างเดียว) · settings-channel-create (เจ้าของ: โหมดสร้าง พิมพ์ "ตลาดนัด" · ไม่บันทึก) ·
//   settings-channels-readonly (แคชเชียร์: สวิตช์ปิด · ไม่มีปุ่มเพิ่ม/เชื่อมต่อ)
//   fixture ช่องทาง (ensureChannelFixture): LINEMAN (PLATFORM 30%) + GRAB (PLATFORM 25% + ฿2 · VAT 7%) ของสาขาที่ถ่าย — หาตามรหัส · ไม่มี = สร้าง ·
//   ค่าไม่ตรง = แก้ผ่าน saveChannel (เจ้าของร้าน) · ตรงแล้ว = ไม่เขียน · ไม่ลบ (บิลภาพอ้าง id) · SHOPEE/FOODPANDA มีอยู่แล้ว = ไม่ลบ (แจ้งใน log)
//   sales: bills-channels (วันนี้มีบิลหน้าร้าน + เว็บร้าน + LINE MAN PLATFORM "LM-48152") · bills-drawer-commission (ลิ้นชักบิล LINE MAN — เจ้าของเห็นบล็อกค่าคอมฯ ·
//   แคชเชียร์ = บรรทัดช่องทางอย่างเดียว) — บิล 2 ใบสร้างด้วย createSale (fix รอบ 1 F1: คีย์ต่อรอบ posqc-vis-p21u-<pid>-<n>-web|lineman · เจ้าของสร้างคู่ใหม่ทุกรอบ ·
//   แคชเชียร์ใช้คู่ล่าสุดของวันนี้ซ้ำเมื่ออยู่หน้าแรก · ก่อนถ่ายยืนยันหน้าแรกด้วย billsPageData (หลุด = สร้างคู่ใหม่ + โหลดหน้าใหม่) · ไม่ลบ)
//   register: paydlg-platform (บิลพักที่มี channelId ของ LINE MAN · holdRegisterCart ต่อภาพ → เรียกคืน → ชำระ → ช่อง "แพลตฟอร์ม" เลือกไว้ · ไม่ยืนยัน ·
//   บิลพักที่ยังค้างลบใน finally) ◂
//
// POS HF-P1CLOSE ▸ สถานะเพิ่มของ vis58 (มติผู้คุม O5/O6/O8/O9/O11 · --states):
//   register: held-drawer (14B · พักบิลใหม่ต่อภาพด้วย holdRegisterCart → ลิ้นชัก "บิลที่พัก" · 390 = ใส่สินค้า 1 ชิ้นก่อนเปิดแผ่นตะกร้า
//   เพราะมือถือเปิดแผ่นตะกร้าได้เมื่อมีรายการเท่านั้น · ที่ค้างทิ้งใน finally/signal ด้วย discardHeldCart) ·
//   sale-done เพิ่ม 390 (th) · lock-screen-scroll (390 · 13B เลื่อนจอล็อกลงสุด → การ์ดพนักงาน/สลับพนักงาน/บิลพักต้องอยู่ในจอ · ภาพเท่าจอ ไม่ fullPage) ·
//   paydlg-promptpay-timeout (19ค · ใบ PROMPTPAY_STATIC ของเครื่องรอบนี้ → เลื่อน expiresAt ของใบนั้นเป็นอดีต (แถวของรอบนี้เท่านั้น) →
//   โพลของจอเขียน EXPIRED เอง (CD-E) → การ์ด "QR หมดอายุ" + ปุ่มสร้างใหม่)
//   settings: paydone-print-failed (19ค · เครื่อง 2 สลับ printerConfig เป็น USB ด้วย updateDevice (เบราว์เซอร์นี้ไม่ได้จับคู่) → ขายเงินสด 1 บิล →
//   พิมพ์ใบเสร็จ → NO_DEVICE = การ์ด "พิมพ์ไม่สำเร็จ" + ลองใหม่ + พิมพ์ผ่านเบราว์เซอร์ · คืน printerConfig เบราว์เซอร์ทันทีหลังการ์ดขึ้น)
//   receipt-public: rpub-* ถ่าย 3 ขนาด (th + LOCALE=en) ยกเว้น rpub-issue-sent = 390 เท่านั้น (เขียนแถวแจ้งปัญหาจริง · เพดาน 3 แถว/บิล/วัน)
//   `--list` = พิมพ์รายการหน้า + id สถานะทั้งหมด (ไม่ต่อ DB · ไม่ต้องมี <wo>) ◂
//
// POS P2.9bU ▸ มัดจำ (มติผู้คุม P2.9bU ข้อ 9 · wo p2.9bu · --page register|sales|settings --states (ไม่ส่ง --page = 3 หน้านี้) · 3 ขนาด · th + LOCALE=en ·
//   owner ทุกสถานะ · cashier = paydlg-deposit-pick · paydlg-deposit-split · deposit-receive · sale-done-deposit): register = pick/split/exceeds/notowner/locked/receive/sale-done ·
//   sales = bills-deposit-filter · refund-deposit (ไม่ยืนยัน) · settings = settings-deposit-toggle (ไม่กด) · fixture ผ่าน pos/deposit.ts (registerTakeDeposit · walk-in + เบอร์
//   ค่าคงที่ของ fixture — ไม่พิมพ์ลง log/ชื่อไฟล์) · locked = checkDepositPhone ผิด 5 ครั้งผ่านโมดูล · exceeds = ใช้มัดจำ ฿1 ผ่าน submitRegisterSale ระหว่างเลือกกับยืนยัน ·
//   เก็บกวาด (หลังงานสุดท้าย/finally/สัญญาณ): คืนเงินมัดจำของรอบที่ยังเหลือผ่าน registerRefundDeposit (โอน) · คืนค่าตั้งรับมัดจำเดิม · บิลคงอยู่ (แบบ sale-done) ◂
// POS P2.9U ▸ จอชำระบัตรของขวัญ/เครดิตร้าน/ทิป · 02b · คืนเข้าบัตร (12) · บัญชีพักทิป (มติผู้คุม P2.9U ข้อ 10 · wo p2.9u · --page register|sales|settings --states ·
//   3 ขนาด · th + LOCALE=en · owner + cashier): register = paydlg-giftcard-entry · paydlg-giftcard-split (เงินสด ฿300 + บัตร ฿325 บนตะกร้า 02) ·
//   paydlg-giftcard-pin-error · paydlg-giftcard-insufficient · paydlg-giftcard-changed · paydlg-storecredit · paydlg-tip · sale-done-giftcard (1440 · ⚠️ บิล PAID จริง
//   1 ใบต่อผู้ใช้: บัตร + เงินสด) · sales = refund-to-card (บิลของ sale-done-giftcard · หน้าต่างคืนเงิน + ชิปบัตร · ไม่กดยืนยัน) · settings = settings-tip-ledger
//   fixture (ensureP29uFixture · พังไม่โยน): เปิดบัตรกำนัลของร้าน QC (setSettings · คืนค่าเดิมตอนเก็บกวาด) · ขายบัตร 4 ใบผ่าน giftcard.sell (เงินสด · บิลขายบัตรคงอยู่)
//   แล้วตั้ง PIN เป็นค่าคงที่ของ fixture ด้วยสูตรแฮชของโมดูล (sha256 "<เลข>:<PIN>" — giftcard/service.ts sell) · ค่า PIN ไม่พิมพ์ลง log/ชื่อไฟล์ ·
//   เครดิตร้านของสมาชิก QC ผ่าน member.issueStoreCredit (คีย์ต่อวัน — เติมครั้งเดียวต่อวัน) · ทิป: เปิด tip + บัญชีหนี้สินของสมุดที่เชื่อม (updatePosPaymentSettings ·
//   คืนค่าเดิมหลังภาพทิปสุดท้าย) · GIFT_CARD_CHANGED = ตัดยอดบัตรผ่าน giftcard.use ระหว่างค้นกับยืนยัน · เก็บกวาด: ระงับบัตรของรอบ (giftcard.suspend) ยกเว้น
//   บัตรของบิล sale-done-giftcard (คง ACTIVE ยอด ฿175 ให้ refund-to-card · fix1 V3 — รอบหน้าบิลเลือกบิลบัตรล่าสุดที่บัตรยัง ACTIVE) ·
//   คืนค่าตั้งบัตร/ทิป · บิลขายคงอยู่ (แบบ sale-done) ◂
// POS P2.11U ▸ หลายสาขา (มติ 11 · wo p2.11u · --states · ไม่ส่ง --page = products/reports/settings/stock (fix1 มติ 4: ไม่มี sales) · 3 ขนาด · th + LOCALE=en · owner + manager):
//   products-branch-filter · products-branch-copy (เจ้าของ · ไม่กดคัดลอก) · products-branch-compare · products-dead-row-note · products-manager-branch (ผู้จัดการ) ·
//   reports-channels · settings-receipt-branch (เจ้าของ) · stock-shared-inventory — ตารางใน P211U_PLAN · fixture/เก็บกวาดใน ensureP211uFixture/cleanupP211u ·
//   --user manager = ผู้จัดการ{สาขาสีลม} ของภาพ (User + Membership MANAGER สร้าง/ใช้ซ้ำก่อน mint session · ทางเข้าเดียวกับ owner/cashier) — ใช้ได้เฉพาะ wo p2.11u ◂
// POS P2.10 ▸ จอลูกค้า (มติ 11 · wo p2.10 · --states · เจ้าของร้าน · ไม่ส่ง --page = settings + display · th + LOCALE=en):
//   หน้า display (/d · หน้าสาธารณะ) 1280×800 + 1024×768 (en = 1280): display-pair · display-idle · display-cart · display-member-stamps ·
//   display-paying-promptpay · display-paying-cash · display-paying-card · display-done · display-stale · display-unsupported · display-live (1280 เท่านั้น) ·
//   หน้า settings 3 ขนาด: settings-display-unpaired · settings-display-code · settings-display-online — ตารางใน P210_PLAN · fixture/เก็บกวาดใน
//   ensureP210Fixture/prepP210/cleanupP210 · ไม่มี --states = หน้า display ภาพเดียวต่อขนาด (ฟอร์มจับคู่) ◂
// POS P2.13 ▸ การ์ดคีย์ API ของระบบขายหน้าร้าน (U-lite §7 · wo p2.13 · --states · ไม่ส่ง --page = settings · 3 ขนาด · th + LOCALE=en · owner + manager):
//   แท็บ shark: settings-shark-api-keys-empty → -create (กรอกกล่อง ไม่ส่ง) → -raw (⚠️ สร้างคีย์จริงผ่าน UI 1 ใบ · ใบก่อนหน้าของรอบถูกลบก่อนภาพ) →
//   -list (+ คีย์ fixture 2 ใบผ่าน api-keys/service: อ่านอย่างเดียว·สีลม·ใช้ล่าสุด และ ผู้ดูแล·เพิกถอนแล้ว) → -revoke (กล่องยืนยัน ไม่กดยืนยัน) ·
//   developers-pos = หน้าสาธารณะ /developers/pos (ไม่ส่งคุกกี้ session · คาด 200 + [data-testid=developers-pos]) — ตารางใน P213_PLAN ·
//   ชื่อคีย์ทุกใบของรอบลงท้าย "(QC <pid>)" · เก็บกวาด (หลังงานสุดท้าย/finally/สัญญาณ) = ลบคีย์ของรอบ · ซากของ pid ที่ตายแล้วกวาดก่อนงานแรก ·
//   🔴 รัน th/en และ owner/manager ทีละรอบ (empty ต้องไม่มีคีย์ของระบบ POS ร้าน QC เลย) · --user manager ใช้ MANAGER_VIS ของ P2.11U (allUnits false = ต้องเลือกสาขา) ◂
// POS P2.12U ▸ รายงาน 08 + บิล 12 + การ์ดเกณฑ์ (มติ 8 · wo p2.12u · --states · ไม่ส่ง --page = reports + sales + settings · 3 ขนาด (หน้าพิมพ์ 1440 · สื่อ print) ·
//   th + LOCALE=en · owner + cashier): reports-hourly · reports-branches-tab · reports-anomalies (แคชเชียร์ = การ์ดปฏิเสธของหน้า) · reports-anomalies-empty ·
//   reports-staff-flag · reports-pdf-button · reports-print-overview · reports-print-channels · settings-general-anomaly (เจ้าของ) · bills-all-branches ·
//   bills-drawer-channel-refund — ตารางใน P212U_PLAN · fixture/เก็บกวาดใน ensureP212uFixture/cleanupP212u (บิลคีย์ต่อวันผ่าน createSale/voidSale/refundSale ·
//   เกณฑ์จุดผิดปกติลดชั่วคราวผ่าน updatePosGeneralSettings แล้วคืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ) ◂
// POS P3.5U ▸ HR × POS (มติ 10 · wo p3.5u · --states · ไม่ส่ง --page = register + shifts + settings + reports · 3 ขนาด · th + LOCALE=en · owner + cashier):
//   13b-schedule-chip-today · 13b-schedule-chip-leave · 13b-offschedule-refusal · 13b-override-sheet · 13b-override-wrong-pin (แคชเชียร์) · 13a-shift-list-hr ·
//   17c-staff-hr-switch-owner · 17c-staff-schedule-gate-card · 17c-staff-commission-card · 07-shift-clock-ask-in · 07-shift-clock-ask-out · 07-shift-hours-owner ·
//   07-shift-hours-warnings · 08-report-commission-owner · 08-report-commission-denied (แคชเชียร์) — ตารางใน P35U_PLAN · fixture/เก็บกวาดใน ensureP35uFixture/
//   prepP35u/cleanupP35u (ระบบ HR ชั่วคราว + พนักงานผูกผู้ใช้ QC ผ่านฟังก์ชันของ HR · ค่าตั้งด่าน/ค่าคอมฯ คืนค่าเดิม · ลบหลังงานสุดท้าย/finally/สัญญาณ) ◂
// POS P3.4U ▸ ออฟไลน์ 19ง (มติ 11 · wo p3.4u · --states · ไม่ส่ง --page = register + shifts + settings · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier):
//   offline-sale · offline-queue · offline-tenders · offline-sync-back · offline-slip · offline-lock-pin (หน้าขาย) · offline-rejected · offline-close-blocked (หน้ากะ เจ้าของ) ·
//   settings-offline-live (แท็บออฟไลน์ เจ้าของ) — ตารางใน P34U_PLAN · ทุกสถานะ = browser context ใหม่ · ธงเปิดด้วย updatePosOfflineEnabled แล้วคืนค่าเดิม ·
//   fixture/เก็บกวาดใน ensureP34uFixture/prepP34u/cleanupP34u (บิลราคาปลอม → คิวผู้จัดการ → ทิ้งตอนเก็บกวาด) · สถานะเดิม offline / settings-offline ไม่แตะ ◂
// POS P3.9U ▸ ผู้ช่วย AI 08/10 (มติ 1 4 6 · wo p3.9u · --states · ไม่ส่ง --page = reports + settings · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier):
//   reports-ai-panel-brief · reports-ai-panel-empty · reports-ai-panel-refused (แคชเชียร์) · reports-ai-panel-off · reports-anomalies-a11 · settings-general-anomaly-a11 ·
//   settings-ai-card-off · settings-ai-card-linked · settings-ai-brief-sheet · settings-ai-brief-sheet-invalid — ตารางใน P39U_PLAN · fixture/เก็บกวาดใน
//   ensureP39uFixture/prepP39u/cleanupP39u (บิลคีย์ต่อวันผ่าน createSale/voidSale แบบ P2.12U ไม่ลบ · settings.pos.ai = jsonb ของ harness เท่านั้น (CD-P39U-4) จำค่าเดิมไว้ใน
//   คีย์ _qcP39uBefore แล้วคืนหลังงานสุดท้าย/finally/สัญญาณ · audit pos.staff.schedule_override ×3 ผ่าน writeAudit (CD-P39U-5) ลบตอนเก็บกวาด · ผู้จัดการชั่วคราวของภาพ ลบ Membership ตอนเก็บกวาด) ◂
// POS P3.7U ▸ แชท 10/09/02b (CD-P37U-1…10 · wo p3.7u · --states · ไม่ส่ง --page = settings + orders + register · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier):
//   settings-chat-card-off · settings-chat-card-on · settings-chat-card-readonly (แคชเชียร์) · settings-chat-sheet · settings-chat-sheet-invalid · orders-detail-chat-paylink (owner + cashier) ·
//   orders-detail-chat-nolink · orders-detail-chat-sent · orders-chat-card-requested · paydone-line-auto (1440 · ⚠️ ขายจริง 1 บิลผูกสมาชิก QC) — ตารางใน P37U_PLAN · fixture/เก็บกวาดใน
//   ensureP37uFixture/prepP37u/cleanupP37u (settings.pos.chat = jsonb ของ harness · ค่าเดิมใน settings.pos._qcP37uBefore · ระบบแชทชั่วคราว + WEBCHAT (ส่ง no-op) · ออเดอร์ผ่าน ingestOrder ·
//   ด่าน LINE CONNECTED = 0 ก่อนสถานะที่เปิดสวิตช์ · ไม่มีข้อความ LINE จริงออกจากรอบนี้) · สถานะเดิม settings-shark/orders-mixed ไม่แตะ ◂
// POS P3.6U ▸ ลูกค้าองค์กร/วางบิล 01/02/02b/12/08/10 (CD-P36U-1…12 · wo p3.6u · --states · ไม่ส่ง --page = register + sales + reports + settings · 3 ขนาด · th + LOCALE=en 1440
//   (+390 ของ register/sales ตาม EN_MOBILE_PAGES) · owner 15 + cashier 6 ต่อภาษา · context ใหม่ทุกสถานะ · ไม่ reseed · ร้าน coffee เท่านั้น) — ตารางใน P36U_PLAN · fixture/เก็บกวาดใน
//   ensureP36uFixture/prepP36u/cleanupP36u (ระบบ CRM ของร้าน QC: ใช้ตัวที่มี/สร้าง "ลูกค้าองค์กร (ภาพ QC P3.6U)" แล้วเก็บไว้ · บริษัท -co/-co2 + ดีล + ผู้ติดต่อสมาชิกผ่านตัวเขียน CRM ·
//   วงเงินผ่าน saveCreditAccount · settings.pos.credit/.orders.memberOnBill = jsonb ของ harness (ค่าเดิมใน _qcP36uBefore · ด่านร้าน QC ก่อนเขียน) · ผู้จัดการ + PIN ของภาพ ·
//   ⚠️ paydone-onaccount-due ขายจริง 1 บิลวางบิล → voidSale ตอนเก็บกวาด) ◂
// POS P3.8U ▸ CD-P38U-11: wo p3.8u + --states = แท็บบอร์ดงานและห้องทีม (off · on · readonly · invalid · room-stale · ลิงก์การ์ด KANBAN) · แถวจุดผิดปกติ (ปุ่ม · กดจริง · ชิป) ·
//   แผง AI ปุ่มบอร์ด · หน้ากะ (ชิปการ์ด · บรรทัด "เมื่อปิดกะ") — ตาราง P38U_PLAN · fixture/ด่าน/เก็บกวาดใน ensureP38uFixture/prepP38u/cleanupP38u ◂
// 🔴 ไม่มีค่าปริยายของ base — ไม่ส่ง `--base`/`QC_BASE` = exit 2 · ต่อไม่ได้ = exit 2 · `:3215` = exit 2
//    (พอร์ต 3215 เป็นของเซิร์ฟเวอร์ CRM RUN — LANE-RULES ข้อ 4 · ตั้ง POS_VISUAL_ALLOW_3215=1 เมื่อ CRM ปิดแล้วเท่านั้น)
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้องมีเซิร์ฟเวอร์ + chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ: ปักธง userAgent `qc-visual-pos` · ลบ "เฉพาะ id ของรอบนี้" ใน finally + กวาดซากที่หมดอายุแล้ว
//    (ห้าม process.exit() ระหว่าง mint→finally — exit ข้าม finally = token ค้างในฐาน QC)
// 🔴 โปรไฟล์ chromium (`/tmp/chr-pos-<pid>` + สำเนาใน snap-private-tmp) ลบทุกครั้ง ทั้งจบปกติ/ตาย/ถูก Ctrl-C
//    (snap chromium ทิ้งโปรไฟล์ ~GB ต่อรอบ — เคยทำดิสก์ VPS 99%) · ลบเฉพาะของ pid นี้ ห้ามกวาด /tmp

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { PQC, POS_PAGES, POS_VIEWPORTS, POS_DISPLAY_VIEWPORTS, type PosPage } from "./pos-qc-env.mjs"; // POS P2.10 ▸ + POS_DISPLAY_VIEWPORTS ◂
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. อาร์กิวเมนต์ ═══════════════════
const argv = process.argv.slice(2);
const flag = (name: string): string | null => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? null) : null);
const DRY = argv.includes("--dry");
// POS HF-P1CLOSE ▸ --list ไม่ต้องมี <wo> (ใช้ชื่อ "list" ผ่านด่านตรวจชื่อเดิม) ◂
const LIST = argv.includes("--list");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : LIST ? "list" : null;
const USERS = ["owner", "cashier", "manager"] as const; // POS P2.11U ▸ มติ 11: + manager (ผู้จัดการสาขาสีลมของภาพ · ใช้ได้เฉพาะ wo p2.11u ร้าน coffee) ◂
type UserKey = (typeof USERS)[number];
const userKey = (flag("--user") ?? "owner") as UserKey;
const tenantKey = (flag("--tenant") ?? "coffee") as "coffee" | "resto";
const onlyPage = flag("--page");
// POS P2.11U ▸ มติ 11: wo p2.11u = สถานะหลายสาขาของหน้า products/reports/settings/stock เท่านั้น (fix1 มติ 4: ชิปบิลถูกถอด — ไม่มี sales) (ไม่ส่ง --page = 4 หน้านี้) ◂
const P211U_WO = /^p2\.?11u/i.test(WO ?? "");
const P211U_PAGES = ["products", "reports", "settings", "stock"] as const satisfies readonly PosPage[];
// POS P2.10 ▸ มติ 11: wo p2.10 = จอลูกค้า (หน้า display /d) + บล็อกจอลูกค้าของหน้าตั้งค่า (ไม่ส่ง --page = settings + display) ◂
const P210_WO = /^p2\.?10(?![0-9])/i.test(WO ?? "");
// POS P2.13 ▸ wo p2.13 = การ์ดคีย์ API ในแท็บ shark + หน้าสาธารณะ /developers/pos (ไม่ส่ง --page = settings) ◂
const P213_WO = /^p2\.?13(?![0-9])/i.test(WO ?? "");
// POS P2.12U ▸ มติ 8: wo p2.12u = สถานะรายงาน/บิล/ตั้งค่าของใบนี้ (ไม่ส่ง --page = reports + sales + settings) ◂
const P212U_WO = /^p2\.?12u/i.test(WO ?? "");
const P212U_PAGES = ["reports", "sales", "settings"] as const satisfies readonly PosPage[];
// POS P3.5U ▸ มติ 10: wo p3.5u = สถานะ HR ของใบนี้ (ไม่ส่ง --page = register + shifts + settings + reports) ◂
const P35U_WO = /^p3\.?5u/i.test(WO ?? "");
const P35U_PAGES = ["register", "shifts", "settings", "reports"] as const satisfies readonly PosPage[];
// POS P3.4U ▸ มติ 11: wo p3.4u = สถานะออฟไลน์ของใบนี้ (ไม่ส่ง --page = register + shifts + settings) ◂
const P34U_WO = /^p3\.?4u/i.test(WO ?? "");
const P34U_PAGES = ["register", "shifts", "settings"] as const satisfies readonly PosPage[];
// POS P3.9U ▸ มติ 6: wo p3.9u = สถานะผู้ช่วย AI ของใบนี้ (ไม่ส่ง --page = reports + settings) ◂
const P39U_WO = /^p3\.?9u/i.test(WO ?? "");
const P39U_PAGES = ["reports", "settings"] as const satisfies readonly PosPage[];
// POS P3.7U ▸ CD-P37U: wo p3.7u = สถานะแชทของใบนี้ (ไม่ส่ง --page = settings + orders + register) ◂
const P37U_WO = /^p3\.?7u/i.test(WO ?? "");
const P37U_PAGES = ["settings", "orders", "register"] as const satisfies readonly PosPage[];
// POS P3.6U ▸ CD-P36U-12: wo p3.6u = สถานะลูกค้าองค์กร/วางบิลของใบนี้ (ไม่ส่ง --page = register + sales + reports + settings) ◂
const P36U_WO = /^p3\.?6u/i.test(WO ?? "");
const P36U_PAGES = ["register", "sales", "reports", "settings"] as const satisfies readonly PosPage[];
// POS P3.8U ▸ CD-P38U-11: wo p3.8u = สถานะบอร์ดงาน/ห้องทีมของใบนี้ (ไม่ส่ง --page = settings + reports + shifts) ◂
const P38U_WO = /^p3\.?8u/i.test(WO ?? "");
const P38U_PAGES = ["settings", "reports", "shifts"] as const satisfies readonly PosPage[];
// POS P3-SKEL U ▸ CD-SKELU-12: wo p3-skel-u = สถานะโครงแพลตฟอร์มของใบนี้ (ไม่ส่ง --page = settings + register + sales + reports) ◂
const P3SKU_WO = /^p3-?skel-?u/i.test(WO ?? "");
const P3SKU_PAGES = ["settings", "register", "sales", "reports"] as const satisfies readonly PosPage[];
// POS P2.7U ▸ มติ 15: wo p2.7 = หน้าสาธารณะ QR (/q/**) + จอ 09 + จอโต๊ะ + ลิ้นชักช่องทาง (ไม่ส่ง --page = qr-public + orders + tables + settings) ◂
const P27_WO = /^p2\.?7(?![0-9])/i.test(WO ?? "");
const P27_PAGES = ["qr-public", "orders", "tables", "settings"] as const satisfies readonly PosPage[];

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
if (userKey === "manager" && ((!P211U_WO && !P213_WO) || tenantKey !== "coffee")) die("--user manager ใช้ได้เฉพาะ wo p2.11u / p2.13 ร้าน coffee (ผู้จัดการสาขาของภาพหลายสาขา · POS P2.11U มติ 11 · P2.13 การ์ดคีย์ API)"); // POS P2.11U ◂ · POS P2.13 ▸ + p2.13 ◂

const T = PQC[tenantKey];
// POS P2.11U ▸ มติ 11: ผู้จัดการสาขาสีลมของภาพ — ไม่อยู่ใน seed · ensureManagerUser สร้าง/ใช้ซ้ำ (User + Membership MANAGER unitAccess [สีลม]) ก่อน mint session ◂
const MANAGER_VIS = { userId: "posqc-coffee-user-manager-vis", membershipId: "posqc-coffee-mb-manager-vis", email: "pos-qc-coffee-manager-vis@shark.local", name: "ผู้จัดการสีลม (ภาพ QC P2.11U)", role: "MANAGER", units: ["silom"] } as const;
const U = userKey === "manager" ? MANAGER_VIS : T.users[userKey];
/** POS P2.11U ▸ ผู้ใช้ QC ตามคีย์ (manager = ผู้จัดการของภาพ · ไม่อยู่ใน PQC) ◂ */
const userOf = (k: UserKey) => (k === "manager" ? MANAGER_VIS : T.users[k]);
// สาขาที่ผู้ใช้เข้าได้ (แคชเชียร์ = สาขาเดียว) — ใส่ ?unit= ให้หน้าขายเปิดสาขาที่ถูก
const unitKey = U.units[0] === "*" ? Object.keys(T.units)[0]! : U.units[0]!;
const unitId = (T.units as Record<string, { id: string }>)[unitKey]!.id;
const SYS = T.systems.POS.id;
// POS P2.9bU ▸ wo p2.9bu ไม่ส่ง --page = หน้าขาย/บิล/ตั้งค่า (สถานะมัดจำ) ◂
const P29BU_WO = /^p2\.?9bu/i.test(WO ?? "");
const pages: PosPage[] = onlyPage ? [onlyPage as PosPage] : P27_WO ? [...P27_PAGES] /* POS P2.7U */ : P213_WO ? ["settings"] /* POS P2.13 */ : P210_WO ? ["settings", "display"] /* POS P2.10 */ : P211U_WO ? [...P211U_PAGES] : P212U_WO ? [...P212U_PAGES] /* POS P2.12U */ : P3SKU_WO ? [...P3SKU_PAGES] /* POS P3-SKEL U */ : P36U_WO ? [...P36U_PAGES] /* POS P3.6U */ : P37U_WO ? [...P37U_PAGES] /* POS P3.7U */ : P38U_WO ? [...P38U_PAGES] /* POS P3.8U */ : P39U_WO ? [...P39U_PAGES] /* POS P3.9U */ : P34U_WO ? [...P34U_PAGES] /* POS P3.4U */ : P35U_WO ? [...P35U_PAGES] /* POS P3.5U */ : P29BU_WO ? ["register", "sales", "settings"] : [...POS_PAGES]; // POS P2.11U ◂ · POS P2.9bU ◂
/**
 * สิ่งที่คาดต่อหน้า ต่อบทบาท (HTTP) — owner ต้องได้ 200 · cashier = "record" (บันทึกอย่างเดียว ไม่ตัดสิน)
 * จนกว่าผู้คุมงานรันจริงครั้งแรกแล้วกำหนด 200|404 ตามพฤติกรรมจริง (มติรอบ 2 · ใบ P1.15/P4.2 เป็นเจ้าของตาราง)
 */
const PAGE_EXPECT: Record<PosPage, Record<UserKey, number | "record">> = {
  register: { owner: 200, cashier: "record", manager: "record" },
  sales: { owner: 200, cashier: "record", manager: 200 },
  products: { owner: 200, cashier: "record", manager: 200 },
  close: { owner: 200, cashier: "record", manager: "record" },
  // POS P1.17 U ▸ แคชเชียร์ QC ไม่มี pos.report.view ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-report-refusal) · ไม่ 404/500 ◂
  reports: { owner: 200, cashier: 200, manager: 200 },
  // POS P1.14 U ▸ แคชเชียร์ QC ไม่มี pos.stock.count / สิทธิ์คลัง ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-stock-refusal) ◂
  stock: { owner: 200, cashier: 200, manager: 200 },
  // POS P1.9 U ▸ แคชเชียร์ QC ไม่มี pos.shift.operate/manage ⇒ หน้า 200 + การ์ดปฏิเสธ (pos-shift-refusal) ◂
  shifts: { owner: 200, cashier: 200, manager: "record" },
  // POS P1.11U ▸ หน้าสาธารณะ (ไม่อ่าน session) ⇒ 200 ทุกบทบาท · rpub-not-found = 404 (ต่อสถานะ ดู RPUB_STATE_PLAN) ◂
  "receipt-public": { owner: 200, cashier: 200, manager: "record" },
  // POS P1.10 U ▸ แคชเชียร์ QC มี pos.sale.create ⇒ แท็บใบเสร็จอ่านอย่างเดียว · แท็บเครื่อง = การ์ดปฏิเสธ (หน้า 200) ◂
  settings: { owner: 200, cashier: 200, manager: 200 },
  // POS P2.4U ▸ หน้าโต๊ะ: แคชเชียร์ QC มี pos.sale.create ⇒ หน้า 200 (เปิดโต๊ะ/ส่งครัวถูกปฏิเสธที่เซิร์ฟเวอร์ — ไม่มีคีย์ restaurant.*) ◂
  tables: { owner: 200, cashier: 200, manager: "record" },
  // POS P2.8U ▸ หน้าออเดอร์: แคชเชียร์ QC มี pos.sale.create (อ่านออเดอร์ได้) ⇒ หน้า 200 · ไม่มี pos.order.accept/reject ⇒ กระดานอ่านอย่างเดียว (ปุ่มปิด + tooltip) ◂
  orders: { owner: 200, cashier: 200, manager: "record" },
  // POS P2.6U ▸ จอครัว: แคชเชียร์ QC มี pos.sale.create (อ่านบอร์ดได้ — NEED.read) ⇒ หน้า 200 · ไม่มี restaurant.kds.* ⇒ ปุ่มปิด + tooltip ◂
  kds: { owner: 200, cashier: 200, manager: "record" },
  // POS P2.10 ▸ จอลูกค้า /d: หน้าสาธารณะ (ไม่อ่าน session) ⇒ 200 ทุกบทบาท ◂
  display: { owner: 200, cashier: 200, manager: "record" },
  // POS P2.7U ▸ หน้าสาธารณะ QR /q/** (ไม่อ่าน session) ⇒ 200 ทุกบทบาท (โทเคนใช้ไม่ได้ = การ์ด 200 · รูปผิด = 404) ◂
  "qr-public": { owner: 200, cashier: 200, manager: "record" },
};
// POS P1.17 U ▸ wo ขึ้นต้น p1.17: REPORT_QUERY (env) ต่อท้ายหน้า reports เช่น "kind=daily&from=2026-10-01&to=2026-10-07" (ภาพจาก URL เดียวกันได้มุมมองเดียวกัน) ◂
const REPORT_QUERY = /^p1\.17/i.test(WO) && /^[A-Za-z0-9=&_.-]+$/.test(process.env.REPORT_QUERY ?? "") ? `?${process.env.REPORT_QUERY}` : "";
const pathOf = (p: PosPage) => p === "qr-public" ? "/q/t/<p27:q1>" /* POS P2.7U ▸ ภาพเฉพาะ --states (p27Path) ◂ */ : p === "display" ? `/d${LOCALE_EN ? "?lang=en" : ""}` /* POS P2.10 */ : `/app/sys/${SYS}/pos/${p}${p === "register" || p === "stock" || p === "shifts" || p === "settings" || p === "tables" || p === "orders" || p === "kds" ? `?unit=${unitId}` : p === "reports" ? REPORT_QUERY : ""}`; // POS P2.4U ▸ + tables ◂ · POS P2.8U ▸ + orders ◂
const OUT = `${PQC.shotsDir}/${WO}`;
const fileOf = (p: PosPage, w: number, h: number) => `${OUT}/${p}-${userKey}-${w}x${h}.png`;

// ── POS P1.3 ▸ แผนสถานะของหน้าขายใหม่ ──
const STATES_ON = /^p1\.3/i.test(WO) || argv.includes("--states");
// POS P2.12U ▸ pdf probe ◂ --pdf = หลังภาพหน้าพิมพ์ (reports-print-overview/-channels เท่านั้น) เขียน page.pdf A4 ด้วย · ปิดเป็นค่าเริ่ม (รอบอื่นไม่เปลี่ยน)
const PDF_PROBE = argv.includes("--pdf");
const LOCALE_EN = process.env.LOCALE === "en";
type Device = (typeof POS_VIEWPORTS)[number]["name"] | (typeof POS_DISPLAY_VIEWPORTS)[number]["name"]; // POS P2.10 ▸ + display/ipad-land ◂
type StateKey = "held-drawer" | "paydlg-promptpay-timeout" | "paydlg-platform" | "register-en" | "register-empty-catalogue" | "default" | "cart3" | "cart4-01" | "line-editor" | "bill-discount" | "custom-item" | "paydlg-cash" | "paydlg-promptpay-qr" | "paydlg-promptpay-paid" | "paydlg-card-edc" | "sale-done" | "search-empty" | "stock-warn" | "offline" | "mobile-sheet" | "options-popover" | "weigh" | "taxinvoice-dialog" | "taxinvoice-set" | MemberStateKey | P115StateKey | StockStateKey | ShiftsStateKey | BillsStateKey | SettingsStateKey | RpubStateKey | P22uProductsKey | P22uRegKey | P23uProductsKey | P23uRegKey | P24uTablesKey | P24uRegKey | P28uOrdersKey | P28uRegKey | P26uKdsKey | P26uOtherKey | P29uRegKey | P29uOtherKey | P29buKey | P25uTablesKey | P25uRegKey | P211uKey | P212uKey | P210Key | P213Key | P27Key | P35uKey | P34uKey | P39uKey /* POS P3.9U */ | P37uKey /* POS P3.7U */ | P38uKey /* POS P3.8U */ | P36uKey /* POS P3.6U */ | P3skuKey /* POS P3-SKEL U */; // POS P3.4U ▸ + P34u ◂ // POS P3.5U ▸ + P35u ◂ // POS P2.7U ▸ + P27 ◂ // POS P2.12U ▸ + P212u ◂ · POS P2.13 ▸ + P213 ◂ · POS P2.10 ▸ + P210 ◂ · POS P2.11U ▸ + P211u ◂ · POS P2.4U ▸ + P24u ◂ · POS P2.8U ▸ + P28u ◂ · POS P2.6U ▸ + P26u ◂ · POS P2.9U ▸ + P29u ◂ · POS P2.5U ▸ + P25u ◂
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
  // POS HF-P1CLOSE ▸ มติ O11 (19ค): ใบ STATIC ของรอบนี้หมดเวลา (expiresAt อดีต) → โพลเขียน EXPIRED → การ์ด "QR หมดอายุ" + สร้างใหม่ ◂
  { key: "paydlg-promptpay-timeout", devices: ["desktop", "ipad", "mobile"], note: "cart3 + ชำระ → พร้อมเพย์ (PENDING) → เลื่อน expiresAt ของใบรอบนี้เป็นอดีต → การ์ด \"QR หมดอายุ\" + ปุ่มสร้างใหม่" },
  { key: "paydlg-card-edc", devices: ["desktop", "ipad", "mobile"], note: "cart3 + ชำระ → บัตร (Beam ปิด) = EDC · ใส่เลขอ้างอิง" },
  { key: "sale-done", devices: ["desktop", "mobile"], note: "⚠️ ขายจริง 1 บิลต่อภาพ (อเมริกาโน่×2 + ลาเต้ · เงินสด) → ขายสำเร็จ · HF-P1CLOSE: + 390 (มติ O9)" },
  { key: "search-empty", devices: ["desktop", "ipad", "mobile"], note: "ค้นคำที่ไม่มี → กล่องไม่พบ" },
  { key: "stock-warn", devices: ["desktop", "ipad", "mobile"], note: "สินค้าเหลือ 2 ×3 → กล่องเตือนสต็อกในบรรทัด (19ฉ)" },
  // B2.5 (ภาพ 19ง): ออฟไลน์ = puppeteer setOfflineMode → แถบดำ + ปุ่มชำระปิด
  //   ข้าม "แคตตาล็อกว่าง" (19): ต้องมีสาขา POS ที่ไม่มีสินค้า/หมวดเลย — ร้าน QC มีแคตตาล็อกเต็ม สร้างสาขาชั่วคราว (BusinessUnit + ผูก POS) เกินขอบเขตสคริปต์ภาพ
  { key: "offline", devices: ["desktop", "ipad", "mobile"], note: "cart3 แล้วตัดเน็ต (setOfflineMode) → แถบออฟไลน์ + ชำระปิด" },
  { key: "mobile-sheet", devices: ["mobile"], note: "cart3 + แผ่นตะกร้าเปิด" },
  // P1.2 U R2 (ภาพ 01 ป๊อปโอเวอร์): สินค้าชั่วคราวมีตัวแปร + 4 กลุ่ม → เลือกตัวแปร · M +10 · นมโอ๊ต +15 · จำนวน 2
  { key: "options-popover", devices: ["desktop", "ipad", "mobile"], note: "ตัวเลือก/ตัวแปร: ป๊อปโอเวอร์ยึดการ์ด (390 = แผ่นล่าง) · เลือก 2 กลุ่ม + จำนวน 2" },
  { key: "weigh", devices: ["desktop", "mobile"], note: "สินค้าชั่ง ฿350/กก. → กล่องน้ำหนัก (owner พิมพ์ 250 กรัม · cashier = ต้องมีสิทธิ์)" },
  // POS P1.13U ▸ ภาพ 15A / 02 ท้ายจอ — สมุด QC ต้องออกใบกำกับอย่างย่อได้ (ensureAbbBook ก่อนเปิด chromium · คืนค่าใน cleanRpub) ◂
  { key: "taxinvoice-dialog", devices: ["desktop", "ipad", "mobile"], note: "cart3 → ปุ่ม \"ใบกำกับเต็มรูป\" ท้ายตะกร้า → 15A นิติบุคคล + เลข QC (✓) · ปุ่ม DBD หรือ \"กรอกเอง\" (QC ไม่มีกุญแจ)" },
  { key: "taxinvoice-set", devices: ["desktop", "ipad", "mobile"], note: "cart3 → ชำระ → สวิตช์ใบกำกับ → กรอก 15A → บันทึก → แถว \"— ชื่อ · เลข · สำนักงานใหญ่ · แก้\" ท้ายจอชำระ (ไม่กดยืนยัน)" },
  // POS P1.12U ▸ ภาพ 01 การ์ดสมาชิก · 14A แผงสมาชิก · 02 การ์ดแต้ม · 02b ช่องแต้ม (ข้อมูล: prepMemberFixture · คูปอง WELCOME50 ของร้าน QC — fix รอบ 1 มติ 10) ◂
  { key: "member-panel", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่×2 + ลาเต้ → + เพิ่มสมาชิก → 14A · พิมพ์ \"089\" → สมาชิก QC กาแฟในรายการ (พบ N รายชื่อ · 390 = แถวแตะได้ในแผ่นล่าง)" },
  { key: "member-register", devices: ["desktop", "ipad", "mobile"], note: "14A ค้น 0899000002 (ไม่พบ · เบอร์เติมเอง) + ชื่อ \"ทดสอบ สมัครด่วน\" + ยินยอม + ที่มา LINE (ไม่กดสมัคร)" },
  { key: "member-attached", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่×2 + ลาเต้ (สินค้ามีสต็อก) + ผูกสมาชิก QC → การ์ดสมาชิก 01 (ระดับ · แต้ม · ซื้อครั้งที่) + ปุ่มใช้แต้ม + คูปอง WELCOME50 −฿50 (ส่วนลดท้ายบิล → คูปอง · 390 = แผ่นตะกร้าเปิด)" },
  { key: "paydlg-member-points", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่×2 + ลาเต้ + สมาชิก → ชำระ → ใส่คูปอง WELCOME50 (แถวคูปอง −฿50 ✓ใช้แล้ว) → การ์ดแต้ม ใช้ 500 แต้ม (ลด ฿50) ✓ ใช้แล้ว" },
  { key: "paydlg-member-capped", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่ 1 + สมาชิก → ชำระ → 500 แต้ม (> 50%) → แก้เป็น allowedPoints อัตโนมัติ (≈325) + บรรทัด \"ใช้ได้สูงสุด\"" },
  { key: "sale-done-member", devices: ["desktop"], note: "⚠️ ขายจริง 1 บิลผูกสมาชิก QC (อเมริกาโน่×2 + ลาเต้ · เงินสด) → 02b ช่องแต้มที่ได้รับ" },
  // POS P1.15U ▸ ภาพ 13B / 21B + แผ่นส่วนลดเกินสิทธิ์ (ข้อมูล: seedP115Once · ลบ/คืนค่าใน finally) ◂
  { key: "lock-screen", devices: ["desktop", "ipad", "mobile"], note: "13B: กดล็อก → จอล็อก (ผู้ใช้รอบนี้ · ล็อกเมื่อ HH:MM) + จุด 3 ดวง · ขวา: พนักงาน 2 คน + บิลที่พัก 1 ใบ" },
  // POS HF-P1CLOSE ▸ มติ O5: 13B ที่ 390 เลื่อนถึงการ์ดพนักงาน / สลับพนักงาน / บิลพัก (ตรวจตำแหน่งหลังเลื่อน · ภาพเท่าจอ) ◂
  { key: "lock-screen-scroll", devices: ["mobile"], note: "13B 390: กดล็อก → เลื่อนจอล็อกลงสุด → ปุ่มสลับพนักงาน + การ์ดบิลพักอยู่ในจอ (scrollHeight > clientHeight) · ภาพเท่าจอ" },
  { key: "lock-pin-locked", devices: ["desktop"], note: "แถว PIN ของผู้ใช้รอบนี้ถูกล็อก → ใส่ PIN ถูก → \"ล็อกชั่วคราว 15 นาที\" + ปุ่มผู้จัดการปลดล็อก" },
  { key: "staff-switch", devices: ["desktop", "ipad", "mobile"], note: "จอล็อก → แตะการ์ดอีกคน → แป้น PIN ของคนนั้น (ยังไม่ใส่ครบ)" },
  { key: "discount-over-sheet", devices: ["desktop", "ipad", "mobile"], note: "โทเคนแคชเชียร์ · cart3 + ส่วนลดท้ายบิล 20% (> เพดาน 10%) → แผ่นส่วนลดเกินสิทธิ์" },
  { key: "approval-wait", devices: ["desktop", "ipad", "mobile"], note: "⚠️ ขายจริง 1 บิล → คำขอ POS_VOID PENDING (เขียนตรง · ลบใน finally) → บิลวันนี้ → \"ยกเลิกบิล — รออนุมัติ…\" → 21B (แคชเชียร์ = ปุ่มรออนุมัติ)" },
  // POS P1.18U ▸ มติ 8 ตัวสลับภาษาบนแถบบน · มติ 11 ร้านไม่มีสินค้า (ภาพ 19ก) ◂
  { key: "register-en", devices: ["desktop", "ipad", "mobile"], note: "แตะ EN ที่ตัวสลับภาษาแถบบน (md+) → ทั้งจอภาษาอังกฤษ · 390 = คุกกี้ LOCALE=en (ไม่มีตัวสลับในหัว 05ก) · หลังถ่ายคืนภาษาไทย" },
  { key: "register-empty-catalogue", devices: ["desktop", "ipad", "mobile"], note: "ภาพ 19ก: สาขา fixture ของระบบ POS ที่ไม่มีสินค้า → ไอคอน + \"ยังไม่มีสินค้าให้ขาย\" + ปุ่มเพิ่มสินค้า (เจ้าของเท่านั้น)" },
  // POS P2.1U ▸ มติ 6: ช่อง "แพลตฟอร์ม" ที่จอชำระ — ถึงได้ทางบิลพักที่มี channelId เท่านั้น (ไม่มีตัวเลือกช่องทางบนจอ Q3) ◂
  // POS HF-P1CLOSE ▸ มติ O6 (14B): บิลพักใหม่ต่อภาพ (holdRegisterCart) → ลิ้นชักบิลที่พัก ◂
  { key: "held-drawer", devices: ["desktop", "ipad", "mobile"], note: "พักบิล 1 ใบ (holdRegisterCart อเมริกาโน่×2 + ลาเต้ · ทิ้งใน finally) → ปุ่มบิลที่พัก → ลิ้นชัก 14B (390 = ใส่สินค้า 1 ชิ้น → แผ่นตะกร้า → บิลที่พัก)" },
  { key: "paydlg-platform", devices: ["desktop", "ipad"], note: "บิลพัก LINE MAN (holdRegisterCart + channelId) → บิลที่พัก → เรียกคืน → ชำระ → ช่อง \"แพลตฟอร์ม\" เลือกไว้เต็มยอด ช่องอื่นปิด (ไม่ยืนยัน)" },
  // POS P2.2U ▸ มติ 5/11 (ท้ายแผน: fixture ราคา/โปรตั้งก่อนงานแรกของ P2.2U และคืนหลังงานสุดท้าย — สถานะก่อนหน้าไม่เห็นราคาโปร) ◂
  { key: "register-tile-rule", devices: ["desktop", "ipad", "mobile"], note: "โปร PRICE ที่กำลังใช้บนลาเต้ (fixture P2.2U) → ไทล์: ชิปชื่อโปร + ราคาปกติขีดฆ่า" },
  { key: "register-tile-notsold", devices: ["desktop", "ipad", "mobile"], note: "ครัวซองต์ (STORE, ทุกสาขา) ไม่ขาย → ไทล์ \"ไม่ขายหน้าร้าน\" (เพิ่มลงตะกร้าไม่ได้)" },
  // POS P2.3U ▸ มติ 5/10: ชิปหัวจอตัดสต็อกค้าง (fixture P2.3U: บิลค้างตัด 1 ใบ = createSale ใน tx ของสคริปต์ ไม่ตัดสต็อก · ยกเลิกบิลหลังภาพ) ◂
  { key: "register-pending-cuts", devices: ["desktop", "ipad", "mobile"], note: "บิลค้างตัด 1 ใบ (fixture P2.3U · ลาเต้สูตร) → ชิป \"ตัดสต็อกค้าง N บิล · ลองอีกครั้ง\" (เจ้าของ = มีปุ่ม · ไม่กด)" },
  { key: "register-line-badges", devices: ["desktop", "ipad"], note: "(มือถือไม่ถ่าย — ตะกร้าว่างไม่มีปุ่มดูตะกร้า ⇒ ถึงบิลที่พักไม่ได้ เหมือน paydlg-platform P2.1U · ติดตาม P2.12) บิลพัก LINE MAN (holdRegisterCart) ลาเต้ + อเมริกาโน่ → เรียกคืน → ป้ายบรรทัด: ชื่อโปร (RULE) + \"ราคาตามช่องทาง\" (CHANNEL)" },
];
/** POS P1.18U ▸ สถานะหน้าขายที่แคชเชียร์ QC ถ่ายไม่ได้ (เข้าสาขา fixture ไม่ได้ · ห้ามแก้ membership ของ seed) ◂ */
const OWNER_ONLY_STATES: ReadonlySet<string> = new Set(["register-empty-catalogue", "register-pending-cuts"]); // POS P2.3U ▸ มติ 10: register-pending-cuts = เจ้าของ ◂
type MemberStateKey = "member-panel" | "member-register" | "member-attached" | "paydlg-member-points" | "paydlg-member-capped" | "sale-done-member";
type P115StateKey = "lock-screen" | "lock-screen-scroll" | "lock-pin-locked" | "staff-switch" | "discount-over-sheet" | "approval-wait";
const P115_STATE_KEYS: ReadonlySet<string> = new Set<string>(["lock-screen", "lock-screen-scroll", "lock-pin-locked", "staff-switch", "discount-over-sheet", "approval-wait"]);
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
type BillsStateKey = "bills-list" | "bills-drawer" | "bills-void" | "bills-refund" | "bills-empty" | "bill-taxinvoice-requested" | "bill-taxinvoice-issued" | "bills-channels" | "bills-drawer-commission" | "bills-drawer-pricenote";
const BILLS_STATE_PLAN: { key: BillsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "bills-list", devices: ["desktop", "ipad", "mobile"], note: "วันนี้ ≥ 6 บิล: ยกเลิก 1 · คืนบางส่วน 1 · คืนครบ 1 · เงินสดนอกกะ 1 · ปกติ/จ่ายผสม" },
  { key: "bills-drawer", devices: ["desktop", "ipad", "mobile"], note: "เลือกบิลปกติ → ลิ้นชักบิล (390 = แผ่นเต็มจอ)" },
  { key: "bills-void", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ = กล่องยกเลิกบิล + พิมพ์เหตุผล (ไม่กดยืนยัน) · แคชเชียร์ = ปุ่มยกเลิกปิด + คำอธิบาย" },
  { key: "bills-refund", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ = หน้าต่างคืนเงิน เลือก 1 บรรทัด + เงินสด (ไม่กดยืนยัน) · แคชเชียร์ = ไม่มีปุ่มคืนเงิน" },
  { key: "bills-empty", devices: ["desktop", "ipad", "mobile"], note: "?date= วันที่ไม่มีบิล → ข้อความว่าง" },
  // POS P1.13U ▸ แถวใบกำกับในลิ้นชัก (ภาพ 12) — บิล ABB ของวันนี้ (ใช้ซ้ำได้) · คำขอ P1.11 ลบใน finally · ใบ TX ที่ออกค้างในบัญชี QC4 (docId ใน summary) ◂
  { key: "bill-taxinvoice-requested", devices: ["desktop", "ipad", "mobile"], note: "บิลกาแฟ ABB + คำขอ P1.11 (requestFullTaxInvoice) → ลิ้นชัก \"ลูกค้าขอใบกำกับเต็มรูป\" · เจ้าของ = [ออกใบกำกับ][ปฏิเสธ] · แคชเชียร์ = ไม่มีปุ่ม" },
  { key: "bill-taxinvoice-issued", devices: ["desktop", "ipad", "mobile"], note: "⚠️ บิลกาแฟ ABB → issueFullTaxInvoice (ใบ TX ค้างในบัญชี QC4) → ลิ้นชัก \"ใบกำกับเต็มรูป <เลข> · ผู้ซื้อ\"" },
  // POS P2.1U ▸ มติ 3–4 (ภาพ 12 คอลัมน์ช่องทาง · ภาพ 09 บล็อกค่าคอมฯ) ◂
  { key: "bills-channels", devices: ["desktop", "ipad", "mobile"], note: "วันนี้มีบิลหน้าร้าน + เว็บร้าน + LINE MAN (PLATFORM · LM-48152 ในช่องลูกค้า · จ่าย \"แพลตฟอร์ม\") · บรรทัด \"หน้าร้าน N · ออนไลน์ M\"" },
  // POS P2.2U ▸ มติ 6/11: หมายเหตุราคาต่อบรรทัดในลิ้นชัก (บิล LINE MAN ของ fixture P2.2U: บรรทัดโปร + บรรทัดราคาช่องทาง) ◂
  { key: "bills-drawer-pricenote", devices: ["desktop", "ipad", "mobile"], note: "บิล fixture P2.2U (createSale คีย์ตายตัว posqc-vis-p22u-bill-<วันที่> · LINE MAN): ลาเต้ RULE + อเมริกาโน่ CHANNEL → ลิ้นชัก pos-bill-line-note-0/1" },
  { key: "bills-drawer-commission", devices: ["desktop", "ipad", "mobile"], note: "แตะบิล LINE MAN → ลิ้นชัก: บล็อกค่าคอมฯ ฿420 −฿126 รับจริง ฿294 (เจ้าของ) · แคชเชียร์ = บรรทัดช่องทางอย่างเดียว" },
];
// POS P1.10 U ▸ สถานะของหน้าตั้งค่า (เครื่อง QC 2 เครื่องลงทะเบียนครั้งเดียวก่อนเปิด chromium · ไม่กดยืนยันเพิกถอน/ไม่กดพิมพ์) ◂
type SettingsStateKey = "settings-receipt" | "settings-payments" | "settings-devices" | "settings-device-revoke" | "settings-print-pair" | "paydone-print" | "paydone-print-failed" | P118uSettingsKey;
/** POS HF-P1CLOSE ▸ สถานะจอสำเร็จบนเครื่อง 2 (หน้าขาย · กะของเครื่อง 2) ◂ */
const isPaydoneState = (k: string | null | undefined): boolean => k === "paydone-print" || k === "paydone-print-failed";
// POS P1.18U ▸ แท็บตั้งค่าที่เหลือ 5 แท็บ + กล่อง PIN · ยืนยันปิดบัญชี · ลิ้นชักประวัติ ◂
type P118uSettingsKey = "settings-general" | "settings-staff" | "settings-staff-pin" | "settings-shark" | "settings-shark-account-off" | "settings-history" | "settings-channels" | "settings-offline" | P21uSettingsKey;
// POS P2.1U ▸ มติ 8: แท็บช่องทางขาย (ลิ้นชัก LINE MAN · โหมดสร้าง · แคชเชียร์อ่านอย่างเดียว) ◂
type P21uSettingsKey = "settings-channel-drawer" | "settings-channel-create" | "settings-channels-readonly";
const SETTINGS_STATE_PLAN: { key: SettingsStateKey; devices: readonly Device[]; note: string }[] = [
  { key: "settings-receipt", devices: ["desktop", "ipad", "mobile"], note: "17A ใบเสร็จและภาษี + ตัวอย่างสด (แคชเชียร์ = ช่องปิด · อ่านอย่างเดียว)" },
  { key: "settings-payments", devices: ["desktop", "ipad", "mobile"], note: "P1.7U 17A วิธีรับเงิน: พร้อมเพย์ (อ่านอย่างเดียว) · อายุ QR · Beam + ชิปคีย์ · ยืนยันเอง (แคชเชียร์ = อ่านอย่างเดียว)" },
  { key: "settings-devices", devices: ["desktop", "ipad", "mobile"], note: "17B เครื่องและเครื่องพิมพ์ · 2 เครื่อง QC (เครื่อง 1 = USB 80 มม. + ลิ้นชัก) · แคชเชียร์ = การ์ดปฏิเสธ" },
  { key: "settings-device-revoke", devices: ["desktop", "ipad", "mobile"], note: "เลือกเครื่อง 2 → กล่องยืนยันเพิกถอน (ไม่กดยืนยัน)" },
  { key: "settings-print-pair", devices: ["desktop", "ipad", "mobile"], note: "เครื่อง 1 (เบราว์เซอร์นี้) → กล่องเลือกเครื่องพิมพ์ = \"เบราว์เซอร์นี้ไม่รองรับ\" (ซ่อน navigator.usb)" },
  { key: "paydone-print", devices: ["desktop"], note: "⚠️ ขายจริง 1 บิลบนเครื่อง 2 (พิมพ์ผ่านเบราว์เซอร์) → จอสำเร็จ + ปุ่มพิมพ์ใบเสร็จ/สำเนา" },
  // POS HF-P1CLOSE ▸ มติ O11 (19ค): ต้องอยู่หลัง paydone-print (สลับ printerConfig ของเครื่อง 2 ชั่วคราว) ◂
  { key: "paydone-print-failed", devices: ["desktop"], note: "⚠️ เครื่อง 2 → USB (ไม่ได้จับคู่ในเบราว์เซอร์นี้) · ขายจริง 1 บิล → พิมพ์ใบเสร็จ → การ์ด \"พิมพ์ไม่สำเร็จ\" + ลองใหม่ + พิมพ์ผ่านเบราว์เซอร์ · คืนค่าเบราว์เซอร์ทันที" },
  { key: "settings-general", devices: ["desktop", "ipad", "mobile"], note: "P1.18U ทั่วไป: หน้าขาย · กะและลิ้นชัก · รายงาน · สต็อกของสาขา · บาร์โค้ดชั่ง · พร้อมเพย์สาขา · ค่าบริการ · ภาษาของแอป (แคชเชียร์ = อ่านอย่างเดียว ไม่มีปุ่มบันทึก)" },
  { key: "settings-staff", devices: ["desktop", "ipad", "mobile"], note: "P1.18U 17C พนักงานและสิทธิ์: ตารางสิทธิ์ · นโยบายอนุมัติ · พนักงานและ PIN (แคชเชียร์ = การ์ดปฏิเสธ)" },
  { key: "settings-staff-pin", devices: ["desktop", "ipad", "mobile"], note: "P1.18U 17C → ตั้ง/เปลี่ยน PIN ของแถวแรก → กล่อง PIN ใส่ 3 หลัก (ไม่ส่ง) · แคชเชียร์ = การ์ดปฏิเสธ" },
  { key: "settings-shark", devices: ["desktop", "ipad", "mobile"], note: "P1.18U ภาพ 10: 13 การ์ด + ใบเสร็จและภาษี + ออฟไลน์ · ช่องทางขายภายนอก + วิธีรับเงิน" },
  { key: "settings-shark-account-off", devices: ["desktop", "ipad", "mobile"], note: "P1.18U สวิตช์บัญชี (เปิดอยู่) → กล่อง \"ปิดการลงบัญชี?\" (ไม่กดยืนยัน) · แคชเชียร์ = สวิตช์ปิด" },
  { key: "settings-history", devices: ["desktop", "ipad", "mobile"], note: "P1.18U ปุ่ม \"ประวัติการเปลี่ยน\" → ลิ้นชัก ≥ 3 แถว (seedHistoryOnce) · แคชเชียร์ = ไม่มีปุ่มประวัติ" },
  { key: "settings-channels", devices: ["desktop", "ipad", "mobile"], note: "P2.1U ช่องทางขายภายนอก (แผงจริง · ไม่มีแบนเนอร์): หน้าร้าน · QR โต๊ะ · เว็บร้าน · แชท · LINE MAN · Grab + แถว \"เชื่อมต่อ\" Shopee/foodpanda" },
  { key: "settings-channel-drawer", devices: ["desktop", "ipad", "mobile"], note: "P2.1U แตะ LINE MAN → ลิ้นชักช่องทาง (PLATFORM 30% · ตัวอย่างสด ฿420 → ฿126 · รับจริง ฿294) ไม่บันทึก · แคชเชียร์ = อ่านอย่างเดียว" },
  { key: "settings-channel-create", devices: ["desktop", "ipad", "mobile"], note: "P2.1U เจ้าของ: + เพิ่มช่องทางอื่น → โหมดสร้าง พิมพ์ชื่อ \"ตลาดนัด\" + รหัส MARKET (CUSTOM · ไม่มีค่าคอมฯ) ไม่บันทึก" },
  { key: "settings-channels-readonly", devices: ["desktop", "ipad", "mobile"], note: "P2.1U แคชเชียร์: สวิตช์ปิดทุกแถว · ไม่มีปุ่มเพิ่ม/เชื่อมต่อ · หมายเหตุอ่านอย่างเดียว" },
  { key: "settings-offline", devices: ["desktop", "ipad", "mobile"], note: "P1.18U ออฟไลน์และการซิงก์: แบนเนอร์ P3.4 + การ์ดออฟไลน์" },
];
const P118U_SETTINGS_TAB: Record<P118uSettingsKey, string> = {
  "settings-general": "general",
  "settings-staff": "staff",
  "settings-staff-pin": "staff",
  "settings-shark": "shark",
  "settings-shark-account-off": "shark",
  "settings-history": "shark",
  "settings-channels": "channels",
  "settings-offline": "offline",
  "settings-channel-drawer": "channels",
  "settings-channel-create": "channels",
  "settings-channels-readonly": "channels",
};
const isP118uSettings = (k: string): k is P118uSettingsKey => Object.prototype.hasOwnProperty.call(P118U_SETTINGS_TAB, k);
/** POS P2.1U ▸ สถานะที่ถ่ายได้บทบาทเดียว (แคชเชียร์ไม่มีปุ่มเพิ่มช่องทาง · ภาพอ่านอย่างเดียวเป็นของแคชเชียร์) ◂ */
const OWNER_ONLY_SETTINGS: ReadonlySet<string> = new Set(["settings-channel-create"]);
const CASHIER_ONLY_SETTINGS: ReadonlySet<string> = new Set(["settings-channels-readonly"]);
/** POS P2.1U ▸ สถานะที่ต้องมี fixture ช่องทาง (LINEMAN · GRAB) — ค่าคงที่อยู่ก่อน --dry (แผนพิมพ์ใช้) ◂ */
/** ช่องทางของภาพ (หาตามรหัสของสาขาที่ถ่าย · ค่าที่ต้องเป็น) — LINE MAN ตรงภาพ 09 (30% · ไม่มี VAT) · Grab โชว์ค่าคงที่ + VAT */
const P21U_CHANNELS = [
  { code: "LINEMAN", name: "LINE MAN", payout: "PLATFORM", commissionBp: 3000, commissionFixedSatang: 0, commissionVatBp: 0 },
  { code: "GRAB", name: "Grab", payout: "PLATFORM", commissionBp: 2500, commissionFixedSatang: 200, commissionVatBp: 700 },
] as const;
/** เลขออเดอร์แพลตฟอร์มของบิลภาพ (ภาพ 12 แถว LINE MAN) */
const P21U_REF = "LM-48152";
const P21U_FIXTURE_STATES: ReadonlySet<string> = new Set(["settings-channels", "settings-channel-drawer", "settings-channel-create", "settings-channels-readonly", "bills-channels", "bills-drawer-commission", "paydlg-platform"]);
// ── POS P2.2U ▸ ราคาตามช่องทาง / โปรราคา (มติ 11 · --page products|register|sales --states · 3 ขนาด · th + LOCALE=en · owner + cashier) ◂
type P22uProductsKey = "products-matrix" | "products-drawer-prices" | "products-drawer-prices-edit" | "products-drawer-notsold" | "products-bulk" | "price-rules-list" | "price-rules-editor" | "price-rules-error" | "products-readonly";
type P22uRegKey = "register-tile-rule" | "register-line-badges" | "register-tile-notsold";
const P22U_PRODUCTS_PLAN: { key: P22uProductsKey; rules: boolean; devices: readonly Device[]; note: string }[] = [
  { key: "products-matrix", rules: false, devices: ["desktop", "ipad", "mobile"], note: "ตาราง 06: ลาเต้ ราคาขาย + \"แพลตฟอร์ม ฿x\" (LINE MAN) · ชิป ร้าน/LM/เว็บ (Grab ไม่ขาย = ซ่อน) · การ์ดราคาต่างกันตามช่องทาง" },
  { key: "products-drawer-prices", rules: false, devices: ["desktop", "ipad", "mobile"], note: "ลิ้นชักลาเต้ แท็บราคาตามช่องทาง (ดู): ตาราง 2 คอลัมน์ · LINE MAN +27% · กล่องโปรที่กำลังใช้" },
  { key: "products-drawer-prices-edit", rules: false, devices: ["desktop", "ipad", "mobile"], note: "\"แก้ราคา\" → ช่องเงิน + ไม่ขาย + ใช้ราคาปกติ ต่อช่องทาง (ไม่บันทึก)" },
  { key: "products-drawer-notsold", rules: false, devices: ["desktop", "ipad", "mobile"], note: "ลิ้นชักลาเต้: ช่อง Grab = \"ไม่ขาย —\" (แบบ Shopee ในภาพ)" },
  { key: "products-bulk", rules: false, devices: ["desktop", "ipad", "mobile"], note: "เลือกลาเต้ + อเมริกาโน่ → \"+X% ทั้งช่องทาง\" → ตัวอย่าง 2 รายการ (ไม่กดตั้งราคา)" },
  { key: "price-rules-list", rules: true, devices: ["desktop", "ipad", "mobile"], note: "จอโปรราคา: 3 แถว fixture — กำลังใช้ / รอเริ่ม / หมดแล้ว" },
  { key: "price-rules-editor", rules: true, devices: ["desktop", "ipad", "mobile"], note: "แตะโปรที่กำลังใช้ → ลิ้นชักแก้ + ตัวอย่างสด \"ลาเต้ ฿x → ฿59\" (ไม่บันทึก)" },
  { key: "price-rules-error", rules: true, devices: ["desktop", "ipad", "mobile"], note: "เพิ่มโปร → ชื่ออย่างเดียว → บันทึก → ข้อความใต้ช่องสินค้า (VALIDATION productIds · ตรวจฝั่ง client)" },
  { key: "products-readonly", rules: false, devices: ["desktop", "ipad", "mobile"], note: "แคชเชียร์: หน้า 06 (บันทึก HTTP · 404 วันนี้ / การ์ดปฏิเสธหลัง HF-P1CLOSE)" },
];
const P22U_REG_KEYS: ReadonlySet<string> = new Set(["register-tile-rule", "register-line-badges", "register-tile-notsold"]);
const P22U_BILL_STATE = "bills-drawer-pricenote";
const P22U_PRODUCTS_KEYS: ReadonlySet<string> = new Set(P22U_PRODUCTS_PLAN.map((s) => s.key));
const isP22uProducts = (k: StateKey): k is P22uProductsKey => P22U_PRODUCTS_KEYS.has(k);
/** สถานะที่ต้องมี fixture ราคา/โปรของ P2.2U (ทุกหน้า · ยกเว้นแคชเชียร์หน้า 06 ที่ไม่ใช้ข้อมูล) */
const P22U_FIXTURE_STATES: ReadonlySet<string> = new Set([...P22U_PRODUCTS_PLAN.filter((p) => p.key !== "products-readonly").map((p) => p.key), ...P22U_REG_KEYS, P22U_BILL_STATE]);
/** ชื่อโปร fixture (ขึ้นต้นด้วยค่านี้ — กวาดซากรอบก่อนด้วยชื่อ) */
const P22U_RULE_PREFIX = "QC ภาพ P2.2U";
// ── POS P2.3U ▸ สูตร/วัตถุดิบ (มติ 10 · --page products --states · 3 ขนาด · th + LOCALE=en · เจ้าของ) — fixture ของตัวเอง (สินค้า/วัตถุดิบชั่วคราว) ◂
type P23uProductsKey = "products-recipe-view" | "products-recipe-edit" | "products-recipe-empty" | "products-recipe-backfilled" | "products-recipe-incomplete-cost" | "products-table-chips";
type P23uRegKey = "register-pending-cuts";
const P23U_PRODUCTS_PLAN: { key: P23uProductsKey; devices: readonly Device[]; note: string }[] = [
  { key: "products-recipe-view", devices: ["desktop", "ipad", "mobile"], note: "ลิ้นชักลาเต้สูตร (fixture) แท็บสูตรและวัตถุดิบ: ชิป สูตรพื้นฐาน/ขนาด S M L · เมล็ด 18 g ฿11.70 · นม 150 ml ฿7.50 · แก้ว 12 oz 1 ใบ ฿2.80 · ฝา 1 ชิ้น ฿1.20 · ต้นทุนตามสูตร ฿23.20 · กำไรขั้นต้น 69%" },
  { key: "products-recipe-edit", devices: ["desktop", "ipad", "mobile"], note: "\"แก้สูตร\" → สวิตช์ตัดสต็อกตามสูตร · แท็บ ขนาด M (ส่วนต่าง +6 g / +50 ml / −1 ใบ / +1 ใบ) · ค้น \"ไซรัป\" → รายการวัตถุดิบ (ไม่บันทึก)" },
  { key: "products-recipe-empty", devices: ["desktop", "ipad", "mobile"], note: "เมนูยังไม่มีสูตร (fixture) → \"ยังไม่มีสูตร\" + แก้สูตร" },
  { key: "products-recipe-backfilled", devices: ["desktop", "ipad", "mobile"], note: "โค้กสูตรเดิม (fixture · สูตร 1 บรรทัด · สวิตช์ปิด) → ป้าย \"สูตรจากเมนูเดิม … ยังไม่ตัดสต็อก\" + ปุ่มเปิดตัดสต็อกตามสูตร (ไม่กด)" },
  { key: "products-recipe-incomplete-cost", devices: ["desktop", "ipad", "mobile"], note: "คาราเมลมัคคิอาโต้ (fixture · ไซรัปต้นทุน 0) → ป้ายยังไม่ใส่ต้นทุน + ชิป ยังไม่ใส่ต้นทุน / กำไรคำนวณไม่ได้" },
  { key: "products-table-chips", devices: ["desktop", "ipad", "mobile"], note: "ตาราง 06 ค้น \"P2.3U\": ต้นทุน ฿ + ตามสูตร · กำไร % · สต็อก ตามสูตร (ลาเต้ 3 = ใกล้หมด) · ชิป ใกล้หมด/หมด/ยังไม่ใส่ต้นทุน/กำไรคำนวณไม่ได้ ≥ 1" },
];
const P23U_PRODUCTS_KEYS: ReadonlySet<string> = new Set(P23U_PRODUCTS_PLAN.map((s) => s.key));
const isP23uProducts = (k: StateKey): k is P23uProductsKey => P23U_PRODUCTS_KEYS.has(k);
const P23U_REG_STATE: P23uRegKey = "register-pending-cuts";
/** สถานะที่ต้องมี fixture สูตรของ P2.3U (สร้างก่อนงานแรกของช่วง · เก็บหลังงานสุดท้ายของช่วงติดกัน — หน้าอื่นไม่เห็นสินค้าชั่วคราว) */
const P23U_FIXTURE_STATES: ReadonlySet<string> = new Set([...P23U_PRODUCTS_KEYS, P23U_REG_STATE]);
const productsStatesOn = STATES_ON && tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && (onlyPage === "products" || /^p2\.?2u/i.test(WO) || /^p2\.?3u/i.test(WO)); // POS P2.3U ▸ + wo p2.3u ◂
// ── POS P2.4U ▸ โหมดโต๊ะ (มติ 11 · wo p2.4u · --page tables|register --states · 3 ขนาด · th + LOCALE=en · owner + cashier) — fixture ของตัวเอง (โซน/โต๊ะ/รอบชั่วคราว) ◂
type P24uTablesKey = "tables-empty" | "tables-floor" | "tables-panel-rounds" | "tables-draft-unsent" | "tables-checkout-dialog" | "tables-reservations-sheet" | "tables-alerts";
type P24uRegKey = "register-table-mode" | "register-billtype-menu";
const P24U_TABLES_PLAN: { key: P24uTablesKey; devices: readonly Device[]; note: string }[] = [
  { key: "tables-empty", devices: ["desktop", "ipad", "mobile"], note: "ต้องถ่ายก่อน fixture: เจ้าของ = สาขาอารีย์ (ไม่มีโต๊ะ) → \"ยังไม่มีโต๊ะ\" + ปุ่มตั้งค่าโต๊ะ · แคชเชียร์ = สาขาสีลมก่อนสร้างโต๊ะ (ไม่มี restaurant.table.create) → ข้อความจาง" },
  { key: "tables-floor", devices: ["desktop", "ipad", "mobile"], note: "ผังผสม: กำลังทาน (ยังไม่ส่งครัว 2 · พร้อมเสิร์ฟ 1) · ขอเช็คบิล (ขอผ่าน QR) · จองไว้ · ว่าง · ปิดใช้งาน · เลือก X5 (1440) — ไม่มี \"ต้องเก็บโต๊ะ\" (ต้องจ่ายบิลก่อน · ภาพไม่จ่ายบิล)" },
  { key: "tables-panel-rounds", devices: ["desktop", "ipad", "mobile"], note: "แตะ X5 → แผง: รอบ 1 เสิร์ฟแล้ว 5 บรรทัด (ยุบ \"เสิร์ฟแล้วอีก 3 รายการ\") + รอบ 2 รอครัว · ยอดจาก quote ของโต๊ะ" },
  { key: "tables-draft-unsent", devices: ["desktop", "ipad", "mobile"], note: "แตะ X4 → แผง: กล่อง \"มีรายการยังไม่ส่งครัว 2\" + ดู/ส่งครัว" },
  { key: "tables-checkout-dialog", devices: ["desktop", "ipad", "mobile"], note: "แตะ X5 → เช็คบิล ฿x → จอชำระเดิม (quote ของโต๊ะ · เงินสด) — ไม่กดยืนยัน" },
  { key: "tables-reservations-sheet", devices: ["desktop", "ipad", "mobile"], note: "จองโต๊ะวันนี้ N → แผ่นจอง 2 แถว (X9 อีก 20 นาที · ยังไม่ระบุโต๊ะ อีก 2 ชม.)" },
  { key: "tables-alerts", devices: ["desktop", "ipad", "mobile"], note: "แจ้งเตือนจากโต๊ะ 3 แถว: เรียกพนักงาน (รับทราบ) · ขอเช็คบิล (เปิดโต๊ะ) · แจ้งจ่ายพร้อมเพย์ (ยืนยันรับเงิน)" },
];
const P24U_REG_PLAN: { key: P24uRegKey; devices: readonly Device[]; note: string }[] = [
  { key: "register-table-mode", devices: ["desktop", "ipad", "mobile"], note: "หน้าขายผูกโต๊ะ ?table=<X4> → รอบร่าง 2 บรรทัดในตะกร้า · ชิป \"โต๊ะ X4 · สั่งเพิ่ม\" · ส่งครัว 2 รายการ / บันทึกไว้ก่อน (390 = แผ่นตะกร้า)" },
  { key: "register-billtype-menu", devices: ["desktop", "ipad", "mobile"], note: "ชิป \"บิลใหม่ · ซื้อกลับ ▾\" → เมนู ซื้อกลับ / ทานที่ร้าน (สาขามีโต๊ะของ fixture · 390 = อเมริกาโน่ 1 → แผ่นตะกร้า)" },
];
const P24U_WO = /^p2\.?4u/i.test(WO);
/** ตัวอักษรของรอบ (ชื่อโต๊ะ fixture = ตัวอักษร + เลข) · แท็กชื่อโซน fixture (กวาดซากด้วยแท็กนี้) */
const P24U_LETTER = "ABCDEFGHJKLMNPQRSTUVWXYZ"[process.pid % 24]!;
const P24U_ZONE_TAG = "QC P2.4U";
const P24U_TABLES_KEYS: ReadonlySet<string> = new Set(P24U_TABLES_PLAN.map((s) => s.key));
const P24U_REG_KEYS: ReadonlySet<string> = new Set(P24U_REG_PLAN.map((s) => s.key));
const isP24uState = (k: StateKey): k is P24uTablesKey | P24uRegKey => P24U_TABLES_KEYS.has(k) || P24U_REG_KEYS.has(k);
/** สถานะที่ต้องมี fixture โต๊ะ (ทุกสถานะ P2.4U ยกเว้น tables-empty) — สร้างก่อนงานแรก · ลบหลังงานสุดท้าย */
const P24U_FIXTURE_STATES: ReadonlySet<string> = new Set([...P24U_TABLES_PLAN.filter((s) => s.key !== "tables-empty").map((s) => s.key), ...P24U_REG_KEYS]);
const p24uOn = STATES_ON && tenantKey === "coffee";
/** tables-empty: เจ้าของ = สาขาที่สอง (อารีย์ · ไม่มีโต๊ะ) · แคชเชียร์ = สาขาของตัวเอง (ก่อนสร้าง fixture) */
const P24U_EMPTY_UNIT = userKey === "owner" ? ((T.units as Record<string, { id: string }>).ari?.id ?? unitId) : unitId;
const P24U_REG_TABLE_PLACEHOLDER = `/app/sys/${SYS}/pos/register?unit=${unitId}&table=<session:${"X4"}>`;
// ── POS P2.5U ▸ แยกบิล 15B/15C · ปุ่มแผงโต๊ะ 03 · ย้าย/รวม · ใบรายการ (มติ 10 · wo p2.5u · --page tables|register --states · 3 ขนาด · th + LOCALE=en ·
//   owner + cashier) — fixture ของตัวเอง (โซน/โต๊ะ/รอบ/แผนชั่วคราว · เมนู 15B 8 บรรทัด ฿1,240 + ค่าบริการ 10% = ฿1,364 · สมาชิก QC บนโต๊ะ) ◂
type P25uTablesKey = "tbl-panel-actions" | "tables-floor-split" | "split-items" | "split-equal" | "split-seat" | "split-locked" | "split-new-items" | "move-sheet" | "merge-sheet" | "prebill-preview";
type P25uRegKey = "split-part-pay";
const P25U_TABLES_PLAN: { key: P25uTablesKey; devices: readonly Device[]; note: string }[] = [
  { key: "tbl-panel-actions", devices: ["desktop", "ipad", "mobile"], note: "แตะ <L>1 (15B ไม่มีแผน) → แผง: สั่งเพิ่ม · ย้ายโต๊ะ · รวมโต๊ะ · แยกบิล · พิมพ์ใบรายการ (แคชเชียร์ = ย้าย/รวมปิด + tooltip) · เช็คบิล ฿1,364" },
  { key: "split-items", devices: ["desktop", "ipad", "mobile"], note: "<L>2 (แผน ITEM 15B ที่บันทึกแล้ว) → แยกบิล → 15B: บิล 1 · สมาชิก ฿742.50 / บิล 2 ฿621.50 · ชิป \"บิล 1 x3 · บิล 2 x1\"" },
  { key: "split-equal", devices: ["desktop", "ipad", "mobile"], note: "<L>1 → แยกบิล → แท็บหารเท่า (ยังไม่บันทึก): − 4 คน + · 4 คน × ฿341 · ลงตัว · การ์ด 4 ใบรอชำระ" },
  { key: "split-seat", devices: ["desktop", "ipad", "mobile"], note: "<L>3 (แผน SEAT 15C ที่บันทึกแล้ว) → ที่นั่ง 1–4 ฿338.25/458.15/242.55/325.05 · กลางโต๊ะ ยำวุ้นเส้น ฿150 ที่นั่งละ ฿37.50" },
  { key: "split-locked", devices: ["desktop", "ipad", "mobile"], note: "⚠️ <L>4 (แผน EQUAL 4) → จ่ายบิล 1 เงินสดจริง 1 ใบต่อรอบ (งานแรก · งานหลังใช้ใบที่จ่ายแล้ว) → กลับแผง: ✓ เงินสด · ล็อก · ไม่มียกเลิก" },
  { key: "split-new-items", devices: ["desktop", "ipad", "mobile"], note: "<L>5 (แผน EQUAL 2 + รอบใหม่หลังแยกบิล 1 รายการ) → แถบ \"รายการใหม่หลังแยกบิล 1 — ชำระหลังครบทุกใบ\"" },
  { key: "tables-floor-split", devices: ["desktop", "ipad", "mobile"], note: "ผัง: การ์ด <L>4 ชิป \"แยกบิล 1/4\" (หลัง split-locked · ถ่ายเดี่ยว = 0/4) · เดสก์ท็อปเลือก <L>4 → \"ชำระทีละใบ · เหลือ ฿…\"" },
  { key: "move-sheet", devices: ["desktop", "ipad", "mobile"], note: "<L>1 → ย้ายโต๊ะ → แผ่นเลือกโต๊ะว่าง (<L>6 <L>7) · แคชเชียร์ = ปุ่มปิด (ไม่มี restaurant.session.move ใน seed)" },
  { key: "merge-sheet", devices: ["desktop", "ipad", "mobile"], note: "<L>1 → รวมโต๊ะ → เลือก <L>2 → สรุป \"รวม <L>2 เข้า <L>1 · N คน · ฿…\" · แคชเชียร์ = ปุ่มปิด (ไม่มี restaurant.session.merge)" },
  { key: "prebill-preview", devices: ["desktop", "ipad", "mobile"], note: "<L>1 → พิมพ์ใบรายการ → ตัวอย่าง 80 มม. \"ใบรายการ — ไม่ใช่ใบเสร็จ…\" (audit pos.table.preBill 1 แถวต่อภาพ · ไม่พิมพ์จริง)" },
];
const P25U_REG_PLAN: { key: P25uRegKey; devices: readonly Device[]; note: string }[] = [
  { key: "split-part-pay", devices: ["desktop", "ipad", "mobile"], note: "จอชำระเดิม (PayDialog ของหน้าขาย) เปิดจากแผงแยกบิล <L>2 บิล 1 → ชิป \"บิล 1 จาก 2 · โต๊ะ <L>2\" · ไม่กดยืนยัน (ทางของภาพ = หน้าโต๊ะ)" },
];
const P25U_WO = /^p2\.?5u/i.test(WO);
const P25U_LETTER = "ABCDEFGHJKLMNPQRSTUVWXYZ"[(process.pid + 13) % 24]!;
const P25U_ZONE_TAG = "QC P2.5U";
const P25U_TABLES_KEYS: ReadonlySet<string> = new Set(P25U_TABLES_PLAN.map((s) => s.key));
const P25U_REG_KEYS: ReadonlySet<string> = new Set(P25U_REG_PLAN.map((s) => s.key));
const isP25uState = (k: StateKey | null | undefined): k is P25uTablesKey | P25uRegKey => !!k && (P25U_TABLES_KEYS.has(k) || P25U_REG_KEYS.has(k));
const p25uOn = STATES_ON && tenantKey === "coffee" && P25U_WO;
const P25U_TABLES_PATH = `/app/sys/${SYS}/pos/tables?unit=${encodeURIComponent(unitId)}`;
// ── POS P2.8U ▸ ออเดอร์ทุกช่องทาง (มติ 7 · wo p2.8u · --page orders|register --states · 3 ขนาด · th + LOCALE=en · owner + cashier) — fixture ของตัวเอง ◂
type P28uOrdersKey = "orders-empty" | "orders-mixed" | "orders-new-late" | "orders-detail-platform" | "orders-detail-direct-unpaid" | "orders-paused-banner" | "orders-reject-sheet" | "orders-manual-sheet" | "orders-pay-dialog";
type P28uRegKey = "register-tab-badge";
const P28U_ORDERS_PLAN: { key: P28uOrdersKey; devices: readonly Device[]; note: string }[] = [
  { key: "orders-empty", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของเท่านั้น · ถ่ายก่อน fixture: สาขาอารีย์ (ไม่มีออเดอร์วันนี้) → \"ยังไม่มีออเดอร์วันนี้\" (แคชเชียร์เข้าได้สาขาเดียว และสาขานั้นมีออเดอร์ HANDED ที่ fixture รอบก่อนเก็บไว้)" },
  { key: "orders-mixed", devices: ["desktop", "ipad", "mobile"], note: "กระดานผสม: ใหม่ (LINE MAN · Grab · แชทรอชำระ) · กำลังเตรียม (โทรสั่ง เลยเวลาเตรียม · โทรสั่งปกติ) · พร้อม (โทรสั่ง) · เสร็จวันนี้ (LINE MAN ที่รับ+ส่งมอบแล้ว) + ท้ายคอลัมน์ ยกเลิก/ปฏิเสธ 1 · เลือกการ์ด LINE MAN (1440)" },
  { key: "orders-new-late", devices: ["desktop", "ipad", "mobile"], note: "ออเดอร์ Grab ใหม่ที่เข้ามาแล้ว > 60 วิ → \"รับภายใน 0:xx\" สีแดง (รอจนตัวนับ < 60 วิ · ใกล้หมด = สร้างใบใหม่ด้วยคีย์ใหม่)" },
  { key: "orders-detail-platform", devices: ["desktop", "ipad", "mobile"], note: "แตะการ์ด LINE MAN ใหม่ → แผง: รายการ · ยอด + ค่าคอมฯ 30% + รับจริง (pos-bill-commission) · \"เมื่อกดรับออเดอร์ ระบบจะ\" · ปุ่มรับออเดอร์ · เตรียม N นาที" },
  { key: "orders-detail-direct-unpaid", devices: ["desktop", "ipad", "mobile"], note: "แตะการ์ดโทรสั่งที่กำลังเตรียม (ร้านเก็บเงินเอง · รอชำระ) → แผง: ปุ่มพร้อมแล้ว + รับเงิน ฿x + ยกเลิกออเดอร์" },
  { key: "orders-paused-banner", devices: ["desktop", "ipad", "mobile"], note: "ช่องทางแชทปิดรับ 30 นาที (setChannelOrderSettings · คืนค่าหลังงานสุดท้าย/finally) → แบนเนอร์ \"ปิดรับถึง hh:mm\" + เปิดรับ (เจ้าของ) + ชิปในราง" },
  { key: "orders-reject-sheet", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ: ปฏิเสธบนการ์ด LINE MAN → แผ่นเหตุผล (ไม่กดยืนยัน) · แคชเชียร์: แผง LINE MAN ปุ่มรับ/ปฏิเสธปิด (ไม่มี pos.order.accept/reject)" },
  { key: "orders-manual-sheet", devices: ["desktop", "ipad", "mobile"], note: "+ คีย์ออเดอร์ → แผ่นขวา (derived) · เพิ่มอเมริกาโน่ 1 → ยอดจาก quote ของช่องทาง · ยอดตามแพลตฟอร์ม ฿1 → คำเตือนยอดไม่ตรง (ไม่บันทึก)" },
  { key: "orders-pay-dialog", devices: ["desktop", "ipad", "mobile"], note: "แผงโทรสั่งที่รอชำระ → รับเงิน → จอชำระเดิมผูก payOrderAction (ไม่กดยืนยัน)" },
];
const P28U_REG_PLAN: { key: P28uRegKey; devices: readonly Device[]; note: string }[] = [
  { key: "register-tab-badge", devices: ["desktop", "ipad", "mobile"] /* POS P2.14 ▸ U2 H5: + 390 (UI-13) ◂ */, note: "หน้าขาย: แท็บ \"ออเดอร์ออนไลน์\" เป็นลิงก์ + ป้ายนับออเดอร์ใหม่ (pos-reg-tab-orders-badge · ดึงทุก 10 วิ) — มือถือไม่มีแถบโหมด" },
];
const P28U_WO = /^p2\.?8u/i.test(WO);
const P28U_ORDERS_KEYS: ReadonlySet<string> = new Set(P28U_ORDERS_PLAN.map((s) => s.key));
const P28U_REG_KEYS: ReadonlySet<string> = new Set(P28U_REG_PLAN.map((s) => s.key));
const isP28uState = (k: StateKey): k is P28uOrdersKey | P28uRegKey => P28U_ORDERS_KEYS.has(k) || P28U_REG_KEYS.has(k);
/** สถานะที่ต้องมี fixture ออเดอร์ (ทุกสถานะ P2.8U ยกเว้น orders-empty) — สร้างก่อนงานแรก · ลบหลังงานสุดท้าย */
const P28U_FIXTURE_STATES: ReadonlySet<string> = new Set([...P28U_ORDERS_PLAN.filter((s) => s.key !== "orders-empty").map((s) => s.key), ...P28U_REG_KEYS]);
const p28uOn = STATES_ON && tenantKey === "coffee";
const P28U_OWNER_ONLY: ReadonlySet<string> = new Set(["orders-empty"]);
/** ช่องทาง DIRECT ของภาพ (โทรสั่ง · ช่องทางที่ร้านสร้างเอง adapter ปริยาย NONE — fix 1 F2 · หาตามรหัส · ไม่มี = สร้าง · ไม่ลบ — แบบ ensureChannelFixture) */
const P28U_PHONE = { code: "QCPHONE", name: "โทรสั่ง (ภาพ QC)" } as const;
/** orders-empty: สาขาที่สอง (อารีย์) ของเจ้าของ */
const P28U_EMPTY_UNIT = (T.units as Record<string, { id: string }>).ari?.id ?? unitId;
// ── POS P2.6U ▸ จอครัว (มติ 12 · wo p2.6u · --page kds|register|products|orders|settings --states · 3 ขนาด · th + LOCALE=en · owner + cashier) — fixture ของตัวเอง ◂
//   แคชเชียร์ QC = STAFF ที่มีแค่ pos.sale.create (seed ไม่ให้ restaurant.kds.advance) ⇒ จอครัวอ่านอย่างเดียว (ปุ่มเดิน/ดึงกลับ/เร่ง/พักครัวปิด + tooltip)
type P26uKdsKey = "kds-empty-unit" | "kds-empty-station" | "kds-mixed" | "kds-expo" | "kds-paused-banner" | "kds-86-sheet" | "kds-served-recall" | "kds-refusal-toast";
type P26uOtherKey = "register-tile-86" | "orders-kitchen-meter" | "products-drawer-station" | "settings-device-kitchen-slip";
const P26U_KDS_PLAN: { key: P26uKdsKey; devices: readonly Device[]; note: string }[] = [
  { key: "kds-empty-unit", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของเท่านั้น: สาขาอารีย์ (ไม่มีสถานีครัว) → \"ยังไม่มีสถานีครัว\" + ลิงก์ตั้งสถานี (แคชเชียร์เข้าได้สาขาเดียว)" },
  { key: "kds-empty-station", devices: ["desktop", "ipad", "mobile"], note: "แท็บสถานี \"ขนม <ตัวอักษรรอบ>\" (ไม่มีสินค้าผูก) → \"ยังไม่มีตั๋วในสถานีนี้\"" },
  { key: "kds-mixed", devices: ["desktop", "ipad", "mobile"], note: "ครัวร้อน: ใหม่ (โทรสั่ง) · กำลังทำ (เร่ง + เลยเป้า · ใกล้เป้า · โต๊ะ เสร็จ 1/2) · พร้อม (โทรสั่ง · หน้าขาย ถ้าขายได้) · แถบเสิร์ฟแล้ว · ค้างทำ/ของหมด (86 ครัวซองต์)" },
  { key: "kds-expo", devices: ["desktop", "ipad", "mobile"], note: "รวมเสิร์ฟ (Expo): ตั๋วพร้อมทุกสถานีรวมตามรอบ + ชิปสถานี + ปุ่มเสิร์ฟแล้วต่อกลุ่ม" },
  { key: "kds-paused-banner", devices: ["desktop", "ipad", "mobile"], note: "พักครัว (menu.setKitchenPause · คืนค่าหลังงานสุดท้าย/finally) → สวิตช์เปิด + ป้าย \"ครัวหยุดรับออเดอร์ · ออนไลน์และ QR ถูกพักไว้\"" },
  { key: "kds-86-sheet", devices: ["desktop", "ipad", "mobile"], note: "แจ้งของหมด → แผ่นขวา 420 (390 = \"ค้าง N · หมด M ›\"): รายการหมด (ครัวซองต์ · ครัวแจ้ง HH:MM) · ค้นหาเมนู · หมายเหตุ" },
  { key: "kds-served-recall", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของ: แตะแถบเสิร์ฟแล้ววันนี้ → ดึงใบล่าสุดกลับ + toast (เสิร์ฟคืนก่อนทุกภาพ) · แคชเชียร์: แถบปิด (ไม่มี restaurant.kds.recall)" },
  { key: "kds-refusal-toast", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของเท่านั้น: ออเดอร์แชทเสิร์ฟแล้วแล้วถูกยกเลิก → แถบเสิร์ฟแล้วของเครื่องดื่ม → ดึงกลับ → toast แดง TICKET_VOIDED (ไม่เขียนอะไร)" },
];
const P26U_OTHER_PLAN: { key: P26uOtherKey; page: PosPage; devices: readonly Device[]; note: string }[] = [
  { key: "register-tile-86", page: "register", devices: ["desktop", "ipad", "mobile"], note: "19ฉ: ครัวซองต์ถูกครัวแจ้ง 86 → ไทล์ \"หมด · ครัวแจ้ง HH:MM\" (pos-reg-tile-86)" },
  { key: "orders-kitchen-meter", page: "orders", devices: ["desktop", "ipad", "mobile"], note: "09: การ์ดออเดอร์โทรสั่งที่รับแล้ว → มาตร \"ครัวกำลังทำ d/t\" (pos-ord-kitchen-meter) + ตัวตั้งเพดานครัวค้างในราง (เจ้าของ)" },
  { key: "products-drawer-station", page: "products", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของเท่านั้น: 06 ลิ้นชักอเมริกาโน่เย็น → แท็บทั่วไป → ส่วนครัว (สถานี = ครัวร้อน · 86 ของสาขา)" },
  { key: "settings-device-kitchen-slip", page: "settings", devices: ["desktop", "ipad", "mobile"], note: "เจ้าของเท่านั้น: 17B เครื่อง QC 1 → ใบครัว \"พิมพ์หลังขายที่เครื่องนี้\" → ช่องติ๊กสถานี + LAN (เร็ว ๆ นี้ P3.11)" },
];
const P26U_WO = /^p2\.?6u/i.test(WO);
const p26uOn = STATES_ON && tenantKey === "coffee";
const P26U_KDS_KEYS: ReadonlySet<string> = new Set(P26U_KDS_PLAN.map((s) => s.key));
const P26U_OTHER_KEYS: ReadonlySet<string> = new Set(P26U_OTHER_PLAN.map((s) => s.key));
const isP26uState = (k: StateKey | null | undefined): k is P26uKdsKey | P26uOtherKey => !!k && (P26U_KDS_KEYS.has(k) || P26U_OTHER_KEYS.has(k));
const P26U_OWNER_ONLY: ReadonlySet<string> = new Set(["kds-empty-unit", "kds-refusal-toast", "products-drawer-station", "settings-device-kitchen-slip"]);
/** สถานะที่ต้องมี fixture ครัว (ทุกสถานะ P2.6U ยกเว้น kds-empty-unit) — สร้างก่อนงานแรก · ลบหลังงานสุดท้าย */
const P26U_FIXTURE_STATES: ReadonlySet<string> = new Set([...P26U_KDS_KEYS, ...P26U_OTHER_KEYS].filter((k) => k !== "kds-empty-unit"));
/** kds-empty-unit: สาขาที่สอง (อารีย์ · ไม่มีสถานีครัว) */
const P26U_EMPTY_UNIT = (T.units as Record<string, { id: string }>).ari?.id ?? unitId;
const P26U_LETTER = "ABCDEFGHJKLMNPQRSTUVWXYZ"[(process.pid + 7) % 24]!;
const p26uPlanFor = (page: PosPage) => P26U_OTHER_PLAN.filter((st) => st.page === page && (userKey === "owner" || !P26U_OWNER_ONLY.has(st.key)));
// ── POS P2.9U ▸ บัตรของขวัญ/เครดิตร้าน/ทิป (มติผู้คุม P2.9U ข้อ 10 · wo p2.9u · --page register|sales|settings --states · 3 ขนาด · th + LOCALE=en · owner + cashier) ◂
type P29uRegKey = "paydlg-giftcard-entry" | "paydlg-giftcard-split" | "paydlg-giftcard-pin-error" | "paydlg-giftcard-insufficient" | "paydlg-giftcard-changed" | "paydlg-storecredit" | "paydlg-tip" | "sale-done-giftcard";
type P29uOtherKey = "refund-to-card" | "settings-tip-ledger";
const P29U_REG_PLAN: { key: P29uRegKey; devices: readonly Device[]; note: string }[] = [
  { key: "paydlg-giftcard-entry", devices: ["desktop", "ipad", "mobile"], note: "ตะกร้า 02 → ชำระ → ช่องบัตรของขวัญ → เลขบัตร (fixture ฿500) + ค้นหา → GC-••••1234 · คงเหลือ · หมดอายุ + จำนวน + PIN (จุด) — ไม่กดใช้บัตร" },
  { key: "paydlg-giftcard-split", devices: ["desktop", "ipad", "mobile"], note: "แยกจ่ายเงินสด ฿300 → บัตร ฿325 (แป้น md+) + PIN → ใช้บัตรนี้ ⇒ แถว \"บัตรของขวัญ GC-••••1234 ฿325 ✓ · คงเหลือ ฿175\" — ไม่ยืนยัน" },
  { key: "paydlg-giftcard-pin-error", devices: ["desktop", "ipad", "mobile"], note: "บัตร PIN-error (fixture แยก · ≤ 3 ครั้งต่อรอบ < ล็อก 5) + PIN ผิด → ใช้บัตร → เงินสดพอดี → ยืนยัน ⇒ GIFT_CARD_PIN: แถว \"PIN ไม่ถูกต้อง\" + แผงใส่ PIN ใหม่ (ไม่มีบิล)" },
  { key: "paydlg-giftcard-insufficient", devices: ["desktop", "ipad", "mobile"], note: "บัตร ฿100 บนบิล 02 → จำนวน = ฿100 (ตัดที่ยอดบัตร) + \"รับส่วนต่างด้วยวิธีอื่น\"" },
  { key: "paydlg-giftcard-changed", devices: ["desktop", "ipad", "mobile"], note: "บัตร CHANGED + PIN → ใช้บัตร → ⚠️ ตัดยอดบัตรผ่าน giftcard.use (เหลือน้อยกว่าแถว) → เงินสดพอดี → ยืนยัน ⇒ แบนเนอร์ \"ยอดบัตรเปลี่ยน\" + ค้นใหม่ (จำนวนตัดลง · ใส่ PIN ใหม่) · ไม่มีบิล" },
  { key: "paydlg-storecredit", devices: ["desktop", "ipad", "mobile"], note: "ผูกสมาชิก QC (เครดิตร้าน ฿200 · issueStoreCredit คีย์ต่อวัน) → ช่องเครดิตร้าน \"คงเหลือ ฿200\" → แยกจ่าย ⇒ แถว \"เครดิตร้าน SC-••••\" — ไม่ยืนยัน" },
  { key: "paydlg-tip", devices: ["desktop", "ipad", "mobile"], note: "ร้านเปิดทิป (fixture · บัญชีหนี้สินของสมุดที่เชื่อม) → สวิตช์ทิป + ฿20 → แยกจ่ายเงินสด ฿300 ⇒ \"รวมทิป ฿20\" ใต้รายการ — ไม่ยืนยัน" },
  { key: "sale-done-giftcard", devices: ["desktop"], note: "⚠️ บิลขายจริง 1 ใบต่อผู้ใช้: บัตร ฿325 + เงินสดพอดี → 02b บรรทัด \"บัตรของขวัญ GC-••••1234 ฿325 · คงเหลือ ฿175\" + เงินสด" },
];
const P29U_OTHER_PLAN: { key: P29uOtherKey; page: PosPage; devices: readonly Device[]; note: string }[] = [
  { key: "refund-to-card", page: "sales", devices: ["desktop", "ipad", "mobile"], note: "บิลของ sale-done-giftcard (หรือบิลบัตรล่าสุดของวันนี้ในสาขา) → ลิ้นชัก → คืนเงิน → 1 บรรทัด → ชิป \"คืนเข้าบัตร GC-••••1234 (สูงสุด ฿x)\" — ไม่ยืนยัน · แคชเชียร์ = ลิ้นชัก (ไม่มีปุ่มคืนเงิน)" },
  { key: "settings-tip-ledger", page: "settings", devices: ["desktop", "ipad", "mobile"], note: "แท็บวิธีรับเงิน → การ์ดทิป: บัญชีพักทิป (หนี้สินเท่านั้น) เลือกตัวแรก — ไม่บันทึก · แคชเชียร์ = \"เฉพาะเจ้าของร้าน\"" },
];
const P29U_WO = /^p2\.?9u/i.test(WO);
const p29uOn = STATES_ON && tenantKey === "coffee";
const P29U_KEYS: ReadonlySet<string> = new Set([...P29U_REG_PLAN.map((s) => s.key), ...P29U_OTHER_PLAN.map((s) => s.key)]);
const isP29uState = (k: StateKey | null | undefined): k is P29uRegKey | P29uOtherKey => !!k && P29U_KEYS.has(k);
// ── POS P2.9bU ▸ มัดจำ (มติผู้คุม P2.9bU ข้อ 9 · wo p2.9bu · --page register|sales|settings --states · 3 ขนาด · th + LOCALE=en · owner + cashier) ◂
type P29buKey =
  | "paydlg-deposit-pick"
  | "paydlg-deposit-split"
  | "paydlg-deposit-exceeds"
  | "paydlg-deposit-notowner"
  | "paydlg-deposit-locked"
  | "deposit-receive"
  | "sale-done-deposit"
  | "bills-deposit-filter"
  | "refund-deposit"
  | "settings-deposit-toggle";
const P29BU_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P29BU_PLAN: { key: P29buKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "paydlg-deposit-pick", page: "register", devices: P29BU_D3, users: ["owner", "cashier"], note: "ตะกร้า 02 → ชำระ → ช่องมัดจำ → ค้นเลขใบเสร็จของมัดจำ fixture (walk-in ฿1,070 + เบอร์) → 4 หลักท้าย (จุด) → ยอดคงเหลือ + จำนวน ฿625 + \"ใช้มัดจำนี้\" — ไม่กดใช้" },
  { key: "paydlg-deposit-split", page: "register", devices: P29BU_D3, users: ["owner", "cashier"], note: "แยกจ่ายเงินสด ฿300 → มัดจำ ฿325 (ค่าปริยาย) → ใช้มัดจำนี้ ⇒ แถว \"มัดจำ #… ฿325 ✓ · คงเหลือ ฿745\" — ไม่ยืนยัน" },
  { key: "paydlg-deposit-exceeds", page: "register", devices: P29BU_D3, users: ["owner"], note: "มัดจำ ฿500 (ใบใหม่ต่อภาพ) ใช้ทั้งใบ + เงินสดพอดี → ⚠️ ใช้มัดจำ ฿1 ผ่าน submitRegisterSale (บิล ฿1 PAID) → ยืนยัน ⇒ DEPOSIT_EXCEEDS: แบนเนอร์ \"ยอดมัดจำเปลี่ยน\" + ค้นใหม่ (จำนวนตัดเหลือ ฿499) · ไม่มีบิล" },
  { key: "paydlg-deposit-notowner", page: "register", devices: P29BU_D3, users: ["owner"], note: "มัดจำของสมาชิก QC ฿500 บนบิลไม่มีสมาชิก → ค้นเลขใบเสร็จ (เห็นยอด) → ใช้ + เงินสดพอดี → ยืนยัน ⇒ DEPOSIT_NOT_OWNER: ถอดแถว + \"มัดจำใบนี้เป็นของสมาชิกคนอื่น…\" · ไม่มีบิล" },
  { key: "paydlg-deposit-locked", page: "register", devices: P29BU_D3, users: ["owner"], note: "มัดจำ walk-in ฿500 (ใบใหม่ต่อภาพ) → 4 หลักถูก → ใช้ + เงินสดพอดี → ⚠️ checkDepositPhone ผิด 5 ครั้งผ่านโมดูล → ยืนยัน ⇒ DEPOSIT_LOCKED: ถอดแถว + \"…ถูกระงับชั่วคราว 15 นาที\" · ไม่มีบิล" },
  { key: "deposit-receive", page: "register", devices: P29BU_D3, users: ["owner", "cashier"], note: "เมนู ⋯ (md+) / ปุ่มบนแถบมือถือ → \"รับมัดจำ\" → ยอด ฿500 · ชื่อ · เบอร์ · หมายเหตุ · เงินสด รับ ฿1,000 (ทอน ฿500) — ไม่กดรับมัดจำ" },
  { key: "sale-done-deposit", page: "register", devices: ["desktop"], users: ["owner", "cashier"], note: "⚠️ มัดจำ walk-in ฿1,000 ใหม่ 1 ใบ + บิลขายจริง 1 ใบต่อผู้ใช้: ตะกร้า 02 ฿625 จ่ายด้วยมัดจำทั้งยอด → 02b \"มัดจำ #… ฿625 · คงเหลือ ฿375\"" },
  { key: "bills-deposit-filter", page: "sales", devices: P29BU_D3, users: ["owner"], note: "บิลวันนี้ → ชิป \"มัดจำ\" ⇒ เฉพาะใบรับเงินมัดจำ (ป้าย \"มัดจำ\" · \"ใบรับเงินมัดจำ\")" },
  { key: "refund-deposit", page: "sales", devices: P29BU_D3, users: ["owner"], note: "มัดจำ fixture ฿1,000 ใบใหม่ (รัน --page sales แยก = ใบใหม่เสมอ · ใบของ sale-done-deposit ใช้ได้เฉพาะรันเดียวกันกับ register — P2.9bU fix1 มติ 5) → ลิ้นชัก → \"คืนมัดจำ (คงเหลือ ฿y)\" → 4 หลักท้าย + ดูยอด → เงินสด + เหตุผล — ไม่ยืนยัน" },
  { key: "settings-deposit-toggle", page: "settings", devices: P29BU_D3, users: ["owner"], note: "แท็บวิธีรับเงิน → การ์ด \"มัดจำ\": สวิตช์ \"รับเงินมัดจำ\" (เปิดโดย fixture) + บรรทัดช่วย — ไม่กด" },
];
const p29buOn = STATES_ON && tenantKey === "coffee";
const P29BU_KEYS: ReadonlySet<string> = new Set(P29BU_PLAN.map((s) => s.key));
const isP29buState = (k: StateKey | null | undefined): k is P29buKey => !!k && P29BU_KEYS.has(k);
// ── POS P2.11U ▸ หลายสาขา (มติ 11 · wo p2.11u · --page products|reports|settings|stock --states · 3 ขนาด · th + LOCALE=en · owner + manager) ◂
type P211uKey = "products-branch-filter" | "products-branch-copy" | "products-branch-compare" | "products-dead-row-note" | "products-manager-branch" | "reports-channels" | "settings-receipt-branch" | "stock-shared-inventory"; // fix1 มติ 4: bills-all-branches ถอดพร้อมชิป
const P211U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P211U_PLAN: { key: P211uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "products-branch-filter", page: "products", devices: P211U_D3, users: ["owner", "manager"], note: "06 ?unit=สีลม: ตัวกรอง \"สาขา: สีลม\" + คอลัมน์ \"ราคา สีลม\" — ลาเต้ = แถว (STORE, สีลม) ของ fixture (ตัวหนา + ชิป \"สาขา\") · อื่น = ราคากลาง (จาง)" },
  { key: "products-branch-copy", page: "products", devices: P211U_D3, users: ["owner"], note: "\"คัดลอกราคาจากสาขา\" → กล่อง (จาก อารีย์ → ไป สีลม · เปิด \"เขียนทับ\") — ไม่กดคัดลอก (ผู้จัดการ 1 สาขา = ไม่มีปุ่ม)" },
  { key: "products-branch-compare", page: "products", devices: P211U_D3, users: ["owner", "manager"], note: "\"เทียบราคาสาขา\" → แผ่น \"ขายที่ N สาขา\" (สินค้า × สาขา × ช่องทาง · 390 เลื่อนแนวนอน)" },
  { key: "products-dead-row-note", page: "products", devices: P211U_D3, users: ["owner", "manager"], note: "ลิ้นชักลาเต้: หมายเหตุ \"ราคาของช่องทาง/สาขาที่เลิกใช้แล้ว N แถว\" (fixture: ช่องทาง ZZVIS เก็บถาวรหลังตั้งราคา) · เจ้าของ = + ปุ่ม \"ล้างแถวที่เลิกใช้\" (ไม่กด)" },
  { key: "products-manager-branch", page: "products", devices: P211U_D3, users: ["manager"], note: "ผู้จัดการ{สีลม}: โหมดสาขา (ไม่มี \"ทุกสาขา\") · ลิ้นชักลาเต้ = กลุ่ม \"ทุกสาขา\" อ่านอย่างเดียว + คำอธิบาย · กลุ่มสีลมแก้ได้" },
  { key: "reports-channels", page: "reports", devices: P211U_D3, users: ["owner", "manager"], note: "08 ภาพรวมวันนี้ สาขาสีลม: การ์ด \"ช่องทางการขาย · % ของยอด\" ระหว่างสินค้าขายดีกับวิธีชำระ (fixture: บิล PAID 3 ใบวันนี้ หน้าร้าน ×2 + LINE MAN ×1 · คีย์ต่อวัน · ไม่ลบ)" },
  { key: "settings-receipt-branch", page: "settings", devices: P211U_D3, users: ["owner"], note: "17A แท็บใบเสร็จ: \"ข้อมูลสาขาบนใบเสร็จ\" สาขาสีลม = สาขาที่ 00001 + ที่อยู่/โทรของสาขา (fixture · คืนค่าเดิมหลังงานสุดท้าย) · ตัวอย่างขวา \"สาขา 00001\" (สมุด ABB ชั่วคราว · คืนใน cleanRpub)" },
  { key: "stock-shared-inventory", page: "stock", devices: P211U_D3, users: ["owner", "manager"], note: "16 คลัง: สาขาสีลม → หมายเหตุ \"คลังร่วมกับสาขา สาขาอารีย์ — สต็อกเป็นก้อนเดียวกัน\" (seed QC: สีลม + อารีย์ใช้คลังเดียวกัน · ไม่มี = fixture ผูกแล้วคืน)" },
];
const p211uOn = STATES_ON && tenantKey === "coffee" && P211U_WO;
const P211U_KEYS: ReadonlySet<string> = new Set(P211U_PLAN.map((s) => s.key));
const isP211uState = (k: StateKey | null | undefined): k is P211uKey => !!k && P211U_KEYS.has(k);
const p211uPath = (k: P211uKey): string =>
  k === "reports-channels"
    ? `/app/sys/${SYS}/pos/reports?kind=overview&unit=${encodeURIComponent(unitId)}`
    : k === "settings-receipt-branch"
    ? `/app/sys/${SYS}/pos/settings?tab=receipt&unit=${encodeURIComponent(unitId)}`
    : k === "stock-shared-inventory"
    ? `/app/sys/${SYS}/pos/stock?unit=${encodeURIComponent(unitId)}`
    : `/app/sys/${SYS}/pos/products?unit=${encodeURIComponent(unitId)}`;
// ── POS P2.10 ▸ จอลูกค้า (มติ 11 · wo p2.10 · --states · เจ้าของร้าน): หน้า display 1280×800 + 1024×768 (LOCALE=en = 1280 เท่านั้น) · หน้าตั้งค่า 3 ขนาด ◂
type P210Key = "settings-display-unpaired" | "settings-display-code" | "settings-display-online" | "display-pair" | "display-idle" | "display-cart" | "display-member-stamps" | "display-paying-promptpay" | "display-paying-cash" | "display-paying-card" | "display-done" | "display-stale" | "display-unsupported" | "display-live";
const P210_DVP: readonly Device[] = ["display", "ipad-land"];
const P210_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P210_PLAN: { key: P210Key; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "settings-display-unpaired", page: "settings", devices: P210_D3, users: ["owner"], note: "17B เครื่อง \"เคาน์เตอร์ 1\" (fixture) → บล็อก \"จอลูกค้า\": ยังไม่ได้จับคู่ + ปุ่มเปิดจอลูกค้า" },
  { key: "settings-display-code", page: "settings", devices: P210_D3, users: ["owner"], note: "กด \"เปิดจอลูกค้า\"/\"ขอรหัสใหม่\" → รหัส 8 ตัว + QR ของ <origin>/d?c=<รหัส> + เวลาเหลือ 10 นาที" },
  { key: "settings-display-online", page: "settings", devices: P210_D3, users: ["owner"], note: "จับคู่ผ่านบริการ + จออ่าน 1 ครั้ง → ออนไลน์ · สวิตช์แสดงแต้ม · ข้อความหน้าพัก · ภาษา · กด \"ยกเลิกการจับคู่\" → กล่องยืนยัน (ไม่กดยืนยัน)" },
  { key: "display-pair", page: "display", devices: P210_DVP, users: ["owner"], note: "ไม่มีคุกกี้ → ฟอร์มรหัสจับคู่ · พิมพ์ ABCD2345 → \"รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ\"" },
  { key: "display-idle", page: "display", devices: P210_DVP, users: ["owner"], note: "หน้าพัก: โลโก้ + ชื่อร้าน + สาขา · เคาน์เตอร์ 1 + \"ยินดีต้อนรับ\"" },
  { key: "display-cart", page: "display", devices: P210_DVP, users: ["owner"], note: "4 บรรทัดเท่าภาพ 11A (ตัวเลือก · ลด ฿10 ของช่วงบ่าย · 250 g) + รวม/ส่วนลดรายการ/คูปอง WELCOME50 · ขวา ยอดสุทธิ ฿625" },
  { key: "display-member-stamps", page: "display", devices: P210_DVP, users: ["owner"], note: "สวัสดีคุณสมชาย · Gold · 1,240 แต้ม · แถบสแตมป์ 8/10 \"ใกล้ได้รางวัล\"" },
  { key: "display-paying-promptpay", page: "display", devices: P210_DVP, users: ["owner"], note: "ภาพ 11A: ชำระแล้ว ฿300 · คงเหลือ ฿325 + QR พร้อมเพย์นิ่งยอด ฿325 (เซิร์ฟเวอร์สร้าง) · แถบ 7/10" },
  { key: "display-paying-cash", page: "display", devices: P210_DVP, users: ["owner"], note: "เงินสดรอบ 2: รับ ฿500 · ทอน ฿200" },
  { key: "display-paying-card", page: "display", devices: P210_DVP, users: ["owner"], note: "บัตร (ไม่มีใบขอรับเงิน) → ไอคอนบัตร + \"แตะหรือเสียบบัตรที่เครื่องรับบัตร\"" },
  { key: "display-done", page: "display", devices: P210_DVP, users: ["owner"], note: "⚠️ บิลเงินสด 1 ใบในกะของเครื่อง (fixture · ไม่ลบ) → ขอบคุณคุณสมชาย + เงินทอน ฿200 + ได้รับ 62 แต้ม + QR ใบเสร็จออนไลน์" },
  { key: "display-stale", page: "display", devices: P210_DVP, users: ["owner"], note: "ภาพตะกร้าที่ stateAt เก่า 121 วิ (หน้าขายหลุด) → หน้าพัก" },
  { key: "display-unsupported", page: "display", devices: P210_DVP, users: ["owner"], note: "แท็บเล็ตเก่า: บังคับกฎ @supports ด้วย style tag → หน้าแจ้งอัปเดตเบราว์เซอร์ (HTML ล้วน · ไทย + อังกฤษ)" },
  { key: "display-live", page: "display", devices: ["display"], users: ["owner"], note: "จับคู่กับเครื่องของรอบ (DEVICE_ID · กะ + โทเคนผู้ขาย) → แท็บหน้าขายจริงใส่อเมริกาโน่×2 + ลาเต้ → จอเห็นบรรทัดภายใน 20 วิ (hook use-display-publish)" },
];
const p210On = STATES_ON && tenantKey === "coffee" && P210_WO;
const P210_KEYS: ReadonlySet<string> = new Set(P210_PLAN.map((s) => s.key));
const isP210State = (k: StateKey | null | undefined): k is P210Key => !!k && P210_KEYS.has(k);
const p210Path = (k: P210Key): string =>
  k.startsWith("settings-") ? `/app/sys/${SYS}/pos/settings?tab=devices&unit=${encodeURIComponent(unitId)}` : `/d${LOCALE_EN && k === "display-pair" ? "?lang=en" : ""}`;
// ── POS P3.5U ▸ HR × POS (มติ 10 · wo p3.5u · --states · 3 ขนาด · th + LOCALE=en (1440 · หน้าขาย 390 ด้วยตาม EN_MOBILE_PAGES) · owner + cashier) ◂
type P35uKey =
  | "13b-schedule-chip-today"
  | "13b-schedule-chip-leave"
  | "13b-offschedule-refusal"
  | "13b-override-sheet"
  | "13b-override-wrong-pin"
  | "13a-shift-list-hr"
  | "07-shift-clock-ask-in"
  | "07-shift-clock-ask-out"
  | "07-shift-hours-owner"
  | "07-shift-hours-warnings"
  | "17c-staff-hr-switch-owner"
  | "17c-staff-schedule-gate-card"
  | "17c-staff-commission-card"
  | "08-report-commission-owner"
  | "08-report-commission-denied";
const P35U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P35U_PLAN: { key: P35uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "13b-schedule-chip-today", page: "register", devices: P35U_D3, users: ["owner", "cashier"], note: "13B: จอล็อก → การ์ดแคชเชียร์มีชิป \"ตารางวันนี้ HH:MM–HH:MM\" (ตาราง HR ครอบตอนนี้) · เจ้าของ = ชิปตารางของตัวเอง" },
  { key: "13b-schedule-chip-leave", page: "register", devices: P35U_D3, users: ["owner", "cashier"], note: "13B: ใบลา APPROVED วันนี้ของแคชเชียร์ → ชิป \"ลาวันนี้\" + การ์ดจาง (ยังแตะได้)" },
  { key: "13b-offschedule-refusal", page: "register", devices: P35U_D3, users: ["owner", "cashier"], note: "13B: ตารางแคชเชียร์ห่างตอนนี้ ≥ 1 ชม. · แตะแคชเชียร์ + PIN ถูก → \"นอกเวลางาน (ตารางวันนี้ …)\" + ปุ่ม \"ให้ผู้จัดการอนุญาต\"" },
  { key: "13b-override-sheet", page: "register", devices: P35U_D3, users: ["owner", "cashier"], note: "13B: ปุ่มผู้จัดการอนุญาต → แผ่น ManagerPinPad (ผู้จัดการ/เจ้าของที่มี PIN) — ไม่ใส่ PIN" },
  { key: "13b-override-wrong-pin", page: "register", devices: P35U_D3, users: ["cashier"], note: "13B: แผ่นผู้จัดการ → PIN ผู้จัดการผิด 6 หลัก → ข้อความ PIN ไม่ถูกต้อง (ล้างตัวนับผิดของเจ้าของหลังภาพ)" },
  { key: "13a-shift-list-hr", page: "shifts", devices: P35U_D3, users: ["owner"], note: "13A: กล่องเปิดกะ \"พนักงานที่เปิดกะ · จากตารางงาน HR วันนี้\" — เจ้าของ (ผู้เปิด · กรอบดำ) + แคชเชียร์ (เวลา HH:MM–HH:MM) — ไม่กดยืนยัน" },
  { key: "07-shift-clock-ask-in", page: "shifts", devices: P35U_D3, users: ["owner"], note: "07: เปิดกะผ่านกล่อง (โทเคนเจ้าของของเครื่อง) → แผ่น \"ลงเวลาเข้างานด้วยไหม\" — ไม่กดลงเวลา (กะของรอบปิดในงานถัดไป/เก็บกวาด)" },
  { key: "07-shift-clock-ask-out", page: "shifts", devices: P35U_D3, users: ["owner"], note: "07: ปิดกะ (นับ ฿0) → แผง Z + แผ่น \"ลงเวลาออกงานด้วยไหม\" — ไม่กดลงเวลา" },
  { key: "07-shift-hours-owner", page: "shifts", devices: P35U_D3, users: ["owner"], note: "07 (CD-P35U-5 เลย์เอาต์อนุพันธ์): กะที่ปิดแล้ว (ดูทั้งหมด) → บรรทัด \"ระยะเวลากะ 2:00 · เวลาทำงานตาม HR 1:50\" ไม่มีเตือน (กะ fixture + ลงเวลา HR)" },
  { key: "07-shift-hours-warnings", page: "shifts", devices: P35U_D3, users: ["owner"], note: "07: กะ fixture ไม่มีลงเวลา → ชิป \"ไม่ได้ลงเวลาเข้างาน\"" },
  { key: "17c-staff-hr-switch-owner", page: "settings", devices: P35U_D3, users: ["owner"], note: "17C แท็บพนักงาน: สวิตช์ \"ดึงรายชื่อและตารางงานจากระบบพนักงาน (HR)\" live (เปิดโดย fixture · เจ้าของแก้ได้)" },
  { key: "17c-staff-schedule-gate-card", page: "settings", devices: P35U_D3, users: ["owner"], note: "17C: การ์ด \"เข้ากะตามตารางงาน HR\" 30/30/240 นาที + ถามลงเวลา ASK — ไม่กดบันทึก" },
  { key: "17c-staff-commission-card", page: "settings", devices: P35U_D3, users: ["owner"], note: "17C: การ์ด \"ค่าคอมฯ พนักงานขาย\" (ผู้ดูเงินเดือน) อัตราปกติ 2% · หมวด/สินค้าจากแคตตาล็อก · ส่งเข้างวดเงินเดือน — ไม่กด" },
  { key: "08-report-commission-owner", page: "reports", devices: P35U_D3, users: ["owner"], note: "08 แท็บ \"ค่าคอมฯ พนักงาน\" วันนี้: แถวแคชเชียร์ (บิล fixture → ACCRUE) + แถวรวม · ชิปยังไม่ผูกพนักงาน HR (ไม่มีโปรไฟล์เงินเดือน)" },
  { key: "08-report-commission-denied", page: "reports", devices: P35U_D3, users: ["cashier"], note: "08 ?kind=commission ของแคชเชียร์ (ไม่มี pos.report.view) = การ์ดปฏิเสธ \"บัญชีนี้ยังไม่มีสิทธิ์ดูค่าคอมฯ พนักงาน\"" },
];
const p35uOn = STATES_ON && tenantKey === "coffee" && P35U_WO;
const P35U_KEYS: ReadonlySet<string> = new Set(P35U_PLAN.map((s) => s.key));
const isP35uState = (k: StateKey | null | undefined): k is P35uKey => !!k && P35U_KEYS.has(k);
const p35uPath = (k: P35uKey): string => {
  const u = encodeURIComponent(unitId);
  const page = P35U_PLAN.find((x) => x.key === k)!.page;
  if (page === "reports") {
    const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    return `/app/sys/${SYS}/pos/reports?kind=commission&from=${d}&to=${d}&unit=${u}`;
  }
  if (page === "settings") return `/app/sys/${SYS}/pos/settings?tab=staff&unit=${u}`;
  return `/app/sys/${SYS}/pos/${page}?unit=${u}`;
};
// ◂ POS P3.5U
// ── POS P3.4U ▸ ออฟไลน์ 19ง (มติผู้คุม 11 · wo p3.4u · --states · ไม่ส่ง --page = register + shifts + settings · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier) ◂
//   ทุกสถานะ = browser context ใหม่ (IndexedDB/คิวไม่ข้ามสถานะ) · ธงออฟไลน์เปิดด้วย updatePosOfflineEnabled (คืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ) ·
//   snapshot ดึงตอนออนไลน์ (ตอนโหลดหน้า) แล้วค่อย setOfflineMode · สถานะเดิม offline / settings-offline ไม่แตะ (ธงปิด = ภาพวันนี้)
type P34uKey =
  | "offline-sale"
  | "offline-queue"
  | "offline-tenders"
  | "offline-sync-back"
  | "offline-slip"
  | "offline-lock-pin"
  | "offline-rejected"
  | "offline-close-blocked"
  | "settings-offline-live";
const P34U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P34U_PLAN: { key: P34uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "offline-sale", page: "register", devices: P34U_D3, users: ["owner", "cashier"], note: "19ง: cart3 → ตัดเน็ต → ชำระเงินสด (พอดี) → จอ \"บันทึกแล้ว · รอซิงก์\" + เลขชั่วคราว OFF-… (บิลอยู่ในคิวของเครื่อง)" },
  { key: "offline-queue", page: "register", devices: P34U_D3, users: ["owner", "cashier"], note: "19ง: ขายออฟไลน์ 2 บิล → แถบ \"ออฟไลน์ตั้งแต่ … · ขายต่อได้ด้วยเงินสดและโอน · รอซิงก์ 2 บิล · เลขชั่วคราว OFF-…\" + ป้ายรอซิงก์ 2" },
  { key: "offline-tenders", page: "register", devices: P34U_D3, users: ["owner", "cashier"], note: "19ง: cart3 ออฟไลน์ → ชิป แต้ม/คูปอง/บัตร/พร้อมเพย์ \"ใช้ได้เมื่อออนไลน์\" + แถว \"ชำระเงินสด ฿x · โอน\" → กล่องโอน (เลขอ้างอิงไม่บังคับ)" },
  { key: "offline-sync-back", page: "register", devices: P34U_D3, users: ["owner", "cashier"], note: "ขายออฟไลน์ 1 บิล → กลับมาออนไลน์ → วงซิงก์ส่ง /api/pos/sync → แถบ \"ซิงก์บิลออฟไลน์แล้ว\" ป้าย 0 → รายการบิลออฟไลน์ \"ได้เลขจริง …\" (⚠️ บิลจริง 1 ใบในกะของรอบ)" },
  { key: "offline-slip", page: "register", devices: ["desktop", "mobile"], users: ["owner", "cashier"], note: "ขายออฟไลน์ → พิมพ์ใบรับเงินชั่วคราว (browser) → ถ่ายเอกสารสลิปเอง: หัว \"ใบรับเงินชั่วคราว — รอออกเลขจริง\" · เลข OFF · ไม่มี QR /r/ · ไม่ใช่ ABB" },
  { key: "offline-lock-pin", page: "register", devices: P34U_D3, users: ["owner", "cashier"], note: "มติ 7 + fix1 F2: ปลดล็อกออนไลน์ด้วย PIN → ตัดเน็ต → ล็อก · แคชเชียร์ (STAFF) = ตัวตรวจ PBKDF2 → \"ปลดล็อกได้เฉพาะ <ชื่อ>\" + PIN ผิด 1 ครั้ง \"เหลืออีก 4 ครั้ง\" · เจ้าของ = ไม่มีตัวตรวจ → \"ปลดล็อกที่เครื่องนี้ไม่ได้\" · สลับพนักงาน/ลืม PIN ปิด" },
  { key: "offline-rejected", page: "shifts", devices: P34U_D3, users: ["owner"], note: "CD-P34U-4 (อนุพันธ์): การ์ด \"บิลออฟไลน์รอผู้จัดการ\" — แถว fixture ราคาปลอม (syncOfflineSales → REJECTED PRICE_MISMATCH) · ผู้ขายที่อ้าง/ที่ตรวจ · รับ/ทิ้ง → เปิดช่องเหตุผล (ไม่กดยืนยัน)" },
  { key: "offline-close-blocked", page: "shifts", devices: P34U_D3, users: ["owner"], note: "มติ 6: ขายออฟไลน์ 1 บิลบนหน้าขาย (ซิงก์ถูกกั้นด้วย request interception) → หน้ากะของเครื่องเดียวกัน → \"ซิงก์ก่อนปิดกะ — … 1 บิล\" + ปุ่มปิดกะปิด" },
  { key: "settings-offline-live", page: "settings", devices: P34U_D3, users: ["owner"], note: "มติ 10: แท็บออฟไลน์ธงเปิด — สวิตช์ live (เจ้าของ) · \"เปิดขายออฟไลน์อยู่\" · แบนเนอร์ live · รอซิงก์ = เครื่องนี้ 0 + รอผู้จัดการ 1" },
];
const p34uOn = STATES_ON && tenantKey === "coffee" && P34U_WO;
const P34U_KEYS: ReadonlySet<string> = new Set(P34U_PLAN.map((s) => s.key));
const isP34uState = (k: StateKey | null | undefined): k is P34uKey => !!k && P34U_KEYS.has(k);
const p34uPath = (k: P34uKey): string => {
  const u = encodeURIComponent(unitId);
  const page = P34U_PLAN.find((x) => x.key === k)!.page;
  if (page === "settings") return `/app/sys/${SYS}/pos/settings?tab=offline&unit=${u}`;
  return `/app/sys/${SYS}/pos/${page}?unit=${u}`;
};
// ◂ POS P3.4U
// ── POS P3.7U ▸ แชท: การ์ด CHAT 10 · 09 ลิงก์ชำระในแชท + ชิป + UI-13 · PayDone ชิป LINE อัตโนมัติ (CD-P37U-1…10 · wo p3.7u · --states · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier) ◂
type P37uKey =
  | "settings-chat-card-off"
  | "settings-chat-card-on"
  | "settings-chat-card-readonly"
  | "settings-chat-sheet"
  | "settings-chat-sheet-invalid"
  | "orders-detail-chat-paylink"
  | "orders-detail-chat-nolink"
  | "orders-detail-chat-sent"
  | "orders-chat-card-requested"
  | "paydone-line-auto";
const P37U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P37U_PLAN: { key: P37uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "settings-chat-card-off", page: "settings", devices: P37U_D3, users: ["owner"], note: "แท็บการเชื่อมต่อ SHARK → การ์ดแชท: 4 แถวสวิตช์ปิดทั้งหมด (W15 · ไม่มีคีย์ settings.pos.chat) · ข้อความโควตา LINE OA · กรอบประ \"ปิดไว้ทั้งหมด — เจ้าของร้านเปิดเอง\" · ปุ่มตั้งค่าข้อความในแชท · การ์ด OFF (ระบบแชทชั่วคราว ไม่มี LINE) = เปิดสวิตช์ไม่ได้" },
  { key: "settings-chat-card-on", page: "settings", devices: P37U_D3, users: ["owner"], note: "การ์ดแชท: ส่งใบเสร็จทาง LINE อัตโนมัติ + แจ้งสถานะออเดอร์ในแชท เปิด (jsonb ของ harness · ต้องไม่มี LINE CONNECTED ไม่งั้น SKIP) · ไม่มีกรอบปิดทั้งหมด" },
  { key: "settings-chat-card-readonly", page: "settings", devices: P37U_D3, users: ["cashier"], note: "การ์ดแชทของแคชเชียร์: ตัวแสดงสถานะ (aria-disabled) + \"เจ้าของร้านเท่านั้นที่เปิด/ปิดได้\" · ไม่มีปุ่มแผ่น" },
  { key: "settings-chat-sheet", page: "settings", devices: P37U_D3, users: ["owner"], note: "แผ่น \"ตั้งค่าข้อความอัตโนมัติในแชท\": ชนิดสถานะ 4 ช่อง (รับออเดอร์ · พร้อมแล้ว · ยกเลิก · รับเงินแล้ว) + ชั่วโมงพักบอท 24 — ไม่กดบันทึก" },
  { key: "settings-chat-sheet-invalid", page: "settings", devices: P37U_D3, users: ["owner"], note: "แผ่นแชท: พิมพ์ 99 ชั่วโมง → บันทึก → ตัวเขียนปฏิเสธ VALIDATION field botPauseHours → ข้อความใต้ช่อง (ไม่มีอะไรถูกเขียน)" },
  { key: "orders-detail-chat-paylink", page: "orders", devices: P37U_D3, users: ["owner", "cashier"], note: "09 แผงออเดอร์แชท (ผูกห้อง WEBCHAT + สมาชิก QC) ใหม่ยังไม่จ่าย: ปุ่ม \"ส่งลิงก์ชำระในแชท\" (เจ้าของ = กดได้ · แคชเชียร์ = ปิด + needPerm) · สมาชิก = ชื่อ · ระดับ (UI-13) — ไม่กด" },
  { key: "orders-detail-chat-nolink", page: "orders", devices: P37U_D3, users: ["owner"], note: "09 แผงออเดอร์แชทที่ไม่ผูกห้อง: ปุ่มส่งลิงก์ชำระปิด + เหตุผล \"ออเดอร์นี้ไม่ได้ผูกกับห้องแชท…\"" },
  { key: "orders-detail-chat-sent", page: "orders", devices: P37U_D3, users: ["owner"], note: "⚠️ ออเดอร์แชทใหม่ต่อภาพ → กดปุ่มจริง (ประตู A บนร้าน QC · WEBCHAT ส่ง no-op) → \"แจ้งในแชทแล้ว · ชำระภายใน HH:MM\" + โน้ตรอชำระ (โหลดออเดอร์ใหม่) · เก็บกวาดปฏิเสธผ่านโมดูล" },
  { key: "orders-chat-card-requested", page: "orders", devices: P37U_D3, users: ["owner"], note: "09 รายการรอชำระ: การ์ดออเดอร์แชทที่ขอชำระแล้ว + ชิป \"ส่งลิงก์ชำระแล้ว · รอชำระ ฿x · ชำระภายใน HH:MM\" (ออเดอร์ของภาพ sent หรือ requestChatPayment ของ root)" },
  { key: "paydone-line-auto", page: "register", devices: ["desktop"], users: ["owner"], note: "⚠️ ขายจริง 1 บิลผูกสมาชิก QC (แบบ sale-done-member) ขณะ receiptAuto เปิด → 02b ชิป \"ส่งใบเสร็จทาง LINE อัตโนมัติ\" + ปุ่มส่งทาง LINE เดิม · receiptAuto ปิดทันทีหลังขาย (ต้องไม่มี LINE CONNECTED ไม่งั้น SKIP)" },
];
const p37uOn = STATES_ON && tenantKey === "coffee" && P37U_WO;
const P37U_KEYS: ReadonlySet<string> = new Set(P37U_PLAN.map((s) => s.key));
const isP37uState = (k: StateKey | null | undefined): k is P37uKey => !!k && P37U_KEYS.has(k);
const p37uPath = (k: P37uKey): string => {
  const u = encodeURIComponent(unitId);
  if (k.startsWith("settings-")) return `/app/sys/${SYS}/pos/settings?tab=shark&unit=${u}`;
  if (k.startsWith("orders-")) return `/app/sys/${SYS}/pos/orders?unit=${u}`;
  return `/app/sys/${SYS}/pos/register?unit=${u}`;
};
// ── POS P3.9U ▸ ผู้ช่วย AI: แผง 08 (สรุป/ว่าง/ปฏิเสธ/ปิด) · A11 · การ์ด AI 10 + แผ่นสรุปเช้า (มติ 1 4 6 · wo p3.9u · --states · 3 ขนาด · th + LOCALE=en 1440 · owner + cashier) ◂
type P39uKey =
  | "reports-ai-panel-brief"
  | "reports-ai-panel-empty"
  | "reports-ai-panel-refused"
  | "reports-ai-panel-off"
  | "reports-anomalies-a11"
  | "settings-general-anomaly-a11"
  | "settings-ai-card-off"
  | "settings-ai-card-linked"
  | "settings-ai-brief-sheet"
  | "settings-ai-brief-sheet-invalid";
const P39U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P39U_PLAN: { key: P39uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "reports-ai-panel-brief", page: "reports", devices: P39U_D3, users: ["owner"], note: "08 ภาพรวมวันนี้: แผง \"สรุปเช้า POS\" ข้างการ์ดพนักงาน — บรรทัดจาก composeBrief (บิล fixture วันนี้ + ยกเลิก 1 บิล + A11 ×3 = บรรทัดจุดผิดปกติที่ต้องทำต่อ) · \"วิเคราะห์เมื่อ HH:MM\" · ปุ่ม สร้างใบสั่งซื้อ (ร่าง) / ถามต่อ · กรอบประ AI เสนอเท่านั้น (ผู้ช่วย AI เปิด)" },
  { key: "reports-ai-panel-empty", page: "reports", devices: P39U_D3, users: ["owner"], note: "08 ภาพรวมวันที่ 2024-01-02 (ไม่มีบิล): แผง = \"ยังไม่มีสรุปเช้า\" + ปุ่มถามต่อ (ผู้ช่วย AI เปิด · fix1 N1: ไม่มีบรรทัดที่ต้องทำต่อ — 86 ของระบบ + จุดสั่งซื้อของสินค้าใกล้หมดพักชั่วคราวแล้วคืน)" },
  { key: "reports-ai-panel-refused", page: "reports", devices: P39U_D3, users: ["cashier"], note: "08 ของแคชเชียร์ (ไม่มี pos.report.view): การ์ดปฏิเสธของหน้า + แผงผู้ช่วย AI สถานะปฏิเสธ (ไม่มีตัวเลข)" },
  { key: "reports-ai-panel-off", page: "reports", devices: P39U_D3, users: ["owner"], note: "08 ภาพรวมวันนี้ ผู้ช่วย AI ปิด: การ์ดเส้นประ \"ผู้ช่วย AI ของหน้าขายปิดอยู่\" + ลิงก์ไปตั้งค่า (เจ้าของร้าน)" },
  { key: "reports-anomalies-a11", page: "reports", devices: P39U_D3, users: ["owner"], note: "แท็บจุดผิดปกติวันนี้: กลุ่ม A11 \"ข้ามตารางงานบ่อย\" (audit pos.staff.schedule_override ×3 ของ fixture · ผู้อนุมัติ = เจ้าของ · เกณฑ์ 3)" },
  { key: "settings-general-anomaly-a11", page: "settings", devices: P39U_D3, users: ["owner"], note: "แท็บทั่วไป → การ์ดจุดผิดปกติ: แถว A11 (ครั้ง · ค่าของระบบ) — ไม่กดบันทึก" },
  { key: "settings-ai-card-off", page: "settings", devices: P39U_D3, users: ["owner"], note: "แท็บการเชื่อมต่อ SHARK: การ์ด AI สถานะ OFF (จาง) · สวิตช์จริงของเจ้าของ aria-checked=false · ปุ่มตั้งค่าสรุปเช้า · กรอบประ AI.note" },
  { key: "settings-ai-card-linked", page: "settings", devices: P39U_D3, users: ["owner"], note: "การ์ด AI สถานะ LINKED (ผู้ช่วย AI เปิด) · สวิตช์ aria-checked=true" },
  { key: "settings-ai-brief-sheet", page: "settings", devices: P39U_D3, users: ["owner"], note: "แผ่น \"ตั้งค่าสรุปเช้า\": ส่งทุกวัน · เวลา 06:00 น. · อีเมล · จุดผิดปกติ · รายชื่อผู้จัดการ (ผู้จัดการชั่วคราวของภาพ) — ไม่กดบันทึก" },
  { key: "settings-ai-brief-sheet-invalid", page: "settings", devices: P39U_D3, users: ["owner"], note: "แผ่นสรุปเช้า: เลือกผู้จัดการชั่วคราว → harness ลดบทบาทเป็น STAFF → บันทึก → ข้อความใต้รายชื่อ \"ผู้รับต้องเป็นผู้จัดการ…\" (field brief.managerUserIds · คืนบทบาทหลังภาพ)" },
];
const p39uOn = STATES_ON && tenantKey === "coffee" && P39U_WO;
const P39U_KEYS: ReadonlySet<string> = new Set(P39U_PLAN.map((s) => s.key));
const isP39uState = (k: StateKey | null | undefined): k is P39uKey => !!k && P39U_KEYS.has(k);
const P39U_EMPTY_DATE = "2024-01-02";
const p39uDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const p39uPath = (k: P39uKey): string => {
  const u = encodeURIComponent(unitId);
  const d = p39uDay();
  const rep = (q: string) => `/app/sys/${SYS}/pos/reports?${q}`;
  switch (k) {
    case "reports-ai-panel-empty":
      return rep(`kind=overview&from=${P39U_EMPTY_DATE}&to=${P39U_EMPTY_DATE}`);
    case "reports-anomalies-a11":
      return rep(`kind=anomalies&from=${d}&to=${d}`);
    case "settings-general-anomaly-a11":
      return `/app/sys/${SYS}/pos/settings?tab=general&unit=${u}`;
    case "settings-ai-card-off":
    case "settings-ai-card-linked":
    case "settings-ai-brief-sheet":
    case "settings-ai-brief-sheet-invalid":
      return `/app/sys/${SYS}/pos/settings?tab=shark&unit=${u}`;
    default:
      return rep(`kind=overview&from=${d}&to=${d}`);
  }
};
// ◂ POS P3.9U
// ── POS P3.6U ▸ ลูกค้าองค์กร/วางบิล (CD-P36U-1…12 · wo p3.6u · --states · 3 ขนาด · th + LOCALE=en 1440 (+390 register/sales) · owner 15 + cashier 6) ◂
type P36uKey =
  | "register-company-chip"
  | "register-company-picker-search"
  | "register-company-picker-member"
  | "register-deal-select"
  | "paydlg-onaccount-owner"
  | "paydlg-onaccount-cashier"
  | "paydlg-onaccount-buyer"
  | "paydlg-onaccount-hidden"
  | "paydlg-credit-over-sheet"
  | "paydlg-credit-over-wrong-pin"
  | "paydone-onaccount-due"
  | "bills-drawer-onaccount"
  | "bills-refund-onaccount"
  | "reports-credit-owner"
  | "reports-credit-denied"
  | "settings-credit-card-off"
  | "settings-credit-card-on"
  | "settings-credit-account-invalid"
  | "settings-credit-readonly"
  | "settings-orders-member-on-bill";
const P36U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P36U_PLAN: { key: P36uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "register-company-chip", page: "register", devices: P36U_D3, users: ["owner", "cashier"], note: "01 ตะกร้า 2 บรรทัด + เลือกบริษัท -co (ค้นเลขผู้เสียภาษี) → ชิปบริษัท ชื่อ · เลขภาษี · สำนักงานใหญ่ + \"ถอดบริษัท\" · แคชเชียร์ไม่มีตัวเลือกดีล (ไม่มี crm.deal.update)" },
  { key: "register-company-picker-search", page: "register", devices: P36U_D3, users: ["owner"], note: "แผ่นเลือกบริษัท: ค้น \"ภาพคิวซี\" → แถว -co / -co2 (ชื่อ · เลขภาษี · สาขาเท่านั้น)" },
  { key: "register-company-picker-member", page: "register", devices: P36U_D3, users: ["owner"], note: "ผูกสมาชิก QC → แผ่นเลือกบริษัท: ส่วน \"บริษัทของสมาชิกนี้\" = -co (ผู้ติดต่อ CRM ของสมาชิก) + บริษัทล่าสุด" },
  { key: "register-deal-select", page: "register", devices: P36U_D3, users: ["owner"], note: "เลือก -co → ตัวเลือกดีล \"ชื่อดีล · ขั้น\" (ไม่มีมูลค่าดีล) → เลือกดีล OPEN ของภาพ" },
  { key: "paydlg-onaccount-owner", page: "register", devices: P36U_D3, users: ["owner"], note: "02 ไทล์วางบิล (requireBuyer ปิด) → แถวเดียวเต็มยอด · สถานะ: วงเงินพอ · เทอม 30 วัน · ครบกำหนด · วงเงินคงเหลือ (ผู้ถือ pos.credit.manage)" },
  { key: "paydlg-onaccount-cashier", page: "register", devices: P36U_D3, users: ["cashier"], note: "02 ไทล์วางบิลของแคชเชียร์: วงเงินพอ · เทอม · ครบกำหนด — ไม่มีตัวเลขวงเงิน (CD-4)" },
  { key: "paydlg-onaccount-buyer", page: "register", devices: P36U_D3, users: ["owner"], note: "requireBuyer เปิด: แตะไทล์ → 15A ตั้งต้นจากบริษัท (นิติบุคคล · ชื่อ · เลขภาษี · สาขา) → แก้เลขภาษีเป็นเลขอื่น + ที่อยู่ → บันทึก → คำเตือนเลขภาษีไม่ตรงบริษัท" },
  { key: "paydlg-onaccount-hidden", page: "register", devices: P36U_D3, users: ["owner"], note: "ปิดวางบิล (settings.pos.credit.enabled false) — จอชำระไม่มีไทล์วางบิล (มีชิปบริษัทในตะกร้า)" },
  { key: "paydlg-credit-over-sheet", page: "register", devices: P36U_D3, users: ["cashier"], note: "-co2 วงเงิน ฿1: ไทล์ → วงเงินไม่พอ → ยืนยัน → แผ่น \"เกินวงเงินวางบิล\" + แป้น PIN ผู้จัดการ (ไม่มีตัวเลขวงเงินของแคชเชียร์) · ไม่มีบิล" },
  { key: "paydlg-credit-over-wrong-pin", page: "register", devices: P36U_D3, users: ["cashier"], note: "แผ่นเกินวงเงิน → เลือกผู้จัดการของภาพ → PIN ผิด 6 หลัก → ส่งซ้ำคีย์เดิม + creditOverride → PIN_INVALID ใต้แป้น (failedCount ล้างด้วย unlockStaffPin)" },
  { key: "paydone-onaccount-due", page: "register", devices: ["desktop"], users: ["owner"], note: "⚠️ ขายจริง 1 บิลวางบิลของ -co (กดยืนยัน) → 02b \"วางบิล (เครดิตเทอม)\" + ชิป \"บริษัท · ครบกำหนด <วัน>\" (วันจากสถานะวงเงินล่าสุด · owner-ack) · บิลนี้ใช้ต่อในภาพบิล · voidSale ตอนเก็บกวาด" },
  { key: "bills-drawer-onaccount", page: "sales", devices: P36U_D3, users: ["owner"], note: "12 ?bill= บิลวางบิล: วิธีชำระ \"วางบิล (เครดิตเทอม)\" · แถวบัญชี \"ใบแจ้งหนี้/ใบกำกับภาษี\" + ลิงก์เอกสาร (W23) · ไม่มีแถวขอ/ออกใบเต็มรูป" },
  { key: "bills-refund-onaccount", page: "sales", devices: P36U_D3, users: ["owner"], note: "12 คืนเงินบิลวางบิล: เลือก 1 บรรทัด → ชิปเดียว \"วางบิล (ลดหนี้)\" (วิธีอื่นซ่อน) — ไม่กดยืนยัน" },
  { key: "reports-credit-owner", page: "reports", devices: P36U_D3, users: ["owner"], note: "08 แท็บ \"ลูกหนี้ลูกค้าองค์กร\" (?kind=credit 30 วัน): บริษัท · บิล · ยอดวางบิล · คืน · ค้าง · เกินกำหนด · ครบกำหนดเก่าสุด (หรือข้อความว่าง)" },
  { key: "reports-credit-denied", page: "reports", devices: P36U_D3, users: ["cashier"], note: "08 ?kind=credit ของแคชเชียร์: การ์ดปฏิเสธของรายงานลูกหนี้ (ไม่เรียกเซิร์ฟเวอร์เมื่อไม่มี pos.report.view)" },
  { key: "settings-credit-card-off", page: "settings", devices: P36U_D3, users: ["owner"], note: "10 แท็บวิธีรับเงิน → การ์ด \"ลูกค้าเครดิต (วางบิล)\" ปิด: สวิตช์ aria-checked=false + กรอบเส้นประ \"ปิดอยู่\" · บัญชีเครดิต -co/-co2" },
  { key: "settings-credit-card-on", page: "settings", devices: P36U_D3, users: ["owner"], note: "การ์ดลูกค้าเครดิตเปิด (requireBuyer เปิด) + แถวบัญชี -co ฿500,000 · -co2 ฿1 · เทอม 30 วัน · ใช้งาน · ปุ่มแก้/เพิ่มบริษัท" },
  { key: "settings-credit-account-invalid", page: "settings", devices: P36U_D3, users: ["owner"], note: "แก้แถว -co → เทอม 400 วัน → บันทึก → ข้อความปฏิเสธในฟอร์ม (VALIDATION ของ saveCreditAccount · ไม่เขียน)" },
  { key: "settings-credit-readonly", page: "settings", devices: P36U_D3, users: ["cashier"], note: "การ์ดลูกค้าเครดิตของแคชเชียร์: สวิตช์แสดงสถานะ (aria-disabled) + \"เจ้าของร้านเท่านั้น\" + ไม่มีสิทธิ์ตั้งวงเงิน (ไม่มีแถวบัญชี)" },
  { key: "settings-orders-member-on-bill", page: "settings", devices: P36U_D3, users: ["owner"], note: "10 แท็บช่องทางขาย → การ์ด \"บิลออเดอร์\": สวิตช์แนบสมาชิกกับบิลออเดอร์ (เปิด · ปริยาย) + บรรทัดช่วย W17" },
];
const p36uOn = STATES_ON && tenantKey === "coffee" && P36U_WO;
/** บิลวางบิลของภาพ (paydone-onaccount-due → ภาพบิล ?bill=) — ประกาศก่อน jobsPlanned (p36uPath ถูกเรียกตอนวางแผน) */
const P36U_SALE = { id: "" };
const P36U_TAG = "posqc-vis-p36u";
const P36U_CRM_NAME = "ลูกค้าองค์กร (ภาพ QC P3.6U)";
const P36U_CO = {
  co: { tag: `${P36U_TAG}-co`, name: "บริษัท ภาพคิวซี เทรดดิ้ง จำกัด", taxId: "0105559360014", limitSatang: 50_000_000 },
  co2: { tag: `${P36U_TAG}-co2`, name: "บริษัท ภาพคิวซี วงเงินน้อย จำกัด", taxId: "0105559360022", limitSatang: 100 },
} as const;
const P36U_DEAL_TITLE = `สั่งกาแฟประจำเดือน (${P36U_TAG}-deal)`;
const P36U_MGR = { userId: "posqc-coffee-user-p36u-mgr", membershipId: "posqc-coffee-mb-p36u-mgr", email: "pos-qc-coffee-p36u-mgr@shark.local", name: "ผู้จัดการ (ภาพ QC P3.6U)" } as const;
const P36U_REASON = "ภาพ QC P3.6U";
const P36U_KEYS: ReadonlySet<string> = new Set(P36U_PLAN.map((s) => s.key));
const isP36uState = (k: StateKey | null | undefined): k is P36uKey => !!k && P36U_KEYS.has(k);
const p36uPath = (k: P36uKey): string => {
  const u = encodeURIComponent(unitId);
  const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${d}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  if (k.startsWith("bills-")) return `/app/sys/${SYS}/pos/sales?unit=${u}${P36U_SALE.id ? `&bill=${encodeURIComponent(P36U_SALE.id)}` : ""}`;
  if (k.startsWith("reports-")) return `/app/sys/${SYS}/pos/reports?kind=credit&from=${from}&to=${d}`;
  if (k === "settings-orders-member-on-bill") return `/app/sys/${SYS}/pos/settings?tab=channels&unit=${u}`;
  if (k.startsWith("settings-")) return `/app/sys/${SYS}/pos/settings?tab=payments&unit=${u}`;
  return `/app/sys/${SYS}/pos/register?unit=${u}`;
};
// ◂ POS P3.6U
// ── POS P3-SKEL U ▸ โครงแพลตฟอร์ม (CD-SKELU-12 · wo p3-skel-u · --states · settings/register/sales/reports · 3 ขนาด · th + LOCALE=en 1440 (+390 register/sales) · owner 17 + cashier 5 ต่อภาษา) ◂
type P3skuKey =
  | "settings-channel-creds-draft"
  | "settings-channel-creds-complete"
  | "settings-channel-creds-keymissing"
  | "settings-channels-platform-chips"
  | "settings-slip-card"
  | "settings-slip-verify-sheet"
  | "settings-etax-sheet"
  | "settings-devices-lan-none"
  | "settings-devices-lan-agents"
  | "settings-devices-lan-token"
  | "paydlg-intent-slip"
  | "paydone-transfer-slip"
  | "taxinv-etax-line"
  | "bills-drawer-slips"
  | "bills-slip-sheet"
  | "bills-slip-reject-invalid"
  | "reports-reconcile-owner"
  | "reports-reconcile-denied";
const P3SKU_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P3SKU_PLAN: { key: P3skuKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "settings-channel-creds-draft", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "10 ลิ้นชัก LINE MAN (โหมดแก้): การ์ด credentials — แถว DRAFT (client_id + client_secret ของ fixture · restaurant_id/webhookSecret ว่าง) · ช่องลับว่าง placeholder ปิดบัง · URL webhook + \"ใช้ได้เมื่อเปิดตัวเชื่อมจริง (W4)\" · QC5 ไม่มีกุญแจ = ชิป \"ยังไม่ตั้งกุญแจ\"" },
  { key: "settings-channel-creds-complete", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "ลิ้นชัก Grab: แถว COMPLETE (fixture ครบ 4 ช่อง ผ่าน saveIntegrationCredentials + deps.key) → กด \"ทดสอบการเชื่อม\" → บรรทัด ADAPTER_PENDING (ไม่มีคำว่าเชื่อมแล้ว) · ไม่มีแถว COMPLETE = SKIP" },
  { key: "settings-channel-creds-keymissing", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "ลิ้นชัก LINE MAN เมื่อเซิร์ฟเวอร์ไม่มี POS_CREDENTIALS_KEY: กรอบ \"ยังไม่ตั้งกุญแจ\" + ช่อง/บันทึกปิด · เซิร์ฟเวอร์มีกุญแจ = SKIP พร้อมเหตุผล" },
  { key: "settings-channels-platform-chips", page: "settings", devices: P3SKU_D3, users: ["owner", "cashier"], note: "10 แท็บช่องทางขาย: ชิปสถานะ credentials ใต้ชื่อแถว LINE MAN/Grab (pos-channel-conn-*) เฉพาะผู้ถือ pos.channel.manage · แคชเชียร์ = ไม่มีชิป + อ่านอย่างเดียว" },
  { key: "settings-slip-card", page: "settings", devices: P3SKU_D3, users: ["owner", "cashier"], note: "10 แท็บวิธีรับเงิน: การ์ด \"สลิปโอน\" หลังการ์ด Beam — แนบสลิปใช้งานได้ · อายุเก็บ 1,825 วัน อ่านอย่างเดียว (W19) · ตรวจสลิปอัตโนมัติ รอผู้ให้บริการ + ปุ่มตั้งค่า (แคชเชียร์ไม่มีปุ่ม)" },
  { key: "settings-slip-verify-sheet", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "แผ่นตรวจสลิปอัตโนมัติ: เลือก SlipOK (harness เลือกเพื่อแสดงการ์ด · ไม่บันทึก) → การ์ด credentials SLIP_VERIFY (api_key ลับ · branch_id)" },
  { key: "settings-etax-sheet", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "แท็บการเชื่อมต่อ SHARK: แถว e-Tax ปุ่ม \"สมัคร\" live (pos.settings.manage) → แผ่น e-Tax · เลือก INET → การ์ด credentials ETAX (ไม่ส่ง/ไม่ตัวอย่าง)" },
  { key: "settings-devices-lan-none", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "17B แท็บเครื่อง: การ์ดตัวช่วยพิมพ์ LAN ว่าง + วิทยุแลนปิด + \"ยังไม่มีตัวช่วยพิมพ์ LAN\" · มี agent ที่ไม่ใช่ของ harness = SKIP" },
  { key: "settings-devices-lan-agents", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "agent posqc-vis-p3sku-agent (192.168.1.50:9100 ใบครัว · 192.168.1.51:9100 ใบเสร็จ · registerPrintAgent) + เครื่องนี้ printerConfig โหมดแลน + ใบครัว after-sale (jsonb ของ harness · _qcP3skuBefore) → วิทยุแลนติ๊ก · วิทยุใบครัว LAN ติ๊ก (ชื่อเรียก)" },
  { key: "settings-devices-lan-token", page: "settings", devices: P3SKU_D3, users: ["owner"], note: "ฟอร์มลงทะเบียนตัวช่วยพิมพ์ → กดลงทะเบียนจริง 1 ครั้ง → กล่องโทเคนครั้งเดียว (harness ปิดบังโทเคนในภาพ · agent ถูกเพิกถอนตอนเก็บกวาด)" },
  { key: "paydlg-intent-slip", page: "register", devices: P3SKU_D3, users: ["owner", "cashier"], note: "02 พร้อมเพย์แบบคงที่ (ใบ PENDING) → ปุ่ม \"แนบสลิป\" ข้างยืนยันเอง → ฟอร์มแนบสลิป (รูป · ยอดบนสลิปไม่เติมให้ · เลขอ้างอิง) — ไม่อัป (QC5 ไม่มีที่เก็บไฟล์) · Beam เปิด = SKIP" },
  { key: "paydone-transfer-slip", page: "register", devices: ["desktop"], users: ["owner"], note: "02 โอนเงิน → ยืนยัน → 02b ปุ่ม \"แนบสลิป\" → ฟอร์มของแถว TRANSFER (slipTargetsAction) · ⚠️ บิลโอนจริง 1 ใบ → voidSale ตอนเก็บกวาด" },
  { key: "taxinv-etax-line", page: "register", devices: P3SKU_D3, users: ["owner"], note: "15A ใบกำกับเต็มรูป: บรรทัดจาง \"ส่ง e-Tax ทางอีเมล · รอผู้ให้บริการ\" ใต้ช่องอีเมล (ไม่มีช่องติ๊ก) · สมุด QC ไม่ผูก = SKIP" },
  { key: "bills-drawer-slips", page: "sales", devices: P3SKU_D3, users: ["owner", "cashier"], note: "12 ?bill= บิลโอน fixture (createSale TRANSFER) + สลิป 1 ใบ (attachSlip + deps.put stub · PNG สังเคราะห์ · ยอดที่พิมพ์ ≠ ยอดชำระ) → บล็อกสลิป: ชิปสถานะ + แนบสลิป · แคชเชียร์ไม่มีปุ่มตัดสิน" },
  { key: "bills-slip-sheet", page: "sales", devices: P3SKU_D3, users: ["owner"], note: "แตะชิปสลิป → แผ่นสลิป: รูป = \"แสดงรูปสลิปไม่ได้\" (ไฟล์ stub) · ยอดบนสลิปไม่ตรงยอดชำระ · ยืนยัน/ปฏิเสธ (เจ้าของร้าน) · คำว่าหลักฐานเท่านั้น" },
  { key: "bills-slip-reject-invalid", page: "sales", devices: P3SKU_D3, users: ["owner"], note: "แผ่นสลิป → ปฏิเสธ → เหตุผล 2 ตัวอักษร → ยืนยันการปฏิเสธ → ข้อความ \"ระบุเหตุผล 3–200 ตัวอักษร\" (ไม่เรียกเซิร์ฟเวอร์ · ไม่เขียน)" },
  { key: "reports-reconcile-owner", page: "reports", devices: P3SKU_D3, users: ["owner"], note: "08 แท็บ \"กระทบยอดรับเงิน\" (?kind=reconcile 30 วัน · สาขา QC): การ์ดต่อวัน + แถว + ป้ายผล ของใบขอรับเงินที่มีอยู่ (ว่าง = ข้อความว่าง) · CSV · PDF/settlement ปิดพร้อมเหตุผล" },
  { key: "reports-reconcile-denied", page: "reports", devices: P3SKU_D3, users: ["cashier"], note: "08 ?kind=reconcile ของแคชเชียร์ (ไม่มี pos.report.view): การ์ดปฏิเสธของรายงานกระทบยอด" },
];
const p3skuOn = STATES_ON && tenantKey === "coffee" && P3SKU_WO;
const P3SKU_KEYS: ReadonlySet<string> = new Set(P3SKU_PLAN.map((s) => s.key));
const isP3skuState = (k: StateKey | null | undefined): k is P3skuKey => !!k && P3SKU_KEYS.has(k);
const P3SKU_SALE = { id: "" };
const p3skuPath = (k: P3skuKey): string => {
  const u = encodeURIComponent(unitId);
  const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${d}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  if (k.startsWith("bills-")) return `/app/sys/${SYS}/pos/sales?unit=${u}${P3SKU_SALE.id ? `&bill=${encodeURIComponent(P3SKU_SALE.id)}` : ""}`;
  if (k.startsWith("reports-")) return `/app/sys/${SYS}/pos/reports?kind=reconcile&from=${from}&to=${d}&unit=${u}`;
  if (k.startsWith("settings-channel")) return `/app/sys/${SYS}/pos/settings?tab=channels&unit=${u}`;
  if (k.startsWith("settings-slip")) return `/app/sys/${SYS}/pos/settings?tab=payments&unit=${u}`;
  if (k === "settings-etax-sheet") return `/app/sys/${SYS}/pos/settings?tab=shark&unit=${u}`;
  if (k.startsWith("settings-devices")) return `/app/sys/${SYS}/pos/settings?tab=devices&unit=${u}`;
  return `/app/sys/${SYS}/pos/register?unit=${u}`;
};
// fixture ของภาพ (ค่าคงที่ — ใช้ทั้ง --probe ก่อนต่อ DB และ fixture ตอนถ่าย · รายละเอียดที่ ensureP3skuFixture)
const P3SKU_TAG = "posqc-vis-p3sku";
/** กุญแจคงที่ของ harness (ไม่ใช่ความลับ — ปิดกล่องค่าปลอม posqc-… เท่านั้น · ≥ 32 ตัว) */
const P3SKU_KEY = "posqc-vis-p3sku-harness-key-not-a-secret-0001";
const P3SKU_CREDS = {
  LINEMAN: { client_id: "posqc-lineman-client", client_secret: "posqc-lineman-secret-0001", restaurant_id: "", webhookSecret: "" },
  GRAB: { client_id: "posqc-grab-client", client_secret: "posqc-grab-secret-0001", merchant_id: "posqc-grab-merchant", webhookSecret: "posqc-grab-webhook-0001" },
} as const;
const P3SKU_PRINTERS = [
  { name: "เครื่องพิมพ์ครัว", host: "192.168.1.50", port: 9100, target: "kitchen" },
  { name: "เครื่องพิมพ์ใบเสร็จ", host: "192.168.1.51", port: 9100, target: "receipt" },
] as const;
// ◂ POS P3-SKEL U
// ── POS P3.8U ▸ บอร์ดงาน/ห้องทีม (CD-P38U-11 · wo p3.8u · --states · settings/reports/shifts · 3 ขนาด · LOCALE=en 1440 · owner + cashier) ◂
type P38uKey =
  | "settings-board-off"
  | "settings-board-on"
  | "settings-board-readonly"
  | "settings-board-invalid"
  | "settings-board-room-stale"
  | "settings-shark-kanban-link"
  | "reports-anomalies-card-button"
  | "reports-anomalies-card-pressed"
  | "reports-anomalies-card-chip"
  | "reports-ai-panel-board"
  | "shifts-closed-board-chip"
  | "shifts-close-board-hint";
const P38U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P38U_PLAN: { key: P38uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "settings-board-off", page: "settings", devices: P38U_D3, users: ["owner"], note: "แท็บบอร์ดงานและห้องทีม ทุกอย่างปิด: สวิตช์หลักปิดกดไม่ได้ + \"เลือกบอร์ดก่อน\" · ปุ่มสร้างบอร์ด \"งานหน้าร้าน\" (ไม่กด) · กรอบประห้องทีมปิดอยู่ (W18) · แถว K3.3/P1.11 อ่านอย่างเดียว" },
  { key: "settings-board-on", page: "settings", devices: P38U_D3, users: ["owner"], note: "บอร์ด fixture posqc-vis-p38u เปิด (ปริยาย + รายสาขานี้ · ขาด/เกิน + ของหมดเปิด) · ห้องทีม posqc-vis-p38u เปิด + โพสต์ปิดกะ + แสดงขาด/เกิน (บรรทัดช่วย W18) · แถวรายสาขา · แถว K3.3/P1.11" },
  { key: "settings-board-readonly", page: "settings", devices: P38U_D3, users: ["cashier"], note: "แคชเชียร์: ค่าตั้งเดียวกับ on แบบอ่านอย่างเดียว (สวิตช์ aria-disabled · ชื่อบอร์ดเฉพาะที่เห็น · ห้อง = ข้อความไม่มีชื่อ) + \"เจ้าของร้านเท่านั้น…\" · ไม่มีตัวเลือก/ปุ่มบันทึก" },
  { key: "settings-board-invalid", page: "settings", devices: P38U_D3, users: ["owner"], note: "บอร์ดเปิด · ห้องทีมปิด (posts ปิด) → กรอกชั่วโมงของหมด 0 → บันทึก → VALIDATION ที่ช่อง board.rules.soldOut.hours (ไม่มีการเขียน)" },
  { key: "settings-board-room-stale", page: "settings", devices: P38U_D3, users: ["owner"], note: "ห้องปริยาย = ห้อง fixture ที่เก็บถาวร posqc-vis-p38u-arch → ตัวเลือกจาง \"ห้องเดิม (ถูกเก็บ…)\" + คำเตือน board.room.stale (ห้องทีมปิด)" },
  { key: "settings-shark-kanban-link", page: "settings", devices: P38U_D3, users: ["owner"], note: "แท็บการเชื่อมต่อ SHARK: การ์ด KANBAN (ภาพ 10) ลิงก์ \"ตั้งค่าบอร์ดงานของหน้าขาย\" → ?tab=board" },
  { key: "reports-anomalies-card-button", page: "reports", devices: P38U_D3, users: ["owner"], note: "แท็บจุดผิดปกติวันนี้ (บอร์ดเปิด): กลุ่ม A11 (fixture 4 แถว) ปุ่ม \"สร้างงานในบอร์ด\" ต่อแถว · แถวที่มีการ์ดแล้ว = ชิป" },
  { key: "reports-anomalies-card-pressed", page: "reports", devices: ["desktop", "mobile"], users: ["owner"], note: "กดปุ่มจริง 1 ครั้งบนแถว A11 ที่ยังไม่มีการ์ด (บอร์ด fixture) → ชิป \"สร้างการ์ด #n แล้ว\" · ไม่มีแถวว่าง = SKIP (กุญแจรายวัน · 1440 + 390 th + 1440 en = 3 แถวว่าง)" },
  { key: "reports-anomalies-card-chip", page: "reports", devices: P38U_D3, users: ["owner"], note: "แถว A11 (สาขานี้ · ผู้อนุมัติเจ้าของ) มีการ์ด fixture แล้ว → ชิป \"การ์ด #n\" ลิงก์ไปการ์ด (ไม่มีชื่อคน)" },
  { key: "reports-ai-panel-board", page: "reports", devices: P38U_D3, users: ["owner"], note: "08 ภาพรวมวันนี้: แผงผู้ช่วย AI (เปิดชั่วคราว) มีจุดผิดปกติ A11 → ปุ่ม \"สร้างงานในบอร์ด\" (ลิงก์ ?kind=anomalies&from=&to=วันนั้น)" },
  { key: "shifts-closed-board-chip", page: "shifts", devices: P38U_D3, users: ["owner"], note: "กะที่ปิดแล้วของสาขา: ชิป \"การ์ด #n\" ของกะปิดล่าสุด (การ์ด fixture pos-shift:<id> บนบอร์ด fixture) · ไม่มีชื่อผู้รับ" },
  { key: "shifts-close-board-hint", page: "shifts", devices: P38U_D3, users: ["owner"], note: "กะเปิดของเครื่อง posqc-vis-p38u-shift: การ์ดปิดกะมีกรอบ \"เมื่อปิดกะ\" — สรุปกะเข้าห้องทีม + การ์ดตรวจเงินเมื่อขาด/เกิน ≥ ฿100 (ไม่กดปิดกะ)" },
];
const p38uOn = STATES_ON && tenantKey === "coffee" && P38U_WO;
const P38U_KEYS: ReadonlySet<string> = new Set(P38U_PLAN.map((s) => s.key));
const isP38uState = (k: StateKey | null | undefined): k is P38uKey => !!k && P38U_KEYS.has(k);
const p38uDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
// ชื่อ fixture (ใช้ในบรรทัด --dry ด้วย — ประกาศก่อน) · บอร์ด/ห้อง/เครื่องเก็บไว้ข้ามรอบ
const P38U_BOARD_NAME = "posqc-vis-p38u";
const P38U_ROOM_NAME = "posqc-vis-p38u";
const P38U_ROOM_ARCH_NAME = "posqc-vis-p38u-arch";
const P38U_SHIFT_DEV = "posqc-vis-p38u-shift";
const P38U_REASON = "ภาพ QC P3.8U";
const P38U_KANBAN_SYS_NAME = "บอร์ดงาน (ภาพ QC P3.8U)"; // POS P3.8U ▸ fix1: ระบบของภาพเมื่อร้าน QC ไม่มีระบบที่เปิดอยู่ (เก็บไว้) ◂
const P38U_MEETING_SYS_NAME = "ห้องทีม (ภาพ QC P3.8U)";
const p38uPath = (k: P38uKey): string => {
  const u = encodeURIComponent(unitId);
  const d = p38uDay();
  if (k === "settings-shark-kanban-link") return `/app/sys/${SYS}/pos/settings?tab=shark&unit=${u}`;
  if (k.startsWith("settings-")) return `/app/sys/${SYS}/pos/settings?tab=board&unit=${u}`;
  if (k === "reports-ai-panel-board") return `/app/sys/${SYS}/pos/reports?kind=overview&from=${d}&to=${d}`;
  if (k.startsWith("reports-")) return `/app/sys/${SYS}/pos/reports?kind=anomalies&from=${d}&to=${d}`;
  return `/app/sys/${SYS}/pos/shifts?unit=${u}`;
};
// ◂ POS P3.8U
// ── POS P2.12U ▸ รายงาน 08 + บิล 12 + การ์ดเกณฑ์ (มติ 8 · wo p2.12u · --states · 3 ขนาด · หน้าพิมพ์ 1440 + สื่อ print · th + LOCALE=en · owner + cashier) ◂
type P212uKey = "reports-hourly" | "reports-branches-tab" | "reports-anomalies" | "reports-anomalies-empty" | "reports-staff-flag" | "reports-pdf-button" | "reports-print-overview" | "reports-print-channels" | "settings-general-anomaly" | "bills-all-branches" | "bills-drawer-channel-refund";
const P212U_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
/** หน้าพิมพ์ (กว้าง A4 ใน iframe · ถ่ายด้วยสื่อ print) */
const P212U_PRINT: ReadonlySet<string> = new Set(["reports-print-overview", "reports-print-channels"]);
const P212U_PLAN: { key: P212uKey; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "reports-hourly", page: "reports", devices: P212U_D3, users: ["owner"], note: "08 ภาพรวมวันนี้ สาขาสีลม: การ์ด \"ยอดขายรายชั่วโมง\" 24 ชั่วโมง · แท่งดำ ช่วงขายดี (บิล fixture 09:xx) · แท่งสีเน้น + ป้าย ชั่วโมงนี้ · กล่องเส้นประ คาดการณ์ (บิล fixture 4 สัปดาห์ก่อน) · หมายเหตุคาดการณ์" },
  { key: "reports-branches-tab", page: "reports", devices: P212U_D3, users: ["owner"], note: "แท็บ \"เปรียบเทียบสาขา\" 7 วันล่าสุด ทุกสาขา: แถวสีลม + อารีย์ (บิล fixture) + แถวรวมทุกสาขา (tfoot) · 390 เลื่อนในการ์ด" },
  { key: "reports-anomalies", page: "reports", devices: P212U_D3, users: ["owner", "cashier"], note: "แท็บ \"จุดผิดปกติของพนักงาน\" วันนี้: กลุ่มกฎ ≥ 3 กลุ่ม (A1 ยกเลิก 2 บิล · A2 คืนเงิน 1 ใบ · A4 ส่วนลดบิล 40% · เกณฑ์ลดชั่วคราว) · แคชเชียร์ (ไม่มี pos.report.view) = การ์ดปฏิเสธของหน้า" },
  { key: "reports-anomalies-empty", page: "reports", devices: P212U_D3, users: ["owner"], note: "แท็บจุดผิดปกติ วันที่ 2024-01-02 (ไม่มีข้อมูล) = \"ไม่พบจุดผิดปกติในช่วงนี้\"" },
  { key: "reports-staff-flag", page: "reports", devices: P212U_D3, users: ["owner"], note: "ภาพรวมวันนี้ สาขาสีลม: การ์ดพนักงาน ป้าย \"ส่วนลดสูงผิดปกติ\" จากกฎ A3 ของระบบ (fixture ลดเกณฑ์ A3 เป็น 0.1% ชั่วคราว)" },
  { key: "reports-pdf-button", page: "reports", devices: P212U_D3, users: ["owner"], note: "แท็บช่องทางการขาย วันนี้: ปุ่ม \"พิมพ์ / PDF\" ข้าง \"ส่งออก CSV\" (ลิงก์หน้าพิมพ์ในแท็บใหม่ · ไม่กด)" },
  { key: "reports-print-overview", page: "reports", devices: ["desktop"], users: ["owner"], note: "หน้าพิมพ์ kind=overview วันนี้ สาขาสีลม (?noprint=1) — เอกสารสรุปหลายส่วน (รายวัน · รายชั่วโมง · ช่องทาง · วิธีชำระ · พนักงาน) ใน iframe A4 · สื่อ print" },
  { key: "reports-print-channels", page: "reports", devices: ["desktop"], users: ["owner"], note: "หน้าพิมพ์ kind=channels วันนี้ ทุกสาขา (?noprint=1) — ตารางช่องทาง A4 · สื่อ print" },
  { key: "settings-general-anomaly", page: "settings", devices: P212U_D3, users: ["owner"], note: "แท็บทั่วไป → การ์ด \"รายงาน: จุดสังเกตผิดปกติ\" (สวิตช์ + แถวกฎ A1–A10 · ค่าที่ fixture ลดไว้) — ไม่กดบันทึก" },
  { key: "bills-all-branches", page: "sales", devices: P212U_D3, users: ["owner", "cashier"], note: "12 ?unit=* (เจ้าของ): \"ทุกสาขา\" · ชิปชื่อสาขาข้างเลขบิล (สีลม + อารีย์) · ชิปจำนวนบิลต่อช่องทาง · หมายเหตุวันปฏิทิน · แคชเชียร์ (สาขาเดียว) = ไม่มีตัวเลือกทุกสาขา/ชิป" },
  { key: "bills-drawer-channel-refund", page: "sales", devices: P212U_D3, users: ["owner", "cashier"], note: "ลิ้นชักบิล LINE MAN ที่คืนเงินบางส่วน (?bill=): บล็อกช่องทาง + บรรทัดหลังคืนเงิน (เจ้าของ · pos.report.view) · แคชเชียร์ = ไม่มีบรรทัดตัวเลขค่าคอมฯ/หลังคืน" },
];
const p212uOn = STATES_ON && tenantKey === "coffee" && P212U_WO;
const P212U_KEYS: ReadonlySet<string> = new Set(P212U_PLAN.map((s) => s.key));
const isP212uState = (k: StateKey | null | undefined): k is P212uKey => !!k && P212U_KEYS.has(k);
/** วันนี้ตามเวลาไทย (ฟังก์ชันของบล็อกนี้ — bkkToday ของไฟล์ประกาศทีหลัง) · วันไม่มีข้อมูลของภาพว่าง */
const p212uDay = (shift = 0) => new Date(Date.now() + 7 * 3_600_000 + shift * 86_400_000).toISOString().slice(0, 10);
const P212U_EMPTY_DATE = "2024-01-02";
const p212uPath = (k: P212uKey): string => {
  const d = p212uDay();
  const u = encodeURIComponent(unitId);
  const rep = (q: string) => `/app/sys/${SYS}/pos/reports?${q}`;
  const prn = (q: string) => `/app/sys/${SYS}/pos/reports/print?${q}&locale=${LOCALE_EN ? "en" : "th"}&noprint=1`;
  switch (k) {
    case "reports-hourly":
    case "reports-staff-flag":
      return rep(`kind=overview&from=${d}&to=${d}&unit=${u}`);
    case "reports-branches-tab":
      return rep(`kind=branches&from=${p212uDay(-6)}&to=${d}`);
    case "reports-anomalies":
      return rep(`kind=anomalies&from=${d}&to=${d}`);
    case "reports-anomalies-empty":
      return rep(`kind=anomalies&from=${P212U_EMPTY_DATE}&to=${P212U_EMPTY_DATE}`);
    case "reports-pdf-button":
      return rep(`kind=channels&from=${d}&to=${d}&unit=${u}`);
    case "reports-print-overview":
      return prn(`kind=overview&from=${d}&to=${d}&unit=${u}`);
    case "reports-print-channels":
      return prn(`kind=channels&from=${d}&to=${d}`);
    case "settings-general-anomaly":
      return `/app/sys/${SYS}/pos/settings?tab=general&unit=${u}`;
    case "bills-all-branches":
      return `/app/sys/${SYS}/pos/sales?unit=*`;
    case "bills-drawer-channel-refund":
      return `/app/sys/${SYS}/pos/sales?unit=${u}&bill=<p212u-lineman-refunded>`; // id จริงเติมตอน fixture (ensureP212uFixture)
  }
};
// ◂
// ── POS P2.7U ▸ QR สั่ง / สั่งล่วงหน้าจ่ายก่อน (มติ 15 · wo p2.7 · --states · เจ้าของร้าน · ไม่ส่ง --page = qr-public + orders + tables + settings) ◂
//   qr-public (หน้าสาธารณะ /q/** · ไม่อ่าน session) = 390 + 1024 ทั้ง th และ LOCALE=en (?lang=en) · หน้าพนักงาน 3 ขนาด (en = 1440)
//   path ที่มีโทเคน = ตัวยึด <p27:…> เติมจริงตอน fixture (p27Path) · fixture/เก็บกวาดใน ensureP27Fixture/prepP27/cleanupP27
type P27Key =
  | "table-menu" | "table-cart" | "table-sent" | "table-rounds" | "table-bill" | "table-notified" | "table-payhidden" | "table-closed" | "table-bad-token"
  | "pre-menu" | "pre-cart" | "pre-checkout" | "pre-pay" | "pre-claimed" | "pre-paid" | "pre-accepted" | "pre-ready" | "pre-expired" | "pre-rejected" | "pre-closed"
  | "pre-pay-beam" | "pre-preparing" | "pre-handed" | "pre-cancelled" | "pre-bad-link" | "pre-bad-order" // POS P2.7U fix1 ▸ F5 ◂
  | "orders-qr-rows" | "orders-awaiting" | "orders-prepaid" | "orders-claim" | "orders-late-banner"
  | "tables-qr-dialog" | "tables-qr-print"
  | "settings-channel-qr-table" | "settings-channel-qr-order"
  | "settings-channel-qr-order-link"; // POS P2.7U fix3 ▸ ภาพที่สองของลิ้นชัก QR_ORDER = บล็อกลิงก์สั่งล่วงหน้า ◂
const P27_PUB: readonly Device[] = ["mobile", "ipad"];
const P27_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P27_PLAN: { key: P27Key; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "table-menu", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/t/<โต๊ะ Q1 ว่าง>: หัวร้าน (แหล่งหัวใบเสร็จ) + ป้ายโต๊ะ · ชิปหมวด · เมนูราคา QR_TABLE · หมด = เทา" },
  { key: "table-cart", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "แตะ + อเมริกาโน่ ×2 + ลาเต้ (ตัวเลือก = เลือกตัวแรกของกลุ่ม) → ตะกร้า (390 = แผ่นล่าง · 1024 = คอลัมน์ขวา) ยอดจาก quoteTableCartAction" },
  { key: "table-sent", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "⚠️ ตะกร้าแบบ table-cart → ส่งเข้าครัว (รอบแขกจริงบนโต๊ะ Q1 · ลบพร้อมโซนตอนเก็บกวาด) → แบนเนอร์ส่งแล้ว + แท็บสั่งแล้ว" },
  { key: "table-rounds", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/t/<Q2>: รอบแขก 2 รอบ · สถานะครัวต่อรายการ กำลังทำ / พร้อมเสิร์ฟ / เสิร์ฟแล้ว · ครัวทำเสร็จ d/t · ปุ่มเรียกพนักงาน/ขอเช็คบิล" },
  { key: "table-bill", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "Q2 แท็บบิล: รายการ + ค่าบริการ POS + ยอดรวม (= บิลโต๊ะของหน้าขาย) + QR พร้อมเพย์ของยอดนั้น + ปุ่มโอนแล้ว แจ้งร้าน" },
  { key: "table-notified", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "⚠️ Q2 แท็บบิล → แตะโอนแล้ว แจ้งร้าน (คำขอ PAY_PROMPTPAY จริง · ลบพร้อมโซน) → \"แจ้งร้านแล้ว\"" },
  { key: "table-payhidden", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/t/<Q3 แยกบิล EQUAL 2>: แท็บบิล → \"โต๊ะนี้แยกบิลอยู่ — ชำระที่แคชเชียร์\" (ไม่มี QR)" },
  { key: "table-closed", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "QR_TABLE พักรับ 30 นาที (setChannelOrderSettings · คืนค่าหลังภาพ) → แบนเนอร์ CHANNEL_PAUSED + เมนูอ่านอย่างเดียว" },
  { key: "table-bad-token", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/t/<โทเคนรูปถูกแต่ไม่มี> → การ์ด \"QR นี้ใช้ไม่ได้แล้ว\" (HTTP 200 · ไม่มีช่องรู้ว่ามีอยู่)" },
  { key: "pre-menu", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/<ลิงก์สั่งล่วงหน้าของสาขา>: รับเองที่ร้าน · เตรียมประมาณ N นาที · เมนูราคา QR_ORDER" },
  { key: "pre-cart", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "แตะ + 3 ชิ้น → ตะกร้า (quotePreorderCartAction · ไม่มีค่าบริการ)" },
  { key: "pre-checkout", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "ตะกร้า → ข้อมูลผู้รับ: ชื่อ คุณภาพ (ภาพ QC) + เบอร์ 081-234-5678 + บรรทัด PDPA + ยอดที่ต้องจ่าย (ไม่กดสั่ง)" },
  { key: "pre-pay", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "/q/o/<ออเดอร์รอจ่าย>: ยอด + QR พร้อมเพย์ของใบขอรับเงินเดียวกัน + นับถอยหลังถึง payBy + ปุ่มโอนแล้ว (QR นิ่ง)" },
  { key: "pre-claimed", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "ออเดอร์ที่กดโอนแล้ว (claimPaid) → \"แจ้งร้านแล้ว — รอร้านตรวจยอด\"" },
  { key: "pre-pay-beam", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · ออเดอร์ที่จ่ายผ่าน Beam (fixture: เปิด beam ชั่วคราว + Beam ปลอมของสคริปต์ · ไม่เรียกภายนอก · คืนค่าทันที) → QR ของ Beam + \"ระบบยืนยันให้อัตโนมัติเมื่อเงินเข้า\" (pos-qr-order-auto · ไม่มีปุ่มโอนแล้ว)" },
  { key: "pre-paid", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "ใบขอรับเงินยืนยันเอง (เจ้าของ) → PREPAID → \"ได้รับเงินแล้ว — รอร้านรับออเดอร์\" · ขั้น 2/4" },
  { key: "pre-accepted", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "⚠️ PREPAID → acceptOrder (บิลพร้อมเพย์จริง · ไม่ลบ แบบ P2.8U) → \"ร้านรับออเดอร์แล้ว\" + พร้อมรับประมาณ hh:mm + ลิงก์ใบเสร็จ" },
  { key: "pre-preparing", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · ⚠️ รับแล้ว → เริ่มเตรียม (บิลจริง · ไม่ลบ) → \"กำลังเตรียม\" + พร้อมรับประมาณ hh:mm · ขั้น 3/4" },
  { key: "pre-ready", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "⚠️ รับแล้ว → เตรียม → พร้อม → \"พร้อมรับแล้ว\" + รหัสตัวใหญ่ + ลิงก์ใบเสร็จ" },
  { key: "pre-handed", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · ⚠️ รับ → เตรียม → พร้อม → ส่งมอบ (บิลจริง · ไม่ลบ) → \"รับของแล้ว ขอบคุณค่ะ\" + ลิงก์ใบเสร็จ · หยุดโพล" },
  { key: "pre-cancelled", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · ⚠️ รับแล้ว → cancelOrder (ร้านยกเลิก · บิลถูก void · ไม่ลบ) → \"ออเดอร์ถูกยกเลิก\" + ร้านคืนเงินให้ภายหลัง" },
  { key: "pre-expired", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "payBy เลื่อนเป็นอดีต + อ่านสถานะ (ปิดครั้งเดียว) → 19ค: PromptPay ยังไม่ได้รับเงิน · ลองใหม่ · เลือกวิธีอื่น · ยืนยันเอง" },
  { key: "pre-rejected", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "PREPAID → rejectOrder → \"ร้านไม่สามารถรับออเดอร์นี้ได้\" + ร้านคืนเงินให้ภายหลัง" },
  { key: "pre-closed", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "QR_ORDER พักรับ 30 นาที (คืนค่าหลังภาพ) → แบนเนอร์ + เมนูอ่านอย่างเดียว" },
  { key: "pre-bad-link", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · /q/<ลิงก์รูปถูกแต่ไม่มี 16 ตัว> → การ์ด \"QR นี้ใช้ไม่ได้แล้ว\" (HTTP 200)" },
  { key: "pre-bad-order", page: "qr-public", devices: P27_PUB, users: ["owner"], note: "POS P2.7U fix1 F5 · /q/o/<โทเคนออเดอร์รูปถูกแต่ไม่มี 12 ตัว> → การ์ดเดียวกัน (HTTP 200)" },
  { key: "orders-qr-rows", page: "orders", devices: P27_D3, users: ["owner"], note: "09: ราง \"หน้าร้าน QR N\" (≥1024 แตะแถว · 390 เลือกในตัวเลือกช่องทาง) → การ์ดรอบ QR โต๊ะ \"QR โต๊ะ Q2 · #n · ครัวกำลังทำ d/t · เก็บเงินรวมกับบิลโต๊ะ\"" },
  { key: "orders-awaiting", page: "orders", devices: P27_D3, users: ["owner"], note: "09 ทุกช่องทาง: รายการย่อย \"รอชำระ N\" ใต้หัวคอลัมน์ใหม่ (นับถอยหลังหมดเวลาจ่าย · ยกเลิก) — ไม่นับในคอลัมน์ใหม่" },
  { key: "orders-prepaid", page: "orders", devices: P27_D3, users: ["owner"], note: "09: การ์ดใหม่ของออเดอร์ PREPAID + ชิป \"จ่ายแล้ว · พร้อมเพย์ ฿x\" → แตะ = แผง (เมื่อกดรับ = เปิดบิลพร้อมเพย์จากเงินที่จ่ายแล้ว)" },
  { key: "orders-claim", page: "orders", devices: P27_D3, users: ["owner"], note: "09: แถวรอชำระที่ลูกค้าแจ้งโอน → ชิป \"ลูกค้าแจ้งโอนแล้ว · ตรวจยอด\" + ยืนยันรับเงิน → แตะแถว = แผง (ไม่กดยืนยัน)" },
  { key: "orders-late-banner", page: "orders", devices: P27_D3, users: ["owner"], note: "09: แบนเนอร์ \"เงินเข้าหลังหมดเวลา ฿x · ref pi_…\" (ออเดอร์ที่จ่ายหลัง payBy → ปิด + late_payment) + แบนเนอร์หมดเวลาจ่ายวันนี้" },
  { key: "tables-qr-dialog", page: "tables", devices: P27_D3, users: ["owner"], note: "03: เปิดโต๊ะ Q2 (?open=) → QR ของโต๊ะ → กล่อง: ภาพ QR + ลิงก์ /q/t/… + คัดลอก + พิมพ์ + เปลี่ยน QR (ไม่กด)" },
  { key: "tables-qr-print", page: "tables", devices: P27_D3, users: ["owner"], note: "03: พิมพ์ QR ทุกโต๊ะ → แผ่น A4 3 คอลัมน์ (ชื่อร้าน + โต๊ะ + QR ต่อช่อง) — ไม่กดพิมพ์" },
  { key: "settings-channel-qr-table", page: "settings", devices: P27_D3, users: ["owner"], note: "ช่องทาง → QR โต๊ะ → ลิ้นชัก: เปิดรับ · พักรับ · ลิงก์พิมพ์ QR โต๊ะ · เมนูตามราคาช่องทาง" },
  { key: "settings-channel-qr-order", page: "settings", devices: P27_D3, users: ["owner"], note: "ช่องทาง → สั่งออนไลน์ (QR) → ลิ้นชัก (fix3: เลื่อนกล่องเลื่อนของลิ้นชักไปที่บล็อก QR): เปิดรับ · รับอัตโนมัติ · เวลาเตรียม · พักรับ" },
  { key: "settings-channel-qr-order-link", page: "settings", devices: P27_D3, users: ["owner"], note: "POS P2.7U fix3 · ลิ้นชักเดียวกัน เลื่อนถึงบล็อกลิงก์สั่งล่วงหน้า: ภาพ QR (รอวาดเสร็จ) + ลิงก์ + คัดลอก + เปลี่ยนลิงก์ (ไม่กด)" },
];
const p27On = STATES_ON && tenantKey === "coffee" && P27_WO;
const P27_KEYS: ReadonlySet<string> = new Set(P27_PLAN.map((s) => s.key));
const isP27State = (k: StateKey | null | undefined): k is P27Key => !!k && P27_KEYS.has(k);
/** โทเคนรูปถูกที่ไม่มีจริง (โต๊ะ) */
const P27_BAD_TABLE_TOKEN = "posqcvisp27nosuchtable0";
// POS P2.7U fix1 ▸ F5: ลิงก์/ออเดอร์รูปถูก (Crockford ตัวใหญ่) ที่ไม่มีจริง ◂
const P27_BAD_LINK_TOKEN = "ZZZZZZZZZZZZZZZZ";
const P27_BAD_ORDER_TOKEN = "ZZZZZZZZZZZY";
const p27Lang = (sep: "?" | "&") => (LOCALE_EN ? `${sep}lang=en` : "");
/** โทเคน/ไอดีของ fixture (เติมตอน ensureP27Fixture · แผนใช้ตัวยึดก่อนนั้น) */
type P27Fixture = {
  tables: Partial<Record<"q1" | "q2" | "q3", { tableId: string; name: string; qrToken: string; sessionId: string | null }>>;
  orders: Record<string, { id: string; token: string; code: string; intentId: string | null }>;
  linkToken: string | null;
};
const P27S: { fx: P27Fixture | null } = { fx: null };
const p27Fx = () => P27S.fx;
/** path ของสถานะ (ตัวยึดในแผน · ค่าจริงหลัง fixture — P27 ประกาศทีหลังในไฟล์ จึงอ่านผ่านฟังก์ชัน) */
function p27Path(k: P27Key): string {
  const F = p27Fx();
  const u = encodeURIComponent(unitId);
  const tq = (n: "q1" | "q2" | "q3") => `/q/t/${F?.tables[n]?.qrToken ?? `<p27:${n}>`}${p27Lang("?")}`;
  const order = (n: string) => `/q/o/${F?.orders[n]?.token ?? `<p27:${n}>`}${p27Lang("?")}`;
  const link = `/q/${F?.linkToken ?? "<p27:link>"}${p27Lang("?")}`;
  switch (k) {
    case "table-menu":
    case "table-cart":
    case "table-sent":
    case "table-closed":
      return tq("q1");
    case "table-rounds":
    case "table-bill":
    case "table-notified":
      return tq("q2");
    case "table-payhidden":
      return tq("q3");
    case "table-bad-token":
      return `/q/t/${P27_BAD_TABLE_TOKEN}${p27Lang("?")}`;
    case "pre-menu":
    case "pre-cart":
    case "pre-checkout":
    case "pre-closed":
      return link;
    case "pre-pay":
      return order("pay");
    case "pre-claimed":
      return order("claimed");
    case "pre-paid":
      return order("paid");
    case "pre-accepted":
      return order("accepted");
    // POS P2.7U fix1 ▸ F5 ◂
    case "pre-pay-beam":
      return order("beam");
    case "pre-preparing":
      return order("preparing");
    case "pre-handed":
      return order("handed");
    case "pre-cancelled":
      return order("cancelled");
    case "pre-bad-link":
      return `/q/${P27_BAD_LINK_TOKEN}${p27Lang("?")}`;
    case "pre-bad-order":
      return `/q/o/${P27_BAD_ORDER_TOKEN}${p27Lang("?")}`;
    case "pre-ready":
      return order("ready");
    case "pre-expired":
      return order("expired");
    case "pre-rejected":
      return order("rejected");
    case "tables-qr-dialog":
      return `/app/sys/${SYS}/pos/tables?unit=${u}&open=${encodeURIComponent(F?.tables.q2?.sessionId ?? "<p27:q2-session>")}`;
    case "tables-qr-print":
      return `/app/sys/${SYS}/pos/tables?unit=${u}`;
    case "settings-channel-qr-table":
    case "settings-channel-qr-order":
    case "settings-channel-qr-order-link": // POS P2.7U fix3 ◂
      return `/app/sys/${SYS}/pos/settings?tab=channels&unit=${u}`;
    default:
      return `/app/sys/${SYS}/pos/orders?unit=${u}`;
  }
}
// ◂
// ── POS P2.13 ▸ การ์ดคีย์ API (U-lite §7 · wo p2.13 · --states · 3 ขนาด · th + LOCALE=en · owner + manager) ◂
//   ลำดับสำคัญ: empty ก่อนรอบนี้สร้างคีย์ใด ๆ · create = กรอกกล่องไม่ส่ง · raw = ส่งจริง (คีย์ของรอบ 1 ใบ) · list/revoke = + คีย์ fixture 2 ใบ · developers-pos ท้ายสุด
type P213Key = "settings-shark-api-keys-empty" | "settings-shark-api-keys-create" | "settings-shark-api-keys-raw" | "settings-shark-api-keys-list" | "settings-shark-api-keys-revoke" | "developers-pos";
const P213_D3: readonly Device[] = ["desktop", "ipad", "mobile"];
const P213_PLAN: { key: P213Key; page: PosPage; devices: readonly Device[]; users: readonly UserKey[]; note: string }[] = [
  { key: "settings-shark-api-keys-empty", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "แท็บ shark → การ์ด \"คีย์ API ของระบบขายหน้าร้าน\" ว่าง: คำอธิบาย + ลิงก์คู่มือ /developers/pos + ปุ่มสร้างคีย์ (ระบบ POS ร้าน QC ต้องไม่มีคีย์เลย — มี = ภาพตกพร้อมจำนวน)" },
  { key: "settings-shark-api-keys-create", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "สร้างคีย์ → กล่อง: ชื่อ \"แอปสั่งอาหารของร้าน (QC <pid>)\" · ชุด ใช้งานหน้าร้าน · อายุ 90 วัน · เลือกสาขาสีลม (ผู้จัดการ = บังคับเลือก) — ไม่กดสร้าง" },
  { key: "settings-shark-api-keys-raw", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "⚠️ กรอกแบบ create (เจ้าของ = ทุกสาขา) → สร้างคีย์จริงผ่าน UI → แผงคีย์ดิบครั้งเดียว + คำเตือน + คัดลอก (ไม่กด) · คีย์ของรอบจากภาพก่อนหน้าถูกลบก่อนเปิดหน้า" },
  { key: "settings-shark-api-keys-list", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "รายการ: คีย์ของภาพ raw + fixture \"จอสรุปยอดหลังร้าน\" (อ่านอย่างเดียว · สีลม · ใช้ล่าสุด 3 ชม.ก่อน · หมดอายุ 30 วัน) + \"ระบบสั่งของเดิม\" (ผู้ดูแล · เพิกถอนแล้ว · ไม่หมดอายุ)" },
  { key: "settings-shark-api-keys-revoke", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "แตะ \"เพิกถอน\" ของคีย์ที่ยังใช้ได้ล่าสุดของรอบ → กล่องยืนยันปุ่มแดง — ไม่กดยืนยัน" },
  { key: "developers-pos", page: "settings", devices: P213_D3, users: ["owner", "manager"], note: "หน้าสาธารณะ /developers/pos (ไม่ส่งคุกกี้ session · LOCALE=en ส่งคุกกี้ภาษาอย่างเดียว) → HTTP 200 + [data-testid=developers-pos] · ไม่มี console error" },
];
const p213On = STATES_ON && tenantKey === "coffee" && P213_WO;
const P213_KEYS: ReadonlySet<string> = new Set(P213_PLAN.map((s) => s.key));
const isP213State = (k: StateKey | null | undefined): k is P213Key => !!k && P213_KEYS.has(k);
const p213Path = (k: P213Key): string => (k === "developers-pos" ? "/developers/pos" : `/app/sys/${SYS}/pos/settings?tab=shark&unit=${encodeURIComponent(unitId)}`);
/** ชื่อคีย์ของรอบ — ลงท้าย "(QC <pid>)" (เก็บกวาดหาตามนี้ · ซากของ pid ที่ตายแล้วกวาดก่อนงานแรก) · ≤ 60 ตัวอักษร */
const p213Name = (label: string) => `${label} (QC ${process.pid})`;
const P213_NAME_RE = /\(QC (\d+)\)$/;
const P213_UI_LABEL = "แอปสั่งอาหารของร้าน";
// ◂
const p29uPath = (k: P29uRegKey | P29uOtherKey): string =>
  k === "refund-to-card" ? `/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}` : k === "settings-tip-ledger" ? `/app/sys/${SYS}/pos/settings?tab=payments&unit=${encodeURIComponent(unitId)}` : pathOf("register");
// POS P2.9bU ◂
const p29buPath = (k: P29buKey): string =>
  k === "bills-deposit-filter" || k === "refund-deposit"
    ? `/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}`
    : k === "settings-deposit-toggle"
      ? `/app/sys/${SYS}/pos/settings?tab=payments&unit=${encodeURIComponent(unitId)}`
      : pathOf("register");
const productsPath = (k: P22uProductsKey) => `/app/sys/${SYS}/pos/products${P22U_PRODUCTS_PLAN.find((p) => p.key === k)?.rules ? "/price-rules" : ""}?unit=${encodeURIComponent(unitId)}`;
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
type Job = { page: PosPage; v: (typeof POS_VIEWPORTS)[number] | (typeof POS_DISPLAY_VIEWPORTS)[number] /* POS P2.10 */; state: StateKey | null; file: string; path?: string; expect?: number };
// POS P1.18U ▸ fixture ของภาพ 19ก (ร้านไม่มีสินค้า) — path จริงรู้หลังหา/สร้างระบบ (emptyPath) ◂
// POS P1.18U ▸ แก้รอบ 1 F7: id สาขา/รหัสเครื่องผูก pid (`posqc-vis-empty-<pid>`) — รอบ th/en ที่รันพร้อมกันไม่ลบแถวของกันและกัน ·
//   ระบบ POS หาโดยลิงก์ของสาขารอบนี้ (ไม่หาด้วยชื่อ) · ซากรอบที่ถูก kill เกิน 1 ชม. ถูกกวาดตอนสร้าง ◂
const EMPTY_PREFIX = "posqc-vis-empty-";
const EMPTY_UNIT = { id: `${EMPTY_PREFIX}${process.pid}`, slug: `pos-qc-vis-empty-${process.pid}`, name: "สาขาแคตตาล็อกว่าง (ภาพ QC)" } as const;
const EMPTY_POS_NAME = "ขายหน้าร้าน · แคตตาล็อกว่าง (ภาพ QC)";
const EMPTY_DEVICE_ID = `${EMPTY_PREFIX}${process.pid}`;
const EMPTY_PATH_PLACEHOLDER = `/app/sys/<empty-pos>/pos/register?unit=${EMPTY_UNIT.id}`;
const EN_MOBILE_PAGES = new Set<string>(["register", "sales", "receipt-public", "display", "qr-public"]); const viewports = LOCALE_EN ? POS_VIEWPORTS.filter((v) => v.name === "desktop" || (v.name === "mobile" && pages.some((x) => EN_MOBILE_PAGES.has(x)))) : [...POS_VIEWPORTS]; // POS P2.14 ▸ มติ 6 (V1): LOCALE=en = 1440 ทุกหน้า + 390 ของหน้าขาย/จอชำระ/บิล/หน้าสาธารณะ (EN_MOBILE_PAGES · แบบ KDS G3b · หน้าอื่นตัด 390 ที่ jobsPlanned) ◂
// สถานะหน้าสต็อกเฉพาะ --page stock หรือ wo p1.14* (รอบ p1.3/p1.2 --states ทุกหน้าเดิมไม่เปลี่ยน · ไม่เปิดรอบนับเพิ่ม)
const stockStatesOn = STATES_ON && tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && (onlyPage === "stock" || /^p1\.14/i.test(WO));
// สถานะหน้ากะเฉพาะ --page shifts หรือ wo p1.9* (รอบ --states ทุกหน้าเดิมไม่เปิดกะ/ไม่ขายเพิ่ม)
const shiftsStatesOn = STATES_ON && tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && !P35U_WO /* POS P3.5U */ && !P34U_WO /* POS P3.4U */ && (onlyPage === "shifts" || /^p1\.9/i.test(WO));
// สถานะหน้าบิลวันนี้เฉพาะ --page sales หรือ wo p1.16* (รอบ --states ทุกหน้าเดิมไม่สร้างบิลเพิ่ม)
const billsStatesOn = STATES_ON && tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && !P212U_WO /* POS P2.12U */ && !P36U_WO /* POS P3.6U */ && !P3SKU_WO /* POS P3-SKEL U */ && (onlyPage === "sales" || /^p1\.16/i.test(WO));
// สถานะหน้าตั้งค่าเฉพาะ --page settings หรือ wo p1.10u* (รอบ --states ทุกหน้าเดิมไม่ลงทะเบียนเครื่อง/ไม่ขายเพิ่ม)
const settingsStatesOn = STATES_ON && tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && !P212U_WO /* POS P2.12U */ && !P213_WO /* POS P2.13 */ && !P35U_WO /* POS P3.5U */ && !P34U_WO /* POS P3.4U */ && !P39U_WO /* POS P3.9U */ && !P37U_WO /* POS P3.7U */ && !P36U_WO /* POS P3.6U */ && !P3SKU_WO /* POS P3-SKEL U */ && (onlyPage === "settings" || /^p1\.10u/i.test(WO) || /^p1\.?18u/i.test(WO));
const settingsPath = (st: SettingsStateKey) =>
  isPaydoneState(st)
    ? `/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(unitId)}`
    : isP118uSettings(st)
    ? `/app/sys/${SYS}/pos/settings?tab=${P118U_SETTINGS_TAB[st]}&unit=${encodeURIComponent(unitId)}`
    : `/app/sys/${SYS}/pos/settings?tab=${st === "settings-receipt" ? "receipt" : st === "settings-payments" ? "payments" : "devices"}&unit=${encodeURIComponent(unitId)}`;
const billsPath = (st: BillsStateKey) => `/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}${st === "bills-empty" ? `&date=${BILLS_EMPTY_DATE}` : ""}`;
// POS P1.11U ▸ หน้าใบเสร็จออนไลน์: ร้าน coffee เท่านั้น (ร้านอื่น = ข้ามหน้า) · LOCALE=en ⇒ ?lang=en · path จริงรู้หลังสร้างบิล (rpubPath) ◂
// POS HF-P1CLOSE ▸ มติ O8: 3 ขนาดทั้ง th/en (เดิม 390 เท่านั้น) · rpub-issue-sent คง 390 (RPUB_VIEWPORT · เขียนแถวแจ้งปัญหาจริง) ◂
const RPUB_VIEWPORT = POS_VIEWPORTS.find((v) => v.name === "mobile")!;
const rpubOn = tenantKey === "coffee" && !P211U_WO /* POS P2.11U */ && pages.includes("receipt-public");
const rpubPlan = RPUB_STATE_PLAN.filter((st) => STATES_ON || st.key === "rpub-paid");
const jobsPlanned: Job[] = pages.flatMap((p: PosPage): Job[] =>
  // POS P2.7U ▸ มติ 15: wo p2.7 + --states = สถานะ QR ของหน้านี้ (qr-public = 390 + 1024 ทั้งสองภาษา · หน้าพนักงาน 3 ขนาด · en = 1440) · หน้า qr-public นอก wo นี้ = ไม่มีงาน ◂
  p27On && (P27_PAGES as readonly string[]).includes(p)
    ? P27_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        (p === "qr-public" ? POS_VIEWPORTS.filter((v) => st.devices.includes(v.name)) : viewports.filter((v) => st.devices.includes(v.name))).map(
          (v): Job => ({ page: p, v, state: st.key, path: p27Path(st.key), expect: 200, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` }),
        ),
      )
    : p === "qr-public"
    ? []
    :
  // POS P2.10 ▸ มติ 11: wo p2.10 + --states = สถานะจอลูกค้าของหน้านี้ (display: 1280×800 + 1024×768 · LOCALE=en = 1280 · settings: 3 ขนาด · en = 1440) ◂
  p210On && (p === "display" || p === "settings")
    ? P210_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        (p === "display" ? POS_DISPLAY_VIEWPORTS.filter((v) => st.devices.includes(v.name) && (!LOCALE_EN || v.name === "display")) : viewports.filter((v) => st.devices.includes(v.name))).map(
          (v): Job => ({ page: p, v, state: st.key, path: p210Path(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` }),
        ),
      )
    : p === "display"
    ? (LOCALE_EN ? POS_DISPLAY_VIEWPORTS.filter((v) => v.name === "display") : [...POS_DISPLAY_VIEWPORTS]).map((v): Job => ({ page: p, v, state: null, path: pathOf(p), file: `${OUT}/${p}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })) // POS P2.10 ▸ ไม่มี --states = ฟอร์มจับคู่ ◂
  // POS P2.13 ▸ wo p2.13 + --states = การ์ดคีย์ API ของแท็บ shark + หน้าสาธารณะ /developers/pos (3 ขนาด · en = 1440) ◂
  : p213On && p === "settings"
    ? P213_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p213Path(st.key), ...(st.key === "developers-pos" ? { expect: 200 } : {}), file: `${OUT}/${st.key === "developers-pos" ? st.key : `${p}-${st.key.slice(p.length + 1)}`}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3-SKEL U ▸ CD-SKELU-12: wo p3-skel-u + --states = สถานะโครงแพลตฟอร์มของใบนี้ตามหน้า/ผู้ใช้ (paydone = 1440) ◂
  : p3skuOn
    ? P3SKU_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p3skuPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.6U ▸ wo p3.6u + --states = สถานะลูกค้าองค์กร/วางบิลของใบนี้ตามหน้า/ผู้ใช้ (paydone = 1440) ◂
  : p36uOn
    ? P36U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p36uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.7U ▸ wo p3.7u + --states = สถานะแชทของใบนี้ตามหน้า/ผู้ใช้ (paydone = 1440) ◂
  : p37uOn
    ? P37U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p37uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.8U ▸ CD-P38U-11: wo p3.8u + --states = สถานะบอร์ดงาน/ห้องทีมของใบนี้ตามหน้า/ผู้ใช้ ◂
  : p38uOn
    ? P38U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p38uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.9U ▸ มติ 6: wo p3.9u + --states = สถานะผู้ช่วย AI ของใบนี้ตามหน้า/ผู้ใช้ ◂
  : p39uOn
    ? P39U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p39uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.4U ▸ มติ 11: wo p3.4u + --states = สถานะออฟไลน์ของใบนี้ตามหน้า/ผู้ใช้ ◂
  : p34uOn
    ? P34U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p34uPath(st.key), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P3.5U ▸ มติ 10: wo p3.5u + --states = สถานะ HR ของใบนี้ตามหน้า/ผู้ใช้ ◂
  : p35uOn
    ? P35U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p35uPath(st.key), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P2.12U ▸ มติ 8: wo p2.12u + --states = สถานะของใบนี้ตามหน้า/ผู้ใช้ (หน้าพิมพ์ 1440 เท่านั้น) ◂
  : p212uOn
    ? P212U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p212uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
  // POS P2.11U ▸ มติ 11: wo p2.11u + --states = สถานะหลายสาขาของหน้านี้ตามผู้ใช้ (หน้าอื่น = ไม่มีงาน) ◂
  : p211uOn
    ? P211U_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p211uPath(st.key), file: `${OUT}/${p}-${st.key.startsWith(`${p}-`) ? st.key.slice(p.length + 1) : st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : p === "receipt-public"
    ? rpubOn
      ? rpubPlan.flatMap((st): Job[] =>
          (st.key === "rpub-issue-sent" ? [RPUB_VIEWPORT] : [...POS_VIEWPORTS]).map((v): Job => ({ page: p, v, state: st.key, expect: st.expect, path: `/r/${st.bill === "none" ? RPUB_MISSING_TOKEN : `<token:${st.bill}>`}${LOCALE_EN ? "?lang=en" : ""}`, file: `${OUT}/${p}-${st.key.replace(/^rpub-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
        )
      : []
    // POS P2.9bU ▸ มติ 9: wo p2.9bu หน้าขาย/บิล/ตั้งค่า = สถานะมัดจำอย่างเดียว (ตามผู้ใช้) ◂
    : p29buOn && P29BU_WO && (p === "register" || p === "sales" || p === "settings")
    ? P29BU_PLAN.filter((st) => st.page === p && st.users.includes(userKey)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p29buPath(st.key), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.9U ▸ มติ 10: wo p2.9u หน้าขาย/บิล/ตั้งค่า = สถานะของใบนี้อย่างเดียว ◂
    : p29uOn && P29U_WO && (p === "register" || p === "sales" || p === "settings")
    ? (p === "register" ? P29U_REG_PLAN : P29U_OTHER_PLAN.filter((st) => st.page === p)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: p29uPath(st.key), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.6U ▸ มติ 12: wo p2.6u หน้าตั้งค่า = ฟอร์มใบครัวของเครื่อง (17B) อย่างเดียว ◂
    : p26uOn && P26U_WO && p === "settings"
    ? p26uPlanFor(p).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/settings?tab=devices&unit=${encodeURIComponent(unitId)}`, file: `${OUT}/${p}-${st.key.replace(/^settings-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : settingsStatesOn && p === "settings"
    ? SETTINGS_STATE_PLAN.filter((st) => !(userKey === "owner" ? CASHIER_ONLY_SETTINGS : OWNER_ONLY_SETTINGS).has(st.key)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: settingsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^settings-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.6U ▸ มติ 12: wo p2.6u หน้าสินค้า = ส่วนครัวของลิ้นชัก อย่างเดียว ◂
    : p26uOn && P26U_WO && p === "products"
    ? p26uPlanFor(p).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/products?unit=${encodeURIComponent(unitId)}`, file: `${OUT}/${p}-${st.key.replace(/^products-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : productsStatesOn && p === "products"
    ? [
        ...(/^p2\.?3u/i.test(WO) ? [] : P22U_PRODUCTS_PLAN).filter((st) => (userKey === "owner" ? st.key !== "products-readonly" : st.key === "products-readonly")).flatMap((st): Job[] =>
          viewports
            .filter((v) => st.devices.includes(v.name))
            .map((v): Job => ({ page: p, v, state: st.key, path: productsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^products-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
        ),
        // POS P2.3U ▸ มติ 10: สถานะสูตร/วัตถุดิบ — เจ้าของเท่านั้น (แคชเชียร์ = การ์ดปฏิเสธของหน้า 06) ◂
        ...(/^p2\.?2u/i.test(WO) || userKey !== "owner" ? [] : P23U_PRODUCTS_PLAN).flatMap((st): Job[] =>
          viewports
            .filter((v) => st.devices.includes(v.name))
            .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/products?unit=${encodeURIComponent(unitId)}`, file: `${OUT}/${p}-${st.key.replace(/^products-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
        ),
      ]
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
    // POS P2.5U ▸ มติ 10: wo p2.5u หน้าโต๊ะ = สถานะแยกบิล/ย้าย/รวม/ใบรายการ · หน้าขาย = จอชำระใบแยกบิล (เปิดจากหน้าโต๊ะ) ◂
    : p25uOn && (p === "tables" || p === "register")
    ? (p === "tables" ? P25U_TABLES_PLAN : P25U_REG_PLAN).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: P25U_TABLES_PATH, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.4U ▸ มติ 11: หน้าโต๊ะ (--states) · หน้าขายของ wo p2.4u = สถานะโหมดโต๊ะ/ชิปชนิดบิลเท่านั้น ◂
    : p24uOn && p === "tables"
    ? P24U_TABLES_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/tables?unit=${encodeURIComponent(st.key === "tables-empty" ? P24U_EMPTY_UNIT : unitId)}`, file: `${OUT}/${p}-${st.key.replace(/^tables-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : p24uOn && P24U_WO && p === "register"
    ? P24U_REG_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, ...(st.key === "register-table-mode" ? { path: P24U_REG_TABLE_PLACEHOLDER } : {}), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.6U ▸ มติ 12: จอครัว (--states · ทุก wo) · wo p2.6u หน้าขาย/ออเดอร์ = ไทล์ 86 / มาตรครัว อย่างเดียว ◂
    : p26uOn && p === "kds"
    ? P26U_KDS_PLAN.filter((st) => userKey === "owner" || !P26U_OWNER_ONLY.has(st.key)).flatMap((st): Job[] =>
        (LOCALE_EN ? [...POS_VIEWPORTS] : viewports) // fix2 G3b: จอครัว en ถ่าย 3 ขนาด (รวม 390)
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/kds?unit=${encodeURIComponent(st.key === "kds-empty-unit" ? P26U_EMPTY_UNIT : unitId)}&station=<p26u>`, file: `${OUT}/${p}-${st.key.replace(/^kds-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : p26uOn && P26U_WO && (p === "orders" || p === "register")
    ? p26uPlanFor(p).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    // POS P2.8U ▸ มติ 7: หน้าออเดอร์ (--states) · หน้าขายของ wo p2.8u = ป้ายนับบนแท็บเท่านั้น ◂
    : p28uOn && p === "orders"
    ? P28U_ORDERS_PLAN.filter((st) => userKey === "owner" || !P28U_OWNER_ONLY.has(st.key)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: `/app/sys/${SYS}/pos/orders?unit=${encodeURIComponent(st.key === "orders-empty" ? P28U_EMPTY_UNIT : unitId)}`, file: `${OUT}/${p}-${st.key.replace(/^orders-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : p28uOn && P28U_WO && p === "register"
    ? P28U_REG_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : STATES_ON && p === "register"
    ? STATE_PLAN.filter((st) => userKey === "owner" || !OWNER_ONLY_STATES.has(st.key)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, ...(st.key === "register-empty-catalogue" ? { path: EMPTY_PATH_PLACEHOLDER } : {}), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : viewports.map((v): Job => ({ page: p, v, state: null, file: LOCALE_EN ? fileOf(p, v.w, v.h).replace(/\.png$/, "-en.png") : fileOf(p, v.w, v.h) })),
).filter((j) => !(LOCALE_EN && j.v.name === "mobile" && viewports.some((v) => v.name === "mobile") && !EN_MOBILE_PAGES.has(j.page) && j.page !== "kds")); // POS P2.14 ▸ มติ 6: 390 ภาษาอังกฤษเฉพาะ EN_MOBILE_PAGES (+ kds G3b เดิม) ◂
// POS ผู้คุม 10 ต.ค. ▸ --state a,b,c = ถ่ายเฉพาะสถานะที่ระบุ (ต้องคู่กับ --states) — รอบแก้ถ่ายเฉพาะ state ที่ใบงานแตะ · รอบ merge/ปิดเฟสถ่ายเต็ม
//   คีย์ที่ไม่อยู่ในแผนของหน้า/ผู้ใช้/ภาษานี้ = หยุดพร้อมรายชื่อที่ใช้ได้ (กันพิมพ์ผิดแล้วได้ 0 ภาพเงียบ ๆ) ◂
const onlyStates = flag("--state")?.split(",").map((x) => x.trim()).filter(Boolean) ?? null;
if (onlyStates && !STATES_ON) die("--state ใช้คู่กับ --states เท่านั้น");
if (onlyStates) {
  const known = new Set(jobsPlanned.flatMap((j) => (j.state ? [String(j.state)] : [])));
  const unknown = onlyStates.filter((x) => !known.has(x));
  if (unknown.length) die(`--state ไม่รู้จัก/ไม่อยู่ในแผนของหน้า-ผู้ใช้นี้: ${unknown.join(", ")} — ใช้ได้: ${[...known].join(" · ")}`);
}
const jobs: Job[] = onlyStates ? jobsPlanned.filter((j) => j.state && onlyStates.includes(String(j.state))) : jobsPlanned;
const needFixtures = STATES_ON && tenantKey === "coffee" && jobs.some((j) => j.state && j.page === "register" && !P24U_REG_KEYS.has(j.state) && !P28U_REG_KEYS.has(j.state) && !isP26uState(j.state) && !isP25uState(j.state) && !isP35uState(j.state) /* POS P3.5U */ && !isP37uState(j.state) /* POS P3.7U */ && !isP34uState(j.state) /* POS P3.4U */); // POS P2.6U ▸ ไทล์ 86 ไม่ใช้สินค้าชั่วคราวของ P1.3 ◂ // POS P2.5U ▸ จอชำระใบแยกบิลก็ไม่ใช้ ◂ // POS P2.4U ▸ สถานะโต๊ะไม่ใช้สินค้าชั่วคราวของ P1.3 ◂ · POS P2.8U ▸ ป้ายแท็บก็ไม่ใช้ ◂
if (STATES_ON && tenantKey !== "coffee" && pages.includes("register")) die("สถานะหน้าขาย P1.3 ถ่ายได้เฉพาะ --tenant coffee (มี PromptPay + สินค้าตายตัวที่ขั้นตอนใช้)");
// ◂

// ═══════════════════ POS HF-P1CLOSE ▸ --list: หน้า + id สถานะทั้งหมด (ไม่ต่อ DB · ไม่เปิด chromium) ═══════════════════
if (LIST) {
  const row = (k: string, d: readonly string[] | string, n: string) => console.log(`  · ${k.padEnd(28)} ${(typeof d === "string" ? d : d.join("/")).padEnd(20)} ${n}`);
  console.log(`หน้า (POS_PAGES): ${POS_PAGES.join(" · ")}`);
  console.log("register (--states):");
  for (const st of STATE_PLAN) row(st.key, st.devices, st.note);
  console.log("stock (--page stock --states):");
  for (const st of STOCK_STATE_PLAN) row(st.key, st.devices, st.note);
  console.log("shifts (--page shifts --states):");
  for (const st of SHIFTS_STATE_PLAN) row(st.key, st.devices, st.note);
  console.log("sales (--page sales --states):");
  for (const st of BILLS_STATE_PLAN) row(st.key, st.devices, st.note);
  console.log("settings (--page settings --states):");
  for (const st of SETTINGS_STATE_PLAN) row(st.key, st.devices, st.note);
  console.log("products P2.3U (--page products --states · เจ้าของ):"); // POS P2.3U
  for (const st of P23U_PRODUCTS_PLAN) row(st.key, st.devices, st.note);
  console.log("tables P2.4U (--page tables --states):"); // POS P2.4U
  for (const st of P24U_TABLES_PLAN) row(st.key, st.devices, st.note);
  console.log("register P2.4U (wo p2.4u --page register --states):"); // POS P2.4U
  for (const st of P24U_REG_PLAN) row(st.key, st.devices, st.note);
  console.log("orders P2.8U (--page orders --states):"); // POS P2.8U
  for (const st of P28U_ORDERS_PLAN) row(st.key, st.devices, st.note);
  console.log("register P2.8U (wo p2.8u --page register --states):"); // POS P2.8U
  for (const st of P28U_REG_PLAN) row(st.key, st.devices, st.note);
  console.log("kds P2.6U (--page kds --states):"); // POS P2.6U
  for (const st of P26U_KDS_PLAN) row(st.key, st.devices, `${P26U_OWNER_ONLY.has(st.key) ? "[เจ้าของ] " : ""}${st.note}`);
  console.log("register/orders/products/settings P2.6U (wo p2.6u --page <page> --states):"); // POS P2.6U
  for (const st of P26U_OTHER_PLAN) row(st.key, st.devices, `${st.page} · ${P26U_OWNER_ONLY.has(st.key) ? "[เจ้าของ] " : ""}${st.note}`);
  console.log("register/sales/settings P2.9U (wo p2.9u --page <page> --states):"); // POS P2.9U
  for (const st of P29U_REG_PLAN) row(st.key, st.devices, `register · ${st.note}`);
  for (const st of P29U_OTHER_PLAN) row(st.key, st.devices, `${st.page} · ${st.note}`);
  console.log("register/sales/settings P2.9bU (wo p2.9bu --page <page> --states):"); // POS P2.9bU
  for (const st of P29BU_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("tables/register P2.5U (wo p2.5u --page tables|register --states):"); // POS P2.5U
  for (const st of [...P25U_TABLES_PLAN, ...P25U_REG_PLAN]) row(st.key, st.devices, st.note);
  console.log("products/reports/settings/stock P2.11U (wo p2.11u --states · owner + manager):"); // POS P2.11U
  for (const st of P211U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("settings/display P2.10 (wo p2.10 --states · เจ้าของ):"); // POS P2.10
  for (const st of P210_PLAN) row(st.key, st.devices, `${st.page} · ${st.note}`);
  console.log("reports/sales/settings P2.12U (wo p2.12u --states · owner + cashier):"); // POS P2.12U
  for (const st of P212U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("register/shifts/settings P3.4U (wo p3.4u --states · owner + cashier):"); // POS P3.4U
  for (const st of P34U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("register/shifts/settings/reports P3.5U (wo p3.5u --states · owner + cashier):"); // POS P3.5U
  for (const st of P35U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("register/sales/reports/settings P3.6U (wo p3.6u --states · owner + cashier):"); // POS P3.6U
  for (const st of P36U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("settings/register/sales/reports P3-SKEL U (wo p3-skel-u --states · owner + cashier):"); // POS P3-SKEL U
  for (const st of P3SKU_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("settings/orders/register P3.7U (wo p3.7u --states · owner + cashier):"); // POS P3.7U
  for (const st of P37U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("reports/settings P3.9U (wo p3.9u --states · owner + cashier):"); // POS P3.9U
  for (const st of P39U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("settings/reports/shifts P3.8U (wo p3.8u --states · owner + cashier):"); // POS P3.8U
  for (const st of P38U_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("settings P2.13 (wo p2.13 --states · owner + manager):"); // POS P2.13
  for (const st of P213_PLAN) row(st.key, st.devices, `${st.page} · [${st.users.join("/")}] ${st.note}`);
  console.log("qr-public/orders/tables/settings P2.7U (wo p2.7 --states · เจ้าของ):"); // POS P2.7U
  for (const st of P27_PLAN) row(st.key, st.devices, `${st.page} · ${st.note}`);
  console.log("receipt-public (--page receipt-public · ไม่ส่ง --states = rpub-paid):");
  for (const st of RPUB_STATE_PLAN) row(st.key, st.key === "rpub-issue-sent" ? "mobile" : POS_VIEWPORTS.map((v) => v.name), `คาด ${st.expect} · ${st.note}`);
  const ids = [STATE_PLAN, STOCK_STATE_PLAN, SHIFTS_STATE_PLAN, BILLS_STATE_PLAN, SETTINGS_STATE_PLAN, RPUB_STATE_PLAN, P23U_PRODUCTS_PLAN, P24U_TABLES_PLAN, P24U_REG_PLAN, P28U_ORDERS_PLAN, P28U_REG_PLAN, P26U_KDS_PLAN, P26U_OTHER_PLAN, P29U_REG_PLAN, P29U_OTHER_PLAN, P29BU_PLAN, P25U_TABLES_PLAN, P25U_REG_PLAN, P211U_PLAN, P212U_PLAN, P210_PLAN, P213_PLAN, P27_PLAN, P35U_PLAN, P34U_PLAN, P39U_PLAN, P37U_PLAN /* POS P3.7U */, P38U_PLAN /* POS P3.8U */, P36U_PLAN /* POS P3.6U */, P3SKU_PLAN /* POS P3-SKEL U */].flatMap((pl) => pl.map((x) => x.key)); // POS P3.4U ▸ + P34U ◂ // POS P3.5U ▸ + P35U ◂ // POS P2.7U ▸ + P27 ◂ // POS P2.12U ▸ + P212U ◂ · POS P2.13 ▸ + P213 ◂ · POS P2.10 ▸ + P210 ◂ // POS P2.9bU ▸ + P29BU ◂ // POS P2.11U ▸ + P211U ◂ // POS P2.9U ▸ + P29U ◂ · POS P2.5U ▸ + P25U ◂ // POS P2.6U ▸ + P26U ◂ // POS P2.4U ▸ + P24U ◂ · POS P2.8U ▸ + P28U ◂ // POS P2.3U ▸ + P23U_PRODUCTS_PLAN ◂
  console.log(`JSON_SUMMARY ${JSON.stringify({ list: true, pages: POS_PAGES, states: ids.length, ids })}`);
  process.exit(0);
}

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
      if (userKey === "owner" && SHIFTS_STATE_PLAN.some((st) => st.key !== "shifts-noshift"))
        console.log(`  HF-VIS-SHIFTS: ข้อมูล P1.15U (เครื่อง ${DEVICE_ID} · PIN 6 หลักสุ่ม · บิลพัก 1 ใบ — คืนค่า/ลบใน finally) + เครื่อง ${SHIFTS_DEVICE_ID} (registerDevice · เพิกถอนใน finally) + โทเคนผู้ขายของเครื่องนั้นก่อนขายบิลของกะ`);
    }
    if (rpubOn && STATES_ON) {
      console.log(`สถานะหน้าใบเสร็จออนไลน์ P1.11U (สาธารณะ · 3 ขนาด · issue-sent 390 · เครื่อง ${RPUB_DEVICE_ID}):`);
      for (const st of RPUB_STATE_PLAN) console.log(`  · ${st.key.padEnd(22)} คาด ${st.expect} ${st.note}`);
      console.log("  เขียน: ชุดบิลของวันนี้ครบ = ไม่เขียนบิล/กะ · ขาด = กะ 1 กะ (ปิดใน finally) + บิลที่ขาด (สูงสุด 3 ใบ + ใบคืน 1) · แจ้งปัญหา 1 แถว (ลบใน finally พร้อม OutboxEvent · การ์ดบอร์ดงาน = เก็บเข้าคลัง)");
    }
    if (billsStatesOn && pages.includes("sales")) {
      console.log(`สถานะหน้าบิลวันนี้ P1.16 U${userKey === "cashier" ? " (แคชเชียร์ = ปุ่มยกเลิกปิด/ไม่มีคืนเงิน)" : ""} · เครื่อง ${BILLS_DEVICE_ID}:`);
      for (const st of BILLS_STATE_PLAN) console.log(`  · ${st.key.padEnd(19)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(`  เขียน: กะ 1 กะ (บริการ openShift · ปิดใน finally นับ = ยอดคาด) + บิลวันนี้ 7 ใบ + ใบคืน 2 ใบ${userKey === "cashier" ? " — ข้ามเมื่อวันนี้มีชุดภาพบิลครบแล้ว (จากรอบเจ้าของ)" : ""}`);
    }
    if (settingsStatesOn && pages.includes("settings") && jobs.some((j) => j.state === "settings-history"))
      console.log("  P1.18U: ประวัติการเปลี่ยนของ POS ร้าน QC < 3 แถว ⇒ แก้ค่าทั่วไปจริง 4 ครั้ง (updatePosGeneralSettings เจ้าของร้าน · ค่าสุดท้ายเท่าเดิม) · ≥ 3 แถว = ไม่เขียน");
    if (pages.includes("register") && jobs.some((j) => j.state === "register-empty-catalogue"))
      console.log(`  P1.18U: fixture ภาพ 19ก — สาขา ${EMPTY_UNIT.id} + ระบบ POS "${EMPTY_POS_NAME}" (createSystem · linkUnit · registerV2 · shift.requiredRegister=false) + เครื่อง ${EMPTY_DEVICE_ID} (registerDevice) — ลบทั้งชุดใน finally`);
    if (pages.includes("register") && userKey === "cashier") console.log("  P1.18U: register-empty-catalogue = เจ้าของเท่านั้น (แคชเชียร์ QC ไม่มีสิทธิ์เข้าสาขา fixture — ห้ามแก้ membership ของ seed)");
    if (settingsStatesOn && pages.includes("settings")) {
      console.log(`สถานะหน้าตั้งค่า P1.10 U${userKey === "cashier" ? " (แคชเชียร์ = ใบเสร็จอ่านอย่างเดียว · แท็บเครื่องเป็นการ์ดปฏิเสธ)" : ""} · เครื่อง ${SETTINGS_DEVICE_CODES.join(" · ")}:`);
      for (const st of SETTINGS_STATE_PLAN) console.log(`  · ${st.key.padEnd(22)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log("  เขียน: เครื่อง QC 2 เครื่อง (registerDevice · เพิกถอนใน finally) + กะ 1 กะของเครื่อง 2 (openShift · ปิดใน finally นับ = ยอดคาด) + บิลขายเงินสด 1 ใบ (paydone-print)");
    }
    if (pages.includes("register")) console.log(`  P1.15U: เครื่อง ${DEVICE_ID} (registerDevice · เพิกถอนใน finally) · PIN 6 หลักสุ่มของเจ้าของ/แคชเชียร์ (setStaffPin · ไม่พิมพ์ · คืนแถวเดิมใน finally) · โทเคนผู้ขายฉีดลง sessionStorage · บิลพัก 1 ใบ · กติกา POS_VOID ที่ปิดไว้ + คำขอ PENDING 1 ใบ (approval-wait) — ลบใน finally`);
    if (pages.includes("register") && jobs.some((j) => j.state === "paydlg-promptpay-qr" || j.state === "paydlg-promptpay-paid"))
      console.log("  P1.7U: ใบขอรับเงินของเครื่องรอบนี้ (PENDING = ยกเลิกใน finally) + บิลขายจริงที่ใช้ใบ PAID (paydlg-promptpay-paid) · PromptPay ID ของร้าน QC ตั้ง/คืนค่าเมื่อยังไม่มี");
    if (pages.includes("register") && jobs.some((j) => j.state && /^(member-|paydlg-member-|sale-done-member)/.test(j.state)))
      console.log("  P1.12U: สมาชิก QC (ค่าตั้งแต้ม · เติมแต้มคีย์ posqc-p112u-topup-<วันที่>-<ยอดก่อนเติม>) · fix รอบ 1: ระบบคูปองของร้าน QC ผูกสาขาที่ถ่าย + WELCOME50 ฿50 (find-or-create · ไม่ลบ) — member-attached/paydlg-member-points ใส่คูปอง (ไม่บันทึกบิล)");
    if (jobs.some((j) => j.state && P21U_FIXTURE_STATES.has(j.state)))
      console.log(
        `  P2.1U: ช่องทาง ${P21U_CHANNELS.map((c) => `${c.code} (${c.payout} ${c.commissionBp / 100}%${c.commissionFixedSatang ? ` + ฿${c.commissionFixedSatang / 100}` : ""}${c.commissionVatBp ? ` · VAT ${c.commissionVatBp / 100}%` : ""})`).join(" · ")} ของสาขา ${unitKey} — หาตามรหัส · ไม่มี = สร้าง · ค่าไม่ตรง = แก้ (saveChannel เจ้าของร้าน) · ไม่ลบ`,
      );
    if (billsStatesOn && pages.includes("sales") && jobs.some((j) => j.state === "bills-channels" || j.state === "bills-drawer-commission"))
      console.log(`  P2.1U: บิลช่องทางของวันนี้ 2 ใบ (createSale คีย์ต่อรอบ posqc-vis-p21u-<pid>-<n>-web|lineman · เจ้าของ = สร้างคู่ใหม่ทุกรอบ · แคชเชียร์ = ใช้คู่ล่าสุดของวันนี้ (${P21U_REF} + แท็กภาพบิล) ซ้ำเมื่ออยู่หน้าแรก ไม่งั้นสร้าง · ยืนยันหน้าแรกด้วย billsPageData · ไม่ลบ): เว็บร้าน ฿235 PROMPTPAY · LINE MAN ฿420 PLATFORM ${P21U_REF}`);
    if (pages.includes("register") && jobs.some((j) => j.state === "held-drawer"))
      console.log("  HF-P1CLOSE: held-drawer พักบิลใหม่ต่อภาพ (holdRegisterCart อเมริกาโน่×2 + ลาเต้ \"โต๊ะ 4 (ภาพ QC)\") · ที่ค้างทิ้งใน finally/signal (discardHeldCart)");
    if (pages.includes("register") && jobs.some((j) => j.state === "paydlg-promptpay-timeout"))
      console.log("  HF-P1CLOSE: paydlg-promptpay-timeout เลื่อน expiresAt ของใบ PENDING ล่าสุดของเครื่องรอบนี้เป็นอดีต (แถวของรอบนี้ · ไม่แตะใบอื่น)");
    if (settingsStatesOn && jobs.some((j) => j.state === "paydone-print-failed"))
      console.log("  HF-P1CLOSE: paydone-print-failed สลับ printerConfig เครื่อง 2 เป็น USB (updateDevice) · ขายเงินสด 1 บิล · คืนค่าปริยาย (null) ทันทีหลังการ์ดขึ้น");
    if (productsStatesOn && pages.includes("products")) {
      console.log(`สถานะหน้า 06 + โปรราคา P2.2U${userKey === "cashier" ? " (แคชเชียร์ = products-readonly เท่านั้น)" : ""}:`);
      for (const st of P22U_PRODUCTS_PLAN) console.log(`  · ${st.key.padEnd(27)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
    }
    if (jobs.some((j) => j.state && P22U_FIXTURE_STATES.has(j.state)))
      console.log(
        `  P2.2U: fixture ราคา (catalog.setChannelPrices · เจ้าของร้าน) ลาเต้ (LINEMAN, ทุกสาขา) = ฐาน +27% ปัดบาท · (GRAB, ทุกสาขา) ไม่ขาย · อเมริกาโน่ (LINEMAN, ทุกสาขา) = ฐาน +25% · ครัวซองต์ (STORE, ทุกสาขา) ไม่ขาย — ` +
          `แถวเดิมจำไว้และคืนทั้งชุดหลังงาน P2.2U สุดท้าย/finally · โปร 3 ตัว "${P22U_RULE_PREFIX} · …" (savePriceRule: กำลังใช้ PRICE ฿59 บนลาเต้ · รอเริ่ม พรุ่งนี้ · หมดแล้ว เมื่อวาน) เก็บถาวรใน finally (ซากชื่อเดียวกันถูกเก็บก่อนสร้าง) · ` +
          `ช่องทาง LINEMAN/GRAB = ensureChannelFixture (P2.1U)${jobs.some((j) => j.state === P22U_BILL_STATE) ? ` · บิล LINE MAN 1 ใบ (createSale คีย์ posqc-vis-p22u-bill-<วันที่ไทย> · ไม่ลบ)` : ""}${jobs.some((j) => j.state === "register-line-badges") ? " · บิลพัก LINE MAN ต่อภาพ (holdRegisterCart · ทิ้งใน finally)" : ""}`,
      );
    // POS P2.3U ▸ มติ 10 ◂
    if (productsStatesOn && pages.includes("products") && jobs.some((j) => j.state && isP23uProducts(j.state))) {
      console.log("สถานะหน้า 06 สูตร/วัตถุดิบ P2.3U (เจ้าของ):");
      for (const st of P23U_PRODUCTS_PLAN) console.log(`  · ${st.key.padEnd(31)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
    }
    if (jobs.some((j) => j.state && P23U_FIXTURE_STATES.has(j.state)))
      console.log(
        `  P2.3U: fixture สูตร (ไอดี posqc-vis-<pid>-p23u-* · สาขา ${unitKey}) — วัตถุดิบชั่วคราว 7 ตัวในคลัง QC (เมล็ด g ฿0.65 · นม ml ฿0.05 · แก้ว 12/16 oz · ฝา (คงเหลือ 3 = ใกล้หมด) · ไซรัปต้นทุน 0 · โค้ก) + กลุ่ม "ขนาด" S/M/L + เมนูชั่วคราว 4 ตัว (ลาเต้สูตร ฿75 · โค้กสูตรเดิม · เมนูยังไม่มีสูตร · คาราเมลมัคคิอาโต้) — ` +
          `สูตร/ส่วนต่าง/สวิตช์ผ่าน catalog.setRecipe · setRecipeChoiceLines · setBomEnabled (เจ้าของร้าน) · สร้างก่อนงานแรกของช่วงที่ใช้ · ลบทั้งชุดหลังงานสุดท้ายของช่วง/finally/สัญญาณ (ซากเกิน 1 ชม. ถูกกวาดก่อนสร้าง)` +
          `${jobs.some((j) => j.state === P23U_REG_STATE) ? ` · register-pending-cuts: บิลค้างตัด 1 ใบ (createSale ใน tx ของสคริปต์ = ไม่ตัดสต็อก · คีย์ posqc-vis-p23u-pend-<pid> · เงินสดนอกกะ ฿75) → ยกเลิกบิล (voidSale) หลังภาพ — บิล VOIDED ค้างใน QC4 แบบบิลชุดภาพอื่น` : ""}`,
      );
    // POS P2.4U ▸ มติ 11 ◂
    if (jobs.some((j) => j.state && isP24uState(j.state))) {
      console.log(`สถานะโหมดโต๊ะ P2.4U (${userKey}${userKey === "cashier" ? " · เปิดโต๊ะ/ส่งครัวไม่มีสิทธิ์ — ภาพอ่านอย่างเดียว" : ""}):`);
      for (const st of [...P24U_TABLES_PLAN, ...P24U_REG_PLAN]) console.log(`  · ${st.key.padEnd(27)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      if (jobs.some((j) => j.state && P24U_FIXTURE_STATES.has(j.state)))
        console.log(
          `  P2.4U: fixture โต๊ะของรอบ (ตัวอักษร ${P24U_LETTER} · สาขา ${unitKey}) — โซน "ในร้าน · ${P24U_ZONE_TAG} ${P24U_LETTER}" 12 โต๊ะ + "ระเบียง · …" 2 โต๊ะ (createZone · createTable · ${P24U_LETTER}11 ปิดใช้งาน) · ` +
            `เปิดโต๊ะ 6 (registerOpenTable เจ้าของร้าน) + แขกเปิดเองผ่าน QR 1 (resolveTableSession) · รอบ 10 (holdRegisterCart newDraft + registerSendTableRound · อเมริกาโน่/ลาเต้) + รอบร่างค้าง 1 · ครัว advanceItem · ` +
            `คำขอ REQUEST_BILL/CALL_STAFF/PAY_PROMPTPAY (createServiceRequest) · จอง 2 (registerCreateReservation) — ไม่จ่ายบิลใด ๆ · ลบทั้งชุดตามไอดีหลังงานสุดท้ายที่ใช้/finally/สัญญาณ (ซากเกิน 1 ชม. ถูกกวาดก่อนสร้าง) · สถานีครัวที่ถูกสร้างให้ลบเมื่อไม่มีรายการอ้างถึง · ตัวนับเลขออเดอร์ของวัน (RestaurantDailyCounter) คงไว้`,
        );
      if (jobs.some((j) => j.state === "tables-empty")) console.log(`  P2.4U: tables-empty ${userKey === "owner" ? `สาขาอารีย์ ${P24U_EMPTY_UNIT}` : `สาขาสีลม ${unitId} ก่อนสร้าง fixture (รอบอื่นที่มี fixture อยู่ในสาขานี้ = ภาพตก)`}`);
    }
    // POS P2.5U ▸ มติ 10 ◂
    if (jobs.some((j) => isP25uState(j.state))) {
      console.log(`สถานะแยกบิล/ย้าย/รวม/ใบรายการ P2.5U (${userKey}${userKey === "cashier" ? " · แคชเชียร์ QC = pos.sale.create เท่านั้น: แยกบิล/จ่ายใบ/ใบรายการได้ · ย้าย/รวมปิด (ไม่มี restaurant.session.move|merge ใน seed)" : ""}):`);
      for (const st of [...P25U_TABLES_PLAN, ...P25U_REG_PLAN]) console.log(`  · ${st.key.padEnd(27)} ${st.devices.join("/").padEnd(20)} ${st.note.replace(/<L>/g, P25U_LETTER)}`);
      console.log(
        `  P2.5U: fixture ของรอบ (ตัวอักษร ${P25U_LETTER} · สาขา ${unitKey}) — สินค้าชั่วคราว 8 ตัวของเมนู 15B (posqc-vis-<pid>-p25u-* · ต้มยำกุ้ง 180 · กะเพราไก่ไข่ดาว 99 · ข้าวสวย 15 · ปลาหมึกผัดไข่เค็ม 230 · ยำวุ้นเส้น 150 · ชาไทยเย็น 69 · ลาเต้เย็น 75 · บราวนี่ 65) · ` +
          `โซน "ในร้าน · ${P25U_ZONE_TAG} ${P25U_LETTER}" 7 โต๊ะ · เปิดโต๊ะ 1–5 (registerOpenTable · 4 คน · สมาชิก QC) · รอบ 15B 8 บรรทัด ฿1,240 ต่อโต๊ะ (holdRegisterCart + registerSendTableRound) · ` +
          `แผน registerSplitTable: ${P25U_LETTER}2 ITEM 15B · ${P25U_LETTER}3 SEAT 15C · ${P25U_LETTER}4 EQUAL 4 · ${P25U_LETTER}5 EQUAL 2 + รอบหลังแผน 1 บรรทัด · ค่าบริการ POS ไม่ใช่ 10% = ตั้ง 10% (updatePosPaymentSettings) แล้วคืนค่าเดิมหลังงานสุดท้าย · ` +
          `⚠️ split-locked จ่ายบิล 1 ของ ${P25U_LETTER}4 เงินสดจริง 1 ใบต่อรอบ (บิลคงไว้แบบ sale-done) · เก็บกวาด = ยกเลิกแผนที่ยังไม่ล็อก (registerCancelSplit) → ลบแผน/โต๊ะ/session/รอบ/สินค้าของรอบตามไอดี (หลังงานสุดท้าย/finally/สัญญาณ · ซากเกิน 1 ชม. ถูกกวาดก่อนสร้าง) · ` +
          `รัน owner/cashier · th/en ทีละรอบ (ค่าบริการเป็นค่าระดับระบบ POS)`,
      );
    }
    // POS P2.8U ▸ มติ 7 ◂
    if (jobs.some((j) => j.state && isP28uState(j.state))) {
      console.log(`สถานะออเดอร์ทุกช่องทาง P2.8U (${userKey}${userKey === "cashier" ? " · ไม่มี pos.order.accept/reject — กระดานอ่านอย่างเดียว · orders-empty = เจ้าของเท่านั้น" : ""}):`);
      for (const st of [...P28U_ORDERS_PLAN, ...P28U_REG_PLAN]) console.log(`  · ${st.key.padEnd(27)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      if (jobs.some((j) => j.state && P28U_FIXTURE_STATES.has(j.state)))
        console.log(
          `  P2.8U: fixture ออเดอร์ของรอบ (สาขา ${unitKey}) — ช่องทาง LINEMAN/GRAB = ensureChannelFixture (P2.1U) + แชท (พื้นฐาน) + "${P28U_PHONE.name}" ${P28U_PHONE.code} (DIRECT · ช่องทางกำหนดเอง adapter NONE · หาตามรหัส · ไม่มี = สร้าง · ไม่ลบ) · ` +
            `ออเดอร์ผ่าน ingestOrder (เจ้าของร้าน · คีย์ต่อรอบ posqc-vis-p28u-<pid>-<เวลา>-<n> · เลขแพลตฟอร์มต่อรอบ): ใหม่ LINE MAN/Grab/แชท · โทรสั่งรับแล้ว→กำลังเตรียม ×2 (เวลาเตรียม 1 = เลยเวลา · 30) · โทรสั่ง→พร้อม · Grab ปฏิเสธ 1 · ` +
            `⚠️ LINE MAN รับ 1 ใบ (เปิดบิล PLATFORM 1 ใบต่อรอบ · ไม่ลบทั้งออเดอร์และบิล — แบบบิลภาพ P2.1U) → เตรียม → พร้อม → ส่งมอบ · ไม่มีการรับเงิน · ` +
            `ออเดอร์อื่นของรอบ (+ PosOrderLine/Event · OutboxEvent pos.order.* · AuditLog ของออเดอร์) ลบตามไอดีหลังงานสุดท้าย/finally/สัญญาณ · orders-paused-banner ปิดรับแชท 30 นาที แล้วคืน pausedUntil เดิม`,
        );
      if (jobs.some((j) => j.state === "orders-empty")) console.log(`  P2.8U: orders-empty สาขาอารีย์ ${P28U_EMPTY_UNIT} (มีออเดอร์วันนี้ = ภาพตก)`);
    }
    // POS P2.9U ▸ มติ 10 ◂
    if (jobs.some((j) => j.state && isP29uState(j.state))) {
      console.log(`สถานะบัตรของขวัญ/เครดิตร้าน/ทิป P2.9U (${userKey}${userKey === "cashier" ? " · ไม่มี pos.sale.refund — refund-to-card = ลิ้นชักไม่มีปุ่มคืนเงิน · settings-tip-ledger = เฉพาะเจ้าของร้าน" : ""}):`);
      for (const st of [...P29U_REG_PLAN, ...P29U_OTHER_PLAN]) console.log(`  · ${st.key.padEnd(29)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.9U: fixture (สาขา ${unitKey}) — บัตรกำนัลของร้าน QC เปิด (คืนค่าเดิมตอนเก็บกวาด) · บัตร 4 ใบผ่าน giftcard.sell (เงินสด ฿500/฿500/฿100/฿500 · คีย์ posqc-vis-p29u-<pid>-<k> · ` +
          `บิลขายบัตรคงอยู่) + PIN ค่าคงที่ของ fixture (สูตรแฮชของโมดูล · ไม่พิมพ์ค่า) · เครดิตร้าน ฿200 ของสมาชิก QC (member.issueStoreCredit · คีย์ต่อวัน) · ` +
          `ทิป (เปิด + บัญชีหนี้สินของสมุดที่เชื่อม · คืนค่าหลังภาพทิปสุดท้าย) · changed = ตัดยอดบัตรผ่าน giftcard.use · ⚠️ sale-done-giftcard = บิล PAID 1 ใบ · ` +
          `เก็บกวาดหลังงานสุดท้าย/finally/สัญญาณ: ระงับบัตรของรอบ (giftcard.suspend) ยกเว้นบัตรของบิล sale-done-giftcard (คง ACTIVE ฿175 · refund-to-card ใช้ต่อ)`,
      );
    }
    // POS P2.9bU ▸ มติ 9 ◂
    if (jobs.some((j) => isP29buState(j.state))) {
      console.log(`สถานะมัดจำ P2.9bU (${userKey}${userKey === "cashier" ? " · แคชเชียร์ = pick/split/receive/sale-done เท่านั้น (มติ 9)" : ""}):`);
      for (const st of P29BU_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(25)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.9bU: fixture (สาขา ${unitKey} · เครื่อง ${DEVICE_ID} ที่เจ้าของเปิดกะให้) — เปิดค่าตั้งรับมัดจำ (updatePosPaymentSettings · คืนค่าเดิมตอนเก็บกวาด) · ` +
          `มัดจำผ่าน registerTakeDeposit (โอน · walk-in ชื่อ + เบอร์ค่าคงที่ของ fixture ไม่พิมพ์ค่า · คีย์ posqc-vis-p29bu-<pid>-<k>): pick/split ฿1,070 (ใช้ซ้ำทุกภาพ) · ` +
          `exceeds/locked ฿500 ใบใหม่ต่อภาพ · notowner = มัดจำของสมาชิก QC ฿500 · sale-done ฿1,000 ใบใหม่ (+ บิล PAID 1 ใบ) · refund-deposit = มัดจำ fixture ฿1,000 ใบใหม่ (รัน --page sales แยก · ใบของ sale-done เฉพาะรันเดียวกัน) · ` +
          `exceeds = บิล ฿1 PAID ผ่าน submitRegisterSale (มัดจำ ฿1) · locked = checkDepositPhone ผิด 5 ครั้ง · ` +
          `เก็บกวาดหลังงานสุดท้าย/finally/สัญญาณ: registerRefundDeposit (โอน · ยอดคงเหลือทั้งหมด) ทุกใบของรอบที่ยัง OPEN · บิลคงอยู่ (แบบ sale-done)`,
      );
    }
    // POS P2.11U ▸ มติ 11 ◂
    if (jobs.some((j) => isP211uState(j.state))) {
      console.log(`สถานะหลายสาขา P2.11U (${userKey}${userKey === "manager" ? ` · ผู้จัดการ{สาขาสีลม} ${MANAGER_VIS.email} — สร้าง/ใช้ซ้ำ User + สร้าง Membership MANAGER ก่อน mint session · ลบ Membership ตอนเก็บกวาด (fix1 มติ 6)` : ""}):`);
      for (const st of P211U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(27)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.11U: fixture (สาขา ${unitKey}) — ลาเต้ (STORE, สาขา) + แถวเลิกใช้ของช่องทาง ZZVIS (saveChannel → ตั้งราคา → archiveChannel · คืนแถวเดิม + ลบช่องทางของรอบหลังงานสุดท้าย/finally/สัญญาณ) · ` +
          `บิล PAID วันนี้ 3 ใบ (คีย์ต่อวัน · ไม่ลบ) · ใบเสร็จสาขา 00001 + สมุด ABB ชั่วคราว (คืนค่า) · คลังร่วม = seed QC (ไม่มี = ผูกแล้วลบลิงก์)`,
      );
    }
    // POS P2.12U ▸ มติ 8 ◂
    if (jobs.some((j) => isP212uState(j.state))) {
      console.log(`สถานะรายงาน/บิล/ตั้งค่า P2.12U (${userKey}${userKey === "cashier" ? " — reports-anomalies = การ์ดปฏิเสธของหน้า · bills-* ไม่มีทุกสาขา/บรรทัดค่าคอมฯ" : ""}):`);
      for (const st of P212U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(27)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.12U: fixture (สาขา ${unitKey} · คีย์ต่อวัน posqc-vis-p212u-<n>-<วันที่> · บิลไม่ลบ แบบ sale-done) — รายชั่วโมง: บิลวันนี้ 2 ใบ 09:xx (createSale แล้วเลื่อน createdAt/paidAt เมื่อผ่าน 10:00) + 1 ใบตอนนี้ + ` +
          `คาดการณ์ 4 สัปดาห์ก่อนวันเดียวกัน (3 ใบ/สัปดาห์ 08/09/12 น. · เลื่อน createdAt/paidAt) · สาขา: 1 บิลวันนี้ที่สาขาอารีย์ · จุดผิดปกติ: 2 บิล → voidSale (A1) · บิล LINE MAN ` +
          `(ช่องทาง P2.1U) → refundSale 1 บรรทัด PLATFORM (A2 + ลิ้นชักหลังคืน) · บิลส่วนลดท้ายบิล 40% (A4) · เกณฑ์ A1 2 ครั้ง · A2 1 ครั้ง · A3 1% · A4 20% ` +
          `(updatePosGeneralSettings เจ้าของ · ซากเกณฑ์ของรอบที่ถูก kill = กวาดเป็นค่าปริยาย · คืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ)`,
      );
    }
    // POS P3.4U ▸ มติ 11 ◂
    if (jobs.some((j) => isP34uState(j.state))) {
      console.log(`สถานะออฟไลน์ P3.4U (${userKey} · context ใหม่ทุกสถานะ · เครื่อง ${DEVICE_ID}):`);
      for (const st of P34U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(23)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        "  P3.4U: fixture — ธง settings.pos.offline.enabled เปิด (updatePosOfflineEnabled · คืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ) · " +
          `ต่อสถานะลบ snapshot ของเครื่องรอบนี้ที่ออกภายใน 2 นาที (เพดาน 1 ใบ/60 วิ) · offline-rejected/settings-offline-live: snapshot + บิลราคาปลอม 1 ใบ (syncOfflineSales → REJECTED · ทิ้งตอนเก็บกวาด) · ` +
          "offline-sync-back = บิลจริง 1 ใบในกะของรอบ · offline-close-blocked กั้น POST /api/pos/sync ด้วย request interception (ตอบ results ว่าง) · " +
          "fix2: ต่อเน็ตกลับ (sync-back · close-blocked) รอ ≥ 62 วิ หลัง snapshot ตอนโหลด (หน้าดึงซ้ำเมื่อออนไลน์ — เลี่ยง 429) · slip คงออฟไลน์ · " +
          "console ERR_INTERNET_DISCONNECTED/Failed to fetch ของ same-origin กรองเฉพาะช่วงที่ harness ตัดเน็ตเอง (นับในบรรทัดภาพ \"ออฟไลน์กรองแล้ว n\")",
      );
    }
    // POS P3.5U ▸ มติ 10 ◂
    if (jobs.some((j) => isP35uState(j.state))) {
      console.log(`สถานะ HR P3.5U (${userKey}${userKey === "cashier" ? " — 08 = การ์ดปฏิเสธของหน้า · 13b-override-wrong-pin" : ""}):`);
      for (const st of P35U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(29)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3.5U: fixture (สาขา ${unitKey}) — ระบบ HR ชั่วคราว "ทีมงาน (ภาพ QC P3.5U <pid>)" (system/service.createSystem) + พนักงาน 2 คนผูกเจ้าของ/แคชเชียร์ QC (hr.createEmployee + linkedUserId) · ` +
          `ตารางวันนี้ตามเวลาไทยจริง (in/out/leave ต่อสถานะ · setSchedule/requestLeave/decideLeave) · ด่านตารางงานเปิด 30/30/240 + ASK + ค่าคอมฯ 2% (updatePosStaffSettings/updatePosStaffCommission · คืนค่าเดิม) · ` +
          `กะ fixture 2 กะบนเครื่อง posqc-vis-p35uh-${process.pid} (เลื่อนเวลา) + ลงเวลา HR · บิลแคชเชียร์ 1 ใบ → staffCommissionOnSalePaid · เก็บกวาด: ปิดกะ · คืนค่าตั้ง · ลบแถวค่าคอมฯ · ลบระบบ HR ของรอบ (หลังงานสุดท้าย/finally/สัญญาณ)`,
      );
    }
    // POS P3-SKEL U ▸ CD-SKELU-12 ◂
    if (jobs.some((j) => isP3skuState(j.state))) {
      console.log(`สถานะโครงแพลตฟอร์ม P3-SKEL U (${userKey}${userKey === "cashier" ? " — ไม่มีชิปช่องทาง · การ์ดสลิปอ่านอย่างเดียว · ลิ้นชักบิลไม่มีปุ่มตัดสิน · 08 การ์ดปฏิเสธ" : ""} · context ใหม่ทุกสถานะ):`);
      for (const st of P3SKU_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(33)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3-SKEL U: fixture (สาขา ${unitKey} · ร้าน QC coffee เท่านั้น · ด่าน tenantId ${PQC.coffee.tenantId} · ไม่ reseed · ไม่ยิงเครือข่าย) — ช่องทาง LINEMAN/GRAB (saveChannel · find-or-create · เก็บไว้) + credentials ผ่าน saveIntegrationCredentials + deps.key ของ harness ` +
          "(LINEMAN DRAFT · GRAB COMPLETE · ค่า posqc-… · เก็บไว้) · บิลโอน createSale + สลิป attachSlip(deps.put stub · PNG สังเคราะห์) → voidSale ตอนเก็บกวาด · ใบขอรับเงินของ paydlg-intent-slip → cancelPaymentIntent · " +
          `agent ${P3SKU_TAG}-agent (registerPrintAgent) + agent ของ -token (กดจริง · โทเคนปิดบังในภาพ) → เพิกถอน + ลบ · เครื่อง ${DEVICE_ID} printerConfig แลนเฉพาะ -agents (_qcP3skuBefore · คืนทุกทาง) · ` +
          "ไม่กดทดสอบพิมพ์/ส่งงานพิมพ์ · ไม่อัปสลิปผ่าน UI · QC5 ไม่มี POS_CREDENTIALS_KEY = -keymissing รันจริง · pre-flight QC4: `visual-pos.mts p3-skel-u --probe` (อ่านอย่างเดียว)",
      );
    }
    // POS P3.6U ▸ CD-P36U-12 ◂
    if (jobs.some((j) => isP36uState(j.state))) {
      console.log(`สถานะลูกค้าองค์กร/วางบิล P3.6U (${userKey}${userKey === "cashier" ? " — ไทล์ไม่มีตัวเลขวงเงิน · แผ่นเกินวงเงิน/PIN ผิด · 08 การ์ดปฏิเสธ · 10 อ่านอย่างเดียว" : ""} · context ใหม่ทุกสถานะ):`);
      for (const st of P36U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(31)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3.6U: fixture (สาขา ${unitKey} · ร้าน QC coffee เท่านั้น · ไม่ reseed) — ระบบ CRM ของร้าน (active ตัวแรก · ไม่มี = สร้าง "${P36U_CRM_NAME}" เก็บไว้) · ` +
          `บริษัท ${P36U_CO.co.tag} / ${P36U_CO.co2.tag} + ผู้ติดต่อสมาชิก QC ผูก -co + ดีล OPEN "${P36U_DEAL_TITLE}" ผ่านตัวเขียน CRM (find-or-create · เก็บไว้) · ` +
          "วงเงินผ่าน saveCreditAccount (-co ฿500,000 · -co2 ฿1 · เทอม 30) · settings.pos.credit / .orders.memberOnBill = jsonb ของ harness (ค่าเดิมใน _qcP36uBefore · ด่านร้าน QC ก่อนเขียน · คืนหลังงานสุดท้าย/finally/สัญญาณ) · " +
          `ผู้จัดการของภาพ ${P36U_MGR.userId} + PIN (setStaffPin · PIN ผิด = unlockStaffPin · ลบตอนเก็บกวาด) · ⚠️ paydone-onaccount-due = บิลวางบิลจริง 1 ใบ → ภาพบิล → voidSale ตอนเก็บกวาด · ` +
          "ไม่มีระบบ CRM/สมุดบัญชี/สมาชิก = สถานะนั้น SKIP พร้อมเหตุผล",
      );
    }
    // POS P3.7U ▸ CD-P37U-10 ◂
    if (jobs.some((j) => isP37uState(j.state))) {
      console.log(`สถานะแชท P3.7U (${userKey}${userKey === "cashier" ? " — settings-chat-card-readonly · orders-detail-chat-paylink = ปุ่มปิด needPerm" : ""} · context ใหม่ทุกสถานะ):`);
      for (const st of P37U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(29)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3.7U: fixture (สาขา ${unitKey}) — ด่าน LINE CONNECTED ของร้าน QC = 0 ก่อนสถานะที่เปิดสวิตช์ (> 0 = SKIP) · settings.pos.chat ผ่าน jsonb ของ harness (ค่าเดิมใน settings.pos._qcP37uBefore · ` +
          "ปิด = ลบคีย์ · card-on = receiptAuto + orderStatus · paydone = receiptAuto ปิดทันทีหลังขาย · คืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ) · " +
          `ระบบแชทชั่วคราว "แชท (ภาพ QC P3.7U <pid>)" + WEBCHAT (ส่ง no-op · ไม่แตะเครือข่าย) + ห้อง 1 ห้อง (receiveWebchatInbound) · ออเดอร์แชทผ่าน ingestOrder (ผูกห้อง+สมาชิก QC / ไม่ผูกห้อง / ใหม่ต่อภาพ sent → กดปุ่มจริง) · ` +
          "เก็บกวาด: คืนค่าตั้ง → rejectOrder ออเดอร์ NEW → ลบแถวออเดอร์/ใบขอรับเงิน/outbox/audit/ops ของรอบ → ลบแถวแชท + ระบบชั่วคราว · บิล paydone คงไว้ (แบบ sale-done-member)",
      );
    }
    // POS P3.9U ▸ มติ 6 ◂
    if (jobs.some((j) => isP39uState(j.state))) {
      console.log(`สถานะผู้ช่วย AI P3.9U (${userKey}${userKey === "cashier" ? " — reports-ai-panel-refused = การ์ดปฏิเสธของหน้า + แผง AI ปฏิเสธ" : ""}):`);
      for (const st of P39U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(31)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3.9U: fixture (สาขา ${unitKey}) — บิลวันนี้ 3 ใบ + ยกเลิก 1 ใบ (createSale/voidSale คีย์ต่อวัน posqc-vis-p39u-<n>-<วันที่> · ไม่ลบ แบบ P2.12U) · ` +
          "settings.pos.ai ผ่าน jsonb ของ harness (CD-P39U-4 · ค่าเดิมเก็บใน _qcP39uBefore · ปิด = off states · เปิด = ที่เหลือ · คืนค่าเดิมหลังงานสุดท้าย/finally/สัญญาณ) · " +
          "audit pos.staff.schedule_override ×3 ผ่าน writeAudit (CD-P39U-5 · เหตุผล \"ภาพ QC P3.9U <pid>\" · ลบตอนเก็บกวาด) · ผู้จัดการชั่วคราวของภาพ (Membership MANAGER ลบตอนเก็บกวาด · invalid = ลดเป็น STAFF ชั่วคราวก่อนกดบันทึก) · fix1 N1: brief ใช้ A11 ×3 เป็นบรรทัดที่ต้องทำต่อ · empty พัก 86 ของระบบ + จุดสั่งซื้อของสินค้าใกล้หมดชั่วคราว (เก็บใน _qcP39uBefore.park · คืนหลังภาพ/finally/สัญญาณ)",
      );
    }
    // POS P3.8U ▸ CD-P38U-11 ◂
    if (jobs.some((j) => isP38uState(j.state))) {
      console.log(`สถานะบอร์ดงาน/ห้องทีม P3.8U (${userKey}${userKey === "cashier" ? " — settings-board-readonly = อ่านอย่างเดียว" : ""}):`);
      for (const st of P38U_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(31)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P3.8U: fixture (ร้าน QC coffee · สาขา ${unitKey} · ไม่ reseed) — บอร์ด ${P38U_BOARD_NAME} (kanban/service.createBoard ในระบบ KANBAN แรก · หา/สร้าง · เก็บไว้) · ` +
          `ห้อง ${P38U_ROOM_NAME} + ${P38U_ROOM_ARCH_NAME} (เก็บถาวร · meeting/service · หา/สร้าง · เก็บไว้) · ไม่มีระบบที่เปิดอยู่ = สร้าง "${P38U_KANBAN_SYS_NAME}" / "${P38U_MEETING_SYS_NAME}" (system/service.createSystem · เก็บไว้ · สร้างไม่ได้ = SKIP) · ` +
          "settings.pos.board/teamRoom (+ ai.enabled ของ reports-ai-panel-board) = jsonb ของ harness · ค่าเดิมใน settings.pos._qcP38uBefore · คืนหลังงานสุดท้าย/finally/สัญญาณ · " +
          "🔴 ด่านก่อนเขียนทุกครั้ง: id บอร์ด/ห้อง = ของ fixture เท่านั้น (ไม่ใช่ = ยกเลิก) · ไม่ปิดกะ · ไม่เรียก sweepPosBoard/onShiftClosed · ไม่กดบันทึกขณะ posts.* เปิด · " +
          `audit A11 4 แถว×3 (เหตุผล "${P38U_REASON} <pid>" · ลบตอนเก็บกวาด) · การ์ดชิป createCardFromExternal (pos-shift:<กะปิดล่าสุด> · pos-anomaly:A11:…:<เจ้าของ> · เก็บไว้) · ` +
          `กะเปิดของเครื่อง ${P38U_SHIFT_DEV} (openShift เจ้าของ ฿0 · ไม่ปิด · ใกล้ปิดอัตโนมัติ = SKIP)`,
      );
    }
    // POS P2.7U ▸ มติ 15 ◂
    if (jobs.some((j) => isP27State(j.state))) {
      console.log(`สถานะ QR P2.7U (${userKey} · qr-public 390 + 1024${LOCALE_EN ? " · ?lang=en" : ""} · หน้าพนักงาน ${LOCALE_EN ? "1440" : "3 ขนาด"}):`);
      for (const st of P27_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(27)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.7U: fixture (สาขา ${unitKey} · ร้าน QC coffee เท่านั้น · id/ชื่อ posqc-vis-p27-<pid>) — ช่องทาง QR_TABLE/QR_ORDER: เปิด + ไม่พัก + QR_ORDER รับอัตโนมัติปิด (จำค่าเดิม · คืนตอนเก็บกวาด) · ` +
          `PromptPay ID ของร้าน QC (P1.7U · คืนค่า) · โซน "QR ภาพ · posqc-vis-p27 <ตัวอักษร>" + โต๊ะ Q1 (ว่าง) Q2 (รอบแขก 2 รอบผ่าน placeTableRound + สถานะครัว advanceItem) Q3 (รอบแขก + แผนแยกบิล EQUAL 2) · ` +
          `ลิงก์สั่งล่วงหน้า (getOrderLink · ไม่มี = createOrderLink แล้วลบตอนเก็บกวาด) · ออเดอร์จ่ายก่อน 9 ใบผ่าน placePreorder (IP posqc-vis-p27-<pid>-<n>): รอจ่าย · แจ้งโอน (claimPaid) · ` +
          `จ่ายแล้ว (confirmPaymentIntentManual เจ้าของ + onIntentPaid) · ⚠️ รับแล้ว / พร้อม (acceptOrder = บิลพร้อมเพย์จริง · ไม่ลบ · ส่งมอบตอนเก็บกวาด) · หมดเวลา (payBy อดีต + expirePreorderIfDue) · ` +
          `ปฏิเสธ (rejectOrder · ops refund_needed) · เงินเข้าหลังหมดเวลา (payBy อดีต → ยืนยันเอง → onIntentPaid = late_payment + ops) · ` +
          `ก่อนภาพ closed = พักรับ 30 นาที แล้วคืน · คำขอของหน้า qr-public ส่งหัว x-forwarded-for posqc-vis-p27-<pid>-ui (ถังเพดานของรอบ) · ` +
          `เก็บกวาดหลังงานสุดท้าย/finally/สัญญาณ: แผนแยกบิล → โซน/โต๊ะ/session/รอบ/คำขอ (deleteP24uRows) · ออเดอร์ที่ไม่มีบิล + บรรทัด/เหตุการณ์/outbox/audit/ใบขอรับเงิน/ops ของรอบ · ลิงก์ที่รอบสร้าง · ถังเพดาน · ช่องทางคืนค่าเดิม`,
      );
    }
    // POS P2.10 ▸ มติ 11 ◂
    if (jobs.some((j) => isP210State(j.state))) {
      console.log(`สถานะจอลูกค้า P2.10 (${userKey}):`);
      for (const st of P210_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(27)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.10: fixture (สาขา ${unitKey}) — เครื่อง posqc-vis-p210-<pid> "เคาน์เตอร์ 1" (registerDevice · เพิกถอนตอนเก็บกวาด) · จับคู่จอผ่าน enable/pairCustomerDisplay (คุกกี้ pos_display ของแท็บ) · ` +
          `ภาพจอป้อนด้วย publishDisplayState (ตัวเลขเท่าภาพ 11A · stale = เลื่อน stateAt 121 วิ) · ⚠️ display-done = กะของเครื่อง + บิลเงินสด 1 ใบ (ไม่ลบ · ปิดกะตอนเก็บกวาด) · ` +
          `paying-promptpay = PromptPay ID ของร้าน QC (P1.7U · คืนค่า) · live = เครื่อง ${DEVICE_ID} (PIN/โทเคน P1.15U + กะของเจ้าของ) + แท็บหน้าขายจริง · ` +
          `เก็บกวาดหลังงานสุดท้าย/finally/สัญญาณ: ยกเลิกจับคู่จอ · ปิดกะ · เพิกถอนเครื่อง · ลบถังเพดานแลกรหัสของรอบ`,
      );
    }
    // POS P2.13 ▸ การ์ดคีย์ API ◂
    if (jobs.some((j) => isP213State(j.state))) {
      console.log(`สถานะการ์ดคีย์ API P2.13 (${userKey}${userKey === "manager" ? ` · ผู้จัดการ{สาขาสีลม} ${MANAGER_VIS.email} (allUnits false = ต้องเลือกสาขา) — สร้าง/ใช้ซ้ำ User + Membership MANAGER ก่อน mint session · ลบ Membership ตอนเก็บกวาด (แบบ P2.11U)` : ""}):`);
      for (const st of P213_PLAN.filter((x) => x.users.includes(userKey))) console.log(`  · ${st.key.padEnd(31)} ${st.page.padEnd(9)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
      console.log(
        `  P2.13: เขียน (ระบบ POS ${SYS} ร้าน QC · ชื่อคีย์ลงท้าย "(QC ${process.pid})") — ก่อนงานแรก: กวาดคีย์ "(QC <pid>)" ของ pid ที่ตายแล้ว · ` +
          `raw = คีย์จริงผ่าน UI (createPosApiKeyAction · ใบก่อนหน้าของรอบลบก่อนภาพถัดไป) · list/revoke = คีย์ fixture 2 ใบ (api-keys/service createApiKey · pos-read + ตัวกรองสาขา ${unitKey} · lastUsedAt 3 ชม.ก่อน ` +
          `· และ pos-admin → revokeApiKey) · revoke ไม่กดยืนยัน · เก็บกวาดหลังงานสุดท้าย/finally/สัญญาณ: ลบ ApiKey ของรอบทั้งหมด (AuditLog ของการสร้างผ่าน UI คงอยู่)`,
      );
    }
    if (pages.includes("register") && jobs.some((j) => j.state === "paydlg-platform"))
      console.log("  P2.1U: paydlg-platform พักบิล LINE MAN (holdRegisterCart + channelId) ใหม่ต่อภาพ → เรียกคืนผ่าน UI · ที่ค้างทิ้งใน finally (discardHeldCart)");
    if (needFixtures) console.log(`  fixture: สินค้าชั่วคราว 11 ตัว (เหลือ 2 · หมดสต็อก · ปิดขาย + 4 ตัวของภาพ 01 + ลาเต้มีตัวแปร 1+2 + สินค้าชั่ง 1) + กลุ่มตัวเลือก 4 กลุ่ม ที่สาขา ${unitKey} — ลบใน finally`);
  }
  console.log(`รวม ${plan.length} ภาพ (${pages.length} หน้า × ${viewports.length} ขนาด${STATES_ON ? " · หน้าขายแยกตามสถานะ" : ""} × 1 ผู้ใช้)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, dry: true, locale: LOCALE_EN ? "en" : "th", states: STATES_ON, pages: pages.length, viewports: viewports.length, shots: plan.length, plan })}`);
  process.exit(0);
}

// ═══════════════════ POS P3-SKEL U ▸ --probe: pre-flight อ่านอย่างเดียวบน QC4 (LANE-RULES 22 ต.ค. 05:0xZ) — ไม่เขียน ไม่เปิดเบราว์เซอร์ ═══════════════════
//   ใช้: bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-pos.mts p3-skel-u --probe
//   ตรวจทุกค่าที่ตัวเขียนของโมดูลตรวจ: ด่านร้าน QC · ชนิด/ผู้ให้บริการ/ชื่อฟิลด์ credentials + สถานะที่คาด · กุญแจ harness · ช่องทาง/เพดาน · ไฟล์สลิป (ชนิด/ขนาด/ไบต์หัว/sha) ·
//   เป้าหมายสลิป · เครื่องพิมพ์ของ agent (parsePrinters) · พอร์ต · agent ของสาขา · รายงานกระทบยอด (อ่าน) · slipTargets (อ่าน) · อายุเก็บสลิป · PromptPay ของสาขา
if (P3SKU_WO && argv.includes("--probe")) {
  const { loadPosQcEnv } = await import("./pos-qc-env.mjs");
  loadPosQcEnv("visual-pos");
  const { prisma: db } = await import("@/lib/core/db");
  const out: [string, boolean, string][] = [];
  const ok = (k: string, pass: boolean, v: unknown) => out.push([k, pass, typeof v === "string" ? v : JSON.stringify(v)]);
  try {
    const sys = await db.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId, type: "POS" }, select: { id: true, settings: true } });
    ok("guard.tenant", tenantKey === "coffee" && T.tenantId === PQC.coffee.tenantId, { tenantId: T.tenantId, want: PQC.coffee.tenantId, slug: T.slug });
    ok("guard.posSystem", !!sys, { SYS, unitId });
    const own = T.users.owner;
    const mb = await db.membership.findUnique({ where: { id: own.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
    ok("owner.membership", mb?.role === "OWNER", { membershipId: own.membershipId, role: mb?.role ?? null });
    const owner = { userId: own.userId, role: String(mb?.role ?? "OWNER"), unitAccess: Array.isArray(mb?.unitAccess) ? (mb!.unitAccess as string[]) : [], permissions: (mb?.permissions ?? {}) as Record<string, unknown> };
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    // credentials
    const creds = (await import("@/lib/modules/pos/integration-creds")) as Any;
    for (const [kind, provider] of [["PLATFORM", "LINEMAN"], ["PLATFORM", "GRAB"], ["SLIP_VERIFY", "SLIPOK"], ["ETAX", "INET"]] as const) {
      const defs = creds.integrationFields(kind, provider) as { name: string; required: boolean; secret: boolean }[] | null;
      ok(`creds.fields.${kind}.${provider}`, !!defs, defs ? defs.map((f) => `${f.name}${f.required ? "*" : ""}${f.secret ? "(ลับ)" : ""}`).join(",") : null);
      if (defs && kind === "PLATFORM") {
        const fx = P3SKU_CREDS[provider as "LINEMAN" | "GRAB"];
        const unknown = Object.keys(fx).filter((n) => !defs.some((f) => f.name === n));
        const filled = (f: { name: string }) => ((fx as Record<string, string>)[f.name] ?? "") !== "";
        const status = defs.filter((f) => f.required).every(filled) ? "COMPLETE" : "DRAFT";
        ok(`creds.fixture.${provider}`, unknown.length === 0 && status === (provider === "LINEMAN" ? "DRAFT" : "COMPLETE"), { unknown, expectStatus: status, valueMaxOk: Object.values(fx).every((v) => v.length <= 4000 && !/[\u0000-\u001f]/.test(v)) });
      }
    }
    const box = (await import("@/lib/modules/pos/secret-box")) as Any;
    const key = box.posSecretKey({ key: P3SKU_KEY });
    const sealed = key ? box.sealPosSecret({ probe: "posqc" }, { key }) : null;
    ok("creds.harnessKey", !!key && P3SKU_KEY.length >= 32 && box.openPosSecret(sealed, { key })?.probe === "posqc", { length: P3SKU_KEY.length, roundtrip: !!sealed });
    ok("creds.serverEnvKey(probe process)", true, { POS_CREDENTIALS_KEY: process.env.POS_CREDENTIALS_KEY ? "set" : "unset" });
    // ช่องทาง
    const { CHANNEL_LIMIT_PER_UNIT } = await import("@/lib/modules/pos/channel-shared");
    const chans = await db.salesChannel.findMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId }, select: { id: true, code: true, archivedAt: true, adapter: true } });
    const have = Object.fromEntries(["LINEMAN", "GRAB"].map((c) => [c, chans.find((x) => x.code === c) ?? null]));
    const toCreate = Object.values(have).filter((x) => !x).length;
    ok("channels.platform", Object.values(have).every((x) => !x || !x.archivedAt) && chans.length + toCreate <= CHANNEL_LIMIT_PER_UNIT, { LINEMAN: have.LINEMAN ? `${have.LINEMAN.id} ${have.LINEMAN.adapter}${have.LINEMAN.archivedAt ? " archived" : ""}` : "create", GRAB: have.GRAB ? `${have.GRAB.id} ${have.GRAB.adapter}${have.GRAB.archivedAt ? " archived" : ""}` : "create", count: chans.length, limit: CHANNEL_LIMIT_PER_UNIT });
    const rows = await db.posIntegrationCredential.findMany({ where: { tenantId: T.tenantId, systemId: SYS, kind: "PLATFORM", provider: { in: ["LINEMAN", "GRAB"] } }, select: { provider: true, status: true, secretNames: true } });
    ok("creds.rows(existing)", true, rows.map((r) => `${r.provider}:${r.status}:${(r.secretNames ?? []).join("+")}`));
    // สลิป
    const slip = (await import("@/lib/modules/pos/payment-slip")) as Any;
    const png = await p3skuPng(`${P3SKU_TAG}-probe-${process.pid}`);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(png).digest("hex");
    const dup = await db.posPaymentSlip.findFirst({ where: { tenantId: T.tenantId, sha256: sha }, select: { id: true } });
    ok("slip.file", png.length > 0 && png.length <= slip.SLIP_MAX_BYTES && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47 && !dup, { bytes: png.length, max: slip.SLIP_MAX_BYTES, type: "image/png", shaUnique: !dup });
    const tref = `QCP3SKU${process.pid}${Date.now() % 100000}`;
    ok("slip.input", /^[A-Za-z0-9_-]{4,64}$/.test(tref) && Number.isSafeInteger(8000) && `${P3SKU_TAG}-slip-${process.pid}`.length <= 120, { transRef: tref, amountSatang: 8000, perTarget: slip.SLIP_MAX_PER_TARGET, windowH: slip.SLIP_ATTACH_WINDOW_MS / 3_600_000 });
    ok("slip.retentionDays", true, slip.slipRetentionDaysOf(sys?.settings));
    const tr = await db.posPayment.findFirst({ where: { tenantId: T.tenantId, unitId, type: "TRANSFER", sale: { systemId: SYS, docType: "SALE" } }, select: { saleId: true }, orderBy: { id: "desc" } });
    if (tr) {
      const st = (await import("@/lib/modules/pos/slip-targets")) as Any;
      const r = await st.slipTargets(ctx, owner, { saleId: tr.saleId });
      ok("slip.targets(read)", r?.ok === true && r.targets.every((x: Any) => x.type === "TRANSFER" || x.type === "PROMPTPAY"), r?.ok ? { saleId: tr.saleId, targets: r.targets.length, slips: r.slips.length } : r?.code);
    } else ok("slip.targets(read)", true, "ไม่มีบิลโอนในสาขา QC (fixture สร้างเองตอนถ่าย)");
    // agent
    const relay = (await import("@/lib/modules/pos/print-relay")) as Any;
    const parsed = relay.parsePrinters(P3SKU_PRINTERS.map((p) => ({ ...p })));
    ok("print.printers", !!parsed && parsed.length === 2, parsed ?? "parsePrinters = null");
    ok("print.ports", relay.PRINT_PRINTER_PORTS.includes(9100), relay.PRINT_PRINTER_PORTS);
    ok("print.agentName", `${P3SKU_TAG}-agent`.length <= 60 && `${P3SKU_TAG}-token-${process.pid}-1`.length <= 60, { agent: `${P3SKU_TAG}-agent`, token: `${P3SKU_TAG}-token-${process.pid}-1` });
    const agents = await db.posPrintAgent.findMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId }, select: { name: true, revokedAt: true } });
    ok("print.agents(unit)", true, { live: agents.filter((a) => !a.revokedAt).length, harness: agents.filter((a) => a.name.startsWith(P3SKU_TAG)).length, nonHarnessLive: agents.filter((a) => !a.revokedAt && !a.name.startsWith(P3SKU_TAG)).length });
    // กระทบยอด
    const rec = (await import("@/lib/modules/pos/payment-reconcile")) as Any;
    const d = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${d}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    const rr = await rec.reportIntentReconcile(ctx, owner, { from, to: d });
    ok("reconcile.read", rr?.ok === true, rr?.ok ? { from, to: d, rows: rr.rows.length, days: rr.days.length, maxDays: rec.RECONCILE_MAX_DAYS } : rr?.code);
    // พร้อมเพย์ (ใบขอรับเงินแบบคงที่ของ paydlg-intent-slip)
    const { promptpayIdForUnit } = await import("@/lib/modules/pos/payment-intent-shared");
    const prof = await db.paymentProfile.findFirst({ where: { tenantId: T.tenantId }, select: { promptpayId: true } }).catch(() => null);
    ok("intent.promptpay", true, { unit: promptpayIdForUnit(sys?.settings, unitId) ? "set" : "unset", shop: prof?.promptpayId ? "set" : "unset (harness ensureQcPromptPay ตั้งให้ตอนถ่าย)" });
    // เครื่องของรอบ (DEVICE_ID ลงทะเบียนตอนถ่าย) · ตัวแกะ printerConfig รับ escpos-lan
    const ds = await import("@/lib/modules/pos/device-shared");
    const pc = ds.parsePrinterConfig({ mode: "escpos-lan", kitchenSlip: "after-sale", _qcP3skuBefore: { mode: "browser", kitchenSlip: null } });
    ok("device.printerConfig", pc.ok === true && (pc as Any).config.mode === "escpos-lan" && !("_qcP3skuBefore" in (pc as Any).config), pc.ok ? (pc as Any).config : pc);
  } catch (e) {
    ok("probe.error", false, e instanceof Error ? e.message.slice(0, 200) : String(e));
  }
  for (const [k, pass, v] of out) console.log(`PROBE ${pass ? "✅" : "❌"} ${k.padEnd(34)} ${v}`);
  const bad = out.filter((x) => !x[1]).length;
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, probe: true, readOnly: true, checks: out.length, failed: bad })}`);
  await db.$disconnect().catch(() => undefined);
  process.exit(bad ? 1 : 0);
}
// ◂ POS P3-SKEL U

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
      // POS P1.13U: ลบคำขอใบกำกับของรอบนี้ + ปิดกะของเครื่องภาพใบกำกับ (ก่อน cleanRpub ที่คืนค่าสมุด · เหมือน finally)
      try {
        await cleanupTaxInv();
      } catch (e) {
        console.error(`❌ เก็บกวาดชุดภาพใบกำกับไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
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
      // POS P1.18U ▸ แก้รอบ 1 F2: ลบ fixture ภาพ 19ก (เครื่อง · ลิงก์ · ระบบ · สาขา · AuditLog) ก่อนเก็บกวาดหน้าตั้งค่า (เหมือน finally) ◂
      try {
        await cleanupEmptyCatalogue();
        if (P118U.empty.cleanup) console.error(`${P118U.empty.cleanup.ok ? "🧹" : "⚠️"} ${P118U.empty.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ ลบ fixture ภาพ 19ก ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
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
      // POS P2.2U: เก็บโปร fixture · คืนแถวราคา · ทิ้งบิลพัก (เหมือน finally)
      try {
        await cleanupP22u();
        if (P22U.cleanup) console.error(`${P22U.cleanup.ok ? "🧹" : "⚠️"} ${P22U.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.2U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.3U: ยกเลิกบิลค้างตัด · ลบสินค้า/วัตถุดิบชั่วคราว (เหมือน finally)
      try {
        await cleanupP23u();
        if (P23U.log.length) console.error(p23uCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.3U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.6U: คืนพักครัว/86/สถานีสินค้า · ลบรอบ/ออเดอร์/โต๊ะ/สถานีของรอบ (เหมือน finally)
      try {
        await cleanupP26u();
        if (P26U.log.length) console.error(p26uCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.6U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.8U: ลบออเดอร์ของรอบ + คืนค่าปิดรับแชท (เหมือน finally)
      try {
        await cleanupP28u();
        if (P28U.log.length) console.error(p28uCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.8U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.9bU: คืนเงินมัดจำของรอบที่ยังเหลือ · คืนค่าตั้งรับมัดจำ (เหมือน finally)
      try {
        await cleanupP29bu();
        if (P29BU.log.length) console.error(`${P29BU.ok ? "🧹" : "⚠️"} P2.9bU: ${P29BU.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.9bU ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.9U: ระงับบัตรของรอบ · คืนค่าตั้งบัตร/ทิป (เหมือน finally)
      try {
        await cleanupP29u();
        if (P29U.log.length) console.error(`${P29U.ok ? "🧹" : "⚠️"} P2.9U: ${P29U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.9U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.7U: คืนช่องทาง · ลบชุดโต๊ะ/ออเดอร์/ลิงก์/ถังเพดานของรอบ (เหมือน finally)
      try {
        await cleanupP27();
        if (P27.log.length) console.error(`${P27.ok ? "🧹" : "⚠️"} P2.7U: ${P27.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.7U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.10: ยกเลิกจับคู่จอ · ปิดกะ + เพิกถอนเครื่องของภาพจอลูกค้า (เหมือน finally)
      try {
        await cleanupP210();
        if (P210.log.length) console.error(`${P210.ok ? "🧹" : "⚠️"} P2.10: ${P210.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.10 ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.4U: ทิ้งแถวคิวผู้จัดการ · คืนธงออฟไลน์ · ลบ snapshot ของเครื่องรอบนี้ (เหมือน finally)
      try {
        await cleanupP34u();
        if (P34U.log.length) console.error(`${P34U.ok ? "🧹" : "⚠️"} P3.4U: ${P34U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.4U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.6U: คืนค่าตั้งวางบิล · ยกเลิกบิลวางบิลของภาพ · ลบผู้จัดการของภาพ (เหมือน finally)
      try {
        await cleanupP36u();
        if (P36U.log.length) console.error(`${P36U.ok ? "🧹" : "⚠️"} P3.6U: ${P36U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.6U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3-SKEL U: คืน printerConfig · เพิกถอน/ลบ agent ของ harness · ยกเลิกใบขอรับเงิน + บิลโอนของภาพ (เหมือน finally)
      try {
        await cleanupP3sku();
        if (P3SKU.log.length) console.error(`${P3SKU.ok ? "🧹" : "⚠️"} P3-SKEL U: ${P3SKU.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3-SKEL U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.7U: คืนค่าตั้งแชท · ปฏิเสธ/ลบออเดอร์ของรอบ · ลบระบบแชทชั่วคราว (เหมือน finally)
      try {
        await cleanupP37u();
        if (P37U.log.length) console.error(`${P37U.ok ? "🧹" : "⚠️"} P3.7U: ${P37U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.7U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.8U: คืนค่าตั้งบอร์ดงาน/ห้องทีม/ผู้ช่วย AI · ลบ audit A11 ของภาพ (เหมือน finally · บอร์ด/ห้อง/การ์ด/กะของ fixture คงอยู่)
      try {
        await cleanupP38u();
        if (P38U.log.length) console.error(`${P38U.ok ? "🧹" : "⚠️"} P3.8U: ${P38U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.8U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.9U: คืนค่าตั้งผู้ช่วย AI · ลบ audit ของภาพ · ลบผู้จัดการชั่วคราว (เหมือน finally)
      try {
        await cleanupP39u();
        if (P39U.log.length) console.error(`${P39U.ok ? "🧹" : "⚠️"} P3.9U: ${P39U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.9U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P3.5U: ปิดกะ · คืนค่าตั้ง · ลบแถวค่าคอมฯ · ลบระบบ HR ของรอบ (เหมือน finally)
      try {
        await cleanupP35u();
        if (P35U.log.length) console.error(`${P35U.ok ? "🧹" : "⚠️"} P3.5U: ${P35U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P3.5U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.12U: คืนเกณฑ์จุดผิดปกติเดิม (เหมือน finally)
      try {
        await cleanupP212u();
        if (P212U.log.length) console.error(`${P212U.ok ? "🧹" : "⚠️"} P2.12U: ${P212U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.12U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.11U: แถวราคาลาเต้ · ช่องทาง ZZVIS · ค่าใบเสร็จของสาขา · ลิงก์คลังของรอบ (เหมือน finally)
      try {
        await cleanupP211u();
        if (P211U.log.length) console.error(`${P211U.ok ? "🧹" : "⚠️"} P2.11U: ${P211U.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.11U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.13: ลบคีย์ API ของรอบ (เหมือน finally)
      try {
        await cleanupP213();
        if (P213.log.length) console.error(`${P213.ok ? "🧹" : "⚠️"} P2.13: ${P213.log.join(" · ")}`);
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.13 ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.4U: ลบ fixture โต๊ะของรอบนี้ (เหมือน finally)
      try {
        await cleanupP24u();
        if (P24U.log.length) console.error(p24uCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.4U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.5U: ยกเลิกแผน · ลบ fixture แยกบิล · คืนค่าบริการ (เหมือน finally)
      try {
        await cleanupP25u();
        if (P25U.log.length) console.error(p25uCleanupLine());
      } catch (e) {
        console.error(`❌ เก็บกวาด P2.5U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS P2.1U: ทิ้งบิลพัก LINE MAN ที่ยังค้าง (เหมือน finally)
      try {
        await cleanupP21u();
        if (P21U.cleanup) console.error(`${P21U.cleanup.ok ? "🧹" : "⚠️"} ${P21U.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ ทิ้งบิลพัก P2.1U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      // POS HF-P1CLOSE: ทิ้งบิลพักของ held-drawer ที่ยังค้าง (เหมือน finally)
      try {
        await cleanupHfP1();
        if (HFP1.cleanup) console.error(`${HFP1.cleanup.ok ? "🧹" : "⚠️"} ${HFP1.cleanup.detail}`);
      } catch (e) {
        console.error(`❌ ทิ้งบิลพัก HF-P1CLOSE ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
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
/** inStockOnly (POS P1.12U fix รอบ 1 V3 · สถานะสมาชิก) = ไม่ใส่ครัวซองต์ (สต็อกของร้าน QC หมดได้ ⇒ เตือนสต็อกแดงรกภาพ 01) — อเมริกาโน่×2 + ลาเต้ −฿10 */
async function addCart3(page: Any, device: Device, inStockOnly = false) {
  if (!QC_IDS.amer || !QC_IDS.latte || (!inStockOnly && !QC_IDS.crois)) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน/ครัวซองต์เนยสด) — รัน seed-pos-qc + backfill ก่อน");
  for (const id of inStockOnly ? [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte] : [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte, QC_IDS.crois]) await clickEl(page, tid(`pos-reg-product-${id}`));
  await expectLines(page, inStockOnly ? 2 : 3); // อเมริกาโน่ ×2 รวมเป็นบรรทัดเดียว
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
  /** HF-VIS-SHIFTS: แถวเครื่อง SHIFTS_DEVICE_ID (ลงทะเบียนครั้งแรกที่ shiftsSale ใช้ · เพิกถอนใน cleanupP115) */
  shiftsDeviceRowId: "",
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
  const u = userOf(k); // POS P2.11U
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
  const json = JSON.stringify({ userId: a.userId, name: userOf(k).name /* POS P2.11U */, role: a.role, staffToken: t.staffToken, expiresAt: t.expiresAt });
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
  await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: U.userId }, data: { failedCount: 0, lockedUntil: null } });
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
  // POS HF-P1CLOSE ▸ มติ O5: จอล็อกที่ 390 ต้องเลื่อนถึงปุ่มสลับพนักงาน + การ์ดบิลพัก (ตรวจตำแหน่งจริงหลังเลื่อน) ◂
  if (state === "lock-screen-scroll") {
    await lockFromRegister(page, device);
    const m = (await page.$eval(tid("pos-lock-screen"), (el: Element) => {
      el.scrollTop = el.scrollHeight;
      return { sh: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop };
    })) as { sh: number; ch: number; top: number };
    await new Promise((r) => setTimeout(r, 300));
    const inView = async (id: string) =>
      (await page.$eval(tid(id), (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
      }).catch(() => null)) as boolean | null;
    const sw = await inView("pos-staff-switch");
    // HF-P1CLOSE fix รอบ 1 F3: ต้องพิสูจน์การ์ดบิลพักทุกครั้ง — ไม่มีบิลพักของ seed = ตก (ไม่ข้าม) ◂
    if (!P115.heldId) throw new StepError("ไม่มีบิลพักของข้อมูลภาพ P1.15U — พิสูจน์การ์ดบิลพักบนจอล็อก 390 ไม่ได้");
    const held = await inView("pos-staff-held");
    if (!(m.sh > m.ch && m.top > 0) || !sw || !held)
      throw new StepError(`จอล็อก 390 เลื่อนไม่ถึง: scrollHeight ${m.sh} · clientHeight ${m.ch} · scrollTop ${m.top} · สลับพนักงานในจอ ${sw} · บิลพักในจอ ${held}`);
    LOCK_SCROLL.push(`${userKey}: scrollHeight ${m.sh} > clientHeight ${m.ch} · scrollTop ${m.top} · สลับพนักงาน/บิลพักอยู่ในจอ`);
    return;
  }
  if (state === "lock-pin-locked") {
    await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: U.userId }, data: { failedCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
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
const p115Summary = () => ({ seeded: P115.seeded, error: P115.error, device: P115.deviceRowId ? DEVICE_ID : null, shiftsDevice: P115.shiftsDeviceRowId ? SHIFTS_DEVICE_ID : null, pinsSet: Object.keys(P115.pins), heldId: P115.heldId || null, requestIds: P115.requestIds, saleId: P115.saleId || null, cleanup: P115.cleanup });
/** finally/signal: ลบคำขอ/snapshot/กติกา · ทิ้งบิลพัก · คืนแถว PIN · เพิกถอนเครื่อง — เรียกซ้ำได้ · ผลใน summary ไม่โยน */
async function cleanupP115(): Promise<void> {
  if (P115.cleanup || (!P115.seeded && !P115.error && !P115.restore.length && !P115.deviceRowId && !P115.shiftsDeviceRowId)) return;
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
  // HF-VIS-SHIFTS ▸ เครื่องของสถานะหน้ากะ (ปิดกะตาม id ไม่ติดเครื่องที่ถูกเพิกถอน — closeShiftsStateShift หลังขั้นนี้ได้ตามเดิม) ◂
  await step("เครื่องหน้ากะ", async () => {
    if (!P115.shiftsDeviceRowId) return "เครื่องหน้ากะ 0";
    const { revokeDevice } = await import("@/lib/modules/pos/device");
    const r = await revokeDevice({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), { id: P115.shiftsDeviceRowId });
    if (!r.ok) throw new StepError(`เพิกถอนเครื่อง ${SHIFTS_DEVICE_ID}: ${r.code}`);
    return `เพิกถอนเครื่อง ${SHIFTS_DEVICE_ID}`;
  });
  P115.cleanup = { ok, detail: `P1.15U: ${parts.join(" · ")}` };
}

async function runState(page: Any, state: StateKey, device: Device): Promise<void> {
  // R3: แยกด้วยสมาชิกชุดที่แน่นอน ไม่ใช่คำนำหน้า — สถานะหน้าขาย "stock-warn" ขึ้นต้น "stock-" แต่ไม่ใช่สถานะหน้าสต็อก
  if (isP34uState(state)) return runP34uState(page, state, device); // POS P3.4U
  if (isP39uState(state)) return runP39uState(page, state, device); // POS P3.9U
  if (isP37uState(state)) return runP37uState(page, state, device); // POS P3.7U
  if (isP36uState(state)) return runP36uState(page, state, device); // POS P3.6U
  if (isP3skuState(state)) return runP3skuState(page, state, device); // POS P3-SKEL U
  if (isP38uState(state)) return runP38uState(page, state, device); // POS P3.8U
  if (isP27State(state)) return runP27State(page, state, device); // POS P2.7U
  if (isP213State(state)) return runP213State(page, state); // POS P2.13
  if (isP210State(state)) return runP210State(page, state, device); // POS P2.10
  if (isP211uState(state)) return runP211uState(page, state, device); // POS P2.11U
  if (isP212uState(state)) return runP212uState(page, state, device); // POS P2.12U
  if (isP35uState(state)) return runP35uState(page, state, device); // POS P3.5U
  if (isP29uState(state)) return runP29uState(page, state, device); // POS P2.9U
  if (isP29buState(state)) return runP29buState(page, state, device); // POS P2.9bU
  if (isP26uState(state)) return runP26uState(page, state, device); // POS P2.6U
  if (isP25uState(state)) return runP25uState(page, state, device); // POS P2.5U
  if (isP24uState(state)) return runP24uState(page, state, device); // POS P2.4U
  if (isP28uState(state)) return runP28uState(page, state, device); // POS P2.8U
  if (isStockState(state)) return runStockState(page, state); // POS P1.14 U
  if (isShiftsState(state)) return runShiftsState(page, state); // POS P1.9 U
  if (isP23uProducts(state)) return runP23uProductsState(page, state, device); // POS P2.3U
  if (isP22uProducts(state)) return runP22uProductsState(page, state, device); // POS P2.2U
  if (state === P22U_BILL_STATE) return runP22uBillNote(page); // POS P2.2U
  if (isBillsState(state)) return runBillsState(page, state); // POS P1.16 U
  if (isRpubState(state)) return runRpubState(page, state); // POS P1.11U
  if (isSettingsState(state)) return runSettingsState(page, state, device); // POS P1.10 U
  if (state === "register-empty-catalogue") return runEmptyCatalogue(page); // POS P1.18U (ระบบ fixture · ไม่เปิดกะ)
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root) — ธง settings.pos.registerV2 ของร้าน QC เปิดหรือยัง? (seed-pos-qc)");
  });
  // ข้อ 7: ร้าน QC บังคับเปิดกะ (P1.9) — เปิดผ่าน UI ครั้งเดียวต่อรอบ ภาพจึงมีหัว "กะ #… · เปิด …" เหมือนภาพ 01
  await ensureShift(page);
  if (P115_STATE_KEYS.has(state)) return runP115State(page, state, device); // POS P1.15U
  if (state === "register-en") return runRegisterEn(page, device); // POS P1.18U
  switch (state) {
    case "default":
      return;
    case "held-drawer":
      return runHeldDrawerState(page, device); // POS HF-P1CLOSE
    case "paydlg-promptpay-timeout":
      return runPromptPayTimeout(page, device); // POS HF-P1CLOSE
    case "paydlg-platform":
      return runPlatformPayState(page, device); // POS P2.1U
    case "register-tile-rule":
    case "register-tile-notsold":
    case "register-line-badges":
      return runP22uRegisterState(page, state, device); // POS P2.2U
    case "register-pending-cuts":
      return runP23uPendingCuts(page); // POS P2.3U
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
    // POS P1.13U ▸ 15A จากปุ่มท้ายตะกร้า / สวิตช์ท้ายจอชำระ ◂
    case "taxinvoice-dialog":
    case "taxinvoice-set":
      return runTaxInvoiceRegState(page, state, device);
    // POS P1.12U ▸ สมาชิก (01 · 14A · 02 · 02b) ◂
    case "member-panel":
    case "member-register":
    case "member-attached":
    case "paydlg-member-points":
    case "paydlg-member-capped":
    case "sale-done-member":
      return runMemberRegState(page, state, device);
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
/** HF-VIS-SHIFTS ▸ ครั้งเดียวต่อรอบ: ลงทะเบียน SHIFTS_DEVICE_ID (actor เจ้าของ · แบบ seedP115Once ทำกับ DEVICE_ID) — หน้าขายล็อกเมื่อเครื่องไม่ลงทะเบียน ◂ */
async function registerShiftsDeviceOnce(): Promise<void> {
  if (P115.shiftsDeviceRowId) return;
  if (!P115.seeded) throw new StepError(`ลงทะเบียนเครื่องสถานะหน้ากะไม่ได้ — ไม่มีข้อมูล P1.15U (PIN): ${P115.error ?? "ยังไม่ได้สร้าง"}`);
  const { registerDevice } = await import("@/lib/modules/pos/device");
  const rg = await registerDevice({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), { name: `เครื่องขาย QC ${process.pid} (QC shifts)`.slice(0, 60), deviceCode: SHIFTS_DEVICE_ID });
  if (!rg.ok) throw new StepError(`ลงทะเบียนเครื่อง ${SHIFTS_DEVICE_ID} ไม่ได้: ${rg.code}`);
  P115.shiftsDeviceRowId = rg.device.id;
}
/** ขายเงินสด 1 บิลผ่านหน้าขายของเครื่องเดียวกัน (แท็บแยก 1440 · ขั้นตอนเดียวกับ sale-done) */
async function shiftsSale(page: Any): Promise<void> {
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน)");
  const reg = await page.browser().newPage();
  try {
    await pinDevice(reg, SHIFTS_DEVICE_ID);
    await reg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await reg.setCookie(...USER_COOKIES);
    // HF-VIS-SHIFTS ▸ เครื่องต้องลงทะเบียน + มีโทเคนผู้ขาย (sessionStorage pos-staff:<deviceId>) ไม่งั้นหน้าขายขึ้นจอล็อก (P1.15U) ◂
    await registerShiftsDeviceOnce();
    const staffJson = await staffSessionJson(userKey, SHIFTS_DEVICE_ID).catch(() => null);
    if (!staffJson) throw new StepError(`ออกโทเคนผู้ขาย (${userKey}) ของเครื่อง ${SHIFTS_DEVICE_ID} ไม่ได้ (shiftsSale)`);
    await injectStaff(reg, SHIFTS_DEVICE_ID, staffJson);
    await reg.goto(`${BASE}${pathOf("register")}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(reg, tid("pos-reg-root"), 0, 15_000).catch(() => {
      throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root) ระหว่างขายบิลของกะ");
    });
    if (await shiftBannerStays(reg)) throw new StepError("หน้าขายของเครื่องสถานะหน้ากะยังขึ้นแถบเปิดกะ (deviceId ไม่ตรง?)");
    // HF-VIS-SHIFTS ▸ จอล็อกค้าง (รอให้หายได้ถึง 5 วิ — เฟรมแรกก่อนอ่านโทเคนล็อกชั่วครู่) = บอกเหตุจริง แทน "คลิกหาย?" ของ expectLines ◂
    const lockGone = await reg
      .waitForFunction(() => !Array.from(document.querySelectorAll('[data-testid="pos-lock-screen"]')).some((e) => e.getClientRects().length > 0), { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!lockGone) throw new StepError("หน้าขายของเครื่องสถานะหน้ากะถูกล็อก (ไม่มี staff token / เครื่องไม่ลงทะเบียน)");
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

// ═══════════════════ POS P1.13U ▸ ใบกำกับภาษีเต็มรูป (15A · แถวในลิ้นชักบิล) ═══════════════════
/** เลขผู้ซื้อ QC (mod-11 ถูก · ไม่ใช่เลขของสมุด QC) */
const TAXINV_BUYER = { kind: "JURISTIC" as const, name: "บริษัท ทะเลใส จำกัด (ภาพ QC)", taxId: "0105559012342", branchCode: "00000", address: "88/8 ถ.เพชรเกษม ต.หัวหิน อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110", email: null };
// ═══════ POS P1.12U ▸ สถานะสมาชิกของหน้าขาย (มติ 11) ═══════
const MEMBER_REG_STATES: ReadonlySet<string> = new Set(["member-panel", "member-register", "member-attached", "paydlg-member-points", "paydlg-member-capped", "sale-done-member"]);
/** ค่าตั้งแต้มที่ภาพ 02 ใช้ ("10 แต้ม = ฿1" · ขั้นต่ำ 100 · ไม่เกิน 50% ของบิล) + ยอดแต้มขั้นต่ำของสมาชิก QC */
const MEMBER_POINT_SETTINGS = { burnRateSatang: 10, burnMinPoints: 100, burnMaxPct: 50 } as const;
const MEMBER_MIN_BALANCE = 1_000;
const MEMBER_TOPUP_TO = 1_240;
/** คีย์เติมแต้ม = วันที่ไทย + ยอดก่อนเติม (fix รอบ 1 · รีวิวข้อ 11) — รอบซ้ำยอดเดิม = ไม่เติมซ้ำ · ยอดลดลงอีกในวันเดียวกัน = คีย์ใหม่ เติมได้ */
const MEMBER_TOPUP_PREFIX = `posqc-p112u-topup-${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "")}`;
/** fix รอบ 1 (มติ 10): คูปองของภาพ 01/02 — ระบบคูปองของร้าน QC (ผูกสาขาที่ถ่าย) + โค้ดนี้ ฿50 (find-or-create ตามโค้ด) */
const QC_COUPON_CODE = "WELCOME50";
const QC_COUPON_SYSTEM_NAME = "คูปอง · POS QC";
const QC_COUPON_END_AT = new Date("2030-12-31T16:59:59.000Z");
const MEMBERX = {
  id: "",
  error: null as string | null,
  settingsBefore: null as null | { burnRateSatang: number; burnMinPoints: number; burnMaxPct: number; active: boolean },
  settingsChanged: false,
  balanceBefore: null as number | null,
  balanceAfter: null as number | null,
  toppedUp: 0,
  topupKey: "",
  /** fix รอบ 1 (มติ 10): ระบบคูปอง/คูปองของภาพ (สร้างใหม่หรือมีอยู่แล้ว) · พัง = เฉพาะสถานะที่ใส่คูปองตก */
  coupon: { systemId: "", couponId: "", systemCreated: false, couponCreated: false, reactivated: false },
  couponError: null as string | null,
  /** บิลที่ sale-done-member ขาย (เลขใบเสร็จจากจอ) */
  sales: [] as string[],
};
/** สมาชิก QC กาแฟ + ค่าตั้งแต้ม + ยอดแต้ม ≥ 1,000 ก่อนเปิด chromium — ผ่านโมดูลแต้ม (find-or-create) · พังไม่โยน (สถานะสมาชิกตกพร้อมเหตุผล) */
async function prepMemberFixture(): Promise<void> {
  if (MEMBERX.id || MEMBERX.error) return;
  try {
    const C = T as Any;
    if (!C.member?.phone || !C.systems?.MEMBER?.id || !C.systems?.POINT?.id) throw new StepError("ร้านนี้ไม่มีสมาชิก/ระบบแต้ม QC (เฉพาะ --tenant coffee)");
    const point = await import("@/lib/modules/point");
    const mem = await prisma.customer.findFirst({
      where: { tenantId: T.tenantId, memberSystemId: C.systems.MEMBER.id, phone: C.member.phone, status: "ACTIVE" },
      select: { id: true },
    });
    if (!mem) throw new StepError(`ไม่พบสมาชิก QC (${String(C.member.phone).slice(0, 3)}xxx${String(C.member.phone).slice(-4)}) — รัน seed-pos-qc`);
    MEMBERX.id = mem.id;
    const s = await point.getPointSettings(T.tenantId);
    MEMBERX.settingsBefore = { burnRateSatang: s.burnRateSatang, burnMinPoints: s.burnMinPoints, burnMaxPct: s.burnMaxPct, active: s.active };
    const want = MEMBER_POINT_SETTINGS;
    if (s.burnRateSatang !== want.burnRateSatang || s.burnMinPoints !== want.burnMinPoints || s.burnMaxPct !== want.burnMaxPct || !s.active) {
      await point.setPointSettings(T.tenantId, { ...want, active: true });
      MEMBERX.settingsChanged = true;
    }
    const bal = await point.getBalance(C.systems.POINT.id, mem.id);
    MEMBERX.balanceBefore = bal;
    MEMBERX.balanceAfter = bal;
    if (bal < MEMBER_MIN_BALANCE) {
      MEMBERX.topupKey = `${MEMBER_TOPUP_PREFIX}-${bal}`;
      const r = await point.credit({
        tenantId: T.tenantId,
        systemId: C.systems.POINT.id,
        customerId: mem.id,
        points: MEMBER_TOPUP_TO - bal,
        reason: "แต้มสำหรับภาพหน้าขาย P1.12U (QC)",
        refType: "PosQcVisual",
        refId: "p112u",
        idempotencyKey: MEMBERX.topupKey,
      });
      MEMBERX.balanceAfter = r.balance;
      MEMBERX.toppedUp = r.balance - bal;
      if (r.balance < MEMBER_MIN_BALANCE) throw new StepError(`แต้มสมาชิก QC ${r.balance} < ${MEMBER_MIN_BALANCE} (คีย์ ${MEMBERX.topupKey} ถูกใช้แล้ว)`);
    }
  } catch (e) {
    MEMBERX.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  await prepQcCoupon();
}
/**
 * fix รอบ 1 (มติ 10): ระบบคูปองของร้าน QC ที่สาขาที่ถ่าย + คูปอง WELCOME50 ฿50 — find-or-create ผ่านโมดูล (system/service · coupon) ไม่มี SQL ดิบ ไม่ลบ:
 *   สาขามีระบบคูปองแล้ว = ใช้ตัวนั้น · ไม่มี = ระบบชื่อ "คูปอง · POS QC" ของร้าน (สร้างเมื่อไม่มี) แล้วผูกสาขานี้ · โค้ดมีแล้ว = ใช้ (ปิดอยู่ = เปิด) · ไม่มี = createCoupon
 *   พังไม่โยน (เฉพาะสถานะที่ใส่คูปองตกพร้อมเหตุผล)
 */
async function prepQcCoupon(): Promise<void> {
  if (MEMBERX.coupon.couponId || MEMBERX.couponError) return;
  try {
    const sys = await import("@/lib/modules/system/service");
    const coupon = await import("@/lib/modules/coupon");
    let sid = await sys.systemForUnit(T.tenantId, unitId, "COUPON");
    if (!sid) {
      const mine = (await sys.listSystems(T.tenantId, "COUPON")).find((x) => x.name === QC_COUPON_SYSTEM_NAME);
      const id = mine?.id ?? (await sys.createSystem(T.tenantId, "COUPON", QC_COUPON_SYSTEM_NAME)).id;
      MEMBERX.coupon.systemCreated = !mine;
      await sys.linkUnit(T.tenantId, id, unitId);
      sid = await sys.systemForUnit(T.tenantId, unitId, "COUPON");
      if (sid !== id) throw new StepError("ผูกระบบคูปองกับสาขาไม่สำเร็จ");
    }
    MEMBERX.coupon.systemId = sid;
    const found = (await coupon.listCoupons(T.tenantId, sid)).find((c) => c.code === QC_COUPON_CODE);
    if (found) {
      if (found.endAt && found.endAt.getTime() <= Date.now()) throw new StepError(`คูปอง ${QC_COUPON_CODE} ของร้าน QC หมดอายุแล้ว (${found.endAt.toISOString().slice(0, 10)})`);
      if (found.type !== "FIXED" || found.valueSatang !== 5_000) throw new StepError(`คูปอง ${QC_COUPON_CODE} ของร้าน QC ไม่ใช่ ฿50 (${found.type} ${found.valueSatang ?? found.percent})`);
      if (!found.active) {
        const r = await coupon.setCouponActive(T.tenantId, sid, found.id, true);
        if (!r.ok) throw new StepError(`เปิดคูปอง ${QC_COUPON_CODE} ไม่ได้: ${r.reason}`);
        MEMBERX.coupon.reactivated = true;
      }
      MEMBERX.coupon.couponId = found.id;
    } else {
      const r = await coupon.createCoupon({ tenantId: T.tenantId, systemId: sid, code: QC_COUPON_CODE, name: "ต้อนรับ ฿50 (POS QC)", type: "FIXED", valueSatang: 5_000, endAt: QC_COUPON_END_AT });
      if (!r.ok) throw new StepError(`สร้างคูปอง ${QC_COUPON_CODE} ไม่ได้: ${r.reason}`);
      MEMBERX.coupon.couponId = r.couponId;
      MEMBERX.coupon.couponCreated = true;
    }
  } catch (e) {
    MEMBERX.couponError = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/**
 * fix รอบ 1 (มติ 10): ใส่ WELCOME50 ผ่านจอ — "cart" = ส่วนลดท้ายบิล → คูปอง (แถว 01 pos-member-coupon-line) · "pay" = "ใส่คูปอง" ในจอชำระ (แถว 02 pos-member-coupon)
 *   กล่องคูปองปิดเองเมื่อ quote ไม่มีข้อขัด · ทางตะกร้าปิดกล่องส่วนลดท้ายบิลที่ค้างด้วย Escape
 */
async function applyQcCoupon(page: Any, from: "cart" | "pay") {
  if (MEMBERX.couponError) throw new StepError(`คูปอง QC: ${MEMBERX.couponError}`);
  if (!MEMBERX.coupon.couponId) throw new StepError("ยังไม่ได้เตรียมคูปอง QC (prepQcCoupon)");
  if (from === "cart") {
    await clickEl(page, tid("pos-reg-bill-discount"));
    await visibleEl(page, tid("pos-reg-bill-discount-dialog"));
    await clickEl(page, tid("pos-reg-coupon"));
  } else await clickEl(page, tid("pos-member-coupon-enter"));
  await visibleEl(page, tid("pos-reg-coupon-dialog"), 0, 5_000);
  await typeInto(page, tid("pos-reg-coupon-input"), QC_COUPON_CODE);
  await clickEl(page, tid("pos-reg-coupon-apply"));
  await page.waitForFunction(() => !document.querySelector('[data-testid="pos-reg-coupon-dialog"]'), { timeout: 15_000 }).catch(async () => {
    const err = await page.$eval(tid("pos-reg-coupon-error"), (e: Element) => e.textContent?.trim() ?? "").catch(() => "");
    throw new StepError(`ใส่คูปอง ${QC_COUPON_CODE} แล้วกล่องไม่ปิด${err ? ` (${err})` : ""}`);
  });
  if (from === "cart" && (await page.$(tid("pos-reg-bill-discount-dialog")))) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pos-reg-bill-discount-dialog"]'), { timeout: 5_000 }).catch(() => {
      throw new StepError("กล่องส่วนลดท้ายบิลไม่ปิดหลังใส่คูปอง");
    });
  }
  const row = from === "cart" ? "pos-member-coupon-line" : "pos-member-coupon";
  await visibleEl(page, `${tid(row)}[data-state="ok"]`, 0, 15_000).catch(() => {
    throw new StepError(`ไม่ขึ้นแถวคูปอง ${QC_COUPON_CODE} (${row})`);
  });
}
/** 14A จากแถว "+ เพิ่มสมาชิก" (มือถือ: เปิดแผ่นตะกร้าก่อน) */
async function openMemberPanel(page: Any, device: Device) {
  await openCartOnMobile(page, device);
  await clickEl(page, tid("pos-reg-member-pick"));
  await visibleEl(page, tid("pos-member-panel"), 0, 10_000).catch(() => {
    throw new StepError("แผงสมาชิก 14A ไม่ขึ้น — registerStatus.memberEnabled ของสาขา QC?");
  });
}
/** ผูกสมาชิก QC ผ่าน 14A (ค้น "089" → แตะแถว) แล้วรอการ์ดครบ (benefits) · มือถือ: ปิดแผ่นตะกร้าเมื่อ closeSheet */
async function attachQcMember(page: Any, device: Device, closeSheet: boolean) {
  await openMemberPanel(page, device);
  await typeInto(page, tid("pos-member-search"), "089");
  await clickEl(page, tid(`pos-member-row-${MEMBERX.id}`)).catch(() => {
    throw new StepError("ค้น 089 แล้วไม่เห็นแถวสมาชิก QC");
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="pos-member-panel"]'), { timeout: 5_000 }).catch(() => {
    throw new StepError("แตะแถวสมาชิกแล้วแผงไม่ปิด");
  });
  await visibleEl(page, tid("pos-member-chip-sub"), 0, 15_000).catch(() => {
    throw new StepError("การ์ดสมาชิกไม่ขึ้นบรรทัดระดับ/แต้ม (registerMemberBenefitsAction)");
  });
  if (device === "mobile" && closeSheet) {
    await page.keyboard.press("Escape");
    await sleep(250);
  }
  await waitPayReady(page);
}
async function runMemberRegState(page: Any, state: MemberStateKey, device: Device): Promise<void> {
  if (MEMBERX.error) throw new StepError(`ข้อมูลสมาชิก QC: ${MEMBERX.error}`);
  if (!MEMBERX.id) throw new StepError("ยังไม่ได้เตรียมสมาชิก QC (prepMemberFixture)");
  if (state === "paydlg-member-capped") {
    if (!QC_IDS.amer) throw new StepError("ไม่พบอเมริกาโน่เย็นของร้าน QC");
    await clickEl(page, tid(`pos-reg-product-${QC_IDS.amer}`));
    await expectLines(page, 1);
    await waitPayReady(page);
  } else if (state === "sale-done-member") {
    if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC");
    for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte]) await clickEl(page, tid(`pos-reg-product-${id}`));
    await expectLines(page, 2);
    await waitPayReady(page);
  } else await addCart3(page, device, true); // fix รอบ 1 V3: สถานะสมาชิกใช้เฉพาะสินค้าที่มีสต็อก
  if (state === "member-panel") {
    await openMemberPanel(page, device);
    await typeInto(page, tid("pos-member-search"), "089");
    await visibleEl(page, tid(`pos-member-row-${MEMBERX.id}`), 0, 10_000).catch(() => {
      throw new StepError("ค้น 089 แล้วไม่เห็นแถวสมาชิก QC");
    });
    await visibleEl(page, tid("pos-member-found"), 0, 5_000);
    return;
  }
  if (state === "member-register") {
    await openMemberPanel(page, device);
    await typeInto(page, tid("pos-member-search"), "0899000002");
    await visibleEl(page, tid("pos-member-empty"), 0, 10_000).catch(() => {
      throw new StepError("ค้น 0899000002 แล้วไม่ขึ้น \"ไม่พบสมาชิก\" (มีสมาชิกเบอร์นี้แล้ว?)");
    });
    const phone = await page.$eval(tid("pos-member-register-phone"), (e: Element) => (e as HTMLInputElement).value).catch(() => "");
    if (phone !== "0899000002") await typeInto(page, tid("pos-member-register-phone"), "0899000002");
    await typeInto(page, tid("pos-member-register-name"), "ทดสอบ สมัครด่วน");
    await clickEl(page, tid("pos-member-register-consent"));
    await clickEl(page, tid("pos-member-register-heard-line"));
    await page
      .waitForFunction(() => !(document.querySelector('[data-testid="pos-member-register-submit"]') as HTMLButtonElement | null)?.disabled, { timeout: 5_000 })
      .catch(() => {
        throw new StepError("กรอกครบแล้วปุ่มสมัครยังปิด");
      });
    // fix รอบ 1 V2: เนื้อแผงเป็นตัวเลื่อน — เลื่อนให้ปุ่มสมัครอยู่ในภาพ (ที่ 390 ต้องเลื่อนในแผง ไม่ใช่หน้า)
    const inPanel = await page.$eval(tid("pos-member-register-submit"), (el: Element) => {
      el.scrollIntoView({ block: "end" });
      const r = el.getBoundingClientRect();
      const box = el.closest('[data-testid="pos-member-panel"]')?.getBoundingClientRect();
      return !!box && r.top >= box.top && r.bottom <= box.bottom + 1;
    });
    if (!inPanel) throw new StepError("ปุ่มสมัครไม่อยู่ในแผงหลังเลื่อน (เนื้อแผงไม่เลื่อน?)");
    await sleep(200);
    return; // 🔴 ไม่กดสมัคร (มติ 11)
  }
  await attachQcMember(page, device, state !== "member-attached");
  if (state === "member-attached") {
    await applyQcCoupon(page, "cart"); // fix รอบ 1 มติ 10: แถวคูปองของภาพ 01
    await waitPayReady(page);
    return;
  }
  await clickPay(page, device);
  await visibleEl(page, tid("pos-reg-paydlg"), 0, 10_000);
  if (state === "sale-done-member") {
    await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
    await clickEl(page, tid("pos-reg-paydlg-confirm"));
    await visibleEl(page, tid("pos-reg-done"), 0, 20_000);
    await visibleEl(page, tid("pos-member-done-points"), 0, 5_000).catch(() => {
      throw new StepError("จอสำเร็จไม่มีช่องแต้มที่ได้รับ (result.member)");
    });
    const no = await page.$eval(tid("pos-reg-done-receipt"), (e: Element) => e.textContent?.trim() ?? "").catch(() => "");
    if (no) MEMBERX.sales.push(no);
    return;
  }
  await visibleEl(page, tid("pos-member-points"), 0, 15_000).catch(() => {
    throw new StepError("จอชำระไม่มีการ์ดแต้ม (benefits.points)");
  });
  if (state === "paydlg-member-points") await applyQcCoupon(page, "pay"); // fix รอบ 1 มติ 10: แถวคูปองของภาพ 02
  await typeInto(page, tid("pos-member-points-input"), "500");
  await clickEl(page, tid("pos-member-points-apply"));
  if (state === "paydlg-member-points") {
    await visibleEl(page, `${tid("pos-member-points")}[data-state="applied"]`, 0, 10_000).catch(() => {
      throw new StepError("ใช้ 500 แต้มแล้วการ์ดไม่เป็น ✓ ใช้แล้ว");
    });
    return;
  }
  await visibleEl(page, tid("pos-member-points-note"), 0, 10_000).catch(() => {
    throw new StepError("500 แต้มเกินเพดานแต่ไม่ขึ้นบรรทัดบอก (POINTS_CAPPED)");
  });
  await page
    .waitForFunction(
      () => {
        const v = Number((document.querySelector('[data-testid="pos-member-points-input"]') as HTMLInputElement | null)?.value ?? "0");
        return v > 0 && v < 500;
      },
      { timeout: 10_000 },
    )
    .catch(() => {
      throw new StepError("ช่องแต้มไม่ถูกแก้เป็นจำนวนที่ใช้ได้ (allowedPoints < 500)");
    });
}

const TAXINV_REG_STATES: ReadonlySet<string> = new Set(["taxinvoice-dialog", "taxinvoice-set"]);
const TAXINV_BILL_STATES: ReadonlySet<string> = new Set(["bill-taxinvoice-requested", "bill-taxinvoice-issued"]);
/** คีย์ชุดวันนี้ (วันที่ไทย) — รอบซ้ำวันเดียวกันใช้บิลเดิม (ไม่ออกใบ TX เพิ่ม) */
const TAXINV_PREFIX = `posqc-p113u-${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "")}-`;
const TAXINV_DEVICE_ID = `posqc-vis-taxinv-${process.pid}`;
const TAXINV = {
  abbReady: false,
  error: null as string | null,
  billsError: null as string | null,
  shiftId: "",
  openedShift: false,
  reqSale: "",
  reqReceipt: "",
  requestId: "",
  issSale: "",
  issReceipt: "",
  /** ใบ TAX_INVOICE ที่ออกให้บิล bill-taxinvoice-issued (ค้างในบัญชี QC4 — บันทึกไว้ตามมติ 9) */
  docId: "",
  docNo: "" as string | null,
  reused: [] as string[],
  /** fix F5: คำขอ REQUESTED ค้างจากรอบก่อนที่ลบก่อนสร้างคำขอของรอบนี้ */
  leftover: 0,
  close: null as null | { ok: boolean; detail: string },
  cleanup: null as null | { requests: number; outbox: number; error?: string },
};
/** สมุด QC พร้อมออกใบกำกับ (registerStatus.taxInvoiceEligible) ก่อนเปิดหน้า — พังไม่โยน (สถานะ 15A ตกพร้อมเหตุผล) */
async function prepTaxInvoiceBook(): Promise<void> {
  if (TAXINV.abbReady || TAXINV.error) return;
  try {
    await ensureAbbBook();
    if (!RPUB.abb) throw new StepError("POS ของร้าน QC ไม่ผูกสมุดบัญชี — ออกใบกำกับไม่ได้");
    TAXINV.abbReady = true;
  } catch (e) {
    TAXINV.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function runTaxInvoiceRegState(page: Any, state: StateKey, device: Device): Promise<void> {
  if (TAXINV.error) throw new StepError(`สมุด QC: ${TAXINV.error}`);
  await addCart3(page, device);
  if (state === "taxinvoice-dialog") {
    await openCartOnMobile(page, device);
    await clickEl(page, tid("pos-reg-tax-invoice"));
  } else {
    await clickPay(page, device);
    await visibleEl(page, tid("pos-reg-paydlg"), 0, 10_000);
    await clickEl(page, tid("pos-taxinv-toggle"));
  }
  await visibleEl(page, tid("pos-taxinv-dialog"), 0, 10_000).catch(async () => {
    const toast = await page.$eval(tid("pos-reg-toast"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
    throw new StepError(`กล่อง 15A ไม่ขึ้น${toast ? ` (ข้อความ: ${toast})` : ""} — registerStatus.taxInvoiceEligible ของร้าน QC?`);
  });
  await clickEl(page, tid("pos-taxinv-kind-juristic"));
  await typeInto(page, tid("pos-taxinv-taxid"), TAXINV_BUYER.taxId);
  await visibleEl(page, tid("pos-taxinv-taxid-ok"), 0, 5_000).catch(() => {
    throw new StepError("พิมพ์เลข QC แล้วไม่ขึ้น ✓ (pos-taxinv-taxid-ok)");
  });
  // ปุ่ม DBD (นิติบุคคล + เลขถูก) หรือ "กรอกเอง" เมื่อรอบนี้รู้แล้วว่าไม่มีกุญแจ — ไม่กดค้น (QC ไม่มีกุญแจ · ไม่ยิงเครือข่ายจริง)
  const dbd = await page.$(tid("pos-taxinv-dbd"));
  const manual = await page.$(tid("pos-taxinv-dbd-note"));
  if (!dbd && !manual) throw new StepError("ไม่มีปุ่ม DBD และไม่มีข้อความกรอกเอง");
  if (state === "taxinvoice-dialog") return;
  await typeInto(page, tid("pos-taxinv-name"), TAXINV_BUYER.name);
  await typeInto(page, tid("pos-taxinv-address"), TAXINV_BUYER.address);
  await clickEl(page, tid("pos-taxinv-submit"));
  await page.waitForFunction(() => !document.querySelector('[data-testid="pos-taxinv-dialog"]'), { timeout: 5_000 }).catch(async () => {
    const err = await page.$eval(tid("pos-taxinv-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
    throw new StepError(`บันทึก 15A แล้วกล่องไม่ปิด${err ? ` (${err})` : ""}`);
  });
  await visibleEl(page, tid("pos-taxinv-footer-line"), 0, 5_000).catch(() => {
    throw new StepError("ท้ายจอชำระไม่ขึ้นแถวผู้ซื้อ (pos-taxinv-footer-line)");
  });
}
/** บิลกาแฟ ABB ของวันนี้ตามคีย์ (ใช้ซ้ำ) — want: req = PAID ไม่คืน ยังไม่ออก · iss = ออกเต็มรูปแล้ว */
async function existingTaxInvBill(kind: "req" | "iss"): Promise<{ id: string; receiptNo: string | null; docId: string | null } | null> {
  const start = new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`));
  const rows = await prisma.posSale.findMany({
    where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", createdAt: { gte: start }, OR: [{ idempotencyKey: { startsWith: `${TAXINV_PREFIX}${kind}` } }, { idempotencyKey: { startsWith: `reg2:${TAXINV_PREFIX}${kind}` } }] },
    select: { id: true, receiptNo: true, status: true, refundedSatang: true, taxInvoiceDocId: true },
    orderBy: { createdAt: "desc" },
  });
  const r = rows.find((x) => x.status === "PAID" && x.refundedSatang === 0 && (kind === "iss" ? !!x.taxInvoiceDocId : !x.taxInvoiceDocId));
  return r ? { id: r.id, receiptNo: r.receiptNo, docId: r.taxInvoiceDocId } : null;
}
/** บิลของสถานะใบกำกับในลิ้นชัก (ก่อนเปิด chromium) — ผ่านบริการจริง: ขาย → ระบายคิว (ABB) → คำขอ P1.11 / issueFullTaxInvoice · พังไม่โยน */
async function seedTaxInvBillsOnce(): Promise<void> {
  if (TAXINV.reqSale || TAXINV.issSale || TAXINV.billsError) return;
  const need = new Set(jobs.filter((j) => j.state && TAXINV_BILL_STATES.has(j.state)).map((j) => (j.state === "bill-taxinvoice-requested" ? "req" : "iss")));
  if (!need.size) return;
  try {
    await prepTaxInvoiceBook();
    if (TAXINV.error) throw new StepError(`สมุด QC: ${TAXINV.error}`);
    const { openShift } = await import("@/lib/modules/pos/shift");
    const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
    const { issueFullTaxInvoice } = await import("@/lib/modules/pos/tax-invoice");
    const { requestFullTaxInvoice } = await import("@/lib/modules/pos/receipt-tax-request");
    const { ensureReceiptToken } = await import("@/lib/modules/pos/receipt-token");
    const account = await import("@/lib/modules/account");
    const actor = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId, deviceId: TAXINV_DEVICE_ID };
    const have: Partial<Record<"req" | "iss", { id: string; receiptNo: string | null; docId: string | null }>> = {};
    for (const k of need) {
      const e = await existingTaxInvBill(k);
      if (e) {
        have[k] = e;
        TAXINV.reused.push(k);
      }
    }
    const missing = [...need].filter((k) => !have[k]);
    if (missing.length) {
      const op = await openShift(ctx, actor, { deviceId: TAXINV_DEVICE_ID, deviceLabel: "เครื่องภาพใบกำกับ QC", floatSatang: 100000 });
      if (!op.ok) throw new StepError(`เปิดกะของเครื่องภาพใบกำกับไม่ได้: ${op.code}`);
      TAXINV.shiftId = op.shift.id;
      TAXINV.openedShift = true;
      const prods = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, systemId: SYS, archivedAt: null }, select: { id: true, name: true } });
      const idOf = (n: string) => {
        const id = prods.find((r) => r.name === n)?.id;
        if (!id) throw new StepError(`ไม่พบสินค้า QC "${n}" (seed-pos-qc)`);
        return id;
      };
      for (const k of missing) {
        const cart = { lines: [{ productId: idOf("ลาเต้ร้อน"), qty: 2 }, { productId: idOf("อเมริกาโน่เย็น"), qty: 1 }] };
        const q = await quoteRegisterCart(ctx, actor, cart);
        if (!q.ok) throw new StepError(`quote บิล ${k}: ${q.code}`);
        const r = await submitRegisterSale(ctx, actor, { ...cart, idempotencyKey: `${TAXINV_PREFIX}${k}-${process.pid}`, expectedGrandTotalSatang: q.grandTotalSatang, payMethods: [{ type: "CASH", amountSatang: q.grandTotalSatang }], cashReceivedSatang: q.grandTotalSatang } as never);
        if (!r.ok) throw new StepError(`ขายบิล ${k}: ${r.code}`);
        have[k] = { id: r.saleId, receiptNo: r.receiptNo, docId: null };
      }
      try {
        const { drainAll } = await import("@/lib/outbox-consumers");
        await drainAll(); // ใบกำกับอย่างย่อของบิลใหม่ (ออกเต็มรูปทีหลังต้องมี ABB ก่อน — ไม่งั้น ACCOUNT_PENDING)
      } catch {
        /* เซิร์ฟเวอร์ QC ระบายเองภายหลัง */
      }
    }
    if (have.req) {
      TAXINV.reqSale = have.req.id;
      TAXINV.reqReceipt = have.req.receiptNo ?? "";
      const row = await prisma.posSale.findFirst({ where: { id: have.req.id, tenantId: T.tenantId }, select: { publicToken: true } });
      const tok = row?.publicToken ?? (await ensureReceiptToken(T.tenantId, have.req.id));
      if (!tok) throw new StepError("บิล req ไม่มีโทเคนใบเสร็จ");
      // fix F5: รอบที่ถูก kill ทิ้งคำขอ REQUESTED ค้างบนบิลที่ใช้ซ้ำ ⇒ คำขอใหม่ได้ ALREADY_REQUESTED ทั้งวัน — ลบคำขอค้าง (+ outbox ของมัน) ก่อน
      const left = await prisma.posTaxInvoiceRequest.findMany({ where: { tenantId: T.tenantId, saleId: have.req.id, status: "REQUESTED" }, select: { id: true } });
      for (const l of left) await prisma.outboxEvent.deleteMany({ where: { tenantId: T.tenantId, type: "pos.receipt.taxInvoiceRequested", payload: { path: ["requestId"], equals: l.id } } });
      if (left.length) TAXINV.leftover = (await prisma.posTaxInvoiceRequest.deleteMany({ where: { tenantId: T.tenantId, id: { in: left.map((l) => l.id) } } })).count;
      const rq = await requestFullTaxInvoice(tok, { name: TAXINV_BUYER.name, taxId: TAXINV_BUYER.taxId, branchCode: TAXINV_BUYER.branchCode, address: TAXINV_BUYER.address });
      if (!rq.ok) throw new StepError(`คำขอใบกำกับ (P1.11): ${rq.code}`);
      TAXINV.requestId = rq.requestId;
    }
    if (have.iss) {
      TAXINV.issSale = have.iss.id;
      TAXINV.issReceipt = have.iss.receiptNo ?? "";
      if (have.iss.docId) TAXINV.docId = have.iss.docId;
      else {
        const r = await issueFullTaxInvoice({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { saleId: have.iss.id, buyer: TAXINV_BUYER });
        if (!r.ok) throw new StepError(`issueFullTaxInvoice: ${r.code}`);
        TAXINV.docId = r.docId;
      }
      const ref = await account.posSaleAccountingRef({ tenantId: T.tenantId, sourceSystemId: SYS, refId: have.iss.id });
      TAXINV.docNo = ref && ref.docId === TAXINV.docId ? ref.docNo : null;
    }
  } catch (e) {
    TAXINV.billsError = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** finally/signal: ลบคำขอ P1.11 ของรอบนี้ (+ outbox ของคำขอ) · ปิดกะของเครื่องภาพใบกำกับ — เรียกซ้ำได้ · ไม่โยน */
async function cleanupTaxInv(): Promise<void> {
  if (TAXINV.cleanup) return;
  try {
    let requests = 0;
    let outbox = 0;
    if (TAXINV.requestId) {
      outbox += (await prisma.outboxEvent.deleteMany({ where: { tenantId: T.tenantId, type: "pos.receipt.taxInvoiceRequested", payload: { path: ["requestId"], equals: TAXINV.requestId } } })).count;
      requests = (await prisma.posTaxInvoiceRequest.deleteMany({ where: { id: TAXINV.requestId, tenantId: T.tenantId } })).count;
      TAXINV.cleanup = { requests, outbox };
    } else if (TAXINV.reqSale || TAXINV.issSale) TAXINV.cleanup = { requests, outbox };
  } catch (e) {
    TAXINV.cleanup = { requests: 0, outbox: 0, error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
  if (!TAXINV.close && TAXINV.openedShift && TAXINV.shiftId) TAXINV.close = await closeShiftAsOwner(TAXINV.shiftId, "taxinv-close");
}
/** หน้าบิล: ค้นด้วยเลขบิลแล้วแตะบิล (บิลภาพอาจไม่อยู่หน้าแรก) → ลิ้นชัก */
async function openBillBySearch(page: Any, saleId: string, receiptNo: string): Promise<void> {
  await visibleEl(page, tid("pos-bills-list"), 0, 15_000);
  if (receiptNo) {
    await typeInto(page, tid("pos-bills-search"), receiptNo);
    await sleep(900);
  }
  await visibleEl(page, `[data-bill-id="${saleId}"]`, 0, 15_000).catch(() => {
    throw new StepError(`ไม่เห็นบิล ${receiptNo || saleId} ในรายการ`);
  });
  await clickEl(page, `[data-bill-id="${saleId}"]`);
  await visibleEl(page, tid("pos-bills-timeline"), 0, 15_000).catch(() => {
    throw new StepError("แตะบิลแล้วไม่เห็นลิ้นชักบิล (pos-bills-timeline)");
  });
}
async function runTaxInvoiceBillState(page: Any, state: BillsStateKey): Promise<void> {
  if (TAXINV.billsError) throw new StepError(`บิลภาพใบกำกับ: ${TAXINV.billsError}`);
  const req = state === "bill-taxinvoice-requested";
  const id = req ? TAXINV.reqSale : TAXINV.issSale;
  if (!id) throw new StepError("ไม่มีบิลภาพใบกำกับ");
  await openBillBySearch(page, id, req ? TAXINV.reqReceipt : TAXINV.issReceipt);
  await visibleEl(page, tid(req ? "pos-taxinv-bill-requested" : "pos-taxinv-bill-issued"), 0, 10_000).catch(() => {
    throw new StepError(`ลิ้นชักไม่ขึ้นแถว ${req ? "คำขอใบกำกับ (pos-taxinv-bill-requested)" : "ใบกำกับเต็มรูป (pos-taxinv-bill-issued)"}`);
  });
  if (req) {
    const btn = await page.$(tid("pos-taxinv-request-issue"));
    if (userKey === "owner" && !btn) throw new StepError("เจ้าของไม่เห็นปุ่มออกใบกำกับ (pos-taxinv-request-issue)");
    if (userKey !== "owner" && btn) throw new StepError("แคชเชียร์ไม่ควรเห็นปุ่มออกใบกำกับ");
  }
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
/** HF-P1CLOSE fix รอบ 1: สถานะหน้าบิลที่ต้องค้นเลขบิลเป้าหมาย (เป้าหมายตกหน้าแรก) — ลงท้ายรายงาน */
const BILLS_SEARCHED: string[] = [];
/** แตะบิลเป้าหมาย (แถวที่ md+ · การ์ดที่ 390) แล้วรอลิ้นชักที่มีไทม์ไลน์ */
async function openTargetBill(page: Any): Promise<void> {
  await visibleEl(page, tid("pos-bills-list"), 0, 15_000);
  await clickEl(page, `[data-bill-id="${BILLS.target}"]`);
  await visibleEl(page, tid("pos-bills-timeline"), 0, 15_000).catch(() => {
    throw new StepError("แตะบิลแล้วไม่เห็นลิ้นชักบิล (pos-bills-timeline)");
  });
}
async function runBillsState(page: Any, state: BillsStateKey): Promise<void> {
  if (TAXINV_BILL_STATES.has(state)) return runTaxInvoiceBillState(page, state); // POS P1.13U
  if (state === "bills-channels" || state === "bills-drawer-commission") return runP21uBillsState(page, state); // POS P2.1U
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
  // HF-P1CLOSE fix รอบ 1 (ภาคผนวก): ชุดบิลภาพของวันนี้ถูกใช้ซ้ำ + บิลใหม่กว่าดันบิลเป้าหมายตกหน้าแรก (10 แถว/หน้า) ⇒
  //   ไม่อยู่หน้าแรก = พิมพ์เลขบิลของเป้าหมายลงช่องค้นหา (pos-bills-search · ค้นเลขบิลขึ้นต้น) แล้วรอรายการที่กรองแล้ว ·
  //   อยู่หน้าแรกแล้ว = ไม่ค้น (ภาพเหมือนรายการวันนี้) · นับ ≥ 6 แถวจากหน้าแรกก่อนค้นเสมอ ◂
  const targetSel = `[data-bill-id="${BILLS.target}"]`;
  const onPage1 = await visibleEl(page, targetSel, 0, 8_000).then(() => true).catch(() => false);
  const n = await page.$$eval('[data-testid="pos-bills-row"],[data-testid="pos-bills-card"]', (els: Element[]) => els.filter((e) => e.getClientRects().length > 0).length).catch(() => 0);
  if (n < 6) throw new StepError(`รายการวันนี้มี ${n} บิล (คาด ≥ 6)`);
  if (!onPage1) {
    const rn = (await prisma.posSale.findFirst({ where: { id: BILLS.target, tenantId: T.tenantId }, select: { receiptNo: true } }))?.receiptNo;
    if (!rn) throw new StepError("บิลเป้าหมายไม่อยู่หน้าแรกและไม่มีเลขบิลให้ค้น");
    await typeInto(page, tid("pos-bills-search"), rn);
    await visibleEl(page, targetSel, 0, 15_000).catch(() => {
      throw new StepError(`ไม่เห็นบิลเป้าหมายในหน้าแรก และค้นเลขบิล ${rn} แล้วก็ไม่เห็น`);
    });
    BILLS_SEARCHED.push(`${state}@${rn}`);
  }
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
/**
 * สมุด QC ที่ผูก POS ออกใบกำกับอย่างย่อได้ (ย้ายออกจาก seedRpubOnce ใน P1.13U — ใช้ร่วมกับสถานะใบกำกับเต็มรูปของหน้าขาย/หน้าบิล):
 *   เปิด posAbbreviated + ตั้ง taxId ชั่วคราว (คืนค่าเดิมใน cleanRpub) · เรียกซ้ำได้ (ครั้งที่สอง = ตรวจผลเดิม ไม่ทับค่าที่ต้องคืน) · ไม่พร้อม = โยน StepError
 */
async function ensureAbbBook(): Promise<void> {
  if (RPUB.abb) {
    if (!RPUB.abb.vatRegistered || !RPUB.abb.posAbbreviatedInvoice || !RPUB.abb.hasTaxId)
      throw new StepError(`สมุด QC ยังออกใบกำกับอย่างย่อไม่ได้ (vatRegistered ${RPUB.abb.vatRegistered} · posAbbreviatedInvoice ${RPUB.abb.posAbbreviatedInvoice} · taxId ${RPUB.abb.hasTaxId})`);
    return;
  }
  // รอบ 2 (มติ 3b): ใบกำกับอย่างย่อต้องเปิดที่สมุดที่ผูก POS — เปิด posAbbreviated ชั่วคราวผ่านตัวบันทึกตั้งค่าบัญชีเดิม (saveDocSettings) · คืนค่าใน finally
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
/** สร้างบิลชุดภาพครั้งเดียว (ก่อนเปิด chromium) ผ่านบริการหน้าขาย — พังไม่โยน (RPUB.error · ทุกสถานะตกพร้อมเหตุผล) */
async function seedRpubOnce(): Promise<void> {
  if (RPUB.seeded || RPUB.error) return;
  const need = new Set(rpubPlan.map((st) => st.bill).filter((b) => b !== "none"));
  try {
    if (need.size) {
      await ensureAbbBook(); // รอบ 2 (มติ 3b) · รอบ 3 (มติ 2) — ดู ensureAbbBook
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
  if (RPUB.cleanup || (!rpubOn && !RPUB.abb)) return; // P1.13U: สถานะใบกำกับเต็มรูปใช้ ensureAbbBook ด้วย ⇒ คืนค่าสมุดแม้ไม่ได้ถ่ายหน้าใบเสร็จ
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
    if (jobs.some((j) => isPaydoneState(j.state))) {
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
  // POS P1.18U ▸ แท็บที่เหลือไม่ใช้เครื่อง QC ของหน้าตั้งค่า ◂
  if (isP118uSettings(state)) {
    await visibleEl(page, tid("pos-settings-root"), 0, 15_000).catch(() => {
      throw new StepError("หน้าตั้งค่าไม่ขึ้น (pos-settings-root)");
    });
    return runP118uSettingsState(page, state);
  }
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
  if (state === "paydone-print-failed") return runPaydonePrintFailed(page, device); // POS HF-P1CLOSE
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

// ═══════════════════ POS P1.18U ▸ ข้อมูล + ขั้นตอนของแท็บตั้งค่าที่เหลือ · ประวัติ · ภาพ 19ก (ร้านไม่มีสินค้า) ═══════════════════
const P118U = {
  history: null as null | { before: number; edits: number; error?: string },
  empty: { systemId: "", deviceRowId: "", created: [] as string[], error: null as string | null, cleanup: null as null | { ok: boolean; detail: string } },
};
/** ลิ้นชักประวัติต้องมี ≥ 3 แถว — ไม่ถึง = แก้ค่าทั่วไปจริง 4 ครั้งผ่านตัวเขียน (เจ้าของร้าน · ค่าสุดท้ายเท่าเดิม) · ถึงแล้ว = ไม่เขียน · พังไม่โยน */
async function seedHistoryOnce(): Promise<void> {
  if (P118U.history) return;
  try {
    const { posSettingsHistory, updatePosGeneralSettings } = await import("@/lib/modules/pos/settings-general");
    const { posSettingsOverview } = await import("@/lib/modules/pos/settings-overview");
    const actor = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS };
    const h = await posSettingsHistory(ctx, actor, {});
    const before = h.ok ? h.items.length : 0;
    let edits = 0;
    if (before < 3) {
      const o = await posSettingsOverview({ ...ctx, unitId }, actor, {});
      if (!o.ok) throw new StepError(`อ่านค่าทั่วไปไม่ได้: ${o.code}`);
      const g = o.general;
      const held2 = g.heldCartExpireDays >= 365 ? g.heldCartExpireDays - 1 : g.heldCartExpireDays + 1;
      const lock2 = g.autoLockMinutes >= 60 ? g.autoLockMinutes - 1 : g.autoLockMinutes + 1;
      for (const patch of [{ heldCartExpireDays: held2 }, { heldCartExpireDays: g.heldCartExpireDays }, { autoLockMinutes: lock2 }, { autoLockMinutes: g.autoLockMinutes }]) {
        const r = await updatePosGeneralSettings(ctx, actor, patch);
        if (!r.ok) throw new StepError(`แก้ค่าทั่วไปไม่ได้: ${r.code}${r.field ? ` (${r.field})` : ""}`);
        edits++;
      }
    }
    P118U.history = { before, edits };
  } catch (e) {
    P118U.history = { before: -1, edits: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}
/** path ของภาพ 19ก (ระบบ POS ของ fixture) */
const emptyPath = () => EMPTY_PATH_PLACEHOLDER.replace("<empty-pos>", P118U.empty.systemId || "missing");
/**
 * fixture ภาพ 19ก: สาขา SHOP + ระบบ POS ที่ไม่มีสินค้า (ธงหน้าขายใหม่ · ไม่บังคับเปิดกะ) + เครื่องของรอบนี้ — find-or-create (id/ชื่อตายตัว) · พังไม่โยน
 *  ฟังก์ชันโมดูล: createSystem · linkUnit · updatePosGeneralSettings · registerDevice ·
 *  ไม่มีฟังก์ชันโมดูล: แถว BusinessUnit (คำสั่งเดียวกับ createSystemAction / DNA CREATE_UNIT) + ธง settings.pos.registerV2 (ขั้นข้อมูลเดียวกับ seed-pos-qc / P6.1)
 */
async function seedEmptyCatalogueOnce(): Promise<void> {
  const E = P118U.empty;
  if (E.systemId || E.error) return;
  try {
    const sysSvc = await import("@/lib/modules/system/service");
    const { updatePosGeneralSettings } = await import("@/lib/modules/pos/settings-general");
    const { registerDevice } = await import("@/lib/modules/pos/device");
    const actor = await ownerActor();
    await sweepStaleEmptyCatalogue(); // POS P1.18U ▸ F7 ◂
    const unit = await prisma.businessUnit.findFirst({ where: { id: EMPTY_UNIT.id, tenantId: T.tenantId }, select: { id: true } });
    if (!unit) {
      await prisma.businessUnit.create({ data: { id: EMPTY_UNIT.id, tenantId: T.tenantId, type: "SHOP", name: EMPTY_UNIT.name, slug: EMPTY_UNIT.slug } });
      E.created.push("unit");
    }
    // POS P1.18U ▸ F7: ระบบของสาขารอบนี้เท่านั้น (ลิงก์ของสาขา pid) — ไม่หยิบระบบชื่อเดียวกันของรอบอื่น ◂
    const own = await prisma.appSystemUnit.findFirst({ where: { tenantId: T.tenantId, unitId: EMPTY_UNIT.id, type: "POS" }, select: { systemId: true } });
    let sys = own ? await prisma.appSystem.findFirst({ where: { id: own.systemId, tenantId: T.tenantId, type: "POS", name: EMPTY_POS_NAME }, select: { id: true, settings: true } }) : null;
    if (!sys) {
      const c = await sysSvc.createSystem(T.tenantId, "POS", EMPTY_POS_NAME);
      sys = { id: c.id, settings: c.settings };
      E.created.push("system");
    }
    E.systemId = sys.id;
    const link = await prisma.appSystemUnit.findFirst({ where: { tenantId: T.tenantId, unitId: EMPTY_UNIT.id, type: "POS" }, select: { systemId: true } });
    if (link?.systemId !== sys.id) await sysSvc.linkUnit(T.tenantId, sys.id, EMPTY_UNIT.id);
    const cur = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, Any>) : {};
    if (cur.pos?.registerV2 !== true) await prisma.appSystem.update({ where: { id: sys.id }, data: { settings: { ...cur, pos: { ...(cur.pos ?? {}), registerV2: true } } } });
    const g = await updatePosGeneralSettings({ tenantId: T.tenantId, systemId: sys.id }, actor, { shift: { requiredRegister: false } });
    if (!g.ok) throw new StepError(`ปิดการบังคับเปิดกะของระบบ fixture ไม่ได้: ${g.code}`);
    const d = await registerDevice({ tenantId: T.tenantId, systemId: sys.id, unitId: EMPTY_UNIT.id }, actor, { name: "เครื่องภาพ 19ก (QC)", deviceCode: EMPTY_DEVICE_ID });
    if (!d.ok) throw new StepError(`ลงทะเบียนเครื่องของสาขา fixture ไม่ได้: ${d.code}`);
    E.deviceRowId = d.device.id;
    const n = await prisma.posProduct.count({ where: { tenantId: T.tenantId, systemId: sys.id, archivedAt: null } });
    if (n) throw new StepError(`ระบบ fixture มีสินค้า ${n} รายการ (ต้องว่าง)`);
  } catch (e) {
    E.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** finally: ลบ fixture ภาพ 19ก ทั้งชุด (เครื่อง · ลิงก์ · ระบบ · สาขา) — เก็บกวาด · เรียกซ้ำได้ · ไม่โยน */
async function cleanupEmptyCatalogue(): Promise<void> {
  const E = P118U.empty;
  if (E.cleanup || (!E.systemId && !E.created.length)) return;
  const parts: string[] = [];
  let ok = true;
  try {
    parts.push(await deleteEmptyCatalogueSet(EMPTY_UNIT.id, E.systemId || null, E.deviceRowId ? [E.deviceRowId] : []));
  } catch (e) {
    ok = false;
    parts.push(`ลบ fixture ภาพ 19ก ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  E.cleanup = { ok, detail: `P1.18U fixture 19ก: ${parts.join(" · ")}` };
}
/**
 * POS P1.18U ▸ F7: ลบชุด fixture 19ก ของสาขาหนึ่ง (เครื่อง · ลิงก์ · ระบบ · สาขา) + แถว AuditLog ที่ชี้ไปยังแถวที่ลบ (targetId ของระบบ/เครื่อง/สาขา —
 *   pos.settings.updated ของ updatePosGeneralSettings · pos.device.register ของ registerDevice) — ระบบต้องผูกกับสาขานี้ + ชื่อ fixture เท่านั้น ◂
 */
async function deleteEmptyCatalogueSet(unitId: string, knownSystemId: string | null, knownDeviceIds: string[]): Promise<string> {
  const links = await prisma.appSystemUnit.findMany({ where: { tenantId: T.tenantId, unitId, type: "POS" }, select: { systemId: true } });
  const sysIds = [...new Set([...(knownSystemId ? [knownSystemId] : []), ...links.map((l) => l.systemId)])];
  const mine = sysIds.length ? await prisma.appSystem.findMany({ where: { id: { in: sysIds }, tenantId: T.tenantId, type: "POS", name: EMPTY_POS_NAME }, select: { id: true } }) : [];
  const sids = mine.map((x) => x.id);
  const devs = sids.length ? await prisma.posDevice.findMany({ where: { tenantId: T.tenantId, systemId: { in: sids }, unitId }, select: { id: true } }) : [];
  const devIds = [...new Set([...knownDeviceIds, ...devs.map((d) => d.id)])];
  const dv = sids.length ? await prisma.posDevice.deleteMany({ where: { tenantId: T.tenantId, systemId: { in: sids }, unitId } }) : { count: 0 };
  const ln = sids.length ? await prisma.appSystemUnit.deleteMany({ where: { tenantId: T.tenantId, systemId: { in: sids } } }) : { count: 0 };
  const sy = sids.length ? await prisma.appSystem.deleteMany({ where: { id: { in: sids }, tenantId: T.tenantId, type: "POS", name: EMPTY_POS_NAME } }) : { count: 0 };
  const un = await prisma.businessUnit.deleteMany({ where: { id: unitId, tenantId: T.tenantId } });
  const au = await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, targetId: { in: [...sids, ...devIds, unitId] } } });
  return `เครื่อง ${dv.count} · ลิงก์ ${ln.count} · ระบบ ${sy.count} · สาขา ${un.count} · AuditLog ${au.count}`;
}
/** POS P1.18U ▸ F7: ซาก fixture 19ก ของรอบที่ถูก kill (สาขา `posqc-vis-empty-*` อายุ > 1 ชม.) — ไม่แตะของรอบที่ยังรันอยู่ · พังไม่โยน ◂ */
async function sweepStaleEmptyCatalogue(): Promise<void> {
  try {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await prisma.businessUnit.findMany({ where: { tenantId: T.tenantId, id: { startsWith: EMPTY_PREFIX, not: EMPTY_UNIT.id }, createdAt: { lt: old } }, select: { id: true } });
    for (const u of stale) console.log(`  🧹 ซาก fixture 19ก ${u.id}: ${await deleteEmptyCatalogueSet(u.id, null, [])}`);
  } catch (e) {
    console.log(`  ⚠️ กวาดซาก fixture 19ก ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
}
async function runEmptyCatalogue(page: Any): Promise<void> {
  if (P118U.empty.error || !P118U.empty.systemId) throw new StepError(`ไม่มี fixture ภาพ 19ก: ${P118U.empty.error ?? "ยังไม่ได้สร้าง"}`);
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ของระบบ fixture ไม่ขึ้น (pos-reg-root)");
  });
  await visibleEl(page, tid("pos-reg-empty"), 0, 15_000).catch(() => {
    throw new StepError("ไม่เห็นสถานะร้านไม่มีสินค้า (pos-reg-empty)");
  });
  await visibleEl(page, tid("pos-reg-empty-add-product"), 0, 5_000).catch(() => {
    throw new StepError("เจ้าของร้านไม่เห็นปุ่มเพิ่มสินค้า (pos-reg-empty-add-product)");
  });
  // แถบ "ยังไม่มีใครตั้ง PIN" ของสาขา fixture ไม่อยู่ในภาพ 19ก — ปิดแถบ (จำใน sessionStorage ของแท็บนี้)
  const nopin = await visibleEl(page, tid("pos-staff-nopin-dismiss"), 0, 2_000).catch(() => null);
  if (nopin) await clickEl(page, tid("pos-staff-nopin-dismiss"));
}
async function runRegisterEn(page: Any, device: Device): Promise<void> {
  if (device === "mobile") {
    // หัวมือถือ (05ก) ไม่มีตัวสลับภาษา — ตั้งคุกกี้ภาษาแบบเดียวกับ setUiLocaleAction แล้วโหลดใหม่
    const host = new URL(BASE).hostname;
    await page.setCookie(...["LOCALE", "lang"].map((name) => ({ name, value: "en", domain: host, path: "/" })));
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  } else {
    await clickEl(page, tid("pos-locale-switch-en"));
    await page.waitForSelector('[data-testid="pos-locale-switch-en"][aria-pressed="true"]', { timeout: 15_000 }).catch(() => {
      throw new StepError("แตะ EN แล้วจอไม่เปลี่ยนเป็นภาษาอังกฤษ (pos-locale-switch-en aria-pressed)");
    });
  }
  await page.waitForFunction(() => document.documentElement.lang === "en" || !!document.querySelector('[data-testid="pos-locale-switch-en"][aria-pressed="true"]'), { timeout: 15_000 }).catch(() => undefined);
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
}
/** หลังถ่าย register-en: คืนภาษาไทยให้งานถัดไปของรอบภาษาไทย (คุกกี้ LOCALE/lang อยู่ใน context ร่วม) */
async function restoreThaiLocale(page: Any): Promise<void> {
  if (LOCALE_EN) return;
  await page.deleteCookie({ name: "LOCALE", url: BASE }, { name: "lang", url: BASE }).catch(() => undefined);
}
async function runP118uSettingsState(page: Any, state: P118uSettingsKey): Promise<void> {
  const cashier = userKey === "cashier";
  switch (state) {
    case "settings-general":
      await visibleEl(page, tid("pos-settings-general-register"), 0, 15_000).catch(() => {
        throw new StepError("แท็บทั่วไปไม่ขึ้น (pos-settings-general-register)");
      });
      await visibleEl(page, tid("pos-settings-general-language"), 0, 5_000);
      if (cashier) await visibleEl(page, tid("pos-settings-readonly"), 0, 5_000).catch(() => {
        throw new StepError("แคชเชียร์ไม่เห็นป้ายอ่านอย่างเดียว (pos-settings-readonly)");
      });
      else await visibleEl(page, tid("pos-settings-general-save-register"), 0, 5_000);
      return;
    case "settings-staff":
    case "settings-staff-pin":
      if (cashier) {
        await visibleEl(page, tid("pos-settings-refusal"), 0, 10_000).catch(() => {
          throw new StepError("แคชเชียร์ไม่เห็นการ์ดปฏิเสธของแท็บพนักงาน (pos-settings-refusal)");
        });
        return;
      }
      await visibleEl(page, tid("pos-settings-staff-matrix"), 0, 15_000).catch(() => {
        throw new StepError("ตารางสิทธิ์ไม่ขึ้น (pos-settings-staff-matrix)");
      });
      await visibleEl(page, tid("pos-settings-staff-pins"), 0, 5_000);
      if (state === "settings-staff") return;
      await clickEl(page, tidPrefix("pos-settings-staff-pin-open-")).catch(() => {
        throw new StepError("ไม่มีแถวพนักงานให้ตั้ง PIN (pos-settings-staff-pin-open-*)");
      });
      await visibleEl(page, tid("pos-settings-staff-pin"), 0, 5_000);
      for (const k of ["1", "3", "5"]) await clickEl(page, tid(`pos-settings-staff-pin-key-${k}`));
      return;
    case "settings-shark":
    case "settings-shark-account-off":
    case "settings-history":
      await visibleEl(page, tid("pos-settings-shark-count"), 0, 20_000).catch(() => {
        throw new StepError("การ์ดการเชื่อมต่อไม่ขึ้น (pos-settings-shark-count)");
      });
      await visibleEl(page, tid("pos-settings-card-member"), 0, 5_000);
      await visibleEl(page, tid("pos-settings-card-receipt"), 0, 5_000);
      if (state === "settings-shark") return;
      if (state === "settings-history") {
        if (cashier) {
          if ((await page.$(tid("pos-settings-history-open"))) || (await page.$(tid("pos-settings-history-shell-open")))) throw new StepError("แคชเชียร์เห็นปุ่มประวัติ (ต้องไม่เห็น — ไม่มี pos.settings.manage)");
          return;
        }
        if (P118U.history?.error) throw new StepError(`ข้อมูลประวัติ: ${P118U.history.error}`);
        await clickEl(page, tid("pos-settings-history-open"));
        await visibleEl(page, tid("pos-settings-history"), 0, 5_000);
        await visibleEl(page, tid("pos-settings-history-row"), 2, 15_000).catch(() => {
          throw new StepError("ลิ้นชักประวัติมีไม่ถึง 3 แถว");
        });
        return;
      }
      // settings-shark-account-off
      {
        const sw = await visibleEl(page, tid("pos-settings-account-switch"), 0, 5_000).catch(() => {
          throw new StepError("การ์ดบัญชีไม่มีสวิตช์ (ACCOUNT ไม่ LINKED/OFF ในร้าน QC?)");
        });
        const st = (await sw.evaluate((el: Element) => ({ on: el.getAttribute("aria-checked") === "true", disabled: (el as HTMLButtonElement).disabled }))) as { on: boolean; disabled: boolean };
        if (cashier) {
          if (!st.disabled) throw new StepError("แคชเชียร์กดสวิตช์บัญชีได้ (ต้องปิด)");
          return;
        }
        // ห้ามกดถ้าปิดอยู่ (กด = เปิดการลงบัญชีจริง) — ภาพนี้ต้องเริ่มจากสถานะเปิด
        if (!st.on) throw new StepError("ACCOUNT ของร้าน QC ปิดอยู่ — ไม่กดเปิด (จะเปิดการลงบัญชีจริง)");
        await clickEl(page, tid("pos-settings-account-switch"));
        await visibleEl(page, tid("pos-settings-account-confirm"), 0, 5_000);
      }
      return;
    // POS P2.1U ▸ แท็บช่องทางขายเป็นแผงจริงแล้ว (ไม่มีแบนเนอร์ · ไม่มีแถว PLANNED) — ตรวจแถวจริง + ลิ้นชัก/โหมดสร้าง/อ่านอย่างเดียว ◂
    case "settings-channels":
    case "settings-channel-drawer":
    case "settings-channel-create":
    case "settings-channels-readonly":
      return runP21uSettingsState(page, state);
    case "settings-offline":
      await visibleEl(page, tid("pos-settings-offline"), 0, 15_000);
      await visibleEl(page, tid("pos-settings-card-offline"), 0, 5_000);
      return;
  }
}
// ◂

// ═══════════════════ POS P2.1U ▸ ช่องทางขาย: fixture ช่องทาง · บิลช่องทาง · สถานะหน้าตั้งค่า/บิล/จอชำระ (มติ 8) ═══════════════════
const P21U = {
  done: false,
  error: null as string | null,
  /** code → SalesChannel.id ของสาขาที่ถ่าย */
  ids: {} as Record<string, string>,
  notes: [] as string[],
  bills: { done: false, error: null as string | null, web: "", lineman: "", reused: 0, page: "" },
  /** บิลพักของสถานะ paydlg-platform (ทิ้งใน finally ถ้ายังไม่ถูกเรียกคืน) */
  held: [] as string[],
  cleanup: null as null | { ok: boolean; detail: string },
};
/** fixture ช่องทาง: LINEMAN + GRAB ตามค่าใน P21U_CHANNELS (หาตามรหัส · ไม่มี = สร้าง · ค่าไม่ตรง = แก้ · ตรง = ไม่เขียน) — ผ่านบริการ (เจ้าของร้าน) · พังไม่โยน */
async function ensureChannelFixture(): Promise<void> {
  if (P21U.done || P21U.error) return;
  try {
    const { listChannels, saveChannel } = await import("@/lib/modules/pos/channel");
    const actor = await ownerActor();
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    const l = await listChannels(ctx, actor, { includeArchived: true });
    if (!l.ok) throw new StepError(`listChannels: ${l.code}`);
    for (const c of l.items) P21U.ids[c.code] = c.id;
    for (const want of P21U_CHANNELS) {
      const row = l.items.find((c) => c.code === want.code);
      if (row?.archived) throw new StepError(`ช่องทาง ${want.code} ของสาขา QC ถูกเก็บแล้ว (ไม่มีทางเปิดคืนผ่านบริการ — ผู้คุมงานตัดสิน)`);
      if (!row) {
        const r = await saveChannel(ctx, actor, { code: want.code, name: want.name, payout: want.payout, commissionBp: want.commissionBp, commissionFixedSatang: want.commissionFixedSatang, commissionVatBp: want.commissionVatBp });
        if (!r.ok) throw new StepError(`สร้างช่องทาง ${want.code}: ${r.code}`);
        P21U.ids[want.code] = r.channel.id;
        P21U.notes.push(`สร้าง ${want.code}`);
        continue;
      }
      const diff: Record<string, unknown> = {};
      for (const k of ["payout", "commissionBp", "commissionFixedSatang", "commissionVatBp"] as const) if (row[k] !== want[k]) diff[k] = want[k];
      if (!row.active) diff.active = true;
      if (row.name !== want.name || Object.keys(diff).length) {
        const r = await saveChannel(ctx, actor, { id: row.id, name: want.name, ...diff });
        if (!r.ok) throw new StepError(`แก้ช่องทาง ${want.code}: ${r.code}`);
        P21U.notes.push(`แก้ ${want.code} (${[row.name !== want.name ? "name" : "", ...Object.keys(diff)].filter(Boolean).join(",")})`);
      }
    }
    for (const code of ["SHOPEE", "FOODPANDA"]) if (P21U.ids[code]) P21U.notes.push(`${code} มีอยู่แล้วในสาขา QC — แถว "เชื่อมต่อ" ของ ${code} จะไม่ขึ้น (ไม่ลบ)`);
    P21U.done = true;
  } catch (e) {
    P21U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** วันที่ไทยวันนี้ (หน้าบิลวันนี้ของภาพ) */
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
/** POS P2.1U fix รอบ 1 ▸ F1: ตำแหน่งบิลในหน้าแรกของ "บิลวันนี้" (ตัวอ่านเดียวกับหน้าจอ · ค่าปริยาย = ทุกสถานะ · 10 แถว · ไม่กรอง) ◂ */
async function p21uPageOnePos(saleIds: string[]): Promise<{ pos: number[]; total: number }> {
  const { billsPageData } = await import("@/lib/modules/pos/bills");
  const r = (await billsPageData({ tenantId: T.tenantId, systemId: SYS, unitId, deviceId: BILLS_DEVICE_ID } as never, (await ownerActor()) as never, { unitId, date: bkkToday(), page: 1, pageSize: 10 })) as Any;
  if (!r?.ok) throw new StepError(`อ่านหน้าบิลวันนี้ไม่ได้: ${r?.code ?? "?"}`);
  const ids = (r.items as { id: string }[]).map((i) => i.id);
  return { pos: saleIds.map((id) => ids.indexOf(id) + 1), total: r.total as number };
}
/**
 * POS P2.1U fix รอบ 1 ▸ F1: สร้างคู่บิลช่องทาง (เว็บร้าน PROMPTPAY ฿235 + LINE MAN PLATFORM ฿420 · LM-48152) ด้วยคีย์ต่อรอบ
 * (`${process.pid}` เหมือนบิลชุดภาพ P1.16) ⇒ คู่ใหม่ = บิลใหม่สุดของวันเสมอ · ไม่ลบ (บิลขายจริงของวันใน QC4 เหมือนบิลชุดภาพ) ◂
 */
let p21uPairN = 0;
async function createP21uPair(): Promise<{ web: string; lineman: string }> {
  const web = P21U.ids.WEB;
  const lm = P21U.ids.LINEMAN;
  if (!web || !lm) throw new StepError("ไม่มีช่องทาง WEB/LINEMAN ของสาขา QC");
  const { createSale } = await import("@/lib/modules/pos/service");
  const actor = await ownerActor();
  const k = `${FIX.prefix}p21u-${process.pid}-${++p21uPairN}`;
  const base = { tenantId: T.tenantId, unitId, systemId: SYS, sourceModule: "POS", shiftId: BILLS.shiftId || null, soldByUserId: actor.userId };
  const w = await createSale({
    ...base,
    idempotencyKey: `${k}-web`,
    channelId: web,
    lines: [{ name: `ลาเต้เย็น ${BILL_TAG}`, qty: 2, unitPriceSatang: 7500 }, { name: `ครัวซองต์อัลมอนด์ ${BILL_TAG}`, qty: 1, unitPriceSatang: 8500 }],
    payMethods: [{ type: "PROMPTPAY", amountSatang: 23500 }],
  } as never);
  const m = await createSale({
    ...base,
    idempotencyKey: `${k}-lineman`,
    channelId: lm,
    channelRef: P21U_REF,
    lines: [
      { name: `ผัดไทยกุ้ง ${BILL_TAG}`, qty: 1, unitPriceSatang: 12000 },
      { name: `ต้มยำกุ้งน้ำข้น ${BILL_TAG}`, qty: 1, unitPriceSatang: 18000 },
      { name: `ชาไทยเย็น ${BILL_TAG}`, qty: 2, unitPriceSatang: 6000 },
    ],
    payMethods: [{ type: "PLATFORM", amountSatang: 42000 }],
  } as never);
  return { web: w.saleId, lineman: m.saleId };
}
/** POS P2.1U fix รอบ 1 ▸ F1: คู่ล่าสุดของวันนี้ (LINE MAN หาตาม channelRef LM-48152 + BILL_TAG · เว็บร้าน = บิลเว็บร้านล่าสุดที่ไม่ใหม่กว่า LINE MAN) ◂ */
async function newestP21uPair(): Promise<{ web: string; lineman: string } | null> {
  const start = new Date(Date.parse(`${bkkToday()}T00:00:00+07:00`));
  const where = { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE" as const, status: "PAID" as const, createdAt: { gte: start }, lines: { some: { name: { endsWith: BILL_TAG } } } };
  const m = await prisma.posSale.findFirst({ where: { ...where, channelId: P21U.ids.LINEMAN, channelRef: P21U_REF }, select: { id: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!m) return null;
  const w = await prisma.posSale.findFirst({ where: { ...where, channelId: P21U.ids.WEB, createdAt: { gte: start, lte: m.createdAt } }, select: { id: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return w ? { web: w.id, lineman: m.id } : null;
}
/**
 * บิลช่องทางของภาพ 12/09 (หลังบิลชุดภาพของ P1.16): POS P2.1U fix รอบ 1 ▸ F1 — รอบเจ้าของ = สร้างคู่ใหม่ด้วยคีย์ต่อรอบเสมอ
 * (บิลชุดภาพของรอบนี้ใหม่กว่าคู่เดิม) · รอบแคชเชียร์ = ใช้คู่ล่าสุดของวันนี้ซ้ำเมื่ออยู่ในหน้าแรกทั้งคู่ · ไม่มี/หลุดหน้าแรก = สร้างคู่ใหม่ ·
 * ยืนยันตำแหน่งหน้าแรกด้วยตัวอ่าน billsPageData (บันทึกใน log) ◂
 */
async function seedChannelBillsOnce(): Promise<void> {
  if (P21U.bills.done || P21U.bills.error) return;
  try {
    await ensureChannelFixture();
    if (P21U.error) throw new StepError(`fixture ช่องทาง: ${P21U.error}`);
    let pair = userKey === "owner" ? null : await newestP21uPair();
    if (pair && (await p21uPageOnePos([pair.web, pair.lineman])).pos.some((n) => n === 0)) pair = null;
    P21U.bills.reused = pair ? 2 : 0;
    pair ??= await createP21uPair();
    P21U.bills.web = pair.web;
    P21U.bills.lineman = pair.lineman;
    const at = await p21uPageOnePos([pair.web, pair.lineman]);
    if (at.pos.some((n) => n === 0)) throw new StepError(`คู่บิลช่องทางไม่อยู่หน้าแรก (เว็บร้าน #${at.pos[0]} · LINE MAN #${at.pos[1]} จาก ${at.total})`);
    P21U.bills.page = `หน้าแรก: เว็บร้าน #${at.pos[0]} · LINE MAN #${at.pos[1]} จาก ${at.total} บิลของวันนี้`;
    P21U.bills.done = true;
  } catch (e) {
    P21U.bills.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/**
 * POS P2.1U fix รอบ 1 ▸ F1: ก่อนถ่าย — ยืนยันว่าคู่บิลยังอยู่หน้าแรก (บิลที่สถานะก่อนหน้า/เลนอื่นขายหลัง seed ดันลงได้) ·
 * หลุด = สร้างคู่ใหม่ (คีย์ต่อรอบ) แล้วโหลดหน้าใหม่ ⇒ สถานะไม่ล้มเพราะตำแหน่งหน้า · บอกตำแหน่งใน log ◂
 */
async function ensureP21uOnPageOne(page: Any): Promise<void> {
  let at = await p21uPageOnePos([P21U.bills.web, P21U.bills.lineman]);
  if (at.pos.some((n) => n === 0)) {
    const was = `เว็บร้าน #${at.pos[0] || "-"} · LINE MAN #${at.pos[1] || "-"}`;
    const pair = await createP21uPair();
    P21U.bills.web = pair.web;
    P21U.bills.lineman = pair.lineman;
    at = await p21uPageOnePos([pair.web, pair.lineman]);
    if (at.pos.some((n) => n === 0)) throw new StepError(`คู่บิลช่องทางใหม่ยังไม่อยู่หน้าแรก (เว็บร้าน #${at.pos[0]} · LINE MAN #${at.pos[1]} จาก ${at.total})`);
    console.log(`    P2.1U: คู่บิลเดิมหลุดหน้าแรก (${was}) → สร้างคู่ใหม่ ${pair.web} · ${pair.lineman}`);
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
  }
  console.log(`    P2.1U: บิล LINE MAN อยู่หน้าแรก #${at.pos[1]} (เว็บร้าน #${at.pos[0]}) จาก ${at.total} บิลของวันนี้`);
}
/** ป้ายช่องทางของแถวบิล (ตาราง md+ / การ์ด 390) ที่มองเห็น */
async function visibleChannelPill(page: Any, saleId: string): Promise<string> {
  const sel = `${tid(`pos-bill-channel-${saleId}`)},${tid(`pos-bill-channel-card-${saleId}`)}`;
  return page
    .$$eval(sel, (els: Element[]) => els.filter((e) => e.getClientRects().length > 0).map((e) => (e.textContent ?? "").trim())[0] ?? "")
    .catch(() => "");
}
async function runP21uBillsState(page: Any, state: "bills-channels" | "bills-drawer-commission"): Promise<void> {
  if (P21U.bills.error || !P21U.bills.lineman) throw new StepError(`ไม่มีบิลช่องทางของภาพ: ${P21U.bills.error ?? "ยังไม่ได้สร้าง"}`);
  await ensureP21uOnPageOne(page); // POS P2.1U fix รอบ 1 ▸ F1 ◂
  await visibleEl(page, tid("pos-bills-list"), 0, 15_000).catch(() => {
    throw new StepError("หน้าบิลวันนี้ไม่ขึ้น (pos-bills-list)");
  });
  await visibleEl(page, `[data-bill-id="${P21U.bills.lineman}"]`, 0, 15_000).catch(() => {
    throw new StepError("ตัวอ่านบอกว่าบิล LINE MAN อยู่หน้าแรก แต่หน้าจอไม่แสดงแถวนี้ (pos-bills-list)");
  });
  const lm = await visibleChannelPill(page, P21U.bills.lineman);
  if (!/LINE MAN/.test(lm)) throw new StepError(`ป้ายช่องทางของบิล LINE MAN = "${lm}"`);
  if (state === "bills-channels") {
    const web = await visibleChannelPill(page, P21U.bills.web);
    if (!web) throw new StepError("ไม่เห็นป้ายช่องทางของบิลเว็บร้านในหน้าแรก");
    const ref = await page.$$eval(`[data-bill-id="${P21U.bills.lineman}"]`, (els: Element[]) => els.some((e) => e.getClientRects().length > 0 && (e.textContent ?? "").includes("LM-48152"))).catch(() => false);
    if (!ref) throw new StepError(`แถว LINE MAN ไม่มีเลขออเดอร์ ${P21U_REF} ในช่องลูกค้า`);
    await page
      .waitForFunction(() => /\d/.test(document.querySelector('[data-testid="pos-bills-channel-summary"]')?.textContent ?? ""), { timeout: 15_000 })
      .catch(() => {
        throw new StepError("บรรทัด \"หน้าร้าน N · ออนไลน์ M\" ไม่ขึ้น (pos-bills-channel-summary)");
      });
    return;
  }
  await clickEl(page, `[data-bill-id="${P21U.bills.lineman}"]`);
  await visibleEl(page, tid("pos-bill-commission"), 0, 15_000).catch(() => {
    throw new StepError("ลิ้นชักบิล LINE MAN ไม่มีบล็อกช่องทาง (pos-bill-commission)");
  });
  const fee = await page.$(tid("pos-bill-commission-fee"));
  if (userKey === "owner" && !fee) throw new StepError("เจ้าของไม่เห็นตัวเลขค่าคอมฯ (pos-bill-commission-fee) — ต้องเห็น (pos.report.view)");
  if (userKey !== "owner" && fee) throw new StepError("แคชเชียร์เห็นตัวเลขค่าคอมฯ (ต้องไม่เห็น — ไม่มี pos.report.view)");
  if (userKey === "owner") {
    const net = await page.$eval(tid("pos-bill-commission-net"), (e: Element) => e.textContent ?? "").catch(() => "");
    if (!/294/.test(net)) throw new StepError(`รับจริงของบิล LINE MAN = "${net}" (คาด ฿294)`);
  }
}
async function runP21uSettingsState(page: Any, state: "settings-channels" | P21uSettingsKey): Promise<void> {
  const cashier = userKey === "cashier";
  if (P21U.error) throw new StepError(`fixture ช่องทาง: ${P21U.error}`);
  await visibleEl(page, tid("pos-settings-channels"), 0, 15_000);
  await visibleEl(page, tid("pos-channel-list"), 0, 15_000).catch(() => {
    throw new StepError("รายการช่องทางขายไม่ขึ้น (pos-channel-list)");
  });
  for (const code of ["store", "qr_table", "web", "chat", "lineman", "grab"])
    await visibleEl(page, tid(`pos-channel-row-${code}`), 0, 5_000).catch(() => {
      throw new StepError(`ไม่มีแถวช่องทาง ${code}`);
    });
  const presets = await page.$$eval('[data-testid^="pos-channel-preset-"]', (els: Element[]) => els.map((e) => e.getAttribute("data-testid"))).catch(() => [] as string[]);
  if (state === "settings-channels" || state === "settings-channels-readonly") {
    const connect = await page.$$('[data-testid^="pos-channel-connect-"]');
    if (cashier) {
      if (connect.length || (await page.$(tid("pos-channel-add")))) throw new StepError("แคชเชียร์เห็นปุ่มเชื่อมต่อ/เพิ่มช่องทาง (ต้องไม่เห็น — ไม่มี pos.channel.manage)");
      const enabled = await page.$$eval('[data-testid^="pos-channel-toggle-"]', (els: Element[]) => els.filter((e) => !(e as HTMLButtonElement).disabled).length).catch(() => 0);
      if (enabled) throw new StepError(`แคชเชียร์กดสวิตช์ช่องทางได้ ${enabled} ตัว (ต้องปิดทุกตัว)`);
      await visibleEl(page, tid("pos-channel-readonly"), 0, 5_000);
    } else if (presets.length !== connect.length) throw new StepError(`แถวแพลตฟอร์มที่ยังไม่เชื่อม ${presets.length} แถว แต่ปุ่มเชื่อมต่อ ${connect.length}`);
    return;
  }
  if (state === "settings-channel-drawer") {
    await clickEl(page, tid("pos-channel-open-lineman"));
    await visibleEl(page, tid("pos-channel-drawer"), 0, 10_000);
    const ex = await visibleEl(page, tid("pos-channel-example"), 0, 5_000);
    const txt = (await ex.evaluate((e: Element) => e.textContent ?? "")) as string;
    if (!/126/.test(txt) || !/294/.test(txt)) throw new StepError(`ตัวอย่างสดของ LINE MAN = "${txt}" (คาด ฿126 · ฿294)`);
    if (cashier && (await page.$(tid("pos-channel-drawer-save")))) throw new StepError("แคชเชียร์เห็นปุ่มบันทึกในลิ้นชักช่องทาง (ต้องอ่านอย่างเดียว)");
    return;
  }
  // settings-channel-create (เจ้าของ)
  await clickEl(page, tid("pos-channel-add"));
  await visibleEl(page, tid("pos-channel-drawer"), 0, 10_000);
  await typeInto(page, tid("pos-channel-drawer-name"), "ตลาดนัด");
  await typeInto(page, tid("pos-channel-drawer-code"), "MARKET");
  await visibleEl(page, `${tid("pos-channel-drawer-payout-none")}[aria-checked="true"]`, 0, 5_000).catch(() => {
    throw new StepError("โหมดสร้างช่องทางของร้านไม่ได้เลือก \"ไม่มีค่าคอมฯ\" ไว้ก่อน");
  });
  await visibleEl(page, tid("pos-channel-example"), 0, 5_000);
}
/** paydlg-platform: บิลพัก LINE MAN ใหม่ต่อภาพ (holdRegisterCart · ทิ้งใน finally ถ้ายังค้าง) → บิลที่พัก → เรียกคืน → ชำระ → ช่อง "แพลตฟอร์ม" */
async function runPlatformPayState(page: Any, device: Device): Promise<void> {
  await ensureChannelFixture();
  if (P21U.error || !P21U.ids.LINEMAN) throw new StepError(`fixture ช่องทาง: ${P21U.error ?? "ไม่มี LINEMAN"}`);
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่มีสินค้า QC (อเมริกาโน่/ลาเต้) ของร้านกาแฟ");
  const { holdRegisterCart } = await import("@/lib/modules/pos/held-cart");
  const h = await holdRegisterCart({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), {
    cart: { lines: [{ productId: QC_IDS.amer, qty: 2 }, { productId: QC_IDS.latte, qty: 1 }], channelId: P21U.ids.LINEMAN },
    label: `LINE MAN ${P21U_REF} (ภาพ QC)`,
  });
  if (!h.ok) throw new StepError(`พักบิล LINE MAN ไม่ได้: ${h.code}`);
  P21U.held.push(h.heldCart.id);
  await openCartOnMobile(page, device);
  await clickEl(page, tid("pos-reg-held-bills"));
  await visibleEl(page, tid("pos-reg-held-drawer"), 0, 10_000);
  await clickEl(page, tid(`pos-reg-held-recall-${h.heldCart.id}`)).catch(() => {
    throw new StepError("ไม่เห็นบิลพัก LINE MAN ในลิ้นชักบิลที่พัก");
  });
  await expectLines(page, 2);
  await waitPayReady(page);
  await clickPay(page, device);
  await visibleEl(page, `${tid("pos-reg-paydlg-method-platform")}[aria-pressed="true"]`, 0, 15_000).catch(() => {
    throw new StepError("จอชำระไม่มีช่อง \"แพลตฟอร์ม\" ที่เลือกไว้ (quote.channel.payout ไม่ใช่ PLATFORM?)");
  });
  const cashOff = await page.$eval(tid("pos-reg-paydlg-method-cash"), (e: Element) => (e as HTMLButtonElement).disabled).catch(() => false);
  if (!cashOff) throw new StepError("บิลแพลตฟอร์มยังเลือกเงินสดได้ (ต้องปิด — R5)");
}
/** finally/signal: ทิ้งบิลพักของ paydlg-platform ที่ยังไม่ถูกเรียกคืน (บริการ discardHeldCart · เรียกซ้ำได้ · ไม่โยน) */
async function cleanupP21u(): Promise<void> {
  if (P21U.cleanup || !P21U.held.length) return;
  try {
    const { discardHeldCart } = await import("@/lib/modules/pos/held-cart");
    const actor = await ownerActor();
    let n = 0;
    for (const id of P21U.held) if ((await discardHeldCart({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { id })).ok) n++;
    P21U.cleanup = { ok: true, detail: `P2.1U: บิลพัก LINE MAN ${P21U.held.length} ใบ · ทิ้ง ${n} (ที่เหลือถูกเรียกคืนแล้ว)` };
  } catch (e) {
    P21U.cleanup = { ok: false, detail: `P2.1U: ทิ้งบิลพักไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 160) : e}` };
  }
}

// ═══════════════════ POS HF-P1CLOSE ▸ held-drawer · paydlg-promptpay-timeout · paydone-print-failed · lock-screen-scroll ═══════════════════
const HFP1 = {
  /** บิลพักที่ held-drawer สร้าง (ทิ้งใน finally/signal) */
  held: [] as string[],
  /** ผลคืน printerConfig ของเครื่อง 2 (paydone-print-failed) */
  printerRestore: null as null | string,
  cleanup: null as null | { ok: boolean; detail: string },
};
/** ผลตรวจ lock-screen-scroll ต่อรอบ (ลง summary) */
const LOCK_SCROLL: string[] = [];
/** held-drawer (14B): พักบิลใหม่ 1 ใบต่อภาพ → ปุ่มบิลที่พัก → ลิ้นชัก · 390 เปิดแผ่นตะกร้าได้เมื่อมีรายการ ⇒ ใส่อเมริกาโน่ 1 ชิ้นก่อน */
async function runHeldDrawerState(page: Any, device: Device): Promise<void> {
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่มีสินค้า QC (อเมริกาโน่/ลาเต้) ของร้านกาแฟ");
  const { holdRegisterCart } = await import("@/lib/modules/pos/held-cart");
  const h = await holdRegisterCart({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), {
    cart: { lines: [{ productId: QC_IDS.amer, qty: 2 }, { productId: QC_IDS.latte, qty: 1 }] },
    label: "โต๊ะ 4 (ภาพ QC)",
  });
  if (!h.ok) throw new StepError(`พักบิลไม่ได้: ${h.code}`);
  HFP1.held.push(h.heldCart.id);
  if (device === "mobile") {
    await clickEl(page, tid(`pos-reg-product-${QC_IDS.amer}`));
    await expectLines(page, 1);
    await openCartOnMobile(page, device);
  }
  await clickEl(page, tid("pos-reg-held-bills"));
  await visibleEl(page, tid("pos-reg-held-drawer"), 0, 10_000);
  await visibleEl(page, tid(`pos-reg-held-recall-${h.heldCart.id}`), 0, 10_000).catch(() => {
    throw new StepError("ลิ้นชักบิลที่พักไม่มีบิลที่เพิ่งพัก");
  });
}
/** paydlg-promptpay-timeout (19ค): ใบ STATIC ของเครื่องรอบนี้ → expiresAt อดีต (แถวล่าสุดของรอบนี้เท่านั้น) → โพลของจอเขียน EXPIRED → การ์ดหมดอายุ */
async function runPromptPayTimeout(page: Any, device: Device): Promise<void> {
  await addCart3(page, device);
  await clickPay(page, device);
  await clickEl(page, tid("pos-reg-paydlg-method-promptpay"));
  await visibleEl(page, `${tid("pos-pay-intent")}[data-status="PENDING"]`, 0, 15_000).catch(() => {
    throw new StepError("ใบขอรับเงินไม่ขึ้น PENDING");
  });
  const row = await prisma.posPaymentIntent.findFirst({
    where: { tenantId: T.tenantId, unitId, deviceId: DEVICE_ID, status: "PENDING", createdAt: { gte: RUN_STARTED } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!row) throw new StepError("ไม่พบใบ PENDING ของเครื่องรอบนี้");
  await prisma.posPaymentIntent.updateMany({ where: { id: row.id, tenantId: T.tenantId, status: "PENDING" }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  await visibleEl(page, tid("pos-pay-intent-expired"), 0, 20_000).catch(() => {
    throw new StepError("เลื่อน expiresAt แล้วจอไม่ขึ้นการ์ดหมดอายุ (pos-pay-intent-expired)");
  });
  await visibleEl(page, tid("pos-pay-intent-regenerate"), 0, 5_000);
}
/** paydone-print-failed (19ค): เครื่อง 2 → USB ที่เบราว์เซอร์นี้ไม่ได้จับคู่ → ขาย 1 บิล → พิมพ์ = NO_DEVICE · คืนค่าปริยาย (null) ทันทีหลังการ์ดขึ้น */
async function runPaydonePrintFailed(page: Any, device: Device): Promise<void> {
  const dev2 = SETTINGS.devices[1];
  if (!dev2) throw new StepError("ไม่มีเครื่อง QC 2");
  const { updateDevice } = await import("@/lib/modules/pos/device");
  const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
  const actor = await ownerActor();
  const u = await updateDevice(ctx, actor, { id: dev2.id, printerConfig: { mode: "escpos-usb", paper: "80", drawerKick: false, autoPrint: false, thaiText: "raster", copies: 1 } });
  if (!u.ok) throw new StepError(`สลับเครื่อง 2 เป็น USB ไม่ได้: ${u.code}`);
  try {
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
      throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root)");
    });
    await ensureShift(page);
    await cashSaleAmerLatte(page, device);
    await clickEl(page, tid("pos-print-receipt"));
    await visibleEl(page, tid("pos-print-error"), 0, 15_000).catch(() => {
      throw new StepError("พิมพ์ผ่าน USB ที่ไม่ได้จับคู่แล้วไม่ขึ้นการ์ดพิมพ์ไม่สำเร็จ (pos-print-error)");
    });
    await visibleEl(page, tid("pos-print-retry"), 0, 5_000);
    await visibleEl(page, tid("pos-print-browser"), 0, 5_000).catch(() => {
      throw new StepError("การ์ดพิมพ์ไม่สำเร็จไม่มีปุ่มพิมพ์ผ่านเบราว์เซอร์ (pos-print-browser)");
    });
  } finally {
    const r = await updateDevice(ctx, actor, { id: dev2.id, printerConfig: null }).catch((e: unknown) => ({ ok: false as const, code: e instanceof Error ? e.message.slice(0, 80) : String(e) }));
    HFP1.printerRestore = r.ok ? "เครื่อง 2 คืนค่าพิมพ์ผ่านเบราว์เซอร์แล้ว" : `คืน printerConfig เครื่อง 2 ไม่ได้: ${(r as { code?: string }).code ?? "?"} (เครื่องถูกเพิกถอนใน finally อยู่ดี)`;
  }
}
/** finally/signal: ทิ้งบิลพักของ held-drawer ที่ยังค้าง (discardHeldCart · เรียกซ้ำได้ · ไม่โยน) */
async function cleanupHfP1(): Promise<void> {
  if (HFP1.cleanup || !HFP1.held.length) return;
  try {
    const { discardHeldCart } = await import("@/lib/modules/pos/held-cart");
    const actor = await ownerActor();
    let n = 0;
    for (const id of HFP1.held) if ((await discardHeldCart({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { id })).ok) n++;
    HFP1.cleanup = { ok: n === HFP1.held.length, detail: `HF-P1CLOSE: บิลพัก held-drawer ${HFP1.held.length} ใบ · ทิ้ง ${n}` };
  } catch (e) {
    HFP1.cleanup = { ok: false, detail: `HF-P1CLOSE: ทิ้งบิลพักไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 160) : e}` };
  }
}
// ◂
// ◂

// ═══════════════════ POS P2.2U ▸ fixture ราคา/โปร + ขั้นตอนของสถานะ (มติ 11) ═══════════════════
//   แถวราคา: catalog.setChannelPrices (เจ้าของร้าน · แทนทั้งชุด) — แถวเดิมของสินค้าที่แตะจำไว้แล้วคืน "ทั้งชุด" ใน cleanupP22u ·
//   โปร: price-rule.savePriceRule 3 ตัว (กำลังใช้ / รอเริ่ม / หมดแล้ว) → archivePriceRule ใน cleanupP22u (ซากชื่อขึ้นต้น P22U_RULE_PREFIX ถูกเก็บก่อนสร้าง) ·
//   บิล: createSale LINE MAN คีย์ตายตัวต่อวัน (ซ้ำ = บิลเดิม · ไม่ลบ — บิลขายจริงของวันใน QC) · บิลพักของ register-line-badges ทิ้งใน cleanupP22u
const P22U = {
  done: false,
  error: null as string | null,
  rules: [] as { id: string; state: string }[],
  activeRuleId: "",
  rowsBefore: new Map<string, { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean }[]>(),
  names: { latte: "", amer: "", crois: "" },
  sale: "",
  receiptNo: "",
  held: [] as string[],
  cleanup: null as null | { ok: boolean; detail: string },
};
async function ensureP22uFixture(withBill: boolean): Promise<void> {
  if (P22U.done || P22U.error) return;
  try {
    await ensureChannelFixture();
    if (P21U.error || !P21U.ids.LINEMAN || !P21U.ids.GRAB) throw new StepError(`fixture ช่องทาง: ${P21U.error ?? "ไม่มี LINEMAN/GRAB"}`);
    if (!QC_IDS.latte || !QC_IDS.amer || !QC_IDS.crois) throw new StepError("ไม่มีสินค้า QC (ลาเต้/อเมริกาโน่/ครัวซองต์) ของร้านกาแฟ");
    const { setChannelPrices } = await import("@/lib/modules/pos/catalog");
    const { channelMarkupPrice } = await import("@/lib/modules/pos/price-shared");
    const { listPriceRules, savePriceRule, archivePriceRule } = await import("@/lib/modules/pos/price-rule");
    const actor = await ownerActor();
    const rctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    const cctx = { tenantId: T.tenantId, systemId: SYS, actorUserId: actor.userId };
    const prods = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, id: { in: [QC_IDS.latte, QC_IDS.amer, QC_IDS.crois] } }, select: { id: true, name: true, basePriceSatang: true } });
    const by = new Map(prods.map((p) => [p.id, p]));
    const latte = by.get(QC_IDS.latte);
    const amer = by.get(QC_IDS.amer);
    if (!latte?.basePriceSatang || !amer?.basePriceSatang) throw new StepError("ลาเต้/อเมริกาโน่ของร้าน QC ไม่มีราคาฐาน");
    P22U.names = { latte: latte.name, amer: amer.name, crois: by.get(QC_IDS.crois)?.name ?? "" };
    // ── แถวราคา (แทนเฉพาะคีย์ที่ภาพต้องใช้ · แถวอื่นของสินค้าคงเดิม) ──
    const want: Record<string, { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean }[]> = {
      [QC_IDS.latte]: [
        { channelCode: "LINEMAN", unitId: null, priceSatang: channelMarkupPrice(latte.basePriceSatang, 2700, 100), notSold: false },
        { channelCode: "GRAB", unitId: null, priceSatang: null, notSold: true },
      ],
      [QC_IDS.amer]: [{ channelCode: "LINEMAN", unitId: null, priceSatang: channelMarkupPrice(amer.basePriceSatang, 2500, 100), notSold: false }],
      [QC_IDS.crois]: [{ channelCode: "STORE", unitId: null, priceSatang: null, notSold: true }],
    };
    for (const [productId, rows] of Object.entries(want)) {
      const before = await prisma.posProductChannelPrice.findMany({ where: { tenantId: T.tenantId, systemId: SYS, productId }, select: { channelCode: true, unitId: true, priceSatang: true, notSold: true } });
      P22U.rowsBefore.set(productId, before);
      const key = (r: { channelCode: string | null; unitId: string | null }) => `${r.channelCode ?? ""}|${r.unitId ?? ""}`;
      const keep = before.filter((b) => !rows.some((r) => key(r) === key(b)));
      await setChannelPrices(cctx, { productId, rows: [...keep, ...rows] });
    }
    // ── โปร: เก็บซากรอบก่อน แล้วสร้าง 3 ตัว ──
    const l = await listPriceRules(rctx, actor, {});
    if (!l.ok) throw new StepError(`listPriceRules: ${l.code}`);
    for (const r of l.items.filter((x) => x.name.startsWith(P22U_RULE_PREFIX))) await archivePriceRule(rctx, actor, { id: r.id });
    const day = 86_400_000;
    const isoBkk = (ms: number) => `${new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`;
    const now = Date.now();
    const specs = [
      { state: "ACTIVE", name: `${P22U_RULE_PREFIX} · บ่ายชิล`, kind: "HAPPY_HOUR", adjust: "PRICE", valueSatang: 5900, productIds: [QC_IDS.latte] },
      { state: "UPCOMING", name: `${P22U_RULE_PREFIX} · พรุ่งนี้ลด 20%`, kind: "PROMO", adjust: "PERCENT_OFF", valueBp: 2000, productIds: [QC_IDS.amer], startsAt: isoBkk(now + day) },
      { state: "ENDED", name: `${P22U_RULE_PREFIX} · เมื่อวาน ลด ฿10`, kind: "PROMO", adjust: "AMOUNT_OFF", valueSatang: 1000, productIds: [QC_IDS.latte], startsAt: isoBkk(now - 2 * day), endsAt: isoBkk(now) },
    ] as const;
    for (const sp of specs) {
      const { state, ...input } = sp;
      const r = await savePriceRule(rctx, actor, { ...input, productIds: [...input.productIds] });
      if (!r.ok) throw new StepError(`savePriceRule ${state}: ${r.code} ${r.field ?? ""}`);
      P22U.rules.push({ id: r.rule.id, state });
      if (state === "ACTIVE") P22U.activeRuleId = r.rule.id;
    }
    // ── บิล LINE MAN (ลิ้นชักบิล: บรรทัดโปร + บรรทัดช่องทาง) ──
    if (withBill) {
      const { createSale } = await import("@/lib/modules/pos/service");
      const amerLm = channelMarkupPrice(amer.basePriceSatang, 2500, 100);
      const sale = await createSale({
        tenantId: T.tenantId,
        unitId,
        systemId: SYS,
        sourceModule: "POS",
        shiftId: BILLS.shiftId || null,
        soldByUserId: actor.userId,
        idempotencyKey: `${FIX.prefix}p22u-bill-${bkkToday()}`,
        channelId: P21U.ids.LINEMAN,
        channelRef: "LM-22022",
        lines: [
          { productId: QC_IDS.latte, name: `${latte.name} ${BILL_TAG}`, qty: 1, unitPriceSatang: 5900, priceSource: "RULE", priceRuleId: P22U.activeRuleId, listPriceSatang: latte.basePriceSatang },
          { productId: QC_IDS.amer, name: `${amer.name} ${BILL_TAG}`, qty: 1, unitPriceSatang: amerLm, priceSource: "CHANNEL", listPriceSatang: amer.basePriceSatang },
        ],
        payMethods: [{ type: "PLATFORM", amountSatang: 5900 + amerLm }],
      } as never);
      P22U.sale = sale.saleId;
      P22U.receiptNo = (await prisma.posSale.findUnique({ where: { id: sale.saleId }, select: { receiptNo: true } }))?.receiptNo ?? "";
    }
    P22U.done = true;
  } catch (e) {
    P22U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** หลังงาน P2.2U สุดท้าย / finally / สัญญาณ: เก็บโปร · คืนแถวราคาทั้งชุด · ทิ้งบิลพัก — เรียกซ้ำได้ · ไม่โยน */
async function cleanupP22u(): Promise<void> {
  if (P22U.cleanup || (!P22U.rules.length && !P22U.rowsBefore.size && !P22U.held.length)) return;
  const parts: string[] = [];
  let ok = true;
  try {
    const actor = await ownerActor();
    const rctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    if (P22U.held.length) {
      const { discardHeldCart } = await import("@/lib/modules/pos/held-cart");
      let n = 0;
      for (const id of P22U.held) if ((await discardHeldCart(rctx, actor, { id })).ok) n++;
      parts.push(`บิลพัก ${P22U.held.length} · ทิ้ง ${n}`);
    }
    if (P22U.rules.length) {
      const { archivePriceRule } = await import("@/lib/modules/pos/price-rule");
      let n = 0;
      for (const r of P22U.rules) if ((await archivePriceRule(rctx, actor, { id: r.id })).ok) n++;
      if (n !== P22U.rules.length) ok = false;
      parts.push(`เก็บโปร ${n}/${P22U.rules.length}`);
    }
    if (P22U.rowsBefore.size) {
      const { setChannelPrices } = await import("@/lib/modules/pos/catalog");
      const cctx = { tenantId: T.tenantId, systemId: SYS, actorUserId: actor.userId };
      for (const [productId, rows] of P22U.rowsBefore) await setChannelPrices(cctx, { productId, rows });
      parts.push(`คืนแถวราคา ${P22U.rowsBefore.size} สินค้า`);
    }
  } catch (e) {
    ok = false;
    parts.push(`ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  P22U.cleanup = { ok, detail: `P2.2U: ${parts.join(" · ")}` };
}
async function openP22uProduct(page: Any, device: Device, id: string): Promise<void> {
  await clickEl(page, tid(device === "mobile" ? `pos-prod-copen-${id}` : `pos-prod-open-${id}`));
  await visibleEl(page, tid("pos-prod-drawer"), 0, 10_000);
  await visibleEl(page, tid("pos-prod-prices"), 0, 10_000);
}
async function runP22uProductsState(page: Any, state: P22uProductsKey, device: Device): Promise<void> {
  if (state === "products-readonly") return; // แคชเชียร์: บันทึก HTTP/ภาพอย่างเดียว (PAGE_EXPECT products.cashier = record)
  if (P22U.error) throw new StepError(`fixture P2.2U: ${P22U.error}`);
  const latte = QC_IDS.latte;
  if (state.startsWith("price-rules")) {
    await visibleEl(page, tid("pos-price-rules"), 0, 15_000);
    const active = P22U.rules.find((r) => r.state === "ACTIVE")?.id ?? "";
    for (const r of P22U.rules) {
      const txt = (await (await visibleEl(page, tid(`pos-price-rule-state-${r.id}`), 0, 10_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
      if (!txt.trim()) throw new StepError(`ป้ายสถานะโปร ${r.state} ว่าง`);
    }
    if (state === "price-rules-editor") {
      await clickEl(page, tid(`pos-price-rule-open-${active}`));
      await visibleEl(page, tid("pos-price-rule-drawer"), 0, 10_000);
      const ex = (await (await visibleEl(page, tid("pos-price-rule-example"), 0, 5_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
      if (!/→/.test(ex) || !/59/.test(ex)) throw new StepError(`ตัวอย่างสด = "${ex}" (คาด "ลาเต้ ฿x → ฿59")`);
    }
    if (state === "price-rules-error") {
      await clickEl(page, tid("pos-price-rule-add"));
      await visibleEl(page, tid("pos-price-rule-drawer"), 0, 10_000);
      await typeInto(page, tid("pos-price-rule-name"), "โปรไม่มีสินค้า");
      await typeInto(page, tid("pos-price-rule-value"), "59");
      await clickEl(page, tid("pos-price-rule-save"));
      await visibleEl(page, tid("pos-price-rule-err-productIds"), 0, 5_000).catch(() => {
        throw new StepError("ไม่มีข้อความใต้ช่องสินค้า (pos-price-rule-err-productIds)");
      });
    }
    return;
  }
  await visibleEl(page, tid(device === "mobile" ? "pos-prod-cards" : "pos-prod-table"), 0, 15_000);
  if (state === "products-matrix") {
    const price = (await (await visibleEl(page, tid(`pos-prod-price-${latte}`), 0, 10_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
    if (!/แพลตฟอร์ม|Platform/.test(price)) throw new StepError(`ช่องราคาลาเต้ไม่มีบรรทัดแพลตฟอร์ม ("${price}")`);
    const chips = (await (await visibleEl(page, tid(`pos-prod-channels-${latte}`), 0, 5_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
    if (!/LM/.test(chips) || /Grab/.test(chips)) throw new StepError(`ชิปช่องทางของลาเต้ = "${chips}" (คาด LM · ไม่มี Grab)`);
    return;
  }
  if (state === "products-bulk") {
    for (const id of [latte, QC_IDS.amer]) await clickEl(page, tid(device === "mobile" ? `pos-prod-cselect-${id}` : `pos-prod-select-${id}`));
    await clickEl(page, tid("pos-prod-bulk-open"));
    await visibleEl(page, tid("pos-prod-bulk"), 0, 10_000);
    await clickEl(page, tid("pos-prod-bulk-scope-selected"));
    const pv = (await (await visibleEl(page, tid("pos-prod-bulk-preview"), 0, 5_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
    if (!/→/.test(pv)) throw new StepError(`ตัวอย่าง +X% ไม่มีราคา ("${pv.slice(0, 80)}")`);
    return;
  }
  await openP22uProduct(page, device, latte);
  if (state === "products-drawer-prices") {
    await visibleEl(page, tid("pos-prod-cell-LINEMAN"), 0, 5_000);
    await visibleEl(page, tid(`pos-prod-rule-${P22U.activeRuleId}`), 0, 5_000).catch(() => {
      throw new StepError("ไม่มีกล่องโปรที่กำลังใช้ในลิ้นชักลาเต้");
    });
  } else if (state === "products-drawer-notsold") {
    const g = (await (await visibleEl(page, tid("pos-prod-cell-GRAB"), 0, 5_000)).evaluate((e: Element) => e.textContent ?? "")) as string;
    if (!/ไม่ขาย|Not sold/.test(g)) throw new StepError(`ช่อง Grab = "${g}" (คาด ไม่ขาย —)`);
  } else if (state === "products-drawer-prices-edit") {
    await clickEl(page, tid("pos-prod-price-edit"));
    await visibleEl(page, tid("pos-prod-price-LINEMAN"), 0, 5_000);
    await visibleEl(page, tid("pos-prod-notsold-GRAB"), 0, 5_000);
  }
}
async function runP22uRegisterState(page: Any, state: P22uRegKey, device: Device): Promise<void> {
  if (P22U.error) throw new StepError(`fixture P2.2U: ${P22U.error}`);
  if (state === "register-tile-rule" || state === "register-tile-notsold") {
    const id = state === "register-tile-rule" ? QC_IDS.latte : QC_IDS.crois;
    // ราคาไทล์มาจาก registerCatalog ตอนโหลดหน้า (fixture ตั้งก่อน goto) · ค้นด้วยชื่อให้ไทล์อยู่ในกริด
    await typeInto(page, tid("pos-reg-search"), state === "register-tile-rule" ? P22U.names.latte : P22U.names.crois);
    await visibleEl(page, tid(`pos-reg-product-${id}`), 0, 10_000);
    await visibleEl(page, tid(state === "register-tile-rule" ? `pos-reg-tile-rule-${id}` : `pos-reg-tile-notsold-${id}`), 0, 10_000).catch(() => {
      throw new StepError(state === "register-tile-rule" ? "ไทล์ลาเต้ไม่มีชิปโปร (priceSource RULE?)" : "ไทล์ครัวซองต์ไม่แสดง \"ไม่ขายหน้าร้าน\"");
    });
    if (state === "register-tile-notsold") {
      await clickEl(page, tid(`pos-reg-product-${id}`));
      const lines = await page.$$('[data-testid^="pos-reg-cart-line-"]');
      if (lines.length) throw new StepError("แตะไทล์ที่ไม่ขายหน้าร้านแล้วมีบรรทัดในตะกร้า (ต้องเพิ่มไม่ได้)");
    }
    return;
  }
  // register-line-badges: บิลพัก LINE MAN (ลาเต้ = โปร · อเมริกาโน่ = ราคาช่องทาง) → เรียกคืนผ่าน UI
  const { holdRegisterCart } = await import("@/lib/modules/pos/held-cart");
  const h = await holdRegisterCart({ tenantId: T.tenantId, systemId: SYS, unitId }, await ownerActor(), {
    cart: { lines: [{ productId: QC_IDS.latte, qty: 1 }, { productId: QC_IDS.amer, qty: 1 }], channelId: P21U.ids.LINEMAN },
    label: "LINE MAN LM-22022 (ภาพ QC P2.2U)",
  });
  if (!h.ok) throw new StepError(`พักบิล LINE MAN ไม่ได้: ${h.code}`);
  P22U.held.push(h.heldCart.id);
  await openCartOnMobile(page, device);
  await clickEl(page, tid("pos-reg-held-bills"));
  await visibleEl(page, tid("pos-reg-held-drawer"), 0, 10_000);
  await clickEl(page, tid(`pos-reg-held-recall-${h.heldCart.id}`)).catch(() => {
    throw new StepError("ไม่เห็นบิลพัก LINE MAN ในลิ้นชักบิลที่พัก");
  });
  await expectLines(page, 2);
  await waitPayReady(page);
  if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
  for (const i of [0, 1])
    await visibleEl(page, tid(`pos-reg-line-badge-${i}`), 0, 10_000).catch(() => {
      throw new StepError(`บรรทัด ${i + 1} ไม่มีป้ายราคา (pos-reg-line-badge-${i})`);
    });
}
async function runP22uBillNote(page: Any): Promise<void> {
  if (P22U.error || !P22U.sale) throw new StepError(`ไม่มีบิล fixture P2.2U: ${P22U.error ?? "ยังไม่ได้สร้าง"}`);
  await openBillBySearch(page, P22U.sale, P22U.receiptNo);
  for (const i of [0, 1])
    await visibleEl(page, tid(`pos-bill-line-note-${i}`), 0, 10_000).catch(() => {
      throw new StepError(`ลิ้นชักบิลไม่มีหมายเหตุราคาบรรทัด ${i + 1} (pos-bill-line-note-${i})`);
    });
}
// ◂

// ═══════════════════ POS P2.4U ▸ fixture โหมดโต๊ะ + ขั้นตอนของสถานะ (มติ 11) ═══════════════════
//   สร้างผ่าน facade/ฟังก์ชันของโมดูลเท่านั้น (ไม่เขียนดิบ): โซน/โต๊ะ = restaurant/table createZone · createTable · updateTable(INACTIVE) ·
//   เปิดโต๊ะ = pos/table registerOpenTable (เจ้าของร้าน) · แขกเปิดเองผ่าน QR = restaurant/storefront resolveTableSession ·
//   รอบ = pos/held-cart holdRegisterCart({newDraft:true}) + pos/table registerSendTableRound · สถานะครัว = restaurant/kds advanceItem ·
//   คำขอจากโต๊ะ = restaurant/order createServiceRequest · จอง = pos/table registerCreateReservation · 🔴 ไม่มีการจ่ายบิลใด ๆ ⇒ โต๊ะ "ต้องเก็บ" (ต้องมีบิลจ่ายแล้ว) ไม่อยู่ในภาพ
//   ชื่อโต๊ะ = ตัวอักษรของรอบ (pid) + เลข — รอบ th/en/เจ้าของ/แคชเชียร์ที่รันพร้อมกันไม่ชนชื่อกัน · สถานะเลือกแท็บโซนของรอบตัวเอง
//   เก็บกวาด = ลบตามไอดีของรอบนี้ (ลบดิบได้เฉพาะตอนเก็บกวาด แบบข้อสอบ) หลังงานสุดท้ายที่ใช้ · finally · สัญญาณ · ซากโซนเกิน 1 ชม. ถูกกวาดก่อนสร้าง ·
//   สถานีครัวที่การส่งรอบสร้างให้ (สาขาที่ยังไม่มีสถานี) ลบเมื่อไม่มีรายการอ้างถึง · แถว RestaurantDailyCounter ของวันคงไว้ (ตัวนับเลขออเดอร์ของร้านอาหาร)
const P24U = {
  done: false,
  error: null as string | null,
  zones: [] as string[],
  tables: {} as Record<number, string>,
  sessions: {} as Record<number, string>,
  requests: [] as string[],
  reservations: [] as string[],
  stationsBefore: null as string[] | null,
  log: [] as string[],
  ok: true,
};
const p24uName = (n: number) => `${P24U_LETTER}${n}`;
/** ลบชุดโต๊ะของภาพตามโซน (เฉพาะตอนเก็บกวาด) — รายการที่ถูกจ่ายแล้ว = ไม่ลบ + แจ้ง (ภาพไม่จ่ายบิล) */
async function deleteP24uRows(zoneIds: string[], extraReservations: string[] = []): Promise<string> {
  if (!zoneIds.length && !extraReservations.length) return "";
  const tenantId = T.tenantId;
  const tables = zoneIds.length ? (await prisma.restaurantTable.findMany({ where: { tenantId, zoneId: { in: zoneIds } }, select: { id: true } })).map((t) => t.id) : [];
  const sessions = tables.length ? (await prisma.tableSession.findMany({ where: { tenantId, tableId: { in: tables } }, select: { id: true } })).map((s) => s.id) : [];
  const orders = sessions.length ? (await prisma.restaurantOrder.findMany({ where: { tenantId, sessionId: { in: sessions } }, select: { id: true } })).map((o) => o.id) : [];
  const items = orders.length ? await prisma.restaurantOrderItem.findMany({ where: { tenantId, orderId: { in: orders } }, select: { id: true, saleId: true } }) : [];
  const paid = items.filter((i) => i.saleId).length;
  if (paid) throw new Error(`รายการของโต๊ะภาพถูกจ่ายแล้ว ${paid} รายการ — ไม่ลบ (ตรวจด้วยมือ · โซน ${zoneIds.join(",")})`);
  const itemIds = items.map((i) => i.id);
  if (itemIds.length) {
    await prisma.restaurantOrderItemOption.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await prisma.restaurantOrderItem.deleteMany({ where: { id: { in: itemIds } } });
  }
  if (orders.length) await prisma.restaurantOrder.deleteMany({ where: { id: { in: orders } } });
  let held = 0;
  if (sessions.length) {
    await prisma.restaurantServiceRequest.deleteMany({ where: { tenantId, sessionId: { in: sessions } } });
    held = (await prisma.posHeldCart.deleteMany({ where: { tenantId, tableSessionId: { in: sessions } } })).count;
  }
  const resv = (
    await prisma.restaurantReservation.deleteMany({
      where: { tenantId, OR: [...(tables.length ? [{ tableId: { in: tables } }] : []), ...(sessions.length ? [{ sessionId: { in: sessions } }] : []), ...(extraReservations.length ? [{ id: { in: extraReservations } }] : [])] },
    })
  ).count;
  if (sessions.length) await prisma.tableSession.deleteMany({ where: { id: { in: sessions } } });
  if (tables.length) await prisma.restaurantTable.deleteMany({ where: { id: { in: tables } } });
  if (zoneIds.length) await prisma.restaurantZone.deleteMany({ where: { id: { in: zoneIds } } });
  return `โซน ${zoneIds.length} · โต๊ะ ${tables.length} · session ${sessions.length} · รอบ ${orders.length} · รายการ ${itemIds.length} · รอบร่าง ${held} · จอง ${resv}`;
}
async function ensureP24uFixture(): Promise<void> {
  if (P24U.done || P24U.error) return;
  try {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const stale = (await prisma.restaurantZone.findMany({ where: { tenantId: T.tenantId, unitId, name: { contains: P24U_ZONE_TAG }, createdAt: { lt: old } }, select: { id: true } })).map((z) => z.id);
    if (stale.length) P24U.log.push(`ซาก: ${await deleteP24uRows(stale)}`);
    if (!QC_IDS.amer || !QC_IDS.latte) throw new Error("ไม่พบอเมริกาโน่เย็น/ลาเต้ร้อนของร้าน QC (seed-pos-qc)");
    const tbl = await import("@/lib/modules/restaurant/table");
    const kds = await import("@/lib/modules/restaurant/kds");
    const ord = await import("@/lib/modules/restaurant/order");
    const sf = await import("@/lib/modules/restaurant/storefront");
    const pt = await import("@/lib/modules/pos/table");
    const hc = await import("@/lib/modules/pos/held-cart");
    const actor = await memberActorOf("owner");
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    P24U.stationsBefore = (await prisma.kdsStation.findMany({ where: { tenantId: T.tenantId, unitId }, select: { id: true } })).map((s) => s.id);
    const need = <R extends { ok: boolean }>(r: R, what: string): R & { ok: true } => {
      if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r).slice(0, 160)}`);
      return r as R & { ok: true };
    };
    const z1 = need(await tbl.createZone(T.tenantId, unitId, `ในร้าน · ${P24U_ZONE_TAG} ${P24U_LETTER}`), "createZone ในร้าน");
    P24U.zones.push(z1.id);
    const z2 = need(await tbl.createZone(T.tenantId, unitId, `ระเบียง · ${P24U_ZONE_TAG} ${P24U_LETTER}`), "createZone ระเบียง");
    P24U.zones.push(z2.id);
    const qr: Record<number, string> = {};
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 21, 22]) {
      const t = need(await tbl.createTable(T.tenantId, unitId, { zoneId: n < 20 ? z1.id : z2.id, name: p24uName(n), seats: n === 9 ? 6 : n % 3 === 0 ? 2 : 4 }), `createTable ${p24uName(n)}`);
      P24U.tables[n] = t.id;
      qr[n] = t.qrToken;
    }
    await tbl.updateTable(T.tenantId, unitId, P24U.tables[11]!, { status: "INACTIVE" });
    const open = async (n: number, guests: number) => {
      const r = await pt.registerOpenTable(ctx, actor, { tableId: P24U.tables[n]!, guestCount: guests });
      if (!r.ok) throw new Error(`registerOpenTable ${p24uName(n)}: ${r.code}`);
      P24U.sessions[n] = r.sessionId;
      return r.sessionId;
    };
    type L = { productId: string; qty: number; note?: string };
    const round = async (n: number, lines: L[]): Promise<string[]> => {
      const h = await hc.holdRegisterCart(ctx, actor, { cart: { lines }, tableSessionId: P24U.sessions[n]!, newDraft: true });
      if (!h.ok) throw new Error(`holdRegisterCart ${p24uName(n)}: ${h.code}`);
      const s = await pt.registerSendTableRound(ctx, actor, { tableSessionId: P24U.sessions[n]!, heldCartId: h.heldCart.id });
      if (!s.ok) throw new Error(`registerSendTableRound ${p24uName(n)}: ${s.code}`);
      return s.itemIds;
    };
    const draft = async (n: number, lines: L[]) => {
      const h = await hc.holdRegisterCart(ctx, actor, { cart: { lines }, tableSessionId: P24U.sessions[n]!, newDraft: true });
      if (!h.ok) throw new Error(`holdRegisterCart(draft) ${p24uName(n)}: ${h.code}`);
    };
    const kdsTo = async (itemId: string, steps: ("COOKING" | "READY" | "SERVED")[]) => {
      for (const to of steps) {
        const r = await kds.advanceItem(T.tenantId, unitId, itemId, to);
        if (!r.ok) throw new Error(`advanceItem ${to}: ${r.reason}`);
      }
    };
    const A = QC_IDS.amer;
    const LT = QC_IDS.latte;
    // n1 กำลังทาน: เสิร์ฟแล้ว + กำลังทำ
    await open(1, 2);
    const r1 = await round(1, [{ productId: A, qty: 1 }, { productId: LT, qty: 1 }]);
    await kdsTo(r1[0]!, ["COOKING", "SERVED"]);
    await kdsTo(r1[1]!, ["COOKING"]);
    // n2 อาหารพร้อมเสิร์ฟ 1
    await open(2, 3);
    const r2 = await round(2, [{ productId: A, qty: 2 }]);
    await kdsTo(r2[0]!, ["READY"]);
    // n4 มีรอบที่ส่งแล้ว + รอบร่างยังไม่ส่งครัว 2 บรรทัด
    await open(4, 2);
    await round(4, [{ productId: A, qty: 1 }]);
    await draft(4, [{ productId: LT, qty: 2 }, { productId: A, qty: 1, note: "หวานน้อย" }]);
    // n5 แผงตัวอย่าง (ภาพ 03 "โต๊ะ A5"): รอบ 1 เสิร์ฟแล้ว 5 บรรทัด (ยุบ "เสิร์ฟแล้วอีก 3 รายการ") + รอบ 2 รอครัว 2 บรรทัด
    await open(5, 4);
    const r5 = await round(5, [
      { productId: A, qty: 1 },
      { productId: A, qty: 1, note: "หวานน้อย" },
      { productId: LT, qty: 2 },
      { productId: LT, qty: 1, note: "ร้อนมาก" },
      { productId: A, qty: 1, note: "ไม่ใส่น้ำแข็ง" },
    ]);
    for (const id of r5) await kdsTo(id, ["COOKING", "SERVED"]);
    await round(5, [{ productId: LT, qty: 1 }, { productId: A, qty: 2, note: "แยกแก้ว" }]);
    // n6 ขอเช็คบิล: แขกเปิดเองผ่าน QR + รอบ + REQUEST_BILL
    const g6 = await sf.resolveTableSession(T.tenantId, unitId, qr[6]!);
    if (!g6.ok) throw new Error(`resolveTableSession ${p24uName(6)}: ${g6.reason}`);
    P24U.sessions[6] = g6.sessionId;
    await round(6, [{ productId: LT, qty: 2 }]);
    const q6 = await ord.createServiceRequest(T.tenantId, unitId, g6.sessionId, "REQUEST_BILL");
    if (q6.ok) P24U.requests.push(q6.id);
    // n7 เรียกพนักงาน · n8 แจ้งจ่ายพร้อมเพย์ (ทั้งคู่มีรอบ)
    await open(7, 2);
    await round(7, [{ productId: A, qty: 1 }]);
    const q7 = await ord.createServiceRequest(T.tenantId, unitId, P24U.sessions[7]!, "CALL_STAFF");
    if (q7.ok) P24U.requests.push(q7.id);
    await open(8, 2);
    await round(8, [{ productId: LT, qty: 1 }, { productId: A, qty: 1 }]);
    const q8 = await ord.createServiceRequest(T.tenantId, unitId, P24U.sessions[8]!, "PAY_PROMPTPAY");
    if (q8.ok) P24U.requests.push(q8.id);
    // n9 จองไว้ (อีก 20 นาที · กันก่อน 30 นาที ⇒ กันอยู่ตอนนี้) + การจองที่ยังไม่ระบุโต๊ะ (อีก 2 ชม.) ให้แผ่นจองมี 2 แถว
    const at9 = new Date(Date.now() + 20 * 60_000).toISOString();
    const rv9 = await pt.registerCreateReservation(ctx, actor, { tableId: P24U.tables[9]!, name: "คุณอรทัย (ภาพ QC)", phone: "0812345678", partySize: 6, at: at9, holdFromMinutes: 30 });
    if (!rv9.ok) throw new Error(`registerCreateReservation: ${rv9.code}`);
    P24U.reservations.push(rv9.id);
    const rvX = await pt.registerCreateReservation(ctx, actor, { tableId: null, name: "คุณสมชาย (ภาพ QC)", partySize: 2, at: new Date(Date.now() + 120 * 60_000).toISOString(), holdFromMinutes: 15 });
    if (rvX.ok) P24U.reservations.push(rvX.id);
    P24U.done = true;
    P24U.log.push(`สร้าง: โซน 2 · โต๊ะ ${Object.keys(P24U.tables).length} (${p24uName(1)}…) · session ${Object.keys(P24U.sessions).length} · คำขอ ${P24U.requests.length} · จอง ${P24U.reservations.length}`);
  } catch (e) {
    P24U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function cleanupP24u(): Promise<void> {
  if (!P24U.zones.length && !P24U.reservations.length) return;
  try {
    P24U.log.push(`ลบ: ${await deleteP24uRows(P24U.zones, P24U.reservations)}`);
    if (P24U.stationsBefore) {
      const st = await prisma.kdsStation.deleteMany({ where: { tenantId: T.tenantId, unitId, id: { notIn: P24U.stationsBefore }, orderItems: { none: {} }, menuItems: { none: {} } } });
      if (st.count) P24U.log.push(`สถานีครัวที่รอบสร้างให้ ${st.count}`);
    }
  } catch (e) {
    P24U.ok = false;
    P24U.log.push(`ลบไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  P24U.zones = [];
  P24U.tables = {};
  P24U.sessions = {};
  P24U.requests = [];
  P24U.reservations = [];
  P24U.done = false;
}
const p24uCleanupLine = () => `${P24U.ok ? "🧹" : "⚠️"} P2.4U: ${P24U.log.join(" · ")}`;
/** ทางของสถานะที่ต้องรู้ไอดีจาก fixture (โต๊ะผูกหน้าขาย) */
const p24uRegTablePath = () => `/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(unitId)}&table=${encodeURIComponent(P24U.sessions[4] ?? "")}`;
async function runP24uState(page: Any, state: P24uTablesKey | P24uRegKey, device: Device): Promise<void> {
  if (state === "register-table-mode" || state === "register-billtype-menu") {
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
    await ensureShift(page);
    if (P24U.error) throw new StepError(`fixture P2.4U: ${P24U.error}`);
    if (state === "register-table-mode") {
      // รอบร่างของโต๊ะ (2 บรรทัด) โหลดเข้าตะกร้า → ชิป "โต๊ะ X4 · สั่งเพิ่ม" + ส่งครัว 2 รายการ (มือถือ = เปิดแผ่นตะกร้า)
      await expectLines(page, 2);
      if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
      await visibleEl(page, tid("pos-tbl-order-chip"), 0, 10_000);
      await visibleEl(page, tid("pos-tbl-order-send"), 0, 10_000);
      return;
    }
    // ชิปชนิดบิล (สาขามีโต๊ะของ fixture) → เมนู ซื้อกลับ / ทานที่ร้าน (มือถือ: ชิปอยู่ในแผ่นตะกร้า ⇒ ใส่อเมริกาโน่ 1 แก้วแล้วเปิดแผ่น)
    if (device === "mobile") {
      await clickEl(page, tid(`pos-reg-product-${QC_IDS.amer}`));
      await expectLines(page, 1);
      await clickEl(page, tid("pos-reg-cart-view"));
    }
    await clickEl(page, tid("pos-reg-bill-type"));
    await visibleEl(page, tid("pos-reg-billtype-dinein"), 0, 5_000);
    return;
  }
  await visibleEl(page, tid("pos-tbl-root"), 0, 15_000);
  if (state === "tables-empty") {
    await visibleEl(page, tid("pos-tbl-empty"), 0, 15_000);
    await visibleEl(page, tid(userKey === "owner" ? "pos-tbl-empty-setup" : "pos-tbl-empty-muted"), 0, 5_000);
    return;
  }
  if (P24U.error) throw new StepError(`fixture P2.4U: ${P24U.error}`);
  const card = (n: number) => tid(`pos-tbl-card-${p24uName(n)}`);
  await visibleEl(page, card(1), 0, 15_000);
  // แท็บโซนของรอบนี้ (รอบอื่นที่รันพร้อมกันมีโซนของตัวเอง)
  if (await page.$(tid(`pos-tbl-zone-${P24U.zones[0]}`))) await clickEl(page, tid(`pos-tbl-zone-${P24U.zones[0]}`));
  const stateOf = async (n: number) => (await page.$eval(card(n), (e: Element) => e.getAttribute("data-state")).catch(() => null)) as string | null;
  switch (state) {
    case "tables-floor": {
      const want: [number, string][] = [[3, "FREE"], [4, "DINING"], [5, "DINING"], [6, "BILL_REQUESTED"], [9, "RESERVED"], [11, "INACTIVE"]];
      const bad: string[] = [];
      for (const [n, s] of want) if ((await stateOf(n)) !== s) bad.push(`${p24uName(n)}=${await stateOf(n)} (คาด ${s})`);
      if (bad.length) throw new StepError(`สถานะการ์ดไม่ตรง: ${bad.join(" · ")}`);
      if (device === "desktop") await clickEl(page, card(5)); // โต๊ะที่เลือก (ขอบ accent) — iPad/มือถือ = แผงทับผัง จึงไม่เลือก
      return;
    }
    case "tables-panel-rounds":
      await clickEl(page, card(5));
      await visibleEl(page, tid("pos-tbl-panel"), 0, 10_000);
      await visibleEl(page, tidPrefix("pos-tbl-round-"), 1, 10_000);
      await visibleEl(page, tidPrefix("pos-tbl-served-more-"), 0, 10_000);
      await page
        .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-tbl-net"]')).some((e) => e.getClientRects().length > 0 && /\d/.test(e.textContent ?? "")), { timeout: 15_000 })
        .catch(() => {
          throw new StepError("ยอดสุทธิของโต๊ะไม่มา (quote ของโต๊ะ)");
        });
      return;
    case "tables-draft-unsent":
      await clickEl(page, card(4));
      await visibleEl(page, tid("pos-tbl-draft"), 0, 10_000);
      return;
    case "tables-checkout-dialog":
      await clickEl(page, card(5));
      await page
        .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-tbl-checkout-open"]')).some((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled), { timeout: 15_000 })
        .catch(() => {
          throw new StepError("ปุ่มเช็คบิลไม่เปิดภายใน 15 วิ (quote/กะ/PIN?)");
        });
      await clickEl(page, tid("pos-tbl-checkout-open"));
      await visibleEl(page, tid("pos-reg-paydlg"), 0, 15_000);
      return;
    case "tables-reservations-sheet":
      await clickEl(page, tid("pos-tbl-reservations"));
      await visibleEl(page, tid("pos-tbl-reservations-sheet"), 0, 10_000);
      for (const id of P24U.reservations) await visibleEl(page, tid(`pos-tbl-reservation-${id}`), 0, 10_000);
      return;
    case "tables-alerts": {
      for (const id of P24U.requests) {
        const h = await visibleEl(page, tid(`pos-tbl-alert-${id}`), 0, 15_000);
        await h.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
      }
      return;
    }
  }
}

// ═══════════════════ POS P2.5U ▸ fixture แยกบิล/ย้าย/รวม/ใบรายการ + ขั้นตอนของสถานะ (มติ 10) ═══════════════════
//   แบบ fixture ของ qc-pos-p2.5 (เมนู 15B: 8 บรรทัด ฿1,240 · ค่าบริการ 10% ⇒ ฿1,364 · Σ ทุกแบบเท่ากัน) บนร้าน QC กาแฟ — ผ่านฟังก์ชันของโมดูลเท่านั้น:
//   สินค้าชั่วคราว 8 ตัว (prisma ตรงแบบ makeFixtures · id posqc-vis-<pid>-p25u-*) · โซน/โต๊ะ = restaurant/table · เปิดโต๊ะ = pos/table registerOpenTable (4 คน · สมาชิก QC) ·
//   รอบ = pos/held-cart holdRegisterCart({newDraft}) + pos/table registerSendTableRound · แผน = pos/table-split registerSplitTable (เจ้าของร้าน) ·
//   ค่าบริการของระบบ POS ไม่ใช่ 10% = pos/payment-settings updatePosPaymentSettings แล้วคืนค่าเดิมตอนเก็บกวาด
//   ⚠️ split-locked จ่ายบิล 1 ของแผน EQUAL 4 ผ่านจอจริง (เงินสดรับพอดี) 1 ใบต่อรอบ — บิลคงไว้แบบ sale-done (ไม่ void) · รายการของโต๊ะยังไม่ผูกบิล (หารเท่า = รายการผูกเมื่อครบทุกใบ)
//   เก็บกวาด = ยกเลิกแผนที่ยังไม่ล็อก (registerCancelSplit) → ลบแถวแผน/ใบ/บรรทัดของ session ของรอบ + ชุดโต๊ะ (deleteP24uRows) + สินค้าชั่วคราว (ลบดิบเฉพาะตอนเก็บกวาด)
const P25U = {
  done: false,
  error: null as string | null,
  zones: [] as string[],
  tables: {} as Record<number, string>,
  sessions: {} as Record<number, string>,
  products: {} as Record<string, string>,
  stationsBefore: null as string[] | null,
  scBefore: null as null | { enabled: boolean; rateBp: number },
  paidLocked: false,
  log: [] as string[],
  ok: true,
};
/** เมนู 15B (ชื่อ · ชื่ออังกฤษ · ราคา/ชิ้น สตางค์ · จำนวนบนโต๊ะ) — Σ 124,000 */
const P25U_MENU: [string, string, string, number, number][] = [
  ["tomyum", "ต้มยำกุ้ง", "Tom yum goong", 18000, 1],
  ["kaprao", "กะเพราไก่ไข่ดาว", "Basil chicken, fried egg", 9900, 2],
  ["rice", "ข้าวสวย", "Steamed rice", 1500, 4],
  ["squid", "ปลาหมึกผัดไข่เค็ม", "Squid, salted egg", 23000, 1],
  ["yum", "ยำวุ้นเส้น", "Glass noodle salad", 15000, 1],
  ["chayen", "ชาไทยเย็น", "Thai iced tea", 6900, 3],
  ["latte", "ลาเต้เย็น", "Iced latte", 7500, 2],
  ["brownie", "บราวนี่", "Brownie", 6500, 1],
];
/** 15B (= ALLOC_15B ของ qc-pos-p2.5): บิล 1 = กะเพรา×2 ข้าว×3 ยำ ชาไทย×3 ลาเต้×1 · บิล 2 = ต้มยำ ปลาหมึก ข้าว×1 ลาเต้×1 บราวนี่ */
const P25U_ALLOC_15B: [string, number | null, number][] = [["tomyum", 2, 1], ["kaprao", 1, 2], ["rice", 1, 3], ["rice", 2, 1], ["squid", 2, 1], ["yum", 1, 1], ["chayen", 1, 3], ["latte", 1, 1], ["latte", 2, 1], ["brownie", 2, 1]];
/** 15C ตามที่นั่ง (= ALLOC_15C ของ qc-pos-p2.5) · กลางโต๊ะ = ยำวุ้นเส้น */
const P25U_ALLOC_15C: [string, number | null, number][] = [
  ["tomyum", 1, 1], ["rice", 1, 1], ["latte", 1, 1],
  ["squid", 2, 1], ["rice", 2, 1], ["chayen", 2, 1], ["brownie", 2, 1],
  ["kaprao", 3, 1], ["rice", 3, 1], ["chayen", 3, 1],
  ["kaprao", 4, 1], ["rice", 4, 1], ["chayen", 4, 1], ["latte", 4, 1],
  ["yum", null, 1],
];
const p25uName = (n: number) => `${P25U_LETTER}${n}`;
const P25U_PRODUCT_PREFIX = `posqc-vis-${process.pid}-p25u-`;
/** ลบแผนแยกบิลของ session ในโซน (เฉพาะตอนเก็บกวาด) แล้วลบชุดโต๊ะด้วยตัวลบของ P2.4U */
async function deleteP25uRows(zoneIds: string[]): Promise<string> {
  if (!zoneIds.length) return "";
  const tenantId = T.tenantId;
  const tables = (await prisma.restaurantTable.findMany({ where: { tenantId, zoneId: { in: zoneIds } }, select: { id: true } })).map((t) => t.id);
  const sessions = tables.length ? (await prisma.tableSession.findMany({ where: { tenantId, tableId: { in: tables } }, select: { id: true } })).map((s) => s.id) : [];
  const plans = sessions.length ? (await prisma.posTableSplit.findMany({ where: { tenantId, sessionId: { in: sessions } }, select: { id: true } })).map((x) => x.id) : [];
  let parts = 0;
  if (plans.length) {
    await prisma.posTableSplitLine.deleteMany({ where: { tenantId, splitId: { in: plans } } });
    parts = (await prisma.posTableSplitPart.deleteMany({ where: { tenantId, splitId: { in: plans } } })).count;
    await prisma.posTableSplit.deleteMany({ where: { tenantId, id: { in: plans } } });
  }
  return `แผน ${plans.length} (ใบ ${parts}) · ${await deleteP24uRows(zoneIds)}`;
}
async function ensureP25uFixture(): Promise<void> {
  if (P25U.done || P25U.error) return;
  try {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const stale = (await prisma.restaurantZone.findMany({ where: { tenantId: T.tenantId, unitId, name: { contains: P25U_ZONE_TAG }, createdAt: { lt: old } }, select: { id: true } })).map((z) => z.id);
    if (stale.length) P25U.log.push(`ซาก: ${await deleteP25uRows(stale)}`);
    const staleProducts = await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { startsWith: "posqc-vis-", contains: "-p25u-" }, createdAt: { lt: old } } });
    if (staleProducts.count) P25U.log.push(`ซากสินค้า ${staleProducts.count}`);
    const tbl = await import("@/lib/modules/restaurant/table");
    const pt = await import("@/lib/modules/pos/table");
    const hc = await import("@/lib/modules/pos/held-cart");
    const sp = await import("@/lib/modules/pos/table-split");
    const pay = await import("@/lib/modules/pos/payment-settings");
    const actor = await memberActorOf("owner");
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    const need = <R extends { ok: boolean }>(r: R, what: string): R & { ok: true } => {
      if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r).slice(0, 160)}`);
      return r as R & { ok: true };
    };
    // ค่าบริการ 10% (ภาพ 15B/15C) — ค่าระดับระบบ POS · จำค่าเดิมไว้คืน
    const cur = need(await pay.posPaymentSettings({ tenantId: T.tenantId, systemId: SYS }), "posPaymentSettings");
    if (!(cur.serviceCharge.enabled && cur.serviceCharge.rateBp === 1000)) {
      P25U.scBefore = { enabled: cur.serviceCharge.enabled, rateBp: cur.serviceCharge.rateBp };
      need(await pay.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, actor, { serviceCharge: { enabled: true, rateBp: 1000 } }), "ค่าบริการ 10%");
    }
    for (const [k, name, nameEn, price] of P25U_MENU) {
      const id = `${P25U_PRODUCT_PREFIX}${k}`;
      await prisma.posProduct.create({ data: { id, tenantId: T.tenantId, systemId: SYS, unitId, kind: "PRODUCT", name, nameEn, basePriceSatang: price } });
      P25U.products[k] = id;
    }
    P25U.stationsBefore = (await prisma.kdsStation.findMany({ where: { tenantId: T.tenantId, unitId }, select: { id: true } })).map((s) => s.id);
    const z = need(await tbl.createZone(T.tenantId, unitId, `ในร้าน · ${P25U_ZONE_TAG} ${P25U_LETTER}`), "createZone");
    P25U.zones.push(z.id);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) P25U.tables[n] = need(await tbl.createTable(T.tenantId, unitId, { zoneId: z.id, name: p25uName(n), seats: 4 }), `createTable ${p25uName(n)}`).id;
    const C = T as Any;
    const member = C.member?.phone && C.systems?.MEMBER?.id ? await prisma.customer.findFirst({ where: { tenantId: T.tenantId, memberSystemId: C.systems.MEMBER.id, phone: C.member.phone, status: "ACTIVE" }, select: { id: true } }) : null;
    if (!member) P25U.log.push("ไม่พบสมาชิก QC — โต๊ะไม่มีสมาชิก");
    const round = async (n: number, menu: [string, number][]): Promise<Record<string, string>> => {
      const lines = menu.map(([k, q]) => ({ productId: P25U.products[k]!, qty: q }));
      const h = await hc.holdRegisterCart(ctx, actor, { cart: { lines }, tableSessionId: P25U.sessions[n]!, newDraft: true });
      if (!h.ok) throw new Error(`holdRegisterCart ${p25uName(n)}: ${h.code}`);
      const s = await pt.registerSendTableRound(ctx, actor, { tableSessionId: P25U.sessions[n]!, heldCartId: h.heldCart.id });
      if (!s.ok) throw new Error(`registerSendTableRound ${p25uName(n)}: ${s.code}`);
      return Object.fromEntries(menu.map(([k], i) => [k, s.itemIds[i]!]));
    };
    const ids: Record<number, Record<string, string>> = {};
    for (const n of [1, 2, 3, 4, 5]) {
      let r = await pt.registerOpenTable(ctx, actor, { tableId: P25U.tables[n]!, guestCount: 4, ...(member ? { memberId: member.id } : {}) });
      if (!r.ok && member) r = await pt.registerOpenTable(ctx, actor, { tableId: P25U.tables[n]!, guestCount: 4 }); // ด่านสมาชิกไม่ผ่าน = เปิดโดยไม่มีสมาชิก
      if (!r.ok) throw new Error(`registerOpenTable ${p25uName(n)}: ${r.code}`);
      P25U.sessions[n] = r.sessionId;
      ids[n] = await round(n, P25U_MENU.map(([k, , , , q]) => [k, q] as [string, number]));
    }
    const plan = async (n: number, mode: "ITEM" | "EQUAL" | "SEAT", partCount: number, alloc: [string, number | null, number][] | null) => {
      const d = need(await pt.registerTableDetail(ctx, actor, { tableSessionId: P25U.sessions[n]! }), `registerTableDetail ${p25uName(n)}`);
      need(
        await sp.registerSplitTable(ctx, actor, {
          tableSessionId: P25U.sessions[n]!,
          mode,
          partCount,
          expectedItemsHash: d.itemsHash,
          allocations: alloc ? alloc.map(([k, partNo, qty]) => ({ itemId: ids[n]![k]!, partNo, qty })) : null,
        }),
        `registerSplitTable ${p25uName(n)} ${mode}`,
      );
    };
    await plan(2, "ITEM", 2, P25U_ALLOC_15B);
    await plan(3, "SEAT", 4, P25U_ALLOC_15C);
    await plan(4, "EQUAL", 4, null);
    await plan(5, "EQUAL", 2, null);
    await round(5, [["brownie", 1]]); // รอบหลังแยกบิล = รายการนอกแผน 1 (split-new-items)
    P25U.done = true;
    P25U.log.push(
      `สร้าง: สินค้า 8 · โซน 1 · โต๊ะ 7 (${p25uName(1)}…${p25uName(7)}) · session 5 · แผน ITEM/SEAT/EQUAL4/EQUAL2 · สมาชิก ${member ? "QC" : "-"}${P25U.scBefore ? ` · ค่าบริการ ${P25U.scBefore.enabled ? P25U.scBefore.rateBp / 100 : 0}% → 10%` : ""}`,
    );
  } catch (e) {
    P25U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function cleanupP25u(): Promise<void> {
  if (!P25U.zones.length && !Object.keys(P25U.products).length && !P25U.scBefore) return;
  try {
    // แผนที่ยังไม่ล็อก = ยกเลิกผ่านโมดูล (แผนที่มีใบจ่ายแล้วยกเลิกไม่ได้ — ลบแถวพร้อมชุดโต๊ะ · บิลที่จ่ายแล้วคงไว้)
    const sp = await import("@/lib/modules/pos/table-split");
    const actor = await memberActorOf("owner");
    const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
    let cancelled = 0;
    let locked = 0;
    for (const sid of Object.values(P25U.sessions)) {
      const open = await sp.openSplitOfSession(prisma, { tenantId: T.tenantId, sessionId: sid });
      if (!open) continue;
      const r = await sp.registerCancelSplit(ctx, actor, { splitId: open.id, expectedVersion: open.version });
      if (r.ok) cancelled++;
      else locked++;
    }
    P25U.log.push(`ยกเลิกแผน ${cancelled}${locked ? ` · ล็อก ${locked} (มีใบจ่ายแล้ว)` : ""}`);
    if (P25U.zones.length) P25U.log.push(`ลบ: ${await deleteP25uRows(P25U.zones)}`);
    const pids = Object.values(P25U.products);
    if (pids.length) P25U.log.push(`สินค้าชั่วคราว ${(await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { in: pids } } })).count}`);
    if (P25U.stationsBefore) {
      const st = await prisma.kdsStation.deleteMany({ where: { tenantId: T.tenantId, unitId, id: { notIn: P25U.stationsBefore }, orderItems: { none: {} }, menuItems: { none: {} } } });
      if (st.count) P25U.log.push(`สถานีครัวที่รอบสร้างให้ ${st.count}`);
    }
    if (P25U.paidLocked) P25U.log.push(`บิลจ่ายบิล 1 ของ ${p25uName(4)} คงไว้ (แบบ sale-done)`);
  } catch (e) {
    P25U.ok = false;
    P25U.log.push(`ลบไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  } finally {
    // fix1 L1: คืนค่าบริการเดิมใน try ของตัวเองเสมอ (ขั้นก่อนหน้าพัง/ทาง signal/finally ก็ไม่ทิ้งร้าน QC ไว้ที่ 10%) — สำเร็จแล้วล้าง scBefore (เรียกซ้ำไม่ทำซ้ำ)
    await restoreP25uServiceCharge();
  }
  P25U.zones = [];
  P25U.tables = {};
  P25U.sessions = {};
  P25U.products = {};
  P25U.done = false;
}
/** fix1 L1: คืนค่าบริการของระบบ POS ร้าน QC (จำไว้ตอนสร้าง fixture) — แยก try · พัง = P25U.ok false + เก็บ scBefore ไว้ให้รอบ finally/signal ลองอีก */
async function restoreP25uServiceCharge(): Promise<void> {
  const before = P25U.scBefore;
  if (!before) return;
  try {
    const pay = await import("@/lib/modules/pos/payment-settings");
    const r = await pay.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, await memberActorOf("owner"), { serviceCharge: before });
    if (!r.ok) throw new Error(r.code);
    P25U.scBefore = null;
    P25U.log.push(`คืนค่าบริการ ${before.enabled ? before.rateBp / 100 : 0}%`);
  } catch (e) {
    P25U.ok = false;
    P25U.log.push(`คืนค่าบริการเดิมไม่สำเร็จ (${before.enabled ? before.rateBp / 100 : 0}%): ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
}
const p25uCleanupLine = () => `${P25U.ok ? "🧹" : "⚠️"} P2.5U: ${P25U.log.join(" · ")}`;
async function runP25uState(page: Any, state: P25uTablesKey | P25uRegKey, device: Device): Promise<void> {
  await visibleEl(page, tid("pos-tbl-root"), 0, 15_000);
  if (P25U.error) throw new StepError(`fixture P2.5U: ${P25U.error}`);
  const card = (n: number) => tid(`pos-tbl-card-${p25uName(n)}`);
  await visibleEl(page, card(1), 0, 15_000).catch(async () => {
    if (await page.$(tid(`pos-tbl-zone-${P25U.zones[0]}`))) await clickEl(page, tid(`pos-tbl-zone-${P25U.zones[0]}`));
    await visibleEl(page, card(1), 0, 10_000);
  });
  if (await page.$(tid(`pos-tbl-zone-${P25U.zones[0]}`))) await clickEl(page, tid(`pos-tbl-zone-${P25U.zones[0]}`));
  const owner = userKey === "owner";
  const disabled = async (sel: string) => (await (await visibleEl(page, sel, 0, 10_000)).evaluate((e: Element) => (e as HTMLButtonElement).disabled)) as boolean;
  const panelOf = async (n: number) => {
    await clickEl(page, card(n));
    await visibleEl(page, tid("pos-tbl-panel"), 0, 10_000);
    await visibleEl(page, tid("pos-tbl-splitBill"), 0, 15_000);
  };
  const openSplit = async (n: number) => {
    await panelOf(n);
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-tbl-splitBill"]')).some((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled), { timeout: 15_000 })
      .catch(() => {
        throw new StepError("ปุ่มแยกบิลไม่เปิดภายใน 15 วิ (แผงโต๊ะ/สิทธิ์ขาย?)");
      });
    await clickEl(page, tid("pos-tbl-splitBill"));
    await visibleEl(page, tid("pos-tbl-split-modal"), 0, 15_000);
    await visibleEl(page, tid("pos-tbl-split-footer"), 0, 15_000);
    await page
      .waitForFunction(() => !document.querySelector('[data-testid="pos-tbl-split-modal"]')?.textContent?.includes("…"), { timeout: 15_000 })
      .catch(() => undefined);
  };
  const payDialogOfPart1 = async () => {
    await clickEl(page, tid("pos-tbl-split-select-1"));
    await clickEl(page, tid("pos-tbl-split-payPart-1"));
    await visibleEl(page, tid("pos-reg-paydlg"), 0, 15_000);
    await visibleEl(page, tid("pos-reg-paydlg-splitchip"), 0, 15_000);
  };
  switch (state) {
    case "tbl-panel-actions": {
      await panelOf(1);
      for (const id of ["pos-tbl-moveTable", "pos-tbl-mergeTable", "pos-tbl-splitBill", "pos-tbl-printList"]) await visibleEl(page, tid(id), 0, 10_000);
      if ((await disabled(tid("pos-tbl-moveTable"))) === owner) throw new StepError(`ปุ่มย้ายโต๊ะ ${owner ? "ปิด (เจ้าของต้องกดได้)" : "เปิด (แคชเชียร์ไม่มีคีย์ restaurant.session.move)"}`);
      await page
        .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-tbl-net"]')).some((e) => e.getClientRects().length > 0 && /\d/.test(e.textContent ?? "")), { timeout: 15_000 })
        .catch(() => {
          throw new StepError("ยอดสุทธิของโต๊ะไม่มา (quote ของโต๊ะ)");
        });
      return;
    }
    case "tables-floor-split": {
      await visibleEl(page, tid(`pos-tbl-card-split-${p25uName(4)}`), 0, 15_000);
      if (device === "desktop") {
        await clickEl(page, card(4));
        await visibleEl(page, '[data-testid="pos-tbl-checkout-open"][data-split="open"]', 0, 15_000);
        // fix1 V2: แผงของโต๊ะที่แยกบิลยังมี รวม/ค่าบริการ/ยอดสุทธิ (ยอดของแผน) — ไม่ใช่ "—"
        await page
          .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-tbl-net"]')).some((e) => e.getClientRects().length > 0 && /\d/.test(e.textContent ?? "")), { timeout: 15_000 })
          .catch(() => {
            throw new StepError("ยอดสุทธิของโต๊ะที่แยกบิลไม่มา (ยอดของแผน registerSplitDetailAction)");
          });
      }
      return;
    }
    case "split-items":
      await openSplit(2);
      await visibleEl(page, '[data-testid="pos-tbl-split-modal"][data-mode="ITEM"]', 0, 10_000);
      await visibleEl(page, tid("pos-tbl-split-card-2"), 0, 10_000);
      return;
    case "split-equal":
      await openSplit(1);
      await clickEl(page, tid("pos-tbl-split-tab-equal"));
      await visibleEl(page, tid("pos-tbl-split-equal-big"), 0, 10_000);
      await visibleEl(page, tid("pos-tbl-split-card-4"), 0, 10_000);
      return;
    case "split-seat":
      await openSplit(3);
      await visibleEl(page, '[data-testid="pos-tbl-split-modal"][data-mode="SEAT"]', 0, 10_000);
      await visibleEl(page, tid("pos-tbl-split-seatrow-shared"), 0, 10_000);
      return;
    case "split-locked": {
      await openSplit(4);
      const st = await (await visibleEl(page, tid("pos-tbl-split-card-1"), 0, 10_000)).evaluate((e: Element) => e.getAttribute("data-status"));
      if (st !== "PAID") {
        // ⚠️ จ่ายจริง 1 ใบต่อรอบ: บิล 1 เงินสดรับพอดี → ขายสำเร็จ → ถัดไป = กลับแผงแยกบิล (ล็อก)
        await payDialogOfPart1();
        await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
        await page
          .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-reg-paydlg-confirm"]')).some((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled), { timeout: 15_000 })
          .catch(() => {
            throw new StepError("ปุ่มยืนยันของจอชำระไม่เปิด (quote ของใบ/กะ/โทเคนผู้ขาย?)");
          });
        await clickEl(page, tid("pos-reg-paydlg-confirm"));
        await visibleEl(page, tid("pos-reg-done"), 0, 20_000);
        P25U.paidLocked = true;
        await clickEl(page, tid("pos-reg-done-next"));
        await visibleEl(page, tid("pos-tbl-split-modal"), 0, 15_000);
      }
      await page
        .waitForFunction(() => document.querySelector('[data-testid="pos-tbl-split-modal"]')?.getAttribute("data-locked") === "true", { timeout: 15_000 })
        .catch(() => {
          throw new StepError("แผงแยกบิลไม่เข้าสถานะล็อกหลังจ่ายบิล 1");
        });
      await visibleEl(page, tid("pos-tbl-split-locked"), 0, 10_000);
      return;
    }
    case "split-new-items":
      await openSplit(5);
      await visibleEl(page, tid("pos-tbl-split-newitems"), 0, 10_000);
      return;
    case "split-part-pay":
      await openSplit(2);
      await payDialogOfPart1();
      return;
    case "move-sheet":
    case "merge-sheet": {
      const btn = state === "move-sheet" ? "pos-tbl-moveTable" : "pos-tbl-mergeTable";
      await panelOf(1);
      if (!owner) {
        // แคชเชียร์ QC = pos.sale.create เท่านั้น (seed ไม่มี restaurant.session.move|merge) ⇒ ปุ่มปิด + tooltip — ภาพ = แผงที่ปุ่มปิด
        if (!(await disabled(tid(btn)))) throw new StepError(`${btn} เปิดให้แคชเชียร์ (ไม่มีคีย์ restaurant.session.*)`);
        return;
      }
      await clickEl(page, tid(btn));
      if (state === "move-sheet") {
        await visibleEl(page, tid("pos-tbl-move-sheet"), 0, 10_000);
        await visibleEl(page, tid(`pos-tbl-pick-${p25uName(6)}`), 0, 10_000);
      } else {
        await visibleEl(page, tid("pos-tbl-merge-sheet"), 0, 10_000);
        await clickEl(page, tid(`pos-tbl-merge-pick-${p25uName(2)}`));
        await visibleEl(page, tid("pos-tbl-merge-summary"), 0, 10_000);
      }
      return;
    }
    case "prebill-preview":
      await panelOf(1);
      await clickEl(page, tid("pos-tbl-printList"));
      await visibleEl(page, tid("pos-tbl-prebill-preview"), 0, 10_000);
      await visibleEl(page, tid("pos-tbl-prebill-frame"), 0, 15_000);
      return;
  }
}

// ═══════════════════ POS P2.6U ▸ fixture จอครัว + ขั้นตอนของสถานะ (มติ 12) ═══════════════════
//   สร้างผ่านฟังก์ชันของโมดูลเท่านั้น: สถานี = restaurant/menu createStation (ชื่อ + ตัวอักษรของรอบ — รอบ th/en/เจ้าของ/แคชเชียร์ที่รันพร้อมกันไม่ชนชื่อ) ·
//   เส้นทางครัว = catalog.updateProduct({stationId}) (อเมริกาโน่/ครัวซองต์ → ครัวร้อน · ลาเต้ → เครื่องดื่ม · ค่าก่อนหน้าคืนตอนเก็บกวาด) ·
//   ตั๋ว = pos/order ingestOrder (ช่องทางโทรสั่ง DIRECT · startStatus ACCEPTED · ไม่จ่าย) + acceptOrder ของแชท (ไม่จ่าย) + โต๊ะ (pos/table registerOpenTable +
//   held-cart + registerSendTableRound · ไม่เช็คบิล) + บิลหน้าขาย 1 ใบ (เงินสด · ⚠️ บิลเก็บไว้แบบบิลภาพอื่น — ขายไม่ได้ = ข้าม ไม่ทำให้ภาพตก) ·
//   เดินตั๋ว = pos/kds kdsStart/kdsLineDone/kdsTicketDone/kdsServed/kdsRush ในนามเจ้าของ · 86 = catalog.setAvailability(KDS) · พักครัว = menu.setKitchenPause
//   เวลา "เลยเป้า/ใกล้เป้า" = เลื่อน RestaurantOrder.createdAt (sentAt) ย้อนหลังก่อนทุกภาพ (แบบการจัดฉากของ qc-pos-p2.6) — เป้า 10 นาที (prepMinutes ของออเดอร์)
//   เก็บกวาด = ลบออเดอร์/รอบ/รายการ/โต๊ะของรอบนี้ตามไอดี · คืน 86/พักครัว/สถานีของสินค้า · ลบสถานีของรอบ — หลังงานสุดท้ายที่ใช้ · finally · สัญญาณ
const P26U = {
  done: false,
  error: null as string | null,
  stamp: `${process.pid}-${Date.now().toString(36)}`,
  seq: 0,
  startedAt: new Date(),
  stations: { hot: "", drink: "", dessert: "" },
  stationsCreated: [] as string[],
  productStation: {} as Record<string, string | null>,
  orders: [] as string[],
  roundOf: {} as Record<string, string>,
  zones: [] as string[],
  tableSession: "",
  sale: "",
  shiftId: "",
  saleVoided: false,
  marked: [] as string[],
  pausedBefore: undefined as { paused: boolean; note: string | null } | undefined,
  pausedOn: false,
  voidedReady: false,
  log: [] as string[],
  ok: true,
};
const P26U_STATION_NAMES = { hot: `ครัวร้อน ${P26U_LETTER}`, drink: `เครื่องดื่ม ${P26U_LETTER}`, dessert: `ขนม ${P26U_LETTER}` } as const;
const p26uKey = () => `posqc-vis-p26u-${P26U.stamp}-${++P26U.seq}`;
/** fix1 V4: เครื่องของบิลหน้าขายใน fixture (กะของตัวเอง — สาขา QC บังคับกะ) */
const P26U_DEVICE_ID = `posqc-vis-p26u-${process.pid}`;
async function p26uCtx() {
  return { ctx: { tenantId: T.tenantId, systemId: SYS, unitId }, actor: await memberActorOf("owner") };
}
/** เส้นทางของจอครัวต่อสถานะ (สถานีรู้หลังสร้าง fixture) */
function p26uPath(job: Job): string {
  const st = job.state as P26uKdsKey | P26uOtherKey;
  if (!P26U_KDS_KEYS.has(st)) return job.path ?? pathOf(job.page);
  const u = st === "kds-empty-unit" ? P26U_EMPTY_UNIT : unitId;
  const station = st === "kds-empty-unit" ? "" : st === "kds-expo" ? "expo" : st === "kds-empty-station" ? P26U.stations.dessert : st === "kds-refusal-toast" ? P26U.stations.drink : P26U.stations.hot;
  return `/app/sys/${SYS}/pos/kds?unit=${encodeURIComponent(u)}${station ? `&station=${encodeURIComponent(station)}` : ""}`;
}
async function p26uKds(fn: "kdsStart" | "kdsTicketDone" | "kdsServed" | "kdsLineDone" | "kdsRush", input: Record<string, unknown>): Promise<void> {
  const kds = await import("@/lib/modules/pos/kds");
  const { ctx, actor } = await p26uCtx();
  const r = await (kds[fn] as (c: unknown, a: unknown, i: unknown) => Promise<{ ok: boolean; code?: string }>)(ctx, actor, input);
  if (!r.ok) throw new Error(`${fn}: ${r.code}`);
}
/** รอบครัวของออเดอร์ (posOrderId) — รอบถูกสร้างในธุรกรรมรับ */
async function p26uRound(orderId: string): Promise<string> {
  const r = await prisma.restaurantOrder.findFirst({ where: { tenantId: T.tenantId, unitId, posOrderId: orderId }, select: { id: true } });
  if (!r) throw new Error(`ออเดอร์ ${orderId} ไม่มีรอบครัว (สถานีไม่ผูก?)`);
  return r.id;
}
async function p26uOrder(tag: string, channelId: string, lines: { productId: string; qty: number; note?: string }[], opts: { accepted: boolean; name: string }): Promise<string> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p26uCtx();
  const r = await ord.ingestOrder(ctx, actor, {
    idempotencyKey: p26uKey(),
    channelId,
    lines,
    customer: { name: opts.name },
    fulfilment: "PICKUP",
    paymentState: "UNPAID",
    ...(opts.accepted ? { startStatus: "ACCEPTED", prepMinutes: 10 } : {}),
  });
  if (!r.ok) throw new Error(`ingestOrder ${tag}: ${r.code} ${(r as Any).message ?? ""}`.slice(0, 200));
  P26U.orders.push(r.orderId);
  // แชท: รับเองเมื่อยังเป็น NEW (ช่องทางที่เปิดรับอัตโนมัติไว้ = รับแล้วตอนเข้า)
  if (!opts.accepted && (await prisma.posOrder.findUnique({ where: { id: r.orderId }, select: { status: true } }))?.status === "NEW") {
    const a = await ord.acceptOrder(ctx, actor, { id: r.orderId, prepMinutes: 10 });
    if (!a.ok) throw new Error(`acceptOrder ${tag}: ${a.code}`);
  }
  P26U.roundOf[tag] = await p26uRound(r.orderId);
  return r.orderId;
}
/** เลยเป้า (11 นาที) / ใกล้เป้า (8 นาที 30 วิ) ของเป้า 10 นาที — เรียกก่อนทุกภาพ (ตัวจับเวลาเดินจาก sentAt) */
async function p26uRetime(): Promise<void> {
  const at = (ms: number) => new Date(Date.now() - ms);
  if (P26U.roundOf.late) await prisma.restaurantOrder.updateMany({ where: { tenantId: T.tenantId, id: P26U.roundOf.late }, data: { createdAt: at(11 * 60_000) } });
  if (P26U.roundOf.warn) await prisma.restaurantOrder.updateMany({ where: { tenantId: T.tenantId, id: P26U.roundOf.warn }, data: { createdAt: at(8 * 60_000 + 30_000) } });
  if (P26U.roundOf.fresh) await prisma.restaurantOrder.updateMany({ where: { tenantId: T.tenantId, id: P26U.roundOf.fresh }, data: { createdAt: at(40_000) } });
}
async function ensureP26uFixture(): Promise<void> {
  if (P26U.done || P26U.error) return;
  try {
    if (!QC_IDS.amer || !QC_IDS.latte || !QC_IDS.crois) throw new Error("ไม่พบอเมริกาโน่เย็น/ลาเต้ร้อน/ครัวซองต์เนยสดของร้าน QC (seed-pos-qc)");
    const menu = await import("@/lib/modules/restaurant/menu");
    const catalog = await import("@/lib/modules/pos/catalog");
    const { listChannels, saveChannel } = await import("@/lib/modules/pos/channel");
    const { ctx, actor } = await p26uCtx();
    // ซากรอบที่ถูก kill (สถานีชื่อ "<ฐาน> <อักษร>" ของรอบนี้ที่ยังอยู่ = ลบ ถ้าไม่มีรายการอ้างถึง)
    const names = Object.values(P26U_STATION_NAMES);
    const stale = await prisma.kdsStation.findMany({ where: { tenantId: T.tenantId, unitId, name: { in: names } }, select: { id: true } });
    if (stale.length) {
      const del = await prisma.kdsStation.deleteMany({ where: { id: { in: stale.map((x) => x.id) }, orderItems: { none: {} }, menuItems: { none: {} } } });
      if (del.count) P26U.log.push(`ซากสถานี ${del.count}`);
    }
    for (const [k, name] of Object.entries(P26U_STATION_NAMES) as [keyof typeof P26U_STATION_NAMES, string][]) {
      const r = await menu.createStation(T.tenantId, unitId, name);
      if (!r.ok) throw new Error(`createStation ${name}: ${r.reason}`);
      const row = await prisma.kdsStation.findFirst({ where: { tenantId: T.tenantId, unitId, name, archivedAt: null }, select: { id: true } });
      if (!row) throw new Error(`ไม่พบสถานี ${name} หลังสร้าง`);
      P26U.stations[k] = row.id;
      P26U.stationsCreated.push(row.id);
    }
    // เส้นทางครัวของสินค้า (คืนค่าเดิมตอนเก็บกวาด)
    const cctx = { tenantId: T.tenantId, systemId: SYS, actorUserId: actor.userId };
    for (const [pid, st] of [[QC_IDS.amer, P26U.stations.hot], [QC_IDS.crois, P26U.stations.hot], [QC_IDS.latte, P26U.stations.drink]] as [string, string][]) {
      const before = await prisma.posProduct.findFirst({ where: { id: pid, tenantId: T.tenantId }, select: { stationId: true } });
      P26U.productStation[pid] = before?.stationId ?? null;
      await catalog.updateProduct(cctx, pid, { stationId: st });
    }
    // ช่องทาง: โทรสั่ง (DIRECT · adapter NONE แบบ P2.8U) + แชท
    const l = await listChannels(ctx, actor, { includeArchived: true });
    if (!l.ok) throw new Error(`listChannels: ${l.code}`);
    const chat = l.items.find((c) => c.code === "CHAT" && !c.archived && c.active);
    if (!chat) throw new Error("ช่องทางแชท (CHAT) ของสาขา QC ไม่พร้อม");
    let phone = l.items.find((c) => c.code === P28U_PHONE.code);
    if (phone?.archived) throw new Error(`ช่องทาง ${P28U_PHONE.code} ถูกเก็บแล้ว (ผู้คุมงานตัดสิน)`);
    if (!phone) {
      const r = await saveChannel(ctx, actor, { code: P28U_PHONE.code, name: P28U_PHONE.name, payout: "DIRECT" });
      if (!r.ok) throw new Error(`สร้างช่องทาง ${P28U_PHONE.code}: ${r.code}`);
      phone = r.channel;
    } else if (!phone.active || phone.payout !== "DIRECT" || phone.adapter !== "NONE") {
      const r = await saveChannel(ctx, actor, { id: phone.id, name: P28U_PHONE.name, active: true, payout: "DIRECT", adapter: "NONE" });
      if (!r.ok) throw new Error(`แก้ช่องทาง ${P28U_PHONE.code}: ${r.code}`);
    }
    const A = QC_IDS.amer;
    const C = QC_IDS.crois;
    const LT = QC_IDS.latte;
    // ใหม่: อเมริกาโน่ (ครัวร้อน) + ลาเต้ (เครื่องดื่ม → พร้อม = expo)
    await p26uOrder("fresh", phone.id, [{ productId: A, qty: 1, note: "หวานน้อย" }, { productId: LT, qty: 1 }], { accepted: true, name: "คุณเอก (ภาพ QC)" });
    await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.fresh, stationId: P26U.stations.drink });
    // กำลังทำ: เร่ง + เลยเป้า · ใกล้เป้า
    await p26uOrder("late", phone.id, [{ productId: C, qty: 2, note: "อุ่นร้อน" }, { productId: A, qty: 1 }], { accepted: true, name: "คุณนิด (ภาพ QC)" });
    await p26uKds("kdsStart", { orderId: P26U.roundOf.late, stationId: P26U.stations.hot });
    await p26uKds("kdsRush", { orderId: P26U.roundOf.late, rush: true });
    await p26uOrder("warn", phone.id, [{ productId: A, qty: 2 }], { accepted: true, name: "คุณมาลี (ภาพ QC)" });
    await p26uKds("kdsStart", { orderId: P26U.roundOf.warn, stationId: P26U.stations.hot });
    // โต๊ะ: รอบ 2 บรรทัด → เริ่ม + เสร็จ 1 บรรทัด (เสร็จ 1/2)
    {
      const tbl = await import("@/lib/modules/restaurant/table");
      const pt = await import("@/lib/modules/pos/table");
      const hc = await import("@/lib/modules/pos/held-cart");
      const z = await tbl.createZone(T.tenantId, unitId, `ในร้าน · QC P2.6U ${P26U_LETTER}`);
      if (!z.ok) throw new Error(`createZone: ${JSON.stringify(z).slice(0, 120)}`);
      P26U.zones.push(z.id);
      const t = await tbl.createTable(T.tenantId, unitId, { zoneId: z.id, name: `${P26U_LETTER}2`, seats: 4 });
      if (!t.ok) throw new Error(`createTable: ${JSON.stringify(t).slice(0, 120)}`);
      const op = await pt.registerOpenTable(ctx, actor, { tableId: t.id, guestCount: 2 });
      if (!op.ok) throw new Error(`registerOpenTable: ${op.code}`);
      P26U.tableSession = op.sessionId;
      const h = await hc.holdRegisterCart(ctx, actor, { cart: { lines: [{ productId: A, qty: 1, note: "ไม่ใส่น้ำแข็ง" }, { productId: C, qty: 1 }] }, tableSessionId: op.sessionId, newDraft: true });
      if (!h.ok) throw new Error(`holdRegisterCart: ${h.code}`);
      const s = await pt.registerSendTableRound(ctx, actor, { tableSessionId: op.sessionId, heldCartId: h.heldCart.id });
      if (!s.ok) throw new Error(`registerSendTableRound: ${s.code}`);
      const round = await prisma.restaurantOrder.findFirst({ where: { tenantId: T.tenantId, sessionId: op.sessionId }, select: { id: true } });
      if (!round) throw new Error("รอบโต๊ะไม่มีในฐาน");
      P26U.roundOf.table = round.id;
      await p26uKds("kdsStart", { orderId: round.id, stationId: P26U.stations.hot });
      if (s.itemIds[0]) await p26uKds("kdsLineDone", { itemId: s.itemIds[0] });
    }
    // พร้อม: โทรสั่ง 1 ใบ
    await p26uOrder("ready", phone.id, [{ productId: C, qty: 1 }], { accepted: true, name: "คุณบอย (ภาพ QC)" });
    await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.ready, stationId: P26U.stations.hot });
    // เสิร์ฟแล้ว (แถบ "เสิร์ฟแล้ววันนี้" ของครัวร้อน): แชทรับแล้ว → พร้อม → เสิร์ฟ
    await p26uOrder("served", chat.id, [{ productId: A, qty: 1 }], { accepted: false, name: "คุณแพร (ภาพ QC)" });
    await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.served, stationId: P26U.stations.hot });
    await p26uKds("kdsServed", { orderId: P26U.roundOf.served, stationId: P26U.stations.hot });
    // บิลหน้าขาย 1 ใบ (ซื้อกลับ · คิว N) ในกะของเครื่อง fixture (fix1 V4 · ยกเลิกบิล + ปิดกะตอนเก็บกวาด = มติ fix1-5) — ขายไม่ได้ = ข้ามพร้อมบันทึก
    try {
      const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
      const { openShift } = await import("@/lib/modules/pos/shift");
      const dctx = { ...ctx, deviceId: P26U_DEVICE_ID };
      const op = await openShift(dctx, actor, { deviceId: P26U_DEVICE_ID, deviceLabel: "เครื่องภาพครัว QC", floatSatang: 100000 });
      if (!op.ok) throw new Error(`openShift ${op.code}`);
      P26U.shiftId = op.shift.id;
      const cart = { lines: [{ productId: C, qty: 1 }] };
      const q = await quoteRegisterCart(dctx, actor, cart as never);
      if (!q.ok) throw new Error(`quote ${q.code}`);
      const r = await submitRegisterSale(dctx, actor, { ...cart, idempotencyKey: p26uKey(), expectedGrandTotalSatang: q.grandTotalSatang, payMethods: [{ type: "CASH", amountSatang: q.grandTotalSatang }], cashReceivedSatang: q.grandTotalSatang } as never);
      if (!r.ok) throw new Error(`submit ${r.code}`);
      P26U.sale = r.saleId;
      for (let i = 0; i < 20 && !P26U.roundOf.sale; i++) {
        const rr = await prisma.restaurantOrder.findFirst({ where: { tenantId: T.tenantId, posSaleId: r.saleId }, select: { id: true } });
        if (rr) P26U.roundOf.sale = rr.id;
        else await sleep(250);
      }
      if (P26U.roundOf.sale) await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.sale, stationId: P26U.stations.hot });
      P26U.log.push(`บิลหน้าขาย ${r.saleId} (ยกเลิกตอนเก็บกวาด)`);
    } catch (e) {
      P26U.log.push(`ข้ามบิลหน้าขาย: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
    }
    // ของหมด (86): ครัวซองต์ ครัวแจ้ง (หลังขาย — สินค้าที่หมดขายไม่ได้)
    const r86 = await catalog.setAvailability(ctx, actor, { productId: C, unitId, available: false, source: "KDS", note: "ภาพ QC" });
    if (!r86.ok) throw new Error(`setAvailability 86: ${r86.code}`);
    P26U.marked.push(C);
    await p26uRetime();
    P26U.done = true;
    P26U.log.push(`สร้าง: สถานี 3 (${P26U_LETTER}) · ออเดอร์ ${P26U.orders.length} · โต๊ะ 1 · 86 ครัวซองต์`);
  } catch (e) {
    P26U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** kds-served-recall: ใบล่าสุดของแถบต้องเป็น SERVED ก่อนทุกภาพ (ภาพก่อนหน้าดึงกลับไปแล้ว) */
async function p26uServeAgain(): Promise<void> {
  const st = P26U.stations.hot;
  const items = await prisma.restaurantOrderItem.findMany({ where: { tenantId: T.tenantId, orderId: P26U.roundOf.served, stationId: st }, select: { kdsStatus: true } });
  if (items.every((i) => i.kdsStatus === "SERVED" || i.kdsStatus === "CANCELLED")) return;
  await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.served, stationId: st });
  await p26uKds("kdsServed", { orderId: P26U.roundOf.served, stationId: st });
}
/** kds-refusal-toast: แชทเสิร์ฟแล้วที่เครื่องดื่ม แล้วยกเลิกออเดอร์ (ใบล่าสุดของแถบเครื่องดื่ม = ดึงกลับไม่ได้) — ครั้งเดียวต่อรอบ */
async function p26uVoidedServed(): Promise<void> {
  if (P26U.voidedReady) return;
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p26uCtx();
  const l = await (await import("@/lib/modules/pos/channel")).listChannels(ctx, actor, { includeArchived: false });
  const chat = l.ok ? l.items.find((c) => c.code === "CHAT") : null;
  if (!chat) throw new StepError("ไม่มีช่องทางแชทของสาขา QC");
  const id = await p26uOrder("voided", chat.id, [{ productId: QC_IDS.latte, qty: 1 }], { accepted: false, name: "คุณเจ (ภาพ QC)" });
  await p26uKds("kdsTicketDone", { orderId: P26U.roundOf.voided, stationId: P26U.stations.drink });
  await p26uKds("kdsServed", { orderId: P26U.roundOf.voided, stationId: P26U.stations.drink });
  const c = await ord.cancelOrder(ctx, actor, { id, reason: "ลูกค้ายกเลิก (ภาพ QC)" });
  if (!c.ok) throw new StepError(`cancelOrder: ${c.code}`);
  P26U.voidedReady = true;
}
async function p26uPause(on: boolean): Promise<void> {
  const menu = await import("@/lib/modules/restaurant/menu");
  if (on) {
    if (P26U.pausedOn) return;
    const before = await prisma.restaurantSetting.findUnique({ where: { unitId }, select: { kitchenPaused: true, kitchenPausedNote: true } });
    P26U.pausedBefore = { paused: before?.kitchenPaused ?? false, note: before?.kitchenPausedNote ?? null };
    await menu.setKitchenPause(T.tenantId, unitId, true, "ภาพ QC");
    P26U.pausedOn = true;
    return;
  }
  if (!P26U.pausedOn) return;
  await menu.setKitchenPause(T.tenantId, unitId, P26U.pausedBefore?.paused ?? false, P26U.pausedBefore?.note ?? undefined);
  P26U.pausedOn = false;
  P26U.log.push("คืนค่าพักครัว");
}
async function cleanupP26u(): Promise<void> {
  // fix2 G1: บิล/กะของ fixture ที่ยังค้าง (ยกเลิก/ปิดล้มรอบก่อน) ก็ต้องเข้ามาเก็บอีกรอบ — ยกเลิก/ปิดซ้ำได้ (คีย์ยกเลิกคงที่ · ปิดกะที่ไม่ OPEN = ok)
  if (!P26U.stationsCreated.length && !P26U.orders.length && !P26U.zones.length && !P26U.marked.length && !P26U.pausedOn && !P26U.shiftId && !(P26U.sale && !P26U.saleVoided)) return;
  const step = async (name: string, fn: () => Promise<string | void>) => {
    try {
      const r = await fn();
      if (r) P26U.log.push(r);
    } catch (e) {
      P26U.ok = false;
      P26U.log.push(`${name} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  const tenantId = T.tenantId;
  await step("คืนค่าพักครัว", () => p26uPause(false));
  await step("คืน 86", async () => {
    if (!P26U.marked.length) return;
    const catalog = await import("@/lib/modules/pos/catalog");
    const { ctx, actor } = await p26uCtx();
    for (const pid of P26U.marked) {
      const r = await catalog.setAvailability(ctx, actor, { productId: pid, unitId, available: true, source: "KDS" });
      if (!r.ok) throw new Error(`setAvailability(true) ${pid}: ${r.code}`);
    }
    const ev = (await prisma.outboxEvent.deleteMany({ where: { tenantId, type: "pos.product.availability", createdAt: { gte: P26U.startedAt }, OR: P26U.marked.map((pid) => ({ payload: { path: ["productId"], equals: pid } })) } })).count;
    P26U.marked = [];
    return `คืน 86 · outbox 86 ${ev}`;
  });
  await step("คืนสถานีของสินค้า", async () => {
    const ids = Object.keys(P26U.productStation);
    if (!ids.length) return;
    const catalog = await import("@/lib/modules/pos/catalog");
    const actor = await memberActorOf("owner");
    for (const pid of ids) await catalog.updateProduct({ tenantId, systemId: SYS, actorUserId: actor.userId }, pid, { stationId: P26U.productStation[pid] ?? null });
    P26U.productStation = {};
    return `คืนสถานีสินค้า ${ids.length}`;
  });
  // fix1 F5 (มติ fix1-5): ยกเลิกบิลหน้าขายของ fixture (ตัวรับคิวยกเลิกตั๋ว · คืนสต็อก) แล้วปิดกะของเครื่อง fixture
  await step("ยกเลิกบิลหน้าขาย", async () => {
    if (!P26U.sale || P26U.saleVoided) return;
    const { voidSaleByActor } = await import("@/lib/modules/pos/bills");
    const actor = await memberActorOf("owner");
    const v = await voidSaleByActor({ tenantId, systemId: SYS, unitId, deviceId: P26U_DEVICE_ID }, actor, { unitId, saleId: P26U.sale, reason: "ยกเลิกบิลภาพครัว (ภาพ QC)", idempotencyKey: `posqc-vis-p26u-void-${P26U.stamp}` });
    if (!v.ok) throw new Error(`voidSaleByActor ${P26U.sale}: ${v.code}`);
    P26U.saleVoided = true;
    return `ยกเลิกบิล ${P26U.sale}`;
  });
  await step("ปิดกะ fixture", async () => {
    if (!P26U.shiftId) return;
    const c = await closeShiftAsOwner(P26U.shiftId, `p26u-close-${P26U.stamp}`);
    if (!c.ok) throw new Error(c.detail);
    P26U.shiftId = "";
    return c.detail;
  });
  await step("ลบรอบ/ออเดอร์", async () => {
    const rounds = (await prisma.restaurantOrder.findMany({ where: { tenantId, OR: [{ posOrderId: { in: P26U.orders } }, ...(P26U.sale ? [{ posSaleId: P26U.sale }] : [])] }, select: { id: true } })).map((r) => r.id);
    const items = rounds.length ? (await prisma.restaurantOrderItem.findMany({ where: { tenantId, orderId: { in: rounds } }, select: { id: true } })).map((i) => i.id) : [];
    if (items.length) {
      await prisma.restaurantOrderItemOption.deleteMany({ where: { orderItemId: { in: items } } });
      await prisma.restaurantOrderItem.deleteMany({ where: { id: { in: items } } });
    }
    if (rounds.length) await prisma.restaurantOrder.deleteMany({ where: { id: { in: rounds } } });
    const kill = P26U.orders;
    let od = 0;
    if (kill.length) {
      await prisma.posOrderEvent.deleteMany({ where: { tenantId, orderId: { in: kill } } });
      await prisma.posOrderLine.deleteMany({ where: { tenantId, orderId: { in: kill } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId, type: { startsWith: "pos.order." }, OR: kill.map((id) => ({ idempotencyKey: { endsWith: `#${id}` } })) } });
      await prisma.auditLog.deleteMany({ where: { tenantId, targetType: "PosOrder", targetId: { in: kill } } });
      od = (await prisma.posOrder.deleteMany({ where: { tenantId, id: { in: kill }, saleId: null } })).count;
    }
    P26U.orders = [];
    P26U.roundOf = {};
    return `ลบ: รอบ ${rounds.length} · รายการ ${items.length} · ออเดอร์ ${od}${P26U.sale ? ` · บิลหน้าขาย ${P26U.sale} ${P26U.saleVoided ? "ยกเลิกแล้ว" : "ค้าง"}` : ""}`;
  });
  await step("ลบโต๊ะ", async () => {
    if (!P26U.zones.length) return;
    const r = await deleteP24uRows(P26U.zones);
    P26U.zones = [];
    return `โต๊ะ: ${r}`;
  });
  await step("ลบสถานี", async () => {
    if (!P26U.stationsCreated.length) return;
    const d = await prisma.kdsStation.deleteMany({ where: { tenantId, id: { in: P26U.stationsCreated }, orderItems: { none: {} }, menuItems: { none: {} } } });
    const left = P26U.stationsCreated.length - d.count;
    P26U.stationsCreated = [];
    if (left) throw new Error(`สถานีของรอบยังมีรายการอ้างถึง ${left} (ไม่ลบ)`);
    return `ลบสถานี ${d.count}`;
  });
  P26U.done = false;
  P26U.voidedReady = false;
}
const p26uCleanupLine = () => `${P26U.ok ? "🧹" : "⚠️"} P2.6U: ${P26U.log.join(" · ")}`;
async function runP26uState(page: Any, state: P26uKdsKey | P26uOtherKey, device: Device): Promise<void> {
  if (state !== "kds-empty-unit" && P26U.error) throw new StepError(`fixture P2.6U: ${P26U.error}`);
  if (state === "register-tile-86") {
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
    await visibleEl(page, tid("pos-reg-tile-86"), 0, 15_000).catch(() => {
      throw new StepError("ไทล์ครัวซองต์ไม่ขึ้น \"หมด · ครัวแจ้ง HH:MM\" (pos-reg-tile-86)");
    });
    return;
  }
  if (state === "orders-kitchen-meter") {
    await visibleEl(page, tid("pos-ord-root"), 0, 15_000);
    if (device === "mobile") await clickEl(page, tid("pos-ord-coltab-preparing")).catch(() => undefined);
    await visibleEl(page, tid("pos-ord-kitchen-meter"), 0, 20_000).catch(() => {
      throw new StepError("มาตรครัวบนการ์ดออเดอร์ไม่ขึ้น (pos-ord-kitchen-meter)");
    });
    return;
  }
  if (state === "products-drawer-station") {
    await clickEl(page, tid(`${device === "mobile" ? "pos-prod-copen" : "pos-prod-open"}-${QC_IDS.amer}`));
    await visibleEl(page, tid("pos-prod-drawer"), 0, 10_000);
    await clickEl(page, tid("pos-prod-tab-general"));
    await visibleEl(page, tid("pos-prod-station"), 0, 10_000).catch(() => {
      throw new StepError("ส่วนครัวในลิ้นชักไม่มีตัวเลือกสถานี (pos-prod-station)");
    });
    return;
  }
  if (state === "settings-device-kitchen-slip") {
    if (SETTINGS.error || !SETTINGS.seeded) throw new StepError(`ไม่มีเครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.error ?? "ยังไม่ได้สร้าง"}`);
    await visibleEl(page, tid("pos-settings-devices"), 0, 15_000);
    await clickEl(page, tid(`pos-device-card-${SETTINGS.devices[0]!.id}`));
    await clickEl(page, tid("pos-device-kitchen-after"));
    await visibleEl(page, tid(`pos-device-kitchen-station-${P26U.stations.hot}`), 0, 10_000).catch(() => {
      throw new StepError("ช่องติ๊กสถานีของใบครัวไม่ขึ้น (pos-device-kitchen-station-<ครัวร้อน>)");
    });
    const h = await visibleEl(page, tid("pos-device-kitchen"));
    await h.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
    return;
  }
  await visibleEl(page, tid("pos-kds"), 0, 15_000);
  if (state === "kds-empty-unit") {
    await visibleEl(page, tid("pos-kds-empty-unit"), 0, 15_000).catch(() => {
      throw new StepError("สาขาอารีย์มีสถานีครัว (ไม่ใช่สถานะ \"ยังไม่มีสถานีครัว\")");
    });
    return;
  }
  if (state === "kds-empty-station") {
    await visibleEl(page, tid("pos-kds-empty-station"), 0, 15_000);
    return;
  }
  if (state === "kds-expo") {
    await visibleEl(page, tid("pos-kds-expo"), 0, 15_000);
    await visibleEl(page, tidPrefix("pos-kds-expo-"), 0, 10_000).catch(() => {
      throw new StepError("Expo ไม่มีกลุ่มตั๋วพร้อมเสิร์ฟ");
    });
    return;
  }
  // บอร์ดของสถานี (ครัวร้อน / เครื่องดื่ม) · fix1 V3: 390 = ทีละคอลัมน์ (ค่าเริ่ม "ใหม่") ⇒ แถบเสิร์ฟแล้วอยู่ใต้ช่อง "พร้อม"
  await visibleEl(page, tid("pos-kds-board"), 0, 15_000);
  if (device === "mobile" && (state === "kds-served-recall" || state === "kds-refusal-toast")) await clickEl(page, tid("pos-kds-seg-ready"));
  if (state !== "kds-refusal-toast") await visibleEl(page, tidPrefix("pos-kds-ticket-"), 0, 15_000);
  if (state === "kds-mixed") {
    if (device !== "mobile") {
      await visibleEl(page, '[data-testid^="pos-kds-ticket-"][data-late="1"]', 0, 10_000).catch(() => {
        throw new StepError("ไม่มีตั๋วเลยเป้า (data-late)");
      });
      await visibleEl(page, tidPrefix("pos-kds-rush-chip-"), 0, 5_000);
    }
    return;
  }
  if (state === "kds-paused-banner") {
    await visibleEl(page, tid("pos-kds-paused-banner"), 0, 10_000);
    return;
  }
  if (state === "kds-86-sheet") {
    await clickEl(page, tid(device === "mobile" ? "pos-kds-86-mobile" : "pos-kds-86"));
    await visibleEl(page, tid("pos-kds-86-sheet"), 0, 10_000);
    await visibleEl(page, tid(`pos-kds-86-out-${QC_IDS.crois}`), 0, 10_000).catch(() => {
      throw new StepError("แผ่น 86 ไม่มีครัวซองต์ในรายการที่หมด");
    });
    return;
  }
  if (state === "kds-served-recall") {
    const h = await visibleEl(page, tid("pos-kds-recall"), 0, 10_000);
    if (userKey === "cashier") {
      if (!(await h.evaluate((el: HTMLButtonElement) => el.disabled))) throw new StepError("แคชเชียร์กดดึงใบกลับได้ (ควรปิด — ไม่มี restaurant.kds.recall)");
      return;
    }
    await clickEl(page, tid("pos-kds-recall"));
    await visibleEl(page, tid("pos-kds-toast"), 0, 10_000);
    return;
  }
  // kds-refusal-toast (เจ้าของ)
  await clickEl(page, tid("pos-kds-recall"));
  await visibleEl(page, '[data-testid="pos-kds-toast"][data-tone="danger"]', 0, 10_000).catch(() => {
    throw new StepError("ไม่มี toast ปฏิเสธ (TICKET_VOIDED)");
  });
}

// ═══════════════════ POS P2.8U ▸ fixture ออเดอร์ทุกช่องทาง + ขั้นตอนของสถานะ (มติ 7) ═══════════════════
//   สร้างผ่านฟังก์ชันของโมดูลเท่านั้น (pos/order: ingestOrder · acceptOrder · markPreparing · markReady · handOver · rejectOrder · setChannelOrderSettings
//   ในนามเจ้าของร้าน · pos/channel saveChannel สำหรับช่องทางโทรสั่ง) — ลบดิบได้เฉพาะตอนเก็บกวาด (แบบข้อสอบ)
//   คีย์/เลขแพลตฟอร์มผูกรอบ (pid + เวลา) ⇒ รอบซ้ำ/รอบพร้อมกันไม่ชนกัน · กำลังเตรียม/พร้อม = ช่องทาง DIRECT เท่านั้น ·
//   ⚠️ รับ PLATFORM 1 ใบต่อรอบ (LINE MAN → บิล PLATFORM จริง 1 ใบ) — ออเดอร์นั้น + บิลไม่ลบ (แบบบิลภาพ P2.1U) · ไม่มีการรับเงินใด ๆ
const P28U = {
  done: false,
  error: null as string | null,
  stamp: `${process.pid}-${Date.now().toString(36)}`,
  seq: 0,
  ids: [] as string[],
  kept: [] as string[],
  refs: {} as Record<string, string>,
  orderIds: {} as Record<string, string>,
  chat: "" as string,
  phone: "" as string,
  pausedBefore: undefined as string | null | undefined,
  pausedOn: false,
  log: [] as string[],
  ok: true,
};
const p28uKey = () => `posqc-vis-p28u-${P28U.stamp}-${++P28U.seq}`;
/** เลขแพลตฟอร์มของรอบ (≤ 40 · ไม่ซ้ำข้ามรอบ — ออเดอร์ที่เก็บไว้ของรอบก่อนยังถือเลขเดิม) */
const p28uRef = (prefix: string) => `${prefix}-${(Date.now() % 100000).toString().padStart(5, "0")}${String(++P28U.seq).padStart(2, "0")}`;
async function p28uCtx() {
  return { ctx: { tenantId: T.tenantId, systemId: SYS, unitId }, actor: await memberActorOf("owner") };
}
async function p28uIngest(tag: string, input: Record<string, unknown>): Promise<string> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p28uCtx();
  const r = await ord.ingestOrder(ctx, actor, { idempotencyKey: p28uKey(), ...input });
  if (!r.ok) throw new Error(`ingestOrder ${tag}: ${r.code} ${r.message ?? ""}`.slice(0, 200));
  P28U.ids.push(r.orderId);
  P28U.orderIds[tag] = r.orderId;
  return r.orderId;
}
async function p28uStep(tag: string, fn: "acceptOrder" | "markPreparing" | "markReady" | "handOver", extra: Record<string, unknown> = {}): Promise<void> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p28uCtx();
  const id = P28U.orderIds[tag]!;
  const r = await (ord[fn] as (c: unknown, a: unknown, i: unknown) => Promise<{ ok: boolean; code?: string }>)(ctx, actor, { id, ...extra });
  if (!r.ok) throw new Error(`${fn} ${tag}: ${r.code}`);
}
async function ensureP28uFixture(): Promise<void> {
  if (P28U.done || P28U.error) return;
  try {
    await ensureChannelFixture();
    if (P21U.error) throw new Error(`ช่องทาง P2.1U: ${P21U.error}`);
    if (!QC_IDS.amer || !QC_IDS.latte) throw new Error("ไม่พบอเมริกาโน่เย็น/ลาเต้ร้อนของร้าน QC (seed-pos-qc)");
    const { listChannels, saveChannel } = await import("@/lib/modules/pos/channel");
    const { ctx, actor } = await p28uCtx();
    const l = await listChannels(ctx, actor, { includeArchived: true });
    if (!l.ok) throw new Error(`listChannels: ${l.code}`);
    const chat = l.items.find((c) => c.code === "CHAT");
    if (!chat || chat.archived || !chat.active) throw new Error("ช่องทางแชท (CHAT) ของสาขา QC ไม่พร้อม (ปิด/เก็บแล้ว)");
    P28U.chat = chat.id;
    let phone = l.items.find((c) => c.code === P28U_PHONE.code);
    if (phone?.archived) throw new Error(`ช่องทาง ${P28U_PHONE.code} ถูกเก็บแล้ว (ผู้คุมงานตัดสิน)`);
    if (!phone) {
      const r = await saveChannel(ctx, actor, { code: P28U_PHONE.code, name: P28U_PHONE.name, payout: "DIRECT" }); // fix 1 F2: adapter ปริยายของช่องทางกำหนดเอง (NONE)
      if (!r.ok) throw new Error(`สร้างช่องทาง ${P28U_PHONE.code}: ${r.code}`);
      phone = r.channel;
      P28U.log.push(`สร้างช่องทาง ${P28U_PHONE.code}`);
    } else if (!phone.active || phone.payout !== "DIRECT" || phone.adapter !== "NONE") {
      // fix 1 F2: แถวของรอบก่อน (vis66) ถูกบังคับเป็น MANUAL — คืนเป็น adapter ปริยาย NONE
      const r = await saveChannel(ctx, actor, { id: phone.id, name: P28U_PHONE.name, active: true, payout: "DIRECT", adapter: "NONE" });
      if (!r.ok) throw new Error(`แก้ช่องทาง ${P28U_PHONE.code}: ${r.code}`);
    }
    P28U.phone = phone.id;
    const lm = P21U.ids.LINEMAN!;
    const grab = P21U.ids.GRAB!;
    const A = QC_IDS.amer;
    const LT = QC_IDS.latte;
    const cust = (name: string, phoneNo?: string) => ({ name, ...(phoneNo ? { phone: phoneNo } : {}) });
    // fix 1 F8: รอบที่มีแค่ register-tab-badge = ออเดอร์ใหม่อย่างเดียว (ไม่มีสาย PLATFORM รับ→ส่งมอบ ⇒ ไม่มีออเดอร์/บิลที่ต้องเก็บไว้)
    const full = jobs.some((j) => j.state && P28U_FIXTURE_STATES.has(j.state) && !P28U_REG_KEYS.has(j.state));
    if (full) {
    // กำลังเตรียม "เลยเวลา" ก่อน (เวลาเตรียม 1 นาที ⇒ เลยเมื่อผ่านไป > 1 นาที — orders-mixed รอได้)
    P28U.refs.late = p28uRef("TEL");
    await p28uIngest("late", { channelId: P28U.phone, externalRef: P28U.refs.late, lines: [{ productId: LT, qty: 2 }], customer: cust("คุณนิด (ภาพ QC)", "0891112222"), fulfilment: "PICKUP", startStatus: "ACCEPTED", paymentState: "UNPAID", prepMinutes: 1 });
    await p28uStep("late", "markPreparing");
    P28U.refs.prep = p28uRef("TEL");
    await p28uIngest("prep", { channelId: P28U.phone, externalRef: P28U.refs.prep, lines: [{ productId: A, qty: 2 }, { productId: LT, qty: 1, note: "หวานน้อย" }], customer: cust("คุณมาลี (ภาพ QC)", "0893334444"), fulfilment: "PICKUP", startStatus: "ACCEPTED", paymentState: "UNPAID", prepMinutes: 30 });
    await p28uStep("prep", "markPreparing");
    P28U.refs.ready = p28uRef("TEL");
    await p28uIngest("ready", { channelId: P28U.phone, externalRef: P28U.refs.ready, lines: [{ productId: A, qty: 1 }], customer: cust("คุณบอย (ภาพ QC)"), fulfilment: "DELIVERY", address: "ซอยสีลม 5 ชั้น 2 (ภาพ QC)", startStatus: "ACCEPTED", paymentState: "PAY_ON_PICKUP", prepMinutes: 15 });
    await p28uStep("ready", "markPreparing");
    await p28uStep("ready", "markReady");
    // ⚠️ PLATFORM 1 ใบต่อรอบ: LINE MAN รับ → บิลจริง → เตรียม → พร้อม → ส่งมอบ (คอลัมน์เสร็จวันนี้) — ไม่ลบ
    P28U.refs.done = p28uRef("LM");
    await p28uIngest("done", { channelId: lm, externalRef: P28U.refs.done, lines: [{ productId: A, qty: 1 }, { productId: LT, qty: 1 }], customer: cust("คุณต้น (ภาพ QC)", "0815556666"), fulfilment: "DELIVERY", address: "อาคารสาทร (ภาพ QC)", startStatus: "NEW" });
    await p28uStep("done", "acceptOrder", { prepMinutes: 10 });
    await p28uStep("done", "markPreparing");
    await p28uStep("done", "markReady");
    await p28uStep("done", "handOver");
    P28U.kept.push(P28U.orderIds.done!);
    P28U.ids = P28U.ids.filter((x) => x !== P28U.orderIds.done);
    // Grab ปฏิเสธ 1 ใบ (ท้ายคอลัมน์ "ยกเลิก/ปฏิเสธวันนี้")
    P28U.refs.rejected = p28uRef("GF");
    await p28uIngest("rejected", { channelId: grab, externalRef: P28U.refs.rejected, lines: [{ productId: A, qty: 1 }], customer: cust("คุณเจ (ภาพ QC)"), fulfilment: "DELIVERY", startStatus: "NEW" });
    {
      const ord = await import("@/lib/modules/pos/order");
      const r = await ord.rejectOrder(ctx, actor, { id: P28U.orderIds.rejected!, reasonCode: "TOO_BUSY" });
      if (!r.ok) throw new Error(`rejectOrder: ${r.code}`);
    }
    } // fix 1 F8: full
    // ใหม่ 3 ใบ (ไม่รับ): LINE MAN (แผง PLATFORM · ค่าคอมฯ 30%) · Grab · แชทรอชำระ
    P28U.refs.lm = p28uRef("LM");
    await p28uIngest("lm", { channelId: lm, externalRef: P28U.refs.lm, lines: [{ productId: A, qty: 2 }, { productId: LT, qty: 1, note: "ร้อนมาก" }], customer: cust("คุณเอก (ภาพ QC)", "0812341234"), fulfilment: "DELIVERY", address: "ซอยศาลาแดง 2 · ตึก B (ภาพ QC)", note: "ไม่ใส่น้ำแข็ง · ขอหลอด", startStatus: "NEW" });
    P28U.refs.grab = p28uRef("GF");
    await p28uIngest("grab", { channelId: grab, externalRef: P28U.refs.grab, lines: [{ productId: LT, qty: 2 }], customer: cust("คุณมายด์ (ภาพ QC)", "0898765521"), fulfilment: "DELIVERY", startStatus: "NEW" });
    await p28uIngest("chat", { channelId: P28U.chat, lines: [{ productId: A, qty: 1 }, { productId: LT, qty: 1 }], customer: cust("คุณแพร (ภาพ QC)"), fulfilment: "PICKUP", paymentState: "UNPAID" });
    {
      const ord = await import("@/lib/modules/pos/order");
      const g = await ord.getOrder(ctx, actor, { id: P28U.orderIds.chat! });
      P28U.refs.chat = g.ok ? g.order.ref : "";
    }
    P28U.done = true;
    P28U.log.push(full ? `สร้าง: ออเดอร์ ${P28U.ids.length + P28U.kept.length} (เก็บไว้ ${P28U.kept.length} = LINE MAN ${P28U.refs.done} + บิล PLATFORM)` : `สร้าง: ออเดอร์ใหม่ ${P28U.ids.length} (register-tab-badge เท่านั้น · ไม่มีการรับ PLATFORM)`);
  } catch (e) {
    P28U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** orders-new-late: Grab ใหม่ที่เหลือเวลารับ < 60 วิ — ใบเดิมเหลือ < 40 วิ (fix 1 F8 · กันตัวนับหมดระหว่างโหลดหน้า) หรือยังไม่มี = สร้างใบใหม่ (คีย์ใหม่) แล้วรอ */
async function p28uLateOrder(): Promise<{ ref: string; receivedMs: number }> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p28uCtx();
  const cur = P28U.orderIds.newLate ? await ord.getOrder(ctx, actor, { id: P28U.orderIds.newLate }) : null;
  if (cur && cur.ok && cur.order.status === "NEW" && (cur.order.acceptRemainingSec ?? 0) >= 40) return { ref: cur.order.ref, receivedMs: Date.parse(cur.order.receivedAt) };
  const ref = p28uRef("GF");
  await p28uIngest("newLate", { channelId: P21U.ids.GRAB!, externalRef: ref, lines: [{ productId: QC_IDS.amer, qty: 1 }], customer: { name: "คุณโอ๊ต (ภาพ QC)", phone: "0861239876" }, fulfilment: "DELIVERY", startStatus: "NEW" });
  return { ref, receivedMs: Date.now() };
}
async function p28uPause(on: boolean): Promise<void> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p28uCtx();
  if (on) {
    if (P28U.pausedOn) return;
    const before = await prisma.salesChannel.findFirst({ where: { id: P28U.chat, tenantId: T.tenantId }, select: { pausedUntil: true } });
    P28U.pausedBefore = before?.pausedUntil ? before.pausedUntil.toISOString() : null;
    const r = await ord.setChannelOrderSettings(ctx, actor, { channelId: P28U.chat, pausedUntil: new Date(Date.now() + 30 * 60_000).toISOString() });
    if (!r.ok) throw new StepError(`setChannelOrderSettings (ปิดรับแชท): ${r.code}`);
    P28U.pausedOn = true;
    return;
  }
  if (!P28U.pausedOn) return;
  const back = P28U.pausedBefore && Date.parse(P28U.pausedBefore) > Date.now() ? P28U.pausedBefore : null;
  const r = await ord.setChannelOrderSettings(ctx, actor, { channelId: P28U.chat, pausedUntil: back });
  if (!r.ok) throw new Error(`คืนค่าปิดรับแชท: ${r.code}`);
  P28U.pausedOn = false;
  P28U.log.push("คืนค่าปิดรับแชท");
}
async function cleanupP28u(): Promise<void> {
  try {
    await p28uPause(false);
  } catch (e) {
    P28U.ok = false;
    P28U.log.push(`คืนค่าปิดรับไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
  const ids = [...new Set(P28U.ids)];
  if (!ids.length) return;
  try {
    const tenantId = T.tenantId;
    // fix 1 F8: ออเดอร์ที่มีบิลแล้ว = เก็บไว้ (รายงาน) · ที่เหลือ (ไม่มีบิล) ลบตามไอดี — ไม่ข้ามทั้งชุดเพราะใบเดียว
    const withSale = (await prisma.posOrder.findMany({ where: { tenantId, id: { in: ids }, saleId: { not: null } }, select: { id: true } })).map((x) => x.id);
    if (withSale.length) {
      P28U.kept.push(...withSale.filter((x) => !P28U.kept.includes(x)));
      P28U.log.push(`มีบิลแล้ว ไม่ลบ: ${withSale.join(",")}`);
    }
    const kill = ids.filter((x) => !withSale.includes(x));
    if (!kill.length) {
      P28U.ids = [];
      return;
    }
    const ev = (await prisma.posOrderEvent.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
    const ln = (await prisma.posOrderLine.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
    const ob = (await prisma.outboxEvent.deleteMany({ where: { tenantId, type: { startsWith: "pos.order." }, OR: kill.map((id) => ({ idempotencyKey: { endsWith: `#${id}` } })) } })).count;
    const au = (await prisma.auditLog.deleteMany({ where: { tenantId, targetType: "PosOrder", targetId: { in: kill } } })).count;
    const od = (await prisma.posOrder.deleteMany({ where: { tenantId, id: { in: kill }, saleId: null } })).count;
    P28U.log.push(`ลบ: ออเดอร์ ${od} · บรรทัด ${ln} · เหตุการณ์ ${ev} · outbox ${ob} · audit ${au}`);
    P28U.ids = [];
    P28U.orderIds = {};
    P28U.done = false;
  } catch (e) {
    P28U.ok = false;
    P28U.log.push(`ลบไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
}
const p28uCleanupLine = () => `${P28U.ok ? "🧹" : "⚠️"} P2.8U: ${P28U.log.join(" · ")}${P28U.kept.length ? ` · เก็บไว้ (บิล PLATFORM): ${P28U.kept.join(",")}` : ""}`;
// ═══════════════════ POS P2.9U ▸ บัตรของขวัญ/เครดิตร้าน/ทิป · 02b · คืนเข้าบัตร · บัญชีพักทิป (มติผู้คุม P2.9U ข้อ 10) ═══════════════════
//   🔴 PIN ของบัตร fixture = ค่าคงที่ในโค้ดนี้เท่านั้น (ตั้งด้วยสูตรแฮชของโมดูลบัตร sha256("<เลข>:<PIN>") — giftcard/service.ts sell) · ห้ามพิมพ์ลง log/summary/ชื่อไฟล์
const P29U_PIN = "2580";
const P29U_WRONG_PIN = "9137";
const P29U_DAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
type P29uCardKey = "main" | "pin" | "small" | "chg";
const P29U_CARDS: Record<P29uCardKey, number> = { main: 50_000, pin: 50_000, small: 10_000, chg: 50_000 };
const P29U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  memberSystemId: "",
  cards: {} as Partial<Record<P29uCardKey, { id: string; number: string }>>,
  gcSettingsBefore: null as null | { enabled: boolean; accountingLink: boolean },
  tipBefore: null as null | { enabled: boolean; ledgerAccountId: string | null },
  tipError: null as string | null,
  scError: null as string | null,
  /** บิลของ sale-done-giftcard (refund-to-card ใช้ต่อ) */
  saleId: "",
  chgN: 0,
};
const p29uGctx = () => ({ tenantId: T.tenantId, systemId: P29U.memberSystemId, posSystemId: SYS, actorUserId: T.users.owner.userId });
/** fixture ก่อนงานแรกของใบนี้ — พังไม่โยน (P29U.error · สถานะตกพร้อมเหตุผล) */
async function ensureP29uFixture(): Promise<void> {
  if (P29U.done || P29U.error) return;
  try {
    const C = T as Any;
    P29U.memberSystemId = String(C.systems?.MEMBER?.id ?? "");
    if (!P29U.memberSystemId) throw new StepError("ร้านนี้ไม่มีระบบสมาชิก QC (บัตรกำนัลผูกระบบสมาชิก) — เฉพาะ --tenant coffee");
    const owner = (await ownerActor()) as Any;
    const gc = await import("@/lib/modules/giftcard");
    const needCards = jobs.some((j) => j.state && P29U_REG_PLAN.some((x) => x.key === j.state && x.key !== "paydlg-storecredit" && x.key !== "paydlg-tip"));
    if (needCards) {
      // บัตรกำนัลของร้านต้องเปิด (ช่องบัตรของขวัญ = tenders.giftCard.enabled) — คืนค่าเดิมตอนเก็บกวาด
      const before = await gc.getSettings(p29uGctx());
      P29U.gcSettingsBefore = { enabled: before.enabled, accountingLink: before.accountingLink };
      if (!before.enabled) {
        await gc.setSettings(p29uGctx(), owner, { enabled: true });
        P29U.log.push("เปิดบัตรกำนัลของร้าน QC (คืนค่าตอนเก็บกวาด)");
      }
      for (const k of Object.keys(P29U_CARDS) as P29uCardKey[]) {
        const satang = P29U_CARDS[k];
        const r = await gc.sell(p29uGctx(), owner, { satang, payMethods: [{ type: "CASH", amountSatang: satang }], unitId, recipient: { print: true }, idempotencyKey: `posqc-vis-p29u-${process.pid}-${k}` } as Any);
        // ตั้ง PIN เป็นค่าคงที่ของ fixture ด้วยสูตรแฮชเดียวกับโมดูล (PIN สุ่มที่ sell คืนมาไม่ถูกใช้/ไม่ถูกพิมพ์)
        await prisma.giftCard.update({ where: { id: r.giftCardId }, data: { pinHash: sha256(`${r.number}:${P29U_PIN}`), pinFailedCount: 0, pinLockedUntil: null } });
        P29U.cards[k] = { id: r.giftCardId, number: r.number };
      }
      P29U.log.push(`บัตร ${Object.keys(P29U.cards).length} ใบ (giftcard.sell · ${Object.values(P29U.cards).map((c) => `GC-••••${c!.number.slice(-4)}`).join(" ")})`);
    }
    if (jobs.some((j) => j.state && P29U_REG_PLAN.some((x) => x.key === j.state))) await prepMemberFixture(); // คูปอง WELCOME50 ของตะกร้า 02 + สมาชิก QC (find-or-create ของ P1.12U)
    if (jobs.some((j) => j.state === "paydlg-storecredit")) {
      try {
        if (MEMBERX.error || !MEMBERX.id) throw new StepError(`สมาชิก QC: ${MEMBERX.error ?? "ไม่มี"}`);
        const member = await import("@/lib/modules/member");
        const before = await member.storeCreditOf(T.tenantId, P29U.memberSystemId, MEMBERX.id);
        if (!before || before.balanceSatang <= 0) {
          await prisma.$transaction((tx) => member.issueStoreCredit(T.tenantId, { systemId: P29U.memberSystemId, customerId: MEMBERX.id, satang: 20_000, idempotencyKey: `posqc-vis-p29u-sc-${P29U_DAY}`, refundSaleId: `posqc-vis-p29u-${P29U_DAY}` }, tx as Any));
          P29U.log.push(`เครดิตร้าน ฿200 ของสมาชิก QC (คีย์ต่อวัน ${P29U_DAY})`);
        } else P29U.log.push(`เครดิตร้านของสมาชิก QC มีอยู่แล้ว ฿${(before.balanceSatang / 100).toFixed(2)}`);
      } catch (e) {
        P29U.scError = e instanceof Error ? e.message.slice(0, 160) : String(e);
      }
    }
    if (jobs.some((j) => j.state === "paydlg-tip")) {
      try {
        const ps = await import("@/lib/modules/pos/payment-settings");
        const cur = await ps.posPaymentSettings({ tenantId: T.tenantId, systemId: SYS });
        if (!cur.ok) throw new StepError(`อ่านค่าตั้งการชำระเงินไม่ได้: ${cur.code}`);
        if (!cur.tip.enabled) {
          const link = await prisma.accountSystemLink.findFirst({ where: { tenantId: T.tenantId, linkedKind: "POS", linkedId: SYS, archivedAt: null, enabled: true }, select: { systemId: true } });
          if (!link) throw new StepError("POS ของร้าน QC ไม่ได้เชื่อมสมุดบัญชี — เปิดทิปไม่ได้");
          const led = await prisma.accountLedger.findFirst({ where: { tenantId: T.tenantId, systemId: link.systemId, archivedAt: null, type: "LIABILITY" }, orderBy: { code: "asc" }, select: { id: true, code: true } });
          if (!led) throw new StepError("สมุดที่เชื่อมไม่มีบัญชีหมวดหนี้สิน — เปิดทิปไม่ได้");
          const r = await ps.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, owner, { tip: { enabled: true, ledgerAccountId: led.id } });
          if (!r.ok) throw new StepError(`เปิดทิปไม่ได้: ${r.code}`);
          P29U.tipBefore = { enabled: cur.tip.enabled, ledgerAccountId: cur.tip.ledgerAccountId };
          P29U.log.push(`เปิดทิป (บัญชี ${led.code} · คืนค่าหลังภาพทิปสุดท้าย)`);
        } else P29U.log.push("ทิปของร้าน QC เปิดอยู่แล้ว");
      } catch (e) {
        P29U.tipError = e instanceof Error ? e.message.slice(0, 160) : String(e);
      }
    }
    P29U.done = true;
  } catch (e) {
    P29U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** คืนค่าทิปที่ fixture เปิด (หลังภาพทิปสุดท้าย · finally) — ไม่โยน */
async function p29uTipRestore(): Promise<void> {
  if (!P29U.tipBefore) return;
  const before = P29U.tipBefore;
  P29U.tipBefore = null;
  try {
    const ps = await import("@/lib/modules/pos/payment-settings");
    const r = await ps.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, (await ownerActor()) as Any, { tip: { enabled: before.enabled, ledgerAccountId: before.ledgerAccountId } });
    P29U.log.push(r.ok ? "คืนค่าทิป" : `⚠️ คืนค่าทิปไม่ได้: ${r.code}`);
    if (!r.ok) P29U.ok = false;
  } catch (e) {
    P29U.ok = false;
    P29U.log.push(`⚠️ คืนค่าทิปไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
}
/** เก็บกวาด (หลังงานสุดท้าย · finally · สัญญาณ — เรียกซ้ำได้): ระงับบัตรของรอบ · คืนค่าตั้งบัตร/ทิป · บิลขายคงอยู่ (แบบ sale-done) */
async function cleanupP29u(): Promise<void> {
  await p29uTipRestore();
  if (P29U.cleaned || (!Object.keys(P29U.cards).length && !P29U.gcSettingsBefore)) return;
  P29U.cleaned = true;
  try {
    const gc = await import("@/lib/modules/giftcard");
    const owner = (await ownerActor()) as Any;
    let n = 0;
    for (const [k, c] of Object.entries(P29U.cards)) {
      if (!c) continue;
      // POS P2.9U ▸ fix1 V3: บัตรของบิล sale-done-giftcard คง ACTIVE (refund-to-card ของรอบหน้าบิลต้องเห็นชิปคืนเข้าบัตรที่ใช้ได้) ◂
      if (k === "main" && P29U.saleId) {
        P29U.log.push(`คงบัตร GC-••••${c.number.slice(-4)} ACTIVE (บิล sale-done-giftcard)`);
        continue;
      }
      await gc
        .suspend(p29uGctx(), owner, { number: c.number, reason: "QC P2.9U visual (fixture ของรอบ)" })
        .then(() => n++)
        .catch((e: unknown) => {
          // ยอดหมด (DEPLETED) / ระงับอยู่แล้ว = ไม่ใช่ความผิดพลาดของการเก็บกวาด
          if (!/DEPLETED|SUSPENDED|ระงับ|หมด/i.test(e instanceof Error ? e.message : String(e))) {
            P29U.ok = false;
            P29U.log.push(`⚠️ ระงับบัตร GC-••••${c.number.slice(-4)} ไม่ได้: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
          }
        });
    }
    P29U.log.push(`ระงับบัตรของรอบ ${n} ใบ`);
    if (P29U.gcSettingsBefore && !P29U.gcSettingsBefore.enabled) {
      await gc.setSettings(p29uGctx(), owner, { enabled: false });
      P29U.log.push("คืนค่าบัตรกำนัลของร้าน (ปิด)");
    }
  } catch (e) {
    P29U.ok = false;
    P29U.log.push(`⚠️ เก็บกวาดบัตรไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
}
/** ตะกร้า 02: ตะกร้า 4 บรรทัดของภาพ 01 (cart4-01) + คูปอง WELCOME50 ⇒ ฿625 (คูปองใส่ไม่ได้ = ภาพตก — ยอดไม่เท่าภาพ 02) */
async function p29uCart(page: Any, device: Device): Promise<void> {
  await runState(page, "cart4-01", device);
  await openCartOnMobile(page, device);
  await applyQcCoupon(page, "cart");
  if (device === "mobile") {
    await page.keyboard.press("Escape");
    await sleep(250);
  }
  await waitPayReady(page);
}
async function p29uOpenPay(page: Any, device: Device): Promise<void> {
  await clickPay(page, device);
  await visibleEl(page, tid("pos-reg-paydlg"), 0, 10_000);
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-method-cash"]') as HTMLButtonElement | null)?.disabled, { timeout: 15_000 }).catch(() => undefined);
}
/** แยกจ่ายเงินสด (บาท) — รอบเงินสดรับน้อยกว่าคงเหลือ ⇒ "แยกจ่าย" */
async function p29uCashSplit(page: Any, baht: number): Promise<void> {
  await clickEl(page, tid("pos-reg-paydlg-method-cash"));
  await typeInto(page, tid("pos-reg-paydlg-received"), String(baht));
  await clickEl(page, tid("pos-reg-paydlg-add-split"));
}
/** ช่องบัตรของขวัญ → เลขบัตร → ค้นหา → ผลค้น (มติ 2a–b) */
async function p29uLookup(page: Any, k: P29uCardKey): Promise<void> {
  const c = P29U.cards[k];
  if (!c) throw new StepError(`ไม่มีบัตร fixture ${k}`);
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-method-giftcard"]') as HTMLButtonElement | null)?.disabled, { timeout: 15_000 }).catch(() => {
    throw new StepError("ช่องบัตรของขวัญยังปิด (registerPayTendersAction.giftCard.enabled — บัตรกำนัลของร้าน QC เปิดหรือยัง?)");
  });
  await clickEl(page, tid("pos-reg-paydlg-method-giftcard"));
  await typeInto(page, tid("pos-reg-paydlg-giftcard-number"), c.number);
  await clickEl(page, tid("pos-reg-paydlg-giftcard-lookup"));
  await visibleEl(page, tid("pos-reg-paydlg-giftcard-result"), 0, 15_000).catch(() => {
    throw new StepError("ค้นบัตรแล้วไม่ขึ้นผล (pos-reg-paydlg-giftcard-result)");
  });
}
/** จำนวนที่ใช้จากบัตรด้วยแป้นตัวเลข (md+ เท่านั้น — มือถือใช้ค่าปริยาย min(คงเหลือ, ยอดบัตร)) */
async function p29uAmount(page: Any, device: Device, baht: number): Promise<void> {
  if (device === "mobile") return;
  await clickEl(page, tid("pos-reg-paydlg-giftcard-amount"));
  for (const d of String(baht)) await clickEl(page, tid(`pos-reg-paydlg-key-${d}`));
}
async function p29uPin(page: Any, pin: string): Promise<void> {
  const h = await visibleEl(page, tid("pos-reg-paydlg-giftcard-pin"));
  await h.click();
  await h.type(pin);
  await sleep(150);
}
async function p29uUse(page: Any): Promise<void> {
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-giftcard-use"]') as HTMLButtonElement | null)?.disabled, { timeout: 5_000 }).catch(() => {
    throw new StepError("ปุ่ม \"ใช้บัตรนี้\" ยังปิดหลังใส่ PIN");
  });
  await clickEl(page, tid("pos-reg-paydlg-giftcard-use"));
  await visibleEl(page, tid("pos-reg-paydlg-giftcard-row-1"), 0, 5_000).catch(() => {
    throw new StepError("ใช้บัตรแล้วไม่ขึ้นแถวบัตร (pos-reg-paydlg-giftcard-row-1)");
  });
}
/** รอบสุดท้ายเงินสดพอดี → ยืนยัน (F4 เดียวกับปุ่ม) */
async function p29uCashExactConfirm(page: Any): Promise<void> {
  await clickEl(page, tid("pos-reg-paydlg-method-cash"));
  await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 8_000 }).catch(() => {
    throw new StepError("ปุ่มยืนยันรับเงินยังปิด (PIN ครบ · ยอดครบ?)");
  });
  await clickEl(page, tid("pos-reg-paydlg-confirm"));
}
// ═══════════════════ POS P2.12U ▸ รายงาน 08 + บิล 12 + การ์ดเกณฑ์: fixture + ขั้นตอนของสถานะ (มติ 8) ◂ ═══════════════════
// fixture (ensureP212uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล · บิลทั้งหมดผ่าน createSale คีย์ต่อวัน posqc-vis-p212u-<n>-<วันที่> · ไม่ลบ แบบ sale-done):
//   • รายชั่วโมง/หน้าพิมพ์ภาพรวม: 2 บิลวันนี้ (ย้าย createdAt/paidAt เป็น 09:10/09:40 เมื่อผ่าน 10:00 แล้ว = ช่วงขายดี) + 1 บิลตอนนี้ (ชั่วโมงนี้) +
//     3 บิลต่อสัปดาห์ของ 4 สัปดาห์ก่อน วันเดียวกัน 08/09/12 น. (ย้าย createdAt/paidAt = คาดการณ์) — การย้ายเวลาเขียนตรงที่ PosSale แถวของ fixture เท่านั้น
//   • สาขา/ทุกสาขา: 1 บิลวันนี้ที่สาขาที่สอง (ไม่มีสาขาที่สอง/ขายไม่ได้ = บันทึกเหตุผล ไม่ล้ม)
//   • จุดผิดปกติ: 2 บิล → voidSale ผู้ทำ = เจ้าของ (A1) · บิล LINE MAN (ช่องทางของ P2.1U) → refundSale 1 แก้ว PLATFORM (A2 + ลิ้นชักหลังคืน) · บิลส่วนลดท้ายบิล 40% (A4) ·
//     เกณฑ์ลดชั่วคราว A1 2 ครั้ง · A2 1 ครั้ง · A3 0.1% (ป้ายการ์ดพนักงาน) · A4 20% ผ่าน updatePosGeneralSettings (เจ้าของ) — ค่าเดิมจำไว้ · ค่าที่ตรงชุดของ fixture ทุกช่อง
//     = ซากรอบที่ถูก kill ⇒ ถือค่าปริยายเป็นค่าเดิม · คืนค่าใน cleanupP212u (งานสุดท้าย/finally/สัญญาณ)
const P212U_TH = { A1: 2, A2: 1, A3: 10, A4: 2000 } as const;
const P212U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  anomalyBefore: null as null | { enabled: boolean; A1: number; A2: number; A3: number; A4: number },
  refundBill: "",
};
async function ensureP212uFixture(): Promise<void> {
  if (P212U.done || P212U.error) return;
  try {
    const owner = await ownerActor();
    const want = (...ks: P212uKey[]) => ks.some((k) => jobs.some((j) => j.state === k));
    const day = p212uDay();
    const { createSale, voidSale } = await import("@/lib/modules/pos/service");
    const key = (k: string) => `${FIX.prefix}p212u-${k}-${day}`;
    type L = { name: string; qty: number; unitPriceSatang: number };
    const sale = async (k: string, lines: L[], pay: string, extra: Record<string, unknown> = {}, onUnit = unitId): Promise<string> => {
      const disc = typeof extra.billDiscountSatang === "number" ? extra.billDiscountSatang : 0;
      const total = lines.reduce((a, l) => a + l.qty * l.unitPriceSatang, 0) - disc;
      const r = await createSale({
        tenantId: T.tenantId,
        unitId: onUnit,
        systemId: SYS,
        sourceModule: "POS",
        shiftId: null,
        soldByUserId: owner.userId,
        idempotencyKey: key(k),
        lines: lines.map((l) => ({ ...l, name: `${l.name} ${BILL_TAG}` })),
        payMethods: [{ type: pay, amountSatang: total }],
        ...extra,
      } as never);
      return (r as { saleId: string }).saleId;
    };
    const moveTo = async (saleId: string, iso: string) => {
      const at = new Date(iso);
      await prisma.posSale.update({ where: { id: saleId }, data: { createdAt: at, paidAt: at } });
    };
    const pad2 = (n: number) => String(n).padStart(2, "0");
    if (want("reports-hourly", "reports-print-overview")) {
      const nowH = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(11, 13));
      if (nowH >= 10) for (const [n, mm] of [[1, "10"], [2, "40"]] as const) await moveTo(await sale(`peak${n}`, [{ name: "ชุดอาหารเช้า", qty: 3, unitPriceSatang: 25000 }], "PROMPTPAY"), `${day}T09:${mm}:00+07:00`);
      await sale("now", [{ name: "ลาเต้เย็น", qty: 2, unitPriceSatang: 7500 }], "PROMPTPAY");
      for (let w = 1; w <= 4; w++)
        for (const [h, amt] of [[8, 9000], [9, 30000], [12, 22000]] as const) await moveTo(await sale(`fc${w}-${h}`, [{ name: "ชุดอาหาร", qty: 1, unitPriceSatang: amt + w * 500 }], "PROMPTPAY"), `${p212uDay(-7 * w)}T${pad2(h)}:20:00+07:00`);
      P212U.log.push(`รายชั่วโมง: ${nowH >= 10 ? "ช่วงขายดี 09:xx 2 ใบ · " : ""}ชั่วโมงนี้ 1 ใบ · คาดการณ์ 12 ใบ (4 สัปดาห์ก่อน)`);
    }
    if (want("reports-branches-tab", "bills-all-branches", "reports-print-channels")) {
      const other = Object.values(T.units as Record<string, { id: string }>).find((u) => u.id !== unitId);
      try {
        if (!other) throw new Error("ไม่มีสาขาที่สอง");
        await sale("branch2", [{ name: "อเมริกาโน่เย็น", qty: 2, unitPriceSatang: 6500 }], "PROMPTPAY", {}, other.id);
        P212U.log.push("สาขาที่สอง: บิลวันนี้ 1 ใบ");
      } catch (e) {
        P212U.log.push(`สาขาที่สอง: ข้าม (${e instanceof Error ? e.message.slice(0, 80) : String(e)})`);
      }
    }
    if (want("reports-anomalies", "reports-staff-flag", "settings-general-anomaly", "bills-drawer-channel-refund", "bills-all-branches", "reports-pdf-button", "reports-print-channels")) {
      // A1: 2 บิลยกเลิกโดยเจ้าของ
      for (const n of [1, 2]) {
        const id = await sale(`void${n}`, [{ name: "อเมริกาโน่ร้อน", qty: 1, unitPriceSatang: 6000 }], "PROMPTPAY");
        const st = await prisma.posSale.findUnique({ where: { id }, select: { status: true } });
        if (st?.status === "PAID") await voidSale(T.tenantId, unitId, id, { actorUserId: owner.userId, reason: "ลูกค้ายกเลิกออเดอร์ (ภาพ QC P2.12U)" });
      }
      // A4: ส่วนลดท้ายบิล 40% (฿80 จาก ฿200)
      await sale("disc", [{ name: "เค้กส้ม", qty: 2, unitPriceSatang: 10000 }], "PROMPTPAY", { billDiscountSatang: 8000 });
      // A2 + ลิ้นชักหลังคืน: บิล LINE MAN → คืน 1 แก้ว (PLATFORM)
      await ensureChannelFixture();
      if (P21U.error || !P21U.ids.LINEMAN) throw new StepError(`fixture ช่องทาง: ${P21U.error ?? "ไม่มี LINEMAN"}`);
      const lm = await sale("lineman", [{ name: "ผัดไทยกุ้ง", qty: 1, unitPriceSatang: 12000 }, { name: "ชาไทยเย็น", qty: 2, unitPriceSatang: 6000 }], "PLATFORM", { channelId: P21U.ids.LINEMAN, channelRef: "LM-21201" });
      const cur = await prisma.posSale.findUnique({ where: { id: lm }, select: { refundedSatang: true } });
      if ((cur?.refundedSatang ?? 0) === 0) {
        const { refundSale, saleForRefund } = await import("@/lib/modules/pos/refund");
        const { refundLineAmount, refundServiceCharge } = await import("@/lib/modules/pos/refund-math");
        const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
        const fr = await saleForRefund(ctx, owner, { saleId: lm });
        if (!fr.ok) throw new StepError(`saleForRefund LINE MAN: ${fr.code}`);
        const l = fr.lines.find((x) => x.qty === 2 && x.refundableQty > 0) ?? fr.lines[0]!;
        const amt = refundLineAmount(l.netSatang, l.qty, l.refundedQty, l.refundedSatang, 1);
        const total = amt + refundServiceCharge(fr.sale.serviceChargeSatang, amt, fr.sale.netTotalSatang, fr.sale.serviceChargeRefundedSatang, false);
        const r = await refundSale(ctx, owner, { saleId: lm, lines: [{ lineId: l.lineId, qty: 1 }], payMethods: [{ type: "PLATFORM", amountSatang: total }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ (ภาพ QC P2.12U)", idempotencyKey: key("lineman-refund") });
        if (!r.ok) throw new StepError(`คืนเงินบิล LINE MAN: ${r.code}`);
      }
      P212U.refundBill = lm;
      for (const j of jobs) if (j.state === "bills-drawer-channel-refund") j.path = `/app/sys/${SYS}/pos/sales?unit=${encodeURIComponent(unitId)}&bill=${lm}`;
      P212U.log.push("จุดผิดปกติ: ยกเลิก 2 บิล · คืนเงิน LINE MAN 1 แก้ว · ส่วนลดบิล 40%");
    }
    if (want("reports-anomalies", "reports-staff-flag", "settings-general-anomaly") && userKey === "owner") {
      const { posAnomalyThresholds, POS_ANOMALY_DEFAULTS } = await import("@/lib/modules/pos/settings-shared");
      const { updatePosGeneralSettings } = await import("@/lib/modules/pos/settings-general");
      const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
      const th = posAnomalyThresholds(sys?.settings ?? null);
      const residue = th.rules.A1.count === P212U_TH.A1 && th.rules.A2.count === P212U_TH.A2 && th.rules.A3.bp === P212U_TH.A3 && th.rules.A4.bp === P212U_TH.A4;
      P212U.anomalyBefore = residue
        ? { enabled: true, A1: POS_ANOMALY_DEFAULTS.A1.count, A2: POS_ANOMALY_DEFAULTS.A2.count, A3: POS_ANOMALY_DEFAULTS.A3.bp, A4: POS_ANOMALY_DEFAULTS.A4.bp }
        : { enabled: th.enabled, A1: th.rules.A1.count, A2: th.rules.A2.count, A3: th.rules.A3.bp, A4: th.rules.A4.bp };
      if (residue) P212U.log.push("กวาดซากเกณฑ์ของรอบก่อน (ค่าเดิม = ค่าปริยาย)");
      const r = await updatePosGeneralSettings({ tenantId: T.tenantId, systemId: SYS }, owner, { anomaly: { enabled: true, rules: { A1: { count: P212U_TH.A1 }, A2: { count: P212U_TH.A2 }, A3: { bp: P212U_TH.A3 }, A4: { bp: P212U_TH.A4 } } } });
      if (!r.ok) throw new StepError(`ตั้งเกณฑ์จุดผิดปกติ: ${r.code} ${"field" in r ? (r.field ?? "") : ""}`);
      P212U.log.push(`เกณฑ์ชั่วคราว A1 ${P212U_TH.A1} · A2 ${P212U_TH.A2} · A3 ${P212U_TH.A3 / 100}% · A4 ${P212U_TH.A4 / 100}% (คืนค่าเดิมตอนเก็บกวาด)`);
    }
    P212U.done = true;
  } catch (e) {
    P212U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** หลังงาน P2.12U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน (บิลของ fixture คงอยู่ แบบ sale-done) */
async function cleanupP212u(): Promise<void> {
  if (P212U.cleaned) return;
  P212U.cleaned = true;
  if (!P212U.anomalyBefore) return;
  try {
    const b = P212U.anomalyBefore;
    const { updatePosGeneralSettings } = await import("@/lib/modules/pos/settings-general");
    const r = await updatePosGeneralSettings({ tenantId: T.tenantId, systemId: SYS }, await ownerActor(), { anomaly: { enabled: b.enabled, rules: { A1: { count: b.A1 }, A2: { count: b.A2 }, A3: { bp: b.A3 }, A4: { bp: b.A4 } } } });
    if (!r.ok) throw new StepError(`${r.code} ${"field" in r ? (r.field ?? "") : ""}`);
    P212U.log.push("คืนเกณฑ์จุดผิดปกติเดิม");
  } catch (e) {
    P212U.ok = false;
    P212U.log.push(`คืนเกณฑ์จุดผิดปกติไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
}
async function runP212uState(page: Any, state: P212uKey, _device: Device): Promise<void> {
  if (P212U.error) throw new StepError(`fixture P2.12U: ${P212U.error}`);
  const into = async (sel: string, block: "start" | "center" = "start") => {
    const el = await visibleEl(page, sel, 0, 20_000);
    await el.evaluate((e: Element, b: string) => e.scrollIntoView({ block: b as "start" | "center" }), block);
    return el;
  };
  const has = async (sel: string) => !!(await page.$(sel));
  switch (state) {
    case "reports-hourly": {
      await into(tid("pos-reports-hourly-chart"), "center");
      const dashed = (await page.$$eval(`${tid("pos-reports-hourly-chart")} i[data-forecast]`, (xs: Element[]) => xs.length)) as number;
      if (!dashed) throw new StepError("กราฟรายชั่วโมงไม่มีกล่องคาดการณ์ (เส้นประ)");
      if (!(await has(tid("pos-reports-hourly-now")))) throw new StepError("ไม่มีแท่ง \"ชั่วโมงนี้\" (pos-reports-hourly-now)");
      return;
    }
    case "reports-branches-tab": {
      await visibleEl(page, tid("pos-report-table-total"), 0, 20_000);
      const n = (await page.$$eval(`${tid("pos-report-table")} tbody tr`, (xs: Element[]) => xs.length)) as number;
      if (n < 2) throw new StepError(`ตารางสาขามี ${n} แถว (คาด ≥ 2)`);
      return;
    }
    case "reports-anomalies": {
      if (userKey !== "owner") {
        await visibleEl(page, tid("pos-report-refusal"), 0, 20_000);
        return;
      }
      await visibleEl(page, tid("pos-reports-anomalies"), 0, 20_000);
      const g = (await page.$$eval('[data-testid^="pos-reports-anomaly-group-"]', (xs: Element[]) => xs.map((x) => x.getAttribute("data-testid")))) as string[];
      if (g.length < 3) throw new StepError(`กลุ่มกฎ ${g.length} กลุ่ม (คาด ≥ 3): ${g.join(" ")}`);
      return;
    }
    case "reports-anomalies-empty":
      await visibleEl(page, tid("pos-report-empty"), 0, 20_000);
      return;
    case "reports-staff-flag":
      await into(tid("pos-report-ov-staff"), "center");
      await visibleEl(page, tid("pos-report-ov-high-discount"), 0, 20_000).catch(() => {
        throw new StepError("การ์ดพนักงานไม่มีป้าย \"ส่วนลดสูงผิดปกติ\" (pos-report-ov-high-discount)");
      });
      return;
    case "reports-pdf-button": {
      const a = await visibleEl(page, tid("pos-reports-pdf"), 0, 20_000);
      const href = (await a.evaluate((e: Element) => e.getAttribute("href") ?? "")) as string;
      if (!href.includes("/pos/reports/print?") || !href.includes("kind=channels")) throw new StepError(`ปุ่ม PDF ชี้ "${href}"`);
      return;
    }
    case "reports-print-overview":
    case "reports-print-channels": {
      await visibleEl(page, tid("pos-report-print-frame"), 0, 30_000);
      await page.waitForFunction(() => !!(document.querySelector('[data-testid="pos-report-print-frame"]') as HTMLIFrameElement | null)?.contentDocument?.querySelector("table"), { timeout: 30_000 }).catch(() => {
        throw new StepError("เอกสารใน iframe หน้าพิมพ์ไม่มีตาราง");
      });
      if (state === "reports-print-overview") {
        const parts = (await page.evaluate(() => (document.querySelector('[data-testid="pos-report-print-frame"]') as HTMLIFrameElement | null)?.contentDocument?.querySelectorAll("section.part").length ?? 0)) as number;
        if (parts < 4) throw new StepError(`เอกสารสรุปภาพรวมมี ${parts} ส่วน (คาด ≥ 4)`);
      }
      await page.emulateMediaType("print");
      await new Promise((r) => setTimeout(r, 300));
      return;
    }
    case "settings-general-anomaly": {
      await into(tid("pos-settings-general-anomaly"), "start");
      const v = (await page.$eval(tid("pos-settings-anomaly-A1-count"), (e: Element) => (e as HTMLInputElement).value)) as string;
      if (v !== String(P212U_TH.A1)) throw new StepError(`ช่อง A1 = "${v}" (คาด ${P212U_TH.A1} ของ fixture)`);
      return;
    }
    case "bills-all-branches": {
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pos-bills-row"], [data-testid="pos-bills-card"]'), { timeout: 20_000 }).catch(() => {
        throw new StepError("รายการบิลว่าง");
      });
      if (userKey !== "owner") {
        if (await has(tid("pos-sales-unit-all"))) throw new StepError("แคชเชียร์สาขาเดียวเห็นตัวเลือก \"ทุกสาขา\"");
        return;
      }
      const sel = (await page.$eval(tid("pos-bills-unit"), (e: Element) => (e as HTMLSelectElement).value)) as string;
      if (sel !== "*") throw new StepError(`ตัวเลือกสาขา = "${sel}" (คาด * ทุกสาขา)`);
      if (!(await has('[data-testid^="pos-sales-unitChip-"]'))) throw new StepError("ไม่มีชิปสาขา (pos-sales-unitChip-*)");
      if (!(await has('[data-testid^="pos-sales-channelCount-"]'))) throw new StepError("ไม่มีชิปจำนวนบิลต่อช่องทาง (pos-sales-channelCount-*)");
      return;
    }
    case "bills-drawer-channel-refund": {
      await into(tid("pos-bill-commission"), "center");
      const shown = await has(tid("pos-bills-drawer-channel-refund"));
      if (userKey === "owner" && !shown) throw new StepError("ลิ้นชักไม่มีบรรทัดหลังคืนเงิน (pos-bills-drawer-channel-refund)");
      if (userKey !== "owner" && shown) throw new StepError("แคชเชียร์เห็นตัวเลขค่าคอมฯ หลังคืน (ต้องไม่มี — pos.report.view)");
      return;
    }
  }
}
// ═══════════════════ POS P3.8U ▸ บอร์ดงาน/ห้องทีม: แท็บ board · ปุ่ม/ชิปจุดผิดปกติ · แผง AI · ชิป/บรรทัดหน้ากะ (CD-P38U-11) ◂ ═══════════════════
// fixture (ensureP38uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล · ร้าน QC coffee เท่านั้น · ไม่ reseed · ไม่ขอ snapshot):
//   • บอร์ด posqc-vis-p38u (kanban/service.createBoard ในระบบ KANBAN แรกที่เปิดอยู่ · หาก่อนสร้าง · เก็บไว้) · ห้อง posqc-vis-p38u + posqc-vis-p38u-arch (เก็บถาวร)
//     (meeting/service.createChannel/archiveChannel ในระบบ MEETING แรก · หาก่อนสร้าง · เก็บไว้) — fix1: ไม่มีระบบที่เปิดอยู่ = สร้างระบบของภาพ (createSystem · เก็บไว้) ·
//     สร้างไม่ได้ = สถานะที่ใช้ "SKIP — เหตุผล" (harness ไม่มีช่องข้าม ⇒ ขึ้นเป็นขั้นตอนตกขึ้นต้น SKIP)
//   • settings.pos.board / teamRoom (+ ai.enabled เฉพาะภาพแผง AI) = jsonb ของ harness · ค่าเดิมเก็บใน settings.pos._qcP38uBefore ก่อนแก้ (ซากรอบที่ถูก kill = คืนจากคีย์นี้) ·
//     คืนใน cleanupP38u (หลังงานสุดท้าย/finally/สัญญาณ)
//   • 🔴 ด่าน: ก่อนเขียนทุกครั้ง id บอร์ด/ห้องในค่าตั้งต้องเป็นของ fixture ของร้าน QC เท่านั้น — ไม่ใช่ = StepError + ยกเลิกทั้งใบ
//   • 🔴 ไม่ปิดกะ · ไม่เรียก sweepPosBoard/onShiftClosed · ไม่กดบันทึกขณะ posts.* เปิด
//   • A11 4 แถว (สาขา × ผู้อนุมัติ เจ้าของ/แคชเชียร์ · audit pos.staff.schedule_override ×3 ต่อแถว · after.unitId · เหตุผล "ภาพ QC P3.8U" · ลบตอนเก็บกวาด แบบ CD-P39U-5)
//   • การ์ดชิป: createCardFromExternal บนบอร์ด fixture (ระบบ · sourceKey pos-shift:<กะปิดล่าสุดของสาขา> + pos-anomaly:A11:<สาขา>:<วัน>:<เจ้าของ>) — เก็บไว้ (sourceKey กันซ้ำ) · มีการ์ดแล้ว = ใช้ของเดิม
//   • กะเปิดของภาพบรรทัด "เมื่อปิดกะ": เครื่อง posqc-vis-p38u-shift (openShift เจ้าของ · เงินตั้งต้น 0 · ไม่มี = เปิด · มี = ใช้ต่อ · ใกล้ถูกปิดอัตโนมัติ = SKIP) — ไม่ปิด
type P38uRoom = { meetingSystemId: string; channelId: string };
type P38uHad = { had: boolean; v: unknown };
const P38U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  before: null as null | { board: P38uHad; teamRoom: P38uHad; ai: P38uHad },
  kanbanSys: null as string | null,
  meetingSys: null as string | null,
  boardId: null as string | null,
  room: null as P38uRoom | null,
  roomArch: null as P38uRoom | null,
  audits: false,
  chipShiftId: null as string | null,
  chipAnomaly: false,
  skip: {} as Partial<Record<P38uKey, string>>,
  cfg: null as null | { board: Record<string, unknown>; teamRoom: Record<string, unknown> },
};
const P38U_BOARD_STATES: readonly P38uKey[] = ["settings-board-on", "settings-board-readonly", "settings-board-invalid", "settings-board-room-stale", "reports-anomalies-card-button", "reports-anomalies-card-pressed", "reports-anomalies-card-chip", "reports-ai-panel-board", "shifts-closed-board-chip", "shifts-close-board-hint"];
const p38uRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const p38uSkip = (ks: readonly P38uKey[], why: string) => {
  for (const k of ks) if (!P38U.skip[k]) P38U.skip[k] = why;
};
async function p38uReadPos(): Promise<Record<string, unknown>> {
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
  const pos = p38uRec(sys?.settings) ? (sys!.settings as Record<string, unknown>).pos : undefined;
  return p38uRec(pos) ? pos : {};
}
const p38uHad = (pos: Record<string, unknown>, k: string): P38uHad => (Object.prototype.hasOwnProperty.call(pos, k) ? { had: true, v: pos[k] } : { had: false, v: undefined });
/** เขียน settings.pos.<key> ทั้งก้อน (undefined = ลบคีย์) — แตะเฉพาะคีย์นั้นของ AppSystem ของร้าน QC */
async function p38uWrite(key: "board" | "teamRoom" | "ai" | "_qcP38uBefore", v: unknown): Promise<void> {
  const path = `{pos,${key}}`;
  if (v === undefined) {
    await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- ${path}::text[] WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND jsonb_typeof("settings"->'pos') = 'object'`;
    return;
  }
  const json = JSON.stringify(v);
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
        CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
      ${path}::text[], ${json}::jsonb, true)
    WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId}`;
}
/** ครั้งแรก: จำค่าเดิม (หรือคืนจากซาก _qcP38uBefore ของรอบที่ถูก kill) แล้วเขียนคีย์จำไว้ก่อนแก้อะไร */
async function p38uRemember(): Promise<void> {
  if (P38U.before) return;
  const pos = await p38uReadPos();
  const res = p38uRec(pos._qcP38uBefore) ? (pos._qcP38uBefore as Record<string, unknown>) : null;
  const fromRes = (k: "board" | "teamRoom" | "ai"): P38uHad => {
    const x = res && p38uRec(res[k]) ? (res[k] as Record<string, unknown>) : null;
    return x && x.had === true ? { had: true, v: x.v } : { had: false, v: undefined };
  };
  P38U.before = res ? { board: fromRes("board"), teamRoom: fromRes("teamRoom"), ai: fromRes("ai") } : { board: p38uHad(pos, "board"), teamRoom: p38uHad(pos, "teamRoom"), ai: p38uHad(pos, "ai") };
  if (res) P38U.log.push("กวาดซากค่าตั้งบอร์ดงาน/ห้องทีมของรอบก่อน (คืนจาก _qcP38uBefore)");
  const enc = (h: P38uHad) => ({ had: h.had, v: h.had ? (h.v ?? null) : null });
  await p38uWrite("_qcP38uBefore", { board: enc(P38U.before.board), teamRoom: enc(P38U.before.teamRoom), ai: enc(P38U.before.ai) });
}
/** 🔴 ด่าน CD-P38U-11: id บอร์ด/ห้องทุกตัวในค่าที่จะเขียน = ของ fixture ของร้าน QC เท่านั้น */
function p38uGuard(board: Record<string, unknown>, room: Record<string, unknown>): void {
  if (tenantKey !== "coffee" || !T.tenantId.startsWith("posqc-")) throw new StepError("ด่าน P3.8U: ไม่ใช่ร้าน QC coffee");
  const byUnit = p38uRec(board.boardByUnit) ? Object.values(board.boardByUnit) : [];
  for (const id of [board.defaultBoardId, ...byUnit]) if (id !== null && id !== undefined && (!P38U.boardId || id !== P38U.boardId)) throw new StepError(`ด่าน P3.8U: บอร์ด ${String(id)} ไม่ใช่บอร์ด fixture`);
  const okRoom = (r: unknown) => p38uRec(r) && [P38U.room, P38U.roomArch].some((f) => !!f && f.meetingSystemId === r.meetingSystemId && f.channelId === r.channelId);
  const roomByUnit = p38uRec(room.roomByUnit) ? Object.values(room.roomByUnit) : [];
  for (const r of [room.defaultRoom, ...roomByUnit]) if (r !== null && r !== undefined && !okRoom(r)) throw new StepError(`ด่าน P3.8U: ห้อง ${JSON.stringify(r)} ไม่ใช่ห้อง fixture`);
}
const p38uBoardCfg = (on: boolean): Record<string, unknown> => ({
  enabled: on,
  defaultBoardId: on ? P38U.boardId : null,
  boardByUnit: on && P38U.boardId ? { [unitId]: P38U.boardId } : {},
  assignManager: true,
  rules: { shiftDiff: { enabled: on, minAbsSatang: 10_000, everyClose: false, forcedClose: true }, soldOut: { enabled: on, hours: 4, sources: ["MANUAL", "KDS", "STOCK"] }, refundNeeded: { enabled: false } },
});
const p38uRoomCfg = (mode: "off" | "on" | "stale"): Record<string, unknown> => ({
  enabled: mode === "on",
  defaultRoom: mode === "on" ? P38U.room : mode === "stale" ? P38U.roomArch : null,
  roomByUnit: {},
  posts: { shiftClose: mode === "on", showOverShort: true, dailyBrief: false },
  briefHourBkk: 7,
  enabledByUserId: mode === "on" ? T.users.owner.userId : null,
});
async function p38uCard(key: string, title: string): Promise<string> {
  const { posCardsForKeys } = await import("@/lib/pos-board-bridges");
  const have = await posCardsForKeys(T.tenantId, [key]);
  if (have.length) return `การ์ด #${have[0]!.cardNo ?? "?"} มีอยู่แล้ว (${key.split(":")[0]})`;
  if (!P38U.boardId || !P38U.kanbanSys) throw new StepError("ไม่มีบอร์ด fixture");
  const { createCardFromExternal } = await import("@/lib/modules/kanban/links");
  const c = await createCardFromExternal({ tenantId: T.tenantId, systemId: P38U.kanbanSys, actorUserId: null }, { boardId: P38U.boardId, title, sourceType: "AUTOMATION" as never, sourceKey: key });
  return `การ์ด #${c.cardNo ?? "?"} ${c.created ? "สร้างใหม่" : "มีอยู่แล้ว"} (${key.split(":")[0]})`;
}
async function ensureP38uFixture(): Promise<void> {
  if (P38U.done || P38U.error) return;
  try {
    const want = (...ks: P38uKey[]) => ks.some((k) => jobs.some((j) => j.state === k));
    const owner = await ownerActor();
    const day = p38uDay();
    // POS P3.8U ▸ fix1: ร้าน QC ไม่มีระบบ KANBAN/MEETING ที่เปิดอยู่ (QC5) ⇒ หา/สร้างระบบของภาพผ่าน system/service.createSystem แบบระบบ COUPON ของ QC —
    //   มีระบบที่เปิดอยู่ = ใช้ของเดิม (ตัวแรกตาม createdAt แบบหน้าตั้งค่า) · ไม่มี = ระบบชื่อคงที่ของภาพ (เก็บไว้ · รอบหลังใช้ซ้ำ · ไม่ reseed) · ด่านร้าน QC ก่อนสร้าง ◂
    const sysFor = async (type: "KANBAN" | "MEETING", name: string): Promise<{ id: string } | null> => {
      const active = await prisma.appSystem.findFirst({ where: { tenantId: T.tenantId, type, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (active) return active;
      const mine = await prisma.appSystem.findFirst({ where: { tenantId: T.tenantId, type, name }, select: { id: true, active: true } });
      if (mine) {
        if (!mine.active) p38uSkip(type === "KANBAN" ? P38U_BOARD_STATES : ["settings-board-room-stale", "shifts-close-board-hint"], `ระบบ ${type} "${name}" ของภาพถูกปิดใช้งาน (harness ไม่เปิดคืน)`);
        return mine.active ? { id: mine.id } : null;
      }
      p38uGuard({}, {}); // ด่านร้าน QC coffee ก่อนสร้าง
      try {
        const { createSystem } = await import("@/lib/modules/system/service");
        const c = await createSystem(T.tenantId, type, name);
        P38U.log.push(`สร้างระบบ ${type} "${name}"`);
        return { id: c.id };
      } catch (e) {
        p38uSkip(type === "KANBAN" ? P38U_BOARD_STATES : ["settings-board-room-stale", "shifts-close-board-hint"], `สร้างระบบ ${type} "${name}" ไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
        return null;
      }
    };
    const kan = await sysFor("KANBAN", P38U_KANBAN_SYS_NAME);
    const meet = await sysFor("MEETING", P38U_MEETING_SYS_NAME);
    // ระบบแชททีมใหม่ = ห้อง #general + เจ้าของเป็นสมาชิก แบบเปิดหน้าแชทครั้งแรก (meeting/service.ensureWorkspace)
    if (meet) await (await import("@/lib/modules/meeting/service")).ensureWorkspace(T.tenantId, meet.id, owner.userId);
    P38U.kanbanSys = kan?.id ?? null;
    P38U.meetingSys = meet?.id ?? null;
    if (kan) {
      const had = await prisma.kanbanBoard.findFirst({ where: { tenantId: T.tenantId, systemId: kan.id, name: P38U_BOARD_NAME, status: "ACTIVE" }, select: { id: true } });
      if (had) P38U.boardId = had.id;
      else {
        const { createBoard } = await import("@/lib/modules/kanban/service");
        P38U.boardId = (await createBoard({ tenantId: T.tenantId, systemId: kan.id, name: P38U_BOARD_NAME, visibility: "TENANT" as never, createdById: owner.userId })).id;
        P38U.log.push(`สร้างบอร์ด ${P38U_BOARD_NAME}`);
      }
    } else p38uSkip(P38U_BOARD_STATES, "ไม่มีระบบ KANBAN ที่ใช้ได้ (บอร์ด fixture สร้างไม่ได้)");
    if (meet) {
      const { createChannel, archiveChannel } = await import("@/lib/modules/meeting/service");
      const find = (name: string) => prisma.meetingChannel.findFirst({ where: { tenantId: T.tenantId, systemId: meet.id, name }, select: { id: true, archivedAt: true } });
      const make = async (name: string) => {
        const c = await createChannel({ tenantId: T.tenantId, systemId: meet.id, name, kind: "PUBLIC" as never, createdByUserId: owner.userId });
        if (!c.ok) throw new StepError(`สร้างห้อง ${name}: ${c.reason}`);
        P38U.log.push(`สร้างห้อง ${name}`);
        return { id: c.id, archivedAt: null as Date | null };
      };
      const r = (await find(P38U_ROOM_NAME)) ?? (await make(P38U_ROOM_NAME));
      if (r.archivedAt) p38uSkip(["settings-board-on", "settings-board-readonly", "shifts-close-board-hint"], `ห้อง fixture ${P38U_ROOM_NAME} ถูกเก็บถาวร (harness ไม่คืนห้อง)`);
      else P38U.room = { meetingSystemId: meet.id, channelId: r.id };
      const a = (await find(P38U_ROOM_ARCH_NAME)) ?? (await make(P38U_ROOM_ARCH_NAME));
      if (!a.archivedAt) {
        const ar = await archiveChannel(meet.id, a.id);
        if (!ar.ok) throw new StepError(`เก็บถาวรห้อง ${P38U_ROOM_ARCH_NAME}: ${ar.reason ?? "?"}`);
      }
      P38U.roomArch = { meetingSystemId: meet.id, channelId: a.id };
    } else p38uSkip(["settings-board-room-stale", "shifts-close-board-hint"], "ไม่มีระบบ MEETING ที่ใช้ได้ (ห้อง fixture สร้างไม่ได้)");
    // A11 4 แถว (สาขา × ผู้อนุมัติ) — แถว (สาขานี้ · เจ้าของ) = ชิป · ที่เหลือ = แถวว่างของปุ่ม/การกด
    if (want("reports-anomalies-card-button", "reports-anomalies-card-pressed", "reports-anomalies-card-chip", "reports-ai-panel-board")) {
      const { writeAudit } = await import("@/lib/core/audit");
      const old = await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, action: "pos.staff.schedule_override", after: { path: ["reason"], string_starts_with: P38U_REASON } } });
      if (old.count) P38U.log.push(`กวาดซาก audit A11 ${old.count} แถว`);
      P38U.audits = true;
      const unitIds = [unitId, ...Object.values(T.units as Record<string, { id: string }>).map((u) => u.id).filter((u) => u !== unitId)];
      for (const u of unitIds)
        for (const actorId of [T.users.owner.userId, T.users.cashier.userId])
          for (let n = 1; n <= 3; n++)
            await writeAudit({ tenantId: T.tenantId, actorId, action: "pos.staff.schedule_override", targetType: "BusinessUnit", targetId: u, after: { userId: T.users.cashier.userId, byUserId: actorId, reason: `${P38U_REASON} ${process.pid} #${n}`, unitId: u } });
      P38U.log.push(`audit A11 ${unitIds.length * 2} แถว × 3`);
      if (want("reports-anomalies-card-chip", "reports-anomalies-card-pressed") && P38U.boardId) {
        const { reportAnomalies } = await import("@/lib/modules/pos/reports");
        const { posBoardKeys } = await import("@/lib/modules/pos/board-settings-shared");
        const rep = await reportAnomalies({ tenantId: T.tenantId, systemId: SYS }, owner, { from: day, to: day });
        const row = rep.ok ? rep.report.rows.find((x) => x.rule === "A11" && x.unitId === unitId && x.userId === T.users.owner.userId) : undefined;
        if (!row) p38uSkip(["reports-anomalies-card-chip"], `ไม่พบแถว A11 ของ fixture วันที่ ${day} (วันธุรกิจ ≠ วันปฏิทิน?)`);
        else {
          P38U.log.push(await p38uCard(posBoardKeys.anomaly(row.rule, row.unitId, row.businessDate ?? day, row.refId ?? row.userId ?? "unit"), `${P38U_REASON} · A11`));
          P38U.chipAnomaly = true;
        }
      }
    }
    if (want("shifts-closed-board-chip") && P38U.boardId) {
      const { posBoardKeys } = await import("@/lib/modules/pos/board-settings-shared");
      const recent = await prisma.posShift.findMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, status: true, zNumber: true } });
      const closed = recent.find((x) => x.status !== "OPEN" && x.zNumber !== null);
      if (!closed) p38uSkip(["shifts-closed-board-chip"], "สาขานี้ไม่มีกะที่ปิดแล้วใน 50 กะล่าสุด (harness ไม่ปิดกะ)");
      else {
        P38U.log.push(await p38uCard(posBoardKeys.shift(closed.id), `${P38U_REASON} · Z${closed.zNumber}`));
        P38U.chipShiftId = closed.id;
      }
    }
    // กะเปิดของเครื่อง fixture — ก่อนแก้ค่าตั้งใด ๆ (ค่าเดิมของร้าน) · ไม่ปิด · ใกล้ถูกปิดอัตโนมัติ = SKIP (เปิดหน้าจะทำให้ระบบปิดกะ)
    if (want("shifts-close-board-hint")) {
      const { openShift, parseShiftSettings } = await import("@/lib/modules/pos/shift");
      const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
      const hours = parseShiftSettings(sys?.settings).forceCloseAfterHours;
      const open = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, deviceId: P38U_SHIFT_DEV, status: "OPEN" }, select: { id: true, openedAt: true, systemId: true } });
      if (open && (open.systemId !== SYS || open.openedAt.getTime() + hours * 3_600_000 - 3_600_000 < Date.now()))
        p38uSkip(["shifts-close-board-hint"], `กะเปิดของเครื่อง ${P38U_SHIFT_DEV} เปิดเมื่อ ${open.openedAt.toISOString()} ใกล้ถูกปิดอัตโนมัติ (${hours} ชม.) — harness ไม่ปิดกะ · ผู้คุมปิดกะนี้เองที่หน้ากะ`);
      else if (open) P38U.log.push(`ใช้กะเปิดเดิมของเครื่อง ${P38U_SHIFT_DEV}`);
      else {
        const r = await openShift({ tenantId: T.tenantId, systemId: SYS, unitId }, owner, { deviceId: P38U_SHIFT_DEV, deviceLabel: P38U_REASON, floatSatang: 0 });
        if (!r.ok) p38uSkip(["shifts-close-board-hint"], `เปิดกะของเครื่อง ${P38U_SHIFT_DEV} ไม่ได้: ${r.code}`);
        else P38U.log.push(`เปิดกะเครื่อง ${P38U_SHIFT_DEV} (เงินตั้งต้น 0 · ไม่ปิด)`);
      }
    }
    P38U.done = true;
  } catch (e) {
    P38U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** ต่องาน: ค่าตั้งบอร์ด/ห้องตามสถานะ (ผ่านด่านก่อนเขียน) · ผู้ช่วย AI เปิดเฉพาะ reports-ai-panel-board · ด่านพัง = ยกเลิกทั้งใบ */
async function prepP38u(state: P38uKey): Promise<void> {
  if (!P38U.done || P38U.skip[state]) return;
  try {
    await p38uRemember();
    const board = p38uBoardCfg(state !== "settings-board-off" && !!P38U.boardId);
    const roomMode = (state === "settings-board-on" || state === "settings-board-readonly" || state === "shifts-close-board-hint") && P38U.room ? "on" : state === "settings-board-room-stale" && P38U.roomArch ? "stale" : "off";
    const teamRoom = p38uRoomCfg(roomMode);
    p38uGuard(board, teamRoom);
    await p38uWrite("board", board);
    await p38uWrite("teamRoom", teamRoom);
    P38U.cfg = { board, teamRoom };
    const b = P38U.before!.ai;
    if (state === "reports-ai-panel-board") await p38uWrite("ai", { ...(p38uRec(b.v) ? b.v : {}), enabled: true });
    else if (jobs.some((j) => j.state === "reports-ai-panel-board")) await p38uWrite("ai", b.had ? b.v : undefined);
  } catch (e) {
    P38U.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
/** หลังงาน P3.8U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน (บอร์ด/ห้อง/การ์ด/กะของ fixture คงอยู่) */
async function cleanupP38u(): Promise<void> {
  if (P38U.cleaned) return;
  P38U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string>) => {
    try {
      P38U.log.push(await fn());
    } catch (e) {
      P38U.ok = false;
      P38U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  if (P38U.before) {
    const b = P38U.before;
    await step("คืนค่าตั้งบอร์ดงาน/ห้องทีม", async () => {
      await p38uWrite("board", b.board.had ? b.board.v : undefined);
      await p38uWrite("teamRoom", b.teamRoom.had ? b.teamRoom.v : undefined);
      await p38uWrite("ai", b.ai.had ? b.ai.v : undefined);
      await p38uWrite("_qcP38uBefore", undefined);
      return "คืนค่าตั้งบอร์ดงาน/ห้องทีม/ผู้ช่วย AI เดิม";
    });
  }
  if (P38U.audits)
    await step("ลบ audit A11", async () => `ลบ audit A11 ${(await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, action: "pos.staff.schedule_override", after: { path: ["reason"], string_starts_with: P38U_REASON } } })).count} แถว`);
}
async function runP38uState(page: Any, state: P38uKey, _device: Device): Promise<void> {
  if (P38U.error) throw new StepError(`fixture P3.8U: ${P38U.error}`);
  if (!P38U.done) throw new StepError("fixture P3.8U ยังไม่ได้สร้าง");
  const sk = P38U.skip[state];
  if (sk) throw new StepError(`SKIP — ${sk}`);
  const into = async (sel: string, block: "start" | "center" = "center") => {
    const el = await visibleEl(page, sel, 0, 20_000);
    await el.evaluate((e: Element, b: string) => e.scrollIntoView({ block: b as "start" | "center" }), block);
    return el;
  };
  const has = async (sel: string) => !!(await page.$(sel));
  const need = async (sel: string, why: string) => {
    await visibleEl(page, sel, 0, 20_000).catch(() => {
      throw new StepError(why);
    });
  };
  switch (state) {
    case "settings-board-off":
      await into(tid("pos-settings-board-board"), "start");
      if (P38U.kanbanSys) await need(tid("pos-settings-board-create"), "ไม่มีปุ่มสร้างบอร์ด (pos-settings-board-create)");
      else await need(tid("pos-settings-board-no-kanban"), "ไม่มีข้อความร้านยังไม่มีระบบบอร์ดงาน");
      if (!(await has(tid("pos-settings-board-all-off")))) throw new StepError("ไม่มีกรอบประห้องทีมปิดอยู่ (pos-settings-board-all-off)");
      if (!(await has(tid("pos-settings-board-need-board")))) throw new StepError("สวิตช์หลักไม่บอกเหตุผล board.needBoard");
      return;
    case "settings-board-on":
      await into(tid("pos-settings-board-board"), "start");
      await page.waitForFunction(() => document.querySelector('[data-testid="pos-settings-board-enabled"]')?.getAttribute("aria-checked") === "true", { timeout: 10_000 }).catch(() => {
        throw new StepError("สวิตช์หลักบอร์ดงานไม่ได้เปิด (aria-checked)");
      });
      await need(tid(`pos-settings-board-unit-${unitId}`), "ไม่มีตัวเลือกบอร์ดรายสาขา");
      if (P38U.kanbanSys) await need(tid("pos-settings-board-readonly-voided"), "ไม่มีแถวอ่านอย่างเดียว K3.3 (pos-settings-board-readonly-voided)");
      return;
    case "settings-board-readonly":
      await into(tid("pos-settings-board-tab"), "start");
      await need(tid("pos-settings-board-owner-only"), "ผู้ดูที่ไม่ใช่เจ้าของไม่เห็นข้อความเจ้าของร้านเท่านั้น");
      for (const id of ["pos-settings-board-save", "pos-settings-board-room-save", "pos-settings-board-default", "pos-settings-board-room-default", "pos-settings-board-create"]) if (await has(tid(id))) throw new StepError(`ผู้ดูที่ไม่ใช่เจ้าของเห็น ${id}`);
      return;
    case "settings-board-invalid": {
      // 🔴 ด่าน CD-P38U-11: ไม่กดบันทึกขณะห้องทีมเปิดหรือ posts ที่ส่งโพสต์ (shiftClose/dailyBrief) เปิด
      const posts = P38U.cfg && p38uRec(P38U.cfg.teamRoom.posts) ? (P38U.cfg.teamRoom.posts as Record<string, unknown>) : {};
      if (!P38U.cfg || P38U.cfg.teamRoom.enabled === true || posts.shiftClose === true || posts.dailyBrief === true) throw new StepError("ด่าน P3.8U: ไม่กดบันทึกขณะ posts.* เปิด");
      await into(tid("pos-settings-board-hours"));
      await typeInto(page, tid("pos-settings-board-hours"), "0");
      await clickEl(page, tid("pos-settings-board-save"));
      await need('[data-testid="pos-settings-board-error"][data-field="board.rules.soldOut.hours"]', "บันทึกชั่วโมง 0 แล้วไม่มีข้อความปฏิเสธที่ช่อง (field board.rules.soldOut.hours)");
      await into('[data-testid="pos-settings-board-error"][data-field="board.rules.soldOut.hours"]');
      return;
    }
    case "settings-board-room-stale":
      await into(tid("pos-settings-board-room"), "start");
      await need(tid("pos-settings-board-stale"), "ห้องที่เก็บถาวรไม่ขึ้นคำเตือน board.room.stale");
      return;
    case "settings-shark-kanban-link":
      await into(tid("pos-settings-card-kanban"));
      await need(tid("pos-settings-board-manage-here"), "การ์ด KANBAN ไม่มีลิงก์ไปแท็บบอร์ดงาน (pos-settings-board-manage-here)");
      return;
    case "reports-anomalies-card-button":
      await into(tid("pos-reports-anomaly-group-A11"), "start").catch(() => {
        throw new StepError("แท็บจุดผิดปกติไม่มีกลุ่ม A11 (fixture)");
      });
      await need('[data-testid="pos-reports-anomaly-group-A11"] button[data-testid^="pos-reports-anomaly-card-"]', "แถว A11 ไม่มีปุ่มสร้างงานในบอร์ด");
      return;
    case "reports-anomalies-card-chip":
      await into(tid("pos-reports-anomaly-group-A11"), "start");
      await need('[data-testid="pos-reports-anomaly-group-A11"] [data-testid^="pos-reports-anomaly-card-chip-"]', "แถว A11 ของ fixture ไม่ขึ้นชิปการ์ด (posBoardCardsAction)");
      return;
    case "reports-anomalies-card-pressed": {
      await into(tid("pos-reports-anomaly-group-A11"), "start");
      if (P38U.chipAnomaly) await need('[data-testid="pos-reports-anomaly-group-A11"] [data-testid^="pos-reports-anomaly-card-chip-"]', "ชิปของแถว fixture ไม่ขึ้น — ยังไม่กด (ผลอ่านชิปยังไม่กลับ)");
      else await sleep(1500);
      const btns = await page.$$('[data-testid="pos-reports-anomaly-group-A11"] button[data-testid^="pos-reports-anomaly-card-"]:not([disabled])');
      if (!btns.length) throw new StepError("SKIP — ไม่มีแถว A11 ที่ยังไม่มีการ์ด (กุญแจรายวัน · กดครบแล้ววันนี้)");
      const id = String(await btns[0].evaluate((e: Element) => e.getAttribute("data-testid")));
      const n = id.slice("pos-reports-anomaly-card-".length);
      await btns[0].evaluate((e: Element) => e.scrollIntoView({ block: "center" }));
      await btns[0].click();
      await page.waitForFunction((x: string) => !!document.querySelector(`[data-testid="pos-reports-anomaly-card-chip-${x}"],[data-testid="pos-reports-anomaly-card-done-${x}"],[data-testid="pos-reports-anomaly-card-reason-${x}"]`), { timeout: 20_000 }, n).catch(() => {
        throw new StepError(`กดปุ่มแถว ${n} แล้วไม่มีผล (ชิป/เหตุผล)`);
      });
      if (await has(tid(`pos-reports-anomaly-card-reason-${n}`))) throw new StepError(`กดแล้วถูกปฏิเสธ: ${String(await page.$eval(tid(`pos-reports-anomaly-card-reason-${n}`), (e: Element) => e.textContent ?? ""))}`);
      return;
    }
    case "reports-ai-panel-board":
      await into(tid("pos-reports-ai-panel"));
      await need(tid("pos-reports-ai-board"), "แผงผู้ช่วย AI ไม่มีปุ่มสร้างงานในบอร์ด (anomalyHits ∧ boardOn)");
      return;
    case "shifts-closed-board-chip":
      await into(tid(`pos-shift-board-chip-${P38U.chipShiftId ?? "?"}`)).catch(() => {
        throw new StepError("กะที่ปิดแล้วของ fixture ไม่ขึ้นชิปการ์ด (pos-shift-board-chip-*)");
      });
      return;
    case "shifts-close-board-hint":
      await into(tid("pos-shift-close"), "start").catch(() => {
        throw new StepError(`ไม่เห็นการ์ดปิดกะของเครื่อง ${P38U_SHIFT_DEV}`);
      });
      await into(tid("pos-shift-board-hint"));
      for (const id of ["pos-shift-board-hint-room", "pos-shift-board-hint-card"]) if (!(await has(tid(id)))) throw new StepError(`บรรทัด "เมื่อปิดกะ" ไม่มี ${id}`);
      return;
  }
}
// ═══════════════════ POS P3.9U ▸ ผู้ช่วย AI: แผง 08 · A11 · การ์ด AI 10 + แผ่นสรุปเช้า (มติ 1 4 6 · CD-P39U-4/5) ◂ ═══════════════════
// fixture (ensureP39uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • brief: บิลวันนี้ 3 ใบ + 1 ใบที่ยกเลิกโดยเจ้าของ (createSale/voidSale · คีย์ต่อวัน · ไม่ลบ แบบ P2.12U) — composeBrief มีบรรทัดยอดขาย/ขายดี/ชั่วโมงขายดี
//   • A11: audit pos.staff.schedule_override ×3 ผ่าน writeAudit (ผู้อนุมัติ = เจ้าของ · targetType PosDevice ของสาขานี้ · after {userId, byUserId, reason, deviceId}) — ซากของรอบก่อนกวาดก่อนเขียน
//   • แผ่นสรุปเช้า: ผู้จัดการชั่วคราว (User ใช้ซ้ำ · Membership MANAGER สร้างทุกรอบ ลบตอนเก็บกวาด)
//   • settings.pos.ai (CD-P39U-4 · ไม่มีตัวเขียนระดับโมดูล): jsonb_set เฉพาะ {pos,ai} · ค่าเดิมเก็บใน _qcP39uBefore {had, v} (ซากรอบที่ถูก kill = คืนจากคีย์นี้) · คืนค่าใน cleanupP39u
const P39U_MGR = { userId: "posqc-coffee-user-p39u-mgr", membershipId: "posqc-coffee-mb-p39u-mgr", email: "pos-qc-coffee-p39u-mgr@shark.local", name: "ผู้จัดการ (ภาพ QC P3.9U)" } as const;
const P39U_REASON = "ภาพ QC P3.9U";
const P39U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  before: null as null | { had: boolean; v: unknown },
  mgr: false,
  audits: false,
  // POS P3.9U ▸ fix1 N1: ภาพ "ว่าง" = วันที่ไม่มีบรรทัดที่ต้องทำต่อ ⇒ พัก 86 ของระบบ + จุดสั่งซื้อของสินค้าที่ใกล้หมดชั่วคราว (คืนหลังภาพ · ค่าที่พักเก็บใน _qcP39uBefore.park กัน kill) ◂
  enabled: true,
  park: null as null | P39uPark,
  emptyNote: null as string | null,
};
type P39uPark = { marks: { id: string; tenantId: string; systemId: string; unitId: string; productId: string; source: string; note: string | null; markedAt: string; markedByUserId: string | null }[]; reorder: { id: string; reorderPoint: number }[] };
const p39uRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
async function p39uReadAi(): Promise<{ had: boolean; v: unknown }> {
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
  const pos = p39uRec(sys?.settings) ? (sys!.settings as Record<string, unknown>).pos : undefined;
  return p39uRec(pos) && Object.prototype.hasOwnProperty.call(pos, "ai") ? { had: true, v: pos.ai } : { had: false, v: undefined };
}
/** เขียน settings.pos.ai ทั้งก้อน (undefined = ลบคีย์) — แตะเฉพาะ {pos,ai} */
async function p39uWriteAi(v: unknown): Promise<void> {
  if (v === undefined) {
    await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- '{pos,ai}' WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND jsonb_typeof("settings"->'pos') = 'object'`;
    return;
  }
  const json = JSON.stringify(v);
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
        CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
      '{pos,ai}', ${json}::jsonb, true)
    WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId}`;
}
/** ผู้ช่วย AI เปิด/ปิด + ค่าสรุปเช้าคงที่ของภาพ (06:00 · ไม่ส่งอีเมล · ไม่มีผู้จัดการ · จุดผิดปกติในสรุป) */
async function p39uSetAi(enabled: boolean): Promise<void> {
  if (!P39U.before) {
    const cur = await p39uReadAi();
    const res = p39uRec(cur.v) && p39uRec(cur.v._qcP39uBefore) ? (cur.v._qcP39uBefore as { had?: unknown; v?: unknown }) : null;
    P39U.before = res ? { had: res.had === true, v: res.had === true ? res.v : undefined } : cur;
    if (res) P39U.log.push("กวาดซากค่าตั้งผู้ช่วย AI ของรอบก่อน (คืนจาก _qcP39uBefore)");
    const oldPark = res && p39uRec(res) && p39uRec((res as Record<string, unknown>).park) ? ((res as Record<string, unknown>).park as P39uPark) : null;
    if (oldPark) {
      await p39uRestorePark(oldPark);
      P39U.log.push(`คืน 86 ${oldPark.marks.length} · จุดสั่งซื้อ ${oldPark.reorder.length} ที่รอบก่อนพักไว้`);
    }
  }
  P39U.enabled = enabled;
  const base: Record<string, unknown> = p39uRec(P39U.before.v) ? P39U.before.v : {};
  await p39uWriteAi({
    ...base,
    enabled,
    brief: { ...(p39uRec(base.brief) ? base.brief : {}), enabled: true, hourBkk: 6, email: false, managerUserIds: [] },
    anomalyInBrief: true,
    _qcP39uBefore: { had: P39U.before.had, v: P39U.before.had ? (P39U.before.v ?? null) : null, park: P39U.park },
  });
}
async function p39uRestorePark(park: P39uPark): Promise<void> {
  if (park.marks.length)
    await prisma.posAvailabilityMark.createMany({ data: park.marks.map((m) => ({ ...m, source: m.source as never, markedAt: new Date(m.markedAt) })), skipDuplicates: true });
  for (const r of park.reorder) await prisma.invItem.updateMany({ where: { id: r.id, tenantId: T.tenantId }, data: { reorderPoint: r.reorderPoint } });
}
/** ก่อนภาพ "ว่าง": พัก 86 ของระบบนี้ + ตั้งจุดสั่งซื้อ 0 ให้สินค้าที่ onHand ≤ จุดสั่งซื้อ (ตัวอ่าน posStockRisks) — จดค่าลง _qcP39uBefore ก่อนแก้ */
async function p39uPark(): Promise<void> {
  if (P39U.park) return;
  const marks = await prisma.posAvailabilityMark.findMany({ where: { tenantId: T.tenantId, systemId: SYS } });
  const prods = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, systemId: SYS, archivedAt: null, invItemId: { not: null } }, select: { invItemId: true } });
  const ids = [...new Set(prods.map((x) => x.invItemId).filter((x): x is string => !!x))];
  const items = ids.length ? await prisma.invItem.findMany({ where: { tenantId: T.tenantId, id: { in: ids }, kind: "PRODUCT", archivedAt: null, reorderPoint: { gt: 0 } }, select: { id: true, onHand: true, reorderPoint: true } }) : [];
  P39U.park = {
    marks: marks.map((m) => ({ id: m.id, tenantId: m.tenantId, systemId: m.systemId, unitId: m.unitId, productId: m.productId, source: String(m.source), note: m.note, markedAt: m.markedAt.toISOString(), markedByUserId: m.markedByUserId })),
    reorder: items.filter((i) => i.onHand <= i.reorderPoint).map((i) => ({ id: i.id, reorderPoint: i.reorderPoint })),
  };
  await p39uSetAi(P39U.enabled); // จดก่อนแก้
  if (P39U.park.marks.length) await prisma.posAvailabilityMark.deleteMany({ where: { tenantId: T.tenantId, id: { in: P39U.park.marks.map((m) => m.id) } } });
  for (const r of P39U.park.reorder) await prisma.invItem.updateMany({ where: { id: r.id, tenantId: T.tenantId }, data: { reorderPoint: 0 } });
  const props = await prisma.aiProposal.count({ where: { tenantId: T.tenantId, status: "PENDING", expiresAt: { gt: new Date() }, conversationId: { startsWith: `u~${T.users.owner.userId}~` } } });
  P39U.emptyNote = props ? `เจ้าของมีข้อเสนอ AI รอยืนยัน ${props} รายการ (บรรทัดที่ต้องทำต่อ — ภาพว่างทำไม่ได้)` : null;
  P39U.log.push(`ภาพว่าง: พัก 86 ${P39U.park.marks.length} · จุดสั่งซื้อ ${P39U.park.reorder.length} (คืนหลังภาพ)`);
}
async function p39uUnpark(): Promise<void> {
  if (!P39U.park) return;
  const park = P39U.park;
  await p39uRestorePark(park);
  P39U.park = null;
  await p39uSetAi(P39U.enabled);
  P39U.log.push(`คืน 86 ${park.marks.length} · จุดสั่งซื้อ ${park.reorder.length}`);
}
async function p39uMgrRole(role: "MANAGER" | "STAFF"): Promise<void> {
  await prisma.membership.updateMany({ where: { userId: P39U_MGR.userId, tenantId: T.tenantId }, data: { role } });
}
async function ensureP39uFixture(): Promise<void> {
  if (P39U.done || P39U.error) return;
  try {
    const want = (...ks: P39uKey[]) => ks.some((k) => jobs.some((j) => j.state === k));
    const owner = await ownerActor();
    const day = p39uDay();
    if (want("reports-ai-panel-brief")) {
      const { createSale, voidSale } = await import("@/lib/modules/pos/service");
      const sale = async (k: string, lines: { name: string; qty: number; unitPriceSatang: number }[]): Promise<string> => {
        const total = lines.reduce((a, l) => a + l.qty * l.unitPriceSatang, 0);
        const r = await createSale({
          tenantId: T.tenantId,
          unitId,
          systemId: SYS,
          sourceModule: "POS",
          shiftId: null,
          soldByUserId: owner.userId,
          idempotencyKey: `${FIX.prefix}p39u-${k}-${day}`,
          lines: lines.map((l) => ({ ...l, name: `${l.name} ${BILL_TAG}` })),
          payMethods: [{ type: "PROMPTPAY", amountSatang: total }],
        } as never);
        return (r as { saleId: string }).saleId;
      };
      await sale("1", [{ name: "ลาเต้เย็น", qty: 2, unitPriceSatang: 7500 }, { name: "ครัวซองต์", qty: 3, unitPriceSatang: 6500 }]);
      await sale("2", [{ name: "ลาเต้เย็น", qty: 1, unitPriceSatang: 7500 }]);
      await sale("3", [{ name: "ชาไทยเย็น", qty: 2, unitPriceSatang: 6000 }]);
      const v = await sale("void", [{ name: "อเมริกาโน่ร้อน", qty: 1, unitPriceSatang: 6000 }]);
      const st = await prisma.posSale.findUnique({ where: { id: v }, select: { status: true } });
      if (st?.status === "PAID") await voidSale(T.tenantId, unitId, v, { actorUserId: owner.userId, reason: `ลูกค้ายกเลิกออเดอร์ (${P39U_REASON})` });
      P39U.log.push("บิลวันนี้ 3 ใบ + ยกเลิก 1 ใบ");
    }
    // POS P3.9U ▸ fix1 N1: ภาพ brief ต้องมีบรรทัดที่ต้องทำต่อ ⇒ ใช้ A11 ชุดเดียวกัน (จุดผิดปกติที่ถูกจับ) ◂
    if (want("reports-anomalies-a11", "reports-ai-panel-brief")) {
      const { writeAudit } = await import("@/lib/core/audit");
      const dev = await prisma.posDevice.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId }, orderBy: { createdAt: "asc" }, select: { id: true, deviceCode: true } });
      if (!dev) throw new StepError("สาขานี้ไม่มีเครื่อง POS (A11 ต้องหาสาขาจากเครื่อง)");
      const old = await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, action: "pos.staff.schedule_override", after: { path: ["reason"], string_starts_with: P39U_REASON } } });
      if (old.count) P39U.log.push(`กวาดซาก audit A11 ${old.count} แถว`);
      P39U.audits = true;
      for (let n = 1; n <= 3; n++)
        await writeAudit({
          tenantId: T.tenantId,
          actorId: owner.userId,
          action: "pos.staff.schedule_override",
          targetType: "PosDevice",
          targetId: dev.id,
          after: { userId: T.users.cashier.userId, byUserId: owner.userId, reason: `${P39U_REASON} ${process.pid} #${n}`, deviceId: dev.deviceCode },
        });
      P39U.log.push(`audit pos.staff.schedule_override ×3 (ผู้อนุมัติ เจ้าของ · เครื่อง ${dev.deviceCode})`);
    }
    if (want("settings-ai-brief-sheet", "settings-ai-brief-sheet-invalid")) {
      await prisma.user.upsert({ where: { id: P39U_MGR.userId }, update: {}, create: { id: P39U_MGR.userId, email: P39U_MGR.email, name: P39U_MGR.name } });
      P39U.mgr = true;
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId: P39U_MGR.userId, tenantId: T.tenantId } },
        update: { role: "MANAGER", unitAccess: [unitId], permissions: {}, acceptedAt: new Date() },
        create: { id: P39U_MGR.membershipId, userId: P39U_MGR.userId, tenantId: T.tenantId, role: "MANAGER", unitAccess: [unitId], permissions: {}, acceptedAt: new Date() },
      });
      P39U.log.push(`ผู้จัดการชั่วคราว ${P39U_MGR.name}`);
    }
    P39U.done = true;
  } catch (e) {
    P39U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** ต่องาน: ผู้ช่วย AI ปิดเฉพาะ *-off · ผู้จัดการชั่วคราวกลับเป็น MANAGER ก่อนเปิดหน้า (หน้าส่งรายชื่อจากฝั่ง server) */
async function prepP39u(state: P39uKey): Promise<void> {
  if (!P39U.done) return;
  try {
    await p39uSetAi(!(state === "reports-ai-panel-off" || state === "settings-ai-card-off"));
    if (state === "reports-ai-panel-empty") await p39uPark(); // POS P3.9U ▸ fix1 N1 ◂
    else await p39uUnpark();
    if (P39U.mgr) await p39uMgrRole("MANAGER");
  } catch (e) {
    P39U.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
/** หลังงาน P3.9U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน (บิลของ fixture คงอยู่ แบบ P2.12U) */
async function cleanupP39u(): Promise<void> {
  if (P39U.cleaned) return;
  P39U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string>) => {
    try {
      P39U.log.push(await fn());
    } catch (e) {
      P39U.ok = false;
      P39U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  if (P39U.park) {
    const park = P39U.park;
    await step("คืน 86/จุดสั่งซื้อที่พักไว้", async () => {
      await p39uRestorePark(park);
      P39U.park = null;
      return `คืน 86 ${park.marks.length} · จุดสั่งซื้อ ${park.reorder.length}`;
    });
  }
  if (P39U.before) {
    const b = P39U.before;
    await step("คืนค่าตั้งผู้ช่วย AI", async () => {
      await p39uWriteAi(b.had ? b.v : undefined);
      return b.had ? "คืนค่าตั้งผู้ช่วย AI เดิม" : "ลบค่าตั้งผู้ช่วย AI ของภาพ (เดิมไม่มี)";
    });
  }
  if (P39U.audits)
    await step("ลบ audit A11", async () => `ลบ audit A11 ${(await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, action: "pos.staff.schedule_override", after: { path: ["reason"], string_starts_with: P39U_REASON } } })).count} แถว`);
  if (P39U.mgr) await step("ลบผู้จัดการชั่วคราว", async () => `ลบ Membership ผู้จัดการชั่วคราว ${(await prisma.membership.deleteMany({ where: { userId: P39U_MGR.userId, tenantId: T.tenantId } })).count}`);
}
async function runP39uState(page: Any, state: P39uKey, _device: Device): Promise<void> {
  if (P39U.error) throw new StepError(`fixture P3.9U: ${P39U.error}`);
  if (!P39U.done) throw new StepError("fixture P3.9U ยังไม่ได้สร้าง");
  const into = async (sel: string, block: "start" | "center" = "center") => {
    const el = await visibleEl(page, sel, 0, 20_000);
    await el.evaluate((e: Element, b: string) => e.scrollIntoView({ block: b as "start" | "center" }), block);
    return el;
  };
  const has = async (sel: string) => !!(await page.$(sel));
  const aiSwitchReady = (want: "true" | "false") =>
    page
      .waitForFunction((w: string) => {
        const b = document.querySelector('[data-testid="pos-settings-ai-switch"]') as HTMLButtonElement | null;
        return !!b && !b.disabled && b.getAttribute("aria-checked") === w;
      }, { timeout: 20_000 }, want)
      .catch(() => {
        throw new StepError(`สวิตช์การ์ด AI ไม่พร้อม/ไม่ตรง (คาด aria-checked=${want})`);
      });
  const openSheet = async () => {
    await into(tid("pos-settings-card-ai"));
    await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-settings-ai-open"]') as HTMLButtonElement | null)?.disabled, { timeout: 20_000 }).catch(() => {
      throw new StepError("ปุ่มตั้งค่าสรุปเช้า (pos-settings-ai-open) ไม่พร้อม");
    });
    await (await visibleEl(page, tid("pos-settings-ai-open"))).click();
    await visibleEl(page, tid("pos-settings-ai-sheet"), 0, 10_000);
    if (!(await has(tid(`pos-settings-ai-manager-${P39U_MGR.userId}`)))) throw new StepError("แผ่นไม่มีช่องผู้จัดการชั่วคราวของภาพ");
  };
  switch (state) {
    case "reports-ai-panel-brief": {
      await into(tid("pos-reports-ai-panel"));
      await visibleEl(page, tid("pos-reports-ai-line-0"), 0, 20_000).catch(() => {
        throw new StepError("แผงผู้ช่วย AI ไม่มีบรรทัดสรุป (pos-reports-ai-line-0)");
      });
      for (const id of ["pos-reports-ai-at", "pos-reports-ai-draft-po", "pos-reports-ai-ask", "pos-reports-ai-propose-only"]) if (!(await has(tid(id)))) throw new StepError(`แผงไม่มี ${id}`);
      return;
    }
    case "reports-ai-panel-empty":
      if (P39U.emptyNote) throw new StepError(P39U.emptyNote);
      await into(tid("pos-reports-ai-panel"));
      await visibleEl(page, tid("pos-reports-ai-empty"), 0, 20_000);
      if (await has(tid("pos-reports-ai-line-0"))) throw new StepError("วันไม่มีบิลแต่แผงมีบรรทัดสรุป");
      return;
    case "reports-ai-panel-refused":
      await visibleEl(page, tid("pos-report-refusal"), 0, 20_000);
      await into(tid("pos-reports-ai-refused"));
      if (await has(tid("pos-reports-ai-line-0"))) throw new StepError("แผงปฏิเสธมีบรรทัดตัวเลข");
      return;
    case "reports-ai-panel-off":
      await into(tid("pos-reports-ai-off"));
      if (userKey === "owner" && !(await has(tid("pos-reports-ai-settings")))) throw new StepError("เจ้าของร้านไม่เห็นลิงก์ไปตั้งค่า (pos-reports-ai-settings)");
      return;
    case "reports-anomalies-a11":
      await into(tid("pos-reports-anomaly-group-A11"), "start").catch(() => {
        throw new StepError("แท็บจุดผิดปกติไม่มีกลุ่ม A11 (pos-reports-anomaly-group-A11)");
      });
      return;
    case "settings-general-anomaly-a11":
      await into(tid("pos-settings-general-anomaly"), "start");
      await into(tid("pos-settings-anomaly-A11-count")).catch(() => {
        throw new StepError("การ์ดจุดผิดปกติไม่มีแถว A11 (pos-settings-anomaly-A11-count)");
      });
      return;
    case "settings-ai-card-off":
    case "settings-ai-card-linked":
      await into(tid("pos-settings-card-ai"));
      await aiSwitchReady(state === "settings-ai-card-linked" ? "true" : "false");
      return;
    case "settings-ai-brief-sheet":
      await openSheet();
      return;
    case "settings-ai-brief-sheet-invalid": {
      await openSheet();
      await (await visibleEl(page, tid(`pos-settings-ai-manager-${P39U_MGR.userId}`))).click();
      try {
        await p39uMgrRole("STAFF");
        await (await visibleEl(page, tid("pos-settings-ai-save"))).click();
        await visibleEl(page, tid("pos-settings-ai-error"), 0, 15_000).catch(() => {
          throw new StepError("บันทึกแล้วไม่มีข้อความปฏิเสธใต้รายชื่อ (pos-settings-ai-error)");
        });
      } finally {
        await p39uMgrRole("MANAGER").catch(() => undefined);
      }
      return;
    }
  }
}
// ═══════════════════ POS P3.7U ▸ แชท: การ์ด CHAT 10 (สวิตช์ 4 ตัว + แผ่น) · 09 ลิงก์ชำระในแชท + ชิป + UI-13 · PayDone ชิป LINE อัตโนมัติ (CD-P37U-1…10) ◂ ═══════════════════
// fixture (ensureP37uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล · ไม่ reseed · context ใหม่ทุกสถานะ):
//   • ด่าน LINE (CD-P37U-10): นับ ChatChannelConnection LINE CONNECTED ของร้าน QC — > 0 ⇒ สถานะที่เปิดสวิตช์ (settings-chat-card-on · paydone-line-auto) SKIP พร้อมเหตุผล (ไม่มีทาง push จริง)
//   • settings.pos.chat = jsonb ของ harness เท่านั้น (แบบ CD-P39U-4): ค่าเดิมเก็บใน settings.pos._qcP37uBefore {had, v} (ซากรอบที่ถูก kill = คืนจากคีย์นี้) ·
//     ปิด = ลบคีย์ (W15 ค่าปริยาย) · เปิด = receiptAuto + orderStatus (card-on) / receiptAuto (paydone · ปิดทันทีหลังภาพ) · คืนค่าใน cleanupP37u
//   • ระบบแชทชั่วคราว "แชท (ภาพ QC P3.7U <pid>)" (system/service.createSystem · ซากของ pid ที่ตายแล้วถูกกวาด) + ช่อง WEBCHAT (chat ensureWebchatConnection ·
//     ส่ง = no-op ⇒ SENT ไม่แตะเครือข่าย) + ห้อง 1 ห้องจาก receiveWebchatInbound · ออเดอร์แชทผ่าน pos/order ingestOrder (เจ้าของ): ผูกห้อง + สมาชิก QC (UI-13) / ไม่ผูกห้อง ·
//     orders-detail-chat-sent = ออเดอร์ใหม่ต่อภาพ แล้วกดปุ่มจริง (ประตู A บนร้าน QC) · orders-chat-card-requested = ออเดอร์ที่ขอชำระแล้ว (ของภาพ sent หรือ requestChatPayment ของ root)
//   • เก็บกวาด (หลังงานสุดท้าย/finally/สัญญาณ): คืน settings.pos.chat → ปฏิเสธออเดอร์ NEW ผ่าน rejectOrder (ยกเลิกใบขอรับเงินใน tx เดียว) → ลบแถวออเดอร์/ใบ/outbox/audit/ops ของรอบ →
//     ลบแถวแชทของระบบชั่วคราว (ข้อความ/ห้อง/ผู้ติดต่อ/ช่อง/ค่าตั้ง/แจ้งเตือน/outbox) + ระบบ · บิล PayDone (ขายจริง 1 ใบผูกสมาชิก QC) คงไว้แบบ sale-done-member
const P37U_CHAT_PREFIX = "แชท (ภาพ QC P3.7U ";
const P37U_TAG = `posqc-vis-p37u-${process.pid}`;
const P37U = {
  done: false,
  error: null as string | null,
  cleaned: false,
  ok: true,
  log: [] as string[],
  lineConnected: 0,
  before: null as null | { had: boolean; v: unknown },
  chatSystemId: "",
  connectionId: "",
  conversationId: "",
  chatChannelId: "",
  memberId: "",
  seq: 0,
  ids: [] as string[],
  refs: {} as Record<string, string>,
  /** ออเดอร์ของภาพ sent ล่าสุด (กดปุ่มแล้ว = รอชำระ) */
  sentIds: [] as string[],
  requestedRef: "",
};
const p37uRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
async function p37uReadPos(): Promise<Record<string, unknown>> {
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
  const pos = p37uRec(sys?.settings) ? (sys!.settings as Record<string, unknown>).pos : undefined;
  return p37uRec(pos) ? pos : {};
}
/** เขียนคีย์ใต้ settings.pos (undefined = ลบคีย์) — แตะเฉพาะ {pos,<key>} */
async function p37uWritePosKey(key: "chat" | "_qcP37uBefore", v: unknown): Promise<void> {
  if (v === undefined) {
    if (key === "chat") await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- '{pos,chat}' WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND jsonb_typeof("settings"->'pos') = 'object'`;
    else await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- '{pos,_qcP37uBefore}' WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND jsonb_typeof("settings"->'pos') = 'object'`;
    return;
  }
  const json = JSON.stringify(v);
  const path = key === "chat" ? "{pos,chat}" : "{pos,_qcP37uBefore}";
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
        CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
      ${path}::text[], ${json}::jsonb, true)
    WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId}`;
}
/** ค่าตั้งแชทของภาพ: null = ลบคีย์ (ปิดทั้งหมด · ค่าปริยาย W15) · อื่น = สวิตช์ที่เปิด (ที่เหลือปิด) — จดค่าเดิมก่อนแก้ครั้งแรก */
async function p37uSetChat(on: null | { receiptAuto?: boolean; orderStatus?: boolean }): Promise<void> {
  if (!P37U.before) {
    const pos = await p37uReadPos();
    const res = p37uRec(pos._qcP37uBefore) ? (pos._qcP37uBefore as { had?: unknown; v?: unknown }) : null;
    P37U.before = res ? { had: res.had === true, v: res.had === true ? res.v : undefined } : Object.prototype.hasOwnProperty.call(pos, "chat") ? { had: true, v: pos.chat } : { had: false, v: undefined };
    if (res) P37U.log.push("กวาดซากค่าตั้งแชทของรอบก่อน (คืนจาก _qcP37uBefore)");
    await p37uWritePosKey("_qcP37uBefore", { had: P37U.before.had, v: P37U.before.had ? (P37U.before.v ?? null) : null });
  }
  if (on === null) await p37uWritePosKey("chat", undefined);
  else await p37uWritePosKey("chat", { receiptAuto: !!on.receiptAuto, refundNotice: false, orderStatus: !!on.orderStatus, autoReply: false, statusKinds: ["accepted", "ready", "cancelled", "paid"], botPauseHours: 24 });
}
async function p37uCtx() {
  return { ctx: { tenantId: T.tenantId, systemId: SYS, unitId }, actor: await memberActorOf("owner") };
}
/** ออเดอร์แชทใหม่ (ingestOrder เจ้าของ · UNPAID · รับที่ร้าน) — room = ผูกห้องแชทของรอบ · member = สมาชิก QC (UI-13) */
async function p37uOrder(tag: string, opts: { room: boolean; member: boolean }): Promise<string> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p37uCtx();
  const r = await ord.ingestOrder(ctx, actor, {
    idempotencyKey: `${P37U_TAG}-${Date.now().toString(36)}-${++P37U.seq}`,
    channelId: P37U.chatChannelId,
    lines: [{ productId: QC_IDS.amer, qty: 1 }, { productId: QC_IDS.latte, qty: 1 }],
    customer: { name: "คุณแพร (ภาพ QC P3.7U)", ...(opts.member && P37U.memberId ? { memberId: P37U.memberId } : {}) },
    fulfilment: "PICKUP",
    paymentState: "UNPAID",
    ...(opts.room ? { chatConversationId: P37U.conversationId } : {}),
  });
  if (!r.ok) throw new Error(`ingestOrder ${tag}: ${r.code} ${(r as Any).message ?? ""}`.slice(0, 200));
  P37U.ids.push(r.orderId);
  const g = await ord.getOrder(ctx, actor, { id: r.orderId });
  P37U.refs[tag] = g.ok ? g.order.ref : "";
  return r.orderId;
}
/** ระบบแชทชั่วคราวของรอบ — ลบแถวแชททั้งหมดของระบบนี้ (แบบข้อสอบ · ตามไอดีระบบชั่วคราวเท่านั้น) */
async function p37uDropChat(systemId: string): Promise<string> {
  const tenantId = T.tenantId;
  const convs = (await prisma.chatConversation.findMany({ where: { tenantId, systemId }, select: { id: true } })).map((c) => c.id);
  const msgs = (await prisma.chatMessage.findMany({ where: { tenantId, systemId }, select: { id: true } })).map((m) => m.id);
  const where = { systemId };
  const n: Record<string, number> = {};
  n.read = (await prisma.chatReadState.deleteMany({ where })).count;
  n.pref = (await prisma.chatConversationPref.deleteMany({ where })).count;
  n.evt = (await prisma.chatConversationEvent.deleteMany({ where })).count;
  n.ai = (await prisma.chatAiSuggestion.deleteMany({ where })).count;
  n.att = (await prisma.chatAttachment.deleteMany({ where })).count;
  n.msg = (await prisma.chatMessage.deleteMany({ where })).count;
  n.conv = (await prisma.chatConversation.deleteMany({ where })).count;
  n.contact = (await prisma.chatContact.deleteMany({ where })).count;
  n.conn = (await prisma.chatChannelConnection.deleteMany({ where })).count;
  n.set = (await prisma.chatSetting.deleteMany({ where })).count;
  n.qr = (await prisma.chatQuickReply.deleteMany({ where })).count;
  n.ex = (await prisma.chatAnswerExample.deleteMany({ where })).count;
  n.ob = msgs.length ? (await prisma.outboxEvent.deleteMany({ where: { tenantId, OR: msgs.map((id) => ({ idempotencyKey: { contains: id } })) } })).count : 0;
  n.noti = convs.length ? (await prisma.appNotification.deleteMany({ where: { tenantId, OR: convs.map((id) => ({ body: { contains: id } })) } })).count : 0;
  await prisma.appSystemUnit.deleteMany({ where: { tenantId, systemId } });
  n.sys = (await prisma.appSystem.deleteMany({ where: { id: systemId, tenantId, type: "CHAT" } })).count;
  return `ลบระบบแชท ${systemId}: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(" · ")}`;
}
async function ensureP37uFixture(): Promise<void> {
  if (P37U.done || P37U.error) return;
  try {
    const want = (re: RegExp) => jobs.some((j) => !!j.state && isP37uState(j.state) && re.test(j.state));
    P37U.lineConnected = await prisma.chatChannelConnection.count({ where: { tenantId: T.tenantId, type: "LINE", status: "CONNECTED" } });
    P37U.log.push(`LINE CONNECTED ของร้าน QC = ${P37U.lineConnected}${P37U.lineConnected ? " ⇒ สถานะที่เปิดสวิตช์ SKIP" : ""}`);
    await p37uSetChat(null); // จดค่าเดิม + ปิดทั้งหมด (W15) ก่อนทุกภาพ
    if (want(/^(orders|settings)-/)) {
      if (!QC_IDS.amer || !QC_IDS.latte) throw new Error("ไม่พบอเมริกาโน่เย็น/ลาเต้ร้อนของร้าน QC (seed-pos-qc)");
      // ซากระบบแชทของรอบที่ตายแล้ว
      for (const s of await prisma.appSystem.findMany({ where: { tenantId: T.tenantId, type: "CHAT", name: { startsWith: P37U_CHAT_PREFIX } }, select: { id: true, name: true } })) {
        const pid = Number(/(\d+)\)$/.exec(s.name)?.[1] ?? 0);
        let alive = false;
        try {
          alive = pid > 0 && pid !== process.pid && process.kill(pid, 0);
        } catch {
          alive = false;
        }
        if (!alive && pid !== process.pid) P37U.log.push(`กวาดซาก · ${await p37uDropChat(s.id)}`);
      }
      const { createSystem } = await import("@/lib/modules/system/service");
      P37U.chatSystemId = (await createSystem(T.tenantId, "CHAT", `${P37U_CHAT_PREFIX}${process.pid})`)).id;
      const chatSvc = await import("@/lib/modules/chat/service");
      const conn = await chatSvc.ensureWebchatConnection(T.tenantId, P37U.chatSystemId);
      P37U.connectionId = conn.id;
      const r = await chatSvc.receiveWebchatInbound({ connection: conn, guestToken: P37U_TAG, body: "ขอสั่งกาแฟ 2 แก้วค่ะ (ภาพ QC P3.7U)", displayName: "ลูกค้าแชท (ภาพ QC)" });
      if (!r.ok || !r.conversationId) throw new Error(`receiveWebchatInbound: ${r.reason ?? "ไม่มีห้อง"}`);
      P37U.conversationId = r.conversationId;
      const { listChannels } = await import("@/lib/modules/pos/channel");
      const { ctx, actor } = await p37uCtx();
      const l = await listChannels(ctx, actor, { includeArchived: true });
      if (!l.ok) throw new Error(`listChannels: ${l.code}`);
      const chat = l.items.find((c) => c.code === "CHAT");
      if (!chat || chat.archived || !chat.active) throw new Error("ช่องทางแชท (CHAT) ของสาขา QC ไม่พร้อม (ปิด/เก็บแล้ว)");
      P37U.chatChannelId = chat.id;
      const C = T as Any;
      const mem = C.member?.phone && C.systems?.MEMBER?.id ? await prisma.customer.findFirst({ where: { tenantId: T.tenantId, memberSystemId: C.systems.MEMBER.id, phone: C.member.phone, status: "ACTIVE" }, select: { id: true } }) : null;
      P37U.memberId = mem?.id ?? "";
      if (want(/^orders-detail-chat-paylink$/)) await p37uOrder("paylink", { room: true, member: true });
      if (want(/^orders-detail-chat-nolink$/)) await p37uOrder("nolink", { room: false, member: false });
      P37U.log.push(`ระบบแชทชั่วคราว ${P37U.chatSystemId} · WEBCHAT ${P37U.connectionId} · ห้อง ${P37U.conversationId} · ออเดอร์ ${Object.entries(P37U.refs).map(([k, v]) => `${k} ${v}`).join(" · ") || "-"}${P37U.memberId ? "" : " · ⚠️ ไม่พบสมาชิก QC (UI-13 = เป็นสมาชิก)"}`);
    }
    if (want(/^paydone-line-auto$/)) {
      await prepMemberFixture(); // สมาชิก QC + ค่าตั้งแต้ม (แบบ sale-done-member)
      if (MEMBERX.error) throw new Error(`สมาชิก QC: ${MEMBERX.error}`);
    }
    P37U.done = true;
  } catch (e) {
    P37U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** สถานะที่เปิดสวิตช์ = ต้องไม่มี LINE CONNECTED (CD-P37U-10) */
const P37U_SWITCH_ON: ReadonlySet<string> = new Set(["settings-chat-card-on", "paydone-line-auto"]);
async function prepP37u(state: P37uKey): Promise<void> {
  if (!P37U.done) return;
  try {
    if (P37U_SWITCH_ON.has(state) && P37U.lineConnected > 0) return void (await p37uSetChat(null));
    await p37uSetChat(state === "settings-chat-card-on" ? { receiptAuto: true, orderStatus: true } : state === "paydone-line-auto" ? { receiptAuto: true } : null);
    if (state === "orders-detail-chat-sent") {
      P37U.refs.sent = "";
      P37U.sentIds.push(await p37uOrder("sent", { room: true, member: false }));
    }
    if (state === "orders-chat-card-requested" && !P37U.requestedRef) {
      // ยังไม่มีออเดอร์ที่ขอชำระในรอบนี้ (รัน --state นี้เดี่ยว) ⇒ ออเดอร์ใหม่ + requestChatPayment ของ root (ประตู A · WEBCHAT ไม่แตะเครือข่าย)
      const id = await p37uOrder("requested", { room: true, member: false });
      const root = await import("@/lib/pos-chat-bridges");
      const { ctx, actor } = await p37uCtx();
      const r = await root.requestChatPayment(ctx, actor, { orderId: id });
      if (!r.ok) throw new Error(`requestChatPayment: ${r.code}`);
      P37U.requestedRef = P37U.refs.requested ?? "";
      P37U.log.push(`ขอชำระในแชท ${P37U.requestedRef} (root · sent=${r.sent})`);
    }
  } catch (e) {
    P37U.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
async function cleanupP37u(): Promise<void> {
  if (P37U.cleaned) return;
  P37U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string | null>) => {
    try {
      const m = await fn();
      if (m) P37U.log.push(m);
    } catch (e) {
      P37U.ok = false;
      P37U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  // 1) สวิตช์กลับก่อน (ตัวรับคิวของการปฏิเสธด้านล่างอ่านค่าตั้งตอนระบาย ⇒ ปิด = ไม่ส่งข้อความ)
  if (P37U.before) {
    const b = P37U.before;
    await step("คืนค่าตั้งแชท", async () => {
      await p37uWritePosKey("chat", b.had ? b.v : undefined);
      await p37uWritePosKey("_qcP37uBefore", undefined);
      P37U.before = null;
      return `คืนค่าตั้งแชท (${b.had ? "ค่าเดิม" : "ลบคีย์ = ค่าปริยาย"})`;
    });
  }
  const ids = [...new Set(P37U.ids)];
  if (ids.length) {
    await step("ปฏิเสธออเดอร์", async () => {
      const ord = await import("@/lib/modules/pos/order");
      const { ctx, actor } = await p37uCtx();
      let n = 0;
      for (const o of await prisma.posOrder.findMany({ where: { tenantId: T.tenantId, id: { in: ids }, status: "NEW" }, select: { id: true } })) {
        const r = await ord.rejectOrder(ctx, actor, { id: o.id, reasonCode: "TOO_BUSY" });
        if (r.ok) n++;
      }
      return n ? `ปฏิเสธออเดอร์ NEW ${n} ใบ (rejectOrder · ยกเลิกใบขอรับเงิน)` : null;
    });
    await step("ลบออเดอร์", async () => {
      const tenantId = T.tenantId;
      const withSale = (await prisma.posOrder.findMany({ where: { tenantId, id: { in: ids }, saleId: { not: null } }, select: { id: true } })).map((x) => x.id);
      const kill = ids.filter((x) => !withSale.includes(x));
      if (!kill.length) return withSale.length ? `มีบิลแล้ว ไม่ลบ: ${withSale.join(",")}` : null;
      const intents = (await prisma.posPaymentIntent.findMany({ where: { tenantId, orderId: { in: kill } }, select: { id: true } })).map((x) => x.id);
      const all = [...kill, ...intents];
      const ev = (await prisma.posOrderEvent.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
      const ln = (await prisma.posOrderLine.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
      const ob = (await prisma.outboxEvent.deleteMany({ where: { tenantId, OR: all.map((id) => ({ idempotencyKey: { contains: id } })) } })).count;
      const au = (await prisma.auditLog.deleteMany({ where: { tenantId, targetId: { in: all } } })).count;
      const ops = (await prisma.opsEvent.deleteMany({ where: { tenantId, createdAt: { gte: RUN_STARTED }, OR: all.map((id) => ({ detail: { contains: id } })) } })).count;
      const pi = (await prisma.posPaymentIntent.deleteMany({ where: { tenantId, id: { in: intents } } })).count;
      const od = (await prisma.posOrder.deleteMany({ where: { tenantId, id: { in: kill }, saleId: null } })).count;
      P37U.ids = withSale;
      return `ลบ: ออเดอร์ ${od} · บรรทัด ${ln} · เหตุการณ์ ${ev} · ใบขอรับเงิน ${pi} · outbox ${ob} · audit ${au} · ops ${ops}`;
    });
  }
  if (P37U.chatSystemId) {
    const sid = P37U.chatSystemId;
    await step("ลบระบบแชทชั่วคราว", async () => {
      const m = await p37uDropChat(sid);
      P37U.chatSystemId = "";
      return m;
    });
  }
  P37U.done = false;
}
async function runP37uState(page: Any, state: P37uKey, device: Device): Promise<void> {
  if (P37U.error) throw new StepError(`fixture P3.7U: ${P37U.error}`);
  if (!P37U.done) throw new StepError("fixture P3.7U ยังไม่ได้สร้าง");
  if (P37U_SWITCH_ON.has(state) && P37U.lineConnected > 0) throw new StepError(`SKIP: ร้าน QC มี LINE CONNECTED ${P37U.lineConnected} ช่อง — ไม่เปิดสวิตช์แชท (กัน push จริง · CD-P37U-10)`);
  const into = async (sel: string, block: "start" | "center" = "center") => {
    const el = await visibleEl(page, sel, 0, 20_000);
    await el.evaluate((e: Element, b: string) => e.scrollIntoView({ block: b as "start" | "center" }), block);
    return el;
  };
  const has = async (sel: string) => !!(await page.$(sel));
  const rowsOn = async (want: Record<string, boolean>) => {
    for (const [k, v] of Object.entries(want)) {
      const got = await page.$eval(tid(`pos-settings-chat-row-${k}`), (e: Element) => e.getAttribute("aria-checked")).catch(() => null);
      if (got !== String(v)) throw new StepError(`แถว ${k} aria-checked=${got} (คาด ${v})`);
    }
  };
  const openSheet = async () => {
    await into(tid("pos-settings-chat-open"));
    await (await visibleEl(page, tid("pos-settings-chat-open"))).click();
    await visibleEl(page, tid("pos-settings-chat-sheet"), 0, 10_000);
  };
  const openPanel = async (ref: string) => {
    if (!ref) throw new StepError("ไม่มีเลขอ้างอิงออเดอร์ของภาพ");
    await visibleEl(page, tid("pos-ord-root"), 0, 15_000);
    await clickEl(page, tid(`pos-ord-card-${ref}`));
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-ord-panel"]')).some((e) => e.getClientRects().length > 0 && e.getAttribute("data-status")), { timeout: 15_000 })
      .catch(() => {
        throw new StepError("แผงรายละเอียดไม่โหลด (getOrderAction)");
      });
  };
  switch (state) {
    case "settings-chat-card-off":
    case "settings-chat-card-on":
    case "settings-chat-card-readonly": {
      await into(tid("pos-settings-card-chat"));
      await visibleEl(page, tid("pos-settings-chat-quota"), 0, 20_000);
      const on = state === "settings-chat-card-on";
      await rowsOn({ receiptAuto: on, refundNotice: false, orderStatus: on, autoReply: false });
      if ((await has(tid("pos-settings-chat-all-off"))) === on) throw new StepError(`กรอบ "ปิดไว้ทั้งหมด" ${on ? "ขึ้นทั้งที่เปิดอยู่" : "ไม่ขึ้น"}`);
      if (state === "settings-chat-card-readonly") {
        if (!(await has(tid("pos-settings-chat-owner-only")))) throw new StepError("แคชเชียร์ไม่เห็นข้อความเจ้าของร้านเท่านั้น");
        if (await has(tid("pos-settings-chat-open"))) throw new StepError("แคชเชียร์เห็นปุ่มเปิดแผ่น");
        if (await has(`button${tid("pos-settings-chat-row-receiptAuto")}`)) throw new StepError("แคชเชียร์ได้สวิตช์ที่กดได้");
      } else if (!(await has(`button${tid("pos-settings-chat-row-receiptAuto")}`))) throw new StepError("เจ้าของร้านไม่ได้สวิตช์จริง (role=switch button)");
      return;
    }
    case "settings-chat-sheet":
      await openSheet();
      for (const k of ["accepted", "ready", "cancelled", "paid"]) if (!(await has(tid(`pos-settings-chat-kind-${k}`)))) throw new StepError(`แผ่นไม่มีช่อง ${k}`);
      return;
    case "settings-chat-sheet-invalid":
      await openSheet();
      await typeInto(page, tid("pos-settings-chat-pause"), "99");
      await (await visibleEl(page, tid("pos-settings-chat-save"))).click();
      await visibleEl(page, `${tid("pos-settings-chat-sheet")} ${tid("pos-settings-chat-error")}`, 0, 15_000).catch(() => {
        throw new StepError("บันทึก 99 ชั่วโมงแล้วไม่มีข้อความปฏิเสธใต้ช่อง (VALIDATION botPauseHours)");
      });
      return;
    case "orders-detail-chat-paylink": {
      await openPanel(P37U.refs.paylink ?? "");
      await visibleEl(page, tid("pos-ord-chatpay-send"), 0, 15_000);
      const off = await page.$eval(tid("pos-ord-chatpay-send"), (e: Element) => (e as HTMLButtonElement).disabled);
      if (userKey === "cashier") {
        if (!off) throw new StepError("แคชเชียร์: ปุ่มส่งลิงก์ชำระไม่ได้ถูกปิด (needPerm)");
        await visibleEl(page, tid("pos-ord-chatpay-reason"), 0, 5_000);
      } else if (off) throw new StepError("เจ้าของร้าน: ปุ่มส่งลิงก์ชำระถูกปิด (ผูกห้อง + พร้อมเพย์ + สิทธิ์ครบ)");
      if (P37U.memberId)
        await visibleEl(page, tid("pos-ord-member-tier"), 0, 15_000).catch(() => {
          throw new StepError("แผงไม่มีชื่อ/ระดับสมาชิก (pos-ord-member-tier · UI-13)");
        });
      await into(tid("pos-ord-chatpay"));
      return;
    }
    case "orders-detail-chat-nolink":
      await openPanel(P37U.refs.nolink ?? "");
      await visibleEl(page, tid("pos-ord-chatpay-reason"), 0, 15_000);
      if (!(await page.$eval(tid("pos-ord-chatpay-send"), (e: Element) => (e as HTMLButtonElement).disabled))) throw new StepError("ออเดอร์ไม่ผูกห้อง: ปุ่มส่งลิงก์ชำระไม่ได้ถูกปิด");
      await into(tid("pos-ord-chatpay"));
      return;
    case "orders-detail-chat-sent": {
      const ref = P37U.refs.sent ?? "";
      await openPanel(ref);
      await clickEl(page, tid("pos-ord-chatpay-send"));
      await visibleEl(page, `${tid("pos-ord-chatpay-result")}[data-sent="1"]`, 0, 20_000).catch(async () => {
        const txt = await page.$eval(tid("pos-ord-chatpay-result"), (e: Element) => e.textContent?.trim() ?? "").catch(() => "");
        throw new StepError(`กดส่งลิงก์ชำระแล้วไม่ได้ผล "แจ้งในแชทแล้ว"${txt ? ` (${txt.slice(0, 100)})` : ""}`);
      });
      P37U.requestedRef = ref;
      await page
        .waitForFunction(() => !!document.querySelector('[data-testid="pos-ord-pending-note"]'), { timeout: 15_000 })
        .catch(() => {
          throw new StepError("หลังส่งลิงก์ แผงไม่ขึ้นโน้ตรอชำระ (โหลดออเดอร์ใหม่)");
        });
      await into(tid("pos-ord-chatpay"));
      return;
    }
    case "orders-chat-card-requested": {
      const ref = P37U.requestedRef;
      if (!ref) throw new StepError("ไม่มีออเดอร์ที่ขอชำระในแชทของรอบนี้");
      await visibleEl(page, tid("pos-ord-root"), 0, 15_000);
      await into(tid(`pos-ord-card-chatpay-${ref}`)).catch(() => {
        throw new StepError(`การ์ดรอชำระไม่มีชิป "ส่งลิงก์ชำระแล้ว" (pos-ord-card-chatpay-${ref})`);
      });
      return;
    }
    case "paydone-line-auto": {
      await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
      await ensureShift(page);
      try {
        await runMemberRegState(page, "sale-done-member", device);
        await visibleEl(page, tid("pos-reg-done-line-auto"), 0, 10_000).catch(() => {
          throw new StepError("จอสำเร็จไม่มีชิป \"ส่งใบเสร็จทาง LINE อัตโนมัติ\" (receiptAuto ∧ สมาชิก)");
        });
        if (!(await has(tid("pos-receipt-send-paydone-line")))) throw new StepError("ปุ่มส่งทาง LINE เดิมหายไป (ส่งซ้ำ = P1.11)");
      } finally {
        await p37uSetChat(null).catch(() => undefined); // receiptAuto ปิดทันทีหลังภาพ (CD-P37U-10)
      }
      return;
    }
  }
}
// ◂ POS P3.7U
// ═══════════════════ POS P3-SKEL U ▸ โครงแพลตฟอร์ม: การ์ด credentials 10 · สลิป 02/02b/12 · e-Tax 15A/แผ่น · ตัวช่วยพิมพ์ LAN 17B · กระทบยอด 08 (CD-SKELU-1…12) ◂ ═══════════════════
// fixture (ensureP3skuFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล · ไม่ reseed · ร้าน QC coffee เท่านั้น · ไม่ยิงเครือข่าย):
//   🔴 ด่านก่อนเขียนทุกครั้ง (p3skuGuard): T.tenantId = PQC.coffee.tenantId (posqc-coffee-tenant · ไม่ใช่ slug) + ระบบ POS ของร้านนี้ + id เป้าหมายเป็นของ fixture เท่านั้น (อื่น = StepError หยุด)
//   • ช่องทาง LINEMAN + GRAB ของสาขา QC: find-or-create ผ่าน channel.saveChannel (adapter ไม่แตะ) — เก็บไว้
//   • credentials ผ่าน saveIntegrationCredentials + deps.key (กุญแจคงที่ของ harness ≥ 32 ตัว · ค่า posqc-… ปลอม): LINEMAN = DRAFT (ล้าง restaurant_id/webhookSecret) · GRAB = COMPLETE — เก็บไว้
//     (เซิร์ฟเวอร์ QC5 ไม่มี POS_CREDENTIALS_KEY ⇒ การ์ดขึ้น "ยังไม่ตั้งกุญแจ" · ช่องลับขึ้น ••••)
//   • บิลโอน 1 ใบผ่าน service.createSale (TRANSFER · คีย์ต่อ pid) + สลิป 1 ใบผ่าน attachSlip + deps.put stub (PNG สังเคราะห์ไม่มีข้อมูลบุคคล · ยอดที่พิมพ์ ≠ ยอดชำระ)
//     → เก็บกวาด voidSale (สลิปคงเป็นหลักฐานของบิลที่ยกเลิก) · บิลโอนจาก paydone-transfer-slip (UI จริง) ก็ voidSale
//   • ใบขอรับเงินพร้อมเพย์แบบคงที่ของ paydlg-intent-slip (UI สร้าง) → cancelPaymentIntent ตอนเก็บกวาด
//   • agent posqc-vis-p3sku-agent (registerPrintAgent · สร้างก่อนภาพ -agents) + agent ของ -token (กดลงทะเบียนจริง) → เพิกถอน (revokePrintAgent) + ลบแถวของ harness ตอนเก็บกวาด
//     ซากของรอบที่ถูก kill (ชื่อขึ้นต้น posqc-vis-p3sku-) ถูกกวาดก่อน -none · มี agent อื่นที่ไม่ใช่ของ harness = -none SKIP
//   • เครื่องนี้ (DEVICE_ID ของ P1.15U) printerConfig = jsonb ของ harness เท่านั้น: โหมด escpos-lan + kitchenSlip after-sale เฉพาะภาพ -agents · ค่าเดิมใน printerConfig._qcP3skuBefore
//     (ตัวแกะของเซิร์ฟเวอร์ทิ้งคีย์ที่ไม่รู้จัก) · คืนก่อนภาพถัดไป/หลังงานสุดท้าย/finally/สัญญาณ (CD-P39U-4)
//   • ไม่กดทดสอบพิมพ์ / ส่งงานพิมพ์ · ไม่อัปสลิปผ่าน UI (QC5 ไม่มีที่เก็บไฟล์) · กระทบยอดใช้ใบขอรับเงินที่มีอยู่ 30 วัน (ว่างก็เป็นภาพที่ถูก)
const P3SKU_REASON = "ภาพ QC P3-SKEL U";
const P3SKU = {
  done: false,
  error: null as string | null,
  cleaned: false,
  ok: true,
  log: [] as string[],
  channels: {} as Record<string, string>,
  /** สถานะ credentials ที่ fixture เขียน (DRAFT/COMPLETE) */
  credStatus: {} as Record<string, string>,
  credSkip: "",
  billSkip: "",
  slipId: "",
  /** fix2: FileAsset.id ของสลิป fixture (ตัวกรอง console 404 ของแผ่นสลิป — ไฟล์นี้ไฟล์เดียว) */
  slipFileId: "",
  slipSuppressed: 0,
  saleIds: [] as string[],
  intentIds: [] as string[],
  agentIds: [] as string[],
  agentReady: false,
  lanNoneSkip: "",
  deviceBefore: false,
  tokenN: 0,
};
const p3skuRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const p3skuCtx = () => ({ tenantId: T.tenantId, systemId: SYS, unitId });
/** 🔴 ด่านก่อนเขียน: ร้าน QC coffee (tenantId ตายตัว) + ระบบ POS ของร้านนี้ (อื่น = StepError หยุดทั้งใบ) */
async function p3skuGuard(): Promise<void> {
  if (tenantKey !== "coffee" || T.tenantId !== PQC.coffee.tenantId) throw new StepError(`ด่าน P3-SKEL U: tenantId ${T.tenantId} (key ${tenantKey} · slug ${T.slug}) ≠ ${PQC.coffee.tenantId} (ร้าน QC coffee) — ไม่เขียน`);
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId, type: "POS" }, select: { id: true } });
  if (!sys) throw new StepError(`ด่าน P3-SKEL U: ระบบ ${SYS} ไม่ใช่ POS ของร้าน QC — ไม่เขียน`);
}
/** PNG สังเคราะห์ 2×2 (ไม่มีข้อมูลบุคคล) + ข้อความ tEXt ต่อรอบ ⇒ sha256 ไม่ซ้ำ (SLIP_DUPLICATE ของรูปเดิม) */
async function p3skuPng(seed: string): Promise<Uint8Array> {
  const { deflateSync } = await import("node:zlib");
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.from([0, 230, 230, 230, 200, 200, 200, 0, 200, 200, 200, 230, 230, 230]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from(`Comment\0${seed}`, "latin1")),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}
/** printerConfig ของเครื่องนี้ (DEVICE_ID) — แถวต้องเป็นของร้าน QC + รหัสเครื่องของรอบ */
async function p3skuDevice(): Promise<{ id: string; cfg: Record<string, unknown> }> {
  await p3skuGuard();
  if (!P115.deviceRowId) throw new StepError(`ไม่มีเครื่อง ${DEVICE_ID} ของรอบ (P1.15U ยังไม่ลงทะเบียน)`);
  const d = await prisma.posDevice.findFirst({ where: { id: P115.deviceRowId, tenantId: T.tenantId, unitId, deviceCode: DEVICE_ID }, select: { id: true, printerConfig: true } });
  if (!d) throw new StepError(`ด่าน P3-SKEL U: เครื่อง ${P115.deviceRowId} ไม่ใช่ ${DEVICE_ID} ของสาขา QC — ไม่เขียน`);
  return { id: d.id, cfg: p3skuRec(d.printerConfig) ? (d.printerConfig as Record<string, unknown>) : {} };
}
/** โหมดแลน + ใบครัว after-sale ของเครื่องนี้ (จดค่าเดิมใน _qcP3skuBefore ครั้งเดียว) */
async function p3skuDeviceLan(): Promise<void> {
  const d = await p3skuDevice();
  const before = p3skuRec(d.cfg._qcP3skuBefore) ? d.cfg._qcP3skuBefore : { mode: d.cfg.mode ?? null, kitchenSlip: d.cfg.kitchenSlip ?? null };
  const next = { ...d.cfg, mode: "escpos-lan", kitchenSlip: "after-sale", _qcP3skuBefore: before };
  await prisma.posDevice.updateMany({ where: { id: d.id, tenantId: T.tenantId, deviceCode: DEVICE_ID }, data: { printerConfig: next as never } });
  P3SKU.deviceBefore = true;
}
/** คืน printerConfig จาก _qcP3skuBefore (ไม่มี = ไม่ได้แตะ) */
async function p3skuDeviceRestore(): Promise<string> {
  if (!P115.deviceRowId) return "เครื่องไม่ถูกแตะ";
  const d = await p3skuDevice();
  const b = d.cfg._qcP3skuBefore;
  if (!p3skuRec(b)) return "เครื่องไม่ถูกแตะ";
  const next: Record<string, unknown> = { ...d.cfg };
  delete next._qcP3skuBefore;
  if (b.mode === null || b.mode === undefined) delete next.mode;
  else next.mode = b.mode;
  if (b.kitchenSlip === null || b.kitchenSlip === undefined) delete next.kitchenSlip;
  else next.kitchenSlip = b.kitchenSlip;
  await prisma.posDevice.updateMany({ where: { id: d.id, tenantId: T.tenantId, deviceCode: DEVICE_ID }, data: { printerConfig: next as never } });
  P3SKU.deviceBefore = false;
  return `คืน printerConfig เครื่อง ${DEVICE_ID} (mode ${String(b.mode ?? "ลบ")} · kitchenSlip ${String(b.kitchenSlip ?? "ลบ")})`;
}
/** เพิกถอน + ลบ agent ของ harness (ชื่อขึ้นต้น posqc-vis-p3sku-) ของสาขา QC */
async function p3skuDropAgents(): Promise<number> {
  await p3skuGuard();
  const { revokePrintAgent } = await import("@/lib/modules/pos/print-relay");
  const owner = await ownerActor();
  const rows = await prisma.posPrintAgent.findMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId, name: { startsWith: P3SKU_TAG } }, select: { id: true, revokedAt: true } });
  for (const r of rows) if (!r.revokedAt) await revokePrintAgent(p3skuCtx(), owner, { agentId: r.id });
  if (rows.length) await prisma.posPrintAgent.deleteMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId, id: { in: rows.map((r) => r.id) }, name: { startsWith: P3SKU_TAG }, revokedAt: { not: null } } });
  return rows.length;
}
async function ensureP3skuFixture(): Promise<void> {
  if (P3SKU.done || P3SKU.error) return;
  /** ทุกขั้นของ fixture ห่อชื่อขั้น + ค่าที่ใช้ — ล้ม = StepError "ขั้น (ค่า): เหตุ" (LANE-RULES 22 ต.ค.) */
  const at = async <R = Any,>(stepName: string, value: unknown, fn: () => Promise<R>): Promise<R> => {
    try {
      return await fn();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new StepError(`${stepName} (${JSON.stringify(value ?? null).slice(0, 90)}): ${why.slice(0, 140)}`);
    }
  };
  try {
    await at("ด่านร้าน QC", { tenantId: T.tenantId, SYS }, p3skuGuard);
    const want = (re: RegExp) => jobs.some((j) => isP3skuState(j.state) && re.test(j.state));
    const owner = await at("เจ้าของร้าน QC", T.users.owner.membershipId, ownerActor);
    // ── ช่องทาง + credentials ──
    if (want(/^settings-channel/)) {
      try {
        const ch = (await import("@/lib/modules/pos/channel")) as Any;
        const creds = (await import("@/lib/modules/pos/integration-creds")) as Any;
        for (const code of ["LINEMAN", "GRAB"] as const) {
          let row = await prisma.salesChannel.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, code }, select: { id: true, archivedAt: true } });
          if (!row) {
            const name = code === "LINEMAN" ? "LINE MAN" : "Grab";
            const r = await at(`saveChannel ${code}`, { code, name }, () => ch.saveChannel(p3skuCtx(), owner, { code, name }));
            if (!r?.ok) throw new StepError(`saveChannel ${code} (${name}): ${r?.code ?? "?"} ${String(r?.message ?? "").slice(0, 80)}`);
            row = { id: r.channel.id, archivedAt: null };
            P3SKU.log.push(`สร้างช่องทาง ${code}`);
          }
          if (row.archivedAt) throw new StepError(`ช่องทาง ${code} (${row.id}) ถูกเก็บแล้ว — ใช้กับภาพไม่ได้ (กู้คืนในลิ้นชักก่อน)`);
          const again = await prisma.salesChannel.findFirst({ where: { id: row.id, tenantId: T.tenantId, systemId: SYS, unitId, code }, select: { id: true } });
          if (!again) throw new StepError(`ด่าน P3-SKEL U: ช่องทาง ${row.id} ไม่ใช่ ${code} ของสาขา QC — ไม่เขียน`);
          P3SKU.channels[code] = row.id;
          const input = { kind: "PLATFORM", provider: code, channelId: row.id, fields: P3SKU_CREDS[code] };
          const v = await at(`saveIntegrationCredentials ${code}`, { kind: "PLATFORM", provider: code, channelId: row.id, fields: Object.keys(P3SKU_CREDS[code]) }, () => creds.saveIntegrationCredentials(p3skuCtx(), owner, input, { key: P3SKU_KEY }));
          if (!v?.ok) throw new StepError(`saveIntegrationCredentials ${code} (channel ${row.id}): ${v?.code ?? "?"} ${String(v?.messageKey ?? "")}`);
          P3SKU.credStatus[code] = String(v.status);
        }
        P3SKU.log.push(`credentials LINEMAN ${P3SKU.credStatus.LINEMAN} · GRAB ${P3SKU.credStatus.GRAB} (deps.key ของ harness · ค่า posqc-…)`);
        if (P3SKU.credStatus.LINEMAN !== "DRAFT" || P3SKU.credStatus.GRAB !== "COMPLETE") throw new StepError(`สถานะ credentials ไม่ตรงแผน (LINEMAN ${P3SKU.credStatus.LINEMAN} คาด DRAFT · GRAB ${P3SKU.credStatus.GRAB} คาด COMPLETE)`);
      } catch (e) {
        P3SKU.credSkip = e instanceof Error ? e.message.slice(0, 200) : String(e);
        P3SKU.log.push(`⚠️ ช่องทาง/credentials: ${P3SKU.credSkip}`);
      }
    }
    // ── บิลโอน + สลิป ──
    if (want(/^bills-/)) {
      try {
        const { createSale } = await import("@/lib/modules/pos/service");
        const { attachSlip } = await import("@/lib/modules/pos/payment-slip");
        const total = 8500;
        const sale = (await at("createSale TRANSFER", { total, key: `${FIX.prefix}p3sku-tr-${process.pid}` }, () =>
          createSale({
            tenantId: T.tenantId,
            unitId,
            systemId: SYS,
            sourceModule: "POS",
            shiftId: null,
            soldByUserId: owner.userId,
            idempotencyKey: `${FIX.prefix}p3sku-tr-${process.pid}`,
            lines: [{ name: `ลาเต้เย็น ${BILL_TAG}`, qty: 1, unitPriceSatang: total }],
            payMethods: [{ type: "TRANSFER", amountSatang: total, reference: "QC-P3SKU" }],
          } as never),
        )) as { saleId: string };
        const own = await prisma.posSale.findFirst({ where: { id: sale.saleId, tenantId: T.tenantId, systemId: SYS, unitId }, select: { id: true } });
        if (!own) throw new StepError(`ด่าน P3-SKEL U: บิล ${sale.saleId} ไม่ใช่ของสาขา QC — ไม่เขียน`);
        P3SKU_SALE.id = sale.saleId;
        P3SKU.saleIds.push(sale.saleId);
        const pay = await prisma.posPayment.findFirst({ where: { saleId: sale.saleId, tenantId: T.tenantId, type: "TRANSFER" }, select: { id: true } });
        if (!pay) throw new StepError(`บิล ${sale.saleId}: ไม่มีแถว TRANSFER`);
        const bytes = await p3skuPng(`${P3SKU_TAG}-${process.pid}-${Date.now()}`);
        const input = { saleId: sale.saleId, paymentId: pay.id, idempotencyKey: `${P3SKU_TAG}-slip-${process.pid}`, file: { contentType: "image/png", bytes }, amountSatang: 8000, transRef: `QCP3SKU${process.pid}${Date.now() % 100000}` };
        const r = (await at("attachSlip (deps.put stub)", { saleId: sale.saleId, paymentId: pay.id, bytes: bytes.length, amountSatang: 8000 }, () => attachSlip(p3skuCtx(), owner, input, { put: async () => undefined }))) as Any;
        if (!r?.ok) throw new StepError(`attachSlip (sale ${sale.saleId} · payment ${pay.id} · ${bytes.length} B): ${r?.code ?? "?"} ${String(r?.message ?? "").slice(0, 80)}`);
        P3SKU.slipId = r.slip.id;
        P3SKU.slipFileId = (await prisma.posPaymentSlip.findFirst({ where: { id: r.slip.id, tenantId: T.tenantId }, select: { fileId: true } }))?.fileId ?? "";
        P3SKU.log.push(`บิลโอน ${sale.saleId} + สลิป ${r.slip.id} (UPLOADED · ยอดที่พิมพ์ ฿80 ≠ ฿85)`);
      } catch (e) {
        P3SKU.billSkip = e instanceof Error ? e.message.slice(0, 200) : String(e);
        P3SKU.log.push(`⚠️ บิล/สลิป: ${P3SKU.billSkip}`);
      }
    }
    // ── สมุดบัญชีของ 15A ──
    if (want(/^taxinv-/)) await prepTaxInvoiceBook();
    // ── agent: กวาดซากของ harness ก่อน -none · มี agent อื่น = -none SKIP ──
    if (want(/^settings-devices-lan/)) {
      const swept = await at("กวาด agent ของ harness", { name: `${P3SKU_TAG}*` }, p3skuDropAgents);
      if (swept) P3SKU.log.push(`กวาด agent ของ harness ${swept} ตัว`);
      const others = await prisma.posPrintAgent.count({ where: { tenantId: T.tenantId, systemId: SYS, unitId, revokedAt: null, NOT: { name: { startsWith: P3SKU_TAG } } } });
      if (others) P3SKU.lanNoneSkip = `สาขา QC มีตัวช่วยพิมพ์ที่ไม่ใช่ของ harness ${others} ตัว`;
    }
    P3SKU.done = true;
  } catch (e) {
    P3SKU.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function prepP3sku(state: P3skuKey): Promise<void> {
  if (!P3SKU.done) return;
  try {
    if (state === "settings-devices-lan-agents") {
      if (!P3SKU.agentReady) {
        await p3skuGuard();
        const { registerPrintAgent } = await import("@/lib/modules/pos/print-relay");
        const r = await registerPrintAgent(p3skuCtx(), await ownerActor(), { name: `${P3SKU_TAG}-agent`, printers: P3SKU_PRINTERS.map((p) => ({ ...p })) });
        if (!r.ok) throw new StepError(`registerPrintAgent ${P3SKU_TAG}-agent (${P3SKU_PRINTERS.map((p) => `${p.host}:${p.port} ${p.target}`).join(" · ")}): ${r.code} ${r.message.slice(0, 80)}`);
        P3SKU.agentIds.push(r.agent.id); // โทเคนทิ้ง (ไม่พิมพ์ · ไม่เก็บ)
        P3SKU.agentReady = true;
        P3SKU.log.push(`agent ${r.agent.id} (192.168.1.50 ใบครัว · 192.168.1.51 ใบเสร็จ)`);
      }
      await p3skuDeviceLan();
    } else if (P3SKU.deviceBefore) await p3skuDeviceRestore();
  } catch (e) {
    P3SKU.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
async function cleanupP3sku(): Promise<void> {
  if (P3SKU.cleaned) return;
  P3SKU.cleaned = true;
  const step = async (what: string, fn: () => Promise<string>) => {
    try {
      P3SKU.log.push(await fn());
    } catch (e) {
      P3SKU.ok = false;
      P3SKU.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  if (P3SKU.deviceBefore || P115.deviceRowId) await step("คืน printerConfig", p3skuDeviceRestore);
  if (P3SKU.agentIds.length || P3SKU.tokenN)
    await step("เพิกถอน agent ของ harness", async () => `เพิกถอน + ลบ agent ของ harness ${await p3skuDropAgents()} ตัว`);
  // ใบขอรับเงินพร้อมเพย์ที่ UI ของรอบนี้สร้างแล้วยัง PENDING (paydlg-intent-slip) → cancelPaymentIntent
  if (jobs.some((j) => j.state === "paydlg-intent-slip"))
    await step("ยกเลิกใบขอรับเงินของภาพ", async () => {
      await p3skuGuard();
      const { cancelPaymentIntent } = await import("@/lib/modules/pos/payment-intent");
      const owner = await ownerActor();
      const rows = await prisma.posPaymentIntent.findMany({ where: { tenantId: T.tenantId, systemId: SYS, unitId, kind: "PROMPTPAY_STATIC", status: "PENDING", deviceId: DEVICE_ID, createdAt: { gte: RUN_STARTED } }, select: { id: true } });
      let n = 0;
      for (const r of rows) if ((await cancelPaymentIntent({ ...p3skuCtx(), deviceId: DEVICE_ID }, owner, { intentId: r.id })).ok) n++;
      return `ยกเลิกใบขอรับเงินของภาพ ${n}/${rows.length} ใบ (cancelPaymentIntent)`;
    });
  const ids = [...new Set(P3SKU.saleIds)];
  if (ids.length)
    await step("ยกเลิกบิลโอนของภาพ", async () => {
      const { voidSale } = await import("@/lib/modules/pos/service");
      const owner = await ownerActor();
      let n = 0;
      for (const id of ids) {
        const s = await prisma.posSale.findFirst({ where: { id, tenantId: T.tenantId, unitId }, select: { status: true } });
        if (s?.status !== "PAID") continue;
        await voidSale(T.tenantId, unitId, id, { actorUserId: owner.userId, reason: `ลูกค้ายกเลิก (${P3SKU_REASON})` });
        n++;
      }
      return `ยกเลิกบิลโอน ${n} ใบ (voidSale · สลิปคงเป็นหลักฐาน)`;
    });
  P3SKU.done = false;
}
/**
 * fix2 (ผู้คุม B · รอบ QC5 92e1943a): QC5 ไม่มี slip storage ⇒ ลิงก์ดูสลิปของ fixture ตอบ 404 = console error 1 บรรทัดต่อภาพ (คาดไว้)
 *   กรองเฉพาะ: สถานะ bills-slip-sheet / bills-slip-reject-invalid · ข้อความ "Failed to load resource … status of 404" · URL = ${BASE}/api/files/<FileAsset ของสลิป fixture>?…
 *   (ไม่ใช่ /api/files ทั้งหมด · ไฟล์อื่น/สถานะอื่น/รหัสอื่น = ยังนับ)
 */
const P3SKU_SLIP_404_STATES: ReadonlySet<string> = new Set(["bills-slip-sheet", "bills-slip-reject-invalid"]);
function p3skuSuppress(state: StateKey | null, txt: string, url: string): boolean {
  if (!state || !P3SKU_SLIP_404_STATES.has(state) || !P3SKU.slipFileId) return false;
  if (!/Failed to load resource: the server responded with a status of 404\b/.test(txt)) return false;
  if (!url.startsWith(`${BASE}/api/files/${P3SKU.slipFileId}?`)) return false;
  P3SKU.slipSuppressed += 1;
  return true;
}
async function runP3skuState(page: Any, state: P3skuKey, device: Device): Promise<void> {
  if (P3SKU.error) throw new StepError(`fixture P3-SKEL U: ${P3SKU.error}`);
  if (!P3SKU.done) throw new StepError("fixture P3-SKEL U ยังไม่ได้สร้าง");
  const has = async (sel: string) => !!(await page.$(sel));
  // ไม่ถือ element handle ข้าม await — รอด้วย selector แล้วทำในหน้าเว็บคำสั่งเดียว (บทเรียน P3.6U)
  const shown = (sel: string, timeout: number, enabled = false) =>
    page
      .waitForFunction(
        (s: string, en: boolean) => {
          const e = document.querySelector(s) as HTMLButtonElement | null;
          return !!e && e.getClientRects().length > 0 && (!en || !e.disabled);
        },
        { timeout },
        sel,
        enabled,
      )
      .catch(() => {
        throw new StepError(`ไม่พบ ${sel}${enabled ? " ที่กดได้" : ""} ภายใน ${Math.round(timeout / 1000)} วิ`);
      });
  const into = async (sel: string, timeout = 20_000) => {
    await shown(sel, timeout);
    await page.$eval(sel, (e: Element) => e.scrollIntoView({ block: "center" }));
    await sleep(300);
  };
  const clickNow = async (sel: string, timeout = 15_000) => {
    await shown(sel, timeout, true);
    await page.$eval(sel, (e: Element) => {
      e.scrollIntoView({ block: "center" });
      (e as HTMLElement).click();
    });
    await sleep(300);
  };
  const attr = (sel: string, a: string) => page.$eval(sel, (e: Element, n: string) => e.getAttribute(n), a).catch(() => null);
  /** ลิ้นชักช่องทาง (โหมดแก้) → การ์ด credentials ของแพลตฟอร์มโหลดเสร็จ */
  const openCreds = async (code: "LINEMAN" | "GRAB") => {
    if (P3SKU.credSkip) throw new StepError(`SKIP — ${P3SKU.credSkip}`);
    await clickNow(tid(`pos-channel-open-${code.toLowerCase()}`), 20_000);
    await shown(tid("pos-channel-drawer"), 10_000);
    const card = `${tid("pos-channel-creds")}[data-provider="${code}"]`;
    await shown(card, 20_000).catch(async () => {
      const st = await attr(tid("pos-channel-creds"), "data-state");
      throw new StepError(`ลิ้นชัก ${code} ไม่ขึ้นการ์ด credentials (state ${st ?? "ไม่มีการ์ด"} · pos.channel.manage / รหัสช่องทาง ${P3SKU.channels[code] ?? "?"})`);
    });
    return card;
  };
  switch (state) {
    case "settings-channel-creds-draft": {
      const card = await openCreds("LINEMAN");
      if ((await attr(card, "data-row-status")) !== "DRAFT") throw new StepError(`การ์ด LINE MAN ไม่ใช่ DRAFT (${await attr(card, "data-row-status")})`);
      await into(`${card} ${tid("pos-channel-creds-field-client_secret")}`);
      return;
    }
    case "settings-channel-creds-complete": {
      const card = await openCreds("GRAB");
      if ((await attr(card, "data-row-status")) !== "COMPLETE") throw new StepError(`SKIP — แถว GRAB ไม่ COMPLETE (${await attr(card, "data-row-status")})`);
      await clickNow(`${card} ${tid("pos-channel-creds-test")}`);
      await into(`${card} ${tid("pos-channel-creds-result")}`).catch(() => {
        throw new StepError("กดทดสอบแล้วไม่ขึ้นบรรทัดผล (testIntegrationConnectionAction)");
      });
      return;
    }
    case "settings-channel-creds-keymissing": {
      const card = await openCreds("LINEMAN");
      if ((await attr(card, "data-status")) !== "KEY_MISSING") throw new StepError("SKIP — เซิร์ฟเวอร์มี POS_CREDENTIALS_KEY (การ์ดไม่ขึ้นยังไม่ตั้งกุญแจ) — สถานะนี้ใช้เมื่อไม่มีกุญแจเท่านั้น");
      await into(`${card} ${tid("pos-channel-creds-key-missing")}`);
      return;
    }
    case "settings-channels-platform-chips": {
      await shown(tid("pos-channel-list"), 20_000);
      if (userKey === "owner") {
        if (P3SKU.credSkip) throw new StepError(`SKIP — ${P3SKU.credSkip}`);
        await shown(tid("pos-channel-conn-lineman"), 10_000);
        await into(tid("pos-channel-conn-grab"), 10_000);
      } else {
        if (await has('[data-testid^="pos-channel-conn-"]')) throw new StepError("แคชเชียร์ (ไม่มี pos.channel.manage) เห็นชิปสถานะ credentials");
        await into(tid("pos-channel-readonly"), 10_000);
      }
      return;
    }
    case "settings-slip-card":
      await into(tid("pos-settings-slip-card"), 20_000);
      await shown(tid("pos-settings-slip-retention"), 5_000);
      if (userKey === "cashier" && (await has(tid("pos-settings-slip-verify-open")))) throw new StepError("แคชเชียร์เห็นปุ่มตั้งค่าตรวจสลิป");
      if (userKey === "owner") await shown(tid("pos-settings-slip-verify-open"), 5_000);
      return;
    case "settings-slip-verify-sheet":
      await clickNow(tid("pos-settings-slip-verify-open"), 20_000);
      await shown(tid("pos-settings-slip-verify-sheet"), 10_000);
      await page.select(tid("pos-settings-slip-verify-provider"), "SLIPOK");
      await shown(`${tid("pos-settings-slip-verify-sheet")} ${tid("pos-channel-creds")}[data-provider="SLIPOK"]`, 20_000).catch(() => {
        throw new StepError("เลือก SlipOK แล้วไม่ขึ้นการ์ด credentials SLIP_VERIFY (pos.settings.payment)");
      });
      return;
    case "settings-etax-sheet":
      await clickNow(tid("pos-settings-card-etax-apply"), 20_000).catch(() => {
        throw new StepError("ปุ่ม \"สมัคร\" ของแถว e-Tax ยังปิด (pos.settings.manage)");
      });
      await shown(tid("pos-settings-etax-sheet"), 10_000);
      await page.select(tid("pos-settings-etax-provider"), "INET");
      await shown(`${tid("pos-settings-etax-sheet")} ${tid("pos-channel-creds")}[data-provider="INET"]`, 20_000).catch(() => {
        throw new StepError("เลือก INET แล้วไม่ขึ้นการ์ด credentials ETAX");
      });
      return;
    case "settings-devices-lan-none":
      if (P3SKU.lanNoneSkip) throw new StepError(`SKIP — ${P3SKU.lanNoneSkip}`);
      await shown(tid("pos-device-lan-card"), 20_000);
      if (await has('[data-testid^="pos-device-lan-agent-"]:not([data-revoked])')) throw new StepError("การ์ดยังมีตัวช่วยพิมพ์ที่ใช้งานอยู่");
      if (!(await page.$eval(tid("pos-device-mode-lan"), (e: Element) => (e as HTMLButtonElement).disabled).catch(() => false))) throw new StepError("ไม่มีตัวช่วยพิมพ์แต่วิทยุแลนเปิด");
      await into(tid("pos-device-lan-reason"), 10_000);
      return;
    case "settings-devices-lan-agents":
      await shown(tid("pos-device-lan-agent-0"), 20_000);
      if ((await attr(tid("pos-device-mode-lan"), "aria-checked")) !== "true") throw new StepError("printerConfig แลนของเครื่องนี้แล้วแต่วิทยุแลนไม่ติ๊ก (เครื่องที่เลือก ≠ DEVICE_ID?)");
      await shown(tid("pos-device-kitchen-lan"), 10_000, true).catch(() => {
        throw new StepError("วิทยุใบครัว LAN ไม่เปิด (agent มีเครื่องใบครัว + โหมดแลน)");
      });
      if ((await attr(tid("pos-device-kitchen-lan"), "aria-checked")) !== "true") throw new StepError("kitchenSlip after-sale + แลน แต่วิทยุใบครัว LAN ไม่ติ๊ก");
      await into(tid("pos-device-kitchen-lan"));
      return;
    case "settings-devices-lan-token": {
      await clickNow(tid("pos-device-lan-add"), 20_000);
      await shown(tid("pos-device-lan-register"), 10_000);
      const name = `${P3SKU_TAG}-token-${process.pid}-${++P3SKU.tokenN}`;
      await typeInto(page, tid("pos-device-lan-name"), name);
      await typeInto(page, tid("pos-device-lan-printer-name-0"), P3SKU_PRINTERS[0].name);
      await typeInto(page, tid("pos-device-lan-printer-host-0"), P3SKU_PRINTERS[0].host);
      await page.select(tid("pos-device-lan-printer-target-0"), "kitchen");
      await clickNow(tid("pos-device-lan-submit"));
      await shown(tid("pos-device-lan-token"), 15_000).catch(async () => {
        const err = await page.$eval(tid("pos-device-lan-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`ลงทะเบียนตัวช่วยพิมพ์ "${name}" แล้วไม่ขึ้นกล่องโทเคน${err ? ` (${err})` : ""}`);
      });
      // 🔴 โทเคนจริงไม่ลงภาพ (fix1 F3): ปิดด้วย CSS overlay ที่ React วาดทับไม่ได้ (ไม่แก้ textContent ของ <code> ที่ React คุม) ·
      //   ตรวจซ้ำหลัง into() ก่อนถ่าย — ยังมองเห็นโทเคน = StepError (ไม่ถ่าย) · agent ถูกเพิกถอน + ลบตอนเก็บกวาด
      await page.addStyleTag({
        content: `${tid("pos-device-lan-token")} code{color:transparent!important;text-shadow:none!important;position:relative}${tid("pos-device-lan-token")} code::after{content:"spa_•••••••••••••••• (ปิดบังในภาพ QC)";color:var(--color-ink);position:absolute;left:12px;top:8px}`,
      });
      await into(tid("pos-device-lan-token"));
      const masked = await page
        .$eval(`${tid("pos-device-lan-token")} code`, (e: Element) => {
          const c = getComputedStyle(e).color.replace(/\s/g, "");
          return c === "transparent" || c === "rgba(0,0,0,0)";
        })
        .catch(() => false);
      if (!masked) throw new StepError("โทเคนตัวช่วยพิมพ์ยังมองเห็นก่อนถ่าย (CSS ปิดบังไม่ติด) — ไม่ถ่ายภาพนี้");
      return;
    }
    case "paydlg-intent-slip":
      await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
      await ensureShift(page);
      await addCart3(page, device, true);
      await waitPayReady(page);
      await clickPay(page, device);
      await shown(tid("pos-reg-paydlg"), 10_000);
      await clickNow(tid("pos-reg-paydlg-method-promptpay"));
      await shown(`${tid("pos-pay-intent")}[data-status="PENDING"]`, 20_000).catch(async () => {
        const st = await page.$eval(tid("pos-pay-intent"), (e: Element) => `${e.getAttribute("data-status")} ${e.textContent?.slice(0, 120)}`).catch(() => "ไม่มีแผง");
        throw new StepError(`ใบขอรับเงินไม่ขึ้น PENDING (${st}) — PromptPay ID ของร้าน QC: ${INTENTS.ppNote}`);
      });
      if (!(await has(tid("pos-pay-intent-slip")))) throw new StepError("SKIP — ใบขอรับเงินไม่ใช่ PROMPTPAY_STATIC (Beam เปิดอยู่?) — ปุ่มแนบสลิปมีเฉพาะพร้อมเพย์แบบคงที่");
      await clickNow(tid("pos-pay-intent-slip"));
      await into(tid("pos-slip-form"), 10_000);
      return;
    case "paydone-transfer-slip": {
      await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
      await ensureShift(page);
      await addCart3(page, device, true);
      await waitPayReady(page);
      await clickPay(page, device);
      await shown(tid("pos-reg-paydlg"), 10_000);
      await clickNow(tid("pos-reg-paydlg-method-transfer"));
      await clickNow(tid("pos-reg-paydlg-confirm"), 15_000);
      await shown(tid("pos-reg-done"), 25_000).catch(async () => {
        const err = await page.$eval(tid("pos-reg-paydlg-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`ยืนยันโอนเงินแล้วไม่ขึ้นจอสำเร็จ${err ? ` (${err})` : ""}`);
      });
      const s = await prisma.posSale.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, status: "PAID", createdAt: { gte: RUN_STARTED }, payments: { some: { type: "TRANSFER" } }, NOT: { id: { in: P3SKU.saleIds } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (s) {
        P3SKU.saleIds.push(s.id);
        P3SKU.log.push(`บิลโอนจากจอ ${s.id}`);
      }
      await clickNow(tid("pos-reg-done-slip"), 10_000).catch(() => {
        throw new StepError("จอสำเร็จบิลโอนไม่มีปุ่มแนบสลิป (pos-reg-done-slip)");
      });
      await into(tid("pos-slip-form"), 15_000).catch(async () => {
        const err = await page.$eval(tid("pos-slip-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`กดแนบสลิปแล้วไม่ขึ้นฟอร์ม${err ? ` (${err})` : ""} (slipTargetsAction)`);
      });
      return;
    }
    case "taxinv-etax-line":
      if (TAXINV.error) throw new StepError(`SKIP — สมุด QC: ${TAXINV.error}`);
      await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
      await ensureShift(page);
      await addCart3(page, device, true);
      await openCartOnMobile(page, device);
      await clickNow(tid("pos-reg-tax-invoice"));
      await shown(tid("pos-taxinv-dialog"), 10_000).catch(async () => {
        const toast = await page.$eval(tid("pos-reg-toast"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`กล่อง 15A ไม่ขึ้น${toast ? ` (ข้อความ: ${toast})` : ""}`);
      });
      await into(tid("pos-taxinv-etax-pending"), 10_000);
      return;
    case "bills-drawer-slips":
    case "bills-slip-sheet":
    case "bills-slip-reject-invalid":
      if (P3SKU.billSkip || !P3SKU_SALE.id) throw new StepError(`SKIP — ${P3SKU.billSkip || "ไม่มีบิลโอนของภาพ"}`);
      await shown(tid("pos-bills-drawer"), 20_000);
      await into(tid("pos-bills-slips"), 20_000).catch(() => {
        throw new StepError(`ลิ้นชักบิล ${P3SKU_SALE.id} ไม่มีบล็อกสลิป (bill.slips · slipTargetsAction)`);
      });
      await shown(tid("pos-bills-slip-0"), 10_000);
      if (state === "bills-drawer-slips") {
        if (userKey === "cashier" && (await has(tid("pos-bills-slip-confirm")))) throw new StepError("แคชเชียร์เห็นปุ่มยืนยันสลิป");
        return;
      }
      await clickNow(tid("pos-bills-slip-0"));
      await shown(tid("pos-bills-slip-sheet"), 10_000);
      await shown(tid("pos-bills-slip-image"), 15_000);
      console.log(`  ℹ️ ${state}: QC5 ไม่มี slip storage — รูปสลิป 404 เป็นที่คาด (กรอง console 404 ของ /api/files/${P3SKU.slipFileId || "?"} เท่านั้น)`);
      await shown(tid("pos-bills-slip-confirm"), 10_000).catch(() => {
        throw new StepError("แผ่นสลิปของเจ้าของร้านไม่มีปุ่มยืนยัน (pos.shift.manage)");
      });
      if (state === "bills-slip-sheet") return;
      await clickNow(tid("pos-bills-slip-reject"));
      await typeInto(page, tid("pos-bills-slip-reason"), "ab");
      await clickNow(tid("pos-bills-slip-reject-send"));
      await into(tid("pos-bills-slip-error"), 10_000).catch(() => {
        throw new StepError("เหตุผล 2 ตัวอักษรแล้วไม่ขึ้นข้อความในแผ่น");
      });
      return;
    case "reports-reconcile-owner":
      await shown(`${tid("pos-reports-reconcile")}:not([data-state="loading"])`, 25_000);
      if ((await attr(tid("pos-reports-reconcile"), "data-state")) !== "ready") throw new StepError(`รายงานกระทบยอดไม่พร้อม (${await attr(tid("pos-reports-reconcile"), "data-state")})`);
      await into(tid("pos-reports-reconcile"));
      return;
    case "reports-reconcile-denied":
      await into(tid("pos-reports-reconcile-denied"), 20_000);
      return;
  }
}
// ◂ POS P3-SKEL U
// ═══════════════════ POS P3.6U ▸ ลูกค้าองค์กร/วางบิล: 01 ชิปบริษัท/แผ่นเลือก/ดีล · 02 ไทล์วางบิล + แผ่นเกินวงเงิน · 02b ครบกำหนด · 12 W23 · 08 ลูกหนี้ · 10 การ์ด (CD-P36U-1…12) ◂ ═══════════════════
// fixture (ensureP36uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล · ไม่ reseed · ร้าน QC coffee เท่านั้น):
//   • ระบบ CRM (ผู้คุม 22 ต.ค. 00:4xZ · CD-P36U-12): ใช้ระบบ CRM ที่ active ตัวแรกของร้าน QC · ไม่มี = createSystem(…, "CRM", "ลูกค้าองค์กร (ภาพ QC P3.6U)")
//     (แบบระบบคูปองของ P1.12U) — เก็บไว้ใช้ซ้ำ ไม่ลบตอนเก็บกวาด
//   • บริษัท 2 แห่ง (หมายเหตุ posqc-vis-p36u-co / -co2) + ผู้ติดต่อของสมาชิก QC (เบอร์เดียวกัน ⇒ Party ของสมาชิก) ผูก -co + ดีล OPEN 1 ใบ (หัวเรื่อง posqc-vis-p36u-deal)
//     ผ่านตัวเขียนของโมดูล CRM (companies.createCompany · contacts.createContact · companies.addContact · pipelines · deals.createDeal) — find-or-create · เก็บไว้
//   • บัญชีเครดิตผ่าน saveCreditAccount (ผู้เขียนเดียว): -co วงเงิน ฿500,000 · -co2 วงเงิน ฿1 (เกินวงเงิน) · เทอม 30 วัน · เก็บไว้
//   • settings.pos.credit / settings.pos.orders.memberOnBill = jsonb ของ harness เท่านั้น (แบบ CD-P39U-4) — ค่าเดิมใน settings.pos._qcP36uBefore
//     (ซากรอบที่ถูก kill = คืนจากคีย์นี้) · คืนหลังงานสุดท้าย/finally/สัญญาณ · 🔴 ด่านก่อนเขียนทุกครั้ง: ระบบ = POS ของร้าน QC และแตะเฉพาะคีย์เหล่านี้ (อื่น = StepError หยุด)
//   • ผู้จัดการของภาพ posqc-coffee-user-p36u-mgr (Membership MANAGER + PIN ผ่าน setStaffPin · แบบ P39U_MGR) — PIN ผิดของภาพ = ล้างด้วย unlockStaffPin ·
//     เก็บกวาด = ลบแถว PIN + Membership
//   • paydone-onaccount-due กดยืนยันจริง 1 ครั้ง (บิล ON_ACCOUNT ของ -co) — บิลนี้ใช้ต่อในภาพบิล · เก็บกวาด = voidSale (แบบ P2.12U)
type P36uCo = { id: string; partyId: string; name: string; taxId: string | null };
const P36U = {
  done: false,
  error: null as string | null,
  cleaned: false,
  ok: true,
  log: [] as string[],
  crmSystemId: "",
  crmCreated: false,
  co: null as P36uCo | null,
  co2: null as P36uCo | null,
  /** เหตุที่ส่วนบริษัทของสมาชิกใช้ไม่ได้ (ว่าง = ผูกแล้ว) */
  memberSkip: "ยังไม่ได้ผูก",
  dealId: "",
  dealSkip: "ยังไม่ได้สร้าง",
  before: null as null | { credit: { had: boolean; v: unknown }; memberOnBill: { had: boolean; v: unknown }; /** fix1 F4: settings.pos.orders มีอยู่ก่อนรอบไหม */ ordersHad: boolean },
  mgr: false,
  mgrPin: "",
  saleIds: [] as string[],
};
const p36uRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const p36uHas = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** 🔴 ด่านก่อนเขียนค่าตั้ง: ร้าน QC coffee + ระบบ POS ของร้านนี้ (อื่น = StepError หยุดทั้งใบ) */
async function p36uGuard(): Promise<void> {
  // fix2: ตัวตน = tenantId ตายตัวของร้าน QC coffee (posqc-coffee-tenant · แบบด่าน P3.8U) — slug ของร้าน QC ขึ้นต้น "pos-qc-" ไม่ใช่ "posqc" ◂
  if (tenantKey !== "coffee" || T.tenantId !== PQC.coffee.tenantId) throw new StepError(`ด่าน P3.6U: tenantId ${T.tenantId} (key ${tenantKey} · slug ${T.slug}) ≠ ${PQC.coffee.tenantId} (ร้าน QC coffee) — ไม่เขียน`);
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId, type: "POS" }, select: { id: true } });
  if (!sys) throw new StepError("ด่าน P3.6U: ระบบ POS ไม่ใช่ของร้าน QC — ไม่เขียน");
}
async function p36uReadPos(): Promise<Record<string, unknown>> {
  const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId, type: "POS" }, select: { settings: true } });
  const pos = p36uRec(sys?.settings) ? (sys!.settings as Record<string, unknown>).pos : undefined;
  return p36uRec(pos) ? pos : {};
}
/** เขียน/ลบคีย์ของ harness ใต้ settings.pos — แตะเฉพาะ {pos,credit} · {pos,orders,memberOnBill} · {pos,_qcP36uBefore} (undefined = ลบ) */
async function p36uSetKey(key: "credit" | "memberOnBill" | "_qcP36uBefore", v: unknown): Promise<void> {
  await p36uGuard();
  const path = key === "credit" ? "{pos,credit}" : key === "memberOnBill" ? "{pos,orders,memberOnBill}" : "{pos,_qcP36uBefore}";
  if (v === undefined) {
    await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- ${path}::text[] WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND type = 'POS' AND jsonb_typeof("settings"->'pos') = 'object'`;
    return;
  }
  const json = JSON.stringify(v);
  if (key === "memberOnBill") {
    await prisma.$executeRaw`
      UPDATE "AppSystem"
      SET "settings" = jsonb_set(
        jsonb_set(
          jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
            CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
          '{pos,orders}', CASE WHEN jsonb_typeof("settings"->'pos'->'orders') = 'object' THEN "settings"->'pos'->'orders' ELSE '{}'::jsonb END, true),
        ${path}::text[], ${json}::jsonb, true)
      WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND type = 'POS'`;
    return;
  }
  await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
        CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
      ${path}::text[], ${json}::jsonb, true)
    WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND type = 'POS'`;
}
/** จดค่าเดิมครั้งเดียว (ซากของรอบที่ถูก kill = คืนจาก _qcP36uBefore) */
async function p36uRemember(): Promise<void> {
  if (P36U.before) return;
  const pos = await p36uReadPos();
  const res = p36uRec(pos._qcP36uBefore) ? (pos._qcP36uBefore as Record<string, unknown>) : null;
  const part = (x: unknown) => (p36uRec(x) && x.had === true ? { had: true, v: x.v } : { had: false, v: undefined });
  if (res) {
    P36U.before = { credit: part(res.credit), memberOnBill: part(res.memberOnBill), ordersHad: res.ordersHad !== false };
    P36U.log.push("กวาดซากค่าตั้งวางบิลของรอบก่อน (คืนจาก _qcP36uBefore)");
  } else {
    const orders = p36uRec(pos.orders) ? pos.orders : null;
    P36U.before = {
      credit: p36uHas(pos, "credit") ? { had: true, v: pos.credit } : { had: false, v: undefined },
      memberOnBill: orders && p36uHas(orders, "memberOnBill") ? { had: true, v: orders.memberOnBill } : { had: false, v: undefined },
      ordersHad: p36uHas(pos, "orders"),
    };
  }
  const b = P36U.before;
  await p36uSetKey("_qcP36uBefore", { credit: { had: b.credit.had, v: b.credit.had ? (b.credit.v ?? null) : null }, memberOnBill: { had: b.memberOnBill.had, v: b.memberOnBill.had ? (b.memberOnBill.v ?? null) : null }, ordersHad: b.ordersHad });
}
async function p36uRestore(): Promise<string> {
  const b = P36U.before;
  if (!b) return "ค่าตั้งไม่ถูกแตะ";
  await p36uSetKey("credit", b.credit.had ? b.credit.v : undefined);
  await p36uSetKey("memberOnBill", b.memberOnBill.had ? b.memberOnBill.v : undefined);
  // fix1 F4: pos.orders ไม่มีก่อนรอบ และตอนนี้ว่าง = ลบ {pos,orders} (ไม่ทิ้ง {} ค้าง)
  if (!b.ordersHad) {
    await p36uGuard();
    await prisma.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" #- '{pos,orders}' WHERE "id" = ${SYS} AND "tenantId" = ${T.tenantId} AND type = 'POS' AND jsonb_typeof("settings"->'pos'->'orders') = 'object' AND "settings"->'pos'->'orders' = '{}'::jsonb`;
  }
  await p36uSetKey("_qcP36uBefore", undefined);
  P36U.before = null;
  return `คืนค่าตั้งวางบิล (credit ${b.credit.had ? "เดิม" : "ลบ"} · memberOnBill ${b.memberOnBill.had ? "เดิม" : "ลบ"})`;
}
const p36uPosCtx = () => ({ tenantId: T.tenantId, systemId: SYS, unitId });
async function ensureP36uFixture(): Promise<void> {
  if (P36U.done || P36U.error) return;
  /** fix3: ทุกขั้นของ fixture ห่อชื่อขั้น + ค่าที่ใช้ — ล้ม = StepError "ขั้น (ค่า): เหตุ" */
  const at = async <R = Any,>(stepName: string, value: unknown, fn: () => Promise<R>): Promise<R> => { // POS P3-SKEL U ▸ typecheck: R = Any เมื่อ fn คืน any (ฐาน e0fb57cf มี TS2571/TS2339 13 จุดที่ :8046–8110 · fix3/fix4 ของ P3.6U ไม่ได้ผ่าน tsc) ◂
    try {
      return await fn();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new StepError(`${stepName} (${JSON.stringify(value ?? null).slice(0, 90)}): ${why.slice(0, 140)}`);
    }
  };
  try {
    await at("ด่านร้าน QC", { tenantId: T.tenantId, SYS }, p36uGuard);
    const want = (re: RegExp) => jobs.some((j) => isP36uState(j.state) && re.test(j.state));
    const owner = await at("เจ้าของร้าน QC", T.users.owner.membershipId, ownerActor);
    await at("จดค่าตั้งเดิม", "settings.pos.credit/.orders", p36uRemember);
    // ระบบ CRM ของร้าน QC (active ตัวแรก · ไม่มี = สร้าง · เก็บไว้) — probe fix3: QC4 ไม่มีระบบ CRM ⇒ ทางสร้าง
    const sysSvc = await import("@/lib/modules/system/service");
    const crmSys = await prisma.appSystem.findFirst({ where: { tenantId: T.tenantId, type: "CRM", active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } });
    if (crmSys) P36U.crmSystemId = crmSys.id;
    else {
      P36U.crmSystemId = (await at("สร้างระบบ CRM", P36U_CRM_NAME, () => sysSvc.createSystem(T.tenantId, "CRM", P36U_CRM_NAME))).id;
      P36U.crmCreated = true;
    }
    P36U.log.push(`ระบบ CRM ${P36U.crmSystemId}${P36U.crmCreated ? ` (สร้าง "${P36U_CRM_NAME}")` : ` (${crmSys?.name ?? ""})`}`);
    const crm = (await import("@/lib/modules/crm")) as Any;
    const cctx = { tenantId: T.tenantId, systemId: P36U.crmSystemId, actorUserId: owner.userId };
    // fix4: ดีลบนหน้าขายอ่านผ่าน crm.payments.openDealsForParty ซึ่งคืน [] เมื่อระบบ CRM ไม่ใช่ uiVersion 2 (payments.ts:1251 isV2) —
    //   ระบบ CRM ที่ harness สร้าง ("ลูกค้าองค์กร (ภาพ QC P3.6U)") ตั้งค่าปริยาย uiVersion 1 ⇒ เปิด v2 ด้วยตัวเขียนของ CRM (setCrmSettingsKey · คีย์อื่นของ settings.crm อยู่ครบ)
    //   เฉพาะระบบของภาพเท่านั้น · ระบบ CRM จริงของร้านที่ยังเป็น v1 = ไม่แตะ (ดีล SKIP พร้อมเหตุผล)
    const crmSet = (await import("@/lib/modules/crm/settings")) as Any;
    const sctx = { tenantId: T.tenantId, systemId: P36U.crmSystemId };
    const ours = P36U.crmCreated || crmSys?.name === P36U_CRM_NAME;
    let crmV2 = (await at("getCrmSettings", sctx, () => crmSet.getCrmSettings(sctx))).uiVersion === 2;
    if (!crmV2 && ours) {
      await at("setCrmSettingsKey uiVersion 2 (ระบบ CRM ของภาพ)", sctx, () => crmSet.setCrmSettingsKey(sctx, "uiVersion", 2));
      crmV2 = true;
      P36U.log.push("ระบบ CRM ของภาพ → uiVersion 2");
    }
    const coRow = (id: string) => prisma.crmCompany.findFirst({ where: { id, tenantId: T.tenantId }, select: { id: true, partyId: true, name: true, taxId: true, archivedAt: true } });
    for (const k of ["co", "co2"] as const) {
      const spec = P36U_CO[k];
      // ฟิลด์ที่ผ่าน probe: name ≤ COMPANY_NAME_MAX · taxId 13 หลักผ่าน taxIdProblem · branchCode "00000" · note = แท็ก (ไม่มี source)
      let row = await prisma.crmCompany.findFirst({ where: { tenantId: T.tenantId, systemId: P36U.crmSystemId, note: spec.tag, archivedAt: null, mergedIntoId: null }, select: { id: true, partyId: true, name: true, taxId: true, archivedAt: true } });
      if (!row) {
        const input = { name: spec.name, taxId: spec.taxId, branchCode: "00000", note: spec.tag };
        const r = await at(`createCompany ${spec.tag}`, input, () => crm.companies.createCompany(cctx, owner, input));
        if (!r?.created && r?.duplicateArchived) throw new StepError(`createCompany ${spec.tag} (taxId ${spec.taxId}): ชนบริษัทที่เก็บถาวรแล้ว ${r?.duplicateOf} — กู้คืนใน CRM ก่อน`);
        const id = r?.created ? r.company?.id : (r?.duplicateOf ?? r?.company?.id);
        row = id ? await coRow(String(id)) : null;
        if (!row) throw new StepError(`createCompany ${spec.tag} (${JSON.stringify(input).slice(0, 80)}): ไม่ได้แถวบริษัท (${JSON.stringify(r ?? null).slice(0, 80)})`);
        P36U.log.push(`บริษัท ${spec.tag} ${r?.created ? "สร้าง" : "ใช้ตัวซ้ำ (taxId เดียวกัน)"}`);
      }
      P36U[k] = { id: row.id, partyId: row.partyId, name: row.name, taxId: row.taxId };
    }
    // ผู้ติดต่อของสมาชิก QC → -co (probe fix3: Party ของสมาชิกมีเบอร์ 0899000001 · contactPhoneProblem null · ที่มา = ค่าปริยาย "CRM" ของตัวเขียน — ไม่ส่ง sourceKind)
    const C = T as Any;
    const mem = C.member?.phone && C.systems?.MEMBER?.id ? await prisma.customer.findFirst({ where: { tenantId: T.tenantId, memberSystemId: C.systems.MEMBER.id, phone: C.member.phone, status: "ACTIVE" }, select: { id: true, partyId: true, name: true } }) : null;
    let contactId = "";
    if (!mem?.partyId) P36U.memberSkip = "ไม่พบสมาชิก QC/Party ของสมาชิก";
    else {
      let row = await prisma.crmContact.findFirst({ where: { tenantId: T.tenantId, systemId: P36U.crmSystemId, partyId: mem.partyId, archivedAt: null, mergedIntoId: null }, select: { id: true, partyId: true } });
      if (!row) {
        const input = { firstName: String(mem.name ?? C.member.name ?? "สมาชิก QC"), phone: String(C.member.phone), companyId: P36U.co!.id };
        const r = await at("createContact (สมาชิก QC)", input, () => crm.contacts.createContact(cctx, owner, input));
        row = r?.contact?.id ? await prisma.crmContact.findFirst({ where: { id: String(r.contact.id), tenantId: T.tenantId }, select: { id: true, partyId: true } }) : null;
      }
      if (!row) P36U.memberSkip = "สร้างผู้ติดต่อ CRM ของสมาชิกไม่ได้";
      else {
        contactId = row.id;
        const link = await prisma.crmCompanyContact.findFirst({ where: { tenantId: T.tenantId, companyId: P36U.co!.id, contactId: row.id, endedAt: null }, select: { id: true } });
        if (!link) await at("addContact (-co ← สมาชิก)", { companyId: P36U.co!.id, contactId: row.id }, () => crm.companies.addContact(cctx, owner, P36U.co!.id, { contactId: row!.id, isPrimary: true }));
        P36U.memberSkip = row.partyId === mem.partyId ? "" : `ผู้ติดต่อ CRM ${row.id} ไม่ได้ผูก Party ของสมาชิก QC (${row.partyId} ≠ ${mem.partyId})`;
      }
    }
    // ดีล OPEN 1 ใบของ -co (deals.createDeal ต้องมี pipeline ที่มีขั้น OPEN · ระบบใหม่ไม่มี ⇒ สร้างตามขั้นปริยายของโมดูล DEFAULT_PIPELINE)
    const deal = await prisma.crmDeal.findFirst({ where: { tenantId: T.tenantId, systemId: P36U.crmSystemId, title: P36U_DEAL_TITLE, companyId: P36U.co!.id, kind: "OPEN", archivedAt: null }, select: { id: true } });
    if (deal) P36U.dealId = deal.id;
    else {
      if (!contactId) {
        const input = { firstName: `ฝ่ายจัดซื้อ (${P36U_REASON})`, companyId: P36U.co!.id };
        const r = await at("createContact (ฝ่ายจัดซื้อ -co)", input, () => crm.contacts.createContact(cctx, owner, input));
        contactId = String(r?.contact?.id ?? "");
      }
      const pls = (await at("listPipelines", P36U.crmSystemId, () => crm.pipelines.listPipelines(cctx, owner))) as Any[];
      const openOf = (x: Any) => !x.archivedAt && Array.isArray(x.stages) && x.stages.some((s: Any) => s.kind === "OPEN");
      let pl = pls.find((x) => x.isDefault && openOf(x)) ?? pls.find(openOf) ?? null;
      if (!pl) {
        const { DEFAULT_PIPELINE } = (await import("@/lib/modules/crm/rules")) as Any;
        const input = { name: DEFAULT_PIPELINE.name, isDefault: true, stages: DEFAULT_PIPELINE.stages.map((s: Any) => ({ name: s.name, kind: s.kind, probability: s.probability })) };
        pl = await at("createPipeline (ขั้นปริยายของโมดูล)", input.stages.map((s: Any) => `${s.name}:${s.kind}`), () => crm.pipelines.createPipeline(cctx, owner, input));
        P36U.log.push(`ไปป์ไลน์ปริยาย ${pl?.id}`);
      }
      if (!pl?.id || !contactId) P36U.dealSkip = `ไม่มีไปป์ไลน์ (${pl?.id ?? "-"}) / ผู้ติดต่อ (${contactId || "-"}) ของดีล`;
      else {
        const input = { pipelineId: pl.id, title: P36U_DEAL_TITLE, contactId, companyId: P36U.co!.id, valueSatang: 1_250_000 };
        const d = await at("createDeal", input, () => crm.deals.createDeal(cctx, owner, input));
        P36U.dealId = String(d?.id ?? "");
        P36U.log.push(`ดีล ${P36U.dealId}`);
      }
    }
    if (P36U.dealId) P36U.dealSkip = "";
    // fix4: ตรวจตัวเองด้วยตัวอ่านเดียวกับ registerDealOptionsAction (crm.payments.openDealsForParty · Party ของบริษัท -co) — ไม่เห็น = บอกตัวกรองที่ตัดทิ้ง
    if (P36U.dealId) {
      const vis = (await at("openDealsForParty (-co)", { systemId: P36U.crmSystemId, partyId: P36U.co!.partyId }, () => crm.payments.openDealsForParty(sctx, owner, P36U.co!.partyId))) as Any[];
      if (!vis.some((d) => d.id === P36U.dealId)) {
        const row = await prisma.crmDeal.findFirst({ where: { id: P36U.dealId, tenantId: T.tenantId }, select: { kind: true, archivedAt: true, companyId: true, systemId: true } });
        const why = !crmV2
          ? `ระบบ CRM ${P36U.crmSystemId} uiVersion ≠ 2 (payments.ts:1251 isV2)`
          : !crm.crmCan(owner, "crm.deal.read")
            ? "เจ้าของไม่มี crm.deal.read"
            : !crm.crmCan(owner, "crm.deal.update")
              ? "เจ้าของไม่มี crm.deal.update (crm-link registerDealOptions)"
              : !row
                ? "ไม่พบแถวดีล"
                : row.kind !== "OPEN" || row.archivedAt
                  ? `ดีล kind ${row.kind} archived ${!!row.archivedAt}`
                  : row.companyId !== P36U.co!.id
                    ? `ดีล companyId ${row.companyId} ≠ -co ${P36U.co!.id}`
                    : "dealWhere (การมองเห็นของเจ้าของ)";
        P36U.dealSkip = `deal not visible: ${why}`;
        P36U.log.push(P36U.dealSkip);
      } else P36U.log.push("ดีลมองเห็นผ่าน openDealsForParty ✓");
    }
    // บัญชีเครดิต (ผู้เขียนเดียว saveCreditAccount · Party บริษัท kind COMPANY จาก createCompany) — ตรงค่าที่ต้องการแล้ว = ไม่เขียน
    const credit = await import("@/lib/modules/pos/credit");
    const listed = await at("listCreditAccounts", SYS, () => credit.listCreditAccounts({ tenantId: T.tenantId, systemId: SYS }, owner));
    for (const k of ["co", "co2"] as const) {
      const co = P36U[k]!;
      const spec = P36U_CO[k];
      const cur = listed.ok ? listed.items.find((a) => a.partyId === co.partyId) : null;
      if (cur && cur.limitSatang === spec.limitSatang && cur.termDays === 30 && cur.active) continue;
      const input = { partyId: co.partyId, limitSatang: spec.limitSatang, termDays: 30, active: true, note: null };
      const r = await at(`saveCreditAccount ${spec.tag}`, input, () => credit.saveCreditAccount({ tenantId: T.tenantId, systemId: SYS }, owner, input));
      if (!r.ok) throw new StepError(`saveCreditAccount ${spec.tag} (${JSON.stringify(input)}): ${r.code}`);
      P36U.log.push(`วงเงิน ${spec.tag} ${spec.limitSatang / 100} บาท`);
    }
    // ผู้จัดการของภาพ + PIN (แผ่นเกินวงเงิน · setStaffPin: ผู้ตั้ง = เจ้าของ (pos.staff.manage) · เป้าหมายต้องขายที่สาขาได้ = MANAGER [สาขา])
    if (want(/credit-over/)) {
      const { setStaffPin } = await import("@/lib/modules/pos/staff-pin");
      const { randomInt } = await import("node:crypto");
      await at("User ผู้จัดการของภาพ", P36U_MGR.userId, () => prisma.user.upsert({ where: { id: P36U_MGR.userId }, update: {}, create: { id: P36U_MGR.userId, email: P36U_MGR.email, name: P36U_MGR.name } }));
      P36U.mgr = true;
      await at("Membership ผู้จัดการของภาพ", { role: "MANAGER", unitAccess: [unitId] }, () =>
        prisma.membership.upsert({
          where: { userId_tenantId: { userId: P36U_MGR.userId, tenantId: T.tenantId } },
          update: { role: "MANAGER", unitAccess: [unitId] },
          create: { id: P36U_MGR.membershipId, userId: P36U_MGR.userId, tenantId: T.tenantId, role: "MANAGER", unitAccess: [unitId], permissions: {}, acceptedAt: new Date() },
        }),
      );
      let last = "";
      for (let i = 0; i < 6 && !P36U.mgrPin; i++) {
        const pin = String(randomInt(100000, 1000000));
        if (WEAK.has(pin) || Object.values(P115.pins).includes(pin)) continue;
        const r = await at("setStaffPin ผู้จัดการของภาพ", { unitId, userId: P36U_MGR.userId }, () => setStaffPin(p36uPosCtx(), owner, { userId: P36U_MGR.userId, pin }));
        if (r.ok) P36U.mgrPin = pin;
        else if (r.code !== "PIN_TAKEN" && r.code !== "WEAK_PIN") throw new StepError(`setStaffPin ผู้จัดการของภาพ (สาขา ${unitId}): ${r.code}`);
        else last = r.code;
      }
      if (!P36U.mgrPin) throw new StepError(`setStaffPin ผู้จัดการของภาพ (สาขา ${unitId}): ไม่ได้ PIN หลังลอง 6 ครั้ง (${last})`);
      P36U.log.push(`ผู้จัดการของภาพ ${P36U_MGR.name} (PIN ที่สาขา ${unitKey})`);
    }
    if (want(/onaccount-buyer|paydone|^bills-|^reports-/)) {
      await prepTaxInvoiceBook();
      if (TAXINV.error) P36U.log.push(`สมุด QC: ${TAXINV.error}`);
    }
    if (want(/picker-member/)) await prepMemberFixture();
    P36U.done = true;
  } catch (e) {
    P36U.error = e instanceof Error ? e.message.slice(0, 260) : String(e);
  }
}
async function prepP36u(state: P36uKey): Promise<void> {
  if (!P36U.done) return;
  try {
    const off = state === "paydlg-onaccount-hidden" || state === "settings-credit-card-off";
    const buyer = state === "paydlg-onaccount-buyer" || state.startsWith("settings-");
    await p36uSetKey("credit", { enabled: !off, requireBuyer: off || buyer });
    if (state === "settings-orders-member-on-bill") await p36uSetKey("memberOnBill", true);
    if (P36U.mgr && /credit-over/.test(state)) {
      const { unlockStaffPin } = await import("@/lib/modules/pos/staff-pin");
      await unlockStaffPin(p36uPosCtx(), await ownerActor(), { userId: P36U_MGR.userId });
    }
    if ((state.startsWith("bills-") || state.startsWith("reports-")) && P36U.co) {
      if (!P36U_SALE.id) {
        const s = await prisma.posSale.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, customerPartyId: P36U.co.partyId, status: "PAID", createdAt: { gte: new Date(Date.now() - 20 * 3_600_000) }, payments: { some: { type: "ON_ACCOUNT" } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
        if (s) P36U_SALE.id = s.id;
      }
      try {
        const { drainAll } = await import("@/lib/outbox-consumers");
        await drainAll(); // ใบแจ้งหนี้ของบิลวางบิล (ลิ้นชัก W23 · รายงานลูกหนี้)
      } catch {
        /* เซิร์ฟเวอร์ QC ระบายเองภายหลัง */
      }
    }
  } catch (e) {
    P36U.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
async function cleanupP36u(): Promise<void> {
  if (P36U.cleaned) return;
  P36U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string>) => {
    try {
      P36U.log.push(await fn());
    } catch (e) {
      P36U.ok = false;
      P36U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  if (P36U.before) await step("คืนค่าตั้งวางบิล", p36uRestore);
  const ids = [...new Set(P36U.saleIds)];
  if (ids.length)
    await step("ยกเลิกบิลวางบิลของภาพ", async () => {
      const { voidSale } = await import("@/lib/modules/pos/service");
      const owner = await ownerActor();
      let n = 0;
      for (const id of ids) {
        const s = await prisma.posSale.findFirst({ where: { id, tenantId: T.tenantId }, select: { status: true } });
        if (s?.status !== "PAID") continue;
        await voidSale(T.tenantId, unitId, id, { actorUserId: owner.userId, reason: `ลูกค้าองค์กรยกเลิก (${P36U_REASON})` });
        n++;
      }
      return `ยกเลิกบิลวางบิล ${n} ใบ (voidSale)`;
    });
  if (P36U.mgr)
    await step("ลบผู้จัดการของภาพ", async () => {
      const { unlockStaffPin } = await import("@/lib/modules/pos/staff-pin");
      await unlockStaffPin(p36uPosCtx(), await ownerActor(), { userId: P36U_MGR.userId }).catch(() => undefined);
      const pins = await prisma.posStaffPin.deleteMany({ where: { tenantId: T.tenantId, userId: P36U_MGR.userId } });
      const mb = await prisma.membership.deleteMany({ where: { userId: P36U_MGR.userId, tenantId: T.tenantId } });
      return `ลบแถว PIN ${pins.count} · Membership ${mb.count} ของผู้จัดการภาพ`;
    });
  P36U.done = false;
}
async function runP36uState(page: Any, state: P36uKey, device: Device): Promise<void> {
  if (P36U.error) throw new StepError(`fixture P3.6U: ${P36U.error}`);
  if (!P36U.done) throw new StepError("fixture P3.6U ยังไม่ได้สร้าง");
  const has = async (sel: string) => !!(await page.$(sel));
  // fix4: ไม่ถือ element handle ข้าม await — รอด้วย selector แล้วทำในหน้าเว็บคำสั่งเดียว (จอชำระ re-render หลังสถานะวงเงิน/คำปฏิเสธ = handle หลุด)
  const shown = (sel: string, timeout: number, enabled = false) =>
    page
      .waitForFunction(
        (s: string, en: boolean) => {
          const e = document.querySelector(s) as HTMLButtonElement | null;
          return !!e && e.getClientRects().length > 0 && (!en || !e.disabled);
        },
        { timeout },
        sel,
        enabled,
      )
      .catch(() => {
        throw new StepError(`ไม่พบ ${sel}${enabled ? " ที่กดได้" : ""} ภายใน ${Math.round(timeout / 1000)} วิ`);
      });
  const into = async (sel: string, timeout = 20_000) => {
    await shown(sel, timeout);
    await page.$eval(sel, (e: Element) => e.scrollIntoView({ block: "center" }));
  };
  const clickNow = async (sel: string, timeout = 15_000) => {
    await shown(sel, timeout, true);
    await page.$eval(sel, (e: Element) => {
      e.scrollIntoView({ block: "center" });
      (e as HTMLElement).click();
    });
    await sleep(250);
  };
  /** ค่าเดิมคงอยู่ ≥ ms (สถานะวงเงินไม่โหลดซ้ำแล้ว) */
  const settled = async (sel: string, attr: string, want: string, ms = 700, timeout = 20_000) => {
    const until = Date.now() + timeout;
    let since = 0;
    for (;;) {
      const v = await page.$eval(sel, (e: Element, a: string) => e.getAttribute(a), attr).catch(() => null);
      if (v === want) {
        if (!since) since = Date.now();
        if (Date.now() - since >= ms) return;
      } else since = 0;
      if (Date.now() > until) throw new StepError(`${sel} ${attr}=${v} (คาด ${want} นิ่ง ${ms}ms)`);
      await sleep(120);
    }
  };
  const coOf = (k: "co" | "co2"): P36uCo => {
    const c = P36U[k];
    if (!c) throw new StepError(`SKIP — ไม่มีบริษัท ${P36U_CO[k].tag} ของภาพ`);
    return c;
  };
  /** แผ่นเลือกบริษัท (มือถือ = เปิดแผ่นตะกร้าก่อน) */
  const openPicker = async () => {
    const sheetOpen = device === "mobile" && (await visibleEl(page, tid("pos-reg-company-pick"), 0, 800).then(() => true).catch(() => false));
    if (!sheetOpen) await openCartOnMobile(page, device);
    await clickNow(tid("pos-reg-company-pick"));
    await visibleEl(page, tid("pos-reg-company-sheet"), 0, 10_000);
  };
  /** เลือกบริษัทด้วยเลขผู้เสียภาษี (แถวเดียว) → ชิป */
  const pickCompany = async (k: "co" | "co2") => {
    const co = coOf(k);
    await openPicker();
    await typeInto(page, tid("pos-reg-company-search"), P36U_CO[k].taxId);
    // fix4: ผลค้นเลขภาษี = แถวเดียวของบริษัทนี้ และนิ่ง (รายการ "ล่าสุด" ที่มาก่อนถูกแทนแล้ว — ไม่กดแถวที่กำลังจะหลุด)
    const one = () =>
      page.waitForFunction(
        (name: string) => {
          const r0 = document.querySelector('[data-testid="pos-reg-company-row-0"]');
          return !!r0 && (r0.textContent ?? "").includes(name) && !document.querySelector('[data-testid="pos-reg-company-row-1"]');
        },
        { timeout: 15_000 },
        co.name,
      );
    await one().catch(() => {
      throw new StepError(`ค้นเลข ${P36U_CO[k].taxId} แล้วไม่ขึ้นแถวเดียว ${co.name} (registerCompanySearchAction · ระบบ CRM ${P36U.crmSystemId})`);
    });
    await sleep(600);
    await one().catch(() => {
      throw new StepError(`ผลค้น ${P36U_CO[k].taxId} ไม่นิ่ง`);
    });
    await clickNow(tid("pos-reg-company-row-0"));
    await visibleEl(page, tid("pos-reg-company-chip"), 0, 10_000).catch(() => {
      throw new StepError("เลือกบริษัทแล้วไม่ขึ้นชิปบริษัท (pos-reg-company-chip)");
    });
  };
  const closeCartSheet = async () => {
    if (device !== "mobile") return;
    await page.keyboard.press("Escape");
    await sleep(300);
  };
  /** จอชำระ → ไทล์วางบิล → สถานะวงเงินจากเซิร์ฟเวอร์ */
  const openOnAccount = async () => {
    await closeCartSheet();
    await waitPayReady(page);
    await clickPay(page, device);
    await visibleEl(page, tid("pos-reg-paydlg"), 0, 10_000);
    await into(tid("pos-reg-paydlg-method-onaccount"), 10_000).catch(() => {
      throw new StepError("จอชำระไม่มีไทล์วางบิล (เปิดเครดิต · ออนไลน์ · ร้านมี CRM)");
    });
    // สถานะวงเงินโหลดตั้งแต่เปิดจอ (มีบริษัท) — รอให้นิ่งก่อนตัดสินว่าไทล์ปิดไหม
    await sleep(500);
    if (await page.$eval(tid("pos-reg-paydlg-method-onaccount"), (e: Element) => (e as HTMLButtonElement).disabled))
      throw new StepError(`SKIP — ไทล์วางบิลถูกปิด: ${await page.$eval(tid("pos-reg-paydlg-onaccount-reason"), (e: Element) => e.textContent?.trim() ?? "").catch(() => "-")} (สมุดบัญชีไม่ผูก POS / ไม่มีเทอม?)`);
    await clickNow(tid("pos-reg-paydlg-method-onaccount"));
  };
  const waitStatus = async () => {
    await into(`${tid("pos-reg-paydlg-onaccount-status")}[data-state="ok"]`, 20_000).catch(async () => {
      const txt = await page.$eval(tid("pos-reg-paydlg-onaccount-status"), (e: Element) => e.textContent?.trim() ?? "").catch(() => "");
      throw new StepError(`สถานะวงเงินไม่มา (registerCreditStatusAction)${txt ? ` — ${txt.slice(0, 100)}` : ""}`);
    });
    await settled(tid("pos-reg-paydlg-onaccount-status"), "data-state", "ok"); // fix4: นิ่งก่อนกดยืนยัน
    await shown(tid("pos-reg-paydlg-confirm"), 10_000, true);
  };
  const base = async () => {
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
    await ensureShift(page);
    await addCart3(page, device, true);
  };
  switch (state) {
    case "register-company-chip":
      await base();
      await pickCompany("co");
      if (userKey === "cashier" && (await has(tid("pos-reg-deal-select")))) throw new StepError("แคชเชียร์ (ไม่มี crm.deal.update) เห็นตัวเลือกดีล");
      return;
    case "register-company-picker-search":
      await base();
      await openPicker();
      await typeInto(page, tid("pos-reg-company-search"), "ภาพคิวซี");
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pos-reg-company-row-1"]'), { timeout: 15_000 }).catch(() => {
        throw new StepError("ค้น \"ภาพคิวซี\" แล้วไม่ขึ้นบริษัทของภาพ 2 แถว");
      });
      return;
    case "register-company-picker-member":
      if (P36U.memberSkip) throw new StepError(`SKIP — ${P36U.memberSkip}`);
      if (MEMBERX.error) throw new StepError(`SKIP — สมาชิก QC: ${MEMBERX.error}`);
      await base();
      await attachQcMember(page, device, false);
      await openPicker();
      await page
        .waitForFunction((name: string) => (document.querySelector('[data-testid="pos-reg-company-member"]')?.textContent ?? "").includes(name), { timeout: 15_000 }, coOf("co").name)
        .catch(() => {
          throw new StepError("ส่วน \"บริษัทของสมาชิกนี้\" ไม่ขึ้นบริษัท -co (registerMemberCompaniesAction)");
        });
      return;
    case "register-deal-select":
      if (P36U.dealSkip) throw new StepError(`SKIP — ${P36U.dealSkip}`);
      await base();
      await pickCompany("co");
      await into(tid("pos-reg-deal-select"), 15_000).catch(() => {
        throw new StepError("ไม่มีตัวเลือกดีล (registerDealOptionsAction · ดีล OPEN ของ -co)");
      });
      await page.select(tid("pos-reg-deal-select"), P36U.dealId).catch(() => {
        throw new StepError("ตัวเลือกดีลไม่มีดีลของภาพ");
      });
      return;
    case "paydlg-onaccount-owner":
    case "paydlg-onaccount-cashier": {
      await base();
      await pickCompany("co");
      await openOnAccount();
      await waitStatus();
      const rem = await page.$eval(tid("pos-reg-paydlg-onaccount-status"), (e: Element) => e.getAttribute("data-remaining"));
      if (state === "paydlg-onaccount-owner" && rem !== "1") throw new StepError("เจ้าของร้าน (pos.credit.manage) ไม่เห็นวงเงินคงเหลือ");
      if (state === "paydlg-onaccount-cashier" && rem) throw new StepError("แคชเชียร์เห็นวงเงินคงเหลือ (CD-4: ตัวเลขเฉพาะผู้ถือ pos.credit.manage)");
      return;
    }
    case "paydlg-onaccount-buyer": {
      if (TAXINV.error) throw new StepError(`SKIP — สมุด QC: ${TAXINV.error}`);
      const co = coOf("co");
      await base();
      await pickCompany("co");
      await openOnAccount();
      await visibleEl(page, tid("pos-taxinv-dialog"), 0, 10_000).catch(async () => {
        const toast = await page.$eval(tid("pos-reg-toast"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`requireBuyer: กล่อง 15A ไม่เปิด${toast ? ` (ข้อความ: ${toast})` : ""}`);
      });
      const name = await page.$eval(tid("pos-taxinv-name"), (e: Element) => (e as HTMLInputElement).value).catch(() => "");
      if (name !== co.name) throw new StepError(`15A ไม่ได้ตั้งต้นจากบริษัท (ชื่อ "${name}")`);
      await typeInto(page, tid("pos-taxinv-taxid"), TAXINV_BUYER.taxId);
      await typeInto(page, tid("pos-taxinv-address"), TAXINV_BUYER.address);
      await clickNow(tid("pos-taxinv-submit"));
      await page.waitForFunction(() => !document.querySelector('[data-testid="pos-taxinv-dialog"]'), { timeout: 8_000 }).catch(async () => {
        const err = await page.$eval(tid("pos-taxinv-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`บันทึก 15A แล้วกล่องไม่ปิด${err ? ` (${err})` : ""}`);
      });
      await into(tid("pos-reg-paydlg-onaccount-buyer-mismatch"), 10_000).catch(() => {
        throw new StepError("ผู้ซื้อเลขภาษีต่างจากบริษัทแล้วไม่ขึ้นคำเตือน (credit.buyerMismatch)");
      });
      return;
    }
    case "paydlg-onaccount-hidden":
      await base();
      await pickCompany("co");
      await closeCartSheet();
      await waitPayReady(page);
      await clickPay(page, device);
      await visibleEl(page, tid("pos-reg-paydlg"), 0, 10_000);
      await sleep(800);
      if (await has(tid("pos-reg-paydlg-method-onaccount"))) throw new StepError("ปิดวางบิลแล้วยังมีไทล์วางบิล");
      return;
    case "paydlg-credit-over-sheet":
    case "paydlg-credit-over-wrong-pin": {
      await base();
      await pickCompany("co2");
      await openOnAccount();
      await waitStatus();
      await clickNow(tid("pos-reg-paydlg-confirm"));
      await shown(tid("pos-reg-credit-over"), 20_000).catch(() => {
        throw new StepError("ยืนยันวางบิลเกินวงเงินแล้วไม่ขึ้นแผ่น \"เกินวงเงินวางบิล\" (CREDIT_LIMIT_EXCEEDED)");
      });
      await sleep(400);
      if (userKey === "cashier" && (await has(tid("pos-reg-credit-over-figures")))) throw new StepError("แคชเชียร์เห็นตัวเลขวงเงินในแผ่นเกินวงเงิน (CD-4)");
      if (state === "paydlg-credit-over-sheet") return;
      if (!P36U.mgrPin) throw new StepError("ไม่มี PIN ผู้จัดการของภาพ");
      await shown(`${tid("pos-reg-credit-over")} ${tid("pos-mgr-pin-manager")}`, 15_000).catch(() => {
        throw new StepError("แป้นไม่มีรายชื่อผู้จัดการ (listStaffForDeviceAction)");
      });
      const picked = await page.$$eval(`${tid("pos-reg-credit-over")} ${tid("pos-mgr-pin-manager")}`, (els: Element[], name: string) => {
        const b = els.find((e) => (e.textContent ?? "").includes(name)) as HTMLButtonElement | undefined;
        if (!b) return false;
        b.click();
        return true;
      }, P36U_MGR.name);
      if (!picked) throw new StepError("แป้นไม่มีผู้จัดการของภาพ");
      await sleep(250);
      const wrong = String((Number(P36U.mgrPin) + 1) % 1_000_000).padStart(6, "0");
      for (const d of wrong) await clickNow(`${tid("pos-reg-credit-over")} ${tid(`pos-mgr-pin-key-${d}`)}`);
      await visibleEl(page, tid("pos-mgr-pin-error"), 0, 20_000).catch(() => {
        throw new StepError("PIN ผิดแล้วไม่ขึ้นข้อความใต้แป้น (PIN_INVALID)");
      });
      return;
    }
    case "paydone-onaccount-due": {
      const co = coOf("co");
      await base();
      await pickCompany("co");
      await openOnAccount();
      await waitStatus();
      await clickNow(tid("pos-reg-paydlg-confirm"));
      await visibleEl(page, tid("pos-reg-done"), 0, 25_000).catch(async () => {
        const err = await page.$eval(tid("pos-reg-paydlg-error"), (e: Element) => e.textContent?.slice(0, 120) ?? "").catch(() => "");
        throw new StepError(`ยืนยันวางบิลแล้วไม่ขึ้นจอสำเร็จ${err ? ` (${err})` : ""}`);
      });
      const s = await prisma.posSale.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, customerPartyId: co.partyId, status: "PAID", createdAt: { gte: RUN_STARTED } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (s) {
        P36U.saleIds.push(s.id);
        P36U_SALE.id = s.id;
        P36U.log.push(`บิลวางบิล ${s.id} (-co)`);
      }
      await visibleEl(page, tid("pos-reg-done-due"), 0, 10_000).catch(() => {
        throw new StepError("จอสำเร็จไม่มีชิปครบกำหนด (pos-reg-done-due)");
      });
      return;
    }
    case "bills-drawer-onaccount":
    case "bills-refund-onaccount": {
      if (!P36U_SALE.id) throw new StepError("SKIP — ไม่มีบิลวางบิลของวันนี้ (paydone-onaccount-due ยังไม่ได้ถ่ายในรอบนี้)");
      await visibleEl(page, tid("pos-bills-drawer"), 0, 20_000).catch(() => {
        throw new StepError("?bill= ไม่เปิดลิ้นชักบิลวางบิล");
      });
      if (state === "bills-drawer-onaccount") {
        await into(tid("pos-bills-credit-invoice"), 15_000).catch(() => {
          throw new StepError("SKIP — ลิ้นชักไม่มีแถวใบแจ้งหนี้ (บิลยังไม่ลงบัญชี / POS ไม่ผูกสมุด)");
        });
        if (await has(tid("pos-taxinv-request-full"))) throw new StepError("บิลวางบิลยังมีปุ่มขอใบเต็มรูป (W23)");
        return;
      }
      if (userKey !== "owner") throw new StepError("คืนเงิน = เจ้าของร้าน");
      await clickNow(tid("pos-bills-refund-open"));
      await visibleEl(page, tid("pos-bills-refund-line"), 0, 15_000).catch(() => {
        throw new StepError("หน้าต่างคืนเงินไม่ขึ้นรายการ (pos-bills-refund-line)");
      });
      await clickNow(tid("pos-bills-refund-line"));
      await into(tid("pos-bills-refund-m-onaccount"), 10_000).catch(() => {
        throw new StepError("แผ่นคืนเงินของบิลวางบิลไม่มีชิป \"วางบิล (ลดหนี้)\"");
      });
      if (await has(tid("pos-bills-refund-method-cash"))) throw new StepError("บิลวางบิลยังมีชิปคืนเงินสด");
      return;
    }
    case "reports-credit-owner":
      await visibleEl(page, tid("pos-reports-tab-credit"), 0, 20_000).catch(() => {
        throw new StepError("ไม่มีแท็บลูกหนี้ลูกค้าองค์กร (creditOn)");
      });
      await page.waitForFunction(() => !!document.querySelector('[data-testid="pos-reports-credit"],[data-testid="pos-report-empty"]'), { timeout: 20_000 }).catch(() => {
        throw new StepError("รายงานลูกหนี้ไม่โหลด (posReportAction kind=credit)");
      });
      if (await has(tid("pos-reports-credit-denied"))) throw new StepError("เจ้าของร้านได้การ์ดปฏิเสธ");
      return;
    case "reports-credit-denied":
      await visibleEl(page, tid("pos-reports-credit-denied"), 0, 20_000).catch(() => {
        throw new StepError("แคชเชียร์ไม่ได้การ์ดปฏิเสธของรายงานลูกหนี้");
      });
      return;
    case "settings-credit-card-off":
    case "settings-credit-card-on":
    case "settings-credit-readonly": {
      await into(tid("pos-settings-credit-card"));
      const on = await page.$eval(tid("pos-settings-credit-enabled"), (e: Element) => e.getAttribute("aria-checked"));
      if (state === "settings-credit-card-off") {
        if (on !== "false") throw new StepError(`สวิตช์วางบิล aria-checked=${on} (คาด false)`);
        if (!(await has(tid("pos-settings-credit-all-off")))) throw new StepError("ปิดวางบิลแล้วไม่มีกรอบเส้นประ allOff");
        return;
      }
      if (on !== "true") throw new StepError(`สวิตช์วางบิล aria-checked=${on} (คาด true)`);
      if (state === "settings-credit-readonly") {
        if (!(await has(tid("pos-settings-credit-owner-only")))) throw new StepError("แคชเชียร์ไม่เห็น \"เจ้าของร้านเท่านั้น\"");
        if (!(await has(tid("pos-settings-credit-no-permission")))) throw new StepError("แคชเชียร์ไม่เห็นข้อความไม่มีสิทธิ์ตั้งวงเงิน");
        if ((await page.$eval(tid("pos-settings-credit-enabled"), (e: Element) => e.getAttribute("aria-disabled"))) !== "true") throw new StepError("สวิตช์ของแคชเชียร์ไม่ aria-disabled");
        return;
      }
      for (const k of ["co", "co2"] as const) {
        const c = P36U[k];
        if (c && !(await has(tid(`pos-settings-credit-row-${c.partyId}`)))) throw new StepError(`ไม่มีแถวบัญชีเครดิตของ ${P36U_CO[k].tag}${(await has(tid("pos-settings-credit-no-crm"))) ? " (การ์ดบอกไม่มี CRM)" : ""}`);
      }
      return;
    }
    case "settings-credit-account-invalid": {
      const co = coOf("co");
      await into(tid(`pos-settings-credit-edit-${co.partyId}`));
      await clickNow(tid(`pos-settings-credit-edit-${co.partyId}`));
      await typeInto(page, tid("pos-settings-credit-term"), "400");
      await clickNow(tid("pos-settings-credit-save"));
      await into(tid("pos-settings-credit-error"), 15_000).catch(() => {
        throw new StepError("เทอม 400 วันแล้วไม่ขึ้นข้อความปฏิเสธในฟอร์ม (saveCreditAccount VALIDATION)");
      });
      return;
    }
    case "settings-orders-member-on-bill": {
      await into(tid("pos-settings-order-member"));
      const on = await page.$eval(tid("pos-settings-order-member-switch"), (e: Element) => e.getAttribute("aria-checked"));
      if (on !== "true") throw new StepError(`สวิตช์สมาชิกบนบิลออเดอร์ aria-checked=${on} (คาด true)`);
      return;
    }
  }
}
// ◂ POS P3.6U

// ═══════════════════ POS P3.5U ▸ HR: ชิปตารางงาน 13B · ผู้จัดการอนุญาตนอกเวลา · รายชื่อ 13A · 17C · ลงเวลา/ชั่วโมง 07 · ค่าคอมฯ 08 (มติ 10) ═══════════════════
// fixture (ensureP35uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • ระบบ HR ชั่วคราวของร้าน QC "ทีมงาน (ภาพ QC P3.5U <pid>)" ผ่าน system/service.createSystem (ร้าน QC ไม่มีระบบ HR · ซากของ pid ที่ตายแล้ว = กวาดก่อน) ·
//     พนักงาน 2 คนผ่าน hr/service.createEmployee + ผูก linkedUserId ของเจ้าของ/แคชเชียร์ QC (ทางเดียวกับ qc-pos-p3.5 — ฐานไม่มีตัวเขียน) ·
//     ตาราง (setSchedule · แถวของวันนี้ตามเวลาไทยจริง) · ใบลา (requestLeave + decideLeave APPROVED) — ต่อสถานะ: in = ช่วงครอบตอนนี้ · out = ห่างตอนนี้ ≥ 1 ชม. · leave
//   • ค่าตั้ง POS: ด่านตารางงานเปิด (30/30/240) + clockOnShift ASK ผ่าน updatePosStaffSettings · ค่าคอมฯ (ปกติ 2% · หมวดของลาเต้ 3% · ลาเต้ 5% + ฿5/ชิ้น)
//     ผ่าน updatePosStaffCommission — ค่าเดิมของ settings.pos.staff / settings.pos.staffCommission จำไว้ คืนแบบคีย์ตรงตัว (ไม่มีเดิม = ลบคีย์) ตอนเก็บกวาด
//   • ชั่วโมงของกะ (07): 2 กะของเจ้าของบนเครื่อง posqc-vis-p35uh-<pid> (openShift/closeShift) เลื่อน openedAt/closedAt ย้อนหลัง — กะเตือน (ไม่มีลงเวลา ⇒ NO_CLOCK_IN) ·
//     กะชั่วโมง (clock IN/OUT ของ HR แล้วเลื่อน at เข้าในกะ ⇒ workedMin ไม่มีเตือน)
//   • ค่าคอมฯ 08: บิลวันนี้ 1 ใบ ผู้ขาย = แคชเชียร์ (createSale คีย์ต่อวัน) → staffCommissionOnSalePaid (ตัวรับเดิม) ⇒ แถว ACCRUE
//   เก็บกวาด (งานสุดท้าย/finally/สัญญาณ): ปิดกะของรอบ · คืนค่าตั้ง · ลบแถว PosStaffCommission ของบิล fixture · ลบเวลา/ใบลา/ตาราง/พนักงาน/ระบบ HR ของรอบ ·
//   ล้างตัวนับ PIN ผิดของเจ้าของ (13b-override-wrong-pin) · บิล fixture คงอยู่ (แบบ sale-done) · ไม่ใช้ seed-hr-qc ไม่ reseed QC4 ◂
const P35U_HR_PREFIX = "ทีมงาน (ภาพ QC P3.5U ";
const P35U_HDEV = `posqc-vis-p35uh-${process.pid}`;
const P35U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  hrSystemId: "",
  emp: { owner: "", cashier: "" },
  sched: "" as "" | "in" | "out" | "leave",
  staffBefore: undefined as unknown,
  commissionBefore: undefined as unknown,
  settingsTouched: false,
  hoursShift: "",
  warnShift: "",
  saleIds: [] as string[],
};
const p35uHrCtx = () => ({ tenantId: T.tenantId, systemId: P35U.hrSystemId });
/** นาทีของวันเวลาไทย + วันในสัปดาห์ (0 = อาทิตย์ · แบบ hr/service.bkkParts) */
const p35uNow = () => {
  const d = new Date(Date.now() + 7 * 3_600_000);
  return { minute: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay(), day: d.toISOString().slice(0, 10) };
};
/** ลบระบบ HR ของภาพ (เวลา · ใบลา · ตาราง · พนักงาน · ลิงก์สาขา · ระบบ) — เขียนตรงเฉพาะแถวของระบบนี้ */
async function p35uDropHr(systemId: string): Promise<void> {
  const where = { tenantId: T.tenantId, systemId };
  await prisma.hrAttendance.deleteMany({ where });
  await prisma.hrLeave.deleteMany({ where });
  await prisma.hrWorkSchedule.deleteMany({ where });
  await prisma.hrEmployee.deleteMany({ where });
  await prisma.appSystemUnit.deleteMany({ where: { tenantId: T.tenantId, systemId } });
  await prisma.appSystem.deleteMany({ where: { id: systemId, tenantId: T.tenantId, type: "HR" } });
}
/** ตารางวันนี้ของแคชเชียร์ตามสถานะ (in/out/leave) — แถวของวันในสัปดาห์นี้แถวเดียว (วันข้างเคียงไม่มีแถว = ไม่ครอบ) */
async function p35uCashier(mode: "in" | "out" | "leave"): Promise<void> {
  if (P35U.sched === mode) return;
  const hr = await import("@/lib/modules/hr/service");
  const n = p35uNow();
  const inRow = { weekday: n.weekday, dayOff: false, startMin: Math.max(0, n.minute - 120), endMin: Math.min(1439, Math.max(n.minute + 240, Math.max(0, n.minute - 120) + 30)), graceMin: 0 };
  const outRow = n.minute >= 720 ? { weekday: n.weekday, dayOff: false, startMin: 60, endMin: 180, graceMin: 0 } : { weekday: n.weekday, dayOff: false, startMin: 1260, endMin: 1380, graceMin: 0 };
  await prisma.hrLeave.deleteMany({ where: { tenantId: T.tenantId, systemId: P35U.hrSystemId, employeeId: P35U.emp.cashier } });
  const r = await hr.setSchedule(p35uHrCtx(), P35U.emp.cashier, [mode === "out" ? outRow : inRow]);
  if (!r.ok) throw new StepError(`setSchedule แคชเชียร์ (${mode}): ${r.reason ?? "?"}`);
  if (mode === "leave") {
    const l = await hr.requestLeave(p35uHrCtx(), { employeeId: P35U.emp.cashier, type: "PERSONAL", fromDate: n.day, toDate: n.day, reason: "ภาพ QC P3.5U" });
    await hr.decideLeave(p35uHrCtx(), l.id, "APPROVED");
  }
  P35U.sched = mode;
}
async function ensureP35uFixture(): Promise<void> {
  if (P35U.done || P35U.error) return;
  try {
    const want = (...ks: P35uKey[]) => ks.some((k) => jobs.some((j) => j.state === k));
    const owner = await ownerActor();
    // ซากของรอบที่ถูก kill (pid ไม่อยู่แล้ว)
    const stale = await prisma.appSystem.findMany({ where: { tenantId: T.tenantId, type: "HR", name: { startsWith: P35U_HR_PREFIX } }, select: { id: true, name: true } });
    for (const s of stale) {
      const pid = Number(/(\d+)\)$/.exec(s.name)?.[1] ?? 0);
      let alive = false;
      try {
        alive = pid > 0 && pid !== process.pid && process.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (!alive && pid !== process.pid) {
        await p35uDropHr(s.id);
        P35U.log.push(`กวาดระบบ HR ซาก ${s.id}`);
      }
    }
    const { createSystem } = await import("@/lib/modules/system/service");
    P35U.hrSystemId = (await createSystem(T.tenantId, "HR", `${P35U_HR_PREFIX}${process.pid})`)).id;
    const hr = await import("@/lib/modules/hr/service");
    for (const k of ["owner", "cashier"] as const) {
      const e = await hr.createEmployee(p35uHrCtx(), { name: `${T.users[k].name} (ภาพ QC)` });
      P35U.emp[k] = e.id;
      await prisma.hrEmployee.updateMany({ where: { id: e.id, tenantId: T.tenantId }, data: { linkedUserId: T.users[k].userId } });
    }
    const n = p35uNow();
    const ownRow = { weekday: n.weekday, dayOff: false, startMin: Math.max(0, n.minute - 180), endMin: Math.min(1439, Math.max(n.minute + 180, Math.max(0, n.minute - 180) + 30)), graceMin: 0 };
    const so = await hr.setSchedule(p35uHrCtx(), P35U.emp.owner, [ownRow]);
    if (!so.ok) throw new StepError(`setSchedule เจ้าของ: ${so.reason ?? "?"}`);
    await p35uCashier("in");
    P35U.log.push(`ระบบ HR ${P35U.hrSystemId} · พนักงาน 2 คน (ผูกเจ้าของ/แคชเชียร์ QC)`);
    // ค่าตั้ง POS (จำค่าเดิมของคีย์ตรงตัว)
    const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
    const pos = ((sys?.settings as Record<string, unknown> | null)?.pos ?? {}) as Record<string, unknown>;
    P35U.staffBefore = pos.staff;
    P35U.commissionBefore = pos.staffCommission;
    P35U.settingsTouched = true;
    const { updatePosStaffSettings, updatePosStaffCommission } = await import("@/lib/modules/pos/settings-general");
    const g = await updatePosStaffSettings({ tenantId: T.tenantId, systemId: SYS }, owner, { scheduleGate: { enabled: true, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 }, clockOnShift: "ASK" });
    if (!g.ok) throw new StepError(`updatePosStaffSettings: ${g.code}`);
    const latte = QC_IDS.latte ? await prisma.posProduct.findFirst({ where: { id: QC_IDS.latte, tenantId: T.tenantId }, select: { id: true, categoryId: true } }) : null;
    const c = await updatePosStaffCommission({ tenantId: T.tenantId, systemId: SYS }, owner, {
      enabled: true,
      defaultBp: 200,
      sellerRoles: ["STAFF", "MANAGER"],
      byCategory: latte?.categoryId ? { [latte.categoryId]: { bp: 300 } } : {},
      byProduct: latte ? { [latte.id]: { bp: 500, fixedSatang: 500 } } : {},
    });
    if (!c.ok) throw new StepError(`updatePosStaffCommission: ${c.code} ${c.field ?? ""}`);
    P35U.log.push("ด่านตารางงานเปิด 30/30/240 · ถามลงเวลา ASK · ค่าคอมฯ 2% (+ หมวดลาเต้ 3% · ลาเต้ 5% + ฿5)");
    // ชั่วโมงของกะ (07)
    if (want("07-shift-hours-owner", "07-shift-hours-warnings")) {
      const { openShift } = await import("@/lib/modules/pos/shift");
      const ctx = { tenantId: T.tenantId, systemId: SYS, unitId };
      const mk = async (fromMin: number, toMin: number, tag: string): Promise<string> => {
        const o = await openShift(ctx, owner, { deviceId: P35U_HDEV, floatSatang: 0 });
        if (!o.ok) throw new StepError(`openShift (${tag}): ${o.code}`);
        const cl = await closeShiftAsOwner(o.shift.id, `p35u-${tag}`);
        if (!cl.ok) throw new StepError(`closeShift (${tag}): ${cl.detail}`);
        await prisma.posShift.update({ where: { id: o.shift.id }, data: { openedAt: new Date(Date.now() - fromMin * 60_000), closedAt: new Date(Date.now() - toMin * 60_000) } });
        return o.shift.id;
      };
      P35U.warnShift = await mk(300, 240, "warn");
      P35U.hoursShift = await mk(180, 60, "hours");
      const inA = await hr.clock(p35uHrCtx(), { employeeId: P35U.emp.owner, kind: "IN", note: "ภาพ QC P3.5U" });
      const outA = await hr.clock(p35uHrCtx(), { employeeId: P35U.emp.owner, kind: "OUT", note: "ภาพ QC P3.5U" });
      await prisma.hrAttendance.update({ where: { id: inA.id }, data: { at: new Date(Date.now() - 175 * 60_000) } });
      await prisma.hrAttendance.update({ where: { id: outA.id }, data: { at: new Date(Date.now() - 65 * 60_000) } });
      P35U.log.push(`กะเตือน ${P35U.warnShift} (−5:00…−4:00 · ไม่มีลงเวลา) · กะชั่วโมง ${P35U.hoursShift} (−3:00…−1:00 · IN −2:55 · OUT −1:05)`);
    }
    // ค่าคอมฯ 08
    if (want("08-report-commission-owner")) {
      const { createSale } = await import("@/lib/modules/pos/service");
      const r = await createSale({
        tenantId: T.tenantId,
        unitId,
        systemId: SYS,
        sourceModule: "POS",
        shiftId: null,
        soldByUserId: T.users.cashier.userId,
        idempotencyKey: `${FIX.prefix}p35u-comm-${n.day}`,
        lines: [{ name: `ลาเต้เย็น ${BILL_TAG}`, qty: 2, unitPriceSatang: 7500 }],
        payMethods: [{ type: "CASH", amountSatang: 15000 }],
      } as never);
      const saleId = (r as { saleId: string }).saleId;
      P35U.saleIds.push(saleId);
      const { staffCommissionOnSalePaid } = await import("@/lib/modules/pos/staff-commission");
      await staffCommissionOnSalePaid({ tenantId: T.tenantId, payload: { saleId } } as never);
      const rows = await prisma.posStaffCommission.count({ where: { tenantId: T.tenantId, saleId } });
      P35U.log.push(`บิลค่าคอมฯ ${saleId} (ผู้ขาย แคชเชียร์) → แถว ACCRUE ${rows}`);
    }
    P35U.done = true;
  } catch (e) {
    P35U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** ก่อนเปิดหน้าของแต่ละงาน: ตารางของแคชเชียร์ตามสถานะ · กะของเครื่องหน้ากะ · โทเคนเจ้าของของเครื่องหน้ากะ */
async function prepP35u(page: Any, state: P35uKey): Promise<void> {
  if (!P35U.done) return;
  try {
    if (state === "13b-schedule-chip-leave") await p35uCashier("leave");
    else if (state === "13b-offschedule-refusal" || state === "13b-override-sheet" || state === "13b-override-wrong-pin") await p35uCashier("out");
    else await p35uCashier("in");
    if (state === "13b-override-wrong-pin") await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: T.users.owner.userId }, data: { failedCount: 0, lockedUntil: null } });
    const page35 = P35U_PLAN.find((x) => x.key === state)?.page;
    if (page35 === "shifts" && userKey === "owner") {
      if (state !== "07-shift-clock-ask-out") {
        const open = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: SHIFTS_DEVICE_ID, status: "OPEN" }, select: { id: true } });
        if (open) await closeShiftAsOwner(open.id, `p35u-prep-${Date.now()}`);
      }
      await registerShiftsDeviceOnce();
      const json = await staffSessionJson("owner", SHIFTS_DEVICE_ID);
      if (!json) throw new StepError(`ออกโทเคนเจ้าของของเครื่อง ${SHIFTS_DEVICE_ID} ไม่ได้`);
      await injectStaff(page, SHIFTS_DEVICE_ID, json);
    }
  } catch (e) {
    P35U.error = `เตรียม ${state}: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
  }
}
/** หลังงาน P3.5U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน */
async function cleanupP35u(): Promise<void> {
  if (P35U.cleaned) return;
  P35U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string | void>) => {
    try {
      const s = await fn();
      if (s) P35U.log.push(s);
    } catch (e) {
      P35U.ok = false;
      P35U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  await step("ปิดกะของรอบ", async () => {
    const open = await prisma.posShift.findMany({ where: { tenantId: T.tenantId, unitId, systemId: SYS, deviceId: { in: [SHIFTS_DEVICE_ID, P35U_HDEV] }, status: "OPEN" }, select: { id: true } });
    for (const o of open) await closeShiftAsOwner(o.id, `p35u-clean-${o.id.slice(-6)}`);
    return open.length ? `ปิดกะค้าง ${open.length}` : undefined;
  });
  if (P35U.settingsTouched)
    await step("คืนค่าตั้ง POS", async () => {
      await prisma.$transaction(async (tx) => {
        const sys = await tx.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
        const settings = { ...((sys?.settings as Record<string, unknown> | null) ?? {}) };
        const pos = { ...((settings.pos as Record<string, unknown> | undefined) ?? {}) };
        if (P35U.staffBefore === undefined) delete pos.staff;
        else pos.staff = P35U.staffBefore;
        if (P35U.commissionBefore === undefined) delete pos.staffCommission;
        else pos.staffCommission = P35U.commissionBefore;
        await tx.appSystem.update({ where: { id: SYS }, data: { settings: { ...settings, pos } as never } });
      });
      return "คืนค่าตั้ง settings.pos.staff / staffCommission เดิม";
    });
  if (P35U.saleIds.length)
    await step("ลบแถวค่าคอมฯ", async () => `ลบแถว PosStaffCommission ${(await prisma.posStaffCommission.deleteMany({ where: { tenantId: T.tenantId, saleId: { in: P35U.saleIds } } })).count}`);
  await step("ล้างตัวนับ PIN เจ้าของ", async () => {
    await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: T.users.owner.userId }, data: { failedCount: 0, lockedUntil: null } });
  });
  if (P35U.hrSystemId)
    await step("ลบระบบ HR ของรอบ", async () => {
      await p35uDropHr(P35U.hrSystemId);
      return `ลบระบบ HR ${P35U.hrSystemId} (พนักงาน/ตาราง/ใบลา/เวลา)`;
    });
}
async function runP35uState(page: Any, state: P35uKey, device: Device): Promise<void> {
  if (P35U.error) throw new StepError(`fixture P3.5U: ${P35U.error}`);
  if (!P35U.done) throw new StepError("fixture P3.5U ยังไม่ได้สร้าง");
  const into = async (sel: string, block: "start" | "center" = "center") => {
    const el = await visibleEl(page, sel, 0, 20_000);
    await el.evaluate((e: Element, b: string) => e.scrollIntoView({ block: b as "start" | "center" }), block);
    await sleep(200);
    return el;
  };
  const cashierId = T.users.cashier.userId;
  const lockAndPickCashier = async () => {
    if (P115.error || !P115.seeded) throw new StepError(`ไม่มีข้อมูลภาพ P1.15U: ${P115.error ?? "ยังไม่ได้สร้าง"}`);
    await lockFromRegister(page, device);
    const cards = await page.$$(tid("pos-staff-card"));
    let hit = false;
    for (const c of cards) {
      if (String(await c.evaluate((n: Element) => n.textContent ?? "")).includes(T.users.cashier.name)) {
        await c.evaluate((n: Element) => n.scrollIntoView({ block: "center" }));
        await c.click();
        hit = true;
        break;
      }
    }
    if (!hit) throw new StepError("จอล็อกไม่มีการ์ดแคชเชียร์");
    await sleep(300);
  };
  const offSchedule = async () => {
    await lockAndPickCashier();
    if (!P115.pins.cashier) throw new StepError("ไม่มี PIN ของแคชเชียร์ (seedP115Once)");
    await clickPinDigits(page, P115.pins.cashier);
    await visibleEl(page, tid("pos-lock-override-open"), 0, 15_000).catch(() => {
      throw new StepError("PIN แคชเชียร์นอกตารางแล้วไม่เห็นปุ่ม \"ให้ผู้จัดการอนุญาต\" (pos-lock-override-open)");
    });
  };
  switch (state) {
    case "13b-schedule-chip-today":
    case "13b-schedule-chip-leave": {
      await lockFromRegister(page, device);
      const chip = await into(tid(`pos-lock-schedule-chip-${cashierId}`));
      const kind = (await chip.evaluate((e: Element) => e.getAttribute("data-chip"))) as string | null;
      const wantKind = state === "13b-schedule-chip-leave" ? "leave" : "today";
      if (kind !== wantKind) throw new StepError(`ชิปของแคชเชียร์ = ${kind} (คาด ${wantKind})`);
      return;
    }
    case "13b-offschedule-refusal":
      await offSchedule();
      return;
    case "13b-override-sheet":
      await offSchedule();
      await clickEl(page, tid("pos-lock-override-open"));
      await visibleEl(page, tid("pos-lock-override-sheet"), 0, 10_000);
      await visibleEl(page, tid("pos-mgr-pin-dots"), 0, 10_000);
      return;
    case "13b-override-wrong-pin": {
      await offSchedule();
      await clickEl(page, tid("pos-lock-override-open"));
      await visibleEl(page, tid("pos-lock-override-sheet"), 0, 10_000);
      const own = P115.pins.owner ?? "";
      // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P35U-V2 · vis-p35u4): รายชื่อผู้จัดการโหลดแบบ async (ManagerPinPad managers === null → "กำลังโหลด") — รอให้ปรากฏก่อนอ่าน ไม่งั้น race แดงปลอม (3/7 ภาพ) ◂
      await visibleEl(page, tid("pos-mgr-pin-manager"), 0, 10_000).catch(() => {
        throw new StepError("แผ่นผู้จัดการไม่มีรายชื่อผู้จัดการ (pos-mgr-pin-manager) หลังรอ 10 วิ");
      });
      const managers = await page.$$(tid("pos-mgr-pin-manager"));
      if (!managers.length) throw new StepError("แผ่นผู้จัดการไม่มีรายชื่อผู้จัดการ (pos-mgr-pin-manager)");
      if (managers.length > 1) await managers[0].click();
      const wrong = own ? `${(Number(own[0]) + 1) % 10}${own.slice(1)}` : "908172";
      for (const d of wrong) await clickEl(page, tid(`pos-mgr-pin-key-${d}`));
      await visibleEl(page, tid("pos-mgr-pin-error"), 0, 15_000).catch(() => {
        throw new StepError("PIN ผู้จัดการผิดแล้วไม่เห็นข้อความ (pos-mgr-pin-error)");
      });
      await prisma.posStaffPin.updateMany({ where: { tenantId: T.tenantId, unitId, userId: T.users.owner.userId }, data: { failedCount: 0, lockedUntil: null } });
      return;
    }
    case "13a-shift-list-hr":
      await clickEl(page, tid("pos-shift-open-start"));
      await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
      await visibleEl(page, tid(`pos-shift-open-staff-${cashierId}`), 0, 15_000).catch(() => {
        throw new StepError("กล่องเปิดกะไม่มีรายชื่อจากตารางงาน HR (pos-shift-open-staff-<แคชเชียร์>)");
      });
      return;
    case "07-shift-clock-ask-in":
      await clickEl(page, tid("pos-shift-open-start"));
      await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
      await clickEl(page, tid("pos-shift-open-submit"));
      await visibleEl(page, tid("pos-shift-clock-sheet"), 0, 20_000).catch(() => {
        throw new StepError("เปิดกะแล้วไม่เห็นแผ่นถามลงเวลาเข้างาน (pos-shift-clock-sheet)");
      });
      return;
    case "07-shift-clock-ask-out": {
      const cur = await visibleEl(page, tid("pos-shift-current"), 0, 4_000).then(() => true).catch(() => false);
      if (!cur) {
        await clickEl(page, tid("pos-shift-open-start"));
        await visibleEl(page, tid("pos-shift-open-dialog"), 0, 10_000);
        await clickEl(page, tid("pos-shift-open-submit"));
        const sk = await visibleEl(page, tid("pos-shift-clock-skip"), 0, 15_000).catch(() => null);
        if (sk) await clickEl(page, tid("pos-shift-clock-skip"));
        await visibleEl(page, tid("pos-shift-current"), 0, 15_000);
      }
      await into(tid("pos-shift-close"));
      await typeInto(page, tid("pos-shift-close-coins"), "0");
      await sleep(300);
      await clickEl(page, tid("pos-shift-close-submit"));
      await visibleEl(page, tid("pos-shift-clock-sheet"), 0, 20_000).catch(() => {
        throw new StepError("ปิดกะแล้วไม่เห็นแผ่นถามลงเวลาออกงาน (pos-shift-clock-sheet)");
      });
      return;
    }
    case "07-shift-hours-owner":
    case "07-shift-hours-warnings": {
      const id = state === "07-shift-hours-owner" ? P35U.hoursShift : P35U.warnShift;
      if (!id) throw new StepError("ไม่มีกะ fixture ของชั่วโมง");
      const all = await page.$(tid("pos-shift-closed-all"));
      if (all && (await all.evaluate((e: Element) => e.getAttribute("aria-expanded"))) !== "true") await clickEl(page, tid("pos-shift-closed-all"));
      const el = await into(tid(`pos-shift-hours-${id}`));
      const w = String((await el.evaluate((e: Element) => e.getAttribute("data-warnings"))) ?? "");
      if (state === "07-shift-hours-owner" && w) throw new StepError(`กะชั่วโมงมีเตือน "${w}" (คาดไม่มี)`);
      if (state === "07-shift-hours-warnings" && !w.includes("NO_CLOCK_IN")) throw new StepError(`กะเตือนมีเตือน "${w}" (คาด NO_CLOCK_IN)`);
      return;
    }
    case "17c-staff-hr-switch-owner": {
      const sw = await into(tid("pos-settings-staff-hr-switch"));
      const a = (await sw.evaluate((e: Element) => [e.getAttribute("aria-checked"), e.getAttribute("aria-disabled")])) as [string | null, string | null];
      if (a[0] !== "true" || a[1] === "true") throw new StepError(`สวิตช์ HR aria-checked=${a[0]} aria-disabled=${a[1]} (คาด true/false)`);
      return;
    }
    case "17c-staff-schedule-gate-card": {
      await into(tid("pos-settings-staff-gate"), "start");
      const v = (await page.$eval(tid("pos-settings-staff-gate-early"), (e: Element) => (e as HTMLInputElement).value)) as string;
      if (v !== "30") throw new StepError(`ช่องเข้าก่อนเวลา = "${v}" (คาด 30)`);
      return;
    }
    case "17c-staff-commission-card": {
      await into(tid("pos-settings-staff-commission"), "start");
      const v = (await page.$eval(tid("pos-settings-staff-commission-default"), (e: Element) => (e as HTMLInputElement).value)) as string;
      if (v !== "2") throw new StepError(`อัตราปกติ = "${v}" (คาด 2)`);
      // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P35U-V1 · vis-p35u4): แคตตาล็อกโหลดแล้วอาจ "ยังไม่มีหมวดสินค้า" (ร้าน QC coffee บน QC5 ไม่มีหมวด) — การ์ดเรนเดอร์ถูกต้อง ⇒ ยอมรับข้อความ noCategories (th/en) ด้วย · ยังแดงเมื่อค้าง "กำลังโหลด" หรือ catalogUnavailable ไม่มี product-count ◂
      await page.waitForFunction(() => {
        if (document.querySelector('[data-testid^="pos-settings-staff-commission-cat-bp-"], [data-testid="pos-settings-staff-commission-product-count"]')) return true;
        const card = document.querySelector('[data-testid="pos-settings-staff-commission"]');
        const txt = (card ?? document.body).textContent ?? "";
        return txt.includes("ยังไม่มีหมวดสินค้า") || txt.includes("No categories yet");
      }, { timeout: 15_000 }).catch(() => {
        throw new StepError("การ์ดค่าคอมฯ ไม่มีแถวหมวด/จำนวนอัตรา/ข้อความไม่มีหมวด (แคตตาล็อกไม่โหลด)");
      });
      return;
    }
    case "08-report-commission-owner":
      await visibleEl(page, tid("pos-reports-commission"), 0, 20_000).catch(() => {
        throw new StepError("แท็บค่าคอมฯ ไม่มีตาราง (pos-reports-commission)");
      });
      await visibleEl(page, tid("pos-report-table-total"), 0, 10_000);
      return;
    case "08-report-commission-denied":
      await visibleEl(page, `${tid("pos-report-refusal")},${tid("pos-reports-commission-denied")}`, 0, 20_000);
      return;
  }
}
// ◂ POS P3.5U
// ═══════════════════ POS P3.4U ▸ ออฟไลน์ 19ง: ขายเงินสด/โอนออฟไลน์ · คิว + ซิงก์ · สลิปชั่วคราว · PIN ออฟไลน์ · คิวผู้จัดการ · สวิตช์
// fixture (ensureP34uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • ธง settings.pos.offline.enabled = true ผ่าน updatePosOfflineEnabled (เจ้าของ) — จำค่าเดิม · คืนหลังงานสุดท้าย/finally/สัญญาณ
//     (ซากของรอบที่ถูก kill = แถวคิวผู้จัดการคำนำหน้า posqcvisp34u ค้าง ⇒ ทิ้ง + คืนธงเป็นปิด)
//   • offline-rejected / settings-offline-live: snapshot ของเครื่องรอบนี้ (issueOfflineSnapshot) + บิลราคาปลอม 1 ใบผ่าน syncOfflineSales
//     (เลข OFF ของเครื่อง · โทเคนเจ้าของ · ราคาต่ำกว่าจริง ฿10) → REJECTED PRICE_MISMATCH = แถวคิวผู้จัดการ · ทิ้ง (discardOfflineSale) ตอนเก็บกวาด
// ต่อสถานะ: browser context ใหม่ (ลูปหลัก) · ลบ snapshot ของเครื่องรอบนี้ที่ออกภายใน 2 นาที (เพดาน 1 ใบ/เครื่อง/60 วิ ของ /api/pos/sync/snapshot —
//   ไม่งั้นสถานะถัดไปดึงราคาไม่ได้) · บิลออฟไลน์ที่ไม่ซิงก์ตายไปพร้อม context (ไม่มีแถวฝั่งเซิร์ฟเวอร์) · offline-sync-back = บิลจริง 1 ใบในกะของรอบ
const P34U_KEY_PREFIX = "posqcvisp34u";
const P34U = {
  done: false,
  error: null as string | null,
  ok: true,
  cleaned: false,
  log: [] as string[],
  flagTouched: false,
  flagBefore: false,
  rejectedId: "",
  snapHash: "",
};
const p34uCtx = () => ({ tenantId: T.tenantId, systemId: SYS, unitId, deviceId: DEVICE_ID });
const P34U_DB = () => `shark-pos-off:${SYS}:${unitId}`;
/**
 * เพดานอัตรา snapshot (1 ใบ/เครื่อง/60 วิ ของ S — ไม่แตะกฎ): ก่อนแต่ละภาพ ลบใบของเครื่องรอบนี้ที่ออกภายใน 2 นาที ⇒ การดึงตอนโหลดหน้าของภาพนี้ได้ 200 ·
 * fix2: ไม่ยกเว้นใบของ fixture อีกแล้ว (ใบนั้นทำให้สถานะแรกได้ 429) — ปลอดภัยเพราะบิลของภาพก่อน ๆ ตายไปกับ context หรือซิงก์จบแล้ว และหลักฐานราคาของ
 * แถวคิวผู้จัดการถูกแช่ไว้ใน payload ตั้งแต่ครั้งแรก · ห้ามลบระหว่างภาพ: บิลที่ยังไม่ซิงก์ต้องมี snapshot ของตัวเอง (ไม่มี = SNAPSHOT_UNKNOWN)
 */
async function p34uClearSnapRate(): Promise<void> {
  await prisma.posOfflineSnapshot.deleteMany({ where: { tenantId: T.tenantId, unitId, deviceId: DEVICE_ID, issuedAt: { gt: new Date(Date.now() - 120_000) } } });
}
/**
 * fix2 ▸ สถานะเครือข่ายต่อภาพ (รีเซ็ตทุกงานในลูปหลัก): offline = ช่วงที่ harness ตัดเน็ตของ context เอง · suppressed = จำนวน console error ที่กรองในช่วงนั้น ·
 * snapAt = เวลาที่ snapshot ของภาพนี้ลง IndexedDB (การดึงตอนโหลดหน้า)
 */
const P34U_NET = { offline: false, suppressed: 0, snapAt: 0 };
/** ตัด/ต่อเน็ตของหน้า + เปิด/ปิดช่วงกรอง — ต่อกลับ: ปิดช่วงกรองหลัง 1 วิ (คำขอที่ล้มตอนออฟไลน์รายงานช้าได้) */
async function p34uOffline(page: Any, on: boolean): Promise<void> {
  if (on) {
    P34U_NET.offline = true;
    await page.setOfflineMode(true);
    return;
  }
  await page.setOfflineMode(false);
  await sleep(1000);
  P34U_NET.offline = false;
}
/** console error ที่กรองได้: เฉพาะช่วงที่ harness ตัดเน็ตเอง · เฉพาะ ERR_INTERNET_DISCONNECTED / Failed to fetch · เฉพาะทรัพยากร same-origin (หรือไม่มี URL) */
function p34uSuppress(txt: string, url: string): boolean {
  if (!P34U_NET.offline || !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(txt)) return false;
  if (url && !url.startsWith(BASE)) return false;
  P34U_NET.suppressed += 1;
  return true;
}
/**
 * fix2 ▸ ก่อนต่อเน็ตกลับ: หน้าขายดึง snapshot ใหม่ทันทีเมื่อกลับมาออนไลน์ (พฤติกรรมของ product — ไม่แก้) ⇒ ต้องห่างจากการดึงตอนโหลดหน้า ≥ 60 วิ
 * ไม่งั้น S ตอบ 429 (console error) · รอถึง snapAt + 62 วิ
 */
async function p34uSpaceBeforeOnline(): Promise<void> {
  const wait = P34U_NET.snapAt ? P34U_NET.snapAt + 62_000 - Date.now() : 0;
  if (wait > 0) await sleep(wait);
}
async function ensureP34uFixture(): Promise<void> {
  if (P34U.done || P34U.error) return;
  try {
    const { updatePosOfflineEnabled } = await import("@/lib/modules/pos/settings-general");
    const { posOfflineEnabled } = await import("@/lib/modules/pos/offline-shared");
    const off = await import("@/lib/modules/pos/offline-sync");
    const owner = await ownerActor();
    const sysRow = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
    P34U.flagBefore = posOfflineEnabled(sysRow?.settings ?? null);
    const stale = await prisma.posOfflineSale.findMany({ where: { tenantId: T.tenantId, unitId, idempotencyKey: { startsWith: P34U_KEY_PREFIX }, status: "REJECTED" }, select: { id: true } });
    for (const s of stale) {
      const d = await off.discardOfflineSale(p34uCtx(), owner, { id: s.id, reason: "ภาพ QC P3.4U กวาดซากรอบก่อน" });
      P34U.log.push(`ทิ้งแถวซาก ${s.id} (${d.ok ? "ok" : d.code})`);
    }
    if (stale.length) P34U.flagBefore = false; // รอบที่ถูก kill เปิดธงค้าง — คืนเป็นปิด (ค่าปริยายของร้าน QC)
    P34U.flagTouched = true;
    const on = await updatePosOfflineEnabled({ tenantId: T.tenantId, systemId: SYS }, owner, { enabled: true });
    if (!on.ok) throw new Error(`เปิดธงออฟไลน์: ${on.code}`);
    P34U.log.push(`ธงออฟไลน์เปิด (เดิม ${P34U.flagBefore ? "เปิด" : "ปิด"})`);
    if (jobs.some((j) => j.state === "offline-rejected" || j.state === "settings-offline-live")) {
      await p34uClearSnapRate();
      const sn = await off.issueOfflineSnapshot(p34uCtx(), owner);
      if (!sn.ok) throw new Error(`snapshot ของเครื่อง ${DEVICE_ID}: ${sn.code}`);
      P34U.snapHash = sn.snapshot.hash;
      const amer = sn.snapshot.products.find((p) => p.id === QC_IDS.amer);
      if (!amer || typeof amer.priceSatang !== "number") throw new Error("ไม่พบราคาอเมริกาโน่เย็นใน snapshot");
      const forged = Math.max(100, amer.priceSatang - 1000);
      const tokJson = await staffSessionJson("owner", DEVICE_ID).catch(() => null);
      const staffToken = tokJson ? (JSON.parse(tokJson) as { staffToken?: string }).staffToken : undefined;
      const seq = sn.snapshot.offlineSeq + 500 + (process.pid % 400);
      const item = {
        offlineRef: `OFF-${sn.snapshot.offlineCode}-${String(seq).padStart(4, "0")}`,
        idempotencyKey: `${P34U_KEY_PREFIX}${process.pid}r`,
        soldAt: new Date().toISOString(),
        ...(SHIFT.id ? { shiftId: SHIFT.id } : {}),
        ...(staffToken ? { staffToken } : {}),
        sellerUserId: owner.userId,
        snapshotHash: sn.snapshot.hash,
        sale: { lines: [{ productId: QC_IDS.amer, qty: 1 }], payMethods: [{ type: "CASH" as const, amountSatang: forged }], cashReceivedSatang: forged, expectedGrandTotalSatang: forged },
      };
      const r = await off.syncOfflineSales(p34uCtx(), owner, { deviceId: DEVICE_ID, items: [item as never] });
      const x = r.ok ? r.results[0] : null;
      if (!x || x.status !== "REJECTED" || !x.offlineSaleId) throw new Error(`บิลราคาปลอม: ${r.ok ? `${x?.status ?? "-"}:${x?.reason ?? "-"}` : r.code}`);
      P34U.rejectedId = x.offlineSaleId;
      P34U.log.push(`แถวคิวผู้จัดการ ${x.offlineSaleId} (${item.offlineRef} · ${x.reason})`);
    }
    P34U.done = true;
  } catch (e) {
    P34U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
async function prepP34u(): Promise<void> {
  if (!P34U.done) return;
  await p34uClearSnapRate().catch((e: unknown) => (P34U.error = `ลบ snapshot ล่าสุด: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`));
}
/** หลังงาน P3.4U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน */
async function cleanupP34u(): Promise<void> {
  if (P34U.cleaned) return;
  P34U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string | void>) => {
    try {
      const s = await fn();
      if (s) P34U.log.push(s);
    } catch (e) {
      P34U.ok = false;
      P34U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  if (P34U.rejectedId)
    await step("ทิ้งแถวคิวผู้จัดการ", async () => {
      const { discardOfflineSale } = await import("@/lib/modules/pos/offline-sync");
      const r = await discardOfflineSale(p34uCtx(), await ownerActor(), { id: P34U.rejectedId, reason: "ภาพ QC P3.4U เก็บกวาด" });
      if (!r.ok) throw new Error(r.code);
      return `ทิ้งแถว ${P34U.rejectedId}`;
    });
  if (P34U.flagTouched)
    await step("คืนธงออฟไลน์", async () => {
      const { updatePosOfflineEnabled } = await import("@/lib/modules/pos/settings-general");
      const r = await updatePosOfflineEnabled({ tenantId: T.tenantId, systemId: SYS }, await ownerActor(), { enabled: P34U.flagBefore });
      if (!r.ok) throw new Error(r.code);
      return `ธงออฟไลน์คืนเป็น${P34U.flagBefore ? "เปิด" : "ปิด"}`;
    });
  await step("ลบ snapshot ของเครื่องรอบนี้", async () => `ลบ snapshot ${(await prisma.posOfflineSnapshot.deleteMany({ where: { tenantId: T.tenantId, unitId, deviceId: DEVICE_ID } })).count} ใบ`);
}
/** ค่าในฐาน IndexedDB ของหน้า (meta: snapshot/unlock · queued = จำนวนบิลรอซิงก์) — อ่านไม่ได้ = null */
async function p34uIdb(page: Any, what: "snapshot" | "unlock" | "queued"): Promise<unknown> {
  return page
    .evaluate(
      (name: string, w: string) =>
        new Promise((res) => {
          try {
            const r = indexedDB.open(name);
            r.onerror = () => res(null);
            r.onsuccess = () => {
              const db = r.result;
              try {
                const store = w === "queued" ? "queue" : "meta";
                if (!db.objectStoreNames.contains(store)) return res(null);
                const q = w === "queued" ? db.transaction(store, "readonly").objectStore(store).getAll() : db.transaction(store, "readonly").objectStore(store).get(w);
                q.onsuccess = () => {
                  const v = q.result as unknown;
                  db.close();
                  res(w === "queued" ? (Array.isArray(v) ? v.filter((x: { status?: string }) => x?.status === "queued").length : 0) : v ? true : null);
                };
                q.onerror = () => res(null);
              } catch {
                res(null);
              }
            };
          } catch {
            res(null);
          }
        }),
      P34U_DB(),
      what,
    )
    .catch(() => null);
}
async function p34uWaitIdb(page: Any, what: "snapshot" | "unlock", why: string, ms = 20_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await p34uIdb(page, what)) === true) return;
    await sleep(500);
  }
  throw new StepError(why);
}
/** ตะกร้า (ออนไลน์) → รอ snapshot ของเครื่องลง IndexedDB → ตัดเน็ต → แถบ 19ง ขายได้ (ไม่มีเหตุขายไม่ได้) */
async function p34uCartThenOffline(page: Any, device: Device): Promise<void> {
  await addCart3(page, device, true);
  await p34uWaitIdb(page, "snapshot", "เครื่องไม่ได้ snapshot ราคา (POST /api/pos/sync/snapshot) ภายใน 20 วิ — ธงออฟไลน์/เครื่อง/เพดานอัตรา?");
  P34U_NET.snapAt = Date.now();
  await p34uOffline(page, true);
  await visibleEl(page, tid("pos-reg-offline-live-banner"), 0, 10_000).catch(() => {
    throw new StepError("ตัดเน็ตแล้วไม่ขึ้นแถบขายออฟไลน์ (pos-reg-offline-live-banner)");
  });
  await sleep(400);
  const gate = (await page.$eval(tid("pos-reg-offline-gate"), (el: Element) => el.textContent ?? "").catch(() => null)) as string | null;
  if (gate) throw new StepError(`ขายออฟไลน์ไม่ได้: ${gate.slice(0, 120)}`);
}
/** เพิ่มอเมริกาโน่ + ลาเต้ ขณะออฟไลน์ (ยอดจาก snapshot) */
async function p34uAddOffline(page: Any): Promise<void> {
  if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC");
  for (const id of [QC_IDS.amer, QC_IDS.latte]) await clickEl(page, tid(`pos-reg-product-${id}`));
  await expectLines(page, 2);
}
/** กล่องชำระออฟไลน์ (เงินสดพอดี / โอน + เลขอ้างอิง) → จอบันทึกแล้ว — คืนเลข OFF */
async function p34uPay(page: Any, device: Device, tender: "CASH" | "TRANSFER" = "CASH"): Promise<string> {
  await page
    .waitForFunction((sel: string) => Array.from(document.querySelectorAll(sel)).some((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled), { timeout: 10_000 }, device === "mobile" ? tid("pos-reg-cart-bar-pay") : tid("pos-reg-offline-pay-cash"))
    .catch(() => {
      throw new StepError("ปุ่มชำระออฟไลน์ไม่เปิด (ยอด snapshot/ด่านขายออฟไลน์)");
    });
  await clickEl(page, tid(device === "mobile" ? "pos-reg-cart-bar-pay" : "pos-reg-offline-pay-cash"));
  await visibleEl(page, tid("pos-reg-offline-pay"), 0, 10_000);
  if (tender === "TRANSFER") {
    await clickEl(page, tid("pos-reg-offline-tender-transfer"));
    await typeInto(page, tid("pos-reg-offline-reference"), "QC-1234");
  }
  await clickEl(page, tid("pos-reg-offline-confirm"));
  const no = await visibleEl(page, tid("pos-reg-offline-done-no"), 0, 15_000).catch(() => {
    throw new StepError("บันทึกบิลออฟไลน์ไม่ขึ้นจอเลขชั่วคราว (pos-reg-offline-done)");
  });
  const ref = String(await no.evaluate((el: Element) => el.textContent ?? "")).trim();
  if (!/^OFF-[A-Z0-9]+-\d{4,}$/.test(ref)) throw new StepError(`เลขชั่วคราวผิดรูป: ${ref.slice(0, 40)}`);
  return ref;
}
async function p34uNext(page: Any): Promise<void> {
  await clickEl(page, tid("pos-reg-offline-next"));
  await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 10_000 }, tid("pos-reg-offline-done")).catch(() => undefined);
  await sleep(300);
}
async function runP34uState(page: Any, state: P34uKey, device: Device): Promise<void> {
  if (P34U.error) throw new StepError(`fixture P3.4U: ${P34U.error}`);
  if (!P34U.done) throw new StepError("fixture P3.4U ยังไม่ได้สร้าง");
  if (state === "settings-offline-live") {
    await visibleEl(page, tid("pos-settings-offline"), 0, 15_000).catch(() => {
      throw new StepError("แท็บออฟไลน์ไม่ขึ้น (pos-settings-offline)");
    });
    await page.waitForFunction((sel: string) => document.querySelector(sel)?.getAttribute("aria-checked") === "true", { timeout: 10_000 }, tid("pos-settings-offline-switch")).catch(() => {
      throw new StepError("สวิตช์ออฟไลน์ไม่ live/ไม่เปิด (pos-settings-offline-switch aria-checked)");
    });
    if (P34U.rejectedId)
      await page.waitForFunction((sel: string) => Number(document.querySelector(sel)?.getAttribute("data-server") ?? "0") > 0, { timeout: 10_000 }, tid("pos-settings-offline-pending")).catch(() => {
        throw new StepError("รอซิงก์ไม่นับบิลรอผู้จัดการ (pos-settings-offline-pending data-server)");
      });
    return;
  }
  if (state === "offline-rejected") {
    if (!P34U.rejectedId) throw new StepError("ไม่มีแถวคิวผู้จัดการของ fixture");
    await visibleEl(page, tid("pos-shift-offline-queue"), 0, 15_000).catch(() => {
      throw new StepError("หน้ากะไม่มีการ์ดบิลออฟไลน์รอผู้จัดการ (pos-shift-offline-queue)");
    });
    await visibleEl(page, tid(`pos-shift-offline-row-${P34U.rejectedId}`), 0, 10_000);
    await clickEl(page, tid(`pos-shift-offline-discard-${P34U.rejectedId}`));
    await visibleEl(page, tid(`pos-shift-offline-reason-${P34U.rejectedId}`), 0, 5_000);
    return;
  }
  if (state === "offline-close-blocked") {
    // ซิงก์ถูกกั้น: POST /api/pos/sync ตอบ {ok:true, results:[]} (ทุกรายการ = keep · บิลค้างในคิว) — ไม่ใช่ 4xx/5xx (ไม่ให้ console/5xx ปนภาพ)
    await page.setRequestInterception(true);
    page.on("request", (rq: Any) => {
      if (rq.isInterceptResolutionHandled?.()) return;
      if (rq.method() === "POST" && /\/api\/pos\/sync(\?|$)/.test(String(rq.url()))) void rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results: [] }) }).catch(() => undefined);
      else void rq.continue().catch(() => undefined);
    });
    await page.goto(`${BASE}/app/sys/${SYS}/pos/register?unit=${encodeURIComponent(unitId)}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
    await ensureShift(page);
    await p34uCartThenOffline(page, device);
    await p34uPay(page, device);
    await p34uNext(page);
    await p34uSpaceBeforeOnline();
    await p34uOffline(page, false);
    if ((await p34uIdb(page, "queued")) !== 1) throw new StepError("คิวในเครื่องไม่ใช่ 1 บิลหลังกลับมาออนไลน์ (ซิงก์หลุดการกั้น?)");
    await page.goto(`${BASE}${p34uPath(state)}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await visibleEl(page, tid("pos-shift-close-offline-blocked"), 0, 15_000).catch(() => {
      throw new StepError("หน้ากะไม่ขึ้น \"ซิงก์ก่อนปิดกะ\" (pos-shift-close-offline-blocked) — มีกะเปิดของเครื่องนี้ไหม?");
    });
    const dis = (await page.$eval(tid("pos-shift-close-submit"), (el: Element) => (el as HTMLButtonElement).disabled).catch(() => null)) as boolean | null;
    if (dis !== true) throw new StepError("ปุ่มปิดกะไม่ถูกปิดขณะมีบิลรอซิงก์");
    return;
  }
  // ── หน้าขาย ──
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root)");
  });
  await ensureShift(page);
  if (state === "offline-lock-pin") {
    const pin = P115.pins[userKey];
    if (!pin) throw new StepError(`ไม่มี PIN ของ ${userKey} (ข้อมูลภาพ P1.15U)`);
    await unlockRunPin().catch(() => undefined);
    await p34uWaitIdb(page, "snapshot", "เครื่องไม่ได้ snapshot ราคาภายใน 20 วิ");
    await lockFromRegister(page, device);
    await clickPinDigits(page, pin);
    await page.waitForFunction((sel: string) => !document.querySelector(sel), { timeout: 15_000 }, tid("pos-lock-screen")).catch(() => {
      throw new StepError("ปลดล็อกออนไลน์ด้วย PIN ไม่สำเร็จ");
    });
    // fix1 F2 (CD-P34U-R2): ตัวตรวจเขียนเฉพาะ STAFF — เจ้าของ/ผู้จัดการปลดออฟไลน์ไม่ได้ (PIN ของคนกลุ่มนี้คือ PIN อนุมัติ)
    const staffRole = userOf(userKey).role === "STAFF";
    if (staffRole) await p34uWaitIdb(page, "unlock", "ปลดล็อกออนไลน์แล้วไม่มีตัวตรวจ PIN ออฟไลน์ใน IndexedDB (onPinVerified)");
    else {
      await sleep(1500);
      if ((await p34uIdb(page, "unlock")) === true) throw new StepError(`${userKey} ไม่ใช่ STAFF แต่มีตัวตรวจ PIN ออฟไลน์ใน IndexedDB`);
    }
    await p34uOffline(page, true);
    await visibleEl(page, tid("pos-reg-offline-live-banner"), 0, 10_000);
    await clickEl(page, tid(device === "mobile" ? "pos-lock-now-mobile" : "pos-lock-now"));
    await visibleEl(page, tid("pos-lock-screen"), 0, 10_000);
    const want = staffRole ? "holder" : "unavailable";
    await visibleEl(page, `${tid("pos-lock-offline-note")}[data-state="${want}"]`, 0, 10_000).catch(() => {
      throw new StepError(`จอล็อกออฟไลน์ไม่ใช่ ${want} (pos-lock-offline-note data-state)`);
    });
    if (!staffRole) return;
    await clickPinDigits(page, pin.replace(/\d/g, (d) => String((Number(d) + 1) % 10)));
    await visibleEl(page, tid("pos-lock-message"), 0, 15_000).catch(() => {
      throw new StepError("PIN ผิดตอนออฟไลน์ไม่ขึ้นข้อความ (pos-lock-message)");
    });
    return;
  }
  await p34uCartThenOffline(page, device);
  if (state === "offline-tenders") {
    if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
    await visibleEl(page, tid("pos-reg-offline-chips"), 0, 10_000);
    for (const c of ["points", "coupon", "card", "promptpay"]) await visibleEl(page, tid(`pos-reg-offline-chip-${c}`), 0, 5_000);
    await visibleEl(page, tid("pos-reg-offline-pay-transfer"), 0, 5_000);
    return;
  }
  const ref1 = await p34uPay(page, device);
  if (state === "offline-sale") return;
  if (state === "offline-slip") {
    await clickEl(page, tid("pos-reg-offline-slip"));
    const doc = (await page
      .waitForFunction(() => (document.querySelector('iframe[data-pos-print="1"]') as HTMLIFrameElement | null)?.srcdoc || null, { timeout: 10_000 })
      .then((h: Any) => h.jsonValue())
      .catch(() => null)) as string | null;
    if (!doc) throw new StepError("กดพิมพ์ใบรับเงินชั่วคราวแล้วไม่มีเอกสารพิมพ์ (iframe data-pos-print)");
    const probs: string[] = [];
    if (!doc.includes(ref1)) probs.push(`ไม่มีเลข ${ref1}`);
    if (!/ใบรับเงินชั่วคราว — รอออกเลขจริง|TEMPORARY RECEIPT — AWAITING FINAL NUMBER/.test(doc)) probs.push("ไม่มีหัวใบรับเงินชั่วคราว");
    if (/\/r\//.test(doc)) probs.push("มีลิงก์/QR /r/");
    if (/ใบกำกับภาษีอย่างย่อ|ABB/.test(doc.replace(/ใบรับเงินชั่วคราว — รอออกเลขจริง/g, ""))) probs.push("มีคำว่าใบกำกับภาษีอย่างย่อ");
    if (probs.length) throw new StepError(`สลิปออฟไลน์: ${probs.join(" · ")}`);
    // fix2: คงออฟไลน์ (สลิปเป็น HTML ในตัว) — ต่อเน็ตกลับ = หน้าดึง snapshot ซ้ำภายใน 60 วิ = 429
    await page.setContent(doc, { waitUntil: "load" });
    return;
  }
  await p34uNext(page);
  if (state === "offline-queue") {
    await p34uAddOffline(page);
    await p34uPay(page, device, "TRANSFER");
    await p34uNext(page);
    await page.waitForFunction((sel: string) => document.querySelector(sel)?.getAttribute("data-count") === "2", { timeout: 10_000 }, tid("pos-reg-offline-badge")).catch(() => {
      throw new StepError("ป้ายรอซิงก์ไม่ใช่ 2 (pos-reg-offline-badge data-count)");
    });
    return;
  }
  // offline-sync-back (fix2: เว้น ≥ 60 วิ จาก snapshot ตอนโหลด ก่อนต่อเน็ต — บิลจริง 1 ใบต่อภาพเหมือนเดิม)
  await p34uSpaceBeforeOnline();
  await p34uOffline(page, false);
  await page.waitForFunction((sel: string) => document.querySelector(sel)?.getAttribute("data-state") === "done", { timeout: 45_000 }, tid("pos-reg-offline-sync-strip")).catch(() => {
    throw new StepError("กลับมาออนไลน์แล้วแถบซิงก์ไม่ถึง \"ซิงก์แล้ว\" ภายใน 45 วิ (pos-reg-offline-sync-strip data-state=done)");
  });
  await clickEl(page, `${tid("pos-reg-offline-sync-strip")} ${tid("pos-reg-offline-badge")}`);
  await visibleEl(page, tid("pos-reg-offline-bills"), 0, 10_000);
  await visibleEl(page, `${tid(`pos-reg-offline-bill-${ref1}`)}[data-status="synced"]`, 0, 10_000).catch(() => {
    throw new StepError(`บิล ${ref1} ไม่ได้เลขจริง (ไม่อยู่ในรายการ synced)`);
  });
}
// ◂ POS P3.4U

// ═══════════════════ POS P2.11U ▸ หลายสาขา: fixture + ขั้นตอนของสถานะ (มติ 11) ◂ ═══════════════════
// fixture (ensureP211uFixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • หน้า products: ลาเต้ += แถว (STORE, สีลม) = ราคาฐาน − ฿5 (ช่อง "ราคา สีลม" ตัวหนา + ชิป "สาขา") · ช่องทาง ZZVIS ที่สีลม (saveChannel) →
//     แถว (ZZVIS, ทุกสาขา) ของลาเต้ → archiveChannel ⇒ แถวเลิกใช้ 1 แถว (หมายเหตุ pos-prod-deadNote) — แบบ dead-row ของ qc-pos-p2.11 ·
//     แถวเดิมของลาเต้จำไว้ (fix1 มติ 5: ก่อนจำ กวาดซากรอบที่ถูก kill — แถว (STORE, สีลม) = ฐาน − ฿5 · ค่าใบเสร็จสีลม = 00001) · เก็บกวาด: เปิดช่องทางคืน (ธง archivedAt · เขียนตรง) → setChannelPrices(แถวเดิม) ลบแถวของรอบ → ลบแถวช่องทาง ZZVIS ของรอบ
//   • หน้า reports: บิล PAID วันนี้ที่สีลม 3 ใบ (createSale คีย์ต่อวัน posqc-vis-p211u-<n>-<วันที่> · หน้าร้าน ×2 PROMPTPAY + LINE MAN ×1 PLATFORM) — ไม่ลบ (แบบ sale-done)
//   • หน้า settings: สมุด ABB ชั่วคราว (ensureAbbBook · คืนใน cleanRpub) + ค่าของสาขาสีลม (สาขาที่ 00001 · ที่อยู่ · โทร) ผ่าน updatePosReceiptUnitSettings · คืนค่าเดิมหลังงานสุดท้าย
//   • หน้า stock: seed QC ผูกสีลม + อารีย์กับคลังเดียวกันอยู่แล้ว (posUnitInventoryMap shared) — ไม่มี = ผูกอารีย์กับคลังของสีลม (linkUnit) แล้วลบลิงก์ของรอบตอนเก็บกวาด
//   • ผู้ใช้ manager: ensureManagerUser (User + Membership MANAGER unitAccess [สีลม] · id ตายตัว · User สร้างครั้งแรก/ใช้ซ้ำ ·
//     fix1 มติ 6: Membership ลบใน cleanupP211u ทุกรอบ แล้วสร้างใหม่รอบถัดไป)
const P211U_CH = "ZZVIS";
/** ค่าใบเสร็จของสาขาสีลมใน fixture (fix1 มติ 5: ใช้จับซากของรอบที่ถูก kill ด้วย) */
const P211U_RECEIPT = { taxBranchNo: "00001", address: "99/1 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500", phone: "02-000-0001" } as const;
const P211U = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  latteName: "",
  rowsBefore: null as null | { channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean }[],
  channelId: "",
  receiptBefore: null as null | { taxBranchNo: string | null; address: string | null; phone: string | null },
  invLinkCreated: "",
  bills: [] as string[],
  managerMembership: false, // fix1 มติ 6: รอบนี้สร้าง/ตั้ง Membership MANAGER ของภาพ ⇒ ลบตอนเก็บกวาด
};
/** ผู้จัดการสาขาสีลมของภาพ (ไม่อยู่ใน seed-pos-qc) — User สร้างครั้งแรก/ใช้ซ้ำ · Membership MANAGER สร้างทุกรอบ แล้วลบใน cleanupP211u
 *  (fix1 มติ 6 · R1 F6: ไม่ค้างในร้าน QC ⇒ ภาพพนักงาน P1.18U บน QC5 ไม่มีแถวเกิน) */
async function ensureManagerUser(): Promise<void> {
  const silom = (T.units as Record<string, { id: string }>).silom?.id;
  if (!silom) throw new Fatal("ร้าน QC ไม่มีสาขาสีลม (ผู้จัดการของภาพ P2.11U)");
  await prisma.user.upsert({ where: { id: MANAGER_VIS.userId }, update: {}, create: { id: MANAGER_VIS.userId, email: MANAGER_VIS.email, name: MANAGER_VIS.name } });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: MANAGER_VIS.userId, tenantId: T.tenantId } },
    update: { role: "MANAGER", unitAccess: [silom], permissions: {}, acceptedAt: new Date() },
    create: { id: MANAGER_VIS.membershipId, userId: MANAGER_VIS.userId, tenantId: T.tenantId, role: "MANAGER", unitAccess: [silom], permissions: {}, acceptedAt: new Date() },
  });
  P211U.managerMembership = true;
}
async function ensureP211uFixture(): Promise<void> {
  if (P211U.done || P211U.error) return;
  try {
    const owner = await ownerActor();
    const want = (k: P211uKey) => jobs.some((j) => j.state === k);
    const needProducts = jobs.some((j) => j.page === "products" && isP211uState(j.state));
    if (needProducts) {
      if (!QC_IDS.latte) throw new StepError("ไม่มีลาเต้ของร้าน QC");
      const { setChannelPrices } = await import("@/lib/modules/pos/catalog");
      const { saveChannel, archiveChannel, listChannels } = await import("@/lib/modules/pos/channel");
      const cctx = { tenantId: T.tenantId, systemId: SYS, actorUserId: owner.userId };
      const rctx = { tenantId: T.tenantId, systemId: SYS, unitId };
      const latte = await prisma.posProduct.findFirst({ where: { tenantId: T.tenantId, id: QC_IDS.latte }, select: { name: true, basePriceSatang: true } });
      if (!latte?.basePriceSatang) throw new StepError("ลาเต้ของร้าน QC ไม่มีราคาฐาน");
      P211U.latteName = latte.name;
      // ซากรอบที่ถูก kill: ช่องทาง ZZVIS ของสาขาสีลมยังอยู่ ⇒ เปิดคืน → ตัดแถว ZZVIS ของลาเต้ → ลบช่องทาง
      const old = await prisma.salesChannel.findFirst({ where: { tenantId: T.tenantId, systemId: SYS, unitId, code: P211U_CH }, select: { id: true } });
      if (old) {
        await prisma.salesChannel.update({ where: { id: old.id }, data: { archivedAt: null } });
        const cur = await prisma.posProductChannelPrice.findMany({ where: { tenantId: T.tenantId, systemId: SYS, productId: QC_IDS.latte }, select: { channelCode: true, unitId: true, priceSatang: true, notSold: true } });
        await setChannelPrices(cctx, { productId: QC_IDS.latte, rows: cur.filter((r) => r.channelCode !== P211U_CH) });
        await prisma.salesChannel.deleteMany({ where: { id: old.id, tenantId: T.tenantId } });
        P211U.log.push("กวาดซาก ZZVIS ของรอบก่อน");
      }
      // fix1 มติ 5 (R1 F5): ซากรอบที่ถูก SIGKILL — แถว (STORE, สีลม) ของลาเต้ = ราคาฐาน − ฿5 (ค่าของ fixture) ⇒ ลบก่อนจำ "ก่อน" (ไม่ให้ซากไหลเข้า seed)
      {
        const cur = await prisma.posProductChannelPrice.findMany({ where: { tenantId: T.tenantId, systemId: SYS, productId: QC_IDS.latte }, select: { channelCode: true, unitId: true, priceSatang: true, notSold: true } });
        const leftPrice = latte.basePriceSatang - 500;
        const isLeft = (r: (typeof cur)[number]) => r.channelCode === "STORE" && r.unitId === unitId && !r.notSold && r.priceSatang === leftPrice;
        if (cur.some(isLeft)) {
          await setChannelPrices(cctx, { productId: QC_IDS.latte, rows: cur.filter((r) => !isLeft(r)) });
          P211U.log.push("กวาดซากแถว (STORE, สีลม) = ฐาน − ฿5 ของรอบก่อน");
        }
      }
      const before = await prisma.posProductChannelPrice.findMany({ where: { tenantId: T.tenantId, systemId: SYS, productId: QC_IDS.latte }, select: { channelCode: true, unitId: true, priceSatang: true, notSold: true } });
      P211U.rowsBefore = before;
      const ch = await saveChannel(rctx, owner, { code: P211U_CH, name: "ช่องทางเลิกใช้ (ภาพ QC P2.11U)", payout: "DIRECT" });
      if (!ch.ok) throw new StepError(`สร้างช่องทาง ${P211U_CH}: ${ch.code}`);
      P211U.channelId = ch.channel.id;
      const keep = before.filter((r) => !(r.channelCode === "STORE" && r.unitId === unitId));
      const set = await setChannelPrices(cctx, {
        productId: QC_IDS.latte,
        rows: [...keep, { channelCode: "STORE", unitId, priceSatang: latte.basePriceSatang - 500, notSold: false }, { channelCode: P211U_CH, unitId: null, priceSatang: latte.basePriceSatang + 1000, notSold: false }],
      });
      if (!set) throw new StepError("setChannelPrices ไม่คืนผล");
      const ar = await archiveChannel(rctx, owner, { id: ch.channel.id });
      if (!ar.ok) throw new StepError(`เก็บช่องทาง ${P211U_CH}: ${ar.code}`);
      const l = await listChannels(rctx, owner, { includeArchived: true });
      if (l.ok && !l.items.some((c) => c.code === P211U_CH && c.archived)) throw new StepError(`ช่องทาง ${P211U_CH} ไม่ถูกเก็บถาวร`);
      P211U.log.push(`ลาเต้: (STORE, สีลม) ฿${(latte.basePriceSatang - 500) / 100} + แถวเลิกใช้ (${P211U_CH}, ทุกสาขา) · แถวเดิม ${before.length} แถวจำไว้`);
    }
    if (want("reports-channels")) {
      await ensureChannelFixture();
      if (P21U.error || !P21U.ids.LINEMAN) throw new StepError(`fixture ช่องทาง: ${P21U.error ?? "ไม่มี LINEMAN"}`);
      const { createSale } = await import("@/lib/modules/pos/service");
      const base = { tenantId: T.tenantId, unitId, systemId: SYS, sourceModule: "POS", shiftId: null, soldByUserId: owner.userId };
      const day = bkkToday();
      const specs = [
        { n: 1, lines: [{ name: `ลาเต้เย็น ${BILL_TAG}`, qty: 2, unitPriceSatang: 7500 }], pay: "PROMPTPAY", channelId: null as string | null },
        { n: 2, lines: [{ name: `อเมริกาโน่ ${BILL_TAG}`, qty: 1, unitPriceSatang: 6000 }, { name: `ครัวซองต์ ${BILL_TAG}`, qty: 1, unitPriceSatang: 8500 }], pay: "PROMPTPAY", channelId: null },
        { n: 3, lines: [{ name: `ผัดไทยกุ้ง ${BILL_TAG}`, qty: 1, unitPriceSatang: 12000 }, { name: `ชาไทยเย็น ${BILL_TAG}`, qty: 2, unitPriceSatang: 6000 }], pay: "PLATFORM", channelId: P21U.ids.LINEMAN },
      ];
      for (const sp of specs) {
        const total = sp.lines.reduce((a, l) => a + l.qty * l.unitPriceSatang, 0);
        const r = await createSale({
          ...base,
          idempotencyKey: `${FIX.prefix}p211u-${sp.n}-${day}`,
          ...(sp.channelId ? { channelId: sp.channelId, channelRef: "LM-21101" } : {}),
          lines: sp.lines,
          payMethods: [{ type: sp.pay, amountSatang: total }],
        } as never);
        P211U.bills.push(r.saleId);
      }
      P211U.log.push(`บิลวันนี้ ${P211U.bills.length} ใบ (คีย์ต่อวัน · ไม่ลบ)`);
    }
    if (want("settings-receipt-branch")) {
      await ensureAbbBook();
      const { updatePosReceiptUnitSettings } = await import("@/lib/modules/pos/receipt-settings");
      const { receiptUnitOverride } = await import("@/lib/modules/pos/receipt-settings-shared");
      const sys = await prisma.appSystem.findFirst({ where: { id: SYS, tenantId: T.tenantId }, select: { settings: true } });
      const rb = receiptUnitOverride(sys?.settings ?? null, unitId);
      P211U.receiptBefore = rb;
      // fix1 มติ 5 (R1 F5): ซากรอบที่ถูก SIGKILL — ค่าสาขาสีลม = "00001" ของ fixture ⇒ ล้าง (ที่อยู่/โทรที่ตรงค่า fixture ด้วย) ก่อนจำ "ก่อน"
      // fix2 มติ 1 (R2 G1): ซาก = ครบทั้ง 3 ช่องตรง P211U_RECEIPT (fixture เขียนครั้งเดียว 3 ช่อง) ⇒ ล้างเป็น null ทั้งหมด · ไม่ครบ = ค่าจริงของเจ้าของ ไม่แตะ
      if (rb.taxBranchNo === P211U_RECEIPT.taxBranchNo && rb.address === P211U_RECEIPT.address && rb.phone === P211U_RECEIPT.phone) {
        const sweep = { taxBranchNo: null, address: null, phone: null };
        const sw = await updatePosReceiptUnitSettings({ tenantId: T.tenantId, systemId: SYS }, owner, { unitId, patch: sweep });
        if (!sw.ok) throw new StepError(`กวาดซากค่าใบเสร็จของสาขา: ${sw.code} ${sw.field ?? ""}`);
        P211U.receiptBefore = sweep;
        P211U.log.push("กวาดซากค่าใบเสร็จสาขาสีลม (00001) ของรอบก่อน");
      }
      const r = await updatePosReceiptUnitSettings({ tenantId: T.tenantId, systemId: SYS }, owner, { unitId, patch: { ...P211U_RECEIPT } });
      if (!r.ok) throw new StepError(`ตั้งค่าใบเสร็จของสาขา: ${r.code} ${r.field ?? ""}`);
      P211U.log.push("ใบเสร็จสาขาสีลม: สาขาที่ 00001 + ที่อยู่/โทร (คืนค่าเดิมตอนเก็บกวาด)");
    }
    if (want("stock-shared-inventory")) {
      const { posUnitInventoryMap } = await import("@/lib/modules/pos/catalog");
      const map = await posUnitInventoryMap(T.tenantId, SYS);
      if (!map.groups.some((g) => g.shared && g.unitIds.includes(unitId))) {
        const mine = map.units.find((u) => u.unitId === unitId)?.inventorySystemId;
        const other = map.units.find((u) => u.unitId !== unitId && !map.groups.some((g) => g.unitIds.includes(u.unitId) && g.shared));
        if (!mine || !other) throw new StepError("ร้าน QC ไม่มีสาขาที่สองหรือสีลมไม่ผูกคลัง — สร้างคลังร่วมไม่ได้");
        if (other.inventorySystemId) throw new StepError("สาขาที่สองผูกคลังอื่นอยู่ — ไม่ย้ายลิงก์ของ seed (ผู้คุมงานตัดสิน)");
        const sysSvc = await import("@/lib/modules/system/service");
        await sysSvc.linkUnit(T.tenantId, mine, other.unitId);
        P211U.invLinkCreated = other.unitId;
        P211U.log.push("ผูกสาขาที่สองกับคลังของสีลม (ลบลิงก์ตอนเก็บกวาด)");
      } else P211U.log.push("คลังร่วม: seed QC สีลม + อารีย์ใช้คลังเดียวกันอยู่แล้ว (ไม่เขียน)");
    }
    P211U.done = true;
  } catch (e) {
    P211U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** หลังงาน P2.11U สุดท้าย / finally / สัญญาณ — เรียกซ้ำได้ · ไม่โยน */
async function cleanupP211u(): Promise<void> {
  if (P211U.cleaned) return;
  P211U.cleaned = true;
  const step = async (what: string, fn: () => Promise<string | null>) => {
    try {
      const t = await fn();
      if (t) P211U.log.push(t);
    } catch (e) {
      P211U.ok = false;
      P211U.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  };
  await step("คืนแถวราคาลาเต้", async () => {
    if (!P211U.rowsBefore && !P211U.channelId) return null;
    const owner = await ownerActor();
    const { setChannelPrices } = await import("@/lib/modules/pos/catalog");
    if (P211U.channelId) await prisma.salesChannel.update({ where: { id: P211U.channelId }, data: { archivedAt: null } });
    if (P211U.rowsBefore) await setChannelPrices({ tenantId: T.tenantId, systemId: SYS, actorUserId: owner.userId }, { productId: QC_IDS.latte, rows: P211U.rowsBefore });
    if (P211U.channelId) await prisma.salesChannel.deleteMany({ where: { id: P211U.channelId, tenantId: T.tenantId } });
    return `คืนแถวราคาลาเต้ ${P211U.rowsBefore?.length ?? 0} แถว · ลบช่องทาง ${P211U_CH} ของรอบ`;
  });
  await step("คืนค่าใบเสร็จของสาขา", async () => {
    if (!P211U.receiptBefore) return null;
    const { updatePosReceiptUnitSettings } = await import("@/lib/modules/pos/receipt-settings");
    const r = await updatePosReceiptUnitSettings({ tenantId: T.tenantId, systemId: SYS }, await ownerActor(), { unitId, patch: { ...P211U.receiptBefore } });
    if (!r.ok) throw new StepError(`${r.code} ${r.field ?? ""}`);
    return "คืนค่าใบเสร็จของสาขาสีลม";
  });
  // fix1 มติ 6 (R1 F6): Membership MANAGER ของภาพ — ลบ (User คงไว้ · รอบหน้าสร้างใหม่ใน ensureManagerUser) · session ของรอบลบใน finally ตามเดิม
  await step("ลบ Membership ผู้จัดการของภาพ", async () => {
    if (!P211U.managerMembership) return null;
    const d = await prisma.membership.deleteMany({ where: { userId: MANAGER_VIS.userId, tenantId: T.tenantId } });
    return `ลบ Membership MANAGER ของภาพ ${d.count} แถว (ผู้ใช้คงไว้)`;
  });
  await step("ลบลิงก์คลังของรอบ", async () => {
    if (!P211U.invLinkCreated) return null;
    await prisma.appSystemUnit.deleteMany({ where: { tenantId: T.tenantId, unitId: P211U.invLinkCreated, type: "INVENTORY" } });
    return "ลบลิงก์คลังของรอบ";
  });
}
async function p211uOpenLatte(page: Any, device: Device): Promise<void> {
  if (P211U.latteName) await typeInto(page, tid("pos-prod-search"), P211U.latteName);
  await clickEl(page, tid(device === "mobile" ? `pos-prod-copen-${QC_IDS.latte}` : `pos-prod-open-${QC_IDS.latte}`));
  await visibleEl(page, tid("pos-prod-drawer"), 0, 10_000);
}
async function runP211uState(page: Any, state: P211uKey, device: Device): Promise<void> {
  if (P211U.error) throw new StepError(`fixture P2.11U: ${P211U.error}`);
  if (state === "reports-channels") {
    const card = await visibleEl(page, tid("pos-rep-channels"), 0, 20_000);
    await page.waitForFunction(() => !!document.querySelector('[data-testid^="pos-rep-channels-row-"]') || !!document.querySelector('[data-testid="pos-rep-channels-empty"]'), { timeout: 20_000 }).catch(() => {
      throw new StepError("การ์ดช่องทางการขายไม่มีแถว (pos-rep-channels-row-*)");
    });
    if (!(await page.$('[data-testid^="pos-rep-channels-row-"]'))) throw new StepError("การ์ดช่องทางการขายว่าง — บิล fixture วันนี้ไม่ขึ้น");
    await card.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
    return;
  }
  if (state === "settings-receipt-branch") {
    const card = await visibleEl(page, tid("pos-set-receipt-branch"), 0, 20_000);
    const v = (await page.$eval(tid("pos-set-receipt-branchNo"), (e: Element) => (e as HTMLInputElement).value)) as string;
    if (v !== "00001") throw new StepError(`ช่องสาขาที่ = "${v}" (คาด 00001 ของ fixture)`);
    await card.evaluate((el: Element) => el.scrollIntoView({ block: "start" }));
    return;
  }
  if (state === "stock-shared-inventory") {
    await visibleEl(page, tid("pos-stock-sharedNote"), 0, 20_000).catch(() => {
      throw new StepError("ไม่มีหมายเหตุคลังร่วม (pos-stock-sharedNote)");
    });
    return;
  }
  // ── หน้า 06 ──
  await visibleEl(page, tid("pos-prod-unitFilter"), 0, 20_000);
  const filter = (await page.$eval(tid("pos-prod-unitFilter"), (e: Element) => ({ value: (e as HTMLSelectElement).value, hasAll: Array.from((e as HTMLSelectElement).options).some((o) => o.value === "") }))) as { value: string; hasAll: boolean };
  if (filter.value !== unitId) throw new StepError(`ตัวกรองสาขา = "${filter.value}" (คาด ${unitId})`);
  if (state === "products-branch-filter") {
    if (device === "mobile") await visibleEl(page, tid(`pos-prod-cbranch-${QC_IDS.latte}`), 0, 10_000);
    else await visibleEl(page, tid(`pos-prod-cell-${QC_IDS.latte}-unit`), 0, 10_000);
    return;
  }
  if (state === "products-branch-copy") {
    await clickEl(page, tid("pos-prod-copy-open"));
    await visibleEl(page, tid("pos-prod-copy-dialog"), 0, 10_000);
    await clickEl(page, tid("pos-prod-copy-overwrite"));
    return; // 🔴 ไม่กดคัดลอก
  }
  if (state === "products-branch-compare") {
    await clickEl(page, tid("pos-prod-compare-open"));
    await visibleEl(page, tid("pos-prod-compare"), 0, 10_000);
    await page.waitForFunction(() => !!document.querySelector('[data-testid^="pos-prod-compare-cell-"]'), { timeout: 20_000 }).catch(() => {
      throw new StepError("ตารางเทียบราคาสาขาไม่ขึ้น (pos-prod-compare-cell-*)");
    });
    return;
  }
  if (state === "products-dead-row-note") {
    await p211uOpenLatte(page, device);
    const note = await visibleEl(page, tid("pos-prod-deadNote"), 0, 10_000);
    await note.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
    if (userKey === "owner") await visibleEl(page, tid("pos-prod-purgeDead"), 0, 5_000);
    else if (await page.$(tid("pos-prod-purgeDead"))) throw new StepError("ผู้จัดการสาขาเห็นปุ่มล้างแถวที่เลิกใช้ (ต้องไม่มี — มติ 3)");
    return;
  }
  if (state === "products-manager-branch") {
    if (filter.hasAll) throw new StepError("โหมดสาขายังมีตัวเลือก \"ทุกสาขา\"");
    await p211uOpenLatte(page, device);
    await visibleEl(page, tid("pos-prod-drawer-managerHint"), 0, 10_000);
    await visibleEl(page, tid(`pos-prod-drawer-group-${unitId}`), 0, 10_000);
    return;
  }
}
// ◂
// ═══════════════════ POS P2.13 ▸ การ์ดคีย์ API: fixture + ขั้นตอนของสถานะ (U-lite §7) ◂ ═══════════════════
// fixture (prepP213 · ก่อนเปิดหน้าของแต่ละงาน · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • งานแรก: กวาดซาก — ApiKey ของระบบ POS ร้าน QC ที่ชื่อลงท้าย "(QC <pid>)" และ pid นั้นไม่มีชีวิตแล้ว (รอบที่ถูก kill) ⇒ ลบ
//   • raw: ลบคีย์ UI ของรอบจากภาพก่อนหน้า (ให้มีคีย์ UI ของรอบครั้งละ 1 ใบ — รายการไม่ซ้ำ 3 แถว)
//   • list/revoke: คีย์ fixture 2 ใบ (ครั้งเดียวต่อรอบ · api-keys/service = ทางเดียวกับ createPosApiKeyAction): "จอสรุปยอดหลังร้าน" pos-read + ตัวกรองสาขาที่ถ่าย
//     หมดอายุ 30 วัน · lastUsedAt 3 ชม.ก่อน (เขียนตรง) · "ระบบสั่งของเดิม" pos-admin ไม่หมดอายุ → revokeApiKey
//   เก็บกวาด (cleanupP213 · หลังงานสุดท้าย/finally/สัญญาณ · เรียกซ้ำได้ · ไม่โยน): ลบ ApiKey ของรอบ (ชื่อลงท้าย "(QC <pid นี้>)") ทั้งหมด
// 🔴 แตะเฉพาะคีย์ชื่อของรอบ/ซากของ pid ที่ตายแล้ว — คีย์อื่นในระบบ POS ร้าน QC ไม่แตะ (มี = ภาพ empty ตกพร้อมจำนวน)
const P213 = { swept: false, listKeys: false, error: null as string | null, ok: true, log: [] as string[], cleaned: false };
const p213Alive = (pid: number): boolean => {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string } | null)?.code === "EPERM"; // มีชีวิตแต่เป็นของผู้ใช้อื่น = ไม่แตะ
  }
};
async function prepP213(state: P213Key): Promise<void> {
  if (state === "developers-pos" || P213.error) return;
  try {
    if (!P213.swept) {
      P213.swept = true;
      const rows = await prisma.apiKey.findMany({ where: { tenantId: T.tenantId, systemId: SYS, name: { endsWith: ")" } }, select: { id: true, name: true } });
      const dead = rows.filter((r) => {
        const m = P213_NAME_RE.exec(r.name);
        return !!m && !p213Alive(Number(m[1]));
      });
      if (dead.length) {
        await prisma.apiKey.deleteMany({ where: { tenantId: T.tenantId, systemId: SYS, id: { in: dead.map((r) => r.id) } } });
        P213.log.push(`กวาดซากคีย์ของรอบที่ตายแล้ว ${dead.length} ใบ`);
      }
    }
    if (state === "settings-shark-api-keys-raw") {
      const d = await prisma.apiKey.deleteMany({ where: { tenantId: T.tenantId, systemId: SYS, name: p213Name(P213_UI_LABEL) } });
      if (d.count) P213.log.push(`ลบคีย์ UI ของภาพก่อนหน้า ${d.count} ใบ`);
    }
    if ((state === "settings-shark-api-keys-list" || state === "settings-shark-api-keys-revoke") && !P213.listKeys) {
      const { createApiKey, revokeApiKey } = await import("@/lib/api-keys/service");
      const { expandBundles, POS_FILTER_UNIT_PREFIX } = await import("@/lib/api-keys/scopes");
      const ctx = { tenantId: T.tenantId };
      const by = T.users.owner.userId;
      const a = await createApiKey(ctx, p213Name("จอสรุปยอดหลังร้าน"), { scopes: [...expandBundles(["pos-read"]), `${POS_FILTER_UNIT_PREFIX}${unitId}`], systemId: SYS, expiresAt: new Date(Date.now() + 30 * 86_400_000), createdById: by });
      await prisma.apiKey.update({ where: { id: a.id }, data: { lastUsedAt: new Date(Date.now() - 3 * 3_600_000) } });
      const b = await createApiKey(ctx, p213Name("ระบบสั่งของเดิม"), { scopes: expandBundles(["pos-admin"]), systemId: SYS, expiresAt: null, createdById: by });
      if (!(await revokeApiKey(ctx, b.id))) throw new StepError("เพิกถอนคีย์ fixture ไม่สำเร็จ");
      P213.listKeys = true;
      P213.log.push(`คีย์ fixture 2 ใบ (อ่านอย่างเดียว·${unitKey} · ผู้ดูแล·เพิกถอนแล้ว)`);
    }
  } catch (e) {
    P213.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** หลังงาน P2.13 สุดท้าย / finally / สัญญาณ — ลบคีย์ของรอบ (ชื่อลงท้าย "(QC <pid นี้>)") · เรียกซ้ำได้ · ไม่โยน */
async function cleanupP213(): Promise<void> {
  if (P213.cleaned || !P213.swept) return;
  P213.cleaned = true;
  try {
    const d = await prisma.apiKey.deleteMany({ where: { tenantId: T.tenantId, systemId: SYS, name: { endsWith: `(QC ${process.pid})` } } });
    P213.log.push(`ลบคีย์ API ของรอบ ${d.count} ใบ`);
  } catch (e) {
    P213.ok = false;
    P213.log.push(`ลบคีย์ API ของรอบไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
}
/** การ์ดโหลดเสร็จ (ว่าง / รายการ / ปฏิเสธ / โหลดไม่สำเร็จ) → คืนสถานะที่ขึ้น */
async function p213Card(page: Any): Promise<"empty" | "list"> {
  await visibleEl(page, tid("pos-settings-api"), 0, 20_000).catch(() => {
    throw new StepError("ไม่มีการ์ดคีย์ API ในแท็บ shark (pos-settings-api)");
  });
  const got = (await page
    .waitForFunction(
      () => ["pos-settings-api-empty", "pos-settings-api-list", "pos-settings-api-refusal", "pos-settings-api-error"].find((id) => !!document.querySelector(`[data-testid="${id}"]`)) ?? false,
      { timeout: 20_000 },
    )
    .then((h: Any) => h.jsonValue())
    .catch(() => null)) as string | null;
  if (!got) throw new StepError("การ์ดคีย์ API ค้างที่กำลังโหลด (20 วิ)");
  if (got === "pos-settings-api-refusal") throw new StepError(`การ์ดคีย์ API ปฏิเสธ: ${await page.$eval(tid("pos-settings-api-refusal"), (e: Element) => (e.textContent ?? "").trim().slice(0, 120))}`);
  if (got === "pos-settings-api-error") throw new StepError("การ์ดคีย์ API โหลดไม่สำเร็จ (pos-settings-api-error)");
  const card = await visibleEl(page, tid("pos-settings-api"));
  await card.evaluate((el: Element) => el.scrollIntoView({ block: "start" }));
  return got === "pos-settings-api-empty" ? "empty" : "list";
}
/** เปิดกล่องสร้าง + กรอก (ชื่อของรอบ · ใช้งานหน้าร้าน · อายุ 90 · เลือกสาขาที่ถ่ายเมื่อ pickUnit หรือบังคับ) */
async function p213FillCreate(page: Any, pickUnit: boolean): Promise<void> {
  const kind = await p213Card(page);
  await clickEl(page, tid(kind === "empty" ? "pos-settings-api-empty-create" : "pos-settings-api-create"));
  await visibleEl(page, tid("pos-settings-api-dialog"), 0, 10_000);
  await typeInto(page, tid("pos-settings-api-name"), p213Name(P213_UI_LABEL));
  await clickEl(page, tid("pos-settings-api-bundle-pos-operate"));
  await page.select(tid("pos-settings-api-ttl"), "90");
  const hasScope = !!(await page.$(tid("pos-settings-api-scope-pick")));
  if (hasScope && userKey === "manager") throw new StepError("ผู้จัดการ 1 สาขาเห็นตัวเลือก \"ทุกสาขา/เลือกสาขา\" (allUnits ต้องเป็น false)");
  if (pickUnit || !hasScope) {
    if (hasScope) await clickEl(page, tid("pos-settings-api-scope-pick"));
    await clickEl(page, tid(`pos-settings-api-unit-${unitId}`));
  }
}
async function runP213State(page: Any, state: P213Key): Promise<void> {
  if (state === "developers-pos") {
    await visibleEl(page, tid("developers-pos"), 0, 20_000).catch(() => {
      throw new StepError("หน้า /developers/pos ไม่มี [data-testid=developers-pos]");
    });
    return;
  }
  if (P213.error) throw new StepError(`fixture P2.13: ${P213.error}`);
  if (state === "settings-shark-api-keys-empty") {
    if ((await p213Card(page)) !== "empty") {
      const n = await prisma.apiKey.count({ where: { tenantId: T.tenantId, systemId: SYS } });
      throw new StepError(`ระบบ POS ร้าน QC มีคีย์อยู่แล้ว ${n} ใบ — ภาพการ์ดว่างถ่ายไม่ได้ (รันทีละรอบ · คีย์ที่ไม่ใช่ของภาพ ผู้คุมงานตัดสิน)`);
    }
    await visibleEl(page, tid("pos-settings-api-empty-create"), 0, 5_000); // เจ้าของ/ผู้จัดการ = api.key.create
    return;
  }
  if (state === "settings-shark-api-keys-create") {
    await p213FillCreate(page, true);
    return; // 🔴 ไม่กดสร้าง
  }
  if (state === "settings-shark-api-keys-raw") {
    await p213FillCreate(page, false);
    await clickEl(page, tid("pos-settings-api-create-submit"));
    const got = (await page
      .waitForFunction(() => (document.querySelector('[data-testid="pos-settings-api-raw"]') ? "raw" : document.querySelector('[data-testid="pos-settings-api-create-error"]') ? "error" : false), { timeout: 20_000 })
      .then((h: Any) => h.jsonValue())
      .catch(() => null)) as string | null;
    if (got === "error") throw new StepError(`สร้างคีย์ถูกปฏิเสธ: ${await page.$eval(tid("pos-settings-api-create-error"), (e: Element) => (e.textContent ?? "").trim().slice(0, 120))}`);
    if (got !== "raw") throw new StepError("แผงคีย์ดิบไม่ขึ้นภายใน 20 วิหลังกดสร้าง");
    const raw = (await page.$eval(tid("pos-settings-api-raw-key"), (e: Element) => (e as HTMLInputElement).value)) as string;
    if (!/^shark_[0-9a-f]{20,}$/.test(raw)) throw new StepError("ช่องคีย์ดิบว่าง/ผิดรูป");
    return; // 🔴 ไม่กดคัดลอก/เสร็จแล้ว (ปิดแท็บ = ทิ้งคีย์ดิบ · แถวลบตอนเก็บกวาด)
  }
  // ── list / revoke ──
  if ((await p213Card(page)) !== "list") throw new StepError("การ์ดคีย์ API ว่าง — คีย์ fixture ไม่ขึ้น");
  const mine = await prisma.apiKey.findMany({ where: { tenantId: T.tenantId, systemId: SYS, name: { endsWith: `(QC ${process.pid})` } }, select: { id: true, revokedAt: true }, orderBy: { createdAt: "desc" } });
  for (const k of mine) await visibleEl(page, tid(`pos-settings-api-row-${k.id}`), 0, 10_000);
  if (state === "settings-shark-api-keys-list") return;
  const target = mine.find((k) => !k.revokedAt);
  if (!target) throw new StepError("ไม่มีคีย์ของรอบที่ยังใช้ได้ให้เพิกถอน");
  await clickEl(page, tid(`pos-settings-api-row-revoke-${target.id}`));
  await visibleEl(page, tid("pos-settings-api-revoke-confirm"), 0, 10_000);
  // 🔴 ไม่กดยืนยัน
}
async function runP29uState(page: Any, state: P29uRegKey | P29uOtherKey, device: Device): Promise<void> {
  if (P29U.error) throw new StepError(`fixture P2.9U: ${P29U.error}`);
  if (state === "settings-tip-ledger") {
    if (userKey !== "owner") {
      await visibleEl(page, tid("pos-settings-tip-owner-only"), 0, 15_000).catch(() => {
        throw new StepError("แคชเชียร์ไม่เห็น \"เฉพาะเจ้าของร้านตั้งค่าทิปได้\" (pos-settings-tip-owner-only)");
      });
      return;
    }
    await visibleEl(page, tid("pos-settings-tip-card"), 0, 15_000);
    await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-settings-tip-ledger"]') as HTMLSelectElement | null)?.disabled, { timeout: 15_000 }).catch(() => {
      throw new StepError("ตัวเลือกบัญชีพักทิปปิด (POS ไม่เชื่อมสมุด / ไม่มีบัญชีหนี้สิน)");
    });
    const first = await page.$eval(tid("pos-settings-tip-ledger"), (e: Element) => Array.from((e as HTMLSelectElement).options).map((o) => o.value).find((v) => !!v) ?? "");
    if (!first) throw new StepError("ไม่มีบัญชีหมวดหนี้สินในตัวเลือก");
    const sel = await visibleEl(page, tid("pos-settings-tip-ledger"));
    await sel.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
    await page.select(tid("pos-settings-tip-ledger"), first);
    await sleep(300);
    return; // 🔴 ไม่กดบันทึก
  }
  if (state === "refund-to-card") {
    let saleId = P29U.saleId;
    let cardId = P29U.cards.main?.id ?? "";
    if (!saleId) {
      // ไม่มีบิลของรอบนี้ (ถ่ายเฉพาะ refund-to-card) ⇒ บิลบัตรล่าสุดของวันนี้ในสาขา (ยังไม่คืน)
      const start = new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`));
      // POS P2.9U ▸ fix1 V3: บิลบัตรล่าสุดของวันนี้ที่บัตรยัง ACTIVE (บัตรของ sale-done-giftcard ไม่ถูกระงับตอนเก็บกวาด) ◂
      const cands = await prisma.posSale.findMany({
        where: { tenantId: T.tenantId, systemId: SYS, unitId, docType: "SALE", status: "PAID", refundedSatang: 0, createdAt: { gte: start }, payments: { some: { type: "GIFT_CARD" } } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, payments: { where: { type: "GIFT_CARD" }, select: { giftCardId: true } } },
      });
      const active = new Set(
        (await prisma.giftCard.findMany({ where: { tenantId: T.tenantId, status: "ACTIVE", id: { in: cands.flatMap((x) => x.payments.map((y) => y.giftCardId ?? "")).filter(Boolean) } }, select: { id: true } })).map((x) => x.id),
      );
      const s = cands.find((x) => x.payments.some((y) => !!y.giftCardId && active.has(y.giftCardId))) ?? null;
      if (!s) throw new StepError("ไม่มีบิลจ่ายด้วยบัตรของวันนี้ — ถ่าย sale-done-giftcard ก่อน");
      saleId = s.id;
      cardId = s.payments.find((y) => !!y.giftCardId && active.has(y.giftCardId))?.giftCardId ?? "";
    }
    const rn = (await prisma.posSale.findFirst({ where: { id: saleId, tenantId: T.tenantId }, select: { receiptNo: true } }))?.receiptNo;
    await visibleEl(page, tid("pos-bills-list"), 0, 15_000).catch(() => {
      throw new StepError("หน้าบิลวันนี้ไม่ขึ้น (pos-bills-list)");
    });
    const sel = `[data-bill-id="${saleId}"]`;
    const onPage1 = await visibleEl(page, sel, 0, 6_000).then(() => true).catch(() => false);
    if (!onPage1) {
      if (!rn) throw new StepError("บิลบัตรไม่อยู่หน้าแรกและไม่มีเลขบิลให้ค้น");
      await typeInto(page, tid("pos-bills-search"), rn);
      await visibleEl(page, sel, 0, 15_000);
    }
    await clickEl(page, sel);
    await visibleEl(page, tid("pos-bills-timeline"), 0, 15_000);
    if (userKey !== "owner") {
      const has = await visibleEl(page, tid("pos-bills-refund-open"), 0, 1_500).then(() => true).catch(() => false);
      if (has) throw new StepError("แคชเชียร์เห็นปุ่มคืนเงิน (ต้องซ่อน — ไม่มี pos.sale.refund)");
      return;
    }
    await clickEl(page, tid("pos-bills-refund-open"));
    await visibleEl(page, tid("pos-bills-refund-line"), 0, 15_000);
    await clickEl(page, tid("pos-bills-refund-line"));
    await visibleEl(page, tid(`pos-bills-refund-method-card-${cardId}`), 0, 15_000).catch(() => {
      throw new StepError("ไม่ขึ้นชิปคืนเข้าบัตร (refundTenderOptionsAction)");
    });
    const chipOff = await page.$eval(tid(`pos-bills-refund-method-card-${cardId}`), (e: Element) => (e as HTMLButtonElement).disabled).catch(() => true);
    if (chipOff) throw new StepError("ชิปคืนเข้าบัตรถูกปิด (บัตรใช้ไม่ได้) — บัตรของบิลต้อง ACTIVE");
    await clickEl(page, tid(`pos-bills-refund-method-card-${cardId}`));
    await sleep(300);
    return; // 🔴 ไม่กดยืนยันคืนเงิน
  }
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root)");
  });
  await ensureShift(page);
  await p29uCart(page, device);
  if (state === "paydlg-storecredit") {
    if (P29U.scError) throw new StepError(`เครดิตร้าน: ${P29U.scError}`);
    await attachQcMember(page, device, true);
    await p29uOpenPay(page, device);
    await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-method-storecredit"]') as HTMLButtonElement | null)?.disabled, { timeout: 15_000 }).catch(() => {
      throw new StepError("ช่องเครดิตร้านยังปิด (สมาชิกไม่มีเครดิต / benefits ยังไม่มา)");
    });
    await clickEl(page, tid("pos-reg-paydlg-method-storecredit"));
    await clickEl(page, tid("pos-reg-paydlg-add-split"));
    await visibleEl(page, tid("pos-reg-paydlg-storecredit-row"), 0, 5_000);
    return; // 🔴 ไม่ยืนยัน
  }
  await p29uOpenPay(page, device);
  switch (state) {
    case "paydlg-giftcard-entry":
      await p29uLookup(page, "main");
      await p29uPin(page, P29U_PIN);
      return; // 🔴 ไม่กดใช้บัตร
    case "paydlg-giftcard-split":
      await p29uCashSplit(page, 300);
      await p29uLookup(page, "main");
      await p29uAmount(page, device, 325);
      await p29uPin(page, P29U_PIN);
      await p29uUse(page);
      return; // 🔴 ไม่ยืนยัน
    case "paydlg-giftcard-pin-error":
      await p29uLookup(page, "pin");
      await p29uPin(page, P29U_WRONG_PIN);
      await p29uUse(page);
      await p29uCashExactConfirm(page);
      await visibleEl(page, tid("pos-reg-paydlg-giftcard-row-note-1"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันด้วย PIN ผิดแล้วไม่ขึ้น \"PIN ไม่ถูกต้อง\" ที่แถวบัตร");
      });
      return;
    case "paydlg-giftcard-insufficient":
      await p29uLookup(page, "small");
      await visibleEl(page, tid("pos-reg-paydlg-giftcard-insufficient"), 0, 5_000);
      await p29uPin(page, P29U_PIN);
      return; // 🔴 ไม่กดใช้บัตร
    case "paydlg-giftcard-changed": {
      const c = P29U.cards.chg;
      await p29uLookup(page, "chg");
      await p29uPin(page, P29U_PIN);
      await p29uUse(page);
      // ⚠️ ตัดยอดบัตรผ่านโมดูล (legacy use) ระหว่างค้นกับยืนยัน: แถว = ยอดบัตรทั้งใบ (คงเหลือของบิล 02 ≥ ยอดบัตร) ⇒ ตัดครึ่งใบ = ยอดใหม่ < แถว ⇒ GIFT_CARD_CHANGED
      const bal = (await prisma.giftCard.findUnique({ where: { id: c!.id }, select: { balanceSatang: true } }))?.balanceSatang ?? 0;
      if (bal < 2) throw new StepError("ยอดบัตร CHANGED เหลือน้อยเกินไป");
      const gc = await import("@/lib/modules/giftcard");
      await gc.use(p29uGctx(), { number: c!.number, pin: P29U_PIN, satang: Math.ceil(bal / 2), saleId: `posqc-vis-p29u-${process.pid}-chg-${++P29U.chgN}`, idempotencyKey: `posqc-vis-p29u-${process.pid}-chg-${P29U.chgN}` });
      await p29uCashExactConfirm(page);
      await visibleEl(page, tid("pos-reg-paydlg-giftcard-changed"), 0, 20_000).catch(() => {
        throw new StepError("ยอดบัตรเปลี่ยนแล้วยืนยัน ไม่ขึ้นแบนเนอร์ \"ยอดบัตรเปลี่ยน\"");
      });
      // POS P2.9U ▸ fix1 V1: ค้นใหม่แล้วแผงบัตรของแถวเปิดเอง พร้อมช่อง PIN ◂
      await visibleEl(page, tid("pos-reg-paydlg-giftcard-pin"), 0, 15_000).catch(() => {
        throw new StepError("หลังยอดบัตรเปลี่ยน แผงใส่ PIN ของแถวไม่เปิดเอง");
      });
      await sleep(400);
      return;
    }
    case "paydlg-tip":
      if (P29U.tipError) throw new StepError(`ทิป: ${P29U.tipError}`);
      await clickEl(page, tid("pos-reg-paydlg-tip-toggle")).catch(() => {
        throw new StepError("ไม่เห็นสวิตช์ทิป (ร้านเปิดทิป — fixture?)");
      });
      await typeInto(page, tid("pos-reg-paydlg-tip"), "20");
      await p29uCashSplit(page, 300);
      await visibleEl(page, tid("pos-reg-paydlg-tip-total"), 0, 5_000);
      return; // 🔴 ไม่ยืนยัน
    case "sale-done-giftcard": {
      await p29uLookup(page, "main");
      await p29uAmount(page, device, 325);
      await p29uPin(page, P29U_PIN);
      await p29uUse(page);
      await p29uCashExactConfirm(page);
      await visibleEl(page, tid("pos-reg-done"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันแล้วไม่ขึ้นจอสำเร็จ (pos-reg-done)");
      });
      await visibleEl(page, tid("pos-reg-done-pay-lines"), 0, 10_000);
      const cardId = P29U.cards.main?.id ?? "";
      const s = await prisma.posSale.findFirst({ where: { tenantId: T.tenantId, unitId, docType: "SALE", payments: { some: { giftCardId: cardId } } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (s) P29U.saleId = s.id;
      await sleep(1_200); // payload ใบเสร็จ (เลขปิดบัง · คงเหลือ)
      return;
    }
  }
}
// ═══════════════════ POS P2.9bU ▸ มัดจำ: fixture + ขั้นตอนของสถานะ (มติผู้คุม P2.9bU ข้อ 9) ═══════════════════
//   🔴 เบอร์ walk-in ของ fixture = ค่าคงที่ในโค้ดนี้เท่านั้น (4 หลักท้ายพิมพ์ลงช่อง password ของจอ) · ห้ามพิมพ์ลง log/summary/ชื่อไฟล์
//   มัดจำทุกใบผ่าน pos/deposit.ts registerTakeDeposit (เครื่อง DEVICE_ID ที่เจ้าของเปิดกะให้ · โอน — ไม่แตะเงินสดในลิ้นชัก) ·
//   locked = deposit-links.checkDepositPhone ผิด 5 ครั้ง · exceeds = submitRegisterSale บิล ฿1 จ่ายด้วยมัดจำ ฿1 · เก็บกวาด = registerRefundDeposit (โอน) ทุกใบที่ยังเหลือ
const P29BU_PHONE = "0800000427"; // P2.9bU fix1 มติ 6: เบอร์ปลอมเห็นชัด (08x-000-xxxx) — ภาพ deposit-receive แสดงเบอร์ที่พิมพ์ (ไม่ปิดบัง · .qc-shots/ อยู่ใน .gitignore) · 4 หลักท้ายเดิม
const P29BU_WRONG4 = "1111";
const P29BU_LAST4 = P29BU_PHONE.slice(-4);
type P29buDep = { id: string; receiptNo: string; receiptSaleId: string };
const P29BU = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  cleaned: false,
  n: 0,
  settingBefore: null as null | boolean,
  /** มัดจำทุกใบของรอบ (เก็บกวาดคืนเงินที่ยังเหลือ) */
  deps: [] as P29buDep[],
  pick: null as P29buDep | null,
  own: null as P29buDep | null,
  /** มัดจำของ sale-done-deposit (refund-deposit ใช้ต่อเฉพาะรันเดียวกัน — รัน --page sales แยก = null ⇒ fixture ฿1,000 ใบใหม่ · P2.9bU fix1 มติ 5) */
  sale: null as P29buDep | null,
};
const p29buCtx = () => ({ tenantId: T.tenantId, systemId: SYS, unitId, deviceId: DEVICE_ID });
/** รับมัดจำผ่านโมดูล (โอน · walk-in + เบอร์ของ fixture หรือสมาชิก QC) — ล้ม = StepError พร้อมรหัส */
async function p29buTake(tag: string, satang: number, opts: { member?: string; name?: string } = {}): Promise<P29buDep> {
  const dep = await import("@/lib/modules/pos/deposit");
  const k = `posqc-vis-p29bu-${process.pid}-${tag}-${++P29BU.n}`;
  const r = (await dep.registerTakeDeposit(p29buCtx() as Any, (await ownerActor()) as Any, {
    amountSatang: satang,
    payMethods: [{ type: "TRANSFER", amountSatang: satang }],
    ...(opts.member ? { memberId: opts.member } : { customerName: opts.name ?? "คุณอรทัย (QC)", phone: P29BU_PHONE }),
    note: `QC P2.9bU ${tag}`,
    idempotencyKey: k,
  })) as Any;
  if (!r?.ok) throw new StepError(`รับมัดจำ fixture ${tag} ไม่ได้: ${r?.code ?? "?"}`);
  const d: P29buDep = { id: r.deposit.id, receiptNo: String(r.receiptNo ?? r.deposit.receiptNo ?? ""), receiptSaleId: r.deposit.receiptSaleId };
  P29BU.deps.push(d);
  return d;
}
/** fixture ก่อนงานแรกของใบนี้ — พังไม่โยน (P29BU.error · สถานะตกพร้อมเหตุผล) */
async function ensureP29buFixture(): Promise<void> {
  if (P29BU.done || P29BU.error) return;
  try {
    const ps = await import("@/lib/modules/pos/payment-settings");
    const cur = await ps.posPaymentSettings({ tenantId: T.tenantId, systemId: SYS });
    if (!cur.ok) throw new StepError(`อ่านค่าตั้งการชำระเงินไม่ได้: ${cur.code}`);
    if (!cur.deposit.enabled) {
      const r = await ps.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, (await ownerActor()) as Any, { deposit: { enabled: true } });
      if (!r.ok) throw new StepError(`เปิดรับมัดจำไม่ได้: ${r.code}`);
      P29BU.settingBefore = false;
      P29BU.log.push("เปิดค่าตั้งรับมัดจำ (คืนค่าตอนเก็บกวาด)");
    } else P29BU.log.push("ค่าตั้งรับมัดจำเปิดอยู่แล้ว");
    const regStates = jobs.filter((j) => isP29buState(j.state) && j.page === "register");
    if (regStates.some((j) => j.state === "paydlg-deposit-pick" || j.state === "paydlg-deposit-split")) {
      P29BU.pick = await p29buTake("pick", 107_000);
      P29BU.log.push(`มัดจำ pick/split #${P29BU.pick.receiptNo} ฿1,070`);
    }
    if (regStates.some((j) => j.state && ["paydlg-deposit-pick", "paydlg-deposit-split", "paydlg-deposit-exceeds", "paydlg-deposit-notowner", "paydlg-deposit-locked", "sale-done-deposit"].includes(j.state))) await prepMemberFixture(); // คูปอง WELCOME50 ของตะกร้า 02 + สมาชิก QC
    if (regStates.some((j) => j.state === "paydlg-deposit-notowner")) {
      if (MEMBERX.error || !MEMBERX.id) throw new StepError(`สมาชิก QC: ${MEMBERX.error ?? "ไม่มี"}`);
      P29BU.own = await p29buTake("own", 50_000, { member: MEMBERX.id });
      P29BU.log.push(`มัดจำของสมาชิก QC #${P29BU.own.receiptNo} ฿500`);
    }
    P29BU.done = true;
  } catch (e) {
    P29BU.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** เก็บกวาด (หลังงานสุดท้าย · finally · สัญญาณ — เรียกซ้ำได้): คืนเงินมัดจำของรอบที่ยังเหลือ (โอน · ทั้งยอด) · คืนค่าตั้ง · บิลคงอยู่ */
async function cleanupP29bu(): Promise<void> {
  if (P29BU.cleaned || (!P29BU.deps.length && P29BU.settingBefore === null)) return;
  P29BU.cleaned = true;
  try {
    const dep = await import("@/lib/modules/pos/deposit");
    const owner = (await ownerActor()) as Any;
    let n = 0;
    for (const d of P29BU.deps) {
      const row = await prisma.posDeposit.findFirst({ where: { id: d.id, tenantId: T.tenantId }, select: { status: true, amountSatang: true, usedSatang: true, refundedSatang: true } });
      const left = row ? row.amountSatang - row.usedSatang - row.refundedSatang : 0;
      if (!row || row.status !== "OPEN" || left <= 0) continue;
      const r = (await dep.registerRefundDeposit({ tenantId: T.tenantId, systemId: SYS, unitId } as Any, owner, {
        depositId: d.id,
        payMethods: [{ type: "TRANSFER", amountSatang: left }],
        reason: "QC P2.9bU visual (เก็บกวาด fixture ของรอบ)",
        idempotencyKey: `posqc-vis-p29bu-${process.pid}-ref-${d.id.slice(-12)}`,
      })) as Any;
      if (r?.ok) n++;
      else {
        P29BU.ok = false;
        P29BU.log.push(`⚠️ คืนมัดจำ #${d.receiptNo} ไม่ได้: ${r?.code ?? "?"}`);
      }
    }
    P29BU.log.push(`คืนเงินมัดจำของรอบ ${n} ใบ (โอน · ใบรับ/ใบคืน/บิลคงอยู่)`);
  } catch (e) {
    P29BU.ok = false;
    P29BU.log.push(`⚠️ คืนเงินมัดจำไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  if (P29BU.settingBefore === false) {
    try {
      const ps = await import("@/lib/modules/pos/payment-settings");
      const r = await ps.updatePosPaymentSettings({ tenantId: T.tenantId, systemId: SYS }, (await ownerActor()) as Any, { deposit: { enabled: false } });
      P29BU.log.push(r.ok ? "คืนค่าตั้งรับมัดจำ (ปิด)" : `⚠️ คืนค่าตั้งรับมัดจำไม่ได้: ${r.code}`);
      if (!r.ok) P29BU.ok = false;
    } catch (e) {
      P29BU.ok = false;
      P29BU.log.push(`⚠️ คืนค่าตั้งรับมัดจำไม่ได้: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
    P29BU.settingBefore = null;
  }
}
/** ช่องมัดจำ → ค้นเลขใบเสร็จ → (4 หลักท้าย) → เห็นยอด (มติ 2a–b) */
async function p29buPick(page: Any, d: P29buDep, opts: { last4?: string | null } = {}): Promise<void> {
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-method-deposit"]') as HTMLButtonElement | null)?.disabled, { timeout: 15_000 }).catch(() => {
    throw new StepError("ช่องมัดจำยังปิด (registerPayTendersAction.deposit.enabled — ค่าตั้งรับมัดจำของ POS QC เปิดหรือยัง?)");
  });
  await clickEl(page, tid("pos-reg-paydlg-method-deposit"));
  await typeInto(page, tid("pos-reg-paydlg-deposit-search"), d.receiptNo);
  await clickEl(page, tid("pos-reg-paydlg-deposit-lookup"));
  await visibleEl(page, tid("pos-reg-paydlg-deposit-row-1"), 0, 15_000).catch(() => {
    throw new StepError("ค้นเลขใบเสร็จแล้วไม่ขึ้นแถวมัดจำ (pos-reg-paydlg-deposit-row-1)");
  });
  const needs = await visibleEl(page, tid("pos-reg-paydlg-deposit-last4"), 0, 2_500).then(() => true).catch(() => false);
  if (needs && opts.last4 !== null) {
    const h = await visibleEl(page, tid("pos-reg-paydlg-deposit-last4"));
    await h.click();
    await h.type(opts.last4 ?? P29BU_LAST4);
  }
  await visibleEl(page, tid("pos-reg-paydlg-deposit-amount"), 0, 15_000).catch(() => {
    throw new StepError("ไม่เห็นยอดของมัดจำ (4 หลักท้ายไม่ผ่าน / ถูกล็อก?)");
  });
  await sleep(250);
}
async function p29buUse(page: Any): Promise<void> {
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-deposit-use"]') as HTMLButtonElement | null)?.disabled, { timeout: 5_000 }).catch(() => {
    throw new StepError("ปุ่ม \"ใช้มัดจำนี้\" ยังปิด");
  });
  await clickEl(page, tid("pos-reg-paydlg-deposit-use"));
  await visibleEl(page, tid("pos-reg-paydlg-deposit-split-1"), 0, 5_000).catch(() => {
    throw new StepError("ใช้มัดจำแล้วไม่ขึ้นแถว (pos-reg-paydlg-deposit-split-1)");
  });
}
/** รอบสุดท้ายเงินสดพอดี → (ก่อนยืนยัน: hook) → ยืนยัน */
async function p29buCashExactConfirm(page: Any, before?: () => Promise<void>): Promise<void> {
  await clickEl(page, tid("pos-reg-paydlg-method-cash"));
  await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
  await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 8_000 }).catch(() => {
    throw new StepError("ปุ่มยืนยันรับเงินยังปิด (ยอดครบ?)");
  });
  if (before) await before();
  await clickEl(page, tid("pos-reg-paydlg-confirm"));
}
async function runP29buState(page: Any, state: P29buKey, device: Device): Promise<void> {
  if (P29BU.error) throw new StepError(`fixture P2.9bU: ${P29BU.error}`);
  if (state === "settings-deposit-toggle") {
    await visibleEl(page, tid("pos-settings-deposit-card"), 0, 15_000);
    const sw = await visibleEl(page, tid("pos-settings-deposit-enabled"), 0, 15_000).catch(() => {
      throw new StepError("ไม่เห็นสวิตช์รับเงินมัดจำ (pos-settings-deposit-enabled)");
    });
    if ((await sw.evaluate((e: Element) => e.getAttribute("aria-checked"))) !== "true") throw new StepError("สวิตช์รับเงินมัดจำไม่เปิด (fixture เปิดค่าตั้งแล้ว)");
    await sw.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    return; // 🔴 ไม่กด (บันทึกทันที)
  }
  if (state === "bills-deposit-filter" || state === "refund-deposit") {
    await visibleEl(page, tid("pos-bills-list"), 0, 15_000).catch(() => {
      throw new StepError("หน้าบิลวันนี้ไม่ขึ้น (pos-bills-list)");
    });
    if (state === "bills-deposit-filter") {
      await clickEl(page, tid("pos-bills-filter-deposit"));
      await page.waitForNetworkIdle({ idleTime: 600, timeout: 15_000 }).catch(() => undefined); // รายการใหม่ของตัวกรอง (ไม่ใช่แถวเดิมก่อนกด)
      await page
        .waitForFunction(
          () =>
            document.querySelector('[data-testid="pos-bills-filter-deposit"]')?.getAttribute("aria-pressed") === "true" &&
            Array.from(document.querySelectorAll("[data-bill-id]")).some((e) => e.getClientRects().length > 0),
          { timeout: 15_000 },
        )
        .catch(() => {
          throw new StepError("ชิปมัดจำแล้วไม่ขึ้นใบรับเงินมัดจำของวันนี้");
        });
      await sleep(400);
      return;
    }
    const d = P29BU.sale ?? (await p29buTake("refund", 100_000));
    const sel = `[data-bill-id="${d.receiptSaleId}"]`;
    const onPage1 = await visibleEl(page, sel, 0, 6_000).then(() => true).catch(() => false);
    if (!onPage1) {
      await typeInto(page, tid("pos-bills-search"), d.receiptNo);
      await visibleEl(page, sel, 0, 15_000);
    }
    await clickEl(page, sel);
    await visibleEl(page, tid("pos-bills-drawer-deposit-title"), 0, 15_000);
    await clickEl(page, tid("pos-bills-refund-deposit")).catch(() => {
      throw new StepError("ไม่เห็นปุ่ม \"คืนมัดจำ\" ในลิ้นชักใบรับ");
    });
    await visibleEl(page, tid("pos-bills-refund-deposit-sheet"), 0, 10_000);
    const needs = await visibleEl(page, tid("pos-bills-refund-deposit-last4"), 0, 2_000).then(() => true).catch(() => false);
    if (needs) {
      const h = await visibleEl(page, tid("pos-bills-refund-deposit-last4"));
      await h.click();
      await h.type(P29BU_LAST4);
      await clickEl(page, tid("pos-bills-refund-deposit-check"));
      await page
        .waitForFunction(() => ((document.querySelector('[data-testid="pos-bills-refund-deposit-amount"]') as HTMLInputElement | null)?.value ?? "-") !== "-", { timeout: 10_000 })
        .catch(() => {
          throw new StepError("ใส่ 4 หลักท้ายแล้วไม่เห็นยอดคงเหลือ");
        });
    }
    await clickEl(page, tid("pos-bills-refund-deposit-method-cash"));
    await typeInto(page, tid("pos-bills-refund-deposit-reason"), "ลูกค้ายกเลิกการจอง");
    await sleep(300);
    return; // 🔴 ไม่กดยืนยันคืนมัดจำ
  }
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root)");
  });
  await ensureShift(page);
  if (state === "deposit-receive") {
    const entry = device === "mobile" ? tid("pos-reg-mobile-deposit-receive") : tid("pos-reg-more");
    await visibleEl(page, entry, 0, 15_000).catch(() => {
      throw new StepError("ไม่เห็นทางเข้า \"รับมัดจำ\" (ค่าตั้งรับมัดจำ / registerPayTendersAction)");
    });
    await clickEl(page, entry);
    if (device !== "mobile") {
      await visibleEl(page, tid("pos-reg-menu-deposit-receive"), 0, 10_000).catch(() => {
        throw new StepError("เมนู ⋯ ไม่มี \"รับมัดจำ\"");
      });
      await clickEl(page, tid("pos-reg-menu-deposit-receive"));
    }
    await visibleEl(page, tid("pos-reg-deprcv"), 0, 10_000);
    await typeInto(page, tid("pos-reg-deprcv-amount"), "500");
    await typeInto(page, tid("pos-reg-deprcv-name"), "คุณอรทัย");
    await typeInto(page, tid("pos-reg-deprcv-phone"), P29BU_PHONE);
    await typeInto(page, tid("pos-reg-deprcv-note"), "จองโต๊ะ 19:00");
    await clickEl(page, tid("pos-reg-deprcv-method-cash"));
    await typeInto(page, tid("pos-reg-deprcv-cash"), "1000");
    await sleep(300);
    return; // 🔴 ไม่กดรับมัดจำ
  }
  await p29uCart(page, device);
  await p29uOpenPay(page, device);
  switch (state) {
    case "paydlg-deposit-pick":
      await p29buPick(page, P29BU.pick!);
      return; // 🔴 ไม่กดใช้
    case "paydlg-deposit-split":
      await p29uCashSplit(page, 300);
      await p29buPick(page, P29BU.pick!);
      await p29buUse(page);
      return; // 🔴 ไม่ยืนยัน
    case "paydlg-deposit-exceeds": {
      const d = await p29buTake("exc", 50_000);
      await p29buPick(page, d);
      await p29buUse(page);
      await p29buCashExactConfirm(page, async () => {
        // ⚠️ ใช้มัดจำ ฿1 ผ่านโมดูล (บิล ฿1 PAID · คงอยู่) ⇒ คงเหลือ < แถวของจอ ⇒ DEPOSIT_EXCEEDS ตอนยืนยัน
        const reg = await import("@/lib/modules/pos/register");
        const owner = (await ownerActor()) as Any;
        const cart = { lines: [{ name: "QC P2.9bU exceeds", qty: 1, unitPriceSatang: 100 }] };
        const q = (await reg.quoteRegisterCart(p29buCtx() as Any, owner, cart as Any)) as Any;
        if (!q?.ok) throw new StepError(`quote บิล ฿1 ไม่ได้: ${q?.code ?? "?"}`);
        const r = (await reg.submitRegisterSale(p29buCtx() as Any, owner, {
          ...cart,
          idempotencyKey: `posqc-vis-p29bu-${process.pid}-exc1-${P29BU.n}`,
          expectedGrandTotalSatang: q.grandTotalSatang,
          payMethods: [{ type: "DEPOSIT", amountSatang: q.grandTotalSatang, depositId: d.id, phoneLast4: P29BU_LAST4 }],
        } as Any)) as Any;
        if (!r?.ok) throw new StepError(`ใช้มัดจำ ฿1 ผ่านโมดูลไม่ได้: ${r?.code ?? "?"}`);
      });
      await visibleEl(page, tid("pos-reg-paydlg-deposit-changed"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันแล้วไม่ขึ้นแบนเนอร์ \"ยอดมัดจำเปลี่ยน\" (DEPOSIT_EXCEEDS)");
      });
      await sleep(1_000); // ค้นแถวมัดจำใหม่ (จำนวนตัดลง)
      return;
    }
    case "paydlg-deposit-notowner":
      await p29buPick(page, P29BU.own!, { last4: null });
      await p29buUse(page);
      await p29buCashExactConfirm(page);
      await visibleEl(page, tid("pos-reg-paydlg-deposit-note"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันแล้วไม่ขึ้นข้อความ DEPOSIT_NOT_OWNER ใต้รายการ");
      });
      return;
    case "paydlg-deposit-locked": {
      const d = await p29buTake("lock", 50_000);
      await p29buPick(page, d);
      await p29buUse(page);
      await p29buCashExactConfirm(page, async () => {
        // ⚠️ 4 หลักผิด 5 ครั้งผ่านโมดูล (ตัวนับของมัดจำใบนี้) ⇒ ล็อก 15 นาที ⇒ DEPOSIT_LOCKED ตอนยืนยัน
        const links = await import("@/lib/modules/pos/deposit-links");
        const row = await prisma.posDeposit.findFirst({ where: { id: d.id, tenantId: T.tenantId }, select: { id: true, phoneLast4: true } });
        if (!row) throw new StepError("ไม่พบมัดจำ locked");
        for (let i = 0; i < links.DEPOSIT_PHONE_MAX_FAIL; i++) await links.checkDepositPhone(T.tenantId, row, P29BU_WRONG4);
      });
      await visibleEl(page, tid("pos-reg-paydlg-deposit-note"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันแล้วไม่ขึ้นข้อความ DEPOSIT_LOCKED ใต้รายการ");
      });
      return;
    }
    case "sale-done-deposit": {
      const d = (P29BU.sale = await p29buTake("sale", 100_000));
      await p29buPick(page, d);
      await p29buUse(page);
      await page.waitForFunction(() => !(document.querySelector('[data-testid="pos-reg-paydlg-confirm"]') as HTMLButtonElement | null)?.disabled, { timeout: 8_000 }).catch(() => {
        throw new StepError("มัดจำทั้งยอดแล้วปุ่มยืนยันยังปิด");
      });
      await clickEl(page, tid("pos-reg-paydlg-confirm"));
      await visibleEl(page, tid("pos-reg-done"), 0, 20_000).catch(() => {
        throw new StepError("ยืนยันแล้วไม่ขึ้นจอสำเร็จ (pos-reg-done)");
      });
      await visibleEl(page, tid("pos-reg-done-pay-lines"), 0, 10_000);
      await sleep(1_200); // payload ใบเสร็จ (เลขใบรับ · คงเหลือ)
      return;
    }
  }
}
async function runP28uState(page: Any, state: P28uOrdersKey | P28uRegKey, device: Device): Promise<void> {
  if (state === "register-tab-badge") {
    await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
    await ensureShift(page);
    if (P28U.error) throw new StepError(`fixture P2.8U: ${P28U.error}`);
    // POS P2.14 ▸ U2 H5 (CD-U2c): 390 ไม่มีแถบโหมด — ป้ายอยู่ที่ปุ่มออเดอร์บนหัวมือถือ (UI-13 · ขึ้นเมื่อมีออเดอร์ใหม่ · ออเดอร์ของ fixture P2.8U สร้างก่อนงานแรกแล้ว) ◂
    if (device === "mobile") {
      await visibleEl(page, tid("pos-reg-mobile-orders-badge"), 0, 20_000).catch(() => {
        throw new StepError("ป้ายนับออเดอร์ใหม่บนหัวมือถือไม่ขึ้นภายใน 20 วิ");
      });
      return;
    }
    // ◂
    await visibleEl(page, tid("pos-reg-tab-online-orders"), 0, 10_000);
    await visibleEl(page, tid("pos-reg-tab-orders-badge"), 0, 20_000).catch(() => {
      throw new StepError("ป้ายนับออเดอร์ใหม่บนแท็บไม่ขึ้นภายใน 20 วิ");
    });
    return;
  }
  await visibleEl(page, tid("pos-ord-root"), 0, 15_000);
  if (state === "orders-empty") {
    await visibleEl(page, tid("pos-ord-empty"), 0, 20_000).catch(() => {
      throw new StepError("สาขาอารีย์มีออเดอร์วันนี้ (ไม่ใช่สถานะว่าง)");
    });
    return;
  }
  if (P28U.error) throw new StepError(`fixture P2.8U: ${P28U.error}`);
  const card = (k: string) => tid(`pos-ord-card-${P28U.refs[k]}`);
  const openPanel = async (k: string) => {
    if (device === "mobile" && k !== "lm" && k !== "grab") {
      // มือถือ = ทีละคอลัมน์ — การ์ดที่ไม่ใช่ "ใหม่" อยู่คอลัมน์อื่น
      await clickEl(page, tid("pos-ord-coltab-preparing"));
    }
    await clickEl(page, card(k));
    await visibleEl(page, tid("pos-ord-panel"), 0, 15_000);
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-ord-panel"]')).some((e) => e.getClientRects().length > 0 && e.getAttribute("data-status")), { timeout: 15_000 })
      .catch(() => {
        throw new StepError("แผงรายละเอียดไม่โหลด (getOrderAction)");
      });
  };
  await visibleEl(page, card("lm"), 0, 20_000);
  switch (state) {
    case "orders-mixed": {
      if (device === "mobile") {
        await visibleEl(page, card("grab"), 0, 5_000);
        await clickEl(page, tid("pos-ord-coltab-preparing"));
        await visibleEl(page, card("prep"), 0, 5_000);
      } else {
        for (const k of ["grab", "late", "prep", "ready"]) await visibleEl(page, card(k), 0, 10_000);
        await visibleEl(page, tid(`pos-ord-done-${P28U.refs.done}`), 0, 10_000);
      }
      // กำลังเตรียม "เลยเวลา" (เวลาเตรียม 1 นาที) — รอให้เลยจริง (≤ 90 วิ · ตัวนับเดินฝั่ง client)
      await page
        .waitForFunction((sel: string) => document.querySelector(sel)?.getAttribute("data-late") === "1", { timeout: 90_000 }, card("late"))
        .catch(() => {
          throw new StepError("การ์ด \"เลยเวลาเตรียม\" ไม่ขึ้นภายใน 90 วิ");
        });
      if (device === "desktop") await clickEl(page, card("lm"));
      return;
    }
    case "orders-new-late": {
      const sel = card("newLate");
      await visibleEl(page, sel, 0, 20_000);
      await page
        .waitForFunction((s: string) => {
          const n = Number(document.querySelector(s.replace("pos-ord-card-", "pos-ord-card-timer-"))?.getAttribute("data-left") ?? "999");
          return n > 0 && n < 60;
        }, { timeout: 75_000 }, sel)
        .catch(() => {
          throw new StepError("ตัวนับของออเดอร์ใหม่ไม่ลงต่ำกว่า 60 วิ ภายใน 75 วิ");
        });
      return;
    }
    case "orders-detail-platform":
      await openPanel("lm");
      await visibleEl(page, tid("pos-bill-commission"), 0, 10_000);
      return;
    case "orders-detail-direct-unpaid":
      await openPanel("prep");
      await visibleEl(page, tid("pos-ord-pay"), 0, 10_000);
      return;
    case "orders-paused-banner":
      await visibleEl(page, tid("pos-ord-paused-CHAT"), 0, 20_000);
      return;
    case "orders-reject-sheet":
      if (userKey === "owner") {
        await clickEl(page, tid(`pos-ord-card-reject-${P28U.refs.lm}`));
        await visibleEl(page, tid("pos-ord-reject-sheet"), 0, 10_000);
      } else {
        await openPanel("lm");
        const off = await page.$eval(tid("pos-ord-accept"), (e: Element) => (e as HTMLButtonElement).disabled).catch(() => null);
        if (off !== true) throw new StepError("แคชเชียร์: ปุ่มรับออเดอร์ในแผงไม่ได้ถูกปิด");
      }
      return;
    case "orders-manual-sheet": {
      await clickEl(page, tid("pos-ord-manual"));
      await visibleEl(page, tid("pos-ord-manual-sheet"), 0, 10_000);
      await visibleEl(page, tid(`pos-ord-man-product-${QC_IDS.amer}`), 0, 15_000);
      await clickEl(page, tid(`pos-ord-man-product-${QC_IDS.amer}`));
      // POS P2.14 ▸ UI-7 (P2.8U V2): clickEl เลื่อนรายการสินค้าในแผ่นให้แถวอยู่กลาง ⇒ คืน scrollTop 0 ของกล่องเลื่อนแรก (ภาพ = ที่ผู้ใช้เห็นตอนเปิด) ◂
      await page
        .$eval(tid(`pos-ord-man-product-${QC_IDS.amer}`), (e: Element) => {
          let box = e.parentElement;
          while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
          if (box) box.scrollTop = 0;
        })
        .catch(() => undefined);
      await page
        .waitForFunction(() => /\d/.test(document.querySelector('[data-testid="pos-ord-man-total"]')?.textContent ?? ""), { timeout: 15_000 })
        .catch(() => {
          throw new StepError("ยอดรายการ (quote ของช่องทาง) ไม่มา");
        });
      await page.type(tid("pos-ord-man-name"), "คุณทดสอบ (ภาพ QC)");
      await page.type(tid("pos-ord-man-platform-total"), "1");
      await visibleEl(page, tid("pos-ord-man-mismatch"), 0, 5_000);
      return;
    }
    case "orders-pay-dialog":
      await openPanel("prep");
      await clickEl(page, tid("pos-ord-pay"));
      await visibleEl(page, tid("pos-reg-paydlg"), 0, 15_000);
      return;
  }
}

// ═══════════════════ POS P2.3U ▸ fixture สูตร/วัตถุดิบ + ขั้นตอนของสถานะ (มติ 10) ═══════════════════
//   วัตถุดิบ (InvItem) + กลุ่ม "ขนาด" + เมนูชั่วคราว = เขียนตรงด้วย prisma แบบ fixture P1.3 (สคริปต์ · F15.1 สแกนเฉพาะ src/) · ไอดี posqc-vis-<pid>-p23u-<รอบ>-* ·
//   สูตร/ส่วนต่าง/สวิตช์ = catalog.setRecipe / setRecipeChoiceLines / setBomEnabled ในนามเจ้าของร้าน (ตัวเขียนจริงของ S) ·
//   บิลค้างตัด (register-pending-cuts) = createSale ใน tx ของสคริปต์ (ไม่มีขั้นตัดสต็อกหลัง commit — แบบ V6 ของ qc-pos-p2.3) → voidSale หลังภาพ ·
//   สร้างก่อนงานแรกของ "ช่วงติดกัน" ที่ใช้ · ลบทั้งชุดหลังงานสุดท้ายของช่วง/finally/สัญญาณ (หน้าอื่นไม่เห็นสินค้าชั่วคราว) · ซากเกิน 1 ชม. ถูกกวาดก่อนสร้าง
const P23U = {
  round: 0,
  done: false,
  error: null as string | null,
  ids: { latte: "", coke: "", empty: "", caramel: "" },
  items: { beans: "", milk: "", cup12: "", cup16: "", lid: "", syrup: "", coke: "" },
  choice: { S: "", M: "", L: "" },
  products: [] as string[],
  itemIds: [] as string[],
  groups: [] as string[],
  pendingSale: "",
  log: [] as string[],
  ok: true,
};
const P23U_PEND_PREFIX = `${FIX.prefix}p23u-pend-`;
/** ซากของรอบที่ถูก kill (เกิน 1 ชม.): บิลค้างตัด PAID → ยกเลิก · สินค้า/กลุ่ม/วัตถุดิบ → ลบ (เฉพาะไอดี/คีย์ของ P2.3U) */
async function sweepP23u(): Promise<string> {
  const old = new Date(Date.now() - 60 * 60 * 1000);
  const { voidSale } = await import("@/lib/modules/pos/service");
  const actor = await ownerActor();
  const sales = await prisma.posSale.findMany({ where: { tenantId: T.tenantId, unitId, status: "PAID", idempotencyKey: { startsWith: P23U_PEND_PREFIX }, createdAt: { lt: old } }, select: { id: true } });
  for (const x of sales) await voidSale(T.tenantId, unitId, x.id, { actorUserId: actor.userId, reason: "ภาพ QC P2.3U — ซากบิลค้างตัดของรอบก่อน" });
  const like = { startsWith: FIX.prefix, contains: "-p23u-" };
  const groups = (await prisma.menuOptionGroup.findMany({ where: { tenantId: T.tenantId, id: like, createdAt: { lt: old } }, select: { id: true } })).map((g) => g.id);
  if (groups.length) await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: groups } } });
  const products = (await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: like, createdAt: { lt: old } } })).count;
  if (groups.length) {
    await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: groups } } });
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: groups } } });
  }
  const items = (await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: like, createdAt: { lt: old } } })).count;
  return sales.length || products || items || groups.length ? `ซาก: บิล ${sales.length} · สินค้า ${products} · กลุ่ม ${groups.length} · วัตถุดิบ ${items}` : "";
}
async function ensureP23uFixture(): Promise<void> {
  if (P23U.done || P23U.error) return;
  try {
    const swept = await sweepP23u();
    if (swept) P23U.log.push(swept);
    const inv = (T.systems as Record<string, { id: string }>).INVENTORY!.id;
    const round = ++P23U.round;
    const tag = `${FIX.prefix}${process.pid}-p23u-${round}`;
    const mkItem = async (k: string, name: string, unitLabel: string, onHand: number, costSatang: number) => {
      const id = `${tag}-i-${k}`;
      P23U.itemIds.push(id);
      await prisma.invItem.create({ data: { id, tenantId: T.tenantId, systemId: inv, sku: `PQC-P23U-${process.pid}-${round}-${k}`.toUpperCase(), name, unitLabel, onHand, costSatang, kind: "PRODUCT" } });
      return id;
    };
    // ต้นทุนต่อหน่วยตามภาพ 06/16 (เมล็ด ฿0.65/g · นม ฿0.05/ml ปัดสตางค์เต็ม — Q6) · ฝาคงเหลือ 3 ⇒ ลาเต้ทำได้ 3 แก้ว = ใกล้หมด · ไซรัปต้นทุน 0 ⇒ ยังไม่ใส่ต้นทุน
    P23U.items.beans = await mkItem("beans", "เมล็ดกาแฟ (คั่วกลาง) · QC P2.3U", "g", 1_200, 65);
    P23U.items.milk = await mkItem("milk", "นมสด · QC P2.3U", "ml", 3_000, 5);
    P23U.items.cup12 = await mkItem("cup12", "แก้ว 12 oz · QC P2.3U", "ใบ", 40, 280);
    P23U.items.cup16 = await mkItem("cup16", "แก้ว 16 oz · QC P2.3U", "ใบ", 30, 350);
    P23U.items.lid = await mkItem("lid", "ฝา · QC P2.3U", "ชิ้น", 3, 120);
    P23U.items.syrup = await mkItem("syrup", "ไซรัปคาราเมล · QC P2.3U", "ml", 500, 0);
    P23U.items.coke = await mkItem("coke", "โค้กกระป๋อง · QC P2.3U", "กระป๋อง", 24, 1_200);
    // กลุ่ม "ขนาด" S/M/L ของสาขา (ชื่อซ้ำในสาขา = @@unique ⇒ ชื่อสำรอง)
    const gid = `${tag}-g-size`;
    const makeGroup = (name: string) => prisma.menuOptionGroup.create({ data: { id: gid, tenantId: T.tenantId, unitId, name, nameEn: "Size", minSelect: 1, maxSelect: 1 } });
    try {
      await makeGroup("ขนาด");
    } catch {
      try {
        await makeGroup("ขนาดแก้ว");
      } catch {
        await makeGroup(`ขนาด (QC ${process.pid}-${round})`);
      }
    }
    P23U.groups.push(gid);
    let co = 0;
    for (const [k, delta] of [["S", 0], ["M", 1_000], ["L", 2_000]] as const) {
      const cid = `${gid}-c${k}`;
      await prisma.menuOptionChoice.create({ data: { id: cid, tenantId: T.tenantId, unitId, groupId: gid, name: k, nameEn: k, priceDelta: delta, sortOrder: co++ } });
      P23U.choice[k] = cid;
    }
    const mkMenu = async (k: string, name: string, nameEn: string, price: number) => {
      const id = `${tag}-p-${k}`;
      P23U.products.push(id);
      await prisma.posProduct.create({ data: { id, tenantId: T.tenantId, systemId: SYS, unitId, kind: "MENU", name, nameEn, basePriceSatang: price } });
      return id;
    };
    P23U.ids.latte = await mkMenu("latte", "ลาเต้สูตร (QC P2.3U)", "Recipe latte (QC P2.3U)", 7_500);
    P23U.ids.coke = await mkMenu("coke", "โค้กสูตรเดิม (QC P2.3U)", "Coke old recipe (QC P2.3U)", 2_500);
    P23U.ids.empty = await mkMenu("empty", "ชาไทยยังไม่มีสูตร (QC P2.3U)", "Thai tea no recipe (QC P2.3U)", 5_500);
    P23U.ids.caramel = await mkMenu("caramel", "คาราเมลมัคคิอาโต้ (QC P2.3U)", "Caramel macchiato (QC P2.3U)", 8_500);
    await prisma.posProductOptionGroup.create({ data: { tenantId: T.tenantId, productId: P23U.ids.latte, groupId: gid, sortOrder: 0 } });
    // สูตรผ่านตัวเขียนจริง (เจ้าของร้าน)
    const { setRecipe, setRecipeChoiceLines, setBomEnabled } = await import("@/lib/modules/pos/catalog");
    const actor = await ownerActor();
    const cctx = { tenantId: T.tenantId, systemId: SYS, actorUserId: actor.userId };
    const it = P23U.items;
    await setRecipe(cctx, P23U.ids.latte, [{ invItemId: it.beans, qty: 18 }, { invItemId: it.milk, qty: 150 }, { invItemId: it.cup12, qty: 1 }, { invItemId: it.lid, qty: 1 }]);
    await setRecipeChoiceLines(cctx, P23U.ids.latte, [
      ...[[it.beans, 6], [it.milk, 50], [it.cup12, -1], [it.cup16, 1]].map(([invItemId, qtyDelta]) => ({ choiceId: P23U.choice.M, invItemId: invItemId as string, qtyDelta: qtyDelta as number })),
      ...[[it.beans, 12], [it.milk, 100], [it.cup12, -1], [it.cup16, 1]].map(([invItemId, qtyDelta]) => ({ choiceId: P23U.choice.L, invItemId: invItemId as string, qtyDelta: qtyDelta as number })),
    ]);
    // โค้กสูตรเดิม = สูตร 1 บรรทัด + สวิตช์ปิด (สภาพเดียวกับแถว backfill ของ P1.1a/b)
    await setRecipe(cctx, P23U.ids.coke, [{ invItemId: it.coke, qty: 1 }]);
    await setBomEnabled(cctx, P23U.ids.coke, false);
    await setRecipe(cctx, P23U.ids.caramel, [{ invItemId: it.beans, qty: 18 }, { invItemId: it.milk, qty: 150 }, { invItemId: it.syrup, qty: 20 }, { invItemId: it.cup12, qty: 1 }]);
    P23U.done = true;
  } catch (e) {
    P23U.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** register-pending-cuts: บิลค้างตัด 1 ใบของลาเต้สูตร (createSale ใน tx ของสคริปต์ ⇒ ไม่มีขั้นตัดสต็อกหลัง commit · registerStatus นับเป็นค้าง) */
async function ensureP23uPending(): Promise<void> {
  if (P23U.pendingSale || !P23U.done || P23U.error) return;
  try {
    const svc = (await import("@/lib/modules/pos/service")) as Any;
    const { expandRecipe } = await import("@/lib/modules/pos/recipe-shared");
    const it = P23U.items;
    const x = expandRecipe({ lines: [{ invItemId: it.beans, qty: 18 }, { invItemId: it.milk, qty: 150 }, { invItemId: it.cup12, qty: 1 }, { invItemId: it.lid, qty: 1 }], choiceLines: [], choiceIds: [] });
    if (!x.ok) throw new StepError(x.message);
    const actor = await ownerActor();
    const r = (await prisma.$transaction(
      (tx) =>
        svc.createSale(
          {
            tenantId: T.tenantId,
            unitId,
            systemId: SYS,
            sourceModule: "POS",
            shiftId: null,
            soldByUserId: actor.userId,
            idempotencyKey: `${P23U_PEND_PREFIX}${process.pid}-${P23U.round}`,
            lines: [{ productId: P23U.ids.latte, name: "ลาเต้สูตร (QC P2.3U)", qty: 1, unitPriceSatang: 7_500, components: x.components }],
            payMethods: [{ type: "CASH", amountSatang: 7_500 }],
          },
          tx,
        ),
      { timeout: 30_000, maxWait: 10_000 },
    )) as { saleId: string };
    P23U.pendingSale = r.saleId;
  } catch (e) {
    P23U.error = `บิลค้างตัด: ${e instanceof Error ? e.message.slice(0, 180) : String(e)}`;
  }
}
/** ยกเลิกบิลค้างตัดของรอบนี้ (voidSale · ไม่มี OUT ให้คืน) — เรียกซ้ำได้ · ไม่โยน */
async function voidP23uPending(): Promise<void> {
  if (!P23U.pendingSale) return;
  try {
    const { voidSale } = await import("@/lib/modules/pos/service");
    await voidSale(T.tenantId, unitId, P23U.pendingSale, { actorUserId: (await ownerActor()).userId, reason: "ภาพ QC P2.3U — บิลค้างตัดของ fixture" });
    P23U.log.push(`ยกเลิกบิลค้างตัด ${P23U.pendingSale}`);
  } catch (e) {
    P23U.ok = false;
    P23U.log.push(`ยกเลิกบิลค้างตัด ${P23U.pendingSale} ล้ม: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
  P23U.pendingSale = "";
}
/** หลังงานสุดท้ายของช่วง / finally / สัญญาณ: ยกเลิกบิลค้างตัด · ลบสินค้า (สูตร/ส่วนต่างตาม FK) · กลุ่ม · วัตถุดิบ — เรียกซ้ำได้ · ไม่โยน · สร้างใหม่ได้ในช่วงถัดไป */
async function cleanupP23u(): Promise<void> {
  await voidP23uPending();
  if (!P23U.products.length && !P23U.itemIds.length && !P23U.groups.length) {
    P23U.done = false;
    return;
  }
  try {
    if (P23U.groups.length) await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: P23U.groups } } });
    const products = P23U.products.length ? (await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { in: P23U.products } } })).count : 0;
    if (P23U.groups.length) {
      await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: P23U.groups } } });
      await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: P23U.groups } } });
    }
    const items = P23U.itemIds.length ? (await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: { in: P23U.itemIds } } })).count : 0;
    P23U.log.push(`รอบ ${P23U.round}: ลบสินค้า ${products}/${P23U.products.length} · กลุ่ม ${P23U.groups.length} · วัตถุดิบ ${items}/${P23U.itemIds.length}`);
    if (products !== P23U.products.length || items !== P23U.itemIds.length) P23U.ok = false;
  } catch (e) {
    P23U.ok = false;
    P23U.log.push(`รอบ ${P23U.round} ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
  }
  P23U.products = [];
  P23U.itemIds = [];
  P23U.groups = [];
  P23U.done = false;
  P23U.error = null;
}
const p23uCleanupLine = () => `${P23U.ok ? "🧹" : "⚠️"} P2.3U: ${P23U.log.join(" · ")}`;
async function openP23uRecipe(page: Any, device: Device, id: string): Promise<void> {
  await visibleEl(page, tid(device === "mobile" ? "pos-prod-cards" : "pos-prod-table"), 0, 15_000);
  await typeInto(page, tid("pos-prod-search"), "P2.3U"); // ให้แถว fixture อยู่ในจอ (ร้าน QC มีสินค้าเยอะ)
  await clickEl(page, tid(device === "mobile" ? `pos-prod-copen-${id}` : `pos-prod-open-${id}`));
  await visibleEl(page, tid("pos-prod-drawer"), 0, 10_000);
  await clickEl(page, tid("pos-prod-tab-recipe"));
  await visibleEl(page, tid("pos-prod-recipe"), 0, 10_000);
}
const textOf = async (page: Any, id: string, timeout = 10_000): Promise<string> => (await (await visibleEl(page, tid(id), 0, timeout)).evaluate((e: Element) => e.textContent ?? "")) as string;
async function runP23uProductsState(page: Any, state: P23uProductsKey, device: Device): Promise<void> {
  if (P23U.error || !P23U.done) throw new StepError(`fixture P2.3U: ${P23U.error ?? "ยังไม่ได้สร้าง"}`);
  const it = P23U.items;
  if (state === "products-table-chips") {
    await visibleEl(page, tid(device === "mobile" ? "pos-prod-cards" : "pos-prod-table"), 0, 15_000);
    await typeInto(page, tid("pos-prod-search"), "P2.3U");
    for (const k of ["low", "nocost", "nomargin"]) {
      const n = Number((/\d+/.exec(await textOf(page, `pos-prod-recipe-chip-${k}`)) ?? ["0"])[0]);
      if (!(n >= 1)) throw new StepError(`ชิป ${k} = ${n} (คาด ≥ 1 จาก fixture)`);
    }
    if (device !== "mobile") {
      const c = await textOf(page, `pos-prod-cost-${P23U.ids.latte}`);
      if (!/23\.20/.test(c)) throw new StepError(`ต้นทุนลาเต้ในตาราง = "${c}" (คาด ฿23.20 ตามสูตร)`);
    }
    return;
  }
  const target = state === "products-recipe-empty" ? P23U.ids.empty : state === "products-recipe-backfilled" ? P23U.ids.coke : state === "products-recipe-incomplete-cost" ? P23U.ids.caramel : P23U.ids.latte;
  await openP23uRecipe(page, device, target);
  if (state === "products-recipe-view") {
    for (const id of [it.beans, it.milk, it.cup12, it.lid]) await visibleEl(page, tid(`pos-prod-recipe-row-${id}`), 0, 5_000);
    const tot = await textOf(page, "pos-prod-recipe-total");
    if (!/23\.20/.test(tot) || !/69%/.test(tot)) throw new StepError(`ท้ายสูตร = "${tot}" (คาด ฿23.20 · 69%)`);
  } else if (state === "products-recipe-edit") {
    await clickEl(page, tid("pos-prod-recipe-edit"));
    await visibleEl(page, tid(`pos-prod-recipe-qty-${it.beans}`), 0, 5_000);
    await visibleEl(page, tid("pos-prod-recipe-bom"), 0, 5_000);
    await clickEl(page, tid(`pos-prod-recipe-tab-${P23U.choice.M}`));
    await visibleEl(page, tid(`pos-prod-recipe-delta-${P23U.choice.M}-${it.cup16}`), 0, 5_000);
    await typeInto(page, tid("pos-prod-recipe-search"), "ไซรัป");
    await visibleEl(page, tid(`pos-prod-recipe-pick-${it.syrup}`), 0, 10_000).catch(() => {
      throw new StepError("ตัวเลือกวัตถุดิบไม่แสดงไซรัปของ fixture (pos-prod-recipe-pick-…)");
    });
  } else if (state === "products-recipe-empty") {
    await visibleEl(page, tid("pos-prod-recipe-empty"), 0, 5_000);
  } else if (state === "products-recipe-backfilled") {
    await visibleEl(page, tid("pos-prod-recipe-backfilled"), 0, 5_000);
    await visibleEl(page, tid("pos-prod-recipe-bom-on"), 0, 5_000);
  } else if (state === "products-recipe-incomplete-cost") {
    await visibleEl(page, tid("pos-prod-recipe-nocost"), 0, 5_000);
    await visibleEl(page, tid("pos-prod-recipe-flag-nomargin"), 0, 5_000);
  }
}
async function runP23uPendingCuts(page: Any): Promise<void> {
  if (P23U.error || !P23U.pendingSale) throw new StepError(`fixture P2.3U: ${P23U.error ?? "ไม่มีบิลค้างตัด"}`);
  const txt = await textOf(page, "pos-reg-pending-cuts", 15_000);
  if (!/[1-9]/.test(txt)) throw new StepError(`ชิปตัดสต็อกค้าง = "${txt}" (คาด ≥ 1 บิล)`);
  if (userKey === "owner") await visibleEl(page, tid("pos-reg-pending-cuts-retry"), 0, 5_000);
}
// ◂

// ═══════════════════ POS P2.7U ▸ QR สั่ง / สั่งล่วงหน้าจ่ายก่อน (มติ 15 · wo p2.7 · --states · เจ้าของร้าน · ร้าน QC coffee) ═══════════════════
//   fixture (ensureP27Fixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล) ผ่านประตูของใบ S เท่านั้น (qr-order · order · payment-intent · restaurant facade):
//   • ช่องทาง QR_TABLE / QR_ORDER ของสาขา: เปิด · ไม่พัก · QR_ORDER รับอัตโนมัติปิด (จำค่าเดิม → คืนตอนเก็บกวาด) · PromptPay ID ของร้าน QC (ensureQcPromptPay · คืนค่าใน cleanupIntents)
//   • โซน "QR ภาพ · posqc-vis-p27 <ตัวอักษร>" + โต๊ะ <ตัวอักษร>Q1 (ว่าง) · Q2 (รอบแขก 2 รอบ placeTableRound + สถานะครัว advanceItem) · Q3 (รอบแขก + แผนแยกบิล EQUAL 2)
//   • ลิงก์สั่งล่วงหน้า (มีอยู่ = ใช้ · ไม่มี = createOrderLink แล้วลบตอนเก็บกวาด) · ออเดอร์ 9 ใบ (placePreorder · IP ของรอบ) ตามสถานะของหน้า /q/o/
//   เก็บกวาด (cleanupP27 · หลังงานสุดท้าย/finally/สัญญาณ · เรียกซ้ำได้): แผนแยกบิล · ชุดโต๊ะ (deleteP24uRows) · สถานีครัวที่รอบสร้าง · ออเดอร์ที่ไม่มีบิล + บรรทัด/เหตุการณ์/
//   outbox/audit/ใบขอรับเงิน/ops · ออเดอร์ที่มีบิล (รับแล้ว/พร้อม) = ส่งมอบให้จบแล้วเก็บไว้ (แบบ P2.8U) · ลิงก์ที่รอบสร้าง · ถังเพดาน pos:qrSubmit:posqc-vis-p27-<pid>-* · ช่องทางคืนค่าเดิม ◂
const P27_TAG = `posqc-vis-p27-${process.pid}`;
const P27_LETTER = "ABCDEFGHJKLMNPQRSTUVWXYZ"[(process.pid + 7) % 24]!;
const P27_UI_IP = `${P27_TAG}-ui`;
const P27 = {
  done: false,
  error: null as string | null,
  ok: true,
  log: [] as string[],
  zones: [] as string[],
  sessions: [] as string[],
  orderIds: [] as string[],
  intentIds: [] as string[],
  linkCreatedId: null as string | null,
  channels: {} as Record<string, { id: string; name: string; active: boolean; autoAccept: boolean; pausedUntil: string | null }>,
  pausedNow: null as string | null,
  stationsBefore: null as string[] | null,
  ipSeq: 0,
};
const p27Ip = () => `${P27_TAG}-${++P27.ipSeq}`;
async function p27Ctx() {
  return { ctx: { tenantId: T.tenantId, systemId: SYS, unitId }, actor: await memberActorOf("owner") };
}
async function ensureP27Fixture(): Promise<void> {
  if (P27.done || P27.error) return;
  try {
    if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบอเมริกาโน่เย็น/ลาเต้ร้อนของร้าน QC (seed-pos-qc)");
    const { ctx, actor } = await p27Ctx();
    const ch = await import("@/lib/modules/pos/channel");
    const ord = await import("@/lib/modules/pos/order");
    const qr = await import("@/lib/modules/pos/qr-order");
    const pi = await import("@/lib/modules/pos/payment-intent");
    const tbl = await import("@/lib/modules/restaurant/table");
    const kds = await import("@/lib/modules/restaurant/kds");
    const pt = await import("@/lib/modules/pos/table");
    const sp = await import("@/lib/modules/pos/table-split");
    const need = <R extends { ok: boolean }>(r: R, what: string): R & { ok: true } => {
      if (!r.ok) throw new StepError(`${what}: ${JSON.stringify(r).slice(0, 160)}`);
      return r as R & { ok: true };
    };
    await ensureQcPromptPay();
    // ซากของรอบที่ตาย (เกิน 1 ชม.) — โซนตามชื่อ
    const stale = (await prisma.restaurantZone.findMany({ where: { tenantId: T.tenantId, unitId, name: { contains: "posqc-vis-p27" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } }, select: { id: true } })).map((z) => z.id);
    if (stale.length) P27.log.push(`ซาก: ${await deleteP24uRows(stale)}`);
    // ช่องทาง QR (listChannels ⇒ ensureUnitChannels สร้างแถว builtin ที่ขาด)
    need(await ch.listChannels(ctx, actor, { includeArchived: true }), "listChannels");
    for (const code of ["QR_TABLE", "QR_ORDER"] as const) {
      const row = await prisma.salesChannel.findFirst({ where: { tenantId: T.tenantId, unitId, code, kind: "BUILTIN", archivedAt: null }, select: { id: true, name: true, active: true, autoAccept: true, pausedUntil: true } });
      if (!row) throw new StepError(`ไม่มีช่องทาง ${code} ของสาขา QC`);
      P27.channels[code] = { id: row.id, name: row.name, active: row.active, autoAccept: row.autoAccept, pausedUntil: row.pausedUntil ? row.pausedUntil.toISOString() : null };
      if (!row.active) need(await ch.saveChannel(ctx, actor, { id: row.id, name: row.name, active: true }), `เปิด ${code}`);
      need(await ord.setChannelOrderSettings(ctx, actor, { channelId: row.id, pausedUntil: null, ...(code === "QR_ORDER" ? { autoAccept: false } : {}) }), `ค่าตั้ง ${code}`);
    }
    // ชุดโต๊ะ
    P27.stationsBefore = (await prisma.kdsStation.findMany({ where: { tenantId: T.tenantId, unitId }, select: { id: true } })).map((s) => s.id);
    const z = need(await tbl.createZone(T.tenantId, unitId, `QR ภาพ · posqc-vis-p27 ${P27_LETTER}`), "createZone");
    P27.zones.push(z.id);
    const fx: P27Fixture = { tables: {}, orders: {}, linkToken: null };
    for (const [k, n] of [["q1", 1], ["q2", 2], ["q3", 3]] as const) {
      const t = need(await tbl.createTable(T.tenantId, unitId, { zoneId: z.id, name: `${P27_LETTER}Q${n}`, seats: 4 }), `createTable Q${n}`);
      fx.tables[k] = { tableId: t.id, name: `${P27_LETTER}Q${n}`, qrToken: t.qrToken, sessionId: null };
    }
    const guest = `g${P27_TAG.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 40);
    const round = async (k: "q2" | "q3", lines: { productId: string; qty: number }[]) => {
      const tk = fx.tables[k]!;
      const r = await qr.placeTableRound(tk.qrToken, { lines, expectedSessionId: tk.sessionId, guestToken: `${guest}${k}${lines.length}` }, { ip: p27Ip() });
      if (!r.ok) throw new StepError(`placeTableRound ${k}: ${r.code}`);
      tk.sessionId = r.sessionId;
      if (!P27.sessions.includes(r.sessionId)) P27.sessions.push(r.sessionId);
      return (await prisma.restaurantOrderItem.findMany({ where: { tenantId: T.tenantId, orderId: r.roundId }, orderBy: { createdAt: "asc" }, select: { id: true } })).map((x) => x.id);
    };
    const to = async (id: string, steps: ("COOKING" | "READY" | "SERVED")[]) => {
      for (const s of steps) {
        const r = await kds.advanceItem(T.tenantId, unitId, id, s);
        if (!r.ok) throw new StepError(`advanceItem ${s}: ${r.reason}`);
      }
    };
    const r1 = await round("q2", [{ productId: QC_IDS.amer, qty: 2 }, { productId: QC_IDS.latte, qty: 1 }]);
    await to(r1[0]!, ["COOKING", "SERVED"]);
    await to(r1[1]!, ["COOKING", "READY"]);
    const r2 = await round("q2", [{ productId: QC_IDS.latte, qty: 2 }]);
    await to(r2[0]!, ["COOKING"]);
    await round("q3", [{ productId: QC_IDS.amer, qty: 2 }, { productId: QC_IDS.latte, qty: 2 }]);
    const d3 = need(await pt.registerTableDetail(ctx, actor, { tableSessionId: fx.tables.q3!.sessionId! }), "registerTableDetail Q3");
    need(await sp.registerSplitTable(ctx, actor, { tableSessionId: fx.tables.q3!.sessionId!, mode: "EQUAL", partCount: 2, expectedItemsHash: d3.itemsHash, allocations: null }), "registerSplitTable Q3");
    // ลิงก์สั่งล่วงหน้า
    const cur = need(await ord.getOrderLink(ctx, actor), "getOrderLink");
    if (cur.link) fx.linkToken = cur.link.token;
    else {
      const c = need(await ord.createOrderLink(ctx, actor), "createOrderLink");
      fx.linkToken = c.link!.token;
      P27.linkCreatedId = c.link!.id;
    }
    // ออเดอร์จ่ายก่อน
    const place = async (tag: string, lines: { productId: string; qty: number }[], name: string) => {
      const r = await qr.placePreorder(fx.linkToken!, { lines, customer: { name, phone: "0812345678" }, idempotencyKey: `${P27_TAG}-${tag}` }, { ip: p27Ip() });
      if (!r.ok) throw new StepError(`placePreorder ${tag}: ${r.code}`);
      const o = await prisma.posOrder.findUnique({ where: { publicToken: r.orderToken }, select: { id: true, code: true, paymentIntentId: true } });
      if (!o) throw new StepError(`ไม่พบออเดอร์ ${tag}`);
      fx.orders[tag] = { id: o.id, token: r.orderToken, code: o.code, intentId: o.paymentIntentId };
      P27.orderIds.push(o.id);
      if (o.paymentIntentId) P27.intentIds.push(o.paymentIntentId);
      return fx.orders[tag]!;
    };
    const pay = async (o: { intentId: string | null }, tag: string) => {
      if (!o.intentId) throw new StepError(`ออเดอร์ ${tag} ไม่มีใบขอรับเงิน`);
      need(await pi.confirmPaymentIntentManual(ctx, actor, { intentId: o.intentId }), `confirmPaymentIntentManual ${tag}`);
      await ord.onIntentPaid(o.intentId);
    };
    const A = [{ productId: QC_IDS.amer, qty: 1 }, { productId: QC_IDS.latte, qty: 1 }];
    await place("pay", A, "คุณพลอย (ภาพ QC)");
    const cl = await place("claimed", A, "คุณกิ่ง (ภาพ QC)");
    need(await qr.claimPaid(cl.token, { ip: p27Ip() }), "claimPaid");
    await pay(await place("paid", A, "คุณบี (ภาพ QC)"), "paid");
    const ac = await place("accepted", A, "คุณเต้ย (ภาพ QC)");
    await pay(ac, "accepted");
    need(await ord.acceptOrder(ctx, actor, { id: ac.id, prepMinutes: 10 }), "acceptOrder accepted");
    const rd = await place("ready", [{ productId: QC_IDS.latte, qty: 2 }], "คุณนัท (ภาพ QC)");
    await pay(rd, "ready");
    need(await ord.acceptOrder(ctx, actor, { id: rd.id, prepMinutes: 5 }), "acceptOrder ready");
    need(await ord.markPreparing(ctx, actor, { id: rd.id }), "markPreparing ready");
    need(await ord.markReady(ctx, actor, { id: rd.id }), "markReady ready");
    const ex = await place("expired", A, "คุณโอ (ภาพ QC)");
    await prisma.posOrder.update({ where: { id: ex.id }, data: { payBy: new Date(Date.now() - 60_000) } });
    if (ex.intentId) await prisma.posPaymentIntent.update({ where: { id: ex.intentId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    if (!(await ord.expirePreorderIfDue(T.tenantId, ex.id))) throw new StepError("expirePreorderIfDue ไม่ปิดออเดอร์ที่เลยเวลา");
    const rj = await place("rejected", A, "คุณแป้ง (ภาพ QC)");
    await pay(rj, "rejected");
    need(await ord.rejectOrder(ctx, actor, { id: rj.id, reasonCode: "TOO_BUSY" }), "rejectOrder");
    // POS P2.7U fix1 ▸ F5: กำลังเตรียม · ส่งมอบแล้ว · ร้านยกเลิก (บิลจริงของทั้งสามใบ · เก็บไว้แบบ P2.8U) · Beam (เปิด beam ชั่วคราว + Beam ปลอม · คืนค่าทันที) ◂
    const pr = await place("preparing", A, "คุณมิว (ภาพ QC)");
    await pay(pr, "preparing");
    need(await ord.acceptOrder(ctx, actor, { id: pr.id, prepMinutes: 15 }), "acceptOrder preparing");
    need(await ord.markPreparing(ctx, actor, { id: pr.id }), "markPreparing preparing");
    const hd = await place("handed", A, "คุณฝน (ภาพ QC)");
    await pay(hd, "handed");
    need(await ord.acceptOrder(ctx, actor, { id: hd.id, prepMinutes: 5 }), "acceptOrder handed");
    need(await ord.markPreparing(ctx, actor, { id: hd.id }), "markPreparing handed");
    need(await ord.markReady(ctx, actor, { id: hd.id }), "markReady handed");
    need(await ord.handOver(ctx, actor, { id: hd.id }), "handOver handed");
    const cx = await place("cancelled", A, "คุณเก่ง (ภาพ QC)");
    await pay(cx, "cancelled");
    need(await ord.acceptOrder(ctx, actor, { id: cx.id, prepMinutes: 10 }), "acceptOrder cancelled");
    need(await ord.cancelOrder(ctx, actor, { id: cx.id, reason: "ภาพ QC: ร้านยกเลิก", idempotencyKey: `${P27_TAG}-cancel` }), "cancelOrder cancelled");
    {
      const sys = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
      const base = (sys?.settings && typeof sys.settings === "object" ? sys.settings : {}) as Record<string, Any>;
      const pos = { ...(base.pos ?? {}) };
      const payment = { ...(pos.payment ?? {}) };
      const had = Object.prototype.hasOwnProperty.call(payment, "beam");
      const before = payment.beam;
      const setBeam = async (v: Any, keep: boolean) => {
        const p2 = { ...payment };
        if (keep) p2.beam = v;
        else delete p2.beam;
        await prisma.appSystem.update({ where: { id: SYS }, data: { settings: { ...base, pos: { ...pos, payment: p2 } } } });
      };
      let n = 0;
      const fakeBeam = { enabled: () => true, createCharge: async () => ({ chargeId: `chg_${P27_TAG}_${++n}`, url: `https://pay.beam.example/${P27_TAG}/${n}`, qrPayload: `BEAMQR-${P27_TAG}-${n}` }) };
      try {
        await setBeam({ ...(before && typeof before === "object" ? before : {}), enabled: true }, true);
        const r = await qr.placePreorder(fx.linkToken!, { lines: A, customer: { name: "คุณบีม (ภาพ QC)", phone: "0812345678" }, idempotencyKey: `${P27_TAG}-beam` }, { ip: p27Ip() }, { beam: fakeBeam as Any });
        if (!r.ok) throw new StepError(`placePreorder beam: ${r.code}`);
        const o = await prisma.posOrder.findUnique({ where: { publicToken: r.orderToken }, select: { id: true, code: true, paymentIntentId: true } });
        if (!o) throw new StepError("ไม่พบออเดอร์ beam");
        fx.orders.beam = { id: o.id, token: r.orderToken, code: o.code, intentId: o.paymentIntentId };
        P27.orderIds.push(o.id);
        if (o.paymentIntentId) P27.intentIds.push(o.paymentIntentId);
      } finally {
        await setBeam(before, had);
      }
    }
    // เงินเข้าหลังหมดเวลา: payBy อดีตก่อน → ยืนยันเงินเข้า (paidAt > payBy) → onIntentPaid = ปิด + late_payment (H4)
    const lt = await place("late", A, "คุณจอย (ภาพ QC)");
    await prisma.posOrder.update({ where: { id: lt.id }, data: { payBy: new Date(Date.now() - 5_000) } });
    await pay(lt, "late");
    P27S.fx = fx;
    P27.done = true;
    P27.log.push(`โต๊ะ ${Object.values(fx.tables).map((t) => t!.name).join("/")} · session ${P27.sessions.length} · ลิงก์ ${P27.linkCreatedId ? "สร้างใหม่" : "เดิม"} · ออเดอร์ ${Object.keys(fx.orders).join("/")}`);
    for (const j of jobs) if (isP27State(j.state)) j.path = p27Path(j.state);
  } catch (e) {
    P27.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}
/** พักรับช่องทาง (ก่อนภาพ closed) / คืนค่า — คืนเป็นค่าก่อนพัก (null) */
async function p27Pause(code: "QR_TABLE" | "QR_ORDER" | null): Promise<void> {
  const ord = await import("@/lib/modules/pos/order");
  const { ctx, actor } = await p27Ctx();
  if (P27.pausedNow && P27.pausedNow !== code) {
    const c = P27.channels[P27.pausedNow];
    if (c) await ord.setChannelOrderSettings(ctx, actor, { channelId: c.id, pausedUntil: null });
    P27.pausedNow = null;
  }
  if (!code || P27.pausedNow === code) return;
  const c = P27.channels[code];
  if (!c) throw new StepError(`ไม่มีช่องทาง ${code}`);
  const r = await ord.setChannelOrderSettings(ctx, actor, { channelId: c.id, pausedUntil: new Date(Date.now() + 30 * 60_000).toISOString() });
  if (!r.ok) throw new StepError(`พักรับ ${code}: ${r.code}`);
  P27.pausedNow = code;
}
/** ก่อนเปิดหน้า: fixture · หัว x-forwarded-for ของคำขอหน้าสาธารณะ · พักรับก่อนภาพ closed — พังไม่โยน (runP27State โยนเหตุผล) */
const P27_PREP_ERR = new Map<Any, string>();
async function prepP27(page: Any, k: P27Key): Promise<void> {
  try {
    await ensureP27Fixture();
    if (P27.error) throw new StepError(`fixture P2.7U: ${P27.error}`);
    if (k.startsWith("table-") || k.startsWith("pre-")) await page.setExtraHTTPHeaders({ "x-forwarded-for": P27_UI_IP });
    await p27Pause(k === "table-closed" ? "QR_TABLE" : k === "pre-closed" ? "QR_ORDER" : null);
  } catch (e) {
    P27_PREP_ERR.set(page, e instanceof Error ? e.message.slice(0, 200) : String(e));
  }
}
/** เมนูของหน้าสาธารณะ: แตะ + ของสินค้า (แผ่นตัวเลือก = เลือกตัวแรกของทุกกลุ่มแล้วใส่ตะกร้า) */
async function p27Add(page: Any, productId: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await clickEl(page, tid(`pos-qr-item-add-${productId}`));
    const sheet = await page.$(tid("pos-qr-opt-sheet"));
    if (sheet && (await sheet.isVisible().catch(() => false))) {
      await page.evaluate(() => {
        for (const fs of Array.from(document.querySelectorAll('[data-testid="pos-qr-opt-sheet"] fieldset'))) {
          const b = fs.querySelector('button[data-testid^="pos-qr-choice-"]:not([disabled])') as HTMLButtonElement | null;
          b?.click();
        }
      });
      await sleep(200);
      await clickEl(page, tid("pos-qr-opt-add"));
    }
  }
}
/** ตะกร้า (390 = เปิดแผ่นจากแถบลอย) + รอยอดจาก quote */
async function p27Cart(page: Any, device: Device, scope: "pos-qr-table" | "pos-qr-preorder"): Promise<void> {
  await visibleEl(page, `${tid(scope)}[data-open="1"]`, 0, 15_000).catch(() => {
    throw new StepError(`ประตูปิดอยู่ (${scope} data-open ≠ 1) — ช่องทาง/ครัว/PromptPay ของสาขา QC`);
  });
  await p27Add(page, QC_IDS.amer, 2);
  await p27Add(page, QC_IDS.latte, 1);
  if (device === "mobile") {
    await clickEl(page, tid("pos-qr-cart-bar"));
    await visibleEl(page, tid("pos-qr-cart-sheet"), 0, 5_000);
  }
  await page
    .waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-qr-cart-total"]')).some((e) => e.getClientRects().length > 0 && /\d/.test(e.textContent ?? "")), { timeout: 15_000 })
    .catch(() => {
      throw new StepError("ยอดตะกร้าไม่มาจาก quote ภายใน 15 วิ");
    });
}
async function runP27State(page: Any, state: P27Key, device: Device): Promise<void> {
  const pe = P27_PREP_ERR.get(page);
  if (pe) throw new StepError(pe);
  const tab = async (k: "rounds" | "bill") => {
    if (device === "mobile") await clickEl(page, tid(`pos-qr-tab-${k}`));
  };
  const phase = async (ph: string) =>
    visibleEl(page, `${tid("pos-qr-order")}[data-phase="${ph}"]`, 0, 20_000).catch(() => {
      throw new StepError(`หน้าสถานะไม่อยู่ในขั้น ${ph}`);
    });
  switch (state) {
    case "table-menu":
      await visibleEl(page, `${tid("pos-qr-table")}[data-open="1"]`, 0, 15_000).catch(() => {
        throw new StepError("หน้าโต๊ะปิดรับ (ช่องทาง QR_TABLE/ครัวของสาขา QC)");
      });
      return;
    case "table-cart":
      return p27Cart(page, device, "pos-qr-table");
    case "table-sent":
      await p27Cart(page, device, "pos-qr-table");
      await clickEl(page, tid("pos-qr-send"));
      await visibleEl(page, tid("pos-qr-sent"), 0, 20_000);
      return;
    case "table-rounds":
      await tab("rounds");
      await visibleEl(page, tid("pos-qr-round"), 0, 15_000);
      return;
    case "table-bill":
      await tab("bill");
      await visibleEl(page, `${tid("pos-qr-bill-qr")}[data-ready="1"]`, 0, 15_000).catch(() => {
        throw new StepError("QR พร้อมเพย์ของบิลโต๊ะไม่ขึ้น (PromptPay ID ของร้าน QC?)");
      });
      return;
    case "table-notified":
      await tab("bill");
      await clickEl(page, tid("pos-qr-notify-paid"));
      await visibleEl(page, tid("pos-qr-notified"), 0, 15_000);
      return;
    case "table-payhidden":
      await tab("bill");
      await visibleEl(page, tid("pos-qr-pay-hidden"), 0, 15_000);
      return;
    case "table-closed":
    case "pre-closed":
      await visibleEl(page, tid("pos-qr-closed"), 0, 15_000);
      return;
    case "table-bad-token":
      await visibleEl(page, tid("pos-qr-invalid"), 0, 15_000);
      return;
    case "pre-menu":
      await visibleEl(page, `${tid("pos-qr-preorder")}[data-open="1"]`, 0, 15_000).catch(() => {
        throw new StepError("หน้าสั่งล่วงหน้าปิดรับ (QR_ORDER/ครัว/PromptPay ของสาขา QC)");
      });
      return;
    case "pre-cart":
      return p27Cart(page, device, "pos-qr-preorder");
    case "pre-checkout":
      await p27Cart(page, device, "pos-qr-preorder");
      if (device === "mobile") await clickEl(page, tid("pos-qr-to-checkout"));
      await typeInto(page, tid("pos-qr-co-name"), "คุณภาพ (ภาพ QC)");
      await typeInto(page, tid("pos-qr-co-phone"), "081-234-5678");
      await visibleEl(page, tid("pos-qr-pdpa"), 0, 5_000);
      return;
    case "pre-pay":
      await phase("pay");
      await visibleEl(page, `${tid("pos-qr-order-qr")}[data-ready="1"]`, 0, 15_000);
      return;
    case "pre-claimed":
      return void (await phase("claimed"));
    case "pre-paid":
      return void (await phase("paid"));
    case "pre-accepted":
      return void (await phase("accepted")); // POS P2.7U fix1 ▸ F5: กำลังเตรียม = สถานะของตัวเอง ◂
    // POS P2.7U fix1 ▸ F5 ◂
    case "pre-pay-beam":
      await phase("pay");
      await visibleEl(page, tid("pos-qr-order-auto"), 0, 15_000);
      return;
    case "pre-preparing":
      await phase("preparing");
      await visibleEl(page, tid("pos-qr-order-eta"), 0, 10_000);
      return;
    case "pre-handed":
      return void (await phase("handed"));
    case "pre-cancelled":
      return void (await phase("cancelled"));
    case "pre-bad-link":
    case "pre-bad-order":
      await visibleEl(page, tid("pos-qr-invalid"), 0, 15_000);
      return;
    case "pre-ready":
      return void (await phase("ready"));
    case "pre-expired":
      await phase("expired");
      await visibleEl(page, tid("pos-qr-order-expired"), 0, 5_000);
      return;
    case "pre-rejected":
      await phase("rejected");
      await visibleEl(page, tid("pos-qr-order-refund"), 0, 5_000);
      return;
    default:
      break;
  }
  const F = p27Fx();
  if (state.startsWith("orders-")) {
    await visibleEl(page, tid("pos-ord-root"), 0, 15_000);
    switch (state) {
      case "orders-qr-rows":
        // ≥ 1024 = แถวในราง · 390 = ตัวเลือกช่องทาง + แท็บคอลัมน์ "กำลังเตรียม" (การ์ดรอบ QR อยู่คอลัมน์กำลังเตรียม/พร้อม)
        if (device === "mobile") {
          await page.select(tid("pos-ord-ch-select"), "qr-table");
          await clickEl(page, tid("pos-ord-coltab-preparing"));
        } else await clickEl(page, tid("pos-ord-ch-qr-table"));
        await visibleEl(page, tidPrefix("pos-ord-qr-round-"), 0, 20_000);
        return;
      case "orders-awaiting":
        await visibleEl(page, tid("pos-ord-awaiting"), 0, 20_000);
        return;
      case "orders-prepaid":
        await visibleEl(page, tidPrefix("pos-ord-prepaid-"), 0, 20_000);
        await clickEl(page, tid(`pos-ord-card-${F?.orders.paid?.code ?? "-"}`));
        await visibleEl(page, tid("pos-ord-panel"), 0, 15_000);
        return;
      case "orders-claim":
        await clickEl(page, tid(`pos-ord-await-card-${F?.orders.claimed?.code ?? "-"}`));
        await visibleEl(page, tid("pos-ord-confirm-pay"), 0, 15_000);
        return;
      case "orders-late-banner":
        await visibleEl(page, tid(`pos-ord-late-${F?.orders.late?.code ?? "-"}`), 0, 20_000);
        return;
    }
  }
  if (state === "tables-qr-dialog") {
    await clickEl(page, tid("pos-tbl-panel-qr"));
    await visibleEl(page, `${tid("pos-tbl-qr-image")}[data-ready="1"]`, 0, 15_000);
    return;
  }
  if (state === "tables-qr-print") {
    await clickEl(page, tid("pos-tbl-print-qr"));
    await visibleEl(page, tid("pos-tbl-qr-sheet"), 0, 15_000);
    await sleep(800);
    return;
  }
  if (state === "settings-channel-qr-table" || state === "settings-channel-qr-order" || state === "settings-channel-qr-order-link") {
    const code = state === "settings-channel-qr-table" ? "QR_TABLE" : "QR_ORDER";
    await clickEl(page, tid(`pos-channel-open-${code.toLowerCase()}`)); // POS P2.7U fix1 ▸ IMG-1: testid ของแถวเป็นตัวเล็ก (ChannelsPanel) ◂
    await visibleEl(page, `${tid("pos-channel-qr")}[data-code="${code}"]`, 0, 15_000);
    if (code === "QR_ORDER") await visibleEl(page, `${tid("pos-channel-qr-link-image")}[data-ready="1"]`, 0, 15_000).catch(() => undefined);
    // POS P2.7U fix3 ▸ บล็อก QR อยู่ใต้ส่วนทั่วไปของลิ้นชัก (กล่องเลื่อนของลิ้นชัก ไม่ใช่หน้า) — เลื่อนกล่องนั้นให้บล็อก/บล็อกลิงก์อยู่บนสุดก่อนถ่าย
    //   ภาพแรก = หัวบล็อก QR (เปิดรับ · รับอัตโนมัติ · เวลาเตรียม · พักรับ) · ภาพที่สอง (-link) = บล็อกลิงก์ + ภาพ QR ◂
    const target = state === "settings-channel-qr-order-link" ? "pos-channel-qr-link" : "pos-channel-qr";
    const moved = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return false;
      let box: HTMLElement | null = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      if (!box) {
        el.scrollIntoView({ block: "start" });
        return true;
      }
      box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
      return true;
    }, `${tid(target)}`);
    if (!moved) throw new StepError(`ไม่พบ ${target} ในลิ้นชัก`);
    await sleep(400);
    return;
  }
}
async function cleanupP27(): Promise<void> {
  const ord = await import("@/lib/modules/pos/order");
  const sp = await import("@/lib/modules/pos/table-split");
  let ctxA: Awaited<ReturnType<typeof p27Ctx>> | null = null;
  try {
    ctxA = await p27Ctx();
  } catch (e) {
    P27.ok = false;
    P27.log.push(`ผู้ใช้เจ้าของ: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
  }
  const step = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      P27.ok = false;
      P27.log.push(`${what} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
    }
  };
  if (ctxA) {
    const { ctx, actor } = ctxA;
    await step("คืนค่าช่องทาง", async () => {
      for (const [code, c] of Object.entries(P27.channels)) {
        const back = c.pausedUntil && Date.parse(c.pausedUntil) > Date.now() ? c.pausedUntil : null;
        await ord.setChannelOrderSettings(ctx, actor, { channelId: c.id, pausedUntil: back, ...(code === "QR_ORDER" ? { autoAccept: c.autoAccept } : {}) });
        if (!c.active) await (await import("@/lib/modules/pos/channel")).saveChannel(ctx, actor, { id: c.id, name: c.name, active: false });
      }
      if (Object.keys(P27.channels).length) P27.log.push("คืนค่าช่องทาง QR_TABLE/QR_ORDER");
      P27.channels = {};
      P27.pausedNow = null;
    });
    await step("ยกเลิกแผนแยกบิล", async () => {
      for (const sid of P27.sessions) {
        const open = await sp.openSplitOfSession(prisma, { tenantId: T.tenantId, sessionId: sid });
        if (open) await sp.registerCancelSplit(ctx, actor, { splitId: open.id, expectedVersion: open.version });
      }
    });
    await step("ส่งมอบออเดอร์ที่มีบิล", async () => {
      const rows = P27.orderIds.length ? await prisma.posOrder.findMany({ where: { tenantId: T.tenantId, id: { in: P27.orderIds }, saleId: { not: null } }, select: { id: true, status: true } }) : [];
      for (const o of rows) {
        if (o.status === "ACCEPTED") await ord.markPreparing(ctx, actor, { id: o.id });
        if (o.status === "ACCEPTED" || o.status === "PREPARING") await ord.markReady(ctx, actor, { id: o.id });
        if (o.status !== "HANDED") await ord.handOver(ctx, actor, { id: o.id });
      }
      if (rows.length) P27.log.push(`ออเดอร์มีบิล ${rows.length} ใบ = ส่งมอบแล้วเก็บไว้ (บิลพร้อมเพย์ไม่ลบ)`);
    });
  }
  await step("ลบชุดโต๊ะ", async () => {
    if (P27.zones.length) P27.log.push(`ลบ: ${await deleteP24uRows(P27.zones)}`);
    P27.zones = [];
    if (P27.stationsBefore) {
      const st = await prisma.kdsStation.deleteMany({ where: { tenantId: T.tenantId, unitId, id: { notIn: P27.stationsBefore }, orderItems: { none: {} }, menuItems: { none: {} } } });
      if (st.count) P27.log.push(`สถานีครัวที่รอบสร้างให้ ${st.count}`);
    }
  });
  await step("ลบออเดอร์", async () => {
    const tenantId = T.tenantId;
    const withSale = P27.orderIds.length ? (await prisma.posOrder.findMany({ where: { tenantId, id: { in: P27.orderIds }, saleId: { not: null } }, select: { id: true } })).map((x) => x.id) : [];
    const kill = P27.orderIds.filter((x) => !withSale.includes(x));
    if (!kill.length) return;
    const intents = (await prisma.posPaymentIntent.findMany({ where: { tenantId, orderId: { in: kill } }, select: { id: true } })).map((x) => x.id);
    const ids = [...kill, ...intents];
    const ev = (await prisma.posOrderEvent.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
    const ln = (await prisma.posOrderLine.deleteMany({ where: { tenantId, orderId: { in: kill } } })).count;
    const ob = (await prisma.outboxEvent.deleteMany({ where: { tenantId, OR: ids.map((id) => ({ idempotencyKey: { contains: id } })) } })).count;
    const au = (await prisma.auditLog.deleteMany({ where: { tenantId, targetId: { in: ids } } })).count;
    const ops = (await prisma.opsEvent.deleteMany({ where: { tenantId, createdAt: { gte: RUN_STARTED }, OR: ids.map((id) => ({ detail: { contains: id } })) } })).count;
    const pi = (await prisma.posPaymentIntent.deleteMany({ where: { tenantId, id: { in: intents } } })).count;
    const od = (await prisma.posOrder.deleteMany({ where: { tenantId, id: { in: kill }, saleId: null } })).count;
    P27.log.push(`ลบ: ออเดอร์ ${od} · บรรทัด ${ln} · เหตุการณ์ ${ev} · ใบขอรับเงิน ${pi} · outbox ${ob} · audit ${au} · ops ${ops}`);
    P27.orderIds = withSale;
  });
  await step("ลบลิงก์ที่รอบสร้าง", async () => {
    if (!P27.linkCreatedId) return;
    await prisma.posOrderLink.deleteMany({ where: { tenantId: T.tenantId, id: P27.linkCreatedId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T.tenantId, targetId: P27.linkCreatedId } });
    P27.log.push("ลบลิงก์สั่งล่วงหน้าที่รอบสร้าง");
    P27.linkCreatedId = null;
  });
  await step("ลบถังเพดาน", async () => {
    const nb = (await prisma.chatRateBucket.deleteMany({ where: { key: { startsWith: `pos:qrSubmit:${P27_TAG}` } } })).count;
    if (nb) P27.log.push(`ถังเพดาน ${nb}`);
  });
  P27.sessions = [];
  P27.done = false;
  P27S.fx = null;
}
// ◂ POS P2.7U

// ═══════════════════ POS P2.10 ▸ จอลูกค้า (มติ 11 · wo p2.10 · --states · เจ้าของร้าน · th + LOCALE=en) ═══════════════════
//   fixture (ensureP210Fixture · ก่อนงานแรกของใบนี้ · พังไม่โยน — สถานะตกพร้อมเหตุผล):
//   • เครื่อง P210_DEV "เคาน์เตอร์ 1" (registerDevice · เจ้าของ) — หน้าตั้งค่าเลือกเครื่องนี้ (localStorage) · จอที่จับคู่กับเครื่องนี้ = ภาพจอทุกสถานะที่ป้อนด้วย publishDisplayState
//   • display-done: กะของ P210_DEV (openShift ของบริการ) + บิลเงินสด 1 ใบ (submitRegisterSale · ไม่ลบ แบบ sale-done) ⇒ QR ใบเสร็จออนไลน์ของบิลนั้น
//   • display-paying-promptpay: PromptPay ID ของร้าน QC (ensureQcPromptPay ของ P1.7U · คืนค่าใน cleanupIntents) ⇒ QR นิ่งยอดรอบนี้
//   • display-live: จอจับคู่กับเครื่องของรอบ DEVICE_ID (seedP115Once + กะจาก openShiftAsOwner) แล้วหน้าขายจริงในแท็บที่สองใส่ของ → จอเห็นบรรทัด
//   เก็บกวาด (cleanupP210 · หลังงานสุดท้าย/finally/สัญญาณ): ยกเลิกการจับคู่จอทั้งสอง · ปิดกะ P210_DEV (นับ = ยอดคาด) · เพิกถอนเครื่อง P210_DEV ·
//   ลบถังเพดานแลกรหัสของรอบ (pos:display:pair:<P210_IP>) · บิลคงอยู่ ◂
const P210_DEV = `posqc-vis-p210-${process.pid}`;
const P210_IP = `posqc-vis-p210-${process.pid}`;
const P210_COOKIE = "pos_display";
const P210 = {
  done: false,
  error: null as string | null,
  deviceRowId: "",
  token: "",
  liveToken: "",
  shiftId: "",
  sale: null as null | { saleId: string; receiptNo: string | null },
  seq: 0,
  log: [] as string[],
  ok: true,
  cleaned: false,
};
const p210Ctx = (deviceCode?: string) => ({ tenantId: T.tenantId, systemId: SYS, unitId, ...(deviceCode ? { deviceId: deviceCode } : {}) });

async function ensureP210Fixture(): Promise<void> {
  if (P210.done || P210.error) return;
  try {
    const { registerDevice } = await import("@/lib/modules/pos/device");
    const owner = await ownerActor();
    const rg = await registerDevice(p210Ctx(), owner, { name: "เคาน์เตอร์ 1", deviceCode: P210_DEV });
    if (!rg.ok) throw new StepError(`ลงทะเบียนเครื่อง ${P210_DEV}: ${rg.code}`);
    P210.deviceRowId = rg.device.id;
    P210.log.push(`เครื่อง ${P210_DEV} (เคาน์เตอร์ 1)`);
    if (jobs.some((j) => j.state === "display-done")) {
      const { openShift } = await import("@/lib/modules/pos/shift");
      const { quoteRegisterCart, submitRegisterSale } = await import("@/lib/modules/pos/register");
      const o = await openShift(p210Ctx(P210_DEV), owner, { deviceId: P210_DEV, deviceLabel: "เคาน์เตอร์ 1", floatSatang: 0 });
      if (!o.ok) throw new StepError(`เปิดกะ ${P210_DEV}: ${o.code}`);
      const sh = await prisma.posShift.findFirst({ where: { tenantId: T.tenantId, unitId, deviceId: P210_DEV, status: "OPEN" }, select: { id: true } });
      P210.shiftId = sh?.id ?? "";
      const cart = { lines: [{ name: "บิลภาพจอลูกค้า (QC P2.10)", qty: 1, unitPriceSatang: 62_500 }] };
      const q = await quoteRegisterCart(p210Ctx(P210_DEV), owner, cart);
      const g = q.ok ? q.grandTotalSatang : 62_500;
      const s = await submitRegisterSale(p210Ctx(P210_DEV), owner, { ...cart, idempotencyKey: `posqc-vis-p210-${process.pid}-done`, expectedGrandTotalSatang: g, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g });
      if (!s.ok) throw new StepError(`ขายบิลภาพ: ${s.code}`);
      P210.sale = { saleId: s.saleId, receiptNo: s.receiptNo };
      P210.log.push(`กะ ${P210.shiftId} + บิล ${s.receiptNo ?? s.saleId} (เงินสด ฿${g / 100} · ไม่ลบ)`);
    }
    if (jobs.some((j) => j.state === "display-paying-promptpay")) {
      await ensureQcPromptPay();
      P210.log.push(`PromptPay: ${INTENTS.ppNote}`);
    }
    P210.done = true;
  } catch (e) {
    P210.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
}

/** จับคู่จอกับเครื่อง (enable → pair ผ่านบริการ) — คืน token · LOCALE=en ⇒ ภาษาบนจอ = en */
async function p210PairDevice(deviceRowId: string): Promise<string> {
  const { enableCustomerDisplay, pairCustomerDisplay, updateCustomerDisplaySettings } = await import("@/lib/modules/pos/display");
  const owner = await ownerActor();
  const e = await enableCustomerDisplay(p210Ctx(), owner, { deviceId: deviceRowId });
  if (!e.ok) throw new StepError(`เปิดจอลูกค้า: ${e.code}`);
  const p = await pairCustomerDisplay({ code: e.pairCode }, { ip: P210_IP });
  if (!p.ok) throw new StepError(`จับคู่จอ: ${p.code}`);
  const s = await updateCustomerDisplaySettings(p210Ctx(), owner, { deviceId: deviceRowId, locale: LOCALE_EN ? "en" : null, showPoints: true, idleText: null });
  if (!s.ok) throw new StepError(`ค่าตั้งจอ: ${s.code}`);
  return p.token;
}

const P210_LINES = [
  { qty: 2, name: "ลาเต้", detail: "M · นมโอ๊ต · หวานน้อย", grossSatang: 20_000, discountSatang: 0 },
  { qty: 1, name: "อเมริกาโน่", detail: "L", grossSatang: 7_000, discountSatang: 0 },
  { qty: 1, name: "ครัวซองต์อัลมอนด์", grossSatang: 9_500, discountSatang: 1_000, discountLabel: "ของช่วงบ่าย" },
  { qty: 1, name: "เมล็ดกาแฟ 250 g", grossSatang: 32_000, discountSatang: 0 },
];
const P210_TOTALS = { subtotalSatang: 68_500, lineDiscountSatang: 1_000, billDiscountSatang: 0, coupon: { code: "WELCOME50", satang: 5_000 }, member: [], serviceChargeSatang: 0, grandTotalSatang: 62_500 };
const P210_MEMBER = { firstName: "สมชาย ใจดี", tier: "Gold", points: 1_240 };
const P210_STAMP = { name: "สะสมครบ 10 แก้ว ฟรี 1 แก้ว", stamps: 6, slots: 10, toAdd: 1 };
/** ภาพที่ป้อนให้จอ (ตัวเลขเท่าภาพ 11 แผง A) */
function p210StateOf(k: P210Key): Record<string, unknown> | null {
  const cart = { lines: P210_LINES, totals: P210_TOTALS };
  switch (k) {
    case "display-idle":
      return { phase: "idle" };
    case "display-cart":
    case "display-stale":
      return { phase: "cart", ...cart };
    case "display-member-stamps":
      return { phase: "cart", member: P210_MEMBER, ...cart, stamp: { ...P210_STAMP, stamps: 7 } }; // ใกล้ได้รางวัล (8/10)
    case "display-paying-promptpay":
      return { phase: "paying", member: P210_MEMBER, ...cart, stamp: P210_STAMP, pay: { method: "PROMPTPAY", dueSatang: 62_500, roundSatang: 32_500, paidSatang: 30_000, remainingSatang: 32_500 } };
    case "display-paying-cash":
      return { phase: "paying", member: P210_MEMBER, ...cart, stamp: P210_STAMP, pay: { method: "CASH", dueSatang: 62_500, roundSatang: 30_000, paidSatang: 32_500, remainingSatang: 30_000, cashReceivedSatang: 50_000, changeSatang: 20_000 } };
    case "display-paying-card":
      return { phase: "paying", ...cart, pay: { method: "CARD", dueSatang: 62_500, roundSatang: 62_500, paidSatang: 0, remainingSatang: 62_500 } };
    case "display-done":
      return { phase: "done", member: P210_MEMBER, ...cart, stamp: P210_STAMP, done: { receiptNo: P210.sale?.receiptNo ?? null, ...(P210.sale ? { saleId: P210.sale.saleId } : {}), changeSatang: 20_000, pointsEarned: 62 } };
    default:
      return null;
  }
}
async function p210Publish(state: Record<string, unknown>): Promise<void> {
  const { publishDisplayState } = await import("@/lib/modules/pos/display");
  const { displaySeqNow } = await import("@/lib/modules/pos/display-shared");
  P210.seq = displaySeqNow(Date.now(), P210.seq);
  const r = await publishDisplayState(p210Ctx(P210_DEV), await ownerActor(), { deviceCode: P210_DEV, seq: P210.seq, state: state as never });
  if (!r.ok || !r.paired || !r.written) throw new StepError(`publishDisplayState: ${r.ok ? `paired ${r.paired} written ${"written" in r ? r.written : "-"}` : r.code}`);
}
const p210CookieTarget = () => ({ name: P210_COOKIE, url: `${BASE}/d`, path: "/d" });
async function p210SetCookie(page: Any, token: string): Promise<void> {
  await page.deleteCookie(p210CookieTarget()).catch(() => undefined);
  await page.setCookie({ ...p210CookieTarget(), value: token, httpOnly: true, secure: BASE.startsWith("https:") });
}

/** ก่อนเปิดหน้า: fixture · จับคู่ · คุกกี้ของจอ · ภาพที่ป้อน — พังไม่โยน (เก็บเหตุผลให้ runP210State โยนเป็นขั้นตอนพัง) */
const P210_PREP_ERR = new Map<Any, string>();
async function prepP210(page: Any, k: P210Key): Promise<void> {
  try {
    await ensureP210Fixture();
    if (P210.error) throw new StepError(`fixture P2.10: ${P210.error}`);
    if (k === "settings-display-unpaired" || k === "settings-display-code") return;
    if (k === "display-pair") {
      await page.deleteCookie(p210CookieTarget()).catch(() => undefined);
      return;
    }
    if (k === "display-live") {
      if (!P115.deviceRowId) throw new StepError(`ไม่มีเครื่องของรอบ (${P115.error ?? "seedP115Once"})`);
      if (!P210.liveToken) P210.liveToken = await p210PairDevice(P115.deviceRowId);
      await p210SetCookie(page, P210.liveToken);
      return;
    }
    if (!P210.token) P210.token = await p210PairDevice(P210.deviceRowId);
    if (k === "settings-display-online") {
      const { readCustomerDisplay } = await import("@/lib/modules/pos/display");
      const r = await readCustomerDisplay({ token: P210.token });
      if (!r.ok) throw new StepError(`อ่านจอ: ${r.code}`);
      return;
    }
    await p210SetCookie(page, P210.token);
    const st = k === "display-unsupported" ? p210StateOf("display-cart") : p210StateOf(k);
    if (st) await p210Publish(st);
    if (k === "display-stale") {
      // หน้าขายเงียบ 121 วิ (เลื่อน stateAt ของแถวจอในร้าน QC — สคริปต์เท่านั้น · ผู้เขียนเดียวของ src/ คือ pos/display.ts)
      await prisma.posCustomerDisplay.updateMany({ where: { tenantId: T.tenantId, deviceId: P210.deviceRowId, status: "ACTIVE" }, data: { stateAt: new Date(Date.now() - 121_000) } });
    }
  } catch (e) {
    P210_PREP_ERR.set(page, e instanceof Error ? e.message.slice(0, 200) : String(e));
  }
}
async function p210Phase(page: Any, phase: string, timeout = 15_000): Promise<void> {
  await page.waitForSelector(`[data-testid="pos-display"][data-phase="${phase}"]`, { timeout }).catch(() => {
    throw new StepError(`จอไม่อยู่ในสถานะ ${phase}`);
  });
}
async function p210Img(page: Any, testid: string): Promise<void> {
  await page.waitForFunction((id: string) => !!document.querySelector(`[data-testid="${id}"] img`), { timeout: 10_000 }, testid).catch(() => {
    throw new StepError(`ไม่มีภาพ QR ใน ${testid}`);
  });
}

async function runP210State(page: Any, k: P210Key, _device: Device): Promise<void> {
  const pre = P210_PREP_ERR.get(page);
  if (pre) throw new StepError(pre);
  switch (k) {
    case "settings-display-unpaired":
    case "settings-display-code":
    case "settings-display-online": {
      await clickEl(page, tid(`pos-device-card-${P210.deviceRowId}`)).catch(() => undefined);
      await visibleEl(page, tid("pos-settings-display"), 0, 15_000);
      if (k === "settings-display-unpaired") {
        await page.waitForSelector('[data-testid="pos-settings-display-status"][data-paired="0"]', { timeout: 10_000 }).catch(() => {
          throw new StepError("สถานะจอไม่ใช่ \"ยังไม่ได้จับคู่\"");
        });
      } else if (k === "settings-display-code") {
        await clickEl(page, tid("pos-settings-display-enable"));
        await visibleEl(page, tid("pos-settings-display-code"), 0, 10_000);
        await page.waitForFunction(() => !!document.querySelector('[data-testid="pos-settings-display-qr"] img'), { timeout: 10_000 }).catch(() => undefined);
      } else {
        await page.waitForSelector('[data-testid="pos-settings-display-status"][data-online="1"]', { timeout: 10_000 }).catch(() => {
          throw new StepError("สถานะจอไม่ใช่ \"ออนไลน์\"");
        });
        await clickEl(page, tid("pos-settings-display-revoke"));
        await visibleEl(page, tid("pos-settings-display-revoke-dialog"), 0, 10_000);
      }
      const h = await visibleEl(page, tid("pos-settings-display"));
      await h.evaluate((el: Element) => el.scrollIntoView({ block: "center" }));
      return;
    }
    case "display-pair":
      await p210Phase(page, "pair");
      await typeInto(page, tid("pos-display-pair-code"), "ABCD2345");
      await clickEl(page, tid("pos-display-pair-submit"));
      await visibleEl(page, tid("pos-display-pair-error"), 0, 10_000);
      return;
    case "display-idle":
    case "display-stale":
      await p210Phase(page, "idle");
      await visibleEl(page, tid("pos-display-idle"));
      return;
    case "display-cart":
      await p210Phase(page, "cart");
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="pos-display-line"]').length === 4, { timeout: 10_000 }).catch(() => {
        throw new StepError("จอไม่ได้ 4 บรรทัด");
      });
      return;
    case "display-member-stamps":
      await p210Phase(page, "cart");
      await visibleEl(page, tid("pos-display-greeting"));
      await visibleEl(page, tid("pos-display-stamp"));
      return;
    case "display-paying-promptpay":
      await p210Phase(page, "paying");
      await p210Img(page, "pos-display-pay-qr");
      await visibleEl(page, tid("pos-display-paid"));
      return;
    case "display-paying-cash":
      await p210Phase(page, "paying");
      await visibleEl(page, tid("pos-display-cash"));
      return;
    case "display-paying-card":
      await p210Phase(page, "paying");
      await visibleEl(page, tid("pos-display-card"));
      return;
    case "display-done":
      await p210Phase(page, "done");
      await visibleEl(page, tid("pos-display-done"));
      if (!P210.sale) throw new StepError("ไม่มีบิลภาพ (fixture)");
      await p210Img(page, "pos-display-receipt-qr");
      return;
    case "display-unsupported":
      await page.addStyleTag({ content: "#pos-display-unsupported{display:block!important}#pos-display-app{display:none!important}" });
      await visibleEl(page, tid("pos-display-unsupported"));
      return;
    case "display-live": {
      if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน)");
      const reg = await BROWSER.newPage();
      try {
        await pinDevice(reg, DEVICE_ID);
        const json = await staffSessionJson(userKey, DEVICE_ID).catch(() => null);
        if (json) await injectStaff(reg, DEVICE_ID, json);
        await reg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await reg.setCookie(...USER_COOKIES);
        await reg.goto(`${BASE}${pathOf("register")}`, { waitUntil: "networkidle2", timeout: 60_000 });
        await ensureShift(reg);
        for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte]) await clickEl(reg, tid(`pos-reg-product-${id}`));
        await expectLines(reg, 2);
        await waitPayReady(reg);
        // POS P2.10 ▸ fix1 F8: แท็บหน้าขายที่เปิดใหม่ทำให้แท็บจอเป็น hidden (headless ใหม่ = เหมือนเบราว์เซอร์จริง) → จอหยุดโพลตามแบบ
        //    (ซ่อน = หยุด) — ภาพจริงคือแท็บเล็ตอีกเครื่องที่เปิดจออยู่ตลอด ⇒ ดึงแท็บจอขึ้นหน้าก่อนรอ (visibilitychange → อ่านทันที)
        await page.bringToFront();
        const seen = await page
          .waitForFunction(() => document.querySelectorAll('[data-testid="pos-display-line"]').length >= 2, { timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        if (!seen) {
          const diag = await p210LiveDiag(page, reg);
          console.log(`  ⚠️  display-live วินิจฉัย: ${diag}`);
          throw new StepError(`จอไม่เห็นบรรทัดจากหน้าขายจริงภายใน 20 วิ · ${diag}`.slice(0, 900));
        } // ◂
      } finally {
        await reg.close().catch(() => undefined);
      }
      return;
    }
  }
}

// POS P2.10 ▸ fix1 F8: วินิจฉัย display-live เมื่อจอไม่เห็นบรรทัด — หน้าขาย (ผลส่งล่าสุด · รหัสเครื่อง) · จอ (การมองเห็น · phase · ผลอ่านล่าสุด) ·
//    แถวจอใน DB (stateSeq · stateAt · phase · จำนวนบรรทัด) · readCustomerDisplay ตรงของโมดูล (seq · ver · phase · บรรทัด)
async function p210LiveDiag(page: Any, reg: Any): Promise<string> {
  const part = async (label: string, fn: () => Promise<unknown>): Promise<string> => {
    try {
      return `${label} ${JSON.stringify(await fn())}`;
    } catch (e) {
      return `${label} ✗ ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
    }
  };
  const out = [
    await part("หน้าขาย", () =>
      reg.evaluate(() => {
        const w = window as unknown as { __posDisplayPublish?: unknown };
        return { vis: document.visibilityState, publish: w.__posDisplayPublish ?? null, lines: document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]').length };
      }),
    ),
    await part("จอ", () =>
      page.evaluate(() => {
        const w = window as unknown as { __posDisplayRead?: unknown };
        const el = document.querySelector('[data-testid="pos-display"]');
        return { vis: document.visibilityState, phase: el?.getAttribute("data-phase") ?? null, read: w.__posDisplayRead ?? null, lines: document.querySelectorAll('[data-testid="pos-display-line"]').length };
      }),
    ),
    await part("แถวจอ", async () => {
      const row = await prisma.posCustomerDisplay.findFirst({ where: { tenantId: T.tenantId, deviceId: P115.deviceRowId, status: "ACTIVE" }, select: { stateSeq: true, stateAt: true, state: true, lastPolledAt: true } });
      if (!row) return null;
      const st = (row.state ?? {}) as { phase?: string; lines?: unknown[] };
      return { seq: row.stateSeq, stateAt: row.stateAt?.toISOString() ?? null, phase: st.phase ?? null, lines: Array.isArray(st.lines) ? st.lines.length : 0, lastPolledAt: row.lastPolledAt?.toISOString() ?? null };
    }),
    await part("read", async () => {
      const { readCustomerDisplay } = await import("@/lib/modules/pos/display");
      const r = await readCustomerDisplay({ token: P210.liveToken });
      return r.ok ? { seq: r.seq, ver: r.ver, phase: r.changed ? r.view.phase : null, lines: r.changed ? r.view.lines.length : null } : { code: r.code };
    }),
  ];
  return out.join(" · ");
}
// ◂

async function cleanupP210(): Promise<void> {
  if (P210.cleaned || (!P210.deviceRowId && !P210.liveToken)) return;
  P210.cleaned = true;
  try {
    const { revokeCustomerDisplay } = await import("@/lib/modules/pos/display");
    const owner = await ownerActor();
    for (const devRow of [P210.deviceRowId, P210.liveToken ? P115.deviceRowId : ""].filter(Boolean)) {
      const r = await revokeCustomerDisplay(p210Ctx(), owner, { deviceId: devRow });
      P210.log.push(r.ok ? `ยกเลิกจับคู่จอของเครื่อง ${devRow}` : r.code === "NOT_FOUND" ? `เครื่อง ${devRow} ไม่มีจอค้าง` : `⚠️ ยกเลิกจับคู่จอ ${devRow}: ${r.code}`);
      if (!r.ok && r.code !== "NOT_FOUND") P210.ok = false;
    }
  } catch (e) {
    P210.ok = false;
    P210.log.push(`⚠️ ยกเลิกจับคู่จอไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
  if (P210.shiftId) {
    const c = await closeShiftAsOwner(P210.shiftId, "p210");
    P210.log.push(c.detail);
    if (!c.ok) P210.ok = false;
  }
  if (P210.deviceRowId) {
    try {
      const { revokeDevice } = await import("@/lib/modules/pos/device");
      const r = await revokeDevice(p210Ctx(), await ownerActor(), { id: P210.deviceRowId });
      P210.log.push(r.ok ? `เพิกถอนเครื่อง ${P210_DEV}` : `⚠️ เพิกถอนเครื่อง ${P210_DEV}: ${r.code}`);
      if (!r.ok) P210.ok = false;
    } catch (e) {
      P210.ok = false;
      P210.log.push(`⚠️ เพิกถอนเครื่องไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  }
  const nb = await prisma.chatRateBucket.deleteMany({ where: { key: `pos:display:pair:${P210_IP}` } }).catch(() => ({ count: -1 }));
  P210.log.push(`ถังเพดานแลกรหัสของรอบ ${nb.count}`);
}
// ◂ POS P2.10

// ═══════════════════ POS P1.7U ▸ ใบขอรับเงินของภาพ (PromptPay ID ของร้าน QC · เก็บกวาดใบของรอบนี้) ═══════════════════
const INTENT_STATES: ReadonlySet<string> = new Set(["paydlg-promptpay-qr", "paydlg-promptpay-paid", "paydlg-promptpay-timeout"]); // POS HF-P1CLOSE ▸ + timeout ◂
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
  if (userKey === "manager") await ensureManagerUser(); // POS P2.11U ▸ มติ 11: ผู้จัดการสาขาสีลมของภาพ (สร้าง/ใช้ซ้ำ) ◂
  // POS P2.11U ▸ fix2 มติ 4: ซาก Membership ผู้จัดการของภาพจากรอบ manager ที่ถูก SIGKILL (cleanup ไม่ได้รัน) — รอบอื่นของร้าน coffee ลบให้
  //   เฉพาะเมื่อผู้ใช้นั้นไม่มี session ที่ยังไม่หมดอายุ (กันรอบ manager ที่กำลังรันขนาน · session ของรอบ manager อยู่ 1 ชม.) · id ตายตัวเดียวกับ ensureManagerUser
  else if (tenantKey === "coffee" && !(await prisma.session.findFirst({ where: { userId: MANAGER_VIS.userId, expiresAt: { gt: new Date() } }, select: { id: true } })))
    await prisma.membership.deleteMany({ where: { userId: MANAGER_VIS.userId, tenantId: T.tenantId } });
  // ◂
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
  if (STATES_ON && (pages.includes("register") || pages.includes("tables")) && userKey !== "owner") { // POS P2.4U ▸ fix 1: --page tables ของแคชเชียร์ก็ต้องให้เจ้าของเปิดกะของเครื่อง (ไม่งั้นเปิดด้วยคุกกี้แคชเชียร์ = ไม่มีสิทธิ์ ⇒ ไม่มีกะ ⇒ เช็คบิลปิด) ◂
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
  // HF-VIS-SHIFTS ▸ + เจ้าของที่มีสถานะหน้ากะนอกจาก shifts-noshift (shiftsSale ขายผ่านหน้าขายของ SHIFTS_DEVICE_ID ⇒ ต้องมี PIN/โทเคน) ◂
  if (jobs.some((j) => j.page === "register" || (isP3skuState(j.state) && j.state.startsWith("settings-devices-lan")) /* POS P3-SKEL U ▸ เครื่องของรอบของแท็บเครื่อง ◂ */ || j.state === "display-live" /* POS P2.10 */ || (j.page === "tables" && !!j.state) || isPaydoneState(j.state) || (userKey === "owner" && j.page === "shifts" && !!j.state && j.state !== "shifts-noshift"))) { // POS P2.4U ▸ + tables (เช็คบิลต้องมีโทเคนผู้ขาย) ◂
    await seedP115Once();
    console.log(P115.error ? `  ⚠️ ข้อมูลภาพ P1.15U: ${P115.error}` : `  ข้อมูลภาพ P1.15U: เครื่อง ${DEVICE_ID} · PIN ${Object.keys(P115.pins).join("/")} (ไม่พิมพ์ค่า) · บิลพัก ${P115.heldId || "-"}`);
  }
  if (jobs.some((j) => j.state && (INTENT_STATES.has(j.state) || (isP37uState(j.state) && j.page === "orders") /* POS P3.7U ▸ ประตู A ต้องมีพร้อมเพย์ ◂ */ || j.state === "paydlg-intent-slip" /* POS P3-SKEL U ◂ */))) {
    await ensureQcPromptPay(); // POS P1.7U
    console.log(`  PromptPay ของร้าน QC: ${INTENTS.ppNote}`);
  }
  if (settingsStatesOn && pages.includes("settings") && !P29U_WO && !P29BU_WO) { // POS P2.9U ▸ wo p2.9u ไม่ใช้เครื่อง/กะของ 17B ◂ · POS P2.9bU ◂
    await seedSettingsOnce(); // POS P1.10 U — พังไม่โยน (ทุกสถานะ settings-* ตกพร้อมเหตุผล)
    console.log(SETTINGS.error ? `  ⚠️ เครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.error}` : `  เครื่อง QC ของหน้าตั้งค่า: ${SETTINGS.devices.map((d) => d.id).join(" · ")} · กะ ${SETTINGS.shiftId || "-"}`);
  }
  // POS P1.18U ▸ ประวัติ ≥ 3 แถว · fixture ภาพ 19ก ◂
  if (jobs.some((j) => j.state === "settings-history")) {
    await seedHistoryOnce();
    console.log(P118U.history?.error ? `  ⚠️ ประวัติการเปลี่ยน: ${P118U.history.error}` : `  ประวัติการเปลี่ยน: มี ${P118U.history?.before} แถว · แก้เพิ่ม ${P118U.history?.edits}`);
  }
  // POS P1.12U ▸ สมาชิก QC + ค่าตั้งแต้ม + ยอดแต้มก่อนเปิดหน้าขาย (สถานะสมาชิก) ◂
  if (jobs.some((j) => j.state && MEMBER_REG_STATES.has(j.state))) {
    await prepMemberFixture();
    console.log(MEMBERX.error ? `  ⚠️ สมาชิก QC: ${MEMBERX.error}` : `  สมาชิก QC ${MEMBERX.id}: แต้ม ${MEMBERX.balanceBefore} → ${MEMBERX.balanceAfter}${MEMBERX.toppedUp ? ` (เติม ${MEMBERX.toppedUp} · ${MEMBERX.topupKey})` : ""}${MEMBERX.settingsChanged ? " · ตั้งค่าแต้มใหม่" : ""}`);
    const cp = MEMBERX.coupon;
    console.log(MEMBERX.couponError ? `  ⚠️ คูปอง QC: ${MEMBERX.couponError}` : `  คูปอง QC ${QC_COUPON_CODE}: ระบบ ${cp.systemId}${cp.systemCreated ? " (สร้างใหม่ + ผูกสาขา)" : ""} · คูปอง ${cp.couponId}${cp.couponCreated ? " (สร้างใหม่)" : cp.reactivated ? " (เปิดใหม่)" : ""}`);
  }
  // POS P1.13U ▸ สมุด QC ออกใบกำกับได้ก่อนเปิดหน้าขาย (registerStatus อ่านตอนโหลดหน้า) · บิลของสถานะใบกำกับในลิ้นชัก ◂
  if (jobs.some((j) => j.state && TAXINV_REG_STATES.has(j.state))) {
    await prepTaxInvoiceBook();
    console.log(TAXINV.error ? `  ⚠️ สมุด QC สำหรับ 15A: ${TAXINV.error}` : "  สมุด QC พร้อมออกใบกำกับ (15A)");
  }
  if (billsStatesOn && pages.includes("sales") && jobs.some((j) => j.state && TAXINV_BILL_STATES.has(j.state))) {
    await seedTaxInvBillsOnce();
    console.log(TAXINV.billsError ? `  ⚠️ บิลภาพใบกำกับ: ${TAXINV.billsError}` : `  บิลภาพใบกำกับ: คำขอ ${TAXINV.reqSale || "-"} (${TAXINV.requestId || "-"}) · ออกแล้ว ${TAXINV.issSale || "-"} → TX ${TAXINV.docNo ?? "?"} docId ${TAXINV.docId || "-"}${TAXINV.reused.length ? ` (ใช้ชุดวันนี้ซ้ำ: ${TAXINV.reused.join(" · ")})` : ""}`);
  }
  if (billsStatesOn && pages.includes("sales") && !P29U_WO && !P29BU_WO) { // POS P2.9U ▸ wo p2.9u ใช้บิลของ sale-done-giftcard ◂ · POS P2.9bU ▸ ใช้มัดจำของรอบ ◂
    await seedBillsOnce(); // POS P1.16 U — พังไม่โยน (ทุกสถานะ bills-* ตกพร้อมเหตุผล)
    console.log(BILLS.error ? `  ⚠️ บิลชุดภาพ: ${BILLS.error}` : `  บิลชุดภาพ: ${BILLS.reused ? "ใช้ชุดของวันนี้ซ้ำ" : `สร้าง ${Object.keys(BILLS.ids).length} ใบ`} · เป้าหมาย ${BILLS.target}`);
  }
  // POS P2.1U ▸ fixture ช่องทาง (หน้าตั้งค่า · บิล · จอชำระ) + บิลช่องทางของวันนี้ (หลังบิลชุดภาพ = ใหม่สุดในรายการ) ◂
  if (jobs.some((j) => j.state && P21U_FIXTURE_STATES.has(j.state))) {
    await ensureChannelFixture();
    console.log(P21U.error ? `  ⚠️ ช่องทาง QC: ${P21U.error}` : `  ช่องทาง QC: ${Object.keys(P21U.ids).sort().join(" · ")}${P21U.notes.length ? ` · ${P21U.notes.join(" · ")}` : " · ไม่เขียน"}`);
  }
  if (billsStatesOn && pages.includes("sales") && jobs.some((j) => j.state === "bills-channels" || j.state === "bills-drawer-commission")) {
    await seedChannelBillsOnce();
    console.log(P21U.bills.error ? `  ⚠️ บิลช่องทาง: ${P21U.bills.error}` : `  บิลช่องทาง: เว็บร้าน ${P21U.bills.web} · LINE MAN ${P21U.bills.lineman} (${P21U_REF})${P21U.bills.reused ? ` · ใช้คู่ล่าสุดของวันนี้ซ้ำ ${P21U.bills.reused} ใบ` : " · สร้างคู่ใหม่ (คีย์ต่อรอบ)"} · ${P21U.bills.page}`);
  }
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  })) as Any;
  const browser = (BROWSER = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE_DIRS[0]}`],
  }));
  try {
    if (STATES_ON && jobs.some((j) => j.state && (j.page === "register" || j.page === "tables" || j.state === "display-live" /* POS P2.10 */ || isP29buState(j.state) || isP34uState(j.state) /* POS P3.4U */))) await openShiftAsOwner(browser, ownerCookies, { width: 1440, height: 900 }); // POS P2.4U ▸ + tables ◂ · POS P2.9bU ▸ มัดจำ fixture ต้องมีกะของเครื่อง ◂
    for (const job of jobs) {
      {
        const p = job.page;
        const v = job.v;
        // POS P3.4U ▸ มติ 11: สถานะออฟไลน์ = browser context ใหม่ (IndexedDB/คิวไม่ข้ามสถานะ) — ปิดหลังถ่าย ◂
        const ctx34 = isP34uState(job.state) || isP37uState(job.state) /* POS P3.7U ▸ CD-P37U-10: context ใหม่ทุกสถานะ ◂ */ || isP36uState(job.state) /* POS P3.6U ▸ CD-P36U-12 ◂ */ || isP3skuState(job.state) /* POS P3-SKEL U ▸ CD-SKELU-12 ◂ */ || isP38uState(job.state) /* POS P3.8U ▸ CD-P38U-11: context ใหม่ต่อภาพ ◂ */ ? (typeof browser.createBrowserContext === "function" ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext()) : null;
        Object.assign(P34U_NET, { offline: false, suppressed: 0, snapAt: 0 }); // POS P3.4U fix2 ▸ สถานะเครือข่ายต่อภาพ ◂
        const page = ctx34 ? await ctx34.newPage() : await browser.newPage();
        await pinDevice(
          page,
          isP34uState(job.state) ? DEVICE_ID /* POS P3.4U ▸ เครื่องของกะรอบ (หน้ากะ/ตั้งค่าด้วย) ◂ */ : isP3skuState(job.state) && p === "settings" ? DEVICE_ID /* POS P3-SKEL U ▸ แท็บเครื่องเลือกเครื่องของรอบ ◂ */ : isP210State(job.state) ? P210_DEV /* POS P2.10 */ : job.state === "register-empty-catalogue" ? EMPTY_DEVICE_ID : p === "settings" && job.state ? SETTINGS_DEVICE_CODES[isPaydoneState(job.state) ? 1 : 0] : p === "shifts" && job.state ? SHIFTS_DEVICE_ID : p === "sales" && job.state ? BILLS_DEVICE_ID : DEVICE_ID,
        ); // P1.10 U: หน้าตั้งค่าใช้เครื่อง QC 1 (paydone-print = เครื่อง 2 ที่มีกะ) // P1.16 U: หน้าบิลใช้เครื่องของกะภาพบิล (การ์ดเงินสด "จากลิ้นชักกะ #N") // R3 V4: เครื่องเดียวกับที่เจ้าของเปิดกะให้ · P1.9 U: สถานะหน้ากะใช้เครื่องแยก
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.name !== "desktop" });
        // POS P1.15U ▸ หน้าขาย = โทเคนผู้ขายของเครื่องที่หน้านี้ใช้ (discount-over-sheet = แคชเชียร์ · เพดาน 10%) · ปลดล็อกแถว PIN ที่ lock-pin-locked ตั้งไว้ ◂
        if ((p === "register" || (p === "tables" && !!job.state) || isPaydoneState(job.state) || job.state === "offline-close-blocked" /* POS P3.4U ▸ ขายบนหน้าขายก่อนเปิดหน้ากะ ◂ */) && P115.seeded && job.state !== "register-empty-catalogue") { // POS P2.4U ▸ + tables ◂
          await unlockRunPin().catch(() => undefined);
          const dev = isPaydoneState(job.state) ? SETTINGS_DEVICE_CODES[1] : DEVICE_ID;
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
        // POS P2.13 ▸ developers-pos = หน้าสาธารณะ: ไม่ส่งคุกกี้ session/ร้าน (ส่งเฉพาะ LOCALE ของรอบ en) — พิสูจน์ว่าเปิดได้โดยไม่ล็อกอิน ◂
        const jobCookies = job.state === "developers-pos" ? cookies.filter((c: Any) => c.name === "LOCALE") : cookies;
        if (jobCookies.length) await page.setCookie(...jobCookies);
        const consoleErrors: string[] = [];
        const httpErrors: string[] = [];
        const http5xx: string[] = [];
        page.on("pageerror", (e: Error) => consoleErrors.push(e.message.slice(0, 160)));
        page.on("console", (m: Any) => {
          // POS P2.12U ▸ fix1 F7: "Failed to load resource" ต่อท้าย URL ที่ล้ม (m.location().url) — บรรทัดสถานะบอกได้เลยว่าไฟล์ไหน ◂
          if (m.type() === "error") {
            const txt = String(m.text());
            if (isP34uState(job.state) && p34uSuppress(txt, String(m.location?.()?.url ?? ""))) return; // POS P3.4U fix2 ▸ ช่วงตัดเน็ตของ harness เท่านั้น ◂
            if (isP3skuState(job.state) && p3skuSuppress(job.state, txt, String(m.location?.()?.url ?? ""))) return; // POS P3-SKEL U fix2 ▸ 404 ของไฟล์สลิป fixture (QC5 ไม่มี slip storage) เท่านั้น ◂
            const at = /Failed to load resource/.test(txt) ? String(m.location?.()?.url ?? "").replace(BASE, "") : "";
            consoleErrors.push(at ? `${txt.slice(0, 120)} @ ${at.slice(0, 200)}` : txt.slice(0, 160));
          }
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
        // POS P1.18U ▸ fixture ภาพ 19ก สร้างก่อนงานแรกของสถานะนี้ (ระบบ POS ที่สองโผล่ในเมนูเฉพาะช่วงภาพ 19ก) · ลบหลังงานสุดท้ายของสถานะ ◂
        if (job.state === "register-empty-catalogue" && !P118U.empty.systemId && !P118U.empty.error) {
          await seedEmptyCatalogueOnce();
          console.log(P118U.empty.error ? `  ⚠️ fixture ภาพ 19ก: ${P118U.empty.error}` : `  fixture ภาพ 19ก: ระบบ ${P118U.empty.systemId} · สาขา ${EMPTY_UNIT.id}${P118U.empty.created.length ? ` (สร้าง ${P118U.empty.created.join("+")})` : " (ใช้ของเดิม)"}`);
        }
        // POS P2.2U ▸ fixture ราคา/โปรก่อนงานแรกที่ใช้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (job.state && P22U_FIXTURE_STATES.has(job.state) && !P22U.done && !P22U.error) {
          await ensureP22uFixture(jobs.some((j) => j.state === P22U_BILL_STATE));
          console.log(P22U.error ? `  ⚠️ fixture P2.2U: ${P22U.error}` : `  fixture P2.2U: โปร ${P22U.rules.map((r) => r.state).join("/")} · แถวราคา ${P22U.rowsBefore.size} สินค้า${P22U.sale ? ` · บิล ${P22U.sale}` : ""}`);
        }
        // POS P2.3U ▸ fixture สูตรก่อนงานแรกของช่วง + บิลค้างตัดก่อนภาพ register-pending-cuts (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (job.state && P23U_FIXTURE_STATES.has(job.state)) {
          if (!P23U.done && !P23U.error) {
            await ensureP23uFixture();
            console.log(P23U.error ? `  ⚠️ fixture P2.3U: ${P23U.error}` : `  fixture P2.3U รอบ ${P23U.round}: เมนู ${P23U.products.length} · วัตถุดิบ ${P23U.itemIds.length} · กลุ่มขนาด S/M/L`);
          }
          if (job.state === P23U_REG_STATE && !P23U.pendingSale && !P23U.error) {
            await ensureP23uPending();
            console.log(P23U.error ? `  ⚠️ fixture P2.3U: ${P23U.error}` : `  fixture P2.3U: บิลค้างตัด ${P23U.pendingSale}`);
          }
        }
        // POS P2.8U ▸ fixture ออเดอร์ก่อนงานแรกที่ใช้ · ออเดอร์ใกล้หมดเวลารับก่อน orders-new-late · ปิดรับแชทก่อน orders-paused-banner (พังไม่โยน) ◂
        if (job.state && P28U_FIXTURE_STATES.has(job.state) && !P28U.done && !P28U.error) {
          await ensureP28uFixture();
          console.log(P28U.error ? `  ⚠️ fixture P2.8U: ${P28U.error}` : `  fixture P2.8U: ${P28U.log.join(" · ")}`);
        }
        if (job.state === "orders-new-late" && P28U.done) await p28uLateOrder().then((o) => (P28U.refs.newLate = o.ref)).catch((e: unknown) => (P28U.error = `ออเดอร์ใกล้หมดเวลารับ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`));
        if (job.state === "orders-paused-banner" && P28U.done) await p28uPause(true).catch((e: unknown) => console.error(`  ⚠️ ปิดรับแชทไม่สำเร็จ: ${e instanceof Error ? e.message : e}`));
        // POS P2.6U ▸ fixture ครัวก่อนงานแรกที่ใช้ · เวลาเลยเป้า/ใกล้เป้าก่อนทุกภาพ · พักครัวก่อน kds-paused-banner · เสิร์ฟคืนก่อน kds-served-recall ·
        //   ออเดอร์เสิร์ฟแล้ว-ยกเลิกก่อน kds-refusal-toast (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (job.state && P26U_FIXTURE_STATES.has(job.state)) {
          if (!P26U.done && !P26U.error) {
            await ensureP26uFixture();
            console.log(P26U.error ? `  ⚠️ fixture P2.6U: ${P26U.error}` : `  fixture P2.6U: ${P26U.log.join(" · ")}`);
          }
          if (P26U.done) {
            const prep = async (what: string, fn: () => Promise<void>) => fn().catch((e: unknown) => (P26U.error = `${what}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`));
            await prep("เลื่อนเวลา", p26uRetime);
            if (job.state === "kds-paused-banner") await prep("พักครัว", () => p26uPause(true));
            if (job.state === "kds-served-recall" && userKey === "owner") await prep("เสิร์ฟคืน", p26uServeAgain);
            if (job.state === "kds-refusal-toast") await prep("ออเดอร์เสิร์ฟแล้ว-ยกเลิก", p26uVoidedServed);
          }
        }
        // POS P2.5U ▸ fixture แยกบิลก่อนงานแรกที่ใช้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP25uState(job.state) && !P25U.done && !P25U.error) {
          await ensureP25uFixture();
          console.log(P25U.error ? `  ⚠️ fixture P2.5U: ${P25U.error}` : `  fixture P2.5U: ${P25U.log.join(" · ")}`);
        }
        // POS P2.9bU ▸ fixture มัดจำก่อนงานแรกของใบนี้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP29buState(job.state) && !P29BU.done && !P29BU.error) {
          await ensureP29buFixture();
          console.log(P29BU.error ? `  ⚠️ fixture P2.9bU: ${P29BU.error}` : `  fixture P2.9bU: ${P29BU.log.join(" · ")}`);
        }
        // POS P2.9U ▸ fixture บัตร/เครดิต/ทิปก่อนงานแรกของใบนี้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (job.state && isP29uState(job.state) && !P29U.done && !P29U.error) {
          await ensureP29uFixture();
          console.log(P29U.error ? `  ⚠️ fixture P2.9U: ${P29U.error}` : `  fixture P2.9U: ${P29U.log.join(" · ")}`);
        }
        // POS P2.12U ▸ fixture รายงาน/บิลก่อนงานแรกของใบนี้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP212uState(job.state) && !P212U.done && !P212U.error) {
          await ensureP212uFixture();
          console.log(P212U.error ? `  ⚠️ fixture P2.12U: ${P212U.error}` : `  fixture P2.12U: ${P212U.log.join(" · ")}`);
        }
        // POS P3.5U ▸ fixture HR ก่อนงานแรกของใบนี้ · ตาราง/กะ/โทเคนต่องาน (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP35uState(job.state)) {
          if (!P35U.done && !P35U.error) {
            await ensureP35uFixture();
            console.log(P35U.error ? `  ⚠️ fixture P3.5U: ${P35U.error}` : `  fixture P3.5U: ${P35U.log.join(" · ")}`);
          }
          await prepP35u(page, job.state);
        }
        // POS P3.4U ▸ fixture ออฟไลน์ก่อนงานแรกของใบนี้ · ลบ snapshot ล่าสุดของเครื่องทุกงาน (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP34uState(job.state)) {
          if (!P34U.done && !P34U.error) {
            await ensureP34uFixture();
            console.log(P34U.error ? `  ⚠️ fixture P3.4U: ${P34U.error}` : `  fixture P3.4U: ${P34U.log.join(" · ")}`);
          }
          await prepP34u();
        }
        // POS P3-SKEL U ▸ fixture ก่อนงานแรกของใบนี้ · agent/printerConfig ต่องาน (ด่านก่อนเขียน · พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP3skuState(job.state)) {
          if (!P3SKU.done && !P3SKU.error) {
            await ensureP3skuFixture();
            console.log(P3SKU.error ? `  ⚠️ fixture P3-SKEL U: ${P3SKU.error}` : `  fixture P3-SKEL U: ${P3SKU.log.join(" · ")}`);
          }
          await prepP3sku(job.state);
        }
        // POS P3.6U ▸ fixture ก่อนงานแรกของใบนี้ · ค่าตั้งวางบิลต่องาน (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP36uState(job.state)) {
          if (!P36U.done && !P36U.error) {
            await ensureP36uFixture();
            console.log(P36U.error ? `  ⚠️ fixture P3.6U: ${P36U.error}` : `  fixture P3.6U: ${P36U.log.join(" · ")}`);
          }
          await prepP36u(job.state);
        }
        // POS P3.7U ▸ fixture ก่อนงานแรกของใบนี้ · ค่าตั้งแชท/ออเดอร์ต่องาน (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP37uState(job.state)) {
          if (!P37U.done && !P37U.error) {
            await ensureP37uFixture();
            console.log(P37U.error ? `  ⚠️ fixture P3.7U: ${P37U.error}` : `  fixture P3.7U: ${P37U.log.join(" · ")}`);
          }
          await prepP37u(job.state);
        }
        // POS P3.9U ▸ fixture ก่อนงานแรกของใบนี้ · ค่าตั้งผู้ช่วย AI ต่องาน (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP39uState(job.state)) {
          if (!P39U.done && !P39U.error) {
            await ensureP39uFixture();
            console.log(P39U.error ? `  ⚠️ fixture P3.9U: ${P39U.error}` : `  fixture P3.9U: ${P39U.log.join(" · ")}`);
          }
          await prepP39u(job.state);
        }
        // POS P3.8U ▸ fixture ก่อนงานแรกของใบนี้ · ค่าตั้งบอร์ด/ห้องต่องาน (ด่านก่อนเขียน · พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP38uState(job.state)) {
          if (!P38U.done && !P38U.error) {
            await ensureP38uFixture();
            console.log(P38U.error ? `  ⚠️ fixture P3.8U: ${P38U.error}` : `  fixture P3.8U: ${P38U.log.join(" · ")}`);
          }
          await prepP38u(job.state);
          if (job.state === "shifts-close-board-hint") await pinDevice(page, P38U_SHIFT_DEV); // เครื่องที่มีกะเปิดของ fixture (สคริปต์หลังสุดชนะ)
        }
        // POS P2.11U ▸ fixture หลายสาขาก่อนงานแรกของใบนี้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP211uState(job.state) && !P211U.done && !P211U.error) {
          await ensureP211uFixture();
          console.log(P211U.error ? `  ⚠️ fixture P2.11U: ${P211U.error}` : `  fixture P2.11U: ${P211U.log.join(" · ")}`);
        }
        // POS P2.10 ▸ fixture/จับคู่/คุกกี้ของจอ/ภาพที่ป้อน ก่อนเปิดหน้า (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP210State(job.state)) {
          const first = !P210.done && !P210.error;
          await prepP210(page, job.state);
          if (first) console.log(P210.error ? `  ⚠️ fixture P2.10: ${P210.error}` : `  fixture P2.10: ${P210.log.join(" · ")}`);
        }
        // POS P2.7U ▸ fixture/หัว x-forwarded-for/พักรับก่อนภาพ closed (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP27State(job.state)) {
          const first = !P27.done && !P27.error;
          await prepP27(page, job.state);
          if (first) console.log(P27.error ? `  ⚠️ fixture P2.7U: ${P27.error}` : `  fixture P2.7U: ${P27.log.join(" · ")}`);
        }
        // POS P2.13 ▸ กวาดซาก/ลบคีย์ UI ของภาพก่อนหน้า/คีย์ fixture ของรายการ ก่อนเปิดหน้า (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (isP213State(job.state)) {
          const before = P213.log.length;
          await prepP213(job.state);
          if (P213.error || P213.log.length > before) console.log(P213.error ? `  ⚠️ fixture P2.13: ${P213.error}` : `  fixture P2.13: ${P213.log.slice(before).join(" · ")}`);
        }
        // POS P2.4U ▸ fixture โต๊ะก่อนงานแรกที่ใช้ (พังไม่โยน — สถานะตกพร้อมเหตุผล) ◂
        if (job.state && P24U_FIXTURE_STATES.has(job.state) && !P24U.done && !P24U.error) {
          await ensureP24uFixture();
          console.log(P24U.error ? `  ⚠️ fixture P2.4U: ${P24U.error}` : `  fixture P2.4U: ${P24U.log.join(" · ")}`);
        }
        const resp = await page.goto(`${BASE}${isP3skuState(job.state) ? p3skuPath(job.state) /* POS P3-SKEL U ▸ ?bill= รู้หลัง fixture ◂ */ : isP36uState(job.state) ? p36uPath(job.state) /* POS P3.6U ▸ ?bill= รู้หลังขาย ◂ */ : isP27State(job.state) ? p27Path(job.state) /* POS P2.7U */ : isP26uState(job.state) ? p26uPath(job) /* POS P2.6U */ : job.state === "register-table-mode" ? p24uRegTablePath() : p === "receipt-public" && job.state && isRpubState(job.state) ? rpubPath(job.state) : job.state === "register-empty-catalogue" ? emptyPath() : (job.path ?? pathOf(p))}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
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
        await page.screenshot({ path: file, fullPage: job.state !== "lock-screen-scroll" }); // POS HF-P1CLOSE ▸ จอล็อกที่เลื่อนแล้ว = ภาพเท่าจอ (overlay fixed) ◂
        // POS P2.12U ▸ pdf probe ◂ — เฉพาะ --pdf + สถานะหน้าพิมพ์ · ไฟล์ <state>-<user>-<locale>.pdf · ขนาดลงบรรทัดของสถานะ
        let pdfNote = "";
        if (PDF_PROBE && job.state && P212U_PRINT.has(job.state)) {
          const pdfFile = `${OUT}/${job.state}-${userKey}-${LOCALE_EN ? "en" : "th"}.pdf`;
          // POS P2.12U ▸ fix1 F1 (มติ 1) — พิมพ์เอกสารใน iframe ไม่ใช่หน้าแม่: อ่าน HTML ของ frame หลังฟอนต์โหลด → หน้าใหม่ setContent + <base href=origin> → page.pdf (ได้ @page + thead ซ้ำ + ไม่มีแถบแอป เหมือนผู้ใช้กด print() ของ iframe) ◂
          let pp: Awaited<ReturnType<typeof browser.newPage>> | null = null;
          try {
            const fh = await page.$(tid("pos-report-print-frame"));
            const frame = fh ? await fh.contentFrame() : null;
            if (!frame) throw new Error("ไม่พบ iframe หน้าพิมพ์ (pos-report-print-frame)");
            await frame.evaluate(() => document.fonts.ready.then(() => true));
            const doc = (await frame.evaluate(() => "<!doctype html>" + document.documentElement.outerHTML)) as string;
            const baseTag = `<base href="${BASE}/">`;
            const withBase = /<head(\s[^>]*)?>/i.test(doc) ? doc.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${baseTag}`) : doc.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${baseTag}</head>`);
            pp = await browser.newPage();
            await pp.setContent(withBase, { waitUntil: "networkidle0", timeout: 60_000 });
            await pp.evaluate(() => document.fonts.ready.then(() => true));
            const buf = (await pp.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })) as Uint8Array;
            writeFileSync(pdfFile, buf);
            pdfNote = ` · PDF (เอกสาร iframe) ${pdfFile} ${buf.length} B`;
          } catch (e) {
            pdfNote = ` · PDF ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
          } finally {
            await pp?.close().catch(() => undefined);
          }
          // ◂ POS P2.12U fix1 F1
        }
        if (job.state === "register-en") await restoreThaiLocale(page); // POS P1.18U
        if (job.state && P22U_FIXTURE_STATES.has(job.state) && job === jobs.filter((j) => j.state && P22U_FIXTURE_STATES.has(j.state)).at(-1)) await cleanupP22u(); // POS P2.2U
        // POS P2.3U ▸ บิลค้างตัดยกเลิกหลังภาพสุดท้ายของ register-pending-cuts · fixture ลบหลังงานสุดท้ายของช่วงติดกัน ◂
        if (job.state && P23U_FIXTURE_STATES.has(job.state)) {
          const nx = jobs[jobs.indexOf(job) + 1];
          if (job.state === P23U_REG_STATE && nx?.state !== P23U_REG_STATE) await voidP23uPending();
          if (!nx?.state || !P23U_FIXTURE_STATES.has(nx.state)) await cleanupP23u();
        }
        if (job.state === "register-empty-catalogue" && job === jobs.filter((j) => j.state === "register-empty-catalogue").at(-1)) await cleanupEmptyCatalogue(); // POS P1.18U
        if (job.state && P24U_FIXTURE_STATES.has(job.state) && job === jobs.filter((j) => j.state && P24U_FIXTURE_STATES.has(j.state)).at(-1)) await cleanupP24u(); // POS P2.4U
        if (isP25uState(job.state) && job === jobs.filter((j) => isP25uState(j.state)).at(-1)) await cleanupP25u(); // POS P2.5U
        if (job.state === "kds-paused-banner" && job === jobs.filter((j) => j.state === "kds-paused-banner").at(-1)) await p26uPause(false).catch(() => undefined); // POS P2.6U
        if (job.state && P26U_FIXTURE_STATES.has(job.state) && job === jobs.filter((j) => j.state && P26U_FIXTURE_STATES.has(j.state)).at(-1)) await cleanupP26u(); // POS P2.6U
        if (job.state === "orders-paused-banner" && job === jobs.filter((j) => j.state === "orders-paused-banner").at(-1)) await p28uPause(false).catch(() => undefined); // POS P2.8U
        if (job.state && P28U_FIXTURE_STATES.has(job.state) && job === jobs.filter((j) => j.state && P28U_FIXTURE_STATES.has(j.state)).at(-1)) await cleanupP28u(); // POS P2.8U
        if (job.state === "paydlg-tip" && job === jobs.filter((j) => j.state === "paydlg-tip").at(-1)) await p29uTipRestore(); // POS P2.9U
        if (job.state && isP29uState(job.state) && job === jobs.filter((j) => j.state && isP29uState(j.state)).at(-1)) await cleanupP29u(); // POS P2.9U
        if (isP29buState(job.state) && job === jobs.filter((j) => isP29buState(j.state)).at(-1)) await cleanupP29bu(); // POS P2.9bU
        if (isP211uState(job.state) && job === jobs.filter((j) => isP211uState(j.state)).at(-1)) await cleanupP211u(); // POS P2.11U
        if (job.state && P212U_PRINT.has(job.state)) await page.emulateMediaType(null).catch(() => undefined); // POS P2.12U ▸ คืนสื่อ screen หลังภาพหน้าพิมพ์ ◂
        if (isP212uState(job.state) && job === jobs.filter((j) => isP212uState(j.state)).at(-1)) await cleanupP212u(); // POS P2.12U
        if (isP35uState(job.state) && job === jobs.filter((j) => isP35uState(j.state)).at(-1)) await cleanupP35u(); // POS P3.5U
        if (isP34uState(job.state) && job === jobs.filter((j) => isP34uState(j.state)).at(-1)) await cleanupP34u(); // POS P3.4U
        if (isP39uState(job.state) && job === jobs.filter((j) => isP39uState(j.state)).at(-1)) await cleanupP39u(); // POS P3.9U
        if (isP37uState(job.state) && job === jobs.filter((j) => isP37uState(j.state)).at(-1)) await cleanupP37u(); // POS P3.7U
        if (isP36uState(job.state) && job === jobs.filter((j) => isP36uState(j.state)).at(-1)) await cleanupP36u(); // POS P3.6U
        if (isP3skuState(job.state) && job === jobs.filter((j) => isP3skuState(j.state)).at(-1)) await cleanupP3sku(); // POS P3-SKEL U
        if (isP38uState(job.state) && job === jobs.filter((j) => isP38uState(j.state)).at(-1)) await cleanupP38u(); // POS P3.8U
        if (isP210State(job.state) && job === jobs.filter((j) => isP210State(j.state)).at(-1)) await cleanupP210(); // POS P2.10
        if ((job.state === "table-closed" || job.state === "pre-closed") && P27.pausedNow) await p27Pause(null).catch(() => undefined); // POS P2.7U ▸ คืนพักรับหลังภาพ closed ◂
        if (isP27State(job.state) && job === jobs.filter((j) => isP27State(j.state)).at(-1)) await cleanupP27(); // POS P2.7U
        if (isP213State(job.state) && job === jobs.filter((j) => isP213State(j.state)).at(-1)) await cleanupP213(); // POS P2.13
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
        shots.push({ page: p, state: job.state, stepError, viewport: `${v.w}x${v.h}`, file, status, expect: exp, finalUrl, redirectedToLogin, overflow: ov.over, overflowEl: ov.el, consoleErrors, httpErrors: [...http5xx, ...httpErrors], http5xx: http5xx.length, ...(isP34uState(job.state) ? { offlineSuppressed: P34U_NET.suppressed } : {}) /* POS P3.4U fix2 ◂ */, ok });
        console.log(
          `  ${ok ? "✅" : "❌"} ${p}${job.state ? `/${job.state}` : ""} ${v.w}x${v.h} HTTP ${status}${isP34uState(job.state) && P34U_NET.suppressed ? ` · ออฟไลน์กรองแล้ว ${P34U_NET.suppressed}` /* POS P3.4U fix2 ◂ */ : ""}${stepError ? ` · ขั้นตอนพัง: ${stepError}` : ""} (คาด ${exp})${http5xx.length ? ` · คำขอย่อย 5xx ${http5xx.length}: ${http5xx[0]}` : ""}${redirectedToLogin ? " · เด้งไป /login" : ""}${ov.over ? ` · ล้นแนวนอน ${ov.el ?? "?"}` : ""}${consoleErrors.length ? ` · console error ${consoleErrors.length}: ${consoleErrors[0]}${httpErrors.length ? ` · 4xx ${httpErrors.length}: ${httpErrors[0]}` /* POS P2.12U ▸ fix1 F7 ◂ */ : ""}` : ""} → ${file}${pdfNote /* POS P2.12U ▸ pdf probe ◂ */}`,
        );
        await page.close();
        await ctx34?.close().catch(() => undefined); // POS P3.4U ◂
      }
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  await cleanupP27().catch((e: unknown) => console.error(`❌ เก็บกวาด P2.7U ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`)); // POS P2.7U
  if (P27.log.length) console.error(`${P27.ok ? "🧹" : "⚠️"} P2.7U: ${P27.log.join(" · ")}`);
  await cleanupP210(); // POS P2.10 (ก่อนปิดกะ/เพิกถอนเครื่องของรอบ — ยกเลิกจับคู่จอ · ปิดกะ + เพิกถอนเครื่อง P2.10)
  if (P210.log.length) console.error(`${P210.ok ? "🧹" : "⚠️"} P2.10: ${P210.log.join(" · ")}`);
  if (!P210.ok) failures++;
  await cleanupP34u(); // POS P3.4U (ก่อนปิดกะ/เพิกถอนเครื่อง — ทิ้งแถวคิวผู้จัดการ · คืนธงออฟไลน์ · ลบ snapshot ของเครื่องรอบนี้)
  if (P34U.log.length) console.error(`${P34U.ok ? "🧹" : "⚠️"} P3.4U: ${P34U.log.join(" · ")}`);
  if (!P34U.ok) failures++;
  await cleanupP36u(); // POS P3.6U (คืนค่าตั้งวางบิล · ยกเลิกบิลวางบิลของภาพ · ลบผู้จัดการของภาพ)
  if (P36U.log.length) console.error(`${P36U.ok ? "🧹" : "⚠️"} P3.6U: ${P36U.log.join(" · ")}`);
  if (!P36U.ok) failures++;
  await cleanupP3sku(); // POS P3-SKEL U (คืน printerConfig · เพิกถอน/ลบ agent ของ harness · ยกเลิกใบขอรับเงิน + บิลโอนของภาพ)
  if (P3SKU.log.length) console.error(`${P3SKU.ok ? "🧹" : "⚠️"} P3-SKEL U: ${P3SKU.log.join(" · ")}`);
  if (!P3SKU.ok) failures++;
  await cleanupP37u(); // POS P3.7U (คืนค่าตั้งแชท · ปฏิเสธ/ลบออเดอร์ของรอบ · ลบระบบแชทชั่วคราว)
  if (P37U.log.length) console.error(`${P37U.ok ? "🧹" : "⚠️"} P3.7U: ${P37U.log.join(" · ")}`);
  if (!P37U.ok) failures++;
  await cleanupP39u(); // POS P3.9U (คืนค่าตั้งผู้ช่วย AI · ลบ audit ของภาพ · ลบผู้จัดการชั่วคราว)
  await cleanupP38u(); // POS P3.8U (คืนค่าตั้งบอร์ดงาน/ห้องทีม/ผู้ช่วย AI · ลบ audit A11 ของภาพ)
  if (P38U.log.length) console.error(`${P38U.ok ? "🧹" : "⚠️"} P3.8U: ${P38U.log.join(" · ")}`);
  if (!P38U.ok) failures++;
  if (P39U.log.length) console.error(`${P39U.ok ? "🧹" : "⚠️"} P3.9U: ${P39U.log.join(" · ")}`);
  if (!P39U.ok) failures++;
  await cleanupP35u(); // POS P3.5U (ก่อนเพิกถอนเครื่อง — ปิดกะ · คืนค่าตั้ง · ลบแถวค่าคอมฯ · ลบระบบ HR ของรอบ)
  if (P35U.log.length) console.error(`${P35U.ok ? "🧹" : "⚠️"} P3.5U: ${P35U.log.join(" · ")}`);
  if (!P35U.ok) failures++;
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
  await cleanupTaxInv(); // POS P1.13U (ก่อน cleanRpub — คืนค่าสมุดหลังสุด)
  if (TAXINV.cleanup || TAXINV.close) console.error(`${TAXINV.cleanup?.error || (TAXINV.close && !TAXINV.close.ok) ? "⚠️" : "🧹"} ใบกำกับเต็มรูป: ลบคำขอ ${TAXINV.cleanup?.requests ?? 0} · OutboxEvent ${TAXINV.cleanup?.outbox ?? 0}${TAXINV.cleanup?.error ? ` · ${TAXINV.cleanup.error}` : ""}${TAXINV.close ? ` · ${TAXINV.close.detail}` : ""}${TAXINV.docId ? ` · ใบ TX ค้างในบัญชี QC4: ${TAXINV.docNo ?? "?"} (${TAXINV.docId})` : ""}`);
  if (TAXINV.cleanup?.error || (TAXINV.close && !TAXINV.close.ok)) failures++;
  await cleanRpub(); // POS P1.11U
  if (RPUB.cleanup) console.error(rpubCleanupLine());
  if (RPUB.cleanup?.error || (RPUB.close && !RPUB.close.ok) || (RPUB.abb?.toggled && RPUB.abb.restored !== "ok") || (RPUB.abb?.taxIdSet && RPUB.abb.taxIdRestored !== "ok")) failures++;
  if (BILLS.close) console.error(`${BILLS.close.ok ? "🧹" : "⚠️"} ${BILLS.close.detail}`);
  if (BILLS.close && !BILLS.close.ok) failures++;
  await cleanupIntents(); // POS P1.7U
  if (INTENTS.cleanup) console.error(`${INTENTS.cleanup.ok ? "🧹" : "⚠️"} ${INTENTS.cleanup.detail}`);
  if (INTENTS.cleanup && !INTENTS.cleanup.ok) failures++;
  await cleanupEmptyCatalogue(); // POS P1.18U
  if (P118U.empty.cleanup) console.error(`${P118U.empty.cleanup.ok ? "🧹" : "⚠️"} ${P118U.empty.cleanup.detail}`);
  if (P118U.empty.cleanup && !P118U.empty.cleanup.ok) failures++;
  await cleanupSettingsState(); // POS P1.10 U
  if (SETTINGS.cleanup) console.error(`${SETTINGS.cleanup.ok ? "🧹" : "⚠️"} ${SETTINGS.cleanup.detail}`);
  if (SETTINGS.cleanup && !SETTINGS.cleanup.ok) failures++;
  await cleanupP22u(); // POS P2.2U (ก่อน P2.1U — บิลพักของภาพป้ายบรรทัด · แถวราคา · โปร)
  if (P22U.cleanup) console.error(`${P22U.cleanup.ok ? "🧹" : "⚠️"} ${P22U.cleanup.detail}`);
  if (P22U.cleanup && !P22U.cleanup.ok) failures++;
  await cleanupP23u(); // POS P2.3U (บิลค้างตัด · สินค้า/วัตถุดิบชั่วคราว ที่ยังค้าง)
  if (P23U.log.length) console.error(p23uCleanupLine());
  if (!P23U.ok) failures++;
  await cleanupP24u(); // POS P2.4U (โซน/โต๊ะ/session/รอบ/คำขอ/จอง ของรอบนี้ที่ยังค้าง)
  if (P24U.log.length) console.error(p24uCleanupLine());
  if (!P24U.ok) failures++;
  await cleanupP25u(); // POS P2.5U (แผน/โต๊ะ/session/รอบ/สินค้าชั่วคราว · คืนค่าบริการ ของรอบนี้ที่ยังค้าง)
  if (P25U.log.length) console.error(p25uCleanupLine());
  if (!P25U.ok) failures++;
  await cleanupP28u(); // POS P2.8U (ออเดอร์ของรอบที่ยังค้าง · คืนค่าปิดรับแชท)
  if (P28U.log.length) console.error(p28uCleanupLine());
  if (!P28U.ok) failures++;
  await cleanupP26u(); // POS P2.6U (พักครัว · 86 · สถานีสินค้า · รอบ/ออเดอร์/โต๊ะ/สถานีของรอบที่ยังค้าง)
  if (P26U.log.length) console.error(p26uCleanupLine());
  if (!P26U.ok) failures++;
  await cleanupP29u(); // POS P2.9U (ระงับบัตรของรอบ · คืนค่าตั้งบัตร/ทิป)
  await cleanupP29bu(); // POS P2.9bU (คืนเงินมัดจำของรอบที่ยังเหลือ · คืนค่าตั้งรับมัดจำ)
  if (P29BU.log.length) console.error(`${P29BU.ok ? "🧹" : "⚠️"} P2.9bU: ${P29BU.log.join(" · ")}`);
  if (!P29BU.ok) failures++;
  await cleanupP211u(); // POS P2.11U (แถวราคาลาเต้ · ช่องทาง ZZVIS · ค่าใบเสร็จของสาขา · ลิงก์คลังของรอบ)
  await cleanupP212u(); // POS P2.12U (คืนเกณฑ์จุดผิดปกติเดิม)
  if (P212U.log.length) console.error(`${P212U.ok ? "🧹" : "⚠️"} P2.12U: ${P212U.log.join(" · ")}`);
  if (!P212U.ok) failures++;
  if (P211U.log.length) console.error(`${P211U.ok ? "🧹" : "⚠️"} P2.11U: ${P211U.log.join(" · ")}`);
  if (!P211U.ok) failures++;
  await cleanupP213(); // POS P2.13 (คีย์ API ของรอบ)
  if (P213.log.length) console.error(`${P213.ok ? "🧹" : "⚠️"} P2.13: ${P213.log.join(" · ")}`);
  if (!P213.ok) failures++;
  if (P29U.log.length) console.error(`${P29U.ok ? "🧹" : "⚠️"} P2.9U: ${P29U.log.join(" · ")}`);
  if (!P29U.ok) failures++;
  await cleanupP21u(); // POS P2.1U (บิลพัก LINE MAN ที่ยังค้าง)
  if (P21U.cleanup) console.error(`${P21U.cleanup.ok ? "🧹" : "⚠️"} ${P21U.cleanup.detail}`);
  if (P21U.cleanup && !P21U.cleanup.ok) failures++;
  await cleanupHfP1(); // POS HF-P1CLOSE (บิลพักของ held-drawer ที่ยังค้าง)
  if (HFP1.cleanup) console.error(`${HFP1.cleanup.ok ? "🧹" : "⚠️"} ${HFP1.cleanup.detail}`);
  if (HFP1.cleanup && !HFP1.cleanup.ok) failures++;
  if (HFP1.printerRestore) console.error(`🧹 ${HFP1.printerRestore}`);
  for (const l of LOCK_SCROLL) console.log(`  O5 lock-screen-scroll: ${l}`);
  if (BILLS_SEARCHED.length) console.log(`  หน้าบิล: บิลเป้าหมายไม่อยู่หน้าแรก → ค้นเลขบิล (${BILLS_SEARCHED.join(" · ")})`);
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
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, at: new Date().toISOString(), deviceId: DEVICE_ID, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, intentState: INTENTS, counterLag: COUNTER_LAG, p115State: p115Summary(), taxInvoiceState: TAXINV, memberState: MEMBERX, p118uState: P118U, shots }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${removed}${stale ? ` (+ซากหมดอายุ ${stale})` : ""}${fixOut} · ลบโปรไฟล์ chromium ${PROFILE_DIRS[0]} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, shiftOpenError: SHIFT.openError, shiftClose: SHIFT.close, stockCount: STOCK, shiftsState: SHIFTS, billsState: BILLS, settingsState: SETTINGS, rpubState: RPUB, counterLag: COUNTER_LAG, p115State: p115Summary(), taxInvoiceState: TAXINV, memberState: MEMBERX, shots: shots.map(({ consoleErrors, httpErrors, ...s }) => ({ ...s, consoleErrors: consoleErrors.length, httpErrors: httpErrors.length })), failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
