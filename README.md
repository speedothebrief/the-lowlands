# The Lowlands

A real-time strategy game drawn with canvas on a 2.5D isometric map. You can play
solo against 3 AI kingdoms or with friends over your LAN. The game itself is the
single file `index.html` and has no external dependencies.

## Solo play
Open `index.html` in any modern browser (double-click works), pick difficulty, fog and **map size**, then click **Solo Campaign**.

## LAN multiplayer
Requires Node.js 18 or newer.

```bash
cd the-lowlands
npm install        # installs the only dependency: ws
node server.js     # or: npm start      (set PORT=xxxx to change the default 8080)
```

The server listens on `0.0.0.0` and prints the URLs, for example:

```
The Lowlands LAN server running.
  Local:  http://localhost:8080/
  LAN:    http://192.168.1.23:8080/   <- share this with other players
```

1. Every player opens the LAN URL in a browser and clicks **LAN Lobby**.
2. Each player clicks **Take** on a kingdom (Avalon, Ravenmoor, Eldmark, Stonehold).
   **Change name** sets your display name.
3. The host (the first person to connect) picks the AI difficulty, fog of war and map size, then clicks **Start Game**.
   The AI plays any slot nobody took, using that kingdom's personality.
4. If a player disconnects during a game, the AI takes over their kingdom. When the game ends,
   or at any time from the menu (P / Esc), the host can send everyone back to the lobby.

If other PCs can't connect, allow the port (default 8080) through the host's firewall.

### How sync works
The server is authoritative. `server.js` pulls the simulation code out of `index.html`
(the part between `/*SIM-BEGIN*/` and `/*SIM-END*/`) and runs it in a Node `vm` sandbox.
That is the same code the browser runs in solo mode. Clients send only commands
(move, attack, gather, build, train, rally, stop…). The server checks that the sender owns
the units, runs the simulation at 30 ticks/s, and sends compact world snapshots at 15 Hz.
Clients smooth unit movement between snapshots. Every client sees exactly the same world,
so it cannot drift out of sync.

### Win condition (per player)
You win once every other kingdom, human or AI, has surrendered or been destroyed.
You lose when your Keep falls. You can also surrender from the in-game menu.
After a defeat you can keep watching the game without fog.
AI kingdoms surrender when their Keep is destroyed, or when their army and economy
are crushed compared to whoever attacked them. The winner of a surrender takes half of the
loser's stockpile as tribute.

## Hosting on Synology (or any Docker host)
The repo ships with a `Dockerfile` (node:20-alpine, production dependencies only, runs as the
non-root `node` user, exposes 8080) and a `docker-compose.yml` (`8080:8080`, `restart: unless-stopped`).
Anywhere with Docker:

```bash
docker compose up -d --build     # then open http://<host-ip>:8080/
```

**Option A — Container Manager (DSM 7.2+)**
1. Copy the `the-lowlands` folder to the NAS, e.g. `/volume1/docker/the-lowlands`
   (File Station, or `git clone` over SSH).
2. Open **Container Manager → Project → Create**. Name it `the-lowlands`, set the path to that folder,
   and choose *Use existing docker-compose.yml*.
3. Finish the wizard. It builds the image and starts the container; it restarts automatically after reboots.
4. Players open **`http://<synology-ip>:8080/`** in a browser and click **LAN Lobby**.
   The server log (Container Manager → Container → the-lowlands → Log) prints the container's internal
   IP. Ignore that and use the NAS's own LAN IP.

**Option B — no Docker (Node.js package)**
Install **Node.js v20** from the Package Center, then over SSH:
```bash
cd /volume1/docker/the-lowlands && npm ci --omit=dev && node server.js
```
To keep it running after boot, add a *Triggered Task* (Control Panel → Task Scheduler →
Boot-up, user that owns the folder) with the command
`cd /volume1/docker/the-lowlands && /usr/local/bin/node server.js`.

**Firewall:** if the DSM firewall is on (Control Panel → Security → Firewall), add an allow rule for
TCP port 8080 from your LAN subnet. To use another port, change the left side of the mapping,
e.g. `"9090:8080"`, and browse to `:9090`.

**No reverse proxy needed:** the page and the WebSocket (`/ws`) share the same HTTP port, so plain
`http://<synology-ip>:8080/` works directly on the LAN. If you do put it behind the DSM reverse proxy,
enable the WebSocket headers (Custom Header → Create → WebSocket) for that rule.

## Map sizes
| Size | Tiles | Notes |
|---|---|---|
| Small (default) | 96 × 96 | the original map |
| Medium | 144 × 144 (1.5× each side) | |
| Large | 192 × 192 (2× each side) | |

Lakes, forests and the rock and gold fields in the middle scale with the map's area. On Medium and Large,
every kingdom also gets a second expansion (forest, stone, gold) a little further out. Starting
corners, the minimap, camera bounds and AI search radii all scale with the map.
Pathfinding uses weighted A* with a per-tick expansion budget, so Large stays well inside the
30 Hz tick budget: in the soak test an average tick costs a few ms.

## Economy and building rules
- **Resource nodes hold twice as much** as before, so games run slower and longer:
  a tree holds 160 wood, a rock 720 stone and a gold vein 640 gold. Farms never run out.
- **One gatherer per node.** Every tree, rock or gold tile has a claim slot; farms keep 2 slots.
  A peasant sent to an occupied node, or arriving at one, switches to the nearest free node
  of the same type instead of shoving. Claims are released on death, on a new order, and when the node runs out.
- **Peasants build everything.** Placing a building pays its cost and creates a construction site.
  The selected peasants walk over and build it; with none selected, the nearest idle peasant goes.
  Work only progresses while a builder is on site; one builder takes the listed build time.
  More builders work faster with diminishing returns (rate ∝ builders^0.65: 2 builders → 1.57×,
  4 builders → 2.46×). A builder who finishes moves on to a nearby unfinished site (wall lines),
  otherwise back to their previous job. Right-click a site with peasants to help.
  **Del**, or the *Cancel construction* button, removes a site with a full refund.
  A site destroyed before it is finished refunds 50%.
- **Repair.** Right-click a damaged building of yours with peasants selected. Or select the building
  and press **N** (or click *Repair*): up to 3 of the nearest idle peasants go to work.
  Repair costs wood/stone in proportion to the HP restored; a full 0→100% repair costs 50% of the
  building's build cost (Keep: 100 wood + 150 stone). Repair pauses if you can't pay.
  Repair has its own hammer sound, a green *✚ repairing ⚒ n* badge and green sparks.
- **Territory.** You can only place a building near one of your *completed* buildings
  (Keep/Fortress radius 13, other buildings 8, +3 for walls). Towers, walls and gates do not
  extend territory, so you can't chain towers into an enemy camp. Nothing can be placed within
  ~7 tiles of an enemy building. The placement ghost turns red and shows the reason.
- **Keep / Fortress arrows.** The Keep fires 2 arrows every 0.8 s (4× its old rate).
  The Fortress fires 4 arrows every 0.8 s, which is 2× the Keep and 8× the Keep's old rate.
  Volleys spread over nearby enemies, and a lone target still takes the full volley.
- **Garrisons.** Keep 40, Fortress 30, Tower 6. Peasants, spearmen and archers can garrison; knights and catapults cannot.
  Right-click your Keep/Fortress/Tower with them, or press **G** to use the nearest one with room.
  Units inside are invulnerable and hidden from the map, and each garrisoned archer adds one arrow per volley.
  Peasants carrying resources drop them off as they enter a Keep or Fortress. **U** or *Unload* releases everyone
  toward the rally point; peasants go back to their previous work. If the building is
  destroyed, the occupants spill out alive.
- **Town Bell.** Press **B** with your Keep selected, **Shift+B** anywhere, or the 🔔 button.
  It tolls the bell and calls the nearest peasants first, then infantry, into the nearest Keep/Fortress/Tower
  with room. Ring it again (or Unload) for the all-clear: everyone comes out and peasants resume gathering.
  The AI rings its own bell when a raiding force reaches its Keep and lets its peasants out
  about 8 s after the raiders leave.
- The AI also sends peasants to build every site (walls 1 builder, larger buildings 2–3) and to repair damaged buildings.

## Controls
| Action | Input |
|---|---|
| Pan camera | WASD / arrow keys, mouse at the screen edge, right-drag or middle-drag, click/drag the minimap |
| Zoom | Mouse wheel, `+` / `-` |
| Select | Left-click; drag a box (military is picked over peasants); Shift adds; double-click selects that unit type on screen |
| Move / attack / gather | Right-click ground / enemy / tree, rock, gold or farm (right-click the minimap also moves) |
| Attack-move | `X`, then left-click |
| Stop | `C` |
| Build menu | `B`, then a letter: `H` House · `F` Farm · `L` Lumber Camp · `Q` Quarry · `G` Gold Mine · `M` Market · `B` Barracks · `S` Stable · `W` Siege Workshop · `A` Wall · `E` Gate · `T` Tower · `O` Fortress. You can also click a BUILD button (each shows its letter and has a tooltip) |
| Place | Left-click the map (walls: click-drag a line). Shift+click, or choosing with Shift+letter (e.g. `B`, `Shift+H`), keeps placing several. Right-click / Esc cancels. Selected peasants build it |
| Cancel site | Select a construction site → `Del` / *Cancel construction* (full refund) |
| Repair | Right-click a damaged building with peasants, or select it and press `N` |
| Garrison | Right-click your Keep/Fortress/Tower with peasants/infantry, or `G` (nearest with room). `U` unloads the selected building |
| Town Bell | `B` with the Keep selected, `Shift+B` anywhere, or the 🔔 button; press again for the all-clear |
| Train | Select a building, then click its unit buttons or press `Q` `E` `R` `T` (only while the build menu is closed; with it open, the same letters pick buildings). Click queue items to cancel (full refund) |
| Rally point | Select a production building, then right-click the map, a resource, or a farm |
| Control groups | Ctrl/Shift + 1–9 saves a group, 1–9 recalls it (press twice to center on it) |
| Sound | `M` mute (not while the build menu is open, where M means Market). The **Sound** button in the top bar, the pause menu and the main menu have Master / Music / SFX sliders |
| Misc | `.` next idle peasant, Space jumps to the last alert or your Keep, `H` help, `P`/Esc pause (solo) or menu (LAN), `F` fog toggle (solo) |

Function keys are never used, because browsers already use F1/F5/F11/F12.

## Audio
All audio is synthesized with WebAudio at runtime; there are no sound files. Audio starts on your
first click or key press (browser autoplay policy). Volumes and mute are saved in `localStorage`.
- **Sound effects** cover every action and result: UI clicks, selection, orders, placement,
  hammering, construction finished, training, chopping, mining, drop-off, melee, arrows, catapult launch and impact,
  building hits and collapse, deaths, gates, garrison doors, the Town Bell, errors, alerts,
  war horns, surrender, tribute, victory and defeat. Each kind is throttled and pooled
  (minimum gap, max voices per kind, 28 voices total, crowd ducking), so big battles don't turn into noise.
  World sounds are attenuated and panned relative to the camera.
- **Music** is a slow generative ambient synth piece: detuned pads through a breathing filter,
  soft delayed arpeggios, a gentle sub bass, bell glints and airy noise, over an evolving chord loop. It never ends.
- **Battle layers.** When an enemy damages one of *your* units or buildings, a pulsing bass,
  ticking hats, low drums, dissonant stabs and a tritone drone crossfade in over the music.
  After 10 s with no new attack they fade out again. In LAN games this only follows your own kingdom.

## Tests
```bash
npm test                     # two simulated WebSocket clients: lobby, start, command sync, ownership checks, disconnect → AI
node test/rules-test.js      # gather claim slots, Keep/Fortress fire rates, peasant construction/repair/refunds, territory,
                             # garrisons + Town Bell (+ AI bell), doubled resource nodes, map sizes
node test/sim-test.js [ai] [small|medium|large] [minutes]   # headless soak: AI economy, building, waves, surrender, tick cost
npm i --no-save puppeteer-core            # once, for the two browser tests (needs a local Chrome/Chromium)
CHROME=/usr/bin/google-chrome node test/audio-test.js   # headless Chrome: audio gating, BattleTimer unit test, SFX, sliders, LAN battle music
CHROME=/usr/bin/google-chrome node test/ui-test.js      # headless Chrome: build hotkeys, context keys, garrison/bell/repair UI,
                                                        # map-size menu, LAN lobby map size, LAN building + bell
```

## Source layout
`index.html` is built from the files in `src/`. Run `sh src/build.sh` to rebuild it.
`p1–p3, p8` contain the shared simulation: rules, map gen, A*, combat, construction, garrison, AI, commands and snapshots.
`p0client, p4–p7` contain rendering, UI, input and networking. `p9audio.js` is the WebAudio engine.
