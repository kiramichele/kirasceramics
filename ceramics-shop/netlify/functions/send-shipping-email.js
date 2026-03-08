// netlify/functions/send-shipping-email.js
// Called from the admin page when you mark an order as shipped.

const admin      = require("firebase-admin");
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

  // Simple password check so only you can call this
  const { orderId, trackingNumber, adminPassword } = JSON.parse(event.body || "{}");

  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  if (!orderId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing orderId" }) };
  }

  // Get order from Firestore
  const orderRef = db.collection("orders").doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    return { statusCode: 404, body: JSON.stringify({ error: "Order not found" }) };
  }

  const order = orderDoc.data();

  if (!order.customerEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "No customer email on order" }) };
  }

  const address = order.shippingAddress;
  const addressLine = address
    ? `${address.line1}${address.line2 ? ", " + address.line2 : ""}, ${address.city}, ${address.state} ${address.postal_code}`
    : "your address on file";

  // Send shipping email
  try {
    await transporter.sendMail({
      from:    `"Kira Shinn Ceramics" <${process.env.GMAIL_USER}>`,
      to:      order.customerEmail,
      subject: `Your order has shipped! 📦💕`,
      html: shippingEmail({
        customerName:  order.customerName  || "Friend",
        productName:   order.productName   || "your item",
        addressLine,
        trackingNumber: trackingNumber || null,
      }),
    });

    // Update Firestore order status
    await orderRef.update({
      status:    "shipped",
      shippedAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingNumber: trackingNumber || null,
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("Shipping email error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function shippingEmail({ customerName, productName, addressLine, trackingNumber }) {
  const trackingBlock = trackingNumber ? `
    <div style="background: #D6F0FA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 8px; color: #1A3A4A; font-size: 1rem;">📬 Tracking Info</h3>
      <p style="margin: 0; color: #3A7A9A; font-size: 0.9rem;">Tracking number: <strong>${trackingNumber}</strong></p>
      <p style="margin: 8px 0 0; color: #4A7A8A; font-size: 0.85rem;">You can track your package on the carrier's website!</p>
    </div>` : `
    <div style="background: #D6F0FA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 8px; color: #1A3A4A; font-size: 1rem;">📬 On its way!</h3>
      <p style="margin: 0; color: #4A7A8A; font-size: 0.9rem; line-height: 1.6;">Your package is on its way to <strong>${addressLine}</strong>. Estimated delivery is 5–10 business days.</p>
    </div>`;

  return `
    <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 2px solid #E8237A;">
      <div style="background: #E8237A; padding: 32px 32px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 2rem;">📦</p>
        <h1 style="margin: 0; font-size: 1.6rem; color: #ffffff; font-weight: 700;">Your order shipped!</h1>
        <p style="margin: 8px 0 0; color: #FFD6EC; font-size: 0.95rem;">It's on its way to you 💕</p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #1A3A4A; font-size: 1rem; line-height: 1.6; margin: 0 0 24px;">
          Hi ${customerName}! 🎉 Great news — your <strong>${productName}</strong> has been carefully packed and is headed your way!
        </p>
        ${trackingBlock}
        <p style="color: #4A7A8A; font-size: 0.9rem; line-height: 1.6; margin: 0;">
          I hope you love it as much as I loved making it! If you have any questions, just reply to this email. ✨
        </p>
      </div>
      <div style="background: #1A3A4A; padding: 20px 32px; text-align: center;">
        <p style="margin: 0; color: #7ECDE8; font-size: 0.8rem;">Kira Shinn Ceramics · Handmade with love 🏺💕</p>
      </div>
    </div>
  `;
}
