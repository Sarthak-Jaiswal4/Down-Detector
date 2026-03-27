import { Redis } from 'ioredis';
import { Server } from 'socket.io';

const io = new Server(3002, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});
const subscriber = new Redis({ host: 'localhost', port: 6379 });

subscriber.subscribe('ping-updates', (err, count) => {
  if (err) console.error("Failed to subscribe:", err);
  console.log(`Subscribed to ${count} channels. Listening for pings...`);
});

subscriber.on('message', (channel, message) => {
  if (channel === 'ping-updates') {
    const data = JSON.parse(message);
    console.log(data)

    io.emit(`monitor-${data.monitorId}`, data); 
    // Pro-Tip: Using monitorId in the event name lets the frontend 
    // only listen to the specific monitor it's looking at.
  }
});