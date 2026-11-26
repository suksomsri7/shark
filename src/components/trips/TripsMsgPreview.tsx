"use client";
// TRIPS T1.8a ▸ ตัวอย่างข้อความถึงลูกค้า (ใบ T1.8 §4.8) — เลือกชนิด → ข้อความ th/en จากข้อความที่ยังไม่บันทึก (แก้ในกล่องนี้ได้) แทนค่าตัวอย่างคงที่
//   ร้าน = ชื่อจริง · ค่าอื่นสมมุติ · ด่านเดียวกับตอนส่ง (checkTripsMsgTemplate) · ไม่ผ่าน ⇒ ป้าย "ใช้ข้อความมาตรฐานแทน" + แสดงข้อความมาตรฐาน · ไม่อ่านการจองจริง ◂
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SettingsField } from "@/components/settings/settings-shared";
import { TRIPS_MSG_KINDS_A, checkTripsMsgTemplate, tripsMsgVars, tripsPreviewWith, tripsTplIssueTh, type TripsMsgKindA } from "@/lib/modules/trips/notify-core";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const textOf = (v: unknown, l: "th" | "en") => (typeof v === "string" ? (l === "th" ? v : "") : isRec(v) && typeof v[l] === "string" ? (v[l] as string) : "");
const BOX = "min-h-24 w-full min-w-0 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";

export default function TripsMsgPreview({ fields, shopName }: { fields: readonly SettingsField[]; shopName: string }) {
  const t = useTranslations("trips");
  const byKind = useMemo(() => new Map(fields.map((f) => [f.key.slice("trips.msg.".length), f])), [fields]);
  const kinds = TRIPS_MSG_KINDS_A.filter((k) => byKind.has(k));
  const [kind, setKind] = useState<TripsMsgKindA>(kinds[0] ?? "confirmation");
  const field = byKind.get(kind);
  const [draft, setDraft] = useState<Record<string, { th: string; en: string }>>({});
  const cur = draft[kind] ?? { th: textOf(field?.value, "th"), en: textOf(field?.value, "en") };
  const value = { th: cur.th, en: cur.en };
  const check = checkTripsMsgTemplate(kind, value);
  const sample = (l: "th" | "en") =>
    tripsMsgVars(
      { shopName, code: "TR-0001", productTitle: { th: "ทริปตัวอย่าง", en: "Sample trip" }, meetingPoint: null, travelDate: "2027-03-02", tz: "Asia/Bangkok", link: "https://example.invalid/book/my", pickup: { time: "07:30", place: l === "en" ? "Hotel lobby" : "ล็อบบี้โรงแรม" }, outstandingSatang: 150_000, dueAt: new Date("2027-03-01T13:00:00.000Z") },
      l,
    );
  const out = (l: "th" | "en") => tripsPreviewWith(kind, value, sample(l), l, field?.templateValue);
  if (!kinds.length) return null;
  const edit = (l: "th" | "en", v: string) => setDraft((d) => ({ ...d, [kind]: { ...cur, [l]: v } }));
  return (
    <section data-testid="trips-msg-preview" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[color:var(--color-ink)]">{t("settings.msgPreview.title")}</h2>
        <label className="flex items-center gap-2 text-sm">
          {t("settings.msgPreview.kind")}
          <select data-testid="trips-msg-preview-kind" value={kind} onChange={(e) => setKind(e.target.value as TripsMsgKindA)} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-2">
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`bk.msg.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-[color:var(--color-muted)]">{t("settings.msgPreview.sample")}</p>
      {!check.ok ? (
        <div data-testid="trips-msg-preview-fallback" role="note" className="rounded-lg border-2 border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
          <p className="font-bold">{`${t("bk.msg.fallback")} · ${t("settings.msgPreview.fallback")}`}</p>
          <ul className="list-disc pl-5">
            {check.issues.map((i, ix) => (
              <li key={ix}>{tripsTplIssueTh(i)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        {(["th", "en"] as const).map((l) => (
          <div key={l} className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium">{t(`settings.msgPreview.${l}`)}</span>
            <textarea data-testid={`trips-msg-preview-input-${l}`} value={cur[l]} onChange={(e) => edit(l, e.target.value)} className={BOX} />
            <p data-testid={`trips-msg-preview-${l}`} className="whitespace-pre-wrap break-words rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
              {out(l).text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
