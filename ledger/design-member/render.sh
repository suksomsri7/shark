#!/bin/bash
# ./render.sh 02-member-360 "ชื่อหน้า" [WxH]   → build html + screenshot png
set -e
cd "$(dirname "$0")"
n="$1"; t="$2"; sz="${3:-1500,1000}"
./mk.sh "$n.body.html" "$t" >/dev/null
mkdir -m 700 -p /tmp/xdg-chromium
XDG_RUNTIME_DIR=/tmp/xdg-chromium /snap/bin/chromium --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --user-data-dir=/root/snap/chromium/common/pptr-shared --window-size="$sz" \
  --screenshot="$PWD/$n.png" "file://$PWD/$n.html" 2>/dev/null
echo "rendered $n.png ($sz)"
