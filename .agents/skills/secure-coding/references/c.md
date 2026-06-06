# C — Secure Coding

Covers C99/C11/C17/C23 for systems, embedded, kernel-adjacent, and application code. C gives you no memory safety, no bounds checking, no type safety — essentially every security issue in C comes from the language's lack of guardrails interacting with untrusted input.

Rule of thumb: **treat every byte that crossed a trust boundary as hostile**, and treat every pointer as a loaded gun that's pointed somewhere.

## Memory safety — the big categories

### Buffer overflow (stack / heap / global)

```c
// CLASSIC: unbounded copy
char buf[64];
strcpy(buf, user_input);                  // overflow if user_input > 63

// CLASSIC: fixed buffer + format string
char buf[64];
sprintf(buf, "hello %s", user_input);     // same problem

// CLASSIC: off-by-one on NUL terminator
char buf[64];
strncpy(buf, user_input, sizeof(buf));    // if input >= 64 bytes, no NUL
buf[sizeof(buf)-1] = '\0';                // required fix
```

Safer primitives (bounded, always NUL-terminate on success):
```c
snprintf(buf, sizeof(buf), "hello %s", user_input);
strlcpy(buf, user_input, sizeof(buf));    // BSD; widely available via libbsd
```

`strncpy` is **not** a safe `strcpy` — it doesn't guarantee NUL termination and pads with NULs up to `n`. Treat it as an antipattern for modern code; prefer `snprintf` or `strlcpy`.

The C11 Annex K `_s` functions (`strcpy_s`, `memcpy_s`) are optional, inconsistent across implementations, and rejected by glibc. Don't rely on them for portability; use `snprintf` / `strlcpy` instead.

### Heap overflow and allocation mistakes

```c
// Integer overflow in allocation size
size_t n = /* from input */;
char *p = malloc(n * sizeof(elem));        // n * sizeof(elem) can wrap

// SAFE: check overflow before allocating
if (n > SIZE_MAX / sizeof(elem)) return -1;
char *p = malloc(n * sizeof(elem));
if (!p) return -1;

// Or use calloc, which checks overflow internally
char *p = calloc(n, sizeof(elem));
```

`realloc(p, 0)` is implementation-defined — may free `p` and return NULL, or return a minimal valid pointer. Always:
```c
void *np = realloc(p, new_size);
if (!np) { /* p still valid, handle error */ return -1; }
p = np;
```

### Use-after-free and double-free

```c
// BAD
free(p);
use(p);                                   // UAF

// BAD
free(p);
free(p);                                  // double free

// SAFE — set to NULL after free; free(NULL) is a no-op
free(p);
p = NULL;
```

But zeroing on free is **not** defense-in-depth against UAF if other aliases exist. UAF bugs often involve complex object lifetimes — use ASAN/UBSAN in testing to catch them.

### Format-string vulnerabilities

```c
// CRITICAL: attacker controls the format string
printf(user_input);                        // can read stack, write memory with %n
fprintf(log, user_input);
syslog(LOG_INFO, user_input);

// SAFE
printf("%s", user_input);
fprintf(log, "%s", user_input);
syslog(LOG_INFO, "%s", user_input);
```
Compile with `-Wformat-security` (and `-Werror=format-security`) to catch this at build time.

### Stack vs heap allocation of untrusted-size data

```c
// VLAs (C99) with attacker-controlled size → stack overflow
void f(size_t n) {
    char buf[n];                           // UB if n is huge; stack smash if large
}

// Bounded VLA, or just use heap
if (n > MAX_REASONABLE) return -1;
char *buf = malloc(n);
if (!buf) return -1;
```

Also: `alloca()` has the same risk as VLAs and no way to check failure. Prefer heap allocation with explicit failure handling.

## Integer issues

### Signed overflow is undefined behavior

```c
// UB: signed overflow
int a = INT_MAX;
int b = a + 1;                             // UB, compiler may assume it can't happen

// SAFE — use unsigned, or checked arithmetic
if (a > INT_MAX - 1) return -1;
int b = a + 1;

// Or use __builtin_add_overflow (GCC/Clang)
int b;
if (__builtin_add_overflow(a, 1, &b)) return -1;
```

Compile with `-fsanitize=undefined` in CI to catch UB. In production builds of security-sensitive code, `-ftrapv` (GCC) or explicit checks are safer than relying on wrap.

### Unsigned underflow

```c
size_t len = strlen(s);
size_t diff = needed - len;                // underflows if len > needed
memcpy(dst, src, diff);                    // huge memcpy
```

Always check: `if (len > needed) { /* handle */ }` before subtraction.

### Narrowing / sign conversion

```c
int n = get_from_input();
char c = n;                                // narrowing; value-dependent on UB in C99
size_t sz = n;                             // if n < 0, wraps to huge unsigned
memcpy(dst, src, sz);                      // giant copy
```

Always validate sign and range before converting. `-Wsign-conversion` and `-Wconversion` help.

## String handling

- `gets()` — removed in C11; never use. `fgets(buf, sizeof(buf), stdin)` replaces it.
- `scanf("%s", buf)` — unbounded; use `scanf("%63s", buf)` with explicit width or `fgets`.
- `strcat`/`strncat` — bounds semantics differ from `strcpy`/`strncpy`. `strncat(dst, src, n)` writes **up to `n` bytes**, then appends NUL — so destination must be at least `strlen(dst) + n + 1`. Most "safe strncat" bugs are this miscount.
- `atoi` / `atol` / `atof` — no error reporting; `strtol`/`strtoul`/`strtod` with `errno` checks are correct.

## Command injection and subprocess

```c
// UNSAFE: shell parses user input
char cmd[256];
snprintf(cmd, sizeof(cmd), "convert %s out.png", filename);
system(cmd);

// SAFE: argv form via fork/exec
pid_t pid = fork();
if (pid == 0) {
    execl("/usr/bin/convert", "convert", filename, "out.png", (char*)NULL);
    _exit(127);
}
```

`popen("cmd | other")` goes through `/bin/sh` — same injection risk as `system`. Prefer `pipe()` + `fork()` + `execvp()` with argv lists.

## Path traversal

```c
// UNSAFE: user controls part of the path
char path[256];
snprintf(path, sizeof(path), "/var/data/%s", user_name);  // user_name="../../etc/passwd"
fopen(path, "r");

// SAFE: canonicalize and verify containment
char resolved[PATH_MAX];
if (!realpath(path, resolved)) { /* handle */ }
const char *base = "/var/data/";
if (strncmp(resolved, base, strlen(base)) != 0) { /* reject */ }
```

`realpath(path, NULL)` (POSIX.1-2008) allocates the result — remember to `free()` it. On Linux, `openat` with `O_NOFOLLOW` / `RESOLVE_BENEATH` (Linux 5.6+, `openat2`) enforces containment at the syscall level.

## Race conditions (TOCTOU)

```c
// TOCTOU: check, then use, are not atomic
if (access(path, R_OK) == 0) {             // attacker swaps file here
    fd = open(path, O_RDONLY);             // opens different file
}

// Better: open first, then check fd properties via fstat
fd = open(path, O_RDONLY | O_NOFOLLOW);
if (fd < 0) { /* handle */ }
struct stat st;
fstat(fd, &st);
if (!permitted(&st)) { close(fd); /* reject */ }
```

`O_NOFOLLOW` on the last component prevents symlink attacks on it. For intermediate components, use `openat` with a dirfd.

`mktemp()` / `tmpnam()` create race conditions. Use `mkstemp()` (atomic create with O_EXCL).

## Crypto

- Never roll your own. Use a vetted library: OpenSSL / LibreSSL / BoringSSL, libsodium (easiest API, harder to misuse), mbedTLS (embedded).
- `rand()` / `random()` — predictable, not for crypto. Use `getrandom()` (Linux), `arc4random_buf()` (BSD/macOS), `BCryptGenRandom` (Windows), or `RAND_bytes()` (OpenSSL).
- AES: use AEAD modes (GCM, ChaCha20-Poly1305). Avoid raw AES-CBC (needs a separate MAC; padding-oracle-prone if you roll decrypt yourself).
- Constant-time comparison: use `CRYPTO_memcmp` (OpenSSL) or `sodium_memcmp` (libsodium). `memcmp` leaks timing.
- Erase secrets after use: `memset(buf, 0, n)` can be optimized away — use `memset_s`, `explicit_bzero`, or `SecureZeroMemory` (Windows).

## File I/O

- `fopen(path, "w")` follows symlinks. `open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0600)` is safer for creating new files.
- Temporary files: `mkstemp` + `O_EXCL` semantics ensure atomic unique creation.
- `umask(0077)` before creating files that should be private.

## Environment and privilege

- `setuid` programs: validate `argv[0]`, clear the environment (`clearenv()`), don't trust `$PATH`. Use `execve` with an explicit environment, not `execvp` (which consults `$PATH`).
- Drop privileges permanently with `setresuid(uid, uid, uid)` (Linux). Check return values — missing a check here is a classic privilege-escalation bug.
- `getenv()` returns pointer to environment block which can change on later `setenv` — copy before use.

## Threading and concurrency

- Race conditions on shared data = memory corruption + exploitable state. Use `pthread_mutex_*` or C11 `mtx_*`.
- `volatile` does NOT provide atomicity — use `_Atomic` types (C11) or `atomic_*` operations.
- Signal handlers: only call async-signal-safe functions. `printf`, `malloc`, `free` are not — a signal during `malloc` reentering `malloc` = heap corruption.

## Compiler hardening

Compile with:
```
-Wall -Wextra -Wformat -Wformat-security -Werror=format-security
-Wstrict-overflow -Wconversion -Wsign-conversion
-D_FORTIFY_SOURCE=3                         # glibc: runtime checks for strcpy/memcpy/etc
-fstack-protector-strong                    # stack canaries
-fstack-clash-protection                    # probe stack on allocation
-fcf-protection=full                        # Intel CET
-fPIE -pie                                  # ASLR for executable
-Wl,-z,relro,-z,now                         # RELRO
-Wl,-z,noexecstack                          # NX stack
```

In CI, run with ASAN (`-fsanitize=address`), UBSAN (`-fsanitize=undefined`), MSAN (`-fsanitize=memory`, Clang only) — they catch most memory bugs that tests would otherwise miss.

## Static and dynamic analysis

- Static: Clang Static Analyzer, `scan-build`, Coverity, CodeQL. Run on every PR.
- Dynamic: Valgrind (memcheck), ASAN, AFL++/libFuzzer for fuzzing. Fuzz every parser that sees untrusted input — it's the single highest-ROI security practice in C.
- Sanitizers are dev/test tools; don't ship ASAN to production (it expands memory usage and has its own attack surface). `_FORTIFY_SOURCE` and stack protectors are production-appropriate.

## Network code

- `recv`/`read` can return short — always loop until you have the expected bytes or handle EOF.
- Parsers: count every byte, check lengths against buffer size before copying. One-line fix for many CVEs is `if (len > remaining) return -1;`.
- Integer casts in network code: network order is unsigned; `htons`/`ntohs`/`htonl`/`ntohl` are required on multi-byte fields. Casting before converting is a bug.
- `inet_addr` returns `INADDR_NONE` on error — looks like `255.255.255.255`. Use `inet_pton` which returns 1 on success, 0 on bad input.

## Logging

- Don't `printf` user data directly (format string). Always `printf("%s", user_data)`.
- Don't log secrets (keys, tokens, passwords). Zero them after use.
- Rotate logs; if logs are parsed by other tools, sanitize CR/LF in user data to prevent log injection.

## Language-specific footguns

- `if (a = b)` vs `if (a == b)` — `-Wparentheses` catches most. Use `if (b == a)` ("Yoda conditions") when comparing against constants.
- `switch` fallthrough with no `break` — `-Wimplicit-fallthrough` + `__attribute__((fallthrough))` or `[[fallthrough]]` (C23) marks intentional cases.
- `sizeof(ptr)` returns pointer size, not buffer size. Using `memset(ptr, 0, sizeof(ptr))` zeroes 8 bytes, not the buffer.
- `sizeof` on a char array inside a struct/function argument decays to pointer — loses size info. Track size alongside buffer.
- `realloc(ptr, 0)` — implementation-defined; don't rely on it to mean free. Call `free` if size is 0.
- Function pointers: declaring function prototypes incorrectly leads to argument promotion issues (varargs). Use `-Wmissing-prototypes` and include the headers that declare functions you call.
- `long` vs `int` vs `size_t` — varies across platforms (LP64 vs LLP64). Use `stdint.h` fixed-width types (`uint32_t`, `int64_t`) for protocol/wire code.
- `char` signedness is implementation-defined — `int x = buf[i];` may sign-extend on some platforms. Cast through `unsigned char` when reading bytes.
- `errno` persists across successful calls. Clear it (`errno = 0`) before calling a function that sets it; check right after the call, not later.

## Review checklist

1. Compile with `-Wall -Wextra -Wformat-security -D_FORTIFY_SOURCE=3 -fstack-protector-strong`
2. Run ASAN + UBSAN in CI; fuzz any parser
3. No `strcpy`, `strcat`, `sprintf`, `gets`, `scanf` without width, `system`, `popen` with user input
4. No `printf(user)` / `fprintf(f, user)` / `syslog(lvl, user)` — always with `"%s"`
5. Allocation sizes checked for overflow (`calloc`, or explicit `SIZE_MAX` check)
6. All `malloc`/`realloc` return values checked for NULL
7. Every pointer dereference follows a NULL / bounds check
8. Integer arithmetic on external input uses `__builtin_*_overflow` or explicit bounds check
9. String copies go through `snprintf` or `strlcpy`; results NUL-terminated
10. `fork/exec` (not `system`/`popen`) for subprocess; argv form never concatenates user input
11. `open` with `O_NOFOLLOW` + canonicalized path for untrusted paths
12. TOCTOU avoided — open/fstat, not access/open
13. `getrandom`/`arc4random`/`RAND_bytes` for cryptographic randomness; never `rand`
14. Secrets zeroed with `explicit_bzero`/`memset_s`
15. `O_EXCL | O_CREAT` or `mkstemp` for temp files; `umask(0077)` set
16. `_FORTIFY_SOURCE`, stack canaries, RELRO, NX, ASLR enabled in release builds
