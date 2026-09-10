"use client";

// ChatMemberPanel.tsx — แผงข้าง "สมาชิก" ในห้องแชท (M1.12 · ภาพ 26 · 28ก,ข)
// ฝังอยู่ใน `src/lib/modules/chat/context-panel.tsx` (คอลัมน์ขวาของกล่องแชท) · เดินตามโทเคน/คลาส
// เดียวกับ `Member360.tsx` (`.card` · `.btn` · `var(--color-*)`) — ไม่มีอีโมจิ ไม่มี hex สด
//
// 🔴 มือถือ: คอลัมน์ขวาทั้งก้อนของ context-panel.tsx เป็น `hidden lg:flex` (ซ่อนต่ำกว่า lg เสมอ — ของเดิม
//    สาย F ตั้งใจไว้ตั้งแต่ WO-CV7) ⇒ ถ้าแผงนี้ฝังอยู่เฉย ๆ จะไม่มีวันโผล่บนจอแคบ (ภาพ 28 ต้องการให้เห็น)
//    แก้ด้วย `createPortal` ออกไปที่ `document.body` เป็นแผ่นเลื่อนขึ้นจากขอบล่าง (sheet) เฉพาะตอนจอ < lg
//    — ไม่แตะโครงเดิมของ context-panel.tsx/inbox-client.tsx เลย (เลี่ยงความเสี่ยงไฟล์ที่ใช้ร่วมกันหลายคน)

import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MemberIcon } from "./MemberIcon";
import { TierChip } from "./TierChip";
import {
  getChatMemberPanelAction,
  linkContactAction,
  registerFromChatAction,
} from "@/lib/modules/member/chat-actions";
import type { ChatPanelResult } from "@/lib/modules/member";

const muted = { color: "var(--color-muted)" } as const;

function thaiBaht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function thaiWhen(d: Date | string | null): string {
  if (!d) return "ยังไม่มีกิจกรรม";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

export function ChatMemberPanel({ conversationId, onCreateTask }: { conversationId: string; onCreateTask?: () => void }) {
  const [data, setData] = useState<ChatPanelResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [regFirst, setRegFirst] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await getChatMemberPanelAction(conversationId);
    if (res.ok) {
      setData(res.data);
      setState("ready");
    } else {
      setErrMsg(res.reason);
      setState("error");
    }
  }, [conversationId]);

  useEffect(() => {
    setData(null);
    setState("loading");
    setActionErr(null);
    setShowRegister(false);
    void load();
  }, [load]);

  // มือถือ/เดสก์ท็อป — ใช้ matchMedia (ไม่ใช่แค่ CSS) เพราะเดสก์ท็อปเรนเดอร์ตำแหน่งเดิม (การ์ดในคอลัมน์)
  // ส่วนมือถือต้อง `createPortal` ออกจากคอลัมน์ที่ถูกซ่อน (ดูหมายเหตุหัวไฟล์)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const pick = (customerId: string) => {
    if (!data) return;
    setActionErr(null);
    startTransition(async () => {
      const res = await linkContactAction(conversationId, { contactId: data.contact.id, customerId, method: "MANUAL" });
      if (res.ok) void load();
      else setActionErr(res.reason);
    });
  };

  const submitRegister = () => {
    if (!data) return;
    setActionErr(null);
    startTransition(async () => {
      const res = await registerFromChatAction(conversationId, {
        contactId: data.contact.id,
        firstName: regFirst.trim() || undefined,
        phone: regPhone.trim() || undefined,
      });
      if (res.ok) {
        setShowRegister(false);
        setRegFirst("");
        setRegPhone("");
        void load();
      } else {
        setActionErr(res.reason);
      }
    });
  };

  if (isDesktop === null) return null; // ยังไม่รู้ขนาดจอ — รอ 1 จังหวะกันกระพริบ/เรนเดอร์ซ้อน

  const inner = (
    <div data-testid="chat-member-panel" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">สมาชิก</span>
      </div>

      {state === "loading" && <span style={{ fontSize: 12.5, ...muted }}>กำลังโหลดข้อมูลสมาชิก…</span>}

      {state === "error" && (
        <div className="flex flex-col gap-1.5">
          <span style={{ fontSize: 12.5, ...muted }}>{errMsg ?? "ยังโหลดข้อมูลสมาชิกไม่ได้ในตอนนี้"}</span>
          <button type="button" onClick={() => void load()} className="btn btn-ghost self-start text-sm">
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {state === "ready" && data && data.linked && data.member && (
        <LinkedView data={data} member={data.member} onPick={pick} onCreateTask={onCreateTask} pending={pending} />
      )}

      {state === "ready" && data && !data.linked && (
        <UnlinkedView
          data={data}
          pending={pending}
          onPick={pick}
          showRegister={showRegister}
          onToggleRegister={setShowRegister}
          regFirst={regFirst}
          regPhone={regPhone}
          onRegFirst={setRegFirst}
          onRegPhone={setRegPhone}
          onSubmitRegister={submitRegister}
        />
      )}

      {actionErr && <span style={{ fontSize: 12, color: "var(--color-danger)" }}>{actionErr}</span>}
    </div>
  );

  if (isDesktop) return inner;

  // มือถือ (ภาพ 28) — sheet เลื่อนขึ้นจากขอบล่าง ไม่ยึดกับคอลัมน์ขวาที่ถูกซ่อนของ context-panel.tsx
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t p-3"
      style={{ background: "var(--color-surface, #fff)", borderColor: "var(--color-line)" }}
    >
      {inner}
    </div>,
    document.body,
  );
}

function Initial({ name }: { name: string }) {
  const c = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full text-base font-semibold"
      style={{ width: 44, height: 44, background: "var(--color-surface-2)", color: "var(--color-ink)" }}
    >
      {c}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  disabled,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="btn btn-ghost flex flex-col items-center gap-1 py-2 text-xs"
    >
      <MemberIcon name={icon} size="md" />
      {label}
    </button>
  );
}

function LinkedView({
  data,
  member,
  onPick,
  onCreateTask,
  pending,
}: {
  data: ChatPanelResult;
  member: NonNullable<ChatPanelResult["member"]>;
  onPick: (customerId: string) => void;
  onCreateTask?: () => void;
  pending: boolean;
}) {
  const b = member.brief;
  return (
    <>
      <div data-testid="chat-member-brief" className="flex items-start gap-2.5">
        <Initial name={b.name} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{b.name}</span>
            {b.tier && <TierChip name={b.tier.name} color={b.tier.color} />}
          </div>
          <span style={{ fontSize: 11.5, ...muted }}>{b.memberCode}</span>
          <Link
            href={`/app/sys/${data.memberSystemId}/member/members/${b.id}`}
            data-testid="chat-member-open-360"
            className="text-xs font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            เปิดโปรไฟล์ 360 →
          </Link>
        </div>
      </div>

      <div data-testid="chat-member-stats" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="แต้ม" value={member.stats.points.toLocaleString("th-TH")} />
        <Stat label="voucher" value={member.stats.vouchers.toLocaleString("th-TH")} />
        <Stat label="ยอด 12 เดือน" value={`฿${thaiBaht(member.stats.spent12mSatang)}`} />
        <Stat label="มาล่าสุด" value={thaiWhen(member.stats.lastActivityAt)} />
      </div>

      <div data-testid="chat-member-channels" className="flex flex-col gap-1">
        <span style={{ fontSize: 11.5, fontWeight: 700, ...muted }}>ช่องทางที่ผูก ({member.identities.length})</span>
        <div className="flex flex-wrap gap-1">
          {member.identities.map((i) => (
            <span
              key={`${i.channel}-${i.label}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={i.current ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" } : { borderColor: "var(--color-line)", color: "var(--color-muted)" }}
            >
              {i.label}
              {i.current ? " (ห้องนี้)" : ""}
            </span>
          ))}
        </div>
      </div>

      <div data-testid="chat-member-actions" className="grid grid-cols-4 gap-1.5">
        <QuickAction icon="gift" label="ออก voucher" disabled title="ออก voucher ชดเชย — เร็ว ๆ นี้ (M2.5)" />
        <QuickAction icon="bolt" label="ให้แต้ม" disabled title="ให้แต้มด่วน — เร็ว ๆ นี้ (M2.2)" />
        <QuickAction icon="stamp" label="ประทับสแตมป์" disabled title="ประทับสแตมป์ — เร็ว ๆ นี้ (M2.3)" />
        <QuickAction
          icon="doc"
          label="สร้างงาน"
          disabled={!onCreateTask || pending}
          title={onCreateTask ? "สร้างงานจากบทสนทนานี้ (บอร์ดงาน)" : "เปิดสวิตช์เชื่อมบอร์ดงานก่อน"}
          onClick={onCreateTask}
        />
      </div>

      {member.benefits.length > 0 && (
        <div data-testid="chat-member-benefits" className="flex flex-col gap-1">
          <span style={{ fontSize: 11.5, fontWeight: 700, ...muted }}>สิทธิ์ที่ใช้ได้ตอนนี้</span>
          <ul className="flex flex-col gap-0.5 pl-4" style={{ fontSize: 12.5, listStyle: "disc" }}>
            {member.benefits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {member.benefits.length === 0 && <div data-testid="chat-member-benefits" hidden />}

      <div data-testid="chat-member-history" className="flex flex-col gap-1">
        <span style={{ fontSize: 11.5, fontWeight: 700, ...muted }}>ประวัติล่าสุด</span>
        {member.history.length === 0 ? (
          <span style={{ fontSize: 12.5, ...muted }}>ยังไม่มีประวัติ</span>
        ) : (
          member.history.map((h, idx) => (
            <div key={`${h.at.toString()}-${idx}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" style={{ fontSize: 12.5 }}>{h.summary}</span>
              <span className="shrink-0" style={{ fontSize: 11, ...muted }}>{thaiWhen(h.at)}</span>
            </div>
          ))
        )}
      </div>

      {member.cardFields.length > 0 && (
        <div data-testid="chat-member-fields" className="flex flex-col gap-1">
          <span style={{ fontSize: 11.5, fontWeight: 700, ...muted }}>ข้อมูลที่ร้านตั้งให้เห็น</span>
          {member.cardFields.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2">
              <span style={{ fontSize: 11.5, ...muted }}>{f.label}</span>
              <span className="min-w-0 truncate text-right" style={{ fontSize: 12.5 }}>{f.display}</span>
            </div>
          ))}
        </div>
      )}
      {member.cardFields.length === 0 && <div data-testid="chat-member-fields" hidden />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontSize: 10.5, ...muted }}>{label}</span>
      <span className="font-semibold" style={{ fontSize: 13.5 }}>{value}</span>
    </div>
  );
}

function UnlinkedView({
  data,
  pending,
  onPick,
  showRegister,
  onToggleRegister,
  regFirst,
  regPhone,
  onRegFirst,
  onRegPhone,
  onSubmitRegister,
}: {
  data: ChatPanelResult;
  pending: boolean;
  onPick: (customerId: string) => void;
  showRegister: boolean;
  onToggleRegister: (v: boolean) => void;
  regFirst: string;
  regPhone: string;
  onRegFirst: (v: string) => void;
  onRegPhone: (v: string) => void;
  onSubmitRegister: () => void;
}) {
  return (
    <>
      <span style={{ fontSize: 12.5, ...muted }}>ห้องนี้ยังไม่ได้ผูกกับสมาชิก</span>

      {data.sameIdentityOtherChannel && (
        <div data-testid="chat-member-merge-hint" className="card flex flex-col gap-1.5 p-2.5">
          <span style={{ fontSize: 12.5 }}>
            พบเบอร์/อีเมลเดียวกับ <b>{data.sameIdentityOtherChannel.name}</b> ที่เคยผูกช่องทางอื่นไว้แล้ว
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => onPick(data.sameIdentityOtherChannel!.customerId)}
            className="btn btn-ghost self-start text-sm"
          >
            ผูกรวมกับคนนี้
          </button>
        </div>
      )}

      <div data-testid="chat-member-candidates" className="flex flex-col gap-1.5">
        <span style={{ fontSize: 11.5, fontWeight: 700, ...muted }}>สมาชิกที่ชื่อคล้ายกัน</span>
        {data.candidates.length === 0 ? (
          <span style={{ fontSize: 12.5, ...muted }}>ไม่พบสมาชิกที่ชื่อคล้ายกัน</span>
        ) : (
          data.candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" style={{ fontSize: 12.5 }}>
                {c.name} · {c.phoneMasked}
              </span>
              <button
                type="button"
                data-testid={`chat-member-pick-${c.id}`}
                disabled={pending}
                onClick={() => onPick(c.id)}
                className="btn btn-ghost shrink-0 text-xs"
              >
                เลือก
              </button>
            </div>
          ))
        )}
      </div>

      {!showRegister ? (
        <button
          type="button"
          data-testid="chat-member-register"
          onClick={() => onToggleRegister(true)}
          className="btn btn-ghost self-start text-sm"
        >
          <MemberIcon name="plus" size="sm" /> สมัครใหม่จากแชท
        </button>
      ) : (
        <div data-testid="chat-member-register" className="flex flex-col gap-1.5">
          <input
            value={regFirst}
            onChange={(e) => onRegFirst(e.target.value)}
            placeholder="ชื่อ"
            aria-label="ชื่อสมาชิกใหม่"
            className="input h-8 py-0 text-xs"
          />
          <input
            value={regPhone}
            onChange={(e) => onRegPhone(e.target.value)}
            placeholder="เบอร์โทร"
            inputMode="tel"
            aria-label="เบอร์โทรสมาชิกใหม่"
            className="input h-8 py-0 text-xs"
          />
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending} onClick={onSubmitRegister} className="btn btn-ghost text-sm">
              สมัครสมาชิก
            </button>
            <button type="button" onClick={() => onToggleRegister(false)} className="text-xs underline" style={muted}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatMemberPanel;
