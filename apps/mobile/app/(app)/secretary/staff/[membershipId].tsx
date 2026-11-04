// สิทธิ์ต่อคน (แบบ G3) — โครงของใบ S2.1 · ใบ S2.22 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryStaffMemberScreen() {
  return <SecSkeleton testID="sec-secretary-staff-member" zone="team" title="sec.title.staffMember" wo="S2.22" page="G3" />;
}
