// เครื่องมือวินิจฉัย (อ่านอย่างเดียว) — "ส่งข้อความไม่ออก" ของเจ้าของ 1 ก.ย. 2026
// ไม่เขียนอะไรทั้งสิ้น · ไม่ขึ้นต้นด้วย qc- จึงไม่ถูก qc:all ดูดเป็นด่าน
process.loadEnvFile?.(".env");
const { prisma } = await import("@/lib/core/db" as string);

type Cnt = { _count: { _all: number } };

const rows = await prisma.chatMessage.findMany({
  where: { direction: "OUT" },
  orderBy: { createdAt: "desc" },
  take: 25,
  select: {
    id: true, createdAt: true, isInternal: true, type: true,
    deliveryStatus: true, deliveryError: true, senderUserId: true,
    body: true, conversationId: true,
  },
});
console.log(`ข้อความขาออก 25 รายการล่าสุด (ทุกร้าน):`);
for (const r of rows) {
  const when = r.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  console.log(
    `  ${when} · ${r.deliveryStatus.padEnd(7)} · ${r.isInternal ? "โน้ตใน" : "ถึงลูกค้า"} · ${r.type.padEnd(6)}` +
    ` · err=${r.deliveryError ?? "-"} · "${(r.body ?? "").slice(0, 34).replace(/\n/g, " ")}"`,
  );
}

const byStatus = await prisma.chatMessage.groupBy({
  by: ["deliveryStatus"],
  where: { direction: "OUT", isInternal: false },
  _count: { _all: true },
});
console.log(`\nสรุปสถานะข้อความ "ถึงลูกค้า" ทั้งหมด: ${byStatus.map((b: Cnt & { deliveryStatus: string }) => `${b.deliveryStatus}=${b._count._all}`).join(" · ")}`);

const errs = await prisma.chatMessage.groupBy({
  by: ["deliveryError"],
  where: { direction: "OUT", deliveryStatus: "FAILED" },
  _count: { _all: true },
});
console.log(`เหตุผลที่ส่งไม่สำเร็จ: ${errs.map((e: Cnt & { deliveryError: string | null }) => `${e.deliveryError ?? "(ไม่ระบุ)"}=${e._count._all}`).join(" · ") || "(ไม่มี)"}`);

// ช่องทางของห้องที่มีอยู่ — WEBCHAT ไม่มีขาส่งออกภายนอก ลูกค้าดึงเธรดเอง
const byChannel = await prisma.chatConversation.groupBy({ by: ["channel"], _count: { _all: true } });
console.log(`ช่องทางของห้องแชท: ${byChannel.map((c: Cnt & { channel: string }) => `${c.channel}=${c._count._all}`).join(" · ")}`);

// OpsEvent ที่เกี่ยวกับแชทช่วง 2 วันล่าสุด — catch เปล่าเคยกลืนสาเหตุมาแล้ว
const since = new Date(Date.now() - 2 * 24 * 3600 * 1000);
const ops = await prisma.opsEvent.findMany({
  where: { createdAt: { gte: since }, OR: [{ source: { contains: "chat" } }, { message: { contains: "chat" } }, { level: "ERROR" }] },
  orderBy: { createdAt: "desc" },
  take: 15,
  select: { createdAt: true, level: true, source: true, message: true, detail: true },
});
console.log(`\nOpsEvent ที่เกี่ยวกับแชท 2 วันล่าสุด (${ops.length} รายการ):`);
for (const o of ops) {
  console.log(`  ${o.createdAt.toISOString().slice(5, 16)} · ${o.level} · ${o.source} · ${String(o.message).slice(0, 90)} · ${String(o.detail ?? "").slice(0, 90)}`);
}
