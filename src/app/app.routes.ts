import { Routes } from '@angular/router';

export const routes: Routes = [

  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then( m => m.HomePage)
  },
   {
    path: 'enroll',
    loadComponent: () => import('./enroll/enroll.page').then( m => m.EnrollPage)
  },
  {
    path: 'employee-list',
    loadComponent: () => import('./employee-list/employee-list.page').then( m => m.EmployeeListPage)
  },
  {
    path: 'enroll',
    loadComponent: () => import('./enroll/enroll.page').then( m => m.EnrollPage)
  },
  {
    path: 'attendances',
    loadComponent: () => import('./attendances/attendances.page').then( m => m.AttendancesPage)
  },

];
