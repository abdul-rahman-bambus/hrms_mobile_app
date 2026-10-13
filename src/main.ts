import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';

import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { AppComponent } from './app/app.component';
import { addIcons } from 'ionicons';
import { add, alertCircleOutline, arrowBackOutline, bagOutline, briefcaseOutline, businessOutline, calendarNumber, calendarOutline, cameraOutline, checkmarkCircle, checkmarkCircleOutline, checkmarkCircleSharp, chevronBackOutline, chevronForwardCircle, chevronForwardCircleOutline, chevronForwardOutline, closeCircle, closeCircleSharp, closeOutline, cloudOfflineOutline, cloudOutline, cloudUploadOutline, createOutline, documentText, ellipsisVertical, filterOutline, globeOutline, helpCircle, home, homeOutline, keyOutline, languageOutline, list, lockClosedOutline, logInOutline, logOutOutline, notificationsOutline, people, peopleOutline, person, personCircleOutline, personOutline, receiptOutline, searchCircleOutline, searchOutline, settingsOutline, syncOutline, timeOutline, wifiOutline, flashOutline } from "ionicons/icons";


bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(), { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({
      // Keep focus scrolling, but avoid extra bottom padding on MIUI/Redmi WebView.
      scrollPadding: false,
    }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),

    // provides TranslateService
    provideTranslateService(),
    // ✅ THIS IS REQUIRED
    provideTranslateHttpLoader({
      prefix: '/assets/i18n/',
      suffix: '.json',
    }),
  ],
});


addIcons({ languageOutline, arrowBackOutline, createOutline, keyOutline, logOutOutline, globeOutline, lockClosedOutline, logInOutline, businessOutline, personCircleOutline, syncOutline, cloudOfflineOutline, checkmarkCircle, closeCircle, peopleOutline, receiptOutline, wifiOutline, cloudOutline, person, cloudUploadOutline, personOutline, bagOutline, checkmarkCircleSharp, closeCircleSharp, cameraOutline, briefcaseOutline, chevronForwardCircleOutline, searchOutline, notificationsOutline, add, home, people, calendarNumber, documentText, helpCircle, searchCircleOutline, homeOutline, ellipsisVertical, settingsOutline, list, chevronForwardCircle, alertCircleOutline, filterOutline, chevronForwardOutline, calendarOutline, chevronBackOutline, checkmarkCircleOutline, closeOutline, timeOutline, flashOutline });
