import { t } from '../lib/i18n.js';

const STORAGE_PREFIX = 'springwave_notice_seen_';

/**
 * Display a persistent in-page notice box banner.
 * @param {Object} options
 * @param {string} options.id - Unique ID for this notice (used to track one-time display in localStorage)
 * @param {string} options.message - The text message or translation key
 * @param {string} [options.type='success'] - 'success' | 'info' | 'warning' | 'error'
 * @param {string} [options.containerId='notice-container'] - Container element ID
 * @param {boolean} [options.once=true] - If true, only shows once per user until dismissed or recorded
 * @param {Function} [options.onDismiss] - Callback when dismissed
 */
export function showNoticeBox(options) {
    const {
        id,
        message,
        type = 'success',
        containerId = 'notice-container',
        once = true,
        onDismiss
    } = options;

    if (!id || !message) return;

    // Check if already seen
    if (once && localStorage.getItem(STORAGE_PREFIX + id)) {
        return;
    }

    let container = document.getElementById(containerId);
    if (!container) {
        // Fallback: create notice container with top padding below fixed navbar
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'notice-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-30';
        const main = document.querySelector('main') || document.body;
        main.insertBefore(container, main.firstChild);
    } else {
        if (!container.classList.contains('notice-container')) {
            container.classList.add('notice-container', 'relative', 'z-30');
        }
    }

    // Colors & icons by type
    const typeStyles = {
        success: {
            bg: 'bg-emerald-50 border-emerald-300 text-emerald-900',
            icon: 'check_circle',
            iconColor: 'text-emerald-600'
        },
        info: {
            bg: 'bg-blue-50 border-blue-300 text-blue-900',
            icon: 'info',
            iconColor: 'text-blue-600'
        },
        warning: {
            bg: 'bg-amber-50 border-amber-300 text-amber-900',
            icon: 'warning',
            iconColor: 'text-amber-600'
        },
        error: {
            bg: 'bg-rose-50 border-rose-300 text-rose-900',
            icon: 'error',
            iconColor: 'text-rose-600'
        }
    };

    const style = typeStyles[type] || typeStyles.info;
    const isKey = message.includes('.');
    const messageKey = isKey ? message : '';
    const translatedMsg = isKey ? t(message, message) : message;

    const noticeEl = document.createElement('div');
    noticeEl.id = `notice-box-${id}`;
    noticeEl.className = `notice-box flex items-center justify-between p-4 mb-4 rounded-2xl border ${style.bg} shadow-sm transition-all duration-300 transform translate-y-0 opacity-100`;

    noticeEl.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined ${style.iconColor} text-[24px] shrink-0">${style.icon}</span>
            <p class="notice-box-text text-sm font-medium leading-relaxed" ${messageKey ? `data-i18n="${messageKey}"` : ''}>${translatedMsg}</p>
        </div>
        <button type="button" class="notice-dismiss-btn ml-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors cursor-pointer shrink-0" aria-label="Dismiss">
            <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
    `;

    const dismissBtn = noticeEl.querySelector('.notice-dismiss-btn');
    dismissBtn.addEventListener('click', () => {
        if (once) {
            localStorage.setItem(STORAGE_PREFIX + id, 'true');
        }
        noticeEl.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => {
            noticeEl.remove();
            if (onDismiss) onDismiss();
        }, 300);
    });

    container.appendChild(noticeEl);
    
    // Mark as seen immediately if once is true
    if (once) {
        localStorage.setItem(STORAGE_PREFIX + id, 'true');
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", () => {
        document.querySelectorAll(".notice-box-text[data-i18n]").forEach(p => {
            if (p.dataset.i18n) {
                p.textContent = t(p.dataset.i18n, p.textContent);
            }
        });
    });
}
