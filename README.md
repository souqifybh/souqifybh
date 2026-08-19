# Souqify-bh — free e-commerce starter for Bahrain

A 3-file store: **index.html** (storefront), **admin.html** (product/order management),
**backend-Code.gs** (turns a Google Sheet into your free database + API). No hosting bill, no database bill.

## ⚠️ Read this first if you're upgrading from an older version

You **must redeploy** the Apps Script after pasting in the new `backend-Code.gs`, or your live site keeps
calling the old code:

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Select all the existing code and replace it with the new `backend-Code.gs`.
3. Click **Deploy → Manage deployments**.
4. Click the **pencil (edit) icon** on your existing deployment.
5. Under "Version," choose **New version**, then click **Deploy**.

Editing the script alone does nothing to your live site — only "New version → Deploy" pushes the change out.
Your deployment URL stays the same, so you don't need to update `CONFIG.API_URL` anywhere.

## What's new in this version

**Bug fixes**
- **Fixed: "Add to cart" not working from the product page.** The product page was rendering *above* the cart drawer, so clicking "Add to cart" or "Buy now" there was opening the drawer invisibly behind it. Stacking order is fixed — both now work correctly from anywhere on the site.
- **Fixed: products showing "Hidden" after adding them, and images disappearing when editing.** The backend used to write product fields to fixed column numbers. If your Google Sheet's columns didn't exactly match (e.g. after an earlier upgrade added new columns), values landed in the wrong cells. The backend now reads and writes every field **by column name**, and automatically adds any missing columns to your sheet the next time it runs — so it self-heals instead of silently misaligning data.

**New features**
- **Customer accounts.** Checkout now requires a quick email + password registration/login. Accounts are stored in a new **Customers** tab in your Google Sheet (passwords are salted and hashed, never stored in plain text). Customers only register once — after that they just log in, and their name/phone auto-fill at checkout.
- **Homepage hero banner ("Featured Gadget").** A new **Homepage** tab in the admin panel lets you upload/paste a photo, headline, subtitle, two floating tags, and (optionally) link the banner to a specific product — this is the big image customers see first when they land on the site.
- **A real favicon**, generated from your logo mark, wired into both `index.html` and `admin.html` — see the favicon section below for the custom domain steps.
- A new **Customers** tab in the admin panel to see everyone who's registered.
- Every product save in the admin panel now shows a clear "✓ Added — live on the site now" / "✓ Updated — live on the site now" confirmation, so you know it actually went through.

**From the previous round (still included)**
- Compare-at pricing ("was" price with a strikethrough and % off badge).
- Up to 5 images per product with a full Shopify-style product detail page (gallery, quantity selector, related products).
- Featured products / Best sellers homepage rails.
- Advanced admin dashboard, searchable product catalogue, and orders view.

## 1. Set up the free backend (Google Sheets)

1. Create a new Google Sheet (sheets.google.com).
2. Extensions → Apps Script. Delete the sample code, paste in **backend-Code.gs**.
3. In the script, change `ADMIN_PASSWORD` to your own password.
4. Deploy → New deployment → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL (ends in `/exec`). This is your free API.
6. Run the script once manually (select `doGet` and click **Run**) so the **Products**, **Orders**, **Customers**, and **Settings** tabs get created — you'll need to grant permissions the first time.

Whenever you edit `backend-Code.gs` again in the future, remember the redeploy steps at the top of this file.

## 2. Connect the frontend

- Open `index.html`, set `CONFIG.API_URL` to your `/exec` URL and `CONFIG.WHATSAPP_NUMBER` to your Bahrain WhatsApp number (format: `973XXXXXXXX`, no `+`).
- Open `admin.html`, set the same `API_URL`.

## 3. Host it for free

Any of these work, all free tiers:
- **Netlify** or **Vercel** — drag-and-drop the folder, get a live URL in ~1 minute.
- **GitHub Pages** — push the folder to a repo, enable Pages in settings.

Keep `admin.html` unlinked from your site navigation (don't put it in a menu) so casual visitors don't stumble onto it — it's still password-protected, but security-by-obscurity is a free extra layer.

**Upload the favicon files too** — `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, and `site.webmanifest` all need to sit in the same root folder as `index.html` (not in a subfolder), since the `<link>` tags reference them as plain relative filenames.

## 4. Favicon + custom domain on GitHub Pages

Since you're adding a custom domain on GitHub Pages, here's the exact sequence:

1. Upload all the files (including the favicon set above) to your repo's root.
2. In your repo, go to **Settings → Pages → Custom domain**, type your domain (e.g. `souqify-bh.com` or `www.souqify-bh.com`), and save. GitHub creates a `CNAME` file in your repo automatically — leave it there.
3. At your domain registrar, add the DNS records GitHub's Pages settings screen shows you (either an `A` record set pointing at GitHub's IPs for an apex domain, or a `CNAME` record pointing at `<your-username>.github.io` for a `www` subdomain).
4. Wait for DNS to propagate (can take a few minutes to a few hours), then check the box for **Enforce HTTPS** once GitHub shows the certificate is ready.
5. Once the domain is live, browsers will pick up `favicon.ico` automatically from the root — no extra config needed. If you don't see it right away, hard-refresh (Ctrl/Cmd+Shift+R) since browsers cache favicons aggressively.

If you ever want a different favicon later, replace those image files with new ones of the same names/sizes and re-upload — no HTML changes needed.

## 5. Add your first products

Go to your live `admin.html`, log in, and add products. For each product you can paste up to **5 image URLs** (the first one is the main/cover photo shown on cards and as the default PDP image), write a short description, set stock, and flip the **Featured** and **Best seller** toggles to control which homepage rails a product appears in. There's no price cap in this version — Souqify-bh sells gadgets at whatever price you set.

Free image hosting options if you don't have your own: [Unsplash](https://unsplash.com) for stock photography (right-click → copy image address), or upload real product photos to a free host like [ImgBB](https://imgbb.com) or a public Google Drive/Photos link and paste the direct image URL. The same applies to the homepage hero banner image in the **Homepage** admin tab.

### Products sheet columns
`id | name | description | price | compareAtPrice | image1 | image2 | image3 | image4 | image5 | category | stock | active | featured | bestseller`

`compareAtPrice` is optional — leave it blank for no discount badge. It only shows the "was" price and % off if it's set *and* higher than the current price.

### Orders sheet columns
`id | timestamp | customerName | customerEmail | phone | address | items | total | paymentMethod | paymentStatus | orderStatus | notes`

### Customers sheet columns
`id | name | email | phone | passwordHash | salt | createdAt` — passwords are never stored in plain text, only a salted SHA-256 hash.

### Settings sheet
Just two columns, `key | value` — this is where the homepage hero banner fields live (`heroActive`, `heroImage`, `heroTitle`, etc). You normally never need to touch this sheet directly; the admin **Homepage** tab manages it for you.

If your sheet is missing any of the newer columns, don't worry — the backend adds them automatically the first time it runs after you redeploy. Nothing gets shifted or overwritten.

---

## Honest advice on the payment methods you asked for

Being upfront about what's realistic to run **for free** as a Bahrain-based seller:

**BenefitPay QR → WhatsApp confirmation (works, and it's what I built)**
This is the most realistic free option. Customer taps "BenefitPay," gets sent to WhatsApp with the order number and total pre-filled, sends you a screenshot of the BenefitPay payment, and you mark the order "paid" in the admin panel. No merchant account, no fees — but it's manual, so build in a promise like "we confirm within 30 minutes" so customers don't feel left hanging.

**Cash on Delivery (works, free)**
No integration needed — it's just an order status. Simplest and most trusted option for a new small store in Bahrain.

**GPay (limited for Bahrain)**
Google Pay's peer-to-peer/merchant features are built around India's UPI network and a handful of other countries — it isn't a standard merchant payment rail in Bahrain. What I built instead is a WhatsApp link for GPay requests, but in practice this only works if your customer happens to have a GPay method that can send to you internationally. Don't advertise this as a first-class option unless you've tested it with a real Bahraini customer's GPay app.

**Razorpay (not usable for a Bahrain-registered store)**
Razorpay's international-payments feature requires merchants already registered on Razorpay's domestic Indian platform with an Indian business address. It isn't something you can sign up for directly as a Bahrain-based merchant to receive BHD. If you or a partner have an Indian business entity it could work as a secondary route — otherwise lean on BenefitPay + COD, and add a proper **Benefit (BENEFIT company) merchant gateway or a Gulf-friendly gateway like Tap Payments or MyFatoorah** later for automatic card payments.

**If you later want automatic (non-manual) card payments:** Tap Payments and MyFatoorah both support Bahrain/GCC merchants directly in BHD with pay-as-you-go pricing (no monthly fee), which is the natural next step once BenefitPay-via-WhatsApp becomes too manual for your order volume.

---

## Limitations worth knowing (so nothing surprises you)

- **Apps Script free quotas**: ~20,000 requests/day and it can feel slightly slow (1–2s) on first load — completely fine for a small store, worth knowing if you scale up fast.
- **Admin password** is a simple shared password, not per-user accounts — fine for a solo seller, not for a team with different permission levels.
- **Customer accounts** use a lightweight salted-hash scheme suitable for "recognize a returning customer at checkout" — it is not the same level of security as a dedicated identity provider, so don't store anything more sensitive than name/email/phone in that sheet.
- **No real-time payment verification** — every online payment method here ends in a human (you) marking it paid. That's the tradeoff for $0 cost.
- Sample placeholder products appear if `API_URL` isn't set yet — replace them via the admin panel.

## Files
- `index.html` — the storefront customers see
- `admin.html` — your private management page
- `backend-Code.gs` — paste into Google Apps Script
- `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, `site.webmanifest` — favicon set, upload alongside `index.html`
