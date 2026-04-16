export type OutboundAlert = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  metadata: Record<string, unknown>;
};

export async function sendAlertNotification(input: {
  alert: OutboundAlert;
  tenant_id?: string;
  request_id: string;
  correlation_id: string;
}): Promise<{ delivered: boolean; target?: string; error?: string }> {
  const webhook = process.env.RADAR_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) {
    return { delivered: false };
  }
  const payload = {
    ts: new Date().toISOString(),
    event: "observability.alert",
    request_id: input.request_id,
    correlation_id: input.correlation_id,
    tenant_id: input.tenant_id,
    alert: input.alert,
  };
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      return { delivered: false, target: "webhook", error: `HTTP ${res.status}` };
    }
    return { delivered: true, target: "webhook" };
  } catch (err) {
    return {
      delivered: false,
      target: "webhook",
      error: err instanceof Error ? err.message : "Delivery failed",
    };
  }
}
