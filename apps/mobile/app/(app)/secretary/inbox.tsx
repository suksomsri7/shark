// รออนุมัติรวมทุกกิจการ (แบบ A6) — โครงของใบ S2.1 · ใบ S2.5 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryInboxScreen() {
  return <SecSkeleton testID="sec-secretary-inbox" zone="secretary" title="sec.title.inbox" wo="S2.5" page="A6" />;
}
