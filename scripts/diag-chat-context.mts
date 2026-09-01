// เครื่องมือวินิจฉัย (อ่านอย่างเดียว) — `ChatConversation.meta` มีคีย์อะไรจริงบ้าง
// เหตุ: แผน WO-CV7 จะเอา `meta.pageUrl` มาแสดงเป็นบรรทัด "กำลังดูหน้า…"
//       สาย B ท้วงว่าไม่มีบรรทัดไหนในรีโปเอ่ยคำนี้เลย ⇒ ต้องพิสูจน์จากข้อมูลจริง ไม่ใช่จากโค้ด
process.loadEnvFile?.(".env");
const { prisma } = await import("@/lib/core/db" as string);

type Row = { id: string; meta: unknown; lastMessageAt: Date | null };
const rows: Row[] = await prisma.chatConversation.findMany({
  orderBy: { lastMessageAt: "desc" },
  take: 20,
  select: { id: true, meta: true, lastMessageAt: true },
});

const keyCount = new Map<string, number>();
let withMeta = 0;
for (const r of rows) {
  const m = r.meta as Record<string, unknown> | null;
  if (!m || typeof m !== "object") continue;
  withMeta++;
  for (const k of Object.keys(m)) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
}
console.log(`ห้องที่ดู ${rows.length} · มี meta ${withMeta}`);
console.log(`คีย์ที่พบ: ${[...keyCount.entries()].map(([k, n]) => `${k}=${n}`).join(" · ") || "(ไม่มีเลย)"}`);

for (const r of rows.slice(0, 6)) {
  const m = (r.meta ?? {}) as Record<string, unknown>;
  console.log(`  ${r.id.slice(0, 12)} · pageUrl=${JSON.stringify(m.pageUrl ?? null)} · lang=${JSON.stringify(m.lang ?? null)} · country=${JSON.stringify(m.country ?? null)}`);
}
