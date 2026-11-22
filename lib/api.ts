// The Herding Sparks API, at https://$HSCLI_API_HOST/v1. The host is never
// built in: Hull grants only "$HSCLI_API_HOST" (app.ts), and refuses every
// other host, and all of them when the variable is unset. The variable is
// checked here first, so the message says what to set; a refusal Hull still
// gives (code "denied") is named as one.
import { httpClient } from "hull:http-client";
import type { HttpResponse } from "hull:http-client";
import { fs } from "hull:fs";
import { encoding } from "hull:encoding";
import type { ApiErrorBody, Description, Env, KeyReport, Model } from "./types.ts";

export const KEY_FILE = "@state/api-key";
export const KEY_RE = /^hsk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;
const HOST_RE = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export class HscliError extends Error {
    readonly rc: number;
    constructor(message: string, rc = 1) { super(message); this.rc = rc; }
}

// -> the host, or throws naming the variable.
export function host(env: Env): string {
    const h = env.HSCLI_API_HOST;
    if (!h) throw new HscliError("set HSCLI_API_HOST to the API's host name, sent with your key", 2);
    if (!HOST_RE.test(h)) throw new HscliError(`HSCLI_API_HOST is a bare host name, not a URL or host:port: ${h}`, 2);
    return h;
}

export function baseUrl(env: Env): string { return `https://${host(env)}/v1`; }

export function readKey(): string {
    let k: string;
    try { k = (encoding.utf8.decode(encoding.bytes.toU8(fs.read(KEY_FILE))) ?? "").trim(); } catch (_e) { k = ""; }
    if (!KEY_RE.test(k)) throw new HscliError("no key stored: run hscli login");
    return k;
}

// A GET's status and its JSON body, or null if the body is not JSON.
export interface Reply { status: number; doc: unknown }

// GET a path under /v1 with the key.
export async function get(env: Env, path: string, key: string): Promise<Reply> {
    const url = `${baseUrl(env)}${path}`;
    let r: HttpResponse;
    try {
        r = await httpClient.async.get(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    } catch (e) {
        const x = e as { code?: string; host?: string; message?: string } | undefined;
        if (x?.code === "denied") throw new HscliError(`hscli may not connect to ${x.host ?? url}: only the host in HSCLI_API_HOST is allowed`, 2);
        throw new HscliError(`cannot reach ${url}: ${String(x?.message ?? e)}`);
    }
    let doc: unknown = null;
    try {
        doc = JSON.parse(typeof r.body === "string" ? r.body : encoding.utf8.decode(encoding.bytes.toU8(r.body)) ?? "");
    } catch (_e) { doc = null; }
    return { status: r.status, doc };
}

// A warning when the key expires within WARN_DAYS, or null. The gateway gives
// expiry as YYYY-MM-DDTHH:MM:SS+0000; the colon is added for Date.parse.
export const WARN_DAYS = 14;
export function expiryWarning(expires: unknown, nowMs = Date.now()): string | null {
    if (typeof expires !== "string") return null;
    const t = Date.parse(expires.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
    if (Number.isNaN(t) || t <= nowMs) return null;
    const days = Math.ceil((t - nowMs) / 86400000);
    if (days > WARN_DAYS) return null;
    return `hscli: your key expires on ${expires.slice(0, 10)}, in ${days} day${days === 1 ? "" : "s"}: `
        + "ask the operator for a new one, then hscli login with it";
}

// The API's error, for a message.
export function apiError(r: Reply): string {
    const e = (r.doc as ApiErrorBody | null)?.error;
    return e ? `${r.status} ${e.code}: ${e.message}` : `HTTP ${r.status}`;
}

// The key's report and the models it may use.
export async function describe(env: Env, key: string): Promise<Description> {
    const k = await get(env, "/hs/key", key);
    const report = k.doc as KeyReport | null;
    if (k.status !== 200 || !report?.limits) throw new HscliError(`the API refused the key: ${apiError(k)}`);
    const m = await get(env, "/models", key);
    const data = (m.doc as { data?: unknown } | null)?.data;
    if (m.status !== 200 || !Array.isArray(data)) throw new HscliError(`cannot list the models: ${apiError(m)}`);
    return { key: report, models: data as Model[] };
}
