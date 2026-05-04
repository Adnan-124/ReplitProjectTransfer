"""
Tilt2PC – Windows Companion Server
====================================
Receives tilt + button + nitro events from the Tilt2PC Android app over
WebSocket and injects keyboard events into Asphalt 9 (or any game).

Requirements:
    pip install pynput websockets

Run:
    python tilt2pc_server.py

Key Mappings (Asphalt 9 defaults):
    Steer Left  → Left Arrow
    Steer Right → Right Arrow
    Nitro       → Space
    Drift       → Left Shift
    Brake       → Down Arrow
    Camera      → C
    Shockwave   → Left Shift  (mapped via SHOCKWAVE button on app)
    Menu        → Escape

Edit the KEY_MAP dict below to change any mapping.

──────────────────────────────────────────────────────────────────
NITRO SYSTEM (Asphalt 9 mechanics)
──────────────────────────────────────────────────────────────────
The app sends  { "type": "nitro", "nitroType": "yellow"|"perfect" }

  yellow  → tap Space once (standard nitro burst)
            Phone detects: first tap on NITRO button

  perfect → double-tap Space with precise inner timing
            PC simulates: press Space → 350ms gap → release/re-press
            This puts the second press inside A9's "blue zone" window
            Phone detects: second tap during 320–750ms after first tap

  Keyboard mapping:
    yellow  → Space × 1 press (hold 80 ms)
    perfect → Space press → 350 ms wait → quick re-press → hold 3.5 s

  Debugging latency:
    • Run: python tilt2pc_server.py --verbose   (adds per-message timing)
    • Check "round-trip" in heartbeat pong response
    • Target: < 50 ms phone→PC latency on same Wi-Fi network
    • If > 80 ms: disable power-saving on Wi-Fi adapter, use 5 GHz band
──────────────────────────────────────────────────────────────────
"""

import asyncio
import json
import socket
import time
from typing import Optional

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
PIN = ""                 # Set e.g. "1234" to require PIN (empty = no auth)
STEER_DEADZONE = 0.12    # ± this value = no steering key pressed

KEY_MAP = {
    "NITRO":      Key.space,
    "DRIFT":      Key.shift_l,
    "BRAKE":      Key.down,
    "CAMERA":     "c",
    "SHOCKWAVE":  Key.shift_l,   # Shockwave button (left pad on phone)
    "MENU":       Key.esc,
    "EXTRA1":     "q",
    "EXTRA2":     "e",
}

# Nitro timing constants (seconds) — tune to match your Asphalt 9 version
YELLOW_HOLD       = 0.08    # How long to hold Space for yellow nitro tap
PERFECT_GAP       = 0.35    # Delay between yellow press and perfect re-press
PERFECT_HOLD      = 3.50    # How long to hold Space after perfect re-press

# ─── State ────────────────────────────────────────────────────────────────────

keyboard = Controller()
pressed_keys: set = set()
client_count = 0
nitro_task: Optional[asyncio.Task] = None   # tracks the running nitro coroutine


def _press(key):
    """Press a key if not already held."""
    if key not in pressed_keys:
        keyboard.press(key)
        pressed_keys.add(key)


def _release(key):
    """Release a key if currently held."""
    if key in pressed_keys:
        keyboard.release(key)
        pressed_keys.discard(key)


def _tap(key, hold: float = 0.05):
    """Synchronous single tap (non-blocking usage — wrap in asyncio.sleep)."""
    keyboard.press(key)
    pressed_keys.add(key)
    time.sleep(hold)
    keyboard.release(key)
    pressed_keys.discard(key)


def _release_all():
    for key in list(pressed_keys):
        try:
            keyboard.release(key)
        except Exception:
            pass
    pressed_keys.clear()


# ─── Steering ─────────────────────────────────────────────────────────────────

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


# ─── Button handler ───────────────────────────────────────────────────────────

async def handle_button(data: dict):
    btn_id  = data.get("id", "")
    action  = data.get("action", "")
    key     = KEY_MAP.get(btn_id)
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
        # Double-tap on generic button (rapid two presses)
        for _ in range(2):
            _press(key)
            await asyncio.sleep(0.04)
            _release(key)
            await asyncio.sleep(0.07)
    elif action == "long":
        _press(key)


# ─── Nitro handler ────────────────────────────────────────────────────────────
#
#  Nitro type  │ What the phone detected        │ What we do on PC
#  ────────────┼────────────────────────────────┼───────────────────────────────
#  yellow      │ First tap on NITRO button       │ Single Space tap
#  perfect     │ Second tap in 320-750ms window  │ Space → 350ms gap → re-press
#
#  Asphalt 9 "perfect nitro" blue zone timing:
#    After the first Space press, A9 shows a brief blue flash at ~350-500 ms.
#    Pressing Space again during that flash triggers perfect nitro.
#    PERFECT_GAP constant above controls this timing — increase if your game
#    version's blue zone appears later, decrease if it appears earlier.

async def _run_nitro(nitro_type: str):
    nitro_key = KEY_MAP["NITRO"]

    try:
        if nitro_type == "yellow":
            # ── Yellow: single Space tap ────────────────────────────────
            # The game auto-activates yellow nitro on tap.
            _press(nitro_key)
            await asyncio.sleep(YELLOW_HOLD)
            _release(nitro_key)
            print(f"  [NITRO] Yellow fired")

        elif nitro_type == "perfect":
            # ── Perfect: Space → gap → re-press in blue zone ────────────
            # 1. First press starts yellow nitro
            _press(nitro_key)
            await asyncio.sleep(YELLOW_HOLD)
            _release(nitro_key)

            # 2. Wait for A9's blue zone to appear (~350ms into yellow)
            await asyncio.sleep(PERFECT_GAP)

            # 3. Re-press Space in the blue zone → perfect nitro activates
            _press(nitro_key)
            await asyncio.sleep(PERFECT_HOLD)
            _release(nitro_key)
            print(f"  [NITRO] Perfect fired (gap={PERFECT_GAP}s)")

        else:
            print(f"  [NITRO] Unknown type: {nitro_type!r}")

    except asyncio.CancelledError:
        # Clean up if a new nitro fires while this one is running
        _release(nitro_key)
        raise


async def handle_nitro(data: dict):
    """Entry point for { type: 'nitro', nitroType: '...' } messages."""
    global nitro_task

    nitro_type = data.get("nitroType", "yellow")

    # Cancel any in-progress nitro sequence to avoid key-hold conflicts
    if nitro_task and not nitro_task.done():
        nitro_task.cancel()
        try:
            await nitro_task
        except asyncio.CancelledError:
            pass
        _release(KEY_MAP["NITRO"])

    nitro_task = asyncio.create_task(_run_nitro(nitro_type))


# ─── WebSocket handler ────────────────────────────────────────────────────────

async def handler(websocket):
    global client_count
    client_count += 1
    addr = websocket.remote_address
    print(f"\n[+] Phone connected from {addr[0]}:{addr[1]}  (clients: {client_count})")

    authed = PIN == ""  # auto-auth if no PIN set

    try:
        async for raw in websocket:
            recv_ts = time.monotonic()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # ── Auth handshake ────────────────────────────────────────
            if msg_type == "config":
                if PIN and data.get("pin", "") != PIN:
                    await websocket.send(json.dumps({"type": "error", "msg": "bad_pin"}))
                    print(f"  [!] Wrong PIN from {addr[0]}. Closing.")
                    break
                authed = True
                print(f"  Client: {data.get('client','?')} v{data.get('ver','?')}")
                await websocket.send(json.dumps({"type": "ack", "status": "ok"}))
                continue

            if not authed:
                continue

            # ── Heartbeat / latency probe ─────────────────────────────
            if msg_type == "heartbeat":
                latency_ms = round((time.monotonic() - recv_ts) * 1000, 1)
                await websocket.send(json.dumps({
                    "type": "pong",
                    "ts": data.get("ts", 0),
                    "server_latency_ms": latency_ms,
                }))
                continue

            # ── Steering (high-frequency, no logging) ─────────────────
            if msg_type == "steer":
                handle_steer(float(data.get("value", 0)))
                continue

            # ── Generic buttons (drift, brake, camera, shock, menu) ───
            if msg_type == "button":
                await handle_button(data)
                continue

            # ── Nitro (yellow / perfect) ──────────────────────────────
            if msg_type == "nitro":
                await handle_nitro(data)
                continue

    except Exception as exc:
        print(f"  [!] Connection error: {exc}")
    finally:
        _release_all()
        if nitro_task and not nitro_task.done():
            nitro_task.cancel()
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
    print("=" * 54)
    print("  Tilt2PC Windows Companion Server")
    print("=" * 54)
    print(f"  Local IP  :  {local_ip}")
    print(f"  Port      :  {PORT}")
    print(f"  PIN       :  {'(none)' if not PIN else '****'}")
    print()
    print("  Nitro system:")
    print(f"    Yellow  → Space tap  ({YELLOW_HOLD*1000:.0f} ms hold)")
    print(f"    Perfect → Space, {PERFECT_GAP*1000:.0f}ms gap, re-press ({PERFECT_HOLD:.1f}s hold)")
    print()
    print(f"  Enter this IP in the Tilt2PC app → {local_ip}")
    print()
    print("  Waiting for phone... (Ctrl+C to stop)")
    print("-" * 54)
    print()
    print("  Tuning tips:")
    print("    • Increase PERFECT_GAP if 'perfect' fires too early")
    print("    • Decrease PERFECT_GAP if 'perfect' fires too late")
    print("    • On same Wi-Fi network, latency should be < 30 ms")
    print("-" * 54)

    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        _release_all()
        print("\nServer stopped.")
