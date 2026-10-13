import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Checkout } from 'capacitor-razorpay';
import { environment } from '../../environments/environment';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { StorageService } from '../services/storage.service';
import { Preferences } from '@capacitor/preferences';
import { TranslateService } from '@ngx-translate/core';

import { TranslateModule } from '@ngx-translate/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonSpinner, NavController, ToastController } from '@ionic/angular/standalone';

type RazorpayCheckoutResponse = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayWebCheckoutOptions = Record<string, any> & {
  handler?: (response: RazorpayCheckoutResponse) => void;
  modal?: {
    ondismiss?: () => void;
    [key: string]: any;
  };
};

type RazorpayWebCheckoutInstance = {
  open: () => void;
  on?: (event: string, callback: (response: any) => void) => void;
};

type RazorpayWebCheckoutConstructor = new (options: RazorpayWebCheckoutOptions) => RazorpayWebCheckoutInstance;

@Component({
  selector: 'app-license-renewal',
  templateUrl: './license-renewal.page.html',
  styleUrls: ['./license-renewal.page.scss'],
  imports: [TranslateModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonSpinner]
})
export class LicenseRenewalPage implements OnInit {
  private razorpayWebSdkPromise: Promise<RazorpayWebCheckoutConstructor> | null = null;
  tenantInfo = signal<any | null>(null);
  licenseSummary = signal<any | null>(null);
  plans = signal<any[]>([]);
  selectedPlanCode = signal<string>('');
  isLoadingPlans = signal<boolean>(false);
  isPaying = signal<boolean>(false);
  returnToRoute = signal<string>('/login');

  constructor(
    private readonly odoo: OdooJsonRpcService, private readonly storage: StorageService,
    private readonly navCtrl: NavController,
    private readonly toastController: ToastController,
    private readonly router: Router,
    private readonly i18n: TranslateService
  ) { }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.instant(key, params);
  }

  async ngOnInit(): Promise<void> {
    this.resolveReturnRoute();
    await this.loadTenantInfo();
    await this.loadPlans();
  }

  displayPlanCode = computed(() => String(this.tenantInfo()?.plan_code || '').trim() || 'N/A');

  currentPlanName = computed(() => this.currentPlan()?.name || this.displayPlanCode());

  displayExpiryDate = computed(() => {
    const rawDate = this.licenseSummary()?.relevantDate || String(
      this.tenantInfo()?.expiry_date ||
      this.tenantInfo()?.paid_until ||
      this.tenantInfo()?.grace_until ||
      this.tenantInfo()?.trial_end_date ||
      this.tenantInfo()?.license_expiry_date ||
      ''
    ).trim();
    if (rawDate) {
      return this.formatTenantDate(rawDate);
    }
    return 'N/A';
  });

  licenseStatusDisplayLabel = computed(() => {
    const rawLicenseStatus = String(
      this.tenantInfo()?.license_status ||
      this.tenantInfo()?.licenseStatus ||
      ''
    ).trim().toLowerCase();

    const rawProvisionStatus = String(
      this.tenantInfo()?.status ||
      this.tenantInfo()?.provision_status ||
      ''
    ).trim().toLowerCase();

    if (rawLicenseStatus === 'trial') return 'Trial';
    if (rawLicenseStatus === 'active') return 'Active';
    if (rawLicenseStatus === 'grace') return 'Grace';
    if (rawLicenseStatus === 'expired') return 'Expired';
    if (rawLicenseStatus === 'cancelled') return 'Cancelled';
    if (rawLicenseStatus) return rawLicenseStatus.charAt(0).toUpperCase() + rawLicenseStatus.slice(1).replace(/[_-]+/g, ' ');

    if (rawProvisionStatus === 'active') return 'Active';
    if (rawProvisionStatus === 'disabled') return 'Disabled';
    if (rawProvisionStatus === 'error') return 'Needs attention';
    if (rawProvisionStatus === 'deleting') return 'Deleting';
    if (rawProvisionStatus) return rawProvisionStatus.charAt(0).toUpperCase() + rawProvisionStatus.slice(1).replace(/[_-]+/g, ' ');

    return 'Expired';
  });

  companyName = computed(() => String(this.tenantInfo()?.company_name || '').trim() || 'Current Company');

  currentPlan = computed(() => {
    const currentCode = String(this.tenantInfo()?.plan_code || '').trim().toLowerCase();
    if (!currentCode) return null;
    return this.plans().find((plan) => String(plan.code || '').trim().toLowerCase() === currentCode) || null;
  });

  selectedPlan = computed(() => {
    const selectedCode = String(this.selectedPlanCode() || '').trim().toLowerCase();
    if (!selectedCode) return this.currentPlan();
    return this.plans().find((plan) => String(plan.code || '').trim().toLowerCase() === selectedCode) || this.currentPlan();
  });

  selectedPlanCurrency = computed(() => String(this.selectedPlan()?.currency || this.currentPlan()?.currency || 'INR').trim() || 'INR');

  selectedPlanSubtotal = computed(() => this.resolvePlanSubtotal(this.selectedPlan() || this.currentPlan()));

  selectedPlanTaxAmount = computed(() => this.resolvePlanTaxAmount(this.selectedPlan() || this.currentPlan()));

  selectedPlanTotalAmount = computed(() => this.resolvePlanTotalAmount(this.selectedPlan() || this.currentPlan()));

  selectedPlanAmountPaise = computed(() => Math.round(this.selectedPlanTotalAmount() * 100));

  selectedPlanAmountRupees = computed(() => this.selectedPlanTotalAmount().toFixed(2));

  canStartPayment = computed(() => !this.isPaying() && !!this.selectedPlan() && this.selectedPlanAmountPaise() > 0);

  async goBack(): Promise<void> {
    await this.navigateToReturnPage();
  }

  async startPayment(): Promise<void> {
    if (this.isPaying()) return;
    if (!this.tenantInfo()) {
      await this.presentToast('Tenant information is unavailable. Please try again.', 'danger');
      return;
    }
    if (!this.selectedPlan()) {
      await this.presentToast('Please select a plan to continue.', 'danger');
      return;
    }
    if (this.selectedPlanAmountPaise() <= 0) {
      await this.presentToast('Selected plan amount is invalid.', 'danger');
      return;
    }

    const keyId = String((environment as any)?.razorpay?.key_id || '').trim();
    const keySecret = String((environment as any)?.razorpay?.key_secret || '').trim();
    const paymentProviderId = Number((environment as any)?.razorpay?.payment_provider_id || 0);
    const paymentMethodId = Number((environment as any)?.razorpay?.payment_method_id || 0);
    const paymentMethodCode = String(
      (environment as any)?.razorpay?.payment_method_code || 'card'
    ).trim() || 'card';
    if (!keyId || !keySecret) {
      await this.presentToast('Razorpay credentials are missing.', 'danger');
      return;
    }

    this.isPaying.set(true);
    let _deviceId = "";
    let paymentInitialized = false;
    let checkoutCompleted = false;
    let captureAttempted = false;
    let paymentCaptured = false;
    let initializationIdempotencyKey = '';
    let paymentReference = '';
    let gatewayOrderId = '';
    try {
      const merchantOrderId = this.buildReceiptId();
      const orderPayload = {
        amount: this.selectedPlanAmountPaise(),
        currency: this.selectedPlanCurrency(),
        receipt: merchantOrderId,
        notes: {
          flow: 'license_renewal',
          company_name: this.companyName(),
          current_plan_code: this.displayPlanCode(),
          selected_plan_code: this.selectedPlan().code,
          selected_plan_name: this.selectedPlan().name,
          db_name: String(this.tenantInfo()?.db_name || '').trim(),
          expiry_date: this.displayExpiryDate(),
          subtotal: this.selectedPlanSubtotal(),
          tax_amount: this.selectedPlanTaxAmount(),
          total: this.selectedPlanTotalAmount()
        }
      };

      const order = await this.createRenewalOrder(orderPayload, keyId, keySecret);
      gatewayOrderId = String(order?.id || order?.order_id || '').trim();
      if (!gatewayOrderId) {
        throw new Error('Razorpay order was not created.');
      }

      const initPayload = {
        gateway: 'razorpay',
        payment_provider_id: Number.isFinite(paymentProviderId) && paymentProviderId > 0 ? paymentProviderId : undefined,
        payment_provider_code: 'razorpay',
        payment_method_id: Number.isFinite(paymentMethodId) && paymentMethodId > 0 ? paymentMethodId : undefined,
        payment_method_code: paymentMethodCode,
        merchant_order_id: merchantOrderId,
        gateway_order_id: gatewayOrderId,
        amount: Number(this.selectedPlanTotalAmount().toFixed(2)),
        currency: this.selectedPlanCurrency(),
        plan_code: this.selectedPlan().code,
        email: String(this.tenantInfo()?.admin_login || '').trim() || undefined,
        customer_name: this.companyName(),
        tenant_uid: String(this.tenantInfo()?.tenant_uid || '').trim() || undefined,
        saas_master_uid: String(this.tenantInfo()?.saas_master_uid || '').trim() || undefined,
        tenant_db_name: String(this.tenantInfo()?.db_name || '').trim() || undefined,
        description: `Renew ${this.selectedPlan().name}`,
        invoice_lines: [
          {
            name: `${this.selectedPlan().name} Renewal`,
            quantity: 1,
            price_unit: Number(this.selectedPlanSubtotal().toFixed(2)),
            amount: Number(this.selectedPlanSubtotal().toFixed(2))
          }
        ]
      };
      const idempotencyKey = String(Date.now());
      _deviceId = await import('@capacitor/device').then(m => m.Device.getId()).then(d => d.identifier).catch(() => '');
      const initResp = await this.odoo.initializeMobilePaymentOnSubscriptionServer(initPayload, idempotencyKey, _deviceId);
      const initializedPayment = { response: initResp, idempotencyKey };
      
      const initializedStatus = this.normalizePaymentResponseStatus(initializedPayment.response);
      if (!['draft', 'pending', 'done', 'success'].includes(initializedStatus)) {
        throw new Error(this.extractPaymentResponseMessage(
          initializedPayment.response,
          'Payment initialization failed.'
        ));
      }
      initializationIdempotencyKey = initializedPayment.idempotencyKey;
      paymentReference = String(
        initializedPayment.response?.reference || merchantOrderId
      ).trim();
      if (!paymentReference) {
        throw new Error('Payment initialization did not return a reference.');
      }
      paymentInitialized = true;

      const checkoutResult: any = await this.openRazorpayCheckout({
        key: keyId,
        amount: String(this.selectedPlanAmountPaise()),
        currency: this.selectedPlanCurrency(),
        name: this.companyName(),
        description: `Renew ${this.selectedPlan().name}`,
        order_id: gatewayOrderId,
        prefill: {
          email: String(this.tenantInfo()?.admin_login || '').trim(),
          contact: ''
        },
        notes: orderPayload.notes,
        theme: {
          color: '#2f8f2f'
        }
      } as any);

      const payment = this.normalizeCheckoutResponse(checkoutResult);
      if (!payment.razorpay_payment_id || !payment.razorpay_order_id || !payment.razorpay_signature) {
        throw new Error('Razorpay did not return complete payment details.');
      }
      checkoutCompleted = true;
      captureAttempted = true;
      
      const capPayload = {
        reference: paymentReference,
        initialization_idempotency_key: initializationIdempotencyKey,
        gateway_transaction_id: payment.razorpay_payment_id,
        gateway_order_id: payment.razorpay_order_id || gatewayOrderId,
        status: 'success',
        gateway: 'razorpay',
        payment_provider_id: Number.isFinite(paymentProviderId) && paymentProviderId > 0 ? paymentProviderId : undefined,
        payment_method_id: Number.isFinite(paymentMethodId) && paymentMethodId > 0 ? paymentMethodId : undefined,
        payment_method_code: paymentMethodCode,
        payment_provider_code: 'razorpay'
      };
      _deviceId = await import('@capacitor/device').then(m => m.Device.getId()).then(d => d.identifier).catch(() => '');
      const captureResult = await this.odoo.captureMobilePaymentOnSubscriptionServer(capPayload, initializationIdempotencyKey, _deviceId);
      
      const captureResponseStatus = this.normalizePaymentResponseStatus(captureResult);
      if (!['done', 'pending', 'success'].includes(captureResponseStatus)) {
        throw new Error(this.extractPaymentResponseMessage(
          captureResult,
          'Payment capture failed.'
        ));
      }
      paymentCaptured = true;
      await this.refreshTenantInfoFromServer();

      const latestLicenseState = { shouldBlockAccess: false };
      if (captureResponseStatus === 'done' || !latestLicenseState.shouldBlockAccess) {
        await this.presentToast('Payment completed successfully.', 'success');
      } else {
        await this.presentToast(
          'Payment was captured, but the renewed license status is still refreshing. Please try again shortly.',
          'success'
        );
      }
      await this.navigateToReturnPage();
    } catch (error: any) {
      let failure = this.normalizePaymentFailure(error);
      if (paymentInitialized && !checkoutCompleted && !captureAttempted && paymentReference) {
        try {
          const capFailurePayload = {
            reference: paymentReference,
            initialization_idempotency_key: initializationIdempotencyKey || undefined,
            gateway_order_id: gatewayOrderId || undefined,
            status: failure.status,
            failure_code: failure.code || undefined,
            failure_message: failure.message || undefined,
            gateway: 'razorpay',
            payment_provider_id: Number.isFinite(paymentProviderId) && paymentProviderId > 0 ? paymentProviderId : undefined,
            payment_method_id: Number.isFinite(paymentMethodId) && paymentMethodId > 0 ? paymentMethodId : undefined,
            payment_method_code: paymentMethodCode,
            payment_provider_code: 'razorpay'
          };
          const deviceIdFailure = await import('@capacitor/device').then(m => m.Device.getId()).then(d => d.identifier).catch(() => '');
          const captureFailureResult = await this.odoo.captureMobilePaymentOnSubscriptionServer(capFailurePayload, initializationIdempotencyKey, deviceIdFailure);
          failure = this.normalizePaymentFailure(
            captureFailureResult?.response,
            failure
          );
        } catch (captureError) {
          console.warn('Failed to report payment capture failure to subscription server.', captureError);
        }
      }
      await this.presentToast(
        this.getPaymentFailureToastMessage(failure),
        'danger'
      );
      await this.navigateToReturnPage();
    } finally {
      this.isPaying.set(false);
    }
  }

  private resolveReturnRoute(): void {
    const state = this.router.getCurrentNavigation()?.extras?.state || history.state;
    const candidate = String(state?.['returnTo'] || '').trim();
    this.returnToRoute.set(candidate || '/login');
  }

  private async navigateToReturnPage(): Promise<void> {
    await this.navCtrl.navigateBack(this.returnToRoute());
  }

  private async loadTenantInfo(): Promise<void> {
    const [
        planCode, companyName, businessName, adminLogin, url,
        licenseStatus, provisionStatus, trialEndDate, expiryDate,
        tenantUid
    ] = await Promise.all([
        Preferences.get({ key: 'config_plan' }),
        Preferences.get({ key: 'config_company_name' }),
        Preferences.get({ key: 'config_business_name' }),
        Preferences.get({ key: 'config_user' }),
        Preferences.get({ key: 'config_url' }),
        Preferences.get({ key: 'config_license_status' }),
        Preferences.get({ key: 'config_provision_status' }),
        Preferences.get({ key: 'config_trial_end_date' }),
        Preferences.get({ key: 'config_expiry_date' }),
        Preferences.get({ key: 'config_tenant_uid' })
    ]);
    const info = {
        plan_code: planCode.value,
        company_name: companyName.value,
        db_name: businessName.value,
        admin_login: adminLogin.value,
        url: url.value,
        license_status: licenseStatus.value,
        status: provisionStatus.value,
        trial_end_date: trialEndDate.value,
        license_expiry_date: expiryDate.value,
        expiry_date: expiryDate.value,
        tenant_uid: tenantUid.value
    };
    this.tenantInfo.set(info);
    this.licenseSummary.set({
      label: this.licenseStatusDisplayLabel(),
      relevantDate: info.expiry_date || info.trial_end_date
    });
  }

  private async loadPlans(): Promise<void> {
    this.isLoadingPlans.set(true);
    try {
      const plansResp = await this.odoo.listMobilePlansFromSubscriptionServer({
        odoo_version: String(this.tenantInfo()?.odoo_version || '').trim() || undefined
      }, await import('@capacitor/device').then(m => m.Device.getId()).then(d => d.identifier).catch(() => ''));
      const fetchedPlans = plansResp?.plans || [];
      this.plans.set(fetchedPlans);
      const currentCode = String(this.tenantInfo()?.plan_code || '').trim().toLowerCase();
      const matchingCurrentPlan = fetchedPlans.find(
        (plan: any) => String(plan.code || '').trim().toLowerCase() === currentCode
      );
      if (matchingCurrentPlan) {
        this.selectedPlanCode.set(matchingCurrentPlan.code);
      } else if (fetchedPlans.length > 0) {
        this.selectedPlanCode.set(fetchedPlans[0].code);
      }
    } catch (error) {
      console.warn('Failed to load mobile plans for renewal:', error);
      this.plans.set([]);
      await this.presentToast('Unable to load plans right now. Please try again.', 'danger');
    } finally {
      this.isLoadingPlans.set(false);
    }
  }

  selectPlan(plan: any): void {
    this.selectedPlanCode.set(String(plan?.code || '').trim());
  }

  isCurrentPlan(plan: any): boolean {
    return String(plan?.code || '').trim().toLowerCase() === String(this.tenantInfo()?.plan_code || '').trim().toLowerCase();
  }

  isSelectedPlan(plan: any): boolean {
    return String(plan?.code || '').trim().toLowerCase() === String(this.selectedPlanCode() || '').trim().toLowerCase();
  }

  formatPlanAmount(plan: any | null | undefined): string {
    const currency = String(plan?.currency || 'INR').trim() || 'INR';
    const amount = this.resolvePlanTotalAmount(plan);
    return `${currency === 'INR' ? '₹' : `${currency} `}${amount.toFixed(2)}`;
  }

  formatPlanSubtotal(plan: any | null | undefined): string {
    const currency = String(plan?.currency || 'INR').trim() || 'INR';
    const amount = this.resolvePlanSubtotal(plan);
    return `${currency === 'INR' ? '₹' : `${currency} `}${amount.toFixed(2)}`;
  }

  formatPlanTax(plan: any | null | undefined): string {
    const currency = String(plan?.currency || 'INR').trim() || 'INR';
    const amount = this.resolvePlanTaxAmount(plan);
    return `${currency === 'INR' ? '₹' : `${currency} `}${amount.toFixed(2)}`;
  }

  formatPlanCaption(plan: any | null | undefined): string {
    const period = String(plan?.billing_period || '').trim();
    const pricingModel = String(plan?.pricing_model || '').trim().toLowerCase();
    const pieces: string[] = [];
    if (period) {
      pieces.push(period);
    }
    if (pricingModel === 'per_user' || (this.resolvePlanAmount(plan) <= 0 && Number(plan?.price_per_user || 0) > 0)) {
      pieces.push('per user');
    }
    return pieces.join(' • ');
  }

  resolvePlanAmount(plan: any | null | undefined): number {
    if (!plan) return 0;
    const candidateKeys = [
      'recurring_price',
      'price',
      'amount',
      'plan_amount',
      'total_amount',
      'price_per_user',
      'unit_price',
      'cost',
      'rate',
      'price_unit'
    ];
    for (const key of candidateKeys) {
      const val = plan[key];
      const num = Number(val);
      if (val !== undefined && val !== null && val !== '' && Number.isFinite(num) && num > 0) {
        return num;
      }
    }
    return 0;
  }

  resolvePlanTaxAmount(plan: any | null | undefined): number {
    if (!plan) return 0;
    const taxes = Array.isArray(plan.taxes) ? plan.taxes : (Array.isArray(plan.tax_ids) ? plan.tax_ids : []);
    if (taxes.length === 0) return 0;

    const baseAmount = this.resolvePlanAmount(plan);
    if (baseAmount <= 0) return 0;

    let totalTax = 0;
    for (const tax of taxes) {
      const taxRate = Number(tax.amount ?? tax.rate ?? tax.value ?? 0);
      if (!Number.isFinite(taxRate) || taxRate <= 0) continue;

      const amountType = String(tax.amount_type || tax.type || 'percent').toLowerCase();
      const isPriceInclusive = Boolean(tax.price_include || tax.price_inclusive);

      if (amountType === 'percent' || amountType === 'group' || amountType === 'percentage') {
        if (isPriceInclusive) {
          totalTax += baseAmount - (baseAmount / (1 + taxRate / 100));
        } else {
          totalTax += baseAmount * (taxRate / 100);
        }
      } else if (amountType === 'fixed') {
        totalTax += taxRate;
      }
    }
    return totalTax;
  }

  resolvePlanSubtotal(plan: any | null | undefined): number {
    if (!plan) return 0;
    const baseAmount = this.resolvePlanAmount(plan);
    const taxes = Array.isArray(plan.taxes) ? plan.taxes : (Array.isArray(plan.tax_ids) ? plan.tax_ids : []);
    let isInclusive = false;
    for (const tax of taxes) {
      if (tax.price_include || tax.price_inclusive) {
        isInclusive = true;
        break;
      }
    }
    if (isInclusive) {
      return baseAmount - this.resolvePlanTaxAmount(plan);
    }
    return baseAmount;
  }

  resolvePlanTotalAmount(plan: any | null | undefined): number {
    if (!plan) return 0;
    const baseAmount = this.resolvePlanAmount(plan);
    const taxes = Array.isArray(plan.taxes) ? plan.taxes : (Array.isArray(plan.tax_ids) ? plan.tax_ids : []);
    let isInclusive = false;
    for (const tax of taxes) {
      if (tax.price_include || tax.price_inclusive) {
        isInclusive = true;
        break;
      }
    }
    if (isInclusive) {
      return baseAmount;
    }
    return baseAmount + this.resolvePlanTaxAmount(plan);
  }

  private buildReceiptId(): string {
    const dbName = String(this.tenantInfo()?.db_name || 'tenant').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
    const timestamp = Date.now();
    return `renew_${dbName}_${timestamp}`.slice(0, 40);
  }

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

  private async createRenewalOrder(payload: any, keyId: string, keySecret: string): Promise<any> {
    const auth = this.encodeBasicAuth(keyId, keySecret);
    const response = await CapacitorHttp.post({
      url: 'https://api.razorpay.com/v1/orders',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      data: {
        ...payload,
        notes: {
          ...(payload?.notes || {}),
          company_name: this.companyName(),
          current_plan_code: this.displayPlanCode(),
          selected_plan_code: this.selectedPlan()?.code || this.displayPlanCode(),
          db_name: String(this.tenantInfo()?.db_name || '').trim()
        }
      },
      responseType: 'json',
      connectTimeout: 30000
    });

    if (!response || Number(response.status || 0) >= 400) {
      throw new Error(`Razorpay order create failed (${response?.status || 'HTTP'}).`);
    }

    return response.data;
  }

  private encodeBasicAuth(keyId: string, keySecret: string): string {
    const raw = `${keyId}:${keySecret}`;
    if (typeof btoa === 'function') {
      return btoa(raw);
    }
    throw new Error('Basic auth encoding is unavailable on this platform.');
  }

  private isDesktopWebCheckoutPlatform(): boolean {
    const platform = Capacitor.getPlatform();
    return platform === 'electron' || platform === 'web';
  }

  private async openRazorpayCheckout(options: Record<string, any>): Promise<RazorpayCheckoutResponse> {
    if (!this.isDesktopWebCheckoutPlatform()) {
      return this.normalizeCheckoutResponse(await Checkout.open(options as any));
    }

    const RazorpayCheckout = await this.loadRazorpayWebSdk();
    return await new Promise<RazorpayCheckoutResponse>((resolve, reject) => {
      let settled = false;
      const finishResolve = (response: RazorpayCheckoutResponse) => {
        if (settled) return;
        settled = true;
        resolve(response || {});
      };
      const finishReject = (error: any) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const checkout = new RazorpayCheckout({
        ...options,
        handler: (response: RazorpayCheckoutResponse) => {
          finishResolve(response || {});
        },
        modal: {
          ...(options?.['modal'] || {}),
          ondismiss: () => {
            finishReject(new Error('Payment was cancelled.'));
          }
        }
      });

      checkout.on?.('payment.failed', (response: any) => {
        finishReject(response?.error || response || new Error('Payment failed.'));
      });

      try {
        checkout.open();
      } catch (error) {
        finishReject(error);
      }
    });
  }

  private async loadRazorpayWebSdk(): Promise<RazorpayWebCheckoutConstructor> {
    const existing = (window as any)?.Razorpay;
    if (typeof existing === 'function') {
      return existing as RazorpayWebCheckoutConstructor;
    }

    if (!this.razorpayWebSdkPromise) {
      this.razorpayWebSdkPromise = new Promise<RazorpayWebCheckoutConstructor>((resolve, reject) => {
        const current = (window as any)?.Razorpay;
        if (typeof current === 'function') {
          resolve(current as RazorpayWebCheckoutConstructor);
          return;
        }

        const existingScript = document.querySelector('script[data-razorpay-checkout="true"]') as HTMLScriptElement | null;
        const onLoad = () => {
          const loadedCtor = (window as any)?.Razorpay;
          if (typeof loadedCtor === 'function') {
            resolve(loadedCtor as RazorpayWebCheckoutConstructor);
            return;
          }
          reject(new Error('Razorpay checkout did not initialize.'));
        };
        const onError = () => reject(new Error('Failed to load Razorpay checkout.'));

        if (existingScript) {
          existingScript.addEventListener('load', onLoad, { once: true });
          existingScript.addEventListener('error', onError, { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.dataset['razorpayCheckout'] = 'true';
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
        document.head.appendChild(script);
      }).catch((error) => {
        this.razorpayWebSdkPromise = null;
        throw error;
      });
    }

    return await this.razorpayWebSdkPromise;
  }

  private async refreshTenantInfoFromServer(): Promise<void> {
    const adminLoginRaw = String(this.tenantInfo()?.admin_login || '').trim();
    const isEmail = adminLoginRaw.includes('@');
    const isPhone = !isEmail && /^\+?\d{7,15}$/.test(adminLoginRaw.replace(/[\s-]/g, ''));

    const refreshedInfo = await this.odoo.fetchUpdatedTenantFromSubscription({
      tenant_uid: String(this.tenantInfo()?.tenant_uid || '').trim() || undefined,
      email: isEmail ? adminLoginRaw : undefined,
      phone: isPhone ? adminLoginRaw : undefined,
      tenant_db_name: String(this.tenantInfo()?.db_name || '').trim() || undefined,
      company_name: String(this.tenantInfo()?.company_name || '').trim() || undefined
    });
    if (refreshedInfo) {
      await Promise.all([
          Preferences.set({ key: 'config_license_status', value: refreshedInfo.license_status }),
          Preferences.set({ key: 'config_provision_status', value: refreshedInfo.status }),
          Preferences.set({ key: 'config_trial_end_date', value: refreshedInfo.trial_end_date }),
          Preferences.set({ key: 'config_expiry_date', value: refreshedInfo.license_expiry_date })
      ]);
      const updatedInfo = { ...this.tenantInfo(), ...refreshedInfo };
      this.tenantInfo.set(updatedInfo);
    }
    
    this.licenseSummary.set({
      label: this.licenseStatusDisplayLabel(),
      relevantDate: this.tenantInfo()?.expiry_date || this.tenantInfo()?.trial_end_date || this.tenantInfo()?.license_expiry_date
    });
  }

  private normalizeCheckoutResponse(result: any): RazorpayCheckoutResponse {
    const rawResponse = result?.response ?? result;
    if (rawResponse && typeof rawResponse === 'object') {
      return rawResponse;
    }

    if (typeof rawResponse === 'string') {
      try {
        return JSON.parse(rawResponse);
      } catch (_e) {
        return {};
      }
    }

    return {};
  }

  private normalizePaymentResponseStatus(response: any): string {
    return String(
      response?.status ??
      response?.result?.status ??
      ''
    ).trim().toLowerCase();
  }

  private extractPaymentResponseMessage(response: any, fallbackMessage: string): string {
    const message = [
      response?.message,
      response?.failure_message,
      response?.error_message,
      response?.error?.message,
      response?.result?.message
    ].find((value) => typeof value === 'string' && String(value).trim());
    return String(message || fallbackMessage).trim() || fallbackMessage;
  }

  private normalizePaymentFailure(
    error: any,
    fallback?: { status: 'failed' | 'canceled'; code: string; message: string; }
  ): {
    status: 'failed' | 'canceled';
    code: string;
    message: string;
  } {
    const parsedError = this.parseStructuredError(error);
    const rawError = parsedError || error;
    const message = String(
      rawError?.message ||
      rawError?.description ||
      rawError?.failure_message ||
      rawError?.error_message ||
      rawError?.error?.message ||
      rawError?.error?.description ||
      rawError?.reason ||
      error?.message ||
      error?.description ||
      error?.error?.message ||
      error?.error?.description ||
      error ||
      fallback?.message ||
      'Payment was not completed.'
    ).trim() || fallback?.message || 'Payment was not completed.';
    const code = String(
      rawError?.code ||
      rawError?.failure_code ||
      rawError?.error?.code ||
      rawError?.reason ||
      rawError?.error?.reason ||
      error?.code ||
      error?.error?.code ||
      error?.reason ||
      error?.error?.reason ||
      fallback?.code ||
      ''
    ).trim();
    const gatewayStatus = String(
      rawError?.gateway_status ||
      rawError?.status ||
      rawError?.error?.status ||
      ''
    ).trim().toLowerCase();
    const normalizedMessage = message.toLowerCase();
    const normalizedCode = code.toLowerCase();
    const source = String(rawError?.source || rawError?.error?.source || '').trim().toLowerCase();
    const step = String(rawError?.step || rawError?.error?.step || '').trim().toLowerCase();
    const numericCode = Number(code);

    const status = (
      ['cancel', 'cancelled', 'canceled'].includes(gatewayStatus) ||
      normalizedMessage.includes('cancel') ||
      normalizedMessage.includes('dismiss') ||
      normalizedCode.includes('cancel') ||
      normalizedCode.includes('dismiss') ||
      normalizedCode === '2' ||
      numericCode === 2 ||
      (
        source === 'customer' &&
        step === 'payment_authentication' &&
        !String(rawError?.gateway_transaction_id || '').trim()
      )
    )
      ? 'canceled'
      : (fallback?.status || 'failed');

    return { status, code, message };
  }

  private parseStructuredError(input: any): any {
    const candidates = [
      input,
      input?.error,
      input?.response,
      input?.data,
      input?.failure_message,
      input?.failure_code,
      input?.message
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === 'object') {
        return candidate;
      }
      if (typeof candidate !== 'string') continue;
      const raw = String(candidate || '').trim();
      if (!raw.startsWith('{') || !raw.endsWith('}')) continue;
      try {
        return JSON.parse(raw);
      } catch (_error) {
        continue;
      }
    }

    return null;
  }

  private getPaymentFailureToastMessage(failure: {
    status: 'failed' | 'canceled';
    code: string;
    message: string;
  }): string {
    if (failure.status === 'canceled') {
      return 'Payment cancelled.';
    }

    const normalizedMessage = String(failure.message || '').trim();
    if (!normalizedMessage) {
      return 'Payment failed.';
    }
    if (
      normalizedMessage.startsWith('{') ||
      normalizedMessage.toLowerCase() === 'undefined' ||
      normalizedMessage.toLowerCase() === 'payment_error'
    ) {
      return 'Payment failed. Please try again.';
    }
    return normalizedMessage;
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message: this.t(message),
      duration: 2500,
      color,
      position: 'top'
    });
    await toast.present();
  }
}
