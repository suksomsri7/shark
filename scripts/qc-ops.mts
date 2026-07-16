// QC — Observability (WO-0041) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (Vercel build ตรวจไฟล์นี้ก่อนโค้ดเกิด)
//
// สัญญา:
// src/lib/core/ops.ts (logger กลาง — prisma ตรง เพราะ OpsEvent เป็น platform axis):
//   logOps(level: "ERROR"|"WARN"|"INFO", source: string, message: string, opts?: { detail?: string; tenantId?: string },
//          deps?: { sendAlert?: (subject: string, body: string) => Promise<void>; now?: Date }): Promise<void>
//     — เขียน OpsEvent เสมอ · **ห้าม throw ทุกกรณี** (logger พังห้ามพางานหลักพัง — catch หมด)
//     — level ERROR → ส่ง alert ผ่าน deps.sendAlert (ของจริง: sendEmail ไป OPS_ALERT_EMAIL หรือ admin) แบบ throttle:
//       OpsAlertState ต่อ source — ส่งได้อีกเมื่อพ้น 60 นาทีจาก lastAlertAt (ใช้ deps.now ถ้าฉีด)
//   healthSnapshot(): Promise<{ db: boolean; outboxPending: number; opsErrors24h: number }>
// src/app/api/health/route.ts — GET สาธารณะ: {ok, db, outboxPending, at} (ไม่มีข้อมูลลับ) · db พัง → ok:false + 503
// src/lib/platform/ops.ts — listOpsEvents(filter {level?, take?}) ใหม่→เก่า (backoffice ใช้)
// หน้า backoffice/system-health: health + OpsEvents ล่าสุด + ปุ่ม filter level — requireBackoffice
// จุดเกาะ (Builder ทำ): cron tick + outbox drain error + AI provider error → logOps("ERROR"/"WARN", ...)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const SRC = `qc-src-${Date.now()}`;

try {
  const ops = (await import("@/lib/core/ops" as string).catch(() => null)) as {
    logOps: (l: string, s: string, m: string, o?: Record<string, unknown>, d?: Record<string, unknown>) => Promise<void>;
    healthSnapshot: () => Promise<{ db: boolean; outboxPending: number; opsErrors24h: number }>;
  } | null;
  const plat = (await import("@/lib/platform/ops" as string).catch(() => null)) as {
    listOpsEvents: (f?: Record<string, unknown>) => Promise<{ id: string; level: string; source: string }[]>;
  } | null;
  if (!ops || !plat) { chk("OP-0", "มี core/ops.ts + platform/ops.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const sent: string[] = [];
    const sendAlert = async (subject: string) => { sent.push(subject); };
    const T0 = new Date("2026-07-16T10:00:00Z");

    await ops.logOps("INFO", SRC, "เริ่มทดสอบ", {}, { sendAlert, now: T0 });
    chk("OP-1.1", "INFO → เขียน OpsEvent + ไม่ alert", (await prisma.opsEvent.count({ where: { source: SRC } })) === 1 && sent.length === 0, "1/0", "?");

    await ops.logOps("ERROR", SRC, "พังครั้งแรก", { detail: "stack..." }, { sendAlert, now: T0 });
    chk("OP-2.1", "ERROR แรก → alert 1 ฉบับ", sent.length === 1, "1", String(sent.length));
    await ops.logOps("ERROR", SRC, "พังซ้ำใน 60 นาที", {}, { sendAlert, now: new Date(T0.getTime() + 30 * 60000) });
    chk("OP-2.2", "ERROR ซ้ำใน 60 นาที → throttle (ยัง 1)", sent.length === 1 && (await prisma.opsEvent.count({ where: { source: SRC, level: "ERROR" } })) === 2, "1/2", `${sent.length}`);
    await ops.logOps("ERROR", SRC, "พังหลังพ้นหน้าต่าง", {}, { sendAlert, now: new Date(T0.getTime() + 61 * 60000) });
    chk("OP-2.3", "พ้น 60 นาที → alert อีกฉบับ (2)", sent.length === 2, "2", String(sent.length));

    // logger ห้าม throw แม้ input เพี้ยน
    let threw = false;
    try { await ops.logOps("ERROR", SRC, "x".repeat(100000), {}, { sendAlert: async () => { throw new Error("mail down"); }, now: new Date(T0.getTime() + 200 * 60000) }); } catch { threw = true; }
    chk("OP-3.1", "sendAlert พัง → logOps ไม่ throw", threw === false, "ไม่ throw", String(threw));

    const h = await ops.healthSnapshot();
    chk("OP-4.1", "healthSnapshot: db true + ตัวเลขครบ", h.db === true && typeof h.outboxPending === "number" && typeof h.opsErrors24h === "number", "ครบ", JSON.stringify(h));

    const list = await plat.listOpsEvents({ level: "ERROR", take: 10 });
    chk("OP-5.1", "platform listOpsEvents filter ERROR เห็นของที่ log", list.some((e) => e.source === SRC && e.level === "ERROR"), "เห็น", String(list.length));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.opsEvent.deleteMany({ where: { source: SRC } }));
  await d(() => prisma.opsAlertState.deleteMany({ where: { source: SRC } }));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Observability =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
