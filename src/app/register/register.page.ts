import { arrowBackOutline, personOutline, closeCircleOutline, storefrontOutline, callOutline, mailOutline, arrowForwardOutline, checkmarkOutline, lockOpenOutline, lockClosedOutline, timeOutline, timerOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Component, OnInit, OnDestroy, ViewChild, signal, computed } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';

import { StorageService } from '../services/storage.service';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';

import { RouterLink } from '@angular/router';

import { TranslateModule } from '@ngx-translate/core';
import { IonContent, IonButton, IonIcon, IonInput, IonText, IonSelect, IonSelectOption, IonModal, NavController, ToastController } from '@ionic/angular/standalone';

type RegisterTenant = {
  tenant_uid?: string | null;
  company_name?: string | null;
  db_name?: string | null;
  subdomain?: string | null;
  fqdn?: string | null;
  url?: string | null;
  provision_step?: string | null;
  saas_master_uid?: string | null;
  status?: string | null;
  admin_login?: string | null;
};

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [RouterLink, FormsModule, ReactiveFormsModule, TranslateModule, IonContent, IonButton, IonIcon, IonInput, IonText, IonSelect, IonSelectOption, IonModal]
})
export class RegisterPage implements OnInit, OnDestroy {
  @ViewChild('otpInput') otpInput?: IonInput;
  private readonly OTP_MODAL_DURATION_SECONDS = 10 * 60;
  private readonly OTP_RESEND_RETRY_DURATION_SECONDS = 30;
  private readonly TENANT_PROVISION_INTERVAL_MS = 5 * 1000;
  private readonly TENANT_PROVISION_TIMEOUT_MS = 2 * 60 * 1000;
  private readonly TENANT_LIVE_CONNECTION_INTERVAL_MS = 10 * 1000;
  private readonly TENANT_LIVE_CONNECTION_TIMEOUT_MS = 5 * 60 * 1000;
  readonly otpLength = 6;
  readonly otpIndices = Array.from({ length: this.otpLength }, (_, index) => index);

  registerForm: FormGroup;
  existingBusinessList: Array<{ company_name: string; business_name: string }> = [];

  isExistingDatabase = signal<boolean>(false);
  existingCompanies = signal<any[]>([]);
  showPassword = signal<boolean>(false);
  showOtpModal = signal<boolean>(false);
  otpCode = signal<string>('');
  otpFocused = signal<boolean>(false);
  otpCountdownSeconds = signal<number>(0);
  otpResendCountdownSeconds = signal<number>(0);
  pendingOtpRequestUid = signal<string>('');
  pendingRegisterContext: {
    name: string;
    businessName: string;
    companyName: string;
    mobileNumber: string;
    email: string;
    password: string;
  } | null = null;
  private otpTimerId: ReturnType<typeof setInterval> | null = null;
  private otpResendTimerId: ReturnType<typeof setInterval> | null = null;
  registerAttempted = signal<boolean>(false);

  isOtpExpired = computed(() => this.showOtpModal() && this.otpCountdownSeconds() <= 0);
  canResendOtp = computed(() => this.showOtpModal() && this.otpResendCountdownSeconds() <= 0);

  otpTimerLabel = computed(() => {
    const totalSeconds = Math.max(0, Number(this.otpCountdownSeconds() || 0));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  });

  otpTimerText = computed(() => {
    return this.isOtpExpired()
      ? this.t('Expired')
      : `${this.t('Expires in ')}${this.otpTimerLabel()}`;
  });

  otpResendTimerLabel = computed(() => {
    const totalSeconds = Math.max(0, Number(this.otpResendCountdownSeconds() || 0));
    return totalSeconds.toString().padStart(2, '0');
  });

  otpResendText = computed(() => {
    return this.canResendOtp()
      ? this.t('Resend OTP')
      : `${this.t('Resend OTP in 00:')}${this.otpResendTimerLabel()}`;
  });

  private extractTenantsFromResponse(response: any): RegisterTenant[] {
    const directTenants = Array.isArray(response?.tenants) ? response.tenants : [];
    const nestedTenants = Array.isArray(response?.result?.tenants) ? response.result.tenants : [];
    const singleTenant = response?.tenant || response?.result?.tenant;
    const topLevelTenant =
      response?.db_name || response?.url || response?.company_name || response?.tenant_uid
        ? response
        : null;
    const nestedTopLevelTenant =
      response?.result?.db_name || response?.result?.url || response?.result?.company_name || response?.result?.tenant_uid
        ? response.result
        : null;
    if (directTenants.length > 0) return directTenants;
    if (nestedTenants.length > 0) return nestedTenants;
    if (singleTenant) return [singleTenant];
    if (topLevelTenant) return [topLevelTenant];
    return nestedTopLevelTenant ? [nestedTopLevelTenant] : [];
  }

  constructor(
    private fb: FormBuilder,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private storage: StorageService, private odoo: OdooJsonRpcService,
  ) {
    addIcons({ arrowBackOutline, personOutline, closeCircleOutline, storefrontOutline, callOutline, mailOutline, arrowForwardOutline, checkmarkOutline, lockOpenOutline, lockClosedOutline, timeOutline, timerOutline });

    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      business_name: ['', [Validators.required]],
      company_name: ['', [Validators.required]],
      mobile_number: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(1)]]
    });

    this.registerForm.controls['company_name'].valueChanges.subscribe((value) => {
      this.syncDerivedBusinessName(String(value || ''));
    });
  }

  t(key: string): string {
    return this.storage.translate.instant(key);
  }

  ionViewWillEnter() {
    void this.fetchDatabaseMetadata();
  }

  private formatDatabaseName(name: string): string {
    if (!name) return '';
    const trimmed = name.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  async fetchDatabaseMetadata() {
    try {
      const dbIdentity: any = null;

      if (dbIdentity && dbIdentity.business_name) {
        this.isExistingDatabase.set(true);

        const dbName = this.formatDatabaseName(dbIdentity.business_name);
        this.registerForm.patchValue({
          business_name: dbName
        });

        const listRaw = (await Preferences.get({ key: 'company_business_list' })).value || '[]';
        this.existingCompanies.set(JSON.parse(String(listRaw || '[]')));
        return;
      }

      this.isExistingDatabase.set(false);
      this.syncDerivedBusinessName();
    } catch (e) {
      console.error('Failed to fetch database metadata:', e);
      this.isExistingDatabase.set(false);
      this.syncDerivedBusinessName();
    }
  }

  private formatInitialCapital(str: string): string {
    if (!str) return '';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  async checkExistingBusinessData() {
    try {
      const listRaw = (await Preferences.get({ key: 'company_business_list' })).value || '[]';
      this.existingBusinessList = JSON.parse(String(listRaw || '[]'));

      if (this.existingBusinessList.length > 0) {
        this.isExistingDatabase.set(true);

        const firstEntry = this.existingBusinessList[0];
        this.registerForm.patchValue({
          business_name: this.formatInitialCapital(firstEntry.business_name)
        });
      }
    } catch (e) {
      console.warn('Metadata fetch failed:', e);
      this.isExistingDatabase.set(false);
    }
  }

  onCompanyChange(event: any) {
  }

  ngOnInit() {
    this.syncDerivedBusinessName();
  }

  ngOnDestroy(): void {
    this.clearOtpTimer();
    this.clearOtpResendTimer();
  }

  private syncDerivedBusinessName(companyName?: string): void {
    if (this.isExistingDatabase()) return;
    const derivedBusinessName = this.formatInitialCapital(
      String(companyName ?? this.registerForm.controls['company_name'].value ?? '')
    );
    this.registerForm.controls['business_name'].setValue(derivedBusinessName, { emitEvent: false });
  }

  private extractResponseStatus(response: any): string {
    return String(
      response?.status ??
      response?.result?.status ??
      response?.state ??
      response?.result?.state ??
      ''
    ).trim().toLowerCase();
  }

  private extractResponseMessage(response: any): string {
    const candidates = [
      response?.message,
      response?.detail,
      response?.error?.message,
      response?.error,
      response?.result?.message,
      response?.result?.detail,
      response?.result?.error?.message,
      response?.result?.error
    ];
    const match = candidates.find((value) => typeof value === 'string' && String(value).trim());
    return String(match || '').trim();
  }

  private unwrapResponsePayload(source: any): any {
    const candidates = [
      source?.response?.data,
      source?.data,
      source?.error?.data,
      source?.error,
      source
    ];
    return candidates.find((value) => value !== null && value !== undefined) ?? source;
  }

  private extractFailureMessage(source: any): string {
    const payload = this.unwrapResponsePayload(source);
    const responseMessage = this.extractResponseMessage(payload);
    if (responseMessage) return responseMessage;

    const transportMessage = String(
      this.odoo.extractOdooErrorMessage(source) ||
      source?.message ||
      ''
    ).trim();
    return transportMessage;
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

  private normalizeCompanyKey(value: string): string {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private resolveTenantWebUrl(tenant: Partial<RegisterTenant> | null | undefined): string {
    return this.odoo.resolveTenantWebUrl(tenant || {});
  }

  private isTenantProvisioningReady(tenant: Partial<RegisterTenant> | null | undefined): boolean {
    return this.odoo.isTenantProvisioningComplete(tenant || {});
  }

  private isTenantProvisioningFailed(tenant: Partial<RegisterTenant> | null | undefined): boolean {
    return this.odoo.isTenantProvisioningFailed(tenant || {});
  }

  private isTenantHostResolutionError(error: unknown): boolean {
    const message = String(
      (error as any)?.message ||
      (error as any)?.toString?.() ||
      ''
    ).toLowerCase();
    return message.includes('unable to resolve host')
      || message.includes('no address associated with hostname')
      || message.includes('err_name_not_resolved')
      || message.includes('net::err_name_not_resolved')
      || message.includes('enotfound');
  }

  private mergeRegisteredTenant(primary: Partial<RegisterTenant>, secondary: Partial<RegisterTenant> | null | undefined): RegisterTenant {
    const merged: RegisterTenant = {
      ...(primary || {}),
      ...(secondary || {})
    };
    const resolvedUrl = this.resolveTenantWebUrl(merged);
    if (resolvedUrl) {
      merged.url = resolvedUrl;
    }
    return merged;
  }

  private async refreshRegisteredTenant(
    tenant: RegisterTenant,
    context: { email: string; mobileNumber: string; companyName: string; }
  ): Promise<RegisterTenant> {
    try {
      const refreshed = await this.odoo.fetchUpdatedTenantFromSubscription({
        email: String(context.email || '').trim() || undefined,
        mobile_number: String(context.mobileNumber || '').trim() || undefined,
        tenant_db_name: String(tenant?.db_name || '').trim() || undefined,
        tenant_uid: String(tenant?.tenant_uid || '').trim() || undefined,
        company_name: String(tenant?.company_name || context.companyName || '').trim() || undefined,
        fqdn: String(tenant?.fqdn || '').trim() || undefined,
        saas_master_uid: String(tenant?.saas_master_uid || tenant?.tenant_uid || '').trim() || undefined
      });
      return this.mergeRegisteredTenant(tenant, refreshed || {});
    } catch (error) {
      console.info('Registered tenant refresh skipped while waiting for live setup.', error);
      return this.mergeRegisteredTenant(tenant, {});
    }
  }

  private async waitForRegisteredTenantLiveConnection(
    tenant: RegisterTenant,
    context: { email: string; mobileNumber: string; companyName: string; }
  ): Promise<RegisterTenant | null> {
    const deadline = Date.now() + this.TENANT_LIVE_CONNECTION_TIMEOUT_MS;
    let currentTenant = this.mergeRegisteredTenant(tenant, {});
    let pollCount = 0;

    while (Date.now() <= deadline) {
      pollCount += 1;
      currentTenant = await this.refreshRegisteredTenant(currentTenant, context);
      const resolvedUrl = this.resolveTenantWebUrl(currentTenant);
      if (!resolvedUrl) {
        if (Date.now() + this.TENANT_LIVE_CONNECTION_INTERVAL_MS > deadline) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, this.TENANT_LIVE_CONNECTION_INTERVAL_MS));
        continue;
      }

      try {
        const response = await this.odoo.pingOdooServer(`${resolvedUrl}`);
        if (response) {
          return this.mergeRegisteredTenant(currentTenant, {
            status: 'active',
            provision_step: 'active'
          });
        }
      } catch (error) {
        if (this.isTenantHostResolutionError(error)) {
          console.info('Registered tenant hostname is not reachable yet:', {
            pollCount,
            url: resolvedUrl,
            db_name: currentTenant?.db_name || null
          });
        } else {
          console.warn('Registered tenant live connection poll failed:', {
            pollCount,
            url: resolvedUrl,
            db_name: currentTenant?.db_name || null,
            error
          });
        }
      }

      if (Date.now() + this.TENANT_LIVE_CONNECTION_INTERVAL_MS > deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, this.TENANT_LIVE_CONNECTION_INTERVAL_MS));
    }

    return null;
  }

  private async waitForRegisteredTenantReady(
    tenants: RegisterTenant[],
    context: {
      email: string;
      mobileNumber: string;
      businessName: string;
      companyName: string;
    }
  ): Promise<RegisterTenant[] | null> {
    const preferredTenant = this.getPreferredRegisteredTenant(tenants, context);
    if (!preferredTenant) {
      return null;
    }

    const provisionedTenant = await this.odoo.waitForTenantProvisioningFromServer({
      email: String(context.email || '').trim() || undefined,
      mobile_number: String(context.mobileNumber || '').trim() || undefined,
      tenant_db_name: String(preferredTenant?.db_name || context.businessName || '').trim() || undefined,
      tenant_uid: String(preferredTenant?.tenant_uid || '').trim() || undefined,
      company_name: String(preferredTenant?.company_name || context.companyName || '').trim() || undefined,
      fqdn: String(preferredTenant?.fqdn || '').trim() || undefined,
      saas_master_uid: String(preferredTenant?.saas_master_uid || preferredTenant?.tenant_uid || '').trim() || undefined
    }, {
      timeoutMs: this.TENANT_PROVISION_TIMEOUT_MS,
      intervalMs: this.TENANT_PROVISION_INTERVAL_MS
    });

    let resolvedTenant = this.mergeRegisteredTenant(preferredTenant, provisionedTenant || {});
    if (this.isTenantProvisioningFailed(resolvedTenant)) {
      return null;
    }

    if (!this.isTenantProvisioningReady(resolvedTenant)) {
      return null;
    }

    const liveTenant = await this.waitForRegisteredTenantLiveConnection(resolvedTenant, context);
    if (!liveTenant) {
      return null;
    }

    resolvedTenant = this.mergeRegisteredTenant(resolvedTenant, liveTenant);
    const preferredKey = String(preferredTenant?.tenant_uid || preferredTenant?.db_name || '').trim().toLowerCase();
    const nextTenants = [...(tenants || [])];
    const existingIndex = nextTenants.findIndex((tenant) =>
      String(tenant?.tenant_uid || tenant?.db_name || '').trim().toLowerCase() === preferredKey
    );

    if (existingIndex >= 0) {
      nextTenants[existingIndex] = resolvedTenant;
    } else {
      nextTenants.unshift(resolvedTenant);
    }

    return nextTenants;
  }

  private startRegisteredTenantReadinessWatcher(
    tenants: RegisterTenant[],
    context: {
      name: string;
      businessName: string;
      companyName: string;
      mobileNumber: string;
      email: string;
      password: string;
    }
  ): void {
    void (async () => {
      try {
        const readyTenants = await this.waitForRegisteredTenantReady(tenants, {
          email: context.email,
          mobileNumber: context.mobileNumber,
          businessName: context.businessName,
          companyName: context.companyName
        });
        if (!readyTenants) {
          console.info('Registered tenant is still provisioning in the background. Local setup will continue for now.');
          return;
        }

        await this.persistRegisteredTenants(readyTenants, context);
        console.info('Registered tenant endpoint refreshed after background readiness check.');
      } catch (error) {
        console.warn('Background registered-tenant readiness watcher failed.', error);
      }
    })();
  }

  private getPreferredRegisteredTenant(
    tenants: RegisterTenant[],
    context: { companyName: string; businessName: string }
  ): RegisterTenant | null {
    if (!Array.isArray(tenants) || tenants.length === 0) return null;

    const normalizedCompany = this.normalizeCompanyKey(context.companyName);
    const normalizedBusiness = String(context.businessName || '').trim().toLowerCase();
    const activeTenants = tenants.filter(
      (tenant) => String(tenant?.status || '').trim().toLowerCase() === 'active'
    );
    const candidates = activeTenants.length > 0 ? activeTenants : tenants;

    const companyMatch = candidates.find(
      (tenant) => this.normalizeCompanyKey(String(tenant?.company_name || '')) === normalizedCompany
    );
    if (companyMatch) return companyMatch;

    const dbMatch = candidates.find(
      (tenant) => String(tenant?.db_name || '').trim().toLowerCase() === normalizedBusiness
    );
    if (dbMatch) return dbMatch;

    const completeMatch = candidates.find(
      (tenant) => !!String(tenant?.db_name || '').trim() && !!String(tenant?.url || '').trim()
    );
    return completeMatch || candidates[0] || null;
  }

  private async persistRegisteredTenants(
    tenants: RegisterTenant[],
    context: {
      name: string;
      businessName: string;
      companyName: string;
      mobileNumber: string;
      email: string;
      password: string;
    }
  ): Promise<typeof context> {
    const preferredTenant = this.getPreferredRegisteredTenant(tenants, context);
    const usableTenants = (tenants || []).filter(
      (tenant) => !!String(tenant?.db_name || '').trim()
    );

    if (usableTenants.length > 0) {
      const mapRaw = (await Preferences.get({ key: 'company_business_map' })).value || '{}';
      let companyMap: Record<string, string> = {};
      try { companyMap = JSON.parse(String(mapRaw || '{}')); } catch { companyMap = {}; }

      const listRaw = (await Preferences.get({ key: 'company_business_list' })).value || '[]';
      let companyList: Array<{ company_name: string; business_name: string }> = [];
      try {
        const parsed = JSON.parse(String(listRaw || '[]'));
        if (Array.isArray(parsed)) companyList = parsed;
      } catch {
        companyList = [];
      }

      for (const tenant of usableTenants) {
        const tenantDbName = String(tenant?.db_name || '').trim();
        const tenantCompanyName = String(tenant?.company_name || tenantDbName).trim() || tenantDbName;
        const companyKey = this.normalizeCompanyKey(tenantCompanyName);
        if (!companyKey || !tenantDbName) continue;

        companyMap[companyKey] = tenantDbName;
        const nextEntry = { company_name: tenantCompanyName, business_name: tenantDbName };
        const existingIndex = companyList.findIndex(
          (item) => this.normalizeCompanyKey(String(item?.company_name || '')) === companyKey
        );
        if (existingIndex >= 0) companyList[existingIndex] = nextEntry;
        else companyList.push(nextEntry);
      }

      await Promise.all([
        Preferences.set({ key: 'company_business_map', value: JSON.stringify(companyMap) }),
        Preferences.set({ key: 'company_business_list', value: JSON.stringify(companyList) })
      ]);
    }

    if (!preferredTenant) {
      return context;
    }

    const tenantUrl = this.odoo.resolveTenantWebUrl(preferredTenant || {});
    const tenantDbName = String(preferredTenant.db_name || '').trim();
    const tenantCompanyName = String(preferredTenant.company_name || tenantDbName).trim() || tenantDbName;

    await Promise.all([
      Preferences.set({ key: 'config_plan', value: environment.registerPlan }),
      Preferences.set({ key: 'config_url', value: tenantUrl }),
      Preferences.set({ key: 'config_db', value: tenantDbName }),
      Preferences.set({ key: 'config_user', value: String(context.email || '').trim() }),
      Preferences.set({ key: 'config_password', value: String(context.password || '') }),
      Preferences.set({ key: 'config_company_name', value: tenantCompanyName }),
      Preferences.set({ key: 'config_business_name', value: tenantDbName }),
      Preferences.set({ key: 'last_company_name', value: tenantCompanyName }),
      Preferences.set({ key: 'last_business_name', value: tenantDbName })
    ]);

    this.odoo.setOdooServer(tenantUrl);
    this.odoo.db = tenantDbName;

    return {
      ...context,
      companyName: tenantCompanyName,
      businessName: tenantDbName
    };
  }

  private isOtpVerificationRejected(response: any): boolean {
    const status = this.extractResponseStatus(response);
    const message = this.extractResponseMessage(response).toLowerCase();
    const hasFalseFlag = [
      response?.success,
      response?.result?.success,
      response?.verified,
      response?.result?.verified,
      response?.otp_verified,
      response?.result?.otp_verified
    ].some((value) => value === false);

    if (hasFalseFlag) return true;
    if (['error', 'failed', 'invalid', 'invalid_otp', 'otp_invalid', 'otp_failed', 'rejected', 'expired', 'otp_expired'].includes(status)) {
      return true;
    }
    return /otp/.test(message) && /(invalid|incorrect|wrong|expired|mismatch|failed|reject)/.test(message);
  }

  private isRegisterSubmissionSuccessful(response: any): boolean {
    if (this.isOtpVerificationRejected(response)) return false;

    const status = this.extractResponseStatus(response);
    const message = this.extractResponseMessage(response).toLowerCase();
    const hasTrueFlag = [
      response?.success,
      response?.result?.success,
      response?.verified,
      response?.result?.verified,
      response?.otp_verified,
      response?.result?.otp_verified
    ].some((value) => value === true);

    if (hasTrueFlag) return true;
    if (['success', 'created', 'registered', 'ok', 'completed', 'complete', 'accepted', 'tenant_created'].includes(status)) return true;
    if (/(tenant|account|registration)/.test(message) && /(created|registered|successful|completed|ready)/.test(message)) return true;

    const tenants = this.extractTenantsFromResponse(response);
    if (tenants.length > 0) return true;

    return !!String(
      response?.tenant_uid ||
      response?.result?.tenant_uid ||
      response?.db_name ||
      response?.result?.db_name ||
      response?.url ||
      response?.result?.url ||
      ''
    ).trim();
  }

  private async resolveRegisteredTenants(
    response: any,
    context: { email: string; mobileNumber: string }
  ): Promise<RegisterTenant[]> {
    const responseTenants = this.extractTenantsFromResponse(response);
    const hasUsableTenant = responseTenants.some(
      (tenant) => !!String(tenant?.db_name || '').trim() || !!String(tenant?.url || '').trim()
    );

    if (responseTenants.length > 0 && hasUsableTenant) {
      return responseTenants;
    }

    try {
      const responseTenantUid = String(
        response?.tenant_uid ||
        response?.result?.tenant_uid ||
        ''
      ).trim();
      const responseSaasMasterUid = String(
        response?.saas_master_uid ||
        response?.result?.saas_master_uid ||
        responseTenantUid ||
        ''
      ).trim();

      const lookupResponse = await this.odoo.lookupTenantsFromLoginPage({
        email: context.email,
        mobile_number: context.mobileNumber,
        tenant_uid: responseTenantUid || undefined,
        saas_master_uid: responseSaasMasterUid || undefined
      });
      const lookupTenants = this.extractTenantsFromResponse(lookupResponse);
      return lookupTenants.length > 0 ? lookupTenants : responseTenants;
    } catch (error) {
      console.warn('Unable to refresh tenant details after registration success.', error);
      return responseTenants;
    }
  }

  clearRegisterField(controlName: 'name' | 'mobile_number' | 'email' | 'password'): void {
    this.registerForm.controls[controlName].setValue('');
  }

  toggleRegisterPasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  onRegisterMobileInput(event: any): void {
    const raw = String(event?.detail?.value || '');
    const digits = raw.replace(/\D+/g, '').slice(0, 10);
    if (digits !== raw) {
      this.registerForm.controls['mobile_number'].setValue(digits, { emitEvent: false });
    }
  }

  onOtpCodeChange(value: string): void {
    this.otpCode.set(String(value || '').replace(/\D+/g, '').slice(0, this.otpLength));
  }

  private startOtpTimer(): void {
    this.clearOtpTimer();
    this.otpCountdownSeconds.set(this.OTP_MODAL_DURATION_SECONDS);
    this.otpTimerId = setInterval(() => {
      if (this.otpCountdownSeconds() > 0) {
        this.otpCountdownSeconds.set(this.otpCountdownSeconds() - 1);
      }
      if (this.otpCountdownSeconds() <= 0) {
        this.clearOtpTimer();
        this.otpCode.set('');
        this.pendingOtpRequestUid.set('');
        this.presentToast('OTP expired. Please request a new OTP.', 'warning');
      }
    }, 1000);
  }

  private clearOtpTimer(): void {
    if (this.otpTimerId) {
      clearInterval(this.otpTimerId);
      this.otpTimerId = null;
    }
  }

  private startOtpResendTimer(): void {
    this.clearOtpResendTimer();
    this.otpResendCountdownSeconds.set(this.OTP_RESEND_RETRY_DURATION_SECONDS);
    this.otpResendTimerId = setInterval(() => {
      if (this.otpResendCountdownSeconds() > 0) {
        this.otpResendCountdownSeconds.set(this.otpResendCountdownSeconds() - 1);
      }
      if (this.otpResendCountdownSeconds() <= 0) {
        this.clearOtpResendTimer();
      }
    }, 1000);
  }

  private clearOtpResendTimer(): void {
    if (this.otpResendTimerId) {
      clearInterval(this.otpResendTimerId);
      this.otpResendTimerId = null;
    }
  }

  focusOtpInput(): void {
    setTimeout(() => {
      this.otpInput?.setFocus();
    }, 50);
  }

  async handleOfflineRegistration() {
    this.registerAttempted.set(true);
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
      if (this.registerForm.controls['mobile_number'].invalid) {
        this.presentToast('Please enter a valid 10-digit mobile number.', 'warning');
        return;
      }
      if (this.registerForm.controls['email'].invalid) {
        this.presentToast('Please enter a valid email address.', 'warning');
        return;
      }
      this.presentToast('Please fill out the form correctly.', 'warning');
      return;
    }

    const { name, business_name, company_name, mobile_number, email, password } = this.registerForm.value;
    const sanitizedCompany = this.formatInitialCapital(String(company_name || ''));
    const sanitizedBusiness = this.formatInitialCapital(String(business_name || sanitizedCompany || ''));
    this.registerForm.controls['business_name'].setValue(sanitizedBusiness, { emitEvent: false });
    this.pendingRegisterContext = {
      name: String(name || '').trim(),
      businessName: sanitizedBusiness,
      companyName: sanitizedCompany,
      mobileNumber: String(mobile_number || '').trim(),
      email: String(email || '').trim(),
      password: String(password || '')
    };
    await this.requestRegisterOtp('OTP sent successfully. Please enter the OTP to continue.');
  }

  hasRegisterError(controlName: 'name' | 'business_name' | 'company_name' | 'mobile_number' | 'email' | 'password'): boolean {
    const control = this.registerForm.controls[controlName];
    return !!control && control.invalid && (control.touched || this.registerAttempted());
  }

  closeOtpModal(): void {
    this.clearOtpTimer();
    this.clearOtpResendTimer();
    this.showOtpModal.set(false);
    this.otpCode.set('');
    this.otpFocused.set(false);
    this.otpCountdownSeconds.set(0);
    this.otpResendCountdownSeconds.set(0);
    this.pendingOtpRequestUid.set('');
  }

  private async requestRegisterOtp(successMessage: string): Promise<void> {
    const context = this.pendingRegisterContext;
    if (!context) {
      this.presentToast('Please fill out the registration form again to request OTP.', 'warning');
      return;
    }

    await this.storage.showLoading('Requesting OTP. Please wait...');
    try {
      const otpResponse = await this.odoo.requestRegisterOtpFromRegisterPage({
        email: String(context.email || '').trim(),
        mobile_number: String(context.mobileNumber || '').trim()
      });
      console.log('OTP request response:', otpResponse);
      const otpRequestUid = this.extractOtpRequestUid(otpResponse);
      if (!otpRequestUid) {
        throw new Error('OTP request failed: missing otp_request_uid in response.');
      }
      this.pendingOtpRequestUid.set(otpRequestUid);
      this.otpCode.set('');
      this.startOtpTimer();
      this.startOtpResendTimer();
      this.showOtpModal.set(true);
      this.focusOtpInput();
      this.presentToast(successMessage, 'success');
    } catch (e) {
      console.error('OTP request error:', e);
      this.presentToast('Unable to request OTP. Please try again.', 'danger');
    } finally {
      await this.storage.hideLoading();
    }
  }

  async resendOtp(): Promise<void> {
    if (!this.canResendOtp()) {
      return;
    }
    await this.requestRegisterOtp('A new OTP has been sent. Please enter it to continue.');
  }

  private async completeOfflineRegistration(context: {
    name: string;
    businessName: string;
    companyName: string;
    mobileNumber: string;
    email: string;
    password: string;
  }): Promise<void> {
    const registeredUser: any = await Promise.resolve({ id: 1 });
    if (registeredUser) {
      await Preferences.set({ key: 'allow_post_registration_offline_login', value: '1' });
      await Preferences.set({ key: 'config_plan', value: environment.registerPlan });
      await Preferences.set({ key: 'config_user', value: String(context.email || '').trim() });
      await Preferences.set({ key: 'config_password', value: String(context.password || '') });
      await Preferences.set({ key: 'config_company_name', value: context.companyName });
      await Preferences.set({ key: 'config_business_name', value: context.businessName });
      await Preferences.set({ key: 'last_company_name', value: context.companyName });
      await Preferences.set({ key: 'last_business_name', value: context.businessName });

      void (async () => {
        try {
          const mapRaw = (await Preferences.get({ key: 'company_business_map' })).value || '{}';
          let map: Record<string, string> = {};
          try { map = JSON.parse(String(mapRaw || '{}')); } catch { map = {}; }
          const key = this.normalizeCompanyKey(context.companyName);
          if (key) {
            map[key] = context.businessName;
            await Preferences.set({ key: 'company_business_map', value: JSON.stringify(map) });
          }

          const listRaw = (await Preferences.get({ key: 'company_business_list' })).value || '[]';
          let list: Array<{ company_name: string; business_name: string }> = [];
          try { list = JSON.parse(String(listRaw || '[]')); } catch { list = []; }
          const idx = list.findIndex((x) => this.normalizeCompanyKey(x?.company_name || '') === key);
          const row = { company_name: context.companyName, business_name: context.businessName };
          if (idx >= 0) list[idx] = row;
          else list.push(row);
          await Preferences.set({ key: 'company_business_list', value: JSON.stringify(list) });
        } catch (error) {
          console.warn('Failed to persist company-business mapping:', error);
        }
      })();

      this.presentToast('Offline account created successfully. You can now log in.', 'success');
      this.navCtrl.navigateRoot('/login/credentials', {
        state: {
          allowOfflineBootstrapLogin: true,
          showCredentials: true,
          loginEmail: String(context.email || '').trim(),
          loginNotice: 'Account created successfully. Sign in with your password to continue to PIN setup.'
        }
      });
      return;
    }

    this.presentToast(
      'Registration failed. A user with this Name, Mobile Number, or Email already exists for this business.',
      'danger'
    );
  }

  private async handleLocalRegistrationFollowUp(
    context: {
      name: string;
      businessName: string;
      companyName: string;
      mobileNumber: string;
      email: string;
      password: string;
    },
    tenants: RegisterTenant[],
    remoteRegisterResponse: any
  ): Promise<void> {
    try {
      const resolvedContext = await this.persistRegisteredTenants(tenants, context);
      this.clearOtpTimer();
      await this.completeOfflineRegistration(resolvedContext);
      this.closeOtpModal();
      this.pendingOtpRequestUid.set('');
      this.pendingRegisterContext = null;
    } catch (error) {
      console.warn('Registration completed on the backend, but local device setup failed.', {
        error,
        remoteRegisterResponse
      });
      this.clearOtpTimer();
      this.closeOtpModal();
      this.pendingOtpRequestUid.set('');
      this.pendingRegisterContext = null;
      this.presentToast(
        'Account created successfully, but this device could not finish local setup. Please sign in with your email and password.',
        'warning'
      );
      this.navCtrl.navigateRoot('/login/credentials', {
        state: {
          allowOfflineBootstrapLogin: true,
          showCredentials: true,
          loginEmail: String(context.email || '').trim(),
          loginNotice: 'Account created successfully. Sign in with your password to finish setup.'
        }
      });
    }
  }

  async submitOtpAndRegister(): Promise<void> {
    const context = this.pendingRegisterContext;
    if (!context || !this.pendingOtpRequestUid()) {
      this.presentToast('Registration session expired. Please request OTP again.', 'warning');
      this.closeOtpModal();
      return;
    }
    if (this.isOtpExpired()) {
      this.presentToast('OTP expired. Please request a new OTP.', 'warning');
      return;
    }

    const code = String(this.otpCode() || '').trim();
    if (!new RegExp(`^\\d{${this.otpLength}}$`).test(code)) {
      this.presentToast(`Please enter a valid ${this.otpLength}-digit OTP code.`, 'warning');
      return;
    }

    await this.storage.showLoading('Verifying OTP and completing registration...');
    try {
      const remoteRegisterResponse = await this.odoo.submitRegisterPayloadFromRegisterPage({
        name: context.name,
        company_name: context.companyName,
        business_name: context.businessName,
        email: context.email,
        mobile_number: context.mobileNumber,
        password: context.password,
        plan_code: environment.registerPlan,
        odoo_version: '18',
        otp_request_uid: this.pendingOtpRequestUid(),
        otp_code: code
      });
      console.log('Mobile register API response:', remoteRegisterResponse);
      const responseStatus = this.extractResponseStatus(remoteRegisterResponse);
      const existingTenants = await this.resolveRegisteredTenants(remoteRegisterResponse, {
        email: context.email,
        mobileNumber: context.mobileNumber
      });

      if (responseStatus === 'existing') {
        const hasActiveTenant = existingTenants.some(
          (tenant) => String(tenant?.status || '').trim().toLowerCase() === 'active'
        );

        this.closeOtpModal();
        this.pendingOtpRequestUid.set('');
        this.pendingRegisterContext = null;

        if (hasActiveTenant) {
          this.presentToast('An active tenant already exists for this email. Please log in instead of registering.', 'warning');
          this.navCtrl.navigateRoot('/login/credentials', {
            state: {
              showCredentials: true,
              loginEmail: String(context.email || '').trim()
            }
          });
          return;
        }

        this.presentToast('An account already exists, but the tenant is expired or inactive. Please contact support.', 'warning');
        this.navCtrl.navigateRoot('/login/credentials', {
          state: {
            showCredentials: true,
            loginEmail: String(context.email || '').trim()
          }
        });
        return;
      }

      if (!this.isRegisterSubmissionSuccessful(remoteRegisterResponse)) {
        this.otpCode.set('');
        this.focusOtpInput();
        this.presentToast(
          this.extractResponseMessage(remoteRegisterResponse) || 'Invalid OTP. Please try again.',
          'danger'
        );
        return;
      }

      this.startRegisteredTenantReadinessWatcher(existingTenants, context);
      await this.handleLocalRegistrationFollowUp(context, existingTenants, remoteRegisterResponse);
    } catch (error) {
      console.warn('Failed to submit registration payload with OTP.', error);
      const failurePayload = this.unwrapResponsePayload(error);
      const failureMessage = this.extractFailureMessage(error);

      if (this.isOtpVerificationRejected(failurePayload)) {
        this.otpCode.set('');
        this.focusOtpInput();
        this.presentToast(failureMessage || 'Invalid OTP. Please try again.', 'danger');
        return;
      }

      this.presentToast(
        failureMessage || 'Unable to complete registration right now. Please try again.',
        'danger'
      );
    } finally {
      await this.storage.hideLoading();
    }
  }

  async presentToast(message: string, color: 'success' | 'warning' | 'danger' | 'info') {
    const toast = await this.toastCtrl.create({
      message: this.t(message),
      duration: 3000,
      color: color,
      position: 'top',
    });
    toast.present();
  }
}
