import { Routes } from '@angular/router';
import { PinGuard } from './guards/pin.guard';

export const routes: Routes = [
  // {
  //   path: '',
  //   redirectTo: '/',
  //   pathMatch: 'full',
  // },

  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'profile',
    canActivate: [PinGuard],
    loadComponent: () =>
      import('./profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'enroll',
    loadComponent: () =>
      import('./enroll/enroll.page').then((m) => m.EnrollPage),
  },
  {
    path: 'employee-list',
    canActivate: [PinGuard],
    loadComponent: () =>
      import('./employee-list/employee-list.page').then(
        (m) => m.EmployeeListPage
      ),
  },

  {
    path: 'attendances',
    canActivate: [PinGuard],
    loadComponent: () =>
      import('./attendances/attendances.page').then((m) => m.AttendancesPage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login-entry/login-entry.page').then(
        (m) => m.LoginEntryPage
      ),
  },
  {
    path: 'login/entry',
    loadComponent: () =>
      import('./login/login-entry/login-entry.page').then(
        (m) => m.LoginEntryPage
      ),
  },
  {
    path: 'login/credentials',
    loadComponent: () =>
      import('./login/credentials-login/credentials-login.page').then(
        (m) => m.CredentialsLoginPage
      ),
  },
  {
    path: 'login/pin',
    loadComponent: () =>
      import('./login/pin-login/pin-login.page').then((m) => m.PinLoginPage),
  },
  {
    path: 'login/otp',
    loadComponent: () =>
      import('./login/otp-login/otp-login.page').then((m) => m.OtpLoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'pinsetup',
    loadComponent: () =>
      import('./pinsetup/pinsetup.page').then((m) => m.PinsetupPage),
  },
  {
    path: 'settings',
    canActivate: [PinGuard],
    loadComponent: () =>
      import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'server-configuration',
    loadComponent: () =>
      import('./server-configuration/server-configuration.page').then(
        (m) => m.ServerConfigurationPage
      ),
  },
  {
    path: 'plan-details',
    loadComponent: () =>
      import('./plan-details/plan-details.page').then((m) => m.PlanDetailsPage),
  },
  {
    path: 'offline',
    loadComponent: () =>
      import('./offline/offline.page').then((m) => m.OfflinePage),
  },
  {
    path: 'company',
    canActivate: [PinGuard],
    loadComponent: () =>
      import('./company/company.page').then((m) => m.CompanyPage),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'user-manual',
    loadComponent: () =>
      import('./user-manual/user-manual.page').then((m) => m.UserManualPage),
  },
  {
    path: 'license-renewal',
    loadComponent: () =>
      import('./license-renewal/license-renewal.page').then((m) => m.LicenseRenewalPage),
  },
];
