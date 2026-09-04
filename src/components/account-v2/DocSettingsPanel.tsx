"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { Modal } from "./Modal";
import { previewExample } from "@/lib/modules/account/doc-numbering";
import { useSetBreadcrumbTail } from "./breadcrumb-tail";
import {
  AUTO_TAX_MODE_LABEL,
  DUE_BASIS_LABEL,
  PRINT_FIELDS,
  PRINT_FIELD_LABEL,
  PRINT_LANGUAGE_LABEL,
  PRINT_TEMPLATE_LABEL,
  SEQ_RESET_LABEL,
  TAG_COLORS,
  TAG_COLOR_LABEL,
  type DocSettings,
  type SeqReset,
} from "@/lib/modules/account/settings-schema";

// ─────────────────────────────────────────────────────────────
// หน้า "ตั้งค่า › เอกสารและเลขที่" (SPEC §9.2 · เฟรม f10-settings.png)
//
// โครงตาม f10: หัวเรื่อง "ตั้งค่า" + ปุ่ม [ยกเลิก][✓ บันทึก] มุมขวาบน (sticky) · ซ้าย = เมนู w-280
// (ส่งมาเป็น children เพราะเป็น server component) · ขวา = การ์ดเนื้อหา max-w-2xl
// ทุกหัวข้อย่อยเป็นฟอร์มเดียว 1 ปุ่มบันทึก — ปุ่มบนหัวเรื่องกับปุ่มท้ายการ์ดคือปุ่มเดียวกัน (submit ฟอร์มนี้)
// ─────────────────────────────────────────────────────────────

export type NumberingRow = {
  docType: string;
  label: string;
  prefix: string;
  pattern: string;
  effectivePattern: string;
  reset: SeqReset;
  example: string;
  nextNo: number;
};

export type TagRow = {
  id: string;
  name: string;
  color: string;
  docTypes: string[];
  archivedAt: string | null;
  usageCount?: number;
};

export type ChannelRow = { id: string; name: string; detail: string };
export type LedgerRow = { id: string; code: string; name: string };
export type DocTypeAccountRow = { docType: string; label: string; accountId: string | null };

type Action = (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;

export type DocSettingsPanelProps = {
  systemId: string;
  base: string;
  sub: string;
  /** ชื่อหัวข้อย่อยภาษาไทย (ต่อท้าย breadcrumb) */
  subLabel: string;
  /** วันอ้างอิงของ "ตัวอย่างเลขถัดไป" (ส่งมาจาก server — ไม่ใช้ new Date() ในเบราว์เซอร์ กัน hydration เพี้ยน) */
  todayIso: string;
  branchCode: string;
  settings: DocSettings;
  rows: NumberingRow[];
  docLabels: Record<string, string>;
  tags: TagRow[];
  channels: ChannelRow[];
  ledgers: LedgerRow[];
  docTypeAccounts: DocTypeAccountRow[];
  /** เอกสารตัวอย่างสำหรับดูหน้ากระดาษจริง (null = ยังไม่มีเอกสารที่ออกแล้ว) */
  printSampleDocId: string | null;
  nav: React.ReactNode;
  /** เมนูสำหรับมือถือ (ไม่มีหัวข้อย่อยที่เลือก) — โชว์เต็มจอเมื่อยังไม่ได้เลือกหัวข้อย่อย */
  mobileNav: React.ReactNode;
  /** true = มือถือยังไม่ได้เลือกหัวข้อย่อย ⇒ เห็นเฉพาะรายการหัวข้อ */
  showMobileNavOnly: boolean;
  actions: {
    numbering: Action;
    notes: Action;
    due: Action;
    channels: Action;
    publicLink: Action;
    autoTax: Action;
    print: Action;
    tag: Action;
    tagArchive: Action;
    accounts: Action;
    reset: Action;
  };
};

const input = "input";
const label = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";

export function DocSettingsPanel(p: DocSettingsPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const formId = "doc-settings-form";
  // breadcrumb: "บัญชี › ตั้งค่า › เอกสารและเลขที่ › <หัวข้อย่อย>" (f10)
  useSetBreadcrumbTail(p.subLabel);

  function submit(e: React.FormEvent<HTMLFormElement>, action: Action) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await action(fd);
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason });
      if (res.ok) setDirty(false);
    });
  }

  const body = (() => {
    switch (p.sub) {
      case "notes":
        return <NotesSection {...p} />;
      case "public":
        return <PublicSection {...p} />;
      case "due":
        return <DueSection {...p} />;
      case "channels":
        return <ChannelsSection {...p} />;
      case "tags":
        return <TagsSection {...p} pending={pending} onMsg={setMsg} />;
      case "autotax":
        return <AutoTaxSection {...p} />;
      case "print":
        return <PrintSection {...p} />;
      case "accounts":
        return <AccountsSection {...p} />;
      default:
        return <NumberingSection {...p} />;
    }
  })();

  const action = ({
    notes: p.actions.notes,
    public: p.actions.publicLink,
    due: p.actions.due,
    channels: p.actions.channels,
    tags: p.actions.tag,
    autotax: p.actions.autoTax,
    print: p.actions.print,
    accounts: p.actions.accounts,
  } as Record<string, Action>)[p.sub] ?? p.actions.numbering;

  // หัวข้อ "แท็ก" จัดการฟอร์มของตัวเอง (เพิ่ม/แก้ทีละแท็ก) — ไม่ต้องมีปุ่มบันทึกรวม
  const hasSaveBar = p.sub !== "tags";
  const wideSection = p.sub === "numbering" || p.sub === "accounts";

  return (
    <form
      id={formId}
      onSubmit={(e) => submit(e, action)}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="systemId" value={p.systemId} />

      {/* หัวเรื่อง + ปุ่ม (f10: ซ้าย "ตั้งค่า" · ขวา ยกเลิก + ✓ บันทึก) */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        {hasSaveBar && (
          // มือถือหน้า "รายการหัวข้อ" ยังไม่ได้เลือกอะไรให้แก้ → ไม่ต้องมีปุ่มบันทึกให้สับสน
          <div className={`items-center gap-2 ${p.showMobileNavOnly ? "hidden md:flex" : "flex"}`}>
            <Link href={`${p.base}/settings/documents?s=${p.sub}`} className="btn btn-ghost btn-sm">
              ยกเลิก
            </Link>
            <button
              type="submit"
              disabled={pending}
              data-testid="settings-save-top"
              className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            >
              <AccountIcon name="check" className="h-4 w-4" />
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p
          data-testid="settings-msg"
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
        >
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}
      {dirty && !msg && (
        <p className="text-xs text-[color:var(--color-muted)]">มีการแก้ไขที่ยังไม่ได้บันทึก</p>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* เดสก์ท็อป: เมนู w-280 อยู่ซ้ายเสมอ (f10) */}
        <div className="hidden md:block">{p.nav}</div>
        {/* มือถือ (§13): ยังไม่เลือกหัวข้อย่อย = เห็นรายการหัวข้อเต็มจอ · เลือกแล้ว = เห็นเฉพาะเนื้อหา + ปุ่มย้อนกลับ */}
        {p.showMobileNavOnly && <div className="md:hidden">{p.mobileNav}</div>}
        {/* §9 กำหนดเนื้อหา max-w-2xl — แต่ 2 หัวข้อที่เป็น "ตาราง 6 คอลัมน์" (เลขที่เอกสาร · บัญชีรายวัน)
            ใส่ไม่ลง 672px แล้วหัวคอลัมน์จะตัดคำ ซึ่งไม่ตรง f10 ⇒ 2 หัวข้อนี้ใช้ความกว้างที่เหลือ (~800px เท่า f10) */}
        <div
          className={`min-w-0 flex-1 ${wideSection ? "" : "md:max-w-2xl"} ${
            p.showMobileNavOnly ? "hidden md:block" : ""
          }`}
        >
          <Link
            href={`${p.base}/settings/documents`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted)] md:hidden"
          >
            ← หัวข้อตั้งค่า
          </Link>
          {body}
        </div>
      </div>
    </form>
  );
}

// ═══════════════ ① รูปแบบเลขที่เอกสาร (f10 การ์ดบน + การ์ดกฎอัตโนมัติ) ═══════════════

function NumberingSection(p: DocSettingsPanelProps) {
  const today = useMemo(() => new Date(p.todayIso), [p.todayIso]);
  const [rows, setRows] = useState(p.rows);
  const set = (i: number, patch: Partial<NumberingRow>) =>
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-5" data-testid="numbering-card">
        <div>
          <h2 className="text-sm font-medium">
            รูปแบบเลขที่เอกสาร{" "}
            <span className="font-normal text-[color:var(--color-muted)]">
              ตัวอย่างเลขถัดไปอัปเดตทันทีเมื่อแก้รูปแบบ
            </span>
          </h2>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">
            ตัวแปรที่ใช้ได้: {"{ปี} {ปีสั้น} {เดือน} {0000} {สาขา}"} — ตัวอย่าง IV-{"{ปี}{เดือน}"}-{"{0000}"}
          </p>
        </div>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="numbering-table">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-2 font-normal">ชนิดเอกสาร</th>
                <th className="py-2 font-normal">คำนำหน้า</th>
                <th className="py-2 font-normal">รูปแบบ</th>
                <th className="py-2 font-normal">รีเซ็ตเลข</th>
                <th className="py-2 font-normal">เลขถัดไป</th>
                <th className="py-2 font-normal">ตัวอย่างเลขถัดไป</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const example = previewExample({
                  prefix: r.prefix,
                  pattern: r.pattern,
                  reset: r.reset,
                  nextNo: r.nextNo,
                  date: today,
                  branchCode: p.branchCode,
                });
                return (
                  <tr key={r.docType} className="border-b" data-testid={`numbering-row-${r.docType}`}>
                    <td className="py-2 pr-3">{r.label}</td>
                    <td className="py-2 pr-3">
                      <input
                        name={`seq_${r.docType}_prefix`}
                        value={r.prefix}
                        onChange={(e) => set(i, { prefix: e.target.value })}
                        maxLength={12}
                        aria-label={`คำนำหน้าของ${r.label}`}
                        className={`${input} w-20`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        name={`seq_${r.docType}_pattern`}
                        value={r.pattern}
                        placeholder={r.effectivePattern}
                        onChange={(e) => set(i, { pattern: e.target.value })}
                        maxLength={60}
                        aria-label={`รูปแบบเลขที่ของ${r.label}`}
                        className={`${input} w-44`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        name={`seq_${r.docType}_reset`}
                        value={r.reset}
                        onChange={(e) => set(i, { reset: e.target.value as SeqReset })}
                        aria-label={`การรีเซ็ตเลขของ${r.label}`}
                        className={`${input} w-28`}
                      >
                        {(["MONTH", "YEAR", "NONE"] as SeqReset[]).map((k) => (
                          <option key={k} value={k}>
                            {SEQ_RESET_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        name={`seq_${r.docType}_next`}
                        value={r.nextNo}
                        inputMode="numeric"
                        onChange={(e) =>
                          set(i, { nextNo: Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1) })
                        }
                        aria-label={`เลขถัดไปของ${r.label}`}
                        className={`${input} w-20`}
                      />
                      <input type="hidden" name={`seq_${r.docType}_next_current`} value={p.rows[i].nextNo} />
                    </td>
                    <td className="py-2 font-medium" data-testid={`numbering-example-${r.docType}`}>
                      {example}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex flex-col p-5" data-testid="doc-rules-card">
        <h2 className="text-sm font-medium">กฎอัตโนมัติของเอกสาร</h2>
        <div className="mt-2 divide-y">
          {/* 🔴 2 ตัวบนคือค่าเดียวกับหัวข้อย่อย "ใบกำกับภาษีอัตโนมัติ"/"ลิงก์สาธารณะและ QR"
              (สวิตช์ที่นี่ = เปิด/ปิด · หัวข้อย่อย = ตั้งละเอียด) — เขียนคีย์เดียวกัน ไม่มีค่าซ้ำสองที่ */}
          <ToggleRow
            name="autoTaxOnPayment"
            title="ออกใบกำกับภาษีอัตโนมัติเมื่อรับชำระ"
            desc="ใช้กับใบเสร็จรับเงินและใบแจ้งหนี้ที่จด VAT"
            defaultChecked={p.settings.autoTaxInvoice.mode === "ON_PAYMENT"}
          />
          <ToggleRow
            name="publicTaxRequest"
            title="เปิดลิงก์สาธารณะให้ลูกค้าขอใบกำกับภาษีเอง"
            desc="แนบ QR ท้ายใบเสร็จ · ลูกค้ากรอกเลขภาษีเองได้"
            defaultChecked={p.settings.taxRequest.enabled}
          />
          <ToggleRow
            name="lockNumberOnIssue"
            title="ล็อกเลขที่เอกสารเมื่อออกแล้ว"
            desc="แก้เลขที่ย้อนหลังไม่ได้ (แนะนำให้เปิดไว้)"
            defaultChecked={p.settings.rules.lockNumberOnIssue}
          />
          <ToggleRow
            name="warnOnGap"
            title="เตือนเมื่อเลขที่เอกสารข้ามลำดับ"
            desc="ส่งแจ้งเตือนให้ผู้ดูแลบัญชี"
            defaultChecked={p.settings.rules.warnOnGap}
          />
        </div>
        <CardFooter systemId={p.systemId} reset={p.actions.reset} />
      </section>
    </div>
  );
}

// ═══════════════ ② ข้อความท้ายเอกสาร + เงื่อนไขการชำระ ═══════════════

function NotesSection(p: DocSettingsPanelProps) {
  return (
    <section className="card flex flex-col gap-4 p-5" data-testid="notes-card">
      <div>
        <h2 className="text-sm font-medium">ข้อความท้ายเอกสาร</h2>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          พิมพ์ท้ายเอกสารแต่ละชนิด · เว้นว่างไว้ = ใช้ข้อความกลางของกิจการ
        </p>
      </div>
      {p.rows.map((r) => (
        <div key={r.docType} className="flex flex-col gap-2 border-t pt-3" data-testid={`note-${r.docType}`}>
          <div className="text-sm font-medium">{r.label}</div>
          <label className={label}>
            ข้อความท้ายเอกสาร
            <textarea
              name={`note_${r.docType}_footer`}
              defaultValue={p.settings.notes[r.docType]?.footer ?? ""}
              rows={2}
              maxLength={1000}
              className={input}
            />
          </label>
          <label className={label}>
            เงื่อนไขการชำระเงิน
            <input
              name={`note_${r.docType}_terms`}
              defaultValue={p.settings.notes[r.docType]?.terms ?? ""}
              maxLength={500}
              className={input}
            />
          </label>
        </div>
      ))}
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ③ ลิงก์สาธารณะและ QR (การแสดงข้อมูลสาธารณะ + ลิงก์ขอใบกำกับ) ═══════════════

function PublicSection(p: DocSettingsPanelProps) {
  const v = p.settings.publicView;
  const t = p.settings.taxRequest;
  return (
    <section className="card flex flex-col p-5" data-testid="public-card">
      <h2 className="text-sm font-medium">การแสดงข้อมูลสาธารณะ</h2>
      <div className="mt-2 divide-y">
        <ToggleRow
          name="publicEnabled"
          title="เปิดลิงก์ดูเอกสารสาธารณะ"
          desc="ลูกค้าเปิดลิงก์ /r/… ดูใบเสร็จได้โดยไม่ต้องเข้าระบบ"
          defaultChecked={v.enabled}
        />
        <ToggleRow name="showOutstanding" title="แสดงยอดค้างชำระ" desc="บอกลูกค้าว่ายังค้างอยู่เท่าไร" defaultChecked={v.showOutstanding} />
        <ToggleRow name="promptPayButton" title="แสดงปุ่มจ่ายด้วย PromptPay" desc="ลูกค้ากดจ่ายจากลิงก์ได้ทันที" defaultChecked={v.promptPayButton} />
      </div>
      <label className={`${label} mt-3`}>
        อายุลิงก์ (วัน) — 0 = ไม่หมดอายุ
        <input name="expiryDays" defaultValue={v.expiryDays} inputMode="numeric" className={`${input} w-28`} />
      </label>

      <h2 className="mt-5 border-t pt-4 text-sm font-medium">ลิงก์ให้ลูกค้าขอใบกำกับภาษี</h2>
      <div className="mt-2 divide-y">
        <ToggleRow
          name="taxRequestEnabled"
          title="เปิดให้ลูกค้าขอใบกำกับภาษีเอง"
          desc="แนบ QR ท้ายใบเสร็จ · ลูกค้ากรอกเลขภาษีเองได้"
          defaultChecked={t.enabled}
        />
      </div>
      <label className={`${label} mt-3`}>
        ข้อความบนใบเสร็จ (ข้าง QR)
        <input name="receiptText" defaultValue={t.receiptText} maxLength={200} className={input} />
      </label>
      <label className={`${label} mt-3`}>
        เงื่อนไข
        <input name="conditionNote" defaultValue={t.conditionNote} maxLength={200} className={input} />
      </label>
      <label className={`${label} mt-3`}>
        ยอดขั้นต่ำที่ขอได้ (บาท) — 0 = ไม่จำกัด
        <input
          name="minAmountBaht"
          defaultValue={(t.minAmountSatang / 100).toFixed(2)}
          inputMode="decimal"
          className={`${input} w-32`}
        />
      </label>
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ④ วันครบกำหนด ═══════════════

function DueSection(p: DocSettingsPanelProps) {
  const d = p.settings.due;
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="due-card">
      <h2 className="text-sm font-medium">วันครบกำหนดเริ่มต้น</h2>
      <p className="text-xs text-[color:var(--color-muted)]">
        ใช้เติมช่อง &quot;ครบกำหนด&quot; ให้อัตโนมัติตอนสร้างเอกสาร · เครดิตเทอมที่ตั้งไว้ที่ผู้ติดต่อรายนั้นจะถูกใช้ก่อนเสมอ
      </p>
      <label className={label}>
        ใบเสนอราคาใช้ได้กี่วัน
        <input name="quotationValidDays" defaultValue={d.quotationValidDays} inputMode="numeric" className={`${input} w-28`} />
      </label>
      <label className={label}>
        เครดิตเทอมของใบแจ้งหนี้ (วัน)
        <input name="invoiceCreditDays" defaultValue={d.invoiceCreditDays} inputMode="numeric" className={`${input} w-28`} />
      </label>
      <label className={label}>
        กำหนดส่งของใบสั่งซื้อ (วัน)
        <input name="purchaseOrderDueDays" defaultValue={d.purchaseOrderDueDays} inputMode="numeric" className={`${input} w-28`} />
      </label>
      <label className={label}>
        วิธีนับวัน
        <select name="dueBasis" defaultValue={d.basis} className={`${input} w-72`}>
          <option value="ISSUE">{DUE_BASIS_LABEL.ISSUE}</option>
          <option value="MONTH_END">{DUE_BASIS_LABEL.MONTH_END}</option>
        </select>
      </label>
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ⑤ ช่องทางรับชำระบนเอกสาร ═══════════════

function ChannelsSection(p: DocSettingsPanelProps) {
  const [order, setOrder] = useState(p.channels.map((c) => c.id));
  const byId = new Map(p.channels.map((c) => [c.id, c]));
  const move = (i: number, dir: -1 | 1) =>
    setOrder((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="channels-card">
      <h2 className="text-sm font-medium">ช่องทางการรับชำระเงินบนเอกสาร</h2>
      <p className="text-xs text-[color:var(--color-muted)]">
        แสดงเฉพาะช่องทางที่ติ๊ก &quot;แสดงบนเอกสาร&quot; ไว้ที่หน้าการเงิน · ลำดับที่นี่คือลำดับที่พิมพ์ลงกระดาษ
      </p>
      <input type="hidden" name="order" value={order.join(",")} />
      {order.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีช่องทางที่เลือกให้แสดงบนเอกสาร — เปิดได้ที่หน้า &quot;การเงิน › ช่องทางการเงิน&quot;
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="channel-order">
          {order.map((id, i) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <li key={id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.detail && <span className="ml-2 text-xs text-[color:var(--color-muted)]">{c.detail}</span>}
                </span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} className="btn btn-ghost btn-sm" aria-label="เลื่อนขึ้น">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="btn btn-ghost btn-sm" aria-label="เลื่อนลง">
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ⑥ แท็ก ═══════════════

function TagsSection(
  p: DocSettingsPanelProps & { pending: boolean; onMsg: (m: { ok: boolean; text: string }) => void },
) {
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  function run(action: Action, fd: FormData) {
    start(async () => {
      const res = await action(fd);
      p.onMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason });
      if (res.ok) setOpen(false);
    });
  }

  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="tags-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">กลุ่มจัดประเภท (แท็ก)</h2>
        <button
          type="button"
          data-testid="tag-add"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
        >
          + เพิ่มแท็ก
        </button>
      </div>
      {p.tags.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีแท็ก — แท็กช่วยจัดกลุ่มเอกสาร เช่น &quot;ทริปสิมิลัน&quot; หรือ &quot;ลูกค้าองค์กร&quot;
        </p>
      ) : (
        <ul className="flex flex-col divide-y" data-testid="tag-list">
          {p.tags.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-3 w-3 shrink-0 rounded-full ${TAG_DOT[t.color] ?? TAG_DOT.slate}`} />
                <span className="truncate font-medium">{t.name}</span>
                <span className="truncate text-xs text-[color:var(--color-muted)]">
                  {t.docTypes.length === 0
                    ? "ทุกชนิดเอกสาร"
                    : t.docTypes.map((dt) => p.docLabels[dt] ?? dt).join(" · ")}
                </span>
                {typeof t.usageCount === "number" && (
                  <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{t.usageCount} ใบ</span>
                )}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditing(t);
                    setOpen(true);
                  }}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("systemId", p.systemId);
                    fd.set("id", t.id);
                    run(p.actions.tagArchive, fd);
                  }}
                >
                  เก็บเข้ากรุ
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal open title={editing ? "แก้ไขแท็ก" : "เพิ่มแท็ก"} onClose={() => setOpen(false)} testId="tag-modal-box">
          <div className="flex flex-col gap-3" data-testid="tag-modal">
            <label className={label}>
              ชื่อแท็ก
              <input id="tag-name" defaultValue={editing?.name ?? ""} maxLength={40} className={input} />
            </label>
            <label className={label}>
              สี
              <select id="tag-color" defaultValue={editing?.color ?? "slate"} className={input}>
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {TAG_COLOR_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs text-[color:var(--color-muted)]">
                ใช้กับชนิดเอกสาร (ไม่เลือกเลย = ทุกชนิด)
              </legend>
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto text-sm">
                {p.rows.map((r) => (
                  <label key={r.docType} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="tagDocTypes"
                      value={r.docType}
                      defaultChecked={editing?.docTypes.includes(r.docType) ?? false}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy}
                data-testid="tag-save"
                className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("systemId", p.systemId);
                  if (editing) fd.set("id", editing.id);
                  fd.set("name", (document.getElementById("tag-name") as HTMLInputElement)?.value ?? "");
                  fd.set("color", (document.getElementById("tag-color") as HTMLSelectElement)?.value ?? "slate");
                  document
                    .querySelectorAll<HTMLInputElement>('input[name="tagDocTypes"]:checked')
                    .forEach((el) => fd.append("docTypes", el.value));
                  run(p.actions.tag, fd);
                }}
              >
                บันทึก
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

const TAG_DOT: Record<string, string> = {
  slate: "bg-[color:var(--color-tag-slate)]",
  blue: "bg-[color:var(--color-tag-blue)]",
  green: "bg-[color:var(--color-tag-green)]",
  amber: "bg-[color:var(--color-tag-amber)]",
  red: "bg-[color:var(--color-tag-red)]",
  purple: "bg-[color:var(--color-tag-purple)]",
};

// ═══════════════ ⑦ ใบกำกับภาษีอัตโนมัติ ═══════════════

function AutoTaxSection(p: DocSettingsPanelProps) {
  const a = p.settings.autoTaxInvoice;
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="autotax-card">
      <h2 className="text-sm font-medium">การออกใบกำกับภาษี</h2>
      <label className={label}>
        ออกใบกำกับภาษีอัตโนมัติเมื่อ
        <select name="mode" defaultValue={a.mode} data-testid="autotax-mode" className={`${input} w-72`}>
          {(["ON_PAYMENT", "ON_INVOICE", "MANUAL"] as const).map((m) => (
            <option key={m} value={m}>
              {AUTO_TAX_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="divide-y border-t pt-2">
        <ToggleRow
          name="posAbbreviated"
          title="ออกใบกำกับอย่างย่อจากบิลหน้าร้าน (POS)"
          desc="ปิดไว้ = บิล POS ยังลงบัญชีเหมือนเดิม แต่ไม่สร้างเอกสารใบกำกับอย่างย่อ"
          defaultChecked={a.posAbbreviated}
        />
      </div>
      <label className={label}>
        ข้อความตามกฎหมายท้ายใบกำกับ
        <textarea name="legalText" defaultValue={a.legalText} rows={3} maxLength={500} className={input} />
      </label>
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ⑧ เทมเพลตพิมพ์ ═══════════════

function PrintSection(p: DocSettingsPanelProps) {
  const [preview, setPreview] = useState(false);
  const pr = p.settings.print;
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="print-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">รายงานเอกสาร (เทมเพลตพิมพ์)</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="print-preview-open"
          disabled={!p.printSampleDocId}
          onClick={() => setPreview(true)}
        >
          ดูตัวอย่าง
        </button>
      </div>
      <label className={label}>
        เทมเพลต
        <select name="template" defaultValue={pr.template} data-testid="print-template" className={`${input} w-72`}>
          {(["STANDARD", "COMPACT", "WITH_IMAGES"] as const).map((t) => (
            <option key={t} value={t}>
              {PRINT_TEMPLATE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        ภาษาบนเอกสาร
        <select name="language" defaultValue={pr.language} data-testid="print-language" className={`${input} w-40`}>
          {(["TH", "EN"] as const).map((l) => (
            <option key={l} value={l}>
              {PRINT_LANGUAGE_LABEL[l]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1 border-t pt-3">
        <legend className="text-xs text-[color:var(--color-muted)]">ฟิลด์ที่แสดงบนเอกสาร</legend>
        <div className="grid grid-cols-2 gap-1 text-sm">
          {PRINT_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input type="checkbox" name={`field_${f}`} defaultChecked={pr.fields[f]} />
              {PRINT_FIELD_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>
      {preview && p.printSampleDocId && (
        <Modal open size="lg" title="ตัวอย่างเอกสารพิมพ์" onClose={() => setPreview(false)} testId="print-preview-modal">
          {/* ใช้หน้าพิมพ์ตัวจริงกับเอกสารจริง — พรีวิวที่วาดใหม่เองจะโกหกได้ */}
          <iframe
            title="ตัวอย่างเอกสาร"
            data-testid="print-preview-frame"
            src={`${p.base}/print/${p.printSampleDocId}`}
            className="h-[70vh] w-full rounded-lg border bg-white"
          />
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            ตัวอย่างใช้ตั้งค่าที่ &quot;บันทึกแล้ว&quot; — กดบันทึกก่อนถ้าเพิ่งแก้
          </p>
        </Modal>
      )}
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ⑨ บัญชีรายวันของเอกสาร ═══════════════

function AccountsSection(p: DocSettingsPanelProps) {
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="accounts-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">บัญชีรายวันของเอกสาร</h2>
        <Link href={`${p.base}/accounts/mapping`} className="btn btn-ghost btn-sm">
          ผังบัญชีและ mapping กลาง
        </Link>
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        เลือกบัญชีที่ใช้ลงรายการรายได้/ค่าใช้จ่ายของเอกสารแต่ละชนิด · เว้นว่าง = ใช้บัญชีกลางตาม mapping
      </p>
      <div className="flex flex-col divide-y">
        {p.docTypeAccounts.map((r) => (
          <label key={r.docType} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{r.label}</span>
            <select
              name={`acct_${r.docType}`}
              defaultValue={r.accountId ?? ""}
              data-testid={`acct-${r.docType}`}
              className={`${input} w-72`}
            >
              <option value="">— ใช้บัญชีกลาง —</option>
              {p.ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <CardFooter systemId={p.systemId} reset={p.actions.reset} />
    </section>
  );
}

// ═══════════════ ชิ้นส่วนร่วม ═══════════════

function ToggleRow({
  name,
  title,
  desc,
  defaultChecked,
  disabled,
  readOnlyHint,
}: {
  name: string;
  title: string;
  desc: string;
  defaultChecked: boolean;
  disabled?: boolean;
  readOnlyHint?: string;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-start justify-between gap-4 py-3.5" data-testid={`toggle-${name}`}>
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        <div className="text-xs text-[color:var(--color-muted)]">{disabled ? readOnlyHint ?? desc : desc}</div>
      </div>
      {!disabled && <input type="hidden" name={name} value={on ? "on" : "off"} />}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => !disabled && setOn(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          disabled ? "opacity-50" : ""
        }`}
        style={{ background: on ? "var(--color-ink)" : "var(--color-surface-2)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full"
          style={{ background: "var(--color-surface)", transform: `translateX(${on ? 22 : 2}px)` }}
        />
      </button>
    </div>
  );
}

/** ปุ่มท้ายการ์ด (f10: "คืนค่าเริ่มต้น" มีเส้นขอบ + "บันทึกการตั้งค่า" ปุ่มดำ) — footer อยู่ในการ์ด ไม่ลอย */
function CardFooter({ systemId, reset }: { systemId: string; reset: Action }) {
  const [busy, start] = useTransition();
  return (
    <div className="-mx-5 mt-4 flex justify-end gap-2 border-t px-5 pt-4">
      <button
        type="button"
        disabled={busy}
        data-testid="settings-reset"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const fd = new FormData();
          fd.set("systemId", systemId);
          start(async () => {
            await reset(fd);
          });
        }}
      >
        คืนค่าเริ่มต้น
      </button>
      <button
        type="submit"
        data-testid="settings-save"
        className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
      >
        บันทึกการตั้งค่า
      </button>
    </div>
  );
}

export default DocSettingsPanel;
