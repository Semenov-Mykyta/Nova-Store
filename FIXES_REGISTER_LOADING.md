# Fixes applied

- Fixed the Register tab on `login.html`: auth tabs now switch correctly between login/register forms.
- Reworked `js/auth.js` registration, login, forgot-password and logout handlers with validation and loading states.
- Fixed password reset cooldown bug where the forgot-password button was re-enabled after 1 second.
- Changed script loading order in all HTML pages: Supabase now loads before `auth-core.js`, using `defer` instead of late `async` loading.
- Added CSS fallback for `.page-loader` so the site cannot stay blank forever if JavaScript/CDN loading gets stuck.
- Kept `password-reset.html` isolated from cart/main/navbar shop logic.
- Ran `node --check` on all JS files: no syntax errors found.
