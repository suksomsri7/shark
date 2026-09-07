// IntegrationsSettings.tsx — บล็อก "การเชื่อมต่อ" ในหน้าตั้งค่าบอร์ดงาน (K3.2)
// ⚠️ ห้ามอีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
//
// 🔴 หน้านี้คือที่เดียวที่เจ้าของร้าน "ยอมให้ระบบอื่นเขียนการ์ดลงบอร์ด" ⇒ คำอธิบายต้องเป็นภาษาคน
//    บอกตรง ๆ ว่าเปิดแล้วจะเกิดอะไร ไม่ใช่ชื่อฟีเจอร์ล้วน (เจ้าของร้านไม่ได้อ่านพิมพ์เขียว)
// 🔴 สวิตช์อื่นนอกจาก "สร้างงานจากแชท" ยัง "เร็ว ๆ นี้" จนกว่า K3.3 จะต่อสะพานให้ —
//    แสดงไว้เพื่อให้เห็นภาพรวมว่าระบบจะทำอะไรได้บ้าง แต่กดเปิดไม่ได้ (ปุ่มที่เปิดแล้วไม่เกิดอะไร = โกหก)
"use client";

import { useState, useTransition } from "react";
import { KanbanIcon } from "./KanbanIcon";
import type { IntegrationBoardOption, KanbanIntegrations } from "@/lib/modules/kanban/integrations";
import { setIntegrationsAction } from "@/lib/modules/kanban/actions";

/** สวิตช์ที่ยังไม่มีสะพานจริง (K3.3) — ชื่อ + คำอธิบายภาษาคน เรียงตามสัญญา §K3.2/§K3.3 */
const SOON: { key: string; title: string; desc: string }[] = [
  { key: "cardFromForm", title: "การ์ดจากฟอร์ม", desc: "มีคนส่งฟอร์มเข้ามา → เปิดการ์ดให้ทีมตามเรื่องทันที" },
  { key: "cardFromApproval", title: "การ์ดติดตามคำขออนุมัติ", desc: "มีคำขออนุมัติค้าง → เปิดการ์ดเตือนคนที่ต้องตัดสินใจ" },
  { key: "closeCardOnDocApproved", title: "ปิดการ์ดเมื่อเอกสารบัญชีอนุมัติ/จ่ายแล้ว", desc: "เอกสารที่ผูกกับการ์ดถูกอนุมัติหรือจ่ายครบ → ปิดการ์ดให้เอง" },
  { key: "cardOnLeave", title: "การ์ดหาคนแทนเมื่อมีใบลา", desc: "พนักงานยื่นใบลา → เปิดการ์ดให้หัวหน้าจัดคนแทนในวันนั้น" },
  { key: "cardOnVoidedSale", title: "การ์ดตรวจสอบบิลยกเลิก", desc: "มีบิลถูกยกเลิกเกินยอดที่ตั้งไว้ → เปิดการ์ดให้ตรวจสอบย้อนหลัง" },
  { key: "cardFromEmail", title: "การ์ดจากอีเมลที่ส่งเข้าบอร์ด", desc: "ส่งอีเมลเข้าที่อยู่ของบอร์ด → กลายเป็นการ์ดพร้อมไฟล์แนบ" },
];

export function IntegrationsSettings({
  systemId,
  initial,
  boards,
  canManage,
}: {
  systemId: string;
  initial: KanbanIntegrations;
  /** บอร์ดที่ "คนกำลังดู" เป็นผู้ดูแล (ADMIN) — ตั้งบอร์ดปลายทางได้เฉพาะบอร์ดของตัวเอง */
  boards: IntegrationBoardOption[];
  canManage: boolean;
}) {
  const [cfg, setCfg] = useState<KanbanIntegrations>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const chat = cfg.openTaskFromChat;
  const board = boards.find((b) => b.id === chat.boardId) ?? boards[0];

  const save = (patch: { enabled?: boolean; boardId?: string | null; columnId?: string | null }) => {
    setErr(null);
    setMsg(null);
    startSaving(async () => {
      const res = await setIntegrationsAction({ systemId, patch: { openTaskFromChat: patch } });
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      setCfg(res.integrations);
      setMsg("บันทึกแล้ว");
    });
  };

  return (
    <section data-testid="kanban-integrations" className="card flex flex-col gap-4 p-4">
      <div className="flex items-start gap-2">
        <KanbanIcon name="link" className="mt-0.5 text-[color:var(--color-muted)]" />
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">การเชื่อมต่อ</h2>
          <p className="mt-0.5 text-[12.5px] leading-[1.55] text-[color:var(--color-muted)]">
            ให้ระบบอื่นของร้านเปิดการ์ดในบอร์ดงานให้อัตโนมัติ · ทุกตัวปิดไว้ก่อนเสมอ เปิดเมื่อคุณต้องการเท่านั้น
          </p>
        </div>
      </div>

      {/* ── สวิตช์ที่ใช้งานได้จริงแล้ว: สร้างงานจากแชท ── */}
      <div className="rounded-xl border border-[color:var(--color-line)] p-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            data-testid="kanban-integration-chat-toggle"
            checked={chat.enabled}
            disabled={!canManage || saving || boards.length === 0}
            onChange={(e) =>
              save(
                e.target.checked
                  ? { enabled: true, boardId: chat.boardId ?? board?.id ?? null, columnId: chat.columnId ?? board?.columns[0]?.id ?? null }
                  : { enabled: false },
              )
            }
            className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold">สร้างงานจากแชท</span>
            <span className="mt-0.5 block text-[12px] leading-[1.55] text-[color:var(--color-muted)]">
              เพิ่มปุ่ม &quot;สร้างงาน&quot; ในหัวห้องแชทลูกค้า — ทีมกดแล้วได้การ์ดที่ผูกกลับไปที่บทสนทนา
              ผู้ติดต่อ และไฟล์แนบให้เอง (ผู้ช่วย AI ช่วยร่างชื่อ/สรุป/กำหนดส่งให้ก่อน แก้ได้ทุกช่อง)
            </span>
          </span>
        </label>

        {boards.length === 0 ? (
          <p className="mt-2.5 text-[12px] text-[color:var(--color-muted)]">
            ยังไม่มีบอร์ดที่คุณเป็นผู้ดูแล — สร้างบอร์ดก่อนจึงจะตั้งปลายทางได้
          </p>
        ) : (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">บอร์ดปลายทาง</span>
              <select
                data-testid="kanban-integration-chat-board"
                value={chat.boardId ?? ""}
                disabled={!canManage || saving}
                onChange={(e) => {
                  const next = boards.find((b) => b.id === e.target.value);
                  save({ boardId: e.target.value, columnId: next?.columns[0]?.id ?? null });
                }}
                className="input h-9 py-0 text-[13px]"
              >
                <option value="">ยังไม่เลือก</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#3f4652]">คอลัมน์ปลายทาง</span>
              <select
                data-testid="kanban-integration-chat-column"
                value={chat.columnId ?? ""}
                disabled={!canManage || saving || !board}
                onChange={(e) => save({ boardId: chat.boardId ?? board?.id ?? null, columnId: e.target.value || null })}
                className="input h-9 py-0 text-[13px]"
              >
                <option value="">คอลัมน์แรกของบอร์ด</option>
                {(board?.columns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {chat.enabled && (
          <p className="mt-2.5 text-[12px] text-[color:var(--color-muted)]">
            เปิดอยู่ — ทีมจะเห็นปุ่มในหัวห้องแชททุกห้องที่ตัวเองเข้าถึงได้
          </p>
        )}
      </div>

      {/* ── สวิตช์ที่รอ K3.3 ── */}
      <div className="flex flex-col gap-2">
        {SOON.map((s) => (
          <div
            key={s.key}
            data-testid="kanban-integration-soon"
            className="flex items-start gap-2.5 rounded-xl border border-dashed border-[color:var(--color-line)] p-3 opacity-70"
          >
            <input type="checkbox" checked={false} disabled readOnly className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{s.title}</span>
              <span className="mt-0.5 block text-[12px] leading-[1.5] text-[color:var(--color-muted)]">{s.desc}</span>
            </span>
            <span className="shrink-0 rounded-md bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-muted)]">
              เร็ว ๆ นี้
            </span>
          </div>
        ))}
      </div>

      {!canManage && (
        <p className="text-[12px] text-[color:var(--color-muted)]">
          ต้องเป็นเจ้าของร้าน หรือมีสิทธิ์ตั้งกฎอัตโนมัติของบอร์ด จึงจะแก้ค่าเหล่านี้ได้
        </p>
      )}
      {err && <p className="rounded-lg bg-[#fdeceb] px-3 py-2 text-[12.5px] text-[#b42318]">{err}</p>}
      {msg && <p className="text-[12px] font-semibold text-[color:var(--color-accent)]">{msg}</p>}

      <p className="text-[11.5px] text-[color:var(--color-muted)]">
        ปุ่มจะโผล่ในหัวห้องของกล่องแชทลูกค้า — ปิดสวิตช์แล้วปุ่มหายทันทีสำหรับทุกคนในร้าน
      </p>
    </section>
  );
}

export default IntegrationsSettings;
