import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { ModalController } from '@ionic/angular/standalone';
import { LoginPage } from '../login/login.page';

@Injectable({
  providedIn: 'root'
})
export class PinGuard implements CanActivate {
  constructor(
    private storage: StorageService,
    private router: Router,
    private modalCtrl: ModalController
  ) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    const creds = await this.storage.getCredentials();
    const isPinEnabled = creds?.pin && creds.pin.length === 4;

    if (!isPinEnabled || this.storage.isPinAuthenticated) {
      return true;
    }

    // Need to show PIN modal
    const loginModal = await this.modalCtrl.create({
      component: LoginPage,
      componentProps: { "gotopage": state.url }
    });
    const sourceUrl = this.router.url;

    loginModal.onDidDismiss().then(() => {
      const returnedToHome = sourceUrl === '/home' && this.router.url === '/home';
      if (returnedToHome && !this.storage.isPinAuthenticated) {
        this.storage.isNavigatingFromMenu = false;
        this.storage.menuState$.next(false);
      }
    });
    
    await loginModal.present();
    
    // We return false here to prevent the route from activating immediately.
    // The modal will handle the navigation to the target route after successful PIN entry.
    return false;
  }
}
