import merge from ".";

async function* generator(name: string, dt: number, limit = 100) {
  try {
    for (let i = 0; ; i++) {
      console.log(`${name} yielded ${i}`);
      yield `${name}: ${i}`;
      await new Promise((resolve) => setTimeout(resolve, dt));
    }
  } finally {
    console.log(`Closing ${name} (doing some cleanup)`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function* caller() {
  // JS does a good job of propagating iterator close operation (i.e.
  // calling `.return()` an iterator is used in `yield*` or `for await`).
  yield* merge(
    {
      mode: "iters-close-wait",
      concurrency: 2,
    },
    generator("A", 22),
    generator("B", 55),
    generator("C", 33),
    generator("D", 44),
    generator("E", 11)
  );
  // Available modes:
  // - "iters-noclose" (does not call inner iterators' `return` method)
  // - "iters-close-nowait" (calls `return`, but doesn't await nor throw)
  // - "iters-close-wait" (calls `return` and awaits for inners to finish)
}

(async () => {
  for await (const message of caller()) {
    if (message.includes("D")) {
      // This `break` closes the merged iterator, and the signal is
      // propagated to all inner iterators.
      break;
    }
    console.log(`Received from ${message}`);
  }
  console.log("Finishing");
})();
