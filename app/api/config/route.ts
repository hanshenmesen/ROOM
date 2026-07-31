import { NextResponse } from "next/server";
import { getPublicAgentConfigStatus } from "@/lib/agents/provider-config";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json(getPublicAgentConfigStatus(), {
    headers: { "cache-control": "no-store" },
  });
}
