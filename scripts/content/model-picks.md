# Model picks (R4a)

Poly Haven only (CC0), surveyed on 2026-11-15 from `https://api.polyhaven.com/assets?t=models` (522 models).
The picks are the `kind: "model"` entries in `content/sources.json`. Aspect is compared on w/h, d/h and w/d
against the catalog `defaultSize`; Poly Haven `dimensions` are [x, y, z] mm with z up. A match is rejected
when one ratio is more than about 35% off, or when the style clashes and nothing better exists.

22 of 115 catalog ids have a model; 93 have none. 1 scatter species has one (flowers-mixed).
Eight first-round picks were dropped after review of the contact sheet; they are the first rows of the
rejected table.

## Picks with a caveat

| catalog id / species | Poly Haven id | caveat |
| --- | --- | --- |
| sofa-3 | sofa_02 | tufted chesterfield, classic rather than modern; 1k textures |
| armchair-wingback | ArmChair_01 | Victorian bergere |
| nightstand | painted_wooden_nightstand | rustic painted |
| round-table | round_wooden_table_01 | traditional dark pedestal; model is 1.01 m high |
| bar-stool | bar_chair_round_01 | LOD1 does not simplify (14 372 of 14 373 tris at error 0.01) |
| dining-island-stool | painted_wooden_stool | rustic painted |
| chandelier | Chandelier_01 | ornate brass; 26.9k tris |
| wall-sconce | industrial_wall_sconce | brass farmhouse |
| coffee-table | modern_coffee_table_01 | glTF runs its long side along Z; `rotateY: 90` |
| shelving-unit | steel_frame_shelves_01 | glTF is in decimetres; `units: "dm"` |
| plant-pot | potted_plant_01 | 96k source tris, capped to 30k (`maxTriangles`) |
| monstera | potted_plant_02 | not a monstera; 42% wider than the catalog box (over the limit, kept for review); dirt mesh capped |
| cactus | potted_plant_04 | aloe, not a cactus; aspect 36% |
| species flowers-mixed | flower_gazania (`node: flower_gazania_h_LOD0`) | one clump |

## Rejected candidates

| catalog id / species | Poly Haven id | reason |
| --- | --- | --- |
| microwave | vintage_microwave | dropped in review: 1970s style, and 1.07 m wide against a 0.5 m catalog item |
| dresser | GothicCommode_01 | dropped in review: gothic, jarring |
| sofa-2 | Sofa_01 | dropped in review: rococo, jarring |
| dining-table | painted_wooden_table | dropped in review: farmhouse; 2.41 m long against 1.6 m |
| wall-art | hanging_picture_frame_01 | dropped in review: the print carries "Ray Homes" text |
| species bush-round | shrub_02 (`node: shrub_02_b`) | dropped in review: reads as a dry weed |
| species bush-flowering | periwinkle_plant (`node: periwinkle_plant_02_LOD0`) | dropped in review: a sparse single stem, not a bush |
| species palm | quiver_tree_02 | dropped in review: a quiver tree is not a palm |
| sofa-modular | sofa_03 | d/h 47% off; ornate |
| chaise | vintage_day_bed | d/h 35%; floral antique day bed |
| pouf | Ottoman_01 | w/d 42% off (used for ottoman) |
| pouf | folding_wooden_stool | workshop stool, not upholstered |
| coffee-table | coffee_table_round_01 | round; d 76% off |
| sideboard | modern_wooden_cabinet | w/h 68% off (used for tv-unit) |
| sideboard, buffet | WoodenTable_03 | w/d 41–50% off |
| bookshelf | Shelf_01 | d/h 43% off |
| bookshelf | wooden_display_shelves_01 | w/h 38% off |
| bookshelf | drawer_cabinet | d/h 46% off |
| dining-table | wooden_table_02 | w/h 50% off |
| dining-table | dining_table | checked tablecloth, low |
| round-table | round_wooden_table_02 | w/h 49% off |
| bed-double | GothicBed_01 | w/h 56% off (posts); gothic |
| bed-single | old_bed_frame | bare metal frame and springs, no mattress; 50k tris |
| bunk-bed | old_bed_frame | d/h 46% off |
| wardrobe | painted_wooden_cabinet_02 | w/h 47% off |
| wardrobe | chinese_cabinet | d/h 50% off; ornate |
| wardrobe-sliding | vintage_cabinet_01 | glass-door hutch, not a wardrobe; 61k tris |
| desk | metal_office_desk | w/h 36% off; industrial |
| desk | SchoolDesk_01 | w/h 131% off |
| office-chair | SchoolChair_01 | school chair, no base or wheels |
| chandelier | Chandelier_02 | d/h 36% off |
| table-lamp | industrial_pipe_lamp | w/d 43% off; workshop lamp |
| mirror-round | ornate_mirror_01 | rectangular, ornate |
| books | book_encyclopedia_set_01 | w/d 165% off; 67k tris |
| candles | wooden_candlestick | single candlestick, w/h 145% off |
| cushion | throw_pillows_01 | a heap of several pillows |
| tv | Television_01 | CRT |
| firepit | stone_fire_pit | w/h 86% off |
| garden-sofa | painted_wooden_sofa | d/h 73% off |
| outdoor-dining-set | wooden_picnic_table | d/h 176% off |
| car | covered_car | a car under a tarp |
| wood-stove | barrel_stove | street fire barrel |
| air-conditioner | exterior_aircon_unit | outdoor unit; d/h 81% off |
| herb-box | planter_box_01 | empty crate planter, no herbs |
| bench | painted_wooden_bench | w/h 132% off (used for bench-garden) |
| species oak/birch/pine/cypress | tree_small_02, island_tree_01–03, jacaranda_tree, fir_tree_01, pine_tree_01, saplings | 1.7M–17M tris, several are multi-tree layouts; cannot reach ≤ 60k without losing the canopy |
| species bush-round | calathea_orbifolia_01, anthurium_botany_01, fern_02 | tropical indoor foliage with no pot; kept for a later indoor-plant pass |

## Catalog ids with no Poly Haven match

- living: sofa-2, bookshelf, sofa-corner, sofa-modular, chaise, pouf, tv, sideboard, fireplace, bean-bag, piano
- dining: dining-table, extendable-table, bench, buffet, pendant-cluster
- bedroom: dresser, bed-double, bed-single, bed-king, bunk-bed, crib, wardrobe, wardrobe-sliding, vanity, mirror-standing
- office: desk, desk-l, standing-desk, office-chair, gaming-chair, filing-cabinet, monitor
- kitchen: microwave, fridge-tall, fridge-american, range-hood, coffee-machine, kitchen-run, kitchen-l, kitchen-island
- bathroom: all 12 (toilet, bathtub, shower, washbasin, double-washbasin, freestanding-tub, walk-in-shower, wc-wall-hung, towel-radiator, bathroom-cabinet, washing-machine, dryer)
- lighting: floor-lamp, arc-floor-lamp, table-lamp, ceiling-light, spotlight-track, led-strip
- decor: wall-art, rug, rug-round, rug-runner, curtains, blinds, mirror-round, books, candles, cushion, throw-blanket, shelf-wall
- outdoor: fountain, garden-sofa, lounger, parasol, outdoor-dining-set, bbq, hot-tub, firepit, swing, trampoline, bicycle, car, dog-house, cat-tree
- plants: fiddle-leaf, hanging-plant, olive-tree-pot, herb-box
- structure: radiator, air-conditioner, wood-stove, fireplace-insert
