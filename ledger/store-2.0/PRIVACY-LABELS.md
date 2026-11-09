# App Privacy (nutrition labels) — SHARK HUB 2.0 · checklist ใบ S3b.2

> 9 พ.ย. 2569 · ยังไม่กดอะไรใน ASC · เจ้าของตรวจแล้วกดเองตอน S3b.3 (Apple ไม่เปิด API ให้ตอบแบบสอบถามนี้ — กดในเว็บเท่านั้น)
> ฐานเทียบ: คำตอบ 1.0 ใน `ledger/SUBMIT-STEPS.md` ข้อ 2 (ตอบ+Publish 23 ส.ค.) · หน้า https://shark.in.th/privacy (อัปเดต 8 พ.ย.)
> · โค้ด: `apps/mobile/package.json` · `apps/mobile/app.json` · `src/lib/core/phone-auth.ts` · `src/lib/staff/invite.ts` ·
> `src/lib/ai/secretary/learn.ts` · `prisma/schema/ai.prisma` (`AiTrainingSample`) · `prisma/schema/core.prisma` (`UserPhone`)

🔴 **App Privacy เป็นของ "แอป" ไม่ใช่ของ "เวอร์ชัน"** — กด Publish แล้วหน้าสโตร์ของ 1.0 ที่ขึ้นอยู่เปลี่ยนตามทันที
→ กดวันเดียวกับที่ยื่น 2.0 (ประกาศเกินจริงไม่ผิดกติกา · ประกาศขาดผิด)

## ตรวจโค้ดแอปแล้ว (9 พ.ย.) — ยังไม่มี SDK เก็บข้อมูลเพิ่ม
- dependencies ของแอปไม่มี SDK analytics / crash / โฆษณา (มีเฉพาะ expo-*, google-signin, apple-authentication, webview)
- สิทธิ์เครื่องที่ขอ: รูปภาพ (`expo-image-picker` · photosPermission) · แจ้งเตือน (`expo-notifications`) — **ไม่ขอ**ไมค์ กล้อง ตำแหน่ง รายชื่อในเครื่อง
- ⇒ Tracking = **No** เหมือนเดิม (ไม่ต้องขึ้น ATT)

## ตาราง 2.0 เทียบ 1.0

ทุกแถว: Tracking = **No** · ผูกกับตัวตน (Linked) = **Yes** เว้นแต่ระบุ

| หมวด ASC | 1.0 | 2.0 | ใช้ทำอะไร (Purpose ใน ASC) | เปลี่ยนอะไร / เหตุผล |
|---|---|---|---|---|
| Contact Info → Email Address | ✅ | ✅ | App Functionality | เหมือนเดิม (รหัสบัญชี · OTP อีเมล) |
| Contact Info → Name | ✅ | ✅ | App Functionality | เหมือนเดิม |
| Contact Info → **Phone Number** | ✅ | ✅ | App Functionality | **ความหมายกว้างขึ้น**: 1.0 = เบอร์ลูกค้าที่ร้านบันทึก · 2.0 เพิ่ม **เบอร์ของผู้ใช้เอง** (สมัคร/เข้าระบบด้วย OTP SMS · ตาราง `UserPhone`) + **เบอร์พนักงานที่ถูกเชิญ** (`staff/invite.ts`) · ช่องติ๊กเดิมพอ ไม่ต้องเพิ่มแถว แต่ต้องตรวจว่า Purpose ยังเป็น App Functionality |
| User Content → Photos or Videos | ✅ | ✅ | App Functionality | เพิ่มการใช้: รูปแนบในห้องงานเลขา · รูปแนบในแชทลูกค้า · ภาพหน้าจอตอนแจ้งปัญหา |
| User Content → Other User Content | ✅ | ✅ | App Functionality | **เนื้อหาเพิ่ม**: คำสั่งงาน/ข้อความในห้องงานเลขา (ส่งไปประมวลผลที่ Anthropic) · บทเรียน/กฎที่สอนเลขา |
| User Content → **Customer Support** | ❌ | **✅ ใหม่** | App Functionality | 2.0 มี "แจ้งปัญหาถึงทีม SHARK พร้อมแนบภาพ" ในแอป (`/secretary/help` · `support/cases`) |
| User Content → **Emails or Text Messages** | ❌ | **❓ เสนอ ✅** | App Functionality | 2.0 อ่าน/ตอบแชทลูกค้า (LINE/FB/เว็บแชท) ในแอปโดยตรง + Shark ร่างคำตอบ/แปลจากข้อความนั้น · Apple นิยามหมวดนี้ว่ารวม "เนื้อหาข้อความ" — ดูคำถาม Q-P1 |
| **Usage Data → Product Interaction** | ❌ | **❓ เสนอ ✅** | **Analytics** (ปรับปรุงคุณภาพเลขา) | ผลของข้อเสนอ (อนุมัติ/แก้/ตีกลับ) + คำสั่ง/คำตอบที่ลบอีเมล-เบอร์แล้ว เก็บ**ทุกครั้ง**ใน `AiTrainingSample` (`learn.ts` ชั้น 1 — ไม่ขึ้นกับ `SHARK_AI_COLLECT`) · ดู Q-P2 เรื่อง Linked |
| Identifiers → User ID | ✅ | ✅ | App Functionality | เหมือนเดิม |
| Identifiers → Device ID | ✅ | ✅ | App Functionality | เหมือนเดิม (push token) |
| Financial / Location / Contacts / Health / Sensitive / Browsing / Search History / Diagnostics / Audio | ❌ | ❌ | — | ไม่เปลี่ยน · ข้อความเสียงในแชทลูกค้า = ลูกค้าส่งมา แอปแค่เล่น ไม่บันทึกเสียง (ไม่มีสิทธิ์ไมค์) |

### สรุปสิ่งที่ต้องกดใน ASC (ถ้าเจ้าของเห็นด้วยกับข้อเสนอ)
1. App Privacy → **Edit** → ตารางติ๊ก: เพิ่ม ✅ **Customer Support** · ✅ **Emails or Text Messages** · ✅ **Product Interaction**
2. ตอบ 3 คำถามต่อหมวดใหม่ — Customer Support / Emails or Text Messages: App Functionality · Linked Yes · Tracking No
   — Product Interaction: **Analytics** (+ App Functionality ถ้าตอบ Q-P3 ว่าใช่) · Linked **Yes** (ดู Q-P2) · Tracking No
3. Phone Number: เปิดดูว่า Purpose = App Functionality · Linked Yes · Tracking No (ไม่ต้องติ๊กเพิ่ม)
4. กด **Publish** มุมขวาบน (ไม่กด = ไม่นับ — บทเรียน 1.0)

## เทียบหน้า privacy (8 พ.ย.) — ตรงกันแล้ว
- เบอร์โทร + OTP ทาง SMS ✅ · Anthropic ประมวลผลข้อความ/รูป/ข้อมูลกิจการ + ไม่นำไปฝึกโมเดล ✅ · แชทลูกค้าถูกประมวลผลเมื่อเปิดให้เลขาช่วยตอบ ✅
- ตัวอย่างการใช้งานลบอีเมล/เบอร์ก่อนเก็บ ✅ · push token ✅ · สิ่งที่ไม่เก็บ (ตำแหน่ง/รายชื่อ/บัตร/ติดตามโฆษณา) ✅
- ⚠️ หน้า privacy ไม่ได้พูดถึง "แจ้งปัญหา (support case) พร้อมภาพหน้าจอ" — ถ้าจะให้ตรงทุกบรรทัด เติมประโยคเดียวในหัวข้อข้อมูลที่เราเก็บ (Q-P4)

## คำถามค้าง (เจ้าของตัดสิน)
- **Q-P1** แชทลูกค้า (LINE/FB/เว็บแชท) ควรติ๊ก "Emails or Text Messages" ไหม — ข้อมูลเป็นของกิจการ (1.0 นับรวมใน Other User Content) แต่ 2.0 เปิดอ่าน/ตอบในแอปเต็มรูปแบบ · **เสนอติ๊ก** (ประกาศเกินไม่ผิด · ประกาศขาดเสี่ยงโดนตีกลับ)
- **Q-P2** ตัวอย่างการใช้งาน (`AiTrainingSample`) ลบอีเมล/เบอร์แล้ว แต่ยังเก็บ `tenantId` + `roomId`/`proposalId` (โยงกลับถึงห้องงานและผู้สั่งได้) ⇒ ตามนิยาม Apple ยังถือว่า **Linked** · ถ้าอยากตอบ "Not linked" ต้องตัดตัวเชื่อมพวกนี้ออกในโค้ดก่อน
- **Q-P3** บทเรียนที่เจ้าของยืนยัน (`AiLesson`) ถูกฉีดกลับเข้า prompt ให้เลขาของร้านนั้น — นับเป็น Product Personalization ด้วยไหม · เสนอ: ไม่ต้อง (เป็นการตั้งค่าของร้านเอง = App Functionality)
- **Q-P4** เติมเรื่อง support case + ภาพหน้าจอในหน้า privacy ไหม
- **Q-P5** Anthropic เป็น "third-party partner" ในความหมายของ ASC — คำตอบ "เก็บข้อมูล" ครอบคลุมแล้ว (ไม่มีช่องให้ระบุชื่อผู้ประมวลผล) · ไม่ต้องทำอะไรเพิ่ม เว้นแต่เจ้าของอยากเขียนใน Review Notes
