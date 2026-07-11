import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { MeetingContent } from "@/lib/modules/meeting/ui";

// หน้าเต็มจอของ Meeting — สลับห้อง (?c=) + เปิดเธรด (?t=)
export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; t?: string }>;
}) {
  const { id } = await params;
  const { c, t } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "MEETING") notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <Link href={`/app/sys/${id}`} className="text-sm text-[color:var(--color-muted)]">
          ← {sys.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">🗓 {sys.name}</h1>
      </div>
      <MeetingContent systemId={id} tenantId={tenantId} channelId={c} threadParentId={t} />
    </div>
  );
}
