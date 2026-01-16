# Railway Deployment Guide 🚀

To deploy your Rock-Paper-Scissors game to Railway, follow these steps:

## 1. Prerequisites
- A [Railway account](https://railway.app/) connected to your GitHub.
- Your project pushed to a GitHub repository.

## 2. Environment Variables
Add the following variables in the Railway "Variables" tab:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `CLERK_SECRET_KEY` | Your Clerk Secret Key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your Clerk Publishable Key |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase Service Role Key |
| `CLERK_JWT_KEY` | (Recommended) For secure token verification |
| `PRODUCTION_URL` | The URL Railway gives you (e.g., `https://your-app.up.railway.app`) |

## 3. Configuration Steps

### Step 3.1: Clerk Configuration
- Go to your Clerk Dashboard.
- Navigate to **Pathways** (or Settings) and update the **Authorized Origins** and **Redirect URLs** to include your Railway `https://...` domain.
- If using a custom domain on Railway, ensure it's added to Clerk.

### Step 3.2: Railway Settings
- Railway will automatically detect you are using a Node.js project.
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Start Command:** `node server.js`
- **Ports:** Railway automatically picks up `process.env.PORT`.

## 4. Verification
- Once the deployment is "Green", open your Railway URL.
- Try signing in.
- Test the game with two tabs or two devices to ensure Socket.io is communicating correctly via the dynamic Railway port.

## 5. Troubleshooting
- **WebSocket Errors:** Ensure `PRODUCTION_URL` is set correctly in variables.
- **Authentication Issues:** Double-check that your Clerk secret keys match your local `.env`.
- **Database Connection:** Verify that Supabase keys have sufficient permissions (Service Role Key is used for server actions).
