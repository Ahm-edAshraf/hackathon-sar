import { NextResponse } from "next/server";

import { callBackendJson } from "@/lib/server-api";
import { backendErrorResponse } from "@/lib/api-route-helpers";
import type { IngestEventRequest, IngestEventResponse } from "@/types/sar";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as IngestEventRequest;
    const data = await callBackendJson<IngestEventResponse>("ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(data);
  } catch (error) {
    return backendErrorResponse(error, "Failed to ingest event");
  }
}
