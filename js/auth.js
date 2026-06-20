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

    document.querySelectorAll(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.getAttribute("data-auth-tab");
            document.querySelectorAll(".auth-form").forEach((form) => {
                form.classList.toggle("active", form.id.startsWith(target));
            });
        });
    });

    async function refreshSessionUI(forceRefresh = false) {
        const user = await window.NovaAuth.getCurrentUser({ forceRefresh });
        if (user && dashboard) {
            dashboard.hidden = false;
            if (dashboardEmail) dashboardEmail.textContent = user.email;
        } else if (dashboard) {
            dashboard.hidden = true;
        }
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            loginStatus.textContent = "";
            loginStatus.className = "auth-status";

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;

            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                loginStatus.textContent = error.message;
                loginStatus.classList.add("error");
            } else {
                loginStatus.textContent = "Logged in successfully.";
                loginStatus.classList.add("success");
                sessionStorage.setItem("novastore_auth_cache", JSON.stringify({
                    createdAt: Date.now(),
                    user: data?.user ? { id: data.user.id, email: data.user.email } : null
                }));
                const signedInUser = data?.user ? { id: data.user.id, email: data.user.email } : null;
                if (window.NovaCart && signedInUser) {
                    await window.NovaCart.handleLogin(signedInUser);
                }
                window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                    detail: { user: signedInUser }
                }));
                await refreshSessionUI(true);

                const params = new URLSearchParams(window.location.search);
                const next = params.get("next");
                window.location.href = next && !next.startsWith("http") ? next : "index.html";
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            registerStatus.textContent = "";
            registerStatus.className = "auth-status";

            const email = document.getElementById("register-email").value.trim();
            const password = document.getElementById("register-password").value;

            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: new URL("login.html", window.location.href).href }
            });

            if (error) {
                registerStatus.textContent = error.message;
                registerStatus.classList.add("error");
            } else {
                registerStatus.textContent = "Check your email to confirm your account.";
                registerStatus.classList.add("success");
            }
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener("click", async () => {
            loginStatus.textContent = "";
            loginStatus.className = "auth-status";

            const email = document.getElementById("login-email").value.trim();
            if (!email) {
                loginStatus.textContent = "Enter your email first.";
                loginStatus.classList.add("error");
                return;
            }

            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: new URL("password-reset.html", window.location.href).href
            });

            if (error) {
                loginStatus.textContent = error.message;
                loginStatus.classList.add("error");
            } else {
                loginStatus.textContent = "Password reset email sent.";
                loginStatus.classList.add("success");
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (window.NovaCart?.prepareForLogout) {
                await window.NovaCart.prepareForLogout();
            }
            await supabaseClient.auth.signOut();
            window.NovaAuth.clearAuthCache();
            window.dispatchEvent(new CustomEvent("nova:auth-changed", { detail: { user: null } }));
            await refreshSessionUI(true);
        });
    }

    await refreshSessionUI();
});
