import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type IncomingCartItem = {
  id?: string;
  product_id?: string;
  qty?: number | string;
  quantity?: number | string;
};

type ProductRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  is_active?: boolean | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown) {
  return `€${Number(value || 0).toFixed(2)}`;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(99, Math.floor(quantity)));
}

function getRequestedItems(rawItems: IncomingCartItem[]) {
  const quantityByProductId = new Map<string, number>();

  for (const rawItem of rawItems) {
    const productId = String(rawItem.product_id || rawItem.id || "").trim();
    if (!productId) continue;

    const quantity = normalizeQuantity(rawItem.quantity ?? rawItem.qty ?? 1);
    quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
  }

  return quantityByProductId;
}

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  replyToName?: string;
}) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME") || "NovaStore";

  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  if (!fromEmail) throw new Error("Missing FROM_EMAIL");
  if (!options.to) throw new Error("Missing recipient email");

  const payload: Record<string, unknown> = {
    sender: {
      name: fromName,
      email: fromEmail,
    },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
  };

  if (options.replyTo) {
    payload.replyTo = {
      email: options.replyTo,
      name: options.replyToName || options.replyTo,
    };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Brevo error ${res.status}: ${text}`);
  }

  return text;
}

function buildItemsHtml(orderItems: Array<{ title: string; quantity: number; price: number }>) {
  return orderItems
    .map((item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">${escapeHtml(item.title)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">${money(item.price * item.quantity)}</td>
      </tr>
    `)
    .join("");
}

function buildStoreEmailHtml(params: {
  orderId: string;
  customerEmail: string;
  total: number;
  itemsHtml: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#161616;max-width:680px;margin:0 auto;">
      <h2>🛒 New NovaStore Order</h2>
      <p><b>Order ID:</b> ${escapeHtml(params.orderId)}</p>
      <p><b>Customer:</b> ${escapeHtml(params.customerEmail)}</p>
      <p><b>Total:</b> ${money(params.total)}</p>
      <hr>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 0;">Product</th>
            <th style="text-align:center;padding:8px 0;">Qty</th>
            <th style="text-align:right;padding:8px 0;">Total</th>
          </tr>
        </thead>
        <tbody>${params.itemsHtml}</tbody>
      </table>
    </div>
  `;
}

function buildCustomerEmailHtml(params: {
  orderId: string;
  customerEmail: string;
  total: number;
  itemsHtml: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#161616;max-width:680px;margin:0 auto;">
      <h2>✅ Your order is confirmed</h2>
      <p>Hi ${escapeHtml(params.customerEmail)},</p>
      <p>Thank you for shopping with <b>NovaStore</b>. We have received your order.</p>
      <p><b>Order ID:</b> ${escapeHtml(params.orderId)}</p>
      <hr>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 0;">Product</th>
            <th style="text-align:center;padding:8px 0;">Qty</th>
            <th style="text-align:right;padding:8px 0;">Total</th>
          </tr>
        </thead>
        <tbody>${params.itemsHtml}</tbody>
      </table>
      <h3 style="text-align:right;">Total: ${money(params.total)}</h3>
      <p>We will notify you when your order status changes.</p>
      <p>— NovaStore Team</p>
    </div>
  `;
}

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({
        error: "Missing Supabase environment variables",
        details: "SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required",
      }, 500);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: userData, error: userError } = await authClient.auth.getUser();
    const user = userData?.user;

    if (userError || !user) {
      return json({ error: "Unauthorized", details: userError?.message || "No user found" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.cart)
        ? body.cart
        : [];

    const quantityByProductId = getRequestedItems(rawItems);
    const productIds = [...quantityByProductId.keys()];

    if (productIds.length === 0) {
      return json({ error: "Cart is empty or invalid" }, 400);
    }

    let products: ProductRow[] | null = null;

    const fullProductsResult = await adminClient
      .from("products")
      .select("id, name, price, is_active")
      .in("id", productIds);

    if (!fullProductsResult.error) {
      products = (fullProductsResult.data || []).filter((product: ProductRow) => product.is_active !== false);
    } else {
      console.warn("Full products query failed, trying minimal schema:", fullProductsResult.error);

      const minimalProductsResult = await adminClient
        .from("products")
        .select("id, name, price")
        .in("id", productIds);

      if (minimalProductsResult.error) {
        return json({
          error: "Could not load products",
          details: minimalProductsResult.error.message,
        }, 500);
      }

      products = minimalProductsResult.data || [];
    }

    if (!products || products.length !== productIds.length) {
      return json({ error: "Some products are invalid or unavailable" }, 400);
    }

    let total = 0;

    const orderItems = products.map((product) => {
      const quantity = quantityByProductId.get(String(product.id)) || 1;
      const price = Number(product.price || 0);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid price for product ${product.id}`);
      }

      total += price * quantity;

      return {
        product_id: String(product.id),
        title: product.name || "Product",
        quantity,
        price,
      };
    });

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        user_id: user.id,
        total,
        status: "pending",
      })
      .select("id, total, status, created_at")
      .single();

    if (orderError || !order) {
      console.error("Order insert failed:", orderError);
      return json({ error: "Order was not created", details: orderError?.message || orderError }, 500);
    }

    const itemsPayload = orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemsError } = await adminClient.from("order_items").insert(itemsPayload);

    if (itemsError) {
      await adminClient.from("orders").delete().eq("id", order.id);

      console.error("Order items insert failed:", itemsError);
      return json({
        error: "Order items were not created",
        details: itemsError.message || itemsError,
      }, 500);
    }

    const orderEmail = Deno.env.get("ORDER_EMAIL");
    const itemsHtml = buildItemsHtml(orderItems);

    let storeEmailSent = false;
    let customerEmailSent = false;
    let storeEmailError = "";
    let customerEmailError = "";

    if (orderEmail) {
      try {
        await sendEmail({
          to: orderEmail,
          subject: `New NovaStore order #${order.id}`,
          html: buildStoreEmailHtml({
            orderId: String(order.id),
            customerEmail: user.email || "Unknown customer",
            total,
            itemsHtml,
          }),
          replyTo: user.email || undefined,
          replyToName: user.email || undefined,
        });
        storeEmailSent = true;
      } catch (error) {
        console.error("Store order email failed:", error);
        storeEmailError = error instanceof Error ? error.message : String(error);
      }
    } else {
      storeEmailError = "Missing ORDER_EMAIL secret";
      console.error(storeEmailError);
    }

    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Your NovaStore order #${order.id}`,
          html: buildCustomerEmailHtml({
            orderId: String(order.id),
            customerEmail: user.email,
            total,
            itemsHtml,
          }),
          replyTo: orderEmail || undefined,
          replyToName: "NovaStore Support",
        });
        customerEmailSent = true;
      } catch (error) {
        console.error("Customer confirmation email failed:", error);
        customerEmailError = error instanceof Error ? error.message : String(error);
      }
    }

    return json({
      success: true,
      order_id: order.id,
      total: order.total,
      status: order.status,
      created_at: order.created_at,
      email_status: {
        store: storeEmailSent,
        customer: customerEmailSent,
        store_error: storeEmailError || undefined,
        customer_error: customerEmailError || undefined,
      },
    });
  } catch (err) {
    console.error("Checkout function error:", err);
    return json({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
