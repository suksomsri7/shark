// QC — Help ผ่าน AI session (feedback เจ้าของ 23 ก.ค. — แนวคิดใหม่แทน Help Center) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
//   src/lib/support/service.ts เพิ่ม openCaseFromAi(ctx, {userId, conversationId, subject, body}) → {id, caseNo}
//     — สร้าง SupportCase ผูก conversationId (running caseNo เดิม) + SupportMessage แรกฝั่ง SHOP
//   src/lib/platform/support.ts ตอบเคสฝั่งแอดมิน: ถ้า case มี conversationId → append AiMessage ASSISTANT
//     "🛟 ทีมงาน: <body>" เข้าห้องเดิม + touch AiConversation.updatedAt (unread เด้งในแอปเอง)
//   src/lib/ai/tools.ts มี tool "support_open_case" (AI เรียกเมื่อ user แจ้งปัญหา/ทำแทนไม่ได้)
//   web: Topbar ไม่มีปุ่มศูนย์ช่วยเหลือ · NavDrawer ไม่มีปุ่ม ✕
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const dyn = async (p: string): Promise<Record<string, any> | null> => { try { return (await import(p)) as unknown as Record<string, any>; } catch { return null; } };

const ts = Date.now();
const tids: string[] = [];
try {
  const t = await prisma.tenant.create({ data: { name: "QC HELP-AI", slug: `qc-ha-${ts}` } }); tids.push(t.id);
  const ctx = { tenantId: t.id };
  const conv = await prisma.aiConversation.create({ data: { tenantId: t.id, title: "แจ้งปัญหาเครื่องพิมพ์", lastReadAt: new Date() } });

  // ── 1. openCaseFromAi ──
  const svc = ((await dyn("@/lib/support/service")) ?? {}) as { openCaseFromAi?: (...a: any[]) => Promise<{ id: string; caseNo: number }> };
  if (typeof svc.openCaseFromAi !== "function") chk("HA-1.0", "มี openCaseFromAi ใน support/service", false, "มี", "ยังไม่สร้าง");
  else {
    const c = await svc.openCaseFromAi(ctx, { userId: "u-qc", conversationId: conv.id, subject: "เครื่องพิมพ์ใบเสร็จไม่ทำงาน", body: "user แจ้งผ่าน AI: กดพิมพ์แล้วเงียบ" });
    const row = await prisma.supportCase.findUnique({ where: { id: c.id } });
    chk("HA-1.1", "เปิดเคสผูก conversationId + caseNo ≥ 1", row?.conversationId === conv.id && (row?.caseNo ?? 0) >= 1, "ผูกครบ", JSON.stringify({ cid: row?.conversationId === conv.id, no: row?.caseNo }));
    const msg = await prisma.supportMessage.findFirst({ where: { caseId: c.id } });
    chk("HA-1.2", "ข้อความแรกฝั่ง SHOP เก็บรายละเอียด", msg?.authorSide === "SHOP" && (msg?.body ?? "").length > 0, "มี", String(msg?.body).slice(0, 60));

    // ── 2. แอดมินตอบ → bridge กลับห้องเดิม ──
    const plat = ((await dyn("@/lib/platform/support")) ?? {}) as { [k: string]: (...a: any[]) => Promise<any> };
    const replyFn = plat.addPlatformMessage;
    if (typeof replyFn !== "function") chk("HA-2.0", "มี addPlatformMessage ใน platform/support", false, "มี", "หาไม่เจอ");
    else {
      const before = await prisma.aiConversation.findUnique({ where: { id: conv.id } });
      await replyFn({ id: "qc-admin", email: "qc@qc.local", role: "SUPPORT" }, c.id, "ทีมงานแก้ให้แล้วครับ ลองพิมพ์อีกครั้ง");
      const bridged = await prisma.aiMessage.findFirst({ where: { tenantId: t.id, conversationId: conv.id, role: "ASSISTANT" }, orderBy: { createdAt: "desc" } });
      chk("HA-2.1", "ตอบเคส → มี AiMessage ASSISTANT เข้าห้องเดิม (มีคำตอบทีมงาน)", !!bridged && bridged.content.includes("ทีมงาน"), "มี", String(bridged?.content).slice(0, 60));
      const after = await prisma.aiConversation.findUnique({ where: { id: conv.id } });
      chk("HA-2.2", "updatedAt ถูก touch (ห้องเด้งบนสุด)", !!after && !!before && after.updatedAt > before.updatedAt, "ใหม่กว่า", "?");
      const mconv = ((await dyn("@/lib/mobile/conversations")) ?? {}) as { listConversations?: (c: any) => Promise<{ id: string; unread: boolean }[]> };
      const list = mconv.listConversations ? await mconv.listConversations(ctx) : [];
      chk("HA-2.3", "แอปเห็น unread=true (session สีต่าง — สัญญาเจ้าของ)", list.find((r) => r.id === conv.id)?.unread === true, "true", JSON.stringify(list.find((r) => r.id === conv.id)));
    }
  }

  // ── 3. AI tool ──
  const tools = ((await dyn("@/lib/ai/tools")) ?? {}) as Record<string, unknown>;
  const toolsStr = JSON.stringify(Object.values(tools).map((v) => (typeof v === "object" ? v : String(v)))).slice(0, 200000);
  chk("HA-3.1", "มี tool support_open_case ใน registry", toolsStr.includes("support_open_case") || readFileSync("src/lib/ai/tools.ts", "utf8").includes("support_open_case"), "มี", "ไม่พบ");
  const toolsSrc = readFileSync("src/lib/ai/tools.ts", "utf8");
  chk("HA-3.2", "คำตอบรับตามสคริปต์เจ้าของ (รับทราบ+อย่าปิด session)", /อย่าปิด/.test(toolsSrc) && /รับทราบ/.test(toolsSrc), "มี", "ไม่พบ", "MAJOR");

  // ── 4. web static ──
  const topbar = readFileSync("src/components/app-shell/Topbar.tsx", "utf8");
  chk("HA-4.1", "Topbar ไม่มีปุ่มศูนย์ช่วยเหลือ (เช็ค prop onHelp/badge จริง ไม่นับ comment)", !/onHelp|helpUnread/.test(topbar), "ไม่มี", "ยังอยู่");
  const nav = readFileSync("src/components/app-shell/NavDrawer.tsx", "utf8");
  chk("HA-4.2", "NavDrawer ไม่มีปุ่ม ✕ (เช็ค JSX จริง ไม่นับ comment)", !/>\s*✕\s*</.test(nav) && !/aria-label="ปิด/.test(nav), "ไม่มี", "ยังอยู่");
  chk("HA-4.3", "NavDrawer: dropdown กิจการ + ปุ่มเพิ่มกิจการ (คำสั่งเจ้าของ)", nav.includes("เพิ่มกิจการ") && /memberships/.test(nav), "มี", "ไม่ครบ");
  chk("HA-4.4", "NavDrawer: ปุ่มออกจากระบบกลับมา (ห้ามซ่อนใน app — intercept ฝั่ง native จัดการแล้ว)", nav.includes("ออกจากระบบ") && !/inApp\s*&&[^}]*logout|!inApp[^}]*ออกจากระบบ/i.test(nav), "มี+ไม่ซ่อน", "?");
  const tenantAct = ((): string => { try { return readFileSync("src/lib/actions/tenant.ts", "utf8"); } catch { return ""; } })();
  chk("HA-4.5", "switchTenantAction: ตรวจ membership + redirect /app?switched= (ให้ native sync)", tenantAct.includes("switched=") && /membership/i.test(tenantAct), "มี", "ไม่พบ");
} finally {
  for (const tid of tids) {
    for (const m of ["aiMessage", "aiConversation", "supportMessage", "supportCase", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-mobile-help: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
