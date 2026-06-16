# BCC Student Portal

A React + Node.js app for browsing enrollment records and grades from the Buenavista Community College portal.

## Deploy on Render (Free)

1. Push this folder to a **GitHub repository**
2. Go to [render.com](https://render.com) and click **New > Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — confirm these settings:
   - **Build Command:** `npm run install-all && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Click **Deploy**

Your app will be live at `https://your-app-name.onrender.com`

## Local Development

```bash
# Install dependencies
npm run install-all

# Run both server and client (two terminals)
npm run dev-server   # terminal 1 — Express on :5000
npm run dev-client   # terminal 2 — React on :3000
```

## How It Works

- User enters their student ID (e.g. `2526-1168`)
- Server scrapes `portal.buenavistacommunitycollege.edu.ph/students/enroll/student/{id}/`
- Extracts enrollment records and enrollment IDs from `viewGradesStudent` links
- When "View Grades" is tapped, scrapes `viewGradesStudent/{enrollmentId}/`
- Parses grade tables and returns structured data

## Notes

- The portal does not require authentication for these public-facing pages
- Grade detail availability depends on what the portal exposes without a login session
- The server acts as a proxy to avoid CORS issues in the browser
