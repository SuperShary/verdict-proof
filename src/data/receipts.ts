import type { Receipt } from "@/lib/types";

/** Goods-received notes. Services POs (freight) have no receipts. */
export const RECEIPTS: Receipt[] = [
  { id: "GRN-5501", poId: "PO-1038", receivedOn: "2026-09-12", lines: [{ sku: "CX-4410", qtyReceived: 200 }, { sku: "CX-2201", qtyReceived: 40 }] },
  { id: "GRN-5514", poId: "PO-1045", receivedOn: "2026-09-15", lines: [{ sku: "BL-100", qtyReceived: 5000 }, { sku: "BL-220", qtyReceived: 300 }] },
  { id: "GRN-5520", poId: "PO-1051", receivedOn: "2026-09-19", lines: [{ sku: "CX-7800", qtyReceived: 4 }] },
  { id: "GRN-5523", poId: "PO-1070", receivedOn: "2026-09-16", lines: [{ sku: "NL-PIP", qtyReceived: 10 }] },
];
