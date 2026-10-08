// C5.5-fix12 REVIEW round 3 probe (independent reviewer) — `contactRefusalOf` on 713fa29f
//   MX   a REAL mixed duplicate error (updateContact: new phone hits a HIDDEN contact, new e-mail hits a VISIBLE one) → the service error
//        carries duplicates[] with the visible name · what the helper, the web shape and mobileErrorOf pass on must hold no name/id at all
//   SC   the contacts-shared module stays client-safe (no import beyond *-shared modules)
// QC2 only (ep-cool-shadow) · throwaway tenant `qc-cf16-r3v-*` (swept in done()) + the rate bucket it touched.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf16/review/probe-cf16-review-r3.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("r3v");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v);
const rand = TAG.slice(-8);
const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const MOBILE = (await import("@/lib/modules/crm/mobile" as string)) as Any;
let bucket = "";

try {
  const shop = await mkShop("a");
  const uid = await mkUser("-s1");
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.contact.read": true, "crm.contact.create": true, "crm.contact.update": true }, acceptedAt: new Date() } });
  const s1 = { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
  bucket = `crm:contact:ident:${shop.tid}:${uid}`;
  const mk = async (first: string, owner: string, o: { phone?: string; email?: string } = {}) => {
    const party = await P.party.create({ data: { tenantId: shop.tid, name: `${first} ${TAG}`, kind: "PERSON" } });
    return P.crmContact.create({ data: { tenantId: shop.tid, systemId: shop.S, name: `${first} ${TAG}`, firstName: first, partyId: party.id, ownerUserId: owner, phone: o.phone ?? null, email: o.email ?? null } });
  };
  const pH = `08${String(Date.now() % 1e8).padStart(8, "0")}`;
  const eV = `mx-${rand}@qc.invalid`;
  const kH = await mk("ลับผสม", shop.uid, { phone: pH });
  const kV = await mk("เห็นผสม", uid, { email: eV });
  const me = await mk("ตัวเองผสม", uid);
  const r = await call(() => CON.updateContact(s1.ctx, s1.actor, me.id, { phone: pH, email: eV }));
  const err = r.err;
  const ref = SHARED.contactRefusalOf(err);
  const web = ref ? { ok: false, error: ref.message, code: ref.code } : null;
  const mob = MOBILE.mobileErrorOf(err);
  const blob = j({ ref, web, mob });
  const forbidden = [kH.id, kV.id, "ลับผสม", "เห็นผสม", pH, eV];
  const leaks = forbidden.filter((x) => blob.includes(x));
  chk("MX-mixed", !r.ok && err?.code === "DUPLICATE" && Array.isArray(err?.duplicates) && err.duplicates.some((d: Any) => d.contactId === kV.id) && !!ref && ref.status === 409 && leaks.length === 0 && mob.status === 409 && mob.error === "duplicate",
    `service error DUPLICATE with duplicates=${j((err?.duplicates ?? []).map((d: Any) => d.name))} (visible only) · helper/web/mobile pass on ${j({ code: ref?.code, status: ref?.status, mobStatus: mob.status, mobError: mob.error })} · keys of helper result ${j(Object.keys(ref ?? {}))} · leaks ${j(leaks)}`);
  const src = readFileSync("src/lib/modules/crm/contacts-shared.ts", "utf8");
  const imports = [...src.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((x) => x[1]!);
  chk("SC-client-safe", imports.every((p) => /-shared$/.test(p)) && !/prisma|next\/headers|server-only|node:/.test(src.split("\n").filter((l) => l.startsWith("import")).join("\n")), `contacts-shared imports ${j(imports)}`);
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
if (bucket) await P.chatRateBucket.deleteMany({ where: { key: bucket } }).catch(() => undefined);
await done("probe-cf16-review-r3");
