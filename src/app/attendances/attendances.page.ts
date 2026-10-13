import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OdooJsonRpcService } from '../services/odoojsonrpc.service';
import {IonicModule} from "@ionic/angular";
import { addIcons } from 'ionicons';
import {alertCircleOutline} from "ionicons/icons"
@Component({
  selector: 'app-attendances',
  templateUrl: './attendances.page.html',
  styleUrls: ['./attendances.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AttendancesPage implements OnInit {

  attendances: any[] = [];
  filteredAttendances: any[] = [];

  employeeSearch: string = '';
  fromDate: string = '';
  toDate: string = '';

  loading = false;

  constructor(private odooService: OdooJsonRpcService) {
    addIcons({alertCircleOutline})
  }

  ngOnInit() {
    this.fetchAttendanceData();
  }

  async fetchAttendanceData() {
    this.loading = true;
    try {
      const result = await this.odooService.getAttendance();
  
      this.attendances = result.map((rec: any) => {
        const checkInUTC = rec.check_in ? new Date(rec.check_in) : null;
        const checkOutUTC = rec.check_out ? new Date(rec.check_out) : null;
  
        // Convert UTC to IST
        const convertToIST = (date: Date | null) => {
          if (!date) return null;
          // IST = UTC + 5:30
          const istOffset = 5.5 * 60; // minutes
          const localDate = new Date(date.getTime() + istOffset * 60 * 1000);
  
          const yyyy = localDate.getFullYear();
          const mm = String(localDate.getMonth() + 1).padStart(2, '0');
          const dd = String(localDate.getDate()).padStart(2, '0');
          const hh = String(localDate.getHours()).padStart(2, '0');
          const min = String(localDate.getMinutes()).padStart(2, '0');
          const ss = String(localDate.getSeconds()).padStart(2, '0');
  
          return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
        };
        const convertHoursToHHMM = (hours: number) => {
          if (!hours) return '00:00';
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };
  
        return {
          employee_name: rec.employee_id?.[1] || '',
          check_in: convertToIST(checkInUTC),
          check_out: convertToIST(checkOutUTC),
          worked_hours: convertHoursToHHMM(rec.worked_hours)
        };
      });
  
      this.filteredAttendances = [...this.attendances];
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      this.loading = false;
    }
  }
  
  
  
  

  filterData() {
    this.filteredAttendances = this.attendances.filter(att => {
      // 1️⃣ Filter by employee name
      const matchesName = this.employeeSearch
        ? att.employee_name.toLowerCase().includes(this.employeeSearch.toLowerCase())
        : true;
  
      // 2️⃣ Filter by date range
      let withinDateRange = true;
  
      if (att.check_in) {
        // Get only the date part YYYY-MM-DD for comparison
        const checkInDate = att.check_in.slice(0, 10);
  
        if (this.fromDate) {
          withinDateRange = withinDateRange && checkInDate >= this.fromDate;
        }
  
        if (this.toDate) {
          withinDateRange = withinDateRange && checkInDate <= this.toDate;
        }
      }
  
      return matchesName && withinDateRange;
    });
  }
  
  

  clearFilters() {
    this.employeeSearch = '';
    this.fromDate = '';
    this.toDate = '';
    this.filteredAttendances = [...this.attendances];
  }


}
