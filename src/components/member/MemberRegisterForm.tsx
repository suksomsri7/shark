// MemberRegisterForm.tsx — ฟอร์มสมัครสมาชิกใหม่ (M1.6 · ภาพ 10 · ตีกลับรอบ 1)
// testid: members-new-form members-new-phone members-new-dup members-new-consents
//         members-new-source members-new-referral members-new-qr members-new-submit
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";
import { MemberIcon } from "./MemberIcon";
import { consentChannels } from "@/lib/core/channels";
import { MEMBER_SOURCE_LABELS } from "@/lib/modules/member/member-source-labels";
import type { SectionDef, MemberFieldValueInput } from "@/lib/modules/member/fields";
import type { MemberBrief } from "@/lib/modules/member/profile";
import { createMemberAction, checkDuplicateAction, joinLinkForAction } from "@/lib/modules/member/members-actions";

const GENDERS: { value: string; label: string }[] = [
  { value: "", label: "— ไม่ระบุ —" },
  { value: "FEMALE", label: "หญิง" },
  { value: "MALE", label: "ชาย" },
  { value: "OTHER", label: "อื่น ๆ" },
  { value: "UNSPECIFIED", label: "ไม่ระบุ" },
];

function inputClass(): string {
  return "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
      <MemberIcon name={icon} size="sm" className="text-[color:var(--color-muted)]" />
      {children}
    </h3>
  );
}

/** ฟิลด์กำหนดเอง/ระบบ 1 ตัวของส่วนแบบไดนามิก — รองรับ 11 ชนิดตามที่ตัวออกแบบฟิลด์รองรับ */
function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: SectionDef["fields"][number];
  value: MemberFieldValueInput;
  onChange: (v: MemberFieldValueInput) => void;
}) {
  if (field.type === "LOOKUP" || field.type === "FILE") {
    return <input disabled placeholder="ตั้งค่าได้จากหน้าโปรไฟล์สมาชิกหลังสมัคร" className={`${inputClass()} opacity-60`} />;
  }
  if (field.type === "BOOLEAN") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "SELECT") {
    return (
      <select className={inputClass()} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— เลือกระดับ —</option>
        {field.options.choices?.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "MULTI_SELECT") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-2">
        {field.options.choices?.map((c) => (
          <label key={c.value} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={picked.includes(c.value)}
              onChange={(e) => onChange(e.target.checked ? [...picked, c.value] : picked.filter((v) => v !== c.value))}
            />
            {c.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "NUMBER" || field.type === "MONEY") {
    return (
      <input
        type="number"
        className={inputClass()}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder="0"
      />
    );
  }
  if (field.type === "DATE") {
    return (
      <input type="date" className={inputClass()} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />
    );
  }
  if (field.type === "LONG_TEXT") {
    return (
      <textarea className={inputClass()} rows={3} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />
    );
  }
  return <input className={inputClass()} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function MemberRegisterForm({
  systemId,
  sections,
  units,
  initialJoinLink,
  campaigns = [],
  teamMembers = [],
  currentUserId,
  defaultTierName,
  privacyVersion,
}: {
  systemId: string;
  sections: SectionDef[];
  units: { id: string; name: string }[];
  /** ลิงก์/QR ที่หน้า (server component) สร้างไว้ล่วงหน้าแล้ว — ไม่ต้องรอกด "QR LIFF" ก่อนถึงจะเห็น */
  initialJoinLink?: { url: string; qrDataUrl: string } | null;
  /** ลิงก์ที่มา/แคมเปญของระบบนี้ (M1.8 `sources.ts#listLinks`) — ว่าง = ร้านยังไม่ได้สร้างลิงก์ไว้ */
  campaigns?: { id: string; name: string }[];
  /** สมาชิกทีมของร้าน (Membership) — เลือก "พนักงานที่รับ" */
  teamMembers?: { id: string; name: string }[];
  currentUserId?: string;
  /** ระดับเริ่มต้น (rank ต่ำสุด/isDefault) — แถบล่างของฟอร์ม */
  defaultTierName?: string | null;
  /** เวอร์ชันนโยบายความเป็นส่วนตัวที่บังคับใช้อยู่ (M1.7 `privacy.ts#currentPolicy`) — ไม่มี = ยังไม่ได้ตั้งนโยบาย */
  privacyVersion?: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("WALK_IN");
  const [homeUnitId, setHomeUnitId] = useState(units[0]?.id ?? "");
  const [referralCode, setReferralCode] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [receivedByUserId, setReceivedByUserId] = useState(currentUserId ?? "");
  const [consentGranted, setConsentGranted] = useState<Record<string, boolean>>({ LINE: true, EMAIL: true, SMS: false, PHONE: true });
  const [customValues, setCustomValues] = useState<Record<string, MemberFieldValueInput>>({});
  const [dupState, setDupState] = useState<{ status: "idle" | "checking" | "clear" | "found"; brief?: MemberBrief | null }>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; qrDataUrl: string } | null>(initialJoinLink ?? null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customSections = sections.filter((s) => !s.isSystem);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setDupState({ status: "idle" });
      return;
    }
    setDupState({ status: "checking" });
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await checkDuplicateAction({ systemId, phone });
        if (res.ok) setDupState(res.data ? { status: "found", brief: res.data } : { status: "clear" });
        else setDupState({ status: "idle" });
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, systemId]);

  const toggleQr = () => {
    if (qr) {
      setQrOpen((o) => !o);
      return;
    }
    setQrLoading(true);
    startTransition(async () => {
      const res = await joinLinkForAction({ systemId });
      setQrLoading(false);
      if (res.ok) {
        setQr(res.data);
        setQrOpen(true);
      }
    });
  };

  const submit = () => {
    setError(null);
    const consents = consentChannels()
      .filter((c) => consentGranted[c.key] !== undefined)
      .map((c) => ({ channel: c.key, granted: !!consentGranted[c.key], source: "SIGNUP_FORM" }));
    const sourceDetail: Record<string, unknown> = {};
    if (receivedByUserId) sourceDetail.receivedByUserId = receivedByUserId;
    if (campaignId) sourceDetail.campaignId = campaignId;
    startTransition(async () => {
      const res = await createMemberAction({
        systemId,
        firstName: firstName || null,
        lastName: lastName || null,
        nickname: nickname || null,
        birthDate: birthDate || null,
        gender: gender || null,
        phone: phone || null,
        email: email || null,
        source,
        sourceDetail: Object.keys(sourceDetail).length ? sourceDetail : undefined,
        referralCode: referralCode || null,
        homeUnitId: homeUnitId || null,
        consents,
        fields: customValues,
      });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      if (!res.data.created) {
        setDupState({ status: "found", brief: res.data.duplicate ?? null });
        setError("มีสมาชิกคนนี้อยู่แล้วในระบบ — เปิดโปรไฟล์เดิมแทนการสมัครซ้ำ");
        return;
      }
      router.push(`/app/sys/${systemId}/member/members/${res.data.customerId}`);
    });
  };

  return (
    <div data-testid="members-new-form" className="card flex flex-col gap-5 p-5 pb-20 sm:pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">ข้อมูลส่วนตัว/ติดต่อ/ที่มา</h2>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={toggleQr} disabled={qrLoading}>
            {qrLoading ? "กำลังสร้าง…" : "QR LIFF"}
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={qrLoading}
            onClick={() => {
              if (qr) navigator.clipboard?.writeText(qr.url);
              else toggleQr();
            }}
          >
            คัดลอกลิงก์
          </button>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        หรือให้ลูกค้ากรอกเอง — กดปุ่ม QR LIFF ด้านบนแล้วให้ลูกค้าแสกนกรอกในมือถือตัวเอง
      </p>
      {/* testid ต้องอยู่ใน DOM เสมอ (ซ่อนด้วย hidden) — กล่องจริงจะโผล่ก็ต่อเมื่อกด "QR LIFF" */}
      <div data-testid="members-new-qr" hidden={!qrOpen || !qr} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
        {qr && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qrDataUrl} alt="QR สมัครสมาชิก" width={96} height={96} />
            <div className="min-w-0 text-xs break-all" style={{ color: "var(--color-muted)" }}>
              {qr.url}
            </div>
          </>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="person">ข้อมูลส่วนตัว</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="ชื่อ">
            <input className={inputClass()} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="นามสกุล">
            <input className={inputClass()} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="ชื่อเล่น">
            <input className={inputClass()} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </FormField>
          <FormField label="วันเกิด">
            <input type="date" className={inputClass()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </FormField>
          <FormField label="เพศ">
            <select className={inputClass()} value={gender} onChange={(e) => setGender(e.target.value)}>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="chat">ติดต่อ</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="มือถือ">
            <input
              data-testid="members-new-phone"
              className={inputClass()}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08X-XXX-XXXX"
            />
            <div
              data-testid="members-new-dup"
              className="mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px]"
              style={
                dupState.status === "found"
                  ? { borderColor: "var(--color-tag-amber)", color: "var(--color-tag-amber)" }
                  : dupState.status === "clear"
                    ? { borderColor: "var(--color-tag-green)", color: "var(--color-tag-green)" }
                    : { borderColor: "transparent", color: "var(--color-muted)" }
              }
            >
              {dupState.status === "checking" && "กำลังตรวจซ้ำ…"}
              {dupState.status === "clear" && "ตรวจซ้ำแล้ว: ไม่พบ"}
              {dupState.status === "found" && `ซ้ำกับ ${dupState.brief?.name ?? "ไม่ทราบชื่อ"} ${dupState.brief?.memberCode ?? ""}`}
            </div>
          </FormField>
          <FormField label="อีเมล">
            <input className={inputClass()} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="LINE" hint="ผูกภายหลังจากแชท">
              <input disabled className={`${inputClass()} opacity-60`} placeholder="ผูกภายหลังจากแชท" />
            </FormField>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="flag">ที่มา</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="ช่องทาง">
            <select data-testid="members-new-source" className={inputClass()} value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(MEMBER_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="แคมเปญ">
            {campaigns.length > 0 ? (
              <select className={inputClass()} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">— ไม่มีแคมเปญ —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input disabled className={`${inputClass()} opacity-60`} placeholder="— ไม่มีแคมเปญ —" />
            )}
          </FormField>
          <FormField label="สาขาหลัก">
            <select className={inputClass()} value={homeUnitId} onChange={(e) => setHomeUnitId(e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ผู้แนะนำ" hint="รหัสแนะนำเพื่อน (ถ้ามี)">
            <input
              data-testid="members-new-referral"
              className={inputClass()}
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="รหัสแนะนำ 8 ตัว"
            />
          </FormField>
          <FormField label="พนักงานที่รับ">
            {teamMembers.length > 0 ? (
              <select className={inputClass()} value={receivedByUserId} onChange={(e) => setReceivedByUserId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input disabled className={`${inputClass()} opacity-60`} placeholder="— ไม่มีรายชื่อทีม —" />
            )}
          </FormField>
        </div>
      </section>

      {customSections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MemberIcon name="star" size="sm" className="text-[color:var(--color-muted)]" />
            {section.label}
            <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
              กำหนดเอง
            </span>
          </h3>
          {section.sensitive ? (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              ส่วนข้อมูลอ่อนไหว — กรอกได้จากหน้าโปรไฟล์สมาชิกหลังสมัคร
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {section.fields.map((field) => (
                <FormField key={field.id} label={field.label} required={field.required}>
                  <CustomFieldInput
                    field={field}
                    value={customValues[field.key] ?? null}
                    onChange={(v) => setCustomValues((prev) => ({ ...prev, [field.key]: v }))}
                  />
                </FormField>
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <SectionTitle icon="lock">ความยินยอม (PDPA)</SectionTitle>
        <div data-testid="members-new-consents" className="flex flex-wrap gap-4">
          {consentChannels().map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!consentGranted[c.key]}
                onChange={(e) => setConsentGranted((prev) => ({ ...prev, [c.key]: e.target.checked }))}
              />
              ติดต่อทาง{c.label}
            </label>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          {privacyVersion ? `นโยบายความเป็นส่วนตัว v${privacyVersion} · ลงนามผ่านหน้าจอ` : "นโยบายความเป็นส่วนตัว · ลงนามผ่านหน้าจอ"}
        </p>
      </section>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-1 flex flex-wrap items-center justify-between gap-2 border-t bg-[color:var(--color-surface)] px-5 py-3 sm:static sm:mx-0 sm:mb-0 sm:border-t-0 sm:px-0 sm:py-0" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {defaultTierName ? `ระดับเริ่มต้น ${defaultTierName}` : " "}
        </span>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={() => router.back()}>
            ยกเลิก
          </button>
          <button type="button" data-testid="members-new-submit" className="btn btn-primary text-sm" onClick={submit} disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึกและออกบัตร"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MemberRegisterForm;
