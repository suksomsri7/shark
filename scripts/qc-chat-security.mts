// QC7 Chat security harness (M9 rate limit · M10 CSPRNG token · M11 unit RBAC · M12 race lock)
// สร้าง tenant ทดสอบ → ขับ service/logic จริงกับ Neon → verify → ลบ test data
// รัน: pnpm exec tsx scripts/qc-chat-security.mts
// fail-before/pass-after: `git stash` แก้ M9-M12 แล้วรัน → เห็น FAIL (race 2 conv / IDOR leak / no limit) แล้ว unstash → PASS
process.loadEnvFile(".env");
try {
  process.loadEnvFile(".env.local");
} catch {}

import { readFileSync } from "node:fs";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const chat = await import("@/lib/modules/chat/service");
const { rateLimit, __resetRateLimit } = await import("@/lib/modules/chat/rate-limit");

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}

const tag = "QCCHAT-" + Date.now();
let tenantId = "";

try {
  // ── seed core ──
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: tag.toLowerCase() + "@qc.local", name: "QC" } });
  await prisma.membership.create({ data: { userId: u.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const unitA = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "A " + tag, slug: "a-" + tag.toLowerCase() } });
  const unitB = await prisma.businessUnit.create({ data: { tenantId, type: "BOOKING", name: "B " + tag, slug: "b-" + tag.toLowerCase() } });

  const sys = await system.createSystem(tenantId, "CHAT", "แชท " + tag);
  const conn = await chat.ensureWebchatConnection(tenantId, sys.id);
  console.log(`[seed] tenant ${tenantId} · system ${sys.id} · unitA/B + webchat conn OK\n`);

  // ─────────────── M12: race — 1 contact ทัก 10 ข้อความพร้อมกัน → 1 conversation, ไม่มีข้อความหาย ───────────────
  console.log("M12 race (advisory lock):");
  {
    const token = "web-race-" + Date.now();
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        chat.receiveWebchatInbound({
          connection: conn,
          guestToken: token,
          body: "ข้อความ " + i,
          clientMessageId: "cmid-" + i,
        }),
      ),
    );
    const allOk = results.every((r) => r.ok);
    const contact = await prisma.chatContact.findFirst({
      where: { systemId: sys.id, channelConnectionId: conn.id, externalUserId: token },
    });
    const convCount = contact
      ? await prisma.chatConversation.count({ where: { systemId: sys.id, contactId: contact.id } })
      : -1;
    const msgCount = contact
      ? await prisma.chatMessage.count({
          where: { systemId: sys.id, conversation: { contactId: contact.id } },
        })
      : -1;
    assert("10 ข้อความพร้อมกันสำเร็จหมด", allOk, JSON.stringify(results.filter((r) => !r.ok)));
    assert("สร้าง conversation เดียว (ไม่ race ซ้ำ)", convCount === 1, "convCount=" + convCount);
    assert("ข้อความครบ 10 ไม่หาย", msgCount === N, "msgCount=" + msgCount);
  }

  // ─────────────── M11: unit RBAC — staff unitA ห้ามเห็น/ตอบ thread unitB ───────────────
  console.log("\nM11 unit RBAC (IDOR):");
  {
    const mkConvOnUnit = async (label: string, unitId: string | null) => {
      const c = await prisma.chatContact.create({
        data: { tenantId, systemId: sys.id, channel: "WEBCHAT", channelConnectionId: conn.id, externalUserId: "web-" + label + "-" + Date.now() },
      });
      return prisma.chatConversation.create({
        data: { tenantId, systemId: sys.id, channel: "WEBCHAT", channelConnectionId: conn.id, contactId: c.id, unitId, status: "OPEN" },
      });
    };
    const convA = await mkConvOnUnit("A", unitA.id);
    const convB = await mkConvOnUnit("B", unitB.id);
    const convNull = await mkConvOnUnit("N", null);

    const accessA = [unitA.id];

    const listA = await chat.listConversations({ tenantId, systemId: sys.id, unitAccess: accessA });
    const idsA = new Set(listA.map((c) => c.id));
    assert("list: unitA เห็น convA", idsA.has(convA.id));
    assert("list: unitA ไม่เห็น convB (ปิด IDOR)", !idsA.has(convB.id));
    assert("list: unitA เห็น conv ไม่ผูก unit (null)", idsA.has(convNull.id));

    const listAll = await chat.listConversations({ tenantId, systemId: sys.id, unitAccess: ["*"] });
    assert('list: "*" เห็นทั้ง convA+convB', new Set(listAll.map((c) => c.id)).has(convB.id) && new Set(listAll.map((c) => c.id)).has(convA.id));

    const threadDenied = await chat.getThread({ tenantId, systemId: sys.id, conversationId: convB.id, unitAccess: accessA });
    assert("getThread: unitA เปิด convB ไม่ได้ (null)", threadDenied === null);
    const threadAllowed = await chat.getThread({ tenantId, systemId: sys.id, conversationId: convB.id, unitAccess: ["*"] });
    assert('getThread: "*" เปิด convB ได้', threadAllowed !== null);

    const replyDenied = await chat.sendReply({ tenantId, systemId: sys.id, conversationId: convB.id, senderUserId: u.id, body: "hi", unitAccess: accessA });
    assert("sendReply: unitA ตอบ convB ไม่ได้", replyDenied.ok === false, JSON.stringify(replyDenied));
    const statusDenied = await chat.setStatus({ tenantId, systemId: sys.id, conversationId: convB.id, status: "RESOLVED", actorUserId: u.id, unitAccess: accessA });
    assert("setStatus: unitA ปิด convB ไม่ได้", statusDenied.ok === false, JSON.stringify(statusDenied));
    const assignDenied = await chat.assign({ tenantId, systemId: sys.id, conversationId: convB.id, assigneeUserId: u.id, actorUserId: u.id, unitAccess: accessA });
    assert("assign: unitA มอบหมาย convB ไม่ได้", assignDenied.ok === false, JSON.stringify(assignDenied));

    const replyAllowed = await chat.sendReply({ tenantId, systemId: sys.id, conversationId: convA.id, senderUserId: u.id, body: "hi", unitAccess: accessA });
    assert("sendReply: unitA ตอบ convA ได้", replyAllowed.ok === true, JSON.stringify(replyAllowed));
  }

  // ─────────────── M9: rate limit + contact cap ───────────────
  console.log("\nM9 rate limit + contact cap:");
  {
    __resetRateLimit();
    const key = "k:" + Date.now();
    const first20 = Array.from({ length: 20 }, () => rateLimit(key, 20, 60_000));
    const c21 = rateLimit(key, 20, 60_000);
    const otherKey = rateLimit("other:" + Date.now(), 20, 60_000);
    assert("rateLimit: 20 ครั้งแรกผ่าน", first20.every(Boolean));
    assert("rateLimit: ครั้งที่ 21 โดนบล็อก", c21 === false);
    assert("rateLimit: คนละ key ไม่โดนบล็อก", otherKey === true);

    // contact cap — ระบบใหม่แยกเพื่อกันปนกับ contact ของ M11/M12
    const sys2 = await system.createSystem(tenantId, "CHAT", "แชท cap " + tag);
    const conn2 = await chat.ensureWebchatConnection(tenantId, sys2.id);
    const now = new Date();
    await prisma.chatContact.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        tenantId,
        systemId: sys2.id,
        channel: "WEBCHAT" as const,
        channelConnectionId: conn2.id,
        externalUserId: "web-cap-" + i,
        createdAt: now,
      })),
    });
    const capped = await chat.receiveWebchatInbound({ connection: conn2, guestToken: "web-cap-new", body: "hi" });
    assert("contact cap: contact ใหม่เกิน 60/ชม. ถูกปฏิเสธ", capped.ok === false, JSON.stringify(capped));
    // contact เดิม (ในโควตา) ยังส่งได้ — ไม่นับเป็น new
    const existing = await chat.receiveWebchatInbound({ connection: conn2, guestToken: "web-cap-0", body: "hi again" });
    assert("contact cap: contact เดิมยังส่งได้", existing.ok === true, JSON.stringify(existing));
  }

  // ─────────────── M10: static source assertions (route/widget) — ทดสอบ HTTP cookie ใน script ไม่ได้ ───────────────
  console.log("\nM10 CSPRNG token + httpOnly cookie (static source check):");
  {
    const routeSrc = readFileSync("src/app/api/chat/webchat/[connectionId]/route.ts", "utf8");
    const widgetSrc = readFileSync("src/app/(store)/chat/[connectionId]/ChatWidget.tsx", "utf8");
    assert("route: ใช้ randomUUID (CSPRNG) gen token", routeSrc.includes("randomUUID"));
    assert("route: set httpOnly cookie", /httpOnly:\s*true/.test(routeSrc));
    assert("route: token มาจาก cookie ไม่ใช่ request body", routeSrc.includes("cookies()") && !/guestToken:\s*z\./.test(routeSrc) && !/\bb\.guestToken\b/.test(routeSrc));
    assert("widget: ไม่มี localStorage guest token", !/localStorage/.test(widgetSrc));
    assert("widget: ไม่ gen guest token ด้วย Math.random", !/shark_chat_guest|guestTokenFor/.test(widgetSrc));
  }
} catch (e) {
  bad("HARNESS", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // ── cleanup ──
  if (tenantId) {
    await prisma.chatMessage.deleteMany({ where: { tenantId } });
    await prisma.chatConversationEvent.deleteMany({ where: { tenantId } });
    await prisma.chatReadState.deleteMany({ where: { tenantId } });
    await prisma.chatConversation.deleteMany({ where: { tenantId } });
    await prisma.chatContact.deleteMany({ where: { tenantId } });
    await prisma.chatQuickReply.deleteMany({ where: { tenantId } });
    await prisma.chatSetting.deleteMany({ where: { tenantId } });
    await prisma.chatChannelConnection.deleteMany({ where: { tenantId } });
    await prisma.appSystem.deleteMany({ where: { tenantId } });
    await prisma.businessUnit.deleteMany({ where: { tenantId } });
    await prisma.membership.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { email: tag.toLowerCase() + "@qc.local" } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
}

console.log("\n===== QC7 Chat security =====");
console.log(`ผ่าน ${passed} ข้อ · FINDINGS ${findings.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ passed, findings }));
if (findings.length) process.exit(1);
