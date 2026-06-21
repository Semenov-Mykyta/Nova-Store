import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

/* =========================
   BREVO EMAIL
========================= */
async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME");

  if (!apiKey) throw new Error("Missing BREVO_API_KEY");

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
}

/* =========================
   HELPERS
========================= */
function normalizeQty(value: unknown) {
  const q = Number(value);
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.floor(q)));
}

function getItems(items: any[]) {
  const map = new Map<string, number>();

  for (const i of items || []) {
    const id = String(i.id || i.product_id || "").trim();
    if (!id) continue;

    const qty = normalizeQty(i.qty ?? i.quantity ?? 1);
    map.set(id, (map.get(id) || 0) + qty);
  }

  return map;
}

/* =========================
   MAIN
========================= */
// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader! } },
    });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;

    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const itemsMap = getItems(body.items || body.cart || []);

    if (!itemsMap.size) return json({ error: "Empty cart" }, 400);

    const productIds = [...itemsMap.keys()];

    const { data: products, error } = await admin
        .from("products")
        .select("id, name, price")
        .in("id", productIds);

    if (error || !products) {
      return json({ error: "Products load failed" }, 500);
    }

    let total = 0;

    const orderItems = products.map(p => {
      const qty = itemsMap.get(p.id) || 1;
      const price = Number(p.price || 0);

      total += price * qty;

      return {
        product_id: p.id,
        title: p.name,
        quantity: qty,
        price,
      };
    });

    /* =========================
       CREATE ORDER
    ========================= */
    const { data: order, error: orderError } = await admin
        .from("orders")
        .insert({
          user_id: user.id,
          total,
          status: "pending",
        })
        .select()
        .single();

    if (orderError || !order) {
      return json({ error: "Order create failed" }, 500);
    }

    await admin.from("order_items").insert(
        orderItems.map(i => ({
          order_id: order.id,
          ...i,
        }))
    );

    /* =========================
       EMAILS
    ========================= */

    const ORDER_EMAIL = Deno.env.get("ORDER_EMAIL")!;

    const itemsHtml = orderItems
        .map(i => `<li>${i.title} × ${i.quantity}</li>`)
        .join("");

    // 🏪 STORE EMAIL
    const storeEmailHtml = `
      <h2>🛒 New Order #${order.id}</h2>
      <p>User: ${user.email}</p>
      <p>Total: €${total.toFixed(2)}</p>
      <ul>${itemsHtml}</ul>
    `;

    // 👤 CUSTOMER EMAIL
    const customerEmailHtml = `
      <h2>✅ Order Confirmed</h2>
      <p>Hi ${user.email},</p>
      <p>Your order <b>#${order.id}</b> is confirmed.</p>
      <ul>${itemsHtml}</ul>
      <p><b>Total:</b> €${total.toFixed(2)}</p>
      <p>We will notify you when it ships 🚚</p>
    `;

    await Promise.allSettled([
      sendEmail(
          ORDER_EMAIL,
          `New Order #${order.id}`,
          storeEmailHtml
      ),
      sendEmail(
          user.email,
          `Your order #${order.id}`,
          customerEmailHtml
      )
    ]);

    /* =========================
       RESPONSE
    ========================= */
    return json({
      success: true,
      order_id: order.id,
      total,
      status: order.status,
    });

  } catch (err) {
    console.error(err);
    return json({
      error: "Server error",
      details: String(err),
    }, 500);
  }
});