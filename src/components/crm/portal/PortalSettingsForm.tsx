"use client";

// PortalSettingsForm.tsx — ฟอร์มตั้งค่าพอร์ทัลลูกค้าองค์กร (ใบ C3.5 · `settings.crm.portal`)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ค่าเริ่มต้น + รายการบอร์ด + action มาทาง props
// 🔴 ข้อผิดพลาดแสดงใต้ปุ่ม (inline) · "แสดงจำนวนดีล" ปิดเป็นค่าเริ่มต้น (ลูกค้าไม่เห็นข้อมูลการขายภายใน)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
type Settings = { enabled: boolean; loginMethods: string[]; showDeals: boolean; allowIssue: boolean; issueBoardId: string | null };

const muted = { fontSize: 12, color: "var(--color-muted)" } as const;

export function PortalSettingsForm(props: {
  systemId: string;
  portalUrl: string;
  initial: Settings;
  boards: { id: string; name: string }[];
  save: (systemId: string, input: Settings) => Promise<R<Record<never, never>>>;
}) {
  const router = useRouter();
  const [v, setV] = useState<Settings>(props.initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const toggleMethod = (m: string, on: boolean) => setV({ ...v, loginMethods: on ? [...new Set([...v.loginMethods, m])] : v.loginMethods.filter((x) => x !== m) });
  return (
    <section className="card flex flex-col gap-4 p-4" data-testid="crm-portal-settings">
      <label className="flex items-center gap-2 text-sm">
        <input data-testid="crm-portal-settings-enabled" type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
        เปิดพอร์ทัลลูกค้าองค์กร
      </label>
      <p className="break-all" style={muted}>
        ที่อยู่พอร์ทัล: {props.portalUrl}
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">วิธีเข้าสู่ระบบ</span>
        <label className="flex items-center gap-2 text-sm">
          <input data-testid="crm-portal-settings-email" type="checkbox" checked={v.loginMethods.includes("EMAIL_OTP")} onChange={(e) => toggleMethod("EMAIL_OTP", e.target.checked)} /> อีเมล + รหัส OTP
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input data-testid="crm-portal-settings-line" type="checkbox" checked={v.loginMethods.includes("LINE")} onChange={(e) => toggleMethod("LINE", e.target.checked)} /> LINE
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input data-testid="crm-portal-settings-issue" type="checkbox" checked={v.allowIssue} onChange={(e) => setV({ ...v, allowIssue: e.target.checked })} />
        ให้ลูกค้าแจ้งเรื่อง/ขอเอกสารผ่านพอร์ทัล
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">บอร์ดงานรับเรื่องจากพอร์ทัล</span>
        <select data-testid="crm-portal-settings-board" className="input" value={v.issueBoardId ?? ""} onChange={(e) => setV({ ...v, issueBoardId: e.target.value || null })}>
          <option value="">ไม่เปิดการ์ด (เก็บเป็นคำขอในหน้าบริษัท)</option>
          {props.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span style={muted}>เรื่องใหม่จะเป็นการ์ดในคอลัมน์แรก — ลูกค้าเห็นสถานะ เปิด · กำลังทำ · เสร็จ ตามคอลัมน์ของการ์ด</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input data-testid="crm-portal-settings-deals" type="checkbox" checked={v.showDeals} onChange={(e) => setV({ ...v, showDeals: e.target.checked })} />
        แสดงจำนวน “ดีลที่กำลังคุย” ในหน้าแรกของลูกค้า (จำนวนเท่านั้น)
      </label>
      <button
        type="button"
        data-testid="crm-portal-settings-save"
        className="btn btn-primary self-start"
        disabled={pending}
        onClick={() => {
          setError("");
          setDone("");
          start(async () => {
            const r = await props.save(props.systemId, v);
            if (!r.ok) return setError(r.error);
            setDone("บันทึกแล้ว");
            router.refresh();
          });
        }}
      >
        บันทึก
      </button>
      {done ? <p role="status" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{done}</p> : null}
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>{error}</p> : null}
    </section>
  );
}
