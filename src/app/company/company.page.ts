import { inject, signal, Component } from '@angular/core';
import { App } from '@capacitor/app';
import { FormsModule } from '@angular/forms';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { GetResult, Preferences } from '@capacitor/preferences';
import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonLabel, IonItem, IonFooter, IonIcon } from "@ionic/angular/standalone"
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-company',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonLabel, IonItem, IonFooter, IonIcon, TranslateModule],
  templateUrl: './company.page.html',
  styleUrls: ['./company.page.scss'],
})
export class CompanyPage {
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);

  constructor(
    private odoo: OdooJsonRpcService,
    private storage: StorageService,
    private router: Router,
    private attservice: AttendanceService
  ) {}

  companies = signal<{ "id": number, "name": string }[]>([]);
  selectedCompanyId = signal<number | undefined>(undefined);
  company = signal<{ "id": number, "name": string } | undefined>(undefined);

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

    this.companies.set(this.odoo.allowed_companies);
    console.log(this.odoo.allowed_companies, 'allowed companies');
    this.selectedCompanyId.set(this.storage.selected_company?.id);
    this.company.set(this.storage.selected_company);

    if (this.companies().length === 1 && !this.company()) {
      this.company.set(this.companies()[0]);
      this.selectedCompanyId.set(this.companies()[0].id);
      await this.setCompanyAndProceed();
    }
  }

  async setCompanyAndProceed() {
    if (!this.company() && this.companies().length === 1) {
      this.company.set(this.companies()[0]);
    }

    const currentCompany = this.company();
    if (currentCompany) {
      let credentials: GetResult = await Preferences.get({ "key": "credentials" });

      if (credentials.value) {
        let credJson: LocalCredentials = JSON.parse(credentials.value);
        credJson.companies = this.companies();
        credJson.selected_company = currentCompany;
        this.storage.selected_company = currentCompany;
        await Preferences.set({ "key": "credentials", "value": JSON.stringify(credJson) });
        this.attservice.startSyncing();
        
        await this.storage.showLoading();
        try {
          await this.storage.syncUsers();
          const today = new Date().toISOString().split('T')[0];
          await this.attservice.fetchAttendanceFromOdoo([
            ['check_in', 'ilike', `${today}%`],
            ['employee_id.company_id', '=', currentCompany.id]
          ]);
        } catch (error) {
          console.error('Bootstrap sync failed', error);
        } finally {
          await this.storage.hideLoading();
        }

        console.log(credJson, "credddd");
        const returnUrl = this.storage.previousPage || '/home';
        this.storage.previousPage = undefined;
        this.storage.exitPage = '/home';
        this.router.navigateByUrl(returnUrl);
        this.storage.is_pin_setup = false;
      }
    }
  }

  async selectCompany(company: { id: number, name: string }) {
    this.selectedCompanyId.set(company.id);
    console.log('Selected company ID:', company.id);
    this.company.set(company);
  }

  ionViewDidLeave() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
  }
}
