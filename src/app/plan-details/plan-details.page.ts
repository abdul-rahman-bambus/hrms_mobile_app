import { AttendanceService, StorageService } from '../services/storage.service';
import { inject, signal, computed, Component } from '@angular/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';
import { NgClass } from '@angular/common';
import { Preferences } from '@capacitor/preferences';
import { addIcons } from 'ionicons';
import { arrowBackOutline, calendarOutline, businessOutline, informationCircleOutline, timeOutline, cloudOutline } from 'ionicons/icons';
import { TranslateModule } from '@ngx-translate/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonIcon, IonContent, IonCard, IonCardContent, IonSpinner, IonButton, ToastController } from '@ionic/angular/standalone';

import { OdooJsonRpcService } from '../services/odoojsonrpc.service';

type TenantStatusSnapshot = {
  planCode: string;
  companyName: string;
  businessName: string;
  licenseStatus: string;
  provisionStatus: string;
  expiryDate: string;
  trialEndDate: string;
  url: string;
  username: string;
};

@Component({
  selector: 'app-plan-details',
  standalone: true,
  imports: [
    TranslateModule,
    NgClass,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonContent,
    IonCard,
    IonCardContent,
    IonSpinner,
    IonButton
  ],
  templateUrl: './plan-details.page.html',
  styleUrls: ['./plan-details.page.scss']
})
export class PlanDetailsPage {
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  isLoading = signal<boolean>(true);
  isExpiringSoon = signal<boolean>(false);
  details = signal<TenantStatusSnapshot>({
    planCode: '',
    companyName: '',
    businessName: '',
    licenseStatus: '',
    provisionStatus: '',
    expiryDate: '',
    trialEndDate: '',
    url: '',
    username: ''
  });

  constructor(private odoo: OdooJsonRpcService, private toastCtrl: ToastController, private router: Router) {
    addIcons({ arrowBackOutline, calendarOutline, businessOutline, informationCircleOutline, timeOutline, cloudOutline });
  }

  async ionViewWillEnter() {

    if (this.appStateSub) {
      this.appStateSub.remove();
    }
    this.appStateSub = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && this._injectedStorage.isNetworkAvailable) {
        console.log('App backgrounded, syncing data...');
        await this._injectedAttService.syncToOdoo();
      }
    });

    await this.loadDetails();
  }

  async refresh(): Promise<void> {
    await this.loadDetails();
  }

  private async loadDetails(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [
        configPlan,
        configCompanyName,
        configBusinessName,
        configUrl,
        configUser,
        configTenantLookupUser,
        configDb,
        configLicenseStatus,
        configProvisionStatus,
        configTrialEndDate,
        configExpiryDate
      ] = await Promise.all([
        Preferences.get({ key: 'config_plan' }),
        Preferences.get({ key: 'config_company_name' }),
        Preferences.get({ key: 'config_business_name' }),
        Preferences.get({ key: 'config_url' }),
        Preferences.get({ key: 'config_user' }),
        Preferences.get({ key: 'config_tenant_lookup_user' }),
        Preferences.get({ key: 'config_db' }),
        Preferences.get({ key: 'config_license_status' }),
        Preferences.get({ key: 'config_provision_status' }),
        Preferences.get({ key: 'config_trial_end_date' }),
        Preferences.get({ key: 'config_expiry_date' })
      ]);

      const fallbackDetails: TenantStatusSnapshot = {
        planCode: String(configPlan.value || '').trim(),
        companyName: String(configCompanyName.value || '').trim(),
        businessName: String(configBusinessName.value || configDb.value || '').trim(),
        licenseStatus: String(configLicenseStatus.value || '').trim(),
        provisionStatus: String(configProvisionStatus.value || '').trim(),
        expiryDate: String(configExpiryDate.value || '').trim(),
        trialEndDate: String(configTrialEndDate.value || '').trim(),
        url: String(configUrl.value || '').trim(),
        username: String(configUser.value || '').trim()
      };

      let remoteTenant: any = null;
      try {
        const fqdn = fallbackDetails.url.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
        const tenantLookupUser = String(configTenantLookupUser.value || fallbackDetails.username || '').trim();
        const isLookupEmail = tenantLookupUser.includes('@');
        console.log('[Plan Details] tenant refresh request', {
          hasUsername: Boolean(fallbackDetails.username),
          tenant_lookup_user: tenantLookupUser,
          tenant_db_name: fallbackDetails.businessName,
          company_name: fallbackDetails.companyName,
          fqdn
        });
        remoteTenant = await this.odoo.fetchUpdatedTenantFromSubscription({
          email: isLookupEmail ? tenantLookupUser : undefined,
          mobile_number: !isLookupEmail ? tenantLookupUser : undefined,
          tenant_db_name: fallbackDetails.businessName || undefined,
          company_name: fallbackDetails.companyName || undefined,
          fqdn: fqdn || undefined
        });
        console.log('[Plan Details] tenant refresh response', {
          found: Boolean(remoteTenant),
          tenant_db_name: remoteTenant?.db_name || '',
          company_name: remoteTenant?.company_name || '',
          status: remoteTenant?.status || remoteTenant?.provision_step || '',
          license_status: remoteTenant?.license_status || '',
          hasPlanCode: Boolean(remoteTenant?.plan_code),
          hasExpiryDate: Boolean(remoteTenant?.license_expiry_date || remoteTenant?.expiry_date || remoteTenant?.trial_end_date)
        });
      } catch (error: any) {
        remoteTenant = null;
        console.error('Error fetching tenant details:', error);
        const toast = await this.toastCtrl.create({
          message: 'Unable to refresh plan status: ' + (error?.message || 'Network error'),
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
      }

      const updatedDetails: TenantStatusSnapshot = {
        planCode: String(remoteTenant?.plan_code || fallbackDetails.planCode || '').trim(),
        companyName: String(remoteTenant?.company_name || fallbackDetails.companyName || '').trim(),
        businessName: String(remoteTenant?.db_name || fallbackDetails.businessName || '').trim(),
        licenseStatus: String(remoteTenant?.license_status || fallbackDetails.licenseStatus || '').trim(),
        provisionStatus: String(remoteTenant?.status || remoteTenant?.provision_step || fallbackDetails.provisionStatus || '').trim(),
        expiryDate: String(remoteTenant?.license_expiry_date || fallbackDetails.expiryDate || '').trim(),
        trialEndDate: String(remoteTenant?.trial_end_date || fallbackDetails.trialEndDate || '').trim(),
        url: this.odoo.resolveTenantWebUrl(remoteTenant || {}) || fallbackDetails.url,
        username: fallbackDetails.username
      };

      this.details.set(updatedDetails);

      if (remoteTenant) {
        await Promise.all([
          Preferences.set({ key: 'config_license_status', value: updatedDetails.licenseStatus }),
          Preferences.set({ key: 'config_provision_status', value: updatedDetails.provisionStatus }),
          Preferences.set({ key: 'config_trial_end_date', value: updatedDetails.trialEndDate }),
          Preferences.set({ key: 'config_expiry_date', value: updatedDetails.expiryDate })
        ]);
      }

      if (updatedDetails.licenseStatus.toLowerCase() === 'expired') {
        const toast = await this.toastCtrl.create({
          message: 'Your license has expired. Please renew your license.',
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
        this._injectedStorage.isAuthenticated = false;
        this._injectedStorage.isPinAuthenticated = false;
        this.router.navigateByUrl('/login/credentials');
        this._injectedStorage.exitPage = '/login/credentials';
      }

      this.isExpiringSoon.set(false);
      const licenseStatus = updatedDetails.licenseStatus.toLowerCase();
      const expiryDateStr = updatedDetails.expiryDate || updatedDetails.trialEndDate;
      if ((licenseStatus === 'trial' || licenseStatus === 'active') && expiryDateStr) {
        const expiryDate = new Date(expiryDateStr);
        const diffTime = expiryDate.getTime() - new Date().getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 3 && diffDays >= 0) {
          this.isExpiringSoon.set(true);
        }
      }

    } finally {
      this.isLoading.set(false);
    }
  }

  goToRenewal() {
    this.router.navigateByUrl('/license-renewal');
  }

  planDisplayLabel = computed<string>(() => {
    const rawPlan = String(this.details().planCode || '').trim();
    if (!rawPlan) return 'Not configured';
    if (rawPlan.toLowerCase() === 'hr18') return 'HRMS 18';
    return rawPlan.replace(/[_-]+/g, ' ').toUpperCase();
  });

  statusDisplayLabel = computed<string>(() => {
    const rawLicenseStatus = String(this.details().licenseStatus || '').trim().toLowerCase();
    const rawProvisionStatus = String(this.details().provisionStatus || '').trim().toLowerCase();

    if (rawLicenseStatus === 'trial') return 'Trial';
    if (rawLicenseStatus === 'active') return 'Active';
    if (rawLicenseStatus === 'grace') return 'Grace';
    if (rawLicenseStatus === 'expired') return 'Expired';
    if (rawLicenseStatus === 'cancelled') return 'Cancelled';
    if (rawLicenseStatus) return rawLicenseStatus.replace(/[_-]+/g, ' ');

    if (!rawProvisionStatus) return 'Saved locally';
    if (rawProvisionStatus === 'active') return 'Provisioned';
    if (rawProvisionStatus === 'disabled') return 'Disabled';
    if (rawProvisionStatus === 'error') return 'Needs attention';
    if (rawProvisionStatus === 'deleting') return 'Deleting';
    return rawProvisionStatus.replace(/[_-]+/g, ' ');
  });

  statusClass = computed<string>(() => {
    const rawLicenseStatus = String(this.details().licenseStatus || '').trim().toLowerCase();
    const rawProvisionStatus = String(this.details().provisionStatus || '').trim().toLowerCase();

    if (rawLicenseStatus === 'trial') return 'status-trial';
    if (rawLicenseStatus === 'active') return 'status-active';
    if (rawLicenseStatus === 'grace') return 'status-trial';
    if (rawLicenseStatus === 'expired' || rawLicenseStatus === 'cancelled') return 'status-alert';

    if (rawProvisionStatus === 'active') return 'status-neutral';
    if (rawProvisionStatus === 'disabled' || rawProvisionStatus === 'error' || rawProvisionStatus === 'deleting') return 'status-alert';
    return 'status-neutral';
  });

  provisionStatusLabel = computed<string>(() => {
    const rawProvisionStatus = String(this.details().provisionStatus || '').trim().toLowerCase();
    if (!rawProvisionStatus) return 'Not available';
    if (rawProvisionStatus === 'active') return 'Active';
    if (rawProvisionStatus === 'disabled') return 'Disabled';
    if (rawProvisionStatus === 'error') return 'Error';
    if (rawProvisionStatus === 'deleting') return 'Deleting';
    return rawProvisionStatus.replace(/[_-]+/g, ' ');
  });

  expiryLabel = computed<string>(() => {
    const rawLicenseStatus = String(this.details().licenseStatus || '').trim().toLowerCase();
    if (rawLicenseStatus === 'trial' && this.details().trialEndDate) return 'Trial End';
    return this.details().expiryDate ? 'License Expiry' : 'Trial End';
  });

  private formatTenantDate(rawValue: string): string {
    const raw = String(rawValue || '').trim();
    if (!raw) return 'N/A';
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  expiryValue = computed<string>(() => {
    const rawDate = this.details().expiryDate || this.details().trialEndDate;
    if (!rawDate) return 'Not available';
    return this.formatTenantDate(rawDate);
  });

  ionViewDidLeave() {

    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}

