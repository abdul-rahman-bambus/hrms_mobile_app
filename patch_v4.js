const fs = require('fs');
const path = require('path');

const pages = [
  'home/home.page.ts',
  'attendances/attendances.page.ts',
  'company/company.page.ts',
  'contact/contact.page.ts',
  'employee-list/employee-list.page.ts',
  'enroll/enroll.page.ts',
  'plan-details/plan-details.page.ts',
  'profile/profile.page.ts',
  'server-configuration/server-configuration.page.ts',
  'settings/settings.page.ts',
  'user-manual/user-manual.page.ts'
];

const basePath = '/home/bambus08/android_projects/HRMS-App/src/app/';

for (const p of pages) {
  const fullPath = path.join(basePath, p);
  if (!fs.existsSync(fullPath)) {
    console.log("Not found:", p);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  // 1. Imports
  if (!content.includes("@capacitor/app")) {
    content = "import { App } from '@capacitor/app';\n" + content;
  }
  if (!content.includes("@angular/core'") || !content.includes("inject")) {
    content = "import { inject } from '@angular/core';\n" + content;
  }

  // Handle StorageService / AttendanceService imports gracefully
  if (!content.includes("AttendanceService")) {
    const importMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/services\/storage\.service['"]/);
    if (importMatch) {
      if (!importMatch[1].includes("AttendanceService")) {
        content = content.replace(importMatch[0], `import { AttendanceService, ${importMatch[1].trim()} } from '../services/storage.service';`);
      }
    } else {
      content = "import { AttendanceService, StorageService } from '../services/storage.service';\n" + content;
    }
  }

  // 2. Class properties
  const classRegex = /export class [A-Za-z0-9_]+( implements [^{]+)?\s*\{/;
  const match = content.match(classRegex);
  if (!match) {
    console.log("Could not find class definition in", p);
    continue;
  }
  
  const injects = `
  appStateSub?: any;
  private _injectedAttService = inject(AttendanceService);
  private _injectedStorage = inject(StorageService);
`;
  if (!content.includes('appStateSub?: any;')) {
    content = content.replace(classRegex, match[0] + injects);
  }

  // 3. Listener logic
  let listenerCode = `
    if (this.appStateSub) {
      this.appStateSub.remove();
    }
    this.appStateSub = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive && this._injectedStorage.isNetworkAvailable) {
        console.log('App backgrounded, syncing data...');
        await this._injectedAttService.syncToOdoo();
      }
`;
  if (p.includes('attendances.page.ts')) {
    listenerCode += `
      if (isActive && !this.isDestroyed) {
        console.log('App resumed, refreshing attendances...');
        if (!this.loading) {
          await this.fetchAttendanceData(this.formatDate(this.selectedDate));
        }
      }
`;
  }
  listenerCode += `    });\n`;

  // ionViewWillEnter
  const enterRegex = /(async )?ionViewWillEnter\(\)(:\s*Promise<void>)?\s*\{/;
  const enterMatch = content.match(enterRegex);
  if (enterMatch) {
    if (!content.includes("App.addListener('appStateChange'")) {
      content = content.replace(enterRegex, 'async ionViewWillEnter() {\n' + listenerCode);
    }
  } else {
    // Add before the last closing brace
    const lastBraceIndex = content.lastIndexOf('}');
    const newEnter = `\n  async ionViewWillEnter() {\n${listenerCode}  }\n`;
    content = content.slice(0, lastBraceIndex) + newEnter + content.slice(lastBraceIndex);
  }

  // ionViewDidLeave
  let leaveCode = `
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = undefined;
    }
`;
  const leaveRegex = /ionViewDidLeave\(\)(:\s*Promise<void>)?\s*\{/;
  const leaveMatch = content.match(leaveRegex);
  if (leaveMatch) {
    if (!content.includes("this.appStateSub.remove();")) {
      content = content.replace(leaveRegex, 'ionViewDidLeave() {\n' + leaveCode);
    }
  } else {
    // Add before the last closing brace
    const lastBraceIndex = content.lastIndexOf('}');
    const newLeave = `\n  ionViewDidLeave() {\n${leaveCode}  }\n`;
    content = content.slice(0, lastBraceIndex) + newLeave + content.slice(lastBraceIndex);
  }

  fs.writeFileSync(fullPath, content);
  console.log("Successfully patched:", p);
}
