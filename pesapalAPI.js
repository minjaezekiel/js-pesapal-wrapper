import fetch from "node-fetch";
import crypto from "crypto";
import NodeCache from "node-cache";

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
   * @param {boolean} [options.encryptTokens=false] - Whether to encrypt tokens in memory
   * @param {boolean} [options.useCache=true] - Whether to use caching for tokens
   */
  constructor(options) {
    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.callbackBaseUrl = options.callbackBaseUrl;
    this.env = options.env || "sandbox";
    this.logger = options.logger || console;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.encryptTokens = options.encryptTokens || false;
    this.useCache = options.useCache !== false; // Default to true
    
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
        this.logger.debug(`[${options.method || 'GET'}] ${url} | payload: ${JSON.stringify(options.body)}`);
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
          const errorText = await response.text();
          let parsed;
          try { 
            parsed = JSON.parse(errorText); 
          } catch { 
            parsed = errorText; 
          }
          
          throw new PesapalError(
            `Request failed: ${parsed.message || parsed}`,
            response.status,
            parsed
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
   * @param {boolean} [options.encryptTokens=false] - Whether to encrypt tokens in memory
   * @param {boolean} [options.useCache=true] - Whether to use caching for tokens
   */
  constructor(options) {
    this.config = new PesapalConfig(options);
    this.logger = new Logger(this.config.logger, options.debug || false);
    this.httpClient = new HttpClient(this.config, this.logger);
    
    // Token management
    this.token = null;
    this.tokenExpiry = null;
    this.tokenLock = null;
    
    // Cache for tokens and IPN IDs
    this.cache = this.config.useCache ? new NodeCache({ stdTTL: 3300 }) : null; // 55 mins
    
    this.logger.log(`PesapalAPI initialized in ${this.config.env.toUpperCase()} mode`);
  }

  /**
   * Encrypt a token using AES-256-CBC
   * @param {string} token - Token to encrypt
   * @returns {string} Encrypted token
   */
  encryptToken(token) {
    if (!this.config.encryptTokens) return token;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", 
      Buffer.from(this.config.consumerSecret).slice(0, 32), iv);
    
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    return iv.toString("hex") + ":" + encrypted;
  }

  /**
   * Decrypt a token using AES-256-CBC
   * @param {string} encryptedToken - Encrypted token
   * @returns {string} Decrypted token
   */
  decryptToken(encryptedToken) {
    if (!this.config.encryptTokens) return encryptedToken;
    
    const parts = encryptedToken.split(":");
    if (parts.length !== 2) throw new Error("Invalid encrypted token format");
    
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv("aes-256-cbc", 
      Buffer.from(this.config.consumerSecret).slice(0, 32), iv);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
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

    this.token = this.encryptToken(data.token);
    this.tokenExpiry = Date.now() + 55 * 60 * 1000; // refresh 5 mins early
    
    if (this.cache) {
      this.cache.set("pesapal_token", this.token);
    }
    
    this.logger.log("✅ Token retrieved successfully");

    return this.decryptToken(this.token);
  }

  /**
   * 🔄 Step 2: Ensure Token Validity with race condition protection
   * @returns {Promise<string>} Valid OAuth token
   */
  async ensureToken() {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get("pesapal_token");
      if (cached) {
        this.token = cached;
        return this.decryptToken(this.token);
      }
    }
    
    // Check if token is still valid
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.decryptToken(this.token);
    }

    // If another request is refreshing the token, wait for it
    if (this.tokenLock) {
      await this.tokenLock;
      return this.decryptToken(this.token);
    }

    // Otherwise, refresh the token
    this.tokenLock = this.requestToken();
    await this.tokenLock;
    this.tokenLock = null;

    return this.decryptToken(this.token);
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

    // Cache the IPN ID if caching is enabled
    if (this.cache) {
      this.cache.set(`ipn_${notificationUrl}`, data.ipn_id);
    }

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
   * 🛡️ Step 6: Verify IPN Signature with timing-safe comparison
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

    // Use timing-safe comparison to prevent timing attacks
    try {
      const computedBuffer = Buffer.from(computedSignature, "hex");
      const headerBuffer = Buffer.from(signatureHeader, "hex");

      if (computedBuffer.length !== headerBuffer.length) {
        this.logger.warn("❌ Invalid IPN signature detected (length mismatch)");
        return false;
      }

      const valid = crypto.timingSafeEqual(computedBuffer, headerBuffer);
      if (!valid) {
        this.logger.warn("❌ Invalid IPN signature detected");
      }

      return valid;
    } catch (error) {
      this.logger.error("Error verifying IPN signature:", error);
      return false;
    }
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

  /**
   * 🔄 Utility: Handle IPN and verify order status
   * @param {Object} req - Request object
   * @returns {Promise<Object>} Transaction status or message
   */
  async handleIPN(req) {
    if (!this.verifyIPNSignature(req)) {
      throw new PesapalError("Invalid IPN signature", 401);
    }

    const { OrderTrackingId } = req.body;
    if (OrderTrackingId) {
      const status = await this.getTransactionStatus(OrderTrackingId);
      this.logger.log("Updated order status:", status);
      return status;
    }
    
    return { message: "No tracking ID found" };
  }
}

export default PesapalAPI;
export { PesapalError, PesapalConfig, Logger, HttpClient };