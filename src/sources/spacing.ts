// Spaces a Source's requests at least `ms` apart; callers await it before each request, one at a time.
export function spaced(ms: number) {
  let last = 0;
  return async () => {
    const wait = last + ms - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    last = Date.now();
  };
}
