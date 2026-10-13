import { inject, signal, Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FormsModule } from '@angular/forms';
import { CameraPreview as CapgoCameraPreview, CameraPreviewOptions as CapgoCameraPreviewOptions } from '@capgo/camera-preview';
import { FaceRecognition } from 'capacitor-face-recognition-tflite';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonFooter, IonContent, IonButton, IonButtons, IonItem, IonList, IonLabel, IonProgressBar, IonBackButton, IonCard, IonFabButton, IonFab, ToastController, NavController } from '@ionic/angular/standalone';
import { OdooJsonRpcService } from "../services/odoojsonrpc.service";
import { AttendanceService, EmployeeService, FaceDataStructure, StorageService } from '../services/storage.service';
import { GetResult, Preferences } from '@capacitor/preferences';
import { TranslateModule } from '@ngx-translate/core';

interface EmployeePayload {
  display_name: string;
  image_1024: string;
  job_id: number | null;
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
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  constructor(
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private toast: ToastController,
    private empservice: EmployeeService,
    private navCtrl: NavController
  ) { }

  @ViewChild('cameraPreview', { static: true }) cameraRef!: ElementRef<HTMLDivElement>;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;
  networkProgress = signal<boolean>(false);

  formData = signal<EmployeePayload>({
    display_name: '',
    image_1024: '',
    job_id: null,
    active: true,
  });

  capturedImageBase64 = signal<string>('');
  debugMessage = signal<string>('Initializing...');
  isCameraStarted = signal<boolean>(false);
  isFaceDetected = signal<boolean>(false);
  isScanning = signal<boolean>(false);
  capturedEnrollmentSamples = signal<string[]>([]);
  readonly maxEnrollmentSamples = 1;

  private detectionTimer!: NodeJS.Timeout;
  private isComponentActive = false;
  private isProcessing = false;

  async ionViewWillEnter() {
    if (this.appStateSub) {
      this.appStateSub.remove();
    }
    this.appStateSub = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && this._injectedStorage.isNetworkAvailable) {
        console.log('App backgrounded, syncing data...');
        await this._injectedAttService.syncToOdoo();
      }
    });

    if (this.storage.selectedEmployee) {
      this.formData.set(this.storage.selectedEmployee);
    }
    this.capturedImageBase64.set('');
    this.capturedEnrollmentSamples.set([]);
    await this.startCamera();
    this.setupCanvas();
  }

  async ngOnInit(): Promise<void> { }

  async loadModels(): Promise<void> {
    this.debugMessage.set('TFLite Face Recognition model ready.');
  }

  async startCamera(): Promise<void> {
    try {
      const parentElementId: string = this.cameraRef.nativeElement.id || 'cameraPreview';
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
        await CapgoCameraPreview.stop({ force: true });
      }

      await CapgoCameraPreview.start(cameraOptions);
      this.isCameraStarted.set(true);
    } catch (error) {
      this.debugMessage.set('Camera error - check permissions.');
      console.error('Error starting camera:', error);
    }
  }

  setupCanvas(): void {
    setTimeout(() => {
      const canvas: HTMLCanvasElement = this.overlayRef.nativeElement;
      canvas.width = window.screen.width;
      canvas.height = window.screen.height;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
    }, 500);
  }

  ngOnDestroy(): void {
    clearInterval(this.detectionTimer);
    if (this.isCameraStarted()) {
      CapgoCameraPreview.stop({ force: true });
    }
  }

  async startDetectionLoop(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.isScanning.set(true);
    this.networkProgress.set(true);

    try {
      this.capturedImageBase64.set('');

      if (!this.isCameraStarted()) {
        await this.startCamera();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      const photo = await CapgoCameraPreview.capture({ quality: 50 });
      if (!photo?.value) {
        console.warn('No photo captured from camera');
        return;
      }

      const rawBase64 = photo.value.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, '');
      const dataUri = `data:image/jpeg;base64,${rawBase64}`;
      const resizedBase64 = await this.storage.resizeBase64Image(dataUri);
      const cleanBase64 = resizedBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/[\r\n]/g, '');

      const finalBase64 = await this.storage.straightenBase64Image(cleanBase64);

      try {
        const detectionResult = await FaceRecognition.detectFaces({ imageBase64: finalBase64 });
        if (detectionResult?.faces && detectionResult.faces.length > 0) {
          this.isFaceDetected.set(true);
        }
      } catch (err) {
        console.warn('Face detection check skipped/failed:', err);
      }

      this.capturedImageBase64.set(finalBase64);
      this.formData.set({
        ...this.formData(),
        image_1024: finalBase64
      });
      this.capturedEnrollmentSamples.set([finalBase64]);

      const toast = await this.toast.create({
        message: 'Photo captured successfully!',
        duration: 2000,
        color: 'success',
        position: 'top'
      });
      await toast.present();
    } catch (error) {
      console.error('Error during photo capture:', error);
      const toast = await this.toast.create({
        message: 'Failed to capture photo. Please try again.',
        duration: 2000,
        color: 'danger',
        position: 'top'
      });
      await toast.present();
    } finally {
      try {
        if (this.isCameraStarted()) {
          await CapgoCameraPreview.stop({ force: true });
        }
      } catch (e) {
        console.warn('Error stopping camera preview:', e);
      }
      this.isCameraStarted.set(false);
      this.isScanning.set(false);
      this.isProcessing = false;
      this.networkProgress.set(false);
    }
  }

  async submitEnrollment(): Promise<void> {
    const currentData = this.formData();
    if (!currentData.display_name || !currentData.image_1024) return;
    this.networkProgress.set(true);
    try {
      const selectedEmp = this.storage.selectedEmployee || currentData;
      const odooId = selectedEmp.odoo_id || selectedEmp.id;
      const today = new Date();

      // 1. Update SQLite local employee record
      await this.storage.updateEmployee(
        selectedEmp,
        {
          image_1024: currentData.image_1024,
          is_enrolled: 1,
          employee_sync: 0,
          last_photo_update_time: today.toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
        }
      );

      // 2. Generate TFLite face descriptor sample
      try {
        const descriptorSource = {
          ...selectedEmp,
          id: odooId,
          odoo_id: odooId,
          company_id: Array.isArray(selectedEmp.company_id) ? selectedEmp.company_id : [this.storage.selected_company?.id],
          image_1024: currentData.image_1024
        };
        const descriptors = await this.storage.generateLabeledDescriptors([descriptorSource], 'offline');
        const descriptorSample = descriptors[0]?.descriptor;
        if (descriptorSample?.length) {
          await this.storage.updateEmployee(
            selectedEmp,
            { face_descriptor_sample: JSON.stringify(descriptorSample) }
          );
          if (odooId) {
            await this.storage.upsertEnrollmentDescriptor(Number(odooId), descriptorSample);
          }
        }
      } catch (descError) {
        console.warn('Descriptor extraction warning during enrollment:', descError);
      }

      // 3. Sync photo update to Odoo server if online
      if (this.storage.isNetworkAvailable && odooId) {
        try {
          await this.odoo.updateEmployee(odooId, currentData.image_1024);
          await this.storage.updateEmployee(selectedEmp, { employee_sync: 1 });
        } catch (odooErr) {
          console.warn('Odoo photo sync queued for offline sync:', odooErr);
        }
      }

      const toast = await this.toast.create({
        message: 'Face photo updated and enrolled successfully!',
        duration: 2000,
        color: 'success',
        position: 'top'
      });
      await toast.present();

      this.navCtrl.back();
    } catch (err) {
      console.error('Enrollment error:', err);
      const toast = await this.toast.create({
        message: 'Failed to update employee photo.',
        duration: 3000,
        color: 'danger',
        position: 'top'
      });
      await toast.present();
    } finally {
      this.networkProgress.set(false);
    }
  }
}
