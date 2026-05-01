import type { FookieClientOptions, GraphQLRequest, GraphQLResponse } from "./types.js";

export class FookieClient {
  private baseURL: string;
  private token: string;
  private adminKey: string;

  constructor(baseURL: string, options: FookieClientOptions = {}) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.token = options.token ?? "";
    this.adminKey = options.adminKey ?? "";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    if (this.adminKey) h["X-Fookie-Admin-Key"] = this.adminKey;
    return h;
  }

  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>({ query, variables });
  }

  async mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>({ query: mutation, variables });
  }

  private async request<T>(body: GraphQLRequest): Promise<T> {
    const res = await fetch(`${this.baseURL}/graphql`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Fookie HTTP ${res.status}: ${await res.text()}`);
    }

    const json: GraphQLResponse<T> = await res.json();

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Fookie GraphQL error: ${json.errors[0].message}`);
    }

    return json.data as T;
  }

  subscribe<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>
  ): AsyncIterable<T> {
    const wsURL = this.baseURL
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://") + "/graphql/ws";

    const token = this.token;
    const adminKey = this.adminKey;

    return {
      [Symbol.asyncIterator]() {
        const ws = new WebSocket(wsURL, "graphql-transport-ws");
        const queue: Array<{ value?: T; done?: boolean; error?: Error }> = [];
        let resolve: ((v: IteratorResult<T>) => void) | null = null;

        function push(item: { value?: T; done?: boolean; error?: Error }) {
          if (resolve) {
            const r = resolve;
            resolve = null;
            if (item.error) throw item.error;
            r(item.done ? { value: undefined as unknown as T, done: true } : { value: item.value!, done: false });
          } else {
            queue.push(item);
          }
        }

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "connection_init", payload: { token, adminKey } }));
        };

        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string) as { type: string; id?: string; payload?: unknown };
          switch (msg.type) {
            case "connection_ack":
              ws.send(JSON.stringify({ id: "1", type: "subscribe", payload: { query, variables } }));
              break;
            case "next": {
              const payload = msg.payload as { data: T };
              push({ value: payload.data });
              break;
            }
            case "error":
              push({ error: new Error(`Fookie subscription error: ${JSON.stringify(msg.payload)}`) });
              break;
            case "complete":
              push({ done: true });
              break;
            case "ping":
              ws.send(JSON.stringify({ type: "pong" }));
              break;
          }
        };

        ws.onerror = (ev) => {
          push({ error: new Error(`Fookie WebSocket error: ${JSON.stringify(ev)}`) });
        };

        ws.onclose = () => {
          push({ done: true });
        };

        return {
          next(): Promise<IteratorResult<T>> {
            if (queue.length > 0) {
              const item = queue.shift()!;
              if (item.error) return Promise.reject(item.error);
              if (item.done) return Promise.resolve({ value: undefined as unknown as T, done: true });
              return Promise.resolve({ value: item.value!, done: false });
            }
            return new Promise((res) => { resolve = res; });
          },
          return(): Promise<IteratorResult<T>> {
            ws.close();
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          },
        };
      },
    };
  }
}
