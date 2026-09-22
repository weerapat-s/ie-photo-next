#!/usr/bin/env bash
# nas/import.sh — ส่งข้อมูลที่ export จาก Firestore (.nas-import/) ขึ้น NAS แล้วนำเข้า PocketBase
#
# ลำดับการย้ายทั้งหมด:
#   1. node --env-file=.env.local --experimental-strip-types scripts/export-firestore.mjs
#   2. bash nas/import.sh                 (นำเข้า container iephoto-pb ตัวจริง)
#      bash nas/import.sh iephoto-pb-test (ลองกับตัวทดสอบก่อนก็ได้)
#
# ข้อมูลส่วนตัวสมาชิกอยู่บน NAS แค่ระหว่างนำเข้า — โฟลเดอร์ชั่วคราวอ่านได้แค่ root และลบทิ้งทันทีหลังจบ
# นำเข้าผ่านคำสั่ง `pocketbase ie-import` (nas/pb_hooks/ie_import.js) ไม่ผ่าน API
# จึงไม่ต้องมีบัญชี superuser — รันซ้ำได้ ของที่มีอยู่แล้วถูกอัปเดตทับ
set -euo pipefail

NAS="nas@100.116.118.109"
CT="${1:-iephoto-pb}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# IMPORT_DIR=... ใช้โฟลเดอร์อื่นได้ (เช่น เติมเฉพาะบางช่องทีหลัง — importer ใส่เฉพาะช่องที่มีในไฟล์)
SRC="${IMPORT_DIR:-$(cd "$HERE/.." && pwd)/.nas-import}"
# โฟลเดอร์ที่ share "ยืมของ" ของ Nextcloud ชี้อยู่ (รูปเอกสารการยืมรุ่นที่เก็บบน Nextcloud: borrow/...)
NC_ROOT="/var/www/html/data/68030271/files/ยืมของ"

[[ -f "$SRC/users.json" ]] || { echo "ยังไม่มี .nas-import/ — รัน scripts/export-firestore.mjs ก่อน"; exit 1; }

echo "=== ส่งข้อมูลขึ้น NAS ($(du -sh "$SRC" | cut -f1)) ==="
T="$(ssh "$NAS" 'sudo -n mktemp -d /tmp/iephoto-import.XXXXXX')"
tar -C "$SRC" -czf - . | ssh "$NAS" "sudo -n tar -C $T -xzf -"

echo "=== นำเข้า $CT ==="
ssh "$NAS" bash -s -- "$T" "$CT" "$NC_ROOT" <<'REMOTE'
set -euo pipefail
T="$1"; CT="$2"; NC_ROOT="$3"
trap 'sudo -n rm -rf "$T"; sudo -n docker exec "$CT" rm -rf /pb/import >/dev/null 2>&1 || true' EXIT

if [ -s "$T/nc-paths.txt" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    sudo -n mkdir -p "$T/nc/$(dirname "$p")"
    sudo -n docker cp "nextcloud:$NC_ROOT/$p" "$T/nc/$p" >/dev/null || echo "  ไม่พบบน Nextcloud: $p"
  done < "$T/nc-paths.txt"
fi

sudo -n docker exec "$CT" rm -rf /pb/import
sudo -n docker cp "$T" "$CT:/pb/import"
sudo -n docker exec "$CT" /pb/pocketbase ie-import /pb/import \
  --dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations
REMOTE
echo "=== เสร็จ (ลบข้อมูลชั่วคราวบน NAS แล้ว) ==="
