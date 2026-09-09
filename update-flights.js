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


/* ==================================================
   MBJ STATUS DETECTION

   CONFIRMED FROM THE OFFICIAL MBJ WEBSITE:

   green  = On-Time
   blue   = Arrived
   teal   = Early
   orange = Delayed
   red    = Cancelled
   ================================================== */

function getStatus(rawHtml = "") {

  const raw =
    rawHtml.toLowerCase();

  if (
    raw.includes("bg-red") ||
    raw.includes("text-red")
  ) {
    return "Cancelled";
  }

  if (
    raw.includes("bg-orange") ||
    raw.includes("text-orange")
  ) {
    return "Delayed";
  }

  if (
    raw.includes("bg-blue") ||
    raw.includes("text-blue")
  ) {
    return "Arrived";
  }

  if (
    raw.includes("bg-teal") ||
    raw.includes("text-teal")
  ) {
    return "Early";
  }

  if (
    raw.includes("bg-green") ||
    raw.includes("text-green")
  ) {
    return "On-Time";
  }

  return "";
}


/* ==================================================
   FETCH MBJ PAGE
   ================================================== */

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
      ARRIVAL SCHEDULED TIME
    */

    const scheduledMatches =
      cells[3].match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const scheduledTime =
      scheduledMatches[0] ||
      cells[3] ||
      "";


    /*
      ARRIVAL UPDATED / ACTUAL TIME

      MBJ places this in the status column.
    */

    const statusCell =
      cells[4] || "";

    const actualMatches =
      statusCell.match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];

    const actualTime =
      actualMatches[0] || "";


    /*
      REAL MBJ STATUS
    */

    const rawStatusTd =
      tdMatches[4] || "";

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

   MBJ COLUMN ORDER:

   0 Airline / Flight
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
      DEPARTURE TIME

      MBJ can place BOTH the original
      scheduled time and an updated time
      inside this cell.

      Example:

      1:00 PM 1:50 PM

      We want:

      scheduledTime = 1:00 PM
      actualTime    = 1:50 PM
    */

    const departureTimeMatches =
      cells[4].match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];


    const scheduledTime =
      departureTimeMatches[0] ||
      cells[4] ||
      "";


    /*
      MBJ may also repeat the updated time
      in the Status column.

      First use a second time from the
      Time column. If there isn't one,
      check the Status column.
    */

    const statusCell =
      cells[5] || "";

    const statusTimeMatches =
      statusCell.match(
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi
      ) || [];


    const actualTime =
      departureTimeMatches[1] ||
      statusTimeMatches[0] ||
      "";


    /*
      REAL MBJ STATUS
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


  console.log(
    "\nARRIVAL STATUS RESULTS:"
  );

  for (const flight of arrivals) {

    console.log(
      `${flight.airlineFlight} => ${flight.status || "NO STATUS"}`
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
    "\nDeparture flights extracted:",
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


  console.log(
    "\nDEPARTURE STATUS RESULTS:"
  );

  for (const flight of departures) {

    console.log(
      `${flight.airlineFlight} => ${flight.status || "NO STATUS"}`
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
    "\nSUCCESS: MBJ arrivals and departures updated."
  );
}


main().catch(error => {

  console.error(
    "MBJ UPDATE FAILED:"
  );

  console.error(error);

  process.exit(1);

});
