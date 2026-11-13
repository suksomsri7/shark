#!/usr/bin/env bash
# ตัวล็อกคิวงานหนัก (build/qc:all) — เดิมเครื่อง 2 คอร์/3GB: 2 session รันด่านพร้อมกัน = OOM/ช้าคูณสอง · 13 พ.ย. KVM8: typecheck ได้ 2 ช่อง (ดูด้านล่าง)
# หลาย session (git worktree) รันได้พร้อมกันหมด ยกเว้นตรงนี้ที่จะ "ต่อคิวให้เอง" (รอสูงสุด 30 นาที)
# บน CI/Vercel ไม่มีปัญหาเครื่องร่วม → ถ้าไม่มี flock ก็วิ่งตรง
set -euo pipefail
# 🔴 heap เริ่มต้นของ Node (2G) ไม่พอสำหรับ tsc/next build บนเครื่องนี้ → เคย OOM ทั้งเครื่อง (4 ก.ย.)
#    ยกให้ 3584MB เสมอ ยกเว้นผู้เรียกตั้ง NODE_OPTIONS มาเอง (จะไม่ถูกทับ)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3584}"
if command -v flock >/dev/null 2>&1 && [ -z "${CI:-}${VERCEL:-}" ]; then
  # CRM RUN (19 Sep): QC branch #2 has its own DB-suite lock (GATE_LOCK_FILE, set by scripts/qc2.sh) — but memory-heavy
  #   work (typecheck / next build / serve) queues on the machine-wide heavy slots below
  LOCK="${GATE_LOCK_FILE:-/tmp/shark-gate.lock}"
  # KVM8 (13 Nov, 8 cores · 31 GB): typecheck runs in one of TWO slots (measured ~9 GB / ~7 min each); build/serve
  #   (measured up to 14 GB) stays exclusive. Slot N = /tmp/shark-heavy-N.lock + one QC suite lock (slot 1 → qc2,
  #   slot 2 → qc3), so (a) at most the QC1 lane runs suites beside two typechecks, and (b) a worktree still on the
  #   old one-slot script (holds shark-gate + qc2 + qc3) stays mutually exclusive with both slots — safe to roll out
  #   one worktree at a time. Lock order everywhere: heavy-1 → heavy-2 → shark-gate → qc2 → qc3 (no cycles).
  case " $* " in
    *"next build"*|*" build "*|*acc-v2-serve*)
      # exclusive: both slots + every QC suite lock (19 Sep: global OOM killed next build twice while QC2 suites ran
      #   beside it). SHARK_GATE_LOCK_MARKER: see scripts/crm-journeys/lib.mts assertGateLockHeld() (C4.4, 28 Sep).
      exec env SHARK_GATE_LOCK_MARKER=1 flock -w 3600 /tmp/shark-heavy-1.lock flock -w 3600 /tmp/shark-heavy-2.lock flock -w 3600 /tmp/shark-gate.lock flock -w 3600 /tmp/shark-gate-qc2.lock flock -w 3600 /tmp/shark-gate-qc3.lock "$@" ;;
    *" typecheck "*|*" tsc "*)
      deadline=$((SECONDS + 3600))
      while :; do
        for slot in 1 2; do
          exec {slotfd}>"/tmp/shark-heavy-$slot.lock"
          if flock -n "$slotfd"; then
            # slotfd stays open across exec → the slot is held until the wrapped command exits
            exec env SHARK_GATE_LOCK_MARKER=1 SHARK_HEAVY_SLOT="$slot" flock -w 3600 "/tmp/shark-gate-qc$((slot + 1)).lock" "$@"
          fi
          exec {slotfd}>&-
        done
        [ "$SECONDS" -lt "$deadline" ] || { echo "with-gate-lock: no typecheck slot free after 60 min" >&2; exit 1; }
        sleep 5
      done ;;
  esac
  exec env SHARK_GATE_LOCK_MARKER=1 flock -w 1800 "$LOCK" "$@"
fi
exec "$@"
