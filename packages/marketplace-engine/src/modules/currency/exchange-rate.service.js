const axios = require('axios');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const { CURRENCIES, toSmallestUnit, fromSmallestUnit, formatMoney } = require('@ejua/shared');

/**
 * Exchange rate service.
 *
 * Provides cross-currency conversion using rates fetched from a public API
 * and stored in the database for audit. Falls back to database rates if
 * the external API is unavailable (critical for offline-first African markets).
 *
 * Architecture:
 *   - Rates are cached in the `currencies` table (exchange_rate_to_usd)
 *   - A daily cron fetches fresh rates and stores history
 *   - Conversions use the USD pivot: FROM → USD → TO
 *   - Integer arithmetic throughout to avoid floating-point drift
 */
class ExchangeRateService {
  constructor() {
    this.db = getDb();
    // Free tier: https://open.er-api.com (no key needed for basic usage)
    this.apiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
    this.rateCache = null;
    this.cacheExpiry = null;
  }

  // ─── RATE FETCHING ───────────────────────────

  /**
   * Fetch fresh exchange rates from external API and update the database.
   * Should be called daily via cron.
   */
  async fetchAndStoreRates() {
    try {
      const { data } = await axios.get(this.apiUrl, { timeout: 10000 });

      if (data.result !== 'success') {
        throw new Error(`API returned: ${data.result}`);
      }

      const rates = data.rates;
      const fetchedAt = new Date();
      const updates = [];

      for (const [code, currency] of Object.entries(CURRENCIES)) {
        const rateFromUsd = rates[code];
        if (!rateFromUsd) continue;

        // exchange_rate_to_usd = how many USD per 1 unit of this currency
        const rateToUsd = 1 / rateFromUsd;

        // Update currencies table
        await this.db('currencies')
          .where({ code })
          .update({
            exchange_rate_to_usd: rateToUsd,
            rate_updated_at: fetchedAt,
          });

        // Store history
        await this.db('exchange_rate_history').insert({
          from_currency: code,
          to_currency: 'USD',
          rate: rateToUsd,
          source: 'openexchangerates',
          fetched_at: fetchedAt,
        });

        updates.push({ code, rateToUsd: rateToUsd.toFixed(8) });
      }

      // Invalidate cache
      this.rateCache = null;

      logger.info({ updates, source: 'openexchangerates' }, 'Exchange rates updated');
      return { updated: updates.length, rates: updates };
    } catch (err) {
      logger.error({ err: err.message }, 'Exchange rate fetch failed, using cached rates');
      return { updated: 0, error: err.message };
    }
  }

  // ─── RATE RETRIEVAL ──────────────────────────

  /**
   * Get the current exchange rate between two currencies.
   * Uses the USD pivot: FROM → USD → TO
   *
   * @param {string} from - Source currency code
   * @param {string} to - Target currency code
   * @returns {{ rate, inverse, from, to, updated_at }}
   */
  async getRate(from, to) {
    if (from === to) return { rate: 1, inverse: 1, from, to };

    const rates = await this._getRates();
    const fromRate = rates[from]; // FROM → USD
    const toRate = rates[to];     // TO → USD

    if (!fromRate || !toRate) {
      throw new Error(`Exchange rate not available for ${from} or ${to}`);
    }

    // FROM → USD → TO
    // If 1 GHS = 0.0625 USD and 1 NGN = 0.000625 USD
    // Then 1 GHS = 0.0625 / 0.000625 = 100 NGN
    const rate = fromRate / toRate;

    return {
      from,
      to,
      rate: parseFloat(rate.toFixed(8)),
      inverse: parseFloat((1 / rate).toFixed(8)),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get all exchange rates (cached with 1-hour TTL).
   */
  async _getRates() {
    if (this.rateCache && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      return this.rateCache;
    }

    const currencies = await this.db('currencies').where({ is_active: true });
    const rates = {};

    for (const c of currencies) {
      rates[c.code] = parseFloat(c.exchange_rate_to_usd);
    }

    this.rateCache = rates;
    this.cacheExpiry = Date.now() + 3600000; // 1 hour

    return rates;
  }

  // ─── CONVERSION ──────────────────────────────

  /**
   * Convert an amount from one currency to another.
   * All amounts are in smallest unit (pesewas, kobo, etc.)
   *
   * @param {number} amount - Amount in smallest unit of source currency
   * @param {string} from - Source currency code
   * @param {string} to - Target currency code
   * @returns {{ original, converted, rate, from, to, formatted }}
   */
  async convert(amount, from, to) {
    if (from === to) {
      return {
        original: amount,
        converted: amount,
        rate: 1,
        from, to,
        formatted: formatMoney(amount, to),
      };
    }

    const { rate } = await this.getRate(from, to);

    // Convert through human-readable amounts to handle different multipliers
    const fromCurrency = CURRENCIES[from];
    const toCurrency = CURRENCIES[to];

    const humanAmount = amount / fromCurrency.multiplier;
    const convertedHuman = humanAmount * rate;
    const converted = Math.round(convertedHuman * toCurrency.multiplier);

    return {
      original: amount,
      converted,
      rate,
      from, to,
      original_formatted: formatMoney(amount, from),
      converted_formatted: formatMoney(converted, to),
    };
  }

  /**
   * Convert any amount to USD equivalent (for consolidated reporting).
   */
  async convertToUsd(amount, from) {
    return this.convert(amount, from, 'USD');
  }

  // ─── HISTORY ─────────────────────────────────

  /**
   * Get exchange rate history for a currency pair.
   */
  async getRateHistory(from, to, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const history = await this.db('exchange_rate_history')
      .where({ from_currency: from, to_currency: to })
      .where('fetched_at', '>=', since)
      .orderBy('fetched_at', 'desc')
      .limit(days);

    return history;
  }
}

module.exports = new ExchangeRateService();
