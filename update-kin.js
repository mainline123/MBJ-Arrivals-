const https = require("https");
const fs = require("fs");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
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

function getJamaicaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day
  };
}

function buildBoardUrl(type, date, startHour) {
  const flightType =
    type === "arrivals" ? "arr" : "dep";

  return (
    `https://www.flightstats.com/v2/api-next/flight-tracker/` +
    `${flightType}/KIN/` +
    `${date.year}/${date.month}/${date.day}/${startHour}` +
    `?numHours=12`
  );
}

function findFlightArrays(value, found = []) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    const looksLikeFlights = value.some(item =>
      item &&
      typeof item === "object" &&
      (
        item.flightNumber ||
        item.carrier ||
        item.url ||
        item.departureTime ||
        item.arrivalTime ||
        item.departureTime24 ||
        item.arrivalTime24
      )
    );

    if (looksLikeFlights) {
      found.push(value);
    }

    for (const item of value) {
      findFlightArrays(item, found);
    }

    return found;
  }

  for (const child of Object.values(value)) {
    findFlightArrays(child, found);
  }

  return found;
}

function extractBoardFlights(json) {
  const arrays = findFlightArrays(json);
  const flights = [];

  for (const array of arrays) {
    for (const flight of array) {
      if (
        flight &&
        typeof flight === "object" &&
        (
          flight.flightNumber ||
          flight.carrier?.flightNumber ||
          flight.url
        )
      ) {
        flights.push(flight);
      }
    }
  }

  return flights;
}

function getCarrierCode(flight) {
  return (
    flight.carrier?.fs ||
    flight.carrierFsCode ||
    flight.carrierCode ||
    flight.airlineCode ||
    ""
  );
}

function getCarrierName(flight) {
  return (
    flight.carrier?.name ||
    flight.carrierName ||
    flight.airline ||
    ""
  );
}

function getFlightNumber(flight) {
  return String(
    flight.carrier?.flightNumber ||
    flight.flightNumber ||
    ""
  );
}

function getFlightUrl(flight) {
  return flight.url || "";
}

function isCodeshare(flight) {
  return Boolean(
    flight.isCodeshare ||
    flight.codeshare ||
    flight.operatedBy
  );
}

/*
 * DUPLICATE FIX:
 * For one day's KIN board, the same airline +
 * flight number should only appear once.
 */
function flightKey(flight, type) {
  const code = getCarrierCode(flight);
  const number = getFlightNumber(flight);

  return `${code}|${number}`;
}

function removeDuplicates(flights, type) {
  const seen = new Set();
  const output = [];

  for (const flight of flights) {
    const key = flightKey(flight, type);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(flight);
  }

  return output;
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

  return JSON.parse(
    html.substring(jsonStart, jsonEnd)
  );
}

function getFlightDetail(data) {
  return (
    data?.props?.initialState?.flightTracker?.flight ||
    {}
  );
}

function formatTime(timeObject) {
  if (!timeObject?.time) {
    return "";
  }

  return `${timeObject.time}${timeObject.ampm || ""}`;
}

function getScheduledTime(airport) {
  return formatTime(
    airport?.times?.scheduled
  );
}

function getLiveTimeInfo(airport) {
  const live =
    airport?.times?.estimatedActual;

  if (!live?.time) {
    return {
      time: "",
      type: ""
    };
  }

  const title =
    String(live.title || "").toLowerCase();

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

function getBoardScheduled(flight, type) {
  if (type === "arrivals") {
    return (
      flight.arrivalTime?.timeAMPM ||
      (
        flight.arrivalTime &&
        flight.arrivalTimeAmPm
          ? `${flight.arrivalTime}${flight.arrivalTimeAmPm}`
          : ""
      ) ||
      flight.arrivalTime24 ||
      ""
    );
  }

  return (
    flight.departureTime?.timeAMPM ||
    (
      flight.departureTime &&
      flight.departureTimeAmPm
        ? `${flight.departureTime}${flight.departureTimeAmPm}`
        : ""
    ) ||
    flight.departureTime24 ||
    ""
  );
}

function getBoardAirport(flight, type) {
  if (type === "arrivals") {
    return (
      flight.departureAirport ||
      flight.airport ||
      {}
    );
  }

  return (
    flight.arrivalAirport ||
    flight.airport ||
    {}
  );
}

function normalizeFlight(
  routeFlight,
  detail,
  type
) {
  const carrier =
    detail?.ticketHeader?.carrier ||
    detail?.resultHeader?.carrier ||
    routeFlight?.carrier ||
    {};

  const airlineCode =
    carrier.fs ||
    getCarrierCode(routeFlight);

  const airlineName =
    carrier.name ||
    getCarrierName(routeFlight);

  const flightNumber =
    detail?.ticketHeader?.flightNumber ||
    detail?.resultHeader?.flightNumber ||
    getFlightNumber(routeFlight);

  const relevantAirport =
    type === "arrivals"
      ? detail?.arrivalAirport
      : detail?.departureAirport;

  const otherAirport =
    type === "arrivals"
      ? detail?.departureAirport
      : detail?.arrivalAirport;

  const boardAirport =
    getBoardAirport(routeFlight, type);

  const routeScheduled =
    getBoardScheduled(routeFlight, type);

  const scheduledTime =
    getScheduledTime(relevantAirport) ||
    routeScheduled;

  const live =
    getLiveTimeInfo(relevantAirport);

  return {
    airlineCode: airlineCode,
    airline: airlineName,
    flightNumber: flightNumber,
    flight:
      `${airlineCode}${flightNumber}`,

    airportCode:
      otherAirport?.fs ||
      otherAirport?.iata ||
      boardAirport?.fs ||
      boardAirport?.iata ||
      "",

    city:
      otherAirport?.city ||
      boardAirport?.city ||
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

    status:
      getStatus(detail),

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
  const code =
    getCarrierCode(flight);

  const number =
    getFlightNumber(flight);

  const airport =
    getBoardAirport(flight, type);

  const scheduledTime =
    getBoardScheduled(flight, type);

  return {
    airlineCode: code,
    airline: getCarrierName(flight),
    flightNumber: number,
    flight: `${code}${number}`,

    airportCode:
      airport?.fs ||
      airport?.iata ||
      "",

    city:
      airport?.city || "",

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

function timeToMinutes(value) {
  if (!value) {
    return 9999;
  }

  const text =
    String(value).trim();

  const twentyFour =
    text.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFour) {
    return (
      Number(twentyFour[1]) * 60 +
      Number(twentyFour[2])
    );
  }

  const twelve =
    text.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );

  if (twelve) {
    let hour =
      Number(twelve[1]);

    const minute =
      Number(twelve[2]);

    const ampm =
      twelve[3].toUpperCase();

    if (hour === 12) {
      hour = 0;
    }

    if (ampm === "PM") {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  return 9999;
}

async function fetchFullDayBoard(type) {
  const date =
    getJamaicaDate();

  const firstUrl =
    buildBoardUrl(
      type,
      date,
      0
    );

  const secondUrl =
    buildBoardUrl(
      type,
      date,
      12
    );

  console.log(
    `\nFetching KIN ${type} 00:00-12:00...`
  );

  const firstBody =
    await fetchPage(firstUrl);

  console.log(
    `Fetching KIN ${type} 12:00-24:00...`
  );

  const secondBody =
    await fetchPage(secondUrl);

  const firstJSON =
    JSON.parse(firstBody);

  const secondJSON =
    JSON.parse(secondBody);

  let flights = [
    ...extractBoardFlights(firstJSON),
    ...extractBoardFlights(secondJSON)
  ];

  console.log(
    `${type}: ${flights.length} raw full-day records found`
  );

  flights =
    removeDuplicates(flights, type);

  console.log(
    `${type}: ${flights.length} after duplicate removal`
  );

  flights =
    flights.filter(
      flight => !isCodeshare(flight)
    );

  console.log(
    `${type}: ${flights.length} operating flights after codeshare removal`
  );

  return flights;
}

async function processBoard(type) {
  const flights =
    await fetchFullDayBoard(type);

  const output = [];

  for (const flight of flights) {
    try {
      const flightName =
        `${getCarrierCode(flight)}${getFlightNumber(flight)}`;

      console.log(
        `Getting details: ${flightName}`
      );

      const url =
        getFlightUrl(flight);

      if (!url) {
        output.push(
          fallbackFlight(
            flight,
            type
          )
        );

        continue;
      }

      const detailUrl =
        url.startsWith("http")
          ? url
          : "https://www.flightstats.com/v2" +
            url;

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

      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

    } catch (err) {
      console.error(
        "Flight detail error:",
        err.message
      );

      output.push(
        fallbackFlight(
          flight,
          type
        )
      );
    }
  }

  output.sort(
    (a, b) =>
      timeToMinutes(a.scheduledTime) -
      timeToMinutes(b.scheduledTime)
  );

  return output;
}

async function run() {
  console.log(
    "KIN FULL-DAY FlightStats updater starting..."
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
      date: getJamaicaDate(),
      updated: updated,
      source: "FlightStats",
      flights: arrivals
    };

    const departuresJSON = {
      airport: "KIN",
      type: "departures",
      date: getJamaicaDate(),
      updated: updated,
      source: "FlightStats",
      flights: departures
    };

    fs.writeFileSync(
      "kin-arrivals.json",
      JSON.stringify(
        arrivalsJSON,
        null,
        2
      )
    );

    fs.writeFileSync(
      "kin-departures.json",
      JSON.stringify(
        departuresJSON,
        null,
        2
      )
    );

    console.log(
      `\nFULL-DAY KIN ARRIVALS: ${arrivals.length}`
    );

    console.log(
      `FULL-DAY KIN DEPARTURES: ${departures.length}`
    );

    console.log(
      `Updated: ${updated}`
    );

    console.log(
      "\nKIN FULL-DAY UPDATE COMPLETE"
    );

  } catch (err) {
    console.error(
      "\nKIN FULL-DAY UPDATE FAILED:",
      err.message
    );

    process.exitCode = 1;
  }
}

run();
