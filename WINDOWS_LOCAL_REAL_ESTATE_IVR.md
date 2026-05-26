# ShadowPBX on Windows 11 for Local Real Estate IVR

This guide is for your exact goal:

- Windows 11
- Docker Desktop
- VS Code
- Node.js
- MongoDB inside Docker
- Local internal IVR testing only
- No VPS
- No Twilio
- No AI voice bot
- DTMF button IVR only

It is beginner-first and repo-specific.

## 1. First reality check

ShadowPBX itself is a Node.js app, but its telephony pieces are Linux-style:

- `drachtio` handles SIP signaling
- `rtpengine` handles RTP media and DTMF events
- the original repo installer targets Ubuntu or Debian

That means:

- Native "pure Windows only" telephony is not what this repo was built for
- The free local path that makes sense on Windows is `Docker Desktop + WSL2 backend + Linux containers`
- You do not need a VPS for internal testing
- You do not need Twilio for internal extension and IVR testing

For this local stack, the services run in Docker containers and you control them from Windows Terminal and VS Code.

## 2. ShadowPBX architecture in simple words

### Drachtio

Think of `drachtio` as the SIP traffic controller.

- Softphone sends `REGISTER`
- `drachtio` gives that SIP message to the Node.js app
- Node.js decides whether the extension/password is correct
- Softphone sends `INVITE`
- `drachtio` gives that INVITE to the Node.js app
- Node.js decides where the call should go

`drachtio` does signaling, not the actual voice audio.

### RTPEngine

Think of `rtpengine` as the media bridge.

- It handles RTP audio packets
- It relays audio between phones
- It lets ShadowPBX play IVR audio
- It forwards DTMF events to ShadowPBX over UDP
- It can also record calls to pcap files

Without `rtpengine`, SIP can still ring, but audio and IVR media break.

### MongoDB

MongoDB stores PBX data:

- extensions
- IVRs
- routes
- CDRs
- voicemail metadata
- users

For your real-estate project, MongoDB will also be the right place to store lead data after we customize the IVR.

### Socket.IO

Socket.IO is for the web dashboard.

- browser admin page connects to the Node.js app
- dashboard updates in real time
- extension presence and active calls can refresh live

It is not the SIP layer. It is only the web GUI real-time layer.

### SIP signaling vs RTP media

Keep these two separate in your mind:

- SIP signaling = call control
- RTP media = voice audio

Example:

1. Extension `2001` dials `2002`
2. SIP says "start a call"
3. SIP says "ring"
4. SIP says "answered"
5. RTP carries the actual voice packets

If SIP works but RTP fails:

- phone may register
- phone may ring
- but you get one-way audio or no audio

## 3. Ports you need for local testing

For the local Docker setup in this repo:

- `3000/TCP` = ShadowPBX web UI and API
- `5060/UDP` = SIP softphone registration and calling
- `5061/TCP` = SIP over WebSocket, not needed for MicroSIP/Zoiper now
- `9022/TCP` = drachtio control port used by the Node app
- `22222/UDP` = RTPEngine control
- `22223/UDP` = DTMF event listener
- `10000-10100/UDP` = RTP audio range for local testing
- `27017/TCP` = MongoDB

Why only `10000-10100` here instead of `10000-20000`?

- it is enough for local internal testing
- it keeps firewall rules smaller
- if you scale later, increase it

## 4. Folders used in this local setup

Repo root:

- [docker-compose.local.yml](/d:/ivr/shadowpbx/docker-compose.local.yml)
- [.env.docker.example](/d:/ivr/shadowpbx/.env.docker.example)
- [WINDOWS_LOCAL_REAL_ESTATE_IVR.md](/d:/ivr/shadowpbx/WINDOWS_LOCAL_REAL_ESTATE_IVR.md)

Docker helper files:

- [docker/shadowpbx.local.Dockerfile](/d:/ivr/shadowpbx/docker/shadowpbx.local.Dockerfile)
- [docker/mongo-init.js](/d:/ivr/shadowpbx/docker/mongo-init.js)

Runtime folders created automatically:

- `runtime\logs`
- `runtime\recordings`
- `runtime\spool\rtpengine`
- `runtime\voicemail`

App code areas you will customize later:

- [src/services/ivr-handler.js](/d:/ivr/shadowpbx/src/services/ivr-handler.js)
- [src/routes/api.js](/d:/ivr/shadowpbx/src/routes/api.js)
- [src/models/index.js](/d:/ivr/shadowpbx/src/models/index.js)

## 5. One-time Windows setup

### 5.1 Install or update WSL2

Open Windows Terminal as Administrator and run:

```powershell
wsl --install
wsl --update
wsl --set-default-version 2
```

If Windows says WSL is already installed, that is fine.

Check status:

```powershell
wsl -l -v
```

### 5.2 Install Docker Desktop

Install Docker Desktop for Windows and make sure:

- it is using Linux containers
- `Use WSL 2 based engine` is enabled

In Docker Desktop, also enable host networking:

1. `Settings`
2. `Resources`
3. `Network`
4. Turn on `Enable host networking`
5. Apply and restart Docker Desktop

This matters because SIP and RTP use UDP and are much easier to test locally with host networking.

### 5.3 Verify Docker is working

```powershell
docker version
docker info
```

## 6. Prepare the repo

From Windows Terminal:

```powershell
cd D:\ivr\shadowpbx
Copy-Item .env.docker.example .env.docker
```

Now edit `.env.docker`.

The most important values are:

- `EXTERNAL_IP`
- `SIP_DOMAIN`
- `DRACHTIO_SECRET`
- `ADMIN_SECRET`
- `ADMIN_PASSWORD`

## 7. Find the correct local IP

Do not use:

- `127.0.0.1`
- a VPN IP
- a WSL IP
- a Docker virtual adapter IP

Use your Windows LAN IPv4 address.

Quick command:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and
    $_.IPAddress -notlike '169.254*' -and
    $_.InterfaceAlias -notmatch 'WSL|vEthernet|Loopback|Docker'
  } |
  Select-Object InterfaceAlias,IPAddress
```

Example result:

```text
Wi-Fi      192.168.1.50
```

Then set this in `.env.docker`:

```env
SIP_DOMAIN=192.168.1.50
EXTERNAL_IP=192.168.1.50
```

For your local lab, using the same LAN IP for both values is correct.

## 8. Start the full local stack

From repo root:

```powershell
docker compose --env-file .env.docker -f docker-compose.local.yml up -d --build
```

If your Docker uses the older `docker-compose` command, use this instead:

```powershell
docker-compose --env-file .env.docker -f docker-compose.local.yml up -d --build
```

Check status:

```powershell
docker compose -f docker-compose.local.yml ps
```

Older Docker fallback:

```powershell
docker-compose --env-file .env.docker -f docker-compose.local.yml ps
```

Tail the main PBX logs:

```powershell
docker logs shadowpbx-app --tail 100
docker logs shadowpbx-drachtio --tail 100
docker logs shadowpbx-rtpengine --tail 100
docker logs shadowpbx-recorder --tail 100
```

Expected good signs:

- app says `MongoDB connected`
- app says `Drachtio connected`
- app says `DTMF listener started on 0.0.0.0:22223`
- app says `API + GUI on port 3000`
- drachtio container stays running
- rtpengine container stays running

Open the admin UI:

```text
http://localhost:3000
```

Default from `.env.docker.example`:

- username: `admin`
- password: `admin123`

Change these values before using this beyond a local lab.

## 9. If Docker build or start fails

### Stop everything

```powershell
docker compose -f docker-compose.local.yml down
```

### Start again with rebuild

```powershell
docker compose --env-file .env.docker -f docker-compose.local.yml up -d --build
```

### Remove containers and rebuild from zero

```powershell
docker compose -f docker-compose.local.yml down -v
docker compose --env-file .env.docker -f docker-compose.local.yml up -d --build
```

## 10. Create your first SIP extensions

Use `curl.exe` on Windows so PowerShell does not intercept it.

Create two test extensions:

```powershell
curl.exe -X POST http://localhost:3000/api/extensions/bulk -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"extensions\":[{\"extension\":\"2001\",\"name\":\"Agent One\",\"password\":\"Welcome2001\"},{\"extension\":\"2002\",\"name\":\"Agent Two\",\"password\":\"Welcome2002\"}]}"
```

If you changed `ADMIN_SECRET` in `.env.docker`, replace `shadowpbx_admin_api_key` above with your actual key.

Verify extensions:

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/extensions
```

## 11. Configure Zoiper or MicroSIP

### Recommended for first test

- MicroSIP on Windows
- One account for `2001`
- One account for `2002`

If you only have one PC:

- install MicroSIP
- install Zoiper too
- register `2001` in one
- register `2002` in the other

### SIP account settings

For extension `2001`:

- Account / Username: `2001`
- Password: `Welcome2001`
- Domain or SIP Server: your `EXTERNAL_IP` from `.env.docker`
- Port: `5060`
- Transport: `UDP`

For extension `2002`:

- Account / Username: `2002`
- Password: `Welcome2002`
- Domain or SIP Server: same IP
- Port: `5060`
- Transport: `UDP`

### Important softphone options

In MicroSIP:

- disable STUN
- disable ICE
- use codec `PCMU` and `PCMA`
- set registration refresh to about `60` seconds if available

In Zoiper:

- transport `UDP`
- disable STUN
- disable SRTP for now
- prefer G.711 u-law and A-law

## 12. Test SIP registration

Good registration means:

- the softphone shows `Registered`
- the admin API shows the extension as online

Check from API:

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/extensions
```

Look for:

- `registered: true`
- `contacts` array populated

## 13. Test internal extension-to-extension calling

### Test 1

- Dial `2002` from `2001`
- `2002` should ring
- Answer on `2002`
- You should have two-way audio

### Test 2

- Hang up
- Dial back from `2002` to `2001`

### Check active calls

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/calls/active
```

### Check CDR after hangup

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/cdr
```

## 14. Your real-estate IVR design

Your target flow:

1. State
2. City
3. Area
4. BHK
5. Save lead
6. Connect agent

### What ShadowPBX can already do now

Out of the box, this repo already supports:

- multi-level IVR
- DTMF detection
- routing to another IVR
- routing to an extension
- routing to a ring group

### Real-estate lead capture added in this local repo

This local repo now has a `RealEstateLead` MongoDB model and API endpoints for leads captured from IVR digit choices.

When an IVR option includes:

- `leadField`: one of `state`, `city`, `area`, `bhk`
- `leadValue`: the value to store
- `saveLead`: `true` on the final menu option

ShadowPBX stores the caller choices as a real-estate lead before transferring the call to an agent.

## 15. How to create the IVR chain now

Use a multi-IVR chain:

- `800` = State menu
- `801` = City menu
- `802` = Area menu
- `803` = BHK menu
- final digit routes to agent or ring group

### Example IVR 800: State

```powershell
curl.exe -X POST http://localhost:3000/api/ivr -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"number\":\"800\",\"name\":\"State Menu\",\"greeting\":\"/app/audio/ivr-800.wav\",\"options\":[{\"digit\":\"1\",\"leadField\":\"state\",\"leadValue\":\"Gujarat\",\"destination\":{\"type\":\"ivr\",\"target\":\"801\"}},{\"digit\":\"2\",\"leadField\":\"state\",\"leadValue\":\"Maharashtra\",\"destination\":{\"type\":\"ivr\",\"target\":\"801\"}}],\"timeout\":8,\"maxRetries\":3,\"timeoutDest\":{\"type\":\"extension\",\"target\":\"2001\"}}"
```

### Example IVR 801: City

```powershell
curl.exe -X POST http://localhost:3000/api/ivr -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"number\":\"801\",\"name\":\"City Menu\",\"options\":[{\"digit\":\"1\",\"leadField\":\"city\",\"leadValue\":\"Ahmedabad\",\"destination\":{\"type\":\"ivr\",\"target\":\"802\"}},{\"digit\":\"2\",\"leadField\":\"city\",\"leadValue\":\"Surat\",\"destination\":{\"type\":\"ivr\",\"target\":\"802\"}}],\"timeout\":8,\"maxRetries\":3,\"timeoutDest\":{\"type\":\"extension\",\"target\":\"2001\"}}"
```

### Example IVR 802: Area

```powershell
curl.exe -X POST http://localhost:3000/api/ivr -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"number\":\"802\",\"name\":\"Area Menu\",\"options\":[{\"digit\":\"1\",\"leadField\":\"area\",\"leadValue\":\"Bopal\",\"destination\":{\"type\":\"ivr\",\"target\":\"803\"}},{\"digit\":\"2\",\"leadField\":\"area\",\"leadValue\":\"Satellite\",\"destination\":{\"type\":\"ivr\",\"target\":\"803\"}}],\"timeout\":8,\"maxRetries\":3,\"timeoutDest\":{\"type\":\"extension\",\"target\":\"2001\"}}"
```

### Example IVR 803: BHK to agent

```powershell
curl.exe -X POST http://localhost:3000/api/ivr -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"number\":\"803\",\"name\":\"BHK Menu\",\"options\":[{\"digit\":\"1\",\"leadField\":\"bhk\",\"leadValue\":\"2 BHK\",\"saveLead\":true,\"destination\":{\"type\":\"extension\",\"target\":\"2001\"}},{\"digit\":\"2\",\"leadField\":\"bhk\",\"leadValue\":\"3 BHK\",\"saveLead\":true,\"destination\":{\"type\":\"extension\",\"target\":\"2002\"}}],\"timeout\":8,\"maxRetries\":3,\"timeoutDest\":{\"type\":\"extension\",\"target\":\"2001\"}}"
```

## 16. How to call the IVR internally

From softphone extension `2001` or `2002`, dial:

```text
800
```

That starts the IVR.

This works because ShadowPBX treats IVR numbers as internal destinations stored in MongoDB.

## 17. How DTMF detection works here

ShadowPBX uses two DTMF methods:

1. SIP INFO
2. RTP RFC2833/4733 events from RTPEngine

The actual code is here:

- [src/services/ivr-handler.js](/d:/ivr/shadowpbx/src/services/ivr-handler.js)
- [src/services/dtmf-listener.js](/d:/ivr/shadowpbx/src/services/dtmf-listener.js)

Simple flow:

1. caller presses `1`
2. RTPEngine sees the DTMF event
3. RTPEngine sends a UDP event to the app container on `app:22223`
4. `dtmf-listener.js` receives it
5. `ivr-handler.js` routes the call based on the pressed digit

## 18. How to see saved real-estate leads

After a caller completes the IVR and reaches the final BHK menu, check leads with:

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/real-estate-leads
```

Filter examples:

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" "http://localhost:3000/api/real-estate-leads?city=Ahmedabad"
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" "http://localhost:3000/api/real-estate-leads?status=assigned"
```

Update a lead:

```powershell
curl.exe -X PUT http://localhost:3000/api/real-estate-leads/LEAD_ID -H "Content-Type: application/json" -H "X-API-Key: shadowpbx_admin_api_key" -d "{\"status\":\"contacted\",\"note\":\"Customer wants callback tomorrow\",\"author\":\"admin\"}"
```

### Minimal lead-save behavior

At the final menu:

- if caller selected `State=Gujarat`
- `City=Ahmedabad`
- `Area=Bopal`
- `BHK=2`

Then save:

```json
{
  "state": "Gujarat",
  "city": "Ahmedabad",
  "area": "Bopal",
  "bhk": "2 BHK",
  "callerNumber": "2001",
  "status": "new"
}
```

Then route the live call to an agent extension or ring group.

## 19. Angular integration plan

Do this in phases.

### Phase 1

Use the existing EJS admin UI just to prove:

- registration works
- calls work
- IVR works
- DTMF works

### Phase 2

Add REST endpoints for custom real-estate leads in Node.js:

- `GET /api/real-estate-leads`
- `GET /api/real-estate-leads/:id`
- `POST /api/real-estate-leads`
- `PUT /api/real-estate-leads/:id`

### Phase 3

Build Angular admin pages:

- lead list
- lead detail
- filter by state/city/area/bhk
- call history
- assign to agent
- click-to-call later if needed

### Phase 4

Optional later:

- agent dashboard
- missed lead follow-up
- lead disposition
- screen pop when agent answers

## 20. Windows Firewall rules

Open Windows Terminal as Administrator:

```powershell
New-NetFirewallRule -DisplayName "ShadowPBX SIP UDP 5060" -Direction Inbound -Protocol UDP -LocalPort 5060 -Action Allow
New-NetFirewallRule -DisplayName "ShadowPBX RTP UDP 10000-10100" -Direction Inbound -Protocol UDP -LocalPort 10000-10100 -Action Allow
New-NetFirewallRule -DisplayName "ShadowPBX GUI TCP 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "ShadowPBX Drachtio TCP 9022" -Direction Inbound -Protocol TCP -LocalPort 9022 -Action Allow
```

For local same-machine testing, `9022` is mostly internal, but opening it avoids weird local blocking during first experiments.

## 21. Troubleshooting: SIP registration fails

### Symptom

Softphone says:

- `registration failed`
- `forbidden`
- `timeout`

### Checks

1. Is Docker Desktop running
2. Is host networking enabled
3. Is `EXTERNAL_IP` correct in `.env.docker`
4. Is the softphone using `UDP` on `5060`
5. Did you use the correct extension password
6. Did Windows Firewall block UDP `5060`

### Commands

```powershell
docker logs shadowpbx-app --tail 200
docker logs shadowpbx-drachtio --tail 100
```

Look for:

- `REGISTER rejected: bad credentials`
- `REGISTER rejected: unknown extension`
- `Extension 2001 registered`

## 22. Troubleshooting: phone registers but call fails

### Symptom

- both phones show registered
- dialing gives busy or no ring

### Checks

```powershell
curl.exe -H "X-API-Key: shadowpbx_admin_api_key" http://localhost:3000/api/extensions
```

Make sure the called extension has:

- `registered: true`
- a populated `contacts` list

Also inspect app logs:

```powershell
docker logs shadowpbx-app --tail 200
```

You want to see:

- `CALL 2001 -> 2002`
- `CALL ANSWERED 2001 -> 2002`

## 23. Troubleshooting: no audio or one-way audio

This is the most common SIP lab problem.

### Main causes

- wrong `EXTERNAL_IP`
- host networking disabled in Docker Desktop
- Windows firewall blocking RTP
- softphone trying STUN or ICE

### Fix checklist

1. Confirm `.env.docker` uses the correct Windows LAN IP
2. Disable STUN and ICE in the softphone
3. Open UDP `10000-10100`
4. Restart stack after IP changes

Restart stack:

```powershell
docker compose -f docker-compose.local.yml down
docker compose --env-file .env.docker -f docker-compose.local.yml up -d
```

Check RTPEngine logs:

```powershell
docker logs shadowpbx-rtpengine --tail 200
```

## 24. Troubleshooting: DTMF not detected in IVR

### Symptom

- IVR greeting plays
- pressing digits does nothing

### Checks

1. Use RTP DTMF or default DTMF settings in softphone
2. Disable any unusual in-band DTMF option
3. Confirm app log shows the DTMF listener started
4. Confirm RTPEngine is running

Commands:

```powershell
docker logs shadowpbx-app --tail 200
docker logs shadowpbx-rtpengine --tail 200
```

Look for:

- `DTMF listener started on 0.0.0.0:22223`
- `IVR: DTMF detected`

## 25. Troubleshooting: IVR audio file does not play

### Audio rules

Use:

- WAV
- 8kHz
- mono

This repo already auto-converts uploaded WAV or MP3 files through ffmpeg in the API layer.

You can also use the sample audio files already in:

- [audio/ivr-800.wav](/d:/ivr/shadowpbx/audio/ivr-800.wav)
- [audio/vm-greeting.wav](/d:/ivr/shadowpbx/audio/vm-greeting.wav)
- [audio/hold-music.wav](/d:/ivr/shadowpbx/audio/hold-music.wav)

## 26. Troubleshooting: MongoDB problems

### Verify Mongo container

```powershell
docker logs shadowpbx-mongo --tail 100
```

### Verify from PBX logs

```powershell
docker logs shadowpbx-app --tail 100
```

You want:

- `MongoDB connected`

If auth fails:

- check `MONGODB_URI` in `.env.docker`
- if needed, remove the volume and recreate Mongo

```powershell
docker compose -f docker-compose.local.yml down -v
docker compose --env-file .env.docker -f docker-compose.local.yml up -d --build
```

## 27. Good first milestone

Your first success target should be this exact sequence:

1. Docker stack starts
2. `2001` registers
3. `2002` registers
4. `2001` can call `2002`
5. Audio works both ways
6. Dial `800`
7. IVR greeting plays
8. DTMF routes to the next IVR
9. Final IVR routes to an agent extension
10. `/api/real-estate-leads` shows the captured lead

Once that works, your local real-estate IVR path is proven end to end.

## 28. What I would build next

If you want the next engineering step after setup, the right sequence is:

1. record proper Hindi/English menu audio for state, city, area, and BHK
2. build an Angular lead list on top of `/api/real-estate-leads`
3. add lead assignment and follow-up status for agents
4. add inbound SIP trunk later when you want real customer calls
5. add CRM sync if you want leads in Zoho, HubSpot, Salesforce, or another CRM

That is the cleanest path from "PBX lab" to "real estate IVR product".
