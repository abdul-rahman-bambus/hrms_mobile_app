import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet,IonSpinner,IonContent } from '@ionic/angular/standalone';
import { OdooJsonRpcService, } from './services/odoojsonrpc.service';
import { StorageService } from './services/storage.service';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet,IonSpinner,CommonModule,IonContent],
})
export class AppComponent implements OnInit {
  loading=false
  constructor(public storage:StorageService,public odoo:OdooJsonRpcService) {}
 async  ngOnInit(){

this.loading=true
  await this.storage.loadModels().then(()=>{
 this.odoo.login().then(()=>{
  this.loading=false
      this.odoo.router.navigate(["/home"]);
    });
  })
    
  }
}
