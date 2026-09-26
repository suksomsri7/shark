"use client";

// TargetsForm.tsx — "ระบบปลายทางเมื่อมีหลายระบบ" (ใบ C3.6 · ภาพ 17 ซ้ายล่าง · `settings.crm.targets`)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ตัวเลือก + ค่าปัจจุบัน + action มาทาง props
// 🔴 "อัตโนมัติ" = ไม่เลือก (ระบบใช้ระบบที่ผูกสาขาเดียวกัน → ระบบเดียวของร้าน) — บอกชื่อระบบที่ใช้อยู่จริงใต้ช่อง
// 🔴 ส่งเฉพาะชนิดที่เปลี่ยน · ข้อผิดพลาดแสดงใต้ปุ่ม (inline) · ระบบที่ปิดอยู่เลือกไม่ได้ (บริการปฏิเสธซ้ำอีกชั้น)
// 🔴 มติผู้ตรวจ C3.6 S4: ค่าที่เลือกไว้แต่ระบบนั้นปิด/ถูกลบ/เลิกเชื่อม = เตือน + โชว์เป็นตัวเลือกที่กดไม่ได้ + "ใช้อยู่" ตามตัวตัดสินจริง ·
//    กลับเป็น "อัตโนมัติ" ได้เสมอ · S6: ไม่ได้เลือกและมีหลายระบบ = สะพานที่ต้องเขียนข้อมูล **ข้าม** (เหตุการณ์นั้นไม่ถูกส่งต่อ) ไม่ใช่รอ
import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";

type Kind = "member" | "account" | "kanban" | "chat" | "inventory";
type Key = "memberSystemId" | "accountSystemId" | "kanbanSystemId" | "chatSystemId" | "inventorySystemId";
const KEY_OF: Record<Kind, Key> = { member: "memberSystemId", account: "accountSystemId", kanban: "kanbanSystemId", chat: "chatSystemId", inventory: "inventorySystemId" };
const VIA_LABEL: Record<string, string> = { link: "ผูกสาขาเดียวกับ CRM", only: "ระบบเดียวของร้าน" };

export type TargetRow = {
  kind: Kind;
  label: string;
  stored: string | null;
  /** ค่าที่เลือกไว้ใช้ไม่ได้แล้ว (ปิด/ถูกลบ/เลิกเชื่อม) */
  stale: boolean;
  autoName: string | null;
  autoVia: "target" | "link" | "only" | null;
  /** ข้อความแทน "ใช้อยู่" (เช่น บัญชีที่ยังไม่ได้เชื่อมกับ CRM นี้) */
  note: string | null;
  candidates: { id: string; name: string; active: boolean }[];
};
type SaveResult = { ok: true } | { ok: false; error: string; code?: string };

export function TargetsForm(props: { systemId: string; rows: TargetRow[]; save: (systemId: string, patch: Partial<Record<Key, string | null>>) => Promise<SaveResult> }) {
  const router = useRouter();
  const initial = Object.fromEntries(props.rows.map((r) => [r.kind, r.stored ?? ""])) as Record<Kind, string>;
  const [v, setV] = useState<Record<Kind, string>>(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const changed = props.rows.filter((r) => (v[r.kind] ?? "") !== (r.stored ?? ""));
  const single = props.rows.every((r) => r.candidates.filter((c) => c.active).length <= 1);

  const submit = () => {
    setError("");
    setDone("");
    if (changed.length === 0) {
      setDone("ไม่มีอะไรเปลี่ยน");
      return;
    }
    const patch: Partial<Record<Key, string | null>> = {};
    for (const r of changed) patch[KEY_OF[r.kind]] = v[r.kind] || null;
    start(async () => {
      const res = await props.save(props.systemId, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone("บันทึกแล้ว — สะพานทุกตัวใช้ระบบปลายทางนี้ตั้งแต่เหตุการณ์ถัดไป");
      router.refresh();
    });
  };

  const rowOf = (kind: Kind) => props.rows.find((r) => r.kind === kind);
  const selectProps = (kind: Kind) => {
    const r = rowOf(kind);
    return {
      className: "input w-full",
      value: v[kind] ?? "",
      disabled: pending,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setV({ ...v, [kind]: e.target.value }),
      children: [
        <option key="" value="">
          {!r || r.candidates.length === 0 ? "ร้านยังไม่มีระบบชนิดนี้" : "อัตโนมัติ"}
        </option>,
        ...(r?.candidates ?? []).map((c) => (
          <option key={c.id} value={c.id} disabled={!c.active}>
            {c.active ? c.name : kind === "account" ? `${c.name} (ยังไม่ได้เชื่อม/ปิดอยู่)` : `${c.name} (ปิดอยู่)`}
          </option>
        )),
        // ค่าที่เลือกไว้แต่ระบบถูกลบไปแล้ว (ไม่อยู่ในรายการ) — โชว์ให้เห็นว่าค้างอยู่ แต่เลือกซ้ำไม่ได้
        ...(r?.stored && !r.candidates.some((c) => c.id === r.stored)
          ? [
              <option key={`stale-${r.stored}`} value={r.stored} disabled>
                ระบบที่เลือกไว้ถูกลบแล้ว
              </option>,
            ]
          : []),
      ],
    };
  };
  const field = (kind: Kind, control: React.ReactNode) => {
    const r = rowOf(kind);
    if (!r) return null;
    return (
      <label key={kind} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-sm">{r.label}</span>
        <span className="flex min-w-0 flex-col gap-0.5 sm:w-64">
          {control}
          {r.stale && v[kind] === (r.stored ?? "") ? (
            <span className="text-xs text-[color:var(--color-danger)]">ระบบที่เลือกปิดอยู่/ถูกลบ/เลิกเชื่อมแล้ว — เลือกใหม่หรือกลับเป็น &quot;อัตโนมัติ&quot;</span>
          ) : null}
          {!v[kind] || (r.stale && v[kind] === (r.stored ?? "")) ? (
            <span className="truncate text-xs text-[color:var(--color-muted)]">
              {r.note
                ? r.note
                : r.autoName
                ? `ใช้อยู่: ${r.autoName}${r.autoVia === "link" && kind === "account" ? " (สมุดที่เชื่อมกับ CRM นี้)" : r.autoVia && VIA_LABEL[r.autoVia] ? ` (${VIA_LABEL[r.autoVia]})` : ""}`
                : r.candidates.length > 1
                  ? "ยังไม่ได้เลือก — ระหว่างนี้สะพานที่ต้องเขียนข้อมูลเข้าระบบชนิดนี้จะข้ามเหตุการณ์ไป (ไม่ส่งต่อ)"
                  : ""}
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <h2 className="text-sm font-semibold">ระบบปลายทางเมื่อมีหลายระบบ</h2>
      <div className="flex flex-col divide-y divide-[color:var(--color-line)]">
        {/* testid ตรงตัวต่อชนิด (ทะเบียนปุ่ม F14 + ภาพ 17) — ห้ามเปลี่ยนเป็นชื่อจากตัวแปร */}
        {field("member", <select data-testid="crm-integrations-target-member" {...selectProps("member")} />)}
        {field("account", <select data-testid="crm-integrations-target-account" {...selectProps("account")} />)}
        {field("kanban", <select data-testid="crm-integrations-target-kanban" {...selectProps("kanban")} />)}
        {field("chat", <select data-testid="crm-integrations-target-chat" {...selectProps("chat")} />)}
        {field("inventory", <select data-testid="crm-integrations-target-inventory" {...selectProps("inventory")} />)}
      </div>
      {single ? <p className="text-xs text-[color:var(--color-muted)]">ร้านนี้มีระบบเดียวต่อชนิด — เลือกไว้ล่วงหน้าเพื่อเปิดระบบที่ 2 (เช่น สาขาแยก)</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="crm-integrations-targets-save" className="btn btn-primary min-h-[40px] text-sm" disabled={pending} onClick={submit}>
          {pending ? "กำลังบันทึก…" : "บันทึกระบบปลายทาง"}
        </button>
        {error ? (
          <p data-testid="crm-integrations-targets-msg" role="alert" className="text-xs text-[color:var(--color-danger)]">
            {error}
          </p>
        ) : done ? (
          <p data-testid="crm-integrations-targets-msg" className="text-xs text-[color:var(--color-muted)]">
            {done}
          </p>
        ) : null}
      </div>
    </section>
  );
}
