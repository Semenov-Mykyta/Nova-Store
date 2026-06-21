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
   SUPPORT FUNCTION
========================= */
// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    const name = body.name || "User";
    const email = body.email;
    const subject = body.subject || "Support Request";
    const order = body.order || "";
    const message = body.message;

    if (!email || !message) {
      return json({ error: "Missing fields" }, 400);
    }

    const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL");

    /* =========================
       EMAILS
    ========================= */

    // 🛠 SUPPORT TEAM EMAIL
    const supportHtml = `
      <h2>🛠 New Support Request</h2>
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Order:</b> ${order || "N/A"}</p>
      <p><b>Subject:</b> ${subject}</p>
      <hr>
      <p>${message}</p>
    `;

    // 👤 AUTO REPLY EMAIL (EN)
    const autoReplyHtml = `
      <h2>✅ We received your message</h2>

      <p>Hi ${name},</p>

      <p>Thank you for contacting <b>NovaStore Support</b>.</p>

      <p>We have received your request and our team will respond within 24 hours.</p>

      <hr>

      <h3>Your message:</h3>
      <p><b>Subject:</b> ${subject}</p>
      <p>${message}</p>

      <br>

      <p>If this is urgent, please reply to this email.</p>

      <p>— NovaStore Support Team</p>
    `;

    /* =========================
       SEND BOTH EMAILS
    ========================= */
    await Promise.allSettled([
      sendEmail(
          SUPPORT_EMAIL!,
          `New Support Request: ${subject}`,
          supportHtml
      ),

      sendEmail(
          email,
          "We received your message – NovaStore Support",
          autoReplyHtml
      )
    ]);

    return json({ success: true });

  } catch (err) {
    console.error("Support error:", err);

    return json({
      error: "Server error",
      details: String(err),
    }, 500);
  }
});