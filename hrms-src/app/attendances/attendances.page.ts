import { Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// import { addIcons } from 'ionicons';
import { IonHeader, IonLabel, IonToolbar, IonTitle, IonIcon, IonContent, IonButton, IonItem, IonList, ModalController, IonFooter, IonButtons, IonDatetime, IonModal } from '@ionic/angular/standalone';
// import { alertCircleOutline, filterOutline, cameraOutline, personCircleOutline, list, syncOutline, settingsOutline, people, chevronForwardOutline, searchOutline, calendarOutline, chevronBackOutline, checkmarkCircleOutline, closeOutline } from "ionicons/icons"
import { AttendancePopupComponent } from '../attendance-popup/attendance-popup.component';
import { AttendanceService, convertToIST, LocalAttendance, StorageService } from '../services/storage.service';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
@Component({
  selector: 'app-attendances',
  templateUrl: './attendances.page.html',
  styleUrls: ['./attendances.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonIcon, IonContent, IonModal, IonButton, IonLabel, IonItem, IonList, IonFooter, IonButtons, RouterModule, IonDatetime,TranslateModule]
})
export class AttendancesPage implements OnInit,OnDestroy {

  private isDestroyed = false;
  attendances: LocalAttendance[] = [];
  filteredAttendances: LocalAttendance[] = [];
  showFilter = false;
  employeeSearch: string = '';
  fromDate: string = '';
  toDate: string = '';
  @ViewChild('calendarModal', { static: false }) calendarModal!: IonModal;

  selectedDate: Date = new Date();
  isCalendarOpen: boolean = false;

  loading: boolean = false;
  current_lang="en-US";
  showDatetime=true;

  constructor(
    private attservice: AttendanceService,
    private modal: ModalController,
    private storage: StorageService,
    public router: Router) {
    // addIcons({ alertCircleOutline, filterOutline, cameraOutline, personCircleOutline, list, syncOutline, settingsOutline, people, chevronForwardOutline, searchOutline, calendarOutline, chevronBackOutline, checkmarkCircleOutline, closeOutline })
  }

  switchFilter(): void {
    this.showFilter = !this.showFilter
  }
  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.attendances = [];
    this.filteredAttendances = [];
  }

  goPrevious(): void {
    const d: Date = new Date(this.selectedDate);
    d.setDate(d.getDate() - 1);
    this.selectedDate = d;
    let dateString: string = this.formatDate(this.selectedDate);
    this.fetchAttendanceData(dateString);
  }

  goNext(): void {
    const d: Date = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.selectedDate = d;
    let dateString: string = this.formatDate(this.selectedDate);
    this.fetchAttendanceData(dateString);
  }

  showCalendar(): void {
    this.isCalendarOpen = true;
    //console.log(this.selectedDate, 'coming')
  }

  closeCalendar(fetch = true): void {
    if (fetch) {
      let dateString: string = this.formatDate(this.selectedDate);
      this.fetchAttendanceData(dateString);
      this.isCalendarOpen = false;
    }
    else {
      this.calendarModal.dismiss();
    }


  }

  onDatePicked(event: any): void {
    this.selectedDate = new Date(event.detail.value);


  }
  formatDate(date: Date): string {
    const yyyy: number = date.getFullYear();
    const mm: string = String(date.getMonth() + 1).padStart(2, '0'); // months start at 0
    const dd: string = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

  deleteAttendances(): void {
    this.attservice.deleteOlderAttendance();
  }

  async syncAttendance(): Promise<void> {
    if (this.isDestroyed) return;
    
    await this.storage.showLoading();
    try {
      await this.attservice.syncToOdoo();
      
      if (this.isDestroyed) return;

      const dateString = this.formatDate(this.selectedDate);
      const domain = [
        ["check_in", "ilike", `${dateString}%`],
        ["employee_id.company_id", "=", this.storage.selected_company?.id]
      ];

      if (this.storage.isNetworkAvailable) {
        const res = await this.attservice.fetchAttendanceFromOdoo(domain);
        
        if (this.isDestroyed) return;
console.log(res,"resssb")
        if (res && res.length > 0) {
          // await this.fetchAttendanceData(dateString);
          const local_attendances = await this.attservice.retrieveAttendance(dateString);
          console.log(local_attendances,"localll")
        this.processAttendanceList(local_attendances);
        } else {
          this.filteredAttendances = [];
        }
      }
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      await this.storage.hideLoading();
    }
  }


  // async syncAttendance(): Promise<void> {
  //   if (this.isDestroyed) return;
  //   await this.storage.showLoading();
  //   this.attservice.syncToOdoo().then(async () => {
  //     let dateString: string = this.formatDate(this.selectedDate);
  //     // //console.log(dateString,"selected datee")
      
  //     let domain: any[][] = [["check_in", "ilike", `${dateString}%`],["employee_id.company_id","=",this.storage.selected_company?.id]]

  //     //console.log(domain, "domaaa")
  //     if (this.storage.isNetworkAvailable) {
  //       this.attservice.fetchAttendanceFromOdoo(domain).then(async (res) => {
  //         console.log(res, "ressst")
  //         if (res.length > 0) {
  //           await this.fetchAttendanceData(dateString);
  //           await this.storage.showLoading();
  //         }
  //         else if (res.length === 0) {
  //           this.filteredAttendances = []
  //           this.storage.hideLoading();
  //         }

  //         //  throw Error()
  //         // if (res === undefined) {
  //         //   await this.fetchAttendanceData(dateString)
  //         // }
  //         // else{
  //         //   this.filteredAttendances=[]
  //         // }

  //         await this.storage.hideLoading();
  //       })
  //     }
  //     else {
  //       // this.filteredAttendances = []
  //       this.storage.hideLoading();
  //     }
  //   })

  // }

  ionViewWillEnter(){
 let dateString: string = this.formatDate(this.selectedDate);
    this.fetchAttendanceData(dateString);
    let lang=this.storage.translate.getCurrentLang();
    this.showDatetime=false;
    if(lang==="en"){
      this.current_lang="en-US";
      
    }
    else{
      this.current_lang=`${lang}-IN`
    }
    setTimeout(()=>{this.showDatetime=true});
    console.log(this.current_lang,"currennnt")
  }

  ngOnInit(): void {
   
  }
  async showAttendanceDetails(att: any): Promise<void> {
    // //console.log(att, "attttttt");
    let modal: HTMLIonModalElement = await this.modal.create({
      component: AttendancePopupComponent,
      backdropDismiss: true,
      componentProps: { attendance: att }
    });
    modal.present();
  }

 async fetchAttendanceData(dateVal: string): Promise<void> {
  if (this.isDestroyed) return;
  this.loading = true;
  
  try {
    await this.storage.showLoading();
    const local_attendances = await this.attservice.retrieveAttendance(dateVal);

    if (this.isDestroyed) return;

    if (local_attendances.length === 0) {
      if (this.storage.isNetworkAvailable) {
        // Sync koopidungal, aana loading control-ai sync-idam oppadaithu vidungal
        await this.syncAttendance();
      } else {
        this.filteredAttendances = [];
        await this.storage.hideLoading();
      }
      return;
    }

    this.processAttendanceList(local_attendances);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    this.loading = false;
    await this.storage.hideLoading();
  }
}

private processAttendanceList(data: any[]) {
  this.filteredAttendances = data.map((rec: LocalAttendance) => {
    const checkInUTC = rec.check_in ? new Date(rec.check_in) : null;
    const checkOutUTC = rec.check_out !== null ? new Date(rec.check_out) : null;

    return {
      ...rec,
      display_check_in: convertToIST(checkInUTC, 'display'),
      display_check_out: checkOutUTC !== null ? convertToIST(checkOutUTC, 'display') : "N/A",
      check_in: convertToIST(checkInUTC, 'system'),
      check_out: convertToIST(checkOutUTC, "system"),
      display_worked_hours: this.convertHoursToHHMM(rec.worked_hours)
    };
  });
  this.attendances = [...this.filteredAttendances];
}

  // Extracted helper to avoid recreation in loop
  private convertHoursToHHMM(hours: number): string {
    if (!hours) return '00:00';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // async fetchAttendanceData(dateVal: string): Promise<void> {
  //   this.loading = true;
  //   try {
  //     await this.storage.showLoading();
  //     let local_attendances: LocalAttendance[] = await this.attservice.retrieveAttendance(dateVal);

  //     const result: LocalAttendance[] = local_attendances;
  //     //console.log(result, "ressss")
  //     console.log(local_attendances, "local attendances")
  //     this.filteredAttendances = [];
  //     if (result.length === 0) {
  //       return await this.syncAttendance();
  //       // return;
  //     }
  //     // const result = await this.odooService.getAttendance(last_id);
  //     // //console.log(result, "result...")
  //     await this.storage.hideLoading();
  //     // let newAttendances:any[] = []

  //     result.map((rec: LocalAttendance) => {
  //       const checkInUTC: Date | null = rec.check_in ? new Date(rec.check_in) : null;
  //       const checkOutUTC: Date | null = rec.check_out !== null ? new Date(rec.check_out) : null;
  //       //console.log(checkOutUTC, "checkooo")
  //       // Convert UTC to IST

  //       const convertHoursToHHMM: (hours: number) => string = (hours: number) => {
  //         if (!hours) return '00:00';
  //         const h: number = Math.floor(hours);
  //         const m: number = Math.round((hours - h) * 60);
  //         return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  //       };

  //       this.filteredAttendances.push({
  //         id: rec.id,
  //         employee_name: rec.employee_name,
  //         display_check_in: convertToIST(checkInUTC, 'display'),
  //         display_check_out: checkOutUTC !== null ? convertToIST(checkOutUTC, 'display') : "N/A",
  //         check_in: convertToIST(checkInUTC, 'system'),
  //         check_out: convertToIST(checkOutUTC, "system"),
  //         //  check_in: rec.check_in,
  //         // check_out: rec.check_out,
  //         display_worked_hours: convertHoursToHHMM(rec.worked_hours),
  //         worked_hours: rec.worked_hours,
  //         recognized_face_checkin: rec.recognized_face_checkin,
  //         recognized_face_checkout: rec.recognized_face_checkout,
  //         employee_id: rec.employee_id,
  //         odoo_id: rec.odoo_id,
  //         created_at: rec.created_at,
  //         create_date: rec.create_date,
  //         write_date: rec.write_date,
  //         synced: rec.synced,
  //         attendance_client_id:rec.attendance_client_id
        
  //       });
  //     });

  //     // this.filteredAttendances = newAttendances;
  //     console.log(this.filteredAttendances, "attt")
  //   } catch (err) {
  //     console.error('Error fetching attendance:', err);
  //   } finally {
  //     this.loading = false;
  //   }
  // }

  goTo(page: string): void {
    // this.storage.exitPage="/home";
    // this.storage.isAuthenticated=false;
    if (page === "/home") {
      this.storage.exitPage = "/home"
    }
    this.router.navigateByUrl(page)
  }
  ionViewWillLeave(): void {
    // this.storage.isAuthenticated = false;
  }

  // async fetchMoreAttendances() {
  //   if (this.attendances.length > 0) {
  //     let last_id: number = this.attendances[this.attendances.length - 1].id;
  //     const result = await this.fetchAttendanceData(last_id);
  //   }

  // }





  // filterData(): void {
  //   this.filteredAttendances = this.attendances.filter(att => {
  //     // 1️⃣ Filter by employee name
  //     const matchesName: boolean = this.employeeSearch
  //       ? att.employee_name.toLowerCase().includes(this.employeeSearch.toLowerCase())
  //       : true;

  //     // 2️⃣ Filter by date range
  //     let withinDateRange: boolean = true;

  //     if (att.check_in) {
  //       // Get only the date part YYYY-MM-DD for comparison
  //       const checkInDate: string = att.check_in.slice(0, 10);

  //       if (this.fromDate) {
  //         withinDateRange = withinDateRange && checkInDate >= this.fromDate;
  //       }

  //       if (this.toDate) {
  //         withinDateRange = withinDateRange && checkInDate <= this.toDate;
  //       }
  //     }

  //     return matchesName && withinDateRange;
  //   });
  // }

  filterData(): void {
    const search = this.employeeSearch.toLowerCase();
    
    // Performance: Filter directly from the master list
    this.filteredAttendances = this.attendances.filter(att => {
      const matchesName = !search || att.employee_name.toLowerCase().includes(search);
      
      let withinDateRange = true;
      if (att.check_in) {
        const checkInDate = att.check_in.slice(0, 10);
        if (this.fromDate) withinDateRange = withinDateRange && checkInDate >= this.fromDate;
        if (this.toDate) withinDateRange = withinDateRange && checkInDate <= this.toDate;
      }

      return matchesName && withinDateRange;
    });
  }



  clearFilters(): void {
    this.employeeSearch = '';
    this.fromDate = '';
    this.toDate = '';
    this.filteredAttendances = [...this.attendances];
  }


}
