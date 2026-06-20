document.addEventListener("DOMContentLoaded", async () => {
    const client = window.NovaAuth.createSupabaseClient();

    const token = new URLSearchParams(window.location.search).get("token");

    const btn = document.getElementById("reset-btn");
    const msg = document.getElementById("msg");
    const input = document.getElementById("password");

    // 🔥 1. ПРОВЕРКА СРАЗУ ПРИ ЗАГРУЗКЕ
    if (!token) {
        msg.textContent = "Invalid reset link";
        btn.disabled = true;
        input.disabled = true;
        return;
    }

    const { data, error } = await client
        .from("password_resets")
        .select("*")
        .eq("token", token)
        .single();

    if (error || !data) {
        msg.textContent = "Invalid or expired link";
        btn.disabled = true;
        input.disabled = true;
        return;
    }

    if (data.used || new Date(data.expires_at) < new Date()) {
        msg.textContent = "Link expired";
        btn.disabled = true;
        input.disabled = true;
        return;
    }

    msg.textContent = "Enter your new password";

    // 🔥 2. ТОЛЬКО ПОСЛЕ ЭТОГО РАЗРЕШАЕМ RESET
    btn.addEventListener("click", async () => {

        const password = input.value;

        if (!password) {
            msg.textContent = "Enter password";
            return;
        }

        msg.textContent = "Updating password...";

        const { error: updateError } = await client.auth.updateUser({
            password
        });

        if (updateError) {
            msg.textContent = updateError.message;
            return;
        }

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