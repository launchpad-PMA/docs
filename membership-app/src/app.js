import fs from "node:fs";
import http from "node:http";
import { syncAgreements, seedBenefits } from "./agreements.js";
import { loadConfig } from "./config.js";
import { MembershipDb } from "./db.js";
import { handleRequest } from "./http.js";

export function createApp(overrides = {}) {
  const config = loadConfig(process.env, overrides);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new MembershipDb(`${config.dataDir}/membership.sqlite`);
  syncAgreements(db);
  seedBenefits(db, config);
  const server = http.createServer((req, res) => {
    handleRequest(req, res, { db, config }).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ error: "The membership service could not finish that request." }));
    });
  });
  return {
    server,
    db,
    config,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          try {
            db.close();
          } catch (closeError) {
            if (!error) error = closeError;
          }
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

export function listen(app) {
  return new Promise((resolve) => {
    app.server.listen(app.config.port, app.config.host, () => resolve(app.server.address()));
  });
}
