import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { CapacitorHttp, HttpResponse } from "@capacitor/core";

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
    baseUrl = "http://192.168.1.61:1050";
    db = "bambus_live";
    username = "admin";
    password = "admin";
    endpoint = "/jsonrpc";
    auth_endpoint="/web/session/authenticate"
    attendance_endpoint='/face_attendance'

    // State
    private uid: number; // Store the authenticated user ID

    constructor(public router:Router) {
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

    /**
     * Handles the HTTP request and checks for Odoo errors.
     */
    private async sendRequest(payload: Object,authLink:string|boolean=false): Promise<any> {
        let url = `${this.baseUrl}${this.endpoint}`;
        if(authLink==="login"){
            url = `${this.baseUrl}${this.auth_endpoint}`;
        }
        else if(authLink==="attendance"){
            url = `${this.baseUrl}${this.attendance_endpoint}`;
        }
   
    
    // Convert payload to the correct interface for better type safety
    const odooPayload = payload as { jsonrpc: string, method: string, params: any, id: number };

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
        });
        
        

        // Check if HTTP status is OK (200)
        if (response.status !== 200) {
            // Include response data in the error for detailed debugging
            const errorData = response.data ? JSON.stringify(response.data) : '';
            throw new Error(`Odoo HTTP Error: Status ${response.status}. Data: ${errorData}`);
        }

        const jsonResponse = response.data;

        // Check for Odoo JSON-RPC error field
        if (jsonResponse.error) {
            console.error("Odoo RPC Error:", jsonResponse.error);
            // Ensure error handling is robust
            const errorMessage = jsonResponse.error.data?.message || jsonResponse.error.message || 'Unknown RPC Error';
            throw new Error(`Odoo RPC Error: ${errorMessage}`);
        }

        // Return the result field
        return jsonResponse.result;

    } catch (err) {
        // This catch block handles network errors, timeouts, and errors thrown above.
        console.error("Capacitor HTTP/Network/Processing Error:", err);
        throw err; // Re-throw the error for the calling method to handle.
    }
}

    /**
     * Logs the user in and stores the User ID (uid).
     * @returns The User ID (uid).
     */
    async login(): Promise<number> {
        const payload = this.buildRequest("call", {
            "db":this.db,
            "login":this.username,
            "password":this.password
        });

        const result = await this.sendRequest(payload,"login");
        console.log(result,"login res")
        if (result) {
            // The Odoo login result is the user ID (uid)
            this.uid = result.uid as number; 
            console.log(`Login Successful. User ID: ${this.uid}`);
            return this.uid;
        }
        
        throw new Error("Login failed: No user ID returned.");
    }

    /**
     * Creates a new hr.attendance record. Requires a successful login first.
     * @param attendanceData Object containing the attendance data (e.g., { employee_id: 1, check_in: '...' })
     * @returns The ID of the newly created attendance record.
     */
    async syncAttendance(employee_id:number){
        if (!this.uid) {
            throw new Error("Attendance sync failed: User not logged in (UID is null). Call login() first.");
        }

        const payload = this.buildRequest("call", {
           "employee_id":employee_id
        });

        const newRecordId = await this.sendRequest(payload,"attendance");
        
        console.log(`Attendance synced successfully. New Record ID:`,newRecordId);
        return newRecordId;
    }

    async getEmployees(){
/*{ id: 1, name: 'Richaud Béringer', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/richaud.jpg' } */
         const payload = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid, // Use the dynamically obtained UID
                this.password, // Odoo often requires password for execute_kw
                "hr.employee", // Model name
                "search_read", // Method
                [], // Arguments for 'create'
                {"domain":[],"fields": ["id","display_name","image_128","job_id","user_id","active"]} // Optional keyword arguments
            ]
        });

        console.log(payload,"pay");
        
         const employees = await this.sendRequest(payload);
         console.log(employees,"emppay")
         return employees


    }

    async getAttendance(){
        /*{ id: 1, name: 'Richaud Béringer', role: 'General Practitioner', status: 'Active', type: 'Full-time', imageUrl: 'assets/images/richaud.jpg' } */
                 const payload = this.buildRequest("call", {
                    service: "object",
                    method: "execute_kw",
                    args: [
                        this.db,
                        this.uid, // Use the dynamically obtained UID
                        this.password, // Odoo often requires password for execute_kw
                        "hr.attendance", // Model name
                        "search_read", // Method
                        [], // Arguments for 'create'
                        {"domain":[],"fields": ["id","employee_id","check_in","check_out","worked_hours"]} // Optional keyword arguments
                    ]
                });
        
                console.log(payload,"pay");
                
                 const employees = await this.sendRequest(payload);
                 console.log(employees,"emppay")
                 return employees
        
        
            }

    async updateEmployee(employee_id:number,photo:string){
         const payload = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid, // Use the dynamically obtained UID
                this.password, // Odoo often requires password for execute_kw
                "hr.employee", // Model name
                "write", // Method
                [[employee_id],{
                    "image_128":photo,
                    "image_256":photo,
                    "image_512":photo,
                    "image_1024":photo,
                    "image_1920":photo,
                    
                }], // Arguments for 'create'
                { } // Optional keyword arguments
            ]
        });
          const updated = await this.sendRequest(payload);
         console.log(updated,"emppay")
         return updated

    }

    // Unused lifecycle hooks are removed in a modern injectable service
    // If you need initialization logic, use the constructor or a separate init method.
}