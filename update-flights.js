const fs = require("fs");

const SOURCE_URL = "https://www.mbjairport.com/flights?type=arrivals";

async function main() {
  console.log("Fetching MBJ arrivals from official airport website...");

  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MBJ-Flight-Board/1.0)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  console.log("HTTP status:", response.status);

  if (!response.ok) {
    throw new Error(`MBJ returned HTTP ${response.status}`);
  }

  const html = await response.text();

  function clean(value = "") {
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

  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const flights = [];

  for (const row of rows) {
    const tdMatches = row.match(/<td[\s\S]*?<\/td>/gi);
    if (!tdMatches) continue;

    const cells = tdMatches.map(clean);

    if (cells.length < 5) continue;

    const airlineFlight = cells[0];
    const from = cells[1];
    const baggage = cells[2];

    /*
     * MBJ's time cell can contain both the scheduled
     * and updated/actual arrival times.
     */
    const timeMatches = cells[3].match(
      /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
    ) || [];

    const scheduledTime = timeMatches[0] || cells[3] || "";
    const actualTime = timeMatches[1] || "";

    /*
     * The final MBJ cell may also contain a time.
     * A time by itself is not a flight status.
     */
    let status = cells[4] || "";

    if (/^\d{1,2}:\d{2}\s*(?:AM|PM)$/i.test(status)) {
      status = "";
    }

    if (!airlineFlight || !from) continue;

    flights.push({
      airlineFlight,
      from,
      baggage,
      scheduledTime,
      actualTime,
      status
    });
  }

  console.log("Flights extracted:", flights.length);

  if (flights.length === 0) {
    fs.writeFileSync("mbj-debug.html", html);

    throw new Error(
      "No MBJ flights were extracted. Existing flight data was left untouched."
    );
  }

  const output = {
    airport: "MBJ",
    airportName: "Sangster International Airport",
    location: "Montego Bay, Jamaica",
    type: "arrivals",
    source: "Official MBJ Airport website",
    sourceUrl: SOURCE_URL,
    updated: new Date().toISOString(),
    flights
  };

  fs.writeFileSync(
    "flights.json",
    JSON.stringify(output, null, 2)
  );

  fs.writeFileSync(
    "last_updated.txt",
    new Date().toISOString()
  );

  console.log("SUCCESS: MBJ arrivals updated.");
}

main().catch(error => {
  console.error("MBJ UPDATE FAILED:");
  console.error(error);
  process.exit(1);
});
