# Out of Memory fix

Fixed `js/auth-core.js`.

Root cause: recovery-session cleanup could call `supabase.auth.signOut()` while the recovery flag was still set. The Supabase `SIGNED_OUT` auth event then entered the same cleanup again, creating an auth loop that could crash Chrome with `Aw, Snap! Error code: Out of Memory`.

What changed:
- Recovery flag is cleared BEFORE `signOut()`.
- Added `window.__novaRecoveryClearInProgress` guard.
- `SIGNED_OUT` events during cleanup no longer start another cleanup.
- The recovery session is still allowed on `password-reset.html`, but cannot behave like a normal login on other pages.

After deploying:
1. Hard refresh with Ctrl+F5.
2. If the browser still crashes, clear site data for the domain:
   DevTools → Application → Storage → Clear site data.
3. Send a new password reset email; old links may be expired or cached.
