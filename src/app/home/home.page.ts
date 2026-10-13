
// src/app/face-detect/face-detect.page.ts

import { Component, OnInit, ViewChild, ElementRef, OnDestroy, signal, computed } from '@angular/core';

// import { CameraPreview, CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { CameraPreview as CapgoCameraPreview, CameraPreviewOptions as CapgoCameraPreviewOptions } from '@capgo/camera-preview';
import { FaceRecognition } from 'capacitor-face-recognition-tflite';
import { calculateCosineSimilarity } from '../services/storage.service';
import { MenuController, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonMenuToggle, IonButton, IonButtons, ModalController, IonModal, IonSkeletonText, AlertController, ToastController } from '@ionic/angular/standalone';

import { Router, RouterModule } from '@angular/router';
import { StorageService, FaceDataStructure, AttendanceService, durationToSeconds, LocalCredentials, LocalEmployees, LocalAttendance } from '../services/storage.service';
import { addIcons } from 'ionicons';
import { camera, checkmarkCircle, closeCircle, ellipsisVertical, locate, locationOutline, logOutOutline, personCircle, scanOutline } from 'ionicons/icons';
// import { KeepAwake } from '@capacitor-community/keep-awake';
import { KeepAwake as CapgoKeepAwake } from '@capgo/capacitor-keep-awake';

import { TranslateModule } from '@ngx-translate/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { NativeGeocoder, Address } from '@capgo/capacitor-nativegeocoder';

import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Preferences } from '@capacitor/preferences';



const DETECTION_INTERVAL_MS = 175;
const HIGH_CONFIDENCE_THRESHOLD = 0.70;
const MIN_MATCH_THRESHOLD = 0.65;
const MARGIN_CONFIDENCE_DELTA = 0.05;
const UNKNOWN_CONFIRMATION_FRAMES = 3;
const LOCATION_CACHE_MAX_AGE_MS = 30000;
type LocationStatus = 'checking' | 'enabled' | 'disabled' | 'denied' | 'unsupported' | 'not_required';
type AttendanceCoordinates = {
  latitude: number;
  longitude: number;
  address?: string | null;
};



@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonButtons, IonMenuToggle, IonModal, IonSkeletonText, TranslateModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  providers: []
})
export class HomePage implements OnInit, OnDestroy {
  goToRenewal() {
    this.router.navigateByUrl('/license-renewal');
  }
  appStateSub?: any;

  constructor(
    private attservice: AttendanceService,
    private router: Router,
    public storage: StorageService,
    private modal: ModalController,
    private att: AttendanceService,
    private alertController: AlertController,
    private toastController: ToastController,
    private menuCtrl: MenuController
  ) {
    addIcons({ camera, checkmarkCircle, closeCircle, ellipsisVertical, locate, locationOutline, logOutOutline, personCircle, scanOutline });
    this.locationStatusMessage.set(this.t('LOCATION_STATUS_CHECKING'));
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.enable(true, 'global-menu');
    await this.menuCtrl.open('global-menu');
  }
  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;

  loading: boolean = false;

  private isDestroyed = false;
  private isProcessing = false;
  private appActive = true;
  // online = true;

  isCameraStarted = signal<boolean>(false);
  private cameraLifecycleToken = 0;
  private cameraOperation: Promise<void> = Promise.resolve();
  debugMessage: string = 'Initializing...';
  detectedEmployee = signal<undefined | LocalEmployees | { display_name: string }>(undefined);
  operation = signal<"in" | "out" | "recent_in" | "recent_out" | "" | false>("");
  time = signal<string>("");
  detectedImage = signal<string>("");
  check_in_delay_sec = signal<number>(0);
  check_out_delay_sec = signal<number>(0);


  showTimer: boolean = false;
  countdown: number = 3;
  interval!: NodeJS.Timeout;
  detectPopupOpen = signal<boolean>(false);
  private detectionLoopTimer?: ReturnType<typeof setTimeout>;
  private detectionModalCloseTimer?: ReturnType<typeof setTimeout>;
  private detectionModalPresented = false;
  private statusResetTimer?: ReturnType<typeof setTimeout>;
  private enrolledEmbeddings: { employee_id: number; embedding: number[] }[] = [];
  private appStateListener?: PluginListenerHandle;
  private appResumeListener?: PluginListenerHandle;
  private appResumeRestartTimer?: ReturnType<typeof setTimeout>;
  locationStatus = signal<LocationStatus>('checking');
  locationStatusMessage = signal<string>('');
  licenseWarningMessage = signal<string>('');
  isFaceDetected = signal<boolean>(false);
  faceDebugInfo = signal<string>('');
  private locationPayload: AttendanceCoordinates | null = null;
  private locationPayloadCapturedAt = 0;
  private hasPreciseLocationPermission = true;
  recognizerEnabled = true;
  private menuSub?: any;
  isMenuOpen: boolean = false;

  private faceMatcherWorker?: Worker;
  isAdminUser = false;
  employees!: LocalEmployees[];
  currentEmployeeSignal = signal<LocalEmployees | undefined>(undefined);
  isAdminUserSignal = signal<boolean>(false);

  private isEmployeeTrackingEnabled(emp?: LocalEmployees): boolean {
    if (!emp) return false;
    return emp.track_employee === true || (emp.track_employee as any) === 1 || (emp.track_employee as any) === '1' || (emp.track_employee as any) === 'true';
  }

  isLocationRequired = computed(() => {
    if (this.isAdminUserSignal()) return false;
    return this.isEmployeeTrackingEnabled(this.currentEmployeeSignal());
  });

  isLocationReady = computed(() => {
    if (!this.isLocationRequired()) return true;
    return this.locationStatus() === 'enabled';
  });

  locationButtonIcon = computed(() => {
    return this.isLocationReady() ? 'locate' : 'location-outline';
  });

  recognizerIcon = computed(() => {
    return 'camera';
  });

  isRecognizerRunning = computed(() => {
    return this.recognizerEnabled && this.isCameraStarted();
  });

  openCountdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
    this.showTimer = false;
    void this.closeCountdown();
  }

  async closeCountdown(): Promise<void> {
    clearInterval(this.interval);
    this.showTimer = false;

    if (!this.recognizerEnabled) {
      return;
    }

    const locationReady = await this.ensureLocationReady(true);
    if (!locationReady) {
      return;
    }

    if (this.enrolledEmbeddings.length === 0) {
      this.storage.showToast({
        message: this.t('NO_FACE_SAMPLES_FOUND'),
        position: "top",
        color: "warning",
        duration: 2000
      })
    }
    else {
      this.startDetectionLoop();
    }
  }

  async goTo(page: string): Promise<void> {
    await this.router.navigateByUrl(page);
  }

  async stopRecognition(): Promise<void> {
    const lifecycleToken = ++this.cameraLifecycleToken;
    this.loading = true;
    this.clearRecognitionTimers();
    this.isProcessing = false;

    await this.runCameraOperation(async () => {
      try {
        const cameraStatus = await CapgoCameraPreview.isRunning();
        if (cameraStatus.isRunning || this.isCameraStarted()) {
          await CapgoCameraPreview.stop({ force: true });
        }
      } catch (error) {
        console.warn('Error stopping camera preview:', error);
      } finally {
        if (lifecycleToken === this.cameraLifecycleToken) {
          this.isCameraStarted.set(false);
          this.loading = false;
        }
      }
    });
  }

  async ionViewWillLeave(): Promise<void> {
    this.isDestroyed = true;
    console.log("will leave");
    await this.stopRecognition();
  }

  async ionViewDidLeave(): Promise<void> {
    this.isDestroyed = true;
    console.log("leave");
    await CapgoKeepAwake.allowSleep().then(() => {
      console.log("allowed sleep")
    }).catch((errorval) => {
      console.log(errorval, "error val")
    });

  }
  async ngOnInit() {
    if (typeof Worker !== 'undefined') {
      this.faceMatcherWorker = new Worker(new URL('../face-matcher.worker', import.meta.url), { type: 'module' });
    }
    this.setupLocationListener();
    this.menuSub = this.storage.menuState$.subscribe(isOpen => {
      this.isMenuOpen = isOpen;
      if (isOpen) {
        void this.stopRecognition();
      } else {
        if (!this.isDestroyed && this.recognizerEnabled && !this.storage.isNavigatingFromMenu) {
          this.startCamera().then(async () => {
            await this.restartRecognitionIfReady(300, false);
          });
        }
      }
    });
  }
  async ionViewDidEnter(): Promise<void> {
    await this.menuCtrl.enable(true, 'global-menu');

    this.isDestroyed = false;
    this.appActive = true;
    this.isProcessing = false;
    this.loading = false;

    let creds: LocalCredentials = await this.storage.getCredentials();
    this.isAdminUser = creds?.is_admin_user === true;
    this.isAdminUserSignal.set(this.isAdminUser);
    if (creds) {
      this.check_in_delay_sec.set(creds.check_in_delay ? durationToSeconds(creds.check_in_delay) : 30);
      this.check_out_delay_sec.set(creds.check_out_delay ? durationToSeconds(creds.check_out_delay) : 60);
    }
    // Network.addListener('networkStatusChange', status => {
    //   //console.log('Network status changed', status);
    //   this.online = status.connected;
    // });
    await CapgoKeepAwake.keepAwake();
    await this.startCamera();

    this.loading = true;
    this.debugMessage = "odoo login"
    // await this.odoo.login();
    // this.employees = await this.odoo.getEmployees();
    const currentEmployee = await this.storage.ensureCurrentEmployeeLoaded();
    this.currentEmployeeSignal.set(currentEmployee);
    if (this.isAdminUser) {
      this.employees = await this.storage.getAllEmployees();
      if (this.storage.isNetworkAvailable && this.employees.length === 0) {
        await this.storage.syncUsers();
        this.employees = await this.storage.getAllEmployees();
      }
    } else {
      this.employees = currentEmployee ? [currentEmployee] : [];
    }
    //console.log(this.employees, "emmmps")
    this.debugMessage = "loading models"
    // await this.loadModels();

    // let camstatus: { value: boolean; } = await CameraPreview.isCameraStarted();
    let camstatus: { isRunning: boolean; } = await CapgoCameraPreview.isRunning();
    //console.log(camstatus, "dddd")
    // if (camstatus.isRunning) {
    //   await CapgoCameraPreview.stop()
    // }
    await Promise.all([
      this.loadFaceMatcher(),
      this.storage.warmUpModel()
    ]);
    this.setupCanvas();
    this.loading = false;
    // this.debugMessage="Starting camera"
    // await this.startCamera().then(()=>{
    //    this.startDetectionLoop();
    // });
    this.debugMessage = "Loading face data";
    // Load descriptors from storage
    if (this.storage.isNetworkAvailable && (this.isAdminUser || currentEmployee?.odoo_id)) {
      let dt: Date = new Date();
      let dateStr: string = dt.toISOString().split('T')[0];
      const employeeId = this.isAdminUser ? undefined : (currentEmployee?.odoo_id ?? undefined);
      let today_attendances: LocalAttendance[] = await this.att.retrieveAttendance(dateStr, employeeId);
      if (today_attendances.length === 0) {
        const domain: any[] = [
          ["check_in", "ilike", `${dateStr}%`],
          ["employee_id.company_id", "=", this.storage.selected_company?.id]
        ];
        if (employeeId) {
          domain.push(["employee_id", "=", employeeId]);
        }
        this.att.fetchAttendanceFromOdoo(domain)
      }
    }

    const locationReady = await this.refreshLocationStatus(true);
    if (locationReady && this.recognizerEnabled) {
      this.openCountdown();
    }

  }



  // --- Setup Methods ---



  async loadFaceMatcher(): Promise<void> {
    const data = await Preferences.get({ "key": "enrollments" });
    const allEmployees = await this.storage.getAllEmployees();

    let enrolledUsers: FaceDataStructure[] = data?.value ? JSON.parse(data.value) : [];

    // Also include any employee who has face_descriptor_sample in SQLite
    for (const emp of allEmployees) {
      const empId = Number(emp.odoo_id || emp.id);
      if (emp.is_enrolled && emp.face_descriptor_sample && empId) {
        try {
          const sample = JSON.parse(emp.face_descriptor_sample);
          if (Array.isArray(sample) && sample.length > 0) {
            const existingIndex = enrolledUsers.findIndex(u => Number(u.employee_id) === empId);
            const userPayload: FaceDataStructure = {
              employee_id: empId,
              descriptor: sample,
              label: empId
            };
            if (existingIndex >= 0) {
              enrolledUsers[existingIndex] = userPayload;
            } else {
              enrolledUsers.push(userPayload);
            }
          }
        } catch (e) {}
      }
    }

    const validIds = new Set(
      allEmployees.flatMap((emp) => [emp.odoo_id?.toString(), emp.id?.toString()]).filter(Boolean)
    );

    this.enrolledEmbeddings = [];
    let needsReExtraction = false;

    for (const user of enrolledUsers) {
      const userEmpId = user.employee_id?.toString();
      if (!userEmpId || (validIds.size > 0 && !validIds.has(userEmpId))) continue;

      const descriptorList = Array.isArray(user.descriptor?.[0])
        ? user.descriptor
        : [user.descriptor];
      const validVectors = descriptorList
        .map((descriptor: any) => Array.from(descriptor || []) as number[])
        .filter((vector: number[]) => vector.length === 192);

      if (validVectors.length > 0) {
        validVectors.forEach((vector: number[]) => {
          this.enrolledEmbeddings.push({
            employee_id: Number(user.employee_id),
            embedding: vector
          });
        });
      } else {
        needsReExtraction = true;
      }
    }

    const enrolledWithPhoto = allEmployees.filter(e => e.is_enrolled && e.image_1024 && e.image_1024 !== 'false');

    if (needsReExtraction || (enrolledWithPhoto.length > 0 && this.enrolledEmbeddings.length === 0)) {
      console.log('🔄 Re-extracting 192-dim TFLite embeddings for enrolled employees...');
      const newDescriptors = await this.storage.generateLabeledDescriptors(allEmployees as any, "offline");
      if (newDescriptors.length > 0) {
        await Preferences.set({ "key": "enrollments", "value": JSON.stringify(newDescriptors) });
        this.enrolledEmbeddings = newDescriptors.map(d => ({
          employee_id: Number(d.employee_id),
          embedding: d.descriptor[0]
        }));
      }
    }

    if (this.enrolledEmbeddings.length > 0) {
      console.log(`✅ Loaded ${this.enrolledEmbeddings.length} employees into TFLite Matcher`);
    } else {
      this.debugMessage = 'No valid descriptors found for current employees.';
    }
  }

  private runCameraOperation(operation: () => Promise<void>): Promise<void> {
    const nextOperation = this.cameraOperation
      .catch(() => undefined)
      .then(operation);
    this.cameraOperation = nextOperation.catch(() => undefined);
    return nextOperation;
  }

  async startCamera(): Promise<void> {
    const lifecycleToken = ++this.cameraLifecycleToken;

    await this.runCameraOperation(async () => {
      if (lifecycleToken !== this.cameraLifecycleToken || this.isDestroyed || this.isMenuOpen) {
        return;
      }

      try {
        const parentElementId = this.cameraRef.nativeElement.id || 'cameraPreview';
        this.cameraRef.nativeElement.id = parentElementId;

        const cameraOptions: CapgoCameraPreviewOptions = {
          position: 'front',
          width: window.screen.width,
          height: window.screen.height,
          toBack: true,
          disableAudio: true,
          storeToFile: false,
          x: 0,
          y: 0,
          aspectMode: 'cover'
        };
        if ((await CapgoCameraPreview.isRunning()).isRunning) {

          // if (await CameraPreview.isCameraStarted()) {
          await CapgoCameraPreview.stop({ force: true })
        };

        if (lifecycleToken !== this.cameraLifecycleToken || this.isDestroyed || this.isMenuOpen) {
          return;
        }

        await CapgoCameraPreview.start(cameraOptions);
        if (lifecycleToken !== this.cameraLifecycleToken || this.isDestroyed || this.isMenuOpen) {
          await CapgoCameraPreview.stop({ force: true });
          return;
        }

        this.isCameraStarted.set(true);
        this.loading = false;
        this.debugMessage = 'Camera started. Scanning for faces...';
      } catch (error) {
        if (lifecycleToken === this.cameraLifecycleToken) {
          this.loading = false;
          this.isCameraStarted.set(false);
          this.debugMessage = 'Camera error - check permissions.';
        }
        console.error('Error starting camera:', error);
      }
    });
  }

  setupCanvas(): void {
    setTimeout(() => {
      const canvas = this.overlayRef.nativeElement;
      const width = window.screen.width;
      const height = window.screen.height; // ❌ don’t subtract 300px
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.zIndex = '999';
    }, 500);
  }


  // setupCanvas() {
  //   // ... (Same canvas setup logic as in EnrollPage) ...
  //   setTimeout(() => {
  //     const canvas = this.overlayRef.nativeElement;
  //     canvas.width = window.innerWidth;
  //     canvas.height = window.innerHeight;
  //     canvas.style.width = canvas.width + 'px';
  //     canvas.style.height = canvas.height + 'px';
  //   }, 500);
  // }

  async checkIfModelsLoaded(): Promise<boolean> {
    return true;
  }

  // --- Recognition Loop ---

  async startDetectionLoop(): Promise<void> {
    if (this.detectionLoopTimer) {
      clearTimeout(this.detectionLoopTimer);
      this.detectionLoopTimer = undefined;
    }

    if (!this.appActive || this.isDestroyed || this.detectPopupOpen() || this.isProcessing || !this.recognizerEnabled || this.isMenuOpen) {
      return;
    }

    if (!this.isLocationReady()) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.runRecognition();
    } catch (err) {
      console.error("Loop Error:", err);
    } finally {
      if (!this.detectPopupOpen() && this.operation() === '') {
        this.isProcessing = false;
        this.scheduleNextDetection();
      }
    }
  }

  private scheduleNextDetection(delay = DETECTION_INTERVAL_MS): void {
    if (this.detectionLoopTimer) {
      clearTimeout(this.detectionLoopTimer);
    }

    this.detectionLoopTimer = setTimeout(() => {
      this.detectionLoopTimer = undefined;

      if (this.appActive && !this.isDestroyed && this.recognizerEnabled && !this.detectPopupOpen() && !this.isProcessing && this.operation() === '' && !this.isMenuOpen) {
        this.startDetectionLoop();
      }
    }, delay);
  }

  private clearRecognitionTimers(): void {
    if (this.detectionLoopTimer) {
      clearTimeout(this.detectionLoopTimer);
      this.detectionLoopTimer = undefined;
    }

    if (this.interval) {
      clearInterval(this.interval);
    }
    this.showTimer = false;
  }

  private async restartRecognitionIfReady(delay = 300, promptOnFailure = false): Promise<void> {
    if (this.isDestroyed || this.isMenuOpen || !this.recognizerEnabled || this.detectPopupOpen() || this.showTimer) {
      return;
    }

    if (!this.isCameraStarted()) {
      await this.startCamera();
    }

    const locationReady = await this.refreshLocationStatus(promptOnFailure, false);
    if (!locationReady || this.isDestroyed || this.isMenuOpen || !this.recognizerEnabled || this.detectPopupOpen() || this.showTimer) {
      return;
    }

    this.isProcessing = false;
    this.debugMessage = 'Camera started. Scanning for faces...';
    this.scheduleNextDetection(delay);
  }

  private consecutiveUnknowns = 0;
  private lastMatchCandidateId: number | null = null;
  private lastMatchCandidateCount = 0;

  private reusableCropCanvas?: HTMLCanvasElement;

  private async cropToFaceHD(
    originalBase64: string,
    resizedBase64: string,
    face: { x: number; y: number; width: number; height: number },
    paddingPercent = 0.25,
    maxDimension = 1024
  ): Promise<string> {
    return new Promise((resolve) => {
      const origImg = new Image();
      const resizedImg = new Image();

      const origSrc = originalBase64.startsWith('data:')
        ? originalBase64
        : `data:image/jpeg;base64,${originalBase64}`;

      const resizedSrc = resizedBase64.startsWith('data:')
        ? resizedBase64
        : `data:image/jpeg;base64,${resizedBase64}`;

      resizedImg.onload = () => {
        origImg.onload = () => {
          try {
            const scaleX = origImg.width / resizedImg.width;
            const scaleY = origImg.height / resizedImg.height;

            const hdX = face.x * scaleX;
            const hdY = face.y * scaleY;
            const hdW = face.width * scaleX;
            const hdH = face.height * scaleY;

            const padX = hdW * paddingPercent;
            const padY = hdH * paddingPercent;

            const cropX = Math.max(0, hdX - padX);
            const cropY = Math.max(0, hdY - padY);
            const cropW = Math.min(origImg.width - cropX, hdW + 2 * padX);
            const cropH = Math.min(origImg.height - cropY, hdH + 2 * padY);

            let targetW = cropW;
            let targetH = cropH;

            if (targetW > targetH && targetW > maxDimension) {
              targetH = (targetH * maxDimension) / targetW;
              targetW = maxDimension;
            } else if (targetH > maxDimension) {
              targetW = (targetW * maxDimension) / targetH;
              targetH = maxDimension;
            }

            if (!this.reusableCropCanvas) {
              this.reusableCropCanvas = document.createElement('canvas');
            }
            const canvas = this.reusableCropCanvas;
            const targetWInt = Math.round(targetW);
            const targetHInt = Math.round(targetH);
            canvas.width = targetWInt;
            canvas.height = targetHInt;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(originalBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
              return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(origImg, cropX, cropY, cropW, cropH, 0, 0, targetWInt, targetHInt);

            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const croppedBase64 = croppedDataUrl.split(',')[1];
            ctx.clearRect(0, 0, targetWInt, targetHInt);
            resolve(croppedBase64);
          } catch (e) {
            resolve(originalBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
          } finally {
            origImg.onload = null;
            origImg.onerror = null;
            resizedImg.onload = null;
            resizedImg.onerror = null;
            origImg.src = '';
            resizedImg.src = '';
          }
        };

        origImg.onerror = () => {
          resolve(originalBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
        };

        origImg.src = origSrc;
      };

      resizedImg.onerror = () => {
        resolve(originalBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
      };

      resizedImg.src = resizedSrc;
    });
  }

  private async cropToFace(
    base64Str: string,
    face: { x: number; y: number; width: number; height: number; headEulerAngleZ?: number; headEulerAngleY?: number },
    paddingPercent = 0.35
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      const cleanData = base64Str.startsWith('data:')
        ? base64Str
        : `data:image/jpeg;base64,${base64Str}`;

      img.onload = () => {
        try {
          const tiltAngleDeg = typeof face.headEulerAngleZ === 'number' ? face.headEulerAngleZ : 0;
          const absTilt = Math.abs(tiltAngleDeg);

          // For larger tilt angles (> 15 deg), expand padding so rotation doesn't clip face corners
          const dynamicPadding = absTilt > 15 ? 0.45 : paddingPercent;
          const faceSize = Math.max(face.width, face.height);
          const cropSize = Math.round(faceSize * (1 + 2 * dynamicPadding));

          const centerX = face.x + face.width / 2;
          const centerY = face.y + face.height / 2;

          if (!this.reusableCropCanvas) {
            this.reusableCropCanvas = document.createElement('canvas');
          }
          const canvas = this.reusableCropCanvas;
          canvas.width = cropSize;
          canvas.height = cropSize;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Str.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
            return;
          }

          ctx.save();
          ctx.translate(cropSize / 2, cropSize / 2);
          if (absTilt > 2) {
            const angleRad = (tiltAngleDeg * Math.PI) / 180;
            ctx.rotate(-angleRad);
          }

          ctx.drawImage(img, -centerX, -centerY);
          ctx.restore();

          const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const croppedBase64 = croppedDataUrl.split(',')[1];
          ctx.clearRect(0, 0, cropSize, cropSize);
          resolve(croppedBase64);
        } catch (e) {
          resolve(base64Str.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
        } finally {
          img.onload = null;
          img.onerror = null;
          img.src = '';
        }
      };

      img.onerror = () => {
        resolve(base64Str.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, ''));
      };

      img.src = cleanData;
    });
  }

  async runRecognition(): Promise<void> {
    if (!this.appActive || this.loading || this.detectPopupOpen() || this.isDestroyed || !this.recognizerEnabled || this.isMenuOpen) return;

    // Don't force width/height in native capture, as it may incorrectly crop or squash the aspect ratio!
    const photo = await CapgoCameraPreview.capture({ quality: 50 });
    if (!photo?.value) return;

    try {
      const dataUri = `data:image/jpeg;base64,${photo.value.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, '')}`;
      const resizedBase64 = await this.storage.resizeBase64Image(dataUri);
      const cleanBase64 = resizedBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, '');

      const detectionResult = await FaceRecognition.detectFaces({ imageBase64: cleanBase64 });
      if (!detectionResult || !detectionResult.faces || detectionResult.faces.length === 0) {
        this.consecutiveUnknowns = 0;
        this.isFaceDetected.set(false);
        this.faceDebugInfo.set('');
        return;
      }

      this.isFaceDetected.set(true);

      // Select nearest face (face with the largest bounding box area width * height)
      const nearestFace = detectionResult.faces.reduce((max, f) =>
        (f.width * f.height > max.width * max.height ? f : max), detectionResult.faces[0]
      );

      const rollDeg = typeof nearestFace.headEulerAngleZ === 'number' ? nearestFace.headEulerAngleZ.toFixed(1) : '0';
      const yawDeg = typeof nearestFace.headEulerAngleY === 'number' ? nearestFace.headEulerAngleY.toFixed(1) : '0';
      this.faceDebugInfo.set(`Face Detected (Roll: ${rollDeg}°, Yaw: ${yawDeg}°)`);

      // Skip frame and prompt user to face forward if head is turned sideways (yaw > 25 deg)
      const yawAngle = typeof nearestFace.headEulerAngleY === 'number' ? Math.abs(nearestFace.headEulerAngleY) : 0;
      if (yawAngle > 25) {
        this.debugMessage = 'Please face the camera';
        return;
      }

      const tiltAngleDeg = typeof nearestFace.headEulerAngleZ === 'number' ? nearestFace.headEulerAngleZ : 0;
      let featureInputBase64 = cleanBase64;

      if (Math.abs(tiltAngleDeg) > 4) {
        try {
          featureInputBase64 = await this.storage.rotateBase64Image(cleanBase64, tiltAngleDeg);
        } catch (e) {
          featureInputBase64 = cleanBase64;
        }
      }

      let featureResult = await FaceRecognition.extractFaceFeature({ imageBase64: featureInputBase64 });

      if (!featureResult || !featureResult.embedding || featureResult.embedding.length === 0) {
        featureInputBase64 = cleanBase64;
        featureResult = await FaceRecognition.extractFaceFeature({ imageBase64: cleanBase64 });
      }

      if (!featureResult || !featureResult.embedding || featureResult.embedding.length === 0) {
        this.consecutiveUnknowns = 0;
        return;
      }

      const currentEmbedding = featureResult.embedding;
      let bestMatchScore = -1;
      let secondBestMatchScore = -1;
      let bestMatchEmployeeId: number | null = null;

      if (this.faceMatcherWorker) {
        const currentVector = new Float32Array(currentEmbedding);
        const workerResult: any = await new Promise((resolve) => {
          this.faceMatcherWorker!.onmessage = ({ data }) => resolve(data);
          this.faceMatcherWorker!.postMessage(
            { currentEmbedding: currentVector.buffer, enrolledEmbeddings: this.enrolledEmbeddings },
            [currentVector.buffer]
          );
        });
        bestMatchScore = workerResult.bestMatchScore;
        secondBestMatchScore = workerResult.secondBestMatchScore ?? -1;
        bestMatchEmployeeId = workerResult.bestMatchEmployeeId;
      } else {
        for (const emp of this.enrolledEmbeddings) {
          const score = calculateCosineSimilarity(currentEmbedding, emp.embedding);
          if (score > bestMatchScore) {
            secondBestMatchScore = bestMatchScore;
            bestMatchScore = score;
            bestMatchEmployeeId = emp.employee_id;
          } else if (score > secondBestMatchScore) {
            secondBestMatchScore = score;
          }
        }
      }

      const margin = bestMatchScore - secondBestMatchScore;
      const isHighConfidenceMatch = bestMatchScore >= HIGH_CONFIDENCE_THRESHOLD;
      const isMarginConfidentMatch = bestMatchScore >= MIN_MATCH_THRESHOLD && margin >= MARGIN_CONFIDENCE_DELTA;

      if (bestMatchScore >= MIN_MATCH_THRESHOLD && bestMatchEmployeeId !== null) {
        if (this.lastMatchCandidateId === bestMatchEmployeeId) {
          this.lastMatchCandidateCount++;
        } else {
          this.lastMatchCandidateId = bestMatchEmployeeId;
          this.lastMatchCandidateCount = 1;
        }
      } else {
        this.lastMatchCandidateId = null;
        this.lastMatchCandidateCount = 0;
      }

      const isMultiFrameConfirmed = this.lastMatchCandidateCount >= 2;
      const isMatchAccepted = isHighConfidenceMatch || (isMarginConfidentMatch && isMultiFrameConfirmed);

      console.log(`[FaceMatch] score=${bestMatchScore.toFixed(3)}, margin=${margin.toFixed(3)}, candidateCount=${this.lastMatchCandidateCount}, accepted=${isMatchAccepted}`);

      if (isMatchAccepted && bestMatchEmployeeId !== null) {
        if (Capacitor.getPlatform() !== 'web') {
          try {
            const liveness = await FaceRecognition.checkLiveness({ imageBase64: cleanBase64 });
            console.log(`[Attendance Liveness] isLive: ${liveness.isLive}, score: ${liveness?.score}`);

            // Only block if score is clearly a spoof (< 0.25)
            if (liveness && liveness.score !== undefined && liveness.score < 0.25) {
              this.debugMessage = `Spoofing detected! (Score: ${liveness.score.toFixed(2)})`;
              this.consecutiveUnknowns = 0;
              this.lastMatchCandidateId = null;
              this.lastMatchCandidateCount = 0;
              return;
            }
          } catch (livenessError) {
            console.warn('Liveness check skipped/errored:', livenessError);
          }
        }

        this.consecutiveUnknowns = 0;
        this.lastMatchCandidateId = null;
        this.lastMatchCandidateCount = 0;

        await this.handleSuccessfulMatch({ label: bestMatchEmployeeId.toString() }, featureInputBase64 || cleanBase64);
        return;
      } else if (bestMatchScore < MIN_MATCH_THRESHOLD) {
        this.consecutiveUnknowns++;
        if (this.consecutiveUnknowns >= UNKNOWN_CONFIRMATION_FRAMES) {
          this.consecutiveUnknowns = 0;
          this.lastMatchCandidateId = null;
          this.lastMatchCandidateCount = 0;
          this.isProcessing = true;
          this.operation.set(false);
          this.detectedEmployee.set({ display_name: "Unknown" });

          let unknown_text = `${this.storage.translate.instant("NOT_ENROLLED")}`;
          await this.storage.playAudio(unknown_text);

          this.statusResetTimer = setTimeout(() => {
            this.statusResetTimer = undefined;
            this.resetDetectionState();
            this.isProcessing = false;

            this.scheduleNextDetection();
          }, 2000);
          return;
        }
      }
    } catch (err) {
      this.consecutiveUnknowns = 0;
    }
  }

  // Helper to clear image memory
  private cleanupImage(img: HTMLImageElement) {
    img.onload = null;
    img.onerror = null;
    img.src = "";
  }

  // async runRecognition(): Promise<void> {
  //   if (this.loading || this.detectPopupOpen) return;

  //   const photo = await CapgoCameraPreview.capture({ quality: 40 });
  //   if (!photo?.value) return;

  //   let resizedBase64: string | null = await this.storage.resizeBase64Image(photo.value);
  //   const img = this.storage.originalImg;
  //   const angles = [0, 90, 180, 270];

  //   try {
  //     for (const ori of angles) {
  //       if (this.isDestroyed || this.detectPopupOpen) break;

  //       let currentRotation = (ori === 0) ? resizedBase64 : await this.storage.rotateBase64Image(resizedBase64!, ori);
  //       const cleanBase64 = currentRotation!.replace(/\s/g, '');

  //       await new Promise((resolve, reject) => {
  //         img.onload = resolve;
  //         img.onerror = reject;
  //         img.src = `data:image/jpeg;base64,${cleanBase64}`;
  //       });

  //       // STEP 1: ONLY DETECT FACE (Like EnrollPage)
  //       const simpleDetection = await faceapi.detectSingleFace(img, this.detectionOptions);
  //       // STEP 2: IF FACE FOUND, THEN DO HEAVY DESCRIPTOR WORK
  //       if (simpleDetection && simpleDetection.score > 0.4) {
  //         const fullDetection = await faceapi.detectSingleFace(img, this.detectionOptions)
  //           .withFaceLandmarks()
  //           .withFaceDescriptor();


  //         if (fullDetection && this.faceMatcher) {
  //           console.log("enter condition")
  //           const bestMatch = this.faceMatcher.findBestMatch(fullDetection.descriptor);
  //           console.log(bestMatch, "best match")
  //           if (bestMatch.label !== 'unknown') {
  //             await this.handleSuccessfulMatch(bestMatch, cleanBase64);
  //             setTimeout(() => {
  //               this.startDetectionLoop();
  //             }, 2000);
  //             return;
  //           }
  //           else if (bestMatch.label === "unknown") {
  //             this.operation = false;
  //             setTimeout(() => {
  //               this.startDetectionLoop()
  //             }, 1500);
  //           }
  //         }
  //       }
  //       else{
  //         this.isProcessing = false;
  //         setTimeout(() => {
  //           this.startDetectionLoop();
  //         }, 800);

  //       }

  //       img.src = ""; // Cleanup
  //     }
  //   } finally {
  //     resizedBase64 = null;
  //   }
  // }

  private async handleSuccessfulMatch(bestMatch: { label: string }, frameData: string) {
    const matchId = parseInt(bestMatch.label);
    const filteredEmp = this.employees.find(emp => Number(emp.odoo_id) === matchId);

    if (!filteredEmp) {
      this.isProcessing = false;
      return;
    }

    try {
      if (!this.recognizerEnabled) {
        this.isProcessing = false;
        return;
      }

      this.isProcessing = true; // Loop-ai lock pannunga
      const isRecent = await this.attservice.isWithinDuration(filteredEmp.odoo_id!);

      this.detectedEmployee.set(filteredEmp);
      this.detectedImage.set(frameData);

      if (!isRecent.withinLimit) {
        let requireLocation = false;
        if (!this.isAdminUser && this.isEmployeeTrackingEnabled(filteredEmp)) {
          requireLocation = true;
        }

        let locationPayload: AttendanceCoordinates | null = null;
        if (requireLocation) {
          locationPayload = await this.captureAttendanceLocation();
          if (!locationPayload) {
            await this.storage.showToast({
              message: this.t('LOCATION_REQUIRED_TO_MARK_ATTENDANCE'),
              position: 'top',
              color: 'warning',
              duration: 2000
            });
            this.resetDetectionState();
            this.isProcessing = false;
            return;
          }
        }

        // --- CASE 1: ATTENDANCE SUCCESS (Popup Venum) ---
        const offlineSync = await this.attservice.saveOfflineAttendance(filteredEmp, frameData, locationPayload);
        this.time.set(offlineSync.time);
        this.operation.set(offlineSync.operation);

        this.openDetectionStatusModal();
        await this.storage.playAudio(this.getGreetingText());

      } else {
        // --- CASE 2: RECENT LOG (Popup VENAAM) ---
        this.operation.set((isRecent.operation === "in") ? "recent_in" : "recent_out");

        // Popup illama audio mattum play pannuvom
        await this.storage.playAudio(this.getGreetingText());

        // Popup illathathaal udane reset (2.5s delay podhum)
        this.statusResetTimer = setTimeout(() => {
          this.statusResetTimer = undefined;
          this.resetDetectionState();
          this.isProcessing = false;
          this.scheduleNextDetection();
        }, 2500);
      }

    } catch (error) {
      console.error("Error in match handling:", error);
      this.resetDetectionState();
      this.isProcessing = false;
      this.startDetectionLoop();
    }
  }


  private openDetectionStatusModal(): void {
    this.detectionModalPresented = false;
    this.detectPopupOpen.set(true);

    this.detectionModalCloseTimer = setTimeout(() => {
      this.closeDetectionStatusModal();
    }, 3000);
  }

  private closeDetectionStatusModal(): void {
    this.detectPopupOpen.set(false);
  }

  private resetDetectionState() {
    this.consecutiveUnknowns = 0;
    this.lastMatchCandidateId = null;
    this.lastMatchCandidateCount = 0;
    if (this.detectionLoopTimer) {
      clearTimeout(this.detectionLoopTimer);
      this.detectionLoopTimer = undefined;
    }
    if (this.detectionModalCloseTimer) {
      clearTimeout(this.detectionModalCloseTimer);
      this.detectionModalCloseTimer = undefined;
    }
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
      this.statusResetTimer = undefined;
    }
    this.operation.set("");
    this.detectedEmployee.set(undefined);
    this.detectPopupOpen.set(false); // Idhu dhaan popup-ah close pannum
    this.detectedImage.set("");
    this.isFaceDetected.set(false);
    this.faceDebugInfo.set('');
    this.clearOverlay();
  }

  handleDetectionModalPresent(): void {
    this.detectionModalPresented = true;
  }

  handleDetectionModalDismiss(): void {
    if (!this.detectionModalPresented && this.detectPopupOpen()) {
      return;
    }

    this.resetDetectionState();
    this.detectionModalPresented = false;
    this.isProcessing = false;

    if (!this.isDestroyed && this.recognizerEnabled) {
      this.scheduleNextDetection();
    }
  }

  private getGreetingText(): string {
    const name = this.detectedEmployee()?.display_name || '';
    const trans = (key: string) => this.storage.translate.instant(key);

    if (this.operation() === "in") return `${trans("COME_IN")} ${name}`;
    if (this.operation() === "out") return `${trans("GOOD_BYE")} ${name}`;
    if (this.operation() === "recent_in") return `${trans("IMMEDIATE_LOGIN_AUDIO")} ${name}`;
    if (this.operation() === "recent_out") return `${trans("IMMEDIATE_LOGOUT_AUDIO")} ${name}`;
    return "";
  }

  private t(key: string): string {
    return this.storage.translate.instant(key);
  }


  // async runRecognition(): Promise<void> {
  //   this.detectedImage = "";
  //   this.detectPopupOpen = false;
  //   this.operation = "";
  //   // Flag to prevent race conditions (BEST PRACTICE, though you may need to implement the isProcessingFrame flag mentioned previously)
  //   // For now, focus on fixing the image load flow.

  //   try {
  //     if (!this.loading) {
  //       this.clearOverlay();
  //     }

  //     // let cameraStatus = await CameraPreview.isCameraStarted();

  //     // if (!cameraStatus.value && this.router.url === "/home") {
  //     //   setTimeout(() => {
  //     //     this.operation = null
  //     //     this.detectedEmployee = undefined;
  //     //     this.startDetectionLoop();
  //     //   }, 2000);

  //     // };

  //     // 1. Capture frame with fixed size/quality
  //     // const photo = await CameraPreview.capture({ quality: 40, });
  //     const photo = await CapgoCameraPreview.capture({ quality: 40, });
  //     if (!photo.value) return;

  //     // 2. Load the captured image data reliably
  //     // CRITICAL FIX: Use a local variable and Promise.



  //     // img.src = `data:image/jpeg;base64,${photo.value}`;

  //     // Wait for the image to fully decode and load BEFORE detection starts


  //     // 3. Perform Detection and Descriptor Extraction
  //     let img: HTMLImageElement;
  //     if (await this.checkIfModelsLoaded()) {
  //       //check from here ================================||||||||||

  //       // let imgOrientations = [photo.value];
  //       let fullDetection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection; }, faceapi.FaceLandmarks68>> | undefined;
  //       let bestMatch!: faceapi.FaceMatch;
  //       img = this.storage.originalImg;
  //       let resizedBase64: string = await this.storage.resizeBase64Image(photo.value);

  //       img.src = `data:image/jpeg;base64,${resizedBase64}`;
  //       console.log(img.src, "srcccc")


  //       await new Promise((resolve, reject) => {
  //         img.onload = resolve;
  //         // Handle error in case the base64 data is corrupted
  //         img.onerror = (err) => {
  //           console.error("Image loading error from capture:", err);
  //           reject(new Error("Image Load Failed"));
  //         };
  //       });

  //       //console.log(img.width, img.height, "dimssss")



  //       // let rotatedImage90: string = await this.storage.rotateBase64Image( photo.value, 90);

  //       // let rotatedImage180: string = await this.storage.rotateBase64Image( photo.value, 180);

  //       // let rotatedImage270: string = await this.storage.rotateBase64Image( photo.value, 270);

  //       // let imgOrientations: string[] = [rotatedImage90, photo.value, rotatedImage180, rotatedImage270];
  //       let detected_image: string = ""
  //       let angles = [0, 90, 180, 270];
  //       // for (let ori of imgOrientations) {
  //       for (let ori of angles) {
  //         let rotated = (ori == 0) ? resizedBase64 : await this.storage.rotateBase64Image(resizedBase64, ori)
  //         rotated = rotated.replace(/[\r\n]/g, '');
  //         // let resizeBase64Image=await this.storage.resizeBase64Image(ori,224)
  //         img.src = `data:image/jpeg;base64,${rotated}`
  //         // const canvas = faceapi.createCanvasFromMedia(img);
  //         // const displaySize = { width: img.width, height: img.height };
  //         // faceapi.matchDimensions(canvas, displaySize);
  //         fullDetection = await faceapi.detectSingleFace(img, this.detectionOptions)
  //           .withFaceLandmarks()
  //           .withFaceDescriptor();


  //         //console.log(fullDetection, "detection")
  //         if (fullDetection && this.faceMatcher) {
  //           await this.clearOverlay()
  //           // await this.drawDetections(fullDetection.detection, img.width, img.height, "");
  //           // const displaySize = { width: 224, height: 240 }
  //           // fullDetection= faceapi.resizeResults(fullDetection, displaySize)
  //           // fullDetection=faceapi.resizeResults(fullDetection,displaySize);
  //           bestMatch = this.faceMatcher.findBestMatch(fullDetection.descriptor);
  //           if (bestMatch.label !== 'unknown') {
  //             console.log(bestMatch, "bestttttm")
  //             detected_image = rotated
  //             this.detectedImage = rotated;
  //             break
  //           }
  //           else if (bestMatch.label === "unknown") {
  //             continue
  //           }

  //         }
  //         if (!fullDetection) {
  //           // this.clearOverlay()
  //           continue
  //         }

  //       }
  //       if (!fullDetection || !fullDetection.descriptor || fullDetection.descriptor.length !== 128) {
  //         // this.clearOverlay()
  //         this.debugMessage = 'No face or invalid descriptor detected (Length != 128).';

  //         if (fullDetection) {
  //           // Draw detection box if a face was detected, even if descriptor failed

  //         }
  //         setTimeout(() => {
  //           this.operation = ""
  //           this.detectedEmployee = undefined;
  //           this.detectPopupOpen = false;
  //           this.startDetectionLoop();
  //         }, 200);

  //         // DO NOT PROCEED TO FACE MATCHER, which prevents the crash.
  //         return;
  //       }


  //       // 4. Clear canvas immediately
  //       // this.clearOverlay();

  //       //console.log('angles');



  //       // 5. CRITICAL CHECK: Validate the live descriptor length BEFORE matching


  //       // --- Only proceed if detection is valid (Length == 128) ---

  //       if (this.faceMatcher && fullDetection) {
  //         this.operation = ""
  //         // 6. Perform Recognition (Safe to call now)
  //         //console.log(fullDetection.descriptor, "descccccc");


  //         let recognizedLabel: string = bestMatch.label === 'unknown'
  //           ? `Unknown (${bestMatch.distance.toFixed(2)})`
  //           : `${bestMatch.label} (${(1 - bestMatch.distance).toFixed(2)})`;
  //         recognizedLabel = "";
  //         this.debugMessage = `Detected: ${recognizedLabel}`;
  //         // await this.drawDetections(fullDetection.detection, img.width, img.height, recognizedLabel);
  //         //console.log(bestMatch, "best matchhh")
  //         if (bestMatch) {

  //           if (bestMatch.label !== 'unknown') {

  //             //console.log(bestMatch.label, "labbbbb")
  //             //console.log(this.employees, bestMatch.label, "emplll")
  //             let filteredEmp: LocalEmployees[] = this.employees.filter(emp => emp.odoo_id != null && emp.odoo_id === parseInt(bestMatch.label))
  //             //console.log(bestMatch.label, filteredEmp)
  //             // recognizedLabel=`Hi ${bestMatch.label}`;
  //             this.debugMessage = `Hi ${filteredEmp[0].display_name}`;
  //             this.detectedEmployee = filteredEmp[0];

  //             //stop recognition
  //             // clearInterval(this.detectionTimer);
  //             //get employee id,user id and log attendance
  //             let employee_id: number | null = ("odoo_id" in this.detectedEmployee) ? this.detectedEmployee['odoo_id'] : 0;
  //             //console.log(employee_id, "check attendance")
  //             let isRecent: { withinLimit: boolean; operation: "" | "in" | "out"; } | { withinLimit: boolean; operation: boolean; } = employee_id != null ? await this.attservice.isWithinDuration(employee_id) : { "withinLimit": true, operation: false };
  //             //console.log(isRecent,"isrecenn")

  //             // //console.log(this.detectPopupOpen, "is recenttt")

  //             //console.log(this.detectedEmployee,isRecent,this.detectPopupOpen,'ispopen')
  //             if (isRecent.withinLimit) {
  //               //console.log(this.operation,"operation test")
  //               this.operation = (isRecent.operation === "in") ? "recent_in" : (isRecent.operation === "out") ? "recent_out" : this.operation;
  //               //  this.storage.playAudio();
  //             }

  //             else if (!isRecent.withinLimit) {
  //               this.detectPopupOpen = this.detectedEmployee && this.detectedEmployee?.['display_name'] != 'Unknown' && !isRecent.withinLimit;
  //               if (this.detectPopupOpen) {
  //                 let top = await this.modal.getTop();
  //                 if (top) {
  //                   top.dismiss();
  //                 }
  //               }
  //               console.log(this.detectPopupOpen, "popopennn")


  //               let offlineSync: { time: string; operation: "" | "in" | "out"; } = await this.attservice.saveOfflineAttendance(this.detectedEmployee, detected_image);
  //               this.time = offlineSync.time;
  //               this.operation = offlineSync.operation;
  //               console.log(offlineSync, 'offlineSyncofflineSync')
  //               // this.storage.isNetworkAvailable=false //mocking offline
  //               // if (this.storage.isNetworkAvailable) {
  //               //   let logAttendance = await this.odoo.syncAttendance(employee_id, detected_image)
  //               //   if (logAttendance.check_in && logAttendance.check_out) {
  //               //     this.operation = "out"
  //               //     //console.log(this.operation , "updating")
  //               //     this.time = convertToIST(new Date(logAttendance.check_out), "display")

  //               //   }
  //               //   else if (logAttendance.check_in && !logAttendance.check_out) {
  //               //     this.operation = "in";

  //               //     this.time = convertToIST(new Date(logAttendance.check_in), "display")
  //               //   }
  //               //   let isSaved = await this.attservice.saveAttendance(logAttendance, this.detectedEmployee)
  //               // }
  //               // else if(!this.storage.isNetworkAvailable){
  //               //   // add a function in storage to sync attendance offline
  //               //   let offlineSync=await this.attservice.saveOfflineAttendance(this.detectedEmployee,detected_image);
  //               //   this.time=offlineSync.time;
  //               //   this.operation=offlineSync.operation;
  //               // }



  //               //console.log(isSaved, "attendance saved")
  //             }
  //             console.log(this.storage.translate.instant("COME_IN"), "trans")
  //             let greet_text = (this.operation && this.operation === "in") ?
  //               `${this.storage.translate.instant("COME_IN")} ${this.detectedEmployee.display_name}` :
  //               (this.operation && this.operation === "out") ?
  //                 `${this.storage.translate.instant("GOOD_BYE")} ${this.detectedEmployee.display_name}` :
  //                 (this.operation && this.operation === "recent_in") ?
  //                   `${this.storage.translate.instant("IMMEDIATE_LOGIN_AUDIO")} ${this.detectedEmployee.display_name}` :
  //                   (this.operation && this.operation === "recent_out") ?
  //                     `${this.storage.translate.instant("IMMEDIATE_LOGOUT_AUDIO")} ${this.detectedEmployee.display_name}` : '';
  //             console.log(greet_text, "greet text")
  //             await this.storage.playAudio(greet_text);
  //             // add a local log too
  //             //after successful logging restart the loop
  //             setTimeout(() => {
  //               this.operation = ""
  //               this.detectedEmployee = undefined;
  //               this.detectPopupOpen = false;
  //               this.clearOverlay();
  //               this.startDetectionLoop();
  //             }, 2000)
  //           }
  //           else if (bestMatch.label === 'unknown') {
  //             this.operation = false;
  //             let unknown_text = `${this.storage.translate.instant("NOT_ENROLLED")}.${this.storage.translate.instant("PERSON_NOT_ENROLLED")}`
  //             await this.storage.playAudio(unknown_text);
  //             this.detectedEmployee = { display_name: "Unknown" };

  //             setTimeout(() => {
  //               this.operation = ""
  //               this.detectedEmployee = undefined;
  //               this.clearOverlay()
  //               this.detectPopupOpen = false;
  //               this.startDetectionLoop();
  //             }, 2000)
  //           }
  //           // this.clearDetections(fullDetection.detection, img.width, img.height, recognizedLabel);
  //         }



  //       } else {
  //         this.debugMessage = 'Face detected, but Matcher not loaded.';
  //         // await this.drawDetections(fullDetection.detection, img.width, img.height, 'Matcher Missing');
  //       }
  //     }
  //     else {
  //       setTimeout(() => {
  //         this.operation = ""
  //         this.detectedEmployee = undefined;
  //         this.detectPopupOpen = false;
  //         this.startDetectionLoop();
  //       }, 200)
  //     }



  //   } catch (error) {
  //     console.error('Recognition loop error:', error);
  //     this.detectPopupOpen = false;
  //     this.startDetectionLoop()
  //     this.debugMessage = `Error in loop: Check console.`;
  //   }
  // }



  async clearOverlay(): Promise<void> {
    this.overlayRef.nativeElement.getContext('2d')?.clearRect(0, 0, this.overlayRef.nativeElement.width, this.overlayRef.nativeElement.height);
  }

  async onLocationStatusClick(): Promise<void> {
    const locationReady = await this.refreshLocationStatus(true);
    if (locationReady && this.recognizerEnabled && !this.showTimer && !this.detectPopupOpen() && !this.isProcessing) {
      this.openCountdown();
    }
  }

  async toggleRecognizer(): Promise<void> {
    this.recognizerEnabled = !this.recognizerEnabled;
    console.log("toggleRecognizer clicked! New state:", this.recognizerEnabled);

    if (!this.recognizerEnabled) {
      if (this.interval) {
        clearInterval(this.interval);
      }
      this.showTimer = false;
      this.isProcessing = false;
      this.resetDetectionState();
      console.log("Recognizer disabled successfully.");
      return;
    }

    const locationReady = await this.refreshLocationStatus(true);
    console.log("State check for start:", { locationReady, popup: this.detectPopupOpen(), timer: this.showTimer, processing: this.isProcessing });

    if (locationReady && !this.detectPopupOpen() && !this.showTimer && !this.isProcessing) {
      console.log("Starting recognition...");
      this.openCountdown();
    } else if (!locationReady) {
      console.log("Location not ready, disabling recognizer.");
      this.recognizerEnabled = false;
    } else {
      console.log("Blocked from starting due to state variables.");
    }
  }

  async handleMenuNavigation(page: string): Promise<void> {
    await this.router.navigateByUrl(page);
  }

  async logout(): Promise<void> {
    const alert = await this.alertController.create({
      cssClass: 'logout-alert',
      header: this.storage.translate.instant("LOGOUT"),
      message: this.storage.translate.instant("ARE_YOU_LOGOUT"),
      buttons: [
        { text: this.storage.translate.instant("CANCEL"), role: "cancel", cssClass: 'logout-cancel-button' },
        {
          text: this.storage.translate.instant("LOGOUT"),
          cssClass: 'logout-confirm-button',
          handler: async () => {
            await this.storage.showLoading();
            try {
              await this.attservice.syncToOdoo();
              await this.storage.logoutCleanup();
              this.attservice.stopSyncing();

              this.storage.isAuthenticated = false;
              this.storage.odoo.uid = undefined;
              this.storage.odoo.username = "";
              this.storage.odoo.password = "";
              this.storage.currentEmployee = undefined;

              this.storage.exitPage = "/login";
              await this.router.navigateByUrl("/login", { replaceUrl: true });
            } catch (error) {
              console.error("Logout error", error);
            } finally {
              await this.storage.hideLoading();
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private async setupLocationListener(): Promise<void> {
    await this.appStateListener?.remove();
    await this.appResumeListener?.remove();

    this.appStateListener = await App.addListener('appStateChange', async ({ isActive }) => {
      this.appActive = isActive;
      if (!isActive) {
        this.pauseDetectionForBackground();
        return;
      }

      this.queueResumeDetectionRestart();
    });

    this.appResumeListener = await App.addListener('resume', () => {
      this.appActive = true;
      this.queueResumeDetectionRestart(700);
    });
  }

  private pauseDetectionForBackground(): void {
    if (this.appResumeRestartTimer) {
      clearTimeout(this.appResumeRestartTimer);
      this.appResumeRestartTimer = undefined;
    }

    this.clearRecognitionTimers();

    if (!this.detectPopupOpen()) {
      this.isProcessing = false;
    }
  }

  private queueResumeDetectionRestart(delay = 500): void {
    if (this.appResumeRestartTimer) {
      clearTimeout(this.appResumeRestartTimer);
    }

    this.appResumeRestartTimer = setTimeout(async () => {
      this.appResumeRestartTimer = undefined;
      await this.resumeDetectionAfterAppResume();
    }, delay);
  }

  private async resumeDetectionAfterAppResume(): Promise<void> {
    if (this.isDestroyed || this.router.url !== '/home') {
      return;
    }

    if (!this.detectPopupOpen()) {
      this.resetDetectionState();
      this.isProcessing = false;
    }

    await this.ensureCameraRunningAfterResume();
    await this.restartRecognitionIfReady(300, false);
  }

  private async ensureCameraRunningAfterResume(): Promise<void> {
    try {
      const cameraStatus = await CapgoCameraPreview.isRunning();
      if (cameraStatus.isRunning) {
        this.isCameraStarted.set(true);
        this.setupCanvas();
        return;
      }

      this.isCameraStarted.set(false);
      await this.startCamera();
    } catch (error) {
      console.warn('Camera state check failed after app resume, restarting camera', error);
      this.isCameraStarted.set(false);
      await this.startCamera();
    }
  }

  private async ensureLocationReady(promptOnFailure: boolean): Promise<boolean> {
    return this.refreshLocationStatus(promptOnFailure);
  }

  private async refreshLocationStatus(promptOnFailure: boolean, showChecking = true): Promise<boolean> {
    if (!this.isLocationRequired()) {
      this.locationStatus.set('not_required');
      this.locationStatusMessage.set(this.t('LOCATION_NOT_REQUIRED') || 'Location Not Required');
      return true;
    }
    if (showChecking) {
      this.locationStatus.set('checking');
      this.locationStatusMessage.set(this.t('LOCATION_STATUS_CHECKING'));
    }

    const permissionState = await this.ensureLocationPermission(promptOnFailure);
    if (permissionState !== 'granted') {
      this.locationStatus.set('denied');
      this.locationStatusMessage.set(this.t('LOCATION_STATUS_PERMISSION_REQUIRED'));
      return false;
    }

    try {
      const position = await this.getCurrentPosition(4000, LOCATION_CACHE_MAX_AGE_MS);
      this.updateLocationPayload(position);
      this.locationStatus.set('enabled');
      this.locationStatusMessage.set(this.t('LOCATION_STATUS_ENABLED'));
      return true;
    } catch (error: any) {
      if (this.isLocationServicesDisabledError(error)) {
        this.locationStatus.set('disabled');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_TURN_ON'));
        if (promptOnFailure) {
          await this.openLocationSettings();
        }
        return false;
      }

      if (this.isPermissionDeniedError(error)) {
        this.locationStatus.set('denied');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_PERMISSION_REQUIRED'));
        if (promptOnFailure) {
          await this.showLocationPermissionToast();
        }
        return false;
      }

      this.locationStatus.set('unsupported');
      this.locationStatusMessage.set(this.t('LOCATION_STATUS_UNABLE'));
      return false;
    }
  }

  private async captureAttendanceLocation(): Promise<AttendanceCoordinates | null> {
    if (!this.isLocationRequired()) {
      return null;
    }

    if (this.hasFreshLocationPayload()) {
      const cachedLocationPayload = this.locationPayload;
      if (cachedLocationPayload && !cachedLocationPayload.address) {
        cachedLocationPayload.address = await this.reverseGeocodeAttendanceLocation(
          cachedLocationPayload.latitude,
          cachedLocationPayload.longitude
        );
      }
      return this.locationPayload;
    }

    try {
      const position = await this.getCurrentPosition(6000, LOCATION_CACHE_MAX_AGE_MS);
      this.updateLocationPayload(position);
      if (this.locationPayload) {
        this.locationPayload.address = await this.reverseGeocodeAttendanceLocation(
          this.locationPayload.latitude,
          this.locationPayload.longitude
        );
      }
      this.locationStatus.set('enabled');
      this.locationStatusMessage.set(this.t('LOCATION_STATUS_ENABLED'));
      return this.locationPayload;
    } catch (error: any) {
      if (this.isLocationServicesDisabledError(error)) {
        this.locationStatus.set('disabled');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_TURN_ON'));
      } else if (this.isPermissionDeniedError(error)) {
        this.locationStatus.set('denied');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_PERMISSION_REQUIRED'));
      } else {
        this.locationStatus.set('unsupported');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_UNABLE'));
      }

      return null;
    }
  }

  private async ensureLocationPermission(promptOnFailure: boolean): Promise<'granted' | 'denied'> {
    try {
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location === 'granted') {
        this.hasPreciseLocationPermission = true;
        return 'granted';
      }

      if (permissions.coarseLocation === 'granted') {
        this.hasPreciseLocationPermission = false;
        return 'granted';
      }

      if (!promptOnFailure) {
        return 'denied';
      }

      if (Capacitor.getPlatform() === 'web') {
        return 'denied';
      }

      const requested = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (requested.location === 'granted') {
        this.hasPreciseLocationPermission = true;
        return 'granted';
      }

      if (requested.coarseLocation === 'granted') {
        this.hasPreciseLocationPermission = false;
        return 'granted';
      }

      await this.showLocationPermissionToast();
      return 'denied';
    } catch (error: any) {
      if (this.isLocationServicesDisabledError(error)) {
        this.locationStatus.set('disabled');
        this.locationStatusMessage.set(this.t('LOCATION_STATUS_TURN_ON'));
        if (promptOnFailure) {
          await this.openLocationSettings();
        }
        return 'denied';
      }

      if (promptOnFailure) {
        await this.showLocationPermissionToast();
      }
      return 'denied';
    }
  }

  private async getCurrentPosition(timeout = 8000, maximumAge = LOCATION_CACHE_MAX_AGE_MS): Promise<Position> {
    try {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: this.hasPreciseLocationPermission,
        timeout,
        maximumAge,
        enableLocationFallback: true
      });
    } catch (error: any) {
      if (!this.hasPreciseLocationPermission || this.isPermissionDeniedError(error) || this.isLocationServicesDisabledError(error)) {
        throw error;
      }

      return Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: Math.max(timeout, 12000),
        maximumAge: Math.max(maximumAge, 60000),
        enableLocationFallback: true
      });
    }
  }

  private updateLocationPayload(position: Position): void {
    this.locationPayload = this.serializeLocation(position);
    this.locationPayloadCapturedAt = Date.now();
  }

  private hasFreshLocationPayload(): boolean {
    return !!this.locationPayload && (Date.now() - this.locationPayloadCapturedAt) <= LOCATION_CACHE_MAX_AGE_MS;
  }

  private serializeLocation(position: Position): AttendanceCoordinates {
    return {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
      address: null
    };
  }

  private async reverseGeocodeAttendanceLocation(latitude: number, longitude: number): Promise<string | null> {
    try {
      const response = await NativeGeocoder.reverseGeocode({
        latitude,
        longitude,
        useLocale: true,
        maxResults: 1
      });

      const address = response.addresses?.[0];
      if (address) {
        return this.formatNativeAddress(address);
      }
    } catch (error) {
      console.warn('Reverse geocoding failed for attendance location', error);
    }

    return null;
  }

  private formatNativeAddress(address: Address): string | null {
    const parts = [
      this.joinAddressSegments(address.subThoroughfare, address.thoroughfare),
      address.subLocality,
      address.locality || address.subAdministrativeArea,
      address.administrativeArea,
      address.countryName
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    if (typeof address.latitude === 'number' && typeof address.longitude === 'number') {
      return `${address.latitude.toFixed(5)}, ${address.longitude.toFixed(5)}`;
    }

    return null;
  }

  private joinAddressSegments(...parts: Array<string | undefined>): string {
    return parts.filter(part => typeof part === 'string' && part.trim().length > 0).join(' ').trim();
  }

  private async openLocationSettings(): Promise<void> {
    await this.storage.showToast({
      message: this.t('ENABLE_DEVICE_LOCATION_CONTINUE_ATTENDANCE'),
      position: 'top',
      color: 'warning',
      duration: 2200
    });

    const platform = Capacitor.getPlatform();
    if (!['android', 'ios'].includes(platform)) {
      return;
    }

    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.Location,
        optionIOS: IOSSettings.LocationServices
      });
    } catch (error) {
      console.warn('Unable to open location settings', error);
    }
  }

  private async showLocationPermissionToast(): Promise<void> {
    await this.storage.showToast({
      message: this.t('ALLOW_LOCATION_PERMISSION_CONTINUE_ATTENDANCE'),
      position: 'top',
      color: 'warning',
      duration: 2200
    });
  }

  private isLocationServicesDisabledError(error: any): boolean {
    return error?.code === 'OS-PLUG-GLOC-0007' || error?.message?.includes('Location services are not enabled');
  }

  private isPermissionDeniedError(error: any): boolean {
    return error?.code === 'OS-PLUG-GLOC-0003' || error?.message?.includes('Location permission request was denied');
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopRecognition();
    if (this.interval) clearInterval(this.interval);
    this.appStateListener?.remove();
    this.appResumeListener?.remove();
    if (this.menuSub) this.menuSub.unsubscribe();

    // Explicit Cleanup
    if (this.appResumeRestartTimer) {
      clearTimeout(this.appResumeRestartTimer);
      this.appResumeRestartTimer = undefined;
    }
    if (this.detectionLoopTimer) {
      clearTimeout(this.detectionLoopTimer);
      this.detectionLoopTimer = undefined;
    }
    if (this.detectionModalCloseTimer) {
      clearTimeout(this.detectionModalCloseTimer);
      this.detectionModalCloseTimer = undefined;
    }
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
      this.statusResetTimer = undefined;
    }
    this.enrolledEmbeddings = [];
    this.storage.originalImg.src = "";
    this.clearOverlay();
  }

  async ionViewWillEnter() {
    this.isDestroyed = false;
    this.appActive = true;
    this.loading = false;
    if (!this.detectPopupOpen()) {
      this.isProcessing = false;
    }

    // Always reload fresh face embeddings whenever entering HomePage
    await this.loadFaceMatcher();

    const licenseStatus = String((await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_license_status' }))).value || '').trim().toLowerCase();
    const expiryDateStr = (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_expiry_date' }))).value || (await import('@capacitor/preferences').then(m => m.Preferences.get({ key: 'config_trial_end_date' }))).value;

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
      } else {
        this.licenseWarningMessage.set('');
      }
    } else {
      this.licenseWarningMessage.set('');
    }

    if (this.appStateSub) {
      this.appStateSub.remove();
    }
    this.appStateSub = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && this.storage.isNetworkAvailable) {
        console.log('App backgrounded, syncing data...');
        await this.attservice.syncToOdoo();
      }
    });
  }
}
