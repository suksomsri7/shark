"use client";

// MemberPanel.tsx — แผงสมาชิกด้านขวา (POS P1.12U มติ 4–5 · ภาพ 14A) · โครงเดียวกับลิ้นชักบิลที่พัก (HeldBillsDrawer): ≥ md แผงขวาเต็มสูง · < md แผ่นล่าง
//   หัว: ไอคอน + "สมาชิก" + "ผูกกับบิลนี้" (จาง) + ✕
//   โหมดมีสมาชิกแล้ว (เปิดจากการ์ดสมาชิก): การ์ดสมาชิก (+ ถอด) → "รางวัลรอรับ" (R13 · ส่งมอบ → ส่งมอบแล้ว ค้างไว้จนปิดแผง) แล้วต่อด้วยค้น/สมัคร (เปลี่ยนคน)
//   ค้น: ช่องค้น (โฟกัสเอง · หน่วง 250ms → registerMemberLookupAction) + "พบ N รายชื่อ" ในช่อง · คำค้นสั้นเกิน = ไม่แสดงอะไร · ยาวพอแต่ไม่เจอ = "ไม่พบสมาชิก"
//     Enter = ผูกเมื่อเจอคนเดียว (เครื่องสแกนแบบพิมพ์ที่ยิงบัตร SHARK-MC: ลงช่องนี้ก็ผูกได้ทางเดียวกัน) · ปุ่ม "สแกน QR สมาชิก" = กล้อง (P1.4)
//   แถว: วงกลมอักษรแรก · ชื่อหนา · "089-xxx-5521 · ซื้อล่าสุด 3 วันก่อน" · ป้ายระดับ (สีจาก tier.color · ไม่มี = "ทั่วไป" เทา) · แต้มชิดขวา
//     ถูกระงับ = จาง แตะไม่ได้ ป้าย "ถูกระงับ" · แถวของสมาชิกที่ผูกอยู่ = ขอบซ้ายฟ้า + พื้นอ่อน · แตะ = ผูก + ปิด
//   เส้นคั่น "ไม่พบ? สมัครใหม่ใช้เวลา 20 วินาที" → QuickRegisterForm
// 🔴 เบอร์ที่แสดงเป็นแบบปิดบังเสมอ (phoneMasked · CD8) · ไม่มีข้อความไทยนอกคอมเมนต์

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatShortDate } from "@/lib/ui/date";
import { refusalMessageKey, type RegisterMemberBenefits, type RegisterMemberItem } from "@/lib/modules/pos/register-shared";
import { digitsOnlyQuery, memberAgo, memberInitial, tierBadgeColor } from "@/lib/modules/pos/register-member-shared";
import { registerFulfilRewardAction, registerMemberLookupAction } from "@/lib/modules/pos/register-actions";
import { RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";
// ชื่อลงท้าย Form = ตัวสแกนปุ่ม (F15.3) นับเป็นคอมโพเนนต์กดได้ ⇒ ชื่อแฝงตอนวาง (ช่อง/ปุ่มข้างในมี testid ครบแล้ว)
import { QuickRegisterForm as QuickRegister } from "./QuickRegisterForm";

/** คำค้นยาวพอที่เซิร์ฟเวอร์จะค้นจริง (R2: ตัวเลข ≥ 3 หลัก · อื่น ๆ ≥ 2 ตัว) — สั้นกว่านี้ = ไม่แสดง "ไม่พบ" */
const searchable = (q: string) => {
  const s = q.trim();
  const d = digitsOnlyQuery(s);
  return d !== null ? d.length >= 3 : Array.from(s).length >= 2;
};

export function MemberPanel(p: {
  systemId: string;
  unitId: string;
  /** สมาชิกที่ผูกกับบิลอยู่ · มีค่า = โหมดมีสมาชิกแล้ว (การ์ด + รางวัลรอรับ) */
  attached: RegisterMemberItem | null;
  /** สิทธิ์ของสมาชิกที่ผูก (รางวัลรอรับ) · null = กำลังโหลด */
  benefits: RegisterMemberBenefits | null;
  formKey: string;
  frozen: boolean;
  /** toast = คีย์ใต้ pos.member (ผูกแล้ว · สมัครแล้ว · มีเบอร์นี้แล้ว) */
  onAttach: (m: RegisterMemberItem, toast: { key: string; values?: Record<string, string | number> }) => void;
  onDetach: () => void;
  onScan: () => void;
  onFulfilled: () => void;
  onClose: () => void;
  /** fix รอบ 1 F5: ฟอร์มสมัครด่วนขอคีย์ใหม่ (เบอร์/ชื่อเปลี่ยนหลังส่งไม่สำเร็จ) */
  onRekey: () => void;
}) {
  const t = useTranslations("pos.member");
  const tr = useTranslations("pos.register");
  const locale = useLocale(); // fix รอบ 1 F6: วันหมดอายุตามภาษาของจอ
  const [q, setQ] = useState("");
  const [items, setItems] = useState<RegisterMemberItem[] | null>(null);
  const [itemsFor, setItemsFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** รางวัลที่ส่งมอบแล้วในการเปิดแผงครั้งนี้ (ค้าง "ส่งมอบแล้ว" จนปิด) · กำลังส่ง · ข้อผิดพลาดต่อรายการ */
  const [fulfilled, setFulfilled] = useState<Set<string>>(() => new Set());
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [fulfilErr, setFulfilErr] = useState<{ id: string; msg: string } | null>(null);
  const [rewards, setRewards] = useState(p.benefits?.rewardsPending ?? null);
  useEffect(() => {
    // รายการรางวัลแรกที่ได้ค้างไว้ (ส่งมอบแล้วไม่หายจากแผงจนปิด — มติ 5)
    if (p.benefits && p.attached && p.benefits.member.id === p.attached.id) {
      setRewards((cur) => {
        const fresh = p.benefits!.rewardsPending;
        if (!cur) return fresh;
        const keep = cur.filter((r) => fulfilled.has(r.redemptionId) && !fresh.some((f) => f.redemptionId === r.redemptionId));
        return [...fresh, ...keep];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้น = benefits ใหม่
  }, [p.benefits, p.attached?.id]);

  useEffect(() => {
    // โฟกัสช่องค้นทุกครั้งที่เปิด (เครื่องสแกนแบบพิมพ์ยิงบัตรลงช่องนี้ได้ทันที)
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // ── ค้น: หน่วง 250ms · คำตอบเก่าทิ้งด้วยตัวนับ ──
  useEffect(() => {
    const term = q.trim();
    const my = ++seq.current;
    if (!term) {
      setItems(null);
      setItemsFor("");
      setSearching(false);
      setLookupErr(null);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await registerMemberLookupAction({ systemId: p.systemId, unitId: p.unitId, q: term });
        if (my !== seq.current) return;
        if (r.ok) {
          setItems(r.items);
          setItemsFor(term);
          setLookupErr(null);
        } else {
          setItems([]);
          setItemsFor(term);
          setLookupErr(tr(refusalMessageKey(r.code)));
        }
      } catch {
        if (my === seq.current) setLookupErr(tr("errors.loadFailed"));
      } finally {
        if (my === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q, p.systemId, p.unitId, tr]);

  const shown = items && itemsFor === q.trim() ? items : null;
  const pickRow = (m: RegisterMemberItem) => {
    if (m.suspended || p.frozen) return;
    p.onAttach(m, { key: "panel.attachedToast", values: { name: m.name } });
  };
  const fulfil = async (redemptionId: string) => {
    if (!p.attached || fulfilling) return;
    setFulfilling(redemptionId);
    setFulfilErr(null);
    try {
      const r = await registerFulfilRewardAction({ systemId: p.systemId, unitId: p.unitId, memberId: p.attached.id, redemptionId });
      if (r.ok) {
        setFulfilled((s) => new Set(s).add(redemptionId));
        p.onFulfilled();
      } else setFulfilErr({ id: redemptionId, msg: tr(refusalMessageKey(r.code)) });
    } catch {
      setFulfilErr({ id: redemptionId, msg: tr("errors.unknown") });
    } finally {
      setFulfilling(null);
    }
  };

  const tierBadge = (m: RegisterMemberItem) => {
    // fix รอบ 1 F7: สีที่ไม่ใช่ hex = ป้ายเทาแบบ "ทั่วไป" (ชื่อระดับคงเดิม)
    const color = m.tier ? tierBadgeColor(m.tier.color) : null;
    return m.suspended ? (
      <span className="shrink-0 rounded-[8px] border border-[color:var(--color-danger)] px-2 py-0.5 text-[12px] font-semibold text-[color:var(--color-danger)]">{t("panel.suspended")}</span>
    ) : m.tier && color ? (
      <span
        className="shrink-0 rounded-[8px] border px-2 py-0.5 text-[12px] font-semibold"
        style={{ borderColor: color, color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        {m.tier.name}
      </span>
    ) : m.tier ? (
      <span className="shrink-0 rounded-[8px] border px-2 py-0.5 text-[12px] text-[color:var(--color-muted)]">{m.tier.name}</span>
    ) : (
      <span className="shrink-0 rounded-[8px] border px-2 py-0.5 text-[12px] text-[color:var(--color-muted)]">{t("chip.general")}</span>
    );
  };
  const subLine = (m: RegisterMemberItem) => {
    const ago = m.lastPurchaseAt ? memberAgo(m.lastPurchaseAt) : null;
    const when = ago ? t("panel.lastPurchase", { when: t(`panel.ago.${ago.key}`, { count: ago.count }) }) : t("panel.never");
    return [m.phoneMasked, when].filter(Boolean).join(" · ");
  };
  const avatar = (m: RegisterMemberItem, on: boolean) => (
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-[12px] border text-[15px] font-bold ${on ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : "bg-[color:var(--color-surface-2)]"}`}
    >
      {memberInitial(m.name)}
    </span>
  );

  const prefill = digitsOnlyQuery(q);
  const list = shown ?? [];
  return (
    <RegisterDialog onDismiss={p.onClose}>
      <aside
        data-testid="pos-member-panel"
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[500px] md:max-w-full md:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-label={t("panel.title")}
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="users" size={20} />
          <h2 className="text-[19px] font-bold">{t("panel.title")}</h2>
          <span className="text-[13px] text-[color:var(--color-muted)]">{t("panel.subtitle")}</span>
          <span className="flex-1" />
          <button
            data-testid="pos-member-panel-close"
            className="grid size-11 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("panel.close")}
            onClick={p.onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </header>

        {/* fix รอบ 1 V1/V2: ตัวเลื่อน = เนื้อแผง (หัวแผงค้าง) · ข้างในเป็นคอลัมน์ธรรมดา — ถ้าเนื้อแผงเป็น flex คอลัมน์เอง ลูกที่ overflow-hidden (รายชื่อ ·
            รางวัล) ถูกบีบเหลือ 0 เมื่อเนื้อเกินความสูงแผ่นล่าง 88dvh (มือถือ) ⇒ แถวสมาชิกหาย/แตะไม่ได้ · overscroll-contain = หน้าหลังไม่เลื่อนตาม */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-7">
          <div className="flex flex-col gap-4">
            {/* ── โหมดมีสมาชิกแล้ว (มติ 5): การ์ด + รางวัลรอรับ ── */}
            {p.attached && (
              <section data-testid="pos-member-panel-attached" className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-[16px] border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-4 py-3">
                  {avatar(p.attached, true)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">{p.attached.name}</div>
                    <div className="truncate text-[12.5px] text-[color:var(--color-muted)]">{subLine(p.attached)}</div>
                  </div>
                  {tierBadge(p.attached)}
                  <button
                    data-testid="pos-member-panel-detach"
                    className="h-11 shrink-0 px-1 text-[12.5px] text-[color:var(--color-muted)] underline underline-offset-2 disabled:opacity-50"
                    type="button"
                    disabled={p.frozen}
                    onClick={p.onDetach}
                  >
                    {t("chip.detach")}
                  </button>
                </div>
                <h3 className="text-[14px] font-bold">{t("panel.rewardsPending")}</h3>
                {rewards === null ? (
                  <p className="text-[13.5px] text-[color:var(--color-muted)]">{t("panel.searching")}</p>
                ) : rewards.length === 0 ? (
                  <p data-testid="pos-member-rewards-empty" className="text-[13.5px] text-[color:var(--color-muted)]">
                    {t("panel.noRewards")}
                  </p>
                ) : (
                  <ul className="overflow-hidden rounded-[14px] border" aria-label={t("panel.rewardsPending")}>
                    {rewards.map((r) => {
                      const done = fulfilled.has(r.redemptionId);
                      return (
                        <li key={r.redemptionId} className="flex flex-col gap-1 border-b px-4 py-2.5 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14.5px] font-semibold">{r.rewardName}</div>
                              <div className="text-[12.5px] text-[color:var(--color-muted)]">
                                {r.expiresAt ? t("panel.expires", { date: formatShortDate(r.expiresAt, locale) }) : t("panel.noExpiry")}
                              </div>
                            </div>
                            {done ? (
                              <span data-testid={`pos-member-fulfilled-${r.redemptionId}`} className="flex shrink-0 items-center gap-1 text-[13.5px] font-bold">
                                <RegisterIcon name="check" size={14} />
                                {t("panel.fulfilled")}
                              </span>
                            ) : (
                              <button
                                data-testid={`pos-member-fulfil-${r.redemptionId}`}
                                className="btn btn-ghost h-11 shrink-0 rounded-[12px] px-4 text-[14px] disabled:opacity-50"
                                type="button"
                                disabled={!!fulfilling || p.frozen}
                                onClick={() => void fulfil(r.redemptionId)}
                              >
                                {fulfilling === r.redemptionId ? t("panel.fulfilling") : t("panel.fulfil")}
                              </button>
                            )}
                          </div>
                          {fulfilErr?.id === r.redemptionId && (
                            <p data-testid="pos-member-fulfil-error" className="text-[13px] text-[color:var(--color-danger)]" role="alert">
                              {fulfilErr.msg}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <h3 className="mt-2 text-[14px] font-bold">{t("panel.switchTitle")}</h3>
              </section>
            )}

            {/* ── ค้น + สแกน ── */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex h-[52px] min-w-0 shrink-0 items-center gap-2.5 rounded-[14px] border-[1.5px] border-[color:var(--color-ink)] px-4 sm:flex-1">
                <RegisterIcon name="search" size={16} className="shrink-0 text-[color:var(--color-ink-soft)]" />
                <input
                  data-testid="pos-member-search"
                  ref={inputRef}
                  className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none placeholder:font-normal placeholder:text-[color:var(--color-muted)]"
                  autoComplete="off"
                  autoFocus
                  aria-label={t("panel.searchLabel")}
                  placeholder={t("panel.searchPlaceholder")}
                  value={q}
                  maxLength={200}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    const one = shown && shown.length === 1 ? shown[0] : null;
                    if (one) pickRow(one);
                  }}
                />
                {shown && shown.length > 0 && (
                  <span data-testid="pos-member-found" className="shrink-0 whitespace-nowrap text-[13px] text-[color:var(--color-muted)]">
                    {t("panel.found", { count: shown.length })}
                  </span>
                )}
              </label>
              <button
                data-testid="pos-member-scan"
                className="btn btn-ghost h-[52px] shrink-0 gap-2 rounded-[14px] px-5 text-[15px] disabled:opacity-50"
                type="button"
                disabled={p.frozen}
                onClick={p.onScan}
              >
                <RegisterIcon name="qr" size={16} />
                {t("panel.scanQr")}
              </button>
            </div>

            {lookupErr && (
              <p data-testid="pos-member-lookup-error" className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
                {lookupErr}
              </p>
            )}
            {searching && !shown && <p className="text-[13.5px] text-[color:var(--color-muted)]">{t("panel.searching")}</p>}
            {shown && shown.length === 0 && !lookupErr && searchable(q) && (
              <p data-testid="pos-member-empty" className="py-2 text-center text-[14px] text-[color:var(--color-muted)]">
                {t("panel.empty")}
              </p>
            )}
            {list.length > 0 && (
              <div className="overflow-hidden rounded-[14px] border" role="list" aria-label={t("panel.title")}>
                {list.map((m) => {
                  const on = p.attached?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      data-testid={`pos-member-row-${m.id}`}
                      className={`flex min-h-16 w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 disabled:cursor-not-allowed ${
                        on ? "border-l-[3px] border-l-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" : ""
                      } ${m.suspended ? "opacity-55" : "hover:bg-[color:var(--color-surface-2)]"}`}
                      type="button"
                      role="listitem"
                      aria-disabled={m.suspended || undefined}
                      disabled={m.suspended || p.frozen}
                      onClick={() => pickRow(m)}
                    >
                      {avatar(m, on)}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-bold">{m.name}</span>
                        <span className="truncate text-[12.5px] text-[color:var(--color-muted)]">{subLine(m)}</span>
                      </span>
                      {tierBadge(m)}
                      <span className="flex w-14 shrink-0 flex-col items-end leading-tight">
                        <span className="text-[15px] font-bold tabular-nums">{m.points.toLocaleString("th-TH")}</span>
                        <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("panel.pointsUnit")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── สมัครใหม่ ── */}
            <div className="flex items-center gap-3 text-[13.5px] font-bold text-[color:var(--color-ink-soft)]">
              <span className="h-px flex-1 bg-[color:var(--color-line)]" />
              {t("panel.divider")}
              <span className="h-px flex-1 bg-[color:var(--color-line)]" />
            </div>
            <QuickRegister
              systemId={p.systemId}
              unitId={p.unitId}
              prefillPhone={prefill}
              formKey={p.formKey}
              frozen={p.frozen}
              onRekey={p.onRekey}
              onDone={(r) =>
                p.onAttach(r.member, r.created ? { key: "register.registered", values: { name: r.member.name } } : { key: "register.existing" })
              }
            />
          </div>
        </div>
      </aside>
    </RegisterDialog>
  );
}
