# ยื่น SHARK HUB ขึ้น Google Play — ขั้นตอนและคำตอบทุกช่อง

> เขียน 24 ส.ค. 2026 หลังยื่น iOS เสร็จ · เจ้าของเคาะแล้ว: **บัญชี Play เป็นแบบบริษัท (organization)**
> → **ไม่ต้องทำ closed testing 12 คน 14 วัน** (ข้อบังคับนั้นใช้กับบัญชีบุคคลธรรมดาที่เปิดหลัง พ.ย. 2023)

## สถานะฝั่งโค้ด (24 ส.ค.)
- `android.package` = `th.in.shark.ai` (เดียวกับ iOS) · `versionCode` = 1 · adaptive icon ครบ
- โปรไฟล์บิลด์: `preview` = APK ลงเครื่องเทสตรง · `production` = AAB สำหรับ Play (`app-bundle`)
- keystore ออกโดย EAS เก็บบนเซิร์ฟเวอร์ Expo (สร้างอัตโนมัติรอบแรก 24 ส.ค.)
- ปุ่ม Apple ถูกซ่อนบน Android แล้ว (บน Android ใช้ไม่ได้อยู่แล้ว)

---

## 🔴 1. Google Sign-In บน Android ต้องลงทะเบียน SHA-1 ก่อนถึงใช้ได้
บน iOS ใช้ `iosClientId` ได้เลย แต่ Android ต้องผูก **package + ลายนิ้วมือ SHA-1 ของคีย์ที่เซ็นแอป**
เข้ากับ OAuth client ใน Google Cloud (โปรเจกต์เดียวกับที่ออก client ของ iOS/web)

ต้องลงทะเบียน **2 ตัว** เพราะแอปถูกเซ็น 2 ชั้น:
| คีย์ | ใช้ตอนไหน | หา SHA-1 ได้จาก |
|---|---|---|
| **upload key ของ EAS** | APK/AAB ที่เราบิลด์เอง (เทสเครื่อง · internal testing) | **`D9:3A:A1:B0:7E:1A:DB:9E:A3:D7:B6:7F:C9:A7:1A:8C:11:5E:8D:53`** (ดึง 24 ส.ค. ยืนยันด้วย openssl) |
| **Play App Signing key** | แอปที่ผู้ใช้โหลดจาก Play จริง (Google เซ็นทับให้) | Play Console → **Test and release → App integrity → App signing** |

วิธีเพิ่ม (มือเจ้าของ): console.cloud.google.com → เลือกโปรเจกต์เดิม → **APIs & Services → Credentials**
→ **Create Credentials → OAuth client ID** → Application type **Android**
→ Package name `th.in.shark.ai` + วาง SHA-1 → Create · ทำซ้ำอีกใบสำหรับ SHA-1 อีกตัว

⚠️ ระหว่างที่ยังไม่ทำ: **เข้าสู่ระบบด้วยอีเมล OTP ใช้ได้ปกติ** แค่ปุ่ม Google จะยังไม่ทำงานบน Android

---

## 2. สร้างแอปใน Play Console
Play Console → **Create app**
- App name: **SHARK HUB** · ภาษาเริ่มต้น: ไทย (แอปตลาดไทย) · ประเภท: **App** · **Free**
- ติ๊กรับรอง developer program policies + US export laws

## 3. Data Safety (เทียบเท่า App Privacy ของ Apple)
ตอบชุดเดียวกับที่ยื่น Apple ไปแล้ว — ทุกอย่าง **เก็บ (collected) ไม่ใช่แชร์ (shared)** · เข้ารหัสระหว่างส่ง · ลบบัญชีได้

| ประเภทข้อมูล | เก็บ | จำเป็นต่อการใช้งาน | วัตถุประสงค์ |
|---|---|---|---|
| Personal info → Email address | ✅ | Required | App functionality (อีเมล = รหัสประจำบัญชี · ส่ง OTP) |
| Personal info → Name | ✅ | Optional | App functionality |
| Personal info → Phone number | ✅ | Optional | App functionality (เบอร์ลูกค้าที่ร้านบันทึก) |
| Photos and videos → Photos | ✅ | Optional | App functionality (แนบรูปให้ผู้ช่วย AI) |
| App activity → Other user-generated content | ✅ | Required | App functionality (ข้อมูลกิจการ/ข้อความแชท) |
| Device or other IDs | ✅ | Optional | App functionality (push token) |
| Location / Financial info / Health / Contacts / Calendar / Messages(SMS) | ❌ | | ไม่เก็บ |
| App activity → App interactions (analytics) | ❌ | | ไม่มี SDK วิเคราะห์ |
| Crash logs / Diagnostics | ❌ | | ไม่มี SDK เก็บ crash |

คำถามอื่นในหน้านี้:
- **Is all of the user data collected by your app encrypted in transit?** → **Yes** (HTTPS ทั้งหมด)
- **Do you provide a way for users to request that their data is deleted?** → **Yes**
  · URL: `https://shark.in.th/account-deletion` (หน้าเดียวกับที่ Apple/Meta ใช้)
- **Is your app's data shared with third parties?** → **No**
  (ผู้ช่วย AI ส่งข้อความไปประมวลผลที่ OpenRouter ในฐานะ *ผู้ประมวลผลแทนเรา* ไม่ใช่การแชร์ให้บุคคลที่สามใช้เอง —
  ระบุไว้ในหน้า privacy แล้ว)

## 4. Content rating (แบบสอบถาม IARC)
หมวด: **Utility / Productivity / Communication** · ตอบ "ไม่มี" ทุกข้อเรื่องความรุนแรง/เพศ/ยา/พนัน
- มีการสื่อสารระหว่างผู้ใช้ไหม → **มี** (แชทร้าน↔ลูกค้า + ผู้ช่วย AI) — ตรงกับที่ตอบ Apple
- มีการแชร์ตำแหน่ง / ซื้อของในแอป → **ไม่มี**
→ ผลที่ควรได้ = เรตต่ำสุด (ทุกวัย / PEGI 3 / ESRB Everyone)

## 5. App content (ช่องบังคับอื่น)
- **Privacy policy**: `https://shark.in.th/privacy`
- **App access**: เลือก **"All or some functionality is restricted"** → ให้บัญชีทดสอบ
  · `appreview@shark.in.th` + รหัส OTP คงที่ (ตัวเดียวกับที่ให้ Apple) + คำอธิบายว่าใส่อีเมลนี้แล้วกรอกรหัสนี้
- **Ads**: **ไม่มีโฆษณา**
- **Target audience**: อายุ **18+** (แอปสำหรับเจ้าของกิจการ) · ไม่ดึงดูดเด็ก
- **News app / COVID / Financial features**: ไม่ใช่ทั้งหมด
  (POS บันทึกยอดขายเอง ไม่ใช่แอปการเงิน ไม่รับชำระเงินในแอป)
- **Government app**: ไม่ใช่
- **Data deletion**: `https://shark.in.th/account-deletion`

## 6. Store listing (ไทยเป็นภาษาหลัก · เพิ่มอังกฤษทีหลังได้)
- ชื่อ: **SHARK HUB** (≤30 ตัวอักษร)
- คำอธิบายสั้น (≤80): ใช้ subtitle ภาษาไทยที่ยื่น Apple — *"จัดการร้านครบในแอปเดียว"* แล้วขยายให้เต็ม 80
- คำอธิบายเต็ม (≤4000): ใช้ก้อนเดียวกับ App Store ภาษาไทย (`scripts/asc-listing.py` ตัวแปร `COPY["th"]["description"]`)
- กราฟิกที่ Play บังคับ:
  · ไอคอน **512×512** PNG · **Feature graphic 1024×500** (Play บังคับ · App Store ไม่มี → **ต้องทำใหม่**)
  · ภาพหน้าจอโทรศัพท์ **อย่างน้อย 2 รูป** (รูปที่ถ่ายไว้ให้ App Store 1290×2796 ใช้ได้เลย)

## 7. ปล่อย
Test and release → **Production** → Create new release → อัป AAB → กรอก release notes → **Send for review**
(ถ้าอยากลองวงในก่อน: **Internal testing** ปล่อยได้ทันทีไม่ต้องรอ review)

```bash
# บิลด์ AAB สำหรับ Play
cd /root/projects/shark-in-th/apps/mobile
EXPO_TOKEN=<ดู reference_expo_token_shark> \
  npx eas-cli build -p android --profile production --non-interactive --no-wait
# เลข versionCode ถูก autoIncrement เขียนกลับ app.json → ต้อง commit ตาม
```

### เครื่องมือ: ดู SHA-1 ของ APK
```bash
python3 scripts/android-sha1.py /path/to/app.apk
```
เขียนเองเพราะเครื่องนี้ไม่มี JDK (`keytool`) และ APK ที่ EAS บิลด์ **เซ็นแบบ v2 อย่างเดียว**
→ ไม่มี `META-INF/*.RSA` ให้ดึงด้วย openssl · สคริปต์อ่านใบรับรองจาก APK Signing Block ตรง ๆ
🔴 มีด่านกันตอบผิดแบบเงียบในตัว (รอบแรกอ่านผิดไปหนึ่งชั้น ได้ hash ที่ดูดีแต่ไม่ใช่ใบรับรอง —
ถ้าเอาไปลงทะเบียนจริงจะ login ไม่ติดโดยไม่มีใครรู้สาเหตุ)

## เช็คลิสต์
- [x] versionCode + ซ่อนปุ่ม Apple บน Android (24 ส.ค.)
- [x] บิลด์ APK แล้ว 24 ส.ค. (โปรไฟล์ `preview` · EAS สร้าง keystore ให้ · SHA-256 ของคีย์
      `FA:1E:D6:C2:7C:4D:46:BB:36:E3:8D:6A:51:22:5A:62:8F:CE:48:1D:D7:8C:D9:AA:D1:93:38:5C:7B:42:53:41`)
- [ ] APK เทสบนเครื่องจริง — ดูว่าจอไหนเพี้ยนบ้าง
- [ ] เพิ่ม Android OAuth client (SHA-1) ใน Google Cloud → ปุ่ม Google ถึงจะใช้ได้
- [ ] สร้างแอปใน Play Console + Data Safety + Content rating + App content
- [ ] Feature graphic 1024×500
- [ ] บิลด์ AAB (`production`) → อัป → Send for review
