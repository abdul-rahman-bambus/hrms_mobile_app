import { helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { StorageService, AttendanceService } from '../../services/storage.service';
import { OdooJsonRpcService } from '../../services/odoojsonrpc.service';

import { LoginPage } from '../login.page';


import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IonContent, IonSpinner, IonIcon, IonSelect, IonSelectOption, IonInput, IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, AlertController, ModalController, NavController, ToastController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-credentials-login',
  templateUrl: './credentials-login.page.html',
  styleUrls: ['../login.page.scss'],
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, IonContent, IonSpinner, IonIcon, IonSelect, IonSelectOption, IonInput, IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonTitle]
})
export class CredentialsLoginPage extends LoginPage {
  showloader = signal<boolean>(false);
  loaderMessage = signal<string>('Signing You In');
  loginNotice = signal<string>('');
  isCriticalLicenseState = signal<boolean>(false);
  visibleLicenseBannerMessage = signal<string>('');
  showRenewActionInLoginNotice = signal<boolean>(false);
  showRenewActionInLicenseBanner = signal<boolean>(false);
  loginLicenseActionLabel = signal<string>('Renew');
  licenseBannerIcon = signal<string>('warning');
  authModeInitialized = signal<boolean>(true);
  authBootstrapPending = signal<boolean>(false);
  activeAuthMode = signal<string>('credentials');
  isPlan3OrAbove = signal<boolean>(false);
  availableCompanies = signal<any[]>([]);
  selectedSwitchCompanyName = signal<string>('');
  showForgotPasswordModal = signal<boolean>(false);
  forgotPasswordEmail = signal<string>('');
  isForgotPasswordLoading = signal<boolean>(false);

  constructor(
    router: Router,
    toastCtrl: ToastController,
    odoo: OdooJsonRpcService,
    storage: StorageService,
    route: ActivatedRoute,
    modalCtrl: ModalController,
    attService: AttendanceService
  ) {
    super(router, toastCtrl, odoo, storage, route, modalCtrl, attService);
    addIcons({ helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline });
  }

  
  override async ionViewWillEnter(): Promise<void> {
    await super.ionViewWillEnter();
    const licenseStatus = (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_license_status' }))).value;
    if (String(licenseStatus || '').trim().toLowerCase() === 'expired') {
        this.loginNotice.set('Your license has expired.');
        this.isCriticalLicenseState.set(true);
        this.showRenewActionInLoginNotice.set(true);
        this.licenseBannerIcon.set('warning');
        this.loginLicenseActionLabel.set('Renew License');
    } else {
        this.loginNotice.set('');
    }
  }

  goToHelp() {
    this['router'].navigate(['/user-manual']);
  }
  goToRenewal() {
    this['router'].navigateByUrl('/license-renewal');
  }
  onCompanySelectChange() { }
  clearLoginUsername() {
    this.username.set('');
  }
  view_password() {
    const el = document.getElementById('password') as HTMLInputElement;
    if (el) {
      if (el.type === 'password') {
        el.type = 'text';
      } else {
        el.type = 'password';
      }
    }
  }
  set_focus(id: string) {
    document.getElementById(id)?.focus();
  }
  handleForgotPassword() {
    this.showForgotPasswordModal.set(true);
  }
  closeForgotPasswordModal() {
    this.showForgotPasswordModal.set(false);
  }
  submitForgotPassword() { }
  switchAccount(mode: string) {
    this['router'].navigate([`/login/${mode}`]);
  }
}
