# Fixes applied

- Made Supabase session loading safer so CDN/network or Supabase errors do not break the whole site.
- Fixed auth redirect URLs so they work from subfolders, not only from the domain root.
- Protected login redirect `next` handling from external absolute URLs.
- Fixed shop category links (`shop.html?category=tech/accessories`) so the category filter is selected automatically.
- Added safer HTML escaping for product cards and cart rows rendered with JavaScript.
- Added EmailJS missing-library checks on the support form and checkout flow instead of crashing.
- Changed checkout store inbox from placeholder `store@example.com` to the visible site support email `support@novastore.app`.
- Fixed checkout cart clearing by using the central `saveCart([])` path, keeping UI/localStorage/server sync consistent.
- Kept the login/logout button visible on mobile instead of hiding auth access on small screens.

Validation:

- `node --check` passes for all JavaScript files.
- Local linked files and assets were checked statically.

## Cart merge restored safely
- Restored guest cart + account cart merge on login.
- Added a per-user localStorage marker (`novastore_cart_merge_done_<userId>`) so the guest cart is merged only once.
- Added an in-page refresh lock so `handleLogin()` and `nova:auth-changed` cannot merge the same cart twice.
- After a successful merge/save, the guest cart backup is cleared to prevent duplicate merges on another page load.

## Guest cart disabled
- Cart is now available only for logged-in users.
- Anonymous users are redirected to login when they click Add to cart.
- Guest/local carts are no longer saved or merged into account carts.
- Account carts still load from and save to Supabase normally.


## Password reset

Added `password-reset.html` and `js/password-reset.js`. The login forgot-password flow now redirects Supabase recovery links to `password-reset.html`.
