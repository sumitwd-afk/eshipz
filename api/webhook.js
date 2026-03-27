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
    const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
    const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;
    const LSQ_HOST = process.env.LSQ_HOST || "https://api-in21.leadsquared.com";

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !LSQ_ACCESS_KEY || !LSQ_SECRET_KEY) {
      return res.status(500).json({
        error: "Missing env vars",
        has_store: !!SHOPIFY_STORE,
        has_token: !!SHOPIFY_ACCESS_TOKEN,
        has_lsq_key: !!LSQ_ACCESS_KEY,
        has_lsq_secret: !!LSQ_SECRET_KEY
      });
    }

    // --- STEP 1: Get phone from Shopify ---
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

    let phone = order.phone || order.customer?.phone || order.customer?.default_address?.phone;
    if (!phone) {
      return res.status(404).json({ error: "No phone found for order", orderId });
    }

    phone = phone.replace(/[\s\-()]/g, "");
    const digits = phone.replace(/^\+?91/, "");
    const cleanOrderId = orderId.replace(/^#/, "");

    // --- STEP 2: Search lead in LSQ by phone ---
    const searchUrl = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetByPhoneNumber?accessKey=${LSQ_ACCESS_KEY}&secretKey=${LSQ_SECRET_KEY}&phone=${digits}`;

    const searchRes = await fetch(searchUrl);
    const searchBody = await searchRes.text();
    let leadId = null;

    if (searchRes.ok) {
      try {
        const leads = JSON.parse(searchBody);
        if (Array.isArray(leads) && leads.length > 0) {
          leadId = leads[0].ProspectID;
        }
      } catch (e) {}
    }

    // --- STEP 3: Update or Create lead ---
    const lsqFields = [
      { Attribute: "Phone", Value: digits },
      { Attribute: "mx_Tracking_Number", Value: eshipzData.tracking_number || "" },
      { Attribute: "mx_Courier_Name", Value: eshipzData.carrier || "" },
      { Attribute: "mx_Tracking_URL", Value: eshipzData.tracking_link || "" },
      { Attribute: "mx_Shipment_Status", Value: eshipzData.tracking_status || "" },
      { Attribute: "mx_Order_Number", Value: cleanOrderId }
    ];

    if (eshipzData.delivery_date) {
      lsqFields.push({ Attribute: "mx_Actual_Delivery_Date", Value: eshipzData.delivery_date });
    }

    let lsqUrl, lsqMethod;
    if (leadId) {
      // Update existing lead
      lsqUrl = `${LSQ_HOST}/v2/LeadManagement.svc/Lead.Update?accessKey=${LSQ_ACCESS_KEY}&secretKey=${LSQ_SECRET_KEY}&leadId=${leadId}`;
    } else {
      // Create new lead (Capture auto-matches by phone)
      lsqUrl = `${LSQ_HOST}/v2/LeadManagement.svc/Lead.Capture?accessKey=${LSQ_ACCESS_KEY}&secretKey=${LSQ_SECRET_KEY}`;
    }

    const lsqRes = await fetch(lsqUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lsqFields)
    });

    const lsqBody = await lsqRes.text();

    if (!lsqRes.ok) {
      return res.status(502).json({ 
        error: "LSQ API failed", 
        lsqStatus: lsqRes.status, 
        detail: lsqBody.substring(0, 500),
        action: leadId ? "Update" : "Capture",
        leadId 
      });
    }

    return res.status(200).json({ 
      success: true, 
      orderId, 
      action: leadId ? "Updated" : "Created",
      leadId,
      phoneSent: digits,
      lsqResponse: lsqBody.substring(0, 500)
    });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
