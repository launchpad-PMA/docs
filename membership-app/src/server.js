import { createApp, listen } from "./app.js";

const app = createApp();
const address = await listen(app);
console.log(`Advocacy Launchpad membership service at http://${app.config.host}:${address.port}`);
console.log(`Covenant publication mode: ${app.config.publication}`);
