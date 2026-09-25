import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getScoringSettings, listRules } from "@/lib/modules/crm/scoring";
import {
  SCORE_BAND_LABELS,
  SCORE_EXPIRES_DAYS_MAX,
  SCORE_MAX_PER_DAY_MAX,
  SCORE_POINTS_MAX,
  SCORE_POINTS_MIN,
  SCORE_RULE_EVENT_CHOICES,
  SCORE_RULE_NAME_MAX,
  SCORE_SEED_KEYS,
  SCORE_DELETE_REASON_MIN,
  scoreEventLabel,
} from "@/lib/modules/crm/scoring-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmScoringManager } from "@/components/crm/scoring/CrmScoringManager";
import type { CrmScorePageData } from "@/components/crm/scoring/types";

// คะแนนผู้ติดต่อ (ใบ C2.8 · พิมพ์เขียว §5.7 §11.5 §4.5 · ภาพ 05) — `/app/sys/{id}/crm/settings/scoring`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.score.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร (ปุ่ม "คำนวณใหม่" เริ่มจากการดูผลก่อน — dry run ไม่แตะฐาน)
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ทะเบียนเหตุการณ์/ป้ายไทย/เพดานถูกแปลงเป็น props ที่นี่
//    (หน้านี้อยู่ใน self-dir ของ CRM จึง import ไฟล์ `*-shared` ได้ตรง ๆ — ทะเบียนตัวเดียวกับเอนจิน ไม่มีการพิมพ์ซ้ำ)
export default async function CrmScoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.score.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rules, bands] = await Promise.all([listRules(ctx, actor), getScoringSettings(ctx, actor)]);

  const data: CrmScorePageData = {
    systemId: id,
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      event: r.event,
      eventLabel: r.eventLabel,
      points: r.points,
      expiresDays: r.expiresDays,
      maxPerDay: r.maxPerDay,
      active: r.active,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      seedKey: r.seedKey,
    })),
    bands,
    // 🔴 รอบแก้ 25 ก.ย.: ช่องเลือกเหตุการณ์ = เฉพาะตัวที่ "มีทางเดินมาถึงการให้คะแนนจริง" (สะพาน + เงียบหาย)
    //    ชุดเดียวกับที่ `createRule`/`updateRule` รับ ⇒ ร้านตั้งกฎที่ไม่มีวันทำงานไม่ได้อีก
    events: SCORE_RULE_EVENT_CHOICES.map((v) => ({ value: v, label: scoreEventLabel(v) })),
    bandLabels: { hot: SCORE_BAND_LABELS.HOT, warm: SCORE_BAND_LABELS.WARM, cold: SCORE_BAND_LABELS.COLD },
    seedCount: SCORE_SEED_KEYS.length,
    limits: {
      nameMax: SCORE_RULE_NAME_MAX,
      pointsMin: SCORE_POINTS_MIN,
      pointsMax: SCORE_POINTS_MAX,
      expiresMax: SCORE_EXPIRES_DAYS_MAX,
      maxPerDayMax: SCORE_MAX_PER_DAY_MAX,
      reasonMin: SCORE_DELETE_REASON_MIN,
      decayDaysMax: SCORE_EXPIRES_DAYS_MAX,
    },
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="คะแนนผู้ติดต่อ — ให้แต้มลูกค้าตามสิ่งที่เขาทำ (กรอกฟอร์ม · ทักแชท · เปิดอีเมล · นัดพบ) แล้วทีมขายเห็นเองว่าใครควรโทรก่อน"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmScoringManager data={data} />
    </div>
  );
}
