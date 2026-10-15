export async function runSocialGateway(op, input = {}) {
  const gatewayUrl = process.env.TIKTOK_GATEWAY_URL || process.env.APIFY_GATEWAY_URL;
  const secret = process.env.TIKTOK_GATEWAY_SECRET || process.env.APIFY_GATEWAY_SECRET;

  if (!gatewayUrl) {
    throw new Error("APIFY_GATEWAY_URL/TIKTOK_GATEWAY_URL is missing.");
  }

  if (
    gatewayUrl.includes("YOUR_DEPLOYMENT_ID") ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(gatewayUrl)
  ) {
    throw new Error(
      "APIFY_GATEWAY_URL must be the deployed Google Apps Script /exec URL."
    );
  }

  if (!secret) {
    throw new Error("APIFY_GATEWAY_SECRET/TIKTOK_GATEWAY_SECRET is missing.");
  }

  if (secret === "YOUR_PRIVATE_GATEWAY_SECRET") {
    throw new Error(
      "APIFY_GATEWAY_SECRET is still using the example placeholder."
    );
  }

  if (!op || typeof op !== "string") {
    throw new Error("Gateway operation is required.");
  }

  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      secret,
      op,
      input
    })
  });

  const raw = await response.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Gateway returned non-JSON (${response.status}): ${raw.slice(0, 200)}`
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.error || `Gateway failed with HTTP ${response.status}`
    );
  }

  return data;
}

export async function gatewayItems(op, input = {}) {
  const data = await runSocialGateway(op, input);
  return Array.isArray(data.items) ? data.items : [];
}
