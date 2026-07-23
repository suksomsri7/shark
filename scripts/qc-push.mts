// QC — Push notification ฝั่ง server (Phase 2 แอป — ledger/MOBILE_PLAN.md) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น · transport ฉีดได้ ห้ามยิง Expo จริงในข้อสอบ
//
// สัญญา src/lib/core/push.ts:
//   sendPushToTenant(tenantId, {title, body, data?}, deps?: {post?: (payloads: unknown[]) => Promise<unknown[]>}) → {sent: number}
//     — อ่าน PushDevice ของ tenant (chunk ≤100/ครั้ง) · payload: {to, title, body, data?, sound: "default"}
//     — receipt error DeviceNotRegistered → ลบ PushDevice แถวนั้นทิ้ง (token ตาย)
//     — default post = fetch https://exp.host/--/api/v2/push/send · ห้าม throw ถ้าส่งพลาด (best-effort + OpsEvent)
// wiring (static): platform/support.ts (ทีมงานตอบเคส) + ai/proactive.ts + ai/scheduled.ts เรียก sendPushToTenant
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const dyn = async (p: string): Promise<Record<string, any> | null> => { try { return (await import(p)) as unknown as Record<string, any>; } catch { return null; } };

const ts = Date.now();
const tids: string[] = []; const uids: string[] = [];
try {
  const t1 = await prisma.tenant.create({ data: { name: "QC PUSH", slug: `qc-ph1-${ts}` } }); tids.push(t1.id);
  const t2 = await prisma.tenant.create({ data: { name: "QC PUSH2", slug: `qc-ph2-${ts}` } }); tids.push(t2.id);
  const u = await prisma.user.create({ data: { email: `qc-ph-${ts}@qc.local` } }); uids.push(u.id);
  const tokA = `ExponentPushToken[qc-a-${ts}]`;
  const tokB = `ExponentPushToken[qc-b-${ts}]`;
  const tokC = `ExponentPushToken[qc-c-${ts}]`;
  await prisma.pushDevice.createMany({ data: [
    { userId: u.id, tenantId: t1.id, expoToken: tokA, platform: "ios" },
    { userId: u.id, tenantId: t1.id, expoToken: tokB, platform: "ios" },
    { userId: u.id, tenantId: t2.id, expoToken: tokC, platform: "android" },
  ] });

  const lib = ((await dyn("@/lib/core/push")) ?? {}) as { sendPushToTenant?: (...a: any[]) => Promise<{ sent: number }> };
  if (typeof lib.sendPushToTenant !== "function") chk("PU-1.0", "มี sendPushToTenant ใน core/push", false, "มี", "ยังไม่สร้าง");
  else {
    // ── ส่งปกติ: เฉพาะเครื่องของ tenant นั้น ──
    const captured: unknown[][] = [];
    const okPost = async (payloads: unknown[]) => { captured.push(payloads); return payloads.map(() => ({ status: "ok" })); };
    const r1 = await lib.sendPushToTenant(t1.id, { title: "ทีมงานตอบแล้ว", body: "เคส #1 มีคำตอบ", data: { conversationId: "c1" } }, { post: okPost });
    const flat = captured.flat() as { to?: string; title?: string; body?: string; sound?: string; data?: { conversationId?: string } }[];
    chk("PU-1.1", "ส่งครบเฉพาะเครื่องของ tenant (2 ไม่ปน tenant อื่น)", r1.sent === 2 && flat.length === 2 && flat.every((p) => [tokA, tokB].includes(p.to ?? "")), "2", JSON.stringify({ sent: r1.sent, to: flat.map((p) => p.to) }).slice(0, 120));
    chk("PU-1.2", "payload ครบ title/body/data/sound", flat.every((p) => p.title === "ทีมงานตอบแล้ว" && !!p.body && p.sound === "default" && p.data?.conversationId === "c1"), "ครบ", JSON.stringify(flat[0]).slice(0, 120));

    // ── token ตาย (DeviceNotRegistered) → ลบแถวทิ้ง ──
    const deadPost = async (payloads: unknown[]) =>
      (payloads as { to: string }[]).map((p) => p.to === tokA ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" });
    await lib.sendPushToTenant(t1.id, { title: "x", body: "y" }, { post: deadPost });
    const left = await prisma.pushDevice.findMany({ where: { tenantId: t1.id } });
    chk("PU-1.3", "DeviceNotRegistered → ลบ PushDevice ทิ้ง (เหลือ 1)", left.length === 1 && left[0]?.expoToken === tokB, "1 (tokB)", JSON.stringify(left.map((d) => d.expoToken)));

    // ── ไม่มีเครื่อง → sent 0 ไม่พัง ──
    const r0 = await lib.sendPushToTenant("tenant-ไม่มีจริง", { title: "x", body: "y" }, { post: okPost });
    chk("PU-1.4", "tenant ไม่มีเครื่อง → sent 0 ไม่ throw", r0.sent === 0, "0", String(r0.sent));
  }

  // ── wiring ──
  const sup = readFileSync("src/lib/platform/support.ts", "utf8");
  chk("PU-2.1", "ทีมงานตอบเคส (addPlatformMessage) → push เข้าเครื่อง", sup.includes("sendPushToTenant"), "มี", "ไม่พบ");
  const pro = readFileSync("src/lib/ai/proactive.ts", "utf8");
  chk("PU-2.2", "proactive nudge → push", pro.includes("sendPushToTenant"), "มี", "ไม่พบ");
  const sch = readFileSync("src/lib/ai/scheduled.ts", "utf8");
  chk("PU-2.3", "งานประจำ AI เสร็จ → push", sch.includes("sendPushToTenant"), "มี", "ไม่พบ");
} finally {
  for (const uid of uids) { await prisma.pushDevice.deleteMany({ where: { userId: uid } }); await prisma.user.deleteMany({ where: { id: uid } }); }
  for (const tid of tids) { await prisma.tenant.deleteMany({ where: { id: tid } }); }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-push: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
