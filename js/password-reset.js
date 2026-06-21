document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.NovaAuth?.createSupabaseClient();

    const form = document.getElementById("reset-form");
    const password = document.getElementById("password");
    const confirm = document.getElementById("confirm");
    const msg = document.getElementById("msg");

    const togglePassword = document.getElementById("toggle-password");
    const toggleConfirm = document.getElementById("toggle-confirm");

    // =========================
    // SAFETY CHECK (FIX BUG)
    // =========================
    if (!supabase) {
        msg.textContent = "Auth system not loaded";
        return;
    }

    if (!form || !password || !confirm || !msg) {
        console.error("Reset DOM missing elements");
        return;
    }

    // =========================
    // TOGGLE PASSWORDS
    // =========================
    togglePassword?.addEventListener("click", () => {
        const type = password.type === "password" ? "text" : "password";
        password.type = type;
        togglePassword.textContent = type === "password" ? "👁" : "🙈";
    });

    toggleConfirm?.addEventListener("click", () => {
        const type = confirm.type === "password" ? "text" : "password";
        confirm.type = type;
        toggleConfirm.textContent = type === "password" ? "👁" : "🙈";
    });

    // =========================
    // CHECK RECOVERY SESSION
    // =========================
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session) {
        msg.textContent = "Invalid or expired reset link";
        return;
    }

    // =========================
    // SUBMIT
    // =========================
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
            msg.textContent = error.message;
            return;
        }

        msg.textContent = "Password updated! Redirecting...";

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);
    });
});