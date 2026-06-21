const SUPABASE_URL = "https://vpznvbxgklqovibmoheq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwem52Ynhna2xxb3ZpYm1vaGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDAyNTMsImV4cCI6MjA5NTcxNjI1M30.FgCN1knqpyi-2bb9U8tvSqC1mpGT15IyMyrM7BGJQRY";

const AUTH_CACHE_KEY = "novastore_auth_cache";
const AUTH_CACHE_TTL = 5 * 60 * 1000;

const RECOVERY_FLAG = "novastore_password_recovery_active";

function isPasswordResetPage() {
    const path = window.location.pathname.toLowerCase();

    return (
        path.endsWith("password-reset.html") ||
        path.endsWith("reset-password.html")
    );
}

function hasRecoveryUrl() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);

    const hashType = hashParams.get("type");
    const queryType = queryParams.get("type");

    const hasAccessToken = window.location.hash.includes("access_token=");

    return (
        hashType === "recovery" ||
        queryType === "recovery" ||
        (isPasswordResetPage() && hasAccessToken)
    );
}

function markRecoveryIfNeeded() {
    if (!hasRecoveryUrl()) return;

    localStorage.setItem(RECOVERY_FLAG, "1");
    sessionStorage.setItem(RECOVERY_FLAG, "1");
    clearAuthCache();
}

function isRecoveryActive() {
    markRecoveryIfNeeded();

    return (
        localStorage.getItem(RECOVERY_FLAG) === "1" ||
        sessionStorage.getItem(RECOVERY_FLAG) === "1"
    );
}

function clearRecoveryState() {
    localStorage.removeItem(RECOVERY_FLAG);
    sessionStorage.removeItem(RECOVERY_FLAG);
    clearAuthCache();
}

function getPageUrl(page = "") {
    const path = window.location.pathname;
    const directory = path.endsWith("/")
        ? path
        : path.slice(0, path.lastIndexOf("/") + 1);

    return new URL(page, `${window.location.origin}${directory}`).href;
}


function createSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (typeof supabase === "undefined") return null;

    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
}

function readAuthCache() {
    try {
        if (isRecoveryActive() && !isPasswordResetPage()) {
            clearAuthCache();
            return undefined;
        }

        const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return undefined;

        const cached = JSON.parse(raw);
        if (!cached || Date.now() - cached.createdAt > AUTH_CACHE_TTL) {
            return undefined;
        }

        return Object.prototype.hasOwnProperty.call(cached, "user")
            ? cached.user
            : undefined;
    } catch {
        return undefined;
    }
}

function writeAuthCache(user) {
    if (isRecoveryActive()) {
        clearAuthCache();
        return;
    }

    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
        createdAt: Date.now(),
        user: user ? { id: user.id, email: user.email } : null
    }));
}

function clearAuthCache() {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
}

async function clearRecoverySessionOutsideResetPage(client) {
    markRecoveryIfNeeded();

    if (isPasswordResetPage()) {
        return false;
    }

    if (!isRecoveryActive()) {
        return false;
    }

    try {
        if (client) {
            await client.auth.signOut();
        }
    } catch (error) {
        console.warn("Could not clear recovery session:", error);
    } finally {
        clearRecoveryState();

        window.dispatchEvent(new CustomEvent("nova:auth-changed", {
            detail: { user: null }
        }));
    }

    return true;
}

async function getCurrentUser(options = {}) {
    const { forceRefresh = false } = options;

    const client = createSupabaseClient();
    if (!client) return null;

    const clearedRecovery = await clearRecoverySessionOutsideResetPage(client);
    if (clearedRecovery) return null;

    if (!forceRefresh) {
        const cachedUser = readAuthCache();
        if (cachedUser !== undefined) return cachedUser;
    }

    try {
        const { data: sessionData, error } = await client.auth.getSession();
        if (error) throw error;

        if (isRecoveryActive() && !isPasswordResetPage()) {
            await clearRecoverySessionOutsideResetPage(client);
            return null;
        }

        const sessionUser = sessionData?.session?.user || null;

        if (sessionUser) {
            if (isRecoveryActive()) {
                clearAuthCache();
                return null;
            }

            writeAuthCache(sessionUser);
            return { id: sessionUser.id, email: sessionUser.email };
        }

        writeAuthCache(null);
        return null;
    } catch (err) {
        console.warn("Could not read Supabase session:", err);
        return null;
    }
}

async function requireAuth(redirectToLogin = true) {
    const user = await getCurrentUser();
    if (user) return user;

    if (redirectToLogin) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = getPageUrl(`login.html?next=${next}`);
    }

    return null;
}

function initAuthStateListener() {
    const client = createSupabaseClient();
    if (!client || window.__novaAuthListenerReady) return;

    window.__novaAuthListenerReady = true;

    client.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            localStorage.setItem(RECOVERY_FLAG, "1");
            sessionStorage.setItem(RECOVERY_FLAG, "1");
            clearAuthCache();
        }

        const recovery = isRecoveryActive();

        if (recovery && !isPasswordResetPage()) {
            await clearRecoverySessionOutsideResetPage(client);
            return;
        }

        if (recovery && isPasswordResetPage()) {
            clearAuthCache();

            window.dispatchEvent(new CustomEvent("nova:auth-changed", {
                detail: { user: null }
            }));

            return;
        }

        if (session?.user) {
            writeAuthCache(session.user);
        } else {
            clearAuthCache();
        }

        window.dispatchEvent(new CustomEvent("nova:auth-changed", {
            detail: { user: session?.user || null }
        }));
    });
}

async function handleSupabaseLoaded() {
    const client = createSupabaseClient();

    if (!client) return null;

    initAuthStateListener();
    await clearRecoverySessionOutsideResetPage(client);

    window.dispatchEvent(new CustomEvent("nova:supabase-ready", {
        detail: { client }
    }));

    try {
        const user = await getCurrentUser({ forceRefresh: true });

        window.dispatchEvent(new CustomEvent("nova:auth-changed", {
            detail: { user }
        }));
    } catch (error) {
        console.warn("Could not refresh auth state after Supabase loaded:", error);
    }

    return client;
}

window.NovaAuth = {
    createSupabaseClient,
    getCurrentUser,
    requireAuth,
    clearAuthCache,
    clearRecoveryState,
    getPageUrl,
    initAuthStateListener,
    handleSupabaseLoaded
};

document.addEventListener("DOMContentLoaded", async () => {
    await handleSupabaseLoaded();
});