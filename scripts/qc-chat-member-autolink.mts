// QC — เชื่อมระบบสมาชิกเข้ากับแชทอัตโนมัติ (เจ้าของเคาะ 31 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ร้านมีระบบสมาชิก **ชุดเดียว** → เชื่อมให้เอง ไม่ต้องให้เจ้าของมาตั้ง (ไม่มีอะไรให้เลือกอยู่แล้ว)
// [2] 🔴 มี **2 ชุดขึ้นไป** → ห้ามเดา (ร้านตั้งใจแยกฐานลูกค้า — เชื่อมผิดชุดแก้ทีหลังยาก)
// [3] ยังไม่มีระบบสมาชิก → ไม่เชื่อม · สร้างทีหลังแล้วต้องเชื่อมย้อนให้เอง
// [4] 🔴 เจ้าของเลือกเอง "ไม่เชื่อม" → ระบบห้ามไปเชื่อมทับ (ต้องแยก "ยังไม่เคยตั้ง" กับ "ตั้งใจปิด" ออก)
// [5] ไม่รั่วข้ามร้าน: ระบบแชทของร้านอื่นสั่งเชื่อมไม่ได้
// [6] ลูกค้าทักเข้ามาแล้วผูกเป็นสมาชิกได้เลย โดยไม่ต้องรอเจ้าของเปิดหน้าตั้งค่า
//
// รัน: pnpm exec tsx scripts/qc-chat-member-autolink.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { readFileSync, existsSync } = await import("node:fs");
const chat = await import("@/lib/modules/chat/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; sev: Sev }[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const tenants: string[] = [];
const mkTenant = async (name: string) => {
  const t = await prisma.tenant.create({ data: { name, slug: `qc-cml-${name}-${Date.now()}` } });
  tenants.push(t.id);
  return t.id;
};
const mkSystem = (tenantId: string, type: "CHAT" | "MEMBER", name: string) =>
  prisma.appSystem.create({ data: { tenantId, type, name } });

try {
  // ── [1] ชุดเดียว → เชื่อมให้เอง ──
  console.log("── ร้านมีระบบสมาชิกชุดเดียว ──");
  const t1 = await mkTenant("one");
  const chat1 = await mkSystem(t1, "CHAT", "แชท");
  const mem1 = await mkSystem(t1, "MEMBER", "สมาชิก");
  const got1 = await chat.ensureMemberSystemLink(t1, chat1.id);
  chk("CM-1.1", "เชื่อมให้อัตโนมัติ", got1 === mem1.id, mem1.id.slice(-8), String(got1).slice(-8));
  chk("CM-1.2", "ค่าลง DB จริง",
    (await prisma.chatSetting.findUnique({ where: { systemId: chat1.id } }))?.memberSystemId === mem1.id,
    "ผูกแล้ว", "ไม่ผูก");
  chk("CM-1.3", "ไม่ปักว่า 'เจ้าของเลือกเอง' (ยังเปลี่ยนได้ และไม่หลอกว่าเขาตั้ง)",
    (await prisma.chatSetting.findUnique({ where: { systemId: chat1.id } }))?.memberSystemChosenAt === null,
    "null", "ถูกปัก");

  // ── [2] สองชุด → ห้ามเดา ──
  console.log("\n── ร้านมีระบบสมาชิกหลายชุด ──");
  const t2 = await mkTenant("two");
  const chat2 = await mkSystem(t2, "CHAT", "แชท");
  await mkSystem(t2, "MEMBER", "สมาชิกร้านตัดผม");
  await mkSystem(t2, "MEMBER", "สมาชิกสปา");
  chk("CM-2.1", "🔴 ไม่เชื่อมให้ — ต้องให้เจ้าของเลือกเอง",
    (await chat.ensureMemberSystemLink(t2, chat2.id)) === null, "null", "ดันเดาให้");

  // ── [3] ยังไม่มี → สร้างทีหลังแล้วเชื่อมย้อน ──
  console.log("\n── ยังไม่มีระบบสมาชิก ──");
  const t3 = await mkTenant("zero");
  const chat3 = await mkSystem(t3, "CHAT", "แชท");
  chk("CM-3.1", "ไม่มีให้เชื่อม → null", (await chat.ensureMemberSystemLink(t3, chat3.id)) === null, "null", "ไม่ null");
  const mem3 = await mkSystem(t3, "MEMBER", "สมาชิก");
  chk("CM-3.2", "สร้างระบบสมาชิกทีหลัง → เชื่อมย้อนให้เอง",
    (await chat.ensureMemberSystemLink(t3, chat3.id)) === mem3.id, "เชื่อมแล้ว", "ยังไม่เชื่อม");

  // ── [4] เจ้าของเลือก "ไม่เชื่อม" → ห้ามทับ ──
  console.log("\n── เจ้าของตั้งใจไม่เชื่อม ──");
  const t4 = await mkTenant("optout");
  const chat4 = await mkSystem(t4, "CHAT", "แชท");
  await mkSystem(t4, "MEMBER", "สมาชิก");
  await chat.setMemberSystem(t4, chat4.id, null); // เลือก "ไม่เชื่อม" ในหน้าเว็บ
  chk("CM-4.1", "🔴 ระบบไม่ไปเชื่อมทับสิ่งที่เจ้าของปิดไว้",
    (await chat.ensureMemberSystemLink(t4, chat4.id)) === null, "null", "ถูกเชื่อมทับ");
  chk("CM-4.2", "และของใน DB ยังเป็นไม่เชื่อมจริง",
    (await prisma.chatSetting.findUnique({ where: { systemId: chat4.id } }))?.memberSystemId === null,
    "null", "มีค่า");

  // ── [5] ไม่รั่วข้ามร้าน ──
  console.log("\n── กันข้ามร้าน ──");
  chk("CM-5.1", "ร้านอื่นสั่งเชื่อมระบบแชทของเราไม่ได้",
    (await chat.ensureMemberSystemLink(t2, chat3.id)) === null, "null", "ทำได้ (รั่ว)");

  // ── [6] จุดที่เรียกใช้ (static) ──
  console.log("\n── ถูกเรียกในเส้นทางจริง ──");
  const svc = read("src/lib/modules/chat/service.ts");
  chk("CM-6.1", "ลูกค้าทักเข้ามาแล้วเชื่อมได้เลย ไม่ต้องรอเจ้าของเปิดหน้าตั้งค่า",
    /maybeAutoLinkMember[\s\S]{0,400}ensureMemberSystemLink/.test(svc), "เรียกใน maybeAutoLinkMember", "ไม่เรียก");
  chk("CM-6.2", "หน้าเชื่อมช่องทางเรียกก่อนแสดงค่า",
    /ensureMemberSystemLink\(tenantId, systemId\)/.test(read("src/lib/modules/chat/ui.tsx")),
    "เรียก", "ไม่เรียก", "MAJOR");
} finally {
  for (const id of tenants) {
    await prisma.chatSetting.deleteMany({ where: { tenantId: id } }).catch(() => {});
    await prisma.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  console.log(`\n[cleanup] ลบร้านทดสอบ ${tenants.length} ร้าน`);
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: เชื่อมระบบสมาชิกอัตโนมัติ =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
