// pos-shift-required-off.mts — POS P6.1 CD-P61-P8 · ขั้นข้อมูล P1.9 (OQ-P19-1 = (a)) ก่อนเปิดใช้บน production
//
// ทำไม: `settings.pos.shift.required.register` ไม่ตั้ง ⇒ ค่าปริยาย = ธงหน้าขายใหม่ (`parseShiftSettings` · src/lib/modules/pos/shift.ts:48-55)
//   ⇒ ระบบ POS ที่ `registerV2 = true` อยู่แล้วตอน deploy จะถูก "บังคับเปิดกะก่อนขาย" ทันทีหลัง deploy โดยร้านไม่ได้เลือก
//   มติ (a): ระบบเหล่านั้นตั้ง `required.register = false` ไว้ก่อน แล้วร้านเลือกเปิดเองในตั้งค่า › ทั่วไป
// ทำอะไร: ทุกระบบ POS (type POS) ของร้านที่เลือก ที่ `settings.pos.registerV2 = true` **และยังไม่มีคีย์** `settings.pos.shift.required.register`
//   (ค่าที่ร้านตั้งเองแล้ว — true หรือ false — ไม่แตะ) → เขียน `required.register = false` เท่านั้น
//   • ธุรกรรมต่อระบบ: ล็อกแถว AppSystem FOR UPDATE → ตรวจเงื่อนไขซ้ำในล็อก → jsonb_set เฉพาะ settings.pos.shift.required (คีย์อื่นไม่ถูกแตะ)
//     → AuditLog `pos.settings.updated` ผู้กระทำ SYSTEM (before/after + source) ในธุรกรรมเดียวกัน
//   • รันซ้ำได้ (idempotent): รอบสองเจอ 0 ระบบ (คีย์มีแล้ว) · ไม่มีระบบใดเข้าเงื่อนไข = ไม่เขียนอะไร
//   • ถอยกลับ: ร้านเปิด "บังคับเปิดกะ" เองในตั้งค่า › ทั่วไป (หรือ updatePosGeneralSettings shift.requiredRegister=true)
//
// วิธีรัน (ด่าน host = scripts/lib/pos-prod-writer-guard.mts — เหมือน pos-backfill-catalog ทุกข้อ · CD-P61-R3)
//   QC4  : bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-shift-required-off.mts [--tenant=<id|slug>]… --dry-run
//   PROD : (⛔ เจ้าของ · runbook §8.5 · worktree สะอาดที่ SHA ของ PR) ไม่โหลดไฟล์ env ใด ๆ — URL ส่งมาเองหลัง iso.sh
//          bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-shift-required-off.mts --all --dry-run
//          … เดียวกันแต่ไม่มี --dry-run = เขียนจริง (ต้องมี dry-run ของ host + ชุดร้านเดียวกันภายใน 24 ชม.)
// ผลที่คาด: `[target] … role=prod host=<mark>…` · `ระบบ POS ที่ registerV2=true N · ตั้งค่าเองแล้ว N · จะตั้ง/ตั้ง false N` + รายการระบบ · รอบสอง 0
// exit: 0 = ผ่าน · 1 = มีระบบล้ม · 2 = ใช้ผิด / ไม่มี DATABASE_URL · 4 = ด่านปฏิเสธ · บรรทัดท้าย = `JSON_SUMMARY {...}`
import { dryRunMarkerPath, guardWriterOrExit, hasRecentDryRun, parseWriterArgv, writeDryRunMarker } from "./lib/pos-prod-writer-guard.mjs";

const SCRIPT = "pos-shift-required-off";
const AUDIT_ACTION = "pos.settings.updated"; // = POS_SETTINGS_AUDIT (settings-general.ts:57) — ประวัติค่าตั้งของหน้า ตั้งค่า แสดงแถวนี้ด้วย
const wargs = parseWriterArgv(process.argv.slice(2));
if (wargs.verify) {
  console.error(`🔴 ${SCRIPT}: ไม่มีโหมด --verify — ใช้ --dry-run (อ่านอย่างเดียว)`);
  process.exit(2);
}
const target = guardWriterOrExit(SCRIPT, wargs);
const markerPath = dryRunMarkerPath(SCRIPT, target.label, wargs);
if (target.prodLike && !wargs.dryRun && !hasRecentDryRun(markerPath)) {
  console.error(`🔴 หยุด! ${SCRIPT}: ${target.role} ต้องรัน --dry-run ด้วยชุด --tenant เดียวกันก่อน (ภายใน 24 ชม.) — ไม่พบ ${markerPath}`);
  process.exit(4);
}

const { prisma } = await import("@/lib/core/db");

let tenantIds: string[] | null = null; // null = ทุกร้าน (QC4 ไม่ระบุ · prod --all)
if (wargs.tenants.length) {
  const rows = await prisma.tenant.findMany({ where: { OR: [{ id: { in: wargs.tenants } }, { slug: { in: wargs.tenants } }] }, select: { id: true, slug: true } });
  const missing = wargs.tenants.filter((t) => !rows.some((r) => r.id === t || r.slug === t));
  if (missing.length) {
    console.error(`🔴 ${SCRIPT}: ไม่พบร้าน ${missing.join(", ")}`);
    await prisma.$disconnect();
    process.exit(2);
  }
  tenantIds = rows.map((r) => r.id);
}

type Row = { id: string; tenantId: string; name: string; active: boolean; has_key: boolean };
// อ่านอย่างเดียว: ระบบ POS ที่ registerV2 = true (เทียบ jsonb true ตรงตัว = ตัวอ่าน posRegisterV2On ที่ต้อง === true)
const candidates = await prisma.$queryRaw<Row[]>`
  SELECT id, "tenantId", name, active,
         (jsonb_typeof("settings"->'pos'->'shift'->'required'->'register') = 'boolean') AS has_key
    FROM "AppSystem"
   WHERE type = 'POS'
     AND ("settings"->'pos'->'registerV2') = 'true'::jsonb
     AND (${tenantIds === null}::boolean OR "tenantId" = ANY(${tenantIds ?? []}::text[]))
   ORDER BY "tenantId", id`;
const todo = candidates.filter((r) => !r.has_key);
const already = candidates.length - todo.length;

const done: string[] = [];
const failed: { systemId: string; error: string }[] = [];
const skippedRace: string[] = [];
if (!wargs.dryRun) {
  for (const r of todo) {
    try {
      const wrote = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ v2: boolean; has_key: boolean }[]>`
          SELECT (("settings"->'pos'->'registerV2') = 'true'::jsonb) AS v2,
                 (jsonb_typeof("settings"->'pos'->'shift'->'required'->'register') = 'boolean') AS has_key
            FROM "AppSystem" WHERE id = ${r.id} AND "tenantId" = ${r.tenantId} AND type = 'POS' FOR UPDATE`;
        const l = locked[0];
        if (!l || !l.v2 || l.has_key) return false; // เปลี่ยนระหว่างทาง (ร้านตั้งเอง / ปิด registerV2) = ไม่แตะ
        // เฉพาะ settings.pos.shift.required — คีย์อื่นของ settings/pos/shift คงเดิมทุกไบต์ (pos เป็น object แน่นอนเพราะ registerV2 = true)
        await tx.$executeRaw`
          UPDATE "AppSystem"
             SET "settings" = jsonb_set(
                   "settings", '{pos,shift}',
                   (CASE WHEN jsonb_typeof("settings"->'pos'->'shift') = 'object' THEN "settings"->'pos'->'shift' ELSE '{}'::jsonb END)
                   || jsonb_build_object('required',
                        (CASE WHEN jsonb_typeof("settings"->'pos'->'shift'->'required') = 'object' THEN "settings"->'pos'->'shift'->'required' ELSE '{}'::jsonb END)
                        || '{"register": false}'::jsonb),
                   true),
                 "updatedAt" = now()
           WHERE id = ${r.id} AND "tenantId" = ${r.tenantId} AND type = 'POS'`;
        await tx.auditLog.create({
          data: {
            tenantId: r.tenantId,
            actorType: "SYSTEM",
            actorId: null,
            action: AUDIT_ACTION,
            targetType: "AppSystem",
            targetId: r.id,
            before: { section: "general", shift: { requiredRegister: true }, note: "ค่าปริยายตามธง registerV2 (ยังไม่ตั้งคีย์)" },
            after: { section: "general", shift: { requiredRegister: false }, source: "scripts/pos-shift-required-off.mts (P6.1 · OQ-P19-1 a)" },
          },
        });
        return true;
      });
      (wrote ? done : skippedRace).push(r.id);
    } catch (e) {
      failed.push({ systemId: r.id, error: e instanceof Error ? (e.message.split("\n").filter(Boolean).slice(-1)[0] ?? e.name) : String(e) });
    }
  }
}
await prisma.$disconnect();

const verb = wargs.dryRun ? "จะตั้ง" : "ตั้ง";
console.log(`ระบบ POS ที่ registerV2=true ${candidates.length} · ตั้งค่า required.register เองแล้ว ${already} (ไม่แตะ) · ${verb} false ${wargs.dryRun ? todo.length : done.length}${skippedRace.length ? ` · เปลี่ยนระหว่างทาง (ข้าม) ${skippedRace.length}` : ""}`);
for (const r of todo.slice(0, 50)) console.log(`  ${wargs.dryRun ? "→" : done.includes(r.id) ? "✓" : "·"} ร้าน ${r.tenantId} · ระบบ ${r.id} "${r.name}"${r.active ? "" : " (ปิดใช้งาน)"}`);
if (todo.length > 50) console.log(`  … อีก ${todo.length - 50} ระบบ (ดู JSON_SUMMARY)`);
for (const f of failed) console.error(`🔴 ระบบ ${f.systemId} ล้ม (ธุรกรรมย้อนทั้งก้อน): ${f.error}`);
if (target.prodLike && wargs.dryRun) {
  writeDryRunMarker(markerPath, { host: target.label, tenants: wargs.tenants, all: wargs.all, todo: todo.length });
  console.log(`บันทึก dry-run ไว้ที่ ${markerPath} (รันจริงได้ภายใน 24 ชม.)`);
}
console.log(
  `JSON_SUMMARY ${JSON.stringify({ suite: SCRIPT, role: target.role, host: target.label, dryRun: wargs.dryRun, registerV2On: candidates.length, alreadySet: already, todo: todo.length, written: done.length, skippedRace: skippedRace.length, failed, systems: todo.map((r) => r.id) })}`,
);
process.exit(failed.length ? 1 : 0);
