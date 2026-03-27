export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const scopes = "read_orders,read_customers";
  const redirectUri = `https://eshipz-henna.vercel.app/api/auth-callback`;

  const installUrl = `https://${SHOPIFY_STORE}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.redirect(302, installUrl);
}
