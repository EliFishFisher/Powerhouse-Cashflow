/**
 * Shared helper used by all Next.js API routes that proxy writes
 * to the existing Express data server running on port 3001.
 */

const DATA_SERVER = "http://localhost:3001";

export async function proxyGet(path: string) {
  const res = await fetch(`${DATA_SERVER}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Data server error: ${res.status}`);
  return res.json();
}

export async function proxyPost(path: string, body: unknown) {
  const res = await fetch(`${DATA_SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Data server error: ${res.status}`);
  return res.json();
}

export async function proxyDelete(path: string) {
  const res = await fetch(`${DATA_SERVER}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Data server error: ${res.status}`);
  return res.json();
}
