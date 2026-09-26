import type { PurchaseOrder, POLine } from "@/lib/types";

const sum = (lines: POLine[]) => Math.round(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0) * 100) / 100;

function po(p: Omit<PurchaseOrder, "total" | "currency"> & { currency?: string }): PurchaseOrder {
  return { currency: "USD", ...p, total: sum(p.lines) };
}

/** Open purchase orders (all totals pre-tax). */
export const PURCHASE_ORDERS: PurchaseOrder[] = [
  po({
    id: "PO-1038",
    vendorId: "V-CORTEX",
    issuedOn: "2026-08-24",
    status: "open",
    description: "Maintenance spares, plant 2",
    lines: [
      { sku: "CX-4410", description: "Stainless steel bearings, 40mm", qty: 200, unitPrice: 18.5 },
      { sku: "CX-2201", description: "Industrial lubricant, 5L", qty: 40, unitPrice: 42 },
    ],
  }),
  po({
    id: "PO-1051",
    vendorId: "V-CORTEX",
    issuedOn: "2026-09-02",
    status: "open",
    description: "Conveyor line upgrade",
    lines: [{ sku: "CX-7800", description: "Conveyor belt assembly, 2m", qty: 4, unitPrice: 1450 }],
  }),
  po({
    id: "PO-1045",
    vendorId: "V-BRIGHTLINE",
    issuedOn: "2026-08-28",
    status: "open",
    description: "Outbound packaging, Q3",
    lines: [
      { sku: "BL-100", description: "Corrugated shipping box, 18x12x10", qty: 5000, unitPrice: 1.2 },
      { sku: "BL-220", description: "Packing tape, 48mm x 100m", qty: 300, unitPrice: 3.1 },
    ],
  }),
  po({
    id: "PO-1042",
    vendorId: "V-SUMMIT",
    issuedOn: "2026-07-30",
    status: "open",
    description: "Q3 outbound freight, Midwest lanes",
    lines: [
      { sku: "SF-FTL", description: "Full truckload, Chicago to Columbus", qty: 20, unitPrice: 1500 },
      { sku: "SF-LTL", description: "LTL consolidation, regional", qty: 40, unitPrice: 250 },
    ],
  }),
  po({
    id: "PO-1060",
    vendorId: "V-GREENLEAF",
    issuedOn: "2026-09-07",
    status: "open",
    description: "Fresh produce, week 37",
    lines: [
      { sku: "GL-TOM", description: "Roma tomatoes, 25lb case", qty: 110, unitPrice: 24 },
      { sku: "GL-LET", description: "Romaine lettuce, 24ct case", qty: 70, unitPrice: 31.5 },
    ],
  }),
  po({
    id: "PO-1061",
    vendorId: "V-GREENLEAF",
    issuedOn: "2026-09-14",
    status: "open",
    description: "Fresh produce, week 38",
    lines: [
      { sku: "GL-TOM", description: "Roma tomatoes, 25lb case", qty: 100, unitPrice: 24 },
      { sku: "GL-ONI", description: "Yellow onions, 50lb sack", qty: 80, unitPrice: 31.5 },
    ],
  }),
  po({
    id: "PO-1070",
    vendorId: "V-NORDEN",
    issuedOn: "2026-09-01",
    status: "open",
    description: "QA lab consumables",
    lines: [{ sku: "NL-PIP", description: "Digital pipette set, 8-channel", qty: 10, unitPrice: 389 }],
  }),
  po({
    id: "PO-1033",
    vendorId: "V-APEX",
    issuedOn: "2026-07-12",
    status: "closed",
    description: "Office furniture refresh",
    lines: [{ sku: "AP-CH12", description: "Ergonomic task chair", qty: 24, unitPrice: 310 }],
  }),
];
