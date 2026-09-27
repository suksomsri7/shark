// probe-c38-seedid.mts — อ่านอย่างเดียว: id สมาชิก #1 ของไฟล์ expected ไหนมีอยู่จริงบนฐานนี้ (เลือก expected ให้ตรง seed ก่อนรันชุดสมาชิก)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const { prisma } = await import("@/lib/core/db");
for (const id of process.argv.slice(2)) console.log(id, (await (prisma as Any).customer.count({ where: { id } })) > 0 ? "EXISTS" : "missing");
await prisma.$disconnect();
