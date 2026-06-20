document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.NovaAuth.createSupabaseClient();

    const form = document.getElementById("reset-form");
    const password = document.getElementById("password");
    const confirm = document.getElementById("confirm");
    const msg = document.getElementById("msg");
    const togglePassword = document.getElementById("toggle-password");
    const toggleConfirm = document.getElementById("toggle-confirm");

    const passwordInput = document.getElementById("password");
    const confirmInput = document.getElementById("confirm");

    togglePassword.addEventListener("click", () => {
        const type = passwordInput.type === "password" ? "text" : "password";
        passwordInput.type = type;
        togglePassword.textContent = type === "password" ? "👁" : "🙈";
    });

    toggleConfirm.addEventListener("click", () => {
        const type = confirmInput.type === "password" ? "text" : "password";
        confirmInput.type = type;
        toggleConfirm.textContent = type === "password" ? "👁" : "🙈";
    });
    if (!supabase) {
        msg.textContent = "Auth system not ready";
        return;
    }

    // 💥 IMPORTANT: wait for Supabase recovery session
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session) {
        msg.textContent = "Invalid or expired reset session. Try again.";
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pass = password.value.trim();
        const confirmPass = confirm.value.trim();

        if (!pass || pass.length < 6) {
            msg.textContent = "Password must be at least 6 characters";
            return;
        }

        if (pass !== confirmPass) {
            msg.textContent = "Passwords do not match";
            return;
        }

        msg.textContent = "Updating password...";

        const { error } = await supabase.auth.updateUser({
            password: pass
        });

        if (error) {
            console.error(error);
            msg.textContent = error.message;
            return;
        }

        msg.textContent = "Password updated! Redirecting...";

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);
    });
});
