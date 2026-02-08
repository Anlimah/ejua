const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { PaymentError, ExternalServiceError } = require('@ejua/shared');

/**
 * Paystack API client.
 *
 * Paystack handles MoMo (MTN, Vodafone, AirtelTigo), card payments,
 * bank transfers, and disbursements through a single unified API.
 * This is much cleaner than integrating each MoMo provider separately.
 *
 * Docs: https://paystack.com/docs/api
 */
class PaystackProvider {
  constructor() {
    this.baseUrl = config.paystack.apiUrl;
    this.secretKey = config.paystack.secretKey;
    this.callbackUrl = config.paystack.callbackUrl;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  // ─── TRANSACTION INITIALIZATION ──────────────

  /**
   * Initialize a payment transaction.
   * Returns an authorization_url that the customer is redirected to.
   *
   * For MoMo: Paystack shows a charge page where the customer enters their number.
   * For cards: Paystack shows a card form.
   *
   * @param {Object} params
   * @param {string} params.email - Customer email (required by Paystack)
   * @param {number} params.amount - Amount in pesewas (smallest unit)
   * @param {string} params.currency - GHS, NGN, USD
   * @param {string} params.reference - Unique order reference
   * @param {string} [params.callbackUrl] - Override callback URL
   * @param {Object} [params.metadata] - Extra data returned in webhook
   * @param {string[]} [params.channels] - Payment channels: ['mobile_money', 'card', 'bank']
   * @returns {{ authorization_url, access_code, reference }}
   */
  async initializeTransaction({
    email,
    amount,
    currency = 'GHS',
    reference,
    callbackUrl,
    metadata = {},
    channels,
  }) {
    try {
      const payload = {
        email,
        amount, // Paystack expects amount in smallest unit (pesewas)
        currency,
        reference,
        callback_url: callbackUrl || this.callbackUrl,
        metadata: {
          ...metadata,
          custom_fields: [
            ...(metadata.custom_fields || []),
          ],
        },
      };

      // Restrict to specific channels if requested
      if (channels && channels.length > 0) {
        payload.channels = channels;
      }

      const { data } = await this.client.post('/transaction/initialize', payload);

      if (!data.status) {
        throw new PaymentError(`Paystack init failed: ${data.message}`, 'paystack');
      }

      logger.info({ reference, amount, currency }, 'Paystack transaction initialized');

      return {
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference,
      };
    } catch (err) {
      if (err instanceof PaymentError) throw err;
      logger.error({ err: err.message, reference }, 'Paystack init error');
      throw new ExternalServiceError('Paystack', err.response?.data?.message || err.message);
    }
  }

  // ─── TRANSACTION VERIFICATION ────────────────

  /**
   * Verify a transaction by reference.
   * Called after customer completes payment (via callback) or via webhook.
   *
   * @param {string} reference - Transaction reference
   * @returns {Object} Full transaction details including status, amount, channel
   */
  async verifyTransaction(reference) {
    try {
      const { data } = await this.client.get(`/transaction/verify/${encodeURIComponent(reference)}`);

      if (!data.status) {
        throw new PaymentError(`Verification failed: ${data.message}`, 'paystack');
      }

      const txn = data.data;

      logger.info({
        reference,
        status: txn.status,
        amount: txn.amount,
        channel: txn.channel,
        gateway_response: txn.gateway_response,
      }, 'Paystack transaction verified');

      return {
        reference: txn.reference,
        status: txn.status, // 'success', 'failed', 'abandoned'
        amount: txn.amount,
        currency: txn.currency,
        channel: txn.channel, // 'mobile_money', 'card', 'bank'
        gateway_response: txn.gateway_response,
        paid_at: txn.paid_at,
        ip_address: txn.ip_address,
        fees: txn.fees, // Paystack's fee in pesewas
        authorization: txn.authorization, // Card/MoMo auth details
        customer: txn.customer,
        metadata: txn.metadata,
      };
    } catch (err) {
      if (err instanceof PaymentError) throw err;
      logger.error({ err: err.message, reference }, 'Paystack verify error');
      throw new ExternalServiceError('Paystack', err.response?.data?.message || err.message);
    }
  }

  // ─── MOBILE MONEY CHARGE ─────────────────────

  /**
   * Directly charge a mobile money number.
   * Used for installment auto-deductions (retries).
   *
   * @param {Object} params
   * @param {string} params.email - Customer email
   * @param {number} params.amount - Amount in pesewas
   * @param {string} params.phone - MoMo number (e.g., +233201234567)
   * @param {string} params.provider - 'mtn', 'vod', 'tgo' (Vodafone, AirtelTigo)
   * @param {string} params.reference - Unique reference
   * @returns {Object} Charge response
   */
  async chargeMobileMoney({ email, amount, phone, provider = 'mtn', reference, currency = 'GHS' }) {
    try {
      const { data } = await this.client.post('/charge', {
        email,
        amount,
        currency,
        reference,
        mobile_money: {
          phone,
          provider, // 'mtn', 'vod', 'tgo'
        },
      });

      if (!data.status) {
        throw new PaymentError(`MoMo charge failed: ${data.message}`, 'paystack');
      }

      logger.info({ reference, phone: phone.slice(-4), provider }, 'MoMo charge initiated');

      return {
        reference: data.data.reference,
        status: data.data.status, // 'send_otp', 'pending', 'success'
        display_text: data.data.display_text,
      };
    } catch (err) {
      if (err instanceof PaymentError) throw err;
      logger.error({ err: err.message, reference }, 'MoMo charge error');
      throw new ExternalServiceError('Paystack', err.response?.data?.message || err.message);
    }
  }

  // ─── TRANSFERS (VENDOR PAYOUT) ───────────────

  /**
   * Create a transfer recipient (vendor's MoMo account).
   * Must be done once per vendor, then reuse the recipient_code.
   *
   * @param {Object} params
   * @returns {{ recipient_code, details }}
   */
  async createTransferRecipient({ name, phone, bankCode = 'MTN', currency = 'GHS' }) {
    try {
      const { data } = await this.client.post('/transferrecipient', {
        type: 'mobile_money',
        name,
        account_number: phone,
        bank_code: bankCode, // 'MTN', 'VOD', 'ATL'
        currency,
      });

      if (!data.status) {
        throw new PaymentError(`Recipient creation failed: ${data.message}`, 'paystack');
      }

      return {
        recipient_code: data.data.recipient_code,
        details: data.data.details,
      };
    } catch (err) {
      if (err instanceof PaymentError) throw err;
      throw new ExternalServiceError('Paystack', err.response?.data?.message || err.message);
    }
  }

  /**
   * Initiate a transfer (payout) to a vendor.
   *
   * @param {Object} params
   * @returns {{ transfer_code, reference, status }}
   */
  async initiateTransfer({ amount, recipientCode, reference, reason, currency = 'GHS' }) {
    try {
      const { data } = await this.client.post('/transfer', {
        source: 'balance',
        amount,
        recipient: recipientCode,
        reference,
        reason,
        currency,
      });

      if (!data.status) {
        throw new PaymentError(`Transfer failed: ${data.message}`, 'paystack');
      }

      logger.info({ reference, amount, recipientCode }, 'Transfer initiated');

      return {
        transfer_code: data.data.transfer_code,
        reference: data.data.reference,
        status: data.data.status,
      };
    } catch (err) {
      if (err instanceof PaymentError) throw err;
      throw new ExternalServiceError('Paystack', err.response?.data?.message || err.message);
    }
  }

  // ─── WEBHOOK SIGNATURE ───────────────────────

  /**
   * Verify Paystack webhook signature (HMAC-SHA512).
   */
  verifyWebhookSignature(body, signature) {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');
    return hash === signature;
  }

  // ─── UTILITIES ───────────────────────────────

  /**
   * Map Paystack channel to our PaymentMethod enum.
   */
  static mapChannel(channel, authorization) {
    if (channel === 'mobile_money') {
      const bank = (authorization?.bank || '').toLowerCase();
      if (bank.includes('mtn')) return 'momo_mtn';
      if (bank.includes('vodafone') || bank.includes('vod')) return 'momo_voda';
      if (bank.includes('airtel') || bank.includes('tigo')) return 'momo_airteltigo';
      return 'momo_mtn'; // default
    }
    if (channel === 'card') return 'card';
    return 'card';
  }
}

module.exports = new PaystackProvider();
