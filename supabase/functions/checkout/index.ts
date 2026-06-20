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

    // Preferred schema with is_active.
    const fullProductsResult = await adminClient
      .from("products")
      .select("id, name, price, is_active")
      .in("id", productIds);

    if (!fullProductsResult.error) {
      products = (fullProductsResult.data || []).filter((product: ProductRow) => product.is_active !== false);
    } else {
      // Fallback for minimal products table without is_active.
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

    return json({
      success: true,
      order_id: order.id,
      total: order.total,
      status: order.status,
      created_at: order.created_at,
    });
  } catch (err) {
    console.error("Checkout function error:", err);
    return json({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
