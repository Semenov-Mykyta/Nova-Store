document.addEventListener("DOMContentLoaded", async () => {
    const RECOVERY_FLAG = "novastore_password_recovery_active";
    const AUTH_CACHE_KEY = "novastore_auth_cache";
    const THEME_KEY = "novastore_theme";
    const LANG_KEY = "novastore_lang";


const form = document.getElementById("reset-form");
const password = document.getElementById("password");
const confirm = document.getElementById("confirm");
const msg = document.getElementById("msg");

const togglePassword = document.getElementById("toggle-password");
const toggleConfirm = document.getElementById("toggle-confirm");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.querySelector(".theme-icon");
const langToggle = document.getElementById("lang-toggle");
const langLabel = document.getElementById("lang-label");
const burger = document.getElementById("burger");
const nav = document.getElementById("nav");

const resetTexts = {
    en: {
        navHome: "Home",
        navShop: "Shop",
        navSupport: "Support",
        login: "Login",
        kicker: "Account security",
        heroTitle: "Set a new password.",
        heroText: "Create a strong password for your NovaStore account. After updating it, you can sign in again and continue shopping securely.",
        point1: "Secure recovery link",
        point2: "Protected checkout",
        point3: "Fresh login after reset",
        cardTitle: "Reset Password",
        cardText: "Enter and confirm your new password below.",
        newPassword: "New password",
        confirmPassword: "Confirm password",
        submit: "Update Password",
        backLogin: "Back to login",
        checking: "Checking reset link...",
        enterPassword: "Enter your new password.",
        confirmYourPassword: "Confirm your password.",
        tooShort: "Password must be at least 6 characters.",
        match: "Passwords match ✓",
        mismatch: "Passwords do not match.",
        updating: "Updating password...",
        success: "Password updated successfully! Redirecting...",
        invalid: "Invalid or expired reset link. Please request a new one.",
        authNotReady: "Auth system not ready. Please reload the page.",
        updateFailed: "Could not update password."
    },
    de: {
        navHome: "Startseite",
        navShop: "Shop",
        navSupport: "Support",
        login: "Login",
        kicker: "Kontosicherheit",
        heroTitle: "Neues Passwort setzen.",
        heroText: "Erstelle ein starkes Passwort für dein NovaStore-Konto. Danach kannst du dich erneut anmelden und sicher weiter einkaufen.",
        point1: "Sicherer Wiederherstellungslink",
        point2: "Geschützter Checkout",
        point3: "Neuer Login nach Reset",
        cardTitle: "Passwort zurücksetzen",
        cardText: "Gib dein neues Passwort ein und bestätige es.",
        newPassword: "Neues Passwort",
        confirmPassword: "Passwort bestätigen",
        submit: "Passwort aktualisieren",
        backLogin: "Zurück zum Login",
        checking: "Reset-Link wird geprüft...",
        enterPassword: "Gib dein neues Passwort ein.",
        confirmYourPassword: "Bestätige dein Passwort.",
        tooShort: "Das Passwort muss mindestens 6 Zeichen lang sein.",
        match: "Passwörter stimmen überein ✓",
        mismatch: "Passwörter stimmen nicht überein.",
        updating: "Passwort wird aktualisiert...",
        success: "Passwort erfolgreich aktualisiert! Weiterleitung...",
        invalid: "Ungültiger oder abgelaufener Reset-Link. Bitte fordere einen neuen an.",
        authNotReady: "Auth-System ist nicht bereit. Bitte lade die Seite neu.",
        updateFailed: "Passwort konnte nicht aktualisiert werden."
    }
};

let currentLang = localStorage.getItem(LANG_KEY) || "en";
if (!["en", "de"].includes(currentLang)) {
    currentLang = "en";
}

function t(key) {
    return resetTexts[currentLang]?.[key] || resetTexts.en[key] || key;
}

function cleanPasswordValue(value) {
    return String(value || "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim();
}

function debugPasswordMismatch(pass, conf) {
    console.log("PASSWORD VALUE:", JSON.stringify(pass));
    console.log("CONFIRM VALUE:", JSON.stringify(conf));

    console.log(
        "PASSWORD CHARS:",
        [...pass].map((ch) => `${ch}:${ch.charCodeAt(0)}`)
    );

    console.log(
        "CONFIRM CHARS:",
        [...conf].map((ch) => `${ch}:${ch.charCodeAt(0)}`)
    );
}

function setStatus(message, type = "") {
    if (!msg) return;

    msg.textContent = message;
    msg.className = "reset-status";

    if (type) {
        msg.classList.add(type);
    }
}

function setFormDisabled(disabled) {
    if (password) password.disabled = disabled;
    if (confirm) confirm.disabled = disabled;

    const submitBtn = form?.querySelector("button[type='submit']");
    if (submitBtn) {
        submitBtn.disabled = disabled;
    }
}

function applyResetLanguage() {
    document.querySelectorAll("[data-reset-i18n]").forEach((el) => {
        const key = el.getAttribute("data-reset-i18n");
        el.textContent = t(key);
    });

    if (langLabel) {
        langLabel.textContent = currentLang.toUpperCase();
    }

    if (password) {
        password.placeholder = currentLang === "de"
            ? "Neues Passwort eingeben"
            : "Enter new password";
    }

    if (confirm) {
        confirm.placeholder = currentLang === "de"
            ? "Passwort wiederholen"
            : "Repeat new password";
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    if (themeIcon) {
        themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
    }
}

function initThemeControls() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(currentTheme);

    themeToggle?.addEventListener("click", () => {
        const activeTheme = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(activeTheme === "dark" ? "light" : "dark");
    });
}

function initLanguageControls() {
    applyResetLanguage();

    langToggle?.addEventListener("click", () => {
        currentLang = currentLang === "en" ? "de" : "en";
        localStorage.setItem(LANG_KEY, currentLang);

        applyResetLanguage();
        validateMatch();
    });
}

function initBurger() {
    burger?.addEventListener("click", () => {
        nav?.classList.toggle("open");
        burger.classList.toggle("open");
    });
}

function setupPasswordToggle(toggle, input) {
    if (!toggle || !input) return;

    toggle.addEventListener("click", () => {
        const hidden = input.type === "password";

        input.type = hidden ? "text" : "password";
        toggle.textContent = hidden ? "🙈" : "👁";
        toggle.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
    });
}

async function waitForSupabaseClient() {
    for (let i = 0; i < 40; i++) {
        const client = window.NovaAuth?.createSupabaseClient?.();

        if (client) {
            return client;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}

async function waitForRecoverySession(supabase) {
    for (let i = 0; i < 40; i++) {
        const { data } = await supabase.auth.getSession();

        if (data?.session) {
            return data.session;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}

function clearRecoveryState() {
    localStorage.removeItem(RECOVERY_FLAG);
    sessionStorage.removeItem(RECOVERY_FLAG);
    sessionStorage.removeItem(AUTH_CACHE_KEY);

    window.NovaAuth?.clearRecoveryState?.();
    window.NovaAuth?.clearAuthCache?.();
}

function markRecoveryStateIfNeeded() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);

    const isRecovery =
        hashParams.get("type") === "recovery" ||
        queryParams.get("type") === "recovery" ||
        window.location.hash.includes("access_token=");

    if (isRecovery) {
        localStorage.setItem(RECOVERY_FLAG, "1");
        sessionStorage.setItem(RECOVERY_FLAG, "1");
        sessionStorage.removeItem(AUTH_CACHE_KEY);
    }
}

function validateMatch() {
    if (!password || !confirm) return false;

    const pass = cleanPasswordValue(password.value);
    const conf = cleanPasswordValue(confirm.value);

    if (!pass && !conf) {
        setStatus(t("enterPassword"));
        return false;
    }

    if (pass.length > 0 && pass.length < 6) {
        setStatus(t("tooShort"), "error");
        return false;
    }

    if (!conf) {
        setStatus(t("confirmYourPassword"));
        return false;
    }

    if (pass === conf) {
        setStatus(t("match"), "success");
        return true;
    }

    debugPasswordMismatch(pass, conf);
    setStatus(t("mismatch"), "error");
    return false;
}

initThemeControls();
initLanguageControls();
initBurger();

if (!form || !password || !confirm || !msg) {
    console.error("Password reset page elements are missing.");
    return;
}

password.setAttribute("autocomplete", "new-password");
confirm.setAttribute("autocomplete", "new-password");

setupPasswordToggle(togglePassword, password);
setupPasswordToggle(toggleConfirm, confirm);

markRecoveryStateIfNeeded();

const supabase = await waitForSupabaseClient();

if (!supabase) {
    setStatus(t("authNotReady"), "error");
    setFormDisabled(true);
    return;
}

setStatus(t("checking"));

const session = await waitForRecoverySession(supabase);

if (!session) {
    setStatus(t("invalid"), "error");
    setFormDisabled(true);
    return;
}

setStatus(t("enterPassword"));

password.addEventListener("input", validateMatch);
confirm.addEventListener("input", validateMatch);

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const pass = cleanPasswordValue(password.value);
    const conf = cleanPasswordValue(confirm.value);

    if (pass.length < 6) {
        setStatus(t("tooShort"), "error");
        return;
    }

    if (pass !== conf) {
        debugPasswordMismatch(pass, conf);
        setStatus(t("mismatch"), "error");
        return;
    }

    setFormDisabled(true);
    setStatus(t("updating"));

    const { error } = await supabase.auth.updateUser({
        password: pass
    });

    if (error) {
        console.error("Password update error:", error);
        setStatus(error.message || t("updateFailed"), "error");
        setFormDisabled(false);
        return;
    }

    setStatus(t("success"), "success");

    clearRecoveryState();
    await supabase.auth.signOut();

    setTimeout(() => {
        window.location.href = "login.html";
    }, 1400);
});


});
