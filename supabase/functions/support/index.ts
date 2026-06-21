import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type BrevoSendResult = {
  ok: boolean;
  status: number;
  body: string;
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  replyToName?: string;
}): Promise<BrevoSendResult> {
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

  return {
    ok: true,
    status: res.status,
    body: text,
  };
}

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    const name = String(body.name || "User").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "Support Request").trim().slice(0, 160);
    const order = String(body.order || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 5000);

    if (!email || !message || !isValidEmail(email)) {
      return json({ error: "Missing or invalid fields" }, 400);
    }

    const supportEmail = Deno.env.get("SUPPORT_EMAIL");

    if (!supportEmail) {
      return json({ error: "Missing SUPPORT_EMAIL secret" }, 500);
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeOrder = escapeHtml(order || "N/A");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    const supportHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#161616;">
        <h2>🛠 New Support Request</h2>
        <p><b>Name:</b> ${safeName}</p>
        <p><b>Email:</b> ${safeEmail}</p>
        <p><b>Order:</b> ${safeOrder}</p>
        <p><b>Subject:</b> ${safeSubject}</p>
        <hr>
        <p><b>Message:</b></p>
        <p>${safeMessage}</p>
      </div>
    `;

    const autoReplyHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#161616;">
        <h2>✅ We received your message</h2>
        <p>Hi ${safeName},</p>
        <p>Thank you for contacting <b>NovaStore Support</b>.</p>
        <p>We have received your request and our team will respond as soon as possible, usually within 24 hours.</p>
        <hr>
        <h3>Your message</h3>
        <p><b>Subject:</b> ${safeSubject}</p>
        <p>${safeMessage}</p>
        <br>
        <p>If this is urgent, you can reply directly to this email.</p>
        <p>— NovaStore Support Team</p>
      </div>
    `;

    let supportSent = false;
    let autoReplySent = false;
    let autoReplyError = "";

    try {
      await sendEmail({
        to: supportEmail,
        subject: `New Support Request: ${subject}`,
        html: supportHtml,
        replyTo: email,
        replyToName: name,
      });
      supportSent = true;
    } catch (error) {
      console.error("Support team email failed:", error);
      return json({
        error: "Support email was not sent",
        details: error instanceof Error ? error.message : String(error),
      }, 500);
    }

    try {
      await sendEmail({
        to: email,
        subject: "We received your message – NovaStore Support",
        html: autoReplyHtml,
        replyTo: supportEmail,
        replyToName: "NovaStore Support",
      });
      autoReplySent = true;
    } catch (error) {
      console.warn("Auto-reply email failed:", error);
      autoReplyError = error instanceof Error ? error.message : String(error);
    }

    return json({
      success: true,
      support_sent: supportSent,
      auto_reply_sent: autoReplySent,
      auto_reply_error: autoReplyError || undefined,
    });
  } catch (err) {
    console.error("Support error:", err);

    return json({
      error: "Server error",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
