# Map reference and implementation notes

The map layouts in `src/MapLayouts.js` are hand-authored **blockouts**, not official map files or exact reproductions. They use simple procedural geometry. The matching `assets/maps/*.jpg` are renders of those blockouts, not images copied from the wiki or videos.

## References studied

- [Roblox Rivals Wiki: Maps](https://robloxrivals.fandom.com/wiki/Maps), including individual map descriptions and galleries. The individual pages describe, for example, Arena's grid and cover; Backrooms' dim maze; Battleground's central bridge and ramps; Bridge's yellow bus and barriers; Chess's board and pieces; Sandbox's sandcastle, buckets and shovels; Onyx's lava and cylindrical stones; and Docks' waterfront buildings and crates. These informed the names, palettes, landmarks and broad layouts, not exact dimensions.
- [Jiibiiblox: The BEST Beginner GUIDE in Roblox RIVALS](https://youtu.be/1qAjSzySzAs) — accessible transcript describes fast movement, ramps, vertical approaches, and the shooting range.
- [MiloBlox: I Created ARENA 2 in Roblox Rivals!](https://youtu.be/XJPaZT392kg) — accessible transcript describes a community-made, Minecraft-themed Arena concept with mirrored cover, ramps, a central landmark and portals. It is not an official Arena variant and was used as design inspiration, not as a claim about the official map.
- Image-search reference results included an aerial Docks image, an Arena physical model, and Backrooms and Battleground screenshots. No downloaded reference images were included in the project.

Video transcripts and image-search stills were accessible in the development environment; the actual videos could not be watched there. Reference imagery is incomplete and layouts should be compared against more in-game views before calling them faithful.

## Current limitations

All 27 entries in the current pool have distinct blockouts, but scale, placement, detailing, lighting, textures, interiors and vertical routes are approximations. Basic box-shaped movement collision and shot obstruction share one layout between client and server. Cylindrical props use box approximations for server collision, and decorative elements are visual only. Ramps use small steps rather than full slope physics. Hazards, portals, bridge buttons, breakable windows, ziplines, tire boosts, scanner and other map-specific gameplay are **not implemented** in these blockouts; water/lava, portals and several upper platforms are visual. Existing special-mode and progression work is still separate. Big variants have added geometry but do not yet implement their full official layouts or bigger team sizes.
