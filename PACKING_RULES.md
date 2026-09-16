PACKING APP — MASTER PACKING ENGINE SPECIFICATION

This document describes the packing rules for my warehouse packing application.

Treat this as the authoritative functional specification when working on:

- boxEngine.js
- pdfProcessor.js
- product classification
- packing groups
- Needs Review logic
- item quantity calculations
- grouped packing PDFs

DO NOT rewrite or simplify these rules without my permission.

==================================================
CORE PURPOSE
==================================================

The packing app receives order PDFs.

Each order normally contains:

1 shipping-label page
1 packing-slip page

The system must:

1. Parse every order.
2. Read all products and quantities.
3. Determine physical quantities.
4. Classify products.
5. Determine the correct physical shipping box.
6. Keep the shipping label and packing slip together.
7. Group orders by packing box.
8. Alphabetize orders by Buyer Nickname within each group.
9. Generate grouped PDFs.
10. Calculate total physical items needed.
11. Update the Google Sheets picking checklist.
12. Verify that no pages disappeared or duplicated.
13. Generate the final ZIP.

Packing logic must NEVER sacrifice page verification.

==================================================
SECTION 1 — PHYSICAL SHIPPING BOXES
==================================================

These are the physical shipping boxes currently used:

6x6x6

8x8x4

8x8x8

11x11x5

11x11x7

11x11x9

13x10x4

13x10x6

13x10x8

16x12x4

16x12x6

16x12x8

24-series boxes

There are also three special packing classifications:

Packs Only

Sleeved Packs

Needs Review

==================================================
SECTION 2 — FINAL PDF GROUPS
==================================================

Individual physical boxes are consolidated into PDF groups.

6x6x6
→ 6_Box.pdf

8x8x4
→ 8x8x4.pdf

8x8x8
→ 8x8x8.pdf

11x11x5
11x11x7
11x11x9
→ 11_Box.pdf

13x10x4
13x10x6
13x10x8
→ 13_Box.pdf

16x12x4
16x12x6
16x12x8
→ 16_Box.pdf

24-series
→ 24_Box.pdf

Packs Only
→ Packs_Only.pdf

Sleeved Packs
→ Sleeved_Packs.pdf

Needs Review
→ Needs_Review.pdf

IMPORTANT:

Even when several exact box sizes share one PDF, the exact packing-box decision must still be preserved internally.

==================================================
SECTION 3 — PRODUCT TYPE IS MORE IMPORTANT THAN SET NAME
==================================================

This is one of the most important principles in the system.

DO NOT create separate physical packing logic for every Pokémon set.

Use:

PRODUCT TYPE
→ PHYSICAL SIZE CATEGORY

NOT:

POKÉMON SET NAME
→ UNIQUE SIZE

For example:

Chaos Rising Booster Bundle
Pitch Black Booster Bundle
Perfect Order Booster Bundle
Future Set Booster Bundle

are all:

BOOSTER BUNDLES

and should use the same physical-size classification.

Similarly:

Chaos Rising Booster Pack
Pitch Black Booster Pack
Perfect Order Booster Pack
Japanese Booster Pack

are all:

LOOSE BOOSTER PACKS

if they are normal unsleeved packs.

==================================================
SECTION 4 — NORMAL LOOSE BOOSTER PACKS
==================================================

All normal loose Pokémon booster packs should be treated as the SAME physical size.

Examples include:

Chaos Rising Booster Pack
Pitch Black Booster Pack
Perfect Order Booster Pack
Random Booster Pack
Japanese Booster Pack
Korean Booster Pack
Chinese Booster Pack
Gem Pack
Gem4
other standard loose booster packs

For packing-space purposes:

1 loose pack from one set
=
1 loose pack from another set

Examples:

5 Chaos Rising packs
+
5 Pitch Black packs

must be treated as:

10 normal packs

The set names should NOT create separate packing-size calculations.

==================================================
SECTION 5 — SLEEVED BOOSTER PACKS
==================================================

All standard individually sleeved booster packs should use one standardized physical size.

Examples:

Perfect Order Sleeved Booster Pack

Pitch Black Sleeved Booster Pack

Future Set Sleeved Booster Pack

All belong to:

sleevedPacks

Do not distinguish their physical size based on set name.

Sleeved packs are a separate physical category from loose packs.

==================================================
SECTION 6 — BOOSTER BUNDLES
==================================================

ALL STANDARD BOOSTER BUNDLES MUST BE TREATED AS THE SAME PHYSICAL SIZE.

This rule is especially important.

Examples:

Chaos Rising Booster Bundle

Pitch Black Booster Bundle

Perfect Order Booster Bundle

Future Pokémon Set Booster Bundle

must all classify as:

BOOSTER BUNDLE

and use the same physical-size logic.

DO NOT send a Booster Bundle to Needs Review merely because the set name is new.

==================================================
VERY IMPORTANT — PITCH BLACK
==================================================

Pitch Black Booster Bundle is a NORMAL BOOSTER BUNDLE.

It must NOT be classified as unknown.

It must NOT automatically go to Needs Review.

For packing purposes:

Pitch Black Booster Bundle
=
Chaos Rising Booster Bundle

They use the SAME physical-size category.

==================================================
CURRENT BOOSTER BUNDLE PACKING BEHAVIOR
==================================================

The existing packing system treats standard Booster Bundles as small/tin-sized items for box-sizing purposes.

Therefore:

Chaos Rising Booster Bundle
→ booster bundle/small-item category

Pitch Black Booster Bundle
→ booster bundle/small-item category

Future normal Booster Bundle
→ booster bundle/small-item category

A standard Booster Bundle by itself should use the existing small-box logic rather than Needs Review.

Current small-box family:

6x6x6

Example:

1 Pitch Black Booster Bundle
→ 6x6x6

1 Chaos Rising Booster Bundle
→ 6x6x6

Booster Bundle + normal loose packs
→ remain within small-item packing logic unless quantity/capacity requires a different established rule.

IMPORTANT:

Do not hard-code only the words "Chaos Rising".

Recognize:

"Booster Bundle"

as the product TYPE.

==================================================
SECTION 7 — BOOSTER BOXES
==================================================

All STANDARD BOOSTER BOXES should be treated as the same physical size.

Examples:

Chaos Rising Booster Box

Pitch Black Booster Box

Perfect Order Booster Box

Japanese Booster Box

Future Set Booster Box

should all classify into:

boosterBox

For physical-space calculations:

1 Booster Box from Set A
=
1 Booster Box from Set B

The Pokémon set name does not change its standardized physical size.

IMPORTANT:

BOOSTER BOX and BOOSTER BUNDLE are NOT the same product category.

Use:

Loose Pack
Sleeved Pack
Booster Bundle
Booster Box

as four separate standardized physical categories.

Do not confuse them.

==================================================
SECTION 8 — ETBs
==================================================

An item is an ETB if the product name clearly indicates:

ETB

or

Elite Trainer Box

All normal ETBs are treated as the same basic physical-size category unless I explicitly define an exception.

==================================================
ETB PACKING LADDER
==================================================

1 ETB
→ 8x8x4

2 ETBs
→ 8x8x8

3 ETBs
→ 11x11x7

4 ETBs
→ 16x12x8

5 or more ETBs
→ 24-series

This ETB ladder is extremely important.

==================================================
1 ETB COMBINATIONS
==================================================

1 ETB
→ 8x8x4

1 ETB + loose packs
→ 8x8x4

1 ETB + sleeved packs
→ 8x8x4

1 ETB + loose packs + sleeved packs
→ 8x8x4

Small pack-type products generally do not increase the ETB box.

==================================================
2 ETB COMBINATIONS
==================================================

2 ETBs
→ 8x8x8

2 ETBs + loose packs
→ 8x8x8

2 ETBs + sleeved packs
→ 8x8x8

2 ETBs + loose packs + sleeved packs
→ 8x8x8

Small items should not automatically increase this box.

EXCEPTION:

2 ETBs + Pokémon Day
→ 11x11x5

This is an explicitly approved rule.

==================================================
3 ETB COMBINATIONS
==================================================

3 ETBs
→ 11x11x7

3 ETBs + loose packs
→ 11x11x7

3 ETBs + sleeved packs
→ 11x11x7

==================================================
4 ETB COMBINATIONS
==================================================

4 ETBs
→ 16x12x8

4 ETBs + packs
→ 16x12x8

4 ETBs + sleeved packs
→ 16x12x8

==================================================
5+ ETBs
==================================================

5 or more ETBs
→ 24-series

==================================================
SECTION 9 — SMALL ITEMS DO NOT AUTOMATICALLY UPSIZE
==================================================

This is another extremely important rule.

Small products generally do NOT increase the shipping-box size when an established larger product already determines the box.

Examples of small items:

normal loose packs

sleeved packs

small tins

standard Booster Bundles

Examples:

1 ETB + some loose packs
→ still 8x8x4

2 ETBs + some packs
→ still 8x8x8

3 ETBs + some packs
→ still 11x11x7

4 ETBs + some packs
→ still 16x12x8

1 Mega item + packs
→ remain within its correct 13-family box

1 large premium + packs
→ remain within its correct 16-family box

Do NOT create Needs Review simply because packs are mixed into an otherwise valid order.

==================================================
SECTION 10 — PACKS ONLY
==================================================

If an order contains only normal loose packs:

→ Packs Only

Examples:

10 loose booster packs
→ Packs Only

100 mixed loose booster packs
→ Packs Only

5 Chaos Rising packs
+ 4 Pitch Black packs
+ 3 Japanese packs
→ Packs Only

All loose packs combine into the same physical category.

==================================================
SECTION 11 — SLEEVED PACKS ONLY
==================================================

If an order contains only sleeved booster packs:

→ Sleeved Packs

Example:

10 Perfect Order Sleeved Booster Packs
→ Sleeved Packs

==================================================
SECTION 12 — MIXED LOOSE + SLEEVED PACKS
==================================================

If an order contains:

normal packs
+
sleeved packs

but no larger product:

→ Packs Only

Do not create Needs Review solely because loose and sleeved packs appear together.

==================================================
SECTION 13 — TINS / SMALL PRODUCTS
==================================================

Small tins belong to the small-product packing family.

Known small-box size:

6x6x6

Examples:

1 qualifying small tin
→ 6x6x6

Small tin + packs
→ 6x6x6 when within established capacity

Standard Booster Bundles currently behave similarly to these small products.

==================================================
SECTION 14 — POKÉMON DAY
==================================================

Pokémon Day Collection has its own recognized classification.

Known rules:

1 Pokémon Day + packs
→ 8x8x4

IMPORTANT SPECIAL COMBINATION:

2 ETBs + Pokémon Day
→ 11x11x5

Do not use 8x8x8 for:

2 ETBs + Pokémon Day

==================================================
SECTION 15 — POSTER COLLECTIONS
==================================================

Poster products have their own box progression.

Known rules:

Poster alone
→ 11x11x5

Poster + packs
→ 11x11x5

Poster + 1 ETB
→ larger poster/ETB rule

Poster + 2 ETBs
→ 11x11x9

==================================================
POSTER + ETB
==================================================

Previously approved system rules include:

Poster + ETB
→ 11x11x7

There has also been a product-specific larger rule involving:

16x12x6

Therefore do NOT blindly replace existing product-specific behavior.

Use the existing product classifications to distinguish them.

If a newly encountered poster combination genuinely does not match an established rule:

→ Needs Review

rather than guessing.

==================================================
SECTION 16 — 11x11x5
==================================================

Known uses include:

Poster alone
→ 11x11x5

Poster + packs
→ 11x11x5

2 ETBs + Pokémon Day
→ 11x11x5

==================================================
SECTION 17 — 11x11x7
==================================================

Known uses:

3 ETBs
→ 11x11x7

Poster + 1 ETB
→ 11x11x7 where this established rule applies

==================================================
SECTION 18 — 11x11x9
==================================================

Known use:

Poster + 2 ETBs
→ 11x11x9

==================================================
SECTION 19 — MEGA / 13-SERIES PRODUCTS
==================================================

There is a family of products that use 13-series boxes.

Known examples include:

Mega Latios

Mega Latias

Mega Kangaskhan

applicable Ascended Heroes Mega products

These should classify as:

megaItems

rather than unknown.

==================================================
13x10x4
==================================================

Known single-item usage:

1 Mega Latios
→ 13x10x4

1 Mega Latias
→ 13x10x4

1 Mega Kangaskhan
→ 13x10x4

Equivalent single Mega-family product
→ 13x10x4

==================================================
13x10x6
==================================================

Known combinations include:

Mega Kangaskhan + 1 ETB
→ 13x10x6

3 Kangaskhan-type units
→ 13x10x6

Deluxe Pin Collection
→ 13x10x6

==================================================
13x10x8
==================================================

Known larger combinations include:

2 qualifying Latios/Kangaskhan-style Mega products
→ 13x10x8

1 Latios + 1 Kangaskhan
→ 13x10x8

Mega-family product + 2 ETBs
→ 13x10x8 where the established combination applies

Example:

1 Mega Kangaskhan + 2 ETBs
→ 13x10x8

==================================================
SECTION 20 — DELUXE PIN
==================================================

Deluxe Pin Collection is a recognized product category.

Do not classify it as unknown.

Known packing rule:

Deluxe Pin Collection
→ 13x10x6

==================================================
SECTION 21 — LARGE PREMIUM PRODUCTS
==================================================

Large premium products belong to the 16-series family.

Known examples include:

Mega Charizard UPC

Ultra Premium Collection

UPC

Super Premium Collection

SPC

qualifying Team Rocket premium products

qualifying Moltres premium products

These should classify as:

largePremiums

==================================================
16x12x4
==================================================

Known usage:

single large premium product
→ 16x12x4

Examples:

Mega Charizard UPC
→ 16x12x4

Ultra Premium Collection
→ 16x12x4

Super Premium Collection
→ 16x12x4

qualifying Team Rocket premium
→ 16x12x4

qualifying Moltres premium
→ 16x12x4

Packs should not automatically cause a larger box.

==================================================
16x12x6
==================================================

Used for established larger mixed/product-specific combinations.

A known existing application involves:

Poster + ETB

when the specific classified product combination requires the larger 16-series footprint.

Do not replace established 11x11x7 rules universally.

==================================================
16x12x8
==================================================

4 ETBs
→ 16x12x8

==================================================
SECTION 22 — 24-SERIES PRODUCTS
==================================================

Some products automatically belong to the largest box family.

Known examples:

Blooming Water

Paldean Fates Great Tusk

Unova Premium Collection

Heavy Hitters

These belong to:

box24

Known rules:

Blooming Water
→ 24-series

Great Tusk qualifying large product
→ 24-series

Unova Premium Collection
→ 24-series

Heavy Hitters
→ 24-series

Also:

5+ ETBs
→ 24-series

==================================================
SECTION 23 — MULTIPLIER HANDLING
==================================================

The packing PDF can contain product names such as:

2x Chaos Rising English Booster Pack

or products with:

x2

The app must distinguish:

PDF LINE QUANTITY

from

PHYSICAL ITEM QUANTITY

Example:

Product:
2x Chaos Rising Booster Pack

PDF quantity:
3

Physical quantity:

2 × 3 = 6 booster packs

Therefore:

pdfQty = 3

physicalQty = 6

Google Sheets item counts must use:

physicalQty

not merely pdfQty.

==================================================
SECTION 24 — ITEM COUNTS
==================================================

itemCountsPhysical must represent the real number of physical units workers need to retrieve.

Example:

2x Booster Pack
PDF Qty = 5

itemCountsPhysical:
10

This physical count is what gets sent to the Google Sheets picking checklist.

==================================================
SECTION 25 — GOOGLE SHEETS PICKING CHECKLIST
==================================================

After a packing run successfully passes verification:

updatePickingChecklist(itemCountsPhysical)

must run.

The Google Sheet contains:

ITEM

QUANTITY

CHECKLIST

The sheet should be cleared/rebuilt for the new successful packing run.

DO NOT clear or replace the picking list when PDF verification fails.

==================================================
SECTION 26 — NEEDS REVIEW PHILOSOPHY
==================================================

Needs Review is a safety fallback.

It should NOT be used simply because the Pokémon SET NAME is unfamiliar.

This distinction is extremely important.

BAD:

Pitch Black Booster Bundle
→ unknown
→ Needs Review

CORRECT:

Pitch Black Booster Bundle
→ identify "Booster Bundle"
→ standard Booster Bundle classification
→ existing Booster Bundle packing logic

==================================================
DO NOT SEND THESE TO NEEDS REVIEW JUST BECAUSE THE SET IS NEW
==================================================

A new set's:

Booster Pack

Sleeved Booster Pack

Booster Bundle

Booster Box

ETB / Elite Trainer Box

should inherit the existing product-type classification.

Examples:

Pitch Black Booster Bundle
→ Booster Bundle

Future Set Booster Bundle
→ Booster Bundle

Pitch Black Booster Box
→ Booster Box

Future Set Booster Box
→ Booster Box

Pitch Black ETB
→ ETB

==================================================
SECTION 27 — VALID REASONS FOR NEEDS REVIEW
==================================================

Use Needs Review when:

1. The product TYPE genuinely cannot be identified.

2. No products were successfully parsed.

3. Parsed PDF quantity does not match Qty Total.

4. A genuinely unsupported combination of major physical products appears.

5. Two large product families are combined and there is no approved rule.

6. The physical product is clearly unusual/oversized and does not match the standardized category.

7. An explicit packing combination has not yet been approved and guessing could cause the wrong shipping box.

==================================================
NOT VALID REASONS FOR NEEDS REVIEW
==================================================

Do NOT use Needs Review merely because:

the Pokémon set is new

the set is called Pitch Black

the set is called Chaos Rising

the language differs

multiple loose booster sets appear together

packs accompany an ETB

packs accompany a premium product

a recognized Booster Bundle has a new set name

a recognized Booster Box has a new set name

==================================================
SECTION 28 — PRODUCT CLASSIFICATION PRIORITY
==================================================

When classifying a product, detect specific structured product types before generic words.

A good conceptual order is:

1. Special explicit oversized products
2. Large premium / UPC / SPC products
3. Deluxe Pin
4. Poster Collection
5. Pokémon Day
6. ETB / Elite Trainer Box
7. Booster Box
8. Booster Bundle
9. Sleeved Booster Pack
10. Loose Booster Pack
11. Tin
12. Unknown

This helps avoid mistakes such as:

"Booster Bundle"

being classified merely because the name also contains the word "Booster".

Or:

"Sleeved Booster Pack"

being classified as an ordinary loose Booster Pack.

Specific classification should win over generic classification.

==================================================
SECTION 29 — BOOSTER BUNDLE DETECTION
==================================================

Do not use set-specific detection such as:

if name includes "Chaos Rising Booster Bundle"

Instead use:

if normalized product name contains "booster bundle"
→ Booster Bundle category

This automatically supports:

Chaos Rising Booster Bundle

Pitch Black Booster Bundle

Perfect Order Booster Bundle

Future Set Booster Bundle

without modifying the code every time a new Pokémon set releases.

==================================================
SECTION 30 — BOOSTER BOX DETECTION
==================================================

Use similar logic:

if normalized product name contains "booster box"
→ Booster Box category

Do this before generic booster-pack classification.

==================================================
SECTION 31 — SLEEVED PACK DETECTION
==================================================

Detect sleeve/sleeved status before generic booster-pack detection.

Example:

Perfect Order Sleeved Booster Pack

must become:

sleevedPacks

not:

normalPacks

==================================================
SECTION 32 — NORMAL PACK DETECTION
==================================================

After excluding:

Booster Box

Booster Bundle

Sleeved Booster Pack

then generic:

Booster Pack

Pack

Gem pack / Gem4

can enter:

normalPacks

==================================================
SECTION 33 — RULE PRECEDENCE
==================================================

When an order contains multiple categories, the physically larger meaningful product generally determines the base box.

Conceptually:

24-series special products
>
large premium / 16 family
>
Mega / 13 family
>
Poster / 11 family
>
ETB ladder
>
Pokémon Day
>
small items / bundles / tins
>
loose packs / sleeves

BUT:

Explicit combination rules override this hierarchy.

Example:

2 ETBs + Pokémon Day
→ explicitly 11x11x5

Do not blindly use a generic hierarchy when an approved combination exists.

==================================================
SECTION 34 — EXPLICIT RULES WIN
==================================================

The precedence should effectively be:

1. Explicit known combination
2. Explicit special-product rule
3. Category-based normal rule
4. Needs Review

Never:

Unknown combination
→ guessed box

==================================================
SECTION 35 — FUTURE PRODUCT INHERITANCE
==================================================

The application should be designed so new Pokémon sets require as little code modification as possible.

Example future product:

"Celestial Storm 2027 Booster Bundle"

Codex should recognize:

Booster Bundle

and automatically apply the standard Booster Bundle size.

It should NOT require:

case "Celestial Storm 2027"

Same for:

Booster Boxes

Loose Packs

Sleeved Packs

ETBs

==================================================
SECTION 36 — EXPLICIT EXCEPTIONS
==================================================

There can still be exceptions.

If I explicitly say:

"This product is physically bigger than a normal Booster Bundle"

then create a named exception.

But exceptions should be narrow.

Default behavior:

recognized standard product type
→ standardized size

==================================================
SECTION 37 — ORDER/PAGE INTEGRITY
==================================================

Each order consists of:

shipping label

+

packing slip

These two pages must ALWAYS remain together.

When sorting alphabetically:

move both pages together.

Never independently sort shipping labels and packing slips.

==================================================
SECTION 38 — ALPHABETICAL SORTING
==================================================

Within each final PDF group:

sort by Buyer Nickname A-Z.

If Buyer Nickname cannot be found:

fall back to Buyer ID.

==================================================
SECTION 39 — PAGE VERIFICATION
==================================================

Before Google Sheets is updated or the ZIP is considered successful:

verify:

total input pages
=
total output pages

AND

every expected page appears

AND

there are no duplicate pages

AND

order/page detection matches the PDF.

==================================================
SECTION 40 — FAILED VERIFICATION
==================================================

If verification fails:

DO NOT update Google Sheets.

DO NOT treat the packing run as successfully completed.

Throw an error showing:

input pages

output pages

expected pages

missing-page count

duplicate-page count

==================================================
SECTION 41 — SUCCESSFUL RUN ORDER
==================================================

The successful processing sequence should be:

Parse PDFs

↓

Classify products

↓

Calculate physical quantities

↓

Determine exact boxes

↓

Group orders

↓

Alphabetize each group

↓

Generate PDFs

↓

Verify every page

↓

Generate itemCountsPhysical

↓

Update Google Sheets picking checklist

↓

Generate ZIP

↓

Return ZIP to user

==================================================
SECTION 42 — ZIP CONTENTS
==================================================

The final ZIP should be simple.

Only include PDFs that actually contain orders.

Possible PDF files:

6_Box.pdf

8x8x4.pdf

8x8x8.pdf

11_Box.pdf

13_Box.pdf

16_Box.pdf

24_Box.pdf

Packs_Only.pdf

Sleeved_Packs.pdf

Needs_Review.pdf

Do not include JSON files in the worker ZIP. `itemCountsPhysical.json` and the other batch manifests remain in the private run directory for auditing and inventory review. Physical item totals are written to the Google Sheets picking checklist so workers can check items off as they place them on the shelf.

DO NOT generate unnecessary per-group summary TXT files.

Do not add:

6_Box_summary.txt

11_Box_summary.txt

etc.

==================================================
SECTION 43 — FUNCTIONS THAT MUST REMAIN WORKING
==================================================

Any packing-engine modification must preserve:

PDF parsing

multiple PDF upload

physical quantity multipliers

buyer nickname extraction

alphabetical sorting

shipping label + packing slip pairing

exact box assignment

grouped PDFs

Packs Only

Sleeved Packs

Needs Review

missing-page detection

duplicate-page detection

page-count verification

itemCountsPhysical

Google Sheets picking checklist

ZIP generation

==================================================
SECTION 44 — CURRENT KNOWN PRODUCT EXAMPLES
==================================================

Known products/product families encountered by this warehouse include examples such as:

Perfect Order Sleeved Booster Pack

Random Booster Pack JP/KR/CN

Chaos Rising ETB

Chaos Rising English Booster Pack

Chaos Rising Booster Bundle

Pitch Black Booster Bundle

Perfect Order ETB

Prismatic Tin

Prismatic Poster

Prismatic Evolutions ETB

Pokémon Day Collection

Mega Kangaskhan

Mega Latios

Mega Latias

Mega Charizard UPC

Team Rocket / Moltres premium products

Prismatic SPC

Gem packs

Gem4 packs

Blooming Water 151 Premium Collection

Deluxe Pin Collection

Paldean Fates Great Tusk

Unova Premium Collection

Heavy Hitters

Do not assume this is an exhaustive list.

Use product TYPE recognition whenever possible.

==================================================
SECTION 45 — CRITICAL FIX FOR PITCH BLACK
==================================================

The current/previous Needs Review logic has incorrectly allowed Pitch Black Booster Bundle to reach Needs Review.

FIX THIS.

Pitch Black Booster Bundle is a standard Booster Bundle.

Therefore:

Pitch Black Booster Bundle
→ standard Booster Bundle classification

It should behave exactly like:

Chaos Rising Booster Bundle

for packing-size purposes.

Do not add only a one-off exact string fix unless necessary.

The better fix is:

ANY recognized standard "Booster Bundle"
→ standard Booster Bundle category

That prevents the same bug when the next Pokémon set releases.

==================================================
SECTION 46 — CRITICAL GENERALIZATION RULE
==================================================

Codex should understand this principle:

SET NAME IS VARIABLE.

PRODUCT FORMAT IS STRUCTURAL.

Examples:

Pitch Black
Chaos Rising
Perfect Order
Future Set

are set/product names.

These should NOT define physical packing size.

Words such as:

Booster Pack
Sleeved Booster Pack
Booster Bundle
Booster Box
ETB
Elite Trainer Box
Poster Collection
UPC
Premium Collection

describe the physical product format and therefore matter much more for packing.

==================================================
SECTION 47 — WHEN MODIFYING BOXENGINE.JS
==================================================

Before changing boxEngine.js:

1. Read all existing classifyProduct rules.
2. Read all existing chooseBox rules.
3. Preserve all currently working approved combinations.
4. Add generalized category recognition where appropriate.
5. Check ordering of string matches.
6. Make sure Booster Bundle is evaluated BEFORE generic Booster Pack logic.
7. Make sure Booster Box is evaluated BEFORE generic Booster Pack logic.
8. Make sure Sleeved Pack is evaluated BEFORE generic Booster Pack logic.
9. Add Pitch Black Booster Bundle support through the generalized Booster Bundle rule.
10. Run regression tests against every known packing combination.
11. Do not alter pdfProcessor behavior unnecessarily.

==================================================
SECTION 48 — REGRESSION TESTS CODEX SHOULD CONSIDER
==================================================

At minimum verify:

Loose packs only
→ Packs Only

Sleeved packs only
→ Sleeved Packs

Loose + sleeved packs only
→ Packs Only

Pitch Black Booster Bundle
→ recognized, NOT Needs Review

Chaos Rising Booster Bundle
→ recognized, NOT Needs Review

New fictional standard Booster Bundle
→ recognized through product type

1 ETB
→ 8x8x4

2 ETBs
→ 8x8x8

2 ETBs + Pokémon Day
→ 11x11x5

3 ETBs
→ 11x11x7

4 ETBs
→ 16x12x8

5 ETBs
→ 24-series

Poster
→ 11x11x5

Poster + 2 ETBs
→ 11x11x9

Single Mega-family item
→ 13x10x4

Mega Kangaskhan + ETB
→ 13x10x6

Mega item + 2 ETBs
→ 13x10x8

Deluxe Pin
→ 13x10x6

Mega Charizard UPC
→ 16x12x4

Blooming Water
→ 24-series

Unknown genuinely unclassified item
→ Needs Review

Quantity mismatch
→ Needs Review

Empty parsed product list
→ Needs Review

==================================================
FINAL RULE
==================================================

DO NOT make the packing engine depend heavily on Pokémon SET names.

Make it depend primarily on:

PRODUCT TYPE
+
QUANTITY
+
APPROVED COMBINATIONS

Use named-product rules only for legitimate special exceptions.

When a new normal:

Booster Pack
Booster Bundle
Booster Box
Sleeved Pack
ETB

appears from a future Pokémon set, it should inherit the existing physical-size category automatically.

Most importantly:

Pitch Black Booster Bundle must NOT go to Needs Review.

Pitch Black Booster Bundle should be treated exactly like a standard Booster Bundle, including Chaos Rising Booster Bundle, for physical sizing.

==================================================
OWNER CLARIFICATIONS — 2026-08-27
==================================================

These clarifications were supplied after the original master specification:

1. For the purposes of this packing engine, one order does not require multiple shipping boxes. Continue assigning one exact physical box classification per order.

2. A corrected or regenerated order PDF is considered a new packing event. Exact duplicate-batch confirmation protection must remain, but later corrected events should not automatically be rejected solely because they refer to an earlier order.

3. Future packing-supply inventory is intended to be an estimate that warns managers when to reorder. It does not need to track every worker box substitution exactly. Periodic physical counts may reset estimation drift.

4. Slab capacity rules remain unresolved. Do not classify slabs into 7x5x5 until the owner approves the slab rule. This does not prevent separately approved non-slab products from using 7x5x5.

5. First Partner Illustration Collection and First Partner Series 3 Collection use the Pokemon Day-sized behavior. One collection uses 8x8x4. The approved Pokemon Day combination behavior continues to apply.

6. One standard Booster Box uses 7x5x5 temporarily because the preferred 7x4x3 supply is unavailable. Multiple Booster Boxes, Booster Display products, and mixed orders containing a Booster Box remain Needs Review until separately approved. Keep the worker-facing PDFs consolidated rather than creating a separate 7x5x5 PDF.

7. Ascended Heroes Focused Fighters Premium Collection uses the 24-series family, matching Blooming Waters 151 and Paldean Fates Great Tusk.

8. The downloadable worker ZIP contains only the grouped PDFs that need to be printed. Internal batch JSON remains in the private run directory. After verification passes, physical item totals continue to update the Google Sheets packing List with unchecked checklist boxes.

9. TikTok product-name variants that represent the same physical item must be combined before writing the picking checklist or inventory usage. Preserve raw names in batch audit data. Approved canonical mappings include both First Partner Series 3 names in one row, all Random Chinese/CN/JP/KR Booster Pack variants in one row, and Pitch Black Booster Pack bracket/x1 variants in one row. AI may recommend future mappings, but a manager must approve them before automatic merging.

10. Long products in the 24-series family, including Blooming Waters and the other approved products of the same physical size, use 24x12x4 when no ETB is present. If one or more ETBs are included with the long product, the ETB height is the deciding factor and the order uses 24x12x6. Both exact sizes remain consolidated into `24_Box.pdf` for workers.

11. A verified Packs Only order consumes one bubble mailer. Bubble-wrap consumption is measured in pieces: each ETB uses 2 pieces, each actual tin uses 1 piece, each SPC/Super Premium Collection uses 3 pieces, each UPC/Ultra Premium Collection uses 4 pieces, and each approved long 24-series product such as Blooming Waters uses 4 pieces. Booster Bundles are not tins for this supply calculation unless the owner later approves that rule.

==================================================
OWNER CLARIFICATIONS — 2026-09-15 MANAGER BOX CHART
==================================================

These newer rules replace older rules wherever they conflict:

1. A legacy `8x6x4` result uses the replacement `6x6x6` box and existing `6_Box.pdf` worker group.

2. One standard non-Japanese Booster Box continues to use `7x5x5`. One clearly named Japanese or JP Booster Box uses `8x8x4`. Multiple or mixed Booster Box orders remain `Needs Review`.

3. The current ETB ladder is:

- 1 ETB -> `8x8x4`
- 2 ETBs -> `8x8x8`
- 2 ETBs + Booster Bundle -> `11x11x7`
- 3 ETBs -> `11x11x7`
- 4 or 5 ETBs -> `12x12x12`
- 6 ETBs -> `16x12x8`
- 7 or more ETBs -> `Needs Review`

4. The current poster ladder is:

- 1 poster -> `11x11x5` (`11x11x3` was eliminated by the warehouse)
- 2 posters -> `11x11x5`
- 1 poster + 1 ETB -> `11x11x5`
- 2 posters + 1 ETB -> `11x11x7`
- poster + 2 ETBs -> `11x11x9`
- poster + 3 ETBs -> `11x11x9`
- poster + 4 or 5 ETBs -> `12x12x12`

Other poster quantities or combinations remain `Needs Review` unless another explicit rule applies.

5. The current normal collection/large-premium ladder is:

- 1 UPC or normal collection box -> `16x12x4`
- 1 UPC + 1 normal collection box -> `16x12x6`
- 1 normal collection box + 1 ETB -> `13x10x6`
- 1 normal collection box + 2 ETBs -> `16x12x6`
- 2 UPCs -> `16x12x8`
- 1 UPC + 2 ETBs -> `16x12x8`
- 3 UPCs -> `16x12x12`
- 2 UPCs + 2 ETBs -> `16x12x12`
- 2 Victini collection boxes -> `13x10x4`

Unlisted collection quantities and mixed large-product combinations remain `Needs Review`. Named special physical families still take precedence: Blooming Waters-sized long products stay in the 24-series, First Partner keeps Pokémon Day behavior, Mega-family products keep their approved 13/16 rules, and other documented exceptions are not converted into generic collection boxes.

6. `12x12x12` is consolidated into `11_Box.pdf` for the existing worker workflow. Exact internal box sizes remain in the batch manifests and packing-supply deductions.

7. No packing rule is assigned to `18x18x12` yet.

8. First Partner Series 2 and First Partner Series 3 use the existing Pokémon Day packing behavior. More than one First Partner collection is no longer a reason by itself for `Needs Review`: without an ETB the order uses `8x8x4`; with one ETB it uses `8x8x8`; with two ETBs it uses `11x11x5`. Small packs, tins, and Booster Bundles do not by themselves increase this established box.

9. `Legendary Warriors Premium Collection` and `Unova Premium Collection - Heavy Hitters` are the same long physical family as Blooming Waters. They use `24x12x4` without an ETB and `24x12x6` when one or more ETBs add height. Multiple items from this approved 24-series family continue to receive one exact 24-series classification because the owner requires one box classification per order.

10. The manager's earlier note `1 poster // eliminate` means eliminate the `11x11x3` box, not assign it. A single poster uses `11x11x5`. Batches generated before this correction that contain `11x11x3` must not be confirmed; reprocess their source PDFs so the corrected exact box is stored in the new batch.

11. Numbered TikTok mystery-box products such as `BOX # 167`, `BOX # 90`, and other `BOX #` numbers must remain in `Needs Review` and therefore remain inside `Needs_Review.pdf`. However, each verified order containing this numbered product format uses one `7x5x5` physical shipping box for inventory estimation. Store `Needs Review` as the worker-facing packing result and `7x5x5` as a separate inventory packing group. A quantity mismatch or empty parsed order must not receive the estimated deduction.
