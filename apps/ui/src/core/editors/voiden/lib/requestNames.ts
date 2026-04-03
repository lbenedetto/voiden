/**
 * Quirky request section names
 *
 * Randomly assigned when creating new request sections.
 * Mixed styles: dev adjective + animal, mythical creatures, techy phrases, and fun references.
 * No repetition within the same document.
 */

export const REQUEST_NAMES: string[] = [
  // Dev Adjective + Animal (alliterative)
  "Async Axolotl",
  "Authenticated Armadillo",
  "Atomic Albatross",
  "Awaited Anteater",
  "Batched Badger",
  "Binary Bison",
  "Buffered Butterfly",
  "Blazing Bobcat",
  "Cached Capybara",
  "Compiled Cobra",
  "Concurrent Chinchilla",
  "Chunked Chameleon",
  "Debounced Dolphin",
  "Deployed Dingo",
  "Durable Dragonfly",
  "Dynamic Dugong",
  "Encrypted Emu",
  "Ephemeral Eagle",
  "Elastic Echidna",
  "Eager Ermine",
  "Forked Falcon",
  "Fuzzy Flamingo",
  "Federated Ferret",
  "Failover Firefly",
  "Gzipped Gecko",
  "Graceful Gorilla",
  "Guarded Gazelle",
  "Greedy Gopher",
  "Hashed Hedgehog",
  "Hybrid Heron",
  "Hoisted Hamster",
  "Headless Hawk",
  "Idempotent Iguana",
  "Indexed Ibis",
  "Immutable Impala",
  "Invoked Inchworm",
  "Jitted Jaguar",
  "Journaled Jellyfish",
  "Joined Jackrabbit",
  "Keyed Koala",
  "Kinetic Kestrel",
  "Keepalive Kudu",
  "Lazy Lemur",
  "Linked Lynx",
  "Lockfree Lamprey",
  "Latent Lobster",
  "Memoized Mongoose",
  "Merged Mantis",
  "Mutable Macaw",
  "Minified Meerkat",
  "Nullable Narwhal",
  "Nested Newt",
  "Native Nighthawk",
  "Namespaced Numbat",
  "Optimized Otter",
  "Overloaded Osprey",
  "Observing Ocelot",
  "Paginated Pangolin",
  "Proxied Puffin",
  "Polled Pelican",
  "Piped Platypus",
  "Queued Quokka",
  "Quantized Quetzal",
  "Reactive Raccoon",
  "Retried Raven",
  "Routed Roadrunner",
  "Resolved Rhino",
  "Streamed Salamander",
  "Sharded Sloth",
  "Stateless Starling",
  "Spawned Squid",
  "Throttled Toucan",
  "Typed Tortoise",
  "Tunneled Tapir",
  "Traced Tarsier",
  "Unsigned Uakari",
  "Unwrapped Urutu",
  "Validated Vulture",
  "Versioned Viper",
  "Volatile Vicuna",
  "Vectored Vole",
  "Webhooked Walrus",
  "Wrapped Wombat",
  "Watched Wolverine",
  "Wired Warbler",
  "Yielded Yak",
  "Zipped Zebra",
  "Zeroed Zebrafish",

  // Dev Adjective + Mythical/Epic
  "Idempotent Phoenix",
  "Polymorphic Kraken",
  "Stateless Sphinx",
  "Cached Chimera",
  "Recursive Griffin",
  "Tokenized Titan",
  "Serialized Centaur",
  "Immutable Hydra",
  "Partitioned Pegasus",
  "Replicated Leviathan",
  "Sharded Minotaur",
  "Proxied Basilisk",
  "Distributed Dragon",
  "Sandboxed Cerberus",
  "Evented Cyclops",

  // Two Dev Words (techy vibes)
  "Lazy Payload",
  "Eager Endpoint",
  "Volatile Webhook",
  "Silent Handshake",
  "Rogue Middleware",
  "Phantom Payload",
  "Midnight Deploy",
  "Stealth Redirect",
  "Rogue Resolver",
  "Phantom Token",
  "Ghost Pipeline",
  "Shadow Proxy",
  "Turbulent Uptime",
  "Reckless Rollback",
  "Cosmic Timeout",
  "Feral Callback",
  "Rogue Socket",
  "Silent Failover",
  "Neon Pipeline",
  "Velvet Throughput",
  "Chaos Endpoint",
  "Quantum Latency",
  "Frosty Handshake",
  "Midnight Webhook",
  "Turbo Ingress",
  "Savage Backoff",
  "Neon Resolver",

  // Fun/Unexpected
  "Captain Webhook",
  "Sergeant Stacktrace",
  "Major Refactor",
  "Professor Payload",
  "Detective Deadlock",
  "Baron von Buffer",
  "The Unauthenticated",
  "Return of the 404",
  "Revenge of the Null",
  "One More Deploy",
  "Works on My Machine",
  "Trust the Cache",
  "Hold My Bearer Token",
  "sudo Make Sandwich",
  "rm -rf Regrets",
  "git push --yolo",
  "Merge Conflict Monday",
  "Segfault Surprise",
  "The Last Semicolon",
  "418 I'm a Teapot",
  "Schrödinger's Bug",
  "Heisenbug Hunter",
  "Race Condition Rodeo",
  "Deadlock Disco",
  "NaN of Your Business",
  "Undefined Behavior",
  "Stack Overflow Safari",

  // Extra animals
  "Pinged Penguin",
  "Synced Seahorse",
  "Forked Fox",
  "Prefetched Parrot",
  "Bridged Bear",
  "Patched Panda",
  "Refactored Rabbit",
  "Transpiled Tiger",
  "Linted Llama",
  "Snapshotted Swan",
  "Dockerized Dodo",
  "Kubernetes Kangaroo",
  "Terraform Turtle",

  // Extra techy
  "Haunted Handshake",
  "Forbidden Frequency",
  "Orphaned Origin",
  "Dangling Pointer",
  "Escaped Exception",
  "Floating Promise",
  "Stale Closure",
  "Unhandled Unicorn",
  "Benevolent Bottleneck",
  "Caffeinated Cursor",
  "Overclocked Oracle",
  "Parallel Paradox",
  "Recursive Rabbit Hole",
  "Spinning Semaphore",
  "Tangled Transaction",
  "Unleashed Upstream",
  "Wandering Worker",
  "Yielding Yeti",
];

/**
 * Pick a random request name that hasn't been used in the current document.
 * Falls back to "Request N" if all 200 names are exhausted.
 */
export function getRandomRequestName(usedNames: string[] = []): string {
  const usedSet = new Set(usedNames.map(n => n.toLowerCase()));
  const available = REQUEST_NAMES.filter(n => !usedSet.has(n.toLowerCase()));

  if (available.length === 0) {
    return `Request ${usedNames.length + 1}`;
  }

  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Collect all existing separator labels from an editor document.
 */
export function getUsedNamesFromDoc(editor: any): string[] {
  const usedNames: string[] = [];
  editor.state.doc.forEach((child: any) => {
    if (child.type.name === 'request-separator' && child.attrs.label) {
      usedNames.push(child.attrs.label);
    }
  });
  return usedNames;
}
