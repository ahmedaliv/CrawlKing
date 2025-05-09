import playwright from 'playwright';
import UserAgent from 'user-agents';
/*
we can go with basic ui scraping but we would face a problem that there is no specific element to get the brand from 
we can monitior requests and get as much as we can and get the brands from the responses

and then we just do basic scraping and then we go again over the products  and put the corresponding brand to the product
based on the product name

*/
async function runJob(job, jobId, url, pincode) {
    const browser = await playwright.chromium.launch({
        headless: process.env.SPIDERS_HEADLESS_MODE === 'true'
    });

    try {
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });

        const randomUserAgent = userAgent.toString();
        const context = await browser.newContext({
            userAgent: randomUserAgent
        });
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        await page.goto(url);
        await page.waitForSelector("div a[data-testid='product-card']");
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


        // await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
        const apiResponses = [];
        const apiProducts = []
        page.on('response', async (response) => {
            // Filter for relevant API endpoints (adjust the URL pattern as needed)
            if (response.url().includes('store-products-by-store-subcategory-id')) {
                try {
                    const responseData = await response.json();
                    apiResponses.push(responseData);
                    console.log(`Captured API response from: ${response.url()}`);
                } catch (error) {
                    console.error(`Failed to parse response from ${response.url()}:`, error);
                }
            }
        });

        // Click the pin code element
        try {
            await pinCode.dispatchEvent('click');
            await page.click('button[data-testid="location-confirm-btn"]');
        } catch (error) {
            console.error('Failed to click pin code:', error);
            throw error; // Or handle it differently
        }
        await page.waitForLoadState("networkidle");
        // get the products that shows when the page first loaded

        await page.waitForSelector("div a[data-testid='product-card']");
        const rawPageProducts = await page.querySelectorAll("div a[data-testid='product-card']")
        const productMap = {}
        const titleIdMap = {}
        for (p in rawPageProducts) {
            let productLink = await p.getAttribute('href')
            if (productLink) {
                productLink = `https://www.zeptonow.com${productLink}`
            }
            const productId = productLink.split('pvid/')[1]
            const productImgElement = await p.querySelector('img:first-of-type');
            const productImgSrc = await productImgElement.getAttribute('src');
            const productTitleElement = await p.querySelector('> div:nth-child(2) >div:first-child h5');
            let productTitle = '';
            if (productTitleElement) {
                productTitle = await productTitleElement.innerText();
            }
            const productQuantityElement = await p.querySelector('> div:nth-child(2) span')
            let productQuantity = '';
            if (productQuantityElement) {
                productQuantity = await productQuantityElement.innerText();
            }
            const productMrpElement = await p.querySelector('> div:nth-child(3) > div p:')
            let productMrp = '';
            if (productMrpElement) {
                productMrp = await productMrpElement.innerText();
            }
            const productSalePriceElement = await p.querySelector('> div:nth-child(3) > div h4')
            let productSalePrice = '';
            if (productSalePriceElement) {
                productSalePrice = await productSalePriceElement.innerText();
            }
            if (!productMrpElement) {
                productMrp = productSalePrice
            }
            if (titleIdMap[productTitle]) {
                productMap[productId].variant.push({
                    articleId: productId,
                    price: productSalePrice,
                    mrp: productMrp,
                    quantity: productQuantity,
                    variantUrl: productLink
                })

            }
            titleIdMap[productTitle] = productId
            productMap[productId] = {
                title: productTitle,
                brand: '',
                variant: [
                    {
                        articleId: productId,
                        price: productSalePrice,
                        mrp: productMrp,
                        quantity: productQuantity,
                        variantUrl: productLink,
                    }
                ],
                imageUrl: productImgSrc,
                variantUrl: productLink,
                pincode: Number(pincode)
            }

        }

        const pageProducts = Array.from(Object.values(productMap));

        const brandSet = new Set()
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
                        const firstCard = document.querySelector('a[data-testid="product-card"]');
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
                    const cards = document.querySelectorAll('a[data-testid="product-card"]');
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


        console.log(`Captured ${apiResponses.length} API responses`);
        apiResponses.forEach((response, index) => {
            console.log(`Response ${index + 1}:`);
            // Example: Extract product data (adjust based on actual response structure)
            if (response.products) {
                response.products.forEach(product => {
                    console.log(`Product: ${product.name}, Brand: ${product.brand}`);
                });
            }
        });
        // allProducts.push(...Object.values(productMap));
        return [[], null];
        job.attrs.data.progress = 100;

        // job.attrs.data.total_products = allProducts.length;
        await job.save();
        // return [allProducts, filename];
        // await page.waitForSelector("section ul li[class*='PaginateItems']");
    } catch (error) {
        console.error(`Job ${jobId} failed with error: ${error.message}`);
        return [[], null];
    } finally {
        // await browser.close();
        const endTime = performance.now();
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function main(job, jobId, url, pincode) {
    return await runJob(job, jobId, url, pincode);
}
