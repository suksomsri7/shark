// PrivacySettings.tsx — หน้า "ความเป็นส่วนตัวและสิทธิ์ข้อมูล" (M1.7 · ภาพ 14 ledger/design-member)
//
// 6 บล็อกตามภาพ (ซ้าย 3 · ขวา 3):
//   (ก) นโยบายความเป็นส่วนตัว + เวอร์ชัน   (ข) ช่องทางความยินยอม   (ง) บันทึกการเข้าถึงข้อมูลอ่อนไหว
//   (ค) ใครดูข้อมูลอ่อนไหวได้ (เมทริกซ์)     (จ) คำขอตาม PDPA        (ฉ) ลบอัตโนมัติเมื่อไม่เคลื่อนไหว
//
// 🔴 ช่องทางในบล็อก (ข) มาจากทะเบียนกลาง `consentChannels()` — ห้ามฮาร์ดโค้ดชื่อช่องทางที่นี่ (D19)
// 🔴 ชิปตำแหน่ง/แผนกในบล็อก (ค) มาจากโมดูล HR จริง (`hrPositionsSummary`) — พนักงานที่ยังไม่ผูก
//    บัญชีผู้ใช้ตั้งสิทธิ์ตามตำแหน่งให้ไม่ได้ ⇒ ต้องเตือนให้เห็นพร้อมลิงก์ไปแก้ที่ HR ไม่ใช่เงียบ
// 🔴 ทุกการบันทึกเรียก server action ใน `privacy-actions.ts` (ด่าน `member.privacy.manage`)
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { consentChannels } from "@/lib/core/channels";
import type { AccessLogDto, ConsentStatRow, HrPositionsSummary, PolicyVersionDto, PrivacyRequestDto, SensitiveMatrixRow } from "@/lib/modules/member/privacy";
import {
  createPolicyVersionAction,
  deleteSensitivePolicyAction,
  publishPolicyVersionAction,
  requestEraseAction,
  requestExportAction,
  setAutoEraseYearsAction,
  setSensitivePolicyAction,
} from "@/lib/modules/member/privacy-actions";

const ROLE_COLUMNS: { key: string; short: string; label: string }[] = [
  { key: "OWNER", short: "จ", label: "เจ้าของร้าน" },
  { key: "MANAGER", short: "ผ", label: "ผู้จัดการ" },
  { key: "STAFF", short: "พ", label: "พนักงาน" },
];

const REQUEST_TYPE_LABEL: Record<string, string> = { EXPORT: "ส่งออกข้อมูล", DELETE: "ลบข้อมูล" };
const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  DONE: "ทำแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

function thaiInt(n: number): string {
  return n.toLocaleString("th-TH");
}

function thaiDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function thaiDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Chip({ children, tone = "line" }: { children: React.ReactNode; tone?: "line" | "accent" | "muted" }) {
  const style =
    tone === "accent"
      ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
      : tone === "muted"
        ? { borderColor: "var(--color-line)", color: "var(--color-muted)" }
        : { borderColor: "var(--color-line)", color: "var(--color-ink)" };
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={style}>
      {children}
    </span>
  );
}

function CardTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="flex-1" />
      {right}
    </div>
  );
}

/** ช่องติ๊กที่บันทึกทันทีเมื่อกด (ไม่มีปุ่ม "บันทึก" — เหมือนตัวออกแบบฟิลด์ของ M1.3) */
function Check({ checked, onChange, label, busy }: { checked: boolean; onChange: (v: boolean) => void; label: string; busy: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={busy}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
    />
  );
}

export type PrivacySettingsProps = {
  systemId: string;
  policies: PolicyVersionDto[];
  acceptance: { accepted: number; total: number };
  consents: ConsentStatRow[];
  matrix: SensitiveMatrixRow[];
  hr: HrPositionsSummary;
  accessLog: AccessLogDto[];
  requests: PrivacyRequestDto[];
  autoEraseYears: number;
  /** ลิงก์ไปทะเบียนพนักงานของโมดูล HR (null = ร้านนี้ยังไม่เปิดใช้ระบบพนักงาน) */
  hrHref: string | null;
};

export function PrivacySettings(props: PrivacySettingsProps) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div data-testid="privacy-page" className="flex flex-col gap-4">
      {notice && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--color-accent)", color: "var(--color-ink)" }} role="status">
          {notice}
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <PolicyCard {...props} onNotice={setNotice} />
          <ConsentChannelsCard rows={props.consents} />
          <AccessLogCard rows={props.accessLog} />
        </div>
        <div className="flex flex-col gap-4 lg:w-[420px] lg:flex-none">
          <SensitiveCard {...props} onNotice={setNotice} />
          <RequestsCard {...props} onNotice={setNotice} />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── (ก) นโยบายความเป็นส่วนตัว ─────────────────────────

function PolicyCard({
  systemId,
  policies,
  acceptance,
  onNotice,
}: PrivacySettingsProps & { onNotice: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const current = policies.find((p) => p.isCurrent) ?? null;
  const [body, setBody] = useState(current?.bodyHtml ?? "<p>นโยบายความเป็นส่วนตัวของร้าน</p>");
  const percent = acceptance.total > 0 ? Math.round((acceptance.accepted / acceptance.total) * 100) : 0;

  const save = (publishNow: boolean) => {
    start(async () => {
      const res = await createPolicyVersionAction({ systemId, bodyHtml: body, publishNow });
      onNotice(res.ok ? `บันทึกนโยบายเวอร์ชัน ${res.data.version} แล้ว${publishNow ? " และบังคับใช้ทันที" : " (ยังเป็นร่าง)"}` : res.reason);
      if (res.ok) setOpen(false);
    });
  };

  const publish = (version: number) => {
    start(async () => {
      const res = await publishPolicyVersionAction({ systemId, version });
      onNotice(res.ok ? `เผยแพร่นโยบายเวอร์ชัน ${version} แล้ว` : res.reason);
    });
  };

  return (
    <section data-testid="privacy-policies" className="card p-4">
      <CardTitle
        title="นโยบายความเป็นส่วนตัว"
        right={current ? <Chip tone="accent">เวอร์ชันปัจจุบัน v{current.version}</Chip> : <Chip tone="muted">ยังไม่มีเวอร์ชันที่บังคับใช้</Chip>}
      />
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
          <dt style={{ color: "var(--color-muted)" }}>บังคับใช้</dt>
          <dd>{thaiDate(current?.effectiveAt ?? null)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt style={{ color: "var(--color-muted)" }}>ยอมรับแล้ว</dt>
          <dd>
            {thaiInt(acceptance.accepted)} / {thaiInt(acceptance.total)} คน ({percent}%)
          </dd>
        </div>
      </dl>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "var(--color-ink)" }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen((v) => !v)} disabled={pending}>
          {open ? "ปิดตัวแก้ข้อความ" : "แก้ข้อความ"}
        </button>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} disabled={pending}>
          ออกเวอร์ชันใหม่
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            data-testid="privacy-policy-editor"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full rounded-lg border p-2 text-sm"
            style={{ borderColor: "var(--color-line)", background: "var(--color-surface)", fontFamily: "var(--font-mono, monospace)" }}
          />
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            ใช้แท็กอย่างง่ายได้ (ย่อหน้า หัวข้อ รายการ ตัวหนา ลิงก์) — แท็กอื่นจะถูกตัดออกก่อนบันทึกเพื่อความปลอดภัย
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => save(false)} disabled={pending}>
              บันทึกเป็นร่าง
            </button>
            <button type="button" className="btn btn-primary text-sm" onClick={() => save(true)} disabled={pending}>
              บันทึกและบังคับใช้ทันที
            </button>
          </div>
        </div>
      )}

      {policies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
          {policies.map((p) => (
            <li key={p.version} className="flex items-center gap-2">
              <span className="font-medium">v{p.version}</span>
              <span style={{ color: "var(--color-muted)" }}>
                {p.effectiveAt ? `บังคับใช้ ${thaiDate(p.effectiveAt)}` : "ร่าง (ยังไม่บังคับใช้)"}
              </span>
              <span className="flex-1" />
              {p.isCurrent ? (
                <Chip tone="accent">ใช้อยู่</Chip>
              ) : (
                <button type="button" className="btn btn-ghost text-xs" onClick={() => publish(p.version)} disabled={pending}>
                  เผยแพร่
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── (ข) ช่องทางความยินยอม ─────────────────────────

function ConsentChannelsCard({ rows }: { rows: ConsentStatRow[] }) {
  // ทะเบียนกลางเป็นคนบอกว่ามีช่องทางอะไร — ถ้าข้อมูลสรุปยังไม่มา ก็ยังต้องเห็นครบทุกช่อง (D19)
  const registry = consentChannels();
  const byKey = new Map(rows.map((r) => [r.channel, r]));
  return (
    <section data-testid="privacy-consent-channels" className="card p-4">
      <CardTitle title="ช่องทางความยินยอม" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--color-muted)" }}>
              <th className="py-1 text-left font-normal">ช่องทาง</th>
              <th className="py-1 text-left font-normal">ข้อความขอความยินยอม</th>
              <th className="py-1 text-left font-normal">ค่าเริ่มต้นตอนสมัคร</th>
              <th className="py-1 text-right font-normal">ยินยอมแล้ว</th>
            </tr>
          </thead>
          <tbody>
            {registry.map((def) => {
              const row = byKey.get(def.key);
              return (
                <tr key={def.key} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="py-2 pr-2 whitespace-nowrap">{def.label}</td>
                  <td className="py-2 pr-2" style={{ color: "var(--color-muted)" }}>
                    {row?.askText ?? `อนุญาตให้ร้านส่งข่าวสารและสิทธิพิเศษทาง${def.label}`}
                  </td>
                  <td className="py-2 pr-2">
                    <Chip tone={def.canNotify ? "line" : "muted"}>{def.canNotify ? "ถาม" : "ถาม (ยังส่งออกไม่ได้)"}</Chip>
                  </td>
                  <td className="py-2 text-right tabular-nums">{thaiInt(row?.granted ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
        ข้อความที่ลูกค้าเห็นตอนสมัครมาจากทะเบียนช่องทางกลางของระบบ — เพิ่มช่องทางใหม่แล้วหน้านี้จะขึ้นเองทันที
      </p>
    </section>
  );
}

// ───────────────────────── (ค) ใครดูข้อมูลอ่อนไหวได้ ─────────────────────────

function SensitiveCard({
  systemId,
  matrix,
  hr,
  hrHref,
  onNotice,
}: PrivacySettingsProps & { onNotice: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<SensitiveMatrixRow[]>(matrix);
  const logAll = rows.length > 0 && rows.every((r) => r.logAccess);

  const save = (row: SensitiveMatrixRow, patch: Partial<SensitiveMatrixRow>) => {
    const next: SensitiveMatrixRow = { ...row, ...patch };
    setRows((prev) => prev.map((r) => (r.targetId === row.targetId && r.targetType === row.targetType ? next : r)));
    start(async () => {
      const res = await setSensitivePolicyAction({
        systemId,
        targetType: next.targetType,
        targetId: next.targetId,
        roles: next.roles,
        hrPositions: next.hrPositions,
        hrDepartments: next.hrDepartments,
        sameUnitOnly: next.sameUnitOnly,
        logAccess: next.logAccess,
      });
      if (!res.ok) {
        setRows(matrix);
        onNotice(res.reason);
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.targetId === next.targetId && r.targetType === next.targetType ? { ...res.data, hasPolicy: true } : r)),
      );
      onNotice(`บันทึกสิทธิ์การดู "${next.targetLabel}" แล้ว`);
    });
  };

  const reset = (row: SensitiveMatrixRow) => {
    if (!row.hasPolicy || !row.id) return;
    start(async () => {
      const res = await deleteSensitivePolicyAction({ systemId, id: row.id });
      onNotice(res.ok ? `คืนค่าปริยายของ "${row.targetLabel}" แล้ว (เจ้าของร้านและผู้จัดการดูได้)` : res.reason);
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.targetId === row.targetId && r.targetType === row.targetType
              ? { ...r, id: "", hasPolicy: false, roles: ["OWNER", "MANAGER"], hrPositions: [], hrDepartments: [], sameUnitOnly: false, logAccess: true }
              : r,
          ),
        );
      }
    });
  };

  const toggleRole = (row: SensitiveMatrixRow, role: string, on: boolean) => {
    const roles = on ? [...new Set([...row.roles, role])] : row.roles.filter((r) => r !== role);
    save(row, { roles });
  };

  const addChip = (row: SensitiveMatrixRow, kind: "position" | "department", value: string) => {
    if (!value) return;
    if (kind === "position") save(row, { hrPositions: [...new Set([...row.hrPositions, value])] });
    else save(row, { hrDepartments: [...new Set([...row.hrDepartments, value])] });
  };

  const removeChip = (row: SensitiveMatrixRow, kind: "position" | "department", value: string) => {
    if (kind === "position") save(row, { hrPositions: row.hrPositions.filter((v) => v !== value) });
    else save(row, { hrDepartments: row.hrDepartments.filter((v) => v !== value) });
  };

  return (
    <section data-testid="privacy-sensitive" className="card p-4">
      <CardTitle title="ใครดูข้อมูลอ่อนไหวได้" />
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          ยังไม่มีส่วนหรือฟิลด์ไหนถูกทำเครื่องหมายว่าเป็นข้อมูลอ่อนไหว — ตั้งได้ที่หน้า &quot;ตั้งค่าฟิลด์สมาชิก&quot;
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--color-muted)" }}>
                <th className="py-1 text-left font-normal">ส่วน / ฟิลด์</th>
                {ROLE_COLUMNS.map((c) => (
                  <th key={c.key} className="px-1 py-1 text-center font-normal" title={c.label}>
                    {c.short}
                  </th>
                ))}
                <th className="py-1 text-left font-normal">ตำแหน่ง/แผนกจาก HR</th>
                <th className="px-1 py-1 text-center font-normal">สาขาเดียวกัน</th>
                <th className="py-1 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.targetType}:${row.targetId}`} className="border-t align-top" style={{ borderColor: "var(--color-line)" }}>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{row.targetLabel}</div>
                    <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {row.targetType === "SECTION" ? "ทั้งส่วน" : "เฉพาะฟิลด์"}
                      {row.hasPolicy ? "" : " · ค่าปริยาย"}
                    </div>
                  </td>
                  {ROLE_COLUMNS.map((c) => (
                    <td key={c.key} className="px-1 py-2 text-center">
                      <Check
                        busy={pending}
                        label={`${c.label} ดู ${row.targetLabel} ได้`}
                        checked={row.roles.includes(c.key)}
                        onChange={(v) => toggleRole(row, c.key, v)}
                      />
                    </td>
                  ))}
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.hrPositions.length === 0 && row.hrDepartments.length === 0 && (
                        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                          — (บทบาทเท่านั้น)
                        </span>
                      )}
                      {row.hrPositions.map((v) => (
                        <button key={`p-${v}`} type="button" onClick={() => removeChip(row, "position", v)} disabled={pending} title="เอาตำแหน่งนี้ออก">
                          <Chip>{v}</Chip>
                        </button>
                      ))}
                      {row.hrDepartments.map((v) => (
                        <button key={`d-${v}`} type="button" onClick={() => removeChip(row, "department", v)} disabled={pending} title="เอาแผนกนี้ออก">
                          <Chip tone="muted">{v}</Chip>
                        </button>
                      ))}
                    </div>
                    <select
                      className="mt-1 w-full rounded-lg border px-1 py-0.5 text-xs"
                      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
                      value=""
                      disabled={pending || (hr.positions.length === 0 && hr.departments.length === 0)}
                      onChange={(e) => {
                        const [kind, value] = e.target.value.split(":");
                        if (kind === "p") addChip(row, "position", value ?? "");
                        if (kind === "d") addChip(row, "department", value ?? "");
                        e.currentTarget.value = "";
                      }}
                      aria-label={`เพิ่มตำแหน่งหรือแผนกที่ดู ${row.targetLabel} ได้`}
                    >
                      <option value="">เพิ่มตำแหน่ง/แผนก</option>
                      {hr.positions.map((v) => (
                        <option key={`p-${v}`} value={`p:${v}`}>
                          ตำแหน่ง {v}
                        </option>
                      ))}
                      {hr.departments.map((v) => (
                        <option key={`d-${v}`} value={`d:${v}`}>
                          แผนก {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-2 text-center">
                    <Check
                      busy={pending}
                      label={`เห็นเฉพาะสมาชิกสาขาเดียวกันสำหรับ ${row.targetLabel}`}
                      checked={row.sameUnitOnly}
                      onChange={(v) => save(row, { sameUnitOnly: v })}
                    />
                  </td>
                  <td className="py-2 text-right">
                    {row.hasPolicy && (
                      <button type="button" className="btn btn-ghost text-xs" onClick={() => reset(row)} disabled={pending}>
                        คืนค่าปริยาย
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
        ตำแหน่ง/แผนกอ่านจากโมดูลพนักงาน (HR) — พนักงานต้องผูกบัญชีผู้ใช้ถึงจะได้สิทธิ์ตามตำแหน่ง
      </p>

      {hr.unlinkedCount > 0 && (
        <p data-testid="privacy-sensitive-unlinked" className="mt-1 text-xs" style={{ color: "var(--color-warning, var(--color-muted))" }}>
          พนักงาน {thaiInt(hr.unlinkedCount)} คนยังไม่ผูกบัญชีผู้ใช้ ({hr.unlinked.slice(0, 3).map((u) => u.name).join(" · ")}
          {hr.unlinked.length > 3 ? " และอีกหลายคน" : ""}) — ตั้งสิทธิ์ตามตำแหน่งให้เขายังไม่มีผล
          {hrHref ? (
            <>
              {" "}
              <Link href={hrHref} className="underline">
                ไปผูกบัญชีที่ทะเบียนพนักงาน
              </Link>
            </>
          ) : null}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
        <Check
          busy={pending}
          label="บันทึกการดูทุกครั้ง"
          checked={logAll}
          onChange={(v) => {
            for (const row of rows) if (row.logAccess !== v) save(row, { logAccess: v });
          }}
        />
        <span className="text-sm">บันทึกการดูทุกครั้ง</span>
      </div>
    </section>
  );
}

// ───────────────────────── (ง) บันทึกการเข้าถึงข้อมูลอ่อนไหว ─────────────────────────

function AccessLogCard({ rows }: { rows: AccessLogDto[] }) {
  const [who, setWho] = useState("");
  const [days, setDays] = useState("30");
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.userId, r.userName);
    return [...map.entries()];
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (who && r.userId !== who) return false;
    if (days !== "all") {
      const limit = Date.now() - Number(days) * 86400_000;
      if (new Date(r.at).getTime() < limit) return false;
    }
    return true;
  });

  return (
    <section data-testid="privacy-access-log" className="card p-4">
      <CardTitle
        title="บันทึกการเข้าถึงข้อมูลอ่อนไหว"
        right={
          <div className="flex items-center gap-2">
            <select
              aria-label="กรองตามผู้ดู"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              <option value="">ทุกคน</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="กรองตามช่วงเวลา"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              <option value="7">7 วันล่าสุด</option>
              <option value="30">30 วันล่าสุด</option>
              <option value="90">90 วันล่าสุด</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </div>
        }
      />
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          ยังไม่มีใครเปิดดูข้อมูลอ่อนไหวในช่วงเวลานี้
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--color-muted)" }}>
                <th className="py-1 text-left font-normal">เวลา</th>
                <th className="py-1 text-left font-normal">ใคร</th>
                <th className="py-1 text-left font-normal">ตำแหน่ง (HR)</th>
                <th className="py-1 text-left font-normal">ดูอะไรของใคร</th>
                <th className="py-1 text-left font-normal">จากหน้าไหน</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                    {thaiDateTime(r.at)}
                  </td>
                  <td className="py-2 pr-2">{r.userName}</td>
                  <td className="py-2 pr-2" style={{ color: "var(--color-muted)" }}>
                    {r.hrPosition ?? "—"}
                  </td>
                  <td className="py-2 pr-2">
                    {r.targetLabel} ของ {r.customerName}
                  </td>
                  <td className="py-2" style={{ color: "var(--color-muted)" }}>
                    {r.page ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── (จ) คำขอตาม PDPA + (ฉ) ลบอัตโนมัติ ─────────────────────────

function RequestsCard({
  systemId,
  requests,
  autoEraseYears,
  onNotice,
}: PrivacySettingsProps & { onNotice: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  const [keyword, setKeyword] = useState("");
  const [years, setYears] = useState(String(autoEraseYears));

  const doExport = () => {
    start(async () => {
      const res = await requestExportAction({ systemId, keyword });
      onNotice(res.ok ? "ส่งออกข้อมูลของสมาชิกเรียบร้อย — ดูรายการคำขอด้านล่าง" : res.reason);
      if (res.ok) setKeyword("");
    });
  };

  const doErase = () => {
    start(async () => {
      const res = await requestEraseAction({ systemId, keyword });
      onNotice(
        res.ok
          ? res.data.status === "DONE"
            ? "ลบข้อมูลของสมาชิกเรียบร้อย (ร้านนี้ยังไม่ได้ตั้งสายอนุมัติสำหรับการลบ)"
            : "ส่งคำขอลบข้อมูลเข้าสายอนุมัติแล้ว — รอผู้มีสิทธิ์อนุมัติก่อนจึงจะลบจริง"
          : res.reason,
      );
      if (res.ok) setKeyword("");
    });
  };

  const saveYears = (v: string) => {
    setYears(v);
    start(async () => {
      const res = await setAutoEraseYearsAction({ systemId, years: Number(v) });
      onNotice(res.ok ? (res.data.years > 0 ? `ตั้งลบอัตโนมัติหลังไม่เคลื่อนไหว ${res.data.years} ปีแล้ว` : "ปิดการลบอัตโนมัติแล้ว") : res.reason);
    });
  };

  return (
    <section data-testid="privacy-requests" className="card p-4">
      <CardTitle title="คำขอตาม PDPA" />
      <div className="flex flex-col gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="รหัสสมาชิก เบอร์โทร หรืออีเมล"
          aria-label="ค้นสมาชิกที่ยื่นคำขอ"
          className="w-full rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={doExport} disabled={pending || !keyword.trim()}>
            ขอส่งออกข้อมูล
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={doErase} disabled={pending || !keyword.trim()}>
            ขอลบข้อมูล
          </button>
        </div>
      </div>

      <ul className="mt-3 flex flex-col">
        {requests.length === 0 && (
          <li className="py-2 text-sm" style={{ color: "var(--color-muted)" }}>
            ยังไม่มีคำขอตาม PDPA ในร้านนี้
          </li>
        )}
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-2 border-t py-2" style={{ borderColor: "var(--color-line)" }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{REQUEST_TYPE_LABEL[r.type] ?? r.type}</div>
              <div className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                {r.customerName} · ขอ {thaiDate(r.createdAt)}
              </div>
            </div>
            <Chip tone={r.status === "PENDING" ? "accent" : "muted"}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</Chip>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
        คำขอ &quot;ลบข้อมูล&quot; ต้องผ่านการอนุมัติจากผู้จัดการก่อนดำเนินการเสมอ
      </p>

      <div data-testid="privacy-auto-erase" className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <span>เก็บข้อมูลลูกค้าที่ไม่เคลื่อนไหว: ลบอัตโนมัติหลัง</span>
        <select
          aria-label="จำนวนปีก่อนลบข้อมูลลูกค้าที่ไม่เคลื่อนไหว"
          value={years}
          disabled={pending}
          onChange={(e) => saveYears(e.target.value)}
          className="rounded-lg border px-2 py-1 text-sm"
          style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
        >
          <option value="0">ไม่ลบอัตโนมัติ</option>
          <option value="3">3 ปี</option>
          <option value="5">5 ปี</option>
          <option value="7">7 ปี</option>
          <option value="10">10 ปี</option>
        </select>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {Number(years) > 0 ? "ระบบจะสร้างคำขอลบเข้าสายอนุมัติให้เอง ไม่ลบทันที" : "ปิดอยู่"}
        </span>
      </div>
    </section>
  );
}

export default PrivacySettings;
