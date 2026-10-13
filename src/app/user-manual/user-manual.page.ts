import { AttendanceService, StorageService } from '../services/storage.service';
import { inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  helpCircleOutline, 
  timeOutline, 
  lockClosedOutline, 
  buildOutline,
  chevronDownOutline,
  arrowBackOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-user-manual',
  templateUrl: './user-manual.page.html',
  styleUrls: ['./user-manual.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    CommonModule,
    FormsModule,
  ],
})
export class UserManualPage implements OnInit {
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  constructor() {
    addIcons({
      helpCircleOutline,
      timeOutline,
      lockClosedOutline,
      buildOutline,
      chevronDownOutline,
      arrowBackOutline
    });
  }

  ngOnInit() {}

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
  }

  ionViewDidLeave() {

    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
