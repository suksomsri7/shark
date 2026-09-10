// VouchersBoard.tsx — หน้า "โปรโมชัน › Voucher" (M2.5 · ภาพ ledger/design-member/19-voucher-issue.png)
//
// 3 ส่วนตามภาพ:
//   (ก) แถบหัว: ลิงก์ไปหน้าแบบ voucher + ปุ่ม "ออก voucher"
//   (ข) KPI 2 ช่อง: ใช้ได้ (จำนวน + มูลค่ารวม) · ใช้แล้วเดือนนี้ (จำนวน + อัตราการใช้)
//   (ค) ค้นหา + ตาราง 7 คอลัมน์ + ลิ้นชัก "ออก voucher" ทางขวา
//
// ไม่มีอีโมจิ/สัญลักษณ์ในหน้าสมาชิก — ใช้ MemberIcon · ไม่มีสีฮาร์ดโค้ด (ใช้โทเคน var(--color-*))
// ทุกการบันทึกผ่าน server action ใน voucher/voucher-actions.ts (ด่านสิทธิ์อยู่ที่นั่น)
// กล่อง "ต้องอนุมัติ" คิดจากตัวเลขชุดเดียวกับ service (มูลค่าหน้าใบ x จำนวนคน) — หน้าจอไม่ตั้งกติกาเอง
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";
import { issueVoucherAction } from "@/lib/modules/voucher/voucher-actions";
import { MemberIcon } from "./MemberIcon";

type MemberOption = { id: string; name: string; memberCode: string };
type TargetOption = { id: string; name: string; kind: "CATEGORY" | "SERVICE" };
type TemplateOption = {
  id: string;
  name: string;
  kind: string;
  value: number;
  validDays: number;
  minSatang: number | null;
  maxDiscountSatang: number | null;
  stackWithCoupon: boolean;
};
type RowDto = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  kind: string;
  value: number;
  origin: string;
  status: string;
  expiresAt: string;
  usedAt: string | null;
};

export type VouchersBoardProps = {
  systemId: string;
  rows: RowDto[];
  kpi: { activeCount: number; activeValueSatang: number; usedThisMonth: number; usageRatePct: number };
  members: MemberOption[];
  templates: TemplateOption[];
  targets: TargetOption[];
  approverLabel: string;
  approvalOverSatang: number;
  canIssue: boolean;
  filter: { status: string | null; q: string };
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้ได้",
  USED: "ใช้แล้ว",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิกแล้ว",
};

const ORIGIN_LABEL: Record<string, string> = {
  TIER: "ต้อนรับระดับ",
  BIRTHDAY: "วันเกิด",
  JOURNEY: "เส้นทางอัตโนมัติ",
  CAMPAIGN: "แคมเปญ",
  REDEEM: "แลกแต้ม",
  COMPENSATION: "ชดเชย",
  REFERRAL: "แนะนำเพื่อน",
  STAMP: "สะสมตรา",
  MANUAL: "ออกด้วยมือ",
  API: "ระบบภายนอก",
};

const KIND_LABEL: Record<string, string> = {
  FIXED: "ส่วนลดบาท",
  PERCENT: "ส่วนลดเปอร์เซ็นต์",
  FREE_SERVICE: "บริการฟรี",
  FREE_ITEM: "สินค้าฟรี",
};

function valueLabel(kind: string, value: number): string {
  if (kind === "FIXED") return formatBaht(value);
  if (kind === "PERCENT") return `${value}%`;
  return KIND_LABEL[kind] ?? kind;
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" style={{ minWidth: 0 }}>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {hint}
      </span>
    </div>
  );
}

export function VouchersBoard(props: VouchersBoardProps) {
  const { systemId, rows, kpi, canIssue } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(props.filter.q);
  const [notice, setNotice] = useState<string | null>(null);

  const search = (next: string) => {
    setQ(next);
    const params = new URLSearchParams();
    if (next.trim()) params.set("q", next.trim());
    if (props.filter.status) params.set("status", props.filter.status);
    router.push(`/app/sys/${systemId}/member/promotions/vouchers${params.size ? `?${params}` : ""}`);
  };

  return (
    <div data-testid="vouchers-page" className="flex flex-col gap-4">
      {/* (ก) แถบหัว */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/sys/${systemId}/member/promotions/vouchers/templates`}
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          <MemberIcon name="tag" size="xs" />
          แบบ voucher ที่ตั้งไว้
        </Link>
        <span className="flex-1" />
        {canIssue && (
          <button
            type="button"
            data-testid="vouchers-issue"
            className="btn btn-primary inline-flex items-center gap-1.5"
            onClick={() => setOpen(true)}
          >
            <MemberIcon name="plus" size="sm" />
            ออก voucher
          </button>
        )}
      </div>

      {notice && (
        <p data-testid="vouchers-notice" className="text-sm" style={{ color: "var(--color-ink)" }}>
          {notice}
        </p>
      )}

      {/* (ข) KPI 2 ช่อง */}
      <div
        data-testid="vouchers-kpi"
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        <Tile
          label="ใช้ได้"
          value={kpi.activeCount.toLocaleString("th-TH")}
          hint={`มูลค่ารวม ${formatBaht(kpi.activeValueSatang)}`}
        />
        <Tile
          label="ใช้แล้วเดือนนี้"
          value={kpi.usedThisMonth.toLocaleString("th-TH")}
          hint={`อัตราการใช้ ${kpi.usageRatePct}%`}
        />
      </div>

      {/* (ค) ค้นหา + ตาราง */}
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-muted)" }}>
          <MemberIcon name="search" size="sm" />
        </span>
        <input
          data-testid="vouchers-search"
          className="input flex-1"
          placeholder="ค้นหา รหัส / ชื่อ / ผู้รับ"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search(q);
          }}
          onBlur={() => search(q)}
        />
      </div>

      <div className="card p-0">
        <div className="overflow-x-auto">
          <table data-testid="vouchers-table" className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
                <th className="px-4 py-2 text-left font-normal">รหัส</th>
                <th className="px-4 py-2 text-left font-normal">ชื่อ voucher</th>
                <th className="px-4 py-2 text-left font-normal">ผู้รับ</th>
                <th className="px-4 py-2 text-right font-normal">มูลค่า</th>
                <th className="hidden px-4 py-2 text-left font-normal md:table-cell">ต้นทาง</th>
                <th className="hidden px-4 py-2 text-left font-normal md:table-cell">หมดอายุ</th>
                <th className="px-4 py-2 text-left font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    ยังไม่มี voucher ที่ตรงกับที่ค้นหา — กด &ldquo;ออก voucher&rdquo; เพื่อออกใบแรก
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} data-testid={`vouchers-row-${r.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td className="px-4 py-2 font-medium">{r.code}</td>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2">{r.customerName}</td>
                  <td className="px-4 py-2 text-right">{valueLabel(r.kind, r.value)}</td>
                  <td className="hidden px-4 py-2 md:table-cell" style={{ color: "var(--color-muted)" }}>
                    {ORIGIN_LABEL[r.origin] ?? r.origin}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell" style={{ color: "var(--color-muted)" }}>
                    {formatThaiDate(new Date(r.expiresAt))}
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
        <IssueDrawer
          systemId={systemId}
          members={props.members}
          templates={props.templates}
          targets={props.targets}
          approverLabel={props.approverLabel}
          approvalOverSatang={props.approvalOverSatang}
          onClose={() => setOpen(false)}
          onDone={(msg) => {
            setOpen(false);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── ลิ้นชัก "ออก voucher" (ภาพ 19 ครึ่งขวา) ─────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 py-2.5"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      <span className="w-28 shrink-0 text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function IssueDrawer({
  systemId,
  members,
  templates,
  targets,
  approverLabel,
  approvalOverSatang,
  onClose,
  onDone,
}: {
  systemId: string;
  members: MemberOption[];
  templates: TemplateOption[];
  targets: TargetOption[];
  approverLabel: string;
  approvalOverSatang: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<MemberOption[]>([]);
  const [source, setSource] = useState<"TEMPLATE" | "ADHOC">(templates.length > 0 ? "TEMPLATE" : "ADHOC");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [kind, setKind] = useState<"FIXED" | "PERCENT" | "FREE_SERVICE" | "FREE_ITEM">("FIXED");
  const [valueText, setValueText] = useState("300");
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [pickedTargets, setPickedTargets] = useState<string[]>([]);
  const [stack, setStack] = useState(false);
  const [validDays, setValidDays] = useState("30");
  const [origin, setOrigin] = useState("MANUAL");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const t = query.trim().toLowerCase();
    const pool = t
      ? members.filter((m) => m.name.toLowerCase().includes(t) || m.memberCode.toLowerCase().includes(t))
      : members;
    return pool.filter((m) => !picked.some((p) => p.id === m.id)).slice(0, 30);
  }, [query, members, picked]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const usingTemplate = source === "TEMPLATE" && !!template;

  const valueSatang = Math.round((Number(valueText) || 0) * 100);
  const maxSatang = maxText.trim() ? Math.round((Number(maxText) || 0) * 100) : null;

  // มูลค่าหน้าใบ = ตัวเลขเดียวกับที่ service ใช้เทียบเพดาน (FIXED = มูลค่า · PERCENT = เพดานส่วนลด · ฟรี = 0)
  const faceSatang = usingTemplate
    ? template.kind === "FIXED"
      ? template.value
      : template.kind === "PERCENT"
        ? (template.maxDiscountSatang ?? 0)
        : 0
    : kind === "FIXED"
      ? valueSatang
      : kind === "PERCENT"
        ? (maxSatang ?? 0)
        : 0;
  const totalSatang = faceSatang * picked.length;
  const needsApproval = totalSatang > approvalOverSatang;

  const submit = async () => {
    if (picked.length === 0) {
      setError("ยังไม่ได้เลือกผู้รับ — ค้นหาชื่อสมาชิกแล้วกดเพิ่มอย่างน้อย 1 คน");
      return;
    }
    setBusy(true);
    setError(null);
    const categoryIds = targets.filter((t) => t.kind === "CATEGORY" && pickedTargets.includes(t.id)).map((t) => t.id);
    const serviceIds = targets.filter((t) => t.kind === "SERVICE" && pickedTargets.includes(t.id)).map((t) => t.id);
    const res = await issueVoucherAction({
      systemId,
      customerIds: picked.map((m) => m.id),
      templateId: usingTemplate ? template.id : null,
      adhoc: usingTemplate
        ? null
        : {
            kind,
            value: kind === "FIXED" ? valueSatang : kind === "PERCENT" ? Number(valueText) || 0 : 0,
            config: {
              ...(minText.trim() ? { minSatang: Math.round((Number(minText) || 0) * 100) } : {}),
              ...(maxSatang !== null ? { maxDiscountSatang: maxSatang } : {}),
              ...(categoryIds.length ? { categoryIds } : {}),
              ...(serviceIds.length ? { serviceIds } : {}),
              ...(kind === "FREE_SERVICE" && serviceIds[0] ? { serviceId: serviceIds[0] } : {}),
              stackWithCoupon: stack,
              unitIds: [],
            },
            validDays: Number(validDays) || 30,
          },
      origin: origin as "MANUAL",
      reason: reason.trim() || null,
      notify,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onDone(
      res.data.pending
        ? `ส่งคำขออนุมัติแล้ว — รอ${approverLabel}อนุมัติ ระบบจะออก voucher ให้ ${picked.length} คนทันทีที่ผ่าน`
        : `ออก voucher เรียบร้อย ${res.data.issued} ใบ${res.data.skipped > 0 ? ` (ข้ามใบซ้ำ ${res.data.skipped} ใบ)` : ""}`,
    );
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="vouchers-issue-modal"
        role="dialog"
        aria-modal="true"
        aria-label="ออก voucher"
        className="relative flex h-full w-full max-w-[520px] flex-col"
        style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)" }}
      >
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <MemberIcon name="tag" />
          <h2 className="text-sm font-semibold">ออก voucher</h2>
          <span className="flex-1" />
          <button type="button" aria-label="ปิด" className="btn btn-ghost" onClick={onClose}>
            <MemberIcon name="x" size="sm" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          {/* ให้ใคร — รายคน (ใช้ได้) · กลุ่ม segment (M3.1) */}
          <span className="pb-2 text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
            ให้ใคร
          </span>
          <div data-testid="vouchers-issue-target" className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div
              className="flex flex-col gap-1 rounded-lg p-3"
              style={{ border: "1px solid var(--color-accent)", background: "var(--color-surface)" }}
            >
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                รายคน
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                เลือกแล้ว {picked.length} คน
              </span>
            </div>
            <div
              aria-disabled="true"
              className="flex flex-col gap-1 rounded-lg p-3"
              style={{ border: "1px solid var(--color-line)", background: "var(--color-surface-2)", opacity: 0.6 }}
            >
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                กลุ่ม (segment)
              </span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                เร็ว ๆ นี้ (M3.1)
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3">
            <input
              className="input"
              placeholder="ค้นหาสมาชิกที่จะให้..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                    style={{ border: "1px solid var(--color-line)", background: "var(--color-surface-2)" }}
                    onClick={() => setPicked((prev) => prev.filter((p) => p.id !== m.id))}
                  >
                    {m.name}
                    <MemberIcon name="x" size="xs" />
                  </button>
                ))}
              </div>
            )}
            {query.trim() && (
              <div
                className="flex max-h-40 flex-col overflow-y-auto rounded-lg"
                style={{ border: "1px solid var(--color-line)" }}
              >
                {options.length === 0 && (
                  <span className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                    ไม่พบสมาชิกที่ตรงกับคำค้นนี้
                  </span>
                )}
                {options.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="px-3 py-2 text-left text-sm"
                    onClick={() => {
                      setPicked((prev) => [...prev, m]);
                      setQuery("");
                    }}
                  >
                    {m.name} · {m.memberCode}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* แบบ */}
          <Row label="แบบ">
            <select
              data-testid="vouchers-issue-kind"
              className="input"
              style={{ maxWidth: 220 }}
              value={usingTemplate ? `tpl:${template.id}` : `adhoc:${kind}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("tpl:")) {
                  setSource("TEMPLATE");
                  setTemplateId(v.slice(4));
                } else {
                  setSource("ADHOC");
                  setKind(v.slice(6) as "FIXED");
                }
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={`tpl:${t.id}`}>
                  {t.name}
                </option>
              ))}
              <option value="adhoc:FIXED">ส่วนลดบาท</option>
              <option value="adhoc:PERCENT">ส่วนลดเปอร์เซ็นต์</option>
              <option value="adhoc:FREE_SERVICE">บริการฟรี</option>
              <option value="adhoc:FREE_ITEM">สินค้าฟรี</option>
            </select>
          </Row>

          {/* มูลค่า */}
          <Row label="มูลค่า">
            {usingTemplate ? (
              <span data-testid="vouchers-issue-value" className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                {valueLabel(template.kind, template.value)}
              </span>
            ) : (
              <input
                data-testid="vouchers-issue-value"
                className="input"
                style={{ maxWidth: 140 }}
                inputMode="decimal"
                placeholder={kind === "PERCENT" ? "10" : "300"}
                value={valueText}
                onChange={(e) => setValueText(e.target.value)}
                disabled={kind === "FREE_SERVICE" || kind === "FREE_ITEM"}
              />
            )}
            {!usingTemplate && kind === "PERCENT" && (
              <input
                className="input"
                style={{ maxWidth: 160 }}
                inputMode="decimal"
                placeholder="เพดานส่วนลด (บาท)"
                value={maxText}
                onChange={(e) => setMaxText(e.target.value)}
              />
            )}
          </Row>

          {/* เงื่อนไข */}
          <span className="pt-3 pb-1 text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
            เงื่อนไข
          </span>
          <Row label="ขั้นต่ำบิล">
            {usingTemplate ? (
              <span className="text-sm">{template.minSatang ? formatBaht(template.minSatang) : "ไม่กำหนด"}</span>
            ) : (
              <input
                className="input"
                style={{ maxWidth: 140 }}
                inputMode="decimal"
                placeholder="ไม่กำหนด"
                value={minText}
                onChange={(e) => setMinText(e.target.value)}
              />
            )}
          </Row>
          <Row label="ใช้กับหมวด">
            {targets.length === 0 ? (
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                ยังไม่มีหมวดสินค้า/บริการให้เลือก — ใบนี้จะใช้ได้กับทั้งบิล
              </span>
            ) : (
              targets.slice(0, 8).map((t) => (
                <label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    disabled={usingTemplate}
                    checked={pickedTargets.includes(t.id)}
                    onChange={(e) =>
                      setPickedTargets((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                    }
                  />
                  {t.name}
                </label>
              ))
            )}
          </Row>
          <Row label="ใช้ร่วมกับคูปอง">
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                disabled={usingTemplate}
                checked={usingTemplate ? template.stackWithCoupon : stack}
                onChange={(e) => setStack(e.target.checked)}
              />
              อนุญาตให้ใช้ซ้อน
            </label>
          </Row>

          {/* อายุ */}
          <Row label="อายุ">
            <input
              className="input"
              style={{ maxWidth: 90 }}
              inputMode="numeric"
              value={usingTemplate ? String(template.validDays) : validDays}
              onChange={(e) => setValidDays(e.target.value)}
              disabled={usingTemplate}
            />
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>
              วัน หลังออก
            </span>
          </Row>

          {/* ต้นทาง/เหตุผล */}
          <Row label="ต้นทาง/เหตุผล">
            <select className="input" style={{ maxWidth: 150 }} value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="MANUAL">ออกด้วยมือ</option>
              <option value="COMPENSATION">ชดเชย</option>
              <option value="CAMPAIGN">แคมเปญ</option>
              <option value="REDEEM">แลกแต้ม</option>
            </select>
            <input
              className="input min-w-0 flex-1"
              placeholder="เหตุผล เช่น ชดเชยความล่าช้า"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Row>

          {/* แจ้งทาง LINE */}
          <Row label="แจ้งทาง LINE">
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              ส่งข้อความบอกลูกค้าทันทีที่ออกใบ
            </label>
          </Row>

          {/* กล่องเพดานอนุมัติ */}
          <div
            data-testid="vouchers-issue-approval-hint"
            className="mt-4 flex items-start gap-2 rounded-lg p-3 text-xs"
            style={{
              border: `1px solid var(${needsApproval ? "--color-danger" : "--color-line"})`,
              background: "var(--color-surface-2)",
              color: needsApproval ? "var(--color-danger)" : "var(--color-muted)",
            }}
          >
            <MemberIcon name={needsApproval ? "warn" : "check"} size="sm" />
            {needsApproval ? (
              <span>
                <strong>ต้องอนุมัติ:</strong> มูลค่ารวม {formatBaht(totalSatang)} ({picked.length} คน ×{" "}
                {formatBaht(faceSatang)}) มากกว่าเพดาน {formatBaht(approvalOverSatang)} — ระบบจะส่งคำขออนุมัติแทนออกทันที
              </span>
            ) : (
              <span>
                มูลค่ารวม {formatBaht(totalSatang)} ({picked.length} คน × {formatBaht(faceSatang)}) ยังไม่มากกว่าเพดาน{" "}
                {formatBaht(approvalOverSatang)} — ออกได้ทันที
              </span>
            )}
          </div>

          {error && (
            <p className="pt-3 text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex flex-wrap items-center gap-2 px-5 py-3"
          style={{ borderTop: "1px solid var(--color-line)" }}
        >
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ผู้อนุมัติ: {approverLabel}
          </span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="vouchers-issue-submit"
            className="btn btn-primary"
            disabled={busy}
            onClick={submit}
          >
            {busy ? "กำลังออก..." : "ออก voucher"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VouchersBoard;
