import { redirect } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { proposeBlueprint } from "@/lib/dna/apply";
import { planHash } from "@/lib/dna/schema";
import type { BlueprintStep } from "@/lib/dna/schema";
import { DnaApplyButton } from "@/components/dna-apply-button";

// พาดหัวภาษาคนต่อ step (พิมพ์เขียว → ภาษาที่เจ้าของร้านเข้าใจ)
function headline(step: BlueprintStep): string {
  switch (step.type) {
    case "CREATE_UNIT":
      return `เปิดหน้างาน “${step.name}”`;
    case "CREATE_SYSTEM":
      return `เปิดระบบ “${step.name}”`;
    case "LINK_UNIT":
      return "เชื่อมระบบเข้ากับหน้างาน";
    case "LINK_ACCOUNT_POS":
      return "ต่อยอดขายเข้าบัญชีอัตโนมัติ";
    case "ACCOUNT_SETTINGS":
      return "ตั้งค่าบัญชีของกิจการ";
  }
}

// /app/dna/blueprint — โชว์พิมพ์เขียวที่ compile จากข้อเท็จจริง + ปุ่มยืนยันประกอบ
export default async function BlueprintPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const profile = await prisma.dnaProfile.findUnique({ where: { tenantId } });
  if (!profile) redirect("/app/dna");

  const { blueprintId, plan } = await proposeBlueprint(tenantId);

  // ประกอบแผนนี้เสร็จไปแล้ว (เช่น เน็ตหลุดตอนรอ แล้วกลับมารีเฟรช) → ไม่ต้องกดซ้ำ พาเข้าแอปเลย
  const applied = await prisma.dnaBlueprint.findFirst({
    where: { tenantId, status: "APPLIED", planHash: planHash(plan) },
  });
  if (applied) redirect("/app");

  const steps = plan.steps;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="พิมพ์เขียวระบบของคุณ"
        back={{ href: "/app/dna", label: "แก้คำตอบ" }}
        desc="นี่คือระบบที่เราจะประกอบให้ตามข้อมูลกิจการของคุณ — ดูให้ครบแล้วกดยืนยัน"
      />

      {steps.length === 0 ? (
        <div className="card flex flex-col gap-3 py-8 text-center">
          <p className="text-sm text-[color:var(--color-muted)]">
            จากคำตอบของคุณ ยังไม่จำเป็นต้องเปิดระบบใดเพิ่ม — เริ่มใช้งานหน้าหลักได้เลย
          </p>
          <Link href="/app" className="btn btn-primary mx-auto text-sm">
            ไปหน้าหลัก
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <div key={i} className="card flex flex-col gap-1">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs text-[color:var(--color-muted)]">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-medium">{headline(step)}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      เพราะ {step.because}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-4">
            <DnaApplyButton blueprintId={blueprintId} />
          </div>
        </>
      )}
    </div>
  );
}
