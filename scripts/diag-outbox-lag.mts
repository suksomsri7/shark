// เครื่องมือวินิจฉัย (อ่านอย่างเดียว) — คิว outbox หน่วงนานแค่ไหน และมีอะไรตันอยู่ไหม
// เจ้าของรายงาน 1 ก.ย. 2026 "ส่งข้อความไม่ออก" · ข้อความลง DB แล้วแต่ลูกค้าเห็นช้า
process.loadEnvFile?.(".env");
const { prisma } = await import("@/lib/core/db" as string);

type Ev = { type: string; status: string; attempts: number; createdAt: Date; processedAt: Date | null; availableAt: Date | null };
type Grp = { status: string; type: string; _count: { _all: number } };

const rows: Ev[] = await prisma.outboxEvent.findMany({
  where: { type: { startsWith: "chat." } },
  orderBy: { createdAt: "desc" },
  take: 20,
  select: { type: true, status: true, attempts: true, createdAt: true, processedAt: true, availableAt: true },
});
console.log("เหตุการณ์ chat.* ล่าสุด — หน่วงกี่วินาทีกว่าจะถูกประมวลผล:");
for (const r of rows) {
  const lag = r.processedAt ? Math.round((r.processedAt.getTime() - r.createdAt.getTime()) / 1000) : null;
  console.log(
    `  ${r.createdAt.toISOString().slice(5, 19)} · ${r.type.padEnd(24)} · ${r.status.padEnd(7)}` +
    ` · หน่วง ${lag === null ? "ยังไม่ประมวลผล" : `${lag} วิ`}`,
  );
}

const pending: Grp[] = await prisma.outboxEvent.groupBy({
  by: ["status", "type"],
  where: { status: { not: "DONE" } },
  _count: { _all: true },
});
console.log(`\nงานที่ยังค้างในคิว: ${pending.map((p: Grp) => `${p.type}/${p.status}=${p._count._all}`).join(" · ") || "(ไม่มี)"}`);

const oldest = await prisma.outboxEvent.findFirst({
  where: { status: { not: "DONE" } },
  orderBy: { createdAt: "asc" },
  select: { type: true, status: true, attempts: true, createdAt: true, availableAt: true },
});
if (oldest) {
  const age = Math.round((Date.now() - oldest.createdAt.getTime()) / 60000);
  console.log(`ใบที่เก่าที่สุดที่ยังไม่จบ: ${oldest.type} · ${oldest.status} · attempts=${oldest.attempts} · ค้างมา ${age} นาที · availableAt=${oldest.availableAt?.toISOString().slice(5, 19) ?? "-"}`);
}

const lags = rows.filter((r: Ev) => r.processedAt).map((r: Ev) => (r.processedAt!.getTime() - r.createdAt.getTime()) / 1000);
if (lags.length) {
  lags.sort((a: number, b: number) => a - b);
  console.log(`\nสรุปหน่วง (${lags.length} ใบ): ต่ำสุด ${Math.round(lags[0]!)} วิ · กลาง ${Math.round(lags[Math.floor(lags.length / 2)]!)} วิ · สูงสุด ${Math.round(lags[lags.length - 1]!)} วิ`);
}
