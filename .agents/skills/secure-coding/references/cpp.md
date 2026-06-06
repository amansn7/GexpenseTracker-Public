# C++ — Secure Coding

Covers C++17, C++20, and C++23. C++ inherits all of C's memory-safety problems — plus a few new ones from templates, exceptions, and implicit conversions. The payoff is that modern C++ gives you genuine tools (RAII, smart pointers, `std::span`, `std::string_view`, ranges) to write memory-safe code by default.

Rule of thumb: **if your C++ looks like C, you're writing C with extra steps**. Use the library.

For foundational memory-safety, integer overflow, and compiler hardening guidance, also consult `c.md` — everything there applies to C++ too.

## Memory safety

### Use RAII, never raw `new`/`delete`

```cpp
// BAD: manual ownership, easy to leak or double-free
Widget* w = new Widget();
// ... 50 lines, exceptions, early returns ...
delete w;

// GOOD: unique ownership
auto w = std::make_unique<Widget>();   // freed automatically

// GOOD: shared ownership (only when really needed)
auto w = std::make_shared<Widget>();

// GOOD: on-stack, never leaks
Widget w;
```

`std::make_unique` / `std::make_shared` are preferred over `new` because they're exception-safe — `new Widget()` followed by passing to a constructor that then throws can leak the raw pointer.

Raw `new`/`delete` should appear only in library internals, never in application code.

### Avoid dangling references and iterators

```cpp
// DANGLING: returning reference to local
std::string_view foo() {
    std::string s = compute();
    return s;                           // UB: view points to destroyed string
}

// DANGLING: iterator invalidation
std::vector<int> v{1,2,3};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it == 2) v.push_back(99);      // push_back may reallocate → it invalidated
}
```

`std::string_view` and `std::span` are non-owning — they're only safe if the owner outlives them. Be especially careful with function return types: returning `string_view` from a function that constructs a `string` is a common UAF.

Clang's `-Wdangling-gsl` and `-Wreturn-stack-address` catch some cases.

### Prefer bounds-checked access for untrusted indices

```cpp
// UB on out-of-range
v[idx];                                 // no check
*p;                                     // no check

// Bounds-checked
v.at(idx);                              // throws std::out_of_range
if (idx < v.size()) { /* safe to use v[idx] */ }

// std::span gives size-aware view over raw arrays
void f(std::span<const uint8_t> bytes) {
    for (auto b : bytes) { /* bounds tracked */ }
}
```

For performance-critical code, validate at the boundary and use `operator[]` once you've checked — just don't skip the check.

### Use `std::string` / `std::string_view` instead of raw char arrays

```cpp
// C-style, vulnerable to overflows
char buf[64];
strncpy(buf, input, sizeof(buf));       // no NUL guarantee

// Modern C++
std::string buf = input;                // grows as needed, NUL-terminated

// Non-owning view, no copy
void process(std::string_view sv);
```

### Integer issues — same as C, with C++ twists

Signed overflow is still UB. `size_t` arithmetic can still underflow.

C++ adds implicit conversions that are easy to miss:
```cpp
// Implicit narrowing
int n = get_input();
char c = n;                             // narrows, no warning by default

// Brace-init prevents narrowing
char c{n};                              // compile error if narrowing possible
```

Prefer brace-init (`Type x{val}`) over `Type x = val` or `Type x(val)` — it's strictest about narrowing and avoids most-vexing-parse ambiguities.

`auto` vs explicit types: when reading from a container of `size_t`, `int n = v.size()` quietly narrows. `auto` is often safer here, but be aware that `auto x = 0` is `int`, not `size_t`.

## Exceptions

- Prefer exception-safe resource management (RAII). Don't throw from destructors — it terminates the program if another exception is in flight.
- `noexcept` on functions that can't throw enables optimizations but lying about it and throwing anyway calls `std::terminate`. Don't mark a function `noexcept` if it can throw.
- Functions doing I/O should either report errors via exceptions or via `std::expected` / `outcome` / error codes — mixing styles leads to skipped checks.
- `new` can throw `std::bad_alloc`. `new (std::nothrow) Widget()` returns nullptr on failure — but then you have to actually check.

## Type safety

### Avoid C-style casts

```cpp
// C-style cast is any of: static_cast, const_cast, reinterpret_cast, or a mix
int* p = (int*)ptr;                     // loses type info, unsafe

// Be explicit
int* p = static_cast<int*>(ptr);        // compile-time checked conversion
int* p = reinterpret_cast<int*>(ptr);   // no type check — only when needed
```

`reinterpret_cast` should be rare in application code; it's a signal that type safety has been abandoned. `const_cast` removing `const` on actually-const data is UB.

### Don't alias types incompatibly (strict aliasing)

```cpp
// UB: accessing memory through an incompatible pointer type
uint32_t v = 0x12345678;
float f = *reinterpret_cast<float*>(&v);

// SAFE: use std::bit_cast (C++20), or memcpy
float f = std::bit_cast<float>(v);
// or
float f;
std::memcpy(&f, &v, sizeof(f));
```

`std::bit_cast` (C++20) is the modern type-safe reinterpret.

## Templates and generic code

- SFINAE and concepts (C++20): prefer concepts for constraining templates — clearer, better errors, less chance of overlooking a bad specialization.
- Template-heavy code can produce surprising code paths where validation gets specialized away. Test with concrete types that exercise boundary behaviors.
- Don't put `using namespace std;` in headers — ADL and name collisions cause subtle bugs, some of which can shadow validation functions.

## Injection and subprocess

C++ has the same `system`/`popen` issues as C. Use `fork`/`exec*` directly, or library wrappers like Boost.Process / reproc that enforce argv form:
```cpp
boost::process::child c("/usr/bin/convert", filename, "out.png");
```

For SQL, use a prepared-statement interface (sqlpp11, SOCI, your framework's ORM). Never concatenate SQL strings.

## Crypto

Same as C: never roll your own. Use libsodium (recommended for application crypto), OpenSSL/BoringSSL, Botan, or Crypto++.

`std::random_device` on Linux/macOS is OK for seeding; on older libstdc++ it was deterministic on MinGW. For cryptographic randomness, always use a named crypto library's CSPRNG (`randombytes_buf` from libsodium, `RAND_bytes` from OpenSSL).

`std::hash` is NOT cryptographic — don't use it for password storage, MACs, or any security decision.

## STL and standard-library pitfalls

- `std::map::operator[]` inserts a default-constructed value if the key is absent — can surprise in lookup code. Use `find` or `at`.
- `std::vector::data()` returns a pointer that's invalidated by reallocation. Store size too.
- `std::string::c_str()` is valid only until the next non-const operation on the string.
- `std::shared_ptr` cycles leak memory (not a security issue, but a DoS). Use `std::weak_ptr` for back-pointers.
- `std::thread::detach()` without joining: if the thread outlives the objects it references, UAF. Prefer `std::jthread` (C++20) or explicit join.
- Range-based `for` over a temporary: `for (auto& x : get_vec())` where `get_vec` returns by value — fine until C++23 makes this safer, but `for (auto& x : f().vec)` was UB (dangling) before C++23.
- `std::optional::value_or` evaluates the argument eagerly. Use `or_else` (C++23) when the fallback is expensive.
- `std::format` (C++20): parameterized format strings — safer than `printf` but still don't format untrusted format strings. Use `std::vformat` with runtime format strings only when you control them.

## Modern C++ specifics (C++20/23)

- Ranges (`std::ranges`): generally safer than iterator pairs because views can't be mixed across containers. But range-adaptor views that borrow from temporaries can dangle.
- Coroutines: lifetimes of captured references across `co_await` are subtle. Don't capture by reference to locals that may go out of scope during suspension.
- Modules: largely orthogonal to security, but module partitions can hide initialization order bugs. Be explicit about dependencies.
- `constexpr` / `consteval`: compile-time computation reduces attack surface. Prefer for constants derived at build time.

## Smart pointer pitfalls

```cpp
// BAD: two unique_ptrs owning the same raw pointer → double free
Widget* raw = new Widget();
std::unique_ptr<Widget> a(raw);
std::unique_ptr<Widget> b(raw);         // now both free it

// BAD: shared_ptr from raw pointer in multiple places
auto a = std::shared_ptr<Widget>(raw);
auto b = std::shared_ptr<Widget>(raw);  // two control blocks, double-free

// GOOD: only one owner creates the smart pointer
auto a = std::make_unique<Widget>();
auto b = std::move(a);                   // transfer ownership

// GOOD: shared, single source
auto a = std::make_shared<Widget>();
auto b = a;                              // shares control block
```

## Undefined behavior and sanitizers

UB in C++ enables miscompilation: the compiler can assume UB doesn't happen and eliminate checks you wrote. Example: signed overflow is UB, so `if (x + 1 < x)` can be optimized to `if (false)`.

Always compile tests with:
```
-fsanitize=address,undefined
```

Clang also provides `-fsanitize=memory` and `-fsanitize=thread`. Run fuzzers (libFuzzer, AFL++) on any code path that parses untrusted input.

## Compiler hardening

Same flags as C (see `c.md`):
```
-Wall -Wextra -Wformat-security -Wconversion -Wsign-conversion
-Wold-style-cast -Wcast-align -Wshadow
-D_FORTIFY_SOURCE=3
-fstack-protector-strong -fstack-clash-protection
-fcf-protection=full
-fPIE -pie -Wl,-z,relro,-z,now -Wl,-z,noexecstack
```

C++-specific: enable `-Wnon-virtual-dtor`, `-Woverloaded-virtual` to catch common polymorphism mistakes that lead to slicing / UAF.

MSVC: `/W4 /WX /GS /guard:cf /permissive-` and `/sdl` for security development lifecycle warnings.

## Build and supply chain

- Pin dependency versions (vcpkg.json, Conan profiles, Bazel WORKSPACE).
- Don't pull headers/sources over plain HTTP. Verify signatures / hashes where possible.
- Don't use `#include` of user-controlled files via the preprocessor — preprocessor injection → code execution at compile time.
- `popen`, `system`, shell interpolation — same guidance as C.

## Standard library security-relevant classes

- `std::regex`: catastrophic backtracking on adversarial patterns. If users control the regex, use `std::regex_constants::ECMAScript` and watch for patterns with nested quantifiers. Consider `RE2` (Google's regex engine, linear-time) for untrusted regexes.
- `std::filesystem`: path operations don't inherently resolve symlinks or check containment. Use `std::filesystem::canonical` + containment check, same pattern as C's `realpath`.
- `std::chrono`: no direct security issue, but don't roll your own time parsing; format strings in `std::format` time formatting are safer than `strftime`.

## Language footguns

- Object slicing: `Base b = derived_obj;` silently truncates the derived part. If security logic lives in overrides, slicing skips it. Use pointers / references to polymorphic objects.
- Virtual destructor required on base classes of polymorphic hierarchies — otherwise `delete basePtr` where `basePtr` points to a Derived invokes UB.
- Copy vs move: accidental copy of a `unique_ptr` member is a compile error; accidental copy of a large resource is a perf issue, not a security one, but the surprise is similar. `[[nodiscard]]`-annotated return types help catch accidents.
- Implicit conversions: `Widget w = 42;` if `Widget` has a non-`explicit` int constructor. Make single-arg constructors `explicit`.
- `operator new` overloads can be hijacked globally in a TU and change allocation behavior. Review any `operator new` / `operator delete` overrides for security impact.
- Default `operator==` and `<=>` (C++20) compare all members — easy, but may leak timing info on memcmp-like comparisons for crypto data. Use constant-time compare (`CRYPTO_memcmp`, etc.) for secrets.
- `const_cast<>` to modify a `const`-declared object is UB (not just the cast — the modification). Compile-time assertions won't catch it; it's a runtime footgun.
- Static locals have one-time-init semantics — thread-safe in C++11+ — but global constructor order across translation units is undefined (SIOF — "static initialization order fiasco"). Don't rely on globals being initialized when needed; use function-local statics.

## Review checklist

1. No `new`/`delete` in application code; use `make_unique` / `make_shared` / stack allocation
2. No raw `char[]` with unbounded APIs; use `std::string` / `std::span` / `std::string_view`
3. No `string_view`/`span` returning from functions that own the underlying storage
4. All `at()` / `data()` with untrusted indices bounds-checked
5. No C-style casts; use `static_cast` / `reinterpret_cast` / `bit_cast` / `const_cast` explicitly
6. `explicit` on single-arg constructors
7. Polymorphic bases have virtual destructors
8. No `system`/`popen` with user input; use `fork`+`exec` / Boost.Process / reproc
9. ASAN + UBSAN in CI; fuzz parsers of untrusted input
10. `-Wall -Wextra -Wformat-security -D_FORTIFY_SOURCE=3 -fstack-protector-strong`
11. Crypto via libsodium / OpenSSL / Botan; no hand-rolled primitives
12. Constant-time compare for secrets; `explicit_bzero` after use
13. Smart pointers never initialized from the same raw pointer twice
14. `std::regex` with user-controlled patterns replaced by RE2 where feasible
15. Filesystem paths canonicalized and containment-checked
16. `noexcept` correctness audited; destructors don't throw
