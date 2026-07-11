import Link from "next/link";
import type { SystemType } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { listSystems } from "@/lib/modules/system/service";
import { listRewards } from "@/lib/modules/reward/service";
import { AddUnitForm } from "@/components/add-unit-form";
import {
  createSystemAction,
  linkUnitAction,
  addRewardAction,
  removeRewardAction,
} from "@/lib/actions/systems";

const TYPES: { type: SystemType; label: string; hint: string }[] = [
  { type: "MEMBER", label: "สมาชิก", hint: "ฐานลูกค้า/สมาชิก" },
  { type: "POINT", label: "แต้ม", hint: "สะสมแต้ม" },
  { type: "POS", label: "ขายหน้าร้าน", hint: "บิล/ยอดขาย" },
  { type: "REWARD", label: "รางวัล", hint: "แลกของด้วยแต้ม" },
];

export default async function SystemsPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [systems, units] = await Promise.all([
    listSystems(tenantId),
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";

  // reward items ต่อ reward-system
  const rewardSystems = systems.filter((s) => s.type === "REWARD");
  const rewardsBySystem = new Map<string, Awaited<ReturnType<typeof listRewards>>>();
  for (const rs of rewardSystems) {
    rewardsBySystem.set(rs.id, await listRewards(tenantId, rs.id));
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <Link href="/app" className="text-sm text-[color:var(--color-muted)]">
          ← ทุกกิจการ
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">เพิ่มระบบ</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          สร้างกิจการหรือระบบ แล้วผูกเข้าด้วยกัน — หลายกิจการที่ผูกระบบเดียวกันจะแชร์ข้อมูลกัน (เช่น สมาชิกร่วม)
        </p>
      </div>

      {/* กิจการ (ธุรกิจ) */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">กิจการ</h2>
          <span className="text-xs text-[color:var(--color-muted)]">
            สร้างกิจการใหม่ — จะได้ระบบสมาชิก/แต้ม/POS/รางวัลของตัวเองอัตโนมัติ
          </span>
        </div>
        <AddUnitForm />
      </section>

      <div className="border-t" />

      {TYPES.map(({ type, label, hint }) => {
        const list = systems.filter((s) => s.type === type);
        return (
          <section key={type} className="flex flex-col gap-3">
            <div>
              <h2 className="font-medium">ระบบ{label}</h2>
              <span className="text-xs text-[color:var(--color-muted)]">{hint}</span>
            </div>

            {list.map((sys) => {
              const linkedUnitIds = sys.units.map((u) => u.unitId);
              const others = units.filter((u) => !linkedUnitIds.includes(u.id));
              const rewards = rewardsBySystem.get(sys.id) ?? [];
              return (
                <div key={sys.id} className="rounded-xl border p-3">
                  <div className="text-sm font-medium">{sys.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {sys.units.length === 0 ? (
                      <span className="text-xs text-[color:var(--color-muted)]">ยังไม่ได้ผูกกิจการ</span>
                    ) : (
                      sys.units.map((u) => (
                        <span key={u.id} className="rounded-full border px-2 py-0.5 text-xs">
                          {unitName(u.unitId)}
                        </span>
                      ))
                    )}
                  </div>

                  {/* ผูกกิจการเข้าระบบนี้ (ย้ายจากระบบเดิมของประเภทเดียวกัน) */}
                  {others.length > 0 && (
                    <form action={linkUnitAction} className="mt-2 flex gap-2">
                      <input type="hidden" name="systemId" value={sys.id} />
                      <select name="unitId" className="flex-1 rounded-lg border px-2 py-1.5 text-sm">
                        {others.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-lg border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]">
                        + ผูกกิจการ
                      </button>
                    </form>
                  )}

                  {/* รางวัลในระบบนี้ */}
                  {type === "REWARD" && (
                    <div className="mt-3 border-t pt-3">
                      <div className="mb-1 text-xs text-[color:var(--color-muted)]">รายการรางวัล</div>
                      {rewards.filter((r) => r.active).map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-1 text-sm">
                          <span>
                            {r.name} · {r.pointsCost} แต้ม
                            {r.stock !== null && ` · เหลือ ${r.stock}`}
                          </span>
                          <form action={removeRewardAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                          </form>
                        </div>
                      ))}
                      <form action={addRewardAction} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input type="hidden" name="systemId" value={sys.id} />
                        <input name="name" required placeholder="ชื่อรางวัล" className="col-span-2 rounded-lg border px-2 py-1.5 text-sm sm:col-span-2" />
                        <input name="pointsCost" type="number" min={1} required placeholder="แต้ม" className="rounded-lg border px-2 py-1.5 text-sm" />
                        <button className="rounded-lg border px-2 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]">+ เพิ่ม</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}

            {/* สร้างระบบใหม่ของประเภทนี้ */}
            <form action={createSystemAction} className="flex gap-2">
              <input type="hidden" name="type" value={type} />
              <input name="name" required placeholder={`สร้างระบบ${label}ใหม่ เช่น ${label}สปา`} className="flex-1 rounded-lg border px-3 py-2 text-sm" />
              <button className="btn btn-ghost text-sm">+ สร้าง</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
