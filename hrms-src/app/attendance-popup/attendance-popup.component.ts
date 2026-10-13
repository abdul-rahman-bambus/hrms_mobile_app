import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {IonContent,IonToolbar,IonTitle,IonIcon,IonButton,IonButtons,IonHeader,ModalController} from "@ionic/angular/standalone";
// import {closeOutline, logInOutline, logOutOutline, timeOutline} from "ionicons/icons";
// import {addIcons} from 'ionicons';


@Component({
  selector: 'app-attendance-popup',
  standalone: true,
  imports: [CommonModule, DatePipe,IonToolbar,IonTitle,IonContent,IonIcon,IonButton,IonButtons,IonHeader],
  templateUrl: './attendance-popup.component.html',
  styleUrls: ['./attendance-popup.component.scss'],
  providers:[ModalController]
})
export class AttendancePopupComponent {
  @Input() attendance!: any;
  workedHours: string = '—';

  constructor(private modalCtrl: ModalController) {
    // addIcons({closeOutline,timeOutline,logOutOutline,logInOutline,})
  }





  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
