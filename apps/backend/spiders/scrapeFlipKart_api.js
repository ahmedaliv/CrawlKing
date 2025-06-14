
import { chromium } from 'playwright';
import UserAgent from 'user-agents';
import fetch from 'node-fetch';
import { HttpProxyAgent } from 'http-proxy-agent';
// Configuration constants
const DEFAULT_TIMEOUT = 60000; // 10 seconds
const SCROLL_TIMEOUT = 1000; // 1 second
const MAX_RETRIES = 3;
const CONCURRENT_PRODUCT_LIMIT = 20; // Number of products to process concurrently

async function runJob(job, jobId, url, pincode) {
    const browser = await chromium.launch({
        headless: process.env.SPIDERS_HEADLESS_MODE === 'true', // Set to true for headless mode
        proxy: {
            server: 'http://us-pr.oxylabs.io:10000',
            username: 'customer-ahmedaliv_5as3Q',
            password: 'gngn12042001=aA'
        }
    });
    const startTime = performance.now();
    try {
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        const randomUserAgent = userAgent.toString();
        // Create browser context with optimized settings
        const context = await browser.newContext({
            userAgent: randomUserAgent,
            viewport: { width: 1280, height: 720 },
            bypassCSP: true,
            ignoreHTTPSErrors: true
        });

        // Block unnecessary resources to improve performance
        // await context.route(
        //     /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|css)$/i,
        //     (route) => route.abort()
        // );
        // await context.route(/\/(analytics|tracking|advertisement|ad)\//i, (route) =>
        //     route.abort()
        // );

        const page = await context.newPage();
        page.setDefaultTimeout(DEFAULT_TIMEOUT);
        await page.goto(url);
        await page.waitForLoadState('domcontentloaded');

        const categoryElement = page.locator(
            '#container > div > div:nth-child(3) > div > div:nth-child(2) > div > div > div:has(h1) > div > div:last-child:has(svg)'
        );
        let catName = '';
        let filename = `flipkart-${pincode}-food-products-products`;
        try {

            if ((await categoryElement.count()) > 0) {
                catName = await categoryElement.textContent();
                catName = catName
                    .replace(',', ' ')
                    .replace(' ', '-')
                    .replace(/\s+/g, '-') // Replace spaces with hyphens
                    .replace(/[&]/g, 'and') // Replace '&' with 'and'
                    .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
                    .toLowerCase();
                filename = `flipkar-${pincode}-${catName}-products`;
            }
        } catch (e) {
            console.log(`Error getting category name: ${e.message}`);
            catName = 'unknown-category';
            filename = `flipkart-${pincode}-unknown-category-products`;
        }
        job.attrs.data.progress = 5;
        await job.save();
        // wait for the page.request
        let requestUrl = '';
        let postData = '';
        let headers = {}
        await page.route(/\/api\/\d+\/page\/fetch$/, async (route) => {

            const request = route.request();

            if (requestUrl === '') {
                requestUrl = request.url();
                postData = request.postData(); // Get POST body
                headers = request.headers(); // Get request headers
                console.log('URL:', requestUrl);
                // console.log('Headers:', headers);
                // console.log('POST Data:', postData);
                await route.continue();
            } else {
                await route.abort();
            }
        });
        // click on next page button to trigger the request
        await page.click("a:has-text('Next')")
        const parsedBody = JSON.parse(postData); // base payload
        let currentPage = 1;
        const allProducts = [];
        let retryCount = 0
        while (true) {
            try {
                // Update body and uri
                parsedBody.pageContext.pageNumber = currentPage;
                parsedBody.pageUri = parsedBody.pageUri.replace(/page=\d+/, `page=${currentPage}`);

                console.log(`Fetching page ${currentPage} with URL: ${requestUrl}`);
                // console.log('POST Body:', parsedBody);
                // console.log('Headers:', headers);
                let json = '';
                try {
                    const response = await page.request.post(requestUrl, {
                        headers,
                        data: parsedBody,
                    });
                     json = await response.json();
                } catch (e) {
                    console.error(`Error fetching page ${currentPage}:`, e.message);
                    if (retryCount < MAX_RETRIES) {
                        console.log(`Retrying page ${currentPage} (${retryCount + 1}/${MAX_RETRIES})...`);
                        retryCount++;
                        continue; // Retry the same page
                    } else {
                        console.error(`Max retries reached for page ${currentPage}. Aborting.`);
                        break; // Abort after max retries
                    }
                }
                const pageMeta = json?.RESPONSE?.pageMeta;
                if (pageMeta?.pageNotChanged === true) {
                    console.log(`Stopping on page ${currentPage} — pageNotChanged = true`);
                    break;
                }
                console.log('done checking pageNotChanged');
                const slots = json?.RESPONSE?.slots;
                if (Array.isArray(slots)) {
                    for (const slot of slots) {
                        if (
                            slot?.slotType === 'WIDGET' &&
                            slot?.widget?.type === 'PRODUCT_SUMMARY' &&
                            Array.isArray(slot?.widget?.data?.products)
                        ) {
                            console.log(`Page ${currentPage} has ${slot.widget.data.products.length} products`);
                            const processedProducts = await processProductBatch(slot.widget.data.products);
                            await page.waitForTimeout(1500)
                            processedProducts.forEach(product => {
                                product.pincode = Number(pincode);
                            });
                            allProducts.push(...processedProducts);
                        }
                    }
                }
                await page.waitForTimeout(5000)
                console.log('DONE WAITING , MOVE TO NEXT PAGE: ', currentPage)
                currentPage++;
                job.attrs.data.total_products = allProducts.length;
                job.attrs.data.progress = Math.min(5 + Math.floor((currentPage / 100) * 95), 100);
                await job.save();

            } catch (err) {
                console.error(`❌ Error on page ${currentPage}:`, err.stack || err);
                break;
            }
        }
        console.log(`Total products collected: ${allProducts.length}`);

        return [allProducts, filename];
    } catch (error) {
        console.error(`Job  with ID : ${jobId}failed with error: ${error.message}`);
        await page.screenshot({ path: 'debug.png', fullPage: true });
        // Return any products collected so far
        return [[], null];
    } finally {
        await browser.close();
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;
        console.log(`Job completed in ${duration.toFixed(2)} seconds`);
    }
}

export async function main(job, jobId, url, pincode) {
    return await runJob(job, jobId, url, pincode);
}
async function processProductBatch(products) {
    console.log('inside processProductBatch');
    const results = [];

    for (const product of products) {
        const baseInfo = extractBaseProductInfo(product); // title, brand, url, image, etc.

        let variants = [];
        console.log(`fetching variants for product with info: ${JSON.stringify(baseInfo)}`);
        try {
            variants = await fetchAndParseVariants(product);
        } catch (e) {
            console.warn(`Failed to fetch variants for ${product.productInfo?.value?.id}: ${e.message}`);
            console.error(e); // <-- This will log full error stack
        }

        if (!variants.length) {
            variants = [extractSingleVariantFromProduct(product)];
        }
        // add a 5s delay between each product to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        results.push({
            ...baseInfo,
            variant: variants,
        });
    }

    return results;
}
async function fetchAndParseVariants(product) {
    const productId = product.productInfo?.value?.id;
    const variantData = await makeVariantRequest(productId);
    return parseVariantsFromData(variantData);
}

async function makeVariantRequest(productId) {

    const proxy = {
        server: 'http://us-pr.oxylabs.io:10000',
        username: 'customer-ahmedaliv_5as3Q',
        password: 'gngn12042001=aA'
    };

    const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.server.split('://')[1]}`;
    const agent = new HttpProxyAgent(proxyUrl);
    // Build headers and body as needed
    const headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.5",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Chromium\";v=\"130\", \"Brave\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Linux\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "sec-gpc": "1",
        "x-user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 FKUA/website/42/website/Desktop",
        "Referer": "https://www.flipkart.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    const body = {
        pageUri: `/swatch/products?attributeId=quantity&pid=${productId}&selectedAttributeId=null`
    };

    const response = await fetch("http://1.rome.api.flipkart.com/api/4/page/fetch", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        agent: agent
    });



    const responseText = await response.text(); // Make sure to extract the body here

    if (response.status === 500) {
        console.log(`No variants for this product: ${productId}`);
        return null;
    }

    try {
        const json = JSON.parse(responseText);
        return json;
    } catch (err) {
        console.error("Failed to parse JSON:", err);
        return null;
    }

}


// the whole response is gonna be sent (we need to check if it is valid and if valid get the slots array from the "RESPONSE" key as the original request)
function parseVariantsFromData(data) {
    if (!data) {
        return []
    }
    const slots = data?.RESPONSE?.slots || [];
    const variants = [];
    for (const slot of slots) {
        if (slot.slotType === 'WIDGET' && slot.widget?.type === 'SWATCH_VARIANTS' && slot.widget.data?.renderableComponents) {
            for (const component of slot.widget.data.renderableComponents) {
                const value = component.value;
                if (value && value.swatchValue && value.pricing) {
                    variants.push({
                        articleId: value.id,
                        quantity: value.swatchValue.value,
                        mrp: value.pricing.mrp?.value ?? null,
                        price: value.pricing.finalPrice?.value ?? value.pricing.prices?.[0]?.value ?? null,
                        variantUrl: `https://www.flipkart.com:${component.action?.url}` ?? null,
                    });
                }
            }
        }
    }
    return variants

}
function extractSingleVariantFromProduct(product) {
    const value = product.productInfo?.value;
    const pricing = value?.pricing;

    const mrp = pricing?.mrp?.value ?? null;
    const finalPrice = pricing?.finalPrice?.value ?? pricing?.prices?.[0]?.value ?? mrp;

    return {
        articleId: value?.id,
        quantity: value?.titles?.subtitle,
        mrp,
        price: finalPrice,
        variantUrl: value?.smartUrl,
    };
}
function extractBaseProductInfo(product) {
    const value = product?.productInfo?.value ?? {};
    let imageUrl = value?.media?.images?.[0]?.url ?? null;

    if (imageUrl) {
        imageUrl = imageUrl
            .replace(/\{@width\}/g, "612")
            .replace(/\{@height\}/g, "612")
            .replace(/\{@quality\}/g, "100");
    }

    return {
        brand: value?.productBrand ?? null,
        title: value?.titles?.title ?? null,
        imageUrl,
        url: value?.smartUrl ?? null,
    };
}


