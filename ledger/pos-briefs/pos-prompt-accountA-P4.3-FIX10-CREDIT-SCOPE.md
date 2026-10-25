# บรีฟ builder · P4.3 fix10 (CD-P43-17) — บัญชีเครดิต: หน้าตั้งค่าต้องตัดสินขอบเขตสาขาเหมือนเซิร์ฟเวอร์

ผู้คุม A · 25 ต.ค. 2026 · ทรี b (`/root/projects/shark-pos-b`) · แยก branch `wip/pos-p4.3-fix10` จาก session/pos tip ล่าสุด (merge fix9 63116bb2 หรือใหม่กว่า)

## อาการ (รอบสำรวจ CD-P43-14 · ช่อง 6 manager-desktop)
`settings?tab=payments` ผู้จัดการสาขาเดียว (fixture posqc-btn-mb-manager · unitAccess = [posqc-btn-unit]) เห็นปุ่ม `pos-settings-credit-edit-*` / `pos-settings-credit-add` → เปิดฟอร์ม กรอก กด `pos-settings-credit-save` → เซิร์ฟเวอร์ปฏิเสธ `pos-settings-credit-error` "บัญชีนี้ยังไม่มีสิทธิ์ตั้งวงเงินลูกค้าเครดิต". เจ้าของทุกช่องผ่าน.

## สาเหตุ
- `src/lib/modules/pos/credit.ts:90-93` (**มติ CD-P52-O4 F5 / P5.2 H6b**): บัญชีเครดิตใช้ทั้งระบบ ⇒ save ได้เฉพาะ OWNER หรือ MANAGER ที่ `unitAccess` มี `"*"` ตรงตัว · ผู้จัดการสาขาเดียว = PERMISSION_DENIED.
- `src/app/app/sys/[id]/pos/settings/page.tsx:149` ตัดสิน `canManageCredit = evaluate(m, pos.credit.manage)` อย่างเดียว (จริงสำหรับผู้จัดการทุกคน) → `CreditSettingsCard` แสดงปุ่มแก้/เพิ่ม/ฟอร์ม ทั้งที่เซิร์ฟเวอร์จะปฏิเสธ = UI ไม่ตรงด่านเซิร์ฟเวอร์ (listCreditAccounts ยังอนุญาตให้อ่าน — ถูกแล้ว).

## สิ่งที่ต้องทำ (ห้ามแตะเซิร์ฟเวอร์ · ห้ามเปลี่ยนมติ F5)
1. `credit.ts`: export helper เดียว `canEditCreditAccounts(actor)` = `canManageCredit(actor) && (OWNER || MANAGER && unitAccess.includes("*"))` · ให้ `saveCreditAccount` ใช้ helper นี้แทนเงื่อนไขซ้ำบรรทัด 90–93 (พฤติกรรมเท่าเดิมทุกกรณี — เพิ่มเทสต์ self-check ถ้ามีชุดเดิม).
2. `settings/page.tsx`: ส่ง `canEdit` (จาก helper · ผ่าน actor รูป RegisterActor เหมือน listCreditAccounts) เข้าการ์ด แยกจาก `canManage` (อ่าน).
3. `CreditSettingsCard.tsx`: เมื่อ `canManage && !canEdit` → แสดงรายการบัญชี **อ่านอย่างเดียว** (ไม่มี `pos-settings-credit-edit-*` / `-add` / ฟอร์ม) + ข้อความใหม่ `settings.credit.allBranchesOnly` (th: "ผู้จัดการต้องเข้าได้ทุกสาขาจึงตั้งวงเงิน/เทอมได้ — คุณเห็นแบบอ่านอย่างเดียว" · en: "Only the owner or a manager with access to all branches can set credit limits — read-only for you") ใน `src/messages/{th,en}/pos.json` ใต้ settings.credit · testid ใหม่ `pos-settings-credit-all-branches-only` (kind notice) — **แจ้งผู้คุมเพื่อลงทะเบียน** (ผู้คุมแก้ `scripts/pos-ui-inventory.json` เอง · builder ห้ามแตะทะเบียน/ข้อสอบ).
4. ไม่เปลี่ยน testid เดิม · ไม่เปลี่ยน i18n เดิม · ไม่แตะ `*actions*.ts` ถ้าไม่จำเป็น (ถ้าแตะ → รัน qc-pos-p1.6 ด้วย).
5. พิสูจน์แบบ static: วิเคราะห์ 4 กรณี (OWNER · MANAGER "*" · MANAGER สาขาเดียว · STAFF ไม่มีสิทธิ์) ว่าหน้าและ save ตัดสินตรงกันทุกกรณี · เขียนตาราง.
6. รัน (ทรี b · iso.sh · GATE_LOCK_FILE=/tmp/shark-gate-pos.lock · ห้าม build/serve · ห้าม cd · ห้าม export CI): qc-pos-p5.2 · qc-pos-p3.6 · qc-pos-p2.14 · qc-pos-p1.13 · qc-pos-p1.15 · qc-pos-p4.1 --no-db · fitness · matrix --check · strict tsc (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` รอ free ≥ 9000 MB).
7. บันทึก `ledger/wo-notes/pos-P4.3-fix10.md` · commit `fix(pos): P4.3 fix10 (CD-P43-17) — credit accounts read-only for single-branch manager (page gate = server rule F5)` · ไม่ merge · ไม่ push · ⛔ main · รายงาน SHA + ผลชุด + testid ใหม่.
