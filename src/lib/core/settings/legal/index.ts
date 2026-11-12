// ─────────────────────────────────────────────────────────────
// settings/legal/index.ts — ทะเบียนตัวตรวจกฎหมายหลายไฟล์ (หอ th-rental-2568 + ทัวร์ th-tour-2569) · RUN TRIPS T0.1
// สัญญา: ledger/TRIPS-CORE-CONTRACT.md §E.5 ข้อ 4 · ใบสั่ง T0.1 §3.3
// registry/service import ตัวตรวจจากที่นี่ · โดเมน trips/agency/ticket = th-tour (OK/WARN เท่านั้น) · โดเมนอื่น = th-rental (ทางเดิม)
// 🔴 pure: re-export + ตัวช่วยแยกโดเมน/ruleId (ไม่มี import นอกโฟลเดอร์นี้)
// ─────────────────────────────────────────────────────────────
import { TH_RENTAL_2568_RULES, type LegalRuleId as RentalRuleId } from "./th-rental-2568";

export {
  evaluateLegal,
  isValidOutOfScopeReason,
  normalizeLegalMode,
  TH_RENTAL_2568_RULES,
  type LegalCtx,
  type LegalOutcome,
  type LegalRuleInputs,
  type LegalVerdict,
} from "./th-rental-2568";
export type { LegalRuleId as RentalRuleId } from "./th-rental-2568";
export {
  evaluateTourRule,
  isTourRuleId,
  INVALID_INPUT_WARN,
  TH_TOUR_2569_RULES,
  TOUR_RULE_IDS,
  WAIVER_FORBIDDEN_TERMS,
  type TourCheckpoint,
  type TourEvalOpts,
  type TourRule,
  type TourRuleId,
  type TourRuntimeInput,
  type TourSeverity,
  type TourVerdict,
} from "./th-tour-2569";

/** โดเมนที่ใช้ตัวตรวจทัวร์ (คำเตือนเท่านั้น · รับทราบไม่ต้องมีเหตุผล · ไม่มีสายอนุมัติเจ้าของ) */
export const TOUR_LEGAL_DOMAINS: readonly string[] = ["trips", "agency", "ticket"];
export const isTourLegalDomain = (domain: string): boolean => TOUR_LEGAL_DOMAINS.includes(domain);
export const isRentalRuleId = (id: unknown): id is RentalRuleId => typeof id === "string" && Object.prototype.hasOwnProperty.call(TH_RENTAL_2568_RULES, id);
