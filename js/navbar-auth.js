function truncateEmail(email, maxLocal = 10) {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const trimmed = local.length > maxLocal ? local.slice(0, maxLocal) + "…" : local;
    return `${trimmed}@${domain}`;
}

function getLoginLink() {
    return document.querySelector('.header-actions a[href="login.html"], .header-actions a[href^="login.html?"]');
}

function getOrCreateLogoutButton() {
    let btn = document.getElementById("nav-logout-btn");
    if (btn) return btn;

    const cartBtn = document.getElementById("cart-toggle");
    const actions = document.querySelector(".header-actions");
    if (!actions) return null;

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "nav-logout-btn";
    btn.className = "btn ghost nav-logout-btn";
    btn.textContent = "Logout";
    btn.hidden = true;

    btn.addEventListener("click", async () => {
        const client = window.NovaAuth?.createSupabaseClient?.();
        btn.disabled = true;
        try {
            if (window.NovaCart?.prepareForLogout) {
                await window.NovaCart.prepareForLogout();
            }
            if (client) await client.auth.signOut();
            window.NovaAuth?.clearAuthCache?.();
            window.dispatchEvent(new CustomEvent("nova:auth-changed", { detail: { user: null } }));

            if (window.location.pathname.endsWith("/login.html")) {
                window.location.href = "index.html";
            }
        } finally {
            btn.disabled = false;
        }
    });

    actions.insertBefore(btn, cartBtn || null);
    return btn;
}

async function refreshNavbarAuth(forceRefresh = false) {
    const user = await window.NovaAuth?.getCurrentUser({ forceRefresh });

    const badge = document.getElementById("nav-user-badge");
    const emailEl = document.getElementById("nav-user-email-text");
    const loginLink = getLoginLink();
    const logoutBtn = getOrCreateLogoutButton();

    if (!badge || !emailEl) return;

    if (user) {
        const dict = (typeof translations !== "undefined" && translations)
            ? (translations[localStorage.getItem("lang") || "en"] || translations.en)
            : {};
        const label = dict["nav.logged_in_as"] || "Logged in as";

        emailEl.textContent = truncateEmail(user.email);
        badge.title = `${label}: ${user.email}`;
        badge.hidden = false;
        if (loginLink) loginLink.hidden = true;
        if (logoutBtn) logoutBtn.hidden = false;
    } else {
        badge.hidden = true;
        if (loginLink) loginLink.hidden = false;
        if (logoutBtn) logoutBtn.hidden = true;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!window.NovaAuth) return;
    await refreshNavbarAuth();

    window.addEventListener("nova:auth-changed", () => refreshNavbarAuth(true));

    const langToggle = document.getElementById("lang-toggle");
    if (langToggle) {
        langToggle.addEventListener("click", () => setTimeout(() => refreshNavbarAuth(), 50));
    }
});
async function updateNavbarAuth() {
    const user = await window.NovaAuth?.getCurrentUser();

    const myOrdersBtn = document.getElementById("my-orders-btn");

    if (!myOrdersBtn) return;

    if (!user) {
        myOrdersBtn.style.display = "none";
    } else {
        myOrdersBtn.style.display = "block";
    }
}

document.addEventListener("DOMContentLoaded", updateNavbarAuth);
