# app.py
from flask import Flask, render_template
import socketio
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Socket.IO with eventlet async mode
try:
    sio = socketio.Server(async_mode='eventlet', cors_allowed_origins='*')
    logger.info("Socket.IO server initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Socket.IO: {e}")
    raise

app = Flask(__name__)
app.wsgi_app = socketio.WSGIApp(sio, app.wsgi_app)  # Wrap Flask app with Socket.IO
logger.info("Flask app wrapped with Socket.IO WSGI handler.")

# In-memory state: room -> set of connected sid(s)
rooms = {}

# Helper: Get other user in room
def get_other(sid, room):
    clients = rooms.get(room, set())
    return next((s for s in clients if s != sid), None)

# Socket.IO Events
@sio.event
def connect(sid, environ):
    logger.debug(f"Client connected: {sid}")

@sio.event
def join(sid, data):
    name = data.get('name')
    room = data.get('room')
    if not name or not room:
        logger.warning("Join failed: missing name or room")
        return

    # Add client to room
    if room not in rooms:
        rooms[room] = set()
    rooms[room].add(sid)

    sio.save_session(sid, {'name': name, 'room': room})
    logger.info(f"{name} joined room {room}")

    # Notify others in room that someone is online
    other = get_other(sid, room)
    if other:
        sio.emit('peer_joined', {'name': name}, room=other)
        sio.emit('online', {'name': name}, room=sid)  # tell self who’s already there

@sio.event
def typing(sid, data):
    try:
        session = sio.get_session(sid)
        room = session['room']
        other = get_other(sid, room)
        if other:
            sio.emit('typing', {'name': session['name']}, room=other)
    except Exception as e:
        logger.error(f"Error in typing event: {e}")

@sio.event
def message(sid, data):
    try:
        session = sio.get_session(sid)
        room = session['room']
        other = get_other(sid, room)
        sender = session['name']

        if other:
            sio.emit('message', {
                'sender': sender,
                'ciphertext': data['ciphertext'],
                'timestamp': data.get('timestamp')
            }, room=other)
            logger.debug(f"Relayed message from {sender} in room {room}")
    except Exception as e:
        logger.error(f"Error in message event: {e}")

@sio.event
def disconnect(sid):
    try:
        session = sio.get_session(sid)
        name = session.get('name', 'Unknown')
        room = session.get('room')

        if room and room in rooms:
            rooms[room].discard(sid)
            if len(rooms[room]) == 0:
                del rooms[room]
                logger.info(f"Room {room} closed.")
            else:
                # Notify other user
                other = next(iter(rooms[room]), None)
                if other:
                    sio.emit('peer_left', {'name': name}, room=other)
                    logger.info(f"{name} left. Notified peer in room {room}.")
        logger.info(f"Disconnected: {sid}")
    except Exception as e:
        logger.error(f"Error in disconnect: {e}")

# Routes
@app.route('/')
def index():
    logger.info("Serving /")
    try:
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Failed to render index.html: {e}")
        raise


# --- START THE SERVER ---
if __name__ == '__main__':
    import eventlet
    import eventlet.wsgi
    import traceback

    print("🔍 Checking environment...")
    print("✅ Logging enabled (DEBUG level)")
    print("🚀 Starting Mask Chat server on http://localhost:5000")
    print("💡 Press Ctrl+C to exit")

    try:
        # Final check: ensure templates/ folder exists
        import os
        if not os.path.exists('templates') or not os.path.exists('templates/index.html'):
            print("❌ ERROR: 'templates/index.html' not found!")
            print("   Make sure you have a 'templates' folder with 'index.html' inside.")
            exit(1)

        # Start server
        eventlet.wsgi.server(eventlet.listen(('', 5000)), app)

    except ImportError as e:
        print("❌ Missing package:")
        print(f"   {e}")
        print("👉 Run: pip install flask python-socketio eventlet")
    except PermissionError:
        print("❌ Port 5000 is in use or requires admin rights.")
        print("👉 Try running on another port: change ('', 5000) to ('', 8080)")
    except Exception as e:
        print(f"❌ Unexpected server error: {e}")
        print("Full traceback:")
        traceback.print_exc()