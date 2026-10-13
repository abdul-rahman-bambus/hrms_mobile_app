import { Subject } from "rxjs";
import { Injectable } from "@angular/core";
// 🎯 Step 1: New Imports
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from "@capacitor/core";
import { FaceRecognition } from 'capacitor-face-recognition-tflite';

export function calculateCosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

import { LoadingController, ToastController, ToastOptions } from '@ionic/angular/standalone';
import { OdooJsonRpcService } from "./odoojsonrpc.service";
import { GetResult, Preferences } from "@capacitor/preferences";
import { NativeAudio } from '@capgo/capacitor-native-audio'
import { Router } from "@angular/router";
import { Device } from "@capacitor/device"
import { App } from "@capacitor/app";
import { SpeakOptions, SpeechSynthesis } from "@capgo/capacitor-speech-synthesis";
import { TranslateService } from '@ngx-translate/core';
import { PluginListenerHandle } from "@capacitor/core";
import { BackgroundMode } from '@anuradev/capacitor-background-mode';
import { ElectronSqliteService } from './electron-sqlite.service';




// export const ForegroundService = registerPlugin<{
//   start(): Promise<void>;
//   stop(): Promise<void>;
//   addListener(
//     eventName: 'attendanceSync',
//     listenerFunc: () => void
//   ): Promise<{ remove: () => void }>;
// }>('ForegroundService');

// Define the structure for a standard Odoo JSON-RPC request
export interface UserStructure {
  user_id: number,
  employee_id: number,
  record_id: number,
  image_data: string
}

export interface LocalEmployees {
  id: number,
  display_name: string,
  image_1024: null | string,
  job_id: null | string,
  is_enrolled: 0 | 1,
  odoo_id: null | number,
  active: 0 | 1,
  employee_sync: 0 | 1,
  last_photo_update_time?: string,
  face_descriptor_sample?: string | null,
  track_employee?: boolean,
  work_schedule_json?: string
}


export interface LocalAttendance {
  id: number,
  employee_id: number,
  employee_name: string,
  check_in: string,
  check_out: string,
  checkin_address?: string | null,
  checkout_address?: string | null,
  out_mode?: string | null,
  display_check_in?: string,
  display_check_out?: string,
  display_worked_hours?: string,
  worked_hours: number,
  recognized_face_checkin: string | null,
  recognized_face_checkout: string | null,
  in_latitude: number | null,
  in_longitude: number | null,
  out_latitude: number | null,
  out_longitude: number | null,
  odoo_id: number | null,
  created_at: Date | string,
  create_date: string,
  write_date: string,
  synced: 0 | 1,
  attendance_client_id: string
}
interface OdooEmployeeData {
  id: number;
  display_name: string;
  image_1024: string; // Base64 string from Odoo
  // user_id: number;
  active: boolean
  odoo_id: number
}
export interface FaceDataStructure {

  "label": number;
  "descriptor": number[][];
  // "user_id": number;
  "employee_id": number;

}

export interface LocalCredentials {
  "url": string;
  "db": string;
  "login": string;
  "password": string;
  "pin": string;
  "sound": boolean;
  "check_in_delay": string;
  "check_out_delay": string;
  "uid": number | undefined;
  "selected_company": { id: number, name: string } | undefined;
  "companies": { id: number, name: string }[],
  "sync_delay": string,
  "current_employee_id"?: number;
  "is_internal_user"?: boolean;
  "is_admin_user"?: boolean;
  // "language":string
}

export type InitialLoginRoute = '/login/otp' | '/login/pin' | '/login/credentials';

// let db: SQLiteObject;
let dbPublic: SQLiteDBConnection;

export const convertToIST = (date: Date | null, forval: "display" | "system", att_log: boolean = false) => {
  if (!date) return "";
  // IST = UTC + 5:30
  const istOffset = 5.5 * 60; // minutes
  let localDate: Date = new Date();
  if (!att_log) {
    localDate = new Date(date.getTime() + istOffset * 60 * 1000);
  }
  else if (!att_log) {
    localDate = new Date(date.getTime());
  }


  const yyyy = localDate.getFullYear();
  const mm = String(localDate.getMonth() + 1).padStart(2, '0');
  const dd = String(localDate.getDate()).padStart(2, '0');
  const hh = String(localDate.getHours()).padStart(2, '0');
  const min = String(localDate.getMinutes()).padStart(2, '0');
  const ss = String(localDate.getSeconds()).padStart(2, '0');

  return (forval === 'display') ? `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}` : `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
};

export function durationToSeconds(str: string) {
  const matches = str.match(/(\d+)([hms])/gi);
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



const startBackgroundService = async () => {
  await BackgroundMode.disableWebViewOptimizations();

  await BackgroundMode.enable({ resume: true, silent: false, disableWebViewOptimization: true, channelName: "hrms.app" });





};



const stopBackgroundService = async () => {
  BackgroundMode.disable();
};





@Injectable({
  providedIn: 'root',

})
export class StorageService {
  constructor(
    public loadingCtrl: LoadingController,
    public odoo: OdooJsonRpcService,
    private toast: ToastController,
    private router: Router,
    public translate: TranslateService,
  ) {
    if (Capacitor.getPlatform() !== 'electron' && Capacitor.getPlatform() !== 'web') {
      this.setupAppStateListener();
    }



  }
  private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;
  private appStateListener: PluginListenerHandle | undefined;
  selected_company: { id: number, name: string } | undefined = undefined
  isAuthenticated = false;
  isNetworkAvailable = false;
  isPinAuthenticated = false;
  public menuState$ = new Subject<boolean>();
  isNavigatingFromMenu = false;
  is_pin_setup = false;//until first time enrollment
  exitPage = "/login"
  previousPage?: string;

  originalImg = new Image();
  // private db!: SQLiteObject;
  imageObj = new Image();
  selectedEmployee: any = undefined;
  currentEmployee: LocalEmployees | undefined = undefined;
  loader: HTMLIonLoadingElement | undefined;
  employee_filter_status: 'all' | 'enrolled' | 'not_enrolled' = 'not_enrolled';
  private profileRefreshInterval?: ReturnType<typeof setInterval>;
  private reusableCanvas: HTMLCanvasElement | null = null;

  private createEmptyCredentials(): LocalCredentials {
    return {
      url: '',
      db: '',
      login: '',
      password: '',
      pin: '',
      sound: true,
      check_in_delay: '30s',
      check_out_delay: '1m',
      uid: undefined,
      selected_company: undefined,
      companies: [],
      sync_delay: '15m',
      current_employee_id: undefined,
      is_internal_user: true,
      is_admin_user: false
    };
  }


  /**
   * 🎯 The "Secret Sauce" for Windows/Electron Support
   */
  // async initWebSQLite() {
  //   try {
  //     // 1. Initialize the jeep-sqlite custom elements
  //     await jeepSqlite(window);

  //     // 2. Create and append the <jeep-sqlite> element to the DOM
  //     // This element acts as the bridge between your code and the WASM engine
  //     const jeepEl = document.createElement('jeep-sqlite');
  //     document.body.appendChild(jeepEl);

  //     // 3. Wait for the component to be ready
  //     await customElements.whenDefined('jeep-sqlite');

  //     // 4. Initialize the web store (IndexedDB backed storage)
  //     await this.sqlite.initWebStore();

  //     console.log("✅ Electron SQLite Engine initialized successfully!");
  //   } catch (err) {
  //     console.error("❌ Failed to initialize Electron SQLite:", err);
  //   }
  // }

  // async ngOnInit():Promise<void> {
  //   const platform = Capacitor.getPlatform();
  //   console.log(`🚀 HMRS App starting on platform: ${platform}`);

  //   // 🎯 Step 3: Run Electron/Web specific initialization
  //   // if (platform === 'web' || platform === 'electron') {
  //   //   await this.initWebSQLite();
  //   // }
  // }


  async setupAppStateListener() {
    // Clear any existing listener first to prevent duplicates
    if (this.appStateListener) await this.appStateListener.remove();


    //worker flow

    //worker flow end

    this.appStateListener = await App.addListener("appStateChange", async (state) => {

      if (!state.isActive) {
        await startBackgroundService();
        this.stopProfileRefreshCron();
      } else {
        await stopBackgroundService();
        if (this.isNetworkAvailable && this.odoo.uid && !this.odoo.is_admin_user) {
          await this.syncCurrentEmployee();
        }
        this.startProfileRefreshCron();
      }
    });


  }

  startProfileRefreshCron() {
    this.stopProfileRefreshCron();
    this.profileRefreshInterval = setInterval(async () => {
      if (this.isNetworkAvailable && this.odoo.uid && !this.odoo.is_admin_user) {
        await this.syncCurrentEmployee();
      }
    }, 15000);
  }

  stopProfileRefreshCron() {
    if (this.profileRefreshInterval) {
      clearInterval(this.profileRefreshInterval);
      this.profileRefreshInterval = undefined;
    }
  }

  async showToast(msg: ToastOptions): Promise<void> {
    const toast: HTMLIonToastElement = await this.toast.create(msg);
    toast.present();

  }

  async handleLogin(silent = false): Promise<boolean> {
    if (!this.odoo.baseUrl || !this.odoo.username) {
      const credentialsJSON: LocalCredentials = await this.getCredentials();
      if (credentialsJSON) {
        this.odoo.baseUrl = credentialsJSON.url;
        this.odoo.db = credentialsJSON.db;
        this.odoo.username = credentialsJSON.login;
        this.odoo.password = credentialsJSON.password;
        this.odoo.uid = credentialsJSON.uid;
        this.selected_company = credentialsJSON.selected_company;
      }
    }

    if (!this.odoo.baseUrl) {
      return false;
    }

    let isAvailable = await this.odoo.pingOdooServer(this.odoo.baseUrl);
    console.log(isAvailable, "server avail", this.odoo.baseUrl);
    if (!isAvailable) {
      if (!silent) {
        this.showToast({
          message: this.translate.instant("SERVER_DOWN_MSG"),
          duration: 3000,
          color: 'danger',
          position: "top"
        });
      }
      return false;
    }

    console.log('run time auth. ')
    let login = await this.odoo.login();
    console.log(login, "logggggoiii")
    if ((typeof login) !== 'number' || login === 0) {

      this.odoo.uid = undefined;
      this.odoo.username = "";
      this.odoo.password = "";
      let credentialsJSON: LocalCredentials = await this.getCredentials();
      let lang = await this.getLanguage();
      if (credentialsJSON) {
        let data: LocalCredentials = {
          "url": credentialsJSON['url'],
          "db": credentialsJSON['db'],
          "login": '',
          "uid": undefined,
          "password": '',
          "pin": credentialsJSON['pin'],
          "sound": credentialsJSON['sound'],
          "check_in_delay": credentialsJSON['check_in_delay'],
          "check_out_delay": credentialsJSON['check_out_delay'],
          "selected_company": credentialsJSON.selected_company,
          "companies": credentialsJSON.companies,
          "sync_delay": credentialsJSON.sync_delay || "15m",
          "current_employee_id": credentialsJSON.current_employee_id,
          "is_internal_user": credentialsJSON.is_internal_user,
          "is_admin_user": credentialsJSON.is_admin_user,
          // "language":credentialsJSON.language || "en"
        }
        await this.setLanguage(lang);
        Preferences.set({
          "key": "credentials", "value": JSON.stringify(data)
        }).then(() => {
          this.exitPage = "/login"
          console.log(this.exitPage, 'exitpaaa')
          this.router.navigate(["/login"], { "queryParams": { "denied": true } })
        });
      }
      return false
    }
    this.isAuthenticated = true;
    this.startProfileRefreshCron();

    return this.isAuthenticated;
  }

  async showLoading(message: string = this.translate.instant("PLS_WAIT")) {
    if (this.loader) {
      await this.hideLoading(); // Ensure old one is dismissed
    }
    this.loader = await this.loadingCtrl.create({
      message,
      spinner: 'circular',
    });
    await this.loader.present();
  }

  async loadAudio() {
    await NativeAudio.configure({
      background: true  // Also enable background playback
    });
    NativeAudio.preload({
      assetId: "attendance",
      assetPath: "assets/hrms_audio.wav",
      audioChannelNum: 1,
      isUrl: false,
      volume: 1
    }).then(() => { console.log("loaded") }).catch((error) => { console.log(error, "err") });
  }

  private async getBootstrapCredentialSnapshot(): Promise<LocalCredentials | null> {
    const [
      configUrl,
      configDb,
      configUser,
      configPassword
    ] = await Promise.all([
      Preferences.get({ key: 'config_url' }),
      Preferences.get({ key: 'config_db' }),
      Preferences.get({ key: 'config_user' }),
      Preferences.get({ key: 'config_password' })
    ]);

    const url = String(configUrl.value || '').trim();
    const db = String(configDb.value || '').trim();
    const login = String(configUser.value || '').trim();
    const password = String(configPassword.value || '');

    if (!url && !db && !login && !password) {
      return null;
    }

    return {
      url,
      db,
      login,
      password,
      pin: '',
      sound: true,
      check_in_delay: '30s',
      check_out_delay: '1m',
      uid: undefined,
      selected_company: undefined,
      companies: [],
      sync_delay: '15m',
      current_employee_id: undefined,
      is_internal_user: true,
      is_admin_user: false
    };
  }

  async getCredentials(): Promise<LocalCredentials> {
    const creds = await Preferences.get({ key: 'credentials' });
    const credJson: LocalCredentials | null = creds.value ? JSON.parse(creds.value) : null;
    const bootstrapCredentials = await this.getBootstrapCredentialSnapshot();

    if (!credJson) {
      return bootstrapCredentials || this.createEmptyCredentials();
    }

    return {
      ...this.createEmptyCredentials(),
      ...bootstrapCredentials,
      ...credJson,
      url: String(credJson.url || bootstrapCredentials?.url || '').trim(),
      db: String(credJson.db || bootstrapCredentials?.db || '').trim(),
      login: String(credJson.login || bootstrapCredentials?.login || '').trim(),
      password: String(credJson.password || bootstrapCredentials?.password || '')
    };
  }

  hasLocalAccountData(credentials?: LocalCredentials | null): boolean {
    const credJson = credentials || null;
    if (!credJson) {
      return false;
    }

    return Boolean(
      credJson.uid ||
      credJson.login?.trim() ||
      credJson.password?.trim() ||
      credJson.url?.trim()
    );
  }

  resolveInitialLoginRoute(credentials?: LocalCredentials | null): InitialLoginRoute {
    const credJson = credentials || null;
    if (!this.hasLocalAccountData(credJson)) {
      return '/login/otp';
    }

    const hasPin = Boolean(credJson?.pin?.trim());
    return hasPin ? '/login/pin' : '/login/credentials';
  }

  async getLanguage() {
    let lang: GetResult = await Preferences.get({ "key": "language" });
    if (lang.value) {
      return lang.value
    }
    else {
      return ""
    }
  }

  async setLanguage(langVal: string) {
    await Preferences.set({ "key": "language", "value": langVal });
    return true;
  }

  async saveCredentials(credentials: LocalCredentials) {
    await Preferences.set({
      key: "credentials",
      value: JSON.stringify(credentials)
    });
  }

  async saveSelectedCompany(company: { id: number, name: string }, credentials?: LocalCredentials | null) {
    const credJson = credentials || await this.getCredentials();
    if (!credJson) return null;

    credJson.selected_company = company;
    this.selected_company = company;

    await this.saveCredentials(credJson);
    return credJson;
  }

  async autoSelectSingleCompany(credentials?: LocalCredentials | null) {
    const credJson = credentials || await this.getCredentials();
    if (!credJson) return null;

    if (credJson.is_internal_user === false) {
      return credJson;
    }

    if (!credJson.selected_company && credJson.companies?.length === 1) {
      return this.saveSelectedCompany(credJson.companies[0], credJson);
    }

    if (credJson.selected_company) {
      this.selected_company = credJson.selected_company;
    }

    return credJson;
  }

  async clearCurrentEmployee(credentials?: LocalCredentials | null) {
    const credJson = credentials || await this.getCredentials();
    this.currentEmployee = undefined;
    if (!credJson) return;

    credJson.current_employee_id = undefined;
    await this.saveCredentials(credJson);
  }

  async setCurrentEmployeeFromRecord(employee: any, credentials?: LocalCredentials | null) {
    const credJson = credentials || await this.getCredentials();
    const employeeId = Number(employee?.odoo_id ?? employee?.id);

    if (!employeeId || !credJson) {
      this.currentEmployee = undefined;
      return undefined;
    }

    credJson.current_employee_id = employeeId;
    await this.saveCredentials(credJson);
    return this.getCurrentEmployeeFromLocal(employeeId);
  }

  private getEmployeeCompanyId(employee: any): number {
    if (this.selected_company?.id) {
      return this.selected_company.id;
    }

    if (Array.isArray(employee?.company_id)) {
      return employee.company_id[0] || 0;
    }

    return employee?.company_id || 0;
  }

  async upsertEnrollmentDescriptor(employeeId: number, descriptor: number[][]): Promise<void> {
    const data = await Preferences.get({ key: "enrollments" });
    let enrolledUsers: FaceDataStructure[] = data.value ? JSON.parse(data.value) : [];
    const existingIndex = enrolledUsers.findIndex((user) => Number(user.employee_id) === employeeId);
    const descriptorPayload: FaceDataStructure = {
      employee_id: employeeId,
      descriptor,
      label: employeeId
    };

    if (existingIndex >= 0) {
      enrolledUsers[existingIndex] = {
        ...enrolledUsers[existingIndex],
        ...descriptorPayload
      };
    } else {
      enrolledUsers.push(descriptorPayload);
    }

    await Preferences.set({ key: "enrollments", value: JSON.stringify(enrolledUsers) });
  }

  private async removeEnrollmentDescriptor(employeeId: number): Promise<void> {
    const data = await Preferences.get({ key: "enrollments" });
    if (!data.value) {
      return;
    }

    const enrolledUsers: FaceDataStructure[] = JSON.parse(data.value);
    const filteredUsers = enrolledUsers.filter((user) => Number(user.employee_id) !== employeeId);
    await Preferences.set({ key: "enrollments", value: JSON.stringify(filteredUsers) });
  }

  async ensureEmployeeFaceDescriptorSample(employee: any, forceRefresh = false): Promise<LocalEmployees | undefined> {
    const employeeId = Number(employee?.odoo_id ?? employee?.id);

    if (!employeeId) {
      return this.getCurrentEmployeeFromLocal();
    }

    if (!forceRefresh && employee?.face_descriptor_sample) {
      return this.getCurrentEmployeeFromLocal(employeeId);
    }

    const imageData = employee?.image_1024;
    const companyId = this.getEmployeeCompanyId(employee);

    if (!imageData || imageData === "false") {
      await this.updateEmployee(
        { odoo_id: employeeId, company_id: companyId },
        { face_descriptor_sample: null }
      );
      await this.removeEnrollmentDescriptor(employeeId);
      return this.getCurrentEmployeeFromLocal(employeeId);
    }

    try {
      const descriptorSource = {
        ...employee,
        id: employee?.id ?? employeeId,
        odoo_id: employee?.odoo_id ?? employeeId,
        company_id: Array.isArray(employee?.company_id) ? employee.company_id : [companyId],
        image_1024: imageData
      };
      const descriptors = await this.generateLabeledDescriptors([descriptorSource], "offline");
      const descriptorSample = descriptors[0]?.descriptor;

      if (descriptorSample?.length) {
        await this.updateEmployee(
          { odoo_id: employeeId, company_id: companyId },
          { face_descriptor_sample: JSON.stringify(descriptorSample) }
        );
        await this.upsertEnrollmentDescriptor(employeeId, descriptorSample);
      }
    } catch (error) {
      console.error("Unable to generate face descriptor sample for current employee", error);
    }

    return this.getCurrentEmployeeFromLocal(employeeId);
  }

  async getCurrentEmployeeFromLocal(employeeId?: number): Promise<LocalEmployees | undefined> {
    const credJson = await this.getCredentials();
    const selectedCompanyId = this.selected_company?.id || credJson?.selected_company?.id;
    const targetEmployeeId = employeeId || credJson?.current_employee_id;
    const isPortalUser = credJson?.is_internal_user === false;

    if (!selectedCompanyId && !isPortalUser) return undefined;

    if (targetEmployeeId) {
      const result = selectedCompanyId
        ? await this.db.query(
          `SELECT * FROM employees WHERE odoo_id = ? AND company_id = ? LIMIT 1`,
          [targetEmployeeId, selectedCompanyId]
        )
        : await this.db.query(
          `SELECT * FROM employees WHERE odoo_id = ? LIMIT 1`,
          [targetEmployeeId]
        );

      if (result.values?.length) {
        this.currentEmployee = result.values[0] as LocalEmployees;
        return this.currentEmployee;
      }
    }

    const employees = await this.getAllEmployees();
    if (employees.length === 1) {
      this.currentEmployee = employees[0];
      await this.setCurrentEmployeeFromRecord(employees[0], credJson);
      return this.currentEmployee;
    }

    return undefined;
  }

  async syncCurrentEmployee(): Promise<LocalEmployees | undefined> {
    const credJson = await this.getCredentials();
    const selectedCompanyId = this.selected_company?.id || credJson?.selected_company?.id;
    const isPortalUser = credJson?.is_internal_user === false;

    if ((!selectedCompanyId && !isPortalUser) || !this.odoo.uid) {
      return this.getCurrentEmployeeFromLocal();
    }

    try {
      const domains = isPortalUser
        ? [[]]
        : [
          [["user_id", "=", this.odoo.uid], ["company_id", "=", selectedCompanyId]],
          [["user_id", "=", this.odoo.uid]]
        ];

      for (const domain of domains) {
        const employees = await this.odoo.getEmployees(domain);
        if (!Array.isArray(employees) || employees.length === 0) {
          continue;
        }

        const normalizedEmployees = employees.map((emp: any) => ({
          ...emp,
          is_enrolled: emp.is_enrolled ? 1 : 0
        }));

        await this.createOrUpdateEmployee(normalizedEmployees, false, true);

        const currentEmployee = selectedCompanyId
          ? normalizedEmployees.find((emp: any) => emp.company_id?.[0] === selectedCompanyId) || normalizedEmployees[0]
          : normalizedEmployees[0];

        await this.setCurrentEmployeeFromRecord(currentEmployee, credJson);
        return this.ensureEmployeeFaceDescriptorSample(currentEmployee, true);
      }
    } catch (error) {
      console.error('Unable to sync current employee', error);
    }

    return this.getCurrentEmployeeFromLocal();
  }

  async ensureCurrentEmployeeLoaded(): Promise<LocalEmployees | undefined> {
    const localEmployee = await this.getCurrentEmployeeFromLocal();
    if (localEmployee) {
      return this.ensureEmployeeFaceDescriptorSample(localEmployee);
    }

    if (this.isNetworkAvailable && this.odoo.uid) {
      return this.syncCurrentEmployee();
    }

    return undefined;
  }



  async playAudio(greet_text: string) {
    let credJson: LocalCredentials = await this.getCredentials();
    let language = await this.getLanguage();
    let localised_text = greet_text
    console.log(greet_text, "greet text")
    if (credJson && credJson.sound) {
      let options: SpeakOptions = {
        text: localised_text,
        language: (language !== "en") ? `${language}-IN` : "en-US",
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
      }
      console.log(options, "optiiii");
      SpeechSynthesis.cancel();
      SpeechSynthesis.speak(options);
      // NativeAudio.play({
      //   assetId: "attendance",
      //   time: 0

      // }).catch((err) => { console.log(err) }).then(() => {
      //   console.log("played ..")
      // });
    }

  }

  async hideLoading() {
    //console.log(this.loader, 'loaderr')
    if (this.loader) {
      await this.loader.dismiss();
      this.loader = undefined;
    }
  }


  async loadModels() {
    console.log('✅ capacitor-face-recognition-tflite native models ready.');
  }

  /**
    * 🎯 Step 3: Migrated Database Initialization
    */
  async initializeDatabase(): Promise<void> {
    if (this.db) {
      dbPublic = this.db;
      return;
    }

    if (Capacitor.getPlatform() === 'electron') {
      console.log('🖥️ Running in Electron - using IPC SQLite');
      const electronSqlite = new ElectronSqliteService();

      // Test the connection
      try {
        await electronSqlite.execute('HRMS', `
        CREATE TABLE IF NOT EXISTS test (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `);
        console.log('✅ Electron SQLite working!');
      } catch (error) {
        console.error('❌ Electron SQLite failed:', error);
      }
    } else {
      console.log('📱 Running on mobile - using Capacitor SQLite');
      // Your existing Capacitor SQLite code
    }

    try {
      const dbName = 'UserData';
      const isConsistent = await this.sqlite.checkConnectionsConsistency();
      const hasConnection = await this.sqlite.isConnection(dbName, false);

      if (isConsistent.result && hasConnection.result) {
        this.db = await this.sqlite.retrieveConnection(dbName, false);
      } else {
        this.db = await this.sqlite.createConnection(
          dbName,
          false,
          'no-encryption',
          1,
          false
        );
      }

      // Open the database
      await this.db.open();
      dbPublic = this.db;
      console.log('✅ SQLite Database opened successfully');

      await this.createTables();
    } catch (e) {
      console.error('❌ Error opening database:', e);
      throw e;
    }
  }

  private async createTables(): Promise<void> {
    const createAttendanceTableSQL = `
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        );
      `;

    try {
      // 🎯 Use .execute() for DDL (CREATE/ALTER)
      await this.db.execute(createAttendanceTableSQL);

      const attendance_table_fields = [
        { "field": "employee_id", "type": "INTEGER NOT NULL DEFAULT 0" },
        { "field": "employee_name", "type": "TEXT NOT NULL DEFAULT ''" },
        { "field": "check_in", "type": "TEXT" },
        { "field": "check_out", "type": "TEXT" },
        { "field": "out_mode", "type": "TEXT DEFAULT 'kiosk'" },
        { "field": "worked_hours", "type": "FLOAT" },
        { "field": "recognized_face_checkin", "type": "TEXT" },
        { "field": "recognized_face_checkout", "type": "TEXT" },
        { "field": "in_latitude", "type": "REAL" },
        { "field": "in_longitude", "type": "REAL" },
        { "field": "out_latitude", "type": "REAL" },
        { "field": "out_longitude", "type": "REAL" },
        { "field": "checkin_address", "type": "TEXT" },
        { "field": "checkout_address", "type": "TEXT" },
        { "field": "odoo_id", "type": "INTEGER" },
        { "field": "created_at", "type": "DATETIME" },
        { "field": "create_date", "type": "TEXT" },
        { "field": "write_date", "type": "TEXT" },
        { "field": "synced", "type": "INTEGER" },
        { "field": "company_id", "type": "INTEGER" },
        { "field": "attendance_client_id", "type": "TEXT" }
      ];

      for (let field of attendance_table_fields) {
        await this.addColumnIfNotExists(field.field, "attendance", field.type)
      }
    } catch (e) {
      console.error('Error creating table:', e);
      throw e;
    }
  }




  // async getAndDisplayPicture(): Promise<[]> {
  //   try {
  //     const query = 'SELECT * FROM users ';
  //     //console.log(db, "dbdbdb");

  //     // const result = await db.executeSql(query);
  //     const sqliteResult = await dbSqlite.execute(query);

  //     if (sqliteResult.rows.length > 0) {
  //       const cleanBase64Data = sqliteResult.rows;

  //       // Assuming the image is a JPEG (common for camera/gallery).
  //       // You might need to store the MIME type in a separate column if you handle multiple formats (PNG, GIF, etc.).
  //       // const imageSource = 'data:image/jpeg;base64,' + cleanBase64Data;

  //       // In your Ionic component (e.g., in TypeScript):
  //       // this.displayImageSrc = imageSource;

  //       return cleanBase64Data;
  //     }
  //     //console.log(result, "ressss")
  //     // if (result.rows.length > 0) {
  //     //   const cleanBase64Data = result.rows.item;

  //     //   // Assuming the image is a JPEG (common for camera/gallery).
  //     //   // You might need to store the MIME type in a separate column if you handle multiple formats (PNG, GIF, etc.).
  //     //   // const imageSource = 'data:image/jpeg;base64,' + cleanBase64Data;

  //     //   // In your Ionic component (e.g., in TypeScript):
  //     //   // this.displayImageSrc = imageSource;

  //     //   return cleanBase64Data;
  //     // }
  //     return [];
  //   } catch (error) {
  //     return [];
  //   }
  // }

  private reusableRotateCanvas?: HTMLCanvasElement;

  async rotateBase64Image(
    base64Image: string,
    angleDeg: number
  ): Promise<string> {
    if (!base64Image || angleDeg === 0) return base64Image;

    try {
      const blob = await (await fetch(
        `data:image/jpeg;base64,${base64Image}`
      )).blob();

      const bitmap = await createImageBitmap(blob);

      if (!this.reusableRotateCanvas) {
        this.reusableRotateCanvas = document.createElement("canvas");
      }
      const canvas = this.reusableRotateCanvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return base64Image;
      }

      const angleRad = (angleDeg * Math.PI) / 180;
      const absCos = Math.abs(Math.cos(angleRad));
      const absSin = Math.abs(Math.sin(angleRad));

      // Compute expanded canvas dimensions to fit the full rotated image without any clipping
      const newWidth = Math.round(bitmap.width * absCos + bitmap.height * absSin);
      const newHeight = Math.round(bitmap.width * absSin + bitmap.height * absCos);

      canvas.width = newWidth;
      canvas.height = newHeight;

      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, newWidth, newHeight);

      ctx.translate(newWidth / 2, newHeight / 2);
      ctx.rotate(angleRad);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      ctx.restore();

      const resultBase64 = canvas
        .toDataURL("image/jpeg", 0.95)
        .split(",")[1];

      bitmap.close();
      ctx.clearRect(0, 0, newWidth, newHeight);
      return resultBase64;
    } catch (e) {
      console.warn('rotateBase64Image error:', e);
      return base64Image;
    }
  }

  async straightenBase64Image(base64Image: string): Promise<string> {
    if (!base64Image) return base64Image;
    try {
      const detection = await FaceRecognition.detectFaces({ imageBase64: base64Image });
      if (!detection?.faces || detection.faces.length === 0) return base64Image;

      const mainFace = detection.faces.reduce((max, f) =>
        (f.width * f.height > max.width * max.height ? f : max), detection.faces[0]
      );

      const rollDeg = typeof mainFace.headEulerAngleZ === 'number' ? mainFace.headEulerAngleZ : 0;
      if (Math.abs(rollDeg) <= 4) return base64Image;

      return await this.rotateBase64Image(base64Image, rollDeg);
    } catch (e) {
      return base64Image;
    }
  }

  async logoutCleanup() {
    await this.appStateListener?.remove();
    this.appStateListener = undefined;
    this.stopProfileRefreshCron();
    // Clear any global image references
    this.originalImg.src = '';
    this.imageObj.src = '';
  }



  // async rotateBase64Image(img: any, base64Image: string, angleInp: number): Promise<string> {
  //   // const img = new Image();
  //   // You pass raw base64 — add prefix here
  //   img.src = `data:image/jpeg;base64,${base64Image}`;

  //   await new Promise((resolve, reject) => {
  //     img.onload = resolve;
  //     img.onerror = () => reject(new Error('Failed to load base image for rotation'));
  //   });

  //   const canvas = document.createElement('canvas');
  //   const ctx = canvas.getContext('2d');
  //   if (!ctx) return base64Image;

  //   const angle = angleInp * Math.PI / 180;

  //   // swap width/height for right-angle rotations
  //   if (Math.abs(angleInp) % 180 === 90) {
  //     canvas.width = img.height;
  //     canvas.height = img.width;
  //   } else {
  //     canvas.width = img.width;
  //     canvas.height = img.height;
  //   }

  //   // center and rotate
  //   ctx.translate(canvas.width / 2, canvas.height / 2);
  //   ctx.rotate(-angle);
  //   ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);

  //   // return *raw* base64 (no data: prefix)
  //   return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  // }

  /**
   * Resize a base64 image to the given width & height.
   * Returns a new base64 string (JPEG by default).
   */

  async resizeBase64Image(base64Str: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // 1. DYNAMIC RESIZING logic
        const MAX_WIDTH = 480;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_WIDTH) {
            width *= MAX_WIDTH / height;
            height = MAX_WIDTH;
          }
        }

        // 2. REUSABLE CANVAS logic - Creating canvas only if it doesn't exist
        if (!this.reusableCanvas) {
          this.reusableCanvas = document.createElement('canvas');
        }

        const canvas = this.reusableCanvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); // Performance optimization

        if (!ctx) {
          img.src = '';
          reject('Failed to get 2D context');
          return;
        }

        // Resetting canvas dimensions clears previous content
        canvas.width = width;
        canvas.height = height;

        ctx.filter = 'brightness(1.15) contrast(1.15) saturate(1.1)';
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 1);
          const result = resizedDataUrl.split(',')[1];
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          // Essential Cleanup:
          img.onload = null;
          img.onerror = null;
          img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="; // Clear memory

          // Don't set canvas.width=0 here if you want to reuse it, 
          // but clear the context to free pixels
          ctx.clearRect(0, 0, width, height);
        }
      };

      img.onerror = (err) => {
        img.src = '';
        reject(err);
      };

      if (base64Str.startsWith('data:')) {
        img.src = base64Str;
      } else {
        img.src = `data:image/jpeg;base64,${base64Str.replace(/\s/g, '')}`;
      }
    });
  }
  // async resizeBase64Image(base64Str: string): Promise<string> {
  //   return new Promise((resolve, reject) => {
  //     //console.log('promise')
  //     const img = new Image();
  //     img.onload = () => {

  //       const canvas = document.createElement('canvas');
  //       let width = 256;
  //       let height = 320;

  //       canvas.width = width;
  //       canvas.height = height;
  //       const ctx = canvas.getContext('2d');

  //       if (!ctx) {
  //         reject('Failed to get 2D context');
  //         return;
  //       }

  //       ctx.drawImage(img, 0, 0, width, height);

  //       try {
  //         const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8); // quality 0.8 (80%)
  //         resolve(resizedDataUrl.replace(/^data:image\/jpeg;base64,/, '')); // strip prefix if needed
  //       } catch (e) {
  //         reject(e);
  //       }
  //     };
  //     img.onerror = (err) => reject(err);
  //     img.src = `data:image/jpeg;base64,${base64Str}`;
  //   });
  // }



  async syncUsers() {

    let employee_sync = await this.loadingCtrl.create({
      message: this.translate.instant("SYNC_EMP_DATA"),
      cssClass: 'employee-sync',
      spinner: "circular",
      backdropDismiss: false,
      translucent: true
    }).then((loadingEl) => loadingEl);
    await employee_sync.present();
    //  this.debugMessage = 'getting employees'
    let employees = await this.odoo.getEmployees(); // bug path

    employees = employees.map((emp: any) => {
      emp.is_enrolled = (emp.is_enrolled) ? 1 : 0;
      return emp;
    })
    await this.createOrUpdateEmployee(employees);
    // employee_sync.dismiss();
    // let employees = [];
    //  this.debugMessage = 'generating samples';
    let descriptors = await this.generateLabeledDescriptors(employees, "online");
    Preferences.set({ "key": "enrollments", "value": JSON.stringify(descriptors) })
    //console.log(descriptors, "dessssc")
    //  this.debugMessage = ""
    //console.log(employees, 'employees')
    employee_sync.dismiss();
  }

  async warmUpModel() {
    console.log("✅ Native TFLite Model Warmed up and Ready!");
  }

  async generateLabeledDescriptors(employees: OdooEmployeeData[], mode: "online" | "offline"): Promise<FaceDataStructure[]> {
    const labeledDescriptors: FaceDataStructure[] = [];

    for (let employee of employees) {
      const label = (mode === "online") ? employee.id : employee.odoo_id;
      let base64String = employee.image_1024;
      if (!base64String || base64String === "false") continue;

      try {
        let resizedBase64 = await this.resizeBase64Image(base64String);
        const cleanBase64 = resizedBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, '');

        const featureInputBase64 = await this.straightenBase64Image(cleanBase64);
        const res = await FaceRecognition.extractFaceFeature({ imageBase64: featureInputBase64 });

        if (res && res.embedding && res.embedding.length > 0) {
          labeledDescriptors.push({
            label: label,
            descriptor: [res.embedding],
            employee_id: label
          });
        }
      } catch (error) {
        console.error('Error extracting face embedding for employee', label, error);
      }
    }
    return labeledDescriptors;
  }

  // async generateLabeledDescriptors(
  //   employees: OdooEmployeeData[], mode: "online" | "offline"
  // ): Promise<FaceDataStructure[]> {

  //   const labeledDescriptors: FaceDataStructure[] = [];
  //   const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.4 });

  //   const rotationAngles = [90, 180, 270];

  //   for (const employee of employees) {
  //     const label = (mode === "online") ? employee.id : employee.odoo_id;
  //     let base64String = ([false, "false"].includes(employee.image_1024) === true) ? "false" : employee.image_1024;



  //     try {
  //       const descriptorsForEmployee: Float32Array[] = [];



  //       let resizedBase64 = await this.resizeBase64Image(base64String);
  //       this.originalImg.src = `data:image/jpeg;base64,${resizedBase64}`;
  //       await new Promise((resolve, reject) => {
  //         this.originalImg.onload = resolve;
  //         this.originalImg.onerror = () => reject(new Error(`Failed to load base image for ${label}`));
  //       });
  //       let originalDetection = await faceapi
  //         .detectSingleFace(this.originalImg, detectionOptions)
  //         .withFaceLandmarks()
  //         .withFaceDescriptor();

  //       if (originalDetection?.descriptor?.length === 128) {

  //         descriptorsForEmployee.push(originalDetection.descriptor);
  //       }


  //       if (descriptorsForEmployee.length > 0) {

  //         labeledDescriptors.push({
  //           label: (mode === "online") ? employee.id : employee.odoo_id,
  //           descriptor: descriptorsForEmployee.map(d => Array.from(d)), // store as array of numbers
  //           employee_id: (mode === "online") ? employee.id : employee.odoo_id,
  //         });
  //       } else {
  //         console.warn(`⚠️ No valid descriptors found for ${label}.`);
  //       }
  //     } catch (error) {
  //       console.error(`Error processing employee ${label}:`, error);
  //     }
  //   }

  //   return labeledDescriptors;
  // }



  async addColumnIfNotExists(column: string, table: string, field_type: string): Promise<void> {
    // 🎯 Use .query() for PRAGMA/SELECT
    const res = await this.db.query(`PRAGMA table_info(${table})`);

    // Community SQLite returns data in .values instead of .rows
    let exists = res.values?.some((col: any) => col.name === column);

    if (!exists) {
      await this.db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${field_type}`);
      if (["attendance_client_id", "odoo_id"].includes(column)) {
        await this.db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table}(${column})`);
      }
      console.log(`Column ${column} added.`);
    }
  }

  /** Initialize SQLite database */
  async initEmployeeTable() {
    try {
      // db = await SQLite.create({
      //   name: this.dbName,
      //   location: 'default'
      // });

      // await db.executeSql(
      //   `CREATE TABLE IF NOT EXISTS employees (
      //     id INTEGER PRIMARY KEY AUTOINCREMENT
      //   );
      //   `,
      //   []
      // );
      await this.db.query(
        `CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        );
        `,
        []
      );
      const employee_table_fields: { field: string; type: string; }[] = [
        {
          "field": "display_name",
          "type": "TEXT"
        },
        {
          "field": "image_1024",
          "type": "TEXT"
        },
        {
          "field": "job_id",
          "type": "TEXT"
        },
        {
          "field": "is_enrolled",
          "type": "INTEGER"
        },
        {
          "field": "odoo_id",
          "type": "INTEGER"
        },
        {
          "field": "active",
          "type": "INTEGER"
        },
        {
          "field": "employee_sync",
          "type": "INTEGER"
        },
        {
          "field": "last_photo_update_time",
          "type": "TEXT"
        },
        {
          "field": "face_descriptor_sample",
          "type": "TEXT"
        },
        {
          "field": "employee_id",
          "type": "INTEGER"
        },
        {
          "field": "company_id",
          "type": "INTEGER"
        },
        {
          "field": "track_employee",
          "type": "INTEGER"
        },
        {
          "field": "work_schedule_json",
          "type": "TEXT"
        }
      ]
      for (let field of employee_table_fields) {
        await this.addColumnIfNotExists(field.field, "employees", field.type)
      }


      // let last_photo_update_time = await this.addColumnIfNotExists("last_photo_update_time")
      // console.log(last_photo_update_time, "lassst photo coloumn")
      //console.log('SQLite DB initialized');
    } catch (err) {
      console.error('Error initializing DB:', err);
    }
  }

  // /** Fetch employee data from Odoo (example JSON-RPC) */
  // async fetchEmployeesFromOdoo(): Promise<void> {


  //   try {
  //     const response = await this.odoo.getEmployees();
  //     //console.log(response, "ressssp")
  //     const employees = response?.result || [];

  //     // Save all employees locally

  //       await this.createOrUpdateEmployee(employees);


  //     //console.log(`Fetched and saved ${employees.length} employees from Odoo`);
  //   } catch (err) {
  //     console.error('Error fetching from Odoo:', err);
  //   }
  // }

  /** Create or Update an employee */
  async createOrUpdateEmployee(emparr: any[], update = false, forceSync = false) {
    if (!emparr || emparr.length === 0) return true;
    if (!this.db) await this.initEmployeeTable();

    if (!update && !forceSync) {
      emparr = emparr.map((em) => { em['odoo_id'] = undefined; return em });
    }

    let isTransaction = false;
    try {
      const activeCheck = (await this.db.isTransactionActive())?.result === true;
      if (activeCheck) {
        try {
          await this.db.rollbackTransaction();
        } catch (e) {
          console.warn('Cleaned up dangling transaction:', e);
        }
      }
      if (emparr.length > 1) {
        await this.db.beginTransaction();
        isTransaction = true;
      }
    } catch (tErr) {
      console.warn('Could not begin transaction, falling back to non-transactional sync:', tErr);
      isTransaction = false;
    }

    try {
      for (let emp of emparr) {
        const companyId = this.getEmployeeCompanyId(emp);
        let query = (update === true) ? `SELECT * FROM employees WHERE id = ? and company_id = ?` : `SELECT * FROM employees WHERE odoo_id = ? and company_id = ?`;

        const existing = await this.db.query(query, [emp.id, companyId]);

        if (existing.values && existing.values.length > 0) {
          let exist = existing.values[0]['last_photo_update_time'] != null ? existing.values[0]['last_photo_update_time'].toString() : "";
          let localtimestamp = existing.values[0]['last_photo_update_time'] ? (new Date(exist)).getTime() : 0, remotetimestamp = new Date(emp.last_photo_update_time).getTime();

          if (forceSync || (!update && remotetimestamp > localtimestamp)) {
            await this.updateEmployee(emp); // getting updtes through manual sync 
          }
          else if (update) {
            const today: Date = new Date();
            await this.updateEmployee(emp, { "image_1024": emp.image_1024, "is_enrolled": 1, "employee_sync": 0, "last_photo_update_time": today.toISOString().replace("T", " ").replace("Z", "").split(".")[0] });
          }
        } else {
          if (!this.selected_company || emp.company_id?.[0] === this.selected_company?.id) {
            await this.createEmployee(emp);
          }
        }
      }

      if (isTransaction) {
        try {
          const isTransActive = (await this.db.isTransactionActive())?.result === true;
          if (isTransActive) {
            await this.db.commitTransaction();
          }
        } catch (cErr) {
          console.warn('Could not commit SQLite transaction:', cErr);
        }
      }
    } catch (err) {
      if (isTransaction) {
        try {
          const isTransActive = (await this.db.isTransactionActive())?.result === true;
          if (isTransActive) {
            await this.db.rollbackTransaction();
          }
        } catch (rErr) {
          console.warn('Could not rollback SQLite transaction:', rErr);
        }
      }
      throw err;
    }
    return true;
  }

  async createEmployee(emp: any) {
    const sql = `INSERT INTO employees (display_name, image_1024, job_id, active, odoo_id, is_enrolled, employee_sync, company_id, track_employee, work_schedule_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      emp.display_name,
      emp.image_1024 || 'false',
      emp.job_id[1],
      emp.active ? 1 : 0,
      emp.id,
      emp.is_enrolled,
      1,
      emp.company_id[0],
      emp.track_employee ? 1 : 0,
      emp.work_schedule_json || "{}"
    ];
    return await this.db.run(sql, params, false);
  }

  /** Update existing employee */
  async updateEmployee(emp: any, data: any | undefined = undefined) {
    let query = `UPDATE employees SET`, subparams = '', params: any[] = [];
    let first = true;
    if (data) {
      for (let field in data) {
        let par = first ? `${field}=?` : `,${field}=?`;
        subparams = `${subparams} ${par}`;
        first = false;
        params.push(data[field]);
      }
    } else {
      const jobIdVal = Array.isArray(emp["job_id"]) ? emp["job_id"][1] : (emp["job_id"] || '');
      subparams = ` display_name=?,active=?,image_1024=?,job_id=?,is_enrolled=?,last_photo_update_time=?,track_employee=?,work_schedule_json=?`;
      params = [
        emp["display_name"],
        `${emp["active"]}`,
        emp["image_1024"] ? emp["image_1024"] : "false",
        jobIdVal,
        emp['is_enrolled'] ? 1 : 0,
        emp["last_photo_update_time"],
        emp["track_employee"] ? 1 : 0,
        emp["work_schedule_json"] || "{}"
      ];
    }

    const companyId = this.getEmployeeCompanyId(emp) || this.selected_company?.id || 0;
    const empOdooId = emp.odoo_id ?? emp.id;
    const empLocalId = emp.id ?? emp.odoo_id;

    query = `${query} ${subparams} WHERE (odoo_id = ? OR id = ?)`;
    params.push(empOdooId, empLocalId);

    if (companyId) {
      query += ` AND (company_id = ? OR company_id IS NULL OR company_id = 0)`;
      params.push(companyId);
    }

    await this.db.query(query, params);
  }

  /** Delete employee */
  async deleteEmployee(odooId: number) {
    //need another logic. get all ids from remote. check all odoo ids. compare. If id present in local not present in remote, then delete.
    // return db!.executeSql(`DELETE FROM employees WHERE odoo_id = ?`, [odooId]);
    return this.db.query(`DELETE FROM employees WHERE odoo_id = ?`, [odooId]);
  }

  async getAllEmployees(): Promise<LocalEmployees[]> {
    const company_id = this.selected_company?.id;
    const result = company_id
      ? await this.db.query(`SELECT * FROM employees WHERE company_id = ?`, [company_id])
      : await this.db.query(`SELECT * FROM employees`);
    return result.values || [];
  }

  /** Clear all local employees */
  async clearEmployees() {
    // return db!.executeSql(`DELETE FROM employees`, []);
    return this.db.query(`DELETE FROM employees`, []);
  }



}



@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  // private dbInstance: SQLiteObject | null = null;
  private dbName: string = 'employees';

  constructor(
    private odoo: OdooJsonRpcService,
  ) {
    // this.initDB();
  }




}



@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private _isSyncingToOdoo = false;
  constructor(
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private router: Router,
  ) {
    // this.startSyncing();
    Device.getId().then((device) => {
      this.deviceUUID = device.identifier;
    })
  }
  cronObj: NodeJS.Timeout | undefined;
  deviceUUID: string = "";
  private worker: Worker | null = null;

  private createAttendanceClientId(localId?: number | string): string {
    const deviceId = this.deviceUUID || 'device';
    const localPart = localId ? `_${localId}` : '';
    return `${deviceId}_${Date.now()}${localPart}_${Math.floor(Math.random() * 1000000)}`;
  }

  async syncOldAttendances() {
    // if (!this.storage.isAuthenticated) {
    //   let login = await this.odoo.login();
    //   if ((typeof login) === "number") {
    //     this.storage.isAuthenticated = true;
    //   }
    // }

    const attendanceSelectQuery = `
      SELECT * FROM attendance
     WHERE check_out is null and odoo_id is not null  and company_id = ?
    `;
    let old_attendances = []
    // const rs = await db?.executeSql(attendanceSelectQuery, [this.storage.selected_company?.id]);
    let selected_company = (this.storage.selected_company?.id) ? this.storage.selected_company?.id : 0;
    const rs = await dbPublic?.query(attendanceSelectQuery, [selected_company]);
    console.log(rs, "rsrsss")
    if (rs?.values && rs?.values?.length > 0) {
      for (let i = 0; i <= rs?.values.length - 1; i++) {
        let item = rs?.values[i];
        old_attendances.push(item);
      }
      console.log(old_attendances, "odoo records")
      let odoo_record = await this.odoo.getAttendance([['id', 'in', old_attendances.map((old) => old['odoo_id'])]])
      console.log(odoo_record, "local records")
      if (odoo_record.length > 0) {
        for (let rec of odoo_record) {
          let updateQuery = `
          UPDATE attendance
          set check_out= ?, out_mode = ?, recognized_face_checkout= ?,out_latitude = ?, out_longitude = ?, checkin_address = ?, checkout_address = ? where odoo_id= ? and company_id= ? and attendance_client_id= ?
          `;
          const rs = await dbPublic?.query(updateQuery, [
            !rec.check_out ? null : rec.check_out,
            rec.out_mode ?? (rec.check_out ? 'kiosk' : null),
            !rec.recognized_face_checkout ? null : rec.recognized_face_checkout,
            rec.out_latitude ?? null,
            rec.out_longitude ?? null,
            rec.checkin_address ?? null,
            rec.checkout_address ?? null,
            rec.id,
            this.storage.selected_company?.id,
            rec.attendance_client_id
          ]);
        }
      }

    }


  }

  async startSyncing() {
    //check if any record thats not checked out and update manually.
    console.log('syncinggggg', this.storage.isNetworkAvailable && this.odoo.uid)
    if (this.storage.isNetworkAvailable && this.odoo.uid) {
      let loginval = await this.storage.handleLogin();
      console.log(loginval, 'out')
      if (loginval) {
        console.log(loginval, 'loginvalllll')
        await this.syncOldAttendances();
      }



    }
    this.cron();

    // setInterval(() => {
    //   console.log(this.odoo.uid, this.storage.isNetworkAvailable, "valsss")
    //   if (this.storage.isNetworkAvailable && this.odoo.uid) {
    //     this.checkCredentialsCron();
    //   }
    // }, 10000)
  }

  public stopSyncing() {
    if (this.cronObj) {
      clearInterval(this.cronObj);
      this.cronObj = undefined;
      console.log("Sync Cron Stopped");
    }
  }

  async cron() {
    let cred = await this.storage.getCredentials();
    this.stopSyncing();

    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('sync.worker.ts', import.meta.url));

      // 3. Listen for the 'TICK' from the worker
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'TICK') {
          this.syncToOdoo();
        }
      };

      // 4. Tell the worker to start the 30s timer
      this.worker.postMessage({ action: 'start', interval: durationToSeconds(cred.sync_delay || "15m") * 1000 });
    }


    // this.cronObj = setInterval(async () => {
    //   console.log("cron running");
    //   if (this.storage.isNetworkAvailable && this.odoo.uid) {
    //     await this.syncToOdoo();
    //   }
    // }, durationToSeconds(cred.sync_delay || "15m") * 1000)
  }





  private _syncPromise: Promise<boolean> | null = null;

  async syncToOdoo(): Promise<boolean> {
    if (!this.storage.isNetworkAvailable) return false;

    if (this._syncPromise) {
      console.log('SyncToOdoo already in progress, waiting...');
      return this._syncPromise;
    }

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        console.warn('syncToOdoo timed out after 15 seconds');
        resolve(false);
      }, 15000);
    });

    this._syncPromise = Promise.race([
      this._syncToOdooInternal(),
      timeoutPromise
    ]).finally(() => {
      this._syncPromise = null;
    });

    return this._syncPromise;
  }

  private async _syncToOdooInternal(): Promise<boolean> {
    const loginval = await this.storage.handleLogin(true);
    console.log(loginval, "logval");
    if (!loginval) return false;

    const selected_company = (this.storage.selected_company?.id) ? this.storage.selected_company?.id : 0;

    // 1. Fetch data from SQLite
    const employeeSelectQuery = `SELECT * FROM employees WHERE employee_sync=0 AND company_id = ?`;
    const attendance_select_null_query = `SELECT * FROM attendance WHERE synced=0 AND odoo_id IS NULL AND company_id = ?`;
    const attendance_select_not_null_query = `SELECT * FROM attendance WHERE synced=0 AND odoo_id IS NOT NULL AND company_id = ?`;

    const [employee_rs, attendance_null_rs, attendance_not_null_rs] = await Promise.all([
      dbPublic?.query(employeeSelectQuery, [selected_company]),
      dbPublic?.query(attendance_select_null_query, [selected_company]),
      dbPublic?.query(attendance_select_not_null_query, [selected_company])
    ]);

    // 2. Safety check: Exit if no results or database is disconnected
    if (!employee_rs?.values || !attendance_null_rs?.values || !attendance_not_null_rs?.values) return false;

    if (attendance_null_rs.values.length === 0 &&
      attendance_not_null_rs.values.length === 0 &&
      employee_rs.values.length === 0) {
      return true;
    }

    // 3. Payload Construction using Bracket Notation to satisfy Index Signature
    let unsynced_new: any[] = [];
    let unsynced_old: any[] = [];
    let unsynced_employees_push_data: any[] = [];

    // Process New Attendances (odoo_id is null)
    for (let i = 0; i < attendance_null_rs.values.length; i++) {
      const row = attendance_null_rs.values[i];
      let attendanceClientId = row['attendance_client_id'];
      if (!attendanceClientId) {
        attendanceClientId = this.createAttendanceClientId(row['id']);
        await dbPublic?.query(
          `UPDATE attendance SET attendance_client_id = ? WHERE id = ? AND company_id = ?`,
          [attendanceClientId, row['id'], selected_company]
        );
        row['attendance_client_id'] = attendanceClientId;
      }

      unsynced_new.push({
        "odoo_id": null,
        "employee_id": row['employee_id'],
        "company_id": selected_company,
        "check_in": row['check_in'],
        "check_out": row['check_out'],
        "in_mode": "kiosk",
        "out_mode": row['out_mode'] || "kiosk",
        "recognized_face_checkin": row['recognized_face_checkin'],
        "recognized_face_checkout": row['recognized_face_checkout'],
        "in_latitude": row['in_latitude'],
        "in_longitude": row['in_longitude'],
        "out_latitude": row['out_latitude'],
        "out_longitude": row['out_longitude'],
        "checkin_address": row['checkin_address'],
        "checkout_address": row['checkout_address'],
        "attendance_client_id": attendanceClientId
      });
    }

    // Process Existing Attendances (odoo_id is not null)
    for (let i = 0; i < attendance_not_null_rs.values.length; i++) {
      const row = attendance_not_null_rs.values[i];
      unsynced_old.push({
        "odoo_id": row['odoo_id'],
        "employee_id": row['employee_id'],
        "company_id": selected_company,
        "check_in": row['check_in'],
        "check_out": row['check_out'],
        "in_mode": "kiosk",
        "out_mode": row['out_mode'] || "kiosk",
        "recognized_face_checkin": row['recognized_face_checkin'],
        "recognized_face_checkout": row['recognized_face_checkout'],
        "in_latitude": row['in_latitude'],
        "in_longitude": row['in_longitude'],
        "out_latitude": row['out_latitude'],
        "out_longitude": row['out_longitude'],
        "checkin_address": row['checkin_address'],
        "checkout_address": row['checkout_address'],
        "attendance_client_id": row['attendance_client_id']
      });
    }

    // Process Employee Updates
    for (let i = 0; i < employee_rs.values.length; i++) {
      const row = employee_rs.values[i];
      unsynced_employees_push_data.push({
        "odoo_id": row['odoo_id'],
        "company_id": selected_company,
        "image_1024": row['image_1024'],
        "image_128": row['image_1024'],
        "image_256": row['image_1024'],
        "image_512": row['image_1024'],
        "image_1920": row['image_1024'],
        "is_enrolled": row['is_enrolled'] === 1,
        "last_photo_update_time": row['last_photo_update_time']
      });
    }

    // 3.5 Proactive Auto-checkout of old open attendances
    if (unsynced_new.length > 0) {
      const employeeIdsToCheck = [...new Set(unsynced_new.map(a => a.employee_id))];
      try {
        const openAttendances = await this.odoo.getAttendance([
          ['employee_id', 'in', employeeIdsToCheck],
          ['check_out', '=', false]
        ]);
        if (openAttendances && openAttendances.length > 0) {
          const todayDate = new Date();
          const todayStr = todayDate.toISOString().split('T')[0];

          for (let oa of openAttendances) {
            if (!oa.check_in) continue;
            const checkInDate = oa.check_in.split(' ')[0];
            if (checkInDate < todayStr) {
              let checkOutStr = oa.expected_checkout_time;
              if (!checkOutStr) {
                // Fallback to 9 hours if expected_checkout_time is not available
                let ciDate = new Date(oa.check_in + 'Z');
                ciDate.setHours(ciDate.getHours() + 9);
                if (ciDate > todayDate) {
                  ciDate = new Date();
                }
                checkOutStr = ciDate.toISOString().replace('T', ' ').substring(0, 19);
              }

              unsynced_old.push({
                "odoo_id": oa.id,
                "employee_id": Array.isArray(oa.employee_id) ? oa.employee_id[0] : oa.employee_id,
                "company_id": selected_company,
                "check_out": checkOutStr,
                "out_mode": "kiosk"
              });
            }
          }
        }
      } catch (err) {
        console.warn("Failed to check open attendances:", err);
      }
    }

    // 4. Sync to Odoo
    try {
      const sync_vals = await this.odoo.syncOfflineData(unsynced_new, unsynced_old, unsynced_employees_push_data, selected_company);

      if (!sync_vals) {
        console.error("Sync to Odoo failed: sync_vals is undefined. Returning false.");
        return false;
      }

      const newIdsByClientId = sync_vals.new_attendance_ids_by_client_id || {};
      const fallbackNewIds = sync_vals.new_attendance_ids || [];
      const canUseFallbackIds =
        Object.keys(newIdsByClientId).length === 0 &&
        fallbackNewIds.length === attendance_null_rs.values.length;
      const deleted_ids = sync_vals.deleted_attendance_ids || [];
      let allNewAttendancesAcknowledged = true;

      // 5. Database Cleanup - DELETE
      if (deleted_ids.length > 0) {
        // Use join to create string for 'IN' clause: "1,2,3"
        const deleteQuery = `DELETE FROM attendance WHERE odoo_id IN (${deleted_ids.join(',')}) AND company_id = ?`;
        await dbPublic?.query(deleteQuery, [selected_company]);
      }

      // 6. Database Cleanup - UPDATE NEW
      for (let i = 0; i < attendance_null_rs.values.length; i++) {
        const localAttendance = attendance_null_rs.values[i];
        const serverAttendanceId =
          newIdsByClientId[localAttendance['attendance_client_id']] ||
          (canUseFallbackIds ? fallbackNewIds[i] : null);
        if (!serverAttendanceId) {
          allNewAttendancesAcknowledged = false;
          console.warn('Odoo did not acknowledge attendance', localAttendance['attendance_client_id']);
          continue;
        }
        const updateQuery = `UPDATE attendance SET synced=1, odoo_id = ? WHERE id = ? AND company_id = ?`;
        await dbPublic?.query(updateQuery, [serverAttendanceId, localAttendance['id'], selected_company]);
      }

      // 7. Database Cleanup - UPDATE OLD
      for (let i = 0; i < attendance_not_null_rs.values.length; i++) {
        const updateQuery = `UPDATE attendance SET synced=1 WHERE id = ? AND company_id = ?`;
        await dbPublic?.query(updateQuery, [attendance_not_null_rs.values[i]['id'], selected_company]);
      }

      // 8. Database Cleanup - UPDATE EMPLOYEES
      if (employee_rs.values.length > 0) {
        const unsynced_employee_ids = employee_rs.values.map((emp: any) => emp['odoo_id']).join(',');
        const employee_sync_query = `UPDATE employees SET employee_sync=1 WHERE odoo_id IN (${unsynced_employee_ids}) AND company_id = ?`;
        await dbPublic?.query(employee_sync_query, [selected_company]);
      }

      return allNewAttendancesAcknowledged;
    } catch (e) {
      console.error("Sync process failed:", e);
      return false;
    } finally {
      // Memory cleanup for Garbage Collector
      (unsynced_new as any) = null;
      (unsynced_old as any) = null;
      (unsynced_employees_push_data as any) = null;
    }
  }


  // async syncToOdoo() {

  //   // if (!this.storage.isAuthenticated) {
  //   //   let login=await this.odoo.login();
  //   //   if((typeof login)==='number'){
  //   //     this.storage.isAuthenticated=true;
  //   //   }

  //   // }
  //   // employee sync start




  //   let loginval = await this.storage.handleLogin();
  //   console.log(loginval, "logval")
  //   if (!loginval) {
  //     return
  //   }

  //   const employeeSelectQuery = `
  //     SELECT * FROM employees
  //     WHERE employee_sync=0  and company_id = ?
  //   `;
  //   // const employee_rs = await db?.executeSql(employeeSelectQuery, [this.storage.selected_company?.id]);
  //   let selected_company = (this.storage.selected_company?.id) ? this.storage.selected_company?.id : 0;
  //   const employee_rs = await dbSqlite?.execute(employeeSelectQuery, [selected_company]);
  //   //attendance syncing block start
  //   const attendance_select_null_query = `
  //     SELECT * FROM attendance
  //     WHERE synced=0 and odoo_id is null  and company_id = ?
  //   `;
  //   const attendance_select_not_null_query = `
  //     SELECT * FROM attendance
  //     WHERE synced=0 and odoo_id is not null and company_id = ?
  //   `;
  //   console.log(this.storage.selected_company?.id, "company")
  //   // const attendance_null_rs = await db?.executeSql(attendance_select_null_query, [this.storage.selected_company?.id]);
  //   const attendance_null_rs = await dbSqlite?.execute(attendance_select_null_query, [selected_company]);
  //   // const attendance_not_null_rs = await db?.executeSql(attendance_select_not_null_query, [this.storage.selected_company?.id]);
  //   const attendance_not_null_rs = await dbSqlite?.execute(attendance_select_not_null_query, [selected_company]);
  //   console.log(attendance_not_null_rs, attendance_null_rs, "attss")
  //   if (attendance_null_rs?.rows.length > 0 || attendance_not_null_rs?.rows.length > 0 || employee_rs?.rows.length > 0) {
  //     let unsynced_attendances: LocalAttendance[] = [], unsynced_new: {
  //       odoo_id: number | null;
  //       employee_id: number;
  //       check_in: string;
  //       check_out: string;
  //       recognized_face_checkin: string | null;
  //       recognized_face_checkout: string | null;
  //       attendance_client_id: string | null;

  //     }[] = [], unsynced_old: {
  //       odoo_id: number | null;
  //       employee_id: number;
  //       check_in: string;
  //       check_out: string;
  //       recognized_face_checkin: string | null;
  //       recognized_face_checkout: string | null;
  //       attendance_client_id: string | null;
  //     }[] = [];
  //     let attendance_null_rs_unknown = attendance_null_rs.rows as unknown as LocalAttendance[];
  //     let attendance_not_null_rs_unknown = attendance_not_null_rs.rows as unknown as LocalAttendance[];
  //     let employee_rs_unknown = employee_rs.rows as unknown as any[];
  //     for (let i = 0; i <= attendance_null_rs_unknown.length - 1; i++) {
  //       let item = attendance_null_rs_unknown[i];
  //       unsynced_attendances.push(item);
  //     }
  //     for (let i = 0; i <= attendance_not_null_rs_unknown.length - 1; i++) {
  //       let item = attendance_not_null_rs_unknown[i];
  //       unsynced_attendances.push(item);
  //     }
  //     console.log(unsynced_attendances, "attsss")
  //     let unsynced_employees = [];
  //     for (let i = 0; i <= employee_rs_unknown.length - 1; i++) {
  //       let item = employee_rs_unknown[i];
  //       unsynced_employees.push(item);
  //     }


  //     let unsynced_attendances_req: {
  //       odoo_id: number | null;
  //       employee_id: number;
  //       check_in: string;
  //       check_out: string;
  //       recognized_face_checkin: string | null;
  //       recognized_face_checkout: string | null;
  //     }[] = unsynced_attendances.map((att) => {
  //       let required_fields = {
  //         "odoo_id": att.odoo_id,
  //         "employee_id": att.employee_id,
  //         "check_in": att.check_in,
  //         "check_out": att.check_out,
  //         "recognized_face_checkin": att.recognized_face_checkin,
  //         "recognized_face_checkout": att.recognized_face_checkout,
  //         "attendance_client_id": att.attendance_client_id
  //       }
  //       if (required_fields.odoo_id === null) {
  //         unsynced_new.push(required_fields)
  //       }
  //       else if (required_fields.odoo_id !== null) {
  //         unsynced_old.push(required_fields);
  //       }
  //       return required_fields

  //     })
  //     let unsynced_employees_push_data = unsynced_employees.map((emp) => {
  //       return {
  //         "odoo_id": emp.odoo_id,
  //         "image_1024": emp.image_1024,
  //         "image_128": emp.image_1024,
  //         "image_256": emp.image_1024,
  //         "image_512": emp.image_1024,
  //         "image_1920": emp.image_1024,
  //         "is_enrolled": emp.is_enrolled === 1 ? true : false,
  //         "last_photo_update_time": emp.last_photo_update_time
  //       }
  //     })
  //     //send the records for creation and updation.
  //     console.log(unsynced_new, "new attendances")
  //     console.log(unsynced_old, "old attendances")
  //     console.log(unsynced_employees, "unsynced emp")
  //     console.log(unsynced_attendances, "unsynced attendances fresh")
  //     if (this.storage.isNetworkAvailable) {

  //       let sync_vals = await this.odoo.syncOfflineData(unsynced_new, unsynced_old, unsynced_employees_push_data);
  //       let new_ids = sync_vals.new_attendance_ids;
  //       console.log(new_ids, "new idssss")
  //       const deleteQuery = `
  //         DELETE from attendance
  //         WHERE odoo_id in  (${sync_vals.deleted_attendance_ids}) and company_id = ?
  //         `;
  //       // const deleteVal = await db?.executeSql(deleteQuery, [this.storage.selected_company?.id]);
  //       let selected_company = (this.storage.selected_company?.id) ? this.storage.selected_company?.id : 0
  //       const deleteVal = await dbSqlite?.execute(deleteQuery, [selected_company]);
  //       for (let i = 0; i <= attendance_null_rs?.rows.length - 1; i++) {
  //         const updateQuery = `
  //         UPDATE attendance
  //         SET synced=1,odoo_id = ? 
  //         WHERE id = ? and company_id = ?
  //         `;
  //         // const update = await db?.executeSql(updateQuery, [new_ids[i], attendance_null_rs?.rows.item(i).id, this.storage.selected_company?.id]);
  //         const update = await dbSqlite?.execute(updateQuery, [new_ids[i], attendance_null_rs_unknown[i].id, selected_company]);
  //       }
  //       for (let i = 0; i <= attendance_not_null_rs?.rows.length - 1; i++) {
  //         const updateQuery = `
  //         UPDATE attendance
  //         SET synced=1
  //         WHERE id = ? and company_id = ?
  //         `;
  //         // const update = await db?.executeSql(updateQuery, [attendance_not_null_rs_unknown[i].id, this.storage.selected_company?.id]);
  //         const update = await dbSqlite?.execute(updateQuery, [attendance_not_null_rs_unknown[i].id, selected_company]);
  //       }

  //       //employee update
  //       let unsynced_employee_ids = unsynced_employees.map((emp) => emp.odoo_id)
  //       let employee_sync_query = `
  //         UPDATE employees
  //         SET employee_sync=1 where odoo_id in (${unsynced_employee_ids}) and company_id = ?
  //         `;
  //       // const emp_update = await db?.executeSql(employee_sync_query, [this.storage.selected_company?.id]);
  //       const emp_update = await dbSqlite?.execute(employee_sync_query, [selected_company]);

  //     }




  //   }
  //   // attendance sync end

  // }

  async deleteEmployees() {

    return new Promise(async (resolve, reject) => {
      const query = `
        DELETE FROM employees
      `;
      const res = await dbPublic?.query(
        query,
        []
      );
      resolve(res);
      // db.transaction(tx => {
      //   const query = `
      //   DELETE FROM employees
      // `;

      //   tx.executeSql(
      //     query,
      //     [],
      //     (tx: any, res: any) => resolve(res),
      //     (tx: any, err: any) => reject(err)
      //   );
      // });
    });

  }

  async deleteOlderAttendance() {

    return new Promise(async (resolve, reject) => {
      const query = `
        DELETE FROM attendance
      `;
      const res = dbPublic?.query(query, [])
      resolve(res);
      // db.transaction(tx => {
      //   const query = `
      //   DELETE FROM attendance
      // `;

      //   tx.executeSql(
      //     query,
      //     [],
      //     (tx: any, res: any) => resolve(res),
      //     (tx: any, err: any) => reject(err)
      //   );
      // });
    });

  }

  async deleteAllLocalAttendances(): Promise<any> {
    const query = `
      DELETE FROM attendance
    `;

    return dbPublic?.query(query, []);
  }

  async deleteLocalAttendance(attendanceId: number): Promise<any> {
    const selectedCompanyId = this.storage.selected_company?.id || 0;
    const query = `
      DELETE FROM attendance
      WHERE id = ? AND company_id = ?
    `;

    return dbPublic?.query(query, [attendanceId, selectedCompanyId]);
  }

  async isWithinDuration(employeeId: number): Promise<{ withinLimit: boolean, operation: "in" | "out" | "" }> {
    let credJson: LocalCredentials = await this.storage.getCredentials();
    let check_in_delay = 30, check_out_delay = 60;
    if (credJson) {
      check_in_delay = credJson.check_in_delay ? durationToSeconds(credJson.check_in_delay) : check_in_delay;
      check_out_delay = credJson.check_out_delay ? durationToSeconds(credJson.check_out_delay) : check_out_delay;
    }
    const query = `
      SELECT check_in, check_out 
      FROM attendance 
      WHERE employee_id = ?
      ORDER BY datetime(check_in) DESC 
      LIMIT 1
    `;

    // const rs = await db.executeSql(query, [employeeId]);
    const dbrs = await dbPublic?.query(query, [employeeId]);

    if (dbrs.values && dbrs.values.length === 0) return { withinLimit: false, operation: "" };

    const last = dbrs?.values && dbrs?.values[0];

    const lastTimestamp = last['check_out'] ? last['check_out'] : last['check_in'];
    // if (last.check_out!==null) return false;
    //console.log(lastTimestamp, "timestamp")
    const lastTime = new Date(`${lastTimestamp}Z`).getTime();
    const now = Date.now();
    // const offsetMs = new Date().getTimezoneOffset() * 60 * 1000;
    // const utcMs = now + offsetMs;
    const diffMs = now - lastTime;
    //console.log(now,lastTime,"current","lastval")
    //console.log(diffMs, "diffmss")
    //console.log(last.check_out,"checkout")
    // return diffMs < 60 * 1000;
    return last['check_out'] === null ? { withinLimit: diffMs < (check_out_delay * 1000), operation: "out" } : { withinLimit: diffMs < (check_in_delay * 1000), operation: "in" }; //

  }

  //   async retrieveAttendance(dateVal?: string): Promise<LocalAttendance[]> {
  //   const companyId = this.storage.selected_company?.id;
  //   if (!companyId) return [];

  //   const baseQuery = `
  //     SELECT
  //       id, odoo_id, employee_id, check_in, check_out,
  //       recognized_face_checkin, recognized_face_checkout,
  //       synced,worked_hours,attendance_client_id
  //     FROM attendance
  //     WHERE company_id = ?
  //   `;

  //   const query = dateVal
  //     ? `${baseQuery} AND check_in >= ? AND check_in < ? ORDER BY datetime(check_in) DESC`
  //     : `${baseQuery} ORDER BY datetime(check_in) DESC`;

  //   const params = dateVal
  //     ? [companyId, `${dateVal} 00:00:00`, `${dateVal} 23:59:59`]
  //     : [companyId];

  //   const result = await db.executeSql(query, params);

  //   return Array.from(
  //     { length: result.rows.length },
  //     (_, i) => result.rows.item(i)
  //   );
  // }


  async retrieveAttendance(dateVal: string, employeeId?: number, limit?: number, offset = 0, employeeNameSearch = ''): Promise<LocalAttendance[]> {
    const selectedCompanyId = this.storage.selected_company?.id || 0;
    const conditions: string[] = ['company_id = ?'];
    const params: (string | number)[] = [selectedCompanyId];

    if (dateVal) {
      conditions.unshift('check_in like ?');
      params.unshift(`${dateVal}%`);
    }

    if (employeeId) {
      conditions.push('employee_id = ?');
      params.push(employeeId);
    }

    const searchText = employeeNameSearch.trim().toLowerCase();
    if (searchText) {
      conditions.push('LOWER(employee_name) LIKE ?');
      params.push(`%${searchText}%`);
    }

    let selectQuery = `
      SELECT * FROM attendance
      WHERE ${conditions.join(' AND ')}
      ORDER BY datetime(check_in) DESC
    `;

    if (limit && limit > 0) {
      selectQuery += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    const result = await dbPublic?.query(selectQuery, params);
    return (result?.values || []) as LocalAttendance[];
  }

  hoursDiffUTC(start: string, end: string): number {
    return (
      new Date(end.replace(' ', 'T')).getTime() -
      new Date(start.replace(' ', 'T')).getTime()
    ) / 3600000;
  }



  // async saveOfflineAttendance(employee: any, recognised_face: string) {
  //   const SELECT_LAST_ATTENDANCE_SQL = `
  //   SELECT id, check_in, check_out
  //   FROM attendance
  //   WHERE employee_id = ? AND company_id = ?
  //   ORDER BY datetime(check_in) DESC
  //   LIMIT 1
  // `;

  //   const INSERT_OFFLINE_ATTENDANCE_SQL = `
  //   INSERT INTO attendance (
  //     odoo_id,
  //     employee_id,
  //     employee_name,
  //     check_in,
  //     recognized_face_checkin,
  //     worked_hours,
  //     created_at,
  //     create_date,
  //     synced,
  //     company_id,
  //     attendance_client_id
  //   )
  //   VALUES (?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'), 0, ?,?)
  // `;

  //   const UPDATE_OFFLINE_ATTENDANCE_SQL = `
  //   UPDATE attendance
  //   SET
  //     recognized_face_checkout = ?,
  //     check_out = ?,
  //     worked_hours = ?,
  //     synced = 0
  //   WHERE id = ? AND company_id = ?
  // `;

  //   const companyId = this.storage.selected_company?.id;
  //   if (!employee?.odoo_id || !companyId) {
  //     return { time: '', operation: '' as '' | 'in' | 'out' };
  //   }

  //   const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' ');
  //   const now = new Date();

  //   // Wrap the transaction in a Promise to get the operation after SQL completes
  //   const operation: '' | 'in' | 'out' = await new Promise((resolve, reject) => {
  //     db.transaction(
  //       tx => {
  //         tx.executeSql(
  //           SELECT_LAST_ATTENDANCE_SQL,
  //           [employee.odoo_id, companyId],
  //           (_tx: any, rs: any) => {
  //             const last = rs.rows.length ? rs.rows.item(0) : null;

  //             if (!last || last.check_out) {
  //               tx.executeSql(
  //                 INSERT_OFFLINE_ATTENDANCE_SQL,
  //                 [null, employee.odoo_id, employee.display_name ?? '-', nowUTC, recognised_face ?? '', 0, companyId, `${this.deviceUUID}_${Date.now()}`],
  //                 () => resolve('in'),
  //                 (_tx: any, err: any) => reject(err) // ✅ correct, only passing 1 arg to reject
  //               );
  //             } else {
  //               const workedHours = this.hoursDiffUTC(last.check_in, nowUTC);
  //               tx.executeSql(
  //                 UPDATE_OFFLINE_ATTENDANCE_SQL,
  //                 [recognised_face ?? '', nowUTC, workedHours, last.id, companyId],
  //                 () => resolve('out'),
  //                 (_tx: any, err: any) => reject(err) // ✅ correct
  //               );
  //             }
  //           },
  //           (_tx: any, err: any) => reject(err) // transaction SELECT error
  //         );
  //       }
  //     );
  //   });


  //   return {
  //     time: convertToIST(now, 'display', true),
  //     operation
  //   };
  // }




  async saveOfflineAttendance(
    employee: any,
    recognised_face: any,
    locationPayload: {
      latitude: number;
      longitude: number;
      address?: string | null;
    } | null = null
  ) {
    let out: { time: string, operation: "" | "in" | "out" } = { time: '', operation: '' }
    if (!employee || !employee.odoo_id) {
      console.error("saveOfflineAttendance called with null employee");
      return out;
    }
    const selectQuery = `
      SELECT * FROM attendance
      WHERE employee_id = ? and company_id = ? ORDER BY datetime(check_in) DESC
      LIMIT 1; 
    `;

    // const rs = await db.executeSql(selectQuery, [employee.odoo_id, this.storage.selected_company?.id]);
    const dbrs = await dbPublic?.query(selectQuery, [employee.odoo_id, this.storage.selected_company?.id])
    const existing = dbrs.values && (dbrs.values.length > 0) ? dbrs.values[0] : null;
    const now = new Date();
    const gmtReadable =
      now.getUTCFullYear() + "-" +
      String(now.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(now.getUTCDate()).padStart(2, "0") + " " +
      String(now.getUTCHours()).padStart(2, "0") + ":" +
      String(now.getUTCMinutes()).padStart(2, "0") + ":" +
      String(now.getUTCSeconds()).padStart(2, "0");
    let time = "", operation: "in" | "out" | "" = "";
    function diffHHMM(start: string, end: string): number {
      const d1 = new Date(start.replace(" ", "T"));
      const d2 = new Date(end.replace(" ", "T"));
      let diffMs = (d2.getTime() - d1.getTime()) / 3600000; // FIX ✔
      return diffMs
    }


    if (existing && !existing['check_out']) {
      let checkinStr = existing["check_in"] != null ? existing["check_in"].toString() : "";
      if (checkinStr) {
        let ciDateUtc = new Date(checkinStr.replace(" ", "T") + "Z");
        let diffHours = (now.getTime() - ciDateUtc.getTime()) / 3600000;


      }
    }

    if (!existing || (existing && existing['check_out'])) { // need to create new

      const insertQuery = `
        INSERT INTO attendance (
          odoo_id, employee_id, employee_name, check_in, check_out,
          out_mode,
          recognized_face_checkin, recognized_face_checkout,
          in_latitude, in_longitude, out_latitude, out_longitude, checkin_address, checkout_address, worked_hours,
          created_at, create_date, write_date, synced, company_id, attendance_client_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'), ?, 0, ?, ?)
      `;

      let outSqlite = await dbPublic?.query(insertQuery, [
        null,
        employee.odoo_id,
        employee.display_name,
        gmtReadable,
        null,
        "kiosk",
        String(recognised_face),
        null,
        locationPayload?.latitude ?? null,
        locationPayload?.longitude ?? null,
        null,
        null,
        locationPayload?.address ?? null,
        null,
        0,
        null,
        this.storage.selected_company?.id,
        `${this.deviceUUID}_${Date.now()}`
      ])

      operation = "in"

    }
    else if (existing && !existing['check_out']) { //update eisting
      let checkin = existing["check_in"] != null ? existing["check_in"].toString() : "";
      let worked_hours = diffHHMM(checkin, gmtReadable);
      const updateQuery = `
        UPDATE attendance
        SET recognized_face_checkout= ?, out_latitude = ?, out_longitude = ?, checkout_address = ?, check_out = ?, out_mode = ?, worked_hours = ?, synced = ? WHERE id = ? and company_id = ?
      `;
      let selected_company = this.storage.selected_company?.id ? this.storage.selected_company?.id : 0
      let outSqlite = await dbPublic?.query(updateQuery, [
        String(recognised_face),
        locationPayload?.latitude ?? null,
        locationPayload?.longitude ?? null,
        locationPayload?.address ?? null,
        gmtReadable,
        "kiosk",
        worked_hours,
        0,
        existing['id'],
        selected_company
      ])
      operation = "out"
    }
    time = convertToIST(now, "display", true)
    return { time, operation }

  }



  deleteOldAttendance(): Promise<any> {
    const query = `
        DELETE FROM attendance
        WHERE check_in < datetime('now', '-3 days')
      `;

    return new Promise(async (resolve, reject) => {
      let res = await dbPublic?.query(query,
        [],)
      resolve(res);
      // db.transaction(tx => {


      //   tx.executeSql(
      //     query,
      //     [],
      //     (tx: any, res: any) => resolve(res),
      //     (tx: any, err: any) => reject(err)
      //   );
      // });
    });
  }

  // async fetchAttendanceFromOdoo(domain: any[] = []) {
  //   const CHUNK_SIZE = 200;

  //   const attendances = await this.odoo.getAttendance(domain);

  //   const query = `
  //   INSERT OR REPLACE INTO attendance (
  //     odoo_id,
  //     employee_id,
  //     employee_name,
  //     check_in,
  //     check_out,
  //     worked_hours,
  //     recognized_face_checkin,
  //     recognized_face_checkout,
  //     created_at,
  //     synced,
  //     create_date,
  //     write_date,
  //     company_id,
  //     attendance_client_id
  //   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), 1, DATETIME('now'), DATETIME('now'), ?,?)
  // `;

  //   for (let i = 0; i < attendances.length; i += CHUNK_SIZE) {
  //     const chunk = attendances.slice(i, i + CHUNK_SIZE);

  //     await db.transaction(async (tx) => {
  //       for (const record of chunk) {
  //         console.log(record, "att rec")
  //         const params = [
  //           record.id,
  //           record.employee_id?.[0] ?? null,
  //           record.employee_id?.[1] ?? '-',
  //           record.check_in,
  //           record.check_out ? record.check_out : null,
  //           record.worked_hours,
  //           record.recognized_face_checkin,
  //           record.recognized_face_checkout,
  //           this.storage.selected_company?.id,
  //           record.attendance_client_id
  //         ];

  //         tx.executeSql(query, params);
  //       }
  //     });
  //   }

  //   return attendances;
  // }



  //   async fetchAttendanceFromOdoo(domain: any[] = []) {

  //     const attendances = await this.odoo.getAttendance(domain)
  //     console.log(attendances, 'online attedances');
  //     for (const record of attendances) {
  //       const query = `INSERT OR REPLACE INTO attendance (
  //     odoo_id,
  //     employee_id,
  //     employee_name,
  //     check_in,
  //     check_out,
  //     worked_hours,
  //     recognized_face_checkin,
  //     recognized_face_checkout,
  //     created_at,
  //     synced,
  //     create_date,
  //     write_date,
  //     company_id,
  //     attendance_client_id
  // )
  // VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), 1, DATETIME('now'), DATETIME('now'), ?, ?)`


  //       // Prepare parameters from the Odoo record
  //       const params = [
  //         record.id, // Odoo's ID maps to our odoo_id
  //         record.employee_id ? record.employee_id[0] : null, // Odoo many2one format [ID, Name]
  //         record.employee_id ? record.employee_id[1] : '-',
  //         record.check_in,
  //         record.check_out ? record.check_out : null,
  //         record.worked_hours,
  //         record.recognized_face_checkin ? await this.storage.resizeBase64Image(record.recognized_face_checkin.replace(/\s/g, '')) : record.recognized_face_checkin,
  //         record.recognized_face_checkout ? await this.storage.resizeBase64Image(record.recognized_face_checkout.replace(/\s/g, '')) : record.recognized_face_checkout,
  //         this.storage.selected_company ? (this.storage.selected_company?.id) : null,
  //         record.attendance_client_id ? record.attendance_client_id : null
  //       ];
  //       console.log(params, "paramssssssss")

  //       try {
  //         // tx.executeSql(query, params);
  //         dbSqlite.execute(query, params).then((res) => {
  //           console.log(res, "sqlres")
  //         }, (err) => { console.log(err, "err") });
  //       } catch (e) {
  //         console.error(`Error syncing Odoo ID ${record.id}:`, e);
  //       }
  //     }



  //     return attendances;

  //   }

  private getAttendanceDomainValue(domain: any[], fieldName: string, operators: string[] = ['=']): any {
    const condition = domain.find((item) => {
      if (!Array.isArray(item) || item.length < 3) return false;
      return item[0] === fieldName && operators.includes(String(item[1]).toLowerCase());
    });

    return condition?.[2];
  }

  private async deleteLocalAttendancesMissingFromServer(domain: any[], attendances: any[]): Promise<void> {
    const companyId = Number(
      this.getAttendanceDomainValue(domain, 'employee_id.company_id') ||
      this.storage.selected_company?.id ||
      0
    );
    const checkInLike = this.getAttendanceDomainValue(domain, 'check_in', ['like', 'ilike']);

    if (!companyId || typeof checkInLike !== 'string' || !checkInLike) {
      return;
    }

    const conditions: string[] = [
      'company_id = ?',
      'synced = 1',
      'odoo_id IS NOT NULL',
      'check_in LIKE ?'
    ];
    const params: any[] = [companyId, checkInLike];
    const employeeId = this.getAttendanceDomainValue(domain, 'employee_id');

    if (employeeId !== undefined && employeeId !== null) {
      conditions.push('employee_id = ?');
      params.push(employeeId);
    }

    const serverIds = attendances
      .map((attendance) => Number(attendance.id))
      .filter((id) => Number.isFinite(id));

    if (serverIds.length > 0) {
      conditions.push(`odoo_id NOT IN (${serverIds.map(() => '?').join(',')})`);
      params.push(...serverIds);
    }

    await dbPublic?.query(
      `DELETE FROM attendance WHERE ${conditions.join(' AND ')}`,
      params
    );
  }

  async fetchAttendanceFromOdoo(domain: any[] = []) {
    try {
      const attendances = await this.odoo.getAttendance(domain);
      console.log(attendances, 'online attendances');

      if (!attendances || !Array.isArray(attendances)) {
        console.warn("Invalid or no attendances returned from Odoo:", attendances);
        return [];
      }

      await this.deleteLocalAttendancesMissingFromServer(domain, attendances);

      const insertQuery = `INSERT INTO attendance (
      odoo_id, employee_id, employee_name, check_in, check_out, out_mode,
      worked_hours, recognized_face_checkin, recognized_face_checkout,
      in_latitude, in_longitude, out_latitude, out_longitude, checkin_address, checkout_address,
      created_at, synced, create_date, write_date, company_id, attendance_client_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), 1, DATETIME('now'), DATETIME('now'), ?, ?)`;

      const updateQuery = `UPDATE attendance SET
        employee_id = ?, employee_name = ?, check_in = ?, check_out = ?, out_mode = ?, worked_hours = ?,
        recognized_face_checkin = ?, recognized_face_checkout = ?, in_latitude = ?, in_longitude = ?,
        out_latitude = ?, out_longitude = ?, checkin_address = ?, checkout_address = ?, synced = 1,
        write_date = DATETIME('now'), attendance_client_id = ?
        WHERE id = ? AND company_id = ?`;


      for (const record of attendances) {
        // 2. Sequential resize to avoid RAM spike
        let checkin_face = record.recognized_face_checkin;
        let checkout_face = record.recognized_face_checkout;

        if (checkin_face && checkin_face.length > 5000) {
          checkin_face = await this.storage.resizeBase64Image(checkin_face.replace(/\s/g, ''));
        }
        if (checkout_face && checkout_face.length > 5000) {
          checkout_face = await this.storage.resizeBase64Image(checkout_face.replace(/\s/g, ''));
        }

        const params = [
          record.id,
          record.employee_id ? record.employee_id[0] : null,
          record.employee_id ? record.employee_id[1] : '-',
          record.check_in,
          record.check_out || null,
          record.out_mode ?? (record.check_out ? 'kiosk' : null),
          record.worked_hours,
          checkin_face,
          checkout_face,
          record.in_latitude ?? null,
          record.in_longitude ?? null,
          record.out_latitude ?? null,
          record.out_longitude ?? null,
          record.checkin_address ?? null,
          record.checkout_address ?? null,
          this.storage.selected_company?.id || null,
          record.attendance_client_id || null
        ];

        try {
          const companyId = this.storage.selected_company?.id || 0;
          const matchingAttendance = await dbPublic?.query(
            `SELECT id, odoo_id, synced FROM attendance
             WHERE company_id = ? AND (odoo_id = ? OR (attendance_client_id IS NOT NULL AND attendance_client_id = ?))
             ORDER BY id DESC LIMIT 1`,
            [companyId, record.id, record.attendance_client_id || '']
          );
          const existingAttendance = matchingAttendance?.values?.[0];
          const existingId = existingAttendance?.['id'];

          // Keep a local checkout/update queued if it has not reached Odoo yet.
          if (existingAttendance?.['synced'] === 0 && existingAttendance?.['odoo_id'] === record.id) {
            continue;
          }

          if (existingId) {
            await dbPublic?.query(updateQuery, [
              params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8],
              params[9], params[10], params[11], params[12], params[13], params[14], params[16], existingId, companyId
            ]);
            await dbPublic?.query(
              `DELETE FROM attendance WHERE company_id = ? AND odoo_id = ? AND id != ? AND synced = 1`,
              [companyId, record.id, existingId]
            );
          } else {
            await dbPublic?.query(insertQuery, params);
          }
          console.log(`Synced Odoo ID: ${record.id}`);
        } catch (sqlErr) {
          console.error(`SQL Error for ID ${record.id}:`, sqlErr);
        }
      }
      return attendances;
    } catch (err) {
      console.error("Fetch error:", err);
      return [];
    }
  }
}
