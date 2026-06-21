const THEME_KEY = "novastore_theme";
const THEME_TRANSITION_MS = 420;

let themeTransitionTimer = null;
let PRODUCTS = [];

/**
 * Updates all theme icons on the page
 */
function updateThemeIcons(theme) {
    document.querySelectorAll(".theme-icon").forEach((icon) => {
        icon.textContent = theme === "light" ? "☀️" : "🌙";
    });
}

/**
 * Applies the selected theme and saves it in localStorage
 */
function applyTheme(theme, options = {}) {
    const safeTheme = theme === "light" ? "light" : "dark";
    const root = document.documentElement;

    const shouldAnimate =
        options.animate === true &&
        root.classList.contains("theme-ready");

    if (shouldAnimate) {
        root.classList.add("theme-switching");
    }

    root.setAttribute("data-theme", safeTheme);
    localStorage.setItem(THEME_KEY, safeTheme);
    updateThemeIcons(safeTheme);

    if (shouldAnimate) {
        clearTimeout(themeTransitionTimer);

        themeTransitionTimer = setTimeout(() => {
            root.classList.remove("theme-switching");
        }, THEME_TRANSITION_MS);
    }
}

/**
 * Loads saved theme or falls back to OS preference
 */
function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);

    if (stored === "light" || stored === "dark") {
        applyTheme(stored, { animate: false });
    } else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        applyTheme(prefersDark ? "dark" : "light", { animate: false });
    }

    requestAnimationFrame(() => {
        document.documentElement.classList.add("theme-ready");
    });
}

/**
 * Switches between dark and light theme
 */
function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = current === "dark" ? "light" : "dark";

    applyTheme(nextTheme, { animate: true });
}

/**
 * Initializes navbar, cart sidebar and theme button
 */
function initHeader() {
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    const themeToggle = document.getElementById("theme-toggle");
    const cartToggle = document.getElementById("cart-toggle");
    const cartSidebar = document.getElementById("cart-sidebar");
    const cartClose = document.getElementById("cart-close");

    if (burger && nav) {
        burger.addEventListener("click", () => {
            nav.classList.toggle("open");
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener("click", toggleTheme);
    }

    if (cartToggle && cartSidebar) {
        cartToggle.addEventListener("click", () => {
            cartSidebar.classList.add("open");
        });
    }

    if (cartClose && cartSidebar) {
        cartClose.addEventListener("click", () => {
            cartSidebar.classList.remove("open");
        });
    }
}

/**
 * Shows or hides My Orders link depending on auth state
 */
async function updateMyOrdersVisibility() {
    const link = document.getElementById("my-orders-link");
    if (!link) return;

    const user = await window.NovaAuth?.getCurrentUser?.();

    link.hidden = !user;
    link.style.display = user ? "inline-block" : "none";
}

/**
 * Hides the page loader after all resources have finished loading
 */
function initLoader() {
    const loader = document.getElementById("page-loader");
    if (!loader) return;

    let hidden = false;

    function hideLoader() {
        if (hidden) return;
        hidden = true;
        setTimeout(() => loader.classList.add("hidden"), 250);
    }

    if (document.readyState === "complete") {
        hideLoader();
    } else {
        window.addEventListener("load", hideLoader, { once: true });
    }

    // Safety fallback: CDN scripts/images can occasionally delay the load event.
    // The site should still become visible.
    setTimeout(hideLoader, 1600);
}

/**
 * Inserts the current year into the footer
 */
function initYear() {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/**
 * Returns the product description for the currently selected language
 */
function productDesc(p) {
    const lang = localStorage.getItem("lang") || "en";
    return (lang === "de" && p.description_de) ? p.description_de : p.description;
}

/**
 * Shows a temporary toast notification with the given message
 */
function showToast(msg) {
    let toast = document.getElementById("nova-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "nova-toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.classList.add("show");

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Generates an HTML star rating string for the given numeric rating
 */
function starRating(rating) {
    const safeRating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
}

/**
 * Attaches a ripple animation to all elements with the "ripple" class
 */
function initRipple() {
    document.body.addEventListener("click", (e) => {
        const target = e.target.closest(".ripple");
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        target.style.setProperty("--ripple-x", `${x}px`);
        target.style.setProperty("--ripple-y", `${y}px`);
    });
}

/**
 * Waits until auth-core.js creates the Supabase client
 */
async function waitForSupabaseClient() {
    for (let i = 0; i < 30; i++) {
        if (window.supabaseClient) return window.supabaseClient;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}

/**
 * Loads products from Supabase instead of hardcoded frontend array
 */
async function loadProductsFromSupabase() {
    const client = await waitForSupabaseClient();

    if (!client) {
        console.error("Supabase client is not initialized");
        PRODUCTS = [];
        return [];
    }

    let data = null;
    let error = null;

    // Preferred schema: products has description_de, category, rating and is_active.
    const fullQuery = await client
        .from("products")
        .select("id, name, description, description_de, price, category, image, rating, created_at, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

    if (!fullQuery.error) {
        data = fullQuery.data;
    } else {
        // Fallback for the older/minimal products table:
        // id, name, description, price, image, created_at.
        console.warn("Full products query failed, trying minimal products schema:", fullQuery.error);

        const minimalQuery = await client
            .from("products")
            .select("id, name, description, price, image, created_at")
            .order("created_at", { ascending: true });

        data = minimalQuery.data;
        error = minimalQuery.error;
    }

    if (error) {
        console.error("Could not load products from Supabase:", error);
        PRODUCTS = [];
        return [];
    }

    PRODUCTS = (data || []).map((p) => ({
        id: String(p.id),
        title: p.name || "Untitled product",
        description: p.description || "",
        description_de: p.description_de || p.description || "",
        price: Number(p.price || 0),
        category: p.category || "tech",
        image: p.image || "assets/logo.svg",
        rating: Number(p.rating || 4),
        created_at: p.created_at
    }));

    return PRODUCTS;
}

/**
 * Renders all products on the shop page with search, category filter and sorting
 */
function renderShopProducts() {
    const container = document.getElementById("shop-products");
    if (!container) return;

    const searchInput = document.getElementById("product-search");
    const categoryFilter = document.getElementById("category-filter");
    const sortSelect = document.getElementById("sort-by");

    const initialCategory = new URLSearchParams(window.location.search).get("category");

    if (
        categoryFilter &&
        initialCategory &&
        [...categoryFilter.options].some((option) => option.value === initialCategory)
    ) {
        categoryFilter.value = initialCategory;
    }

    function applyFilters() {
        let list = [...PRODUCTS];

        const query = (searchInput?.value || "").toLowerCase().trim();

        if (query) {
            list = list.filter((p) => {
                return (
                    p.title.toLowerCase().includes(query) ||
                    p.description.toLowerCase().includes(query) ||
                    p.category.toLowerCase().includes(query)
                );
            });
        }

        const category = categoryFilter?.value || "all";

        if (category !== "all") {
            list = list.filter((p) => p.category === category);
        }

        const sort = sortSelect?.value || "featured";

        if (sort === "price_asc") {
            list.sort((a, b) => a.price - b.price);
        }

        if (sort === "price_desc") {
            list.sort((a, b) => b.price - a.price);
        }

        container.innerHTML = "";

        if (PRODUCTS.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No products available yet.</p>
                </div>
            `;
            return;
        }

        if (list.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No products found.</p>
                    <a href="shop.html" class="btn ghost">Clear search</a>
                </div>
            `;
            return;
        }

        list.forEach((p) => {
            const stars = starRating(p.rating || 4);
            const card = document.createElement("article");

            card.className = "product-card glass-card hover-lift";
            card.innerHTML = `
                <div class="product-image">
                    <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" />
                </div>

                <div class="product-body">
                    <h3 class="product-title">${escapeHtml(p.title)}</h3>
                    <p class="product-category">${escapeHtml(p.category.toUpperCase())}</p>
                    <p class="product-stars">${escapeHtml(stars)}</p>
                    <p class="product-desc">${escapeHtml(productDesc(p))}</p>

                    <div class="product-meta">
                        <span class="product-price">€${Number(p.price).toFixed(2).replace(/\.00$/, "")}</span>

                        <button
                            class="btn small primary add-to-cart"
                            data-id="${escapeHtml(p.id)}"
                            data-title="${escapeHtml(p.title)}"
                            data-price="${Number(p.price).toFixed(2)}"
                        >
                            Add to cart
                        </button>
                    </div>
                </div>
            `;

            card.addEventListener("click", (e) => {
                if (e.target.closest(".add-to-cart")) return;
                window.location.href = `product.html?id=${encodeURIComponent(p.id)}`;
            });

            container.appendChild(card);
        });

        container.querySelectorAll(".add-to-cart").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();

                const id = btn.getAttribute("data-id");
                const title = btn.getAttribute("data-title");
                const price = Number(btn.getAttribute("data-price"));

                const added = await addToCart({ id, title, price, qty: 1 });

                if (added) {
                    showToast(`✓ ${title} added to cart`);
                }
            });
        });
    }

    ["input", "change"].forEach((eventName) => {
        searchInput?.addEventListener(eventName, applyFilters);
        categoryFilter?.addEventListener(eventName, applyFilters);
        sortSelect?.addEventListener(eventName, applyFilters);
    });

    applyFilters();
}

/**
 * Populates and initializes the individual product detail page
 */
function initProductPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    const product = PRODUCTS.find((p) => p.id === id) || PRODUCTS[0];

    const layout = document.querySelector(".product-layout");

    if (!product) {
        if (layout) {
            layout.innerHTML = `
                <div class="empty-state">
                    <h2>Product not found</h2>
                    <p>This product is unavailable or was removed.</p>
                    <a href="shop.html" class="btn primary">Back to shop</a>
                </div>
            `;
        }
        return;
    }

    const titleEl = document.getElementById("product-title");
    const priceEl = document.getElementById("product-price");
    const categoryEl = document.getElementById("product-category");
    const descEl = document.getElementById("product-description");
    const imgEl = document.getElementById("product-main-img");
    const addBtn = document.getElementById("product-add-to-cart");
    const qtyInput = document.getElementById("product-qty");
    const relatedContainer = document.getElementById("related-products");

    if (titleEl) titleEl.textContent = product.title;
    if (priceEl) priceEl.textContent = `€${Number(product.price).toFixed(2).replace(/\.00$/, "")}`;
    if (categoryEl) categoryEl.textContent = product.category.toUpperCase();
    if (descEl) descEl.textContent = productDesc(product);

    const starsEl = document.getElementById("product-stars");
    if (starsEl) starsEl.textContent = starRating(product.rating || 4);

    if (imgEl && product.image) {
        imgEl.src = product.image;
        imgEl.alt = product.title;
    }

    if (addBtn) {
        addBtn.setAttribute("data-product-id", product.id);
    }

    if (addBtn && qtyInput) {
        addBtn.addEventListener("click", async () => {
            const qty = Math.max(1, Number(qtyInput.value) || 1);

            const added = await addToCart({
                id: product.id,
                title: product.title,
                price: product.price,
                qty
            });

            if (added) {
                showToast(`✓ ${product.title} added to cart`);
            }
        });
    }

    document.querySelector(".qty-minus")?.addEventListener("click", () => {
        if (!qtyInput) return;
        const val = Math.max(1, Number(qtyInput.value) - 1);
        qtyInput.value = val;
    });

    document.querySelector(".qty-plus")?.addEventListener("click", () => {
        if (!qtyInput) return;
        const val = Number(qtyInput.value) + 1;
        qtyInput.value = val;
    });

    if (relatedContainer) {
        const related = PRODUCTS
            .filter((p) => p.id !== product.id)
            .slice(0, 3);

        relatedContainer.innerHTML = "";

        related.forEach((p) => {
            const card = document.createElement("article");

            card.className = "product-card glass-card hover-lift";
            card.innerHTML = `
                <div class="product-image">
                    <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" />
                </div>

                <div class="product-body">
                    <h3 class="product-title">${escapeHtml(p.title)}</h3>
                    <p class="product-category">${escapeHtml(p.category)}</p>
                    <p class="product-desc">${escapeHtml(productDesc(p))}</p>

                    <div class="product-meta">
                        <span class="product-price">€${Number(p.price).toFixed(2).replace(/\.00$/, "")}</span>

                        <button
                            class="btn small primary add-to-cart"
                            data-id="${escapeHtml(p.id)}"
                            data-title="${escapeHtml(p.title)}"
                            data-price="${Number(p.price).toFixed(2)}"
                        >
                            Add to cart
                        </button>
                    </div>
                </div>
            `;

            card.addEventListener("click", (e) => {
                if (e.target.closest(".add-to-cart")) return;
                window.location.href = `product.html?id=${encodeURIComponent(p.id)}`;
            });

            relatedContainer.appendChild(card);
        });

        relatedContainer.querySelectorAll(".add-to-cart").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();

                const id = btn.getAttribute("data-id");
                const title = btn.getAttribute("data-title");
                const price = Number(btn.getAttribute("data-price"));

                const added = await addToCart({ id, title, price, qty: 1 });

                if (added) {
                    showToast(`✓ ${title} added to cart`);
                }
            });
        });
    }
}

/**
 * Renders featured products on the homepage
 */
function renderFeaturedProducts() {
    const container = document.getElementById("featured-products");
    if (!container) return;

    container.innerHTML = "";

    if (PRODUCTS.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No featured products available yet.</p>
            </div>
        `;
        return;
    }

    const featured = PRODUCTS.slice(0, 3);

    featured.forEach((p) => {
        const card = document.createElement("article");

        card.className = "product-card glass-card hover-lift";
        card.innerHTML = `
            <div class="product-image">
                <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" />
            </div>

            <div class="product-body">
                <h3 class="product-title">${escapeHtml(p.title)}</h3>
                <p class="product-category">${escapeHtml(p.category.toUpperCase())}</p>
                <p class="product-stars">${escapeHtml(starRating(p.rating || 4))}</p>
                <p class="product-desc">${escapeHtml(productDesc(p))}</p>

                <div class="product-meta">
                    <span class="product-price">€${Number(p.price).toFixed(2).replace(/\.00$/, "")}</span>
                    <a href="product.html?id=${encodeURIComponent(p.id)}" class="btn small primary">View</a>
                </div>
            </div>
        `;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".btn")) return;
            window.location.href = `product.html?id=${encodeURIComponent(p.id)}`;
        });

        container.appendChild(card);
    });
}

/**
 * Initialize all page components once the DOM is ready
 */
document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initHeader();
    initLoader();
    initYear();
    initRipple();
    updateMyOrdersVisibility();

    await loadProductsFromSupabase();

    if (document.getElementById("featured-products")) {
        renderFeaturedProducts();
    }

    if (document.getElementById("shop-products")) {
        renderShopProducts();
    }

    if (document.querySelector(".product-layout")) {
        initProductPage();
    }
});

window.addEventListener("nova:auth-changed", updateMyOrdersVisibility);