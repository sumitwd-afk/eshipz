export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const eshipzData = req.body;
    const orderId = eshipzData.order_id;

    if (!orderId) {
      return res.status(400).json({ error: "No order_id in payload" });
    }

    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
    const LSQ_WEBHOOK_URL = process.env.LSQ_WEBHOOK_URL;

    // Debug: check env vars exist
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !LSQ_WEBHOOK_URL) {
      return res.status(500).json({
        error: "Missing env vars",
        has_store: !!SHOPIFY_STORE,
        has_token: !!SHOPIFY_ACCESS_TOKEN,
        has_lsq_url: !!LSQ_WEBHOOK_URL
      });
    }

    // Shopify API — search order by order number
    const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2026-01/orders.json?name=${encodeURIComponent(orderId)}&fields=id,order_number,phone,customer&status=any`;

    const shopifyRes = await fetch(shopifyUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      }
    });

    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text();
      return res.status(500).json({ error: "Shopify API failed", status: shopifyRes.status, detail: errText.substring(0, 500) });
    }

    const shopifyData = await shopifyRes.json();
    const order = shopifyData.orders?.[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found in Shopify", orderId });
    }

    // Extract phone
    let phone = order.phone || order.customer?.phone || order.customer?.default_address?.phone;

    if (!phone) {
      return res.status(404).json({ error: "No phone found for order", orderId });
    }

    // Normalize phone: remove spaces, format as +91-XXXXXXXXXX for LSQ matching
    phone = phone.replace(/[\s\-()]/g, "");
    const digits = phone.replace(/^\+?91/, "");
    const phoneClean = `+91-${digits}`;

    // Clean order_id: remove # prefix for LSQ Number field
    const cleanOrderId = parseInt(orderId.replace(/^#/, ""), 10) || orderId.replace(/^#/, "");

    // Send to LSQ — DEBUG: try both array and single object format
    const lsqPayloadObj = { Phone: phoneClean };
    
    // Try single object (not array) — some LSQ webhooks expect this
    const lsqRes = await fetch(LSQ_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lsqPayloadObj)
    });

    const lsqBody = await lsqRes.text();

    if (!lsqRes.ok) {
      return res.status(502).json({ error: "LSQ webhook failed", lsqStatus: lsqRes.status, detail: lsqBody.substring(0, 500) });
    }

    // Show masked LSQ URL for verification
    const maskedUrl = LSQ_WEBHOOK_URL.substring(0, 60) + "...";

    return res.status(200).json({ success: true, orderId, lsqStatus: lsqRes.status, lsqResponse: lsqBody.substring(0, 500), phoneSent: phoneClean, payloadSent: JSON.stringify(lsqPayloadObj), lsqUrlPrefix: maskedUrl });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
