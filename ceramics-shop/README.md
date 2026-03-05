# Fired & Found — Setup Guide

A handmade ceramics shop built on **Netlify** (hosting + serverless functions),
**Firebase Firestore** (product catalog + orders), and **Stripe** (payments).

---

## Project Structure

```
ceramics-shop/
├── public/
│   ├── index.html          ← storefront
│   ├── success.html        ← post-purchase page
│   └── cancel.html         ← cancelled checkout page
├── netlify/
│   └── functions/
│       ├── create-checkout.js   ← creates Stripe Checkout session
│       └── stripe-webhook.js    ← saves orders to Firestore on payment success
├── seed_products.py        ← Python script to add initial products to Firestore
├── firestore.rules         ← security rules for Firestore
├── netlify.toml            ← Netlify build + function config
├── package.json
└── .env.example
```

---

## Step 1 — Firebase Setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Create a **Firestore Database** (start in test mode, switch to production rules after)
3. Go to **Project Settings → Service Accounts → Generate new private key**
   - Download the JSON file, save it as `serviceAccountKey.json` in the project root
4. Go to **Project Settings → Your Apps → Add Web App**
   - Copy the `firebaseConfig` object values — you'll paste these into `public/index.html`
5. In `public/index.html`, replace the placeholder values in `firebaseConfig` with your real values

**Deploy security rules:**
```bash
npm install -g firebase-tools
firebase login
firebase use your-project-id
firebase deploy --only firestore:rules
```

---

## Step 2 — Stripe Setup

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Products**
2. Create a product for each keychain (e.g., "Classic Oval Keychain")
   - Add a price (e.g., $12.00, one-time)
   - Copy the **Price ID** (starts with `price_`)
3. In `seed_products.py`, paste each Price ID into the matching product's `stripePriceId` field
4. Go to **Developers → API Keys** → copy your **Secret Key** (`sk_test_...` for test mode)

---

## Step 3 — Seed Products

```bash
pip install firebase-admin
export FIREBASE_CREDENTIALS=serviceAccountKey.json
export FIREBASE_PROJECT_ID=your-project-id
python seed_products.py
```

---

## Step 4 — Netlify Setup

1. Push this project to GitHub
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
3. Set build settings:
   - **Base directory**: (leave blank)
   - **Publish directory**: `public`
   - **Build command**: (leave blank, or `npm install`)
4. Go to **Site Settings → Environment Variables** and add:

| Key | Value |
|-----|-------|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | (set up next) |
| `FIREBASE_PROJECT_ID` | your project ID |
| `FIREBASE_CLIENT_EMAIL` | from service account JSON |
| `FIREBASE_PRIVATE_KEY` | from service account JSON (include the full `-----BEGIN...-----END...` string) |

---

## Step 5 — Stripe Webhook

After deploying to Netlify (so you have a live URL):

1. Go to Stripe → **Developers → Webhooks → Add endpoint**
2. URL: `https://your-site.netlify.app/api/stripe-webhook`
3. Events to listen for: `checkout.session.completed`
4. Copy the **Signing Secret** (`whsec_...`)
5. Add it as `STRIPE_WEBHOOK_SECRET` in Netlify environment variables

---

## Local Development

```bash
npm install
cp .env.example .env
# fill in .env with your test keys
npx netlify dev
# → opens at http://localhost:8888
```

For local webhook testing:
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:8888/api/stripe-webhook
```

---

## Adding More Products Later

Either re-run `seed_products.py` with new entries, or add products directly in the
Firebase Console under the `products` collection. Make sure each document has:

```json
{
  "name": "Product Name",
  "description": "Short description",
  "price": 1500,
  "stock": 5,
  "stripePriceId": "price_xxx",
  "imageUrl": "https://...",
  "active": true,
  "category": "keychain"
}
```

---

## Adding Product Images

Upload images to [Firebase Storage](https://firebase.google.com/docs/storage) or any public CDN
(Cloudinary free tier works great), then paste the public URL into the `imageUrl` field.

---

## Going Live (Stripe Live Mode)

1. In Stripe Dashboard, toggle from **Test** to **Live**
2. Replace `STRIPE_SECRET_KEY` with your live key (`sk_live_...`)
3. Re-create the webhook endpoint in live mode
4. Update `STRIPE_WEBHOOK_SECRET` with the live webhook secret
5. Recreate your Stripe products in live mode and update Price IDs in Firestore
