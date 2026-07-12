import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getBoard, listTypes, listCounters } from "@/lib/modules/queue/service";
import {
  issueTicketAction,
  callNextAction,
  recallAction,
  skipAction,
  serveAction,
  doneAction,
  cancelAction,
  recallSkippedAction,
  transferAction,
  openCounterAction,
  closeCounterAction,
} from "@/lib/modules/queue/actions";
import { AutoRefresh } from "@/components/queue-auto-refresh";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  WAITING: "กำลังรอ",
  CALLED: "เรียกแล้ว",
  SERVING: "กำลังให้บริการ",
};

export default async function QueueBoardPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "QUEUE") notFound();
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };

  const [board, types, counters] = await Promise.all([
    getBoard(ctx),
    listTypes(ctx),
    listCounters(ctx),
  ]);
  const activeTypes = types.filter((t) => t.status === "ACTIVE");
  const openCounters = board.counterCards.filter((c) => c.counter.status === "OPEN");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <AutoRefresh />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">บัตรคิว</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/u/${unitSlug}/queue/setup`} className="btn btn-ghost text-sm">
            ตั้งค่า
          </Link>
        </div>
      </div>

      {/* ตัวเลขวันนี้ */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "รอ", value: board.counts.waiting },
          { label: "กำลังเรียก", value: board.counts.serving },
          { label: "เสร็จ", value: board.counts.done },
          { label: "ข้าม", value: board.counts.skipped },
        ].map((k) => (
          <div key={k.label} className="card py-3">
            <div className="text-2xl font-semibold">{k.value}</div>
            <div className="text-xs text-[color:var(--color-muted)]">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ออกบัตร */}
      {activeTypes.length === 0 ? (
        <div className="card text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีประเภทคิว — กด &ldquo;ตั้งค่า&rdquo; เพื่อเพิ่มประเภทคิวและเคาน์เตอร์ก่อน
        </div>
      ) : (
        <section className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">ออกบัตรคิว</h2>
          <div className="flex flex-wrap gap-2">
            {activeTypes.map((t) => (
              <form key={t.id} action={issueTicketAction.bind(null, unitSlug)}>
                <input type="hidden" name="typeId" value={t.id} />
                <button className="btn btn-primary text-sm">
                  {t.name} ({t.prefix})
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {/* เคาน์เตอร์ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">เคาน์เตอร์</h2>
        {counters.length === 0 ? (
          <div className="card text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีเคาน์เตอร์ — เพิ่มในหน้าตั้งค่า
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {board.counterCards.map(({ counter, current }) => (
              <div key={counter.id} className="card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {counter.name}{" "}
                    <span className="text-xs text-[color:var(--color-muted)]">({counter.code})</span>
                  </div>
                  {counter.status === "OPEN" ? (
                    <form action={closeCounterAction.bind(null, unitSlug)}>
                      <input type="hidden" name="id" value={counter.id} />
                      <button className="rounded-full border px-2.5 py-0.5 text-xs">ปิดช่อง</button>
                    </form>
                  ) : (
                    <form action={openCounterAction.bind(null, unitSlug)}>
                      <input type="hidden" name="id" value={counter.id} />
                      <button className="rounded-full border px-2.5 py-0.5 text-xs">เปิดช่อง</button>
                    </form>
                  )}
                </div>

                {counter.status !== "OPEN" ? (
                  <div className="text-center text-sm text-[color:var(--color-muted)]">ช่องปิดอยู่</div>
                ) : current ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold tracking-wider">{current.number}</div>
                      <div className="text-xs text-[color:var(--color-muted)]">
                        {STATUS_LABEL[current.status]}
                        {current.contactName ? ` · ${current.contactName}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <OpBtn slug={unitSlug} action={recallAction} id={current.id} label="เรียกซ้ำ" />
                      {current.status === "CALLED" && (
                        <>
                          <OpBtn slug={unitSlug} action={serveAction} id={current.id} label="เริ่ม" />
                          <OpBtn slug={unitSlug} action={skipAction} id={current.id} label="ข้าม" />
                        </>
                      )}
                      <OpBtn slug={unitSlug} action={doneAction} id={current.id} label="จบ" primary />
                      {counters.filter((c) => c.id !== counter.id && c.status !== "ARCHIVED").length > 0 && (
                        <form
                          action={transferAction.bind(null, unitSlug)}
                          className="inline-flex items-center gap-1"
                        >
                          <input type="hidden" name="id" value={current.id} />
                          <select
                            name="toCounterId"
                            className="rounded-lg border px-1.5 py-1 text-xs"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              โอนไป…
                            </option>
                            {counters
                              .filter((c) => c.id !== counter.id && c.status !== "ARCHIVED")
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                          <button className="rounded-lg border px-2 py-1 text-xs">โอน</button>
                        </form>
                      )}
                    </div>
                  </div>
                ) : (
                  <form action={callNextAction.bind(null, unitSlug)}>
                    <input type="hidden" name="counterId" value={counter.id} />
                    <button className="btn btn-primary w-full text-sm">เรียกคิวถัดไป</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        {counters.length > 0 && openCounters.length === 0 && (
          <p className="text-xs text-[color:var(--color-muted)]">
            ยังไม่มีเคาน์เตอร์เปิด — กด &ldquo;เปิดช่อง&rdquo; เพื่อเริ่มเรียกคิว
          </p>
        )}
      </section>

      {/* คิวที่รอ */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">คิวที่รอ ({board.waiting.length})</h2>
        {board.waiting.length === 0 ? (
          <div className="card text-center text-sm text-[color:var(--color-muted)]">ไม่มีคิวรออยู่</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {board.waiting.map((t) => (
              <div key={t.id} className="rounded-lg border px-3 py-1.5 text-sm">
                <span className="font-medium">{t.number}</span>
                <span className="text-xs text-[color:var(--color-muted)]"> · {t.type.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* คิวที่ข้าม */}
      {board.skipped.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">คิวที่ข้าม ({board.skipped.length})</h2>
          <div className="flex flex-col gap-2">
            {board.skipped.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{t.number}</span>
                  <span className="text-xs text-[color:var(--color-muted)]"> · {t.type.name}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {openCounters.length > 0 && (
                    <form
                      action={recallSkippedAction.bind(null, unitSlug)}
                      className="inline-flex items-center gap-1"
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <select name="counterId" className="rounded-lg border px-1.5 py-1 text-xs" defaultValue={openCounters[0].counter.id}>
                        {openCounters.map((c) => (
                          <option key={c.counter.id} value={c.counter.id}>
                            {c.counter.name}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-lg border px-2 py-1 text-xs">เรียกคืน</button>
                    </form>
                  )}
                  <OpBtn slug={unitSlug} action={cancelAction} id={t.id} label="ยกเลิก" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OpBtn({
  slug,
  action,
  id,
  label,
  primary,
}: {
  slug: string;
  action: (unitSlug: string, formData: FormData) => Promise<void>;
  id: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={action.bind(null, slug)}>
      <input type="hidden" name="id" value={id} />
      <button
        className={
          primary
            ? "rounded-lg bg-[color:var(--color-ink)] px-2.5 py-1 text-xs text-[color:var(--color-surface)]"
            : "rounded-lg border px-2.5 py-1 text-xs hover:bg-[color:var(--color-surface-2)]"
        }
      >
        {label}
      </button>
    </form>
  );
}
