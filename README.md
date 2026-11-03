# RIVALS (Web Edition)

A work-in-progress browser FPS prototype.

## Run

```sh
npm ci
npm start
```

Open the server on port 3000. HTTP and WebSocket traffic share the same server and port. Use `npm test` to run the automated tests.

## Play

The game opens in the lobby. Explore any map solo from the map gallery or enter the solo shooting range; click the scene to capture the mouse, then use WASD, mouse, Space, R, and number keys 1–4 to move, look, jump, reload, and switch weapons. Escape releases the mouse so you can use the on-screen controls.

For a duel, open the game in two browser tabs or on two devices connected to the same server, and select **Find a match** in both. During intermission, each participant may vote once. A round starts after the vote; use **Return to lobby** to leave. There are no bots yet and a server hosts one 1v1 match at a time.

## Prototype limitations

The map images and environments are simplified blockouts, not finished replicas. Static layout collision and shot obstruction share approximate geometry between client and server, but map-specific mechanics and some decorative/vertical elements are not implemented. Onyx lava contact damage and bounce are temporarily disabled rather than simulated only on one client. Advanced movement, other modes, progression and economy persistence, custom models, and several cosmetic/settings features are still incomplete. The lobby's coming-soon cards do not represent playable modes.

Reference sources and the map-specific limitations are documented in [MAP_REFERENCES.md](MAP_REFERENCES.md).
