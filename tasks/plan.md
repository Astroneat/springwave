# Implementation Plan: Tighten Organization Manager Permissions

## Overview
Restrict Manager permissions across both SpringWave Backend and SpringWave Frontend to eliminate critical operational risks (event deletion, certificate revocation, identity/branding alteration, unauthorized official posts) while providing a clean, role-aware UX on the organizer dashboard.

---

## Tasks Breakdown
1. **Backend Event Controller**: Restrict event deletion to Owner/Admin only.
2. **Backend Organization Controller**: Restrict avatar and cover upload to Owner/Admin only.
3. **Backend Certificate Controller**: Restrict certificate revocation and restoration to Owner/Admin only.
4. **Backend Community Controller**: Restrict `postAsOrg: true` to Owner/Admin only.
5. **Frontend Dashboard UX**:
   - Hide delete event button for Managers.
   - Hide Add Manager, Remove Manager, and Transfer Ownership for Managers.
   - Hide Delete Org and Change Avatar buttons for Managers, and make organization profile settings read-only with an informational alert banner.
   - Hide certificate revocation buttons for Managers.
6. **Verification**: Verify frontend build with `npm run build` and test API logic.
