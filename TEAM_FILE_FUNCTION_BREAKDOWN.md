# Ocean-work-main 文件分工与函数说明（中文版）

本文档基于当前仓库实际文件状态编写，目标是：
- 对齐当前“带编号实现文件 + 无编号兼容入口文件”的命名方式；
- 明确六人分工；
- 对核心模块做到函数级说明；
- 说明当前版本相较首版的关键改进。

## 1. 当前项目结构总览

当前项目采用“实现文件带成员编号、入口文件保持框架默认命名”的双层结构：
- 实现文件（例如 `2_Generator.tsx`、`5_generate-voxel.impl.ts`）承载实际业务逻辑；
- 兼容入口文件（例如 `src/App.tsx`、`api/generate-voxel.ts`）仅做 `export` 转发，保证 Vite/Vercel/React 的默认加载路径不被破坏。

数据库相关代码已移除，`Saved Builds` 目前为前端会话内存态，不做后端持久化。

## 2. 六人分工（按当前仓库）

| 成员 | 负责方向 | 主要文件 |
|---|---|---|
| He Linlin | Frontend entry and app shell | `src/1_App.tsx` `src/1_main.tsx` `src/1_index.css` |
| Huang Shuna | Generator page interaction and orchestration | `src/pages/2_Generator.tsx` |
| Wu Enze (Team Leader) | 3D engine and preset models | `src/services/3_VoxelEngine.ts` `src/lib/3_voxelConstants.ts` `src/lib/3_voxelGenerators.ts` |
| Liu Shuoyang | Local API bridge and dev runtime config | `4_vite.config.impl.ts` |
| Xu Zichen | Generation API and physical feasibility algorithms | `api/5_generate-voxel.impl.ts` `src/lib/5_physicalConstraints.ts` `src/lib/5_brickLayout.ts` `src/5_types.ts` `scripts/5_physical-constraints.test.ts` |
| Bai Yule | Integration, compatibility entries, docs, and deployment | `src/App.tsx` `src/main.tsx` `src/index.css` `src/components/Layout.tsx` `src/pages/Generator.tsx` `src/services/VoxelEngine.ts` `src/lib/voxel*.ts` `api/generate-voxel.ts` `README.md` `vercel.json` `package.json` 等 |

## 3. 兼容入口文件映射（无业务逻辑）

这些文件只做转发，目的是兼容框架默认入口，不承载核心算法：

- `src/App.tsx` -> `src/1_App.tsx`
- `src/main.tsx` -> `src/1_main.tsx`
- `src/index.css` -> `src/1_index.css`
- `src/components/Layout.tsx` -> `src/components/1_Layout.tsx`
- `src/pages/Generator.tsx` -> `src/pages/2_Generator.tsx`
- `src/services/VoxelEngine.ts` -> `src/services/3_VoxelEngine.ts`
- `src/lib/voxelConstants.ts` -> `src/lib/3_voxelConstants.ts`
- `src/lib/voxelGenerators.ts` -> `src/lib/3_voxelGenerators.ts`
- `src/lib/brickLayout.ts` -> `src/lib/5_brickLayout.ts`
- `src/lib/physicalConstraints.ts` -> `src/lib/5_physicalConstraints.ts`
- `src/types.ts` -> `src/5_types.ts`
- `api/generate-voxel.ts` -> `api/5_generate-voxel.impl.ts`
- `scripts/physical-constraints.test.ts` -> `scripts/5_physical-constraints.test.ts`

## 4. 核心文件与函数级说明

## 4.1 He Linlin: Frontend Entry

### 文件：`src/1_App.tsx`
- `App()`：应用根组件，负责把 `Layout` 与 `Generator` 组合起来。

### 文件：`src/1_main.tsx`
- `createRoot(...).render(...)`：React 挂载入口，启用 `StrictMode`，加载全局样式并渲染 `App`。

### 文件：`src/1_index.css`
- 全局样式入口文件（无函数），定义基础样式与主题。

## 4.2 Huang Shuna: Generator Orchestration

### 文件：`src/pages/2_Generator.tsx`

#### 顶层工具函数
- `compilePhysicalModel(data, bricks?)`：统一把 voxel 与 brick 组装为引擎加载结构。
- `buildPresetModel(name)`：调用预设生成器并返回可直接渲染的物理模型。
- `formatBuildMode(mode)`：把内部模式值映射为 UI 显示文案。

#### 组件内关键函数（`Generator`）
- `syncPartsFromBricks(bricks)`：根据砖块统计零件清单与数量。
- `loadModel(name, data, bricks?)`：整模型加载（初始/切换场景）。
- `rebuildModel(name, data, bricks?)`：拆解后重建动画入口。
- `persistBuild(build)`：将生成记录保存到前端会话内存（非数据库）。
- `handlePresetBuild(name)` / `handleQuickPreset(name)`：预设模型快速加载。
- `getLocalPresetFromPrompt(value)`：关键词命中本地 Fox/Tiger，减少远程 API 依赖。
- `handleToggleRotation()`：切换自动旋转。
- `handleLoadSavedBuild(build)`：从 Saved Builds 重载。
- `handleGenerate(mode)`：核心请求链路函数：
  - 校验输入；
  - 组装 `mode/prompt/paletteHint/referenceImage`；
  - 调用 `POST /api/generate-voxel`；
  - 解析返回的 `voxels/bricks`；
  - 更新引擎与 UI 状态，并写入会话保存列表。
- `openExportModal()` / `openImportModal()`：JSON 导入导出弹窗控制。
- `handleJsonImport()`：把 JSON 文本解析为 voxel 并加载。
- `handleCopyJson()`：复制当前 JSON。
- `handleExportParts()`：导出零件清单文本。

## 4.3 Wu Enze (Team Leader): 3D Engine and Presets

### 文件：`src/services/3_VoxelEngine.ts`

#### 类：`VoxelEngine`
- `constructor(...)`：初始化 `three.js` 场景、相机、灯光、控制器、状态回调。
- `loadInitialModel(data, brickData?)`：加载模型并建立实例化网格。
- `rebuild(targetModel, brickData?)`：执行“由碎块到目标”的重建流程。
- `dismantle()`：执行拆解动画。
- `handleResize()`：窗口变化时更新相机与渲染器。
- `setAutoRotate(enabled)`：控制自动旋转。
- `focusModel(data, brickData?)`：模型居中与镜头重置。
- `getJsonData()`：导出当前模型 JSON。
- `getUniqueColors()`：返回当前模型颜色集合。
- `cleanup()`：销毁几何体、材质、事件和动画帧。
- `createBricks(...)`：将 brick 数据转换为渲染实例与物理状态。
- `fitCameraToBricks(...)` / `applyCameraFraming()`：镜头包围盒自适应。
- `draw()`：每帧绘制与实例矩阵更新。
- `getColorDist(...)`：颜色距离计算，用于重建匹配。
- `updatePhysics()`：处理拆解/重建中的速度、位置、目标吸附。
- `animate()`：主循环，驱动 physics + render。
- `getVoxelData()` / `getTotalCells()`：内部统计与导出辅助。
- `disposeInstancedMesh(...)`：实例网格释放。

### 文件：`src/lib/3_voxelConstants.ts`
- `COLORS`：颜色常量集合。
- `CONFIG`：引擎参数常量（尺寸、重力、动画速度、边界等）。

### 文件：`src/lib/3_voxelGenerators.ts`
- `setBlock(...)`：向体素映射写入单元。
- `generateSphere(...)`：生成球形/椭球体素区域。
- `Generators`：预设模型工厂对象（如 Fox/Tiger/Eagle），用于本地快速生成。

## 4.4 Liu Shuoyang: Local API Bridge

### 文件：`4_vite.config.impl.ts`
- `createNodeStyleResponse(res)`：把 Node `ServerResponse` 包装成类 Express 响应对象。
- `readJsonBody(req)`：读取并解析请求体 JSON。
- `localApiPlugin()`：Vite 中间件插件，把本地 `/api/generate-voxel` 转发到 TS 处理器。
- `runHandler(...)`（插件内）：按路由动态加载 API 模块并执行。
- `defineConfig(...)`：Vite 配置导出，含 React、Tailwind、本地 API 插件、别名、HMR 开关。

## 4.5 Xu Zichen: Generation API and Physical Algorithms

### 文件：`api/5_generate-voxel.impl.ts`

#### 入口与协议
- `config`：API bodyParser 配置（含图片上传大小上限）。
- `handler(req, res)`：API 主入口；处理 `OPTIONS/POST`、参数校验、模型调用、后处理与返回。
- `getCorsHeaders(req)` / `jsonResponse(...)`：跨域与统一响应封装。

#### Prompt 与模型调用
- `buildSystemPrompt(mode, prompt, paletteHint)`：按文本/图片模式构造约束化提示词。
- `getModelChain()`：读取模型链配置，支持多模型回退。
- `isRetryableModelError(error)`：识别可重试错误（429/5xx/timeout）。
- `getLocalPresetFromPrompt(value)`：本地预设短路逻辑。

#### 数据规范化与网格工具
- `toVoxelColor(color)`：颜色字符串转整数。
- `cellKey(...)` / `parseCellKey(...)`：体素键值编解码。
- `dedupeVoxels(...)`：同坐标去重。

#### 砖块构建与合并
- `canPlaceBrick(...)` / `markBrickCells(...)` / `generateBrickCells(...)`：砖块放置基础。
- `isDetailCell(...)` / `isCriticalDetailCell(...)` / `canUseBrickPattern(...)`：细节保护，避免大砖抹掉关键特征。
- `getOrientations(...)`：同规格旋转尝试策略。
- `voxelToBricks(...)` / `buildBricksFromColorMap(...)`：体素到砖块主转换。
- `buildBricksForTargetRange(...)`：按目标数量区间选择更合适构型。
- `enhanceVoxelResolution(...)` / `ensureSculpturalVolume(...)`：体素增强与体积补偿。
- `mergeCommonBricksTowardTarget(...)` / `tryMergeCommonBrickPair(...)`：可合并砖块融合，减少碎片化。
- `enforceConnectedBricks(...)`：强制提升连通性。
- `bricksToVoxels(...)`：砖块回转体素。

#### 物理与可制造性校验
- `validateBrickConnectivity(...)`：连通分量、孤立块校验。
- `validateManufacturability(...)`：网格对齐、重叠、连通、拼装可行性综合判断。
- `repairVoxelConnectivity(...)`：调用物理约束库做桥接修复。
- `compactVoxelsForTightContact(...)`：局部贴合压实尝试。
- `findConnectedComponentsFromVoxels(...)` / `closestPairByXZ(...)`：组件分析与最近对接点计算。

### 文件：`src/lib/5_physicalConstraints.ts`

#### 基础工具
- `cellKey(...)` / `parseCellKey(...)`：坐标键工具。
- `normalizeVoxels(...)`：体素归一化与去重。
- `sameLayerNeighborKeys(...)`：同层邻接键生成。

#### 悬空/悬挑控制
- `hasVerticalSupport(...)`：判断是否有垂直支撑。
- `hasSupportedNeighborWithinDistance(...)`：限定悬挑距离内是否能借支撑。
- `enforceVoxelSupport(...)`：为不满足条件体素补支撑柱。

#### 砖块连通分析
- `shareAnyCellXZ(...)`：跨层投影重合检测。
- `hasStudSupport(...)`：砖块是否被下层 stud 支撑。
- `isBrickOverextended(...)`：判断过度悬挑。
- `analyzeBrickConnectivity(...)`：输出连通分量、孤立砖、无支撑砖、过悬挑砖。

#### 连接修复与脚手架
- `createStudBridgeScaffoldBricks(...)`：为断裂组件生成桥接砖。
- `createInterlockedFoundationBricks(...)`：生成互锁地基层，改善底层整体性。
- `createSupportColumnScaffoldBricks(...)`：为问题砖补支撑柱。
- `repairDisconnectedBricksToVoxels(...)`：把断连修复落到 voxel 级输出。

#### 缝合质量评分
- `scoreSeamInterlock(...)`：单候选层间缝合交错评分。
- `scoreBrickSeamInterlock(...)`：全模型平均缝合评分。

### 文件：`src/lib/5_brickLayout.ts`

#### 体素/砖块互转主流程
- `voxelsToBricks(voxels)`：主转换入口（多规格砖 + 连通修复）。
- `normalizeBricks(value, fallbackVoxels)`：后端返回砖块归一化，异常时回退重建。
- `bricksToVoxels(bricks)`：砖块展开为体素。
- `stabilizeBrickSupports(...)`：按支撑需求重建砖布局。
- `enhanceVoxelResolution(...)`：提升体素密度，利于中大规格砖生成。

#### 内部关键函数
- `canPlaceBrick(...)` / `createCells(...)` / `markCells(...)`：放置与占用计算。
- `isDetailCell(...)` / `isCriticalDetailCell(...)` / `canUseBrickPattern(...)`：细节保护策略。
- `buildBricksFromVoxels(...)` / `buildBricksFromColorMap(...)`：转换核心。
- `mergeCommonBricksTowardTarget(...)` / `tryMergeCommonBrickPair(...)`：融合优化。
- `enforceConnectedBricks(...)` / `chooseBestBrickCandidate(...)`：候选结构选择与连通加强。

### 文件：`src/5_types.ts`
- 统一定义前后端共享数据结构：
  - `VoxelData`、`BrickData`、`BrickType`、`SavedModel`、
  - `SimulationBrick`、`RebuildTarget`、`LegoPart`、`BuildHistory` 等。

### 文件：`scripts/5_physical-constraints.test.ts`
- 物理约束测试脚本入口（通过 `scripts/physical-constraints.test.ts` 转发）。

## 4.6 Bai Yule: Integration and Deployment

### 代表文件与作用
- `src/components/1_Layout.tsx`：全局页面骨架（顶栏、主区容器）。
- `README.md`：运行说明、Vercel 部署要点、已移除数据库说明。
- `vercel.json`：Vercel 路由/函数部署配置。
- `package.json` / `tsconfig.json` / `index.html` / `.env.example`：工程配置与运行入口。

## 5. 任务流程（从输入到 3D 输出）

1. 用户在 `2_Generator.tsx` 输入文字或上传图片。  
2. 前端调用 `POST /api/generate-voxel`，提交 `mode/prompt/paletteHint/referenceImage`。  
3. `5_generate-voxel.impl.ts` 构建 Prompt，调用 Gemini 并要求 JSON 体素输出。  
4. 后端执行体素清洗、体素转多规格砖块、连通性与可制造性校验。  
5. 若存在断连或物理不可行，调用 `5_physicalConstraints.ts` 自动桥接/补撑后重算。  
6. 返回 `voxels + bricks + validation + repairStats`。  
7. 前端 `VoxelEngine` 载入模型并渲染，UI 同步零件清单与历史记录。  

## 6. 版本对比（首版 vs 现版）

### 首版（已知问题）
- 以 `1x1` 为主，砖型单一；
- 砖块总量偏少，结构表达粗糙；
- 缺少系统化物理校验，易出现断连/悬空；
- 缝合交错与可制造性约束不足。

### 现版（当前仓库）
- 支持多规格砖：`1x1/1x2/1x3/1x4/2x2/2x3/2x4/2x6/2x8`；
- 引入砖块合并、候选结构选择、连通增强；
- 增加断连修复、支撑补偿、地基互锁、缝合评分；
- 输出更接近真实可拼装的 LEGO 风格模型。
