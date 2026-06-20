const CART_KEY = "novastore_cart";
const GUEST_CART_BACKUP_KEY = "novastore_guest_cart_backup";
const CART_OWNER_KEY = "novastore_cart_owner";

let cartRefreshPromise = null;
let cartCurrentUserId = null;

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

function interpolateText(text, params = {}) {
    let result = String(text ?? "");

    Object.entries(params).forEach(([key, value]) => {
        result = result.replaceAll(`{${key}}`, String(value ?? ""));
    });

    return result;
}

function translateCartText(key, params = {}, fallback = key) {
    if (typeof window.translate === "function") {
        const translated = window.translate(key, params);

        if (translated && translated !== key) {
            return translated;
        }
    }

    return interpolateText(fallback, params);
}

function toMoney(value) {
    return `€${Number(value || 0).toFixed(2)}`;
}

function normalizeQty(value) {
    const qty = Number(value);

    if (!Number.isFinite(qty)) return 1;

    return Math.max(1, Math.min(99, Math.floor(qty)));
}

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

    const merged = new Map();

    cart.forEach((rawItem) => {
        const item = normalizeCartItem(rawItem);
        if (!item) return;

        const existing = merged.get(item.id);

        if (existing) {
            existing.qty = normalizeQty(existing.qty + item.qty);
        } else {
            merged.set(item.id, item);
        }
    });

    return Array.from(merged.values());
}

async function getCurrentUser() {
    return await window.NovaAuth?.getCurrentUser?.();
}

async function getUserId() {
    const user = await getCurrentUser();
    return user?.id;
}

async function loadCartFromServer(userId) {
    if (!window.supabaseClient || !userId) return [];

    const { data, error } = await window.supabaseClient
        .from("carts")
        .select("items")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Could not load cart from Supabase:", error);
        return [];
    }

    return normalizeCart(data?.items || []);
}

async function saveCartToServer(userId, cart) {
    if (!window.supabaseClient || !userId) return false;

    const safeCart = normalizeCart(cart);

    const payload = {
        user_id: userId,
        items: safeCart,
        updated_at: new Date().toISOString()
    };

    const { error } = await window.supabaseClient
        .from("carts")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("Could not save cart to Supabase:", error);
        return false;
    }

    return true;
}

function getCart() {
    return normalizeCart(safeJsonParse(localStorage.getItem(CART_KEY)));
}

function setLocalCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(normalizeCart(cart)));
}

function clearLocalCart() {
    localStorage.removeItem(CART_KEY);
}

function clearGuestCartBackup() {
    localStorage.removeItem(GUEST_CART_BACKUP_KEY);
}

function getCartOwner() {
    return localStorage.getItem(CART_OWNER_KEY);
}

function setCartOwner(userId) {
    if (userId) {
        localStorage.setItem(CART_OWNER_KEY, userId);
    } else {
        localStorage.removeItem(CART_OWNER_KEY);
    }
}

function rememberGuestCart() {
    if (getCartOwner()) return;

    const cart = getCart();

    if (cart.length > 0) {
        localStorage.setItem(GUEST_CART_BACKUP_KEY, JSON.stringify(cart));
    }
}

async function syncCart() {
    const userId = await getUserId();
    if (!userId) return false;

    return await saveCartToServer(userId, getCart());
}

async function refreshCartForUser(user) {
    if (cartRefreshPromise) return cartRefreshPromise;

    cartRefreshPromise = (async () => {
        if (!user?.id) {
            cartCurrentUserId = null;
            setCartOwner(null);
            clearLocalCart();
            clearGuestCartBackup();
            updateCartCount();
            renderCartSidebar();
            return [];
        }

        const serverCart = await loadCartFromServer(user.id);

        cartCurrentUserId = user.id;
        setCartOwner(user.id);
        setLocalCart(serverCart);
        clearGuestCartBackup();

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

async function saveCart(cart) {
    const safeCart = normalizeCart(cart);
    setLocalCart(safeCart);

    const user = await getCurrentUser();

    if (user?.id) {
        cartCurrentUserId = user.id;
        setCartOwner(user.id);
        await saveCartToServer(user.id, safeCart);
    } else {
        cartCurrentUserId = null;
        setCartOwner(null);
        clearLocalCart();
        clearGuestCartBackup();
    }

    updateCartCount();
    renderCartSidebar();
}

async function addToCart(product) {
    const user = await getCurrentUser();

    if (!user?.id) {
        clearLocalCart();
        clearGuestCartBackup();
        updateCartCount();
        renderCartSidebar();

        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?next=${next}`;
        return false;
    }

    const item = normalizeCartItem(product);

    if (!item) {
        console.error("Invalid cart product:", product);
        return false;
    }

    cartCurrentUserId = user.id;
    setCartOwner(user.id);

    const cart = getCart();
    const existing = cart.find((cartItem) => cartItem.id === item.id);

    if (existing) {
        existing.qty = normalizeQty(existing.qty + item.qty);
    } else {
        cart.push(item);
    }

    await saveCart(cart);
    return true;
}

function removeFromCart(id) {
    const cart = getCart().filter((item) => item.id !== id);
    saveCart(cart);
}

function updateQty(id, qty) {
    const cart = getCart();
    const item = cart.find((cartItem) => cartItem.id === id);

    if (!item) return;

    item.qty = normalizeQty(qty);
    saveCart(cart);
}

function getCartTotal() {
    return getCart().reduce((sum, item) => {
        return sum + (Number(item.price) || 0) * normalizeQty(item.qty);
    }, 0);
}

function updateCartCount() {
    const countEl = document.getElementById("cart-count");
    if (!countEl) return;

    countEl.textContent = getCart().reduce((sum, item) => {
        return sum + normalizeQty(item.qty);
    }, 0);
}

function renderCartSidebar() {
    const container = document.getElementById("cart-items");
    const totalEl = document.getElementById("cart-total-amount");

    if (!container || !totalEl) return;

    const cart = getCart();
    container.innerHTML = "";

    if (!cartCurrentUserId) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);

        container.innerHTML = `
            <div class="empty-state">
                <p>${escapeHtml(translateCartText("cart.login_required", {}, "Log in to use the cart."))}</p>
                <a href="login.html?next=${next}" class="btn primary">
                    ${escapeHtml(translateCartText("nav.login", {}, "Login"))}
                </a>
            </div>
        `;
    } else if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>${escapeHtml(translateCartText("cart.empty", {}, "🛒 Your cart is empty."))}</p>
                <a href="shop.html" class="btn ghost">
                    ${escapeHtml(translateCartText("cart.browse_products", {}, "Browse products"))}
                </a>
            </div>
        `;
    } else {
        cart.forEach((item) => {
            const row = document.createElement("div");
            row.className = "cart-item";

            row.innerHTML = `
                <div>
                    <div class="cart-item-title">${escapeHtml(item.title)}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">
                        ${toMoney(item.price)}
                    </div>
                </div>

                <div class="cart-item-controls">
                    <button class="btn-icon cart-minus" data-id="${escapeHtml(item.id)}">−</button>
                    <span>${normalizeQty(item.qty)}</span>
                    <button class="btn-icon cart-plus" data-id="${escapeHtml(item.id)}">+</button>
                    <button class="btn-icon cart-remove" data-id="${escapeHtml(item.id)}">✕</button>
                </div>
            `;

            container.appendChild(row);
        });
    }

    totalEl.textContent = toMoney(getCartTotal());

    container.querySelectorAll(".cart-minus").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const cart = getCart();
            const item = cart.find((cartItem) => cartItem.id === id);

            if (!item) return;

            item.qty = Math.max(1, normalizeQty(item.qty) - 1);
            saveCart(cart);
        });
    });

    container.querySelectorAll(".cart-plus").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const cart = getCart();
            const item = cart.find((cartItem) => cartItem.id === id);

            if (!item) return;

            item.qty = normalizeQty(item.qty + 1);
            saveCart(cart);
        });
    });

    container.querySelectorAll(".cart-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
            removeFromCart(btn.getAttribute("data-id"));
        });
    });
}

/* EmailJS config */
const NOVA_ORDER_EMAILJS_PUBLIC_KEY = "zWpLd3YXblspaCcRc";
const NOVA_ORDER_EMAILJS_SERVICE_ID = "service_knm5jpr";
const NOVA_ORDER_EMAILJS_TEMPLATE_ID = "template_t7dqfdg";
const NOVA_ORDER_EMAILJS_CUSTOMER_TEMPLATE_ID = "template_t7dqfdg";
const STORE_EMAIL = "wehshopsupport844@gmail.com";

function initEmailJs() {
    if (typeof emailjs === "undefined") return false;

    if (!window.__novaEmailJsReady) {
        emailjs.init(NOVA_ORDER_EMAILJS_PUBLIC_KEY);
        window.__novaEmailJsReady = true;
    }

    return true;
}

function buildOrderMessage(cart, user, orderId, serverTotal) {
    const lines = cart.map((item) => {
        return `${item.title} × ${normalizeQty(item.qty)}`;
    });

    return [
        `Order ID: ${orderId}`,
        `Order date: ${new Date().toLocaleString()}`,
        `Customer email: ${user.email}`,
        "",
        "Items:",
        ...lines,
        "",
        `Total: ${toMoney(serverTotal ?? getCartTotal())}`
    ].join("\n");
}

function buildOrderItemsHtml(cart) {
    return cart.map((item) => {
        return `<li>${escapeHtml(item.title)} × ${normalizeQty(item.qty)}</li>`;
    }).join("");
}

async function sendOrderEmail({
                                  templateId,
                                  toEmail,
                                  emailType,
                                  orderId,
                                  cart,
                                  user,
                                  serverTotal
                              }) {
    const message = buildOrderMessage(cart, user, orderId, serverTotal);
    const total = toMoney(serverTotal ?? getCartTotal());

    return emailjs.send(NOVA_ORDER_EMAILJS_SERVICE_ID, templateId, {
        to_email: toEmail,
        email: toEmail,
        user_email: toEmail,
        customer_email: user.email,
        reply_to: user.email,
        from_email: user.email,
        name: user.email,
        user_name: user.email,
        subject: `NovaStore order ${orderId}`,
        order: orderId,
        order_id: orderId,
        order_type: emailType,
        message,
        order_message: message,
        items: message,
        items_html: buildOrderItemsHtml(cart),
        total,
        store_email: STORE_EMAIL
    });
}

async function createOrderWithEdgeFunction(cart) {
    if (!window.supabaseClient) {
        throw new Error("Supabase client is not available");
    }

    const payloadItems = normalizeCart(cart).map((item) => ({
        id: item.id,
        qty: normalizeQty(item.qty)
    }));

    const { data, error } = await window.supabaseClient.functions.invoke("checkout", {
        body: {
            items: payloadItems
        }
    });

    if (error) {
        let details = "";

        try {
            if (error.context && typeof error.context.json === "function") {
                const json = await error.context.json();
                details = json.details || json.error || JSON.stringify(json);
            } else if (error.context && typeof error.context.text === "function") {
                details = await error.context.text();
            }
        } catch {
            details = "";
        }

        console.error("Checkout Edge Function failed:", error, details);
        throw new Error(details || error.message || "Could not create order");
    }

    if (!data?.success) {
        console.error("Checkout Edge Function failed:", data);
        throw new Error(data?.details || data?.error || "Could not create order");
    }

    return data;
}

async function sendCheckoutEmails(cart, user, orderId, serverTotal) {
    if (!initEmailJs()) {
        throw new Error("EmailJS is not loaded");
    }

    const results = await Promise.allSettled([
        sendOrderEmail({
            templateId: NOVA_ORDER_EMAILJS_CUSTOMER_TEMPLATE_ID,
            toEmail: user.email,
            emailType: "customer",
            orderId,
            cart,
            user,
            serverTotal
        }),
        sendOrderEmail({
            templateId: NOVA_ORDER_EMAILJS_TEMPLATE_ID,
            toEmail: STORE_EMAIL,
            emailType: "store",
            orderId,
            cart,
            user,
            serverTotal
        })
    ]);

    const failed = results.filter((result) => result.status === "rejected");

    if (failed.length) {
        console.error("EmailJS checkout send failed:", failed);
        throw new Error("Could not send one or more order emails");
    }

    return true;
}

function renderCheckoutSuccess(container, orderId, email, emailSent) {
    if (!container) return;

    const title = translateCartText(
        "checkout.success_title",
        {},
        "Order placed! 🎉"
    );

    const text = translateCartText(
        "checkout.success_text",
        { orderId, email },
        "Order {orderId} was sent to {email} and the store."
    );

    const emailWarning = translateCartText(
        "checkout.email_warning",
        {},
        "The order was created, but the notification email could not be sent."
    );

    container.innerHTML = `
        <div class="checkout-success">
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(text)}</p>
            ${emailSent ? "" : `<p class="text-muted">${escapeHtml(emailWarning)}</p>`}
        </div>
    `;
}

function renderCheckoutError(container, err) {
    if (!container) return;

    console.error("Checkout failed:", err);

    const message = translateCartText(
        "checkout.error",
        {},
        "Could not create the order. Please try again."
    );

    container.insertAdjacentHTML("afterbegin", `
        <div class="checkout-error">
            <p>${escapeHtml(message)}</p>
        </div>
    `);
}

function initCheckout() {
    const btn = document.querySelector(".cart-footer .btn.primary");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const cart = getCart();

        if (cart.length === 0) return;

        const user =
            await window.NovaAuth?.requireAuth?.(false) ||
            await window.NovaAuth?.getCurrentUser?.();

        if (!user) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `login.html?next=${next}`;
            return;
        }

        const container = document.getElementById("cart-items");
        const totalEl = document.getElementById("cart-total-amount");
        const oldText = btn.textContent;

        btn.disabled = true;
        btn.textContent = translateCartText(
            "checkout.sending",
            {},
            "Sending order..."
        );

        try {
            const checkoutResult = await createOrderWithEdgeFunction(cart);
            const orderId = checkoutResult.order_id;
            const serverTotal = Number(checkoutResult.total ?? getCartTotal());

            let emailSent = true;

            try {
                await sendCheckoutEmails(cart, user, orderId, serverTotal);
            } catch (emailError) {
                emailSent = false;
                console.warn("Order was created, but email sending failed:", emailError);
            }

            await saveCart([]);
            clearGuestCartBackup();

            renderCheckoutSuccess(container, orderId, user.email, emailSent);

            if (totalEl) {
                totalEl.textContent = "€0.00";
            }
        } catch (err) {
            renderCheckoutError(container, err);
        } finally {
            btn.disabled = false;
            btn.textContent = oldText || translateCartText("cart.checkout", {}, "Checkout");
        }
    });
}

window.NovaCart = {
    getCart,
    setLocalCart,
    rememberGuestCart,
    refreshCartForUser,
    syncCart,
    async handleLogin(user) {
        return refreshCartForUser(user);
    },
    async prepareForLogout() {
        const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });

        if (user?.id) {
            const saved = await saveCartToServer(user.id, getCart());

            if (!saved) {
                console.warn("Logout continued, but cart was not saved to Supabase.");
            }
        }

        clearLocalCart();
        clearGuestCartBackup();
        setCartOwner(null);
        cartCurrentUserId = null;

        updateCartCount();
        renderCartSidebar();
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    updateCartCount();
    renderCartSidebar();
    initCheckout();

    if (window.NovaAuth) {
        const user = await window.NovaAuth.getCurrentUser({ forceRefresh: true });
        await refreshCartForUser(user);

        window.addEventListener("nova:auth-changed", async (event) => {
            const user = event.detail?.user
                ? {
                    id: event.detail.user.id,
                    email: event.detail.user.email
                }
                : null;

            await refreshCartForUser(user);
        });
    }
});