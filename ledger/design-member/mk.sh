#!/bin/bash
# ประกอบไฟล์ mockup ระบบสมาชิก: header + CSS ฐาน(จาก account-v2) + CSS ของ kanban (reuse) + CSS ของ member + body
set -e
cd "$(dirname "$0")"
b="$1"; t="$2"; out="${b%.body.html}.html"
{ printf '<!doctype html>\n<html lang="th"><head><meta charset="utf-8">\n<title>%s</title>\n' "$t"
  cat _base.part; cat _kb.part; [ -f _mb.part ] && cat _mb.part; cat "$b"; printf '\n</body></html>\n'; } > "$out"
echo "built $out"
