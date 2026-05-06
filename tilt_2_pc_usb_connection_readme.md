# 🎮 Tilt2PC — USB Connection Guide

> Low-latency Android tilt controller for Asphalt 9

---

# ⚡ Why USB Mode?

Using USB tethering gives:

- ✅ Lower latency
- ✅ More stable steering
- ✅ Faster nitro response
- ✅ Less packet loss
- ✅ No WiFi/router delay
- ✅ Better overall gameplay feel

---

# 🧩 Requirements

Before starting, make sure you have:

- Android phone
- USB data cable
- Python installed on PC
- Tilt2PC APK installed on phone
- `server.py` file on PC

---

# 📁 Recommended Folder Structure

Create this folder on your PC:

```text
Desktop/
└── tilt-server/
    └── server.py
```

---

# 🚀 STEP 1 — Connect Phone to PC

Connect your Android phone using a USB cable.

On the phone:

```text
USB Mode → File Transfer
```

⚠️ Use a proper data cable.
Charging-only cables may not work.

---

# 🔌 STEP 2 — Enable USB Tethering

On Android:

```text
Settings
→ Hotspot & Tethering
→ USB Tethering
→ ON
```

Keep USB tethering enabled while playing.

---

# 🌐 STEP 3 — Find PC USB IP Address

Open Windows CMD or PowerShell.

Run:

```bash
ipconfig
```

Look for:

```text
Ethernet adapter Ethernet 2
```

OR:

```text
Remote NDIS
```

Find:

```text
IPv4 Address
```

Example:

```text
10.87.111.183
```

⚠️ IMPORTANT:
Do NOT use:

- localhost
- 127.0.0.1
- old WiFi IP

Use ONLY the USB tethering IP.

---

# 🖥️ STEP 4 — Start Python Server

Open terminal inside:

```text
Desktop/tilt-server
```

Run:

```bash
python server.py
```

Expected output:

```text
==================================================
Tilt2PC Server
==================================================
IP: 10.x.x.x
PORT: 3333

Waiting for phone...
```

---

# 📱 STEP 5 — Connect the Android App

Open the Tilt2PC APK.

Enter:

| Field | Value |
|---|---|
| IP | Your USB tethering IP |
| PORT | 3333 |

Example:

```text
IP: 10.87.111.183
PORT: 3333
```

Then press:

```text
CONNECT
```

---

# ✅ Successful Connection

If connection succeeds:

Phone app shows:

```text
Connected
```

PC terminal shows:

```text
[CONNECTED]
```

---

# 🎮 Controls

| Action | Function |
|---|---|
| Tilt Left | Steer Left |
| Tilt Right | Steer Right |
| Nitro Button | Nitro |
| Drift Button | Drift |
| Brake Button | Brake |

---

# ⚠️ Common Problems

## ❌ App says "Disconnected"

### Fixes:

- Check USB tethering is ON
- Recheck IP using `ipconfig`
- Ensure server.py is running
- Ensure port is `3333`
- Uninstall old APK and install latest APK

---

## ❌ Wrong IP

USB tethering IP changes sometimes.

Always verify using:

```bash
ipconfig
```

before connecting.

---

## ❌ Server not starting

Install dependencies:

```bash
pip install websockets pynput
```

---

# 🏎️ Current Architecture

```text
Android APK
    ↓
USB Tethering
    ↓
Python WebSocket Server
    ↓
Keyboard Input
    ↓
Asphalt 9
```

---

# 🚀 Future Improvements

Planned upgrades:

- 🎮 Virtual Xbox controller support
- ⚡ UDP networking
- 🎯 Analog steering
- 📉 Even lower latency
- 🔥 Better drift handling

---

# 🧠 Notes

- Keep phone connected while playing
- Keep server terminal open
- USB mode gives much smoother gameplay than WiFi
- APK mode is faster than Expo Go

---

# 🏁 Enjoy Driving

Tilt2PC is now running locally with low-latency USB communication for Asphalt 9.

