import { inject, signal, computed, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { App } from '@capacitor/app';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonHeader, IonLabel, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonItem, IonList, ModalController, IonFooter, IonButtons, IonDatetime, IonModal, IonBackButton, IonInfiniteScroll, IonInfiniteScrollContent, IonSearchbar, IonMenuToggle, IonProgressBar, IonSelectOption, IonSelect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  cameraOutline,
  checkmarkCircleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  cloudOutline,
  checkmarkOutline,
  list,
  personCircle,
  settingsOutline,
  syncOutline,
  ellipsisVertical,
  timeOutline,
  trashOutline
} from 'ionicons/icons';
import { AttendancePopupComponent } from '../attendance-popup/attendance-popup.component';
import { AttendanceService, convertToIST, LocalAttendance, LocalEmployees, StorageService } from '../services/storage.service';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-attendances',
  templateUrl: './attendances.page.html',
  styleUrls: ['./attendances.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonModal, IonButton, IonLabel, IonItem, IonList, IonFooter, IonButtons, IonBackButton, IonInfiniteScroll, IonInfiniteScrollContent, IonSearchbar, RouterModule, IonDatetime, IonMenuToggle, IonProgressBar, TranslateModule, IonSelectOption, IonSelect]
})
export class AttendancesPage implements OnInit, OnDestroy {
  goToRenewal() {
    this.router.navigateByUrl('/license-renewal');
  }
  licenseWarningMessage = signal<string>('');
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  private isDestroyed = false;
  attendances = signal<LocalAttendance[]>([]);
  filteredAttendances = signal<LocalAttendance[]>([]);
  showFilter = signal<boolean>(false);
  employeeSearch = signal<string>('');
  fromDate = signal<string>('');
  toDate = signal<string>('');
  @ViewChild('calendarModal', { static: false }) calendarModal!: IonModal;

  selectedDate = signal<Date>(new Date());
  isCalendarOpen = signal<boolean>(false);

  loading = signal<boolean>(false);
  isSyncing = signal<boolean>(false);
  current_lang = signal<string>('en-US');
  showDatetime = signal<boolean>(true);
  currentEmployee = signal<LocalEmployees | undefined>(undefined);
  isAdminUser = signal<boolean>(false);
  attendanceScope = signal<'all' | 'my'>('all');
  readonly attendancePageLimit = 10;
  hasMoreAttendances = signal<boolean>(true);
  isLoadingMoreAttendances = signal<boolean>(false);
  private attendanceOffset = 0;

  constructor(
    private attservice: AttendanceService,
    private modal: ModalController,
    private storage: StorageService,
    public router: Router,
    private alertController: AlertController) {
    addIcons({
      alertCircleOutline,
      calendarOutline,
      cameraOutline,
      checkmarkCircleOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      cloudOutline,
      checkmarkOutline,
      list,
      personCircle,
      settingsOutline,
      syncOutline,
      ellipsisVertical,
      timeOutline,
      trashOutline
    });
  }

  switchFilter(): void {
    this.showFilter.set(!this.showFilter());
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.attendances.set([]);
    this.filteredAttendances.set([]);
  }

  isMyAttendancesView = computed<boolean>(() => {
    return !this.isAdminUser() || this.attendanceScope() === 'my';
  });

  pageTitle = computed<string>(() => {
    if (this.isAdminUser() && this.attendanceScope() === 'all') {
      return this.storage.selected_company?.name || this.storage.translate.instant('ATTENDANCE');
    }
    return this.currentEmployee()?.display_name || this.storage.translate.instant('EMPLOYEE_ATTENDANCE');
  });

  goPrevious(): void {
    const d: Date = new Date(this.selectedDate());
    d.setDate(d.getDate() - 1);
    this.selectedDate.set(d);
    this.fetchAttendanceData(this.formatDate(this.selectedDate()));
  }

  goNext(): void {
    const d: Date = new Date(this.selectedDate());
    d.setDate(d.getDate() + 1);
    this.selectedDate.set(d);
    this.fetchAttendanceData(this.formatDate(this.selectedDate()));
  }

  showCalendar(): void {
    this.isCalendarOpen.set(true);
  }

  closeCalendar(fetch = true): void {
    if (fetch) {
      this.fetchAttendanceData(this.formatDate(this.selectedDate()));
      this.isCalendarOpen.set(false);
    } else {
      this.calendarModal.dismiss();
    }
  }

  onDatePicked(event: any): void {
    this.selectedDate.set(new Date(event.detail.value));
  }

  formatDate(date: Date): string {
    const yyyy: number = date.getFullYear();
    const mm: string = String(date.getMonth() + 1).padStart(2, '0');
    const dd: string = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  deleteAttendances(): void {
    this.attservice.deleteOlderAttendance();
  }

  private resetAttendancePagination(): void {
    this.attendanceOffset = 0;
    this.hasMoreAttendances.set(true);
    this.attendances.set([]);
    this.filteredAttendances.set([]);
  }

  async deleteAllLocalAttendancesForDebug(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete local attendances?',
      message: 'Debug only: this clears attendance rows stored on this device. Server attendance records are not deleted.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.attservice.deleteAllLocalAttendances();
            this.resetAttendancePagination();
            await this.storage.showToast({
              message: 'Local attendance records deleted.',
              duration: 1800,
              color: 'warning',
              position: 'top'
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteAllLocalAttendances(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete local attendances?',
      message: 'This removes all attendance records stored on this device only. Odoo records will not be deleted.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.attservice.deleteAllLocalAttendances();
            this.resetAttendancePagination();
            await this.storage.showToast({
              message: 'Local attendance records deleted.',
              duration: 1800,
              color: 'warning',
              position: 'top'
            });
          }
        }
      ]
    });

    await alert.present();
  }

  async deleteLocalAttendanceRecord(event: Event, attendance: LocalAttendance): Promise<void> {
    event.stopPropagation();

    const alert = await this.alertController.create({
      header: 'Delete local record?',
      message: 'This removes only this attendance record from the device. Odoo records will not be deleted.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.attservice.deleteLocalAttendance(attendance.id);
            this.attendances.set(this.attendances().filter((item) => item.id !== attendance.id));
            this.filteredAttendances.set(this.filteredAttendances().filter((item) => item.id !== attendance.id));
            this.attendanceOffset = this.attendances().length;
            await this.storage.showToast({
              message: 'Local attendance record deleted.',
              duration: 1500,
              color: 'warning',
              position: 'top'
            });
          }
        }
      ]
    });
    await alert.present();
  }

  setAttendanceScope(scope: 'all' | 'my'): void {
    if (!this.isAdminUser() || this.attendanceScope() === scope) {
      return;
    }
    this.attendanceScope.set(scope);
    this.fetchAttendanceData(this.formatDate(this.selectedDate()));
  }

  private buildAttendanceDomain(dateString: string): any[] {
    const domain: any[] = [
      ['check_in', 'ilike', `${dateString}%`],
      ['employee_id.company_id', '=', this.storage.selected_company?.id]
    ];

    if (this.isMyAttendancesView() && this.currentEmployee()?.odoo_id) {
      domain.push(['employee_id', '=', this.currentEmployee()?.odoo_id]);
    }

    return domain;
  }

  private getLocalAttendances(dateString: string, offset = this.attendanceOffset): Promise<LocalAttendance[]> {
    const employeeId = this.isMyAttendancesView() ? (this.currentEmployee()?.odoo_id ?? undefined) : undefined;
    return this.attservice.retrieveAttendance(dateString, employeeId, this.attendancePageLimit, offset, this.employeeSearch());
  }

  private async loadAttendancePage(dateString: string, append = false): Promise<LocalAttendance[]> {
    const localAttendances = await this.getLocalAttendances(dateString);
    if (this.isDestroyed) return [];

    this.processAttendanceList(localAttendances, append);
    this.attendanceOffset += localAttendances.length;
    this.hasMoreAttendances.set(localAttendances.length === this.attendancePageLimit);
    return localAttendances;
  }

  async syncAttendance(showLoader = true): Promise<void> {
    if (this.isDestroyed || this.isSyncing()) return;

    this.isSyncing.set(true);

    try {
      this.currentEmployee.set(await this.storage.ensureCurrentEmployeeLoaded());
      if (this.isMyAttendancesView() && !this.currentEmployee()?.odoo_id) {
        this.resetAttendancePagination();
        return;
      }

      const dateString = this.formatDate(this.selectedDate());
      const syncSucceeded = await this.attservice.syncToOdoo();

      if (this.isDestroyed) return;

      if (this.storage.isNetworkAvailable) {
        await this.attservice.fetchAttendanceFromOdoo(this.buildAttendanceDomain(dateString));
      }

      if (this.isDestroyed) return;
      this.resetAttendancePagination();
      await this.loadAttendancePage(dateString);
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      this.isSyncing.set(false);
    }
  }

  async ionViewWillEnter() {
    const licenseStatus = String((await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_license_status' }))).value || '').trim().toLowerCase();
    const expiryDateStr = (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_expiry_date' }))).value || (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_trial_end_date' }))).value;
    
    if ((licenseStatus === 'trial' || licenseStatus === 'active') && expiryDateStr) {
      const expiryDate = new Date(expiryDateStr);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 3 && diffDays >= 0) {
        const type = licenseStatus === 'trial' ? 'trial' : 'licence';
        const action = licenseStatus === 'active' ? 'renew your licence' : 'purchase a licence';
        const day = String(expiryDate.getDate()).padStart(2, '0');
        const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
        const year = expiryDate.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        const msg = `Your ${type} will expire on ${formattedDate}. Kindly ${action}.`;
        this.licenseWarningMessage.set(msg);
      } else {
        this.licenseWarningMessage.set('');
      }
    } else {
      this.licenseWarningMessage.set('');
    }

    if (this.appStateSub) {
      this.appStateSub.remove();
    }
    this.appStateSub = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && this._injectedStorage.isNetworkAvailable) {
        console.log('App backgrounded, syncing data...');
        await this._injectedAttService.syncToOdoo();
      }

      if (isActive && !this.isDestroyed) {
        console.log('App resumed, refreshing attendances...');
        if (!this.loading()) {
          await this.fetchAttendanceData(this.formatDate(this.selectedDate()));
        }
      }
    });

    const credentials = await this.storage.getCredentials();
    this.isAdminUser.set(credentials?.is_admin_user === true);
    this.attendanceScope.set(this.isAdminUser() ? 'all' : 'my');
    this.currentEmployee.set(await this.storage.ensureCurrentEmployeeLoaded());
    await this.fetchAttendanceData(this.formatDate(this.selectedDate()));

    const lang = this.storage.translate.getCurrentLang();
    this.showDatetime.set(false);
    if (lang === 'en') {
      this.current_lang.set('en-US');
    } else {
      this.current_lang.set(`${lang}-IN`);
    }
    setTimeout(() => { this.showDatetime.set(true); });
  }

  ngOnInit(): void {
  }

  async showAttendanceDetails(att: any): Promise<void> {
    const modal: HTMLIonModalElement = await this.modal.create({
      component: AttendancePopupComponent,
      backdropDismiss: true,
      componentProps: { attendance: att }
    });
    modal.present();
  }

  async fetchAttendanceData(dateVal: string): Promise<void> {
    if (this.isDestroyed) return;
    this.loading.set(true);
    this.resetAttendancePagination();

    try {
      if (!this.currentEmployee()) {
        this.currentEmployee.set(await this.storage.ensureCurrentEmployeeLoaded());
      }
      if (this.isMyAttendancesView() && !this.currentEmployee()?.odoo_id) {
        return;
      }

      const localAttendances = await this.loadAttendancePage(dateVal);
      if (this.isDestroyed) return;

      if (localAttendances.length === 0 && this.storage.isNetworkAvailable) {
        await this.syncAttendance(false);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMoreAttendances(event: Event): Promise<void> {
    if (this.loading() || this.isLoadingMoreAttendances() || !this.hasMoreAttendances()) {
      await (event.target as HTMLIonInfiniteScrollElement).complete();
      return;
    }

    this.isLoadingMoreAttendances.set(true);

    try {
      await this.loadAttendancePage(this.formatDate(this.selectedDate()), true);
    } catch (err) {
      console.error('Unable to load more attendances', err);
    } finally {
      this.isLoadingMoreAttendances.set(false);
      await (event.target as HTMLIonInfiniteScrollElement).complete();
    }
  }

  onAttendanceSearchInput(event: any): void {
    this.employeeSearch.set(event.detail.value || '');
    this.fetchAttendanceData(this.formatDate(this.selectedDate()));
  }

  private processAttendanceList(data: LocalAttendance[], append = false): void {
    const mappedAttendances = data.map((rec: LocalAttendance) => {
      const checkInUTC = rec.check_in ? new Date(rec.check_in) : null;
      const checkOutUTC = rec.check_out !== null ? new Date(rec.check_out) : null;

      return {
        ...rec,
        display_check_in: convertToIST(checkInUTC, 'display'),
        display_check_out: checkOutUTC !== null ? convertToIST(checkOutUTC, 'display') : 'N/A',
        check_in: convertToIST(checkInUTC, 'system'),
        check_out: convertToIST(checkOutUTC, 'system'),
        display_worked_hours: this.convertHoursToHHMM(rec.worked_hours)
      };
    });

    this.attendances.set(append ? [...this.attendances(), ...mappedAttendances] : mappedAttendances);
    this.applyFiltersToLoadedAttendances();
  }

  private applyFiltersToLoadedAttendances(): void {
    const search = this.employeeSearch().toLowerCase();
    this.filteredAttendances.set(this.attendances().filter(att => {
      const matchesName = !search || att.employee_name.toLowerCase().includes(search);

      let withinDateRange = true;
      if (att.check_in) {
        const checkInDate = att.check_in.slice(0, 10);
        if (this.fromDate()) withinDateRange = withinDateRange && checkInDate >= this.fromDate();
        if (this.toDate()) withinDateRange = withinDateRange && checkInDate <= this.toDate();
      }

      return matchesName && withinDateRange;
    }));
  }

  private convertHoursToHHMM(hours: number): string {
    if (!hours) return '00:00';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  goTo(page: string): void {
    if (page === '/home') {
      this.storage.exitPage = '/home';
    }
    this.router.navigateByUrl(page);
  }

  ionViewWillLeave(): void {
  }

  filterData(): void {
    this.applyFiltersToLoadedAttendances();
  }

  clearFilters(): void {
    this.employeeSearch.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.filteredAttendances.set([...this.attendances()]);
  }

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
