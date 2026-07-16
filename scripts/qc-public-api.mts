// QC — Public API v1 (WO-0061) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// 1) src/lib/api-keys/service.ts (นอก modules — platform-adjacent เหมือน payment/):
//    createApiKey(ctx: {tenantId}, name) → { id, rawKey } — rawKey = `shark_` + crypto 32+ ตัว โชว์ครั้งเดียว
//      · เก็บ sha256(rawKey) ใน keyHash · prefix = rawKey 12 ตัวแรก · name ว่าง → throw ไทย
//    verifyApiKey(rawKey) → { tenantId, keyId } | null — hash lookup · revoked/ไม่มี → null · อัป lastUsedAt
//    revokeApiKey(ctx, keyId) → boolean · listApiKeys(ctx) (ไม่มี keyHash ในผลลัพธ์!)
// 2) REST read-only /api/v1/* (Route Handlers · Authorization: Bearer <rawKey>):
//    GET /api/v1/me → { tenant: { id, name, slug } }
//    GET /api/v1/customers?take= → { data: [...] } (ระบบ MEMBER ตัวแรก · ไม่มีระบบ → data: [])
//    GET /api/v1/inventory/items → { data } (ระบบ INVENTORY ตัวแรก · ไม่มี → [])
//    GET /api/v1/shop/orders → { data } (ShopOrder ทุก unit ของ tenant เรียงใหม่ก่อน)
//    · ทุกเส้น: ไม่มี/ผิด key → 401 JSON {error} · rate limit ต่อ key 60/นาที (core checkRateLimit) → 429
// 3) UI /app/settings/api: สร้าง key (โชว์ rawKey ครั้งเดียว) + ตาราง prefix/ชื่อ/lastUsed + ปุ่มเพิกถอน (assertCan api.key.*)
// 4) หน้า docs สาธารณะ /developers (ไทย): อธิบาย auth + ทุก endpoint + ตัวอย่าง curl
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const { createHash } = await import("node:crypto");
const { readFileSync, existsSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!ak) { chk("PA-0", "มี api-keys/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC API", slug: `qc-api-${Date.now()}` } }); tid = t.id;
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "ลูกค้าเอพีไอ", phone: "0812223333" } });
    const ctx = { tenantId: tid };

    // 1) key lifecycle
    const k = await ak.createApiKey(ctx, "คีย์ทดสอบ");
    chk("PA-1.1", "rawKey ขึ้นต้น shark_ ยาว ≥32 + DB เก็บ hash ไม่เก็บ raw", typeof k.rawKey === "string" && k.rawKey.startsWith("shark_") && k.rawKey.length >= 32 && (await prisma.apiKey.findUnique({ where: { id: k.id as string } }))?.keyHash === createHash("sha256").update(k.rawKey as string).digest("hex"), "shark_+hash", String(k.rawKey).slice(0, 10));
    const v = await ak.verifyApiKey(k.rawKey);
    chk("PA-1.2", "verifyApiKey → tenantId ถูก + key ปลอม → null", (v as { tenantId?: string })?.tenantId === tid && (await ak.verifyApiKey("shark_ปลอมปลอมปลอมปลอมปลอมปลอม")) === null, "เจอ/null", "?");
    const list = (await ak.listApiKeys(ctx)) as Record<string, unknown>[];
    chk("PA-1.3", "listApiKeys ไม่มี keyHash หลุด + มี prefix", list.length === 1 && !("keyHash" in list[0]) && String(list[0].prefix).length === 12, "ไม่มี hash", JSON.stringify(Object.keys(list[0] ?? {})));
    chk("PA-1.4", "revoke แล้ว verify → null · revoke ซ้ำ → false", (await ak.revokeApiKey(ctx, k.id)) === true && (await ak.verifyApiKey(k.rawKey)) === null && (await ak.revokeApiKey(ctx, k.id)) === false, "null/false", "?");

    // 2) REST routes (เรียก handler ตรง)
    const k2 = await ak.createApiKey(ctx, "คีย์สอง");
    const req = (path: string, key?: string) => new Request(`http://x${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
    const me = (await import("@/app/api/v1/me/route" as string).catch(() => null)) as { GET: (r: Request) => Promise<Response> } | null;
    if (!me) { chk("PA-2.0", "มี /api/v1/me/route.ts", false, "มี", "ยังไม่สร้าง"); }
    else {
      const r200 = await me.GET(req("/api/v1/me", k2.rawKey));
      const body = (await r200.json()) as { tenant?: { id?: string; name?: string } };
      chk("PA-2.1", "GET /me + key ถูก → 200 tenant ตรง", r200.status === 200 && body.tenant?.id === tid && body.tenant?.name === "QC API", "200", `${r200.status}`);
      chk("PA-2.2", "ไม่มี key / key ผิด → 401 ทั้งคู่", (await me.GET(req("/api/v1/me"))).status === 401 && (await me.GET(req("/api/v1/me", "shark_wrongwrongwrongwrongwrong"))).status === 401, "401", "?");
      const cust = (await import("@/app/api/v1/customers/route" as string)) as unknown as { GET: (r: Request) => Promise<Response> };
      const rc = await cust.GET(req("/api/v1/customers", k2.rawKey));
      const cb = (await rc.json()) as { data?: { name?: string }[] };
      chk("PA-2.3", "GET /customers → data มีลูกค้า (ชื่อตรง)", rc.status === 200 && Array.isArray(cb.data) && cb.data.some((c) => c.name === "ลูกค้าเอพีไอ"), "เจอ", JSON.stringify(cb).slice(0, 60));
      const inv = (await import("@/app/api/v1/inventory/items/route" as string)) as unknown as { GET: (r: Request) => Promise<Response> };
      const ri = await inv.GET(req("/api/v1/inventory/items", k2.rawKey));
      chk("PA-2.4", "GET /inventory/items ไม่มีระบบคลัง → 200 data []", ri.status === 200 && ((await ri.json()) as { data?: unknown[] }).data?.length === 0, "[]", `${ri.status}`);
      const so = (await import("@/app/api/v1/shop/orders/route" as string)) as unknown as { GET: (r: Request) => Promise<Response> };
      chk("PA-2.5", "GET /shop/orders → 200", (await so.GET(req("/api/v1/shop/orders", k2.rawKey))).status === 200, "200", "?");
      // rate limit: ยิง /me จน 429 (limit 60/นาที)
      let got429 = false;
      for (let i = 0; i < 70; i++) { const r = await me.GET(req("/api/v1/me", k2.rawKey)); if (r.status === 429) { got429 = true; break; } }
      chk("PA-2.6", "เกิน 60 ครั้ง/นาที → 429", got429, "429", "ไม่เจอ", "MAJOR");
    }

    // 3) docs + UI files
    chk("PA-3.1", "มีหน้า /developers (ไทย + ตัวอย่าง curl)", existsSync("src/app/developers/page.tsx") && /curl/.test(readFileSync("src/app/developers/page.tsx", "utf8")) && /[ก-๙]/.test(readFileSync("src/app/developers/page.tsx", "utf8")), "มี", "?", "MAJOR");
    chk("PA-3.2", "มีหน้า /app/settings/api + assertCan", existsSync("src/app/app/settings/api/page.tsx") && /assertCan/.test(readFileSync("src/app/app/settings/api/actions.ts", "utf8").toString()), "มี", "?", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["apiKey", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Public API =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
