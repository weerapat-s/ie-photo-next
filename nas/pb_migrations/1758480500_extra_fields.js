/// <reference path="../pb_data/types.d.ts" />
// ช่องที่แอปเขียนอยู่แล้วแต่ตกหล่นจาก schema รอบแรก — เจอตอนย้ายข้อมูลจริง (report.json ของ export)
// ฐานที่สร้างใหม่ได้ช่องพวกนี้จาก 1758480100 อยู่แล้ว ตัวนี้เติมให้ฐานที่รันไปก่อน (ข้ามถ้ามีแล้ว)
migrate(
  (app) => {
    const add = (collection, field) => {
      const col = app.findCollectionByNameOrId(collection);
      if (col.fields.getByName(field.name)) return;
      col.fields.add(new Field(field));
      app.save(col);
    };
    add("banned", { name: "deletedAccount", type: "bool" });
    add("equipments", { name: "createdAt", type: "date" });
    add("bookings", { name: "returnedAt", type: "date" });
    add("secrets", { name: "updatedAt", type: "date" });
  },
  () => {}
);
