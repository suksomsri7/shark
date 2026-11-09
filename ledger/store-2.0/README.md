# store-2.0 — ภาพ + ข้อความสโตร์ SHARK HUB 2.0 (ใบ S3b.2)

> 9 พ.ย. 2569 · **ยังไม่ส่งอะไรเข้า App Store Connect** · เจ้าของตรวจ/อนุมัติก่อน แล้วค่อยอัปตอน S3b.3

## มีอะไรบ้าง
| ไฟล์ | คืออะไร |
|---|---|
| `shots/contact-sheet-th.png` · `shots/contact-sheet-en.png` | **ดูตรงนี้ก่อน** — ภาพทุกใบของแต่ละภาษาในแผ่นเดียว (แถว = ขนาดจอ) |
| `shots/<th\|en>/iphone69/NN-*.png` | iPhone 6.9"/6.7" — **1290×2796** (ชุดเดียวกับ 1.0 · ASC ช่อง `APP_IPHONE_67`) |
| `shots/<th\|en>/iphone65/NN-*.png` | iPhone 6.5" — **1242×2688** (ไม่บังคับเมื่อมีชุด 6.9" แล้ว · ทำไว้เผื่อ) |
| `shots/<th\|en>/ipad13/NN-*.png` | iPad 13"/12.9" — **2048×2732** (**บังคับ** เพราะ `supportsTablet: true` ตั้งแต่ build #24) |
| `listing-2.0.json` | ร่าง subtitle · keywords · promotional text · description · What's New (ไทย/อังกฤษ) — ผลจาก `make-listing.py` |
| `PRIVACY-LABELS.md` | สิ่งที่ต้องติ๊กใน App Privacy ของ 2.0 เทียบ 1.0 + คำถามค้าง |
| `fixtures/<th\|en>/*.json` | ข้อมูลจำลองที่ใช้ถ่าย (สร้างจาก fixture QC ของเลขา · ไม่มีข้อมูลจริง) |
| `make-fixtures.py` · `shoot.sh` · `finalize.py` · `make-listing.py` | สคริปต์สร้างใหม่ |

ภาพละ 7 ใบต่อภาษาต่อขนาด (รวม 42 ใบ) เรียงตามลำดับในสโตร์:
`01-approve-in-chat` (ห้องงาน: แชทกับ Shark + การ์ดขออนุมัติ) · `02-tasks` (หน้าหลักงานที่สั่ง) · `03-approvals` (รออนุมัติรวมทุกกิจการ) ·
`04-scheduled` (งานประจำ) · `05-customer-chat-translate` (แชทลูกค้า + แปล + Shark ร่างคำตอบ) · `06-team` (พนักงาน/สิทธิ์) · `07-settings`

## ทำอย่างไร (ไม่แตะ prod · ไม่มี credential)
ชุด 1.0 (`scripts/shot-appstore.mjs`) ถ่ายหน้าเว็บบน prod ด้วยบัญชีผู้ตรวจ — ใช้กับ 2.0 ไม่ได้ เพราะจอเลขาเป็นจอ native ของแอป (เว็บไม่มีห้องเลขา)
และใบงานห้ามแตะ prod → ใช้ท่อ QC ของจอเลขาที่มีอยู่แล้ว `apps/mobile/qc/shoot-sec.mjs`
(`expo export --platform web` ของโค้ดแอปจริง + API mock จาก fixture) โดยเพิ่มแค่ตัวแปรขนาดจอ `QC_VIEW_W/H/SCALE/TAG`
(ไม่ตั้ง = 390×844@2 เหมือนเดิม) · ขนาดภาพตามสเปกของ `scripts/asc-screenshots.py` (1290×2796) + iPad + 6.5"

```bash
# จากรากรีโป (export + chromium = งานหนัก → iso.sh) · ราว 5 นาที
ISO_MEM=6G bash scripts/iso.sh bash ledger/store-2.0/shoot.sh                 # export ใหม่ แล้วถ่ายทั้งหมด → /root/qc-shots/store-2.0/raw
python3 ledger/store-2.0/finalize.py                                          # ตั้งชื่อ · ตรวจขนาด/ok/unmocked · EN ห้ามมีอักษรไทย · ห้ามมีคำ QC · contact sheet
python3 ledger/store-2.0/make-listing.py                                      # ตรวจความยาว + เขียน listing-2.0.json
```
- แก้ข้อความในภาพ = แก้ตาราง `TH`/`EN` ใน `make-fixtures.py` แล้วรันใหม่ (สคริปต์ฟ้องถ้ายังมีภาษาไทยเหลือใน fixture อังกฤษ)
- ภาษาในภาพ: จอเลขาเลือกภาษาตาม `languages[0]` ของเลขา (`/api/mobile/secretary/me`) — fixture อังกฤษตั้งเป็น `en`
- ตอน S3b.3: `ASC_COPY_FILE=ledger/store-2.0/listing-2.0.json python3 scripts/asc-listing.py apply` (asc-listing.py อ่านไฟล์นี้ได้แล้ว + ส่ง whatsNew ถ้ามี)
  · `asc-screenshots.py` ยังอัปไฟล์ชุดเดียวจาก `/tmp/appstore-shots` ให้ทุกภาษา และรู้จักแค่ `APP_IPHONE_67` → ต้องเพิ่มโฟลเดอร์รายภาษา + ช่อง iPad (`APP_IPAD_PRO_3GEN_129`) ก่อนอัป (ยังไม่ได้แก้ในใบนี้ — ใบนี้ไม่แตะโค้ดที่ยิง Apple)

## ตรวจแล้ว
- ทุกใบ: ขนาดตรง · `ok` (ไม่มี error/overflow/testID หาย) · `unmocked: []` · ไม่มีคำ "QC" บนจอ · บันทึกเป็น RGB (Apple ไม่รับ alpha)
- เปิดดูด้วยตาทุกภาษา/ขนาด: ไม่มีเลย์เอาต์พัง · ไม่มี placeholder · ชื่อลูกค้า/ร้านเป็นข้อมูลสมมติ (The Bean Café · คุณสมชาย ร้านดอยช้าง · Emily Carter · เบอร์ถูกปิด 081-xxx-4521)
- ภาพอังกฤษไม่มีภาษาไทยบนจอ (ข้อความไทยที่เหลือใน DOM คือเมนูลิ้นชักของเปลือก 1.0 ที่ปิดอยู่ ไม่เห็นในภาพ)
- ภาพไทยใบ 05 มีภาษาอังกฤษ/ญี่ปุ่น**โดยตั้งใจ** — เป็นข้อความของลูกค้าต่างชาติ เพื่อโชว์ปุ่มแปล/คำแปลไทย/ร่างคำตอบภาษาลูกค้า

## คำถามค้าง (เจ้าของตัดสิน)
1. **SMS (สำคัญสุด)** — production ยังไม่มีเกตเวย์ SMS: สมัคร/เข้าระบบด้วยเบอร์ใช้ได้เฉพาะเบอร์ทดสอบ (`SMS_TEST_LOGINS`) และ**เชิญพนักงานด้วยเบอร์ถูกบล็อก** (`sms_unavailable` ใน `src/lib/staff/invite.ts`)
   → ร่างข้อความหลัก**ไม่สัญญา** SMS/เชิญด้วยเบอร์ · ข้อความสำรองเมื่อเปิดเกตเวย์แล้วอยู่ใน `listing-2.0.json → optionalSms`
   → `apps/mobile/RELEASE-NOTES-2.0.md` ยังเขียน "SMS sign-in" + "Invite staff by phone" — ต้องเลือก: เปิดเกตเวย์ก่อนยื่น หรือใช้ What's New ฉบับไม่มี SMS (ใน listing-2.0.json)
   → ภาพ `06-team` มีปุ่ม "เพิ่มพนักงาน" ซึ่งบน prod ตอนนี้จะขึ้น "ยังส่ง SMS ไม่ได้" — ถ้าไม่เปิดเกตเวย์ เสนอตัดภาพนี้ออก (เหลือ 6 ใบ) เพื่อเลี่ยง Guideline 2.3
2. **iPad** — ต้องมีภาพ iPad เพราะ `supportsTablet: true` · ภาพ iPad คือเลย์เอาต์จริงของแอป: จอเลขาขยายเต็มความกว้าง (ไม่ได้จัดคอลัมน์กลางจอ ≤720 แบบจอ 1.0) ดูโล่ง/ตัวเล็ก — รับได้ไหม หรือจะทำเลย์เอาต์ iPad ก่อน (= build ใหม่)
3. **ข้อความอังกฤษในแอป** (เห็นในภาพ EN · ไม่ได้แก้ในใบนี้): พหูพจน์ผิด "1 items wait for your approval" · "1 logged actions" · "1 units" (`src/i18n/en.ts`) · เมนูลิ้นชักของเปลือก 1.0 เป็นไทยล้วนแม้ตั้งอังกฤษ · บรรทัดลายเซ็น "(added in Thai)" — แก้ก่อนยื่นแล้วถ่ายใหม่ไหม (แก้ en.ts = OTA/build ใหม่)
4. **What's New** — Apple ไม่รับช่องนี้ในเวอร์ชันแรกที่ขึ้นสโตร์ · ถ้า 1.0 ยังไม่เคยขึ้นสโตร์จริง ให้ลบ `whatsNew` ออกจาก listing-2.0.json ก่อน apply
5. **Subtitle/keywords ใหม่** — EN "AI secretary for your shop" · TH "เลขา AI + ระบบร้านในแอปเดียว" (เดิม "Run your whole shop in one app" / "จัดการร้านครบในแอปเดียว") — โอเคไหม
6. **Review Notes** ใน `scripts/asc-listing.py` ยังเป็นของ 1.0 (บอกว่าจอ native มีแค่ sign-in/แชท AI/ตั้งค่า) — ต้องเขียนใหม่สำหรับ 2.0 (ห้องเลขา · แชทลูกค้า · AI ใช้ Anthropic · จะให้ผู้ตรวจลองเข้าด้วยเบอร์ทดสอบไหม) — ทำใน S3b.3
7. ภาพ 6.5" (iphone65) อัปด้วยไหม — ไม่บังคับเมื่อมี 6.9" แล้ว
8. App Privacy — ดูคำถาม Q-P1…Q-P5 ใน `PRIVACY-LABELS.md`
