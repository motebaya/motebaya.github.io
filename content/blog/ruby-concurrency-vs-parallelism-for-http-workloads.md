# Ruby Concurrency vs Parallelism for HTTP Workloads

I spent dozens of hours staring at benchmark outputs, reading Ruby internals documentation, and swapping between async fibers, threads, forks, promises, and thread pools — all to answer one deceptively simple question: **does it actually matter which concurrency model you use when the bottleneck is the network?**

The short answer is no. The long answer is far more interesting.

This article is the result of a deep-dive experiment into Ruby's concurrency and parallelism landscape, specifically for **I/O-bound HTTP workloads**. We'll benchmark **nine different approaches** to making concurrent HTTP requests, dissect why each one behaves the way it does, and explore the underlying mechanics that make Ruby's concurrency story both fascinating and frustrating. Along the way, we'll cover the theory, the implementation, the results, and the external factors that shape everything.

If you've ever been confused about the difference between concurrency and parallelism — or wondered why Ruby developers argue about the GIL so much — this one's for you.

---

## Table of Contents

- [A Brief Context on Ruby](#a-brief-context-on-ruby)
- [The GIL/GVL: Ruby's Most Controversial Feature](#the-gilvgl-rubys-most-controversial-feature)
- [Concurrency vs Parallelism: Getting the Theory Right](#concurrency-vs-parallelism-getting-the-theory-right)
- [I/O-Bound vs CPU-Bound: Why It Matters](#io-bound-vs-cpu-bound-why-it-matters)
- [The Experiment Design](#the-experiment-design)
- [Dependencies and Their Roles](#dependencies-and-their-roles)
- [The HTTP Helper Functions](#the-http-helper-functions)
- [Approach 1: Async with Non-Blocking HTTP](#approach-1-async-with-non-blocking-http-async_test)
- [Approach 2: Async with Blocking HTTP](#approach-2-async-with-blocking-http-async_another_test)
- [Approach 3: Sequential Synchronous (Baseline)](#approach-3-sequential-synchronous-baseline-sync_normal_test)
- [Approach 4: Native Ruby Threads](#approach-4-native-ruby-threads-sync_thread_test)
- [Approach 5: Fork-Based Parallelism with IPC](#approach-5-fork-based-parallelism-with-ipc-sync_fork_test)
- [Approach 6: Concurrent::Promise (Legacy API)](#approach-6-concurrentpromise-legacy-api-sync_concurrent_test)
- [Approach 7: Concurrent::Promises (Modern API)](#approach-7-concurrentpromises-modern-api-sync_concurrent_promise_test)
- [Approach 8: ThreadPoolExecutor](#approach-8-threadpoolexecutor-sync_concurrent_threadpool_test)
- [Approach 9: Parallel Gem](#approach-9-parallel-gem-sync_parallel_test)
- [The Self-Inspecting Benchmark Runner](#the-self-inspecting-benchmark-runner)
- [Benchmark Results and Analysis](#benchmark-results-and-analysis)
- [Why All Concurrent Approaches Converge to ~3 Seconds](#why-all-concurrent-approaches-converge-to-3-seconds)
- [Factors That Influence the Results](#factors-that-influence-the-results)
- [Limitations of This Experiment](#limitations-of-this-experiment)
- [What Would Change Under Different Conditions](#what-would-change-under-different-conditions)
- [Practical Guidance: Choosing the Right Tool](#practical-guidance-choosing-the-right-tool)
- [Final Thoughts](#final-thoughts)
- [References](#references)

---

## A Brief Context on Ruby

Ruby is a dynamic, interpreted, general-purpose programming language created by **Yukihiro "Matz" Matsumoto** in the mid-1990s. It was designed with developer happiness in mind — prioritizing readability, expressiveness, and the principle of least surprise. Ruby gained massive popularity through **Ruby on Rails**, the web framework that revolutionized how web applications were built in the mid-2000s.

But Ruby's design philosophy comes with trade-offs. Being an interpreted language running on the **CRuby/MRI** (Matz's Ruby Interpreter) runtime, it carries certain performance characteristics that directly affect how concurrency and parallelism work:

- **Single-threaded by default.** Ruby code executes on a single thread unless you explicitly create more.
- **Garbage collected.** Ruby uses a mark-and-sweep garbage collector, which can introduce pauses during execution. In a concurrent context, GC pauses affect all threads simultaneously because the GC itself is protected by the GIL.
- **Dynamically typed.** While this makes Ruby flexible and expressive, it also means the interpreter does more work at runtime compared to statically typed, compiled languages — making CPU-bound operations inherently slower.
- **Multiple implementations exist.** CRuby/MRI is the reference implementation and the one used in this experiment. **JRuby** (Ruby on the JVM) and **TruffleRuby** (on GraalVM) do **not** have a GIL and can achieve true thread-level parallelism. The concurrency behavior documented in this article is **specific to CRuby/MRI**.

Understanding these characteristics is essential because they directly determine _why_ certain concurrency approaches behave the way they do in our benchmarks.

---

## The GIL/GVL: Ruby's Most Controversial Feature

If you've spent any time in the Ruby community, you've heard about the **GIL** — the **Global Interpreter Lock**. In more recent Ruby versions (2.x onward), it's more accurately called the **GVL** (Global VM Lock), but the two terms are used interchangeably in most discussions.

### What the GIL/GVL Actually Does

The GIL is a mutex (mutual exclusion lock) that **prevents multiple threads from executing Ruby code simultaneously**. At any given moment, only one thread can hold the GIL and execute Ruby bytecode. When a thread wants to run Ruby code, it must first acquire the GIL. If another thread already holds it, the requesting thread blocks until the GIL is released.

This means that even if you create 10 threads on a machine with 16 CPU cores, **only one thread is executing Ruby code at any given instant**. The other 9 threads are either waiting for the GIL or waiting on I/O.

### Why the GIL Exists

The GIL exists primarily to **protect CRuby's internal data structures** from race conditions. CRuby's memory management, garbage collector, and C extension API were not designed to be thread-safe. Without the GIL, concurrent access to Ruby objects from multiple threads could corrupt memory, cause segfaults, or produce undefined behavior. The GIL is a pragmatic engineering decision — it trades potential parallelism for safety and simplicity.

### The Critical Exception: I/O Operations

Here's the part that makes this experiment work: **the GIL is released during I/O operations**. When a thread performs a blocking I/O call — reading from a socket, writing to a file, waiting for an HTTP response — it releases the GIL before the blocking call and reacquires it when the call returns. This means other threads can run Ruby code while one thread is waiting for I/O.

This is exactly why thread-based concurrency works well for HTTP requests. The thread spends the vast majority of its time _waiting for the network_, during which it does not hold the GIL. The tiny amount of Ruby code execution (constructing the request, parsing the response) is negligible compared to the network wait time.

> **Key insight:** The GIL makes Ruby threads useless for CPU-bound parallelism, but it has **almost no impact** on I/O-bound concurrency. This is the foundational principle that the entire experiment validates.

### GIL Behavior in Other Ruby Implementations

It's worth noting that this is a CRuby-specific constraint:

| Implementation  | Has GIL?  | True Thread Parallelism? |
| --------------- | --------- | ------------------------ |
| **CRuby/MRI**   | Yes (GVL) | No (for Ruby code)       |
| **JRuby**       | No        | Yes                      |
| **TruffleRuby** | No        | Yes                      |
| **Rubinius**    | No        | Yes                      |

If this same experiment were run on JRuby, the I/O-bound results would be similar (since the bottleneck is the network, not the GIL), but CPU-bound benchmarks would show dramatically different results — threads on JRuby can truly run in parallel across cores.

---

## Concurrency vs Parallelism: Getting the Theory Right

These two terms are often used interchangeably, but they describe fundamentally different concepts. Getting this distinction right is essential to understanding the experiment results.

### Concurrency: Dealing with Many Things at Once

**Concurrency** is a _structural_ property of a program. A concurrent program is designed to handle multiple tasks by interleaving their execution. The tasks don't necessarily run at the same time — they take turns. Think of a single chef preparing three dishes: they chop vegetables for dish A, then while dish A is in the oven, they start preparing dish B, then check on dish A while dish C's sauce simmers. One chef, multiple dishes, interleaved work.

In programming terms, concurrency is achieved through:

- **Fibers/Coroutines** — cooperative multitasking where tasks explicitly yield control.
- **Threads with a GIL** — preemptive multitasking where the runtime switches between threads, but only one runs at a time.
- **Event loops** — a single thread processes events from a queue, dispatching callbacks as events complete.

The key characteristic: concurrency is about **structure**, not **simultaneity**. A concurrent program _could_ run on a single CPU core and still be concurrent.

### Parallelism: Doing Many Things at Once

**Parallelism** is an _execution_ property. A parallel program runs multiple tasks **literally at the same time**, on separate CPU cores or processors. Think of three chefs each preparing their own dish simultaneously in three separate kitchen stations.

In programming terms, parallelism is achieved through:

- **OS-level processes** — each process has its own memory space, its own GIL (in Ruby's case), and can run on a separate core.
- **Threads without a GIL** — on JRuby or in languages like Java, Go, or Rust, threads can execute simultaneously on multiple cores.
- **SIMD/GPU parallelism** — hardware-level parallel execution of the same operation across multiple data points.

### The Overlap

Here's where it gets nuanced: **parallelism implies concurrency, but concurrency does not imply parallelism**. If two tasks run in parallel, they are by definition concurrent (they are both "in progress" at the same time). But two tasks can be concurrent without being parallel — they simply interleave on a single core.

In Ruby (CRuby/MRI):

- **Threads** give you concurrency but _not_ parallelism for Ruby code. However, they _do_ give you parallelism for I/O waits because the GIL is released during I/O.
- **Fibers** (via the `async` gem) give you concurrency within a single thread through cooperative scheduling.
- **Processes** (via `fork`) give you both concurrency _and_ true parallelism because each process has its own GIL and its own memory space.

This distinction is what the experiment tests directly.

---

## I/O-Bound vs CPU-Bound: Why It Matters

The performance characteristics of concurrency and parallelism depend entirely on **where the bottleneck is**.

### I/O-Bound Workloads

A task is **I/O-bound** when the majority of its execution time is spent waiting for external input/output operations: network requests, file reads/writes, database queries, or user input. The CPU is mostly idle, waiting for data to arrive.

For I/O-bound work:

- **Concurrency alone is sufficient.** While one task waits for I/O, another task can proceed. You don't need multiple CPU cores because the CPU isn't the bottleneck — the external resource is.
- **The GIL doesn't matter** because threads release it during I/O waits.
- **Adding more CPU cores doesn't help** because the CPU is already underutilized.

### CPU-Bound Workloads

A task is **CPU-bound** when the majority of its execution time is spent performing computations: number crunching, image processing, encryption, compression, or complex algorithms. The CPU is the bottleneck — it's working as fast as it can.

For CPU-bound work:

- **Concurrency alone is insufficient** in CRuby because the GIL prevents multiple threads from executing Ruby code simultaneously.
- **True parallelism is required** — either through `fork` (separate processes) or by using a Ruby implementation without a GIL (JRuby, TruffleRuby).
- **Adding more CPU cores helps** because each core can execute computations independently.

### Why This Experiment Focuses on I/O-Bound

The HTTP requests in this experiment hit `https://httpbin.org/delay/1.6`, which intentionally delays the response by 1.6 seconds. The actual computation involved — constructing the HTTP request, parsing headers, reading the response body — takes **microseconds**. The remaining 1.6 seconds is pure waiting. This makes the workload overwhelmingly I/O-bound, which is why we expect all concurrent approaches to perform similarly regardless of whether they achieve true parallelism or not.

If the workload were CPU-bound instead (e.g., computing Fibonacci numbers or crunching matrices), the results would look very different. Threads would offer no speedup over sequential execution because of the GIL, while forks would show genuine improvement proportional to the number of available CPU cores.

---

## The Experiment Design

### The Target Endpoint

All test functions make HTTP requests to the same endpoint:

```
https://httpbin.org/delay/1.6
```

[httpbin.org](https://httpbin.org) is a widely used HTTP testing service. The `/delay/{n}` endpoint intentionally waits `n` seconds before responding. By using a delay of **1.6 seconds**, the experiment creates a controlled, predictable I/O wait time.

### The Request Count

Each test function makes exactly **3 requests**. This number was chosen deliberately:

- **Sequential baseline prediction:** 3 requests x 1.6 seconds = **4.8 seconds** minimum (plus network overhead, so realistically **~5-9 seconds** depending on network conditions and server response variability).
- **Concurrent prediction:** If all 3 requests run concurrently, the total time should be approximately equal to the **slowest single request** — roughly **1.6 seconds + network overhead**, realistically **~3 seconds**.
- **3 requests** is small enough to avoid rate-limiting or connection pool exhaustion from httpbin.org, while large enough to clearly demonstrate the difference between sequential and concurrent execution.

### Why the Observed Sequential Time Is ~8.59 Seconds (Not ~4.8)

The sequential test (`sync_normal_test`) took **~8.59 seconds** for 3 requests, which is noticeably higher than the theoretical minimum of 4.8 seconds (3 x 1.6s). This is because the 1.6-second delay is only the **server-side delay**. The total time per request includes:

1. **DNS resolution** — looking up the IP address for `httpbin.org`.
2. **TCP handshake** — establishing the connection (SYN, SYN-ACK, ACK).
3. **TLS handshake** — negotiating encryption for HTTPS (multiple round trips).
4. **Request transmission** — sending the HTTP request headers and body over the network.
5. **Server-side processing** — the 1.6-second intentional delay.
6. **Response transmission** — receiving the response headers and body back.
7. **Connection teardown** — closing the TCP connection (or keeping it alive for reuse).

All of these add up. Each request takes roughly **2.8 seconds** in practice (not 1.6), and 3 x 2.8 = 8.4 seconds, which aligns closely with the observed 8.59 seconds.

### Thread Safety Consideration

All test functions use `Concurrent::Array` from the `concurrent-ruby` gem instead of Ruby's standard `Array`. This is a deliberate design choice. Ruby's built-in `Array` is **not thread-safe** — concurrent pushes from multiple threads can corrupt the array, lose elements, or cause segfaults. `Concurrent::Array` wraps every operation in a mutex, ensuring thread-safe access at the cost of minor lock contention overhead.

In a real-world application, this choice between thread-safe and standard collections is an important architectural decision. Using `Concurrent::Array` here ensures that the benchmark results reflect the actual concurrency approach being tested, not bugs from unsafe data structure access.

---

## Dependencies and Their Roles

The experiment uses seven libraries, each representing a different philosophy toward concurrency and HTTP handling:

```ruby
require "async"
require "async/barrier"
require "async/http/internet"
require "benchmark"
require "httparty"
require "concurrent"
require "parallel"
```

### Detailed Dependency Breakdown

| Gem                   | Version Context                           | Category        | Concurrency Model                                        |
| --------------------- | ----------------------------------------- | --------------- | -------------------------------------------------------- |
| `async`               | Maintained by Samuel Williams (ioquatix)  | Framework       | Fiber-based cooperative multitasking                     |
| `async/barrier`       | Part of the `async` gem                   | Synchronization | Waits for all async tasks to complete                    |
| `async/http/internet` | Part of the `async-http` gem              | HTTP Client     | Non-blocking HTTP on top of `async`                      |
| `benchmark`           | Ruby stdlib                               | Measurement     | N/A (timing utility)                                     |
| `httparty`            | One of Ruby's most popular HTTP gems      | HTTP Client     | Blocking/synchronous HTTP                                |
| `concurrent-ruby`     | The standard concurrency toolkit for Ruby | Framework       | Thread pools, promises, futures, thread-safe collections |
| `parallel`            | Lightweight parallelism wrapper           | Framework       | Thread or process-based parallelism                      |

### Why Two Different HTTP Clients?

The experiment deliberately uses two different HTTP clients — `async-http` and `HTTParty` — because they represent fundamentally different I/O models:

- **`async-http`** is a **non-blocking** HTTP client. When it makes a request, it does not block the calling fiber. Instead, it registers interest in the socket's readability/writability with the event loop (via `io_uring` or `select`/`epoll`/`kqueue` depending on the platform) and yields control back to the scheduler. Other fibers can then execute while the HTTP response is in transit. This is _true_ asynchronous I/O.

- **`HTTParty`** is a **blocking** HTTP client. When it makes a request, the calling thread is blocked until the response arrives. No other code on that thread can execute during the wait. However, as discussed earlier, CRuby releases the GIL during this blocking I/O call, so _other threads_ can proceed.

The experiment tests both clients across different concurrency models to reveal whether the choice of HTTP client matters when the concurrency framework handles the scheduling.

---

## The HTTP Helper Functions

Before examining the nine test approaches, let's deeply understand the two helper functions that perform the actual HTTP work.

### The Non-Blocking Helper: `get_http`

```ruby
def get_http(index, client, queue)
  request = client.get("https://httpbin.org/delay/1.6")
  queue.push(" request ok: #{index}")
  request&.close if request
end
```

**Line-by-line cause and effect:**

1. `request = client.get(...)` — This calls `Async::HTTP::Internet#get`, which initiates an HTTP GET request. Because this is an `async-http` client running inside an `Async` block, this call is **non-blocking**. The fiber executing this function is suspended when it hits the network I/O, and control is yielded back to the `async` event loop. The event loop can then schedule other fibers (i.e., other `get_http` calls) while this one waits. When the response arrives, the event loop resumes this fiber, and `request` receives the response object.

2. `queue.push(" request ok: #{index}")` — After the response is received, the result string is pushed into the shared `Concurrent::Array`. This is a thread-safe operation that ensures no data corruption if multiple fibers complete at nearly the same time. The `queue` variable is the same `results` array passed from the calling function, allowing bidirectional data flow.

3. `request&.close if request` — This explicitly closes the HTTP response. The `&.` (safe navigation operator) ensures no `NoMethodError` if `request` is `nil`. The `if request` check adds a second layer of nil safety. This line exists because `async-http` uses persistent connections (keep-alive) by default. If the response is not explicitly closed, the connection remains open and the library emits **drain warnings** — messages indicating that response bodies were not fully consumed. In a long-running application, leaked connections can exhaust the connection pool and cause timeouts. This is why the original code comment notes: _"always get drain warning if not close each request, dunno."_

**What would change if `request&.close` were removed?** The benchmark results would be the same because the timing is dominated by network latency. However, the program would print drain warnings to stderr, and in a production application with many requests, leaked connections could eventually cause connection pool exhaustion, leading to errors like `Async::HTTP::ConnectionError` or socket timeout exceptions.

### The Blocking Helper: `sync_http`

```ruby
def sync_http(index, w_pipe = nil)
  HTTParty.get("https://httpbin.org/delay/1.6")
  if w_pipe.nil?
    " sync request ok: #{index}"
  else
    w_pipe.puts(" sync fork request ok: #{index}")
  end
end
```

**Line-by-line cause and effect:**

1. `HTTParty.get(...)` — This performs a **synchronous, blocking** HTTP GET request. The calling thread is completely blocked until the full response (headers + body) is received. During this blocking wait, CRuby releases the GIL (because `HTTParty` ultimately calls `Net::HTTP`, which uses Ruby's C-level socket I/O, which triggers GIL release). This means other Ruby threads can execute while this thread waits for the network response.

2. `if w_pipe.nil?` — This branch determines how the result is returned based on the calling context:
   - **When `w_pipe` is `nil`** (the default): The function returns the result string directly. This works for all test approaches _except_ fork-based parallelism because threads and fibers share memory space with the caller — the return value can be captured directly by the calling code.
   - **When `w_pipe` is provided**: The function writes the result to a **write pipe**. This is specifically for the `sync_fork_test` approach because forked child processes have **their own isolated memory space**. A child process cannot return a value to the parent process through a normal function return — the parent would never see it because they operate in completely separate memory. Instead, the child writes to a pipe (an OS-level IPC mechanism), and the parent reads from the other end of that pipe.

**Why this dual-purpose design matters:** By consolidating the HTTP call logic into a single function with an optional IPC parameter, the experiment ensures that all synchronous test approaches use exactly the same HTTP code path. This eliminates the variable of "different HTTP implementations" from the benchmark — the only variable being measured is the concurrency/parallelism model wrapping the call.

**What would change if `HTTParty` were replaced with `Net::HTTP` directly?** The results would be nearly identical. `HTTParty` is a wrapper around `Net::HTTP` that adds convenience methods (automatic JSON parsing, header management, etc.). The network I/O path — which is the bottleneck — is the same. However, `HTTParty` adds a small constant overhead for response parsing and object construction, typically on the order of a few milliseconds, which is negligible compared to the 1.6+ second network round trip.

---

## Approach 1: Async with Non-Blocking HTTP (`async_test`)

```ruby
def async_test
  Async do
    results = Concurrent::Array.new
    client = Async::HTTP::Internet.new
    barrier = Async::Barrier.new
    3.times do |i|
      barrier.async do
        results << get_http(i + 1, client, results)
      end
    end
    barrier.wait
    puts results.join
  end
end
```

### How It Works

This approach uses **fiber-based cooperative multitasking** with a **non-blocking HTTP client**. Let's trace the execution flow step by step:

1. **`Async do`** creates a new `Async::Reactor` (event loop) and wraps the entire block in a root fiber. Everything inside this block runs within the async event loop. If there is already a running reactor (because the test runner itself might be running inside one), this call reuses the existing reactor instead of creating a new one.

2. **`Async::HTTP::Internet.new`** creates a new HTTP client that is integrated with the async event loop. This client uses non-blocking sockets internally — it registers socket file descriptors with the event loop's I/O selector rather than blocking the thread.

3. **`Async::Barrier.new`** creates a synchronization primitive. The barrier collects async tasks and provides a `wait` method that blocks (yields the current fiber) until all collected tasks have completed. This is conceptually identical to `Promise.all()` in JavaScript — it ensures that the program does not proceed past `barrier.wait` until every task registered with the barrier has finished.

4. **`barrier.async do ... end`** (inside the loop) creates a new **fiber** (not a thread) for each iteration and registers it with the barrier. Fibers are lightweight — creating a fiber costs roughly **a few kilobytes** of stack memory, compared to **~1MB** for a native OS thread. The fiber is immediately scheduled for execution on the event loop.

5. **Inside each fiber:** `get_http(i + 1, client, results)` is called. When the `client.get` call reaches the point where it needs to wait for socket I/O (the HTTP response hasn't arrived yet), the fiber **yields** control back to the event loop. The event loop then picks up the next ready fiber and runs it. This is **cooperative multitasking** — fibers voluntarily give up control at I/O boundaries rather than being preempted by the runtime.

6. **`barrier.wait`** suspends the current fiber until all three request fibers have completed. The event loop continues running in the background, resuming fibers as their I/O operations complete.

### The Execution Timeline

```
Time ─────────────────────────────────────────────────────────►

Fiber 1: [start] ──► [send HTTP request] ──► [yield/wait] ──────────────────► [response received] ──► [done]
Fiber 2:              [start] ──► [send HTTP request] ──► [yield/wait] ──────────────────► [response received] ──► [done]
Fiber 3:                          [start] ──► [send HTTP request] ──► [yield/wait] ──────────────────► [response received] ──► [done]

Event Loop: Manages all three fibers, resuming each when its socket becomes readable.
```

All three requests are "in flight" simultaneously, even though only a single OS thread is involved. The total wall-clock time is determined by the **slowest individual request**, not the sum of all requests.

### Why the Result Is ~3.26 Seconds

The result of **3.257 seconds** is approximately the time for a single HTTP round trip to `httpbin.org/delay/1.6` (which includes 1.6 seconds of server delay + DNS resolution + TLS handshake + network latency). The three requests overlap almost entirely because the non-blocking client allows all three to be in flight at the same time. The small overhead above the theoretical ~2.8 seconds per request comes from:

- **Fiber scheduling overhead** — the event loop needs to context-switch between fibers.
- **Event loop poll latency** — the I/O selector (epoll/kqueue/select) has a small latency between when data arrives on a socket and when the event loop notices it.
- **Connection establishment** — even though `async-http` supports connection pooling, the first request to a new host requires full TCP + TLS setup.

**What would happen if we used 100 requests instead of 3?** The total time would still be approximately ~3 seconds (the time for one round trip) _if_ the network and server can handle 100 concurrent connections. However, `httpbin.org` might rate-limit or refuse connections, and the local machine's socket limits could become a factor. The theoretical advantage of fibers is that you can create thousands of them without exhausting OS thread resources.

**What would happen if the event loop were removed (no `Async do` block)?** The `Async::HTTP::Internet` client would fall back to synchronous behavior because it has no event loop to yield to. The requests would execute sequentially, and the total time would be similar to the sequential baseline (~8.59 seconds).

---

## Approach 2: Async with Blocking HTTP (`async_another_test`)

```ruby
def async_another_test
  Async do
    results = Concurrent::Array.new
    barrier = Async::Barrier.new
    3.times do |i|
      barrier.async do
        results << sync_http(i + 1)
      end
    end
    barrier.wait
    puts results.join
  end
end
```

### How It Works

This approach is structurally identical to Approach 1 — it uses `Async`, `Async::Barrier`, and fibers. The critical difference is that it calls **`sync_http`** (which uses `HTTParty`, a blocking HTTP client) instead of `get_http` (which uses `async-http`, a non-blocking client).

At first glance, this seems like it shouldn't work. If `HTTParty.get` is blocking, shouldn't each fiber be stuck waiting for its response, preventing other fibers from running?

### Why It Still Achieves Concurrency (~3.19 Seconds)

The answer lies in how the `async` gem integrates with Ruby's I/O system. The `async` gem **monkey-patches** (or more precisely, hooks into) Ruby's core I/O classes. Starting with Ruby 3.0, Ruby introduced a **Fiber Scheduler** interface (`Fiber.set_scheduler`) that allows gems like `async` to intercept blocking I/O calls at the VM level. When a fiber calls a blocking I/O method (like the socket read that `Net::HTTP` performs internally), the fiber scheduler intercepts the call, registers the socket with the event loop, and **yields the fiber** — exactly as if it were a non-blocking call.

This means that even though `HTTParty` is written as a synchronous library, when it runs inside an `Async` block with a fiber scheduler installed, its blocking I/O calls are transparently converted into non-blocking operations. The fiber yields at the I/O boundary, other fibers can run, and the original fiber resumes when the I/O completes.

> **This is one of the most elegant features of Ruby's `async` ecosystem.** Existing synchronous libraries can gain concurrent behavior _without any code changes_, simply by running inside an `Async` block. The fiber scheduler acts as a transparent compatibility layer.

### The `Async::Barrier` vs Direct `task.async` Distinction

The original code comments highlight an important distinction:

```ruby
# using barrier:
barrier.async do
  # tasks...
end
barrier.wait  # blocks until ALL tasks finish

# using task.async directly:
Async do |task|
  task.async do
    # tasks...
  end
  puts "this prints IMMEDIATELY, without waiting"
end
```

- **With `Async::Barrier`:** The `barrier.wait` call explicitly blocks the current fiber until every task registered with the barrier has completed. Code after `barrier.wait` is guaranteed to see the results of all tasks. This is the equivalent of JavaScript's `await Promise.all([...])`.

- **With `task.async` directly (no barrier):** The async tasks are scheduled, but the program continues to the next line immediately. Any code after the `task.async` block runs _before_ the tasks complete. This is useful when you want to fire-and-forget, but it makes result collection unreliable because you can't guarantee when each task finishes.

**What would happen if the barrier were removed and `task.async` were used instead?** The `puts results.join` line would execute before the HTTP requests complete, resulting in either an empty output or partial results. The benchmark time would appear shorter because it would measure only the time to _schedule_ the tasks, not to _complete_ them. This would produce misleading benchmark numbers.

### Why ~3.19 Seconds Instead of ~3.26 Seconds (Approach 1)?

The small time difference between Approach 1 (3.257s) and Approach 2 (3.193s) is within the margin of **network variance**. Each run of the benchmark will produce slightly different times because of:

- Variations in `httpbin.org` server response time.
- Fluctuations in internet routing and congestion.
- Background processes on the local machine competing for CPU time.

These two approaches are functionally equivalent in terms of performance for this workload. The difference is not statistically significant with only a single benchmark run.

---

## Approach 3: Sequential Synchronous (Baseline) (`sync_normal_test`)

```ruby
def sync_normal_test
  results = Concurrent::Array.new
  3.times do |i|
    results << sync_http(i + 1)
  end
  puts results.join
end
```

### How It Works

This is the **control group** — the simplest possible implementation with zero concurrency. The loop calls `sync_http` three times, and each call blocks until the response is received before the next call begins. There are no threads, no fibers, no event loops, no parallelism.

### The Execution Timeline

```
Time ─────────────────────────────────────────────────────────────────────────────────────────►

Request 1: [start] ──────────── [waiting ~2.8s] ──────────── [done]
Request 2:                                                    [start] ──────────── [waiting ~2.8s] ──────────── [done]
Request 3:                                                                                                      [start] ──────────── [waiting ~2.8s] ──────────── [done]
```

Each request must fully complete (including all network overhead) before the next one starts.

### Why the Result Is ~8.59 Seconds

The result of **8.594 seconds** is the sum of three individual HTTP round trips:

```
8.594 / 3 ≈ 2.86 seconds per request
```

Each request consists of approximately:

- ~0.05s for DNS resolution (may be cached after the first request)
- ~0.15s for TCP handshake
- ~0.25s for TLS handshake
- ~0.01s for sending the request
- ~1.60s for the server-side delay
- ~0.80s for response transmission and miscellaneous network latency

This confirms that each request takes roughly **2.8-2.9 seconds** in practice, and the sequential total is approximately 3x that value.

### Why This Baseline Matters

This baseline is essential because it establishes the **upper bound** of execution time. Any concurrent approach that doesn't significantly beat this number is broken or misconfigured. The theoretical speedup for perfect concurrency with 3 requests is a factor of 3 — from ~8.59 seconds down to ~2.86 seconds. The observed concurrent results (~2.93 to ~3.26 seconds) are very close to this theoretical optimum, confirming that all concurrent approaches are working correctly.

**What would happen if the delay were reduced to 0 seconds?** The total time would be dominated by network latency and TLS handshake time rather than the server delay. The absolute times would be shorter (maybe ~0.5-1 second total for sequential), and the relative speedup from concurrency would be **less dramatic** because the per-request overhead is smaller. The concurrency advantage becomes more pronounced as the per-request wait time increases.

---

## Approach 4: Native Ruby Threads (`sync_thread_test`)

```ruby
def sync_thread_test
  threads = Concurrent::Array.new
  3.times do |i|
    threads << Thread.new do
      sync_http(i + 1)
    end
  end
  puts threads.map(&:value)
end
```

### How It Works

This approach uses Ruby's built-in `Thread` class to create **three native OS threads**, each making one HTTP request. The `Thread.new` call creates a new thread and immediately begins executing the block.

1. **`Thread.new do ... end`** creates a new thread. In CRuby, this maps to a **native POSIX thread** (pthread on Linux/macOS) or a **Windows thread** on Windows. Each thread has its own stack (typically ~1MB on 64-bit systems) and is managed by the OS kernel's thread scheduler.

2. **`threads.map(&:value)`** waits for all threads to complete and collects their return values. `Thread#value` blocks the calling thread until the target thread finishes, then returns the last expression evaluated in the thread's block. If the thread raised an exception, `Thread#value` re-raises it in the calling thread. This is different from `Thread#join`, which also waits but returns the `Thread` object itself rather than the block's return value.

### Why It Achieves Concurrency Despite the GIL

This is where the GIL behavior becomes critical. Even though the GIL prevents multiple threads from executing Ruby code simultaneously, here's what happens during each thread's lifetime:

1. Thread acquires the GIL.
2. Thread executes a small amount of Ruby code (setting up the `HTTParty.get` call) — **microseconds**.
3. `HTTParty.get` internally calls `Net::HTTP#request`, which calls `IO#read` on the socket, which is a C-level blocking I/O operation.
4. **CRuby releases the GIL** before the blocking I/O call.
5. The thread blocks at the OS level, waiting for data on the socket.
6. **Other threads can now acquire the GIL** and begin their own HTTP requests.
7. When data arrives on the socket, the OS wakes up the thread.
8. The thread reacquires the GIL to execute Ruby code for parsing the response.

The net effect is that all three threads are simultaneously waiting for network responses because the GIL is released during the waiting period. The GIL is only held during the tiny slivers of Ruby code execution between I/O operations.

### Why the Result Is ~3.04 Seconds

The result of **3.038 seconds** is virtually the time for a single HTTP round trip, confirming that all three requests ran concurrently. The small amount of time above the theoretical minimum comes from:

- **Thread creation overhead** — each `Thread.new` call involves a system call to create a native thread, which is more expensive than creating a fiber (~microseconds vs ~nanoseconds for fibers).
- **GIL contention** — the three threads briefly compete for the GIL during the request setup and response parsing phases.
- **OS thread scheduling** — the kernel's thread scheduler introduces small, non-deterministic context-switching delays.

### Memory and Overhead Considerations

Unlike fibers (Approach 1 and 2), threads are relatively **heavyweight**:

- Each thread allocates a **~1MB stack** by default (configurable via `Thread.new` parameters in some Ruby versions).
- Each thread is a **native OS resource** managed by the kernel scheduler. The OS has limits on the number of threads a process can create (typically 1,000-10,000 depending on the OS and configuration).
- For 3 threads, this is negligible. For 10,000 concurrent HTTP requests, you'd exhaust OS thread limits and waste ~10GB of stack memory — in that scenario, fibers (Approach 1) or a thread pool (Approach 8) would be far more appropriate.

**What would happen with 1,000 threads instead of 3?** You'd likely see performance degradation from excessive context switching, OS thread scheduling overhead, and possibly thread creation failures if the OS limit is reached. The `ThreadPoolExecutor` approach (Approach 8) addresses this by reusing a fixed pool of threads instead of creating one per task.

---

## Approach 5: Fork-Based Parallelism with IPC (`sync_fork_test`)

```ruby
def sync_fork_test
  r_pipe, w_pipe = IO.pipe
  3.times do |i|
    fork do
      r_pipe.close
      sync_http(i + 1, w_pipe)
      exit!
    end
  end
  w_pipe.close

  results = Concurrent::Array.new
  until r_pipe.eof?
    results << r_pipe.gets.chomp
  end

  Process.waitall
  puts results
end
```

### How It Works

This is the only approach in the experiment that achieves **true OS-level parallelism**. Each request runs in a completely separate process with its own PID, its own memory space, and its own copy of the Ruby interpreter (including its own GIL).

**Step-by-step execution flow:**

1. **`IO.pipe`** creates a unidirectional pipe — a pair of file descriptors where data written to `w_pipe` can be read from `r_pipe`. This is the IPC (Inter-Process Communication) channel. Pipes are a fundamental Unix primitive for connecting the output of one process to the input of another.

2. **`fork do ... end`** (inside the loop) calls `Process.fork`, which creates a **child process** by duplicating the entire parent process. The child is an exact copy of the parent at the moment of the fork: same memory, same open file descriptors, same loaded gems, same variable values. After the fork, parent and child diverge — changes in one are invisible to the other because they occupy separate memory spaces. The block given to `fork` is executed only in the child process. The parent continues executing after the `fork` call.

3. **`r_pipe.close`** (in the child) — The child process closes its copy of the read end of the pipe because it only needs to _write_ results, not read them. This is important: if the child keeps the read pipe open, the parent's `r_pipe.eof?` check will never return `true` because the pipe appears to still have a potential writer (the child's unclosed read end).

4. **`sync_http(i + 1, w_pipe)`** — The child process makes the HTTP request and writes the result to the pipe via `w_pipe.puts(...)`.

5. **`exit!`** — The child process terminates immediately using `exit!` (not `exit`). The difference is critical: `exit!` skips Ruby's `at_exit` handlers, finalizers, and signal handlers. Using `exit` could trigger cleanup code (like closing database connections) that was intended for the parent, not the child. This is a defensive pattern to avoid unintended side effects in forked processes.

6. **`w_pipe.close`** (in the parent) — After all children are forked, the parent closes its copy of the write end. This is essential: without this, `r_pipe.eof?` in the parent would **never** return `true` because the pipe still has the parent's write end open, making it theoretically possible for more data to be written.

7. **`until r_pipe.eof?`** — The parent reads results from the pipe, line by line, until all writers (child processes) have closed their write ends and the pipe is drained.

8. **`Process.waitall`** — The parent waits for all child processes to terminate and collects their exit statuses. This prevents **zombie processes** — terminated child processes whose exit status hasn't been collected by the parent. Zombies consume process table entries and, in extreme cases, can prevent the system from creating new processes.

### Why the Result Is ~3.12 Seconds

The result of **3.117 seconds** shows that forking achieves the same effective concurrency as threads and fibers for I/O-bound work. The three child processes run truly in parallel — each with its own Ruby interpreter and GIL — so they can make HTTP requests simultaneously.

The slightly higher time compared to threads (3.038s) is explained by the overhead of forking:

- **`fork` system call** — duplicating the process is expensive. Modern OS kernels use **copy-on-write (CoW)** semantics, meaning the child's memory pages are initially shared with the parent and only physically copied when the child modifies them. This reduces the cost, but the system call itself still takes ~1-5 milliseconds.
- **IPC overhead** — writing to and reading from pipes involves system calls (`write()`, `read()`) with kernel-user space context switches. This is slower than simply reading a shared variable in threaded code.
- **Child process initialization** — each child inherits the full Ruby runtime, including loaded gems and parsed source code. While CoW avoids copying the actual memory, the child still needs to initialize its own file descriptors and signal handlers.

### Important Platform Note

**`Process.fork` is not available on all platforms.** It relies on the Unix `fork()` system call, which is available on Linux, macOS, and other POSIX-compliant systems. On **Windows**, `fork` is **not supported** — calling it raises `NotImplementedError`. This is a significant limitation for cross-platform applications. If you need cross-platform parallelism, threads or the `parallel` gem (which can fall back to threads) are safer choices.

### Why This Approach Is Overkill for I/O-Bound Work

Forking is the heaviest concurrency mechanism available. Each child process:

- Duplicates the entire address space (even with CoW, this involves page table duplication).
- Gets its own GIL instance.
- Requires IPC for data sharing.
- Must be waited on to prevent zombies.

For I/O-bound work, all of this overhead is unnecessary because the GIL is already released during I/O waits. Threads achieve the same concurrency with a fraction of the resource cost. Forking only becomes advantageous when you need **true parallelism for CPU-bound work**, where the GIL would prevent threads from running simultaneously.

---

## Approach 6: Concurrent::Promise (Legacy API) (`sync_concurrent_test`)

```ruby
def sync_concurrent_test
  results = Concurrent::Array.new
  3.times do |i|
    results << Concurrent::Promise.execute do
      sync_http(i + 1)
    end
  end
  results = results.map(&:value)
  puts results
end
```

### How It Works

The `concurrent-ruby` gem provides `Concurrent::Promise`, a high-level abstraction over thread pool execution. It's conceptually similar to JavaScript's `Promise` — you define work to be done, and the promise manages the execution and state transitions for you.

1. **`Concurrent::Promise.execute do ... end`** immediately schedules the block for execution on a **global thread pool** managed by `concurrent-ruby`. The `execute` method creates the promise _and_ starts execution in one call. This is different from some promise implementations where you need to separate creation from execution.

2. **The global thread pool** — By default, `concurrent-ruby` maintains a cached thread pool (`Concurrent.global_io_executor`) for I/O-bound work. This pool creates threads as needed and reuses idle threads for new tasks. The pool has configurable limits (default: max threads = number of processors \* a multiplier, but at least 5). Since we only have 3 tasks, the pool easily accommodates all of them.

3. **`results.map(&:value)`** — `.value` on a promise blocks the calling thread until the promise resolves (completes successfully or fails). The `&:value` syntax is Ruby shorthand for `{ |p| p.value }`. This effectively waits for all three promises to complete and collects their results. If a promise raised an exception, `.value` returns `nil` by default (not re-raises like `Thread#value`). To get exceptions propagated, you'd use `.value!` instead.

### Promise State Machine

`Concurrent::Promise` follows a state machine model:

```
[pending] ──execute──► [processing] ──success──► [fulfilled] (has value)
                                     ──failure──► [rejected]  (has reason)
```

- **pending** — The promise has been created but not yet scheduled.
- **processing** — The block is currently executing on a thread pool thread.
- **fulfilled** — The block completed successfully; `.value` returns the result.
- **rejected** — The block raised an exception; `.reason` returns the exception.

### Why the Result Is ~2.93 Seconds (Fastest)

The result of **2.934 seconds** is the fastest in the entire benchmark. This is likely due to:

- **Pre-warmed thread pool** — If the global thread pool already has idle threads (from a previous test or from internal `concurrent-ruby` initialization), there's zero thread creation overhead. The tasks are dispatched to existing threads immediately.
- **Minimal abstraction overhead** — The promise API is thin; the main cost is scheduling and synchronization, both of which are highly optimized in `concurrent-ruby`.
- **Network variance** — With a single benchmark run, the 0.1-second advantage over the next fastest approach is within the margin of network variability. If the benchmark were run 100 times and averaged, the difference between approaches would likely converge.

**What would happen if `.value!` (with bang) were used instead of `.value`?** The behavior would be the same when requests succeed. But if an HTTP request fails and raises an exception, `.value!` would propagate the exception to the calling thread, while `.value` would silently return `nil`. In production code, `.value!` is generally preferred because silent failures are harder to debug.

---

## Approach 7: Concurrent::Promises (Modern API) (`sync_concurrent_promise_test`)

```ruby
def sync_http_promise(index)
  Concurrent::Promises.future do
    HTTParty.get("https://httpbin.org/delay/1.6")
    " sync request ok: #{index}"
  end
end

def sync_concurrent_promise_test
  tasks = Concurrent::Array.new
  3.times do |i|
    tasks << sync_http_promise(i + 1)
  end
  tasks = Concurrent::Promises.zip(*tasks)
  puts tasks.value
end
```

### How It Works

This approach uses the **newer `Concurrent::Promises` API**, which is the replacement for the legacy `Concurrent::Future` and `Concurrent::Promise` classes. The documentation explicitly marks the older APIs as deprecated in favor of this one.

1. **`Concurrent::Promises.future do ... end`** creates a "future" — a promise that begins executing immediately on the global thread pool. The block's return value becomes the future's resolved value. Unlike the older `Concurrent::Promise.execute`, the `Promises.future` API is designed to be composable — futures can be chained, combined, and transformed using a fluent API.

2. **`Concurrent::Promises.zip(*tasks)`** combines multiple futures into a single future that resolves when **all** of the input futures have resolved. This is directly analogous to JavaScript's `Promise.all()`. The `*tasks` splat operator unpacks the array of futures into individual arguments for the `zip` method.

3. **`tasks.value`** on the zipped future blocks until all constituent futures have resolved, then returns an array of their values.

### Why a Separate Helper Function?

The `sync_http_promise` function is separated from `sync_concurrent_promise_test` because it encapsulates the HTTP call _and_ the future creation in a single unit. This is a common pattern in promise-based architectures — each asynchronous operation is a function that returns a future/promise, and the calling code composes these futures using combinators like `zip`, `then`, `flat_map`, etc.

This pattern has a practical advantage: **the HTTP call and the result string construction both happen inside the future's block**. This means the entire operation — request + response + string formatting — runs on the thread pool thread, keeping the main thread free.

Compare this with Approach 6, where `sync_http` is called _inside_ the promise block but the function itself doesn't know it's running in a concurrent context. Both approaches work, but Approach 7's pattern is more explicit about the asynchronous boundary.

### The `.zip` Combinator

`Concurrent::Promises.zip` is one of many combinators available:

| Combinator                      | Behavior                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| `zip(*futures)`                 | Resolves when **all** futures resolve (like `Promise.all`)  |
| `any(*futures)`                 | Resolves when **any** future resolves (like `Promise.race`) |
| `future.then { \|v\| ... }`     | Chains a transformation on the resolved value               |
| `future.rescue { \|e\| ... }`   | Handles rejection/exceptions                                |
| `future.flat_map { \|v\| ... }` | Chains a transformation that returns another future         |

**What would happen if `zip` were replaced with `any`?** Only the fastest request's result would be captured. The total time would be approximately **the time of the fastest single request** (possibly slightly less than the ~2.9 seconds observed with `zip`), and the other two requests would continue running in the background on the thread pool until they complete or the process exits.

### Why the Result Is ~2.99 Seconds

The result of **2.987 seconds** is effectively identical to Approach 6 (2.934s), within network variance. Both approaches use the same underlying thread pool (`Concurrent.global_io_executor`). The modern Promises API adds negligible overhead — the `zip` combinator is implemented as a simple callback registration on each constituent future.

---

## Approach 8: ThreadPoolExecutor (`sync_concurrent_threadpool_test`)

```ruby
def sync_concurrent_threadpool_test
  executor = Concurrent::ThreadPoolExecutor.new(
    min_threads: 5,
    max_threads: 5,
    max_queue: 10,
    fallback_policy: :caller_runs
  )
  results = Concurrent::Array.new
  3.times do |i|
    executor.post do
      results << sync_http(i + 1)
    end
  end
  executor.shutdown
  executor.wait_for_termination
  puts results
end
```

### How It Works

This approach explicitly creates a **thread pool** with specific configuration parameters, rather than relying on the default global executor. This gives you fine-grained control over thread count, queue depth, and overflow behavior.

1. **`Concurrent::ThreadPoolExecutor.new(...)`** creates a new thread pool with the following configuration:
   - **`min_threads: 5`** — The pool always maintains at least 5 threads, even when idle. These threads are pre-created and ready to accept work immediately. This eliminates the thread creation overhead for the first 5 tasks.
   - **`max_threads: 5`** — The pool never creates more than 5 threads. Since `min_threads == max_threads`, this is a **fixed-size pool** — there are always exactly 5 threads. Fixed-size pools are predictable and prevent runaway thread creation.
   - **`max_queue: 10`** — Up to 10 tasks can be queued when all threads are busy. If a task is submitted and all 5 threads are occupied but the queue has space, the task waits in the queue. The queue acts as a buffer between task submission and execution.
   - **`fallback_policy: :caller_runs`** — This determines what happens when the queue is full **and** all threads are busy. `:caller_runs` means the **submitting thread itself** executes the task synchronously. Other options include `:abort` (raises an exception), `:discard` (silently drops the task), and `:discard_oldest` (drops the oldest queued task to make room).

2. **`executor.post do ... end`** submits a block for execution on the thread pool. The block is either immediately picked up by an idle thread or placed in the queue. The `post` method is non-blocking — it returns immediately regardless of whether the task has started.

3. **`executor.shutdown`** tells the pool to stop accepting new tasks. Already-submitted tasks continue executing. This is a graceful shutdown — it's not the same as `kill` which would forcefully terminate threads.

4. **`executor.wait_for_termination`** blocks the calling thread until all submitted tasks have completed and all worker threads have exited. This is the synchronization point — after this call, all results are guaranteed to be in the `results` array.

### Why 5 Threads for 3 Tasks?

The pool is configured with 5 threads but only 3 tasks are submitted. This means 2 threads remain idle throughout the benchmark. This is intentional — the configuration is meant to demonstrate a realistic production setup where the pool is sized for expected peak load, not for the exact number of tasks.

**What would happen with `max_threads: 1`?** The pool would only have one thread, and tasks would execute sequentially (one at a time from the queue). The total time would be similar to the sequential baseline (~8.59 seconds) because only one request can be in progress at any moment.

**What would happen with `max_threads: 3, max_queue: 0`?** With a queue size of 0 and exactly 3 threads for 3 tasks, each task would be dispatched to its own thread immediately. The behavior would be identical to the current configuration but with less overhead from unused threads.

### The `fallback_policy: :caller_runs` Safety Net

This configuration option deserves special attention. In a production environment where you might submit thousands of tasks:

- **`:caller_runs`** provides **back-pressure**. When the system is overloaded, the calling thread slows down by executing tasks itself, which naturally throttles the submission rate. This prevents unbounded queue growth and out-of-memory errors.
- **`:abort`** immediately raises a `Concurrent::RejectedExecutionError`, forcing the caller to handle the overload explicitly.
- **`:discard`** silently loses work, which is acceptable for non-critical tasks (like metrics reporting) but unacceptable for important operations (like payment processing).

### Comparison to Python's ThreadPoolExecutor

The original code comment notes the similarity to Python's `concurrent.futures.ThreadPoolExecutor`. The comparison is apt:

| Feature           | Ruby `Concurrent::ThreadPoolExecutor` | Python `concurrent.futures.ThreadPoolExecutor` |
| ----------------- | ------------------------------------- | ---------------------------------------------- |
| Fixed thread pool | Yes (`min_threads == max_threads`)    | Yes (`max_workers` parameter)                  |
| Task queue        | Yes (`max_queue`)                     | Yes (unbounded by default)                     |
| Future/Promise    | Via separate API                      | Built-in via `Future` objects                  |
| Fallback policy   | Configurable (4 options)              | Not configurable (raises exception)            |
| GIL impact        | Released during I/O                   | Released during I/O                            |

Both are effective for I/O-bound work in GIL-constrained runtimes.

### Why the Result Is ~3.01 Seconds

The result of **3.012 seconds** is consistent with all other concurrent approaches. The thread pool adds minimal overhead compared to raw threads because the threads are pre-created. The small additional time (compared to Approach 6's 2.934s) is within network variance and could also be attributed to the overhead of queue management and internal synchronization within the executor.

---

## Approach 9: Parallel Gem (`sync_parallel_test`)

```ruby
def sync_parallel_test
  results = Concurrent::Array.new
  Parallel.map(
    1..3,
    in_threads: 3
  ) do |i|
    results << sync_http(i)
  end
  puts results
end
```

### How It Works

The `parallel` gem provides the **highest-level abstraction** in this experiment. It wraps thread or process management behind a simple `map`-like interface.

1. **`Parallel.map(1..3, in_threads: 3)`** iterates over the range `1..3` and executes the block for each element in a separate thread, using up to 3 threads. The `map` method blocks until all iterations complete, then returns an array of the block's return values.

2. **`in_threads: 3`** specifies that threads should be used for concurrency, with a maximum of 3 threads. Alternative options include:
   - `in_processes: 3` — uses `fork` to create child processes instead of threads.
   - `in_threads: 3, progress: "Processing"` — displays a progress bar.
   - No concurrency option — `Parallel.map` defaults to process-based parallelism using the number of available CPU cores.

3. **`results << sync_http(i)`** — Note that results are pushed into a `Concurrent::Array` manually. The `Parallel.map` method also returns an array of results (the return values of each block), so the explicit `results` array is somewhat redundant here. In the experiment, it's used for consistency with the other approaches.

### Why It's the Simplest Approach

Compare the boilerplate required for each approach:

```ruby
# Approach 4: Native Threads — 7 lines of thread management
threads = Concurrent::Array.new
3.times { |i| threads << Thread.new { sync_http(i + 1) } }
threads.map(&:value)

# Approach 8: ThreadPoolExecutor — 12 lines of pool configuration
executor = Concurrent::ThreadPoolExecutor.new(min_threads: 5, ...)
3.times { |i| executor.post { sync_http(i + 1) } }
executor.shutdown
executor.wait_for_termination

# Approach 9: Parallel — 3 lines
Parallel.map(1..3, in_threads: 3) { |i| sync_http(i) }
```

The `parallel` gem abstracts away thread lifecycle management, error handling, and result collection. This makes it ideal for simple use cases where you don't need fine-grained control over the thread pool.

### Trade-offs of Simplicity

The simplicity comes with trade-offs:

- **Less control** — You can't configure queue sizes, fallback policies, or thread reuse strategies like you can with `ThreadPoolExecutor`.
- **No composability** — Unlike `Concurrent::Promises`, you can't chain transformations, combine futures, or build complex async workflows.
- **Error handling** — By default, `Parallel.map` raises the first exception encountered and terminates remaining threads/processes. For more sophisticated error handling, you'd need to rescue exceptions inside the block.

### Why the Result Is ~3.00 Seconds

The result of **2.997 seconds** is effectively the same as all other concurrent approaches. Under the hood, `Parallel.map(in_threads: 3)` creates 3 threads and distributes work across them — the same mechanism as Approach 4 (native threads), just with a cleaner API.

---

## The Self-Inspecting Benchmark Runner

```ruby
threads = []
File.foreach(File.expand_path(__FILE__)) do |func|
  reg = Regexp.new(/^def\s+([^\s\()]+)/).match(func)
  if !reg.nil?
    if reg[1].end_with?("test")
      threads << Thread.new do
        puts " Running: #{reg[1].upcase}"
        benchmark = Benchmark.measure {
          send(reg[1])
        }
        " Benchmark function: #{reg[1].upcase} finished at: #{benchmark.real}\n"
      end
    end
  end
end
result = threads.map(&:value)
puts result.join
```

### How It Works

This is a clever **metaprogramming** pattern where the script reads its own source code to discover which functions to benchmark. Let's break it down:

1. **`File.foreach(File.expand_path(__FILE__))`** — Opens the current script file and iterates over each line. `__FILE__` is a Ruby magic constant that holds the path of the currently executing file. `File.expand_path` resolves it to an absolute path.

2. **`Regexp.new(/^def\s+([^\s\()]+)/)`** — Matches lines that define Ruby methods. The regex pattern:
   - `^def` — the line starts with `def` (method definition keyword).
   - `\s+` — followed by one or more whitespace characters.
   - `([^\s\()]+)` — captures the method name (one or more characters that are not whitespace, open paren, or close paren).

3. **`reg[1].end_with?("test")`** — Filters for methods whose names end with `"test"`. This convention ensures only test functions are benchmarked — helper functions like `get_http`, `sync_http`, and `sync_http_promise` are excluded.

4. **`Thread.new do ... end`** — Each discovered test function is run in its own thread. This is important because it means **all nine benchmarks run simultaneously**. This design choice has implications (discussed below).

5. **`send(reg[1])`** — Dynamically calls the method by name. `send` is a Ruby method that invokes a method given its name as a string or symbol. This is the metaprogramming "magic" that allows the runner to call methods without hardcoding their names.

6. **`Benchmark.measure { ... }`** — Wraps the method call in a benchmark block that measures CPU time and wall-clock time. `.real` extracts the wall-clock (real/elapsed) time, which is what matters for I/O-bound benchmarks. (CPU time would show how much time the CPU spent executing Ruby code, which is negligible for I/O-bound work.)

### Design Implications: All Tests Run Simultaneously

Because each test function runs in its own thread, **all nine tests execute at the same time**. This means:

- **Network contention** — Up to 27 HTTP requests (9 tests x 3 requests each) may be in flight simultaneously. This could cause contention at the network level (local socket limits, bandwidth) or at the server level (httpbin.org might throttle or slow down under load).
- **GIL contention** — Threads from different test functions compete for the GIL. While this doesn't matter much for I/O-bound work, it could add small delays to the Ruby code execution between I/O operations.
- **Timing accuracy** — The benchmark times include any slowdown caused by competing tests. If each test were run in complete isolation (sequentially), the individual times might be slightly different.

However, since all concurrent tests show similar times (~3 seconds) and the sequential test shows ~8.59 seconds (approximately 3x a single concurrent test), the simultaneous execution doesn't appear to significantly distort the results.

**What would happen if the tests ran sequentially?** The total benchmark time would be much longer (sum of all tests rather than max of all tests), but individual test times might be slightly more accurate due to less contention. For a rigorous benchmark, you'd want to run each test in isolation, repeat it multiple times, and report the mean and standard deviation.

---

## Benchmark Results and Analysis

### Raw Results

```
Benchmark function: ASYNC_TEST finished at: 3.2570847679999133
Benchmark function: ASYNC_ANOTHER_TEST finished at: 3.1932133710006383
Benchmark function: SYNC_NORMAL_TEST finished at: 8.593838957999651
Benchmark function: SYNC_THREAD_TEST finished at: 3.0380510249997315
Benchmark function: SYNC_FORK_TEST finished at: 3.1174781950003307
Benchmark function: SYNC_CONCURRENT_TEST finished at: 2.9335770309999134
Benchmark function: SYNC_CONCURRENT_PROMISE_TEST finished at: 2.9874192970000877
Benchmark function: SYNC_CONCURRENT_THREADPOOL_TEST finished at: 3.011546085000191
Benchmark function: SYNC_PARALLEL_TEST finished at: 2.997427269000582
```

### Summary Table

| #   | Approach                      | Method                            | Time (s)  | Speedup vs Sequential |
| --- | ----------------------------- | --------------------------------- | :-------: | :-------------------: |
| 1   | Async + non-blocking HTTP     | `async_test`                      |   3.257   |         2.64x         |
| 2   | Async + blocking HTTP         | `async_another_test`              |   3.193   |         2.69x         |
| 3   | Sequential (baseline)         | `sync_normal_test`                | **8.594** |         1.00x         |
| 4   | Native Ruby Threads           | `sync_thread_test`                |   3.038   |         2.83x         |
| 5   | Process Fork + IPC            | `sync_fork_test`                  |   3.117   |         2.76x         |
| 6   | Concurrent::Promise           | `sync_concurrent_test`            | **2.934** |         2.93x         |
| 7   | Concurrent::Promises (modern) | `sync_concurrent_promise_test`    |   2.987   |         2.88x         |
| 8   | ThreadPoolExecutor            | `sync_concurrent_threadpool_test` |   3.012   |         2.85x         |
| 9   | Parallel gem (threads)        | `sync_parallel_test`              |   2.997   |         2.87x         |

### Visual Comparison

```
                                       Time (seconds)
                                  0    1    2    3    4    5    6    7    8    9
                                  |    |    |    |    |    |    |    |    |    |
async_test                        ████████████████████████████████▎           3.26s
async_another_test                ███████████████████████████████▉            3.19s
sync_normal_test                  █████████████████████████████████████████████████████████████████████████████████████▉ 8.59s
sync_thread_test                  ██████████████████████████████▍             3.04s
sync_fork_test                    ███████████████████████████████▏            3.12s
sync_concurrent_test              █████████████████████████████▎              2.93s  ◄ fastest
sync_concurrent_promise_test      █████████████████████████████▉             2.99s
sync_concurrent_threadpool_test   ██████████████████████████████▏             3.01s
sync_parallel_test                █████████████████████████████▉             3.00s
```

### Statistical Observations

If we exclude the sequential baseline, the concurrent approaches form a tight cluster:

- **Mean:** 3.067 seconds
- **Range:** 2.934 – 3.257 seconds (spread of 0.323 seconds)
- **Coefficient of variation:** ~3.6%

The 0.323-second spread across eight different concurrency approaches is remarkably small. It strongly suggests that the **network round-trip time is the dominant factor**, and the choice of concurrency mechanism has negligible impact on performance for I/O-bound work.

---

## Why All Concurrent Approaches Converge to ~3 Seconds

This is the central finding of the experiment and it deserves a thorough explanation.

### The Theoretical Lower Bound

The theoretical minimum time for 3 concurrent requests to `httpbin.org/delay/1.6` is the time for a **single request** — approximately **2.8-3.0 seconds** (1.6s server delay + ~1.2-1.4s network overhead). No concurrency model can beat this because you're waiting for the network, and the network doesn't care how many fibers, threads, or processes you have.

### Why 3 Seconds and Not 1.6 Seconds

The delay endpoint adds 1.6 seconds to the response, but the total round-trip includes:

```
Single request time breakdown (approximate):
├── DNS resolution:        0.01 - 0.05s (cached after first)
├── TCP SYN/SYN-ACK/ACK:   0.05 - 0.20s (depends on distance to server)
├── TLS handshake:          0.10 - 0.40s (2-4 round trips for TLS 1.2/1.3)
├── HTTP request send:      0.01 - 0.02s
├── Server delay:           1.60s        (the /delay/1.6 endpoint)
├── HTTP response receive:  0.01 - 0.05s
└── Misc overhead:          0.05 - 0.20s
    ─────────────────────────────────────
    Total:                  ~1.83 - 2.52s (best case to typical case)
```

The observed ~3 seconds per request (from the concurrent tests) suggests approximately 1.4 seconds of network overhead beyond the 1.6-second server delay. This is reasonable for a request to a public server that may be geographically distant.

### Why Concurrency Models Don't Differ Significantly

Every concurrent approach — fibers, threads, forks, promises, thread pools — achieves the same fundamental goal: **overlapping the I/O wait times** of the three requests. As long as all three requests are "in flight" simultaneously, the total time is determined by the slowest request, not the sum of all requests. The concurrency mechanism only affects:

1. **How quickly tasks are dispatched** — Creating a fiber takes nanoseconds, creating a thread takes microseconds, forking takes milliseconds. But these differences are dwarfed by the 3-second network round trip.
2. **How efficiently tasks are scheduled** — Event loops, OS thread schedulers, and thread pool dispatchers all add small overhead, but again, this is negligible compared to the I/O wait.
3. **How results are collected** — Reading from a pipe (fork), joining a thread, resolving a promise — these have different costs, but all are in the microsecond range.

The bottom line is captured perfectly by the original experiment's conclusion:

> _"Having a powerful device to run a threadpool with multi cores is great, but in I/O bound like HTTP requests, it's useless if the internet and server are slow."_

---

## Factors That Influence the Results

### Network-Level Factors

1. **Internet connection speed and latency** — A faster internet connection reduces the non-delay portion of each request, bringing concurrent times closer to the theoretical 1.6-second minimum. A slower connection increases it. On a very slow connection (e.g., satellite internet with 600ms latency), each request might take 4+ seconds, and the concurrent results would cluster around 4 seconds instead of 3.

2. **Geographic distance to httpbin.org** — `httpbin.org` servers are hosted on cloud infrastructure. The physical distance between the test machine and the server determines the base latency. A request from a machine in the same AWS region as the server would be faster than one from another continent.

3. **DNS caching** — The first request incurs DNS resolution time. Subsequent requests benefit from the DNS cache (either the OS cache or the Ruby DNS resolver cache). In the concurrent tests, 2 of the 3 requests might benefit from the DNS cache, slightly reducing their total time.

4. **TLS session resumption** — Modern TLS implementations support session resumption, where subsequent connections to the same server can skip part of the TLS handshake. If the HTTP client supports connection pooling (as `async-http` does), later requests reuse the same TLS session, reducing overhead.

5. **TCP connection reuse (keep-alive)** — Some HTTP clients maintain persistent connections. If the first request establishes a connection and subsequent requests reuse it, the TCP and TLS handshake overhead is eliminated for later requests. `async-http` supports this by default; `HTTParty` can support it with explicit configuration.

### Server-Level Factors

1. **httpbin.org response time variability** — As a public, shared service, `httpbin.org`'s response time isn't perfectly consistent. Under heavy load from other users, the 1.6-second delay might become 1.7 or 1.8 seconds. This introduces variance into the benchmark results.

2. **Server-side rate limiting** — If too many requests are sent simultaneously (e.g., if the experiment used 100 requests instead of 3), `httpbin.org` might rate-limit or reject connections, causing retries and increased total time.

3. **Server-side connection limits** — HTTP servers have limits on the number of concurrent connections from a single IP. If this limit is reached, additional requests are queued at the server, effectively serializing them.

### Local Machine Factors

1. **CPU speed** — Affects how quickly Ruby code executes (request construction, response parsing), but this is negligible for I/O-bound work.

2. **Available memory** — Fork-based parallelism duplicates the process memory. On a memory-constrained system, forking could trigger swapping, drastically slowing down the benchmark.

3. **Number of CPU cores** — Has **no impact** on I/O-bound benchmark results in CRuby. Even with one core, all concurrent approaches would show similar times because threads release the GIL during I/O. However, for CPU-bound work, the number of cores would significantly affect fork-based parallelism.

4. **OS thread limits** — The default thread limit (`ulimit -u` on Linux) determines how many threads can be created. For 3 threads, this is never an issue, but for thousands of threads, it could become a bottleneck.

5. **File descriptor limits** — Each socket (HTTP connection) consumes a file descriptor. The default limit (`ulimit -n`) is often 1024 on Linux. With 3 connections, this isn't a concern, but with hundreds of concurrent requests, you'd need to increase this limit.

6. **Background processes** — Other processes on the machine compete for CPU time, network bandwidth, and file descriptors. A heavily loaded machine might show higher variance in benchmark results.

### Ruby Runtime Factors

1. **Ruby version** — Different Ruby versions have different GIL implementations, fiber schedulers, and garbage collectors. Ruby 3.0+ introduced the Fiber Scheduler interface, which is critical for Approaches 1 and 2. Older Ruby versions would not benefit from the transparent I/O scheduling in Approach 2.

2. **GC (Garbage Collection) pauses** — Ruby's garbage collector periodically pauses all threads to reclaim unused memory. A GC pause during the benchmark could add 10-100ms of delay. With only 3 short-lived requests, GC pauses are unlikely but possible.

3. **JIT compilation (YJIT/MJIT)** — Ruby 3.1+ includes YJIT, a just-in-time compiler. While JIT compilation speeds up Ruby code execution, it has negligible impact on I/O-bound benchmarks because the execution time is dominated by network waits, not Ruby bytecode execution.

---

## Limitations of This Experiment

While the experiment is well-designed for its purpose, several limitations should be acknowledged:

### 1. Single Run, No Statistical Rigor

The benchmark was run **once**. A rigorous benchmark would run each test **multiple times** (e.g., 30-100 iterations), discard outliers, and report the **mean, median, standard deviation, and confidence intervals**. A single run is susceptible to network fluctuations, GC pauses, and OS scheduling anomalies.

### 2. All Tests Run Simultaneously

As discussed in the benchmark runner section, all nine tests run at the same time, creating contention. A more controlled experiment would run each test in isolation, with a warm-up period between tests to allow the network and OS to stabilize.

### 3. Small Request Count

Three requests is sufficient to demonstrate the concept but doesn't reveal how each approach **scales**. With 100 or 1,000 requests, you'd start to see differences:

- **Fibers** would scale to thousands with minimal overhead.
- **Threads** would hit OS limits and context-switching overhead around 1,000-10,000.
- **Forks** would hit process limits and memory pressure much sooner (tens to hundreds).
- **Thread pools** would queue excess work, revealing the impact of pool sizing.

### 4. Only I/O-Bound Work

The experiment exclusively tests I/O-bound work. A comprehensive comparison would also include CPU-bound benchmarks, mixed workloads (I/O + CPU), and workloads with varying I/O patterns (short bursts vs. sustained streams).

### 5. Single External Endpoint

All requests go to `httpbin.org`. In a real-world application, you might be making requests to multiple different servers, each with different latencies, connection limits, and TLS configurations. The behavior of connection pooling and DNS resolution would differ significantly.

### 6. No Error Handling

None of the test functions handle errors (connection timeouts, HTTP errors, DNS failures). In production, error handling and retry logic add complexity and can affect the performance characteristics of different concurrency models. For example, retrying a failed request in a fiber-based system is straightforward (just retry in the same fiber), while retrying in a fork-based system requires restarting the child process or communicating the failure back to the parent.

### 7. CRuby-Specific

The results are specific to CRuby/MRI. Running the same experiment on JRuby or TruffleRuby — which don't have a GIL — would produce different results, especially for any test that mixes I/O-bound and CPU-bound work within the same request.

### 8. Platform Dependency for Fork

The `sync_fork_test` uses `Process.fork`, which is **not available on Windows**. If this experiment were run on a Windows machine, that specific test would raise `NotImplementedError`. The other eight approaches work cross-platform.

---

## What Would Change Under Different Conditions

### If the Workload Were CPU-Bound Instead of I/O-Bound

Replace the HTTP requests with heavy computation (e.g., computing large Fibonacci numbers or performing matrix multiplication), and the results would change dramatically:

| Approach       | I/O-Bound (current) |          CPU-Bound (hypothetical)          |
| -------------- | :-----------------: | :----------------------------------------: |
| Sequential     |       ~8.59s        |                   ~8.59s                   |
| Threads        |        ~3.0s        |   **~8.59s** (GIL prevents parallelism)    |
| Fibers (async) |        ~3.0s        |  **~8.59s** (single thread, cooperative)   |
| Forks          |        ~3.0s        | **~2.86s** (true parallelism across cores) |
| Thread pool    |        ~3.0s        |   **~8.59s** (GIL prevents parallelism)    |

For CPU-bound work in CRuby, **only forking** (or using a Ruby implementation without a GIL) would provide a speedup. Threads and fibers would perform no better than sequential execution because the GIL prevents them from executing Ruby code simultaneously.

### If the Number of Requests Were Increased to 1,000

| Approach                 | Expected Behavior with 1,000 Requests                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequential               | ~2,860 seconds (~48 minutes) — completely impractical                                                                                        |
| Threads (1,000 threads)  | ~3 seconds if the server and network can handle it, but likely degraded due to OS thread limits, context switching, and server rate-limiting |
| Fibers (1,000 fibers)    | ~3 seconds if the server can handle 1,000 concurrent connections — fibers are lightweight enough that 1,000 is trivial for the runtime       |
| Forks (1,000 processes)  | Would likely **fail** — most systems can't create 1,000 processes due to memory constraints and process limits                               |
| Thread pool (50 threads) | ~60 seconds (1,000 requests / 50 concurrent = 20 batches x 3 seconds each) — controlled and predictable                                      |

This scenario reveals the **scaling differences** between approaches that are invisible with only 3 requests.

### If the Server Delay Were 0 Seconds Instead of 1.6

With no server-side delay, each request would take only ~0.2-0.5 seconds (just network overhead). The sequential total might be ~1 second, and the concurrent total might be ~0.3 seconds. The _absolute_ difference between sequential and concurrent would be smaller, but the _relative_ speedup would still be approximately 3x. The results would also be more sensitive to the overhead of thread creation, fiber scheduling, and other concurrency mechanisms.

### If the Network Latency Were Much Higher (e.g., Satellite Internet)

With 600ms+ base latency, each request might take 5+ seconds instead of ~3. The sequential baseline would be ~15 seconds, and the concurrent approaches would cluster around ~5 seconds. The relative speedup would remain ~3x, confirming that the speedup factor is determined by the number of concurrent requests (3), not the absolute latency.

### If Ruby's Ractor Were Used (Ruby 3.0+)

Ruby 3.0 introduced **Ractors** — a new concurrency primitive designed for true parallelism without the GIL. Each Ractor has its own GIL, allowing multiple Ractors to execute Ruby code simultaneously on different cores. For CPU-bound work, Ractors would behave similarly to forks but without the overhead of duplicating the entire process. For I/O-bound work (like this experiment), Ractors would perform similarly to threads — the bottleneck remains the network.

However, Ractors have significant limitations: they restrict sharing of mutable objects between Ractors, which makes many existing Ruby libraries incompatible. As of the time of this experiment (mid-2024), Ractors are still considered experimental.

---

## Practical Guidance: Choosing the Right Tool

Based on the experiment results and the analysis above, here's a decision framework for choosing a concurrency approach in Ruby:

### For Simple I/O-Bound Concurrency (Few Tasks)

**Use native `Thread` (Approach 4) or the `parallel` gem (Approach 9).**

These are the simplest approaches with minimal dependencies. If you need to make 3-20 concurrent HTTP requests and collect the results, a few threads or `Parallel.map` will do the job with minimal code.

```ruby
# Simple and effective for small-scale concurrent I/O
results = Parallel.map(urls, in_threads: urls.length) do |url|
  HTTParty.get(url)
end
```

### For High-Volume I/O-Bound Concurrency (Many Tasks)

**Use `async` with fibers (Approach 1) or `Concurrent::ThreadPoolExecutor` (Approach 8).**

For hundreds or thousands of concurrent requests, fibers are more resource-efficient than threads (kilobytes vs megabytes of memory per task). A thread pool with bounded concurrency prevents resource exhaustion while maintaining high throughput.

```ruby
# For high-volume concurrent I/O
Async do
  barrier = Async::Barrier.new
  semaphore = Async::Semaphore.new(50) # limit to 50 concurrent
  urls.each do |url|
    barrier.async do
      semaphore.async do
        Async::HTTP::Internet.new.get(url)
      end
    end
  end
  barrier.wait
end
```

### For CPU-Bound Parallelism

**Use `Process.fork` (Approach 5) or the `parallel` gem with `in_processes` (Approach 9).**

On CRuby, these are the only approaches that achieve true parallelism for CPU-bound work. Each process gets its own GIL and can fully utilize a CPU core.

```ruby
# For CPU-bound parallelism
results = Parallel.map(data_chunks, in_processes: 4) do |chunk|
  heavy_computation(chunk)
end
```

### For Promise-Based Composition and Complex Workflows

**Use `Concurrent::Promises` (Approach 7).**

When you need to chain asynchronous operations, combine results from multiple concurrent tasks, or build complex async workflows, the `Concurrent::Promises` API provides the most expressive and composable interface.

```ruby
# For complex async workflows
fetch_user = Concurrent::Promises.future { fetch_user_data(id) }
fetch_orders = Concurrent::Promises.future { fetch_order_data(id) }

combined = Concurrent::Promises.zip(fetch_user, fetch_orders)
  .then { |user, orders| build_profile(user, orders) }
  .rescue { |error| handle_error(error) }
```

### For Cross-Platform Compatibility

**Avoid `Process.fork` (Approach 5).** It doesn't work on Windows. Use threads, fibers, or the `parallel` gem (which can fall back to threads) instead.

### Decision Matrix

| Scenario                | Recommended Approach                 | Reason                           |
| ----------------------- | ------------------------------------ | -------------------------------- |
| Few I/O-bound tasks     | `Thread` or `Parallel`               | Simple, minimal overhead         |
| Many I/O-bound tasks    | `async` fibers                       | Lightweight, scales to thousands |
| CPU-bound work (CRuby)  | `fork` or `Parallel(in_processes:)`  | Bypasses GIL                     |
| CPU-bound work (JRuby)  | `Thread` or `Concurrent::Promises`   | No GIL, threads work fine        |
| Complex async workflows | `Concurrent::Promises`               | Composable, expressive           |
| Production web server   | `async` ecosystem or Puma (threaded) | Battle-tested, efficient         |
| Cross-platform required | Anything except `fork`               | `fork` unavailable on Windows    |

---

## Final Thoughts

After dozens of hours of research, implementation, and benchmarking, the conclusion is both anticlimactic and profoundly useful: **for I/O-bound HTTP workloads in Ruby, the specific concurrency model you choose barely matters.** Fibers, threads, forks, promises, and thread pools all converge to the same ~3-second result because the bottleneck is the network, not the Ruby runtime.

But this "non-result" is actually the most important result. It tells us that:

1. **The GIL is not the enemy** for I/O-bound work. Stop worrying about it when your workload is network-bound.
2. **Complexity is not free.** If a simple `Thread.new` gives you the same performance as a `ThreadPoolExecutor` with custom configuration, prefer the simpler approach until you have a reason to need the complexity.
3. **Know your bottleneck.** Before optimizing concurrency, ask: _is my workload I/O-bound or CPU-bound?_ The answer determines which tools are effective and which are wasted effort.
4. **The network is the great equalizer.** No matter how fast your local code runs, you can't send HTTP responses faster than the speed of light through fiber optic cables (and usually, much slower than that through the various layers of the internet stack).

The real takeaway? **Measure first, optimize second.** The dozen hours spent benchmarking revealed that the simplest possible concurrent approach (native threads) is as effective as the most sophisticated one (async fibers with non-blocking I/O) for this workload. Without the benchmarks, you might have spent days implementing the "best" solution when the simplest one was already optimal.

---

## References

- [Ruby Language Official Site](https://www.ruby-lang.org/en/)
- [Ruby Thread Documentation](https://docs.ruby-lang.org/en/3.0/Thread.html)
- [Ruby Process.fork Documentation](https://docs.ruby-lang.org/en/3.0/Process.html#method-c-fork)
- [Ruby Fiber Scheduler Documentation (Ruby 3.0+)](https://docs.ruby-lang.org/en/3.1/Fiber/Scheduler.html)
- [Async Ruby — Asynchronous Tasks Guide](https://socketry.github.io/async/guides/asynchronous-tasks/index.html)
- [Async HTTP — Multiple Requests](https://socketry.github.io/async-http/#multiple-requests)
- [Concurrent Ruby — GitHub Repository](https://github.com/ruby-concurrency/concurrent-ruby)
- [Concurrent Ruby — Promises API](https://ruby-concurrency.github.io/concurrent-ruby/master/Concurrent/Promises.html)
- [Concurrent Ruby — ThreadPoolExecutor](https://ruby-concurrency.github.io/concurrent-ruby/master/Concurrent/ThreadPoolExecutor.html)
- [Concurrent Ruby — Future (Deprecated)](https://ruby-concurrency.github.io/concurrent-ruby/master/Concurrent/Future.html)
- [HTTParty — GitHub Repository](https://github.com/jnunemaker/httparty)
- [Parallel Gem — GitHub Repository](https://github.com/grosser/parallel)
- [My Adventure with Async Ruby — Bruno Sutic](https://brunosutic.com/blog/async-ruby#async-http)
- [Async Ruby — Thoughtbot](https://thoughtbot.com/blog/my-adventure-with-async-ruby)
- [Concurrent vs Parallel Programming — LinkedIn](https://www.linkedin.com/advice/0/whats-difference-between-concurrent-parallel-programming)
- [Nobody Understands the GIL — Jesse Storimer](https://www.jstorimer.com/blogs/workingwithcode/nobody-understands-the-gil)
- [Ruby Ractor Documentation](https://docs.ruby-lang.org/en/3.0/Ractor.html)
- [httpbin.org — HTTP Request & Response Service](https://httpbin.org)
