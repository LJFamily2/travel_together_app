import { NextRequest, NextResponse } from "next/server";
import dbConnect from "../../../../lib/mongodb";
import Expense from "../../../../lib/models/Expense";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const expense = await Expense.findById(id);

    if (!expense || !expense.imageBinary) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const buffer = expense.imageBinary;

    const headers = new Headers();
    headers.set("Content-Type", "image/jpeg"); // Defaulting to jpeg
    // Prevent caching to ensure updates are reflected immediately and deleted images aren't accessible
    headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
