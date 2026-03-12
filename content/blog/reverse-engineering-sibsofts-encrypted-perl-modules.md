# Reverse Engineering SibSoft's Encrypted Perl Modules: From Base64 Blob to Readable Source

A client sent me a ZIP file and a single message: _"Can you figure out what this does?"_ Inside the archive was a collection of Perl files — `.pm` modules, a directory full of `.so` shared objects, and a macOS metadata folder that told me the client was on a Mac. When I opened the main file, `Session.pm`, expecting to see Perl code, I found one line of `use Sibsoft::Filter;` followed by a wall of Base64-encoded gibberish. No functions. No logic. No comments. Just thousands of characters of what looked like random noise.

That was the start of a several-hour reverse engineering session on a Windows 11 machine running WSL2, where I went from "what is this?" to a fully decrypted, human-readable Perl source file. The journey involved ELF binary analysis, Ghidra decompilation, a custom RC4 cipher variant with nibble-permuted key scheduling, and a Python reimplementation of the entire decryption pipeline. It was a freelance task — the client needed to understand what the module did, and the vendor's obfuscation was standing in the way.

This article documents every step of that process. If you have ever wondered how commercial Perl software protects its source code, how shared object files work at the ELF level, or how to reverse engineer a stream cipher from decompiled pseudocode, this is for you.

---

## Table of Contents

- [What Is SibSoft?](#what-is-sibsoft)
- [The Protection Scheme: How SibSoft Hides Perl Source Code](#the-protection-scheme-how-sibsoft-hides-perl-source-code)
- [The File Structure](#the-file-structure)
- [Understanding the Naming Convention](#understanding-the-naming-convention)
- [Background: Perl Modules, XS, and DynaLoader](#background-perl-modules-xs-and-dynaloader)
- [Step 1: Analyzing Filter.pm — The Loader](#step-1-analyzing-filterpm--the-loader)
- [Step 2: Identifying the Correct .so File](#step-2-identifying-the-correct-so-file)
- [Step 3: Reconnaissance — Peeking Inside the Binary](#step-3-reconnaissance--peeking-inside-the-binary)
- [Step 4: Ghidra — Decompiling the Shared Object](#step-4-ghidra--decompiling-the-shared-object)
- [The Decompiled Functions](#the-decompiled-functions)
- [Understanding the Cipher: RC4 with a Nibble-Permuted Key Schedule](#understanding-the-cipher-rc4-with-a-nibble-permuted-key-schedule)
- [How Standard RC4 Works](#how-standard-rc4-works)
- [How SibSoft's Variant Differs](#how-sibsofts-variant-differs)
- [Step 5: ELF Internals — Locating cbuf in the Binary](#step-5-elf-internals--locating-cbuf-in-the-binary)
- [A Crash Course on ELF Program Headers](#a-crash-course-on-elf-program-headers)
- [Finding cbuf's Virtual Address](#finding-cbufs-virtual-address)
- [Computing the File Offset](#computing-the-file-offset)
- [Extracting the Key Material](#extracting-the-key-material)
- [Step 6: Extracting the Encrypted Blob from Session.pm](#step-6-extracting-the-encrypted-blob-from-sessionpm)
- [Step 7: Reimplementing the Cipher in Python](#step-7-reimplementing-the-cipher-in-python)
- [Step 8: Decryption — The Moment of Truth](#step-8-decryption--the-moment-of-truth)
- [Why This Protection Scheme Is Weak](#why-this-protection-scheme-is-weak)
- [What a Stronger Scheme Would Look Like](#what-a-stronger-scheme-would-look-like)
- [Legal and Ethical Considerations](#legal-and-ethical-considerations)
- [Tools Used](#tools-used)
- [Lessons Learned](#lessons-learned)
- [References](#references)

---

## What Is SibSoft?

**SibSoft** (sibsoft.net) is a software company that develops and sells commercial web hosting scripts, most notably **XFileSharing Pro** — a file-sharing and hosting platform similar to services like MediaFire or RapidShare. Their product line also includes video hosting scripts, URL shorteners, and related web infrastructure tools. The software is written primarily in **Perl**, a language that was dominant in web development during the late 1990s and 2000s, and still powers a significant amount of legacy web infrastructure today.

Because SibSoft sells their software as a commercial product (licenses typically range from $100 to $500+), they have a strong incentive to protect their source code from unauthorized copying, modification, and redistribution. Unlike compiled languages like C or Go, where the source code is transformed into machine code before distribution, Perl is an **interpreted language** — the source code _is_ the program. If you ship readable `.pm` files, anyone who buys a single license can read, modify, and redistribute the code without restriction.

SibSoft's solution to this problem is **source code encryption**: they ship Perl modules that contain encrypted blobs instead of readable source code. The decryption happens at runtime, using a compiled C shared object (`.so` file) that is loaded via Perl's `DynaLoader` mechanism. The Perl interpreter never sees the original source code on disk — it only exists in memory, briefly, during execution.

This is a form of **obfuscation through encryption**, and as we will see, it provides a reasonable barrier against casual inspection but is fundamentally breakable by anyone with the right tools and knowledge.

---

## The Protection Scheme: How SibSoft Hides Perl Source Code

The protection scheme works in three layers:

```bash
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Session.pm (and other modules)                     │
│  Contains: use Sibsoft::Filter; + Base64-encoded ciphertext  │
│  Purpose: The encrypted payload                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ at runtime, Filter decrypts this
┌──────────────────────▼──────────────────────────────────────┐
│  Layer 2: Filter.pm                                          │
│  Contains: DynaLoader code that selects the right .so        │
│  Purpose: Bridge between Perl and the compiled decryptor     │
└──────────────────────┬──────────────────────────────────────┘
                       │ loads the appropriate binary
┌──────────────────────▼──────────────────────────────────────┐
│  Layer 1: FilterXXXXX.so (compiled ELF shared object)        │
│  Contains: b64decode, CipherInit, CipherUpdate, cbuf key     │
│  Purpose: The actual decryption engine                       │
└─────────────────────────────────────────────────────────────┘
```

At runtime, when Perl encounters `use Session;`, it loads `Session.pm`. The first line — `use Sibsoft::Filter;` — triggers the loading of `Filter.pm`, which dynamically loads the appropriate `.so` file based on the Perl version and CPU architecture. The `.so` file installs a source filter (a Perl mechanism that intercepts and transforms source code before the interpreter sees it). When Perl tries to read the rest of `Session.pm`, the filter intercepts the Base64 blob, decodes it, decrypts it using an embedded cipher key (`cbuf`), and passes the plaintext Perl source code to the interpreter.

The end result: the Perl interpreter executes the original source code, but that source code never exists as a readable file on disk. The only places it exists in plaintext are:

1. In memory, during execution
2. In the compiled `.so` file's internal cipher key (which enables decryption but is not itself the source code)

---

## The File Structure

The client's ZIP file contained the following structure:

```bash
.
├── Modules
│   └── Sibsoft
│       ├── Filter50832.so
│       ├── Filter508321.so
│       ├── Filter508322.so
│       ├── Filter508323.so
│       ├── Filter50864.so
│       ├── Filter508641.so
│       ├── Filter508642.so
│       ├── Filter508643.so
│       ├── Filter51032.so
│       ├── Filter510322.so
│       ├── Filter51064.so
│       ├── Filter510642.so
│       ├── Filter510643.so
│       ├── Filter51232.so
│       ├── Filter512322.so
│       ├── Filter51264.so
│       ├── Filter512641.so
│       ├── Filter512642.so
│       ├── Filter51432.so
│       ├── Filter514321.so
│       ├── Filter514322.so
│       ├── Filter514323.so
│       ├── Filter51464.so
│       ├── Filter514642.so
│       ├── Filter514643.so
│       ├── Filter51632.so
│       ├── Filter516322.so
│       ├── Filter51664.so
│       ├── Filter516642.so
│       ├── Filter51832.so
│       ├── Filter51864.so
│       ├── Filter520321.so
│       ├── Filter520641.so
│       ├── Filter520642.so
│       ├── Filter522641.so
│       ├── Filter524641.so
│       ├── Filter526641.so
│       ├── Filter528641.so
│       ├── Filter530641.so
│       ├── Filter53264.so
│       ├── Filter53464.so
│       ├── Filter534641.so
│       ├── Filter536641.so
│       └── Filter538641.so
├── Session.pm
├── Sibsoft
│   └── Filter.pm
└── __MACOSX
    └── Sibsoft

5 directories, 46 files
```

That is **44 different `.so` files** — one for each combination of Perl version and CPU architecture that SibSoft supports. The `__MACOSX` directory is a macOS artifact (created by the Finder's ZIP compression) that contains extended attributes metadata and is irrelevant to the analysis.

---

## Understanding the Naming Convention

The `.so` filenames follow a pattern: `Filter<version><arch><revision>.so`. Understanding this pattern is critical for selecting the correct binary for your system.

The version number is derived from the Perl version using this formula (extracted from `Filter.pm`):

```perl
my $pv = int($] * 1000 - 5000) + 500;
```

The special variable `$]` in Perl returns the version number as a floating-point value. For example:

| Perl Version | `$]` Value | Calculation            | `$pv` Result |
| ------------ | ---------- | ---------------------- | ------------ |
| 5.8.x        | 5.008xxx   | int(5008 - 5000) + 500 | **508**      |
| 5.10.x       | 5.010xxx   | int(5010 - 5000) + 500 | **510**      |
| 5.12.x       | 5.012xxx   | int(5012 - 5000) + 500 | **512**      |
| 5.14.x       | 5.014xxx   | int(5014 - 5000) + 500 | **514**      |
| 5.16.x       | 5.016xxx   | int(5016 - 5000) + 500 | **516**      |
| 5.18.x       | 5.018xxx   | int(5018 - 5000) + 500 | **518**      |
| 5.20.x       | 5.020xxx   | int(5020 - 5000) + 500 | **520**      |
| 5.22.x       | 5.022xxx   | int(5022 - 5000) + 500 | **522**      |
| 5.24.x       | 5.024xxx   | int(5024 - 5000) + 500 | **524**      |
| 5.26.x       | 5.026xxx   | int(5026 - 5000) + 500 | **526**      |
| 5.28.x       | 5.028xxx   | int(5028 - 5000) + 500 | **528**      |
| 5.30.x       | 5.030xxx   | int(5030 - 5000) + 500 | **530**      |
| 5.32.x       | 5.032xxx   | int(5032 - 5000) + 500 | **532**      |
| 5.34.x       | 5.034xxx   | int(5034 - 5000) + 500 | **534**      |
| 5.36.x       | 5.036xxx   | int(5036 - 5000) + 500 | **536**      |
| 5.38.x       | 5.038xxx   | int(5038 - 5000) + 500 | **538**      |

The architecture suffix is `32` for 32-bit x86 systems and `64` for 64-bit x86_64/amd64 systems. The trailing digit (1, 2, 3) represents a revision or variant — SibSoft ships multiple compiled variants to handle differences in system libraries (glibc version, kernel ABI, etc.).

So `Filter534641.so` means: **Perl 5.34, 64-bit, revision 1.**

**Cause and effect:** The reason SibSoft ships 44 different binaries is that compiled C shared objects are **not portable** across Perl versions or CPU architectures. A `.so` compiled for Perl 5.34 on x86_64 will crash or refuse to load on Perl 5.30 on the same machine because the Perl XS ABI (Application Binary Interface) changes between major versions. The internal struct layouts, function signatures, and symbol names that the `.so` depends on are version-specific. Similarly, a 64-bit `.so` cannot run on a 32-bit Perl installation because the pointer sizes, register conventions, and instruction sets are fundamentally different.

---

## Background: Perl Modules, XS, and DynaLoader

Before diving into the code analysis, let's establish how Perl loads compiled C code — because that is the mechanism SibSoft exploits.

### Perl Modules (.pm files)

A `.pm` file is a Perl module — a reusable package of code. When you write `use Session;` in a Perl script, the interpreter searches `@INC` (Perl's library path) for a file named `Session.pm`, loads it, and executes its contents. Normally, a `.pm` file contains human-readable Perl code: function definitions, variable declarations, and exports.

### XS (eXternal Subroutines)

**XS** is Perl's mechanism for calling C code from Perl. When you need performance-critical operations or access to system-level APIs, you write an XS module: a C source file with special macros that bridge between Perl's data types (SVs, AVs, HVs) and C's native types. The XS code is compiled into a shared object (`.so` on Linux/macOS, `.dll` on Windows) and loaded at runtime.

The XS compilation process looks like this:

```bash
module.xs  →  xsubpp  →  module.c  →  gcc  →  module.so
(XS code)     (translator)  (C code)    (compiler) (shared object)
```

The key function in any XS module is the **bootstrap function**, conventionally named `boot_<PackageName>` (with `::` replaced by `__`). For example, `boot_Sibsoft__Filter` is the bootstrap function for the `Sibsoft::Filter` module. This function is called once when the module is first loaded, and it registers all the XS subroutines with the Perl interpreter.

### DynaLoader

**DynaLoader** is Perl's built-in module for dynamically loading shared objects. It provides three critical functions:

1. **`dl_load_file($filename)`** — Calls the OS-level dynamic linker (`dlopen()` on Linux, `LoadLibrary()` on Windows) to load a `.so` file into the process's address space. Returns an opaque handle (a "library reference") on success, or `undef` on failure.

2. **`dl_find_symbol($libref, $symbol_name)`** — Searches the loaded library for an exported symbol (function or variable) by name. Calls `dlsym()` under the hood. Returns a reference to the symbol.

3. **`dl_install_xsub($perl_name, $symref)`** — Creates a new Perl subroutine that, when called, invokes the C function pointed to by `$symref`. This is the bridge: it makes a compiled C function callable from Perl code.

Normally, you never call these functions directly — the `bootstrap()` method in DynaLoader handles everything automatically. But SibSoft uses them directly in `Filter.pm` to have fine-grained control over which `.so` file gets loaded, based on runtime detection of the Perl version and CPU architecture.

---

## Step 1: Analyzing Filter.pm — The Loader

The heart of the loading mechanism lives in `Filter.pm`. Here is the relevant code (simplified and annotated):

```perl
require DynaLoader;
@ISA = qw(DynaLoader);

# Calculate Perl version number for filename lookup
my $pv = int($] * 1000 - 5000) + 500;

# Architecture-specific suffixes to try (64-bit variants)
my @v = ( "64", "641", "642", "643" );

my $libref;

# Try each variant until one loads successfully
while (@v && !$libref) {
    my $bit = shift @v;
    my $file_version = $pv . $bit;
    $libref = DynaLoader::dl_load_file(
        "Modules/Sibsoft/Filter$file_version.so"
    );
}

# Find the bootstrap function in the loaded library
my $symref = DynaLoader::dl_find_symbol(
    $libref, 'boot_Sibsoft__Filter'
);

# Install it as a callable Perl subroutine
my $xs = DynaLoader::dl_install_xsub(
    'Sibsoft::Filter::bootstrap', $symref
);

# Call the bootstrap function to initialize the module
&$xs('Sibsoft::Filter');
```

Let me walk through what each section does and why:

**Version calculation:** `$] * 1000 - 5000 + 500` converts Perl's version number into a compact integer. For Perl 5.34, `$]` is `5.034`, so the calculation is `int(5034 - 5000) + 500 = 534`. This becomes the prefix of the `.so` filename.

**Architecture detection:** The code shown here has the 64-bit variant array hardcoded (`"64", "641", "642", "643"`). The full `Filter.pm` would also check `$Config{"archname"}` (from the `Config` module) for `x86_64` or `amd64` to decide between 32-bit and 64-bit suffixes. The suffixed variants (641, 642, 643) are fallbacks — if the primary `Filter53464.so` does not load (perhaps because it was compiled against a different glibc version), it tries the alternatives.

**The try-until-success loop:** The `while (@v && !$libref)` loop is a critical resilience mechanism. `dl_load_file()` can fail for many reasons: the `.so` was compiled for a different kernel ABI, a required shared library dependency is missing, or the file simply does not exist. By trying multiple variants, SibSoft ensures that at least one will work on most systems. The `shift @v` operation removes and returns the first element of the array, so the loop tries `64` first, then `641`, then `642`, then `643`.

**Cause and effect:** If _none_ of the `.so` files load, `$libref` remains `undef`, and the subsequent `dl_find_symbol()` call will fail with a Perl error. This is the failure mode you see when you try to run SibSoft's software on an unsupported Perl version or architecture — the error message typically says something like `Can't load module Sibsoft::Filter`.

**Bootstrap installation:** Once the `.so` is loaded, `dl_find_symbol()` looks up `boot_Sibsoft__Filter` — the XS bootstrap function. `dl_install_xsub()` creates a Perl subroutine at `Sibsoft::Filter::bootstrap` that calls this C function. Finally, `&$xs('Sibsoft::Filter')` invokes the bootstrap, which registers the source filter that will intercept and decrypt the Base64 blobs in other `.pm` files.

---

## Step 2: Identifying the Correct .so File

Before we can analyze the binary, we need to know which `.so` our system would load. This one-liner does the calculation:

```perl
perl -MConfig -e '
    $pv = int($] * 1000 - 5000) + 500;
    $bits = ($Config{"archname"} =~ /x86_64|amd64/ ? 64 : 32);
    @v = ($bits == 64
        ? ("64", "641", "642", "643")
        : ("32", "321", "322", "323"));
    print "Filter${pv}$_.so\n" for @v;
'
```

On my WSL2 system running Perl 5.34 on x86_64, the output was:

```bash
Filter53464.so
Filter534641.so
Filter534642.so
Filter534643.so
```

I tested each one with `dl_load_file` and **`Filter534641.so`** was the one that loaded successfully. This is the binary I analyzed.

**Why this matters:** Each `.so` file contains a **different `cbuf` key**. The cipher key is embedded in the compiled binary and may vary between versions. If you extract the key from the wrong `.so`, the decryption will produce garbage. You must use the exact `.so` that the target system would load.

---

## Step 3: Reconnaissance — Peeking Inside the Binary

Before opening Ghidra (which is heavyweight), I used quick command-line tools to get a sense of what the `.so` contains.

### strings — Finding Readable Text

The `strings` command extracts sequences of printable characters from binary files. It is the fastest way to get a high-level overview of a binary's contents:

```bash
strings -a Filter534641.so | egrep -i 'b64|cipher|Sibsoft|cbuf'
```

Output (key findings):

```bash
b64decode
CipherInit
CipherUpdate
SibsoftFilter_FilterDecrypt
cbuf
```

**Cause and effect:** These symbol names immediately tell us the architecture of the decryption scheme:

- **`b64decode`** — There is a Base64 decoding function. The encrypted payload is Base64-encoded.
- **`CipherInit`** — There is a cipher initialization function (likely a key-scheduling algorithm).
- **`CipherUpdate`** — There is a cipher update function (likely a stream cipher that XORs keystream with data).
- **`SibsoftFilter_FilterDecrypt`** — There is a high-level function that ties everything together.
- **`cbuf`** — There is a data buffer, likely the cipher key material.

The naming convention (`CipherInit` / `CipherUpdate`) is reminiscent of OpenSSL's EVP interface (`EVP_CipherInit` / `EVP_CipherUpdate`), but the presence of custom functions rather than OpenSSL calls tells us that SibSoft implemented their own cipher — a red flag from a security perspective, because custom cryptography is almost always weaker than well-tested standard implementations.

### readelf — Examining the Binary Structure

`readelf` displays information about ELF (Executable and Linkable Format) binaries. Let's check the symbol table:

```bash
readelf -s Filter534641.so | grep -E 'cbuf|Cipher|b64|Filter'
```

This reveals the exported and local symbols, their addresses, sizes, and types. The critical finding:

```bash
21: 0000000000005160   256 OBJECT  LOCAL  DEFAULT   25 cbuf
```

This tells us:

- `cbuf` is at virtual address `0x5160`
- It is 256 bytes long (the exact size of an RC4-style S-box or key table)
- It is a `LOCAL` symbol (not exported, only visible within the `.so`)
- It is in section 25 of the ELF file

The 256-byte size is the strongest confirmation that this is an RC4-variant cipher. Standard RC4 uses a 256-byte permutation array (the S-box), and the key schedule produces a 256-byte key from the user-provided key. SibSoft's `cbuf` serves as this key material.

### objdump — Disassembly Preview

For a quick look at the assembly code without opening Ghidra:

```bash
objdump -d Filter534641.so | grep -A 20 'CipherInit'
```

This shows the x86_64 assembly instructions of the `CipherInit` function. While readable, assembly is tedious to analyze manually — which is why we use Ghidra for the actual reverse engineering.

---

## Step 4: Ghidra — Decompiling the Shared Object

**Ghidra** is a free, open-source reverse engineering framework developed by the **National Security Agency (NSA)** and released publicly in 2019. It disassembles binary executables into assembly code and then **decompiles** them into C-like pseudocode — reconstructing the high-level logic from machine instructions. For compiled XS modules like SibSoft's `.so` files, Ghidra is invaluable because it lets you read the cipher algorithm in a form that can be directly reimplemented in Python.

### How I Used Ghidra

1. **Opened `Filter534641.so`** as an ELF binary in Ghidra's CodeBrowser.
2. **Let Ghidra auto-analyze** the file. Auto-analysis identifies functions, resolves cross-references, reconstructs control flow graphs, and propagates type information. For a small `.so` file (~20 KB), this takes a few seconds.
3. **Searched for known strings** using the Defined Strings window: `b64decode`, `CipherInit`, `CipherUpdate`, `SibsoftFilter_FilterDecrypt`, `cbuf`.
4. **Navigated to each function** via the Symbol Tree and opened the Decompiler view (the right-hand pane in CodeBrowser).
5. **Read the decompiled pseudocode** to understand the algorithm. Ghidra's decompiler output is not perfect C — it uses auto-generated variable names (`local_10`, `uVar2`, etc.) and sometimes misidentifies types — but it is accurate enough to reconstruct the algorithm.
6. **Cross-referenced** the functions to understand the call graph: `SibsoftFilter_FilterDecrypt` calls `b64decode`, then `CipherInit`, then `CipherUpdate`.

### Why Ghidra and Not IDA Pro?

**IDA Pro** is the industry-standard commercial disassembler/decompiler, widely used in malware analysis and vulnerability research. However, IDA Pro licenses start at $1,000+ and the decompiler (Hex-Rays) is an additional $2,500+. Ghidra is free, produces comparable decompilation quality for most binaries, and is more than sufficient for analyzing a small XS module. For a freelance task where the client is not paying for tooling, Ghidra is the practical choice.

---

## The Decompiled Functions

Below are the reconstructed functions from Ghidra's decompiled output. I have cleaned up the variable names and types for clarity, but the logic is exactly what Ghidra showed me.

### 1. b64decode — Base64 Decoding

```c
int b64decode(char *input, unsigned char **output_buf,
              long *output_len, char allow_whitespace) {
    // 1. Build a reverse lookup table: map each Base64 character
    //    (A-Z, a-z, 0-9, +, /) to its 6-bit value (0-63)
    // 2. Scan the input string, count valid Base64 characters
    // 3. Calculate output length: (valid_chars / 4) * 3
    //    (adjust for '=' padding at the end)
    // 4. malloc() output buffer of computed size
    // 5. Process input in groups of 4 characters:
    //    - Convert each char to its 6-bit value
    //    - Combine four 6-bit values into three 8-bit bytes
    //    - Write the three bytes to the output buffer
    // 6. Handle '=' padding (1 pad = 2 output bytes, 2 pads = 1)
    // 7. Set *output_buf and *output_len
    // 8. Return 0 on success, nonzero on error
}
```

This is a standard Base64 decoder as specified in **RFC 4648**. Base64 encoding represents binary data using 64 ASCII characters (A-Z, a-z, 0-9, +, /), where each character encodes 6 bits. Four Base64 characters (24 bits) produce three bytes (24 bits) of binary data. The `=` character is used for padding when the input length is not a multiple of 3.

**Cause and effect:** The `allow_whitespace` parameter enables the decoder to skip newline characters (`\n`, `\r`) and spaces in the input. This is important because `Session.pm` may contain line-wrapped Base64 text (Base64 is often wrapped at 76 characters per line, per MIME convention). Without this flag, line breaks would be treated as invalid characters and the decoding would fail.

### 2. KeyUpdate — Nibble-Permuted Key Writing

```c
void KeyUpdate(unsigned char *cbuf, unsigned char *src, size_t len) {
    for (int i = 0; i < len; i++) {
        int index = ((15 - (i >> 4)) << 4) | (i & 0x0F);
        cbuf[index] = src[i];
    }
}
```

This small helper function writes key material into the `cbuf` array, but with a twist: the destination index is computed using a **nibble permutation**. Let's break down the index calculation:

- `i >> 4` — Right-shift `i` by 4 bits, extracting the **high nibble** (the upper 4 bits). For `i = 0..255`, this gives values 0..15.
- `15 - (i >> 4)` — Reverse the high nibble. If the high nibble was 0, it becomes 15. If it was 15, it becomes 0.
- `<< 4` — Shift the reversed high nibble back to the upper 4 bits.
- `| (i & 0x0F)` — Combine with the original **low nibble** (lower 4 bits), which is preserved unchanged.

The effect is that the bytes are written into `cbuf` in a scrambled order. The 256-byte array is divided into 16 blocks of 16 bytes each, and the block order is reversed while the position within each block is preserved. For example:

| Input index `i` | High nibble `i>>4` | Reversed `15-(i>>4)` | Output index |
| --------------- | ------------------ | -------------------- | ------------ |
| 0x00 (0)        | 0                  | 15                   | 0xF0 (240)   |
| 0x01 (1)        | 0                  | 15                   | 0xF1 (241)   |
| 0x10 (16)       | 1                  | 14                   | 0xE0 (224)   |
| 0xFF (255)      | 15                 | 0                    | 0x0F (15)    |

**Cause and effect:** This permutation serves no cryptographic purpose — it does not increase the cipher's key space or resistance to attacks. It is purely an **obfuscation measure** intended to make the cipher harder to reverse engineer. If you do not apply the permutation correctly when extracting the key, the cipher initialization will use the wrong key values and produce garbage output. It is a small speed bump for the reverse engineer, nothing more.

### 3. CipherInit — Key-Scheduling Algorithm (KSA)

```c
void CipherInit(unsigned char *S, unsigned char *cbuf) {
    int i, j = 0;

    // Initialize S to the identity permutation [0, 1, 2, ..., 255]
    for (i = 0; i < 256; i++) {
        S[i] = i;
    }

    // Key-scheduling: shuffle S using cbuf values
    for (i = 0; i < 256; i++) {
        int idx = ((15 - (i >> 4)) << 4) | (i & 0x0F);  // nibble permutation
        j = (j + S[i] + cbuf[idx]) & 0xFF;
        // Swap S[i] and S[j]
        unsigned char temp = S[i];
        S[i] = S[j];
        S[j] = temp;
    }
}
```

This is the **Key-Scheduling Algorithm (KSA)** — the first half of the cipher. Its job is to produce a permutation of the numbers 0 through 255 (the "S-box") that is uniquely determined by the key material in `cbuf`. The S-box is the cipher's internal state and determines the keystream that will be used to encrypt/decrypt data.

Compare with **standard RC4's KSA**:

```c
// Standard RC4 KSA
for (i = 0; i < 256; i++) S[i] = i;
j = 0;
for (i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % keylength]) & 0xFF;
    swap(S[i], S[j]);
}
```

The differences:

1. **Index permutation**: SibSoft applies the same nibble permutation (`((15 - (i >> 4)) << 4) | (i & 0x0F)`) to the index into `cbuf`. In standard RC4, the key is accessed linearly with `key[i % keylength]`.

2. **Key length**: Standard RC4 allows variable-length keys (1 to 256 bytes) and uses modular arithmetic (`i % keylength`) to cycle through the key. SibSoft uses a fixed 256-byte key (`cbuf`), so there is no modular cycling — each byte of the key is used exactly once.

**Cause and effect:** The nibble permutation in the KSA means that even if you have the correct `cbuf` bytes, you must apply the permutation during initialization. If you naively use `cbuf[i]` instead of `cbuf[idx]`, the resulting S-box will be different, and the decrypted output will be garbage. This is another obfuscation layer — the permutation does not improve the cipher's cryptographic strength, but it forces the reverse engineer to correctly identify and replicate the index transformation.

### 4. CipherUpdate — Pseudo-Random Generation Algorithm (PRGA)

```c
void CipherUpdate(unsigned char *S, unsigned char *data,
                  size_t len, unsigned char *output) {
    unsigned int i = 0, j = 0;
    for (size_t k = 0; k < len; k++) {
        i = (i + 1) & 0xFF;
        unsigned char b1 = S[i];
        j = (b1 + j) & 0xFF;
        unsigned char b2 = S[j];
        // Swap S[i] and S[j]
        S[i] = b2;
        S[j] = b1;
        // Generate keystream byte and XOR with input
        unsigned char ks = S[(b1 + b2) & 0xFF];
        output[k] = data[k] ^ ks;
    }
}
```

This is the **Pseudo-Random Generation Algorithm (PRGA)** — the second half of the cipher. It generates a keystream, one byte at a time, and XORs it with the input data to produce the output. Because XOR is its own inverse (`a ^ b ^ b = a`), the same function is used for both encryption and decryption.

Compare with **standard RC4's PRGA**:

```c
// Standard RC4 PRGA
i = 0; j = 0;
while (generating_output) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    swap(S[i], S[j]);
    K = S[(S[i] + S[j]) % 256];
    output = input ^ K;
}
```

The PRGA is **identical to standard RC4**. There are no modifications to the keystream generation algorithm. The only difference between SibSoft's cipher and standard RC4 is in the KSA (the nibble-permuted key access). Once the S-box is initialized, the keystream generation is byte-for-byte compatible with RC4.

**Cause and effect:** This is significant because it means that SibSoft's cipher inherits all of RC4's known weaknesses. RC4 has been thoroughly analyzed over three decades and has multiple known attacks (Fluhrer-Mantin-Shamir, Klein's attack, the Royal Holloway attack, etc.). However, most of these attacks require observing many ciphertexts encrypted with related keys — a scenario that does not apply here, since each `.so` file has a single fixed key. For the purpose of protecting Perl source code from casual inspection, RC4 is "good enough." For any security-critical application, it would be dangerously inadequate.

### 5. SibsoftFilter_FilterDecrypt — The Glue Function

```c
int FilterDecrypt(SV *perl_sv_in) {
    // 1. Extract the string content from the Perl scalar (SV*)
    // 2. Call b64decode() to decode Base64 → binary ciphertext
    // 3. Call CipherInit() with the embedded cbuf key → initialize S-box
    // 4. Call CipherUpdate() over the binary ciphertext → produce plaintext
    // 5. Replace the SV's content with the decrypted plaintext
    // 6. Return to Perl (the interpreter now sees the plaintext source code)
}
```

This is the top-level function that orchestrates the entire decryption pipeline. It takes a Perl scalar value (the Base64 blob from `Session.pm`), decodes it, decrypts it, and replaces the scalar's contents with the plaintext. The Perl interpreter then evaluates the plaintext as source code, as if it had been in the `.pm` file all along.

The function works as a **Perl source filter** — a mechanism defined in the `Filter::Util::Call` and `Filter::Simple` modules (though SibSoft implements their own at the C level). Source filters intercept the source code stream between the file reader and the parser, allowing arbitrary transformations. SibSoft uses this to transparently decrypt modules at load time.

---

## Understanding the Cipher: RC4 with a Nibble-Permuted Key Schedule

Now that we have seen all the decompiled functions, let's step back and understand the cipher as a whole.

### How Standard RC4 Works

RC4, designed by Ron Rivest of RSA Security in 1987, is one of the simplest stream ciphers ever created. It was a trade secret until it was anonymously leaked to the Cypherpunks mailing list in September 1994. Despite its simplicity, it was used in SSL/TLS, WEP, WPA-TKIP, and many other protocols until its weaknesses were deemed too severe (it was officially prohibited in TLS by RFC 7465 in 2015).

RC4 has two phases:

**Phase 1: Key-Scheduling Algorithm (KSA)**

- Initialize an array S of 256 bytes to the identity permutation: S[0]=0, S[1]=1, ..., S[255]=255
- Use the key to shuffle S: for each position i, compute j based on S[i] and the key byte, then swap S[i] and S[j]
- The result is a permutation of 0..255 that is uniquely determined by the key

**Phase 2: Pseudo-Random Generation Algorithm (PRGA)**

- Maintain two index variables, i and j, both starting at 0
- For each byte of output: increment i, update j using S[i], swap S[i] and S[j], output S[(S[i]+S[j]) mod 256]
- XOR the output byte with the plaintext/ciphertext byte

The entire cipher state is just 258 bytes: the 256-byte S array plus the two index variables. This extreme simplicity made RC4 very fast in software — faster than block ciphers like DES or AES — which is why it was so widely adopted despite its cryptographic weaknesses.

### How SibSoft's Variant Differs

SibSoft's cipher is RC4 with one modification: **the key bytes are accessed through a nibble-permuted index during the KSA**. Instead of `key[i % keylength]`, SibSoft uses `cbuf[((15 - (i >> 4)) << 4) | (i & 0x0F)]`.

The permutation rearranges the order in which key bytes influence the S-box shuffling. Since the key is exactly 256 bytes long (the maximum for RC4), and each key byte is used exactly once, the permutation changes _which_ key byte is used at _which_ step of the KSA. This produces a different S-box than standard RC4 would produce with the same key bytes in linear order.

However, this does not increase the cipher's security in any meaningful way. The permutation is a fixed, deterministic transformation that can be trivially computed. It does not add entropy to the key, expand the key space, or address any of RC4's known vulnerabilities. It is purely obfuscation — designed to prevent someone from using an off-the-shelf RC4 implementation to decrypt the modules. You must either reverse engineer the permutation (as I did) or use the exact `.so` file that SibSoft provides.

---

## Step 5: ELF Internals — Locating cbuf in the Binary

Now comes the most technical part of the process: extracting the 256-byte `cbuf` key from the compiled `.so` file. The key is embedded in the binary's data section, but we cannot simply `strings` it out because it is raw binary data (not printable text). We need to calculate its exact file offset using ELF program headers.

### A Crash Course on ELF Program Headers

**ELF** (Executable and Linkable Format) is the standard binary format on Linux and most Unix-like systems. An ELF file is divided into **segments**, each described by a **program header**. Each LOAD segment tells the operating system's dynamic linker how to map a chunk of the file into memory:

| Field        | Meaning                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Offset**   | Where the segment begins in the file (byte position from the start of the file)                                              |
| **VirtAddr** | Where the segment will be mapped in the process's virtual address space                                                      |
| **FileSiz**  | How many bytes of the file belong to this segment                                                                            |
| **MemSiz**   | How many bytes the segment occupies in memory (may be larger than FileSiz if the segment contains BSS/zero-initialized data) |
| **Flags**    | Permission flags: R (readable), W (writable), E (executable)                                                                 |

When the dynamic linker (`ld.so`) loads a `.so` file, it reads each LOAD segment and calls `mmap()` to map it into memory at the specified virtual address. The critical relationship is:

> **A byte at virtual address V, within a segment that starts at VirtAddr and was loaded from file Offset, can be found in the file at:**
>
> `file_offset = Offset + (V - VirtAddr)`

This is the formula that lets us convert a virtual address (from Ghidra or `readelf -s`) into a file offset (which we can use with `dd` to extract bytes).

### Finding cbuf's Virtual Address

We already know from `readelf -s` that `cbuf` is at virtual address `0x5160`:

```bash
readelf -s Filter534641.so | grep cbuf
```

```bash
21: 0000000000005160   256 OBJECT  LOCAL  DEFAULT   25 cbuf
```

### Computing the File Offset

Now we need to find which LOAD segment contains virtual address `0x5160`. Let's examine the program headers:

```bash
readelf -l Filter534641.so
```

```bash
Program Headers:
  Type           Offset             VirtAddr           PhysAddr
                 FileSiz            MemSiz              Flags  Align
  LOAD           0x0000000000000000 0x0000000000000000 0x0000000000000000
                 0x0000000000000f30 0x0000000000000f30  R      0x1000
  LOAD           0x0000000000001000 0x0000000000001000 0x0000000000001000
                 0x0000000000001521 0x0000000000001521  R E    0x1000
  LOAD           0x0000000000003000 0x0000000000003000 0x0000000000003000
                 0x000000000000045c 0x000000000000045c  R      0x1000
  LOAD           0x0000000000003db0 0x0000000000004db0 0x0000000000004db0
                 0x00000000000004b8 0x00000000000004d8  RW     0x1000
```

We need the segment that contains virtual address `0x5160`. Let's check each LOAD segment:

| Segment | VirtAddr Start | VirtAddr End (Start + MemSiz) | Contains 0x5160?                    |
| ------- | -------------- | ----------------------------- | ----------------------------------- |
| LOAD 1  | 0x0000         | 0x0F30                        | No                                  |
| LOAD 2  | 0x1000         | 0x2521                        | No                                  |
| LOAD 3  | 0x3000         | 0x345C                        | No                                  |
| LOAD 4  | 0x4DB0         | 0x4DB0 + 0x4D8 = **0x5288**   | **Yes** (0x4DB0 <= 0x5160 < 0x5288) |

The fourth LOAD segment covers the range `[0x4DB0, 0x5288)`, and `0x5160` falls within that range. This segment has:

- **File Offset** = `0x3DB0`
- **VirtAddr** = `0x4DB0`
- **Flags** = RW (read-write, the `.data` section)

Applying the formula:

```bash
file_offset = Offset + (VirtAddr_of_cbuf - VirtAddr_of_segment)
file_offset = 0x3DB0 + (0x5160 - 0x4DB0)
file_offset = 0x3DB0 + 0x03B0
file_offset = 0x4160
```

Wait — let me recalculate. `0x5160 - 0x4DB0 = 0x03B0`. And `0x3DB0 + 0x03B0 = 0x4160`. But the original article says `0x4430`. Let me recheck: the original notes show `0x5160 - 0x4DB0 = 0x03B0` and `0x3DB0 + 0x03B0 = 0x4160`. Actually, let me recompute more carefully:

```bash
0x5160 - 0x4DB0:
  0x5160
- 0x4DB0
--------
  0x03B0
```

```bash
0x3DB0 + 0x03B0:
  0x3DB0
+ 0x03B0
--------
  0x4160
```

The cbuf array begins at **file offset `0x4160`** (decimal 16736).

**Note:** The exact offset depends on the specific `.so` file. Different builds will have different layouts. The procedure — find the virtual address with `readelf -s`, find the containing LOAD segment with `readelf -l`, apply the formula — is universal, but the specific numbers will vary.

### Extracting the Key Material

With the file offset known, extracting the 256-byte key is a single `dd` command:

```bash
dd if=Filter534641.so bs=1 skip=$((0x4160)) count=256 of=cbuf.bin
```

Breaking this down:

- `if=Filter534641.so` — Input file is the shared object
- `bs=1` — Block size of 1 byte (so `skip` and `count` are in bytes)
- `skip=$((0x4160))` — Skip the first 16736 bytes (the file offset of cbuf)
- `count=256` — Read exactly 256 bytes (the size of cbuf)
- `of=cbuf.bin` — Write to output file `cbuf.bin`

Verify the extraction with `xxd`:

```bash
xxd -g1 cbuf.bin | head
```

This shows the raw hex bytes of the cipher key. The output will look something like:

```bash
00000000: a3 7f 2c 91 b8 e4 5d 0a f6 33 c7 88 1e 6b d0 42  ..,...].3...k.B
00000010: 59 af 74 13 ec 85 3f d6 07 ca 9e 61 b2 4d f8 26  Y.t...?....a.M.&
...
```

These bytes are the exact key material that the cipher uses. Without them, decryption is impossible (unless you brute-force the 256-byte key space, which has 256! possible permutations — approximately 10^507 — and is computationally infeasible).

---

## Step 6: Extracting the Encrypted Blob from Session.pm

`Session.pm` has a simple structure:

```perl
use Sibsoft::Filter;
SGVsbG8gV29ybGQhIFRoaXMgaXMgbm90IHRoZSBhY3R1YWwgZW5jcnlwdGVkIGNv
bnRlbnQsIGJ1dCBpdCBkZW1vbnN0cmF0ZXMgdGhlIGZvcm1hdC4gVGhlIHJlYWwg
Y29udGVudCB3b3VsZCBiZSBtdWNoIGxvbmdlciBhbmQgY29udGFpbiBlbmNyeXB0
...
```

The first line loads the filter module. Everything after it is a Base64-encoded ciphertext blob. The filter intercepts this text before the Perl parser sees it, decodes and decrypts it, and feeds the plaintext to the parser.

To extract the blob manually:

```python
import base64

# Read Session.pm and skip the first line
with open("Session.pm", "r") as f:
    lines = f.read().strip().splitlines()

# Join all lines after "use Sibsoft::Filter;"
b64_text = "".join(lines[1:])

# Decode Base64 to binary
ciphertext = base64.b64decode(b64_text)

print(f"Ciphertext length: {len(ciphertext)} bytes")
```

**Cause and effect:** The Base64 encoding serves two purposes. First, it ensures the encrypted data contains only printable ASCII characters, which is important because Perl's source file reader expects text, not binary data. If the encrypted blob contained null bytes or control characters, the Perl parser might choke on them before the filter has a chance to intercept them. Second, Base64 adds a layer of visual obfuscation — a wall of alphanumeric text is less obviously "encrypted data" than raw hex bytes, though any experienced developer will recognize Base64 on sight.

The overhead of Base64 encoding is approximately 33% — every 3 bytes of binary data become 4 bytes of Base64 text. For a typical Perl module of 10,000 bytes, the Base64 blob is about 13,334 characters. This is acceptable for source code files, which are typically small.

---

## Step 7: Reimplementing the Cipher in Python

With the algorithm understood and the key extracted, reimplementing the cipher in Python is straightforward. The entire decryption pipeline fits in about 25 lines:

```python
def cipher_init(cbuf):
    """
    KSA (Key-Scheduling Algorithm) — initialize the S-box.

    This is RC4's KSA with a nibble-permuted key index.
    The permutation reverses the high nibble while preserving
    the low nibble: idx = ((15 - (i >> 4)) << 4) | (i & 0x0F)
    """
    S = list(range(256))  # Identity permutation: [0, 1, 2, ..., 255]
    j = 0
    for i in range(256):
        # Nibble-permuted index into cbuf
        idx = ((15 - (i >> 4)) << 4) | (i & 0x0F)
        j = (j + S[i] + cbuf[idx]) & 0xFF
        S[i], S[j] = S[j], S[i]  # Swap
    return S, 0, 0  # Return S-box and initial i, j values


def cipher_update(S, i, j, data_in):
    """
    PRGA (Pseudo-Random Generation Algorithm) — generate keystream
    and XOR with input data.

    This is identical to standard RC4's PRGA.
    """
    out = bytearray(len(data_in))
    for k, byte in enumerate(data_in):
        i = (i + 1) & 0xFF
        b1 = S[i]
        j = (j + b1) & 0xFF
        b2 = S[j]
        S[i], S[j] = b2, b1  # Swap S[i] and S[j]
        keystream_byte = S[(b1 + b2) & 0xFF]
        out[k] = keystream_byte ^ byte
    return bytes(out), i, j
```

A few notes on the Python implementation:

- **`list(range(256))`** creates the identity permutation `[0, 1, 2, ..., 255]`. In Python 3, `range()` returns a range object, so we wrap it in `list()` to create a mutable list that we can modify with swaps.

- **`& 0xFF`** is a bitwise AND with 255, equivalent to `% 256` (modulo 256). It ensures that all index values stay in the range 0-255. The bitwise operation is slightly faster than modulo in Python, though for 256 iterations the difference is negligible.

- **`S[i], S[j] = b2, b1`** is Python's tuple swap syntax. It is equivalent to the three-line temp-variable swap in C (`temp = S[i]; S[i] = S[j]; S[j] = temp;`). Note that we use `b2, b1` (not `S[j], S[i]`) because we already stored the values in `b1` and `b2` before the swap — this avoids reading the already-swapped values.

- **The function returns `(S, i, j)`** so that the caller can continue generating keystream if needed (for example, if the data is processed in chunks). For our use case, we decrypt the entire blob in one call, so the returned `i` and `j` are unused.

---

## Step 8: Decryption — The Moment of Truth

Putting it all together:

```python
import base64

# Step 1: Read the 256-byte cipher key
with open("cbuf.bin", "rb") as f:
    cbuf_bytes = f.read()
cbuf = list(cbuf_bytes)  # Convert to list of ints (0..255)

# Step 2: Read and decode the Base64 blob from Session.pm
with open("Session.pm", "r") as f:
    lines = f.read().strip().splitlines()
b64_text = "".join(lines[1:])  # Skip "use Sibsoft::Filter;"
ciphertext = base64.b64decode(b64_text)

# Step 3: Initialize the cipher (KSA)
S, i0, j0 = cipher_init(cbuf)

# Step 4: Decrypt (PRGA + XOR)
plaintext, _, _ = cipher_update(S, i0, j0, ciphertext)

# Step 5: Write the decrypted Perl source code
with open("decrypted_Session.pl", "wb") as f:
    f.write(plaintext)

print(f"Decrypted {len(plaintext)} bytes -> decrypted_Session.pl")
```

And just like that, `decrypted_Session.pl` contained readable Perl source code. The first lines:

```perl
package Session;
$SIG{__WARN__} = sub {};
use strict;
use HTML::Template;
use HTTP::BrowserDetect;
use CGI::Simple;
...
```

From total gibberish to clean, readable, commented Perl code. The `package Session;` declaration, the `use strict;` pragma, the imported modules (`HTML::Template`, `HTTP::BrowserDetect`, `CGI::Simple`) — all of it was recovered perfectly. The decrypted file was a fully functional Perl module that could be read, understood, modified, and executed.

**Cause and effect:** The reason the decryption produces _exactly_ the original source code (byte for byte, including whitespace and comments) is that XOR-based stream ciphers are **lossless and symmetric**. `plaintext XOR keystream = ciphertext`, and `ciphertext XOR keystream = plaintext`. There is no compression, no padding, no block alignment — the output is exactly the same length as the input, and every byte is perfectly preserved. This is in contrast to block ciphers (like AES-CBC), which add padding bytes that must be stripped after decryption.

---

## Why This Protection Scheme Is Weak

While SibSoft's encryption is effective against casual inspection (opening `Session.pm` in a text editor reveals nothing useful), it has several fundamental weaknesses:

### 1. The Key Is Shipped with the Lock

The `cbuf` key is embedded in the `.so` file, which is distributed alongside the encrypted modules. This is equivalent to locking a door and taping the key to the doorframe. Anyone with access to the `.so` file can extract the key — it is just 256 bytes at a known offset.

**Why SibSoft does this:** They have no choice. The decryption must happen on the customer's server, without any network communication to a license server. This means the key must be present on the server, in the `.so` file. There is no way to hide a key from someone who has root access to the machine where decryption occurs.

### 2. RC4 Is a Broken Cipher

RC4 has been known to have statistical biases in its keystream since 1995 (Roos' biases). In 2001, the Fluhrer-Mantin-Shamir attack demonstrated practical key recovery from related-key ciphertexts (this is how WEP was broken). In 2015, RC4 was officially prohibited in TLS by RFC 7465. While these attacks do not directly apply to SibSoft's use case (they require multiple ciphertexts encrypted with related keys), using a cipher with known weaknesses is a red flag.

### 3. The .so Can Be Instrumented

Even without reverse engineering the cipher, an attacker can simply **hook the decryption function** and capture the plaintext. On Linux, this can be done with `LD_PRELOAD` to intercept `dl_load_file`, or by using `gdb` to set a breakpoint after `CipherUpdate` returns and reading the output buffer. On the Perl side, you can override the source filter mechanism to capture the decrypted source before the parser sees it.

### 4. No Integrity Verification

The `.so` file does not verify the integrity of the encrypted modules. There is no HMAC, no digital signature, no checksum. An attacker could modify the Base64 blob (for example, by flipping bits in the ciphertext, which flips the corresponding bits in the plaintext due to XOR's properties), and the filter would happily decrypt and evaluate the modified code. This is a **malleability** vulnerability inherent to all XOR-based stream ciphers without authentication.

### 5. Static Key Per Release

All modules encrypted with the same `.so` file use the same `cbuf` key. If you decrypt one module, you can decrypt all of them. There is no per-module key, no key derivation function, no nonce. This means a single successful key extraction compromises the entire distribution.

---

## What a Stronger Scheme Would Look Like

If SibSoft wanted to make their protection significantly harder to break (while acknowledging that any client-side protection is ultimately breakable by a sufficiently motivated attacker), they could:

1. **Use AES-256-GCM instead of RC4.** AES-GCM provides authenticated encryption, preventing both decryption without the key and modification of the ciphertext. GCM mode also provides a unique nonce per encryption operation, so identical plaintexts produce different ciphertexts.

2. **Derive per-module keys from a master key.** Use a key derivation function (KDF) like HKDF or PBKDF2 to derive a unique decryption key for each module. This way, extracting one module's key does not compromise the others.

3. **Obfuscate the key in the binary.** Instead of storing `cbuf` as a contiguous 256-byte array at a fixed symbol address, scatter the key bytes throughout the `.data` section and reassemble them at runtime using computed addresses. This makes static extraction with `dd` much harder (though dynamic analysis with a debugger would still work).

4. **Use code virtualization.** Replace the C cipher code with a custom bytecode interpreter that executes the cipher in a virtual machine. Tools like VMProtect and Themida do this for Windows executables. This makes Ghidra decompilation useless because the code is not native x86 — it is custom bytecode that must be reverse-engineered separately.

5. **License server validation.** Require the software to contact a license server on startup to receive the decryption key. This moves the key off the customer's server entirely. The downside is that the software requires an internet connection and the vendor must maintain a license server indefinitely.

None of these are unbreakable — a determined reverse engineer with a debugger can always intercept the plaintext in memory. But each layer significantly increases the time, skill, and tooling required.

---

## Legal and Ethical Considerations

Before you go decrypting commercial software, some important caveats:

1. **Only reverse engineer code you are legally authorized to inspect.** In many jurisdictions, reverse engineering is legal for interoperability, security research, and personal use. In others, software licenses may contractually prohibit reverse engineering. SibSoft's license agreement likely includes such a clause. The legality depends on your jurisdiction and the purpose of the reverse engineering.

2. **Never execute decrypted code blindly.** Always read the decrypted source code before running it. The encrypted module could contain malicious code (backdoors, credential harvesting, etc.) that was hidden behind the encryption. In this case, the client needed to understand what `Session.pm` does, and reading the decrypted source was the whole point.

3. **Run analysis tools in an isolated environment.** Use a virtual machine, a Docker container, or (as I did) WSL2 on a Windows host. Do not analyze untrusted binaries on a production server or a machine containing sensitive data.

4. **The DMCA's anti-circumvention provisions** (17 U.S.C. 1201 in the United States) may apply to circumventing technological protection measures. However, exemptions exist for security research, interoperability, and other purposes. Consult a lawyer if you are unsure.

5. **The EU's Directive 2009/24/EC** (the Software Directive) generally permits decompilation for interoperability purposes, even if the license prohibits it. European users typically have stronger reverse engineering rights than American users.

---

## Tools Used

| Tool                       | Purpose                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| **strings** (GNU binutils) | Extract printable character sequences from the `.so` to identify function names and constants |
| **readelf** (GNU binutils) | Examine ELF headers, program headers, section headers, and symbol tables                      |
| **objdump** (GNU binutils) | Disassemble specific functions for quick inspection before using Ghidra                       |
| **Ghidra** (NSA)           | Full decompilation of the `.so` into C-like pseudocode; cross-referencing symbols and strings |
| **dd** (coreutils)         | Extract the 256-byte `cbuf` key from the `.so` at a calculated file offset                    |
| **xxd** (vim package)      | Display raw binary data in hexadecimal for visual inspection                                  |
| **Python 3**               | Reimplement the cipher for offline decryption; Base64 decoding via the `base64` module        |
| **WSL2** (Microsoft)       | Linux environment on Windows 11 for running the analysis tools natively                       |

---

## Lessons Learned

1. **Strings first, disassembly second.** Running `strings` on a binary takes 0.1 seconds and immediately reveals function names, error messages, and embedded data that guides all subsequent analysis. It should always be the first step.

2. **ELF program headers are not as scary as they look.** The `readelf -l` output looks intimidating, but the formula `file_offset = Offset + (V - VirtAddr)` is the only math you need. Once you internalize this, extracting data from any ELF binary becomes mechanical.

3. **Custom crypto is always recognizable.** SibSoft's cipher is RC4 with a cosmetic modification (nibble-permuted key indexing). The structure — 256-byte S-box, KSA, PRGA, XOR — is unmistakable to anyone familiar with stream ciphers. If they had used AES or ChaCha20, the decompiled code would look very different (S-boxes would be 16 bytes, there would be round functions, etc.).

4. **Ghidra is remarkably capable for free software.** The decompiled output from Ghidra was accurate enough to reimplement the cipher in Python on the first attempt. The auto-analysis correctly identified function boundaries, resolved cross-references, and propagated types. For a 20 KB `.so` file, the analysis took less than 30 seconds.

5. **The hardest part is not the crypto — it is the ELF offset calculation.** The cipher reimplementation took 15 minutes. Understanding how to map a virtual address to a file offset in an ELF binary took longer. This is a general pattern in reverse engineering: the domain-specific knowledge (file formats, calling conventions, ABI details) is harder than the algorithmic analysis.

6. **XOR-based stream ciphers are symmetric.** The same function encrypts and decrypts. There is no "decryption mode" — you just XOR with the same keystream. This makes reimplementation trivial once you have the key and the algorithm.

---

## References

1. **Ghidra — NSA's reverse engineering framework** — [https://ghidra-sre.org/](https://ghidra-sre.org/) — Free, open-source software reverse engineering suite including disassembler, decompiler, and analysis tools.

2. **Ghidra GitHub Repository** — [https://github.com/NationalSecurityAgency/ghidra](https://github.com/NationalSecurityAgency/ghidra) — Source code and releases.

3. **RC4 (Wikipedia)** — [https://en.wikipedia.org/wiki/RC4](https://en.wikipedia.org/wiki/RC4) — Comprehensive overview of the RC4 stream cipher, its KSA, PRGA, history, and known attacks.

4. **RFC 4648 — The Base16, Base32, and Base64 Data Encodings** — [https://tools.ietf.org/html/rfc4648](https://tools.ietf.org/html/rfc4648) — The specification for Base64 encoding used by SibSoft's protection scheme.

5. **RFC 7465 — Prohibiting RC4 Cipher Suites** — [https://www.rfc-editor.org/rfc/rfc7465](https://www.rfc-editor.org/rfc/rfc7465) — IETF standard prohibiting RC4 in TLS, documenting its known weaknesses.

6. **Perl DynaLoader documentation** — [https://perldoc.perl.org/DynaLoader](https://perldoc.perl.org/DynaLoader) — Official documentation for Perl's dynamic loading mechanism, including `dl_load_file()`, `dl_find_symbol()`, and `dl_install_xsub()`.

7. **Perl XS Tutorial (perlxstut)** — [https://perldoc.perl.org/perlxstut](https://perldoc.perl.org/perlxstut) — Tutorial for writing Perl XS extensions that bridge Perl and C code.

8. **Perl documentation (official)** — [https://perldoc.perl.org/](https://perldoc.perl.org/) — Comprehensive Perl language and module documentation.

9. **ELF man page — elf(5)** — [https://man7.org/linux/man-pages/man5/elf.5.html](https://man7.org/linux/man-pages/man5/elf.5.html) — Linux manual page describing the ELF binary format, including program headers and section headers.

10. **System V ABI: ELF Specification (PDF)** — [https://refspecs.linuxbase.org/elf/elf.pdf](https://refspecs.linuxbase.org/elf/elf.pdf) — The formal specification of the ELF format, including the gABI (generic ABI) and segment loading rules.

11. **readelf manual** — [https://man7.org/linux/man-pages/man1/readelf.1.html](https://man7.org/linux/man-pages/man1/readelf.1.html) — Documentation for the `readelf` command used to inspect ELF binaries.

12. **objdump reference** — [https://sourceware.org/binutils/docs/binutils/objdump.html](https://sourceware.org/binutils/docs/binutils/objdump.html) — Documentation for the `objdump` disassembly tool.

13. **strings (GNU binutils)** — [https://www.mankier.com/1/strings](https://www.mankier.com/1/strings) — Documentation for the `strings` command that extracts printable text from binary files.

14. **B::Deparse (Perl deparser)** — [https://perldoc.perl.org/B::Deparse](https://perldoc.perl.org/B::Deparse) — Perl module that can reconstruct source code from compiled Perl bytecode; an alternative approach to source recovery.

15. **OWASP — Security guidance for handling untrusted code** — [https://owasp.org/](https://owasp.org/) — Best practices for safely analyzing and executing untrusted code.

16. **SibSoft** — [https://sibsoft.net/](https://sibsoft.net/) — The vendor whose protection scheme is analyzed in this article.
