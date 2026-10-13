import { Component, Input, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  IonContent,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonButton,
  IonButtons,
  IonHeader,
  ModalController
} from "@ionic/angular/standalone";
import { NativeGeocoder, Address } from '@capgo/capacitor-nativegeocoder';
import { addIcons } from 'ionicons';
import { closeOutline, locationOutline, logInOutline, logOutOutline, timeOutline } from "ionicons/icons";

@Component({
  selector: 'app-attendance-popup',
  standalone: true,
  imports: [CommonModule, DatePipe, IonToolbar, IonTitle, IonContent, IonIcon, IonButton, IonButtons, IonHeader],
  templateUrl: './attendance-popup.component.html',
  styleUrls: ['./attendance-popup.component.scss'],
  providers: [ModalController]
})
export class AttendancePopupComponent {
  attendanceData = signal<any>(undefined);

  @Input() set attendance(value: any) {
    this.attendanceData.set(value);
    if (value) {
      void this.loadApproximateAddresses();
    } else {
      this.checkInAddress.set('Coordinates unavailable');
      this.checkOutAddress.set('Coordinates unavailable');
    }
  }

  workedHours = signal<string>('-');
  checkInAddress = signal<string>('Coordinates unavailable');
  checkOutAddress = signal<string>('Coordinates unavailable');
  isCheckInAddressLoading = signal<boolean>(false);
  isCheckOutAddressLoading = signal<boolean>(false);

  constructor(private modalCtrl: ModalController) {
    addIcons({ closeOutline, locationOutline, logInOutline, logOutOutline, timeOutline });
  }

  getFaceImageSrc(imageData: unknown): string | null {
    const normalizedImage = this.normalizeImageData(imageData);
    if (!normalizedImage) {
      return null;
    }

    if (normalizedImage.startsWith('data:image/')) {
      return normalizedImage;
    }

    if (normalizedImage.startsWith('PD94bW')) {
      return `data:image/svg+xml;base64,${normalizedImage}`;
    }

    if (normalizedImage.startsWith('iVBORw')) {
      return `data:image/png;base64,${normalizedImage}`;
    }

    if (normalizedImage.startsWith('R0lGOD')) {
      return `data:image/gif;base64,${normalizedImage}`;
    }

    if (normalizedImage.startsWith('UklGR')) {
      return `data:image/webp;base64,${normalizedImage}`;
    }

    return `data:image/jpeg;base64,${normalizedImage}`;
  }

  private async loadApproximateAddresses(): Promise<void> {
    const currentAtt = this.attendanceData();
    const inLatitude = this.toCoordinate(currentAtt?.in_latitude);
    const inLongitude = this.toCoordinate(currentAtt?.in_longitude);
    const outLatitude = this.toCoordinate(currentAtt?.out_latitude);
    const outLongitude = this.toCoordinate(currentAtt?.out_longitude);
    const storedCheckInAddress = this.normalizeAddress(currentAtt?.checkin_address);
    const storedCheckOutAddress = this.normalizeAddress(currentAtt?.checkout_address);

    this.checkInAddress.set(this.formatCoordinateFallback(inLatitude, inLongitude));
    this.checkOutAddress.set(this.formatCoordinateFallback(outLatitude, outLongitude));

    if (storedCheckInAddress) {
      this.checkInAddress.set(storedCheckInAddress);
    }

    if (storedCheckOutAddress) {
      this.checkOutAddress.set(storedCheckOutAddress);
    }

    if (inLatitude !== null && inLongitude !== null) {
      if (!storedCheckInAddress) {
        this.isCheckInAddressLoading.set(true);
        this.checkInAddress.set(await this.reverseGeocode(inLatitude, inLongitude));
        this.isCheckInAddressLoading.set(false);
      }
    }

    if (outLatitude !== null && outLongitude !== null) {
      if (!storedCheckOutAddress) {
        this.isCheckOutAddressLoading.set(true);
        this.checkOutAddress.set(await this.reverseGeocode(outLatitude, outLongitude));
        this.isCheckOutAddressLoading.set(false);
      }
    }
  }

  private toCoordinate(value: unknown): number | null {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private formatCoordinateFallback(latitude: number | null, longitude: number | null): string {
    if (latitude === null || longitude === null) {
      return 'Coordinates unavailable';
    }

    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  private async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const response = await NativeGeocoder.reverseGeocode({
        latitude,
        longitude,
        useLocale: true,
        maxResults: 1
      });

      const address = response.addresses?.[0];
      if (address) {
        return this.formatNativeAddress(address);
      }
    } catch (error) {
      console.warn('Reverse geocoding failed', error);
    }

    return this.formatCoordinateFallback(latitude, longitude);
  }

  private formatNativeAddress(address: Address): string {
    const parts = [
      this.joinSegments(address.subThoroughfare, address.thoroughfare),
      address.subLocality,
      address.locality || address.subAdministrativeArea,
      address.administrativeArea,
      address.countryName
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return this.formatCoordinateFallback(address.latitude, address.longitude);
  }

  private joinSegments(...parts: Array<string | undefined>): string {
    return parts.filter(part => typeof part === 'string' && part.trim().length > 0).join(' ').trim();
  }

  private normalizeAddress(address: unknown): string | null {
    if (typeof address !== 'string') {
      return null;
    }

    const normalizedAddress = address.trim();
    return normalizedAddress.length > 0 ? normalizedAddress : null;
  }

  private normalizeImageData(imageData: unknown): string | null {
    if (typeof imageData !== 'string') {
      return null;
    }

    const normalizedImage = imageData.trim();
    if (!normalizedImage) {
      return null;
    }

    const invalidImageMarkers = ['0', 'false', 'undefined', 'null'];
    return invalidImageMarkers.includes(normalizedImage.toLowerCase()) ? null : normalizedImage;
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
