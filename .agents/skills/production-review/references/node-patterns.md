# Node.js Production Anti-Patterns

Concrete patterns that cause production incidents in Node.js services. Organized by framework, then general Node.js patterns.

---

## Express

### Missing Helmet

Express sets almost no security headers by default. Without `helmet`, every response is missing HSTS, CSP, X-Content-Type-Options, and other critical headers.

```javascript
// BAD: No security headers
const app = express();
app.use(cors());
app.use(express.json());
// Every response is missing security headers

// GOOD: Helmet adds security headers with sensible defaults
const helmet = require('helmet');
const app = express();
app.use(helmet());  // adds 11 security headers
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));  // also limit body size
```

**Detection**: Grep for `require('helmet')` or `import helmet`. If absent from an Express project, flag it as HIGH.

### No Rate Limiting

Express has no built-in rate limiting. Without it, your auth endpoints are vulnerable to brute force and your API is vulnerable to abuse.

```javascript
// BAD: No rate limiting on any endpoint
app.post('/auth/login', async (req, res) => {
  // attacker can try millions of passwords
});

// GOOD: Rate limiting with express-rate-limit
const rateLimit = require('express-rate-limit');

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window
  standardHeaders: true,     // return rate limit info in headers
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests' },
});

// Strict rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                    // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
  message: { error: 'rate_limited', message: 'Too many login attempts' },
});

app.use(globalLimiter);
app.post('/auth/login', authLimiter, loginHandler);
app.post('/auth/register', authLimiter, registerHandler);
app.post('/auth/reset-password', authLimiter, resetHandler);
```

**Detection**: Grep for `express-rate-limit`, `rate-limit`, or `rateLimit`. If absent, flag it.

### Error Handling Anti-Patterns

Express error handling is the source of most production crashes. Missing error middleware, unhandled async errors, and improper error responses.

```javascript
// BAD: Async error crashes the process (Express 4 — no async support)
app.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);  // if this throws, unhandled rejection
  res.json(user);
});

// BAD: Error middleware in the wrong position
app.use(errorHandler);    // too early — routes below won't use it
app.get('/users', ...);

// BAD: Error handler exposes internals
app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message,
    stack: err.stack,       // exposes internal paths and code
    query: err.query,       // exposes SQL queries
  });
});

// GOOD: Async wrapper for Express 4 (Express 5 handles this natively)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'not_found', message: 'User not found' });
  }
  res.json(user);
}));

// GOOD: Error handler at the end, with safe response
// Register AFTER all routes
app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';

  // Log the full error for debugging
  logger.error('unhandled_error', {
    error: err.message,
    stack: err.stack,
    requestId,
    method: req.method,
    path: req.path,
  });

  // Return safe error to client
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'internal_error' : 'request_error',
    message: status >= 500 ? 'Internal server error' : err.message,
    requestId,
  });
});
```

**Detection**: Grep for `async` route handlers without `asyncHandler` wrapper (Express 4). Check if error middleware is registered after all routes. Look for `err.stack` in response bodies.

### Missing Body Size Limits

Without limits, an attacker can send a multi-gigabyte JSON body and crash the process with OOM.

```javascript
// BAD: No body size limit
app.use(express.json());

// GOOD: Explicit size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// For file uploads, use multer with limits
const multer = require('multer');
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB
    files: 5,                     // max 5 files
  },
});
```

**Detection**: Grep for `express.json()` and check for `limit` parameter. If no limit is set, flag it.

---

## Fastify

### Schema Validation Gaps

Fastify's schema validation is opt-in per route. Routes without schemas accept any input, bypassing Fastify's core security advantage.

```javascript
// BAD: No schema — accepts any input
fastify.post('/users', async (request, reply) => {
  const user = await createUser(request.body);  // body is unvalidated
  return user;
});

// GOOD: Full schema validation
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'name'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        role: { type: 'string', enum: ['user', 'admin'] },
      },
      additionalProperties: false,  // reject unexpected fields
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  },
}, async (request, reply) => {
  const user = await createUser(request.body);
  reply.status(201).send(user);
});
```

**Detection**: Look for Fastify route definitions without `schema` property. Any route missing a schema for its body, querystring, or params is a gap.

### Missing Graceful Shutdown

Fastify has built-in graceful shutdown support, but it must be wired up. Without it, in-flight requests are terminated on deploy.

```javascript
// BAD: No shutdown handling
fastify.listen({ port: 3000 });

// GOOD: Graceful shutdown with signal handling
const closeGracefully = async (signal) => {
  fastify.log.info({ signal }, 'shutting_down');

  // Stop accepting new connections
  await fastify.close();

  // Clean up resources
  await db.end();
  await redis.quit();

  process.exit(0);
};

process.on('SIGTERM', closeGracefully);
process.on('SIGINT', closeGracefully);

// Also configure Fastify's built-in timeout
await fastify.listen({
  port: 3000,
  host: '0.0.0.0',
});
```

### Missing Error Handler Customization

```javascript
// BAD: Default error handler exposes Fastify internals
// (default behavior sends error.message which may contain SQL or stack info)

// GOOD: Custom error handler
fastify.setErrorHandler((error, request, reply) => {
  const requestId = request.id;

  if (error.validation) {
    // Fastify validation error
    reply.status(400).send({
      error: 'validation_error',
      message: 'Invalid request',
      details: error.validation,
      requestId,
    });
    return;
  }

  // Log full error for debugging
  request.log.error({ err: error, requestId }, 'unhandled_error');

  // Return safe error to client
  const status = error.statusCode || 500;
  reply.status(status).send({
    error: status >= 500 ? 'internal_error' : 'request_error',
    message: status >= 500 ? 'Internal server error' : error.message,
    requestId,
  });
});
```

---

## General Node.js Anti-Patterns

### Unhandled Promise Rejections

In Node.js 15+, unhandled promise rejections crash the process by default. Even in older versions, they indicate real bugs — an async error that nobody is handling.

```javascript
// BAD: Unhandled rejection — will crash the process
async function processOrder(orderId) {
  const order = await db.orders.findById(orderId);
  await paymentService.charge(order);  // if this throws, unhandled rejection
  await emailService.sendConfirmation(order);
}
// Called without .catch():
processOrder(orderId);  // no error handling

// BAD: Promise.all without error handling
async function refreshAll(userIds) {
  await Promise.all(userIds.map(id => refreshUser(id)));
  // if any single refresh fails, Promise.all rejects and the rest are abandoned
}

// GOOD: Always handle async errors
async function processOrder(orderId) {
  try {
    const order = await db.orders.findById(orderId);
    await paymentService.charge(order);
    await emailService.sendConfirmation(order);
  } catch (error) {
    logger.error('order_processing_failed', { orderId, error: error.message });
    throw error;  // re-throw for the caller to handle
  }
}

// GOOD: Promise.allSettled for operations that should not fail together
async function refreshAll(userIds) {
  const results = await Promise.allSettled(
    userIds.map(id => refreshUser(id))
  );
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    logger.warn('partial_refresh_failure', {
      total: userIds.length,
      failed: failures.length,
      errors: failures.map(f => f.reason.message),
    });
  }
}

// SAFETY NET: Global handler (log and alert, do not swallow)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('unhandled_rejection', { reason: reason?.message || reason });
  // In production, you may want to exit and let the orchestrator restart
  // process.exit(1);
});
```

**Detection**: Grep for `process.on('unhandledRejection')` — if absent, there is no safety net. Also look for `.then()` without `.catch()`, and fire-and-forget async calls (calling an async function without `await` or `.catch()`).

### Event Loop Blocking

Any synchronous operation that takes more than 50ms blocks the event loop and stalls all other connections. This is the most common cause of Node.js performance degradation.

```javascript
// BAD: Synchronous file read blocks event loop
const data = fs.readFileSync('/path/to/large/file.json');

// BAD: Synchronous JSON parsing of large payloads
const bigObject = JSON.parse(hugeString);  // blocks if hugeString is megabytes

// BAD: CPU-intensive operation on main thread
function hashPasswords(users) {
  return users.map(u => bcrypt.hashSync(u.password, 12));  // blocks for seconds
}

// BAD: Synchronous crypto
const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');

// GOOD: Async file operations
const data = await fs.promises.readFile('/path/to/large/file.json', 'utf8');

// GOOD: Async crypto
const hash = await new Promise((resolve, reject) => {
  crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, key) => {
    if (err) reject(err);
    else resolve(key);
  });
});

// GOOD: Use worker threads for CPU-intensive operations
const { Worker } = require('worker_threads');

async function hashPasswordsInWorker(users) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./hash-worker.js', { workerData: users });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

// GOOD: Use bcrypt's async version
const hash = await bcrypt.hash(password, 12);
```

**Detection**: Grep for `Sync(` — any function ending in `Sync` is a blocking call (`readFileSync`, `writeFileSync`, `execSync`, `hashSync`, `pbkdf2Sync`). In production code, every single one is a potential bottleneck.

### Memory Leaks from Closures and Event Listeners

Node.js memory leaks often come from closures that hold references to large objects, or event listeners that are added but never removed.

```javascript
// BAD: Closure holds reference to large response object
const cache = new Map();

app.get('/data/:id', async (req, res) => {
  const data = await fetchLargeDataset(req.params.id);
  cache.set(req.params.id, data);  // grows unbounded, never evicted
  res.json(data);
});

// BAD: Event listener added per request, never removed
app.get('/stream/:id', (req, res) => {
  const handler = (data) => {
    res.write(JSON.stringify(data));
  };
  eventEmitter.on('update', handler);  // added per request, never removed
  // after the response ends, handler still fires, referencing dead res object
});

// BAD: setInterval without cleanup
app.get('/monitor', (req, res) => {
  const interval = setInterval(() => {
    const status = getStatus();
    // if this endpoint is called 1000 times, 1000 intervals are running
  }, 1000);
});

// GOOD: Bounded cache with TTL
const LRU = require('lru-cache');
const cache = new LRU({ max: 1000, ttl: 1000 * 60 * 5 });  // max 1000 items, 5min TTL

app.get('/data/:id', async (req, res) => {
  let data = cache.get(req.params.id);
  if (!data) {
    data = await fetchLargeDataset(req.params.id);
    cache.set(req.params.id, data);
  }
  res.json(data);
});

// GOOD: Remove event listener when response ends
app.get('/stream/:id', (req, res) => {
  const handler = (data) => {
    res.write(JSON.stringify(data));
  };
  eventEmitter.on('update', handler);

  req.on('close', () => {
    eventEmitter.removeListener('update', handler);
  });
});

// GOOD: Clear intervals on cleanup
let monitorInterval;

function startMonitoring() {
  monitorInterval = setInterval(() => {
    collectMetrics();
  }, 1000);
}

function stopMonitoring() {
  clearInterval(monitorInterval);
}

process.on('SIGTERM', stopMonitoring);
```

**Detection**: Grep for `new Map()` or `= {}` at module level — these are potential unbounded caches. Grep for `.on(` without a corresponding `.removeListener(` or `.off(`. Look for `setInterval` without `clearInterval`.

### Missing AbortController on Fetch

`fetch` (and `node-fetch`) have no default timeout. A slow or hung upstream service will keep the connection open indefinitely, consuming memory and file descriptors.

```javascript
// BAD: No timeout on fetch — hangs forever if upstream is slow
const response = await fetch('https://api.example.com/data');

// BAD: No timeout on node-fetch
const fetch = require('node-fetch');
const response = await fetch('https://api.example.com/data');

// GOOD: AbortController with timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);  // 5 second timeout

try {
  const response = await fetch('https://api.example.com/data', {
    signal: controller.signal,
  });
  const data = await response.json();
  return data;
} catch (error) {
  if (error.name === 'AbortError') {
    logger.warn('fetch_timeout', { url: 'https://api.example.com/data' });
    throw new Error('Request timed out');
  }
  throw error;
} finally {
  clearTimeout(timeout);
}

// GOOD: AbortSignal.timeout (Node.js 18+, modern browsers)
const response = await fetch('https://api.example.com/data', {
  signal: AbortSignal.timeout(5000),
});

// GOOD: Reusable fetch wrapper with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```

**Detection**: Grep for `fetch(` calls and check if they include `signal` in the options. Any `fetch` without a signal or timeout is a potential hang.

### Missing Graceful Shutdown

Without graceful shutdown, deploys kill in-flight requests, drop database connections without cleanup, and leave background jobs in an inconsistent state.

```javascript
// BAD: No shutdown handling — process.exit() kills everything immediately
const server = app.listen(3000);

// GOOD: Graceful shutdown
const server = app.listen(3000, () => {
  logger.info('server_started', { port: 3000 });
});

async function gracefulShutdown(signal) {
  logger.info('shutdown_initiated', { signal });

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('http_server_closed');
  });

  // 2. Set a hard deadline — force exit if graceful shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    logger.error('forced_shutdown', { reason: 'graceful shutdown timed out' });
    process.exit(1);
  }, 30000);  // 30 seconds
  forceExitTimeout.unref();  // don't keep process alive just for this timer

  // 3. Finish in-flight work
  try {
    await drainMessageQueue();
    await db.end();           // close database pool
    await redis.quit();       // close Redis connection
    await cache.close();
  } catch (error) {
    logger.error('shutdown_cleanup_error', { error: error.message });
  }

  logger.info('shutdown_complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Detection**: Grep for `process.on('SIGTERM')` and `process.on('SIGINT')`. If absent, the service has no graceful shutdown. Also check that `server.close()` is called before `process.exit()`.

### Improper Error Responses

```javascript
// BAD: Returns 200 with error body
app.post('/users', async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.json(user);
  } catch (error) {
    res.json({ error: error.message });  // status 200 with error — breaks clients
  }
});

// BAD: Exposes internal details
app.use((err, req, res, next) => {
  res.status(500).json({
    message: err.message,       // might contain SQL or internal paths
    stack: err.stack,           // full stack trace
    query: err.sql,             // raw SQL query
  });
});

// GOOD: Proper status codes, safe error messages
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

app.post('/users', asyncHandler(async (req, res) => {
  const existing = await db.users.findByEmail(req.body.email);
  if (existing) {
    throw new AppError(409, 'email_taken', 'This email is already registered');
  }
  const user = await createUser(req.body);
  res.status(201).json(user);
}));

app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || req.id;
  const status = err.statusCode || 500;

  logger.error('request_error', {
    requestId,
    status,
    error: err.message,
    stack: err.stack,  // log it, don't send it
    path: req.path,
  });

  res.status(status).json({
    error: err.code || 'internal_error',
    message: status >= 500 ? 'Internal server error' : err.message,
    requestId,
  });
});
```

### Connection Pool Mismanagement

```javascript
// BAD: New database connection per request
app.get('/users', async (req, res) => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const result = await client.query('SELECT * FROM users');
  await client.end();  // not reached on error — connection leak
  res.json(result.rows);
});

// GOOD: Connection pool shared across requests
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // max connections in pool
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if pool is exhausted
});

app.get('/users', async (req, res) => {
  const result = await pool.query('SELECT * FROM users');
  res.json(result.rows);
});

// Clean up pool on shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
```

**Detection**: Grep for `new Client(` or `new pg.Client(` inside route handlers — this creates a connection per request. Look for `new Pool(` at module level (correct) vs inside a function (incorrect, creates a new pool per call).

---

## Detection Checklist for Reviewers

Quick grep commands to run on any Node.js codebase:

```bash
# Security
rg "require\('helmet'\)" --type js --type ts       # missing = no security headers
rg "express-rate-limit" --type js --type ts          # missing = no rate limiting
rg "cors\(\)" --type js --type ts                    # cors() with no options = allow all
rg "origin.*['\"]\\*['\"]" --type js --type ts       # wildcard CORS

# Event loop blocking
rg "Sync\(" --type js --type ts                      # any sync call blocks event loop
rg "JSON\.parse" --type js --type ts                  # check if parsing untrusted large input

# Memory leaks
rg "new Map\(\)" --type js --type ts                  # check for unbounded caches
rg "\.on\(" --type js --type ts                       # check for listener cleanup
rg "setInterval" --type js --type ts                   # check for clearInterval

# Error handling
rg "\.catch\(\s*\(\)\s*=>" --type js --type ts        # empty catch
rg "catch\s*\(.*\)\s*\{\s*\}" --type js --type ts     # empty catch block
rg "unhandledRejection" --type js --type ts            # should have a handler
rg "err\.stack" --type js --type ts                    # check not sent to client

# Missing timeouts
rg "fetch\(" --type js --type ts                       # check for signal/timeout
rg "axios\.(get|post)" --type js --type ts             # check for timeout config
rg "new Client\(" --type js --type ts                  # check if in route handler (per-request)

# Graceful shutdown
rg "SIGTERM" --type js --type ts                       # should be handled
rg "server\.close" --type js --type ts                 # should exist
rg "process\.exit" --type js --type ts                 # should be after cleanup

# Body size
rg "express\.json\(\)" --type js --type ts             # check for limit parameter
rg "bodyParser\.json\(\)" --type js --type ts          # check for limit parameter

# Secrets
rg "(password|secret|api_key|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]" --type js --type ts -i
```
