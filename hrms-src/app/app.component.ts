import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet, Platform, NavController, ModalController, AnimationController, Animation } from '@ionic/angular/standalone';
import { OdooJsonRpcService, } from './services/odoojsonrpc.service';
import { AttendanceService, EmployeeService, LocalCredentials, StorageService } from './services/storage.service';
import { App } from "@capacitor/app";
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
  loading = false
  isPinSet: boolean = false;
  urlWhenOnline = "";

  myCustomPageTransition = (baseEl: any, opts?: any): Animation => {
    const enteringEl = opts.enteringEl;
    const leavingEl = opts.leavingEl;

    const rootTransition = this.animationCtrl.create()
      // .duration(opts.duration || 300)
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
  ) { }
  private lastBackPress = 0;
  private exitDelay = 2000; // 2 seconds
  async ngOnInit() {
  const platform = Capacitor.getPlatform();

  try {
    // --- PHASE 1: DATABASE ENGINE BOOT ---
    if (platform === 'electron') {
// 🎯 SYNC REVERT FIX: 
    // Sync 'CapacitorCommunitySqlite'-nu per maathunaalum, 
    // namma manual-ah andha plugin-ah 'CapacitorSQLite' alias-kulla fix pannuroam.
    const Plugins = (Capacitor as any).Plugins;
    const sqlitePlugin = Plugins.CapacitorCommunitySqlite || Plugins.CapacitorSQLite;

    try {
      await jeepSqlite(window);
      const jeepEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepEl);
      await customElements.whenDefined('jeep-sqlite');

      // 🎯 Use the aliased plugin here
      const sqliteConnection = new SQLiteConnection(sqlitePlugin);
      await sqliteConnection.initWebStore();
      
      console.log("✅ Sync-proof engine is officially ALIVE");
    } catch (err) {
      console.error("❌ Logic failed:", err);
    }
    }

    // --- PHASE 2: DATABASE & ASSET INITIALIZATION ---
    // We call these ONLY after the engine (Phase 1) is guaranteed ready
    await this.storage.initializeDatabase();
    
    await Promise.all([
      this.storage.loadModels(),
      this.storage.initEmployeeTable(),
      this.storage.loadAudio()
    ]);
    console.log("📦 Assets and Tables Initialized");

    // --- PHASE 3: APP LOGIC & LISTENERS ---
    this.setupNetworkListeners();
    this.setupBackButton();

    // --- PHASE 4: AUTH & ROUTING ---
    await this.handleNavigationFlow();

  } catch (err) {
    console.error("🚨 Critical App Initialization Failed:", err);
    // Optional: Redirect to an error page or show a retry alert
  }
}

/**
 * Handles the logic for checking credentials and routing the user
 */
private async handleNavigationFlow() {
  let credentialsJSON: LocalCredentials = await this.storage.getCredentials();
  let language = await this.storage.getLanguage();
  this.isPinSet = credentialsJSON?.pin?.length > 0;

  await lastValueFrom(this.storage.translate.use(language || "en"));
  await this.storage.showLoading();

  if (credentialsJSON && credentialsJSON.uid) {
    this.syncOdooCredentials(credentialsJSON);

    if (credentialsJSON.pin.length === 0) {
      this.router.navigateByUrl("/pinsetup");
      this.storage.exitPage = "/pinsetup";
    } else if (!credentialsJSON.selected_company) {
      this.router.navigateByUrl("/company");
      this.storage.exitPage = "/company";
    } else {
      this.attservice.startSyncing();
      this.router.navigateByUrl("/home");
      this.storage.exitPage = "/home";
    }
  } else {
    console.log('Redirecting to login...');
    this.router.navigateByUrl("/login");
    this.storage.exitPage = "/login";
  }
  
  await this.storage.hideLoading();
}

/**
 * Maps local credentials to the Odoo service
 */
private syncOdooCredentials(creds: LocalCredentials) {
  this.odoo.baseUrl = creds.url;
  this.odoo.db = creds.db;
  this.odoo.username = creds.login;
  this.odoo.password = creds.password;
  this.odoo.uid = creds.uid;
  this.odoo.allowed_companies = creds.companies;
  this.storage.selected_company = creds.selected_company;
}

/**
 * Setup Online/Offline listeners
 */
private setupNetworkListeners() {
  this.storage.isNetworkAvailable = navigator['onLine'];
  
  window.addEventListener('online', async () => {
    console.log("🌐 Connection Restored");
    this.storage.isNetworkAvailable = true;
    if (this.odoo.uid) {
      await this.storage.handleLogin();
    }
  });

  window.addEventListener('offline', () => {
    console.log("🚫 Connection Lost");
    this.storage.isNetworkAvailable = false;
  });
}

/**
 * Handles hardware back button logic
 */
private setupBackButton() {
  this.platform.backButton.subscribeWithPriority(100, async () => {
    if (this.router.url.includes(this.storage.exitPage)) {
      const now = Date.now();
      if (now - this.lastBackPress < this.exitDelay) {
        App.exitApp();
      } else {
        this.lastBackPress = now;
        await this.storage.showToast({
          message: this.storage.translate.instant("PRESS_BACK_EXIT"),
          duration: 2000,
          position: 'bottom',
          color: "warning"
        });
      }
    } else {
      this.navCtrl.back();
    }
  });
}
}
