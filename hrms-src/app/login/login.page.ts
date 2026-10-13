import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonContent, ToastController, ModalController, IonIcon, IonSelect, IonSelectOption, IonButton, IonHeader, IonButtons, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { StorageService, LocalCredentials, AttendanceService } from '../services/storage.service';
import { Preferences } from "@capacitor/preferences";
import { Subscription } from 'rxjs';
// import { languageOutline } from 'ionicons/icons';
// import { addIcons } from 'ionicons';
import { TranslateModule } from '@ngx-translate/core';



@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IonContent, IonIcon, IonSelect, IonSelectOption, IonButton, TranslateModule, IonHeader, IonButtons, IonTitle, IonToolbar],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit, OnDestroy {
  url: string = '';
  username: string = '';
  password: string = '';
  pin: string = '';
  isPinSet: boolean = false;
  denied: boolean = false;
  @Input("gotopage") gotopage: string | undefined;
  @Input("loginmodal") loginmodal: ModalController | undefined;
  @ViewChild('langSelect', { static: false }) select: IonSelect | undefined;
  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private attService: AttendanceService
  ) {
    // addIcons({ languageOutline })
  }
  selectedLanguage = "";
  languages = [
    { code: 'ta', label: 'தமிழ்' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'ml', label: 'മലയാളം' },
    { code: 'kn', label: 'ಕನ್ನಡ' },
    { code: 'te', label: 'తెలుగు' }
  ];
  private querySub: Subscription | undefined;
  changeLanguage() {
    if (this.selectedLanguage !== this.storage.translate.currentLang) {
      this.storage.setLanguage(this.selectedLanguage);
      this.storage.translate.use(this.selectedLanguage);
    }
  }

  openLang() {
    console.log(this.select, 'seleee')
    this.select?.open();
  }
  async ionViewWillLeave() {
    this.storage.setLanguage(this.selectedLanguage);
    this.querySub?.unsubscribe();
  }

  ngOnDestroy() {
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
  }

  async ionViewWillEnter(): Promise<void> {
    this.storage.hideLoading();
    this.selectedLanguage = await this.storage.getLanguage() || "en";
    let credentialsJSON: LocalCredentials = await this.storage.getCredentials();



    console.log(this.denied, credentialsJSON, "denited")
    if (this.querySub) {
      this.querySub.unsubscribe();
    }

    this.querySub = this.route.queryParams.subscribe((vals) => {
      console.log('login subscribe')
      if (vals) {

        this.url = credentialsJSON?.['url'];
        if (vals['denied']) {
          //  if(vals["isPinSet"]){
          //   this.isPinSet=true;
          // }
          this.denied = true;

        }
      }
    });
    let topModal=await this.modalCtrl.getTop();

    this.isPinSet = (credentialsJSON?.pin?.length > 0 && credentialsJSON?.uid && !this.denied) || topModal != undefined;
    //console.log('PIN set:', this.isPinSet);
    if (credentialsJSON && credentialsJSON.pin.length === 0 && !this.denied) {
      this.router.navigateByUrl("/pinsetup")
    }

  }

  ngOnInit(): void {

  }

  // async showToast(msg: string): Promise<void> {
  //   const toast: HTMLIonToastElement = await this.toastCtrl.create({
  //     message: msg,
  //     duration: 2000,
  //     color: 'medium',
  //     position: "top"
  //   });
  //   toast.present();
  // }

  // offline(){
  //   this.router.navigateByUrl('/offline');
  // }



  private isValidUrl(url: string): boolean {
    const pattern: RegExp = /^(https?:\/\/)?([a-zA-Z0-9.-]+)(:\d+)?(\/.*)?$/;
    return pattern.test(url.trim());
  }

  async loginWithCredentials(): Promise<void> {
    // this.storage.playAudio();
    if (!this.url || !this.username || !this.password) {
      this.storage.showToast({
        message: this.storage.translate.instant("FILL_ALL_FIELDS_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })
      return;
    }

    // Normalize the URL
    let inputUrl: string = this.url.trim();
    if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
      inputUrl = 'https://' + inputUrl; // default to https first
    }

    // Validate format
    if (!this.isValidUrl(inputUrl)) {
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_URL_FORMAT"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })
      return;
    }



    await this.storage.showLoading();

    // Step 1: Try with the given or https version
    const isHttpsReachable: boolean = await this.odoo.pingOdooServer(inputUrl);
    //console.log(isHttpsReachable, inputUrl, "is rees")
    // Step 2: If not reachable, try with opposite protocol
    let finalUrl: string = inputUrl;
    if (!isHttpsReachable) {
      const altUrl: string = inputUrl.startsWith('https://')
        ? inputUrl.replace('https://', 'http://')
        : inputUrl.replace('http://', 'https://');
      const isAltReachable: boolean = await this.odoo.pingOdooServer(altUrl);
      if (isAltReachable) {
        finalUrl = altUrl;
      } else {
        await this.storage.hideLoading();
        this.storage.showToast({
          message: this.storage.translate.instant("CANT_CONNECT_SERVER_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        })

        return;
      }
    }

    // Proceed with login
    try {
      this.odoo.baseUrl = finalUrl;
      this.odoo.username = this.username.trim();
      this.odoo.password = this.password;

      const loginSuccess: number = await this.odoo.login();
      await this.storage.hideLoading();

      if (loginSuccess) {
        this.storage.isAuthenticated = true;
        this.storage.showToast({
          message: this.storage.translate.instant("LOGIN_SUCCESS_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        })
        this.odoo.uid = loginSuccess
        let data: LocalCredentials = {
          url: finalUrl,
          login: this.username.trim(),
          password: this.password,
          pin: '',
          db: this.odoo.db,
          sound: true,
          uid: loginSuccess,
          check_in_delay: "30s",
          check_out_delay: "1m",
          selected_company: undefined,
          companies: this.odoo.allowed_companies,
          sync_delay: "15m",
          // language:"en"

        }
        // this.storage.setLanguage("en");
        // this.storage.translate.use("en");

        if (!this.denied) {
          await Preferences.set({
            key: "credentials", value: JSON.stringify(data)
          });
          this.attService.cron();

          this.storage.exitPage = '/pinsetup';
          this.router.navigateByUrl('/pinsetup');
        }
        else if (this.denied) {
          let credJson: LocalCredentials = await this.storage.getCredentials();
          let language = await this.storage.getLanguage();
          console.log(credJson, "creddddd")
          let data: LocalCredentials = {
            url: finalUrl,
            login: this.username.trim(),
            password: this.password,
            pin: credJson?.pin,
            db: this.odoo.db,
            sound: credJson.sound,
            check_in_delay: credJson.check_in_delay,
            check_out_delay: credJson.check_out_delay,
            uid: undefined,
            selected_company: credJson.selected_company,
            companies: credJson.companies,
            sync_delay: credJson.sync_delay,
            // language:language || "en"

          };
          await this.storage.setLanguage(language || "en")
          await Preferences.set({
            key: "credentials", value: JSON.stringify(data)
          });
          let loginModal: HTMLIonModalElement = await this.modalCtrl.create({
            component: LoginPage,
            // componentProps: { "gotopage": "/home", loginmodal: this.modalCtrl }
            componentProps: { "gotopage": "/home",  }
          });
          loginModal.present();
        }

        this.attService.startSyncing()

      } else {
        this.storage.showToast({
          message: this.storage.translate.instant("INVALID_CRED_MSG"),
          duration: 2000,
          color: 'medium',
          position: "top"
        })

      }
    } catch (error) {
      await this.storage.hideLoading();
      console.error('Login error:', error);
      this.storage.showToast({
        message: this.storage.translate.instant("ERROR_WHILE_LOGIN_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })

    }

  }




  async loginWithPin(): Promise<void> {
    let credJson: LocalCredentials = await this.storage.getCredentials();
    console.log(credJson, "creddddd")
    if (this.pin === credJson?.pin) {
      this.storage.showToast({
        message: this.storage.translate.instant("PIN_LOGIN_SUCCESS_MSG"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })

      this.odoo.baseUrl = credJson.url;
      this.odoo.username = credJson.login;
      this.odoo.password = credJson.password;
      //console.log(credJson, "cred json")
      await this.storage.showLoading();
      // if (this.storage.isNetworkAvailable) {
      //   console.log("Entering online condition")
      //   let loginflow: number = await this.odoo.login();

      //   console.log(loginflow, "loginnn")
      //   // Navigate to main page here
      //   if (loginflow > 0) {
      //     this.storage.isAuthenticated = true;
      //     await this.storage.hideLoading();
      //     if (this.gotopage) {
      //       this.storage.exitPage = "/home"
      //       this.router.navigateByUrl(this.gotopage);
      //       this.loginmodal?.dismiss();
      //     }
      //   }
      //   else if (loginflow === 0) {
      //     this.loginmodal?.dismiss();
      //   }

      // }
      // else if (!this.storage.isNetworkAvailable) {
      // console.log("Entering offline condition")
      await this.storage.hideLoading();
      // let credentialsJSON: LocalCredentials = await this.storage.getCredentials();
      // if (credentialsJSON) {
      if (!this.denied) {
        this.odoo.uid = credJson.uid;// bug line
      }

      // }
      if (this.gotopage) {
        this.storage.exitPage = "/home"
        this.router.navigateByUrl(this.gotopage);
        this.modalCtrl?.dismiss();
      }
      // }

    } else {
      this.storage.showToast({
        message: this.storage.translate.instant("INVALID_PIN"),
        duration: 2000,
        color: 'medium',
        position: "top"
      })
    }
  }

  contactUs() {
 this.router.navigateByUrl("/contact")
}

  // clearStoredPin(): void {
  //   localStorage.removeItem('userPin');
  //   this.isPinSet = false;
  //   this.storage.showToast({
  //     message: 'PIN cleared. You can now login with username and password.',
  //     duration: 2000,
  //     color: 'medium',
  //     position: "top"
  //   })
  // }
}
