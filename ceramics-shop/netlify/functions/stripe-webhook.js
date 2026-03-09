// netlify/functions/stripe-webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin  = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

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

    const customerName    = session.customer_details?.name  || "Friend";
    const customerEmail   = session.customer_details?.email || null;
    const productName     = session.metadata?.productNames  || "your item(s)";
    const customerNotes   = session.metadata?.customerNotes || "";
    const amountTotal     = ((session.amount_total || 0) / 100).toFixed(2);
    const address         = session.shipping_details?.address;
    const addressLine     = address
      ? `${address.line1}${address.line2 ? ", " + address.line2 : ""}, ${address.city}, ${address.state} ${address.postal_code}`
      : "No address provided";

    // Save to Firestore
    let orderId = null;
    try {
      const ref = await db.collection("orders").add({
        stripeSessionId: session.id,
        customerEmail,
        customerName,
        shippingAddress: session.shipping_details?.address || null,
        amountTotal:     session.amount_total,
        currency:        session.currency,
        paymentStatus:   session.payment_status,
        productName,
        customerNotes,
        status:          "paid",
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });
      orderId = ref.id;
    } catch (err) {
      console.error("Firestore write error:", err.message);
    }

    // Email Kira
    try {
      await transporter.sendMail({
        from:    `"Kira Shinn Ceramics" <${process.env.GMAIL_USER}>`,
        to:      process.env.GMAIL_USER,
        subject: `🏺 New Order! ${productName} from ${customerName}`,
        html:    ownerEmail({ customerName, customerEmail, productName, customerNotes, amountTotal, addressLine, orderId }),
      });
    } catch (err) {
      console.error("Owner email error:", err.message);
    }

    // Email Customer
    if (customerEmail) {
      try {
        await transporter.sendMail({
          from:    `"Kira Shinn Ceramics" <${process.env.GMAIL_USER}>`,
          to:      customerEmail,
          subject: `Your order is confirmed! 🏺💕`,
          html:    confirmationEmail({ customerName, productName, customerNotes, amountTotal, addressLine }),
        });
      } catch (err) {
        console.error("Customer email error:", err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

function confirmationEmail({ customerName, productName, customerNotes, amountTotal, addressLine }) {
  const notesBlock = customerNotes ? `
    <div style="background: #FFD6EC; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 6px; color: #1A3A4A; font-size: 0.95rem;">✏️ Your personalization request</h3>
      <p style="margin: 0; color: #6A2A4A; font-size: 0.9rem; line-height: 1.6;">${customerNotes}</p>
    </div>` : "";

  return `
    <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 2px solid #A8DDEF;">
      <div style="background: #A8DDEF; padding: 32px 32px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 2rem;">🏺</p>
        <h1 style="margin: 0; font-size: 1.6rem; color: #1A3A4A; font-weight: 700;">Order Confirmed!</h1>
        <p style="margin: 8px 0 0; color: #3A7A9A; font-size: 0.95rem;">Thank you so much for your order 💕</p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #1A3A4A; font-size: 1rem; line-height: 1.6; margin: 0 0 24px;">
          Hi ${customerName}! 👋 I'm so excited for you to receive your new piece. Every item is handmade by me personally, so I'll get it carefully packed and shipped out to you as soon as possible!
        </p>
        <div style="background: #D6F0FA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 14px; color: #1A3A4A; font-size: 1rem;">Order Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #4A7A8A; font-size: 0.9rem;">Item(s)</td><td style="padding: 6px 0; color: #1A3A4A; font-weight: 600; text-align: right;">${productName}</td></tr>
            <tr><td style="padding: 6px 0; color: #4A7A8A; font-size: 0.9rem;">Total</td><td style="padding: 6px 0; color: #E8237A; font-weight: 700; text-align: right; font-size: 1.1rem;">$${amountTotal}</td></tr>
            <tr><td style="padding: 6px 0; color: #4A7A8A; font-size: 0.9rem;">Ship to</td><td style="padding: 6px 0; color: #1A3A4A; text-align: right; font-size: 0.9rem;">${addressLine}</td></tr>
          </table>
        </div>
        ${notesBlock}
        <div style="background: #FFD6EC; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="margin: 0 0 8px; color: #1A3A4A; font-size: 1rem;">📦 Shipping Estimate</h3>
          <p style="margin: 0; color: #6A2A4A; font-size: 0.9rem; line-height: 1.6;">Orders typically ship within <strong>3–5 business days</strong>. You'll receive a shipping confirmation with tracking info once it's on its way!</p>
        </div>
        <p style="color: #4A7A8A; font-size: 0.9rem; line-height: 1.6; margin: 0;">Questions? Just reply to this email! ✨</p>
      </div>
      <div style="background: #1A3A4A; padding: 20px 32px; text-align: center;">
        <p style="margin: 0; color: #7ECDE8; font-size: 0.8rem;">Kira Shinn Ceramics · Handmade with love 🏺💕</p>
      </div>
    </div>`;
}

function ownerEmail({ customerName, customerEmail, productName, customerNotes, amountTotal, addressLine, orderId }) {
  const notesRow = customerNotes
    ? `<tr><td style="padding: 8px 0; color: #666; width: 140px; vertical-align:top;">Notes</td><td style="padding: 8px 0; color: #E8237A; font-weight: 600;">${customerNotes}</td></tr>`
    : "";
  return `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #E8237A;">You got a new order! 🎉</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #666; width: 140px;">Item(s)</td><td style="padding: 8px 0; font-weight: bold;">${productName}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Amount</td><td style="padding: 8px 0; font-weight: bold;">$${amountTotal}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Customer</td><td style="padding: 8px 0;">${customerName}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;">${customerEmail}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Ship to</td><td style="padding: 8px 0;">${addressLine}</td></tr>
        ${notesRow}
        ${orderId ? `<tr><td style="padding: 8px 0; color: #666;">Order ID</td><td style="padding: 8px 0; font-size: 0.85rem; color: #999;">${orderId}</td></tr>` : ""}
      </table>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 0.85rem;">View in <a href="https://dashboard.stripe.com/payments" style="color: #E8237A;">Stripe dashboard</a></p>
    </div>`;
}
