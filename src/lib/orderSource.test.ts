import assert from "node:assert/strict";
import test from "node:test";

const values = new Map<string, string>();
let standalone = false;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    matchMedia: () => ({ matches: standalone }),
    navigator: {},
  },
});

const { buildQrOrderUrl, captureOrderSource, getOrderSource } = await import("./orderSource.ts");

test.beforeEach(() => {
  values.clear();
  standalone = false;
});

test("QR attribution is sanitised and retained for checkout", () => {
  const captured = captureOrderSource(
    "?source=qr&campaign=Lunch%3Cscript%3E&location=Waterford&table=A-12",
  );

  assert.equal(captured.channel, "qr");
  assert.equal(captured.campaign, "Lunchscript");
  assert.equal(captured.location, "Waterford");
  assert.equal(captured.table, "A-12");
  assert.equal(getOrderSource().channel, "qr");
});

test("expired attribution safely falls back to installed PWA detection", () => {
  values.set("street-eatz-order-source-v1", JSON.stringify({
    channel: "qr",
    capturedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  }));
  standalone = true;

  assert.equal(getOrderSource().channel, "pwa");
});

test("QR URL generation keeps campaign context on the public QR entry route", () => {
  const url = new URL(buildQrOrderUrl("https://streeteatzwaterford.ie", {
    campaign: "counter-one",
    location: "Waterford",
    table: "7",
  }));

  assert.equal(url.origin, "https://streeteatzwaterford.ie");
  assert.equal(url.pathname, "/qr/order");
  assert.equal(url.searchParams.get("campaign"), "counter-one");
  assert.equal(url.searchParams.get("location"), "Waterford");
  assert.equal(url.searchParams.get("table"), "7");
});
