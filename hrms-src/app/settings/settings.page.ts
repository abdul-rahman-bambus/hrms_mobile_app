import { Component, ViewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  ModalController,
  IonIcon,
  IonButtons,
  NavController,
  IonToggle,
  IonInput,
  IonSelect,
  IonSelectOption,
  AlertController,
  IonFooter, IonCard, IonCardHeader, IonCardTitle, IonCardContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import { PinsetupPage } from '../pinsetup/pinsetup.page';
// import { addIcons } from "ionicons"

// import { arrowBackOutline, createOutline, keyOutline, logOutOutline, globeOutline, lockClosedOutline, logInOutline, businessOutline, personCircleOutline,syncOutline,languageOutline, language } from "ionicons/icons";
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { TranslateModule } from '@ngx-translate/core';
import {AndroidSettings, IOSSettings, NativeSettings} from "capacitor-native-settings";
// import { flashOutline } from 'ionicons/icons';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonCardContent, IonCardTitle, IonCardHeader, IonCard, 
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonButtons,
    IonToggle,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonFooter,
    TranslateModule
],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss']
})
export class SettingsPage {
  url: string = 'https://example.com';
  username: string = 'john.doe';
  password: string = '********';
  cred: LocalCredentials | undefined = undefined;
  sound: boolean = false;
  selected_company: number | undefined = 0;
  allowed_companies: { "id": number, "name": string }[] = []
  // check_in_delay="30s";
  // check_out_delay="1m";
  check_in_delay: string = "";
  check_out_delay: string = "";
  sync_delay:string="";
  languages = [
    { code: 'ta', label: 'தமிழ்' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'te', label: 'తెలుగు' }
  ];
  selectedLanguage:string="en"
  isOptimized: boolean = true;
  @ViewChild("soundToggle") soundToggle:HTMLIonToggleElement|undefined;

  constructor(
    private router: Router,
    private modal: ModalController,
    public nav: NavController,
    private storage: StorageService,
    private odoo: OdooJsonRpcService,
    private attService: AttendanceService,
    private ionAlert: AlertController
  ) {
    // addIcons({ arrowBackOutline, createOutline, keyOutline, logOutOutline, globeOutline, lockClosedOutline, logInOutline, businessOutline, personCircleOutline ,syncOutline,languageOutline})
    
  }

  async openBatterySettings() {
  // Direct path to App Info is best for Oppo/Android 15 users to find the 'Battery' toggle
  await NativeSettings.open({
    optionAndroid:AndroidSettings.ApplicationDetails,
    optionIOS:IOSSettings.App 
  });
}
 

  async ionViewWillEnter(): Promise<void> {
    let credJson: LocalCredentials = await this.storage.getCredentials();
    let language=await this.storage.getLanguage();
    this.cred = credJson;
    if (credJson) {
      this.url = credJson.url;
      this.username = credJson.login;
      this.password = credJson.password;
      this.sound = credJson.sound;
      this.check_in_delay = credJson.check_in_delay ? credJson.check_in_delay : "30s";
      this.check_out_delay = credJson.check_out_delay ? credJson.check_out_delay : "1m";
      this.sync_delay=credJson.sync_delay?credJson.sync_delay:"15m";
      this.selected_company = credJson.selected_company?.id
      this.allowed_companies = credJson.companies;
      this.selectedLanguage=language;

    }
  }

 async logout(): Promise<void> {
  let logoutAlert = await this.ionAlert.create({
    header: this.storage.translate.instant("LOGOUT"),
    message: this.storage.translate.instant("ARE_YOU_LOGOUT"),
    buttons: [
      { text: this.storage.translate.instant("CANCEL"), role: 'cancel' },
      {
        text: this.storage.translate.instant("LOGOUT"),
        handler: async () => {
          await this.storage.showLoading();
          try {
            // 1. Sync data first
            await this.attService.syncToOdoo();
            
            // 2. Clear background listeners strictly AFTER sync
            await this.storage.logoutCleanup();
            this.attService.stopSyncing(); // Cron-ai stop pannunga

            // 3. Reset local variables
            this.odoo.uid = undefined;
            this.cred = undefined;

            // 4. Clear Storage
            await Promise.all([
              Preferences.remove({ key: "enrollments" }),
              Preferences.remove({ key: "credentials" }),
              this.attService.deleteOlderAttendance(),
              this.attService.deleteEmployees()
            ]);

            await this.storage.hideLoading();
            this.router.navigateByUrl('/login', { replaceUrl: true });
          } catch (e) {
            await this.storage.hideLoading();
            console.error("Logout error", e);
          }
        }
      }
    ]
  });
  await logoutAlert.present();
}

  changeLanguage(){
    this.storage.setLanguage(this.selectedLanguage);
      this.storage.translate.use(this.selectedLanguage);
  }

  async setValues(): Promise<void> {
   
    if (this.cred) {
      this.cred.sound = this.soundToggle?.checked || false;
      this.cred.check_in_delay = this.check_in_delay;
      this.cred.check_out_delay = this.check_out_delay;
      this.cred.sync_delay=this.sync_delay;
      this.cred.selected_company = this.allowed_companies.filter((comp) => comp.id === this.selected_company)[0]
      this.storage.selected_company = this.cred.selected_company;
      // this.cred.language=this.selectedLanguage;
      


    }
    console.log(this.cred,"creddd")

    console.log(this.cred, "creddd")
    Preferences.set({ "key": "credentials", "value": JSON.stringify(this.cred) }).then(async()=>{
      this.storage.showToast({
        "message":this.storage.translate.instant("SETTINGS_SAVED"),
        "position":"top",
        "color":"medium",
        "duration":1500
      })
      this.attService.cron();
      console.log(this.selectedLanguage,"lanug")
      this.selectedLanguage?this.storage.translate.use(this.selectedLanguage):undefined;
    })
  }

  async pinChange(): Promise<void> {
    let pinModal: HTMLIonModalElement = await this.modal.create({
      component: PinsetupPage,
      componentProps: { "settingsModal": this.modal }
    });
    pinModal.present();
  }
}
