import { Component, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
// import {cloudOfflineOutline} from "ionicons/icons"
// import {addIcons} from "ionicons"
// Ionic standalone imports
import {
  IonContent,
  IonIcon
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-offline',
  templateUrl: './offline.page.html',
  styleUrls: ['./offline.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonIcon
]
})
export class OfflinePage implements OnInit {

  constructor() {
    // addIcons({cloudOfflineOutline})
  }

  ngOnInit():void {}

}
