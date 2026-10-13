import { Injectable, OnInit } from "@angular/core";
// 🎯 Step 1: New Imports
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from "@capacitor/core";
import * as faceapi from '@vladmandic/face-api';

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
  last_photo_update_time?: string
}


export interface LocalAttendance {
  id: number,
  employee_id: number,
  employee_name: string,
  check_in: string,
  check_out: string,
  display_check_in?: string,
  display_check_out?: string,
  display_worked_hours?: string,
  worked_hours: number,
  recognized_face_checkin: string | null,
  recognized_face_checkout: string | null,
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
  // "language":string
}

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
  let minutes = 0;
  let seconds = 0;

  // Extract minutes if present
  const mMatch = str.match(/(\d+)m/);
  if (mMatch) minutes = parseInt(mMatch[1], 10);

  // Extract seconds if present
  const sMatch = str.match(/(\d+)s/);
  if (sMatch) seconds = parseInt(sMatch[1], 10);

  return minutes * 60 + seconds;
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
  is_pin_setup = false;//until first time enrollment
  exitPage = "/login"

  originalImg = new Image();
  // private db!: SQLiteObject;
  imageObj = new Image();
  selectedEmployee: any = undefined;
  loader: HTMLIonLoadingElement | undefined;
  employee_filter_status: 'all' | 'enrolled' | 'not_enrolled' = 'not_enrolled';
  private reusableCanvas: HTMLCanvasElement | null = null;


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
      } else {
        await stopBackgroundService();
      }
    });


  }

  async showToast(msg: ToastOptions): Promise<void> {
    const toast: HTMLIonToastElement = await this.toast.create(msg);
    toast.present();

  }

  async handleLogin(): Promise<boolean> {
    let isAvailable = await this.odoo.pingOdooServer(this.odoo.baseUrl);
    console.log(isAvailable, "server avail", this.odoo.baseUrl)
    if (!isAvailable) {
      this.showToast({
        message: this.translate.instant("SERVER_DOWN_MSG"),
        duration: 3000,
        color: 'danger',
        position: "top"
      })
      return isAvailable;
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

  async getCredentials() {
    let creds = await Preferences.get({ "key": "credentials" });
    let credJson: LocalCredentials = creds.value ? JSON.parse(creds.value) : null;
    return credJson;
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
    try {
      // this.debugMessage = 'Loading models...';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/assets/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/assets/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models'),
      ]);

      // this.debugMessage = 'Models loaded. Loading enrollments...';
    } catch (error) {
      // this.debugMessage = 'Error loading models.';
      console.error('Error loading models:', error);
    }
  }

  /**
    * 🎯 Step 3: Migrated Database Initialization
    */
  async initializeDatabase(): Promise<void> {

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
      const platform = Capacitor.getPlatform();

      // Create the connection
      this.db = await this.sqlite.createConnection(
        'UserData',
        false,
        'no-encryption',
        1,
        false
      );



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
        { "field": "worked_hours", "type": "FLOAT" },
        { "field": "recognized_face_checkin", "type": "TEXT" },
        { "field": "recognized_face_checkout", "type": "TEXT" },
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

  async rotateBase64Image(
    base64Image: string,
    angleDeg: number
  ): Promise<string> {
    const blob = await (await fetch(
      `data:image/jpeg;base64,${base64Image}`
    )).blob();

    const bitmap = await createImageBitmap(blob);

    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    if (!ctx) return base64Image;

    const angleRad = (angleDeg * Math.PI) / 180;

    if (Math.abs(angleDeg) % 180 === 90) {
      canvas.width = bitmap.height;
      canvas.height = bitmap.width;
    } else {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-angleRad);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const resultBase64 = canvas
      .toDataURL("image/jpeg", 0.9)
      .split(",")[1];

    bitmap.close();          // ✅ frees bitmap memory
    canvas.width = 0;
    canvas.height = 0;
    (ctx as any) = null;
    return resultBase64;
  }

  async logoutCleanup() {
    await this.appStateListener?.remove();
    this.appStateListener = undefined;
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
        const MAX_WIDTH = 224;
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
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
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
    try {
      // 1. Create a dummy tensor with the correct input size (224)
      // TinyFaceDetector expects [1, height, width, 3]
      const dummyInput = faceapi.tf.zeros([1, 224, 224, 3]) as faceapi.tf.Tensor4D;

      // 2. Pass the tensor DIRECTLY instead of an image object
      // Note: detectSingleFace tensor-ah handle pannum
      await faceapi.detectSingleFace(dummyInput as any, new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.4
      }));

      // 3. Clean up the dummy tensor immediately
      dummyInput.dispose();

      console.log("✅ AI Model Warmed up and Ready!");
    } catch (error) {
      console.error("Warmup failed:", error);
    }
  }


  async generateLabeledDescriptors(employees: OdooEmployeeData[], mode: "online" | "offline"): Promise<FaceDataStructure[]> {
    const labeledDescriptors: FaceDataStructure[] = [];
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

    for (let employee of employees) {
      const label = (mode === "online") ? employee.id : employee.odoo_id;
      let base64String = employee.image_1024;
      const tf = (faceapi.tf as any);
      tf.engine().startScope();
      const tempImg = new Image();
      try {
        let resizedBase64 = await this.resizeBase64Image(base64String);
        // Use local variable, not class property
        tempImg.src = `data:image/jpeg;base64,${resizedBase64}`;

        await new Promise((resolve) => tempImg.onload = resolve);

        const detection = await faceapi.detectSingleFace(tempImg, detectionOptions)
          .withFaceLandmarks().withFaceDescriptor();

        if (detection) {
          labeledDescriptors.push({
            label: label,
            descriptor: [Array.from(detection.descriptor)],
            employee_id: label
          });
        }

        // Cleanup local image immediately
        tempImg.src = '';
        resizedBase64 = "";
        (employee as any) = null;
      } catch (error) {
        console.error(error);
      } finally {
        tf.engine().endScope();
        tempImg.src = "";
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
          "field": "employee_id",
          "type": "INTEGER"
        },
        {
          "field": "company_id",
          "type": "INTEGER"
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
  async createOrUpdateEmployee(emparr: any[], update = false) {
    //console.log(emparr, "emparr")
    if (!this.db) await this.initEmployeeTable();
    if (!update) {
      emparr = emparr.map((em) => { em['odoo_id'] = undefined; return em });
    }
    console.log(emparr, "emparrrr");

    for (let emp of emparr) {
      //console.log(emp, "empppppp")
      let query = (update === true) ? `SELECT * FROM employees WHERE id = ? and company_id = ?` : `SELECT * FROM employees WHERE odoo_id = ? and company_id = ?`

      //  let query = (update === true) ? `SELECT * FROM employees WHERE id = ?` : `SELECT * FROM employees WHERE odoo_id = ?`
      console.log(query, "update querys")
      // const existing = await db!.executeSql(query, [emp.id, this.selected_company?.id]);
      const existing = await this.db.query(query, [emp.id, this.selected_company?.id]);
      console.log(existing, "exisssssss")

      if (existing.values && existing.values.length > 0) {
        let exist = existing.values[0]['last_photo_update_time'] != null ? existing.values[0]['last_photo_update_time'].toString() : "";
        let localtimestamp = existing.values[0]['last_photo_update_time'] ? (new Date(exist)).getTime() : 0, remotetimestamp = new Date(emp.last_photo_update_time).getTime();
        console.log(remotetimestamp > localtimestamp, remotetimestamp, localtimestamp, "local", "remote")

        if (!update && remotetimestamp > localtimestamp) {

          await this.updateEmployee(emp); // getting updtes through manual sync 
        }
        else if (update) {
          const today: Date = new Date();
          await this.updateEmployee(emp, { "image_1024": emp.image_1024, "is_enrolled": 1, "employee_sync": 0, "last_photo_update_time": today.toISOString().replace("T", " ").replace("Z", "").split(".")[0] });
        }

        //console.log(existing.rows.length, "existing row")
      } else {
        console.log(emp, "empdmp", this.selected_company)
        if (emp.company_id[0] === this.selected_company?.id) {
          await this.createEmployee(emp);
        }

        //console.log(existing.rows.length, "new row")
      }
    }
    return true;

  }

  async createEmployee(emp: any) {
    const sql = `INSERT INTO employees (display_name, image_1024, job_id, active, odoo_id, is_enrolled, employee_sync, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      emp.display_name,
      emp.image_1024 || 'false',
      emp.job_id[1],
      emp.active ? 1 : 0,
      emp.id,
      emp.is_enrolled,
      1,
      emp.company_id[0]
    ];
    return await this.db.run(sql, params);
  }

  /** Update existing employee */
  async updateEmployee(emp: any, data: any | undefined = undefined) {
    //console.log('updateEmployee')
    // if (!data) {
    //   data = emp;
    // }
    // if (data) {
    //console.log(emp, data, 'inputs');
    let query = `UPDATE employees SET`, subparams = '', params: any[] = []
    let first = true;
    if (data) {
      for (let field in data) {
        let par = first ? `${field}=?` : `,${field}=?`
        subparams = `${subparams} ${par}`
        first = false
        params.push(data[field])
      }


    }
    else if (!data) {
      subparams = ` display_name=?,active=?,image_1024=?,job_id=?,is_enrolled=?,last_photo_update_time=?`;
      params = [emp["display_name"], `${emp["active"]}`, emp["image_1024"] ? emp["image_1024"] : "false", emp["job_id"][1], emp['is_enrolled'], emp["last_photo_update_time"]]
    }



    query = `${query} ${subparams} WHERE odoo_id= ? and company_id = ?`
    //console.log(query, params, "queryyyyyyss")
    // await db!.executeSql(
    //   query,
    //   [...params, data ? emp.odoo_id : emp.id, this.selected_company?.id]
    // );
    await this.db.query(
      query,
      [...params, data ? emp.odoo_id : emp.id, this.selected_company?.id]
    );
    // }


    return true
  }

  /** Delete employee */
  async deleteEmployee(odooId: number) {
    //need another logic. get all ids from remote. check all odoo ids. compare. If id present in local not present in remote, then delete.
    // return db!.executeSql(`DELETE FROM employees WHERE odoo_id = ?`, [odooId]);
    return this.db.query(`DELETE FROM employees WHERE odoo_id = ?`, [odooId]);
  }

  async getAllEmployees(): Promise<LocalEmployees[]> {
    const company_id = this.selected_company?.id || 0;
    // 🎯 Use .query() for SELECT
    const result = await this.db.query(`SELECT * FROM employees WHERE company_id = ?`, [company_id]);
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
          set check_out= ?,recognized_face_checkout= ? where odoo_id= ? and company_id= ? and attendance_client_id= ?
          `;
          // const rs = await db?.executeSql(updateQuery, [!rec.check_out ? null : rec.check_out, !rec.recognized_face_checkout ? null : rec.recognized_face_checkout, rec.id, this.storage.selected_company?.id, rec.attendance_client_id]);
          const rs = await dbPublic?.query(updateQuery, [!rec.check_out ? null : rec.check_out, !rec.recognized_face_checkout ? null : rec.recognized_face_checkout, rec.id, this.storage.selected_company?.id, rec.attendance_client_id]);
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





  async syncToOdoo() {
    const loginval = await this.storage.handleLogin();
    console.log(loginval, "logval");
    if (!loginval) return;

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
    if (!employee_rs?.values || !attendance_null_rs?.values || !attendance_not_null_rs?.values) return;

    if (attendance_null_rs.values.length === 0 &&
      attendance_not_null_rs.values.length === 0 &&
      employee_rs.values.length === 0) {
      return;
    }

    // 3. Payload Construction using Bracket Notation to satisfy Index Signature
    let unsynced_new: any[] = [];
    let unsynced_old: any[] = [];
    let unsynced_employees_push_data: any[] = [];

    // Process New Attendances (odoo_id is null)
    for (let i = 0; i < attendance_null_rs.values.length; i++) {
      const row = attendance_null_rs.values[i];
      unsynced_new.push({
        "odoo_id": null,
        "employee_id": row['employee_id'],
        "check_in": row['check_in'],
        "check_out": row['check_out'],
        "recognized_face_checkin": row['recognized_face_checkin'],
        "recognized_face_checkout": row['recognized_face_checkout'],
        "attendance_client_id": row['attendance_client_id']
      });
    }

    // Process Existing Attendances (odoo_id is not null)
    for (let i = 0; i < attendance_not_null_rs.values.length; i++) {
      const row = attendance_not_null_rs.values[i];
      unsynced_old.push({
        "odoo_id": row['odoo_id'],
        "employee_id": row['employee_id'],
        "check_in": row['check_in'],
        "check_out": row['check_out'],
        "recognized_face_checkin": row['recognized_face_checkin'],
        "recognized_face_checkout": row['recognized_face_checkout'],
        "attendance_client_id": row['attendance_client_id']
      });
    }

    // Process Employee Updates
    for (let i = 0; i < employee_rs.values.length; i++) {
      const row = employee_rs.values[i];
      unsynced_employees_push_data.push({
        "odoo_id": row['odoo_id'],
        "image_1024": row['image_1024'],
        "image_128": row['image_1024'],
        "image_256": row['image_1024'],
        "image_512": row['image_1024'],
        "image_1920": row['image_1024'],
        "is_enrolled": row['is_enrolled'] === 1,
        "last_photo_update_time": row['last_photo_update_time']
      });
    }

    // 4. Sync to Odoo
    if (this.storage.isNetworkAvailable) {
      try {
        const sync_vals = await this.odoo.syncOfflineData(unsynced_new, unsynced_old, unsynced_employees_push_data);

        const new_ids = sync_vals.new_attendance_ids || [];
        const deleted_ids = sync_vals.deleted_attendance_ids || [];

        // 5. Database Cleanup - DELETE
        if (deleted_ids.length > 0) {
          // Use join to create string for 'IN' clause: "1,2,3"
          const deleteQuery = `DELETE FROM attendance WHERE odoo_id IN (${deleted_ids.join(',')}) AND company_id = ?`;
          await dbPublic?.query(deleteQuery, [selected_company]);
        }

        // 6. Database Cleanup - UPDATE NEW
        for (let i = 0; i < attendance_null_rs.values.length; i++) {
          const updateQuery = `UPDATE attendance SET synced=1, odoo_id = ? WHERE id = ? AND company_id = ?`;
          await dbPublic?.query(updateQuery, [new_ids[i], attendance_null_rs.values[i]['id'], selected_company]);
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

      } catch (e) {
        console.error("Sync process failed:", e);
      } finally {
        // Memory cleanup for Garbage Collector
        (unsynced_new as any) = null;
        (unsynced_old as any) = null;
        (unsynced_employees_push_data as any) = null;
      }
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
    console.log(lastTimestamp, "stamppp")
    const lastTime = new Date(`${lastTimestamp}Z`).getTime();
    const now = Date.now();
    // const offsetMs = new Date().getTimezoneOffset() * 60 * 1000;
    // const utcMs = now + offsetMs;
    const diffMs = now - lastTime;
    //console.log(now,lastTime,"current","lastval")
    //console.log(diffMs, "diffmss")
    //console.log(last.check_out,"checkout")
    // return diffMs < 60 * 1000;
    console.log(diffMs, check_out_delay * 1000, check_out_delay * 1000, "alsssss")
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


  async retrieveAttendance(dateVal: string): Promise<LocalAttendance[]> {
    //console.log(dateVal, "datevall")
    console.log(dateVal, "datevall")
    let selectQuery = `
      SELECT * FROM attendance `;
    selectQuery = dateVal ? `${selectQuery} where check_in like '${dateVal}%' and company_id = ?  ORDER BY datetime(check_in) DESC` : `${selectQuery} where company_id = ?  ORDER BY datetime(check_in) DESC`;
    console.log(selectQuery, this.storage.selected_company, "selque")
    // const result = await db.executeSql(selectQuery, [this.storage.selected_company?.id]);
    let selected_company = (this.storage.selected_company?.id) ? this.storage.selected_company?.id : 0
    const result = await dbPublic?.query(selectQuery, [selected_company]);
    const resultSqlite = this.storage.selected_company ? await dbPublic?.query(selectQuery, [this.storage.selected_company.id]) : undefined;
    console.log(resultSqlite, "resultSqlite")
    console.log(result, "res")
    const attendances: any[] = [];
    if (resultSqlite && resultSqlite.values) {
      for (let i = 0; i < resultSqlite.values.length; i++) {
        attendances.push(resultSqlite.values[i]);
      }
    }

    return attendances;
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




  async saveOfflineAttendance(employee: any, recognised_face: any) {
    let out: { time: string, operation: "" | "in" | "out" } = { time: '', operation: '' }
    if (!employee || !employee.odoo_id) {
      console.error("saveOfflineAttendance called with null employee");
      return out;
    }
    //required employee_id,recognised_face
    console.log(employee, recognised_face, "offline data");
    const selectQuery = `
      SELECT * FROM attendance
      WHERE employee_id = ? and company_id = ? ORDER BY datetime(check_in) DESC
      LIMIT 1; 
    `;
    console.log(employee.odoo_id, this.storage.selected_company?.id, "input dataaa")


    // const rs = await db.executeSql(selectQuery, [employee.odoo_id, this.storage.selected_company?.id]);
    const dbrs = await dbPublic?.query(selectQuery, [employee.odoo_id, this.storage.selected_company?.id])
    const existing = dbrs.values && (dbrs.values.length > 0) ? dbrs.values[0] : null;
    console.log(existing, "existtttt")
    const now = new Date();
    const gmtReadable =
      now.getUTCFullYear() + "-" +
      String(now.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(now.getUTCDate()).padStart(2, "0") + " " +
      String(now.getUTCHours()).padStart(2, "0") + ":" +
      String(now.getUTCMinutes()).padStart(2, "0") + ":" +
      String(now.getUTCSeconds()).padStart(2, "0");
    let time = "", operation: "in" | "out" | "" = "";
    console.log(gmtReadable, "gmtttt");
    function diffHHMM(start: string, end: string): number {
      console.log(start, end, 'dates')
      const d1 = new Date(start.replace(" ", "T"));
      const d2 = new Date(end.replace(" ", "T"));
      console.log(d1, d2, "dattttts")
      let diffMs = (d2.getTime() - d1.getTime()) / 3600000; // FIX ✔
      return diffMs
    }


    if (!existing || (existing && existing['check_out'])) { // need to create new

      const insertQuery = `
        INSERT INTO attendance (odoo_id, employee_id,employee_name, check_in, check_out,recognized_face_checkin,recognized_face_checkout,worked_hours,created_at,create_date,write_date,synced,company_id,attendance_client_id) VALUES (?, ?,?, ?, ?, ?,?,?,DATETIME('now'),DATETIME('now'),?,0,?,?)
      `;

      // let out = await db.executeSql(insertQuery, [null, employee.odoo_id, employee.display_name, gmtReadable, null, recognised_face, null, 0, null, this.storage.selected_company?.id, `${this.deviceUUID}_${Date.now()}`])
      let outSqlite = await dbPublic?.query(insertQuery, [null, employee.odoo_id, employee.display_name, gmtReadable, null, String(recognised_face), null, 0, null, this.storage.selected_company?.id, `${this.deviceUUID}_${Date.now()}`])

      operation = "in"

    }
    else if (existing && !existing['check_out']) { //update eisting
      console.log(existing["check_in"], gmtReadable, "test vals")
      let checkin = existing["check_in"] != null ? existing["check_in"].toString() : "";
      let worked_hours = diffHHMM(checkin, gmtReadable);
      const updateQuery = `
        UPDATE attendance
        SET recognized_face_checkout= ?,check_out = ?,worked_hours = ?,synced = ? WHERE id = ? and company_id = ?
      `;
      // let out = await db.executeSql(updateQuery, [recognised_face, gmtReadable, worked_hours, 0, existing.id, this.storage.selected_company?.id]);
      let selected_company = this.storage.selected_company?.id ? this.storage.selected_company?.id : 0
      let outSqlite = await dbPublic?.query(updateQuery, [String(recognised_face), gmtReadable, worked_hours, 0, existing['id'], selected_company])
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

  async fetchAttendanceFromOdoo(domain: any[] = []) {
    try {
      const attendances = await this.odoo.getAttendance(domain);
      console.log(attendances, 'online attendances');

      // 1. Query-ai inge declare pannunga
      const query = `INSERT OR REPLACE INTO attendance (
      odoo_id, employee_id, employee_name, check_in, check_out,
      worked_hours, recognized_face_checkin, recognized_face_checkout,
      created_at, synced, create_date, write_date, company_id, attendance_client_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), 1, DATETIME('now'), DATETIME('now'), ?, ?)`;

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
          record.worked_hours,
          checkin_face,
          checkout_face,
          this.storage.selected_company?.id || null,
          record.attendance_client_id || null
        ];

        // 3. AWAIT logic - Idhu dhaan 'out of memory' aagama paathukum
        try {
          await dbPublic?.query(query, params);
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

