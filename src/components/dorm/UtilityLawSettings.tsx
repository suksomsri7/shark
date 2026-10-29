'use client';
// SVC D.7 ▸ จอ "ค่าน้ำไฟ · กฎหมาย · VAT" (ภาพ ledger/design-dorm/10-settings-law.png) — สัญญา ledger/svc-briefs/svc-brief-d.7.md §5
//   • ป้าย/ตัวเลือก/สิทธิ์ของทุกช่องค่าตั้งมาจาก model.form (ทะเบียน R0.3) — ไม่ฮาร์ดโค้ดตัวเลือก
//   • บันทึกค่าตั้งผ่าน actions.save ด้วย submissionFor (ส่งเฉพาะคีย์ที่แตะ) · โหมดกฎหมายผ่าน actions.setLegalMode เท่านั้น
//   • ไม่ import action/prisma/โมดูล server · ไม่ใช้ hook ของ Next (renderToStaticMarkup ได้) · ลิงก์ใช้ <a>
import { useState, useTransition } from "react";
import type { DormLawModel } from "@/lib/modules/dorm";
import { formatFieldValue, parseFieldInput, submissionFor, valueToInputText, type SettingsField } from "@/components/settings/settings-shared";
import DormSettingsNav from "./DormSettingsNav";

type Kind = "ELEC" | "WATER";
type ActionResult = { ok: boolean; code?: string; reason?: string; issues?: { messageTh: string }[] } | null | undefined;
type Actions = {
  save: (changes: unknown, opts?: { ackLegalWarn?: boolean }) => Promise<ActionResult>;
  reset: (target: { key: string; scope: string; scopeId: string }) => Promise<ActionResult>;
  setLegalMode: (input: { mode: string; reason?: string | null; evidence?: { dataUrl: string }[] }) => Promise<ActionResult>;
  recordBill: (input: { kind: Kind; periodKey: string; buildingId: string | null; amount: string; units: string; photo?: { dataUrl: string } | null }) => Promise<ActionResult>;
  accept: (input: { kind: Kind; periodKey: string; buildingId: string | null; reason: string; fingerprint: string | null }) => Promise<ActionResult>;
};
type Props = { model: DormLawModel; unitSlug: string; actions: Actions };

const KIND_TH: Record<Kind, { title: string; authority: string }> = {
  ELEC: { title: "ค่าไฟฟ้า", authority: "การไฟฟ้า" },
  WATER: { title: "ค่าน้ำประปา", authority: "การประปา" },
};
const TAX_TH: Record<string, string> = { EXEMPT: "ยกเว้น VAT", VAT7: "VAT 7%", NONE: "ไม่มี VAT" };
const MODE_HINT_TH: Record<string, string> = {
  STRICT: "อัตราน้ำไฟเกินต้นทุน · ค่าขั้นต่ำ · ประกันรวมล่วงหน้าเกินเพดาน → ออกบิล/บันทึกไม่ได้",
  WARN: "ออกบิลได้เมื่อเจ้าของกิจการกดยอมรับพร้อมเหตุผล · เก็บประวัติว่าใครยืนยันเมื่อไร",
  OUT_OF_SCOPE: "เช่น ให้เช่าไม่ถึง 3 ห้อง หรือหอพักนักศึกษาที่มีใบอนุญาต · ต้องระบุเหตุผลและแนบหลักฐาน",
};

const groupDigits = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function thb(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}฿${groupDigits(String(Math.floor(a / 100)))}.${String(a % 100).padStart(2, "0")}`;
}
const msgOf = (r: ActionResult, fallback: string): string => (r && !r.ok ? (r.reason ?? r.issues?.[0]?.messageTh ?? fallback) : "");

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const chipCls = (on: boolean) =>
  `inline-flex min-h-10 items-center rounded-xl border px-3.5 text-[13.5px] disabled:cursor-not-allowed disabled:opacity-60 ${
    on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)] text-[color:var(--color-ink-soft)]"
  }`;
const cardCls = "flex min-w-0 flex-col gap-4 rounded-2xl border bg-[color:var(--color-surface)] p-5";
const labelCls = "w-28 flex-none text-[13.5px] font-semibold text-[color:var(--color-muted)]";
const inputCls = "min-h-10 min-w-0 rounded-xl border bg-[color:var(--color-surface)] px-3 text-sm tabular-nums";
const btnCls = "min-h-10 rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-50";

export default function UtilityLawSettings({ model, unitSlug, actions }: Props) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const fields = new Map<string, SettingsField>();
  for (const g of model.form.groups) for (const f of g.fields) fields.set(f.key, f);
  const field = (key: string) => fields.get(key) ?? null;

  const run = (job: () => Promise<ActionResult>, okText: string, failText: string) =>
    start(async () => {
      try {
        const r = await job();
        setNotice(r && r.ok ? { ok: true, text: okText } : { ok: false, text: msgOf(r, failText) || failText });
      } catch {
        setNotice({ ok: false, text: failText });
      }
    });

  /** บันทึกค่าตั้ง 1 คีย์ผ่านเครื่องยนต์ (submissionFor = ส่งเฉพาะคีย์ที่แตะ · ไม่ส่งถ้าไม่เปลี่ยน/แก้ไม่ได้) */
  const saveKey = (key: string, value: unknown) => {
    const { changes } = submissionFor(model.form, { [key]: value }, new Set());
    if (!changes.length) return;
    run(() => actions.save(changes), "บันทึกค่าตั้งแล้ว", "บันทึกค่าตั้งไม่สำเร็จ");
  };

  const prev = shiftPeriod(model.periodKey, -1);
  const next = shiftPeriod(model.periodKey, 1);

  return (
    <div data-dorm-law="" data-period={model.periodKey} className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
      <DormSettingsNav unitSlug={unitSlug} active="utility" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[color:var(--color-muted)]">{model.unitName}</p>
            <h1 className="text-2xl font-bold">ค่าน้ำไฟ · กฎหมาย · VAT</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <a className={chipCls(false)} href={`?period=${prev}`} aria-label="งวดก่อนหน้า">‹</a>
            <span className="tabular-nums font-semibold">{`งวด ${model.periodKey}`}</span>
            <a className={chipCls(false)} href={`?period=${next}`} aria-label="งวดถัดไป">›</a>
          </div>
        </header>
        {notice ? (
          <p role="status" className={`rounded-xl border p-3 text-[13px] ${notice.ok ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-danger)]"}`}>
            {notice.text}
          </p>
        ) : null}
        <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="flex min-w-0 flex-col gap-5">
            {(["ELEC", "WATER"] as const).map((k) => (
              <UtilityCard key={k} kind={k} model={model} field={field} saveKey={saveKey} pending={pending} run={run} actions={actions} />
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <LegalCard model={model} field={field} pending={pending} run={run} actions={actions} />
            <LegalCheck model={model} pending={pending} run={run} actions={actions} />
            <VatCard field={field} saveKey={saveKey} pending={pending} />
            <BillingCard unitSlug={unitSlug} field={field} />
          </div>
        </div>
      </div>
    </div>
  );
}

function shiftPeriod(p: string, k: number): string {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7)) - 1 + k;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, "0")}-${String(mm + 1).padStart(2, "0")}`;
}

type FieldFn = (key: string) => SettingsField | null;
type RunFn = (job: () => Promise<ActionResult>, okText: string, failText: string) => void;

/** ปุ่มเม็ดของตัวเลือก enum — ค่า/ป้ายจากทะเบียน · แก้ไม่ได้ ⇒ disabled */
function OptionChips({ f, attr, onPick, pending }: { f: SettingsField; attr: string; onPick: (v: string) => void; pending: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {(f.options ?? []).map((o) => {
        const on = f.value === o.value;
        const a: Record<string, string> = { [attr]: o.value, "data-selected": on ? "true" : "false" };
        return (
          <button key={o.value} type="button" {...a} aria-pressed={on} disabled={!f.editable || pending} onClick={() => onPick(o.value)} className={chipCls(on)}>
            {o.labelTh}
          </button>
        );
      })}
    </div>
  );
}

function UtilityCard({ kind, model, field, saveKey, pending, run, actions }: { kind: Kind; model: DormLawModel; field: FieldFn; saveKey: (k: string, v: unknown) => void; pending: boolean; run: RunFn; actions: Actions }) {
  const sub = kind === "ELEC" ? "elec" : "water";
  const metering = field(`rooms.utility.${sub}.metering`);
  const method = field(`rooms.utility.${sub}.method`);
  const fixedRate = field(`rooms.utility.${sub}.fixedRate`);
  const flat = field(`rooms.utility.${sub}.flat`);
  const tariffRef = field(`rooms.utility.${sub}.tariffRef`);
  const minimum = field("rooms.utility.minimum");
  const basis = field("rooms.utility.sharedBasis");
  const bills = model.bills.filter((b) => b.kind === kind);
  const bill = bills[0] ?? null;
  const th = KIND_TH[kind];
  const [rateText, setRateText] = useState(valueToInputText({ type: "money" }, fixedRate?.value ?? null));
  const [refText, setRefText] = useState(typeof tariffRef?.value === "string" ? tariffRef.value : "");
  const flatVal = flat && isFlat(flat.value) ? flat.value : null;
  const [flatPer, setFlatPer] = useState<"ROOM" | "PERSON">(flatVal ? flatVal.per : "ROOM");
  const [flatText, setFlatText] = useState(flatVal ? valueToInputText({ type: "money" }, flatVal.satang) : "");
  const [minOpen, setMinOpen] = useState(false);
  const [minText, setMinText] = useState("");
  const [amount, setAmount] = useState("");
  const [units, setUnits] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  // H8: ขอบเขตของบิลที่จะใส่ — ทั้งหน่วย ("") หรือรายอาคาร · ค่าเริ่ม = ขอบเขตของบิลเดิม / อาคารเดียวของหอ
  const [scopeB, setScopeB] = useState<string>(bill ? (bill.buildingId ?? "") : model.buildings.length === 1 ? model.buildings[0].id : "");
  const [localErr, setLocalErr] = useState("");

  const hintOf = (v: string): string => {
    if (v === "ACTUAL_COST") return bill?.costRateSatangPerUnit != null ? `${bill.periodKey} ${thb(bill.costRateSatangPerUnit)}/หน่วย` : "รอบิลงวดนี้";
    if (v === "FIXED_RATE") return fixedRate && typeof fixedRate.value === "number" ? `${thb(fixedRate.value)} / หน่วย` : "฿ ___ / หน่วย";
    if (v === "FLAT") return flatVal ? `${thb(flatVal.satang)} / ${flatVal.per === "PERSON" ? "คน" : "ห้อง"}` : "฿ ___";
    if (v === "TARIFF") return tariffRef && typeof tariffRef.value === "string" ? tariffRef.value : "อัปเดตตามงวด";
    return "";
  };
  const saveMoney = (f: SettingsField | null, text: string) => {
    if (!f) return;
    const p = parseFieldInput(f, text);
    if (!p.ok) return setLocalErr(p.messageTh);
    setLocalErr("");
    saveKey(f.key, p.value);
  };

  const minOn = minimum !== null && minimum.value !== null && minimum.value !== undefined;
  const submitBill = () => {
    if (!amount.trim()) return setLocalErr("กรอกยอดบิลเป็นบาท เช่น 19,824.00");
    setLocalErr("");
    run(
      async () => {
        const dataUrl = photo ? await readDataUrl(photo) : null;
        return actions.recordBill({ kind, periodKey: model.periodKey, buildingId: scopeB || null, amount: amount.trim(), units: units.trim(), photo: dataUrl ? { dataUrl } : null });
      },
      `บันทึกบิล${th.authority}แล้ว`,
      `บันทึกบิล${th.authority}ไม่สำเร็จ`,
    );
  };

  return (
    <section data-utility-card={kind} className={cardCls}>
      <h2 className="flex items-center gap-2 text-[17px] font-bold">
        <span className="min-w-0 flex-1">{th.title}</span>
        <span className="rounded-lg border px-2.5 py-1 text-xs font-semibold">{`ใช้กับ ${model.scope.roomCount} ห้อง`}</span>
      </h2>

      {metering ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className={labelCls}>วิธีวัด</span>
          <OptionChips f={metering} attr="data-metering-option" pending={pending} onPick={(v) => saveKey(metering.key, v)} />
        </div>
      ) : null}

      {method ? (
        <div className="flex flex-wrap items-start gap-3">
          <span className={`${labelCls} pt-2.5`}>
            วิธีคิดเงิน
            {method.pendingLegalReview ? <span className="mt-1 block text-[11px] font-normal">รอที่ปรึกษากฎหมายตรวจ</span> : null}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {(method.options ?? []).map((o) => {
              const on = method.value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-method-option={o.value}
                  data-selected={on ? "true" : "false"}
                  aria-pressed={on}
                  disabled={!method.editable || pending}
                  onClick={() => saveKey(method.key, o.value)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left text-sm disabled:cursor-not-allowed ${on ? "border-[color:var(--color-ink)] font-semibold" : ""}`}
                >
                  <span aria-hidden className={`h-4 w-4 flex-none rounded-full border ${on ? "border-[5px] border-[color:var(--color-ink)]" : ""}`} />
                  <span className="min-w-0 flex-1">{o.labelTh}</span>
                  <small className="whitespace-nowrap text-xs font-normal text-[color:var(--color-muted)]">{hintOf(o.value)}</small>
                </button>
              );
            })}
            {method.value === "FIXED_RATE" && fixedRate ? (
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label={fixedRate.labelTh} className={`${inputCls} w-32`} value={rateText} disabled={!fixedRate.editable} onChange={(e) => setRateText(e.target.value)} />
                <span className="text-xs text-[color:var(--color-muted)]">บาท / หน่วย</span>
                <button type="button" className={btnCls} disabled={!fixedRate.editable || pending} onClick={() => saveMoney(fixedRate, rateText)}>บันทึก</button>
              </div>
            ) : null}
            {method.value === "FLAT" && flat ? (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="คิดต่อ" className={inputCls} value={flatPer} disabled={!flat.editable} onChange={(e) => setFlatPer(e.target.value === "PERSON" ? "PERSON" : "ROOM")}>
                  <option value="ROOM">ต่อห้อง</option>
                  <option value="PERSON">ต่อคน</option>
                </select>
                <input aria-label={flat.labelTh} className={`${inputCls} w-32`} value={flatText} disabled={!flat.editable} onChange={(e) => setFlatText(e.target.value)} />
                <span className="text-xs text-[color:var(--color-muted)]">บาท / เดือน</span>
                <button
                  type="button"
                  className={btnCls}
                  disabled={!flat.editable || pending}
                  onClick={() => {
                    const p = parseFieldInput({ type: "money", labelTh: flat.labelTh, nullable: false, min: 0, max: 1_000_000_000, options: null }, flatText);
                    if (!p.ok) return setLocalErr(p.messageTh);
                    setLocalErr("");
                    saveKey(flat.key, { per: flatPer, satang: p.value });
                  }}
                >
                  บันทึก
                </button>
              </div>
            ) : null}
            {method.value === "TARIFF" && tariffRef ? (
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label={tariffRef.labelTh} placeholder="PEA:1.1.2" className={`${inputCls} w-40`} value={refText} disabled={!tariffRef.editable} onChange={(e) => setRefText(e.target.value)} />
                <button type="button" className={btnCls} disabled={!tariffRef.editable || pending} onClick={() => saveKey(tariffRef.key, refText.trim() ? refText.trim() : null)}>
                  บันทึก
                </button>
                {tariffRef.helpTh ? <span className="w-full text-xs text-[color:var(--color-muted)]">{tariffRef.helpTh}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div data-authority-bill={kind} className="rounded-xl bg-[color:var(--color-surface-2)] p-3.5 text-[13.5px] leading-relaxed tabular-nums text-[color:var(--color-ink-soft)]">
        {bills.length && bills[0].billSatang !== null ? (
          bills.map((b) => (
            <p key={`${b.buildingId ?? "-"}`}>
              {`บิล${th.authority}${b.buildingId ? ` ${buildingName(model, b.buildingId)}` : model.buildings.length > 1 ? " ทั้งหน่วย" : ""} งวด ${b.periodKey} ${thb(b.billSatang ?? 0)} ÷ ${groupDigits(String(b.units ?? 0))} หน่วย = `}
              <b className="text-[color:var(--color-ink)]">{b.costRateSatangPerUnit !== null ? `${thb(b.costRateSatangPerUnit)} / หน่วย` : "—"}</b>
              {b.hasPhoto ? " · แนบรูปบิลแล้ว" : " · ยังไม่แนบรูปบิล"}
              {b.periodKey !== model.periodKey ? ` · งวด ${model.periodKey} ยังไม่ได้ใส่บิล` : ""}
            </p>
          ))
        ) : (
          `ยังไม่ได้ใส่บิล${th.authority}ของงวด ${model.periodKey} — คิดตามต้นทุนจริงหรือเฉลี่ยมิเตอร์รวมได้เมื่อใส่บิลแล้ว`
        )}
      </div>

      {model.canRecordBill ? (
        <form
          data-authority-bill-form={kind}
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitBill();
          }}
        >
          {model.buildings.length ? (
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              ขอบเขตบิล
              <select data-bill-input="building" className={inputCls} value={scopeB} onChange={(e) => setScopeB(e.target.value)}>
                <option value="">ทั้งหน่วย (ทุกอาคาร)</option>
                {model.buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            {`ยอดบิล${th.authority} (บาท)`}
            <input data-bill-input="amount" inputMode="decimal" className={`${inputCls} w-36`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            หน่วยรวมตามบิล
            <input data-bill-input="units" inputMode="numeric" className={`${inputCls} w-28`} value={units} onChange={(e) => setUnits(e.target.value)} placeholder="ว่าง = มิเตอร์รวม" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            รูปบิล
            <input type="file" accept="image/*" className="max-w-52 text-xs" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className={btnCls} disabled={pending}>{`บันทึกบิลงวด ${model.periodKey}`}</button>
        </form>
      ) : null}

      {kind === "ELEC" && minimum ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className={labelCls}>{minimum.labelTh}</span>
          <button
            type="button"
            role="switch"
            data-minimum=""
            aria-checked={minOn}
            aria-label={minimum.labelTh}
            disabled={!minimum.editable || pending}
            onClick={() => (minOn ? saveKey(minimum.key, null) : setMinOpen((x) => !x))}
            className={`relative h-6 w-11 flex-none rounded-full border disabled:opacity-60 ${minOn ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface-2)]"}`}
          >
            <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[color:var(--color-surface)] ${minOn ? "right-0.5" : "left-0.5"}`} />
          </button>
          <span className="rounded-xl border px-3 py-2 text-sm tabular-nums">{`${formatFieldValue(minimum, minimum.value)} / เดือน`}</span>
          {minOpen && !minOn ? (
            <span className="flex items-center gap-2">
              <input aria-label="จำนวนค่าขั้นต่ำ (บาท)" className={`${inputCls} w-28`} value={minText} onChange={(e) => setMinText(e.target.value)} />
              <button type="button" className={btnCls} disabled={pending} onClick={() => saveMoney(minimum, minText)}>เปิดใช้</button>
            </span>
          ) : null}
          <span className="w-full text-xs text-[color:var(--color-muted)]">{minOn ? "เปิดอยู่ · ประกาศห้ามเก็บค่าขั้นต่ำ — โหมดเข้มงวดจะไม่ให้ออกบิล" : "ปิดอยู่ · ถ้าเปิดในโหมดเข้มงวด ระบบจะไม่ให้บันทึก"}</span>
        </div>
      ) : null}

      {kind === "WATER" && basis ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className={labelCls}>{basis.labelTh}</span>
          <OptionChips f={basis} attr="data-shared-basis" pending={pending} onPick={(v) => saveKey(basis.key, v)} />
          {basis.helpTh ? <span className="w-full text-xs text-[color:var(--color-muted)]">{basis.helpTh}</span> : null}
        </div>
      ) : null}

      {localErr ? <p className="text-[13px] text-[color:var(--color-danger)]">{localErr}</p> : null}
    </section>
  );
}

const buildingName = (model: DormLawModel, id: string) => model.buildings.find((b) => b.id === id)?.name ?? "อาคาร";

function isFlat(v: unknown): v is { per: "ROOM" | "PERSON"; satang: number } {
  return !!v && typeof v === "object" && !Array.isArray(v) && ((v as { per?: unknown }).per === "ROOM" || (v as { per?: unknown }).per === "PERSON") && typeof (v as { satang?: unknown }).satang === "number";
}

function LegalCard({ model, field, pending, run, actions }: { model: DormLawModel; field: FieldFn; pending: boolean; run: RunFn; actions: Actions }) {
  const f = field("rooms.legal.mode");
  const bt = field("rooms.general.businessType");
  const [oosOpen, setOosOpen] = useState(false);
  const [reason, setReason] = useState(model.legal.outOfScopeReason ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const editable = model.legal.editable;
  const options = f?.options ?? [];
  const btLabel = bt ? formatFieldValue(bt, model.scope.businessType) : model.scope.businessType;

  const pick = (mode: string) => {
    if (mode === "OUT_OF_SCOPE") return setOosOpen(true);
    setOosOpen(false);
    run(() => actions.setLegalMode({ mode }), "เปลี่ยนโหมดตามกฎหมายแล้ว", "เปลี่ยนโหมดไม่สำเร็จ");
  };
  const submitOos = () =>
    run(
      async () => {
        const evidence = await Promise.all(files.slice(0, 3).map(async (x) => ({ dataUrl: await readDataUrl(x) })));
        return actions.setLegalMode({ mode: "OUT_OF_SCOPE", reason, ...(evidence.length ? { evidence } : {}) });
      },
      "บันทึกโหมดนอกขอบเขตแล้ว",
      "บันทึกโหมดนอกขอบเขตไม่สำเร็จ",
    );

  return (
    <section data-legal-card="" className={cardCls}>
      <h2 className="text-[17px] font-bold">{f?.labelTh ?? "โหมดตามกฎหมาย"}</h2>
      <p className="-mt-2 text-[13px] text-[color:var(--color-muted)]">
        {`ระบบตรวจให้: ${model.scope.roomCount} ห้อง · ${btLabel} → `}
        <b className="text-[color:var(--color-ink)]">{model.scope.inScope ? "อยู่ในขอบเขตประกาศ สคบ. 2568" : "นอกขอบเขตประกาศ สคบ. 2568"}</b>
        {model.scope.autoReasonTh ? ` (${model.scope.autoReasonTh})` : " (≥ 3 ห้อง)"}
      </p>
      <div className="flex flex-col gap-2.5">
        {options.map((o) => {
          const on = model.legal.mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              data-legal-mode-option={o.value}
              data-selected={on ? "true" : "false"}
              aria-pressed={on}
              disabled={!editable || pending}
              onClick={() => pick(o.value)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left disabled:cursor-not-allowed ${on ? "border-2 border-[color:var(--color-ink)]" : ""}`}
            >
              <span aria-hidden className={`mt-0.5 h-5 w-5 flex-none rounded-full border ${on ? "border-[6px] border-[color:var(--color-ink)]" : ""}`} />
              <span className="flex min-w-0 flex-col gap-1">
                <b className="text-[15px]">{o.labelTh}</b>
                <small className="text-xs text-[color:var(--color-muted)]">{MODE_HINT_TH[o.value] ?? ""}</small>
              </span>
            </button>
          );
        })}
      </div>
      {!editable && model.legal.lockedReasonTh ? <p className="text-[13px] text-[color:var(--color-muted)]">{model.legal.lockedReasonTh}</p> : null}
      {model.legal.mode === "OUT_OF_SCOPE" ? (
        <p className="text-[13px] text-[color:var(--color-ink-soft)]">{`เหตุผล: ${model.legal.outOfScopeReason ?? "—"} · หลักฐาน ${model.legal.evidenceCount} ไฟล์`}</p>
      ) : null}
      {editable && oosOpen ? (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เหตุผลที่อยู่นอกขอบเขต (อย่างน้อย 10 ตัวอักษร)
            <textarea className="min-h-20 rounded-xl border p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            {model.scope.inScope ? "หลักฐาน (จำเป็น · รูปหรือ PDF ไม่เกิน 3 ไฟล์ · เก็บเป็นไฟล์ส่วนตัว)" : "หลักฐาน (ถ้ามี · รูปหรือ PDF)"}
            <input type="file" accept="image/*,application/pdf" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          <div className="flex gap-2">
            <button type="button" className={btnCls} disabled={pending} onClick={submitOos}>บันทึกโหมดนอกขอบเขต</button>
            <button type="button" className="min-h-10 rounded-xl border px-4 text-sm" onClick={() => setOosOpen(false)}>ยกเลิก</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LegalCheck({ model, pending, run, actions }: { model: DormLawModel; pending: boolean; run: RunFn; actions: Actions }) {
  return (
    <section data-legal-check="" className={cardCls}>
      <h2 className="text-[17px] font-bold">{`ผลตรวจค่าน้ำไฟ งวด ${model.periodKey}`}</h2>
      {(["ELEC", "WATER"] as const).map((k) => {
        const blocks = model.check.blocks.filter((b) => b.kind === k);
        const needs = model.check.needsAcceptance.filter((b) => b.kind === k);
        const level = blocks.length ? "BLOCK" : needs.length ? "WARN" : "OK";
        const buildings = [...new Set(needs.map((n) => n.buildingId))];
        return (
          <div key={k} data-legal-row={k} data-level={level} className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="min-w-0 flex-1">{KIND_TH[k].title}</span>
              <span className={level === "OK" ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-danger)]"}>
                {level === "OK" ? "ผ่าน" : level === "WARN" ? "ต้องยืนยัน" : "ออกบิลไม่ได้"}
              </span>
            </div>
            {[...blocks, ...needs].map((it, i) => (
              <p key={`${it.code}-${i}`} className="text-[13px] leading-relaxed text-[color:var(--color-ink-soft)]">{it.messageTh}</p>
            ))}
            {needs.length && model.canAccept
              ? buildings.map((b) => (
                  <AcceptForm
                    key={b ?? "-"}
                    kind={k}
                    buildingId={b}
                    periodKey={model.periodKey}
                    fingerprint={model.fingerprints.find((f) => f.kind === k && f.buildingId === b)?.fingerprint ?? null}
                    pending={pending}
                    run={run}
                    actions={actions}
                  />
                ))
              : null}
            {needs.length && !model.canAccept ? <p className="text-[13px] font-semibold text-[color:var(--color-muted)]">รอเจ้าของยืนยัน</p> : null}
          </div>
        );
      })}
    </section>
  );
}

/** N1: ปุ่มยอมรับส่ง fingerprint ที่เจ้าของเห็นตอนโหลดหน้า — บิล/อัตราเปลี่ยนระหว่างนั้น ⇒ service ตอบ STALE (ไม่ยอมรับเงียบ) */
function AcceptForm({ kind, buildingId, periodKey, fingerprint, pending, run, actions }: { kind: Kind; buildingId: string | null; periodKey: string; fingerprint: string | null; pending: boolean; run: RunFn; actions: Actions }) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="เหตุผลการยอมรับ" placeholder="เหตุผล (อย่างน้อย 10 ตัวอักษร)" className={`${inputCls} min-w-0 flex-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        type="button"
        data-accept-legal={kind}
        className={btnCls}
        disabled={pending}
        data-fingerprint={fingerprint ?? ""}
        onClick={() => run(() => actions.accept({ kind, periodKey, buildingId, reason, fingerprint }), "บันทึกการยอมรับของเจ้าของแล้ว", "ยอมรับคำเตือนไม่สำเร็จ")}
      >
        ยอมรับคำเตือน
      </button>
    </div>
  );
}

function VatCard({ field, saveKey, pending }: { field: FieldFn; saveKey: (k: string, v: unknown) => void; pending: boolean }) {
  const reg = field("rooms.vat.registered");
  const incl = field("rooms.vat.pricesIncludeVat");
  const kinds = field("rooms.vat.taxKinds");
  const registered = reg?.value === true;
  const tk = kinds && kinds.value && typeof kinds.value === "object" && !Array.isArray(kinds.value) ? (kinds.value as Record<string, unknown>) : {};
  const taxTh = (slot: string) => TAX_TH[String(tk[slot] ?? "")] ?? "—";
  const sw = (f: SettingsField | null) =>
    f ? (
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[color:var(--color-muted)]">{f.labelTh}</span>
        <button
          type="button"
          role="switch"
          aria-checked={f.value === true}
          aria-label={f.labelTh}
          disabled={!f.editable || pending}
          onClick={() => saveKey(f.key, f.value !== true)}
          className={chipCls(f.value === true)}
        >
          {formatFieldValue(f, f.value)}
        </button>
      </div>
    ) : null;
  return (
    <section data-vat-card="" data-vat-registered={registered ? "true" : "false"} className={cardCls}>
      <h2 className="text-[17px] font-bold">VAT · แยกบรรทัดอัตโนมัติ</h2>
      {sw(reg)}
      <p className="text-[13px] text-[color:var(--color-muted)]">
        {registered ? "จด VAT แล้ว — บิลแยกบรรทัดตามชนิดภาษีด้านล่าง" : "ยังไม่ได้จด VAT — บิลไม่มี VAT · ตารางล่าง = สิ่งที่ระบบจะทำเมื่อจด VAT"}
      </p>
      {sw(incl)}
      <table className="w-full text-[13.5px]">
        <tbody>
          <tr className="border-t first:border-t-0">
            <td className="py-2">ค่าห้อง (ที่อยู่อาศัย)</td>
            <td className="py-2 text-right font-bold">{taxTh("RENT")}</td>
          </tr>
          <tr className="border-t">
            <td className="py-2">ค่าไฟ · ค่าน้ำ (คิดตามหน่วย)</td>
            <td className="py-2 text-right font-bold">{taxTh("ELEC") === taxTh("WATER") ? taxTh("ELEC") : `${taxTh("ELEC")} / ${taxTh("WATER")}`}</td>
          </tr>
          <tr className="border-t">
            <td className="py-2">ส่วนกลาง · บริการอื่น</td>
            <td className="py-2 text-right font-bold">{taxTh("COMMON")}</td>
          </tr>
        </tbody>
      </table>
      {kinds?.helpTh ? <p className="text-xs text-[color:var(--color-muted)]">{kinds.helpTh}</p> : null}
    </section>
  );
}

function BillingCard({ unitSlug, field }: { unitSlug: string; field: FieldFn }) {
  const rounding = field("rooms.money.rounding");
  return (
    <section className={cardCls}>
      <h2 className="flex items-center gap-2 text-[17px] font-bold">
        <span className="min-w-0 flex-1">รอบบิล · ค่าปรับ</span>
        <a href={`/app/u/${unitSlug}/dorm/settings`} className="text-sm font-semibold text-[color:var(--color-accent)]">ตั้งที่ &quot;นโยบาย&quot;</a>
      </h2>
      <p className="text-[13px] text-[color:var(--color-muted)]">วันออกบิล วันครบกำหนด ค่าปรับชำระล่าช้า และการเก็บค่าน้ำไฟล่วงหน้า/ย้อนหลัง ตั้งในหน้านโยบาย</p>
      {rounding ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 text-[color:var(--color-muted)]">{rounding.labelTh}</span>
          <b>{formatFieldValue(rounding, rounding.value)}</b>
        </div>
      ) : null}
    </section>
  );
}
