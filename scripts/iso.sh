#!/usr/bin/env bash
# รันคำสั่งหนัก (tsx oracle · tsc · build) ใน systemd unit แยก — พ้น cgroup claude-remote.service (MemoryMax 5G)
# ที่ฆ่าทั้ง session เมื่อหน่วยความจำเกิน (ดู ledger/AUDIT-2026-09-16-MEMBER.md §5)
# ใช้: bash scripts/iso.sh <คำสั่ง…>   เช่น  bash scripts/iso.sh pnpm exec tsx scripts/qc-member-m2.3.mts
# ผลลัพธ์ออก stdout ตามปกติ · exit code = ของคำสั่ง · QC_ENV_FILE ปริยาย .env.qc
set -euo pipefail
cd "$(dirname "$0")/.."
U="iso-$$-$(date +%s)"
exec systemd-run --quiet --unit="$U" --collect --wait --pipe \
  --working-directory="$PWD" \
  --setenv=PATH="$PATH" --setenv=HOME=/root \
  --setenv=QC_ENV_FILE="${QC_ENV_FILE:-.env.qc}" \
  --setenv=NODE_OPTIONS="${NODE_OPTIONS:-}" \
  -p MemoryMax="${ISO_MEM:-5G}" \
  "$@"
