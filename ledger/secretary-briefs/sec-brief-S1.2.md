# S1-2 — S1.2 ตัวตนเลขา (secretary.ts + persona) · S1.3 สิทธิ์ต่อระบบ 3 ระดับ (access.ts + ด่านเครื่องมือ) (Opus · เลน c · `wip/sec-s1.2` · หลัง S1.1 merge)

Read `sec-brief-COMMON.md`, then `sec-brief-RESOLUTIONS.md` (R-K3 R-K4 §F), then plan rows S1.2/S1.3, then `docs/modules/31-secretary.md` §5 (S0.3) and the oracle `scripts/qc-sec-s1.2.mts` (acceptance — build to every check). Verified code you touch: `src/lib/ai/persona.ts` (81 lines · `buildSystemPrompt`) · `src/lib/ai/service.ts` (`sendMessage` :97–211 · prompt build :160–211 · `toolsOfferedTo` :176) · `src/lib/ai/tool-access.ts` (`toolVerdict` :220 · `toolsOfferedTo` :289 · `moduleToolQuery` :145 · `HAND_TOOL_ACCESS` needs) · `src/lib/ai/tools.ts` (`ToolCtx` :46 · `AiTool.action` :63 · `runTool` :2411) · `src/lib/ai/proposals.ts` (`executeProposal` :370 · `kindAccessOf` :475 · `runKind` :484) · `src/lib/core/rbac.ts` (`MembershipCtx` · `ForbiddenError` · `assertCan`). Tables from S1.1: `AiSecretary` (global axis) · `AiSystemAccess` (tenant).

## S1.2 — `src/lib/ai/secretary/secretary.ts`
```ts
export const SECRETARY_DEFAULT = { name: "Shark", suffix: "ครับ", tone: "polite", languages: ["th"] } as const;
export const TONES = ["polite", "friendly", "brief"] as const;           // สุภาพ · เป็นกันเอง · สั้นกระชับ
export const LANGUAGES = ["th", "en", "zh", "ja"] as const;
export type SecretaryIdentity = { name: string; suffix: string; tone: Tone; languages: Language[] };
export async function ensureSecretary(userId: string): Promise<AiSecretary>;          // upsert ค่าเริ่มต้น · idempotent (id เดิม)
export async function secretaryOf(userId: string): Promise<AiSecretary | null>;      // อ่านอย่างเดียว ไม่สร้าง
export async function updateSecretary(userId: string, patch: Partial<SecretaryIdentity>): Promise<AiSecretary>;
   // ตรวจ: name trim 1–30 ตัว ไม่มีบรรทัดใหม่ · suffix 0–10 ตัว · tone ∈ TONES · languages ⊆ LANGUAGES และ ≥ 1 (ซ้ำ = ตัดออก) · ผิด = throw Error ข้อความไทย
export function sampleSpeech(sec: SecretaryIdentity): string;                        // pure · ประโยคตัวอย่างไทยที่มีชื่อ + ลงท้าย ตามน้ำเสียง (B2 preview)
export function secretaryPromptBlock(sec: SecretaryIdentity): string;                // pure · บล็อกตัวตนสำหรับ persona
```
persona.ts: เพิ่ม `PersonaContext.secretary?: SecretaryIdentity`. **ไม่มี `secretary` ⇒ prompt ต้องเหมือนเดิมทุกไบต์** (oracle เทียบ sha256 กับ snapshot ของ 5973db2e) — ห้ามแตะบรรทัดเดิม ห้ามเปลี่ยนลำดับ · มี `secretary` ⇒ (1) บรรทัดแรกเป็น `คุณคือ "<name>" เลขา AI ประจำกิจการ "<tenant>" บนแพลตฟอร์ม SHARK (shark.in.th)` (2) กติกาภาษา: `languages` = ["th"] ⇒ บรรทัด "ตอบภาษาไทยเสมอ…" เดิม · มี en/zh/ja ⇒ แทนด้วย "ตอบภาษาเดียวกับที่ผู้ใช้พิมพ์ (ไทย/อังกฤษ/…)" และไม่มีคำว่า "ตอบภาษาไทยเสมอ" (3) บรรทัดลงท้าย: `ลงท้ายประโยคด้วย "<suffix>"` (suffix ว่าง = ไม่มีบรรทัดนี้) (4) บรรทัดน้ำเสียงตาม tone (5) บรรทัด "ระบบที่เจ้าของปิดไม่ให้เลขาแตะ: …" / "ดูได้อย่างเดียว: …" เมื่อ `PersonaContext.access` มีค่าที่ไม่ใช่ DRAFT (S1.3 ส่งมา)
service.ts `sendMessage`: เมื่อ `ctx.actor.kind === "member"` → `secretaryOf(actor.userId)` (ไม่สร้าง) ส่งเข้า `buildSystemPrompt({..., secretary})` · actor อื่น/ไม่มีแถว ⇒ ไม่ส่ง (prompt เดิม · `qc-ai-brain` เขียว) · พ่วงใน `Promise.all` เดิม (ไม่เพิ่ม round-trip)

## S1.3 — `src/lib/ai/secretary/access.ts`
```ts
export const ACCESS_LEVELS = ["OFF", "READ", "DRAFT"] as const;  // AUTO ไม่มีในรุ่นแรก
export const AI_MODULES = ["pos", "crm", "member", "account", "kanban", "chat", "inventory", "hr", "booking", "queue", "hotel", "dorm", "rental", "school", "clinic", "shop", "kb", "approval", "automation", "system"] as const; // ชื่อ = `module` ของ AccessQuery ที่ tool-access/kindAccessOf ใช้จริง — ตรวจกับ HAND_TOOL_ACCESS/KIND_ACCESS แล้วแก้รายการให้ครบ (oracle B-0 ตรวจว่า module ทุกตัวที่ปรากฏใน needs/KIND_ACCESS อยู่ใน AI_MODULES หรือใน ALWAYS_ON)
export const ALWAYS_ON = ["ai", "support", "secretary"] as const;         // โมดูลที่ปิดไม่ได้ (ask_clarify · list_systems · support_open_case · remember_fact ฯลฯ)
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type AccessMap = Readonly<Record<string, AccessLevel>>;           // ครบทุก AI_MODULES เสมอ (default เติม)
export const DEFAULT_LEVEL: AccessLevel = "DRAFT"; export const DEFAULT_OVERRIDES = { chat: "READ" } as const;
export async function getAccess(tenantId: string): Promise<AccessMap>;  // 1 query · เติม default
export async function setAccess(tenantId: string, by: { userId: string; membership: MembershipCtx }, module: string, level: string): Promise<AccessMap>;
   // OWNER เท่านั้น (อื่น = throw ForbiddenError) · module ∉ AI_MODULES = throw ไทย · level "AUTO" = throw Error("รุ่นแรกยังไม่เปิดให้เลขาทำเองโดยไม่ขออนุมัติ …") · อื่นที่ไม่ใช่ ACCESS_LEVELS = throw · upsert AiSystemAccess(setById)
export function toolModuleOf(name: string): string | null;              // pure · hand.needs[0].module ?? kindAccessOf(HAND_ACTION_KIND[name]).module ?? moduleToolQuery(name).module ?? null (null = แกนกลาง ไม่ถูกตัด)
export function toolIsWrite(name: string): boolean;                      // AiTool.action === true หรือ HAND_ACTION_KIND มี name หรือ moduleToolQuery เป็น op เขียน (ทะเบียน op มี flag write)
export function accessVerdict(access: AccessMap, name: string): ToolVerdict; // OFF ⇒ {ok:false, reason:"เจ้าของปิดไม่ให้เลขาใช้ระบบ <ไทย>"} · READ+write ⇒ {ok:false, reason:"ระบบ <ไทย> ตั้งไว้ดูได้อย่างเดียว …"} · อื่น ok
export function kindAllowedByAccess(access: AccessMap, kind: string): ToolVerdict; // kindAccessOf(kind).module ต้องเป็น DRAFT
export function accessSummaryForPrompt(access: AccessMap): string;      // pure · "" เมื่อทุกตัว DRAFT (ยกเว้น chat READ ค่าเริ่มต้น = ไม่พูดถึง)
```
ต่อเข้าด่าน (สิทธิ์สุทธิ = membership ∩ ระดับ — ตรวจ membership ก่อน แล้วระดับ):
- `tool-access.ts`: `toolVerdict(actor, name, opts: { crmLegacyLead?; access?: AccessMap })` — หลังด่านเดิมทั้งหมดผ่าน ถ้า `opts.access` มี ⇒ คืน `accessVerdict(opts.access, name)` · `toolsOfferedTo(actor, names, access?)` ส่งต่อ · ไม่ส่ง access = พฤติกรรมเดิมทุกไบต์ (ผู้เรียกเดิม 20 จุดไม่กระทบ) · **ห้าม import prisma ใน tool-access.ts** (ไฟล์ pure) — `accessVerdict` เป็น pure จึง import ได้ (แยก `access.ts` เป็น 2 ส่วน: `access-rules.ts` pure + `access.ts` db ถ้าต้อง)
- `tools.ts`: `ToolCtx.access?: AccessMap` · `runTool` ส่ง `ctx.access` เข้า `toolVerdict`
- `service.ts`: `getAccess(ctx.tenantId)` ใน `Promise.all` เดิม → `toolsOfferedTo(actor, names, access)` + `ToolCtx.access` + `PersonaContext.access`
- `proposals.ts` `executeProposal`: หลัง `assertCan` (:427) เพิ่ม `kindAllowedByAccess(await getAccess(ctx.tenantId), row.kind)` ไม่ผ่าน ⇒ `{ok:false, note: reason}` คง PENDING · `runKind` เช่นกัน
- ค่าเริ่มต้นทุกโมดูล DRAFT (chat READ) ⇒ ร้านที่ไม่เคยตั้ง = พฤติกรรมเดิม (baseline `qc-ai-*` เขียว)

## Files you own
`src/lib/ai/secretary/{secretary,access,access-rules}.ts` (+`index.ts` barrel ถ้าทำ) · `src/lib/ai/persona.ts` (เพิ่มบรรทัด/บล็อกใหม่เท่านั้น) · `src/lib/ai/service.ts` (hunk เล็ก 2 จุด) · `src/lib/ai/tool-access.ts` (พารามิเตอร์ `access?` 2 ฟังก์ชัน) · `src/lib/ai/tools.ts` (`ToolCtx.access` + 1 บรรทัดใน runTool) · `src/lib/ai/proposals.ts` (hook ใน executeProposal/runKind) · `docs/modules/31-secretary.md` §5 (ลายเซ็นให้ตรงของจริง) · `ledger/wo-notes/sec-s1.2.md`. ห้ามแตะ prisma · ห้ามสร้าง API route (S1.14)
## Acceptance = `scripts/qc-sec-s1.2.mts` (A ตัวตน · B สิทธิ์ · P persona snapshot · R ด่าน runTool/executeProposal) ทั้งหมด PASS + regression ที่ builder ต้องรันเองและแปะ JSON_SUMMARY ใน wo-notes: `qc-ai-brain` · `qc-ai-tools` · `qc-ai-tools2` · `qc-ai-skills` · `qc-ai-phase-a` · `qc-mobile-authz-hotfix` · `qc-pos-p3.9` (ผ่าน `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/<f>.mts`) ต้องเท่ากับ `ledger/qc-baseline/sec-baseline-2c2062c7.txt` · typecheck 0 · fitness ×2
