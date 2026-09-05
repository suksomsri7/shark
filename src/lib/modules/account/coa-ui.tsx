// coa-ui.tsx — หน้าผังบัญชี V2 (WO 6.1) — server component ประกอบ data layer (coa.ts/coa-v2.ts) เข้ากับ UI
// อ้าง DESIGN-SPEC-V2 §11.1 · เฟรม f8-chart-of-accounts.png · checklist เต็มใน ledger/wo-notes/6.1.md
//
// URL:
//   ?a=<ledgerId>  บัญชีที่เลือก (ไม่มี = เลือกบัญชีแรกให้อัตโนมัติบนจอใหญ่ · มือถือโชว์ต้นไม้ก่อน)
//   ?new=1         เปิด modal เพิ่มบัญชี · ?edit=<ledgerId> เปิด modal แก้ไข
//   ?q=<คำค้น>     คำค้นตั้งต้น (ช่องค้นหากรองต่อฝั่งเบราว์เซอร์ทันทีโดยไม่โหลดหน้าใหม่)

import Link from "next/link";
import { formatBaht } from "@/lib/ui/money";
import { formatDateTh } from "@/lib/ui/date";
import { ChartPanel } from "@/components/account-v2/ChartPanel";
import { LedgerActiveToggle } from "@/components/account-v2/LedgerActiveToggle";
import { LedgerModal } from "@/components/account-v2/LedgerModal";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { chartTree, ledgerDetail, usedLedgerCodes, mappingKeyLabel } from "./coa";
import { subGroupOptions, vatTreatmentLabel, whtLabel, prefixOf, type LedgerDetail, type ChartTree } from "./coa-v2";

type SP = { a?: string; new?: string; edit?: string; q?: string; err?: string };

export async function ChartOfAccountsPage({
  tenantId,
  systemId,
  id,
  searchParams,
}: {
  tenantId: string;
  systemId: string;
  id: string;
  searchParams: SP;
}) {
  const base = `/app/sys/${id}/account`;
  const accountsPath = `${base}/accounts`;
  const ctx = { tenantId, systemId };

  const tree = await chartTree(ctx, {});
  const firstId = firstAccountId(tree);
  const selectedId = searchParams.a || firstId;
  const detail = selectedId ? await ledgerDetail(ctx, selectedId) : null;

  // modal เพิ่ม/แก้ไข — โหลดข้อมูลเสริมเฉพาะตอนเปิด (หน้าปกติไม่เสีย query เพิ่ม)
  const modalOpen = searchParams.new === "1" || !!searchParams.edit;
  let modal: React.ReactNode = null;
  if (modalOpen) {
    const editing = searchParams.edit ? await ledgerDetail(ctx, searchParams.edit) : null;
    const used = await usedLedgerCodes(ctx);
    const groups = subGroupOptions(tree, used);
    modal = (
      <LedgerModal
        systemId={systemId}
        accountsPath={accountsPath}
        groups={groups}
        account={
          editing
            ? {
                id: editing.id,
                code: editing.code,
                name: editing.name,
                nameEn: editing.nameEn,
                groupPrefix: prefixOf(editing.code, 3),
                description: editing.description,
                defaultWhtRateBp: editing.defaultWhtRateBp,
                defaultWhtType: editing.defaultWhtType,
                vatTreatment: editing.vatTreatment,
                isSystem: editing.isSystem,
              }
            : null
        }
      />
    );
  }

  return (
    <>
      <ChartPanel
        tree={tree}
        selectedId={selectedId}
        explicitSelection={!!searchParams.a}
        accountHrefPrefix={`${accountsPath}?a=`}
        listHref={accountsPath}
        createHref={`${accountsPath}?new=1`}
        financeHref={`${base}/finance?new=1`}
        importHref={`${base}/import/chart-of-accounts`}
        printHref={`${accountsPath}/print`}
        initialQ={searchParams.q ?? ""}
        canManage
        detail={
          detail ? (
            <LedgerDetailCards detail={detail} base={base} accountsPath={accountsPath} systemId={systemId} errText={searchParams.err} />
          ) : (
            <section className="card text-sm text-[color:var(--color-muted)]" data-testid="coa-detail-empty">
              เลือกบัญชีจากรายการทางซ้ายเพื่อดูรายละเอียด
            </section>
          )
        }
      />
      {modal}
    </>
  );
}

function firstAccountId(tree: ChartTree): string | null {
  for (const g1 of tree.nodes)
    for (const g2 of g1.children)
      if (g2.kind === "group")
        for (const g3 of g2.children)
          if (g3.kind === "group") for (const a of g3.children) if (a.kind === "account") return a.id;
  return null;
}

/** แถวฟิลด์ในตาราง 2 คอลัมน์ของ f8 (ป้ายซ้ายจาง · ค่าขวาเข้ม · เส้นคั่นบาง) */
function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="flex items-start justify-between gap-4 border-b py-2.5 text-sm last:border-b-0"
      style={{ borderColor: "var(--color-line)" }}
    >
      <span className="shrink-0 text-[color:var(--color-muted)]">{label}</span>
      <span className="min-w-0 text-right" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}

function Badge({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${strong ? "font-semibold" : "text-[color:var(--color-muted)]"}`}
      style={{ borderColor: strong ? "var(--color-ink)" : "var(--color-line)" }}
    >
      {children}
    </span>
  );
}

export function LedgerDetailCards({
  detail,
  base,
  accountsPath,
  systemId,
  errText,
}: {
  detail: LedgerDetail;
  base: string;
  accountsPath: string;
  systemId: string;
  errText?: string;
}) {
  const active = !detail.archivedAt;
  return (
    <>
      {/* ── การ์ดบน: หัว + ป้าย + ตารางฟิลด์ + ยอดคงเหลือ/เคลื่อนไหว + ปุ่มแก้ไข (f8) ── */}
      <section className="card flex flex-col gap-4" data-testid="coa-detail">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xl font-semibold" data-testid="coa-detail-title">
              {detail.code} · {detail.name}
            </h2>
            <Link
              href={`${base}/ledger?account=${detail.id}`}
              className="text-sm text-[color:var(--color-accent)] hover:underline"
              data-testid="coa-detail-ledger-link"
            >
              ดูบัญชีแยกประเภท ›
            </Link>
          </div>
          <LedgerActiveToggle
            systemId={systemId}
            ledgerId={detail.id}
            active={active}
            blockReason={detail.blockReason}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {detail.isSystem && <Badge strong>บัญชีระบบ</Badge>}
          {detail.isSystem && <Badge>แก้ชื่อได้ ลบไม่ได้</Badge>}
          {detail.finance && <Badge>ผูกกับบัญชีเงิน</Badge>}
          {!active && <Badge>ปิดใช้งานอยู่</Badge>}
        </div>

        {errText && (
          <p className="text-sm text-[color:var(--color-danger)]" data-testid="coa-detail-err">
            {errText}
          </p>
        )}

        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          <div>
            <Field label="ผังบัญชีหลัก" testId="coa-field-group1">
              {detail.group1.code} · {detail.group1.name}
            </Field>
            <Field label="ผังบัญชีรอง" testId="coa-field-group2">
              {detail.group2.code} · {detail.group2.name}
            </Field>
            <Field label="ผังบัญชีย่อย" testId="coa-field-group3">
              {detail.group3.code} · {detail.group3.name}
            </Field>
            <Field label="ประเภทบัญชี" testId="coa-field-type">
              {detail.typeLabel}
            </Field>
          </div>
          <div>
            <Field label="ผูกกับบัญชีเงิน" testId="coa-field-finance">
              {detail.finance ? (
                <Link href={`${base}/finance`} className="text-[color:var(--color-accent)] hover:underline">
                  {detail.finance.name}
                  {detail.finance.code ? ` (${detail.finance.code})` : ""}
                </Link>
              ) : (
                "ไม่ได้ผูก"
              )}
            </Field>
            <Field label="อัตราหัก ณ ที่จ่ายเริ่มต้น" testId="coa-field-wht">
              {whtLabel(detail.defaultWhtRateBp, detail.defaultWhtType)}
            </Field>
            <Field label="ประเภทภาษี" testId="coa-field-vat">
              {vatTreatmentLabel(detail.vatTreatment)}
            </Field>
            <Field label="คำอธิบาย" testId="coa-field-desc">
              {detail.description || "—"}
            </Field>
            {/* เพิ่มจาก f8 (ข้อมูลจริงบังคับ): บัญชีที่ระบบใช้ลงบัญชีอัตโนมัติ ต้องมีทางเข้าไปแก้การผูก */}
            {detail.mappingKeys.length > 0 && (
              <Field label="ใช้ลงบัญชีอัตโนมัติ" testId="coa-field-mapping">
                <Link href={`${accountsPath}/mapping`} className="text-[color:var(--color-accent)] hover:underline">
                  {detail.mappingKeys.map(mappingKeyLabel).join(" · ")} ›
                </Link>
              </Field>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-xs text-[color:var(--color-muted)]">ยอดคงเหลือ ณ {formatDateTh(detail.asOf)}</div>
              <div className="text-2xl font-semibold" data-testid="coa-balance">
                {formatBaht(detail.balanceSatang, { decimals: true })}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--color-muted)]">เคลื่อนไหวเดือนนี้</div>
              <div className="text-lg font-semibold" data-testid="coa-month-delta">
                {formatBaht(detail.monthDeltaSatang, { decimals: true })}
              </div>
            </div>
          </div>
          <Link
            href={`${accountsPath}?a=${detail.id}&edit=${detail.id}`}
            className="btn-sm inline-flex items-center gap-1.5"
            data-testid="coa-edit-btn"
          >
            <AccountIcon name="edit" className="h-4 w-4" /> แก้ไขบัญชี
          </Link>
        </div>
      </section>

      {/* ── การ์ดล่าง: เคลื่อนไหวล่าสุด 5 แถว (f8) ── */}
      <section className="card flex flex-col gap-3" data-testid="coa-movements">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">เคลื่อนไหวล่าสุด</h3>
          <Link
            href={`${base}/ledger?account=${detail.id}`}
            className="text-sm text-[color:var(--color-accent)] hover:underline"
          >
            ดูทั้งหมด ›
          </Link>
        </div>
        {detail.movements.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="coa-movements-empty">
            ยังไม่มีรายการเคลื่อนไหวในบัญชีนี้
          </p>
        ) : (
          <>
            {/* มือถือ (f13/f14): ลิสต์ย่อ ไม่ใช่ตารางที่ต้องเลื่อนแนวนอนในการ์ด */}
            <ul className="flex flex-col md:hidden" data-testid="coa-movements-mobile">
              {detail.movements.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 border-b py-3 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`${base}/journal/${m.entryId}`} className="text-sm text-[color:var(--color-accent)] hover:underline">
                      {m.docNo}
                    </Link>
                    <span className="text-sm font-medium">
                      {m.debit ? formatBaht(m.debit, { decimals: true }) : `−${formatBaht(m.credit, { decimals: true })}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--color-muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {formatDateTh(m.date)} · {m.memo || "—"}
                    </span>
                    <span className="whitespace-nowrap">คงเหลือ {formatBaht(m.runningSatang, { decimals: true })}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="-mx-2 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                  <th className="px-2 py-2 font-normal">วันที่</th>
                  <th className="px-2 py-2 font-normal">ใบสำคัญ</th>
                  <th className="px-2 py-2 font-normal">รายการ</th>
                  <th className="px-2 py-2 text-right font-normal">เดบิต</th>
                  <th className="px-2 py-2 text-right font-normal">เครดิต</th>
                  <th className="px-2 py-2 text-right font-normal">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {detail.movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-line)" }} data-testid={`coa-mv-${m.id}`}>
                    <td className="whitespace-nowrap px-2 py-3 text-[color:var(--color-muted)]">{formatDateTh(m.date)}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <Link href={`${base}/journal/${m.entryId}`} className="text-[color:var(--color-accent)] hover:underline">
                        {m.docNo}
                      </Link>
                    </td>
                    <td className="px-2 py-3">{m.memo || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {m.debit ? formatBaht(m.debit, { decimals: true }) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {m.credit ? formatBaht(m.credit, { decimals: true }) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-medium">
                      {formatBaht(m.runningSatang, { decimals: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
