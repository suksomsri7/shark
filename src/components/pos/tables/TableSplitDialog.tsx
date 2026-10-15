"use client";

// TableSplitDialog.tsx — แผง "แยกบิล" ของโต๊ะ (POS P2.5U · ภาพ 15B รายรายการ + 15C หารเท่า/ตามที่นั่ง · มติผู้คุม 2–7 9 11)
//   หัว "แยกบิล · โต๊ะ A5 · ฿1,364" + ชิป "4 คน · คุณวิภา · Silver" · แท็บ รายรายการ · หารเท่า · ตามที่นั่ง (mode)
//   รายรายการ (15B): ซ้าย = รายการทั้งหมด (แตะ "บิล n" = ทั้งรายการไปบิลนั้น · จำนวน > 1 แบ่งได้ในป๊อปโอเวอร์) · ขวา = การ์ดบิล (สมาชิก · รายการ · รวม/ค่าบริการ/สุทธิ)
//   หารเท่า (15C ซ้าย): สเต็ปเปอร์ "− N คน +" (2–20) · "N คน × ฿x" · การ์ดบิลพร้อมสถานะ (✓ วิธีจ่าย · กำลังชำระ · รอชำระ)
//   ตามที่นั่ง (15C ขวา): ชิปที่นั่ง 1…N · กลางโต๊ะ · แตะรายการแล้วแตะที่นั่ง (หรือปุ่มต่อรายการ) · แถว "ที่นั่ง n · รายการ ฿x" + "กลางโต๊ะ … ที่นั่งละ ฿y"
//   บันทึก = registerSplitTableAction (สร้าง: expectedItemsHash = quote ทั้งโต๊ะ · แทน: splitId + expectedVersion) · ยกเลิก = registerCancelSplitAction (ยืนยันก่อน)
//   ชำระบิล n = บันทึก (ถ้ายังไม่บันทึก/มีแก้) แล้ว onPay(ใบ) → จอชำระเดิม (TableCheckout ใบแยกบิล) · ใบรายการรายบิล = TablePreBillDialog (tableSplitPartId)
//   ล็อก (มีใบจ่ายแล้ว): แท็บ/การระบุ/สเต็ปเปอร์/สมาชิกปิด · ไม่มีปุ่มยกเลิก · คำใบ้ "แผนล็อกแล้ว…" · รายการนอกแผน = แถบ "รายการใหม่หลังแยกบิล N…"
// 🔴 เงิน: พรีวิว = allocateTableSplit (บริสุทธิ์ · table-split-ui) · บันทึกแล้ว = SplitPlanView ของเซิร์ฟเวอร์ (ชนะเสมอ) · ยอดรายการ = lineTotalSatang ของแผงโต๊ะ
// 🔴 "use client": import ได้แค่ *-shared · *-actions (G9) · ข้อความทั้งหมดผ่าน t() (ST7) · ปุ่ม ≥ 44px · โทเคนสีเท่านั้น

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText, refusalMessageKey, type RegisterMemberItem, type RegisterQuote } from "@/lib/modules/pos/register-shared";
import type { RegisterTableDetailResult } from "@/lib/modules/pos/table-shared";
import { allocateTableSplit, type SplitPlanPartView, type SplitPlanView, type TableSplitMode } from "@/lib/modules/pos/table-split-shared";
import { registerCancelSplitAction, registerSplitDetailAction, registerSplitTableAction } from "@/lib/modules/pos/table-split-actions";
import { registerMemberLookupAction } from "@/lib/modules/pos/register-actions";
import { billDetailAction } from "@/lib/modules/pos/bills-actions";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import type { TableToast } from "./TableCheckout";
import { TablePreBillDialog } from "./TablePreBillDialog";
import {
  addPart,
  allocationsOf,
  assignQty,
  assignWhole,
  draftFromPlan,
  emptyDraft,
  emptyParts,
  memberOfPart,
  nextOpenPart,
  partsOf,
  planItemIds,
  previewOf,
  removePart,
  sameAsPlan,
  setPartCount,
  SHARED,
  singlePart,
  splitItemsOf,
  unassignedItems,
  type SplitDraft,
  type SplitItemRow,
  type SplitPayPart,
} from "./table-split-ui";

type Detail = Extract<RegisterTableDetailResult, { ok: true }>;
type PartView = { no: number; base: number; service: number; total: number; lines: { key: string; name: string; qty: number | null; amount: number }[] };
type Sub = { kind: "qty"; itemId: string } | { kind: "member"; partNo: number } | { kind: "cancel" } | { kind: "prebill"; partId: string } | null;

const TABS: { mode: TableSplitMode; id: "items" | "equal" | "seat"; label: string }[] = [
  { mode: "ITEM", id: "items", label: "split.tabs.item" },
  { mode: "EQUAL", id: "equal", label: "split.tabs.equal" },
  { mode: "SEAT", id: "seat", label: "split.tabs.seat" },
];
const PAY_LABEL: Record<string, string> = { CASH: "pay.cash", PROMPTPAY: "pay.promptpay", TRANSFER: "pay.transfer", CARD: "pay.card", PLATFORM: "pay.platform", GIFT_CARD: "pay.giftCard", STORE_CREDIT: "pay.storeCredit" };
const pct = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

type Props = {
  systemId: string;
  unitId: string;
  deviceId?: string;
  sessionId: string;
  tableName: string;
  /** แผงโต๊ะของ session นี้ (รายการ · ลูกค้า · สมาชิก · split) */
  detail: Detail;
  /** quote ทั้งโต๊ะ (ยังไม่มีแผน) — itemsHash ของการสร้างแผน (มติ 5) */
  quote: RegisterQuote | null;
  serviceChargeBp: number;
  /** pos.sale.create (บันทึก/ยกเลิก/ชำระ) */
  canSell: boolean;
  /** เหตุผลที่ชำระไม่ได้ (กะ · PIN · ออฟไลน์ · สิทธิ์) — null = ชำระได้ */
  payBlock: React.ReactNode | null;
  /** ใบที่เลือกตอนเปิด (กลับจากจอชำระ = ใบถัดไปที่ยังไม่จ่าย) */
  focusPart: number | null;
  /** เครื่องพิมพ์ของเครื่องนี้ + ภาษา (ใบรายการรายบิล) */
  printer: { config: PosPrinterConfig; deviceCode: string | undefined };
  locale: "th" | "en";
  onPay: (part: SplitPayPart) => void;
  onToast: (m: TableToast) => void;
  /** แผนเปลี่ยน (บันทึก/ยกเลิก/โหลดใหม่) — ผู้เรียกโหลดผัง/แผงใหม่ */
  onChanged: () => void;
  onClose: () => void;
};

export function TableSplitDialog(p: Props) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const target = useMemo(() => ({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}) }), [p.systemId, p.unitId, p.deviceId]);
  const sessionMember = p.detail.session.member;
  const guests = p.detail.session.guestCount;

  // ═══════ แผนของโต๊ะ ═══════
  const [plan, setPlan] = useState<SplitPlanView | null | undefined>(undefined);
  const [outside, setOutside] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<SplitDraft>(() => emptyDraft("ITEM", guests));
  const [selected, setSelected] = useState<number | null>(p.focusPart);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [seatPick, setSeatPick] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() => (sessionMember ? { [sessionMember.id]: sessionMember.name || "" } : {}));
  const [methods, setMethods] = useState<Record<string, string>>({});
  const loadSeq = useRef(0);

  const load = useCallback(
    async (focus?: number | null) => {
      const seq = ++loadSeq.current;
      try {
        const r = await registerSplitDetailAction({ ...target, tableSessionId: p.sessionId });
        if (seq !== loadSeq.current) return;
        if (!r.ok) {
          setLoadErr(refusalMessageKey(r.code));
          setPlan(null);
          return;
        }
        setLoadErr(null);
        const open = r.split && r.split.status === "OPEN" ? r.split : null; // แผน DONE = ไม่ใช่แผนที่แก้/จ่ายได้ (รายการใหม่สร้างแผนใหม่ได้)
        setPlan(open);
        setOutside(open ? r.outsideItemIds : []);
        if (open) {
          setDraft(draftFromPlan(open));
          setSelected((cur) => {
            const want = focus !== undefined ? focus : cur;
            return want && open.parts.some((x) => x.no === want && x.status !== "PAID") ? want : nextOpenPart(open);
          });
        } else {
          setDraft((d) => (d.mode === "ITEM" && !Object.keys(d.assign).length ? d : emptyDraft("ITEM", guests)));
          setSelected(1);
        }
      } catch {
        if (seq === loadSeq.current) {
          setLoadErr("errors.loadFailed");
          setPlan(null);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- guests อ่านค่าตอนโหลด
    [target, p.sessionId],
  );
  useEffect(() => {
    void load(p.focusPart);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งแรกตอนเปิด
  }, []);

  // วิธีจ่ายของใบที่จ่ายแล้ว (มติ 3) = ลิ้นชักบิล billDetailAction(saleId).payments — ทีละใบที่ยังไม่รู้
  useEffect(() => {
    const paid = (plan?.parts ?? []).filter((x) => x.status === "PAID" && x.saleId && !(x.saleId in methods));
    if (!paid.length) return;
    let live = true;
    void (async () => {
      for (const x of paid) {
        try {
          const r = await billDetailAction({ systemId: p.systemId, unitId: p.unitId, saleId: x.saleId! });
          if (!live) return;
          const types = r.ok ? [...new Set(r.bill.payments.map((m) => m.type))] : [];
          setMethods((m) => ({ ...m, [x.saleId!]: types.map((ty) => (PAY_LABEL[ty] ? tr(PAY_LABEL[ty]) : ty)).join(" + ") }));
        } catch {
          if (live) setMethods((m) => ({ ...m, [x.saleId!]: "" }));
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้น = ใบที่จ่ายแล้วของแผน
  }, [plan]);

  // ═══════ รายการ · พรีวิว ═══════
  const itemIds = useMemo(() => (plan ? planItemIds(plan, p.detail.unpaidItemIds) : p.detail.unpaidItemIds), [plan, p.detail.unpaidItemIds]);
  const items = useMemo(() => splitItemsOf(p.detail, itemIds), [p.detail, itemIds]);
  const locked = !!plan && plan.parts.some((x) => x.status === "PAID");
  const clean = sameAsPlan(draft, plan ?? null);
  const preview = useMemo(() => previewOf(draft, items, p.serviceChargeBp), [draft, items, p.serviceChargeBp]);
  const unassigned = unassignedItems(draft, items);
  const empties = emptyParts(draft);
  /** การ์ดต่อบิล: แผนที่บันทึกแล้วและไม่มีแก้ = ค่าของเซิร์ฟเวอร์ · ไม่งั้น = พรีวิว (ระบุครบ) · ไม่ครบ = รายการอย่างเดียว */
  const parts: (PartView | null)[] = useMemo(() => {
    const out: (PartView | null)[] = [];
    for (let n = 1; n <= draft.partCount; n++) {
      if (plan && clean) {
        const pp = plan.parts.find((x) => x.no === n);
        out.push(pp ? { no: n, base: pp.baseSatang, service: pp.serviceChargeSatang, total: pp.totalSatang, lines: pp.lines.map((l, i) => ({ key: `${l.itemId}-${i}`, name: l.name, qty: l.qty, amount: l.amountSatang })) } : null);
      } else if (preview && preview.ok) {
        const pp = preview.parts[n - 1];
        out.push(
          pp
            ? {
                no: n,
                base: pp.baseSatang,
                service: pp.serviceChargeSatang,
                total: pp.totalSatang,
                lines: pp.lines.map((l, i) => {
                  const it = items.find((x) => x.id === l.itemId);
                  return { key: `${l.itemId}-${i}`, name: l.qty === null && it ? `${it.name} (${l.shareNum}/${l.shareDen})` : (it?.name ?? ""), qty: l.qty, amount: l.amountSatang };
                }),
              }
            : null,
        );
      } else out.push(null);
    }
    return out;
  }, [draft.partCount, plan, clean, preview, items]);
  /** ยอดทั้งโต๊ะ (หัว · ท้าย): แผนที่บันทึก = ของเซิร์ฟเวอร์ · ยังไม่มีแผน = ตัวแบ่งบริสุทธิ์แบบหารเท่าบนทุกรายการ (ฐาน + ค่าบริการครั้งเดียว · เท่ากับยอดของแผนทุกแบบ) */
  const whole = useMemo(() => {
    if (!items.length) return null;
    const r = allocateTableSplit({ mode: "EQUAL", partCount: 2, items: items.map((i) => ({ id: i.id, qty: i.qty, unitSatang: i.unitSatang })), serviceChargeBp: p.serviceChargeBp });
    return r.ok ? r : null;
  }, [items, p.serviceChargeBp]);
  const planTotal = plan ? plan.totalSatang : (whole?.totalSatang ?? null);
  const itemsBase = plan ? plan.baseSatang : (whole?.baseSatang ?? null);
  const partOf = (n: number): SplitPlanPartView | null => plan?.parts.find((x) => x.no === n) ?? null;
  const remaining = p.detail.split?.remainingSatang ?? null;

  // ═══════ บันทึก · ยกเลิก · ชำระ ═══════
  const refused = async (code: string) => {
    if (code === "TABLE_SPLIT_EXISTS" || code === "TABLE_SPLIT_LOCKED" || code === "TABLE_SPLIT_PART_PAID" || code === "VERSION_CHANGED" || code === "TABLE_ITEMS_CHANGED" || code === "TABLE_SPLIT_NOT_FOUND") {
      // มติ 5: แผนมีอยู่แล้ว/ถูกแก้/รายการเปลี่ยน = โหลดแผน+แผงใหม่ แล้วแสดงแผนล่าสุด (ใบจ่ายแล้ว = ล็อก) พร้อม toast
      p.onToast({ key: refusalMessageKey(code), ns: "register" });
      p.onChanged();
      await load();
      return;
    }
    if (code === "TOO_MANY_LINES") return setErr(t("split.tooManyLines"));
    if (code === "TABLE_SESSION_CLOSED" || code === "TABLE_NOT_FOUND" || code === "TABLE_EMPTY") {
      p.onToast({ key: refusalMessageKey(code), ns: "register" });
      p.onChanged();
      return p.onClose();
    }
    if (code === "PERMISSION_DENIED") return p.onToast({ key: refusalMessageKey(code), ns: "register" });
    setErr(code === "VALIDATION" && unassigned.length ? t("split.unassigned") : tr(refusalMessageKey(code)));
  };
  /** บันทึกแผน (สร้าง/แทน) — คืนแผนใหม่ (สำเร็จ) หรือ null */
  const save = async (): Promise<SplitPlanView | null> => {
    if (busy || locked || !p.canSell) return null;
    if (clean && plan) return plan;
    if (unassigned.length || empties.length) {
      setErr(unassigned.length ? t("split.unassigned") : t("split.emptyBill"));
      return null;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await registerSplitTableAction({
        ...target,
        split: {
          tableSessionId: p.sessionId,
          mode: draft.mode,
          partCount: draft.partCount,
          expectedItemsHash: plan ? plan.itemsHash : (p.quote?.table?.itemsHash ?? p.detail.itemsHash),
          allocations: allocationsOf(draft, items),
          parts: Array.from({ length: draft.partCount }, (_, i) => ({ no: i + 1, memberId: memberOfPart(draft, i + 1, sessionMember?.id ?? null) })),
          ...(plan ? { splitId: plan.splitId, expectedVersion: plan.version } : {}),
        },
      });
      if (!r.ok) {
        await refused(r.code);
        return null;
      }
      setPlan(r.split);
      setOutside([]);
      setDraft(draftFromPlan(r.split));
      setSelected((cur) => (cur && cur <= r.split.partCount ? cur : 1));
      p.onChanged();
      return r.split;
    } catch {
      setErr(tr("errors.unknown"));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const saveOnly = async () => {
    const r = await save();
    if (r) p.onToast({ key: "split.saved", ns: "tables" });
  };
  const payPart = async (no: number) => {
    if (p.payBlock) return;
    const pl = clean && plan ? plan : await save();
    if (!pl) return;
    const part = pl.parts.find((x) => x.no === no);
    if (!part || part.status === "PAID") return;
    p.onPay({ partId: part.id, partNo: part.no, partCount: pl.partCount, memberId: part.memberId, memberName: part.memberId ? (names[part.memberId] ?? null) : null });
  };
  const cancelPlan = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await registerCancelSplitAction({ ...target, splitId: plan.splitId, expectedVersion: plan.version });
      setSub(null);
      if (!r.ok) return await refused(r.code);
      p.onToast({ key: "split.cancelled", ns: "tables" });
      setPlan(null);
      setDraft(emptyDraft("ITEM", guests));
      p.onChanged();
    } catch {
      setErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  // ═══════ Esc: กล่องย่อยก่อน → ปิดแผง ═══════
  const escRef = useRef({ sub, busy });
  escRef.current = { sub, busy };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (document.querySelector('[data-testid="pos-tbl-split-modal"]')?.parentElement?.closest("[inert]")) return; // แผงนี้อยู่ใต้ชั้นอื่น
      e.preventDefault();
      if (escRef.current.sub) setSub(null);
      else if (!escRef.current.busy) p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวจับเดียว
  }, []);

  // ═══════ วาด ═══════
  const total = planTotal;
  const memberLabel = (id: string | null) => (id ? names[id] || t("split.memberUnknown") : null);
  const chip = [guests ? t("split.people", { n: guests }) : "", sessionMember ? [sessionMember.name, sessionMember.tier].filter(Boolean).join(" · ") : ""].filter(Boolean).join(" · ");
  const editable = !locked && p.canSell && plan !== undefined;
  const seg = (on: boolean) =>
    `inline-flex h-11 min-w-[52px] shrink-0 items-center justify-center rounded-[10px] px-2.5 text-[13.5px] disabled:cursor-not-allowed ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"}`;
  const tab = (on: boolean) =>
    `-mb-px inline-flex h-12 shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-[14.5px] disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]" : "border-transparent text-[color:var(--color-ink-soft)]"}`;
  const selPart = selected && selected <= draft.partCount ? selected : null;
  const selPaid = selPart ? partOf(selPart)?.status === "PAID" : false;
  const selTotal = selPart ? (parts[selPart - 1]?.total ?? null) : null;

  const itemRow = (it: SplitItemRow) => {
    const one = singlePart(draft, it);
    const ps = partsOf(draft, it.id);
    const multi = ps.length > 1 || (ps.length === 1 && one === null);
    const missing = draft.mode !== "EQUAL" && unassigned.some((x) => x.id === it.id);
    const opts = draft.mode === "SEAT" ? [...Array.from({ length: draft.partCount }, (_, i) => i + 1), SHARED] : Array.from({ length: draft.partCount }, (_, i) => i + 1);
    const picked = seatPick === it.id;
    return (
      <li
        key={it.id}
        data-testid={`pos-tbl-split-row-${it.id}`}
        data-unassigned={missing ? "true" : undefined}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 last:border-b-0 ${missing ? "bg-[color:var(--color-surface-2)] shadow-[inset_3px_0_0_var(--color-danger)]" : ""} ${picked ? "outline outline-2 outline-offset-[-2px] outline-[color:var(--color-accent)]" : ""}`}
      >
        {draft.mode === "SEAT" ? (
          <button
            data-testid={`pos-tbl-split-pick-${it.id}`}
            type="button"
            disabled={!editable}
            aria-pressed={picked}
            className="flex min-h-11 min-w-0 flex-1 items-baseline gap-1.5 text-left disabled:cursor-default"
            onClick={() => setSeatPick((x) => (x === it.id ? null : it.id))}
          >
            <span className="truncate text-[14.5px] text-[color:var(--color-ink)]">{it.name}</span>
            {it.qty > 1 && <span className="shrink-0 text-[13px] text-[color:var(--color-muted)]">{`×${it.qty}`}</span>}
          </button>
        ) : (
          <span className="flex min-h-11 min-w-0 flex-1 items-baseline gap-1.5">
            <span className="truncate text-[14.5px] text-[color:var(--color-ink)]">{it.name}</span>
            {it.qty > 1 && <span className="shrink-0 text-[13px] text-[color:var(--color-muted)]">{`×${it.qty}`}</span>}
          </span>
        )}
        <span className="shrink-0 text-[14.5px] font-bold tabular-nums">{moneyText(it.lineSatang)}</span>
        {draft.mode !== "EQUAL" && (
          <span className="flex w-full min-w-0 items-center gap-1.5 md:w-auto">
            {it.qty > 1 && (
              <button
                data-testid={`pos-tbl-split-qty-${it.id}`}
                type="button"
                disabled={!editable}
                aria-label={t("split.splitQty")}
                className={
                  multi
                    ? "inline-flex h-11 min-w-0 items-center gap-1.5 truncate rounded-[10px] border border-dashed border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 text-[13px] font-bold text-[color:var(--color-accent)] disabled:cursor-default"
                    : "grid size-11 shrink-0 place-items-center rounded-[10px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                }
                onClick={() => setSub({ kind: "qty", itemId: it.id })}
              >
                {multi ? (
                  <>
                    <RegisterIcon name="list" size={12} />
                    <span className="truncate">{ps.map((n) => (n === SHARED ? `${t("split.shared")} ×${draft.assign[it.id]?.[n] ?? 0}` : t("split.qtyChip", { no: n, qty: draft.assign[it.id]?.[n] ?? 0 }))).join(" · ")}</span>
                  </>
                ) : (
                  <RegisterIcon name="arrow" size={13} />
                )}
              </button>
            )}
            {!multi && (
              <span role="group" aria-label={it.name} className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-[12px] border p-0.5 [scrollbar-width:none] md:max-w-[300px] [&::-webkit-scrollbar]:hidden">
                {opts.map((n) => (
                  <button
                    key={n}
                    data-testid={`pos-tbl-split-line-${it.id}-part-${n}`}
                    type="button"
                    disabled={!editable}
                    aria-pressed={one === n}
                    className={seg(one === n)}
                    onClick={() => setDraft((d) => assignWhole(d, it, n))}
                  >
                    {n === SHARED ? t("split.shared") : draft.mode === "SEAT" ? String(n) : t("split.bill", { no: n })}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
      </li>
    );
  };

  const billCard = (n: number, compact: boolean) => {
    const v = parts[n - 1];
    const sp = partOf(n);
    const paid = sp?.status === "PAID";
    const mid = plan && clean ? (sp?.memberId ?? null) : memberOfPart(draft, n, sessionMember?.id ?? null);
    const isSel = selPart === n;
    const empty = empties.includes(n);
    const status = paid ? `✓ ${(sp?.saleId && methods[sp.saleId]) || t("split.status.paid")}` : isSel ? t("split.status.paying") : t("split.status.open");
    return (
      <div
        key={n}
        data-testid={`pos-tbl-split-card-${n}`}
        data-status={paid ? "PAID" : isSel ? "SELECTED" : "OPEN"}
        className={`flex min-w-0 flex-col rounded-[16px] bg-[color:var(--color-surface)] ${isSel && !paid ? "border-[2px] border-[color:var(--color-ink)]" : "border"} ${empty ? "border-dashed" : ""} ${compact ? "w-[220px] shrink-0 snap-start md:w-auto" : ""}`}
      >
        <div className="flex items-start gap-2 px-4 pt-3">
          <button
            data-testid={`pos-tbl-split-select-${n}`}
            type="button"
            disabled={paid}
            aria-pressed={isSel}
            className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left disabled:cursor-default"
            onClick={() => setSelected(n)}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-bold text-[color:var(--color-ink)]">
              <span className="truncate">{[t("split.bill", { no: n }), memberLabel(mid)].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="mt-1 text-[24px] font-bold leading-tight tabular-nums">{v ? moneyText(v.total) : "—"}</span>
            <span className={`text-[12.5px] ${paid ? "font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]"}`}>
              {draft.mode === "EQUAL" || paid ? status : v && v.service > 0 ? t("split.includesService", { rate: pct(p.serviceChargeBp) }) : "\u00a0"}
            </span>
          </button>
          {!paid && empty && draft.partCount > 2 && editable && (
            <button data-testid={`pos-tbl-split-removePart-${n}`} type="button" aria-label={t("split.removeBill", { no: n })} className="grid size-11 shrink-0 place-items-center rounded-[10px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]" onClick={() => setDraft((d) => removePart(d, n))}>
              <RegisterIcon name="x" size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
          <button
            data-testid={`pos-tbl-split-member-${n}`}
            type="button"
            disabled={!editable || paid}
            className={`inline-flex h-11 min-w-0 max-w-full items-center gap-1.5 truncate rounded-[10px] px-2.5 text-[12.5px] disabled:cursor-default ${mid ? "border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] font-bold text-[color:var(--color-accent)]" : "border border-dashed text-[color:var(--color-ink-soft)]"}`}
            onClick={() => setSub({ kind: "member", partNo: n })}
          >
            <RegisterIcon name="users" size={12} />
            <span className="truncate">{mid ? t("split.memberPoints") : t("split.addMember")}</span>
          </button>
          {sp && clean && !paid && (
            <button
              data-testid={`pos-tbl-split-prebill-${n}`}
              type="button"
              disabled={busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12.5px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
              onClick={() => setSub({ kind: "prebill", partId: sp.id })}
            >
              <RegisterIcon name="print" size={12} />
              {t("split.preBill")}
            </button>
          )}
        </div>
        {draft.mode !== "EQUAL" && (
          <>
            <ul className="flex flex-col border-t px-4 py-2 text-[13.5px]">
              {v ? (
                v.lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-2 py-0.5">
                    <span className="min-w-0 truncate">{l.qty !== null && l.qty > 1 ? `${l.name} ×${l.qty}` : l.name}</span>
                    <span className="shrink-0 tabular-nums">{moneyText(l.amount)}</span>
                  </li>
                ))
              ) : (
                <li className="py-0.5 text-[12.5px] text-[color:var(--color-muted)]">{empty ? t("split.emptyBill") : t("split.unassigned")}</li>
              )}
            </ul>
            <div className="mt-auto flex flex-col border-t px-4 py-2 text-[13px]">
              <span className="flex justify-between text-[color:var(--color-ink-soft)]">
                <span>{t("split.subtotal")}</span>
                <span className="tabular-nums">{v ? moneyText(v.base) : "—"}</span>
              </span>
              {p.serviceChargeBp > 0 && (
                <span className="flex justify-between text-[color:var(--color-ink-soft)]">
                  <span>{t("split.serviceCharge", { rate: pct(p.serviceChargeBp) })}</span>
                  <span className="tabular-nums">{v ? moneyText(v.service) : "—"}</span>
                </span>
              )}
              <span className="flex justify-between pt-0.5 text-[14.5px] font-bold">
                <span>{t("split.net")}</span>
                <span className="tabular-nums">{v ? moneyText(v.total) : "—"}</span>
              </span>
            </div>
          </>
        )}
      </div>
    );
  };

  const stepper = (
    <div data-testid="pos-tbl-split-stepper" className="inline-flex h-12 items-center overflow-hidden rounded-[14px] border">
      <button
        data-testid="pos-tbl-split-stepper-less"
        type="button"
        aria-label={t("split.fewer")}
        disabled={!editable || draft.partCount <= 2}
        className="grid h-12 w-12 place-items-center text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
        onClick={() => setDraft((d) => setPartCount(d, d.partCount - 1))}
      >
        <RegisterIcon name="minus" size={14} />
      </button>
      <span data-testid="pos-tbl-split-stepper-value" className="min-w-[84px] border-x px-3 text-center text-[16px] font-bold leading-[48px]">
        {t("split.people", { n: draft.partCount })}
      </span>
      <button
        data-testid="pos-tbl-split-stepper-more"
        type="button"
        aria-label={t("split.more")}
        disabled={!editable || draft.partCount >= 20}
        className="grid h-12 w-12 place-items-center text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
        onClick={() => setDraft((d) => setPartCount(d, d.partCount + 1))}
      >
        <RegisterIcon name="plus" size={14} />
      </button>
    </div>
  );

  // ── หารเท่า (15C ซ้าย) ──
  const equalBody = () => {
    const totals = parts.map((x) => x?.total ?? null).filter((x): x is number => x !== null);
    const each = totals.length ? Math.min(...totals) : null;
    const extra = each === null ? 0 : totals.filter((x) => x > each).length;
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p data-testid="pos-tbl-split-equal-big" className="text-[30px] font-bold leading-tight tabular-nums md:text-[34px]">
            {each !== null ? t("split.equalPerPerson", { n: draft.partCount, amount: moneyText(each) }) : "—"}
          </p>
          {stepper}
        </div>
        <p className="text-[13px] text-[color:var(--color-muted)]">
          {total !== null && (extra ? t("split.equalRemainder", { r: extra }) : t("split.equalEven", { total: moneyText(total), n: draft.partCount, rate: pct(p.serviceChargeBp) }))}
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: draft.partCount }, (_, i) => billCard(i + 1, false))}</div>
      </div>
    );
  };

  // ── ตามที่นั่ง (15C ขวา) ──
  const seatBody = () => {
    const sharedIds = items.filter((it) => (draft.assign[it.id]?.[SHARED] ?? 0) > 0);
    const p1 = parts[0];
    const shareEach = p1 ? p1.lines.filter((l) => l.qty === null).reduce((a, l) => a + l.amount, 0) : null;
    return (
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {Array.from({ length: draft.partCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              data-testid={`pos-tbl-split-seat-${n}`}
              type="button"
              disabled={!editable || !seatPick}
              className={`grid size-11 place-items-center rounded-[12px] text-[15px] font-bold disabled:cursor-default ${selPart === n ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border"}`}
              onClick={() => {
                const it = items.find((x) => x.id === seatPick);
                if (it) setDraft((d) => assignWhole(d, it, n));
                setSeatPick(null);
              }}
            >
              {n}
            </button>
          ))}
          <button
            data-testid="pos-tbl-split-seat-shared"
            type="button"
            disabled={!editable || !seatPick}
            className="inline-flex h-11 items-center rounded-[12px] border border-dashed px-3 text-[14px] disabled:cursor-default"
            onClick={() => {
              const it = items.find((x) => x.id === seatPick);
              if (it) setDraft((d) => assignWhole(d, it, SHARED));
              setSeatPick(null);
            }}
          >
            {t("split.shared")}
          </button>
          <span className="flex-1" />
          {stepper}
        </div>
        {seatPick && <p className="px-4 pt-2 text-[12.5px] text-[color:var(--color-accent)]">{t("split.pickSeatHint")}</p>}
        <ul data-testid="pos-tbl-split-seat-rows" className="flex flex-col px-4 py-1">
          {Array.from({ length: draft.partCount }, (_, i) => i + 1).map((n) => {
            const own = items.filter((it) => (draft.assign[it.id]?.[n] ?? 0) > 0);
            const v = parts[n - 1];
            return (
              <li key={n} data-testid={`pos-tbl-split-seatrow-${n}`} className="flex items-center gap-3 border-b py-3 last:border-b-0">
                <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] text-[14px] font-bold ${selPart === n ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border"}`}>{n}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  <b>{t("split.seat", { no: n })}</b>
                  {" · "}
                  {own.length ? own.map((it) => it.name).join(" · ") : <span className="text-[color:var(--color-muted)]">{t("split.seatRowEmpty")}</span>}
                </span>
                <span className="shrink-0 text-[16px] font-bold tabular-nums">{v ? moneyText(v.total) : "—"}</span>
              </li>
            );
          })}
          {sharedIds.length > 0 && (
            <li data-testid="pos-tbl-split-seatrow-shared" className="flex items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-dashed text-[14px] font-bold">{"•"}</span>
              <span className="min-w-0 flex-1 text-[14px]">
                <b>{t("split.shared")}</b>
                {" · "}
                {sharedIds.map((it) => `${it.name} ${moneyText(it.lineSatang)}`).join(" · ")} {shareEach !== null && t("split.sharedNote", { amount: moneyText(shareEach) })}
              </span>
            </li>
          )}
        </ul>
      </div>
    );
  };

  const footerNote =
    draft.mode === "SEAT"
      ? t("split.seatFooter", { rate: pct(p.serviceChargeBp) })
      : draft.mode === "EQUAL"
        ? t("split.progress", { paid: plan?.parts.filter((x) => x.status === "PAID").length ?? 0, count: draft.partCount, amount: moneyText((plan && clean ? remaining : null) ?? total ?? 0) })
        : t("split.footerProportional", { total: total !== null ? moneyText(total) : "—" });

  const itemsList = (
    <section data-testid="pos-tbl-split-items" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border">
      <div className="flex items-center justify-between gap-2 border-b bg-[color:var(--color-surface-2)] px-4 py-3">
        <span className="text-[14px] font-bold">{t("split.allItemsCount", { count: items.length })}</span>
        <span className="text-[14px] font-bold tabular-nums">{itemsBase !== null ? moneyText(itemsBase) : ""}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">{items.map(itemRow)}</ul>
    </section>
  );

  const body =
    plan === undefined ? (
      <p className="p-10 text-center text-[14px] text-[color:var(--color-muted)]">{t("split.loading")}</p>
    ) : !items.length ? (
      <p className="p-10 text-center text-[14px] text-[color:var(--color-muted)]">{loadErr ? tr(loadErr) : t("split.nothing")}</p>
    ) : draft.mode === "EQUAL" ? (
      equalBody()
    ) : draft.mode === "SEAT" ? (
      <div className="grid min-h-0 gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        {itemsList}
        <section className="min-w-0 rounded-[16px] border">{seatBody()}</section>
      </div>
    ) : (
      <div className="grid min-h-0 gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,470px)_minmax(0,1fr)]">
        {itemsList}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex snap-x gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible">{Array.from({ length: draft.partCount }, (_, i) => billCard(i + 1, true))}</div>
          {editable && draft.partCount < 20 && (
            <button
              data-testid="pos-tbl-split-addPart"
              type="button"
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-[14px] border border-dashed text-[14px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
              onClick={() => setDraft((d) => addPart(d))}
            >
              {t("split.addBill")}
            </button>
          )}
        </section>
      </div>
    );

  return (
    <>
      {/* แตะม่านไม่ปิด (ร่างที่ยังไม่บันทึกจะหาย) — ปิดด้วยปุ่ม × หรือ Esc */}
      <RegisterDialog onDismiss={() => undefined} locked={busy}>
        <div
          data-testid="pos-tbl-split-modal"
          data-mode={draft.mode}
          data-locked={locked ? "true" : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={t("split.heading", { table: p.tableName, total: total !== null ? moneyText(total) : "" })}
          className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-surface)] shadow-xl md:h-[min(860px,calc(100dvh-32px))] md:w-[calc(100vw-32px)] md:rounded-[18px] xl:h-[min(760px,calc(100dvh-32px))] xl:w-[min(1180px,calc(100vw-32px))]"
          inert={sub !== null}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 md:px-6">
            <RegisterIcon name="doc" size={18} className="hidden md:block" />
            <h2 className="text-[18px] font-bold md:text-[19px]">{t("split.heading", { table: p.tableName, total: total !== null ? moneyText(total) : "—" })}</h2>
            {chip && <span data-testid="pos-tbl-split-chip" className="inline-flex h-7 max-w-full items-center truncate rounded-[8px] border px-2.5 text-[12.5px] text-[color:var(--color-ink-soft)]">{chip}</span>}
            <span className="flex-1" />
            <button data-testid="pos-tbl-split-close" type="button" aria-label={t("split.close")} disabled={busy} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]" onClick={p.onClose}>
              <RegisterIcon name="x" size={18} />
            </button>
          </div>
          <div role="tablist" aria-label={t("split.heading", { table: p.tableName, total: "" })} className="flex shrink-0 overflow-x-auto border-b px-2 md:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((x) => (
              <button
                key={x.id}
                data-testid={`pos-tbl-split-tab-${x.id}`}
                role="tab"
                type="button"
                aria-selected={draft.mode === x.mode}
                disabled={!editable && draft.mode !== x.mode}
                className={tab(draft.mode === x.mode)}
                onClick={() => {
                  if (draft.mode === x.mode || !editable) return;
                  setSeatPick(null);
                  setErr(null);
                  setDraft((d) => {
                    // แผนเดิมเป็นแบบนี้ = กลับไปที่แผนเดิม · ไม่งั้นร่างใหม่ของแบบนั้น (สมาชิกต่อบิลคงไว้)
                    if (plan && plan.mode === x.mode) return draftFromPlan(plan);
                    return emptyDraft(x.mode, guests, d.members);
                  });
                }}
              >
                {t(x.label)}
              </button>
            ))}
          </div>
          {locked && (
            <p data-testid="pos-tbl-split-locked" className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] border px-3.5 py-2.5 text-[13px] text-[color:var(--color-ink-soft)] md:mx-6">
              <RegisterIcon name="lock" size={14} className="shrink-0" />
              {t("split.lockedHint")}
            </p>
          )}
          {outside.length > 0 && (
            <p data-testid="pos-tbl-split-newitems" className="mx-4 mt-3 flex items-center gap-2 rounded-[12px] border border-[color:var(--color-danger)] px-3.5 py-2.5 text-[13px] font-bold text-[color:var(--color-danger)] md:mx-6">
              <RegisterIcon name="warn" size={14} className="shrink-0" />
              {t("split.newItems", { count: outside.length })}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
          <div className="flex shrink-0 flex-col gap-2 border-t bg-[color:var(--color-surface)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:flex-row md:items-center md:px-6">
            <div className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-[color:var(--color-muted)]">
              <p data-testid="pos-tbl-split-footer">{footerNote}</p>
              {unassigned.length > 0 && items.length > 0 && <p className="font-bold text-[color:var(--color-danger)]">{t("split.unassignedCount", { n: unassigned.length })}</p>}
              {err && (
                <p role="alert" className="font-bold text-[color:var(--color-danger)]">
                  {err}
                </p>
              )}
              {p.payBlock && <div className="text-[color:var(--color-danger)]">{p.payBlock}</div>}
            </div>
            <div className="flex items-center gap-2">
              {plan && !locked && p.canSell && (
                <button data-testid="pos-tbl-split-cancel" type="button" disabled={busy} className="h-12 shrink-0 rounded-[14px] px-3 text-[13.5px] font-bold text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]" onClick={() => setSub({ kind: "cancel" })}>
                  {t("split.cancel")}
                </button>
              )}
              {!locked && (
                <button
                  data-testid="pos-tbl-split-save"
                  type="button"
                  disabled={busy || !editable || (clean && !!plan) || unassigned.length > 0 || empties.length > 0 || !items.length}
                  className="btn btn-ghost h-12 flex-1 rounded-[14px] px-5 text-[15px] font-bold md:flex-none"
                  onClick={() => void saveOnly()}
                >
                  {t("split.payOneByOne")}
                </button>
              )}
              <button
                data-testid={`pos-tbl-split-payPart-${selPart ?? 0}`}
                type="button"
                disabled={busy || !selPart || selPaid || !!p.payBlock || !p.canSell || (!clean && (locked || unassigned.length > 0 || empties.length > 0)) || !items.length}
                className="btn btn-primary h-12 flex-[2] whitespace-nowrap rounded-[14px] px-5 text-[15px] font-bold md:flex-none"
                onClick={() => selPart && void payPart(selPart)}
              >
                {selPart ? t("split.payBill", { no: selPart, amount: selTotal !== null ? moneyText(selTotal) : "" }).trim() : t("split.payOneByOne")}
              </button>
            </div>
          </div>
        </div>
      </RegisterDialog>

      {sub?.kind === "qty" &&
        (() => {
          const it = items.find((x) => x.id === sub.itemId);
          if (!it) return null;
          const left = it.qty - Object.values(draft.assign[it.id] ?? {}).reduce((a, b) => a + b, 0);
          const opts = draft.mode === "SEAT" ? [...Array.from({ length: draft.partCount }, (_, i) => i + 1), SHARED] : Array.from({ length: draft.partCount }, (_, i) => i + 1);
          return (
            <RegisterDialog onDismiss={() => setSub(null)}>
              <div data-testid="pos-tbl-split-qty-dialog" role="dialog" aria-modal="true" aria-label={t("split.qtyTitle", { name: it.name, qty: it.qty })} className={REG_DIALOG_PANEL}>
                <SheetGrab />
                <h3 className="text-[18px] font-bold">{t("split.qtyTitle", { name: it.name, qty: it.qty })}</h3>
                <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
                  {opts.map((n) => {
                    const q = draft.assign[it.id]?.[n] ?? 0;
                    return (
                      <li key={n} className="flex items-center justify-between gap-3 py-1">
                        <span className="text-[14.5px]">{n === SHARED ? t("split.shared") : draft.mode === "SEAT" ? t("split.seat", { no: n }) : t("split.bill", { no: n })}</span>
                        <span className="flex items-center gap-2">
                          <button data-testid={`pos-tbl-split-qty-${it.id}-less-${n}`} type="button" aria-label={t("split.fewer")} disabled={q <= 0} className="grid size-11 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => setDraft((d) => assignQty(d, it, n, q - 1))}>
                            <RegisterIcon name="minus" size={14} />
                          </button>
                          <span className="w-8 text-center text-[17px] font-bold tabular-nums">{q}</span>
                          <button data-testid={`pos-tbl-split-qty-${it.id}-more-${n}`} type="button" aria-label={t("split.more")} disabled={left <= 0} className="grid size-11 place-items-center rounded-[12px] border disabled:opacity-40" onClick={() => setDraft((d) => assignQty(d, it, n, q + 1))}>
                            <RegisterIcon name="plus" size={14} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {left > 0 && <p className="text-[13px] font-bold text-[color:var(--color-danger)]">{t("split.qtyLeft", { n: left })}</p>}
                <button data-testid="pos-tbl-split-qty-done" type="button" className="btn btn-primary h-12 rounded-[14px] text-[15px] font-bold" onClick={() => setSub(null)}>
                  {t("split.qtyDone")}
                </button>
              </div>
            </RegisterDialog>
          );
        })()}

      {sub?.kind === "member" && (
        <SplitMemberChooser
          systemId={p.systemId}
          unitId={p.unitId}
          partNo={sub.partNo}
          current={memberOfPart(draft, sub.partNo, sessionMember?.id ?? null)}
          tableMember={sessionMember && sessionMember.id ? { id: sessionMember.id, name: sessionMember.name || t("split.memberUnknown") } : null}
          onPick={(m) => {
            if (m) setNames((x) => ({ ...x, [m.id]: m.name }));
            setDraft((d) => ({ ...d, members: { ...d.members, [sub.partNo]: m?.id ?? null } }));
            setSub(null);
          }}
          onClose={() => setSub(null)}
        />
      )}

      {sub?.kind === "prebill" && (
        <TablePreBillDialog systemId={p.systemId} unitId={p.unitId} deviceId={p.deviceId} target={{ tableSplitPartId: sub.partId }} printer={p.printer} locale={p.locale} onToast={p.onToast} onClose={() => setSub(null)} />
      )}

      {sub?.kind === "cancel" && (
        <RegisterDialog onDismiss={() => setSub(null)} locked={busy}>
          <div data-testid="pos-tbl-split-cancel-dialog" role="dialog" aria-modal="true" aria-label={t("split.cancelTitle")} className={REG_DIALOG_PANEL}>
            <SheetGrab />
            <h3 className="text-[18px] font-bold">{t("split.cancelTitle")}</h3>
            <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("split.cancelBody")}</p>
            <div className="grid grid-cols-2 gap-2">
              <button data-testid="pos-tbl-split-cancel-back" type="button" disabled={busy} className="btn btn-ghost h-12 rounded-[14px]" onClick={() => setSub(null)}>
                {t("panel.back")}
              </button>
              <button data-testid="pos-tbl-split-cancel-confirm" type="button" disabled={busy} className="btn h-12 rounded-[14px] bg-[color:var(--color-danger)] font-bold text-[color:var(--color-surface)]" onClick={() => void cancelPlan()}>
                {t("split.cancel")}
              </button>
            </div>
          </div>
        </RegisterDialog>
      )}
    </>
  );
}

/** ตัวเลือกสมาชิกของบิล (มติ 2) — ค้นด้วยตัวค้นสมาชิกของหน้าขาย registerMemberLookupAction · สมาชิกของโต๊ะเลือกได้ทันที · "ไม่มีสมาชิก" */
function SplitMemberChooser(p: {
  systemId: string;
  unitId: string;
  partNo: number;
  current: string | null;
  tableMember: { id: string; name: string } | null;
  onPick: (m: { id: string; name: string } | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<RegisterMemberItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const search = async () => {
    const v = q.trim().slice(0, 200);
    if (!v || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await registerMemberLookupAction({ systemId: p.systemId, unitId: p.unitId, q: v });
      if (!r.ok) {
        setItems([]);
        setErr(refusalMessageKey(r.code));
      } else setItems(r.items);
    } catch {
      setItems([]);
      setErr("errors.unknown");
    } finally {
      setBusy(false);
    }
  };
  return (
    <RegisterDialog onDismiss={p.onClose} locked={busy}>
      <div data-testid="pos-tbl-split-member-dialog" role="dialog" aria-modal="true" aria-label={t("split.memberTitle", { no: p.partNo })} className={`${REG_DIALOG_PANEL} md:w-[460px]`}>
        <SheetGrab />
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[18px] font-bold">{t("split.memberTitle", { no: p.partNo })}</h3>
          <button data-testid="pos-tbl-split-member-close" type="button" aria-label={t("split.close")} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        {p.tableMember && (
          <button
            data-testid="pos-tbl-split-member-table"
            type="button"
            className={`flex h-12 items-center gap-2 rounded-[12px] border px-3 text-left text-[14px] ${p.current === p.tableMember.id ? "border-[color:var(--color-ink)] font-bold" : ""}`}
            onClick={() => p.onPick(p.tableMember)}
          >
            <RegisterIcon name="users" size={14} />
            <span className="truncate">{t("split.memberTable", { name: p.tableMember.name })}</span>
          </button>
        )}
        <form
          data-testid="pos-tbl-split-member-form"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            data-testid="pos-tbl-split-member-q"
            className="h-12 min-w-0 flex-1 rounded-[12px] border bg-[color:var(--color-surface)] px-3 text-[15px]"
            value={q}
            maxLength={200}
            placeholder={t("split.memberSearch")}
            aria-label={t("split.memberSearch")}
            onChange={(e) => setQ(e.target.value)}
          />
          <button data-testid="pos-tbl-split-member-search" type="submit" disabled={busy || !q.trim()} className="btn btn-primary h-12 rounded-[12px] px-4 text-[14px] font-bold">
            {t("split.memberSearchBtn")}
          </button>
        </form>
        {err && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {tr(err)}
          </p>
        )}
        {items && (
          <ul className="flex max-h-[40dvh] flex-col gap-1 overflow-y-auto">
            {items.length === 0 && !err && <li className="py-3 text-center text-[13.5px] text-[color:var(--color-muted)]">{t("split.memberEmpty")}</li>}
            {items.map((m) => (
              <li key={m.id}>
                <button
                  data-testid={`pos-tbl-split-member-pick-${m.id}`}
                  type="button"
                  disabled={m.suspended}
                  className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[12px] px-3 text-left text-[14px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                  onClick={() => p.onPick({ id: m.id, name: m.name })}
                >
                  <span className="min-w-0 truncate">
                    <b>{m.name}</b>
                    {m.tier ? ` · ${m.tier.name}` : ""}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-[color:var(--color-muted)]">{m.phoneMasked}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button data-testid="pos-tbl-split-member-none" type="button" className="btn btn-ghost h-12 rounded-[14px] text-[14px]" onClick={() => p.onPick(null)}>
          {t("split.memberNone")}
        </button>
      </div>
    </RegisterDialog>
  );
}
