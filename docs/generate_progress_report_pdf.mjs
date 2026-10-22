import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] || "NOVA_COMPLIANCE_PROGRESS_REPORT";
const htmlPath = path.join(__dirname, `${name}.html`);
const pdfPath = path.join(__dirname, `${name}.pdf`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log("Wrote", pdfPath);
