---
name: lan-page-deploy
description: Deploy a local web page or app so phones and other devices on the same LAN can open it by IP address and port. Use this whenever the user asks to "deploy this page", "open it on my phone", "make it available on the local network", "start the LAN service", "局域网访问", "帮我把这个页面部署一下", or similar, even if they do not explicitly mention LAN. It chooses HTTP or HTTPS, detects camera/microphone/WebRTC needs, checks ports, asks before killing existing processes, starts the appropriate frontend/backend services, and returns IP-based URLs.
---

# LAN Page Deploy

Use this skill to expose a local development page to other devices on the same network. The default public frontend port is `3001`; the default backend port is `3000`. Keep the workflow generic and do not mention private project names, paths, secrets, or business details in user-facing output.

## Core Workflow

1. Identify the requested page path and project root.
   - If the user names a page, normalize it to a path like `/page-name`.
   - If the project has one page or the user says "this page", infer from the current task context.
   - Ask a short clarification only when the page path or project root is genuinely ambiguous.
2. Decide whether LAN access needs HTTPS.
   - Use HTTPS when the page needs browser device APIs such as camera, microphone, screen capture, WebRTC, `getUserMedia`, `enumerateDevices`, `MediaRecorder`, `RTCPeerConnection`, or `navigator.mediaDevices`.
   - HTTP is fine for pages without device APIs unless the project already requires HTTPS.
3. Probe the environment before starting anything.
   - Prefer the bundled probe:
     ```bash
     node /path/to/lan-page-deploy/scripts/probe-lan-deploy.mjs --front-port 3001 --backend-port 3000 --page /page-name
     ```
   - Use its output to find LAN IPs, package scripts, likely package manager, device API hints, and port listeners.
4. If a required port is occupied, show the PID and command, then ask before killing it.
   - Only kill exact listener PIDs after the user confirms.
   - If the user does not want to kill the process, choose a nearby unused port and clearly report the change.
5. Start backend and frontend services.
   - Backend default: port `3000`, host `0.0.0.0` when the app supports it.
   - Frontend public default: port `3001`, host `0.0.0.0`.
   - Use the repository's existing scripts first. Do not invent a framework migration or edit app code just to deploy locally.
6. Validate the local and LAN URLs.
   - For HTTP:
     ```bash
     curl -I http://127.0.0.1:3001/page-name
     curl -I http://LAN_IP:3001/page-name
     ```
   - For HTTPS with a self-signed certificate:
     ```bash
     curl -k -I https://127.0.0.1:3001/page-name
     curl -k -I https://LAN_IP:3001/page-name
     ```
7. Respond with the exact access information.
   - Include protocol, LAN URL, local URL, frontend port, backend port if any, whether HTTPS was selected, process/session IDs if available, and any certificate note.

## HTTPS Strategy

When device APIs are required for LAN visitors, remote browsers usually require a secure context. `localhost` can be treated as secure, but `http://LAN_IP:PORT` usually is not.

Prefer this order:

1. Existing project HTTPS script or config, such as `dev:https`, `start:https`, or documented certificates.
2. Framework-native HTTPS support if already configured.
3. A local HTTPS proxy when the app only serves HTTP.

For a generic proxy setup, reserve public `3001` for HTTPS and run the actual frontend dev server on an internal nearby port such as `3002`:

```bash
# Terminal/session A: app server on internal port
npm run dev -- --host 0.0.0.0 --port 3002

# Terminal/session B: HTTPS proxy exposed to LAN
npx --yes local-ssl-proxy --hostname 0.0.0.0 --source 3001 --target 3002
```

Then give users:

```text
https://LAN_IP:3001/page-name
```

Tell the user that phones or other LAN devices may need to accept the self-signed certificate warning before camera/microphone APIs work. Do not claim the certificate is production-trusted.

## Command Selection

Use the project's package manager when obvious:

- `pnpm-lock.yaml` -> `pnpm`
- `yarn.lock` -> `yarn`
- `package-lock.json` or no lock file -> `npm`

Common frontend patterns:

- Vite-like scripts: append `-- --host 0.0.0.0 --port PORT` when the script accepts forwarded flags.
- Next.js: use `next dev -H 0.0.0.0 -p PORT` if the script exposes Next directly or can accept those flags.
- Static preview servers: use their host/port flags when documented by the package script.

If command behavior is unclear, inspect `package.json` and run a help command before starting a long-running service.

## Port Conflict Policy

When a listener is found on `3001` or `3000`:

1. Report the port, PID, and command.
2. Ask: "这个端口已经被占用，要我停止这个旧进程并重新启动吗？"
3. After confirmation, stop only that PID.
4. Re-check the port before launching.

Avoid broad process-kill patterns such as killing every `node` process.

## Final Response Format

Keep the final response concise and generic:

```text
已启动局域网访问服务。

本机地址: https://localhost:3001/page-name
局域网地址: https://192.168.x.x:3001/page-name
前端端口: 3001
后端端口: 3000
协议: HTTPS, because this page uses camera/microphone/WebRTC APIs.

如果手机首次访问提示证书风险，需要先选择继续访问，浏览器才会允许摄像头或麦克风权限。
```

If the service could not start, give the exact blocker and the next command or choice needed from the user.

