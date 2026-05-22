# Ocean-work-main 项目文件命名、六人分工与函数说明

本文档根据当前 `Ocean-work-main` 文件夹内容重新整理。项目文件已经重新按 6 人任务分工编号，编号文件是正式实现文件；未编号文件保留为框架兼容入口，避免 Vite、React、Vercel 找不到固定入口或 API 路由。

## 1. 文件命名规则

| 编号 | 成员 | 负责模块 |
|---|---|---|
| `1_` | 1 号成员 | 前端入口、页面框架、全局样式 |
| `2_` | 2 号成员 | 生成器页面、用户交互、保存记录面板 |
| `3_` | 3 号成员 | 3D 渲染、Three.js 引擎、本地模型生成 |
| `4_` | 4 号成员 | 数据库、保存记录 API、本地 Vite API 桥接 |
| `5_` | 5 号成员 | AI 生成接口、乐高砖块算法、物理连接校验 |
| 无编号配置文件 | 6 号成员 | 部署配置、依赖管理、说明文档、集成检查 |

## 2. 保留未编号文件的原因

这些文件不能完全删除或随意改名，因为工具链会按固定路径查找它们。当前做法是：保留原文件名，但文件内容只转发到编号实现文件。

| 兼容入口文件 | 实际实现文件 |
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

## 3. 六人整体分工

| 成员 | 前后端 | 任务重点 | 文件 |
|---|---|---|---|
| 1 号成员 | 前端 | 应用入口、布局、视觉主题 | `src/1_App.tsx`, `src/1_main.tsx`, `src/1_index.css`, `src/components/1_Layout.tsx` |
| 2 号成员 | 前端 | 生成器页面、文字/图片输入、JSON 导入导出、数据库面板 | `src/pages/2_Generator.tsx` |
| 3 号成员 | 前端 | 3D LEGO 渲染、积木动画、预设模型 | `src/services/3_VoxelEngine.ts`, `src/lib/3_voxelConstants.ts`, `src/lib/3_voxelGenerators.ts` |
| 4 号成员 | 后端 | 保存记录 API、SQLite 数据库、本地开发 API 代理 | `api/4_builds.impl.ts`, `server/4_database.ts`, `db/4_schema.sql`, `4_vite.config.impl.ts` |
| 5 号成员 | 后端/算法 | Gemini 生成接口、多规格积木合并、物理连接可行性校验 | `api/5_generate-voxel.impl.ts`, `src/lib/5_brickLayout.ts`, `src/lib/5_physicalConstraints.ts`, `src/5_types.ts`, `scripts/5_physical-constraints.test.ts` |
| 6 号成员 | 全栈集成 | 部署、依赖、环境变量、项目文档 | `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `.env.example`, `.gitignore`, `README.md`, `VERCEL_IMAGE_TEXT_ISSUE_FIX.md`, `metadata.json`, `TEAM_FILE_FUNCTION_BREAKDOWN.md`, `index.html` |

## 4. 1 号成员：前端入口与布局

### `src/1_App.tsx`

- `App()`: React 根组件，将 `Generator` 页面放入统一的 `Layout` 页面框架中。

### `src/1_main.tsx`

- React 挂载逻辑：从 HTML 中的 `#root` 创建 React 根节点，渲染 `App`，并加载 `src/1_index.css`。

### `src/components/1_Layout.tsx`

- `Layout({ children })`: 全局页面布局组件，包含顶部标题栏、系统状态、构建模式显示区域，并把页面主体内容放入 `main` 区域。

### `src/1_index.css`

- 定义 Tailwind 主题变量、颜色、字体、背景、玻璃面板、按钮 hover 动效、滚动条、滑块样式。

### 兼容入口

- `src/App.tsx`: 转发 `src/1_App.tsx`。
- `src/main.tsx`: 引入 `src/1_main.tsx`。
- `src/index.css`: 引入 `src/1_index.css`。
- `src/components/Layout.tsx`: 转发 `src/components/1_Layout.tsx`。

## 5. 2 号成员：生成器页面与用户流程

### `src/pages/2_Generator.tsx`

- `compilePhysicalModel(data, bricks)`: 将 voxel 和 brick 数据统一成页面/渲染器可直接使用的模型结构，当前主要通过 `bricksToVoxels` 保持 voxel 与 brick 一致。
- `buildPresetModel(name)`: 根据 `Eagle`、`Fox`、`Tiger` 等名称生成本地预设模型，并转换为页面可加载的数据。
- `formatBuildMode(mode)`: 将 `create`、`morph`、`image`、`import` 转换成界面显示文字。
- `Generator()`: 核心页面组件，管理提示词、图片上传、生成按钮、预设模型、JSON 导入导出、数据库记录、当前模型、积木清单、左右面板折叠、自动旋转等状态。
- `selectedRecord`: 从数据库记录中选出当前正在查看的保存记录。
- `loadSavedBuilds()`: 请求 `/api/builds`，读取数据库记录，刷新 Saved Builds、Rebuilds、History 和数据库路径显示。
- 页面初始化 `useEffect`: 创建 `VoxelEngine`，加载初始 Fox 模型，绑定窗口 resize 和 ResizeObserver。
- 数据库加载 `useEffect`: 页面加载后自动调用 `loadSavedBuilds()`。
- `relevantRebuilds`: 只显示当前基础模型相关的 rebuild 记录。
- `syncPartsFromBricks(bricks)`: 按砖块类型和颜色统计零件数量，生成 Parts List。
- `loadModel(name, data, bricks)`: 直接加载模型到 3D 引擎，并更新当前模型、零件清单和历史记录。
- `rebuildModel(name, data, bricks)`: 调用 3D 引擎的 rebuild 动画，让当前模型变化为目标模型。
- `persistBuild(build)`: 通过 `/api/builds` 保存生成、图片、导入或 rebuild 的模型。
- `handlePresetBuild(name)`: 加载本地预设模型。
- `getLocalPresetFromPrompt(value)`: 从提示词中识别 `fox`、`tiger`、`狐狸`、`老虎` 等关键词。
- `handleQuickPreset(name)`: 不调用 AI，直接加载本地 Fox/Tiger 快捷模型。
- `handleToggleRotation()`: 控制 3D 模型是否自动旋转。
- `handleLoadSavedBuild(build)`: 从保存列表中重新加载模型。
- `handleDeleteRecord(id)`: 删除数据库保存记录并刷新列表。
- `handleGenerate(mode)`: 生成主流程。根据模式处理文字或图片输入，调用 `/api/generate-voxel`，处理本地预设 fallback，加载模型并保存生成结果。
- `openExportModal()`: 打开 JSON 导出弹窗，并读取当前 3D 模型 JSON。
- `openImportModal()`: 打开 JSON 导入弹窗。
- `handleJsonImport()`: 解析用户输入的 JSON，转换为 voxel/brick，加载到引擎并保存为 import 记录。
- `handleCopyJson()`: 复制导出的 JSON。
- `handleExportParts()`: 将零件清单导出为文本文件。

### 兼容入口

- `src/pages/Generator.tsx`: 转发 `src/pages/2_Generator.tsx`。

## 6. 3 号成员：3D 渲染与本地模型

### `src/services/3_VoxelEngine.ts`

- `constructor(container, onStateChange, onCountChange)`: 初始化 Three.js 场景、相机、渲染器、控制器、灯光、地面、实例化网格和动画循环。
- `loadInitialModel(data, brickData)`: 加载初始模型，创建积木实例，调整相机，并更新 voxel 数量。
- `rebuild(targetModel, brickData)`: 计算目标积木布局并启动重建动画。
- `dismantle()`: 进入拆散状态，为积木加入速度和旋转，让模型散开。
- `handleResize()`: 根据容器大小更新相机比例和渲染器尺寸。
- `setAutoRotate(enabled)`: 打开或关闭 OrbitControls 自动旋转。
- `focusModel(data, brickData)`: 根据当前模型重新聚焦相机。
- `getJsonData()`: 将当前模型导出为 JSON。
- `getUniqueColors()`: 返回当前模型使用到的颜色。
- `cleanup()`: 停止动画循环并释放 Three.js 资源。
- `createBricks(data, brickData)`: 创建运行时积木对象，并绘制砖块主体、上方凸点、下方连接孔/管结构。
- `fitCameraToBricks(bricks)`: 根据模型尺寸计算相机位置。
- `applyCameraFraming()`: 应用相机位置和 OrbitControls 目标点。
- `draw()`: 每帧更新实例化网格矩阵和颜色；上方被覆盖的凸点会隐藏，避免上下拼接后凸点露出。
- `getColorDist(c1, hex2)`: 计算颜色距离，用于 rebuild 时匹配旧积木和新积木。
- `updatePhysics()`: 更新拆散、下落、弹跳、旋转和重建动画。
- `animate()`: 主渲染循环。
- `getVoxelData()`: 从当前积木状态反算 voxel 数据。
- `getTotalCells()`: 统计所有积木占用的格子数量。
- `disposeInstancedMesh(mesh)`: 安全移除并释放实例化网格。

### `src/lib/3_voxelConstants.ts`

- `VOXEL_SIZE`: 单个 stud 单元的基础尺寸。
- `FLOOR_Y`: 地面高度。
- `BACKGROUND_COLOR`: 3D 场景背景色。
- `COLORS`: 本地模型和渲染共享颜色。
- `CONFIG`: 积木高度、stud 高度、孔洞尺寸、间距等渲染参数。

### `src/lib/3_voxelGenerators.ts`

- `setBlock(map, x, y, z, color)`: 向坐标 Map 中写入一个 voxel，避免重复。
- `generateSphere(...)`: 生成球形/圆润体块，用于动物身体、头部、耳朵等。
- `Generators.Eagle()`: 生成 Eagle 预设模型。
- `Generators.Cat()`: 生成 Cat 预设模型。
- `Generators.Rabbit()`: 生成 Rabbit 预设模型。
- `Generators.Twins()`: 生成双模型预设。
- `Generators.Fox()`: 生成 Fox 本地模型，用于快捷模型和 AI fallback。
- `Generators.Tiger()`: 生成 Tiger 本地模型，用于快捷模型和 AI fallback。
- `buildMiniEagle(offsetX, offsetZ)`: `Twins` 内部小鹰构建函数。

### 兼容入口

- `src/services/VoxelEngine.ts`: 转发 `src/services/3_VoxelEngine.ts`。
- `src/lib/voxelConstants.ts`: 转发 `src/lib/3_voxelConstants.ts`。
- `src/lib/voxelGenerators.ts`: 转发 `src/lib/3_voxelGenerators.ts`。

## 7. 4 号成员：数据库与 API 保存模块

### `api/4_builds.impl.ts`

- `getCorsHeaders(req)`: 生成 CORS 响应头，支持不同设备和不同来源访问 API。
- `jsonResponse(res, req, status, payload)`: 统一返回 JSON，并附带 CORS 头。
- `parseBody(req)`: 兼容字符串 body、对象 body 和空 body。
- `isVoxelArray(value)`: 校验保存数据是否为合法 voxel 数组。
- `handler(req, res)`: `/api/builds` 主处理函数，支持 `OPTIONS`、`GET`、`POST`、`DELETE`，用于读取、保存、删除构建记录。

### `server/4_database.ts`

- `getDatabase()`: 创建 `.data` 目录，打开 SQLite 数据库，执行 `db/4_schema.sql` 初始化表结构。
- `mapRow(row)`: 将数据库行转换为前端可用的保存记录对象。
- `listBuilds(limit)`: 查询最近保存的模型记录。
- `createBuild(input)`: 新增一条模型保存记录。
- `deleteBuild(id)`: 按 id 删除记录。
- `databaseFilePath()`: 返回本地数据库文件路径，供数据库面板显示。

### `db/4_schema.sql`

- `builds` 表：保存模型 id、名称、提示词、模式、基础模型、voxel 数量、voxel JSON、创建时间、更新时间。
- `idx_builds_created_at`: 按创建时间加速查询。
- `idx_builds_mode`: 按模式加速查询。
- `idx_builds_base_model`: 按基础模型加速查询。

### `4_vite.config.impl.ts`

- `createNodeStyleResponse(res)`: 将本地 Node response 包装成接近 Vercel API 的响应对象。
- `readJsonBody(req)`: 读取本地开发请求中的 JSON body。
- `localApiPlugin()`: 在 Vite 开发环境中把 `/api/builds` 和 `/api/generate-voxel` 转发到 TypeScript API 文件。
- `runHandler(server, req, res, next)`: 动态加载 API handler 并执行。
- 默认配置：加载 `.env.local` 和 `.env`，注册 React、Tailwind、本地 API 插件和路径 alias。

### 兼容入口

- `api/builds.ts`: 转发 `api/4_builds.impl.ts`。
- `server/database.ts`: 转发 `server/4_database.ts`。
- `db/schema.sql`: 保留兼容说明，正式 schema 在 `db/4_schema.sql`。
- `vite.config.ts`: 转发 `4_vite.config.impl.ts`。

## 8. 5 号成员：AI 生成、积木算法与物理校验

### `api/5_generate-voxel.impl.ts`

- `getCorsHeaders(req)`: 为生成接口设置 CORS。
- `jsonResponse(res, req, status, payload)`: 返回统一 JSON。
- `toVoxelColor(color)`: 将十六进制颜色转为数字颜色。
- `buildSystemPrompt(mode, prompt, paletteHint)`: 根据文字、图片或 rebuild 模式生成 Gemini 系统提示词。
- `getModelChain()`: 从环境变量读取 Gemini 模型链，支持失败后切换模型。
- `getLocalPresetFromPrompt(value)`: 识别 Fox/Tiger 相关提示词，决定是否用本地模型 fallback。
- `isRetryableModelError(error)`: 判断 429、500、503、504、timeout 是否可重试。
- `cellKey(x, y, z)`: 坐标转字符串 key。
- `parseCellKey(key)`: 字符串 key 转坐标。
- `canPlaceBrick(...)`: 判断指定尺寸砖块是否能放在当前 voxel 区域。
- `markBrickCells(...)`: 标记砖块占用格子。
- `generateBrickCells(...)`: 生成一个砖块覆盖的所有格子。
- `isDetailCell(...)`: 判断某格是否为细节格，避免被大砖块吞掉。
- `isCriticalDetailCell(...)`: 判断是否为关键细节颜色/区域。
- `canUseBrickPattern(...)`: 判断某种砖块尺寸是否适合当前区域。
- `getOrientations(pattern, y)`: 获取砖块在当前层允许的方向。
- `getHorizontalNeighborKeys(...)`: 获取同层四邻接格。
- `getNeighborKeys(...)`: 获取三维六邻接格。
- `normalizeDecorativeSingletons(colorMap)`: 修正孤立装饰格，使其更容易连接到主体。
- `countConnectedSameColor(...)`: 统计同色连通区域大小。
- `findNearestDifferentColor(...)`: 寻找附近不同颜色，用于细节修补。
- `voxelToBricks(...)`: 将 voxel 转换为乐高砖块布局。
- `buildBricksForTargetRange(voxels)`: 生成多个砖块候选方案并选择接近目标数量的方案。
- `isTargetBrickCount(bricks)`: 判断砖块数量是否在目标范围内。
- `getCommonBrickType(width, depth)`: 将尺寸映射到常见砖块类型。
- `getBrickTypeForDimensions(width, depth)`: 为任意尺寸返回砖块类型。
- `constraintBrickToBrick(brick, index)`: 将物理校验砖块转换为 API 输出砖块。
- `tryMergeCommonBrickPair(first, second)`: 尝试把相邻小砖合并为常见大砖。
- `mergeCommonBricksTowardTarget(...)`: 在保持常见尺寸的前提下减少砖块数量。
- `enforceConnectedBricks(bricks, preferMediumParts)`: 使用桥接、地基、支撑柱等方式增强连接。
- `buildBricksFromColorMap(...)`: 从占用图和颜色图生成砖块。
- `buildMapsFromBricks(bricks)`: 从砖块反建占用图和颜色图。
- `mixColor(a, b, ratio)`: 混合颜色，用于补充支撑/细节格。
- `addEnhancedVoxel(...)`: 添加增强 voxel。
- `buildVoxelSource(voxels)`: 构建 voxel 查找表。
- `ensureSculpturalVolume(voxels)`: 增加模型厚度，避免生成过薄平面。
- `enhanceVoxelResolution(voxels, minimumVoxels)`: 提升 voxel 密度和细节。
- `stabilizeBrickSupports(bricks, preferMediumParts)`: 让砖块下落或补支撑，减少悬空。
- `bricksToVoxels(bricks)`: 砖块转 voxel。
- `validateBrickConnectivity(bricks)`: 校验支撑、孤立砖块、连通分量和物理可行性。
- `dedupeVoxels(voxels)`: 去除重复 voxel。
- `validateManufacturability(voxels, bricks, validation)`: 输出可制造性报告，包括网格对齐、重叠、支撑、连通、缝隙/拼接可行性。
- `sideNeighborCount(...)`: 统计某 voxel 的同层邻接数量。
- `compactVoxelsForTightContact(voxels)`: 将弱连接 voxel 向主体压紧，减少明显缝隙。
- `findConnectedComponentsFromVoxels(voxels)`: 查找 voxel 连通分量。
- `closestPairByXZ(a, b)`: 查找两个分量之间最近的 x/z 连接点。
- `repairVoxelConnectivity(voxels, bricks, validation)`: 补桥、补支撑，让模型更接近真实可拼接结构。
- `handler(req, res)`: `/api/generate-voxel` 主处理函数。负责参数校验、调用 Gemini、超时/重试、本地预设 fallback、voxel 清理、砖块合并、物理校验和返回结果。

### `src/lib/5_brickLayout.ts`

- `cellKey(x, y, z)`: 坐标 key 工具。
- `parseCellKey(key)`: key 解析工具。
- `canPlaceBrick(...)`: 判断砖块是否可放置。
- `createCells(...)`: 创建砖块占用格。
- `markCells(...)`: 标记已使用格。
- `getHorizontalNeighbors(...)`: 获取同层邻居。
- `isDetailCell(...)`: 识别细节格。
- `isCriticalDetailCell(...)`: 识别关键细节格。
- `canUseBrickPattern(...)`: 控制可用砖块规格。
- `getOrientations(...)`: 生成砖块旋转方向。
- `buildMapsFromBricks(bricks)`: 从砖块生成占用图和颜色图。
- `mixColor(a, b, ratio)`: 颜色混合。
- `addEnhancedVoxel(...)`: 添加增强 voxel。
- `buildVoxelSource(voxels)`: 构建 voxel 来源表。
- `ensureSculpturalVolume(voxels)`: 增加体积感。
- `enhanceVoxelResolution(voxels, minimumVoxels)`: 增加模型细节和 voxel 数量。
- `buildBricksFromVoxels(voxels, preferMediumParts)`: 第一轮 voxel 到砖块转换。
- `buildBricksFromColorMap(...)`: 从颜色/占用图放置多规格砖块。
- `stabilizeBrickSupports(bricks, preferMediumParts)`: 前端侧支撑稳定化。
- `getCommonBrickType(width, depth)`: 常见砖块类型映射。
- `getBrickTypeForDimensions(width, depth)`: 尺寸到砖块类型映射。
- `constraintBrickToBrickData(brick, index)`: 物理校验砖块转前端砖块。
- `tryMergeCommonBrickPair(first, second)`: 合并相邻砖块。
- `mergeCommonBricksTowardTarget(...)`: 将砖块数量调整到更合理范围。
- `isTargetBrickCount(bricks)`: 判断砖块数量目标。
- `chooseClosestBrickCount(candidates)`: 选择最接近目标数量的候选方案。
- `enforceConnectedBricks(bricks, preferMediumParts)`: 使用桥接、地基和支撑柱增强真实连接。
- `chooseBestBrickCandidate(candidates)`: 根据数量和缝隙/错缝评分选择最佳砖块方案。
- `voxelsToBricks(voxels)`: 前端公开转换函数。
- `normalizeBricks(value, fallbackVoxels)`: 校验外部 brick 数据，不合法时用 voxel 重新生成。
- `bricksToVoxels(bricks)`: brick 转 voxel。

### `src/lib/5_physicalConstraints.ts`

- `cellKey(x, y, z)`: 物理校验坐标 key。
- `parseCellKey(key)`: 解析坐标 key。
- `normalizeVoxels(voxels)`: 去重并排序 voxel。
- `sameLayerNeighborKeys(x, y, z)`: 获取同层邻接。
- `hasVerticalSupport(...)`: 判断格子是否有下方支撑。
- `hasSupportedNeighborWithinDistance(...)`: 判断短悬臂是否在允许距离内。
- `enforceVoxelSupport(voxels, options)`: 为悬空 voxel 补支撑。
- `shareAnyCellXZ(a, b, dy)`: 判断上下层砖块是否在 x/z 上重叠。
- `hasStudSupport(brick, allCells, groundY)`: 判断砖块是否有有效 stud 支撑。
- `isBrickOverextended(...)`: 判断砖块悬臂是否过长。
- `analyzeBrickConnectivity(bricks, options)`: 输出砖块连通性、孤立砖块、无支撑砖块和物理可行性报告。
- `brickToVoxels(brick)`: brick 转 voxel。
- `closestPairByXZ(a, b)`: 查找两个组件最近点。
- `allBrickVoxelsById(bricks)`: 按 brick id 整理 voxel。
- `pathBetweenXZ(from, to)`: 生成 x/z 平面曼哈顿路径。
- `lineBrickFromPathCells(...)`: 把路径格转换为线性砖块。
- `addRailBricks(...)`: 沿路径添加桥接/地基砖。
- `addVerticalConnectorBricks(...)`: 添加竖向连接砖。
- `createStudBridgeScaffoldBricks(bricks)`: 为断开的组件添加 stud 桥接结构。
- `rectangleCells(...)`: 生成矩形砖块格子。
- `nextAllowedFoundationSpan(remaining)`: 选择合适地基跨度。
- `bottomFootprintKeys(...)`: 获取底层占地格。
- `connectedFootprintComponents(keys)`: 分析底部占地连通性。
- `addFoundationRunsForAxis(...)`: 按 x/z 方向生成交错地基层。
- `createInterlockedFoundationBricks(bricks)`: 创建交错地基，提高整体真实连接性。
- `createSupportColumnScaffoldBricks(bricks)`: 为无支撑砖块补支撑柱。
- `addStudLockedBridge(...)`: 在 voxel 层添加可锁定桥接。
- `voxelNeighborCount(...)`: 统计 voxel 邻居数量。
- `chooseCoreBridgeY(voxels)`: 选择桥接核心高度。
- `chooseBridgePair(...)`: 选择两个组件之间最合适的连接点。
- `addCoreLayerGapFill(...)`: 补齐核心层空隙。
- `addSupportColumn(...)`: 添加单根支撑柱。
- `addBrickSupportColumns(...)`: 为砖块批量补支撑柱。
- `repairDisconnectedBricksToVoxels(bricks)`: 把断开的 brick 组件转换为可修复 voxel 并补桥。
- `layerBoundaryKeys(cells)`: 计算层边界/缝隙 key。
- `scoreSeamInterlock(candidateCells, existingBricks)`: 评估上下层是否错缝互锁。
- `scoreBrickSeamInterlock(bricks)`: 计算整体模型错缝互锁评分。

### `src/5_types.ts`

- `LegoPart`: 零件清单项。
- `BuildHistory`: 生成历史记录。
- `AppState`: 3D 引擎状态，包括 `STABLE`、`DISMANTLING`、`REBUILDING`。
- `VoxelData`: voxel 坐标和颜色。
- `BrickType`: 支持的砖块类型，包括 `1x1`、`1x2`、`1x3`、`1x4`、`2x2`、`2x3`、`2x4`、`2x6`、`2x8`。
- `BrickCell`: 单个砖块内部占用格。
- `BrickData`: 可序列化砖块数据。
- `SimulationBrick`: 3D/物理运行时砖块状态。
- `RebuildTarget`: rebuild 动画目标。
- `SavedModel`: 前端保存模型结构。
- `PersistedBuildRecord`: 数据库/API 保存记录结构。

### `scripts/5_physical-constraints.test.ts`

- `assert(condition, message)`: 简单断言函数。
- `hasVoxel(voxels, x, y, z)`: 判断 voxel 列表中是否包含指定坐标。
- 测试内容：悬空补支撑、悬臂限制、断开组件修复、同层接触不算真实连接、地面同层接触不等于底板连接、合法/非法悬臂、错缝评分、多规格砖块合并。

### 兼容入口

- `api/generate-voxel.ts`: 转发 `api/5_generate-voxel.impl.ts`。
- `src/lib/brickLayout.ts`: 转发 `src/lib/5_brickLayout.ts`。
- `src/lib/physicalConstraints.ts`: 转发 `src/lib/5_physicalConstraints.ts`。
- `src/types.ts`: 转发 `src/5_types.ts`。
- `scripts/physical-constraints.test.ts`: 引入 `scripts/5_physical-constraints.test.ts`。

## 9. 6 号成员：部署、依赖与文档

### `package.json`

- 管理项目脚本和依赖。
- `dev`: 启动 Vite 开发服务器。
- `build`: 构建生产版本。
- `preview`: 预览生产构建。
- `clean`: 清理 `dist`。
- `lint`: 执行 TypeScript 类型检查。

### `package-lock.json`

- 锁定依赖版本，保证不同设备安装结果一致。

### `tsconfig.json`

- 配置 TypeScript、React JSX、模块解析、DOM 类型和路径 alias。

### `vercel.json`

- 配置 Vercel 部署、路由和 serverless API 行为。

### `.env.example`

- 说明必须配置的环境变量，尤其是 `GEMINI_API_KEY`。

### `.gitignore`

- 忽略依赖、构建输出、环境变量文件和本地生成数据。

### `README.md`

- 项目说明、运行方式、部署说明。

### `VERCEL_IMAGE_TEXT_ISSUE_FIX.md`

- 说明 Vercel 与 AI Studio 在图片/文字生成上表现不同的原因及修复方式。

### `metadata.json`

- 项目元数据文件。

### `TEAM_FILE_FUNCTION_BREAKDOWN.md`

- 当前分工与文件函数说明文档。

### `index.html`

- 浏览器 HTML 入口，提供 React 挂载点 `#root`。

## 10. 项目整体流程

1. 1 号成员提供应用入口、布局和全局视觉样式。
2. 2 号成员在生成器页面接收文字、图片、JSON 或预设模型输入。
3. 5 号成员通过 Gemini 或本地 fallback 生成 voxel，并转换成多规格 LEGO 砖块。
4. 5 号成员继续执行支撑、连接、错缝、地基、桥接和可制造性校验。
5. 3 号成员使用 Three.js 渲染真实 LEGO 风格模型，包括凸点、下方孔洞、隐藏被覆盖凸点和 rebuild/dismantle 动画。
6. 4 号成员通过 API 和 SQLite 保存、读取、删除模型记录。
7. 6 号成员负责部署配置、环境变量、依赖管理和最终文档。

## 11. 当前已完成内容

- 已实现文字生成、图片生成、本地预设 fallback。
- 已支持多规格砖块：`1x1`、`1x2`、`1x3`、`1x4`、`2x2`、`2x3`、`2x4`、`2x6`、`2x8`。
- 已加入真实拼接相关逻辑：下方支撑、上下层 stud 连接、断开组件桥接、交错地基、支撑柱、错缝评分。
- 已在 3D 视觉上加入上方凸点、下方连接孔/管、上下拼接时隐藏被覆盖凸点。
- 已实现 Saved Builds 数据库存储与数据库面板。
- 已保留 Vercel 与本地开发都可识别的兼容入口文件。
