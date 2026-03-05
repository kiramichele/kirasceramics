"""
seed_products.py
----------------
Run this once to populate your Firestore with sample keychain products.
Before running, set these environment variables (or edit the values below):

  FIREBASE_PROJECT_ID    — your Firebase project ID
  FIREBASE_CREDENTIALS   — path to your service account JSON file

Usage:
  pip install firebase-admin
  python seed_products.py
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore

# ── Config ──────────────────────────────────────────────────────────
CREDENTIALS_PATH = os.environ.get("FIREBASE_CREDENTIALS", "serviceAccountKey.json")
PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "kira-shinn-ceramics")

# ── Products ─────────────────────────────────────────────────────────
# price is in CENTS (so 1200 = $12.00)
# stripePriceId: create products in Stripe Dashboard first, then paste the Price ID here
PRODUCTS = [
    {
        "name":         "Classic Oval Keychain",
        "description":  "Smooth oval form, satin glaze. Approx. 1.5\" long.",
        "price":        1200,            # $12.00
        "stock":        8,
        "stripePriceId": "price_XXXXXXXXXXXXXXXXXX",   # ← paste from Stripe
        "imageUrl":     "",              # add a public image URL or leave blank
        "active":       True,
        "category":     "keychain",
    },
    {
        "name":         "Heart Keychain",
        "description":  "Pinch-formed heart with a matte blush glaze.",
        "price":        1400,            # $14.00
        "stock":        5,
        "stripePriceId": "price_XXXXXXXXXXXXXXXXXX",
        "imageUrl":     "",
        "active":       True,
        "category":     "keychain",
    },
    {
        "name":         "Moon Phase Keychain",
        "description":  "Stamped crescent moon, midnight blue glaze.",
        "price":        1500,            # $15.00
        "stock":        6,
        "stripePriceId": "price_XXXXXXXXXXXXXXXXXX",
        "imageUrl":     "",
        "active":       True,
        "category":     "keychain",
    },
    {
        "name":         "Floral Sprig Keychain",
        "description":  "Hand-textured with dried flowers, terracotta glaze.",
        "price":        1600,            # $16.00
        "stock":        4,
        "stripePriceId": "price_XXXXXXXXXXXXXXXXXX",
        "imageUrl":     "",
        "active":       True,
        "category":     "keychain",
    },
]

# ── Seed ─────────────────────────────────────────────────────────────
def main():
    cred = credentials.Certificate(CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred, {"projectId": PROJECT_ID})
    db = firestore.client()

    col = db.collection("products")

    for product in PRODUCTS:
        # Use name as a simple dedup key
        existing = col.where("name", "==", product["name"]).limit(1).get()
        if existing:
            print(f"  ↳ Skipped (already exists): {product['name']}")
            continue
        ref = col.add(product)
        print(f"  ✓ Added: {product['name']}  (id: {ref[1].id})")

    print("\nDone! Check your Firestore console to confirm.")

if __name__ == "__main__":
    main()
