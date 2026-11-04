# WO S1.20 — ผู้ให้บริการโมเดลตรง Anthropic (Messages API · raw fetch · ไม่เพิ่ม package)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-d` branch `wip/sec-s1.20` (ฐาน 47027ca0) · 2026-11-04T13:3xZ · builder: ตัวแทน builder ชุด S1-14
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.20.md` + COMMON + RESOLUTIONS (**R-K18 · R-K18b**)
> ข้อสอบ: `scripts/qc-sec-s1.20.mts` (19 ข้อ · commit test: 1f23aa77 · **แก้หลัง commit หรือไม่: ไม่**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/provider.ts` | แก้ (เพิ่มเท่านั้น) | `ANTHROPIC_MODEL_IDS` · `toAnthropicModelId` · `buildAnthropicRequestBody` · `parseAnthropicReply` · `class AnthropicProvider` (readonly `model` · `deps.fetchImpl/version`) · บล็อก `AI_PROVIDER=anthropic` ใน `resolveProvider` (หลัง MOCK ก่อนทาง OpenRouter) · คอมเมนต์หัวไฟล์ 1 บรรทัด | ใช่ (provider.ts) · ไม่แตะ `pickModel/buildRequestBody/OpenRouterProvider/FAST_MODEL/SMART_MODEL` (D-0 snapshot ผ่าน) |
| `.env.example` | แก้ | `AI_PROVIDER=""` + `SHARK_ANTHROPIC_KEY=""` + คอมเมนต์ไทย (3 บรรทัด) | ไม่ |
| `docs/AI_LAYER.md` | แก้ | §Env 2 แถว + บล็อกผู้ให้บริการตรง 5 บรรทัด | ไม่ |
| `docs/modules/31-secretary.md` | แก้ | §5.16 ลายเซ็นจริง (แทนข้อความแผนเดิมที่ R-K18b ยกเลิก: `pickModel` คืน tier / `MODEL_IDS`) | ไม่ |
| `ledger/wo-notes/sec-s1.20.md` | ใหม่ | ไฟล์นี้ | — |

## 2. migration / seed / backfill
- ไม่มี (ใบ pure + fetch ปลอม ไม่แตะฐาน)

## 3–4. ด่าน / กลุ่ม X (สรุป)
- X10 ความลับ: คีย์อยู่ใน header `x-api-key` เท่านั้น · error message = status + body ตอบกลับ 200 ตัว (ไม่มีคีย์) · ไม่มีคีย์ใน log
- X11 ต้นทุน: `tokensIn` รวม cache_creation + cache_read ⇒ ผู้เรียกเดิม (usage/credit) คิดเงินครบ · `reply.model` = id ตรง (เช่น `claude-haiku-4-5`) ⇒ `priceOf` substring เดิมจับได้ (E-2)
- X1–X9: N-A (ไม่มี route/ตาราง/สิทธิ์/งานตามเวลาใหม่)

## 5. ผลข้อสอบ (วางจริง)
- `qc-sec-s1.20` forced #1: `JSON_SUMMARY {"total":19,"passed":19,"failed":[],"skipped":[],"findings":[]}` exit 0
- `qc-sec-s1.20` forced #2: `JSON_SUMMARY {"total":19,"passed":19,"failed":[],"skipped":[],"findings":[]}` exit 0
- `qc-sec-s1.20` unforced: `JSON_SUMMARY {"total":19,"passed":19,"failed":[],"skipped":[],"findings":[]}` exit 0 (มี AnthropicProvider แล้ว ⇒ ไม่ SKIP) · residue: N-A (ไม่ใช้ฐาน)
- regressions (ผ่าน `iso.sh qc-sec.sh with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1`) เทียบ `ledger/qc-baseline/sec-baseline-85751098.txt` — **เท่า baseline ทุกชุด**:
  - qc-ai-brain `JSON_SUMMARY {"total":8,"passed":8,"findings":[]}` exit=0 (baseline เดียวกัน)
  - qc-ai-credit `JSON_SUMMARY {"total":32,"passed":32,"findings":[]}` exit=0 (=)
  - qc-ai-usage (ไม่พิมพ์ JSON_SUMMARY) `qc-ai-usage: 31/31 ผ่าน · CRITICAL fail 0` exit=0 (baseline exit=0)
  - qc-ai-vision `JSON_SUMMARY {"total":6,"passed":6,"findings":[]}` exit=0 (=)
  - qc-chat-ai-suggest `JSON_SUMMARY {"total":44,"passed":44,"findings":[]}` exit=0 (=)
  - qc-chat-translate `JSON_SUMMARY {"total":34,"passed":34,"findings":[]}` exit=0 (=)
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9500M iso.sh pnpm typecheck`): 14 errors ทั้งหมดอยู่ใน `scripts/qc-sec-s1.{4,5,6,7,19}.mts` (TS2307 import โมดูลของใบที่ยังไม่สร้าง — รู้อยู่แล้ว) · **0 ในไฟล์ที่ใบนี้แตะ**
- fitness มี env: `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` exit 0 · `env -u DATABASE_URL -u DIRECT_URL`: `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` exit 0 · pre-commit fitness ผ่าน

## 7. มติทางเทคนิค
- ทำตาม R-K18b (ชนะ R-K18 ข้อ `pickModel` คืน tier / `MODEL_IDS{fast,smart}`): slug คงเดิม · แม็ปตอน resolve
- `toAnthropicModelId` trim ค่าเข้า (SHARK_AI_MODEL มีช่องว่างท้ายไม่ทำให้ id เพี้ยน) · ทาง OpenRouter ยังส่ง SHARK_AI_MODEL แบบไม่ trim ทุกไบต์ตามเดิม
- `AI_PROVIDER` เทียบ `=== "anthropic"` ตรงตามใบ (ไม่ lowercase/trim) — ค่าอื่นใด ⇒ OpenRouter
- รูปแนบแปลงเฉพาะ role user (ตามใบ) · data URL ที่ไม่ใช่ base64 ⇒ ส่งเป็น url source (API จะปฏิเสธเอง — ผู้เรียกปัจจุบันส่ง base64/http เท่านั้น)
- tool result ติดกันรวม user message เดียว · tool result ที่ตามหลัง user text ⇒ user message ใหม่ (API รับ user ติดกันได้)
- refusal ตรวจก่อน "ตอบว่าง" (refusal มักมาพร้อม content ว่าง)
- `fetchImpl` ปริยาย = `(input, init) => fetch(input, init)` (ไม่ผูก fetch ตอน import)
- ทางที่เรียกโมเดลเพิ่ม: ไม่มีทางใหม่ — `AnthropicProvider` เป็นแค่ backend ของ `resolveProvider` ที่ผู้เรียกเดิม 12 จุดคิดเงินอยู่แล้ว
- ใครได้/เสียสิทธิ์: ไม่มี

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `pricing.ts` คิด sonnet 3/15 ต่อ 1M แต่ราคาจริงของ id SMART ตรง = 2/10 (คิดเกิน ~33%) · haiku 1/5 ถูกต้อง | ใบนี้ห้ามแตะ pricing.ts (R-K18b) | S3a.2 |
| cache_read คิดราคาเต็มขาเข้า (จริงถูกกว่ามาก) · cache_creation คิดเท่าขาเข้า (จริงแพงกว่าเล็กน้อย) — รวมเข้า tokensIn ตามสัญญา | สัญญา `AiReply` มีแค่ tokensIn/out | S3a.2 (ถ้าต้องการแม่น) |
| ยังไม่เคยยิง API จริง (ไม่มีคีย์) — ทดสอบด้วย fetch ปลอมเท่านั้น | ห้ามเรียกจริงจน S3a.1 | S3a.1 |
| ข้อความ assistant ที่ content ว่างและไม่มี toolCalls ถูกส่งเป็น string ว่าง (API อาจ 400) | ผู้เรียกปัจจุบันไม่สร้างกรณีนี้ · ไม่อยู่ในสเปก | ดูตอน S3a.1 |

### env ที่เจ้าของต้องตั้ง (Vercel · ตอน S3a.2)
- `AI_PROVIDER=anthropic`
- `SHARK_ANTHROPIC_KEY=<คีย์ชื่อ "shark" จาก console.anthropic.com — ห้ามใช้คีย์โปรเจกต์อื่น>`
- (ทางเลือก) `SHARK_AI_MODEL` — ถ้ายังตั้ง `anthropic/claude-haiku-4.5` ไว้ จะบังคับ FAST ทุกคำขอ (แม็ปเป็น `claude-haiku-4-5`) · ลบออกเพื่อเปิด auto-routing fast/smart · ใส่ id ตรงได้ (เช่นรุ่นใหม่กว่า)
- ไม่ตั้ง `AI_PROVIDER` ⇒ OpenRouter เดิมทุกไบต์ · `AI_PROVIDER=anthropic` แต่ไม่มีคีย์ ⇒ ชั้น AI ปิดสุภาพ (ไม่ตกไป OpenRouter)

## 9. คืนสภาพฐาน QC เลขา
- ข้อสอบใบนี้ไม่ใช้ฐาน · regression 6 ชุดรันผ่าน gate lock ตามปกติ
