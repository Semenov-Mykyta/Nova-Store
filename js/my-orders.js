async function waitForOrdersSupabaseClient() {
    for (let i = 0; i < 50; i++) {
        const client = window.NovaAuth?.createSupabaseClient?.();
        if (client) return client;

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}

function getCurrentOrdersLang() {
    const lang = window.getCurrentLanguage?.() || localStorage.getItem("lang") || "en";
    return lang === "de" ? "de" : "en";
}

function tr(key, params = {}) {
    if (typeof window.translate === "function") {
        return window.translate(key, params);
    }

    const fallback = {
        "my.orders.loading": "Loading orders...",
        "my.orders.empty_title": "No orders yet",
        "my.orders.empty_text": "You have not placed any orders yet.",
        "my.orders.go_shopping": "Go shopping",
        "my.orders.error_title": "Error loading orders",
        "my.orders.error_text": "Please try again later.",
        "my.orders.unknown_date": "Unknown date",
        "my.orders.order_prefix": "Order",
        "my.orders.total": "Total",
        "my.orders.no_items": "No items found for this order.",
        "my.orders.product": "Product",
        "my.orders.quantity": "Quantity",
        "my.orders.status.pending": "Pending",
        "my.orders.status.paid": "Paid",
        "my.orders.status.shipped": "Shipped",
        "my.orders.status.delivered": "Delivered",
        "my.orders.status.cancelled": "Cancelled"
    };

    let text = fallback[key] || key;
    Object.entries(params).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value ?? ""));
    });
    return text;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatMoney(value) {
    return `€${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
    if (!value) return tr("my.orders.unknown_date");

    const locale = getCurrentOrdersLang() === "de" ? "de-DE" : "en-US";

    return new Date(value).toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getShortOrderId(id) {
    if (!id) return "";
    return String(id).slice(0, 8).toUpperCase();
}

function normalizeStatus(status) {
    const normalized = String(status || "pending").toLowerCase();

    if (["paid", "shipped", "delivered", "cancelled"].includes(normalized)) {
        return normalized;
    }

    return "pending";
}

function getStatusClass(status) {
    return `status-${normalizeStatus(status)}`;
}

function getStatusLabel(status) {
    return tr(`my.orders.status.${normalizeStatus(status)}`);
}

function renderOrderItems(items) {
    if (!items || items.length === 0) {
        return `
            <div class="order-items-empty">
                ${escapeHtml(tr("my.orders.no_items"))}
            </div>
        `;
    }

    return `
        <div class="order-items">
            ${items.map((item) => {
                const title = escapeHtml(item.title || tr("my.orders.product"));
                const quantity = Number(item.quantity || 1);
                const price = Number(item.price || 0);
                const itemTotal = price * quantity;

                return `
                    <div class="order-item">
                        <div>
                            <div class="order-item-title">${title}</div>
                            <div class="order-item-meta">
                                ${escapeHtml(tr("my.orders.quantity"))}: ${quantity} × ${formatMoney(price)}
                            </div>
                        </div>

                        <div class="order-item-price">
                            ${formatMoney(itemTotal)}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderOrders(orders, itemsByOrderId) {
    return orders.map((order) => {
        const statusClass = getStatusClass(order.status);
        const orderItems = itemsByOrderId[order.id] || [];

        return `
            <article class="order-card">
                <div class="order-card-header">
                    <div>
                        <h3>${escapeHtml(tr("my.orders.order_prefix"))} #${getShortOrderId(order.id)}</h3>
                        <p class="order-date">${formatDate(order.created_at)}</p>
                    </div>

                    <span class="order-status ${statusClass}">
                        ${escapeHtml(getStatusLabel(order.status))}
                    </span>
                </div>

                ${renderOrderItems(orderItems)}

                <div class="order-card-footer">
                    <span>${escapeHtml(tr("my.orders.total"))}</span>
                    <strong>${formatMoney(order.total)}</strong>
                </div>
            </article>
        `;
    }).join("");
}

async function loadOrderItems(orderIds) {
    if (!orderIds.length) return {};

    const client = window.NovaAuth?.createSupabaseClient?.() || window.supabaseClient;

    if (!client) return {};

    const { data, error } = await client
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);

    if (error) {
        console.error("Could not load order items:", error);
        return {};
    }

    return (data || []).reduce((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
    }, {});
}

async function loadMyOrders() {
    const container = document.getElementById("orders-container");
    if (!container) return;

    container.innerHTML = `<p>${escapeHtml(tr("my.orders.loading"))}</p>`;

    try {
        const client = await waitForOrdersSupabaseClient();

        if (!client) {
            throw new Error("Auth service did not load. Please reload the page.");
        }

        const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });

        if (!user) {
            const next = encodeURIComponent("my-orders.html");
            window.location.replace(`login.html?next=${next}`);
            return;
        }

        const { data: orders, error } = await client
            .from("orders")
            .select("id, user_id, total, status, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Could not load orders:", error);
            throw error;
        }

        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${escapeHtml(tr("my.orders.empty_title"))}</h3>
                    <p>${escapeHtml(tr("my.orders.empty_text"))}</p>
                    <a href="shop.html" class="btn primary">${escapeHtml(tr("my.orders.go_shopping"))}</a>
                </div>
            `;
            return;
        }

        const orderIds = orders.map((order) => order.id);
        const itemsByOrderId = await loadOrderItems(orderIds);

        container.innerHTML = renderOrders(orders, itemsByOrderId);
    } catch (err) {
        console.error("My Orders error:", err);

        container.innerHTML = `
            <div class="checkout-error">
                <h3>${escapeHtml(tr("my.orders.error_title"))}</h3>
                <p>${escapeHtml(err?.message || tr("my.orders.error_text"))}</p>
            </div>
        `;
    }
}

document.addEventListener("DOMContentLoaded", loadMyOrders);
window.addEventListener("nova:language-changed", loadMyOrders);
