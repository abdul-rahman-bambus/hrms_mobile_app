import { Component, Input, OnDestroy, OnInit, ViewChild, signal, computed } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonContent, ToastController, ModalController, IonIcon, IonSelect, IonSelectOption, IonButton, IonHeader, IonButtons, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { StorageService, LocalCredentials, AttendanceService } from '../services/storage.service';
import { Preferences } from "@capacitor/preferences";
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { languageOutline, qrCodeOutline } from 'ionicons/icons';
import { TranslateModule } from '@ngx-translate/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner, GoogleBarcodeScannerModuleInstallState } from '@capacitor-mlkit/barcode-scanning';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonSelect, IonSelectOption, IonButton, TranslateModule, IonHeader, IonButtons, IonTitle, IonToolbar],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit, OnDestroy {
  url = signal<string>('');
  username = signal<string>('');
  password = signal<string>('');
  pin = signal<string>('');
  isPinSet = signal<boolean>(false);
  denied = signal<boolean>(false);
  isPinRecoveryMode = signal<boolean>(false);
  @Input("gotopage") gotopage: string | undefined;
  @Input("loginmodal") loginmodal: ModalController | undefined;
  @ViewChild('langSelect', { static: false }) select: IonSelect | undefined;
  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private attService: AttendanceService
  ) {
    addIcons({ languageOutline, qrCodeOutline });
  }
  selectedLanguage = signal<string>('');
  languages = [
    { code: 'ta', label: 'தமிழ்' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'kn', label: 'കನ್ನಡ' },
    { code: 'te', label: 'తెలుగు' }
  ];
  private querySub: Subscription | undefined;
  private googleScannerInstallHandle?: PluginListenerHandle;

  showPinLogin = computed(() => this.isPinSet() && !this.isPinRecoveryMode());

  showUrlField = computed(() => !this.isPinRecoveryMode());

  changeLanguage() {
    if (this.selectedLanguage() !== this.storage.translate.currentLang) {
      this.storage.setLanguage(this.selectedLanguage());
      this.storage.translate.use(this.selectedLanguage());
    }
  }

  openLang() {
    console.log(this.select, 'seleee');
    this.select?.open();
  }

  onPinInput(value: string): void {
    this.pin.set(String(value || '').replace(/\D/g, '').slice(0, 4));
  }

  async ionViewWillLeave() {
    this.storage.setLanguage(this.selectedLanguage());
    this.querySub?.unsubscribe();
  }

  ngOnDestroy() {
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
    void this.googleScannerInstallHandle?.remove();
  }

  async ionViewWillEnter(): Promise<void> {
    this.storage.hideLoading();
    this.selectedLanguage.set(await this.storage.getLanguage() || "en");
    let credentialsJSON: LocalCredentials = await this.storage.getCredentials();
    this.pin.set('');
    this.isPinRecoveryMode.set(false);
    this.denied.set(false);

    console.log(this.denied(), credentialsJSON, "denited");
    if (this.querySub) {
      this.querySub.unsubscribe();
    }

    this.querySub = this.route.queryParams.subscribe((vals) => {
      console.log('login subscribe');
      if (vals) {
        this.url.set(credentialsJSON?.['url'] || '');
        if (!this.username()) {
          this.username.set(String(credentialsJSON?.login || '').trim());
        }
        if (vals['denied']) {
          this.denied.set(true);
        }
      }
    });
    let topModal = await this.modalCtrl.getTop();

    this.isPinSet.set((credentialsJSON?.pin?.length > 0 && credentialsJSON?.uid && !this.denied()) || topModal != undefined);
  }

  ngOnInit(): void {

  }

  private isValidUrl(url: string): boolean {
    const pattern: RegExp = /^(https?:\/\/)?([a-zA-Z0-9.-]+)(:\d+)?(\/.*)?$/;
    return pattern.test(url.trim());
  }

  private async getEffectiveLoginUrl(): Promise<string> {
    const storedCredentials: LocalCredentials = await this.storage.getCredentials();
    return String(this.url() || storedCredentials?.url || '').trim();
  }

  private async getEffectiveLoginDb(): Promise<string> {
    const storedCredentials: LocalCredentials = await this.storage.getCredentials();
    return String(storedCredentials?.db || '').trim();
  }

  async loginWithCredentials(): Promise<void> {
    const storedCredentials: LocalCredentials = await this.storage.getCredentials();
    const effectiveUrl: string = await this.getEffectiveLoginUrl();
    const effectiveDb: string = await this.getEffectiveLoginDb();

    if ((!effectiveUrl && this.showUrlField()) || !this.username() || !this.password()) {
      this.storage.showToast({
        message: this.storage.translate.instant("FILL_ALL_FIELDS_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    let inputUrl: string = effectiveUrl.trim();
    if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
      inputUrl = 'https://' + inputUrl;
    }

    if (!this.isValidUrl(inputUrl)) {
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_URL_FORMAT"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    await this.storage.showLoading();

    const isHttpsReachable: boolean = await this.odoo.pingOdooServer(inputUrl);
    let finalUrl: string = inputUrl;
    if (!isHttpsReachable) {
      const altUrl: string = inputUrl.startsWith('https://')
        ? inputUrl.replace('https://', 'http://')
        : inputUrl.replace('http://', 'https://');
      const isAltReachable: boolean = await this.odoo.pingOdooServer(altUrl);
      if (isAltReachable) {
        finalUrl = altUrl;
      } else {
        await this.storage.hideLoading();
        this.storage.showToast({
          message: this.storage.translate.instant("CANT_CONNECT_SERVER_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        });
        return;
      }
    }

    try {
      this.odoo.baseUrl = finalUrl;
      if (effectiveDb) {
        this.odoo.db = effectiveDb;
      }
      this.odoo.username = this.username().trim();
      this.odoo.password = this.password();

      const loginSuccess: number = await this.odoo.login();
      await this.storage.hideLoading();

      if (loginSuccess) {
        this.storage.isAuthenticated = true;
        this.storage.showToast({
          message: this.storage.translate.instant("LOGIN_SUCCESS_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        });
        this.odoo.uid = loginSuccess;
        let data: LocalCredentials = {
          url: finalUrl,
          login: this.username().trim(),
          password: this.password(),
          pin: '',
          db: this.odoo.db,
          sound: true,
          uid: loginSuccess,
          check_in_delay: "30s",
          check_out_delay: "1m",
          selected_company: undefined,
          companies: this.odoo.allowed_companies,
          sync_delay: "15m",
          current_employee_id: undefined,
          is_internal_user: this.odoo.is_internal_user,
          is_admin_user: this.odoo.is_admin_user,
        };

        if (!this.denied()) {
          if (this.isPinRecoveryMode() && storedCredentials) {
            data.sound = storedCredentials.sound;
            data.check_in_delay = storedCredentials.check_in_delay;
            data.check_out_delay = storedCredentials.check_out_delay;
            data.sync_delay = storedCredentials.sync_delay;
            data.current_employee_id = storedCredentials.current_employee_id;
            data.selected_company = storedCredentials.selected_company;
            data.is_internal_user = this.odoo.is_internal_user;
            data.is_admin_user = this.odoo.is_admin_user;
          }
          await Preferences.set({
            key: "credentials", value: JSON.stringify(data)
          });
          this.attService.cron();

          this.storage.exitPage = '/pinsetup';
          this.router.navigateByUrl('/pinsetup');
        }
        else if (this.denied()) {
          let credJson: LocalCredentials = await this.storage.getCredentials();
          let language = await this.storage.getLanguage();
          let data: LocalCredentials = {
            url: finalUrl,
            login: this.username().trim(),
            password: this.password(),
            pin: credJson?.pin,
            db: this.odoo.db,
            sound: credJson.sound,
            check_in_delay: credJson.check_in_delay,
            check_out_delay: credJson.check_out_delay,
            uid: undefined,
            selected_company: credJson.selected_company,
            companies: credJson.companies,
            sync_delay: credJson.sync_delay,
            current_employee_id: credJson.current_employee_id,
            is_internal_user: this.odoo.is_internal_user,
            is_admin_user: this.odoo.is_admin_user,
          };
          await this.storage.setLanguage(language || "en");
          await Preferences.set({
            key: "credentials", value: JSON.stringify(data)
          });
          let loginModal: HTMLIonModalElement = await this.modalCtrl.create({
            component: LoginPage,
            componentProps: { "gotopage": "/home", }
          });
          loginModal.present();
        }

        this.attService.startSyncing();
      } else {
        this.storage.showToast({
          message: this.storage.translate.instant("INVALID_CRED_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        });
      }
    } catch (error) {
      await this.storage.hideLoading();
      console.error('Login error:', error);
      this.storage.showToast({
        message: this.storage.translate.instant("ERROR_WHILE_LOGIN_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
    }
  }

  showForgotPinLogin(): void {
    this.isPinRecoveryMode.set(true);
    this.pin.set('');
    this.username.set('');
    this.password.set('');
  }

  showPinLoginScreen(): void {
    this.isPinRecoveryMode.set(false);
    this.password.set('');
  }

  async openForgotPassword(): Promise<void> {
    const effectiveUrl: string = await this.getEffectiveLoginUrl();

    if (!effectiveUrl.trim()) {
      this.storage.showToast({
        message: "Enter the server URL first",
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    let normalizedUrl: string = effectiveUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    if (!this.isValidUrl(normalizedUrl)) {
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_URL_FORMAT"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    const resetPasswordUrl = new URL('/web/reset_password', normalizedUrl).toString();
    window.open(resetPasswordUrl, '_blank', 'noopener,noreferrer');
  }

  private async ensureGoogleScannerModuleReady(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return true;
    }

    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (available) {
        return true;
      }

      await this.storage.showToast({
        message: "Preparing QR scanner. Please wait...",
        duration: 2000,
        color: 'medium',
        position: "top"
      });

      const moduleInstalled = await new Promise<boolean>(async (resolve) => {
        const timeoutId = window.setTimeout(async () => {
          await this.googleScannerInstallHandle?.remove();
          this.googleScannerInstallHandle = undefined;
          resolve(false);
        }, 45000);

        this.googleScannerInstallHandle = await BarcodeScanner.addListener(
          'googleBarcodeScannerModuleInstallProgress',
          async (event) => {
            if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
              window.clearTimeout(timeoutId);
              await this.googleScannerInstallHandle?.remove();
              this.googleScannerInstallHandle = undefined;
              resolve(true);
            }

            if (
              event.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
              event.state === GoogleBarcodeScannerModuleInstallState.CANCELED
            ) {
              window.clearTimeout(timeoutId);
              await this.googleScannerInstallHandle?.remove();
              this.googleScannerInstallHandle = undefined;
              resolve(false);
            }
          }
        );

        try {
          await BarcodeScanner.installGoogleBarcodeScannerModule();
        } catch (error) {
          console.error('QR scanner module install failed', error);
          window.clearTimeout(timeoutId);
          await this.googleScannerInstallHandle?.remove();
          this.googleScannerInstallHandle = undefined;
          resolve(false);
        }
      });

      if (!moduleInstalled) {
        await this.storage.showToast({
          message: "QR scanner is not available on this device right now",
          duration: 2500,
          color: 'medium',
          position: "top"
        });
      }

      return moduleInstalled;
    } catch (error) {
      console.error('Unable to verify QR scanner module', error);
      return false;
    }
  }

  async scanUrlQr(): Promise<void> {
    try {
      const platform = Capacitor.getPlatform();
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        this.storage.showToast({
          message: "QR scanning is not supported on this device",
          duration: 2000,
          color: 'medium',
          position: "top"
        });
        return;
      }

      const scannerReady = await this.ensureGoogleScannerModuleReady();
      if (!scannerReady) {
        return;
      }

      if (platform !== 'android') {
        const { camera } = await BarcodeScanner.requestPermissions();
        if (camera !== 'granted' && camera !== 'limited') {
          this.storage.showToast({
            message: "Camera permission is required to scan QR codes",
            duration: 2000,
            color: 'medium',
            position: "top"
          });
          return;
        }
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
        autoZoom: true
      });

      const scannedUrl = (barcodes[0]?.rawValue || barcodes[0]?.displayValue || '').trim();
      if (!scannedUrl) {
        this.storage.showToast({
          message: "No QR code was detected",
          duration: 2000,
          color: 'medium',
          position: "top"
        });
        return;
      }

      if (!this.isValidUrl(scannedUrl)) {
        this.storage.showToast({
          message: "Scanned QR does not contain a valid server URL",
          duration: 2000,
          color: 'medium',
          position: "top"
        });
        return;
      }

      this.url.set(scannedUrl);
      this.storage.showToast({
        message: "Server URL scanned successfully",
        duration: 2000,
        color: 'success',
        position: "top"
      });
    } catch (error) {
      console.error('QR scan failed', error);

      const errorMessage = String((error as any)?.message || error || '');
      if (
        errorMessage.includes('Google Barcode Scanner Module is not available') ||
        errorMessage.includes('not available')
      ) {
        const scannerReady = await this.ensureGoogleScannerModuleReady();
        if (scannerReady) {
          await this.scanUrlQr();
          return;
        }
      }

      this.storage.showToast({
        message: "Unable to scan QR code right now",
        duration: 2000,
        color: 'medium',
        position: "top"
      });
    }
  }

  async loginWithPin(): Promise<void> {
    if (this.pin().length !== 4) {
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_PIN"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    let credJson: LocalCredentials = await this.storage.getCredentials();
    console.log(credJson, "creddddd");
    if (this.pin() === credJson?.pin) {
      this.pin.set('');
      this.storage.showToast({
        message: this.storage.translate.instant("PIN_LOGIN_SUCCESS_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });

      this.odoo.baseUrl = credJson.url;
      this.odoo.username = credJson.login;
      this.odoo.password = credJson.password;
      this.odoo.db = credJson.db;
      this.odoo.is_internal_user = credJson.is_internal_user !== false;
      this.odoo.is_admin_user = credJson.is_admin_user === true;
      this.storage.selected_company = credJson.selected_company;

      await this.storage.hideLoading();
      if (!this.denied()) {
        this.odoo.uid = credJson.uid;
      }
      this.storage.isPinAuthenticated = true;

      this.attService.startSyncing();
      const targetPage = this.gotopage || (credJson.is_internal_user === false ? "/home" : (credJson.selected_company ? "/home" : "/company"));
      this.storage.exitPage = targetPage === '/company' ? '/company' : '/home';
      this.router.navigateByUrl(targetPage);
      this.modalCtrl?.dismiss();
    } else {
      this.pin.set('');
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_PIN"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
    }
  }

  contactUs() {
    this.router.navigateByUrl("/contact");
  }
}
