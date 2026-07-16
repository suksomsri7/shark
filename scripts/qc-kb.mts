// QC — คลังความรู้ KB (WO-0073) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/kb/service.ts (ctx {tenantId} — tenantDb ทุก query):
//   createArticle(ctx, { title, body, category? }) → {id} — title/body ว่าง → throw ไทย
//   updateArticle(ctx, id, patch) · listArticles(ctx, { category?, activeOnly? }) · listCategories(ctx) (distinct จากบทความ active)
//   searchKb(ctx, query, take?) → [{ id, title, snippet, category }] — keyword ค้น title+body (case-insensitive)
//     · เฉพาะ active · query ว่าง → [] · snippet = ช่วงข้อความรอบคำที่เจอ (~เกิน 200 ตัวไม่เอา)
//     · เจอใน title ต้องมาก่อนเจอแค่ใน body
//   AI tool ใหม่ "kb_search" ใน src/lib/ai/tools.ts (toolRegistry ต้องมี):
//     · run: เรียก searchKb แล้วคืนข้อความไทย — เจอ → รวม title+เนื้อหา (ให้ AI ใช้ตอบ) · ไม่เจอ → "ไม่พบ..." (ห้าม throw)
//   UI /app/kb: รายการ+สร้าง/แก้ (title/body/category) + ค้นหา + toggle active + ลิงก์ NavDrawer
//   systems.ts: KB (code "KB", no.16) เปลี่ยน status "coming_soon" → "available" (ป้าย "เร็วๆ นี้" ตัวสุดท้ายหลุด)
//     — KB เป็น kind feature ระดับ tenant: เปิดหน้า /app/kb ตรง (ดูว่า SYSTEM_DEFS ตัว available ตัวอื่น wire เข้าเมนูยังไงแล้วตามนั้น)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const kb = (await import("@/lib/modules/kb/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!kb) { chk("KB-0", "มี kb/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC KB", slug: `qc-kb-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };

    let threw = false; try { await kb.createArticle(ctx, { title: "", body: "x" }); } catch { threw = true; }
    chk("KB-1.1", "title ว่าง → throw", threw, "throw", "?");
    const a1 = await kb.createArticle(ctx, { title: "วิธีคืนสินค้า", body: "ลูกค้าคืนสินค้าได้ภายใน 7 วัน พร้อมใบเสร็จ สินค้าลดราคาไม่รับคืน", category: "นโยบายร้าน" });
    await kb.createArticle(ctx, { title: "เวลาเปิดร้าน", body: "เปิดทุกวัน 9:00-20:00 หยุดปีใหม่", category: "ทั่วไป" });
    const aOff = await kb.createArticle(ctx, { title: "โปรเก่า (เลิกใช้)", body: "โปรคืนสินค้าฟรี" });
    await kb.updateArticle(ctx, aOff.id, { active: false });
    chk("KB-1.2", "listArticles activeOnly = 2 · ทั้งหมด = 3", ((await kb.listArticles(ctx, { activeOnly: true })) as unknown[]).length === 2 && ((await kb.listArticles(ctx, {})) as unknown[]).length === 3, "2/3", "?");
    chk("KB-1.3", "listCategories = 2 หมวด (จาก active)", ((await kb.listCategories(ctx)) as unknown[]).length === 2, "2", "?");

    // ค้นหา
    const r1 = (await kb.searchKb(ctx, "คืนสินค้า")) as { id: string; title: string; snippet: string }[];
    chk("KB-2.1", "ค้น 'คืนสินค้า' → เจอเฉพาะ active + title-hit มาก่อน + snippet ≤200", r1.length === 1 && r1[0].id === a1.id && r1[0].snippet.length <= 200 && r1[0].snippet.includes("7 วัน"), "1 (บทความคืนสินค้า)", `${r1.length}:${r1[0]?.title ?? "-"}`);
    const r2 = (await kb.searchKb(ctx, "ปีใหม่")) as { title: string }[];
    chk("KB-2.2", "ค้นคำใน body ('ปีใหม่') → เจอบทความเวลาเปิดร้าน", r2.length === 1 && r2[0].title === "เวลาเปิดร้าน", "1", `${r2.length}`);
    chk("KB-2.3", "query ว่าง → [] · คำไม่มี → []", ((await kb.searchKb(ctx, "")) as unknown[]).length === 0 && ((await kb.searchKb(ctx, "ควอนตัมฟิสิกส์")) as unknown[]).length === 0, "0/0", "?");

    // AI tool
    const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[]; runTool: (c: { tenantId: string }, n: string, a: unknown) => Promise<string> };
    chk("KB-3.1", "toolRegistry มี kb_search", tools.toolRegistry().some((x) => x.def.name === "kb_search"), "มี", JSON.stringify(tools.toolRegistry().map((x) => x.def.name).slice(-4)));
    const out = await tools.runTool({ tenantId: tid }, "kb_search", { query: "คืนสินค้า" });
    chk("KB-3.2", "runTool kb_search → ข้อความไทยมีเนื้อหาบทความ", typeof out === "string" && out.includes("7 วัน") && out.includes("วิธีคืนสินค้า"), "มีเนื้อหา", String(out).slice(0, 60));
    const miss = await tools.runTool({ tenantId: tid }, "kb_search", { query: "ควอนตัมฟิสิกส์" });
    chk("KB-3.3", "ไม่เจอ → ข้อความไทย 'ไม่พบ' ไม่ throw", typeof miss === "string" && /ไม่พบ/.test(miss), "ไม่พบ", String(miss).slice(0, 40));

    // systems.ts ปลดป้าย
    const sysDefs = (await import("@/lib/systems")) as unknown as { SYSTEM_DEFS: { code: string; status: string }[] };
    const kbDef = sysDefs.SYSTEM_DEFS.find((s) => s.code === "KB");
    chk("KB-4.1", "SYSTEM_DEFS KB status = available", kbDef?.status === "available", "available", String(kbDef?.status));
    chk("KB-4.2", "ไม่เหลือ coming_soon ในระบบเลย (ป้ายสุดท้ายหลุด)", sysDefs.SYSTEM_DEFS.every((s) => s.status !== "coming_soon"), "0 ตัว", JSON.stringify(sysDefs.SYSTEM_DEFS.filter((s) => s.status === "coming_soon").map((s) => s.code)));

    // isolation
    const t2 = await prisma.tenant.create({ data: { name: "QC KB2", slug: `qc-kb2-${Date.now()}` } }); tid2 = t2.id;
    chk("KB-5.1", "tenant อื่นค้นไม่เจอ (guard)", ((await kb.searchKb({ tenantId: tid2 }, "คืนสินค้า")) as unknown[]).length === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.kbArticle.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.aiUsage.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC KB =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
