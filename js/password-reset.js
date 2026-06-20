document.addEventListener("DOMContentLoaded", async () => {
    const client = window.NovaAuth?.createSupabaseClient();

    const btn = document.getElementById("reset-btn");
    const msg = document.getElementById("msg");
    const input = document.getElementById("password");
    const confirm = document.getElementById("confirm");

    // =========================
    // 1. CLIENT CHECK
    // =========================
    if (!client) {
        console.error("Supabase client not initialized");
        msg.textContent = "System error. Please reload page.";
        btn.disabled = true;
        return;
    }

    // =========================
    // 2. TOKEN CHECK
    // =========================
    const token = new URLSearchParams(window.location.search).get("token");

    console.log("RESET TOKEN:", token);

    if (!token) {
        msg.textContent = "Invalid reset link";
        btn.disabled = true;
        input.disabled = true;
        confirm.disabled = true;
        return;
    }

    // =========================
    // 3. FETCH TOKEN FROM DB
    // =========================
    const { data, error } = await client
        .from("password_resets")
        .select("*")
        .eq("token", token)
        .single();

    console.log("DB RESPONSE:", { data, error });

    if (error || !data) {
        msg.textContent = "Invalid or expired link";
        btn.disabled = true;
        input.disabled = true;
        confirm.disabled = true;
        return;
    }

    // =========================
    // 4. VALIDATION
    // =========================
    const isExpired = new Date(data.expires_at).getTime() < Date.now();

    if (data.used) {
        msg.textContent = "This link was already used";
        btn.disabled = true;
        return;
    }

    if (isExpired) {
        msg.textContent = "Link expired";
        btn.disabled = true;
        return;
    }

    msg.textContent = "Enter your new password";

    // =========================
    // 5. RESET HANDLER
    // =========================
    btn.addEventListener("click", async () => {

        const password = input.value.trim();
        const confirmPassword = confirm.value.trim();

        if (!password) {
            msg.textContent = "Enter password";
            return;
        }

        if (password.length < 6) {
            msg.textContent = "Password must be at least 6 characters";
            return;
        }

        if (password !== confirmPassword) {
            msg.textContent = "Passwords do not match";
            return;
        }

        btn.disabled = true;
        msg.textContent = "Updating password...";

        // =========================
        // 6. UPDATE PASSWORD
        // =========================
        const { error: updateError } = await client.auth.updateUser({
            password
        });

        if (updateError) {
            console.error(updateError);
            msg.textContent = updateError.message;
            btn.disabled = false;
            return;
        }

        // =========================
        // 7. MARK TOKEN AS USED
        // =========================
        const { error: updateTokenError } = await client
            .from("password_resets")
            .update({ used: true })
            .eq("token", token);

        if (updateTokenError) {
            console.error("Token update error:", updateTokenError);
        }

        // =========================
        // 8. SUCCESS
        // =========================
        msg.textContent = "Password updated successfully! Redirecting...";

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);
    });
});