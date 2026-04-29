"use client";

import React from "react";
import { motion } from "framer-motion";

export const RollerUnstackReveal = ({
  children,
  index = 0,
  stackOffset = -40,
  zIndexBase = 40,
  scrollContainerRef,
}: {
  children: React.ReactNode;
  index: number;
  stackOffset?: number;
  zIndexBase?: number;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}) => {
  return (
    <motion.div
      initial={{
        opacity: 0,
        rotateX: -45,
        y: stackOffset,
        scale: 0.95,
        filter: "grayscale(100%) brightness(85%)",
      }}
      whileInView={{
        opacity: 1,
        rotateX: 0,
        y: 0,
        scale: 1,
        filter: "grayscale(0%) brightness(100%)",
      }}
      viewport={{
        root: scrollContainerRef,
        once: true,
        margin: "0px 0px 50px 0px",
      }}
      transition={{
        type: "spring",
        stiffness: 120,
        damping: 25,
        delay: Math.min(index, 15) * 0.05, // Cap stagger delay so deeply scrolled items appear quickly
      }}
      style={{
        transformPerspective: 1000,
        zIndex: zIndexBase - index,
      }}
      className="origin-top relative"
    >
      {children}
    </motion.div>
  );
};

export default RollerUnstackReveal;
