import { Component, OnDestroy, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import { AttendanceService, EmployeeService, LocalEmployees, StorageService } from '../services/storage.service';
// import { addIcons } from 'ionicons';
// import {
//   searchOutline,
//   notificationsOutline,
//   add,
//   home,
//   calendarNumber,
//   location,
//   documentText,
//   helpCircle,
//   searchCircleOutline,
//   homeOutline,
//   ellipsisVertical,
//   syncOutline,
//   cameraOutline,
//   settingsOutline,
//   list,
//   personCircleOutline,
//   people
// } from 'ionicons/icons';

// ✅ Import all Ionic standalone elements you use in your HTML
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,

  IonContent,
  IonButton,
  IonButtons,
  IonLabel,


  IonItem,
  IonList,
  IonSegmentButton,
  IonSegment,
  IonSearchbar,
  IonFooter,
  IonSegmentContent,
  IonSegmentView

} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-employee-list',
  templateUrl: './employee-list.page.html',
  styleUrls: ['./employee-list.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    RouterModule,
    TranslateModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonContent,
    IonButton,
    IonButtons,
    IonLabel,
    IonItem,
    IonList,
    IonSegmentButton,
    IonSegment,
    IonSearchbar,
    IonFooter,
    IonSegmentContent,
  IonSegmentView
  ],
})
export class EmployeeListPage implements OnInit, OnDestroy {
  employees: LocalEmployees[] = [];
  // filteredEmployees: any[] = [];
  filteredEnrolledEmployees: LocalEmployees[] = [];
  filteredNonEnrolledEmployees: LocalEmployees[] = [];
  loading: boolean = false;
  private isComponentActive: boolean = true;

  searchTerm: string = '';
  // filterStatus: 'all' | 'enrolled' | 'not_enrolled' = 'all';
  constructor(
    private odoo: OdooJsonRpcService,
    public router: Router,
    public storage: StorageService,
    public empservice: EmployeeService,
    private route: ActivatedRoute,
    private att: AttendanceService
  ) {
    // addIcons({
    //   searchOutline,
    //   notificationsOutline,
    //   add,
    //   home,
    //   people,
    //   calendarNumber,
    //   location,
    //   documentText,
    //   helpCircle,
    //   searchCircleOutline,
    //   homeOutline,
    //   ellipsisVertical,
    //   syncOutline,
    //   cameraOutline,
    //   settingsOutline,
    //   list,
    //   personCircleOutline
    // });
  }

  // async syncUsers(): Promise<void> {
  //   console.log(this.storage.isNetworkAvailable,this.odoo.uid,'checksss')
  //   if (this.storage.isNetworkAvailable && this.odoo.uid) {
  //     await this.storage.showLoading();
  //     await this.att.syncToOdoo();
  //     await this.storage.syncUsers().then(async () => {
  //       this.ionViewWillEnter()
  //     });
  //     await this.storage.hideLoading();
  //     await this.storage.showToast({
  //       message: this.storage.translate.instant("EMPLOYEE_SYNC_COMPL"),
  //       duration: 3000,
  //       color: 'success',
  //       position: "top"
  //     })
  //   }

  // }

  async syncUsers(): Promise<void> {
    if (this.storage.isNetworkAvailable && this.odoo.uid) {
      try {
        await this.storage.showLoading();
        await this.att.syncToOdoo();
        await this.storage.syncUsers();

        if (this.isComponentActive) {
          this.employees = await this.storage.getAllEmployees();
          this.filterList();

          await this.storage.showToast({
            message: this.storage.translate.instant("EMPLOYEE_SYNC_COMPL"),
            duration: 3000,
            color: 'success',
            position: "top"
          });
        }
      } finally {
        await this.storage.hideLoading();
      }
    }
  }


  async ngOnInit() {

    this.storage.employee_filter_status = "not_enrolled";



  }
  goTo(page: string): void {
    // this.storage.exitPage="/home";
    // this.storage.isAuthenticated=false;
    if (page === "/home") {
      this.storage.exitPage = "/home"
    }
    this.router.navigateByUrl(page)
  }
  ngOnDestroy(): void {
    //console.log('ngondes')
    // this.storage.isAuthenticated = false;
    this.isComponentActive = false;
    // Explicitly nullify lists to free up memory (important if they contain images)
    this.employees = [];
    // this.filteredEmployees = [];
    this.filteredEnrolledEmployees = [];
  this.filteredNonEnrolledEmployees = [];
  }

  getFormattedImage(imgStr: string | boolean|any): string {
    if (!imgStr || imgStr === 'false') {
      return '/assets/person.png';
    }

    // Identify format by magic bytes
    if ((typeof imgStr) === "string" && imgStr.startsWith('PD94bW')) {
      return `data:image/svg+xml;base64,${imgStr}`;
    } else if ((typeof imgStr) === "string" && imgStr.startsWith('iVBORw')) {
      return `data:image/png;base64,${imgStr}`;
    } else if ((typeof imgStr) === "string" && imgStr.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${imgStr}`;
    }

    // Fallback to JPEG if unknown binary data
    return `data:image/jpeg;base64,${imgStr}`;
  }

  async ionViewWillEnter(): Promise<void> {
    this.isComponentActive = true;
    this.loading = true;

    try {
      await this.storage.showLoading();
      this.employees = await this.storage.getAllEmployees();
      console.log(this.employees, "empssd")
      if (this.storage.isNetworkAvailable && this.employees.length === 0) {
        // Handle the promise safely
        await this.storage.syncUsers();

        // Check if the user is still on this page before updating
        if (this.isComponentActive) {
          this.employees = await this.storage.getAllEmployees();

          this.filterList();
        }
      } else {
        this.filterList();
      }
    } catch (error) {
      console.error("Error loading employees", error);
    } finally {
      await this.storage.hideLoading();
      this.loading = false;
    }
  }

  filterList(): void {
    if (!this.employees) return;

    // Use a more memory-efficient filtering approach
    const status = this.storage.employee_filter_status;
    const term = this.searchTerm.trim().toLowerCase();

    const enrolled: LocalEmployees[] = [];
    const nonEnrolled: LocalEmployees[] = [];
    this.employees.forEach((emp) => {
    // 1. Search Filter First (Efficiency: skip status check if name doesn't match)
    const matchesSearch = term === '' || emp.display_name.toLowerCase().includes(term);
    
    if (matchesSearch) {
      // 2. Split by Enrollment Status
      if (emp.is_enrolled === 1) {
        enrolled.push(emp);
      } else {
        nonEnrolled.push(emp);
      }
    }
  });
  this.filteredEnrolledEmployees = enrolled;
  this.filteredNonEnrolledEmployees = nonEnrolled;
    // this.filteredEmployees = this.employees.filter((emp) => {
    //   // 1. Status Filter
    //   let matchesStatus = true;
    //   if (status === 'enrolled') matchesStatus = emp.is_enrolled === 1;
    //   else if (status === 'not_enrolled') matchesStatus = emp.is_enrolled === 0;

    //   if (!matchesStatus) return false;

    //   // 2. Search Filter
    //   if (term !== '') {
    //     return emp.display_name.toLowerCase().includes(term);
    //   }

    //   return true;
    // });
  }
  //   async ionViewWillEnter(): Promise<void> {
  // this.isComponentActive = true;
  //     this.loading = true;

  //     await this.storage.showLoading();
  //     // this.employees=await this.odoo.getEmployees();
  //     this.employees = await this.storage.getAllEmployees();

  //     if (this.storage.isNetworkAvailable) {
  //       if (this.employees.length === 0) {
  //         this.storage.syncUsers().then(async () => {
  //           this.employees = await this.storage.getAllEmployees();
  //           this.filterList();

  //         })
  //       }

  //     }
  //     console.log(this.employees, "empllll")
  //     let dt: Date = new Date("2025-11-27T19:55:11");
  //     let dateStr: string = dt.toISOString().split('T')[0];
  //     await this.storage.hideLoading();
  //     // this.filteredEmployees=this.employees;
  //     this.filterList();
  //     this.loading = false;
  //     //console.log(this.employees, "emppp")

  //   }

  // filterList(): void {
  //   let results: LocalEmployees[] = [...this.employees];
  //   //console.log(this.filterStatus, 'filter')
  //   if (this.storage.employee_filter_status !== 'all') {
  //     if (this.storage.employee_filter_status === 'enrolled') {
  //       results = results.filter((emp) => emp.is_enrolled === 1);
  //     } else if (this.storage.employee_filter_status === 'not_enrolled') {
  //       results = results.filter((emp) => emp.is_enrolled === 0);
  //     }
  //   }

  //   if (this.searchTerm.trim() !== '') {
  //     results = results.filter((emp) =>
  //       emp.display_name.toLowerCase().includes(this.searchTerm.toLowerCase())
  //     );
  //   }
  //   //console.log(results, "resssuuu")

  //   this.filteredEmployees = results;
  // }

  openEnrollmentForm(emp: any): void {
    this.storage.selectedEmployee = emp;
    this.router.navigateByUrl('/enroll');
  }

  segmentChanged(event: any): void {
    this.storage.employee_filter_status = event.detail.value;
    this.filterList();
  }

  onSearchInput(event: any): void {
    this.searchTerm = event.detail.value || '';
    this.filterList();
  }
}
