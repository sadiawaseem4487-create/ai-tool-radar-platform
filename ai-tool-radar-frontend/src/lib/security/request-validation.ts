import { NextRequest } from "next/server";

export class RequestValidationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function parseJsonWithLimit(
  req: NextRequest,
  options?: { maxBytes?: number },
): Promise<Record<string, unknown>> {
  const maxBytes = Math.max(256, options?.maxBytes ?? 64 * 1024);
  const contentLen = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLen) && contentLen > maxBytes) {
    throw new RequestValidationError(413, "PAYLOAD_TOO_LARGE", `Payload exceeds ${maxBytes} bytes.`);
  }
  const raw = await req.text();
  const rawBytes = Buffer.byteLength(raw, "utf8");
  if (rawBytes > maxBytes) {
    throw new RequestValidationError(413, "PAYLOAD_TOO_LARGE", `Payload exceeds ${maxBytes} bytes.`);
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new RequestValidationError(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof RequestValidationError) throw err;
    throw new RequestValidationError(400, "VALIDATION_ERROR", "Invalid request body.");
  }
}

export function asTrimmedString(value: unknown, maxLen = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

export function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}
