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

    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. generate token
    const token = crypto.randomUUID();

    // 💥 FIX: ALWAYS STORE ISO STRING
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    console.log("Reset requested for:", email);
    console.log("Generated token:", token);

    // 2. save to DB
    const { error: insertError } = await supabase
        .from("password_resets")
        .insert({
          email,
          token,
          expires_at: expiresAt, // 💥 FIXED
          used: false
        });

    if (insertError) {
      console.error("DB insert error:", insertError);

      return new Response(JSON.stringify({
        error: "Failed to save reset token"
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // 3. build link
    const resetLink =
        `https://semenov-mykyta.github.io/Nova-Store/password-reset.html?token=${token}`;

    // 4. send email via Brevo
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
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
          <div style="font-family:Arial;text-align:center;padding:30px;background:#0f1115;color:white;">
            <h2>Reset Password</h2>
            <p>Click the button below:</p>

            <a href="${resetLink}"
               style="display:inline-block;margin-top:10px;padding:12px 20px;background:#d7b46a;color:black;text-decoration:none;border-radius:8px;">
              Reset Password
            </a>

            <p style="margin-top:20px;font-size:12px;color:#aaa;">
              This link expires in 15 minutes.
            </p>
          </div>
        `,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error("Brevo error:", errText);

      return new Response(JSON.stringify({
        error: "Email sending failed"
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    console.log("Reset email sent successfully");

    return new Response(JSON.stringify({
      ok: true
    }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    console.error("Function error:", err);

    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});