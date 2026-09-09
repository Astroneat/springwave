# Tasks: Tighten Organization Manager Permissions

- [x] Task 1: Tighten Backend Permissions <!-- id: 1 -->
  - [x] Restrict `deleteEvent` in `src/controllers/event.controller.js` to Owner or Admin
  - [x] Restrict `uploadOrgAvatar` and `uploadOrgCover` in `src/controllers/organization.controller.js` to Owner or Admin
  - [x] Restrict `revokeCertificate` and `restoreCertificate` in `src/controllers/certificate.controller.js` to Owner or Admin
  - [x] Restrict `postAsOrg` in `src/controllers/community.controller.js` to Owner or Admin
- [x] Task 2: Implement Frontend Role Guards in Dashboard <!-- id: 2 -->
  - [x] Add `isOrgOwner()` helper in `js/pages/org-dashboard.js`
  - [x] Hide event delete button in `renderEventsTable` for managers
  - [x] Hide Add Manager button and Remove/Transfer actions in Managers tab for managers
  - [x] Hide Delete Org and Change Avatar buttons, and make settings fields read-only with banner for managers
  - [x] Hide Revoke button in Certificates section for managers
  - [x] Hide Avatar and Cover edit buttons in `org-profile.js` for managers
  - [x] Hide organization posting option in `community.js` for managers
- [x] Task 3: Localization & Verification <!-- id: 3 -->
  - [x] Add i18n strings for manager read-only notice in `vi.json` and `en.json`
  - [x] Run `npm run build` in `springwave-frontend`
  - [x] Verify functionality
