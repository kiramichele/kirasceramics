// netlify/functions/stripe-webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin  = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:   (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig    = event.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    const customerName    = session.customer_details?.name  || "Unknown";
    const customerEmail   = session.customer_details?.email || "Unknown";
    const productName     = session.metadata?.productName   || "Unknown item";
    const amountTotal     = ((session.amount_total || 0) / 100).toFixed(2);
    const address         = session.shipping_details?.address;
    const addressLine     = address
      ? `${address.line1}${address.line2 ? ", " + address.line2 : ""}, ${address.city}, ${address.state} ${address.postal_code}`
      : "No address provided";

    // Save to Firestore
    try {
      await db.collection("orders").add({
        stripeSessionId: session.id,
        customerEmail,
        customerName,
        shippingAddress: session.shipping_details?.address || null,
        amountTotal:     session.amount_total,
        currency:        session.currency,
        paymentStatus:   session.payment_status,
        productName,
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Order saved:", session.id);
    } catch (err) {
      console.error("Firestore write error:", err.message);
    }

    // Send email notification
    try {
      await transporter.sendMail({
        from:    `"Kira's Ceramics Shop" <${process.env.GMAIL_USER}>`,
        to:      process.env.GMAIL_USER,
        subject: `🏺 New Order! ${productName} from ${customerName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #E8237A;">You got a new order! 🎉</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; width: 140px;">Item</td>
                <td style="padding: 8px 0; font-weight: bold;">${productName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Amount</td>
                <td style="padding: 8px 0; font-weight: bold;">$${amountTotal}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Customer</td>
                <td style="padding: 8px 0;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Email</td>
                <td style="padding: 8px 0;">${customerEmail}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Ship to</td>
                <td style="padding: 8px 0;">${addressLine}</td>
              </tr>
            </table>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
            <p style="color: #999; font-size: 0.85rem;">
              View full details in your 
              <a href="https://dashboard.stripe.com/payments" style="color: #E8237A;">Stripe dashboard</a>.
            </p>
          </div>
        `,
      });
      console.log("Order notification email sent!");
    } catch (err) {
      console.error("Email error:", err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
