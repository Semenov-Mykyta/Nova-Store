async function waitForAuthSupabaseClient() {
    for (let i = 0; i < 50; i++) {
        const client = window.NovaAuth?.createSupabaseClient?.();
        if (client) return client;

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}

document.addEventListener("DOMContentLoaded", async () => {
    const supabaseClient = await waitForAuthSupabaseClient();

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const loginStatus = document.getElementById("login-status");
    const registerStatus = document.getElementById("register-status");
    const forgotBtn = document.getElementById("forgot-password-btn");
    const logoutBtn = document.getElementById("logout-btn");

    function setStatus(el, msg, type = "") {
        if (!el) return;
        el.textContent = msg;
        el.className = "auth-status";
        if (type) el.classList.add(type);
    }

    if (!supabaseClient) {
        setStatus(loginStatus, "Auth service did not load. Please reload the page.", "error");
        setStatus(registerStatus, "Auth service did not load. Please reload the page.", "error");
        return;
    }


    function getSafeNextUrl() {
        const fallback = window.NovaAuth?.getPageUrl?.("index.html") || "index.html";
        const next = new URLSearchParams(window.location.search).get("next");

        if (!next) return fallback;

        try {
            const url = new URL(next, window.location.href);
            return url.origin === window.location.origin ? url.href : fallback;
        } catch {
            return fallback;
        }
    }

    function getAuthRedirectUrl(page) {
        return window.NovaAuth?.getPageUrl?.(page) || new URL(page, window.location.href).href;
    }

    // ======================
    // LOGIN
    // ======================
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                setStatus(loginStatus, error.message, "error");
                return;
            }

            setStatus(loginStatus, "Logged in successfully", "success");

            sessionStorage.setItem("novastore_auth_cache", JSON.stringify({
                createdAt: Date.now(),
                user: data.user
            }));

            window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                detail: { user: data.user }
            }));

            window.location.href = getSafeNextUrl();
        });
    }

    // ======================
    // REGISTER
    // ======================
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const email = document.getElementById("register-email").value.trim();
            const password = document.getElementById("register-password").value;

            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: getAuthRedirectUrl("login.html")
                }
            });

            if (error) {
                setStatus(registerStatus, error.message, "error");
                return;
            }

            setStatus(registerStatus, "Check your email to confirm account", "success");
        });
    }

    // ======================
    // UI COOLDOWN TIMER
    // ======================
    function startButtonCooldown(btn, seconds) {
        let remaining = seconds;
        const originalText = btn.textContent;

        btn.disabled = true;

        const interval = setInterval(() => {
            remaining--;

            if (remaining <= 0) {
                clearInterval(interval);
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }

            btn.textContent = `Wait ${remaining}s`;
        }, 1000);
    }

    // ======================
    // FORGOT PASSWORD (UI + EMAIL COOLDOWN)
    // ======================
    if (forgotBtn) {
        forgotBtn.addEventListener("click", async () => {
            const email = document.getElementById("login-email").value.trim();

            if (!email) {
                setStatus(loginStatus, "Enter email first", "error");
                return;
            }

            const now = Date.now();

            // ======================
            // 🟡 EMAIL COOLDOWN (10 MIN)
            // ======================
            const emailKey = `reset_email_${email}`;
            const lastEmail = localStorage.getItem(emailKey);
            const EMAIL_COOLDOWN = 10 * 60 * 1000;

            if (lastEmail && now - Number(lastEmail) < EMAIL_COOLDOWN) {
                const left = Math.ceil((EMAIL_COOLDOWN - (now - Number(lastEmail))) / 60000);
                setStatus(loginStatus, `Please wait ${left} min before requesting again`, "error");
                return;
            }

            // ======================
            // 🟢 UI COOLDOWN (60s)
            // ======================
            const uiKey = `reset_ui_${email}`;
            const lastUI = localStorage.getItem(uiKey);
            const UI_COOLDOWN = 60 * 1000;

            if (lastUI && now - Number(lastUI) < UI_COOLDOWN) {
                const left = Math.ceil((UI_COOLDOWN - (now - Number(lastUI))) / 1000);
                setStatus(loginStatus, `Wait ${left}s`, "error");
                return;
            }

            forgotBtn.disabled = true;
            const oldText = forgotBtn.textContent;
            forgotBtn.textContent = "Sending...";

            try {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: getAuthRedirectUrl("password-reset.html")
                });

                if (error) {
                    setStatus(loginStatus, error.message, "error");
                    return;
                }

                // save timestamps
                localStorage.setItem(emailKey, String(now));
                localStorage.setItem(uiKey, String(now));

                setStatus(loginStatus, "Check your email for reset link", "success");

                // UI timer
                startButtonCooldown(forgotBtn, 60);

            } catch (err) {
                console.error(err);
                setStatus(loginStatus, "Failed to send reset email", "error");
            } finally {
                setTimeout(() => {
                    forgotBtn.disabled = false;
                    forgotBtn.textContent = oldText || "Forgot password?";
                }, 1000);
            }
        });
    }

    // ======================
    // LOGOUT
    // ======================
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
            sessionStorage.removeItem("novastore_auth_cache");

            window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                detail: { user: null }
            }));

            window.location.href = "login.html";
        });
    }
});