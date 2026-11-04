// ตั้งชื่อเลขาครั้งแรก (แบบ C1) — โครงของใบ S2.1 · ใบ S2.11 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryOnboardingNameScreen() {
  return <SecSkeleton testID="sec-secretary-onboarding-name" zone="secretary" title="sec.title.onboardingName" wo="S2.11" page="C1" />;
}
