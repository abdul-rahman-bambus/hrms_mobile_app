import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import {addIcons} from "ionicons"
import {searchOutline,notificationsOutline,add,home,calendarNumber,location,documentText,helpCircle,searchCircleOutline,homeOutline, ellipsisVertical,} from "ionicons/icons";

import { Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import {  LoadingController } from '@ionic/angular/standalone';

// Define the employee interface


@Component({
  selector: 'app-employee-list',
  templateUrl: './employee-list.page.html',
  styleUrls: ['./employee-list.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule]
})
export class EmployeeListPage implements OnInit {
  employees: any[] = [];
  loading=false;
  employee_sync:any=null;
  // Data State
  // employees: Employee[] = [
  //   { id: 1, name: 'Richaud Béringer', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/richaud.jpg' },
  //   { id: 2, name: 'Jacques Lyon', role: 'Lab technician', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/jacques.jpg' },
  //   { id: 3, name: 'Tristram Bernard', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/tristram.jpg' },
  //   { id: 4, name: 'Elise Dupont', role: 'Nurse Practitioner', status: 'Inactive', type: 'Part-time', imageUrl: 'assets/images/elise.jpg' },
  // ];
  filteredEmployees: any[] = [];

  // UI State
  searchTerm: string = '';
  filterStatus: 'All' | 'Active' | 'Inactive' = 'All';

  constructor(private odoo:OdooJsonRpcService,private router:Router,private storage:StorageService,private loadingCtrl:LoadingController) {
    addIcons({"search-outline":searchOutline,"notifications-outline":notificationsOutline,"add":add,"home":home,"calendar-number":calendarNumber,"location":location,"document-text":documentText,"help-circle":helpCircle,"searchCircleOutline":searchCircleOutline,"home-outline":homeOutline,"ellipsis-vertical":ellipsisVertical})
  
   }

     async syncUsers() {
      this.employee_sync = await this.loadingCtrl.create({
        message: 'Syncing Employees photos ...',
      }).then((loadingEl)=>loadingEl);
      await this.employee_sync.present();
      //  this.debugMessage = 'getting employees'
       let employees = await this.odoo.getEmployees();
       // let employees = [];
      //  this.debugMessage = 'generating samples';
       let descriptors = await this.storage.generateLabeledDescriptors(employees);
        localStorage.setItem("enrollments", JSON.stringify(descriptors))
       console.log(descriptors, "dessssc")
      //  this.debugMessage = ""
       // console.log(users, 'users')
       console.log(employees, 'employees')
      this.employee_sync.dismiss();
     }

  ngOnInit() {
   
  }
  async ionViewWillEnter(){
    this.loading=true;
    this.employees=await this.odoo.getEmployees();
    this.filteredEmployees=this.employees;
    this.loading=false;
    console.log(this.employees,"emppp")
  }

  /**
   * Filter employees based on search term and status.
   */
  filterList() {
    let results = this.employees;
     this.filteredEmployees = [...this.employees];

    // 1. Filter by Status (All, Active, Inactive)
    if (this.filterStatus !== 'All') {
      results = results.filter(emp => emp.status === this.filterStatus);
    }

    // 2. Filter by Search Term
    if (this.searchTerm.trim() !== '') {
      results = results.filter(emp =>
        emp.display_name.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }

    this.filteredEmployees = results;
  }

 openEnrollmentForm(emp:any){
  this.storage.selectedEmployee=emp;
  this.router.navigate(["/enroll"])
 }

  // Handle segment change
  segmentChanged(event: any) {
    this.filterStatus = event.detail.value;
    this.filterList();
  }

  // Handle search input
  onSearchInput(event: any) {
    this.searchTerm = event.detail.value;
    this.filterList();
  }
}