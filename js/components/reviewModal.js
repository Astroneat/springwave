import { fetchContent } from "../lib/utils.js";
import { addEventReview } from "../api/activities.js";
import { applyTranslation, t } from "../lib/i18n.js";

let popupOverlay, popupContainer;

export async function openReviewModal(eventId, eventTitle, eventThumbnail, orgName) {
    if (!popupOverlay) {
        popupOverlay = document.getElementById("popup-overlay-2");
        if (!popupOverlay) {
            // Fallback to overlay 1 if overlay 2 doesn't exist
            popupOverlay = document.getElementById("popup-overlay");
            popupContainer = document.getElementById("popup-container");
        } else {
            popupContainer = document.getElementById("popup-container-2");
        }
    }

    try {
        const html = await fetchContent("/components/reviewModal.html");
        popupContainer.innerHTML = html;
        applyTranslation(popupContainer);

        document.getElementById("review-event-title").textContent = eventTitle || "Event";
        document.getElementById("review-event-id").value = eventId;

        const thumbContainer = document.getElementById("review-event-thumbnail-container");
        const thumbImg = document.getElementById("review-event-thumbnail");
        if (eventThumbnail) {
            thumbImg.src = eventThumbnail;
            thumbContainer.classList.remove("hidden");
        } else {
            thumbContainer.classList.add("hidden");
        }

        const orgNameEl = document.getElementById("review-org-name");
        if (orgName) {
            orgNameEl.textContent = orgName;
            orgNameEl.classList.remove("hidden");
        } else {
            orgNameEl.classList.add("hidden");
        }

        const stars = document.querySelectorAll(".star-btn");
        const starContainer = document.getElementById("star-rating");
        const ratingInput = document.getElementById("review-rating-value");
        let selectedRating = 0;

        function updateReviewStars(rating) {
            stars.forEach(s => {
                if (parseInt(s.dataset.value) <= rating) {
                    s.classList.remove("text-gray-300");
                    s.classList.add("text-yellow-400");
                } else {
                    s.classList.remove("text-yellow-400");
                    s.classList.add("text-gray-300");
                }
            });
        }

        stars.forEach(star => {
            star.addEventListener("mouseenter", () => {
                updateReviewStars(parseInt(star.dataset.value));
            });
            star.addEventListener("click", () => {
                selectedRating = parseInt(star.dataset.value);
                ratingInput.value = selectedRating;
                updateReviewStars(selectedRating);
            });
        });

        starContainer?.addEventListener("mouseleave", () => {
            updateReviewStars(selectedRating);
        });

        document.getElementById("review-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const rating = parseInt(ratingInput.value);
            const content = document.getElementById("review-content").value.trim();
            const statusEl = document.getElementById("review-status");

            statusEl.classList.remove("hidden", "text-green-600", "text-red-600");

            if (!rating || rating < 1 || rating > 5) {
                statusEl.textContent = t("review.select_rating", "Please select a rating.");
                statusEl.classList.add("text-red-600");
                return;
            }

            try {
                const btn = document.getElementById("submit-review-btn");
                const originalText = btn.innerHTML;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("review.submitting", "Submitting...")}`;
                btn.disabled = true;

                await addEventReview(eventId, rating, content);

                statusEl.textContent = t("review.success", "Review submitted successfully!");
                statusEl.classList.add("text-green-600");
                
                setTimeout(() => {
                    closeReviewModal();
                }, 1500);
            } catch (err) {
                statusEl.textContent = err.message || t("review.failed", "Failed to submit review.");
                statusEl.classList.add("text-red-600");
                document.getElementById("submit-review-btn").innerHTML = t("review.submit_btn", "Submit Review");
                document.getElementById("submit-review-btn").disabled = false;
            }
        });

        document.getElementById("close-review-modal").addEventListener("click", closeReviewModal);

        popupOverlay.setAttribute("role", "dialog");
        popupOverlay.setAttribute("aria-modal", "true");
        popupOverlay.setAttribute("aria-label", "Write Event Review");

        popupOverlay.removeAttribute("hidden");
        // Force reflow
        void popupOverlay.offsetWidth;
        popupOverlay.classList.add("active");
        document.body.style.overflow = "hidden";
        
        // Setup outside click to close
        const backdrop = popupOverlay.querySelector(".popup-backdrop");
        if (backdrop) {
            backdrop.onclick = closeReviewModal;
        }

        const handleEscape = (e) => {
            if (e.key === "Escape" && popupOverlay && popupOverlay.classList.contains("active")) {
                closeReviewModal();
                document.removeEventListener("keydown", handleEscape);
            }
        };
        document.addEventListener("keydown", handleEscape);

    } catch (err) {
        console.error("Failed to load review modal", err);
    }
}

function closeReviewModal() {
    if (!popupOverlay) return;
    popupOverlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        popupOverlay.setAttribute("hidden", "true");
        if (popupContainer) popupContainer.innerHTML = "";
    }, 300);
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", () => {
        if (popupOverlay && popupOverlay.classList.contains("active") && popupContainer) {
            applyTranslation(popupContainer);
        }
    });
}
