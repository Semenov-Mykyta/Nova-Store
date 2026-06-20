/* EmailJS configuration used to send support messages */
const EMAILJS_PUBLIC_KEY = "zWpLd3YXblspaCcRc";
const EMAILJS_SERVICE_ID = "service_knm5jpr";
const EMAILJS_TEMPLATE_ID = "template_t7dqfdg";

let supportAutofilledEmail = "";

/**
 * Automatically fills the support email field for logged-in users.
 * The field stays editable for guests, but becomes read-only for authenticated users.
 */
async function autofillSupportEmail() {
    const emailInput = document.getElementById("support-email");
    if (!emailInput) return;

    const user = await window.NovaAuth?.getCurrentUser?.({ forceRefresh: true });

    if (user?.email) {
        supportAutofilledEmail = user.email;
        emailInput.value = user.email;
        emailInput.readOnly = true;
        emailInput.classList.add("is-autofilled");
        emailInput.setAttribute("title", "Email from your logged-in account");
    } else {
        supportAutofilledEmail = "";
        emailInput.readOnly = false;
        emailInput.classList.remove("is-autofilled");
        emailInput.removeAttribute("title");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    /* Initialize EmailJS with the public key if the library has loaded */
    if (typeof emailjs !== "undefined") {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    const form = document.getElementById("support-form");
    const statusEl = document.getElementById("support-status");
    const submitBtn = document.getElementById("support-submit");

    /* Exit early if the support form is not present on this page */
    if (!form) return;

    autofillSupportEmail();
    window.addEventListener("nova:auth-changed", autofillSupportEmail);

    /* Handle support form submission */
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        /* Make sure the email is still synced with the current logged-in user */
        await autofillSupportEmail();

        /* Clear any previous status message */
        statusEl.textContent = "";
        statusEl.className = "form-status";

        /* Disable the button while the request is in flight */
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";

        /* Read all form field values */
        const name = document.getElementById("support-name").value.trim();
        const email = document.getElementById("support-email").value.trim();
        const subject = document.getElementById("support-subject").value.trim();
        const order = document.getElementById("support-order").value.trim();
        const message = document.getElementById("support-message").value.trim();

        /* Validate that all required fields are filled in */
        if (!name || !email || !subject || !message) {
            statusEl.textContent = "Please fill in all required fields.";
            statusEl.classList.add("error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
            return;
        }

        if (typeof emailjs === "undefined") {
            statusEl.textContent = "Email service is not loaded. Check your internet connection or EmailJS script URL.";
            statusEl.classList.add("error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
            return;
        }

        /* Build the parameters object for the EmailJS template */
        const templateParams = {
            name,
            email,
            customer_email: email,
            reply_to: email,
            subject,
            order,
            message
        };

        try {
            /* Send the email via EmailJS using the configured service and template */
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
            statusEl.textContent = "Message sent successfully.";
            statusEl.classList.add("success");

            /* Clear the form fields after a successful send */
            form.reset();

            /* Restore logged-in user's email after reset */
            if (supportAutofilledEmail) {
                const emailInput = document.getElementById("support-email");
                emailInput.value = supportAutofilledEmail;
                emailInput.readOnly = true;
                emailInput.classList.add("is-autofilled");
            }
        } catch (err) {
            console.error("Support message failed:", err);
            statusEl.textContent = "Something went wrong. Please try again.";
            statusEl.classList.add("error");
        } finally {
            /* Always re-enable the button regardless of outcome */
            submitBtn.disabled = false;
            submitBtn.textContent = "Send message";
        }
    });
});
