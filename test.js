import PesapalAPI from "./pesapalAPI.js"
import {Logger} from "./pesapalAPI.js";

//Tanzania Merchant
//consumer_key: ngW+UEcnDhltUc5fxPfrCD987xMh3Lx8
//consumer_secret: q27RChYs5UkypdcNYKzuUw460Dg=

const options = {
    consumerKey:"ngW+UEcnDhltUc5fxPfrCD987xMh3Lx8",
    consumerSecret:"q27RChYs5UkypdcNYKzuUw460Dg=",
    callbackBaseUrl: "https://YOUR-WEBAPP-URL",//change this to test
    env: "sandbox",
    debug: true,

  // --- OPTIONAL: Security & Performance ---
  encryptTokens: true,   // Encrypts tokens in memory for extra security (defaults to false)
  useCache: true,        // Caches tokens to reduce API calls (defaults to true)

  // --- OPTIONAL: Retry Logic ---
  retryAttempts: 3,      // Number of times to retry a failed API call (defaults to 3)
  retryDelay: 1000,      // Delay in milliseconds between retries (defaults to 1000)

  // --- OPTIONAL: Custom Logger ---
  // You can provide your own logger (e.g., from Winston or Pino).
  // If not provided, it defaults to the console.


}

//this.logger = options.logger || new Logger();

const pesapal = new PesapalAPI(options)

/*
async function main() {
  try {
    const ipn = await pesapal.registerIPN("https://marketwavestores.com/ipn");
    console.log("IPN Registered:", ipn.ipn_id);
  } catch (error) {
    console.error("Failed to register IPN:", error.message);
  }
}

//main();


//request token
(async () => {
  const token = await pesapal.requestToken();
  console.log("Access token:", token);
})();


//register token
(async () => {
  const ipn = await pesapal.registerIPN("https://marketwavestores.com/ipn", "MainStoreIPN");
  console.log("✅ IPN registered successfully:", ipn);
})();











(async () => {
  const order = await pesapal.submitOrder({
    notificationId: "abcd1234-5678-efgh-9101", // IPN ID you registered
    amount: 1200.50,
    currency: "KES",
    description: "Purchase of 2 shirts",
    billingInfo: {
      email_address: "ezekielminja@gmail.com",
      phone_number: "0712345678",
      first_name: "Ezekiel",
      last_name: "Minja",
      line_1: "Mikocheni",
      city: "Dar es Salaam",
      country_code: "TZ"
    }
  });

  console.log("✅ Order submitted:", order);
})(); 
*/
async function createOrder() {
  try {
    // 1️⃣ Ensure we have a valid token
    const token = await pesapal.ensureToken();
    console.log("✅ Access token:", token);
    console.log("\n")

    // 2️⃣ Register IPN dynamically
    const ipnResponse = await pesapal.registerIPN(
      "https://marketwavestores.com/ipn",
      "MainStoreIPN"
    );

    console.log("\n✅ IPN registered successfully:", ipnResponse);

    // 3️⃣ Submit the order using the real IPN ID
    const orderResponse = await pesapal.submitOrder({
      notificationId: ipnResponse.ipn_id, // <-- use dynamic IPN ID
      amount: 1200.5,
      description: "Purchase of 2 shirts",
      billingInfo: {
        email_address: "ezekielminja@gmail.com",
        phone_number: "0712345678",
        first_name: "Ezekiel",
        last_name: "Minja",
        line_1: "Mikocheni",
        city: "Dar es Salaam",
        country_code: "TZ"
      },
      currency: "TZS",
      branch: "Main Branch"
    });

    console.log("\n✅ Order submitted successfully:", orderResponse);

  } catch (error) {
    console.error("\n❌ Error creating order:", error);
  }
}

// Run the flow
createOrder();