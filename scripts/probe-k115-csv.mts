// probe (builder) — พิสูจน์ว่าคำตอบ CSV ของ cards.list มี BOM จริงในไบต์ที่ส่งออก
// (ข้อสอบ K1.15-S2.16 อ่านผ่าน res.text() ซึ่ง WHATWG ลอก BOM ทิ้ง — ดู wo-notes/kanban-K1.15.md)
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: { expectedPath: string }; resolveKanbanScope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null> };
const { readFileSync } = await import("node:fs");
const ak = await import("@/lib/api-keys/service");
const scopes = await import("@/lib/api-keys/scopes");
const route = await import("@/app/api/v1/kanban/[...path]/route" as string);

const scope = await kq.resolveKanbanScope(prisma);
if (!scope) throw new Error("ยังไม่ได้ seed");
const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8")) as { boards: { patong: { id: string } } };
const key = await ak.createApiKey({ tenantId: scope.tenantId }, "probe k115 csv", {
  scopes: scopes.expandBundles(["kanban-read"]),
  systemId: scope.systemId,
});
try {
  const res = await (route as { GET: (r: Request, c: { params: Promise<{ path: string[] }> }) => Promise<Response> }).GET(
    new Request(`http://x/api/v1/kanban/boards/${E.boards.patong.id}/cards`, {
      headers: { authorization: `Bearer ${key.rawKey}`, accept: "text/csv" },
    }),
    { params: Promise.resolve({ path: ["boards", E.boards.patong.id, "cards"] }) },
  );
  const buf = new Uint8Array(await res.clone().arrayBuffer());
  const text = await res.text();
  console.log("status:", res.status, "content-type:", res.headers.get("content-type"));
  console.log("first 3 bytes:", [...buf.slice(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join(" "), "(ef bb bf = BOM)");
  console.log("res.text() charCodeAt(0):", text.charCodeAt(0).toString(16), `(${JSON.stringify(text.slice(0, 12))})`);
  console.log("BOM ในไบต์จริง:", buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? "มี ✅" : "ไม่มี ❌");
} finally {
  await prisma.apiKey.deleteMany({ where: { id: key.id } });
  await prisma.$disconnect();
}
