

// src/app/face-detect/face-detect.page.ts

import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';

// import { CameraPreview, CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { CameraPreview as CapgoCameraPreview, CameraPreviewOptions as CapgoCameraPreviewOptions } from '@capgo/camera-preview';
import * as faceapi from '@vladmandic/face-api';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonButtons, ModalController, IonModal, IonSkeletonText } from '@ionic/angular/standalone';

import { Router, RouterModule } from '@angular/router';
import { StorageService, FaceDataStructure, AttendanceService, durationToSeconds, LocalCredentials, LocalEmployees, LocalAttendance } from '../services/storage.service';
// import { checkmarkCircle, closeCircle, peopleOutline, receiptOutline, wifiOutline, cloudOfflineOutline, cloudOutline, person, logOutOutline } from "ionicons/icons";
// import { addIcons } from 'ionicons';
// import { KeepAwake } from '@capacitor-community/keep-awake';
import { KeepAwake as CapgoKeepAwake } from '@capgo/capacitor-keep-awake';



import { Preferences } from '@capacitor/preferences';
import { LoginPage } from '../login/login.page';
import { TranslateModule } from '@ngx-translate/core';


const DETECTION_INTERVAL_MS = 2000;
const MATCH_THRESHOLD = 0.4; // Lower value means stricter match



@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonButtons, IonModal, IonSkeletonText, TranslateModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  providers: []
})
export class HomePage implements OnInit, OnDestroy {
  constructor(
    private attservice: AttendanceService,
    private router: Router,
    public storage: StorageService,
    private modal: ModalController,
    private att: AttendanceService,
  ) {
    // addIcons({ checkmarkCircle, closeCircle, peopleOutline, receiptOutline, wifiOutline, cloudOfflineOutline, cloudOutline, person, logOutOutline })
  }
  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;

  loading: boolean = false;

  private isDestroyed = false;
  private isProcessing = false;
  private appActive = true;
  // online = true;

  isCameraStarted: boolean = false;
  debugMessage: string = 'Initializing...';
  detectedEmployee: undefined | LocalEmployees | { display_name: string } = undefined
  operation: "in" | "out" | "recent_in" | "recent_out" | "" | false = "";
  time: string = "";
  detectedImage: string = ""
  check_in_delay_sec: number = 0;
  check_out_delay_sec: number = 0;


  showTimer: boolean = false;
  countdown: number = 3;
  interval!: NodeJS.Timeout;
  detectPopupOpen: boolean = false;
  private faceMatcher: faceapi.FaceMatcher | null = null;

  private detectionOptions: faceapi.TinyFaceDetectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  employees!: LocalEmployees[];

  openCountdown(): void {
    this.countdown = 3;    // reset
    this.showTimer = true;

    this.interval = setInterval((): void => {
      this.countdown--;

      if (this.countdown <= 0) {
        this.closeCountdown();
      }
    }, 1000);
  }

  async closeCountdown(): Promise<void> {
    clearInterval(this.interval);
    this.showTimer = false;




    // await this.startCamera().then(() => {
    if (this.faceMatcher === null) {
      this.storage.showToast({
        message: "No face samples found! Kindly sync the enrollments!",
        position: "top",
        color: "warning",
        duration: 2000
      })
    }
    else {
      this.startDetectionLoop();
    }

    // });





  }

  async goTo(page: string): Promise<void> {
     this.ionViewDidLeave();
    let loginModal: HTMLIonModalElement = await this.modal.create({
      component: LoginPage,
      componentProps: { "gotopage": page, loginmodal: this.modal }
    });
    // this.stopRecognition();
    (faceapi.tf as any).dispose();
    loginModal.present();
    loginModal.onDidDismiss().then(() => {
      if (this.router.url === "/home") {
        this.ionViewDidEnter()
      }

    })
  }

  stopRecognition(): void {
    console.log(this.isCameraStarted, "cameraaa")
    this.loading = true;
    if (this.isCameraStarted) {
      CapgoCameraPreview.stop().then(() => {
        // CameraPreview.stop().then(() => {
        this.loading = false;
        this.isCameraStarted = false;
        //console.log('stopped camera')
      });
    }
  }
  async ionViewDidLeave(): Promise<void> {
    this.isDestroyed = true;
    console.log("leave");
    this.stopRecognition();
    (faceapi.tf as any).dispose();
    await CapgoKeepAwake.allowSleep().then(() => {
      console.log("allowed sleep")
    }).catch((errorval) => {
      console.log(errorval, "error val")
    });

  }
  async ngOnInit() {





  }
  async ionViewDidEnter(): Promise<void> {

    this.isDestroyed = false;
    this.appActive = true;

    let creds: LocalCredentials = await this.storage.getCredentials();
    if (creds) {
      this.check_in_delay_sec = creds.check_in_delay ? durationToSeconds(creds.check_in_delay) : 30;
      this.check_out_delay_sec = creds.check_out_delay ? durationToSeconds(creds.check_out_delay) : 60;
    }
    // Network.addListener('networkStatusChange', status => {
    //   //console.log('Network status changed', status);
    //   this.online = status.connected;
    // });
    await CapgoKeepAwake.keepAwake();
    await this.startCamera();
    this.openCountdown()




    this.loading = true;
    this.debugMessage = "odoo login"
    // await this.odoo.login();
    // this.employees = await this.odoo.getEmployees();
    this.employees = await this.storage.getAllEmployees();
    //console.log(this.employees, "emmmps")
    this.debugMessage = "loading models"
    // await this.loadModels();

    // let camstatus: { value: boolean; } = await CameraPreview.isCameraStarted();
    let camstatus: { isRunning: boolean; } = await CapgoCameraPreview.isRunning();
    //console.log(camstatus, "dddd")
    // if (camstatus.isRunning) {
    //   await CapgoCameraPreview.stop()
    // }
    await this.loadFaceMatcher();
    this.setupCanvas();
    this.loading = false;
    // this.debugMessage="Starting camera"
    // await this.startCamera().then(()=>{
    //    this.startDetectionLoop();
    // });
    this.debugMessage = "Loading face data";
    // Load descriptors from storage
    if (this.storage.isNetworkAvailable) {
      let dt: Date = new Date();
      let dateStr: string = dt.toISOString().split('T')[0];
      let today_attendances: LocalAttendance[] = await this.att.retrieveAttendance(dateStr);
      if (today_attendances.length === 0) {
        this.att.fetchAttendanceFromOdoo([["check_in", "ilike", `${dateStr}%`], ["employee_id.company_id", "=", this.storage.selected_company?.id]])
      }
    }

  }



  // --- Setup Methods ---



  async loadFaceMatcher(): Promise<void> {
    const data = await Preferences.get({ "key": "enrollments" });

    if (!data.value) {
      this.debugMessage = 'No enrollments found.';
      return;
    }

    const enrolledUsers: FaceDataStructure[] = JSON.parse(data.value);
    const employee_ids = this.employees.map((emp) => emp.odoo_id?.toString());

    const labeledDescriptors = enrolledUsers
      .filter((user) => employee_ids.includes(user.employee_id?.toString()))
      .map((user) => {
        // 2. FIXED: Safely convert the saved descriptor back to Float32Array
        // Check if it's a nested array or a single descriptor
        let descriptorArray: Float32Array;

        if (Array.isArray(user.descriptor[0])) {
          // If it's an array of arrays
          descriptorArray = new Float32Array(user.descriptor[0]);
        } else {
          // If it's a flat array of 128 numbers
          descriptorArray = new Float32Array(user.descriptor as any);
        }

        return new faceapi.LabeledFaceDescriptors(
          user.employee_id.toString(),
          [descriptorArray]
        );
      });

    if (labeledDescriptors.length > 0) {
      this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
      console.log(`✅ Loaded ${labeledDescriptors.length} employees into FaceMatcher`);
    } else {
      this.debugMessage = 'No valid descriptors found for current employees.';
    }
  }

  async startCamera(): Promise<void> {
    // ... (Same camera logic as in EnrollPage) ...
    try {
      //console.log(this.loading, "loadingggggg")
      const parentElementId = this.cameraRef.nativeElement.id || 'cameraPreview';
      this.cameraRef.nativeElement.id = parentElementId;
      const rect = this.cameraRef.nativeElement.getBoundingClientRect();

      const cameraOptions: CapgoCameraPreviewOptions = {
        // const cameraOptions: CameraPreviewOptions = {
        position: 'front',
        // parent: parentElementId,
        width: window.innerWidth,
        height: window.innerHeight,
        toBack: true,
        disableAudio: true,
        storeToFile: false,
        x: 0,
        y: 0
      };
      if ((await CapgoCameraPreview.isRunning()).isRunning) {

        // if (await CameraPreview.isCameraStarted()) {
        CapgoCameraPreview.stop()
      };
      await CapgoCameraPreview.start(cameraOptions);

      this.isCameraStarted = true;
      this.debugMessage = 'Camera started. Scanning for faces...';
    } catch (error) {
      this.debugMessage = 'Camera error - check permissions.';
      console.error('Error starting camera:', error);
    }
  }

  setupCanvas(): void {
    setTimeout(() => {
      const canvas = this.overlayRef.nativeElement;
      const width = window.innerWidth;
      const height = window.innerHeight; // ❌ don’t subtract 300px
      canvas.width = width;
      canvas.height = height;
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
    const modelsStatus = {
      tinyFaceDetector: faceapi.nets.tinyFaceDetector.isLoaded,
      faceRecognitionNet: faceapi.nets.faceRecognitionNet.isLoaded,
      faceLandmark68Net: faceapi.nets.faceLandmark68Net.isLoaded,
    };

    console.table(modelsStatus);

    const allLoaded = Object.values(modelsStatus).every(v => v === true);

    if (allLoaded) {
      //console.log('✅ All face-api models are loaded.');
    } else {
      console.warn('⚠️ Some models are not loaded yet:', modelsStatus);
    }
    return allLoaded
  }

  // --- Recognition Loop ---

  // async startDetectionLoop(): Promise<void> {

  //   if (this.isCameraStarted) {

  //     this.runRecognition();
  //   }
  //   if (!this.isCameraStarted) {
  //     // //console.log('starttttt')
  //     // this.startDetectionLoop();
  //   }
  //   // this.detectionTimer = setInterval(() => {
  //   //   if (this.isCameraStarted) {
  //   //     this.runRecognition();
  //   //   }
  //   // }, DETECTION_INTERVAL_MS);
  // }

  async startDetectionLoop(): Promise<void> {
    // பாப்-அப் ஓப்பனா இருந்தா உள்ளேயே வராது
    if (this.isDestroyed || this.detectPopupOpen || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.runRecognition();
    } catch (err) {
      console.error("Loop Error:", err);
    } finally {
      // பாப்-அப் ஓப்பனா இல்லன்னா மட்டும் அடுத்த லூப்பை செட் பண்ணுங்க
      if (!this.detectPopupOpen) {
        this.isProcessing = false;
        setTimeout(() => this.startDetectionLoop(), DETECTION_INTERVAL_MS);
      }
    }
  }

  async runRecognition(): Promise<void> {
    if (this.loading || this.detectPopupOpen || this.isDestroyed) return;

    // 1. Capture quality-ai innum kuraingga (Faster Base64 transfer)
    const photo = await CapgoCameraPreview.capture({ quality: 20 });
    if (!photo?.value) return;

    const img = this.storage.originalImg;
    // Angles-ai [0] mattum vechu check pannunga fast-ah irukka nu
    const angles = [0, 90, 180, 270];

    try {
      let resizedImg = await this.storage.resizeBase64Image(photo.value);
      for (const ori of angles) {
        if (this.isDestroyed || this.detectPopupOpen) break;
        // await (faceapi.tf as any).tidy(async () => {
        let currentRotation = (ori === 0) ? resizedImg : await this.storage.rotateBase64Image(resizedImg, ori);

        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = `data:image/jpeg;base64,${currentRotation.replace(/\s/g, '')}`;
          console.log(`data:image/jpeg;base64,${currentRotation.replace(/\s/g, '')}`, 'loadd')
        });

        // --- MANUAL SCOPE REMOVED TO AVOID "TRACK" ERROR ---
        // face-api functions handle their own memory better than manual nested scopes

        // STEP 1: FAST DETECTION (Only find if face exists)
        // const detection = await faceapi.detectSingleFace(img, this.detectionOptions);

        // if (detection && detection.score > 0.4) {
        // STEP 2: ONLY IF FACE FOUND, GET DESCRIPTORS (Heavy Task)
        const fullDetection = await faceapi.detectSingleFace(img, this.detectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (fullDetection && this.faceMatcher) {
          const bestMatch = this.faceMatcher.findBestMatch(fullDetection.descriptor);

          if (bestMatch.label !== 'unknown') {
            this.cleanupImage(img);
            // Handle success logic
            await this.handleSuccessfulMatch(bestMatch, currentRotation);
            return;
          }
         else if (bestMatch.label === 'unknown') {
  // 1. Loop-ah lock pannunga
  this.isProcessing = true;
  
  // 2. State-ah 'false' (Not Enrolled) nu mathunga
  this.operation = false; 
  this.detectedEmployee = { display_name: "Unknown" };
  
  // 3. Audio play pannunga
  let unknown_text = `${this.storage.translate.instant("NOT_ENROLLED")}`;
  await this.storage.playAudio(unknown_text);

  // 4. Memory cleanup
  this.cleanupImage(img);
  
  // 5. Correct-ah 2 seconds-la reset panni loop-ah trigger panrom
  setTimeout(() => {
    this.resetDetectionState(); // UI-la irundhu message-ah remove pannum
    this.isProcessing = false;  // Lock-ah release pannum
    
    if (!this.isDestroyed) {
      this.startDetectionLoop(); // Adhutha cycle-ah start pannum
    }
  }, 2000); // Neenga ketta maadhiri 2 seconds delay
  
  return; 
}
        }

        // }
        // });
      }
    } catch (err) {
      console.error("Recognition Inner Error:", err);
    } finally {
      this.cleanupImage(img);
      // isProcessing reset logic current-ah finally-la irukku, so it's safe.
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

  private async handleSuccessfulMatch(bestMatch: faceapi.FaceMatch, frameData: string) {
    const matchId = parseInt(bestMatch.label);
    const filteredEmp = this.employees.find(emp => Number(emp.odoo_id) === matchId);

    if (!filteredEmp) {
      this.isProcessing = false;
      return;
    }

    try {
      this.isProcessing = true; // Loop-ai lock pannunga
      const isRecent = await this.attservice.isWithinDuration(filteredEmp.odoo_id!);

      this.detectedEmployee = filteredEmp;
      this.detectedImage = frameData;

      if (!isRecent.withinLimit) {
        // --- CASE 1: ATTENDANCE SUCCESS (Popup Venum) ---
        const offlineSync = await this.attservice.saveOfflineAttendance(filteredEmp, frameData);
        this.time = offlineSync.time;
        this.operation = offlineSync.operation;

        this.detectPopupOpen = true; // <--- INGE MATTUM OPEN PANNUNGA
        await this.storage.playAudio(this.getGreetingText());

        // 3 seconds kazhithu reset
        setTimeout(() => {
          this.resetDetectionState();
          this.isProcessing = false;
          if (!this.isDestroyed) this.startDetectionLoop();
        }, 3000);

      } else {
        // --- CASE 2: RECENT LOG (Popup VENAAM) ---
        this.operation = (isRecent.operation === "in") ? "recent_in" : "recent_out";

        // Popup illama audio mattum play pannuvom
        await this.storage.playAudio(this.getGreetingText());

        // Popup illathathaal udane reset (1.5s delay podhum)
        setTimeout(() => {
          this.resetDetectionState();
          this.isProcessing = false;
          if (!this.isDestroyed) this.startDetectionLoop();
        }, 1500);
      }

    } catch (error) {
      console.error("Error in match handling:", error);
      this.resetDetectionState();
      this.isProcessing = false;
      this.startDetectionLoop();
    }
  }


  private resetDetectionState() {
    this.operation = "";
    this.detectedEmployee = undefined;
    this.detectPopupOpen = false; // Idhu dhaan popup-ah close pannum
    this.detectedImage = "";
    this.clearOverlay();
  }

  private getGreetingText(): string {
    const name = this.detectedEmployee?.display_name || '';
    const trans = (key: string) => this.storage.translate.instant(key);

    if (this.operation === "in") return `${trans("COME_IN")} ${name}`;
    if (this.operation === "out") return `${trans("GOOD_BYE")} ${name}`;
    if (this.operation === "recent_in") return `${trans("IMMEDIATE_LOGIN_AUDIO")} ${name}`;
    if (this.operation === "recent_out") return `${trans("IMMEDIATE_LOGOUT_AUDIO")} ${name}`;
    return "";
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

  async clearDetections(detection: faceapi.FaceDetection, imageWidth: number, imageHeight: number, label: string): Promise<void> {
    const canvas: HTMLCanvasElement = this.overlayRef.nativeElement;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) return;
    const scaleX: number = canvas.width / (imageWidth);
    const scaleY: number = (canvas.height - 300) / (imageHeight);
    const box: faceapi.Box<any> = detection.box;
    const scaledX: number = box.x * scaleX;
    const scaledY: number = box.y * scaleY;
    const scaledWidth: number = box.width * scaleX;
    const scaledHeight: number = box.height * scaleY;
    ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);

  }

  async drawDetections(detection: faceapi.FaceDetection, imageWidth: number, imageHeight: number, label: string): Promise<void> {
    const canvas: HTMLCanvasElement = this.overlayRef.nativeElement;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) return;

    const box: faceapi.Box<any> = detection.box;
    const scaleX: number = canvas.width / (imageWidth);
    const scaleY: number = (canvas.height) / (imageHeight);
    //console.log(box.x, box.y, "box positions x,y")
    //console.log(imageWidth, imageHeight, "image  width,height")
    //console.log(canvas.width, canvas.height, "box positions width,height")
    const scaledX: number = box.x * scaleX;
    const scaledY: number = box.y * scaleY;
    const scaledWidth: number = box.width * scaleX;
    const scaledHeight: number = box.height * scaleY;

    ctx.strokeStyle = label.includes('Unknown') ? 'red' : 'lime';
    ctx.lineWidth = 3;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    ctx.fillStyle = label.includes('Unknown') ? 'red' : 'lime';
    ctx.font = '20px Arial';
    ctx.fillText(label, scaledX, scaledY - 10);
    // setTimeout(() => {
    //   ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);
    // }, 800);
  }

  async clearOverlay(): Promise<void> {
    this.overlayRef.nativeElement.getContext('2d')?.clearRect(0, 0, this.overlayRef.nativeElement.width, this.overlayRef.nativeElement.height);
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopRecognition();
    (faceapi.tf as any).dispose();
    if (this.interval) clearInterval(this.interval);

    // Explicit Cleanup
    this.faceMatcher = null;
    this.storage.originalImg.src = "";
    this.clearOverlay();
    // if (this.isCameraStarted) {
    //   CameraPreview.stop();
    // }
  }
}
