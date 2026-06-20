import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const { email } = await req.json();

  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL");
  const FROM_NAME = Deno.env.get("FROM_NAME") || "NovaStore";

  const resetLink = `https://semenov-mykyta.github.io/Nova-Store/password-reset.html?email=${encodeURIComponent(email)}`;

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
        <div style="font-family: Arial;">
          <h2>Reset Password</h2>
          <p>You requested a password reset.</p>
          <a href="${resetLink}" 
             style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;">
             Reset Password
          </a>
          <p>If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});