import { createAIBot } from "../index";

const bot = createAIBot({
  host: "lotus.taspmail.online",
  port: 19132,
  username: "VikramDon9580",
  apiKey: "AIza...", // Dummy, won't use AI for this test
  offline: false,
  auth: JSON.parse(require('fs').readFileSync('/home/ubuntu/aether-live/.aether-auth/msa-AetherBot.json', 'utf8'))
});

bot.on('packet', (id, data) => {
  if (id === 0x9c) { // PacketViolationWarning
    console.log("VIOLATION_DATA:", JSON.stringify(data, null, 2));
    process.exit(0);
  }
});

setTimeout(() => {
  console.log("Timeout - no violation caught");
  process.exit(1);
}, 10000);
