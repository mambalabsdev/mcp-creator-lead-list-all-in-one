# Influencer Lead List Builder MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-creator-lead-list-all-in-one)](https://smithery.ai/servers/mambabuilt/mcp-creator-lead-list-all-in-one) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-creator-lead-list-all-in-one/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-creator-lead-list-all-in-one) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-creator-lead-list-all-in-one%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-creator-lead-list-all-in-one&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-creator-lead-list-all-in-one)](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-lead-list-all-in-one) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-creator-lead-list-all-in-one)](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-lead-list-all-in-one) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-creator-lead-list-all-in-one)](https://github.com/mambalabsdev/mcp-creator-lead-list-all-in-one/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-creator-lead-list-all-in-one)

MCP server for the Mamba Labs [Influencer Lead List Builder](https://apify.com/mambalabs/creator-lead-list-all-in-one) actor on Apify.

Discovery, the profile read, and the link check in one run, on one flat row per creator.

## Install

```bash
npx -y @mambalabsdev/mcp-creator-lead-list-all-in-one
```

### Claude Desktop

```json
{
  "mcpServers": {
    "mamba-creator-lead-list-all-in-one": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-creator-lead-list-all-in-one"],
      "env": { "APIFY_TOKEN": "your-apify-token" }
    }
  }
}
```

Get an Apify token at [console.apify.com/account/integrations](https://console.apify.com/account/integrations).

## Tool

### `build_influencer_lead_list`

Keywords or handles in, a finished influencer lead list with contact details out.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `keywords` | array | no | Search phrases, one per line, for example "budget travel" or "meal prep coach". Each keyword is searched on each platform. Use `niche` instead to load a curated keyword set. |
| `niche` | string | no | Loads a curated set of search keywords for the niche (about 60 per niche, measured in the September 2026 pre-research). `max_keywords_per_niche` caps how many are used. Leave as custom to search only your keywords. Default `"custom"`. |
| `max_keywords_per_niche` | integer | no | How many keywords from the niche set to search. 1 to 60. Default `10`. |
| `handles` | array | no | One per line. A profile URL on any supported platform (https://www.tiktok.com/@name, https://www.instagram.com/name/, https://www.youtube.com/@name, a Pinterest, Twitch, or Threads profile, an Apple Podcasts show. |
| `platforms` | array | no | Which platforms to search, and which platforms a bare @handle is looked up on. A full profile URL carries its own platform and ignores this. Supported: TikTok, Instagram, YouTube, Pinterest, Twitch, Threads, and. |
| `max_creators_per_keyword` | integer | no | Cap per search. Search engines honor the site: filter for the first page or two only, so 20 to 30 per keyword with more keywords beats deep paging. Default `20`. |
| `max_creators` | integer | no | Hard cap on rows returned, so a broad niche cannot run away. Default `200`. |
| `follower_min` | integer | no | Drop creators whose follower count is known and below this. A creator whose count the search did not show is kept, so a later profile read can fill it. Default `5000`. |
| `follower_max` | integer | no | Drop creators whose follower count is known and above this. Default `500000`. |
| `us_only` | boolean | no | Launch scope is US creators. A row whose country_guess is a known non US country is returned as an error row saying so. Rows with no country signal are kept. Uncheck to keep every country. Default `true`. |
| `skip_links` | boolean | no | Off by default. On: discovery and profile only. The link-in-bio page is never fetched, so no links-checked, browser-render, website-scan, or agency-match event is charged and the links, newsletter, and sells columns. Default `false`. |
| `render_unreadable_pages` | boolean | no | Off by default. Some link-in-bio pages (Stan Store, linkin.bio, Typeform shells) return an empty shell to a plain fetch and are classified unknown_fetch_failed. Turn this on to render them in a headless browser.. Default `false`. |
| `ai_check` | boolean | no | Off by default. When on, a model reads the rule classifier's evidence and rules on each row. Runs only with your own key in `ai_api_key`; the actor never uses a Mamba Labs key and never logs yours. Default `false`. |
| `ai_provider` | string | no | Which API the key belongs to. Default `"anthropic"`. |
| `ai_api_key` | string | no | Your own model API key. Used only when `ai_check` is on. Never stored, logged, or written to a row. |
| `scan_website_for_email` | boolean | no | Off by default. For creators with their own website (not a link-in-bio page), reads the home, contact, and about pages and the footer for an email and records where it was found. Charged per creator scanned (event. Default `false`. |
| `match_agencies` | boolean | no | Matches the domain of a manager or business email against the bundled talent agency list and fills agency_name, agency_domain, and agency_match_method. Charged per matched row (event agency-match). Default `true`. |
| `escalate_on_block` | boolean | no | On by default. A profile fetch that comes back as a bot detection page is retried once over the residential proxy. On Instagram the bio, bio link, and following are read from the profile page over residential when. Default `true`. |
| `batch_size` | integer | no | Rows fetched at once. Leave empty for the measured per platform default; the measurement is in the README. Higher is faster and, above the measured point, loses rows. |
| `mode` | string | no | Leave empty for the default. sub_actors calls the Influencer Finder, the Influencer Profile Scraper, and the Link in Bio Scraper and Newsletter Detector by Actor ID as runs on your account, so each stage bills its. |
| `twitch_client_id` | string | no | Optional. Your own registered Twitch application client id. With `twitch_app_token` the Twitch reads use the official Helix API instead of the public web endpoint. Never a Mamba Labs credential. |
| `twitch_app_token` | string | no | Optional. An app access token for your Twitch client id (client credentials flow). Used only for Twitch reads, never stored or logged. |
| `contribute_to_shared_pool` | boolean | no | On by default. Contributes the public records this run finds to a shared creator and agency pool that all users of this actor read from. Only public data already in the returned rows is sent, and a contribution is not charged. Set false to read the pool and write nothing. Default `true`. |

Nothing is required. Influencer Lead List Builder answers a run with no usable input with a row carrying `row_status` and `error_reason` rather than failing, and the tool mirrors that.

## Pricing

Influencer Lead List Builder is pay per event on Apify. Every price below is flat across the FREE, BRONZE, SILVER, and GOLD tiers.

| Event | Charged for | Price | Fires when |
| --- | --- | ---: | --- |
| `actor-start` | Actor start | $0.002 | Once per run, on start. Covers the run overhead. |
| `creator-found` | Creator found | $0.007 | Once per creator row returned by keyword or niche discovery with a handle and a profile URL. A search that returns nothing charges nothing. |
| `profile-read` | Profile read | $0.006 | Once per profile row where the public profile page was read and at least the follower count or the bio came back. A private, missing, or blocked profile returns a labeled error row and does not charge. |
| `links-checked` | Links checked | $0.008 | Once per creator whose bio link or link-in-bio page was fetched and classified. A creator with no bio link returns newsletter_status none from the bio alone and does not charge this event. |
| `browser-render` | Browser render | $0.004 | Once per page rendered in the headless browser because the plain fetch did not return readable content (Stan Store, linkin.bio, Typeform shells) and the rendered page came back readable: 120 characters of visible text or 3 links off the page's host, and no block page. A render that returns the same empty shell is not charged, and a charged render always reaches the classifier. Only when the option is on. Priced to cover the browser compute. |
| `website-scan` | Website scan | $0.005 | Once per creator whose own website (not a link-in-bio page) was scanned for an email on the home, contact, about, and footer. Only when the add-on is on. |
| `agency-match` | Agency match | $0.003 | Once per creator row where a manager or agency email domain was matched against the bundled agency list and an agency name came back. |
| `instagram-bio-fetch` | Instagram bio fetch | $0.01 | Once per Instagram profile row when the bio, bio link, and following were not on the embed widget or the datacenter API and the profile page was read over the residential proxy and came back readable. Only when escalate_on_block is on. Never on the embed or datacenter reads, never on another platform, never on a blocked page, and never on an error row. |

## Reading the output

Every row carries `row_status` and `error_reason`. A creator the actor could not read comes back as a row saying why, not as a gap in the list, so an absence is readable rather than inferred. Filter on `row_status` before loading a table.

## What this actor shares

The run contributes the records it finds to a shared creator and agency pool that all users of this actor read from. What one run finds, the next run can read.

The toggle is `contribute_to_shared_pool`. It is on by default. Set it to false and the run still reads the pool and writes nothing to it.

**What this actor contributes.** One contribution per run, covering what the three stages produced together: the creators found, the profiles read, the manager contacts, and the matched agencies. Not one contribution per stage.

**Only public data that is already in your own output.** Every field written to the pool is a field this run returned to you, read from a page the platform or the creator publishes to anyone without a login. Nothing from your Apify account, your input list, your API keys, or your own notes is sent. A contribution never deletes anything from the pool.

**What a contribution is labeled with.** The actor ID, the run ID, the pool key issued to the actor build, and a hash of the calling IP address, used for the rate limit and nothing else. Your Apify account and your user ID are not recorded.

**Contributing is free.** No event is charged for a write to the pool. If the pool is unreachable the run finishes as normal, the rows are dropped, and the run log says so.

## Actor

Actor ID `KnmByszcv135yM30G`. The wrapper calls the actor by that immutable ID rather than by its Store slug, so a Store rename never breaks it.

## Suite

| Actor | Actor ID | MCP server |
| --- | --- | --- |
| [Influencer Finder](https://apify.com/mambalabs/creator-finder) | `tpkedmloIIWtXx6sg` | [`@mambalabsdev/mcp-creator-finder`](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-finder) |
| [Influencer Profile Scraper](https://apify.com/mambalabs/creator-profile-reader) | `EqEnklDVMIcB1V499` | [`@mambalabsdev/mcp-creator-profile-reader`](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-profile-reader) |
| [Link in Bio Scraper and Newsletter Detector](https://apify.com/mambalabs/link-in-bio-newsletter-checker) | `OorucdheTIgu7RFzK` | [`@mambalabsdev/mcp-link-in-bio-newsletter-checker`](https://www.npmjs.com/package/@mambalabsdev/mcp-link-in-bio-newsletter-checker) |
| [Influencer Change Monitor](https://apify.com/mambalabs/creator-change-monitor) | `d2VVgahNL6UmcLkhg` | [`@mambalabsdev/mcp-creator-change-monitor`](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-change-monitor) |
| [Influencer Lead List Builder](https://apify.com/mambalabs/creator-lead-list-all-in-one) | `KnmByszcv135yM30G` | [`@mambalabsdev/mcp-creator-lead-list-all-in-one`](https://www.npmjs.com/package/@mambalabsdev/mcp-creator-lead-list-all-in-one) |

Built by [Mamba Labs](https://mambabuilt.com).
