// QC — CRM v2 WO C2.9: business-module events (decision C11) — the ONE state-change function of 8 business modules emits its event
//      INSIDE the same transaction · 3 registries per event · the CRM extra writes ONE activity + lifecycle CUSTOMER through the Party ·
//      `partyId` is really written when a transaction is created (the 9 write sites of C1.1)
// Oracle writer · the C2.9 builder must NOT touch this file · QC database only (.env.qc / .env.qc2 — loaded by scripts/acc-v2-env.mts)
// Run: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.9.mts
//      `--force-run` = run every check while `crm-bridges/business.ts` is absent — C2.9 checks red for the right reason, the fixtures
//                      (8 real business transactions), the fault injector and CLEAN green
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c29-<rand>-*`)
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (the brief asks for the FULL suite of every module this work order opens):
//   qc-ticket-money · qc-ticket-cancel · qc-ticket-public · qc-rental · qc-rental-race · qc-rental-refund · qc-rental-public ·
//   qc-school · qc-school-refund · qc-school-public · qc-hotel-money · qc-hotel-refund · qc-hotel-public · qc-clinic · qc-clinic-refund ·
//   qc-clinic-public · qc-queue-public · qc-booking-* · qc-shop · qc-shop-refund · qc-member-m2.8 · qc-member-fix-s2 · qc-automation ·
//   qc-webhook · qc-cron · qc-crm-c1.8 (events + 3 registries + compose) · qc-crm-c1.11 (S6.10 gate-first static rule) · qc-crm-v1 ·
//   every earlier qc-crm-c1.* / c2.* · qc-member-m1.9 (30/15/10/5 — untouched).
//
// SOURCES: crm-brief-C2.9.md (the verified table of the 8 state-change functions + "wrap ONLY the claim + emitOutbox; pos.createSale
//   stays outside") · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-B: NO rental.overdue sweep · `school.completed` is NOT built —
//   only `school.enrolled` on PAID · no CRM consumers for reward/voucher/point/campaign · R-C.2 model names + "partyId write sites =
//   9 tables" · R-C.8 keys `<type>#<id>#<seq>` · R-D `crm-bridges/business.ts` is C2.9's file · R-E.14 uiVersion 1 / bridgesEnabled) ·
//   CRM-RUN §2 "C2.9" (8 systems × 3 = 24 · partyId 2 = 26) · MASTER-PLAN §4 (X1 X4 X8) §6 row C2.9 · blueprint §7.2 (the business
//   event table: "กิจกรรม/ไทม์ไลน์ผ่าน Party · scoring · lifecycle CUSTOMER · ดีล RENEWAL pipeline (ถ้ากฎตั้ง)") §9 (module edges) ·
//   src/lib/platform/crm-bridges/core.ts (the 6 folder rules: GATE FIRST · extras under `compose` · flag-then-write · one tenant ·
//   ids only · never write another module's table with raw prisma — every write goes through the owner's facade) ·
//   src/lib/modules/crm/activities.ts:1164 `recordSystemActivityInTx` + :1210 `createSequenceTaskOnce` (the two existing patterns the
//   new writer must follow) · src/lib/modules/booking/service.ts:720 (THE model emit: `emitOutbox(tx, …)` inside `$transaction`,
//   key `booking.completed#<appointmentId>`) · src/lib/modules/shop/service.ts:245 (`shop.order.paid` — payload still carries
//   customerName/customerPhone: a debt of the shop module per R-E.17, CRM must read by id) · src/lib/core/outbox.ts:34 (emitOutbox
//   dedupes on (tenantId, idempotencyKey) — silently, so a pre-seeded row is NOT an error) · prisma/schema/crm.prisma
//   (CrmActivityType has VISIT but NO "PURCHASE" · CrmActivitySource has AUTO · CrmLifecycleStage LEAD/PROSPECT/CUSTOMER/LOST/CHURNED) ·
//   the 9 partyId sites: TicketOrder · RentalBooking · SchoolEnrollment · HotelReservation · PatientRecord · ClinicVisit · QueueTicket ·
//   Appointment · ShopOrder (each written by that module's `linkPartyAfterCommit` / `patientPartyId` through `party.safeFindOrCreate`).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   A. SIX NEW EVENTS, each emitted with `emitOutbox(tx, …)` in the SAME transaction as the state change (where the function has no
//      transaction today, wrap ONLY the atomic claim + the emit in `prisma.$transaction`; `pos.createSale` / stock / POS lookups stay
//      outside exactly as today). Key = `<type>#<rowId>` (R-C.8). Payload = ids + `unitId` + `partyId` (when the row has one) + the
//      amount in satang where natural. NO name / phone / e-mail / clinical field.
//        `ticket.order.paid`    { orderId, unitId, partyId?, eventId, totalSatang }        ← ticket.markPaid (status PENDING→PAID)
//        `rental.returned`      { bookingId, unitId, partyId?, assetId, totalSatang }      ← rental.returnAsset (PICKED_UP→RETURNED)
//        `school.enrolled`      { enrollmentId, unitId, partyId?, classId, priceSatang }   ← school.markPaid (ENROLLED→PAID · R-B: the
//                                                                                            event of the school module, on PAID)
//        `hotel.checked_out`    { reservationId, unitId, partyId?, nights, totalSatang }   ← hotel.checkOut (CHECKED_IN→CHECKED_OUT)
//        `clinic.visit.done`    { visitId, unitId, partyId?, patientId }                   ← clinic.billVisit (OPEN→BILLED) — "a visit
//                                                                                            happened" ONLY: no symptom/diagnosis/
//                                                                                            allergy/drug/fee field anywhere (X8)
//        `queue.served`         { ticketId, unitId, partyId?, typeId, counterId? }          ← queue.markDone (CALLED|SERVING→DONE)
//      The two EXISTING events keep their emit and their payload: `booking.completed` / `booking.no_show` (already inside the status tx)
//      and `shop.order.paid` (inside the posSaleId-link tx; its PII payload stays for its current consumers — R-E.17 — and is recorded
//      as a debt of the shop module). C2.9 adds only the CRM extra to their consumers.
//   B. REGISTRIES — for each of the six new types, inside a `// CRM C2.9 ▸ … ◂` block: a Thai label in `src/lib/automation/labels.ts`
//      (AUTOMATION_EVENTS, declared EXACTLY ONCE; `src/lib/webhooks/labels.ts` gets it by the spread — never re-declared there) and a
//      consumer in `src/lib/outbox-consumers.ts` (`withAutomation(compose(<no-op base>, crmBridge("onBusinessEvent")))`). The two
//      existing consumers get the same extra appended inside their own `// CRM C2.9 ▸` block, keeping everything they already do.
//      An event type without a consumer stalls the whole queue — [[reference_outbox_new_event_needs_consumer]].
//   C. `src/lib/platform/crm-bridges/business.ts` (R-D — C2.9 owns the file) exports ONE handler
//      `onBusinessEvent(evt: BridgeEvent): Promise<void>` used by all 8 types, re-exported from `crm-bridges/index.ts`:
//        1 GATE FIRST (folder rule 1 + qc-crm-c1.11 S6.10): `openCrmSystems(evt.tenantId)` / `crmGate` before anything is read or
//          written — uiVersion 1 or bridgesEnabled false ⇒ return, nothing written, the event still resolves
//        2 resolve the Party of the source row by id UNDER `evt.tenantId` (X1: a forged id of another tenant ⇒ nothing) — never from
//          the payload's name/phone, never from `shop.order.paid`'s customerName/customerPhone
//        3 the CRM contact = the live contact of that Party in each open CRM system (`resolveCanonical` like core.ts does) — NO contact
//          ⇒ nothing is written and the event resolves (C2.9 does not turn walk-ins into leads; lead creation stays with C2.4/C2.6)
//        4 write through the CRM facade only (folder rule 6) — see D
//        5 ids only in logs (X8) · throw on a real failure (the `compose` wrapper turns it into a WARN — folder rule 2)
//   D. CRM writers (the bridge calls these; no raw prisma on CRM tables from the bridge):
//        `crm.activities.recordBusinessActivityOnce(ctx, { sourceRef, title, contactId, at, refType?, refId? })` → { id, created }
//          — ONE `CrmActivity` per (system, contact, sourceRef): advisory lock on the sourceRef + a prior-row check in the same tx
//          (AUDIT-CLASS X4, the `createSequenceTaskOnce` pattern) · type `VISIT` and source `AUTO` (the enums have no PURCHASE and no
//          BUSINESS value and C2.9 has NO migration) · doneAt/startAt = the event time · `lastActivityAt` of the contact moves in the
//          same statement-set · Thai title from a fixed table (no customer data)
//        `crm.contacts.markCustomerFromBridge(ctx, { contactId, at })` → number — ONE conditional `updateMany`:
//          lifecycleStage LEAD | PROSPECT | CHURNED ⇒ CUSTOMER (CUSTOMER stays CUSTOMER, LOST is left alone), never a downgrade
//        both are audited through the module's own audit writer (actorType SYSTEM) and carry no customer PII
//   E. `partyId` (C1.1, verified by this oracle — no migration, no new column): every one of the 9 write sites keeps writing the Party
//      at creation time through `party.safeFindOrCreate`, and two transactions of DIFFERENT modules made for the SAME phone end up on
//      the SAME Party (that is what lets one CRM contact collect activities from every module).
//   F. NO UI and NO migration in this work order: mockup 17 (`/settings/integrations`) belongs to C3.6 (RESOLUTIONS R-A), so there is no
//      D7 image gate here; `CrmActivityType` / `CrmActivitySource` / `CrmLifecycleStage` must be UNCHANGED (checked against pg_enum).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// CHECK INVENTORY: 47 checks = S0 4 (structure · enums untouched · registry hygiene · gate-first) · S1–S8 24 (the 8 modules × 3:
//   .1 emit in the tx — proven with a REAL fault injected on the OutboxEvent insert · .2 the 3 registries · .3 the CRM effect) ·
//   S9 3 (partyId at creation ×2 + one Party across modules) · S10 3 (activity shape · lifecycle only forward · no contact ⇒ nothing) ·
//   X1 3 · X4 2 + COMPOSE 1 · X8 3 · U 3 · CLEAN  (C2.9-FATAL only when something throws).
//   n/a: X2 (no REST op / AI tool — C2.11) · X3 (no shared counter of this work order; the claims are the modules' own, covered by
//   their suites) · X5 (no cron pick-up — R-B kills the overdue sweep) · X6/X7 (no new input surface / public endpoint) ·
//   X9 (no danger op) · X10 (no file/secret).
// HOUSE RULES: SKIP guard before any DB connection · throwaway tenants `qc-c29-<rand>-*` swept in `finally` (every table with tenantId,
//   4 passes) + users · the fault injector is a Postgres trigger on "OutboxEvent" that raises ONLY for our tenant + our event type and
//   is dropped in `finally` · `pos.createSale` (rental/school/shop) drains the outbox globally by design, so every effect assertion is
//   "exactly one" after the auto-drain + manual redeliveries · last line JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BR_FILE = "src/lib/platform/crm-bridges/business.ts";
const BR_INDEX = "src/lib/platform/crm-bridges/index.ts";
const CORE_FILE = "src/lib/platform/crm-bridges/core.ts";
const LABELS_FILE = "src/lib/automation/labels.ts";
const WEBHOOK_LABELS = "src/lib/webhooks/labels.ts";
const CONSUMERS_FILE = "src/lib/outbox-consumers.ts";
const ACT_FILE = "src/lib/modules/crm/activities.ts";
const CONTACTS_FILE = "src/lib/modules/crm/contacts.ts";
const SCHEMA_DIR = "prisma/schema";
const MOD_FILES: Record<string, string> = {
  ticket: "src/lib/modules/ticket/service.ts",
  rental: "src/lib/modules/rental/service.ts",
  school: "src/lib/modules/school/service.ts",
  hotel: "src/lib/modules/hotel/service.ts",
  clinic: "src/lib/modules/clinic/service.ts",
  queue: "src/lib/modules/queue/service.ts",
  booking: "src/lib/modules/booking/service.ts",
  shop: "src/lib/modules/shop/service.ts",
};

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const read = (p: string) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — the C2.9 bridge is absent ⇒ SKIPPED, no DB connection.
// ═══════════════════════════════════════════════════════════════════════════════════
const brSrc0 = read(BR_FILE);
const BUILT = /export\s+async\s+function\s+onBusinessEvent\b/.test(brSrc0) || /export\s+async\s+function\s+on[A-Z]\w*\s*\(/.test(brSrc0);
if (!FORCE && !BUILT) {
  console.log(`⚠️  SKIPPED — WO C2.9 not built yet (${BR_FILE} absent or without an exported on* handler) (run with --force-run to exercise the fixtures, the fault injector and the cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c29-${rand}`;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 240) => { const s = String(v ?? ""); return s.length > n ? `${s.slice(0, n)}…` : s; };
const j = (v: Any): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
const thai = (s: unknown) => /[ก-๙]/.test(String(s ?? ""));
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const MISSING: Res = { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return MISSING;
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const ABSENT = BUILT ? "" : " · [crm-bridges/business.ts ABSENT]";
const FIXTURE_NOTES: string[] = [];
const note = (s: string) => { FIXTURE_NOTES.push(s); return s; };

console.log(`\n═══ QC CRM v2 · C2.9 — business-module events ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${FORCE && !BUILT ? " · --force-run with C2.9 ABSENT (C2.9 checks expected red; fixtures + CLEAN green)" : ""}\n`);

const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => { PII.push(s); return s; };
let seq = 0;
const nx = () => `${++seq}`;
let phoneSeq = 0;
const phoneOf = (): string => pii(`08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`);
const NONE = `${TAG}-none`;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
let TRIGGER_ON = false;

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // S0 — structure
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S0 · structure ──");
  const LAB = (await import("@/lib/automation/labels" as string).catch(() => ({}))) as Any;
  const WH = (await import("@/lib/webhooks/labels" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const BR = (await import("@/lib/platform/crm-bridges" as string).catch(() => ({}))) as Any;
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const brSrc = read(BR_FILE);
  const NEW_TYPES = ["ticket.order.paid", "rental.returned", "school.enrolled", "hotel.checked_out", "clinic.visit.done", "queue.served"];
  const ALL_TYPES = [...NEW_TYPES, "booking.completed", "shop.order.paid"];
  const onBusiness = typeof BR?.onBusinessEvent === "function" ? BR.onBusinessEvent : undefined;
  const recordBiz = (CRM?.activities?.recordBusinessActivityOnce ?? undefined) as Any;
  const markCustomer = (CRM?.contacts?.markCustomerFromBridge ?? undefined) as Any;
  {
    chk("C2.9-S0.1", "R-D: `crm-bridges/business.ts` exists and exports ONE handler `onBusinessEvent` re-exported from crm-bridges/index.ts · the CRM writers it must use exist on the facade: `crm.activities.recordBusinessActivityOnce` (one activity per source row) and `crm.contacts.markCustomerFromBridge` (lifecycle) — the bridge never writes CRM tables with raw prisma (folder rule 6)",
      brSrc.length > 0 && typeof onBusiness === "function" && /onBusinessEvent/.test(read(BR_INDEX)) && typeof recordBiz === "function" && typeof markCustomer === "function",
      "bridge + 2 facade writers", `file=${brSrc.length > 0} onBusinessEvent=${typeof onBusiness} indexExport=${/onBusinessEvent/.test(read(BR_INDEX))} recordBusinessActivityOnce=${typeof recordBiz} markCustomerFromBridge=${typeof markCustomer}${ABSENT}`);
  }
  {
    // no migration in C2.9: the enums the activity/lifecycle use are untouched (mechanical — pg_enum, like C0.4-S2.10)
    const enumsOf = async (name: string): Promise<string[]> => {
      const rows = (await P.$queryRawUnsafe(`select e.enumlabel as l from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = $1 order by e.enumsortorder`, name).catch(() => [])) as Any[];
      return rows.map((r) => String(r.l));
    };
    const act = await enumsOf("CrmActivityType");
    const src = await enumsOf("CrmActivitySource");
    const life = await enumsOf("CrmLifecycleStage");
    const migs = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").filter((d) => /_crm_v2_[a-z]$/.test(d)).sort() : [];
    chk("C2.9-S0.2", "C2.9 has NO migration (R-C.1: exactly three, a/b/c): the DB enums are untouched — CrmActivityType still has VISIT and NO \"PURCHASE\", CrmActivitySource still has AUTO and no BUSINESS value, CrmLifecycleStage still has CUSTOMER/CHURNED, and no fourth *_crm_v2_* migration folder appeared [mechanical]",
      act.includes("VISIT") && !act.includes("PURCHASE") && src.includes("AUTO") && !src.includes("BUSINESS") && life.includes("CUSTOMER") && life.includes("CHURNED") && migs.length <= 3,
      "enums unchanged · ≤ 3 migrations", `activityType=${act.join(",") || "-"} source=${src.length} lifecycle=${life.join(",") || "-"} migrations=${migs.join(",") || "-"}`, "MAJOR");
  }
  {
    const labSrc = read(LABELS_FILE);
    const whSrc = read(WEBHOOK_LABELS);
    const events = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => String(e?.value));
    const labels = new Map(((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => [String(e?.value), String(e?.label ?? "")]));
    const webhookValues = ((WH.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e?.value ?? e));
    const notOnce = NEW_TYPES.filter((t) => events.filter((x) => x === t).length !== 1);
    const noThai = NEW_TYPES.filter((t) => !thai(labels.get(t)));
    const reDeclared = NEW_TYPES.filter((t) => new RegExp(`value:\\s*["']${t.replace(/\./g, "\\.")}["']`).test(whSrc));
    const notWebhook = NEW_TYPES.filter((t) => !webhookValues.includes(t));
    const noCons = ALL_TYPES.filter((t) => typeof CONS?.[t] !== "function");
    const blocks = /CRM C2\.9 ▸/.test(labSrc) && /CRM C2\.9 ▸/.test(read(CONSUMERS_FILE));
    chk("C2.9-S0.3", "the 3 registries as ONE block per file (`// CRM C2.9 ▸ … ◂`): each of the 6 new types is declared EXACTLY ONCE in AUTOMATION_EVENTS with a Thai label, is reachable in WEBHOOK_EVENTS through the spread (never re-declared in webhooks/labels.ts), and all 8 types (6 new + booking.completed + shop.order.paid) have a consumer — a type without a consumer leaves the row PENDING for ever and stalls the queue",
      notOnce.length === 0 && noThai.length === 0 && reDeclared.length === 0 && notWebhook.length === 0 && noCons.length === 0 && blocks,
      "6 labels · 8 consumers", `notOnce=${notOnce.join(",") || "-"} noThaiLabel=${noThai.join(",") || "-"} reDeclaredInWebhooks=${reDeclared.join(",") || "-"} missingFromWebhookEvents=${notWebhook.join(",") || "-"} noConsumer=${noCons.join(",") || "-"} blocks=${blocks}${ABSENT}`);
  }
  {
    // gate-first (folder rule 1 · the static rule qc-crm-c1.11 S6.10 applies to every on* of the folder) + ids-only logs
    const code = brSrc.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    const handlers = [...code.matchAll(/export\s+async\s+function\s+(on[A-Za-z0-9_]*)\s*\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
    const bad: string[] = [];
    for (const h of handlers) {
      const body = code.slice(h.at, code.indexOf("\nexport ", h.at + 1) < 0 ? code.length : code.indexOf("\nexport ", h.at + 1));
      const gateAt = Math.min(...["openCrmSystems", "crmGate", "bridgeOpen"].map((g) => { const i = body.indexOf(g); return i < 0 ? Number.POSITIVE_INFINITY : i; }));
      const writeAt = Math.min(...["recordBusinessActivityOnce", "markCustomerFromBridge", "crm.activities", "crm.contacts", "prisma."].map((w) => { const i = body.indexOf(w); return i < 0 ? Number.POSITIVE_INFINITY : i; }));
      if (!Number.isFinite(gateAt)) bad.push(`${h.name}:no gate`);
      else if (Number.isFinite(writeAt) && writeAt < gateAt) bad.push(`${h.name}:writes before the gate`);
    }
    const rawCrmWrite = /prisma\.(crmActivity|crmContact|crmDeal)\.(create|update|updateMany|upsert)/.test(code);
    const marks = ["X1", "X4", "X8"].filter((x) => new RegExp(`AUDIT-CLASS ${x}\\b`).test(brSrc));
    chk("C2.9-S0.4", "folder rules of crm-bridges (core.ts header · static rule of qc-crm-c1.11 S6.10): EVERY exported on* handler of business.ts asks the GATE (openCrmSystems / crmGate+bridgeOpen) BEFORE it reads or writes anything · no raw prisma write on a CRM table · the sites are marked `// AUDIT-CLASS X1 / X4 / X8` [static]",
      brSrc.length > 0 && handlers.length >= 1 && bad.length === 0 && !rawCrmWrite && marks.length === 3,
      "gate first · no raw CRM write · 3 markers", `handlers=${handlers.map((h) => h.name).join(",") || "-"} bad=${bad.join(" | ") || "-"} rawWrite=${rawCrmWrite} markers=${marks.join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — one throwaway tenant with a unit + POS + CRM (v2) · a foreign tenant · a uiVersion-1 tenant
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const mkUnit = async (tid: string, name: string, systemIds: string[]) => {
    // one unit carries every module of this run: the module services scope by (tenantId, unitId) only, never by UnitType
    const u = (await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${name} ${TAG}`, slug: `${TAG}-${nx()}`, status: "ACTIVE" } })) as Any;
    for (const s of systemIds) await P.appSystemUnit.create({ data: { tenantId: tid, systemId: s, unitId: u.id } }).catch(() => null);
    return u.id as string;
  };

  const tidA = await mkTenant("a");
  await P.membership.create({ data: { userId: userA, tenantId: tidA, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const posA = await mk(tidA, "POS", "ขาย");
  const crmA = await mk(tidA, "CRM", "CRM");
  const unitA = await mkUnit(tidA, "สาขาหลัก", [posA, crmA]);
  await setCrm(crmA, { uiVersion: 2, bridgesEnabled: true });
  const tidB = await mkTenant("b");
  await P.membership.create({ data: { userId: userA, tenantId: tidB, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const posB = await mk(tidB, "POS", "ขาย B");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const unitB = await mkUnit(tidB, "สาขา B", [posB, crmB]);
  await setCrm(crmB, { uiVersion: 2, bridgesEnabled: true });
  const tidV = await mkTenant("v1");
  await P.membership.create({ data: { userId: userA, tenantId: tidV, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const posV = await mk(tidV, "POS", "ขาย V");
  const crmV = await mk(tidV, "CRM", "CRM-V1");
  const unitV = await mkUnit(tidV, "สาขา V", [posV, crmV]);
  await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true }); // flipped in section U

  // CRM contacts: one per module phone (the Party is created by the module itself at transaction time)
  const crmCtx = (tid: string, sys: string) => ({ tenantId: tid, systemId: sys, actorUserId: userA });
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const contactsSvc = (CRM?.contacts ?? {}) as Any;
  const mkContact = async (tid: string, sys: string, phone: string, stage = "LEAD"): Promise<string> => {
    const r = await call(contactsSvc.createContact, crmCtx(tid, sys), owner, { firstName: pii(`ลูกค้า ${TAG}-${nx()}`), phone, ownerUserId: userA });
    const id = (r.v?.contact?.id ?? r.v?.id) as string | undefined;
    if (typeof id === "string" && id) {
      if (stage !== "LEAD") await P.crmContact.update({ where: { id }, data: { lifecycleStage: stage } });
      return id;
    }
    note(`createContact ${cut(r.err, 60)} → raw contact`);
    const name = pii(`ลูกค้า ${TAG}-${nx()}`);
    const partyId = (await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", phone } })).id as string;
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: sys, name, firstName: name, phone, partyId, ownerUserId: userA, lifecycleStage: stage } })).id as string;
  };
  const contactRow = async (id: string) => (await P.crmContact.findFirst({ where: { id } })) as Any;
  const actsOf = async (contactId: string, ref?: string) =>
    ((await P.crmActivity.findMany({ where: { contactId } })) as Any[]).filter((a) => !ref || String(a.sourceRef ?? "").includes(ref));

  // ── module services ──
  const M = {
    ticket: (await import("@/lib/modules/ticket/service" as string).catch(() => ({}))) as Any,
    rental: (await import("@/lib/modules/rental/service" as string).catch(() => ({}))) as Any,
    school: (await import("@/lib/modules/school/service" as string).catch(() => ({}))) as Any,
    hotel: (await import("@/lib/modules/hotel/service" as string).catch(() => ({}))) as Any,
    clinic: (await import("@/lib/modules/clinic/service" as string).catch(() => ({}))) as Any,
    queue: (await import("@/lib/modules/queue/service" as string).catch(() => ({}))) as Any,
    booking: (await import("@/lib/modules/booking/service" as string).catch(() => ({}))) as Any,
    shop: (await import("@/lib/modules/shop/service" as string).catch(() => ({}))) as Any,
  };

  // parents (created once per tenant that needs them)
  type Parents = { ticketType: string; ticketEvent: string; asset: string; classId: string; roomType: string; room: string; queueType: string; counter: string; service: string; staff: string; product: string };
  const mkParents = async (tid: string, unitId: string): Promise<Parents> => {
    const ctx = { tenantId: tid, unitId };
    const ev = await call(M.ticket.createEvent, ctx, { name: `งาน ${TAG}`, startAt: new Date(Date.now() + 7 * 86_400_000) });
    const ticketEvent = (ev.v?.id as string) ?? NONE;
    const tt = ticketEvent !== NONE ? await call(M.ticket.addTicketType, ctx, ticketEvent, { name: `บัตรฟรี ${TAG}`, priceSatang: 0, quota: 50 }) : MISSING;
    const asset = await call(M.rental.createAsset, ctx, { name: `จักรยาน ${TAG}`, dailyRateSatang: 10_000 });
    const course = await call(M.school.createCourse, ctx, { name: `คอร์ส ${TAG}`, priceSatang: 20_000 });
    const cls = course.ok ? await call(M.school.createClass, ctx, { courseId: course.v?.id, name: `รอบ ${TAG}`, capacity: 20 }) : MISSING;
    const rt = await call(M.hotel.createRoomType, { tenantId: tid, unitId, name: `ห้องทดสอบ ${TAG}`, capacity: 2, baseRateSatang: 0 });
    const room = rt.ok ? await call(M.hotel.createRoom, { tenantId: tid, unitId, roomTypeId: rt.v?.id, number: `${TAG.slice(-4)}${nx()}` }) : MISSING;
    const qType = (await P.queueType.create({ data: { tenantId: tid, unitId, code: `Q${nx()}`, name: `ทั่วไป ${TAG}`, prefix: "A" } })) as Any;
    const counter = (await P.queueCounter.create({ data: { tenantId: tid, unitId, name: `ช่อง ${TAG}-${nx()}`, code: `C${nx()}`, status: "OPEN" } })) as Any;
    await P.queueCounterType.create({ data: { tenantId: tid, unitId, counterId: counter.id, typeId: qType.id } }).catch(() => null);
    const service = (await P.bookingService.create({ data: { tenantId: tid, unitId, name: `บริการ ${TAG}`, durationMin: 30 } })) as Any;
    const staff = (await P.bookingStaff.create({ data: { tenantId: tid, unitId, name: `ช่าง ${TAG}` } })) as Any;
    const product = await call(M.shop.createProduct, ctx, { name: `สินค้า ${TAG}`, priceSatang: 15_000 });
    for (const [what, r] of [["ticket.createEvent", ev], ["ticket.addTicketType", tt], ["rental.createAsset", asset], ["school.createCourse", course], ["school.createClass", cls], ["hotel.createRoomType", rt], ["hotel.createRoom", room], ["shop.createProduct", product]] as [string, Res][]) {
      if (!r.ok) note(`${what} failed: ${cut(r.err, 70)}`);
    }
    return {
      ticketEvent, ticketType: (tt.v?.id as string) ?? NONE, asset: (asset.v?.id as string) ?? NONE, classId: (cls.v?.id as string) ?? NONE,
      roomType: (rt.v?.id as string) ?? NONE, room: (room.v?.id as string) ?? NONE, queueType: qType.id as string, counter: counter.id as string,
      service: service.id as string, staff: staff.id as string, product: (product.v?.id as string) ?? NONE,
    };
  };
  const pA = await mkParents(tidA, unitA);
  const pB = await mkParents(tidB, unitB);
  const pV = await mkParents(tidV, unitV);

  // ── per-module descriptor: make a transaction row in the pre-state, then run the ONE state-change function ──
  type Made = { rowId: string; phone: string };
  type Spec = {
    id: string; name: string; type: string; existing?: boolean; faultRollsBack: boolean; piiAllowed?: boolean;
    idField: string; table: string; preState: string; postState: string; title: RegExp;
    mk: (tid: string, unitId: string, par: Parents, phone: string) => Promise<Made>;
    go: (tid: string, unitId: string, rowId: string) => Promise<Res>;
  };
  const statusOf = async (table: string, rowId: string): Promise<string> => {
    const rows = (await P.$queryRawUnsafe(`SELECT "status"::text AS s FROM "${table}" WHERE "id" = $1`, rowId).catch(() => [])) as Any[];
    return String(rows?.[0]?.s ?? "-");
  };
  const partyOfRow = async (table: string, rowId: string): Promise<string | null> => {
    const rows = (await P.$queryRawUnsafe(`SELECT "partyId" AS p FROM "${table}" WHERE "id" = $1`, rowId).catch(() => [])) as Any[];
    const v = rows?.[0]?.p;
    return typeof v === "string" && v ? v : null;
  };
  const SPECS: Spec[] = [
    {
      id: "S1", name: "ticket", type: "ticket.order.paid", faultRollsBack: true, idField: "orderId", table: "TicketOrder",
      preState: "PENDING", postState: "PAID", title: /ตั๋ว|บัตร/,
      mk: async (tid, unitId, par, phone) => {
        const r = await call(M.ticket.createOrder, { tenantId: tid, unitId }, { eventId: par.ticketEvent, buyerName: pii(`ผู้ซื้อ ${TAG}-${nx()}`), buyerPhone: phone, lines: [{ ticketTypeId: par.ticketType, qty: 1 }] });
        if (!r.ok || r.v?.ok === false) note(`ticket.createOrder: ${r.ok ? j(r.v) : r.err}`);
        return { rowId: (r.v?.orderId as string) ?? NONE, phone };
      },
      go: (tid, unitId, rowId) => call(M.ticket.markPaid, { tenantId: tid, unitId }, rowId),
    },
    {
      id: "S2", name: "rental", type: "rental.returned", faultRollsBack: true, idField: "bookingId", table: "RentalBooking",
      preState: "PICKED_UP", postState: "RETURNED", title: /เช่า|คืน/,
      mk: async (tid, unitId, par, phone) => {
        // ORACLE-EDIT C2.9-X4.1/X4.2 (controller · 25 Sep): each rental fixture gets its OWN asset — a fault-rolled-back booking correctly stays PICKED_UP and
      //   would otherwise occupy the shared asset for every later fixture ("ช่วงเวลานี้สินทรัพย์ถูกจองแล้ว")
      const ownAsset = await call(M.rental.createAsset, { tenantId: tid, unitId }, { name: `จักรยาน ${TAG}-${nx()}`, dailyRateSatang: 10_000 });
      const r = await call(M.rental.createBooking, { tenantId: tid, unitId }, { assetId: (ownAsset.v?.id as string) ?? par.asset, customerName: pii(`ผู้เช่า ${TAG}-${nx()}`), customerPhone: phone, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000) });
        const id = (r.v?.id as string) ?? NONE;
        if (!r.ok) note(`rental.createBooking: ${r.err}`);
        if (id !== NONE) await call(M.rental.pickUp, { tenantId: tid, unitId }, id);
        return { rowId: id, phone };
      },
      go: (tid, unitId, rowId) => call(M.rental.returnAsset, { tenantId: tid, unitId }, rowId, {}),
    },
    {
      id: "S3", name: "school", type: "school.enrolled", faultRollsBack: true, idField: "enrollmentId", table: "SchoolEnrollment",
      preState: "ENROLLED", postState: "PAID", title: /เรียน|คอร์ส/,
      mk: async (tid, unitId, par, phone) => {
        const r = await call(M.school.enroll, { tenantId: tid, unitId }, { classId: par.classId, studentName: pii(`นักเรียน ${TAG}-${nx()}`), studentPhone: phone });
        if (!r.ok) note(`school.enroll: ${r.err}`);
        return { rowId: (r.v?.id as string) ?? NONE, phone };
      },
      go: (tid, unitId, rowId) => call(M.school.markPaid, { tenantId: tid, unitId }, rowId),
    },
    {
      id: "S4", name: "hotel", type: "hotel.checked_out", faultRollsBack: true, idField: "reservationId", table: "HotelReservation",
      preState: "CHECKED_IN", postState: "CHECKED_OUT", title: /เข้าพัก|ห้อง/,
      mk: async (tid, unitId, par, phone) => {
        // ORACLE-EDIT C2.9-X4.1/X4.2 (controller · 25 Sep): own room type + room per fixture (a rolled-back CHECKED_IN row keeps the shared room occupied)
      const ownRt = await call(M.hotel.createRoomType, { tenantId: tid, unitId, name: `ห้องทดสอบ ${TAG}-${nx()}`, capacity: 2, baseRateSatang: 0 });
      const ownRoom = ownRt.ok ? await call(M.hotel.createRoom, { tenantId: tid, unitId, roomTypeId: ownRt.v?.id, number: `${TAG.slice(-4)}${nx()}` }) : { ok: false, v: undefined };
      const roomTypeId = (ownRt.v?.id as string) ?? par.roomType; const roomId = ((ownRoom as Any).v?.id as string) ?? par.room;
      const r = await call(M.hotel.createReservation, { tenantId: tid, unitId, roomTypeId, checkInDate: ymd(0), checkOutDate: ymd(1), guestName: pii(`ผู้เข้าพัก ${TAG}-${nx()}`), guestPhone: phone });
        const id = (r.v?.id as string) ?? NONE;
        if (!r.ok || r.v?.ok === false) note(`hotel.createReservation: ${r.ok ? j(r.v) : r.err}`);
        if (id !== NONE) {
          const ci = await call(M.hotel.checkIn, tid, unitId, id, roomId);
          if (!ci.ok || ci.v?.ok === false) note(`hotel.checkIn: ${ci.ok ? j(ci.v) : ci.err}`);
        }
        return { rowId: id, phone };
      },
      go: (tid, unitId, rowId) => call(M.hotel.checkOut, tid, unitId, rowId),
    },
    {
      id: "S5", name: "clinic", type: "clinic.visit.done", faultRollsBack: true, idField: "visitId", table: "ClinicVisit",
      preState: "OPEN", postState: "BILLED", title: /เข้ารับบริการ|คลินิก/,
      mk: async (tid, unitId, par, phone) => {
        void par;
        const pt = await call(M.clinic.createPatient, { tenantId: tid, unitId }, { name: pii(`คนไข้ ${TAG}-${nx()}`), phone });
        if (!pt.ok) note(`clinic.createPatient: ${pt.err}`);
        const v = pt.ok ? await call(M.clinic.createVisit, { tenantId: tid, unitId }, { patientId: pt.v?.id, symptom: `ตรวจทั่วไป ${TAG}`, feeSatang: 0 }) : MISSING;
        if (!v.ok) note(`clinic.createVisit: ${v.err}`);
        return { rowId: (v.v?.id as string) ?? NONE, phone };
      },
      go: (tid, unitId, rowId) => call(M.clinic.billVisit, { tenantId: tid, unitId }, rowId),
    },
    {
      id: "S6", name: "queue", type: "queue.served", faultRollsBack: true, idField: "ticketId", table: "QueueTicket",
      preState: "CALLED", postState: "DONE", title: /คิว|บริการ/,
      mk: async (tid, unitId, par, phone) => {
        const r = await call(M.queue.issueTicket, { tenantId: tid, unitId, typeId: par.queueType, channel: "KIOSK", contact: { name: pii(`คิว ${TAG}-${nx()}`), phone } });
        const id = (r.v?.ticket?.id as string) ?? NONE;
        if (!r.ok || r.v?.ok === false) note(`queue.issueTicket: ${r.ok ? j(r.v).slice(0, 80) : r.err}`);
        if (id !== NONE) await P.queueTicket.update({ where: { id }, data: { status: "CALLED", counterId: par.counter, calledAt: new Date() } }).catch(() => null);
        return { rowId: id, phone };
      },
      go: (tid, unitId, rowId) => call(M.queue.markDone, { tenantId: tid, unitId }, rowId),
    },
    {
      id: "S7", name: "booking", type: "booking.completed", existing: true, faultRollsBack: true, idField: "appointmentId", table: "Appointment",
      preState: "CONFIRMED", postState: "DONE", title: /นัด|บริการ/,
      mk: async (tid, unitId, par, phone) => {
        const r = await call(M.booking.createAppointment, { tenantId: tid, unitId, serviceId: par.service, staffId: par.staff, dateStr: ymd(1), startMin: 540 + Number(nx()) * 45, customerName: pii(`ลูกค้านัด ${TAG}-${nx()}`), customerPhone: phone });
        if (!r.ok || r.v?.ok === false) note(`booking.createAppointment: ${r.ok ? j(r.v) : r.err}`);
        return { rowId: (r.v?.id as string) ?? NONE, phone };
      },
      go: (tid, unitId, rowId) => call(M.booking.setAppointmentStatus, tid, unitId, rowId, "DONE"),
    },
    {
      id: "S8", name: "shop", type: "shop.order.paid", existing: true, faultRollsBack: false, piiAllowed: true, idField: "orderId", table: "ShopOrder",
      preState: "PENDING_PAYMENT", postState: "PAID", title: /สั่งซื้อ|ออเดอร์|ซื้อ/,
      mk: async (tid, unitId, par, phone) => {
        const r = await call(M.shop.createOrder, { tenantId: tid, unitId }, { customerName: pii(`ผู้สั่ง ${TAG}-${nx()}`), customerPhone: phone, lines: [{ productId: par.product, qty: 1 }] });
        if (!r.ok) note(`shop.createOrder: ${r.err}`);
        return { rowId: (r.v?.id as string) ?? NONE, phone };
      },
      go: (tid, unitId, rowId) => call(M.shop.confirmOrderPaid, { tenantId: tid, unitId }, rowId),
    },
  ];

  // ── the fault injector: a trigger that raises ONLY for our tenant + one event type (no product hook needed) ──
  const FN = `qc_c29_fault_${rand}`;
  const TRG = `qc_c29_trg_${rand}`;
  const installFault = async (tid: string, type: string): Promise<boolean> => {
    try {
      await P.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${FN}() RETURNS trigger AS $qc$
BEGIN
  IF NEW."tenantId" = '${tid}' AND NEW."type" = '${type}' THEN
    RAISE EXCEPTION 'QC-C29-FAULT %', NEW."type";
  END IF;
  RETURN NEW;
END $qc$ LANGUAGE plpgsql`);
      await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRG} ON "OutboxEvent"`);
      await P.$executeRawUnsafe(`CREATE TRIGGER ${TRG} BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${FN}()`);
      TRIGGER_ON = true;
      return true;
    } catch (e) {
      note(`fault injector unavailable: ${cut(String((e as Error)?.message ?? e), 80)}`);
      return false;
    }
  };
  const removeFault = async () => {
    await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRG} ON "OutboxEvent"`).catch(() => null);
    await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${FN}()`).catch(() => null);
    TRIGGER_ON = false;
  };

  const eventsOf = async (tid: string, type: string, rowId: string) =>
    ((await P.outboxEvent.findMany({ where: { tenantId: tid, type } })) as Any[]).filter((e) => j(e.payload).includes(rowId));
  const deliver = async (tid: string, type: string, ev: Any) => call(CONS?.[type], { id: ev?.id ?? `${TAG}-ev-${nx()}`, tenantId: tid, type, payload: ev?.payload ?? {}, systemId: ev?.systemId ?? null, unitId: ev?.unitId ?? unitA });

  // ═════════════════════════════════════════════════════════════════════════════
  // S1–S8 — the 8 modules × 3 (emit in the tx · 3 registries · the CRM effect)
  // ═════════════════════════════════════════════════════════════════════════════
  const MADE: Record<string, { row: Made; contactId: string; ev: Any }> = {};
  for (const s of SPECS) {
    console.log(`\n── ${s.id} · ${s.name} (${s.type}) ──`);
    const phone = phoneOf();
    const row = await s.mk(tidA, unitA, pA, phone);
    const contactId = await mkContact(tidA, crmA, phone);
    const before = row.rowId === NONE ? "-" : await statusOf(s.table, row.rowId);
    const r = row.rowId === NONE ? MISSING : await s.go(tidA, unitA, row.rowId);
    const after = row.rowId === NONE ? "-" : await statusOf(s.table, row.rowId);
    const evs = row.rowId === NONE ? [] : await eventsOf(tidA, s.type, row.rowId);
    const ev = evs[0];
    const payload = (ev?.payload ?? {}) as Record<string, unknown>;
    const payloadText = j(payload);
    const keyOk = String(ev?.idempotencyKey ?? "") === `${s.type}#${row.rowId}`;
    // shop.order.paid keeps customerName/customerPhone for its existing consumers (R-E.17 · a debt of the shop module) —
    // the CRM side must not READ them (X8.3) and the SIX NEW payloads must be ids only (X8.1)
    const idsOnly = s.piiAllowed === true || !PII.some((p) => payloadText.includes(p));
    // fault injection on a SECOND row of the same module
    const row2 = await s.mk(tidA, unitA, pA, phoneOf());
    const pre2 = row2.rowId === NONE ? "-" : await statusOf(s.table, row2.rowId);
    const installed = row2.rowId === NONE ? false : await installFault(tidA, s.type);
    const faulted = installed ? await s.go(tidA, unitA, row2.rowId) : MISSING;
    await removeFault();
    const post2 = row2.rowId === NONE ? "-" : await statusOf(s.table, row2.rowId);
    const evs2 = row2.rowId === NONE ? [] : await eventsOf(tidA, s.type, row2.rowId);
    const rolledBack = s.faultRollsBack ? post2 === pre2 && evs2.length === 0 : evs2.length === 0;
    chk(`C2.9-${s.id}.1`, `${s.name}: the state change (${s.preState} → ${s.postState}) emits ONE \`${s.type}\` with key \`${s.type}#<id>\`, payload carrying the row id + unitId (${s.piiAllowed ? "its existing payload keeps customerName/customerPhone — R-E.17, the shop module's debt" : "ids only — no name/phone"}) · and it is emitted INSIDE the same transaction: with a fault injected on the OutboxEvent insert (a trigger that raises only for this tenant + this type) ${s.faultRollsBack ? "the state change ROLLS BACK with it (status stays " + s.preState + ", no event)" : "the posSaleId link + the event roll back together (the PENDING_PAYMENT→PAID claim of shop/service.ts sits in an EARLIER statement — a debt of the shop module recorded in the addendum, not fixed here)"}`,
      before === s.preState && after === s.postState && evs.length === 1 && keyOk && String(payload[s.idField] ?? "") === row.rowId && String(payload.unitId ?? "") === unitA && idsOnly && installed && rolledBack,
      `1 event · key · ${s.faultRollsBack ? "rollback" : "no event"}`,
      `status ${before}→${after} (want ${s.preState}→${s.postState}) go=${r.ok ? "ok" : r.err} events=${evs.length} key=${cut(ev?.idempotencyKey, 60)} idField=${String(payload[s.idField] ?? "-")} unitId=${String(payload.unitId ?? "-") === unitA} pii=${!idsOnly} | fault: installed=${installed} ${pre2}→${post2} events=${evs2.length} err=${cut(faulted.err, 60) || "-"}${ABSENT}`);
    const labels = new Map(((LAB.AUTOMATION_EVENTS ?? []) as Any[]).map((e) => [String(e?.value), String(e?.label ?? "")]));
    const webhookValues = ((WH.WEBHOOK_EVENTS ?? []) as Any[]).map((e) => String(e?.value ?? e));
    const count = ((LAB.AUTOMATION_EVENTS ?? []) as Any[]).filter((e) => String(e?.value) === s.type).length;
    const hasCons = typeof CONS?.[s.type] === "function";
    const modSrc = read(MOD_FILES[s.name] ?? "");
    const inTxStatic = new RegExp(`emitOutbox\\(\\s*tx\\s*,[\\s\\S]{0,400}${s.type.replace(/\./g, "\\.")}`).test(modSrc) || new RegExp(`${s.type.replace(/\./g, "\\.")}[\\s\\S]{0,400}emitOutbox\\(\\s*tx`).test(modSrc);
    chk(`C2.9-${s.id}.2`, `${s.name}: \`${s.type}\` is in all 3 registries — declared once in AUTOMATION_EVENTS with a Thai label, present in WEBHOOK_EVENTS (through the spread), a consumer registered — and the emit in ${MOD_FILES[s.name] ?? "?"} is written as \`emitOutbox(tx, …)\` inside that module's \`$transaction\` (never emitOutboxOutsideTx) [static + runtime]`,
      count === 1 && thai(labels.get(s.type)) && webhookValues.includes(s.type) && hasCons && inTxStatic && !new RegExp(`emitOutboxOutsideTx[\\s\\S]{0,200}${s.type.replace(/\./g, "\\.")}`).test(modSrc),
      "1 label · webhook · consumer · emitOutbox(tx", `labels=${count} thai=${thai(labels.get(s.type))} webhook=${webhookValues.includes(s.type)} consumer=${hasCons} emitInTx=${inTxStatic}${ABSENT}`);
    // the CRM effect: deliver once, again, and 3× in parallel ⇒ exactly ONE activity + lifecycle CUSTOMER
    const d1 = ev ? await deliver(tidA, s.type, ev) : MISSING;
    const d2 = ev ? await deliver(tidA, s.type, ev) : MISSING;
    const dp = ev ? await Promise.all([0, 1, 2].map(() => deliver(tidA, s.type, ev))) : [];
    const acts = await actsOf(contactId, row.rowId);
    const c = await contactRow(contactId);
    chk(`C2.9-${s.id}.3`, `${s.name}: the CRM extra of the \`${s.type}\` consumer writes EXACTLY ONE CrmActivity on the contact that shares the transaction's Party (type VISIT · source AUTO · sourceRef carrying the row id · a Thai title with no customer data) and moves the contact's lifecycle LEAD → CUSTOMER with lastActivityAt set — delivering the event once, again and 3× in parallel changes nothing (AUDIT-CLASS X4)`,
      !!ev && d1.ok && d2.ok && dp.every((x) => x.ok) && acts.length === 1 && acts[0]?.type === "VISIT" && acts[0]?.source === "AUTO" && thai(acts[0]?.title) && !PII.some((p) => String(acts[0]?.title ?? "").includes(p)) && c?.lifecycleStage === "CUSTOMER" && !!c?.lastActivityAt,
      "1 VISIT · CUSTOMER", `event=${!!ev} deliver=${d1.ok ? "ok" : d1.err} again=${d2.ok ? "ok" : d2.err} parallel=${dp.filter((x) => x.ok).length}/3 activities=${acts.length} type=${acts[0]?.type ?? "-"}/${acts[0]?.source ?? "-"} title=${cut(acts[0]?.title, 50)} lifecycle=${c?.lifecycleStage} lastActivityAt=${!!c?.lastActivityAt}${ABSENT}`);
    MADE[s.name] = { row, contactId, ev };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — partyId is really written when a transaction is created (the 9 sites of C1.1) + one Party across modules
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · partyId at creation ──");
  {
    const rows: [string, string, string | null][] = [];
    for (const s of SPECS) {
      const made = MADE[s.name];
      rows.push([s.name, s.table, made && made.row.rowId !== NONE ? await partyOfRow(s.table, made.row.rowId) : null]);
    }
    const missing = rows.filter(([, , p]) => !p).map(([n]) => n);
    const clinicPatient = (await P.patientRecord.findFirst({ where: { tenantId: tidA }, select: { partyId: true } })) as Any;
    chk("C2.9-S9.1", "partyId at creation (C1.1 · the 9 write sites of R-C.2): the 8 transactions this run created through the modules' own creation functions each carry a Party — TicketOrder · RentalBooking · SchoolEnrollment · HotelReservation · ClinicVisit · QueueTicket · Appointment · ShopOrder — plus PatientRecord (the 9th site) · nothing is backfilled by this oracle",
      missing.length === 0 && !!clinicPatient?.partyId, "9 sites written", `missing=${missing.join(",") || "-"} patientRecord=${!!clinicPatient?.partyId}${ABSENT}`);
    const partySrcBad = Object.entries(MOD_FILES).filter(([, f]) => !/safeFindOrCreate/.test(read(f))).map(([n]) => n);
    const throwy = Object.entries(MOD_FILES).filter(([, f]) => {
      const src = read(f);
      const at = src.search(/async function (linkPartyAfterCommit|patientPartyId)/);
      if (at < 0) return true;
      const body = src.slice(at, at + 1400);
      return !/catch|\.catch\(/.test(body);
    }).map(([n]) => n);
    chk("C2.9-S9.2", "the party link is written through the party facade (`safeFindOrCreate`) in all 8 modules and can never break the business transaction (the helper swallows its own failure — a Party that cannot be resolved is left null for the `party-links` backfill, it never throws into the caller) [static]",
      partySrcBad.length === 0 && throwy.length === 0, "8 modules · no throw", `noSafeFindOrCreate=${partySrcBad.join(",") || "-"} mayThrow=${throwy.join(",") || "-"}`, "MAJOR");
  }
  {
    // one phone, two modules ⇒ one Party ⇒ one CRM contact collecting both activities
    const phone = phoneOf();
    const shopRow = await SPECS[7].mk(tidA, unitA, pA, phone);
    const queueRow = await SPECS[5].mk(tidA, unitA, pA, phone);
    const pShop = shopRow.rowId === NONE ? null : await partyOfRow("ShopOrder", shopRow.rowId);
    const pQueue = queueRow.rowId === NONE ? null : await partyOfRow("QueueTicket", queueRow.rowId);
    const contactId = await mkContact(tidA, crmA, phone);
    await SPECS[7].go(tidA, unitA, shopRow.rowId);
    await SPECS[5].go(tidA, unitA, queueRow.rowId);
    const evShop = (await eventsOf(tidA, SPECS[7].type, shopRow.rowId))[0];
    const evQueue = (await eventsOf(tidA, SPECS[5].type, queueRow.rowId))[0];
    if (evShop) await deliver(tidA, SPECS[7].type, evShop);
    if (evQueue) await deliver(tidA, SPECS[5].type, evQueue);
    const acts = await actsOf(contactId);
    chk("C2.9-S9.3", "the point of the central Party: a shop order and a queue ticket made with the SAME phone land on the SAME Party, so ONE CRM contact collects an activity from BOTH modules (2 activities, 2 different sourceRefs) — this is what makes the 360 timeline whole",
      !!pShop && pShop === pQueue && acts.length === 2 && new Set(acts.map((a) => String(a.sourceRef))).size === 2,
      "same Party · 2 activities", `shopParty=${!!pShop} queueParty=${!!pQueue} same=${pShop === pQueue} activities=${acts.length} refs=${new Set(acts.map((a) => String(a.sourceRef))).size}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S10 — activity shape · lifecycle only forward · no contact ⇒ nothing written
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S10 · shape · lifecycle · no contact ──");
  {
    const made = MADE.hotel;
    const acts = made ? await actsOf(made.contactId, made.row.rowId) : [];
    const a = acts[0] as Any;
    const logged = made ? ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "crm.activity.logged" } })) as Any[]).filter((e) => j(e.payload).includes(String(a?.id ?? NONE))) : [];
    const audits = ((await P.auditLog.findMany({ where: { tenantId: tidA, action: { startsWith: "crm.activity." } } })) as Any[]);
    chk("C2.9-S10.1", "the activity written from a business event follows the C1.8 shape: sourceRef = the source row id (the X4 flag), source AUTO (never MANUAL), doneAt/startAt set (it already happened, it is not a task), title Thai without customer data, an AuditLog row `crm.activity.*` with actorType SYSTEM, and NO `crm.activity.logged` event (the source module already announced the event — two announcements = two timeline rows)",
      !!a && String(a.sourceRef ?? "").includes(made?.row.rowId ?? NONE) && a.source === "AUTO" && !!a.doneAt && !!a.startAt && thai(a.title) && logged.length === 0 && audits.some((x) => String(x.actorType) === "SYSTEM"),
      "sourceRef · AUTO · no crm.activity.logged", `sourceRef=${cut(a?.sourceRef, 60)} source=${a?.source} doneAt=${!!a?.doneAt} logged=${logged.length} sysAudit=${audits.some((x) => String(x.actorType) === "SYSTEM")}${ABSENT}`);
  }
  {
    const phone = phoneOf();
    const row = await SPECS[5].mk(tidA, unitA, pA, phone);
    const already = await mkContact(tidA, crmA, phone, "CUSTOMER");
    await P.crmContact.update({ where: { id: already }, data: { lifecycleStage: "CUSTOMER" } });
    const lost = await mkContact(tidA, crmA, phoneOf(), "LOST");
    await SPECS[5].go(tidA, unitA, row.rowId);
    const ev = (await eventsOf(tidA, SPECS[5].type, row.rowId))[0];
    if (ev) await deliver(tidA, SPECS[5].type, ev);
    const c = await contactRow(already);
    const l = await contactRow(lost);
    const n = await call(markCustomer, { tenantId: tidA, systemId: crmA }, { contactId: lost, at: new Date() });
    const lAfter = await contactRow(lost);
    chk("C2.9-S10.2", "lifecycle moves FORWARD only: a contact already CUSTOMER stays CUSTOMER (no pointless write, no downgrade) · `markCustomerFromBridge` on a LOST contact leaves it LOST (the shop decides that one) and answers 0 rows — LEAD/PROSPECT/CHURNED are the only stages it promotes",
      c?.lifecycleStage === "CUSTOMER" && l?.lifecycleStage === "LOST" && (n.ok ? Number(n.v ?? 0) === 0 : n.code === "MISSING_FUNCTION") && lAfter?.lifecycleStage === "LOST",
      "CUSTOMER kept · LOST kept", `already=${c?.lifecycleStage} lost=${l?.lifecycleStage} promote=${n.ok ? j(n.v) : n.err} after=${lAfter?.lifecycleStage}${ABSENT}`);
  }
  {
    // a transaction of a walk-in nobody ever put into CRM: nothing is written and the event still resolves
    const row = await SPECS[0].mk(tidA, unitA, pA, phoneOf());
    const before = (await P.crmContact.count({ where: { systemId: crmA } })) as number;
    const beforeActs = (await P.crmActivity.count({ where: { systemId: crmA } })) as number;
    await SPECS[0].go(tidA, unitA, row.rowId);
    const ev = (await eventsOf(tidA, SPECS[0].type, row.rowId))[0];
    const d = ev ? await deliver(tidA, SPECS[0].type, ev) : MISSING;
    const after = (await P.crmContact.count({ where: { systemId: crmA } })) as number;
    const afterActs = (await P.crmActivity.count({ where: { systemId: crmA } })) as number;
    chk("C2.9-S10.3", "a transaction whose Party has NO CRM contact (a walk-in buyer): the consumer resolves without error and writes NOTHING — no lead is invented (turning every walk-in into a lead is C2.4/C2.6 work, behind their own switches) and no orphan activity is created",
      !!ev && d.ok && after === before && afterActs === beforeActs,
      "0 contacts · 0 activities", `event=${!!ev} deliver=${d.ok ? "ok" : d.err} contacts ${before}→${after} activities ${beforeActs}→${afterActs}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope: forged ids of another tenant · another CRM system · the contact is looked up under the event's tenant
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    // tenant B makes its own transaction + contact; tenant A replays B's event id under A's tenantId
    const phone = phoneOf();
    const rowB = await SPECS[7].mk(tidB, unitB, pB, phone);
    const contactB = await mkContact(tidB, crmB, phone);
    await SPECS[7].go(tidB, unitB, rowB.rowId);
    const evB = (await eventsOf(tidB, SPECS[7].type, rowB.rowId))[0];
    const forged = evB ? await call(CONS?.[SPECS[7].type], { id: `${TAG}-forged-${nx()}`, tenantId: tidA, type: SPECS[7].type, payload: evB.payload, systemId: null, unitId: unitA }) : MISSING;
    const actsB = await actsOf(contactB);
    const actsA = (await P.crmActivity.count({ where: { systemId: crmA, sourceRef: { contains: rowB.rowId } } })) as number;
    chk("C2.9-X1.1", "a forged event: tenant B's order id delivered under tenant A's tenantId ⇒ NOTHING anywhere — no activity in A (the id is resolved under the event's tenant, never globally) and B's own contact is untouched by A's delivery · the consumer still resolves (a forged id is not a crash)",
      !!evB && forged.ok && actsA === 0 && actsB.length === 0, "0 · 0", `event=${!!evB} forged=${forged.ok ? "ok" : forged.err} inA=${actsA} inB=${actsB.length}${ABSENT}`);
  }
  {
    const made = MADE.school;
    const crmA2 = await mk(tidA, "CRM", "CRM สอง");
    await setCrm(crmA2, { uiVersion: 2, bridgesEnabled: true });
    const ev = made?.ev;
    if (ev) await deliver(tidA, SPECS[2].type, ev);
    const inSecond = (await P.crmActivity.count({ where: { systemId: crmA2 } })) as number;
    const contactsIn2 = (await P.crmContact.count({ where: { systemId: crmA2 } })) as number;
    chk("C2.9-X1.2", "a SECOND CRM system of the same tenant that has no contact for that Party gets nothing (0 activities, 0 contacts) — the bridge writes only where the Party really has a contact, it does not fan out a copy into every CRM system of the shop",
      inSecond === 0 && contactsIn2 === 0, "0 · 0", `activities=${inSecond} contacts=${contactsIn2}${ABSENT}`);
  }
  {
    const made = MADE.queue;
    const other = await mkContact(tidA, crmA, phoneOf());
    const acts = made ? await actsOf(other) : [];
    chk("C2.9-X1.3", "the activity lands on the contact of THAT Party only: an unrelated contact of the same CRM system (another phone, another Party) has no activity from any of the 8 events this run fired",
      acts.length === 0, "0", `activities=${acts.length}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — replay / parallel first delivery · the compose contract of the extended consumers
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · replay · compose ──");
  {
    // a FRESH event delivered 4× in parallel as the FIRST delivery (flag first, then write — lesson H5)
    const phone = phoneOf();
    const row = await SPECS[3].mk(tidA, unitA, pA, phone); // hotel
    const contactId = await mkContact(tidA, crmA, phone);
    await SPECS[3].go(tidA, unitA, row.rowId);
    const ev = (await eventsOf(tidA, SPECS[3].type, row.rowId))[0];
    const res = ev ? await Promise.all([0, 1, 2, 3].map(() => deliver(tidA, SPECS[3].type, ev))) : [];
    const acts = await actsOf(contactId, row.rowId);
    chk("C2.9-X4.1", "a FRESH `hotel.checked_out` delivered 4× IN PARALLEL as its first delivery ⇒ exactly ONE CrmActivity and ONE lifecycle promotion (the flag — advisory lock on the sourceRef + the prior-row check inside the write transaction — comes before the write, lesson H5) · every delivery resolves",
      !!ev && res.length === 4 && res.every((x) => x.ok) && acts.length === 1,
      "1 activity", `event=${!!ev} ok=${res.filter((x) => x.ok).length}/4 activities=${acts.length}${ABSENT}`);
  }
  {
    // the same event after the contact was created LATER (the module transaction came first)
    const phone = phoneOf();
    const row = await SPECS[1].mk(tidA, unitA, pA, phone); // rental
    await SPECS[1].go(tidA, unitA, row.rowId);
    const ev = (await eventsOf(tidA, SPECS[1].type, row.rowId))[0];
    const d0 = ev ? await deliver(tidA, SPECS[1].type, ev) : MISSING;
    const contactId = await mkContact(tidA, crmA, phone); // the contact appears only now
    const d1 = ev ? await deliver(tidA, SPECS[1].type, ev) : MISSING;
    const d2 = ev ? await deliver(tidA, SPECS[1].type, ev) : MISSING;
    const acts = await actsOf(contactId, row.rowId);
    chk("C2.9-X4.2", "order does not matter: the event delivered BEFORE the CRM contact existed writes nothing (and resolves), and a redelivery after the contact appears writes exactly ONE activity — a second redelivery adds none (the dedupe key is (system, contact, sourceRef), not \"have I seen this event\")",
      !!ev && d0.ok && d1.ok && d2.ok && acts.length === 1,
      "1 activity", `first=${d0.ok ? "ok" : d0.err} afterContact=${d1.ok ? "ok" : d1.err} again=${d2.ok ? "ok" : d2.err} activities=${acts.length}${ABSENT}`);
  }
  {
    // compose: the CRM extra must not break what the consumer already did (booking.completed = stamps/journey of the member module)
    const made = MADE.booking;
    const ev = made?.ev;
    const before = (await P.memberActivity.count({ where: { tenantId: tidA } }).catch(() => 0)) as number;
    const d = ev ? await deliver(tidA, "booking.completed", ev) : MISSING;
    const dNoCrm = await call(CONS?.["booking.completed"], { id: `${TAG}-nocrm-${nx()}`, tenantId: tidB, type: "booking.completed", payload: { appointmentId: `${TAG}-ghost`, tenantId: tidB, unitId: unitB, customerId: null, serviceId: null }, systemId: null, unitId: unitB });
    const after = (await P.memberActivity.count({ where: { tenantId: tidA } }).catch(() => 0)) as number;
    chk("C2.9-COMPOSE.1", "the compose contract of C1.8 on the two EXTENDED consumers: `booking.completed` still resolves with the CRM extra appended (the member-side effects of M2.3/M3.x are untouched — no MemberActivity row disappears) and an event whose ids resolve to nothing at all (ghost appointment) still resolves instead of failing the queue — a failing extra is a WARN, never the main consumer's death",
      (!ev || d.ok) && dNoCrm.ok && after >= before, "both resolve", `withCrm=${ev ? (d.ok ? "ok" : d.err) : "no event"} ghost=${dNoCrm.ok ? "ok" : dNoCrm.err} memberActivity ${before}→${after}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: ids-only payloads · no clinical data · CRM never reads shop's PII payload
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  {
    const rows = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: { in: SPECS.map((s) => s.type) } } })) as Any[]);
    const newOnes = rows.filter((e) => NEW_TYPES.includes(String(e.type)));
    const text = j(newOnes.map((e) => e.payload));
    const piiHits = PII.filter((p) => text.includes(p));
    const badKeys = newOnes.flatMap((e) => Object.keys((e.payload ?? {}) as Record<string, unknown>).filter((k) => /name|phone|email|mail|address/i.test(k)).map((k) => `${e.type}.${k}`));
    chk("C2.9-X8.1", "the SIX new payloads are ids only: no name/phone/e-mail value of this run appears in any of them and no key looks like personal data (`*name*`, `*phone*`, `*email*`, `*address*`) — `shop.order.paid` keeps its own customerName/customerPhone as the shop module's documented debt (R-E.17) and is excluded here",
      newOnes.length >= 1 && piiHits.length === 0 && badKeys.length === 0, "no PII", `events=${newOnes.length} pii=${piiHits.slice(0, 2).join(",") || "-"} keys=${badKeys.join(",") || "-"} sample=${cut(text, 160)}${ABSENT}`, "MAJOR");
  }
  {
    const clinicEvs = ((await P.outboxEvent.findMany({ where: { tenantId: tidA, type: "clinic.visit.done" } })) as Any[]);
    const text = j(clinicEvs.map((e) => e.payload));
    const clinicalKeys = clinicEvs.flatMap((e) => Object.keys((e.payload ?? {}) as Record<string, unknown>).filter((k) => /symptom|diagnos|allerg|drug|medicine|dispense|note|fee|treatment/i.test(k)));
    const symptomLeak = text.includes(`ตรวจทั่วไป ${TAG}`);
    const acts = ((await P.crmActivity.findMany({ where: { systemId: crmA, type: "VISIT" } })) as Any[]);
    const titleLeak = acts.some((a) => String(a.title ?? "").includes(`ตรวจทั่วไป ${TAG}`)) || acts.some((a) => String(a.body ?? "").length > 0);
    chk("C2.9-X8.2", "the clinic event says \"a visit happened\" and nothing more: no symptom/diagnosis/allergy/drug/fee key in the payload, the symptom text of this run appears nowhere in it, and the CRM activity it creates carries neither the symptom nor any body text (health data must not leak into a sales timeline)",
      clinicEvs.length >= 1 && clinicalKeys.length === 0 && !symptomLeak && !titleLeak,
      "no clinical field", `events=${clinicEvs.length} keys=${clinicalKeys.join(",") || "-"} symptomInPayload=${symptomLeak} inActivity=${titleLeak} payload=${cut(text, 140)}${ABSENT}`);
  }
  {
    const brCode = read(BR_FILE).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
    const readsShopPii = /customerName|customerPhone|buyerName|buyerPhone|guestName|guestPhone|studentName|studentPhone/.test(brCode);
    const opsRows = ((await P.opsEvent.findMany({ where: { tenantId: tidA } }).catch(() => [])) as Any[]);
    const opsText = j(opsRows.map((o) => [o.message, o.detail]));
    const opsPii = PII.filter((p) => opsText.includes(p));
    chk("C2.9-X8.3", "the CRM side reads by ID only: `crm-bridges/business.ts` never touches `customerName`/`customerPhone` of `shop.order.paid` (nor any other module's name/phone field — it resolves the Party from the row) and no OpsEvent written during this run carries a name/phone/e-mail [static + runtime]",
      read(BR_FILE).length > 0 && !readsShopPii && opsPii.length === 0,
      "no PII field read · clean ops log", `readsPiiField=${readsShopPii} opsPii=${opsPii.slice(0, 2).join(",") || "-"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // U — uiVersion 1 / bridgesEnabled (PERMANENT RULE · R-E.14): nothing written, rows kept, resume at 2
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── U · uiVersion 1 · bridgesEnabled ──");
  {
    const phone = phoneOf();
    const row = await SPECS[7].mk(tidV, unitV, pV, phone); // shop in the v1 tenant
    const contactId = await mkContact(tidV, crmV, phone);
    await setCrm(crmV, { uiVersion: 1 });
    const r = await SPECS[7].go(tidV, unitV, row.rowId);
    const ev = (await eventsOf(tidV, SPECS[7].type, row.rowId))[0];
    const d = ev ? await deliver(tidV, SPECS[7].type, ev) : MISSING;
    const acts = await actsOf(contactId);
    const c = await contactRow(contactId);
    chk("C2.9-U.1", "uiVersion 1 (R-E.14 · gate first): the business module still works exactly as before — the order is PAID and the event IS emitted (the module does not know about CRM) — but the CRM extra writes nothing: 0 activities, the contact keeps its LEAD stage, and the event resolves (it is not left PENDING)",
      (r.ok || r.v?.ok === true) && !!ev && d.ok && acts.length === 0 && c?.lifecycleStage === "LEAD",
      "event emitted · 0 CRM writes", `go=${r.ok ? "ok" : r.err} event=${!!ev} deliver=${d.ok ? "ok" : d.err} activities=${acts.length} lifecycle=${c?.lifecycleStage}${ABSENT}`);
    await setCrm(crmV, { uiVersion: 2, bridgesEnabled: false });
    const d2 = ev ? await deliver(tidV, SPECS[7].type, ev) : MISSING;
    const acts2 = await actsOf(contactId);
    chk("C2.9-U.2", "the kill switch is real: uiVersion 2 with `bridgesEnabled: false` ⇒ the same event still writes nothing (0 activities) and still resolves — the gate is asked before anything is read, so flipping the switch takes effect immediately (no cached answer)",
      d2.ok && acts2.length === 0, "0 activities", `deliver=${d2.ok ? "ok" : d2.err} activities=${acts2.length}${ABSENT}`);
    await setCrm(crmV, { uiVersion: 2, bridgesEnabled: true });
    const d3 = ev ? await deliver(tidV, SPECS[7].type, ev) : MISSING;
    const acts3 = await actsOf(contactId, row.rowId);
    const c3 = await contactRow(contactId);
    chk("C2.9-U.3", "back at uiVersion 2 with the bridges on, the SAME kept event finally writes its one activity and promotes the contact to CUSTOMER — nothing was lost while the shop was on v1 (the rows were kept, R-E.14)",
      d3.ok && acts3.length === 1 && c3?.lifecycleStage === "CUSTOMER",
      "1 activity · CUSTOMER", `deliver=${d3.ok ? "ok" : d3.err} activities=${acts3.length} lifecycle=${c3?.lifecycleStage}${ABSENT}`);
  }
  if (FIXTURE_NOTES.length > 0) console.log(`  ℹ️  fixture notes (${FIXTURE_NOTES.length}): ${cut(FIXTURE_NOTES.join(" | "), 700)}`);
} catch (e) {
  chk("C2.9-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — drop the fault injector, then every row of the throwaway tenants (4 passes), systems/units/tenants, users.
  // ═════════════════════════════════════════════════════════════════════════════
  await P.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qc_c29_trg_${rand} ON "OutboxEvent"`).catch(() => null);
  await P.$executeRawUnsafe(`DROP FUNCTION IF EXISTS qc_c29_fault_${rand}()`).catch(() => null);
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* order/FK — retried next pass */ } };
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[])
      .map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      const trg = ((await P.$queryRawUnsafe(`select tgname from pg_trigger where tgname = 'qc_c29_trg_${rand}'`).catch(() => [])) as Any[]).length;
      chk("C2.9-CLEAN", "the oracle gives the QC database back exactly as found — the fault-injector trigger and function are dropped, every throwaway tenant (8 business transactions, their Parties, CRM rows, outbox events) and the throwaway users are gone",
        left.length === 0 && tenants === 0 && users === 0 && trg === 0 && !TRIGGER_ON, "0 rows · 0 tenants · no trigger", `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} trigger=${trg}`, "MAJOR");
    } catch (e) {
      chk("C2.9-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
