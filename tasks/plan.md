# Implementation Plan: Restructure Org Dashboard & Events Tab Timeline Display

## Overview
Optimize `org-dashboard.html` and `js/pages/org-dashboard.js` by consolidating the host dashboard and redesigning the Events tab:
1. **Eliminate Redundant Host Dashboard Section & Move Stats to Events Tab**:
   - The standalone "Dashboard" tab (`#section-dashboard`) only hosts 4 stat cards and a 5-item recent events table, duplicating the Events view.
   - We remove the separate "Dashboard" navigation item and section, promote "Events" as the primary landing tab of the organizer command center, and place the key metric cards (Total Events, Participants, Upcoming, Ongoing) directly at the top of the Events tab.
2. **Re-engineer the Events Tab Timeline Display**:
   - Re-architect event categorization into three distinct time phases: **Sắp diễn ra (Upcoming)**, **Đang diễn ra (Ongoing / Live)**, and **Đã diễn ra (Past / Ended)**.
   - Introduce dedicated timeline filter tabs with dynamic count badges (`Tất cả`, `Sắp diễn ra`, `Đang diễn ra`, `Đã diễn ra`).
   - Enhance the Events table with status badges (e.g. pulsing live dot for ongoing events, clear upcoming badges, distinct draft badges) and remove the obsolete "Show Expired Events" button.
   - Maintain strict adherence to SpringWave's global design tokens, spacing scale, mobile responsiveness, and bilingual localization (`vi.json` / `en.json`).

---

## Architecture & Design Details

### 1. Navigation & Section Restructure
- **Sidebar (`<nav id="sidenav">`) & Mobile Sub-nav (`#mobile-dashboard-tabs`)**:
  - Remove the "Dashboard" entry (`data-section="dashboard"`).
  - Make "Events" (`data-section="events"`) the first navigation tab and mark it `active` by default.
  - Set default state `currentSection = "events"` in `org-dashboard.js`.
  - Add backwards-compatibility redirect in `switchSection(section)`: if `section === "dashboard"`, gracefully route to `"events"`.
- **Remove `#section-dashboard`**:
  - Delete `#section-dashboard` from `org-dashboard.html`.
  - Ensure `#section-events` starts without the `hidden` class.

### 2. Events Tab Metric Cards (`#events-stats`)
- Positioned directly below the Events header (title, description, and "Create Event" button), before the filter toolbar.
- Responsive grid: `grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-7`.
- **Card 1: Total Events**:
  - ID: `stat-events`
  - Icon: `<i class="fa-regular fa-calendar"></i>` in `bg-blue-50 text-blue-600`
  - Label: `Total Events` / `Tổng sự kiện`
- **Card 2: Participants**:
  - ID: `stat-participants`
  - Icon: `<i class="fa-solid fa-users"></i>` in `bg-emerald-50 text-emerald-600`
  - Label: `Participants` / `Người tham gia`
- **Card 3: Upcoming**:
  - ID: `stat-upcoming`
  - Icon: `<i class="fa-solid fa-clock"></i>` in `bg-amber-50 text-amber-600`
  - Label: `Upcoming` / `Sắp diễn ra`
- **Card 4: Ongoing**:
  - ID: `stat-ongoing`
  - Icon: `<i class="fa-solid fa-tower-broadcast"></i>` in `bg-purple-50 text-purple-600`
  - Label: `Ongoing` / `Đang diễn ra`
- All cards use the standard `spring-card spring-card-hover p-4 sm:p-5` classes.

### 3. Timeline Categorization Logic (`getEventTimelineStatus`)
- Computes real-time status using event dates:
  - `start = new Date(event.heldDate).getTime()`
  - `end = event.heldDateEnd ? new Date(event.heldDateEnd).getTime() : defaultEndOfEvent(event.heldDate)`
  - `now = Date.now()`
- Status definitions:
  - **`ongoing` (Đang diễn ra)**: `now >= start && now <= end`
  - **`upcoming` (Sắp diễn ra)**: `now < start`
  - **`ended` (Đã diễn ra)**: `now > end`

### 4. Events Filter Toolbar & Table Redesign
- **Filter Tabs**:
  - Segmented control pills:
    - `All (Tất cả)`: badge showing total events
    - `Upcoming (Sắp diễn ra)`: badge showing upcoming count
    - `Ongoing (Đang diễn ra)`: badge showing ongoing count with green indicator
    - `Past (Đã diễn ra)`: badge showing ended count
  - Integrated search input for instant filtering by title, category, or location.
  - Secondary publication status dropdown/filter (`All Status`, `Published`, `Draft`).
  - Deprecate and remove `#toggle-expired-events`.
- **Table Status Column**:
  - **Ongoing**: `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span>Đang diễn ra</span></span>`
  - **Upcoming**: `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span><span>Sắp diễn ra</span></span>`
  - **Ended / Past**: `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80"><span>Đã kết thúc</span></span>`
  - **Draft Indicator**: When `status === "draft"`, also show `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Draft</span>`.
- **Dynamic Empty States**:
  - Specific empty messages tailored to the active tab (e.g., "Không có sự kiện nào đang diễn ra", "Không có sự kiện sắp tới", etc.).

---

## Verification Plan
1. **Build Verification**:
   - Run `npm run build` in `springwave-frontend` to confirm Vite bundles all HTML/JS assets cleanly with zero build errors.
2. **Behavioral & UI Verification**:
   - Verify sidebar and mobile navigation highlight "Events" by default.
   - Verify stat cards render correct counts for Total Events, Participants, Upcoming, and Ongoing.
   - Verify switching between "All", "Sắp diễn ra", "Đang diễn ra", and "Đã diễn ra" tabs accurately filters the event table.
   - Verify status badges display properly with live animation for ongoing events.
   - Verify search filter and publication status filter operate seamlessly.
   - Check responsive layouts across mobile (375px), tablet (768px), and desktop (1280px).
