document.addEventListener("DOMContentLoaded", async () => {
    const supabaseClient = window.NovaAuth?.createSupabaseClient();
    if (!supabaseClient) return;

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const loginStatus = document.getElementById("login-status");
    const registerStatus = document.getElementById("register-status");
    const forgotBtn = document.getElementById("forgot-password-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const dashboard = document.getElementById("dashboard");
    const dashboardEmail = document.getElementById("dashboard-email");

    function setStatus(el, msg, type = "") {
        if (!el) return;
        el.textContent = msg;
        el.className = "auth-status";
        if (type) el.classList.add(type);
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

            window.location.href = "index.html";
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
                    emailRedirectTo: `${window.location.origin}/login.html`
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
    // FORGOT PASSWORD (FIXED)
    // ======================
    if (forgotBtn) {
        forgotBtn.addEventListener("click", async () => {
            const email = document.getElementById("login-email").value.trim();

            if (!email) {
                setStatus(loginStatus, "Enter email first", "error");
                return;
            }

            forgotBtn.disabled = true;
            const oldText = forgotBtn.textContent;
            forgotBtn.textContent = "Sending...";

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/password-reset.html`
            });

            if (error) {
                setStatus(loginStatus, error.message, "error");
            } else {
                setStatus(loginStatus, "Check your email for reset link", "success");
            }

            forgotBtn.disabled = false;
            forgotBtn.textContent = oldText;
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