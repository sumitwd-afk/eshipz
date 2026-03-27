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
    const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
    const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
    const LSQ_WEBHOOK_URL = process.env.LSQ_WEBHOOK_URL;

    // Debug: check env vars exist
    if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET || !LSQ_WEBHOOK_URL) {
      return res.status(500).json({
        error: "Missing env vars",
        has_store: !!SHOPIFY_STORE,
        has_client_id: !!SHOPIFY_CLIENT_ID,
        has_secret: !!SHOPIFY_CLIENT_SECRET,
        has_lsq_url: !!LSQ_WEBHOOK_URL
      });
    }

    // Shopify API — search order by order number
    const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2026-01/orders.json?name=${encodeURIComponent(orderId)}&fields=id,order_number,phone,customer&status=any`;
    const authHeader = Buffer.from(`${SHOPIFY_CLIENT_ID}:${SHOPIFY_CLIENT_SECRET}`).toString("base64");

    const shopifyRes = await fetch(shopifyUrl, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${authHeader}`
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
    const phone = order.phone || order.customer?.phone || order.customer?.default_address?.phone;

    if (!phone) {
      return res.status(404).json({ error: "No phone found for order", orderId });
    }

    // Send to LSQ
    const lsqPayload = {
      Phone: phone,
      tracking_number: eshipzData.tracking_number || "",
      carrier: eshipzData.carrier || "",
      tracking_link: eshipzData.tracking_link || "",
      tracking_status: eshipzData.tracking_status || "",
      delivery_date: eshipzData.delivery_date || "",
      order_id: orderId
    };

    const lsqRes = await fetch(LSQ_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lsqPayload)
    });

    if (!lsqRes.ok) {
      const lsqErr = await lsqRes.text();
      return res.status(502).json({ error: "LSQ webhook failed", lsqStatus: lsqRes.status, detail: lsqErr.substring(0, 500) });
    }

    return res.status(200).json({ success: true, orderId, lsqStatus: lsqRes.status });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
