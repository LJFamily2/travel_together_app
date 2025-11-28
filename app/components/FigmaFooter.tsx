import React from "react";

export default function FigmaFooter() {
  return (
    <footer className="flex flex-row justify-center gap-[100px] px-[100px] pt-[120px] pb-20 w-full bg-(--color-footer)">
      <div className="flex flex-col gap-10">
        {/* LogoColumn */}
        <div className="font-bold text-xl">Dora AI</div>
        <p className="text-sm text-gray-600 max-w-xs">
          Making travel expenses easy and transparent for everyone.
        </p>
      </div>
      <div className="flex flex-row items-start gap-[30px]">
        {/* ColumnGroup */}
        <div className="flex flex-col gap-4">
          <h3 className="font-bold">Product</h3>
          <a href="#" className="text-sm text-gray-600">
            Features
          </a>
          <a href="#" className="text-sm text-gray-600">
            Pricing
          </a>
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-bold">Company</h3>
          <a href="#" className="text-sm text-gray-600">
            About
          </a>
          <a href="#" className="text-sm text-gray-600">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
