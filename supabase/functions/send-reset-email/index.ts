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
<div style="font-family: Arial; text-align:center; padding:40px; background:#0f1115;">

  <img src="https://vpznvbxgklqovibmoheq.supabase.co/storage/v1/object/public/logo/logo.svg"
       style="width:120px;margin-bottom:20px;" />

  <h2 style="color:white;">Reset Password</h2>

  <p style="color:#aaa;">Click the button below:</p>

  <a href="${resetLink}"
     style="display:inline-block;padding:12px 20px;background:#d7b46a;color:black;text-decoration:none;border-radius:8px;">
    Reset Password
  </a>

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