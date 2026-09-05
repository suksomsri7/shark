// F4 (Fable) — สร้างคีย์ทดสอบชั่วคราวบน prod สำหรับร้าน QC7 บัญชี · ลบทิ้งหลัง verify · ต้องตั้ง F4_PROD=1
import { prisma } from "@/lib/core/db";
if (process.env.F4_PROD !== "1") throw new Error("ต้องตั้ง F4_PROD=1");
if (!/ep-royal-night/.test(process.env.DIRECT_URL ?? "")) throw new Error("ไม่ใช่ prod host");
const ak = await import("@/lib/api-keys/service");
const scopes = await import("@/lib/api-keys/scopes");
const tenantId = "cmrmr1ehc00004ikzxeohel6k"; const systemId = "cmrmr1en300034ikz3rwtpfk9";
const mode = process.argv[2] ?? "create";
if (mode === "create") {
  const k = await ak.createApiKey({ tenantId }, "F4 verify (Fable ชั่วคราว)", { scopes: scopes.expandBundles(["read-only"]), systemId, expiresAt: new Date(Date.now() + 86_400_000) });
  console.log(JSON.stringify({ id: k.id, rawKey: k.rawKey, prefix: k.prefix }));
} else {
  const r = await prisma.apiKey.deleteMany({ where: { tenantId, name: "F4 verify (Fable ชั่วคราว)" } });
  await prisma.apiIdempotency.deleteMany({ where: { tenantId } }).catch(() => {});
  console.log("deleted", r.count);
}
await prisma.$disconnect();
