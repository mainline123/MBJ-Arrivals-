const https = require("https");
const fs = require("fs");

const URLS = {
  arrivals: "https://www.flightstats.com/v2/flight-tracker/arrivals/KIN",
  departures: "https://www.flightstats.com/v2/flight-tracker/departures/KIN"
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: HEADERS }, res => {
        let body = "";

        res.on("data", chunk => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`HTTP ${res.statusCode} while requesting ${url}`)
            );
            return;
          }

          resolve(body);
        });
      })
      .on("error", reject);
  });
}

function extractNextData(html) {
  const marker = "__NEXT_DATA__ = ";
  const start = html.indexOf(marker);

  if (start === -1) {
    throw new Error("__NEXT_DATA__ not found");
  }

  const jsonStart = start + marker.length;
  const endMarker = ";__NEXT_LOADED_PAGES__";
  const jsonEnd = html.indexOf(endMarker, jsonStart);

  if (jsonEnd === -1) {
    throw new Error("End of __NEXT_DATA__ not found");
  }

  return JSON.parse(html.substring(jsonStart, jsonEnd));
}

function getRouteFlights(data) {
  return (
    data?.props?.initialState?.flightTracker?.route?.flights || []
  );
}

function getFlightDetail(data) {
  return (
    data?.props?.initialState?.flightTracker?.flight || {}
  );
}

function formatTime(timeObject) {
  if (!timeObject?.time) {
    return "";
  }

  return `${timeObject.time}${timeObject.ampm || ""}`;
}

function getScheduledTime(airport) {
  return formatTime(airport?.times?.scheduled);
}

function getLiveTimeInfo(airport) {
  const live = airport?.times?.estimatedActual;

  if (!live?.time) {
    return {
      time: "",
      type: ""
    };
  }

  const title = String(live.title || "").toLowerCase();

  if (title.includes("actual")) {
    return {
      time: formatTime(live),
      type: "Actual"
    };
  }

  if (title.includes("estimated")) {
    return {
      time: formatTime(live),
      type: "Estimated"
    };
  }

  return {
    time: formatTime(live),
    type: "Updated"
  };
}

function getStatus(detail) {
  return (
    detail?.status?.statusDescription ||
    detail?.resultHeader?.statusDescription ||
    detail?.status?.status ||
    detail?.resultHeader?.status ||
    "Scheduled"
  );
}

function normalizeFlight(routeFlight, detail, type) {
  const carrier =
    detail?.ticketHeader?.carrier ||
    detail?.resultHeader?.carrier ||
    routeFlight?.carrier ||
    {};

  const flightNumber =
    detail?.ticketHeader?.flightNumber ||
    detail?.resultHeader?.flightNumber ||
    routeFlight?.carrier?.flightNumber ||
    "";

  const relevantAirport =
    type === "arrivals"
      ? detail?.arrivalAirport
      : detail?.departureAirport;

  const otherAirport =
    type === "arrivals"
      ? detail?.departureAirport
      : detail?.arrivalAirport;

  const routeScheduled =
    type === "arrivals"
      ? routeFlight?.arrivalTime?.timeAMPM || ""
      : routeFlight?.departureTime?.timeAMPM || "";

  const scheduledTime =
    getScheduledTime(relevantAirport) ||
    routeScheduled;

  const live = getLiveTimeInfo(relevantAirport);

  return {
    airlineCode: carrier.fs || "",
    airline: carrier.name || "",
    flightNumber: flightNumber,
    flight: `${carrier.fs || ""}${flightNumber}`,

    airportCode:
      otherAirport?.fs ||
      routeFlight?.airport?.fs ||
      "",

    city:
      otherAirport?.city ||
      routeFlight?.airport?.city ||
      "",

    scheduledTime: scheduledTime,

    estimatedTime:
      live.type === "Estimated"
        ? live.time
        : "",

    actualTime:
      live.type === "Actual"
        ? live.time
        : "",

    updatedTime:
      live.time,

    timeType:
      live.type || "Scheduled",

    displayTime:
      live.time || scheduledTime,

    status: getStatus(detail),

    gate:
      relevantAirport?.gate || "",

    terminal:
      relevantAirport?.terminal || "",

    baggage:
      type === "arrivals"
        ? relevantAirport?.baggage || ""
        : "",

    flightId:
      detail?.flightId || null,

    source: "FlightStats"
  };
}

function fallbackFlight(flight, type) {
  const scheduledTime =
    type === "arrivals"
      ? flight.arrivalTime?.timeAMPM || ""
      : flight.departureTime?.timeAMPM || "";

  return {
    airlineCode:
      flight.carrier?.fs || "",

    airline:
      flight.carrier?.name || "",

    flightNumber:
      flight.carrier?.flightNumber || "",

    flight:
      `${flight.carrier?.fs || ""}${flight.carrier?.flightNumber || ""}`,

    airportCode:
      flight.airport?.fs || "",

    city:
      flight.airport?.city || "",

    scheduledTime: scheduledTime,
    estimatedTime: "",
    actualTime: "",
    updatedTime: "",
    timeType: "Scheduled",
    displayTime: scheduledTime,

    status: "Scheduled",

    gate: "",
    terminal: "",
    baggage: "",

    flightId: null,
    source: "FlightStats"
  };
}

async function processBoard(type) {
  console.log(`\nFetching KIN ${type}...`);

  const html = await fetchPage(URLS[type]);
  const data = extractNextData(html);

  let flights = getRouteFlights(data);

  console.log(
    `${type}: ${flights.length} schedule records found`
  );

  // Remove codeshares so the same physical flight
  // is not displayed several times.
  flights = flights.filter(
    flight => !flight.isCodeshare
  );

  console.log(
    `${type}: ${flights.length} operating flights after codeshare removal`
  );

  const output = [];

  for (const flight of flights) {
    try {
      if (!flight.url) {
        output.push(
          fallbackFlight(flight, type)
        );
        continue;
      }

      const flightName =
        `${flight.carrier?.fs || ""}${flight.carrier?.flightNumber || ""}`;

      console.log(
        `Getting details: ${flightName}`
      );

      const detailUrl =
        "https://www.flightstats.com/v2" +
        flight.url;

      const detailHtml =
        await fetchPage(detailUrl);

      const detailData =
        extractNextData(detailHtml);

      const detail =
        getFlightDetail(detailData);

      output.push(
        normalizeFlight(
          flight,
          detail,
          type
        )
      );

      // Be gentle with the FlightStats website.
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

    } catch (err) {
      console.error(
        "Flight detail error:",
        err.message
      );

      // Keep the scheduled flight on the board even
      // if its individual detail request fails.
      output.push(
        fallbackFlight(flight, type)
      );
    }
  }

  return output;
}

async function run() {
  console.log(
    "KIN FlightStats updater starting..."
  );

  console.log(
    new Date().toISOString()
  );

  try {
    const arrivals =
      await processBoard("arrivals");

    const departures =
      await processBoard("departures");

    const updated =
      new Date().toISOString();

    const arrivalsJSON = {
      airport: "KIN",
      type: "arrivals",
      updated: updated,
      source: "FlightStats",
      flights: arrivals
    };

    const departuresJSON = {
      airport: "KIN",
      type: "departures",
      updated: updated,
      source: "FlightStats",
      flights: departures
    };

    fs.writeFileSync(
      "kin-arrivals.json",
      JSON.stringify(arrivalsJSON, null, 2)
    );

    fs.writeFileSync(
      "kin-departures.json",
      JSON.stringify(departuresJSON, null, 2)
    );

    console.log(
      `\nKIN arrivals written: ${arrivals.length}`
    );

    console.log(
      `KIN departures written: ${departures.length}`
    );

    console.log(
      `Updated: ${updated}`
    );

    console.log(
      "\nKIN UPDATE COMPLETE"
    );

  } catch (err) {
    console.error(
      "\nKIN UPDATE FAILED:",
      err.message
    );

    process.exitCode = 1;
  }
}

run();
