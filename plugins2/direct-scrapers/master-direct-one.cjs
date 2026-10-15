const cheerio = require('cheerio');
const { isAllowedDirectTarget } = require('../../lib/contentRestrictions');

class MasterDirectScraper {
    constructor(outputDir = "master_video_assets") {
        // Kept for call-site compatibility only. Search results are memory-only;
        // no directory or permanent JSON result file is created.
        this.outputDir = outputDir;
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        };

        // =====================================================================
        // THE MASTER BANK: Expanded Targets Across All Categories
        // =====================================================================
        this.targets = [
            { id: 'zerochan', name: 'Zerochan', baseUrl: 'https://www.zerochan.net/search?q=', pathKey: '/', type: 'image_gallery' },
            { id: 'moegirl', name: 'Moegirl', baseUrl: 'https://zh.moegirl.org.cn/index.php?search=', pathKey: '/', type: 'image_gallery' },
            { id: 'anime_pictures', name: 'Anime Pictures', baseUrl: 'https://anime-pictures.net/posts?search_tag=', pathKey: '/posts/', type: 'image_gallery' },
            { id: 'seiga_nicovideo', name: 'Seiga Nicovideo', baseUrl: 'https://seiga.nicovideo.jp/search/', pathKey: '/seiga/im', type: 'image_gallery' }
        ];
        this.targets = this.targets.filter(isAllowedDirectTarget);
    }

    async scrapeTarget(targetConfig, query = "anime", limit = 2) {
        let targetUrl = `${targetConfig.baseUrl}${encodeURIComponent(query)}`;
        console.log(`[*] Scraping [${targetConfig.name}] (${targetConfig.type}) from: ${targetUrl}...`);

        let extractedRecords = [];
        try {
            let response = await fetch(targetUrl, { 
                headers: { ...this.headers, 'Referer': targetConfig.baseUrl },
                signal: AbortSignal.timeout(12000),
            });

            if (!response.ok) {
                console.error(`[-] HTTP error: ${response.status} on ${targetConfig.name}`);
                return extractedRecords;
            }

            const declaredLength = Number(response.headers.get('content-length') || 0);
            if (declaredLength > 3 * 1024 * 1024) { console.warn(`[-] Skipping oversized page (${declaredLength} bytes) on ${targetConfig.name}`); return extractedRecords; }
            let html = await response.text();
            if (Buffer.byteLength(html, 'utf8') > 3 * 1024 * 1024) { console.warn(`[-] Skipping oversized HTML on ${targetConfig.name}`); return extractedRecords; }
            let $ = cheerio.load(html);

            $('a').each((index, element) => {
                let href = $(element).attr('href');
                let title = $(element).attr('title') ||$(element).text().trim();

                if (href && href.includes(targetConfig.pathKey) && title.length > 2) {
                    let fullUrl = href.startsWith('http') ? href : new URL(href, targetConfig.baseUrl).href;
                    const image = $(element).find('img').first();
                    const thumbRaw = image.attr('data-original') || image.attr('data-src') || image.attr('data-lazy-src') || image.attr('src') || '';
                    let thumbnailUrl = '';
                    try { thumbnailUrl = thumbRaw ? new URL(thumbRaw, targetUrl).href : ''; } catch {}
                    if (!extractedRecords.some(r => r.url === fullUrl)) {
                        extractedRecords.push({
                            platform: targetConfig.id,
                            category: targetConfig.type,
                            title: title.substring(0, 80).replace(/\s+/g, ' '),
                            url: fullUrl,
                            thumbnailUrl
                        });
                    }
                }
            });

            console.log(`[+] Successfully parsed ${extractedRecords.length} records from ${targetConfig.name}.`);
        } catch (e) {
            console.error(`[-] Exception while scraping ${targetConfig.name}: ${e.message}`);
        }

        return extractedRecords.slice(0, limit);
    }

    getTargetCount() {
        return this.targets.length;
    }

    async runPipeline(query = "anime", options = {}) {
        query = String(query || "anime").trim() || "anime";
        const totalTargets = this.targets.length;
        const requestedMax = Number.parseInt(options.maxTargets, 10);
        const defaultMax = options.all ? totalTargets : 1;
        const maxTargets = Number.isFinite(requestedMax) && requestedMax > 0
            ? Math.min(totalTargets, requestedMax)
            : defaultMax;
        const requestedPerSite = Number.parseInt(options.perSiteLimit, 10);
        const perSiteLimit = Number.isFinite(requestedPerSite) && requestedPerSite > 0
            ? Math.min(40, requestedPerSite)
            : 30;
        const maxResults = 30; // bounds RAM use and supports three 10-item pages
        const delayMs = Number.isFinite(Number(options.delayMs))
            ? Math.max(400, Math.min(5000, Number(options.delayMs)))
            : 900;

        const masterResults = [];
        let selectedTargets;
        if (options.targetId) {
            const wanted = String(options.targetId).toLowerCase().replace(/[^a-z0-9]+/g, '');
            selectedTargets = this.targets.filter(t => String(t.id).toLowerCase().replace(/[^a-z0-9]+/g, '') === wanted || String(t.name).toLowerCase().replace(/[^a-z0-9]+/g, '') === wanted).slice(0, 1);
            if (!selectedTargets.length) throw new Error(`Unknown site '${options.targetId}'. Use a safe target ID such as zerochan, anime_pictures, or seiga_nicovideo.`);
        } else {
            selectedTargets = this.targets.slice(0, maxTargets);
        }

        // selectedTargets must be resolved before it is used in the status log.
        console.log(`[*] Starting direct metadata extraction for "${query}" across ${selectedTargets.length}/${totalTargets} selected targets.`);

        for (let index = 0; index < selectedTargets.length; index += 1) {
            const target = selectedTargets[index];
            if (masterResults.length >= maxResults) break;
            try {
                const remaining = maxResults - masterResults.length;
                const results = await this.scrapeTarget(target, query, Math.min(perSiteLimit, remaining));
                masterResults.push(...results);
            } catch (error) {
                console.error(`[-] ${target.name}: ${error.message}`);
            }
            if (index < selectedTargets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        const uniqueResults = [];
        const seenUrls = new Set();
        for (const item of masterResults) {
            if (item?.url && !seenUrls.has(item.url)) {
                seenUrls.add(item.url);
                uniqueResults.push(item);
            }
        }

        console.log(`[+] Finished: ${uniqueResults.length} unique in-memory candidates. Results were not written to disk.`);
        return uniqueResults;
    }
}

if (require.main === module) {
    const query = process.argv.slice(2).join(' ').trim() || 'anime';
    const scraper = new MasterDirectScraper();
    scraper.runPipeline(query).catch(console.error);
}

module.exports = { MasterDirectScraper };