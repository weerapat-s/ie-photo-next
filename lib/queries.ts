"use client";
// lib/queries.ts — query ที่หลายหน้าใช้ร่วมกัน ต้องเขียนให้ "เหมือนกันเป๊ะ" ทุกที่
//
// ═══ ทำไมต้องมีไฟล์นี้ ═══════════════════════════════════════════
//
// Firestore SDK ใช้ listener ตัวเดียวร่วมกันถ้า query เหมือนกันทุกอย่าง
// (collection · เงื่อนไข · orderBy) — หลายคอมโพเนนต์บนหน้าเดียวกันจึงอ่านข้อมูลครั้งเดียว
// แต่ถ้าเขียนต่างกันแม้นิดเดียว เช่น collection(db,"bookings") กับ
// query(collection(db,"bookings"), orderBy("createdAt","desc")) จะถือเป็นคนละ query
// แล้วอ่านข้อมูลทั้งก้อนซ้ำ
//
// เคยเป็นแบบนั้นจริง: หน้าภาพรวมของแอดมินอ่าน bookings ทั้งหมด 3 รอบ (ตัวหน้า +
// ตัวกวาดแจ้งเตือน + ผู้ช่วย AI) และ users อีกหลายรอบ Firestore รุ่นนี้คิดโควตาอ่าน
// ตามขนาดเอกสาร และคำขอเก่ายังฝังรูปอยู่ — จนโควตารายวันหมดทั้งโปรเจกต์
//
// กฎ: อยากได้ "ทั้งหมด" ของ bookings / users ให้เรียกจากที่นี่เท่านั้น
import { collection, query, where, orderBy, type Query } from "@/lib/db/firestore";
import { db } from "@/lib/db/client";
import { useMemo } from "react";
import { useCollection } from "@/lib/hooks";
import type { DeliveryDoc, WithId } from "@/lib/types";

/** คำขอทั้งหมด ใหม่สุดก่อน — ต้องเป็นแอดมิน (สมาชิกอ่านได้แค่ของตัวเอง) */
export function allBookingsQuery(): Query {
  return query(collection(db, "bookings"), orderBy("createdAt", "desc"));
}

/** สมาชิกทั้งหมด เรียงตามรหัสนักศึกษา — ต้องเป็นแอดมิน */
export function allUsersQuery(): Query {
  return query(collection(db, "users"), orderBy("studentId"));
}

/**
 * งานส่งไฟล์ที่ "ฉัน" เกี่ยวข้อง — ในฐานะลูกค้า หรือทีมงานที่ได้รับมอบหมาย
 *
 * ขอทั้ง collection แบบไม่กรองไม่ได้: กติกาให้สมาชิกเห็นเฉพาะงานของตัวเอง
 * query ที่ไม่บังคับเงื่อนไขนั้นจะถูกปฏิเสธทั้งก้อน (เคยเป็นบั๊กจริง — หน้า "ของฉัน"
 * ขึ้นว่างเปล่าทั้งที่มีงาน) จึงแยกเป็น query ที่ตรงกับกติกาทีละแบบแล้วรวมกัน
 *
 * assigneeIds คือแบบใหม่ (หลายคนต่องาน) assignedToId เป็นของเก่าที่ยังมีในข้อมูลเดิม
 * ต้องดูทั้งคู่ ไม่งั้นทีมงานที่ถูกมอบหมายแบบใหม่มองไม่เห็นงานตัวเอง
 *
 * ข้อจำกัดที่รู้: งานที่ผูกกับคำขอ (bookingId) แล้วนับว่าเป็นของทีมงานผ่าน
 * assigneeIds ของคำขอ — กติกายอมแต่ query กรองแบบนั้นไม่ได้ ต้องมอบหมายลงงานส่งไฟล์ตรง ๆ
 */
export function useMyDeliveries(uid: string | null | undefined): {
  data: WithId<DeliveryDoc>[];
  loading: boolean;
} {
  const deliveries = () => collection(db, "deliveries");
  const asCustomer = useCollection<DeliveryDoc>(
    () => (uid ? query(deliveries(), where("customerUserId", "==", uid)) : null),
    [uid]
  );
  const asAssignee = useCollection<DeliveryDoc>(
    () => (uid ? query(deliveries(), where("assigneeIds", "array-contains", uid)) : null),
    [uid]
  );
  const asLegacy = useCollection<DeliveryDoc>(
    () => (uid ? query(deliveries(), where("assignedToId", "==", uid)) : null),
    [uid]
  );

  const data = useMemo(() => {
    const byId = new Map<string, WithId<DeliveryDoc>>();
    for (const d of [...asCustomer.data, ...asAssignee.data, ...asLegacy.data]) byId.set(d.id, d);
    return [...byId.values()];
  }, [asCustomer.data, asAssignee.data, asLegacy.data]);

  return { data, loading: asCustomer.loading || asAssignee.loading || asLegacy.loading };
}
