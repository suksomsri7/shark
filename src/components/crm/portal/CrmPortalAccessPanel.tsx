"use client";

// CrmPortalAccessPanel.tsx — ส่วนกดได้ของบล็อกพอร์ทัลในบริษัท 360 (ใบ C3.5): เชิญ (ผู้ติดต่อ · สิทธิ์ · วิธีเข้า) · ถอนสิทธิ์ · ตัดสินคำขอ
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ข้อมูลจัดรูปแล้ว + server action มาทาง props
// 🔴 ลิงก์เชิญแสดงครั้งเดียวหลังกดเชิญ (ให้คัดลอกส่งเองเมื่อลูกค้าไม่ได้รับอีเมล) — ไม่ถูกเก็บเป็นข้อความธรรมดาที่ไหน
// 🔴 ข้อผิดพลาดแสดงใต้ปุ่ม (inline) ไม่ใช้กล่องเด้ง · ถอนสิทธิ์ต้องกดยืนยันซ้ำในแถว
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
export type PortalStaffActions = {
  invite: (systemId: string, input: { companyId: string; contactId: string; role: string; loginMethods: string[] }) => Promise<R<{ inviteUrl: string; emailed: boolean }>>;
  revoke: (systemId: string, companyId: string, accessId: string) => Promise<R<{ sessionsRevoked: number }>>;
  decide: (systemId: string, companyId: string, requestId: string, approve: boolean) => Promise<R<{ status: string }>>;
};

const muted = { fontSize: 12, color: "var(--color-muted)" } as const;

export function CrmPortalAccessPanel(props: {
  systemId: string;
  companyId: string;
  contacts: { id: string; name: string }[];
  roles: { value: string; label: string }[];
  rows: { id: string; contactName: string; roleLabel: string; status: string; statusLabel: string; lastLogin: string }[];
  requests: { id: string; title: string; kindLabel: string; contactName: string; progressLabel: string; canDecide: boolean; at: string }[];
  actions: PortalStaffActions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(props.contacts[0]?.id ?? "");
  const [role, setRole] = useState("APPROVE");
  const [email, setEmail] = useState(true);
  const [line, setLine] = useState(true);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {props.rows.length === 0 ? (
        <p style={muted}>ยังไม่มีผู้ติดต่อของบริษัทนี้ที่เข้าพอร์ทัลได้</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm" style={{ borderColor: "var(--color-line)" }}>
          {props.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2" style={{ borderColor: "var(--color-line)" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.contactName}</span>
                <span style={muted}>
                  {r.roleLabel} · {r.statusLabel}
                  {r.lastLogin ? ` · เข้าล่าสุด ${r.lastLogin}` : ""}
                </span>
              </span>
              {r.status !== "REVOKED" &&
                (confirmId === r.id ? (
                  <button
                    type="button"
                    data-testid={`crm-portal-revoke-confirm-${r.id}`}
                    className="btn-sm"
                    style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                    disabled={pending}
                    onClick={() => {
                      setError("");
                      start(async () => {
                        const res = await props.actions.revoke(props.systemId, props.companyId, r.id);
                        setConfirmId("");
                        if (!res.ok) return setError(res.error);
                        router.refresh();
                      });
                    }}
                  >
                    ยืนยันถอนสิทธิ์
                  </button>
                ) : (
                  <button type="button" data-testid={`crm-portal-revoke-${r.id}`} className="btn-sm" disabled={pending} onClick={() => setConfirmId(r.id)}>
                    ถอนสิทธิ์
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      <button type="button" data-testid="crm-portal-invite" className="btn btn-ghost self-start py-1.5 text-sm" disabled={props.contacts.length === 0} onClick={() => setOpen(!open)}>
        + เชิญเข้าพอร์ทัล
      </button>
      {props.contacts.length === 0 && <p style={muted}>เพิ่มผู้ติดต่อเข้าบริษัทก่อน แล้วจึงเชิญเข้าพอร์ทัลได้</p>}
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
          <label className="flex flex-col gap-1">
            <span style={muted}>ผู้ติดต่อ</span>
            <select data-testid="crm-portal-invite-contact" className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {props.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={muted}>สิทธิ์ในพอร์ทัล</span>
            <select data-testid="crm-portal-invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {props.roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input data-testid="crm-portal-invite-email" type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> อีเมล + OTP
            </label>
            <label className="flex items-center gap-1.5">
              <input data-testid="crm-portal-invite-line" type="checkbox" checked={line} onChange={(e) => setLine(e.target.checked)} /> LINE
            </label>
          </div>
          <button
            type="button"
            data-testid="crm-portal-invite-submit"
            className="btn btn-primary w-full"
            disabled={pending || !contactId}
            onClick={() => {
              setError("");
              setLink("");
              setNote("");
              const methods = [...(email ? ["EMAIL_OTP"] : []), ...(line ? ["LINE"] : [])];
              if (methods.length === 0) return setError("เลือกวิธีเข้าสู่ระบบอย่างน้อย 1 วิธี");
              start(async () => {
                const res = await props.actions.invite(props.systemId, { companyId: props.companyId, contactId, role, loginMethods: methods });
                if (!res.ok) return setError(res.error);
                setLink(res.inviteUrl);
                setNote(res.emailed ? "ส่งอีเมลเชิญแล้ว — ลิงก์ใช้ได้ 7 วัน ใช้ได้ครั้งเดียว" : "ผู้ติดต่อนี้ไม่มีอีเมล — คัดลอกลิงก์ด้านล่างส่งให้ลูกค้าเอง (ใช้ได้ 7 วัน ครั้งเดียว)");
                router.refresh();
              });
            }}
          >
            ส่งคำเชิญ
          </button>
          {note ? <p role="status" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{note}</p> : null}
          {link ? <input data-testid="crm-portal-invite-link" className="input text-xs" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /> : null}
        </div>
      )}

      {props.requests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">คำขอจากพอร์ทัลที่รอพิจารณา</span>
          {props.requests.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{q.title}</span>
                <span style={muted}>
                  {q.kindLabel} · {q.contactName} · {q.at} · {q.progressLabel}
                </span>
              </span>
              {q.canDecide && (
                <>
                  <button type="button" data-testid={`crm-portal-request-approve-${q.id}`} className="btn-sm" disabled={pending} onClick={() => start(async () => { const res = await props.actions.decide(props.systemId, props.companyId, q.id, true); if (!res.ok) return setError(res.error); router.refresh(); })}>
                    อนุมัติ
                  </button>
                  <button type="button" data-testid={`crm-portal-request-reject-${q.id}`} className="btn-sm" disabled={pending} onClick={() => start(async () => { const res = await props.actions.decide(props.systemId, props.companyId, q.id, false); if (!res.ok) return setError(res.error); router.refresh(); })}>
                    ไม่อนุมัติ
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>{error}</p> : null}
    </div>
  );
}
