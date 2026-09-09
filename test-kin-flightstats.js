const https = require("https");

const urls = {
  arrivals: "https://www.flightstats.com/v2/flight-tracker/arrivals/KIN",
  departures: "https://www.flightstats.com/v2/flight-tracker/departures/KIN"
};

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

function findUsefulData(name, html) {
  console.log("\n====================================");
  console.log(`KIN ${name.toUpperCase()}`);
  console.log("====================================");

  console.log("HTML BYTES:", html.length);

  const searches = [
    "flightId",
    "flightNumber",
    "carrierCode",
    "departureAirport",
    "arrivalAirport",
    "departureTime",
    "arrivalTime",
    "scheduled",
    "estimated",
    "actual",
    "status",
    "gate",
    "baggage",
    "Kingston",
    "Norman Manley"
  ];

  console.log("\nFIELD SEARCH:");

  for (const term of searches) {
    const index = html.toLowerCase().indexOf(term.toLowerCase());

    console.log(
      term.padEnd(20),
      index >= 0 ? `FOUND at ${index}` : "NOT FOUND"
    );
  }

  /*
   * Look for Next.js page data.
   * FlightStats is rendered using Next.js, so useful flight
   * information may be embedded inside __NEXT_DATA__.
   */
  const nextMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (nextMatch) {
    console.log("\n*** __NEXT_DATA__ FOUND ***");

    try {
      const nextData = JSON.parse(nextMatch[1]);

      console.log(
        JSON.stringify(nextData, null, 2).substring(0, 15000)
      );
    } catch (err) {
      console.log("Could not parse __NEXT_DATA__:");
      console.log(err.message);

      console.log(
        nextMatch[1].substring(0, 15000)
      );
    }
  } else {
    console.log("\n__NEXT_DATA__ NOT FOUND");

    /*
     * If there is no __NEXT_DATA__, print areas surrounding
     * likely flight fields so we can identify the structure.
     */
    const keywords = [
      "flightNumber",
      "carrierCode",
      "scheduled",
      "estimated",
      "actual",
      "status"
    ];

    for (const keyword of keywords) {
      const index = html.toLowerCase().indexOf(keyword.toLowerCase());

      if (index >= 0) {
        console.log(`\n--- CONTEXT AROUND ${keyword} ---`);

        const start = Math.max(0, index - 1000);
        const end = Math.min(html.length, index + 4000);

        console.log(html.substring(start, end));
      }
    }
  }
}

async function run() {
  console.log("KIN FlightStats flight-data inspection");
  console.log(new Date().toISOString());

  for (const [name, url] of Object.entries(urls)) {
    try {
      const result = await fetchPage(url);

      console.log(`\n${name.toUpperCase()} HTTP STATUS:`, result.status);

      if (result.status === 200) {
        findUsefulData(name, result.body);
      } else {
        console.log("FlightStats did not return HTTP 200.");
      }
    } catch (err) {
      console.error(`${name} ERROR:`, err.message);
    }
  }

  console.log("\nTEST COMPLETE");
}

run();
