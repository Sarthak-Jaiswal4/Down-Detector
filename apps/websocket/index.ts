import { Redis } from 'ioredis';
import { Server } from 'socket.io';

const io = new Server(3003, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});
const subscriber = new Redis({ 
  host: process.env.REDIS_HOST || 'redis', 
  port: 6379 
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