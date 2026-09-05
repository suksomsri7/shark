"use client";

// ContactProfilePanel.tsx — โปรไฟล์ผู้ติดต่อ 360° (WO 3.4 · DESIGN-SPEC-V2 §7.1)
// เฟรม: f5-contacts-menu.png (แผงเลื่อนขวา w-560) · g6-contact-360.png (หน้าเต็ม) · g19 (มือถือ 390)
//
// component เดียวใช้ 3 ที่ (เนื้อหาเดียวกัน ต่างที่กรอบ/ผัง):
//   · `ContactProfileSlideOver` — คลิกแถวในหน้ารายการ (โหลดข้อมูลตอนเปิด ไม่โหลดล่วงหน้าทุกแถว)
//   · `ContactProfileFull`      — หน้า /account/contacts/[contactId] (server ส่ง profile แท็บแรกมาให้)
//   · มือถือ = ตัวเดียวกัน สลับผังด้วย breakpoint (g19: KPI 2×2 · แท็บเป็น pill · aging แนวนอน)

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlideOver } from "./SlideOver";
import { AccountIcon } from "./AccountIcon";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatDateTh } from "@/lib/ui/date";
import { loadContactProfileAction } from "@/lib/modules/account/actions";
// WO 9.4 §0.3 ข้อ 8 — เก็บถาวรผู้ติดต่อไม่กินเลขที่/ไม่ลงเงิน ⇒ เลิกทำได้ภายใน 5 นาที
import { archiveContactWithUndoAction } from "@/lib/modules/account/undo-stack";
import { useUndoToast } from "./UndoToast";
import { useSetBreadcrumbTail } from "./breadcrumb-tail";
import type { ContactProfile, ProfileTab, ProfileDocRow } from "@/lib/modules/account/contact-profile";

type Variant = "panel" | "page";

const TABS: { key: ProfileTab; label: string; mobileLabel?: string; countOf?: (p: ContactProfile) => number }[] = [
  { key: "info", label: "ข้อมูล" },
  { key: "docs", label: "เอกสาร", countOf: (p) => p.tabs.docs },
  { key: "files", label: "ไฟล์แนบ", mobileLabel: "ไฟล์", countOf: (p) => p.tabs.files },
  { key: "links", label: "การเชื่อมต่อ" },
];

// ─────────────────────────── ชิ้นเล็ก ───────────────────────────

function Avatar({ letter, big }: { letter: string; big?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl border font-semibold ${big ? "h-12 w-12 text-xl" : "h-10 w-10 text-base"}`}
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
    >
      {letter}
    </span>
  );
}

function Chip({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <span
      className="rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
      style={
        strong
          ? { borderColor: "var(--color-ink)", color: "var(--color-ink)", fontWeight: 600 }
          : { borderColor: "var(--color-line)", color: "var(--color-muted)" }
      }
    >
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-4 border-b py-2.5 text-sm last:border-b-0"
      style={{ borderColor: "var(--color-line)" }}
    >
      <dt className="shrink-0 text-[color:var(--color-muted)]">{label}</dt>
      <dd className="text-right">{value ?? "—"}</dd>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  danger,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span
        className="text-2xl font-semibold tabular-nums"
        style={danger ? { color: "var(--color-danger)" } : undefined}
        data-testid={testId}
      >
        {value}
      </span>
      <span className="text-xs text-[color:var(--color-muted)]">{sub}</span>
    </div>
  );
}

/** อายุหนี้แบบแถวแนวนอน (f5 แผงเลื่อน · g19 มือถือ) */
function AgingRows({ profile }: { profile: ContactProfile }) {
  const max = Math.max(profile.aging.maxSatang, 1);
  return (
    <div className="flex flex-col gap-2" data-testid="aging-rows">
      {profile.aging.buckets.map((b) => (
        <div key={b.key} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-[color:var(--color-muted)]">{b.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}>
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(b.satang > 0 ? (b.satang / max) * 100 : 0, b.satang > 0 ? 4 : 1.5)}%`,
                background: b.danger ? "var(--color-danger)" : "var(--color-ink)",
                opacity: b.satang > 0 ? 1 : 0.25,
              }}
            />
          </span>
          <span
            className="w-24 shrink-0 text-right font-medium tabular-nums"
            style={b.danger && b.satang > 0 ? { color: "var(--color-danger)" } : undefined}
            data-testid={`aging-${b.key}`}
          >
            <MoneyText satang={b.satang} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** อายุหนี้แบบแท่งตั้ง 5 ช่อง (g6 เดสก์ท็อป) */
function AgingColumns({ profile }: { profile: ContactProfile }) {
  const max = Math.max(profile.aging.maxSatang, 1);
  return (
    <div className="grid grid-cols-5 gap-2" data-testid="aging-columns">
      {profile.aging.buckets.map((b) => (
        <div key={b.key} className="flex flex-col items-center gap-2">
          <span className="text-xs text-[color:var(--color-muted)]">{b.label}</span>
          <span className="flex h-24 w-full items-end justify-center">
            <span
              className="w-8 rounded-sm"
              style={{
                height: b.satang > 0 ? `${Math.max((b.satang / max) * 100, 8)}%` : "3px",
                background: b.satang > 0 ? (b.danger ? "var(--color-danger)" : "var(--color-ink)") : "var(--color-line)",
                opacity: b.satang > 0 ? 0.75 : 1,
              }}
            />
          </span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={b.danger ? { color: "var(--color-danger)" } : undefined}
            data-testid={`aging-col-${b.key}`}
          >
            <MoneyText satang={b.satang} />
          </span>
        </div>
      ))}
    </div>
  );
}

function DocLine({ d, showContact }: { d: ProfileDocRow; showContact?: string }) {
  return (
    <Link
      href={d.href}
      className="flex items-start justify-between gap-3 border-b py-3 text-sm last:border-b-0"
      style={{ borderColor: "var(--color-line)" }}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium" style={{ color: "var(--color-accent)" }}>
          {d.docNo ?? "(ร่าง)"}
        </span>
        {showContact && <span className="truncate">{showContact}</span>}
        <span className="text-xs text-[color:var(--color-muted)]">
          {formatDateTh(d.issueDate)} · {d.docTypeLabel}
          {d.overdue && d.dueDate ? (
            <>
              {" · ครบกำหนด "}
              <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>{formatDateTh(d.dueDate)}</span>
            </>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums">
          <MoneyText satang={d.grandTotal} decimals />
        </span>
        {d.overdue ? (
          <StatusChip value="พ้นกำหนด" tone="danger" />
        ) : (
          <StatusChip value={d.statusLabel} tone={d.statusTone} />
        )}
      </span>
    </Link>
  );
}

/** การ์ด "ข้อมูล" คอลัมน์ขวาของ g6 (โผล่คู่กับทุกแท็บยกเว้นแท็บ "ข้อมูล" ที่กางเต็มความกว้าง) */
function InfoCard({ profile }: { profile: ContactProfile }) {
  const i = profile.info;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
      <h3 className="mb-2 text-sm font-semibold">ข้อมูล</h3>
      <dl className="flex flex-col">
        <InfoRow label="เลขภาษี" value={i.taxId ?? "—"} />
        <InfoRow label="สาขา" value={i.branchLabel} />
        <InfoRow label="ที่อยู่" value={<span className="whitespace-pre-line">{i.address ?? "—"}</span>} />
        <InfoRow
          label="ช่องทางติดต่อ"
          value={
            <span className="flex flex-col">
              <span>{i.phoneDisplay ?? "—"}</span>
              {i.email && <span>{i.email}</span>}
            </span>
          }
        />
        <InfoRow label="เครดิตเทอม" value={`${i.creditTermDays} วัน`} />
        <InfoRow label="ประเภทราคา" value={i.priceModeLabel} />
        <InfoRow label="WHT เริ่มต้น" value={i.whtLabel} />
        <InfoRow label="หมายเหตุ" value={i.note ?? "—"} />
      </dl>
    </div>
  );
}

/** แท็บ "ข้อมูล" — รายละเอียดครบทุกช่องตาม §7.1 */
function InfoTab({ profile }: { profile: ContactProfile }) {
  const i = profile.info;
  return (
    <dl className="flex flex-col" data-testid="profile-info">
      <InfoRow label="เลขประจำตัวผู้เสียภาษี" value={i.taxId ?? "—"} />
      <InfoRow label="สาขา" value={i.branchLabel} />
      <InfoRow label="ที่อยู่" value={<span className="whitespace-pre-line">{i.address ?? "—"}</span>} />
      <InfoRow label="ผู้ติดต่อ" value={i.contactPerson ?? "—"} />
      <InfoRow label="เบอร์โทร" value={i.phoneDisplay ?? "—"} />
      <InfoRow label="อีเมล" value={i.email ?? "—"} />
      <InfoRow label="เว็บไซต์" value={i.website ?? "—"} />
      <InfoRow label="แฟกซ์" value={i.fax ?? "—"} />
      <InfoRow label="LINE ID" value={i.lineId ?? "—"} />
      <InfoRow label="เครดิตเทอม" value={`${i.creditTermDays} วัน`} />
      <InfoRow label="ประเภทราคา" value={i.priceModeLabel} />
      <InfoRow label="WHT เริ่มต้น" value={i.whtLabel} />
      <InfoRow label="หมายเหตุ" value={i.note ?? "—"} />
    </dl>
  );
}

function DocsTab({
  profile,
  onFilter,
  busy,
}: {
  profile: ContactProfile;
  onFilter: (patch: { docType?: string | null; status?: string | null; page?: number }) => void;
  busy: boolean;
}) {
  const t = profile.docsTab;
  if (!t) return <p className="py-6 text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="profile-docs">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto text-sm"
          aria-label="กรองตามชนิดเอกสาร"
          value={t.docType ?? ""}
          disabled={busy}
          onChange={(e) => onFilter({ docType: e.target.value || null, page: 1 })}
        >
          <option value="">ทุกชนิด</option>
          {t.docTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count})
            </option>
          ))}
        </select>
        <select
          className="input w-auto text-sm"
          aria-label="กรองตามสถานะ"
          value={t.status ?? ""}
          disabled={busy}
          onChange={(e) => onFilter({ status: e.target.value || null, page: 1 })}
        >
          <option value="">ทุกสถานะ</option>
          {t.statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count})
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-[color:var(--color-muted)]" data-testid="profile-docs-total">
          {t.total} รายการ
        </span>
      </div>
      {t.rows.length === 0 ? (
        <p className="py-6 text-sm text-[color:var(--color-muted)]">ไม่มีเอกสารตามเงื่อนไขนี้</p>
      ) : (
        <div className="flex flex-col">
          {t.rows.map((d) => (
            <DocLine key={d.id} d={d} />
          ))}
        </div>
      )}
      {t.pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <button type="button" className="btn-sm" disabled={busy || t.page <= 1} onClick={() => onFilter({ page: t.page - 1 })}>
            ‹ ก่อนหน้า
          </button>
          <span className="text-[color:var(--color-muted)]">
            หน้า {t.page}/{t.pageCount}
          </span>
          <button type="button" className="btn-sm" disabled={busy || t.page >= t.pageCount} onClick={() => onFilter({ page: t.page + 1 })}>
            ถัดไป ›
          </button>
        </div>
      )}
    </div>
  );
}

function FilesTab({ profile }: { profile: ContactProfile }) {
  const t = profile.filesTab;
  if (!t) return <p className="py-6 text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>;
  if (t.rows.length === 0)
    return <p className="py-6 text-sm text-[color:var(--color-muted)]">ยังไม่มีไฟล์แนบในเอกสารของผู้ติดต่อรายนี้</p>;
  return (
    <div className="flex flex-col" data-testid="profile-files">
      {t.rows.map((f) => (
        <a
          key={f.id}
          href={f.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <AccountIcon name="file" className="shrink-0" />
            <span className="truncate">{f.fileName}</span>
          </span>
          <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
            {f.docNo ?? "—"} · {formatDateTh(f.createdAt)}
          </span>
        </a>
      ))}
    </div>
  );
}

const CONNECTION_ICON = { member: "user", crm: "flag", chat: "mail", pos: "shop" } as const;

function LinksTab({ profile }: { profile: ContactProfile }) {
  const t = profile.linksTab;
  if (!t) return <p className="py-6 text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="profile-links">
      {t.cards.map((c) => (
        <div key={c.key} className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              <AccountIcon name={CONNECTION_ICON[c.key]} />
              {c.title}
            </span>
            <Chip label={c.linked ? "เชื่อมแล้ว" : c.available ? "ยังไม่เชื่อม" : "ยังไม่เปิดระบบ"} strong={c.linked} />
          </div>
          <p className="text-sm text-[color:var(--color-muted)]">
            {c.detail ?? (c.available ? "ยังไม่ได้เชื่อมกับรายการในระบบนี้" : "ร้านนี้ยังไม่ได้เปิดใช้ระบบนี้")}
          </p>
          {c.actionLabel &&
            (c.actionHref ? (
              <Link href={c.actionHref} className="btn-sm w-fit">
                {c.actionLabel}
              </Link>
            ) : null)}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── ตัวเนื้อหาหลัก ───────────────────────────

function ProfileBody({
  profile,
  variant,
  tab,
  setTab,
  busy,
  onFilter,
}: {
  profile: ContactProfile;
  variant: Variant;
  tab: ProfileTab;
  setTab: (t: ProfileTab) => void;
  busy: boolean;
  onFilter: (patch: { docType?: string | null; status?: string | null; page?: number }) => void;
}) {
  const k = profile.kpi;
  const isPage = variant === "page";

  const tabBar = (
    <div
      className={
        isPage
          ? "flex gap-2 overflow-x-auto md:gap-6 md:border-b"
          : "flex gap-4 overflow-x-auto border-b"
      }
      style={isPage ? undefined : { borderColor: "var(--color-line)" }}
      role="tablist"
    >
      {TABS.map((t) => {
        const active = t.key === tab;
        const n = t.countOf?.(profile);
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`profile-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={
              // มือถือ = pill (g19) · เดสก์ท็อป = ขีดล่าง (g6) ⇒ ต้องคุมสีด้วย class ที่มี md: ไม่ใช่ inline style
              // (inline style ชนะ class เสมอ — รอบแรกทำให้ pill ดำค้างบนเดสก์ท็อป ผิดจาก g6)
              isPage
                ? [
                    "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                    "md:rounded-none md:border-0 md:border-b-2 md:bg-transparent md:px-0 md:pb-3",
                    active
                      ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)] border-[color:var(--color-ink)] font-semibold md:text-[color:var(--color-ink)] md:border-b-[color:var(--color-ink)]"
                      : "border-[color:var(--color-line)] text-[color:var(--color-muted)] md:border-b-transparent",
                  ].join(" ")
                : `shrink-0 border-b-2 pb-2.5 text-sm ${active ? "font-semibold" : ""}`
            }
            style={
              isPage
                ? undefined
                : active
                  ? { borderColor: "var(--color-accent)", color: "var(--color-ink)" }
                  : { borderColor: "transparent", color: "var(--color-muted)" }
            }
          >
            <span className={t.mobileLabel ? "md:hidden" : ""}>{t.mobileLabel ?? t.label}</span>
            {t.mobileLabel && <span className="hidden md:inline">{t.label}</span>}
            {n != null && <span className="ml-1.5 text-xs opacity-70">{n}</span>}
          </button>
        );
      })}
    </div>
  );

  const tabContent =
    tab === "info" ? (
      <InfoTab profile={profile} />
    ) : tab === "docs" ? (
      <DocsTab profile={profile} onFilter={onFilter} busy={busy} />
    ) : tab === "files" ? (
      <FilesTab profile={profile} />
    ) : (
      <LinksTab profile={profile} />
    );

  // การ์ด "เอกสาร n รายการล่าสุด" — ซ่อนบนแท็บ "เอกสาร" (ตารางเต็มอยู่ตรงนั้นแล้ว · ดู wo-notes/3.4.md)
  const recentCard = tab === "docs" ? null : (
    <div className={isPage ? "rounded-xl border p-4" : ""} style={isPage ? { borderColor: "var(--color-line)" } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">เอกสาร {profile.recentDocs.length} รายการล่าสุด</h3>
        <button
          type="button"
          className="text-sm font-medium"
          style={{ color: "var(--color-accent)" }}
          onClick={() => setTab("docs")}
          data-testid="profile-see-all-docs"
        >
          ดูทั้งหมด ›
        </button>
      </div>
      <div className="mt-1 flex flex-col">
        {profile.recentDocs.length === 0 ? (
          <p className="py-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสารของผู้ติดต่อรายนี้</p>
        ) : (
          profile.recentDocs.map((d) => <DocLine key={d.id} d={d} />)
        )}
      </div>
    </div>
  );

  // ── KPI ── เดสก์ท็อป (g6) 4 ใบ: ค้างรับ · ซื้อสะสมปีนี้ · จำนวนครั้ง · กลุ่มมาตรฐาน
  //           มือถือ (g19) 4 ใบ: ค้างรับ · ซื้อสะสมปีนี้ · จำนวนครั้งที่ซื้อ · เครดิตเทอม
  const kpiOutstanding = (
    <KpiCard
      label={k.outstandingLabel}
      value={<MoneyText satang={k.outstandingSatang} decimals />}
      sub={k.outstandingDocs > 0 ? `${k.outstandingDocs} ใบ${k.overdueDocs > 0 ? " · พ้นกำหนด" : ""}` : "ไม่มีค้าง"}
      danger={k.outstandingDanger}
      testId="kpi-outstanding"
    />
  );
  const kpiPaid = (
    <KpiCard
      label="ซื้อสะสมปีนี้"
      value={<MoneyText satang={k.paidThisYearSatang} decimals />}
      sub={`ปี ${k.year}`}
      testId="kpi-paid-year"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {profile.header.mergedIntoId && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
          ผู้ติดต่อรายนี้ถูกรวมเข้ากับรายอื่นแล้ว (เก็บไว้เพื่อดูประวัติเท่านั้น)
        </p>
      )}

      {isPage ? (
        <>
          {/* KPI เดสก์ท็อป 4 ใบ (g6) */}
          <div className="hidden gap-4 md:grid md:grid-cols-4">
            {kpiOutstanding}
            {kpiPaid}
            <KpiCard label="จำนวนครั้ง" value={`${k.paidDocsThisYear} ครั้ง`} sub="ซื้อขายทั้งหมด" testId="kpi-times" />
            <KpiCard label="กลุ่มมาตรฐาน" value={k.standardGroupLabel} sub={k.regularRuleLabel} testId="kpi-standard-group" />
          </div>
          {/* KPI มือถือ 2×2 (g19) */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {kpiOutstanding}
            {kpiPaid}
            <KpiCard label="จำนวนครั้งที่ซื้อ" value={`${k.paidDocsThisYear} ครั้ง`} sub={`ปี ${k.year}`} />
            <KpiCard label="เครดิตเทอม" value={`${k.creditTermDays} วัน`} sub="มาตรฐานร้าน" />
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
            <h3 className="mb-3 text-sm font-semibold">อายุหนี้ของรายนี้</h3>
            <div className="hidden md:block">
              <AgingColumns profile={profile} />
            </div>
            <div className="md:hidden">
              <AgingRows profile={profile} />
            </div>
          </div>

          {tabBar}
          {tab === "info" ? (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
              {tabContent}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }}>
                {tabContent}
              </div>
              <InfoCard profile={profile} />
            </div>
          )}
          {recentCard}
        </>
      ) : (
        <>
          {tabBar}
          <div className="flex flex-wrap gap-2">
            {profile.header.chips.map((c, i) => (
              <Chip key={i} label={c.label} strong={c.tone === "regular"} />
            ))}
          </div>
          {tab === "info" ? (
            <dl className="flex flex-col">
              <InfoRow label="เลขประจำตัวผู้เสียภาษี" value={profile.info.taxId ?? "—"} />
              <InfoRow label="ที่อยู่" value={<span className="whitespace-pre-line">{profile.info.address ?? "—"}</span>} />
              <InfoRow label="เครดิตเทอม" value={`${profile.info.creditTermDays} วัน`} />
            </dl>
          ) : (
            tabContent
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-[color:var(--color-muted)]">{k.outstandingLabel}</span>
              <span
                className="text-xl font-semibold tabular-nums"
                style={k.outstandingDanger ? { color: "var(--color-danger)" } : undefined}
                data-testid="kpi-outstanding"
              >
                <MoneyText satang={k.outstandingSatang} decimals />
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">
                {k.outstandingDocs > 0 ? `${k.outstandingDocs} ใบ${k.overdueDocs > 0 ? " · พ้นกำหนด" : ""}` : "ไม่มีค้าง"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-[color:var(--color-muted)]">ซื้อสะสมปีนี้</span>
              <span className="text-xl font-semibold tabular-nums" data-testid="kpi-paid-year">
                <MoneyText satang={k.paidThisYearSatang} decimals />
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">{k.paidDocsThisYear} ครั้ง</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">อายุหนี้ของรายนี้</h3>
            <AgingRows profile={profile} />
          </div>

          {recentCard}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── ปุ่มท้าย (ใช้ร่วม 2 แบบ) ───────────────────────────

function BottomActions({ profile, compact }: { profile: ContactProfile; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "pt-1"}`}>
      <Link href={profile.links.newInvoiceHref} className="btn btn-primary" data-testid="profile-create-invoice">
        สร้างใบแจ้งหนี้
      </Link>
      <Link href={profile.links.remindHref} className="btn-sm" data-testid="profile-remind">
        ส่งใบแจ้งเตือน
      </Link>
      <Link href={profile.links.ledgerHref} className="btn-sm" data-testid="profile-ledger">
        ดูใบแยกประเภทลูกหนี้
      </Link>
    </div>
  );
}

// ─────────────────────────── ตัวห่อ: แผงเลื่อนขวา ───────────────────────────

export function ContactProfileSlideOver({
  systemId,
  contactId,
  onClose,
}: {
  systemId: string;
  contactId: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [tab, setTab] = useState<ProfileTab>("info");
  const [filters, setFilters] = useState<{ docType: string | null; status: string | null; page: number }>({
    docType: null,
    status: null,
    page: 1,
  });
  const [pending, start] = useTransition();

  useEffect(() => {
    setProfile(null);
    setTab("info");
    setFilters({ docType: null, status: null, page: 1 });
  }, [contactId]);

  const load = useCallback(
    (nextTab: ProfileTab, f: { docType: string | null; status: string | null; page: number }) => {
      if (!contactId) return;
      start(async () => {
        const p = await loadContactProfileAction(systemId, contactId, {
          tab: nextTab,
          docType: (f.docType as never) ?? null,
          status: (f.status as never) ?? null,
          page: f.page,
        });
        setProfile(p);
      });
    },
    [contactId, systemId],
  );

  useEffect(() => {
    if (contactId) load("info", { docType: null, status: null, page: 1 });
  }, [contactId, load]);

  const changeTab = (t: ProfileTab) => {
    setTab(t);
    load(t, filters);
  };
  const changeFilter = (patch: { docType?: string | null; status?: string | null; page?: number }) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    load("docs", next);
  };

  return (
    <SlideOver
      open={!!contactId}
      onClose={onClose}
      testId="contact-profile-panel"
      title={
        profile ? (
          <span className="flex items-center gap-3">
            <Avatar letter={profile.header.avatarLetter} />
            <span className="flex flex-col">
              <span className="text-lg font-semibold leading-tight">{profile.header.name}</span>
              <span className="text-xs font-normal text-[color:var(--color-muted)]">
                {profile.header.code} · {profile.header.legalTypeLabel}
              </span>
            </span>
          </span>
        ) : (
          <span className="text-base">กำลังโหลดโปรไฟล์…</span>
        )
      }
      headerExtra={
        profile ? (
          <Link
            href={profile.links.editHref}
            aria-label="แก้ไขข้อมูลผู้ติดต่อ"
            data-testid="profile-edit"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]"
          >
            <AccountIcon name="edit" />
          </Link>
        ) : null
      }
      actions={profile ? <BottomActions profile={profile} compact /> : null}
    >
      {profile ? (
        <ProfileBody profile={profile} variant="panel" tab={tab} setTab={changeTab} busy={pending} onFilter={changeFilter} />
      ) : (
        <p className="py-8 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
      )}
    </SlideOver>
  );
}

// ─────────────────────────── ตัวห่อ: หน้าเต็ม ───────────────────────────

export function ContactProfileFull({ systemId, initial }: { systemId: string; initial: ContactProfile }) {
  const [profile, setProfile] = useState<ContactProfile>(initial);
  const [tab, setTab] = useState<ProfileTab>("info");
  const [filters, setFilters] = useState<{ docType: string | null; status: string | null; page: number }>({
    docType: null,
    status: null,
    page: 1,
  });
  const [pending, start] = useTransition();
  const router = useRouter();
  const undoToast = useUndoToast();
  // breadcrumb "บัญชี › ผู้ติดต่อ › <ชื่อ>" ตาม g6
  useSetBreadcrumbTail(profile.header.name);

  const load = (nextTab: ProfileTab, f: { docType: string | null; status: string | null; page: number }) => {
    start(async () => {
      const p = await loadContactProfileAction(systemId, initial.header.id, {
        tab: nextTab,
        docType: (f.docType as never) ?? null,
        status: (f.status as never) ?? null,
        page: f.page,
      });
      if (p) setProfile(p);
    });
  };

  const archiveNow = () => {
    start(async () => {
      const res = await archiveContactWithUndoAction(systemId, profile.header.id);
      if (res.ok) {
        undoToast.show({ tokenId: res.undoToken, systemId, message: `ปิดใช้งาน "${profile.header.name}" แล้ว` });
        load(tab, filters);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* หัว (g6) — มือถือใช้ topbar ‹ ผู้ติดต่อ + ✏ ตาม g19 */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <Link href={profile.links.contactsHref} className="flex items-center gap-2 text-sm font-medium">
          ‹ ผู้ติดต่อ
        </Link>
        <Link href={profile.links.editHref} aria-label="แก้ไขข้อมูลผู้ติดต่อ" className="p-1">
          <AccountIcon name="edit" />
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar letter={profile.header.avatarLetter} big />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold leading-tight" data-testid="profile-name">
              {profile.header.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-muted)]">
              <span data-testid="profile-code">
                {profile.header.code} · {profile.header.legalTypeLabel}
              </span>
              {profile.header.chips
                .filter((c) => c.tone !== "kind")
                .map((c, i) => (
                  <Chip key={i} label={c.label} strong={c.tone === "regular"} />
                ))}
            </div>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <Link href={profile.links.editHref} className="btn-sm inline-flex items-center gap-1.5" data-testid="profile-edit">
            <AccountIcon name="edit" /> แก้ไข
          </Link>
          {!profile.header.archived && (
            <button
              type="button"
              onClick={archiveNow}
              disabled={pending}
              className="btn-sm inline-flex items-center gap-1.5"
              style={{ color: "var(--color-danger)" }}
              data-testid="profile-archive"
            >
              <AccountIcon name="x" /> ปิดใช้งาน
            </button>
          )}
          <Link href={profile.links.newInvoiceHref} className="btn btn-primary">
            สร้างใบแจ้งหนี้
          </Link>
        </div>
      </div>

      <ProfileBody
        profile={profile}
        variant="page"
        tab={tab}
        setTab={(t) => {
          setTab(t);
          load(t, filters);
        }}
        busy={pending}
        onFilter={(patch) => {
          const next = { ...filters, ...patch };
          setFilters(next);
          load("docs", next);
        }}
      />

      <div className="hidden md:block">
        <BottomActions profile={profile} />
      </div>
      {/* แถบปุ่มล่างบนมือถือ (g19) — `sticky` ตามแบบ StickyBar ของ WO 1.3 (ไม่ใช่ `fixed`:
          fixed จะทับเนื้อหาและชนปุ่มผู้ช่วย AI ที่ `fixed bottom-4 right-4`) */}
      <div
        className="sticky bottom-0 z-30 -mx-4 flex gap-2 border-t px-4 py-3 md:hidden"
        style={{ borderColor: "var(--color-line)", background: "var(--color-surface)", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Link href={profile.links.newInvoiceHref} className="btn btn-primary flex-1 justify-center">
          + สร้างใบแจ้งหนี้
        </Link>
        <Link href={profile.links.remindHref} className="btn-sm flex-1 justify-center">
          ส่งใบแจ้งเตือน
        </Link>
      </div>
    </div>
  );
}

export default ContactProfileSlideOver;
