# TM Onsale Feed V15

**The Ultimate Onsale Finder** - ShowsOnSale-level coverage using the Ticketmaster Discovery API.

## How It Works

Unlike previous versions that queried by **event date** (and found few onsales), V15 queries by **onsale date**:

```
GET /events.json?onsaleStartDateTime=TODAY&onsaleEndDateTime=TODAY+14days
```

This finds ALL events going on sale in the next 14 days, regardless of when the event itself occurs.

## Features

- **7,000+ onsales per week** (matching ShowsOnSale coverage)
- **All presale types detected**: Artist, Card, Venue, VIP, Promo
- **Full US + Canada coverage**: 51 US states/DC + 13 Canadian provinces
- **All segments**: Music, Sports, Arts & Theatre, Film, Miscellaneous
- **Chronological sorting**: By sale start time, not event date
- **Automatic deduplication**: Same event from multiple queries

## Sale Categories

| Category | Examples |
|----------|----------|
| ARTIST | Verified Fan, Artist Presale, Fan Club, Spotify |
| CARD | Citi, Amex, Chase, Capital One |
| VENUE | Venue Presale, Local, Box Office |
| VIP | VIP Packages, Premium, Meet & Greet |
| PROMO | Radio, Media, Contest |
| PUBLIC | General Public Onsale |

## Output Format

### onsales.json
```json
{
  "generated": "2026-01-31T12:00:00Z",
  "stats": {
    "totalOnsales": 7234,
    "byType": { "PUBLIC": 4500, "ARTIST": 1200, ... }
  },
  "onsales": [
    {
      "eventId": "G5vYZ9...",
      "eventName": "Taylor Swift | The Eras Tour",
      "venue": "MetLife Stadium",
      "city": "East Rutherford",
      "state": "NJ",
      "eventDate": "2026-06-15",
      "saleType": "PRESALE",
      "saleName": "Verified Fan Presale",
      "saleCategory": "ARTIST",
      "saleStart": "2026-01-31T10:00:00-05:00",
      "saleEnd": "2026-02-01T22:00:00-05:00",
      "url": "https://www.ticketmaster.com/..."
    }
  ],
  "byDay": {
    "2026-01-31": [...],
    "2026-02-01": [...]
  }
}
```

## Setup

1. Add your TM API key to GitHub Secrets as `TM_API_KEY`
2. Enable workflow permissions: Settings → Actions → General → "Read and write permissions"
3. Run the workflow manually or wait for scheduled run (every 4 hours)

## Local Testing

```bash
export TM_API_KEY=your_api_key_here
node fetch-onsales.js
```

## API Usage

With an unlimited API key:
- ~2,000-4,000 queries per run
- ~15-25 minute runtime
- Runs every 4 hours via GitHub Actions

## Integration with GhostCart

The `onsales.min.json` file can be fetched directly from GitHub:

```javascript
const FEED_URL = 'https://raw.githubusercontent.com/lardcaleb-ctrl/tm-onsale-feed/main/onsales.min.json';
const data = await fetch(FEED_URL).then(r => r.json());
```
