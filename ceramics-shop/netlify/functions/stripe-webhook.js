// netlify/functions/stripe-webhook.js
// Listens for Stripe events (payment success, etc.) and updates Firestore.

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin  = require("firebase-admin");

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines stored in env var
      privateKey:   (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig     = event.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── Handle relevant events ──────────────────────────────────────
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    try {
      // Save order record to Firestore
      await db.collection("orders").add({
        stripeSessionId:  session.id,
        customerEmail:    session.customer_details?.email || null,
        customerName:     session.customer_details?.name  || null,
        shippingAddress:  session.shipping_details?.address || null,
        amountTotal:      session.amount_total,        // in cents
        currency:         session.currency,
        paymentStatus:    session.payment_status,
        productName:      session.metadata?.productName || null,
        createdAt:        admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Order saved:", session.id);
    } catch (err) {
      console.error("Firestore write error:", err.message);
      // Still return 200 so Stripe doesn't retry endlessly
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
