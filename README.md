# LAN Page Deploy Skill

This skill helps an agent deploy a local web app page for access from other devices on the same local network. It is intentionally generic: it does not assume a specific project name or directory.

## What It Does

- Detects the machine's LAN IP address.
- Uses `3001` as the default public frontend port.
- Uses `3000` as the default backend port.
- Checks whether those ports are already occupied.
- Asks before stopping any existing process.
- Chooses HTTPS when the page needs camera, microphone, screen capture, WebRTC, or other browser device APIs.
- Returns URLs in the format:

```text
https://<LAN_IP>:3001/<page-name>
```

For a single-page app with no named route, the route can simply be:

```text
https://<LAN_IP>:3001/
```

## Install

Copy this folder into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R lan-page-deploy ~/.codex/skills/lan-page-deploy
```

Restart or reload your Codex session if your environment requires it.

## Example Prompts

Chinese:

```text
帮我把这个页面部署一下，让同一个 Wi-Fi 下的手机能访问。
```

```text
启动这个页面的局域网服务，如果需要摄像头就用 HTTPS。
```

```text
把 /demo 页面开到本机 IP + 端口的形式，我要给另一台设备访问。
```

English:

```text
Deploy this page on my LAN so I can open it from my phone.
```

```text
Start the local network service for /demo. It uses the camera, so use HTTPS if needed.
```

## Requirements

- Node.js available in the terminal.
- A runnable local web project with scripts such as `npm run dev`, `pnpm dev`, or `yarn dev`.
- `lsof` is helpful for port checks on macOS/Linux.
- For HTTPS proxy fallback, the skill may use:

```bash
npx --yes local-ssl-proxy
```

That package is downloaded by `npx` when not already available.

## Manual Probe

From a project root, you can run:

```bash
node ~/.codex/skills/lan-page-deploy/scripts/probe-lan-deploy.mjs --front-port 3001 --backend-port 3000 --page /demo
```

The script prints JSON with:

- LAN IP candidates
- detected package manager
- package scripts
- likely device API usage
- listeners on the requested ports

The script does not start or stop services.

## Notes For HTTPS

Browsers usually allow camera/microphone access on `localhost`, but not on plain `http://<LAN_IP>:<PORT>`. If another device on the same network needs camera access, use HTTPS.

For generic development use, a self-signed local HTTPS proxy is usually enough:

```bash
npm run dev -- --host 0.0.0.0 --port 3002
npx --yes local-ssl-proxy --hostname 0.0.0.0 --source 3001 --target 3002
```

Then open:

```text
https://<LAN_IP>:3001/<page-name>
```

The browser may show a certificate warning. Continue only if this is your own local development server.

