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
    Brake       → Down Arrow
    Camera      → C
    Menu        → Escape

Edit the KEY_MAP dict below to change any mapping.

──────────────────────────────────────────────────────────────────
NITRO SYSTEM (Asphalt 9 mechanics)
──────────────────────────────────────────────────────────────────

The app sends  { "type": "nitro", "nitroType": "yellow"|"perfect"|"orange" }

Nitro type is determined ENTIRELY on the phone using tap-delta timing:

  delta = time between current tap and previous tap

  delta < 120 ms       → orange  (ultra-fast double tap, no gap)
  delta < perfectWindow → perfect (second tap within blue zone window)
  else                  → yellow  (single tap / too slow)

  perfectWindow is per-car (set in Settings → Car Class):
    C/D class  → 500 ms  (easy)
    B class    → 380 ms
    A class    → 300 ms  (default)
    S class    → 220 ms
    S+ Hypercar → 150 ms (very tight)

PC keyboard behaviour:

  yellow  → single Space tap (80 ms hold)
            The game fires standard yellow nitro.

  perfect → Space tap → PERFECT_GAP pause → second Space tap
            The PERFECT_GAP places the second press inside A9's blue zone.
            Tune PERFECT_GAP if timing is off (see tips below).

  orange  → two very fast Space taps (40 ms each, 40 ms apart)
            Simulates the "no gap" double tap that triggers orange boost.

Debugging latency:
    • Run: python tilt2pc_server.py   (prints every nitro event)
    • Check "round-trip" in heartbeat pong response
    • Target: < 50 ms phone→PC latency on same Wi-Fi network
    • If > 80 ms: disable power-saving on Wi-Fi adapter, use 5 GHz band

Tuning tips:
    • Increase PERFECT_GAP if 'perfect' fires too early in-game
    • Decrease PERFECT_GAP if 'perfect' fires too late in-game
    • ORANGE_HOLD + ORANGE_GAP should total < 120 ms to feel snappy
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
    "NITRO":  Key.space,
    "DRIFT":  Key.shift_l,
    "BRAKE":  Key.down,
    "CAMERA": "c",
    "MENU":   Key.esc,
    "EXTRA1": "q",
    "EXTRA2": "e",
}

# ── Nitro timing constants (seconds) — tune to match your A9 version ──────────
YELLOW_HOLD   = 0.08    # How long to hold Space for yellow nitro tap
PERFECT_GAP   = 0.35    # Delay between yellow press and perfect re-press
                        # ↑ Increase if perfect fires too early in-game
                        # ↓ Decrease if perfect fires too late in-game
PERFECT_HOLD  = 3.50    # How long to hold Space after perfect re-press

ORANGE_HOLD   = 0.04    # Hold duration for each tap in orange double-tap
ORANGE_GAP    = 0.04    # Gap between the two orange taps

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
    btn_id = data.get("id", "")
    action = data.get("action", "")
    key    = KEY_MAP.get(btn_id)
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
        for _ in range(2):
            _press(key)
            await asyncio.sleep(0.04)
            _release(key)
            await asyncio.sleep(0.07)
    elif action == "long":
        _press(key)


# ─── Nitro handler ────────────────────────────────────────────────────────────
#
#  Nitro type  │ Phone detected                    │ PC action
#  ────────────┼────────────────────────────────────┼──────────────────────────────
#  yellow      │ Single tap (delta ≥ perfectWindow) │ Single Space tap (80 ms)
#  perfect     │ Second tap in timing window        │ Space → PERFECT_GAP → re-press
#  orange      │ Ultra-fast second tap (< 120 ms)   │ Two rapid Space taps (no gap)
#

async def _run_nitro(nitro_type: str):
    nitro_key = KEY_MAP["NITRO"]

    try:
        if nitro_type == "yellow":
            # ── Yellow: single Space tap ────────────────────────────────
            _press(nitro_key)
            await asyncio.sleep(YELLOW_HOLD)
            _release(nitro_key)
            print(f"  [NITRO] Yellow  — single tap ({YELLOW_HOLD*1000:.0f} ms hold)")

        elif nitro_type == "perfect":
            # ── Perfect: first tap → gap → second tap in blue zone ──────
            # Step 1: Start yellow nitro
            _press(nitro_key)
            await asyncio.sleep(YELLOW_HOLD)
            _release(nitro_key)

            # Step 2: Wait for A9's blue zone to appear (~350 ms after first tap)
            await asyncio.sleep(PERFECT_GAP)

            # Step 3: Re-press in the blue zone → perfect nitro activates
            _press(nitro_key)
            await asyncio.sleep(PERFECT_HOLD)
            _release(nitro_key)
            print(f"  [NITRO] Perfect — gap={PERFECT_GAP*1000:.0f} ms, hold={PERFECT_HOLD:.1f}s")

        elif nitro_type == "orange":
            # ── Orange: two rapid taps with virtually no gap ─────────────
            # Simulates the phone's ultra-fast double tap (<120 ms)
            _press(nitro_key)
            await asyncio.sleep(ORANGE_HOLD)
            _release(nitro_key)

            await asyncio.sleep(ORANGE_GAP)

            _press(nitro_key)
            await asyncio.sleep(ORANGE_HOLD)
            _release(nitro_key)
            print(f"  [NITRO] Orange  — double tap ({(ORANGE_HOLD+ORANGE_GAP)*1000:.0f} ms total)")

        else:
            print(f"  [NITRO] Unknown type: {nitro_type!r}")

    except asyncio.CancelledError:
        _release(nitro_key)
        raise


async def handle_nitro(data: dict):
    """Entry point for { type: 'nitro', nitroType: 'yellow'|'perfect'|'orange' } messages."""
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

            # ── Generic buttons (brake, camera, menu) ─────────────────
            if msg_type == "button":
                await handle_button(data)
                continue

            # ── Nitro (yellow / perfect / orange) ─────────────────────
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
    print("=" * 58)
    print("  Tilt2PC Windows Companion Server")
    print("=" * 58)
    print(f"  Local IP  :  {local_ip}")
    print(f"  Port      :  {PORT}")
    print(f"  PIN       :  {'(none)' if not PIN else '****'}")
    print()
    print("  Nitro system  (all timing done on phone):")
    print(f"    Yellow  → single Space tap  ({YELLOW_HOLD*1000:.0f} ms hold)")
    print(f"    Perfect → Space, {PERFECT_GAP*1000:.0f} ms gap, re-press ({PERFECT_HOLD:.1f}s hold)")
    print(f"    Orange  → two rapid taps ({(ORANGE_HOLD+ORANGE_GAP)*1000:.0f} ms total)")
    print()
    print("  Per-car perfect windows (set in app Settings):")
    print("    C/D class   → 500 ms  (easy)")
    print("    B class     → 380 ms")
    print("    A class     → 300 ms  (default)")
    print("    S class     → 220 ms")
    print("    S+ Hypercar → 150 ms  (very tight)")
    print()
    print(f"  Enter this IP in the Tilt2PC app → {local_ip}")
    print()
    print("  Waiting for phone... (Ctrl+C to stop)")
    print("-" * 58)
    print()
    print("  Tuning tips:")
    print("    • Increase PERFECT_GAP if 'perfect' fires too early in-game")
    print("    • Decrease PERFECT_GAP if 'perfect' fires too late in-game")
    print("    • On same Wi-Fi network, latency should be < 30 ms")
    print("-" * 58)

    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        _release_all()
        print("\nServer stopped.")
