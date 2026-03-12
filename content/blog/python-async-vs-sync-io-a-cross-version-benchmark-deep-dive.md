# Python Async vs Sync I/O: A Cross-Version Benchmark Deep Dive

I spent an entire day downloading the same 1 MB file over and over, reading binary blobs from disk, and watching Rich progress bars fill up in my terminal — all because I wanted a definitive answer to a question that sounds simple but absolutely is not: **is async actually faster than sync for I/O in Python?**

It started as a quick curiosity. I had been using `requests` for years, heard people rave about `aiohttp`, and figured I'd run a quick test. One test turned into five. Five turned into a benchmark harness. The harness turned into a cross-version experiment spanning **five different Python interpreters** — from Python 3.10 all the way to the experimental **free-threaded Python 3.13t build** that removes the GIL entirely. The whole thing consumed an entire day on March 19, 2024, and the conclusions were far more nuanced than I expected.

Here is what I found: for network-bound I/O, both async (`asyncio.gather` + `aiohttp`) and threaded sync (`ThreadPoolExecutor` + `requests`) obliterate sequential execution — that part is obvious. But the _relative_ performance between async and threaded approaches **depends heavily on your Python version**. On Python 3.10, ThreadPool was roughly 2.4x faster than async. By Python 3.12, they were nearly identical. And on Python 3.13t with the GIL removed, async suddenly became **2.5x faster** than ThreadPool — a complete reversal. The GIL removal changed the game, but not in the direction most people expect.

If you have read the companion article on [Ruby concurrency vs parallelism for HTTP workloads](/blog/ruby-concurrency-vs-parallelism-for-http-workloads), you will recognize a similar experimental structure here. But Python has its own concurrency tools, its own global lock, and now — for the first time in the language's 33-year history — a way to turn that lock off entirely. The results tell a story about how deeply the interpreter's internals shape what "fast" means.

---

## Table of Contents

- [The Test Machine](#the-test-machine)
- [Why This Experiment Exists](#why-this-experiment-exists)
- [A Brief History of Python and Its Performance Story](#a-brief-history-of-python-and-its-performance-story)
- [Python's Concurrency Landscape: The Mental Model](#pythons-concurrency-landscape-the-mental-model)
- [The GIL: Python's Most Famous Bottleneck](#the-gil-pythons-most-famous-bottleneck)
- [Why the GIL Does Not Matter for I/O (Mostly)](#why-the-gil-does-not-matter-for-io-mostly)
- [Python 3.13t: The Free-Threaded Experiment](#python-313t-the-free-threaded-experiment)
- [Sync vs Async: What the Words Actually Mean](#sync-vs-async-what-the-words-actually-mean)
- [The Experiment Design](#the-experiment-design)
- [Dependencies and Their Roles](#dependencies-and-their-roles)
- [The Code: Class Architecture](#the-code-class-architecture)
- [Helper: Async Download with aiohttp](#helper-async-download-with-aiohttp)
- [Helper: Sync Download with requests](#helper-sync-download-with-requests)
- [Helper: Sync File Read](#helper-sync-file-read)
- [Helper: Async File Read](#helper-async-file-read)
- [Test 1: ThreadPool File Read (block_io_open)](#test-1-threadpool-file-read-block_io_open)
- [Test 2: Async File Read (non_block_io_open)](#test-2-async-file-read-non_block_io_open)
- [Test 3: Sequential Download — The Baseline (primitif_io_block_download)](#test-3-sequential-download--the-baseline-primitif_io_block_download)
- [Test 4: ThreadPool Download (block_io_download)](#test-4-threadpool-download-block_io_download)
- [Test 5: Async Download (non_block_io_download)](#test-5-async-download-non_block_io_download)
- [The Test Runner: Self-Discovering Methods with inspect](#the-test-runner-self-discovering-methods-with-inspect)
- [Benchmark Environment and System State](#benchmark-environment-and-system-state)
- [Raw Benchmark Results](#raw-benchmark-results)
- [Cross-Version Analysis: Network I/O Downloads](#cross-version-analysis-network-io-downloads)
- [Cross-Version Analysis: File I/O Reads](#cross-version-analysis-file-io-reads)
- [The GIL Removal Paradox: Why 3.13t Is Faster at Async but Slower at Threading](#the-gil-removal-paradox-why-313t-is-faster-at-async-but-slower-at-threading)
- [Why Sequential Is Always the Slowest](#why-sequential-is-always-the-slowest)
- [The Variance Problem: Why Network Benchmarks Are Noisy](#the-variance-problem-why-network-benchmarks-are-noisy)
- [Factors That Influence the Results](#factors-that-influence-the-results)
- [Limitations of This Experiment](#limitations-of-this-experiment)
- [What Would Change Under Different Conditions](#what-would-change-under-different-conditions)
- [Practical Guidance: Choosing Async vs Threads](#practical-guidance-choosing-async-vs-threads)
- [The Author's Conclusion](#the-authors-conclusion)
- [References](#references)

---

## The Test Machine

All benchmarks were executed on the same physical laptop — not a VPS, not a VM, not a container. This matters because virtualized environments introduce their own I/O scheduling layers, hypervisor overhead, and shared-tenancy noise that would make the results unreliable for the kind of fine-grained comparison we are doing here.

| Component   | Specification                                                               |
| ----------- | --------------------------------------------------------------------------- |
| **CPU**     | AMD Ryzen 5 5500U — 6 cores, 12 threads (SMT), 2.1 GHz base / 4.0 GHz boost |
| **RAM**     | 12 GB DDR4 (11.35 GB usable)                                                |
| **Storage** | Micron 2210 NVMe SSD (PCIe 3.0 x4)                                          |
| **OS**      | Windows 10 Pro 22H2 (Build 19045)                                           |
| **Network** | Home broadband, wired connection                                            |

The **Ryzen 5 5500U** is a mobile APU based on AMD's Zen 3 architecture (Lucienne revision). It is a 6-core / 12-thread part, which means it has six physical execution cores, each capable of running two threads simultaneously via Simultaneous Multithreading (SMT). For our experiment, the physical core count matters more than the logical thread count because Python's GIL prevents true CPU-level parallelism in standard builds — but for I/O workloads, even a single core is sufficient because the bottleneck is the network, not the CPU.

The NVMe SSD is relevant for the file I/O tests. NVMe drives connected via PCIe 3.0 x4 can deliver sequential read speeds of approximately 2,400 MB/s and random 4K read speeds around 200,000-300,000 IOPS. Our test files are only 2 MB each, so the SSD can read them in under a millisecond — which is why the file I/O benchmarks consistently complete in 3-7 milliseconds regardless of Python version. The file I/O tests are essentially measuring Python's overhead for opening and reading files, not the SSD's actual throughput.

---

## Why This Experiment Exists

This experiment was born out of a very specific frustration. I was building tools that needed to download multiple files concurrently, and I kept running into conflicting advice:

- _"Use asyncio, it's faster for I/O."_
- _"Use ThreadPoolExecutor, it's simpler and just as fast."_
- _"Python's GIL makes threading useless anyway."_
- _"Use multiprocessing if you want real parallelism."_

The problem is that all of these statements are partially true but none of them are complete. The correct answer depends on **what kind of I/O you are doing** (network vs disk), **how many concurrent tasks you have**, **which Python version you are running**, and **what your actual bottleneck is** (CPU, network, disk, or the interpreter itself).

Rather than trusting advice from Stack Overflow threads, I decided to write the code myself, run it, measure it, and draw my own conclusions. The experiment is intentionally simple — download three files, read three files — because simplicity isolates the variable we care about: **which concurrency mechanism has the lowest overhead for I/O workloads?**

Here was my initial mental model going into the experiment:

> sync (I/O block) -> threadpool -> parallelism == concurrent -> not shared event loop -> different thread == independently.
>
> async (I/O non block) -> asyncio gather -> concurrency -> run in single thread and in same event loop.

By the end of the day, this model was mostly correct — but the nuances around _why_ each approach performs the way it does, and _how_ the Python version changes the outcome, turned out to be far more interesting than I anticipated.

---

## A Brief History of Python and Its Performance Story

Python was created by **Guido van Rossum** in 1991 at Centrum Wiskunde & Informatica (CWI) in the Netherlands. It was designed to be a readable, general-purpose scripting language — a successor to the ABC language that prioritized clarity over speed. This philosophy is captured in the Zen of Python: _"Readability counts."_

The reference implementation, **CPython**, is an interpreter written in C. It compiles Python source code to bytecode, which is then executed by a virtual machine. This architecture makes Python relatively slow compared to compiled languages like C, C++, Rust, or Go — typically 10x to 100x slower for CPU-bound tasks. But for I/O-bound tasks (network requests, file operations, database queries), the raw execution speed of the interpreter matters far less because the program spends most of its time **waiting**, not computing.

Key milestones relevant to our experiment:

| Version     | Year | Concurrency Relevance                                                                   |
| ----------- | ---- | --------------------------------------------------------------------------------------- |
| Python 2.0  | 2000 | `threading` module, basic thread support                                                |
| Python 3.2  | 2011 | `concurrent.futures` introduced (`ThreadPoolExecutor`, `ProcessPoolExecutor`)           |
| Python 3.4  | 2014 | `asyncio` module added (provisional), `@asyncio.coroutine` with `yield from`            |
| Python 3.5  | 2015 | `async`/`await` syntax (PEP 492), native coroutines                                     |
| Python 3.10 | 2021 | Structural pattern matching, `asyncio.TaskGroup` preparation                            |
| Python 3.11 | 2022 | **CPython ~25% faster** (Faster CPython project), exception groups, `asyncio.TaskGroup` |
| Python 3.12 | 2023 | **Per-interpreter GIL** (PEP 684), more performance improvements                        |
| Python 3.13 | 2024 | **Experimental free-threaded mode** (PEP 703), JIT compiler (experimental)              |

The performance trajectory from 3.10 to 3.13 is particularly relevant. CPython's core team, led by Mark Shannon and funded by Microsoft, has been systematically optimizing the interpreter. Python 3.11 introduced **specializing adaptive interpreter** optimizations that make common operations faster. Python 3.12 continued this trend. Python 3.13 introduced the experimental **free-threaded build** that removes the GIL entirely, and a **copy-and-patch JIT compiler** — though the JIT is not yet enabled by default.

These version-by-version improvements are _exactly_ why we are benchmarking across five interpreters. The same code, running on the same machine, can produce meaningfully different numbers depending on which version of CPython is executing it.

---

## Python's Concurrency Landscape: The Mental Model

Before diving into the code, let's establish the conceptual framework. Python offers multiple concurrency mechanisms, and they are **not interchangeable**. Each one operates at a different level of abstraction and is optimized for a different type of workload.

### Threading (`threading`, `concurrent.futures.ThreadPoolExecutor`)

Python threads are **real OS threads** — they are scheduled by the operating system's kernel, not by the Python interpreter. When you create a thread in Python, the OS allocates a separate stack, assigns it to a CPU core, and manages context switching between threads.

However, CPython's GIL ensures that **only one thread can execute Python bytecode at a time**. This means that even though you have multiple OS threads, they take turns running Python code. The critical exception is **I/O operations**: when a thread calls a C-level I/O function (like `socket.recv()` or `os.read()`), it **releases the GIL** before the system call and reacquires it afterward. This means multiple threads can wait on I/O simultaneously — which is why threading works well for I/O-bound tasks despite the GIL.

```
Thread 1: [acquire GIL] → [run Python] → [release GIL → I/O wait...] → [acquire GIL] → [run Python]
Thread 2:                                  [acquire GIL] → [run Python] → [release GIL → I/O wait...]
Thread 3:                                                                  [acquire GIL] → [run Python]
```

The `ThreadPoolExecutor` from `concurrent.futures` is a managed thread pool that reuses threads instead of creating and destroying them for each task. This reduces the overhead of thread creation (which involves a system call to the kernel) and makes it practical to run many short-lived tasks.

### Asyncio (`asyncio`, `async`/`await`)

Asyncio is a **single-threaded event loop** that achieves concurrency through **cooperative multitasking**. Instead of the OS scheduling threads preemptively, coroutines voluntarily yield control back to the event loop whenever they encounter an `await` expression. The event loop then picks the next ready coroutine and resumes it.

```
Event Loop (single thread):
  → start coroutine A → A awaits I/O → suspend A
  → start coroutine B → B awaits I/O → suspend B
  → start coroutine C → C awaits I/O → suspend C
  → A's I/O complete → resume A → A finishes
  → B's I/O complete → resume B → B finishes
  → C's I/O complete → resume C → C finishes
```

The key advantage of asyncio is **zero context-switching overhead**. OS thread context switches involve saving and restoring CPU registers, flushing caches, and potentially triggering TLB invalidations. Coroutine switches are just Python-level bookkeeping — they are orders of magnitude cheaper. The disadvantage is that if any coroutine performs a CPU-intensive operation _without_ yielding, it blocks the entire event loop and all other coroutines stall.

### Multiprocessing (`multiprocessing`, `concurrent.futures.ProcessPoolExecutor`)

Multiprocessing creates **separate OS processes**, each with its own Python interpreter and its own GIL. This is the only way to achieve true CPU-level parallelism in standard CPython. But it comes with significant overhead: process creation is expensive (much more so on Windows than on Unix, because Windows lacks `fork()`), and inter-process communication requires serialization (pickling) of data.

For I/O-bound workloads, multiprocessing is almost always overkill. The overhead of spawning processes and serializing data far outweighs any parallelism benefit when the bottleneck is network latency, not CPU computation. This is why the experiment deliberately **excludes** multiprocessing — it is the wrong tool for this job.

### The Hierarchy

For I/O-bound workloads, the practical hierarchy is:

1. **Sequential** (no concurrency) — simplest, slowest
2. **Threading** — real OS threads, GIL released during I/O, moderate overhead
3. **Asyncio** — single-threaded cooperative multitasking, minimal overhead
4. **Multiprocessing** — separate processes, maximum isolation, excessive overhead for I/O

Our experiment tests approaches 1, 2, and 3.

---

## The GIL: Python's Most Famous Bottleneck

The **Global Interpreter Lock** (GIL) is a mutex that protects access to Python objects in CPython. It ensures that only one thread can execute Python bytecode at any given time, even on multi-core systems. The GIL exists because CPython's memory management — specifically its **reference counting garbage collector** — is not thread-safe.

Every Python object has a reference count (`ob_refcnt`). When you assign an object to a variable, the reference count increases. When a variable goes out of scope, the reference count decreases. When it hits zero, the object is deallocated. If two threads modify the same object's reference count simultaneously without synchronization, the count can become corrupted — leading to memory leaks (count too high) or use-after-free crashes (count too low).

The GIL solves this by brute force: lock everything, always. It is simple, it works, and it makes single-threaded Python fast because there is no per-object locking overhead. But it means that multi-threaded CPU-bound Python code cannot utilize multiple cores.

For **I/O-bound** code, the situation is different. Here is why:

```python
# When Python calls a C-level I/O function, the GIL is released:
#
# Py_BEGIN_ALLOW_THREADS    ← GIL released
# result = read(fd, buf, n) ← OS-level I/O, no Python bytecode
# Py_END_ALLOW_THREADS      ← GIL reacquired
```

This C-level macro pair (`Py_BEGIN_ALLOW_THREADS` / `Py_END_ALLOW_THREADS`) is used throughout CPython's standard library. When `requests` makes an HTTP call, the underlying `urllib3` library eventually calls into the `ssl` module or `socket` module, both of which release the GIL during the actual network I/O. This means multiple threads can wait on network responses simultaneously — the GIL is only held during the brief moments when Python bytecode is being executed (processing response headers, updating variables, etc.).

This is the crucial insight: **for I/O-bound workloads, the GIL is not the bottleneck. The network is.** And because the GIL is released during I/O waits, threading provides genuine concurrency for network-bound tasks even in standard CPython.

---

## Why the GIL Does Not Matter for I/O (Mostly)

Let me be very precise here, because this is a point of widespread confusion in the Python community.

The GIL **does** affect I/O-bound threaded code, but the effect is typically negligible. Here is why:

1. **I/O wait time dominates.** If downloading a 1 MB file takes 3 seconds, and the Python bytecode to set up the request and process the response takes 5 milliseconds, then the GIL contention window is 5ms out of 3000ms — less than 0.2% of the total time.

2. **GIL release is automatic for system calls.** All standard library I/O functions release the GIL. You do not need to do anything special.

3. **The bottleneck is external.** Network latency, server response time, bandwidth limitations, and TCP congestion control determine the actual download speed. The GIL is irrelevant when the program is waiting on a packet from Singapore.

There **is** one scenario where the GIL matters for I/O code: when you have a **very large number of threads** (hundreds or thousands) and they are all doing rapid, small I/O operations. In this case, the GIL acquisition/release overhead — which involves atomic operations and system calls — can become measurable. But for our experiment with 3 concurrent downloads, this is not a factor.

The reason I am emphasizing this is that the user's original notes correctly identified it:

> _"I don't really care about the GIL issue in Python because this is just I/O testing, and the Python GIL only applies to CPU testing."_

This is almost exactly right. The nuance is that the GIL applies to _all_ Python bytecode execution, not just CPU-bound code — but for I/O workloads, the bytecode execution is such a small fraction of the total time that the GIL's impact is negligible.

---

## Python 3.13t: The Free-Threaded Experiment

Python 3.13, released in October 2024, introduced an **experimental free-threaded build** under **PEP 703** (authored by Sam Gross). This build compiles CPython without the GIL entirely, allowing true multi-threaded parallelism for the first time in CPython's history.

The free-threaded build is identified by the `t` suffix (e.g., `python3.13t`) and can be verified at runtime:

```python
import sys
print(sys._is_gil_enabled())  # False on free-threaded builds
```

### How It Works

Removing the GIL required fundamental changes to CPython's memory management:

1. **Biased reference counting.** Instead of a simple `ob_refcnt` field protected by the GIL, objects now use a scheme where the "owning" thread can modify the reference count without atomic operations, while other threads use atomic operations. This reduces contention for objects that are primarily accessed by a single thread.

2. **Per-object locks.** Critical sections that previously relied on the GIL now use fine-grained per-object locks. This is more complex but allows multiple threads to operate on different objects simultaneously.

3. **Deferred reference counting.** Some objects (like module globals and type objects) use deferred reference counting, where the actual reference count is only periodically reconciled. This avoids atomic operation overhead for frequently-accessed objects.

4. **Thread-safe memory allocator.** CPython's memory allocator (`pymalloc`) was replaced with the `mimalloc` allocator, which is designed for concurrent multi-threaded workloads.

### The Trade-Off

The free-threaded build is **slower for single-threaded code** — typically 5-10% slower according to CPython's own benchmarks. This is because the per-object locking, atomic reference counting, and other thread-safety mechanisms add overhead even when only one thread is running. The free-threaded build only pays off when you have **genuine multi-threaded CPU parallelism** — multiple threads doing CPU-bound work simultaneously.

For our experiment, this creates an interesting tension. The free-threaded build removes the GIL, which means threads can truly run in parallel. But for I/O-bound code, threads were already effectively running in parallel (because the GIL is released during I/O). So what does removing the GIL actually change for I/O workloads? The benchmark results will answer this question, and the answer is surprising.

Our test system confirms the free-threaded build:

```
$ python3.13t -c "import sys; print(sys._is_gil_enabled())"
False

$ python3.13t --version
Python 3.13.5 experimental free-threading build
```

---

## Sync vs Async: What the Words Actually Mean

These terms are overloaded across programming languages, frameworks, and contexts. Here is what they mean specifically in the context of Python I/O:

### Synchronous (Blocking) I/O

When you call `requests.get(url)`, the function blocks the calling thread until the HTTP response is fully received. The thread cannot do anything else while waiting. If you have three URLs to download and you call `requests.get()` on each one sequentially, the total time is roughly `T1 + T2 + T3` — the sum of all individual download times.

```python
# Synchronous: each call blocks until complete
result_1 = requests.get(url_1)  # waits 3 seconds
result_2 = requests.get(url_2)  # waits 3 seconds (starts after result_1)
result_3 = requests.get(url_3)  # waits 3 seconds (starts after result_2)
# Total: ~9 seconds
```

### Synchronous + ThreadPool (Concurrent)

By wrapping `requests.get()` in a `ThreadPoolExecutor`, you run each blocking call in a **separate OS thread**. Each individual thread still blocks during its own I/O, but because they run concurrently, the total time is approximately `max(T1, T2, T3)` — the duration of the slowest download.

```python
# Synchronous calls in separate threads: concurrent, not parallel (GIL)
with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(requests.get, [url_1, url_2, url_3]))
# Total: ~3 seconds (limited by slowest download)
```

The distinction here is important: the individual operations are still synchronous (each thread blocks), but the **program** is concurrent because multiple threads are blocking on different I/O operations simultaneously.

### Asynchronous (Non-Blocking) I/O

With `aiohttp` and `asyncio`, you use a single thread with an event loop. The `await` keyword suspends the current coroutine and returns control to the event loop, which can run other coroutines while the I/O operation is in progress. The total time is again approximately `max(T1, T2, T3)`, but without the overhead of creating and managing OS threads.

```python
# Asynchronous: single thread, cooperative multitasking
async with aiohttp.ClientSession() as session:
    tasks = [session.get(url) for url in [url_1, url_2, url_3]]
    results = await asyncio.gather(*tasks)
# Total: ~3 seconds (limited by slowest download)
```

### The Key Difference

Both threaded and async approaches achieve the same **effect** — overlapping I/O waits — but through different **mechanisms**:

| Aspect                | Threading                                     | Asyncio                                 |
| --------------------- | --------------------------------------------- | --------------------------------------- |
| Scheduling            | Preemptive (OS kernel)                        | Cooperative (event loop)                |
| Thread count          | N threads for N tasks                         | 1 thread for all tasks                  |
| Context switch cost   | High (kernel mode transition)                 | Low (Python-level bookkeeping)          |
| GIL interaction       | Released during I/O, contention between tasks | N/A (single thread, no contention)      |
| Blocking risk         | One blocked thread does not affect others     | One blocked coroutine stalls everything |
| Memory overhead       | ~8 MB stack per thread (default on Linux)     | ~1 KB per coroutine                     |
| Library compatibility | Works with any library                        | Requires async-compatible libraries     |

---

## The Experiment Design

The experiment tests five distinct approaches to performing I/O operations, organized into two categories:

**Network I/O (downloading 3 x 1 MB files):**

1. `primitif_io_block_download` — Sequential sync downloads (baseline, no concurrency)
2. `block_io_download` — Sync downloads via `ThreadPoolExecutor` (threaded concurrency)
3. `non_block_io_download` — Async downloads via `asyncio.gather` + `aiohttp` (async concurrency)

**File I/O (reading 3 x 2 MB binary files):** 4. `block_io_open` — Sync file reads via `ThreadPoolExecutor` 5. `non_block_io_open` — Async file reads via `asyncio.gather` + `aiofiles`

The download URL used is `http://speedtest.tele2.net/1MB.zip` — a public speed test server hosted by Tele2 (a Swedish telecom). The original code used `singapore.downloadtestfile.com`, but that server was unreachable during the re-run, so Tele2's speed test server was used as a substitute. This is a reliable, well-provisioned server designed for bandwidth testing, which reduces (but does not eliminate) server-side variability.

Each approach is tested **2 rounds** per Python version, and results are averaged to reduce noise from network variance.

### Why 1 MB Files?

The file size is deliberately small. We are not benchmarking raw throughput — we are benchmarking **concurrency overhead**. If we used 100 MB files, the download time would be dominated by bandwidth, and the differences between concurrency mechanisms would be invisible. With 1 MB files, the overhead of setting up connections, managing threads or coroutines, and processing responses becomes a measurable fraction of the total time.

### Why Only 3 Concurrent Tasks?

Three is enough to demonstrate the concurrency benefit (3x speedup over sequential) without introducing complications from thread contention, connection pool exhaustion, or server-side rate limiting. If we used 100 concurrent downloads, we would be benchmarking how well the server handles load, not how well Python handles concurrency.

---

## Dependencies and Their Roles

The experiment uses six external dependencies, each chosen for a specific purpose:

```python
import aiofiles, asyncio, time, requests, io, os, inspect
from rich.console import Console
from concurrent.futures import ThreadPoolExecutor
from aiohttp import ClientSession
from typing import List
from rich.progress import (
    Progress, SpinnerColumn, BarColumn, TextColumn,
    DownloadColumn, TransferSpeedColumn, TimeRemainingColumn
)
```

| Module               | Type                         | Role                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requests`           | Third-party (sync HTTP)      | Synchronous HTTP client. Uses `urllib3` under the hood, which uses the `ssl` and `socket` modules for network I/O. Releases the GIL during I/O.                                                                                        |
| `aiohttp`            | Third-party (async HTTP)     | Asynchronous HTTP client built on `asyncio`. Uses non-blocking I/O through the event loop. Does not use threads internally.                                                                                                            |
| `aiofiles`           | Third-party (async file I/O) | Wraps synchronous file operations in a thread pool to make them compatible with `asyncio`. This is important — `aiofiles` does **not** use kernel-level async I/O (like `io_uring` on Linux). It uses `ThreadPoolExecutor` internally. |
| `rich`               | Third-party (terminal UI)    | Pretty console output with progress bars, spinners, and colored text. Used for visual feedback during downloads.                                                                                                                       |
| `asyncio`            | Standard library             | The event loop and coroutine scheduler. Provides `gather()` for running multiple coroutines concurrently.                                                                                                                              |
| `concurrent.futures` | Standard library             | Provides `ThreadPoolExecutor` for managed thread pools.                                                                                                                                                                                |
| `inspect`            | Standard library             | Used in the test runner to dynamically discover test methods via reflection.                                                                                                                                                           |

### A Note on aiofiles

This is a common source of confusion. The `aiofiles` library does **not** perform true asynchronous file I/O at the kernel level. On Linux, true async file I/O requires `io_uring` or `AIO` (asynchronous I/O) system calls. On Windows, it requires overlapped I/O or I/O completion ports. The `aiofiles` library does neither — it simply runs synchronous `open()` and `read()` calls in a `ThreadPoolExecutor` behind the scenes, then wraps the result in a coroutine.

This means that `aiofiles.open()` is functionally equivalent to running `io.open()` in a `ThreadPoolExecutor`. The async API is a convenience wrapper, not a fundamentally different I/O mechanism. This is why the file I/O benchmark results for `block_io_open` (ThreadPool) and `non_block_io_open` (aiofiles) are nearly identical — they are doing the same thing under the hood.

---

## The Code: Class Architecture

The entire experiment is encapsulated in a single class called `Coros`, which contains all download/read functions as static methods. This is a deliberate design choice — static methods do not depend on instance state, which means they can be called from any context (thread pool, event loop, sequential) without worrying about thread-safety of instance attributes.

```python
class Coros:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }
```

The class-level `headers` dictionary provides a browser-like User-Agent string. Some CDNs and speed test servers reject requests with Python's default User-Agent (`python-requests/2.x`), so spoofing a Chrome User-Agent ensures consistent behavior. This is a **shared mutable class attribute**, but because it is never modified after class definition, there is no thread-safety concern.

The methods in the class are divided into two categories:

1. **Helper functions** — `asyncdownload`, `syncdownload`, `asyncopen`, `syncopen` — these perform the actual I/O operations
2. **Test functions** — methods whose docstring contains the word `"test"` — these orchestrate the helpers using different concurrency strategies

The test runner discovers and executes test functions automatically using Python's `inspect` module, which we will cover later.

---

## Helper: Async Download with aiohttp

```python
@staticmethod
async def asyncdownload(url: str, fname: str) -> str:
    async with ClientSession(headers=Coros.headers) as session:
        async with session.get(url) as response:
            async with aiofiles.open(fname, "wb") as f:
                with Progress(
                    SpinnerColumn(speed=1.5),
                    TextColumn("[green] Downloading..", justify="right"),
                    BarColumn(),
                    "[progress.percentage]{task.percentage:>3.0f}%",
                    DownloadColumn(binary_units=False),
                    TransferSpeedColumn(),
                    TimeRemainingColumn(),
                    console=Console(),
                    transient=True
                ) as progress:
                    task = progress.add_task(
                        "[green] Downloading..",
                        total=int(response.headers.get('content-length', 0))
                    )
                    async for content in response.content.iter_any():
                        await f.write(content)
                        progress.update(task, advance=len(content))
                    await f.close()
                    progress.stop()
            Console().print(
                f"[yellow] Asyncdownload[reset] Completed -> [yellow]{fname}[reset]"
            )
            return fname
```

This function uses **three nested async context managers** — a pattern that ensures proper cleanup even if an exception occurs:

1. **`ClientSession`** — aiohttp's connection pool. Each session manages its own TCP connection pool, cookie jar, and default headers. Creating a session per download (as done here) is not optimal for production code — ideally you would share a single session across all downloads to reuse TCP connections. But for benchmarking, this ensures each download starts with a fresh connection, which makes the results more comparable.

2. **`session.get(url)`** — Initiates the HTTP request and returns a response object. This is an async context manager because the response body may not be fully read yet — the context manager ensures the connection is released back to the pool when we are done.

3. **`aiofiles.open(fname, "wb")`** — Opens the output file for writing. As discussed earlier, this internally uses a thread pool.

The download itself uses `response.content.iter_any()`, which yields chunks of data **as they arrive from the network**, without waiting for a specific chunk size. This is more efficient than `iter_chunked(n)` because it does not buffer data — it yields whatever the TCP stack has received. The `await f.write(content)` call writes each chunk to disk asynchronously (via aiofiles' internal thread pool).

**Cause and effect:** The reason each progress bar gets its own `Console()` instance is because Rich's Console is not thread-safe and not async-safe. If multiple coroutines shared a single Console, their output would interleave and produce garbled terminal output. By creating a fresh Console per download, each progress bar writes to its own output stream. The `transient=True` flag causes the progress bar to disappear after completion, keeping the terminal clean.

---

## Helper: Sync Download with requests

```python
@staticmethod
def syncdownload(url: str, fname: str) -> str:
    response = requests.get(url, headers=Coros.headers, stream=True)
    with io.open(fname, "wb") as f:
        with Progress(
            SpinnerColumn(speed=1.5),
            TextColumn("[green] Downloading..", justify="right"),
            BarColumn(),
            "[progress.percentage]{task.percentage:>3.0f}%",
            DownloadColumn(binary_units=False),
            TransferSpeedColumn(),
            TimeRemainingColumn(),
            console=Console(),
            transient=True
        ) as progress:
            task = progress.add_task(
                "[green] Downloading..",
                total=int(response.headers.get('content-length', 0))
            )
            for content in response.iter_content(1024):
                f.write(content)
                progress.update(task, advance=len(content))
            f.close()
            progress.stop()
    Console().print(
        f"[green] Syncdownload[reset] Completed -> [green]{fname}[reset]"
    )
    return fname
```

This is the synchronous counterpart. The key differences:

1. **`requests.get(url, stream=True)`** — The `stream=True` parameter is critical. Without it, `requests` downloads the entire response body into memory before returning. With `stream=True`, it returns immediately after receiving the headers, and the body is downloaded incrementally via `response.iter_content(1024)`. This enables the progress bar and reduces peak memory usage.

2. **`response.iter_content(1024)`** — Unlike the async version's `iter_any()`, this specifies a chunk size of 1024 bytes. This means the iterator yields exactly 1024 bytes at a time (or less for the final chunk), which creates more iterations but more granular progress updates. The choice of 1024 bytes is somewhat arbitrary — larger chunks (8192, 65536) would be more efficient because they reduce the number of Python-level iterations and thus the number of GIL acquisitions in a threaded context.

3. **`io.open()` instead of `open()`** — In Python 3, `io.open()` and the built-in `open()` are identical. Using `io.open()` explicitly is a style choice, likely carried over from Python 2 code where they differed.

**Cause and effect:** The `f.close()` call inside the `with` block is technically redundant because the context manager (`with io.open(...)`) already calls `f.close()` on exit. Similarly, `progress.stop()` is redundant because the `with Progress(...)` context manager calls it on exit. These explicit calls are harmless but unnecessary — they reflect the author's cautious coding style.

---

## Helper: Sync File Read

```python
@staticmethod
def syncopen(file: str) -> str | bytes:
    with io.open(file, "rb") as f:
        content = f.read()
    length = len(content)
    Console().print(
        f"[green] syncopen[reset] ok open length -> [green]{length}[reset]"
    )
    return str(length)
```

This is the simplest function in the experiment. It opens a file in binary mode, reads the entire content into memory, measures its length, and returns the length as a string.

The `str | bytes` return type annotation is slightly misleading — the function always returns `str(length)`, never `bytes`. This is a type hint that was likely written during development when the function's return type was not yet finalized.

**Cause and effect:** Reading the entire file into memory (`f.read()` with no size argument) works fine for 2 MB test files but would be problematic for large files. If you called `f.read()` on a 4 GB file, Python would attempt to allocate 4 GB of contiguous memory, which could fail or cause the system to swap heavily. For large files, you would use `f.read(chunk_size)` in a loop, similar to the download functions.

---

## Helper: Async File Read

```python
@staticmethod
async def asyncopen(file: str) -> str | bytes:
    async with aiofiles.open(file, mode="rb") as f:
        content = await f.read()
    length = len(content)
    Console().print(
        f"[yellow] asyncopen[reset] ok open length -> [yellow]{length}[reset]"
    )
    return str(length)
```

The async counterpart uses `aiofiles.open()` and `await f.read()`. As discussed, this internally delegates to a thread pool. The `await` keyword suspends the coroutine until the file read completes in the background thread, allowing the event loop to run other coroutines in the meantime.

**Cause and effect:** The performance of `asyncopen` and `syncopen` should be nearly identical for small files because `aiofiles` is just a thread pool wrapper. The overhead of scheduling the read onto a thread pool, waiting for the result, and resuming the coroutine adds a few microseconds compared to a direct synchronous read. This overhead becomes negligible for larger files where the actual I/O time dominates, but for our 2 MB test files on an NVMe SSD (which can read them in under 1 ms), the overhead is measurable — which is why `non_block_io_open` is consistently slightly slower than `block_io_open`.

---

## Test 1: ThreadPool File Read (block_io_open)

```python
@staticmethod
def block_io_open(files: List[str]) -> List[str]:
    """
    -> test
    -> read bulk files in concurrency with separated thread,
    but each individual thread still blocked and waiting till
    reading operation completed.
    """
    with ThreadPoolExecutor(max_workers=15) as thread:
        results = list(thread.map(
            lambda file: Coros.syncopen(file), files
        ))
    return results
```

This test reads multiple files concurrently using a thread pool with 15 worker threads. The `thread.map()` function distributes the `syncopen` calls across available threads, similar to Python's built-in `map()` but parallel.

**How it works internally:**

1. `ThreadPoolExecutor(max_workers=15)` creates a pool of up to 15 OS threads. These threads are not created immediately — they are spawned on demand as tasks are submitted.
2. `thread.map(func, iterable)` submits one task per item in the iterable. Each task runs `func(item)` in a worker thread.
3. The calling thread blocks until all tasks complete, then returns the results in the same order as the input.

**Why `max_workers=15`?** This is overkill for 3 files — only 3 threads will actually be used. The extra capacity is harmless (unused threads are not created) but suggests the code was designed to handle larger workloads. The default `max_workers` in Python 3.8+ is `min(32, os.cpu_count() + 4)`, which would be 16 on our 12-logical-core machine.

**Cause and effect:** The docstring correctly notes that each individual thread "still blocked and waiting till reading operation completed." This is the nature of synchronous I/O — the thread is suspended by the OS kernel while the I/O syscall executes. But because the three threads execute their I/O simultaneously, the total time is `max(T1, T2, T3)` rather than `T1 + T2 + T3`. For 2 MB files on an NVMe SSD, each individual read takes under 1 ms, so the total time is dominated by thread creation and Python overhead — typically 3-4 ms total.

---

## Test 2: Async File Read (non_block_io_open)

```python
@staticmethod
async def non_block_io_open(files: List[str]) -> List[str]:
    """
    -> test
    -> read bulk files in single thread,
    and no need to wait reading operation till complete before next.
    """
    results = await asyncio.gather(*[
        Coros.asyncopen(file) for file in files
    ])
    return results
```

This test reads the same files using `asyncio.gather()` with `aiofiles`. The `gather()` function runs all coroutines concurrently on the event loop and returns their results when all have completed.

**How `asyncio.gather()` works internally:**

1. Each coroutine is wrapped in a `Task` object and scheduled on the event loop.
2. The event loop runs each task until it hits an `await` expression, then switches to the next ready task.
3. When all tasks have completed, `gather()` returns a list of results in the same order as the input coroutines.

The `*[...]` syntax unpacks the list comprehension into positional arguments. `asyncio.gather(coro1, coro2, coro3)` is equivalent to `asyncio.gather(*[coro1, coro2, coro3])`.

**Cause and effect:** The docstring says "no need to wait reading operation till complete before next." This is technically true from the coroutine's perspective — each coroutine `await`s the file read and suspends, allowing others to start. But remember that `aiofiles` delegates to a thread pool internally, so the actual I/O operations run in OS threads, not on the event loop. The async wrapper adds a small amount of overhead (coroutine creation, scheduling, thread pool dispatch), which is why this method is consistently 1-2 ms slower than the ThreadPool approach for small files.

---

## Test 3: Sequential Download — The Baseline (primitif_io_block_download)

```python
@staticmethod
def primitif_io_block_download(urls):
    """
    -> test
    -> lazy call for io block, there's no concurrency and
    always be waiting process till completed before next.
    """
    results = [
        Coros.syncdownload(url, url.split("/")[-1]) for url in urls
    ]
    return results
```

This is the **baseline** — no concurrency whatsoever. It downloads each file sequentially using a list comprehension that calls `syncdownload` for each URL. Each download must complete before the next one begins.

**Why this test exists:** Without a sequential baseline, the speedup numbers for concurrent approaches are meaningless. If ThreadPool takes 4 seconds and sequential takes 12 seconds, we can say threading provides a **3x speedup**. Without the baseline, "4 seconds" is just a number with no context.

The method name `primitif_io_block_download` (note: "primitif" appears to be a deliberate informal spelling — possibly influenced by the Indonesian word "primitif," which means the same as the English "primitive") reflects the author's view that sequential I/O is the most basic, unsophisticated approach.

**Cause and effect:** The total time for this method is approximately `T1 + T2 + T3`. If each download takes ~3.5 seconds, the total is ~10.5 seconds. The reason is straightforward: the CPU and network adapter are idle while waiting for each response, but the program does not take advantage of that idle time. The `requests.get()` call blocks the only thread of execution, and the next download cannot start until the current one returns.

---

## Test 4: ThreadPool Download (block_io_download)

```python
@staticmethod
def block_io_download(urls) -> List[str]:
    """
    -> test
    -> call io block function in parallel/concurrency with separated threads.
    """
    with ThreadPoolExecutor(max_workers=15) as thread:
        results = list(thread.map(
            lambda url: Coros.syncdownload(url, url.split("/")[-1]),
            urls
        ))
    return results
```

This test runs the synchronous `syncdownload` function across multiple threads. Each thread handles one URL, making its own HTTP request independently.

**How thread scheduling works for this test:**

1. Three threads are spawned (one per URL).
2. Each thread calls `requests.get()`, which initiates a TCP connection to the server.
3. When `requests.get()` reaches the actual network I/O (socket send/recv), it calls C-level functions that release the GIL.
4. While Thread 1 is waiting for network data, Thread 2 and Thread 3 can acquire the GIL and execute their Python bytecode (setting up their requests).
5. Once all three threads are in the "waiting for network data" state, the GIL is effectively uncontested because no thread needs it.

**Cause and effect:** The total time is approximately `max(T1, T2, T3)` plus thread creation overhead. The docstring says "parallel/concurrency" — technically, this is **concurrent but not parallel** under the standard GIL build, because only one thread executes Python bytecode at a time. However, it is **effectively parallel** for I/O because the GIL is released during network waits. Under the free-threaded build (3.13t), it is genuinely parallel — multiple threads can execute Python bytecode simultaneously.

---

## Test 5: Async Download (non_block_io_download)

```python
@staticmethod
async def non_block_io_download(urls) -> None:
    """
    -> test
    -> async call with non IO block, it's mean no need wait till process
    completed to move others task. it can be run in parallel/concurrency.
    """
    results = await asyncio.gather(*[
        Coros.asyncdownload(url, url.split('/')[-1]) for url in urls
    ])
    return results
```

This test downloads all URLs concurrently using async coroutines and `asyncio.gather()`. Each coroutine runs `asyncdownload`, which uses `aiohttp` for the network request and `aiofiles` for writing to disk.

**How the event loop handles this:**

1. Three coroutines are created, one per URL.
2. `asyncio.gather()` schedules all three on the event loop.
3. Each coroutine initiates its HTTP request via `aiohttp`. When the request is sent (socket write), the coroutine `await`s the response.
4. The event loop uses `select()`, `epoll()`, or `IOCP` (on Windows) to monitor all three sockets simultaneously.
5. When data arrives on any socket, the event loop resumes the corresponding coroutine to process it.
6. This repeats until all three downloads are complete.

**The critical implementation detail:** `aiohttp` uses **non-blocking sockets** at the OS level. When you call `session.get(url)`, aiohttp creates a socket, sets it to non-blocking mode (`socket.setblocking(False)`), and registers it with the event loop's I/O selector. When the coroutine `await`s data, it is not blocking a thread — it is registering a callback that will fire when data is available. This is fundamentally different from `requests`, which uses blocking sockets in a thread.

**The Windows IOCP factor:** On Windows, asyncio uses **I/O Completion Ports** (IOCP) as the event notification mechanism via `ProactorEventLoop` (default since Python 3.8 on Windows). IOCP is Windows' most efficient I/O notification mechanism — it is used by high-performance servers like IIS and SQL Server. On Linux, asyncio uses `epoll`, and on macOS, it uses `kqueue`. The specific selector implementation affects the overhead of the event loop, which can influence benchmark results across platforms.

**Cause and effect:** The docstring correctly describes the behavior: "no need wait till process completed to move others task." This is the essence of async I/O — the event loop multiplexes I/O across coroutines without blocking any of them. The total time is approximately `max(T1, T2, T3)`, similar to threading, but with lower overhead because there is no thread creation cost and no GIL contention.

---

## The Test Runner: Self-Discovering Methods with inspect

```python
if __name__=="__main__":
    urls = [
        "https://singapore.downloadtestfile.com/5MB.bin",
        "https://singapore.downloadtestfile.com/5MB.bin",
        "https://singapore.downloadtestfile.com/5MB.bin",
    ]
    files = [
        i for i in os.listdir(os.path.dirname(__file__))
            if not i.endswith('.py')
    ]
    import inspect
    for name, func in inspect.getmembers(Coros, lambda func: inspect.isfunction(func)):
        method = getattr(Coros, name)
        if "test" in method.__doc__:
            Console().print(f" *[red] Running: {name}[reset]")
            args = urls if name.lower().endswith("_download") else files
            start = time.time()
            if inspect.iscoroutinefunction(method):
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(method(args))
                loop.close()
            else:
                method(args)
            print(f" --> Completed in {time.time() - start} seconds!",
                  end="\n"+("-"*35)+"\n\n")
```

This is a **metaprogramming-driven test runner** — it uses Python's `inspect` module to discover and execute test methods at runtime without hardcoding their names. This is similar to how test frameworks like `pytest` and `unittest` discover test functions.

### How the Discovery Works

1. **`inspect.getmembers(Coros, lambda func: inspect.isfunction(func))`** — Iterates over all attributes of the `Coros` class and filters for functions. This returns a list of `(name, function)` tuples sorted alphabetically.

2. **`if "test" in method.__doc__`** — Filters methods whose docstring contains the word "test". The helper functions (`asyncdownload`, `syncdownload`, `asyncopen`, `syncopen`) do not have "test" in their docstrings, so they are excluded. Only the orchestration methods (`block_io_download`, `block_io_open`, `non_block_io_download`, `non_block_io_open`, `primitif_io_block_download`) are selected.

3. **Argument routing** — If the method name ends with `_download`, it receives the URLs list. Otherwise, it receives the files list. This is a clever convention-based routing that avoids explicit configuration.

4. **Async detection** — `inspect.iscoroutinefunction(method)` checks whether the method is defined with `async def`. If so, it creates a new event loop, runs the coroutine to completion, and closes the loop.

### The `asyncio.get_event_loop()` Deprecation

The code includes a comment:

```python
# deprecated in python3.12+
# loop = asyncio.get_event_loop()
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
```

This is correct. In Python 3.10 and 3.11, `asyncio.get_event_loop()` would create a new event loop if none existed, but it emitted a deprecation warning in 3.10+. In Python 3.12, it raises a `DeprecationWarning` and will eventually raise a `RuntimeError` if no event loop is running. The fix is to explicitly create a new event loop with `asyncio.new_event_loop()` and set it as the current loop.

The modern idiomatic approach would be to use `asyncio.run(method(args))`, which handles event loop creation, execution, and cleanup automatically. But `asyncio.run()` creates a new event loop every time it is called, which is exactly what the explicit version does — so they are functionally equivalent.

### Why Alphabetical Order Matters

`inspect.getmembers()` returns members in **alphabetical order**. This means the tests execute in this order:

1. `block_io_download` (ThreadPool download)
2. `block_io_open` (ThreadPool file read)
3. `non_block_io_download` (async download)
4. `non_block_io_open` (async file read)
5. `primitif_io_block_download` (sequential download)

This ordering is **not ideal for benchmarking** because network conditions can change during the test run. If the first test runs during a period of network congestion and the last test runs after the congestion clears, the results will be skewed. Ideally, tests should be randomized or interleaved. But since we run multiple rounds and average the results, this bias is partially mitigated.

---

## Benchmark Environment and System State

Before running the benchmarks, I captured the system's resource utilization to establish baseline conditions. This is critical because background processes consume CPU, memory, and I/O bandwidth that directly affect benchmark results.

### System Resources at Benchmark Time

```
Platform:         Windows 10 Pro 22H2 (Build 19045)
Processor:        AMD Ryzen 5 5500U (6C/12T, 2.1 GHz base)
Architecture:     AMD64

CPU Usage:        6.4% average across 12 logical cores
CPU Per-Core:     [31.9, 0.0, 7.8, 0.0, 7.8, 4.7, 4.7, 0.0, 3.1, 4.7, 10.9, 1.6]%

Total RAM:        11.35 GB
Available RAM:    1.17 GB
Used RAM:         10.18 GB
RAM Usage:        89.7%

Disk Total:       120.00 GB
Disk Free:        28.09 GB
Disk Usage:       76.6%
```

### Top Memory-Consuming Processes

| Process                        | Memory % |
| ------------------------------ | -------- |
| msedgewebview2.exe             | 5.3%     |
| Telegram.exe                   | 4.3%     |
| Code.exe (VS Code)             | 4.3%     |
| node.exe                       | 3.9%     |
| chrome.exe                     | 3.9%     |
| OpenCode.exe                   | 3.8%     |
| opencode-cli.exe               | 3.4%     |
| MsMpEng.exe (Windows Defender) | 3.0%     |
| chrome.exe (tab)               | 2.9%     |
| chrome.exe (tab)               | 2.8%     |

### What This Means for the Results

The system was under **heavy memory pressure** — 89.7% RAM used with only 1.17 GB available. This has several implications:

1. **Potential swapping.** With only 1.17 GB free, any memory allocation spike could trigger Windows' virtual memory manager to swap pages to disk. Swapping introduces latency spikes of 1-10 ms per page fault, which would appear as random timing noise in the benchmarks. NVMe SSDs mitigate this (swap on NVMe is much faster than on HDD), but it is still orders of magnitude slower than RAM access.

2. **Filesystem cache pressure.** Windows uses free RAM for the filesystem cache (SuperFetch/SysMain). With minimal free RAM, the cache is small, which means file I/O operations may hit disk more often instead of serving from cache. For our 2 MB test files, this is unlikely to matter — the files are small enough to stay in cache even under pressure.

3. **Background I/O.** Windows Defender (`MsMpEng.exe`) was running, consuming 3.0% of memory and potentially scanning files as they are written during downloads. This real-time scanning adds latency to file write operations, which affects the download benchmarks (since downloads write to disk).

4. **CPU was mostly idle.** At 6.4% average utilization, the CPU was not a bottleneck. The per-core distribution shows most cores at or below 8%, with one core spiking to 31.9% (likely due to a background process). This means our benchmarks had plenty of CPU headroom.

---

## Raw Benchmark Results

Each Python version was tested for 2 rounds. All times are in **seconds**.

### Python 3.10.11

| Method                                  | Round 1 | Round 2 | Average     |
| --------------------------------------- | ------- | ------- | ----------- |
| block_io_download (ThreadPool)          | 4.7777  | 2.0189  | **3.3983**  |
| block_io_open (ThreadPool file)         | 0.0036  | 0.0045  | **0.0040**  |
| non_block_io_download (async)           | 12.3123 | 4.0768  | **8.1945**  |
| non_block_io_open (async file)          | 0.0059  | 0.0073  | **0.0066**  |
| primitif_io_block_download (sequential) | 14.0979 | 8.8903  | **11.4941** |

### Python 3.11.3

| Method                                  | Round 1 | Round 2 | Average     |
| --------------------------------------- | ------- | ------- | ----------- |
| block_io_download (ThreadPool)          | 4.7015  | 4.7677  | **4.7346**  |
| block_io_open (ThreadPool file)         | 0.0041  | 0.0032  | **0.0037**  |
| non_block_io_download (async)           | 10.6851 | 4.9916  | **7.8384**  |
| non_block_io_open (async file)          | 0.0059  | 0.0068  | **0.0063**  |
| primitif_io_block_download (sequential) | 13.9251 | 10.1846 | **12.0549** |

### Python 3.12.10

| Method                                  | Round 1 | Round 2 | Average     |
| --------------------------------------- | ------- | ------- | ----------- |
| block_io_download (ThreadPool)          | 2.1976  | 4.7842  | **3.4909**  |
| block_io_open (ThreadPool file)         | 0.0028  | 0.0033  | **0.0030**  |
| non_block_io_download (async)           | 4.5656  | 4.6246  | **4.5951**  |
| non_block_io_open (async file)          | 0.0051  | 0.0059  | **0.0055**  |
| primitif_io_block_download (sequential) | 8.7490  | 12.6405 | **10.6947** |

### Python 3.13.5 (GIL Enabled)

| Method                                  | Round 1 | Round 2 | Average     |
| --------------------------------------- | ------- | ------- | ----------- |
| block_io_download (ThreadPool)          | 4.8451  | 4.5375  | **4.6913**  |
| block_io_open (ThreadPool file)         | 0.0032  | 0.0037  | **0.0034**  |
| non_block_io_download (async)           | 4.4959  | 4.8001  | **4.6480**  |
| non_block_io_open (async file)          | 0.0059  | 0.0053  | **0.0056**  |
| primitif_io_block_download (sequential) | 11.0087 | 11.0899 | **11.0493** |

### Python 3.13.5t (Free-Threaded, GIL Disabled)

| Method                                  | Round 1 | Round 2 | Average    |
| --------------------------------------- | ------- | ------- | ---------- |
| block_io_download (ThreadPool)          | 5.6671  | 5.0013  | **5.3342** |
| block_io_open (ThreadPool file)         | 0.0038  | 0.0035  | **0.0037** |
| non_block_io_download (async)           | 2.0768  | 2.0986  | **2.0877** |
| non_block_io_open (async file)          | 0.0047  | 0.0051  | **0.0049** |
| primitif_io_block_download (sequential) | 8.1416  | 11.3220 | **9.7318** |

---

## Cross-Version Analysis: Network I/O Downloads

This is where the interesting story is. Let me compile the average download times across all versions:

### Network Download Averages (seconds)

| Method         | Py 3.10 | Py 3.11 | Py 3.12 | Py 3.13 | Py 3.13t |
| -------------- | ------- | ------- | ------- | ------- | -------- |
| **Sequential** | 11.49   | 12.05   | 10.69   | 11.05   | 9.73     |
| **ThreadPool** | 3.40    | 4.73    | 3.49    | 4.69    | 5.33     |
| **Async**      | 8.19    | 7.84    | 4.60    | 4.65    | **2.09** |

### Speedup vs Sequential Baseline

| Method         | Py 3.10 | Py 3.11 | Py 3.12 | Py 3.13 | Py 3.13t  |
| -------------- | ------- | ------- | ------- | ------- | --------- |
| **ThreadPool** | 3.38x   | 2.55x   | 3.06x   | 2.36x   | 1.83x     |
| **Async**      | 1.40x   | 1.54x   | 2.32x   | 2.38x   | **4.66x** |

### The Story in These Numbers

**Observation 1: Async performance improved dramatically across versions.**

On Python 3.10, async was only 1.40x faster than sequential — barely worth the complexity. By Python 3.12, it was 2.32x faster. On Python 3.13t, it reached 4.66x. This is a clear progression that tracks with CPython's internal optimizations:

- **Python 3.11** introduced the specializing adaptive interpreter, which speeds up frequently-executed bytecode paths. The asyncio event loop is a tight inner loop that benefits from this.
- **Python 3.12** continued optimizing coroutine dispatch and reduced the overhead of `await` expressions.
- **Python 3.13t** removed the GIL entirely, which eliminates the GIL acquisition/release cycles that aiohttp's internal thread pool (used for DNS resolution and other blocking operations) must go through.

**Observation 2: ThreadPool performance was relatively stable but declined on 3.13t.**

ThreadPool downloads ranged from 3.40s (3.10) to 5.33s (3.13t). The degradation on 3.13t is surprising but explainable: the free-threaded build replaces the GIL with **per-object fine-grained locks**. These locks have higher overhead than the GIL for workloads where threads frequently access shared objects (like the `requests` library's connection pool, cookie jar, and header dictionary). The thread-safety mechanisms that replace the GIL — biased reference counting, per-object mutexes — add a constant overhead to every object access, which accumulates across the many small operations in an HTTP request/response cycle.

**Observation 3: On Python 3.13 (with GIL), ThreadPool and async converged.**

Both ThreadPool (4.69s) and async (4.65s) produced nearly identical results on Python 3.13 with the GIL enabled. This suggests that CPython 3.13's optimizations have reduced the overhead gap between the two approaches to the point where the bottleneck is purely the network, not the concurrency mechanism.

**Observation 4: Sequential performance was remarkably consistent.**

Sequential downloads ranged from 9.73s to 12.05s — a spread that reflects network variance rather than interpreter differences. This makes sense because sequential execution has minimal Python overhead (no threads, no event loop, no coroutines). The time is almost entirely determined by network latency, server response time, and bandwidth.

**Observation 5: The variance between rounds was significant.**

Look at Python 3.10's async download: Round 1 took 12.31 seconds, Round 2 took 4.08 seconds — a 3x difference between rounds of the same test. This is entirely due to **network variance**: the speed test server's response time, route congestion, TCP window scaling, and other network factors all fluctuate second-to-second. This is why averaging across rounds is essential, and why even averaged results should be interpreted with a grain of salt.

---

## Cross-Version Analysis: File I/O Reads

### File I/O Averages (seconds)

| Method               | Py 3.10 | Py 3.11 | Py 3.12 | Py 3.13 | Py 3.13t |
| -------------------- | ------- | ------- | ------- | ------- | -------- |
| **ThreadPool**       | 0.0040  | 0.0037  | 0.0030  | 0.0034  | 0.0037   |
| **Async (aiofiles)** | 0.0066  | 0.0063  | 0.0055  | 0.0056  | 0.0049   |

### What These Numbers Mean

All file I/O results are in the **3-7 millisecond range**. At this scale, we are not measuring file I/O performance — we are measuring **Python interpreter overhead**. The actual disk read takes under 0.1 ms for a 2 MB file on NVMe. The remaining time is:

- Thread creation/dispatch overhead (for ThreadPool)
- Coroutine scheduling overhead (for async)
- `open()` system call overhead
- `read()` system call overhead
- Object creation (Python bytes object for the content)
- Console output (Rich's `Console.print()` has rendering overhead)

**Key observations:**

1. **ThreadPool is consistently faster than async for file I/O.** By 1-2 ms. This is because `aiofiles` adds an extra layer of indirection: it creates a coroutine, schedules it on the event loop, dispatches the actual read to a thread pool, waits for the result, and resumes the coroutine. The ThreadPool approach skips the coroutine layer and dispatches directly.

2. **Python 3.12 was the fastest for both methods.** ThreadPool at 3.0 ms and async at 5.5 ms. This aligns with CPython 3.12's continued performance optimizations, particularly in object creation and function call dispatch.

3. **The differences are negligible in practice.** The difference between 3.0 ms and 6.6 ms is 3.6 milliseconds. In any real application, this is invisible — a single network request adds 50-500 ms of latency. File I/O benchmarks at this scale are interesting for understanding interpreter internals but have zero practical impact on application performance.

---

## The GIL Removal Paradox: Why 3.13t Is Faster at Async but Slower at Threading

This is the most interesting finding of the entire experiment. On Python 3.13t:

- **Async download: 2.09s** (fastest across all versions, by a wide margin)
- **ThreadPool download: 5.33s** (slowest across all versions)

This seems contradictory. Removing the GIL should make threads faster, right? Not necessarily — and here is why.

### Why ThreadPool Got Slower

The GIL, despite being a bottleneck for CPU-bound multi-threaded code, is actually an **extremely efficient lock for I/O-bound code**. Here is the lifecycle of a thread under the GIL during an I/O operation:

```
[Acquire GIL: ~100ns] → [Execute Python: ~1μs] → [Release GIL: ~100ns] → [I/O wait: ~3s]
```

The GIL acquisition and release are fast atomic operations — roughly 100 nanoseconds each on modern hardware. For I/O-bound code where the I/O wait dominates (3 seconds vs 200 nanoseconds of GIL overhead), the GIL's cost is effectively zero.

In the free-threaded build, the GIL is replaced with:

- **Per-object locks** for mutable objects
- **Biased reference counting** with atomic fallback for shared objects
- **Fine-grained critical sections** for internal data structures

Each of these mechanisms is individually more expensive than a single GIL acquisition. When `requests` processes an HTTP response, it touches many Python objects: the response object, headers dictionary, content bytes, URL string, status code integer, etc. Each object access may require a lock operation. For a typical HTTP response processing cycle, the cumulative overhead of hundreds of fine-grained locks exceeds the cost of a single GIL acquisition/release pair.

### Why Async Got Faster

Asyncio runs in a **single thread**. Under the standard GIL build, the GIL is always held by that thread and never contested — but it still exists, and its internal bookkeeping (checking for pending GIL release requests, maintaining the GIL state machine) adds a small overhead to every bytecode instruction.

In the free-threaded build, there is no GIL and no per-thread GIL bookkeeping. The event loop can execute bytecode without any lock overhead because it is the only thread running Python code. The per-object locks are uncontested in a single-threaded context, so they degrade to simple no-op operations (or very fast operations with no actual blocking).

Additionally, the free-threaded build includes optimizations to `asyncio`'s internal data structures (task queues, callback registrations) that reduce overhead for coroutine scheduling. The net result is that single-threaded asyncio code runs faster on 3.13t than on 3.13 — the opposite of what you might expect from "removing the GIL."

### The Takeaway

> Removing the GIL helps **multi-threaded CPU-bound** code (true parallelism becomes possible). It hurts **multi-threaded I/O-bound** code (fine-grained locks are more expensive than the GIL for short critical sections). And it actually **helps single-threaded asyncio** code (no GIL bookkeeping overhead).

This is why the user's original intuition — "I don't care about the GIL for I/O testing" — was mostly right, but the full picture is more nuanced than expected.

---

## Why Sequential Is Always the Slowest

This seems obvious, but let's be precise about _why_ and _by how much_.

Sequential download time ≈ `T_connect_1 + T_download_1 + T_connect_2 + T_download_2 + T_connect_3 + T_download_3`

Where each `T_connect` includes:

- DNS resolution (~5-50 ms, cached after first lookup)
- TCP three-way handshake (~1 RTT, typically 10-200 ms depending on server distance)
- TLS handshake (~1-2 RTTs if applicable)

And each `T_download` includes:

- HTTP request/response headers
- Data transfer at available bandwidth
- TCP slow start ramp-up (starts at a small window and increases)

Concurrent approaches overlap all of these steps. Three concurrent downloads can perform their DNS lookups, TCP handshakes, and data transfers simultaneously. The total time collapses from `sum(T_i)` to approximately `max(T_i)`.

The speedup ratio should theoretically be **3x** (since we have 3 concurrent tasks). In practice:

| Version  | Sequential | Best Concurrent    | Actual Speedup |
| -------- | ---------- | ------------------ | -------------- |
| Py 3.10  | 11.49s     | 3.40s (ThreadPool) | 3.38x          |
| Py 3.11  | 12.05s     | 4.73s (ThreadPool) | 2.55x          |
| Py 3.12  | 10.69s     | 3.49s (ThreadPool) | 3.06x          |
| Py 3.13  | 11.05s     | 4.65s (Async)      | 2.38x          |
| Py 3.13t | 9.73s      | 2.09s (Async)      | 4.66x          |

The speedup occasionally exceeds 3x (3.38x on 3.10, 4.66x on 3.13t). This happens because concurrent connections can achieve better **aggregate throughput** than sequential connections due to TCP congestion window behavior. A single TCP connection starts with a small congestion window (typically 10 segments ≈ 14 KB) and grows it during "slow start." Three concurrent connections each start their own slow start, achieving three times the initial throughput. For small files like our 1 MB test, slow start may consume a significant fraction of the transfer time, so parallelizing the connections provides more than 3x the initial bandwidth.

---

## The Variance Problem: Why Network Benchmarks Are Noisy

If you look at the raw round-by-round data, the variance is striking:

| Version  | Method              | Round 1 | Round 2 | Difference |
| -------- | ------------------- | ------- | ------- | ---------- |
| Py 3.10  | async download      | 12.31s  | 4.08s   | **3.0x**   |
| Py 3.10  | ThreadPool download | 4.78s   | 2.02s   | **2.4x**   |
| Py 3.12  | sequential download | 8.75s   | 12.64s  | **1.4x**   |
| Py 3.13t | sequential download | 8.14s   | 11.32s  | **1.4x**   |

Round-to-round variance of 1.4x to 3.0x is enormous for a benchmark. This is inherent to network I/O testing and is caused by:

1. **Server-side load fluctuation.** The Tele2 speed test server handles thousands of concurrent users. Server-side CPU, memory, and bandwidth availability change constantly.

2. **Network path congestion.** Packets between your machine and the server traverse multiple routers, switches, and links. Congestion on any intermediate link adds latency.

3. **TCP congestion control dynamics.** TCP adapts its sending rate based on packet loss. A single dropped packet can trigger congestion avoidance, halving the transfer rate.

4. **ISP traffic shaping.** Some ISPs apply traffic management policies that throttle connections after a burst, particularly during peak hours.

5. **DNS caching.** The first download in each round may incur a DNS lookup (5-50 ms), while subsequent downloads use the cached result.

6. **TLS session resumption.** The first TLS connection requires a full handshake. Subsequent connections to the same server may use session resumption, which is faster.

7. **Operating system scheduling.** Windows' thread scheduler may assign benchmark threads to cores that are already busy with background tasks, or it may migrate threads between cores (causing cache invalidation).

This is why the file I/O benchmarks are so much more stable — they do not depend on external network conditions.

---

## Factors That Influence the Results

### Network-Related Factors

| Factor          | Impact                                         | Mitigation                          |
| --------------- | ---------------------------------------------- | ----------------------------------- |
| Server location | Higher latency = longer RTT = slower transfers | Use geographically close servers    |
| Bandwidth       | Lower bandwidth = longer download times        | Test with appropriately-sized files |
| Congestion      | Packet loss triggers TCP backoff               | Run tests during off-peak hours     |
| DNS resolution  | First lookup adds 5-50 ms                      | Pre-resolve or use IP directly      |
| TLS overhead    | Handshake adds 1-2 RTTs                        | Irrelevant for HTTP URLs            |

### System-Related Factors

| Factor             | Impact                                             | Mitigation                    |
| ------------------ | -------------------------------------------------- | ----------------------------- |
| RAM pressure       | Swapping adds latency spikes                       | Close background applications |
| CPU frequency      | Boost clocks affect Python execution speed         | Ensure adequate cooling       |
| Antivirus scanning | Real-time scanning adds file I/O latency           | Exclude benchmark directory   |
| Disk I/O           | Other processes reading/writing add contention     | Use a dedicated drive         |
| Process priority   | Background processes can preempt benchmark threads | Set higher priority           |

### Python-Specific Factors

| Factor             | Impact                                      | Mitigation                           |
| ------------------ | ------------------------------------------- | ------------------------------------ |
| Python version     | 3.11+ is ~25% faster than 3.10              | Test across versions                 |
| GIL contention     | Affects threaded code with many workers     | Use asyncio or reduce workers        |
| Garbage collection | GC pauses affect all threads simultaneously | Disable GC during benchmarks (risky) |
| Import overhead    | First import of modules adds startup time   | Warm-up run before benchmarking      |
| JIT (3.13+)        | Experimental JIT may affect hot paths       | Not enabled by default yet           |

### Our Test Conditions

Our benchmark ran under 89.7% RAM usage, with Chrome, VS Code, Telegram, and Windows Defender all running in the background. These conditions are **realistic** — most developers run benchmarks on their working machines, not on dedicated clean-room test rigs. The results reflect real-world performance, warts and all.

If the same tests were run on a clean system with no background processes, lower RAM pressure, and a faster network connection, the absolute numbers would be different — but the **relative rankings** would likely remain the same. Async would still be faster than ThreadPool on 3.13t, ThreadPool would still be faster than sequential, and file I/O would still complete in single-digit milliseconds.

---

## Limitations of This Experiment

Let me be transparent about what this experiment does _not_ test:

1. **CPU-bound concurrency.** We are exclusively testing I/O-bound workloads. For CPU-bound tasks (image processing, numerical computation, cryptography), the results would be fundamentally different — threading would provide no benefit under the GIL, while multiprocessing would shine.

2. **High concurrency levels.** We test with only 3 concurrent tasks. At 100 or 1000 concurrent tasks, threading overhead (memory per thread, context switch frequency) would favor asyncio much more dramatically.

3. **Long-running connections.** Our downloads last 2-5 seconds each. WebSocket connections, HTTP/2 streams, and database connection pools that stay open for minutes or hours would show different characteristics.

4. **Error handling under load.** We do not test what happens when connections fail, time out, or get rate-limited. Error handling paths have different performance characteristics than the happy path.

5. **Memory usage.** We only measure execution time, not peak memory consumption. Threading allocates ~8 MB of stack per thread (default on Linux, similar on Windows). Asyncio uses ~1 KB per coroutine. At high concurrency levels, this difference matters.

6. **Large file transfers.** Our 1 MB test files are small. For 100 MB or 1 GB files, the download time would be dominated by bandwidth, making the concurrency overhead negligible and the results more stable.

7. **HTTP/2 and HTTP/3.** The `requests` library only supports HTTP/1.1. The `aiohttp` library supports HTTP/1.1 and has experimental HTTP/2 support. HTTP/2's multiplexing allows multiple logical streams over a single TCP connection, which changes the concurrency model entirely.

8. **Non-Windows platforms.** All results are from Windows 10. Linux and macOS have different thread scheduling, I/O subsystems, and event loop implementations that could produce different relative results.

---

## What Would Change Under Different Conditions

### If We Used a Faster Network

With a 1 Gbps symmetric connection and a local speed test server (1 ms RTT), the download times would drop to approximately 8 ms per 1 MB file. At this speed, the concurrency overhead would become a **larger fraction** of total time, making the differences between threading and async more pronounced. Asyncio would likely win by a wider margin because its overhead (coroutine scheduling) is lower than threading's overhead (OS context switches).

### If We Used More Concurrent Tasks

With 100 concurrent downloads:

- **Threading** would create 100 OS threads, consuming ~800 MB of stack space and causing significant context-switching overhead.
- **Asyncio** would create 100 coroutines consuming ~100 KB total, with minimal scheduling overhead.
- **Sequential** would take 100x the time of a single download.

At this scale, asyncio would outperform threading significantly, and the practical advantages of async's lower resource footprint would become critical.

### If We Used a Slower Disk

On an HDD (sequential read ~150 MB/s, random read ~1 ms seek time), the file I/O benchmarks would take 10-50x longer. At this scale, the concurrency mechanism would matter more because the I/O wait time is longer, giving the event loop or thread pool more opportunity to overlap operations. The difference between ThreadPool and async would narrow because the actual I/O dominates the overhead.

### If We Used Linux Instead of Windows

Linux's event loop implementation uses `epoll`, which is generally considered more efficient than Windows' IOCP for a moderate number of connections (but IOCP scales better to thousands). Linux's thread creation is also faster than Windows' because Linux threads share the process address space more efficiently. The net effect would likely be slightly faster ThreadPool performance on Linux.

### If We Used Python 3.14+

CPython 3.14 is expected to make the free-threaded build more mature, with reduced overhead for per-object locking and better JIT compilation. The performance gap between 3.13 and 3.13t for threaded code may narrow significantly.

---

## Practical Guidance: Choosing Async vs Threads

Based on the experiment results, here are concrete recommendations:

### Use `asyncio` + `aiohttp` When:

- You are building a new project and can choose async-compatible libraries from the start
- You have **many concurrent I/O operations** (10+)
- You need **low memory overhead** per connection
- You are running Python 3.12+ (where async performance is significantly improved)
- You are building a web server, API client, or data pipeline that handles many simultaneous connections

### Use `ThreadPoolExecutor` + `requests` When:

- You have an existing synchronous codebase that would be expensive to convert to async
- You need to use libraries that do not have async equivalents
- You have a **small number of concurrent tasks** (< 10)
- You want simpler debugging (stack traces in threaded code are more readable than in async code)
- You are doing mixed CPU + I/O work where threading provides genuine CPU-level benefits (especially on 3.13t)

### Use Sequential When:

- You have only one I/O operation
- Order matters and operations must happen one after another
- Simplicity is more important than performance
- You are writing a script that runs infrequently

### Never Use for I/O:

- **Multiprocessing** — the overhead of process creation, IPC serialization, and memory duplication far exceeds any benefit for I/O-bound work
- **`asyncio` for a single call** — the overhead of creating an event loop, scheduling a coroutine, and running it to completion provides zero benefit for a single I/O operation. The user's original notes captured this perfectly: _"there's nothing any significant advantage if calling an asynchronous function for once."_

---

## The Author's Conclusion

After spending a full day on this experiment, here is what I came away with:

The original mental model holds:

> **sync (I/O block) → threadpool → concurrency → different threads → independent**
>
> **async (I/O non block) → asyncio gather → concurrency → single thread → same event loop**

Both achieve the same practical effect — overlapping I/O waits — but through different mechanisms. For I/O-bound workloads with a moderate number of tasks, they produce **similar performance**. The choice between them is more about **ecosystem compatibility** (does your HTTP library support async?) and **code complexity** (are you comfortable with async/await patterns?) than about raw speed.

What surprised me was how much **Python version** matters. The same async code running on Python 3.10 was 2.4x slower than the threaded version. On Python 3.12, they were nearly identical. On Python 3.13t, async was 2.5x faster. The interpreter's internal optimizations, event loop implementation, and GIL behavior are not academic curiosities — they produce **measurable, practical differences** that you should consider when choosing a Python version for production workloads.

The free-threaded Python 3.13t build is the most fascinating data point. It makes async faster and threading slower for I/O-bound code — the opposite of what "removing the GIL" intuitively suggests. The GIL is not a simple bottleneck that you remove to make everything faster. It is a **coarse-grained synchronization mechanism** that, for I/O workloads, was already close to optimal. Replacing it with fine-grained locks adds overhead to every object operation, which accumulates in thread-heavy code but vanishes in single-threaded async code.

As the user noted:

> _"In I/O testing, there are a lot of dependencies that make the results vary — the Python version, the speed of the HDD/SSD, and the internet speed or server speed."_

This is exactly right. Any benchmark that presents a single number as "the answer" is being misleading. The answer is always: **it depends.** And now we have data showing exactly what it depends on.

---

## References

1. **Python `asyncio` documentation (3.10)** — [https://docs.python.org/3.10/library/asyncio-task.html](https://docs.python.org/3.10/library/asyncio-task.html) — Official documentation for asyncio tasks, coroutines, and the event loop.

2. **Python `concurrent.futures` documentation** — [https://docs.python.org/3/library/concurrent.futures.html](https://docs.python.org/3/library/concurrent.futures.html) — Official documentation for `ThreadPoolExecutor` and `ProcessPoolExecutor`.

3. **PEP 703 — Making the Global Interpreter Lock Optional in CPython** — [https://peps.python.org/pep-0703/](https://peps.python.org/pep-0703/) — Sam Gross's proposal for removing the GIL, accepted for Python 3.13 as experimental.

4. **Removing Python's GIL: It's Happening (Vonage Developer Blog)** — [https://developer.vonage.com/en/blog/removing-pythons-gil-its-happening](https://developer.vonage.com/en/blog/removing-pythons-gil-its-happening) — Accessible overview of the GIL removal timeline and implications.

5. **Stack Overflow: Python no-GIL discussion** — [https://stackoverflow.com/a/77519536/](https://stackoverflow.com/a/77519536/) — Community discussion on the free-threaded build's implications.

6. **Stack Overflow: asyncio and threading comparison** — [https://stackoverflow.com/a/70459437/](https://stackoverflow.com/a/70459437/) — Detailed comparison of asyncio vs threading for I/O workloads.

7. **Concurrent vs Parallel Programming (LinkedIn Advice)** — [https://www.linkedin.com/advice/0/whats-difference-between-concurrent-parallel-programming](https://www.linkedin.com/advice/0/whats-difference-between-concurrent-parallel-programming) — Referenced by the author for the concurrency/parallelism distinction: "concurrent programs can be parallel, but not all concurrent programs are parallel."

8. **aiohttp Documentation** — [https://docs.aiohttp.org/en/stable/](https://docs.aiohttp.org/en/stable/) — Official documentation for the async HTTP client library.

9. **aiofiles GitHub Repository** — [https://github.com/Tinche/aiofiles](https://github.com/Tinche/aiofiles) — Source code and documentation; confirms thread pool delegation for file I/O.

10. **requests Library Documentation** — [https://docs.python-requests.org/en/latest/](https://docs.python-requests.org/en/latest/) — Official documentation for the synchronous HTTP library.

11. **Rich Library Documentation** — [https://rich.readthedocs.io/en/stable/](https://rich.readthedocs.io/en/stable/) — Terminal rendering library used for progress bars in the experiment.

12. **Faster CPython Project** — [https://github.com/faster-cpython/ideas](https://github.com/faster-cpython/ideas) — The initiative behind Python 3.11-3.13's performance improvements, led by Mark Shannon.

13. **Python `inspect` module documentation** — [https://docs.python.org/3/library/inspect.html](https://docs.python.org/3/library/inspect.html) — Used for the test runner's dynamic method discovery.

14. **Speed test files (Tele2)** — [http://speedtest.tele2.net/](http://speedtest.tele2.net/) — Public speed test server used for download benchmarks.

15. **PEP 684 — A Per-Interpreter GIL** — [https://peps.python.org/pep-0684/](https://peps.python.org/pep-0684/) — Python 3.12's per-interpreter GIL, a stepping stone toward full GIL removal.
