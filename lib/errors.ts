// lib/errors.ts — แปลข้อผิดพลาดตอนเขียนข้อมูลให้เป็นภาษาที่ทำอะไรต่อได้
//
// เดิมทุกหน้าจับ error แล้วขึ้น "บันทึกไม่สำเร็จ กรุณาลองใหม่" เหมือนกันหมด
// ผู้ใช้จึงบอกได้แค่ว่า "บันทึกไม่ได้" ส่วนคนแก้ก็ไล่ต้นตอไม่ถูกว่าเป็นเพราะ
// สิทธิ์ กติกา เน็ต หรือข้อมูลผิดรูป — เสียเวลาเดาทุกรอบ
//
// ตัวนี้แยกสาเหตุที่เจอจริงในระบบนี้ออกมาให้ชัด แล้วบอกทางแก้ในประโยคเดียว

/** ข้อความบอกสาเหตุ + ทางแก้ สำหรับ error ที่เกิดตอนเขียน Firestore */
export function describeWriteError(e: unknown, action: string): string {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);

  if (code === "permission-denied")
    return `${action}ไม่สำเร็จ — กติกาความปลอดภัยไม่อนุญาต อาจเพราะสิทธิ์ไม่พอ หรือแก้ฟิลด์ที่ระบบล็อกไว้`;

  // Firestore ปฏิเสธ undefined ตั้งแต่ฝั่ง client — มักเกิดจากช่องที่ยังไม่ได้เลือก
  if (msg.includes("Unsupported field value"))
    return `${action}ไม่สำเร็จ — มีช่องที่ค่ายังว่างผิดปกติ ลองกรอกให้ครบแล้วบันทึกใหม่`;

  if (code === "unavailable" || code === "failed-precondition")
    return `${action}ไม่สำเร็จ — เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่`;

  if (code === "not-found") return `${action}ไม่สำเร็จ — ไม่พบรายการนี้แล้ว อาจถูกลบไปก่อนหน้า`;

  if (code === "resource-exhausted")
    return `${action}ไม่สำเร็จ — โควตาฐานข้อมูลของวันนี้เต็ม ลองใหม่พรุ่งนี้`;

  // ขนาดเอกสารเกิน 1 MiB — เกือบทุกครั้งคือรูปที่ยังใหญ่เกินไป
  if (msg.includes("longer than") || msg.includes("exceeds the maximum"))
    return `${action}ไม่สำเร็จ — ข้อมูลใหญ่เกินไป ถ้าแนบรูปให้ลองรูปที่เล็กลง`;

  return `${action}ไม่สำเร็จ: ${msg.slice(0, 160)}`;
}
