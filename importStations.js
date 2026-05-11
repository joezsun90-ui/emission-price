import fs from "fs";
import csv from "csv-parser";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const rows = [];

fs.createReadStream("stations_import.csv")
  .pipe(csv())
  .on("data", (row) => {
    rows.push({
      name: row.name,
      address: row.address,
      zip: row.zip,
      city: row.city,
      price: Number(row.price),
      cash_price: Number(row.cash_price || row.price),
      card_price: Number(row.card_price || row.price),
      rating: Number(row.rating || 0),
      verified: row.verified === "true",
      phone: row.phone || "",
    });
  })
  .on("end", async () => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/stations`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      console.error(await response.text());
      process.exit(1);
    }

    const data = await response.json();
    console.log(`Imported ${data.length} stations successfully.`);
  });