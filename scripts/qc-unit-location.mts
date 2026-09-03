// QC — WO-CV14 (ข) หน้าตั้งค่าที่อยู่/แผนที่สาขา (ปิดหนี้ D14) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้วไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
//
// 🔴 **ห้ามแตะฐานข้อมูลจริง** (.env ของเครื่องนี้ชี้ prod) → กัน 2 ชั้นเหมือน qc-chat-core-v2:
//   1) ทับ DATABASE_URL เป็น host ที่ต่อไม่ติด ทันทีหลัง loadEnvFile
//   2) ยัด fake prisma ลง require.cache ของ `src/lib/core/db.ts` **ก่อน** import service
//   fake ตัวนี้เล็กมากโดยตั้งใจ (businessUnit อย่างเดียว) แต่ **เคารพ where ทุกคีย์**
//   เพราะข้อ UL-3 วัดว่า service กรอง `tenantId` เองจริงไหม — fake ที่ไม่สนใจ where
//   จะทำให้ข้อนั้นเขียวหลอกทั้งที่โค้ดไม่ได้กรอง (ผลลบต้องมีคู่บวกกำกับ)
//
// ═══════ สัญญาที่คุม ═══════
// UL-1) บันทึกที่อยู่/แผนที่/พิกัดลง `BusinessUnit.settings` แบบ read-modify-write —
//       🔴 คีย์อื่นใน settings (timezone/openHours/account…) ต้องอยู่ครบ
//       (settings เป็น Json ก้อนเดียวของทั้งสาขา — เขียนทับ = ตั้งค่าภาษี/เวลาทำการหายทั้งสาขา)
// UL-2) validate ก่อนเขียน: ที่อยู่ ≤500 · mapUrl ต้อง https:// เท่านั้น (กัน javascript:/http:) ·
//       lat/lng ต้องกรอกคู่ และอยู่ในช่วง -90..90 / -180..180
// UL-3) สาขาของร้านอื่นต้องหาไม่เจอ (ข้อความไทย) และต้องไม่มีการเขียนใด ๆ เกิดขึ้น
// UL-4) สิทธิ์: คีย์ `systems.unit.update` อยู่ในทะเบียนกลาง · STAFF ที่ไม่มีคีย์ → assertCan โยน ·
//       action ดึง tenantId จาก session เท่านั้น (ห้ามรับจาก client)
// UL-5) ตัวอย่างลิงก์ที่ลูกค้าจะได้รับ = ตรรกะเดียวกับ `shopLocationAction` (mapUrl > lat/lng > address)
// UL-6) หน้าจอ: ใช้คอมโพเนนต์กลาง · ไทยล้วน · error inline ห้าม alert() · มีทางเข้าจากหน้าจัดการระบบ
// UL-7) 🔒 สิทธิ์ **รายสาขา** (Fable ตัดสิน 2 ก.ย.): assertCan ต้องส่ง `unitId` ด้วย —
//       `evaluate()` บังคับ `unitAccess` ผ่าน `canAccessUnit(m, q.unitId)` เท่านั้น ⇒ ไม่ส่ง unitId
//       = MANAGER/STAFF ที่คุมสาขา A แก้ที่อยู่สาขา B ได้ (ที่อยู่ผิด = ลูกค้าขับรถไปผิดที่)
//       ต้องบังคับทั้ง 3 ทอด: server action · การเรนเดอร์หน้า (ไม่มีสิทธิ์ = notFound) · ปุ่มทางเข้า
try { process.loadEnvFile?.(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db"; // กันพลาด: ต่อไม่ติดโดยตั้งใจ

const { readFileSync, existsSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = async (id: string, name: string, fn: () => Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

const ROOT = (() => {
  let d = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(d, "package.json"))) return d;
    d = resolve(d, "..");
  }
  throw new Error("หารากรีโปไม่เจอ");
})();
const read = (p: string) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
// 🔴 D24: กัน `image/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");

// ───────── fake prisma (businessUnit เท่านั้น · เคารพ where ทุกคีย์) ─────────
type Row = Record<string, unknown>;
let units: Row[] = [];
let writes = 0;
const match = (row: Row, where: unknown) =>
  !where || typeof where !== "object" ||
  Object.entries(where as Row).every(([k, v]) => v === undefined || row[k] === v);
const fakeUnit = {
  findFirst: async ({ where }: { where?: Row } = {}) => units.find((u) => match(u, where)) ?? null,
  findUnique: async ({ where }: { where?: Row } = {}) => units.find((u) => match(u, where)) ?? null,
  update: async ({ where, data }: { where?: Row; data?: Row }) => {
    const u = units.find((x) => match(x, where));
    if (!u) throw new Error("[fake] update ไม่เจอแถว (โค้ดข้ามด่านหา unit ไปเขียนตรง ๆ?)");
    writes++;
    Object.assign(u, data ?? {});
    return u;
  },
};
const fakePrisma = new Proxy({ businessUnit: fakeUnit } as Record<string, unknown>, {
  get(t, k: string) {
    if (k in t) return t[k];
    // model อื่น = ยังไม่รองรับ → โยนให้เห็นชัด ดีกว่าคืน undefined แล้วแดงเป็นปริศนา
    return new Proxy({}, { get: () => async () => { throw new Error(`[fake] ยังไม่รองรับ model ${k}`); } });
  },
});

const req = createRequire(import.meta.url);
const dbFile = resolve(ROOT, "src/lib/core/db.ts");
req.cache[dbFile] = { id: dbFile, filename: dbFile, path: resolve(dbFile, ".."), loaded: true, exports: { prisma: fakePrisma, tenantDb: () => fakePrisma }, children: [], paths: [] } as never;

// ดักเน็ตเวิร์ก — ชุดนี้ห้ามยิงออกจริง
globalThis.fetch = (async (...a: unknown[]) => { throw new Error("[fake] ห้ามยิงเน็ตเวิร์กในข้อสอบนี้ " + String(a[0])); }) as typeof fetch;

type Loc = { address: string; mapUrl: string; lat: number | null; lng: number | null };
type Svc = {
  saveUnitLocation?: (ctx: { tenantId: string }, unitId: string, input: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  readUnitLocation?: (settings: unknown) => Loc;
  shopMapLink?: (loc: Loc) => string;
};
const svc = (await import("@/lib/units/location" as string).catch(() => null)) as Svc | null;
const rbac = (await import("@/lib/core/rbac" as string).catch(() => null)) as
  | { assertCan?: (m: unknown, q: unknown) => void; evaluate?: (m: unknown, q: unknown) => boolean }
  | null;
const perms = (await import("@/lib/core/permissions" as string).catch(() => null)) as
  | { PERMISSIONS?: readonly { key: string; module: string; label: string }[]; PERMISSION_KEYS?: ReadonlySet<string> }
  | null;

const PERM_KEY = "systems.unit.update";
const PERM_MODULE = "systems";
const T1 = "tenant-A";
const T2 = "tenant-B";
// settings เดิมของสาขา = "ของที่ต้องไม่หาย" (ตั้งใจให้มีทั้งค่าตื้นและค่าซ้อน)
const BASE_SETTINGS = { timezone: "Asia/Bangkok", openHours: { mon: "09:00-18:00" }, account: { vatMode: "INCLUDE", vatRate: 7 } };
const seed = () => {
  writes = 0;
  units = [
    { id: "u1", tenantId: T1, name: "สาขาสีลม", settings: structuredClone(BASE_SETTINGS) },
    { id: "u2", tenantId: T2, name: "สาขาร้านอื่น", settings: { timezone: "Asia/Bangkok" } },
  ];
};
const settingsOf = (id: string) => (units.find((u) => u.id === id)?.settings ?? {}) as Row;
const save = async (unitId: string, input: Record<string, unknown>, tenantId = T1) =>
  (await svc?.saveUnitLocation?.({ tenantId }, unitId, input)) ?? { ok: false, error: "ยังไม่มี saveUnitLocation" };

await section("UL-0", "UL-0 คู่บวก — โมดูล/ทะเบียนโหลดได้จริง:", async () => {
  chk("UL-0.1", "🟢 มี `src/lib/units/location.ts` พร้อม saveUnitLocation/readUnitLocation/shopMapLink",
    !!svc?.saveUnitLocation && !!svc?.readUnitLocation && !!svc?.shopMapLink,
    "ครบ 3 ตัว", svc ? j(Object.keys(svc)) : "import ไม่ผ่าน");
  chk("UL-0.2", "🟢 fake prisma ทำงาน (บันทึกที่อยู่ธรรมดาต้องผ่าน) — กันข้ออื่นเขียวเพราะทุกอย่างพัง",
    (seed(), (await save("u1", { address: "123 ถนนสีลม" })).ok === true && writes === 1),
    "ok:true + เขียน 1 ครั้ง", `writes=${writes}`);
  chk("UL-0.3", "🟢 ทะเบียนสิทธิ์กลาง + rbac โหลดได้", !!perms?.PERMISSIONS && !!rbac?.assertCan, "โหลดได้", "import ไม่ผ่าน");
});

await section("UL-1", "UL-1 🔴 read-modify-write — คีย์อื่นใน settings ต้องอยู่ครบ:", async () => {
  seed();
  const r = await save("u1", { address: "123 ถนนสีลม กทม.", mapUrl: "https://maps.app.goo.gl/abc", lat: "13.7", lng: "100.5" });
  const s = settingsOf("u1");
  chk("UL-1.1", "บันทึกแล้วได้ค่าครบทั้ง 4 ช่อง (lat/lng เก็บเป็นตัวเลข ไม่ใช่สตริง)",
    r.ok && s.address === "123 ถนนสีลม กทม." && s.mapUrl === "https://maps.app.goo.gl/abc" && s.lat === 13.7 && s.lng === 100.5,
    "ครบ + เป็น number", j({ ok: r.ok, err: r.error, s }));
  chk("UL-1.2", "🔴 คีย์เดิมของสาขาอยู่ครบ (timezone/openHours/account.vatRate) — เขียนทับ = ตั้งค่าภาษีหายทั้งสาขา",
    s.timezone === "Asia/Bangkok" && j(s.openHours) === j(BASE_SETTINGS.openHours) && j(s.account) === j(BASE_SETTINGS.account),
    "คีย์เดิมครบ", j(s));
  const r2 = await save("u1", { address: "เลขที่ใหม่ 456", mapUrl: "", lat: "", lng: "" });
  const s2 = settingsOf("u1");
  chk("UL-1.3", "แก้ซ้ำ + ล้างค่าที่ไม่ต้องการได้ (ไม่เหลือค่าเก่าค้าง) และคีย์เดิมยังอยู่",
    r2.ok && s2.address === "เลขที่ใหม่ 456" && !s2.mapUrl && s2.lat == null && s2.lng == null && s2.timezone === "Asia/Bangkok",
    "ล้างได้ + คีย์เดิมอยู่", j(s2));
});

await section("UL-2", "UL-2 validate ก่อนเขียน (ไม่ผ่าน = ห้ามแตะ DB เลย):", async () => {
  const bad = async (name: string, input: Record<string, unknown>) => {
    seed();
    const r = await save("u1", input);
    return { name, ok: r.ok === false && typeof r.error === "string" && /[ก-๙]/.test(r.error ?? "") && writes === 0, r, writes };
  };
  const latOnly = await bad("lat เดี่ยว", { lat: "13.7" });
  const lngOnly = await bad("lng เดี่ยว", { lng: "100.5" });
  chk("UL-2.1", "lat/lng ต้องกรอกคู่ — กรอกข้างเดียว = ปฏิเสธพร้อมข้อความไทย ไม่เขียน DB",
    latOnly.ok && lngOnly.ok, "ปฏิเสธทั้งคู่", j([latOnly.r, lngOnly.r]));
  const lat91 = await bad("lat 91", { lat: "91", lng: "100" });
  const lngBig = await bad("lng 181", { lat: "13", lng: "181" });
  const nan = await bad("lat ไม่ใช่ตัวเลข", { lat: "เหนือ", lng: "100" });
  chk("UL-2.2", "พิกัดนอกช่วง (-90..90 / -180..180) และค่าที่ไม่ใช่ตัวเลข = ปฏิเสธ",
    lat91.ok && lngBig.ok && nan.ok, "ปฏิเสธทั้ง 3", j([lat91.r, lngBig.r, nan.r]));
  seed();
  const edge = await save("u1", { lat: "-90", lng: "180" });
  chk("UL-2.3", "🟢 คู่บวกของช่วง: ค่าที่ขอบเขตพอดี (-90 / 180) ต้องผ่าน (ไม่ใช่ปฏิเสธหมดแล้วเขียวลอย ๆ)",
    edge.ok && settingsOf("u1").lat === -90 && settingsOf("u1").lng === 180, "ผ่าน", j([edge, settingsOf("u1")]));
  const js = await bad("javascript:", { mapUrl: "javascript:alert(1)" });
  const http = await bad("http://", { mapUrl: "http://maps.google.com/x" });
  const junk = await bad("ไม่ใช่ลิงก์", { mapUrl: "maps.google.com" });
  chk("UL-2.4", "🔴 mapUrl รับเฉพาะ https:// (javascript: / http:// / ข้อความเปล่า = ปฏิเสธ)",
    js.ok && http.ok && junk.ok, "ปฏิเสธทั้ง 3", j([js.r, http.r, junk.r]));
  seed();
  const okUrl = await save("u1", { mapUrl: "https://maps.google.com/?q=1,2" });
  chk("UL-2.5", "🟢 คู่บวกของลิงก์: https:// ผ่าน", okUrl.ok && settingsOf("u1").mapUrl === "https://maps.google.com/?q=1,2", "ผ่าน", j(okUrl));
  const long = await bad("ที่อยู่ยาวเกิน", { address: "ก".repeat(501) });
  seed();
  const exact = await save("u1", { address: "ก".repeat(500) });
  chk("UL-2.6", "ที่อยู่เกิน 500 ตัวอักษร = ปฏิเสธ · 500 พอดี = ผ่าน",
    long.ok && exact.ok, "501 ปฏิเสธ / 500 ผ่าน", j([long.r, exact]));
});

await section("UL-3", "UL-3 🔴 สาขาของร้านอื่นต้องหาไม่เจอ:", async () => {
  seed();
  const r = await save("u2", { address: "แอบแก้ร้านอื่น" }, T1); // u2 เป็นของ tenant B
  chk("UL-3.1", "unitId ของร้านอื่น → ok:false ข้อความไทย และ **ไม่มีการเขียนใด ๆ**",
    r.ok === false && /[ก-๙]/.test(r.error ?? "") && writes === 0 && !("address" in settingsOf("u2")),
    "ปฏิเสธ + writes=0", j({ r, writes, s: settingsOf("u2") }));
  seed();
  const r2 = await save("ไม่มีจริง", { address: "x" }, T1);
  chk("UL-3.2", "unitId ที่ไม่มีอยู่จริง → ok:false ข้อความไทย ไม่โยน exception ดิบใส่หน้าจอ",
    r2.ok === false && /[ก-๙]/.test(r2.error ?? ""), "ปฏิเสธอย่างสุภาพ", j(r2));
});

await section("UL-4", "UL-4 สิทธิ์ (คีย์กลาง + assertCan + tenantId จาก session):", async () => {
  const list = perms?.PERMISSIONS ?? [];
  const def = list.find((p) => p.key === PERM_KEY);
  chk("UL-4.1", `คีย์ \`${PERM_KEY}\` อยู่ในทะเบียนกลาง module "${PERM_MODULE}" พร้อมป้ายไทย`,
    !!def && def.module === PERM_MODULE && /[ก-๙]/.test(def.label), "มีในทะเบียน", j(def ?? null));
  chk("UL-4.2", "อยู่ในชุดคีย์ที่ updateStaffAccess ยอมให้เขียน (PERMISSION_KEYS)",
    perms?.PERMISSION_KEYS?.has(PERM_KEY) === true, "มี", j(perms?.PERMISSION_KEYS?.has(PERM_KEY) ?? null));
  const q = { module: PERM_MODULE, action: PERM_KEY };
  const staff = { role: "STAFF", unitAccess: ["*"], permissions: {} };
  const staffOk = { role: "STAFF", unitAccess: ["*"], permissions: { [PERM_KEY]: true } };
  let threw = false;
  try { rbac?.assertCan?.(staff, q); } catch { threw = true; }
  chk("UL-4.3", "🔴 STAFF ที่ไม่ได้รับคีย์ → assertCan โยน", threw, "โยน", "ผ่านฉลุย (สิทธิ์รั่ว)");
  chk("UL-4.4", "🟢 คู่บวก: STAFF ที่ได้รับคีย์ / MANAGER / OWNER ผ่าน",
    rbac?.evaluate?.(staffOk, q) === true &&
    rbac?.evaluate?.({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, q) === true &&
    rbac?.evaluate?.({ role: "OWNER", unitAccess: ["*"], permissions: {} }, q) === true,
    "ผ่านทั้ง 3", j([rbac?.evaluate?.(staffOk, q), rbac?.evaluate?.({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, q)]));

  const act = strip(read("src/app/app/settings/units/[unitId]/actions.ts"));
  chk("UL-4.5", '`"use server"` + requireTenant + assertCan ด้วยคีย์นี้ + revalidatePath',
    /"use server"/.test(read("src/app/app/settings/units/[unitId]/actions.ts")) &&
    /requireTenant\(/.test(act) && /assertCan\(/.test(act) && act.includes(PERM_KEY) && /revalidatePath\(/.test(act),
    "ครบทั้ง 4", j({ useServer: /"use server"/.test(read("src/app/app/settings/units/[unitId]/actions.ts")), requireTenant: /requireTenant\(/.test(act), assertCan: /assertCan\(/.test(act), key: act.includes(PERM_KEY), revalidate: /revalidatePath\(/.test(act) }));
  chk("UL-4.6", "🔴 tenantId มาจาก session เท่านั้น — ห้ามอ่านจาก formData",
    act !== "" && !/formData\.get\(\s*["'][^"']*tenantId/i.test(act) && /auth\.active\.tenantId/.test(act),
    "ใช้ auth.active.tenantId", act === "" ? "ยังไม่มีไฟล์ actions.ts" : "อ่าน tenantId จาก client");
});

await section("UL-5", "UL-5 ตัวอย่างลิงก์ = ตรรกะเดียวกับ shopLocationAction:", async () => {
  const link = svc?.shopMapLink;
  const mk = (o: Partial<Loc>): Loc => ({ address: "", mapUrl: "", lat: null, lng: null, ...o });
  chk("UL-5.1", "ลำดับความสำคัญ: mapUrl > lat/lng > address (ตรงกับปุ่ม “แผนที่ร้าน” ในแชท)",
    link?.(mk({ mapUrl: "https://m.example/x", lat: 1, lng: 2, address: "ที่อยู่" })) === "https://m.example/x" &&
    link?.(mk({ lat: 13.7, lng: 100.5, address: "ที่อยู่" })) === "https://www.google.com/maps/search/?api=1&query=13.7,100.5" &&
    link?.(mk({ address: "ถนนสีลม" })) === `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("ถนนสีลม")}`,
    "ตรงทั้ง 3 ชั้น", j([link?.(mk({ mapUrl: "https://m.example/x", lat: 1, lng: 2 })), link?.(mk({ lat: 13.7, lng: 100.5 })), link?.(mk({ address: "ถนนสีลม" }))]));
  chk("UL-5.2", "ยังไม่ได้ตั้งอะไรเลย → คืนค่าว่าง (ห้ามเดา/ห้ามใส่พิกัดตัวอย่าง — ลูกค้าขับรถไปผิดที่)",
    link?.(mk({})) === "", "ค่าว่าง", j(link?.(mk({}))));
  chk("UL-5.3", "readUnitLocation อ่านจาก settings ได้ และค่าที่ผิดชนิดไม่หลุดออกมา",
    j(svc?.readUnitLocation?.({ address: "ก", mapUrl: "https://x/y", lat: 1, lng: 2, timezone: "x" })) === j({ address: "ก", mapUrl: "https://x/y", lat: 1, lng: 2 }) &&
    j(svc?.readUnitLocation?.({ lat: "13.7", lng: null })) === j({ address: "", mapUrl: "", lat: null, lng: null }),
    "อ่านถูก + กันค่าผิดชนิด", j([svc?.readUnitLocation?.({ address: "ก", mapUrl: "https://x/y", lat: 1, lng: 2 }), svc?.readUnitLocation?.({ lat: "13.7" })]));
  // drift guard: ปุ่มในแชทยังใช้ลำดับเดิมอยู่ไหม (ถ้าฝั่งใดฝั่งหนึ่งเปลี่ยน ตัวอย่างจะโกหกผู้ใช้ทันที)
  const room = strip(read("src/lib/modules/chat/room-actions.ts"));
  chk("UL-5.4", "🔴 `shopLocationAction` ยังใช้ลำดับเดิม + เทมเพลตลิงก์ Google เดิม (กันสองฝั่งเพี้ยนจากกัน)",
    /mapUrl\s*!==\s*""/.test(room) && room.includes("https://www.google.com/maps/search/?api=1&query=") &&
    room.indexOf("mapUrl !== \"\"") < room.indexOf("lat !== null"),
    "ลำดับ mapUrl → lat/lng → address", "ตรรกะสองฝั่งเริ่มเพี้ยนกัน", "MAJOR");
});

await section("UL-6", "UL-6 หน้าจอ + ทางเข้า:", async () => {
  const pagePath = "src/app/app/settings/units/[unitId]/page.tsx";
  const page = read(pagePath);
  chk("UL-6.1", "มีหน้า `settings/units/[unitId]/page.tsx` และดึงข้อมูลผ่าน requireTenant",
    page !== "" && /requireTenant\(/.test(strip(page)), "มีหน้า + requireTenant", page === "" ? "ยังไม่มีไฟล์" : "ไม่ได้ยืนยันตัวตน");
  chk("UL-6.2", "ใช้คอมโพเนนต์กลางเหมือนหน้าตั้งค่าอื่น (PageHeader + Section)",
    /PageHeader/.test(page) && /Section/.test(page), "ใช้ทั้งคู่", j({ h: /PageHeader/.test(page), s: /Section/.test(page) }));
  const form = read("src/components/unit-location-form.tsx");
  chk("UL-6.3", "🔴 ฟอร์มแจ้งผล/ข้อผิดพลาด inline — ห้าม alert()/confirm()",
    form !== "" && !/\b(alert|confirm)\s*\(/.test(strip(form)), "ไม่มี alert/confirm", form === "" ? "ยังไม่มีฟอร์ม" : "ยังใช้ alert");
  const all = strip(page) + strip(form);
  chk("UL-6.4", "ข้อความบนหน้าเป็นภาษาไทย (หลังบ้านไทยล้วน) และมีหัวข้อ “ที่อยู่และแผนที่”",
    /ที่อยู่และแผนที่/.test(all) && /ละติจูด/.test(all) && /ลองจิจูด/.test(all), "ครบ", "ยังไม่ครบ");
  chk("UL-6.5", "ฟอร์มแสดง **ตัวอย่างลิงก์ที่ลูกค้าจะได้รับ** ด้วยตัวเดียวกับ shopMapLink (ไม่เขียนตรรกะซ้ำ)",
    /shopMapLink\s*\(/.test(strip(form)), "เรียก shopMapLink", "ไม่มีตัวอย่างลิงก์ หรือคำนวณเอง");
  const systems = strip(read("src/app/app/settings/systems/page.tsx"));
  chk("UL-6.6", "หน้า “จัดการระบบ” มีทางเข้า “ตั้งค่าสาขา” → /app/settings/units/{id} (หน้าที่ไม่มีทางเข้า = หน้าที่ไม่มีใครใช้)",
    /ตั้งค่าสาขา/.test(systems) && /\/app\/settings\/units\//.test(systems), "มีลิงก์", "ไม่มีทางเข้า");
  const room = read("src/lib/modules/chat/room-actions.ts");
  chk("UL-6.7", "ข้อความตอนยังไม่ได้ตั้งค่าในแชท **ชี้ทางไปหน้านั้น** (ไม่ใช่บอกว่าไม่มีข้อมูลเฉย ๆ)",
    /จัดการระบบ/.test(room) && /ตั้งค่าสาขา/.test(room), "บอกเส้นทางเมนู", "ยังไม่ชี้ทาง");
});

await section("UL-7", "UL-7 🔒 สิทธิ์รายสาขา (unitAccess ต้องมีผลจริง):", async () => {
  const q = (unitId?: string) => ({ module: PERM_MODULE, action: PERM_KEY, ...(unitId ? { unitId } : {}) });
  const ev = rbac?.evaluate;
  const mgrA = { role: "MANAGER", unitAccess: ["u1"], permissions: {} };
  const staffA = { role: "STAFF", unitAccess: ["u1"], permissions: { [PERM_KEY]: true } };

  // 🟢 คู่บวกของกลไก: ถ้า evaluate ไม่ได้ดู unitId เลย ข้ออื่นในหมวดนี้จะเขียวหลอก
  chk("UL-7.0", "🟢 คู่บวก: `evaluate()` รับ `unitId` แล้วบังคับ unitAccess จริง (ถ้าไม่รองรับ = ต้องรายงาน ไม่ใช่ดัด rbac.ts)",
    ev?.(mgrA, q("u1")) === true && ev?.(mgrA, q("u2")) === false,
    "สาขาตัวเอง true · สาขาอื่น false", j([ev?.(mgrA, q("u1")), ev?.(mgrA, q("u2"))]));
  chk("UL-7.1", "🔴 MANAGER ที่คุมแค่สาขา A → แก้สาขา B ไม่ได้",
    ev?.(mgrA, q("u2")) === false, "false", j(ev?.(mgrA, q("u2"))));
  chk("UL-7.2", "🔴 STAFF ที่ได้คีย์แต่เข้าถึงแค่สาขา A → แก้สาขา B ไม่ได้ (คีย์ไม่ข้ามสาขา)",
    ev?.(staffA, q("u2")) === false && ev?.(staffA, q("u1")) === true,
    "B false · A true", j([ev?.(staffA, q("u2")), ev?.(staffA, q("u1"))]));
  chk("UL-7.3", "🟢 คู่บวก: unitAccess [\"*\"] และ OWNER (แม้ unitAccess จำกัด) ผ่านทุกสาขา",
    ev?.({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, q("u2")) === true &&
    ev?.({ role: "OWNER", unitAccess: ["u1"], permissions: {} }, q("u2")) === true,
    "true ทั้งคู่", j([ev?.({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, q("u2")), ev?.({ role: "OWNER", unitAccess: ["u1"], permissions: {} }, q("u2"))]));
  chk("UL-7.4", "🔴 คู่ลบของ oracle: ถ้า **ไม่ส่ง** unitId ระบบจะปล่อยผ่าน ⇒ การส่ง unitId คือสิ่งเดียวที่กันได้",
    ev?.(mgrA, q()) === true, "ไม่ส่ง unitId = ผ่าน (จึงต้องส่งเสมอ)", j(ev?.(mgrA, q())));

  const act = strip(read("src/app/app/settings/units/[unitId]/actions.ts"));
  // 🔴 วัดที่ **ตัว AccessQuery** ไม่ใช่ "มีคำว่า unitId อยู่แถว ๆ นั้น" — ของเดิมเขียนแบบหลังแล้ว
  //    เขียวหลอก เพราะ `formData.get("unitId")` ที่อยู่ถัดจาก assertCan ก็เข้าเงื่อนไขได้
  chk("UL-7.5", "🔴 `saveUnitLocationAction` ส่ง `unitId` เข้า assertCan (ไม่ใช่ตรวจแค่ระดับร้าน)",
    new RegExp(`action:\\s*["']${PERM_KEY.replace(/\./g, "\\.")}["'][^}]{0,60}?unitId`).test(act),
    "AccessQuery มี unitId ต่อจาก action", "assertCan ไม่ผูกสาขา — ข้ามสาขาได้");
  const declUnit = act.indexOf("const unitId");
  const callAssert = act.indexOf("assertCan(");
  chk("UL-7.6", "และอ่าน unitId จากฟอร์มก่อน **เรียก** assertCan (ไม่ใช่ตรวจไปก่อนแล้วค่อยหยิบสาขา = ตรวจผิดตัว)",
    declUnit >= 0 && callAssert >= 0 && declUnit < callAssert,
    "ประกาศ unitId ก่อนเรียก assertCan", j({ declUnit, callAssert }));

  const page = strip(read("src/app/app/settings/units/[unitId]/page.tsx"));
  chk("UL-7.7", "🔴 หน้าเว็บก็กัน: ไม่มีสิทธิ์ในสาขานั้น → notFound เหมือนเคสข้ามร้าน (ไม่ใช่โชว์ฟอร์มแล้วค่อยตายตอนกดบันทึก)",
    /evaluate\(/.test(page) && /unitId/.test(page) && /notFound\(\)/.test(page),
    "evaluate + unitId + notFound", j({ ev: /evaluate\(/.test(page), unit: /unitId/.test(page), nf: /notFound\(\)/.test(page) }));

  const systems = strip(read("src/app/app/settings/systems/page.tsx"));
  chk("UL-7.8", "🔴 ปุ่ม “ตั้งค่าสาขา” โชว์เฉพาะคนที่มีสิทธิ์ในสาขานั้น (ปุ่มที่กดแล้วเจอ 404 = โกหกผู้ใช้)",
    /evaluate\(/.test(systems) && /settingsHref/.test(systems) &&
    /evaluate\([\s\S]{0,220}?unitId/.test(systems),
    "ผูก settingsHref กับ evaluate(...unitId)", j({ ev: /evaluate\(/.test(systems), unitScoped: /evaluate\([\s\S]{0,220}?unitId/.test(systems) }));
});

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC UNIT LOCATION (WO-CV14 ข) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
