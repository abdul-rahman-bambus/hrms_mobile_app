import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttendancesPage } from './attendances.page';

describe('AttendancesPage', () => {
  let component: AttendancesPage;
  let fixture: ComponentFixture<AttendancesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AttendancesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
