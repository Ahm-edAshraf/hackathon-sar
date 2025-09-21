import { NextResponse } from "next/server";

import { callBackendJson } from "@/lib/server-api";
import { backendErrorResponse } from "@/lib/api-route-helpers";
import type { SimulateReplayResponse } from "@/types/sar";

export async function POST() {
  try {
    const data = await callBackendJson<SimulateReplayResponse>("simulate/replay", {
      method: "POST",
      body: JSON.stringify({}),
    });

    return NextResponse.json(data);
  } catch (error) {
    return backendErrorResponse(error, "Failed to start replay simulation");
  }
}
