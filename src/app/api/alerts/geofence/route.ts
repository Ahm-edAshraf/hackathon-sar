import { NextResponse } from "next/server";

import { callBackendJson } from "@/lib/server-api";
import { backendErrorResponse } from "@/lib/api-route-helpers";
import type { GeofenceRequest, GeofenceResponse } from "@/types/sar";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as GeofenceRequest;
    const data = await callBackendJson<GeofenceResponse>("alerts/geofence", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(data);
  } catch (error) {
    return backendErrorResponse(error, "Failed to set geofence alert");
  }
}
