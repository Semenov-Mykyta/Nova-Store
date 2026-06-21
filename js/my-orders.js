async function waitForOrdersSupabaseClient() {
    for (let i = 0; i < 50; i++) {
        const client = window.NovaAuth?.createSupabaseClient?.();
        if (client) return client;

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
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
    if (!value) return "Unknown date";

    return new Date(value).toLocaleString("en-US", {
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

function getStatusClass(status) {
    const normalized = String(status || "pending").toLowerCase();

    if (normalized === "paid") return "status-paid";
    if (normalized === "shipped") return "status-shipped";
    if (normalized === "delivered") return "status-delivered";
    if (normalized === "cancelled") return "status-cancelled";

    return "status-pending";
}

function renderOrderItems(items) {
    if (!items || items.length === 0) {
        return `
            <div class="order-items-empty">
                No items found for this order.
            </div>
        `;
    }

    return `
        <div class="order-items">
            ${items.map((item) => {
        const title = escapeHtml(item.title || "Product");
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        const itemTotal = price * quantity;

        return `
                    <div class="order-item">
                        <div>
                            <div class="order-item-title">${title}</div>
                            <div class="order-item-meta">
                                Quantity: ${quantity} × ${formatMoney(price)}
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
        const status = escapeHtml(order.status || "pending");
        const statusClass = getStatusClass(order.status);
        const orderItems = itemsByOrderId[order.id] || [];

        return `
            <article class="order-card">
                <div class="order-card-header">
                    <div>
                        <h3>Order #${getShortOrderId(order.id)}</h3>
                        <p class="order-date">${formatDate(order.created_at)}</p>
                    </div>

                    <span class="order-status ${statusClass}">
                        ${status}
                    </span>
                </div>

                ${renderOrderItems(orderItems)}

                <div class="order-card-footer">
                    <span>Total</span>
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

    container.innerHTML = `<p>Loading orders...</p>`;

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
                    <h3>No orders yet</h3>
                    <p>You have not placed any orders yet.</p>
                    <a href="shop.html" class="btn primary">Go shopping</a>
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
                <h3>Error loading orders</h3>
                <p>${escapeHtml(err?.message || "Please try again later.")}</p>
            </div>
        `;
    }
}

document.addEventListener("DOMContentLoaded", loadMyOrders);