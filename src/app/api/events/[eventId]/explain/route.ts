import { NextRequest, NextResponse } from "next/server";

import { callBackendJson } from "@/lib/server-api";
import { backendErrorResponse } from "@/lib/api-route-helpers";
import type { ExplainEventResponse } from "@/types/sar";

export async function GET(_: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const data = await callBackendJson<ExplainEventResponse>(`events/${encodeURIComponent(eventId)}/explain`);
    return NextResponse.json(data);
  } catch (error) {
    return backendErrorResponse(error, "Failed to fetch event explanation");
  }
}
