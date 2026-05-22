# Ocean-work-main Team File and Function Breakdown

This document is rewritten from the current `Ocean-work-main` folder after the latest file changes. The project is split into six people. Numbered files are the official task files; unnumbered files are kept only as compatibility wrappers because Vite, React, and Vercel require specific entry filenames and API route names.

## 1. Naming Rule

| Prefix | Owner | Main area |
|---|---|---|
| `1_` | Person 1 | Frontend app shell, layout, global style |
| `2_` | Person 2 | Generator page workflow and user interaction |
| `3_` | Person 3 | 3D renderer, voxel constants, local preset models |
| `4_` | Person 4 | Database, saved-build API, Vite local API bridge |
| `5_` | Person 5 | AI generation, LEGO brick layout, physical validation |
| Project/config files | Person 6 | Deployment, documentation, scripts, environment setup |

Compatibility wrappers must stay unnumbered:

| Wrapper file | Real numbered implementation |
|---|---|
| `src/App.tsx` | `src/1_App.tsx` |
| `src/main.tsx` | `src/1_main.tsx` |
| `src/index.css` | `src/1_index.css` |
| `src/components/Layout.tsx` | `src/components/1_Layout.tsx` |
| `src/pages/Generator.tsx` | `src/pages/2_Generator.tsx` |
| `src/services/VoxelEngine.ts` | `src/services/3_VoxelEngine.ts` |
| `src/lib/voxelConstants.ts` | `src/lib/3_voxelConstants.ts` |
| `src/lib/voxelGenerators.ts` | `src/lib/3_voxelGenerators.ts` |
| `src/lib/brickLayout.ts` | `src/lib/5_brickLayout.ts` |
| `src/lib/physicalConstraints.ts` | `src/lib/5_physicalConstraints.ts` |
| `src/types.ts` | `src/5_types.ts` |
| `api/builds.ts` | `api/4_builds.impl.ts` |
| `api/generate-voxel.ts` | `api/5_generate-voxel.impl.ts` |
| `server/database.ts` | `server/4_database.ts` |
| `db/schema.sql` | `db/4_schema.sql` |
| `vite.config.ts` | `4_vite.config.impl.ts` |
| `scripts/physical-constraints.test.ts` | `scripts/5_physical-constraints.test.ts` |

## 2. Six-person Ownership Map

| Person | Role | Main responsibility | Official files |
|---|---|---|---|
| Person 1 | Frontend A | Application shell, layout, global visual system | `src/1_App.tsx`, `src/1_main.tsx`, `src/1_index.css`, `src/components/1_Layout.tsx`, plus wrappers `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/components/Layout.tsx` |
| Person 2 | Frontend B | User workflow, prompt/image input, generation controls, saved build panel | `src/pages/2_Generator.tsx`, plus wrapper `src/pages/Generator.tsx` |
| Person 3 | Frontend C | Three.js LEGO viewer, animation, voxel constants, local preset geometry | `src/services/3_VoxelEngine.ts`, `src/lib/3_voxelConstants.ts`, `src/lib/3_voxelGenerators.ts`, plus wrappers |
| Person 4 | Backend A | Saved-build API, local SQLite database, Vite local API proxy | `api/4_builds.impl.ts`, `server/4_database.ts`, `db/4_schema.sql`, `4_vite.config.impl.ts`, plus wrappers |
| Person 5 | Backend B | Gemini generation endpoint, LEGO conversion, physical support and manufacturability algorithms | `api/5_generate-voxel.impl.ts`, `src/lib/5_brickLayout.ts`, `src/lib/5_physicalConstraints.ts`, `src/5_types.ts`, `scripts/5_physical-constraints.test.ts`, plus wrappers |
| Person 6 | Integration | Deployment, environment, package scripts, final documentation | `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `.env.example`, `.gitignore`, `README.md`, `VERCEL_IMAGE_TEXT_ISSUE_FIX.md`, `metadata.json`, `TEAM_FILE_FUNCTION_BREAKDOWN.md`, `index.html` |

## 3. Person 1 Files and Functions

### `src/1_App.tsx`

- `App()`: Root React component. It places the generator page inside the shared layout so the whole application has one consistent shell.

### `src/1_main.tsx`

- React entry render call: Creates the React root from `#root`, renders `App`, and loads the numbered global stylesheet.

### `src/components/1_Layout.tsx`

- `Layout({ children })`: Shared page frame. It displays the project title/header area and renders page content in the main layout region.

### `src/1_index.css`

- Tailwind and theme setup: Defines color tokens, typography tokens, body styling, glass panels, button hover effects, scrollbars, and range slider styling.

### Compatibility files

- `src/App.tsx`: Re-exports `src/1_App.tsx`.
- `src/main.tsx`: Imports `src/1_main.tsx`.
- `src/index.css`: Imports `src/1_index.css`.
- `src/components/Layout.tsx`: Re-exports `src/components/1_Layout.tsx`.

## 4. Person 2 Files and Functions

### `src/pages/2_Generator.tsx`

- `compilePhysicalModel(data, bricks)`: Converts voxels into bricks, runs support stabilization, repairs disconnected bricks, rebuilds voxels, and returns a physically checked model for rendering.
- `buildPresetModel(name)`: Builds a local preset model, enhances voxel density, converts it to LEGO bricks, and applies the physical model compiler.
- `formatBuildMode(mode)`: Converts internal build modes such as `create`, `morph`, `image`, and `import` into readable UI text.
- `Generator()`: Main generator page component. It manages prompt input, image upload, API generation, preset loading, JSON import/export, saved database records, current model state, rebuild history, and viewer controls.
- Viewer setup effect: Creates `VoxelEngine`, attaches it to the canvas container, loads the initial model, and cleans up the Three.js engine on unmount.
- Resize/load effect: Loads saved builds on page start and keeps the 3D canvas responsive when the browser size changes.
- `selectedRecord` memo: Chooses the active saved database record shown in the inspection panel.
- `loadSavedBuilds()`: Calls `/api/builds`, reads persisted records, updates saved/custom/rebuild lists, and stores the database file path shown in the database panel.
- `relevantRebuilds` memo: Filters saved rebuilds so the UI only shows rebuilds related to the selected base model.
- `syncPartsFromBricks(bricks)`: Groups bricks by type and color to produce the parts inventory.
- `loadModel(name, data, bricks)`: Loads a model into the 3D engine and updates model name, parts, selected model data, and history.
- `rebuildModel(name, data, bricks)`: Starts the animated rebuild flow from the current model to the target model.
- `persistBuild(build)`: Sends generated/imported model data to `/api/builds` and updates local saved-build state with the returned record.
- `handlePresetBuild(name)`: Loads one preset model from local generators.
- `getLocalPresetFromPrompt(value)`: Detects prompts that should use local preset fallbacks such as fox or tiger.
- `handleQuickPreset(name)`: Quickly loads a local preset without calling the AI API.
- `handleToggleRotation()`: Turns automatic model rotation on or off in the 3D viewer.
- `handleLoadSavedBuild(build)`: Loads a persisted build from the saved-build database panel.
- `handleDeleteRecord(id)`: Deletes a saved record through `/api/builds` and refreshes the saved list.
- `handleGenerate(mode)`: Main generation workflow. It validates input, sends text/image/palette data to `/api/generate-voxel`, handles API failure fallbacks, loads/rebuilds the returned model, and persists successful output.
- `openExportModal()`: Opens the JSON export dialog and fills it with current model data.
- `openImportModal()`: Opens an empty JSON import dialog.
- `handleJsonImport()`: Parses imported JSON, normalizes voxels/bricks, compiles physical model data, loads it, and saves it as an imported build.
- `handleCopyJson()`: Copies exported model JSON to the system clipboard.
- `handleExportParts()`: Generates and downloads a text inventory of required LEGO parts.

## 5. Person 3 Files and Functions

### `src/services/3_VoxelEngine.ts`

- `constructor(container, onStateChange, onCountChange)`: Initializes Three.js scene, camera, renderer, orbit controls, lighting, floor, material resources, and the animation loop.
- `loadInitialModel(data, brickData)`: Converts initial voxel/brick data into renderable LEGO bricks, frames the camera, updates brick count, and marks the engine as stable.
- `rebuild(targetModel, brickData)`: Builds a target brick layout and animates current bricks into the new target positions.
- `dismantle()`: Switches the engine to dismantling mode and gives bricks random velocity/rotation so the model falls apart.
- `handleResize()`: Updates renderer size and camera projection when the canvas changes size.
- `setAutoRotate(enabled)`: Enables or disables OrbitControls auto-rotation.
- `focusModel(data, brickData)`: Recomputes camera framing around the selected model.
- `getJsonData()`: Serializes current voxels and bricks into formatted JSON for export.
- `getUniqueColors()`: Returns all unique colors currently used by visible bricks.
- `cleanup()`: Stops animation, removes renderer DOM elements, and disposes geometry/material memory.
- `createBricks(data, brickData)`: Creates runtime brick objects and instanced meshes for brick bodies, studs, underside tubes, and underside holes.
- `fitCameraToBricks(bricks)`: Computes model bounds and stores camera distance/target values.
- `applyCameraFraming()`: Applies the calculated camera position and orbit target.
- `draw()`: Writes per-instance matrices/colors each frame, hides studs covered by upper bricks, and draws underside connection geometry.
- `getColorDist(c1, hex2)`: Calculates color distance for matching source bricks to rebuild targets.
- `updatePhysics()`: Advances dismantle/rebuild movement, gravity, bouncing, rotations, and stable-state detection.
- `animate()`: Main animation loop that updates controls, physics, drawing, and rendering.
- `getVoxelData()`: Reconstructs voxel cells from the current brick state.
- `getTotalCells()`: Counts occupied cells for UI statistics.
- `disposeInstancedMesh(mesh)`: Safely removes and disposes an instanced mesh.

### `src/lib/3_voxelConstants.ts`

- `VOXEL_SIZE`: Base grid size for each LEGO-style stud cell.
- `FLOOR_Y`: Ground plane height used by the renderer.
- `BACKGROUND_COLOR`: Three.js background color.
- `COLORS`: Shared color palette used by local preset generators and rendering.

### `src/lib/3_voxelGenerators.ts`

- `setBlock(map, x, y, z, color)`: Adds one voxel to a coordinate map while preventing duplicate cells.
- `generateSphere(map, cx, cy, cz, r, color, sy)`: Generates rounded groups of voxels for animal/body details.
- `Generators.Eagle()`: Creates the eagle preset model.
- `Generators.Cat()`: Creates the cat preset model.
- `Generators.Rabbit()`: Creates the rabbit preset model.
- `Generators.Twins()`: Creates a two-model preset.
- `Generators.Fox()`: Creates the fox fallback/preset model used by prompt detection.
- `Generators.Tiger()`: Creates the tiger fallback/preset model used by prompt detection.

### Compatibility files

- `src/services/VoxelEngine.ts`: Re-exports `src/services/3_VoxelEngine.ts`.
- `src/lib/voxelConstants.ts`: Re-exports `src/lib/3_voxelConstants.ts`.
- `src/lib/voxelGenerators.ts`: Re-exports `src/lib/3_voxelGenerators.ts`.

## 6. Person 4 Files and Functions

### `api/4_builds.impl.ts`

- `getCorsHeaders(req)`: Builds CORS headers so browser requests can work from local devices and deployed domains.
- `jsonResponse(res, req, status, payload)`: Sends a JSON response with consistent content type and CORS headers.
- `parseBody(req)`: Reads request body data whether it arrives as an object, a string, or streamed chunks.
- `isVoxelArray(value)`: Checks that submitted model data is a valid non-empty voxel array.
- `handler(req, res)`: Saved-build API route. It supports `OPTIONS`, `GET`, `POST`, `DELETE`, and returns `405` for unsupported methods.

### `server/4_database.ts`

- `getDatabase()`: Opens the SQLite database, creates required folders, loads `db/4_schema.sql`, and initializes the table.
- `mapRow(row)`: Converts raw database rows into persisted build records and parses stored JSON fields.
- `listBuilds(limit)`: Returns recent saved builds ordered by creation time.
- `createBuild(input)`: Inserts one generated/imported build into the database.
- `deleteBuild(id)`: Deletes one saved build by id.
- `databaseFilePath()`: Returns the absolute database path for debugging in the database panel.

### `db/4_schema.sql`

- `saved_builds` table: Stores build id, name, prompt, mode, base model, voxel count, model JSON, brick JSON, and timestamps.
- `idx_saved_builds_created_at`: Speeds up listing records by creation date.

### `4_vite.config.impl.ts`

- `createNodeStyleResponse(res)`: Wraps the raw local development response object so local API handlers behave like Vercel handlers.
- `readJsonBody(req)`: Reads and parses JSON request bodies during local Vite development.
- `localApiPlugin()`: Adds local `/api/builds` and `/api/generate-voxel` support to Vite.
- `runHandler(server, req, res, next)`: Dynamically loads the correct API handler through Vite SSR and executes it.
- Default config export: Loads `.env`, configures React/Tailwind plugins, aliases `@` to `src`, and installs the local API bridge.

### Compatibility files

- `api/builds.ts`: Re-exports `api/4_builds.impl.ts`.
- `server/database.ts`: Re-exports `server/4_database.ts`.
- `db/schema.sql`: Compatibility note pointing to `db/4_schema.sql`.
- `vite.config.ts`: Re-exports `4_vite.config.impl.ts`.

## 7. Person 5 Files and Functions

### `api/5_generate-voxel.impl.ts`

- `getCorsHeaders(req)`: Builds generation API CORS headers.
- `jsonResponse(res, req, status, payload)`: Sends generation results or errors as JSON.
- `toVoxelColor(color)`: Converts hex color strings into numeric voxel colors.
- `buildSystemPrompt(mode, prompt, paletteHint)`: Builds the Gemini instruction prompt for text, image, or rebuild generation.
- `getModelChain()`: Chooses the Gemini model retry chain used when one model is unavailable or overloaded.
- `getLocalPresetFromPrompt(value)`: Detects prompts that can be served by local preset models.
- `isRetryableModelError(error)`: Decides whether a provider error should trigger a retry/fallback.
- `cellKey(x, y, z)`: Converts coordinates to a stable key string.
- `parseCellKey(key)`: Converts a key string back into coordinates.
- `canPlaceBrick(...)`: Checks whether a brick footprint can be placed without overlap and with matching color.
- `markBrickCells(...)`: Marks occupied cells after a brick is placed.
- `generateBrickCells(...)`: Creates all cells covered by a brick footprint.
- `isDetailCell(...)`: Detects isolated or visual-detail cells that should stay small.
- `isCriticalDetailCell(...)`: Protects important edge/detail cells from being merged away.
- `canUseBrickPattern(...)`: Determines whether a candidate brick size is legal for a region.
- `getOrientations(pattern, y)`: Returns allowed rotations for a brick size on a layer.
- `getHorizontalNeighborKeys(x, y, z)`: Returns same-layer neighbor keys.
- `getNeighborKeys(x, y, z)`: Returns all direct 3D neighbor keys.
- `normalizeDecorativeSingletons(colorMap)`: Moves tiny decorative voxels toward nearby structure for better physical contact.
- `countConnectedSameColor(colorMap, startKey, color, limit)`: Counts same-color connected cells.
- `findNearestDifferentColor(...)`: Finds nearby contrast/support cells for detail repair.
- `voxelToBricks(...)`: Converts voxel cells into LEGO brick objects.
- `buildBricksForTargetRange(voxels)`: Builds candidate brick layouts targeting an acceptable brick count.
- `isTargetBrickCount(bricks)`: Checks whether a layout fits the target brick count.
- `getCommonBrickType(width, depth)`: Maps dimensions to common LEGO labels.
- `getBrickTypeForDimensions(width, depth)`: Returns a brick type label, including custom labels when needed.
- `constraintBrickToBrick(brick, index)`: Converts physical-constraint bricks into API brick output.
- `tryMergeCommonBrickPair(first, second)`: Attempts to merge adjacent bricks into a larger common brick.
- `mergeCommonBricksTowardTarget(...)`: Reduces brick count by merging legal neighboring parts.
- `enforceConnectedBricks(bricks, preferMediumParts)`: Repairs disconnected brick components using scaffold/support passes.
- `buildBricksFromColorMap(...)`: Builds bricks from occupancy and color maps.
- `buildMapsFromBricks(bricks)`: Recreates occupancy/color maps from bricks.
- `mixColor(a, b, ratio)`: Blends colors for support/detail voxels.
- `addEnhancedVoxel(...)`: Adds a voxel into an enhancement map.
- `buildVoxelSource(voxels)`: Builds lookup maps for voxel enhancement.
- `ensureSculpturalVolume(voxels)`: Adds volume to avoid flat generated shapes.
- `enhanceVoxelResolution(voxels, minimumVoxels)`: Adds detail and density before brick conversion.
- `brickOwnKeys(brick)`: Returns coordinate keys occupied by one brick.
- `hasBrickSupport(brick, occupied, ownKeys)`: Checks whether a brick is supported from below.
- `moveBrickDown(brick, occupied, colorMap)`: Drops unsupported bricks downward until contact or ground.
- `addSupportColumns(brick, occupied, colorMap)`: Adds support cells beneath unsupported areas.
- `stabilizeBrickSupports(bricks, preferMediumParts)`: Repeatedly drops/supports bricks so they do not float.
- `bricksToVoxels(bricks)`: Converts bricks back to voxel data.
- `validateBrickConnectivity(bricks)`: Checks unsupported bricks, overextended bricks, isolated bricks, connected components, and feasibility.
- `dedupeVoxels(voxels)`: Removes duplicate voxel coordinates.
- `validateManufacturability(voxels, bricks, validation)`: Produces the final manufacturability report, including overlap, support, connection, and physical feasibility.
- `settleVoxelsByGravity(voxels)`: Packs voxels downward in each column so generated objects do not float.
- `sideNeighborCount(...)`: Counts same-layer side neighbors around a voxel.
- `compactVoxelsForTightContact(voxels)`: Moves weak cells toward denser local structure to reduce gaps.
- `findConnectedComponentsFromVoxels(voxels)`: Finds disconnected voxel components.
- `closestPairByXZ(a, b)`: Finds nearest cells between two voxel components.
- `repairVoxelConnectivity(voxels)`: Adds bridge/support voxels so separate components become physically connected.
- `handler(req, res)`: Main generation endpoint. It handles CORS, validates request data, calls Gemini, retries fallback models, handles local preset fallbacks, repairs voxels, converts to bricks, validates LEGO manufacturability, and returns model data.

### `src/lib/5_brickLayout.ts`

- `cellKey(x, y, z)`: Shared coordinate key helper.
- `parseCellKey(key)`: Parses coordinate keys.
- `canPlaceBrick(...)`: Tests legal brick placement on a voxel region.
- `createCells(x, y, z, width, depth)`: Creates cells occupied by a brick.
- `markCells(used, cells)`: Marks cells used by placed bricks.
- `getHorizontalNeighbors(x, y, z)`: Returns same-layer neighbors.
- `isDetailCell(...)`: Detects detail voxels that should stay small.
- `isCriticalDetailCell(...)`: Protects important shape details during merging.
- `canUseBrickPattern(...)`: Filters legal/common brick patterns.
- `getOrientations(pattern, y)`: Returns possible brick rotations.
- `buildMapsFromBricks(bricks)`: Builds occupancy and color maps from bricks.
- `mixColor(a, b, ratio)`: Blends colors for generated support/detail cells.
- `addEnhancedVoxel(...)`: Adds enhanced voxels into a map.
- `buildVoxelSource(voxels)`: Creates lookup maps for original voxels.
- `ensureSculpturalVolume(voxels)`: Adds density and sculptural thickness.
- `enhanceVoxelResolution(voxels, minimumVoxels)`: Public helper that increases voxel resolution.
- `buildBricksFromVoxels(voxels, preferMediumParts)`: First-pass conversion from voxels to bricks.
- `brickOwnKeys(brick)`: Returns all cells occupied by one brick.
- `hasBrickSupport(brick, occupied, ownKeys)`: Checks support under a brick.
- `moveBrickDown(brick, occupied, colorMap)`: Moves unsupported bricks downward.
- `addSupportColumns(...)`: Adds columns below unsupported bricks.
- `buildBricksFromColorMap(...)`: Builds a brick layout from map data.
- `stabilizeBrickSupports(bricks, preferMediumParts)`: Public support stabilization pass.
- `getCommonBrickType(width, depth)`: Maps brick dimensions to standard/common types.
- `getBrickTypeForDimensions(width, depth)`: Gets the output type for a dimension pair.
- `constraintBrickToBrickData(brick, index)`: Converts constraint bricks to frontend brick data.
- `tryMergeCommonBrickPair(first, second)`: Merges adjacent bricks when a common LEGO size is possible.
- `mergeCommonBricksTowardTarget(...)`: Adjusts brick count toward a target range.
- `isTargetBrickCount(bricks)`: Checks whether count is acceptable.
- `chooseClosestBrickCount(candidates)`: Selects the layout closest to the target count.
- `enforceConnectedBricks(bricks, preferMediumParts)`: Adds scaffold/foundation/support corrections to keep the model physically connected.
- `chooseBestBrickCandidate(candidates)`: Chooses the candidate with best count and seam/interlock score.
- `voxelsToBricks(voxels)`: Public conversion from voxels to LEGO-style brick data.
- `normalizeBricks(value, fallbackVoxels)`: Validates external brick data or regenerates bricks from fallback voxels.
- `bricksToVoxels(bricks)`: Converts brick layout back to voxel cells.

### `src/lib/5_physicalConstraints.ts`

- `cellKey(x, y, z)`: Shared physical-constraint coordinate key helper.
- `parseCellKey(key)`: Parses a physical key into coordinates.
- `normalizeVoxels(voxels)`: Deduplicates and sorts voxel data for stable processing.
- `sameLayerNeighborKeys(x, y, z)`: Returns same-layer neighbor positions.
- `hasVerticalSupport(occupied, x, y, z, groundY)`: Checks whether a voxel is supported below or on ground.
- `hasSupportedNeighborWithinDistance(...)`: Allows short cantilevers only when nearby support exists.
- `enforceVoxelSupport(voxels, options)`: Adds support voxels under floating or overextended voxels.
- `shareAnyCellXZ(a, b, dy)`: Checks whether bricks overlap in x/z across adjacent layers.
- `hasStudSupport(brick, allCells, groundY)`: Checks whether a brick has valid lower support through studs/cells.
- `isBrickOverextended(brick, allCells, groundY, maxCantilever)`: Detects invalid long cantilevers.
- `analyzeBrickConnectivity(bricks, options)`: Builds a connectivity report with unsupported, isolated, overextended, and component counts.
- `brickToVoxels(brick)`: Converts a constraint brick into voxel cells.
- `closestPairByXZ(a, b)`: Finds nearest cells between disconnected components.
- `allBrickVoxelsById(bricks)`: Groups all brick cells by brick id.
- `pathBetweenXZ(from, to)`: Creates a Manhattan path between two cells on the x/z plane.
- `lineBrickFromPathCells(...)`: Converts path cells into scaffold bricks.
- `addRailBricks(...)`: Adds rail-like bridge/foundation bricks along a path.
- `createStudBridgeScaffoldBricks(bricks)`: Adds bridge bricks between disconnected components.
- `rectangleCells(x, y, z, width, depth)`: Creates rectangular brick cell footprints.
- `nextAllowedFoundationSpan(remaining)`: Chooses legal foundation brick span sizes.
- `createInterlockedFoundationBricks(bricks)`: Builds an interlocked foundation layer for better real-world connection.
- `createSupportColumnScaffoldBricks(bricks)`: Adds columns under unsupported elevated bricks.
- `addStudLockedBridge(...)`: Adds a stud-locked bridge between disconnected brick groups.
- `addSupportColumn(map, voxel)`: Adds a vertical support column below a voxel.
- `addBrickSupportColumns(...)`: Adds support columns below unsupported brick cells.
- `repairDisconnectedBricksToVoxels(bricks)`: Converts disconnected brick components into repair voxels and support bridges.
- `layerBoundaryKeys(cells)`: Finds seam/boundary cells for interlock scoring.
- `scoreSeamInterlock(cells, lowerBricks)`: Scores whether upper cells stagger over lower brick seams.
- `scoreBrickSeamInterlock(bricks)`: Scores the whole layout for stronger staggered LEGO-style interlocking.

### `src/5_types.ts`

- `LegoPart`: One item in the parts/inventory list.
- `BuildHistory`: One UI history record.
- `AppState`: Engine state enum type such as `STABLE`, `DISMANTLING`, and `REBUILDING`.
- `VoxelData`: One voxel cell with `x`, `y`, `z`, and `color`.
- `BrickType`: Supported LEGO-style part labels such as `1x1`, `2x2`, `2x4`, and larger merged parts.
- `BrickCell`: One occupied stud cell inside a brick.
- `BrickData`: Serializable brick object used by API, frontend, and renderer.
- `SimulationBrick`: Runtime Three.js/physics brick state.
- `RebuildTarget`: Target position/rotation/geometry data used by rebuild animation.
- `SavedModel`: Frontend saved model object.
- `PersistedBuildRecord`: Database/API build record structure.

### `scripts/5_physical-constraints.test.ts`

- `assert(condition, message)`: Minimal test assertion helper.
- `hasVoxel(voxels, x, y, z)`: Checks whether a voxel list contains a coordinate.
- Test cases: Verify support filling, cantilever limits, disconnected-component repair, side-contact rejection, valid stud-supported overhangs, invalid overlong overhangs, seam interlock scoring, and large-brick merging such as `2x8`.

### Compatibility files

- `api/generate-voxel.ts`: Re-exports `api/5_generate-voxel.impl.ts`.
- `src/lib/brickLayout.ts`: Re-exports `src/lib/5_brickLayout.ts`.
- `src/lib/physicalConstraints.ts`: Re-exports `src/lib/5_physicalConstraints.ts`.
- `src/types.ts`: Re-exports `src/5_types.ts`.
- `scripts/physical-constraints.test.ts`: Imports `scripts/5_physical-constraints.test.ts`.

## 8. Person 6 Files and Responsibilities

### `package.json`

- Defines app metadata, runtime dependencies, dev dependencies, and scripts.
- `dev`: Starts Vite development server on port `3000`.
- `build`: Builds the production frontend.
- `preview`: Previews the production build.
- `clean`: Removes the local `dist` output.
- `lint`: Runs TypeScript checking with `tsc --noEmit`.

### `package-lock.json`

- Locks exact dependency versions so other devices install the same package tree.

### `tsconfig.json`

- Configures TypeScript, React JSX, bundler module resolution, DOM types, JSON imports, and the `@/*` alias.

### `vercel.json`

- Configures Vercel deployment behavior for frontend routing and serverless API functions.

### `.env.example`

- Documents required server environment variables, especially `GEMINI_API_KEY`.

### `.gitignore`

- Prevents local dependencies, build output, environment files, and local artifacts from being committed.

### `README.md`

- Provides project description, setup steps, local running instructions, and deployment notes.

### `VERCEL_IMAGE_TEXT_ISSUE_FIX.md`

- Explains why Vercel and AI Studio may behave differently and documents the image/text generation API fix.

### `metadata.json`

- Stores project metadata used by AI Studio or related tooling.

### `TEAM_FILE_FUNCTION_BREAKDOWN.md`

- This document. It maps the changed Ocean folder files to six-person responsibilities and explains each file/function.

### `index.html`

- Static browser entry file containing the React `root` mount element.

## 9. End-to-end Task Flow

1. Person 1 provides the application shell and global visual style.
2. Person 2 collects the prompt/image/JSON input and calls the correct workflow.
3. Person 5 handles AI/local generation, converts voxels into LEGO bricks, repairs support/connectivity, and validates manufacturability.
4. Person 3 renders the returned bricks as a realistic 3D LEGO model with studs, underside holes, hidden covered studs, camera controls, and animation.
5. Person 4 saves or loads generated builds through the database API and local SQLite storage.
6. Person 6 maintains deployment configuration, environment setup, documentation, and final integration checks.

## 10. Current Completed Parts

- Text/image prompt generation route is implemented through `api/5_generate-voxel.impl.ts`.
- Local preset fallback models are implemented through `src/lib/3_voxelGenerators.ts`.
- Multi-size LEGO brick conversion is implemented through `src/lib/5_brickLayout.ts` and mirrored in the generation endpoint.
- Physical support, connection, scaffold, foundation, and seam interlock checks are implemented through `src/lib/5_physicalConstraints.ts`.
- 3D rendering includes brick bodies, studs, underside connection holes/tubes, hidden covered studs, and animated rebuild/dismantle behavior.
- Saved-build database API is implemented through `api/4_builds.impl.ts` and `server/4_database.ts`.
- Vercel/local API compatibility is preserved by wrapper files and `4_vite.config.impl.ts`.
