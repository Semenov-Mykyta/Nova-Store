async function waitForAuthSupabaseClient() {
    for (let i = 0; i < 60; i++) {
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
    const dashboard = document.getElementById("dashboard");
    const dashboardEmail = document.getElementById("dashboard-email");

    function setStatus(el, message, type = "") {
        if (!el) return;
        el.textContent = message;
        el.className = "auth-status";
        if (type) el.classList.add(type);
    }

    function getPageUrl(page) {
        return window.NovaAuth?.getPageUrl?.(page) || new URL(page, window.location.href).href;
    }

    function getSafeNextUrl() {
        const fallback = getPageUrl("index.html");
        const next = new URLSearchParams(window.location.search).get("next");

        if (!next) return fallback;

        try {
            const url = new URL(next, window.location.href);
            return url.origin === window.location.origin ? url.href : fallback;
        } catch {
            return fallback;
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setButtonLoading(button, isLoading, loadingText = "Loading...") {
        if (!button) return;

        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.disabled = true;
            button.textContent = loadingText;
            return;
        }

        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }

    function initAuthTabs() {
        const tabs = document.querySelectorAll(".auth-tab[data-auth-tab]");
        const forms = document.querySelectorAll(".auth-form");

        if (!tabs.length || !forms.length) return;

        function activateTab(name) {
            tabs.forEach((tab) => {
                tab.classList.toggle("active", tab.dataset.authTab === name);
            });

            forms.forEach((form) => {
                const isTarget = form.id === `${name}-form`;
                form.classList.toggle("active", isTarget);
            });

            setStatus(loginStatus, "");
            setStatus(registerStatus, "");
        }

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => activateTab(tab.dataset.authTab));
        });

        const initialTab = new URLSearchParams(window.location.search).get("tab") === "register"
            ? "register"
            : "login";

        activateTab(initialTab);
    }

    async function refreshDashboard() {
        if (!dashboard) return;

        const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });

        if (user?.email) {
            dashboard.hidden = false;
            if (dashboardEmail) dashboardEmail.textContent = user.email;
        } else {
            dashboard.hidden = true;
            if (dashboardEmail) dashboardEmail.textContent = "";
        }
    }

    initAuthTabs();

    if (!supabaseClient) {
        setStatus(loginStatus, "Auth service did not load. Please reload the page.", "error");
        setStatus(registerStatus, "Auth service did not load. Please reload the page.", "error");
        return;
    }

    await refreshDashboard();

    // ======================
    // LOGIN
    // ======================
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = loginForm.querySelector("button[type='submit']");
            const email = document.getElementById("login-email")?.value.trim().toLowerCase() || "";
            const password = document.getElementById("login-password")?.value || "";

            setStatus(loginStatus, "");

            if (!isValidEmail(email)) {
                setStatus(loginStatus, "Enter a valid email address.", "error");
                return;
            }

            if (!password) {
                setStatus(loginStatus, "Enter your password.", "error");
                return;
            }

            setButtonLoading(submitBtn, true, "Logging in...");

            try {
                window.NovaAuth?.clearRecoveryState?.();
                window.NovaAuth?.clearAuthCache?.();

                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) {
                    setStatus(loginStatus, error.message, "error");
                    return;
                }

                sessionStorage.setItem("novastore_auth_cache", JSON.stringify({
                    createdAt: Date.now(),
                    user: data.user ? { id: data.user.id, email: data.user.email } : null
                }));

                window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                    detail: { user: data.user || null }
                }));

                setStatus(loginStatus, "Logged in successfully.", "success");
                window.location.href = getSafeNextUrl();
            } catch (err) {
                console.error("Login failed:", err);
                setStatus(loginStatus, "Login failed. Please try again.", "error");
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    // ======================
    // REGISTER
    // ======================
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = registerForm.querySelector("button[type='submit']");
            const email = document.getElementById("register-email")?.value.trim().toLowerCase() || "";
            const password = document.getElementById("register-password")?.value || "";

            setStatus(registerStatus, "");

            if (!isValidEmail(email)) {
                setStatus(registerStatus, "Enter a valid email address.", "error");
                return;
            }

            if (password.length < 6) {
                setStatus(registerStatus, "Password must be at least 6 characters.", "error");
                return;
            }

            setButtonLoading(submitBtn, true, "Creating account...");

            try {
                window.NovaAuth?.clearRecoveryState?.();
                window.NovaAuth?.clearAuthCache?.();

                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: getPageUrl("login.html")
                    }
                });

                if (error) {
                    setStatus(registerStatus, error.message, "error");
                    return;
                }

                if (data?.session?.user) {
                    sessionStorage.setItem("novastore_auth_cache", JSON.stringify({
                        createdAt: Date.now(),
                        user: { id: data.session.user.id, email: data.session.user.email }
                    }));

                    window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                        detail: { user: data.session.user }
                    }));

                    setStatus(registerStatus, "Account created. Redirecting...", "success");
                    window.location.href = getSafeNextUrl();
                    return;
                }

                setStatus(registerStatus, "Account created. Check your email to confirm it.", "success");
                registerForm.reset();
            } catch (err) {
                console.error("Registration failed:", err);
                setStatus(registerStatus, "Registration failed. Please try again.", "error");
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    // ======================
    // FORGOT PASSWORD
    // ======================
    function startButtonCooldown(button, seconds, originalText) {
        let remaining = seconds;

        button.disabled = true;
        button.textContent = `Wait ${remaining}s`;

        const interval = setInterval(() => {
            remaining -= 1;

            if (remaining <= 0) {
                clearInterval(interval);
                button.disabled = false;
                button.textContent = originalText || "Forgot password?";
                return;
            }

            button.textContent = `Wait ${remaining}s`;
        }, 1000);
    }

    if (forgotBtn) {
        forgotBtn.addEventListener("click", async () => {
            const email = document.getElementById("login-email")?.value.trim().toLowerCase() || "";

            if (!isValidEmail(email)) {
                setStatus(loginStatus, "Enter a valid email first.", "error");
                return;
            }

            const now = Date.now();
            const emailKey = `novastore_reset_email_${email}`;
            const uiKey = `novastore_reset_ui_${email}`;
            const EMAIL_COOLDOWN = 10 * 60 * 1000;
            const UI_COOLDOWN = 60 * 1000;

            const lastEmail = Number(localStorage.getItem(emailKey) || 0);
            const emailLeft = EMAIL_COOLDOWN - (now - lastEmail);

            if (emailLeft > 0) {
                const left = Math.ceil(emailLeft / 60000);
                setStatus(loginStatus, `Please wait ${left} min before requesting another reset for this email.`, "error");
                return;
            }

            const lastUI = Number(localStorage.getItem(uiKey) || 0);
            const uiLeft = UI_COOLDOWN - (now - lastUI);

            if (uiLeft > 0) {
                const left = Math.ceil(uiLeft / 1000);
                setStatus(loginStatus, `Wait ${left}s before retrying.`, "error");
                return;
            }

            const oldText = forgotBtn.textContent;
            forgotBtn.disabled = true;
            forgotBtn.textContent = "Sending...";

            try {
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: getPageUrl("password-reset.html")
                });

                if (error) {
                    setStatus(loginStatus, error.message, "error");
                    forgotBtn.disabled = false;
                    forgotBtn.textContent = oldText;
                    return;
                }

                const sentAt = Date.now();
                localStorage.setItem(emailKey, String(sentAt));
                localStorage.setItem(uiKey, String(sentAt));

                setStatus(loginStatus, "Check your email for reset link.", "success");
                startButtonCooldown(forgotBtn, 60, oldText);
            } catch (err) {
                console.error("Reset email failed:", err);
                setStatus(loginStatus, "Failed to send reset email.", "error");
                forgotBtn.disabled = false;
                forgotBtn.textContent = oldText;
            }
        });
    }

    // ======================
    // LOGOUT
    // ======================
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                if (window.NovaCart?.prepareForLogout) {
                    await window.NovaCart.prepareForLogout();
                }

                await supabaseClient.auth.signOut();
            } finally {
                window.NovaAuth?.clearAuthCache?.();
                window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                    detail: { user: null }
                }));
                window.location.href = getPageUrl("login.html");
            }
        });
    }
});
