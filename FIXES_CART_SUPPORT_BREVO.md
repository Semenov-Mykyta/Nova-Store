# Cart + Support Brevo Fixes

## Fixed

- Restored the original cart sidebar UI classes:
  - `cart-item-title`
  - `cart-item-controls`
  - `btn-icon`
- Removed frontend EmailJS usage from checkout.
- Removed EmailJS CDN script tags from HTML pages.
- Checkout now only calls the Supabase `checkout` Edge Function.
- Checkout Edge Function now sends:
  - store order email to `ORDER_EMAIL`
  - customer confirmation email to the logged-in customer
- Support Edge Function now sends:
  - support request to `SUPPORT_EMAIL`
  - English auto-reply to the customer
- Support email failure is no longer hidden. If the email to `SUPPORT_EMAIL` fails, the function returns an error instead of pretending success.
- Added HTML escaping in support and checkout email templates.

## Deploy required

After uploading these files, redeploy both functions:

```bash
supabase functions deploy checkout
supabase functions deploy support
```

Then push frontend changes:

```bash
git add .
git commit -m "Fix cart UI and Brevo support checkout emails"
git push
```
