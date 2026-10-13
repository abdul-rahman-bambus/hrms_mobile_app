import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Capacitor, CapacitorHttp, HttpResponse } from "@capacitor/core";
import { ToastController } from "@ionic/angular/standalone"
import { environment } from "../../environments/environment";

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
    allowed_companies: { "id": number, "name": string }[] = []
    auth_endpoint: string = "/web/session/authenticate"
    attendance_endpoint: string = '/face_attendance'
    db_endpoint: string = "/web/database/list"
    is_internal_user = true;
    is_admin_user = false;
    private readonly httpRequestTimeoutMs = 30000;
    private readonly subscriptionServerBaseUrl = environment.subscriptionServerBaseUrl;
    private readonly mobileApiAppId = environment.mobileApiAppId;
    private readonly mobileApiAppSecret = environment.mobileApiAppSecret;

    // State
    uid: number | undefined; // Store the authenticated user ID

    constructor(public router: Router, private toast: ToastController) {
        // Set a default high timeout for Odoo requests, especially for 'create' operations
        // CapacitorHttp.setOptions({
        //     connectTimeout: 5000,
        //     readTimeout: 60000,
        // });
    }

    private normalizeCompanies(result: any): { id: number; name: string }[] {
        const allowedCompanies = result?.user_companies?.allowed_companies;
        const currentCompany = result?.user_companies?.current_company;
        const fallbackCompany = result?.company_id;

        if (Array.isArray(allowedCompanies)) {
            return allowedCompanies
                .filter((company: any) => company?.id && company?.name)
                .map((company: any) => ({
                    id: company.id,
                    name: company.name
                }));
        }

        if (allowedCompanies && typeof allowedCompanies === 'object') {
            return Object.values(allowedCompanies)
                .filter((company: any) => company?.id && company?.name)
                .map((company: any) => ({
                    id: company.id,
                    name: company.name
                }));
        }

        if (currentCompany?.id && currentCompany?.name) {
            return [{
                id: currentCompany.id,
                name: currentCompany.name
            }];
        }

        if (Array.isArray(fallbackCompany) && fallbackCompany.length >= 2) {
            return [{
                id: Number(fallbackCompany[0]),
                name: String(fallbackCompany[1])
            }];
        }

        return [];
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

    private getBaseUrlHostname(): string {
        const normalizedBaseUrl = String(this.baseUrl || '').trim();
        if (!normalizedBaseUrl) return '';

        try {
            return new URL(normalizedBaseUrl).hostname.trim().toLowerCase();
        } catch {
            const withoutProtocol = normalizedBaseUrl.replace(/^https?:\/\//i, '');
            return withoutProtocol.split(/[/:]/)[0].trim().toLowerCase();
        }
    }

    private isIpBaseUrl(): boolean {
        const hostname = this.getBaseUrlHostname();
        if (!hostname) return false;

        const isIpv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(hostname);
        const normalizedIpv6 = hostname.replace(/^\[|\]$/g, '');
        const isIpv6 = normalizedIpv6.includes(':') && /^[0-9a-f:]+$/i.test(normalizedIpv6);

        return isIpv4 || isIpv6;
    }

    private async getDbFromDatabaseEndpoint(): Promise<string> {
        const payload: OdooRequest = this.buildRequest("call", {});
        const result: any = await this.sendRequest(payload, "db");

        if (Array.isArray(result)) {
            const databaseName = result.find((item: any) => typeof item === 'string' && item.trim());
            if (databaseName) {
                return databaseName.trim();
            }
        }

        if (typeof result === 'string' && result.trim()) {
            return result.trim();
        }

        throw new Error("No database name returned from database list endpoint.");
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
        let odooPayload: { jsonrpc: string; method: string; params: any; id: number; } | undefined = payload as { jsonrpc: string, method: string, params: any, id: number };

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

            odooPayload = undefined
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
                console.error("Odoo RPC Error Detailed:", jsonResponse.error);
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

    private bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    private toUint8(data: string): Uint8Array {
        return new TextEncoder().encode(data);
    }

    private concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
        const out = new Uint8Array(a.length + b.length);
        out.set(a, 0);
        out.set(b, a.length);
        return out;
    }

    private rightRotate(x: number, n: number): number {
        return (x >>> n) | (x << (32 - n));
    }

    private sha256Bytes(message: Uint8Array): Uint8Array {
        const k = new Uint32Array([
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ]);

        let h0 = 0x6a09e667;
        let h1 = 0xbb67ae85;
        let h2 = 0x3c6ef372;
        let h3 = 0xa54ff53a;
        let h4 = 0x510e527f;
        let h5 = 0x9b05688c;
        let h6 = 0x1f83d9ab;
        let h7 = 0x5be0cd19;

        const l = message.length;
        const bitLenHi = Math.floor((l * 8) / 0x100000000);
        const bitLenLo = (l * 8) >>> 0;
        const totalLen = (((l + 9 + 63) >> 6) << 6);
        const padded = new Uint8Array(totalLen);
        padded.set(message);
        padded[l] = 0x80;
        padded[totalLen - 8] = (bitLenHi >>> 24) & 0xff;
        padded[totalLen - 7] = (bitLenHi >>> 16) & 0xff;
        padded[totalLen - 6] = (bitLenHi >>> 8) & 0xff;
        padded[totalLen - 5] = bitLenHi & 0xff;
        padded[totalLen - 4] = (bitLenLo >>> 24) & 0xff;
        padded[totalLen - 3] = (bitLenLo >>> 16) & 0xff;
        padded[totalLen - 2] = (bitLenLo >>> 8) & 0xff;
        padded[totalLen - 1] = bitLenLo & 0xff;

        const w = new Uint32Array(64);
        for (let i = 0; i < totalLen; i += 64) {
            for (let t = 0; t < 16; t += 1) {
                const j = i + t * 4;
                w[t] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) >>> 0;
            }
            for (let t = 16; t < 64; t += 1) {
                const s0 = this.rightRotate(w[t - 15], 7) ^ this.rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                const s1 = this.rightRotate(w[t - 2], 17) ^ this.rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = (((w[t - 16] + s0) >>> 0) + ((w[t - 7] + s1) >>> 0)) >>> 0;
            }

            let a = h0;
            let b = h1;
            let c = h2;
            let d = h3;
            let e = h4;
            let f = h5;
            let g = h6;
            let h = h7;

            for (let t = 0; t < 64; t += 1) {
                const S1 = this.rightRotate(e, 6) ^ this.rightRotate(e, 11) ^ this.rightRotate(e, 25);
                const ch = (e & f) ^ (~e & g);
                const temp1 = ((((h + S1) >>> 0) + ((ch + k[t]) >>> 0)) >>> 0) + w[t];
                const S0 = this.rightRotate(a, 2) ^ this.rightRotate(a, 13) ^ this.rightRotate(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }

            h0 = (h0 + a) >>> 0;
            h1 = (h1 + b) >>> 0;
            h2 = (h2 + c) >>> 0;
            h3 = (h3 + d) >>> 0;
            h4 = (h4 + e) >>> 0;
            h5 = (h5 + f) >>> 0;
            h6 = (h6 + g) >>> 0;
            h7 = (h7 + h) >>> 0;
        }

        const out = new Uint8Array(32);
        const hVals = [h0, h1, h2, h3, h4, h5, h6, h7];
        for (let i = 0; i < hVals.length; i += 1) {
            const v = hVals[i] >>> 0;
            out[i * 4] = (v >>> 24) & 0xff;
            out[i * 4 + 1] = (v >>> 16) & 0xff;
            out[i * 4 + 2] = (v >>> 8) & 0xff;
            out[i * 4 + 3] = v & 0xff;
        }
        return out;
    }

    private hmacSha256Bytes(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
        const blockSize = 64;
        let normalizedKey = keyBytes;
        if (normalizedKey.length > blockSize) {
            normalizedKey = this.sha256Bytes(normalizedKey);
        }
        if (normalizedKey.length < blockSize) {
            const paddedKey = new Uint8Array(blockSize);
            paddedKey.set(normalizedKey);
            normalizedKey = paddedKey;
        }

        const oKeyPad = new Uint8Array(blockSize);
        const iKeyPad = new Uint8Array(blockSize);
        for (let i = 0; i < blockSize; i += 1) {
            oKeyPad[i] = normalizedKey[i] ^ 0x5c;
            iKeyPad[i] = normalizedKey[i] ^ 0x36;
        }

        const innerHash = this.sha256Bytes(this.concatUint8(iKeyPad, messageBytes));
        return this.sha256Bytes(this.concatUint8(oKeyPad, innerHash));
    }

    private async sha256Hex(value: string): Promise<string> {
        const subtle = (globalThis as any)?.crypto?.subtle;
        if (subtle?.digest) {
            const encoded = this.toUint8(value);
            const hashBuffer = await subtle.digest('SHA-256', encoded);
            return this.bytesToHex(new Uint8Array(hashBuffer));
        }
        return this.bytesToHex(this.sha256Bytes(this.toUint8(value)));
    }

    private async hmacSha256Hex(secret: string, message: string): Promise<string> {
        const subtle = (globalThis as any)?.crypto?.subtle;
        if (subtle?.importKey && subtle?.sign) {
            const key = await subtle.importKey(
                'raw',
                this.toUint8(secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const sigBuffer = await subtle.sign('HMAC', key, this.toUint8(message));
            return this.bytesToHex(new Uint8Array(sigBuffer));
        }
        return this.bytesToHex(this.hmacSha256Bytes(this.toUint8(secret), this.toUint8(message)));
    }

    private generateNonce(seed?: string): string {
        const normalizedSeed = String(seed || '').trim();
        const timestamp = Date.now().toString(36);
        const cryptoObject = (globalThis as any)?.crypto;

        if (cryptoObject?.getRandomValues) {
            const randomBytes = new Uint8Array(12);
            cryptoObject.getRandomValues(randomBytes);
            const randomValue = this.bytesToHex(randomBytes);
            return [normalizedSeed, timestamp, randomValue].filter(Boolean).join('-');
        }

        const fallbackRandom = Math.random().toString(36).slice(2, 14);
        return [normalizedSeed, timestamp, fallbackRandom].filter(Boolean).join('-');
    }

    private summarizeMobilePayload(payload: any): any {
        const body = payload || {};
        return {
            keys: Object.keys(body),
            identity: {
                email: String(body.email || ''),
                phone: String(body.phone || body.mobile_number || ''),
                tenant_uid: String(body.tenant_uid || ''),
                saas_master_uid: String(body.saas_master_uid || ''),
                tenant_db_name: String(body.tenant_db_name || body.db_name || body.db || ''),
                company_name: String(body.company_name || ''),
                fqdn: String(body.fqdn || '')
            },
            hasDevice: Boolean(body.device),
            hasPassword: Boolean(body.password),
            hasOtp: Boolean(body.otp_code || body.otp_request_uid)
        };
    }

    private summarizeMobileResponse(data: any): any {
        const tenants = this.extractTenantsFromLookupResponse(data);
        return {
            keys: data && typeof data === 'object' ? Object.keys(data) : [],
            status: data?.status || data?.result?.status || '',
            message: data?.message || data?.result?.message || '',
            tenantCount: tenants.length,
            tenants: tenants.map((tenant: any) => ({
                tenant_uid: String(tenant?.tenant_uid || ''),
                saas_master_uid: String(tenant?.saas_master_uid || ''),
                db_name: String(tenant?.db_name || ''),
                company_name: String(tenant?.company_name || ''),
                fqdn: String(tenant?.fqdn || ''),
                status: tenant?.status || tenant?.provision_step || '',
                license_status: tenant?.license_status || '',
                hasPlanCode: Boolean(tenant?.plan_code),
                hasExpiryDate: Boolean(tenant?.license_expiry_date || tenant?.expiry_date || tenant?.trial_end_date)
            }))
        };
    }

    private async sendSignedMobileRequest(path: string, payload: any, idempotencyKey?: string, nonceSource?: string): Promise<any> {
        const method = 'POST';
        const body = payload || {};
        const rawBody = JSON.stringify(body);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonceSeed = String(nonceSource || payload?.device?.device_id || '').trim();
        const nonce = this.generateNonce(nonceSeed);
        const bodyHash = await this.sha256Hex(rawBody);
        const signingMessage = [method, path, timestamp, nonce, bodyHash].join('\n');
        const signature = await this.hmacSha256Hex(this.mobileApiAppSecret, signingMessage);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Bambus-App-Id': this.mobileApiAppId,
            'X-Bambus-Timestamp': timestamp,
            'X-Bambus-Nonce': nonce,
            'X-Bambus-Signature': signature
        };

        const resolvedIdempotencyKey = String(idempotencyKey || '').trim();
        if (resolvedIdempotencyKey) {
            headers['X-Bambus-Idempotency-Key'] = resolvedIdempotencyKey;
        }

        const url = `${this.subscriptionServerBaseUrl}${path}`;
        console.log('[Mobile API] request', {
            method,
            path,
            url,
            payload: this.summarizeMobilePayload(body),
            hasIdempotencyKey: Boolean(resolvedIdempotencyKey),
            timeoutMs: this.httpRequestTimeoutMs
        });

        let response: HttpResponse;
        try {
            response = await CapacitorHttp.post({
                url,
                headers,
                data: rawBody,
                responseType: 'json',
                connectTimeout: this.httpRequestTimeoutMs
            });
        } catch (error: any) {
            console.error('[Mobile API] request failed', {
                path,
                url,
                message: error?.message || String(error || '')
            });
            throw error;
        }

        let data = response?.data ?? response;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { }
        }

        console.log('[Mobile API] response', {
            path,
            status: response?.status,
            url: response?.url || url,
            response: this.summarizeMobileResponse(data)
        });

        if (response?.status && response.status >= 400) {
            throw new Error(data?.message || `API request failed with status ${response.status}`);
        }

        return data;
    }

    private normalizeCountryCode(raw: string): string {
        const cc = String(raw || '').trim().toUpperCase();
        return /^[A-Z]{2}$/.test(cc) ? cc : 'IN';
    }

    private normalizePhoneForMobileApi(rawPhone: string, countryCode: string): string {
        const raw = String(rawPhone || '').trim();
        if (!raw) return '';
        if (raw.startsWith('+')) return raw;

        const digits = raw.replace(/\D+/g, '');
        if (!digits) return '';

        const upperCountry = this.normalizeCountryCode(countryCode);
        if (upperCountry === 'IN') {
            if (digits.length === 10) return `+91${digits}`;
            if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
        }
        return `+${digits}`;
    }

    private extractTenantsFromLookupResponse(response: any): any[] {
        const directTenants = Array.isArray(response?.tenants) ? response.tenants : [];
        const nestedTenants = Array.isArray(response?.result?.tenants) ? response.result.tenants : [];
        const singleTenant = response?.tenant || response?.result?.tenant;
        const topLevelTenant =
            response?.db_name || response?.url || response?.company_name || response?.tenant_uid
                ? response
                : null;
        const nestedTopLevelTenant =
            response?.result?.db_name || response?.result?.url || response?.result?.company_name || response?.result?.tenant_uid
                ? response.result
                : null;

        if (directTenants.length > 0) return directTenants;
        if (nestedTenants.length > 0) return nestedTenants;
        if (singleTenant) return [singleTenant];
        if (topLevelTenant) return [topLevelTenant];
        return nestedTopLevelTenant ? [nestedTopLevelTenant] : [];
    }

    private matchLookupTenant(tenants: any[], identity: any): any | null {
        const normalizedTenantUid = String(identity?.tenant_uid || '').trim().toLowerCase();
        const normalizedDbName = String(identity?.tenant_db_name || '').trim().toLowerCase();
        const normalizedCompanyName = String(identity?.company_name || '').trim().toLowerCase();
        const normalizedFqdn = String(identity?.fqdn || '').trim().toLowerCase();
        const normalizedSaasMasterUid = String(identity?.saas_master_uid || '').trim().toLowerCase();

        const matches = (tenant: any): boolean => {
            const tenantUid = String(tenant?.tenant_uid || '').trim().toLowerCase();
            const dbName = String(tenant?.db_name || '').trim().toLowerCase();
            const companyName = String(tenant?.company_name || '').trim().toLowerCase();
            const fqdn = String(tenant?.fqdn || '').trim().toLowerCase();
            const saasMasterUid = String(tenant?.saas_master_uid || '').trim().toLowerCase();

            return Boolean(
                (normalizedTenantUid && tenantUid === normalizedTenantUid) ||
                (normalizedDbName && dbName === normalizedDbName) ||
                (normalizedCompanyName && companyName === normalizedCompanyName) ||
                (normalizedFqdn && fqdn === normalizedFqdn) ||
                (normalizedSaasMasterUid && saasMasterUid === normalizedSaasMasterUid)
            );
        };

        return tenants.find(matches) || tenants[0] || null;
    }

    private normalizeOdooServerUrl(url: string): string {
        const trimmedUrl = String(url || '').trim();
        if (!trimmedUrl) return '';

        const withProtocol = /^https?:\/\//i.test(trimmedUrl)
            ? trimmedUrl
            : `https://${trimmedUrl}`;

        return withProtocol.replace(/\/+$/, '');
    }

    private normalizeTenantProvisionStep(value: any): string {
        return String(value || '').trim().toLowerCase();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Logs the user in and stores the User ID (uid).
     * @returns The User ID (uid).
     */
    async login(): Promise<number> {
        this.allowed_companies = [];
        this.is_internal_user = true;
        this.is_admin_user = false;
        let db: string = this.isIpBaseUrl()
            ? await this.getDbFromDatabaseEndpoint()
            : await this.getDb();
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
            console.log(result, "ressss")
            // The Odoo login result is the user ID (uid)
            this.uid = result.uid as number;
            this.is_internal_user = result?.is_internal_user !== false;
            this.is_admin_user = result?.is_admin_user === true || result?.is_admin === true;
            this.allowed_companies = this.normalizeCompanies(result);

            // ////console.log(`Login Successful. User ID: ${this.uid}`);
            return this.uid;
        }
        else {


            return 0


        }

        // throw new Error("Login failed: No user ID returned.");
    }

    async syncOfflineData(new_attendances: any[], old_attendances: any[], employees: any[], companyId?: number): Promise<{
        new_attendance_ids: number[];
        new_attendance_ids_by_client_id: Record<string, number>;
        deleted_attendance_ids: number[];
    }> {
        let newRecordId: {
            new_attendance_ids: number[];
            new_attendance_ids_by_client_id: Record<string, number>;
            deleted_attendance_ids: number[];
        } = { new_attendance_ids: [], new_attendance_ids_by_client_id: {}, deleted_attendance_ids: [] }
        if (new_attendances.length > 0 || old_attendances.length > 0 || employees.length > 0) {
            const payload: OdooRequest = this.buildRequest("call", {
                "company_id": companyId,
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
    async syncAttendance(
        employee_id: number,
        recognized_face: string,
        locationData?: {
            in_latitude?: number | null;
            in_longitude?: number | null;
            out_latitude?: number | null;
            out_longitude?: number | null;
            checkin_address?: string | null;
            checkout_address?: string | null;
        }
    ): Promise<any> {
        // ////console.log(recognized_face,"recog")
        if (!this.uid) {
            throw new Error("Attendance sync failed: User not logged in (UID is null). Call login() first.");
        }

        const payload: OdooRequest = this.buildRequest("call", {
            "employee_id": employee_id,
            "in_mode": "kiosk",
            "out_mode": "kiosk",
            'recognized_face': recognized_face,
            ...(locationData || {})
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

    async getEmployees(domain: any[] = []): Promise<any> {
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
                { "domain": domain, "fields": ["id", "display_name", "image_1024", "job_id", "active", "is_enrolled", "write_date", "last_photo_update_time", "company_id", "track_employee", "work_schedule_json"] } // Optional keyword arguments
            ]
        });

        // ////console.log(payload,"pay");

        const employees: any = await this.sendRequest(payload);
        return employees;
    }

    async getContracts(employeeIds: number[]): Promise<any> {
        if (!employeeIds || employeeIds.length === 0) return [];
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid,
                this.password,
                "hr.contract",
                "search_read",
                [],
                {
                    "domain": [["employee_id", "in", employeeIds], ["state", "in", ["open", "draft"]]],
                    "fields": ["employee_id", "overtime_rate", "resource_calendar_id"]
                }
            ]
        });
        const contracts: any = await this.sendRequest(payload);
        return contracts;
    }

    async getCalendarAttendances(calendarIds: number[]): Promise<any> {
        if (!calendarIds || calendarIds.length === 0) return [];
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid,
                this.password,
                "resource.calendar.attendance",
                "search_read",
                [],
                {
                    "domain": [["calendar_id", "in", calendarIds]],
                    "fields": ["calendar_id", "dayofweek", "hour_from", "hour_to"]
                }
            ]
        });
        return await this.sendRequest(payload);
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
                {
                    "domain": domainInp,
                    "fields": [
                        "id",
                        "employee_id",
                        "check_in",
                        "check_out",
                        "worked_hours",
                        "recognized_face_checkin",
                        "recognized_face_checkout",
                        "in_latitude",
                        "in_longitude",
                        "out_latitude",
                        "out_longitude",
                        "checkin_address",
                        "checkout_address",
                        "out_mode",
                        "attendance_client_id",
                        "expected_checkout_time",
                        "write_date"
                    ]
                } // Optional keyword arguments
            ]
        });

        console.log(payload, "pay");

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

    async getOpenAttendances(): Promise<any> {
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid,
                this.password,
                "hr.attendance",
                "search_read",
                [],
                {
                    "domain": [["check_out", "=", false]],
                    "fields": ["id", "employee_id", "check_in"]
                }
            ]
        });
        return await this.sendRequest(payload);
    }

    async updateAttendanceCheckout(attendance_id: number, check_out_str: string): Promise<any> {
        const payload: OdooRequest = this.buildRequest("call", {
            service: "object",
            method: "execute_kw",
            args: [
                this.db,
                this.uid,
                this.password,
                "hr.attendance",
                "write",
                [[attendance_id], {
                    "check_out": check_out_str,
                    "out_mode": "kiosk"
                }],
                {}
            ]
        });
        return await this.sendRequest(payload);
    }

    // Unused lifecycle hooks are removed in a modern injectable service
    // If you need initialization logic, use the constructor or a separate init method.

    async requestRegisterOtpFromRegisterPage(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const payload = {
            purpose: 'registration',
            email: String(params?.email || '').trim(),
            phone: this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode),
            country_code: countryCode
        };
        return this.requestMobileOtpFromSubscriptionServer(payload, String(params?.device_id || '').trim());
    }

    async requestLoginOtpFromLoginPage(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const payload: any = {
            purpose: 'login',
            country_code: countryCode
        };

        const email = String(params?.email || '').trim();
        const phone = this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode);
        if (email) payload.email = email;
        if (phone) payload.phone = phone;

        return this.requestMobileOtpFromSubscriptionServer(payload, String(params?.device_id || '').trim());
    }

    async verifyLoginOtpAndRecordDevice(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const payload: any = {
            country_code: countryCode,
            device: {
                platform: Capacitor.getPlatform()
            }
        };

        const email = String(params?.email || '').trim();
        const phone = this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode);
        const otpRequestUid = String(params?.otp_request_uid || '').trim();
        const otpCode = String(params?.otp_code || '').trim();
        const tenantDbName = String(params?.tenant_db_name || '').trim();

        if (email) payload.email = email;
        if (phone) payload.phone = phone;
        if (otpRequestUid) payload.otp_request_uid = otpRequestUid;
        if (otpCode) payload.otp_code = otpCode;
        if (tenantDbName) payload.tenant_db_name = tenantDbName;

        return this.recordMobileLoginDeviceToSubscriptionServer(payload, String(params?.device_id || '').trim());
    }

    async submitRegisterPayloadFromRegisterPage(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const companyName = String(params?.company_name || params?.business_name || '').trim();
        const payload: any = {
            customer_name: String(params?.customer_name || params?.name || '').trim(),
            company_name: companyName,
            email: String(params?.email || '').trim(),
            phone: this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode),
            country_code: countryCode,
            password: String(params?.password || ''),
            plan_code: String(params?.plan_code || environment.registerPlan || 'hr18').trim() || String(environment.registerPlan || 'hr18').trim(),
            odoo_version: String(params?.odoo_version || '18').trim() || '18',
            device: {
                platform: Capacitor.getPlatform()
            }
        };

        const otpRequestUid = String(params?.otp_request_uid || '').trim();
        const otpCode = String(params?.otp_code || '').trim();
        if (otpRequestUid) payload.otp_request_uid = otpRequestUid;
        if (otpCode) payload.otp_code = otpCode;

        const idempotencyKey = [
            'mobile-register',
            String(payload.email || '').toLowerCase(),
            companyName.toLowerCase(),
            otpRequestUid || 'no-otp-request',
            otpCode || 'no-otp-code'
        ].filter(Boolean).join(':');

        return this.sendMobileRegisterToSubscriptionServer(payload, idempotencyKey);
    }

    async fetchUpdatedTenantFromSubscription(params: any): Promise<any> {
        console.log('[Tenant Refresh] lookup params', this.summarizeMobilePayload(params || {}));
        const response = await this.lookupTenantsForSubscriptionRefresh(params || {});
        const tenants = this.extractTenantsFromLookupResponse(response);
        const matchedTenant = this.matchLookupTenant(tenants, params || {});
        console.log('[Tenant Refresh] match result', {
            requested: this.summarizeMobilePayload(params || {}),
            tenantCount: tenants.length,
            matched: Boolean(matchedTenant),
            matchedTenant: matchedTenant ? this.summarizeMobileResponse({ tenant: matchedTenant }).tenants[0] : null
        });
        return matchedTenant;
    }

    async waitForTenantProvisioningFromServer(params: any, options: any): Promise<any> {
        const timeoutMs = Math.max(15000, Number(options?.timeoutMs || 180000));
        const intervalMs = Math.max(2000, Number(options?.intervalMs || 5000));
        const deadline = Date.now() + timeoutMs;

        let latest = await this.fetchUpdatedTenantFromSubscription(params || {});
        while (Date.now() <= deadline) {
            if (latest) {
                if (this.isTenantProvisioningComplete(latest) || this.isTenantProvisioningFailed(latest)) {
                    return latest;
                }
            }

            if (Date.now() + intervalMs > deadline) {
                break;
            }
            await this.sleep(intervalMs);
            latest = await this.fetchUpdatedTenantFromSubscription({
                ...(params || {}),
                tenant_db_name: String(params?.tenant_db_name || latest?.db_name || '').trim() || undefined,
                tenant_uid: String(params?.tenant_uid || latest?.tenant_uid || '').trim() || undefined,
                company_name: String(params?.company_name || latest?.company_name || '').trim() || undefined,
                fqdn: String(params?.fqdn || latest?.fqdn || '').trim() || undefined,
                saas_master_uid: String(params?.saas_master_uid || latest?.saas_master_uid || '').trim() || undefined
            });
        }
        return latest;
    }

    async lookupTenantsFromLoginPage(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const payload: any = {
            country_code: countryCode
        };

        const email = String(params?.email || '').trim();
        const phone = this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode);
        const tenantUid = String(params?.tenant_uid || '').trim();
        const saasMasterUid = String(params?.saas_master_uid || '').trim();

        if (email) payload.email = email;
        if (phone) payload.phone = phone;
        if (tenantUid) {
            payload.tenant_uid = tenantUid;
        } else if (saasMasterUid) {
            payload.saas_master_uid = saasMasterUid;
        }

        return this.lookupMobileTenantsFromSubscriptionServer(payload, String(params?.device_id || '').trim());
    }

    private async lookupTenantsForSubscriptionRefresh(params: any): Promise<any> {
        const countryCode = this.normalizeCountryCode(String(params?.country_code || 'IN'));
        const payload: any = {
            country_code: countryCode
        };

        const tenantUid = String(params?.tenant_uid || '').trim();
        const saasMasterUid = String(params?.saas_master_uid || '').trim();
        const tenantDbName = String(params?.tenant_db_name || params?.db_name || params?.db || '').trim();
        const companyName = String(params?.company_name || '').trim();
        const fqdn = String(params?.fqdn || '').trim();
        const email = String(params?.email || '').trim();
        const phone = this.normalizePhoneForMobileApi(String(params?.phone || params?.mobile_number || '').trim(), countryCode);
        const hasTenantIdentity = Boolean(tenantUid || saasMasterUid || tenantDbName || companyName || fqdn);

        if (email) payload.email = email;
        if (phone) payload.phone = phone;
        if (tenantUid) {
            payload.tenant_uid = tenantUid;
        } else if (saasMasterUid) {
            payload.saas_master_uid = saasMasterUid;
        }
        if (tenantDbName) payload.tenant_db_name = tenantDbName;
        if (companyName) payload.company_name = companyName;
        if (fqdn) payload.fqdn = fqdn;

        console.log('[Tenant Refresh] request payload', {
            hasTenantIdentity,
            payload: this.summarizeMobilePayload(payload)
        });
        return this.lookupMobileTenantsFromSubscriptionServer(payload, String(params?.device_id || '').trim());
    }

    async sendMobileRegisterToSubscriptionServer(payload: any, idempotencyKey?: string): Promise<any> {
        return this.sendSignedMobileRequest('/mobile/register', payload, idempotencyKey);
    }

    async requestMobileOtpFromSubscriptionServer(payload: any, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest('/mobile/otp/request', payload, undefined, String(deviceId || '').trim());
    }

    async recordMobileLoginDeviceToSubscriptionServer(payload: any, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest('/mobile/login/device', payload, undefined, String(deviceId || '').trim());
    }

    async lookupMobileTenantsFromSubscriptionServer(payload: any, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest('/mobile/tenants/lookup', payload, undefined, String(deviceId || '').trim());
    }

    async listMobilePlansFromSubscriptionServer(payload: any, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest('/mobile/plans', payload || {}, undefined, String(deviceId || '').trim());
    }

    async initializeMobilePaymentOnSubscriptionServer(payload: any, idempotencyKey: string, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest(
            '/mobile/payments/initialize',
            payload,
            String(idempotencyKey || '').trim(),
            String(deviceId || '').trim()
        );
    }

    async captureMobilePaymentOnSubscriptionServer(payload: any, idempotencyKey: string, deviceId: string): Promise<any> {
        return this.sendSignedMobileRequest(
            '/mobile/payments/capture',
            payload,
            String(idempotencyKey || '').trim(),
            String(deviceId || '').trim()
        );
    }

    setOdooServer(url: string) {
        this.baseUrl = url;
    }

    resolveTenantWebUrl(tenant: any): string {
        if (!environment.production) {
            return 'http://192.168.1.61:5001';
        }

        const directUrl = String(tenant?.url || '').trim();
        if (directUrl) {
            return this.normalizeOdooServerUrl(directUrl);
        }

        const fqdn = String(tenant?.fqdn || '').trim();
        if (!fqdn) return '';
        const inferredUrl = /^https?:\/\//i.test(fqdn) ? fqdn : `https://${fqdn}`;
        return this.normalizeOdooServerUrl(inferredUrl);
    }

    isTenantProvisioningComplete(tenant: any): boolean {
        if (!tenant) return false;

        const status = this.normalizeTenantProvisionStep(tenant?.status || tenant?.provision_step);
        if (this.isTenantProvisioningFailed(tenant)) {
            return false;
        }

        const resolvedDbName = String(tenant?.db_name || '').trim();
        const resolvedUrl = this.resolveTenantWebUrl(tenant);
        const hasConnectionDetails = !!resolvedDbName && !!resolvedUrl;

        if (!status) return false;
        if (status === 'active') return hasConnectionDetails;
        return false;
    }

    isTenantProvisioningFailed(tenant: any): boolean {
        const status = this.normalizeTenantProvisionStep(tenant?.status || tenant?.provision_step);
        return ['error', 'deleting', 'disabled'].includes(status);
    }

    extractOdooErrorMessage(error: any): string {
        return error?.message || 'Unknown error';
    }
}
