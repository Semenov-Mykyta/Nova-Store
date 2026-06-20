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

    function setStatus(element, message, type = "") {
        if (!element) return;
        element.textContent = message;
        element.className = "auth-status";
        if (type) element.classList.add(type);
    }

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
            setStatus(loginStatus, "");

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

            setStatus(loginStatus, "Logged in successfully.", "success");

            sessionStorage.setItem("novastore_auth_cache", JSON.stringify({
                createdAt: Date.now(),
                user: data?.user ? {
                    id: data.user.id,
                    email: data.user.email
                } : null
            }));

            const signedInUser = data?.user ? {
                id: data.user.id,
                email: data.user.email
            } : null;

            if (window.NovaCart && signedInUser) {
                await window.NovaCart.handleLogin(signedInUser);
            }

            window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                detail: { user: signedInUser }
            }));

            await refreshSessionUI(true);

            const params = new URLSearchParams(window.location.search);
            const next = params.get("next");

            window.location.href = next && !next.startsWith("http")
                ? next
                : "index.html";
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            setStatus(registerStatus, "");

            const email = document.getElementById("register-email").value.trim();
            const password = document.getElementById("register-password").value;

            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: new URL("login.html", window.location.href).href
                }
            });

            if (error) {
                setStatus(registerStatus, error.message, "error");
                return;
            }

            setStatus(registerStatus, "Check your email to confirm your account.", "success");
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener("click", async () => {
            setStatus(loginStatus, "");

            const email = document.getElementById("login-email").value.trim();

            if (!email) {
                setStatus(loginStatus, "Enter your email first.", "error");
                return;
            }

            forgotBtn.disabled = true;
            const oldText = forgotBtn.textContent;
            forgotBtn.textContent = "Sending...";

            try {
                const res = await fetch(
                    "https://vpznvbxgklqovibmoheq.supabase.co/functions/v1/send-reset-email",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ email })
                    }
                );

                let data = null;

                try {
                    data = await res.json();
                } catch {
                    data = null;
                }

                if (!res.ok) {
                    setStatus(
                        loginStatus,
                        data?.error || data?.message || "Failed to send reset email.",
                        "error"
                    );
                    return;
                }

                setStatus(loginStatus, "Check your email for reset link.", "success");
            } catch (err) {
                console.error("Reset email error:", err);
                setStatus(loginStatus, "Failed to send reset email.", "error");
            } finally {
                forgotBtn.disabled = false;
                forgotBtn.textContent = oldText || "Forgot password?";
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

            window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                detail: { user: null }
            }));

            await refreshSessionUI(true);
        });
    }

    await refreshSessionUI();
}); 