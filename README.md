# Distance Ke Beech 💗

A mobile-friendly Truth or Dare game for couples in a long-distance relationship, with live two-player rooms joined by a six-character code.

## Play online

https://kaivalyajoshi20.github.io/distance-ke-beech/

## Multiplayer architecture

- `index.html` is the GitHub Pages frontend.
- `server.js` is the WebSocket room server; `package.json` installs its `ws` dependency.
- The live room server is hosted at `https://distance-ke-beech-live.onrender.com` and the frontend connects to it over secure WebSockets.
- Room state is temporary in server memory. Rooms expire after inactivity and can reset if the server restarts. Do not use room codes as a security boundary for highly sensitive information.

## Deploy

The frontend deploys through `.github/workflows/pages.yml`; pushes to `main` trigger deployment. In repository Settings → Pages, select **GitHub Actions** as the source. The WebSocket server is deployed separately from this same repository on Render with `npm install` / `npm start`.

## Run locally

Open `index.html` in a modern browser. No build step is required.
