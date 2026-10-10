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
// POS HF-P1CLOSE ▸ --list ไม่ต้องมี <wo> (ใช้ชื่อ "list" ผ่านด่านตรวจชื่อเดิม) ◂
const LIST = argv.includes("--list");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : LIST ? "list" : null;
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
type StateKey = "held-drawer" | "paydlg-promptpay-timeout" | "paydlg-platform" | "register-en" | "register-empty-catalogue" | "default" | "cart3" | "cart4-01" | "line-editor" | "bill-discount" | "custom-item" | "paydlg-cash" | "paydlg-promptpay-qr" | "paydlg-promptpay-paid" | "paydlg-card-edc" | "sale-done" | "search-empty" | "stock-warn" | "offline" | "mobile-sheet" | "options-popover" | "weigh" | "taxinvoice-dialog" | "taxinvoice-set" | MemberStateKey | P115StateKey | StockStateKey | ShiftsStateKey | BillsStateKey | SettingsStateKey | RpubStateKey | P22uProductsKey | P22uRegKey;
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
  { key: "register-line-badges", devices: ["desktop", "ipad", "mobile"], note: "บิลพัก LINE MAN (holdRegisterCart) ลาเต้ + อเมริกาโน่ → เรียกคืน → ป้ายบรรทัด: ชื่อโปร (RULE) + \"ราคาตามช่องทาง\" (CHANNEL)" },
];
/** POS P1.18U ▸ สถานะหน้าขายที่แคชเชียร์ QC ถ่ายไม่ได้ (เข้าสาขา fixture ไม่ได้ · ห้ามแก้ membership ของ seed) ◂ */
const OWNER_ONLY_STATES: ReadonlySet<string> = new Set(["register-empty-catalogue"]);
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
const productsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "products" || /^p2\.?2u/i.test(WO));
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
type Job = { page: PosPage; v: (typeof POS_VIEWPORTS)[number]; state: StateKey | null; file: string; path?: string; expect?: number };
// POS P1.18U ▸ fixture ของภาพ 19ก (ร้านไม่มีสินค้า) — path จริงรู้หลังหา/สร้างระบบ (emptyPath) ◂
// POS P1.18U ▸ แก้รอบ 1 F7: id สาขา/รหัสเครื่องผูก pid (`posqc-vis-empty-<pid>`) — รอบ th/en ที่รันพร้อมกันไม่ลบแถวของกันและกัน ·
//   ระบบ POS หาโดยลิงก์ของสาขารอบนี้ (ไม่หาด้วยชื่อ) · ซากรอบที่ถูก kill เกิน 1 ชม. ถูกกวาดตอนสร้าง ◂
const EMPTY_PREFIX = "posqc-vis-empty-";
const EMPTY_UNIT = { id: `${EMPTY_PREFIX}${process.pid}`, slug: `pos-qc-vis-empty-${process.pid}`, name: "สาขาแคตตาล็อกว่าง (ภาพ QC)" } as const;
const EMPTY_POS_NAME = "ขายหน้าร้าน · แคตตาล็อกว่าง (ภาพ QC)";
const EMPTY_DEVICE_ID = `${EMPTY_PREFIX}${process.pid}`;
const EMPTY_PATH_PLACEHOLDER = `/app/sys/<empty-pos>/pos/register?unit=${EMPTY_UNIT.id}`;
const viewports = LOCALE_EN ? POS_VIEWPORTS.filter((v) => v.name === "desktop") : [...POS_VIEWPORTS];
// สถานะหน้าสต็อกเฉพาะ --page stock หรือ wo p1.14* (รอบ p1.3/p1.2 --states ทุกหน้าเดิมไม่เปลี่ยน · ไม่เปิดรอบนับเพิ่ม)
const stockStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "stock" || /^p1\.14/i.test(WO));
// สถานะหน้ากะเฉพาะ --page shifts หรือ wo p1.9* (รอบ --states ทุกหน้าเดิมไม่เปิดกะ/ไม่ขายเพิ่ม)
const shiftsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "shifts" || /^p1\.9/i.test(WO));
// สถานะหน้าบิลวันนี้เฉพาะ --page sales หรือ wo p1.16* (รอบ --states ทุกหน้าเดิมไม่สร้างบิลเพิ่ม)
const billsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "sales" || /^p1\.16/i.test(WO));
// สถานะหน้าตั้งค่าเฉพาะ --page settings หรือ wo p1.10u* (รอบ --states ทุกหน้าเดิมไม่ลงทะเบียนเครื่อง/ไม่ขายเพิ่ม)
const settingsStatesOn = STATES_ON && tenantKey === "coffee" && (onlyPage === "settings" || /^p1\.10u/i.test(WO) || /^p1\.?18u/i.test(WO));
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
const rpubOn = tenantKey === "coffee" && pages.includes("receipt-public");
const rpubPlan = RPUB_STATE_PLAN.filter((st) => STATES_ON || st.key === "rpub-paid");
const jobs: Job[] = pages.flatMap((p: PosPage): Job[] =>
  p === "receipt-public"
    ? rpubOn
      ? rpubPlan.flatMap((st): Job[] =>
          (st.key === "rpub-issue-sent" ? [RPUB_VIEWPORT] : [...POS_VIEWPORTS]).map((v): Job => ({ page: p, v, state: st.key, expect: st.expect, path: `/r/${st.bill === "none" ? RPUB_MISSING_TOKEN : `<token:${st.bill}>`}${LOCALE_EN ? "?lang=en" : ""}`, file: `${OUT}/${p}-${st.key.replace(/^rpub-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
        )
      : []
    : settingsStatesOn && p === "settings"
    ? SETTINGS_STATE_PLAN.filter((st) => !(userKey === "owner" ? CASHIER_ONLY_SETTINGS : OWNER_ONLY_SETTINGS).has(st.key)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: settingsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^settings-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : productsStatesOn && p === "products"
    ? P22U_PRODUCTS_PLAN.filter((st) => (userKey === "owner" ? st.key !== "products-readonly" : st.key === "products-readonly")).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, path: productsPath(st.key), file: `${OUT}/${p}-${st.key.replace(/^products-/, "")}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
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
    ? STATE_PLAN.filter((st) => userKey === "owner" || !OWNER_ONLY_STATES.has(st.key)).flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, ...(st.key === "register-empty-catalogue" ? { path: EMPTY_PATH_PLACEHOLDER } : {}), file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : viewports.map((v): Job => ({ page: p, v, state: null, file: LOCALE_EN ? fileOf(p, v.w, v.h).replace(/\.png$/, "-en.png") : fileOf(p, v.w, v.h) })),
);
const needFixtures = STATES_ON && tenantKey === "coffee" && jobs.some((j) => j.state && j.page === "register");
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
  console.log("receipt-public (--page receipt-public · ไม่ส่ง --states = rpub-paid):");
  for (const st of RPUB_STATE_PLAN) row(st.key, st.key === "rpub-issue-sent" ? "mobile" : POS_VIEWPORTS.map((v) => v.name), `คาด ${st.expect} · ${st.note}`);
  const ids = [STATE_PLAN, STOCK_STATE_PLAN, SHIFTS_STATE_PLAN, BILLS_STATE_PLAN, SETTINGS_STATE_PLAN, RPUB_STATE_PLAN].flatMap((pl) => pl.map((x) => x.key));
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
    if (pages.includes("register") && jobs.some((j) => j.state === "paydlg-platform"))
      console.log("  P2.1U: paydlg-platform พักบิล LINE MAN (holdRegisterCart + channelId) ใหม่ต่อภาพ → เรียกคืนผ่าน UI · ที่ค้างทิ้งใน finally (discardHeldCart)");
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
  if (isStockState(state)) return runStockState(page, state); // POS P1.14 U
  if (isShiftsState(state)) return runShiftsState(page, state); // POS P1.9 U
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
  // HF-VIS-SHIFTS ▸ + เจ้าของที่มีสถานะหน้ากะนอกจาก shifts-noshift (shiftsSale ขายผ่านหน้าขายของ SHIFTS_DEVICE_ID ⇒ ต้องมี PIN/โทเคน) ◂
  if (jobs.some((j) => j.page === "register" || isPaydoneState(j.state) || (userKey === "owner" && j.page === "shifts" && !!j.state && j.state !== "shifts-noshift"))) {
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
  if (billsStatesOn && pages.includes("sales")) {
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
    if (STATES_ON && jobs.some((j) => j.state && j.page === "register")) await openShiftAsOwner(browser, ownerCookies, { width: 1440, height: 900 });
    for (const job of jobs) {
      {
        const p = job.page;
        const v = job.v;
        const page = await browser.newPage();
        await pinDevice(
          page,
          job.state === "register-empty-catalogue" ? EMPTY_DEVICE_ID : p === "settings" && job.state ? SETTINGS_DEVICE_CODES[isPaydoneState(job.state) ? 1 : 0] : p === "shifts" && job.state ? SHIFTS_DEVICE_ID : p === "sales" && job.state ? BILLS_DEVICE_ID : DEVICE_ID,
        ); // P1.10 U: หน้าตั้งค่าใช้เครื่อง QC 1 (paydone-print = เครื่อง 2 ที่มีกะ) // P1.16 U: หน้าบิลใช้เครื่องของกะภาพบิล (การ์ดเงินสด "จากลิ้นชักกะ #N") // R3 V4: เครื่องเดียวกับที่เจ้าของเปิดกะให้ · P1.9 U: สถานะหน้ากะใช้เครื่องแยก
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.name !== "desktop" });
        // POS P1.15U ▸ หน้าขาย = โทเคนผู้ขายของเครื่องที่หน้านี้ใช้ (discount-over-sheet = แคชเชียร์ · เพดาน 10%) · ปลดล็อกแถว PIN ที่ lock-pin-locked ตั้งไว้ ◂
        if ((p === "register" || isPaydoneState(job.state)) && P115.seeded && job.state !== "register-empty-catalogue") {
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
        const resp = await page.goto(`${BASE}${p === "receipt-public" && job.state && isRpubState(job.state) ? rpubPath(job.state) : job.state === "register-empty-catalogue" ? emptyPath() : (job.path ?? pathOf(p))}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
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
        if (job.state === "register-en") await restoreThaiLocale(page); // POS P1.18U
        if (job.state && P22U_FIXTURE_STATES.has(job.state) && job === jobs.filter((j) => j.state && P22U_FIXTURE_STATES.has(j.state)).at(-1)) await cleanupP22u(); // POS P2.2U
        if (job.state === "register-empty-catalogue" && job === jobs.filter((j) => j.state === "register-empty-catalogue").at(-1)) await cleanupEmptyCatalogue(); // POS P1.18U
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
