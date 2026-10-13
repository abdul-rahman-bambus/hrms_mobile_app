import { Injectable, OnInit } from "@angular/core";
import { SQLiteObject, SQLite } from '@awesome-cordova-plugins/sqlite';
import * as faceapi from '@vladmandic/face-api';

// Define the structure for a standard Odoo JSON-RPC request
export interface UserStructure {
  user_id: number,
  employee_id: number,
  record_id: number,
  image_data: string
}
interface OdooEmployeeData {
  id: number;
  display_name: string;
  image_128: string; // Base64 string from Odoo
  user_id: number;
  active: boolean
}
export interface FaceDataStructure {

  "label": number;
  "descriptor": number[][];
  "user_id": number;
  "employee_id": number;

}

@Injectable({
  providedIn: 'root',

})
export class StorageService {
  constructor() {
    this.initializeDatabase();
    // this.loadModels()
  }
  originalImg = new Image();
  private db!: SQLiteObject;
  imageObj = new Image();
  selectedEmployee: any = undefined;

  async loadModels() {
    try {
      // this.debugMessage = 'Loading models...';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/assets/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/assets/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models'),
      ]);
      
      // this.debugMessage = 'Models loaded. Loading enrollments...';
    } catch (error) {
      // this.debugMessage = 'Error loading models.';
      console.error('Error loading models:', error);
    }
  }

  async initializeDatabase(): Promise<void> {
    try {
      // 2. Open the database and assign the result to this.db
      this.db = await SQLite.create({ name: "UserData", location: "default" })
      console.log(this.db, "dbbb")
      console.log('Database opened successfully. Now creating table...');

      await this.createTables();

    } catch (e) {
      console.error('Error opening or creating database:', e);
      throw e;
    }
  }

  private async createTables(): Promise<void> {
    const createUserTableSQL = `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            record_id INTEGER NOT NULL,
            image_data TEXT NOT NULL,
            created_at DATETIME
          );
        `;

    const createAttendanceTableSQL = `
        CREATE TABLE IF NOT EXISTS attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          odoo_attendance_id INTEGER,
          employee_id INTEGER NOT NULL,
          image VARCHAR(MAX),
          user_id INTEGER NOT NULL,
          checkin TEXT NOT NULL,
          checkout TEXT,
          created_at DATETIME
        );
      `;
    try {
      await this.db.executeSql(createUserTableSQL, []);
      // await this.db.executeSql(createAttendanceTableSQL, []);
      console.log("Table 'users' created successfully.");
    } catch (e) {
      console.error('Error creating table:', e);
      throw e;
    }
  }


  async storeBase64Picture(
    userData: UserStructure
  ): Promise<any> {

    // 1. Clean the Base64 string (remove the "data:mime/type;base64," prefix)
    // This reduces the storage size slightly, as the prefix is redundant.
    const parts = userData.image_data.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : userData.image_data;

    try {
      // 2. Define the SQL query
      const query = `
          INSERT INTO users (employee_id, user_id, record_id,image_data, created_at) 
          VALUES (?, ?, ?, ?, DATETIME('now'))
        `;

      // 3. Define the parameters
      const params = [userData.employee_id, userData.user_id, userData.record_id, cleanBase64];

      // 4. Execute the SQL command
      const result = await this.db.executeSql(query, params);

      console.log(`Base64 image stored successfully. Row ID: ${result.insertId}`);
      return result;

    } catch (error) {
      console.error('Error storing Base64 picture:', error);
      throw error;
    }
  }

  async getAndDisplayPicture(): Promise<[]> {
    try {
      const query = 'SELECT * FROM users';
      console.log(this.db, "dbdbdb");

      const result = await this.db.executeSql(query);
      console.log(result, "ressss")
      if (result.rows.length > 0) {
        const cleanBase64Data = result.rows.item;

        // Assuming the image is a JPEG (common for camera/gallery).
        // You might need to store the MIME type in a separate column if you handle multiple formats (PNG, GIF, etc.).
        // const imageSource = 'data:image/jpeg;base64,' + cleanBase64Data;

        // In your Ionic component (e.g., in TypeScript):
        // this.displayImageSrc = imageSource;

        return cleanBase64Data;
      }
      return [];
    } catch (error) {
      return [];
    }
  }


  async rotateBase64Image(img:any,base64Image: string, angleInp: number): Promise<string> {
    // const img = new Image();
    // You pass raw base64 — add prefix here
    img.src = `data:image/jpeg;base64,${base64Image}`;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load base image for rotation'));
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return base64Image;

    const angle = angleInp * Math.PI / 180;

    // swap width/height for right-angle rotations
    if (Math.abs(angleInp) % 180 === 90) {
      canvas.width = img.height;
      canvas.height = img.width;
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    // center and rotate
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-angle);
    ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);

    // return *raw* base64 (no data: prefix)
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  }

   async resizeBase64Image(base64String: string, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64String}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Maintain aspect ratio
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(img, 0, 0, width, height);
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8); // 0.8 = quality
      resolve(resizedBase64.replace(/^data:image\/jpeg;base64,/, ''));
    };
    img.onerror = reject;
  });
}



  async generateLabeledDescriptors(
    employees: OdooEmployeeData[]
  ): Promise<FaceDataStructure[]> {
    console.log(`Starting descriptor generation for ${employees.length} employees...`);

    const labeledDescriptors: FaceDataStructure[] = [];
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });

    // Angles to generate rotated variants for each employee
    const rotationAngles = [90, 180, 270];

    for (const employee of employees) {
      const label = employee.id;
      const base64String = employee.image_128;

      if (!base64String) {
        console.warn(`Skipping employee ${label}: Missing image data.`);
        continue;
      }

      try {
        const descriptorsForEmployee: Float32Array[] = [];

        // Generate the descriptor for the original image
        // const originalImg = new Image();
        // let resizeBase64Image=await this.resizeBase64Image(base64String,320)
        this.originalImg.src = `data:image/jpeg;base64,${base64String}`;
        await new Promise((resolve, reject) => {
          this.originalImg.onload = resolve;
          this.originalImg.onerror = () => reject(new Error(`Failed to load base image for ${label}`));
        });

        let originalDetection = await faceapi
          .detectSingleFace(this.originalImg, detectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (originalDetection?.descriptor?.length === 128) {
          // const displaySize = { width: 320, height: 240 }
          // originalDetection= faceapi.resizeResults(originalDetection, displaySize)
          descriptorsForEmployee.push(originalDetection.descriptor);
        }
        console.log(descriptorsForEmployee, "original vals")
        // Generate descriptors for each rotated version
        // for (const angle of rotationAngles) {
        //   try {
        //     console.log("pushing", angle)
        //     const rotatedBase64 = await this.rotateBase64Image(base64String, angle);
        //     const rotatedImg = new Image();
        //     rotatedImg.src = `data:image/jpeg;base64,${rotatedBase64}`;


        //     await new Promise((resolve, reject) => {
        //       rotatedImg.onload = resolve;
        //       rotatedImg.onerror = () => reject(new Error(`Failed to load rotated image for ${label} at ${angle}°`));
        //     });


        //     const rotatedDetection = await faceapi
        //       .detectSingleFace(rotatedImg, detectionOptions)
        //       .withFaceLandmarks()
        //       .withFaceDescriptor();

        //     if (rotatedDetection?.descriptor?.length === 128) {
        //       descriptorsForEmployee.push(rotatedDetection.descriptor);
        //       console.log(`Descriptor added for ${label} at rotation ${angle}°`);
        //     } else {
        //       console.warn(`No face detected for ${label} at ${angle}°`);
        //     }
        //   } catch (rotateErr) {
        //     console.warn(`Rotation ${angle}° failed for ${label}:`, rotateErr);
        //   }
        // }

        if (descriptorsForEmployee.length > 0) {
          // Combine all descriptors for this label
          labeledDescriptors.push({
            label: employee.id,
            descriptor: descriptorsForEmployee.map(d => Array.from(d)), // store as array of numbers
            user_id: employee.user_id ? employee.user_id[0] : false,
            employee_id: employee.id,
          });
          console.log(`✅ Generated ${descriptorsForEmployee.length} descriptors for ${label}`);
        } else {
          console.warn(`⚠️ No valid descriptors found for ${label}.`);
        }
      } catch (error) {
        console.error(`Error processing employee ${label}:`, error);
      }
    }

    console.log(`🎯 Finished generation. Total usable descriptors: ${labeledDescriptors.length}`);
    console.log(labeledDescriptors, "label data")
    return labeledDescriptors;
  }


  // async generateLabeledDescriptors(
  //   employees: OdooEmployeeData[]
  // ): Promise<FaceDataStructure[]> {
  //   console.log(employees, 'eemm')

  //   const labeledDescriptors: FaceDataStructure[] = [];
  //   // // Lower confidence for faster processing of small, cropped images (like image_128)
  //   const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
  //   const rotationAngles = [-45, -90, -135, -180, -225, -270, -315, -360];
  //   console.log(`Starting descriptor generation for ${employees.length} employees...`);

  //   for (const employee of employees) {
  //     const label = employee.id;
  //     const base64String = employee.image_128;

  //     if (!base64String) {
  //       console.warn(`Skipping employee ${label}: Missing image data.`);
  //       continue;
  //     }

  //     try {
  //       // 1. CRITICAL FIX: Create a NEW Image object for this specific employee.
  //       const img = new Image();

  //       // Odoo's image_128 is a raw Base64 string; we prepend the MIME type.
  //       img.src = `data:image/jpeg;base64,${base64String}`;

  //       // 2. Wait for the image to load (This await is safe because 'img' is unique)
  //       await new Promise((resolve, reject) => {
  //         img.onload = resolve;
  //         img.onerror = () => reject(new Error(`Failed to load image for ${label}`));
  //       });



  //       // 3. Detect Face and Extract Descriptor
  //       const detection = await faceapi.detectSingleFace(img, detectionOptions)
  //         .withFaceLandmarks()
  //         .withFaceDescriptor();

  //       if (detection && detection.descriptor) {
  //         if (detection.descriptor.length !== 128) {
  //           console.error(`Descriptor length mismatch for ${label}: Expected 128, got ${detection.descriptor.length}. Skipping.`);
  //           continue; // Skip saving corrupted descriptor
  //         }
  //         // 4. Create LabeledFaceDescriptor
  //         // const descriptor = new faceapi.LabeledFaceDescriptors(label, [detection.descriptor]);
  //         const descriptor: FaceDataStructure = {
  //           "label": employee.id,
  //           "descriptor": Array.from(detection.descriptor),
  //           "user_id": employee.user_id ? employee.user_id[0] : false,
  //           "employee_id": employee.id
  //         }
  //         labeledDescriptors.push(descriptor);
  //         console.log(`Successfully generated descriptor for: ${label}`);
  //       } else {
  //         console.warn(`Could not detect a clear face for enrollment: ${label}. Skipping.`);
  //       }

  //     } catch (error) {
  //       console.error(`Error processing employee ${label}:`, error);
  //     }
  //   }

  //   console.log(`Finished generation. Total usable descriptors:`, labeledDescriptors);
  //   return labeledDescriptors;
  // }

  async saveAttendance(attendance_data: any, employee_data: any) {
    try {
      const employeeId = employee_data ? employee_data.id : null;
      const odooAttendanceId = attendance_data.id;
      const userId = employee_data.user_id ? employee_data.user_id[0] : null;
      const checkIn = attendance_data.check_in || null;
      const checkOut = attendance_data.check_out && attendance_data.check_out !== false ? attendance_data.check_out : null;
      const image = employee_data.image_128 ? employee_data.image_128 : "";

      if (!employeeId || !odooAttendanceId || !userId) {
        console.warn('⚠️ Missing required data fields, skipping insert.');
        return false;
      }

      // Check if this Odoo attendance ID already exists in local DB
      const selectQuery = `
      SELECT * FROM attendance
      WHERE odoo_attendance_id = ?
      LIMIT 1
    `;


      const rs = await this.db.executeSql(selectQuery, [odooAttendanceId]);
      const existing = rs.rows.length > 0 ? rs.rows.item(0) : null;

      if (existing) {
        // Update if already exists
        const updateQuery = `
        UPDATE attendance
        SET employee_id = ?, user_id = ?, check_in = ?, check_out = ?
        WHERE odoo_attendance_id = ?
      `;
        await this.db.executeSql(updateQuery, [employeeId, userId, checkIn, checkOut, odooAttendanceId]);
        console.log(`✅ Updated local record for Odoo attendance ${odooAttendanceId}`);
      } else {
        // Insert new record
        /*
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          odoo_attendance_id INTEGER,
          employee_id INTEGER NOT NULL,
          image VARCHAR(MAX),
          user_id INTEGER NOT NULL,
          checkin TEXT NOT NULL,
          checkout TEXT,
          created_at DATETIME
         */
        const insertQuery = `
        INSERT INTO attendance (odoo_attendance_id, employee_id, user_id, check_in, check_out,image,created_at)
        VALUES (?, ?, ?, ?, ?,?,DATETIME('now'))
      `;
        await this.db.executeSql(insertQuery, [odooAttendanceId, employeeId, userId, checkIn, checkOut]);
        console.log(`✅ Inserted new record for Odoo attendance ${odooAttendanceId}`);
      }

      return true;
    } catch (error) {
      console.error('❌ Error saving Odoo attendance:', error);
      return false;
    }

  }


}