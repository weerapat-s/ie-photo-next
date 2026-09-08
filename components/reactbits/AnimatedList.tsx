"use client";
// components/reactbits/AnimatedList.tsx — รายการที่ค่อย ๆ โผล่ตอนเลื่อนถึง (ดัดแปลงจาก React Bits)
// ต่างจากต้นฉบับ: รับ ReactNode ได้ (ไม่จำกัดแค่ string), เผยครั้งเดียวไม่วูบตอนเลื่อนกลับ,
// และไม่บังคับความสูง/ความกว้างคงที่ — ให้หน้าเพจคุมเลย์เอาต์เอง
import { useRef, useState, useCallback } from "react";
import { motion, useInView } from "motion/react";
import "./AnimatedList.css";

function AnimatedItem({
  children,
  delay = 0,
  index,
  onMouseEnter,
  onClick,
}: {
  children: React.ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: () => void;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2, once: true });
  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: 0.38, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedListProps {
  items: React.ReactNode[];
  onItemSelect?: (index: number) => void;
  showGradients?: boolean;
  className?: string;
  itemClassName?: string;
  /** true = ใส่กรอบเลื่อนในตัว (ใช้กับรายการยาวในการ์ด) */
  scrollable?: boolean;
  maxHeight?: string;
  displayScrollbar?: boolean;
  gap?: string;
  staggerStep?: number;
}

export default function AnimatedList({
  items,
  onItemSelect,
  showGradients = false,
  className = "",
  itemClassName = "",
  scrollable = false,
  maxHeight = "420px",
  displayScrollbar = false,
  gap = "0.75rem",
  staggerStep = 0.04,
}: AnimatedListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  const body = (
    <div className="al-stack" style={{ gap }}>
      {items.map((item, index) => (
        <AnimatedItem
          key={index}
          index={index}
          delay={index * staggerStep}
          onClick={onItemSelect ? () => onItemSelect(index) : undefined}
        >
          <div className={itemClassName}>{item}</div>
        </AnimatedItem>
      ))}
    </div>
  );

  if (!scrollable) return <div className={`al-root ${className}`}>{body}</div>;

  return (
    <div className={`al-root al-root--scroll ${className}`}>
      <div
        ref={listRef}
        className={`al-scroll ${displayScrollbar ? "" : "no-scrollbar"}`}
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        {body}
      </div>
      {showGradients && (
        <>
          <div className="al-gradient al-gradient--top" style={{ opacity: topGradientOpacity }} />
          <div className="al-gradient al-gradient--bottom" style={{ opacity: bottomGradientOpacity }} />
        </>
      )}
    </div>
  );
}
