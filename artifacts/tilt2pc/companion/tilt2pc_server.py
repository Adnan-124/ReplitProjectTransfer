"""
Tilt2PC – Windows Companion Server
====================================
Receives tilt + button events from the Tilt2PC Android app over WebSocket
and injects keyboard events into Asphalt 9 (or any game).

Requirements:
    pip install pynput websockets

Run:
    python tilt2pc_server.py

Then enter your PC's local IP in the Tilt2PC app (Settings → IP Address).
Default port: 3333

Key Mappings (Asphalt 9 defaults):
    Steer Left  → Left Arrow
    Steer Right → Right Arrow
    Nitro       → Space
    Drift       → Left Shift
    Brake       → Down Arrow
    Camera      → C
    Menu        → Escape
    Shockwave   → Space × 2  (sent by app on Nitro double-tap)
    Extra1/2    → Q / E

Edit the KEY_MAP dict below to change any mapping.
"""

import asyncio
import json
import socket

try:
    import websockets
except ImportError:
    print("ERROR: websockets not installed. Run:  pip install pynput websockets")
    raise

try:
    from pynput.keyboard import Key, Controller
except ImportError:
    print("ERROR: pynput not installed. Run:  pip install pynput websockets")
    raise

# ─── Configuration ────────────────────────────────────────────────────────────

PORT = 3333
PIN = ""           # Set to e.g. "1234" to require PIN from app (leave empty = no auth)
STEER_DEADZONE = 0.12   # Tilt within ±deadzone = no steering key pressed

# Key mappings for Asphalt 9. Change these to match your in-game key bindings.
KEY_MAP = {
    "NITRO":      Key.space,
    "DRIFT":      Key.shift_l,
    "BRAKE":      Key.down,
    "CAMERA":     "c",
    "MENU":       Key.esc,
    "EXTRA1":     "q",
    "EXTRA2":     "e",
}

# ─── State ────────────────────────────────────────────────────────────────────

keyboard = Controller()
pressed_keys: set = set()
client_count = 0


def _press(key):
    if key not in pressed_keys:
        keyboard.press(key)
        pressed_keys.add(key)


def _release(key):
    if key in pressed_keys:
        keyboard.release(key)
        pressed_keys.discard(key)


def _release_all():
    for key in list(pressed_keys):
        try:
            keyboard.release(key)
        except Exception:
            pass
    pressed_keys.clear()


def handle_steer(value: float):
    if value < -STEER_DEADZONE:
        _release(Key.right)
        _press(Key.left)
    elif value > STEER_DEADZONE:
        _release(Key.left)
        _press(Key.right)
    else:
        _release(Key.left)
        _release(Key.right)


async def handle_button(data: dict):
    btn_id = data.get("id", "")
    action = data.get("action", "")
    key = KEY_MAP.get(btn_id)
    if key is None:
        return

    if action == "down":
        _press(key)
    elif action == "up":
        _release(key)
    elif action == "click":
        _press(key)
        await asyncio.sleep(0.05)
        _release(key)
    elif action == "double":
        # Double-tap = Shockwave (two rapid presses)
        _press(key)
        await asyncio.sleep(0.04)
        _release(key)
        await asyncio.sleep(0.08)
        _press(key)
        await asyncio.sleep(0.04)
        _release(key)
    elif action == "long":
        _press(key)


# ─── WebSocket Handler ────────────────────────────────────────────────────────

async def handler(websocket):
    global client_count
    client_count += 1
    addr = websocket.remote_address
    print(f"\n[+] Phone connected from {addr[0]}:{addr[1]}  (clients: {client_count})")

    authed = PIN == ""  # Auto-auth if no PIN set

    try:
        async for raw in websocket:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # ── Auth / config handshake ──────────────────────────────
            if msg_type == "config":
                if PIN and data.get("pin", "") != PIN:
                    await websocket.send(json.dumps({"type": "error", "msg": "bad_pin"}))
                    print(f"  [!] Wrong PIN from {addr[0]}. Closing.")
                    break
                authed = True
                client_ver = data.get("ver", "?")
                client_name = data.get("client", "?")
                print(f"  Client: {client_name} v{client_ver}")
                await websocket.send(json.dumps({"type": "ack", "status": "ok"}))
                continue

            if not authed:
                continue

            # ── Heartbeat / ping ─────────────────────────────────────
            if msg_type == "heartbeat":
                await websocket.send(json.dumps({"type": "pong", "ts": data.get("ts", 0)}))
                continue

            # ── Steering ─────────────────────────────────────────────
            if msg_type == "steer":
                handle_steer(float(data.get("value", 0)))
                continue

            # ── Buttons ──────────────────────────────────────────────
            if msg_type == "button":
                await handle_button(data)
                continue

    except Exception as exc:
        print(f"  [!] Connection error: {exc}")
    finally:
        _release_all()
        client_count -= 1
        print(f"[-] Phone disconnected from {addr[0]}  (clients: {client_count})")


# ─── Entry point ─────────────────────────────────────────────────────────────

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


async def main():
    local_ip = get_local_ip()
    print("=" * 50)
    print("  Tilt2PC Windows Companion Server")
    print("=" * 50)
    print(f"  Local IP  :  {local_ip}")
    print(f"  Port      :  {PORT}")
    print(f"  PIN       :  {'(none)' if not PIN else '****'}")
    print()
    print(f"  Enter this IP in the Tilt2PC app:")
    print(f"  → {local_ip}")
    print()
    print("  Waiting for phone... (Ctrl+C to stop)")
    print("-" * 50)

    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        _release_all()
        print("\nServer stopped.")
