const https = require("https");

const ARRIVALS_URL =
  "https://www.flightstats.com/v2/flight-tracker/arrivals/KIN";

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };

    https.get(url, options, res => {
      let body = "";

      res.on("data", chunk => {
        body += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body
        });
      });
    }).on("error", reject);
  });
}

function extractNextData(html) {
  /*
   * FlightStats writes:
   * __NEXT_DATA__ = {...};
   * rather than using a script tag with id="__NEXT_DATA__".
   */
  const marker = "__NEXT_DATA__ = ";
  const start = html.indexOf(marker);

  if (start === -1) {
    throw new Error("__NEXT_DATA__ assignment not found");
  }

  const jsonStart = start + marker.length;
  const endMarker = ";__NEXT_LOADED_PAGES__";
  const jsonEnd = html.indexOf(endMarker, jsonStart);

  if (jsonEnd === -1) {
    throw new Error("Could not find end of __NEXT_DATA__");
  }

  const jsonText = html.substring(jsonStart, jsonEnd);

  return JSON.parse(jsonText);
}

function getFlights(data) {
  return (
    data?.props?.initialState?.flightTracker?.route?.flights || []
  );
}

function inspectIndividualFlight(html) {
  console.log("\n====================================");
  console.log("INDIVIDUAL FLIGHT PAGE INSPECTION");
  console.log("====================================");

  console.log("HTML BYTES:", html.length);

  const terms = [
    "status",
    "statusCode",
    "statusDescription",
    "scheduled",
    "estimated",
    "actual",
    "gate",
    "terminal",
    "baggage",
    "baggageClaim",
    "departureGate",
    "arrivalGate",
    "departureTerminal",
    "arrivalTerminal"
  ];

  console.log("\nFIELD SEARCH:");

  for (const term of terms) {
    const index = html.toLowerCase().indexOf(term.toLowerCase());

    console.log(
      term.padEnd(22),
      index >= 0 ? `FOUND at ${index}` : "NOT FOUND"
    );
  }

  try {
    const data = extractNextData(html);

    const flight =
      data?.props?.initialState?.flightTracker?.flight || {};

    console.log("\n*** FLIGHT OBJECT FOUND ***");

    console.log(
      JSON.stringify(flight, null, 2).substring(0, 30000)
    );

  } catch (err) {
    console.log("\nCould not parse individual flight data:");
    console.log(err.message);

    /*
     * Show surrounding text for useful fields if parsing fails.
     */
    const usefulTerms = [
      "status",
      "actual",
      "estimated",
      "gate",
      "baggage"
    ];

    for (const term of usefulTerms) {
      const index = html.toLowerCase().indexOf(term);

      if (index >= 0) {
        console.log(`\n--- CONTEXT AROUND ${term} ---`);

        const start = Math.max(0, index - 1000);
        const end = Math.min(html.length, index + 5000);

        console.log(html.substring(start, end));
      }
    }
  }
}

async function run() {
  console.log("KIN individual-flight FlightStats test");
  console.log(new Date().toISOString());

  try {
    /*
     * STEP 1:
     * Get today's KIN arrivals.
     */
    const arrivals = await fetchPage(ARRIVALS_URL);

    console.log("\nKIN ARRIVALS HTTP STATUS:", arrivals.status);

    if (arrivals.status !== 200) {
      throw new Error("Could not retrieve KIN arrivals page");
    }

    const arrivalsData = extractNextData(arrivals.body);
    const flights = getFlights(arrivalsData);

    console.log("FLIGHTS FOUND:", flights.length);

    if (!flights.length) {
      throw new Error("No KIN flights found");
    }

    /*
     * Prefer a non-codeshare flight.
     */
    const selected =
      flights.find(f => !f.isCodeshare) || flights[0];

    console.log("\nSELECTED FLIGHT:");
    console.log(
      `${selected.carrier?.fs || ""}${selected.carrier?.flightNumber || ""}`
    );
    console.log(
      "AIRLINE:",
      selected.carrier?.name || "Unknown"
    );
    console.log(
      "FROM:",
      selected.airport?.city || selected.airport?.fs || "Unknown"
    );
    console.log(
      "ARRIVAL:",
      selected.arrivalTime?.timeAMPM || "Unknown"
    );
    console.log(
      "FLIGHTSTATS PATH:",
      selected.url
    );

    /*
     * STEP 2:
     * Open that flight's individual tracker page.
     */
    const flightUrl =
      "https://www.flightstats.com/v2" + selected.url;

    console.log("\nREQUESTING:");
    console.log(flightUrl);

    const detail = await fetchPage(flightUrl);

    console.log(
      "\nINDIVIDUAL FLIGHT HTTP STATUS:",
      detail.status
    );

    if (detail.status === 200) {
      inspectIndividualFlight(detail.body);
    } else {
      console.log(
        "Individual FlightStats page did not return HTTP 200."
      );
    }

  } catch (err) {
    console.error("\nTEST ERROR:", err.message);
    process.exitCode = 1;
  }

  console.log("\nTEST COMPLETE");
}

run();
