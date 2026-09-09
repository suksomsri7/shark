// AutomationSuggestions.tsx — แผง "คำแนะนำจาก AI" ในหน้าอัตโนมัติ (K3.6 · ภาพ `ledger/design-kanban/08-automation.png` ฝั่งขวา)
//
// 🔴 กติกา
//  1) แผงนี้ **ไม่ยิงอะไรเลย** — ข้อเสนอถูกคำนวณฝั่ง server (`automation-suggest.suggestRules`)
//     แล้วส่งลงมาเป็น props · ปุ่ม "สร้าง" แค่โยนร่างกฎกลับขึ้นไปให้ `AutomationBuilder` เติมในฟอร์ม
//     ⇒ ยังไม่มีแถว `AutomationRule` จนกว่าผู้ใช้จะกด "บันทึกกฎ" เอง (§8.3 ของพิมพ์เขียว: AI เสนอ คนตัดสิน)
//  2) client component — ห้าม import `automation-suggest.ts` (แตะ prisma) · รูปข้อมูลประกาศไว้ที่นี่
//  3) ห้ามอีโมจิ — ไอคอนจาก <KanbanIcon>
"use client";

import { KanbanIcon } from "./KanbanIcon";

/** ร่างกฎที่มาจากคำแนะนำ — รูปเดียวกับ `KanbanRuleInput` ของ K2.9 แต่ประกาศแบบ structural (ไม่ import ข้ามชั้น) */
export type SuggestedRule = {
  boardId: string;
  name: string;
  kind: string;
  event?: string;
  scheduleCron?: string;
  dueOffsetDays?: number;
  conditions?: unknown;
  actions?: unknown;
};

export type AutomationSuggestionRow = {
  id: string;
  pattern: string;
  /** พาดหัวไทย (อ้างตัวเลขจริงที่นับได้จากประวัติของบอร์ด) */
  title: string;
  reason: string;
  count: number;
  rule: SuggestedRule;
};

export function AutomationSuggestions({
  items,
  onCreate,
}: {
  items: AutomationSuggestionRow[];
  onCreate: (s: AutomationSuggestionRow) => void;
}) {
  return (
    <section
      data-testid="automation-suggestions"
      className="flex flex-col rounded-xl"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", padding: 14, gap: 10 }}
    >
      <div id="ai-suggestions" className="flex items-center" style={{ gap: 8 }}>
        <KanbanIcon name="spark" size="sm" />
        <strong style={{ fontSize: 13.5 }}>คำแนะนำจาก AI</strong>
      </div>

      {items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
          ยังไม่พบพฤติกรรมซ้ำพอจะแนะนำ — ใช้บอร์ดต่อไปอีกสักพัก แล้วระบบจะดูจากประวัติจริงให้เอง
        </p>
      ) : (
        <ul className="flex flex-col" style={{ gap: 10 }}>
          {items.map((s) => (
            <li
              key={s.id}
              data-testid="suggestion-row"
              className="flex items-start"
              style={{ gap: 10, borderTop: "1px solid var(--color-line)", paddingTop: 10 }}
            >
              <span className="min-w-0 flex-1">
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>{s.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--color-muted)", lineHeight: 1.5 }}>{s.reason}</span>
              </span>
              <button
                type="button"
                data-testid="suggestion-create"
                aria-label={`สร้างกฎจากคำแนะนำ: ${s.title}`}
                onClick={() => onCreate(s)}
                className="inline-flex flex-none items-center justify-center rounded-lg"
                style={{
                  height: 28,
                  padding: "0 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "1px solid var(--color-line)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink)",
                }}
              >
                สร้าง
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default AutomationSuggestions;
