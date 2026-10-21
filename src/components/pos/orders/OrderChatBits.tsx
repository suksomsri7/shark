"use client";

// OrderChatBits.tsx — POS P3.7U ส่วนแชทของแผงออเดอร์จอ 09 (CD-P37U-4/8)
//   ChatPayBlock: ปุ่ม "ส่งลิงก์ชำระในแชท" (ประตู A · requestChatPaymentAction) ของออเดอร์ CHAT ที่ไม่ใช่แพลตฟอร์ม · NEW · UNPAID|PAY_ON_PICKUP
//     🔴 ไม่ขึ้นกับสวิตช์แชท (CD-P5) — สวิตช์ปิดอยู่ปุ่มก็ยังแสดง/กดได้
//     ปิดพร้อมเหตุผล (title + บรรทัด pos-ord-chatpay-reason): ไม่มีสิทธิ์รับ∧เปิดบิล = chatPay.needPerm · ไม่ผูกห้องแชท = errors.noChatLink · สาขาไม่มีพร้อมเพย์ = errors.promptpayNotConfigured
//     ผล: ส่งแล้ว = chatPay.sent + ชำระภายใน · ซ้ำ = chatPay.duplicated · ส่งไม่สำเร็จ = chatPay.notSent + ปุ่มคัดลอกลิงก์ · ปฏิเสธ = messageKey (หรือ refusalMessageKey)
//     หลังทุกผล = โหลดออเดอร์ใหม่ (onDone) · ไม่มีปุ่มลองใหม่/ส่งซ้ำอัตโนมัติ (มติ 2 at-most-once)
// 🔴 ไม่มีชื่อ LINE / externalUserId / ห้องแชท / ลิงก์ห้องแชท ในจอ (CD-P37U-8) · เวลาวาดหลัง mount (now) · ไม่มีข้อความไทยนอก t() · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { requestChatPaymentAction } from "@/lib/modules/pos/chat-link-actions";
import { registerMemberBenefitsAction } from "@/lib/modules/pos/register-actions";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import type { OrderDetail } from "@/lib/modules/pos/order-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock } from "./orders-ui";

export type ChatPayTarget = { systemId: string; unitId: string; deviceId?: string; promptpayConfigured: boolean; onDone: () => void };
type Result = Awaited<ReturnType<typeof requestChatPaymentAction>>;

/** ออเดอร์แชทของร้าน (ไม่ใช่แพลตฟอร์ม) — แผงนี้มีบล็อกแชท */
export const isChatOrder = (d: Pick<OrderDetail, "channel">) => d.channel.adapter === "CHAT" && d.channel.payout !== "PLATFORM";

export function ChatPayBlock({ d, target, canAccept, canCreate, busy, now }: { d: OrderDetail; target: ChatPayTarget; canAccept: boolean; canCreate: boolean; busy: boolean; now: number | null }) {
  const t = useTranslations("pos.orders");
  const tpos = useTranslations("pos");
  const tr = useTranslations("pos.register");
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const eligible = d.status === "NEW" && (d.paymentState === "UNPAID" || d.paymentState === "PAY_ON_PICKUP");
  if (!eligible && !res) return null;
  const reason = !(canAccept && canCreate) ? t("chatPay.needPerm") : !d.chatConversationId ? t("chatPay.errors.noChatLink") : !target.promptpayConfigured ? t("chatPay.errors.promptpayNotConfigured") : null;

  const send = async () => {
    if (sending || busy || reason) return;
    setSending(true);
    setCopied(false);
    try {
      setRes(await requestChatPaymentAction({ systemId: target.systemId, unitId: target.unitId, ...(target.deviceId ? { deviceId: target.deviceId } : {}), orderId: d.id }));
    } catch {
      setRes({ ok: false, code: "UNKNOWN", message: "" });
    } finally {
      setSending(false);
      target.onDone(); // โหลดออเดอร์ใหม่ (โน้ตรอชำระของเดิมขึ้นเอง)
    }
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const payBy = d.prepay?.payBy && now !== null ? t("chatPay.payBy", { time: bkkClock(d.prepay.payBy) }) : null;

  return (
    <section data-testid="pos-ord-chatpay" className="flex flex-col gap-2 border-b px-5 py-3 text-[12.5px]">
      {eligible && (
        <>
          <button
            type="button"
            data-testid="pos-ord-chatpay-send"
            disabled={busy || sending || !!reason}
            title={reason ?? undefined}
            className="btn btn-ghost h-12 rounded-[14px] text-[14px] font-bold disabled:opacity-50"
            onClick={() => void send()}
          >
            <RegisterIcon name="mail" size={14} />
            {t("chatPay.send")}
          </button>
          {reason ? (
            <p data-testid="pos-ord-chatpay-reason" className="text-[12px] text-[color:var(--color-muted)]">
              {reason}
            </p>
          ) : null}
        </>
      )}
      {res ? (
        res.ok ? (
          <div data-testid="pos-ord-chatpay-result" data-sent={res.sent ? "1" : "0"} data-duplicated={res.duplicated ? "1" : "0"} role="status" className="flex flex-col gap-1.5">
            <p className={`font-bold ${res.sent || res.duplicated ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`}>
              {res.duplicated ? t("chatPay.duplicated") : res.sent ? t("chatPay.sent") : t("chatPay.notSent")}
              {res.sent && !res.duplicated && payBy ? ` · ${payBy}` : ""}
            </p>
            {!res.sent && !res.duplicated && res.statusUrl ? (
              <button type="button" data-testid="pos-ord-chatpay-copy" className="btn btn-ghost h-11 self-start rounded-[12px] px-4 text-[13px]" onClick={() => void copy(res.statusUrl)}>
                <RegisterIcon name={copied ? "check" : "doc"} size={13} />
                {copied ? t("chatPay.copied") : t("chatPay.copy")}
              </button>
            ) : null}
          </div>
        ) : (
          <p data-testid="pos-ord-chatpay-result" role="alert" className="font-bold text-[color:var(--color-danger)]">
            {"messageKey" in res && res.messageKey ? tpos(res.messageKey) : tr(refusalMessageKey(res.code))}
          </p>
        )
      ) : null}
    </section>
  );
}

// ═══════ POS P3.7U ▸ CD-P37U-6 (UI-13): ชื่อสมาชิก · ระดับ บนแผงออเดอร์ — registerMemberBenefitsAction ครั้งเดียวต่อการเปิดแผง ◂ ═══════
//   แสดงเฉพาะชื่อ + ชื่อระดับ (ไม่มีเบอร์ · แต้ม · บัตรกำนัล) · ปฏิเสธ/ยังโหลด = ข้อความเดิม detail.isMember
export function MemberTierText({ target, memberId }: { target: Pick<ChatPayTarget, "systemId" | "unitId" | "deviceId">; memberId: string }) {
  const t = useTranslations("pos.orders");
  const [m, setM] = useState<{ name: string; tier: string | null } | null>(null);
  const { systemId, unitId, deviceId } = target;
  useEffect(() => {
    let live = true;
    setM(null);
    void registerMemberBenefitsAction({ systemId, unitId, ...(deviceId ? { deviceId } : {}), memberId, cart: { lines: [] } })
      .then((r) => {
        if (live && r.ok) setM({ name: r.member.name, tier: r.member.tier?.name ?? null });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวต่อสมาชิกของแผงที่เปิด (deviceId มาหลัง mount ไม่ต้องอ่านซ้ำ)
  }, [systemId, unitId, memberId]);
  if (!m) return <span className="text-[color:var(--color-muted)]">{t("detail.isMember")}</span>;
  return (
    <span data-testid="pos-ord-member-tier" className="min-w-0 truncate text-right font-bold">
      {m.tier ? t("detail.memberTier", { name: m.name, tier: m.tier }) : m.name}
    </span>
  );
}
