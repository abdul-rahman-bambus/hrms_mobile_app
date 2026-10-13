
import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
// import { CameraPreview, CameraPreviewOptions } from '@capacitor-community/camera-preview';
import { CameraPreview as CapgoCameraPreview, CameraPreviewOptions as CapgoCameraPreviewOptions } from '@capgo/camera-preview';
import * as faceapi from '@vladmandic/face-api';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonFooter, IonContent, IonButton, IonButtons, IonItem, IonList, IonLabel, IonProgressBar, IonBackButton, IonCard, IonFabButton, IonFab, ToastController, NavController } from '@ionic/angular/standalone';
import { OdooJsonRpcService } from "../services/odoojsonrpc.service"; // Assuming your Odoo service is here
import { EmployeeService, FaceDataStructure, StorageService } from '../services/storage.service';
// import { addIcons } from "ionicons"
// import { cloudUploadOutline, personOutline, bagOutline, checkmarkCircleSharp, closeCircleSharp, cameraOutline, checkmarkCircle, briefcaseOutline, chevronForwardCircleOutline } from "ionicons/icons";
import { GetResult, Preferences } from '@capacitor/preferences';
import { TranslateModule } from '@ngx-translate/core';

// Define the structure for the data sent to Odoo
interface EmployeePayload {
  display_name: string;
  image_1024: string; // Base64 string
  job_id: number | null; // Odoo FK needs an ID
  active: boolean;
}

@Component({
  selector: 'app-enroll',
  templateUrl: './enroll.page.html',
  styleUrls: ['./enroll.page.scss'],
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonButtons, IonItem, IonLabel, IonProgressBar, IonBackButton, IonFabButton, IonFab, TranslateModule]
})
export class EnrollPage implements OnInit, OnDestroy {
  constructor(
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private toast: ToastController,
    private empservice: EmployeeService,
    private navCtrl: NavController
  ) {
    // addIcons({ cloudUploadOutline, personOutline, bagOutline, checkmarkCircleSharp, closeCircleSharp, cameraOutline, checkmarkCircle, briefcaseOutline, chevronForwardCircleOutline })
  }
  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef<HTMLDivElement>;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;
  networkProgress: boolean = false;
  // Form Data Model
  formData: EmployeePayload = {
    display_name: '',
    image_1024: '',
    job_id: null, // Example: You need to fetch job IDs from Odoo
    active: true,
  };

  // UI and State
  capturedImageBase64: string = '';
  debugMessage: string = 'Initializing...';
  isCameraStarted: boolean = false;
  isFaceDetected: boolean = false;

  private detectionTimer!: NodeJS.Timeout;
  private detectionOptions: faceapi.TinyFaceDetectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

  private isComponentActive = false;
  private isProcessing = false;


  async ionViewWillEnter(): Promise<void> {
    this.formData = this.storage.selectedEmployee
    //console.log(this.formData, "form daaat")
    await this.startCamera();
    this.setupCanvas();
    // this.startDetectionLoop();
  }
  async ngOnInit(): Promise<void> {
    // await this.odoo.login(); // Ensure login is complete
    // await this.loadModels();

  }

  // --- Setup & Lifecycle ---

  async loadModels(): Promise<void> {
    try {
      this.debugMessage = 'Loading face models...';
      await faceapi.nets.tinyFaceDetector.loadFromUri('/assets/models');
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/assets/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models');
      this.debugMessage = 'Models loaded. Camera started.';
    } catch (error) {
      this.debugMessage = 'Error loading models.';
      console.error('Error loading models:', error);
    }
  }

  async startCamera(): Promise<void> {
    try {
      const parentElementId: string = this.cameraRef.nativeElement.id || 'cameraPreview';
      this.cameraRef.nativeElement.id = parentElementId;

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

      await CapgoCameraPreview.start(cameraOptions);
      this.isCameraStarted = true;
    } catch (error) {
      this.debugMessage = 'Camera error - check permissions.';
      console.error('Error starting camera:', error);
    }
  }

  setupCanvas(): void {
    setTimeout(() => {
      const canvas: HTMLCanvasElement = this.overlayRef.nativeElement;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
    }, 500);
  }

  ngOnDestroy(): void {
    clearInterval(this.detectionTimer);
    if (this.isCameraStarted) {
      CapgoCameraPreview.stop();
    }
  }

  // --- Face Detection & Auto Capture Logic ---

  async startDetectionLoop(): Promise<void> {
    this.capturedImageBase64 = "";
    this.isFaceDetected = false;
    this.isProcessing = false; // 👈 RESET THE LOCK HERE
    this.isComponentActive = true;

    // 1. Force Reset all state flags
    this.isFaceDetected = false;
    this.isProcessing = false;
    this.capturedImageBase64 = "";
    this.formData.image_1024 = ""; // Clear old image from form
    this.debugMessage = "Initializing camera...";

    // 2. Clear any existing timer to prevent "Double Loops"
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
    }

    if (!this.isCameraStarted) {
      await this.startCamera();
    }

    this.setupCanvas();

    // Clear any old intervals first to be safe
    if (this.detectionTimer) clearInterval(this.detectionTimer);

    this.detectionTimer = setInterval(() => this.runDetection(), 800);
  }

  async runDetection(): Promise<void> {
    // Now this check will pass because we reset the flag above
    if (!this.isCameraStarted || this.isFaceDetected || this.isProcessing || !this.isComponentActive) {
      return;
    }

    this.isProcessing = true; // 🔒 LOCK SET

    try {
      const photo = await CapgoCameraPreview.capture({ quality: 40 });
      if (!photo?.value) {
        this.isProcessing = false; // Release if no photo
        return;
      }

      // Process image...
      const correctedBase64 = await this.storage.rotateBase64Image(photo.value, 0);
      let resizedBase64 = await this.storage.resizeBase64Image(correctedBase64);
      resizedBase64 = resizedBase64.replace(/[\r\n]/g, '');
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${resizedBase64.replace(/[\r\n]/g, '')}`;
      });

      const detection = await faceapi.detectSingleFace(img, this.detectionOptions);

      if (detection && detection.score > 0.7) {
        this.isFaceDetected = true;
        this.stopDetectionLoop();
        await this.captureAndSetPhoto(resizedBase64);
      }

      // Cleanup strings immediately
      img.src = "";

    } catch (error) {
      console.error('Detection cycle crashed:', error);
    } finally {
      this.isProcessing = false; // 🔓 LOCK ALWAYS RELEASED HERE
    }
  }

  private stopDetectionLoop() {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
    }
  }

  // async runDetection(): Promise<void> {
  //   //console.log("enterinngg")
  //   // Prevent execution if camera isn't ready or face is already captured
  //   if (!this.isCameraStarted || this.isFaceDetected) return;
  //   //console.log(this.isCameraStarted, this.isFaceDetected, 'check check')
  //   try {
  //     // 1. Capture frame at low quality for speed
  //     //console.log('1111111111')
  //     const photo: { value: string; } = await CapgoCameraPreview.capture({ quality: 40 });
  //     if (!photo.value) return;
  //     // console.log(photo.value,'22222222222')
  //     const img: HTMLImageElement = new Image();
  //     const correctedBase64: string = await this.storage.rotateBase64Image(photo.value, 0);
  //     let resizedBase64: string = await this.storage.resizeBase64Image(correctedBase64);
  //     resizedBase64 = resizedBase64.replace(/[\r\n]/g, '');
  //     img.src = `data:image/jpeg;base64,${resizedBase64}`;
  //     // console.log(img.src,"srcsss")
  //     //console.log('3333333333333')
  //     // Wait for image load. Add reject handler for robustness.
  //     await new Promise((resolve, reject) => {
  //       img.onload = resolve;
  //       img.onerror = reject; // Rejects the promise if image data is invalid
  //     });
  //     //console.log('44444444444')
  //     //console.log(img.height, img.width, "img sizde")
  //     // 2. Perform Detection
  //     // The result 'detection' is a FaceDetection object (or null)
  //     // let resizedimg=await this.storage.resizeForSSDMobileNet(img);
  //     // const canvas = faceapi.createCanvasFromMedia(img);
  //     // const displaySize = { width: img.width, height: img.height };
  //     // faceapi.matchDimensions(canvas, displaySize);
  //     console.log('imggggssss')
  //     let detection: faceapi.FaceDetection | undefined = await faceapi.detectSingleFace(img, this.detectionOptions);
  //     //  detection=faceapi.resizeResults(detection,displaySize);
  //     // NOTE: Do NOT chain .withFaceLandmarks() or .withFaceDescriptor() here
  //     // as they are not needed for simple bounding box detection and slow things down.
  //     // const displaySize = { width: 224, height: 240 }
  //     // detection= faceapi.resizeResults(detection, displaySize)
  //     // 3. Draw Detection Box
  //     // FIX: The detection object itself is passed (it contains the box property).
  //     // this.drawDetectionBox(detection, img.width, img.height);
  //     if (detection) {
  //       // FIX: Access score directly from the FaceDetection object.
  //       this.debugMessage = `Face detected! Confidence: ${(detection.score * 100).toFixed(1)}%`;
  //       console.log(this.debugMessage, "messsss")
  //       // 4. AUTO CAPTURE AND STOP LOOP
  //       if (!this.isFaceDetected && detection.score > 0.8) {
  //         this.isFaceDetected = true;

  //         clearInterval(this.detectionTimer); // Stop loop
  //         await this.captureAndSetPhoto(resizedBase64);
  //       }
  //     } else {
  //       this.debugMessage = 'No face detected.';
  //     }

  //   } catch (error) {
  //     // Log critical errors like image decoding failure
  //     console.error('Detection loop error (Image load or processing failed):', error);
  //     this.debugMessage = `Error processing frame.`;
  //   }
  // }



  async captureAndSetPhoto(base64Image: string): Promise<void> {
    // The Base64 string is ready for Odoo

    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
    }

    this.capturedImageBase64 = `data:image/jpeg;base64,${base64Image}`;

    this.formData.image_1024 = base64Image;

    // Stop the camera preview after successful capture
    if (this.isCameraStarted) {
      await CapgoCameraPreview.stop();
      this.isCameraStarted = false;
    }
    this.debugMessage = 'Photo automatically captured! Ready to submit.';
  }

  // --- UI and API Logic ---

  async submitEnrollment(): Promise<void> {
    //console.log('submitEnrollment loading')
    if (!this.formData.display_name || !this.formData.image_1024) {
      alert('Please fill all required fields and ensure a photo is captured.');
      return;
    }

    // Convert base64 to Odoo's expected format (remove MIME prefix if present, which your logic already does)


    try {
      //console.log('submitEnrollment try loading')
      this.debugMessage = 'Submitting data to Odoo...';
      // this.networkProgress = true;
      //console.log([{ ...this.formData }], "erro data");
      let updated: boolean = await this.storage.createOrUpdateEmployee([{ ...this.formData }], true)
      // let updated: boolean = await this.odoo.updateEmployee(this.formData['odoo_id'], this.formData.image_1024);
      //console.log(updated, 'submitEnrollment updated')
      // this.networkProgress = false;
      //console.log("updated", updated)
      if (updated) {
        let updatedToast: HTMLIonToastElement = await this.toast.create({
          color: "success",
          position: "top",
          message: `${this.formData.display_name} ${this.storage.translate.instant("ENROLLED_SUCCESSFUL")}`,
          "duration": 2000
        })
        updatedToast.present();
        let credJson = await this.storage.getCredentials();
        if (credJson && credJson.sound) {
          this.storage.playAudio(`${this.formData.display_name} ${this.storage.translate.instant("ENROLLED_SUCCESSFUL")}`)
        }
        //console.log(this.storage.selectedEmployee, "sell")
        this.storage.selectedEmployee.image_1024 = this.formData.image_1024;
        //console.log(this.formData.image_1024, "form 128")
        let descriptors: FaceDataStructure[] = await this.storage.generateLabeledDescriptors([this.storage.selectedEmployee], "offline");
        //console.log(descriptors, "offline descript")
        const data: GetResult = await Preferences.get({ "key": "enrollments" })
        // if (!data) {
        //   this.debugMessage = 'No enrollments found. Go to Enroll page first.';
        //   return;
        // }

        let enrolledUsers: FaceDataStructure[] = data.value ? JSON.parse(data.value) : [];
        //console.log(enrolledUsers, this.storage.selectedEmployee, 'check data')
        let enrolledUsersfilter: FaceDataStructure[] = enrolledUsers.filter((user) => user.employee_id === this.storage.selectedEmployee.odoo_id);
        if (enrolledUsersfilter.length > 0) {
          //console.log(enrolledUsers,this.storage.selectedEmployee,"selected")

          enrolledUsers = enrolledUsers.map((user) => {
            //console.log(this.storage.selectedEmployee,user.employee_id,"selected");
            if (user.employee_id === this.storage.selectedEmployee.odoo_id) {
              user.descriptor = descriptors[0].descriptor;

            }
            return user
          });
        }
        else if (enrolledUsersfilter.length === 0) {
          enrolledUsers.push({ "employee_id": this.storage.selectedEmployee.odoo_id, 'descriptor': descriptors[0].descriptor, "label": this.storage.selectedEmployee.odoo_id })
        }
        //console.log(enrolledUsers, "enrolled")

        Preferences.set({ "key": "enrollments", "value": JSON.stringify(enrolledUsers) })
        // this.ngOnInit()
        this.navCtrl.back();


      }

      // // Assuming your Odoo service has a method to create a new hr.employee record
      // const newEmployeeId = await this.odoo.createEmployee(payload); 

      // this.debugMessage = `Enrollment successful! Employee ID: ${newEmployeeId}`;
      // alert(`Employee ${this.formData.display_name} enrolled successfully!`);

    } catch (error) {
      this.debugMessage = `Odoo submission failed: ${error}`;
      console.error('Odoo API Error:', error);
      alert('Submission failed. Check console.');
    }
  }

  drawDetectionBox(detection: faceapi.FaceDetection | undefined, imageWidth: number, imageHeight: number): void {

    const canvas: HTMLCanvasElement = this.overlayRef.nativeElement;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!detection) return;

    // ... (Drawing logic same as before, ensuring scaling) ...
    const box: faceapi.Box<any> = detection.box;
    const scaleX: number = canvas.width / imageWidth;
    const scaleY: number = canvas.height / imageHeight;

    const scaledX: number = box.x * scaleX;
    const scaledY: number = box.y * scaleY;
    const scaledWidth: number = box.width * scaleX;
    const scaledHeight: number = box.height * scaleY;

    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 3;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    ctx.fillStyle = 'lime';
    ctx.font = '20px Arial';
    ctx.fillText(`LOOK HERE`, scaledX, scaledY - 10);
  }
}