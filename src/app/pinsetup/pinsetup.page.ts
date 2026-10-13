import { Component, OnInit, Input, ViewChild, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButton, IonLabel, IonInput, ModalController, ToastController, } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import { Preferences } from '@capacitor/preferences';
import { TranslateModule } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

@Component({
  selector: 'app-pinsetup',
  templateUrl: './pinsetup.page.html',
  styleUrls: ['./pinsetup.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, FormsModule, IonButton, IonLabel, IonInput, TranslateModule, IonTitle]
})
export class PinsetupPage implements OnInit {
  @ViewChild('newPinInput', { static: false }) newPinField: IonInput | undefined;
  @ViewChild('confirmPinInput', { static: false }) confirmPinField: IonInput | undefined;
  @Input('settingsModal') settingsModal: ModalController | undefined;

  newPin = signal<string>('');
  confirmPin = signal<string>('');
  localcredJson = signal<LocalCredentials | undefined>(undefined);

  constructor(
    private toastCtrl: ToastController,
    private router: Router,
    private storage: StorageService,
    private attService: AttendanceService,
  ) {
    addIcons({ arrowBackOutline });
  }
  ngOnInit(): void {

  }

  private async bootstrapData(): Promise<void> {
    const currentCred = this.localcredJson();
    if (
      !this.storage.isNetworkAvailable ||
      !this.storage.odoo.uid ||
      !currentCred?.selected_company
    ) {
      return;
    }

    this.storage.selected_company = currentCred.selected_company;
    await this.storage.showLoading();
    try {
      await this.storage.syncUsers();

      const today = new Date().toISOString().split('T')[0];
      await this.attService.fetchAttendanceFromOdoo([
        ['check_in', 'ilike', `${today}%`],
        ['employee_id.company_id', '=', currentCred.selected_company.id]
      ]);
    } catch (error) {
      console.error('Bootstrap sync failed', error);
    } finally {
      await this.storage.hideLoading();
    }
  }

  onNewPinInput() {
    if (this.newPin() && this.newPin().length === 4) {
      setTimeout(() => {
        this.confirmPinField?.setFocus();
      }, 100);
    }
  }

  async ionViewDidEnter(): Promise<void> {
    console.log(this.storage.translate.getCurrentLang(), "current lang");
    this.localcredJson.set(await this.storage.getCredentials());
  }

  async goBack(): Promise<void> {
    if (this.settingsModal) {
      await this.settingsModal.dismiss();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    await this.router.navigateByUrl('/login');
  }

  async savePin(): Promise<void> {
    if (!this.newPin() || !this.confirmPin()) {
      this.storage.showToast({
        message: this.storage.translate.instant("ENTER_PIN_FIELDS"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    if (this.newPin() !== this.confirmPin()) {
      this.storage.showToast({
        message: this.storage.translate.instant("PIN_NOT_MATCH"),
        duration: 2000,
        color: 'medium',
        position: "top"
      });
      return;
    }

    const currentCred = this.localcredJson();
    if (currentCred) {
      currentCred.pin = this.newPin();
      if (currentCred.is_internal_user !== false && currentCred.companies?.length === 1 && !currentCred.selected_company) {
        currentCred.selected_company = currentCred.companies[0];
      }
      Preferences.set({ "key": "credentials", "value": JSON.stringify(currentCred) });
    }
    this.storage.showToast({
      message: this.storage.translate.instant("PIN_SET_SUCCESSFUL"),
      duration: 2000,
      color: 'medium',
      position: "top"
    });
    if (this.settingsModal) {
      await this.settingsModal.dismiss();
      return;
    }
    await this.bootstrapData();
    this.storage.isPinAuthenticated = true;
    if (currentCred?.selected_company) {
      this.storage.selected_company = currentCred.selected_company;
      this.storage.exitPage = "/home";
      this.storage.is_pin_setup = true;
      this.router.navigateByUrl('/home', { replaceUrl: true });
    }
    else if (currentCred?.is_internal_user === false) {
      this.storage.selected_company = undefined;
      this.storage.exitPage = "/home";
      this.storage.is_pin_setup = true;
      this.router.navigateByUrl('/home', { replaceUrl: true });
    }
    else if (!currentCred?.selected_company) {
      this.storage.exitPage = "/company";
      this.storage.is_pin_setup = true;
      this.router.navigateByUrl('/company', { replaceUrl: true });
    }
  }
}
