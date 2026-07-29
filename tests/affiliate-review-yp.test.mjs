import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { produce } from "../blueprints/affiliate-review/producer.mjs";

const verificationMeta =
  '<meta name="verify-yeahpromos" content="ac599e312f5c">';
const input = {
  site_name: "Demo Tech Offers",
  domain: "example.com",
  demo_mode: true,
  raw_text:
    "Example Headphones official https://example.com/products/headphones affiliate https://example.com/go/headphones",
};

test("YP variant adds one YeahPromos verification meta to every page head", async () => {
  const result = await produce({
    input: { ...input, variant: "affiliate-review-yp" },
  });

  assert.equal(result.variant, "affiliate-review-yp");
  for (const page of result.pages) {
    const head = page.astroBody.slice(
      page.astroBody.indexOf("<head>"),
      page.astroBody.indexOf("</head>")
    );
    assert.equal(head.split(verificationMeta).length - 1, 1, page.route);
    assert.equal(page.astroBody.split(verificationMeta).length - 1, 1, page.route);
  }
});

test("default affiliate variant does not add YeahPromos verification", async () => {
  const result = await produce({ input });

  assert.equal(result.variant, "affiliate-brand-hub+review-revneey-golden-v5");
  for (const page of result.pages) {
    assert.equal(page.astroBody.includes(verificationMeta), false, page.route);
  }
});

test("YP example is an explicit demo and does not claim a customer domain", () => {
  const example = JSON.parse(
    readFileSync(
      new URL("../blueprints/affiliate-review/examples/yp.json", import.meta.url),
      "utf8"
    )
  );

  assert.equal(example.demo_mode, true);
  assert.equal(Object.hasOwn(example, "domain"), false);
});
