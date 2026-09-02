#!/usr/bin/env bash
# ตัวล็อกคิวงานหนัก (build/qc:all) — เครื่องนี้ 2 คอร์/3GB: 2 session รันด่านพร้อมกัน = OOM/ช้าคูณสอง
# หลาย session (git worktree) รันได้พร้อมกันหมด ยกเว้นตรงนี้ที่จะ "ต่อคิวให้เอง" (รอสูงสุด 30 นาที)
# บน CI/Vercel ไม่มีปัญหาเครื่องร่วม → ถ้าไม่มี flock ก็วิ่งตรง
set -euo pipefail
if command -v flock >/dev/null 2>&1 && [ -z "${CI:-}${VERCEL:-}" ]; then
  exec flock -w 1800 /tmp/shark-gate.lock "$@"
fi
exec "$@"
