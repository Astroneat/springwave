import '../../src/style.css';
import { isAuthenticated, getUser } from '../lib/session.js';
import { loadNavbar } from '../components/navbar.js';
import { initChatbot } from '../components/chatbot.js';
import { fetchContent, formatDate, isUserVerifiedOrExempt } from '../lib/utils.js';
import { showVerificationModal } from '../components/verificationGuard.js';
import { t } from '../lib/i18n.js';
import { openEventPopup } from '../components/eventPopup.js';
import { showNoticeBox } from '../components/noticeBox.js';
import * as roadmapApi from '../api/roadmap.js';
import { get } from '../api/client.js';
import { CDN_DOMAIN } from '../config.js';

let currentStep = 1;
const MAX_STEPS = 6;
let map, circle, marker;
let selectedLocation = { lat: 10.7769, lng: 106.7009, address: '' };
let generatedRoadmapId = null;
let timelineData = [];
let currentRoadmap = null;
let rawCategories = null;
let skeletonInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (!isAuthenticated()) {
        window.location.href = "/login.html";
        return;
    }

    const user = getUser();
    if (!isUserVerifiedOrExempt(user)) {
        showVerificationModal('create a roadmap');
    }

    await loadNavbar();
    await loadFooter();
    await initChatbot();
    
    initWizard();
    initLocationStep();
    initCategoriesStep();
    initSkillsStep();
    prefillFromUserProfile(user);

    window.addEventListener("language-changed", handleLanguageChanged);

    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
        await loadExistingRoadmap(id);
    }
});

function prefillFromUserProfile(user) {
    if (!user) return;
    const goalInput = document.getElementById('goal-input');
    if (goalInput && !goalInput.value.trim()) {
        if (user.profile?.goal) {
            goalInput.value = user.profile.goal;
        } else if (user.major || user.profile?.major) {
            const major = user.major || user.profile?.major;
            goalInput.value = t('roadmap.default_goal', { major }) || `Phát triển toàn diện kiến thức chuyên môn và kỹ năng thực chiến ngành ${major}`;
        }
    }

    if (Array.isArray(user.profile?.skills) && user.profile.skills.length > 0 && typeof window.addSkillTag === 'function') {
        user.profile.skills.slice(0, 4).forEach(s => window.addSkillTag(s));
    }
}

async function loadFooter() {
    try {
        const html = await fetchContent("./components/footer.html");
        const footerContainer = document.getElementById("footer-container");
        if (footerContainer && html) {
            footerContainer.innerHTML = html;
        }
    } catch (e) {}
}

function initWizard() {
    const btnNext = document.getElementById('btn-next');
    const btnBack = document.getElementById('btn-back');
    const btnGenerate = document.getElementById('btn-generate');
    
    btnNext?.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            if (currentStep < MAX_STEPS) {
                currentStep++;
                showStep(currentStep);
            }
        }
    });
    
    btnBack?.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    });

    btnGenerate?.addEventListener('click', handleGenerate);

    // Goal preset suggestions
    document.querySelectorAll('.roadmap-preset-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-preset-key');
            let preset = '';
            if (key) {
                preset = t(`roadmap.preset_${key}_val`);
            }
            if (!preset || preset === `roadmap.preset_${key}_val`) {
                preset = btn.getAttribute('data-preset') || btn.textContent.trim();
            }
            const goalInput = document.getElementById('goal-input');
            if (goalInput && preset) {
                goalInput.value = preset;
                goalInput.focus();
            }
        });
    });

    // Stepper tab click navigation
    document.querySelectorAll('.roadmap-step-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const stepNum = parseInt(tab.getAttribute('data-step'), 10);
            if (stepNum && stepNum < currentStep) {
                currentStep = stepNum;
                showStep(currentStep);
            } else if (stepNum && stepNum === currentStep + 1 && validateStep(currentStep)) {
                currentStep = stepNum;
                showStep(currentStep);
            }
        });
    });

    // Timeframe toggle buttons
    const btnShortTerm = document.getElementById('btn-short-term');
    const btnLongTerm = document.getElementById('btn-long-term');

    btnShortTerm?.addEventListener('click', () => {
        btnShortTerm.classList.add('active');
        btnLongTerm?.classList.remove('active');
        const d = new Date();
        const startDateEl = document.getElementById('start-date');
        const endDateEl = document.getElementById('end-date');
        if (startDateEl) startDateEl.value = d.toISOString().split('T')[0];
        d.setMonth(d.getMonth() + 1);
        if (endDateEl) endDateEl.value = d.toISOString().split('T')[0];
    });

    btnLongTerm?.addEventListener('click', () => {
        btnLongTerm.classList.add('active');
        btnShortTerm?.classList.remove('active');
        const d = new Date();
        const startDateEl = document.getElementById('start-date');
        const endDateEl = document.getElementById('end-date');
        if (startDateEl) startDateEl.value = d.toISOString().split('T')[0];
        d.setMonth(d.getMonth() + 6);
        if (endDateEl) endDateEl.value = d.toISOString().split('T')[0];
    });

    // Pre-populate short term default dates
    if (btnShortTerm) {
        const d = new Date();
        const startDateEl = document.getElementById('start-date');
        const endDateEl = document.getElementById('end-date');
        if (startDateEl && !startDateEl.value) startDateEl.value = d.toISOString().split('T')[0];
        d.setMonth(d.getMonth() + 1);
        if (endDateEl && !endDateEl.value) endDateEl.value = d.toISOString().split('T')[0];
    }

    // Time slot cards (multi-select)
    document.querySelectorAll('.roadmap-slot-card').forEach(el => {
        const toggleCard = () => {
            const isActive = el.classList.toggle('active');
            el.setAttribute('aria-checked', isActive ? 'true' : 'false');
        };
        el.addEventListener('click', toggleCard);
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleCard();
            }
        });
    });

    // Day pills (single select)
    document.querySelectorAll('.roadmap-day-pill').forEach(el => {
        const selectPill = () => {
            document.querySelectorAll('.roadmap-day-pill').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-checked', 'false');
            });
            el.classList.add('active');
            el.setAttribute('aria-checked', 'true');
        };
        el.addEventListener('click', selectPill);
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                selectPill();
            }
        });
    });

    // Result actions
    document.getElementById('btn-confirm')?.addEventListener('click', handleConfirm);
    document.getElementById('btn-regenerate')?.addEventListener('click', () => {
        hideRoadmapSkeleton();
        document.getElementById('roadmap-result')?.classList.add('hidden');
        document.getElementById('roadmap-wizard')?.classList.remove('hidden');
        document.getElementById('roadmap-stepper-wrap')?.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function showStep(n) {
    document.querySelectorAll('.roadmap-step-pane').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${n}`)?.classList.add('active');
    
    document.querySelectorAll('.roadmap-step-tab').forEach((el, idx) => {
        const step = idx + 1;
        el.classList.remove('active', 'completed');
        if (step < n) {
            el.classList.add('completed');
        } else if (step === n) {
            el.classList.add('active');
        }
    });

    const progressWrap = document.getElementById('wizard-progress');
    if (progressWrap) {
        progressWrap.setAttribute('aria-valuenow', n.toString());
    }

    const counterLabel = document.getElementById('step-counter-label');
    if (counterLabel) {
        counterLabel.textContent = t('roadmap.step_counter', { current: n, total: MAX_STEPS });
    }

    const btnBack = document.getElementById('btn-back');
    const btnNext = document.getElementById('btn-next');
    const btnGenerate = document.getElementById('btn-generate');

    if (btnBack) btnBack.classList.toggle('hidden', n === 1);
    
    if (n === MAX_STEPS) {
        if (btnNext) btnNext.classList.add('hidden');
        if (btnGenerate) btnGenerate.classList.remove('hidden');
    } else {
        if (btnNext) btnNext.classList.remove('hidden');
        if (btnGenerate) btnGenerate.classList.add('hidden');
    }

    if (n === 4 && map) {
        setTimeout(() => map.invalidateSize(), 150);
    }
}

function validateStep(n) {
    if (n === 1) {
        const goal = document.getElementById('goal-input')?.value.trim();
        if (!goal) {
            showNoticeBox({ id: 'err-goal', message: t('roadmap.err_goal', 'Please enter your primary growth goal.'), type: 'warning', once: false, containerId: 'notice-container' });
            return false;
        }
        return true;
    }
    if (n === 2) {
        const start = document.getElementById('start-date')?.value;
        const end = document.getElementById('end-date')?.value;
        if (!start || !end) {
            showNoticeBox({ id: 'err-date-req', message: t('roadmap.err_date_req', 'Please select both start and end dates.'), type: 'warning', once: false, containerId: 'notice-container' });
            return false;
        }
        if (new Date(start) > new Date(end)) {
            showNoticeBox({ id: 'err-date-range', message: t('roadmap.err_date_range', 'Start date cannot be after end date.'), type: 'warning', once: false, containerId: 'notice-container' });
            return false;
        }
        return true;
    }
    return true;
}

function initLocationStep() {
    const mapEl = document.getElementById('roadmap-map');
    if (!mapEl || typeof L === 'undefined') return;

    map = L.map('roadmap-map').setView([10.7769, 106.7009], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    marker = L.marker([10.7769, 106.7009], { draggable: true }).addTo(map);
    circle = L.circle([10.7769, 106.7009], { radius: 5000, color: '#1755ba', fillColor: '#1755ba', fillOpacity: 0.12, weight: 2 }).addTo(map);

    const updateLocation = (lat, lng) => {
        selectedLocation.lat = lat;
        selectedLocation.lng = lng;
        marker.setLatLng([lat, lng]);
        circle.setLatLng([lat, lng]);
        map.setView([lat, lng]);
    };

    marker.on('dragend', () => updateLocation(marker.getLatLng().lat, marker.getLatLng().lng));
    map.on('click', (e) => updateLocation(e.latlng.lat, e.latlng.lng));

    const slider = document.getElementById('radius-slider');
    slider?.addEventListener('input', (e) => {
        const km = e.target.value;
        const radiusVal = document.getElementById('radius-val');
        if (radiusVal) radiusVal.textContent = km + 'km';
        circle.setRadius(km * 1000);
    });

    const searchInput = document.getElementById('location-search');
    let timeout;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            if (e.target.value.length < 3) return;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(e.target.value)}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    updateLocation(parseFloat(data[0].lat), parseFloat(data[0].lon));
                    selectedLocation.address = data[0].display_name;
                }
            } catch (err) {}
        }, 500);
    });
}

function getCategoryLabel(cat) {
    if (!cat) return '';
    const rawName = cat.name || '';
    const slug = (cat.slug || rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const directKey = `roadmap.categories_map.${slug}`;
    const directVal = t(directKey);
    if (directVal && directVal !== directKey) {
        return directVal;
    }
    if (slug.includes('academic') || slug.includes('hocthuat') || slug.includes('nghiencuu')) return t('roadmap.categories_map.academic', {}, rawName);
    if (slug.includes('career') || slug.includes('nghenghiep') || slug.includes('vieclam')) return t('roadmap.categories_map.career', {}, rawName);
    if (slug.includes('sport') || slug.includes('thethao')) return t('roadmap.categories_map.sports', {}, rawName);
    if (slug.includes('art') || slug.includes('nghethuat') || slug.includes('vanhoa')) return t('roadmap.categories_map.arts', {}, rawName);
    if (slug.includes('tech') || slug.includes('congnghe') || slug.includes('laptrinh')) return t('roadmap.categories_map.technology', {}, rawName);
    if (slug.includes('volunt') || slug.includes('tinhnguyen') || slug.includes('xahoi')) return t('roadmap.categories_map.volunteer', {}, rawName);
    if (slug.includes('lead') || slug.includes('kynang') || slug.includes('lanhdao')) return t('roadmap.categories_map.leadership', {}, rawName);
    return rawName;
}

function renderCategoryChips() {
    const container = document.getElementById('category-chips');
    if (!container || !rawCategories) return;
    const activeIds = new Set(
        Array.from(container.querySelectorAll('.roadmap-cat-pill.active')).map(el => el.dataset.id)
    );
    container.innerHTML = rawCategories.map(c => {
        const isActive = activeIds.has(c._id);
        const label = getCategoryLabel(c);
        return `<div class="roadmap-cat-pill ${isActive ? 'active' : ''}" data-id="${c._id}" tabindex="0" role="checkbox" aria-checked="${isActive ? 'true' : 'false'}">${escapeHtml(label)}</div>`;
    }).join('');

    container.querySelectorAll('.roadmap-cat-pill').forEach(el => {
        const toggleCat = () => {
            const isActive = el.classList.toggle('active');
            el.setAttribute('aria-checked', isActive ? 'true' : 'false');
        };
        el.addEventListener('click', toggleCat);
        el.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggleCat();
            }
        });
    });
}

async function initCategoriesStep() {
    try {
        const res = await get('/categories');
        if (res && res.categories) {
            rawCategories = res.categories;
            renderCategoryChips();
        }
    } catch (e) {}
}

function initSkillsStep() {
    const input = document.getElementById('skill-input');
    const container = document.getElementById('skills-container');
    const skills = new Set();

    const addSkill = (name) => {
        const trimmed = (name || '').trim();
        if (!trimmed || skills.has(trimmed)) return;
        skills.add(trimmed);
        
        const tag = document.createElement('div');
        tag.className = 'roadmap-skill-item';
        tag.innerHTML = `<span>${escapeHtml(trimmed)}</span><button type="button" aria-label="Remove skill">&times;</button>`;
        tag.querySelector('button')?.addEventListener('click', () => {
            skills.delete(trimmed);
            tag.remove();
        });
        container?.insertBefore(tag, input);
    };

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSkill(input.value);
            input.value = '';
        }
    });

    document.querySelectorAll('.skill-suggest').forEach(el => {
        el.addEventListener('click', () => {
            const text = el.textContent.replace('+', '').trim();
            addSkill(text);
        });
    });
    
    window.getSkills = () => Array.from(skills);
    window.addSkillTag = addSkill;
}

function showRoadmapSkeleton() {
    const skeleton = document.getElementById('roadmap-skeleton');
    const wizard = document.getElementById('roadmap-wizard');
    const stepper = document.getElementById('roadmap-stepper-wrap');
    const result = document.getElementById('roadmap-result');
    
    wizard?.classList.add('hidden');
    stepper?.classList.add('hidden');
    result?.classList.add('hidden');
    skeleton?.classList.remove('hidden');

    const statusEl = document.getElementById('skeleton-status-text');
    const statusKeys = [
        'roadmap.skeleton_status_1',
        'roadmap.skeleton_status_2',
        'roadmap.skeleton_status_3',
        'roadmap.skeleton_status_4'
    ];
    let stepIdx = 0;
    if (statusEl) {
        statusEl.textContent = t(statusKeys[0]);
    }
    clearInterval(skeletonInterval);
    skeletonInterval = setInterval(() => {
        stepIdx = (stepIdx + 1) % statusKeys.length;
        if (statusEl) {
            statusEl.style.opacity = '0';
            setTimeout(() => {
                statusEl.textContent = t(statusKeys[stepIdx]);
                statusEl.style.opacity = '1';
            }, 200);
        }
    }, 2500);
}

function hideRoadmapSkeleton() {
    clearInterval(skeletonInterval);
    skeletonInterval = null;
    const skeleton = document.getElementById('roadmap-skeleton');
    skeleton?.classList.add('hidden');
}

async function handleGenerate() {
    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate?.disabled) return;
    
    if (btnGenerate) btnGenerate.disabled = true;
    showRoadmapSkeleton();

    try {
        const inputData = gatherData();
        const res = await roadmapApi.generateRoadmap(inputData);
        generatedRoadmapId = res.roadmap._id;
        timelineData = res.roadmap.timeline;
        currentRoadmap = res.roadmap;
        
        hideRoadmapSkeleton();
        document.getElementById('roadmap-wizard')?.classList.add('hidden');
        document.getElementById('roadmap-stepper-wrap')?.classList.add('hidden');
        document.getElementById('roadmap-result')?.classList.remove('hidden');
        
        renderResult(res.roadmap);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        hideRoadmapSkeleton();
        document.getElementById('roadmap-wizard')?.classList.remove('hidden');
        document.getElementById('roadmap-stepper-wrap')?.classList.remove('hidden');
        const msg = err.status === 429 
            ? t('roadmap.daily_limit') 
            : (err.message || t("roadmap.error_generating"));
        showNoticeBox({
            id: 'err-generate-' + Date.now(),
            message: msg,
            type: 'error',
            once: false,
            containerId: 'notice-container'
        });
    } finally {
        if (btnGenerate) btnGenerate.disabled = false;
    }
}

function gatherData() {
    const timeSlots = Array.from(document.querySelectorAll('.roadmap-slot-card.active')).map(e => e.dataset.value);
    const dayPreference = document.querySelector('.roadmap-day-pill.active')?.dataset.value || 'both';
    const categories = Array.from(document.querySelectorAll('#category-chips .roadmap-cat-pill.active')).map(e => e.dataset.id);
    const timeframeType = document.getElementById('btn-short-term')?.classList.contains('active') ? 'short' : 'long';
    const radiusVal = parseInt(document.getElementById('radius-slider')?.value || '5', 10);
    
    return {
        goal: document.getElementById('goal-input')?.value || '',
        timeframe: {
            type: timeframeType,
            startDate: document.getElementById('start-date')?.value || '',
            endDate: document.getElementById('end-date')?.value || ''
        },
        availability: {
            timeSlots,
            dayPreference
        },
        location: {
            address: selectedLocation.address || '',
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            radiusKm: radiusVal
        },
        categories,
        expectedSkills: window.getSkills ? window.getSkills() : [],
        wantsCertificate: document.getElementById('cert-toggle')?.checked || false
    };
}

function renderResult(roadmap) {
    if (!roadmap) return;
    currentRoadmap = roadmap;
    const comment = roadmap.aiAnalysis?.userComment || t('roadmap.ai_analysis', 'AI Strategic Diagnosis');
    const commentEl = document.getElementById('ai-comment');
    if (commentEl) commentEl.textContent = comment;
    
    const baseline = roadmap.aiAnalysis?.baselineSpiderChart;
    const projected = roadmap.aiAnalysis?.projectedSpiderChart || roadmap.aiAnalysis?.spiderChart;
    
    const extractValues = (chart) => {
        if (!chart) return [50, 50, 50, 50, 50, 50];
        return [
            chart.communication || 50,
            chart.technical || 50,
            chart.creativity || 50,
            chart.socialImpact || 50,
            chart.leadership || 50,
            chart.teamwork || 50
        ];
    };
    
    const baselineValues = baseline ? extractValues(baseline) : null;
    const projectedValues = extractValues(projected);
    
    renderSpiderChart(baselineValues, projectedValues);
    renderTimeline(roadmap.timeline);
}

function renderSpiderChart(baselineValues, projectedValues) {
    const chartEl = document.getElementById('spider-chart');
    if (!chartEl || typeof Chart === 'undefined') return;
    const ctx = chartEl.getContext('2d');
    if (window.spiderChartInstance) window.spiderChartInstance.destroy();
    
    const datasets = [];

    if (baselineValues && baselineValues.length === 6) {
        datasets.push({
            label: t('roadmap.baseline_legend', 'Current Baseline'),
            data: baselineValues,
            backgroundColor: 'rgba(148, 163, 184, 0.16)',
            borderColor: '#94a3b8',
            borderWidth: 2,
            borderDash: [4, 4],
            pointBackgroundColor: '#94a3b8',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 3,
            pointHoverRadius: 5
        });
    }

    datasets.push({
        label: t('roadmap.projected_legend', 'Projected Outcome'),
        data: projectedValues && projectedValues.length === 6 ? projectedValues : [60, 60, 60, 60, 60, 60],
        backgroundColor: 'rgba(23, 85, 186, 0.20)',
        borderColor: '#1755ba',
        borderWidth: 2.5,
        pointBackgroundColor: '#1755ba',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
    });

    const fontSettings = { family: '"Google Sans", "Google Sans Flex", sans-serif' };

    window.spiderChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [
                t('roadmap.dim_communication', 'Communication'),
                t('roadmap.dim_technical', 'Technical'),
                t('roadmap.dim_creativity', 'Creativity'),
                t('roadmap.dim_social_impact', 'Social Impact'),
                t('roadmap.dim_leadership', 'Leadership'),
                t('roadmap.dim_teamwork', 'Teamwork')
            ],
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { stepSize: 20, font: { ...fontSettings, size: 9 }, color: '#94a3b8' },
                    grid: { color: '#e2e8f0' },
                    angleLines: { color: '#f1f5f9' },
                    pointLabels: { font: { ...fontSettings, size: 11, weight: '700' }, color: '#334155' }
                }
            },
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleFont: { ...fontSettings, weight: '700' },
                    bodyFont: fontSettings,
                    padding: 10,
                    cornerRadius: 8
                }
            }
        }
    });
}

function renderTimeline(timeline) {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    
    if (!timeline || timeline.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 bg-white rounded-3xl border border-slate-200">
                <span class="material-symbols-outlined text-4xl text-slate-400 mb-2">event_busy</span>
                <p class="text-slate-600 font-semibold text-sm">${t('roadmap.no_events')}</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    timeline.forEach((item, index) => {
        const ev = item.selectedEvent || item.event;
        if (!ev) return;
        
        const dateStr = formatDate(item.date || ev.heldDate);
        const thumb = ev.thumbnail ? (ev.thumbnail.startsWith('http') ? ev.thumbnail : CDN_DOMAIN + '/' + ev.thumbnail) : '';
        const thumbHtml = thumb 
            ? `<img src="${thumb}" class="roadmap-card-thumb" alt="${escapeHtml(ev.title)}">` 
            : `<div class="roadmap-card-thumb flex items-center justify-center text-slate-300"><i class="fa-solid fa-image text-2xl"></i></div>`;
        const hasAlts = (item.alternativeEvents && item.alternativeEvents.length > 0);
        const milestoneNum = String(index + 1).padStart(2, '0');
        
        // Pedagogical phase badge styling
        const phase = item.phase || 'foundation';
        let phaseBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
        let phaseIcon = 'fa-compass';
        if (phase === 'practice') {
            phaseBadgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
            phaseIcon = 'fa-flask';
        } else if (phase === 'capstone') {
            phaseBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
            phaseIcon = 'fa-trophy';
        }
        
        const phaseLabel = phase === 'practice' 
            ? t('roadmap.phase_practice', 'Phase 2: Practical Application') 
            : (phase === 'capstone' ? t('roadmap.phase_capstone', 'Phase 3: Breakthrough / Capstone') : t('roadmap.phase_foundation', 'Phase 1: Foundation'));
        const fitScorePill = item.fitScore ? `<span class="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80"><i class="fa-solid fa-bolt mr-1"></i>${item.fitScore}% ${t('roadmap.match', 'Match')}</span>` : '';
        const certBadge = ev.hasCertificate ? `<span class="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap border border-amber-200"><i class="fa-solid fa-award mr-1"></i>${t('roadmap.certificate', 'Certificate')}</span>` : '';
        const categoryBadge = ev.category?.name ? `<span class="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">${escapeHtml(getCategoryLabel(ev.category))}</span>` : '';

        const reasonBox = item.reason ? `
            <div class="mt-3 p-3 bg-blue-50/60 rounded-xl border border-blue-100/90 text-xs text-slate-700 leading-relaxed">
                <div class="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                    <i class="fa-solid fa-lightbulb text-amber-500 text-[11px]"></i>
                    <span class="text-[11px] uppercase tracking-wider">${t('roadmap.milestone_pedagogical_goal', 'Pedagogical objective for this milestone:')}</span>
                </div>
                <p class="text-slate-600 text-xs leading-relaxed">${escapeHtml(item.reason)}</p>
            </div>
        ` : '';

        const milestoneBadgeText = t('roadmap.milestone_badge', 'Milestone');

        html += `
            <div class="roadmap-milestone-node">
                <div class="roadmap-milestone-pin" title="${milestoneBadgeText} ${milestoneNum}"></div>
                <div class="roadmap-milestone-card">
                    ${thumbHtml}
                    <div class="roadmap-card-content">
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/80">${milestoneBadgeText} ${milestoneNum}</span>
                            <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${phaseBadgeClass} flex items-center gap-1">
                                <i class="fa-solid ${phaseIcon} text-[9px]"></i>
                                <span>${escapeHtml(phaseLabel)}</span>
                            </span>
                            ${fitScorePill}
                            ${certBadge}
                            ${categoryBadge}
                        </div>
                        <h3 class="roadmap-card-title text-base md:text-lg font-bold text-slate-900 line-clamp-2">${escapeHtml(ev.title)}</h3>
                        <div class="roadmap-meta-row mt-2">
                            <span class="roadmap-meta-item"><i class="fa-regular fa-calendar text-blue-600"></i> ${dateStr}</span>
                            <span class="roadmap-meta-item"><i class="fa-solid fa-location-dot text-rose-500"></i> ${escapeHtml(ev.location || 'Online / Hybrid')}</span>
                        </div>
                        <p class="roadmap-card-desc mt-2">${escapeHtml(ev.description || '')}</p>
                        ${reasonBox}
                        <div class="roadmap-card-actions mt-4">
                            <button onclick="window.openEventPopup('${ev._id}')" class="roadmap-action-btn view">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                <span>${t('roadmap.view_details', 'View Details')}</span>
                            </button>
                            ${hasAlts ? `
                            <button onclick="window.openSwipeModal(${index})" class="roadmap-action-btn swap">
                                <i class="fa-solid fa-arrows-rotate"></i>
                                <span>${t('roadmap.replace_event', 'Swap Event')} (${item.alternativeEvents.length})</span>
                            </button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

window.openEventPopup = openEventPopup;
window.openSwipeModal = (timelineIndex) => {
    const entry = timelineData[timelineIndex];
    const alternatives = entry?.alternativeEvents || entry?.alternatives || [];
    if (alternatives.length === 0) {
        alert(t('roadmap.no_events'));
        return;
    }
    
    const modal = document.getElementById('swipe-modal');
    const stack = document.getElementById('swipe-card-stack');
    if (!modal || !stack) return;
    
    modal.classList.add('active');
    
    let currentAltIdx = 0;
    
    const renderCard = () => {
        if (currentAltIdx >= alternatives.length) {
            modal.classList.remove('active');
            return;
        }
        const ev = alternatives[currentAltIdx];
        if (!ev || !ev._id) {
            modal.classList.remove('active');
            return;
        }
        const thumb = ev.thumbnail ? (ev.thumbnail.startsWith('http') ? ev.thumbnail : CDN_DOMAIN + '/' + ev.thumbnail) : '';
        const altCountLabel = t('roadmap.alternative_count', { current: currentAltIdx + 1, total: alternatives.length }) || `Alternative ${currentAltIdx + 1} of ${alternatives.length}`;
        stack.innerHTML = `
            <div class="swipe-card">
                ${thumb ? `<img src="${thumb}" class="w-full h-44 object-cover rounded-2xl mb-4" alt="${escapeHtml(ev.title)}">` : '<div class="w-full h-44 bg-slate-100 rounded-2xl mb-4 flex items-center justify-center text-slate-400"><i class="fa-solid fa-image text-3xl"></i></div>'}
                <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">${escapeHtml(altCountLabel)}</span>
                    ${ev.hasCertificate ? `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"><i class="fa-solid fa-award"></i> Certificate</span>` : ''}
                </div>
                <h3 class="font-bold text-lg text-slate-900 mb-2 line-clamp-2" style="font-family: var(--font-headline-md), 'Aleo', serif;">${escapeHtml(ev.title)}</h3>
                <div class="flex items-center gap-3 text-xs text-slate-500 mb-3">
                    <span><i class="fa-regular fa-calendar mr-1 text-blue-600"></i> ${formatDate(ev.heldDate)}</span>
                    <span><i class="fa-solid fa-location-dot mr-1 text-rose-500"></i> ${escapeHtml(ev.location || 'Online')}</span>
                </div>
                <p class="text-slate-600 text-xs line-clamp-3 leading-relaxed mb-auto">${escapeHtml(ev.description || '')}</p>
            </div>
        `;
        
        // Touch/mouse swipe support
        const card = stack.querySelector('.swipe-card');
        if (!card) return;
        let startX = 0, currentX = 0, isDragging = false;
        
        const onStart = (x) => { startX = x; isDragging = true; card.style.transition = 'none'; };
        const onMove = (x) => {
            if (!isDragging) return;
            currentX = x - startX;
            card.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.05}deg)`;
            card.style.opacity = Math.max(0.5, 1 - Math.abs(currentX) / 400);
        };
        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            card.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s';
            if (Math.abs(currentX) > 90) {
                if (currentX > 0) {
                    document.getElementById('swipe-btn-select')?.click();
                } else {
                    document.getElementById('swipe-btn-skip')?.click();
                }
            } else {
                card.style.transform = '';
                card.style.opacity = '1';
            }
            currentX = 0;
        };
        
        card.addEventListener('mousedown', (e) => onStart(e.clientX));
        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', onEnd);
        card.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
        card.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
        card.addEventListener('touchend', onEnd);
    };
    
    renderCard();
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'ArrowLeft') {
            document.getElementById('swipe-btn-skip')?.click();
        } else if (e.key === 'ArrowRight') {
            document.getElementById('swipe-btn-select')?.click();
        } else if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleKeydown);

    const btnSkip = document.getElementById('swipe-btn-skip');
    const btnSelect = document.getElementById('swipe-btn-select');

    if (btnSkip) {
        btnSkip.onclick = () => {
            currentAltIdx++;
            if (currentAltIdx >= alternatives.length) {
                closeModal();
            } else {
                renderCard();
            }
        };
    }
    
    if (btnSelect) {
        btnSelect.onclick = async () => {
            try {
                const ev = alternatives[currentAltIdx];
                const res = await roadmapApi.swapTimelineEvent(generatedRoadmapId, timelineIndex, ev._id);
                if (res && res.roadmap) {
                    timelineData = res.roadmap.timeline;
                    renderTimeline(timelineData);
                }
                closeModal();
            } catch (e) {
                showNoticeBox({ id: 'err-swap-' + Date.now(), message: e.message, type: 'error', once: false, containerId: 'notice-container' });
                closeModal();
            }
        };
    }
    
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
};

async function handleConfirm() {
    try {
        await roadmapApi.confirmRoadmap(generatedRoadmapId);
        showNoticeBox({ id: 'roadmap-confirmed', message: t('roadmap.roadmap_confirmed'), type: 'success', once: true, containerId: 'notice-container' });
        setTimeout(() => {
            window.location.href = "/profile.html";
        }, 1000);
    } catch (e) {
        showNoticeBox({ id: 'err-confirm', message: e.message, type: 'error', once: false, containerId: 'notice-container' });
    }
}

async function loadExistingRoadmap(id) {
    showRoadmapSkeleton();
    try {
        const res = await roadmapApi.getRoadmapById(id);
        if (res && res.roadmap) {
            generatedRoadmapId = res.roadmap._id;
            timelineData = res.roadmap.timeline;
            currentRoadmap = res.roadmap;
            
            hideRoadmapSkeleton();
            document.getElementById('roadmap-wizard')?.classList.add('hidden');
            document.getElementById('roadmap-stepper-wrap')?.classList.add('hidden');
            document.getElementById('roadmap-result')?.classList.remove('hidden');
            
            renderResult(res.roadmap);
        } else {
            throw new Error(t('roadmap.error_loading', 'Roadmap not found or failed to load.'));
        }
    } catch (e) {
        hideRoadmapSkeleton();
        showNoticeBox({ id: 'err-load-roadmap', message: e.message || t('roadmap.error_loading', 'Roadmap not found or failed to load.'), type: 'error', once: false, containerId: 'notice-container' });
        setTimeout(() => {
            window.location.href = "/profile.html";
        }, 1500);
    }
}

function handleLanguageChanged() {
    // 1. Update step counter label
    const counterLabel = document.getElementById('step-counter-label');
    if (counterLabel) {
        counterLabel.textContent = t('roadmap.step_counter', { current: currentStep, total: MAX_STEPS });
    }

    // 2. Re-render category chips in new language
    renderCategoryChips();

    // 3. If roadmap results are displayed, re-render chart & timeline with new language
    if (currentRoadmap) {
        renderResult(currentRoadmap);
    }

    // 4. If skeleton is active, update the status text in current language
    const skeleton = document.getElementById('roadmap-skeleton');
    if (skeleton && !skeleton.classList.contains('hidden')) {
        const statusEl = document.getElementById('skeleton-status-text');
        if (statusEl) {
            statusEl.textContent = t('roadmap.skeleton_status_1');
        }
    }
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
