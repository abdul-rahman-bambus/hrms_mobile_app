import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from "@ionic/angular";
import { CameraPreview, CameraPreviewOptions } from '@capacitor-community/camera-preview';
import * as faceapi from '@vladmandic/face-api';
import { OdooJsonRpcService } from "../services/odoojsonrpc.service"; // Assuming your Odoo service is here
import { FaceDataStructure, StorageService } from '../services/storage.service';
import {addIcons} from "ionicons"
import {cloudUploadOutline,personOutline,bagOutline, checkmarkCircleSharp, closeCircleSharp,cameraOutline} from "ionicons/icons";
import {ToastController} from "@ionic/angular";

// Define the structure for the data sent to Odoo
interface EmployeePayload {
  display_name: string;
  image_128: string; // Base64 string
  job_id: number | null; // Odoo FK needs an ID
  active: boolean;
}

@Component({
  selector: 'app-enroll',
  templateUrl: './enroll.page.html',
  styleUrls: ['./enroll.page.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, IonicModule]
})
export class EnrollPage implements OnInit, OnDestroy {
  constructor(private odoo: OdooJsonRpcService,private storage:StorageService,private toast:ToastController) {
    addIcons({cloudUploadOutline,personOutline,bagOutline,checkmarkCircleSharp,closeCircleSharp,cameraOutline})
   }
  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;
networkProgress=false;
  // Form Data Model
  formData: EmployeePayload = {
    display_name: '',
    image_128: '',
    job_id: null, // Example: You need to fetch job IDs from Odoo
    active: true,
  };
  
  // UI and State
  capturedImageBase64: string = '';
  debugMessage: string = 'Initializing...';
  isCameraStarted = false;
  isFaceDetected = false;
  
  private detectionTimer: any;
  private detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });

  
  async ionViewDidEnter(){
    this.formData=this.storage.selectedEmployee
    console.log(this.formData,"form daaat")
     await this.startCamera();
    this.setupCanvas();
    // this.startDetectionLoop();
  }
  async ngOnInit() {
    // await this.odoo.login(); // Ensure login is complete
    // await this.loadModels();
   
  }

  // --- Setup & Lifecycle ---

  async loadModels() {
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

  async startCamera() {
    try {
      const parentElementId = this.cameraRef.nativeElement.id || 'cameraPreview';
      this.cameraRef.nativeElement.id = parentElementId;
      
      const cameraOptions: CameraPreviewOptions = {
        position: 'front',
        parent: parentElementId,
        width: window.innerWidth,
        height: window.innerHeight-300,
        toBack: true,
      };
      
      await CameraPreview.start(cameraOptions);
      this.isCameraStarted = true;
    } catch (error) {
      this.debugMessage = 'Camera error - check permissions.';
      console.error('Error starting camera:', error);
    }
  }

  setupCanvas() {
    setTimeout(() => {
      const canvas = this.overlayRef.nativeElement;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
    }, 500);
  }

  ngOnDestroy() {
    clearInterval(this.detectionTimer);
    if (this.isCameraStarted) {
      CameraPreview.stop();
    }
  }

  // --- Face Detection & Auto Capture Logic ---

  startDetectionLoop() {
    // Check every 500ms
    this.detectionTimer = setInterval(() => this.runDetection(), 500); 
  }

  async runDetection() {
    // Prevent execution if camera isn't ready or face is already captured
    if (!this.isCameraStarted || this.isFaceDetected) return; 

    try {
      // 1. Capture frame at low quality for speed
      const photo = await CameraPreview.capture({ quality: 80 }); 
      if (!photo.value) return;

      const img = new Image();
      const correctedBase64 = await this.storage.rotateBase64Image(img,photo.value,90);
      img.src = `data:image/jpeg;base64,${correctedBase64}`;
      
      // Wait for image load. Add reject handler for robustness.
      await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject; // Rejects the promise if image data is invalid
      });
      // 2. Perform Detection
      // The result 'detection' is a FaceDetection object (or null)
      let detection = await faceapi.detectSingleFace(img, this.detectionOptions);
      // NOTE: Do NOT chain .withFaceLandmarks() or .withFaceDescriptor() here
      // as they are not needed for simple bounding box detection and slow things down.
      // const displaySize = { width: 320, height: 240 }
      // detection= faceapi.resizeResults(detection, displaySize)
      // 3. Draw Detection Box
      // FIX: The detection object itself is passed (it contains the box property).
      this.drawDetectionBox(detection, img.width, img.height); 
      if (detection) {
        // FIX: Access score directly from the FaceDetection object.
        this.debugMessage = `Face detected! Confidence: ${(detection.score * 100).toFixed(1)}%`;
        console.log(this.debugMessage,"messsss")
        // 4. AUTO CAPTURE AND STOP LOOP
        if (!this.isFaceDetected && detection.score > 0.8) {
             this.isFaceDetected = true; 
             clearInterval(this.detectionTimer); // Stop loop
             await this.captureAndSetPhoto(correctedBase64);
        }
      } else {
        this.debugMessage = 'No face detected.';
      }

    } catch (error) {
      // Log critical errors like image decoding failure
      console.error('Detection loop error (Image load or processing failed):', error);
      this.debugMessage = `Error processing frame.`;
    }
}


  
  async captureAndSetPhoto(base64Image: string) {
      // The Base64 string is ready for Odoo
      
      this.capturedImageBase64 = `data:image/jpeg;base64,${base64Image}`;
      this.formData.image_128=base64Image;
      
      // Stop the camera preview after successful capture
      if (this.isCameraStarted) {
          await CameraPreview.stop();
          this.isCameraStarted = false;
      }
      this.debugMessage = 'Photo automatically captured! Ready to submit.';
  }

  // --- UI and API Logic ---

  async submitEnrollment() {
    if (!this.formData.display_name || !this.formData.image_128 || this.formData.job_id === null) {
      alert('Please fill all required fields and ensure a photo is captured.');
      return;
    }
    
    // Convert base64 to Odoo's expected format (remove MIME prefix if present, which your logic already does)
   
    
    try {
      this.debugMessage = 'Submitting data to Odoo...';
      this.networkProgress=true;
      let updated:boolean=await this.odoo.updateEmployee(this.storage.selectedEmployee.id,this.formData.image_128)
      this.networkProgress=false;
      if(updated){
let updatedToast=await this.toast.create({
  color:"success",
  position:"top",
  message:`${this.formData.display_name}'s enrolled successfully`,
  "duration":2000
})
updatedToast.present();
console.log(this.storage.selectedEmployee,"sell")
let descriptors = await this.storage.generateLabeledDescriptors([this.storage.selectedEmployee]);
const data = localStorage.getItem('enrollments');
// if (!data) {
//   this.debugMessage = 'No enrollments found. Go to Enroll page first.';
//   return;
// }

let enrolledUsers:FaceDataStructure[] =data?JSON.parse(data):[];
let enrolledUsersfilter=enrolledUsers.filter((user)=>user.employee_id===this.storage.selectedEmployee.id);

if(enrolledUsersfilter.length>0){
  enrolledUsers=enrolledUsers.map((user)=>{
    if(user.employee_id===this.storage.selectedEmployee.id){
      user.descriptor=descriptors[0].descriptor;
      
    }
    return user
  });
}
else if(enrolledUsersfilter.length===0){
  enrolledUsers.push({...this.storage.selectedEmployee,'descriptor':descriptors[0].descriptor,"label":this.storage.selectedEmployee.id})
}
console.log(enrolledUsers,"enrolled")
localStorage.setItem("enrollments",JSON.stringify(enrolledUsers))
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

  drawDetectionBox(detection: faceapi.FaceDetection | undefined, imageWidth: number, imageHeight: number) {
    
    const canvas = this.overlayRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!detection) return;

    // ... (Drawing logic same as before, ensuring scaling) ...
    const box = detection.box;
    const scaleX = canvas.width / imageWidth;
    const scaleY = canvas.height / imageHeight;
    
    const scaledX = box.x * scaleX;
    const scaledY = box.y * scaleY;
    const scaledWidth = box.width * scaleX;
    const scaledHeight = box.height * scaleY;

    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 3;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
    
    ctx.fillStyle = 'lime';
    ctx.font = '20px Arial';
    ctx.fillText(`LOOK HERE`, scaledX, scaledY - 10);
  }
}