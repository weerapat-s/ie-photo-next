/// <reference path="../pb_data/types.d.ts" />
// คำสั่ง `pocketbase ie-import <โฟลเดอร์>` — นำข้อมูลที่ export จาก Firestore เข้า (ดู ie_import.js, nas/import.sh)
$app.rootCmd.addCommand(new Command({
  use: "ie-import",
  run: (cmd, args) => {
    require(`${__hooks}/ie_import.js`).run($app, args[0] || "/pb/import");
  },
}));
