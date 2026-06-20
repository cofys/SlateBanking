import fs from "fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync("wiki.html", "utf-8");
const dom = new JSDOM(html);
const text = dom.window.document.body.textContent;
fs.writeFileSync("wiki.txt", text?.replace(/\s+/g, " ") || "");
console.log("Done extracting");
