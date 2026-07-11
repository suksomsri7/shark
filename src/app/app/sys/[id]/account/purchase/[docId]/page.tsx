import { ExpenseDetailPage } from "@/lib/modules/account/expense-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id, docId } = await params;
  const sp = await searchParams;
  return <ExpenseDetailPage systemId={id} docId={docId} slug="purchase" err={sp.err} />;
}
