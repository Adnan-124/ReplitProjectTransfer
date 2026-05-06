# ==========================================================
# TILT2PC USB CONNECTION SETUP GUIDE
# ==========================================================
#
# STEP 1 — Connect Phone to PC
# --------------------------------
# Connect Android phone to PC using a USB data cable.
# Keep phone in File Transfer mode.
#
# STEP 2 — Enable USB Tethering
# --------------------------------
# On Android:
# Settings → Hotspot & Tethering → USB Tethering → ON
#
# STEP 3 — Find PC USB IP
# --------------------------------
# Open Windows CMD and run:
#
#     ipconfig
#
# Look for:
#     Ethernet adapter Ethernet 2
# OR:
#     Remote NDIS
#
# Copy the IPv4 Address.
# Example:
#     10.87.111.183
#
# STEP 4 — Start Server
# --------------------------------
# Open terminal inside tilt-server folder:
#
#     python server.py
#
# Expected output:
#     Tilt2PC Server
#     IP: 10.x.x.x
#     PORT: 3333
#
# STEP 5 — Connect App
# --------------------------------
# Open Tilt2PC app on phone.
# Enter:
#     IP   = USB tethering IPv4 address
#     PORT = 3333
#
# Press CONNECT.
#
# STEP 6 — Play Asphalt 9
# --------------------------------
# Keep:
# - USB tethering ON
# - server.py running
# - phone connected via USB
#
# BENEFITS OF USB MODE
# --------------------------------
# ✔ Lower latency
# ✔ More stable steering
# ✔ Less packet loss
# ✔ Faster response than WiFi
# ✔ No Replit/cloud latency
#
# ==========================================================


import asyncio
import json
import socket

from pynput.keyboard import Key, Controller
import websockets

PORT = 3333
PIN = ""
STEER_DEADZONE = 0.12

KEY_MAP = {
    "NITRO": Key.space,
    "DRIFT": Key.shift_l,
    "BRAKE": Key.down,
    "CAMERA": "c",
    "MENU": Key.esc,
    "EXTRA1": "q",
    "EXTRA2": "e",
}

keyboard = Controller()
pressed_keys = set()
client_count = 0


def _press(key):
    if key not in pressed_keys:
        keyboard.press(key)
        pressed_keys.add(key)
        print(f"[KEY DOWN] {key}")


def _release(key):
    if key in pressed_keys:
        keyboard.release(key)
        pressed_keys.discard(key)
        print(f"[KEY UP] {key}")


def _release_all():
    for key in list(pressed_keys):
        try:
            keyboard.release(key)
        except:
            pass
    pressed_keys.clear()

# added for smoothing steering input (not implemented yet)
smoothed_steer = 0

def handle_steer(value):
    global smoothed_steer

    # Apply smoothing
    smoothed_steer = smoothed_steer * 0.8 + value * 0.2

    print(f"[STEER] raw={value:.3f} smooth={smoothed_steer:.3f}")

    if smoothed_steer < -STEER_DEADZONE:
        _release(Key.right)
        _press(Key.left)

    elif smoothed_steer > STEER_DEADZONE:
        _release(Key.left)
        _press(Key.right)

    else:
        _release(Key.left)
        _release(Key.right)

async def handle_button(data):
    btn_id = data.get("id", "")
    action = data.get("action", "")

    print(f"[BUTTON] {btn_id} -> {action}")

    key = KEY_MAP.get(btn_id)

    if key is None:
        print("[WARNING] Unknown button")
        return

    # SIMPLE TAP
    if action == "click":

    # Faster drift tap
        if btn_id == "DRIFT":
            _press(key)
            await asyncio.sleep(0.015)
            _release(key)

        else:
            _press(key)
            await asyncio.sleep(0.03)
            _release(key)

    # DOUBLE TAP (shockwave)
    elif action == "double":
        _press(key)
        await asyncio.sleep(0.03)
        _release(key)

        await asyncio.sleep(0.03)

        _press(key)
        await asyncio.sleep(0.03)
        _release(key)

    # HOLD NITRO
    elif action == "long":
        _press(key)
        await asyncio.sleep(1.0)
        _release(key)

    elif action == "down":
        _press(key)

    elif action == "up":
        _release(key)


async def handler(websocket):
    global client_count

    client_count += 1

    addr = websocket.remote_address

    print(f"\n[CONNECTED] {addr}")

    authed = PIN == ""

    try:
        async for raw in websocket:

            print(f"[RAW] {raw}")

            try:
                data = json.loads(raw)

            except json.JSONDecodeError:
                print("[ERROR] Bad JSON")
                continue

            msg_type = data.get("type", "")

            # AUTH
            if msg_type == "config":

                if PIN and data.get("pin", "") != PIN:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "msg": "bad_pin"
                    }))

                    print("[ERROR] Wrong PIN")
                    break

                authed = True

                await websocket.send(json.dumps({
                    "type": "ack",
                    "status": "ok"
                }))

                print("[AUTH OK]")
                continue

            if not authed:
                continue

            # HEARTBEAT
            if msg_type == "heartbeat":
                await websocket.send(json.dumps({
                    "type": "pong"
                }))
                continue

            # STEERING
            if msg_type == "steer":
                value = float(data.get("value", 0))
                handle_steer(value)
                continue

            # BUTTONS
            if msg_type == "button":
                await handle_button(data)
                continue

    except Exception as exc:
        print(f"[ERROR] {exc}")

    finally:
        _release_all()

        client_count -= 1

        print(f"[DISCONNECTED] {addr}")


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

        s.connect(("8.8.8.8", 80))

        ip = s.getsockname()[0]

        s.close()

        return ip

    except:
        return "127.0.0.1"


async def main():
    ip = get_local_ip()

    print("=" * 50)
    print("Tilt2PC Server")
    print("=" * 50)

    print(f"IP: {ip}")
    print(f"PORT: {PORT}")

    print("\nWaiting for phone...\n")

    async with websockets.serve(handler, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())

    except KeyboardInterrupt:
        _release_all()
        print("\nServer stopped.")