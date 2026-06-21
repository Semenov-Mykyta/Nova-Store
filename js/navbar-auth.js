function truncateEmail(email, maxLocal = 10) {
    const [local, domain] = String(email || "").split("@");
    if (!domain) return email || "Account";
    const trimmed = local.length > maxLocal ? local.slice(0, maxLocal) + "…" : local;
    return `${trimmed}@${domain}`;
}

function getLoginLink() {
    return document.querySelector('.header-actions a[href="login.html"], .header-actions a[href^="login.html?"]');
}

function getTranslation(key, fallback) {
    const lang = localStorage.getItem("lang") || "en";
    const dict = (typeof translations !== "undefined" && translations)
        ? (translations[lang] || translations.en || {})
        : {};

    return dict[key] || fallback;
}

function hideTopOrdersLink() {
    const link = document.getElementById("my-orders-link");
    if (!link) return;

    link.hidden = true;
    link.style.display = "none";
}

function closeProfileDropdown() {
    const menu = document.getElementById("nav-profile-menu");
    const dropdown = document.getElementById("nav-profile-dropdown");
    const toggle = document.getElementById("nav-profile-toggle");

    if (dropdown) dropdown.hidden = true;
    if (menu) menu.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function setLogoutLoading(isLoading) {
    const btn = document.getElementById("nav-logout-btn");
    if (!btn) return;

    btn.disabled = isLoading;
    btn.classList.toggle("is-loading", isLoading);
}

async function handleNavbarLogout() {
    const client = window.NovaAuth?.createSupabaseClient?.();

    setLogoutLoading(true);

    try {
        if (window.NovaCart?.prepareForLogout) {
            await window.NovaCart.prepareForLogout();
        }

        if (client) {
            await client.auth.signOut();
        }

        window.NovaAuth?.clearAuthCache?.();
        closeProfileDropdown();

        window.dispatchEvent(new CustomEvent("nova:auth-changed", {
            detail: { user: null }
        }));

        if (window.location.pathname.endsWith("/login.html")) {
            window.location.href = window.NovaAuth?.getPageUrl?.("index.html") || "index.html";
        }
    } finally {
        setLogoutLoading(false);
    }
}

function getOrCreateProfileMenu() {
    let menu = document.getElementById("nav-profile-menu");
    if (menu) return menu;

    const actions = document.querySelector(".header-actions");
    if (!actions) return null;

    const legacyBadge = document.getElementById("nav-user-badge");
    if (legacyBadge) legacyBadge.remove();

    menu = document.createElement("div");
    menu.id = "nav-profile-menu";
    menu.className = "nav-profile-menu";
    menu.hidden = true;
    menu.innerHTML = `
        <button class="nav-user-badge" id="nav-profile-toggle" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="nav-user-dot"></span>
            <span class="nav-profile-icon" aria-hidden="true">👤</span>
            <span class="nav-user-email-text" id="nav-user-email-text"></span>
            <span class="nav-profile-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="nav-profile-dropdown" id="nav-profile-dropdown" hidden>
            <a class="nav-profile-dropdown-item" id="nav-dropdown-orders" href="my-orders.html"></a>
            <button class="nav-profile-dropdown-item nav-profile-logout" id="nav-logout-btn" type="button"></button>
        </div>
    `;

    const cartBtn = document.getElementById("cart-toggle");
    actions.insertBefore(menu, cartBtn || null);

    const toggle = menu.querySelector("#nav-profile-toggle");
    const dropdown = menu.querySelector("#nav-profile-dropdown");
    const logoutBtn = menu.querySelector("#nav-logout-btn");

    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = dropdown.hidden;

        dropdown.hidden = !willOpen;
        menu.classList.toggle("open", willOpen);
        toggle.setAttribute("aria-expanded", String(willOpen));
    });

    logoutBtn.addEventListener("click", handleNavbarLogout);

    document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) {
            closeProfileDropdown();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeProfileDropdown();
        }
    });

    return menu;
}

function updateProfileMenuLabels() {
    const ordersLink = document.getElementById("nav-dropdown-orders");
    const logoutBtn = document.getElementById("nav-logout-btn");

    if (ordersLink) ordersLink.textContent = getTranslation("nav.orders", "My orders");
    if (logoutBtn) logoutBtn.textContent = getTranslation("dashboard.logout", "Logout");
}

async function refreshNavbarAuth(forceRefresh = false) {
    hideTopOrdersLink();

    if (!window.NovaAuth) return;

    const user = await window.NovaAuth.getCurrentUser({ forceRefresh });
    const loginLink = getLoginLink();
    const menu = getOrCreateProfileMenu();

    if (!menu) return;

    const emailEl = document.getElementById("nav-user-email-text");
    const toggle = document.getElementById("nav-profile-toggle");

    updateProfileMenuLabels();

    if (user) {
        const label = getTranslation("nav.logged_in_as", "Logged in as");

        emailEl.textContent = truncateEmail(user.email);
        toggle.title = `${label}: ${user.email}`;
        menu.hidden = false;

        if (loginLink) loginLink.hidden = true;
    } else {
        menu.hidden = true;
        closeProfileDropdown();

        if (loginLink) loginLink.hidden = false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    hideTopOrdersLink();

    if (!window.NovaAuth) return;

    await refreshNavbarAuth();

    window.addEventListener("nova:auth-changed", () => refreshNavbarAuth(true));

    const langToggle = document.getElementById("lang-toggle");
    if (langToggle) {
        langToggle.addEventListener("click", () => setTimeout(() => refreshNavbarAuth(), 50));
    }
});
