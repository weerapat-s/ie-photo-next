"use client";
// lib/approve.ts — สิ่งที่ต้องเขียนลง booking ตอนกรรมการกด "อนุมัติ" จากปุ่ม
//
// ใช้ร่วมกันสองที่ (การ์ดรออนุมัติในหน้าภาพรวม + หน้ารายการจอง) ให้อนุมัติแบบเดียวกันเสมอ
//
// อนุมัติจากปุ่ม = จบ ไม่ต้องสแกนซ้ำ — บันทึกว่าส่งมอบแล้วไปในตัว
// เดิมอนุมัติแล้วยังค้างสถานะ "ยังไม่มารับ" จนกว่าจะมีคนสแกนที่เคาน์เตอร์
// ทำให้ดูเหมือนต้องสแกนทุกครั้งถึงจะใช้งานได้ สถานีสแกนยังใช้ได้เหมือนเดิม
// สำหรับคนที่มารับหน้าเคาน์เตอร์และอยากถ่ายรูปตอนส่งมอบเก็บไว้
import { serverTimestamp, type Timestamp } from "firebase/firestore";
import type { BookingDoc, UserDoc } from "@/lib/types";

export function approverName(
  profile: Pick<UserDoc, "firstName" | "lastName" | "nickname"> | null | undefined,
  email: string | null | undefined
): string {
  return (
    `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() ||
    profile?.nickname ||
    email ||
    "แอดมิน"
  );
}

/**
 * ฟิลด์ที่ต้องอัปเดตตอนอนุมัติ — อุปกรณ์ได้ฟิลด์การส่งมอบเพิ่ม ส่วนสตูดิโอ/งานตากล้องแค่เปลี่ยนสถานะ
 *
 * pickedUpAt: ยืมล่วงหน้า (ยังไม่ถึงเวลาเริ่ม) ใช้เวลาเริ่มยืม ไม่ใช่เวลาที่กดอนุมัติ
 *   ไม่งั้นหน้าทะเบียนการยืมจะนับวันที่ถือของเกินจริงตั้งแต่วันกดอนุมัติ
 */
export function approvePatch(
  b: Pick<BookingDoc, "bookingType" | "startAt">,
  approver: { uid: string | null | undefined; name: string }
): Record<string, unknown> {
  if (b.bookingType !== "equipment") return { status: "approved" };
  const future = b.startAt.toMillis() > Date.now();
  return {
    status: "approved",
    pickedUpAt: future ? (b.startAt as Timestamp) : serverTimestamp(),
    approvedById: approver.uid ?? null,
    approvedByName: approver.name,
    approvedAt: serverTimestamp(),
  };
}

/** คำขอที่ส่งก่อนมีช่องรับทราบเงื่อนไขชดใช้ในหน้ายืม — ต้องถามกรรมการก่อนอนุมัติ */
export function missingLiability(b: Pick<BookingDoc, "bookingType" | "liabilityAcceptedAt">): boolean {
  return b.bookingType === "equipment" && !b.liabilityAcceptedAt;
}
