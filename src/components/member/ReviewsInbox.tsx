// ReviewsInbox.tsx — กล่องรีวิวลูกค้า (M3.4 · ภาพ ledger/design-member/23-review-inbox.png)
// KPI 4 ช่อง · แถบกรอง (ดาว/บริการ/พนักงาน/สาขา/ยังไม่ตอบ) · รายการรีวิว (ตอบ + AI ร่าง + ป้ายการ์ด) ·
// ขวา: AI สรุปรีวิวเดือนนี้ + ตั้งค่า
//
// 🔴 'use client' — import ได้เฉพาะไฟล์บริสุทธิ์ (`reviews-shared.ts`) + server action (`reviews-actions.ts`)
//    ห้าม import `reviews.ts`/facade (ลากถึง prisma → next build พัง · บทเรียน M3.1)
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์พิเศษ/สีตายตัว — ไอคอนผ่าน MemberIcon · ดาวผ่าน ReviewStars (SVG)
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MemberIcon } from "./MemberIcon";
import { ReviewStars } from "./ReviewStars";
import {
  draftReplyAction,
  hideReviewAction,
  refreshReviewSummaryAction,
  replyReviewAction,
  saveReviewSettingsAction,
  unhideReviewAction,
} from "@/lib/modules/member/reviews-actions";
import {
  REVIEW_ASK_AFTER_CHOICES,
  REVIEW_ASSIGNEE_ROLES,
  REVIEW_ASSIGNEE_ROLE_LABELS,
  thaiShortDate,
  type ReviewFilterOptions,
  type ReviewFilters,
  type ReviewRow,
  type ReviewSettings,
  type ReviewStats,
  type ReviewSummary,
} from "@/lib/modules/member/reviews-shared";

type Props = {
  systemId: string;
  basePath: string;
  stats: ReviewStats;
  items: ReviewRow[];
  hasMore: boolean;
  take: number;
  filters: ReviewFilters;
  options: ReviewFilterOptions;
  settings: ReviewSettings;
  summary: ReviewSummary | null;
  canReply: boolean;
  canSettings: boolean;
};

const MUTED = { color: "var(--color-muted)" } as const;

/** ไอคอนประกายของ AI (วาดเองในไฟล์นี้ — ไม่มีในสไปรต์กลาง) */
function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9Z" />
      <path d="M18.5 3.5v3M17 5h3" strokeLinecap="round" />
    </svg>
  );
}

function hrefWith(basePath: string, f: ReviewFilters, patch: Partial<ReviewFilters> & { take?: number }): string {
  const next = { ...f, ...patch };
  const q = new URLSearchParams();
  if (next.rating) q.set("rating", String(next.rating));
  if (next.serviceId) q.set("service", next.serviceId);
  if (next.staffEmployeeId) q.set("staff", next.staffEmployeeId);
  if (next.unitId) q.set("unit", next.unitId);
  if (next.unreplied) q.set("unreplied", "1");
  if (next.includeHidden) q.set("hidden", "1");
  if (patch.take) q.set("take", String(patch.take));
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

// ───────────────────────── KPI ─────────────────────────

function Kpi({ icon, label, value, hint, danger }: { icon: React.ReactNode; label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1.5 p-4">
      <span className="flex items-center gap-1.5 truncate text-xs" style={MUTED}>
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold" style={{ color: danger ? "var(--color-danger)" : "var(--color-ink)" }}>
        {value}
      </span>
      <span className="truncate text-xs" style={MUTED}>
        {hint}
      </span>
    </div>
  );
}

function Kpis({ stats }: { stats: ReviewStats }) {
  const n = (x: number) => x.toLocaleString("th-TH");
  return (
    <div data-testid="reviews-kpi" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi icon={<MemberIcon name="star" size="sm" />} label={stats.days === 30 ? "เฉลี่ย 30 วัน" : `เฉลี่ย ${stats.days} วัน`} value={stats.avg === null ? "—" : stats.avg.toFixed(1)} hint={`จาก ${n(stats.count)} รีวิว`} />
      <Kpi icon={<MemberIcon name="chat" size="sm" />} label="รีวิว" value={n(stats.count)} hint={`+${n(stats.weekDelta)} สัปดาห์นี้`} />
      <Kpi icon={<MemberIcon name="check" size="sm" />} label="ตอบกลับแล้ว" value={stats.count ? `${stats.repliedPct}%` : "—"} hint={`${n(stats.replied)} จาก ${n(stats.count)}`} />
      <Kpi
        icon={<MemberIcon name="warn" size="sm" />}
        label={`≤ ${stats.escalateBelow} ดาว`}
        value={n(stats.lowCount)}
        hint={`→ การ์ดบอร์ดงาน ${n(stats.lowCards)} ใบ`}
        danger={stats.lowCount > 0}
      />
    </div>
  );
}

// ───────────────────────── แถบกรอง ─────────────────────────

function FilterBar({ basePath, filters, options, unreplied }: { basePath: string; filters: ReviewFilters; options: ReviewFilterOptions; unreplied: number }) {
  const router = useRouter();
  const go = (patch: Partial<ReviewFilters>) => router.push(hrefWith(basePath, filters, patch));
  const sel = "input w-auto max-w-full py-1.5 text-sm";
  return (
    <div data-testid="reviews-filter" className="card flex flex-wrap items-center gap-2 p-3">
      <select aria-label="ดาว" className={sel} value={filters.rating ?? ""} onChange={(e) => go({ rating: e.target.value ? Number(e.target.value) : undefined })}>
        <option value="">ดาว: ทั้งหมด</option>
        {[5, 4, 3, 2, 1].map((r) => (
          <option key={r} value={r}>
            {r} ดาว
          </option>
        ))}
      </select>
      <select aria-label="บริการ" className={sel} value={filters.serviceId ?? ""} onChange={(e) => go({ serviceId: e.target.value || undefined })}>
        <option value="">บริการ</option>
        {options.services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="พนักงาน" className={sel} value={filters.staffEmployeeId ?? ""} onChange={(e) => go({ staffEmployeeId: e.target.value || undefined })}>
        <option value="">พนักงาน</option>
        {options.staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="สาขา" className={sel} value={filters.unitId ?? ""} onChange={(e) => go({ unitId: e.target.value || undefined })}>
        <option value="">สาขา</option>
        {options.units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <Link
        href={hrefWith(basePath, filters, { unreplied: !filters.unreplied, includeHidden: false })}
        data-testid="reviews-filter-unreplied"
        className="rounded-md border px-2.5 py-1 text-xs font-semibold"
        style={
          filters.unreplied
            ? { borderColor: "var(--color-accent)", background: "var(--color-accent)", color: "var(--color-accent-fg)" }
            : { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }
        }
      >
        ยังไม่ตอบ {unreplied.toLocaleString("th-TH")}
      </Link>
      <Link href={hrefWith(basePath, filters, { includeHidden: !filters.includeHidden, unreplied: false })} className="ml-auto text-xs underline-offset-2 hover:underline" style={MUTED}>
        {filters.includeHidden ? "ซ่อนรีวิวที่ซ่อนไว้" : "ดูรีวิวที่ซ่อนไว้ด้วย"}
      </Link>
    </div>
  );
}

// ───────────────────────── แถวรีวิว ─────────────────────────

function EscalatedBadge({ row, role }: { row: ReviewRow; role: string }) {
  const text = row.kanbanCardNo !== null
    ? `เปิดการ์ด #${row.kanbanCardNo}${row.kanbanBoardName ? ` ในบอร์ด "${row.kanbanBoardName}"` : ""} — ${role}รับเรื่องแล้ว`
    : `ส่งต่อ${role}แล้ว — ยังไม่มีบอร์ดงานให้เปิดการ์ด`;
  return (
    <span
      data-testid="review-escalated-badge"
      className="inline-flex max-w-full items-center whitespace-normal break-words rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
    >
      {text}
    </span>
  );
}

function ReviewItem({ systemId, row, canReply, defaultOpen, roleLabel }: { systemId: string; row: ReviewRow; canReply: boolean; defaultOpen: boolean; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const unreplied = !row.replyBody && row.status !== "HIDDEN";
  const who = [row.service?.name, row.staff?.name ?? (row.unit ? (row.unit.name.startsWith("สาขา") ? row.unit.name : `สาขา${row.unit.name}`) : null)].filter(Boolean).join(" · ");

  const draft = () =>
    start(async () => {
      setMsg(null);
      const r = await draftReplyAction(systemId, row.id);
      if (r.ok) setText(r.data.text);
      else setMsg({ ok: false, text: r.reason });
    });
  const send = () =>
    start(async () => {
      setMsg(null);
      const r = await replyReviewAction(systemId, row.id, text);
      if (!r.ok) return setMsg({ ok: false, text: r.reason });
      setMsg({ ok: true, text: r.data.sent ? "ส่งคำตอบแล้ว — ลูกค้าได้รับทาง LINE" : "บันทึกคำตอบแล้ว (ลูกค้ายังไม่ได้ผูก/ยินยอม LINE จึงไม่ได้ส่งข้อความ)" });
      router.refresh();
    });
  const doHide = () =>
    start(async () => {
      setMsg(null);
      const r = await hideReviewAction(systemId, row.id, reason);
      if (!r.ok) return setMsg({ ok: false, text: r.reason });
      router.refresh();
    });
  const doUnhide = () =>
    start(async () => {
      const r = await unhideReviewAction(systemId, row.id);
      if (!r.ok) return setMsg({ ok: false, text: r.reason });
      router.refresh();
    });

  return (
    <div data-testid={`review-row-${row.id}`} className="flex min-w-0 gap-3 border-b py-4 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
      <div
        className="grid shrink-0 place-items-center overflow-hidden rounded-lg border"
        style={{ width: 52, height: 52, borderColor: "var(--color-line)", background: "var(--color-surface-2)", color: "var(--color-muted)" }}
      >
        {row.photoUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photoUrls[0]} alt="รูปจากลูกค้า" className="h-full w-full object-cover" />
        ) : (
          <MemberIcon name="cam" size="sm" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <ReviewStars rating={row.rating} />
          <span className="text-sm font-semibold">{row.customer.name}</span>
          {who && (
            <span className="truncate text-xs" style={MUTED}>
              {who}
            </span>
          )}
          <span className="text-xs" style={MUTED}>
            {thaiShortDate(row.submittedAt ?? row.createdAt)}
          </span>
        </div>
        {row.body ? <p className="text-sm" style={{ overflowWrap: "anywhere" }}>&quot;{row.body}&quot;</p> : <p className="text-sm" style={MUTED}>(ลูกค้าให้คะแนนโดยไม่เขียนข้อความ)</p>}
        {row.photoUrls.length > 1 && (
          <div className="flex gap-1.5">
            {row.photoUrls.slice(1).map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="รูปจากลูกค้า" className="h-10 w-10 rounded-md border object-cover" style={{ borderColor: "var(--color-line)" }} />
            ))}
          </div>
        )}
        {(row.status === "ESCALATED" || (row.kanbanCardId && row.status !== "HIDDEN")) && (
          <div>
            <EscalatedBadge row={row} role={roleLabel} />
          </div>
        )}
        {row.status === "HIDDEN" && (
          <div className="flex flex-wrap items-center gap-2 text-xs" style={MUTED}>
            <span className="rounded-md border px-2 py-0.5" style={{ borderColor: "var(--color-line)" }}>
              ซ่อนอยู่{row.hiddenReason ? ` — ${row.hiddenReason}` : ""}
            </span>
            {canReply && (
              <button type="button" className="btn btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={doUnhide}>
                เลิกซ่อน
              </button>
            )}
          </div>
        )}
        {row.replyBody && (
          <p className="text-xs" style={{ ...MUTED, overflowWrap: "anywhere" }}>
            ตอบแล้ว — &quot;{row.replyBody}&quot;
          </p>
        )}
        {canReply && unreplied && !open && (
          <div>
            <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>
              ตอบกลับ
            </button>
          </div>
        )}
        {canReply && unreplied && open && (
          <div data-testid="review-reply-box" className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}>
            <textarea
              aria-label="คำตอบถึงลูกค้า"
              className="input min-h-[64px] bg-[color:var(--color-surface)]"
              placeholder="พิมพ์คำตอบถึงลูกค้า หรือกด ‘ให้ AI ร่างคำตอบ’"
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-testid="review-ai-draft" className="btn btn-ghost px-3 py-1.5 text-sm" disabled={pending} onClick={draft}>
                <Sparkle /> ให้ AI ร่างคำตอบ
              </button>
              <button type="button" data-testid="review-reply-send" className="btn btn-primary px-3 py-1.5 text-sm" disabled={pending || !text.trim()} onClick={send}>
                ส่งคำตอบ
              </button>
              <button type="button" className="ml-auto text-xs underline-offset-2 hover:underline" style={MUTED} onClick={() => setHiding((v) => !v)}>
                ซ่อนรีวิวนี้
              </button>
            </div>
            {hiding && (
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="เหตุผลที่ซ่อน" className="input min-w-0 flex-1 basis-full py-1.5 sm:basis-0" placeholder="เหตุผล เช่น สแปม · ข้อความไม่เหมาะสม" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" disabled={pending || !reason.trim()} onClick={doHide}>
                  ยืนยันซ่อน
                </button>
              </div>
            )}
          </div>
        )}
        {msg && (
          <p className="text-xs" style={{ color: msg.ok ? "var(--color-muted)" : "var(--color-danger)" }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── ขวา: AI สรุป + ตั้งค่า ─────────────────────────

function SummaryCard({ systemId, summary, canRefresh }: { systemId: string; summary: ReviewSummary | null; canRefresh: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const refresh = () =>
    start(async () => {
      setErr(null);
      const r = await refreshReviewSummaryAction(systemId);
      if (!r.ok) setErr(r.reason);
      else router.refresh();
    });
  return (
    <div data-testid="reviews-ai-summary" className="card flex flex-col gap-2.5 p-4">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Sparkle /> AI สรุปรีวิวเดือนนี้
      </span>
      {summary ? (
        <div className="flex flex-col gap-1 text-sm">
          <p style={{ overflowWrap: "anywhere" }}>
            <b>จุดแข็ง</b> — {summary.strengths}
          </p>
          <p style={{ overflowWrap: "anywhere" }}>
            <b>ถูกพูดถึงบ่อย</b> — {summary.frequent}
          </p>
          <p style={{ overflowWrap: "anywhere" }}>
            <b>แนวโน้ม</b> — {summary.trend}
          </p>
        </div>
      ) : (
        <p className="text-sm" style={MUTED}>
          ยังสรุปรีวิวเดือนนี้ไม่ได้ตอนนี้ — ลองกดสรุปใหม่อีกครั้ง
        </p>
      )}
      <div className="flex items-center gap-2">
        {summary && (
          <span className="text-xs" style={MUTED}>
            อัปเดต {thaiShortDate(summary.generatedAt)}
          </span>
        )}
        {canRefresh && (
          <button type="button" className="ml-auto text-xs underline-offset-2 hover:underline" style={MUTED} disabled={pending} onClick={refresh}>
            {pending ? "กำลังสรุป…" : "สรุปใหม่"}
          </button>
        )}
      </div>
      {err && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          {err}
        </p>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--color-line)" }}>
      <span className="pt-1.5 text-xs" style={MUTED}>
        {label}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </div>
  );
}

function SettingsCard({ systemId, settings, boards, canSettings }: { systemId: string; settings: ReviewSettings; boards: { id: string; name: string }[]; canSettings: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<ReviewSettings>(settings);
  const [points, setPoints] = useState(String(settings.rewardPoints));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useMemo(
    () =>
      s.askAfterHours !== settings.askAfterHours ||
      s.escalateBelow !== settings.escalateBelow ||
      s.escalateBoardId !== settings.escalateBoardId ||
      s.escalateAssigneeRole !== settings.escalateAssigneeRole ||
      points.trim() !== String(settings.rewardPoints),
    [s, points, settings],
  );
  const save = () =>
    start(async () => {
      setMsg(null);
      const pts = points.trim() === "" ? settings.rewardPoints : Number(points);
      const r = await saveReviewSettingsAction(systemId, {
        askAfterHours: s.askAfterHours,
        rewardPoints: pts,
        escalateBelow: s.escalateBelow,
        escalateBoardId: s.escalateBoardId,
        escalateAssigneeRole: s.escalateAssigneeRole,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.reason });
      setMsg({ ok: true, text: "บันทึกตั้งค่ารีวิวแล้ว" });
      router.refresh();
    });
  const sel = "input w-full py-1.5 text-sm";
  const boardName = boards.find((b) => b.id === s.escalateBoardId)?.name;
  return (
    <div id="reviews-settings" data-testid="reviews-settings" className="card flex flex-col p-4">
      <span className="mb-1 text-sm font-semibold">ตั้งค่า</span>
      <div data-testid="reviews-settings-form" className="flex flex-col">
        <SettingRow label="ขอรีวิวหลัง">
          <select aria-label="ขอรีวิวหลัง" className={sel} disabled={!canSettings} value={s.askAfterHours} onChange={(e) => setS({ ...s, askAfterHours: Number(e.target.value) })}>
            {[...new Set([...REVIEW_ASK_AFTER_CHOICES, s.askAfterHours])].sort((a, b) => a - b).map((h) => (
              <option key={h} value={h}>
                ทาง LINE · {h} ชม.
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="ให้แต้ม">
          <input aria-label="ให้แต้ม" className="input w-24 py-1.5 text-sm" inputMode="numeric" disabled={!canSettings} value={points} onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, ""))} />
        </SettingRow>
        <SettingRow
          label={
            <span className="inline-flex items-center gap-1">
              ≤
              <select aria-label="คะแนนที่เปิดการ์ด" className="rounded border bg-transparent px-0.5 text-xs" style={{ borderColor: "var(--color-line)" }} disabled={!canSettings} value={s.escalateBelow} onChange={(e) => setS({ ...s, escalateBelow: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              ดาว
            </span>
          }
        >
          <span className="text-xs">
            เปิดการ์ดในบอร์ด <b>{boardName ?? (boards[0] ? `${boards[0].name} (บอร์ดแรก)` : "—")}</b>
          </span>
          <select aria-label="บอร์ดปลายทาง" className={sel} disabled={!canSettings} value={s.escalateBoardId ?? ""} onChange={(e) => setS({ ...s, escalateBoardId: e.target.value || null })}>
            <option value="">บอร์ดแรกของร้าน</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="text-xs">
            มอบหมาย <b>{REVIEW_ASSIGNEE_ROLE_LABELS[s.escalateAssigneeRole]}</b>
          </span>
          <select aria-label="มอบหมาย" className={sel} disabled={!canSettings} value={s.escalateAssigneeRole} onChange={(e) => setS({ ...s, escalateAssigneeRole: e.target.value as ReviewSettings["escalateAssigneeRole"] })}>
            {REVIEW_ASSIGNEE_ROLES.map((r) => (
              <option key={r} value={r}>
                {REVIEW_ASSIGNEE_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {boards.length === 0 && (
            <span className="text-xs" style={MUTED}>
              ร้านยังไม่มีบอร์ดงาน — รีวิวคะแนนต่ำจะแจ้งเตือนในแอปแทน
            </span>
          )}
        </SettingRow>
        <SettingRow label="≥ 4 ดาว">
          <span className="text-xs">เชิญรีวิว Google</span>
          <span
            role="switch"
            aria-checked={false}
            aria-disabled
            aria-label="เชิญรีวิว Google"
            className="relative inline-block h-5 w-9 rounded-full"
            style={{ background: "var(--color-line)" }}
          >
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full" style={{ background: "var(--color-surface)" }} />
          </span>
          <span className="text-xs" style={MUTED}>
            ปิดอยู่ — เจ้าของเลือกเก็บในระบบ
          </span>
        </SettingRow>
      </div>
      {canSettings ? (
        <div className="flex items-center gap-2 pt-2">
          <button type="button" data-testid="reviews-settings-save" className="btn btn-primary px-3 py-1.5 text-sm" disabled={pending || !dirty} onClick={save}>
            บันทึกตั้งค่า
          </button>
          {msg && (
            <span className="text-xs" style={{ color: msg.ok ? "var(--color-muted)" : "var(--color-danger)" }}>
              {msg.text}
            </span>
          )}
        </div>
      ) : (
        <p className="pt-2 text-xs" style={MUTED}>
          ดูได้อย่างเดียว — แก้ตั้งค่ารีวิวต้องมีสิทธิ์ member.settings.manage
        </p>
      )}
    </div>
  );
}

// ───────────────────────── ทั้งหน้า ─────────────────────────

export function ReviewsInbox(p: Props) {
  const roleLabel = p.settings.escalateAssigneeRole === "MANAGER" ? "ผู้จัดการ" : REVIEW_ASSIGNEE_ROLE_LABELS[p.settings.escalateAssigneeRole];
  const firstOpen = p.items.find((r) => r.status === "ESCALATED" && !r.replyBody)?.id ?? null;
  return (
    <div data-testid="reviews-page" className="flex min-w-0 flex-col gap-4">
      <Kpis stats={p.stats} />
      <FilterBar basePath={p.basePath} filters={p.filters} options={p.options} unreplied={p.stats.unreplied} />
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div data-testid="reviews-list" className="card flex min-w-0 flex-col p-4">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">รีวิวล่าสุด</span>
            <span className="text-xs" style={MUTED}>
              {p.items.length.toLocaleString("th-TH")} ใบ
            </span>
          </div>
          {p.items.length === 0 ? (
            <p className="py-8 text-center text-sm" style={MUTED}>
              ยังไม่มีรีวิวที่ตรงกับตัวกรองนี้ — รีวิวจะเข้ามาเมื่อลูกค้าตอบลิงก์ที่ร้านส่งให้หลังใช้บริการ
            </p>
          ) : (
            <div className="flex min-w-0 flex-col">
              {p.items.map((row) => (
                <ReviewItem key={row.id} systemId={p.systemId} row={row} canReply={p.canReply} defaultOpen={row.id === firstOpen} roleLabel={roleLabel} />
              ))}
            </div>
          )}
          {p.hasMore && (
            <Link href={hrefWith(p.basePath, p.filters, { take: p.take + 20 })} className="btn btn-ghost mt-2 self-center px-4 py-1.5 text-sm">
              ดูเพิ่ม
            </Link>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SummaryCard systemId={p.systemId} summary={p.summary} canRefresh={p.canReply} />
          <SettingsCard systemId={p.systemId} settings={p.settings} boards={p.options.boards} canSettings={p.canSettings} />
        </div>
      </div>
    </div>
  );
}

export default ReviewsInbox;
