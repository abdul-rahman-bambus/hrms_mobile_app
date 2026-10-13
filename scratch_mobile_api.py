# -*- coding: utf-8 -*-
import hashlib
import hmac
import json
import logging
from html import escape
import secrets
import time
from datetime import timedelta
from urllib.parse import quote_plus

from odoo import http
from odoo import fields
from odoo.http import request

_logger = logging.getLogger(__name__)


class BambusMobileApiController(http.Controller):
    def _error(self, status, code, message):
        return request.make_json_response({"status": "error", "code": code, "message": message}, status=status)

    def _verify_and_parse(self, path, require_idempotency=False):
        env = request.env
        icp = env["ir.config_parameter"].sudo()
        if icp.get_param("bambus_mobile_api.enabled", "True").lower() != "true":
            return None, None, self._error(403, "api_disabled", "Mobile API is disabled")
        if "application/json" not in (request.httprequest.headers.get("Content-Type") or ""):
            return None, None, self._error(400, "invalid_content_type", "Content-Type must be application/json")
        raw = request.httprequest.get_data() or b""
        if len(raw) > int(icp.get_param("bambus_mobile_api.max_body_size_bytes", "32768")):
            return None, None, self._error(400, "body_too_large", "Request body exceeds allowed size")

        app_id = request.httprequest.headers.get("X-Bambus-App-Id")
        ts = request.httprequest.headers.get("X-Bambus-Timestamp")
        nonce = request.httprequest.headers.get("X-Bambus-Nonce")
        sig = request.httprequest.headers.get("X-Bambus-Signature")
        idem = request.httprequest.headers.get("X-Bambus-Idempotency-Key")
        if require_idempotency and not idem:
            return None, None, self._error(400, "missing_idempotency_key", "Idempotency key is required")
        if not app_id or not ts or not nonce or not sig:
            return None, None, self._error(401, "missing_signature_headers", "Missing required signature headers")

        app = env["bambus.mobile.api.app"].sudo().search([("app_id", "=", app_id), ("active", "=", True)], limit=1)
        if not app:
            return None, None, self._error(403, "app_not_allowed", "Unknown or inactive mobile app")

        now = int(time.time())
        skew = int(icp.get_param("bambus_mobile_api.allowed_timestamp_skew_seconds", "300"))
        try:
            ts_int = int(ts)
        except Exception:
            return None, None, self._error(401, "invalid_timestamp", "Invalid timestamp")
        if abs(now - ts_int) > skew:
            return None, None, self._error(401, "timestamp_out_of_range", "Timestamp outside allowed skew")

        nonce_model = env["bambus.mobile.api.nonce"].sudo()
        nonce_model.cleanup_expired()
        if nonce_model.search_count([("app_id", "=", app_id), ("nonce", "=", nonce)]):
            return None, None, self._error(401, "nonce_reused", "Nonce already used")

        body_hash = hashlib.sha256(raw).hexdigest()
        msg = "\n".join([request.httprequest.method, path, ts, nonce, body_hash]).encode()
        expected = hmac.new((app.secret or "").encode(), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            _logger.warning("mobile_signature_failed app_id=%s", app_id)
            return None, None, self._error(401, "invalid_signature", "Invalid mobile request signature")

        nonce_model.create({"app_id": app_id, "nonce": nonce, "timestamp_value": ts_int})
        data = json.loads(raw.decode("utf-8") or "{}")
        return data, {"app_id": app_id, "app": app, "raw": raw, "idem": idem}, None

    def _tenant_payload(self, tenant, include_license=False):
        fqdn = (tenant.fqdn or "").strip()
        fqdn_lower = fqdn.lower()
        if fqdn_lower.startswith("http://"):
            url = fqdn
            fqdn = fqdn[7:]
        elif fqdn_lower.startswith("https://"):
            url = fqdn
            fqdn = fqdn[8:]
        else:
            url = "https://%s" % fqdn if fqdn else None
        partner = tenant.partner_id
        customer_phone = (
            getattr(tenant, "customer_phone", None)
            or (partner.phone if partner else None)
            or (partner.mobile if partner else None)
        )
        payload = {
            "id": tenant.id,
            "tenant_uid": tenant.saas_master_uid,
            "db_name": tenant.db_name,
            "subdomain": tenant.subdomain,
            "company_name": getattr(tenant, "company_name", None),
            "customer_phone": customer_phone,
            "phone": customer_phone,
            "fqdn": fqdn or None,
            "url": url,
            "plan_code": tenant.plan_code,
            "odoo_version": tenant.odoo_version,
            "status": tenant.status,
            "admin_login": getattr(tenant, "admin_login", None),
        }
        if include_license:
            payload.update({
                "license_key": getattr(tenant, "license_key", None),
                "license_status": getattr(tenant, "license_status", None),
                "license_expiry_date": tenant.expiry_date.isoformat() if getattr(tenant, "expiry_date", None) else None,
                "trial_end_date": tenant.trial_end_date.isoformat() if getattr(tenant, "trial_end_date", None) else None,
            })
        return payload

    def _mobile_tenant_slug(self, partner):
        return "tenant-%s-%s" % (int(time.time()), partner.id)


    def _mobile_plan_payload(self, plan):
        taxes = [{
            "id": tax.id,
            "name": tax.name,
            "amount": tax.amount,
            "amount_type": tax.amount_type,
            "price_include": bool(tax.price_include),
            "include_base_amount": bool(tax.include_base_amount),
        } for tax in plan.tax_ids]
        return {
            "code": plan.code,
            "name": plan.name,
            "description": plan.description or "",
            "odoo_version": plan.odoo_version or "18",
            "edition": plan.edition or "community",
            "max_users": plan.max_users_default or 0,
            "billing_period": plan.billing_period,
            "pricing_model": plan.pricing_model,
            "recurring_price": plan.recurring_price,
            "price_per_user": plan.price_per_user,
            "currency": plan.currency_id.name if plan.currency_id else None,
            "taxes": taxes,
            "trial_days": plan.trial_days,
            "grace_days": plan.grace_days,
            "pos_scenario_enabled": bool(plan.pos_scenario_enabled),
        }

    @http.route('/mobile/plans', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_plans(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/plans')
        if err:
            return err
        domain = [
            ("active", "=", True),
            ("mobile_api_enabled", "=", True),
            ("mobile_app_id", "=", ctx["app"].id),
        ]
        if data.get("odoo_version"):
            domain.append(("odoo_version", "=", str(data["odoo_version"]).split(".", 1)[0]))
        if data.get("edition"):
            domain.append(("edition", "=", data["edition"]))
        plans = request.env["bambus.saas.plan"].sudo().search(domain, order="sequence, name")
        return request.make_json_response({"plans": [self._mobile_plan_payload(plan) for plan in plans]})

    @http.route('/mobile/register', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_register(self, **kwargs):
        _logger.info("mobile_register_start")
        data, ctx, err = self._verify_and_parse('/mobile/register', require_idempotency=True)
        if err:
            return err
        env = request.env
        partner_model = env["res.partner"].sudo()
        email = partner_model._normalize_email(data.get("email"))
        phone = partner_model._normalize_phone(data.get("phone"), data.get("country_code"))
        if not email and not phone:
            return self._error(400, "missing_identity", "Email or phone is required")
        otp_err = self._verify_otp_if_required("registration", data, ctx["app_id"])
        if otp_err:
            return otp_err

        # rate limit
        minute = int(time.time() // 60)
        limit = int(env["ir.config_parameter"].sudo().get_param("bambus_mobile_api.rate_limit_per_minute", "30"))
        for key in ["ip:%s" % request.httprequest.remote_addr, "app:%s" % ctx["app_id"], "id:%s|%s" % (email, phone)]:
            rl = env["bambus.mobile.api.rate.limit"].sudo().search([("key", "=", key), ("window_ts", "=", minute)], limit=1)
            if not rl:
                rl = env["bambus.mobile.api.rate.limit"].sudo().create({"key": key, "window_ts": minute, "hit_count": 0})
            rl.hit_count += 1
            if rl.hit_count > limit:
                return self._error(429, "rate_limit_exceeded", "Rate limit exceeded")

        req_hash = hashlib.sha256(ctx["raw"]).hexdigest()
        reg_model = env["bambus.mobile.registration.request"].sudo()
        reg = reg_model.search([
            ("idempotency_key", "=", ctx["idem"]),
            ("mobile_app_id", "=", ctx["app"].id),
        ], limit=1)
        if reg:
            if reg.request_hash != req_hash:
                return self._error(409, "idempotency_conflict", "Idempotency key reused with different request body")
            if reg.status == "completed" and reg.response_json:
                return request.make_json_response(reg.response_json)
            if reg.status == "processing":
                return self._error(409, "registration_processing", "Registration is already processing")
        else:
            reg = reg_model.create({
                "idempotency_key": ctx["idem"],
                "request_hash": req_hash,
                "normalized_email": email,
                "normalized_phone": phone,
                "mobile_app_id": ctx["app"].id,
            })

        env.cr.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            [f"mobile_register:{ctx['app_id']}:{email}:{phone}"],
        )
        partner = partner_model.search(["|", ("bambus_normalized_email", "=", email), ("bambus_normalized_phone", "=", phone)], limit=1)
        if partner:
            _logger.info("mobile_customer_found partner_id=%s", partner.id)
        else:
            partner = partner_model.create({"name": data.get("customer_name") or email or phone, "company_type": "company" if data.get("company_name") else "person", "email": email or False, "phone": phone or False})
            _logger.info("mobile_customer_created partner_id=%s", partner.id)

        tenant_model = env["bambus.saas.tenant"].sudo()
        app_domain = [("mobile_app_id", "=", ctx["app"].id), ("status", "!=", "deleting")]
        tenants = tenant_model.search(app_domain + [("partner_id", "=", partner.id)])
        if not tenants and email:
            tenants = tenant_model.search(app_domain + [("customer_email", "=", email)])
        if not tenants and phone:
            tenants = tenant_model.search(app_domain + [("customer_phone", "=", phone)])

        if tenants:
            self._record_device(data, ctx["app_id"], "registration", partner, tenants)
            resp = {"status": "existing", "customer": {"id": partner.id, "name": partner.name, "email": email, "phone": phone}, "tenants": [self._tenant_payload(t) for t in tenants]}
            reg.write({"status": "completed", "response_json": resp, "partner_id": partner.id, "tenant_id": tenants[0].id})
            _logger.info("mobile_existing_tenant_returned partner_id=%s", partner.id)
            return request.make_json_response(resp)

        _logger.info("mobile_tenant_create_start partner_id=%s", partner.id)
        plan = env["bambus.saas.plan"].sudo().search([
            ("code", "=", data.get("plan_code")),
            ("mobile_app_id", "=", ctx["app"].id),
        ], limit=1)
        if not plan:
            reg.write({"status": "failed", "error_message": "A valid plan_code is required"})
            return self._error(400, "invalid_plan", "A valid plan_code is required")
        if not plan.mobile_api_enabled:
            reg.write({"status": "failed", "error_message": "Selected plan is not enabled for mobile registration"})
            return self._error(400, "plan_not_mobile_enabled", "Selected plan is not enabled for mobile registration")
        if not plan.backend_id:
            reg.write({"status": "failed", "error_message": "Selected plan has no backend configured"})
            return self._error(400, "plan_backend_missing", "Selected plan has no backend configured")
        admin_password = data.get("password")
        if not admin_password:
            reg.write({"status": "failed", "error_message": "Password is required to create the tenant admin user"})
            return self._error(400, "missing_password", "Password is required")
        admin_login = email or phone
        tenant_slug = self._mobile_tenant_slug(partner)
        tenant = tenant_model.create({
            "name": data.get("company_name") or partner.name,
            "db_name": tenant_slug,
            "subdomain": tenant_slug,
            "odoo_version": data.get("odoo_version") or plan.odoo_version or "18",
            "partner_id": partner.id,
            "plan_id": plan.id,
            "backend_id": plan.backend_id.id,
            "customer_email": email,
            "customer_phone": phone,
            "customer_name": data.get("customer_name"),
            "company_name": data.get("company_name"),
            "admin_login": admin_login,
            "license_status": "active",
            "max_users": plan.max_users_default or 0,
            "mobile_registration_request_id": reg.id,
            "created_from_mobile_app": True,
            "mobile_app_id": ctx["app"].id,
        })
        customer_payload = {
            "customer_name": data.get("customer_name"),
            "company_name": data.get("company_name"),
            "customer_email": email,
            "customer_phone": phone,
            "customer_street": data.get("street") or data.get("customer_street"),
            "customer_street2": data.get("street2") or data.get("customer_street2"),
            "customer_city": data.get("city") or data.get("customer_city"),
            "customer_zip": data.get("zip") or data.get("customer_zip"),
            "customer_state": data.get("state") or data.get("customer_state"),
            "customer_country_code": data.get("country_code") or data.get("customer_country_code"),
            "customer_website": data.get("website") or data.get("customer_website"),
            "customer_vat": data.get("vat") or data.get("customer_vat"),
        }
        tenant.action_provision_tenant_mobile(admin_login=admin_login, admin_password=admin_password, customer_payload=customer_payload)
        self._record_device(data, ctx["app_id"], "registration", partner, tenant)
        resp = {"status": "created", "customer": {"id": partner.id, "name": partner.name, "email": email, "phone": phone}, "tenant": self._tenant_payload(tenant)}
        reg.write({"status": "completed", "response_json": resp, "partner_id": partner.id, "tenant_id": tenant.id})
        _logger.info("mobile_tenant_create_completed tenant_id=%s", tenant.id)
        return request.make_json_response(resp)

    def _record_device(self, data, app_id, event_type, partner=None, tenants=None):
        device = data.get("device") or {}
        salt = request.env["ir.config_parameter"].sudo().get_param("database.secret", "bambus")
        device_id_hash = hmac.new(salt.encode(), (device.get("device_id") or "").encode(), hashlib.sha256).hexdigest()
        vals = {
            "partner_id": partner.id if partner else False,
            "tenant_id": tenants[:1].id if tenants else False,
            "tenant_db_name": data.get("tenant_db_name") if data.get("tenant_db_name") else (tenants[:1].db_name if tenants else False),
            "normalized_email": request.env["res.partner"]._normalize_email(data.get("email")),
            "normalized_phone": request.env["res.partner"]._normalize_phone(data.get("phone"), data.get("country_code")),
            "app_id": app_id,
            "platform": device.get("platform"),
            "device_id_hash": device_id_hash,
            "device_model": device.get("device_model"),
            "manufacturer": device.get("manufacturer"),
            "os_name": device.get("os_name"),
            "os_version": device.get("os_version"),
            "app_version": device.get("app_version"),
            "build_number": device.get("build_number"),
            "push_token": device.get("push_token"),
            "ip_address": request.httprequest.remote_addr,
            "user_agent": request.httprequest.headers.get("User-Agent"),
            "raw_device_json": {k: v for k, v in device.items() if k != "device_id"},
            "event_type": event_type,
        }
        request.env["bambus.mobile.device"].sudo().upsert_event(vals)

    def _get_base_url(self):
        return request.env["ir.config_parameter"].sudo().get_param("web.base.url", "").rstrip("/")

    def _payment_json_response(self, tx):
        invoice = tx.bambus_invoice_id
        payment = tx.bambus_payment_id
        return {
            "status": tx.state,
            "reference": tx.reference,
            "provider_code": tx.provider_code,
            "gateway_transaction_id": tx.bambus_gateway_transaction_id,
            "gateway_status": tx.bambus_gateway_status,
            "failure_code": tx.bambus_gateway_failure_code,
            "failure_message": tx.bambus_gateway_failure_message,
            "customer": {"id": tx.partner_id.id, "name": tx.partner_id.name, "email": tx.partner_id.email, "phone": tx.partner_id.phone},
            "tenant": self._tenant_payload(tx.bambus_saas_tenant_id) if tx.bambus_saas_tenant_id else None,
            "invoice": {
                "id": invoice.id,
                "name": invoice.name,
                "state": invoice.state,
                "payment_state": invoice.payment_state,
                "amount_total": invoice.amount_total,
                "amount_residual": invoice.amount_residual,
                "saas_period_start": (
                    invoice.bambus_saas_period_start.isoformat()
                    if invoice.bambus_saas_period_start
                    else None
                ),
                "saas_period_end": (
                    invoice.bambus_saas_period_end.isoformat()
                    if invoice.bambus_saas_period_end
                    else None
                ),
                "saas_license_applied": invoice.bambus_saas_license_applied,
            } if invoice else None,
            "payment": {
                "id": payment.id,
                "name": payment.name,
                "state": payment.state,
                "amount": payment.amount,
            } if payment else None,
        }

    def _mobile_payment_income_account(self, company):
        return request.env["account.account"].sudo().search([
            ("company_id", "=", company.id),
            ("account_type", "in", ["income", "income_other"]),
            ("deprecated", "=", False),
        ], limit=1)

    def _mobile_payment_journal(self, data, company):
        journal_model = request.env["account.journal"].sudo()
        if data.get("journal_id"):
            return journal_model.search([("id", "=", int(data["journal_id"])), ("company_id", "=", company.id)], limit=1)
        if data.get("journal_code"):
            return journal_model.search([("code", "=", data["journal_code"]), ("company_id", "=", company.id)], limit=1)
        return journal_model.search([("type", "in", ["bank", "cash"]), ("company_id", "=", company.id)], limit=1)

    def _mobile_payment_provider(self, data):
        provider_model = request.env["payment.provider"].sudo()
        if data.get("payment_provider_id"):
            return provider_model.browse(int(data["payment_provider_id"])).exists()
        provider_code = data.get("payment_provider_code") or data.get("gateway")
        if provider_code:
            provider = provider_model.search([("code", "=", str(provider_code).strip().lower())], limit=1)
            if provider:
                return provider
            return provider_model.search([("name", "=ilike", str(provider_code).strip())], limit=1)
        return provider_model.search([], limit=1)

    def _set_mobile_tx_state(self, tx, state, message=None):
        if state == "done" and hasattr(tx, "_set_done"):
            tx._set_done()
        elif state == "pending" and hasattr(tx, "_set_pending"):
            tx._set_pending()
        elif state in ("cancel", "canceled") and hasattr(tx, "_set_canceled"):
            tx._set_canceled()
        elif state == "error" and hasattr(tx, "_set_error"):
            tx._set_error(message or "Mobile gateway payment failed")
        else:
            tx.write({"state": state if state != "canceled" else "cancel"})

    def _reconcile_mobile_payment(self, invoice, payment):
        lines = (invoice.line_ids + payment.move_id.line_ids).filtered(
            lambda line: line.account_id.account_type == "asset_receivable" and not line.reconciled
        )
        if lines:
            lines.reconcile()

    def _mobile_payment_partner_and_tenant(self, data, mobile_app):
        partner_model = request.env["res.partner"].sudo()
        email = partner_model._normalize_email(data.get("email"))
        phone = partner_model._normalize_phone(data.get("phone"), data.get("country_code"))
        partner = partner_model.browse(int(data["partner_id"])).exists() if data.get("partner_id") else None
        if not partner:
            partner = self._find_partner_for_identity(email=email, phone=phone)
        if not partner:
            if not email and not phone and not data.get("customer_name"):
                return None, None, self._error(400, "missing_customer", "partner_id, email, phone or customer_name is required")
            partner = partner_model.create({"name": data.get("customer_name") or email or phone, "email": email or False, "phone": phone or False})

        tenant = request.env["bambus.saas.tenant"].sudo().browse()
        app_domain = [("mobile_app_id", "=", mobile_app.id)]
        tenant_uid = (data.get("tenant_uid") or data.get("saas_master_uid") or "").strip()
        if tenant_uid:
            tenant = request.env["bambus.saas.tenant"].sudo().search(
                app_domain + [("saas_master_uid", "=", tenant_uid)], limit=1
            )
        elif data.get("tenant_id"):
            tenant = request.env["bambus.saas.tenant"].sudo().search(
                app_domain + [("id", "=", int(data["tenant_id"]))], limit=1
            )
        elif data.get("tenant_db_name"):
            tenant = request.env["bambus.saas.tenant"].sudo().search(
                app_domain + [("db_name", "=", data["tenant_db_name"])], limit=1
            )
        return partner, tenant, None

    def _prepare_mobile_invoice_lines(self, data, amount, income_account, tenant=None):
        invoice_lines = data.get("invoice_lines") or [{"name": data.get("description") or "Mobile app payment", "quantity": 1, "price_unit": amount}]
        tax_ids = tenant.plan_id.tax_ids.ids if tenant and tenant.plan_id else []
        return [(0, 0, {
            "name": line.get("name") or "Mobile app payment",
            "quantity": float(line.get("quantity") or 1),
            "price_unit": float(line.get("price_unit") or line.get("amount") or amount),
            "account_id": income_account.id,
            "tax_ids": [(6, 0, tax_ids)],
        }) for line in invoice_lines]

    def _mobile_payment_method(self, data, provider):
        payment_methods = provider.payment_method_ids
        payment_method_id = data.get("payment_method_id")
        if payment_method_id:
            try:
                payment_method_id = int(payment_method_id)
            except (TypeError, ValueError):
                return payment_methods.browse()
            return payment_methods.filtered(lambda method: method.id == payment_method_id)[:1]
        payment_method_code = data.get("payment_method_code") or data.get("payment_method")
        if payment_method_code:
            payment_method_code = str(payment_method_code).strip()
            return payment_methods.filtered(lambda method: method.code == payment_method_code)[:1]
        return payment_methods.browse()

    @http.route('/mobile/payments/initialize', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_payments_initialize(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/payments/initialize', require_idempotency=True)
        if err:
            return err
        required = ["gateway", "amount", "currency"]
        missing = [field for field in required if not data.get(field)]
        if missing:
            return self._error(400, "missing_fields", "Missing required fields: %s" % ", ".join(missing))
        try:
            amount = float(data.get("amount"))
        except (TypeError, ValueError):
            return self._error(400, "invalid_amount", "amount must be a number")
        if amount <= 0:
            return self._error(400, "invalid_amount", "amount must be greater than zero")

        tx_model = request.env["payment.transaction"].sudo()
        tx = tx_model.search([
            ("bambus_mobile_idempotency_key", "=", ctx["idem"]),
            ("bambus_mobile_app_id", "=", ctx["app_id"]),
        ], limit=1)
        if tx and tx.bambus_mobile_response_json:
            return request.make_json_response(tx.bambus_mobile_response_json)

        partner, tenant, error = self._mobile_payment_partner_and_tenant(data, ctx["app"])
        if error:
            return error
        currency = request.env["res.currency"].sudo().search([("name", "=", str(data.get("currency")).upper())], limit=1)
        if not currency:
            return self._error(400, "invalid_currency", "Currency was not found in Odoo")
        company = request.env.company
        provider = self._mobile_payment_provider(data)
        if not provider:
            return self._error(400, "payment_provider_missing", "Configure an Odoo payment provider for this mobile gateway")
        payment_method = self._mobile_payment_method(data, provider)
        if not payment_method:
            return self._error(400, "payment_method_missing", "Send payment_method_id or payment_method_code for a payment method attached to this Odoo payment provider")
        income_account = self._mobile_payment_income_account(company)
        if not income_account:
            return self._error(400, "income_account_missing", "Configure an income account before creating mobile invoices")

        invoice_vals = {
            "move_type": "out_invoice",
            "partner_id": partner.id,
            "currency_id": currency.id,
            "invoice_origin": data.get("gateway_order_id") or data.get("merchant_order_id") or ctx["idem"],
            "ref": data.get("description") or "Mobile payment initialization",
            "bambus_saas_tenant_id": tenant.id if tenant else False,
            "invoice_line_ids": self._prepare_mobile_invoice_lines(data, amount, income_account, tenant),
        }
        if tenant:
            invoice_vals.update(tenant._prepare_invoice_coverage_vals())
        invoice = request.env["account.move"].sudo().create(invoice_vals)
        reference = data.get("merchant_order_id") or data.get("reference") or tx_model._compute_reference(provider.code, prefix="MOBILE")
        tx = tx_model.create({
            "provider_id": provider.id,
            "payment_method_id": payment_method.id,
            "reference": reference,
            "amount": amount,
            "currency_id": currency.id,
            "partner_id": partner.id,
            "operation": data.get("operation") or "online_redirect",
            "state": "draft",
            "bambus_mobile_app_id": ctx["app_id"],
            "bambus_mobile_idempotency_key": ctx["idem"],
            "bambus_gateway_order_id": data.get("gateway_order_id"),
            "bambus_saas_tenant_id": tenant.id if tenant else False,
            "bambus_invoice_id": invoice.id,
            "bambus_mobile_request_json": data,
        })
        resp = self._payment_json_response(tx)
        tx.write({"bambus_mobile_response_json": resp})
        return request.make_json_response(resp)

    @http.route('/mobile/payments/capture', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_payments_capture(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/payments/capture', require_idempotency=True)
        if err:
            return err
        required = ["gateway", "status"]
        missing = [field for field in required if not data.get(field)]
        if missing:
            return self._error(400, "missing_fields", "Missing required fields: %s" % ", ".join(missing))
        gateway_status = str(data.get("status")).strip().lower()
        successful_statuses = ("success", "succeeded", "captured", "paid", "done")
        if gateway_status in successful_statuses and not data.get("gateway_transaction_id"):
            return self._error(400, "missing_fields", "gateway_transaction_id is required for successful captures")
        provider = self._mobile_payment_provider(data)
        if not provider:
            return self._error(400, "payment_provider_missing", "Configure an Odoo payment provider for this mobile gateway")
        gateway_transaction_id = str(data.get("gateway_transaction_id") or "").strip()
        tx_model = request.env["payment.transaction"].sudo()
        app_domain = [("bambus_mobile_app_id", "=", ctx["app_id"])]
        if gateway_transaction_id:
            tx = tx_model.search(app_domain + ["|", ("reference", "=", data.get("reference") or ""), "&", ("provider_id", "=", provider.id), ("bambus_gateway_transaction_id", "=", gateway_transaction_id)], limit=1)
        else:
            tx = tx_model.search(app_domain + [("reference", "=", data.get("reference") or ""), ("provider_id", "=", provider.id)], limit=1)
        if not tx and data.get("initialization_idempotency_key"):
            tx = tx_model.search(app_domain + [("bambus_mobile_idempotency_key", "=", data["initialization_idempotency_key"])], limit=1)
        if not tx:
            if not all(data.get(field) for field in ["amount", "currency"]):
                return self._error(404, "transaction_not_found", "Initialized payment transaction was not found")
            try:
                amount = float(data.get("amount"))
            except (TypeError, ValueError):
                return self._error(400, "invalid_amount", "amount must be a number")
            if amount <= 0:
                return self._error(400, "invalid_amount", "amount must be greater than zero")
            partner, tenant, error = self._mobile_payment_partner_and_tenant(data, ctx["app"])
            if error:
                return error
            currency = request.env["res.currency"].sudo().search([("name", "=", str(data.get("currency")).upper())], limit=1)
            if not currency:
                return self._error(400, "invalid_currency", "Currency was not found in Odoo")
            payment_method = self._mobile_payment_method(data, provider)
            if not payment_method:
                return self._error(400, "payment_method_missing", "Send payment_method_id or payment_method_code for a payment method attached to this Odoo payment provider")
            income_account = self._mobile_payment_income_account(request.env.company)
            if not income_account:
                return self._error(400, "income_account_missing", "Configure an income account before creating mobile invoices")
            invoice_vals = {
                "move_type": "out_invoice",
                "partner_id": partner.id,
                "currency_id": currency.id,
                "invoice_origin": data.get("gateway_order_id") or data.get("merchant_order_id") or ctx["idem"],
                "ref": data.get("description") or "Mobile payment capture",
                "bambus_saas_tenant_id": tenant.id if tenant else False,
                "invoice_line_ids": self._prepare_mobile_invoice_lines(data, amount, income_account, tenant),
            }
            if tenant:
                invoice_vals.update(tenant._prepare_invoice_coverage_vals())
            invoice = request.env["account.move"].sudo().create(invoice_vals)
            reference = data.get("reference") or data.get("merchant_order_id") or tx_model._compute_reference(provider.code, prefix="MOBILE")
            tx = tx_model.create({
                "provider_id": provider.id,
                "payment_method_id": payment_method.id,
                "reference": reference,
                "amount": amount,
                "currency_id": currency.id,
                "partner_id": partner.id,
                "operation": data.get("operation") or "online_redirect",
                "state": "draft",
                "bambus_mobile_app_id": ctx["app_id"],
                "bambus_mobile_idempotency_key": ctx["idem"],
                "bambus_gateway_order_id": data.get("gateway_order_id"),
                "bambus_saas_tenant_id": tenant.id if tenant else False,
                "bambus_invoice_id": invoice.id,
                "bambus_mobile_request_json": data,
            })

        if tx.state in ("done", "error", "cancel") and tx.bambus_mobile_response_json:
            return request.make_json_response(tx.bambus_mobile_response_json)
        write_vals = {
            "bambus_gateway_status": gateway_status,
            "bambus_gateway_order_id": data.get("gateway_order_id") or tx.bambus_gateway_order_id,
            "bambus_mobile_request_json": data,
        }
        if gateway_transaction_id:
            write_vals["bambus_gateway_transaction_id"] = gateway_transaction_id
        tx.write(write_vals)

        if gateway_status in successful_statuses:
            invoice = tx.bambus_invoice_id
            if invoice.state == "draft":
                invoice.action_post()
            if not tx.bambus_payment_id:
                journal = self._mobile_payment_journal(data, request.env.company)
                if not journal:
                    return self._error(400, "payment_journal_missing", "Configure a bank or cash journal for mobile payments")
                payment = request.env["account.payment"].sudo().create({
                    "payment_type": "inbound",
                    "partner_type": "customer",
                    "partner_id": tx.partner_id.id,
                    "amount": tx.amount,
                    "currency_id": tx.currency_id.id,
                    "journal_id": journal.id,
                    "payment_method_line_id": journal.inbound_payment_method_line_ids[:1].id,
                    "ref": "%s %s" % (provider.code, gateway_transaction_id),
                })
                payment.action_post()
                self._reconcile_mobile_payment(invoice, payment)
                tx.write({"bambus_payment_id": payment.id})
            if invoice and tx.bambus_saas_tenant_id:
                tx.bambus_saas_tenant_id._apply_paid_invoice(invoice)
            tx.write({
                "bambus_gateway_captured_at": fields.Datetime.now(),
                "bambus_gateway_failure_code": False,
                "bambus_gateway_failure_message": False,
                "bambus_gateway_failed_at": False,
            })
            self._set_mobile_tx_state(tx, "done")
        elif gateway_status in ("pending", "authorized", "processing"):
            self._set_mobile_tx_state(tx, "pending")
        elif gateway_status in ("failed", "failure", "error", "declined", "rejected"):
            tx.write({
                "bambus_gateway_failure_code": data.get("failure_code") or data.get("error_code"),
                "bambus_gateway_failure_message": data.get("failure_message") or data.get("error_message") or "Mobile gateway payment failed",
                "bambus_gateway_failed_at": fields.Datetime.now(),
            })
            self._set_mobile_tx_state(tx, "error", tx.bambus_gateway_failure_message)
        else:
            tx.write({
                "bambus_gateway_failure_code": data.get("failure_code") or gateway_status,
                "bambus_gateway_failure_message": data.get("failure_message") or "Mobile gateway payment was cancelled",
                "bambus_gateway_failed_at": fields.Datetime.now(),
            })
            self._set_mobile_tx_state(tx, "cancel")

        resp = self._payment_json_response(tx)
        tx.write({"bambus_mobile_response_json": resp})
        return request.make_json_response(resp)

    def _password_reset_html_response(self, title, body, status=200):
        html = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title}</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; }}
    .wrap {{ max-width: 440px; margin: 48px auto; background: #fff; padding: 28px; border-radius: 12px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12); }}
    h1 {{ font-size: 24px; margin: 0 0 18px; }}
    label {{ display: block; font-weight: 600; margin: 14px 0 6px; }}
    input {{ box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; }}
    button {{ margin-top: 20px; width: 100%; border: 0; border-radius: 8px; background: #714b67; color: #fff; padding: 12px; font-size: 16px; cursor: pointer; }}
    .message {{ line-height: 1.5; }}
    .error {{ color: #b91c1c; }}
    .success {{ color: #166534; }}
  </style>
</head>
<body><div class="wrap"><h1>{title}</h1>{body}</div></body>
</html>
""".format(title=escape(title), body=body)
        return request.make_response(html, headers=[("Content-Type", "text/html; charset=utf-8")], status=status)


    def _password_reset_min_length(self):
        raw_value = request.env["ir.config_parameter"].sudo().get_param(
            "bambus_mobile_api.password_reset_min_length",
            "0",
        )
        try:
            return max(int(raw_value or 0), 0)
        except (TypeError, ValueError):
            return 0

    def _password_reset_requires_otp(self, token, request_uid):
        if not token or not request_uid:
            return False
        token_hash = hashlib.sha256(str(token).encode()).hexdigest()
        rec = request.env["bambus.mobile.password.reset.request"].sudo().search([
            ("request_uid", "=", request_uid),
            ("reset_token_hash", "=", token_hash),
            ("used", "=", False),
        ], limit=1)
        return bool(rec and rec.otp_required and rec.expires_at >= fields.Datetime.now())

    def _password_reset_form(self, token, request_uid):
        if not token or not request_uid:
            return self._password_reset_html_response(
                "Invalid reset link",
                '<p class="message error">This password reset link is missing required information.</p>',
                status=400,
            )
        min_length = self._password_reset_min_length()
        minlength_attr = ' minlength="%s"' % min_length if min_length else ""
        help_text = (
            '<p class="message">Password must be at least %s characters.</p>' % min_length
            if min_length
            else '<p class="message">Choose any password you prefer.</p>'
        )
        otp_required = self._password_reset_requires_otp(token, request_uid)
        otp_field = ""
        if otp_required:
            otp_field = """
  <label for="otp_code">OTP code</label>
  <input id="otp_code" name="otp_code" type="text" inputmode="numeric" autocomplete="one-time-code" required/>
"""
        body = """
<form method="post" action="/mobile/password/reset/confirm">
  <input type="hidden" name="token" value="{token}"/>
  <input type="hidden" name="request_uid" value="{request_uid}"/>
  {help_text}
  {otp_field}
  <label for="new_password">New password</label>
  <input id="new_password" name="new_password" type="password"{minlength_attr} required autofocus/>
  <label for="confirm_password">Confirm password</label>
  <input id="confirm_password" name="confirm_password" type="password"{minlength_attr} required/>
  <button type="submit">Reset Password</button>
</form>
""".format(
            token=escape(token),
            request_uid=escape(request_uid),
            minlength_attr=minlength_attr,
            help_text=help_text,
            otp_field=otp_field,
        )
        return self._password_reset_html_response("Reset Password", body)

    def _confirm_password_reset(self, raw_token, request_uid, new_password, html_response=False, confirm_password=None, otp_code=None):
        if not raw_token or not request_uid or not new_password:
            if html_response:
                return self._password_reset_html_response(
                    "Missing information",
                    '<p class="message error">Token, request id and new password are required.</p>',
                    status=400,
                )
            return self._error(400, "missing_fields", "token, request_uid and new_password are required")
        if confirm_password is not None and new_password != confirm_password:
            if html_response:
                return self._password_reset_html_response(
                    "Passwords do not match",
                    '<p class="message error">Please enter the same password in both fields.</p>',
                    status=400,
                )
            return self._error(400, "password_mismatch", "Passwords do not match")
        min_length = self._password_reset_min_length()
        if min_length and len(new_password) < min_length:
            message = "Password must be at least %s characters" % min_length
            if html_response:
                return self._password_reset_html_response(
                    "Weak password",
                    '<p class="message error">%s.</p>' % escape(message),
                    status=400,
                )
            return self._error(400, "weak_password", message)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_req = request.env["bambus.mobile.password.reset.request"].sudo().search([
            ("request_uid", "=", request_uid),
            ("reset_token_hash", "=", token_hash),
            ("used", "=", False),
        ], limit=1)
        if not reset_req or reset_req.expires_at < fields.Datetime.now():
            if html_response:
                return self._password_reset_html_response(
                    "Invalid or expired link",
                    '<p class="message error">This password reset link is invalid or expired. Please request a new one.</p>',
                    status=400,
                )
            return self._error(400, "invalid_or_expired_token", "Reset token is invalid or expired")
        if reset_req.otp_required:
            if not otp_code:
                if html_response:
                    return self._password_reset_html_response(
                        "OTP required",
                        '<p class="message error">OTP verification is required to reset this password.</p>',
                        status=400,
                    )
                return self._error(400, "otp_required", "OTP verification is required")
            if reset_req.otp_hash != self._hash_otp(otp_code):
                reset_req.write({"otp_attempt_count": reset_req.otp_attempt_count + 1})
                if html_response:
                    return self._password_reset_html_response(
                        "Invalid OTP",
                        '<p class="message error">OTP is invalid or expired.</p>',
                        status=400,
                    )
                return self._error(400, "invalid_or_expired_otp", "OTP is invalid or expired")
        tenant = reset_req.tenant_id
        try:
            payload = {
                "db_name": tenant.db_name,
                "odoo_version": tenant.odoo_version,
                "admin_login": tenant.admin_login or reset_req.normalized_email,
                "admin_password": new_password,
                "customer_name": tenant.customer_name or (reset_req.partner_id and reset_req.partner_id.name),
            }
            tenant._backend_request_json("POST", "/tenants/admin-password/reset", payload)
        except Exception:
            if html_response:
                return self._password_reset_html_response(
                    "Password reset failed",
                    '<p class="message error">Failed to reset tenant password. Please contact support.</p>',
                    status=500,
                )
            return self._error(500, "password_reset_failed", "Failed to reset tenant password")
        reset_req.write({"used": True})
        if html_response:
            return self._password_reset_html_response(
                "Password reset successful",
                '<p class="message success">Your tenant password has been reset successfully. You can now sign in with the new password.</p>',
            )
        return request.make_json_response({"status": "success"})

    def _hash_otp(self, otp_code):
        return hashlib.sha256(str(otp_code or "").strip().encode()).hexdigest()

    def _tenant_identity_domain(self, partner=None, email=None, phone=None, mobile_app=None):
        identity_domain = []
        if partner:
            identity_domain.append(("partner_id", "=", partner.id))
        if email:
            identity_domain.append(("customer_email", "=", email))
        if phone:
            identity_domain.append(("customer_phone", "=", phone))
        if not identity_domain:
            return []
        domain = [("status", "!=", "deleting")]
        if mobile_app:
            domain.append(("mobile_app_id", "=", mobile_app.id))
        return domain + ["|"] * (len(identity_domain) - 1) + identity_domain

    def _find_tenant_for_identity(self, partner=None, email=None, phone=None, mobile_app=None, limit=1):
        domain = self._tenant_identity_domain(
            partner=partner,
            email=email,
            phone=phone,
            mobile_app=mobile_app,
        )
        print(domain,"domain otp req")
        if not domain:
            return request.env["bambus.saas.tenant"].sudo().browse()
        return request.env["bambus.saas.tenant"].sudo().search(domain, limit=limit)

    def _find_partner_for_identity(self, email=None, phone=None):
        identity_domain = []
        if email:
            identity_domain.append(("bambus_normalized_email", "=", email))
        if phone:
            identity_domain.append(("bambus_normalized_phone", "=", phone))
        if not identity_domain:
            return request.env["res.partner"].sudo().browse()
        domain = ["|"] * (len(identity_domain) - 1) + identity_domain
        return request.env["res.partner"].sudo().search(domain, limit=1)

    def _tenant_not_found_response(self, email=None, phone=None):
        message = "No tenant found for this email. Please register or contact support."
        if phone and not email:
            message = "No tenant found for this phone number. Please register or contact support."
        elif phone and email:
            message = "No tenant found for this email or phone number. Please register or contact support."
        return self._error(404, "tenant_not_found", message)

    def _fixed_otp_code(self):
        icp = request.env["ir.config_parameter"].sudo()
        enabled = icp.get_param("bambus_mobile_api.fixed_otp_enabled", "False").lower() == "true"
        code = (icp.get_param("bambus_mobile_api.fixed_otp_code") or "").strip()
        return code if enabled and code else None

    def _verify_otp_if_required(self, purpose, data, app_id):
        icp = request.env["ir.config_parameter"].sudo()
        required = icp.get_param(
            "bambus_mobile_api.registration_otp_required" if purpose == "registration" else "bambus_mobile_api.login_otp_required",
            "False",
        ).lower() == "true"
        if not required:
            return None
        otp_request_uid = data.get("otp_request_uid")
        otp_code = str(data.get("otp_code") or "").strip()
        fixed_otp = self._fixed_otp_code() if purpose in ("registration", "login") else None
        if fixed_otp and otp_code == fixed_otp:
            return None
        if not otp_request_uid or not otp_code:
            return self._error(400, "otp_required", "OTP verification is required")
        email = request.env["res.partner"]._normalize_email(data.get("email"))
        phone = request.env["res.partner"]._normalize_phone(data.get("phone"), data.get("country_code"))
        rec = request.env["bambus.mobile.otp.request"].sudo().search([
            ("request_uid", "=", otp_request_uid),
            ("purpose", "=", purpose),
            ("app_id", "=", app_id),
            ("used", "=", False),
        ], limit=1)
        if not rec or rec.expires_at < fields.Datetime.now():
            return self._error(400, "invalid_or_expired_otp", "OTP is invalid or expired")
        if rec.normalized_email and rec.normalized_email != email:
            return self._error(400, "otp_identity_mismatch", "OTP was requested for a different email")
        if rec.normalized_phone and rec.normalized_phone != phone:
            return self._error(400, "otp_identity_mismatch", "OTP was requested for a different phone")
        if not rec.normalized_email and not rec.normalized_phone:
            return self._error(400, "invalid_or_expired_otp", "OTP is invalid or expired")
        if rec.otp_hash != self._hash_otp(otp_code):
            rec.write({"attempt_count": rec.attempt_count + 1})
            return self._error(400, "invalid_or_expired_otp", "OTP is invalid or expired")
        rec.write({"verified": True, "used": True})
        return None

    @http.route('/mobile/login/device', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_login_device(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/login/device')
        if err:
            return err
        p = request.env["res.partner"].sudo()
        email = p._normalize_email(data.get("email"))
        phone = p._normalize_phone(data.get("phone"), data.get("country_code"))
        tenant_uid = (data.get("tenant_uid") or data.get("saas_master_uid") or "").strip()
        otp_err = self._verify_otp_if_required("login", data, ctx["app_id"])
        if otp_err:
            return otp_err
        tenant_model = request.env["bambus.saas.tenant"].sudo()
        partner = self._find_partner_for_identity(email=email, phone=phone)
        if tenant_uid:
            tenants = tenant_model.search([
                ("saas_master_uid", "=", tenant_uid),
                ("mobile_app_id", "=", ctx["app"].id),
                ("status", "!=", "deleting"),
            ], limit=1)
            partner = tenants.partner_id or partner
        else:
            tenants = self._find_tenant_for_identity(
                partner=partner, email=email, phone=phone, mobile_app=ctx["app"], limit=None
            )
        self._record_device(data, ctx["app_id"], "login", partner, tenants)
        return request.make_json_response({"status": "recorded", "tenants": [self._tenant_payload(t, include_license=True) for t in tenants]})

    @http.route('/mobile/tenants/lookup', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_tenants_lookup(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/tenants/lookup')
        if err:
            return err
        p = request.env["res.partner"].sudo()
        email = p._normalize_email(data.get("email"))
        phone = p._normalize_phone(data.get("phone"), data.get("country_code"))
        tenant_uid = (data.get("tenant_uid") or data.get("saas_master_uid") or "").strip()
        tenant_model = request.env["bambus.saas.tenant"].sudo()
        partner = self._find_partner_for_identity(email=email, phone=phone)
        if tenant_uid:
            tenants = tenant_model.search([
                ("saas_master_uid", "=", tenant_uid),
                ("mobile_app_id", "=", ctx["app"].id),
                ("status", "!=", "deleting"),
            ], limit=1)
            partner = tenants.partner_id or partner
        else:
            tenants = self._find_tenant_for_identity(
                partner=partner, email=email, phone=phone, mobile_app=ctx["app"], limit=None
            )
        self._record_device(data, ctx["app_id"], "tenant_lookup", partner, tenants)
        return request.make_json_response({"status": "success", "tenants": [self._tenant_payload(t, True) for t in tenants], "todo": "Add OTP verification before production rollout"})

    def _mobile_address_vals(self, data):
        vals = {}
        mapping = {
            "street": ("street", "customer_street"),
            "street2": ("street2", "customer_street2"),
            "city": ("city", "customer_city"),
            "zip": ("zip", "customer_zip"),
            "website": ("website", "customer_website"),
            "vat": ("vat", "customer_vat"),
        }
        for target, keys in mapping.items():
            for key in keys:
                value = data.get(key)
                if value:
                    vals[target] = str(value).strip()
                    break
        country_code = (data.get("country_code") or data.get("customer_country_code") or "").strip().upper()
        country = request.env["res.country"].sudo().search([("code", "=", country_code)], limit=1) if country_code else None
        if country:
            vals["country_id"] = country.id
        state_name = (data.get("state") or data.get("customer_state") or "").strip()
        if state_name:
            domain = [("name", "ilike", state_name)]
            if country:
                domain.append(("country_id", "=", country.id))
            state = request.env["res.country.state"].sudo().search(domain, limit=1)
            if state:
                vals["state_id"] = state.id
        return vals

    @http.route('/mobile/tenant/address/update', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_tenant_address_update(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/tenant/address/update')
        if err:
            return err
        p = request.env["res.partner"].sudo()
        email = p._normalize_email(data.get("email"))
        phone = p._normalize_phone(data.get("phone"), data.get("country_code"))
        tenant_model = request.env["bambus.saas.tenant"].sudo()
        tenant_uid = (data.get("tenant_uid") or data.get("saas_master_uid") or "").strip()
        tenant = tenant_model.browse()
        if tenant_uid:
            tenant = tenant_model.search([
                ("saas_master_uid", "=", tenant_uid),
                ("mobile_app_id", "=", ctx["app"].id),
                ("status", "!=", "deleting"),
            ], limit=1)
        elif data.get("tenant_id"):
            tenant = tenant_model.search([
                ("id", "=", int(data["tenant_id"])),
                ("mobile_app_id", "=", ctx["app"].id),
                ("status", "!=", "deleting"),
            ], limit=1)
        elif data.get("tenant_db_name") or data.get("db_name"):
            tenant = tenant_model.search([
                ("db_name", "=", data.get("tenant_db_name") or data.get("db_name")),
                ("mobile_app_id", "=", ctx["app"].id),
                ("status", "!=", "deleting"),
            ], limit=1)
        if not tenant:
            tenants = self._find_tenant_for_identity(
                partner=self._find_partner_for_identity(email=email, phone=phone),
                email=email,
                phone=phone,
                mobile_app=ctx["app"],
                limit=1,
            )
            tenant = tenants[:1]
        if not tenant:
            return self._tenant_not_found_response(email=email, phone=phone)
        partner = tenant.partner_id
        if email and partner and partner.email and p._normalize_email(partner.email) != email:
            return self._error(403, "tenant_identity_mismatch", "Submitted email does not match this tenant")
        if phone and partner:
            partner_phone = p._normalize_phone(partner.phone or partner.mobile, data.get("country_code"))
            if partner_phone and partner_phone != phone:
                return self._error(403, "tenant_identity_mismatch", "Submitted phone does not match this tenant")

        tenant_vals = {}
        if data.get("company_name"):
            tenant_vals["company_name"] = data.get("company_name")
            tenant_vals["name"] = data.get("company_name")
        if data.get("customer_name"):
            tenant_vals["customer_name"] = data.get("customer_name")
        if email:
            tenant_vals["customer_email"] = email
        if phone:
            tenant_vals["customer_phone"] = phone
        if tenant_vals:
            tenant.write(tenant_vals)

        partner_vals = self._mobile_address_vals(data)
        if data.get("customer_name"):
            partner_vals["name"] = data.get("customer_name")
        if data.get("company_name") and partner and partner.company_type == "company":
            partner_vals["name"] = data.get("company_name")
        if email:
            partner_vals["email"] = email
        if phone:
            partner_vals["phone"] = phone
        if partner and partner_vals:
            partner.write(partner_vals)

        tenant.action_update_tenant_address()
        self._record_device(data, ctx["app_id"], "address_update", partner, tenant)
        return request.make_json_response({"status": "updated", "tenant": self._tenant_payload(tenant, include_license=True)})

    @http.route('/mobile/app/install', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_app_install(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/app/install')
        if err:
            return err
        self._record_device(data, ctx["app_id"], "install")
        return request.make_json_response({"status": "recorded"})

    @http.route('/mobile/password/reset/request', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_password_reset_request(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/password/reset/request')
        if err:
            return err
        p = request.env["res.partner"].sudo()
        email = p._normalize_email(data.get("email"))
        phone = p._normalize_phone(data.get("phone"), data.get("country_code"))
        if not email and not phone:
            return self._error(400, "missing_identity", "Email or phone is required")
        partner = self._find_partner_for_identity(email=email, phone=phone)
        tenants = self._find_tenant_for_identity(
            partner=partner, email=email, phone=phone, mobile_app=ctx["app"], limit=1
        )
        if not tenants:
            return self._tenant_not_found_response(email=email, phone=phone)
        icp = request.env["ir.config_parameter"].sudo()
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        exp_mins = int(icp.get_param("bambus_mobile_api.password_reset_token_expiry_minutes", "15"))
        otp_enabled = icp.get_param("bambus_mobile_api.password_reset_otp_enabled", "False").lower() == "true"
        otp_provider = icp.get_param("bambus_mobile_api.otp_provider", "email")
        if otp_enabled and otp_provider != "email":
            return self._error(500, "password_reset_otp_provider_not_supported", "Only email OTP is supported for password reset")
        if otp_enabled and not email:
            return self._error(400, "email_required", "Email is required for password reset OTP")
        otp = str(secrets.randbelow(900000) + 100000) if otp_enabled else ""
        reset_partner = partner or tenants.partner_id
        reset_req = request.env["bambus.mobile.password.reset.request"].sudo().create({
            "partner_id": reset_partner.id if reset_partner else False,
            "tenant_id": tenants.id,
            "normalized_email": email,
            "normalized_phone": phone,
            "reset_token_hash": token_hash,
            "expires_at": fields.Datetime.now() + timedelta(minutes=exp_mins),
            "otp_required": otp_enabled,
            "otp_hash": self._hash_otp(otp) if otp_enabled else False,
            "requested_ip": request.httprequest.remote_addr,
            "requested_user_agent": request.httprequest.headers.get("User-Agent"),
        })
        base = self._get_base_url()
        reset_link = f"{base}/mobile/password/reset/confirm?token={quote_plus(raw_token)}&rid={reset_req.request_uid}"
        email_to = email or (reset_partner and reset_partner.email)
        if email_to:
            otp_html = f"<p>Your OTP is <b>{otp}</b>.</p>" if otp_enabled and otp_provider == "email" else ""
            request.env["mail.mail"].sudo().create({
                "subject": "Bambus Tenant Password Reset",
                "email_to": email_to,
                "body_html": f"<p>Click to reset your password (valid {exp_mins} mins):</p><p><a href='{reset_link}'>{reset_link}</a></p>{otp_html}",
            }).send()
        return request.make_json_response({"status": "accepted", "message": "If account exists, reset link will be sent"})


    @http.route('/mobile/otp/request', type='http', auth='public', methods=['POST'], csrf=False)
    def mobile_otp_request(self, **kwargs):
        data, ctx, err = self._verify_and_parse('/mobile/otp/request')
        if err:
            return err
        purpose = data.get("purpose")
        if purpose not in ("registration", "login", "password_reset"):
            return self._error(400, "invalid_purpose", "purpose must be registration, login or password_reset")
        p = request.env["res.partner"].sudo()
        email = p._normalize_email(data.get("email"))
        phone = p._normalize_phone(data.get("phone"), data.get("country_code"))
        if not email and not phone:
            return self._error(400, "missing_identity", "Email or phone is required")
        partner = self._find_partner_for_identity(email=email, phone=phone)
        tenants = self._find_tenant_for_identity(
            partner=partner, email=email, phone=phone, mobile_app=ctx["app"], limit=1
        )
        if purpose in ("login", "password_reset") and not tenants:
            return self._tenant_not_found_response(email=email, phone=phone)
        provider = request.env["ir.config_parameter"].sudo().get_param("bambus_mobile_api.otp_provider", "email")
        if provider != "email":
            return self._error(500, "otp_provider_not_supported", "Only email OTP is supported")
        if not email:
            return self._error(400, "email_required", "Email is required for email OTP")
        fixed_otp = self._fixed_otp_code() if purpose in ("registration", "login") else None
        otp = fixed_otp or str(secrets.randbelow(900000) + 100000)
        exp_mins = int(request.env["ir.config_parameter"].sudo().get_param("bambus_mobile_api.otp_expiry_minutes", "10"))
        rec = request.env["bambus.mobile.otp.request"].sudo().create({
            "purpose": purpose,
            "normalized_email": email or False,
            "normalized_phone": phone or False,
            "otp_hash": self._hash_otp(otp),
            "expires_at": fields.Datetime.now() + timedelta(minutes=exp_mins),
            "app_id": ctx["app_id"],
        })
        request.env["mail.mail"].sudo().create({"subject": "Bambus Mobile OTP", "email_to": email, "body_html": f"<p>Your OTP is <b>{otp}</b>. Valid for {exp_mins} minutes.</p>"}).send()
        return request.make_json_response({"status": "sent", "otp_request_uid": rec.request_uid, "expires_in_minutes": exp_mins, "fixed_otp": bool(fixed_otp)})

    @http.route('/mobile/password/reset/confirm', type='http', auth='public', methods=['GET', 'POST'], csrf=False)
    def mobile_password_reset_confirm(self, **kwargs):
        if request.httprequest.method == "GET":
            return self._password_reset_form(
                request.httprequest.args.get("token"),
                request.httprequest.args.get("rid") or request.httprequest.args.get("request_uid"),
            )

        content_type = request.httprequest.headers.get("Content-Type") or ""
        if "application/json" not in content_type:
            return self._confirm_password_reset(
                request.params.get("token"),
                request.params.get("request_uid") or request.params.get("rid"),
                request.params.get("new_password"),
                html_response=True,
                confirm_password=request.params.get("confirm_password"),
                otp_code=request.params.get("otp_code"),
            )

        data, ctx, err = self._verify_and_parse('/mobile/password/reset/confirm')
        if err:
            return err
        return self._confirm_password_reset(
            data.get("token"),
            data.get("request_uid") or data.get("rid"),
            data.get("new_password"),
            otp_code=data.get("otp_code"),
        )
