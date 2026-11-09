# Frisco Shopper Performance & API Architecture Guide

Technical reference documenting the performance analysis, reverse-engineered Frisco.pl REST API, and architectural roadmap to reduce cart preparation time from ~5–10 minutes down to **under 5 seconds**.

---

## 1. Bottleneck Analysis of UI/DOM Automation

The initial `frisco-browser.ts` implementation relied entirely on browser UI automation (simulated mouse clicks and DOM polling). For a 30-item grocery list, this introduced severe latency:

1. **Two Full Page Navigations per Item (`page.goto`)**:
   - `https://www.frisco.pl/q,<query>/stn,searchResults`
   - `https://www.frisco.pl/pid,<id>/stn,product`
   - Each navigation triggers a full reload of Frisco's heavy Single Page Application (SPA), downloading JavaScript bundles, CSS stylesheets, web fonts, tracking beacons, and product images (~1.5–3.0 s per page).
2. **Hardcoded Artificial Delays (`waitForTimeout`)**:
   - 2500 ms wait after search results navigation
   - 1500 ms wait after product page navigation
   - 1500 ms wait after clicking "Add to cart"
   - Totaling **5.5 seconds of artificial sleep per item**.
3. **Sequential Processing**:
   - 30 items × ~8 seconds = **~240 seconds (4 minutes)** of pure browser execution time under ideal network conditions.
   - Any ambiguous results requiring human-in-the-loop clarifications stretched total turnaround time to 8–10 minutes.

---

## 2. Reverse-Engineered Frisco.pl REST API

Frisco.pl is a client-side SPA that queries an internal REST API under `/app/commerce/api/v1/`. Direct HTTP calls complete in **100–200 ms** rather than 8 seconds.

### 2.1. Authentication & Headers

- **Session JWT**: Stored in the browser cookie named `sessionIdN`.
- **Authorization Header**: `Authorization: Bearer <sessionIdN>`
- **User ID**: Found in the JWT payload or captured from API URLs (e.g. `1734113`).

### 2.2. Fast Product Search Endpoint (JSON)

```http
GET /app/commerce/api/v1/users/{userId}/offer/products/query?search={query}&pageSize={limit}
Authorization: Bearer {sessionIdN}
Accept: application/json
```

- **Response latency**: ~150 ms.
- **Key Response Fields**:
  - `products[].productId`: Unique product identifier (PID).
  - `products[].product.name.pl`: Polish display title.
  - `products[].product.brand`: Manufacturer / brand name.
  - `products[].product.price.price`: Current unit price in PLN.
  - `products[].product.isAvailable`: Stock availability flag.
  - `products[].product.stock`: Exact stock count in the distribution warehouse.
  - `products[].product.grammage` & `unitOfMeasure`: Numeric weight/volume (e.g. `0.85` kg), eliminating brittle regex parsing from UI text.

### 2.3. Fast Cart Status & Delivery Progress Endpoint (JSON)

```http
GET /app/commerce/api/v1/users/{userId}/cart
Authorization: Bearer {sessionIdN}
Accept: application/json
```

- **Response latency**: ~100 ms.
- Returns the complete list of cart items, product objects, quantities, line pricing, and delivery thresholds (`pricing.tillFreeDelivery`).

### 2.4. Product Add / Mutation Endpoint (JSON)

```http
POST /app/commerce/api/v1/users/{userId}/calendar/Van/products/{productId}
Authorization: Bearer {sessionIdN}
Content-Type: application/json

{
  "postcode": "03-840",
  "shippingAddress": { ... }
}
```

Can be invoked directly via `fetch()` inside the authenticated Playwright browser context (`page.evaluate()`) without leaving the active tab.

### 2.5. Cart Item Deletion

On the cart page (`https://www.frisco.pl/stn,cart`):

- **Delete Button Selector**: `button.horizontal-product-box__delete-button` or `.mini-product-box_remove`.
- Directly removes the item in one click. Note: Decrementing quantity with the minus button on individual product pages (`/pid,...`) often fails to drop items when reaching 0.

---

## 3. Performance Optimization Roadmap (100x Speedup)

| Optimization Tier               | Implementation Strategy                                                               | Expected Duration for 30 Items |
| :------------------------------ | :------------------------------------------------------------------------------------ | :----------------------------- |
| **Baseline**                    | Full DOM automation, 2x `page.goto` per item, 5.5s sleep per item                     | ~250–600 seconds (4–10 min)    |
| **Tier 1 (Quick Win)**          | Add to cart directly from search results view without opening `/pid,...`              | ~90–120 seconds                |
| **Tier 2 (ID Cache)**           | When `productId` exists in `mappings.json`, bypass search completely and add directly | ~40–60 seconds                 |
| **Tier 3 (Target: Hybrid API)** | Leverage `page.evaluate(fetch)` or `page.request` with the session JWT bearer token   | **3–5 seconds**                |

---

## 4. Key Rules for Agents & Contributors

1. **Always persist resolved `productId` into `mappings.json`**:
   - Once a product match is confirmed (e.g. chicken breast `132948`, washed baby spinach `41809`), save its `productId` to prevent redundant search queries on subsequent orders.
2. **Avoid hardcoded `waitForTimeout` calls**:
   - Prefer `waitForSelector`, network idle detection, or direct API evaluation.
3. **Delete items only via the `/stn,cart` page**:
   - Always target `button.horizontal-product-box__delete-button` on the cart view to reliably remove unwanted items.
4. **Account for the automatic promotional leaflet**:
   - Frisco automatically appends a free promotional flyer (`FRISCO Ulotka hity tygodnia`, pid `157372`, price `0.00 zł`). A 30-item Foodini grocery list will therefore result in 31 total lines in Frisco's backend cart.
