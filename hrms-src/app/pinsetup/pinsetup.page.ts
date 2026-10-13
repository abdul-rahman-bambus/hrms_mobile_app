import { Component, OnInit, Input, ViewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonLabel, IonItem, IonInput, ModalController,ToastController } from '@ionic/angular/standalone';
import { Route, Router } from '@angular/router';
import { LocalCredentials, StorageService } from '../services/storage.service';
import { Preferences } from '@capacitor/preferences';
import { TranslateModule } from '@ngx-translate/core';


@Component({
  selector: 'app-pinsetup',
  templateUrl: './pinsetup.page.html',
  styleUrls: ['./pinsetup.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, FormsModule, IonButton, IonLabel, IonInput, TranslateModule]
})
export class PinsetupPage implements OnInit {
  @ViewChild('newPinInput', { static: false }) newPinField: IonInput | undefined;
  @ViewChild('confirmPinInput', { static: false }) confirmPinField: IonInput | undefined;
  @Input('settingsModal') settingsModal: ModalController | undefined;

  newPin: string = '';
  confirmPin: string = '';
  localcredJson: LocalCredentials | undefined = undefined;

  constructor(private toastCtrl: ToastController, private router: Router, private storage: StorageService) { }
  ngOnInit(): void {

  }

  onNewPinInput() {
    if (this.newPin && this.newPin.length === 4) {
      setTimeout(() => {
        this.confirmPinField?.setFocus();
      }, 100); // Chinna delay kudutha focus smooth-ah irukkum
    }
  }

  async ionViewDidEnter(): Promise<void> {
    console.log(this.storage.translate.getCurrentLang(),"current lang")
    //console.log(localCredentials,"locoo")
    this.localcredJson = await this.storage.getCredentials();
  }

  // async showToast(msg: string): Promise<void> {
  //   const toast:HTMLIonToastElement = await this.toastCtrl.create({
  //     message: msg,
  //     duration: 2000,
  //     color: 'medium',
  //     position:"top"
  //   });
  //   toast.present();
  // }

  async savePin(): Promise<void> {
    if (!this.newPin || !this.confirmPin) {
      this.storage.showToast({
        message: this.storage.translate.instant("ENTER_PIN_FIELDS"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })
      return;
    }

    if (this.newPin !== this.confirmPin) {
      this.storage.showToast({
        message: this.storage.translate.instant("PIN_NOT_MATCH"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })

      return;
    }

    this.localcredJson ? this.localcredJson.pin = this.newPin : undefined;
    Preferences.set({ "key": "credentials", "value": JSON.stringify(this.localcredJson) })
    this.storage.showToast({
      message: this.storage.translate.instant("PIN_SET_SUCCESSFUL"),
      duration: 2000,
      color: 'medium',
      position: "top"
    })
    if (this.settingsModal) {
      await this.settingsModal.dismiss();
      return;
    }
    // this.storage.isAuthenticated=true;
    // this.storage.exitPage="/employee-list";
    // this.router.navigateByUrl('/employee-list');
    if (this.localcredJson?.selected_company) {
      this.storage.exitPage = "/home";
      this.storage.is_pin_setup = true;
      this.router.navigateByUrl('/home');
    }
    else if (!this.localcredJson?.selected_company) {
      this.storage.exitPage = "/company";
      this.storage.is_pin_setup = true;
      this.router.navigateByUrl('/company');
    }


  }

}
