// apply.ts — ประกอบระบบจริงจาก BlueprintPlan (M3 — Builder)
//
// หน้าที่: แปลงข้อเท็จจริง (DnaFacts) → พิมพ์เขียว (compile) → ประกอบระบบจริงในฐานข้อมูล
// - saveDnaFacts    : บันทึกข้อเท็จจริง (upsert 1 profile/tenant)
// - proposeBlueprint: compile แล้วเสนอใบ PROPOSED (idempotent ตาม planHash)
// - applyBlueprint  : เดิน steps ทีละข้อ · resolve ref "step:i" · idempotent ต่อ step · ไม่ rollback
//
// map step → primitive ที่มีอยู่แล้ว (ห้ามเพิ่ม primitive ใหม่):
//   CREATE_UNIT      → prisma.businessUnit.create
//   CREATE_SYSTEM    → system/service.createSystem
//   LINK_UNIT        → system/service.linkUnit
//   LINK_ACCOUNT_POS → prisma.accountSystemLink.create (P2002 = ถือว่าต่อไว้แล้ว = ok)
//   ACCOUNT_SETTINGS → account/service.saveSettings + gl.ensureAccounting
// (dna ไม่ใช่ module → import ข้าม module ได้ปกติ ยืนยันด้วย pnpm fitness)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { compile } from "./compile";
import { planHash, ZDnaFacts, ZBlueprintPlan } from "./schema";
import type { BlueprintPlan, DnaFacts } from "./schema";
import { createSystem, linkUnit } from "@/lib/modules/system/service";
import { saveSettings } from "@/lib/modules/account/service";
import { ensureAccounting } from "@/lib/modules/account/gl";

type StepResult = { step: number; ok: boolean; createdId?: string; error?: string };

// ─────────────────── บันทึกข้อเท็จจริง ───────────────────

export async function saveDnaFacts(tenantId: string, facts: DnaFacts): Promise<void> {
  // validate ที่ boundary เสมอ — ห้ามให้ facts ที่ผิดสัญญาหลุดเข้า DB
  const valid = ZDnaFacts.parse(facts);
  const json = valid as unknown as Prisma.InputJsonValue;
  await prisma.dnaProfile.upsert({
    where: { tenantId },
    create: { tenantId, facts: json },
    update: { facts: json },
  });
}

// ─────────────────── เสนอพิมพ์เขียว (idempotent ตาม hash) ───────────────────

export async function proposeBlueprint(
  tenantId: string,
): Promise<{ blueprintId: string; plan: BlueprintPlan }> {
  const profile = await prisma.dnaProfile.findUnique({ where: { tenantId } });
  if (!profile) throw new Error("ยังไม่มีข้อมูลธุรกิจ — ตอบคำถามสัมภาษณ์ให้ครบก่อน");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const facts = ZDnaFacts.parse(profile.facts);
  const plan = compile(facts, tenant.name);
  ZBlueprintPlan.parse(plan); // กันแผนหลุดสัญญา (compile freeze แต่ validate เผื่อ)
  const hash = planHash(plan);

  // มีใบ PROPOSED hash เดียวกันอยู่แล้ว → คืนใบเดิม (ไม่งอกใหม่)
  const existing = await prisma.dnaBlueprint.findFirst({
    where: { tenantId, status: "PROPOSED", planHash: hash },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { blueprintId: existing.id, plan: existing.plan as unknown as BlueprintPlan };

  const created = await prisma.dnaBlueprint.create({
    data: {
      tenantId,
      profileId: profile.id,
      plan: plan as unknown as Prisma.InputJsonValue,
      planHash: hash,
      status: "PROPOSED",
    },
  });
  return { blueprintId: created.id, plan };
}

// ─────────────────── ประกอบระบบจริง ───────────────────

export async function applyBlueprint(
  tenantId: string,
  blueprintId: string,
): Promise<{ ok: boolean; results: StepResult[] }> {
  const bp = await prisma.dnaBlueprint.findFirst({ where: { id: blueprintId, tenantId } });
  if (!bp) throw new Error("ไม่พบพิมพ์เขียว");

  const plan = ZBlueprintPlan.parse(bp.plan);
  const steps = plan.steps;

  // ผลเดิม (idempotency): step ที่ ok แล้ว = ข้าม + เอา createdId ไป resolve ref ต่อ
  const prior = (bp.stepResults as unknown as StepResult[]) ?? [];
  const results: StepResult[] = steps.map((_, i) => prior[i] ?? { step: i, ok: false });
  const createdId = (i: number): string => {
    const id = results[i]?.createdId;
    if (!id) throw new Error(`ยังไม่มี createdId ของ step ${i} (resolve ref ไม่ได้)`);
    return id;
  };
  const resolveRef = (ref: string): string => createdId(Number(ref.split(":")[1]));

  let allOk = true;
  for (let i = 0; i < steps.length; i++) {
    if (results[i].ok) continue; // ทำสำเร็จแล้ว — ข้าม (apply ซ้ำระบบไม่งอก)
    const step = steps[i];
    try {
      let newId: string | undefined;
      switch (step.type) {
        case "CREATE_UNIT": {
          const unit = await prisma.businessUnit.create({
            data: { tenantId, type: step.unitType, name: step.name, slug: step.slug },
          });
          newId = unit.id;
          break;
        }
        case "CREATE_SYSTEM": {
          const sys = await createSystem(tenantId, step.systemType, step.name);
          newId = sys.id;
          break;
        }
        case "LINK_UNIT": {
          await linkUnit(tenantId, resolveRef(step.systemRef), resolveRef(step.unitRef));
          break;
        }
        case "LINK_ACCOUNT_POS": {
          try {
            await prisma.accountSystemLink.create({
              data: {
                tenantId,
                systemId: resolveRef(step.accountRef),
                linkedKind: "POS",
                linkedId: resolveRef(step.posRef),
              },
            });
          } catch (e) {
            // ต่อสายไว้แล้ว (unique ชน) = ถือว่าเรียบร้อย — idempotent
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
          }
          break;
        }
        case "ACCOUNT_SETTINGS": {
          const accId = resolveRef(step.accountRef);
          await saveSettings(tenantId, accId, {
            orgName: step.settings.orgName,
            vatRegistered: step.settings.vatRegistered,
          });
          await ensureAccounting({ tenantId, systemId: accId });
          break;
        }
      }
      results[i] = { step: i, ok: true, ...(newId ? { createdId: newId } : {}) };
    } catch (e) {
      // step ล้ม → เก็บ error แล้วหยุด (ไม่ rollback — step ก่อนหน้า valid ในตัวเอง)
      results[i] = { step: i, ok: false, error: e instanceof Error ? e.message : String(e) };
      allOk = false;
      break;
    }
  }

  await prisma.dnaBlueprint.update({
    where: { id: blueprintId },
    data: {
      status: allOk ? "APPLIED" : "FAILED",
      stepResults: results as unknown as Prisma.InputJsonValue,
      ...(allOk ? { appliedAt: new Date() } : {}),
    },
  });

  return { ok: allOk, results };
}
