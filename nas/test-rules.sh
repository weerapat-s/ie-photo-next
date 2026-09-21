#!/usr/bin/env bash
# nas/test-rules.sh — ทดสอบกติกาความปลอดภัยกับ PocketBase ตัวชั่วคราวบน NAS
#
# รัน: bash nas/test-rules.sh
#
# สร้าง container แยก (iephoto-pb-test, พอร์ต 8190 เฉพาะ Tailscale) ด้วย migrations + hooks
# ชุดเดียวกับ production แต่ฐานข้อมูลว่างของตัวเอง สร้าง superuser ใช้แล้วทิ้ง (รหัสสุ่ม
# ไม่เคยแสดงที่ไหน) รัน scripts/test-pb-rules.mjs แล้วลบ container + ข้อมูลทิ้งทั้งหมด
# ไม่แตะ iephoto-pb ตัวจริงเลย
set -euo pipefail

NAS="nas@100.116.118.109"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PORT=8190
SU_EMAIL="rules-test@test.invalid"
SU_PASS="$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"

cleanup() {
  ssh "$NAS" "sudo -n docker rm -f iephoto-pb-test >/dev/null 2>&1; sudo -n rm -rf /tmp/iephoto-pb-test" || true
}
trap cleanup EXIT

tar -C "$HERE" -czf - pb_migrations pb_hooks | ssh "$NAS" "set -e
  sudo -n rm -rf /tmp/iephoto-pb-test && mkdir -p /tmp/iephoto-pb-test/data
  tar -C /tmp/iephoto-pb-test -xzf -
  sudo -n docker rm -f iephoto-pb-test >/dev/null 2>&1 || true
  sudo -n docker run -d --name iephoto-pb-test -p 100.116.118.109:$PORT:8090 \
    -v /tmp/iephoto-pb-test/data:/pb/pb_data \
    -v /tmp/iephoto-pb-test/pb_migrations:/pb/pb_migrations:ro \
    -v /tmp/iephoto-pb-test/pb_hooks:/pb/pb_hooks:ro \
    iephoto-pb:0.40.4 >/dev/null
  for i in \$(seq 1 20); do curl -sf http://100.116.118.109:$PORT/api/health >/dev/null && break; sleep 1; done
  sudo -n docker exec iephoto-pb-test /pb/pocketbase superuser upsert '$SU_EMAIL' '$SU_PASS' --dir=/pb/pb_data >/dev/null
"

cd "$ROOT"
PB_URL="http://100.116.118.109:$PORT" PB_SU_EMAIL="$SU_EMAIL" PB_SU_PASS="$SU_PASS" \
  node scripts/test-pb-rules.mjs
