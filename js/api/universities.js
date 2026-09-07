import { get, post, put, del, uploadFormData } from "./client.js";

const CACHE_KEY = 'springwave_universities';
const DOMAIN_CACHE_KEY = 'springwave_university_domains';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function clearUniversityCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(DOMAIN_CACHE_KEY);
  } catch (e) {}
}

/**
 * Get current user's joined university.
 * @returns {Promise<Object|null>}
 */
export async function getMyUniversity() {
  try {
    const data = await get('/community/universities/me');
    return data?.university || null;
  } catch (err) {
    return null;
  }
}

/**
 * Get all active universities. Cached in sessionStorage.
 * @returns {Promise<Array>} Array of university objects {name, shortName, domains, logo, color}
 */
export async function getUniversities() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch (e) {}

  try {
    const result = await get('/universities');
    const universities = result.universities || [];
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: universities, ts: Date.now() }));
    } catch (e) {}
    return universities;
  } catch (err) {
    console.error('Failed to fetch universities from API:', err);
    return [];
  }
}

/**
 * Get domain-to-university mapping. Cached in sessionStorage.
 * @returns {Promise<Object>} Map of { "vku.udn.vn": { id, name, shortName }, ... }
 */
export async function getDomainMap() {
  try {
    const cached = sessionStorage.getItem(DOMAIN_CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch (e) {}

  try {
    const result = await get('/universities/domains');
    const domains = result.domains || {};
    try {
      sessionStorage.setItem(DOMAIN_CACHE_KEY, JSON.stringify({ data: domains, ts: Date.now() }));
    } catch (e) {}
    return domains;
  } catch (err) {
    console.error('Failed to fetch university domain map from API:', err);
    return {};
  }
}

/**
 * Check if an email belongs to a known school domain.
 * Uses the cached domain map from the API.
 * @param {string} email
 * @returns {Promise<{isSchool: boolean, university: Object|null}>}
 */
export async function checkSchoolEmail(email) {
  if (!email || typeof email !== 'string') return { isSchool: false, university: null };
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { isSchool: false, university: null };

  const domainMap = await getDomainMap();

  for (const [schoolDomain, uni] of Object.entries(domainMap)) {
    if (domain === schoolDomain || domain.endsWith('.' + schoolDomain)) {
      return { isSchool: true, university: uni };
    }
  }
  return { isSchool: false, university: null };
}

/**
 * Populate a <select> element with university options.
 * @param {HTMLSelectElement|string} selectElOrId
 * @param {string} [selectedValue] - Pre-select this university name
 */
export async function populateUniversitySelect(selectElOrId, selectedValue = '') {
  const selectEl = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
  if (!selectEl) return;

  const universities = await getUniversities();
  
  // Clear existing options except placeholder
  const placeholder = selectEl.options[0]?.value === '' ? selectEl.options[0] : null;
  selectEl.innerHTML = '';
  if (placeholder) {
    selectEl.appendChild(placeholder);
  }

  universities.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.name;
    opt.textContent = u.shortName ? `${u.name} (${u.shortName})` : u.name;
    if (selectedValue && (u.name === selectedValue || u.shortName === selectedValue)) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  if (selectedValue) {
    selectEl.value = selectedValue;
  }
}

/**
 * Populate a <select> element with university options using MongoDB ObjectIds for Organization registration/settings.
 * Option 1 is empty value ("") for "Tự do / Không thuộc trường nào".
 * @param {HTMLSelectElement|string} selectElOrId
 * @param {string} [selectedValue] - Pre-select by ID or name
 * @param {string} [defaultOptionText] - Custom label for the free/unaffiliated option
 */
export async function populateOrgUniversitySelect(selectElOrId, selectedValue = '', defaultOptionText = 'Tự do / Không thuộc trường nào (Independent)') {
  const selectEl = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
  if (!selectEl) return;

  const universities = await getUniversities();

  selectEl.innerHTML = `<option value="">${defaultOptionText}</option>`;

  universities.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u._id;
    opt.textContent = u.shortName ? `${u.name} (${u.shortName})` : u.name;
    if (
      selectedValue &&
      (String(u._id) === String(selectedValue) ||
       u.name === selectedValue ||
       u.shortName === selectedValue)
    ) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  if (selectedValue) {
    const matched = Array.from(selectEl.options).find(
      opt => opt.value === String(selectedValue)
    );
    if (matched) {
      selectEl.value = matched.value;
    }
  }
}

/* ==========================================================================
   ADMIN API METHODS
   ========================================================================== */

/**
 * Get all universities including inactive ones (Admin only).
 * @param {string} [search]
 * @returns {Promise<{universities: Array}>}
 */
export async function getAllUniversitiesAdmin(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return await get(`/universities/admin/all${query}`);
}

/**
 * Create a new university (Admin only).
 * @param {Object} data
 * @returns {Promise<{message: string, university: Object}>}
 */
export async function createUniversity(data) {
  const res = await post('/universities', data);
  clearUniversityCache();
  return res;
}

/**
 * Update an existing university (Admin only).
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<{message: string, university: Object}>}
 */
export async function updateUniversity(id, data) {
  const res = await put(`/universities/${id}`, data);
  clearUniversityCache();
  return res;
}

/**
 * Delete a university (Admin only).
 * @param {string} id
 * @returns {Promise<{message: string}>}
 */
export async function deleteUniversity(id) {
  const res = await del(`/universities/${id}`);
  clearUniversityCache();
  return res;
}

/**
 * Upload a logo image for a university (Admin only).
 * @param {File} file
 * @returns {Promise<{logoUrl: string}>}
 */
export async function uploadUniversityLogo(file) {
  const formData = new FormData();
  formData.append('logo', file);
  return await uploadFormData('/universities/upload-logo', formData);
}

/**
 * Get all students associated with a university (Admin only).
 * @param {string} id
 * @returns {Promise<{university: Object, students: Array}>}
 */
export async function getUniversityStudentsAdmin(id) {
  return await get(`/universities/admin/${id}/students`);
}

/**
 * Remove a student from a university (Admin only).
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<{message: string, user: Object}>}
 */
export async function deleteUniversityStudentAdmin(id, userId) {
  return await del(`/universities/admin/${id}/students/${userId}`);
}
