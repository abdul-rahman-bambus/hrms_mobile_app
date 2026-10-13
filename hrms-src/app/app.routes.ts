import { Routes } from '@angular/router';

export const routes: Routes = [

  // {
  //   path: '',
  //   redirectTo: '/',
  //   pathMatch: 'full',
  // },  
  

  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then( m => m.HomePage)
  },
   {
    path: 'enroll',
    loadComponent: () => import('./enroll/enroll.page').then( m => m.EnrollPage),
  },
  {
    path: 'employee-list',
    loadComponent: () => import('./employee-list/employee-list.page').then( m => m.EmployeeListPage),
  },

  {
    path: 'attendances',
    loadComponent: () => import('./attendances/attendances.page').then( m => m.AttendancesPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'pinsetup',
    loadComponent: () => import('./pinsetup/pinsetup.page').then( m => m.PinsetupPage)
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then( m => m.SettingsPage)
  },
  {
    path: 'offline',
    loadComponent: () => import('./offline/offline.page').then( m => m.OfflinePage)
  },
  {
    path: 'company',
    loadComponent: () => import('./company/company.page').then( m => m.CompanyPage)
  },
  {
    path: 'contact',
    loadComponent: () => import('./contact/contact.page').then( m => m.ContactPage)
  },

];
