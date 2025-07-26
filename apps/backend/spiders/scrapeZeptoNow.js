import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
    const browser = await playwright.chromium.launch({
        headless: process.env.SPIDERS_HEADLESS_MODE === 'true', // Set to true for headless mode
        proxy: {
            server: 'http://in-pr.oxylabs.io:20000',
            username: 'customer-ahmedaliv_5as3Q',
            password: 'gngn12042001=aA'
        }
        // timeout: 10000,
    });

    const userAgent = new UserAgent({ deviceCategory: 'desktop' });

    const randomUserAgent = userAgent.toString();
    const context = await browser.newContext({
        userAgent: randomUserAgent,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
            'x-oxylabs-geo-location': 'India'
        }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    try {
        // await page.goto("https://zeptonow.com/", { waitUntil: 'networkidle' });
        await page.goto(url);

        await page.waitForSelector("div.content-start a");
        // Handle location input (Pincode)
        await page.waitForSelector('button[aria-label="Select Location"]');
        const pincodeButton = page
            .locator('button[aria-label="Select Location"]')
            .first()
            .dispatchEvent('click');
        await page.waitForSelector('input[placeholder="Search a new address"]', {
            timeout: 3 * 60000
        });
        let pincodeInput = page
            .locator('input[placeholder="Search a new address"]')
            .first();

        pincodeInput.fill(pincode);
        await page.waitForSelector('div[data-testid="address-search-item"]', {
            timeout: 3 * 60000
        });
        const pinCode = page
            .locator(`div[data-testid="address-search-item"]:has-text("${pincode}")`)
            .first();
        const breadcrumbs = await page
            .locator('div:has( > script[id="breadcrumbSchema"])  > span')
            .all();

        // Get the last breadcrumb text
        let categoryName = '';
        if (breadcrumbs.length > 2) {
            categoryName = (await breadcrumbs[breadcrumbs.length - 2].textContent())
                .trim()
                .toLowerCase();
        } else {
            categoryName = breadcrumbs[breadcrumbs.length - 1]
                .trim()
                .toLowerCase();
        }
        // Format the category name
        categoryName = categoryName
            .replace(',', ' ')
            .replace(' ', '-')
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/[&]/g, 'and') // Replace '&' with 'and'
            .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
            .toLowerCase();

        console.log(categoryName);

        const filename = `ZeptoNow-${pincode}-${categoryName}-products`;
        console.log(filename);

        job.attrs.data.progress = 5;
        await job.save();

        // await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
        // const apiProducts = []
        const brandSet = new Set();

        page.on('response', response => {
            // only care about this endpoint
            if (!response.url().includes('store-products-by-store-subcategory-id'))
                return;
            // parse JSON as soon as it arrives, but never store the whole payload
            response
                .json()
                .then(data => {
                    // ensure top‐level shape
                    if (!data || !Array.isArray(data.storeProducts)) return;

                    data.storeProducts.forEach(item => {
                        // safely dig into product.brand
                        const brand = item
                            && typeof item === 'object'
                            && item.product
                            && typeof item.product === 'object'
                            && item.product.brand;

                        // only strings with non‑whitespace chars
                        if (typeof brand === 'string') {
                            const b = brand.trim();
                            if (b.length > 0) {
                                brandSet.add(b);
                            }
                        }
                    });
                })
                .catch(err => {
                    console.error(`Failed to parse JSON from ${response.url()}:`, err);
                });
        });

        // Click the pin code element
        try {
            await pinCode.dispatchEvent('click');
            await page.click('button[data-testid="location-confirm-btn"]');
        } catch (error) {
            console.error('Failed to click pin code:', error);
            throw error; // Or handle it differently
        }
        // await page.waitForLoadState("networkidle");
        // get the products that shows when the page first loaded

        await page.waitForSelector("div.content-start a");


        console.log('Product cards loaded');
        await page.evaluate(() => {
            return new Promise(resolve => {
                let prevCount = 0;
                let startTime = Date.now();
                const TIMEOUT_MS = 6000;    // 60 seconds
                const CHECK_INTERVAL = 3000; // 10 seconds between checks

                function scrollLoop() {
                    const spinner = document.querySelector('svg.animate-spin');
                    const now = Date.now();

                    // 1) If spinner is gone, we’re done
                    if (!spinner || spinner.offsetParent === null) {
                        console.log('Spinner gone → resolve promise');
                        resolve(prevCount);
                        return;
                    }

                    // 2) If we’ve waited too long, reset to first card (or top) and restart timer
                    if (now - startTime > TIMEOUT_MS) {
                        console.log('Timeout reached → resetting to first card and retrying');
                        const firstCard = document.querySelector('div.content-start a');
                        if (firstCard) {
                            const rect = firstCard.getBoundingClientRect();
                            const scrollY = window.scrollY || window.pageYOffset;
                            window.scrollTo({ top: rect.top + scrollY, behavior: 'smooth' });
                        } else {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                        // reset counters and timer
                        prevCount = 0;
                        startTime = Date.now();
                        // give the page a moment to react, then continue
                        setTimeout(scrollLoop, 1000);
                        return;
                    }

                    // 3) Normal “scroll to last card” logic
                    const cards = document.querySelectorAll('div.content-start a');
                    const count = cards.length;
                    if (count > prevCount) {
                        prevCount = count;
                        const lastCard = cards[count - 1];
                        const rect = lastCard.getBoundingClientRect();
                        const scrollY = window.scrollY || window.pageYOffset;
                        const target = rect.top + scrollY + 200;
                        window.scrollTo({ top: target, behavior: 'smooth' });
                        console.log(`Scrolled to card #${count} +200px`);
                    }

                    // 4) Schedule next check
                    setTimeout(scrollLoop, CHECK_INTERVAL);
                }

                scrollLoop();
            });
        });

        const cards = page.locator("div.content-start a");
        const count = await cards.count();
        const productMap = {};
        const titleIdMap = {};

        page.setDefaultTimeout(10000);
        for (let idx = 0; idx < count; idx++) {
            const card = cards.nth(idx);
            try {
                // href & id
                let href = (await card.getAttribute('href')) || '';
                href = href ? `https://www.zeptonow.com${href}` : '';
                const productId = href.split('pvid/')[1] || '';
                // title → first matching h5
                const titleLocator = card.locator('div[data-slot-id="ProductName"]').first();
                const title = ((await titleLocator.textContent()) || '').trim();
                if (titleIdMap[title]) {
                    const variantExists = productMap[
                        titleIdMap[title]
                    ].variant.some((v) => v.articleId === productId);
                    if (variantExists) continue;
                }
                // image → first img
                const imgLocator = card.locator('img').first();
                const imageUrl = (await imgLocator.getAttribute('src')) || '';


                // quantity → first matching span
                const qtyLocator = card.locator('div[data-slot-id="PackSize"]').first();
                const quantity = ((await qtyLocator.textContent()) || '').trim();

                // mrp & sale → first matching p and h4
                const mrpLocator = card.locator('div[data-slot-id="Price"] p').first();
                let mrp = '';
                if (await mrpLocator.count() > 0) {
                    mrp = (await mrpLocator.textContent() || '').trim();
                }
                const saleLocator = card.locator('div[data-slot-id="Price"] p:nth-of-type(2)').first();
                const sale = ((await saleLocator.textContent()) || '').trim();
                if (!mrp) mrp = sale;

                // build variant
                const variant = { articleId: productId, price: parseCurrencyString(sale), mrp: parseCurrencyString(mrp), quantity, variantUrl: href };

                if (title && titleIdMap[title]) {
                    productMap[titleIdMap[title]].variant.push(variant);
                } else {
                    titleIdMap[title] = productId;
                    productMap[productId] = {
                        title,
                        brand: '',
                        variant: [variant],
                        imageUrl,
                        url: href,
                        pincode: Number(pincode) || null
                    };
                }
            } catch (e) {
                console.error(`Failed on card #${idx}:`, e);
                // continue to next card
            }

            // progress update every 50 cards
            if (count > 50) {
                if (idx % 50 === 0) {
                    job.attrs.data.progress = Math.round((idx / count) * 100);
                    job.attrs.data.total_products = idx;
                    await job.save();
                }
                console.log(`Parsed product #${idx} of ${count}`);
            } else {
                job.attrs.data.progress = Math.round((idx / count) * 100);
                job.attrs.data.total_products = idx;
                await job.save();
            }
        }




        const allProducts = [...Object.values(productMap)];
        const brands = Array.from(brandSet);

        // for each product, find a brand whose name is contained in its title
        allProducts.forEach(prod => {
            const title = (prod.title || '').toLowerCase();

            // find the first brand that appears in the title
            const match = brands.find(b => {
                // guard: only non‑empty strings
                if (typeof b !== 'string' || !b.trim()) return false;
                return title.includes(b.toLowerCase());
            });

            prod.brand = match || '';    // set brand or empty string if none matched
        });

        // return [[], null];
        job.attrs.data.progress = 100;

        job.attrs.data.total_products = allProducts.length;
        await job.save();
        return [allProducts, filename];
        // await page.waitForSelector("section ul li[class*='PaginateItems']");
    } catch (error) {
        console.error(`Job ${jobId} failed with error: ${error.message}`);
        await page.screenshot({ path: 'debug.png', fullPage: true });

        return [[], null];
    } finally {
        await browser.close();
        const endTime = performance.now();
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function main(job, jobId, url, pincode) {
    return await runJob(job, jobId, url, pincode);
}
function parseCurrencyString(str) {
    const cleaned = str.replace(/[^\d.,]/g, ""); // Keep digits, dots, and commas
    const normalized = cleaned.replace(/,/g, ""); // Remove commas for parsing
    return parseFloat(normalized);
}
