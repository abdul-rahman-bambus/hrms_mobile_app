import { helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline, briefcaseOutline, peopleOutline, lockOpenOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { StorageService, AttendanceService } from '../../services/storage.service';
import { OdooJsonRpcService } from '../../services/odoojsonrpc.service';

import { LoginPage } from '../login.page';


import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IonContent, IonSpinner, IonIcon, IonInput, IonSelect, IonSelectOption, ModalController, ToastController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-pin-login',
  templateUrl: './pin-login.page.html',
  styleUrls: ['../login.page.scss'],
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, IonContent, IonSpinner, IonIcon, IonInput, IonSelect, IonSelectOption]
})
export class PinLoginPage extends LoginPage {
  isPinAuthenticating = signal<boolean>(false);
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
  activeAuthMode = signal<string>('pin');
  isPlan3OrAbove = signal<boolean>(false);
  availableCompanies = signal<any[]>([]);
  selectedSwitchCompanyName = signal<string>('');
  multiUserEnabled = signal<boolean>(false);
  pinUsers = signal<any[]>([]);
  selectedPinUserId = signal<any>(null);
  pinBusinessName = signal<string>('');

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
    addIcons({ helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline, briefcaseOutline, peopleOutline, lockOpenOutline });
  }

  goToHelp() {
    this['router'].navigate(['/user-manual']);
  }
  goToRenewal() { }
  onCompanySelectChange() { }
  switchAccount(mode: string) {
    this['router'].navigate([`/login/${mode}`]);
  }
  onUserSelectChange() { }
  onPinBusinessChange() { }
  handleForgotPin() {
    this.isPinRecoveryMode.set(true);
    this['router'].navigate(['/login/credentials']);
  }
}
