// @ts-ignore
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. создаём token
    const token = crypto.randomUUID();

    // 2. expiry 15 min
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // 3. сохраняем в таблицу
    await supabase.from("password_resets").insert({
      email,
      token,
      expires_at: expiresAt.toISOString(),
      used: false
    });

    // 4. ссылка
    const resetLink = `https://semenov-mykyta.github.io/Nova-Store/password-reset.html?token=${token}`;

    // 5. отправка через Brevo
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": Deno.env.get("BREVO_API_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: Deno.env.get("FROM_NAME") || "NovaStore",
          email: Deno.env.get("FROM_EMAIL")!,
        },
        to: [{ email }],
        subject: "Reset your password",
        htmlContent: `
          <div style="font-family:Arial;text-align:center;padding:30px;">
            <h2>Reset Password</h2>
            <p>Click the button below:</p>
            <a href="${resetLink}"
               style="display:inline-block;padding:12px 20px;background:#d7b46a;color:black;text-decoration:none;">
              Reset Password
            </a>
          </div>
        `,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});