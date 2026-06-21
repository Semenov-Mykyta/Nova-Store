async function autofillSupportEmail() {
    const emailInput = document.getElementById("support-email");
    if (!emailInput) return;

    const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });

    if (user?.email) {
        emailInput.value = user.email;
        emailInput.readOnly = true;
        emailInput.classList.add("is-autofilled");
        emailInput.title = "Email from your account";
    } else {
        emailInput.value = "";
        emailInput.readOnly = false;
        emailInput.classList.remove("is-autofilled");
        emailInput.removeAttribute("title");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("support-form");
    const statusEl = document.getElementById("support-status");
    const submitBtn = document.getElementById("support-submit");

    if (!form) return;

    await autofillSupportEmail();
    window.addEventListener("nova:auth-changed", autofillSupportEmail);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        statusEl.textContent = "";
        statusEl.className = "form-status";

        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";

        const name = document.getElementById("support-name").value.trim();
        const email = document.getElementById("support-email").value.trim();
        const subject = document.getElementById("support-subject").value.trim();
        const order = document.getElementById("support-order").value.trim();
        const message = document.getElementById("support-message").value.trim();

        if (!name || !email || !subject || !message) {
            statusEl.textContent = "Please fill in all required fields.";
            statusEl.classList.add("error");

            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
            return;
        }

        try {
            const { error } = await window.supabaseClient.functions.invoke("support", {
                body: {
                    name,
                    email,
                    subject,
                    order,
                    message
                }
            });

            if (error) {
                throw error;
            }

            statusEl.textContent = "Message sent successfully!";
            statusEl.classList.add("success");

            form.reset();
            await autofillSupportEmail();

        } catch (err) {
            console.error("Support error:", err);
            statusEl.textContent = "Something went wrong. Try again.";
            statusEl.classList.add("error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
        }
    });
});