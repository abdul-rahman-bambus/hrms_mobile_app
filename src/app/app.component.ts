import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Animation,
  AnimationController,
  IonApp,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
  Platform
} from '@ionic/angular/standalone';
import { OdooJsonRpcService } from './services/odoojsonrpc.service';
import { AttendanceService, EmployeeService, LocalCredentials, StorageService } from './services/storage.service';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { NavigationEnd, Router } from '@angular/router';
import { filter, lastValueFrom, Subscription } from 'rxjs';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { TranslateModule } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { AlertController, MenuController } from '@ionic/angular';
import {
  listOutline,
  logOutOutline,
  peopleOutline,
  personCircleOutline,
  settingsOutline,
  businessOutline
} from 'ionicons/icons';

interface GlobalMenuItem {
  labelKey: string;
  route: string;
  icon: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    TranslateModule,
    IonApp,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonMenuToggle,
    IonRouterOutlet,
    IonTitle,
    IonToolbar
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
  private routerEventsSub?: Subscription;
  loading = false;
  isPinSet = false;
  isAdminUser = false;
  showGlobalMenu = false;
  currentUrl = '';
  urlWhenOnline = '';
  readonly menuItems: GlobalMenuItem[] = [
    { labelKey: 'VIEW_PROFILE', route: '/profile', icon: 'person-circle-outline' },
    { labelKey: 'EMPLOYEES', route: '/employee-list', icon: 'people-outline', adminOnly: true },
    { labelKey: 'ATTENDANCE_LOGS', route: '/attendances', icon: 'list-outline' },
    { labelKey: 'SWITCH_COMPANY', route: '/company', icon: 'business-outline' },
    { labelKey: 'SETTINGS', route: '/settings', icon: 'settings-outline' }
  ];

  myCustomPageTransition = (baseEl: any, opts?: any): Animation => {
    const enteringEl = opts.enteringEl;
    const leavingEl = opts.leavingEl;

    const rootTransition = this.animationCtrl.create()
      .duration(200)
      .easing('ease-in-out');

    const enteringPage = this.animationCtrl.create()
      .addElement(enteringEl)
      .fromTo('opacity', '0', '1');

    const leavingPage = this.animationCtrl.create()
      .addElement(leavingEl)
      .fromTo('opacity', '1', '0');

    rootTransition.addAnimation([enteringPage, leavingPage]);
    return rootTransition;
  };

  constructor(
    public storage: StorageService,
    public odoo: OdooJsonRpcService,
    private platform: Platform,
    private navCtrl: NavController,
    private modal: ModalController,
    private router: Router,
    private empservice: EmployeeService,
    private attservice: AttendanceService,
    private animationCtrl: AnimationController,
    private menuCtrl: MenuController,
    private alertController: AlertController,
  ) {
    addIcons({ listOutline, logOutOutline, peopleOutline, personCircleOutline, settingsOutline, businessOutline });
  }

  private lastBackPress = 0;
  private exitDelay = 2000;

  get visibleMenuItems(): GlobalMenuItem[] {
    return this.menuItems.filter(item => !item.adminOnly || this.isAdminUser);
  }

  async ngOnInit() {
    this.setupRouterMenuTracking();
    await this.refreshMenuState();
    const platform = Capacitor.getPlatform();

    try {
      if (platform === 'electron') {
        const Plugins = (Capacitor as any).Plugins;
        const sqlitePlugin = Plugins.CapacitorCommunitySqlite || Plugins.CapacitorSQLite;

        try {
          await jeepSqlite(window);
          const jeepEl = document.createElement('jeep-sqlite');
          document.body.appendChild(jeepEl);
          await customElements.whenDefined('jeep-sqlite');

          const sqliteConnection = new SQLiteConnection(sqlitePlugin);
          await sqliteConnection.initWebStore();

          console.log('✅ Sync-proof engine is officially ALIVE');
        } catch (err) {
          console.error('❌ Logic failed:', err);
        }
      }

      await this.storage.initializeDatabase();

      await Promise.all([
        this.storage.loadModels(),
        this.storage.initEmployeeTable(),
        this.storage.loadAudio()
      ]);
      console.log('📦 Assets and Tables Initialized');

      await this.applyStatusBarTheme(platform);
      this.setupNetworkListeners();
      this.setupAppStateListeners();
      this.setupBackButton();
      await this.handleNavigationFlow();
      await this.refreshMenuState();
    } catch (err) {
      console.error('🚨 Critical App Initialization Failed:', err);
    }
  }

  ngOnDestroy() {
    this.routerEventsSub?.unsubscribe();
  }

  isActiveMenuRoute(route: string): boolean {
    return this.currentUrl === route || this.currentUrl.startsWith(`${route}/`);
  }

  onMenuOpen() {
    this.storage.menuState$.next(true);
  }

  onMenuClose() {
    this.storage.menuState$.next(false);
  }

  async navigateFromMenu(route: string): Promise<void> {
    if (route === this.currentUrl) {
      await this.menuCtrl.close('global-menu');
      return;
    }
    this.storage.isNavigatingFromMenu = true;
    await this.menuCtrl.close('global-menu');

    if (route === '/company') {
      this.storage.previousPage = this.currentUrl;
    } else {
      this.storage.previousPage = undefined;
    }

    if (route === '/home') {
      this.storage.exitPage = route;
    }

    // Force PIN authentication ONLY when navigating from home page
    if (this.currentUrl === '/home' || this.currentUrl === '/' || this.currentUrl.startsWith('/home')) {
      this.storage.isPinAuthenticated = false;
    }

    await this.router.navigateByUrl(route);
    this.storage.isNavigatingFromMenu = false;
  }

  async logoutFromMenu(): Promise<void> {
    await this.menuCtrl.close('global-menu');

    const alert = await this.alertController.create({
      cssClass: 'logout-alert',
      header: this.storage.translate.instant('LOGOUT'),
      message: this.storage.translate.instant('ARE_YOU_LOGOUT'),
      buttons: [
        { text: this.storage.translate.instant('CANCEL'), role: 'cancel', cssClass: 'logout-cancel-button' },
        {
          text: this.storage.translate.instant('LOGOUT'),
          cssClass: 'logout-confirm-button',
          handler: async () => {
            this.storage.isNavigatingFromMenu = true;
            await this.storage.showLoading();
            try {
              await this.attservice.syncToOdoo();
              await this.storage.logoutCleanup();
              this.attservice.stopSyncing();

              this.storage.isAuthenticated = false;
              this.storage.isPinAuthenticated = false;
              this.odoo.uid = undefined;
              this.odoo.username = '';
              this.odoo.password = '';
              this.storage.currentEmployee = undefined;
              this.storage.exitPage = '/login';

              await this.router.navigateByUrl('/login', { replaceUrl: true });
            } catch (error) {
              console.error('Logout error', error);
            } finally {
              await this.storage.hideLoading();
              await this.refreshMenuState();
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private setupRouterMenuTracking(): void {
    this.currentUrl = this.router.url;
    this.routerEventsSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.currentUrl = this.router.url;
        void this.refreshMenuState();
      });
  }

  private canShowGlobalMenu(url: string): boolean {
    return ['/home', '/profile', '/employee-list', '/attendances', '/settings', '/company'].some(route => url.startsWith(route));
  }

  private async refreshMenuState(): Promise<void> {
    const credentialsJSON = await this.storage.getCredentials();
    this.currentUrl = this.router.url || this.currentUrl;
    this.isAdminUser = credentialsJSON?.is_admin_user === true;
    this.showGlobalMenu = this.canShowGlobalMenu(this.currentUrl);
    await this.menuCtrl.enable(this.showGlobalMenu, 'global-menu');

    if (!this.showGlobalMenu) {
      await this.menuCtrl.close('global-menu');
    }
  }

  private async applyStatusBarTheme(platform: string): Promise<void> {
    if (platform !== 'android' && platform !== 'ios') {
      return;
    }

    try {
      await StatusBar.setBackgroundColor({ color: '#388E3C' });
      await StatusBar.setStyle({ style: Style.Light });
    } catch (error) {
      console.warn('Unable to apply status bar theme', error);
    }
  }

  private async handleNavigationFlow() {
    let credentialsJSON: LocalCredentials = await this.storage.getCredentials();
    credentialsJSON = await this.storage.autoSelectSingleCompany(credentialsJSON) || credentialsJSON;
    const language = await this.storage.getLanguage();
    const targetLoginRoute = this.storage.resolveInitialLoginRoute(credentialsJSON);
    this.isPinSet = targetLoginRoute === '/login/pin';

    await lastValueFrom(this.storage.translate.use(language || 'en'));
    await this.storage.showLoading();

    if (credentialsJSON && this.storage.hasLocalAccountData(credentialsJSON)) {
      let licenseStatus = (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_license_status' }))).value;

      const refreshLicense = async () => {
        try {
          const remoteTenant = await this.odoo.fetchUpdatedTenantFromSubscription({
            email: credentialsJSON.login || undefined,
            tenant_db_name: credentialsJSON.db || undefined,
            company_name: credentialsJSON.companies?.[0]?.name || undefined
          });
          if (remoteTenant) {
            const newLicenseStatus = String(remoteTenant.license_status || '').trim().toLowerCase();
            const { Preferences } = await import('@capacitor/preferences');
            await Promise.all([
              Preferences.set({ key: 'config_license_status', value: newLicenseStatus }),
              Preferences.set({ key: 'config_provision_status', value: String(remoteTenant.status || remoteTenant.provision_step || '') }),
              Preferences.set({ key: 'config_trial_end_date', value: String(remoteTenant.trial_end_date || '') }),
              Preferences.set({ key: 'config_expiry_date', value: String(remoteTenant.license_expiry_date || '') })
            ]);

            if (newLicenseStatus === 'expired' && !this.router.url.includes('/login')) {
              this.storage.isAuthenticated = false;
              this.storage.isPinAuthenticated = false;
              this.router.navigateByUrl('/login/credentials');
            }
            return newLicenseStatus;
          }
        } catch (e) {
          console.log("Failed to refresh tenant status", e);
        }
        return licenseStatus;
      };

      if (String(licenseStatus || '').trim().toLowerCase() === 'expired') {
        licenseStatus = await refreshLicense();
      } else {
        refreshLicense();
      }

      if (String(licenseStatus || '').trim().toLowerCase() === 'expired') {
        console.log('License expired, redirecting to credentials login...');
        this.router.navigateByUrl('/login/credentials');
        this.storage.exitPage = '/login/credentials';
      } else {
        this.syncOdooCredentials(credentialsJSON);
        this.storage.isAuthenticated = true;
        if (this.storage.odoo.uid) {
          this.attservice.startSyncing();
        }
        this.router.navigateByUrl('/home');
        this.storage.exitPage = '/home';
      }
    } else {
      console.log('Redirecting to login...');
      this.router.navigateByUrl('/login');
      this.storage.exitPage = '/login';
    }

    await this.storage.hideLoading();
  }

  private syncOdooCredentials(creds: LocalCredentials) {
    this.odoo.baseUrl = creds.url;
    this.odoo.db = creds.db;
    this.odoo.username = creds.login;
    this.odoo.password = creds.password;
    this.odoo.uid = creds.uid;
    this.odoo.allowed_companies = creds.companies;
    this.odoo.is_internal_user = creds.is_internal_user !== false;
    this.odoo.is_admin_user = creds.is_admin_user === true;
    this.storage.selected_company = creds.selected_company;
  }

  private async setupNetworkListeners() {
    try {
      const status = await Network.getStatus();
      this.storage.isNetworkAvailable = status.connected;
    } catch (e) {
      this.storage.isNetworkAvailable = navigator['onLine'];
    }

    Network.addListener('networkStatusChange', async (status) => {
      console.log('🌐 Network Status Changed:', status.connected);
      const wasOffline = !this.storage.isNetworkAvailable;
      this.storage.isNetworkAvailable = status.connected;
      if (status.connected && wasOffline && this.odoo.uid) {
        await this.storage.handleLogin(true);
        await this.attservice.syncToOdoo();
      }
    });

    window.addEventListener('online', async () => {
      this.storage.isNetworkAvailable = true;
      if (this.odoo.uid) {
        await this.storage.handleLogin(true);
        await this.attservice.syncToOdoo();
      }
    });

    window.addEventListener('offline', () => {
      this.storage.isNetworkAvailable = false;
    });
  }

  private setupAppStateListeners() {
    App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) {
        console.log('📱 App backgrounded/minimised - checking network & triggering background sync...');
        try {
          const status = await Network.getStatus();
          this.storage.isNetworkAvailable = status.connected;
        } catch (e) {
          this.storage.isNetworkAvailable = navigator['onLine'];
        }

        if (this.storage.isNetworkAvailable) {
          try {
            const synced = await this.attservice.syncToOdoo();
            console.log('📱 Background sync result:', synced);
          } catch (err) {
            console.warn('📱 Background sync error:', err);
          }
        }
      }
    });
  }

  private setupBackButton() {
    this.platform.backButton.subscribeWithPriority(100, async () => {
      if (this.router.url.includes(this.storage.exitPage)) {
        const now = Date.now();
        if (now - this.lastBackPress < this.exitDelay) {
          if (this.storage.isNetworkAvailable) {
            await this.storage.showToast({
              message: 'Syncing data before exit...',
              duration: 2000,
              position: 'bottom',
              color: 'primary'
            });
            await this.attservice.syncToOdoo();
          }
          App.exitApp();
        } else {
          this.lastBackPress = now;
          await this.storage.showToast({
            message: this.storage.translate.instant('PRESS_BACK_EXIT'),
            duration: 2000,
            position: 'bottom',
            color: 'warning'
          });
        }
      } else {
        const topLevelPages = ['/profile', '/employee-list', '/attendances', '/settings', '/company'];
        const currentPath = this.router.url.split('?')[0];
        if (topLevelPages.includes(currentPath)) {
          this.navCtrl.navigateRoot('/home');
        } else {
          this.navCtrl.back();
        }
      }
    });
  }
}
