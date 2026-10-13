// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: true,
  subscriptionServerBaseUrl: 'https://bambustechnologies.in',
  //live keys
  mobileApiAppId: 'bambus_mobile_at7hvcrc0whw',
  mobileApiAppSecret: 'SRYpmfzTdAP17htRuCqSmSGLdTxXq-LBkJaCG2kzWjEECWRlgtwYzIYLuzjdC9a4',
  //local keys
  // mobileApiAppId: 'bambus_android_lw1k2zat6lns',
  // mobileApiAppSecret: 'U-jtLwxTA8yMMZ4kWDyDl54GUm5eFgKsm_B6dMd2PQ2XH-4ptRPSmimpL6l_LbnC',
  registerPlan: "hr18",
  razorpay: {
    // Demo / test credentials for the license-renewal flow. Replace with backend-issued order flow before production use.
    key_id: 'rzp_live_TCyLWSYf5acX8g',
    key_secret: '5Dcxgr2ub0OxjInqFMxZ0XLV',
    // Optional backend ids used by /mobile/payments/initialize when payment.transaction requires them.
    payment_provider_id: 0,
    payment_method_id: 0,
    payment_method_code: 'card'
  },
  // api: 'http://192.168.1.63:10625/'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
