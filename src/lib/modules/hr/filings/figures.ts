// HR H3.6 ▸ ตัวเลขของแบบยื่นจากค่าที่เก็บไว้เท่านั้น (pure) — brief R3 · ไม่คำนวณภาษี/เงินสมทบใหม่ (ไม่มีสูตร ไม่มีตารางกฎหมาย)
//   รุ่น 2 (H3.4): เงินได้ = snapshot.whtIncomeSatang · ภาษี = item.whtSatang (ภาษีโบนัสอยู่ในนี้แล้ว) · ภาษีครั้งเดียว = snapshot.whtOneOffSatang (≤ ภาษี) ·
//     ค่าจ้างประกันสังคมจริง = snapshot.ssoWageSatang · หลังเพดาน = item.ssoBaseSatang
//   รุ่น 1: เงินได้ = snapshot.baseSalarySatang + item.addSatang · ภาษี = item.whtSatang · ภาษีครั้งเดียว = null ·
//     ค่าจ้างจริง = ฐาน ถ้า snapshot.ssoEligible ไม่งั้น 0 · หลังเพดาน = item.ssoBaseSatang (ไฟล์เตือน V1_RUN)
//   คีย์หาย/ไม่ใช่จำนวนเต็มไม่ติดลบ/รุ่นอื่น ⇒ {ok:false} (ผู้เรียกปฏิเสธ RUN_DATA พร้อมงวด) ◂

export type FigureRow = {
  engineVersion: unknown;
  whtSatang: unknown;
  addSatang: unknown;
  ssoBaseSatang: unknown;
  ssoEmployeeSatang: unknown;
  ssoEmployerSatang: unknown;
  snapshotJson: unknown;
};
export type Figures = {
  ok: true;
  source: "V1" | "V2";
  incomeSatang: number;
  taxSatang: number;
  oneOffTaxSatang: number | null;
  ssoWageActualSatang: number;
  ssoWageClampedSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
};

/** จำนวนเต็มสตางค์ที่ไม่ติดลบ (ไม่รับสตริง/ทศนิยม/NaN) */
export const satangOk = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** แถวรายการเงินเดือน (คอลัมน์ + snapshotJson) → ตัวเลขของแบบยื่น */
export function itemFigures(row: FigureRow | null | undefined): Figures | { ok: false } {
  const bad = { ok: false } as const;
  if (!row || typeof row !== "object") return bad;
  const snap = row.snapshotJson;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return bad;
  const snapshot = snap as Record<string, unknown>;
  const { whtSatang, addSatang, ssoBaseSatang, ssoEmployeeSatang, ssoEmployerSatang } = row;
  if (!satangOk(whtSatang) || !satangOk(ssoBaseSatang) || !satangOk(ssoEmployeeSatang) || !satangOk(ssoEmployerSatang)) return bad;
  const common = { taxSatang: whtSatang, ssoWageClampedSatang: ssoBaseSatang, ssoEmployeeSatang, ssoEmployerSatang };
  if (row.engineVersion === 2) {
    const inc = snapshot.whtIncomeSatang;
    const one = snapshot.whtOneOffSatang;
    const wage = snapshot.ssoWageSatang;
    if (!satangOk(inc) || !satangOk(one) || !satangOk(wage) || one > whtSatang) return bad;
    return {
      ok: true,
      source: "V2",
      incomeSatang: inc,
      taxSatang: common.taxSatang,
      oneOffTaxSatang: one,
      ssoWageActualSatang: wage,
      ssoWageClampedSatang: common.ssoWageClampedSatang,
      ssoEmployeeSatang: common.ssoEmployeeSatang,
      ssoEmployerSatang: common.ssoEmployerSatang,
    };
  }
  if (row.engineVersion === 1) {
    const base = snapshot.baseSalarySatang;
    const eligible = snapshot.ssoEligible;
    if (!satangOk(base) || !satangOk(addSatang) || typeof eligible !== "boolean") return bad;
    const income = base + addSatang;
    if (!Number.isSafeInteger(income)) return bad;
    return {
      ok: true,
      source: "V1",
      incomeSatang: income,
      taxSatang: common.taxSatang,
      oneOffTaxSatang: null,
      ssoWageActualSatang: eligible ? base : 0,
      ssoWageClampedSatang: common.ssoWageClampedSatang,
      ssoEmployeeSatang: common.ssoEmployeeSatang,
      ssoEmployerSatang: common.ssoEmployerSatang,
    };
  }
  return bad;
}
