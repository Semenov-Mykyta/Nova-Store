/* =========================
   CART CORE (BREVO READY)
========================= */

const CART_KEY = "novastore_cart";
const GUEST_CART_BACKUP_KEY = "novastore_guest_cart_backup";
const CART_OWNER_KEY = "novastore_cart_owner";

let cartRefreshPromise = null;
let cartCurrentUserId = null;

/* =========================
   UTIL
========================= */

function safeJsonParse(value, fallback = []) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeQty(value) {
    const qty = Number(value);
    if (!Number.isFinite(qty)) return 1;
    return Math.max(1, Math.min(99, Math.floor(qty)));
}

function toMoney(value) {
    return `€${Number(value || 0).toFixed(2)}`;
}

/* =========================
   CART NORMALIZATION
========================= */

function normalizeCartItem(item) {
    if (!item || !item.id) return null;

    return {
        id: String(item.id),
        title: String(item.title || item.name || "Product"),
        price: Number(item.price || 0),
        qty: normalizeQty(item.qty || item.quantity || 1),
        image: item.image || null
    };
}

function normalizeCart(cart) {
    if (!Array.isArray(cart)) return [];

    const map = new Map();

    for (const raw of cart) {
        const item = normalizeCartItem(raw);
        if (!item) continue;

        const existing = map.get(item.id);

        if (existing) {
            existing.qty = normalizeQty(existing.qty + item.qty);
        } else {
            map.set(item.id, item);
        }
    }

    return Array.from(map.values());
}

/* =========================
   AUTH HELPERS
========================= */

async function getCurrentUser() {
    return await window.NovaAuth?.getCurrentUser?.();
}

/* =========================
   LOCAL STORAGE CART
========================= */

function getCart() {
    return normalizeCart(safeJsonParse(localStorage.getItem(CART_KEY)));
}

function setLocalCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(normalizeCart(cart)));
}

function clearLocalCart() {
    localStorage.removeItem(CART_KEY);
}

function setCartOwner(userId) {
    if (userId) {
        localStorage.setItem(CART_OWNER_KEY, userId);
    } else {
        localStorage.removeItem(CART_OWNER_KEY);
    }
}

/* =========================
   SERVER CART
========================= */

async function loadCartFromServer(userId) {
    if (!window.supabaseClient || !userId) return [];

    const { data, error } = await window.supabaseClient
        .from("carts")
        .select("items")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Cart load error:", error);
        return [];
    }

    return normalizeCart(data?.items || []);
}

async function saveCartToServer(userId, cart) {
    if (!window.supabaseClient || !userId) return false;

    const { error } = await window.supabaseClient
        .from("carts")
        .upsert({
            user_id: userId,
            items: normalizeCart(cart),
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error("Cart save error:", error);
        return false;
    }

    return true;
}

/* =========================
   CART SYNC
========================= */

async function saveCart(cart) {
    const safe = normalizeCart(cart);
    setLocalCart(safe);

    const user = await getCurrentUser();

    if (user?.id) {
        cartCurrentUserId = user.id;
        setCartOwner(user.id);
        await saveCartToServer(user.id, safe);
    }

    updateCartCount();
    renderCartSidebar();
}

async function refreshCartForUser(user) {
    if (cartRefreshPromise) return cartRefreshPromise;

    cartRefreshPromise = (async () => {
        if (!user?.id) {
            cartCurrentUserId = null;
            setCartOwner(null);
            clearLocalCart();
            updateCartCount();
            renderCartSidebar();
            return [];
        }

        const serverCart = await loadCartFromServer(user.id);

        cartCurrentUserId = user.id;
        setCartOwner(user.id);
        setLocalCart(serverCart);

        updateCartCount();
        renderCartSidebar();

        return serverCart;
    })();

    try {
        return await cartRefreshPromise;
    } finally {
        cartRefreshPromise = null;
    }
}

/* =========================
   CART ACTIONS
========================= */

async function addToCart(product) {
    const user = await getCurrentUser();

    if (!user?.id) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.href = `login.html?next=${next}`;
        return;
    }

    const item = normalizeCartItem(product);
    if (!item) return;

    const cart = getCart();
    const existing = cart.find(i => i.id === item.id);

    if (existing) {
        existing.qty = normalizeQty(existing.qty + item.qty);
    } else {
        cart.push(item);
    }

    await saveCart(cart);
}

function removeFromCart(id) {
    const cart = getCart().filter(i => i.id !== id);
    saveCart(cart);
}

function updateQty(id, qty) {
    const cart = getCart();
    const item = cart.find(i => i.id === id);

    if (!item) return;

    item.qty = normalizeQty(qty);
    saveCart(cart);
}

/* =========================
   UI
========================= */

function getCartTotal() {
    return getCart().reduce((sum, item) => {
        return sum + item.price * normalizeQty(item.qty);
    }, 0);
}

function updateCartCount() {
    const el = document.getElementById("cart-count");
    if (!el) return;

    el.textContent = getCart().reduce((s, i) => s + normalizeQty(i.qty), 0);
}

function renderCartSidebar() {
    const container = document.getElementById("cart-items");
    const totalEl = document.getElementById("cart-total-amount");

    if (!container || !totalEl) return;

    const cart = getCart();
    container.innerHTML = "";

    if (!cartCurrentUserId) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Please log in to use cart</p>
            </div>
        `;
    } else if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Your cart is empty</p>
            </div>
        `;
    } else {
        cart.forEach(item => {
            const row = document.createElement("div");
            row.className = "cart-item";

            row.innerHTML = `
                <div>
                    <div>${escapeHtml(item.title)}</div>
                    <small>${toMoney(item.price)}</small>
                </div>

                <div>
                    <button class="cart-minus" data-id="${item.id}">-</button>
                    <span>${item.qty}</span>
                    <button class="cart-plus" data-id="${item.id}">+</button>
                    <button class="cart-remove" data-id="${item.id}">x</button>
                </div>
            `;

            container.appendChild(row);
        });
    }

    totalEl.textContent = toMoney(getCartTotal());

    container.querySelectorAll(".cart-minus").forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            const cart = getCart();
            const item = cart.find(i => i.id === id);
            if (!item) return;
            item.qty = Math.max(1, item.qty - 1);
            saveCart(cart);
        };
    });

    container.querySelectorAll(".cart-plus").forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            const cart = getCart();
            const item = cart.find(i => i.id === id);
            if (!item) return;
            item.qty++;
            saveCart(cart);
        };
    });

    container.querySelectorAll(".cart-remove").forEach(btn => {
        btn.onclick = () => removeFromCart(btn.dataset.id);
    });
}

/* =========================
   CHECKOUT (EDGE FUNCTION ONLY)
========================= */

async function checkout() {
    const user = await getCurrentUser();

    if (!user?.id) {
        window.location.href = "login.html";
        return;
    }

    const cart = getCart();

    const { data, error } = await window.supabaseClient.functions.invoke("checkout", {
        body: {
            items: cart.map(i => ({
                id: i.id,
                qty: i.qty
            }))
        }
    });

    if (error) {
        console.error(error);
        alert("Checkout failed");
        return;
    }

    await saveCart([]);
    alert(`Order created: #${data.order_id}`);
}

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
    updateCartCount();
    renderCartSidebar();

    const btn = document.querySelector(".cart-footer .btn.primary");
    if (btn) btn.onclick = checkout;

    const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });
    await refreshCartForUser(user);

    window.addEventListener("nova:auth-changed", async (e) => {
        const user = e.detail?.user || null;
        await refreshCartForUser(user);
    });
});