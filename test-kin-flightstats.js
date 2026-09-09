const https = require("https");

const urls = {
  arrivals: "https://www.flightstats.com/v2/flight-tracker/arrivals/KIN",
  departures: "https://www.flightstats.com/v2/flight-tracker/departures/KIN"
};

function testPage(name, url) {
  return new Promise((resolve) => {

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };

    https.get(url, options, (res) => {

      console.log("\n==============================");
      console.log(`KIN ${name.toUpperCase()}`);
      console.log("==============================");
      console.log("HTTP STATUS:", res.statusCode);
      console.log("CONTENT TYPE:", res.headers["content-type"]);

      let body = "";

      res.on("data", chunk => {
        body += chunk;
      });

      res.on("end", () => {

        console.log("BYTES RECEIVED:", body.length);

        const lower = body.toLowerCase();

        console.log(
          "CONTAINS KIN:",
          lower.includes("kin")
        );

        console.log(
          "CONTAINS FLIGHT:",
          lower.includes("flight")
        );

        console.log(
          "CONTAINS STATUS:",
          lower.includes("status")
        );

        console.log("\nFIRST 1000 CHARACTERS:");
        console.log(body.substring(0, 1000));

        resolve();
      });

    }).on("error", err => {
      console.error(`${name} ERROR:`, err.message);
      resolve();
    });

  });
}

async function run() {

  console.log("Testing FlightStats access from GitHub/Node...");
  console.log(new Date().toISOString());

  await testPage("arrivals", urls.arrivals);
  await testPage("departures", urls.departures);

  console.log("\nTEST COMPLETE");
}

run();
