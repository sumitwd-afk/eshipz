export default async function handler(req, res) {
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send("Missing code or shop parameter");
  }

  const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code: code
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(`
        <html>
        <body style="font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto;">
          <h2 style="color:green;">Access Token Mil Gaya!</h2>
          <p><strong>Token:</strong></p>
          <input type="text" value="${tokenData.access_token}" 
                 style="width:100%;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:4px;" 
                 onclick="this.select()" readonly />
          <p style="margin-top:20px;color:#666;">
            1. Ye token copy karo<br>
            2. Vercel → Settings → Environment Variables me <code>SHOPIFY_ACCESS_TOKEN</code> add karo<br>
            3. Redeploy karo<br>
            4. Phir auth.js aur auth-callback.js delete kar dena
          </p>
        </body>
        </html>
      `);
    } else {
      return res.status(400).json({ error: "Token nahi mila", detail: tokenData });
    }
  } catch (err) {
    return res.status(500).json({ error: "Token exchange failed", message: err.message });
  }
}
