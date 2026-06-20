document.addEventListener("DOMContentLoaded", async () => {
    const supabaseClient = window.NovaAuth?.createSupabaseClient?.();
    if (!supabaseClient) return;

    const resetForm = document.getElementById("reset-password-form");
    const requestForm = document.getElementById("reset-request-form");
    const resetStatus = document.getElementById("reset-password-status");
    const requestStatus = document.getElementById("reset-request-status");

    function translate(key, params = {}, fallback = key) {
        if (typeof window.translate === "function") {
            const translated = window.translate(key, params);
            if (translated && translated !== key) return translated;
        }

        let text = fallback;
        Object.entries(params).forEach(([name, value]) => {
            text = text.replaceAll(`{${name}}`, String(value ?? ""));
        });
        return text;
    }

    function setStatus(element, message, type = "") {
        if (!element) return;
        element.textContent = message;
        element.className = "auth-status";
        if (type) element.classList.add(type);
    }

    function showResetForm() {
        resetForm?.classList.add("active");
        requestForm?.classList.remove("active");
    }

    function showRequestForm(message = "") {
        resetForm?.classList.remove("active");
        requestForm?.classList.add("active");

        if (message) {
            setStatus(requestStatus, message, "error");
        }
    }

    async function exchangeCodeIfPresent() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (!code) return false;

        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);

        if (error) {
            console.error("Could not exchange password reset code:", error);
            showRequestForm(error.message);
            return false;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        return true;
    }

    async function detectRecoverySession() {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const queryParams = new URLSearchParams(window.location.search);
        const urlType = hashParams.get("type") || queryParams.get("type");
        const hasTokenInUrl = hashParams.has("access_token") || queryParams.has("code");

        await exchangeCodeIfPresent();

        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            console.error("Could not read recovery session:", error);
            showRequestForm(error.message);
            return;
        }

        const hasSession = Boolean(data?.session?.user);

        if (hasSession || urlType === "recovery" || hasTokenInUrl) {
            showResetForm();
        } else {
            showRequestForm(translate(
                "auth.reset_no_session",
                {},
                "Open the password reset link from your email, or request a new one below."
            ));
        }
    }

    if (requestForm) {
        requestForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = document.getElementById("reset-email")?.value.trim();
            setStatus(requestStatus, "");

            if (!email) {
                setStatus(requestStatus, translate("auth.reset_no_session", {}, "Enter your email first."), "error");
                return;
            }

            const submitBtn = requestForm.querySelector("button[type='submit']");
            const oldText = submitBtn?.textContent;
            if (submitBtn) submitBtn.disabled = true;

            try {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: new URL("password-reset.html", window.location.href).href
                });

                if (error) throw error;

                setStatus(
                    requestStatus,
                    translate("auth.reset_email_sent", {}, "Password reset email sent. Check your inbox."),
                    "success"
                );
            } catch (err) {
                setStatus(requestStatus, err.message || "Could not send reset email.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = oldText;
                }
            }
        });
    }

    if (resetForm) {
        resetForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const password = document.getElementById("new-password")?.value || "";
            const confirmPassword = document.getElementById("confirm-password")?.value || "";

            setStatus(resetStatus, "");

            if (password.length < 6) {
                setStatus(
                    resetStatus,
                    translate("auth.password_min", {}, "Password must be at least 6 characters."),
                    "error"
                );
                return;
            }

            if (password !== confirmPassword) {
                setStatus(
                    resetStatus,
                    translate("auth.password_mismatch", {}, "Passwords do not match."),
                    "error"
                );
                return;
            }

            const submitBtn = resetForm.querySelector("button[type='submit']");
            const oldText = submitBtn?.textContent;
            if (submitBtn) submitBtn.disabled = true;

            try {
                const { error } = await supabaseClient.auth.updateUser({ password });
                if (error) throw error;

                await supabaseClient.auth.signOut();
                window.NovaAuth?.clearAuthCache?.();

                setStatus(
                    resetStatus,
                    translate("auth.password_updated", {}, "Password updated. You can log in with your new password now."),
                    "success"
                );

                setTimeout(() => {
                    window.location.href = "login.html";
                }, 1800);
            } catch (err) {
                setStatus(resetStatus, err.message || "Could not update password.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = oldText;
                }
            }
        });
    }

    await detectRecoverySession();
});
