const fs = require("fs");

const SOURCE_URL =
  "https://www.mbjairport.com/flights?type=arrivals";

async function main() {
  console.log("Fetching MBJ arrivals...");
  console.log(SOURCE_URL);

  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MBJ-Flight-Board/1.0)",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log("HTTP status:", response.status);

  if (!response.ok) {
    throw new Error(
      `MBJ returned HTTP ${response.status}`
    );
  }

  const html = await response.text();

  console.log(
    "Downloaded:",
    html.length,
    "characters"
  );

  /*
   * Convert HTML entities and remove tags.
   */
  function clean(value) {
    return value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
   * Locate table rows.
   */
  const rowMatches =
    html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  console.log(
    "Table rows found:",
    rowMatches.length
  );

  const flights = [];

  for (const row of rowMatches) {

    const cellMatches =
      row.match(/<td[\s\S]*?<\/td>/gi);

    if (!cellMatches) continue;

    const cells =
      cellMatches.map(clean);

    /*
     * MBJ arrivals table should contain:
     *
     * Airline / Flight
     * From
     * Baggage
     * Time
     * Status
     */

    if (cells.length < 5) continue;

    const airlineFlight = cells[0];
    const from = cells[1];
    const baggage = cells[2];
    const time = cells[3];
    const status = cells[4];

    if (!airlineFlight || !from) continue;

    flights.push({
      airlineFlight,
      from,
      baggage,
      time,
      status
    });
  }

  console.log(
    "Flights extracted:",
    flights.length
  );

  /*
   * Do NOT overwrite good data
   * if MBJ unexpectedly returns
   * an empty page.
   */
  if (flights.length === 0) {

    fs.writeFileSync(
      "mbj-debug.html",
      html
    );

    throw new Error(
      "No MBJ flights were extracted. " +
      "Saved response as mbj-debug.html."
    );
  }

  const output = {
    airport: "MBJ",
    airportName:
      "Sangster International Airport",

    type: "arrivals",

    source:
      "MBJ Airport",

    updated:
      new Date().toISOString(),

    flights
  };

  fs.writeFileSync(
    "flights.json",
    JSON.stringify(
      output,
      null,
      2
    )
  );

  fs.writeFileSync(
    "last_updated.txt",
    new Date().toISOString()
  );

  console.log(
    "SUCCESS: flights.json created."
  );
}

main().catch(error => {

  console.error(
    "MBJ UPDATE FAILED:"
  );

  console.error(error);

  process.exit(1);
});
