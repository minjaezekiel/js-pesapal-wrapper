import fetch from "node-fetch";
import crypto from "crypto";

/**
 * Custom error class for Pesapal API errors
 */
class PesapalError extends Error {
  constructor(message, statusCode, response) {
    super(message);
    this.name = "PesapalError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Configuration class for Pesapal API
 */
class PesapalConfig {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.consumerKey - Pesapal consumer key
   * @param {string} options.consumerSecret - Pesapal consumer secret
   * @param {string} options.callbackBaseUrl - Base URL for callbacks
   * @param {string} [options.env="sandbox"] - Environment (sandbox or production)
   * @param {Object} [options.logger=console] - Logger instance
   * @param {number} [options.retryAttempts=3] - Number of retry attempts for failed requests
   * @param {number} [options.retryDelay=1000] - Delay between retries in milliseconds
   */
  constructor(options) {
    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.callbackBaseUrl = options.callbackBaseUrl;
    this.env = options.env || "sandbox";
    this.logger = options.logger || console;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    if (!this.consumerKey || !this.consumerSecret || !this.callbackBaseUrl) {
      throw new Error("Missing required configuration parameters");
    }
  }

  /**
   * Get the base URL for the API based on environment
   * @returns {string} Base URL
   */
  getBaseUrl() {
    return this.env === "sandbox"
      ? "https://cybqa.pesapal.com/pesapalv3/api"
      : "https://pay.pesapal.com/v3/api";
  }
}

/**
 * Logger utility for consistent logging
 */
class Logger {
  constructor(logger = console, debug = false) {
    this.logger = logger;
    this.debug = debug;
  }

  log(...args) {
    this.logger.log(...args);
  }

  error(...args) {
    this.logger.error(...args);
  }

  warn(...args) {
    this.logger.warn(...args);
  }

  debug(...args) {
    if (this.debug) {
      this.logger.debug(...args);
    }
  }
}

/**
 * HTTP client for making API requests with retry logic
 */
class HttpClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async request(url, options) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.logger.debug(`Attempt ${attempt}: ${options.method || 'GET'} ${url}`);
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new PesapalError(
            `Request failed: ${errorText}`,
            response.status,
            response
          );
        }
        
        const data = await response.json();
        this.logger.debug(`Request successful: ${JSON.stringify(data)}`);
        return data;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Delay execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main Pesapal API wrapper class
 */
class PesapalAPI {
  /**
   * Create a new PesapalAPI instance
   * @param {Object} options - Configuration options
   * @param {string} options.consumerKey - Pesapal consumer key
   * @param {string} options.consumerSecret - Pesapal consumer secret
   * @param {string} options.callbackBaseUrl - Base URL for callbacks
   * @param {string} [options.env="sandbox"] - Environment (sandbox or production)
   * @param {Object} [options.logger=console] - Logger instance
   * @param {boolean} [options.debug=false] - Enable debug logging
   * @param {number} [options.retryAttempts=3] - Number of retry attempts for failed requests
   * @param {number} [options.retryDelay=1000] - Delay between retries in milliseconds
   */
  constructor(options) {
    this.config = new PesapalConfig(options);
    this.logger = new Logger(this.config.logger, options.debug || false);
    this.httpClient = new HttpClient(this.config, this.logger);
    this.token = null;
    this.tokenExpiry = null;
    
    this.logger.log(`PesapalAPI initialized in ${this.config.env.toUpperCase()} mode`);
  }

  /**
   * 🔑 Step 1: Get OAuth token 
   * @returns {Promise<string>} OAuth token
   */
  async requestToken() {
    const url = `${this.config.getBaseUrl()}/Auth/RequestToken`;
    const payload = {
      consumer_key: this.config.consumerKey,
      consumer_secret: this.config.consumerSecret,
    };

    const data = await this.httpClient.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    this.token = data.token;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000; // refresh 5 mins early
    this.logger.log("✅ Token retrieved successfully");

    return data.token;
  }

  /**
   * 🔄 Step 2: Ensure Token Validity
   * @returns {Promise<string>} Valid OAuth token
   */
  async ensureToken() {
    if (!this.token || Date.now() > this.tokenExpiry) {
      await this.requestToken();
    }
    return this.token;
  }

  /**
   * 🧾 Step 3: Register IPN URL
   * @param {string} notificationUrl - URL to receive notifications
   * @param {string} [name="DefaultIPN"] - Name for the IPN
   * @returns {Promise<Object>} IPN registration response
   */
  async registerIPN(notificationUrl, name = "DefaultIPN") {
    if (!notificationUrl || typeof notificationUrl !== 'string') {
      throw new Error("Invalid notification URL");
    }

    const token = await this.ensureToken();
    const url = `${this.config.getBaseUrl()}/URLSetup/RegisterIPN`;
    const payload = {
      url: notificationUrl,
      ipn_notification_type: "POST",
      ipn_notification_name: name,
    };

    const data = await this.httpClient.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    this.logger.log("✅ IPN registered:", data);
    return data;
  }

  /**
   * 💳 Step 4: Submit Order
   * @param {Object} options - Order options
   * @param {string} options.notificationId - IPN notification ID
   * @param {number} options.amount - Order amount
   * @param {string} [options.currency="KES"] - Currency code
   * @param {string} options.description - Order description
   * @param {Object} options.billingInfo - Billing information
   * @param {string} [options.id] - Custom order ID (auto-generated if not provided)
   * @param {string} [options.callbackUrl] - Custom callback URL
   * @param {string} [options.cancellationUrl] - Custom cancellation URL
   * @param {string} [options.branch="Main Branch"] - Branch name
   * @returns {Promise<Object>} Order submission response
   */
  async submitOrder({
    notificationId,
    amount,
    currency = "KES",
    description,
    billingInfo,
    id,
    callbackUrl,
    cancellationUrl,
    branch = "Main Branch"
  }) {
    // Input validation
    if (!notificationId || !amount || !description || !billingInfo) {
      throw new Error("Missing required order parameters");
    }

    if (isNaN(parseFloat(amount))) {
      throw new Error("Amount must be a valid number");
    }

    const token = await this.ensureToken();
    const url = `${this.config.getBaseUrl()}/Transactions/SubmitOrderRequest`;

    const payload = {
      id: id || "ORDER-" + Date.now(),
      currency,
      amount: parseFloat(amount),
      description,
      callback_url: callbackUrl || `${this.config.callbackBaseUrl}/payment-complete`,
      cancellation_url: cancellationUrl || `${this.config.callbackBaseUrl}/cancel`,
      notification_id: notificationId,
      branch,
      billing_address: billingInfo,
    };

    const data = await this.httpClient.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    this.logger.log("✅ Order submitted:", data);
    return data;
  }

  /**
   * 🔍 Step 5: Get Transaction Status
   * @param {string} orderTrackingId - Order tracking ID
   * @returns {Promise<Object>} Transaction status
   */
  async getTransactionStatus(orderTrackingId) {
    if (!orderTrackingId || typeof orderTrackingId !== 'string') {
      throw new Error("Invalid order tracking ID");
    }

    const token = await this.ensureToken();
    const url = `${this.config.getBaseUrl()}/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`;

    const data = await this.httpClient.request(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    this.logger.log("✅ Transaction status:", data);
    return data;
  }

  /**
   * 🛡️ Step 6: Verify IPN Signature (authenticity check)
   * @param {Object} req - Request object
   * @param {Object} req.headers - Request headers
   * @param {Object} req.body - Request body
   * @returns {boolean} Whether the signature is valid
   */
  verifyIPNSignature(req) {
    const signatureHeader = req.headers["x-pesapal-signature"];
    const rawBody = JSON.stringify(req.body);

    if (!signatureHeader) {
      this.logger.warn("⚠️ Missing X-Pesapal-Signature header");
      return false;
    }

    // Compute HMAC digest
    const computedSignature = crypto
      .createHmac("sha256", this.config.consumerSecret)
      .update(rawBody)
      .digest("hex");

    const valid = computedSignature === signatureHeader;
    if (!valid) {
      this.logger.warn("❌ Invalid IPN signature detected");
    }

    return valid;
  }

  /**
   * ✅ Middleware: Verify incoming IPN requests in Express
   * @returns {Function} Express middleware function
   */
  ipnMiddleware() {
    return (req, res, next) => {
      try {
        if (!this.verifyIPNSignature(req)) {
          return res.status(401).json({ error: "Invalid IPN signature" });
        }
        next();
      } catch (error) {
        this.logger.error("IPN verification failed:", error);
        res.status(400).json({ error: "Malformed IPN request" });
      }
    };
  }
}

export default PesapalAPI;
export { PesapalError, PesapalConfig, Logger, HttpClient };