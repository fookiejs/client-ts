export interface GraphQLRequest {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
}

export interface GraphQLError {
  message: string;
  path?: string[];
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
}

export interface SubscriptionEvent<T = Record<string, unknown>> {
  data?: T;
  error?: Error;
}

export interface EntityEvent {
  op: string;
  model: string;
  id: string;
  payload_json: string;
  ts: string;
}

export interface FookieClientOptions {
  token?: string;
  adminKey?: string;
}
