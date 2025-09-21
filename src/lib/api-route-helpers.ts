import { NextResponse } from "next/server";

import { BackendRequestError } from "./server-api";

export function backendErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof BackendRequestError) {
    return NextResponse.json(
      {
        message: fallbackMessage,
        details: error.payload,
      },
      { status: error.status },
    );
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ message: fallbackMessage }, { status: 500 });
}
