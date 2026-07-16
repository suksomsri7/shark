// compile(facts) → BlueprintPlan — "สมอง" ของ DNA Wizard (FREEZE โดย Fable)
//
// กติกาเหล็ก:
// - **pure function**: facts เดิม → แผนเดิม byte-ต่อ-byte เสมอ (oracle ตรวจด้วย planHash)
//   ห้ามใช้ Date.now()/random/DB — ทุกอย่าง derive จาก facts + tenantName เท่านั้น
// - ทุก step มี `because` ชี้ข้อเท็จจริงที่ทำให้เกิด — support ไล่ย้อนได้ทุกเมนู
// - ดูข้อเท็จจริงรายข้อ ห้าม switch(industryHint) — hint ใช้แค่ตั้งชื่อให้เป็นธรรมชาติ
// - เลือกจากระบบที่ available เท่านั้น (HR/INVENTORY/AI/KB ยัง coming_soon — ไม่แตะ)

import type { BlueprintPlan, BlueprintStep, DnaFacts } from "./schema";

const UNIT_LABEL: Record<string, string> = {
  HOTEL: "ที่พัก",
  RESTAURANT: "ร้านอาหาร",
  BOOKING: "จองคิว/นัดหมาย",
  QUEUE: "บัตรคิว",
};

export function compile(facts: DnaFacts, tenantName: string): BlueprintPlan {
  const steps: BlueprintStep[] = [];
  const ref = () => `step:${steps.length - 1}`;

  // ── 1) ระบบ business (มีหน้างาน) — ข้อเท็จจริงข้อไหนจริง สร้างประเภทนั้น ──
  const unitTypes: { type: "HOTEL" | "RESTAURANT" | "BOOKING" | "QUEUE"; because: string }[] = [];
  if (facts.rooms) unitTypes.push({ type: "HOTEL", because: "มีห้องพักให้เข้าพัก (rooms=true)" });
  if (facts.tables) unitTypes.push({ type: "RESTAURANT", because: "มีโต๊ะให้ลูกค้านั่ง (tables=true)" });
  if (facts.appointment) unitTypes.push({ type: "BOOKING", because: "ลูกค้านัดหมายล่วงหน้า (appointment=true)" });
  if (facts.walkinQueue) unitTypes.push({ type: "QUEUE", because: "มีคิวหน้าร้าน walk-in (walkinQueue=true)" });

  const unitRefs: string[] = [];
  for (const u of unitTypes) {
    for (let b = 1; b <= facts.branchCount; b++) {
      const branchSuffix = facts.branchCount > 1 ? ` สาขา ${b}` : "";
      steps.push({
        type: "CREATE_UNIT",
        unitType: u.type,
        name: `${UNIT_LABEL[u.type]}${branchSuffix}`,
        slug: `${u.type.toLowerCase()}${facts.branchCount > 1 ? `-${b}` : ""}`,
        because: u.because + (facts.branchCount > 1 ? ` · ${facts.branchCount} สาขา (branchCount=${facts.branchCount})` : ""),
      });
      unitRefs.push(ref());
    }
  }

  // ── 2) ระบบ feature — สร้างชุดเดียวแชร์ทุกสาขา (หลัก blueprint: หลาย unit เชื่อม feature เดียว = แชร์ข้อมูล) ──
  const featureRef: Partial<Record<string, string>> = {};
  const addFeature = (systemType: BlueprintStep extends never ? never : "MEMBER" | "POINT" | "POS" | "REWARD" | "CHAT" | "ACCOUNT", name: string, because: string) => {
    steps.push({ type: "CREATE_SYSTEM", systemType, name, because });
    featureRef[systemType] = ref();
  };

  if (facts.sellsGoods) addFeature("POS", "ขายหน้าร้าน", "ขายสินค้า/คิดเงินหน้าร้าน (sellsGoods=true)");
  if (facts.membership) {
    addFeature("MEMBER", "สมาชิก", "มีระบบสมาชิก (membership=true)");
    addFeature("POINT", "สะสมแต้ม", "สมาชิกสะสมแต้ม (membership=true)");
    if (facts.rewardRedeem) addFeature("REWARD", "ของรางวัล", "เอาแต้มแลกของรางวัลได้ (rewardRedeem=true)");
  }
  if (facts.usesLineOA) addFeature("CHAT", "แชทลูกค้า", "ใช้ LINE OA คุยกับลูกค้า (usesLineOA=true)");
  if (facts.wantsAccounting) addFeature("ACCOUNT", "บัญชี", "ต้องการระบบบัญชี/ออกเอกสาร (wantsAccounting=true)");

  // ── 3) เชื่อม feature ↔ unit (opt-in ตาม blueprint — DNA เชื่อมให้ตั้งแต่วันแรก) ──
  const linkable = ["POS", "MEMBER", "POINT", "REWARD"] as const;
  for (const ft of linkable) {
    const sysRef = featureRef[ft];
    if (!sysRef) continue;
    for (const uRef of unitRefs) {
      steps.push({
        type: "LINK_UNIT",
        systemRef: sysRef,
        unitRef: uRef,
        because: `หน้างานทุกสาขาใช้${ft === "POS" ? "จุดขาย" : ft === "MEMBER" ? "ฐานสมาชิก" : ft === "POINT" ? "แต้ม" : "ของรางวัล"}ชุดเดียวกัน`,
      });
    }
  }

  // ── 4) บัญชี: ตั้งค่า + ต่อสาย POS→Account (ท่อ M1 — เงินทุกบาทเข้าบัญชีตั้งแต่วันแรก) ──
  const accRef = featureRef["ACCOUNT"];
  if (accRef) {
    steps.push({
      type: "ACCOUNT_SETTINGS",
      accountRef: accRef,
      settings: { orgName: tenantName, vatRegistered: facts.vatRegistered },
      because: facts.vatRegistered ? "จดทะเบียน VAT (vatRegistered=true)" : "ไม่จด VAT — ปิดโหมดภาษีขาย",
    });
    const posRef = featureRef["POS"];
    if (posRef) {
      steps.push({
        type: "LINK_ACCOUNT_POS",
        accountRef: accRef,
        posRef,
        because: "มีทั้ง POS และบัญชี → ยอดขายเข้าบัญชีอัตโนมัติ (contract 2.4)",
      });
    }
  }

  return { dnaVersion: 1, steps };
}
