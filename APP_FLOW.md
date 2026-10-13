# HRMS App Flow

This document reflects the current app flow implemented under `src/app/`.
`hrms-src/` was intentionally ignored.

## 1. Startup Flow

The app does not use a default route redirect. `AppComponent` decides the first screen after initialization.

### App boot sequence

1. Initialize SQLite and database support.
2. Load face models, employee-table support, and attendance audio.
3. Register network listeners, Android back-button handling, and keyboard handling.
4. Read saved credentials and language.
5. Auto-select the only allowed company for internal users when possible.
6. Route into the authentication/setup flow.

### Initial route decision

Actual startup routing is managed via `/login/entry`:

```text
App launch
  -> /login/entry
      -> no saved credentials or no uid
         -> /login/otp

      -> saved credentials exist, PIN missing
         -> /login/credentials

      -> saved credentials exist, PIN already set
         -> /login/pin
```

Important detail: the app no longer jumps straight to `/home` on launch when a PIN already exists. It routes to `/login`, and that screen acts as the PIN gate.

`storage.exitPage` is also updated during this process and is used by Android back-button exit handling.

## 2. User Types

The current flow differs by user role saved in credentials:

- Internal admin user: full attendance + employee management flow
- Internal non-admin user: attendance + personal profile flow
- External / portal-style user (`is_internal_user === false`): personal profile/self-service flow without company selection

Role flags are saved during credential login and reused across later PIN logins.

## 3. Authentication And Setup Flow

The authentication flow is now split into multiple specialized routes:

### `/login/entry`

Acts as a startup loader that resolves the initial route based on stored credentials and session state. It determines whether to route the user to OTP login, credential login, or PIN login.

### `/login/otp`

The primary entry point for unauthenticated users. It supports a multi-stage authentication flow:

1. **Identifier Stage**: User enters email or mobile number.
2. **OTP Verification**: A 6-digit OTP is sent and verified via modal.
3. **Password Stage**: User enters their password.
4. **Tenant Selection**: For users with multiple workspaces, a tenant selection modal is shown.
5. On successful login, credentials are saved, and the user routes to `/pinsetup`.

Available extra actions:
- `Help` -> `/contact`
- `Forgot Password` -> opens reset password modal
- `Register New Account` -> `/register`

### `/login/credentials`

Used for users with existing credentials but no PIN set, or during forced re-authentication scenarios.

1. User enters username and password.
2. App validates with Odoo.
3. On success, credentials and role flags (`is_internal_user`, `is_admin_user`) are stored.
4. User is routed to `/pinsetup`.

### `/login/pin`

Gateway for users who already have a PIN configured.

1. User enters PIN.
2. If PIN matches local storage, credentials are restored into the Odoo service.
3. Background sync is restarted.
4. User is routed based on stored state:
   - external / portal user -> `/home`
   - internal user with selected company -> `/home`
   - internal user without selected company -> `/company`

#### Denied / forced re-authentication flow

If runtime login validation fails, the app redirects to `/login/credentials` (or similar forced re-auth state). Saved PIN, company, and role flags are preserved so the user can restore their session without a full re-setup.

### `/register`

Provides a signup flow for new users to create an account before logging in.

### `/pinsetup`

This page is used in two cases:

- first-time PIN setup after credential login
- PIN change from settings (modal)

#### First-time PIN setup

1. User enters and confirms a 4-digit PIN.
2. PIN is saved into stored credentials.
3. If the user is an internal user with exactly one company and no company selected yet, that company is auto-selected.
4. If the user is an admin, the app may bootstrap employee/attendance data in the background.
5. Next route depends on role and company state:
   - selected company already available -> `/profile`
   - external / portal user -> `/profile`
   - internal user without selected company -> `/company`

#### PIN change from settings

If `/pinsetup` is opened from `/settings` as a modal, saving the PIN dismisses the modal and does not change the current route.

### `/company`

This page is only relevant for internal users who must choose a company.

Flow:

1. Page shows allowed companies from the saved Odoo session.
2. If there is exactly one company and none is selected yet, the page auto-selects it.
3. When a company is chosen:
   - credentials are updated
   - `storage.selected_company` is set
   - `current_employee_id` is cleared
   - attendance background sync starts
4. User is routed to `/profile`

The older `/employee-list` first-time branch is no longer the active flow in `src/app`.

## 4. Main Navigation Model

The current app is centered around four primary screens:

- `/home` -> attendance capture camera
- `/profile` -> self-service employee hub
- `/attendances` -> attendance history
- `/employee-list` -> admin-only enrollment hub

In practice:

- all users can reach `/home`, `/profile`, and `/attendances`
- `/employee-list` is intended for admins only and redirects non-admin users back to `/profile`

## 5. Operational Screens

### `/profile` - Self-service hub

This is now a first-class page and was missing from the older flow documentation.

On entry, the page:

1. Loads or syncs the current employee record through `StorageService.ensureCurrentEmployeeLoaded()`
2. Displays employee profile details and enrollment status

Available actions:

- refresh the current employee profile from Odoo/local sync path
- start self-enrollment -> `/enroll`
- open attendance camera -> `/home`
- view personal attendance -> `/attendances`
- remove the account from this device

#### Remove account from this device

This is different from normal logout.

Flow:

1. Confirm removal.
2. Require network availability.
3. Sync pending attendances to Odoo.
4. Delete older attendance data.
5. Clear local employees and cleanup listeners.
6. Remove saved credentials and enrollments from device storage.
7. Reset in-memory auth/session state.
8. Route to `/login`

### `/home` - Attendance capture

This is the live attendance camera screen.

On entry, the page:

1. Loads check-in/check-out delay settings.
2. Keeps the device awake.
3. Starts the front camera.
4. Loads the current employee set:
   - admin -> all local employees
   - non-admin / portal -> current employee only
5. Loads face descriptors for those employees.
6. Checks location permission/state.
7. Starts a 3-second countdown only when recognizer mode is enabled and location is ready.

#### Attendance prerequisites

Attendance recognition is now gated by more than camera access:

- recognizer must be toggled on
- location permission must be granted
- device location services must be available

If location is unavailable, the page shows status feedback and can open system location settings.

#### Recognition outcomes

- recognized and eligible for check-in -> mark `in`
- recognized and eligible for check-out -> mark `out`
- recognized too soon after previous check-in -> `recent_in`
- recognized too soon after previous check-out -> `recent_out`
- face not enrolled / no match -> rejection state

If online, the page also attempts to fetch today's attendance data when local data is missing for the active employee scope.

#### Performance Optimizations

To maximize framerate and improve recognition accuracy, the attendance camera view intentionally operates in a "headless" mode. It does not draw face bounding boxes or detection rectangles over the camera preview, avoiding costly image scaling, coordinate mapping, and main-thread canvas/overlay rendering. This ensures the loop can process frames as quickly as possible.

#### Home menu navigation

The top-right menu currently exposes:

- `/profile`
- `/employee-list` for admins only
- `/attendances`
- `/settings`
- logout

### `/employee-list` - Admin enrollment hub

This page is now admin-only in practice.

On entry:

1. App checks `is_admin_user`
2. Non-admin users are redirected to `/profile`
3. Admin users load local employees
4. If local employee data is empty and the device is online, the app syncs employees from Odoo

Page structure:

- `not enrolled` tab
- `enrolled` tab

Available actions:

- sync employee data
- search employees
- open settings
- select employee -> `/enroll`
- footer navigation -> `/home` or `/attendances`

### `/enroll` - Face enrollment capture

This page is driven by `storage.selectedEmployee`.

Entry points:

- admin selects an employee from `/employee-list`
- user starts self-enrollment from `/profile`

Flow:

1. Selected employee data is loaded into the page.
2. Front camera starts.
3. Face detection loop runs.
4. When a face is detected with sufficient confidence, the app auto-captures the image.
5. Enrollment is submitted through local/Odoo update logic.
6. Face descriptor data is generated or refreshed.
7. Local `enrollments` storage is updated.
8. Current employee reference is refreshed.
9. Page returns to the previous screen.

### `/attendances` - Attendance history

This page now supports both personal and company-wide history depending on role.

On entry:

1. Detect whether the user is admin.
2. Load the current employee.
3. Set attendance scope:
   - admin default -> `all`
   - non-admin default -> `my`
4. Load local attendance for the selected date.
5. If no local attendance exists and the device is online, sync from Odoo.

Available actions:

- sync attendance
- move to previous / next day
- open calendar modal and pick a date
- open attendance detail modal
- open settings
- footer navigation -> `/profile` or `/home`

Admin-only extra behavior:

- toggle between `all attendances` and `my attendances`
- page title changes based on selected scope

Display processing includes:

- UTC to IST conversion helpers
- worked-hours normalization

## 6. Settings And Support Flow

### `/settings`

This page is reachable from:

- `/home`
- `/employee-list`
- `/attendances`

Available actions:

- change language
- change check-in delay
- change check-out delay
- change sync delay
- toggle sound
- change selected company from allowed companies
- open native app details / battery settings
- change PIN
- logout
- save settings

#### Save settings

Saving settings updates stored credentials, refreshes `storage.selected_company`, and reconfigures background sync timing.

#### Change PIN

`/settings` -> open `/pinsetup` as modal -> save PIN -> modal closes

#### Logout

Both `/settings` and `/home` provide logout behavior with the same broad shape:

1. Confirm logout.
2. Sync pending attendances to Odoo.
3. Stop background syncing / listeners.
4. Reset in-memory authenticated session data.
5. Route to `/login`

This is lighter than "remove account from this device" because it does not fully wipe stored credentials in the same way.

### `/contact`

This page is opened from the login screen for registration or inquiry requests.

Flow:

1. User fills the contact form.
2. Form validation runs locally.
3. App builds a `mailto:` link with the form content.
4. External email app is opened.

### `/user-manual`

A newly added support and documentation page to provide help and resources within the app.

### `/offline`

There is still a defined `/offline` route and page, but it is not part of the active main flow.

Current offline behavior is mostly handled inside normal pages:

- `/home` can work with local face data and local attendance state
- `/employee-list` and `/attendances` read from local database first
- sync actions resume when connectivity returns

## 7. Service-Driven Hidden Flows

### Runtime login validation

`StorageService.handleLogin()` performs background/runtime Odoo session validation.

If validation fails:

1. Saved username/password are cleared.
2. PIN, company, timing, sound, and role data are preserved.
3. User is redirected to `/login?denied=true`.

This creates a forced credential re-entry flow without losing the device PIN setup.

### Current employee loading

Several screens depend on `StorageService.ensureCurrentEmployeeLoaded()`.

This service:

- tries local `current_employee_id` first
- falls back to local employee lookup
- if needed and online, syncs the employee from Odoo
- handles portal users differently from internal users

That hidden flow is important for `/profile`, `/home`, and `/attendances`.

## 8. Back Button Behavior

Android back handling is centralized in `AppComponent`.

- If the current route matches `storage.exitPage`, pressing back twice within 2 seconds exits the app.
- Otherwise, the app navigates back normally.

Common `exitPage` values in the current code:

- `/login/entry`
- `/login/otp`
- `/login/pin`
- `/pinsetup`
- `/company`
- `/profile`
- `/home`

## 9. High-Level Flow Summary

```text
Launch
  -> /login/entry
      -> /login/otp (no credentials)
          -> /register (optional)
          -> /pinsetup
          -> /profile or /company

Launch with saved PIN
  -> /login/entry
      -> /login/pin
      -> /home or /company
```

/company
  -> select / auto-select company
  -> /profile

/profile
  -> self enrollment
  -> /enroll
  -> /home
  -> /attendances
  -> remove account from device
  -> /login

/home
  -> /profile
  -> /attendances
  -> /settings
  -> /employee-list (admin)
  -> logout

/employee-list
  -> /enroll
  -> /settings
  -> /home
  -> /attendances

/attendances
  -> attendance detail modal
  -> /settings
  -> /profile
  -> /home
```
