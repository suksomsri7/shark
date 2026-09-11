"use client";

// MProfile.tsx — หน้า "โปรไฟล์ของฉัน" ของลูกค้า (M2.9 · ภาพ 09 ค)
//
// หัวชื่อ/รหัส/ระดับ → รายการฟิลด์ (ดินสอ = แก้เองได้ · กุญแจ = ร้านเป็นผู้ยืนยัน) →
// ความยินยอมรับข่าวสารต่อช่องทาง (สวิตช์) → ปุ่ม "ส่งออก/ลบข้อมูลของฉัน (PDPA)"
// 🔴 ข้อความผิดพลาดขึ้น **ในบรรทัดของช่องนั้น** ไม่ใช่กล่องเด้ง (มาตรฐาน UI ของโปรเจกต์)
// 🔴 ไม่มีอีโมจิ · ไม่มีสีตายตัว · ไอคอนผ่าน MemberIcon
import { useState, useTransition } from "react";
import type { MeDto } from "@/lib/modules/member/me";
import {
  requestMyEraseAction,
  requestMyExportAction,
  setMyConsentAction,
  updateMyFieldsAction,
} from "@/lib/modules/member/me-actions";
import { MemberIcon } from "./MemberIcon";
import { MCardBox, MMuted, MSectionTitle, MTopBar, thaiDate } from "./MShell";

const CHANNEL_ICON: Record<string, string> = {
  LINE: "chat",
  EMAIL: "mail",
  SMS: "bell",
  PHONE: "person",
  WHATSAPP: "chat",
  PUSH: "bell",
};

/** ลำดับที่คนเข้าใจง่ายก่อน (ตามภาพ 09 ค) แล้วค่อยช่องทางที่เหลือ */
const CHANNEL_ORDER = ["LINE", "EMAIL", "SMS", "PHONE", "WHATSAPP", "PUSH"];

type FieldRow = MeDto["sections"][number]["fields"][number];

// ค่าที่จะโชว์หลังผู้ใช้เพิ่งกดบันทึก (ระหว่างรอหน้าจอโหลดใหม่)
// ปกติหน้าจอ **อ่าน `f.display` จากเซิร์ฟเวอร์เสมอ** (แปลง id สาขา/รหัสภาษา/รหัสประเทศ มาให้แล้ว)
// ตัวนี้ใช้เฉพาะค่าที่ผู้ใช้เพิ่งพิมพ์เองซึ่งเป็นชนิดง่าย ๆ (ข้อความ/ตัวเลือก/วันที่)
function localDisplay(f: FieldRow, v: FieldRow["value"]): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  if (Array.isArray(v)) return v.map((x) => f.choices.find((c) => c.value === x)?.label ?? x).join(", ");
  if (f.type === "DATE" || f.type === "DATETIME") return thaiDate(String(v));
  if (f.type === "SELECT") return f.choices.find((c) => c.value === v)?.label ?? String(v);
  return String(v);
}

function inputValue(f: FieldRow): string {
  const v = f.value;
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "1" : "";
  if ((f.type === "DATE" || f.type === "DATETIME") && v) return new Date(String(v)).toISOString().slice(0, 10);
  return String(v);
}

function parseValue(f: FieldRow, raw: string): string | number | boolean | string[] | null {
  const t = raw.trim();
  if (f.type === "BOOLEAN") return t === "1";
  if (t === "") return null;
  if (f.type === "NUMBER" || f.type === "MONEY") return Number(t);
  if (f.type === "MULTI_SELECT") return t.split(",").map((x) => x.trim()).filter(Boolean);
  return t;
}

export function MProfile({ slug, me }: { slug: string; me: MeDto }) {
  const [rows, setRows] = useState(() => me.sections.flatMap((s) => s.fields));
  const [consents, setConsents] = useState(() => me.consents.filter((c) => c.canConsent));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<{ key: string; message: string } | null>(null);
  const [pdpaOpen, setPdpaOpen] = useState(false);
  const [pdpaNote, setPdpaNote] = useState("");
  const [pdpaError, setPdpaError] = useState("");
  const [pending, start] = useTransition();

  const initial = (me.member.displayName || "ส").trim().slice(0, 1);
  const orderOf = (key: string): number => {
    const i = CHANNEL_ORDER.indexOf(key);
    return i < 0 ? CHANNEL_ORDER.length : i;
  };
  const sorted = [...consents].sort((a, b) => orderOf(a.channel) - orderOf(b.channel));

  function save(f: FieldRow) {
    const value = parseValue(f, draft);
    setFieldError(null);
    start(async () => {
      const r = await updateMyFieldsAction({ slug, fields: { [f.key]: value } });
      if (!r.ok) {
        setFieldError({ key: f.key, message: r.reason });
        return;
      }
      setRows((old) => old.map((x) => (x.key === f.key ? { ...x, value, display: localDisplay(x, value) } : x)));
      setEditing(null);
    });
  }

  function toggleConsent(channel: string, granted: boolean) {
    setConsents((old) => old.map((c) => (c.channel === channel ? { ...c, granted } : c)));
    start(async () => {
      const r = await setMyConsentAction({ slug, channel, granted });
      if (!r.ok) setConsents((old) => old.map((c) => (c.channel === channel ? { ...c, granted: !granted } : c)));
    });
  }

  function exportMine() {
    setPdpaError("");
    start(async () => {
      const r = await requestMyExportAction({ slug });
      if (!r.ok) {
        setPdpaError(r.reason);
        return;
      }
      const blob = new Blob([r.data.bundleJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${me.member.memberCode || "member"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setPdpaNote("ดาวน์โหลดสำเนาข้อมูลของคุณเรียบร้อยแล้ว");
    });
  }

  function eraseMine() {
    setPdpaError("");
    start(async () => {
      const r = await requestMyEraseAction({ slug, reason: "ลูกค้าขอลบข้อมูลจากหน้าสมาชิก" });
      if (!r.ok) {
        setPdpaError(r.reason);
        return;
      }
      setPdpaNote("ส่งคำขอลบข้อมูลให้ร้านแล้ว — ร้านจะตรวจสอบและแจ้งผลกลับ");
    });
  }

  return (
    <div data-testid="m-profile" className="flex flex-col gap-3 pb-4">
      <MTopBar title="โปรไฟล์ของฉัน" left="back" right="edit" />

      <div className="flex items-center gap-3 px-4">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: "var(--color-surface-2)", fontSize: 15, fontWeight: 600 }}
        >
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 700 }}>
            {me.member.displayName}
          </span>
          <MMuted>
            {me.member.memberCode}
            {me.member.tier ? ` · ${me.member.tier.name}` : ""}
          </MMuted>
        </span>
      </div>

      <div data-testid="m-profile-fields" className="px-4">
        <MCardBox className="px-3">
          {rows.length === 0 && me.lockedFields.length === 0 ? (
            <p className="py-3" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              ร้านยังไม่ได้เปิดช่องข้อมูลให้แก้ไขเอง
            </p>
          ) : null}
          {rows.map((f) => (
            <div key={f.key} className="flex flex-col gap-1 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                  {f.label}
                </span>
                {editing === f.key ? (
                  f.type === "SELECT" && f.choices.length > 0 ? (
                    <select className="input flex-1" style={{ fontSize: 12.5 }} value={draft} onChange={(e) => setDraft(e.target.value)}>
                      <option value="">— ไม่ระบุ —</option>
                      {f.choices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "BOOLEAN" ? (
                    <select className="input flex-1" style={{ fontSize: 12.5 }} value={draft} onChange={(e) => setDraft(e.target.value)}>
                      <option value="">ไม่ใช่</option>
                      <option value="1">ใช่</option>
                    </select>
                  ) : (
                    <input
                      className="input flex-1"
                      style={{ fontSize: 12.5 }}
                      type={f.type === "DATE" ? "date" : f.type === "NUMBER" || f.type === "MONEY" ? "number" : "text"}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label={f.label}
                    />
                  )
                ) : (
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.8, fontWeight: 600 }}>
                    {f.display || "—"}
                  </span>
                )}
                {editing === f.key ? (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className="btn-sm" style={{ fontSize: 12 }} disabled={pending} onClick={() => save(f)}>
                      บันทึก
                    </button>
                    <button type="button" className="btn-sm" style={{ fontSize: 12 }} onClick={() => setEditing(null)}>
                      ยกเลิก
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`แก้ไข ${f.label}`}
                    className="shrink-0 opacity-60"
                    onClick={() => {
                      setEditing(f.key);
                      setDraft(inputValue(f));
                      setFieldError(null);
                    }}
                  >
                    <MemberIcon name="edit" size="sm" />
                  </button>
                )}
              </div>
              {fieldError?.key === f.key ? (
                <span style={{ fontSize: 11.5, color: "var(--color-danger)" }}>{fieldError.message}</span>
              ) : null}
            </div>
          ))}
          {me.lockedFields.map((f) => (
            <div key={f.key} className="flex items-center gap-2 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
              <span className="w-24 shrink-0 truncate" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                {f.label}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.8, fontWeight: 600 }}>
                {f.display || "—"}
              </span>
              <MemberIcon name="lock" size="sm" className="shrink-0 opacity-60" />
            </div>
          ))}
        </MCardBox>
        <p className="pt-1.5" style={{ fontSize: 11, color: "var(--color-muted)" }}>
          ฟิลด์ที่ล็อกไอคอนกุญแจ ร้านเป็นผู้ยืนยันให้เท่านั้น
        </p>
      </div>

      <MSectionTitle icon="check">ความยินยอมรับข่าวสาร</MSectionTitle>
      <div data-testid="m-profile-consents" className="px-4">
        <MCardBox className="px-3">
          {sorted.map((c) => (
            <div key={c.channel} className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
              <MemberIcon name={CHANNEL_ICON[c.channel] ?? "chat"} size="sm" className="opacity-60" />
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.8 }}>
                {c.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={c.granted === true}
                aria-label={`รับข่าวสารทาง ${c.label}`}
                disabled={pending}
                onClick={() => toggleConsent(c.channel, !(c.granted === true))}
                className="flex h-[17px] w-[30px] shrink-0 items-center rounded-full px-0.5"
                style={{ background: c.granted === true ? "var(--color-ink)" : "var(--color-line)" }}
              >
                <span
                  className="h-[13px] w-[13px] rounded-full transition-transform"
                  style={{
                    background: "var(--color-surface)",
                    transform: c.granted === true ? "translateX(13px)" : "translateX(0)",
                  }}
                />
              </button>
            </div>
          ))}
        </MCardBox>
      </div>

      <div data-testid="m-profile-pdpa" className="flex flex-col gap-2 px-4 pt-1">
        <button type="button" className="btn btn-ghost w-full" style={{ fontSize: 12.5 }} onClick={() => setPdpaOpen((v) => !v)}>
          <MemberIcon name="out" size="sm" />
          ส่งออก/ลบข้อมูลของฉัน (PDPA)
        </button>
        {pdpaOpen ? (
          <MCardBox className="flex flex-col gap-2 p-3">
            <MMuted size={11.5}>
              ส่งออก = ดาวน์โหลดสำเนาข้อมูลของคุณทันที · ขอลบ = ส่งคำขอให้ร้านตรวจสอบก่อน (บิลและหลักฐานทางบัญชีตามกฎหมายจะยังถูกเก็บไว้)
            </MMuted>
            <div className="flex gap-2">
              <button type="button" className="btn-sm flex-1" style={{ fontSize: 12 }} disabled={pending} onClick={exportMine}>
                ส่งออกข้อมูลของฉัน
              </button>
              <button type="button" className="btn-sm flex-1" style={{ fontSize: 12 }} disabled={pending} onClick={eraseMine}>
                ขอลบข้อมูลของฉัน
              </button>
            </div>
            {pdpaNote ? <MMuted size={11.5}>{pdpaNote}</MMuted> : null}
            {pdpaError ? <span style={{ fontSize: 11.5, color: "var(--color-danger)" }}>{pdpaError}</span> : null}
          </MCardBox>
        ) : null}
      </div>
    </div>
  );
}

export default MProfile;
