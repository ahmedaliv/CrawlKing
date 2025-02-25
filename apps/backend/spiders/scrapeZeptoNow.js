import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: true
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
    await pinCode.dispatchEvent('click');
    await page.click('button[data-testid="location-confirm-btn"]');

    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    await page.waitForSelector("div a[data-testid='product-card']");
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
      categoryName = (await breadcrumbs[breadcrumbs.length - 1])
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
    const allProducts = [];
    const productMap = {};
    const titleIdMap = {};
    const subCats = await page.locator('a[href*="cn"][id]').all();
    for (let idx = 0; idx < subCats.length; idx++) {
      if ((await subCats[idx].textContent()) !== 'Rice & More') {
        continue;
      }
      console.log(
        `scraping subcategory ${idx + 1} named ${await subCats[
          idx
        ].textContent()}`
      );
      let requestUrl = '';
      let headers = {};
      await page.route(
        /\/v2\/store-products-by-store-subcategory-id\?.*/,
        (route) => {
          if (requestUrl === '') {
            requestUrl = route.request().url();
            console.log(requestUrl);
            // console.log(`Headers: ${JSON.stringify(route.request().headers())}`);
            headers = route.request().headers();
            route.continue();
          } else {
            route.abort();
          }
        }
      );
      await subCats[idx].click();
      if (requestUrl === '') {
        console.log('Failed to intercept the request, Scrolling Now');
        await page.evaluate(async () => {
          // const selector = 'ul:has(li[class*="PaginateItems"])';
          const selector = 'div:has( > a[data-testid="product-card"])';
          const list = document.querySelector(selector);
          // Get the initial count of elements
          let previousCount = list.querySelectorAll(
            'a[data-testid="product-card"]'
          ).length;

          while (true) {
            // Scroll to the bottom of the page
            window.scrollBy(0, list.scrollHeight);

            // Wait for new elements to load (adjust the delay as needed)
            await new Promise((resolve) => setTimeout(resolve, 10000));

            // Get the current count of elements
            const currentCount = document.querySelectorAll(selector).length;

            // If the count increases, update the previous count and continue scrolling
            if (previousCount === 0 || currentCount > previousCount) {
              console.log(
                `Element count increased: ${previousCount} -> ${currentCount}`
              );
              previousCount = currentCount;
            } else {
              // If the count doesn't change, assume no more items to load and break
              console.log('No new elements loaded. Stopping scroll.');
              break;
            }
          }
        });
      }
      async function findTotalPages(url) {
        console.log(`Finding total pages for URL: ${url}`);
        let start = 1; // First page
        let end = 1000; // Assume an initial maximum page count
        let totalPages = 0;

        while (start < end) {
          const mid = Math.floor((start + end) / 2);
          const newUrl =
            url
              .replace(/page_number=\d+/, `page_number=${mid}`)
              .replace(/page_size=\d+/, 'page_size=40') // Replace existing page_size
              .replace(/(\?|&)$/, '') + // Remove trailing ? or &
            (url.includes('?') ? '&' : '?') +
            'page_size=40'; // Append if not present
          console.log(`Checking page ${mid} - URL: ${newUrl}`);

          try {
            const res = await page.request.get(newUrl, {
              headers: headers
            });

            // Check response status
            if (res.status() === 200) {
              const data = await res.json(); // Parse the JSON response

              // Check if the page has products
              if (data.storeProducts && data.storeProducts.length > 0) {
                totalPages = mid; // Update totalPages to the current mid
                start = mid + 1; // Search in the upper half
              } else {
                end = mid - 1; // Search in the lower half
              }
            } else {
              throw new Error(
                `Failed to fetch page ${mid}, status: ${res.status()}`
              );
            }
          } catch (error) {
            console.error(`Error fetching page ${mid}:`, error.message);
            end = mid - 1; // Adjust the search range and continue
          }
        }

        console.log(`Total pages: ${totalPages}`);
        return totalPages;
      }

      const totalPages = await findTotalPages(requestUrl);
      console.log(`Total pages: ${totalPages}`);
      if (requestUrl) {
        // replace the page number to be 1
        requestUrl = requestUrl.replace(/page_number=\d+/, `page_number=${1}`);
        // add page_size to be 100
        requestUrl = requestUrl + `&page_size=100`;
        console.log(requestUrl);

        await job.save();
        const products = [];
        let totalScrapped = 0;
        for (let i = 1; i <= totalPages; i++) {
          let currentUrl = requestUrl.replace(
            /page_number=\d+/,
            `page_number=${i}`
          );
          console.log(`Requesting page ${i} with URL: ${currentUrl}`);
          const response = await fetchWithRetry(page, currentUrl, headers);
          if (response.status() !== 200) {
            console.error(`Request failed with status ${response.status()}`);
            continue;
          }
          let data;
          try {
            data = await response.json();
          } catch (error) {
            console.error('Failed to parse JSON:', error);
            continue;
          }
          const milestoneData = data['storeProducts'];
          console.log(
            `Current Data len: ${milestoneData.length} for page ${i}`
          );
          products.push(...milestoneData);
          const isFinished = data['endOfList'];
          if (isFinished) {
            console.log('Finished scraping all products');
            break;
          }
          totalScrapped = products.length;
          console.log(`Total So Far:${totalScrapped}`);
          new Promise((resolve) => setTimeout(resolve, 1000));
        }
        const sanitizeForUrl = function (str) {
          let separator =
            arguments.length > 1 && arguments[1] !== undefined
              ? arguments[1]
              : '-';
          return typeof str !== 'string'
            ? ''
            : str
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, separator)
                .replace(/^-+|-+$/g, '');
        };

        const generateProductUrl = ({ productName, productVariantId }) => {
          const sanitizedProductName = sanitizeForUrl(productName);
          const sanitizedProductVariantId = sanitizeForUrl(productVariantId);
          return `/pn/${sanitizedProductName}/pvid/${sanitizedProductVariantId}`;
        };
        // map from product-id to product data and when u see the same id again just go append an additional variant in the one you already have

        const transformedProducts = products || [];
        console.log(`Total Products: ${transformedProducts.length}`);
        for (let i = 0; i < transformedProducts.length; i++) {
          const product = transformedProducts[i];
          const productId = product.product.id; // Unique product ID
          const variantId = product.productVariant.id; // Unique variant ID
          let productName = product.product.name || '';
          let normalizedName = productName
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          const BASE_IMAGE_URL = 'https://cdn.zeptonow.com/';
          const imageUrl = product['productVariant']['images'][0]
            ? BASE_IMAGE_URL + product['productVariant']['images'][0]['path']
            : '';

          if (productMap[productId]) {
            // Check if the variant already exists
            const variantExists = productMap[productId].variant.some(
              (v) => v.articleId === variantId
            );

            if (!variantExists) {
              // Add the new variant
              productMap[productId].variant.push({
                articleId: variantId,
                quantity: `${product.productVariant.formattedPacksize}`,
                mrp: product.productVariant.mrp,
                price: product.discountedSellingPrice,
                varaintUrl: `https://www.zeptonow.com${generateProductUrl({
                  productName: product.product.name,
                  productVariantId: product.productVariant.id
                })}`
              });
            }
          } else {
            const isBundleItems = product.bundleItems.length;
            if (isBundleItems) {
              productName = product.bundleItems[0].name
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
              if (productName.includes('Tata Sampann High in Fibre Poha')) {
                console.log(`productName : ${product.product.name}`);
              }
              if (titleIdMap[productName]) {
                if (productName.includes('Tata Sampann High in Fibre Poha')) {
                  console.log(
                    `productName : ${product.product.name} titlemap has it`
                  );
                }
                const variantExists = productMap[
                  titleIdMap[productName]
                ].variant.some((v) => v.articleId === variantId);
                if (!variantExists) {
                  if (productName.includes('Tata Sampann High in Fibre Poha')) {
                    console.log(
                      `productName : ${product.product.name} inside varexist`
                    );
                  }
                  // Add the new variant
                  productMap[titleIdMap[productName]].variant.push({
                    articleId: variantId,
                    quantity: `${product.productVariant.formattedPacksize}`,
                    mrp: product.productVariant.mrp / 100,
                    price: product.discountedSellingPrice / 100,
                    variantUrl: `https://www.zeptonow.com${generateProductUrl({
                      productName: product.product.name,
                      productVariantId: product.productVariant.id
                    })}`
                  });
                }
              } else {
                if (productName.includes('Tata Sampann High in Fibre Poha')) {
                  console.log(
                    `productName : ${productName} titlemap  does not have it`
                  );
                }
                titleIdMap[productName] = productId;
                productMap[productId] = {
                  title: productName,
                  brand: product.product.brand
                    ? product.product.brand.toLowerCase() !== 'unbranded' &&
                      product.product.brand.toLowerCase() !== ''
                      ? product.product.brand
                      : ''
                    : '',
                  variant: [
                    {
                      articleId: variantId, // Use variantId, not product.id
                      quantity: `${product.productVariant.formattedPacksize}`, // Consistent format
                      mrp: product.productVariant.mrp / 100,
                      price: product.discountedSellingPrice / 100,
                      variantUrl: `https://www.zeptonow.com${generateProductUrl(
                        {
                          productName: product.product.name,
                          productVariantId: product.productVariant.id
                        }
                      )}`
                    }
                  ],
                  imageUrl: imageUrl,
                  url: `https://www.zeptonow.com${generateProductUrl({
                    productName: product.product.name,
                    productVariantId: product.productVariant.id
                  })}`,
                  pincode: Number(pincode)
                };
              }
            } else {
              // Create a new product entry
              productMap[productId] = {
                title: product.product.name,
                brand: product.product.brand
                  ? product.product.brand.toLowerCase() !== 'unbranded' &&
                    product.product.brand.toLowerCase() !== ''
                    ? product.product.brand
                    : ''
                  : '',
                variant: [
                  {
                    articleId: variantId, // Use variantId, not product.id
                    quantity: `${product.productVariant.formattedPacksize}`, // Consistent format
                    mrp: product.productVariant.mrp / 100,
                    price: product.discountedSellingPrice / 100,
                    varaintUrl: `https://www.zeptonow.com${generateProductUrl({
                      productName: product.product.name,
                      productVariantId: product.productVariant.id
                    })}`
                  }
                ],
                imageUrl: imageUrl,
                url: `https://www.zeptonow.com${generateProductUrl({
                  productName: product.product.name,
                  productVariantId: product.productVariant.id
                })}`,
                pincode: Number(pincode)
              };
              titleIdMap[normalizedName] = productId;
            }
          }
        }
        job.attrs.data.total_products = productMap.size;
        job.attrs.data.progress =
          15 + Math.ceil(((idx + 1) * 85) / subCats.length);
        await job.save();
      } else {
        console.log('failed to send the request, check the url');
      }
    }
    allProducts.push(...Object.values(productMap));
    job.attrs.data.progress = 100;
    job.attrs.data.total_products = allProducts.length;
    await job.save();
    return [allProducts, filename];
    // await page.waitForSelector("section ul li[class*='PaginateItems']");
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  page,
  url,
  headers,
  retries = 5,
  currentBackoff = 1000,
  attempt = 1
) => {
  try {
    const userAgent = new UserAgent();
    const randomUserAgent = userAgent.toString();

    const response = await page.request.get(url, {
      headers: {
        ...headers,
        'User-Agent': randomUserAgent // Use the random user agent
      }
    });

    if (response.status() !== 200) {
      console.error(`Request failed with status ${response.status()}`);
      if (response.status() === 403 || response.status() === 429) {
        throw new Error(`Retryable error: ${response.status()}`);
      } else {
        throw new Error(`Non-retryable error: ${response.status()}`);
      }
    }
    return response; // Success: reset backoff
  } catch (error) {
    console.error(
      `Failed to fetch data (Attempt ${attempt}): ${error.message}`
    );
    if (retries === 0 || !error.message.includes('Retryable error')) {
      throw new Error('Failed to fetch data');
    }
    console.log(`Retrying in ${currentBackoff}ms...`);
    await delay(currentBackoff);
    return fetchWithRetry(
      page,
      url,
      headers,
      retries - 1,
      currentBackoff * 2,
      attempt + 1
    ); // Exponential backoff
  }
};
