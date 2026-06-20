document.addEventListener("DOMContentLoaded", async () => {
    const client = window.NovaAuth.createSupabaseClient();

    const btn = document.getElementById("reset-btn");
    const msg = document.getElementById("msg");

    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
        msg.textContent = "Invalid reset link";
        btn.disabled = true;
        return;
    }

    btn.addEventListener("click", async () => {
        const password = document.getElementById("password").value;

        if (!password) {
            msg.textContent = "Enter password";
            return;
        }

        msg.textContent = "Checking link...";

        // 1. find token in DB
        const { data, error } = await client
            .from("password_resets")
            .select("*")
            .eq("token", token)
            .single();

        if (error || !data) {
            msg.textContent = "Invalid or expired link";
            return;
        }

        // 2. expiry check
        if (data.used || new Date(data.expires_at) < new Date()) {
            msg.textContent = "Link expired";
            return;
        }

        msg.textContent = "Updating password...";

        // 3. update password in Supabase Auth
        const { error: updateError } = await client.auth.updateUser({
            password: password
        });

        if (updateError) {
            msg.textContent = updateError.message;
            return;
        }

        // 4. mark token as used
        await client
            .from("password_resets")
            .update({ used: true })
            .eq("token", token);

        msg.textContent = "Password updated! Redirecting...";

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);
    });
});