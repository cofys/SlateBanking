import fs from "fs";
import https from "https";

https.get("https://cityrp.wiki.gg/wiki/CityCorp_Rest_API", (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    fs.writeFileSync("wiki.html", data);
    console.log("Done");
  });
});
