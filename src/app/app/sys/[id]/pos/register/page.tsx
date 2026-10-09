import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { getPaymentProfile } from "@/lib/payment/service";
import { isValidPromptPayId } from "@/lib/payment/promptpay";
import { posUnits, resolvePosLinks, posCatalog, posMembers, posServices, registerCatalog, registerSellerLimits, registerStatus, registerVatConfig } from "@/lib/modules/pos/register";
import { PosRegister } from "@/lib/modules/pos/register-ui";
import { PosLegacyRegisterFrame, PosRegisterUnlinked } from "@/lib/modules/pos/register-legacy-page";
import { posRegisterV2On } from "@/lib/modules/pos/register-shared";
import { parsePosPaymentSettings } from "@/lib/modules/pos/payment-settings";
import { unitOversellPolicy } from "@/lib/modules/pos/service";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posRegisterView } from "@/lib/modules/pos/access";
import { RegisterScreen } from "@/components/pos/register/RegisterScreen";
// POS P1.7U ▸ ใบขอรับเงิน: ค่าตั้ง settings.pos.payment + คีย์ Beam ของแพลตฟอร์ม (boolean เท่านั้น) + สิทธิ์ยืนยันเอง ◂
import { evaluate } from "@/lib/core/rbac";
import { beamEnabled } from "@/lib/payment/beam";
import { parsePosIntentSettings } from "@/lib/modules/pos/payment-intent-shared";

// หน้าขาย POS (cashier) — เปิดบิลเก็บเงิน walk-in เงินสด/พร้อมเพย์
//
// POS P1.3 (มติ Q4): ธงต่อระบบ POS `AppSystem.settings.pos.registerV2`
//   === true เท่านั้น ⇒ หน้าขายใหม่ (RegisterScreen · src/components/pos/register/*) · ค่าอื่นทุกแบบ (ไม่มี · "true" · 1) ⇒ หน้าขายเดิม
//   ร้านจริง: ปิดจนกว่า P1.6 + P1.12 ลง · ร้าน QC: เปิดผ่าน scripts/seed-pos-qc.mts
// 🔴 ด่านสิทธิ์ HF-POS-PAGES ด้านล่างใช้ร่วมทั้งสองจอ (ห้ามแยก/ข้าม) · ขอสาขาที่เข้าไม่ได้ = notFound (404 ไม่ใช่ 403)
// 🔴 หน้าขายเดิม: <PosRegister> + โครงหน้าเดิม (register-legacy-page.tsx) props ชุดเดิมทุกตัว · register-ui.tsx ห้ามแตะ (S5.12)
// B2.1: ตัวอ่านธงย้ายไป register-shared.ts (posRegisterV2On) — layout ใช้ตัวเดียวกันตัดสินโหมดรางของ shell ตอน SSR
//   ⇒ ธงปิด = shell วาดแถบเมนูตามที่ผู้ใช้เลือกเหมือน main ทุกอย่าง · ธงเปิด = รางไอคอนตั้งแต่ HTML แรก (ไม่กระพริบ)

export default async function PosRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { id } = await params;
  const { unit: unitParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  // B2.3 N-b: จอใหม่เฉพาะระบบที่ active — ตรงกับ layout ที่โหลดเฉพาะระบบ active มาตัดสินโหมดราง (ไม่งั้นจอใหม่ไม่มีราง)
  const v2 = sys.active && posRegisterV2On(sys.settings);

  const tabs = posTabs(id);

  // HF-POS-PAGES: เดิมไม่ตรวจสิทธิ์ + ?unit= ของสาขาอื่นก็เปิดได้ (โหลดสมาชิก/สินค้าของสาขานั้น)
  //   ตอนนี้: ต้องขายได้ · รายการสาขาเหลือเฉพาะที่เข้าได้ · ขอสาขาที่เข้าไม่ได้ = notFound
  const view = posRegisterView(posMembership(auth.active), await posUnits(tenantId, id), unitParam);
  if (!view.ok) notFound();
  const units = view.units;

  // ยังไม่ผูก POS กับกิจการใด → ขายไม่ได้ (createSale ต้องมี unit) → ชี้ไปเชื่อม
  if (units.length === 0 || !view.active) {
    return <PosRegisterUnlinked title={`${def?.icon ?? ""} ${sys.name}`.trim()} tabs={tabs} systemId={id} railFrame={v2} />;
  }

  // เลือก unit ที่จะขาย: จาก ?unit= ถ้าถูกต้อง ไม่งั้นตัวแรกที่เข้าได้ (posRegisterView)
  const active = view.active;

  // ── หน้าขายใหม่ (ธงเปิด) — ผู้ขาย = membership ของ session เท่านั้น ──
  if (v2) {
    const actor = { userId: auth.user.id, ...posMembership(auth.active) };
    const ctx = { tenantId, systemId: id, unitId: active.id };
    const [catalog, status, vat, profile, oversell] = await Promise.all([
      registerCatalog(ctx, actor),
      registerStatus(ctx, actor),
      registerVatConfig(ctx),
      getPaymentProfile({ tenantId }),
      // P1.2 U R2: นโยบายขายเกินสต็อกของสาขา (ตัวอ่านเดียว · service.ts) — ตัวแปรที่หมดเลือกได้เฉพาะเมื่ออนุญาตติดลบ
      unitOversellPolicy(prisma, tenantId, active.id),
    ]);
    const limits = registerSellerLimits(actor, active.id);
    const ppId = profile?.promptpayId && isValidPromptPayId(profile.promptpayId) ? profile.promptpayId : null;
    const intentSet = parsePosIntentSettings(sys.settings);
    return (
      <RegisterScreen
        key={active.id}
        systemId={id}
        unitId={active.id}
        userId={auth.user.id}
        tenantName={auth.active.tenant.name}
        units={units.map((u) => ({ id: u.id, name: u.name }))}
        initialCatalog={catalog.ok ? { categories: catalog.categories, products: catalog.products, nextCursor: catalog.nextCursor } : null}
        initialStatus={status.ok ? status : null}
        vat={vat.ok ? { mode: vat.mode, rateBp: vat.rateBp } : { mode: "NONE", rateBp: 0 }}
        limits={limits}
        promptpayId={ppId}
        tipEnabled={parsePosPaymentSettings(sys.settings).tip.enabled}
        oversellBlock={oversell === "BLOCK"}
        payIntent={{
          beamCard: intentSet.beam.enabled && beamEnabled(),
          manualRequiresManager: intentSet.manualConfirmRequiresManager,
          canManageShift: evaluate(posMembership(auth.active), { module: "pos", action: "pos.shift.manage", unitId: active.id }),
          promptpayLink: "/app/settings/payment",
        }}
      />
    );
  }

  // ── หน้าขายเดิม (ธงปิด) — เหมือนก่อน P1.3 ทุกอย่าง ──
  const [links, profile] = await Promise.all([resolvePosLinks(tenantId, active.id), getPaymentProfile({ tenantId })]);
  const [catalog, members, services] = await Promise.all([
    links.inventorySystemId ? posCatalog(tenantId, links.inventorySystemId) : Promise.resolve([]),
    links.memberSystemId ? posMembers(tenantId, links.memberSystemId) : Promise.resolve([]),
    // บริการจากแคตตาล็อกกลาง (ระบบสินค้า/บริการ) — ต้นฉบับเดียวกับที่หน้าจองใช้
    posServices(tenantId, links.inventorySystemId, active.id),
  ]);
  const hasPromptPay = !!profile?.promptpayId;

  return (
    <PosLegacyRegisterFrame
      title={`${def?.icon ?? ""} ${sys.name}`.trim()}
      tabs={tabs}
      systemId={id}
      units={units}
      activeUnitId={active.id}
      wide={!!links.memberSystemId}
      hasPromptPay={hasPromptPay}
    >
      <PosRegister
        services={services}
        systemId={id}
        unitId={active.id}
        catalog={catalog}
        members={members}
        couponEnabled={!!links.couponSystemId}
        hasPromptPay={hasPromptPay}
      />
    </PosLegacyRegisterFrame>
  );
}
