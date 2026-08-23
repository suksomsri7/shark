# ยื่น SHARK HUB เข้า App Store — ขั้นตอนที่เหลือ (มือเจ้าของ)

> เขียน 22 ส.ค. 2026 · เขียนเป็นไฟล์เพราะรอบก่อนคำแนะนำอยู่ในหน้าแชทแล้วหายไปพร้อม session
> สถานะฝั่งที่ทำด้วยสคริปต์ได้ = ครบแล้ว (`python3 scripts/asc-listing.py show` ยืนยันได้ทุกช่อง)

---

## 1. บิลด์ #22 — ให้ชื่อใต้ไอคอนเป็น `SHARK HUB`

ทำไมต้องบิลด์ใหม่: ชื่อแอปมี **2 ที่** · ชื่อในสโตร์แก้ผ่าน API แล้ว ✅
แต่ชื่อใต้ไอคอนมาจาก `app.json expo.name` ซึ่งฝังอยู่ในตัวบิลด์ — build #21 ที่ผูกกับสโตร์อยู่ยังเป็นชื่อเก่า

```bash
cd /root/projects/shark-in-th/apps/mobile
EXPO_TOKEN=4CFWhe108LkmMUGZiN6DI6y7068LBZoULoaCNzOL \
  npx eas-cli build -p ios --profile production --non-interactive --no-wait
```

จากนั้น (บิลด์เสร็จ ~15-25 นาที รวมคิว):

```bash
# 1) ส่งขึ้น TestFlight (เข้ากลุ่มทดสอบเดิมอัตโนมัติ)
cd /root/projects/shark-in-th/apps/mobile
EXPO_TOKEN=4CFWhe108LkmMUGZiN6DI6y7068LBZoULoaCNzOL \
  npx eas-cli submit -p ios --latest --non-interactive

# 2) เลข build ถูก autoIncrement เขียนกลับลงไฟล์ → ต้อง commit ตาม
cd /root/projects/shark-in-th && git add apps/mobile/app.json && git commit -m "chore(mobile): build #22"

# 3) ผูก build ใหม่เข้าเวอร์ชัน 1.0.0 ในสโตร์ (สคริปต์เลือกเลขสูงสุดให้เอง)
python3 scripts/asc-listing.py apply
python3 scripts/asc-listing.py show     # ต้องเห็น "build ที่ผูก: 22"
```

⚠️ ข้อควรรู้
- โควตา EAS free ของ iOS **มีเพดานแยกที่ API ไม่โชว์** — รู้แน่ทางเดียวคือสั่งแล้วดูว่าถูกปฏิเสธไหม
  (ถ้าถูกปฏิเสธเพราะโควตา = ไม่กินโควตา ไม่เสียหาย)
- บิลด์ #22 จะได้ของที่แก้ 22 ส.ค. ติดไปด้วย: push ที่เคยพังเงียบ (projectId ค้างของบัญชีเก่า)
  และ logout ที่ถอนทะเบียนเครื่องแล้ว

---

## 2. App Privacy (แบบสอบถามในเว็บ ASC) — Apple ไม่เปิดให้ API ตอบ

### วิธีกดทีละขั้น (จอนี้กดยากกว่าที่คิด เพราะต้องกด "Publish" ท้ายสุด ไม่งั้นไม่นับ)
1. เปิด https://appstoreconnect.apple.com → **Apps** → **SHARK HUB**
2. แถบซ้ายมือ (ใต้ General) → **App Privacy** → ปุ่ม **Get Started** (ถ้าเคยเริ่มไว้แล้วจะเป็น **Edit**)
3. คำถามแรก **"Do you or your third-party partners collect data from this app?"** → เลือก
   **"Yes, we collect data from this app"** → **Next**
4. จอถัดมาเป็น **ตารางติ๊กประเภทข้อมูล** (Contact Info / Health / Financial / Location / …)
   ติ๊กเฉพาะ 7 ช่องที่มี ✅ ในตารางข้างล่าง แล้วกด **Save**
5. จากนั้น Apple จะถามซ้ำ **ทีละประเภทที่ติ๊กไว้** 3 คำถามเหมือนกันหมด — ตอบตามคอลัมน์ในตาราง:
   - *"How is this data used?"* → ติ๊ก **App Functionality** อย่างเดียว (ห้ามติ๊ก Analytics / Advertising)
   - *"Is this data linked to the user's identity?"* → **Yes**
   - *"Do you or your partners use this data for tracking?"* → **No**
6. กลับมาหน้ารวม ตรวจว่าไม่มีอะไรค้างเป็น "Not Started" → กดปุ่ม **Publish** มุมขวาบน
   🔴 **ถ้าไม่กด Publish จะยื่นไม่ผ่าน** — ASC จะยังฟ้องว่า App Privacy ไม่สมบูรณ์

**คำถามแรก: "Do you or your third-party partners collect data from this app?" → YES**

ตอบตามนี้ (ตรวจจากโค้ดจริง 22 ส.ค. — ไม่มี SDK โฆษณา/analytics/crash ในแอปเลย):

| หมวด | เก็บไหม | ใช้ทำอะไร | ผูกกับตัวตนผู้ใช้ | ใช้ติดตาม (Tracking) |
|---|---|---|---|---|
| Contact Info → Email Address | ✅ | App Functionality (อีเมล = รหัสประจำบัญชี · ส่ง OTP) | Yes | **No** |
| Contact Info → Name | ✅ | App Functionality (ชื่อที่แสดง) | Yes | **No** |
| Contact Info → Phone Number | ✅ | App Functionality (เบอร์ลูกค้าที่ร้านบันทึกไว้ในระบบจอง/สมาชิก) | Yes | **No** |
| User Content → Photos or Videos | ✅ | App Functionality (แนบรูปให้ผู้ช่วย AI ดู) | Yes | **No** |
| User Content → Other User Content | ✅ | App Functionality (ข้อมูลกิจการ: สินค้า นัดหมาย บิลขาย ข้อความแชท) | Yes | **No** |
| Identifiers → User ID | ✅ | App Functionality (บัญชีผู้ใช้) | Yes | **No** |
| Identifiers → Device ID | ✅ | App Functionality (push token เพื่อส่งแจ้งเตือน) | Yes | **No** |
| Financial Info / Payment Info | ❌ | — ระบบไม่รับบัตร ไม่เก็บเลขบัตร (เงินสด/โอน/PromptPay บันทึกมือ) | | |
| Location | ❌ | — แอปไม่ขอสิทธิ์ตำแหน่ง | | |
| Contacts (รายชื่อในเครื่อง) | ❌ | — ไม่ขอสิทธิ์ | | |
| Health / Sensitive Info | ❌ | — | | |
| Usage Data / Analytics / Advertising | ❌ | — ไม่มี SDK วิเคราะห์หรือโฆษณาในแอป | | |
| Diagnostics / Crash Data | ❌ | — ไม่มี SDK เก็บ crash | | |

**คำถามท้ายสุด "Tracking" → No** (ไม่มีการติดตามข้ามแอป/เว็บ → ไม่ต้องขึ้นป๊อปอัป ATT)

ทุกบรรทัดข้างบนตรงกับหน้า https://shark.in.th/privacy (อัปเดต 22 ส.ค. เพิ่มหัวข้อผู้ช่วย AI /
การแจ้งเตือน / สิ่งที่ไม่เก็บ) — ผู้ตรวจมักกดอ่านเทียบ

---

## 2.5 ช่องอื่นที่ ASC บังคับ — ✅ ตั้งครบแล้วด้วยสคริปต์ (22 ส.ค.)

`python3 scripts/asc-compliance.py show|apply` (ตรวจแล้วอ่านกลับมายืนยันทุกครั้ง)

| ช่อง | ค่าที่ตั้ง |
|---|---|
| **Age Rating** | ตอบครบ 24 ช่อง · เนื้อหาทั้งหมด NONE · **มีแชท = ใช่** (ร้าน↔ลูกค้า + ผู้ช่วย AI) · UGC = ไม่ · เข้าเว็บอิสระ = ไม่ → **Apple ให้เรต 4+** |
| **ราคา** | **ฟรี** (price point 0 · สกุลฐาน USD) |
| **ประเทศที่วางขาย** | **175 ประเทศ** + รับประเทศใหม่อัตโนมัติ |
| **Content Rights** | ไม่มีเนื้อหาของบุคคลที่สาม (`DOES_NOT_USE_THIRD_PARTY_CONTENT`) |

เหตุผลที่ตอบ **"ไม่มีเนื้อหาของบุคคลที่สาม"**: ทุกอย่างที่แอปแสดงคือข้อมูลที่ร้านบันทึกเองกับของที่เราเขียนเอง
ไม่มีเพลง/หนัง/ภาพ/ข่าว/แบรนด์ของคนอื่นในแอป (ฟอนต์ IBM Plex เป็นโอเพนซอร์ส ไม่นับ)

## 3. ก่อนกด Submit (ทำวันเดียวกับที่กด)

```bash
cd /root/projects/shark-in-th && pnpm exec tsx scripts/seed-review-shop.mts
```
นัดหมาย/บิลขายในร้านผู้ตรวจเป็น **วันที่สัมพัทธ์** — ถ้าไม่รันซ้ำ ผู้ตรวจจะเปิดเจอปฏิทินว่างและยอดขายวันนี้ ฿0
(22 ส.ค. แก้กุญแจกันซ้ำของบิลให้มีวันที่แล้ว → รันซ้ำวันไหนก็ได้บิลของวันนั้นจริง)

ข้อมูลที่ต้องใส่ในช่อง App Review (ใส่ไว้แล้ว — แค่ตรวจว่ายังอยู่):
- บัญชีผู้ตรวจ `appreview@shark.in.th` + รหัส OTP คงที่ (แจ้งเจ้าของแยก)
- 🔴 **หลังแอปผ่าน review ให้ลบ env `REVIEW_EMAIL` / `REVIEW_OTP` บน Vercel ทิ้ง**

## 4. เช็คลิสต์สุดท้าย
- [x] build #22 บิลด์เสร็จ + ส่งขึ้น App Store Connect แล้ว (22 ส.ค.) · Apple ประมวลผลแล้ว = **VALID**
- [x] Age Rating (4+) · ราคาฟรี · 175 ประเทศ · Content Rights
- [x] ผูก build **22** เข้าเวอร์ชัน 1.0.0 แล้ว (ยืนยันด้วย `asc-listing.py show`)
- [x] TestFlight: กลุ่ม "ทีมเทส SHARK" (internal · รับทุกบิลด์อัตโนมัติ · suksomsri@gmail.com) → **โหลดได้เลย**
- [ ] เปิดแอปบนเครื่องจริงจาก TestFlight เห็นชื่อใต้ไอคอนเป็น **SHARK HUB** + ลอง login ด้วยบัญชีผู้ตรวจ (พิสูจน์ว่ารหัส OTP คงที่ยังใช้ได้)
- [x] **App Privacy ตอบครบ + กด Publish แล้ว** (23 ส.ค. · 7 ประเภทข้อมูล · App Functionality/Linked=Yes/Tracking=No)
- [x] รัน `seed-review-shop.mts` แล้ว 23 ส.ค. (บิล 4 ใบ ฿2,140 · นัดที่ยังไม่ถึง 5 รายการ) — **ถ้ายื่นวันอื่นให้รันใหม่**
- [ ] กด **Add for Review → Submit**
