import './config/env.js';
import { createApp } from './app.js';
import { logger } from './config/logger.js';
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { startInvoiceScheduler } from './services/invoiceScheduler.js';

const app = createApp();

const PORT = process.env.PORT || 4000;

await mongoose.connect(env.MONGO_URI);
console.log("Connected to MongoDB");
console.log("Connected DB:", mongoose.connection.name);

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  startInvoiceScheduler();
});
