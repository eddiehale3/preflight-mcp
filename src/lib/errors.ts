export class PreflightError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PreflightError";
    this.code = code;
    this.details = details;
  }
}

export function toToolErrorContent(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  if (error instanceof PreflightError) {
    const detailsText = error.details ? ` ${JSON.stringify(error.details)}` : "";
    return {
      content: [{ type: "text", text: `[${error.code}] ${error.message}${detailsText}` }],
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `[unexpected_error] ${message}` }],
    isError: true,
  };
}
