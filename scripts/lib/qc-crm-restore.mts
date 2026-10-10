// qc-crm-restore.mts — shared SNAPSHOT / RESTORE for the CRM C4 runners (C4.2 buttons · C4.3 forms · C4.4 journeys)
//
// Extracted (COPIED, behaviour-identical) from scripts/qc-crm-buttons.mts (C4.2 — "SNAPSHOT / RESTORE" + the tag sweep)
// by C4.3 so every C4 runner leaves the QC tenant exactly as it found it. qc-crm-buttons.mts still carries its own copy
// until the controller switches it over at merge (owner of that file ≠ C4.3).
//
// What it does (unchanged from C4.2):
//   takeSnapshot()      reads EVERY row of SNAP_MODELS for the tenant (chunks of 6 parallel reads)
//   restoreSnapshot()   up to 4 passes: (1) rows that did not exist at snapshot time are deleted, children first
//                       (skipped with keepNew — mid-group "repair seeded rows only") · (2) changed / missing snapshot rows
//                       are written back / re-created, parents first · JSON null → Prisma.DbNull · Decimal/BigInt compared
//                       through stable()
//   protect(id)         rows created ON PURPOSE (fixtures/sessions) survive a restore until unprotect(id)/clearProtect()
//   sweepTag(tag)       second net: delete rows whose tag column contains the literal run tag (e.g. "qc-form-")
// Added by C4.3 (opt-in, the C4.2 runner does not call them):
//   purgeAppendOnlySince()  AuditLog / OutboxEvent / AppNotification (+ opts.appendOnlyExtra) rows of this tenant created since the snapshot
//                           (the log tables the snapshot deliberately does not restore) — so a run is byte-identical
//                           instead of "identical except history". Only safe while the caller holds the QC gate lock.
//   B2 (C4.3 review): any read error in takeSnapshot/restoreSnapshot/verify THROWS (never "empty table"); only a model
//                           absent from the Prisma client is tolerated and listed by missingModels()
//   verify()                re-reads every SNAP_MODELS row and compares with the snapshot (0 differences = identical) +
//                           counts rows created since the snapshot in EVERY other tenant-scoped model that has a
//                           createdAt (leftovers a consumer/cascade wrote outside SNAP_MODELS)
//
// 🔴 The caller must have loaded the QC env (acc-v2-env loadQcEnv / qc3.sh) BEFORE importing prisma, and passes its own
//    prisma + Prisma namespace in (this file never imports @/lib/core/db — importing it here would bypass the caller's
//    env guard ordering).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Parents first (creates run in this order, deletes in reverse). Every model here has a single `id` and a `tenantId`
// (verified through Prisma DMMF on QC1, 27 Sep 2569 — ledger/wo-notes/crm-C4.2.md §3). C4.3 added "MemberSection"
// (parent of MemberField): creating the first company/contact/object lazily provisions a "system" section — the C4.2 list
// restored the fields but left those sections behind (found by verify() on QC3, 27 Sep). Log-only tables (AuditLog,
// OutboxEvent, AppNotification) are deliberately NOT restored: they are append-only history, never read back as state.
export const SNAP_MODELS = [
  "AppSystem", "Team", "TeamMember", "Party", "Customer", "MemberConsent", "MemberSection", "MemberField",
  "CrmPipeline", "CrmStage", "CrmLostReason", "CrmCompany", "CrmContact", "CrmCompanyContact",
  "CrmDeal", "CrmDealContact", "CrmDealLine", "CrmDealStageHistory", "CrmDealPayment", "CrmActivity",
  "CrmVisibilityPolicy", "FileAsset", "CrmFileLink", "CrmContactConsent",
  "CustomObject", "CustomRecord", "CustomRecordValue", "CustomRecordValueHistory",
  "CrmScoreRule", "CrmScoreLog", "CrmAssignmentRule", "CrmSequence", "CrmSequenceStep", "CrmSequenceEnrollment",
  "CrmEmailTemplate", "CrmEmailUserSetting", "CrmMailProvider", "EmailDomain", "CrmEmailMessage", "CrmEmailEvent",
  "CrmTrackedLink", "CrmTrackedClick", "CrmWebSession", "CrmWebEvent", "CrmUserPref", "CrmImportJob", "CrmQuota",
  "CrmCommissionRule", "CrmCommission", "CrmPortalAccess", "CrmPortalRequest", "PortalSession",
  "MemberSavedView", "ApiKey", "WebhookEndpoint", "AutomationRule", "AutomationRun", "FormDef", "KanbanCard", "AiProposal",
] as const;

/** append-only history the snapshot does not restore (C4.3 purgeAppendOnlySince() removes this run's rows) */
export const APPEND_ONLY_MODELS = ["AuditLog", "OutboxEvent", "AppNotification"] as const;

/** second net under SNAPSHOT/RESTORE — the column each model's typed values land in (C4.2 list, unchanged) */
export const SWEEP: { model: string; field: string; scope: "systemId" | "tenantId" }[] = [
  { model: "CrmDeal", field: "title", scope: "systemId" },
  { model: "CrmContact", field: "name", scope: "systemId" },
  { model: "CrmCompany", field: "name", scope: "systemId" },
  { model: "CrmActivity", field: "title", scope: "systemId" },
  { model: "CrmSequence", field: "name", scope: "systemId" },
  { model: "CrmPipeline", field: "name", scope: "systemId" },
  { model: "CrmStage", field: "name", scope: "systemId" },
  { model: "CrmLostReason", field: "label", scope: "systemId" },
  { model: "CustomObject", field: "label", scope: "systemId" },
  { model: "MemberSavedView", field: "name", scope: "tenantId" },
  { model: "WebhookEndpoint", field: "url", scope: "tenantId" },
  { model: "Team", field: "name", scope: "tenantId" },
];

export const toCamel = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
export const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x && typeof x === "object" && typeof (x as Any).toFixed === "function" && (x as Any).constructor?.name === "Decimal" ? `D${String(x)}` : x));

export type RestoreStats = { deleted: number; updated: number; recreated: number; failed: string[]; byModel?: Record<string, string> };
export type RestoreLogEntry = { label: string } & RestoreStats;
export type VerifyResult = {
  identical: boolean;
  changed: string[]; // "Model#id" whose content differs from the snapshot
  missing: string[]; // "Model#id" in the snapshot, gone now
  extra: string[]; // "Model#id" created since the snapshot (not protected)
  appendOnlySince: Record<string, number>; // AuditLog/OutboxEvent/AppNotification rows created since the snapshot
  leftoversSince: Record<string, number>; // every OTHER tenant-scoped model with createdAt: rows created since the snapshot
};

export type Restorer = {
  readonly models: readonly string[];
  takeSnapshot(): Promise<{ tables: number; rows: number; at: Date }>;
  restoreSnapshot(label: string, opts?: { keepNew?: boolean }): Promise<RestoreStats>;
  protect(id: string): void;
  unprotect(id: string): void;
  clearProtect(): void;
  sweepTag(tag: string, systemId: string): Promise<number>;
  purgeAppendOnlySince(): Promise<Record<string, number>>;
  verify(): Promise<VerifyResult>;
  snapshotAt(): Date | null;
  hasSnapshot(): boolean;
  missingModels(): string[];
  readonly restoreLog: RestoreLogEntry[];
};

/**
 * @param prisma   the caller's PrismaClient (QC env already loaded)
 * @param Prisma   the `Prisma` namespace from @prisma/client (DMMF + DbNull)
 * @param tenantId the ONE tenant every read/write is scoped to
 */
export function createRestorer(opts: {
  prisma: Any; Prisma: Any; tenantId: string; models?: readonly string[]; log?: (line: string) => void;
  /** extra tenant-scoped models (with createdAt) the caller's run writes as a side effect and wants treated like the
   *  append-only logs — e.g. ApiIdempotency rows of a REST-calling runner (C4.3) */
  appendOnlyExtra?: readonly string[];
}): Restorer {
  const P = opts.prisma;
  const { Prisma } = opts;
  const TENANT = opts.tenantId;
  const MODELS: readonly string[] = opts.models ?? SNAP_MODELS;
  const log = opts.log ?? ((s: string) => console.log(s));
  const APPEND_ONLY: readonly string[] = [...APPEND_ONLY_MODELS, ...(opts.appendOnlyExtra ?? [])];

  const DMMF_MODELS = (Prisma?.dmmf?.datamodel?.models ?? []) as { name: string; fields: { name: string; kind: string; type: string }[] }[];
  const FIELD_INFO = new Map<string, { scalars: string[]; json: Set<string> }>();
  for (const m of MODELS) {
    const dm = DMMF_MODELS.find((x) => x.name === m);
    if (!dm) continue;
    FIELD_INFO.set(m, {
      scalars: dm.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name),
      json: new Set(dm.fields.filter((f) => f.type === "Json").map((f) => f.name)),
    });
  }

  type Snap = Map<string, Map<string, Any>>;
  let SNAP: Snap | null = null;
  let SNAP_AT: Date | null = null;
  const PROTECT = new Set<string>();
  const restoreLog: RestoreLogEntry[] = [];

  // C4.3 review B2: a read error MUST abort — the old `catch { return [] }` turned a transient failure during takeSnapshot()
  //   into "this table was empty", so the next restore DELETED every row of that table and verify() still said identical.
  //   Only a model that does not exist in this client (older schema) is tolerated, and it is reported, never guessed.
  const missingModels = new Set<string>();
  async function readAll(model: string): Promise<Any[]> {
    const delegate = P[toCamel(model)];
    if (!delegate || typeof delegate.findMany !== "function") { missingModels.add(model); return []; }
    try { return await delegate.findMany({ where: { tenantId: TENANT } }); }
    catch (e) { throw new Error(`qc-crm-restore: อ่านตาราง ${model} ไม่ได้ — หยุดก่อนแตะข้อมูล (${e instanceof Error ? e.message.split("\n").slice(-1)[0] : e})`); }
  }
  async function readAllModels(): Promise<Map<string, Any[]>> {
    const out = new Map<string, Any[]>();
    const models = [...MODELS];
    for (let i = 0; i < models.length; i += 6) {
      const chunk = models.slice(i, i + 6);
      const res = await Promise.all(chunk.map((m) => readAll(m)));
      chunk.forEach((m, j) => out.set(m, res[j]!));
    }
    return out;
  }
  function toData(model: string, row: Any): Any {
    const info = FIELD_INFO.get(model);
    const data: Any = {};
    for (const f of info?.scalars ?? Object.keys(row)) {
      if (!(f in row)) continue;
      const v = row[f];
      data[f] = v === null && info?.json.has(f) ? Prisma.DbNull : v;
    }
    return data;
  }

  async function takeSnapshot(): Promise<{ tables: number; rows: number; at: Date }> {
    // the snapshot instant = the EARLIER of the DB clock and this process's clock, minus 1 s (Prisma fills
    // @default(now()) client-side on some paths, the DB on others) — used only for the append-only purge / leftovers
    let dbNow = Date.now();
    try { const r = (await P.$queryRawUnsafe(`SELECT now() AS n`)) as { n: Date }[]; dbNow = new Date(r[0]!.n).getTime(); } catch { /* keep local */ }
    SNAP_AT = new Date(Math.min(dbNow, Date.now()) - 1000);
    const all = await readAllModels();
    SNAP = new Map();
    for (const [m, rows] of all) SNAP.set(m, new Map(rows.map((r) => [r.id as string, r])));
    const n = [...SNAP.values()].reduce((a, m) => a + m.size, 0);
    log(`📸 snapshot ${SNAP.size} ตาราง · ${n} แถว (tenant ${TENANT})`);
    return { tables: SNAP.size, rows: n, at: SNAP_AT };
  }

  /** put every MODELS row of this tenant back to the snapshot — returns what it had to do (logged in restoreLog) */
  async function restoreSnapshot(label: string, o: { keepNew?: boolean } = {}): Promise<RestoreStats> {
    const st: RestoreStats = { deleted: 0, updated: 0, recreated: 0, failed: [], byModel: {} };
    if (!SNAP) return st;
    const bump = (m: string, k: "d" | "u" | "r", n = 1) => { const cur = st.byModel![m] ?? "d0 u0 r0"; const o = Object.fromEntries(cur.split(" ").map((x) => [x[0]!, Number(x.slice(1))])); o[k] = (o[k] ?? 0) + n; st.byModel![m] = `d${o.d} u${o.u} r${o.r}`; };
    const errs = new Map<string, string>();
    for (let pass = 0; pass < 4; pass++) {
      const cur = await readAllModels();
      let pending = 0;
      // 1) rows that did not exist at snapshot time — children first (mid-group repairs keep them)
      for (const m of o.keepNew ? [] : [...MODELS].reverse()) {
        const snapM = SNAP.get(m); if (!snapM) continue;
        const extra = (cur.get(m) ?? []).filter((r) => !snapM.has(r.id) && !PROTECT.has(r.id)).map((r) => r.id as string);
        if (!extra.length) continue;
        try { const c = (await P[toCamel(m)].deleteMany({ where: { id: { in: extra } } })).count; st.deleted += c; bump(m, "d", c); }
        catch {
          for (const id of extra) {
            try { await P[toCamel(m)].delete({ where: { id } }); st.deleted++; bump(m, "d"); }
            catch (e) { pending++; errs.set(`${m}#${id}`, `ลบไม่ได้: ${e instanceof Error ? e.message.split("\n").slice(-1)[0]!.slice(0, 140) : e}`); }
          }
        }
      }
      // 2) changed / missing snapshot rows — parents first
      for (const m of MODELS) {
        const snapM = SNAP.get(m); if (!snapM) continue;
        const now = new Map((cur.get(m) ?? []).map((r) => [r.id as string, r]));
        for (const [id, row] of snapM) {
          const n = now.get(id);
          if (n && stable(n) === stable(row)) continue;
          try {
            if (!n) { await P[toCamel(m)].create({ data: toData(m, row) }); st.recreated++; bump(m, "r"); }
            else { const d = toData(m, row); delete d.id; await P[toCamel(m)].update({ where: { id }, data: d }); st.updated++; bump(m, "u"); }
            errs.delete(`${m}#${id}`);
          } catch (e) { pending++; errs.set(`${m}#${id}`, `${n ? "คืนค่า" : "สร้างคืน"}ไม่ได้: ${e instanceof Error ? e.message.split("\n").slice(-1)[0]!.slice(0, 140) : e}`); }
        }
      }
      if (pending === 0) { errs.clear(); break; }
    }
    st.failed = [...errs].map(([k, v]) => `${k} ${v}`);
    if (st.deleted || st.updated || st.recreated || st.failed.length) {
      restoreLog.push({ label, ...st });
      log(`  ♻️  คืนฐาน (${label}): ลบแถวใหม่ ${st.deleted} · คืนค่า ${st.updated} · สร้างคืน ${st.recreated} [${Object.entries(st.byModel ?? {}).map(([m, v]) => `${m} ${v}`).join(" · ")}]${st.failed.length ? ` · ❌ ค้าง ${st.failed.length}: ${st.failed.slice(0, 3).join(" | ")}` : ""}`);
    }
    return st;
  }

  async function sweepTag(tag: string, systemId: string): Promise<number> {
    let cleaned = 0;
    for (const s of SWEEP) {
      try {
        const where = s.scope === "systemId" ? { systemId, [s.field]: { contains: tag } } : { tenantId: TENANT, [s.field]: { contains: tag } };
        cleaned += (await P[toCamel(s.model)].deleteMany({ where })).count;
      } catch { /* model/field mismatch — ignore */ }
    }
    return cleaned;
  }

  async function purgeAppendOnlySince(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (!SNAP_AT) return out;
    for (const m of APPEND_ONLY) {
      try { out[m] = (await P[toCamel(m)].deleteMany({ where: { tenantId: TENANT, createdAt: { gte: SNAP_AT } } })).count; }
      catch (e) { out[m] = -1; log(`  ⚠️ purge ${m} ไม่สำเร็จ — ${e instanceof Error ? e.message.split("\n").slice(-1)[0] : e}`); }
    }
    return out;
  }

  async function verify(): Promise<VerifyResult> {
    const res: VerifyResult = { identical: true, changed: [], missing: [], extra: [], appendOnlySince: {}, leftoversSince: {} };
    if (!SNAP) return { ...res, identical: false, changed: ["(no snapshot taken)"] };
    const cur = await readAllModels();
    for (const m of MODELS) {
      const snapM = SNAP.get(m) ?? new Map();
      const now = new Map((cur.get(m) ?? []).map((r) => [r.id as string, r]));
      for (const [id, row] of snapM) {
        const n = now.get(id);
        if (!n) res.missing.push(`${m}#${id}`);
        else if (stable(n) !== stable(row)) res.changed.push(`${m}#${id}`);
      }
      for (const id of now.keys()) if (!snapM.has(id) && !PROTECT.has(id)) res.extra.push(`${m}#${id}`);
    }
    if (SNAP_AT) {
      for (const m of APPEND_ONLY) {
        if (!P[toCamel(m)]?.count) { res.appendOnlySince[m] = 0; continue; }
        res.appendOnlySince[m] = await P[toCamel(m)].count({ where: { tenantId: TENANT, createdAt: { gte: SNAP_AT } } }); // throws on read error (B2)
      }
      const skip = new Set<string>([...MODELS, ...APPEND_ONLY]);
      const others = DMMF_MODELS.filter((dm) => !skip.has(dm.name)
        && dm.fields.some((f) => f.name === "tenantId" && f.kind === "scalar")
        && dm.fields.some((f) => f.name === "createdAt" && f.type === "DateTime"));
      for (let i = 0; i < others.length; i += 8) {
        const chunk = others.slice(i, i + 8);
        const counts = await Promise.all(chunk.map((dm) => (P[toCamel(dm.name)]?.count ? P[toCamel(dm.name)].count({ where: { tenantId: TENANT, createdAt: { gte: SNAP_AT } } }) : 0)));
        chunk.forEach((dm, j) => { if (counts[j]) res.leftoversSince[dm.name] = counts[j] as number; });
      }
    }
    res.identical = !res.changed.length && !res.missing.length && !res.extra.length
      && Object.values(res.appendOnlySince).every((n) => n === 0) && Object.keys(res.leftoversSince).length === 0;
    return res;
  }

  return {
    models: MODELS,
    takeSnapshot, restoreSnapshot, sweepTag, purgeAppendOnlySince, verify,
    missingModels: () => [...missingModels],
    protect: (id: string) => { PROTECT.add(id); },
    unprotect: (id: string) => { PROTECT.delete(id); },
    clearProtect: () => { PROTECT.clear(); },
    snapshotAt: () => SNAP_AT,
    hasSnapshot: () => SNAP !== null,
    restoreLog,
  };
}
