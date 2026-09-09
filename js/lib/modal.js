/**
 * Accessible Modal Controller for SpringWave
 * Handles focus trapping, Escape key listener, scroll locking, and focus restoration.
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function setupModal({
  modal,
  backdrop,
  closeButtons = [],
  onClose,
  onOpen,
}) {
  if (!modal) return null;

  let lastActiveElement = null;
  let keydownHandler = null;

  const getFocusableElements = () => {
    return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
      (el) => el.offsetParent !== null
    );
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  const open = () => {
    lastActiveElement = document.activeElement;

    // Prevent body scrolling
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.removeAttribute('hidden');
    modal.classList.add('active');

    if (backdrop) {
      backdrop.removeAttribute('hidden');
      backdrop.classList.add('active');
    }

    keydownHandler = handleKeydown;
    document.addEventListener('keydown', keydownHandler);

    // Focus first focusable element
    requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modal.focus();
      }
      if (onOpen) onOpen();
    });
  };

  const close = () => {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }

    modal.classList.remove('active');
    if (backdrop) {
      backdrop.classList.remove('active');
    }

    setTimeout(() => {
      modal.setAttribute('hidden', '');
      if (backdrop) backdrop.setAttribute('hidden', '');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';

      if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
        lastActiveElement.focus();
      }
      if (onClose) onClose();
    }, 200);
  };

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }

  closeButtons.forEach((btn) => {
    if (btn) btn.addEventListener('click', close);
  });

  return { open, close };
}
