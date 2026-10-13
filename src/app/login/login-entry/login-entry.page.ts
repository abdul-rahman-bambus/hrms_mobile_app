import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from '../../services/storage.service';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { IonContent, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { helpCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login-entry',
  templateUrl: './login-entry.page.html',
  styleUrls: ['../login.page.scss', './login-entry.page.scss'],
  standalone: true,
  imports: [CommonModule, TranslateModule, IonContent, IonSpinner, IonIcon]
})
export class LoginEntryPage implements OnInit {
  isChecking = signal<boolean>(true);

  constructor(
    private router: Router,
    private storage: StorageService
  ) {
    addIcons({ helpCircleOutline });
  }

  async ngOnInit() {
    await this.resolveRoute();
  }

  private async resolveRoute() {
    this.isChecking.set(true);
    try {
      const credentialsJSON = await this.storage.getCredentials();
      const targetRoute = this.storage.resolveInitialLoginRoute(credentialsJSON);
      this.router.navigateByUrl(targetRoute, { replaceUrl: true });
    } catch (e) {
      this.router.navigateByUrl('/login/otp', { replaceUrl: true });
    } finally {
      this.isChecking.set(false);
    }
  }

  goToHelp() {
    this.router.navigate(['/user-manual']);
  }
}
