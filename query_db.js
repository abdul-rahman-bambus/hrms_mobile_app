const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/home/bambus08/android_projects/HRMS-App/android/app/src/main/assets/public/assets/data/employees.db', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error("No default DB, trying capacitor data directory:", err.message);
    }
});
// Since this is a capacitor app running on android emulator, the DB is actually on the android device!
// We cannot easily query the SQLite DB from the host machine using node sqlite3 because it's stored inside the emulator's /data/data/com.hrms.app/databases/
