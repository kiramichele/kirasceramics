// netlify/functions/create-checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const ALLOWED_ORIGINS = [
  process.env.URL,
  "http://localhost:8888",
];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(event), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let items;
  try {
    ({ items } = JSON.parse(event.body));
  } catch {
    return respond(400, { error: "Invalid request body" }, event);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return respond(400, { error: "No items provided" }, event);
  }

  // Validate all items have a priceId
  for (const item of items) {
    if (!item.priceId || typeof item.priceId !== "string") {
      return respond(400, { error: "Invalid priceId in cart" }, event);
    }
  }

  const siteUrl = process.env.URL || "http://localhost:8888";
  const productNames = items.map(i => i.name).join(", ");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map(item => ({
        price:    item.priceId,
        quantity: item.quantity || 1,
      })),
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/cancel.html`,
      shipping_address_collection: {
        allowed_countries: ["US"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 395, currency: "usd" },
            display_name: "Standard Shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "usd" },
            display_name: "Free Shipping (3–4 weeks)",
            delivery_estimate: {
              minimum: { unit: "week", value: 3 },
              maximum: { unit: "week", value: 4 },
            },
          },
        },
      ],
      metadata: { productNames },
    });

    return respond(200, { url: session.url }, event);
  } catch (err) {
    console.error("Stripe error:", err.message);
    return respond(500, { error: "Could not create checkout session." }, event);
  }
};

function corsHeaders(event) {
  const origin  = event.headers?.origin || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || "*");
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function respond(statusCode, body, event) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(event) },
    body: JSON.stringify(body),
  };
}
