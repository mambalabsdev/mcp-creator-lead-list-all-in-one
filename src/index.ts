#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string; name: string };

// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

// Drop undefined values so optional inputs are not sent to the actor.
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// How long the actor run itself is allowed to take, in seconds. The suite's
// slowest measured run on 2026-09-22 was 152 s on a seven platform search, so
// 1800 s is roughly twelve times that: headroom for a slow day without letting a
// hung run bill indefinitely.
const ACTOR_RUN_TIMEOUT_SECS = 1800;

// How long this wrapper waits for that run, in milliseconds. The actor's own
// timeout plus two minutes, so the run's own TIMED-OUT status is what the
// caller sees rather than the wrapper giving up first and reporting nothing.
const WRAPPER_WAIT_MS = (ACTOR_RUN_TIMEOUT_SECS + 120) * 1000;
const POLL_INTERVAL_MS = 3000;

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED", "ABORTING"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared caller. actorPath is the actor's immutable Apify actor ID (a stable key
// that survives Store renames). The /v2/acts/{id} endpoint accepts it directly,
// so a Store rename never breaks these calls.
//
// START AND POLL, NOT RUN-SYNC. Apify's synchronous endpoints carry a platform
// ceiling of 300 seconds on the HTTP wait itself and answer 408 past it whatever
// the timeout parameter says, so a long run reads as a timeout even though the
// actor goes on to finish. Starting the run, polling it to a terminal status and
// then reading the dataset is the only way to wait as long as the actor needs.
//
// The token is read here rather than at module load, so the tool registers
// unconditionally and a server started without APIFY_TOKEN still advertises its
// capabilities instead of reporting none.
async function runActor(
  actorPath: string,
  actorLabel: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
  }

  const headers = {
    Authorization: `Bearer ${APIFY_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  const httpError = async (response: Response): Promise<string> => {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = ` ${body.error.message}`;
    } catch {
      detail = "";
    }
    switch (response.status) {
      case 400:
        return `The ${actorLabel} run was rejected as invalid input.${detail}`;
      case 401:
        return "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
      case 402:
        return "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
      default:
        return `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
    }
  };

  // 1. Start the run.
  let started: Response;
  try {
    started = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?timeout=${ACTOR_RUN_TIMEOUT_SECS}`,
      { method: "POST", headers, body: JSON.stringify(input) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
  }
  if (!started.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(started) }] };
  }

  let run: { id?: string; status?: string; defaultDatasetId?: string };
  try {
    run = ((await started.json()) as { data?: typeof run }).data ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned a response that could not be parsed: ${message}` }] };
  }
  const runId = run.id;
  if (!runId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned no run id, so there is nothing to wait for.` }] };
  }

  // 2. Poll to a terminal status.
  const deadline = Date.now() + WRAPPER_WAIT_MS;
  let status = run.status ?? "READY";
  let datasetId = run.defaultDatasetId;
  while (!TERMINAL.has(status)) {
    if (Date.now() >= deadline) {
      return {
        isError: true,
        content: [{ type: "text", text: `The ${actorLabel} run ${runId} was still ${status} after ${Math.round(WRAPPER_WAIT_MS / 1000)} seconds and this call stopped waiting. The run itself is still on Apify: read it at https://console.apify.com/actors/runs/${runId}` }],
      };
    }
    await sleep(POLL_INTERVAL_MS);
    let poll: Response;
    try {
      poll = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `Lost contact with the Apify API while waiting for ${actorLabel} run ${runId}: ${message}` }] };
    }
    if (!poll.ok) {
      return { isError: true, content: [{ type: "text", text: await httpError(poll) }] };
    }
    const body = (await poll.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    status = body.data?.status ?? status;
    datasetId = body.data?.defaultDatasetId ?? datasetId;
  }

  // 3. A run that did not succeed is a failure the caller must see, never an
  // empty success. Surfacing it here is what keeps a crashed run from reading
  // as "no results found".
  if (status !== "SUCCEEDED") {
    return {
      isError: true,
      content: [{ type: "text", text: `The ${actorLabel} run did not succeed (run ID: ${runId}, status: ${status}).` }],
    };
  }
  if (!datasetId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run ${runId} succeeded but reported no dataset, so there is nothing to return.` }] };
  }

  // 4. Read the dataset.
  let ds: Response;
  try {
    ds = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json`, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not read the ${actorLabel} dataset: ${message}` }] };
  }
  if (!ds.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(ds) }] };
  }

  let items: unknown;
  try {
    items = await ds.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run returned a response that could not be parsed: ${message}` }] };
  }

  if (!Array.isArray(items)) {
    const asObj = items as { error?: { type?: string; message?: string } };
    const detail = asObj?.error?.message
      ? `${asObj.error.message}`
      : JSON.stringify(items);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run did not return a dataset. ${detail}` }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}

const server = new McpServer({
  name: "mamba-creator-lead-list-all-in-one",
  version: pkg.version,
});

// Influencer Lead List Builder (immutable actor ID KnmByszcv135yM30G)
server.registerTool(
  "build_influencer_lead_list",
  {
    title: "Build an Influencer Lead List End to End",
    description:
      "Runs the three stages of the suite in one call: find creators by keyword or curated niche, read each profile, then follow the link in bio page. Returns one flat row per creator carrying handle, profile URL, display name, follower count, a stable creator_id and the method that produced it, the public business email, a manager email, a matched talent agency, newsletter status and the platform behind it, and what the creator sells. Start from keywords or a niche to discover creators, or hand it handles you already hold to skip discovery. Skipping the link check stops after the profile read. Every row carries row_status and error_reason, and a creator dropped by the country filter says so rather than disappearing. Charges $0.002 per run, then $0.007 per creator found, $0.006 per profile read, and $0.008 per link check, plus $0.004 per headless browser render, $0.005 per website email scan, $0.003 per agency match, and $0.01 per Instagram bio fetch when those steps run. The AI check uses your own Anthropic or OpenAI key and is billed by them. Contributes the public records it finds to a shared creator and agency pool that all users of this actor read from, so a later run reads what this one found; `contribute_to_shared_pool` is on by default and turning it off leaves the run reading the pool and writing nothing. Only public data already in the returned rows is contributed, nothing from your Apify account or your input, and a contribution is not charged. Requires an APIFY_TOKEN and consumes Apify credits. Read only.",
    annotations: {
      title: "Build an Influencer Lead List End to End",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
    keywords: z.array(z.string()).optional().describe("Search phrases, one per line, for example \"budget travel\" or \"meal prep coach\". Each keyword is searched on each platform. Use `niche` instead to load a curated keyword set."),
    niche: z.enum(["custom", "personal_finance", "business_marketing", "health_fitness", "beauty_skincare", "parenting_family", "food_cooking", "travel", "tech_ai"]).optional().describe("Loads a curated set of search keywords for the niche (about 60 per niche, measured in the September 2026 pre-research). `max_keywords_per_niche` caps how many are used. Leave as custom to search only your keywords. Default: \"custom\"."),
    max_keywords_per_niche: z.number().int().optional().describe("How many keywords from the niche set to search. 1 to 60. Default: 10."),
    handles: z.array(z.string()).optional().describe("One per line. A profile URL on any supported platform (https://www.tiktok.com/@name, https://www.instagram.com/name/, https://www.youtube.com/@name, a Pinterest, Twitch, or Threads profile, an Apple Podcasts show page, or a Spotify show), or platform:@handle (tiktok:@name). A bare @handle needs `platforms` and is looked up on each listed platform. One entry is a single run; a list is a batch. Duplicates are removed before any fetch."),
    platforms: z.array(z.enum(["tiktok", "instagram", "youtube", "pinterest", "twitch", "threads", "podcast"])).optional().describe("Which platforms to search, and which platforms a bare @handle is looked up on. A full profile URL carries its own platform and ignores this. Supported: TikTok, Instagram, YouTube, Pinterest, Twitch, Threads, and podcasts. Not X, not Facebook pages, not LinkedIn."),
    max_creators_per_keyword: z.number().int().optional().describe("Cap per search. Search engines honor the site: filter for the first page or two only, so 20 to 30 per keyword with more keywords beats deep paging. Default: 20."),
    max_creators: z.number().int().optional().describe("Hard cap on rows returned, so a broad niche cannot run away. Default: 200."),
    follower_min: z.number().int().optional().describe("Drop creators whose follower count is known and below this. A creator whose count the search did not show is kept, so a later profile read can fill it. Default: 5000."),
    follower_max: z.number().int().optional().describe("Drop creators whose follower count is known and above this. Default: 500000."),
    us_only: z.boolean().optional().describe("Launch scope is US creators. A row whose country_guess is a known non US country is returned as an error row saying so. Rows with no country signal are kept. Uncheck to keep every country. Default: true."),
    skip_links: z.boolean().optional().describe("Off by default. On: discovery and profile only. The link-in-bio page is never fetched, so no links-checked, browser-render, website-scan, or agency-match event is charged and the links, newsletter, and sells columns stay null. Default: false."),
    render_unreadable_pages: z.boolean().optional().describe("Off by default. Some link-in-bio pages (Stan Store, linkin.bio, Typeform shells) return an empty shell to a plain fetch and are classified unknown_fetch_failed. Turn this on to render them in a headless browser. Charged per page rendered (event browser-render) to cover the browser compute. Default: false."),
    ai_check: z.boolean().optional().describe("Off by default. When on, a model reads the rule classifier's evidence and rules on each row. Runs only with your own key in `ai_api_key`; the actor never uses a Mamba Labs key and never logs yours. Default: false."),
    ai_provider: z.enum(["anthropic", "openai"]).optional().describe("Which API the key belongs to. Default: \"anthropic\"."),
    ai_api_key: z.string().optional().describe("Your own model API key. Used only when `ai_check` is on. Never stored, logged, or written to a row."),
    scan_website_for_email: z.boolean().optional().describe("Off by default. For creators with their own website (not a link-in-bio page), reads the home, contact, and about pages and the footer for an email and records where it was found. Charged per creator scanned (event website-scan). Default: false."),
    match_agencies: z.boolean().optional().describe("Matches the domain of a manager or business email against the bundled talent agency list and fills agency_name, agency_domain, and agency_match_method. Charged per matched row (event agency-match). Default: true."),
    escalate_on_block: z.boolean().optional().describe("On by default. A profile fetch that comes back as a bot detection page is retried once over the residential proxy. On Instagram the bio, bio link, and following are read from the profile page over residential when the embed and the datacenter API did not carry them, and a page that comes back readable charges instagram-bio-fetch ($0.010). Uncheck it to never pay that event: a blocked profile then returns a labeled error row, and Instagram rows keep an empty bio and bio link on about half of the reads. Default: true."),
    batch_size: z.number().int().optional().describe("Rows fetched at once. Leave empty for the measured per platform default; the measurement is in the README. Higher is faster and, above the measured point, loses rows."),
    mode: z.enum(["sub_actors", "in_process"]).optional().describe("Leave empty for the default. sub_actors calls the Influencer Finder, the Influencer Profile Scraper, and the Link in Bio Scraper and Newsletter Detector by Actor ID as runs on your account, so each stage bills its own events and its own actor-start. in_process runs the same three stages inside this actor and charges the same stage events here. A complete row costs $0.021 either way, plus the add-ons you turn on."),
    twitch_client_id: z.string().optional().describe("Optional. Your own registered Twitch application client id. With `twitch_app_token` the Twitch reads use the official Helix API instead of the public web endpoint. Never a Mamba Labs credential."),
    twitch_app_token: z.string().optional().describe("Optional. An app access token for your Twitch client id (client credentials flow). Used only for Twitch reads, never stored or logged."),
    // Shared pool toggle (wo-influencer-newsletter-agency-pool-exchange-2026-09-22, Track 4).
    // The actor input field is Track 3's; this mirror exists so an MCP caller can turn the
    // contribution off. Do not publish this wrapper before the actor build that carries the
    // field is live, or the actor is sent an input property its schema does not have.
    contribute_to_shared_pool: z.boolean().optional().describe("On by default. Contributes the public records this run finds to a shared creator and agency pool that all users of this actor read from, so a later run reads what this one found. Only public data already in the returned rows is sent, never your Apify account, your input list, or your API keys, and a contribution is not charged. Set false to read the pool and write nothing. Default: true."),
    },
  },
  async (args) =>
    runActor("KnmByszcv135yM30G", "Influencer Lead List Builder", compact(args as Record<string, unknown>)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
