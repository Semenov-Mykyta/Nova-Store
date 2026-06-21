import "@supabase/functions-js/edge-runtime.d.ts";

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
   HELPERS
========================= */
function escapeHtml(value: unknown) {
  return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* =========================
   BREVO EMAIL
========================= */
async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME") || "NovaStore";

  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  if (!fromEmail) throw new Error("Missing FROM_EMAIL");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
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

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Brevo error ${res.status}: ${text}`);
  }

  return true;
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
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    const name = String(body.name || "User").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "Support Request").trim();
    const order = String(body.order || "").trim();
    const message = String(body.message || "").trim();

    if (!email || !message || !isValidEmail(email)) {
      return json({ error: "Missing or invalid fields" }, 400);
    }

    const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL");

    if (!SUPPORT_EMAIL) {
      return json({ error: "Missing SUPPORT_EMAIL" }, 500);
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeOrder = escapeHtml(order || "N/A");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    /* =========================
       EMAILS
    ========================= */

    const supportHtml = `
      <h2>🛠 New Support Request</h2>
      <p><b>Name:</b> ${safeName}</p>
      <p><b>Email:</b> ${safeEmail}</p>
      <p><b>Order:</b> ${safeOrder}</p>
      <p><b>Subject:</b> ${safeSubject}</p>
      <hr>
      <p>${safeMessage}</p>
    `;

    const autoReplyHtml = `
      <h2>✅ We received your message</h2>
      <p>Hi ${safeName},</p>

      <p>Thank you for contacting <b>NovaStore Support</b>.</p>

      <p>We have received your request and will respond within 24 hours.</p>

      <hr>

      <p><b>Your message:</b></p>
      <p>${safeMessage}</p>

      <br>

      <p>— NovaStore Support Team</p>
    `;

    /* =========================
       SEND (IMPORTANT FIX)
    ========================= */

    // 1. support team (CRITICAL)
    await sendEmail(
        SUPPORT_EMAIL,
        `New Support Request: ${subject}`,
        supportHtml
    );

    // 2. user auto-reply (NON-CRITICAL)
    sendEmail(
        email,
        "We received your message – NovaStore Support",
        autoReplyHtml
    ).catch(err => {
      console.warn("Auto-reply failed:", err);
    });

    return json({
      success: true
    });

  } catch (err) {
    console.error("Support error:", err);

    return json({
      error: "Server error",
      details: String(err),
    }, 500);
  }
});