// HR H3.7 ▸ การ์ด "ลงบัญชีเงินเดือน" บนหน้าตั้งค่า HR — สมุดบัญชีที่ลงเงินเดือนของระบบนี้ (เชื่อมชัด ๆ 1 เล่ม · ไม่เลือก = ไม่ลงบัญชี) +
//   บัญชีเงินที่ใช้จ่ายเงินเดือนตั้งต้น + หมายเหตุเงินเบิกล่วงหน้า (ข้อความคงที่ · มติผู้คุมงาน) — แก้ได้เฉพาะเจ้าของร้าน (service ตรวจซ้ำ) ◂
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { getPayrollAccounting, H37_TEXT } from "./payroll";

type Act = (fd: FormData) => Promise<void>;
const btn = "btn btn-primary min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";

/** ผลการกด ?pacct= → ข้อความคงที่ (ไม่แสดงข้อความอิสระ) */
export function payAcctMsgCode(r: { ok: boolean; reason?: string }): string {
  if (r.ok) return "ok";
  return (Object.entries(H37_TEXT).find(([, v]) => v === r.reason)?.[0] ?? (r.reason === "ไม่พบสมุดบัญชีนี้ในร้าน" ? "bookNotFound" : "failed"));
}

export async function PayrollAccountingCard({ systemId, code, onSaveBook, onSavePayAccount }: { systemId: string; code: string; onSaveBook: Act | null; onSavePayAccount: Act | null }) {
  const auth = await requireTenant();
  const t = await getTranslations("hr.payacct");
  const a = await getPayrollAccounting({ tenantId: auth.active.tenantId, systemId });
  const owner = auth.active.role === "OWNER";
  const flash = code === "ok" ? t("saved") : code && code in H37_TEXT ? H37_TEXT[code as keyof typeof H37_TEXT] : code === "bookNotFound" ? t("bookNotFound") : code ? t("failed") : "";
  const current = a.books.find((b) => b.id === a.bookId)?.name ?? null;
  // Q4: ยังไม่เชื่อมแต่ร้านมีสมุดเล่มเดียว ⇒ เลือกไว้ให้ในฟอร์ม (เจ้าของกดบันทึกเอง · ไม่เชื่อมอัตโนมัติ)
  const preselect = a.bookId ?? (a.link === "NONE" && a.books.length === 1 ? a.books[0]!.id : "");
  return (
    <section className={card} id="hr-pay-accounting" data-testid="hr-pay-accounting" aria-labelledby="hr-pay-accounting-title">
      <h2 id="hr-pay-accounting-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className={muted} data-testid="hr-pay-book-state">
        {a.link === "MANY" ? H37_TEXT.bookAmbiguous : current ? t("linked", { name: current }) : t("notLinked")}
      </p>
      {flash && (
        <p role={code === "ok" ? "status" : "alert"} className="text-sm" data-testid="hr-pay-accounting-flash">
          {flash}
        </p>
      )}
      {owner && onSaveBook && (
        <form action={onSaveBook} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex flex-col text-sm">
            {t("book")}
            <select name="accountSystemId" defaultValue={preselect} className="input min-h-[44px]" data-testid="hr-pay-book">
              <option value="">{t("noBook")}</option>
              {a.books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={btn} data-testid="hr-pay-book-save">
            {t("saveBook")}
          </button>
        </form>
      )}
      {owner && onSavePayAccount && a.bookId && (
        <form action={onSavePayAccount} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex flex-col text-sm">
            {t("payAccount")}
            <select name="financeAccountId" defaultValue={a.payAccounts.some((x) => x.id === a.payFinanceAccountId) ? (a.payFinanceAccountId ?? "") : ""} className="input min-h-[44px]" data-testid="hr-pay-account">
              <option value="">{t("choose")}</option>
              {a.payAccounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={btn} data-testid="hr-pay-account-save">
            {t("savePayAccount")}
          </button>
        </form>
      )}
      <p className="text-xs text-[color:var(--color-muted)]">{t("twoStep")}</p>
      <p className="text-xs text-[color:var(--color-muted)]" role="note" data-testid="hr-pay-advance-note">
        {t("advanceNote")}
      </p>
    </section>
  );
}
// ◂ HR H3.7
