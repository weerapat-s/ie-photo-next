# nas/ — PocketBase ของ IE-Photo บน NAS

ภาพรวมการย้ายและเหตุผลอยู่ที่ [`../MIGRATION_NAS.md`](../MIGRATION_NAS.md)

## ที่อยู่

| อะไร | ที่ไหน |
|---|---|
| เครื่อง | `nas-Precision-Tower-5810` — SSH `nas@100.116.118.109` (ผ่าน Tailscale) |
| container | `iephoto-pb` (image `iephoto-pb:0.40.4` build จาก `Dockerfile` ในนี้) |
| ข้อมูลจริง | `/srv/iephoto-pb/pb_data` บน SSD — **สคริปต์ deploy ไม่แตะโฟลเดอร์นี้** |
| หน้าแอดมิน | `http://100.116.118.109:8096/_/` (ต้องอยู่ใน Tailscale) |
| พอร์ต | `127.0.0.1:8096` ให้ cloudflared · `100.116.118.109:8096` ให้ทีมผ่าน Tailscale |

**ห้าม bind `0.0.0.0`** — NAS มี IP สาธารณะของมหาลัย (161.246.74.171)
ทางเข้าสาธารณะมีทางเดียวคือ Cloudflare Tunnel

## deploy

```bash
bash nas/deploy.sh          # ส่ง migrations + hooks แล้วสร้าง container ใหม่
bash nas/deploy.sh --site   # + ส่งหน้าเว็บ (out/ จาก npm run build)
```

migration ใน `pb_migrations/` รันเองตอน container เริ่ม และรันแต่ละไฟล์ครั้งเดียว
(PocketBase จำไว้ในตาราง `_migrations`) — ห้ามแก้ไฟล์ที่ขึ้นไปแล้ว ให้เพิ่มไฟล์ใหม่แทน

## ต้องมีบน NAS

- SSH ด้วยกุญแจ (ไม่ใช้รหัส) ผ่าน Tailscale
- `sudo` ไม่ต้องใส่รหัส สำหรับ user `nas` — ตอนนี้เปิดอยู่ผ่าน `/etc/sudoers.d/99-nas-temp`
  (ตั้งไว้ชั่วคราวตั้งแต่งาน Immich) ปิดได้เมื่อย้ายเสร็จ: `sudo rm /etc/sudoers.d/99-nas-temp`

## สำรองข้อมูล

PocketBase สำรองเองทุกวัน 03:00 เก็บ 14 วัน ที่ `pb_data/backups` (ตั้งใน migration แรก)
แล้ว `/etc/cron.d/iephoto-pb-backup` คัดลอกต่อไป HDD `/mnt/Storage1_sdb1/backups/iephoto-pb/` ตอน 03:30
(ไม่ใช้ `--delete` ไฟล์เก่าบน HDD จึงไม่หายตาม)
