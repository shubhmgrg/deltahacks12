## MongoDB Atlas (recommended)

### 1) Create `backend/.env`

Create `backend/.env` (don’t commit this file):

```bash
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
DB_NAME="deltahacks12"
PORT=3001
```

### 2) Ensure Atlas allows your connection

- **Network Access**: allow your IP (or `0.0.0.0/0` temporarily for a hackathon)
- **Database Access**: create a database user + password

### 3) Start the backend

```bash
npm run backend:dev
```

### 4) Verify Mongo is reachable

Open:
- `http://localhost:3001/health`

You should see `{ ok: true, mongo: "up" }`.

## Simple Mock UI (Next.js)

Run the Next app (in another terminal):

```bash
cd delta
npm run dev
```

Then open:
- `http://localhost:3000/mock`
