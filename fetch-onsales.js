// ============================================================
// TM ONSALE FINDER V15 - THE ULTIMATE SHOWSONSALE KILLER
// ============================================================
// Strategy: Query by ONSALE DATE (not event date) + extract ALL presales
// Expected: 7,000+ onsales per week like ShowsOnSale

const fs = require('fs');

// API Configuration
const API_KEY = process.env.TM_API_KEY;
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

// US States + DC
const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
    'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// Canadian Provinces (optional)
const CA_PROVINCES = [
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
];

// Segments to query (in priority order)
const SEGMENTS = [
    { id: 'KZFzniwnSyZfZ7v7nJ', name: 'Music' },
    { id: 'KZFzniwnSyZfZ7v7nE', name: 'Sports' },
    { id: 'KZFzniwnSyZfZ7v7na', name: 'Arts & Theatre' },
    { id: 'KZFzniwnSyZfZ7v7n1', name: 'Miscellaneous' },
    { id: 'KZFzniwnSyZfZ7v7nn', name: 'Film' }
];

// Rate limiting
const DELAY_MS = 100; // 100ms between requests (10 req/sec)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Stats tracking
const stats = {
    totalQueries: 0,
    totalEvents: 0,
    totalOnsales: 0,
    bySegment: {},
    byState: {},
    byType: {
        PUBLIC: 0,
        ARTIST: 0,
        CARD: 0,
        VENUE: 0,
        VIP: 0,
        PROMO: 0,
        OTHER: 0
    },
    errors: []
};

// ============================================================
// PRESALE TYPE DETECTION
// ============================================================

function categorizePresale(presale) {
    const name = (presale.name || '').toLowerCase();
    const desc = (presale.description || '').toLowerCase();
    const text = name + ' ' + desc;
    
    if (/verified fan|artist presale|fan club|spotify|soundcheck|meet & greet presale/i.test(text)) {
        return 'ARTIST';
    }
    if (/citi|amex|american express|chase|capital one|mastercard|visa signature/i.test(text)) {
        return 'CARD';
    }
    if (/venue|local|box office/i.test(text)) {
        return 'VENUE';
    }
    if (/vip|package|premium|platinum|meet.*greet/i.test(text)) {
        return 'VIP';
    }
    if (/radio|media|contest|giveaway|live nation|promoter/i.test(text)) {
        return 'PROMO';
    }
    return 'OTHER';
}

// ============================================================
// API FETCHING
// ============================================================

async function fetchWithRetry(url, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url);
            
            if (response.status === 429) {
                console.log(`   ⏳ Rate limited, waiting 5s...`);
                await sleep(5000);
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            if (attempt === retries) throw error;
            console.log(`   ⚠️ Attempt ${attempt} failed, retrying...`);
            await sleep(1000 * attempt);
        }
    }
}

async function fetchAllPages(params, maxPages = 5) {
    const events = [];
    let page = 0;
    let totalPages = 1;
    
    while (page < totalPages && page < maxPages) {
        const url = new URL(BASE_URL);
        url.searchParams.append('apikey', API_KEY);
        url.searchParams.append('size', '200');
        url.searchParams.append('page', page.toString());
        
        for (const [key, value] of Object.entries(params)) {
            if (value) url.searchParams.append(key, value);
        }
        
        try {
            const data = await fetchWithRetry(url.toString());
            stats.totalQueries++;
            
            if (data._embedded?.events) {
                events.push(...data._embedded.events);
            }
            
            if (data.page) {
                totalPages = Math.min(data.page.totalPages, maxPages);
            }
            
            page++;
            await sleep(DELAY_MS);
        } catch (error) {
            stats.errors.push({ url: url.toString(), error: error.message });
            break;
        }
    }
    
    return events;
}

// ============================================================
// ONSALE EXTRACTION
// ============================================================

function extractOnsales(event) {
    const onsales = [];
    const baseInfo = {
        eventId: event.id,
        eventName: event.name,
        eventDate: event.dates?.start?.localDate,
        eventTime: event.dates?.start?.localTime,
        venue: event._embedded?.venues?.[0]?.name,
        city: event._embedded?.venues?.[0]?.city?.name,
        state: event._embedded?.venues?.[0]?.state?.stateCode,
        country: event._embedded?.venues?.[0]?.country?.countryCode || 'US',
        segment: event.classifications?.[0]?.segment?.name,
        genre: event.classifications?.[0]?.genre?.name,
        subGenre: event.classifications?.[0]?.subGenre?.name,
        url: event.url,
        priceMin: event.priceRanges?.[0]?.min,
        priceMax: event.priceRanges?.[0]?.max,
        currency: event.priceRanges?.[0]?.currency || 'USD'
    };
    
    // Extract public onsale
    if (event.sales?.public?.startDateTime && !event.sales?.public?.startTBD) {
        const publicStart = new Date(event.sales.public.startDateTime);
        const now = new Date();
        
        // Only include future onsales or very recent ones (last 24 hours)
        if (publicStart > new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
            onsales.push({
                ...baseInfo,
                saleType: 'PUBLIC',
                saleName: 'General Public Onsale',
                saleDescription: null,
                saleCategory: 'PUBLIC',
                saleStart: event.sales.public.startDateTime,
                saleEnd: event.sales.public.endDateTime,
                saleUrl: event.url
            });
        }
    }
    
    // Extract all presales
    if (event.sales?.presales && Array.isArray(event.sales.presales)) {
        for (const presale of event.sales.presales) {
            if (presale.startDateTime) {
                const presaleStart = new Date(presale.startDateTime);
                const now = new Date();
                
                // Only include future presales or very recent ones
                if (presaleStart > new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
                    const category = categorizePresale(presale);
                    
                    onsales.push({
                        ...baseInfo,
                        saleType: 'PRESALE',
                        saleName: presale.name || 'Presale',
                        saleDescription: presale.description,
                        saleCategory: category,
                        saleStart: presale.startDateTime,
                        saleEnd: presale.endDateTime,
                        saleUrl: presale.url || event.url
                    });
                }
            }
        }
    }
    
    return onsales;
}

// ============================================================
// MAIN QUERY LOGIC
// ============================================================

async function queryOnsalesBySegmentAndState(segment, stateCode, countryCode, onsaleStart, onsaleEnd) {
    const params = {
        onsaleStartDateTime: onsaleStart,
        onsaleEndDateTime: onsaleEnd,
        countryCode: countryCode,
        stateCode: stateCode,
        segmentId: segment.id,
        sort: 'onSaleStartDate,asc'
    };
    
    const events = await fetchAllPages(params);
    stats.totalEvents += events.length;
    stats.bySegment[segment.name] = (stats.bySegment[segment.name] || 0) + events.length;
    stats.byState[stateCode] = (stats.byState[stateCode] || 0) + events.length;
    
    return events;
}

async function runFullScan() {
    console.log('🚀 TM ONSALE FINDER V15 - Starting full scan...\n');
    
    // Calculate date range: Today + 14 days
    const now = new Date();
    const onsaleStart = now.toISOString();
    const onsaleEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`📅 Onsale window: ${onsaleStart.split('T')[0]} to ${onsaleEnd.split('T')[0]}`);
    console.log(`🗺️  Regions: ${US_STATES.length} US states + ${CA_PROVINCES.length} CA provinces`);
    console.log(`🎭 Segments: ${SEGMENTS.map(s => s.name).join(', ')}\n`);
    
    const allOnsales = [];
    const seenEventIds = new Set();
    
    // Process US States
    console.log('🇺🇸 Scanning US states...');
    for (const segment of SEGMENTS) {
        console.log(`\n   [${segment.name}]`);
        let segmentOnsales = 0;
        
        for (let i = 0; i < US_STATES.length; i++) {
            const state = US_STATES[i];
            process.stdout.write(`\r      ${state} (${i + 1}/${US_STATES.length})...`);
            
            try {
                const events = await queryOnsalesBySegmentAndState(
                    segment, state, 'US', onsaleStart, onsaleEnd
                );
                
                for (const event of events) {
                    // Deduplicate
                    if (seenEventIds.has(event.id)) continue;
                    seenEventIds.add(event.id);
                    
                    const onsales = extractOnsales(event);
                    for (const onsale of onsales) {
                        allOnsales.push(onsale);
                        stats.byType[onsale.saleCategory]++;
                        segmentOnsales++;
                    }
                }
            } catch (error) {
                console.log(`\n      ⚠️ Error for ${state}: ${error.message}`);
            }
        }
        
        console.log(`\n      ✅ ${segment.name}: ${segmentOnsales} onsales found`);
    }
    
    // Process Canadian Provinces
    console.log('\n🇨🇦 Scanning Canadian provinces...');
    for (const segment of SEGMENTS) {
        console.log(`\n   [${segment.name}]`);
        
        for (let i = 0; i < CA_PROVINCES.length; i++) {
            const province = CA_PROVINCES[i];
            process.stdout.write(`\r      ${province} (${i + 1}/${CA_PROVINCES.length})...`);
            
            try {
                const events = await queryOnsalesBySegmentAndState(
                    segment, province, 'CA', onsaleStart, onsaleEnd
                );
                
                for (const event of events) {
                    if (seenEventIds.has(event.id)) continue;
                    seenEventIds.add(event.id);
                    
                    const onsales = extractOnsales(event);
                    for (const onsale of onsales) {
                        allOnsales.push(onsale);
                        stats.byType[onsale.saleCategory]++;
                    }
                }
            } catch (error) {
                // Silent fail for CA
            }
        }
        
        console.log('');
    }
    
    stats.totalOnsales = allOnsales.length;
    
    return allOnsales;
}

// ============================================================
// OUTPUT GENERATION
// ============================================================

function generateOutput(onsales) {
    // Sort by sale start time
    onsales.sort((a, b) => new Date(a.saleStart) - new Date(b.saleStart));
    
    // Group by day
    const byDay = {};
    for (const sale of onsales) {
        const day = sale.saleStart.split('T')[0];
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(sale);
    }
    
    // Group by category
    const byCategory = {
        ARTIST: onsales.filter(s => s.saleCategory === 'ARTIST'),
        CARD: onsales.filter(s => s.saleCategory === 'CARD'),
        VENUE: onsales.filter(s => s.saleCategory === 'VENUE'),
        VIP: onsales.filter(s => s.saleCategory === 'VIP'),
        PROMO: onsales.filter(s => s.saleCategory === 'PROMO'),
        PUBLIC: onsales.filter(s => s.saleCategory === 'PUBLIC'),
        OTHER: onsales.filter(s => s.saleCategory === 'OTHER')
    };
    
    // Group by segment
    const bySegment = {};
    for (const sale of onsales) {
        const seg = sale.segment || 'Unknown';
        if (!bySegment[seg]) bySegment[seg] = [];
        bySegment[seg].push(sale);
    }
    
    return {
        generated: new Date().toISOString(),
        version: 'V15',
        stats: {
            totalOnsales: onsales.length,
            totalQueries: stats.totalQueries,
            totalEvents: stats.totalEvents,
            uniqueEvents: new Set(onsales.map(o => o.eventId)).size,
            byType: stats.byType,
            bySegment: Object.fromEntries(
                Object.entries(bySegment).map(([k, v]) => [k, v.length])
            ),
            errors: stats.errors.length
        },
        summary: {
            today: byDay[new Date().toISOString().split('T')[0]]?.length || 0,
            tomorrow: byDay[new Date(Date.now() + 86400000).toISOString().split('T')[0]]?.length || 0,
            thisWeek: onsales.filter(s => {
                const d = new Date(s.saleStart);
                return d <= new Date(Date.now() + 7 * 86400000);
            }).length
        },
        onsales: onsales,
        byDay: byDay,
        byCategory: byCategory
    };
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
    if (!API_KEY) {
        console.error('❌ TM_API_KEY environment variable not set');
        process.exit(1);
    }
    
    const startTime = Date.now();
    
    try {
        // Run full scan
        const onsales = await runFullScan();
        
        // Generate outputs
        const output = generateOutput(onsales);
        
        // Write files
        fs.writeFileSync('onsales.json', JSON.stringify(output, null, 2));
        fs.writeFileSync('onsales.min.json', JSON.stringify(output));
        
        // Generate stats file
        fs.writeFileSync('stats.json', JSON.stringify({
            generated: new Date().toISOString(),
            runtime: Math.round((Date.now() - startTime) / 1000) + 's',
            ...output.stats,
            summary: output.summary
        }, null, 2));
        
        // Print summary
        const runtime = Math.round((Date.now() - startTime) / 1000);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SCAN COMPLETE');
        console.log('='.repeat(60));
        console.log(`⏱️  Runtime: ${runtime} seconds`);
        console.log(`📝 Total Queries: ${stats.totalQueries}`);
        console.log(`🎫 Total Events: ${stats.totalEvents}`);
        console.log(`🎯 Total Onsales: ${stats.totalOnsales}`);
        console.log(`📅 Today: ${output.summary.today}`);
        console.log(`📅 Tomorrow: ${output.summary.tomorrow}`);
        console.log(`📅 This Week: ${output.summary.thisWeek}`);
        console.log('\n📊 By Sale Type:');
        console.log(`   PUBLIC:  ${stats.byType.PUBLIC}`);
        console.log(`   ARTIST:  ${stats.byType.ARTIST}`);
        console.log(`   CARD:    ${stats.byType.CARD}`);
        console.log(`   VENUE:   ${stats.byType.VENUE}`);
        console.log(`   VIP:     ${stats.byType.VIP}`);
        console.log(`   PROMO:   ${stats.byType.PROMO}`);
        console.log(`   OTHER:   ${stats.byType.OTHER}`);
        
        if (stats.errors.length > 0) {
            console.log(`\n⚠️ Errors: ${stats.errors.length}`);
        }
        
        console.log('\n✅ Files saved: onsales.json, onsales.min.json, stats.json');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
