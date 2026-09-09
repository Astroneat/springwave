/**
 * Unified Pagination Component for SpringWave
 * Used across explore, community forum, host dashboard, and admin tables.
 */

export function renderPagination({
  container,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}) {
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  let html = "";

  // Previous button
  html += `
    <button type="button" class="pagination-btn nav-btn" ${
      currentPage === 1 ? "disabled" : ""
    } data-page="${currentPage - 1}" aria-label="Previous page">
      <span class="material-symbols-outlined text-sm">chevron_left</span>
    </button>
  `;

  // Page numbers with ellipsis
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 2 && i <= currentPage + 2)
    ) {
      html += `
        <button type="button" class="pagination-btn num-btn ${
          i === currentPage ? "active" : ""
        }" data-page="${i}" aria-current="${i === currentPage ? "page" : "false"}">
          ${i}
        </button>
      `;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  // Next button
  html += `
    <button type="button" class="pagination-btn nav-btn" ${
      currentPage === totalPages ? "disabled" : ""
    } data-page="${currentPage + 1}" aria-label="Next page">
      <span class="material-symbols-outlined text-sm">chevron_right</span>
    </button>
  `;

  container.innerHTML = html;

  // Add click handlers
  container
    .querySelectorAll(".pagination-btn:not([disabled])")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = parseInt(btn.dataset.page, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages && page !== currentPage) {
          if (typeof onPageChange === "function") {
            onPageChange(page);
          }
        }
      });
    });
}
