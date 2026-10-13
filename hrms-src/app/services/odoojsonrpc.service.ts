import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { CapacitorHttp, HttpResponse } from "@capacitor/core";
import { ToastController } from "@ionic/angular/standalone"

// Define the structure for a standard Odoo JSON-RPC request
interface OdooRequest {
    jsonrpc: string;
    method: string;
    params: any;
    id: number; // A unique ID is recommended
}

@Injectable({
    providedIn: 'root',
})
export class OdooJsonRpcService {
    // Configuration
    baseUrl: string = "";
    db: string = "";
    username: string = "";
    password: string = "";
    endpoint: string = "/jsonrpc";
    allowed_companies:{"id":number,"name":string}[]=[]
    auth_endpoint: string = "/web/session/authenticate"
    attendance_endpoint: string = '/face_attendance'
    db_endpoint: string = "/web/database/list"
    is_internal_user = true;
    is_admin_user = false;

    // State
    uid: number  | undefined; // Store the authenticated user ID

    constructor(public router: Router, private toast: ToastController) {
        // Set a default high timeout for Odoo requests, especially for 'create' operations
        // CapacitorHttp.setOptions({
        //     connectTimeout: 5000,
        //     readTimeout: 60000,
        // });
    }

    /**
     * Builds the standard Odoo JSON-RPC request payload.
     */
    private buildRequest(method: string, params: Object): OdooRequest {
        // Odoo requires "2.0" as a string for jsonrpc version
        return {
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: new Date().getTime() // Use a timestamp for a unique ID
        };
    }

    async getDb(): Promise<string> {
        ////console.log(this.baseUrl, "urllllll")
        let dbval: string = this.baseUrl.replace(/^https?:\/\//, "");
        let db: string = dbval.split(".")[0]
        // const payload = this.buildRequest("call", {

        // });

        // const result = await this.sendRequest(payload, "db");
        // ////console.log(result,"db result")
        return db

    }

    /**
     * Handles the HTTP request and checks for Odoo errors.
     */
    private async sendRequest(payload: Object, authLink: string | boolean = false): Promise<any> {
        let url: string = `${this.baseUrl}${this.endpoint}`;
        if (authLink === "login") {
            url = `${this.baseUrl}${this.auth_endpoint}`;
        }
        else if (authLink === "attendance") {
            url = `${this.baseUrl}${this.attendance_endpoint}`;
        }
        else if (authLink === "db") {
            url = `${this.baseUrl}${this.db_endpoint}`;
        }


        // Convert payload to the correct interface for better type safety
        let odooPayload: { jsonrpc: string; method: string; params: any; id: number; }|undefined = payload as { jsonrpc: string, method: string, params: any, id: number };

        try {
            // CORRECTED: Await the promise directly. If it fails (network/timeout), 
            // the execution jumps straight to the outer catch block.
            const response: HttpResponse = await CapacitorHttp.post({
                url: url,
                data: JSON.stringify(odooPayload), // Use the correct stringified data
                headers: {
                    'Content-Type': "application/json",
                    "Accept": "application/json"
                },
                connectTimeout: 5000
            }).catch(async (error) => {
                // let toast = await this.toast.create({
                //     "message": "Server down. Retrying",
                //     "color": 'danger',
                //     "duration": 1500,
                //     'position': "top"
                // })
                //     ; toast.present()
                return error
            });
            odooPayload=undefined
            ////console.log(response, "resppp")



            // Check if HTTP status is OK (200)
            if (response.status === undefined) {
                // Include response data in the error for detailed debugging
                const errorData: string = response.data ? JSON.stringify(response.data) : '';
                // setTimeout(() => {
                //     this.sendRequest(payload, authLink)
                // }, 5000)

                // throw new Error(`Odoo HTTP Error: Status ${response.status}. Data: ${errorData}`);

            }

            const jsonResponse: any = response.data;
            //console.log(jsonResponse, "resp")
            // Check for Odoo JSON-RPC error field
            if (jsonResponse.error) {
                // console.error("Odoo RPC Error:", jsonResponse.error);
                // Ensure error handling is robust
                const errorMessage: any = jsonResponse.error.data?.message || jsonResponse.error.message || 'Unknown RPC Error';
                // throw new Error(`Odoo RPC Error: ${errorMessage}`);
                let toast: HTMLIonToastElement = await this.toast.create({
                    "message": errorMessage,
                    "position": "top",
                    "color": 'danger',
                    "duration": 3000
                })
                toast.present()
            }

            // Return the result field
            return jsonResponse.result;

        } catch (err) {
            // This catch block handles network errors, timeouts, and errors thrown above.
            // console.error("Capacitor HTTP/Network/Processing Error:", err);
            throw err; // Re-throw the error for the calling method to handle.
        }
    }

    /**
     * Logs the user in and stores the User ID (uid).
     * @returns The User ID (uid).
     */
    async login(): Promise<number> {
         this.allowed_companies=[];
        let db: string = await this.getDb();
        this.db = db
        // this.db = "odoo_18_community_test"
        ////console.log(this.db, "dbbb")
        const payload: OdooRequest = this.buildRequest("call", {
            "db": this.db,
            "login": this.username,
            "password": this.password
        });

        const result: any = await this.sendRequest(payload, "login");
        //console.log(result, "login res")
        if (result) {
            console.log(result,"ressss")
            // The Odoo login result is the user ID (uid)
            this.uid = result.uid as number;
            this.is_internal_user = result?.is_internal_user !== false;
            this.is_admin_user = result?.is_admin_user === true || result?.is_admin === true;
            const companies=result.user_companies.allowed_companies
           
           if (companies) {
                this.allowed_companies = Object.values(companies).map((c: any) => ({
                    id: c.id,
                    name: c.name
                }));
            }

            // ////console.log(`Login Successful. User ID: ${this.uid}`);
            return this.uid;
        }
        else {


            return 0


        }

        // throw new Error("Login failed: No user ID returned.");
    }

    async syncOfflineData(new_attendances: any[], old_attendances: any[], employees: any[]): Promise<{ new_attendance_ids: number[]; deleted_attendance_ids: number[]; }> {
        let newRecordId: { new_attendance_ids: number[]; deleted_attendance_ids: number[]; } = { new_attendance_ids: [], deleted_attendance_ids: [] }
        if (new_attendances.length > 0 || old_attendances.length > 0 || employees.length>0) {
            const payload: OdooRequest = this.buildRequest("call", {
                "create_attendance": new_attendances,
                'update_attendance': old_attendances,
                "employees": employees
            });
            newRecordId = await this.sendRequest(payload, "attendance");
            console.log(newRecordId, "neww vals")
        }

        return newRecordId

    }

    /**
     * Creates a new hr.attendance record. Requires a successful login first.
     * @param attendanceData Object containing the attendance data (e.g., { employee_id: 1, check_in: '...' })
     * @returns The ID of the newly created attendance record.
     */
    async syncAttendance(employee_id: number, recognized_face: string): Promise<any> {
        // ////console.log(recognized_face,"recog")
        if (!this.uid) {
            throw new Error("Attendance sync failed: User not logged in (UID is null). Call login() first.");
        }

        const payload: OdooRequest = this.buildRequest("call", {
            "employee_id": employee_id,
            'recognized_face': recognized_face
        });
        ////console.log(payload, "payyy")

        const newRecordId: any = await this.sendRequest(payload, "attendance");

        // ////console.log(`Attendance synced successfully. New Record ID:`,newRecordId);
        return newRecordId;
    }

    async pingOdooServer(baseUrl: string): Promise<boolean> {
        const endpoint: string = `${baseUrl.replace(/\/$/, '')}/web/webclient/version_info`;
        ////console.log(endpoint, "endpoi")
        try {
            //   const controller = new AbortController();
            //   const timeout = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

            const response: HttpResponse = await CapacitorHttp.post(
                {
                    url: endpoint,
                    headers: {
                        'Content-Type': "application/json",
                        "Accept": "application/json"
                    },
                    data: "{}"
                })
            ////console.log(response, "respp")
            //   clearTimeout(timeout);

            // Odoo version_info returns JSON with version details
            return response.status === 200;
        } catch (err) {
            console.warn('Ping failed for', baseUrl, err);
            return false;
        }
    }

    async getEmployees(domain:any[]=[]): Promise<any> {
        /*{ id: 1, name: 'Richaud Béringer', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/richaud.jpg' } */
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid, // Use the dynamically obtained UID
                this.password, // Odoo often requires password for execute_kw
                "hr.employee", // Model name
                "search_read", // Method
                [], // Arguments for 'create'
                { "domain": domain, "fields": ["id", "display_name", "image_1024", "job_id", "active", "is_enrolled","write_date","last_photo_update_time","company_id"] } // Optional keyword arguments
            ]
        });

        // ////console.log(payload,"pay");

        const employees: any = await this.sendRequest(payload);
        //  ////console.log(employees,"emppay")
        return employees


    }

    async getAttendance(domainInp: any[] = []): Promise<any> {
        function getThreeDaysAgoDate() {
            const today: Date = new Date();
            // Subtract 3 days
            today.setDate(today.getDate() - 3);
            // Format as YYYY-MM-DD HH:MM:SS (or just YYYY-MM-DD for simple date filtering)
            // Odoo API usually handles ISO format (2025-11-11T00:00:00Z) well
            return today.toISOString().split('T')[0] + ' 00:00:00';
        }
        ////console.log(domainInp, "domod")
        const threeDaysAgo: string = getThreeDaysAgoDate();
        ////console.log(threeDaysAgo, '3 days ago date');
        //   let domain=d
        //   if(domainInp.length===0){
        //   domain = [
        //         ['check_in', '>=', threeDaysAgo]
        //     ];
        //   }


        /*{ id: 1, name: 'Richaud Béringer', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/richaud.jpg' } */
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid, // Use the dynamically obtained UID
                this.password, // Odoo often requires password for execute_kw
                "hr.attendance", // Model name
                "search_read", // Method
                [], // Arguments for 'create'
                { "domain": domainInp, "fields": ["id", "employee_id", "check_in", "check_out", "worked_hours", "recognized_face_checkin", "recognized_face_checkout","attendance_client_id"] } // Optional keyword arguments
            ]
        });

        console.log(payload,"pay");

        const employees: any = await this.sendRequest(payload);
        //  ////console.log(employees,"emppay")
        return employees


    }

    async updateEmployee(employee_id: number, photo: string): Promise<any> {

        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid, // Use the dynamically obtained UID
                this.password, // Odoo often requires password for execute_kw
                "hr.employee", // Model name
                "write", // Method
                [[employee_id], {
                    "image_128": photo,
                    "image_256": photo,
                    "image_512": photo,
                    "image_1024": photo,
                    "image_1920": photo,
                    "is_enrolled": true

                }], // Arguments for 'create'
                {} // Optional keyword arguments
            ]
        });
        const updated: any = await this.sendRequest(payload);
        //  ////console.log(updated,"emppay")
        return updated

    }

    // Unused lifecycle hooks are removed in a modern injectable service
    // If you need initialization logic, use the constructor or a separate init method.
}