# The Lowlands

A real-time strategy game drawn with canvas on a 2.5D isometric map. You can play
solo against 3 AI kingdoms or with friends over your LAN. The game itself is the
single file `index.html` and has no external dependencies.

**Multiplayer in one sentence:** one computer runs the game server, either the
double-click **host app** or the **Docker container** (e.g. on a Synology), and everyone
opens **`http://<server>:8080`** (host app) or **`http://<nas>:8090`** (Synology/Docker) in a
browser and clicks **Join LAN**.

Multiplayer needs that Node server: the lobby, the authoritative simulation and the websocket
all live there. Opening `index.html` as a file, or putting it in a static web folder (Synology
Web Station / the `web` share, GitHub Pages…), only gives you solo play. The menu says so when no
server answers.

## Solo play
Open `index.html` in any modern browser (double-click works), pick difficulty, fog and **map size**, then click **Solo Campaign**.

## Multiplayer: pick one way to run the server
1. **Host app (easiest).** Download it from Releases and double-click it on any Mac, Windows or
   Linux computer. See [Host a game: double-click](#host-a-game-double-click-no-node-install-needed).
2. **Docker, e.g. on a Synology NAS.** Always on, no computer needs to stay awake. See
   [Hosting on Synology](#hosting-on-synology-or-any-docker-host).

Then every player opens `http://<server-ip>:8080` for the host app (e.g. `http://192.168.1.20:8080`)
or `http://<nas-ip>:8090` for the Docker server on a Synology, clicks
**Join LAN**, takes a kingdom, and the host (the first player to connect) clicks **Start Game**.
Developers can also run `node server.js` (see [LAN multiplayer](#lan-multiplayer)).

## Host a game: double-click (no Node install needed)
Download the host app for your computer from the GitHub **Releases** page:

| Computer | File |
|---|---|
| Mac with Apple Silicon (M1–M4, e.g. MacBook Air) | `The-Lowlands-Host-mac-arm64.zip` |
| Mac with Intel | `The-Lowlands-Host-mac-x64.zip` |
| Windows 10/11 (64-bit) | `The-Lowlands-Host-windows.zip` |
| Linux x64 | `The-Lowlands-Host-linux.tar.gz` (or `.zip`) |

Unzip it and double-click:
- **macOS:** `Start The Lowlands Host.command`
- **Windows:** `The-Lowlands-Host.exe`
- **Linux:** `the-lowlands-host`, or run `./start.sh`

A console window opens with a big banner. It shows the addresses other players type in their
browser, e.g. `http://192.168.1.20:8080/`, one line per network address. Your own browser then
opens the game. Keep the window open while you play, and close it to stop the host.

The host uses port 8080. If 8080 is busy, for example because a second copy is running, it
picks the next free port and shows it. Other players need nothing installed, just a browser on
the same network. They open the address and click **Join LAN**.

**macOS Gatekeeper (unsigned app).** The app has only an ad-hoc signature, not an Apple
Developer ID, so macOS blocks it on first launch. Use one of these:
- Right-click (Control-click) `Start The Lowlands Host.command` → **Open** → **Open**.
- **macOS 15 Sequoia or newer:** double-click once and click *Done*. Then open **System
  Settings → Privacy & Security**, click **Open Anyway** and confirm.
- Or, in Terminal, then double-click normally:
  `xattr -dr com.apple.quarantine ~/Downloads/The-Lowlands-Host-mac-arm64`
  (use the unzipped folder's path).

Allow "incoming network connections" when macOS asks, so others can join. Unzip with Finder
(Archive Utility) or `ditto -x -k`; both keep the executable permissions stored in the zip.

**Windows:** SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.
When the firewall asks, allow **private networks**.

**Automatic updates.** The host app keeps itself up to date from the GitHub releases.
- **When it checks:** at every launch and every 4 hours, through GitHub's public API with no
  token. Startup never waits more than about 3 s. Offline or rate-limited checks are retried
  later.
- **The banner shows the status,** e.g. `Version 1.1.0 · up to date` or
  `update v1.2.0 ready — installs when no game is running`.
- **Installing:** when a newer version exists, the app downloads the zip for your computer
  (Mac arm64/x64, Windows, Linux). It checks the size against GitHub and the SHA-256 against the
  release's `SHA256SUMS` file. It also test-runs the new program (`--version`) before using it.
- **It never interrupts a game.** It installs only once no game has been running for 30 s.
- **Swap and restart:** it replaces its own program file, then restarts in the same window
  (Windows: a new console window), on the same port, and prints the banner again.
- **Windows:** a running `.exe` can't be overwritten, so it is renamed to `….exe.old`, the new
  one takes its place, and the next start deletes the `.old` file.
- **Open browser tabs** reconnect and reload themselves. A page in the middle of a game is only
  told to reload afterwards. The main menu shows the game and server versions, e.g.
  `v1.1.0 · server v1.1.0`, plus any pending update.
- **Turn it off** with the environment variable `LOWLANDS_NO_UPDATE=1`, or start the app with
  `--no-update`.
- **Folder must be writable.** If the app's folder isn't, e.g. it was run from a read-only disk
  image, the banner says so; download the new zip by hand.

The 1.0.0 apps have no updater, so they have to be replaced by hand once.

**Building the apps yourself:** `node host/build.js [mac-arm64] [mac-x64] [windows] [linux]`
writes everything to `dist/`, which is gitignored. It uses
[`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) through `npx`, and cross-builds every platform
from Linux. Put [`ldid`](https://github.com/ProcursusTeam/ldid/releases) on `PATH` so the macOS
binaries get the ad-hoc signature that Apple Silicon requires. On a Mac, pkg signs them with
`codesign` instead. The GitHub Actions workflow `.github/workflows/host-apps.yml` does this on
every `v*` tag or published release:
- builds on Linux;
- smoke-tests the binaries on Linux, macOS (arm64, plus x64 under Rosetta) and Windows runners;
- attaches the zips to the release.

You can also start it by hand: Actions → *Host apps* → *Run workflow*.

## LAN multiplayer
This section is for running from source with Node.js 18 or newer. Everyone else should use the host app or Docker.

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

1. Every player opens the LAN URL in a browser and clicks **Join LAN**.
2. Each player clicks **Take** on a kingdom (Avalon, Ravenmoor, Eldmark, Stonehold).
   **Change name** sets your display name.
3. The host (the first person to connect) picks the AI difficulty, fog of war and map size, then clicks **Start Game**.
   The AI plays any slot nobody took, using that kingdom's personality.
4. If a player disconnects during a game, the AI takes over their kingdom. When the game ends,
   or at any time from the menu (P / Esc), the host can send everyone back to the lobby.

If other PCs can't connect, allow the port (default 8080) through the host's firewall.

### Lag, freezes and dropped connections
Since v1.2.2 a slow or briefly stalled connection (weak Wi-Fi, a busy laptop) can no longer freeze one player's game:
- **Only fresh updates are sent.** Each page confirms every world update it receives. If one player's connection falls
  behind by more than 3 updates, the server skips updates for that player instead of queueing them, so their view is
  never more than about a fifth of a second old. Before, a queue could build up and that player's game slowly froze
  while everyone else's carried on.
- **Smaller updates:** world updates are compressed (permessage-deflate, about 4× smaller).
- **Updates don't wait for the screen:** a page applies updates as they arrive, not when it draws a frame (browsers can
  throttle frames, e.g. for a window on an external display). If several arrive at once, only the newest is applied.
- **Automatic reconnect:** if the connection drops, the page shows *Connection lost — reconnecting…*, reconnects by
  itself and gets the same kingdom back; the AI only rules it in between. A *Connection lagging* banner appears when
  no update has arrived for 1.5 s, and a connection that stays silent for about 20 s is closed and re-opened.
- **F3** shows the network status: ping, time since the last update, updates per second, server tick, updates
  skipped for a slow link, reconnects and client errors. The server also serves the same numbers at `/stats`.
- **Slow servers** (e.g. a Synology DS918) no longer fall into long catch-up bursts: the server simulates at most
  4 steps per tick and sends at most 15 updates per second. Unreachable path targets (walled-in or across water)
  no longer cost ~50 ms of pathfinding each.

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
non-root `node` user, listens on TCP 8080 inside the container), a `docker-compose.yml` and the
script `deploy-synology.sh`. Only one port is needed, and it carries the page and the game
websocket (`/ws`).

**On the NAS the server is published on port 8090, not 8080:** DSM's own nginx (Web Station)
already listens on 8080, so the container maps **host 8090 → container 8080**. Players open
**`http://<nas-ip>:8090/`**. (The host app on a Mac or PC still uses 8080.)

### Quick path — one script (old Docker package, Container Manager, any Linux with Docker)
1. **Turn on SSH** (Control Panel → Terminal & SNMP → *Enable SSH service*) and log in as an
   administrator: `ssh your-admin-user@192.168.1.20` (your NAS's IP).
2. **Clone and deploy**, e.g. in the `docker` shared folder:
   ```bash
   cd /volume1/docker
   git clone https://github.com/speedothebrief/the-lowlands.git && cd the-lowlands && sh deploy-synology.sh
   ```
   (No git on the NAS? Upload the repo with File Station and run `sh deploy-synology.sh` in that
   folder; it then skips the pull.)
3. **Update** later by running the script again:
   `cd /volume1/docker/the-lowlands && sh deploy-synology.sh`.

What the script does, from the repo folder:
- `git pull --ff-only`, unless you pass `--no-pull`. It stops with a clear message if the pull
  can't fast-forward, e.g. because files were edited on the NAS.
- Finds `docker` (Synology keeps it in `/usr/local/bin`) and runs it with `sudo` unless you are
  root, so it asks for your password.
- Builds `the-lowlands:latest` (plus a version tag such as `the-lowlands:1.2.1`).
- Stops and removes the old `the-lowlands` container (and a leftover `the-lowlands1`), then runs
  `docker run -d --name the-lowlands --restart unless-stopped -p 8090:8080 the-lowlands:latest`.
- Waits up to 30 s for the server to answer, prints the `http://<ip>:8090/` addresses to share,
  and removes dangling old images (`--no-prune` keeps them).

Another port: `sh deploy-synology.sh 8091` or `PORT=8091 sh deploy-synology.sh`. If the port is
already taken by something else, the script says so before building.

**Can't connect?**
- **Mac:** System Settings → Privacy & Security → **Local Network** → turn it on for your browser
  (Safari, Chrome, Firefox…), then reload. Without it, macOS silently blocks pages on your LAN.
- **DSM firewall:** if it is on (Control Panel → Security → Firewall → Edit Rules), add *Allow*
  for **TCP 8090**, source = your LAN subnet (e.g. 192.168.1.0/24).

Anywhere with Docker and compose instead:

```bash
docker compose up -d --build     # then open http://<host-ip>:8090/  (PORT=xxxx to change)
```

> **Synology's static web hosting cannot run multiplayer.** Putting `index.html` in the `web`
> share or in Web Station only serves the page, so solo play works and **Join LAN** reports that
> no game server answers. Multiplayer needs the Node server, i.e. this Docker container (or the
> Node.js package, see Option C).

### Option A — by hand in the old **Docker** package (DSM 6.x / 7.0–7.1)
The script above does all of this for you; these are the manual steps.
This package has no *Project* tab, only **Overview, Registry, Image, Container, Network, Log**.
So build the image over SSH, then launch it from the **Image** tab.

1. **Turn on SSH**: Control Panel → Terminal & SNMP → *Enable SSH service* (port 22). You can
   turn it off again when you're done.
2. **Put the files on the NAS:**
   `git clone https://github.com/speedothebrief/the-lowlands.git /volume1/docker/the-lowlands`.
   Without git: in File Station open the `docker` shared folder, make a folder `the-lowlands`,
   and upload the repo (GitHub *Code → Download ZIP*, unzipped). You need at least
   `Dockerfile`, `package.json`, `package-lock.json`, `index.html`, `server.js`, `room.js` and
   `host/updater.js`, e.g. `/volume1/docker/the-lowlands/Dockerfile`.
3. **Build the image** over SSH (Terminal on macOS/Linux, PowerShell or PuTTY on Windows):
   ```bash
   ssh your-admin-user@192.168.1.20          # your NAS's IP
   cd /volume1/docker/the-lowlands
   sudo docker build -t the-lowlands .        # enter your password again; takes a minute or two
   ```
   The NAS needs internet access to pull `node:20-alpine`, which is available for x86-64 and
   ARM (arm64/armv7) models.
4. **Launch it from the Docker app.**
   - **Image** tab → select `the-lowlands:latest` → **Launch**.
   - Container name: `the-lowlands`.
   - **Advanced Settings**:
     - Tick **Enable auto-restart**.
     - **Port Settings**: set *Local Port* `8090` → *Container Port* `8080`, type TCP. Replace
       "Auto" with 8090, or the NAS picks a random port. Don't use 8080 as the local port: DSM's
       nginx already has it.
     - Optional, under *Environment*: add `LOWLANDS_NO_UPDATE` = `1` to skip the update check.
   - Apply → Next → **Done** (leave "Run this container after the wizard is finished" ticked).
   - On DSM 7.0/7.1 the same options are spread over the wizard pages: General Settings
     (auto-restart), Port Settings, Environment.

   Same thing from SSH instead of the wizard:
   ```bash
   sudo docker run -d --name the-lowlands --restart unless-stopped -p 8090:8080 the-lowlands
   ```
5. **Firewall:** if the DSM firewall is on (Control Panel → Security → Firewall → Edit Rules),
   add *Allow* for **TCP 8090**, source = your LAN subnet (e.g. 192.168.1.0/24).
6. **Play:** everyone opens **`http://<nas-ip>:8090/`** and clicks **Join LAN**.
   The log (Container → the-lowlands → Details → Log) says the server listens on 8080 at the
   container's internal 172.x IP. Ignore that and use the NAS's own LAN IP with port 8090.

**Updating (old Docker package):** rerun `sh deploy-synology.sh`. By hand: `git pull` in the
folder (or upload the new files), then over SSH:
```bash
cd /volume1/docker/the-lowlands && sudo docker build -t the-lowlands .
sudo docker rm -f the-lowlands
sudo docker run -d --name the-lowlands --restart unless-stopped -p 8090:8080 the-lowlands
```
Alternatively, after the build, stop and delete the container in the Container tab, then
Image → Launch again.

### Option B — **Container Manager** (DSM 7.2+)
1. Copy the repo folder to `/volume1/docker/the-lowlands` (as in step 2 above).
2. **Container Manager → Project → Create**. Name it `the-lowlands`, set the path to that folder,
   and choose *Use existing docker-compose.yml*. Finish the wizard. It builds the image, starts
   the container on port 8090 and restarts it after reboots.
3. Firewall and playing are as in steps 5–6 above.

To update, replace the files, then **Project → the-lowlands → Action → Build** (or
`sudo docker compose up -d --build` in the folder).

### Option C — no Docker (Node.js package)
Install **Node.js v20** from the Package Center, then over SSH:
```bash
cd /volume1/docker/the-lowlands && npm ci --omit=dev && PORT=8090 node server.js
```
Use `PORT=8090`: DSM's nginx already has 8080.
To keep it running after boot, add a *Triggered Task* (Control Panel → Task Scheduler →
Boot-up, user that owns the folder) with the command
`cd /volume1/docker/the-lowlands && PORT=8090 /usr/local/bin/node server.js`.

### Update notice
The server never replaces itself in Docker. It checks GitHub at startup and every 4 hours,
logs `Update available: v…`, and shows "Server update v… available — rebuild/pull the server" in
the browsers' main menu. Set `LOWLANDS_NO_UPDATE=1` to turn the check off. After a rebuild, open
browser tabs reconnect, notice the new version and reload.

### Optional: a name like wardenfam.com (reverse proxy)
You don't need a reverse proxy on the LAN: `http://<nas-ip>:8090/` works directly. To use a
domain with HTTPS:
- **Where:** DSM 7: Control Panel → Login Portal → Advanced → **Reverse Proxy**. DSM 6:
  Control Panel → Application Portal → Reverse Proxy. Click **Create**.
- **Source:** HTTPS, hostname `lowlands.wardenfam.com` (or `wardenfam.com`), port 443.
- **Destination:** HTTP, `localhost`, port 8090 (the container's host port).
- **WebSocket headers:** Custom Header → Create → **WebSocket**. Without them the page loads
  but Join LAN never connects.
- **Certificate:** Control Panel → Security → Certificate (Let's Encrypt) for that hostname.

Players then open `https://lowlands.wardenfam.com/`; the page switches to `wss://` by itself.
Reaching it from outside your home also needs the router to forward TCP 443 to the NAS.

**Note:** the game has no passwords. Anyone who can reach the address can join a lobby, so
only expose it publicly if you're fine with that.

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
- **Builders start working at what they built.** When a Farm is finished, its builders farm it
  (2 slots; the new farm is reserved for its builders). When a Lumber Camp, Quarry or Gold Mine is
  finished, its builders gather the nearest wood, stone or gold around it, each on a free claim slot.
  This applies to human and AI builders.
- **No stuck peasants.** Peasants walk to a reachable tile next to their target instead of a blocked
  edge point. They skip a drop site or node they couldn't reach, and they get path priority after
  waiting. When two of them meet head-on in a corridor, they slide past each other. A watchdog
  handles anything left over: a peasant that sits at its job without progress for about 6 s
  releases its claim and picks the nearest free node of the same type, or goes idle so it can be
  reassigned. AI repair crews that can't pay are released, and AI sites nobody can reach are cancelled.
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
- **Placement (no territory limit).** You can place a building anywhere on explored, valid
  ground (land, in bounds) that isn't occupied by another building, resource node, or enemy unit.
  There is no "near your buildings" or "away from enemies" radius, so you expand by
  sending peasants to walk there and build. The placement ghost turns red and shows the reason.
- **Keep / Fortress arrows.** The Keep fires 4 arrows every 0.8 s (range 7). The Fortress fires
  8 arrows every 0.8 s, twice the Keep, out to 11.5 tiles, which is catapult range (8.5) + 3,
  so it outranges siege. Each arrow does 10 damage. Volleys spread over nearby enemies, and a
  lone target still takes the full volley.
- **Garrisons.** Keep 40, Fortress 30, Tower 6. Peasants, spearmen and archers can garrison; knights and catapults cannot.
  Right-click your Keep/Fortress/Tower with them, or press **G** to use the nearest one with room.
  Units inside are invulnerable and hidden from the map, and **every garrisoned unit shoots**:
  each peasant or spearman adds 1 arrow per volley (3 damage), and each archer adds 2 arrows
  (7 damage each, the archer's attack). Example: a full Keep with 14 archers and 26 peasants
  fires 4 + 28 + 26 = 58 arrows per volley. Towers work the same way on top of their 1 arrow
  per 1.4 s. To keep big volleys cheap, at most 16 arrow objects fly per volley (and only 4 once
  700 projectiles are in the air); extra arrows are merged into one already flying at the same
  target. Total damage stays the same, and the bow and hit sounds are rate-limited.
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
node test/rules-test.js      # gather claim slots, Keep/Fortress fire rates + range, garrison arrows + merging, peasant construction/repair/refunds, free placement,
                             # builder auto-start, stuck watchdog + no-stuck soak, garrisons + Town Bell (+ AI bell), doubled resource nodes, map sizes
node test/sim-test.js [ai] [small|medium|large] [minutes]   # headless soak: AI economy, building, waves, surrender, tick cost
node test/net-soak-test.js   # 3-player server soak, 2 min (SOAK_SEC=120 SPEED=5 LINK_KBS=40): server at 5× load ≈ a Celeron J3455,
                             # tick budget, 15 updates/s, compressed size, slow + stalling link stays current, reconnect + resync,
                             # half-open socket dropped, memory
npm i --no-save puppeteer-core            # once, for the two browser tests (needs a local Chrome/Chromium)
CHROME=/usr/bin/google-chrome node test/audio-test.js   # headless Chrome: audio gating, BattleTimer unit test, SFX, sliders, LAN battle music
CHROME=/usr/bin/google-chrome node test/ui-test.js      # headless Chrome: build hotkeys, context keys, garrison/bell/repair UI,
                                                        # map-size menu, LAN lobby map size, LAN building + bell, zoomed-out redraw,
                                                        # busy-page catch-up, F3 overlay, lag banner, reconnect
node test/updater-test.js            # self-updater against a local fake GitHub release server (builds an old + a new app):
                                     # offline/hanging/rate-limited checks, LOWLANDS_NO_UPDATE, size + SHA-256, no restart mid-game,
                                     # swap + restart on the same port, browser tab reload, start.sh restart loop
node test/host-app-test.js [binary]   # packaged host app (after node host/build.js): banner + LAN URLs, browser launch,
                                     # HTTP, /ws, port-in-use fallback
```

## Source layout
`index.html` is built from the files in `src/`. Run `sh src/build.sh` to rebuild it.
`p1–p3, p8` contain the shared simulation: rules, map gen, A*, combat, construction, garrison, AI, commands and snapshots.
`room.js` (repo root, server only) holds the lobby and authoritative game loop used by `server.js`.
`p0client, p4–p7` contain rendering, UI, input and networking. `p9audio.js` is the WebAudio engine.
`host/launcher.js` is the entry point of the double-click host apps (banner, browser launch, keeps the window open); `host/updater.js` checks GitHub releases and performs the self-update; `host/build.js` packages the apps into `dist/` (plus `SHA256SUMS`).
