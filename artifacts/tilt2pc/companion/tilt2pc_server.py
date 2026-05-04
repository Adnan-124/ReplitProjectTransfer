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

──────────────────────────────────────────────────────────────────
NITRO SYSTEM (Asphalt 9 mechanics)
──────────────────────────────────────────────────────────────────

The app sends  { "type": "nitro", "nitroType": "yellow"|"perfect"|"orange"|"shockwave" }

NitroController (server-side):
  Simulates the in-game nitro meter (0.0–1.0) and uses a state machine
  to fire keyboard inputs at the correct moment — NO fixed sleep() delays
  for perfect nitro.

Nitro zones:
  NORMAL    0.0 – 0.4   (standard nitro)
  PERFECT   0.4 – 0.7   (perfect blue zone)
  SHOCKWAVE 0.7 – 1.0   (bar full)

  perfect_target = 0.58,  tolerance = 0.05

State machine:
  IDLE → on yellow/perfect first tap → NORMAL  (Space pressed)
  NORMAL → on second tap (perfect intent) → WAITING_PERFECT
  WAITING_PERFECT → update() predicts level → fires second press → PERFECT
  Any tap when level ≥ 0.8 → SHOCKWAVE (rapid double tap)

Tuning:
  Adjust refill_rate / consumption_rate in NitroController.__init__ to
  match your car's actual bar speed.
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

ORANGE_HOLD  = 0.04   # seconds — hold per tap in orange double-tap
ORANGE_GAP   = 0.04   # seconds — gap between orange taps

# ─── Shared key state ─────────────────────────────────────────────────────────

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


# ─── NitroController ──────────────────────────────────────────────────────────

class NitroController:
    """
    Simulates the Asphalt 9 nitro meter and drives keyboard inputs
    from a 60 Hz asyncio update loop — no fixed sleep() delays for perfect.

    Zones (nitro_level):
        NORMAL    0.00 – 0.40
        PERFECT   0.40 – 0.70   ← target 0.58 ± 0.05
        SHOCKWAVE 0.70 – 1.00
    """

    # Zone boundaries
    PERFECT_MIN    = 0.40
    PERFECT_MAX    = 0.70
    SHOCKWAVE_MIN  = 0.70

    PERFECT_TARGET = 0.58
    TOLERANCE      = 0.05

    def __init__(self):
        self.nitro_level      = 0.0
        self.is_active        = False   # True while nitro key is held / consuming
        self.state            = 'IDLE'  # IDLE | NORMAL | WAITING_PERFECT | PERFECT | SHOCKWAVE

        # Bar rates per second — tune to match your car
        self.refill_rate      = 0.22   # fills from 0→1 in ~4.5 s when idle
        self.consumption_rate = 0.38   # drains from 1→0 in ~2.6 s when active

        # Latency compensation: predict where the bar will be when the key press arrives
        self.latency_estimate = 0.08   # seconds (typical same-LAN Wi-Fi round-trip)

        self._nitro_key       = KEY_MAP["NITRO"]

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _press(self):
        _press(self._nitro_key)

    def _release(self):
        _release(self._nitro_key)

    # ── Frame update — call at ~60 Hz ─────────────────────────────────────────

    def update(self, dt: float):
        # Simulate nitro meter
        if self.is_active:
            self.nitro_level -= self.consumption_rate * dt
        else:
            self.nitro_level += self.refill_rate * dt
        self.nitro_level = max(0.0, min(1.0, self.nitro_level))

        # Auto-trigger perfect when level hits the zone
        if self.state == 'WAITING_PERFECT':
            # Compensate for network + input latency
            predicted = self.nitro_level - (self.consumption_rate * self.latency_estimate)
            predicted = max(0.0, min(1.0, predicted))

            if abs(predicted - self.PERFECT_TARGET) <= self.TOLERANCE:
                # Re-tap: release then immediately press again
                self._release()
                self._press()
                self.state = 'PERFECT'
                print(
                    f"  [NITRO] Perfect — auto-fired at level={self.nitro_level:.3f}"
                    f"  predicted={predicted:.3f}"
                )

        # Drain stops when bar hits 0
        if self.nitro_level <= 0.0 and self.is_active:
            self._release()
            self.is_active = False
            self.state = 'IDLE'

    # ── Handle a nitro tap from the phone ─────────────────────────────────────

    async def handle_tap(self, nitro_type: str):
        """
        Called for each  { "type": "nitro", "nitroType": "..." }  message.

        yellow    → single Space press (standard boost)
        perfect   → first tap starts nitro; update() fires second tap at right moment
        orange    → two ultra-fast Space taps
        shockwave → rapid double-tap (if bar is full) or long hold
        """

        # ── Shockwave guard — interrupt any sequence if bar is full ────────────
        if nitro_type == 'shockwave' or (
            nitro_type in ('yellow', 'perfect') and self.nitro_level >= self.SHOCKWAVE_MIN
        ):
            print(
                f"  [NITRO] Shockwave — level={self.nitro_level:.3f}"
            )
            # Cancel current sequence
            self._release()
            self.is_active = False

            # Rapid double tap to trigger shockwave
            self._press()
            await asyncio.sleep(ORANGE_HOLD)
            self._release()
            await asyncio.sleep(ORANGE_GAP)
            self._press()
            await asyncio.sleep(ORANGE_HOLD)
            self._release()

            self.state = 'SHOCKWAVE'
            return

        # ── Orange: ultra-fast double tap ─────────────────────────────────────
        if nitro_type == 'orange':
            self._release()
            self.is_active = False

            self._press()
            await asyncio.sleep(ORANGE_HOLD)
            self._release()
            await asyncio.sleep(ORANGE_GAP)
            self._press()
            await asyncio.sleep(ORANGE_HOLD)
            self._release()

            self.state = 'IDLE'
            print(f"  [NITRO] Orange  — double tap, level={self.nitro_level:.3f}")
            return

        # ── Yellow: single tap (first press in any sequence) ──────────────────
        if nitro_type == 'yellow':
            # If we were mid-perfect wait, abort it
            if self.state in ('WAITING_PERFECT', 'PERFECT'):
                self._release()
                self.is_active = False

            self._press()
            self.is_active = True
            self.state = 'NORMAL'

            # Brief hold then release (standard yellow boost)
            await asyncio.sleep(0.08)
            self._release()
            self.is_active = False
            self.state = 'IDLE'
            print(f"  [NITRO] Yellow  — single tap, level={self.nitro_level:.3f}")
            return

        # ── Perfect: dynamic timing via update() ──────────────────────────────
        if nitro_type == 'perfect':
            if self.state == 'IDLE':
                # First tap — start nitro, let update() wait for the zone
                self._press()
                self.is_active = True
                self.state = 'WAITING_PERFECT'
                print(
                    f"  [NITRO] Perfect (1st tap) — nitro started, "
                    f"waiting for level={self.PERFECT_TARGET}±{self.TOLERANCE}"
                )
            elif self.state == 'NORMAL':
                # User tapped again while normal nitro was active → wait for perfect zone
                self.state = 'WAITING_PERFECT'
                print(
                    f"  [NITRO] Perfect (2nd tap) — WAITING_PERFECT, "
                    f"current level={self.nitro_level:.3f}"
                )
            else:
                # Already waiting or in perfect — ignore duplicate
                print(f"  [NITRO] Perfect — ignored (state={self.state})")
            return

        print(f"  [NITRO] Unknown type: {nitro_type!r}")

    def reset(self):
        self._release()
        self.is_active = False
        self.state = 'IDLE'


# Singleton controller (one per server run)
nitro_ctrl = NitroController()

# Ongoing nitro task handle (for cancellation)
nitro_task: Optional[asyncio.Task] = None


# ─── 60 Hz update loop ────────────────────────────────────────────────────────

async def nitro_update_loop():
    """Runs continuously at ~60 Hz, updating the simulated nitro meter."""
    TICK = 1 / 60
    last = time.monotonic()
    while True:
        await asyncio.sleep(TICK)
        now = time.monotonic()
        nitro_ctrl.update(now - last)
        last = now


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


# ─── Nitro dispatch ───────────────────────────────────────────────────────────

async def handle_nitro(data: dict):
    """Dispatch to NitroController, cancelling any in-flight task first."""
    global nitro_task
    nitro_type = data.get("nitroType", "yellow")

    if nitro_task and not nitro_task.done():
        nitro_task.cancel()
        try:
            await nitro_task
        except asyncio.CancelledError:
            pass

    nitro_task = asyncio.create_task(nitro_ctrl.handle_tap(nitro_type))


# ─── WebSocket handler ────────────────────────────────────────────────────────

async def handler(websocket):
    global client_count
    client_count += 1
    addr = websocket.remote_address
    print(f"\n[+] Phone connected from {addr[0]}:{addr[1]}  (clients: {client_count})")

    nitro_ctrl.reset()
    authed = PIN == ""

    try:
        async for raw in websocket:
            recv_ts = time.monotonic()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

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

            if msg_type == "heartbeat":
                latency_ms = round((time.monotonic() - recv_ts) * 1000, 1)
                await websocket.send(json.dumps({
                    "type": "pong",
                    "ts": data.get("ts", 0),
                    "server_latency_ms": latency_ms,
                }))
                continue

            if msg_type == "steer":
                handle_steer(float(data.get("value", 0)))
                continue

            if msg_type == "button":
                await handle_button(data)
                continue

            if msg_type == "nitro":
                await handle_nitro(data)
                continue

    except Exception as exc:
        print(f"  [!] Connection error: {exc}")
    finally:
        _release_all()
        nitro_ctrl.reset()
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
    print("=" * 60)
    print("  Tilt2PC Windows Companion Server")
    print("=" * 60)
    print(f"  Local IP  :  {local_ip}")
    print(f"  Port      :  {PORT}")
    print(f"  PIN       :  {'(none)' if not PIN else '****'}")
    print()
    print("  NitroController — simulated meter, state machine, no fixed delays")
    print(f"    Refill rate  :  {nitro_ctrl.refill_rate:.2f} /s")
    print(f"    Drain rate   :  {nitro_ctrl.consumption_rate:.2f} /s")
    print(f"    Perfect zone :  {nitro_ctrl.PERFECT_TARGET} ± {nitro_ctrl.TOLERANCE}")
    print(f"    Shockwave    :  level ≥ {nitro_ctrl.SHOCKWAVE_MIN}")
    print(f"    Latency comp :  {nitro_ctrl.latency_estimate*1000:.0f} ms")
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
    print("-" * 60)

    # Start the 60 Hz nitro meter update loop
    asyncio.create_task(nitro_update_loop())

    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        _release_all()
        print("\nServer stopped.")
