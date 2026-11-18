import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
export async function GET() {
  const a = await apiAuth();
  if (!a)
    return NextResponse.json(
      { error: "Sign in to a linked MYLA account." },
      { status: 401 },
    );
  return NextResponse.json(
    {
      name: a.name,
      memberships: a.memberships,
      temporaryPassword: a.temporaryPassword,
      onboarded: a.onboarded,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
