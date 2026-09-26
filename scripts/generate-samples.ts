/**
 * Renders every demo invoice in src/data/samples.ts to public/samples/*.pdf.
 * Run: node scripts/generate-samples.ts   (Node 22+ strips the types)
 *
 * Six deliberately different layouts, because real vendors never agree on one.
 * E2 is rasterised into a rotated, noisy "phone scan" with no text layer.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLES, BUYER, type Sample } from "../src/data/samples.ts";

const OUT = join(import.meta.dirname, "..", "public", "samples");
mkdirSync(OUT, { recursive: true });

const money = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const usDate = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");

const page = (css: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:8.5in} body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
${css}</style></head><body>${body}</body></html>`;

function rows(s: Sample, cols: ("sku" | "desc" | "qty" | "unit" | "amount")[]) {
  return s.truth.lineItems
    .map(
      (l) =>
        `<tr>${cols
          .map((c) =>
            c === "sku" ? `<td>${l.sku ?? ""}</td>` : c === "desc" ? `<td>${l.description}</td>` : c === "qty" ? `<td class="r">${l.qty ?? ""}</td>` : c === "unit" ? `<td class="r">${money(l.unitPrice)}</td>` : `<td class="r">${money(l.amount)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
}

// ---------------------------------------------------------------- layouts

function classic(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:Georgia,'Times New Roman',serif;color:#1b1b1b;padding:.7in .75in;font-size:12.5px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #333;padding-bottom:18px}
    .logo{display:flex;gap:12px;align-items:center}.mark{width:46px;height:46px;border:3px solid #7a1f1f;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#7a1f1f;font-size:20px}
    h1{font-size:34px;letter-spacing:6px;color:#7a1f1f;font-weight:400}.muted{color:#555}
    .meta{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:24px}.meta table td{padding:2px 12px 2px 0}
    table.items{width:100%;border-collapse:collapse;margin-top:26px}.items th{border-bottom:1.5px solid #333;text-align:left;padding:7px 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase}
    .items td{padding:8px 6px;border-bottom:1px solid #ddd}.r{text-align:right}
    .tot{margin-left:auto;width:280px;margin-top:14px}.tot td{padding:4px 6px}.tot tr.g td{border-top:2px solid #333;font-weight:700;font-size:15px}
    .remit{margin-top:34px;border:1px solid #bbb;padding:14px 16px;width:360px;background:#faf8f3}
    .banner{margin-top:18px;border:2px solid #b3261e;color:#b3261e;padding:10px 14px;font-weight:700}
    .foot{position:fixed;bottom:.5in;left:.75in;right:.75in;font-size:10.5px;color:#777;border-top:1px solid #ddd;padding-top:8px}`,
    `<div class="top"><div class="logo"><div class="mark">C</div><div><div style="font-size:19px;font-weight:700">${t.vendorName}</div><div class="muted">${t.vendorAddress}</div><div class="muted">Tax ID ${t.vendorTaxId} · billing@cortex-supply.com</div></div></div><h1>INVOICE</h1></div>
    ${s.banner ? `<div class="banner">${s.banner}</div>` : ""}
    <div class="meta"><div><div class="muted" style="font-size:11px;letter-spacing:1px">BILL TO</div><div style="font-weight:700;margin-top:4px">${BUYER.name}</div><div>${BUYER.address}</div><div>Attn: Accounts Payable</div></div>
    <table><tr><td class="muted">Invoice No.</td><td><b>${t.invoiceNumber}</b></td></tr><tr><td class="muted">Invoice Date</td><td>${longDate(t.invoiceDate)}</td></tr><tr><td class="muted">Due Date</td><td>${longDate(t.dueDate)}</td></tr><tr><td class="muted">Customer PO</td><td>${t.poReference ?? ""}</td></tr><tr><td class="muted">Terms</td><td>Net 30</td></tr></table></div>
    <table class="items"><thead><tr><th>Item</th><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Amount</th></tr></thead><tbody>${rows(s, ["sku", "desc", "qty", "unit", "amount"])}</tbody></table>
    <table class="tot"><tr><td>Subtotal</td><td class="r">${money(t.subtotal)}</td></tr><tr><td>Sales Tax (${t.taxRate}%)</td><td class="r">${money(t.taxAmount)}</td></tr><tr class="g"><td>Total Due (USD)</td><td class="r">$${money(t.total)}</td></tr></table>
    <div class="remit"><div style="font-weight:700;margin-bottom:6px">Remit payment to</div><div>${t.bankName}</div><div>Account: ${t.bankAccountNumber}</div><div>Routing (ABA): ${t.bankRoutingNumber}</div><div>Reference: ${t.invoiceNumber}</div></div>
    <div class="foot">Thank you for your business. Late payments are subject to 1.5% monthly interest. Questions: billing@cortex-supply.com · (219) 555-0142</div>`,
  );
}

function modern(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0f172a;font-size:12px}
    .band{background:#0e7490;color:#fff;padding:28px .7in;display:flex;justify-content:space-between;align-items:flex-end}
    .band h1{font-size:13px;letter-spacing:3px;font-weight:600;opacity:.85}.brand{font-size:24px;font-weight:800;letter-spacing:-.5px}
    .wrap{padding:26px .7in}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;background:#f1f5f9;padding:16px;border-radius:10px}
    .k{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px}.v{font-weight:700;margin-top:3px;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:22px}th{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;text-align:left;padding:8px;border-bottom:2px solid #0e7490}
    td{padding:10px 8px;border-bottom:1px solid #e2e8f0}.r{text-align:right}
    .sum{display:flex;justify-content:space-between;margin-top:22px;gap:30px}.due{background:#0e7490;color:#fff;border-radius:10px;padding:16px 22px;min-width:260px}
    .due .amt{font-size:28px;font-weight:800;margin-top:4px}.lines div{display:flex;justify-content:space-between;padding:3px 0;width:260px}`,
    `<div class="band"><div><div class="brand">brightline</div><div style="opacity:.8;margin-top:2px">${t.vendorName} · ${t.vendorAddress}</div></div><h1>TAX INVOICE</h1></div>
    <div class="wrap"><div class="grid"><div><div class="k">Invoice #</div><div class="v">${t.invoiceNumber}</div></div><div><div class="k">Issued</div><div class="v">${usDate(t.invoiceDate)}</div></div><div><div class="k">Due</div><div class="v">${usDate(t.dueDate)}</div></div><div><div class="k">Your PO</div><div class="v">${t.poReference}</div></div></div>
    <div style="margin-top:18px"><div class="k">Billed to</div><div class="v">${BUYER.name}</div><div>${BUYER.address}</div></div>
    <table><thead><tr><th>SKU</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Line total</th></tr></thead><tbody>${rows(s, ["sku", "desc", "qty", "unit", "amount"])}</tbody></table>
    <div class="sum"><div class="lines"><div><span>Net amount</span><b>$${money(t.subtotal)}</b></div><div><span>Tax @ ${t.taxRate}%</span><b>$${money(t.taxAmount)}</b></div><div style="margin-top:14px;color:#64748b;font-size:11px">Pay by ACH: ${t.bankName}<br>Acct ${t.bankAccountNumber} · ABA ${t.bankRoutingNumber}</div></div>
    <div class="due"><div class="k" style="color:#cffafe">Amount due</div><div class="amt">$${money(t.total)}</div><div style="opacity:.85;margin-top:4px">Net 45 · Tax ID ${t.vendorTaxId}</div></div></div></div>`,
  );
}

function freight(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:'Courier New',Courier,monospace;color:#111;padding:.6in .7in;font-size:12px}
    .hdr{display:flex;justify-content:space-between;border:2px solid #111;padding:12px 14px}.big{font-size:20px;font-weight:700}
    .box{border:1px solid #111;border-top:0;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #111;padding:7px 8px;text-align:left}th{background:#e8e8e8}.r{text-align:right}
    .t{margin-left:auto;width:300px;margin-top:0}.t td{border-top:0}`,
    `<div class="hdr"><div><div class="big">SUMMIT FREIGHT &amp; LOGISTICS</div><div>${t.vendorAddress} · MC# 882104 · DOT# 3310947</div></div><div style="text-align:right"><div class="big">FREIGHT INVOICE</div><div>No. ${t.invoiceNumber}</div></div></div>
    <div class="box"><div><b>BILL TO</b><br>${BUYER.name}<br>${BUYER.address}</div><div><b>INVOICE DATE</b><br>${usDate(t.invoiceDate)}<br><b>DUE</b><br>${usDate(t.dueDate)}</div><div><b>CUSTOMER PO</b><br>${t.poReference}<br><b>SERVICE PERIOD</b><br>Sep 2026</div></div>
    <table><thead><tr><th>CODE</th><th>SERVICE / LANE</th><th class="r">LOADS</th><th class="r">RATE</th><th class="r">CHARGE</th></tr></thead><tbody>${rows(s, ["sku", "desc", "qty", "unit", "amount"])}</tbody></table>
    <table class="t"><tr><td>LINEHAUL TOTAL</td><td class="r">${money(t.subtotal)}</td></tr><tr><td>TAX (exempt: transportation)</td><td class="r">0.00</td></tr><tr><td><b>TOTAL DUE USD</b></td><td class="r"><b>${money(t.total)}</b></td></tr></table>
    <p style="margin-top:22px">Partial billing against PO ${t.poReference}. Remit via ACH to ${t.bankName}, acct ${t.bankAccountNumber}, ABA ${t.bankRoutingNumber}.</p>`,
  );
}

function scanSource(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:'Courier New',monospace;color:#1d2b53;padding:.55in .6in;font-size:13px;background:#fdfdf7}
    .hand{font-family:'Bradley Hand','Marker Felt','Comic Sans MS',cursive;color:#1d3a8a;font-size:17px}
    .hdr{text-align:center;border-bottom:2px solid #1d2b53;padding-bottom:8px}.hdr b{font-size:22px;letter-spacing:2px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #1d2b53;padding:8px}.r{text-align:right}
    .stamp{position:absolute;right:1.4in;top:4.55in;border:3px solid #b91c1c;color:#b91c1c;padding:6px 12px;transform:rotate(-12deg);font-weight:700;font-family:Arial;opacity:.75;font-size:15px}`,
    `<div class="hdr"><b>GREENLEAF PRODUCE CO.</b><div>${t.vendorAddress} · (831) 555-0199</div><div>ORDER / INVOICE</div></div>
    <div style="display:flex;justify-content:space-between;margin-top:14px"><div>SOLD TO: <span class="hand">Halcyon Foods, Columbus</span></div><div>No. <span class="hand" style="font-size:20px">${t.invoiceNumber}</span></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:8px"><div>DATE: <span class="hand">${usDate(t.invoiceDate)}</span></div><div>TERMS: <span class="hand">Net 15</span></div></div>
    <div class="stamp">DELIVERED</div>
    <table><thead><tr><th>QTY</th><th>DESCRIPTION</th><th class="r">PRICE</th><th class="r">AMOUNT</th></tr></thead><tbody>
    ${t.lineItems.map((l) => `<tr><td class="hand">${l.qty}</td><td class="hand">${l.description}</td><td class="r hand">${money(l.unitPrice)}</td><td class="r hand">${money(l.amount)}</td></tr>`).join("")}
    <tr><td></td><td style="height:34px"></td><td></td><td></td></tr></tbody></table>
    <div style="margin-top:14px;text-align:right">TOTAL (prices include ${t.taxRate}% tax): <span class="hand" style="font-size:22px">$${money(t.total)}</span></div>
    <div style="margin-top:4px;text-align:right;font-size:12px">tax included: <span class="hand">$${money(t.taxAmount)}</span></div>
    <div style="margin-top:28px;font-size:12px">Received by: <span class="hand">M. Ortega</span> &nbsp;&nbsp; Thank you!</div>`,
  );
}

function lab(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:'Avenir Next','Segoe UI',Arial,sans-serif;color:#222;padding:.7in .75in;font-size:12px}
    .logo{font-size:22px;font-weight:300;letter-spacing:8px}.logo b{font-weight:700}
    .row{display:flex;justify-content:space-between;margin-top:24px}.lbl{color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1.5px}
    table{width:100%;border-collapse:collapse;margin-top:26px}th{text-align:left;font-weight:600;border-bottom:1px solid #222;padding:8px 4px}td{padding:10px 4px;border-bottom:1px solid #eee}.r{text-align:right}
    .blank{display:inline-block;min-width:130px;border-bottom:1px solid #999}`,
    `<div class="logo"><b>NORDEN</b> LAB</div><div style="color:#666;margin-top:4px">${t.vendorName} · ${t.vendorAddress}</div>
    <div class="row"><div><div class="lbl">Invoice to</div><div style="margin-top:4px;font-weight:600">${BUYER.name}</div><div>${BUYER.address}</div></div>
    <div style="text-align:right"><div class="lbl">Invoice no.</div><div class="blank">&nbsp;</div><div class="lbl" style="margin-top:10px">Date</div><div>${t.invoiceDate}</div><div class="lbl" style="margin-top:10px">Your order</div><div>${t.poReference}</div></div></div>
    <table><thead><tr><th>Art. no.</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Line</th></tr></thead><tbody>${rows(s, ["sku", "desc", "qty", "unit", "amount"])}</tbody></table>
    <div style="margin-top:22px;text-align:right"><div class="lbl">Amount due</div><div style="font-size:14px;margin-top:4px">see monthly statement</div></div>
    <p style="margin-top:40px;color:#888">Payment details will follow with the statement. Tax ID ${t.vendorTaxId}.</p>`,
  );
}

function quote(s: Sample) {
  const t = s.truth;
  return page(
    `body{font-family:'Gill Sans','Trebuchet MS',sans-serif;color:#1f2937;padding:.7in .75in;font-size:12.5px}
    h1{font-size:30px;color:#9a3412;letter-spacing:2px}.pill{display:inline-block;background:#ffedd5;color:#9a3412;padding:4px 10px;border-radius:99px;font-size:11px;margin-top:6px}
    table{width:100%;border-collapse:collapse;margin-top:24px}th{background:#f3f4f6;text-align:left;padding:8px}td{padding:9px 8px;border-bottom:1px solid #e5e7eb}.r{text-align:right}`,
    `<div style="display:flex;justify-content:space-between"><div><div style="font-size:20px;font-weight:700">${t.vendorName}</div><div>${t.vendorAddress}</div></div><div style="text-align:right"><h1>QUOTATION</h1><div class="pill">Valid for 30 days</div></div></div>
    <div style="margin-top:22px;display:flex;justify-content:space-between"><div><b>Prepared for</b><br>${BUYER.name}<br>${BUYER.address}</div><div style="text-align:right">Quote # <b>${t.invoiceNumber}</b><br>Date ${longDate(t.invoiceDate)}<br>Sales rep: Dana Whitfield</div></div>
    <table><thead><tr><th>Item</th><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr></thead><tbody>${rows(s, ["sku", "desc", "qty", "unit", "amount"])}</tbody></table>
    <div style="margin-left:auto;width:260px;margin-top:14px"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>$${money(t.subtotal)}</span></div><div style="display:flex;justify-content:space-between"><span>Est. tax (${t.taxRate}%)</span><span>$${money(t.taxAmount)}</span></div><div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;border-top:2px solid #1f2937;margin-top:6px;padding-top:6px"><span>Quote total</span><span>$${money(t.total)}</span></div></div>
    <p style="margin-top:34px;color:#6b7280">This is a quotation, not a request for payment. To proceed, please issue a purchase order referencing ${t.invoiceNumber}.</p>`,
  );
}

const LAYOUTS = { classic, modern, freight, lab, quote } as const;

// ---------------------------------------------------------------- render

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });

for (const s of SAMPLES) {
  const p = await ctx.newPage();
  const file = join(OUT, s.file);
  if (s.layout === "scan") {
    await p.setContent(scanSource(s), { waitUntil: "load" });
    const png = (await p.screenshot({ type: "png", fullPage: false })).toString("base64");
    // Photograph-like treatment: rotation, uneven exposure, grain, soft focus. The result is image-only (no text layer).
    const photo = `<!doctype html><html><body style="margin:0;width:8.5in;height:11in;background:#6b6b66;overflow:hidden;position:relative">
      <img src="data:image/png;base64,${png}" style="position:absolute;left:.18in;top:.22in;width:8.1in;transform:rotate(-1.8deg);filter:grayscale(.85) contrast(1.18) brightness(.96) blur(.45px);box-shadow:0 8px 30px rgba(0,0,0,.55)">
      <svg width="100%" height="100%" style="position:absolute;inset:0;mix-blend-mode:multiply;opacity:.35"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.18),rgba(0,0,0,.28))"></div></body></html>`;
    await p.setContent(photo, { waitUntil: "load" });
    const jpg = (await p.screenshot({ type: "jpeg", quality: 72 })).toString("base64");
    await p.setContent(`<!doctype html><html><body style="margin:0"><img src="data:image/jpeg;base64,${jpg}" style="width:8.5in;height:11in;display:block"></body></html>`, { waitUntil: "load" });
  } else {
    await p.setContent(LAYOUTS[s.layout](s), { waitUntil: "load" });
  }
  const pdf = await p.pdf({ width: "8.5in", height: "11in", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
  writeFileSync(file, pdf);
  console.log(`✓ ${s.id.padEnd(4)} ${s.file}  (${(pdf.length / 1024).toFixed(0)} KB)`);
  await p.close();
}

await browser.close();
