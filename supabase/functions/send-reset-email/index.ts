import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {

  // 🔥 CORS FIX (важно)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // ⚠️ preflight request (БРАУЗЕР ПРОВЕРКА)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL");
    const FROM_NAME = Deno.env.get("FROM_NAME") || "NovaStore";

    const resetLink =
        "https://semenov-mykyta.github.io/Nova-Store/password-reset.html";

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: FROM_NAME,
          email: FROM_EMAIL,
        },
        to: [{ email }],
        subject: "Reset your password",
        htmlContent: `
<div style="background:#0b0f14;padding:40px 0;font-family:Arial;">

  <div style="max-width:520px;margin:0 auto;background:#111827;border-radius:16px;overflow:hidden;">

    <!-- HEADER -->
    <div style="padding:30px;text-align:center;background:#0f172a;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;">
        NovaStore
      </h1>
    </div>

    <!-- BODY -->
    <div style="padding:30px;text-align:center;">

      <h2 style="color:#ffffff;margin-bottom:10px;">
        Reset your password
      </h2>

      <p style="color:#9ca3af;font-size:14px;margin-bottom:25px;">
        We received a request to reset your password.  
        If this wasn't you, you can ignore this email.
      </p>

      <!-- BUTTON -->
      <a href="${resetLink}"
         style="
          display:inline-block;
          padding:12px 24px;
          background:#d7b46a;
          color:#000;
          text-decoration:none;
          font-weight:bold;
          border-radius:10px;
         ">
        Reset Password
      </a>

      <p style="color:#6b7280;font-size:12px;margin-top:25px;">
        This link will open the password reset page.
      </p>

    </div>

    <!-- FOOTER -->
    <div style="padding:20px;text-align:center;background:#0f172a;">
      <p style="color:#6b7280;font-size:11px;margin:0;">
        © NovaStore
      </p>
    </div>

  </div>

</div>
`,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});