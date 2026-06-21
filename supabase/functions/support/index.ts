import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  replyToName?: string;
};

type SendEmailResult = {
  ok: boolean;
  status: number;
  body: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!name || !domain) return email;

  const visible = name.slice(0, 2);
  return `${visible}***@${domain}`;
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} secret`);
  }

  return value.trim();
}

async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = requireEnv("BREVO_API_KEY");
  const fromEmail = requireEnv("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME")?.trim() || "NovaStore";

  if (!isValidEmail(options.to)) {
    throw new Error(`Invalid recipient email: ${options.to}`);
  }

  const payload: Record<string, unknown> = {
    sender: {
      name: fromName,
      email: fromEmail,
    },
    to: [
      {
        email: options.to,
      },
    ],
    subject: options.subject,
    htmlContent: options.html,
  };

  if (options.replyTo && isValidEmail(options.replyTo)) {
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

  const body = await res.text();

  console.log("Brevo send result:", {
    to: maskEmail(options.to),
    subject: options.subject,
    status: res.status,
    ok: res.ok,
    body,
  });

  if (!res.ok) {
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
  };
}

// @ts-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    const name = String(body.name || "User").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "Support Request").trim().slice(0, 160);
    const order = String(body.order || "").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 5000);

    if (!name || !email || !subject || !message || !isValidEmail(email)) {
      return json({ error: "Missing or invalid fields" }, 400);
    }

    const supportEmail = requireEnv("SUPPORT_EMAIL");

    if (!isValidEmail(supportEmail)) {
      return json(
          {
            error: "Invalid SUPPORT_EMAIL secret",
            details: "SUPPORT_EMAIL must be a valid email address without quotes or spaces.",
          },
          500
      );
    }

    console.log("Support request received:", {
      from: maskEmail(email),
      toSupport: maskEmail(supportEmail),
      subject,
      order: order || "N/A",
    });

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeOrder = escapeHtml(order || "N/A");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    const ticketId = `SUP-${Date.now().toString(36).toUpperCase()}`;

    const supportHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #161616;">
        <h2>🛠 New Support Ticket</h2>

        <p><b>Ticket ID:</b> ${ticketId}</p>
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
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #161616;">
        <h2>✅ We received your message</h2>

        <p>Hi ${safeName},</p>

        <p>Thank you for contacting <b>NovaStore Support</b>.</p>

        <p>
          We have received your request and our team will respond as soon as possible,
          usually within 24 hours.
        </p>

        <p><b>Your ticket ID:</b> ${ticketId}</p>

        <hr>

        <h3>Your message</h3>
        <p><b>Subject:</b> ${safeSubject}</p>
        <p>${safeMessage}</p>

        <br>

        <p>If this is urgent, you can reply directly to this email.</p>

        <p>— NovaStore Support Team</p>
      </div>
    `;

    let supportResult: SendEmailResult;

    try {
      supportResult = await sendEmail({
        to: supportEmail,
        subject: `Support Ticket ${ticketId}: ${subject}`,
        html: supportHtml,
        replyTo: email,
        replyToName: name,
      });
    } catch (error) {
      console.error("Support email failed:", error);

      return json(
          {
            success: false,
            error: "Support email was not sent",
            details: error instanceof Error ? error.message : String(error),
          },
          500
      );
    }

    let autoReplyResult: SendEmailResult | null = null;
    let autoReplyError: string | null = null;

    try {
      autoReplyResult = await sendEmail({
        to: email,
        subject: `We received your message – NovaStore Support (${ticketId})`,
        html: autoReplyHtml,
        replyTo: supportEmail,
        replyToName: "NovaStore Support",
      });
    } catch (error) {
      autoReplyError = error instanceof Error ? error.message : String(error);
      console.warn("Auto-reply failed:", error);
    }

    return json({
      success: true,
      ticket_id: ticketId,
      support_email_sent: true,
      support_email_status: supportResult.status,
      auto_reply_sent: Boolean(autoReplyResult),
      auto_reply_status: autoReplyResult?.status || null,
      auto_reply_error: autoReplyError,
    });
  } catch (err) {
    console.error("Support function error:", err);

    return json(
        {
          success: false,
          error: "Server error",
          details: err instanceof Error ? err.message : String(err),
        },
        500
    );
  }
});