import { NextResponse } from "next/server";

import { callBackendJson } from "@/lib/server-api";
import { backendErrorResponse } from "@/lib/api-route-helpers";
import type { ListEventsResponse } from "@/types/sar";

export async function GET() {
  try {
    const data = await callBackendJson<ListEventsResponse>("events");
    return NextResponse.json(data);
  } catch (error) {
    return backendErrorResponse(error, "Failed to load events");
  }
}
