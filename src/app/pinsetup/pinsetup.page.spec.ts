import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PinsetupPage } from './pinsetup.page';

describe('PinsetupPage', () => {
  let component: PinsetupPage;
  let fixture: ComponentFixture<PinsetupPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PinsetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
