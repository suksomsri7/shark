// types.ts — ชนิดข้อมูลของผู้ช่วย AI ในหน้า CRM ฝั่ง client (ใบ C3.4 · ภาพ 14 ซ้าย · 13 ค)
//
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ต้นฉบับอยู่ที่ `src/lib/modules/crm/ai-bridges-shared.ts` (AssistResultView · AtRiskItemView) — server action คืนรูปเดียวกัน
//    ⇒ เปลี่ยนฝั่งบริการแล้วคอมโพเนนต์ที่รับค่าจาก action จะคอมไพล์ไม่ผ่านทันที (ไม่ใช่เพี้ยนเงียบ)

export type CrmAiAtRiskItem = {
  dealId: string;
  title: string;
  companyName: string | null;
  valueSatang: number;
  ownerUserId: string | null;
  teamId: string | null;
  reasons: string[];
  expectedCloseAt: string | null;
};

export type CrmAiResult = {
  kind: string;
  text: string;
  subject?: string;
  body?: string;
  nextStep?: string;
  items?: CrmAiAtRiskItem[];
  proposalId: string | null;
  proposalSummary?: string | null;
  reused?: boolean;
  kbArticleIds?: string[];
};

/** ปุ่มหนึ่งปุ่มของแผงผู้ช่วย (หน้า server เป็นคนเลือกว่าหน้าไหนมีปุ่มอะไร) */
export type CrmAiButton = { kind: string; label: string; testid: string };

/** ป้ายเหตุผลของดีลเสี่ยง — สำเนาของ `AT_RISK_REASON_LABEL` (หน้า server ส่งมาเป็น prop) */
export type CrmAiReasonLabels = Record<string, string>;

export type CrmAiFail = { ok: false; error: string; code?: string };
