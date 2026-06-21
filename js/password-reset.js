document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("reset-form");
    const password = document.getElementById("password");
    const confirm = document.getElementById("confirm");
    const msg = document.getElementById("msg");

    const togglePassword = document.getElementById("toggle-password");
    const toggleConfirm = document.getElementById("toggle-confirm");

    function setStatus(message, type = "") {
        if (!msg) return;
        msg.textContent = message;
        msg.className = "reset-status";
        if (type) msg.classList.add(type);
    }

    function setFormDisabled(disabled) {
        if (password) password.disabled = disabled;
        if (confirm) confirm.disabled = disabled;
        const submitBtn = form?.querySelector("button[type='submit']");
        if (submitBtn) submitBtn.disabled = disabled;
    }

    if (!form || !password || !confirm || !msg) {
        console.error("Password reset page elements are missing.");
        return;
    }

    password.setAttribute("autocomplete", "new-password");
    confirm.setAttribute("autocomplete", "new-password");

    // ======================
    // WAIT FOR NOVAAUTH
    // ======================
    async function waitForSupabaseClient() {
        for (let i = 0; i < 40; i++) {
            const client = window.NovaAuth?.createSupabaseClient?.();
            if (client) return client;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return null;
    }

    const supabase = await waitForSupabaseClient();

    if (!supabase) {
        setStatus("Auth system not ready. Please reload the page.", "error");
        setFormDisabled(true);
        return;
    }

    // ======================
    // PASSWORD VISIBILITY
    // ======================
    function setupToggle(toggle, input) {
        toggle?.addEventListener("click", () => {
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            toggle.textContent = isHidden ? "🙈" : "👁";
            toggle.setAttribute(
                "aria-label",
                isHidden ? "Hide password" : "Show password"
            );
        });
    }

    setupToggle(togglePassword, password);
    setupToggle(toggleConfirm, confirm);

    // ======================
    // WAIT FOR RECOVERY SESSION
    // ======================
    async function waitForRecoverySession() {
        for (let i = 0; i < 40; i++) {
            const { data } = await supabase.auth.getSession();

            if (data?.session) {
                return data.session;
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return null;
    }

    setStatus("Checking reset link...");

    const session = await waitForRecoverySession();

    if (!session) {
        setStatus("Invalid or expired reset link. Please request a new one.", "error");
        setFormDisabled(true);
        return;
    }

    setStatus("Enter your new password.");

    // ======================
    // LIVE VALIDATION
    // ======================
    function validateMatch() {
        const pass = password.value.trim();
        const conf = confirm.value.trim();

        if (!pass && !conf) {
            setStatus("Enter your new password.");
            return;
        }

        if (pass.length > 0 && pass.length < 6) {
            setStatus("Password must be at least 6 characters.", "error");
            return;
        }

        if (!conf) {
            setStatus("Confirm your password.");
            return;
        }

        if (pass === conf) {
            setStatus("Passwords match ✓", "success");
        } else {
            setStatus("Passwords do not match.", "error");
        }
    }

    password.addEventListener("input", validateMatch);
    confirm.addEventListener("input", validateMatch);

    // ======================
    // SUBMIT
    // ======================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pass = password.value.trim();
        const conf = confirm.value.trim();

        if (pass.length < 6) {
            setStatus("Password must be at least 6 characters.", "error");
            return;
        }

        if (pass !== conf) {
            setStatus("Passwords do not match.", "error");
            return;
        }

        setFormDisabled(true);
        setStatus("Updating password...");

        const { error } = await supabase.auth.updateUser({
            password: pass
        });

        if (error) {
            console.error("Password update error:", error);
            setStatus(error.message || "Could not update password.", "error");
            setFormDisabled(false);
            return;
        }

        setStatus("Password updated successfully! Redirecting...", "success");

        await supabase.auth.signOut();

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1400);
    });
});