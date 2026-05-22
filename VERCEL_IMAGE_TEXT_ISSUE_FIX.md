# Vercel 上图片+文字建模失败原因与修复说明

## 问题现象

- 在 AI Studio 中，图片和文字输入都可以生成 3D voxel 模型。
- 在 Vercel 部署后，图片/文字建模请求失败或无结果。

## 根因分析

1. 原实现是前端直接调用 Gemini（浏览器端 `GoogleGenAI`）。
2. AI Studio 运行环境对密钥注入和调用路径更友好，因此可用。
3. Vercel 场景下，建议走服务端 API 托管密钥；前端直连模型容易受环境变量注入方式、密钥限制和浏览器端调用差异影响。

## 已完成修复（基于 Ocean-work-main）

1. 新增服务端接口：
- `api/generate-voxel.ts`
- 由 Vercel Serverless Function 使用 `GEMINI_API_KEY` 调用 Gemini。
- 支持三种模式：`create`、`morph`、`image`。
- 支持图片 `base64 + mimeType` 与文本提示联合生成。

2. 前端改造：
- 文件：`src/pages/Generator.tsx`
- 主流程改为优先请求 `POST /api/generate-voxel`。
- 服务端返回统一 `voxels` 数组，前端直接渲染。
- 前端统一走 `/api/generate-voxel`，密钥只保存在服务端环境变量里。

3. 配置与文档更新：
- `.env.example` 增加 Vercel 环境变量说明。
- `README.md` 增加 Vercel 注意事项与新接口说明。

## Vercel 部署要求

在 Vercel 项目设置中添加环境变量：

- `GEMINI_API_KEY=<your_key>`

然后重新部署。

## 预期结果

- Vercel 上文本建模可用。
- Vercel 上图片+文字输入建模可用。
- AI Studio 运行方式保持兼容。
