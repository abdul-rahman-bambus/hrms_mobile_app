

// src/app/face-detect/face-detect.page.ts

import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';

import { CameraPreview, CameraPreviewOptions } from '@capacitor-community/camera-preview';
import * as faceapi from '@vladmandic/face-api';
import { OdooJsonRpcService } from "../services/odoojsonrpc.service";

import { CommonModule } from '@angular/common';
import { IonicModule, Platform, NavController } from "@ionic/angular";
import { Router, RouterModule } from '@angular/router';
import { StorageService, FaceDataStructure } from '../services/storage.service';
import { checkmarkCircle, closeCircle, peopleOutline, receiptOutline } from "ionicons/icons";
import { addIcons } from 'ionicons';
import { App } from "@capacitor/app";
import * as tf from '@tensorflow/tfjs';



const DETECTION_INTERVAL_MS = 800;
const MATCH_THRESHOLD = 0.35; // Lower value means stricter match

interface EnrolledUser {
  label: string;
  timestamp: string;
  // Descriptors are stored as number arrays for JSON serialization
  descriptor: number[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  providers: [StorageService]
})
export class HomePage implements OnInit, OnDestroy {
  constructor(private router: Router, private odoo: OdooJsonRpcService, private storage: StorageService, private platform: Platform, private navCtrl: NavController) {
    addIcons({ checkmarkCircle, closeCircle, peopleOutline, receiptOutline })
  }
  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;

  loading = false;
  private detectionTimer: any;
  private isCameraStarted = false;
  debugMessage: string = 'Initializing...';
  detectedEmployee = undefined
  operation = null;
  private faceMatcher: faceapi.FaceMatcher | null = null;

  private detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  employees = []

  async goToEmployees() {
    this.router.navigate(["/employee-list"])
  }
  async goToAttendance() {
    this.router.navigate(["/attendances"])
  }
  ionViewWillLeave() {
    // console.log("leave")
    this.loading = true;
    if (this.isCameraStarted) {
      CameraPreview.stop().then(() => {
        this.loading = false;
      });
    }

  }
  async ngOnInit() {





  }
  async ionViewDidEnter() {

    this.platform.backButton.subscribeWithPriority(100, () => {
      if (this.router.url === "/home") {
        App.exitApp();
      }
      else {
        this.navCtrl.back();
      }
    })
    this.loading = true;
    this.debugMessage = "odoo login"
    await this.odoo.login();
    this.employees = await this.odoo.getEmployees();
    this.debugMessage = "loading models"
    // await this.loadModels();

    let camstatus = await CameraPreview.isCameraStarted();
    // console.log(camstatus, "dddd")
    if (camstatus.value) {
      await CameraPreview.stop()
    }
    await this.loadFaceMatcher();
    this.setupCanvas();
    this.loading = false;
    // this.debugMessage="Starting camera"
    await this.startCamera();
    this.debugMessage = "Loading face data";
    // Load descriptors from storage

    this.startDetectionLoop();
  }



  // --- Setup Methods ---



  async loadFaceMatcher() {
    const data = localStorage.getItem('enrollments');
    if (!data) {
      this.debugMessage = 'No enrollments found. Go to Enroll page first.';
      return;
    }

    const enrolledUsers: FaceDataStructure[] = JSON.parse(data);

    // console.log(enrolledUsers, "desc length")

    // CRITICAL: Convert number[] back to Float32Array for face-api
    const labeledDescriptors = enrolledUsers.map((user) => {
      let float32s = []
      for (let desc of user.descriptor) {
        float32s.push(new Float32Array(desc))
      }

      return new faceapi.LabeledFaceDescriptors(user.label.toString(), float32s)
    }
    );
    // console.log(labeledDescriptors, 'desscc')

    if (labeledDescriptors.length > 0) {
      this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
      this.debugMessage = `Ready for recognition. Loaded ${labeledDescriptors.length} users.`;
    } else {
      this.debugMessage = 'No valid descriptors found.';
    }
  }

  async startCamera() {
    // ... (Same camera logic as in EnrollPage) ...
    try {
      const parentElementId = this.cameraRef.nativeElement.id || 'cameraPreview';
      this.cameraRef.nativeElement.id = parentElementId;

      const cameraOptions: CameraPreviewOptions = {
        position: 'front',
        parent: parentElementId,
        width: window.innerWidth,
        height: window.innerHeight - 300,
        toBack: true,
      };
      CameraPreview.isCameraStarted() ? CameraPreview.stop() : false;
      await CameraPreview.start(cameraOptions);
      this.isCameraStarted = true;
      this.debugMessage = 'Camera started. Scanning for faces...';
    } catch (error) {
      this.debugMessage = 'Camera error - check permissions.';
      console.error('Error starting camera:', error);
    }
  }

  setupCanvas() {
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

  async checkIfModelsLoaded() {
    const modelsStatus = {
      faceLandmark68Net: faceapi.nets.faceLandmark68Net.isLoaded,
      faceRecognitionNet: faceapi.nets.faceRecognitionNet.isLoaded,
      tinyFaceDetector: faceapi.nets.tinyFaceDetector.isLoaded,
    };

    console.table(modelsStatus);

    const allLoaded = Object.values(modelsStatus).every(v => v === true);

    if (allLoaded) {
      console.log('✅ All face-api models are loaded.');
    } else {
      console.warn('⚠️ Some models are not loaded yet:', modelsStatus);
    }
    return allLoaded
  }

  // --- Recognition Loop ---

  startDetectionLoop() {
    if (this.isCameraStarted) {
      this.runRecognition();
    }
    // this.detectionTimer = setInterval(() => {
    //   if (this.isCameraStarted) {
    //     this.runRecognition();
    //   }
    // }, DETECTION_INTERVAL_MS);
  }



  async runRecognition() {
    // Flag to prevent race conditions (BEST PRACTICE, though you may need to implement the isProcessingFrame flag mentioned previously)
    // For now, focus on fixing the image load flow.

    try {
      let cameraStatus = await CameraPreview.isCameraStarted();
      if (!cameraStatus.value && this.router.url === "/home") {
        setTimeout(() => {
          this.operation = null
          this.detectedEmployee = undefined;
          this.startDetectionLoop();
        }, 2000);

      };

      // 1. Capture frame with fixed size/quality
      const photo = await CameraPreview.capture({ quality: 80 });
      if (!photo.value) return;

      // 2. Load the captured image data reliably
      // CRITICAL FIX: Use a local variable and Promise.



      // img.src = `data:image/jpeg;base64,${photo.value}`;

      // Wait for the image to fully decode and load BEFORE detection starts


      // 3. Perform Detection and Descriptor Extraction
      let img = null;
      if (await this.checkIfModelsLoaded()) {
        //check from here ================================||||||||||

        // let imgOrientations = [photo.value];
        let fullDetection: any;
        let bestMatch: any;
        img = this.storage.originalImg;
        // let resizeBase64Image=await this.storage.resizeBase64Image(photo.value,512)
        img.src = `data:image/jpeg;base64,${photo.value}`;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          // Handle error in case the base64 data is corrupted
          img.onerror = (err) => {
            console.error("Image loading error from capture:", err);
            reject(new Error("Image Load Failed"));
          };
        });

        let rotatedImage90 = await this.storage.rotateBase64Image(img, photo.value, 90);

        let rotatedImage180 = await this.storage.rotateBase64Image(img, photo.value, 180);

        let rotatedImage270 = await this.storage.rotateBase64Image(img, photo.value, 270);

        let imgOrientations = [rotatedImage90, photo.value, rotatedImage180, rotatedImage270];

        for (let ori of imgOrientations) {
          // let resizeBase64Image=await this.storage.resizeBase64Image(ori,320)
          img.src = `data:image/jpeg;base64,${ori}`
          fullDetection = await faceapi.detectSingleFace(img, this.detectionOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();


          console.log(fullDetection, "detection")
          if (fullDetection) {
            // const displaySize = { width: 320, height: 240 }
            // fullDetection= faceapi.resizeResults(fullDetection, displaySize)
            bestMatch = this.faceMatcher.findBestMatch(fullDetection.descriptor);
            if (bestMatch.label !== 'unknown') {
              break
            }

          }
          if(!fullDetection){
            continue
          }
         
        }
         if (!fullDetection || !fullDetection.descriptor || fullDetection.descriptor.length !== 128) {

            this.debugMessage = 'No face or invalid descriptor detected (Length != 128).';

            if (fullDetection) {
              // Draw detection box if a face was detected, even if descriptor failed
              // await this.drawDetections(fullDetection.detection, img.width, img.height, 'Detection Failed');
            }
            setTimeout(() => {
              this.operation = null
              this.detectedEmployee = undefined;
              this.startDetectionLoop();
            }, 500);

            // DO NOT PROCEED TO FACE MATCHER, which prevents the crash.
            return;
          }


        // 4. Clear canvas immediately
        this.clearOverlay();

        // console.log('angles');



        // 5. CRITICAL CHECK: Validate the live descriptor length BEFORE matching


        // --- Only proceed if detection is valid (Length == 128) ---

        if (this.faceMatcher && fullDetection) {
          this.operation = false
          // 6. Perform Recognition (Safe to call now)
          // console.log(fullDetection.descriptor, "descccccc");


          let recognizedLabel = bestMatch.label === 'unknown'
            ? `Unknown (${bestMatch.distance.toFixed(2)})`
            : `${bestMatch.label} (${(1 - bestMatch.distance).toFixed(2)})`;
          recognizedLabel = "";
          this.debugMessage = `Detected: ${recognizedLabel}`;
          // await this.drawDetections(fullDetection.detection, img.width, img.height, recognizedLabel);
          // console.log(bestMatch, "best matchhh")
          if (bestMatch) {

            if (bestMatch.label !== 'unknown') {

              console.log(bestMatch.label, "labbbbb")
              // console.log(this.employees, "emplll")
              let filteredEmp = this.employees.filter(emp => emp.id === parseInt(bestMatch.label))
              // recognizedLabel=`Hi ${bestMatch.label}`;
              this.debugMessage = `Hi ${filteredEmp[0].display_name}`;
              this.detectedEmployee = filteredEmp[0];

              //stop recognition
              // clearInterval(this.detectionTimer);
              //get employee id,user id and log attendance
              let employee_id = this.detectedEmployee.id;
              let logAttendance = await this.odoo.syncAttendance(employee_id)
              // console.log(logAttendance, "logAttendance")
              // console.log(this.detectedEmployee, 'detectedemp')
              if (logAttendance.check_in && logAttendance.check_out) {
                this.operation = "out"

              }
              else if (logAttendance.check_in && !logAttendance.check_out) {
                this.operation = "in"
              }
              let isSaved = await this.storage.saveAttendance(logAttendance, this.detectedEmployee)


              // console.log(isSaved, "attendance saved")
              // add a local log too
              //after successful logging restart the loop
              setTimeout(() => {
                this.operation = null
                this.detectedEmployee = undefined;
                this.startDetectionLoop();
              }, 5000)
            }
            else {
              this.operation = null;
              this.detectedEmployee = { display_name: "Unknown" };
              setTimeout(() => {
                this.operation = null
                this.detectedEmployee = undefined;
                this.startDetectionLoop();
              }, 5000)
            }
            this.clearDetections(fullDetection.detection, img.width, img.height, recognizedLabel);
          }



        } else {
          this.debugMessage = 'Face detected, but Matcher not loaded.';
          // await this.drawDetections(fullDetection.detection, img.width, img.height, 'Matcher Missing');
        }
      }
      else {
        setTimeout(() => {
          this.operation = null
          this.detectedEmployee = undefined;
          this.startDetectionLoop();
        }, 800)
      }



    } catch (error) {
      console.error('Recognition loop error:', error);
      this.debugMessage = `Error in loop: Check console.`;
    }
  }

  async clearDetections(detection: faceapi.FaceDetection, imageWidth: number, imageHeight: number, label: string) {
    const canvas = this.overlayRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scaleX = canvas.width / (imageWidth);
    const scaleY = (canvas.height - 300) / (imageHeight);
    const box = detection.box;
    const scaledX = box.x * scaleX;
    const scaledY = box.y * scaleY;
    const scaledWidth = box.width * scaleX;
    const scaledHeight = box.height * scaleY;
    ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);

  }

  async drawDetections(detection: faceapi.FaceDetection, imageWidth: number, imageHeight: number, label: string) {
    const canvas = this.overlayRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const box = detection.box;
    const scaleX = canvas.width / (imageWidth);
    const scaleY = (canvas.height) / (imageHeight);

    const scaledX = box.x * scaleX;
    const scaledY = box.y * scaleY;
    const scaledWidth = box.width * scaleX;
    const scaledHeight = box.height * scaleY;

    ctx.strokeStyle = label.includes('Unknown') ? 'red' : 'lime';
    ctx.lineWidth = 3;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    ctx.fillStyle = label.includes('Unknown') ? 'red' : 'lime';
    ctx.font = '20px Arial';
    ctx.fillText(label, scaledX, scaledY - 10);
    setTimeout(() => {
      ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);
    }, 800);
  }

  clearOverlay() {
    this.overlayRef.nativeElement.getContext('2d')?.clearRect(0, 0, this.overlayRef.nativeElement.width, this.overlayRef.nativeElement.height);
  }

  ngOnDestroy() {

    // if (this.isCameraStarted) {
    //   CameraPreview.stop();
    // }
  }
}
