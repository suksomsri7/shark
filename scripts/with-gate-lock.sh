#!/usr/bin/env bash
# ตัวล็อกคิวงานหนัก (build/qc:all) — เครื่องนี้ 2 คอร์/3GB: 2 session รันด่านพร้อมกัน = OOM/ช้าคูณสอง
# หลาย session (git worktree) รันได้พร้อมกันหมด ยกเว้นตรงนี้ที่จะ "ต่อคิวให้เอง" (รอสูงสุด 30 นาที)
# บน CI/Vercel ไม่มีปัญหาเครื่องร่วม → ถ้าไม่มี flock ก็วิ่งตรง
set -euo pipefail
# 🔴 heap เริ่มต้นของ Node (2G) ไม่พอสำหรับ tsc/next build บนเครื่องนี้ → เคย OOM ทั้งเครื่อง (4 ก.ย.)
#    ยกให้ 3584MB เสมอ ยกเว้นผู้เรียกตั้ง NODE_OPTIONS มาเอง (จะไม่ถูกทับ)
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3584}"
if command -v flock >/dev/null 2>&1 && [ -z "${CI:-}${VERCEL:-}" ]; then
  # CRM RUN (19 Sep): QC branch #2 has its own DB-suite lock (GATE_LOCK_FILE, set by scripts/qc2.sh) — but memory-heavy
  #   work (typecheck / next build / serve) always queues on the ONE machine lock: 2 cores · 7 GB cannot hold two at once
  LOCK="${GATE_LOCK_FILE:-/tmp/shark-gate.lock}"
  case " $* " in
    *" typecheck "*|*"next build"*|*" build "*|*acc-v2-serve*|*" tsc "*)
      # heavy: hold BOTH locks so neither QC lane runs suites during it (19 Sep: global OOM killed next build twice
      #   while QC2 suites ran beside it on a 7 GB box)
      exec flock -w 3600 /tmp/shark-gate.lock flock -w 3600 /tmp/shark-gate-qc2.lock "$@" ;;
  esac
  exec flock -w 1800 "$LOCK" "$@"
fi
exec "$@"
