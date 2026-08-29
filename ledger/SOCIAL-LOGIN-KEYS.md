# SHARK — Social Login: สถานะและสิ่งที่ยังขาด

📖 **คู่มือขั้นตอนขอกุญแจแบบละเอียด (Google/Apple/LINE/Facebook) อยู่ที่ `/root/docs/SOCIAL-LOGIN-KEYS.md`**
อ่านไฟล์นั้นก่อนลงมือ — มีกับดักที่เจอมาจริงทั้งหมด

บันทึก 28 ส.ค. 2026 จากงานที่ทำเสร็จบน siamdive-maps

---

## สถานะจริงของ SHARK (ตรวจจาก `.env` แล้ว ไม่ใช่เดา)

```
✅ GOOGLE_WEB_CLIENT_ID / GOOGLE_WEB_CLIENT_SECRET
✅ GOOGLE_IOS_CLIENT_ID
✅ LINE_CHANNEL_ID / LINE_CHANNEL_SECRET
✅ FACEBOOK_APP_ID / FACEBOOK_APP_SECRET
❌ APPLE_*  — ไม่มีเลยสักตัว
```

**SHARK มีกุญแจ 3 เจ้าแล้ว ไม่ได้ว่างเปล่า** — ที่ขาดคือ Apple

---

## 🔴 เรื่องด่วน: Apple บังคับสำหรับแอป SHARK

แอป SHARK **มีปุ่ม Google login อยู่แล้ว** และกำลังยื่น App Store

**Apple Guideline 4.8** บังคับว่า แอปที่ใช้ social login เจ้าอื่น **ต้องมี Sign in with Apple ด้วย**
ไม่มี = โดนตีตกตอนรีวิว

ดู memory `project_shark_ai_app` (สถานะยื่นแอป) และ `reference_expo_token_shark`

**ต้องทำ:** ขอ Services ID + Key (.p8) ตามหัวข้อ **"2. Apple"** ในคู่มือหลัก
แอปเปิด flow ผ่านเบราว์เซอร์ (`openAuthSessionAsync`) ⇒ **ไม่ต้องบิลด์ใหม่**
(แต่ EAS build ต้องรอเจ้าของสั่งเสมอ — `feedback_no_eas_build_without_order`)

---

## กับดักที่ต้องเช็คกับของที่ SHARK มีอยู่แล้ว

**1. LINE — เช็คว่าตรวจ id_token แบบ HS256 หรือยัง**

LINE เซ็น id_token ของ web login ด้วย **HS256 + channel secret** ไม่ใช่ RS256/ES256
ถ้าโค้ดตรวจแต่มาตรฐาน OIDC → ปุ่ม LINE พัง 100% และชุดทดสอบทั่วไปจับไม่ได้
รายละเอียด + โค้ดที่แก้แล้วอยู่ในคู่มือหลัก หัวข้อ 3

**2. LINE channel ที่ใช้ต้องเป็น LINE Login ไม่ใช่ Messaging API**
ดู memory `reference_coach_social_login` — เคยพลาดข้อนี้มาแล้วที่ Coach

**3. Facebook — ถ้ายังไม่ผ่าน App Review สิทธิ์ `email` ใช้ได้เฉพาะแอดมิน**
ทดสอบด้วยบัญชีที่ไม่ใช่แอดมินของแอปเพื่อดูว่าคนทั่วไปเจออะไร

**4. Google ต้องกด Publish** ที่ OAuth consent screen ไม่งั้นเข้าได้เฉพาะ test users

---

## ก่อนบอกว่าเสร็จ

ใช้เช็คลิสต์หัวข้อ 6 ในคู่มือหลัก — ข้อสำคัญที่สุดคือ
**ตรวจในฐานข้อมูลว่าอีเมลเดียวกันจากคนละ provider = บัญชีเดียวกัน**
ไม่ใช่แตกเป็นบัญชีใหม่แล้วข้อมูลเดิมหาย
