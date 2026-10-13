import { Component } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { GetResult, Preferences } from '@capacitor/preferences';
import { AttendanceService, LocalCredentials, StorageService } from '../services/storage.service';
import {  IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonLabel, IonItem,IonFooter,IonIcon } from "@ionic/angular/standalone"
import { Router } from '@angular/router';
// import {chevronForwardCircle} from  "ionicons/icons";
// import { addIcons } from 'ionicons';
import { TranslateModule } from '@ngx-translate/core';


@Component({
  selector: 'app-company',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonLabel, IonItem, IonFooter, IonIcon, TranslateModule],
  templateUrl: './company.page.html',
  styleUrls: ['./company.page.scss'],
})
export class CompanyPage {
  constructor(
    private odoo: OdooJsonRpcService,
    private storage:StorageService,
    private router:Router,
    private attservice:AttendanceService
  ) {
    // addIcons({chevronForwardCircle})
   }
  companies: { "id": number, "name": string }[] = [];

  selectedCompanyId: number | undefined;
  company: { "id": number, "name": string }|undefined = undefined;

  ionViewWillEnter() {
    this.companies = this.odoo.allowed_companies;
    console.log(this.odoo.allowed_companies,'allowed companies')
    this.selectedCompanyId=this.storage.selected_company?.id
    this.company=this.storage.selected_company
  }

  async setCompanyAndProceed() {
    if(this.company){
       let credentials: GetResult = await Preferences.get({ "key": "credentials" })

    if (credentials.value) {
      let credJson: LocalCredentials = JSON.parse(credentials.value);
      credJson.companies = this.companies;
      credJson.selected_company = this.company;
      this.storage.selected_company=this.company;
      this.attservice.startSyncing();
      console.log(credJson,"credddd")
      if(this.storage.is_pin_setup){
        this.router.navigateByUrl("/employee-list");
        this.storage.exitPage="/employee-list";
        this.storage.is_pin_setup=false
      }
      else{
        this.storage.exitPage="/home"
        this.router.navigateByUrl('/home');
      }
      
      Preferences.set({ "key": "credentials", "value": JSON.stringify(credJson) });
      // credJson.selected_company=event.detail
    }
    }
   

  }

  async selectCompany(company: { id: number, name: string }) {
    this.selectedCompanyId = company.id;
    console.log('Selected company ID:', company.id);
    this.company=company;
  }
}
