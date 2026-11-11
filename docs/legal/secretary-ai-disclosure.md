# เลขา AI "Shark" — ข้อความเปิดเผยการใช้ AI และข้อมูลส่วนบุคคล (PDPA)

> **ร่าง — รอเจ้าของตรวจ** · ใบ S3b.1 · 8 พ.ย. 2569
> เอกสารนี้ไม่ใช่คำแนะนำทางกฎหมาย ควรให้ที่ปรึกษากฎหมายตรวจก่อนเผยแพร่ (DESIGN-SECRETARY §5)
> ทุกข้อเท็จจริงด้านล่างตรวจกับโค้ดที่ขึ้น production (`main` c82cc727a) · อะไรที่โค้ดไม่ได้กำหนดเขียนว่า "ยังไม่กำหนด" และอยู่ในรายการคำถามท้ายไฟล์
> ใช้ได้ 3 ที่: (ก) ส่วนเพิ่มในนโยบายความเป็นส่วนตัว `src/app/(marketing)/privacy/page.tsx` · (ข) หน้าตั้งค่า B7 ในแอป · (ค) privacy labels ตอนยื่นสโตร์ (ใบ S3b.2)

---

## ภาษาไทย

### 1. เลขา AI คืออะไร
"Shark" คือผู้ช่วย AI ในแอป SHARK HUB ที่ช่วยทีมงานของร้านทำงานในระบบ (บัญชี สมาชิก CRM นัดหมาย POS แชทลูกค้า ฯลฯ) ตามที่ทีมงานสั่ง เลขาอ่าน สรุป และร่างงานได้เอง แต่ **ทุกงานที่เปลี่ยนข้อมูลหรือส่งข้อความถึงลูกค้าต้องมีคนในร้านกดอนุมัติก่อนเสมอ** (ไม่มีโหมด "ทำเองโดยไม่ถาม")

### 2. ข้อมูลที่เลขาประมวลผล
| ข้อมูล | มาจาก | ใช้เพื่อ |
|---|---|---|
| ข้อความและคำสั่งที่ทีมงานพิมพ์ในห้องงาน | ทีมงานร้าน | ให้เลขาทำงานตามที่สั่ง |
| ข้อมูลกิจการที่งานนั้นต้องใช้ (สินค้า เอกสาร นัดหมาย สมาชิก ยอดขาย) | ระบบ SHARK ของร้าน | ตอบคำถาม/ร่างงาน — เลขาเห็นเฉพาะระบบที่ร้านเปิดให้ และเท่าที่สิทธิ์ของคนสั่งเห็น |
| ข้อความแชทของลูกค้า (LINE ฯลฯ) | ลูกค้าของร้าน | ร่างคำตอบ แปลภาษา สรุปบริบทลูกค้าให้ทีม · ตอบนอกเวลาทำการ (ถ้าร้านเปิด) |
| **เบอร์โทรศัพท์มือถือ** | ผู้ใช้แอป (สมัคร/เข้าสู่ระบบด้วย SMS) · ผู้เชิญพนักงาน | ยืนยันตัวตนด้วยรหัส OTP · เชิญพนักงานเข้ากิจการ · เบอร์เก็บในรูปแบบสากล (E.164) ผูกกับบัญชี 1 เบอร์ต่อ 1 บัญชี |
| รหัส OTP | ระบบ | เก็บเฉพาะค่าแฮช (ไม่เก็บรหัสจริง) พร้อมเบอร์ เวลา และ IP ของผู้ขอ เพื่อกันการเดารหัส/ยิงซ้ำ |
| ความจำ บทเรียน และบันทึกการกระทำของเลขา | การใช้งานในร้าน | ให้เลขาทำงานถูกขึ้น · ย้อนกลับได้ภายใน 24 ชม. · ตรวจสอบย้อนหลัง |
| เรื่องแจ้งปัญหา (ช่วยเหลือ) | ผู้ใช้แอป | ให้ทีม SHARK ช่วยแก้ปัญหา |

สิ่งที่ระบบลดก่อนส่งให้โมเดล: บริบทลูกค้าในห้องเลขาไม่ดึงเบอร์/อีเมล/ที่อยู่ และปิดตัวเลขยาว · ข้อความลูกค้าที่ส่งไปตอบนอกเวลา/แปลภาษาถูกปิดเบอร์ อีเมล และตัวเลขยาวก่อน · ตัวอย่างที่เก็บไว้ปรับปรุงเลขาเก็บแบบตัดข้อมูลระบุตัวตน (anonymized)

### 3. ข้อความถึงลูกค้าอาจเขียนโดย AI ในนามร้าน
- ร้านอาจใช้เลขาช่วยร่างหรือส่งข้อความถึงลูกค้าในนามร้าน ข้อความที่เลขาเขียนจะลงชื่อผู้ส่งว่า **"Shark (ผู้ช่วย AI)"**
- ข้อความที่เลขาส่ง (นอกจากตอบนอกเวลา) ต้องมีคนในร้านอนุมัติก่อนทุกครั้ง และลงท้ายว่า "— ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน"
- **ตอบนอกเวลาทำการ** (ปิดไว้เป็นค่าเริ่มต้น เจ้าของร้านเปิดเอง): เลขาตอบได้เฉพาะคำถามทั่วไปจากข้อมูลร้าน และทุกข้อความลงท้ายด้วยข้อความเปิดเผย ค่าเริ่มต้นคือ
  > "ข้อความนี้ตอบโดย Shark ผู้ช่วย AI ของร้าน — ทีมงานจะติดต่อกลับในเวลาทำการ"

  เจ้าของร้านแก้ข้อความได้ แต่ระบบบังคับให้ยังมีคำว่า AI / เอไอ / ผู้ช่วย
- เรื่องเงิน คำร้องเรียน คำขอคุยกับคน หรือคำถามที่ไม่มีข้อมูล เลขาจะไม่ตอบเอง แต่ส่งต่อให้ทีมงาน
- ลิงก์ใบเสนอราคาที่ส่งให้ลูกค้า (`/doc/...`) เป็นลิงก์สุ่มที่เดายาก ไม่ถูกจัดทำดัชนีโดยเครื่องมือค้นหา และปิดข้อมูลติดต่อของลูกค้าบางส่วน

### 4. ผู้ประมวลผลข้อมูลภายนอก
- **ร้าน = ผู้ควบคุมข้อมูล** ของลูกค้าตนเอง · **SHARK = ผู้ประมวลผลข้อมูล** ให้ร้าน
- **Anthropic (Claude)** — ผู้ให้บริการโมเดลภาษาที่เลขาใช้ (ผ่าน Anthropic API) ข้อมูลตามข้อ 2 เท่าที่จำเป็นต่อคำขอนั้นจะถูกส่งไปประมวลผลที่ Anthropic เพื่อสร้างคำตอบ
- ผู้ให้บริการส่ง SMS (สำหรับรหัส OTP) — ยังไม่กำหนดผู้ให้บริการจริงบน production
- Expo (ส่งการแจ้งเตือนไปยังมือถือ) — ตามนโยบายเดิม

### 5. ระยะเวลาเก็บ
- ข้อความในห้องงาน ความจำ บทเรียน บันทึกการกระทำ และข้อความแชทลูกค้า: **ยังไม่กำหนดระยะลบอัตโนมัติ** — เก็บจนกว่าร้านจะลบ หรือจนกว่าจะลบกิจการ
- ความจำของเลขา: ร้านลบเองได้ที่ ตั้งค่าเลขา → ความรู้
- เบอร์โทรที่ผูกกับบัญชี: ลบพร้อมบัญชีทันทีเมื่อผู้ใช้ลบบัญชีในแอป
- บันทึกคำขอรหัส OTP (เบอร์ ค่าแฮช IP): **ยังไม่กำหนด** (ยังไม่มีการลบอัตโนมัติ)
- ลบกิจการ: มีระยะพัก 30 วันก่อนลบจริง (ตามกลไก PDPA เดิมของระบบ)
- ระยะที่ Anthropic เก็บข้อมูลฝั่งตน: ตามสัญญาผู้ให้บริการ — ต้องตรวจสอบ (ดูคำถามข้อ 3)

### 6. วิธีปิด/จำกัดเลขา
- เจ้าของร้านปิดการเข้าถึงของเลขาเป็นรายระบบได้ที่ ตั้งค่าเลขา → สิทธิ์ต่อระบบ (ปิดทุกระบบ = เลขาทำงานในร้านไม่ได้)
- ปิด "ตอบนอกเวลาทำการ" ได้ที่ ตั้งค่าเลขา → ลูกค้า (ค่าเริ่มต้นปิด)
- ปิดการแปลภาษาในแชทลูกค้าได้ที่การตั้งค่าแชทของร้าน
- ปิดการแจ้งเตือนแต่ละชนิดได้ที่ บัญชีของฉัน
- ทีม SHARK ระงับเลขาของร้านได้เมื่อมีปัญหา (รุ่นนี้ = ปิดการตอบนอกเวลาของร้าน)
- ลูกค้าของร้านที่ไม่ต้องการคุยกับ AI พิมพ์ขอคุยกับคนได้ ระบบจะส่งต่อให้ทีมงาน

### 7. สิทธิ์ของเจ้าของข้อมูลและการติดต่อ
คำขอดู แก้ หรือลบข้อมูลส่วนบุคคล — ลูกค้าของร้านติดต่อร้านโดยตรง (ร้านเป็นผู้ควบคุมข้อมูล) · ผู้ใช้แอปลบบัญชีได้เองในแอป · คำถามเรื่องข้อมูลส่วนบุคคลถึง SHARK: **support@shark.in.th** (อีเมลเดียวกับนโยบายเดิม — รอเจ้าของยืนยัน)

---

## English

### 1. What the AI secretary is
"Shark" is the AI assistant in the SHARK HUB app. It helps a shop's team work across SHARK (accounting, members, CRM, bookings, POS, customer chat, etc.) on their instructions. It can read, summarise and draft on its own, but **anything that changes data or messages a customer must be approved by a person in the shop first**. There is no "act without asking" mode.

### 2. Data the secretary processes
| Data | Source | Purpose |
|---|---|---|
| Messages and instructions typed by the team in task rooms | Shop staff | To carry out the task |
| Business data the task needs (products, documents, bookings, members, sales) | The shop's SHARK account | To answer and draft — limited to the systems the shop enabled and what the requesting person may see |
| Customer chat messages (LINE, etc.) | The shop's customers | Drafting replies, translation, customer context for staff, after-hours replies (if enabled) |
| **Mobile phone number** | App users (SMS sign-up/sign-in) · staff invitations | One-time-code verification · inviting staff · stored in international format (E.164), one number per account |
| One-time codes | System | Only a hash is stored (never the code), with phone number, time and requester IP, to prevent guessing and abuse |
| Secretary memory, lessons and action log | Use within the shop | Better results · 24-hour undo · audit trail |
| Support requests | App users | So the SHARK team can help |

Before data is sent to the model: customer context in a task room excludes phone, e-mail and address and masks long numbers; customer messages used for after-hours replies or translation have phone numbers, e-mails and long numbers masked; samples kept to improve the secretary are anonymised.

### 3. Replies to customers may be written by AI on the shop's behalf
- A shop may use the secretary to draft or send messages to its customers. Messages written by the secretary are signed **"Shark (ผู้ช่วย AI)"** ("Shark (AI assistant)").
- Apart from after-hours replies, every such message is approved by a person in the shop before it is sent, and ends with a Thai line meaning "— sent by Shark, the shop's AI assistant".
- **After-hours replies** (off by default; only the shop owner can turn them on): the secretary answers only general questions from shop information, and every reply ends with a disclosure. The default (Thai) text means: "This reply was written by Shark, the shop's AI assistant — our team will get back to you during business hours." The owner may edit it, but it must still mention AI / assistant.
- Money matters, complaints, requests for a human and questions without data are never answered by the AI; they are handed to staff.
- Quotation links sent to customers (`/doc/...`) use hard-to-guess random tokens, are not indexed by search engines and partially mask the customer's contact details.

### 4. Processors
- **The shop is the data controller** for its customers' data · **SHARK is a processor** for the shop.
- **Anthropic (Claude)** — the language-model provider the secretary uses (via the Anthropic API). The data in section 2, limited to what each request needs, is sent to Anthropic to generate the response.
- SMS gateway (for one-time codes) — production provider not yet selected.
- Expo (push notifications) — as in the existing policy.

### 5. Retention
- Task-room messages, memory, lessons, action log and customer chat messages: **no automatic deletion period is defined yet** — kept until the shop deletes them or the business is deleted.
- Secretary memory can be deleted by the shop under Secretary settings → Knowledge.
- A phone number linked to an account is deleted immediately when the user deletes the account in the app.
- One-time-code request records (phone, hash, IP): **not yet defined** (no automatic deletion yet).
- Deleting a business: 30-day grace period before permanent deletion (existing PDPA mechanism).
- Retention on Anthropic's side: per the provider's terms — to be verified (see open question 3).

### 6. How to turn it off or limit it
- The owner can switch the secretary off per system under Secretary settings → Access (all off = the secretary cannot act in the shop).
- Turn off after-hours replies under Secretary settings → Customers (off by default).
- Turn off chat translation in the shop's chat settings.
- Turn off each notification type under My account.
- The SHARK team can suspend a shop's secretary if needed (in this release: turns off the shop's after-hours replies).
- A customer who does not want to talk to AI can ask for a person; the conversation is handed to staff.

### 7. Rights and contact
Requests to access, correct or delete personal data — the shop's customers should contact the shop (the controller). App users can delete their account in the app. Privacy questions to SHARK: **support@shark.in.th** (same address as the current policy — pending owner confirmation).

---

## คำถามที่รอเจ้าของตัดสิน (ก่อนเผยแพร่)

1. **นโยบายความเป็นส่วนตัวเดิมยังเขียนว่าผู้ให้บริการโมเดลคือ "OpenRouter"** (`src/app/(marketing)/privacy/page.tsx`) แต่ prod ตั้ง `AI_PROVIDER=anthropic` แล้ว — แก้หน้าเว็บเป็น Anthropic (และระบุว่ายังมี OpenRouter สำหรับฟีเจอร์ AI เดิมหรือไม่)?
2. **หน้าเดิมเขียนว่า "เราไม่ใช้ข้อมูลของคุณไปฝึกโมเดล"** แต่ระบบเก็บ `AiTrainingSample` (ตัดข้อมูลระบุตัวตนแล้ว) พร้อมผลอนุมัติ/ตีกลับ เพื่อปรับปรุงเลขา — จะคงประโยคเดิม (ถ้าตีความว่า "ไม่ส่งให้ผู้ให้บริการโมเดลไปเทรน") หรือเขียนให้ชัดว่าเก็บตัวอย่างแบบไม่ระบุตัวตนไว้ปรับปรุงบริการ?
3. ตรวจสัญญา/นโยบายข้อมูลของ Anthropic API (ไม่นำข้อมูลไปเทรน · ระยะเก็บฝั่งผู้ให้บริการ · ที่ตั้งเซิร์ฟเวอร์/การโอนข้อมูลไปต่างประเทศ) — ต้องระบุเรื่องโอนข้อมูลออกนอกประเทศไหม?
4. ระยะเก็บ: ข้อความห้องเลขา · บันทึกการกระทำ · ข้อความแชทลูกค้า · `AiTrainingSample` — กำหนดกี่วัน/เดือน หรือ "จนกว่าร้านลบ"?
5. บันทึกคำขอ OTP (`PhoneOtp`: เบอร์ + ค่าแฮช + IP) ไม่มีงานลบอัตโนมัติ — ตั้งให้ลบหลังกี่วัน (ต้องเป็นใบงานโค้ด)?
6. ผู้ให้บริการ SMS บน production (ใคร · ระบุชื่อในนโยบายไหม) — ยังไม่ได้ตั้ง `SMS_PROVIDER` บน prod
7. อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล: ใช้ `support@shark.in.th` ต่อ หรือแยก (เช่น privacy@)? มี DPO ไหม?
8. ข้อตกลงประมวลผลข้อมูล (DPA) ระหว่าง SHARK กับร้าน — จะใส่ในข้อตกลงการใช้บริการ (`/terms`) หรือเอกสารแยก?
9. ข้อความเปิดเผย (DESIGN §5 "ข้อความแรกของทุกบทสนทนา"): โค้ดใส่ชื่อผู้ส่ง "Shark (ผู้ช่วย AI)" + บรรทัดลงท้ายทุกข้อความที่เลขาส่ง (ทั้งที่อนุมัติและตอบนอกเวลา) แทนการเปิดเผยครั้งเดียวในข้อความแรก — ยอมรับแบบนี้ไหม?
10. ปุ่ม "ระงับเลขาของร้าน" ฝั่งทีม SHARK รุ่นนี้ปิดได้แค่ตอบนอกเวลา (ยังไม่มีสวิตช์ระงับทั้งร้าน · หนี้ S3) — พอสำหรับเปิดสโตร์ไหม?
