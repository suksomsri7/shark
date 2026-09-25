"use client";

// CrmScoringManager.tsx — หน้าจอ "คะแนนผู้ติดต่อ" ของ CRM v2 (ใบ C2.8 · พิมพ์เขียว §5.7 §11.5 §4.5 · ภาพ 05)
//   ระดับคะแนน (ร้อน/อุ่น/เย็น + อายุของแต้ม) · ตารางกฎให้คะแนน (เปิด-ปิด/แก้/ลบ) · ปุ่มสร้างกฎเริ่มต้น · คำนวณคะแนนใหม่
// 🔴 'use client' + ด่าน F2.3: ไฟล์นี้ไม่ import โมดูล CRM เลย (แม้ไฟล์ `*-shared`) — ทะเบียนเหตุการณ์/ป้าย/เพดาน
//    มาจากหน้า server ทาง props ทั้งชุด · เขียนข้อมูลผ่าน server action ของหน้าเท่านั้น
// 🔴 ตรวจค่าแบบ inline ในหน้า (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้ · testid ทุกตัวมีแถวใน scripts/crm-ui-inventory.json
// 🔴 กว้าง 1440px และ 390px ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ตารางมี overflow-x ของตัวเอง)
// 🔴 "คำนวณคะแนนใหม่" ต้องกด **ดูผลก่อน** (dry run — ไม่แตะฐาน) แล้วจึงยืนยันพร้อมเหตุผล (การกระทำอันตราย)

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  applyCrmScoreRecomputeAction,
  createCrmScoreRuleAction,
  deleteCrmScoreRuleAction,
  previewCrmScoreRecomputeAction,
  saveCrmScoreBandsAction,
  seedCrmScoreRulesAction,
  toggleCrmScoreRuleAction,
  updateCrmScoreRuleAction,
} from "@/app/app/sys/[id]/crm/settings/scoring/actions";
import type { CrmScoreBandsDraft, CrmScorePageData, CrmScoreRecomputeRow, CrmScoreRuleDraft, CrmScoreRuleView } from "./types";

type Draft = CrmScoreRuleDraft & { id: string | null };

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function CrmScoringManager({ data }: { data: CrmScorePageData }) {
  const router = useRouter();
  const { systemId, limits } = data;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bands, setBands] = useState<CrmScoreBandsDraft>(data.bands);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<CrmScoreRuleView | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ contacts: number; changed: number; rows: CrmScoreRecomputeRow[] } | null>(null);
  const [recomputeReason, setRecomputeReason] = useState("");

  const say = (ok: boolean, text: string) => setMsg({ ok, text });

  type OkOf<R> = R extends { ok: true } ? R : never;
  const run = async <R extends { ok: true } | { ok: false; error: string; code?: string }>(fn: () => Promise<R>, okText: string): Promise<OkOf<R> | null> => {
    setBusy(true);
    const r = (await fn()) as { ok: true } | { ok: false; error: string };
    setBusy(false);
    if (!r.ok) {
      say(false, r.error);
      return null;
    }
    say(true, okText);
    router.refresh();
    return r as OkOf<R>;
  };

  const emptyDraft = (): Draft => ({ id: null, name: "", event: data.events[0]?.value ?? "", points: 5, expiresDays: null, maxPerDay: null, active: true });

  const saveRule = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return say(false, "ตั้งชื่อกฎก่อน (ชื่อนี้จะขึ้นเป็นเหตุผลบนการ์ดลูกค้า)");
    if (!Number.isInteger(draft.points) || draft.points === 0) return say(false, `ใส่จำนวนแต้มเป็นจำนวนเต็ม ${limits.pointsMin.toLocaleString("th-TH")} ถึง ${limits.pointsMax.toLocaleString("th-TH")} และไม่เป็น 0`);
    const payload: CrmScoreRuleDraft = { name: draft.name.trim(), event: draft.event, points: draft.points, expiresDays: draft.expiresDays, maxPerDay: draft.maxPerDay, active: draft.active };
    const r = draft.id
      ? await run(() => updateCrmScoreRuleAction(systemId, draft.id as string, payload), "บันทึกกฎแล้ว")
      : await run(() => createCrmScoreRuleAction(systemId, payload), "เพิ่มกฎแล้ว");
    if (r) setDraft(null);
  };

  const askDelete = async () => {
    if (!removing) return;
    if (reason.trim().length < limits.reasonMin) return say(false, `ใส่เหตุผลที่ลบกฎอย่างน้อย ${limits.reasonMin} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
    const r = await run(() => deleteCrmScoreRuleAction(systemId, removing.id, reason.trim()), "ลบกฎแล้ว (แต้มที่ให้ไปแล้วยังอยู่เป็นประวัติ)");
    if (r) {
      setRemoving(null);
      setReason("");
    }
  };

  const bandOfScore = (n: number): string => (n >= bands.hot ? data.bandLabels.hot : n >= bands.warm ? data.bandLabels.warm : data.bandLabels.cold);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {msg && (
        <p data-testid="crm-score-msg" className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`}>
          {msg.text}
        </p>
      )}

      {/* ── ระดับคะแนน + อายุของแต้ม ── */}
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
        <h2 className="text-sm font-semibold">ระดับคะแนน</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          คะแนนตั้งแต่ตัวเลข “{data.bandLabels.hot}” ขึ้นไปถือว่าร้อน · ตั้งแต่ “{data.bandLabels.warm}” ขึ้นไปถือว่าอุ่น · ต่ำกว่านั้นเย็น ·
          แต้มที่ไม่ได้กำหนดอายุรายกฎจะหมดอายุตามจำนวนวันด้านล่าง (0 = ไม่หมดอายุ)
        </p>
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span>คะแนนขั้นต่ำของ “{data.bandLabels.hot}”</span>
            <input
              data-testid="crm-score-band-hot"
              type="number"
              inputMode="numeric"
              className="w-28 rounded-md border px-2 py-1 text-sm"
              value={String(bands.hot)}
              onChange={(e) => setBands({ ...bands, hot: Number(e.target.value) })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span>คะแนนขั้นต่ำของ “{data.bandLabels.warm}”</span>
            <input
              data-testid="crm-score-band-warm"
              type="number"
              inputMode="numeric"
              className="w-28 rounded-md border px-2 py-1 text-sm"
              value={String(bands.warm)}
              onChange={(e) => setBands({ ...bands, warm: Number(e.target.value) })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span>อายุของแต้ม (วัน)</span>
            <input
              data-testid="crm-score-decay-days"
              type="number"
              inputMode="numeric"
              className="w-28 rounded-md border px-2 py-1 text-sm"
              value={String(bands.decayDays)}
              onChange={(e) => setBands({ ...bands, decayDays: Number(e.target.value) })}
            />
          </label>
          <button
            data-testid="crm-score-bands-save"
            type="button"
            disabled={busy}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            onClick={() => void run(() => saveCrmScoreBandsAction(systemId, bands), "บันทึกระดับคะแนนแล้ว")}
          >
            บันทึกระดับคะแนน
          </button>
        </div>
      </section>

      {/* ── คำนวณคะแนนใหม่ (ดูผลก่อน แล้วยืนยัน) ── */}
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
        <h2 className="text-sm font-semibold">คำนวณคะแนนใหม่</h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          รวมแต้มที่ยังไม่หมดอายุของลูกค้าทุกคนในระบบนี้ใหม่ — ใช้เมื่อคะแนนดูไม่ตรงกับเหตุผลที่แสดง (เช่น หลังนำเข้าข้อมูล) · กด “ดูผลก่อน” ได้เท่าที่ต้องการ ยังไม่มีอะไรเปลี่ยน
        </p>
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <button
            data-testid="crm-score-recompute-btn"
            type="button"
            disabled={busy}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            onClick={async () => {
              const r = await run(() => previewCrmScoreRecomputeAction(systemId), "ดูผลแล้ว — ยังไม่มีอะไรเปลี่ยน");
              if (r) setPreview({ contacts: r.contacts, changed: r.changed, rows: r.rows });
            }}
          >
            ดูผลก่อน
          </button>
          {preview && (
            <>
              <span data-testid="crm-score-recompute-summary" className="text-xs">
                ตรวจ {preview.contacts.toLocaleString("th-TH")} คน · ต้องแก้ {preview.changed.toLocaleString("th-TH")} คน
              </span>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>เหตุผล (อย่างน้อย {limits.reasonMin} ตัวอักษร)</span>
                <input
                  data-testid="crm-score-recompute-reason"
                  className="w-64 max-w-full rounded-md border px-2 py-1 text-sm"
                  value={recomputeReason}
                  onChange={(e) => setRecomputeReason(e.target.value)}
                />
              </label>
              <button
                data-testid="crm-score-recompute-apply"
                type="button"
                disabled={busy}
                className="rounded-md border px-3 py-1.5 text-sm font-semibold text-[color:var(--color-danger)] disabled:opacity-50"
                onClick={async () => {
                  if (recomputeReason.trim().length < limits.reasonMin) return say(false, `ใส่เหตุผลอย่างน้อย ${limits.reasonMin} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
                  const r = await run(() => applyCrmScoreRecomputeAction(systemId, recomputeReason.trim()), "คำนวณคะแนนใหม่แล้ว");
                  if (r) {
                    setPreview(null);
                    setRecomputeReason("");
                  }
                }}
              >
                ยืนยันคำนวณใหม่
              </button>
            </>
          )}
        </div>
      </section>

      {/* ── กฎให้คะแนน ── */}
      <section data-testid="crm-score-rule-list" className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">กฎให้คะแนน ({data.rules.length.toLocaleString("th-TH")})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="crm-score-seed-btn"
              type="button"
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => void run(() => seedCrmScoreRulesAction(systemId), `สร้างกฎเริ่มต้นแล้ว (มีให้ ${data.seedCount} ข้อ)`)}
            >
              สร้างกฎเริ่มต้น {data.seedCount} ข้อ
            </button>
            <button
              data-testid="crm-score-rule-new"
              type="button"
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              onClick={() => setDraft(emptyDraft())}
            >
              เพิ่มกฎ
            </button>
          </div>
        </div>

        {data.rules.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีกฎให้คะแนน — กด “สร้างกฎเริ่มต้น” เพื่อเริ่มจากชุดที่ระบบเตรียมไว้ แล้วปรับแต้มได้ตามใจ</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-left text-sm sm:min-w-[640px]">
              <thead className="text-xs text-[color:var(--color-muted)]">
                <tr>
                  <th className="py-1 pr-2">กฎ</th>
                  <th className="py-1 pr-2">เมื่อ</th>
                  <th className="py-1 pr-2">แต้ม</th>
                  <th className="py-1 pr-2">ไม่เกิน/วัน</th>
                  <th className="py-1 pr-2">อายุ</th>
                  <th className="py-1 pr-2">ใช้งาน</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.id} data-testid={`crm-score-rule-row-${r.id}`} className="border-t align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{r.name}</span>
                      {r.isSystem && <span className="ml-1 rounded-full border px-1.5 text-[10px] text-[color:var(--color-muted)]">กฎของระบบ</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-xs">{r.eventLabel}</td>
                    <td className="py-1.5 pr-2">{r.points > 0 ? `+${r.points.toLocaleString("th-TH")}` : r.points.toLocaleString("th-TH")}</td>
                    <td className="py-1.5 pr-2 text-xs">{r.maxPerDay === null ? "ไม่จำกัด" : r.maxPerDay.toLocaleString("th-TH")}</td>
                    <td className="py-1.5 pr-2 text-xs">{r.expiresDays === null ? `ตามค่ากลาง (${bands.decayDays === 0 ? "ไม่หมดอายุ" : `${bands.decayDays} วัน`})` : `${r.expiresDays.toLocaleString("th-TH")} วัน`}</td>
                    <td className="py-1.5 pr-2">
                      <button
                        data-testid={`crm-score-rule-toggle-${r.id}`}
                        type="button"
                        disabled={busy}
                        className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50"
                        onClick={() => void run(() => toggleCrmScoreRuleAction(systemId, r.id, !r.active), r.active ? "ปิดกฎแล้ว" : "เปิดกฎแล้ว")}
                      >
                        {r.active ? "เปิดอยู่" : "ปิดอยู่"}
                      </button>
                    </td>
                    <td className="py-1.5">
                      <span className="flex flex-wrap gap-1">
                        <button
                          data-testid={`crm-score-rule-edit-${r.id}`}
                          type="button"
                          disabled={busy}
                          className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50"
                          onClick={() => setDraft({ id: r.id, name: r.name, event: r.event, points: r.points, expiresDays: r.expiresDays, maxPerDay: r.maxPerDay, active: r.active })}
                        >
                          แก้
                        </button>
                        <button
                          data-testid={`crm-score-rule-delete-${r.id}`}
                          type="button"
                          disabled={busy}
                          className="rounded-md border px-2 py-0.5 text-xs text-[color:var(--color-danger)] disabled:opacity-50"
                          onClick={() => {
                            setRemoving(r);
                            setReason("");
                          }}
                        >
                          ลบ
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ฟอร์มเพิ่ม/แก้กฎ ── */}
      {draft && (
        <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
          <h2 className="text-sm font-semibold">{draft.id ? "แก้กฎให้คะแนน" : "เพิ่มกฎให้คะแนน"}</h2>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>ชื่อกฎ (ขึ้นเป็นเหตุผลบนการ์ดลูกค้า)</span>
              <input
                data-testid="crm-score-rule-name"
                className="w-64 max-w-full rounded-md border px-2 py-1 text-sm"
                maxLength={limits.nameMax}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>เมื่อเกิดเหตุการณ์</span>
              <select
                data-testid="crm-score-rule-event"
                className="w-72 max-w-full rounded-md border px-2 py-1 text-sm"
                value={draft.event}
                onChange={(e) => setDraft({ ...draft, event: e.target.value })}
              >
                {data.events.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>แต้ม (ติดลบได้)</span>
              <input
                data-testid="crm-score-rule-points"
                type="number"
                inputMode="numeric"
                className="w-24 rounded-md border px-2 py-1 text-sm"
                value={String(draft.points)}
                onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>ไม่เกินกี่ครั้งต่อวัน (ว่าง = ไม่จำกัด)</span>
              <input
                data-testid="crm-score-rule-max-per-day"
                type="number"
                inputMode="numeric"
                className="w-32 rounded-md border px-2 py-1 text-sm"
                value={draft.maxPerDay === null ? "" : String(draft.maxPerDay)}
                onChange={(e) => setDraft({ ...draft, maxPerDay: numOrNull(e.target.value) })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>อายุของแต้ม (วัน · ว่าง = ตามค่ากลาง)</span>
              <input
                data-testid="crm-score-rule-expires"
                type="number"
                inputMode="numeric"
                className="w-32 rounded-md border px-2 py-1 text-sm"
                value={draft.expiresDays === null ? "" : String(draft.expiresDays)}
                onChange={(e) => setDraft({ ...draft, expiresDays: numOrNull(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="crm-score-rule-active" type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              <span>ใช้งานกฎนี้</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="crm-score-rule-save" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onClick={() => void saveRule()}>
              บันทึก
            </button>
            <button data-testid="crm-score-rule-cancel" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" onClick={() => setDraft(null)}>
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {/* ── ยืนยันลบกฎ (การกระทำอันตราย: ยืนยัน + เหตุผล) ── */}
      {removing && (
        <section data-testid="crm-score-delete-panel" className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-danger)]">ลบกฎ “{removing.name}”</h2>
          <p className="text-xs text-[color:var(--color-muted)]">ลบแล้วกู้คืนไม่ได้ · แต้มที่กฎนี้ให้ไปแล้วยังอยู่เป็นประวัติบนการ์ดลูกค้า</p>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span>เหตุผล (อย่างน้อย {limits.reasonMin} ตัวอักษร)</span>
            <input data-testid="crm-score-delete-reason" className="w-72 max-w-full rounded-md border px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button data-testid="crm-score-delete-confirm" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm font-semibold text-[color:var(--color-danger)] disabled:opacity-50" onClick={() => void askDelete()}>
              ยืนยันลบ
            </button>
            <button
              data-testid="crm-score-delete-cancel"
              type="button"
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => {
                setRemoving(null);
                setReason("");
              }}
            >
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {preview && preview.rows.length > 0 && (
        <section className="flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-xs">
          <h2 className="text-sm font-semibold">ตัวอย่างที่จะเปลี่ยน</h2>
          {preview.rows.slice(0, 10).map((row) => (
            <span key={row.contactId} data-testid={`crm-score-preview-row-${row.contactId}`}>
              {row.from.toLocaleString("th-TH")} → {row.to.toLocaleString("th-TH")} ({bandOfScore(row.to)})
            </span>
          ))}
        </section>
      )}
    </div>
  );
}
