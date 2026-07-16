import { requireTenant } from "@/lib/core/context";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  getBoard,
  listContacts,
  listPendingActivities,
  forecast,
  type Ctx,
} from "./service";
import {
  createContactAction,
  createDealAction,
  moveDealAction,
  completeActivityAction,
} from "./actions";

const muted = "text-[color:var(--color-muted)]";

// สถานะวงจรลูกค้า (ไทย) — LEAD/PROSPECT อยู่ระหว่างทาง(เทา) · CUSTOMER สำเร็จ(ดำ) · LOST เสีย(แดง)
const LIFECYCLE_LABEL: Record<string, string> = {
  LEAD: "ผู้สนใจ",
  PROSPECT: "มีโอกาส",
  CUSTOMER: "ลูกค้าแล้ว",
  LOST: "ไม่ไปต่อ",
};
const lifecycleTone = (v: string): "muted" | "strong" | "danger" =>
  v === "CUSTOMER" ? "strong" : v === "LOST" ? "danger" : "muted";

const fmtDue = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

// ───────────── CrmContent (ฝังในหน้า /app/sys/[id]) ─────────────
export async function CrmContent({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [board, contacts, pending, forecastSatang] = await Promise.all([
    getBoard(ctx),
    listContacts(ctx),
    listPendingActivities(ctx),
    forecast(ctx),
  ]);

  const stages = board.pipeline.stages; // เรียง sortOrder แล้วจาก service
  const lastIdx = stages.length - 1;
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;

  return (
    <div className="flex flex-col gap-6">
      {/* ยอดคาดการณ์ถ่วงน้ำหนัก */}
      <Section title="ยอดคาดการณ์ (ถ่วงน้ำหนักตามโอกาสปิด)" card>
        <div className="text-2xl font-semibold">
          <MoneyText satang={forecastSatang} />
        </div>
        <p className={`text-xs ${muted}`}>
          รวมเฉพาะดีลที่ยังเปิดอยู่ คูณเปอร์เซ็นต์โอกาสปิดของแต่ละขั้น
        </p>
      </Section>

      {/* กระดานดีล (ไปป์ไลน์) */}
      <Section title={board.pipeline.name}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage, stageIdx) => {
            const dealsHere = board.deals.filter((d) => d.stageId === stage.id);
            const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;
            const nextStage = stageIdx < lastIdx ? stages[stageIdx + 1] : null;
            return (
              <div key={stage.id} className="flex w-72 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {stage.name} <span className={muted}>({dealsHere.length})</span>
                  </div>
                  <span className={`text-xs ${muted}`}>{stage.probability}%</span>
                </div>

                <div className="flex flex-col gap-2">
                  {dealsHere.map((deal) => (
                    <div key={deal.id} className="card flex flex-col gap-2 p-3">
                      <div className="text-sm font-medium">{deal.title}</div>
                      <div className={`flex items-center justify-between text-xs ${muted}`}>
                        <span className="truncate">{deal.contact?.name ?? "ไม่ระบุผู้ติดต่อ"}</span>
                        <MoneyText satang={deal.valueSatang} />
                      </div>
                      <div className="flex items-center gap-1">
                        <form action={moveDealAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="stageId" value={prevStage?.id ?? ""} />
                          <button
                            disabled={!prevStage}
                            className="btn-sm px-3 text-xs disabled:opacity-30"
                            title="ย้ายไปขั้นก่อนหน้า"
                            aria-label="ย้ายไปขั้นก่อนหน้า"
                          >
                            ◀
                          </button>
                        </form>
                        <form action={moveDealAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="stageId" value={nextStage?.id ?? ""} />
                          <button
                            disabled={!nextStage}
                            className="btn-sm px-3 text-xs disabled:opacity-30"
                            title="ย้ายไปขั้นถัดไป"
                            aria-label="ย้ายไปขั้นถัดไป"
                          >
                            ▶
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                  {dealsHere.length === 0 && (
                    <p className={`rounded-lg border border-dashed px-3 py-4 text-center text-xs ${muted}`}>
                      ยังไม่มีดีลในขั้นนี้
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* สร้างดีลใหม่ (ลงขั้นแรก) */}
        {contacts.length > 0 ? (
          <form action={createDealAction} className="mt-1 flex flex-wrap items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="pipelineId" value={board.pipeline.id} />
            <input type="hidden" name="stageId" value={stages[0]?.id ?? ""} />
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ผู้ติดต่อ
              <select name="contactId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกผู้ติดต่อ
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
              ชื่อดีล
              <input name="title" required placeholder="เช่น ขายแพ็กเกจ" className="input min-w-0" />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              มูลค่า (บาท)
              <input name="value" type="number" min={0} step="0.01" placeholder="0" className="input" />
            </label>
            <button className="btn btn-primary text-sm">+ สร้างดีล</button>
          </form>
        ) : (
          <p className={`text-xs ${muted}`}>เพิ่มผู้ติดต่อก่อน แล้วจึงสร้างดีลได้</p>
        )}
      </Section>

      {/* งานค้าง (follow-up) */}
      <Section title={`งานติดตามค้างอยู่ (${pending.length})`}>
        <DataList
          items={pending.map((a) => ({
            key: a.id,
            primary: a.title,
            secondary: [
              a.contact?.name ?? (a.dealId ? contactName(a.contactId ?? "") : null),
              a.deal?.title,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
            trailing: (
              <>
                {a.dueAt && <span className={`text-xs ${muted}`}>ครบกำหนด {fmtDue(a.dueAt)}</span>}
                <form action={completeActivityAction}>
                  <input type="hidden" name="systemId" value={systemId} />
                  <input type="hidden" name="activityId" value={a.id} />
                  <button className="btn-sm px-3 text-xs">ปิดงาน</button>
                </form>
              </>
            ),
          }))}
          empty="ไม่มีงานติดตามค้าง — เพิ่มงานจากดีลหรือผู้ติดต่อเพื่อไม่ให้ลืมตาม"
        />
      </Section>

      {/* รายชื่อผู้ติดต่อ */}
      <Section title={`ผู้ติดต่อ (${contacts.length})`}>
        <DataList
          items={contacts.map((c) => ({
            key: c.id,
            primary: c.name,
            secondary: [c.phone, c.source].filter(Boolean).join(" · ") || undefined,
            trailing: (
              <StatusChip value={c.lifecycleStage} map={LIFECYCLE_LABEL} tone={lifecycleTone(c.lifecycleStage)} />
            ),
          }))}
          empty="ยังไม่มีผู้ติดต่อ — เพิ่มผู้สนใจรายแรกเพื่อเริ่มติดตามการขาย"
        />
        <form action={createContactAction} className="mt-1 flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
            ชื่อผู้ติดต่อ
            <input name="name" required placeholder="เช่น คุณสมชาย" className="input min-w-0" />
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            เบอร์โทร
            <input name="phone" inputMode="tel" placeholder="080-000-0000" className="input" />
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            ที่มา
            <input name="source" placeholder="เช่น LINE" className="input" />
          </label>
          <button className="btn btn-ghost text-sm">+ เพิ่มผู้ติดต่อ</button>
        </form>
      </Section>
    </div>
  );
}

export default CrmContent;
