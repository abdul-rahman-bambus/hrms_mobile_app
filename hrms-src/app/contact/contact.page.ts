import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
// IMPORT ONLY INDIVIDUAL COMPONENTS
import { 
  IonContent, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonButtons, 
  IonBackButton, 
  IonFooter,
  NavController 
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';


@Component({
  selector: 'app-contact',
  templateUrl: './contact.page.html',
  styleUrls: ['./contact.page.scss'],
  imports: [CommonModule, 
    ReactiveFormsModule, 
    TranslateModule,
    // ADD INDIVIDUAL COMPONENTS HERE
    IonContent, 
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonButtons, 
    IonFooter,
    IonBackButton]
})
export class ContactPage implements OnInit {

 contactForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private navCtrl: NavController
  ) {}

  ngOnInit(): void {
     this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10,12}$')]],
      companyName: ['', [Validators.required,Validators.minLength(2)]],
      employees: ['', [Validators.required, Validators.min(1)]],
      address: ['', [Validators.required, Validators.minLength(10)]],
      message:["",[Validators.required, Validators.minLength(5)]]
    });
  }

  ionViewWillEnter() {
   
  }

 submitForm() {
  if (this.contactForm.valid) {
    const formData = this.contactForm.value;

    // Constructing the email body string
    const emailBody = `
      New Registration Inquiry:
      -------------------------
      Name: ${formData.name}

      Email: ${formData.email}

      Mobile: ${formData.mobile}

      Company Name: ${formData.companyName}

      Number of Employees: ${formData.employees}

      Address: ${formData.address}
      
      Message:
      ${formData.message}
    `;

    const subject = `Registration Inquiry from ${formData.companyName}`;
    const destinationEmail = 'info@bambustechnologies.in'; // Change this to your target mail

    // Option A: Using standard window.open (Works on Web & Mobile)
    const mailtoUrl = `mailto:${destinationEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoUrl, '_system');

    console.log('Opening Email App with data:', formData);
  } else {
    this.contactForm.markAllAsTouched();
  }
}

  goBack() {
    this.navCtrl.back();
  }

}
