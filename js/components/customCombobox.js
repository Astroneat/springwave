/**
 * SpringWave Custom Combobox & Dropdown UI
 * Replaces OS-native <select> dropdown popups with a sleek, in-DOM custom dropdown
 * featuring SpringWave design language, system blue hover, checkmark indicators,
 * smooth animations, and full two-way synchronization with original <select>.
 */

const COMBOBOX_TARGETS = [
  '#formatSelect',
  '#ticketFormatSelect',
  '#events-status-filter',
  '#school-filter',
  '#settings-university',
  '#scanner-camera-select',
  '#cert-grid-size-select',
  '#field-ctrl-qr-frame',
  '#field-ctrl-font',
  '#field-ctrl-spacing',
  '#field-ctrl-weight',
  '#online-host-duration',
  '#test-email-provider',
  '#orgUniversity',
  '#meetingPlatform',
  '#postIdentitySelect',
  '#uniName',
  '#school',
  '#edit-school',
  '.custom-combobox',
  '[data-combobox]'
];

const FORMAT_ICONS = {
  all: 'devices',
  online: 'videocam',
  offline: 'location_on'
};

export function enhanceSelect(selectEl, customConfig = {}) {
  if (!selectEl || !(selectEl instanceof HTMLSelectElement)) return null;
  if (selectEl._customCombobox) {
    selectEl._customCombobox.refreshOptions();
    return selectEl._customCombobox;
  }

  const parent = selectEl.parentElement;
  if (!parent) return null;

  // Detect size from original select
  const isXs = selectEl.className.includes('text-xs') || selectEl.className.includes('text-[11px]');
  const isLarge = selectEl.className.includes('h-12') || selectEl.className.includes('auth-input');
  const isShrink = selectEl.className.includes('shrink-0') || selectEl.className.includes('w-auto');
  
  let paddingClass = 'px-3.5 py-2.5 text-xs sm:text-sm';
  if (isXs) {
    paddingClass = 'px-3 py-2 text-xs';
  } else if (isLarge) {
    paddingClass = 'h-12 px-4 text-sm';
  }

  // Detect leading icon from data-icon or parent siblings
  let leadingIconName = selectEl.dataset.icon || customConfig.leadingIcon || '';
  if (!leadingIconName && (selectEl.id === 'formatSelect' || selectEl.id === 'ticketFormatSelect')) {
    leadingIconName = 'devices';
  }

  // Inspect and HIDE all absolute/floating siblings in parent to prevent any overlap
  const siblings = Array.from(parent.children).filter(el => el !== selectEl);
  siblings.forEach(sibling => {
    const text = sibling.textContent?.trim() || '';
    const isIcon = sibling.classList?.contains('material-symbols-outlined') || 
                   sibling.querySelector?.('.material-symbols-outlined') || 
                   sibling.tagName === 'I' ||
                   sibling.querySelector?.('i');
    
    if (isIcon || text === 'devices' || text === 'expand_more' || text === 'unfold_more' || text === 'location_on') {
      if (!leadingIconName && (text === 'devices' || text === 'location_on' || text === 'school')) {
        leadingIconName = text;
      }
      sibling.style.setProperty('display', 'none', 'important');
      sibling.setAttribute('aria-hidden', 'true');
      sibling.setAttribute('hidden', '');
    }
  });

  // Visually hide native select while keeping it functional in DOM
  selectEl.classList.add('custom-combobox-hidden');
  selectEl.setAttribute('tabindex', '-1');
  selectEl.setAttribute('aria-hidden', 'true');

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = `custom-combobox-wrapper relative ${isShrink ? 'inline-block' : 'w-full'} ${customConfig.wrapperClass || ''}`;
  if (selectEl.id) wrapper.dataset.customComboboxFor = selectEl.id;

  // Create trigger button (flexbox: icon -> label -> arrow)
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = `custom-combobox-trigger w-full flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 outline-none transition-all cursor-pointer shadow-xs ${paddingClass} ${isXs ? 'is-sm' : ''} ${customConfig.triggerClass || ''}`.trim();
  triggerBtn.setAttribute('aria-haspopup', 'listbox');
  triggerBtn.setAttribute('aria-expanded', 'false');

  // Optional leading icon element inside the trigger
  let leadingIconSpan = null;
  if (leadingIconName) {
    leadingIconSpan = document.createElement('span');
    leadingIconSpan.className = 'custom-combobox-leading-icon material-symbols-outlined text-[18px] text-slate-400 shrink-0 select-none';
    const activeIcon = FORMAT_ICONS[selectEl.value] || leadingIconName;
    leadingIconSpan.textContent = activeIcon;
    triggerBtn.appendChild(leadingIconSpan);
  }

  // Label element (flex-1 so it takes all middle space)
  const labelSpan = document.createElement('span');
  labelSpan.className = 'custom-combobox-label truncate flex-1 text-left min-w-0';

  // Trailing arrow icon
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'custom-combobox-arrow material-symbols-outlined text-[19px] text-slate-400 shrink-0 select-none';
  arrowSpan.textContent = 'expand_more';

  triggerBtn.appendChild(labelSpan);
  triggerBtn.appendChild(arrowSpan);
  wrapper.appendChild(triggerBtn);

  // Create dropdown menu panel
  const menu = document.createElement('div');
  menu.className = 'custom-combobox-menu hidden';
  menu.setAttribute('role', 'listbox');
  wrapper.appendChild(menu);

  // Function to build / refresh menu items
  function renderItems() {
    menu.innerHTML = '';
    const options = Array.from(selectEl.options);
    const currentValue = selectEl.value;
    let selectedFound = false;
    let selectedText = '';

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-combobox-item';
      item.dataset.value = opt.value;
      item.setAttribute('role', 'option');

      const isSelected = opt.value === currentValue || (!selectedFound && opt.selected);
      if (isSelected && !selectedFound) {
        selectedFound = true;
        item.classList.add('is-selected');
        item.setAttribute('aria-selected', 'true');
        selectedText = opt.textContent.trim();
        if (leadingIconSpan) {
          leadingIconSpan.textContent = FORMAT_ICONS[opt.value] || leadingIconName;
        }
      } else {
        item.setAttribute('aria-selected', 'false');
      }

      if (opt.disabled) {
        item.classList.add('opacity-40', 'pointer-events-none');
      }

      // Left container: item icon (if any) + label text
      const leftBox = document.createElement('div');
      leftBox.className = 'flex items-center gap-2 min-w-0 flex-1';

      const itemIconName = FORMAT_ICONS[opt.value] || (leadingIconName && options.length <= 4 ? leadingIconName : '');
      if (itemIconName) {
        const itemIconSpan = document.createElement('span');
        itemIconSpan.className = 'material-symbols-outlined text-[17px] text-slate-400 shrink-0 select-none custom-combobox-item-icon';
        itemIconSpan.textContent = itemIconName;
        leftBox.appendChild(itemIconSpan);
      }

      const textSpan = document.createElement('span');
      textSpan.className = 'truncate text-left';
      textSpan.textContent = opt.textContent.trim();
      leftBox.appendChild(textSpan);

      // Checkmark icon on right
      const checkIcon = document.createElement('span');
      checkIcon.className = 'custom-combobox-item-check material-symbols-outlined select-none';
      checkIcon.textContent = 'check';

      item.appendChild(leftBox);
      item.appendChild(checkIcon);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.disabled) return;
        selectValue(opt.value, true);
        close();
      });

      menu.appendChild(item);
    });

    if (!selectedText && options.length > 0) {
      selectedText = options[0].textContent.trim();
    }
    labelSpan.textContent = selectedText || customConfig.placeholder || 'Select...';
  }

  function syncFromSelect() {
    const currentValue = selectEl.value;
    const items = menu.querySelectorAll('.custom-combobox-item');
    let matchedText = '';

    items.forEach(item => {
      const isSelected = item.dataset.value === currentValue;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        const textEl = item.querySelector('.truncate');
        if (textEl) matchedText = textEl.textContent.trim();
      }
    });

    if (!matchedText) {
      const opt = Array.from(selectEl.options).find(o => o.value === currentValue);
      if (opt) matchedText = opt.textContent.trim();
    }

    if (matchedText) {
      labelSpan.textContent = matchedText;
    }

    if (leadingIconSpan) {
      leadingIconSpan.textContent = FORMAT_ICONS[currentValue] || leadingIconName;
    }
  }

  function selectValue(val, triggerChange = true) {
    if (selectEl.value !== val) {
      selectEl.value = val;
      if (triggerChange) {
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    syncFromSelect();
  }

  function open() {
    // Close other open comboboxes
    document.querySelectorAll('.custom-combobox-wrapper.is-open').forEach(w => {
      if (w !== wrapper && w._comboboxInstance) {
        w._comboboxInstance.close();
      }
    });

    // Check viewport space
    const rect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estHeight = Math.min(menu.scrollHeight || 180, 260);

    if (spaceBelow < estHeight + 10 && rect.top > estHeight) {
      menu.classList.remove('top-full', 'mt-1.5');
      menu.classList.add('bottom-full', 'mb-1.5');
    } else {
      menu.classList.remove('bottom-full', 'mb-1.5');
      menu.classList.add('top-full', 'mt-1.5');
    }

    menu.classList.remove('hidden');
    wrapper.classList.add('is-open');
    triggerBtn.setAttribute('aria-expanded', 'true');

    // Scroll selected item into view
    const selectedItem = menu.querySelector('.custom-combobox-item.is-selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function close() {
    menu.classList.add('hidden');
    wrapper.classList.remove('is-open');
    triggerBtn.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (wrapper.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  triggerBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!wrapper.classList.contains('is-open')) {
        open();
      } else {
        const items = Array.from(menu.querySelectorAll('.custom-combobox-item:not(.opacity-40)'));
        const activeIndex = items.findIndex(i => i.classList.contains('is-selected'));
        const nextIndex = e.key === 'ArrowDown' 
          ? (activeIndex + 1) % items.length 
          : (activeIndex - 1 + items.length) % items.length;
        if (items[nextIndex]) {
          selectValue(items[nextIndex].dataset.value, true);
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!wrapper.classList.contains('is-open')) {
        open();
      } else {
        close();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });

  // Insert wrapper right after selectEl
  selectEl.after(wrapper);

  // Hook value property setter on selectEl instance
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(selectEl, 'value', {
    get() {
      return originalDescriptor.get.call(selectEl);
    },
    set(newVal) {
      originalDescriptor.set.call(selectEl, newVal);
      syncFromSelect();
    },
    configurable: true
  });

  selectEl.addEventListener('change', syncFromSelect);

  // MutationObserver for options change
  const observer = new MutationObserver(() => {
    renderItems();
  });
  observer.observe(selectEl, { childList: true, subtree: true, characterData: true });

  const langHandler = () => {
    setTimeout(renderItems, 60);
  };
  window.addEventListener('language-changed', langHandler);

  renderItems();

  const instance = {
    wrapper,
    triggerBtn,
    menu,
    open,
    close,
    toggle,
    selectValue,
    refreshOptions: renderItems,
    syncFromSelect,
    destroy() {
      observer.disconnect();
      window.removeEventListener('language-changed', langHandler);
      wrapper.remove();
      selectEl.classList.remove('custom-combobox-hidden');
      selectEl.removeAttribute('tabindex');
      selectEl.removeAttribute('aria-hidden');
      delete selectEl._customCombobox;
    }
  };

  wrapper._comboboxInstance = instance;
  selectEl._customCombobox = instance;
  return instance;
}

export function enhanceAllSelects(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const selectorStr = COMBOBOX_TARGETS.join(', ');
  const selects = root.querySelectorAll(selectorStr);
  const instances = [];
  selects.forEach(sel => {
    if (sel.tagName === 'SELECT' && !sel.classList.contains('time-select') && !sel.classList.contains('no-custom-combobox')) {
      const inst = enhanceSelect(sel);
      if (inst) instances.push(inst);
    }
  });
  return instances;
}

// Global click & escape handler
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.custom-combobox-wrapper.is-open').forEach(wrapper => {
      if (!wrapper.contains(e.target) && wrapper._comboboxInstance) {
        wrapper._comboboxInstance.close();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-combobox-wrapper.is-open').forEach(wrapper => {
        if (wrapper._comboboxInstance) {
          wrapper._comboboxInstance.close();
        }
      });
    }
  });

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceAllSelects());
  } else {
    setTimeout(() => enhanceAllSelects(), 0);
  }
}
