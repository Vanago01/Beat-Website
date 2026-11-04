/** Escapes LIKE/ILIKE wildcards in user input. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
