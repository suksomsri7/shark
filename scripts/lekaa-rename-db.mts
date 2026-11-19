// lekaa-rename-db.mts — ย้ายถ้อยคำที่บันทึกไว้ในฐาน จากชื่อผู้ช่วยเดิม "Shark" → "เลขา" (17 พ.ย. 2569 · เจ้าของสั่งเปลี่ยนชื่อผู้ช่วยเป็น Lekaa)
//
// 🔴 ค่าปริยาย = dry-run (อ่านอย่างเดียว พิมพ์สิ่งที่จะเปลี่ยน) · เขียนจริงต้องส่ง `--apply` เอง
// 🔴 แตะเฉพาะค่าที่ "ยังเท่ากับค่าปริยายเดิม" หรือ "มีวลีของค่าปริยายเดิมตรงตัว" — ค่าที่ร้าน/ผู้ใช้พิมพ์เองไม่แตะ
// 🔴 idempotent: หลังรันแล้วไม่มีแถวไหนเข้าเงื่อนไขอีก ⇒ รันซ้ำ = 0 แถว
//
// คอลัมน์ที่ย้าย (ค่าตั้ง — ใช้ต่อในข้อความใหม่):
//   1) AiSecretary.name            = "Shark" (ชื่อปริยายเดิม · onboarding เติมให้แล้วกดบันทึก)        → "เลขา"
//   2) AiSettings.aiDisclosure     = ข้อความปริยายเดิม "ข้อความนี้ตอบโดย Shark ผู้ช่วย AI ของร้าน — …"  → ข้อความปริยายใหม่
//                                  มีวลี "ตอบโดย Shark ผู้ช่วย AI" (ร้านแก้ต่อจากค่าปริยาย)            → แทนวลีเป็น "ตอบโดยเลขา ผู้ช่วย AI"
//   (โค้ดอ่านแบบทนอยู่แล้ว: identityOf / afterHoursSettings ถือค่าปริยายเดิม = ค่าปริยายใหม่ — สคริปต์นี้แค่ทำให้ฐานตรง)
// คอลัมน์ที่ "ไม่" แตะ (ประวัติ — ข้อความที่ส่งถึงลูกค้า/บันทึกไปแล้ว): ChatMessage.senderName/body · ChatConversation.lastMessagePreview ·
//   AiCreditTxn.note · AppNotification — พิมพ์แค่จำนวนให้เห็น
// คอลัมน์ AiSecretary.name ยังมี @default("Shark") ในสคีมา (ไม่ทำ migration ในงานนี้) — โค้ดสร้างแถวใส่ชื่อ "เลขา" เองแล้ว
//
// วิธีรัน (QC เลขา · dry-run):
//   bash scripts/iso.sh bash scripts/qc-sec.sh pnpm exec tsx scripts/lekaa-rename-db.mts
// เขียนจริง: เติม `--apply` · ฐานจริงต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง (ตัวโหลด env ร่วม member-backfill-common)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "lekaa-rename-db";
const APPLY = process.argv.includes("--apply");
const common = (await import("./member-backfill-common.mts" as string)) as Any;
await common.loadBackfillEnv(SCRIPT);
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const OLD_NAME = "Shark";
const NEW_NAME = "เลขา";
const OLD_DISCLOSURE = "ข้อความนี้ตอบโดย Shark ผู้ช่วย AI ของร้าน — ทีมงานจะติดต่อกลับในเวลาทำการ";
const NEW_DISCLOSURE = "ข้อความนี้ตอบโดยเลขา ผู้ช่วย AI ของร้าน — ทีมงานจะติดต่อกลับในเวลาทำการ";
const OLD_PHRASE = "ตอบโดย Shark ผู้ช่วย AI";
const NEW_PHRASE = "ตอบโดยเลขา ผู้ช่วย AI";

/** ค่าใหม่ของ disclosure (null = ไม่ต้องแก้) — pure */
function nextDisclosure(v: string | null): string | null {
  if (typeof v !== "string") return null;
  if (v.trim() === OLD_DISCLOSURE) return NEW_DISCLOSURE;
  if (v.includes(OLD_PHRASE)) return v.split(OLD_PHRASE).join(NEW_PHRASE);
  return null;
}

console.log(`[${SCRIPT}] โหมด ${APPLY ? "🟠 APPLY (เขียนจริง)" : "🟢 dry-run (อ่านอย่างเดียว)"}`);
const counts: Record<string, number> = {};

// 1) AiSecretary.name
const secs: { id: string; userId: string; name: string }[] = await P.aiSecretary.findMany({ where: { name: { in: [OLD_NAME, ` ${OLD_NAME}`, `${OLD_NAME} `] } }, select: { id: true, userId: true, name: true } });
counts["AiSecretary.name ที่จะแก้"] = secs.length;
for (const r of secs) console.log(`  AiSecretary ${r.id} (user ${r.userId}): ${JSON.stringify(r.name)} → ${JSON.stringify(NEW_NAME)}`);
if (APPLY && secs.length > 0) {
  const n = await P.aiSecretary.updateMany({ where: { id: { in: secs.map((r) => r.id) }, name: { in: [OLD_NAME, ` ${OLD_NAME}`, `${OLD_NAME} `] } }, data: { name: NEW_NAME } });
  counts["AiSecretary.name ที่แก้แล้ว"] = n.count;
}

// 2) AiSettings.aiDisclosure
const sets: { id: string; tenantId: string; aiDisclosure: string | null }[] = await P.aiSettings.findMany({ where: { aiDisclosure: { contains: OLD_PHRASE } }, select: { id: true, tenantId: true, aiDisclosure: true } });
let changed = 0;
for (const r of sets) {
  const next = nextDisclosure(r.aiDisclosure);
  if (next === null || next === r.aiDisclosure) continue;
  changed += 1;
  console.log(`  AiSettings ${r.id} (tenant ${r.tenantId}): ${JSON.stringify(r.aiDisclosure)} → ${JSON.stringify(next)}`);
  // เขียนแบบมีเงื่อนไขค่าเดิม (ถ้าระหว่างนั้นเจ้าของแก้เอง = ไม่ทับ)
  if (APPLY) await P.aiSettings.updateMany({ where: { id: r.id, aiDisclosure: r.aiDisclosure }, data: { aiDisclosure: next } });
}
counts["AiSettings.aiDisclosure ที่จะแก้"] = changed;

// 3) ประวัติ (ไม่แตะ — แค่นับ)
counts["(ไม่แตะ) ChatMessage.senderName = \"Shark (ผู้ช่วย AI)\""] = await P.chatMessage.count({ where: { senderName: "Shark (ผู้ช่วย AI)" } });
counts["(ไม่แตะ) ChatMessage.body มี \"Shark ผู้ช่วย AI\""] = await P.chatMessage.count({ where: { body: { contains: "Shark ผู้ช่วย AI" } } });
counts["(ไม่แตะ) ChatConversation.lastMessagePreview มี \"Shark\""] = await P.chatConversation.count({ where: { lastMessagePreview: { contains: "Shark" } } });
counts["(ไม่แตะ) AiCreditTxn.note มี \"Shark\""] = await P.aiCreditTxn.count({ where: { note: { contains: "Shark" } } });

console.log(`[${SCRIPT}] สรุป${APPLY ? "" : " (dry-run — ยังไม่ได้เขียนอะไร)"}:`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
await prisma.$disconnect();
