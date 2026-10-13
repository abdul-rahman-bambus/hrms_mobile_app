import { inject, signal, computed, Component, OnDestroy, OnInit } from '@angular/core';
import { App } from '@capacitor/app';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { AttendanceService, EmployeeService, LocalEmployees, StorageService } from '../services/storage.service';
import { addIcons } from 'ionicons';
import { ellipsisVertical, trashOutline, syncOutline } from 'ionicons/icons';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonContent,
  IonButton,
  IonButtons,
  IonLabel,
  IonItem,
  IonList,
  IonSegmentButton,
  IonSegment,
  IonSearchbar,
  IonFooter,
  IonMenuToggle,
  IonProgressBar,
  IonSegmentContent,
  IonSegmentView, IonBackButton
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-employee-list',
  templateUrl: './employee-list.page.html',
  styleUrls: ['./employee-list.page.scss'],
  standalone: true,
  imports: [IonBackButton,
    FormsModule,
    RouterModule,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonContent,
    IonButton,
    IonButtons,
    IonLabel,
    IonItem,
    IonList,
    IonSegmentButton,
    IonSegment,
    IonSearchbar,
    IonFooter,
    IonMenuToggle,
    IonProgressBar,
    IonSegmentContent,
    IonSegmentView
  ],
})
export class EmployeeListPage implements OnInit, OnDestroy {
  goToRenewal() {
    this.router.navigateByUrl('/license-renewal');
  }
  licenseWarningMessage = signal<string>('');
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  employees = signal<LocalEmployees[]>([]);
  isAdminUser = signal<boolean>(false);
  filteredEnrolledEmployees = signal<LocalEmployees[]>([]);
  filteredNonEnrolledEmployees = signal<LocalEmployees[]>([]);
  loading = signal<boolean>(false);
  isSyncing = signal<boolean>(false);
  private isComponentActive: boolean = true;

  searchTerm = signal<string>('');

  constructor(
    private odoo: OdooJsonRpcService,
    public router: Router,
    public storage: StorageService,
    public empservice: EmployeeService,
    private route: ActivatedRoute,
    private att: AttendanceService
  ) {
    addIcons({ ellipsisVertical, trashOutline, syncOutline });
  }

  async syncUsers(): Promise<void> {
    if (this.isSyncing() || !this.storage.isNetworkAvailable || !this.odoo.uid) {
      return;
    }

    this.isSyncing.set(true);

    try {
      await this.att.syncToOdoo();
      await this.storage.syncUsers();

      if (this.isComponentActive) {
        this.employees.set(await this.storage.getAllEmployees());
        this.filterList();

        await this.storage.showToast({
          message: this.storage.translate.instant("EMPLOYEE_SYNC_COMPL"),
          duration: 3000,
          color: 'success',
          position: "top"
        });
      }
    } finally {
      this.isSyncing.set(false);
    }
  }

  async clearAllEmployeeDataDebug(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.storage.clearEmployees();
      await Preferences.remove({ key: 'enrollments' });
      this.employees.set([]);
      this.filterList();
      await this.storage.showToast({
        message: 'Master employee data & enrollments cleared.',
        duration: 3000,
        color: 'warning',
        position: 'top'
      });
    } catch (err) {
      console.error('Error clearing master employee data:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async ngOnInit() {
    this.storage.employee_filter_status = "not_enrolled";
  }

  goTo(page: string): void {
    if (page === "/home") {
      this.storage.exitPage = "/home"
    }
    this.router.navigateByUrl(page)
  }

  ngOnDestroy(): void {
    this.isComponentActive = false;
    this.employees.set([]);
    this.filteredEnrolledEmployees.set([]);
    this.filteredNonEnrolledEmployees.set([]);
  }

  getFormattedImage(imgStr: string | boolean | any): string {
    if (!imgStr || imgStr === 'false') {
      return '/assets/person.png';
    }

    if ((typeof imgStr) === "string" && imgStr.startsWith('PD94bW')) {
      return `data:image/svg+xml;base64,${imgStr}`;
    } else if ((typeof imgStr) === "string" && imgStr.startsWith('iVBORw')) {
      return `data:image/png;base64,${imgStr}`;
    } else if ((typeof imgStr) === "string" && imgStr.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${imgStr}`;
    }

    return `data:image/jpeg;base64,${imgStr}`;
  }

  async ionViewWillEnter() {
    const licenseStatus = String((await Preferences.get({ key: 'config_license_status' })).value || '').trim().toLowerCase();
    const expiryDateStr = (await Preferences.get({ key: 'config_expiry_date' })).value || (await Preferences.get({ key: 'config_trial_end_date' })).value;
    
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
    });

    this.isComponentActive = true;
    this.loading.set(true);

    try {
      const credentials = await this.storage.getCredentials();
      this.isAdminUser.set(credentials?.is_admin_user === true);
      if (!this.isAdminUser()) {
        await this.router.navigateByUrl('/profile');
        return;
      }

      this.employees.set(await this.storage.getAllEmployees());
      if (this.storage.isNetworkAvailable && this.employees().length === 0) {
        await this.storage.syncUsers();

        if (this.isComponentActive) {
          this.employees.set(await this.storage.getAllEmployees());
          this.filterList();
        }
      } else {
        this.filterList();
      }
    } catch (error) {
      console.error("Error loading employees", error);
    } finally {
      this.loading.set(false);
    }
  }

  filterList(): void {
    const empList = this.employees();
    if (!empList) return;

    const term = this.searchTerm().trim().toLowerCase();

    const enrolled: LocalEmployees[] = [];
    const nonEnrolled: LocalEmployees[] = [];
    empList.forEach((emp) => {
      const matchesSearch = term === '' || emp.display_name.toLowerCase().includes(term);

      if (matchesSearch) {
        if (emp.is_enrolled === 1) {
          enrolled.push(emp);
        } else {
          nonEnrolled.push(emp);
        }
      }
    });
    this.filteredEnrolledEmployees.set(enrolled);
    this.filteredNonEnrolledEmployees.set(nonEnrolled);
  }

  openEnrollmentForm(emp: any): void {
    this.storage.selectedEmployee = emp;
    this.router.navigateByUrl('/enroll');
  }

  segmentChanged(event: any): void {
    this.storage.employee_filter_status = event.detail.value;
    this.filterList();
  }

  onSearchInput(event: any): void {
    this.searchTerm.set(event.detail.value || '');
    this.filterList();
  }

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
