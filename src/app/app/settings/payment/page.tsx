import { requireTenant } from "@/lib/core/context";
import { getPaymentProfile } from "@/lib/payment/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentProfileForm } from "@/components/payment-profile-form";

// ตั้งค่าช่องรับเงินของร้าน (PromptPay) + พรีวิว QR สด
export default async function PaymentSettingsPage() {
  const auth = await requireTenant();
  const profile = await getPaymentProfile({ tenantId: auth.active.tenantId });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="ช่องรับเงิน (PromptPay)"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ตั้งเบอร์พร้อมเพย์หรือเลขบัตรของร้าน เพื่อสร้าง QR ให้ลูกค้าโอน"
      />
      <PaymentProfileForm
        defaultPromptpayId={profile?.promptpayId ?? ""}
        defaultDisplayName={profile?.displayName ?? ""}
      />
    </div>
  );
}
