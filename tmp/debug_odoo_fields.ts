import { callOdooKw } from "./apps/api/src/services/odoo.service.js";
import { db } from "./apps/api/src/config/database.js";

async function run() {
  try {
    const fields = await callOdooKw("hr.work.entry", "fields_get", [], { attributes: ["string"] });
    console.log("FIELDS:", JSON.stringify(fields, null, 2));
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    process.exit(0);
  }
}

run();
