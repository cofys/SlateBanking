import express from "express";
import { v1Router } from "./routes/v1.js";
import { banksRouter } from "./routes/banks.js";
import { globalRouter } from "./routes/global.js";
import { citizenRouter } from "./routes/citizen.js";
import { portalRouter } from "./routes/portal.js";
import { onyxRouter } from "./routes/onyx.js";
import { botRouter } from "./routes/bot.js";
import { webhooksRouter } from "./routes/webhooks.js";

export function registerAllRoutes(app: express.Express, ctx?: any) {
    app.use('/', v1Router);
    app.use('/', banksRouter);
    app.use('/', globalRouter);
    app.use('/', citizenRouter);
    app.use('/', portalRouter);
    app.use('/', onyxRouter);
    app.use('/', botRouter);
    app.use('/', webhooksRouter);
}
