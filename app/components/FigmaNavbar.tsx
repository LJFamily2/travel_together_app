import React from "react";

export default function FigmaNavbar() {
  return (
    <nav className="flex flex-row justify-between items-center px-[100px] h-[70px] w-full bg-transparent">
      <div className="flex flex-row items-center gap-1">
        {/* LogoItem */}
        <div className="font-bold text-xl">Dora AI</div>
      </div>
      <div className="flex flex-row justify-end items-center gap-[30px]">
        {/* ItemGroup */}
        <a href="#" className="text-sm font-medium">
          Home
        </a>
        <a href="#" className="text-sm font-medium">
          Features
        </a>
        <a href="#" className="text-sm font-medium">
          Pricing
        </a>
        <button className="bg-black text-white px-4 py-2 rounded-full text-sm">
          Get Started
        </button>
      </div>
    </nav>
  );
}
