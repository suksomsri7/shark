// งานประจำ (แบบ A7) — โครงของใบ S2.1 · ใบ S2.5 วาดจอจริงแทน SecSkeleton
import { SecSkeleton } from "@/src/components/secretary/SecSkeleton";

export default function SecretaryScheduledScreen() {
  return <SecSkeleton testID="sec-secretary-scheduled" zone="secretary" title="sec.title.scheduled" wo="S2.5" page="A7" />;
}
