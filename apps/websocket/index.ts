import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { createServer } from 'http'; 

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://down-detector-teal.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
const subscriber = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL) 
  : new Redis({ 
      host: process.env.REDIS_HOST || 'redis', 
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379 
    });

subscriber.subscribe('ping-updates', (err, count) => {
  if (err) console.error("Failed to subscribe:", err);
  console.log(`Subscribed to ${count} channels. Listening for pings...`);
});

subscriber.on('message', (channel, message) => {
  if (channel === 'ping-updates') {
    const data = JSON.parse(message);
    console.log(data)

    io.emit(`monitor-${data.monitorId}`, data);
  }
});

const PORT = process.env.PORT || 3003; 
httpServer.listen(PORT, () => {
  console.log(`WebSocket Server running on port ${PORT}`);
});