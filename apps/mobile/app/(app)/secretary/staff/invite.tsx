// เชิญพนักงาน (แบบ G2) — โครงของใบ S2.1 · ใบ S2.21 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryStaffInviteScreen() {
  return <SecSkeleton testID="sec-secretary-staff-invite" zone="team" title="sec.title.staffInvite" wo="S2.21" page="G2" />;
}
