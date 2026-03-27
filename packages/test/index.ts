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

  console.log("🚀 Seeding 20 test monitors...");

  const data = scenarios.map(s => ({
    ...s,
    interval: 10, // 5 second interval for fast testing
    status: 'UP',
    userid: "d438964b-3a96-4179-86b7-72f01745156e",
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