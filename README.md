# Foodini

Foodini is a responsive web application that helps users decide what to cook and what to buy. It has two core functions:

1. **Meal preparation and planning**: Find recipes using tags and preferences, choose or randomly select meals, scale portions, and follow cooking instructions. Plan several days ahead, including cooking once for two days.
2. **Shopping list preparation**: Turn planned meals into one categorized shopping list with the quantities needed, then check off purchases while shopping.

The intended audience is the owner and their girlfriend. Keep the interface compact and practical for daily use: simple navigation, readable recipes, meal planning, and a shopping checklist. Avoid promotional copy, oversized headings, decorative panels, and repeated calls to action.

This README is the single source of truth for the product concept, domain rules, and agent work. Update it when agreed requirements change. The sections below describe the intended application; they do not imply that the features are already implemented.

## Current implementation

The frontend in `foodini-ui/` is a working browser-only proof of concept with a Polish interface. It includes:

- Thirteen recipes with measured ingredients and Polish cooking instructions: chickpea curry with brown rice, butter chicken, konjac noodles with chicken and peanut-soy sauce, turkey meatballs, beef stew, a vegetable bake, roasted pork loin, salmon with broccoli and buckwheat in vinaigrette, creamy salmon pasta with sun-dried tomatoes, bolognese with equal dry weights of wheat and chickpea pasta, bigos, chicken salad with garlic sauce, and chicken-and-bacon skewers with zucchini, pepper, and onion.
- Recipe search by name or ingredient (including searches without Polish accents), meal-type filters, tag filters, and random selection from the matching recipes.
- Recipe details with ingredient quantities scaled to the selected portions.
- A 3–7 day planner with 1–8 portions per day, optional two-day batches, meal replacement, and locks that preserve a whole batch.
- Shopping lists grouped by aisle, checkboxes, custom products with quantities and categories, clipboard copying, Web Share API export (to Google Keep, Apple Notes, or messaging), and text-file download.
- Browser `localStorage` persistence with optional cross-device cloud synchronization backed by Cloudflare Pages Functions and Cloudflare D1 (SQLite), secured with a household sync key and protected against database flooding.
- Responsive layouts with three simple tabs in a sticky header, sync status pill indicator, compact recipe rows, and a shopping checklist. The custom-product form expands under `Dodaj produkt`.

The first visit starts with a sample five-day plan for two people. Without cloud synchronization configured, data stays in the current browser and origin; clearing browser storage removes it. When a household sync key is configured in the header sync settings, the plan and shopping list synchronize seamlessly across devices via Cloudflare D1. All photos and fonts are served locally. Photos illustrate the dishes and do not show the exact recipes.

For this POC, selected tags use **AND** matching. When a plan change alters an ingredient's required quantity, that ingredient becomes unchecked; unchanged quantities keep their checkmarks, and custom items remain. Changes to planner settings take effect when the user chooses `Ułóż nowy plan`; locked batches retain their original recipes and portions. The portion selector in recipe details previews ingredient scaling; adding a recipe to the plan uses that plan slot's portions.

Meal types are limited to `lunch` (Obiady) and `dinner` (Kolacje); `Wszystkie` shows both. Dietary tags remain available. None of the seed recipes currently carries the `low-gi` tag. Filters with no matching seed recipes display an empty state. Nutrition calculations and automatic unit conversion are not implemented.

The existing stack is React, TypeScript, Vite, Tailwind CSS, and ESLint. Dependency versions and available scripts are defined in [foodini-ui/package.json](foodini-ui/package.json).

## Language and experience

- **Polish** for the user interface and displayed content: labels, recipe names, descriptions, ingredients, cooking instructions, tags, and shopping categories.
- **English** for code and documentation: types, identifiers, functions, comments, and project guidance.
- Design for phones first, including use in supermarket aisles, and adapt to tablets and desktops.
- Provide three connected views: `Posiłki` (recipes), `Planer` (meal plan), and `Lista zakupów` (shopping list).
- Use clear typography, accessible labels, keyboard navigation, and touch targets of at least 44 × 44 CSS pixels.
- Use the same three navigation tabs in a compact sticky header on phones and larger screens. Keep styling simple and omit marketing elements.

## Product requirements

### Meal preparation and planning

- Start with a seeded catalog of realistic Polish recipes, including measured ingredients, preparation time, portions, and step-by-step instructions.
- Browse recipes and search by recipe name or ingredient.
- Limit meal-type filters to `Obiady` and `Kolacje`, with `Wszystkie` to view both. Also filter by dietary or lifestyle **tags**, such as low GI (`Niski IG`), dairy-free (`Bez nabiału`), quick (`Szybkie`, up to 25 minutes), vegetarian (`Wegetariańskie`), vegan (`Wegańskie`), high-protein (`Wysokobiałkowe`), and one-pot (`Jednogarnkowe`).
- Let users choose a recipe or use `Wylosuj posiłek` to randomly select one that matches the active filters. Show an empty state when nothing matches.
- Show recipe details in a modal, drawer, or dedicated view with ingredients, a portion selector, and cooking instructions.
- Generate a meal plan for **5 days by default**, adjustable from **3 to 7 days**, with a configurable number of portions per day.
- Support optional **two-day batch cooking**: prepare enough portions on the first day, and mark the following day as `Porcja z wczoraj`.
- Allow users to lock a planned meal so regeneration preserves it, and replace or re-roll an individual unlocked meal.

### Shopping list preparation

- Generate a shopping list from the active meal plan.
- Scale each recipe's ingredient quantities by `servings / basePortions`.
- Merge entries only when they have the same ingredient ID and unit. Keep different units separate unless an explicit conversion exists.
- Count a batch-cooked meal once, using the total portions prepared. A leftover day must not add the ingredients again.
- Group items by supermarket aisle, using the categories below.
- Allow users to check and uncheck purchases, with a visible purchased-item count and checked styling.
- Allow custom items such as `Kawa` or `Woda mineralna`.
- Provide `Kopiuj listę` to copy a readable text list for messaging or notes.
- Persist the meal plan, shopping list, custom items, and checked state in browser `localStorage` so they survive refreshes and closing the browser.

For example, a curry recipe with `basePortions = 2` uses 240 g of chickpeas. Planning it for two people over two days means cooking four portions, so the shopping list includes 480 g of chickpeas once. The second day consumes the remaining portions.

## Domain model

These are the intended domain contracts. Keep domain calculations separate from presentation so filtering, portion scaling, and aggregation can be verified independently.

### Recipe (`Recipe`)

| Field             | Type               | Meaning                                                                                 |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `id`              | `string`           | Stable recipe identifier, e.g. `creamy-chickpea-curry`                                  |
| `name`            | `string`           | Polish recipe title                                                                     |
| `description`     | `string`           | Short Polish description                                                                |
| `mealType`        | `MealType`         | Meal category                                                                           |
| `prepTimeMinutes` | `number`           | Preparation time in minutes                                                             |
| `difficulty`      | `Difficulty`       | Recipe difficulty                                                                       |
| `basePortions`    | `number`           | Positive number of portions covered by the base ingredient quantities                   |
| `tags`            | `RecipeTag[]`      | Dietary and lifestyle tags                                                              |
| `ingredients`     | `IngredientItem[]` | Measured ingredients and shopping categories                                            |
| `instructions`    | `string[]`         | Ordered cooking instructions in Polish                                                  |
| `nutrition`       | `NutritionInfo?`   | Optional per-serving nutrition                                                          |
| `imageUrl`        | `string?`          | Optional image URL or placeholder asset                                                 |
| `imageCredit`     | `object?`          | Photo attribution when required: `author`, `sourceUrl`, `licenseName`, and `licenseUrl` |

| Type            | Values or fields                                                                  |
| --------------- | --------------------------------------------------------------------------------- |
| `MealType`      | `lunch` (Obiad), `dinner` (Kolacja)                                               |
| `Difficulty`    | `easy`, `medium`, `hard`                                                          |
| `RecipeTag`     | `low-gi`, `dairy-free`, `quick`, `vegetarian`, `vegan`, `high-protein`, `one-pot` |
| `NutritionInfo` | `caloriesKcal`, `proteinG`, `fatG`, `carbsG`, each a number per serving           |

### Recipe ingredient (`IngredientItem`)

| Field      | Type           | Meaning                                                                    |
| ---------- | -------------- | -------------------------------------------------------------------------- |
| `id`       | `string`       | Stable ingredient identifier used for aggregation, e.g. `canned-chickpeas` |
| `name`     | `string`       | Polish display name, e.g. `Ciecierzyca konserwowa`                         |
| `amount`   | `number`       | Quantity for the recipe's base portions                                    |
| `unit`     | `UnitType`     | Measurement unit                                                           |
| `category` | `ShopCategory` | Shopping aisle category                                                    |

`UnitType`: `g`, `ml`, `pcs`, `tbsp`, `tsp`, `clove`, `can`, `pack`, `pinch`. These are code identifiers; display appropriate Polish unit labels in the UI.

### Shopping categories (`ShopCategory`)

| Identifier          | Polish label          | Examples                               |
| ------------------- | --------------------- | -------------------------------------- |
| `produce`           | Warzywa i owoce       | Vegetables, fruit, fresh herbs         |
| `dairy`             | Nabiał i jaja         | Milk, cheese, eggs, dairy alternatives |
| `bakery`            | Pieczywo              | Bread, rolls                           |
| `meat_fish_tofu`    | Mięso, ryby i tofu    | Poultry, fish, plant proteins          |
| `grains_pantry`     | Produkty sypkie       | Rice, pasta, oats, flour               |
| `canned_condiments` | Przetwory i przyprawy | Canned goods, oils, spices, passata    |
| `other`             | Inne                  | Other groceries and custom items       |

### Meal plan day (`MealPlanDay`)

The initial model assigns one recipe to each day of the plan.

| Field           | Type      | Meaning                                             |
| --------------- | --------- | --------------------------------------------------- |
| `dayIndex`      | `number`  | Zero-based index within the plan                    |
| `dayLabel`      | `string`  | Polish label, e.g. `Dzień 1` or `Poniedziałek`      |
| `recipeId`      | `string`  | Reference to `Recipe.id`                            |
| `servings`      | `number`  | Total portions prepared on a cooking day            |
| `coversDays`    | `number`  | `1` for one day or `2` for a two-day batch          |
| `isLeftoverDay` | `boolean` | Whether this day consumes the preceding day's batch |
| `isLocked`      | `boolean` | Whether plan regeneration must preserve this entry  |

On a cooking day, `servings` already includes all portions for `coversDays`; do not multiply by `coversDays` again. Skip leftover entries when generating ingredient totals. A leftover entry must refer to the same recipe as its cooking day. Replacing or regenerating either day must keep the batch consistent and respect locks on both days. A two-day batch must fit within the plan duration.

### Shopping item (`ShoppingItem`)

| Field          | Type           | Meaning                                                                         |
| -------------- | -------------- | ------------------------------------------------------------------------------- |
| `id`           | `string`       | Unique entry identifier; generated entries must distinguish ingredient and unit |
| `ingredientId` | `string?`      | Ingredient reference for generated entries                                      |
| `name`         | `string`       | Polish display name                                                             |
| `amount`       | `number`       | Total required quantity                                                         |
| `unit`         | `UnitType`     | Measurement unit                                                                |
| `category`     | `ShopCategory` | Shopping aisle category                                                         |
| `isChecked`    | `boolean`      | Whether the item has been purchased                                             |
| `isCustom`     | `boolean`      | Whether the user added it manually                                              |

## Local development

Use Node.js 24 or newer and npm. The test command uses Node's built-in TypeScript support. [foodini-ui/.node-version](foodini-ui/.node-version) selects Node.js 24 for Cloudflare Pages.

Run commands from the frontend directory:

```sh
cd foodini-ui
npm ci
npm run dev
```

Other available commands, also run from `foodini-ui/`:

| Command                | Purpose                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run build`        | Check TypeScript and create the production build                                                 |
| `npm run lint`         | Run ESLint                                                                                       |
| `npm run format`       | Format repository source, configuration, and documentation with Prettier                         |
| `npm run format:check` | Check formatting without changing files                                                          |
| `npm run preview`      | Preview an existing production build locally                                                     |
| `npm test`             | Run domain and saved-data validation tests using Node's built-in test runner                     |
| `npm run check`        | Run tests, lint, and the production build; shared by local development and Cloudflare deployment |

Tests in `foodini-ui/tests/domain.test.ts` cover search and tag matching, portion scaling, aggregation across units, all supported planner settings, batch locks, leftover consistency, quantity changes, and saved-data validation.

## Publishing to Cloudflare Pages from GitHub

The deployment uses Cloudflare Pages' native GitHub integration. Cloudflare installs dependencies, runs tests and lint, builds the frontend, and publishes it. A separate GitHub Actions workflow is not needed. No Cloudflare API token or deployment secret is needed in GitHub for this setup.

### Files required for deployment

The deployed commit must include `foodini-ui/package.json` with the `check` script, `foodini-ui/package-lock.json`, and `foodini-ui/.node-version`. The `check` script runs `npm test && npm run lint && npm run build`.

Commit and push these files, the application source, and local image/font assets to [the GitHub repository](https://github.com/szymbaramichal/foodini). Keep `node_modules/` and `dist/` ignored; each build recreates them. Files present only on your computer are not available to Cloudflare.

### One-time Cloudflare setup

Create a **Pages** project under **Workers & Pages**, choose the GitHub integration, authorize access to `szymbaramichal/foodini`, and select the repository. Use these settings:

| Setting                    | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Production branch          | `main`                                                        |
| Framework preset           | `None` (the build command below is explicit)                  |
| Root directory             | `foodini-ui`                                                  |
| Build command              | `npm ci && npm run check`                                     |
| Build output directory     | `dist`                                                        |
| Build environment variable | `SKIP_DEPENDENCY_INSTALL=1`                                   |
| Node.js version            | `24`, selected by `.node-version` in the root directory above |

Set `SKIP_DEPENDENCY_INSTALL=1` for both production and preview builds. It disables Cloudflare's automatic install so the explicit `npm ci` controls dependency installation. Leave `NODE_VERSION` unset, or keep it consistent with `.node-version` if an existing project already sets it. See the official [Git integration guide](https://developers.cloudflare.com/pages/get-started/git-integration/) and [build-image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

Save and deploy. Cloudflare supplies the project's `*.pages.dev` address. Subsequent pushes to `main` trigger production deployments; other branches can generate preview deployments according to the project's branch settings.

### Everyday changes

1. Run `npm run check` from `foodini-ui/` before pushing.
2. Push to `main`, or use a feature branch and review the Cloudflare preview before merging.
3. Cloudflare runs the install and checks, then publishes the successful build.

Cloudflare runs the tests and lint before building, so a failed check prevents that deployment even when changes are pushed directly to `main`. The current site stays on its previous successful deployment. There is no separate deployment workflow, Wrangler configuration, or Worker required for this static app.

If the build reports `Missing script: "check"`, compare the commit hash at the start of the build log with the commit containing the script. Commit and push the missing files, then deploy the new commit. Retrying an old deployment uses the old source. If the log still detects Node.js 22, check the root directory and set `NODE_VERSION=24` for the relevant Cloudflare environment, or ensure `.node-version` was committed.

After the first deployment, check recipe images, open a recipe, generate a plan, and check off a shopping item. Hosting still uses browser-local storage: the hosted site starts with its own sample plan, and it does not synchronize data with localhost, previews, other devices, or another browser.

## POC source map and assets

| Path                               | Responsibility                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `foodini-ui/src/App.tsx`           | Connected recipe, planner, and shopping views                                          |
| `foodini-ui/src/components/`       | Recipe details, household sync dialog, and shared SVG icons                            |
| `foodini-ui/src/data/recipes.ts`   | Thirteen Polish recipes, tag labels, units, and shopping categories                    |
| `foodini-ui/src/types.ts`          | Domain types                                                                           |
| `foodini-ui/src/domain.ts`         | Filtering, plan generation, batch operations, scaling, and aggregation                 |
| `foodini-ui/src/storage.ts`        | Initial sample state and validation of persisted data                                  |
| `foodini-ui/src/sync.ts`           | Client-side sync manager, remote fetch/push, and key persistence                       |
| `foodini-ui/functions/api/sync.ts` | Cloudflare Pages Function endpoint: auth check, payload validation, and D1 SQLite sync |
| `foodini-ui/schema.sql`            | Cloudflare D1 SQLite database schema for household state persistence                   |
| `foodini-ui/tests/sync.test.ts`    | Unit tests for sync authentication, payload limits, and D1 upsert logic                |
| `foodini-ui/public/images/`        | Local illustrative food photos                                                         |
| `foodini-ui/public/fonts/`         | Bundled DM Sans font and its OFL license; used throughout the interface                |

Illustrative photos are from Unsplash: [chickpea curry](https://unsplash.com/photos/RELOvb0rrCE), [butter chicken](https://images.unsplash.com/photo-1603894584373-5ac82b2ae398), [noodles](https://unsplash.com/photos/EDoy1yjPLV0), [meatballs](https://images.unsplash.com/photo-1529042410759-befb1204b468), [stew](https://unsplash.com/photos/gbtQfadV5qY), [vegetable casserole](https://unsplash.com/photos/uHggZfKi8Ks), and [roasted meat](https://images.unsplash.com/photo-1432139555190-58524dae6a55). Font license: [DM Sans](foodini-ui/public/fonts/DM-Sans-OFL.txt).

Additional Unsplash photos: [salmon and broccoli](https://unsplash.com/photos/1tfY-1x5kV0), [salmon pasta](https://unsplash.com/photos/vQeLS0R9wiw), [bolognese](https://unsplash.com/photos/qits91IZv1o), [chicken salad](https://unsplash.com/photos/4V1TfWW8PtI), and [skewers](https://unsplash.com/photos/RfpGZ2x6COA). These use the [Unsplash License](https://unsplash.com/license). The bigos photo is [Bigos - 2025.02.15.jpg by Aw58](https://commons.wikimedia.org/wiki/File:Bigos_-_2025.02.15.jpg), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), served as a resized Wikimedia thumbnail. Its attribution and license link are displayed with the recipes; retain them when reusing the image.

## Guidance for agents and contributors

1. Read this README before changing the application. Inspect the relevant code and `package.json` to establish what is actually implemented.
2. Keep work aligned with the two core functions and the Polish UI / English code convention. Treat planned requirements as a target, and report implementation status accurately.
3. Use the existing React, TypeScript, and Vite setup. Keep domain logic independent of UI components, and use stable identifiers for recipes and ingredients.
4. Preserve active filters when selecting random meals, locked entries when regenerating plans, and batch consistency when replacing meals. Never silently select recipes outside the user's active filters.
5. Validate positive portion counts and base portions. Preserve ingredient units and avoid duplicate counting of leftovers.
6. Keep custom shopping items and purchased state usable when updating the list. If a requirement leaves a material product decision unresolved, make the assumption explicit and confirm it before treating it as an agreed rule.
7. For application changes, run `npm run check` from `foodini-ui/` (tests, lint, and production build). Add focused tests when introducing domain calculations, especially portion scaling, ingredient aggregation, and batch cooking. Check affected flows on mobile and desktop when changing the UI.
8. Update this README when agreed requirements, setup commands, or implementation status change. Keep product rules here; other documentation should link here rather than repeat them.

The POC defaults above can be refined as the product develops. Further scope decisions remain open, including multiple meal slots per day, configurable AND/OR tag matching, a larger recipe catalog, and synchronization between devices. The initial domain model describes one recipe per day; expand it when that scope is agreed.
