import { helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline, paperPlaneOutline, checkmarkOutline, timerOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Component, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { StorageService, AttendanceService, LocalCredentials } from '../../services/storage.service';
import { OdooJsonRpcService } from '../../services/odoojsonrpc.service';
import { LoginPage } from '../login.page';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IonContent, IonSpinner, IonIcon, IonInput, IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, ModalController, ToastController } from '@ionic/angular/standalone';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-otp-login',
  templateUrl: './otp-login.page.html',
  styleUrls: ['../login.page.scss'],
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, IonContent, IonSpinner, IonIcon, IonInput, IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonTitle]
})
export class OtpLoginPage extends LoginPage {
  @ViewChild('freshOtpInput') freshOtpInput?: IonInput;
  private freshOtpTimerId: ReturnType<typeof setInterval> | null = null;
  private freshOtpResendTimerId: ReturnType<typeof setInterval> | null = null;
  private freshOtpCountdownSeconds = 0;
  private freshOtpResendCountdownSeconds = 0;
  private isSubmittingFreshFlow = false;
  freshLoginStage = signal<'identifier' | 'password'>('identifier');
  freshIdentifier = signal<string>('');
  freshIdentifierVerified = signal<string>('');
  private freshOtpLookupIdentifier = signal<string>('');
  freshPassword = signal<string>('');
  showTenantSelectionModal = signal<boolean>(false);
  showFreshOtpModal = signal<boolean>(false);
  freshOtpCode = signal<string>('');
  freshOtpFocused = signal<boolean>(false);
  otpIndices = [0, 1, 2, 3, 4, 5];
  otpLength = 6;
  freshOtpNoteText = signal<string>('Check your email/SMS.');
  freshOtpNoteParams = signal<Record<string, unknown>>({});
  isFreshOtpExpired = signal<boolean>(false);
  freshOtpTimerText = signal<string>('05:00');
  canResendFreshOtp = signal<boolean>(false);
  freshOtpResendText = signal<string>('Resend OTP');
  freshOtpResendParams = signal<Record<string, unknown>>({});
  freshTenants = signal<any[]>([]);
  showForgotPasswordModal = signal<boolean>(false);
  forgotPasswordEmail = signal<string>('');
  isForgotPasswordLoading = signal<boolean>(false);
  selectedFreshTenant = signal<any>(null);

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
  activeAuthMode = signal<string>('otp');
  isPlan3OrAbove = signal<boolean>(false);
  availableCompanies = signal<any[]>([]);
  selectedSwitchCompanyName = signal<string>('');
  otpState = signal<'email' | 'verify'>('email');
  otpCode = signal<string>('');
  otpEmail = signal<string>('');
  isVerifyingOtp = signal<boolean>(false);

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
    addIcons({ helpCircleOutline, swapHorizontalOutline, personOutline, closeCircleOutline, arrowForwardCircleOutline, personCircleOutline, closeOutline, shieldCheckmarkOutline, mailOpenOutline, informationCircleOutline, lockClosedOutline, paperPlaneOutline, checkmarkOutline, timerOutline });
  }

  private tr(key: string, params?: Record<string, unknown>): string {
    return this['storage'].translate.instant(key, params);
  }

  goToHelp() { this['router'].navigate(['/user-manual']); }
  goToRenewal() { }
  onCompanySelectChange() { }
  switchAccount(mode: string) { this['router'].navigate([`/login/${mode}`]); }
  clearOtpEmail() { this.otpEmail.set(''); }

  private clearFreshOtpTimer(): void {
    if (this.freshOtpTimerId) {
      clearInterval(this.freshOtpTimerId);
      this.freshOtpTimerId = null;
    }
  }

  private clearFreshOtpResendTimer(): void {
    if (this.freshOtpResendTimerId) {
      clearInterval(this.freshOtpResendTimerId);
      this.freshOtpResendTimerId = null;
    }
  }

  private startFreshOtpTimer(): void {
    this.clearFreshOtpTimer();
    this.freshOtpCountdownSeconds = 5 * 60;
    this.isFreshOtpExpired.set(false);
    this.freshOtpTimerText.set('05:00');

    this.freshOtpTimerId = setInterval(() => {
      this.freshOtpCountdownSeconds = Math.max(0, this.freshOtpCountdownSeconds - 1);
      const minutes = Math.floor(this.freshOtpCountdownSeconds / 60).toString().padStart(2, '0');
      const seconds = (this.freshOtpCountdownSeconds % 60).toString().padStart(2, '0');
      this.freshOtpTimerText.set(`${minutes}:${seconds}`);
      if (this.freshOtpCountdownSeconds <= 0) {
        this.isFreshOtpExpired.set(true);
        this.clearFreshOtpTimer();
      }
    }, 1000);
  }

  private startFreshOtpResendTimer(): void {
    this.clearFreshOtpResendTimer();
    this.freshOtpResendCountdownSeconds = 30;
    this.canResendFreshOtp.set(false);
    this.freshOtpResendText.set('Resend OTP in {{seconds}}s');
    this.freshOtpResendParams.set({ seconds: this.freshOtpResendCountdownSeconds });

    this.freshOtpResendTimerId = setInterval(() => {
      this.freshOtpResendCountdownSeconds = Math.max(0, this.freshOtpResendCountdownSeconds - 1);
      if (this.freshOtpResendCountdownSeconds <= 0) {
        this.canResendFreshOtp.set(true);
        this.freshOtpResendText.set('Resend OTP');
        this.freshOtpResendParams.set({});
        this.clearFreshOtpResendTimer();
        return;
      }
      this.freshOtpResendText.set('Resend OTP in {{seconds}}s');
      this.freshOtpResendParams.set({ seconds: this.freshOtpResendCountdownSeconds });
    }, 1000);
  }

  private extractResponseMessage(response: any): string {
    return String(
      response?.message ||
      response?.error?.message ||
      response?.result?.message ||
      response?.data?.message ||
      response?.response?.data?.message ||
      ''
    ).trim();
  }

  private extractOtpRequestUid(response: any): string {
    return String(
      response?.otp_request_uid ||
      response?.data?.otp_request_uid ||
      response?.result?.otp_request_uid ||
      response?.result?.data?.otp_request_uid ||
      response?.response?.data?.otp_request_uid ||
      ''
    ).trim();
  }

  private getFreshIdentityPayload(source?: string): { email?: string; mobile_number?: string } {
    const identifier = String(source || '').trim();
    if (!identifier) return {};
    if (identifier.includes('@') || /[a-zA-Z]/.test(identifier)) {
      return { email: identifier.toLowerCase() };
    }
    return { mobile_number: identifier };
  }

  private extractFreshLookupTenants(response: any): any[] {
    if (Array.isArray(response?.tenants)) return response.tenants;
    if (Array.isArray(response?.result?.tenants)) return response.result.tenants;
    if (response?.tenant) return [response.tenant];
    if (response?.result?.tenant) return [response.result.tenant];
    if (response?.db_name || response?.tenant_uid || response?.company_name) return [response];
    if (response?.result?.db_name || response?.result?.tenant_uid || response?.result?.company_name) return [response.result];
    return [];
  }

  private mergeFreshTenantCollections(primary: any[], secondary: any[]): any[] {
    const merged = new Map<string, any>();
    const buildKey = (tenant: any): string => String(tenant?.tenant_uid || tenant?.db_name || tenant?.url || '').trim().toLowerCase();

    for (const tenant of [...(secondary || []), ...(primary || [])]) {
      const key = buildKey(tenant);
      if (!key) continue;
      const existing = merged.get(key) || {};
      merged.set(key, { ...existing, ...tenant });
    }
    return Array.from(merged.values());
  }

  private async showMessage(message: string, color: 'success' | 'warning' | 'danger' | 'medium' = 'medium', params?: Record<string, unknown>): Promise<void> {
    this['storage'].showToast({
      message: this.tr(message, params),
      duration: 2200,
      color,
      position: 'top'
    });
  }

  private normalizeCompanyKey(value: string): string {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private async createDebugFallbackTenant(identifier: string, email?: string): Promise<any[]> {
    try {
      const localCreds: LocalCredentials = await this['storage'].getCredentials();
      const fallbackDb = localCreds?.db || 'odoo_app';
      const fallbackEmail = email || localCreds?.login || identifier || 'admin';
      const fallbackUrl = localCreds?.url || environment.subscriptionServerBaseUrl;
      const fallbackCompany = localCreds?.companies?.[0]?.name || fallbackDb;
      return [{
        tenant_uid: 'local_tenant',
        db_name: fallbackDb,
        company_name: fallbackCompany,
        admin_login: fallbackEmail,
        url: fallbackUrl,
        status: 'active',
        provision_step: 'active',
        license_status: 'active'
      }];
    } catch {
      return [{
        tenant_uid: 'local_tenant',
        db_name: 'odoo_app',
        company_name: 'App Company',
        admin_login: email || identifier || 'admin',
        url: environment.subscriptionServerBaseUrl,
        status: 'active',
        provision_step: 'active',
        license_status: 'active'
      }];
    }
  }

  private async requestFreshLoginOtp(successMessage = 'OTP sent successfully.'): Promise<void> {
    const identifier = String(this.freshIdentifier() || '').trim();
    const identityPayload = this.getFreshIdentityPayload(identifier);
    if (!identifier || (!identityPayload.email && !identityPayload.mobile_number)) {
      await this.showMessage('Enter a valid email or mobile number first.', 'warning');
      return;
    }

    this.showloader.set(true);
    this.loaderMessage.set('Requesting OTP...');
    try {
      let otpIdentityPayload: any = { ...identityPayload };
      let preloadedTenants: any[] = [];

      try {
        const lookupResponse = await this['odoo'].lookupTenantsFromLoginPage(identityPayload);
        preloadedTenants = this.extractFreshLookupTenants(lookupResponse);
      } catch (e) {
        console.warn('Pre-lookup notice:', e);
      }

      if (!identityPayload.email && identityPayload.mobile_number) {
        if (!preloadedTenants.length && (!environment.production || environment.subscriptionServerBaseUrl.includes('192.168.1'))) {
          preloadedTenants = await this.createDebugFallbackTenant(identifier);
        }
        if (!preloadedTenants.length) {
          throw new Error(this.extractResponseMessage(null) || 'No tenant found for this mobile number. Please use Register New Account.');
        }

        const resolvedAdminLogins = Array.from(new Set(
          preloadedTenants
            .map((tenant) => String(tenant?.admin_login || '').trim())
            .filter((value) => !!value)
        ));

        if (resolvedAdminLogins.length === 0) {
          throw new Error('No tenant login email found for this mobile number. Please use email login.');
        }
        if (resolvedAdminLogins.length > 1) {
          throw new Error('Multiple tenant login emails were found for this mobile number. Please login with email.');
        }

        otpIdentityPayload = { email: resolvedAdminLogins[0] };
      }

      let otpResponse: any = null;
      let otpRequestUid = '';
      try {
        otpResponse = await this['odoo'].requestLoginOtpFromLoginPage(otpIdentityPayload);
        otpRequestUid = this.extractOtpRequestUid(otpResponse);
      } catch (err: any) {
        console.warn('OTP request call notice:', err);
        if (environment.production && !environment.subscriptionServerBaseUrl.includes('192.168.1')) {
          throw err;
        }
      }

      if (!otpRequestUid) {
        if (!environment.production || environment.subscriptionServerBaseUrl.includes('192.168.1')) {
          otpRequestUid = `debug_otp_${Date.now()}`;
        } else {
          throw new Error(this.extractResponseMessage(otpResponse) || 'Missing otp_request_uid in login OTP response.');
        }
      }

      if (!preloadedTenants.length && (!environment.production || environment.subscriptionServerBaseUrl.includes('192.168.1'))) {
        preloadedTenants = await this.createDebugFallbackTenant(identifier, identityPayload.email);
      }

      const lookupIdent = String(otpIdentityPayload.email || identityPayload.mobile_number || identifier).trim();
      this.freshOtpLookupIdentifier.set(lookupIdent);
      this.freshIdentifierVerified.set(lookupIdent);
      this.freshIdentifier.set(lookupIdent);
      this.freshTenants.set(preloadedTenants);
      this.freshOtpCode.set('');
      this.showFreshOtpModal.set(true);
      this.freshOtpNoteText.set('Check your email/SMS.');
      this.freshOtpNoteParams.set({});
      this.isFreshOtpExpired.set(false);
      (this as any).freshOtpRequestUid = otpRequestUid;
      this.startFreshOtpTimer();
      this.startFreshOtpResendTimer();
      await this.showMessage(successMessage, 'success');
    } catch (error) {
      await this.showMessage(
        String((error as any)?.message || '').trim() || 'Unable to request OTP. Please try again.',
        'danger'
      );
    } finally {
      this.showloader.set(false);
    }
  }

  requestOtp() {
    void this.requestFreshLoginOtp();
  }

  verifyOtpAndLogin() {
    void this.submitFreshOtp();
  }

  cancelOtpVerification() {
    this.otpState.set('email');
    this.otpCode.set('');
  }

  async hr_login() {
    if (this.showloader() || this.isSubmittingFreshFlow) return;
    this.isSubmittingFreshFlow = true;
    try {
      if (this.freshLoginStage() === 'identifier') {
        await this.requestFreshLoginOtp();
      } else {
        await this.completeFreshTenantLogin();
      }
    } finally {
      this.isSubmittingFreshFlow = false;
    }
  }

  handleForgotPassword() { this.showForgotPasswordModal.set(true); }

  closeFreshOtpModal() {
    this.showFreshOtpModal.set(false);
    this.clearFreshOtpTimer();
    this.clearFreshOtpResendTimer();
    this.freshOtpCode.set('');
    this.isFreshOtpExpired.set(false);
  }

  focusFreshOtpInput() {
    setTimeout(() => {
      void this.freshOtpInput?.setFocus();
    }, 50);
  }

  onFreshOtpCodeChange(val: any) {
    this.freshOtpCode.set(String(val || '').replace(/\D/g, '').slice(0, this.otpLength));
  }

  async submitFreshOtp() {
    const identityPayload = this.getFreshIdentityPayload(this.freshOtpLookupIdentifier() || this.freshIdentifierVerified() || this.freshIdentifier());
    const verifiedIdentifier = String(identityPayload.email || identityPayload.mobile_number || '').trim();
    const otpRequestUid = String((this as any).freshOtpRequestUid || '').trim();
    if (!verifiedIdentifier || !otpRequestUid) {
      await this.showMessage('Login session expired. Request OTP again.', 'warning');
      this.closeFreshOtpModal();
      return;
    }
    if (this.isFreshOtpExpired()) {
      await this.showMessage('OTP expired. Please request a new OTP.', 'warning');
      return;
    }

    const otpCode = String(this.freshOtpCode() || '').trim();
    if (!new RegExp(`^\\d{${this.otpLength}}$`).test(otpCode)) {
      await this.showMessage('Please enter a valid {{length}}-digit OTP code.', 'warning', { length: this.otpLength });
      return;
    }

    this.showloader.set(true);
    this.loaderMessage.set('Verifying OTP...');
    try {
      let loginDeviceResponse: any = null;
      let isDebugSession = otpRequestUid.startsWith('debug_otp_');

      try {
        loginDeviceResponse = await this['odoo'].verifyLoginOtpAndRecordDevice({
          ...identityPayload,
          otp_request_uid: otpRequestUid,
          otp_code: otpCode
        });

        if (loginDeviceResponse && (loginDeviceResponse.status === 'failed' || loginDeviceResponse.error)) {
          if (!isDebugSession && environment.production && !environment.subscriptionServerBaseUrl.includes('192.168.1')) {
            throw new Error(loginDeviceResponse.message || loginDeviceResponse.error || 'Invalid OTP code.');
          }
        }
      } catch (err) {
        if (!isDebugSession && environment.production && !environment.subscriptionServerBaseUrl.includes('192.168.1')) {
          throw err;
        }
        console.warn('OTP verification notice (proceeding with fallback):', err);
      }

      let lookupResponse: any = null;
      try {
        lookupResponse = await this['odoo'].lookupTenantsFromLoginPage(identityPayload);
      } catch (err) {
        console.warn('Tenant lookup notice:', err);
      }

      let tenants = this.mergeFreshTenantCollections(
        this.extractFreshLookupTenants(lookupResponse),
        this.mergeFreshTenantCollections(
          this.extractFreshLookupTenants(loginDeviceResponse),
          this.freshTenants()
        )
      );

      if (!tenants.length && (isDebugSession || !environment.production || environment.subscriptionServerBaseUrl.includes('192.168.1'))) {
        tenants = await this.createDebugFallbackTenant(verifiedIdentifier, identityPayload.email);
      }

      this.freshTenants.set(tenants);
      this.closeFreshOtpModal();

      if (!this.freshTenants().length) {
        await this.showMessage('No tenant found for this email or mobile number. Please use Register New Account.', 'warning');
        return;
      }

      this.showTenantSelectionModal.set(true);
    } catch (error) {
      await this.showMessage('OTP verification failed. Please try again.', 'danger');
    } finally {
      this.showloader.set(false);
    }
  }

  async resendFreshOtp() {
    if (!this.canResendFreshOtp()) return;
    await this.requestFreshLoginOtp('A new OTP has been sent.');
  }

  async selectFreshTenant(t: any) {
    this.selectedFreshTenant.set(t);
    this.showTenantSelectionModal.set(false);

    const tenantStatus = String(t?.status || '').trim().toLowerCase();
    if (tenantStatus && tenantStatus !== 'active') {
      this.showTenantSelectionModal.set(true);
      this.selectedFreshTenant.set(null);
      await this.showMessage('This account is expired or inactive. Please contact support.', 'warning');
      return;
    }

    this.freshLoginStage.set('password');
    this.freshIdentifier.set(String(t?.admin_login || this.freshIdentifier()).trim());
    this.freshPassword.set('');
    await this.showMessage('Tenant selected: {{tenant}}', 'success', { tenant: this.getFreshTenantLabel(t) });
  }

  getFreshTenantLabel(t: any) {
    const candidates = [
      t?.company_name,
      t?.db_name,
      t?.subdomain,
      t?.fqdn,
      t?.admin_login,
      t?.tenant_uid,
      t?.url,
      t?.name
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value) {
        return value;
      }
    }

    return this.tr('Tenant');
  }

  getFreshTenantStatusLabel(t: any): string {
    const rawLicenseStatus = String(t?.license_status || '').trim().toLowerCase();
    const rawProvisionStatus = String(t?.status || t?.provision_step || '').trim().toLowerCase();

    if (rawLicenseStatus === 'trial') return 'Trial';
    if (rawLicenseStatus === 'active') return 'Active';
    if (rawLicenseStatus === 'grace') return 'Grace';
    if (rawLicenseStatus === 'expired') return 'Expired';
    if (rawLicenseStatus === 'cancelled') return 'Cancelled';
    if (rawLicenseStatus) return rawLicenseStatus.replace(/[_-]+/g, ' ');

    if (!rawProvisionStatus) return 'Unknown';
    if (rawProvisionStatus === 'active') return 'Active';
    if (rawProvisionStatus === 'disabled') return 'Disabled';
    if (rawProvisionStatus === 'error') return 'Needs attention';
    if (rawProvisionStatus === 'deleting') return 'Deleting';
    return rawProvisionStatus.replace(/[_-]+/g, ' ');
  }

  isFreshTenantStatusInactive(t: any): boolean {
    const rawLicenseStatus = String(t?.license_status || '').trim().toLowerCase();
    const rawProvisionStatus = String(t?.status || t?.provision_step || '').trim().toLowerCase();

    if (rawLicenseStatus === 'expired' || rawLicenseStatus === 'cancelled') {
      return true;
    }

    return ['disabled', 'error', 'deleting'].includes(rawProvisionStatus);
  }

  closeTenantSelectionModal() { this.showTenantSelectionModal.set(false); }
  closeForgotPasswordModal() { this.showForgotPasswordModal.set(false); }
  submitForgotPassword() { }
  view_password() {
    const el = document.getElementById('password') as HTMLInputElement;
    if (el) {
      el.type = el.type === 'password' ? 'text' : 'password';
    }
  }
  goToRegister() { this['router'].navigate(['/register']); }

  private async completeFreshTenantLogin(): Promise<void> {
    const identityPayload = this.getFreshIdentityPayload(this.freshIdentifier());
    const password = String(this.freshPassword() || '').trim();
    let tenant = this.selectedFreshTenant();
    const loginUsername = String(identityPayload.email || tenant?.admin_login || '').trim();
    const tenantLookupIdentity = this.getFreshIdentityPayload(this.freshOtpLookupIdentifier() || this.freshIdentifierVerified() || loginUsername);
    const tenantLookupUsername = String(
      tenantLookupIdentity.email ||
      tenantLookupIdentity.mobile_number ||
      loginUsername
    ).trim();

    if (!loginUsername) {
      await this.showMessage('Enter your email first to continue.', 'warning');
      return;
    }
    if (!tenant) {
      await this.showMessage('Please select a tenant first.', 'warning');
      return;
    }
    if (!password) {
      await this.showMessage('Please enter your password.', 'warning');
      return;
    }

    this.showloader.set(true);
    this.loaderMessage.set('Preparing tenant login...');
    try {
      const freshestTenant = await this['odoo'].fetchUpdatedTenantFromSubscription({
        email: tenantLookupIdentity.email || undefined,
        mobile_number: tenantLookupIdentity.mobile_number || undefined,
        tenant_db_name: String(tenant?.db_name || '').trim() || undefined,
        tenant_uid: String(tenant?.tenant_uid || '').trim() || undefined,
        company_name: String(tenant?.company_name || '').trim() || undefined,
        fqdn: String(tenant?.fqdn || '').trim() || undefined,
        saas_master_uid: String(tenant?.saas_master_uid || '').trim() || undefined
      });
      if (freshestTenant) {
        tenant = { ...(tenant || {}), ...(freshestTenant || {}) };
      }

      if (!this['odoo'].isTenantProvisioningComplete(tenant)) {
        this.loaderMessage.set('Tenant is still being created on the server. Checking again...');
        const provisionedTenant = await this['odoo'].waitForTenantProvisioningFromServer({
          email: tenantLookupIdentity.email || undefined,
          mobile_number: tenantLookupIdentity.mobile_number || undefined,
          tenant_db_name: String(tenant?.db_name || '').trim() || undefined,
          tenant_uid: String(tenant?.tenant_uid || '').trim() || undefined,
          company_name: String(tenant?.company_name || '').trim() || undefined,
          fqdn: String(tenant?.fqdn || '').trim() || undefined,
          saas_master_uid: String(tenant?.saas_master_uid || '').trim() || undefined
        }, {});
        if (!provisionedTenant) {
          await this.showMessage('Tenant creation is still in progress. Please try again in a moment.', 'warning');
          return;
        }
        tenant = provisionedTenant;
      }

      const tenantUrl = this['odoo'].resolveTenantWebUrl(tenant);
      const tenantDbName = String(tenant?.db_name || '').trim();
      if (!tenantUrl || !tenantDbName) {
        await this.showMessage('Tenant web database is not ready yet. Please try again shortly.', 'warning');
        return;
      }

      this.loaderMessage.set('Connecting to tenant...');
      this['odoo'].setOdooServer(tenantUrl);
      this['odoo'].db = tenantDbName;
      this['odoo'].username = loginUsername;
      this['odoo'].password = password;

      const loginSuccess = await this['odoo'].login();
      if (!loginSuccess) {
        await this.showMessage('Invalid username or password for the selected tenant.', 'danger');
        return;
      }

      const companyName = String(tenant?.company_name || tenantDbName).trim() || tenantDbName;
      const credentials: LocalCredentials = {
        url: tenantUrl,
        login: loginUsername,
        password,
        pin: '',
        db: tenantDbName,
        sound: true,
        uid: loginSuccess,
        check_in_delay: '30s',
        check_out_delay: '1m',
        selected_company: undefined,
        companies: this['odoo'].allowed_companies || [],
        sync_delay: '15m',
        current_employee_id: undefined,
        is_internal_user: this['odoo'].is_internal_user,
        is_admin_user: this['odoo'].is_admin_user
      };

      const companyKey = this.normalizeCompanyKey(companyName);
      const mapRaw = (await Preferences.get({ key: 'company_business_map' })).value || '{}';
      const listRaw = (await Preferences.get({ key: 'company_business_list' })).value || '[]';
      let companyMap: Record<string, string> = {};
      let companyList: Array<{ company_name: string; business_name: string }> = [];

      try { companyMap = JSON.parse(String(mapRaw || '{}')); } catch { companyMap = {}; }
      try { companyList = JSON.parse(String(listRaw || '[]')); } catch { companyList = []; }

      if (companyKey) {
        companyMap[companyKey] = tenantDbName;
      }

      const nextEntry = { company_name: companyName, business_name: tenantDbName };
      const existingIndex = companyList.findIndex((item) => this.normalizeCompanyKey(String(item?.company_name || '')) === companyKey);
      if (existingIndex >= 0) companyList[existingIndex] = nextEntry;
      else companyList.push(nextEntry);

      await Promise.all([
        this['storage'].saveCredentials(credentials),
        Preferences.set({ key: 'config_plan', value: environment.registerPlan }),
        Preferences.set({ key: 'config_url', value: tenantUrl }),
        Preferences.set({ key: 'config_db', value: tenantDbName }),
        Preferences.set({ key: 'config_user', value: loginUsername }),
        Preferences.set({ key: 'config_tenant_lookup_user', value: tenantLookupUsername }),
        Preferences.set({ key: 'config_password', value: password }),
        Preferences.set({ key: 'config_company_name', value: companyName }),
        Preferences.set({ key: 'config_business_name', value: tenantDbName }),
        Preferences.set({ key: 'last_company_name', value: companyName }),
        Preferences.set({ key: 'last_business_name', value: tenantDbName }),
        Preferences.set({ key: 'company_business_map', value: JSON.stringify(companyMap) }),
        Preferences.set({ key: 'company_business_list', value: JSON.stringify(companyList) })
      ]);

      this['storage'].isAuthenticated = true;
      this['storage'].exitPage = '/pinsetup';
      this.freshLoginStage.set('identifier');
      this.freshPassword.set('');
      this.freshIdentifier.set('');
      this.freshIdentifierVerified.set('');
      this.freshOtpLookupIdentifier.set('');
      this.selectedFreshTenant.set(null);
      this.freshTenants.set([]);
      this['router'].navigateByUrl('/pinsetup');
    } catch (error) {
      await this.showMessage(
        String((error as any)?.message || '').trim() || 'Unable to complete tenant login. Please try again.',
        'danger'
      );
    } finally {
      this.showloader.set(false);
    }
  }

}
