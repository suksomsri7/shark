# K3.6 — คำแนะนำกฎอัตโนมัติจากพฤติกรรมจริง (builder note)

> สัญญา: `ledger/KANBAN-RUN.md` §K3.6 · ข้อสอบ `scripts/qc-kanban-k3.6.mts` (10 ข้อ) · ภาพแบบ `ledger/design-kanban/08-automation.png` (แผงขวา "คำแนะนำจาก AI")
> สถานะ: **ตรรกะครบ 10/10 · tsc 0 error · fitness 23/23 ทั้งมี env และไม่มี env · regressions เขียวทุกชุด · ภาพ 2 ใบ (failures 0) · ข้อมูล QC คืนสภาพครบ (การ์ดรวม 38)**
> 🔴 **แต่ข้อสอบไฟล์จริงรันได้แค่ 4/5 แล้ว CRASH** เพราะบั๊กในไฟล์ข้อสอบเอง (บรรทัด 67 อ้าง `E.boards.kataSecret` ที่ไม่มีอยู่ในเฉลย) — ดูข้อ 4 · แก้ 1 คำแล้วผ่าน 10/10

## 1. ผลรัน (ตัวเลขจริง · ทุกคำสั่งบน `.env.qc` host `ep-plain-art`)

| ด่าน | ผล |
|---|---|
| ข้อสอบ K3.6 (**ไฟล์จริง**) | `JSON_SUMMARY {"total":5,"passed":4,"findings":["CRASH"]}` — S1.1–S1.4 ✅ แล้ว CRASH ที่ S1.5 (`TypeError: Cannot read properties of undefined (reading 'id')`) |
| ข้อสอบ K3.6 (**สำเนาที่แก้ `kataSecret` → `kata` คำเดียว**) | `JSON_SUMMARY {"total":10,"passed":10,"findings":[]}` ✅ (สำเนาถูกลบทิ้งแล้ว ไม่ค้างใน repo) |
| typecheck | `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit -p tsconfig.json` → **0 error** |
| fitness (มี env) | `JSON_SUMMARY {"total":23,"passed":23,"findings":[]}` |
| fitness (**ไม่มี env** — เหมือน pre-commit hook) | `JSON_SUMMARY {"total":23,"passed":23,"findings":[]}` |
| ภาพ | `visual-kanban.mts 3.6` → `JSON_SUMMARY {"wo":"3.6","user":"owner","shots":[2 ใบ],"failures":0}` |

### regressions
| ชุด | ผล |
|---|---|
| `qc-kanban-k2.9` (ตัวสร้างกฎ) | 26/26 |
| `qc-kanban-k1.10` (ประวัติกิจกรรม) | 16/16 |
| `qc-kanban-k3.5` | 21/21 |
| `qc-kanban-k2.12` | 13/13 |
| `qc-kanban-k1.14` | 15/15 |

เปิดหัวไฟล์ตรวจก่อนรันทุกชุดแล้ว — ไม่มีชุดไหน `process.loadEnvFile(".env")` (ไม่แตะ prod)

## 2. ไฟล์ที่แตะ

**ใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/modules/kanban/automation-suggest.ts` | `suggestRules(ctx, actor, boardId, opts)` + `toSuggestionDto` + ชนิด `KanbanSuggestion*` · 3 แบบที่ตรวจ + ตัวเรียบเรียงด้วย LLM (lazy) |
| `src/components/kanban/AutomationSuggestions.tsx` | แผง `automation-suggestions` (client) — พาดหัวหนา + เหตุผล + ปุ่ม `suggestion-create` · empty state |

**แก้**
| ไฟล์ | ที่แก้ |
|---|---|
| `src/components/kanban/AutomationBuilder.tsx` | `AutomationPageData.suggestions` · `loadSuggestion()` (โหลดร่างเข้าฟอร์มโดย `editingId: null`) · เมนูซ้าย "คำแนะนำจาก AI" เปลี่ยนจาก "เร็ว ๆ นี้" เป็น **ป้ายจำนวน** (ลิงก์ `#ai-suggestions`) · แทนกล่อง placeholder `ai-suggestions` ด้วย `<AutomationSuggestions>` |
| `src/app/app/sys/[id]/kanban/automation/page.tsx` | เรียก `suggestRules()` ฝั่ง server ใน `Promise.all` เดิม (มี `.catch(() => [])`) แล้วส่งเป็น props |
| `scripts/visual-kanban.mts` | spec `"3.6"` 2 ใบ + บล็อกเตรียมข้อมูล `KB36` + บล็อกคืนสภาพใน `restoreSeed()` |

**ไม่มีไมเกรชัน** (คำนวณสด ไม่เก็บ DB) · **ไม่เพิ่มเส้น import ข้ามโมดูล** (F2.1 ยัง 23/23)

## 3. การตัดสินใจที่ควรรู้

### 3.1 🔴 LLM **ไม่ถูกเรียกโดยค่าเริ่มต้น** (ต่างจากตัวหนังสือในสัญญาเล็กน้อย)
สัญญาเขียนว่า "LLM (ถ้ามี `deps.complete`/**คีย์ร้าน**) ใช้เรียบเรียง title/reason" · ถ้าตีความว่า "มีคีย์ร้าน = เรียกเลย"
จะเกิด 2 ปัญหาที่ตรวจได้จริง:
1. **ข้อสอบพัง** — ร้าน QC ตั้งคีย์ AI ไว้แล้ว (K3.5 ใช้โมเดลจริงถ่ายภาพ) ⇒ `suggestRules(...)` แบบไม่ส่ง deps
   จะไปเรียกโมเดลจริง แล้ว S1.2 ที่บังคับว่า `title` ต้องมี **ชื่อคอลัมน์ทั้งสอง** จะตกทันทีที่โมเดลเรียบเรียงใหม่
   (และผิดกติกา "ห้ามเรียก AI จริงในข้อสอบ/ภาพ" ในใบสั่งงาน)
2. **เผาเครดิตร้าน** — หน้าอัตโนมัติคำนวณข้อเสนอใหม่ทุกครั้งที่เปิด ⇒ เปิดหน้า 20 ครั้ง = จ่ายโมเดล 20 ครั้ง
   ทั้งที่ข้อความ deterministic อ่านรู้เรื่องอยู่แล้ว และหน้าจะช้าขึ้นเป็นวินาที

⇒ ทำเป็น **opt-in**: `polish` ค่าเริ่มต้น = `!!deps.complete` · ผู้เรียกสั่ง `{ polish: true }` เมื่อไหร่ก็ใช้คีย์ร้าน
(lazy import `@/lib/ai/provider` + `@/lib/ai/credit` · ไม่มีคีย์/เครดิตหมด = คืนข้อความ deterministic ไม่ throw)
**หน้าจอตอนนี้ไม่ส่ง `polish`** ⇒ ข้อความบนแผงคือข้อความที่คำนวณจากตัวเลขจริงล้วน ๆ
ถ้า Fable อยากให้เปิดจริงบน prod = แก้ 1 บรรทัดใน `page.tsx` (`suggestRules(ctx, actor, board.id, { polish: true })`)

### 3.2 อ่าน `KanbanActivity.data` ให้ได้ทั้งรูปเดี่ยวและรูปหมู่
service จริงเขียน `CARD_LABELED → { labelIds: [...] }` และ `CARD_ASSIGNED → { userIds: [...] }`
แต่ข้อสอบ (และข้อมูลเก่า/ตัวนำเข้าบางตัว) เขียน `{ labelId }` / `{ userId }` เดี่ยว ⇒ ตัวนับอ่านทั้งคู่เสมอ
(`ids(data, "labelId", "labelIds")`) · ถ้าอ่านรูปเดียว "นับจากพฤติกรรมจริง" จะกลายเป็น "นับเฉพาะที่รุ่นล่าสุดเขียน"

### 3.3 กรองของที่ถูกลบไปแล้ว
ข้อเสนอที่อ้างคอลัมน์/ป้ายที่ถูกลบ/เก็บไปแล้ว = ร่างกฎที่ผู้ใช้กดบันทึกไม่ได้ (`assertRefsBelongToBoard` จะตีกลับ)
⇒ ตัดทิ้งตั้งแต่ตอนนับ ไม่ปล่อยให้ไปตายที่ปุ่มบันทึก

### 3.4 คนที่ถูกเสนอให้มอบหมาย (`LABEL_UNASSIGNED`)
`KanbanBoardMember role=ADMIN` คนแรกที่ยังเป็นสมาชิกร้านที่ตอบรับแล้ว → ไม่มี = `Membership` OWNER/MANAGER คนแรก
→ ไม่มีอีก = เปลี่ยนการกระทำเป็น `notify { to: "admins" }` (สัญญาอนุญาต) · ทุกทางผ่าน `createRule` ได้จริง

### 3.5 แบบที่ 3 `OVERDUE_NO_REMINDER` ทำแล้ว (สัญญาเขียนว่า "ทางเลือก")
การ์ด ACTIVE ที่ `completedAt = null` · `reminderMinutesBefore = null` · `dueAt` อยู่ในหน้าต่าง `[since, now)` ≥ 5 ใบ
→ กฎ `DUE_DATE` `-2` วัน `notify assignees` · บนบอร์ดซ่อมบำรุงของชุด QC ตัวเลขนี้ = 0 ⇒ ไม่โผล่มากวนข้อสอบ
(ตรวจแล้วด้วย probe ก่อนเขียนโค้ด: patong 8 · maint 0 · kata 1)

### 3.6 `evidence` มี `Date` ⇒ มี DTO แยกสำหรับจอ
`toSuggestionDto()` ตัดเหลือ `{ id, pattern, title, reason, count, rule }` ก่อนส่งข้าม RSC
(`AutomationSuggestions.tsx` ประกาศรูป `SuggestedRule` แบบ structural เอง — ไม่ import `automation*.ts` ที่ลาก prisma เข้าบันเดิล)

## 4. 🔴 ข้อแย้งข้อสอบ (พร้อมหลักฐาน) — `scripts/qc-kanban-k3.6.mts` บรรทัด 67

```ts
chk("K3.6-S1.5", "…", !!eT && (await sg.suggestRules(ctxO, owner, E.boards.kataSecret.id, { now: NOW })).length === 0, …);
//                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^
```

`E` = `scripts/kanban-expected.json` ซึ่ง **ไม่มีคีย์ `kataSecret`** — คีย์ของบอร์ดลับกะตะในเฉลยชื่อ `kata`
(`kataSecret` เป็นคีย์ของ **ชื่อบอร์ด** ใน `scripts/kanban-qc-env.mts` คนละก้อนกัน)

หลักฐาน 1 — ตัวสร้างเฉลยเขียนคีย์ `kata`:
```
scripts/seed-kanban-qc.mts:172:    kata: { ...kata, unitKey: "kata", visibility: "PRIVATE", cardCount: 3 },
```
หลักฐาน 2 — คีย์จริงในเฉลยที่ลง QC ไว้แล้ว:
```
$ node -e 'console.log(Object.keys(require("./scripts/kanban-expected.json").boards))'
[ 'patong', 'maint', 'kata' ]
```
หลักฐาน 3 — ผลรันไฟล์ข้อสอบจริง (นิพจน์ถูกประเมิน **ก่อน** เข้า `chk` ⇒ TypeError หลุดไปที่ `catch` ใหญ่ = จบทั้งชุด):
```
✅ [K3.6-S1.1] … ✅ [K3.6-S1.2] … ✅ [K3.6-S1.3] … ✅ [K3.6-S1.4] …
❌ [CRASH] จบ — exp จบ | act TypeError: Cannot read properties of undefined (reading 'id')
JSON_SUMMARY {"total":5,"passed":4,"findings":["CRASH"]}
```
หลักฐาน 4 — แก้คำเดียว (`E.boards.kataSecret.id` → `E.boards.kata.id`) ในสำเนา แล้วรันซ้ำ:
```
ผ่าน 10/10
JSON_SUMMARY {"total":10,"passed":10,"findings":[]}
```

**ที่ขอให้ Fable แก้:** เปลี่ยน `E.boards.kataSecret.id` เป็น `E.boards.kata.id` ในบรรทัด 67 (ตัวเดียวทั้งไฟล์)

> 📌 พ่วง (ไม่ใช่ของ WO นี้): `scripts/qc-kanban-k3.2.mts:59` เขียน `E.boards.kataSecret.id` แบบเดียวกัน
> แต่มันอยู่ในลูกศรที่ถูกห่อด้วย `fails()` ⇒ TypeError ถูกกลืนกลายเป็น "throw แล้ว" ⇒ ข้อนั้น **ผ่านด้วยเหตุผลผิด**
> (ตอนนี้ไม่ได้พิสูจน์ว่า `setIntegrations` ปฏิเสธบอร์ดข้ามสาขาจริง) — เสนอให้แก้ตอนปิดเฟส

## 5. ภาพ (2 ใบ · `.qc-shots/kanban/3.6/`) — เทียบภาพ 08

| ไฟล์ | สิ่งที่เห็น (ดูด้วยตาแล้วทุกใบ) |
|---|---|
| `automation-suggestions-desktop.png` | แผงขวา **"คำแนะนำจาก AI"** (ไอคอน spark + หัวข้อหนา) มี 2 ข้อเสนอจริง แต่ละข้อ = พาดหัวหนา + บรรทัดรองสีเทา + ปุ่ม **"สร้าง"** ชิดขวา — วางตรงกับภาพ 08 ทุกชิ้น · ข้อ 1 "คุณย้ายการ์ดจาก “กำลังซ่อม” ไป “รออะไหล่” เองซ้ำ ๆ **9 ครั้ง**" (= จำนวนแถว `CARD_MOVED` ที่ seed ไว้เป๊ะ) · ข้อ 2 "การ์ดป้าย “ด่วนมาก (ภาพ K3.6)” ไม่เคยมีผู้รับผิดชอบใน 1 ชม.แรก **6 ใบ**" · เมนูซ้าย **"คำแนะนำจาก AI" มีป้ายดำเลข 2** (ภาพแบบเป็นเลข 4) แทนคำว่า "เร็ว ๆ นี้" เดิม · แผง "บันทึกการทำงานล่าสุด" ยังอยู่ใต้แผงคำแนะนำเหมือนภาพแบบ |
| `automation-suggestion-loaded-desktop.png` | กดปุ่ม "สร้าง" ของข้อเสนอใบแรกจริงบน production build → ตัวสร้างกฎถูกเติมครบ: **เมื่อ** กฎ (Rule) · "เมื่อเช็คลิสต์ครบทุกข้อ" (บรรทัดรอง `kanban.checklist.completed`) · **และถ้า** การ์ดอยู่ในคอลัมน์ "กำลังซ่อม" · **ให้ทำ** ย้ายไปคอลัมน์ "รออะไหล่" · ช่องชื่อกฎ = `เช็คลิสต์ครบ → ย้ายจาก “กำลังซ่อม” ไป “รออะไหล่”` · หัวกล่องยังเป็น **"กฎใหม่ — ยังไม่บันทึก"** และตาราง **"กฎที่เปิดใช้อยู่ 0 กฎ"** ⇒ พิสูจน์ว่ายังไม่มีแถว `AutomationRule` จนกว่าคนจะกด "บันทึกกฎ" |

**deviation ที่ยอมรับ (เทียบภาพ 08)**
1. เลขบนป้ายเมนูซ้าย = จำนวนข้อเสนอจริงของบอร์ด (2) ไม่ใช่ 4 ตามภาพแบบ — ภาพแบบเป็นตัวเลขสมมติ
2. แผงคำแนะนำในภาพแบบไม่มีเส้นคั่นระหว่างข้อ · ของจริงใส่เส้นบาง (`border-top`) เพื่อให้ 2 บรรทัดของแต่ละข้อไม่ไหลปนกัน
3. ไม่มีมุมมองมือถือ (ภาพแบบไม่ได้วาดไว้ · แผงนี้ไหลลงล่างตามคอลัมน์ขวาที่ K2.9 ทำ responsive ไว้แล้ว)

## 6. หนี้ / ข้อจำกัด

1. **ไม่มีปุ่ม "ไม่เอาข้อเสนอนี้"** — `id` เป็น hash คงที่แล้ว (พร้อมสำหรับจำว่าใครปิดใบไหน) แต่ยังไม่มีที่เก็บ
   ⇒ ข้อเสนอเดิมจะกลับมาทุกครั้งที่เปิดหน้า จนกว่าจะสร้างกฎหรือพฤติกรรมหายไปจากหน้าต่าง 30 วัน (ต้องมีตาราง/JSON เก็บ = WO ถัดไป)
2. **`evidence.sample` ยังไม่ได้ขึ้นจอ** — คำนวณครบ (≤ 3 ใบ พร้อมชื่อการ์ด + เวลา) แต่แผงในภาพ 08 มีแค่ 2 บรรทัด
   ⇒ ถ้าอยากให้กด "ดูหลักฐาน" แล้วเห็นรายการการ์ดจริง ต้องเพิ่ม UI (ข้อมูลพร้อมแล้วใน service)
3. **เพดานกิจกรรมที่นับ = 5,000 แถว/บอร์ด/หน้าต่างเวลา** — บอร์ดที่คึกมากเกินนี้จะนับได้ไม่ครบ (ตัวเลขจะ *ต่ำกว่า* ความจริง
   ไม่มีทางสูงเกิน ⇒ ไม่โกหกผู้ใช้) · ถ้าเจอของจริงชนเพดาน ให้ย้ายไปนับด้วย SQL `group by` แทน
4. **เครดิต AI (ถ้าเปิด `polish`) ลงช่อง `CHAT_SUGGEST`** — หนี้เดียวกับ K3.5 ข้อ 1 (enum `AiCreditSource` ยังไม่มีช่องบอร์ดงาน)
   แยกได้จาก `note: "เรียบเรียงคำแนะนำกฎอัตโนมัติ (K3.6)"` เท่านั้น
5. **`REPEATED_MANUAL_MOVE` เสนอทริกเกอร์ `kanban.checklist.completed` เสมอ** (ตามสัญญา) — ถ้าการ์ดบนบอร์ดนั้นไม่ค่อยมีเช็คลิสต์
   กฎที่ได้จะแทบไม่ทำงาน · ผู้ใช้เปลี่ยนเหตุการณ์ในฟอร์มได้ก่อนบันทึก (นี่คือเหตุผลที่ WO นี้ "โหลดเข้าฟอร์ม" ไม่ใช่ "สร้างให้เลย")

## 7. คืนสภาพข้อมูล QC (probe หลังรันทุกอย่าง)

```
cardsTotal 38   (ป่าตอง 24 · ซ่อมบำรุง 11 · กะตะลับ 3)   ✅ ตรง seed
labels 15 ใบ — ไม่มี "ด่วนมาก-xxxx" (ข้อสอบ) และไม่มี "ด่วนมาก (ภาพ K3.6)" (spec ภาพ)   ✅
automationRule 0 · automationRun 0                                                   ✅
staleCards title^="ภาพ K3.6:" = 0 · title^="QC K3.6" = 0                             ✅
session userAgent="qc-visual-kanban" = 0                                             ✅
```
- ข้อสอบลบเอง: `KanbanActivity` ที่ seed + การ์ด 6 ใบ + ป้าย 1 ใบ (บล็อก `finally` — ทำงานแม้ตอน CRASH ข้อ 4 ด้วย ตรวจแล้ว)
- spec ภาพลบเอง (`restoreSeed`): ประวัติ 21 แถว + การ์ด 6 ใบ + ป้าย 1 ใบ · การ์ดถูกสร้างโดย **ไม่ขอ `cardNo`** ⇒ `cardNoSeq` ของบอร์ดไม่ขยับ

> 🔎 ข้อสังเกตที่ไม่ใช่ของ WO นี้: `qc-kanban-k2.9.mts` ทิ้ง `KanbanActivity` ชนิด `CARD_LABELED`
> ไว้ **1 แถวต่อการรัน 1 ครั้ง** บนบอร์ดซ่อมบำรุง (แถวที่กฎตัวอย่างเขียนตอนวิ่งจริง · `data.automation.ruleId`
> ชี้ไปกฎที่ถูกลบไปแล้ว) — มีมาก่อน K3.6 (นับได้ตั้งแต่ probe แรกก่อนเริ่มงาน) และไม่กระทบข้อสอบชุดไหน
> แต่สะสมขึ้นเรื่อย ๆ ทุกครั้งที่รัน k2.9 · เสนอให้ Fable เพิ่มการลบ `KanbanActivity` ของกฎที่ลบทิ้งใน `finally` ของชุดนั้น
