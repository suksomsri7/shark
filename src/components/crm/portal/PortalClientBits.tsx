"use client";

// PortalClientBits.tsx — ปุ่มฝั่งลูกค้าของพอร์ทัล (ใบ C3.5 · ภาพ 12): สลับบริษัท · ออกจากระบบ · ตอบใบเสนอราคา · ชำระ/แนบสลิป ·
//   แจ้งเรื่อง · ขอแก้ข้อมูล · รับคำเชิญ
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ข้อมูลที่จัดรูปแล้ว + server action มาทาง props เท่านั้น
// 🔴 ข้อผิดพลาดแสดงใต้ปุ่ม (role=alert) ไม่ใช่กล่องเด้ง · ข้อความมาจากบริการ (ไทย ไม่โทษผู้ใช้)
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
const errStyle = { fontSize: 12.5, color: "var(--color-danger)" } as const;
const muted = { fontSize: 12, color: "var(--color-muted)" } as const;

function Err({ msg }: { msg: string }) {
  return msg ? <p role="alert" style={errStyle}>{msg}</p> : null;
}

export function PortalCompanySwitcher(props: {
  slug: string;
  current: string;
  companies: { id: string; name: string }[];
  action: (slug: string, companyId: string) => Promise<R<{ next: string }>>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (props.companies.length < 2) return null;
  return (
    <div className="flex min-w-0 flex-col">
      <select
        data-testid="portal-company-switcher"
        aria-label="สลับบริษัท"
        className="min-w-0 max-w-[180px] truncate rounded-lg border bg-transparent px-2 py-1 text-xs"
        style={{ borderColor: "var(--color-line)" }}
        value={props.current}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          setError("");
          start(async () => {
            const r = await props.action(props.slug, id);
            if (!r.ok) return setError(r.error);
            window.location.href = r.next;
          });
        }}
      >
        {props.companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Err msg={error} />
    </div>
  );
}

export function PortalLogoutButton(props: { slug: string; action: (slug: string) => Promise<R<{ next: string }>> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      data-testid="portal-logout"
      className="rounded-lg border px-2.5 py-1 text-xs"
      style={{ borderColor: "var(--color-line)" }}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await props.action(props.slug);
          if (r.ok) window.location.href = r.next;
        })
      }
    >
      ออกจากระบบ
    </button>
  );
}

/** ตอบรับ/ปฏิเสธใบเสนอราคา — ต้องใส่ชื่อผู้ลงนาม · ปฏิเสธต้องมีเหตุผล (ร้านใช้ปรับใบเสนอราคา) */
export function PortalQuoteActions(props: {
  docId: string;
  canRespond: boolean;
  signerDefault: string;
  compact?: boolean;
  action: (docId: string, input: { accept: boolean; reason?: string; signerName: string }) => Promise<R<{ status: string }>>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "accept" | "reject">("");
  const [signer, setSigner] = useState(props.signerDefault);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!props.canRespond) return null;

  function submit(accept: boolean) {
    setError("");
    if (!signer.trim()) return setError("กรุณาระบุชื่อผู้ลงนามก่อนยืนยัน");
    if (!accept && !reason.trim()) return setError("กรุณาระบุเหตุผลที่ปฏิเสธ เพื่อให้ร้านนำไปปรับใบเสนอราคาได้");
    start(async () => {
      const r = await props.action(props.docId, { accept, reason: accept ? undefined : reason.trim(), signerName: signer.trim() });
      if (!r.ok) return setError(r.error);
      setMode("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" data-testid="portal-quote-accept" className="btn btn-primary flex-1 py-1.5" disabled={pending} onClick={() => setMode(mode === "accept" ? "" : "accept")}>
          ตอบรับ
        </button>
        <button type="button" data-testid="portal-quote-reject" className="btn btn-ghost flex-1 py-1.5" disabled={pending} onClick={() => setMode(mode === "reject" ? "" : "reject")}>
          ปฏิเสธ
        </button>
      </div>
      {mode !== "" && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="portal-quote-confirm">
          <label className="flex flex-col gap-1">
            <span style={muted}>ชื่อผู้ลงนาม (ผู้มีอำนาจของบริษัท)</span>
            <input data-testid="portal-signer-name" className="input" value={signer} onChange={(e) => setSigner(e.target.value)} maxLength={120} />
          </label>
          {mode === "reject" && (
            <label className="flex flex-col gap-1">
              <span style={muted}>เหตุผลที่ปฏิเสธ</span>
              <textarea data-testid="portal-reject-reason" className="input min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </label>
          )}
          <button type="button" data-testid="portal-quote-confirm-submit" className={`btn ${mode === "accept" ? "btn-primary" : "btn-ghost"} w-full`} disabled={pending} onClick={() => submit(mode === "accept")}>
            {mode === "accept" ? "ยืนยันตอบรับใบเสนอราคา" : "ยืนยันปฏิเสธ"}
          </button>
          <span style={{ ...muted, fontSize: 11 }}>ระบบบันทึกชื่อผู้ลงนาม เวลา และอุปกรณ์ที่ใช้ตอบไว้เป็นหลักฐานกับร้าน</span>
        </div>
      )}
      <Err msg={error} />
    </div>
  );
}

/** ชำระ PromptPay (ลิงก์ `/pay/<token>` ของบัญชี) + แนบสลิป (ไฟล์ส่วนตัว) */
export function PortalPayActions(props: {
  invoiceId: string;
  canPay: boolean;
  payAction: (invoiceId: string) => Promise<R<{ url: string }>>;
  slipAction: (form: FormData) => Promise<R<{ name: string }>>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  if (!props.canPay) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="portal-pay-promptpay"
        className="btn btn-primary w-full"
        disabled={pending}
        onClick={() => {
          setError("");
          start(async () => {
            const r = await props.payAction(props.invoiceId);
            if (!r.ok) return setError(r.error);
            window.location.href = r.url;
          });
        }}
      >
        ชำระ PromptPay
      </button>
      <label className="btn btn-ghost w-full cursor-pointer">
        แนบสลิป
        <input
          ref={fileRef}
          data-testid="portal-slip-upload"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError("");
            setDone("");
            const fd = new FormData();
            fd.set("invoiceId", props.invoiceId);
            fd.set("file", f);
            start(async () => {
              const r = await props.slipAction(fd);
              if (fileRef.current) fileRef.current.value = "";
              if (!r.ok) return setError(r.error);
              setDone(`แนบสลิป “${r.name}” แล้ว — ร้านจะตรวจสอบและออกใบเสร็จให้`);
            });
          }}
        />
      </label>
      {done ? <p role="status" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{done}</p> : null}
      <Err msg={error} />
    </div>
  );
}

/** แจ้งเรื่อง/ขอเอกสาร/ขอเปลี่ยนผู้ติดต่อ — ปุ่ม "แจ้งใหม่" เปิดฟอร์มในที่ */
export function PortalRequestForm(props: {
  kinds: { value: string; label: string }[];
  action: (input: { kind: string; title: string; body?: string }) => Promise<R<{ id: string }>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(props.kinds[0]?.value ?? "ISSUE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" data-testid="portal-request-new" className="btn btn-ghost self-start py-1.5 text-sm" onClick={() => setOpen(!open)}>
        + แจ้งใหม่
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
          <select data-testid="portal-request-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="ชนิดคำขอ">
            {props.kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input data-testid="portal-request-title" className="input" placeholder="หัวข้อ เช่น ขอเลื่อนวันดำน้ำกรุ๊ป" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <textarea data-testid="portal-request-body" className="input min-h-[80px]" placeholder="รายละเอียด (ไม่บังคับ)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          <button
            type="button"
            data-testid="portal-request-submit"
            className="btn btn-primary w-full"
            disabled={pending}
            onClick={() => {
              setError("");
              if (!title.trim()) return setError("กรุณาใส่หัวข้อของเรื่องก่อนส่ง");
              start(async () => {
                const r = await props.action({ kind, title: title.trim(), body: body.trim() || undefined });
                if (!r.ok) return setError(r.error);
                setOpen(false);
                setTitle("");
                setBody("");
                router.refresh();
              });
            }}
          >
            ส่งเรื่องให้ร้าน
          </button>
          <Err msg={error} />
        </div>
      )}
    </div>
  );
}

/** ขอแก้ฟิลด์ที่ร้านเปิดให้แก้ (portalEditable) — ค่าจริงเปลี่ยนเมื่อร้านอนุมัติ */
export function PortalRecordChange(props: {
  recordId: string;
  fields: { key: string; label: string; value: string }[];
  action: (recordId: string, input: { fieldKey: string; value: string }) => Promise<R<{ requestId: string }>>;
}) {
  const [fieldKey, setFieldKey] = useState(props.fields[0]?.key ?? "");
  const [value, setValue] = useState(props.fields[0]?.value ?? "");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  if (props.fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-sm font-medium">ขอแก้ข้อมูล</span>
      <select
        data-testid="portal-record-change-field"
        className="input"
        value={fieldKey}
        aria-label="ช่องที่ต้องการแก้"
        onChange={(e) => {
          setFieldKey(e.target.value);
          setValue(props.fields.find((f) => f.key === e.target.value)?.value ?? "");
        }}
      >
        {props.fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <input data-testid="portal-record-change-value" className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} />
      <button
        type="button"
        data-testid="portal-record-change-submit"
        className="btn btn-ghost w-full"
        disabled={pending}
        onClick={() => {
          setError("");
          setDone("");
          start(async () => {
            const r = await props.action(props.recordId, { fieldKey, value });
            if (!r.ok) return setError(r.error);
            setDone("ส่งคำขอแก้ไขให้ร้านแล้ว — ค่าจะเปลี่ยนเมื่อร้านอนุมัติ");
          });
        }}
      >
        ส่งคำขอแก้ไข
      </button>
      {done ? <p role="status" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{done}</p> : null}
      <Err msg={error} />
    </div>
  );
}

/**
 * หน้ารับคำเชิญ — กดยืนยันเอง (ลิงก์ใช้ครั้งเดียว: เปิดดูเฉย ๆ/ตัวสแกนลิงก์ต้องไม่ทำให้ลิงก์หมดสิทธิ์)
 * 🔴 มติผู้คุมงานรอบ 3: ไม่มีปุ่ม LINE ที่หน้านี้ — `liff.login()` จะพา URL ที่มี token เชิญไปกับ redirect ของ LINE
 *    ⇒ รับคำเชิญ (claim) ก่อน แล้วไปหน้าที่ไม่มี token · เข้าด้วย LINE ครั้งถัดไปจากหน้าเข้าสู่ระบบ
 */
export function PortalInviteAccept(props: { slug: string; inviteToken: string; action: (slug: string, inviteToken: string) => Promise<R<{ next: string }>> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        data-testid="portal-invite-accept"
        className="btn btn-primary h-11 w-full"
        disabled={pending}
        onClick={() => {
          setError("");
          start(async () => {
            const r = await props.action(props.slug, props.inviteToken);
            if (!r.ok) return setError(r.error);
            window.location.replace(r.next);
          });
        }}
      >
        เข้าสู่พอร์ทัล
      </button>
      <Err msg={error} />
    </div>
  );
}
