"use client";
// IntegrationsHub.tsx — การ์ดตามหมวด + แผงข้างของศูนย์เชื่อมต่อ (SVC R0.5 · ภาพ จอง 10 / หอ 11)
// 🔴 client: รับ DTO ที่ปิดบังแล้วผ่าน props เท่านั้น · import ได้แค่ types (type-only) + registry (แค็ตตาล็อกบริสุทธิ์) — ห้าม facade/service/กล่องความลับ
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { CatalogEntry, FieldView, IntegrationKind, IntegrationOnFailure, IntegrationView, VirtualView } from "@/lib/core/integrations/types";
import type { IntegrationHealthView } from "@/lib/core/integrations/types"; // SVC C.3
import { INTEGRATION_GROUPS, INTEGRATION_KIND_META, type IntegrationGroup } from "@/lib/core/integrations/registry";
import { disableIntegrationAction, saveIntegrationAction, testIntegrationAction } from "./actions";
import IntegrationHealthPanel from "./IntegrationHealthPanel"; // SVC C.3

type Item = IntegrationView | VirtualView;
type Props = {
  items: Item[];
  catalog: CatalogEntry[];
  keyConfigured: boolean;
  canManage: boolean;
  units: { id: string; name: string }[];
  /** ค่าเริ่มของ "ใช้กับ" ตอนเชื่อมใหม่ ([] = ทุกหน่วย · ผู้จำกัดสาขา = สาขาของตน) */
  defaultUnitIds: string[];
  posLinks: { id: string; name: string; href: string }[];
  bankLinks: { id: string; name: string; href: string }[];
  testTimes: Record<string, string>;
  /** SVC C.3 ▸ สุขภาพของแถวเก็บ (ไม่มีค่าลับ) + เกณฑ์เตือนโควตา #83 ของร้าน ◂ */
  health?: IntegrationHealthView[];
  thresholdPercent?: number;
};
const KEY_MISSING_TEXT = "ยังไม่ตั้งกุญแจ — ระบบยังไม่พร้อมเก็บคีย์ ติดต่อทีม SHARK";
/** ชื่อเริ่มต้นที่ไม่ซ้ำของชนิดนี้ (โหมดเพิ่มอีกชุด) */
function uniqueLabel(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`;
  return `${base} ${Date.now().toString(36)}`;
}
type Selection = { mode: "row"; id: string } | { mode: "new"; kind: IntegrationKind } | null;
type Tab = "ALL" | IntegrationGroup;

const STATUS_TEXT: Record<string, string> = {
  CONNECTED: "เชื่อมแล้ว",
  ERROR: "ขัดข้อง",
  DRAFT: "ยังไม่ทดสอบ",
  DISABLED: "ถอดแล้ว",
  NOT_CONNECTED: "ยังไม่เชื่อม",
};
/** ชนิดเสมือน (LINE/พร้อมเพย์) — ปิดที่ระบบต้นทาง ไม่ใช่ "ถอด" ในศูนย์ฯ */
const VIRTUAL_STATUS_TEXT: Record<string, string> = { ...STATUS_TEXT, DISABLED: "ปิดอยู่" };

function StatusDot({ status, text }: { status: string; text?: string }) {
  const on = status === "CONNECTED";
  const bad = status === "ERROR";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-[color:var(--color-ink)]" : bad ? "bg-red-600" : "bg-gray-300"}`} />
      <span className={bad ? "text-red-700" : on ? "" : "text-[color:var(--color-muted)]"}>{text ?? STATUS_TEXT[status] ?? status}</span>
    </span>
  );
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${muted ? "text-[color:var(--color-muted)]" : "font-medium"}`}>{children}</span>
  );
}

function Card({
  short,
  title,
  sub,
  right,
  footer,
  active,
  dim,
  onClick,
  href,
  testId,
}: {
  short: string;
  title: string;
  sub: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  active?: boolean;
  dim?: boolean;
  onClick?: () => void;
  href?: string;
  testId?: string;
}) {
  const cls = `flex w-full flex-col gap-3 rounded-2xl border bg-white p-4 text-left transition ${active ? "border-2 border-blue-700" : dim ? "border-gray-200 bg-gray-50" : "border-[color:var(--color-ink)]/70"} ${
    onClick || href ? "hover:shadow-sm" : ""
  }`;
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold ${dim ? "text-[color:var(--color-muted)]" : ""}`}>{short}</span>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold ${dim ? "text-[color:var(--color-muted)]" : ""}`}>{title}</div>
          <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">{sub}</div>
        </div>
        {right}
      </div>
      {footer && <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-muted)]">{footer}</div>}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls} data-testid={testId}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls} data-testid={testId}>
        {body}
      </button>
    );
  return (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

export function IntegrationsHub({ items, catalog, keyConfigured, canManage, units, defaultUnitIds, posLinks, bankLinks, testTimes, health = [], thresholdPercent = 10 }: Props) {
  const healthById = useMemo(() => new Map(health.map((h) => [h.id, h])), [health]); // SVC C.3
  const [tab, setTab] = useState<Tab>("ALL");
  const [sel, setSel] = useState<Selection>(null);
  const stored = items.filter((i): i is IntegrationView => !i.virtual);
  const byKind = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) m.set(it.kind, [...(m.get(it.kind) ?? []), it]);
    return m;
  }, [items]);

  const groupCount = (g: IntegrationGroup) => catalog.filter((c) => INTEGRATION_KIND_META[c.kind].group === g).length;
  const selected = sel?.mode === "row" ? (stored.find((s) => s.id === sel.id) ?? null) : null;
  const newEntry = sel?.mode === "new" ? (catalog.find((c) => c.kind === sel.kind) ?? null) : null;

  const renderKind = (entry: CatalogEntry) => {
    const meta = INTEGRATION_KIND_META[entry.kind];
    const rows = byKind.get(entry.kind) ?? [];
    if (entry.virtual) {
      const vs = rows as VirtualView[];
      if (!vs.length) {
        // LINE ยังไม่เชื่อม — เชื่อมที่ระบบแชท (เพิ่มระบบแชทจากทะเบียนระบบ)
        return [
          <Card
            key={entry.kind}
            short={meta.short}
            title={meta.label}
            sub={meta.desc}
            href="/app/settings/systems"
            right={<Badge muted>ยังไม่เชื่อม</Badge>}
            footer={<StatusDot status="NOT_CONNECTED" />}
          />,
        ];
      }
      return vs.map((v) => (
        <Card
          key={v.id}
          short={meta.short}
          title={v.label}
          sub={v.summary}
          href={v.manageHref}
          right={v.status === "CONNECTED" ? <Badge>เชื่อมแล้ว</Badge> : <Badge muted>{VIRTUAL_STATUS_TEXT[v.status]}</Badge>}
          footer={
            <>
              <StatusDot status={v.status} text={VIRTUAL_STATUS_TEXT[v.status]} />
              <span>จัดการ ›</span>
            </>
          }
        />
      ));
    }
    const rs = rows as IntegrationView[];
    const cards = rs.map((r) => (
      <Card
        key={r.id}
        short={meta.short}
        title={`${meta.label} · ${r.label}`}
        sub={`${entry.providers.find((p) => p.code === r.provider)?.label ?? r.provider} · ${r.unitIds.length ? `${r.unitIds.length} หน่วย` : "ทุกหน่วย"}`}
        active={sel?.mode === "row" && sel.id === r.id}
        onClick={() => setSel({ mode: "row", id: r.id })}
        right={r.status === "CONNECTED" ? <Badge>เชื่อมแล้ว</Badge> : <Badge muted>{STATUS_TEXT[r.status]}</Badge>}
        footer={
          <>
            <StatusDot status={r.status} />
            {/* SVC C.3 ▸ โควตาต่ำกว่าเกณฑ์ #83 ⇒ "เหลือ N%" บนการ์ด ◂ */}
            {healthById.get(r.id)?.quota?.low && (
              <span className="font-medium text-amber-700" data-testid="integration-card-quota-low">
                เหลือ {healthById.get(r.id)?.quota?.percent ?? healthById.get(r.id)?.quota?.remaining ?? 0}
                {healthById.get(r.id)?.quota?.percent !== null ? "%" : ""}
              </span>
            )}
            <span>ตั้งค่า ›</span>
          </>
        }
      />
    ));
    if (!entry.ready && !rs.length) {
      cards.push(<Card key={`${entry.kind}-soon`} short={meta.short} title={meta.label} sub={meta.desc} dim right={<Badge muted>เร็ว ๆ นี้</Badge>} />);
    } else if (entry.ready && (!rs.length || canManage)) {
      const canAdd = canManage && entry.providers.length > 0;
      cards.push(
        <Card
          key={`${entry.kind}-new`}
          short={meta.short}
          title={rs.length ? `เพิ่ม${meta.label}อีกชุด` : meta.label}
          sub={entry.providers.length ? meta.desc : "ยังไม่มีผู้ให้บริการที่เปิดให้ใช้ — เร็ว ๆ นี้"}
          active={sel?.mode === "new" && sel.kind === entry.kind}
          onClick={canAdd ? () => setSel({ mode: "new", kind: entry.kind }) : undefined}
          right={canAdd ? <Badge>เชื่อม</Badge> : <Badge muted>{entry.providers.length ? "เจ้าของร้านเชื่อม" : "เร็ว ๆ นี้"}</Badge>}
          footer={<StatusDot status="NOT_CONNECTED" />}
        />,
      );
    }
    return cards;
  };

  const groups = INTEGRATION_GROUPS.filter((g) => tab === "ALL" || g.group === tab);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <b>ศูนย์เชื่อมต่อของร้าน</b> — เชื่อมครั้งเดียว ใช้ได้ทุกระบบของร้าน (จองคิว · เครื่องคิดเงิน · หอพัก · บัญชี) · ร้านไปสมัครกับผู้ให้บริการเอง แล้วนำคีย์มาใส่ · คีย์เก็บแบบเข้ารหัส ไม่มีใครเห็นเต็ม ·
          ไม่เชื่อม = ระบบทำแบบมือแทน
        </div>
        {!keyConfigured && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="integrations-key-missing">
            {KEY_MISSING_TEXT} · การ์ด LINE/พร้อมเพย์ และหน้าอื่นยังใช้ได้ตามปกติ
          </div>
        )}
        <div className="flex flex-wrap gap-1 border-b">
          {(["ALL", ...INTEGRATION_GROUPS.map((g) => g.group)] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? "border-[color:var(--color-ink)] font-semibold" : "border-transparent text-[color:var(--color-muted)]"}`}
            >
              {t === "ALL" ? "ทั้งหมด" : INTEGRATION_GROUPS.find((g) => g.group === t)?.label}{" "}
              <span className="text-xs text-[color:var(--color-muted)]">{t === "ALL" ? catalog.length : groupCount(t)}</span>
            </button>
          ))}
        </div>
        {groups.map((g) => (
          <section key={g.group} className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">
              {g.label} <span className="text-xs font-normal text-[color:var(--color-muted)]">{g.hint}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {catalog.filter((c) => INTEGRATION_KIND_META[c.kind].group === g.group).flatMap(renderKind)}
              {g.group === "PAYMENT" &&
                bankLinks.map((b) => (
                  <Card
                    key={`bank-${b.id}`}
                    short="ธนาคาร"
                    title={`รายการเดินบัญชีธนาคาร · ${b.name}`}
                    sub="มีแล้วในบัญชี V2 — นำเข้าไฟล์ · จับคู่เงินเข้ากับบิลอัตโนมัติ"
                    href={b.href}
                    right={<Badge muted>ใช้งาน</Badge>}
                    footer={<span>ไปหน้ากระทบยอด ›</span>}
                  />
                ))}
              {g.group === "CHANNELS" &&
                (posLinks.length ? (
                  posLinks.map((p) => (
                    <Card
                      key={`pos-${p.id}`}
                      short="POS"
                      title={`ตัวเชื่อมของ POS · ${p.name}`}
                      sub="ตัวเชื่อมของ POS ตั้งที่หน้าตั้งค่า POS (เดลิเวอรี · ตรวจสลิป · e-Tax)"
                      href={p.href}
                      right={<Badge muted>ตั้งที่ POS</Badge>}
                      footer={<span>ไปหน้าตั้งค่า POS ›</span>}
                    />
                  ))
                ) : (
                  <Card key="pos-none" short="POS" title="ตัวเชื่อมของ POS" sub="ตัวเชื่อมของ POS ตั้งที่หน้าตั้งค่า POS — ร้านนี้ยังไม่มีระบบ POS" dim right={<Badge muted>ไม่มีระบบ</Badge>} />
                ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <Panel
            key={selected.id}
            view={selected}
            entry={catalog.find((c) => c.kind === selected.kind) ?? null}
            keyConfigured={keyConfigured}
            canManage={canManage}
            units={units}
            defaultUnitIds={defaultUnitIds}
            takenLabels={[]}
            testTime={testTimes[selected.id] ?? null}
            onDone={() => undefined}
          />
        ) : newEntry ? (
          <Panel
            key={`new-${newEntry.kind}`}
            view={null}
            entry={newEntry}
            keyConfigured={keyConfigured}
            canManage={canManage}
            units={units}
            defaultUnitIds={defaultUnitIds}
            takenLabels={stored.filter((x) => x.kind === newEntry.kind).map((x) => x.label)}
            testTime={null}
            onDone={(id) => (id ? setSel({ mode: "row", id }) : undefined)}
          />
        ) : (
          <div className="rounded-2xl border p-5 text-sm text-[color:var(--color-muted)]">
            เลือกการ์ดเพื่อดูรายละเอียด · ใส่คีย์ · ทดสอบ · เลือกสาขาที่ใช้ · และเลือกว่าจะทำอย่างไรเมื่อผู้ให้บริการไม่ตอบ
          </div>
        )}
        {/* SVC C.3 ▸ สุขภาพของแถวที่เลือก (สถานะ · โควตา · กราฟ 14 วัน · ผลเรียกล่าสุด) ◂ */}
        {selected && healthById.get(selected.id) && <IntegrationHealthPanel health={healthById.get(selected.id)!} thresholdPercent={thresholdPercent} />}
      </aside>
    </div>
  );
}

function Panel({
  view,
  entry,
  keyConfigured,
  canManage,
  units,
  defaultUnitIds,
  takenLabels,
  testTime,
  onDone,
}: {
  view: IntegrationView | null;
  entry: CatalogEntry | null;
  keyConfigured: boolean;
  canManage: boolean;
  units: { id: string; name: string }[];
  defaultUnitIds: string[];
  takenLabels: string[];
  testTime: string | null;
  onDone: (id: string | null) => void;
}) {
  const kind = view?.kind ?? entry?.kind ?? "SLIP_VERIFY";
  const meta = INTEGRATION_KIND_META[kind];
  const providers = entry?.providers ?? [];
  const [provider, setProvider] = useState(view?.provider ?? providers[0]?.code ?? "");
  // โหมดเพิ่มใหม่: เติมชื่อที่ไม่ซ้ำให้ก่อน (server ปฏิเสธชื่อซ้ำด้วย DUPLICATE_LABEL — ไม่ทับแถวเดิม)
  const [label, setLabel] = useState(view?.label ?? uniqueLabel(meta.label, takenLabels));
  const [unitIds, setUnitIds] = useState<string[]>(view?.unitIds ?? defaultUnitIds);
  const [onFailure, setOnFailure] = useState<IntegrationOnFailure>(view?.onFailure ?? "MANUAL");
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const providerFields = providers.find((p) => p.code === provider)?.fields ?? [];
  const fields: FieldView[] = view
    ? view.fields
    : providerFields.map((f) => ({ name: f.name, label: f.label, secret: f.secret, required: f.required, filled: false, masked: "" }));
  const readOnly = !canManage;
  const typedSecret = fields.some((f) => f.secret && (values[f.name] ?? "") !== "");
  const saveDisabled = readOnly || pending || !keyConfigured || !provider;

  const submit = () =>
    start(async () => {
      const changed: Record<string, string> = {};
      for (const f of fields) if (values[f.name] !== undefined && (f.secret ? values[f.name] !== "" : values[f.name] !== f.masked)) changed[f.name] = values[f.name]!;
      const name = label.trim() || (view ? view.label : uniqueLabel(meta.label, takenLabels));
      if (!view && takenLabels.includes(name)) {
        setMsg({ ok: false, text: "มีการเชื่อมต่อชื่อนี้อยู่แล้ว — ตั้งชื่ออื่น" });
        return;
      }
      const r = await saveIntegrationAction({
        ...(view ? { id: view.id } : { create: true }),
        kind,
        provider,
        label: name,
        unitIds,
        onFailure,
        ...(Object.keys(changed).length ? { fields: changed } : {}),
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setValues({});
        setEditing({});
        onDone(r.id);
      }
    });
  const runTest = () =>
    view &&
    start(async () => {
      const r = await testIntegrationAction(view.id);
      setMsg({ ok: r.ok, text: r.message });
    });
  const runDisable = () =>
    view &&
    start(async () => {
      if (!window.confirm("ถอดการเชื่อมต่อนี้? คีย์ลับจะถูกลบทิ้ง และระบบจะกลับไปทำแบบมือ")) return;
      const r = await disableIntegrationAction(view.id);
      setMsg({ ok: r.ok, text: r.message });
    });

  return (
    <div className="flex flex-col rounded-2xl border bg-white">
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-[color:var(--color-muted)]">ตัวต่อ · {meta.label}</div>
            <div className="text-lg font-semibold">{view ? view.label : meta.label}</div>
          </div>
          {view && <Badge muted={view.status !== "CONNECTED"}>{STATUS_TEXT[view.status]}</Badge>}
        </div>
        {!keyConfigured && <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{KEY_MISSING_TEXT}</div>}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">ผู้ให้บริการ</span>
          <select
            value={provider}
            disabled={!!view || readOnly}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-xl border px-3 py-2.5 text-sm disabled:bg-gray-50"
          >
            {!providers.some((p) => p.code === provider) && provider && <option value={provider}>{provider}</option>}
            {providers.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[color:var(--color-muted)]">รายการ = ตัวต่อที่ SHARK มี · ร้านไปสมัครกับผู้ให้บริการเอง (จ่ายค่าตรวจเอง)</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">ชื่อเรียก</span>
          <input
            value={label}
            disabled={readOnly}
            placeholder={meta.label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-xl border px-3 py-2.5 text-sm disabled:bg-gray-50"
          />
        </label>

        {fields.map((f) =>
          f.secret ? (
            <label key={f.name} className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">
                {f.label}
                {f.required ? " *" : ""}
              </span>
              {f.filled && !editing[f.name] ? (
                <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                  <span className="font-mono text-sm tracking-wider">{f.masked || "••••"}</span>
                  {!readOnly && (
                    <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setEditing((e) => ({ ...e, [f.name]: true }))}>
                      เปลี่ยน
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type="password"
                  autoComplete="off"
                  disabled={readOnly || !keyConfigured}
                  value={values[f.name] ?? ""}
                  placeholder={keyConfigured ? "วางคีย์จากผู้ให้บริการ" : "ยังไม่ตั้งกุญแจ"}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="rounded-xl border px-3 py-2.5 font-mono text-sm disabled:bg-gray-50"
                />
              )}
              <span className="text-xs text-[color:var(--color-muted)]">เข้ารหัสเก็บ · ไม่แสดงซ้ำ · บันทึกว่าใครเปลี่ยนเมื่อไร</span>
            </label>
          ) : (
            <label key={f.name} className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">
                {f.label}
                {f.required ? " *" : ""}
              </span>
              <input
                disabled={readOnly}
                value={values[f.name] ?? f.masked}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="rounded-xl border px-3 py-2.5 text-sm disabled:bg-gray-50"
              />
            </label>
          ),
        )}

        {view && (
          <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm ${view.lastTestOk ? "border-blue-300 bg-blue-50" : ""}`}>
            <span>
              {view.lastTestAt == null
                ? "ยังไม่เคยทดสอบ"
                : view.lastTestOk
                  ? `✓ ทดสอบผ่าน ${testTime ?? ""}`
                  : `ทดสอบไม่ผ่าน ${testTime ?? ""} · ${view.lastError ?? ""}`}
            </span>
            {!readOnly && view.status !== "DISABLED" && (
              <button type="button" disabled={pending || !keyConfigured} onClick={runTest} className="shrink-0 font-semibold text-blue-700 disabled:opacity-50">
                {view.lastTestAt ? "ทดสอบอีกครั้ง" : "ทดสอบ"}
              </button>
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-2 text-sm" disabled={readOnly}>
          <legend className="mb-1 font-semibold">ใช้กับ</legend>
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={unitIds.includes(u.id)}
                onChange={(e) => setUnitIds((ids) => (e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id)))}
              />
              {u.name}
            </label>
          ))}
          <span className="text-xs text-[color:var(--color-muted)]">ไม่ติ๊กเลย = ใช้กับทุกหน่วยของร้าน</span>
        </fieldset>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">เมื่อบริการไม่ตอบ/โควตาหมด</span>
          <div className="flex gap-2">
            {(
              [
                ["MANUAL", "ส่งเข้าคิวตรวจมือ"],
                ["REJECT", "ปฏิเสธ"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                disabled={readOnly}
                onClick={() => setOnFailure(v)}
                className={`rounded-xl border px-4 py-2 ${onFailure === v ? "bg-[color:var(--color-ink)] font-semibold text-white" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ใครแก้ได้</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            เจ้าของร้าน (หรือผู้ที่เจ้าของร้านให้สิทธิ์ “จัดการศูนย์เชื่อมต่อ” เฉพาะหน่วยที่ดูแล) · ทุกการเปลี่ยนคีย์ลงบันทึก (ใคร · เมื่อไร)
          </span>
        </div>
        {msg && <div className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{msg.text}</div>}
      </div>
      {!readOnly && (
        <div className="flex gap-3 border-t p-5">
          {view && view.status !== "DISABLED" && (
            <button type="button" disabled={pending} onClick={runDisable} className="flex-1 rounded-xl border px-4 py-2.5 text-sm text-red-700">
              ถอดการเชื่อมต่อ
            </button>
          )}
          <button
            type="button"
            disabled={saveDisabled || (!view && !typedSecret && fields.some((f) => f.secret && f.required))}
            onClick={submit}
            className="flex-1 rounded-xl bg-[color:var(--color-ink)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      )}
    </div>
  );
}
