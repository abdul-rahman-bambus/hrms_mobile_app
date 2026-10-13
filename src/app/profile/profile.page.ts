import { inject, signal, computed, Component } from '@angular/core';
import { App } from '@capacitor/app';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import {
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonLabel,
  IonMenuToggle,
  IonProgressBar,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cameraOutline,
  list,
  listOutline,
  personAddOutline,
  personCircle,
  settingsOutline,
  syncOutline,
  ellipsisVertical
} from 'ionicons/icons';
import { TranslateModule } from '@ngx-translate/core';
import { AttendanceService, LocalEmployees, StorageService } from '../services/storage.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [
    CommonModule,
    TranslateModule,
    IonAvatar,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonLabel,
    IonMenuToggle,
    IonProgressBar,
    IonTitle,
    IonToolbar
  ]
})
export class ProfilePage {
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  employee = signal<LocalEmployees | undefined>(undefined);
  loading = signal<boolean>(false);
  isSyncing = signal<boolean>(false);

  constructor(
    public storage: StorageService,
    public router: Router,
    private alertController: AlertController,
    private attendanceService: AttendanceService
  ) {
    addIcons({
      cameraOutline,
      list,
      listOutline,
      personAddOutline,
      personCircle,
      settingsOutline,
      syncOutline,
      ellipsisVertical
    });
  }

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

    this.loading.set(true);

    try {
      if (this.storage.isNetworkAvailable) {
        this.employee.set(await this.storage.syncCurrentEmployee());
      } else {
        this.employee.set(await this.storage.ensureCurrentEmployeeLoaded());
      }
    } finally {
      this.loading.set(false);
    }
  }

  profileImage = computed(() => {
    const imageData = this.employee()?.image_1024;
    if (!imageData || imageData === 'false') {
      return '/assets/person.png';
    }

    if (imageData.startsWith('PD94bW')) {
      return `data:image/svg+xml;base64,${imageData}`;
    }

    if (imageData.startsWith('iVBORw')) {
      return `data:image/png;base64,${imageData}`;
    }

    return `data:image/jpeg;base64,${imageData}`;
  });

  async refreshProfile(): Promise<void> {
    if (this.isSyncing()) {
      return;
    }

    this.isSyncing.set(true);

    try {
      await this.attendanceService.syncToOdoo();
      this.employee.set(await this.storage.syncCurrentEmployee());
    } finally {
      this.isSyncing.set(false);
    }
  }

  goTo(page: string): void {
    if (page === '/home') {
      this.storage.exitPage = '/home';
    }

    this.router.navigateByUrl(page);
  }

  startSelfEnrollment(): void {
    const emp = this.employee();
    if (!emp) return;

    this.storage.selectedEmployee = { ...emp };
    this.router.navigateByUrl('/enroll');
  }

  isTrackingEnabled = computed(() => {
    const emp = this.employee();
    return emp?.track_employee === true || (emp?.track_employee as any) === 1;
  });

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
