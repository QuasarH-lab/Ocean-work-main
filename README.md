<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/dbd4bafa-383b-44df-a6d1-5a0f5e912a5f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Vercel note (important)

If text/image modeling works in AI Studio but fails on Vercel, the common cause is that browser-side model calls do not have a safe/runtime server key path in Vercel deployment.

This project now provides a server endpoint:

- `POST /api/generate-voxel`

The frontend calls this endpoint first, and the endpoint uses `GEMINI_API_KEY` on the server.  
Set `GEMINI_API_KEY` in Vercel Project Settings -> Environment Variables.
