// HR H0.5 — backfill: PIN ตัวเปล่า (HrEmployee.pinCode) → hash (pinHash/pinSetAt) แล้วลบตัวเปล่า (HQ4)
//
// ทำไม: ก่อน H0.5 PIN ลงเวลาเก็บเป็นข้อความ (ใครเปิดฐานก็เห็น) · H0.5 เก็บเป็น HMAC-SHA256 + pepper (hr/pin.ts hashPin — สูตรเดียวกัน)
//   โค้ดใหม่ยังยืนยันแถวตัวเปล่าได้ (ทางเก่า อัปเกรดตอนยืนยัน) แต่แถวที่ไม่มีใครใช้จะค้างเป็นตัวเปล่าตลอด ⇒ ต้องแปลงทั้งร้านครั้งเดียว
//
// โหมด
//   (ไม่ใส่อะไร) = dry-run: นับต่อร้าน — มี PIN ตัวเปล่า · ซ้ำ (id + อักษรแรกของชื่อเท่านั้น ไม่พิมพ์ PIN) · มี hash แล้ว · จะอัปเดต — ไม่เขียนอะไร
//   --apply      = ต่อร้าน 1 ธุรกรรม: ทุกแถว (ยังทำงาน/พ้นสภาพ) ที่มี pinCode แต่ไม่มี pinHash
//                  · hash ชนกับคนที่ยังทำงานคนอื่นในร้าน (นับกลุ่มก่อน) ⇒ pinCode = null · pinHash = null (ต้องตั้ง PIN ใหม่ — อยู่ในรายการซ้ำ)
//                  · ไม่ชน ⇒ pinHash = hash · pinSetAt = now · pinCode = null
//                  · pinCode ที่ไม่ใช่ตัวเลข 4–6 หลัก (^\d{4,6}$ — ยืนยันไม่ได้อยู่แล้ว) ⇒ ล้างแบบเดียวกับซ้ำ (pinCode = null · ไม่มี hash) อยู่ในรายการ invalid
//                  · คนพ้นสภาพก็ hash (ไม่อยู่ในดัชนี) — กลับมาทำงานแล้วชน = setEmployeeActive ล้าง PIN ให้ (R4)
//                  · แถวที่มีทั้ง hash และตัวเปล่า (ไม่ควรมี) ⇒ ลบตัวเปล่าทิ้ง hash เดิมคงไว้
//                  · แถวที่มี hash แล้ว ไม่แตะ (pinSetAt เดิม) · audit hr.pin.backfill 1 แถวต่อร้านที่มีการเปลี่ยน (ตัวเลขเท่านั้น)
//                  รันซ้ำ = 0 แถว (idempotent) · ระหว่างรันมีคนตั้ง PIN ชนพอดี ⇒ ธุรกรรมของร้านนั้นย้อนทั้งก้อน รันใหม่ได้
//   --tenant <id> = เฉพาะร้านนี้ (ข้อสอบใช้) · ไม่ใส่ = ทุกร้านที่ยังมี pinCode เหลือ
// บรรทัดสุดท้าย: JSON_SUMMARY {"mode","host","tenants":[{tenantId,plain,duplicates:[ids],invalid:[ids],hashed,toUpdate,toUpdateInactive,changed}]}
//
// env
//   ค่าปริยาย: acc-v2-env.loadQcEnv() (.env.qc · env ที่ export มาก่อนชนะ — ใต้ scripts/qc4.sh = QC4) · ด่าน prod ของ loadQcEnv ทำงานเสมอ
//   prod (runbook ของผู้คุมงาน — ไม่มี --prod-ack): HR_BACKFILL_PROD=1 HR_BACKFILL_ENV_FILE=<ไฟล์ env ของ prod> pnpm exec tsx scripts/hr-backfill-pin-hash.mts [--apply]
//     สคริปต์พิมพ์ host ก่อนเสมอ · host เป็น ep-royal-night (production) โดยไม่มี HR_BACKFILL_PROD=1 = หยุด (exit 3)
//   ไม่มี HR_PIN_PEPPER (≥ 32 ตัว) = exit 2 ข้อความคงที่ — 🔴 pepper ต้องเป็นค่าเดียวกับที่ deploy ใช้ ไม่งั้น PIN ทุกคนยืนยันไม่ผ่าน
// 🔴 ห้ามพิมพ์ PIN · hash · pepper · ชื่อเต็มพนักงาน
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = "hr-backfill-pin-hash";
const PROD_HOST_MARK = "ep-royal-night";
const T_NOCONF = "ระบบยังไม่ได้ตั้งค่าความปลอดภัยของ PIN — แจ้งผู้ดูแลระบบ";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ti = argv.indexOf("--tenant");
const TENANT = ti >= 0 ? (argv[ti + 1] ?? "") : "";
if (ti >= 0 && !TENANT) {
  console.error(`❌ ${SCRIPT}: --tenant ต้องตามด้วย tenantId`);
  process.exit(1);
}
const unknown = argv.filter((a, i) => a !== "--apply" && a !== "--tenant" && !(ti >= 0 && i === ti + 1));
if (unknown.length) {
  console.error(`❌ ${SCRIPT}: ไม่รู้จัก ${unknown.join(" ")} (มีแค่ --apply · --tenant <id>)`);
  process.exit(1);
}

// ── env ──
const PROD = process.env.HR_BACKFILL_PROD === "1";
if (PROD) {
  const f = process.env.HR_BACKFILL_ENV_FILE ?? "";
  if (f) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) {
      console.error(`❌ ${SCRIPT}: ไม่พบ HR_BACKFILL_ENV_FILE`);
      process.exit(1);
    }
    process.loadEnvFile(p);
  }
  if (!process.env.DATABASE_URL) {
    console.error(`❌ ${SCRIPT}: HR_BACKFILL_PROD=1 แต่ไม่มี DATABASE_URL (ตั้ง HR_BACKFILL_ENV_FILE)`);
    process.exit(1);
  }
} else {
  const { loadQcEnv } = (await import("./acc-v2-env.mts" as string)) as Any;
  loadQcEnv();
}
let host = "?";
try {
  host = new URL(process.env.DATABASE_URL ?? "").hostname;
} catch {
  /* พิมพ์แค่ host */
}
console.log(`[${SCRIPT}] DB host = ${host} · โหมด ${APPLY ? "APPLY (เขียน)" : "dry-run (ไม่เขียน)"}${TENANT ? ` · ร้าน ${TENANT}` : " · ทุกร้านที่ยังมี PIN ตัวเปล่า"}`);
if (host.includes(PROD_HOST_MARK) && !PROD) {
  console.error(`🔴 หยุด! host เป็น production (${PROD_HOST_MARK}) — ต้องตั้ง HR_BACKFILL_PROD=1 ตาม runbook เท่านั้น`);
  process.exit(3);
}
if (typeof process.env.HR_PIN_PEPPER !== "string" || process.env.HR_PIN_PEPPER.length < 32) {
  console.error(`❌ ${SCRIPT}: ${T_NOCONF}`);
  process.exit(2);
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const { hashPin } = (await import("@/lib/modules/hr/pin")) as Any;
const P = prisma as Any;

type Emp = { id: string; name: string; active: boolean; pinCode: string | null; pinHash: string | null };
type Entry = { tenantId: string; plain: number; duplicates: string[]; invalid: string[]; hashed: number; toUpdate: number; toUpdateInactive: number; changed: number };

const PIN_RE = /^\d{4,6}$/; // กติกาเดียวกับ hr/pin.ts — ตัวที่ไม่ผ่านไม่ถูก hash (ยืนยันไม่ได้อยู่แล้ว)
const initial = (name: string) => [...String(name ?? "").trim()][0] ?? "?";

/** แผนของร้านหนึ่ง (ไม่เขียน) — คำนวณจากแถวที่อ่านใน tx เดียวกับที่จะเขียน */
function plan(tenantId: string, rows: Emp[]) {
  const plainAll = rows.filter((r) => r.pinCode !== null && r.pinHash === null);
  const invalidRows = plainAll.filter((r) => !PIN_RE.test(r.pinCode!)); // ล้างทิ้ง (เหมือนซ้ำ) — ห้ามพิมพ์ค่า
  const plainRows = plainAll.filter((r) => PIN_RE.test(r.pinCode!));
  const residue = rows.filter((r) => r.pinCode !== null && r.pinHash !== null); // มีทั้งคู่ — ลบตัวเปล่า
  const hashedRows = rows.filter((r) => r.pinHash !== null);
  const hashOf = new Map(plainRows.map((r) => [r.id, String(hashPin(tenantId, r.pinCode!))]));
  // กลุ่มของคนที่ยังทำงาน: hash เดียวกัน (ตัวเปล่าที่จะ hash + ที่มี hash แล้ว) > 1 ⇒ ตัวเปล่าในกลุ่มนั้น = ซ้ำ
  const group = new Map<string, number>();
  for (const r of plainRows) if (r.active) group.set(hashOf.get(r.id)!, (group.get(hashOf.get(r.id)!) ?? 0) + 1);
  for (const r of hashedRows) if (r.active && group.has(r.pinHash!)) group.set(r.pinHash!, group.get(r.pinHash!)! + 1);
  const dups = plainRows.filter((r) => r.active && (group.get(hashOf.get(r.id)!) ?? 0) > 1);
  const dupIds = new Set(dups.map((r) => r.id));
  const toHash = plainRows.filter((r) => !dupIds.has(r.id));
  return { plainRows, invalidRows, residue, hashedRows, hashOf, dups, toHash };
}

// ── ร้านที่ต้องดู ──
const tenantIds: string[] = TENANT
  ? [TENANT]
  : ((await P.hrEmployee.findMany({ where: { pinCode: { not: null } }, select: { tenantId: true }, distinct: ["tenantId"], orderBy: { tenantId: "asc" } })) as Any[]).map((r: Any) => r.tenantId as string);

const out: Entry[] = [];
let failed = 0;
for (const tenantId of tenantIds) {
  try {
    const entry = await P.$transaction(
      async (tx: Any) => {
        // ล็อกต่อร้าน — รันซ้อนกัน 2 ตัวต่อคิวกัน (ไม่นับซ้ำ)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr-pin-backfill:${tenantId}`}, 0))`;
        const rows = (await tx.hrEmployee.findMany({
          where: { tenantId },
          select: { id: true, name: true, active: true, pinCode: true, pinHash: true },
          orderBy: { createdAt: "asc" },
        })) as Emp[];
        const p = plan(tenantId, rows);
        const e: Entry = {
          tenantId,
          plain: p.plainRows.length + p.invalidRows.length + p.residue.length,
          duplicates: p.dups.map((r) => r.id),
          invalid: p.invalidRows.map((r) => r.id),
          hashed: p.hashedRows.length,
          toUpdate: p.toHash.length,
          toUpdateInactive: p.toHash.filter((r) => !r.active).length,
          changed: 0,
        };
        console.log(
          `ร้าน ${tenantId} · PIN ตัวเปล่า ${e.plain} · ซ้ำ ${e.duplicates.length} · รูปแบบผิด ${e.invalid.length} · มี hash แล้ว ${e.hashed} · จะ hash ${e.toUpdate} (พ้นสภาพ ${e.toUpdateInactive})${p.residue.length ? ` · ตัวเปล่าค้างคู่ hash ${p.residue.length}` : ""}`,
        );
        for (const r of p.dups) console.log(`   ซ้ำ → ต้องตั้ง PIN ใหม่: ${r.id} (${initial(r.name)}…)`);
        for (const r of p.invalidRows) console.log(`   รูปแบบผิด → ต้องตั้ง PIN ใหม่: ${r.id} (${initial(r.name)}…)`);
        if (!APPLY) return e;
        const now = new Date();
        let changed = 0;
        for (const r of p.toHash) {
          const u = await tx.hrEmployee.updateMany({ where: { id: r.id, tenantId, pinCode: r.pinCode, pinHash: null }, data: { pinHash: p.hashOf.get(r.id), pinSetAt: now, pinCode: null } });
          changed += u.count;
        }
        for (const r of [...p.dups, ...p.invalidRows]) {
          const u = await tx.hrEmployee.updateMany({ where: { id: r.id, tenantId, pinCode: r.pinCode, pinHash: null }, data: { pinCode: null, pinHash: null, pinSetAt: null } });
          changed += u.count;
        }
        for (const r of p.residue) {
          const u = await tx.hrEmployee.updateMany({ where: { id: r.id, tenantId, pinHash: { not: null }, pinCode: { not: null } }, data: { pinCode: null } });
          changed += u.count;
        }
        e.changed = changed;
        if (changed > 0) {
          await tx.auditLog.create({
            data: {
              tenantId,
              actorType: "SYSTEM",
              action: "hr.pin.backfill",
              targetType: "Tenant",
              targetId: tenantId,
              before: { plain: e.plain, hashed: e.hashed },
              after: { hashedNow: p.toHash.length, inactiveHashed: e.toUpdateInactive, duplicatesCleared: p.dups.length, invalidCleared: p.invalidRows.length, residueCleared: p.residue.length, changed },
            },
          });
        }
        return e;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    out.push(entry);
  } catch (err) {
    failed++;
    const code = (err as { code?: unknown })?.code;
    console.error(`⚠ ร้าน ${tenantId}: ธุรกรรมย้อนทั้งก้อน (${code === "P2002" ? "มีคนตั้ง PIN ชนระหว่างรัน — รันใหม่ได้" : `ข้อผิดพลาด ${String(code ?? (err as Error)?.name ?? "?")}`})`);
  }
}

const sum = (k: "plain" | "hashed" | "toUpdate" | "changed") => out.reduce((a, e) => a + e[k], 0);
console.log(
  `\nสรุป ${out.length} ร้าน · PIN ตัวเปล่า ${sum("plain")} · ซ้ำ ${out.reduce((a, e) => a + e.duplicates.length, 0)} · รูปแบบผิด ${out.reduce((a, e) => a + e.invalid.length, 0)} · มี hash ${sum("hashed")} · จะ hash ${sum("toUpdate")} · เปลี่ยนจริง ${sum("changed")}${failed ? ` · ล้ม ${failed} ร้าน` : ""}${APPLY ? "" : " (dry-run — ไม่ได้เขียน · ใส่ --apply เพื่อเขียน)"}`,
);
console.log(`JSON_SUMMARY ${JSON.stringify({ mode: APPLY ? "apply" : "dry-run", host, failed, tenants: out })}`);
await P.$disconnect().catch(() => {});
process.exit(failed ? 1 : 0);
