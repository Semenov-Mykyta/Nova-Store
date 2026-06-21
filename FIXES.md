# NovaStore fixes

## GitHub Pages loading fix

The site could stay forever on the loading screen when third-party CDN scripts were slow or blocked.

Fixed by:

- making Supabase and EmailJS CDN scripts `async` so they no longer block local scripts;
- loading local JavaScript first;
- adding a critical inline loader fallback that hides the loader even if a CDN fails;
- making Supabase-dependent code wait for the async Supabase script instead of exiting permanently;
- keeping local fallback products so the shop/home page can still render without Supabase.

## Profile dropdown

`My orders` was removed from the top navigation and moved into the profile dropdown together with `Logout`.

The dropdown:

- opens by clicking the logged-in profile badge;
- closes when clicking outside;
- closes with `Esc`;
- updates labels when the language changes.
