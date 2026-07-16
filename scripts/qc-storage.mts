// QC — Object storage (WO-0024) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/storage/service.ts:
//   storageEnabled(): boolean          // env SHARK_BUNNY_ZONE + SHARK_BUNNY_KEY + SHARK_BUNNY_CDN ครบ
//   uploadFile(ctx: {tenantId}, input: { kind: "LOGO"|"ATTACHMENT"; filename: string; contentType: string; data: Uint8Array },
//              deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void> })
//     : Promise<{ ok: true; cdnUrl: string; assetId: string } | { ok: false; error: string }>   // error = ข้อความไทย ห้าม throw
//     — ปิดอยู่ (ไม่มี env และไม่มี deps.put) → ok:false "ยังไม่ได้ตั้งค่า…"
//     — ตรวจชนิด: image/jpeg|png|webp|gif + application/pdf เท่านั้น · ขนาด ≤ 5MB
//     — path = t/<tenantId>/<kind ตัวเล็ก>/<id>.<ext จาก contentType> · cdnUrl = <SHARK_BUNNY_CDN>/<path>
//     — สำเร็จ → FileAsset row (tenant-scoped)
//   listAssets(ctx, kind?, take=50)    // ใหม่→เก่า
//   deps.put ฉีดได้ (ข้อสอบ) — ของจริง PUT https://sg.storage.bunnycdn.com/<zone>/<path> header AccessKey
try { process.loadEnvFile(".env"); } catch {}
// บังคับสภาพแวดล้อมข้อสอบ: เปิด storage แบบ mock (CDN สมมุติ) — deps.put ฉีดเอง ไม่ยิงจริง
process.env.SHARK_BUNNY_ZONE = "qc-zone";
process.env.SHARK_BUNNY_KEY = "qc-key";
process.env.SHARK_BUNNY_CDN = "https://qc.b-cdn.net";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const st = await import("@/lib/storage/service" as string).catch(() => null);
  if (!st) { chk("ST-0", "มี src/lib/storage/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    chk("ST-1.1", "storageEnabled = true (env ครบ)", st.storageEnabled() === true, "true", String(st.storageEnabled()));

    const t = await prisma.tenant.create({ data: { name: "QC STORE", slug: `qc-st-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC ST2", slug: `qc-st2-${Date.now()}` } }); tid2 = t2.id;
    const ctx = { tenantId: tid };
    const puts: { path: string; bytes: number; contentType: string }[] = [];
    const put = async (path: string, data: Uint8Array, contentType: string) => { puts.push({ path, bytes: data.length, contentType }); };

    const img = new Uint8Array(1024).fill(7);
    const r1 = await st.uploadFile(ctx, { kind: "LOGO", filename: "logo.png", contentType: "image/png", data: img }, { put });
    chk("ST-2.1", "อัปโหลดสำเร็จ + cdnUrl ถูกโครง", r1.ok === true && r1.cdnUrl.startsWith("https://qc.b-cdn.net/t/") && r1.cdnUrl.endsWith(".png"), "ok+url", JSON.stringify(r1).slice(0, 80));
    chk("ST-2.2", "put ถูกเรียกด้วย path เดียวกับ cdnUrl", puts.length === 1 && r1.ok && r1.cdnUrl === `https://qc.b-cdn.net/${puts[0].path}`, "ตรง", puts[0]?.path ?? "-");
    chk("ST-2.3", "path อยู่ใต้ t/<tenantId>/logo/", (puts[0]?.path ?? "").startsWith(`t/${tid}/logo/`), "ใต้ tenant", puts[0]?.path ?? "-");
    const asset = await prisma.fileAsset.findFirst({ where: { tenantId: tid } });
    chk("ST-2.4", "FileAsset row ครบ (bytes/contentType)", asset?.bytes === 1024 && asset?.contentType === "image/png", "1024/png", JSON.stringify({ b: asset?.bytes, c: asset?.contentType }));

    const bad = await st.uploadFile(ctx, { kind: "ATTACHMENT", filename: "x.exe", contentType: "application/x-msdownload", data: img }, { put });
    chk("ST-3.1", "ชนิดต้องห้าม → ok:false ไทย ไม่ throw", bad.ok === false && bad.error.length > 0, "false", JSON.stringify(bad).slice(0, 60));
    const big = await st.uploadFile(ctx, { kind: "ATTACHMENT", filename: "big.pdf", contentType: "application/pdf", data: new Uint8Array(5 * 1024 * 1024 + 1) }, { put });
    chk("ST-3.2", "เกิน 5MB → ok:false", big.ok === false, "false", "?");
    chk("ST-3.3", "ครั้งที่พังไม่สร้าง FileAsset เพิ่ม", (await prisma.fileAsset.count({ where: { tenantId: tid } })) === 1, "1", "?");

    chk("ST-4.1", "listAssets เห็นของตัวเอง 1", (await st.listAssets(ctx)).length === 1, "1", "?");
    chk("ST-4.2", "tenant อื่นไม่เห็น (guard)", (await st.listAssets({ tenantId: tid2 })).length === 0, "0", "?");

    // ปิด env → ปิดสุภาพ (ไม่ฉีด put)
    delete process.env.SHARK_BUNNY_ZONE;
    chk("ST-5.1", "env ไม่ครบ → enabled false + upload ok:false ไทย", st.storageEnabled() === false && (await st.uploadFile(ctx, { kind: "LOGO", filename: "a.png", contentType: "image/png", data: img })).ok === false, "ปิดสุภาพ", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { await d(() => prisma.fileAsset.deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Storage =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
