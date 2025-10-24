# js-pesapal-wrapper
A javascript wrapper for pesapal


Your friendly assistant for handling Pesapal payments in your Node.js applications. Think of it as a translator that makes talking to the Pesapal payment system super easy!


[![npm version](https://badge.fury.io/js/pesapal-api-wrapper.svg)](https://badge.fury.io/js/pesapal-api-wrapper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Key Features

- **🛡️ Timing-Safe Security:** Uses `crypto.timingSafeEqual()` to prevent timing attacks on IPN signatures.
- **🔄 Smart Token Management:** Automatically handles OAuth tokens with race-condition protection to prevent redundant refreshes.
- **🚀 Built-in Caching:** Optional in-memory caching reduces API calls and improves performance for frequent requests.
- **🔐 Enhanced Security:** Optional AES-256-CBC token encryption for sensitive, multi-tenant environments.
- **🧠 Intelligent Error Handling:** Parses API errors for clearer, more actionable debugging information.
- **✅ All-in-One IPN Handling:** Includes a `handleIPN` utility to automatically verify and process payment notifications.
- **📝 Excellent Logging:** Detailed, contextual logging to make debugging a breeze.
- **⚡ Simple & Clean:** A clean, modern API that's easy to understand and integrate.

## 📦 Installation

Install the required packages for making web requests, caching, and managing environment variables:

```bash
npm install node-fetch node-cache dotenv
```

Then, copy the `PesapalAPI.js` file into your project.

---

## 🔑 Getting Your Pesapal Credentials (The Secure Way)

Hardcoding your secret keys directly in your code is a big security risk! We'll use a `.env` file to keep them safe and separate from your codebase.

### Step 1: Get Your Keys from Pesapal

1.  Log in to your [Pesapal Dashboard](https://www.pesapal.com/).
2.  Navigate to the **Developers** or **API** section.
3.  You will find your **Consumer Key** and **Consumer Secret**. Copy these values.

### Step 2: Set Up Your Project with `.env`

1.  In the root of your project, create a file named `.env`. **This file should never be committed to Git.**
2.  Create another file named `.env.example`. This one *can* be committed to show others what variables are needed.

**`.env.example` file:**
```env
# Pesapal API Credentials
PESAPAL_CONSUMER_KEY=your_consumer_key_here
PESAPAL_CONSUMER_SECRET=your_consumer_secret_here

# Your Application's Details
CALLBACK_BASE_URL=https://your-website.com
ENVIRONMENT=sandbox
```

**`.env` file (your actual secrets):**
```env
# Pesapal API Credentials
PESAPAL_CONSUMER_KEY=MY_REAL_KEY_12345
PESAPAL_CONSUMER_SECRET=MY_REAL_SECRET_67890

# Your Application's Details
CALLBACK_BASE_URL=https://my-awesome-app.com
ENVIRONMENT=sandbox
```

3.  **Important:** Add `.env` to your `.gitignore` file to prevent accidentally uploading your secrets to GitHub.

**`.gitignore` file:**
```
node_modules
.env
```

---

## 🚀 Quick Start (The 3-Minute Guide)

Let's get you set up to accept your first payment in just a few steps!

### Step 1: Create Your Pesapal Assistant

Create a new file, let's call it `my-shop.js`, and set up your assistant using the `.env` variables.

```javascript
// Load environment variables from .env file
import 'dotenv/config'; 
import PesapalAPI from './PesapalAPI.js';

// Create your very own Pesapal assistant!
const pesapal = new PesapalAPI({
  consumerKey: process.env.PESAPAL_CONSUMER_KEY,
  consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL,
  env: process.env.ENVIRONMENT || "sandbox", // Use "sandbox" for testing!
  debug: true,                                // Shows you what's happening behind the scenes
  encryptTokens: true,                        // Encrypt tokens in memory (optional, for high security)
  useCache: true                              // Use caching for better performance
});
```

### Step 2: Ask for a Payment

Now, let's create a payment request for a cool t-shirt that costs 1000 KES.

```javascript
async function createPayment() {
  try {
    // First, tell Pesapal where to send payment updates
    const ipn = await pesapal.registerIPN(`${process.env.CALLBACK_BASE_URL}/ipn`);
    console.log("✅ Notification address registered! ID:", ipn.ipn_id);

    // Now, create the order
    const order = await pesapal.submitOrder({
      notificationId: ipn.ipn_id,
      amount: 1000,
      currency: "KES",
      description: "A Very Cool T-Shirt",
      billingInfo: {
        email_address: "customer@example.com",
        phone_number: "+254712345678",
        first_name: "Jane",
        last_name: "Doe"
      }
    });

    console.log("🎉 Payment request created!");
    console.log("👉 Send your customer to this link to pay:", order.redirect_url);

  } catch (error) {
    console.error("😢 Oh no, something went wrong:", error.message);
  }
}

// Run the function!
createPayment();
```

Run this file with `node my-shop.js`, and you'll get a link in your console. Click it to see the Pesapal payment page!

---

## 📖 Complete Implementation Example (Express.js Server)

Here is a full, production-ready example of an Express server that uses the wrapper to create payments and securely handle IPN notifications.

**`server.js`**
```javascript
// 1. IMPORTS AND CONFIGURATION
import 'dotenv/config'; // Load .env variables FIRST
import express from 'express';
import PesapalAPI from './PesapalAPI.js';

// 2. INITIALIZE PESAPAL API
const pesapal = new PesapalAPI({
  consumerKey: process.env.PESAPAL_CONSUMER_KEY,
  consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL,
  env: process.env.ENVIRONMENT || "sandbox",
  debug: true,
  encryptTokens: true,
  useCache: true
});

// 3. INITIALIZE EXPRESS APP
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// 4. DEFINE ROUTES

/**
 * @route   POST /create-payment
 * @desc    Creates a new payment order with Pesapal
 */
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, description, billingInfo } = req.body;

    // Register our IPN URL once (or you can do this elsewhere and store the ID)
    const ipn = await pesapal.registerIPN(`${process.env.CALLBACK_BASE_URL}/ipn`);
    
    // Submit the order to Pesapal
    const order = await pesapal.submitOrder({
      notificationId: ipn.ipn_id,
      amount,
      currency: "KES",
      description,
      billingInfo
    });

    res.json({
      success: true,
      redirect_url: order.redirect_url,
      order_tracking_id: order.order_tracking_id
    });

  } catch (error) {
    console.error("Payment creation failed:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /ipn
 * @desc    Receives and verifies Instant Payment Notifications from Pesapal
 */
app.post('/ipn', 
  // This middleware automatically verifies the signature for security!
  pesapal.ipnMiddleware(), 
  async (req, res) => {
    try {
      // The handleIPN utility verifies the signature and fetches the latest status
      const status = await pesapal.handleIPN(req);

      console.log(`🔔 IPN Received for Order: ${status.order_tracking_id}`);
      console.log(`Status: ${status.status_message} | Method: ${status.payment_method}`);

      // --- YOUR BUSINESS LOGIC GOES HERE ---
      // 1. Find the order in your database using status.order_tracking_id
      // 2. If status.status_code === "1", update the order to "Paid"
      // 3. Send a confirmation email to the customer
      // 4. Grant the user access to their product
      // -------------------------------------

      // Always respond to Pesapal with a 200 OK to acknowledge receipt
      res.status(200).send("OK");

    } catch (error) {
      console.error("IPN Handling failed:", error);
      // If there's an error, Pesapal might retry, so we still send 200
      // but log the error for debugging.
      res.status(200).send("Error processing, but received.");
    }
  }
);

// 5. START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 IPN endpoint ready at: ${process.env.CALLBACK_BASE_URL}/ipn`);
});
```

---

## 📚 API Reference

| Method | Description |
|---|---|
| `constructor(options)` | Initializes the API wrapper. See configuration options above. |
| `async registerIPN(url, name)` | Registers an IPN URL with Pesapal to receive payment notifications. |
| `async submitOrder(details)` | Submits a new payment order. Returns a redirect URL for the customer. |
| `async getTransactionStatus(orderTrackingId)` | Fetches the current status of a transaction. |
| `verifyIPNSignature(req)` | Verifies if an incoming IPN request is genuinely from Pesapal. |
| `ipnMiddleware()` | Returns an Express middleware that uses `verifyIPNSignature` for protection. |
| `async handleIPN(req)` | A utility that verifies an IPN and immediately fetches the transaction status. |

---

## 🤝 Contributing

We welcome contributions from the community! Whether it's a bug fix, a new feature, or improved documentation, your help is appreciated.

1.  **Fork the Repository:** Click the "Fork" button at the top right of this page.
2.  **Clone Your Fork:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/pesapal-wrapper.git
    ```
3.  **Create a New Branch:** For your feature or bug fix.
    ```bash
    git checkout -b feature/amazing-new-feature
    ```
4.  **Make Your Changes:** Code, test, and ensure everything works as expected.
5.  **Commit Your Changes:**
    ```bash
    git commit -m "feat: add my amazing new feature"
    ```
6.  **Push to Your Branch:**
    ```bash
    git push origin feature/amazing-new-feature
    ```
7.  **Open a Pull Request:** Go to your fork on GitHub and click the "New Pull Request" button. Provide a clear description of your changes.

For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

A big thank you to **Pesapal** for providing a powerful payment platform that enables businesses across Africa.