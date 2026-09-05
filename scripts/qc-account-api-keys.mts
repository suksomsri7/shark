// QC — API บัญชี WO A1: คีย์ API มี scope / ผูกสมุดบัญชี / หมดอายุ / หมุน + ApiIdempotency + ActorType.API_KEY
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §A1
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (โค้ดที่ทดสอบอาจยังไม่มีตอนเขียนข้อสอบ)
//
// รัน: export DATABASE_URL/DIRECT_URL ของ .env.qc (grep|cut) แล้ว `pnpm exec tsx scripts/qc-account-api-keys.mts`
// ด่านกัน prod: loadLegacyQcEnv (host ep-royal-night = ตาย)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-keys");

const { prisma, tenantDb } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const perms = await import("@/lib/core/permissions");
const { createHash } = await import("node:crypto");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const thrown = async (f: () => Promise<unknown>): Promise<string | null> => {
  try { await f(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};
const isThai = (s: string | null) => !!s && /[ก-๙]/.test(s);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any; // จงใจ: oracle ล้ำหน้าโค้ด

let tidA = "";
let tidB = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopesMod = (await import("@/lib/api-keys/scopes" as string).catch(() => null)) as Record<string, Any> | null;
  const routeAuth = (await import("@/lib/api-keys/route-auth" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const access = (await import("@/lib/modules/account/access" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  // ── ร้าน A (มีสมุดบัญชี 1 เล่ม + POS 1) · ร้าน B (สมุดบัญชี 1 เล่ม) ──
  const tA = await prisma.tenant.create({ data: { name: "QC API Keys A", slug: `qc-apikeys-a-${Date.now()}` } });
  tidA = tA.id;
  const tB = await prisma.tenant.create({ data: { name: "QC API Keys B", slug: `qc-apikeys-b-${Date.now()}` } });
  tidB = tB.id;
  const accA = await sys.createSystem(tidA, "ACCOUNT", "บัญชี A");
  const posA = await sys.createSystem(tidA, "POS", "POS A");
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const ctxA = { tenantId: tidA };
  const ctxB = { tenantId: tidB };

  // ═══ AK-1 schema ═══
  const cols = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'ApiKey'`,
  )) as { column_name: string }[];
  const colSet = new Set(cols.map((c) => c.column_name));
  for (const c of ["scopesJson", "systemId", "expiresAt", "createdById", "rotatedFromId"]) {
    chk(`AK-1.${c}`, `ApiKey มีคอลัมน์ ${c}`, colSet.has(c), "มี", "ไม่มี");
  }
  const idem = (await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'ApiIdempotency'`,
  )) as { column_name: string }[];
  const idemSet = new Set(idem.map((c) => c.column_name));
  chk("AK-1.idem", "ตาราง ApiIdempotency มีคอลัมน์ครบ (tenantId keyId idemKey requestHash status responseJson expiresAt)",
    ["tenantId", "keyId", "idemKey", "requestHash", "status", "responseJson", "expiresAt", "createdAt"].every((c) => idemSet.has(c)),
    "ครบ", [...idemSet].join(","));
  const idemIdx = (await prisma.$queryRawUnsafe(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'ApiIdempotency'`,
  )) as { indexdef: string }[];
  chk("AK-1.idem-unique", "ApiIdempotency unique (keyId, idemKey)",
    idemIdx.some((i) => /UNIQUE/.test(i.indexdef) && /keyId/.test(i.indexdef) && /idemKey/.test(i.indexdef)), "unique", idemIdx.map((i) => i.indexdef).join(" | ").slice(0, 200));
  const actorEnum = (await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ActorType'`,
  )) as { enumlabel: string }[];
  chk("AK-1.actor", "enum ActorType มี API_KEY", actorEnum.some((r) => r.enumlabel === "API_KEY"), "API_KEY", actorEnum.map((r) => r.enumlabel).join(","));

  // ═══ AK-2 backward compat ═══
  const legacy = await ak.createApiKey(ctxA, "คีย์แบบเดิม");
  const vLegacy = await ak.verifyApiKey(legacy.rawKey);
  chk("AK-2.1", "createApiKey(ctx,name) แบบเดิม → verify ได้ scopes [] systemId null",
    vLegacy?.tenantId === tidA && Array.isArray(vLegacy?.scopes) && vLegacy.scopes.length === 0 && vLegacy.systemId === null,
    "scopes [] · systemId null", JSON.stringify(vLegacy));
  const rowLegacy = await prisma.apiKey.findUnique({ where: { id: legacy.id } }) as Any;
  chk("AK-2.2", "แถวคีย์แบบเดิม: expiresAt null · keyHash = sha256(raw)",
    rowLegacy?.expiresAt === null && rowLegacy?.keyHash === sha256(legacy.rawKey), "null/hash", `${rowLegacy?.expiresAt}`);

  // ═══ AK-3 scope + systemId + expiresAt ═══
  const inYear = new Date(Date.now() + 365 * 86_400_000);
  const scoped = await ak.createApiKey(ctxA, "คีย์บัญชี", {
    scopes: ["account.doc.view", "account.doc.create", "account.doc.view"], // ซ้ำ 1 ตัว → ต้อง dedupe
    systemId: accA.id,
    expiresAt: inYear,
    createdById: "user-x",
  });
  const vScoped = await ak.verifyApiKey(scoped.rawKey);
  chk("AK-3.1", "คีย์ที่มี scope → verify คืน scopes (dedupe) + systemId",
    vScoped?.tenantId === tidA && JSON.stringify([...(vScoped?.scopes ?? [])].sort()) === JSON.stringify(["account.doc.create", "account.doc.view"]) && vScoped?.systemId === accA.id,
    "2 scope + systemId", JSON.stringify(vScoped));
  const rowScoped = await prisma.apiKey.findUnique({ where: { id: scoped.id } }) as Any;
  chk("AK-3.2", "แถวเก็บ expiresAt/createdById ตามที่ส่ง",
    rowScoped?.expiresAt?.getTime() === inYear.getTime() && rowScoped?.createdById === "user-x", "ตรง", `${rowScoped?.expiresAt}/${rowScoped?.createdById}`);
  const badScope = await thrown(() => ak.createApiKey(ctxA, "x", { scopes: ["account.doc.view", "account.nonexistent.thing"] }));
  chk("AK-3.3", "scope ที่ไม่ใช่ permission key จริง → throw ไทย", isThai(badScope), "throw ไทย", `${badScope}`);
  const paramScope = await thrown(() => ak.createApiKey(ctxA, "x", { scopes: ["account.approve.limit"] }));
  chk("AK-3.4", "param key (account.approve.limit) ใช้เป็น scope ไม่ได้ → throw ไทย", isThai(paramScope), "throw ไทย", `${paramScope}`, "MAJOR");
  const foreignSys = await thrown(() => ak.createApiKey(ctxA, "x", { systemId: accB.id }));
  chk("AK-3.5", "systemId ของร้านอื่น → throw ไทย (ไม่สร้าง)", isThai(foreignSys), "throw ไทย", `${foreignSys}`);
  const nonAccountSys = await ak.createApiKey(ctxA, "คีย์ POS", { systemId: posA.id, scopes: [] });
  chk("AK-3.6", "systemId ของระบบชนิดอื่นในร้านเดียวกัน (POS) สร้างได้ (คีย์ระดับระบบทั่วไป)", typeof nonAccountSys?.rawKey === "string", "สร้างได้", "?", "MINOR");
  const pastExp = await thrown(() => ak.createApiKey(ctxA, "x", { expiresAt: new Date(Date.now() - 60_000) }));
  chk("AK-3.7", "expiresAt ในอดีต → throw ไทย", isThai(pastExp), "throw ไทย", `${pastExp}`);
  const emptyName = await thrown(() => ak.createApiKey(ctxA, "   ", { scopes: ["account.doc.view"] }));
  chk("AK-3.8", "ชื่อว่าง → throw ไทย (เหมือนเดิม)", isThai(emptyName), "throw ไทย", `${emptyName}`, "MINOR");

  // ═══ AK-4 หมดอายุ ═══
  const soon = await ak.createApiKey(ctxA, "คีย์ใกล้หมดอายุ", { scopes: ["account.doc.view"], expiresAt: new Date(Date.now() + 5_000) });
  await prisma.apiKey.update({ where: { id: soon.id }, data: { expiresAt: new Date(Date.now() - 1_000) } as Any });
  const vExpired = await ak.verifyApiKey(soon.rawKey);
  const rowExpired = await prisma.apiKey.findUnique({ where: { id: soon.id } }) as Any;
  chk("AK-4.1", "คีย์หมดอายุ → verify null และไม่แตะ lastUsedAt", vExpired === null && rowExpired?.lastUsedAt === null, "null/null", `${JSON.stringify(vExpired)}/${rowExpired?.lastUsedAt}`);
  const reqOf = (key?: string) => new Request("http://x/api/v1/me", { headers: key ? { authorization: `Bearer ${key}` } : {} });
  const aExpired = await routeAuth.authenticateApiRequest(reqOf(soon.rawKey));
  chk("AK-4.2", "authenticateApiRequest คีย์หมดอายุ → 401", aExpired?.ok === false && aExpired?.response?.status === 401, "401", `${aExpired?.ok}/${aExpired?.response?.status}`);

  // ═══ AK-5 หมุนคีย์ ═══
  const rotated = await ak.rotateApiKey(ctxA, scoped.id, { createdById: "user-y" });
  const vOld = await ak.verifyApiKey(scoped.rawKey);
  const vNew = await ak.verifyApiKey(rotated.rawKey);
  const rowNew = await prisma.apiKey.findUnique({ where: { id: rotated.id } }) as Any;
  const rowOld = await prisma.apiKey.findUnique({ where: { id: scoped.id } }) as Any;
  chk("AK-5.1", "หมุน: คีย์เก่า verify null (revokedAt ตั้ง) · คีย์ใหม่ verify ได้",
    vOld === null && !!rowOld?.revokedAt && vNew?.tenantId === tidA, "null + ok", `${JSON.stringify(vOld)}/${JSON.stringify(vNew)}`);
  chk("AK-5.2", "คีย์ใหม่คัดลอก name/scopes/systemId/expiresAt + rotatedFromId ชี้ตัวเก่า",
    rowNew?.name === "คีย์บัญชี" && JSON.stringify([...(vNew?.scopes ?? [])].sort()) === JSON.stringify(["account.doc.create", "account.doc.view"]) &&
      vNew?.systemId === accA.id && rowNew?.expiresAt?.getTime() === inYear.getTime() && rowNew?.rotatedFromId === scoped.id && rowNew?.createdById === "user-y",
    "คัดลอกครบ", JSON.stringify({ name: rowNew?.name, exp: rowNew?.expiresAt, from: rowNew?.rotatedFromId, by: rowNew?.createdById }));
  chk("AK-5.3", "rawKey ใหม่ ≠ เดิม · prefix ใหม่ · รูปแบบ shark_ + ≥64 hex",
    rotated.rawKey !== scoped.rawKey && /^shark_[0-9a-f]{64}$/.test(rotated.rawKey) && rotated.prefix === rotated.rawKey.slice(0, 12), "ใหม่", rotated.prefix);
  const rotAgain = await thrown(() => ak.rotateApiKey(ctxA, scoped.id));
  chk("AK-5.4", "หมุนคีย์ที่เพิกถอนแล้ว → throw ไทย", isThai(rotAgain), "throw ไทย", `${rotAgain}`);
  // ไม่มี expiresAt เดิม → ตั้งใหม่ +365 วัน (±1 วัน)
  const rotLegacy = await ak.rotateApiKey(ctxA, legacy.id);
  const rowRotLegacy = await prisma.apiKey.findUnique({ where: { id: rotLegacy.id } }) as Any;
  const diffDays = rowRotLegacy?.expiresAt ? (rowRotLegacy.expiresAt.getTime() - Date.now()) / 86_400_000 : NaN;
  chk("AK-5.5", "หมุนคีย์ที่ไม่มีวันหมดอายุ → ตั้ง +365 วัน", diffDays > 364 && diffDays <= 366, "≈365", `${diffDays.toFixed(2)}`, "MAJOR");
  // อะตอมมิก: หมุนพร้อมกัน 2 ครั้ง → สำเร็จได้ 1 เท่านั้น (ตัวเก่าเพิกถอนครั้งเดียว)
  const twice = await ak.createApiKey(ctxA, "หมุนแข่ง", { scopes: ["account.doc.view"] });
  const race = await Promise.allSettled([ak.rotateApiKey(ctxA, twice.id), ak.rotateApiKey(ctxA, twice.id)]);
  const okCount = race.filter((r) => r.status === "fulfilled").length;
  const children = await prisma.apiKey.count({ where: { rotatedFromId: twice.id } as Any });
  chk("AK-5.6", "หมุนพร้อมกัน 2 ครั้ง → สำเร็จ 1 · ลูก 1 (claim อะตอมมิก)", okCount === 1 && children === 1, "1/1", `${okCount}/${children}`);

  // ═══ AK-6 list ═══
  const list = (await ak.listApiKeys(ctxA)) as Record<string, unknown>[];
  const rowL = list.find((k) => k.id === rotated.id);
  chk("AK-6.1", "listApiKeys มี scopes/systemId/expiresAt/rotatedFromId · ไม่มี keyHash",
    !!rowL && Array.isArray(rowL.scopes) && rowL.systemId === accA.id && rowL.expiresAt instanceof Date && rowL.rotatedFromId === scoped.id && list.every((k) => !("keyHash" in k)),
    "ครบ ไม่มี hash", JSON.stringify(Object.keys(rowL ?? {})));

  // ═══ AK-7 scopes.ts ═══
  if (!scopesMod) chk("AK-7.0", "มี src/lib/api-keys/scopes.ts", false, "มี", "ยังไม่สร้าง");
  else {
    const bundles = scopesMod.API_SCOPE_BUNDLES as { id: string; label: string; summary: string; scopes: string[] }[];
    const ids = bundles.map((b) => b.id);
    chk("AK-7.1", "bundle 5 ชุด id ตามสัญญา", JSON.stringify(ids) === JSON.stringify(["read-only", "issue-and-collect", "accountant", "danger", "settings"]), "5 ชุด", JSON.stringify(ids));
    const allBundleScopes = bundles.flatMap((b) => b.scopes);
    chk("AK-7.2", "ทุก scope ใน bundle เป็น permission key จริง module account + ไม่ใช่ param key",
      allBundleScopes.every((s) => perms.isPermissionKey(s) && s.startsWith("account.") && !perms.isPermissionParamKey(s)),
      "ทั้งหมด", allBundleScopes.filter((s) => !perms.isPermissionKey(s) || !s.startsWith("account.") || perms.isPermissionParamKey(s)).join(","));
    chk("AK-7.3", "bundle มี label ไทย + summary อังกฤษ", bundles.every((b) => /[ก-๙]/.test(b.label) && /^[\x00-\x7F]+$/.test(b.summary) && b.summary.length > 10), "ครบ", "?", "MINOR");
    const ro = bundles.find((b) => b.id === "read-only")!;
    const ic = bundles.find((b) => b.id === "issue-and-collect")!;
    const acct = bundles.find((b) => b.id === "accountant")!;
    const dg = bundles.find((b) => b.id === "danger")!;
    chk("AK-7.4", "read-only ⊂ issue-and-collect ⊂ accountant · danger ไม่ทับกับ accountant",
      ro.scopes.every((s) => ic.scopes.includes(s)) && ic.scopes.every((s) => acct.scopes.includes(s)) && dg.scopes.every((s) => !acct.scopes.includes(s)),
      "ซ้อนกันถูก", "?");
    chk("AK-7.5", "danger ครอบ void/payment.void/period.reopen/wht.unmark/contact.merge/cheque.void/asset.writeoff/doc.approve",
      ["account.doc.void", "account.payment.void", "account.period.reopen", "account.wht.unmark", "account.contact.merge", "account.cheque.void", "account.asset.writeoff", "account.doc.approve"].every((s) => dg.scopes.includes(s)),
      "ครบ", dg.scopes.join(","));
    chk("AK-7.6", "read-only = doc.view report.view journal.view tax.view",
      JSON.stringify([...ro.scopes].sort()) === JSON.stringify(["account.doc.view", "account.journal.view", "account.report.view", "account.tax.view"]), "4 ตัว", ro.scopes.join(","));
    chk("AK-7.7", "DEFAULT_BUNDLE_ID = issue-and-collect · DEFAULT_KEY_TTL_DAYS = 365",
      scopesMod.DEFAULT_BUNDLE_ID === "issue-and-collect" && scopesMod.DEFAULT_KEY_TTL_DAYS === 365, "ตรง", `${scopesMod.DEFAULT_BUNDLE_ID}/${scopesMod.DEFAULT_KEY_TTL_DAYS}`);
    const expanded = scopesMod.expandBundles(["read-only", "danger", "read-only"]) as string[];
    chk("AK-7.8", "expandBundles ไม่ซ้ำ + รวมทั้ง 2 ชุด", new Set(expanded).size === expanded.length && expanded.includes("account.doc.view") && expanded.includes("account.doc.void"), "รวม ไม่ซ้ำ", `${expanded.length}`);
    const covering = scopesMod.bundlesCovering([...acct.scopes]) as string[];
    chk("AK-7.9", "bundlesCovering(accountant scopes) มี read-only/issue-and-collect/accountant ไม่มี danger",
      ["read-only", "issue-and-collect", "accountant"].every((i) => covering.includes(i)) && !covering.includes("danger"), "3 ชุด", covering.join(","));
    const keys = scopesMod.ACCOUNT_SCOPE_KEYS as string[];
    const nonApi = (scopesMod.NON_API_SCOPE_KEYS ?? []) as string[];
    chk("AK-7.9b", "NON_API_SCOPE_KEYS มี account.approve.limit (ค่าตั้ง ไม่ใช่การกระทำ) และไม่อยู่ใน bundle ใด", nonApi.includes("account.approve.limit") && !allBundleScopes.includes("account.approve.limit"), "ไม่อยู่ใน bundle", allBundleScopes.filter((s) => nonApi.includes(s)).join(","));
    const accountPerms = perms.PERMISSIONS.filter((p: Any) => p.module === "account" && !perms.isPermissionParamKey(p.key) && !nonApi.includes(p.key)).map((p: Any) => p.key as string);
    chk("AK-7.10", "ACCOUNT_SCOPE_KEYS = permission key ของ module account ทั้งหมด (ไม่รวม param/ค่าตั้ง)",
      JSON.stringify([...keys].sort()) === JSON.stringify([...accountPerms].sort()), `${accountPerms.length} ตัว`, `${keys.length} ตัว`);
    chk("AK-7.11", "accountant ∪ danger ∪ settings = ACCOUNT_SCOPE_KEYS ทั้งหมด (ไม่มี key ตกหล่นจาก bundle)",
      keys.every((k) => allBundleScopes.includes(k)), "ครบ", keys.filter((k) => !allBundleScopes.includes(k)).join(","), "MAJOR");
    const unknownExpand = await thrown(async () => scopesMod.expandBundles(["nope"]));
    chk("AK-7.12", "expandBundles id ที่ไม่รู้จัก → throw ไทย", isThai(unknownExpand), "throw ไทย", `${unknownExpand}`, "MINOR");
  }

  // ═══ AK-8 route-auth ═══
  const aScoped = await routeAuth.authenticateApiRequest(reqOf(rotated.rawKey));
  chk("AK-8.1", "authenticateApiRequest คืน scopes + systemId + expiresAt",
    aScoped?.ok === true && Array.isArray(aScoped.scopes) && aScoped.scopes.includes("account.doc.view") && aScoped.systemId === accA.id && aScoped.expiresAt instanceof Date,
    "ครบ", JSON.stringify({ ok: aScoped?.ok, scopes: aScoped?.scopes, sys: aScoped?.systemId }));
  const aLegacy = await routeAuth.authenticateApiRequest(reqOf(rotLegacy.rawKey));
  chk("AK-8.2", "คีย์แบบเดิม → scopes [] systemId null (พฤติกรรมเดิม)", aLegacy?.ok === true && aLegacy.scopes?.length === 0 && aLegacy.systemId === null, "[]/null", JSON.stringify(aLegacy?.scopes));
  const aNone = await routeAuth.authenticateApiRequest(reqOf());
  chk("AK-8.3", "ไม่มี key → 401 (เดิม)", aNone?.ok === false && aNone?.response?.status === 401, "401", `${aNone?.response?.status}`);

  // ═══ AK-9 audit actorType ═══
  await access.writeAudit({ tenantId: tidA, actorType: "API_KEY", actorId: rotated.id, action: "account.doc.create", targetType: "QC", targetId: "t1", after: { keyName: "คีย์บัญชี" } });
  await access.writeAudit({ tenantId: tidA, actorId: "user-z", action: "account.doc.create", targetType: "QC", targetId: "t2" });
  const auditKey = await prisma.auditLog.findFirst({ where: { tenantId: tidA, targetId: "t1" } });
  const auditUser = await prisma.auditLog.findFirst({ where: { tenantId: tidA, targetId: "t2" } });
  chk("AK-9.1", "writeAudit actorType API_KEY → แถว actorType API_KEY + actorId = keyId", auditKey?.actorType === ("API_KEY" as Any) && auditKey?.actorId === rotated.id, "API_KEY", `${auditKey?.actorType}/${auditKey?.actorId}`);
  chk("AK-9.2", "writeAudit ไม่ระบุ actorType → USER (เดิม)", auditUser?.actorType === "USER", "USER", `${auditUser?.actorType}`);

  // ═══ AK-10 cross-tenant ═══
  const listB = (await ak.listApiKeys(ctxB)) as Record<string, unknown>[];
  chk("AK-10.1", "ร้าน B ไม่เห็นคีย์ร้าน A", listB.length === 0, "0", `${listB.length}`);
  const rotCross = await thrown(() => ak.rotateApiKey(ctxB, rotated.id));
  const stillOk = await ak.verifyApiKey(rotated.rawKey);
  chk("AK-10.2", "ร้าน B หมุนคีย์ร้าน A ไม่ได้ (throw) และคีย์ A ยังใช้ได้", rotCross !== null && stillOk?.tenantId === tidA, "throw + ยังใช้ได้", `${rotCross}`);
  const revokeCross = await ak.revokeApiKey(ctxB, rotated.id);
  const stillOk2 = await ak.verifyApiKey(rotated.rawKey);
  chk("AK-10.3", "ร้าน B เพิกถอนคีย์ร้าน A → false และคีย์ยังใช้ได้", revokeCross === false && stillOk2?.tenantId === tidA, "false", `${revokeCross}`);

  // ═══ AK-11 ApiIdempotency scope registry ═══
  const dbA = tenantDb(ctxA) as Any;
  const dbB = tenantDb(ctxB) as Any;
  const idemErr = await thrown(() => dbA.apiIdempotency.create({ data: { tenantId: tidA, keyId: rotated.id, idemKey: "k1", requestHash: "h", expiresAt: new Date(Date.now() + 3_600_000) } }));
  chk("AK-11.1", "ApiIdempotency ลงทะเบียน scope.ts (tenant axis) — สร้างผ่าน tenantDb ได้", idemErr === null, "สร้างได้", `${idemErr}`);
  const idemB = await dbB.apiIdempotency.findMany({});
  chk("AK-11.2", "ร้าน B มองไม่เห็นแถว idempotency ของ A", Array.isArray(idemB) && idemB.length === 0, "0", `${idemB?.length}`);
  const dupErr = await thrown(() => dbA.apiIdempotency.create({ data: { tenantId: tidA, keyId: rotated.id, idemKey: "k1", requestHash: "h2", expiresAt: new Date(Date.now() + 3_600_000) } }));
  chk("AK-11.3", "(keyId, idemKey) ซ้ำ → DB ปฏิเสธ", dupErr !== null, "unique violation", "ไม่ปฏิเสธ");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 200)}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const tid of [tidA, tidB]) {
    if (!tid) continue;
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API Keys (A1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
