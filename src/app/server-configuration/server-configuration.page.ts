import { inject, signal, computed, Component } from '@angular/core';
import { App } from '@capacitor/app';
import { FormsModule } from '@angular/forms';
import { Preferences } from '@capacitor/preferences';
import { addIcons } from 'ionicons';
import { arrowBackOutline, closeOutline, serverOutline, personOutline, lockClosedOutline, businessOutline, calendarOutline, settingsOutline } from 'ionicons/icons';
import { TranslateModule } from '@ngx-translate/core';
import { IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonIcon, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel, IonInput } from '@ionic/angular/standalone';

import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';

@Component({
  selector: 'app-server-configuration',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonIcon,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput
  ],
  templateUrl: './server-configuration.page.html',
  styleUrls: ['./server-configuration.page.scss']
})
export class ServerConfigurationPage {
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  selectedPlan = signal<string>('');
  configUrl = signal<string>('');
  configUsername = signal<string>('');
  configPassword = signal<string>('');
  configDatabase = signal<string>('');
  configCompanyName = signal<string>('');
  syncDelay = signal<string>('');
  selectedCompanyName = signal<string>('');

  constructor(
    private storage: StorageService,
    private odoo: OdooJsonRpcService
  ) {
    addIcons({ arrowBackOutline, closeOutline, serverOutline, personOutline, lockClosedOutline, businessOutline, calendarOutline, settingsOutline });
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

    const credentials: LocalCredentials = await this.storage.getCredentials();
    const [
      configPlan,
      configCompanyName,
      configBusinessName
    ] = await Promise.all([
      Preferences.get({ key: 'config_plan' }),
      Preferences.get({ key: 'config_company_name' }),
      Preferences.get({ key: 'config_business_name' })
    ]);

    this.selectedPlan.set(String(configPlan.value || '').trim());
    this.configUrl.set(String(credentials.url || '').trim());
    this.configUsername.set(String(credentials.login || '').trim());
    this.configPassword.set(String(credentials.password || ''));
    this.configDatabase.set(String(credentials.db || '').trim());
    this.configCompanyName.set(String(configCompanyName.value || '').trim());
    this.syncDelay.set(String(credentials.sync_delay || '').trim());
    this.selectedCompanyName.set(String(credentials.selected_company?.name || configBusinessName.value || '').trim());

    this.odoo.baseUrl = this.configUrl();
    if (this.configDatabase()) {
      this.odoo.db = this.configDatabase();
    }
  }

  maskedPassword = computed(() => {
    const pass = this.configPassword();
    if (!pass) return 'Not saved';
    return '•'.repeat(Math.max(8, pass.length));
  });

  planDisplayLabel = computed(() => {
    const rawPlan = String(this.selectedPlan() || '').trim();
    if (!rawPlan) return 'Not configured';
    if (rawPlan.toLowerCase() === 'hr18') return 'HRMS 18';
    return rawPlan.replace(/[_-]+/g, ' ').toUpperCase();
  });

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
