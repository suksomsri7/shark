// IntegrationsSettings.tsx — บล็อก "การเชื่อมต่อ" ในหน้าตั้งค่าบอร์ดงาน (K3.2 → 6 สวิตช์ใน K3.3 → ครบ 7 ใน K3.9)
// ⚠️ ห้ามอีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
//
// 🔴 หน้านี้คือที่เดียวที่เจ้าของร้าน "ยอมให้ระบบอื่นเขียนการ์ดลงบอร์ด" ⇒ คำอธิบายต้องเป็นภาษาคน
//    บอกตรง ๆ ว่าเปิดแล้วจะเกิดอะไร ไม่ใช่ชื่อฟีเจอร์ล้วน (เจ้าของร้านไม่ได้อ่านพิมพ์เขียว)
// 🔴 ทุกตัวปิดไว้ก่อนเสมอ (ค่าปริยายใน `integrations.ts`) — เปิดแล้วการ์ดจะงอกเองโดยไม่มีใครกด
//    ⇒ ต้องเป็นการตัดสินใจของเจ้าของร้าน ไม่ใช่ค่าที่ติดมากับระบบ (มติ D6)
// 🔴 K3.9 "การ์ดจากอีเมล" เปิดใช้จริงแล้ว — ต่างจากตัวอื่นตรงที่ **ไม่มีบอร์ดปลายทางให้เลือกตรงนี้**
//    เพราะปลายทางถูกตัดสินจากที่อยู่ที่อีเมลถูกส่งไป (`งาน+{key}@`) ซึ่งเป็นของแต่ละบอร์ด
//    ⇒ เลือกบอร์ดซ้ำอีกที่จะกลายเป็นค่าที่ขัดกันเอง (คนตั้งไว้บอร์ด ก. แต่ส่งอีเมลเข้าที่อยู่ของบอร์ด ข.)
"use client";

import { useState, useTransition } from "react";
import { KanbanIcon } from "./KanbanIcon";
import type { IntegrationBoardOption, IntegrationKey, IntegrationsPatch, KanbanIntegrations } from "@/lib/modules/kanban/integrations";
import { setIntegrationsAction } from "@/lib/modules/kanban/actions";

/** รูปที่หน้าจอต้องวาดต่อ 1 สวิตช์ (ค่าอ่านจาก `cfg[key]` ซึ่งมีคีย์ไม่เท่ากันในแต่ละตัว) */
type RowSpec = {
  key: IntegrationKey;
  title: string;
  desc: string;
  /** เลือกบอร์ดปลายทางได้ไหม (ตัวที่ไม่มี = ทำกับการ์ดที่ผูกไว้อยู่แล้ว ไม่ต้องเลือกบอร์ด) */
  board: boolean;
  /** เลือกคอลัมน์ปลายทางได้ไหม (ไม่เลือก = คอลัมน์แรกของบอร์ด) */
  column?: boolean;
  /** ช่องตัวเลขเพิ่ม 1 ช่อง */
  number?: { field: "unassignedMinutes" | "minSatang"; label: string; hint: string; min: number; max: number };
  /** ข้อความอธิบายเพิ่มเมื่อสวิตช์นี้ไม่มีบอร์ดให้เลือก */
  note?: string;
};

const ROWS: RowSpec[] = [
  {
    key: "openTaskFromChat",
    title: "สร้างงานจากแชท",
    desc: 'เพิ่มปุ่ม "สร้างงาน" ในหัวห้องแชทลูกค้า — ทีมกดแล้วได้การ์ดที่ผูกกลับไปที่บทสนทนา ผู้ติดต่อ และไฟล์แนบให้เอง · ถ้าตั้ง "นาทีที่ค้าง" ไว้ด้วย ระบบจะเปิดการ์ดให้เองเมื่อลูกค้าทักแล้วไม่มีใครรับเกินเวลานั้น',
    board: true,
    column: true,
    number: { field: "unassignedMinutes", label: "นาทีที่ค้าง", hint: "ลูกค้าทักแล้วไม่มีใครรับเกินกี่นาที จึงเปิดการ์ดให้ (ว่าง = ไม่เปิดให้เอง)", min: 1, max: 10_080 },
  },
  {
    key: "cardFromForm",
    title: "การ์ดจากฟอร์ม",
    desc: "มีคนส่งฟอร์มเข้ามา → เปิดการ์ดให้ทีมตามเรื่องทันที พร้อมคำตอบทุกข้อในรายละเอียดการ์ด",
    board: true,
    column: true,
  },
  {
    key: "cardFromApproval",
    title: "การ์ดติดตามคำขออนุมัติ",
    desc: "มีคำขออนุมัติใหม่ → เปิดการ์ดให้คนที่ยื่นไว้ตามเรื่อง · อนุมัติ/ปฏิเสธแล้วระบบจะบอกผลในการ์ดและปิดงานให้",
    board: true,
  },
  {
    key: "closeCardOnDocApproved",
    title: "ปิดการ์ดเมื่อเอกสารบัญชีอนุมัติ/จ่ายแล้ว",
    desc: "การ์ดที่ผูกเอกสารบัญชีไว้ พออนุมัติหรือจ่ายครบ ระบบย้ายเข้าคอลัมน์เสร็จให้เอง พร้อมบันทึกเหตุผลไว้ในการ์ด",
    board: false,
    note: "ใช้กับการ์ดที่ผูกเอกสารไว้แล้วในทุกบอร์ด — ไม่ต้องเลือกบอร์ดปลายทาง",
  },
  {
    key: "cardOnLeave",
    title: "การ์ดหาคนแทนเมื่อมีใบลา",
    desc: "พนักงานยื่นใบลา → เปิดการ์ดให้หัวหน้าสาขาจัดคนแทน กำหนดส่ง 09:00 ของวันก่อนเริ่มลา",
    board: true,
  },
  {
    key: "cardFromEmail",
    title: "การ์ดจากอีเมล",
    desc: "ส่งอีเมลเข้าที่อยู่ของบอร์ด → กลายเป็นการ์ดพร้อมไฟล์แนบ (หัวข้อ = ชื่อการ์ด · เนื้อหา = รายละเอียด) · ผู้ส่งที่เป็นพนักงานในร้านจะถูกตั้งเป็นผู้รับผิดชอบให้เอง",
    board: false,
    note: "ที่อยู่อีเมลเป็นของ \"แต่ละบอร์ด\" — เปิด/คัดลอกได้ที่ ตั้งค่าบอร์ด › ทั่วไป › อีเมลเข้าบอร์ด (จึงไม่ต้องเลือกบอร์ดปลายทางตรงนี้)",
  },
  {
    key: "cardOnVoidedSale",
    title: "การ์ดตรวจสอบบิลยกเลิก",
    desc: "มีบิลถูกยกเลิกตั้งแต่ยอดที่ตั้งไว้ขึ้นไป → เปิดการ์ดให้ตรวจสอบย้อนหลัง (บิลยอดน้อยไม่ต้องเปิด จะได้ไม่ท่วมบอร์ด)",
    board: true,
    number: { field: "minSatang", label: "ยอดขั้นต่ำ (บาท)", hint: "บิลที่ยอดต่ำกว่านี้ไม่ต้องเปิดการ์ด (ว่าง = ทุกบิล)", min: 0, max: 10_000_000 },
  },
];

/** ค่าที่หน้าจอต้องใช้ต่อ 1 สวิตช์ — คีย์ที่สวิตช์นั้นไม่มี จะเป็น undefined (รูปรวมของทั้ง 6 ตัว) */
type RowValue = {
  enabled: boolean;
  boardId?: string | null;
  columnId?: string | null;
  unassignedMinutes?: number | null;
  minSatang?: number | null;
};

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

  const save = (key: IntegrationKey, patch: Record<string, unknown>) => {
    setErr(null);
    setMsg(null);
    startSaving(async () => {
      const res = await setIntegrationsAction({ systemId, patch: { [key]: patch } as IntegrationsPatch });
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

      {boards.length === 0 && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
          ยังไม่มีบอร์ดที่คุณเป็นผู้ดูแล — สร้างบอร์ดก่อนจึงจะตั้งปลายทางได้
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {ROWS.map((row) => {
          const value: RowValue = cfg[row.key];
          const board = boards.find((b) => b.id === value.boardId) ?? boards[0];
          const needsBoard = row.board && boards.length === 0;
          const num = row.number;
          const numberValue = row.number
            ? row.number.field === "minSatang"
              ? value.minSatang === null || value.minSatang === undefined
                ? ""
                : String(Math.round(value.minSatang / 100))
              : value.unassignedMinutes === null || value.unassignedMinutes === undefined
                ? ""
                : String(value.unassignedMinutes)
            : "";

          return (
            <div key={row.key} data-testid={`kanban-integration-${row.key}`} className="rounded-xl border border-[color:var(--color-line)] p-3">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  data-testid={`kanban-integration-toggle-${row.key}`}
                  checked={value.enabled}
                  disabled={!canManage || saving || needsBoard}
                  onChange={(e) =>
                    save(
                      row.key,
                      e.target.checked
                        ? row.board
                          ? { enabled: true, boardId: value.boardId ?? board?.id ?? null, ...(row.column ? { columnId: value.columnId ?? null } : {}) }
                          : { enabled: true }
                        : { enabled: false },
                    )
                  }
                  className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{row.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-[1.55] text-[color:var(--color-muted)]">{row.desc}</span>
                </span>
              </label>

              {row.note && <p className="mt-2 text-[12px] text-[color:var(--color-muted)]">{row.note}</p>}

              {(row.board || row.number) && boards.length > 0 && (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {row.board && (
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12px] font-semibold text-[#3f4652]">บอร์ดปลายทาง</span>
                      <select
                        data-testid={`kanban-integration-board-${row.key}`}
                        value={value.boardId ?? ""}
                        disabled={!canManage || saving}
                        onChange={(e) => {
                          const next = boards.find((b) => b.id === e.target.value);
                          save(row.key, { boardId: e.target.value || null, ...(row.column ? { columnId: next?.columns[0]?.id ?? null } : {}) });
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
                  )}
                  {row.column && (
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12px] font-semibold text-[#3f4652]">คอลัมน์ปลายทาง</span>
                      <select
                        data-testid={`kanban-integration-column-${row.key}`}
                        value={value.columnId ?? ""}
                        disabled={!canManage || saving || !board}
                        onChange={(e) => save(row.key, { boardId: value.boardId ?? board?.id ?? null, columnId: e.target.value || null })}
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
                  )}
                  {num && (
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12px] font-semibold text-[#3f4652]">{num.label}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        data-testid={`kanban-integration-number-${row.key}`}
                        defaultValue={numberValue}
                        min={num.min}
                        max={num.max}
                        disabled={!canManage || saving}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === "") {
                            save(row.key, { [num.field]: null });
                            return;
                          }
                          const n = Math.trunc(Number(raw));
                          if (!Number.isFinite(n) || n < num.min || n > num.max) return;
                          // ผู้ใช้กรอกเป็น "บาท" — ที่เก็บเป็นสตางค์ (เลขเดียวกันคนละหน่วย = ที่มาของบั๊กราคา)
                          save(row.key, { [num.field]: num.field === "minSatang" ? n * 100 : n });
                        }}
                        className="input h-9 py-0 text-[13px]"
                      />
                      <span className="text-[11.5px] leading-[1.5] text-[color:var(--color-muted)]">{num.hint}</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!canManage && (
        <p className="text-[12px] text-[color:var(--color-muted)]">
          ต้องเป็นเจ้าของร้าน หรือมีสิทธิ์ตั้งกฎอัตโนมัติของบอร์ด จึงจะแก้ค่าเหล่านี้ได้
        </p>
      )}
      {err && <p className="rounded-lg bg-[#fdeceb] px-3 py-2 text-[12.5px] text-[#b42318]">{err}</p>}
      {msg && <p className="text-[12px] font-semibold text-[color:var(--color-accent)]">{msg}</p>}

      <p className="text-[11.5px] text-[color:var(--color-muted)]">
        ปิดสวิตช์แล้วมีผลทันทีสำหรับทุกคนในร้าน — การ์ดที่เกิดไปแล้วยังอยู่ที่เดิม (ระบบไม่ลบงานที่ทีมกำลังทำอยู่)
      </p>
    </section>
  );
}

export default IntegrationsSettings;
