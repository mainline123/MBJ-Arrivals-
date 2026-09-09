const URL =
  "https://www.mbjairport.com/flights?type=arrivals";

async function testStatus() {

  console.log("Downloading MBJ arrivals page...");

  const response = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MBJ-Flight-Board/1.0)",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log("HTTP status:", response.status);

  const html = await response.text();

  const rows =
    html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  console.log("Rows found:", rows.length);

  for (const row of rows) {

    if (!row.includes('class="number"')) {
      continue;
    }

    const airlineMatch =
      row.match(
        /<td[^>]*class="number"[^>]*>([\s\S]*?)<\/td>/i
      );

    if (!airlineMatch) continue;

    const airline =
      airlineMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    let status = "";

    if (
      row.includes("bg-green") ||
      row.includes("text-green")
    ) {
      status = "On-Time";
    }

    else if (
      row.includes("bg-blue") ||
      row.includes("text-blue")
    ) {
      status = "Arrived";
    }

    else if (
      row.includes("bg-teal") ||
      row.includes("text-teal")
    ) {
      status = "Early";
    }

    else if (
      row.includes("bg-orange") ||
      row.includes("text-orange")
    ) {
      status = "Delayed";
    }

    else if (
      row.includes("bg-red") ||
      row.includes("text-red")
    ) {
      status = "Cancelled";
    }

    console.log(
      airline,
      "=>",
      status || "NO STATUS FOUND"
    );
  }
}

testStatus().catch(error => {
  console.error("TEST FAILED:", error);
  process.exit(1);
});
