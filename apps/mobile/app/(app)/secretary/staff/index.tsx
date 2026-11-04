// ทุกคนในกิจการ (แบบ D1) — โครงของใบ S2.1 · ใบ S2.10 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryStaffScreen() {
  return <SecSkeleton testID="sec-secretary-staff" zone="team" title="sec.title.staff" wo="S2.10" page="D1" />;
}
