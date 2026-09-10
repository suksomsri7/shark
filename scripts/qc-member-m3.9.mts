// QC — ระบบสมาชิก v2 WO M3.9: เทมเพลตกิจการ 16 ชุดครบ (D7 · §10) — ส่วน/ฟิลด์ · ระดับ · สแตมป์ · journey ต่อกิจการ + ทั่วไป · applyTemplate ไม่ทับของเดิม (ทุกส่วน) · previewTemplate นับถูก · validateTemplate (ข้อมูลล้วน) · UI เลือก/ดูตัวอย่าง/apply ในตัวออกแบบฟิลด์ (ภาพ 03 kbar) + ตัวอย่างมือถือ
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.9 · พิมพ์เขียว §10 (ตาราง 16 แถว + ทั่วไป) · M1.2 applyTemplate · M1.3 field-template-select · ภาพ 03
// requires: member-seed
//
// สัญญา (ไม่มี migration · src/lib/modules/member/templates/{index.ts, general.ts, dive.ts, clinic.ts, dental.ts, restaurant.ts, fitness.ts, hotel.ts, retail.ts, salon.ts, tutoring.ts, vet.ts, carcare.ts, travel.ts, sportsclub.ts, repair.ts, realestate.ts, b2b.ts} · fields.ts#applyTemplate ขยาย · member/templates-service.ts (preview/validate/apply ทุกส่วน) · facade member/index.ts · FieldDesigner.tsx (M1.3) เพิ่มแผงตัวอย่าง+apply)
//   TEMPLATES 17 key (ลำดับ §10): dive clinic dental restaurant fitness hotel retail salon tutoring vet carcare travel sportsclub repair realestate b2b + general · name ไทยไม่ซ้ำ · description ไทย · เทมเพลตเป็นข้อมูลล้วน (ไม่มี import prisma/facade ในโฟลเดอร์ templates/)
//   รูปร่าง (ขยายจาก M1.2): MemberTemplate { key, name, description, sections: [{ key, label, description?, columns?, sensitive?, fields: [{ key, label, type: MemberFieldType, options?, required?, unique?, filterable?, showInList?, showOnCard?, customerEditable?, sensitive?, trackHistory? }] }], tiers: [{ key, label, color?, description?, rule?: { spentSatang?, visits?, windowMonths? }, benefits?: [{ kind, config }] }], stamps: [{ key, name, slots (3–30), ruleKind, ruleConfig?, rewardKind, rewardConfig, description? }], journeys: [{ key, name, presetKey? (JOURNEY_PRESETS) | { trigger: { event, params? }, conditions?, actions: [...] }, description? }] }
//   กติกาต่อชุดตาม §10: ทุกชุด ≥ 1 ส่วน ≥ 3 ฟิลด์ · ชุดที่มี "อ่อนไหว" ในตาราง (clinic dental fitness hotel salon tutoring travel realestate b2b + dive สุขภาพ) ต้องมีส่วน sensitive หรือฟิลด์ sensitive ≥ 1 · tiers ≥ 2 ทุกชุดยกเว้น vet/repair (ใช้ทั่วไป · [] ได้) · stamps ≥ 1 ทุกชุดยกเว้น realestate/b2b · journeys ≥ 1 ทุกชุด · general: tiers 4 · stamps 1 ("ซื้อครบ 10 ครั้ง") · journeys 6 (birthday new_member inactive_60 tier_at_risk review_request points_expiring — อ้าง presetKey ของ M3.3)
//   validateTemplate(t) → { ok, errors: string[] ไทย } — key ฟิลด์ไม่ซ้ำในชุด · type ∈ MemberFieldType · SELECT/MULTI_SELECT ต้องมี options.choices ≥ 2 · LOOKUP ต้องมี options.target · stamps.slots 3–30 · ruleKind/rewardKind ตามทะเบียน stamp · journeys ต้องมี presetKey ที่มีจริง หรือ trigger.event ∈ JOURNEY_TRIGGERS · tiers.key ไม่ซ้ำ
//   previewTemplate(ctx, key) → { template: { key, name }, sections: [{ key, label, exists, fields: [{ key, label, type, exists }] }], tiers: [{ key, label, exists }], stamps: [{ key, name, exists }], journeys: [{ key, name, exists }], counts: { sections, fields, tiers, stamps, journeys, newSections, newFields, newTiers, newStamps, newJourneys } } — exists = มีของร้านอยู่แล้ว (เทียบ key ของ section/field · key ของ tierDef · ชื่อของ stamp card · ชื่อของ journey)
//   applyTemplate(ctx, key, { parts?: ("fields"|"tiers"|"stamps"|"journeys")[] (ปริยายทั้ง 4), actor? (จำเป็นเมื่อมี tiers/stamps/journeys · สิทธิ์ member.settings.manage) }) → { added: { sections, fields, tiers, stamps, journeys }, created: { sectionIds, fieldIds, tierDefIds, stampCardIds, journeyIds } } — เพิ่มเฉพาะที่ยังไม่มี · ไม่ทับ label/options/กฎของเดิม · tiers → tiers.createTierDef (+benefits ถ้ามี) · stamps → stamp facade createCard · journeys → journeys.createJourney (enabled false · จาก preset หรือ definition) · เรียกซ้ำ → added 0 ทุกช่อง · key ไม่รู้จัก → throw ไทย · รูปแบบเดิม applyTemplate(ctx, key) (M1.2) ยังใช้ได้ (= parts ["fields"])
//   UI (ภาพ 03 kbar): FieldDesigner — field-template-select (17 ตัวเลือก จากทะเบียน) → เลือกแล้วแสดงแผง template-preview (ชื่อ · คำอธิบาย · นับ ส่วน n · ฟิลด์ n (ใหม่ n) · ระดับ n · สแตมป์ n · journey n · รายการฟิลด์ที่จะเพิ่ม (มีอยู่แล้ว = ป้าย "มีแล้ว") · เช็กบ็อกซ์ส่วนที่จะนำเข้า 4 ตัว template-part-<part>) · ปุ่ม field-apply-template (มีอยู่แล้ว M1.3 · ตอนนี้ต้องส่ง parts) · ตัวอย่างมือถือ field-preview-mobile แสดงฟิลด์ของเทมเพลตที่เลือก (ก่อน apply) · หลัง apply แสดงสรุป template-apply-result ("เพิ่มส่วน n · ฟิลด์ n · ระดับ n · สแตมป์ n · journey n")
//   testid: field-template-select (เดิม) · template-preview · template-preview-counts · template-part-fields · template-part-tiers · template-part-stamps · template-part-journeys · template-field-row-<key> · field-apply-template (เดิม) · template-apply-result
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/templates/b2b.ts") || !existsSync("src/lib/modules/member/templates-service.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (templates/b2b.ts · member/templates-service.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = "";
const made = { sectionIds: [] as string[], fieldIds: [] as string[], tierDefIds: [] as string[], stampCardIds: [] as string[], journeyIds: [] as string[] };
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const T = (await import("@/lib/modules/member/templates" as string)) as Any;
  const TS = (await import("@/lib/modules/member/templates-service" as string)) as Record<string, (...a: Any[]) => Any>;
  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const KEYS = ["dive", "clinic", "dental", "restaurant", "fitness", "hotel", "retail", "salon", "tutoring", "vet", "carcare", "travel", "sportsclub", "repair", "realestate", "b2b", "general"];
  const SENSITIVE = ["dive", "clinic", "dental", "fitness", "hotel", "salon", "tutoring", "travel", "realestate", "b2b"];
  const NO_TIERS = ["vet", "repair"]; const NO_STAMPS = ["realestate", "b2b"];
  const TPL: Record<string, Any> = T.TEMPLATES;

  // ═══ S1 ทะเบียน ═══
  const tplDir = "src/lib/modules/member/templates";
  const tplFiles = readdirSync(tplDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  const impure = tplFiles.filter((f) => /@\/lib\/core\/db|prisma|@\/lib\/modules\/(?!member\/templates)/.test(read(`${tplDir}/${f}`)));
  const names = KEYS.map((k) => TPL[k]?.name);
  chk("M3.9-S1.1", "TEMPLATES 17 key ครบตามลำดับ §10 + general · name ไทยไม่ซ้ำ · description ไทย · ไฟล์ต่อชุด 17 ไฟล์ในโฟลเดอร์ templates/ · เทมเพลตเป็นข้อมูลล้วน (ไม่ import prisma/facade อื่น)", KEYS.every((k) => !!TPL[k] && TPL[k].key === k && /[ก-๙]/.test(TPL[k].name ?? "") && /[ก-๙]/.test(TPL[k].description ?? "")) && new Set(names).size === 17 && Object.keys(TPL).length === 17 && tplFiles.length >= 17 && impure.length === 0, "17 ชุด", `keys=${Object.keys(TPL).join(",")} missing=${KEYS.filter((k) => !TPL[k]).join(",") || "-"} files=${tplFiles.length} impure=${impure.join(",") || "-"}`);
  const gen = TPL.general;
  const PRE = (await import("@/lib/modules/member/journey-presets" as string).catch(() => ({ JOURNEY_PRESETS: [] }))) as Any;
  const presetKeys = new Set((PRE.JOURNEY_PRESETS ?? []).map((p: Any) => p.key));
  chk("M3.9-S1.2", "general: tiers 4 · stamps 1 (slots 10 · 'ซื้อครบ 10 ครั้ง') · journeys 6 อ้าง presetKey ที่มีจริงใน JOURNEY_PRESETS (birthday new_member inactive_60 tier_at_risk review_request points_expiring หรือชื่อ preset ของ M3.3)", gen?.tiers?.length === 4 && gen.stamps?.length === 1 && gen.stamps[0].slots === 10 && /10/.test(gen.stamps[0].name ?? "") && gen.journeys?.length === 6 && gen.journeys.every((j: Any) => (j.presetKey && presetKeys.has(j.presetKey)) || j.trigger?.event), "ทั่วไปครบ", `tiers=${gen?.tiers?.length} stamps=${JSON.stringify(gen?.stamps?.[0])} journeys=${gen?.journeys?.map((j: Any) => j.presetKey ?? j.trigger?.event).join(",")} presets=${[...presetKeys].join(",")}`);

  // ═══ S2 validate ต่อชุด (16) — validate + กติกา §10 + apply จริง (เพิ่มเฉพาะที่ยังไม่มี) ═══
  const before = { sections: await P.memberSection.count({ where: { systemId: SYS } }), fields: await P.memberField.count({ where: { systemId: SYS } }) };
  const diveBefore = await P.memberField.findMany({ where: { systemId: SYS, key: { in: ["certLevel", "diveCount"] } }, select: { key: true, label: true, options: true } });
  for (const k of KEYS.filter((x) => x !== "general")) {
    const t = TPL[k];
    const v = t ? TS.validateTemplate(t) : { ok: false, errors: ["ไม่มีเทมเพลต"] };
    const fieldsAll: Any[] = t?.sections?.flatMap((s: Any) => s.fields) ?? [];
    const hasSensitive = t?.sections?.some((s: Any) => s.sensitive) || fieldsAll.some((f) => f.sensitive);
    const rules = !!t && t.sections.length >= 1 && fieldsAll.length >= 3 && (!SENSITIVE.includes(k) || hasSensitive) && (NO_TIERS.includes(k) || (t.tiers?.length ?? 0) >= 2) && (NO_STAMPS.includes(k) || (t.stamps?.length ?? 0) >= 1) && (t.journeys?.length ?? 0) >= 1;
    let applied: Any = null; let err: Error | null = null;
    if (v.ok && rules) {
      try {
        const pv = await TS.previewTemplate(ctx, k);
        applied = await TS.applyTemplate(ctx, k, { actor: owner });
        for (const key of ["sectionIds", "fieldIds", "tierDefIds", "stampCardIds", "journeyIds"] as const) made[key].push(...(applied?.created?.[key] ?? []));
        const countsOk = applied?.added?.sections === pv?.counts?.newSections && applied?.added?.fields === pv?.counts?.newFields && applied?.added?.tiers === pv?.counts?.newTiers && applied?.added?.stamps === pv?.counts?.newStamps && applied?.added?.journeys === pv?.counts?.newJourneys;
        const again = await TS.applyTemplate(ctx, k, { actor: owner });
        const idem = ["sections", "fields", "tiers", "stamps", "journeys"].every((x) => again?.added?.[x] === 0);
        applied = { ...applied, countsOk, idem, pv: pv?.counts };
      } catch (e) { err = e as Error; }
    }
    chk(`M3.9-S2.${KEYS.indexOf(k) + 1}`, `${k} (${t?.name ?? "?"}): validate ok · กติกา §10 (ส่วน ≥1 · ฟิลด์ ≥3${SENSITIVE.includes(k) ? " · อ่อนไหว" : ""}${NO_TIERS.includes(k) ? "" : " · ระดับ ≥2"}${NO_STAMPS.includes(k) ? "" : " · สแตมป์ ≥1"} · journey ≥1) · apply จริง (fields+tiers+stamps+journeys) added = preview.new* · apply ซ้ำ → 0 ทุกช่อง`, v.ok && rules && !err && applied?.countsOk && applied?.idem && applied.added.fields >= 1, "ผ่าน", `validate=${JSON.stringify(v.errors ?? []).slice(0, 120)} rules=${rules} (sections=${t?.sections?.length} fields=${fieldsAll.length} sens=${hasSensitive} tiers=${t?.tiers?.length} stamps=${t?.stamps?.length} journeys=${t?.journeys?.length}) err=${err?.message?.slice(0, 120) ?? "-"} added=${JSON.stringify(applied?.added)} pv=${JSON.stringify(applied?.pv)} idem=${applied?.idem}`);
  }
  const after = { sections: await P.memberSection.count({ where: { systemId: SYS } }), fields: await P.memberField.count({ where: { systemId: SYS } }) };
  const diveFields = await P.memberField.findMany({ where: { systemId: SYS, key: { in: ["certLevel", "diveCount"] } } });
  chk("M3.9-S3.1", "ไม่ทับของเดิม: ฟิลด์ dive ที่ seed ไว้ (certLevel/diveCount) label/options เท่าเดิม (เทียบกับ expected) · จำนวน section/field ที่เพิ่ม = Σ created ids · ทุก field ใหม่ผูก section ของระบบนี้ · ทะเบียน field ≤ 200", diveFields.length === 2 && diveFields.every((f: Any) => { const b = diveBefore.find((x: Any) => x.key === f.key); return !!b && f.label === b.label && JSON.stringify(f.options) === JSON.stringify(b.options); }) && after.fields - before.fields === made.fieldIds.length && after.sections - before.sections === made.sectionIds.length && (await P.memberField.count({ where: { id: { in: made.fieldIds }, systemId: SYS } })) === made.fieldIds.length, "ไม่ทับ", `dive=${JSON.stringify(diveFields.map((f: Any) => [f.key, f.label]))} Δfields=${after.fields - before.fields}/${made.fieldIds.length} Δsections=${after.sections - before.sections}/${made.sectionIds.length}`);
  const tierRows = await P.memberTierDef.findMany({ where: { id: { in: made.tierDefIds } } });
  const stampRows = made.stampCardIds.length ? await P.stampCard.findMany({ where: { id: { in: made.stampCardIds } } }) : [];
  const jRows = made.journeyIds.length ? await P.automationRule.findMany({ where: { id: { in: made.journeyIds } } }) : [];
  chk("M3.9-S3.2", "ของที่ apply สร้างจริง: tierDef (key/name ไทย · systemId นี้) · stampCard (slots 3–30 · ไม่ active/ปิดรับสแตมป์อัตโนมัติจนกว่าร้านเปิด หรือ active ได้ตามที่ builder ตัดสิน — ต้องจดใน wo-notes) · journey = AutomationRule scope MEMBER_JOURNEY enabled false", tierRows.length === made.tierDefIds.length && tierRows.every((r: Any) => r.systemId === SYS && /[ก-๙]/.test(r.name ?? "")) && stampRows.length === made.stampCardIds.length && stampRows.every((r: Any) => r.slots >= 3 && r.slots <= 30) && jRows.length === made.journeyIds.length && jRows.every((r: Any) => r.scope === "MEMBER_JOURNEY" && r.enabled === false), "สร้างครบ", `tiers=${tierRows.length}/${made.tierDefIds.length} stamps=${stampRows.length}/${made.stampCardIds.length} journeys=${jRows.length}/${made.journeyIds.length} enabled=${jRows.map((r: Any) => r.enabled).join(",")}`);
  const eKey = await fails(() => TS.applyTemplate(ctx, "nope", { actor: owner }));
  const ePerm = await fails(() => TS.applyTemplate(ctx, "general", { actor: thana, parts: ["tiers"] }));
  const legacy = await F.applyTemplate(ctx, "general");
  const pvG = await TS.previewTemplate(ctx, "general");
  chk("M3.9-S3.3", "key ไม่รู้จัก → throw ไทย · thana (ไม่มี settings.manage) apply tiers → throw · รูปแบบเดิม fields.applyTemplate(ctx, 'general') ยังใช้ได้ (= fields เท่านั้น · คืน added {sections, fields}) · previewTemplate(general) exists ถูก (ฟิลด์ที่มีแล้ว exists true) · counts.newFields = 0 หลัง apply", thai(eKey) && !!ePerm && typeof legacy?.added?.fields === "number" && pvG?.counts?.newFields === 0 && pvG.sections.every((s: Any) => s.fields.every((f: Any) => f.exists === true)), "กติกา", `key=${thai(eKey)} perm=${!!ePerm} legacy=${JSON.stringify(legacy)} pvG=${JSON.stringify(pvG?.counts)}`);
  if (legacy?.created?.fieldIds) made.fieldIds.push(...legacy.created.fieldIds); if (legacy?.created?.sectionIds) made.sectionIds.push(...legacy.created.sectionIds);

  // ═══ S4 UI / ภาพ ═══
  const fd = read("src/components/member/FieldDesigner.tsx") + (existsSync("src/components/member/TemplatePreview.tsx") ? read("src/components/member/TemplatePreview.tsx") : "");
  const TIDS = ["field-template-select", "template-preview", "template-preview-counts", "template-part-fields", "template-part-tiers", "template-part-stamps", "template-part-journeys", "template-field-row-", "field-apply-template", "template-apply-result"];
  const missingT = TIDS.filter((t) => !fd.includes(t));
  const LABELS = ["มีแล้ว", "ส่วน", "ฟิลด์", "ระดับ", "สแตมป์", "journey", "นำเข้า"];
  const missingL = LABELS.filter((l) => !fd.includes(l));
  chk("M3.9-S4.1", "FieldDesigner: testid 10 · dropdown วนจาก TEMPLATES (17 · ไม่ฮาร์ดโค้ดรายชื่อ) · แผงตัวอย่าง + เช็กบ็อกซ์ 4 ส่วน + ผลหลัง apply · ป้ายไทย · ไม่มีอีโมจิ/hex · action apply รับ parts", missingT.length === 0 && missingL.length === 0 && /TEMPLATES|templates/.test(fd) && /parts/.test(read("src/lib/modules/member/fields-actions.ts")) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fd.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(fd.replace(/\/\/.*$/gm, "")), "ครบ", `tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"} parts=${/parts/.test(read("src/lib/modules/member/fields-actions.ts"))}`);
  const dir = `${mq.MQC.shotsDir}/3.9`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.9-S4.2", "ภาพ 03 (kbar เทมเพลต): fields-template-owner desktop 200 (เลือก 'คลินิก/ความงาม' → แผงตัวอย่าง นับ + รายการฟิลด์ + ตัวอย่างมือถือ) · fields-template-mobile-owner mobile 200 ไม่ล้น", ok("owner", "fields-template-owner", "desktop") && ok("owner", "fields-template-owner", "mobile"), "200 ×2", `${r("owner", "fields-template-owner", "desktop")?.status}/${r("owner", "fields-template-owner", "mobile")?.status} missing=${JSON.stringify(r("owner", "fields-template-owner", "desktop")?.missing)}`);
  chk("M3.9-S4.3", "🔴 parity ภาพ 03 (ส่วนเลือกเทมเพลต + ตัวอย่างมือถือ) — Fable ตรวจด้วยตา · wo-notes/member-M3.9.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.9.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.9-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  if (made.journeyIds.length) { await d(() => P.automationRun.deleteMany({ where: { ruleId: { in: made.journeyIds } } })); await d(() => P.automationRule.deleteMany({ where: { id: { in: made.journeyIds } } })); }
  if (made.stampCardIds.length) { await d(() => P.stampEvent.deleteMany({ where: { cardId: { in: made.stampCardIds } } })); await d(() => P.stampCardProgress.deleteMany({ where: { cardId: { in: made.stampCardIds } } })); await d(() => P.stampCard.deleteMany({ where: { id: { in: made.stampCardIds } } })); }
  if (made.tierDefIds.length) { await d(() => P.memberTierBenefit?.deleteMany?.({ where: { tierDefId: { in: made.tierDefIds } } })); await d(() => P.memberTierDef.deleteMany({ where: { id: { in: made.tierDefIds } } })); }
  if (made.fieldIds.length) { await d(() => P.memberFieldValue.deleteMany({ where: { fieldId: { in: made.fieldIds } } })); await d(() => P.memberFieldHistory?.deleteMany?.({ where: { fieldId: { in: made.fieldIds } } })); await d(() => P.memberField.deleteMany({ where: { id: { in: made.fieldIds } } })); }
  if (made.sectionIds.length) await d(() => P.memberSection.deleteMany({ where: { id: { in: made.sectionIds } } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.9: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
