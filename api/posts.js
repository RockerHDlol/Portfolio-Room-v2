export default async function handler(req, res) {
  try {
    const SHEET_ID = process.env.SHEET_ID;
    const SHEET_GID = process.env.SHEET_GID || "0";

    if (!SHEET_ID) {
      return res.status(500).json({ error: "Missing SHEET_ID env var" });
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/e/2PACX-1vT3BM59K3lxezwlIs62AOfRWRuYpcIGBym_w36AOlULBZUlecYB0sbRm5fTPUPNcZi9h0rWmKI8wREp/pub?output=csv`;
    const r = await fetch(csvUrl);
    if (!r.ok) return res.status(500).json({ error: "Failed to fetch sheet CSV" });

    const csv = await r.text();

    // CSV split that respects quotes
    const lines = csv.trim().split("\n");
    const rows = lines.map((line) =>
      line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"').trim())
    );

    const [header, ...data] = rows;
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

    const items = [];

    for (const row of data) {
      const showRaw = row[idx["Show"]] ?? "";
      const show = String(showRaw).toLowerCase() === "true";
      if (!show) continue;

      const postId = row[idx["PostID"]] ?? "";
      if (!postId) continue;

      const categoryRaw = row[idx["Category"]] ?? "";
      const categories = String(categoryRaw)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const name = row[idx["Name"]] ?? "";
      const subText = row[idx["SubText"]] ?? "";
      const date = row[idx["Date"]] ?? "";
      
      // ✅ Aspect Ratio aus Sheet laden (z.B. "4/5", "16/9", "1/1")
      const aspectRatio = row[idx["AspectRatio"]] ?? "4/5";

      for (const category of categories) {
        items.push({
          category,     // "workPC"
          postId,       // Instagram ID
          name,         // Titel
          subText,      // Untertitel
          date,         // Datum
          aspectRatio,  // ✅ Aspect Ratio
        });
      }
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}