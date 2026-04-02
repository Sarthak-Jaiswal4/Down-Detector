import 'dotenv/config';
import { prisma, ConnectionType } from '@repo/db';

async function seedTestMonitors() {
  const userId = "your-actual-user-id"; // Change this to your test user ID

  const scenarios = [
    // 1. Success Scenarios (Should be UP)
    { url: "https://httpbin.org/status/200", type: ConnectionType.HTTP },
    { url: "https://httpbin.org/status/204", type: ConnectionType.HTTP }, // No Content but 2xx
    { url: "https://httpbin.org/get", type: ConnectionType.HTTP },
    
    // 2. Client Errors (Should trigger RETRY -> DOWN)
    { url: "https://httpbin.org/status/400", type: ConnectionType.HTTP }, // Bad Request
    { url: "https://httpbin.org/status/401", type: ConnectionType.HTTP }, // Unauthorized
    { url: "https://httpbin.org/status/403", type: ConnectionType.HTTP }, // Forbidden
    { url: "https://httpbin.org/status/404", type: ConnectionType.HTTP }, // Not Found
    { url: "https://httpbin.org/status/418", type: ConnectionType.HTTP }, // I'm a teapot
    
    // 3. Server Errors (Should trigger RETRY -> DOWN)
    { url: "https://httpbin.org/status/500", type: ConnectionType.HTTP }, // Internal Server Error
    { url: "https://httpbin.org/status/502", type: ConnectionType.HTTP }, // Bad Gateway
    { url: "https://httpbin.org/status/503", type: ConnectionType.HTTP }, // Service Unavailable
    { url: "https://httpbin.org/status/504", type: ConnectionType.HTTP }, // Gateway Timeout
    
    // 4. Latency & Timeout Scenarios (Should test your 10s timeout)
    { url: "https://httpbin.org/delay/2", type: ConnectionType.HTTP },  // Slow (2s) - Should be UP
    { url: "https://httpbin.org/delay/3", type: ConnectionType.HTTP },  // Very Slow (5s) - Should be UP
    { url: "https://httpbin.org/delay/11", type: ConnectionType.HTTP }, // Timeout (>10s) - Should be DOWN
    
    // 5. Redirection Scenarios (Should be UP because Axios follows redirects)
    { url: "https://httpbin.org/redirect/3", type: ConnectionType.HTTP }, // 3 Redirects
    { url: "https://httpbin.org/relative-redirect/2", type: ConnectionType.HTTP },
    
    // 6. TCP / Port Scenarios (Using common public endpoints)
    { url: "8.8.8.8", type: ConnectionType.PORT, port: 53 },   // Google DNS (Open)
    { url: "1.1.1.1", type: ConnectionType.PORT, port: 53 },   // Cloudflare DNS (Open)
    { url: "127.0.0.1", type: ConnectionType.PORT, port: 9999 } // Dead Local Port (Should fail)
  ];

  const stressTestMonitors = [
  { url: "https://httpbin.org/delay/5", type: "HTTP" }, // Timeout/Socket Latency
  { url: "https://www.wikipedia.org", type: "HTTP" },   // Complex SSL Handshake
  { url: "https://www.gov.uk", type: "HTTP" },          // Fast Response cycling
  { url: "https://httpbin.org/bytes/50000", type: "HTTP" }, // Memory Buffer (50KB)
  { url: "https://www.nytimes.com", type: "HTTP" },     // Heavy Headers
  { url: "https://httpbin.org/redirect/5", type: "HTTP" },  // Redirect Logic
  { url: "https://www.cloudflare.com", type: "HTTP" },  // Edge Security Verification
  { url: "https://httpstat.us/503", type: "HTTP" },     // Error State handling
  { url: "https://www.amazon.com", type: "HTTP" },      // Connection Reset Resilience
  { url: "https://httpbin.org/stream/20", type: "HTTP" },   // Streaming/Async wait
  { url: "https://www.apple.com", type: "HTTP" },       // Compression/Brotli decoding
  { url: "https://httpbin.org/status/404", type: "HTTP" },  // 404 Negative Logging
  { url: "https://www.github.com", type: "HTTP" },      // TLS 1.3 Handshake (CPU heavy)
  { url: "https://httpbin.org/headers", type: "HTTP" }, // Reflection/JSON Parsing
  { url: "https://www.reddit.com", type: "HTTP" }       // 403 Forbidden handling
];

const additionalMonitors = [
  // 🌍 GEOGRAPHIC & INFRASTRUCTURE DIVERSITY
  { url: "https://www.baidu.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },      // China-based routing (High Latency)
  { url: "https://www.yandex.ru", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },     // Russia-based routing
  { url: "https://www.mercadolibre.com.ar", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Latin America routing

  // 🔒 COMPLEX SECURITY & HEADERS
  { url: "https://www.facebook.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },   // Extremely heavy HSTS & CSP headers
  { url: "https://www.microsoft.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },  // Multi-layered redirect & cookie handling
  { url: "https://www.digicert.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },   // CA site; tests strict OSCP/CRL stapling
  
  // ⚡ FAST RE-VALIDATION (High Frequency)
  { url: "https://1.1.1.1", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },           // Cloudflare DNS; tests raw IP speed
  { url: "https://www.google.com/generate_204", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Smallest possible valid response

  // 🧪 API & DYNAMIC BEHAVIOR
  { url: "https://api.github.com/zen", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Simple text API; tests frequent parsing
  { url: "https://httpbin.org/anything", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Mirror API; returns all request data
  { url: "https://httpbin.org/gzip", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },     // Tests Gzip decompression CPU usage
  
  // 🧨 ERROR & EDGE CASES
  { url: "https://httpbin.org/status/429", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Rate Limited simulator
  { url: "https://httpbin.org/status/500", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }, // Server Error simulator
  { url: "https://badssl.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" },           // Hub for testing broken SSL logic
  { url: "https://expired.badssl.com", type: "HTTP", interval: 30, userid: "YOUR_USER_ID" }    // Forces your SSL expiry logic to trigger
];

  console.log("🚀 Seeding 20 test monitors...");

  const data = additionalMonitors.map(s => ({
    ...s,
    interval: 10, // 5 second interval for fast testing
    status: 'UP',
    userid: "4a73c0bf-13e7-4ea6-a2ec-3c36b961c59f",
  }));

  try {
    await prisma.monitor.createMany({ data });
    console.log("✅ Seeded successfully. Check your pinger logs!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestMonitors();