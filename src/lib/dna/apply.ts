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

/** สถานะพิมพ์เขียว + ผลราย step ที่บันทึกไว้ (ใช้ทั้งโหมดรวดเดียวและโหมดทีละขั้น) */
async function loadApplyState(
  tenantId: string,
  blueprintId: string,
): Promise<{ steps: BlueprintPlan["steps"]; results: StepResult[] }> {
  const bp = await prisma.dnaBlueprint.findFirst({ where: { id: blueprintId, tenantId } });
  if (!bp) throw new Error("ไม่พบพิมพ์เขียว");
  const plan = ZBlueprintPlan.parse(bp.plan);
  // ผลเดิม (idempotency): step ที่ ok แล้ว = ข้าม + เอา createdId ไป resolve ref ต่อ
  const prior = (bp.stepResults as unknown as StepResult[]) ?? [];
  return { steps: plan.steps, results: plan.steps.map((_, i) => prior[i] ?? { step: i, ok: false }) };
}

/** ทำ step เดียว — ไม่ throw (ล้ม = คืน StepResult ที่มี error) · ไม่แตะ DB ของใบพิมพ์เขียว */
async function execStep(
  tenantId: string,
  steps: BlueprintPlan["steps"],
  results: StepResult[],
  i: number,
): Promise<StepResult> {
  const createdId = (n: number): string => {
    const id = results[n]?.createdId;
    if (!id) throw new Error(`ยังไม่มี createdId ของ step ${n} (resolve ref ไม่ได้)`);
    return id;
  };
  const resolveRef = (ref: string): string => createdId(Number(ref.split(":")[1]));
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
    return { step: i, ok: true, ...(newId ? { createdId: newId } : {}) };
  } catch (e) {
    // step ล้ม → เก็บ error (ไม่ rollback — step ก่อนหน้า valid ในตัวเอง)
    return { step: i, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * บันทึกผลลง DB
 * - ครบทุก step ok → APPLIED + appliedAt
 * - step ที่เพิ่งทำล้ม → FAILED
 * - ยังทำไม่ครบแต่ไม่มีตัวล้ม (โหมดทีละขั้นระหว่างทาง) → คงสถานะเดิม เก็บแค่ความคืบหน้า
 */
async function persistResults(
  blueprintId: string,
  results: StepResult[],
  outcome: "done" | "failed" | "progress",
): Promise<void> {
  await prisma.dnaBlueprint.update({
    where: { id: blueprintId },
    data: {
      stepResults: results as unknown as Prisma.InputJsonValue,
      ...(outcome === "done" ? { status: "APPLIED" as const, appliedAt: new Date() } : {}),
      ...(outcome === "failed" ? { status: "FAILED" as const } : {}),
    },
  });
}

export async function applyBlueprint(
  tenantId: string,
  blueprintId: string,
): Promise<{ ok: boolean; results: StepResult[] }> {
  const { steps, results } = await loadApplyState(tenantId, blueprintId);

  let allOk = true;
  for (let i = 0; i < steps.length; i++) {
    if (results[i].ok) continue; // ทำสำเร็จแล้ว — ข้าม (apply ซ้ำระบบไม่งอก)
    results[i] = await execStep(tenantId, steps, results, i);
    if (!results[i].ok) {
      allOk = false;
      break; // หยุดที่ตัวแรกที่ล้ม
    }
  }

  await persistResults(blueprintId, results, allOk ? "done" : "failed");
  return { ok: allOk, results };
}

/** ความคืบหน้าของการประกอบระบบ — ส่งให้ UI วาดแถบ progress */
export type ApplyProgress = {
  total: number; // จำนวนขั้นทั้งหมดของพิมพ์เขียว
  done: number; // ทำสำเร็จแล้วกี่ขั้น
  stepIndex: number; // ขั้นที่เพิ่งทำในรอบนี้ (-1 = ไม่มีอะไรให้ทำแล้ว)
  ok: boolean; // ขั้นที่เพิ่งทำสำเร็จไหม (false = หยุด)
  finished: boolean; // ครบทุกขั้นแล้ว (ประกอบเสร็จ)
  error?: string;
};

/**
 * ประกอบ "ทีละขั้น" — ทำขั้นที่ค้างอยู่ขั้นเดียวแล้วคืนความคืบหน้า
 * UI เรียกซ้ำจนกว่า finished/!ok เพื่อโชว์แถบ progress ตามจริง (ไม่ใช่แถบหลอกที่วิ่งเอง)
 * ใช้กลไก idempotent ชุดเดียวกับ applyBlueprint — เรียกสลับกันหรือทำต่อจากที่ค้างก็ได้
 */
export async function applyBlueprintStep(
  tenantId: string,
  blueprintId: string,
): Promise<ApplyProgress> {
  const { steps, results } = await loadApplyState(tenantId, blueprintId);
  const total = steps.length;
  const next = results.findIndex((r) => !r.ok);

  // ไม่มีขั้นค้าง = ประกอบครบแล้ว (เช่นกดซ้ำ/รีเฟรชกลับมา) → ปิดใบให้เป็น APPLIED
  if (next === -1) {
    await persistResults(blueprintId, results, "done");
    return { total, done: total, stepIndex: -1, ok: true, finished: true };
  }

  results[next] = await execStep(tenantId, steps, results, next);
  const done = results.filter((r) => r.ok).length;
  const finished = done === total;
  const ok = results[next].ok;
  await persistResults(blueprintId, results, finished ? "done" : ok ? "progress" : "failed");

  return {
    total,
    done,
    stepIndex: next,
    ok,
    finished,
    ...(results[next].error ? { error: results[next].error } : {}),
  };
}
