import { inject, signal, computed, Component, ViewChild } from '@angular/core';
import { App } from '@capacitor/app';
import { BackgroundMode } from '@anuradev/capacitor-background-mode';

import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonMenuToggle, ModalController, IonIcon, IonButtons, NavController, IonToggle, IonInput, IonSelect, IonSelectOption, AlertController, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonBackButton } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import { PinsetupPage } from '../pinsetup/pinsetup.page';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { TranslateModule } from '@ngx-translate/core';
import { AndroidSettings, IOSSettings, NativeSettings } from "capacitor-native-settings";
import { addIcons } from 'ionicons';
import { arrowBackOutline, flashOutline, settingsOutline, languageOutline, logInOutline, logOutOutline, syncOutline, keyOutline, serverOutline, calendarOutline, chevronForwardOutline, alertCircleOutline, ellipsisVertical } from 'ionicons/icons';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonBackButton, IonCardContent, IonCardTitle, IonCardHeader, IonCard,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonButtons,
    IonToggle,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonMenuToggle,
    TranslateModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss']
})
export class SettingsPage {
  goToRenewal() {
    this.nav.navigateForward('/license-renewal');
  }
  licenseWarningMessage = signal<string>('');
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  delayUnits: Array<{ value: 'h' | 'm' | 's', label: 'h' | 'm' | 's' }> = [
    { value: 'h', label: 'h' },
    { value: 'm', label: 'm' },
    { value: 's', label: 's' }
  ];
  url = signal<string>('https://example.com');
  username = signal<string>('john.doe');
  password = signal<string>('********');
  cred = signal<LocalCredentials | undefined>(undefined);
  sound = signal<boolean>(false);
  selected_company = signal<number | undefined>(0);
  allowed_companies = signal<{ "id": number, "name": string }[]>([]);
  check_in_delay_value = signal<number>(30);
  check_in_delay_unit = signal<'h' | 'm' | 's'>('s');
  check_out_delay_value = signal<number>(1);
  check_out_delay_unit = signal<'h' | 'm' | 's'>('m');
  sync_delay_value = signal<number>(15);
  sync_delay_unit = signal<'h' | 'm' | 's'>('m');
  languages = [
    { code: 'ta', label: 'தமிழ்' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'te', label: 'తెలుగు' }
  ];
  selectedLanguage = signal<string>('en');
  isOptimized = signal<boolean>(true);
  @ViewChild("soundToggle") soundToggle: HTMLIonToggleElement | undefined;

  constructor(
    private router: Router,
    private modal: ModalController,
    public nav: NavController,
    private storage: StorageService,
    private odoo: OdooJsonRpcService,
    private attService: AttendanceService,
    private ionAlert: AlertController
  ) {
    addIcons({ arrowBackOutline, flashOutline, settingsOutline, languageOutline, logInOutline, logOutOutline, syncOutline, keyOutline, serverOutline, calendarOutline, chevronForwardOutline, alertCircleOutline, ellipsisVertical });
  }

  async openBatterySettings() {
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App
    });
  }

  private parseStoredDuration(duration: string | undefined, fallback: { value: number, unit: 'h' | 'm' | 's' }): { value: number, unit: 'h' | 'm' | 's' } {
    if (!duration) {
      return fallback;
    }

    const match = duration.trim().match(/^(\d+)([hms])$/i);
    if (match) {
      return {
        value: Number(match[1]) || fallback.value,
        unit: match[2].toLowerCase() as 'h' | 'm' | 's'
      };
    }

    const totalSeconds = this.durationToSeconds(duration);
    if (totalSeconds <= 0) {
      return fallback;
    }

    if (totalSeconds % 3600 === 0) {
      return { value: totalSeconds / 3600, unit: 'h' };
    }

    if (totalSeconds % 60 === 0) {
      return { value: totalSeconds / 60, unit: 'm' };
    }

    return { value: totalSeconds, unit: 's' };
  }

  private durationToSeconds(duration: string): number {
    const matches = duration.match(/(\d+)([hms])/gi);
    if (!matches) {
      return 0;
    }

    return matches.reduce((total, token) => {
      const [, rawValue, rawUnit] = token.match(/(\d+)([hms])/i) || [];
      const value = Number(rawValue || 0);
      const unit = (rawUnit || '').toLowerCase();

      if (unit === 'h') return total + (value * 3600);
      if (unit === 'm') return total + (value * 60);
      if (unit === 's') return total + value;
      return total;
    }, 0);
  }

  private buildDuration(value: number, unit: 'h' | 'm' | 's'): string {
    const safeValue = Math.max(0, Math.floor(Number(value) || 0));
    return `${safeValue}${unit}`;
  }

  isDelayEmpty(value: number | null | undefined | string): boolean {
    return value === null || value === undefined || value === '' || Number.isNaN(Number(value));
  }

  private normalizeDelayValue(value: number | null | undefined | string): number | null {
    if (this.isDelayEmpty(value)) {
      return null;
    }

    const numericValue = Math.max(0, Math.floor(Number(value)));
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private hasInvalidDelayValues(): boolean {
    return this.isDelayEmpty(this.check_in_delay_value())
      || this.isDelayEmpty(this.check_out_delay_value())
      || this.isDelayEmpty(this.sync_delay_value());
  }

  async autoSaveSettings(): Promise<void> {
    const currentCred = this.cred();
    if (!currentCred || this.hasInvalidDelayValues()) {
      return;
    }

    this.check_in_delay_value.set(this.normalizeDelayValue(this.check_in_delay_value()) ?? this.check_in_delay_value());
    this.check_out_delay_value.set(this.normalizeDelayValue(this.check_out_delay_value()) ?? this.check_out_delay_value());
    this.sync_delay_value.set(this.normalizeDelayValue(this.sync_delay_value()) ?? this.sync_delay_value());

    currentCred.sound = this.soundToggle?.checked || false;
    currentCred.check_in_delay = this.buildDuration(this.check_in_delay_value(), this.check_in_delay_unit());
    currentCred.check_out_delay = this.buildDuration(this.check_out_delay_value(), this.check_out_delay_unit());
    currentCred.sync_delay = this.buildDuration(this.sync_delay_value(), this.sync_delay_unit());
    currentCred.selected_company = this.allowed_companies().filter((comp) => comp.id === this.selected_company())[0];
    this.storage.selected_company = currentCred.selected_company;

    await Preferences.set({ key: "credentials", value: JSON.stringify(currentCred) });
    this.attService.cron();
  }

  async ionViewWillEnter() {
    const licenseStatus = String((await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_license_status' }))).value || '').trim().toLowerCase();
    const expiryDateStr = (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_expiry_date' }))).value || (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_trial_end_date' }))).value;

    this.licenseWarningMessage.set('');
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
      }
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

    let credJson: LocalCredentials = await this.storage.getCredentials();
    let language = await this.storage.getLanguage();
    this.cred.set(credJson);
    if (credJson) {
      this.url.set(credJson.url);
      this.username.set(credJson.login);
      this.password.set(credJson.password);
      this.sound.set(credJson.sound);
      const checkInDelay = this.parseStoredDuration(credJson.check_in_delay, { value: 30, unit: 's' });
      this.check_in_delay_value.set(checkInDelay.value);
      this.check_in_delay_unit.set(checkInDelay.unit);

      const checkOutDelay = this.parseStoredDuration(credJson.check_out_delay, { value: 1, unit: 'm' });
      this.check_out_delay_value.set(checkOutDelay.value);
      this.check_out_delay_unit.set(checkOutDelay.unit);

      const syncDelay = this.parseStoredDuration(credJson.sync_delay, { value: 15, unit: 'm' });
      this.sync_delay_value.set(syncDelay.value);
      this.sync_delay_unit.set(syncDelay.unit);
      this.selected_company.set(credJson.selected_company?.id);
      this.allowed_companies.set(credJson.companies);
      this.selectedLanguage.set(language);
    }
    if ((await import('@capacitor/core')).Capacitor.isNativePlatform()) {
      try {
        const status = await BackgroundMode.checkBatteryOptimizations();
        this.isOptimized.set(status.enabled);
      } catch (e) {
        console.error('Error checking battery optimization status:', e);
      }
    }
  }

  async logout(): Promise<void> {
    let logoutAlert = await this.ionAlert.create({
      cssClass: 'logout-alert',
      header: this.storage.translate.instant("LOGOUT"),
      message: this.storage.translate.instant("ARE_YOU_LOGOUT"),
      buttons: [
        { text: this.storage.translate.instant("CANCEL"), role: 'cancel', cssClass: 'logout-cancel-button' },
        {
          text: this.storage.translate.instant("LOGOUT"),
          cssClass: 'logout-confirm-button',
          handler: async () => {
            await this.storage.showLoading();
            try {
              await this.attService.syncToOdoo();
              await this.storage.logoutCleanup();
              this.attService.stopSyncing();

              this.storage.isAuthenticated = false;
              this.odoo.uid = undefined;
              this.odoo.username = "";
              this.odoo.password = "";
              this.storage.currentEmployee = undefined;
              this.cred.set(await this.storage.getCredentials());

              await this.storage.hideLoading();
              this.storage.exitPage = "/login";
              this.router.navigateByUrl('/login', { replaceUrl: true });
            } catch (e) {
              await this.storage.hideLoading();
              console.error("Logout error", e);
            }
          }
        }
      ]
    });
    await logoutAlert.present();
  }

  changeLanguage() {
    this.storage.setLanguage(this.selectedLanguage());
    this.storage.translate.use(this.selectedLanguage());
  }

  async pinChange(): Promise<void> {
    let pinModal: HTMLIonModalElement = await this.modal.create({
      component: PinsetupPage,
      componentProps: { "settingsModal": this.modal }
    });
    pinModal.present();
  }

  openServerConfigurationPage(): void {
    this.router.navigate(['/server-configuration']);
  }

  openPlanDetailsPage(): void {
    this.router.navigate(['/plan-details']);
  }

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
