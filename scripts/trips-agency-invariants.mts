// trips-agency-invariants.mts — คิวรีค่าคงที่ของสมุดเอเจนซี่ (RUN TRIPS A1.1 · มติผู้คุม R6) — ไฟล์ของผู้เขียนข้อสอบ · builder ห้ามแก้
// ใช้ซ้ำในข้อสอบ A1.5 · A1.6 · A1.7 · X.3: import { agencyBalanceDrift, agencyStatementDrift } from "./trips-agency-invariants.mts"
// 🔴 ไม่ import อะไรเลย (รับฟังก์ชันคิวรีจากผู้เรียก — ใช้กับ pg.Pool / pg.PoolClient ใน tx ได้) · อ่านอย่างเดียว
//
// ค่าคงที่ (ใบสั่ง A1.1 §2.3 · CC §I.2):
//   B1 ทุกบัญชีที่มีรายการในสมุดมีแถว AgentBalance
//   B2 AgentBalance.balanceSatang = Σ AgentLedgerEntry.amountSatang ของบัญชีนั้น
//   B3 AgentBalance.lastSeq = max(seq) และจำนวนรายการ = max(seq) (seq ต่อเนื่อง 1..n ไม่ขาด)
//   S1 ทุกใบแจ้งยอดที่ไม่ VOID: totalSatang = openingSatang + Σ amountSatang ของรายการที่ statementId = ใบนั้น
//   (คืน "แถวที่ผิด" — ว่าง = ผ่าน)

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** $1 = tenantIds text[] | null (null = ทุกร้าน) */
export const AGENCY_BALANCE_DRIFT_SQL = `
SELECT COALESCE(b."agentAccountId", e."agentAccountId") AS "agentAccountId",
       COALESCE(b."tenantId", e."tenantId") AS "tenantId",
       b."balanceSatang"::text AS "balanceSatang", COALESCE(e.s, 0)::text AS "ledgerSatang",
       b."lastSeq" AS "lastSeq", COALESCE(e.mx, 0) AS "maxSeq", COALESCE(e.n, 0) AS "entries",
       CASE WHEN b."agentAccountId" IS NULL THEN 'B1_NO_BALANCE_ROW'
            WHEN b."balanceSatang" <> COALESCE(e.s, 0) THEN 'B2_BALANCE_NE_SUM'
            ELSE 'B3_SEQ' END AS "rule"
  FROM "AgentBalance" b
  FULL OUTER JOIN (SELECT "agentAccountId", min("tenantId") AS "tenantId", sum("amountSatang")::bigint AS s, max("seq") AS mx, count(*)::int AS n
                     FROM "AgentLedgerEntry" GROUP BY "agentAccountId") e ON e."agentAccountId" = b."agentAccountId"
 WHERE ($1::text[] IS NULL OR COALESCE(b."tenantId", e."tenantId") = ANY($1::text[]))
   AND (b."agentAccountId" IS NULL
        OR b."balanceSatang" <> COALESCE(e.s, 0)
        OR b."lastSeq" <> COALESCE(e.mx, 0)
        OR COALESCE(e.n, 0) <> COALESCE(e.mx, 0))`;

/** $1 = tenantIds text[] | null */
export const AGENCY_STATEMENT_DRIFT_SQL = `
SELECT s."id", s."tenantId", s."agentAccountId", s."status",
       s."totalSatang"::text AS "totalSatang", s."openingSatang"::text AS "openingSatang", COALESCE(e.t, 0)::text AS "entriesSatang"
  FROM "AgentStatement" s
  LEFT JOIN (SELECT "statementId", sum("amountSatang")::bigint AS t FROM "AgentLedgerEntry" WHERE "statementId" IS NOT NULL GROUP BY "statementId") e
         ON e."statementId" = s."id"
 WHERE s."status" <> 'VOID'
   AND ($1::text[] IS NULL OR s."tenantId" = ANY($1::text[]))
   AND s."totalSatang" <> s."openingSatang" + COALESCE(e.t, 0)`;

export async function agencyBalanceDrift(q: QueryFn, tenantIds: string[] | null = null): Promise<Record<string, unknown>[]> {
  return (await q(AGENCY_BALANCE_DRIFT_SQL, [tenantIds])).rows;
}
export async function agencyStatementDrift(q: QueryFn, tenantIds: string[] | null = null): Promise<Record<string, unknown>[]> {
  return (await q(AGENCY_STATEMENT_DRIFT_SQL, [tenantIds])).rows;
}
