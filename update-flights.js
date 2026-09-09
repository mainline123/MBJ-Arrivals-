const fs = require("fs");

const ARRIVALS_URL =
  "https://www.mbjairport.com/flights?type=arrivals";

const DEPARTURES_URL =
  "https://www.mbjairport.com/flights?type=departures";


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


/*
  Reads MBJ's status indicator from the ORIGINAL HTML.

  MBJ legend:
  Green  = On-Time
  Blue   = Arrived
  Teal   = Early
  Orange = Delayed
  Red    = Cancelled
*/

function getStatus(rawStatusTd = "") {

  const raw =
    rawStatusTd.toLowerCase();

  if (
    raw.includes("cancel") ||
    raw.includes("#ed0029") ||
    raw.includes("rgb(237, 0, 41)")
  ) {
    return "Cancelled";
  }

  if (
    raw.includes("delay") ||
    raw.includes("#ff6600") ||
    raw.includes("orange")
  ) {
    return "Delayed";
  }

  if (
    raw.includes("early") ||
    raw.includes("teal")
  ) {
    return "Early";
  }

  if (
    raw.includes("arrived") ||
    raw.includes("blue")
  ) {
    return "Arrived";
  }

  if (
    raw.includes("on-time") ||
    raw.includes("on time") ||
    raw.includes("green")
  ) {
    return "On-Time";
  }

  return "";
}


async function fetchPage(url, label) {

  console.log(
    `Fetching MBJ ${label} from official airport website...`
  );

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MBJ-Flight-Board/1.0)",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log(
    `${label} HTTP status:`,
    response.status
  );

  if (!response.ok) {
    throw new Error(
      `MBJ ${label} returned HTTP ${response.status}`
    );
  }

  return await response.text();
}


/* ==================================================
   ARRIVALS
   ================================================== */

function parseArrivals(html) {

  const rows =
    html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  const flights = [];

  for (const row of rows) {

    const tdMatches =
      row.match(/<td[\s\S]*?<\/td>/gi);

    if (!tdMatches) continue;

    const cells =
      tdMatches.map(clean);

    if (cells.length < 5) continue;


    const airlineFlight =
      cells[0];

    const from =
      cells[1];

    const baggage =
      cells[2];


    /*
      MBJ arrival Time column may contain
      scheduled and updated/actual times.
    */

    const timeMatches =
      cells[3].match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const scheduledTime =
      timeMatches[0] ||
      cells[3] ||
      "";

    /*
      MBJ can also place the actual time
      inside the Status TD, so inspect both.
    */

    const rawStatusTd =
      tdMatches[4] || "";

    const statusCell =
      cells[4] || "";

    const statusTimeMatches =
      statusCell.match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const actualTime =
      timeMatches[1] ||
      statusTimeMatches[0] ||
      "";


    /*
      Read MBJ's actual status indicator.
    */

    const status =
      getStatus(rawStatusTd);


    if (!airlineFlight || !from) {
      continue;
    }


    flights.push({
      airlineFlight,
      from,
      baggage,
      scheduledTime,
      actualTime,
      status
    });
  }

  return flights;
}


/* ==================================================
   DEPARTURES

   MBJ OFFICIAL COLUMN ORDER:

   0 Airline/Flight
   1 To
   2 Check-In Counters
   3 Gate
   4 Time
   5 Status
   ================================================== */

function parseDepartures(html) {

  const rows =
    html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  const flights = [];

  for (const row of rows) {

    const tdMatches =
      row.match(/<td[\s\S]*?<\/td>/gi);

    if (!tdMatches) continue;

    const cells =
      tdMatches.map(clean);

    if (cells.length < 6) continue;


    const airlineFlight =
      cells[0];

    const to =
      cells[1];

    const checkInCounters =
      cells[2] || "";

    const gate =
      cells[3] || "";


    /*
      Scheduled departure time.
    */

    const timeMatches =
      cells[4].match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const scheduledTime =
      timeMatches[0] ||
      cells[4] ||
      "";


    /*
      Updated/actual time may be in
      the Status column.
    */

    const statusCell =
      cells[5] || "";

    const statusTimeMatches =
      statusCell.match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const actualTime =
      statusTimeMatches[0] ||
      timeMatches[1] ||
      "";


    /*
      Read MBJ status indicator.
    */

    const rawStatusTd =
      tdMatches[5] || "";

    const status =
      getStatus(rawStatusTd);


    if (!airlineFlight || !to) {
      continue;
    }


    flights.push({
      airlineFlight,
      to,
      checkInCounters,
      gate,
      scheduledTime,
      actualTime,
      status
    });
  }

  return flights;
}


/* ==================================================
   MAIN
   ================================================== */

async function main() {

  /* --------------------
     ARRIVALS
     -------------------- */

  const arrivalsHtml =
    await fetchPage(
      ARRIVALS_URL,
      "arrivals"
    );

  const arrivals =
    parseArrivals(arrivalsHtml);

  console.log(
    "Arrival flights extracted:",
    arrivals.length
  );


  if (arrivals.length === 0) {

    fs.writeFileSync(
      "mbj-arrivals-debug.html",
      arrivalsHtml
    );

    throw new Error(
      "No MBJ arrivals were extracted. Existing flight data was left untouched."
    );
  }


  /* --------------------
     DEPARTURES
     -------------------- */

  const departuresHtml =
    await fetchPage(
      DEPARTURES_URL,
      "departures"
    );

  const departures =
    parseDepartures(departuresHtml);

  console.log(
    "Departure flights extracted:",
    departures.length
  );


  if (departures.length === 0) {

    fs.writeFileSync(
      "mbj-departures-debug.html",
      departuresHtml
    );

    throw new Error(
      "No MBJ departures were extracted. Existing departure data was left untouched."
    );
  }


  const updated =
    new Date().toISOString();


  /* --------------------
     WRITE ARRIVALS
     -------------------- */

  const arrivalsOutput = {

    airport:
      "MBJ",

    airportName:
      "Sangster International Airport",

    location:
      "Montego Bay, Jamaica",

    type:
      "arrivals",

    source:
      "Official MBJ Airport website",

    sourceUrl:
      ARRIVALS_URL,

    updated,

    flights:
      arrivals
  };


  fs.writeFileSync(
    "flights.json",
    JSON.stringify(
      arrivalsOutput,
      null,
      2
    )
  );


  /* --------------------
     WRITE DEPARTURES
     -------------------- */

  const departuresOutput = {

    airport:
      "MBJ",

    airportName:
      "Sangster International Airport",

    location:
      "Montego Bay, Jamaica",

    type:
      "departures",

    source:
      "Official MBJ Airport website",

    sourceUrl:
      DEPARTURES_URL,

    updated,

    flights:
      departures
  };


  fs.writeFileSync(
    "departures.json",
    JSON.stringify(
      departuresOutput,
      null,
      2
    )
  );


  /* --------------------
     LAST UPDATED
     -------------------- */

  fs.writeFileSync(
    "last_updated.txt",
    updated
  );


  console.log(
    "SUCCESS: MBJ arrivals and departures updated."
  );
}


main().catch(error => {

  console.error(
    "MBJ UPDATE FAILED:"
  );

  console.error(error);

  process.exit(1);

});
