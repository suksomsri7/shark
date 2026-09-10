// GiftCardsBoard.tsx — หน้า "โปรโมชัน › Gift Card" (M2.6 · ภาพ ledger/design-member/20-giftcard.png)
//
// 3 ส่วนตามภาพ:
//   (ก) แถบหัว: ป้าย "ผูกบัญชี: เปิดอยู่/ปิดอยู่" + ปุ่ม "ขาย Gift Card"
//   (ข) KPI 3 ช่อง: ขายเดือนนี้ (บาท + จำนวนใบ) · คงเหลือทั้งหมด (หนี้สินในบัญชี 2110) · ใช้ไปเดือนนี้ (รับรู้รายได้แล้ว)
//   (ค) ตาราง "Gift Card ทั้งหมด" 7 คอลัมน์ + ลิ้นชักขาย (drawer) ทางขวา
//
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์ในหน้าสมาชิก — ใช้ `MemberIcon` · ไม่มีสีฮาร์ดโค้ด (ใช้โทเคน var(--color-*))
// 🔴 ทุกการบันทึกผ่าน server action ใน `giftcard/giftcard-actions.ts` (ด่านสิทธิ์อยู่ที่นั่น)
// 🔴 PIN โชว์ครั้งเดียวหลังขายเสร็จ — ระบบไม่เก็บ PIN ดิบไว้ที่ไหนเลย (เก็บแค่ค่า hash)
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";
import type { GiftCardKpi, GiftCardRowDto, GiftCardSettingsDto } from "@/lib/modules/giftcard/service";
import { sellGiftCardAction, setGiftCardSettingsAction } from "@/lib/modules/giftcard/giftcard-actions";
import { MemberIcon } from "./MemberIcon";

type MemberOption = { id: string; name: string; memberCode: string };

export type GiftCardsBoardProps = {
  systemId: string;
  settings: GiftCardSettingsDto;
  rows: GiftCardRowDto[];
  kpi: GiftCardKpi;
  units: { id: string; name: string }[];
  members: MemberOption[];
  defaultUnitId: string;
  canSell: boolean;
  canManage: boolean;
  filter: { status: string | null; q: string };
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งานได้",
  DEPLETED: "ใช้หมดแล้ว",
  EXPIRED: "หมดอายุ",
  SUSPENDED: "ระงับอยู่",
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" style={{ minWidth: 0 }}>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      {hint && (
        <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function GiftCardsBoard(props: GiftCardsBoardProps) {
  const { systemId, rows, kpi, units, members, canSell, canManage } = props;
  const router = useRouter();
  const [settings, setSettings] = useState<GiftCardSettingsDto>(props.settings);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onSold = (msg: string) => {
    setOpen(false);
    setNotice(msg);
    router.refresh();
  };

  return (
    <div data-testid="giftcards-page" className="flex flex-col gap-4">
      {/* (ก) แถบหัว — ป้ายผูกบัญชี + ปุ่มขาย */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="giftcards-link-badge"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
          style={{
            border: "1px solid var(--color-line)",
            background: "var(--color-surface-2)",
            color: settings.accountingLink ? "var(--color-ink)" : "var(--color-muted)",
          }}
        >
          <MemberIcon name="doc" size="xs" />
          ผูกบัญชี: {settings.accountingLink ? "เปิดอยู่" : "ปิดอยู่"}
        </span>
        <Link
          href={`/app/sys/${systemId}/member/promotions/giftcards/settings`}
          className="text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          ตั้งค่าบัตรกำนัล
        </Link>
        <span className="flex-1" />
        {canSell && (
          <button
            type="button"
            data-testid="giftcards-sell"
            className="btn btn-primary inline-flex items-center gap-1.5"
            onClick={() => setOpen(true)}
          >
            <MemberIcon name="plus" size="sm" />
            ขาย Gift Card
          </button>
        )}
      </div>

      {notice && (
        <p data-testid="giftcards-notice" className="text-sm" style={{ color: "var(--color-ink)" }}>
          {notice}
        </p>
      )}

      {/* (ข) KPI 3 ช่อง */}
      <div
        data-testid="giftcards-kpi"
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <Tile
          label="ขายเดือนนี้"
          value={formatBaht(kpi.soldThisMonthSatang)}
          hint={`${kpi.soldThisMonthCount.toLocaleString("th-TH")} ใบ`}
        />
        <Tile label="คงเหลือทั้งหมด" value={formatBaht(kpi.outstandingSatang)} hint="หนี้สินในบัญชี 2110" />
        <Tile label="ใช้ไปเดือนนี้" value={formatBaht(kpi.usedThisMonthSatang)} hint="รับรู้รายได้แล้ว" />
      </div>

      {/* (ค) ตารางบัตรทั้งหมด */}
      <div className="card p-0">
        <div className="flex items-center gap-2 p-4 pb-3">
          <h2 className="text-sm font-semibold">Gift Card ทั้งหมด</h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {rows.length.toLocaleString("th-TH")} ใบ
          </span>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="giftcards-table" className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
                <th className="px-4 py-2 text-left font-normal">หมายเลข</th>
                <th className="px-4 py-2 text-left font-normal">ผู้ซื้อ</th>
                <th className="px-4 py-2 text-left font-normal">ผู้รับ/เจ้าของ</th>
                <th className="px-4 py-2 text-right font-normal">มูลค่า</th>
                <th className="px-4 py-2 text-right font-normal">คงเหลือ</th>
                <th className="px-4 py-2 text-left font-normal">หมดอายุ</th>
                <th className="px-4 py-2 text-left font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    ยังไม่มีบัตรกำนัลในระบบ — กด &ldquo;ขาย Gift Card&rdquo; เพื่อออกใบแรก
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} data-testid={`giftcards-row-${r.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td className="px-4 py-2 font-medium">{r.numberMasked}</td>
                  <td className="px-4 py-2">{r.buyerName}</td>
                  <td className="px-4 py-2">{r.ownerName}</td>
                  <td className="px-4 py-2 text-right">{formatBaht(r.initialSatang)}</td>
                  <td className="px-4 py-2 text-right">{formatBaht(r.balanceSatang)}</td>
                  <td className="px-4 py-2" style={{ color: "var(--color-muted)" }}>
                    {r.expiresAt ? formatThaiDate(new Date(r.expiresAt)) : "ไม่มีกำหนด"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        border: "1px solid var(--color-line)",
                        background: "var(--color-surface-2)",
                        color: r.status === "ACTIVE" ? "var(--color-ink)" : "var(--color-muted)",
                      }}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <SellDrawer
          systemId={systemId}
          settings={settings}
          units={units}
          members={members}
          defaultUnitId={props.defaultUnitId}
          canManage={canManage}
          onSettings={setSettings}
          onClose={() => setOpen(false)}
          onSold={onSold}
        />
      )}
    </div>
  );
}

// ───────────────────────── ลิ้นชักขาย (ภาพ 20 ครึ่งขวา) ─────────────────────────

function SellDrawer({
  systemId,
  settings,
  units,
  members,
  defaultUnitId,
  canManage,
  onSettings,
  onClose,
  onSold,
}: {
  systemId: string;
  settings: GiftCardSettingsDto;
  units: { id: string; name: string }[];
  members: MemberOption[];
  defaultUnitId: string;
  canManage: boolean;
  onSettings: (s: GiftCardSettingsDto) => void;
  onClose: () => void;
  onSold: (msg: string) => void;
}) {
  const [amountSatang, setAmountSatang] = useState<number>(settings.denominations[0] ?? 100_000);
  const [customBaht, setCustomBaht] = useState("");
  const [custom, setCustom] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [mode, setMode] = useState<"MEMBER" | "CONTACT" | "PRINT">("MEMBER");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [contactLine, setContactLine] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [unitId, setUnitId] = useState(defaultUnitId || units[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ number: string; pin: string | null } | null>(null);

  const satang = custom ? Math.round((Number(customBaht) || 0) * 100) : amountSatang;

  const filter = (q: string) => {
    const t = q.trim().toLowerCase();
    const pool = t
      ? members.filter((m) => m.name.toLowerCase().includes(t) || m.memberCode.toLowerCase().includes(t))
      : members;
    return pool.slice(0, 50);
  };
  const buyerOptions = useMemo(() => filter(buyerQuery), [buyerQuery, members]);
  const recipientOptions = useMemo(() => filter(recipientQuery), [recipientQuery, members]);

  const toggleSetting = async (patch: Partial<GiftCardSettingsDto>) => {
    setError(null);
    const res = await setGiftCardSettingsAction({ systemId, ...patch });
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onSettings(res.data);
  };

  const submit = async () => {
    if (satang <= 0) {
      setError("ยังไม่ได้เลือกมูลค่าบัตร — เลือกจากปุ่มด้านบนหรือกรอกเองก่อน");
      return;
    }
    if (!unitId) {
      setError("ยังไม่ได้เลือกสาขาที่รับเงิน — เลือกสาขาก่อนกดรับเงิน");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sellGiftCardAction({
      systemId,
      satang,
      buyerCustomerId: buyerId || null,
      recipientMode: mode,
      recipientCustomerId: mode === "MEMBER" ? recipientId || null : null,
      recipientContact: mode === "CONTACT" ? { line: contactLine || null, email: contactEmail || null } : null,
      message: message.trim() || null,
      unitId,
      idempotencyKey: `ui-${systemId}-${Date.now()}`,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setIssued({ number: res.data.number, pin: res.data.pin });
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="giftcards-sell-modal"
        role="dialog"
        aria-modal="true"
        aria-label="ขาย Gift Card"
        className="relative flex h-full w-full max-w-[480px] flex-col"
        style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)" }}
      >
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <MemberIcon name="card" />
          <h2 className="text-sm font-semibold">ขาย Gift Card</h2>
          <span className="flex-1" />
          <button type="button" aria-label="ปิด" className="btn btn-ghost" onClick={onClose}>
            <MemberIcon name="x" size="sm" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {issued ? (
            <div data-testid="giftcards-sell-issued" className="card flex flex-col gap-2 p-4">
              <span className="text-sm font-semibold">ออกบัตรเรียบร้อย</span>
              <span className="text-sm">
                หมายเลข <strong>{issued.number}</strong>
              </span>
              {issued.pin && (
                <span className="text-sm">
                  PIN <strong>{issued.pin}</strong>
                </span>
              )}
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                เขียน/พิมพ์ PIN ลงบัตรตอนนี้ — ระบบไม่เก็บรหัสนี้ไว้ ดูย้อนหลังไม่ได้
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onSold(`ออกบัตร ${issued.number} มูลค่า ${formatBaht(satang)} เรียบร้อย`)}
              >
                เสร็จสิ้น
              </button>
            </div>
          ) : (
            <>
              {/* มูลค่า */}
              <div data-testid="giftcards-sell-amount" className="flex flex-col gap-2">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  มูลค่า
                </span>
                <div className="flex flex-wrap gap-2">
                  {settings.denominations.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm"
                      style={{
                        border: "1px solid var(--color-line)",
                        background: !custom && amountSatang === d ? "var(--color-ink)" : "var(--color-surface)",
                        color: !custom && amountSatang === d ? "var(--color-surface)" : "var(--color-ink)",
                      }}
                      onClick={() => {
                        setCustom(false);
                        setAmountSatang(d);
                      }}
                    >
                      {formatBaht(d)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-sm"
                    style={{
                      border: "1px solid var(--color-line)",
                      background: custom ? "var(--color-ink)" : "var(--color-surface)",
                      color: custom ? "var(--color-surface)" : "var(--color-ink)",
                    }}
                    onClick={() => setCustom(true)}
                  >
                    กำหนดเอง
                  </button>
                </div>
                {custom && (
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="ระบุจำนวนเงิน (บาท)"
                    value={customBaht}
                    onChange={(e) => setCustomBaht(e.target.value)}
                  />
                )}
              </div>

              {/* ผู้ซื้อ */}
              <div data-testid="giftcards-sell-buyer" className="flex flex-col gap-2">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ผู้ซื้อ
                </span>
                <input
                  className="input"
                  placeholder="ค้นหาสมาชิกผู้ซื้อ..."
                  value={buyerQuery}
                  onChange={(e) => setBuyerQuery(e.target.value)}
                />
                <select className="input" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                  <option value="">ไม่ระบุ (ลูกค้าทั่วไป)</option>
                  {buyerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.memberCode}
                    </option>
                  ))}
                </select>
              </div>

              {/* ผู้รับ */}
              <div data-testid="giftcards-sell-recipient" className="flex flex-col gap-2">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ผู้รับ
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "MEMBER", label: "สมาชิกในระบบ" },
                      { key: "CONTACT", label: "ส่งทาง LINE/อีเมล" },
                      { key: "PRINT", label: "พิมพ์บัตร (ไม่ระบุ)" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm"
                      style={{
                        border: "1px solid var(--color-line)",
                        background: mode === o.key ? "var(--color-ink)" : "var(--color-surface)",
                        color: mode === o.key ? "var(--color-surface)" : "var(--color-ink)",
                      }}
                      onClick={() => setMode(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {mode === "MEMBER" && (
                  <>
                    <input
                      className="input"
                      placeholder="ค้นหาสมาชิกผู้รับ..."
                      value={recipientQuery}
                      onChange={(e) => setRecipientQuery(e.target.value)}
                    />
                    <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                      <option value="">ยังไม่เลือก</option>
                      {recipientOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.memberCode}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {mode === "CONTACT" && (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="LINE ID"
                      value={contactLine}
                      onChange={(e) => setContactLine(e.target.value)}
                    />
                    <input
                      className="input flex-1"
                      placeholder="อีเมล"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* ข้อความบนบัตร */}
              <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
                ข้อความบนบัตร
                <textarea
                  className="input"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="เช่น สุขสันต์วันเกิดค่ะ ขอให้มีความสุขทุกไดฟ์นะคะ"
                />
              </label>

              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
                  หมดอายุ
                  <input className="input" value={`${settings.expiryMonths} เดือน`} readOnly />
                </label>
                <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
                  ชำระที่
                  <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (POS หน้าร้าน)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* กล่องผูกบัญชี */}
              <div className="card flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">ผูกกับโมดูลบัญชี</span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.accountingLink}
                    aria-label="ผูกกับโมดูลบัญชี"
                    disabled={!canManage}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{
                      border: "1px solid var(--color-line)",
                      background: settings.accountingLink ? "var(--color-ink)" : "var(--color-surface-2)",
                      color: settings.accountingLink ? "var(--color-surface)" : "var(--color-muted)",
                      opacity: canManage ? 1 : 0.6,
                    }}
                    onClick={() => toggleSetting({ accountingLink: !settings.accountingLink })}
                  >
                    {settings.accountingLink ? "เปิดอยู่" : "ปิดอยู่"}
                  </button>
                </div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  เปิด — ขาย = รับเงินล่วงหน้า (หนี้สิน 2110) · ใช้ = รับรู้รายได้ (4030) · หมดอายุ = รายได้อื่น (4900)
                </p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ปิด — บันทึกยอดในระบบสมาชิกอย่างเดียว ไม่ลงบัญชี
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ใช้ได้กับ
                </span>
                <div className="flex flex-wrap gap-3 text-sm">
                  {["POS", "จอง", "ออนไลน์"].map((t) => (
                    <span key={t} className="inline-flex items-center gap-1">
                      <MemberIcon name="check" size="xs" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  สิทธิ์เพิ่มเติม
                </span>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="inline-flex items-center gap-1" style={{ opacity: settings.transferable ? 1 : 0.5 }}>
                    <MemberIcon name="check" size="xs" />
                    โอนเจ้าของได้
                  </span>
                  <span className="inline-flex items-center gap-1" style={{ opacity: settings.reloadable ? 1 : 0.5 }}>
                    <MemberIcon name="check" size="xs" />
                    เติมเงินได้
                  </span>
                </div>
              </div>

              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                หมดอายุขั้นต่ำตามกฎหมาย — ระบบบังคับไม่ให้ตั้งสั้นกว่าที่กฎหมายกำหนด
              </p>

              {error && (
                <p data-testid="giftcards-sell-error" className="text-sm" style={{ color: "var(--color-danger)" }}>
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {!issued && (
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--color-line)" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ยกเลิก
            </button>
            <span className="flex-1" />
            <button
              type="button"
              data-testid="giftcards-sell-submit"
              className="btn btn-primary"
              disabled={busy}
              onClick={submit}
            >
              {busy ? "กำลังรับเงิน..." : `รับเงิน ${formatBaht(satang)} ผ่าน POS`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GiftCardsBoard;
