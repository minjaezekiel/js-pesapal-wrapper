# js-pesapal-wrapper
A javascript wrapper for pesapal


Your friendly assistant for handling Pesapal payments in your Node.js applications. Think of it as a translator that makes talking to the Pesapal payment system super easy!

## 🌟 Why Use This Wrapper?

- **Simple & Clean:** We handle the complicated parts so you can write clean, readable code.
- **Safe & Secure:** Automatically checks that payment notifications are really from Pesapal.
- **Smart:** It remembers your login token and automatically refreshes it.
- **Helpful:** Gives you clear error messages when something goes wrong.

## 📦 Installation

First, you need to add the required package for making web requests:

```bash
npm install node-fetch
```

Then, just copy the `pesapalAPI.js` file into your project.

## 🚀 Quick Start (The 3-Minute Guide)

Let's get you set up to accept your first payment in just a few steps!

### Step 1: Create Your Pesapal Assistant

Create a new file, let's call it `my-shop.js`, and set up your assistant.

```javascript
import PesapalAPI from './pesapalAPI.js';

// Create your very own Pesapal assistant!
const pesapal = new PesapalAPI({
  consumerKey: "YOUR_PESAPAL_CONSUMER_KEY",      // Get this from your Pesapal dashboard
  consumerSecret: "YOUR_PESAPAL_CONSUMER_SECRET", // Also from your dashboard
  callbackBaseUrl: "https://my-awesome-website.com", // Your website's address
  env: "sandbox",                                // Use "sandbox" for testing!
  debug: true                                    // Shows you what's happening behind the scenes
});
```

### Step 2: Ask for a Payment

Now, let's create a payment request for a cool t-shirt that costs 1000 KES.

```javascript
async function createPayment() {
  try {
    // First, tell Pesapal where to send payment updates
    const ipn = await pesapal.registerIPN("https://my-awesome-website.com/payment-updates");
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

## 📖 Detailed Guide

Here's a closer look at what you can do with your Pesapal assistant.

### 🔑 1. Configuration Options

When you create your `PesapalAPI` assistant, you can give it these options:

| Option | What it is | Example |
|---|---|---|
| `consumerKey` | Your secret username from Pesapal | `"MY_CONSUMER_KEY"` |
| `consumerSecret` | Your secret password from Pesapal | `"MY_CONSUMER_SECRET"` |
| `callbackBaseUrl` | Your website's main address | `"https://my-app.com"` |
| `env` | Where you're working: `"sandbox"` (for practice) or `"production"` (for real money) | `"sandbox"` |
| `debug` | Set to `true` to see helpful messages in the console | `true` |
| `retryAttempts` | How many times to try again if a request fails (default is 3) | `3` |

### 🧾 2. Register an IPN (Instant Payment Notification)

An IPN is like a special phone line that Pesapal calls to tell you a payment is complete. You need to register this "phone number" (a URL) first.

```javascript
// Tell Pesapal where to send updates
const ipnInfo = await pesapal.registerIPN(
  "https://my-awesome-website.com/pesapal-updates", // The URL Pesapal will call
  "My Main IPN"                                     // A friendly name for it
);

console.log("Your IPN ID is:", ipnInfo.ipn_id); // Save this ID!
```

### 💳 3. Submit an Order

This is how you ask a customer for money.

```javascript
const orderInfo = await pesapal.submitOrder({
  notificationId: ipnInfo.ipn_id,       // The ID you got from registering the IPN
  amount: 2500,                         // The amount to charge
  currency: "KES",                      // The currency code
  description: "Super Awesome Book",    // What the customer is buying
  billingInfo: {                        // Customer's details
    email_address: "john.doe@email.com",
    phone_number: "+254798765432",
    first_name: "John",
    last_name: "Doe",
    country: "Kenya"
  }
});

// After this, you must redirect the user to `orderInfo.redirect_url`
// so they can enter their payment details.
```

### 🔍 4. Get Transaction Status

Sometimes, you just want to ask Pesapal: "Hey, did that payment go through yet?"

```javascript
const status = await pesapal.getTransactionStatus("ORDER_TRACKING_ID_HERE");

if (status.status_code === "1") {
  console.log("✅ Payment was successful!");
} else {
  console.log("❌ Payment is not complete yet or failed.");
}
```

### 🛡️ 5. Receiving Secure IPNs (The Magic Part)

Instead of you always checking for payments, Pesapal can *tell you* when a payment is done. This is the best way! We'll use an Express.js server as an example.

The `ipnMiddleware()` is like a security guard. It checks every message to make sure it's really from Pesapal before letting it through.

```javascript
import express from 'express';
const app = express();
app.use(express.json()); // Needed to read incoming data

// This is your special IPN endpoint
app.post('/pesapal-updates',
  pesapal.ipnMiddleware(), // The security guard checks the signature
  (req, res) => {
    // If we get here, the message is from Pesapal! Yay!
    console.log("🔔 Received a payment update:", req.body);

    // Here's where you do your magic:
    // - Update your database
    // - Mark an order as "paid"
    // - Send a confirmation email to the customer
    // - Give the user access to what they bought

    if (req.body.status === 'completed') {
      console.log(`Payment for order ${req.body.order_tracking_id} is complete!`);
    }

    // Always tell Pesapal you received the message
    res.status(200).send("OK");
  }
);

app.listen(3000, () => {
  console.log("🚀 Server is running on http://localhost:3000");
});
```

## 🤔 Oops! Troubleshooting

| Problem | What it Means | How to Fix It |
|---|---|---|
| `Token request failed` | Your `consumerKey` or `consumerSecret` is wrong. | Double-check them for typos. Make sure you copied them correctly from your Pesapal dashboard. |
| `IPN registration failed` | The URL you gave Pesapal is not working. | Make sure your website is online and the URL is correct. Pesapal needs to be able to reach it. |
| `SubmitOrder failed` | Some information for the order is missing or wrong. | Make sure you included `notificationId`, `amount`, `description`, and `billingInfo`. Check that the amount is a number. |
| `Invalid IPN signature` | Someone tried to send a fake payment update. | Don't worry! Our security guard caught it. This error is just a log message to let you know the wrapper is protecting you. |

## 📄 License

MIT License - feel free to use this in your own projects!